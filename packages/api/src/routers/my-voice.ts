// packages/api/src/routers/my-voice.ts
import { createHash } from "node:crypto";

import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { and, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
	type CloneProvider,
	CONSENT_VERSION,
	cloneLengthProblem,
	type MyVoice,
	myVoiceCreateInputSchema,
	myVoiceIdInputSchema,
	myVoiceListSchema,
	myVoiceSchema,
} from "../my-voice-contract";
import type { Voice } from "../providers/contract";
import { type CloneResult, trialError } from "../providers/errors";
import { emptyVoice } from "../providers/list";
import type { TrialErrorData } from "../providers/trial-contract";
import { withStorage } from "../trial";
import {
	cacheKey,
	cooldownOf,
	found,
	guard,
	recordCooldown,
} from "../voice-cache";
import { readCloneWav } from "../wav";
import { upsert } from "./saved-voice";

// 내 보이스(T13 계획 2.3). 모든 프로시저는 protectedProcedure, 소유자는 context.ownerId뿐이고 모든 select·update·delete에 owner_id를 건다.
// 상태 전이는 기대 상태 조건이 붙은 update다(바뀐 행이 없으면 지금 행을 돌려준다). 잠금 순서는 모든 길에서 my_voice → saved_voice다.
// 로그는 [myVoice] 공급자 사유뿐이다(원본 바이트·base64·응답 본문·공급자 id를 남기지 않는다)
const PREFIX = "[myVoice]";
const m = myVoice;
type Row = typeof myVoice.$inferSelect;
// 함수 최대 실행 시간(ADR 0002: 300초)보다 오래 '보내는 중'이면 처리 여부를 모른다(trial.ts와 같다)
const STALE_SENDING_MS = 5 * 60 * 1000;
// Retry-After가 없는 429(시험 생성과 같은 기본 60초)
const DEFAULT_COOLDOWN_MS = 60_000;

const mine = (ownerId: string, id: string) =>
	and(eq(m.id, id), eq(m.ownerId, ownerId));
const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");
// 내 보이스 전용 입력 거절(원본 형식·길이·동의 녹음 없음). 화면이 사유로 문구를 고른다
const badAudio = (provider: CloneProvider, reason: string) =>
	new ORPCError("BAD_REQUEST", { data: { provider, reason } });

// 보관함에 담는 값이자 목록의 voice(ready 행). 샘플·설명 없음
const cloneVoice = (row: Row): Voice => ({
	...emptyVoice(row.provider, "account"),
	voiceId: row.providerVoiceId as string,
	name: row.name,
	origin: "own",
	description: null,
});

// 5분 지난 내 sending을 처리 여부 미확인으로 옮긴다(목록·만들기)
const expireSending = (db: Database, ownerId: string) =>
	db
		.update(m)
		.set({ status: "unknown", reason: "unknown_outcome" })
		.where(
			and(
				eq(m.ownerId, ownerId),
				eq(m.status, "sending"),
				lt(m.createdAt, new Date(Date.now() - STALE_SENDING_MS)),
			),
		);

// 목록 줄. 보관함 행은 (소유자, 공급자, 공급자 id)로 찾고 프리셋은 그 행을 쓰는 이름들이다
async function itemsOf(
	db: Database,
	ownerId: string,
	id?: string,
): Promise<MyVoice[]> {
	const rows = await db
		.select({
			row: m,
			savedVoiceId: savedVoice.id,
			presets: sql<
				string[]
			>`coalesce(array_agg(${voicePreset.name} order by ${voicePreset.name}) filter (where ${voicePreset.id} is not null), '{}')`,
		})
		.from(m)
		.leftJoin(
			savedVoice,
			and(
				eq(savedVoice.ownerId, m.ownerId),
				eq(savedVoice.provider, m.provider),
				eq(savedVoice.voiceId, m.providerVoiceId),
			),
		)
		.leftJoin(
			voicePreset,
			and(
				eq(voicePreset.savedVoiceId, savedVoice.id),
				eq(voicePreset.ownerId, m.ownerId),
			),
		)
		.where(id ? mine(ownerId, id) : eq(m.ownerId, ownerId))
		.groupBy(m.id, savedVoice.id)
		.orderBy(desc(m.createdAt));
	return rows.map(({ row, savedVoiceId, presets }) => ({
		id: row.id,
		// 계약이 받는 공급자만 만들어진다(출력 스키마가 다시 검사한다)
		provider: row.provider as CloneProvider,
		name: row.name,
		status: row.status,
		reason: row.reason,
		createdAt: row.createdAt.toISOString(),
		savedVoiceId,
		voice:
			row.status === "ready" && row.providerVoiceId ? cloneVoice(row) : null,
		presets,
	}));
}
const one = async (db: Database, ownerId: string, id: string) =>
	found((await itemsOf(db, ownerId, id))[0]);

