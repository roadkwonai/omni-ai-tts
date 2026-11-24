// packages/api/src/routers/script.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { script } from "@tts-pilot-app/db/schema/script";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `script-${Date.now()}`;
const me = createRouterClient(appRouter, {
	context: { db, ownerId: OWNER, providers: null } as Context,
});
const VOICE = {
	provider: "typecast" as const,
	voiceId: "tc_a",
	settings: { ...DEFAULT_SETTINGS.typecast },
};
const work = (text = "첫 문장이에요. 둘째 문장", over = {}) => ({
	defaultVoice: VOICE,
	gap: 0.5,
	paragraphs: [
		{
			id: "p1",
			text,
			gap: 1,
			voice: VOICE,
			speaker: "철수",
			fixes: {
				text,
				decisions: [
					{
						start: 0,
						end: 1,
						original: [...text][0] ?? "",
						choice: "keep" as const,
					},
				],
			},
		},
		{ id: "p2", text: "" },
	],
	speakers: [{ name: "철수", voice: null }],
	...over,
});
const many = (n: number, text = "가") => ({
	defaultVoice: null,
	gap: 0,
	paragraphs: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, text })),
});
const create = (title: string, over: Record<string, unknown> = {}) =>
	me.scriptCreate({
		title,
		channelId: null,
		classificationIds: [],
		work: work(),
		...over,
	} as never);
const MISSING = "00000000-0000-4000-8000-000000000000";

async function clean() {
	await db.delete(script);
	await db.delete(channel);
	await db.delete(classification);
}

