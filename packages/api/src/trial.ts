import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";

import type { ProviderId } from "./providers/contract";
import { logFailure, trialError } from "./providers/errors";
import {
	type TrialAudio,
	type TrialFailure,
	type TrialItemInput,
	trialFailureSchema,
} from "./providers/trial-contract";
import {
	comboSignature,
	normalizeText,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_RESULTS_SHOWN,
	TRIAL_RESULTS_SHOWN,
	type TrialRequest,
	type Usage,
	usedSettings,
} from "./providers/trial-options";
import type { StudioItemInput, StudioResult } from "./studio-contract";
import { cacheKey, guard, logDbFailure } from "./voice-cache";

// 생성 기록과 결과(ADR 0003 '듣기 결과', T5 스펙 5절, T9 작업실). 모든 읽기·쓰기에 소유자 조건을 넣는다(prokit-api 불변식 3).
// 정리·옵션·조합 글자가 바뀌어 같은 요청이 다른 소리를 내게 되면 판을 올린다(옛 결과를 찾지 않는다). 작업실 키도 같은 판을 쓴다.
// 판을 올릴 때는 같은 마이그레이션에서 `delete from trial_generation where kind = 'trial'`로 내 문장 결과만 지운다. 목록(listResults)은 판을 거르지 않고
// 화면의 '저장된 결과' 판정(comboSignature)에는 판이 없어서, 옛 행이 남으면 '저장됨'인데 찾기가 못 찾는다(계획 리뷰 E13).
// 작업실 결과(유료, 최대 32MiB)는 지우지 않는다. 판이 바뀌면 studioFind만 못 찾고, 이전 결과 목록에 있는 줄은 화면이 id로 계속 연다(T9 계획 리뷰 E5).
// 화면의 판정(comboSignature)에도 판이 없어 최근 20개 안의 같은 서명은 옛 판이어도 '음성 만들기'가 '저장된 결과 열기'로 연다(다시 만들지 않아 돈은 안전하다). 이것이 문제가 되면 StudioItem에 판을 싣는다(계획 재리뷰 N1)
export const TRIAL_CONTRACT_VERSION = 1;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
// 함수 최대 실행 시간(ADR 0002: 300초)보다 오래 '만드는 중'이면 처리 여부를 모르는 것으로 옮긴다(tts-provider)
const STALE_PENDING_MS = 5 * 60 * 1000;
const t = trialGeneration;

// 생성 기록의 화면(T9 스펙 3절). 'trial' 내 문장 듣기, 'studio' 음성 작업실
export type Kind = "trial" | "studio";

// 목록 캐시와 같은 해시 함수를 쓴다(voice-cache cacheKey, 계획 리뷰 ponytail 12).
// 작업실은 kind를 넣어 같은 요청이라도 시험 생성과 키가 다르다(재사용·목록이 화면별로 나뉜다). 시험 생성 키는 T5 그대로 둔다(저장된 결과가 이어진다)
export const comboKey = (request: TrialRequest, kind: Kind = "trial") =>
	cacheKey(
		kind === "trial"
			? { v: TRIAL_CONTRACT_VERSION, sig: comboSignature(request) }
			: { v: TRIAL_CONTRACT_VERSION, kind, sig: comboSignature(request) },
	);

// Buffer(bytea)를 ArrayBuffer로 복사해 File로 만든다. 형식은 생성 기록의 audio_type이다(Gemini WAV, 나머지 MP3, T7.6)
export const audioFile = (bytes: Uint8Array, type: string) =>
	new File(
		[new Uint8Array(bytes)],
		type === "audio/wav" ? "trial.wav" : "trial.mp3",
		{ type },
	);
// 공급자가 돌려주는 오디오 형식. Gemini는 WAV뿐이다(MP3 없음, research 2절)
export const audioTypeOf = (provider: ProviderId) =>
	provider === "gemini" ? "audio/wav" : "audio/mpeg";

// DB가 실패하면 공급자를 부르지 않고 storage로 거절한다(로드맵 T5 메모). 의도한 거절(ORPCError)은 그대로 던진다
export async function withStorage<T>(
	provider: ProviderId | undefined,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		logDbFailure("[trial]", "저장소", error);
		throw trialError(provider, "storage");
	}
}

