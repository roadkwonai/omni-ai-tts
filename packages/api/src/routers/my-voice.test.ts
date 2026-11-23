// packages/api/src/routers/my-voice.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { providerCooldown } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { eq } from "drizzle-orm";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { Context } from "../context";
import { wavHeader } from "../drama-script";
import type { Voice } from "../providers/contract";
import { createProviders } from "../providers/index";
import { emptyVoice } from "../providers/list";
import { fetchMock, json, useFetchMock } from "../providers/test-utils";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

// 내 보이스 프로시저(T13 계획 2.3·Task 4). 공급자는 전역 fetch만 바꿔 끼운다(실제 호출 없음). 키는 secrets 패턴을 피한다
const OWNER = `myvoice-r-${Date.now()}`;
const FISH_ID = "8f2c0a1b9d3e4f5a6b7c8d9e0f1a2b3c";
const GEMINI_ID = "voice_test0001";
const providers = createProviders({
	fish_audio: "fish-test-key-0001",
	gemini: "test-gemini-key-0001",
});
const as = (ownerId: string | null, over: Partial<Context> = {}) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers, ...over } as Context,
	});
const me = as(OWNER);

const wav = (seconds: number, rate = 24_000) => {
	const bytes = Math.round(seconds * rate) * 2;
	const out = new Uint8Array(44 + bytes);
	out.set(wavHeader(bytes, rate));
	return out;
};
const file = (bytes: Uint8Array) =>
	new File([bytes.slice()], "a.wav", { type: "audio/wav" });
const fishInput = (over: Record<string, unknown> = {}) => ({
	requestId: crypto.randomUUID(),
	provider: "fish_audio" as const,
	name: "내 목소리",
	consent: true as const,
	source: file(wav(20)),
	...over,
});
const geminiInput = (over: Record<string, unknown> = {}) => ({
	requestId: crypto.randomUUID(),
	provider: "gemini" as const,
	name: "제미니 목소리",
	consent: true as const,
	source: file(wav(15)),
	consentAudio: file(wav(3)),
	...over,
});
const fishModel = (over: Record<string, unknown> = {}) => ({
	_id: FISH_ID,
	type: "tts",
	title: "내 목소리",
	state: "trained",
	visibility: "private",
	...over,
});
const calls = (method: string) =>
	fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method)
		.length;
const gate = () => {
	let release: (response: Response) => void = () => {};
	const promise = new Promise<Response>((resolve) => {
		release = resolve;
	});
	return { promise, release };
};
const ok = () => new Response(null, { status: 200 });
const savedRows = () =>
	db.select().from(savedVoice).where(eq(savedVoice.ownerId, OWNER));
const rowOf = async (id: string) =>
	(await db.select().from(myVoice).where(eq(myVoice.id, id)))[0];

async function clean() {
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(myVoice);
	await db.delete(channel);
	await db.delete(classification);
	await db.delete(providerCooldown);
}

// 만든 Fish 클론(ready)
async function readyFish() {
	fetchMock.mockResolvedValueOnce(json(201, fishModel()));
	return me.myVoiceCreate(fishInput());
}
async function readyGemini() {
	fetchMock.mockResolvedValueOnce(json(200, { id: GEMINI_ID }));
	return me.myVoiceCreate(geminiInput());
}

useFetchMock();

