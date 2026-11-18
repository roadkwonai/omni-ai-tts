// packages/api/src/routers/script.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { script } from "@tts-pilot-app/db/schema/script";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";
import { scriptRouter } from "./script";

const A = `script-iso-a-${Date.now()}`;
const B = `script-iso-b-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const work = (text = "A의 대본") => ({
	defaultVoice: null,
	gap: 0.5,
	paragraphs: [{ id: "p1", text }],
});

async function clean() {
	await db.delete(script);
	await db.delete(channel);
	await db.delete(classification);
}

describe.skipIf(!url)("대본 소유자 격리(T12 스펙 9절 12번)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("B는 A의 대본을 받기·저장·고치기·복제·지우기 모두 NOT_FOUND이고 A는 그대로", async () => {
		const mine = await as(A).scriptCreate({
			title: "A 대본",
			channelId: null,
			classificationIds: [],
			work: work(),
		});
		const recent = await as(A).scriptRecordRecent({
			workId: crypto.randomUUID(),
			channelId: null,
			work: work(),
		});
		const before = await as(A).scriptList({ kind: "saved" });
		for (const id of [mine.id, recent.id])
			for (const call of [
				() => as(B).scriptGet({ id }),
				() =>
					as(B).scriptSave({
						id,
						version: 1,
						channelId: null,
						work: work("탈취"),
					}),
				() =>
					as(B).scriptSave({
						id,
						version: 1,
						force: true,
						channelId: null,
						work: work("탈취"),
					}),
				() => as(B).scriptUpdate({ id, title: "B가 바꿈" }),
				() => as(B).scriptDuplicate({ id }),
				() => as(B).scriptRemove({ id }),
			])
				await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(B).scriptList({ kind: "saved" })).toEqual({
			items: [],
			next: null,
		});
		expect(await as(B).scriptList({ kind: "recent" })).toEqual({
			items: [],
			next: null,
		});
		expect(await as(A).scriptList({ kind: "saved" })).toEqual(before);
		expect(await as(A).scriptGet({ id: mine.id })).toMatchObject({
			title: "A 대본",
			version: 1,
			work: work(),
		});
		expect((await as(A).scriptList({ kind: "recent" })).items).toHaveLength(1);
	});

	it("B가 A의 채널·분류로 만들기·저장·고치기·최근 보관은 NOT_FOUND", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const cat = await as(A).classificationCreate({
			kind: "category",
			name: "A 분류",
			memo: "",
		});
		await expect(
			as(B).scriptCreate({
				title: "B",
				channelId: ch.id,
				classificationIds: [],
				work: work(),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).scriptCreate({
				title: "B",
				channelId: null,
				classificationIds: [cat.id],
				work: work(),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const theirs = await as(B).scriptCreate({
			title: "B",
			channelId: null,
			classificationIds: [],
			work: work(),
		});
		await expect(
			as(B).scriptSave({
				id: theirs.id,
				version: 1,
				channelId: ch.id,
				work: work(),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).scriptUpdate({ id: theirs.id, channelId: ch.id }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).scriptUpdate({ id: theirs.id, classificationIds: [cat.id] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).scriptRecordRecent({
				workId: crypto.randomUUID(),
				channelId: ch.id,
				work: work(),
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(B).scriptGet({ id: theirs.id })).toMatchObject({
			channelId: null,
			classificationIds: [],
			version: 1,
		});
		expect((await as(B).scriptList({ kind: "recent" })).items).toEqual([]);
		// A의 채널·분류·본문으로 걸러도 B에게 A의 대본이 보이지 않는다
		await as(A).scriptCreate({
			title: "A 숨은 대본",
			channelId: ch.id,
			classificationIds: [cat.id],
			work: work("A만 아는 글"),
		});
		for (const filter of [
			{ channel: ch.id },
			{ category: [cat.id] },
			{ q: "A만 아는" },
		])
			expect(await as(B).scriptList({ kind: "saved", ...filter })).toEqual({
				items: [],
				next: null,
			});
	});

	it("같은 제목·같은 작업 id도 소유자가 다르면 따로 남는다", async () => {
		const workId = crypto.randomUUID();
		for (const owner of [A, B]) {
			await as(owner).scriptCreate({
				title: "같은 제목",
				channelId: null,
				classificationIds: [],
				work: work(),
			});
			await as(owner).scriptRecordRecent({
				workId,
				channelId: null,
				work: work(owner),
			});
		}
		expect((await as(A).scriptList({ kind: "recent" })).items[0]?.preview).toBe(
			A,
		);
		expect((await as(B).scriptList({ kind: "recent" })).items[0]?.preview).toBe(
			B,
		);
	});

	it("최근 보관은 소유자별로 20개씩 남는다", async () => {
		for (const owner of [A, B])
			for (let i = 0; i < 21; i++)
				await as(owner).scriptRecordRecent({
					workId: crypto.randomUUID(),
					channelId: null,
					work: work(`${owner} ${i}`),
				});
		for (const owner of [A, B]) {
			const { items } = await as(owner).scriptList({ kind: "recent" });
			expect(items).toHaveLength(20);
			expect(items.every((s) => s.preview.startsWith(owner))).toBe(true);
		}
	});

	it("입력에 소유자를 끼워도 B의 것으로 만들어진다", async () => {
		await as(B).scriptCreate({
			title: "소유자 덮기",
			channelId: null,
			classificationIds: [],
			work: work(),
			ownerId: A,
			owner_id: A,
		} as never);
		expect((await as(A).scriptList({ kind: "saved" })).items).toEqual([]);
		expect((await as(B).scriptList({ kind: "saved" })).items).toHaveLength(1);
	});
});

describe("대본 소유자 없음", () => {
	it("scriptRouter 키 8개 모두 UNAUTHORIZED이고 DB 접근이 0회", async () => {
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
		const nobody = as(null, failingDb) as unknown as Record<
			string,
			(input: unknown) => Promise<unknown>
		>;
		const keys = Object.keys(scriptRouter);
		expect(keys).toHaveLength(8);
		for (const key of keys)
			await expect(nobody[key]?.({})).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
		expect(dbTouches).toBe(0);
	});
});
