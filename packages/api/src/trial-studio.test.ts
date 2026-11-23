// packages/api/src/trial-studio.test.ts
import { providerCooldown } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq } from "drizzle-orm";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { DramaScript, LineSpan } from "./drama-script";
import type { ProviderId } from "./providers/contract";
import { trialError } from "./providers/errors";
import { emptyVoice } from "./providers/list";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	type TrialRequest,
} from "./providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "./test-db";
import {
	AUDIO_WRITE_TIMEOUT_MS,
	audioOf,
	audioPart,
	claim,
	claimRow,
	comboKey,
	complete,
	findRequest,
	findSaved,
	findStudio,
	findStudioInfo,
	findStudioMany,
	type Kind,
	type LateTarget,
	listResults,
	recordFailure,
	recordUse,
	remove,
	replayStudio,
	type Stored,
	saveLate,
	settle,
	TRIAL_CONTRACT_VERSION,
	usableVoices,
	withStorage,
} from "./trial";
import { cacheKey, cooldownOf } from "./voice-cache";

// 작업실 생성 기록(T9 스펙 3·9절). 라우터 없이 trial.ts 함수를 테스트 DB로 본다
const A = `studio-a-${Date.now()}`;
const B = `studio-b-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9, 9]);
const usage = { unit: "credit", amount: 5 } as const;
const req = (text = "안녕하세요", voiceId = "tc_0001"): TrialRequest => ({
	provider: "typecast",
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.typecast,
});

// 선점한 뒤 그 끝 상태로 둔다. 반환은 행 id
async function row(
	ownerId: string,
	kind: Kind,
	end: "done" | "failed" | "unknown" | "pending",
	audio: Uint8Array = MP3,
	request: TrialRequest = req(),
	keyKind: Kind = kind,
) {
	const claimed = await claim(db, {
		ownerId,
		requestId: crypto.randomUUID(),
		request,
		key: comboKey(request, keyKind),
		usage,
		kind,
	});
	if (claimed.kind !== "claimed") throw new Error("선점하지 못했다");
	if (end === "done")
		await complete(db, ownerId, claimed.id, audio, "audio/mpeg");
	if (end === "failed")
		await settle(db, ownerId, claimed.id, "failed", "provider_error");
	if (end === "unknown")
		await settle(db, ownerId, claimed.id, "unknown", "unknown_outcome");
	return claimed.id;
}
const keep = (
	ownerId: string,
	voiceId = "tc_0001",
	provider: ProviderId = "typecast",
) =>
	db.insert(savedVoice).values({
		ownerId,
		provider,
		voiceId,
		source: "public",
		voice: { ...emptyVoice(provider, "public"), voiceId, name: voiceId },
	});
const used = async (
	ownerId: string,
	voiceId = "tc_0001",
	provider: ProviderId = "typecast",
) => {
	const [found] = await db
		.select({
			useCount: savedVoice.useCount,
			lastUsedAt: savedVoice.lastUsedAt,
		})
		.from(savedVoice)
		.where(
			and(
				eq(savedVoice.ownerId, ownerId),
				eq(savedVoice.provider, provider),
				eq(savedVoice.voiceId, voiceId),
			),
		);
	return found;
};
const statusOf = async (id: string) =>
	(
		await db
			.select({ status: trialGeneration.status })
			.from(trialGeneration)
			.where(eq(trialGeneration.id, id))
	)[0]?.status;
const bytesOf = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
const rowOf = async (id: string) =>
	(
		await db.select().from(trialGeneration).where(eq(trialGeneration.id, id))
	)[0];
// 작업실의 늦은 결과 대상과 MP3 결과(라우터가 넘기는 모양)
const studioLate = (ownerId: string, id: string): LateTarget => ({
	ownerId,
	id,
	kind: "studio",
	provider: "typecast",
	voiceIds: ["tc_0001"],
});
const mp3 = (audio: Uint8Array = MP3): Promise<Stored> =>
	Promise.resolve({ audio, audioType: "audio/mpeg" });

// 드라마 행(T9.5): 화자 둘, 성우 둘. claimRow로 선점하고 그 끝 상태로 둔다. 키는 요청 id에서 만든다
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2]);
const script: DramaScript = {
	sceneName: "첫 만남",
	speakers: [
		{ name: "민수", voiceId: "fa_1" },
		{ name: "지아", voiceId: "fa_2" },
	],
	lines: [
		{ speaker: 0, direction: "", text: "안녕" },
		{ speaker: 1, direction: "웃으며", text: "반가워" },
	],
};
const spans: LineSpan[] = [
	{ start: 0, end: 0.5, cutStart: 0, cutEnd: 0.6 },
	{ start: 0.7, end: 1.2, cutStart: 0.6, cutEnd: 1.3 },
];
async function dramaRow(
	ownerId: string,
	end?: "done" | "unknown",
	requestId: string = crypto.randomUUID(),
) {
	const claimed = await claimRow(db, {
		ownerId,
		requestId,
		key: `drama-${requestId}`,
		usage: { unit: "usd_micro", amount: 4830 },
		provider: "fish_audio",
		fields: {
			kind: "drama",
			voiceId: "fa_1,fa_2",
			model: "s2.1-pro",
			settings: { speed: 1, temperature: 0.7 },
			text: "<|speaker:0|>안녕<|speaker:1|>[웃으며] 반가워",
			script,
		},
	});
	if (claimed.kind !== "claimed") throw new Error("선점하지 못했다");
	if (end === "done")
		await complete(db, ownerId, claimed.id, WAV, "audio/wav", spans);
	if (end === "unknown")
		await settle(db, ownerId, claimed.id, "unknown", "unknown_outcome");
	return claimed.id;
}

afterEach(() => vi.restoreAllMocks());

describe("조합 키의 화면(T9 스펙 2절)", () => {
	it("시험 생성 키는 T5 그대로이고, 같은 요청도 작업실 키는 다르다", () => {
		expect(comboKey(req())).toBe(
			cacheKey({ v: TRIAL_CONTRACT_VERSION, sig: comboSignature(req()) }),
		);
		expect(comboKey(req(), "trial")).toBe(comboKey(req()));
		expect(comboKey(req(), "studio")).not.toBe(comboKey(req()));
		expect(comboKey(req("  안녕하세요 "), "studio")).toBe(
			comboKey(req(), "studio"),
		);
	});
});

describe("withStorage 접두어", () => {
	it("withStorage는 접두어를 받아 DB 실패를 그 접두어로 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = Object.assign(new Error("secret"), {
			code: "ECONNREFUSED",
		});
		await expect(
			withStorage(
				"typecast",
				async () => {
					throw failure;
				},
				"[studio]",
			),
		).rejects.toMatchObject({
			data: { provider: "typecast", reason: "storage" },
		});
		expect(String(log.mock.calls[0]?.[0])).toMatch(/^\[studio\] 저장소 실패/);
	});
});

describe.skipIf(!url)("작업실 생성 기록", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("화면 분리: 작업실 행은 시험 생성 찾기·목록·오디오·지우기에 닿지 않고, 시험 생성 행은 작업실에 닿지 않는다", async () => {
		const studio = await row(A, "studio", "done");
		const trial = await row(A, "trial", "done");
		expect((await findSaved(db, A, comboKey(req())))?.id).toBe(trial);
		expect(
			(await listResults(db, A, "typecast", "tc_0001")).map((item) => item.id),
		).toEqual([trial]);
		await expect(audioOf(db, A, studio)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(remove(db, A, studio)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect((await findStudio(db, A, comboKey(req(), "studio")))?.id).toBe(
			studio,
		);
		expect(
			await findStudioMany(db, A, [comboKey(req(), "studio")]),
		).toMatchObject([{ id: studio, status: "done" }]);
		await expect(audioPart(db, A, trial, 0)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(remove(db, A, trial, "studio")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await remove(db, A, studio, "studio")).toBe(true);
		expect(await remove(db, A, trial)).toBe(true);
	});

	it("찾기는 같은 조합의 완료 결과(오디오 없이 길이만)이고 실패·미확인·남의 결과는 없다", async () => {
		await row(A, "studio", "failed");
		await row(A, "studio", "unknown");
		expect(await findStudio(db, A, comboKey(req(), "studio"))).toBeNull();
		const done = await row(A, "studio", "done");
		expect(await findStudio(db, A, comboKey(req(), "studio"))).toEqual({
			id: done,
			createdAt: expect.any(String),
			usage,
			bytes: MP3.byteLength,
		});
		expect(await findStudio(db, B, comboKey(req(), "studio"))).toBeNull();
	});

	it("findStudioMany: 키 순서대로 돌려주고 없는 키는 null", async () => {
		const x = await row(A, "studio", "done", MP3, req("가"));
		const y = await row(A, "studio", "done", MP3, req("나"));
		const key = (text: string) => comboKey(req(text), "studio");
		const found = await findStudioMany(db, A, [
			key("나"),
			key("없음"),
			key("가"),
		]);
		expect(found.map((hit) => hit?.id ?? null)).toEqual([y, null, x]);
		expect(found[0]).toEqual({
			id: y,
			createdAt: expect.any(String),
			usage,
			bytes: MP3.byteLength,
			status: "done",
		});
	});

	it("같은 키에 완료와 더 늦은 미확인이 있으면 완료를 돌려준다", async () => {
		const done = await row(A, "studio", "done");
		await row(A, "studio", "unknown");
		const [hit] = await findStudioMany(db, A, [comboKey(req(), "studio")]);
		expect(hit).toMatchObject({ id: done, status: "done" });
	});

	it("미확인만 있으면 status unknown", async () => {
		await row(A, "studio", "unknown");
		const latest = await row(A, "studio", "unknown");
		const [hit] = await findStudioMany(db, A, [comboKey(req(), "studio")]);
		expect(hit).toMatchObject({ id: latest, status: "unknown", bytes: 0 });
	});

	it("실패·진행 중·만료·다른 소유자·kind trial·kind drama 행은 null", async () => {
		await row(A, "studio", "failed", MP3, req("실패"));
		const old = await row(A, "studio", "done", MP3, req("만료"));
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(trialGeneration.id, old));
		await row(B, "studio", "done", MP3, req("남"));
		// 키는 조회하는 studio 키와 같고 kind만 다르다: studioRow 조건이 걸러야 한다
		await row(A, "trial", "done", MP3, req("시험"), "studio");
		await row(A, "drama", "done", MP3, req("드라마"), "studio");
		await row(A, "studio", "pending", MP3, req("진행"));
		// 진행 중 행은 소유자의 다음 선점을 막으므로 마지막에 둔다
		const keys = ["실패", "진행", "만료", "남", "시험", "드라마"].map((text) =>
			comboKey(req(text), "studio"),
		);
		expect(await findStudioMany(db, A, keys)).toEqual(keys.map(() => null));
	});

	it("bytes는 오디오 길이와 같고 만료 시각은 바뀌지 않는다", async () => {
		const id = await row(A, "studio", "done");
		const before = (await rowOf(id))?.expiresAt;
		const [hit] = await findStudioMany(db, A, [comboKey(req(), "studio")]);
		expect(hit?.bytes).toBe(MP3.byteLength);
		expect((await rowOf(id))?.expiresAt).toEqual(before);
	});

	// T18 CLI 조회. 행의 요청 id로 상태를 읽는다
	const requestOfRow = async (id: string) =>
		(await rowOf(id))?.requestId as string;
	const statusRead = async (
		ownerId: string,
		id: string,
		kind: "studio" | "trial" = "studio",
	) => findRequest(db, ownerId, await requestOfRow(id), kind);
	const set = (
		id: string,
		values: Partial<typeof trialGeneration.$inferInsert>,
	) => db.update(trialGeneration).set(values).where(eq(trialGeneration.id, id));

	it("결과 정보: 완료만 길이·형식과 함께 돌려주고 행(만료 시각 포함)은 그대로다(T18)", async () => {
		const id = await row(A, "studio", "done");
		const before = await rowOf(id);
		expect(await findStudioInfo(db, A, id)).toEqual({
			id,
			createdAt: before?.createdAt.toISOString(),
			usage,
			bytes: MP3.byteLength,
			audioType: "audio/mpeg",
		});
		expect(await statusRead(A, id)).toEqual({
			id,
			createdAt: before?.createdAt.toISOString(),
			usage,
			bytes: MP3.byteLength,
			status: "done",
			reason: null,
		});
		expect(await rowOf(id)).toEqual(before);
	});

	it("결과 정보: WAV는 audio/wav, 옛 null 형식은 audio/mpeg(T18)", async () => {
		const id = await row(A, "studio", "done");
		await set(id, { audioType: "audio/wav" });
		expect((await findStudioInfo(db, A, id)).audioType).toBe("audio/wav");
		await set(id, { audioType: null });
		expect((await findStudioInfo(db, A, id)).audioType).toBe("audio/mpeg");
	});

	it("결과 정보: 실패·미확인·진행 중·만료·남의 것·내 문장·드라마·없음은 모두 NOT_FOUND(T18)", async () => {
		const expired = await row(A, "studio", "done", MP3, req("만료"));
		await set(expired, { expiresAt: new Date(Date.now() - 1000) });
		const ids = [
			expired,
			await row(A, "studio", "failed"),
			await row(A, "studio", "unknown"),
			await row(B, "studio", "done"),
			await row(A, "trial", "done"),
			await dramaRow(A, "done"),
			crypto.randomUUID(),
			// 진행 중 행은 소유자의 다음 선점을 막으므로 마지막에 둔다
			await row(A, "studio", "pending"),
		];
		for (const id of ids)
			await expect(findStudioInfo(db, A, id)).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
	});

	// T18 작업실, T19 시험 생성: 같은 함수이고 종류만 다르다
	describe.each([
		["studio", "trial"],
		["trial", "studio"],
	] as const)("요청 상태 %s", (kind, otherKind) => {
		it("완료·실패·미확인·진행 중을 사유와 함께 읽고 행은 그대로, 모르는 사유는 null", async () => {
			const done = await row(A, kind, "done");
			const before = await rowOf(done);
			expect(await statusRead(A, done, kind)).toEqual({
				id: done,
				createdAt: before?.createdAt.toISOString(),
				usage,
				bytes: MP3.byteLength,
				status: "done",
				reason: null,
			});
			expect(await rowOf(done)).toEqual(before);
			const failed = await row(A, kind, "failed");
			expect(await statusRead(A, failed, kind)).toMatchObject({
				id: failed,
				status: "failed",
				reason: "provider_error",
				bytes: 0,
			});
			await set(failed, { failureReason: "raw provider message" });
			expect((await statusRead(A, failed, kind))?.reason).toBeNull();
			expect(
				await statusRead(A, await row(A, kind, "unknown"), kind),
			).toMatchObject({ status: "unknown", reason: "unknown_outcome" });
			expect(
				await statusRead(A, await row(A, kind, "pending"), kind),
			).toMatchObject({ status: "pending", reason: null, bytes: 0 });
		});

		it("5분 넘은 진행 중은 unknown으로 읽되 행은 진행 중 그대로다", async () => {
			const id = await row(A, kind, "pending");
			await set(id, { createdAt: new Date(Date.now() - 5 * 60_000 - 1000) });
			const before = await rowOf(id);
			expect(await statusRead(A, id, kind)).toMatchObject({
				id,
				status: "unknown",
				reason: null,
			});
			expect(await rowOf(id)).toEqual(before);
			expect(await statusOf(id)).toBe("pending");
		});

		it("만료·남의 것·다른 종류·드라마·없음은 null", async () => {
			const expired = await row(A, kind, "done", MP3, req("만료"));
			await set(expired, { expiresAt: new Date(Date.now() - 1000) });
			for (const id of [
				expired,
				await row(B, kind, "done"),
				await row(A, otherKind, "done"),
				await dramaRow(A, "done"),
			])
				expect(await statusRead(A, id, kind)).toBeNull();
			expect(await findRequest(db, A, crypto.randomUUID(), kind)).toBeNull();
		});
	});

	it("결과 정보·요청 상태는 오디오 본문을 고르지 않는다: 길이만(T18·T19)", async () => {
		const id = await row(A, "studio", "done");
		const requestId = await requestOfRow(id);
		const trialId = await requestOfRow(await row(A, "trial", "done"));
		const query = vi.spyOn(db.$client, "query");
		await findStudioInfo(db, A, id);
		await findRequest(db, A, requestId, "studio");
		await findRequest(db, A, trialId, "trial");
		const sent = query.mock.calls.map(([q]) =>
			typeof q === "string" ? q : (q as unknown as { text: string }).text,
		);
		expect(sent).toHaveLength(3);
		for (const text of sent) {
			expect(text).toMatch(/^select /);
			expect(text.replace(/octet_length\("[^)]*"\)/, "")).not.toContain(
				'"audio"',
			);
			expect(text).toContain("octet_length");
		}
	});

	it("조각: 3MiB를 넘는 오디오의 조각을 이으면 원본이고, 범위 밖·남의 것은 NOT_FOUND, 0번 조각이 보관을 30일로 늘린다", async () => {
		const big = new Uint8Array(STUDIO_PART_BYTES + 5).map((_, i) => i % 251);
		const id = await row(A, "studio", "done", big);
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() + 60_000) })
			.where(eq(trialGeneration.id, id));
		const first = await audioPart(db, A, id, 0);
		const second = await audioPart(db, A, id, 1);
		expect([first.size, second.size]).toEqual([STUDIO_PART_BYTES, 5]);
		expect(first.type).toBe("audio/mpeg");
		const joined = Buffer.from(await new Blob([first, second]).arrayBuffer());
		expect(joined.equals(Buffer.from(big))).toBe(true);
		await expect(audioPart(db, A, id, 2)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(audioPart(db, B, id, 0)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const [kept] = await db
			.select({ expiresAt: trialGeneration.expiresAt })
			.from(trialGeneration)
			.where(eq(trialGeneration.id, id));
		expect(kept?.expiresAt.getTime()).toBeGreaterThan(
			Date.now() + 29 * 24 * 60 * 60 * 1000,
		);
	});

	it("사용 이력: 그 소유자가 담은 Typecast 성우만 1씩 오르고 최근 시각이 생긴다. 담지 않았으면 아무 일 없다", async () => {
		await keep(A);
		await keep(B);
		expect(await used(A)).toEqual({ useCount: 0, lastUsedAt: null });
		await recordUse(db, A, "typecast", ["tc_0001"]);
		await recordUse(db, A, "typecast", ["tc_0001"]);
		expect(await used(A)).toMatchObject({
			useCount: 2,
			lastUsedAt: expect.any(Date),
		});
		expect(await used(B)).toEqual({ useCount: 0, lastUsedAt: null });
		await recordUse(db, A, "typecast", ["tc_none"]);
		expect(await used(A, "tc_none")).toBeUndefined();
	});

	it("늦은 성공은 미확인 행을 완료로 바꾸고 사용 이력을 1 올린다(T5-02)", async () => {
		await keep(A);
		const id = await row(A, "studio", "unknown");
		await saveLate(db, studioLate(A, id), mp3());
		expect(await statusOf(id)).toBe("done");
		expect(await bytesOf(await audioPart(db, A, id, 0))).toEqual(MP3);
		const [stored] = await db
			.select({ failureReason: trialGeneration.failureReason })
			.from(trialGeneration)
			.where(eq(trialGeneration.id, id));
		expect(stored?.failureReason).toBeNull();
		expect(await used(A)).toMatchObject({ useCount: 1 });
	});

	it("늦은 실패·너무 큰 늦은 오디오는 미확인 그대로이고 사용 이력도 그대로다. 로그는 한 줄씩", async () => {
		await keep(A);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const failed = await row(A, "studio", "unknown");
		await saveLate(
			db,
			studioLate(A, failed),
			Promise.reject(new TypeError("fetch failed")),
		);
		const large = await row(A, "studio", "unknown", MP3, req("큰 결과"));
		await saveLate(
			db,
			studioLate(A, large),
			mp3(new Uint8Array(STUDIO_AUDIO_MAX + 1)),
		);
		expect([await statusOf(failed), await statusOf(large)]).toEqual([
			"unknown",
			"unknown",
		]);
		expect(await used(A)).toMatchObject({ useCount: 0 });
		expect(log.mock.calls).toEqual([
			["[studio] 늦은 결과 실패: TypeError"],
			["[studio] 늦은 결과 버림: audio_too_large"],
		]);
	});

	it("늦은 결과는 그 소유자의 미확인 행에만 쓴다: 남의 행·완료 행·지운 행이면 바뀌지 않고 사용 이력도 그대로다", async () => {
		await keep(A);
		await keep(B);
		const unknown = await row(A, "studio", "unknown");
		await saveLate(db, studioLate(B, unknown), mp3());
		expect(await statusOf(unknown)).toBe("unknown");
		expect(await used(B)).toMatchObject({ useCount: 0 });
		const done = await row(A, "studio", "done");
		await saveLate(db, studioLate(A, done), mp3(new Uint8Array([1])));
		expect(await bytesOf(await audioPart(db, A, done, 0))).toEqual(MP3);
		await remove(db, A, unknown, "studio");
		await saveLate(db, studioLate(A, unknown), mp3());
		expect(await statusOf(unknown)).toBeUndefined();
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("늦은 결과는 작업실 행에만 쓴다: 내 문장(trial)의 미확인 행은 바뀌지 않는다(계획 리뷰 E12)", async () => {
		await keep(A);
		const trial = await row(A, "trial", "unknown");
		await saveLate(db, studioLate(A, trial), mp3());
		expect(await statusOf(trial)).toBe("unknown");
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("같은 요청 id 재생은 오디오 없이 길이만 돌려준다. 조합이 다르면 request_mismatch, 진행 중은 in_progress, 5분 넘은 진행 중은 미확인으로 옮긴다(계획 리뷰 P4·E3)", async () => {
		const request = req();
		const key = comboKey(request, "studio");
		const requestId = crypto.randomUUID();
		expect(await replayStudio(db, A, requestId, key, "typecast")).toBeNull();
		const pending = await claim(db, {
			ownerId: A,
			requestId,
			request,
			key,
			usage,
			kind: "studio",
		});
		if (pending.kind !== "claimed") throw new Error("선점하지 못했다");
		await expect(
			replayStudio(db, A, requestId, key, "typecast"),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		await db
			.update(trialGeneration)
			.set({ createdAt: new Date(Date.now() - 6 * 60_000) })
			.where(eq(trialGeneration.id, pending.id));
		await expect(
			replayStudio(db, A, requestId, key, "typecast"),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(await statusOf(pending.id)).toBe("unknown");
		const doneRequest = req("완료");
		const doneKey = comboKey(doneRequest, "studio");
		const doneId = crypto.randomUUID();
		const done = await claim(db, {
			ownerId: A,
			requestId: doneId,
			request: doneRequest,
			key: doneKey,
			usage,
			kind: "studio",
		});
		if (done.kind !== "claimed") throw new Error("선점하지 못했다");
		await complete(db, A, done.id, MP3, "audio/mpeg");
		expect(await replayStudio(db, A, doneId, doneKey, "typecast")).toEqual({
			id: done.id,
			createdAt: done.createdAt,
			usage,
			bytes: MP3.byteLength,
			segments: null,
		});
		await expect(
			replayStudio(db, A, doneId, key, "typecast"),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
		expect(await replayStudio(db, B, doneId, doneKey, "typecast")).toBeNull();
	});

	it("recordUse는 성우마다 1씩, 같은 id 두 번이어도 1. Typecast로 담은 같은 id는 그대로다", async () => {
		await keep(A, "fa_1", "fish_audio");
		await keep(A, "fa_2", "fish_audio");
		await keep(A, "fa_1");
		await recordUse(db, A, "fish_audio", ["fa_1", "fa_1", "fa_2"]);
		expect(await used(A, "fa_1", "fish_audio")).toMatchObject({
			useCount: 1,
			lastUsedAt: expect.any(Date),
		});
		expect(await used(A, "fa_2", "fish_audio")).toMatchObject({
			useCount: 1,
		});
		expect(await used(A, "fa_1")).toEqual({ useCount: 0, lastUsedAt: null });
	});

	it("usableVoices: 담은 성우면 참이고, 보낼 성우가 없으면(빈 목록) 거짓이다(fail closed)", async () => {
		await keep(A, "fa_1", "fish_audio");
		expect(await usableVoices(db, A, "fish_audio", ["fa_1"])).toBe(true);
		expect(await usableVoices(db, A, "fish_audio", [])).toBe(false);
	});

	it("recordFailure: 429 → failed·rate_limit, 대기 시각을 적고 받은 ORPCError를 그대로 돌려준다", async () => {
		const id = await row(A, "studio", "pending");
		const retryAt = new Date(Date.now() + 120_000);
		const error = trialError("typecast", "rate_limit", {
			retryAt: retryAt.toISOString(),
		});
		const failure = await recordFailure(
			db,
			{ ownerId: A, id, provider: "typecast", prefix: "[studio]" },
			error,
		);
		expect(failure).toBe(error);
		expect(await rowOf(id)).toMatchObject({
			status: "failed",
			failureReason: "rate_limit",
		});
		expect((await cooldownOf(db, "typecast", new Date()))?.getTime()).toBe(
			retryAt.getTime(),
		);
	});

	it("recordFailure: ORPCError가 아닌 예외 → unknown·unknown_outcome, 로그 한 줄", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const id = await dramaRow(A);
		const failure = await recordFailure(
			db,
			{ ownerId: A, id, provider: "fish_audio", prefix: "[drama]" },
			new TypeError("fetch failed"),
		);
		expect(failure).toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		expect(await rowOf(id)).toMatchObject({
			status: "unknown",
			failureReason: "unknown_outcome",
		});
		expect(log.mock.calls).toEqual([
			["[drama] fish_audio 생성 실패: TypeError"],
		]);
	});

	it("saveLate(drama): 미확인 드라마 행만 완료하고 audio_type·segments를 저장, 화자 성우 둘의 사용 이력이 1씩 오른다", async () => {
		await keep(A, "fa_1", "fish_audio");
		await keep(A, "fa_2", "fish_audio");
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const target = {
			ownerId: A,
			kind: "drama",
			provider: "fish_audio",
			voiceIds: ["fa_1", "fa_2"],
		} as const;
		const late = (audio: Uint8Array = WAV): Promise<Stored> =>
			Promise.resolve({ audio, audioType: "audio/wav", segments: spans });
		const studio = await row(A, "studio", "unknown");
		await saveLate(db, { ...target, id: studio }, late());
		expect(await statusOf(studio)).toBe("unknown");
		const large = await dramaRow(A, "unknown");
		await saveLate(
			db,
			{ ...target, id: large },
			late(new Uint8Array(STUDIO_AUDIO_MAX + 1)),
		);
		expect(await statusOf(large)).toBe("unknown");
		expect(await used(A, "fa_1", "fish_audio")).toMatchObject({ useCount: 0 });
		const id = await dramaRow(A, "unknown");
		await saveLate(db, { ...target, id }, late());
		expect(await rowOf(id)).toMatchObject({
			status: "done",
			failureReason: null,
			audioType: "audio/wav",
			segments: spans,
		});
		expect(await bytesOf(await audioPart(db, A, id, 0, "drama"))).toEqual(WAV);
		expect(await used(A, "fa_1", "fish_audio")).toMatchObject({ useCount: 1 });
		expect(await used(A, "fa_2", "fish_audio")).toMatchObject({ useCount: 1 });
		expect(log.mock.calls).toEqual([
			["[drama] 늦은 결과 버림: audio_too_large"],
		]);
	});

	it("saveLate(studio) 늦은 결과는 audio_type audio/mpeg이고 segments는 null이다(E12)", async () => {
		const id = await row(A, "studio", "unknown");
		await saveLate(db, studioLate(A, id), mp3());
		expect(await rowOf(id)).toMatchObject({
			status: "done",
			audioType: "audio/mpeg",
			segments: null,
		});
	});

	it("saveLate(studio)는 드라마 행을 바꾸지 않는다(kind 조건)", async () => {
		await keep(A);
		const id = await dramaRow(A, "unknown");
		await saveLate(db, studioLate(A, id), mp3());
		expect(await statusOf(id)).toBe("unknown");
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("audioPart(…, 'drama')는 드라마 행만, 기본값은 작업실 행만 읽는다", async () => {
		const drama = await dramaRow(A, "done");
		const studio = await row(A, "studio", "done");
		const wav = await audioPart(db, A, drama, 0, "drama");
		expect(wav.type).toBe("audio/wav");
		expect(await bytesOf(wav)).toEqual(WAV);
		await expect(audioPart(db, A, studio, 0, "drama")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(audioPart(db, B, drama, 0, "drama")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(audioPart(db, A, drama, 0)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await bytesOf(await audioPart(db, A, studio, 0))).toEqual(MP3);
	});

	it("오디오를 쓰는 완료 질의(complete·늦은 결과)만 시간 제한 20초로 보내고 다른 질의는 풀 기본(3초)이다(T15-a Task 0)", async () => {
		expect(AUDIO_WRITE_TIMEOUT_MS).toBe(20_000);
		const unknown = await row(A, "studio", "unknown");
		const query = vi.spyOn(db.$client, "query");
		const done = await row(A, "studio", "done");
		await saveLate(db, studioLate(A, unknown), mp3());
		const timeouts = query.mock.calls.map(
			([config]) => (config as { query_timeout?: number }).query_timeout,
		);
		// 선점(갱신·insert)·사용 이력 같은 다른 질의는 질의별 값이 없다
		expect(timeouts.filter((ms) => ms !== undefined)).toEqual([
			AUDIO_WRITE_TIMEOUT_MS,
			AUDIO_WRITE_TIMEOUT_MS,
		]);
		expect(timeouts.length).toBeGreaterThan(2);
		expect(await statusOf(done)).toBe("done");
		expect(await statusOf(unknown)).toBe("done");
		expect(await bytesOf(await audioPart(db, A, unknown, 0))).toEqual(MP3);
	});

	it("complete는 넘긴 segments를 저장하고, 넘기지 않으면 null 그대로다", async () => {
		const drama = await dramaRow(A, "done");
		const studio = await row(A, "studio", "done");
		expect((await rowOf(drama))?.segments).toEqual(spans);
		expect((await rowOf(studio))?.segments).toBeNull();
	});

	it("claimRow는 kind·script를 쓰고, 다른 기록이 진행 중이면 넘긴 공급자로 in_progress다", async () => {
		const studio = await row(A, "studio", "pending");
		await expect(dramaRow(A)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { provider: "fish_audio", reason: "in_progress" },
		});
		await settle(db, A, studio, "failed", "provider_error");
		const id = await dramaRow(A);
		expect(await rowOf(id)).toMatchObject({
			kind: "drama",
			provider: "fish_audio",
			voiceId: "fa_1,fa_2",
			model: "s2.1-pro",
			settings: { speed: 1, temperature: 0.7 },
			text: "<|speaker:0|>안녕<|speaker:1|>[웃으며] 반가워",
			script,
			segments: null,
			status: "pending",
			usageUnit: "usd_micro",
			usageAmount: 4830,
		});
	});

	it("replayStudio(…, 'fish_audio')는 드라마 행의 segments를 돌려주고 사유에 넘긴 공급자를 쓴다", async () => {
		const requestId = crypto.randomUUID();
		const id = await dramaRow(A, "done", requestId);
		expect(
			await replayStudio(db, A, requestId, `drama-${requestId}`, "fish_audio"),
		).toMatchObject({ id, bytes: WAV.byteLength, segments: spans });
		await expect(
			replayStudio(db, A, requestId, "다른 키", "fish_audio"),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { provider: "fish_audio", reason: "request_mismatch" },
		});
	});
});