describe.skipIf(!url)("내 보이스 만들기 myVoiceCreate", () => {
	beforeEach(clean);
	afterAll(clean);

	it("Fish 성공: ready, 공급자 POST 1회, 보관함에 계정 출처·origin own으로 자동 담김", async () => {
		const made = await readyFish();
		expect(calls("POST")).toBe(1);
		expect(made).toMatchObject({
			provider: "fish_audio",
			name: "내 목소리",
			status: "ready",
			reason: null,
			presets: [],
			voice: { provider: "fish_audio", voiceId: FISH_ID, source: "account" },
		});
		const [saved] = await savedRows();
		expect(made.savedVoiceId).toBe(saved?.id);
		expect(saved).toMatchObject({
			provider: "fish_audio",
			voiceId: FISH_ID,
			source: "account",
		});
		expect(saved?.voice).toMatchObject({ origin: "own" });
		const row = await rowOf(made.id);
		expect(row?.consentVersion).toBe("2026-11-18");
		expect(row?.providerVoiceId).toBe(FISH_ID);
	});

	it("Gemini 성공: 동의 녹음과 함께 보내고 ready, 보관함에 담김", async () => {
		const made = await readyGemini();
		expect(calls("POST")).toBe(1);
		expect(made.status).toBe("ready");
		expect(made.voice?.voiceId).toBe(GEMINI_ID);
		expect(made.savedVoiceId).not.toBeNull();
	});

	it("Fish 학습 중이면 processing, id는 기록하고 보관함에 담지 않는다", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		expect(made).toMatchObject({
			status: "processing",
			savedVoiceId: null,
			voice: null,
		});
		expect((await rowOf(made.id))?.providerVoiceId).toBe(FISH_ID);
		expect(await savedRows()).toEqual([]);
	});

	it("품질 실패는 failed(quality)이고 id를 남긴다(지울 수 있게), 보관함 없음", async () => {
		fetchMock.mockResolvedValueOnce(
			json(
				201,
				fishModel({
					state: "created",
					quality: { audios: [{ quality_passed: false }] },
				}),
			),
		);
		const made = await me.myVoiceCreate(fishInput());
		expect(made).toMatchObject({ status: "failed", reason: "quality" });
		expect((await rowOf(made.id))?.providerVoiceId).toBe(FISH_ID);
		expect(await savedRows()).toEqual([]);
	});

	it("공급자 실패(402)는 오류를 던지고 행은 failed(quota)", async () => {
		fetchMock.mockResolvedValueOnce(json(402, {}));
		const input = fishInput();
		await expect(me.myVoiceCreate(input)).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "quota" },
		});
		const [row] = await db.select().from(myVoice);
		expect(row).toMatchObject({ status: "failed", reason: "quota" });
	});

	it("응답을 받지 못하면 unknown_outcome을 던지고 행은 unknown", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(me.myVoiceCreate(fishInput())).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		const [row] = await db.select().from(myVoice);
		expect(row?.status).toBe("unknown");
	});

	it("429는 rate_limit을 던지고 대기 시각을 적는다. 다음 새 요청은 공급자 0회", async () => {
		fetchMock.mockResolvedValueOnce(json(429, {}, { "retry-after": "30" }));
		await expect(me.myVoiceCreate(fishInput())).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit" },
		});
		expect(await db.select().from(providerCooldown)).toHaveLength(1);
		await expect(me.myVoiceCreate(fishInput())).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		expect(calls("POST")).toBe(1);
	});

	it("대기 중이면 새 요청은 rate_limit(until), 공급자 0회·행 없음", async () => {
		await db
			.insert(providerCooldown)
			.values({ provider: "fish_audio", until: new Date(Date.now() + 60_000) });
		await expect(me.myVoiceCreate(fishInput())).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await db.select().from(myVoice)).toEqual([]);
	});

	it("같은 요청 id 재전송은 공급자를 다시 부르지 않고 같은 행", async () => {
		fetchMock.mockResolvedValueOnce(json(201, fishModel()));
		const input = fishInput();
		const first = await me.myVoiceCreate(input);
		const again = await me.myVoiceCreate({
			...input,
			source: file(wav(20)),
		});
		expect(again).toEqual(first);
		expect(calls("POST")).toBe(1);
	});

	it("같은 요청 id 동시 2회: 공급자 1회, 두 번째는 sending 행", async () => {
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const input = fishInput();
		const first = me.myVoiceCreate(input);
		await expect.poll(() => calls("POST")).toBe(1);
		const second = await me.myVoiceCreate({ ...input, source: file(wav(20)) });
		expect(second.status).toBe("sending");
		held.release(json(201, fishModel()));
		expect((await first).status).toBe("ready");
		expect(calls("POST")).toBe(1);
	});

	it("다른 요청 id 동시: 진행 1건, 두 번째는 in_progress·공급자 0회", async () => {
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const first = me.myVoiceCreate(fishInput());
		await expect.poll(() => calls("POST")).toBe(1);
		await expect(me.myVoiceCreate(fishInput())).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		held.release(json(201, fishModel()));
		await first;
		expect(calls("POST")).toBe(1);
		expect(await db.select().from(myVoice)).toHaveLength(1);
	});

	it("같은 요청 id에 다른 원본은 request_mismatch, 공급자 1회", async () => {
		fetchMock.mockResolvedValueOnce(json(201, fishModel()));
		const input = fishInput();
		await me.myVoiceCreate(input);
		await expect(
			me.myVoiceCreate({ ...input, source: file(wav(21)) }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
		expect(calls("POST")).toBe(1);
	});

	it.each([
		[
			"44.1kHz",
			() => fishInput({ source: file(wav(20, 44_100)) }),
			"audio_format",
		],
		[
			"WAV 아님",
			() => fishInput({ source: file(new Uint8Array(100)) }),
			"audio_format",
		],
		["Fish 9초", () => fishInput({ source: file(wav(9)) }), "audio_length"],
		[
			"Gemini 40초",
			() => geminiInput({ source: file(wav(40)) }),
			"audio_length",
		],
		[
			"Gemini 동의 없음",
			() => geminiInput({ consentAudio: undefined }),
			"consent_audio_missing",
		],
		// 21초 이상은 1MB 계약 상한(입력 검사)에 먼저 걸린다
		[
			"Gemini 동의 0.5초",
			() => geminiInput({ consentAudio: file(wav(0.5)) }),
			"audio_length",
		],
	] as const)(
		"%s → BAD_REQUEST, 공급자 0회·행 없음",
		async (_name, input, reason) => {
			await expect(me.myVoiceCreate(input() as never)).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { reason },
			});
			expect(fetchMock).not.toHaveBeenCalled();
			expect(await db.select().from(myVoice)).toEqual([]);
		},
	);

	it("원본 3MB 초과는 입력 검사에서 BAD_REQUEST, 공급자 0회", async () => {
		await expect(
			me.myVoiceCreate(fishInput({ source: file(new Uint8Array(3_000_001)) })),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("키 없음 → no_key, 공급자 0회·행 없음", async () => {
		await expect(
			as(OWNER, { providers: createProviders({}) }).myVoiceCreate(fishInput()),
		).rejects.toMatchObject({ data: { reason: "no_key" } });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await db.select().from(myVoice)).toEqual([]);
	});

	it("5분 지난 sending은 unknown이 되어 새 만들기를 막지 않는다", async () => {
		await db.insert(myVoice).values({
			ownerId: OWNER,
			provider: "fish_audio",
			name: "옛",
			status: "sending",
			requestId: crypto.randomUUID(),
			fingerprint: "x",
			consentAt: new Date(),
			consentVersion: "2026-11-18",
			createdAt: new Date(Date.now() - 6 * 60_000),
		});
		const made = await readyFish();
		expect(made.status).toBe("ready");
		const list = await me.myVoiceList();
		expect(list.items.map((item) => item.status).sort()).toEqual([
			"ready",
			"unknown",
		]);
	});
});