const resultColumns = {
	id: t.id,
	createdAt: t.createdAt,
	usageUnit: t.usageUnit,
	usageAmount: t.usageAmount,
	audio: t.audio,
	audioType: t.audioType,
};
type ResultRow = {
	id: string;
	createdAt: Date;
	usageUnit: string;
	usageAmount: number;
	audio: Buffer | null;
	audioType: string | null;
};
const usageOf = (row: Pick<ResultRow, "usageUnit" | "usageAmount">): Usage => ({
	unit: row.usageUnit as Usage["unit"],
	amount: row.usageAmount,
});
function toAudio(row: ResultRow): TrialAudio {
	if (!row.audio) throw new ORPCError("NOT_FOUND");
	return {
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		usage: usageOf(row),
		// T7.6 전 행은 모두 audio/mpeg로 저장돼 있다
		audio: audioFile(row.audio, row.audioType ?? "audio/mpeg"),
	};
}
const later = () => new Date(Date.now() + KEEP_MS);

type ExistingRow = ResultRow & {
	comboKey: string;
	status: string;
	failureReason: string | null;
};
export type Claim =
	| { kind: "claimed"; id: string; createdAt: string }
	| { kind: "existing"; row: ExistingRow };

async function requestRow(db: Database, ownerId: string, requestId: string) {
	const [row] = await db
		.select({
			...resultColumns,
			comboKey: t.comboKey,
			status: t.status,
			failureReason: t.failureReason,
		})
		.from(t)
		.where(and(eq(t.ownerId, ownerId), eq(t.requestId, requestId)))
		.limit(1);
	return row ?? null;
}

// 5분 넘은 진행 중인 같은 요청 id를 처리 여부 미확인으로 옮긴다(tts-provider). 재생 두 길(내 문장·작업실)이 함께 쓴다
const isStale = (row: { status: string; createdAt: Date }) =>
	row.status === "pending" &&
	row.createdAt.getTime() < Date.now() - STALE_PENDING_MS;
async function expireStale(db: Database, ownerId: string, requestId: string) {
	await db
		.update(t)
		.set({ status: "unknown" })
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.requestId, requestId),
				eq(t.status, "pending"),
				lt(t.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
			),
		);
}

// 새 요청의 대기 확인 전에 기존 요청 id만 재생한다. 오래된 pending은 먼저 unknown으로 옮긴다.
export async function replayRequest(
	db: Database,
	ownerId: string,
	requestId: string,
	key: string,
	provider: ProviderId,
): Promise<TrialAudio | null> {
	const existing = await requestRow(db, ownerId, requestId);
	if (!existing) return null;
	if (existing.comboKey !== key) throw trialError(provider, "request_mismatch");
	if (isStale(existing)) {
		await expireStale(db, ownerId, requestId);
		return replay(
			provider,
			(await requestRow(db, ownerId, requestId)) ?? existing,
		);
	}
	return replay(provider, existing);
}

// 공급자 호출 전에 요청 id를 선점한다(tts-provider 중복 과금). 충돌은 조회가 아니라 유니크 제약(요청 id, 소유자별 진행 중 하나)이 막는다
export async function claim(
	db: Database,
	input: {
		ownerId: string;
		requestId: string;
		request: TrialRequest;
		key: string;
		usage: Usage;
		kind?: Kind;
	},
): Promise<Claim> {
	const { ownerId, requestId, request, key, usage } = input;
	await db
		.update(t)
		.set({ status: "unknown" })
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.status, "pending"),
				lt(t.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
			),
		);
	const [row] = await db
		.insert(t)
		.values({
			ownerId,
			requestId,
			kind: input.kind ?? "trial",
			comboKey: key,
			provider: request.provider,
			voiceId: request.voiceId,
			model: request.settings.model,
			settings: usedSettings(request),
			text: normalizeText(request.text),
			usageAmount: usage.amount,
			usageUnit: usage.unit,
			status: "pending",
			expiresAt: later(),
		})
		// 대상 없이: 요청 id 유니크와 진행 중 부분 유니크 어느 쪽에 걸려도 넣지 않는다
		.onConflictDoNothing()
		.returning({ id: t.id, createdAt: t.createdAt });
	if (row)
		return {
			kind: "claimed",
			id: row.id,
			createdAt: row.createdAt.toISOString(),
		};
	const existing = await requestRow(db, ownerId, requestId);
	// 같은 요청 id가 없으면 진행 중인 다른 요청에 걸린 것이다
	if (!existing) throw trialError(request.provider, "in_progress");
	if (existing.comboKey !== key)
		throw trialError(request.provider, "request_mismatch");
	return { kind: "existing", row: existing };
}

