import { createRouterClient } from "@orpc/server";
import { user } from "@tts-pilot-app/db/schema/auth";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "./context";
import { protectedProcedure } from "./index";
import { demoOwner, ownerEmailFrom, ownerIdOf } from "./owner";
import { testDb as db, testDatabaseUrl as url } from "./test-db";

describe("ownerEmailFrom", () => {
	it.each([
		[undefined, null],
		["", null],
		["  ,  , ", null],
		["me@example.com", "me@example.com"],
		["  Me@Example.COM  ", "me@example.com"],
		["  Me@Example.com , me@example.com ", "me@example.com"],
		["me@example.com,", "me@example.com"],
	])("%j → %j", (raw, email) => {
		expect(ownerEmailFrom(raw)).toEqual({ email, tooMany: false });
	});

	it("서로 다른 이메일이 둘 이상이면 소유자 없음(tooMany)", () => {
		expect(ownerEmailFrom("a@example.com, b@example.com")).toEqual({
			email: null,
			tooMany: true,
		});
		expect(ownerEmailFrom("a@example.com,A@example.com,b@example.com")).toEqual(
			{ email: null, tooMany: true },
		);
	});
});

describe("ownerIdOf", () => {
	const owner = { id: "u1", email: "me@example.com" };

	it.each([
		["세션 없음", null, "me@example.com", null],
		["세션 undefined", undefined, "me@example.com", null],
		["소유자", owner, "me@example.com", "u1"],
		["목록 대소문자·공백", owner, "  ME@example.com ", "u1"],
		[
			"세션 이메일 대소문자",
			{ id: "u1", email: "Me@Example.COM" },
			"me@example.com",
			"u1",
		],
		[
			"다른 이메일",
			{ id: "u2", email: "other@example.com" },
			"me@example.com",
			null,
		],
		["목록 빔", owner, "", null],
		["목록 없음", owner, undefined, null],
		["목록 둘 이상", owner, "me@example.com,other@example.com", null],
	])("%s", (_name, user, raw, id) => {
		expect(ownerIdOf(user, raw)).toBe(id);
	});
});

describe("protectedProcedure", () => {
	const router = {
		whoami: protectedProcedure.handler(({ context }) => context.ownerId),
	};
	// 소유자 검사 미들웨어는 db를 쓰지 않는다.
	const as = (ownerId: string | null) =>
		createRouterClient(router, {
			context: { db: {} as Context["db"], ownerId, providers: null },
		});

	it("소유자가 없으면 UNAUTHORIZED", async () => {
		await expect(as(null).whoami()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("소유자가 있으면 핸들러가 그 값을 받는다", async () => {
		await expect(as("u1").whoami()).resolves.toBe("u1");
	});
});

describe("demoOwner (T15-a2 공개 데모)", () => {
	// 닫히는 경우는 DB를 부르지 않는다. 닿으면 실패한다.
	const untouchable = new Proxy(
		{},
		{
			get() {
				throw new Error("db touched");
			},
		},
	) as Context["db"];

	it.each([
		["공급자·OpenAI 키가 하나라도 있음", "demo@example.com", true],
		["OWNER_EMAILS 빔", "", false],
		["OWNER_EMAILS 없음", undefined, false],
		["OWNER_EMAILS 둘 이상", "demo@example.com,b@example.com", false],
	])("%s: 소유자 없음이고 DB를 부르지 않는다", async (_name, raw, hasKey) => {
		await expect(demoOwner(untouchable, raw, hasKey)).resolves.toBeNull();
	});
});

describe.skipIf(!url)("demoOwner DB 조회", () => {
	const id = `demo-owner-${Date.now()}`;
	const email = `${id}@example.com`;

	beforeAll(async () => {
		await db.insert(user).values({ id, name: "demo", email });
	});
	afterAll(async () => {
		await db.delete(user).where(eq(user.id, id));
		await db.$client.end();
	});

	it("OWNER_EMAILS 한 명의 user 행이 있으면 그 id와 이메일", async () => {
		await expect(
			demoOwner(db, `  ${email.toUpperCase()} `, false),
		).resolves.toEqual({ userId: id, email });
	});

	it("키가 남아 있으면 user 행이 있어도 소유자 없음", async () => {
		await expect(demoOwner(db, email, true)).resolves.toBeNull();
	});

	it("그 이메일의 user 행이 없으면 소유자 없음", async () => {
		await expect(demoOwner(db, `missing-${email}`, false)).resolves.toBeNull();
	});
});