async function rowOf(db: Database, ownerId: string, id: string) {
	const [row] = await db.select().from(m).where(mine(ownerId, id));
	return found(row);
}

// 같은 요청 id의 행. 입력이 다르면 request_mismatch, 같으면 그 행 그대로(공급자 0회)
async function replayed(
	db: Database,
	ownerId: string,
	requestId: string,
	fingerprint: string,
	provider: CloneProvider,
): Promise<MyVoice | null> {
	const [row] = await db
		.select({ id: m.id, fingerprint: m.fingerprint })
		.from(m)
		.where(and(eq(m.ownerId, ownerId), eq(m.requestId, requestId)));
	if (!row) return null;
	if (row.fingerprint !== fingerprint)
		throw trialError(provider, "request_mismatch");
	return one(db, ownerId, row.id);
}

// 만들기 결과 저장: sending일 때만 바꾸고 ready면 같은 트랜잭션에서 보관함에 담는다
function saveResult(
	db: Database,
	ownerId: string,
	id: string,
	result: CloneResult,
) {
	const { state } = result;
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(m)
			.set({
				status: state,
				providerVoiceId: result.voiceId,
				reason: state === "failed" ? (result.reason ?? "quality") : null,
			})
			.where(and(mine(ownerId, id), eq(m.status, "sending")))
			.returning();
		if (row?.status === "ready") await upsert(tx, ownerId, cloneVoice(row), {});
	});
}

// 공급자 오류: 미확인은 unknown, 그 밖은 failed(사유), 429는 대기 시각. 행 상태를 남기고 오류를 그대로 던진다(화면이 사유를 받는다)
async function recordCreateFailure(
	db: Database,
	ownerId: string,
	id: string,
	provider: CloneProvider,
	error: unknown,
): Promise<Error> {
	const failure =
		error instanceof ORPCError
			? error
			: trialError(provider, "unknown_outcome");
	const data = failure.data as Partial<TrialErrorData> | undefined;
	const reason = data?.reason ?? "provider_error";
	await guard(
		"실패 기록",
		() =>
			db
				.update(m)
				.set({
					status: reason === "unknown_outcome" ? "unknown" : "failed",
					reason,
				})
				.where(and(mine(ownerId, id), eq(m.status, "sending"))),
		PREFIX,
	);
	if (reason === "rate_limit")
		await recordRateLimit(db, provider, data?.retryAt);
	return failure;
}

// 공급자 429의 대기 시각(없으면 60초)을 적는다. 쓰기 실패는 로그만 남긴다(만들기·지우기)
const recordRateLimit = (
	db: Database,
	provider: CloneProvider,
	retryAt: string | undefined,
) =>
	guard(
		"대기 쓰기",
		() =>
			recordCooldown(
				db,
				provider,
				new Date(retryAt ?? Date.now() + DEFAULT_COOLDOWN_MS),
			),
		PREFIX,
	);

