// packages/api/src/routers/classification.ts
import { ORPCError } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import {
	savedVoiceChannel,
	savedVoiceClassification,
} from "@tts-pilot-app/db/schema/saved-voice";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
	channelInputSchema,
	channelListItemSchema,
	channelSchema,
	channelUpdateInputSchema,
	classificationCreateInputSchema,
	classificationListItemSchema,
	classificationSchema,
	classificationUpdateInputSchema,
	deletedSchema,
	deleteInputSchema,
} from "../classification-contract";
import { protectedProcedure } from "../index";
import { dbCode, found, stored as sharedStored } from "../voice-cache";

// 같은 그룹 같은 이름: 이름 유니크 인덱스(schema/classification.ts) 위반 23505만 본다. drizzle은 pg 오류를 cause에 넣는다(계획 리뷰 E9)
const NAME_INDEXES = new Set(["channel_name", "classification_name"]);
function isDuplicateName(error: unknown): boolean {
	const constraint = (error as { cause?: { constraint?: unknown } } | null)
		?.cause?.constraint;
	return (
		dbCode(error) === "23505" &&
		typeof constraint === "string" &&
		NAME_INDEXES.has(constraint)
	);
}

const duplicateName = (error: unknown) =>
	isDuplicateName(error)
		? new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } })
		: null;

const stored = <T>(
	step: string,
	run: () => Promise<T>,
	mapError?: (error: unknown) => ORPCError<string, unknown> | null,
) => sharedStored("[classes]", step, run, mapError);

const channelColumns = {
	id: channel.id,
	name: channel.name,
	memo: channel.memo,
	url: channel.url,
};
const classificationColumns = {
	id: classification.id,
	kind: classification.kind,
	name: classification.name,
	memo: classification.memo,
};

// 채널·분류(T6). 소유자는 context.ownerId뿐이고 모든 조회·변경에 owner_id 조건을 건다.
// insert 값은 소유자를 마지막에 두고, update는 바꿀 칸만 적는다(입력 스키마가 바뀌어도 소유자가 덮이지 않게, 계획 리뷰 E8).
// 정렬은 화면이 한다(이름순, 스펙 3절)
export const classificationRouter = {
	channelList: protectedProcedure
		.output(z.array(channelListItemSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("채널 목록", () =>
				db
					.select({
						...channelColumns,
						// 연결은 소유자 검사를 거쳐서만 생기므로(savedVoiceLinks) 연결 행 수가 곧 내 담은 성우 수다.
						// $count는 상관 서브쿼리의 열 이름을 표 이름으로 한정한다(sql 템플릿은 "channel_id" = "id"로 나간다, 계획 리뷰 E3)
						voiceCount: db.$count(
							savedVoiceChannel,
							eq(savedVoiceChannel.channelId, channel.id),
						),
					})
					.from(channel)
					.where(eq(channel.ownerId, ownerId)),
			),
		),
	channelCreate: protectedProcedure
		.input(channelInputSchema)
		.output(channelSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored(
				"채널 만들기",
				async () => {
					const [row] = await db
						.insert(channel)
						.values({ ...input, ownerId })
						.returning(channelColumns);
					return found(row);
				},
				duplicateName,
			),
		),
	channelUpdate: protectedProcedure
		.input(channelUpdateInputSchema)
		.output(channelSchema)
		.handler(({ input: { id, name, memo, url }, context: { db, ownerId } }) =>
			stored(
				"채널 고치기",
				async () => {
					const [row] = await db
						.update(channel)
						.set({ name, memo, url })
						.where(and(eq(channel.id, id), eq(channel.ownerId, ownerId)))
						.returning(channelColumns);
					return found(row);
				},
				duplicateName,
			),
		),
	channelDelete: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("채널 지우기", async () => {
				const [row] = await db
					.delete(channel)
					.where(and(eq(channel.id, id), eq(channel.ownerId, ownerId)))
					.returning({ id: channel.id });
				found(row);
				return { deleted: true as const };
			}),
		),
	classificationList: protectedProcedure
		.output(z.array(classificationListItemSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("분류 목록", () =>
				db
					.select({
						...classificationColumns,
						voiceCount: db.$count(
							savedVoiceClassification,
							eq(savedVoiceClassification.classificationId, classification.id),
						),
					})
					.from(classification)
					.where(eq(classification.ownerId, ownerId)),
			),
		),
	classificationCreate: protectedProcedure
		.input(classificationCreateInputSchema)
		.output(classificationSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored(
				"분류 만들기",
				async () => {
					const [row] = await db
						.insert(classification)
						.values({ ...input, ownerId })
						.returning(classificationColumns);
					return found(row);
				},
				duplicateName,
			),
		),
	classificationUpdate: protectedProcedure
		.input(classificationUpdateInputSchema)
		.output(classificationSchema)
		.handler(({ input: { id, name, memo }, context: { db, ownerId } }) =>
			stored(
				"분류 고치기",
				async () => {
					const [row] = await db
						.update(classification)
						.set({ name, memo })
						.where(
							and(
								eq(classification.id, id),
								eq(classification.ownerId, ownerId),
							),
						)
						.returning(classificationColumns);
					return found(row);
				},
				duplicateName,
			),
		),
	classificationDelete: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("분류 지우기", async () => {
				const [row] = await db
					.delete(classification)
					.where(
						and(eq(classification.id, id), eq(classification.ownerId, ownerId)),
					)
					.returning({ id: classification.id });
				found(row);
				return { deleted: true as const };
			}),
		),
};
