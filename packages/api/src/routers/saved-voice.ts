import { ORPCError } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import {
	savedVoice,
	savedVoiceChannel,
	savedVoiceClassification,
} from "@tts-pilot-app/db/schema/saved-voice";
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { deletedSchema, deleteInputSchema } from "../classification-contract";
import type { Context } from "../context";
import { protectedProcedure } from "../index";
import {
	type ProviderErrorData,
	providerIdSchema,
	type Voice,
	voiceSchema,
} from "../providers/contract";
import type { ProviderClient } from "../providers/errors";
import { emptyVoice } from "../providers/list";
import {
	type SavedVoice,
	savedVoiceLinksInputSchema,
	savedVoiceSaveInputSchema,
	savedVoiceSchema,
} from "../saved-voice-contract";
import {
	cooldownOf,
	dbCode,
	found,
	guard,
	recordCooldown,
	stored,
} from "../voice-cache";

type Db = Context["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const PREFIX = "[savedVoice]";
// 연결 중 다른 탭에서 그 채널·분류가 지워지면 외래 키 위반이다. 없는 항목과 같게 NOT_FOUND(스펙 5절)
const goneLink = (error: unknown) =>
	dbCode(error) === "23503" ? new ORPCError("NOT_FOUND") : null;

type Row = typeof savedVoice.$inferSelect;

// 저장한 정보가 계약과 어긋나면(계약이 바뀐 옛 행) 이름 자리에 성우 id를 보인다. 다음 확인에서 새 값으로 바뀐다(스펙 3절)
export function voiceOf(row: Row): Voice {
	return (
		voiceSchema.safeParse(row.voice).data ?? {
			...emptyVoice(row.provider, row.source),
			voiceId: row.voiceId,
			name: row.voiceId,
		}
	);
}

// 담은 성우와 연결 id(내 성우의 연결만). ponytail: 연결은 성우 id 목록으로 한 번에 받아 JS로 나눈다(담은 성우는 수십 명)
async function listOf(
	db: Db | Tx,
	ownerId: string,
	id?: string,
): Promise<SavedVoice[]> {
	const rows = await db
		.select()
		.from(savedVoice)
		.where(
			id
				? and(eq(savedVoice.ownerId, ownerId), eq(savedVoice.id, id))
				: eq(savedVoice.ownerId, ownerId),
		)
		.orderBy(desc(savedVoice.savedAt));
	const ids = rows.map((row) => row.id);
	if (ids.length === 0) return [];
	const [channels, classes] = await Promise.all([
		db
			.select()
			.from(savedVoiceChannel)
			.where(inArray(savedVoiceChannel.savedVoiceId, ids)),
		db
			.select()
			.from(savedVoiceClassification)
			.where(inArray(savedVoiceClassification.savedVoiceId, ids)),
	]);
	return rows.map((row) => ({
		id: row.id,
		voice: voiceOf(row),
		favorite: row.favorite,
		frequent: row.frequent,
		memo: row.memo,
		unavailable: row.unavailable,
		channelIds: channels
			.filter((link) => link.savedVoiceId === row.id)
			.map((link) => link.channelId),
		classificationIds: classes
			.filter((link) => link.savedVoiceId === row.id)
			.map((link) => link.classificationId),
	}));
}

// 담기: 공급자 + 성우 id로 upsert(조회 후 삽입이 아니라 유니크 제약이 막는다, data-upsert).
// 새로 담기면 지금 확인한 것으로 본다(살아 있는 목록에서 담았다). 이미 있으면 정보·출처와 준 필드만 바꾸고 이용 가능 표시는 확인에 맡긴다
export async function upsert(
	db: Db | Tx,
	ownerId: string,
	voice: Voice,
	patch: { favorite?: boolean; frequent?: boolean; memo?: string | null },
): Promise<string> {
	const [row] = await db
		.insert(savedVoice)
		.values({
			provider: voice.provider,
			voiceId: voice.voiceId,
			source: voice.source,
			voice,
			...patch,
			checkedAt: new Date(),
			ownerId,
		})
		.onConflictDoUpdate({
			target: [savedVoice.ownerId, savedVoice.provider, savedVoice.voiceId],
			set: { voice, source: voice.source, ...patch },
		})
		.returning({ id: savedVoice.id });
	return found(row).id;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// 공급자마다 동시 2건, 한 번에 40명(스펙 3절, 계획 리뷰 E8). 한 건 10초는 runList가 끊는다.
// 최악: 한 공급자에 40명이 모두 시간 초과면 40 ÷ 2 × 10초 = 200초. 화면은 저장한 정보로 먼저 보여 기다리지 않는다
const CHECK_WORKERS = 2;
const CHECK_LIMIT = 40;
// Typecast SDK는 429의 Retry-After를 주지 않는다. 그때도 바로 다시 부르지 않게 1분을 적는다(계획 리뷰 E10).
// ponytail: 고정 1분. 공급자가 더 길게 막으면 다음 열 때 또 429를 받고 다시 1분이다
const DEFAULT_COOLDOWN_MS = 60_000;

// 이 사유면 그 공급자의 남은 행을 부르지 않는다. 대기 시각은 429에만 적는다
const STOPPING = new Set([
	"rate_limit",
	"provider_auth",
	"no_permission",
	"quota",
]);

// 행 샘플의 언어(ElevenLabs가 담을 때 고른 언어, 계획 리뷰 E14)
function sampleLanguage(voice: Voice): string | null {
	return (
		voice.samples.find((sample) => sample.url === voice.previewUrl)?.language ??
		null
	);
}

// 한 공급자의 확인. 429면 대기 시각을 적고 멈춘다. 다른 실패는 그 행을 그대로 둔다.
// ponytail: 실패한 행은 다음에 화면을 열 때 다시 부른다. 장애가 길어 자주 보이면 실패 때 checked_at을 1시간 뒤로 미룬다(계획 리뷰 E17)
async function checkProvider(
	db: Db,
	ownerId: string,
	provider: Voice["provider"],
	client: ProviderClient | undefined,
	rows: Row[],
): Promise<void> {
	const getVoice = client?.getVoice;
	if (!getVoice || rows.length === 0) return;
	const blocked = await guard(
		"대기 확인",
		() => cooldownOf(db, provider, new Date()),
		PREFIX,
	);
	if (blocked !== null) return;
	const queue = [...rows];
	let stopped = false;
	// 함수 선언이 아니라 화살표다: 위 getVoice 좁히기가 안에서도 남는다(계획 리뷰 E5)
	const worker = async () => {
		for (let row = queue.shift(); row && !stopped; row = queue.shift()) {
			const kept = voiceOf(row);
			let fresh: Voice | null;
			try {
				fresh = await getVoice(row.source, row.voiceId, sampleLanguage(kept));
			} catch (error) {
				const data = (error instanceof ORPCError ? error.data : undefined) as
					| Partial<ProviderErrorData>
					| undefined;
				if (!data?.reason) {
					// 메모·성우 정보·메시지는 남기지 않는다. 오류 이름만
					console.error(
						`${PREFIX} ${provider} 확인 실패: ${error instanceof Error ? error.name : typeof error}`,
					);
				} else if (STOPPING.has(data.reason)) {
					// 키·권한·잔액 문제도 그 공급자의 남은 행이 모두 같은 오류를 받는다
					stopped = true;
					if (data.reason === "rate_limit") {
						const until = data.retryAt
							? new Date(data.retryAt)
							: new Date(Date.now() + DEFAULT_COOLDOWN_MS);
						await guard(
							"대기 기록",
							() => recordCooldown(db, provider, until),
							PREFIX,
						);
					}
				}
				continue;
			}
			await stored(PREFIX, "확인 저장", () =>
				db
					.update(savedVoice)
					.set(
						fresh
							? { voice: fresh, unavailable: false, checkedAt: new Date() }
							: { unavailable: true, checkedAt: new Date() },
					)
					.where(
						and(eq(savedVoice.id, row.id), eq(savedVoice.ownerId, ownerId)),
					),
			);
		}
	};
	await Promise.all(Array.from({ length: CHECK_WORKERS }, worker));
}

// 성우 보관함(T7). 소유자는 context.ownerId뿐이고 모든 조회·변경과 연결 대상 선택에 owner_id 조건을 건다
export const savedVoiceRouter = {
	savedVoiceList: protectedProcedure
		.output(z.array(savedVoiceSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored(PREFIX, "목록", () => listOf(db, ownerId)),
		),
	savedVoiceCheck: protectedProcedure
		.output(z.array(savedVoiceSchema))
		.handler(async ({ context: { db, ownerId, providers } }) => {
			const rows = await stored(PREFIX, "확인 대상", () =>
				db
					.select()
					.from(savedVoice)
					.where(
						and(
							eq(savedVoice.ownerId, ownerId),
							or(
								isNull(savedVoice.checkedAt),
								lt(savedVoice.checkedAt, new Date(Date.now() - DAY_MS)),
							),
							// ElevenLabs 공개 라이브러리 성우는 한 명 조회 방법이 없다('스펙과 다른 점' 2)
							or(
								ne(savedVoice.provider, "elevenlabs"),
								ne(savedVoice.source, "public"),
							),
						),
					)
					.orderBy(sql`${savedVoice.checkedAt} asc nulls first`)
					.limit(CHECK_LIMIT),
			);
			// 공급자끼리는 서로 기다리지 않는다(한 공급자의 장애가 다른 공급자를 막지 않는다, REQ-02)
			await Promise.all(
				providerIdSchema.options.map((provider) =>
					checkProvider(
						db,
						ownerId,
						provider,
						providers?.[provider],
						rows.filter((row) => row.provider === provider),
					),
				),
			);
			return stored(PREFIX, "목록", () => listOf(db, ownerId));
		}),
	savedVoiceSave: protectedProcedure
		.input(savedVoiceSaveInputSchema)
		.output(savedVoiceSchema)
		.handler(({ input: { voice, ...patch }, context: { db, ownerId } }) =>
			stored(PREFIX, "담기", async () => {
				const id = await upsert(db, ownerId, voice, patch);
				return found((await listOf(db, ownerId, id))[0]);
			}),
		),
	savedVoiceLinks: protectedProcedure
		.input(savedVoiceLinksInputSchema)
		.output(savedVoiceSchema)
		.handler(
			({
				input: { voice, channelIds, classificationIds },
				context: { db, ownerId },
			}) =>
				stored(
					PREFIX,
					"연결",
					() =>
						db.transaction(async (tx) => {
							const id = await upsert(tx, ownerId, voice, {});
							// 붙일 항목은 내 것만 센다. 센 수가 준 수와 다르면(없거나 남의 것) 아무것도 바꾸지 않는다(트랜잭션 되돌림)
							const [mineChannels, mineClasses] = await Promise.all([
								channelIds.length === 0
									? 0
									: tx.$count(
											channel,
											and(
												eq(channel.ownerId, ownerId),
												inArray(channel.id, channelIds),
											),
										),
								classificationIds.length === 0
									? 0
									: tx.$count(
											classification,
											and(
												eq(classification.ownerId, ownerId),
												inArray(classification.id, classificationIds),
											),
										),
							]);
							if (
								mineChannels !== channelIds.length ||
								mineClasses !== classificationIds.length
							)
								throw new ORPCError("NOT_FOUND");
							await tx
								.delete(savedVoiceChannel)
								.where(eq(savedVoiceChannel.savedVoiceId, id));
							await tx
								.delete(savedVoiceClassification)
								.where(eq(savedVoiceClassification.savedVoiceId, id));
							if (channelIds.length > 0)
								await tx.insert(savedVoiceChannel).values(
									channelIds.map((channelId) => ({
										savedVoiceId: id,
										channelId,
									})),
								);
							if (classificationIds.length > 0)
								await tx.insert(savedVoiceClassification).values(
									classificationIds.map((classificationId) => ({
										savedVoiceId: id,
										classificationId,
									})),
								);
							return found((await listOf(tx, ownerId, id))[0]);
						}),
					goneLink,
				),
		),
	savedVoiceRemove: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored(PREFIX, "빼기", async () => {
				const [row] = await db
					.delete(savedVoice)
					.where(and(eq(savedVoice.id, id), eq(savedVoice.ownerId, ownerId)))
					.returning({ id: savedVoice.id });
				found(row);
				return { deleted: true as const };
			}),
		),
};
