import { createRouterClient } from "@orpc/server";
import { providerCooldown } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq, sql } from "drizzle-orm";
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
import {
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
	trialError,
} from "../providers/errors";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import {
	DEFAULT_SETTINGS,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	type TrialRequest,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { claim, comboKey, complete } from "../trial";
import { appRouter } from "./index";

const OWNER = `studio-r-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 5]);
const synthesize = vi.fn(
	async (_request: TrialRequest, _options?: SynthesizeOptions) => MP3,
);
const providers: Providers = { typecast: { checkStatus: vi.fn(), synthesize } };
const as = (ownerId: string | null, ctx: Partial<Context> = {}) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers, ...ctx } as Context,
	});
const me = as(OWNER);
const request = (text = "안녕하세요", voiceId = "tc_0001") => ({
	provider: "typecast" as const,
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.typecast,
});
const create = (text?: string, requestId: string = crypto.randomUUID()) =>
	me.studioCreate({ requestId, request: request(text) });
const keep = (
	ownerId: string,
	voiceId = "tc_0001",
	over: { provider?: "typecast" | "elevenlabs"; unavailable?: boolean } = {},
) => {
	const provider = over.provider ?? "typecast";
	return db.insert(savedVoice).values({
		ownerId,
		provider,
		voiceId,
		source: "public",
		voice: {
			...emptyVoice(provider, "public"),
			voiceId,
			name: `성우 ${voiceId}`,
		},
		unavailable: over.unavailable ?? false,
	});
};
const used = async (voiceId = "tc_0001") => {
	const [found] = await db
		.select({ useCount: savedVoice.useCount })
		.from(savedVoice)
		.where(and(eq(savedVoice.ownerId, OWNER), eq(savedVoice.voiceId, voiceId)));
	return found;
};
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
const rows = () => db.select().from(trialGeneration);
let dbTouches = 0;
const failingDb = new Proxy(
	{},
	{
		get() {
			dbTouches += 1;
			throw new Error("db");
		},
	},
) as Context["db"];

// DB를 쓰지 않는 테스트는 skipIf 밖에 둬 TEST_DATABASE_URL이 없어도 늘 돈다(계획 리뷰 E4)
describe("음성 작업실 프로시저: DB 없이(스펙 5절)", () => {
	beforeEach(() => synthesize.mockClear());
	afterEach(() => vi.restoreAllMocks());

	it("DB가 실패하면 공급자를 부르지 않고 storage, 목록·찾기도 storage(스펙 5절)", async () => {
		dbTouches = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const broken = as(OWNER, { db: failingDb });
		await expect(
			broken.studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		});
		expect(dbTouches).toBeGreaterThan(0);
		expect(synthesize).not.toHaveBeenCalled();
		await expect(broken.studioList()).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		await expect(broken.studioFind(request())).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
	});

	it("Typecast 키가 없으면 DB·공급자보다 먼저 no_key(순서 고정, 수정 F1)", async () => {
		dbTouches = 0;
		await expect(
			as(OWNER, { db: failingDb, providers: {} }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider: "typecast", reason: "no_key" },
		});
		expect(dbTouches).toBe(0);
		expect(synthesize).not.toHaveBeenCalled();
	});
});

describe.skipIf(!url)("음성 작업실 프로시저(T9 스펙 3·9절)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		synthesize.mockClear();
		vi.useRealTimers();
		await keep(OWNER);
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("만들면 공급자 1회(180초 기다림), 출력은 오디오 없이 길이만, 조각 0이 같은 바이트, 이전 결과 한 줄, 같은 조합 찾기는 공급자 0회(AC1·AC5)", async () => {
		const made = await create();
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(synthesize.mock.calls[0]?.[1]).toMatchObject({
			timeoutMs: STUDIO_TIMEOUT_MS,
		});
		expect(made).toEqual({
			id: expect.any(String),
			createdAt: expect.any(String),
			usage: { unit: "credit", amount: 5 },
			bytes: MP3.byteLength,
		});
		expect(await bytes(await me.studioAudio({ id: made.id, part: 0 }))).toEqual(
			MP3,
		);
		expect(await me.studioList()).toMatchObject([
			{
				id: made.id,
				status: "done",
				bytes: MP3.byteLength,
				request: {
					provider: "typecast",
					voiceId: "tc_0001",
					text: "안녕하세요",
				},
			},
		]);
		expect((await me.studioFind(request("  안녕하세요 ")))?.id).toBe(made.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
		// 화면별 기록: 캐스팅 결과 목록에는 나오지 않는다
		expect(
			await me.trialList({ provider: "typecast", voiceId: "tc_0001" }),
		).toEqual([]);
	});

	it("같은 요청 id를 동시에 두 번 보내도 공급자 1회, 끝난 뒤 같은 id는 같은 결과(AC4)", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return MP3;
		});
		const id = crypto.randomUUID();
		const first = create(undefined, id);
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		await expect(create(undefined, id)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		release();
		const done = await first;
		expect(await create(undefined, id)).toEqual(done);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("같은 조합이라도 새 요청 id면 다시 만든다(공급자 2회, 기록 둘). 조합 재사용은 화면의 studioFind가 맡는다(디자인 리뷰 DN-6)", async () => {
		const first = await create();
		const second = await create();
		expect(second.id).not.toBe(first.id);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect((await me.studioList()).map((item) => item.id)).toEqual([
			second.id,
			first.id,
		]);
		expect((await me.studioFind(request()))?.id).toBe(second.id);
	});

	it("진행 중인 생성이 있으면(캐스팅의 내 문장 포함) in_progress, 공급자 0회(AC4)", async () => {
		const trial: TrialRequest = request("내 문장");
		await claim(db, {
			ownerId: OWNER,
			requestId: crypto.randomUUID(),
			request: trial,
			key: comboKey(trial),
			usage: { unit: "credit", amount: 4 },
		});
		await expect(create()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("담지 않은·이용 불가·다른 공급자로 담은 성우는 voice_unavailable, 공급자 0회, 기록 없음(스펙 5절)", async () => {
		await keep(OWNER, "tc_off", { unavailable: true });
		await keep(OWNER, "tc_el", { provider: "elevenlabs" });
		for (const voiceId of ["tc_none", "tc_off", "tc_el"])
			await expect(
				me.studioCreate({
					requestId: crypto.randomUUID(),
					request: request("가", voiceId),
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { provider: "typecast", reason: "voice_unavailable" },
			});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
	});

	it("빈 대본·공백만·2,001자·다른 공급자는 입력 검사에서 거절하고 공급자 0회, 기록 없음(AC3)", async () => {
		for (const text of ["", "   ", "가".repeat(STUDIO_TEXT_MAX + 1)])
			await expect(create(text)).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			me.studioCreate({
				requestId: crypto.randomUUID(),
				request: {
					...request(),
					provider: "elevenlabs",
					settings: DEFAULT_SETTINGS.elevenlabs,
				} as never,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
	});

	it("시간 초과는 미확인(같은 id를 다시 보내도 공급자 0회), 뒤늦은 성공은 같은 행을 완료로 바꾸고 사용 이력 1회(AC7)", async () => {
		let deliver: (audio: Uint8Array) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((resolve) => {
					deliver = resolve;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		const requestId = crypto.randomUUID();
		const timedOut = {
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		};
		await expect(create(undefined, requestId)).rejects.toMatchObject(timedOut);
		expect(await me.studioList()).toMatchObject([
			{ status: "unknown", bytes: 0 },
		]);
		await expect(create(undefined, requestId)).rejects.toMatchObject(timedOut);
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(await used()).toMatchObject({ useCount: 0 });
		deliver(MP3);
		await vi.waitFor(async () =>
			expect((await me.studioList())[0]?.status).toBe("done"),
		);
		const [item] = await me.studioList();
		expect(item?.bytes).toBe(MP3.byteLength);
		expect(
			await bytes(await me.studioAudio({ id: item?.id ?? "", part: 0 })),
		).toEqual(MP3);
		// 사용 이력은 완료 쓰기 뒤에 오른다. 상태가 바뀐 순간 아직 안 올랐을 수 있어 기다린다(계획 재리뷰 R3)
		await vi.waitFor(async () =>
			expect(await used()).toMatchObject({ useCount: 1 }),
		);
		expect((await me.studioFind(request()))?.id).toBe(item?.id);
	});

	it("뒤늦은 실패는 미확인 그대로이고 사용 이력도 그대로다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		let refuse: (error: unknown) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((_resolve, reject) => {
					refuse = reject;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		await expect(create()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		refuse(new TypeError("fetch failed"));
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith("[studio] 늦은 결과 실패: TypeError"),
		);
		expect(await me.studioList()).toMatchObject([{ status: "unknown" }]);
		expect(await used()).toMatchObject({ useCount: 0 });
	});

	it("3MiB를 넘는 결과도 3MiB 이하 조각으로 받아 이으면 원본이고 범위 밖 조각은 NOT_FOUND(AC6)", async () => {
		const big = new Uint8Array(STUDIO_PART_BYTES * 2 + 7).map(
			(_, i) => (i * 7) % 256,
		);
		synthesize.mockResolvedValueOnce(big);
		const made = await create();
		expect(made.bytes).toBe(big.byteLength);
		const parts = [
			await me.studioAudio({ id: made.id, part: 0 }),
			await me.studioAudio({ id: made.id, part: 1 }),
			await me.studioAudio({ id: made.id, part: 2 }),
		];
		expect(parts.map((part) => part.size)).toEqual([
			STUDIO_PART_BYTES,
			STUDIO_PART_BYTES,
			7,
		]);
		expect(
			Buffer.from(await new Blob(parts).arrayBuffer()).equals(Buffer.from(big)),
		).toBe(true);
		await expect(
			me.studioAudio({ id: made.id, part: 3 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("작업실 오디오는 압축 없이 TOAST 표에(본 행 밖) 둔다(마이그레이션 studio_audio_storage, 계획 리뷰 E10)", async () => {
		// 0으로 채운 1MiB는 압축하면 수 KB가 된다. 압축됐으면 이 테스트가 잡는다
		synthesize.mockResolvedValueOnce(new Uint8Array(1024 * 1024));
		const made = await create();
		const result = await db.execute<{ method: string | null; stored: number }>(
			sql`select pg_column_compression(audio) as method, pg_column_size(audio) as stored from trial_generation where id = ${made.id}`,
		);
		expect(result.rows[0]?.method).toBeNull();
		expect(Number(result.rows[0]?.stored)).toBeGreaterThanOrEqual(1024 * 1024);
	});

	it("성공 1회에 사용 이력 +1이고 보관함 목록에 두 칸이 보인다. 저장된 결과 찾기·내 문장 듣기·실패는 세지 않는다(AC8)", async () => {
		await keep(OWNER, "tc_0002");
		await create();
		const list = await me.savedVoiceList();
		expect(list.find((item) => item.voice.voiceId === "tc_0001")).toMatchObject(
			{ useCount: 1, lastUsedAt: expect.any(String) },
		);
		expect(list.find((item) => item.voice.voiceId === "tc_0002")).toMatchObject(
			{ useCount: 0, lastUsedAt: null },
		);
		await me.studioFind(request());
		await me.trialCreate({
			requestId: crypto.randomUUID(),
			request: request("내 문장"),
		});
		synthesize.mockRejectedValueOnce(trialError("typecast", "quota"));
		await expect(create("실패할 대본")).rejects.toMatchObject({
			data: { reason: "quota" },
		});
		expect(await used()).toMatchObject({ useCount: 1 });
	});

	it("목록은 작업실의 완료·미확인만, 지우기는 진행 중이 아닐 때만이고 지운 결과의 조각은 NOT_FOUND(스펙 9절)", async () => {
		const done = await create();
		synthesize.mockRejectedValueOnce(trialError("typecast", "unknown_outcome"));
		await expect(create("미확인")).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
		});
		synthesize.mockRejectedValueOnce(trialError("typecast", "provider_error"));
		await expect(create("실패")).rejects.toMatchObject({ code: "BAD_GATEWAY" });
		await me.trialCreate({
			requestId: crypto.randomUUID(),
			request: request("내 문장"),
		});
		expect(
			(await me.studioList()).map((item) => [item.request.text, item.status]),
		).toEqual([
			["미확인", "unknown"],
			["안녕하세요", "done"],
		]);
		const pending = request("진행 중");
		const claimed = await claim(db, {
			ownerId: OWNER,
			requestId: crypto.randomUUID(),
			request: pending,
			key: comboKey(pending, "studio"),
			usage: { unit: "credit", amount: 4 },
			kind: "studio",
		});
		expect(claimed.kind).toBe("claimed");
		if (claimed.kind !== "claimed") return;
		await expect(me.studioDelete({ id: claimed.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await me.studioDelete({ id: done.id })).toEqual({ deleted: true });
		await expect(
			me.studioAudio({ id: done.id, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("32MiB를 넘는 오디오는 audio_too_large이고 기록은 실패, 사용 이력은 그대로다", async () => {
		synthesize.mockResolvedValueOnce(new Uint8Array(STUDIO_AUDIO_MAX + 1));
		await expect(create()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "audio_too_large" },
		});
		expect((await rows()).map((row) => row.status)).toEqual(["failed"]);
		expect(await used()).toMatchObject({ useCount: 0 });
	});

	it("결과 저장에 실패하면 처리 여부 미확인으로 알리고 사용 이력은 올리지 않는다('스펙과 다른 점' 4)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let failWrites = false;
		const writeFailingDb = new Proxy(db, {
			get(target, key, receiver) {
				if (failWrites && key === "update")
					return () => {
						throw new Error("update");
					};
				return Reflect.get(target, key, receiver);
			},
		}) as Context["db"];
		synthesize.mockImplementationOnce(async () => {
			failWrites = true;
			return MP3;
		});
		await expect(
			as(OWNER, { db: writeFailingDb }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(await used()).toMatchObject({ useCount: 0 });
		expect((await rows()).map((row) => row.status)).toEqual(["pending"]);
	});

	it("대기 중이면 새 요청은 rate_limit(공급자 0회·기록 없음)이고, 같은 요청 id 재생과 성우 검사는 대기 시각보다 먼저다(순서 고정, 수정 F1)", async () => {
		await db
			.insert(providerCooldown)
			.values({ provider: "typecast", until: new Date(Date.now() + 60_000) });
		await expect(create()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: {
				provider: "typecast",
				reason: "rate_limit",
				retryAt: expect.any(String),
			},
		});
		await expect(
			me.studioCreate({
				requestId: crypto.randomUUID(),
				request: request("가", "tc_none"),
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "voice_unavailable" },
		});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
		// 대기 전에 끝난 같은 요청 id(선점·완료를 직접 쓴다)는 대기 중에도 그 결과로 재생한다
		const requestId = crypto.randomUUID();
		const usage = { unit: "credit" as const, amount: 5 };
		const claimed = await claim(db, {
			ownerId: OWNER,
			requestId,
			request: request(),
			key: comboKey(request(), "studio"),
			usage,
			kind: "studio",
		});
		if (claimed.kind !== "claimed") throw new Error("선점 실패");
		await complete(db, OWNER, claimed.id, MP3, "audio/mpeg");
		expect(await create(undefined, requestId)).toEqual({
			id: claimed.id,
			createdAt: claimed.createdAt,
			usage,
			bytes: MP3.byteLength,
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("늦은 결과는 미확인 기록을 쓴 뒤에 받는다: 미확인 쓰기가 늦어도 행은 완료, 사용 이력 1회(라우터 순서 고정, 수정 F2)", async () => {
		let deliver: (audio: Uint8Array) => void = () => {};
		let slowNext = false;
		// 실패 기록(settle)의 update 하나만 늦춘다: 실행 직전에 늦은 오디오를 먼저 보내고 실제 쓰기는 50ms 뒤.
		// saveLate를 settle 앞으로 옮기면 늦은 저장이 아직 진행 중인 행을 만나 오디오를 잃고 행은 미확인으로 남는다
		const slow = (builder: object): object =>
			new Proxy(builder, {
				get(target, key) {
					const value = Reflect.get(target, key);
					if (key === "then")
						return (ok: unknown, fail: unknown) => {
							deliver(MP3);
							setTimeout(() => value.call(target, ok, fail), 50);
						};
					return typeof value === "function"
						? (...args: unknown[]) => slow(value.apply(target, args))
						: value;
				},
			});
		const slowDb = new Proxy(db, {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				if (key !== "update" || !slowNext) return value;
				slowNext = false;
				return (...args: unknown[]) => slow(value.apply(target, args));
			},
		}) as Context["db"];
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((resolve) => {
					deliver = resolve;
				}),
			);
			slowNext = true;
			throw trialError("typecast", "unknown_outcome");
		});
		await expect(
			as(OWNER, { db: slowDb }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		await vi.waitFor(async () =>
			expect((await me.studioList())[0]).toMatchObject({
				status: "done",
				bytes: MP3.byteLength,
			}),
		);
		await vi.waitFor(async () =>
			expect(await used()).toMatchObject({ useCount: 1 }),
		);
	});
});
