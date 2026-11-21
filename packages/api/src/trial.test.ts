import { ORPCError } from "@orpc/server";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
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
import { DEFAULT_SETTINGS, type TrialRequest } from "./providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "./test-db";
import {
	audioOf,
	claim,
	claimRow,
	comboKey,
	complete,
	findSaved,
	listResults,
	remove,
	replay,
	replayStudio,
	settle,
	sweep,
	withStorage,
} from "./trial";

import { guard } from "./voice-cache";

const A = `trial-a-${Date.now()}`;
const B = `trial-b-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 7, 7]);
const request = (text = "안녕하세요", voiceId = "el0001"): TrialRequest => ({
	provider: "elevenlabs",
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.elevenlabs,
});
const usage = { unit: "credit", amount: 5 } as const;
const id = () => crypto.randomUUID();
const claimFor = (ownerId: string, req = request(), requestId: string = id()) =>
	claim(db, { ownerId, requestId, request: req, key: comboKey(req), usage });
const DAY = 24 * 60 * 60 * 1000;

afterEach(() => vi.restoreAllMocks());

describe("comboKey (Review Focus 1)", () => {
	it("같은 소리의 요청은 같은 조합 키다", () => {
		// 유니언을 펼치지 않고 공급자를 적는다(계획 리뷰 E6: 펼치면 TrialRequest 타입 오류)
		const reordered: TrialRequest = {
			provider: "elevenlabs",
			voiceId: "el0001",
			text: "  안녕하세요 ",
			settings: {
				...DEFAULT_SETTINGS.elevenlabs,
				style: 0.9,
				stability: 0.1 + 0.4,
			},
		};
		expect(comboKey(reordered)).toBe(comboKey(request()));
		expect(comboKey(request("안녕"))).not.toBe(comboKey(request()));
	});
});

describe("저장소 오류", () => {
	it("DB 오류는 안전 로그·storage이고 의도한 거절은 그대로, 생성 뒤 기록 실패는 삼킨다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const failure = new Error("select secret user text postgresql://password");
		Object.assign(failure, { code: "outer", cause: { code: "ECONNREFUSED" } });
		const rejected = await withStorage("elevenlabs", async () => {
			throw failure;
		}).catch((error: unknown) => error);
		expect(rejected).toBeInstanceOf(ORPCError);
		expect(rejected).toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { provider: "elevenlabs", reason: "storage" },
		});
		expect(rejected).not.toHaveProperty("cause");
		expect(log.mock.calls).toEqual([
			["[trial] 저장소 실패: Error ECONNREFUSED"],
		]);
		const intentional = new ORPCError("NOT_FOUND");
		await expect(
			withStorage(undefined, async () => {
				throw intentional;
			}),
		).rejects.toBe(intentional);
		expect(log).toHaveBeenCalledTimes(1);
		expect(await withStorage(undefined, async () => 42)).toBe(42);
		expect(
			await guard(
				"쓰기",
				async () => {
					throw failure;
				},
				"[trial]",
			),
		).toBeUndefined();
		expect(log.mock.calls[1]).toEqual([
			"[trial] 쓰기 실패: Error ECONNREFUSED",
		]);
	});
});

describe.skipIf(!url)("생성 기록", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.$client.end();
	});

	it("충돌 조회는 내 문장 오디오를 보존하고 작업실·드라마 오디오는 읽지 않는다", async () => {
		const queries = vi.spyOn(db.$client, "query");
		for (const kind of ["trial", "studio", "drama"] as const) {
			const requestId = id();
			const key = comboKey(request(), kind);
			const input = {
				ownerId: A,
				requestId,
				key,
				usage,
				provider: "elevenlabs" as const,
				fields: {
					kind,
					voiceId: "el0001",
					model: "test",
					settings: {},
					text: "안녕하세요",
				},
			};
			const first = await claimRow(db, input);
			expect(first.kind).toBe("claimed");
			if (first.kind !== "claimed") throw new Error("claim failed");
			await complete(db, A, first.id, MP3, "audio/mpeg");
			queries.mockClear();
			const again = await claimRow(db, input);
			const selects = queries.mock.calls
				.map(([query]) =>
					typeof query === "string" ? query : Reflect.get(query, "text"),
				)
				.filter((query) => /^select /i.test(query));
			expect(selects).toHaveLength(1);
			expect(selects[0]).toMatch(kind === "trial" ? /"audio"/ : /\bnull\b/i);
			if (kind !== "trial") expect(selects[0]).not.toMatch(/"audio"/);
			expect(again.kind).toBe("existing");
			if (again.kind !== "existing") throw new Error("collision missing");
			if (kind === "trial") {
				expect(
					new Uint8Array(
						await replay("elevenlabs", again.row).audio.arrayBuffer(),
					),
				).toEqual(MP3);
			} else {
				expect(again.row.audio).toBeNull();
				expect(
					await replayStudio(db, A, requestId, key, "elevenlabs"),
				).toMatchObject({ id: first.id });
			}
			await expect(
				claimRow(db, { ...input, key: "different" }),
			).rejects.toMatchObject({ data: { reason: "request_mismatch" } });
			expect((await claimRow(db, { ...input, ownerId: B })).kind).toBe(
				"claimed",
			);
			await db.delete(trialGeneration).where(eq(trialGeneration.ownerId, B));
		}
	});

	it("선점하고 완료하면 찾기가 오디오를 돌려주고 만료를 30일 뒤로 늘린다", async () => {
		const claimed = await claimFor(A);
		expect(claimed.kind).toBe("claimed");
		if (claimed.kind !== "claimed") return;
		await complete(db, A, claimed.id, MP3, "audio/mpeg");
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() + DAY) })
			.where(eq(trialGeneration.id, claimed.id));
		const saved = await findSaved(db, A, comboKey(request()));
		expect(saved?.id).toBe(claimed.id);
		expect(saved?.audio.type).toBe("audio/mpeg");
		expect(
			new Uint8Array(await (saved?.audio.arrayBuffer() ?? new ArrayBuffer(0))),
		).toEqual(MP3);
		const [row] = await db.select().from(trialGeneration);
		expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
	});

	it("같은 요청 id·같은 조합은 기존 행, 다른 조합은 request_mismatch", async () => {
		const requestId = id();
		const concurrent = await Promise.all([
			claimFor(A, request(), requestId),
			claimFor(A, request(), requestId),
		]);
		expect(concurrent.map((item) => item.kind).sort()).toEqual([
			"claimed",
			"existing",
		]);
		const first = concurrent.find((item) => item.kind === "claimed");
		expect(first?.kind).toBe("claimed");
		const again = await claimFor(A, request(), requestId);
		expect(again).toMatchObject({
			kind: "existing",
			row: { status: "pending" },
		});
		if (again.kind !== "existing") return;
		await expect(async () =>
			replay("elevenlabs", again.row),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		expect((await claimFor(B, request(), requestId)).kind).toBe("claimed");
		await expect(
			claimFor(A, request("다른 문장"), requestId),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
	});

	it("만드는 중이 있으면 다른 요청 id는 in_progress, 5분 넘은 진행 중은 unknown이 되어 막지 않는다", async () => {
		const first = await claimFor(A);
		expect(first.kind).toBe("claimed");
		if (first.kind !== "claimed") return;
		await expect(remove(db, A, first.id)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(claimFor(A, request("둘째"))).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		await db
			.update(trialGeneration)
			.set({ createdAt: new Date(Date.now() - 6 * 60 * 1000) })
			.where(eq(trialGeneration.id, first.id));
		expect((await claimFor(A, request("셋째"))).kind).toBe("claimed");
		const [old] = await db
			.select()
			.from(trialGeneration)
			.where(eq(trialGeneration.id, first.id));
		expect(old?.status).toBe("unknown");
	});

	it("실패·미확인은 찾기에 나오지 않고 만료 행은 정리된다(진행 중은 남는다)", async () => {
		const failed = await claimFor(A);
		expect(failed.kind).toBe("claimed");
		if (failed.kind !== "claimed") return;
		await settle(db, B, failed.id, "failed", "quota");
		const [stillPending] = await db
			.select()
			.from(trialGeneration)
			.where(eq(trialGeneration.id, failed.id));
		expect(stillPending?.status).toBe("pending");
		await settle(db, A, failed.id, "failed", "quota");
		expect(await findSaved(db, A, comboKey(request()))).toBeNull();
		const failedReplay = await claimFor(A, request(), stillPending?.requestId);
		expect(failedReplay.kind).toBe("existing");
		if (failedReplay.kind !== "existing") return;
		await expect(async () =>
			replay("elevenlabs", failedReplay.row),
		).rejects.toMatchObject({
			data: { reason: "quota" },
		});
		const unknown = await claimFor(A, request("미확인"));
		expect(unknown.kind).toBe("claimed");
		if (unknown.kind !== "claimed") return;
		await settle(db, A, unknown.id, "unknown", "unknown_outcome");
		expect(await findSaved(db, A, comboKey(request("미확인")))).toBeNull();
		const done = await claimFor(A, request("만료"));
		expect(done.kind).toBe("claimed");
		if (done.kind !== "claimed") return;
		await complete(db, A, done.id, MP3, "audio/mpeg");
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(trialGeneration.id, done.id));
		expect(await findSaved(db, A, comboKey(request("만료")))).toBeNull();
		await claimFor(A, request("진행 중"));
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() - 1000) });
		const otherOwner = await claimFor(B);
		expect(otherOwner.kind).toBe("claimed");
		if (otherOwner.kind !== "claimed") return;
		await complete(db, B, otherOwner.id, MP3, "audio/mpeg");
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(trialGeneration.id, otherOwner.id));
		await sweep(db, A);
		expect(
			await db
				.select()
				.from(trialGeneration)
				.where(eq(trialGeneration.id, otherOwner.id)),
		).toHaveLength(1);
		const left = await db
			.select()
			.from(trialGeneration)
			.where(eq(trialGeneration.ownerId, A));
		expect(left.map((row) => row.status)).toEqual(["pending"]);
	});

	it("목록은 그 성우의 완료 결과만 최신순 20개, 요청을 담는다", async () => {
		for (let i = 0; i < 21; i += 1) {
			const c = await claimFor(A, request(`문장 ${i}`));
			expect(c.kind).toBe("claimed");
			if (c.kind === "claimed") await complete(db, A, c.id, MP3, "audio/mpeg");
		}
		const other = await claimFor(A, request("다른 성우", "el0002"));
		expect(other.kind).toBe("claimed");
		if (other.kind === "claimed")
			await complete(db, A, other.id, MP3, "audio/mpeg");
		const b = await claimFor(B);
		expect(b.kind).toBe("claimed");
		if (b.kind !== "claimed") return;
		await complete(db, B, b.id, MP3, "audio/mpeg");
		expect(await listResults(db, B, "elevenlabs", "el0001")).toHaveLength(1);
		expect(await listResults(db, A, "fish_audio", "el0001")).toEqual([]);
		const pending = await claimFor(A, request("진행 중"));
		expect(pending.kind).toBe("claimed");
		const items = await listResults(db, A, "elevenlabs", "el0001");
		expect(items).toHaveLength(20);
		expect(items[0]?.request).toMatchObject({
			voiceId: "el0001",
			text: "문장 20",
		});
	});

	it("다른 소유자의 결과는 오디오·지우기 모두 NOT_FOUND이고 행은 그대로다", async () => {
		const c = await claimFor(A);
		expect(c.kind).toBe("claimed");
		if (c.kind !== "claimed") return;
		await complete(db, A, c.id, MP3, "audio/mpeg");
		// 다른 소유자의 완료 쓰기는 행을 바꾸지 않는다(계획 리뷰 E12)
		await complete(db, B, c.id, new Uint8Array([1]), "audio/mpeg");
		await expect(audioOf(db, B, c.id)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(remove(db, B, c.id)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await findSaved(db, B, comboKey(request()))).toBeNull();
		expect(await listResults(db, B, "elevenlabs", "el0001")).toEqual([]);
		const mine = await audioOf(db, A, c.id);
		expect(mine.id).toBe(c.id);
		expect(new Uint8Array(await mine.audio.arrayBuffer())).toEqual(MP3);
		const [row] = await db
			.select()
			.from(trialGeneration)
			.where(eq(trialGeneration.id, c.id));
		expect(row).toBeDefined();
		if (!row) return;
		expect(replay("elevenlabs", row).usage).toEqual(usage);
		await remove(db, A, c.id);
		await expect(audioOf(db, A, c.id)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});
