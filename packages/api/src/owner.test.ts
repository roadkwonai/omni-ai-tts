import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import type { Context } from "./context";
import { protectedProcedure } from "./index";
import { LOCAL_OWNER_ID, localOwnerId } from "./owner";

describe("localOwnerId", () => {
	it("development와 test의 루프백 요청은 로컬 관리자다", () => {
		expect(localOwnerId("development", "127.0.0.1:3001")).toBe(LOCAL_OWNER_ID);
		expect(localOwnerId("development", "localhost:3001")).toBe(LOCAL_OWNER_ID);
		expect(localOwnerId("development", "[::1]:3001")).toBe(LOCAL_OWNER_ID);
		expect(localOwnerId("test", "localhost")).toBe(LOCAL_OWNER_ID);
	});

	it("production과 모르는 NODE_ENV에서는 소유자가 없다", () => {
		expect(localOwnerId("production", "127.0.0.1:3001")).toBeNull();
		expect(localOwnerId("staging", "127.0.0.1:3001")).toBeNull();
		expect(localOwnerId("", "127.0.0.1:3001")).toBeNull();
	});

	it("다른 이름으로 들어온 요청(DNS 리바인딩)이나 Host가 없으면 소유자가 없다", () => {
		expect(localOwnerId("development", "evil.example:3001")).toBeNull();
		expect(localOwnerId("development", "127.0.0.1.evil.example")).toBeNull();
		expect(localOwnerId("development", null)).toBeNull();
	});
});

describe("protectedProcedure", () => {
	const router = {
		whoami: protectedProcedure.handler(({ context }) => context.ownerId),
	};
	// 소유자 검사 미들웨어는 db를 쓰지 않는다.
	const as = (ownerId: string | null) =>
		createRouterClient(router, {
			context: { db: {} as Context["db"], ownerId },
		});

	it("소유자가 없으면 UNAUTHORIZED", async () => {
		await expect(as(null).whoami()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("소유자가 있으면 핸들러가 그 값을 받는다", async () => {
		await expect(as(LOCAL_OWNER_ID).whoami()).resolves.toBe(LOCAL_OWNER_ID);
	});
});