// 같은 요청 id의 상태 판정(T5 규칙): 완료면 done(행), 진행 중은 in_progress, 미확인은 unknown_outcome, 실패는 그 사유
function replayStatus<
	R extends { status: string; failureReason: string | null },
	T,
>(provider: ProviderId, row: R, done: (row: R) => T): T {
	if (row.status === "done") return done(row);
	if (row.status === "pending") throw trialError(provider, "in_progress");
	if (row.status === "unknown") throw trialError(provider, "unknown_outcome");
	const reason: TrialFailure =
		trialFailureSchema.safeParse(row.failureReason).data ?? "provider_error";
	throw trialError(provider, reason);
}

// 같은 요청 id가 다시 왔다(재전송, 두 번 누름). 공급자를 다시 부르지 않고 그 행의 상태를 돌려준다
export function replay(provider: ProviderId, row: ExistingRow): TrialAudio {
	return replayStatus(provider, row, toAudio);
}

// id는 같은 요청의 선점에서 온 값이지만 소유자 조건을 함께 건다(prokit-api 불변식 3, 계획 리뷰 E12)
export async function complete(
	db: Database,
	ownerId: string,
	id: string,
	audio: Uint8Array,
	audioType: string,
) {
	await db
		.update(t)
		.set({
			status: "done",
			audio: Buffer.from(audio),
			audioType,
			expiresAt: later(),
		})
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId)));
}

export async function settle(
	db: Database,
	ownerId: string,
	id: string,
	status: "failed" | "unknown",
	reason: TrialFailure,
) {
	await db
		.update(t)
		.set({ status, failureReason: reason })
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId)));
}

// 만료 행 정리(새 결과를 쓸 때, cron 없음). 진행 중인 행은 남긴다
export async function sweep(db: Database, ownerId: string) {
	await db
		.delete(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				lt(t.expiresAt, new Date()),
				ne(t.status, "pending"),
			),
		);
}

// 저장된 결과(완료, 만료 전) 가운데 가장 최근 것. 오디오와 만료 연장은 audioOf 한 곳이 맡는다(계획 리뷰 ponytail 13)
export async function findSaved(db: Database, ownerId: string, key: string) {
	const [row] = await db
		.select({ id: t.id })
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.comboKey, key),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(1);
	return row ? audioOf(db, ownerId, row.id) : null;
}

// 성우 하나의 완료 결과(오디오 없음) 최신순. 설정은 저장한 정리 값이고 출력 스키마가 기본값을 채워 다시 검사한다
export async function listResults(
	db: Database,
	ownerId: string,
	provider: ProviderId,
	voiceId: string,
): Promise<TrialItemInput[]> {
	const rows = await db
		.select({
			id: t.id,
			createdAt: t.createdAt,
			usageUnit: t.usageUnit,
			usageAmount: t.usageAmount,
			text: t.text,
			settings: t.settings,
		})
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.kind, "trial"),
				eq(t.provider, provider),
				eq(t.voiceId, voiceId),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(TRIAL_RESULTS_SHOWN);
	return rows.map((row) => ({
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		usage: usageOf(row),
		request: {
			provider,
			voiceId,
			text: row.text,
			settings: row.settings,
		} as TrialItemInput["request"],
	}));
}

