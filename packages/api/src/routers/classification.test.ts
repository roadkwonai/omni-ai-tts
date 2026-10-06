// packages/api/src/routers/classification.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `class-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const me = as(OWNER);
const blank = { memo: "", url: "" };
// 접근하면 그 오류를 던지는 DB(DB 없이 저장소 오류를 흉내 낸다)
const throwingDb = (error: unknown) =>
	new Proxy(
		{},
		{
			get() {
				throw error;
			},
		},
	) as Context["db"];

describe.skipIf(!url)("채널·분류 프로시저(T6 스펙 8·9절)", () => {
	beforeEach(async () => {
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("채널을 만들고 목록에서 보고 고치고 지운다", async () => {
		const made = await me.channelCreate({ name: "  경제   한 입 ", ...blank });
		expect(made).toEqual({
			id: expect.any(String),
			name: "경제 한 입",
			memo: null,
			url: null,
		});
		expect(await me.channelList()).toEqual([made]);
		const fixed = await me.channelUpdate({
			id: made.id,
			name: "주말 레터",
			memo: " 토요일 아침 ",
			url: "https://youtube.com/@weekend",
		});
		expect(fixed).toEqual({
			id: made.id,
			name: "주말 레터",
			memo: "토요일 아침",
			url: "https://youtube.com/@weekend",
		});
		expect(await me.channelList()).toEqual([fixed]);
		expect(await me.channelDelete({ id: made.id })).toEqual({ deleted: true });
		expect(await me.channelList()).toEqual([]);
	});

	it("카테고리·타입을 한 목록으로 돌려주고 고쳐도 kind는 그대로다", async () => {
		const category = await me.classificationCreate({
			kind: "category",
			name: "경제",
			memo: "",
		});
		const type = await me.classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "낮은 톤",
		});
		const list = await me.classificationList();
		expect(list).toHaveLength(2);
		expect(list).toEqual(expect.arrayContaining([category, type]));
		const fixed = await me.classificationUpdate({
			id: type.id,
			name: "차분함·신뢰",
			memo: "",
		});
		expect(fixed).toEqual({
			id: type.id,
			kind: "type",
			name: "차분함·신뢰",
			memo: null,
		});
		expect(await me.classificationDelete({ id: category.id })).toEqual({
			deleted: true,
		});
		expect(await me.classificationList()).toEqual([fixed]);
	});

	it("같은 그룹 같은 이름은 대소문자·공백·NFC·보이지 않는 글자 차이까지 CONFLICT다(Review Focus 1)", async () => {
		await me.channelCreate({ name: "Economy Bite", ...blank });
		for (const name of [
			"economy bite",
			"  ECONOMY   bite ",
			"Economy\u3000Bite",
			"Economy Bite\u200B",
		])
			await expect(me.channelCreate({ name, ...blank })).rejects.toMatchObject({
				code: "CONFLICT",
				data: { reason: "duplicate_name" },
			});
		await me.classificationCreate({ kind: "category", name: "경제", memo: "" });
		await expect(
			me.classificationCreate({
				kind: "category",
				name: "경제".normalize("NFD"),
				memo: "",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await me.channelList()).toHaveLength(1);
		expect(await me.classificationList()).toHaveLength(1);
	});

	it("다른 그룹이면 같은 이름이어도 된다", async () => {
		await me.channelCreate({ name: "경제", ...blank });
		await me.classificationCreate({ kind: "category", name: "경제", memo: "" });
		await me.classificationCreate({ kind: "type", name: "경제", memo: "" });
		expect(await me.channelList()).toHaveLength(1);
		expect(await me.classificationList()).toHaveLength(2);
	});

	it("고치기로 다른 항목과 같은 이름이 되면 CONFLICT이고, 자기 이름 그대로는 된다", async () => {
		const calm = await me.classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "",
		});
		const lively = await me.classificationCreate({
			kind: "type",
			name: "활기참",
			memo: "",
		});
		await expect(
			me.classificationUpdate({ id: lively.id, name: "차분함", memo: "" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			await me.classificationUpdate({
				id: calm.id,
				name: "차분함",
				memo: "메모만",
			}),
		).toMatchObject({ name: "차분함", memo: "메모만" });
		const a = await me.channelCreate({ name: "A", ...blank });
		await me.channelCreate({ name: "B", ...blank });
		await expect(
			me.channelUpdate({ id: a.id, name: "b", ...blank }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("동시에 같은 이름을 두 번 만들면 한 행만 남는다(Review Focus 4)", async () => {
		const results = await Promise.allSettled([
			me.channelCreate({ name: "동시", ...blank }),
			me.channelCreate({ name: "동시", ...blank }),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.find((r) => r.status === "rejected")).toMatchObject({
			reason: { code: "CONFLICT" },
		});
		expect(await me.channelList()).toHaveLength(1);
	});

	it("입력 경계를 서버도 지킨다(Review Focus 2)", async () => {
		await expect(
			me.channelCreate({ name: "가".repeat(40), ...blank }),
		).resolves.toMatchObject({ name: "가".repeat(40) });
		await expect(
			me.channelCreate({
				name: "b",
				memo: "가".repeat(200),
				url: `http://example.com/${"a".repeat(481)}`,
			}),
		).resolves.toMatchObject({ name: "b" });
		await expect(
			me.channelCreate({ name: "c\u0000", ...blank }),
		).resolves.toMatchObject({ name: "c" });
		for (const input of [
			{ name: "가".repeat(41), ...blank },
			{ name: "   ", ...blank },
			{ name: "\u200B", ...blank },
			{ name: "a", memo: "가".repeat(201), url: "" },
			{ name: "a", memo: "", url: "javascript:alert(1)" },
			{ name: "a", memo: "", url: "JavaScript:alert(1)" },
			{ name: "a", memo: "", url: "ftp://example.com" },
			{ name: "a", memo: "", url: "/path" },
			{ name: "a", memo: "", url: "http://a.com/\u0000" },
			{ name: "a", memo: "", url: `https://example.com/${"a".repeat(481)}` },
		])
			await expect(me.channelCreate(input)).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		await expect(
			me.classificationCreate({
				kind: "channel" as "type",
				name: "a",
				memo: "",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("없는 id로 고치기·지우기는 NOT_FOUND다", async () => {
		const id = crypto.randomUUID();
		await expect(
			me.channelUpdate({ id, name: "a", ...blank }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(me.channelDelete({ id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			me.classificationUpdate({ id, name: "a", memo: "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(me.classificationDelete({ id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("다른 탭에서 지운 항목을 고치면 NOT_FOUND다(Review Focus 5)", async () => {
		const made = await me.classificationCreate({
			kind: "category",
			name: "뉴스",
			memo: "",
		});
		await me.classificationDelete({ id: made.id });
		await expect(
			me.classificationUpdate({ id: made.id, name: "뉴스2", memo: "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("저장소 오류(DB 없이)", () => {
	it("입력 없이 한 줄만 남기고 INTERNAL_SERVER_ERROR다(Review Focus 3)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const down = Object.assign(new Error("connect ECONNREFUSED"), {
			code: "ECONNREFUSED",
		});
		await expect(
			as(OWNER, throwingDb(down)).channelCreate({
				name: "비밀 채널 이름",
				memo: "비밀 메모",
				url: "",
			}),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(log.mock.calls.map((call) => call.join(" "))).toEqual([
			"[classes] 채널 만들기 실패: Error ECONNREFUSED",
		]);
		log.mockRestore();
	});

	it("이름 인덱스가 아닌 유니크 위반은 같은 이름 오류로 바꾸지 않는다(계획 리뷰 E9)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		// drizzle은 pg 오류를 cause에 넣는다
		const unique = (constraint: string) =>
			Object.assign(new Error("query failed"), {
				cause: { code: "23505", constraint },
			});
		const input = { name: "a", memo: "", url: "" };
		await expect(
			as(OWNER, throwingDb(unique("channel_name"))).channelCreate(input),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
		await expect(
			as(OWNER, throwingDb(unique("channel_pkey"))).channelCreate(input),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		log.mockRestore();
	});
});
