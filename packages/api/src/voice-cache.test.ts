import { ORPCError } from "@orpc/server";
import { createDb } from "@tts-pilot-app/db";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { z } from "zod";

import { providerError } from "./providers/errors";
import { testDb as db, testDatabaseUrl as url } from "./test-db";
import { cachedList, cacheKey, expireProvider } from "./voice-cache";

const schema = z.object({ names: z.array(z.string()) });
const value = (...names: string[]) => ({ names });
const publicScope = {
	ownerId: null,
	provider: "elevenlabs",
	kind: "public",
} as const;
const T0 = new Date("2026-10-05T00:00:00.000Z");
const at = (ms: number) => vi.setSystemTime(new Date(T0.getTime() + ms));
const HOUR = 60 * 60 * 1000;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("cacheKey", () => {
	it("배열 순서와 객체 키 순서가 달라도 같은 행이다", () => {
		expect(cacheKey({ b: 1, a: { tags: ["y", "x"] } })).toBe(
			cacheKey({ a: { tags: ["x", "y"] }, b: 1 }),
		);
		expect(cacheKey({ page: 1 })).not.toBe(cacheKey({ page: 2 }));
	});
});

describe("DB가 꺼져 있을 때", () => {
	it("DB에 붙지 못해도 공급자 결과를 돌려주고 로그는 이름·코드만 남긴다", async () => {
		const down = createDb({ DATABASE_URL: "postgresql://x@127.0.0.1:1/x" });
		const query = vi.spyOn(down.$client, "query");
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const fetch = vi.fn(async () => value("a"));
		const result = await cachedList(down, publicScope, { q: 1 }, schema, fetch);
		expect(result).toMatchObject({ value: value("a"), stale: null });
		expect(fetch).toHaveBeenCalledTimes(1);
		// 읽기가 DB 오류로 실패하면 그 요청은 대기 확인·쓰기를 시도하지 않는다. 응답 없는 DB에서 3초씩 세 번이 아니라 한 번만 기다린다.
		expect(query).toHaveBeenCalledTimes(1);
		const lines = log.mock.calls.map(([line]) => String(line));
		expect(lines).toHaveLength(1);
		for (const line of lines) {
			expect(line).toMatch(/^\[voiceCache\] 읽기 실패: /);
			expect(line).not.toContain("postgresql://");
			expect(line).not.toContain("select");
		}
		await down.$client.end();
	});

	it("새로 고침도 대기 확인이 DB 오류로 실패하면 만료 표시 질의를 보내지 않고 한 번만 기다린다", async () => {
		const down = createDb({ DATABASE_URL: "postgresql://x@127.0.0.1:1/x" });
		const query = vi.spyOn(down.$client, "query");
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await expireProvider(down, "elevenlabs", "A")).toEqual({
			retryAt: null,
		});
		expect(query).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0]?.[0])).toMatch(
			/^\[voiceCache\] 대기 확인 실패: /,
		);
		await down.$client.end();
	});
});