export const myVoiceRouter = {
	myVoiceList: protectedProcedure
		.output(myVoiceListSchema)
		.handler(async ({ context: { db, ownerId, providers } }) => ({
			items: await withStorage(
				undefined,
				async () => {
					await expireSending(db, ownerId);
					return itemsOf(db, ownerId);
				},
				PREFIX,
			),
			providers: {
				fish_audio: Boolean(providers?.fish_audio?.cloneCreate),
				gemini: Boolean(providers?.gemini?.cloneCreate),
			},
		})),
	myVoiceCreate: protectedProcedure
		.input(myVoiceCreateInputSchema)
		.output(myVoiceSchema)
		.handler(async ({ input, context }) => {
			const { db, ownerId } = context;
			const { provider, requestId, name } = input;
			const cloneCreate = context.providers?.[provider]?.cloneCreate;
			if (!cloneCreate) throw trialError(provider, "no_key");
			const source = new Uint8Array(await input.source.arrayBuffer());
			const consent = input.consentAudio
				? new Uint8Array(await input.consentAudio.arrayBuffer())
				: null;
			const fingerprint = cacheKey({
				provider,
				name,
				source: sha256(source),
				consent: consent && sha256(consent),
			});
			// 같은 요청 id는 대기 시각보다 먼저 재생한다(tts-provider T5 순서)
			const existing = await withStorage(
				provider,
				() => replayed(db, ownerId, requestId, fingerprint, provider),
				PREFIX,
			);
			if (existing) return existing;
			const until = await withStorage(
				provider,
				() => cooldownOf(db, provider, new Date()),
				PREFIX,
			);
			if (until)
				throw trialError(provider, "rate_limit", {
					retryAt: until.toISOString(),
				});
			// 서버 바이트 검사(브라우저 WAV를 믿지 않는다, ADR 0011)
			const seconds = readCloneWav(source);
			if (seconds === null) throw badAudio(provider, "audio_format");
			if (cloneLengthProblem(provider, "source", seconds))
				throw badAudio(provider, "audio_length");
			if (provider === "gemini") {
				if (!consent) throw badAudio(provider, "consent_audio_missing");
				const consentSeconds = readCloneWav(consent);
				if (consentSeconds === null) throw badAudio(provider, "audio_format");
				if (cloneLengthProblem("gemini", "consent", consentSeconds))
					throw badAudio(provider, "audio_length");
			}
			// 선점: 요청 id 유니크와 소유자별 sending 하나(부분 유니크)가 막는다. 조회가 아니라 insert로 막는다(tts-provider)
			const claimed = await withStorage(
				provider,
				async () => {
					await expireSending(db, ownerId);
					const [row] = await db
						.insert(m)
						.values({
							provider,
							name,
							status: "sending",
							requestId,
							fingerprint,
							consentAt: new Date(),
							consentVersion: CONSENT_VERSION,
							ownerId,
						})
						.onConflictDoNothing()
						.returning({ id: m.id });
					if (row) return row.id;
					// 같은 요청 id가 동시에 들어왔으면 그 행, 아니면 다른 만들기가 진행 중이다
					const same = await replayed(
						db,
						ownerId,
						requestId,
						fingerprint,
						provider,
					);
					if (same) return same;
					throw trialError(provider, "in_progress");
				},
				PREFIX,
			);
			if (typeof claimed !== "string") return claimed;
			let result: CloneResult;
			try {
				// 자동 재시도 없음(runTrial). Gemini만 동의 녹음을 보낸다
				result = await cloneCreate(
					{
						name,
						source,
						...(provider === "gemini" && consent ? { consent } : {}),
					},
					{},
				);
			} catch (error) {
				throw await recordCreateFailure(db, ownerId, claimed, provider, error);
			}
			// 저장하지 못하면 행은 sending으로 남아 5분 뒤 unknown이 된다(스펙 8절). 공급자를 다시 부르지 않는다
			const saved = await guard(
				"결과 기록",
				async () => {
					await saveResult(db, ownerId, claimed, result);
					return true;
				},
				PREFIX,
			);
			if (!saved) throw trialError(provider, "unknown_outcome");
			return withStorage(provider, () => one(db, ownerId, claimed), PREFIX);
		}),
	// processing일 때만 공급자 조회(무료). ready면 보관함에 담고, 공급자에 없으면 failed(not_found)
	myVoiceCheck: protectedProcedure
		.input(myVoiceIdInputSchema)
		.output(myVoiceSchema)
		.handler(async ({ input: { id }, context }) => {
			const { db, ownerId } = context;
			const row = await withStorage(
				undefined,
				() => rowOf(db, ownerId, id),
				PREFIX,
			);
			const provider = row.provider as CloneProvider;
			if (row.status !== "processing" || !row.providerVoiceId)
				return withStorage(provider, () => one(db, ownerId, id), PREFIX);
			const cloneGet = context.providers?.[provider]?.cloneGet;
			if (!cloneGet) throw trialError(provider, "no_key");
			// 429 대기 중이면 공급자를 부르지 않는다(만들기·지우기와 같은 대기 표)
			const until = await withStorage(
				provider,
				() => cooldownOf(db, provider, new Date()),
				PREFIX,
			);
			if (until)
				throw trialError(provider, "rate_limit", {
					retryAt: until.toISOString(),
				});
			// 429면 대기 시각을 적고 그대로 던진다(다음 확인이 공급자를 부르지 않게)
			const got = await cloneGet(row.providerVoiceId).catch(async (error) => {
				const data =
					error instanceof ORPCError
						? (error.data as Partial<TrialErrorData> | undefined)
						: undefined;
				if (data?.reason === "rate_limit")
					await recordRateLimit(db, provider, data.retryAt);
				throw error;
			});
			if (got?.state !== "processing") {
				const next =
					got === null
						? { status: "failed" as const, reason: "not_found" }
						: got.state === "ready"
							? { status: "ready" as const, reason: null }
							: { status: "failed" as const, reason: "quality" };
				await withStorage(
					provider,
					() =>
						db.transaction(async (tx) => {
							// 그사이 지우기가 시작됐으면 바뀌는 행이 없다(지우기가 이긴다)
							const [moved] = await tx
								.update(m)
								.set(next)
								.where(and(mine(ownerId, id), eq(m.status, "processing")))
								.returning();
							if (moved?.status === "ready")
								await upsert(tx, ownerId, cloneVoice(moved), {});
						}),
					PREFIX,
				);
			}
			return withStorage(provider, () => one(db, ownerId, id), PREFIX);
		}),
	// 지우기와 목록에서 치우기. 공급자 id가 있으면 공급자 DELETE(404는 성공), 없으면(unknown, id 없는 failed) 행만 지운다
	myVoiceDelete: protectedProcedure
		.input(myVoiceIdInputSchema)
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ input: { id }, context }) => {
			const { db, ownerId } = context;
			const row = await withStorage(
				undefined,
				() => rowOf(db, ownerId, id),
				PREFIX,
			);
			const provider = row.provider as CloneProvider;
			if (row.status === "sending")
				throw new ORPCError("CONFLICT", {
					data: { provider, reason: "in_progress" },
				});
			const voiceId = row.providerVoiceId;
			if (!voiceId) {
				await withStorage(
					provider,
					async () =>
						found(
							(
								await db
									.delete(m)
									.where(
										and(
											mine(ownerId, id),
											isNull(m.providerVoiceId),
											ne(m.status, "sending"),
										),
									)
									.returning({ id: m.id })
							)[0],
						),
					PREFIX,
				);
				return { deleted: true as const };
			}
			const cloneDelete = context.providers?.[provider]?.cloneDelete;
			if (!cloneDelete) throw trialError(provider, "no_key");
			// 429 대기 중이면 공급자를 부르지 않고 행도 바꾸지 않는다(만들기와 같은 대기 표)
			const until = await withStorage(
				provider,
				() => cooldownOf(db, provider, new Date()),
				PREFIX,
			);
			if (until)
				throw trialError(provider, "rate_limit", {
					retryAt: until.toISOString(),
				});
			const savedOf = and(
				eq(savedVoice.ownerId, ownerId),
				eq(savedVoice.provider, provider),
				eq(savedVoice.voiceId, voiceId),
			);
			// 1: deleting으로 바꾸고 보관함 행을 이용 불가로(새 합성을 막는다)
			await withStorage(
				provider,
				() =>
					db.transaction(async (tx) => {
						const [moved] = await tx
							.update(m)
							.set({ status: "deleting", reason: null })
							.where(
								and(
									mine(ownerId, id),
									inArray(m.status, [
										"ready",
										"processing",
										"deleting",
										"failed",
									]),
								),
							)
							.returning({ id: m.id });
						found(moved);
						await tx
							.update(savedVoice)
							.set({ unavailable: true })
							.where(savedOf);
					}),
				PREFIX,
			);
			try {
				await cloneDelete(voiceId);
			} catch (error) {
				// 실패·미확인이면 사유만 적고 삭제 대기로 둔다(다시 시도). 429는 대기 시각도 적는다
				const data =
					error instanceof ORPCError
						? (error.data as Partial<TrialErrorData> | undefined)
						: undefined;
				const reason = data?.reason ?? "unknown_outcome";
				await guard(
					"삭제 실패 기록",
					() =>
						db
							.update(m)
							.set({ reason })
							.where(and(mine(ownerId, id), eq(m.status, "deleting"))),
					PREFIX,
				);
				if (reason === "rate_limit")
					await recordRateLimit(db, provider, data?.retryAt);
				throw error instanceof ORPCError
					? error
					: trialError(provider, "unknown_outcome");
			}
			// 2: my_voice를 먼저 지우고(잠금 순서) 보관함 행을 지운다(프리셋 set null, 분류·채널 cascade)
			await withStorage(
				provider,
				() =>
					db.transaction(async (tx) => {
						await tx
							.delete(m)
							.where(and(mine(ownerId, id), eq(m.status, "deleting")));
						await tx.delete(savedVoice).where(savedOf);
					}),
				PREFIX,
			);
			return { deleted: true as const };
		}),
	// 보관함에서 뺀 ready 클론을 다시 담는다. 행을 for update로 잡아 지우기와 겹쳐도 보관함 행이 다시 생기지 않게 한다
	myVoiceSave: protectedProcedure
		.input(myVoiceIdInputSchema)
		.output(myVoiceSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			withStorage(
				undefined,
				async () => {
					await db.transaction(async (tx) => {
						const [row] = await tx
							.select()
							.from(m)
							.where(and(mine(ownerId, id), eq(m.status, "ready")))
							.for("update");
						await upsert(tx, ownerId, cloneVoice(found(row)), {});
					});
					return one(db, ownerId, id);
				},
				PREFIX,
			),
		),
};
