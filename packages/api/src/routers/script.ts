// packages/api/src/routers/script.ts
import { ORPCError } from "@orpc/server";
import { classification } from "@tts-pilot-app/db/schema/classification";
import { script, scriptClassification } from "@tts-pilot-app/db/schema/script";
import {
	and,
	desc,
	eq,
	exists,
	ilike,
	inArray,
	isNull,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { deletedSchema, deleteInputSchema } from "../classification-contract";
import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { copyName } from "../preset-contract";
import {
	type ScriptWorkValue,
	scriptCreatedSchema,
	scriptCreateInputSchema,
	scriptListInputSchema,
	scriptListSchema,
	scriptRecordRecentInputSchema,
	scriptSaveInputSchema,
	scriptSchema,
	scriptUpdateInputSchema,
} from "../script-contract";
import { SCRIPT_TITLE_MAX, scriptBody } from "../script-rules";
import {
	dbCode,
	found,
	isUniqueViolation,
	stored as sharedStored,
} from "../voice-cache";
import { ownChannel } from "./preset";

type Db = Context["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const PAGE = 30;
const RECENT_MAX = 20;

// 같은 제목은 제목 유니크 인덱스가 막는다(동시 저장 포함). 고른 채널·분류가 그사이 지워지면 외래 키 위반(23503)이라 없는 항목과 같게 NOT_FOUND
const mapError = (error: unknown) =>
	isUniqueViolation(error, "script_title")
		? new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } })
		: dbCode(error) === "23503"
			? new ORPCError("NOT_FOUND")
			: null;
const stored = <T>(step: string, run: () => Promise<T>) =>
	sharedStored("[script]", step, run, mapError);

const mine = (ownerId: string, id: string) =>
	and(eq(script.id, id), eq(script.ownerId, ownerId));
// 저장·고치기·복제는 저장한 대본만 다룬다(최근 대본 id는 NOT_FOUND, 리뷰 P2)
const mineSaved = (ownerId: string, id: string) =>
	and(mine(ownerId, id), eq(script.kind, "saved"));
const recentOf = (ownerId: string) =>
	and(eq(script.ownerId, ownerId), eq(script.kind, "recent"));

// 작업 칸과 서버가 만드는 검색 원문·수
const workFields = (work: ScriptWorkValue) => ({
	work,
	...scriptBody(work.paragraphs),
});

// 붙일 분류는 내 것만 센다. 센 수가 준 수와 다르면(없거나 남의 것) NOT_FOUND(트랜잭션 되돌림, savedVoiceLinks와 같다)
async function ownClasses(tx: Tx, ownerId: string, ids: readonly string[]) {
	if (ids.length === 0) return;
	const count = await tx.$count(
		classification,
		and(
			eq(classification.ownerId, ownerId),
			inArray(classification.id, [...ids]),
		),
	);
	if (count !== ids.length) throw new ORPCError("NOT_FOUND");
}

async function setClasses(tx: Tx, scriptId: string, ids: readonly string[]) {
	await tx
		.delete(scriptClassification)
		.where(eq(scriptClassification.scriptId, scriptId));
	if (ids.length > 0)
		await tx
			.insert(scriptClassification)
			.values(ids.map((classificationId) => ({ scriptId, classificationId })));
}

// 대본마다 분류 id. ponytail: 한 쪽(최대 30개)의 연결을 한 번에 받아 JS로 나눈다
async function classesOf(db: Db | Tx, ids: string[]) {
	if (ids.length === 0) return () => [];
	const links = await db
		.select()
		.from(scriptClassification)
		.where(inArray(scriptClassification.scriptId, ids));
	return (id: string) =>
		links
			.filter((link) => link.scriptId === id)
			.map((link) => link.classificationId);
}