describe.skipIf(!url)("목록 캐시(테스트 DB)", () => {
	beforeEach(async () => {
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T0);
	});
	afterAll(async () => {
		// 다음 파일(격리 테스트)은 실제 시각으로 돈다. 이 파일이 2026-10-05 기준으로 쓴 대기 행이 남으면 그 파일이 TOO_MANY_REQUESTS를 받는다(계획 리뷰 E1)
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("처음은 공급자 1회, 24시간 안에 다시 부르면 0회이고 받은 시각이 같다", async () => {
		const fetch = vi.fn(async () => value("a"));
		const first = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		at(23 * HOUR);
		const second = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(second).toEqual({
			value: value("a"),
			fetchedAt: first.fetchedAt,
			stale: null,
		});
		expect(first.fetchedAt).toBe(T0.toISOString());
	});

	it("24시간이 지나면 다시 부르고, 공개 행을 두 번 써도 한 행이다(NULLS NOT DISTINCT)", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(value("a"))
			.mockResolvedValueOnce(value("b"));
		await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		at(25 * HOUR);
		const result = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		expect(result.value).toEqual(value("b"));
		expect(await db.select().from(providerListCache)).toHaveLength(1);
	});

	it("만료 뒤 공급자가 실패하면 지난 목록을 사유와 함께 돌려준다", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () =>
			value("old"),
		);
		at(30 * HOUR);
		const result = await cachedList(
			db,
			publicScope,
			{ q: 1 },
			schema,
			async () => {
				throw providerError("elevenlabs", "provider_error");
			},
		);
		expect(result).toEqual({
			value: value("old"),
			fetchedAt: T0.toISOString(),
			stale: { reason: "provider_error", retryAt: null },
		});
	});

	it("공급자가 실패해 지난 목록을 돌려줄 때 공급자·사유만 한 줄 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const mine = {
			ownerId: "A",
			provider: "elevenlabs",
			kind: "account",
		} as const;
		await cachedList(db, mine, { q: 1 }, schema, async () => value("old"));
		await db
			.update(providerListCache)
			.set({ expiresAt: new Date(Date.now() - 60_000) });
		await expect(
			cachedList(db, mine, { q: 1 }, schema, async () => {
				throw providerError("elevenlabs", "provider_error");
			}),
		).resolves.toMatchObject({ stale: { reason: "provider_error" } });
		expect(log.mock.calls).toEqual([
			["[voiceCache] elevenlabs 지난 목록 반환: provider_error"],
		]);
	});

	it("지난 목록이 없으면 공급자 오류를 그대로 던지고, 사유 없는 예외도 그대로 던진다", async () => {
		await expect(
			cachedList(db, publicScope, { q: 1 }, schema, async () => {
				throw providerError("elevenlabs", "quota");
			}),
		).rejects.toMatchObject({ code: "BAD_GATEWAY", data: { reason: "quota" } });
		const bug = new RangeError("bug");
		await expect(
			cachedList(db, publicScope, { q: 2 }, schema, async () => {
				throw bug;
			}),
		).rejects.toBe(bug);
	});

	it("만료된 지 7일이 넘은 행은 다른 쓰기 때 지워진다", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () =>
			value("old"),
		);
		at(24 * HOUR + 8 * 24 * HOUR);
		await cachedList(db, publicScope, { q: 2 }, schema, async () =>
			value("new"),
		);
		const rows = await db.select().from(providerListCache);
		expect(rows.map((row) => row.paramsKey)).toEqual([cacheKey({ q: 2 })]);
	});

	it("만료된 지 7일이 넘은 행은 공급자가 실패해도 지난 목록으로 쓰지 않는다(계획 리뷰 E5)", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () =>
			value("old"),
		);
		at(24 * HOUR + 8 * 24 * HOUR);
		await expect(
			cachedList(db, publicScope, { q: 1 }, schema, async () => {
				throw providerError("elevenlabs", "provider_error");
			}),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
	});

	it("계약 판이 다른 행과 검사에 실패한 행은 없는 것으로 본다", async () => {
		const now = new Date();
		const later = new Date(now.getTime() + 24 * HOUR);
		const base = {
			ownerId: null,
			provider: "elevenlabs",
			listKind: "public",
			fetchedAt: now,
			expiresAt: later,
		};
		await db.insert(providerListCache).values([
			{
				...base,
				paramsKey: cacheKey({ q: 1 }),
				contractVersion: 0,
				payload: value("v0"),
			},
			{
				...base,
				paramsKey: cacheKey({ q: 2 }),
				contractVersion: 1,
				payload: { broken: true },
			},
		]);
		const fetch = vi.fn(async () => value("fresh"));
		expect(
			(await cachedList(db, publicScope, { q: 1 }, schema, fetch)).value,
		).toEqual(value("fresh"));
		expect(
			(await cachedList(db, publicScope, { q: 2 }, schema, fetch)).value,
		).toEqual(value("fresh"));
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("같은 키의 동시 두 요청은 공급자 호출 1회다", async () => {
		let release: (v: { names: string[] }) => void = () => {};
		const fetch = vi.fn(
			() =>
				new Promise<{ names: string[] }>((resolve) => {
					release = resolve;
				}),
		);
		const a = cachedList(db, publicScope, { q: 1 }, schema, fetch);
		const b = cachedList(db, publicScope, { q: 1 }, schema, fetch);
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		release(value("a"));
		expect((await a).value).toEqual(value("a"));
		expect((await b).value).toEqual(value("a"));
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("429의 retryAt은 대기 표에 남고, 그 전에는 공급자를 부르지 않는다(지난 목록이 있으면 그것을, 없으면 rate_limit)", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () =>
			value("old"),
		);
		at(25 * HOUR);
		const later = new Date(T0.getTime() + 25 * HOUR + 60_000).toISOString();
		const limited = await cachedList(
			db,
			publicScope,
			{ q: 1 },
			schema,
			async () => {
				throw providerError("elevenlabs", "rate_limit", later);
			},
		);
		expect(limited.stale).toEqual({ reason: "rate_limit", retryAt: later });
		const fetch = vi.fn(async () => value("x"));
		const again = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		expect(fetch).not.toHaveBeenCalled();
		expect(again.stale).toEqual({ reason: "rate_limit", retryAt: later });
		const thrown = await cachedList(
			db,
			publicScope,
			{ q: 9 },
			schema,
			fetch,
		).catch((e) => e);
		expect(thrown).toBeInstanceOf(ORPCError);
		expect(thrown).toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: later },
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it("새로 고침은 그 공급자의 공개 행과 이 소유자의 계정 행만 만료로 바꾼다", async () => {
		const fetch = vi.fn(async () => value("a"));
		const mine = {
			ownerId: "A",
			provider: "elevenlabs",
			kind: "account",
		} as const;
		const theirs = {
			ownerId: "B",
			provider: "elevenlabs",
			kind: "account",
		} as const;
		const other = {
			ownerId: null,
			provider: "fish_audio",
			kind: "public",
		} as const;
		for (const scope of [publicScope, mine, theirs, other]) {
			await cachedList(db, scope, { q: 1 }, schema, fetch);
		}
		expect(await expireProvider(db, "elevenlabs", "A")).toEqual({
			retryAt: null,
		});
		fetch.mockClear();
		for (const scope of [publicScope, mine, theirs, other]) {
			await cachedList(db, scope, { q: 1 }, schema, fetch);
		}
		// 공개(elevenlabs)와 A의 계정만 다시 불렀다
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("새로 고침은 행을 지우지 않는다: 다시 받기가 실패하면 지난 목록을 사유와 함께 보인다", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () =>
			value("old"),
		);
		await expireProvider(db, "elevenlabs", "A");
		const result = await cachedList(
			db,
			publicScope,
			{ q: 1 },
			schema,
			async () => {
				throw providerError("elevenlabs", "provider_error");
			},
		);
		expect(result).toEqual({
			value: value("old"),
			fetchedAt: T0.toISOString(),
			stale: { reason: "provider_error", retryAt: null },
		});
	});

	it("대기 시각 전의 새로 고침은 아무것도 바꾸지 않고 대기 시각을 돌려준다", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () =>
			value("old"),
		);
		const [before] = await db.select().from(providerListCache);
		const until = new Date(T0.getTime() + 60_000);
		await db.insert(providerCooldown).values({ provider: "elevenlabs", until });
		expect(await expireProvider(db, "elevenlabs", "A")).toEqual({
			retryAt: until.toISOString(),
		});
		const [after] = await db.select().from(providerListCache);
		expect(after?.expiresAt).toEqual(before?.expiresAt);
		expect(after?.expiresAt.getTime()).toBe(T0.getTime() + 24 * HOUR);
	});

	it("대기 표의 시각은 1시간까지만 받는다(T5 생성도 이 표에 쓴다)", async () => {
		const far = new Date(T0.getTime() + 3 * HOUR).toISOString();
		await expect(
			cachedList(db, publicScope, { q: 1 }, schema, async () => {
				throw providerError("elevenlabs", "rate_limit", far);
			}),
		).rejects.toMatchObject({ data: { reason: "rate_limit" } });
		const [row] = await db.select().from(providerCooldown);
		expect(row?.until.getTime()).toBe(T0.getTime() + HOUR);
	});
});