describe.skipIf(!url)("대본 보관함 프로시저(T12 계획 2.2)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("만들기: 정리한 제목·판 1, 받기가 작업·채널·분류를 그대로 돌려준다", async () => {
		const ch = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const cat = await me.classificationCreate({
			kind: "category",
			name: "뉴스",
			memo: "",
		});
		const made = await me.scriptCreate({
			title: "  경제   브리핑 ",
			channelId: ch.id,
			classificationIds: [cat.id, cat.id],
			work: work(),
		});
		expect(made).toMatchObject({ title: "경제 브리핑", version: 1 });
		const got = await me.scriptGet({ id: made.id });
		expect(got).toEqual({
			id: made.id,
			kind: "saved",
			title: "경제 브리핑",
			channelId: ch.id,
			classificationIds: [cat.id],
			version: 1,
			workId: null,
			work: work(),
		});
	});

	it("같은 제목(대소문자 무시)은 CONFLICT duplicate_name", async () => {
		await create("Econ");
		await expect(create("econ")).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
	});

	it("판 조건 저장: 맞는 판이면 판을 올리고, 지난 판은 stale, force는 덮어쓴다", async () => {
		const { id } = await create("대본");
		const saved = await me.scriptSave({
			id,
			version: 1,
			channelId: null,
			work: work("고친 글"),
		});
		expect(saved).toEqual({ version: 2 });
		expect((await me.scriptGet({ id })).work.paragraphs[0]?.text).toBe(
			"고친 글",
		);
		// 목록 요약도 새 판을 따른다
		expect(
			(await me.scriptList({ kind: "saved", q: "고친" })).items[0],
		).toMatchObject({ id, preview: "고친 글", charCount: 4 });
		await expect(
			me.scriptSave({ id, version: 1, channelId: null, work: work("늦은 탭") }),
		).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "stale" } });
		expect(
			await me.scriptSave({
				id,
				version: 1,
				force: true,
				channelId: null,
				work: work("덮어씀"),
			}),
		).toEqual({ version: 3 });
		expect((await me.scriptGet({ id })).work.paragraphs[0]?.text).toBe(
			"덮어씀",
		);
	});

	it("지워진 대본에 저장은 NOT_FOUND(force도)", async () => {
		const { id } = await create("대본");
		await me.scriptRemove({ id });
		for (const force of [false, true])
			await expect(
				me.scriptSave({ id, version: 1, force, channelId: null, work: work() }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("최근 대본 id로 저장·고치기·복제는 NOT_FOUND, 받기·지우기는 된다", async () => {
		const workId = crypto.randomUUID();
		const { id } = await me.scriptRecordRecent({
			workId,
			channelId: null,
			work: work(),
		});
		await expect(
			me.scriptSave({ id, version: 1, channelId: null, work: work() }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(me.scriptUpdate({ id, title: "이름" })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(me.scriptDuplicate({ id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await me.scriptGet({ id })).toMatchObject({
			kind: "recent",
			title: null,
			workId,
		});
		expect(await me.scriptRemove({ id })).toEqual({ deleted: true });
	});

	it("고치기: 제목·채널·분류를 바꾸고 판은 그대로, 같은 제목은 CONFLICT", async () => {
		const ch = await me.channelCreate({ name: "채널", memo: "", url: "" });
		const type = await me.classificationCreate({
			kind: "type",
			name: "쇼츠",
			memo: "",
		});
		const { id } = await create("처음");
		await create("다른 대본");
		expect(
			await me.scriptUpdate({
				id,
				title: "새 이름",
				channelId: ch.id,
				classificationIds: [type.id],
			}),
		).toEqual({ id });
		expect(await me.scriptGet({ id })).toMatchObject({
			title: "새 이름",
			channelId: ch.id,
			classificationIds: [type.id],
			version: 1,
		});
		// 고친 것이 목록 맨 위로 온다(다른 대본이 나중에 만들어졌어도)
		expect((await me.scriptList({ kind: "saved" })).items[0]?.id).toBe(id);
		await me.scriptUpdate({ id, classificationIds: [] });
		expect(await me.scriptGet({ id })).toMatchObject({
			title: "새 이름",
			classificationIds: [],
		});
		await expect(
			me.scriptUpdate({ id, title: "다른 대본" }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
	});

	it("복제: 100자 제목은 줄여 ' 사본', 다음은 '사본 2', 분류를 복사하고 판 1", async () => {
		const cat = await me.classificationCreate({
			kind: "category",
			name: "뉴스",
			memo: "",
		});
		const title = "가".repeat(100);
		const { id } = await create(title, { classificationIds: [cat.id] });
		await me.scriptSave({ id, version: 1, channelId: null, work: work("v2") });
		const copy = await me.scriptDuplicate({ id });
		expect([...copy.title]).toHaveLength(100);
		expect(copy.title.endsWith(" 사본")).toBe(true);
		expect(await me.scriptGet({ id: copy.id })).toMatchObject({
			classificationIds: [cat.id],
			version: 1,
			work: work("v2"),
		});
		expect((await me.scriptDuplicate({ id })).title.endsWith(" 사본 2")).toBe(
			true,
		);
		await expect(me.scriptDuplicate({ id: MISSING })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("목록 커서: 같은 시각 31개는 1쪽 30개, 2쪽 1개이고 겹치지 않는다", async () => {
		const at = new Date("2026-11-18T01:02:03.456Z");
		await db.insert(script).values(
			Array.from({ length: 31 }, (_, i) => ({
				kind: "saved" as const,
				title: `대본 ${i}`,
				work: many(1),
				body: "가",
				paragraphCount: 1,
				charCount: 1,
				updatedAt: at,
				ownerId: OWNER,
			})),
		);
		const first = await me.scriptList({ kind: "saved" });
		expect(first.items).toHaveLength(30);
		expect(first.next).not.toBeNull();
		const second = await me.scriptList({
			kind: "saved",
			cursor: first.next ?? undefined,
		});
		expect(second.items).toHaveLength(1);
		expect(second.next).toBeNull();
		const ids = new Set([...first.items, ...second.items].map((s) => s.id));
		expect(ids.size).toBe(31);
	});

	it("목록 순서는 최신순, 같은 시각은 id 내림차순이고 쪽을 넘어도 같다(D4)", async () => {
		const at = (i: number) =>
			new Date(Date.parse("2026-11-18T00:00:00.000Z") + Math.floor(i / 4));
		const made = await db
			.insert(script)
			.values(
				Array.from({ length: 70 }, (_, i) => ({
					kind: "saved" as const,
					title: `대본 ${i}`,
					work: many(1),
					body: "가",
					paragraphCount: 1,
					charCount: 1,
					updatedAt: at(i),
					ownerId: OWNER,
				})),
			)
			.returning({ id: script.id, updatedAt: script.updatedAt });
		const expected = made
			.sort(
				(a, b) =>
					b.updatedAt.getTime() - a.updatedAt.getTime() ||
					(a.id < b.id ? 1 : -1),
			)
			.map((row) => row.id);
		const got: string[] = [];
		const sizes: number[] = [];
		for (let cursor: { at: string; id: string } | undefined; ; ) {
			const page = await me.scriptList({ kind: "saved", cursor });
			got.push(...page.items.map((item) => item.id));
			sizes.push(page.items.length);
			if (!page.next) break;
			cursor = page.next;
		}
		expect(sizes).toEqual([30, 30, 10]);
		expect(got).toEqual(expected);
	});

	// 인덱스는 NULLS LAST로 만들어져 있다. 정렬 글자가 다르면 대본을 모두 읽고 정렬한다(D4)
	it("목록 질의(첫 쪽·커서)는 script_owner_list를 타고 정렬하지 않는다", async () => {
		const query = vi.spyOn(db.$client, "query");
		await me.scriptList({ kind: "saved" });
		await me.scriptList({
			kind: "saved",
			cursor: { at: new Date().toISOString(), id: MISSING },
		});
		const lists = query.mock.calls.flatMap((call) => {
			const [config, values] = call as unknown as [
				{ text?: string },
				unknown[]?,
			];
			return config.text?.includes('from "script"')
				? [{ text: config.text, values: values ?? [] }]
				: [];
		});
		query.mockRestore();
		expect(lists).toHaveLength(2);
		const client = await db.$client.connect();
		try {
			await client.query("begin");
			// 작은 표에서는 순차 읽기나 다른 인덱스 + 정렬을 고르므로 끄고 본다. 인덱스 순서와 맞지 않으면 꺼도 Sort가 남는다
			for (const node of ["seqscan", "bitmapscan", "sort"])
				await client.query(`set local enable_${node} = off`);
			for (const { text, values } of lists) {
				const { rows } = await client.query<{ "QUERY PLAN": string }>(
					`explain ${text}`,
					values,
				);
				const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
				expect(plan).toContain("script_owner_list");
				expect(plan).not.toContain("Sort");
			}
		} finally {
			await client.query("rollback");
			client.release();
		}
	});

	it("검색은 한글 조합형(NFD)과 완성형(NFC)을 같게 보고 작업 글은 그대로 둔다(D6)", async () => {
		const nfd = "커피 이야기".normalize("NFD");
		const nfc = "커피 이야기".normalize("NFC");
		const a = await create("조합형", { work: many(1, nfd) });
		const b = await create("완성형", { work: many(1, nfc) });
		for (const q of [nfc, nfd])
			expect(
				new Set(
					(await me.scriptList({ kind: "saved", q })).items.map((s) => s.id),
				),
			).toEqual(new Set([a.id, b.id]));
		expect((await me.scriptGet({ id: a.id })).work.paragraphs[0]?.text).toBe(
			nfd,
		);
	});

	it("목록 줄: 요약만 있고 work가 없다", async () => {
		await create("대본");
		const { items } = await me.scriptList({ kind: "saved" });
		expect(items[0]).toMatchObject({
			kind: "saved",
			title: "대본",
			preview: "첫 문장이에요. 둘째 문장",
			paragraphCount: 1,
			charCount: 14,
			channelId: null,
			classificationIds: [],
			version: 1,
		});
		expect(items[0]).not.toHaveProperty("work");
		expect(items[0]).not.toHaveProperty("ownerId");
	});

	it("검색: 제목·원문에서 찾고 %·_는 글자 그대로, 1자도 찾는다", async () => {
		await create("100% 진짜", { work: many(1, "본문") });
		await create("100점", { work: many(1, "본문") });
		await create("a_b", { work: many(1, "본문") });
		await create("axb", { work: many(1, "숨은 낱말") });
		await create("a\\b", { work: many(1, "본문") });
		const titles = async (q: string) =>
			(await me.scriptList({ kind: "saved", q })).items
				.map((s) => s.title)
				.sort();
		expect(await titles("%")).toEqual(["100% 진짜"]);
		expect(await titles("_")).toEqual(["a_b"]);
		expect(await titles("진")).toEqual(["100% 진짜"]);
		expect(await titles("낱말")).toEqual(["axb"]);
		expect(await titles("\\")).toEqual(["a\\b"]);
		expect(await titles("  ")).toHaveLength(5);
	});

	it("거르기: 그룹 안은 OR, 카테고리·타입끼리는 AND, 채널 하나·none", async () => {
		const ch = await me.channelCreate({ name: "채널", memo: "", url: "" });
		const c1 = await me.classificationCreate({
			kind: "category",
			name: "c1",
			memo: "",
		});
		const c2 = await me.classificationCreate({
			kind: "category",
			name: "c2",
			memo: "",
		});
		const t1 = await me.classificationCreate({
			kind: "type",
			name: "t1",
			memo: "",
		});
		await create("s1", { classificationIds: [c1.id, t1.id], channelId: ch.id });
		await create("s2", { classificationIds: [c2.id] });
		await create("s3", { classificationIds: [c1.id] });
		const titles = async (filter: Record<string, unknown>) =>
			(await me.scriptList({ kind: "saved", ...filter })).items
				.map((s) => s.title)
				.sort();
		expect(await titles({ category: [c1.id, c2.id] })).toEqual([
			"s1",
			"s2",
			"s3",
		]);
		expect(await titles({ category: [c1.id, c2.id], type: [t1.id] })).toEqual([
			"s1",
		]);
		expect(await titles({ channel: ch.id })).toEqual(["s1"]);
		expect(await titles({ channel: "none" })).toEqual(["s2", "s3"]);
	});

	it("최근 보관: 같은 작업 id는 한 줄에 시각만 올리고, 21번째에 가장 오래된 것을 지운다", async () => {
		const first = crypto.randomUUID();
		const a = await me.scriptRecordRecent({
			workId: first,
			channelId: null,
			work: work("처음"),
		});
		const before = await me.scriptList({ kind: "recent" });
		const b = await me.scriptRecordRecent({
			workId: first,
			channelId: null,
			work: work("다시"),
		});
		expect(b.id).toBe(a.id);
		const after = await me.scriptList({ kind: "recent" });
		expect(after.items).toHaveLength(1);
		expect(after.items[0]?.preview).toBe("다시");
		expect(Date.parse(after.items[0]?.updatedAt ?? "")).toBeGreaterThan(
			Date.parse(before.items[0]?.updatedAt ?? ""),
		);
		// 가장 오래된 것이 되게 시각을 뒤로 민다(같은 ms 동률을 피한다)
		await db
			.update(script)
			.set({ updatedAt: new Date(Date.now() - 3_600_000) })
			.where(eq(script.id, a.id));
		for (let i = 0; i < 20; i++)
			await me.scriptRecordRecent({
				workId: crypto.randomUUID(),
				channelId: null,
				work: work(`작업 ${i}`),
			});
		const recent = await me.scriptList({ kind: "recent" });
		expect(recent.items).toHaveLength(20);
		expect(recent.next).toBeNull();
		expect(recent.items.map((s) => s.id)).not.toContain(a.id);
		// 저장한 대본은 최근 정리에 걸리지 않는다
		await create("저장");
		await me.scriptRecordRecent({
			workId: crypto.randomUUID(),
			channelId: null,
			work: work(),
		});
		expect((await me.scriptList({ kind: "saved" })).items).toHaveLength(1);
	});

	it("상한: 201문단·10,001자·2 MB·U+0000·빈 작업은 BAD_REQUEST", async () => {
		for (const bad of [
			many(201),
			many(1, "가".repeat(10_001)),
			many(100, "가".repeat(10_000)),
			many(1, "a\u0000b"),
			many(1, "a\uD800b"),
			many(2, " "),
		])
			await expect(create("상한", { work: bad })).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		await expect(
			me.scriptRecordRecent({
				workId: crypto.randomUUID(),
				channelId: null,
				work: many(1, "a\u0000b"),
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect((await me.scriptList({ kind: "saved" })).items).toEqual([]);
	});

	it("문단 id가 겹치거나 규칙 밖이면 BAD_REQUEST", async () => {
		const dup = {
			...many(2),
			paragraphs: [
				{ id: "same", text: "a" },
				{ id: "same", text: "b" },
			],
		};
		const bad = { ...many(1), paragraphs: [{ id: "no space", text: "a" }] };
		for (const w of [dup, bad])
			await expect(create("id", { work: w })).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
	});

	it("남의 것이 아닌 없는 채널·분류로 만들기는 NOT_FOUND", async () => {
		await expect(create("x", { channelId: MISSING })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			create("x", { classificationIds: [MISSING] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
