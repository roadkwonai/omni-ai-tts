import { randomUUID } from "node:crypto";

import { createAuth } from "@tts-pilot-app/auth";
import type { Database } from "@tts-pilot-app/db";
import { account, user } from "@tts-pilot-app/db/schema/auth";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { providerListCache } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { script } from "@tts-pilot-app/db/schema/script";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { count, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	createOwnerAccount,
	isLocalDatabaseUrl,
	LEGACY_OWNER_ID,
	moveLocalAdminData,
	passwordProblem,
} from "./owner-setup";
import { testDb as db, testDatabaseUrl as url } from "./test-db";

describe("isLocalDatabaseUrl", () => {
	it.each([
		["postgresql://u:p@localhost:5432/app", true],
		["postgresql://u:p@127.0.0.1:5432/app", true],
		["postgresql://u:p@[::1]:5432/app", true],
		["postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/app", false],
		["postgresql://u:p@192.168.0.10:5432/app", false],
		["postgresql://u:p@10.0.0.1/app", false],
		["postgresql://u:p@localhost.evil.com/app", false],
		// pg-connection-string은 쿼리의 host·hostaddr로 실제 접속 호스트를 바꾼다.
		["postgresql://u:p@localhost/db?host=ep-x.neon.tech", false],
		["postgresql://u:p@localhost/db?hostaddr=10.0.0.5", false],
		["postgresql://u:p@localhost/db?sslmode=disable", true],
		["not a url", false],
		["", false],
	])("%s → %s", (input, expected) => {
		expect(isLocalDatabaseUrl(input)).toBe(expected);
	});
});

describe("better-auth logger", () => {
	afterEach(() => vi.restoreAllMocks());

	it("레벨과 문자열 메시지만 남기고 오류 객체(인자·메시지 자리)는 버린다", () => {
		const out = vi.spyOn(console, "error").mockImplementation(() => {});
		const log = createAuth(
			{
				BETTER_AUTH_URL: "http://127.0.0.1:3002",
				BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
			},
			db,
		).options.logger?.log as (...args: unknown[]) => void;
		const leak = new Error("Failed query: select … params: session-token-xyz");
		// better-auth는 오류 객체를 뒤 인자로도, 메시지 자리로도 넘긴다(session.mjs의 logger.error(e)).
		log("error", "INTERNAL_SERVER_ERROR", leak);
		log("error", leak);
		const printed = JSON.stringify(out.mock.calls);
		expect(printed).toContain("INTERNAL_SERVER_ERROR");
		expect(printed).not.toContain("session-token-xyz");
		expect(out).toHaveBeenCalledTimes(2);
	});
});

describe("passwordProblem", () => {
	const ok = "a".repeat(12);
	it.each([
		[ok, ok, null],
		["a".repeat(128), "a".repeat(128), null],
		["a".repeat(11), "a".repeat(11), "비밀번호는 12자 이상이어야 해요."],
		["a".repeat(129), "a".repeat(129), "비밀번호는 128자 이하여야 해요."],
		[ok, `${ok}b`, "두 번 입력한 비밀번호가 달라요."],
	])("%#", (a, b, expected) => {
		expect(passwordProblem(a, b)).toBe(expected);
	});
});

// 이전 대상 표와 캐시 표. 테스트 DB에 원래 있던 local-admin 행은 각 테스트 동안 park id로 옮겨 두고 끝나면 되돌린다.
// 그래서 테스트 안의 local-admin 행은 이 테스트가 넣은 행뿐이고 수를 정확히 비교할 수 있다. 다른 테스트 파일에는 영향이 없다.
const ownedTables = [
	channel,
	classification,
	savedVoice,
	voicePreset,
	script,
	trialGeneration,
	myVoice,
	providerListCache,
] as const;

async function reown(from: string, to: string) {
	for (const t of ownedTables) {
		await db.update(t).set({ ownerId: to }).where(eq(t.ownerId, from));
	}
}

async function deleteOwned(owners: string[]) {
	for (const t of ownedTables) {
		await db.delete(t).where(inArray(t.ownerId, owners));
	}
}

async function seed(ownerId: string) {
	await db.insert(channel).values({ ownerId, name: "채널" });
	await db
		.insert(classification)
		.values({ ownerId, kind: "category", name: "분류" });
	await db.insert(savedVoice).values({
		ownerId,
		provider: "typecast",
		voiceId: "v1",
		source: "public",
		voice: {},
	});
	await db
		.insert(voicePreset)
		.values({ ownerId, name: "프리셋", provider: "typecast", settings: {} });
	await db.insert(script).values({
		ownerId,
		kind: "saved",
		title: "대본",
		work: {},
		body: "본문",
		paragraphCount: 1,
		charCount: 2,
	});
	await db.insert(trialGeneration).values({
		ownerId,
		requestId: randomUUID(),
		comboKey: "k",
		provider: "typecast",
		voiceId: "v1",
		model: "m",
		settings: {},
		text: "t",
		usageAmount: 0,
		usageUnit: "free",
		status: "failed",
		expiresAt: new Date(),
	});
	await db.insert(myVoice).values({
		ownerId,
		provider: "fish_audio",
		name: "내 목소리",
		status: "failed",
		requestId: randomUUID(),
		fingerprint: "f",
		consentAt: new Date(),
		consentVersion: "1",
	});
	await db.insert(providerListCache).values({
		ownerId,
		provider: "typecast",
		listKind: "voices",
		paramsKey: "p",
		contractVersion: 1,
		payload: {},
		fetchedAt: new Date(),
		expiresAt: new Date(),
	});
}

