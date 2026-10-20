// packages/api/src/trial-studio.test.ts
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
	audioOf,
	audioPart,
	claim,
	comboKey,
	complete,
	findSaved,
	findStudio,
	type Kind,
	listResults,
	listStudio,
	recordUse,
	remove,
	replayStudio,
	saveLate,
	settle,
	TRIAL_CONTRACT_VERSION,
} from "./trial";
import { cacheKey } from "./voice-cache";

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
) {
	const claimed = await claim(db, {
		ownerId,
		requestId: crypto.randomUUID(),
		request,
		key: comboKey(request, kind),
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
const keep = (ownerId: string, voiceId = "tc_0001") =>
	db.insert(savedVoice).values({
		ownerId,
		provider: "typecast",
		voiceId,
		source: "public",
		voice: { ...emptyVoice("typecast", "public"), voiceId, name: voiceId },
	});
const used = async (ownerId: string, voiceId = "tc_0001") => {
	const [found] = await db
		.select({
			useCount: savedVoice.useCount,
			lastUsedAt: savedVoice.lastUsedAt,
		})
		.from(savedVoice)
		.where(
			and(eq(savedVoice.ownerId, ownerId), eq(savedVoice.voiceId, voiceId)),
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

describe.skipIf(!url)("작업실 생성 기록", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
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
		expect((await listStudio(db, A)).map((item) => item.id)).toEqual([studio]);
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

	it("목록은 완료·미확인 최근 20개(최신순)이고 실패·진행 중·시험 생성·남의 결과는 없다. 미확인은 길이 0", async () => {
		for (let i = 0; i < 21; i += 1)
			await row(A, "studio", "done", MP3, req(`대본 ${i}`));
		const unknown = await row(A, "studio", "unknown", MP3, req("미확인"));
		await row(A, "studio", "failed", MP3, req("실패"));
		await row(A, "trial", "done", MP3, req("내 문장"));
		await row(B, "studio", "done");
		await row(A, "studio", "pending", MP3, req("진행 중"));
		const items = await listStudio(db, A);
		expect(items).toHaveLength(20);
		expect(items[0]).toMatchObject({
			id: unknown,
			status: "unknown",
			bytes: 0,
			request: { provider: "typecast", voiceId: "tc_0001", text: "미확인" },
		});
		expect(items[1]).toMatchObject({
			status: "done",
			bytes: MP3.byteLength,
			request: { text: "대본 20" },
		});
		expect(
			items.every(
				(item) => item.status === "done" || item.status === "unknown",
			),
		).toBe(true);
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
		await recordUse(db, A, "tc_0001");
		await recordUse(db, A, "tc_0001");
		expect(await used(A)).toMatchObject({
			useCount: 2,
			lastUsedAt: expect.any(Date),
		});
		expect(await used(B)).toEqual({ useCount: 0, lastUsedAt: null });
		await recordUse(db, A, "tc_none");
		expect(await used(A, "tc_none")).toBeUndefined();
	});

	it("늦은 성공은 미확인 행을 완료로 바꾸고 사용 이력을 1 올린다(T5-02)", async () => {
		await keep(A);
		const id = await row(A, "studio", "unknown");
		await saveLate(db, A, id, "tc_0001", Promise.resolve(MP3));
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
			A,
			failed,
			"tc_0001",
			Promise.reject(new TypeError("fetch failed")),
		);
		const large = await row(A, "studio", "unknown", MP3, req("큰 결과"));
		await saveLate(
			db,
			A,
			large,
			"tc_0001",
			Promise.resolve(new Uint8Array(STUDIO_AUDIO_MAX + 1)),
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
		await saveLate(db, B, unknown, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(unknown)).toBe("unknown");
		expect(await used(B)).toMatchObject({ useCount: 0 });
		const done = await row(A, "studio", "done");
		await saveLate(
			db,
			A,
			done,
			"tc_0001",
			Promise.resolve(new Uint8Array([1])),
		);
		expect(await bytesOf(await audioPart(db, A, done, 0))).toEqual(MP3);
		await remove(db, A, unknown, "studio");
		await saveLate(db, A, unknown, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(unknown)).toBeUndefined();
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("늦은 결과는 작업실 행에만 쓴다: 내 문장(trial)의 미확인 행은 바뀌지 않는다(계획 리뷰 E12)", async () => {
		await keep(A);
		const trial = await row(A, "trial", "unknown");
		await saveLate(db, A, trial, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(trial)).toBe("unknown");
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("같은 요청 id 재생은 오디오 없이 길이만 돌려준다. 조합이 다르면 request_mismatch, 진행 중은 in_progress, 5분 넘은 진행 중은 미확인으로 옮긴다(계획 리뷰 P4·E3)", async () => {
		const request = req();
		const key = comboKey(request, "studio");
		const requestId = crypto.randomUUID();
		expect(await replayStudio(db, A, requestId, key)).toBeNull();
		const pending = await claim(db, {
			ownerId: A,
			requestId,
			request,
			key,
			usage,
			kind: "studio",
		});
		if (pending.kind !== "claimed") throw new Error("선점하지 못했다");
		await expect(replayStudio(db, A, requestId, key)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		await db
			.update(trialGeneration)
			.set({ createdAt: new Date(Date.now() - 6 * 60_000) })
			.where(eq(trialGeneration.id, pending.id));
		await expect(replayStudio(db, A, requestId, key)).rejects.toMatchObject({
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
		expect(await replayStudio(db, A, doneId, doneKey)).toEqual({
			id: done.id,
			createdAt: done.createdAt,
			usage,
			bytes: MP3.byteLength,
		});
		await expect(replayStudio(db, A, doneId, key)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
		expect(await replayStudio(db, B, doneId, doneKey)).toBeNull();
	});
});