describe.skipIf(!url)("내 보이스 요청 조회 myVoiceRequest(T21)", () => {
	beforeEach(clean);
	afterEach(() => {
		vi.restoreAllMocks();
	});
	afterAll(clean);

	const seed = async (over: Partial<typeof myVoice.$inferInsert> = {}) => {
		const [row] = await db
			.insert(myVoice)
			.values({
				ownerId: OWNER,
				provider: "fish_audio",
				name: "요청한 목소리",
				status: "sending",
				requestId: crypto.randomUUID(),
				fingerprint: "x",
				consentAt: new Date(),
				consentVersion: "2026-11-18",
				...over,
			})
			.returning();
		return row as typeof myVoice.$inferSelect;
	};

	it.each([
		["sending", null, null],
		["processing", FISH_ID, null],
		["ready", FISH_ID, null],
		["failed", FISH_ID, "quality"],
		["unknown", null, "unknown_outcome"],
		["deleting", FISH_ID, "rate_limit"],
	] as const)(
		"%s 행을 그대로 읽는다: 공급자 0회·쓰기 0·보관함 담기 0",
		async (status, providerVoiceId, reason) => {
			const row = await seed({ status, providerVoiceId, reason });
			const item = await me.myVoiceRequest({ requestId: row.requestId });
			expect(item).toMatchObject({
				id: row.id,
				name: "요청한 목소리",
				status,
				reason,
				savedVoiceId: null,
				presets: [],
			});
			expect(item?.voice?.voiceId ?? null).toBe(
				status === "ready" ? FISH_ID : null,
			);
			// 목록 줄과 같은 계약이다(내부 칸 없음)
			expect(item).toEqual((await me.myVoiceList()).items[0]);
			expect(await rowOf(row.id)).toEqual(row);
			expect(await savedRows()).toEqual([]);
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it("5분 넘은 sending만 unknown·unknown_outcome으로 읽고 행은 sending 그대로", async () => {
		const row = await seed();
		const read = (age: number) => {
			vi.spyOn(Date, "now").mockReturnValue(row.createdAt.getTime() + age);
			return me.myVoiceRequest({ requestId: row.requestId });
		};
		expect(await read(5 * 60_000)).toMatchObject({
			status: "sending",
			reason: null,
		});
		expect(await read(5 * 60_000 + 1)).toMatchObject({
			status: "unknown",
			reason: "unknown_outcome",
		});
		expect(await rowOf(row.id)).toEqual(row);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("오래된 processing은 미확인으로 바꾸지 않는다", async () => {
		const row = await seed({
			status: "processing",
			providerVoiceId: FISH_ID,
			createdAt: new Date(Date.now() - 60 * 60_000),
		});
		expect(await me.myVoiceRequest({ requestId: row.requestId })).toMatchObject(
			{ status: "processing", reason: null },
		);
	});

	it("보관함 행과 쓰는 프리셋 이름이 목록과 같다. 보관함에서 빼면 null이고 다시 담지 않는다", async () => {
		fetchMock.mockResolvedValueOnce(json(201, fishModel()));
		const input = fishInput();
		const made = await me.myVoiceCreate(input);
		for (const name of ["해설", "낭독"])
			await me.presetCreate({
				name,
				channelId: null,
				channelDefault: false,
				voice: made.voice as Voice,
				provider: "fish_audio",
				settings: DEFAULT_SETTINGS.fish_audio,
			});
		fetchMock.mockClear();
		const { requestId } = input;
		expect(await me.myVoiceRequest({ requestId })).toEqual({
			...made,
			presets: ["낭독", "해설"],
		});
		await me.savedVoiceRemove({ id: made.savedVoiceId as string });
		expect(await me.myVoiceRequest({ requestId })).toEqual({
			...made,
			savedVoiceId: null,
			presets: [],
		});
		expect(await savedRows()).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("만드는 중에 부르면 sending이고 만들기를 방해하지 않는다", async () => {
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const input = fishInput();
		const making = me.myVoiceCreate(input);
		await expect.poll(() => calls("POST")).toBe(1);
		const { requestId } = input;
		expect(await me.myVoiceRequest({ requestId })).toMatchObject({
			status: "sending",
		});
		held.release(json(201, fishModel()));
		const made = await making;
		expect(await me.myVoiceRequest({ requestId })).toEqual(made);
		expect(
			await me.myVoiceRequest({ requestId: crypto.randomUUID() }),
		).toBeNull();
		expect(calls("POST")).toBe(1);
	});

	it("uuid가 아니면 BAD_REQUEST, 공급자 키가 없어도 읽는다", async () => {
		await expect(me.myVoiceRequest({ requestId: "x" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		const row = await seed();
		expect(
			await as(OWNER, { providers: createProviders({}) }).myVoiceRequest({
				requestId: row.requestId,
			}),
		).toMatchObject({ id: row.id });
	});
});

describe.skipIf(!url)("내 보이스 목록·상태 확인", () => {
	beforeEach(clean);
	afterAll(clean);

	it("목록: 최근 만든 순, 프리셋 이름, ready만 voice, 공급자 키 유무", async () => {
		const fish = await readyFish();
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ _id: "a".repeat(32), state: "training" })),
		);
		const processing = await me.myVoiceCreate(fishInput());
		await me.presetCreate({
			name: "낭독",
			channelId: null,
			channelDefault: false,
			voice: fish.voice as Voice,
			provider: "fish_audio",
			settings: DEFAULT_SETTINGS.fish_audio,
		});
		const list = await me.myVoiceList();
		expect(list.providers).toEqual({ fish_audio: true, gemini: true });
		expect(list.items.map((item) => item.id)).toEqual([processing.id, fish.id]);
		expect(list.items[1]).toMatchObject({
			presets: ["낭독"],
			savedVoiceId: fish.savedVoiceId,
		});
		expect(list.items[0]?.voice).toBeNull();
		const none = await as(OWNER, {
			providers: createProviders({ gemini: "g" }),
		}).myVoiceList();
		expect(none.providers).toEqual({ fish_audio: false, gemini: true });
	});

	it("보관함에서 뺀 ready 클론도 voice가 있고 savedVoiceId는 null", async () => {
		const made = await readyFish();
		await me.savedVoiceRemove({ id: made.savedVoiceId as string });
		const [item] = (await me.myVoiceList()).items;
		expect(item).toMatchObject({
			savedVoiceId: null,
			voice: { voiceId: FISH_ID },
		});
	});

	it("processing → 확인(trained) → ready·보관함 담김, GET 1회", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		fetchMock.mockResolvedValueOnce(json(200, fishModel()));
		const checked = await me.myVoiceCheck({ id: made.id });
		expect(calls("GET")).toBe(1);
		expect(checked.status).toBe("ready");
		expect(checked.savedVoiceId).not.toBeNull();
	});

	it("공급자에 없으면(404) failed(not_found)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		fetchMock.mockResolvedValueOnce(json(404, {}));
		expect(await me.myVoiceCheck({ id: made.id })).toMatchObject({
			status: "failed",
			reason: "not_found",
		});
	});

	it("대기 중이면 확인은 rate_limit(until), 공급자 0회·행 processing 그대로", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		await db
			.insert(providerCooldown)
			.values({ provider: "fish_audio", until: new Date(Date.now() + 60_000) });
		fetchMock.mockClear();
		await expect(me.myVoiceCheck({ id: made.id })).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await rowOf(made.id)).toMatchObject({ status: "processing" });
	});

	it("확인 429는 rate_limit을 던지고 대기 시각을 적는다(다음 확인은 공급자 0회)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		fetchMock.mockResolvedValueOnce(json(429, {}, { "retry-after": "30" }));
		await expect(me.myVoiceCheck({ id: made.id })).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit" },
		});
		expect(await db.select().from(providerCooldown)).toHaveLength(1);
		expect(await rowOf(made.id)).toMatchObject({ status: "processing" });
		await expect(me.myVoiceCheck({ id: made.id })).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
		expect(calls("GET")).toBe(1);
	});

	it("processing이 아니면 공급자를 부르지 않고 그대로 돌려준다", async () => {
		const made = await readyFish();
		expect(await me.myVoiceCheck({ id: made.id })).toEqual(made);
		expect(calls("GET")).toBe(0);
	});

	it("확인과 지우기가 겹치면 지우기가 이긴다(deleting 유지, 보관함 담기 없음)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const checking = me.myVoiceCheck({ id: made.id });
		await expect.poll(() => calls("GET")).toBe(1);
		fetchMock.mockResolvedValueOnce(json(500, {}));
		await expect(me.myVoiceDelete({ id: made.id })).rejects.toMatchObject({
			code: "BAD_GATEWAY",
		});
		held.release(json(200, fishModel()));
		expect((await checking).status).toBe("deleting");
		expect(await savedRows()).toEqual([]);
	});
});