// 결과 하나의 오디오. 재생하면 만료를 30일 뒤로 늘린다. 남의 결과·없는 결과·만료는 NOT_FOUND(prokit-api 불변식 3).
// 시험 생성 결과만이다. 작업실 결과(최대 32MiB)는 한 번에 보내지 않고 audioPart로 나눈다(T9)
export async function audioOf(db: Database, ownerId: string, id: string) {
	const [row] = await db
		.update(t)
		.set({ expiresAt: later() })
		.where(
			and(
				eq(t.id, id),
				eq(t.ownerId, ownerId),
				eq(t.kind, "trial"),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.returning(resultColumns);
	if (!row) throw new ORPCError("NOT_FOUND");
	return toAudio(row);
}

// 결과 지우기(앱 DB에서만, 공급자는 건드리지 않는다). 진행 중인 행은 지우지 않는다. 화면은 자기 kind의 행만 지운다(T9)
export async function remove(
	db: Database,
	ownerId: string,
	id: string,
	kind: Kind = "trial",
): Promise<true> {
	const [row] = await db
		.delete(t)
		.where(
			and(
				eq(t.id, id),
				eq(t.ownerId, ownerId),
				eq(t.kind, kind),
				ne(t.status, "pending"),
			),
		)
		.returning({ id: t.id });
	if (!row) throw new ORPCError("NOT_FOUND");
	return true;
}

// ── 음성 작업실(T9 스펙 3절) ──
// 작업실 행. 부분 인덱스 trial_generation_studio와 같은 조건 글자로 쓴다(매개변수면 계획이 인덱스 조건을 증명하지 못할 수 있다)
const studioRow = sql`${t.kind} = 'studio'`;
const studioColumns = {
	id: t.id,
	createdAt: t.createdAt,
	usageUnit: t.usageUnit,
	usageAmount: t.usageAmount,
	// 오디오를 읽지 않고 길이만(미확인 행은 0)
	bytes: sql<number>`coalesce(octet_length(${t.audio}), 0)`.mapWith(Number),
};
const studioOf = (row: {
	id: string;
	createdAt: Date;
	usageUnit: string;
	usageAmount: number;
	bytes: number;
}): StudioResult => ({
	id: row.id,
	createdAt: row.createdAt.toISOString(),
	usage: usageOf(row),
	bytes: row.bytes,
});

// 같은 조합(작업실 키)의 완료 결과 가운데 가장 최근 것. 오디오는 화면이 조각으로 받고 0번 조각이 만료를 늘린다
export async function findStudio(
	db: Database,
	ownerId: string,
	key: string,
): Promise<StudioResult | null> {
	const [row] = await db
		.select(studioColumns)
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				studioRow,
				eq(t.comboKey, key),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(1);
	return row ? studioOf(row) : null;
}

// 이전 결과: 완료와 처리 여부 미확인 최근 20개(오디오 없음). 요청은 저장한 정리 값이고 출력 스키마가 기본값을 채워 다시 검사한다
export async function listStudio(
	db: Database,
	ownerId: string,
): Promise<StudioItemInput[]> {
	const rows = await db
		.select({
			...studioColumns,
			status: t.status,
			voiceId: t.voiceId,
			text: t.text,
			settings: t.settings,
		})
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				studioRow,
				inArray(t.status, ["done", "unknown"]),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(STUDIO_RESULTS_SHOWN);
	return rows.map((row) => ({
		...studioOf(row),
		status: row.status as "done" | "unknown",
		request: {
			provider: "typecast",
			voiceId: row.voiceId,
			text: row.text,
			settings: row.settings,
		} as StudioItemInput["request"],
	}));
}

// 결과 오디오의 조각 하나(3MiB). Postgres substring은 1부터 센다. 저장 방식이 EXTERNAL이라 이 조각의 TOAST 덩어리만 읽는다.
// 0번 조각(열기·내려받기의 시작)만 보관을 30일 뒤로 늘린다(T5 audioOf와 같다). 남의 것·없음·만료·완료 아님·범위 밖은 NOT_FOUND
export async function audioPart(
	db: Database,
	ownerId: string,
	id: string,
	part: number,
): Promise<File> {
	const where = and(
		eq(t.id, id),
		eq(t.ownerId, ownerId),
		studioRow,
		eq(t.status, "done"),
		gt(t.expiresAt, new Date()),
	);
	const fields = {
		chunk: sql<Buffer | null>`substring(${t.audio} from ${part * STUDIO_PART_BYTES + 1}::int for ${STUDIO_PART_BYTES}::int)`,
		audioType: t.audioType,
	};
	const [row] =
		part === 0
			? await db
					.update(t)
					.set({ expiresAt: later() })
					.where(where)
					.returning(fields)
			: await db.select(fields).from(t).where(where);
	if (!row?.chunk || row.chunk.length === 0) throw new ORPCError("NOT_FOUND");
	return audioFile(row.chunk, row.audioType ?? "audio/mpeg");
}

// 사용 이력(GLOSSARY): 작업실 생성이 성공한 때만 그 소유자의 담은 Typecast 성우에 +1(T9 스펙 3절). 보관함에서 빠졌으면 바뀌는 행이 없다
export async function recordUse(
	db: Database,
	ownerId: string,
	voiceId: string,
) {
	await db
		.update(savedVoice)
		.set({
			useCount: sql`${savedVoice.useCount} + 1`,
			lastUsedAt: sql`now()`,
		})
		.where(
			and(
				eq(savedVoice.ownerId, ownerId),
				eq(savedVoice.provider, "typecast"),
				eq(savedVoice.voiceId, voiceId),
			),
		);
}

// 작업실의 같은 요청 id 재생(replayRequest와 같은 규칙). 오디오 대신 길이만 읽는다(32MiB를 통째로 읽지 않는다, 계획 리뷰 P4·E3).
// 이번 작업실은 Typecast만이다(T10이 공급자를 넘긴다)
export async function replayStudio(
	db: Database,
	ownerId: string,
	requestId: string,
	key: string,
): Promise<StudioResult | null> {
	const find = async () => {
		const [row] = await db
			.select({
				...studioColumns,
				comboKey: t.comboKey,
				status: t.status,
				failureReason: t.failureReason,
			})
			.from(t)
			.where(and(eq(t.ownerId, ownerId), eq(t.requestId, requestId)))
			.limit(1);
		return row;
	};
	const existing = await find();
	if (!existing) return null;
	if (existing.comboKey !== key)
		throw trialError("typecast", "request_mismatch");
	if (!isStale(existing)) return replayStatus("typecast", existing, studioOf);
	await expireStale(db, ownerId, requestId);
	return replayStatus("typecast", (await find()) ?? existing, studioOf);
}

// 늦은 결과 저장: 시간 초과로 미확인이 된 그 소유자의 행만 완료로 바꾼다. 그사이 지웠거나 다른 상태면 바뀌는 행이 없다
async function completeLate(
	db: Database,
	ownerId: string,
	id: string,
	audio: Uint8Array,
): Promise<boolean> {
	const rows = await db
		.update(t)
		.set({
			status: "done",
			failureReason: null,
			audio: Buffer.from(audio),
			audioType: "audio/mpeg",
			expiresAt: later(),
		})
		// 작업실 행만(내 문장 미확인 행은 상한이 4MiB다, 계획 리뷰 E12)
		.where(
			and(
				eq(t.id, id),
				eq(t.ownerId, ownerId),
				studioRow,
				eq(t.status, "unknown"),
			),
		)
		.returning({ id: t.id });
	return rows.length > 0;
}

// 늦은 결과(T5-02, T9 스펙 2절). 성공이면 같은 기록을 완료로 바꾸고 사용 이력을 올린다. 실패·32MiB 초과는 미확인 그대로다.
// 부르는 쪽은 미확인 기록을 쓴 뒤에 부른다(미확인 행만 완료로 바꾸므로, 먼저 부르면 아직 진행 중인 행이라 늦은 결과를 잃는다). 던지지 않는다(로그 한 줄).
// shortcut: 서버 프로세스가 살아 있을 때만 받는다(로컬은 확실). 배포 환경은 응답 뒤 작업 유지(after)와 최대 실행 시간이 필요하다(로드맵 T15 메모)
export function saveLate(
	db: Database,
	ownerId: string,
	id: string,
	voiceId: string,
	late: Promise<Uint8Array>,
): Promise<void> {
	return late.then(
		async (audio) => {
			if (audio.byteLength > STUDIO_AUDIO_MAX) {
				console.error("[studio] 늦은 결과 버림: audio_too_large");
				return;
			}
			await guard(
				"늦은 결과 기록",
				async () => {
					if (await completeLate(db, ownerId, id, audio))
						await recordUse(db, ownerId, voiceId);
				},
				"[studio]",
			);
		},
		(error: unknown) => logFailure("[studio] 늦은 결과 실패", error, []),
	);
}