// 검색어의 %·_·\는 글자 그대로 찾는다. Postgres LIKE의 기본 이스케이프 문자가 \다
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// 대본 보관함(T12 계획 2.2). 소유자는 context.ownerId뿐이고 모든 조회·변경에 owner_id 조건을 건다.
// insert 값은 소유자를 마지막에 둔다(입력 스키마가 바뀌어도 소유자가 덮이지 않게). 트랜잭션 안은 DB 문장뿐이다(lock-short-transactions)
export const scriptRouter = {
	scriptList: protectedProcedure
		.input(scriptListInputSchema)
		.output(scriptListSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("목록", async () => {
				const saved = input.kind === "saved";
				const where: (SQL | undefined)[] = [
					eq(script.ownerId, ownerId),
					eq(script.kind, input.kind),
				];
				// 최근 대본은 거르기·커서 없이 최대 20개(스펙 4.1)
				if (saved) {
					if (input.q) {
						const pattern = likeOf(input.q);
						where.push(
							or(ilike(script.title, pattern), ilike(script.body, pattern)),
						);
					}
					if (input.channel === "none") where.push(isNull(script.channelId));
					else if (input.channel)
						where.push(eq(script.channelId, input.channel));
					// 그룹 안은 하나라도(OR), 카테고리·타입 그룹끼리는 모두(AND). 그룹은 화면이 나눠 보낸다(성우 보관함 filterSaved와 같다)
					for (const ids of [input.category, input.type])
						if (ids?.length)
							where.push(
								exists(
									db
										.select({ one: sql`1` })
										.from(scriptClassification)
										.where(
											and(
												eq(scriptClassification.scriptId, script.id),
												inArray(scriptClassification.classificationId, ids),
											),
										),
								),
							);
					if (input.cursor)
						where.push(
							sql`(${script.updatedAt}, ${script.id}) < (${input.cursor.at}::timestamptz, ${input.cursor.id}::uuid)`,
						);
				}
				const limit = saved ? PAGE + 1 : RECENT_MAX;
				// 목록은 work를 읽지 않는다(스펙 5절)
				const rows = await db
					.select({
						id: script.id,
						kind: script.kind,
						title: script.title,
						preview: sql<string>`left(${script.body}, 160)`,
						paragraphCount: script.paragraphCount,
						charCount: script.charCount,
						channelId: script.channelId,
						version: script.version,
						updatedAt: script.updatedAt,
					})
					.from(script)
					.where(and(...where))
					.orderBy(desc(script.updatedAt), desc(script.id))
					.limit(limit);
				const page = rows.slice(0, saved ? PAGE : RECENT_MAX);
				const last = page.at(-1);
				const classes = await classesOf(
					db,
					page.map((row) => row.id),
				);
				return {
					items: page.map((row) => ({
						...row,
						classificationIds: classes(row.id),
						updatedAt: row.updatedAt.toISOString(),
					})),
					next:
						rows.length > page.length && last
							? { at: last.updatedAt.toISOString(), id: last.id }
							: null,
				};
			}),
		),
	scriptGet: protectedProcedure
		.input(deleteInputSchema)
		.output(scriptSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("받기", async () => {
				const [row] = await db
					.select({
						id: script.id,
						kind: script.kind,
						title: script.title,
						channelId: script.channelId,
						version: script.version,
						workId: script.workId,
						work: script.work,
					})
					.from(script)
					.where(mine(ownerId, id));
				const { work, ...rest } = found(row);
				const classes = await classesOf(db, [id]);
				// 출력 스키마가 work를 다시 검사한다(계약이 바뀐 옛 행이면 오류. 화면은 readWork로 한 번 더 읽는다)
				return {
					...rest,
					work: work as ScriptWorkValue,
					classificationIds: classes(id),
				};
			}),
		),
	scriptCreate: protectedProcedure
		.input(scriptCreateInputSchema)
		.output(scriptCreatedSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("만들기", () =>
				db.transaction(async (tx) => {
					await ownChannel(tx, ownerId, input.channelId);
					await ownClasses(tx, ownerId, input.classificationIds);
					const [row] = await tx
						.insert(script)
						.values({
							kind: "saved",
							title: input.title,
							channelId: input.channelId,
							...workFields(input.work),
							ownerId,
						})
						.returning({
							id: script.id,
							title: script.title,
							version: script.version,
						});
					const made = found(row);
					await setClasses(tx, made.id, input.classificationIds);
					return { ...made, title: made.title ?? input.title };
				}),
			),
		),
	// 판 조건 저장(스펙 4.4). 0행이면 내 저장한 대본이 있는지 한 번 더 봐서 있으면 stale, 없으면 NOT_FOUND
	scriptSave: protectedProcedure
		.input(scriptSaveInputSchema)
		.output(z.object({ version: z.number().int().positive() }))
		.handler(({ input, context: { db, ownerId } }) =>
			stored("저장", () =>
				db.transaction(async (tx) => {
					await ownChannel(tx, ownerId, input.channelId);
					const [row] = await tx
						.update(script)
						.set({
							channelId: input.channelId,
							...workFields(input.work),
							version: sql`${script.version} + 1`,
							// 만들기(defaultNow)와 같은 DB 시계. $onUpdate의 호스트 시계는 순서를 뒤집는다
							updatedAt: sql`now()`,
						})
						.where(
							and(
								mineSaved(ownerId, input.id),
								input.force ? undefined : eq(script.version, input.version),
							),
						)
						.returning({ version: script.version });
					if (row) return row;
					const [still] = await tx
						.select({ id: script.id })
						.from(script)
						.where(mineSaved(ownerId, input.id));
					if (still)
						throw new ORPCError("CONFLICT", { data: { reason: "stale" } });
					throw new ORPCError("NOT_FOUND");
				}),
			),
		),
	// 제목·채널·분류만. 판은 올리지 않는다(작업실 저장과 충돌하지 않는다, 스펙 4.4)
	scriptUpdate: protectedProcedure
		.input(scriptUpdateInputSchema)
		.output(z.object({ id: z.uuid() }))
		.handler(({ input, context: { db, ownerId } }) =>
			stored("고치기", () =>
				db.transaction(async (tx) => {
					if (input.channelId !== undefined)
						await ownChannel(tx, ownerId, input.channelId);
					if (input.classificationIds)
						await ownClasses(tx, ownerId, input.classificationIds);
					const [row] = await tx
						.update(script)
						// 분류만 바꿔도 바꾼 시각은 올린다(set이 비지 않게도)
						.set({
							title: input.title,
							channelId: input.channelId,
							updatedAt: sql`now()`,
						})
						.where(mineSaved(ownerId, input.id))
						.returning({ id: script.id });
					found(row);
					if (input.classificationIds)
						await setClasses(tx, input.id, input.classificationIds);
					return { id: input.id };
				}),
			),
		),
	// 복제: 제목 '{제목} 사본'(100자), 분류도 복사, 판 1. 겹침 목록은 저장한 대본 제목만 읽는다(리뷰 R2-6)
	scriptDuplicate: protectedProcedure
		.input(deleteInputSchema)
		.output(z.object({ id: z.uuid(), title: z.string() }))
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("복제", () =>
				db.transaction(async (tx) => {
					const [source] = await tx
						.select({
							title: script.title,
							channelId: script.channelId,
							work: script.work,
							body: script.body,
							paragraphCount: script.paragraphCount,
							charCount: script.charCount,
						})
						.from(script)
						.where(mineSaved(ownerId, id));
					const { title, ...rest } = found(source);
					const names = await tx
						.select({ title: script.title })
						.from(script)
						.where(and(eq(script.ownerId, ownerId), eq(script.kind, "saved")));
					const copy = copyName(
						title ?? "",
						names.map((entry) => entry.title ?? ""),
						SCRIPT_TITLE_MAX,
					);
					const [row] = await tx
						.insert(script)
						.values({ kind: "saved", title: copy, ...rest, ownerId })
						.returning({ id: script.id });
					const made = found(row);
					const classes = await classesOf(tx, [id]);
					await setClasses(tx, made.id, classes(id));
					return { id: made.id, title: copy };
				}),
			),
		),
	scriptRemove: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("지우기", async () => {
				const [row] = await db
					.delete(script)
					.where(mine(ownerId, id))
					.returning({ id: script.id });
				found(row);
				return { deleted: true as const };
			}),
		),
	// 최근 보관(스펙 4.5): 작업 id마다 한 줄 upsert 뒤 최근 20개 밖을 지운다.
	// 첫 줄의 소유자 잠금이 두 탭 동시 보관의 정리 경합을 줄 세운다(lock-advisory, 리뷰 P9)
	scriptRecordRecent: protectedProcedure
		.input(scriptRecordRecentInputSchema)
		.output(z.object({ id: z.uuid() }))
		.handler(({ input, context: { db, ownerId } }) =>
			stored("최근 보관", () =>
				db.transaction(async (tx) => {
					await tx.execute(
						sql`select pg_advisory_xact_lock(hashtext(${ownerId}))`,
					);
					await ownChannel(tx, ownerId, input.channelId);
					const fields = {
						channelId: input.channelId,
						...workFields(input.work),
					};
					const [row] = await tx
						.insert(script)
						.values({
							kind: "recent",
							workId: input.workId,
							...fields,
							ownerId,
						})
						.onConflictDoUpdate({
							target: [script.ownerId, script.workId],
							targetWhere: sql`${script.kind} = 'recent'`,
							set: { ...fields, updatedAt: sql`now()` },
						})
						.returning({ id: script.id });
					const kept = tx
						.select({ id: script.id })
						.from(script)
						.where(recentOf(ownerId))
						.orderBy(desc(script.updatedAt), desc(script.id))
						.limit(RECENT_MAX);
					await tx
						.delete(script)
						.where(and(recentOf(ownerId), notInArray(script.id, kept)));
					return { id: found(row).id };
				}),
			),
		),
};
