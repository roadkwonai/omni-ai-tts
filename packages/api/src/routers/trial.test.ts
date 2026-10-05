import { createRouterClient } from "@orpc/server";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
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

import type { Context } from "../context";
import { providerError, trialError } from "../providers/errors";
import type { Providers } from "../providers/index";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	type TrialRequest,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { claim, comboKey } from "../trial";
import { appRouter } from "./index";

const OWNER = `trial-r-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 3]);
const synthesize = vi.fn(async (_request: TrialRequest) => MP3);
const listModels = vi.fn(async () => [
	{ model: "eleven_v4" as const, multiplier: 0.5 },
]);
const providers: Providers = {
	typecast: { checkStatus: vi.fn(), synthesize },
	elevenlabs: { checkStatus: vi.fn(), synthesize, listModels },
	fish_audio: { checkStatus: vi.fn(), synthesize },
};
const as = (ownerId: string | null, ctx: Partial<Context> = {}) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers, ...ctx } as Context,
	});
const request = (text = "안녕하세요"): TrialRequest => ({
	provider: "elevenlabs",
	voiceId: "el0001",
	text,
	settings: DEFAULT_SETTINGS.elevenlabs,
});
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
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
// 진짜 DB를 감싸 쓰기(insert)만 던진다: 대기 표 읽기는 지나고 선점에서 실패한다(계획 리뷰 E5)
const insertFailingDb = new Proxy(db, {
	get(target, key, receiver) {
		if (key === "insert") {
			return () => {
				throw new Error("insert");
			};
		}
		return Reflect.get(target, key, receiver);
	},
}) as Context["db"];

describe.skipIf(!url)("시험 생성 프로시저", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(providerCooldown);
		await db.delete(providerListCache);
		synthesize.mockClear();
		listModels.mockClear();
		vi.useRealTimers();
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(providerCooldown);
		await db.delete(providerListCache);
		await db.$client.end();
	});

	it("만들면 공급자 1회·배율 반영 사용량·오디오, 같은 조합 찾기는 공급자 0회로 저장본(AC7)", async () => {
		const made = await as(OWNER).trialCreate({
			requestId: crypto.randomUUID(),
			request: request(),
		});
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(made.usage).toEqual({ unit: "credit", amount: 3 });
		expect(await bytes(made.audio)).toEqual(MP3);
		const found = await as(OWNER).trialFind({
			...request("  안녕하세요 "),
			settings: {},
		} as never);
		expect(found?.id).toBe(made.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("같은 요청 id 동시 두 번과 다른 요청 id 동시: 공급자 1회, 나머지는 in_progress, 끝난 뒤 같은 id는 저장본(AC8)", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return MP3;
		});
		const id = crypto.randomUUID();
		const first = as(OWNER).trialCreate({ requestId: id, request: request() });
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		const inProgress = {
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		};
		await expect(
			as(OWNER).trialCreate({ requestId: id, request: request() }),
		).rejects.toMatchObject(inProgress);
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request("다른"),
			}),
		).rejects.toMatchObject(inProgress);
		release();
		const done = await first;
		const again = await as(OWNER).trialCreate({
			requestId: id,
			request: request(),
		});
		expect(again.id).toBe(done.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("대기 시각 전이면 공급자 0회와 rate_limit, 429를 받으면 대기 시각을 적는다(AC12)", async () => {
		synthesize.mockRejectedValueOnce(
			trialError("elevenlabs", "rate_limit", {
				retryAt: new Date(Date.now() + 60_000).toISOString(),
			}),
		);
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({ data: { reason: "rate_limit" } });
		const [cooldown] = await db.select().from(providerCooldown);
		expect(cooldown?.provider).toBe("elevenlabs");
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request("둘째"),
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("모델 목록 첫 조회에서 429면 선점하거나 합성하지 않는다", async () => {
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		listModels.mockRejectedValueOnce(
			providerError("elevenlabs", "rate_limit", retryAt),
		);
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt },
		});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await db.select().from(trialGeneration)).toHaveLength(0);
	});

	it("모델 조회 사이에 새 대기 시각이 기록되면 선점하지 않는다", async () => {
		listModels.mockImplementationOnce(async () => {
			await db.insert(providerCooldown).values({
				provider: "elevenlabs",
				until: new Date(Date.now() + 60_000),
			});
			return [{ model: "eleven_v4" as const, multiplier: 0.5 }];
		});
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await db.select().from(trialGeneration)).toHaveLength(0);
	});

	it("지난 모델 캐시가 있어도 새 조회 429면 선점하거나 합성하지 않는다", async () => {
		await as(OWNER).trialModels();
		await db
			.update(providerListCache)
			.set({ expiresAt: new Date(Date.now() - 1000) });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		listModels.mockRejectedValueOnce(
			providerError("elevenlabs", "rate_limit", retryAt),
		);
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt },
		});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await db.select().from(trialGeneration)).toHaveLength(0);
	});

	it("대기 기록 쓰기가 실패해도 지난 모델 캐시의 429를 버리지 않는다", async () => {
		await as(OWNER).trialModels();
		await db
			.update(providerListCache)
			.set({ expiresAt: new Date(Date.now() - 1000) });
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		listModels.mockRejectedValueOnce(
			providerError("elevenlabs", "rate_limit", retryAt),
		);
		const cooldownFailingDb = new Proxy(db, {
			get(target, key, receiver) {
				if (key === "insert")
					return (table: Parameters<typeof db.insert>[0]) => {
						if (table === providerCooldown) throw new Error("insert");
						return target.insert(table);
					};
				return Reflect.get(target, key, receiver);
			},
		}) as Context["db"];
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			as(OWNER, { db: cooldownFailingDb }).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt },
		});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await db.select().from(trialGeneration)).toHaveLength(0);
	});

	it("일반 모델 조회 실패는 배율 1로 생성한다", async () => {
		listModels.mockRejectedValueOnce(
			providerError("elevenlabs", "provider_error"),
		);
		const made = await as(OWNER).trialCreate({
			requestId: crypto.randomUUID(),
			request: request(),
		});
		expect(made.usage).toEqual({ unit: "credit", amount: 5 });
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("완료된 같은 요청 id는 대기 중에도 결과를 돌리고 다른 조합은 거절한다", async () => {
		const requestId = crypto.randomUUID();
		const made = await as(OWNER).trialCreate({ requestId, request: request() });
		await db
			.insert(providerCooldown)
			.values({ provider: "elevenlabs", until: new Date(Date.now() + 60_000) });
		const replayed = await as(OWNER).trialCreate({
			requestId,
			request: request(),
		});
		expect(replayed.id).toBe(made.id);
		await expect(
			as(OWNER).trialCreate({ requestId, request: request("다른 문장") }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("미확인된 같은 요청 id는 대기 중에도 미확인을 돌리고 합성하지 않는다", async () => {
		const requestId = crypto.randomUUID();
		synthesize.mockRejectedValueOnce(
			trialError("elevenlabs", "unknown_outcome"),
		);
		await expect(
			as(OWNER).trialCreate({ requestId, request: request() }),
		).rejects.toMatchObject({ data: { reason: "unknown_outcome" } });
		await db
			.insert(providerCooldown)
			.values({ provider: "elevenlabs", until: new Date(Date.now() + 60_000) });
		await expect(
			as(OWNER).trialCreate({ requestId, request: request() }),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("오래된 진행 중 요청 id는 대기 중에도 미확인으로 옮긴다", async () => {
		const requestId = crypto.randomUUID();
		const req = request();
		const claimed = await claim(db, {
			ownerId: OWNER,
			requestId,
			request: req,
			key: comboKey(req),
			usage: { unit: "credit", amount: 5 },
		});
		expect(claimed.kind).toBe("claimed");
		await db
			.update(trialGeneration)
			.set({ createdAt: new Date(Date.now() - 6 * 60_000) })
			.where(eq(trialGeneration.requestId, requestId));
		await db
			.insert(providerCooldown)
			.values({ provider: "elevenlabs", until: new Date(Date.now() + 60_000) });
		await expect(
			as(OWNER).trialCreate({ requestId, request: req }),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect((await db.select().from(trialGeneration))[0]?.status).toBe(
			"unknown",
		);
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("시간 초과는 처리 여부 미확인이고 같은 요청 id를 다시 보내도 공급자를 부르지 않는다", async () => {
		synthesize.mockRejectedValueOnce(
			trialError("elevenlabs", "unknown_outcome"),
		);
		const requestId = crypto.randomUUID();
		await expect(
			as(OWNER).trialCreate({ requestId, request: request() }),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		expect(await as(OWNER).trialFind(request())).toBeNull();
		const [row] = await db.select().from(trialGeneration);
		expect(row?.status).toBe("unknown");
		await expect(
			as(OWNER).trialCreate({ requestId, request: request() }),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("DB가 실패하면 공급자를 부르지 않고 storage(AC13)", async () => {
		dbTouches = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			as(OWNER, { db: failingDb }).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		});
		expect(dbTouches).toBeGreaterThan(0);
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("선점(생성 기록 쓰기)이 실패해도 공급자를 부르지 않고 storage, 찾기·목록도 storage(AC13, E5)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			as(OWNER, { db: insertFailingDb }).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		});
		expect(synthesize).not.toHaveBeenCalled();
		await expect(
			as(OWNER, { db: failingDb }).trialFind(request()),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		await expect(
			as(OWNER, { db: failingDb }).trialList({
				provider: "elevenlabs",
				voiceId: "el0001",
			}),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	});

	it("공급자 응답 뒤 완료 기록이 실패해도 받은 오디오를 돌려준다", async () => {
		let updates = 0;
		const completeFailingDb = new Proxy(db, {
			get(target, key, receiver) {
				if (key === "update") {
					return (...args: Parameters<typeof db.update>) => {
						updates += 1;
						if (updates === 2) throw new Error("update");
						return target.update(...args);
					};
				}
				return Reflect.get(target, key, receiver);
			},
		}) as Context["db"];
		vi.spyOn(console, "error").mockImplementation(() => {});
		const result = await as(OWNER, { db: completeFailingDb }).trialCreate({
			requestId: crypto.randomUUID(),
			request: request(),
		});
		expect(await bytes(result.audio)).toEqual(MP3);
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect((await db.select().from(trialGeneration))[0]?.status).toBe(
			"pending",
		);
	});

	it("목록 항목의 요청은 원래 요청과 같은 조합이고, 그 요청으로 찾으면 같은 결과다(Review Focus 1 화면↔서버 왕복, E4)", async () => {
		const requests: TrialRequest[] = [
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "하나",
				settings: DEFAULT_SETTINGS.typecast,
			},
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "둘",
				settings: {
					...DEFAULT_SETTINGS.typecast,
					emotion: "preset",
					preset: "happy",
					intensity: 1.5,
				},
			},
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "셋",
				settings: {
					...DEFAULT_SETTINGS.typecast,
					model: "ssfm-v21",
					preset: "sad",
				},
			},
			{
				provider: "elevenlabs",
				voiceId: "el0001",
				text: "넷",
				settings: {
					...DEFAULT_SETTINGS.elevenlabs,
					style: 0.4,
					tag: "whispers",
				},
			},
			{
				provider: "elevenlabs",
				voiceId: "el0001",
				text: "다섯",
				settings: {
					...DEFAULT_SETTINGS.elevenlabs,
					model: "eleven_multilingual_v2",
					style: 0.4,
				},
			},
			{
				provider: "fish_audio",
				voiceId: "f".repeat(32),
				text: "여섯",
				settings: {
					...DEFAULT_SETTINGS.fish_audio,
					model: "s2.1-pro",
					tag: "calm",
				},
			},
		];
		for (const original of requests) {
			const made = await as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: original,
			});
			const items = await as(OWNER).trialList({
				provider: original.provider,
				voiceId: original.voiceId,
			});
			const item = items.find((entry) => entry.id === made.id);
			expect(item && comboSignature(item.request)).toBe(
				comboSignature(original),
			);
			expect((await as(OWNER).trialFind(item?.request ?? original))?.id).toBe(
				made.id,
			);
		}
	});

	it("결과 오디오가 상한을 넘으면 입력 거절(audio_too_large)이고 결과를 저장하지 않는다(E8)", async () => {
		synthesize.mockResolvedValueOnce(new Uint8Array(4 * 1024 * 1024 + 1));
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "audio_too_large" },
		});
		expect(await as(OWNER).trialFind(request())).toBeNull();
	});

	it("무료 종료일 뒤 무료 모델은 공급자를 부르지 않고 free_ended(Review Focus 2)", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(FISH_FREE_UNTIL);
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: {
					provider: "fish_audio",
					voiceId: "f1",
					text: "안녕",
					settings: DEFAULT_SETTINGS.fish_audio,
				},
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "free_ended" },
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("키가 없으면 no_key이고 공급자·DB 0회(AC14)", async () => {
		dbTouches = 0;
		await expect(
			as(OWNER, { db: failingDb, providers: {} }).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({ data: { reason: "no_key" } });
		expect(dbTouches).toBe(0);
	});

	it("결과는 요청한 성우의 목록에만 들어간다(Review Focus 3)", async () => {
		await as(OWNER).trialCreate({
			requestId: crypto.randomUUID(),
			request: request(),
		});
		expect(
			await as(OWNER).trialList({ provider: "elevenlabs", voiceId: "el0001" }),
		).toHaveLength(1);
		expect(
			await as(OWNER).trialList({ provider: "elevenlabs", voiceId: "el0002" }),
		).toHaveLength(0);
	});

	it("모델 배율은 목록 캐시를 거친다(두 번 불러도 공급자 1회)", async () => {
		await as(OWNER).trialModels();
		const { rates } = await as(OWNER).trialModels();
		expect(rates).toEqual([{ model: "eleven_v4", multiplier: 0.5 }]);
		expect(listModels).toHaveBeenCalledTimes(1);
	});
});