describe.skipIf(!url)("내 보이스 지우기·다시 담기", () => {
	beforeEach(clean);
	afterAll(clean);

	it("지우기 성공: DELETE 1회, 행·보관함 행 없음, 프리셋 성우 칸 null", async () => {
		const made = await readyFish();
		const preset = await me.presetCreate({
			name: "낭독",
			channelId: null,
			channelDefault: false,
			voice: made.voice as Voice,
			provider: "fish_audio",
			settings: DEFAULT_SETTINGS.fish_audio,
		});
		fetchMock.mockResolvedValueOnce(ok());
		expect(await me.myVoiceDelete({ id: made.id })).toEqual({ deleted: true });
		expect(calls("DELETE")).toBe(1);
		expect(await rowOf(made.id)).toBeUndefined();
		expect(await savedRows()).toEqual([]);
		const [kept] = await db
			.select()
			.from(voicePreset)
			.where(eq(voicePreset.id, preset.id));
		expect(kept?.savedVoiceId).toBeNull();
	});

	it("공급자 404도 지운 것으로 본다", async () => {
		const made = await readyFish();
		fetchMock.mockResolvedValueOnce(json(404, {}));
		expect(await me.myVoiceDelete({ id: made.id })).toEqual({ deleted: true });
		expect(await rowOf(made.id)).toBeUndefined();
	});

	it("실패하면 deleting·사유를 남기고 보관함 행은 이용 불가, 다시 시도하면 지워진다", async () => {
		const made = await readyFish();
		fetchMock.mockResolvedValueOnce(json(500, {}));
		await expect(me.myVoiceDelete({ id: made.id })).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
		expect(await rowOf(made.id)).toMatchObject({
			status: "deleting",
			reason: "provider_error",
		});
		expect((await savedRows())[0]?.unavailable).toBe(true);
		fetchMock.mockResolvedValueOnce(ok());
		expect(await me.myVoiceDelete({ id: made.id })).toEqual({ deleted: true });
		expect(calls("DELETE")).toBe(2);
		expect(await savedRows()).toEqual([]);
	});

	it("대기 중이면 지우기는 rate_limit(until), 공급자 0회·행 그대로", async () => {
		const made = await readyFish();
		await db
			.insert(providerCooldown)
			.values({ provider: "fish_audio", until: new Date(Date.now() + 60_000) });
		await expect(me.myVoiceDelete({ id: made.id })).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		expect(calls("DELETE")).toBe(0);
		expect(await rowOf(made.id)).toMatchObject({ status: "ready" });
		expect((await savedRows())[0]?.unavailable).toBe(false);
	});

	it("지우기 429는 rate_limit을 던지고 대기 시각을 적는다", async () => {
		const made = await readyFish();
		fetchMock.mockResolvedValueOnce(json(429, {}, { "retry-after": "30" }));
		await expect(me.myVoiceDelete({ id: made.id })).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit" },
		});
		expect(await db.select().from(providerCooldown)).toHaveLength(1);
		expect(await rowOf(made.id)).toMatchObject({
			status: "deleting",
			reason: "rate_limit",
		});
	});

	it("id가 있는 failed는 공급자에서도 지운다(DELETE 1회)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(
				201,
				fishModel({ quality: { audios: [{ quality_passed: false }] } }),
			),
		);
		const made = await me.myVoiceCreate(fishInput());
		fetchMock.mockResolvedValueOnce(ok());
		await me.myVoiceDelete({ id: made.id });
		expect(calls("DELETE")).toBe(1);
		expect(await rowOf(made.id)).toBeUndefined();
	});

	it("unknown 치우기는 공급자 0회, 행만 지운다", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(me.myVoiceCreate(fishInput())).rejects.toThrow();
		const [row] = await db.select().from(myVoice);
		fetchMock.mockClear();
		expect(await me.myVoiceDelete({ id: row?.id as string })).toEqual({
			deleted: true,
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await db.select().from(myVoice)).toEqual([]);
	});

	it("보내는 중인 행 지우기는 CONFLICT, 공급자 0회", async () => {
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const creating = me.myVoiceCreate(fishInput());
		await expect.poll(() => calls("POST")).toBe(1);
		const [row] = await db.select().from(myVoice);
		await expect(
			me.myVoiceDelete({ id: row?.id as string }),
		).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(calls("DELETE")).toBe(0);
		held.release(json(201, fishModel()));
		await creating;
	});

	it("보관함에서 뺀 클론을 다시 담는다(myVoiceSave)", async () => {
		const made = await readyFish();
		await me.savedVoiceRemove({ id: made.savedVoiceId as string });
		const again = await me.myVoiceSave({ id: made.id });
		expect(again.savedVoiceId).not.toBeNull();
		expect(await savedRows()).toHaveLength(1);
	});

	it("ready가 아니면 다시 담기는 NOT_FOUND", async () => {
		fetchMock.mockResolvedValueOnce(
			json(201, fishModel({ state: "training" })),
		);
		const made = await me.myVoiceCreate(fishInput());
		await expect(me.myVoiceSave({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await savedRows()).toEqual([]);
	});

	it("지우기와 다시 담기가 겹쳐도 보관함 행이 남지 않는다", async () => {
		const made = await readyFish();
		await me.savedVoiceRemove({ id: made.savedVoiceId as string });
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const deleting = me.myVoiceDelete({ id: made.id });
		await expect.poll(() => calls("DELETE")).toBe(1);
		await expect(me.myVoiceSave({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		held.release(ok());
		await deleting;
		expect(await savedRows()).toEqual([]);
	});

	it("Gemini 클론: 지우는 동안 담기가 들어와도 지운 뒤 보관함 행이 남지 않는다", async () => {
		const made = await readyGemini();
		const voice = made.voice as Voice;
		await me.savedVoiceRemove({ id: made.savedVoiceId as string });
		const held = gate();
		fetchMock.mockReturnValueOnce(held.promise);
		const deleting = me.myVoiceDelete({ id: made.id });
		await expect.poll(() => calls("DELETE")).toBe(1);
		// 지우는 중(deleting)인 클론은 담기가 막힌다
		await expect(
			me.savedVoiceSave({ voice, favorite: true }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		held.release(ok());
		await deleting;
		expect(await savedRows()).toEqual([]);
		// 지운 뒤에는 매핑이 없어 담기도 막힌다
		await expect(me.savedVoiceSave({ voice })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await savedRows()).toEqual([]);
	});
});

describe.skipIf(!url)("성우 보관함의 클론 규칙(T13 계획 2.3)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	const geminiAccount = (voiceId: string): Voice => ({
		...emptyVoice("gemini", "account"),
		voiceId,
		name: "맞춤",
	});

	it("Gemini 클론 행의 즐겨찾기·메모·채널·분류 저장과 프리셋 만들기가 된다", async () => {
		const made = await readyGemini();
		const voice = made.voice as Voice;
		const saved = await me.savedVoiceSave({
			voice,
			favorite: true,
			memo: "내 것",
		});
		expect(saved).toMatchObject({
			id: made.savedVoiceId,
			favorite: true,
			memo: "내 것",
		});
		const ch = await me.channelCreate({ name: "채널", memo: "", url: "" });
		const cls = await me.classificationCreate({
			kind: "category",
			name: "경제",
			memo: "",
		});
		const linked = await me.savedVoiceLinks({
			voice,
			channelIds: [ch.id],
			classificationIds: [cls.id],
		});
		expect(linked).toMatchObject({
			channelIds: [ch.id],
			classificationIds: [cls.id],
		});
		const preset = await me.presetCreate({
			name: "제미니 낭독",
			channelId: null,
			channelDefault: false,
			voice,
			provider: "gemini",
			settings: DEFAULT_SETTINGS.gemini,
		});
		expect(preset.savedVoiceId).toBe(made.savedVoiceId);
	});

	it("매핑 없는 Gemini account는 담기·연결·프리셋 모두 NOT_FOUND, 아무것도 남지 않는다", async () => {
		const voice = geminiAccount("voice_stranger01");
		await expect(me.savedVoiceSave({ voice })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			me.savedVoiceLinks({ voice, channelIds: [], classificationIds: [] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			me.presetCreate({
				name: "x",
				channelId: null,
				channelDefault: false,
				voice,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await savedRows()).toEqual([]);
		expect(await db.select().from(voicePreset)).toEqual([]);
	});

	it("내 클론을 public으로 다시 담아도 출처는 account로 남는다(갱신·새로 담기 모두)", async () => {
		const made = await readyGemini();
		const asPublic = { ...(made.voice as Voice), source: "public" as const };
		const accountOnly = async () => {
			expect(await savedRows()).toMatchObject([
				{ source: "account", voice: { source: "account" } },
			]);
		};
		expect((await me.savedVoiceSave({ voice: asPublic })).voice.source).toBe(
			"account",
		);
		await accountOnly();
		await me.savedVoiceRemove({ id: made.savedVoiceId as string });
		await me.savedVoiceSave({ voice: asPublic });
		await accountOnly();
	});

	it("Typecast·Airy account는 계약에서 그대로 거절된다", async () => {
		for (const provider of ["typecast", "airy"] as const)
			await expect(
				me.savedVoiceSave({
					voice: {
						...emptyVoice(provider, "account"),
						voiceId: "v_1",
						name: "x",
					},
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("회귀: 매핑 없는 Fish·ElevenLabs account와 Gemini public은 담기·프리셋이 된다", async () => {
		const voices: Voice[] = [
			{
				...emptyVoice("fish_audio", "account"),
				voiceId: "b".repeat(32),
				name: "앱 밖 Fish",
			},
			{
				...emptyVoice("elevenlabs", "account"),
				voiceId: "el_outside01",
				name: "앱 밖 EL",
			},
			{ ...emptyVoice("gemini", "public"), voiceId: "Kore", name: "Kore" },
		];
		for (const voice of voices) await me.savedVoiceSave({ voice });
		expect(await savedRows()).toHaveLength(3);
		for (const voice of voices)
			await me.presetCreate({
				name: `프리셋 ${voice.voiceId}`,
				channelId: null,
				channelDefault: false,
				voice,
				provider: voice.provider,
				settings: DEFAULT_SETTINGS[voice.provider],
			} as never);
		expect(await db.select().from(voicePreset)).toHaveLength(3);
	});

	it("savedVoiceCheck는 클론 행을 건드리지 않는다(공급자 0회, 이용 가능 그대로)", async () => {
		const fish = await readyFish();
		const gemini = await readyGemini();
		await db.update(savedVoice).set({ checkedAt: null });
		fetchMock.mockClear();
		await me.savedVoiceCheck();
		expect(fetchMock).not.toHaveBeenCalled();
		for (const id of [fish.savedVoiceId, gemini.savedVoiceId]) {
			const [row] = await db
				.select()
				.from(savedVoice)
				.where(eq(savedVoice.id, id as string));
			expect(row).toMatchObject({ unavailable: false, checkedAt: null });
		}
	});
});