async function countsOf(ownerId: string) {
	const out: number[] = [];
	for (const t of ownedTables) {
		const [row] = await db
			.select({ n: count() })
			.from(t)
			.where(eq(t.ownerId, ownerId));
		out.push(row?.n ?? 0);
	}
	return out;
}

const movedAll = {
	channel: 1,
	classification: 1,
	savedVoice: 1,
	voicePreset: 1,
	script: 1,
	trialGeneration: 1,
	myVoice: 1,
	providerListCacheDeleted: 1,
};

describe.skipIf(!url)("local-admin 이전(테스트 DB)", () => {
	let park: string;
	let userId: string;
	let other: string;
	const owners: string[] = [];

	beforeEach(async () => {
		park = `owner-setup-park-${randomUUID()}`;
		userId = `owner-setup-user-${randomUUID()}`;
		other = `owner-setup-other-${randomUUID()}`;
		owners.length = 0;
		owners.push(userId, other, LEGACY_OWNER_ID);
		await reown(LEGACY_OWNER_ID, park);
		await seed(LEGACY_OWNER_ID);
		await seed(other);
	});

	afterEach(async () => {
		await deleteOwned(owners);
		await reown(park, LEGACY_OWNER_ID);
	});

	it("7개 표의 local-admin 행을 옮기고 캐시 행은 지우며 다른 소유자 행은 그대로다", async () => {
		const moved = await moveLocalAdminData(db, userId);
		expect(moved).toEqual(movedAll);
		expect(await countsOf(LEGACY_OWNER_ID)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
		expect(await countsOf(userId)).toEqual([1, 1, 1, 1, 1, 1, 1, 0]);
		expect(await countsOf(other)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
	});

	it("옮길 행이 없으면 모두 0이다", async () => {
		await deleteOwned([LEGACY_OWNER_ID]);
		const moved = await moveLocalAdminData(db, userId);
		expect(Object.values(moved).every((n) => n === 0)).toBe(true);
	});

	it("중간 표(voice_preset)에서 실패하면 앞 표까지 모두 롤백된다", async () => {
		// 대상 사용자에게 같은 이름 프리셋을 미리 넣어 voice_preset 이름 유일 제약을 깨게 한다(실제 DB 오류).
		await db.insert(voicePreset).values({
			ownerId: userId,
			name: "프리셋",
			provider: "typecast",
			settings: {},
		});
		await expect(moveLocalAdminData(db, userId)).rejects.toThrow();
		expect(await countsOf(LEGACY_OWNER_ID)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
		expect(await countsOf(userId)).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
	});

	describe("createOwnerAccount", () => {
		const auth = createAuth(
			{
				BETTER_AUTH_URL: "http://127.0.0.1:3002",
				BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
			},
			db,
		);
		const email = "owner-setup@example.test";
		const input = { email, name: "owner-setup", password: "a".repeat(16) };

		afterEach(async () => {
			await db.delete(user).where(eq(user.email, email));
		});

		async function accountRows() {
			const [u] = await db
				.select({ n: count() })
				.from(user)
				.where(eq(user.email, email));
			const [a] = await db
				.select({ n: count() })
				.from(account)
				.innerJoin(user, eq(account.userId, user.id))
				.where(eq(user.email, email));
			return [u?.n, a?.n];
		}

		it("계정과 credential 계정을 만들고 local-admin 행을 새 id로 옮긴다", async () => {
			const ctx = await auth.$context;
			const result = await createOwnerAccount(ctx, db, input);
			owners.push(result.userId);
			expect(result.moved).toEqual(movedAll);
			expect(await countsOf(result.userId)).toEqual([1, 1, 1, 1, 1, 1, 1, 0]);
			const [row] = await db
				.select({ providerId: account.providerId, password: account.password })
				.from(account)
				.where(eq(account.userId, result.userId));
			expect(row?.providerId).toBe("credential");
			expect(row?.password).not.toBe(input.password);
			expect(
				await ctx.password.verify({
					hash: row?.password ?? "",
					password: input.password,
				}),
			).toBe(true);
		});

		it("이전이 실패하면 만든 사용자와 계정을 지우고 원래 오류를 던지며 local-admin 행은 그대로다", async () => {
			const ctx = await auth.$context;
			// 이전 트랜잭션 안에서 실제로 옮긴 뒤 던지게 감싼다(실제 롤백을 확인).
			const failingDb = Object.create(db, {
				transaction: {
					value: (fn: Parameters<Database["transaction"]>[0]) =>
						db.transaction(async (tx) => {
							await fn(tx);
							throw new Error("이전 실패 주입");
						}),
				},
			}) as Database;
			await expect(createOwnerAccount(ctx, failingDb, input)).rejects.toThrow(
				"이전 실패 주입",
			);
			expect(await accountRows()).toEqual([0, 0]);
			expect(await countsOf(LEGACY_OWNER_ID)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
		});

		it("지우기까지 실패하면 원래 오류에 cleanupFailed를 붙여 던진다", async () => {
			const ctx = await auth.$context;
			const brokenCtx = {
				...ctx,
				internalAdapter: {
					...ctx.internalAdapter,
					linkAccount: async () => {
						throw new Error("연결 실패 주입");
					},
					deleteUser: async () => {
						throw new Error("삭제 실패 주입");
					},
				},
			};
			await expect(
				createOwnerAccount(brokenCtx, db, input),
			).rejects.toMatchObject({
				message: "연결 실패 주입",
				cleanupFailed: true,
			});
			expect((await accountRows())[0]).toBe(1);
			expect(await countsOf(LEGACY_OWNER_ID)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
		});
	});
});
