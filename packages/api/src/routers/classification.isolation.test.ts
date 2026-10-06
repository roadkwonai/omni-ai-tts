// packages/api/src/routers/classification.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `class-iso-a-${Date.now()}`;
const B = `class-iso-b-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});

describe.skipIf(!url)("채널·분류 소유자 격리(스펙 8절 6번)", () => {
	beforeEach(async () => {
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("B는 A의 채널·분류를 보지도 고치지도 지우지도 못하고 A의 행은 그대로다", async () => {
		const ch = await as(A).channelCreate({
			name: "A 채널",
			memo: "",
			url: "https://a.example",
		});
		const cat = await as(A).classificationCreate({
			kind: "category",
			name: "A 분류",
			memo: "",
		});
		expect(await as(B).channelList()).toEqual([]);
		expect(await as(B).classificationList()).toEqual([]);
		for (const attempt of [
			() =>
				as(B).channelUpdate({ id: ch.id, name: "가로챔", memo: "", url: "" }),
			() => as(B).channelDelete({ id: ch.id }),
			() =>
				as(B).classificationUpdate({ id: cat.id, name: "가로챔", memo: "" }),
			() => as(B).classificationDelete({ id: cat.id }),
		])
			await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).channelList()).toEqual([ch]);
		expect(await as(A).classificationList()).toEqual([cat]);
	});

	it("B는 A와 같은 이름을 만들 수 있다", async () => {
		await as(A).channelCreate({ name: "경제", memo: "", url: "" });
		await as(A).classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "",
		});
		await expect(
			as(B).channelCreate({ name: "경제", memo: "", url: "" }),
		).resolves.toMatchObject({ name: "경제" });
		await expect(
			as(B).classificationCreate({ kind: "type", name: "차분함", memo: "" }),
		).resolves.toMatchObject({ name: "차분함" });
	});

	it("입력에 ownerId를 끼워도 서버가 정한 소유자로 저장한다(계획 리뷰 E8)", async () => {
		await as(B).channelCreate({
			name: "끼움",
			memo: "",
			url: "",
			ownerId: A,
		} as never);
		await as(B).classificationCreate({
			kind: "type",
			name: "끼움",
			memo: "",
			ownerId: A,
		} as never);
		expect(await as(A).channelList()).toEqual([]);
		expect(await as(A).classificationList()).toEqual([]);
		expect(await as(B).channelList()).toHaveLength(1);
		expect(await as(B).classificationList()).toHaveLength(1);
	});
});

describe("소유자 없음(스펙 8절 7번)", () => {
	it("프로시저 8개 모두 UNAUTHORIZED이고 DB에 닿지 않는다", async () => {
		let dbTouches = 0;
		const failingDb = new Proxy(
			{},
			{
				get() {
					dbTouches += 1;
					throw new Error("db access without owner");
				},
			},
		) as Context["db"];
		const anon = as(null, failingDb);
		const id = crypto.randomUUID();
		for (const call of [
			() => anon.channelList(),
			() => anon.channelCreate({ name: "a", memo: "", url: "" }),
			() => anon.channelUpdate({ id, name: "a", memo: "", url: "" }),
			() => anon.channelDelete({ id }),
			() => anon.classificationList(),
			() => anon.classificationCreate({ kind: "type", name: "a", memo: "" }),
			() => anon.classificationUpdate({ id, name: "a", memo: "" }),
			() => anon.classificationDelete({ id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
	});
});
