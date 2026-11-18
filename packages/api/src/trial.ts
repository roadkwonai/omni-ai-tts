import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "./context";
import { parseJsonReply, type Suggestion } from "./drama-acting";
import type { DramaItemInput } from "./drama-contract";
import {
	DRAMA_RESULTS_SHOWN,
	type DramaRequest,
	type DramaScript,
	type LineSpan,
} from "./drama-script";
import type { ProviderId } from "./providers/contract";
import { logFailure, trialError } from "./providers/errors";
import {
	type TrialAudio,
	type TrialErrorData,
	type TrialFailure,
	type TrialFound,
	type TrialItemInput,
	trialFailureSchema,
} from "./providers/trial-contract";
import {
	comboSignature,
	normalizeText,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	TRIAL_RESULTS_SHOWN,
	type TrialRequest,
	type Usage,
	usedSettings,
} from "./providers/trial-options";
import type { StudioFound, StudioResult } from "./studio-contract";
import { cacheKey, guard, logDbFailure, recordCooldown } from "./voice-cache";

// 생성 기록과 결과(ADR 0003 '듣기 결과', T5 스펙 5절, T9 작업실). 모든 읽기·쓰기에 소유자 조건을 넣는다(prokit-api 불변식 3).
// 정리·옵션·조합 글자가 바뀌어 같은 요청이 다른 소리를 내게 되면 판을 올린다(옛 결과를 찾지 않는다). 작업실 키도 같은 판을 쓴다.
// 판을 올릴 때는 같은 마이그레이션에서 `delete from trial_generation where kind = 'trial'`로 내 문장 결과만 지운다. 목록(listResults)은 판을 거르지 않고
// 화면의 '저장된 결과' 판정(comboSignature)에는 판이 없어서, 옛 행이 남으면 '저장됨'인데 찾기가 못 찾는다(계획 리뷰 E13).
// 작업실 결과(유료, 최대 32MiB)는 지우지 않는다. 판이 바뀌면 studioFind·studioFindMany가 옛 결과를 찾지 못한다(T9 계획 리뷰 E5).
export const TRIAL_CONTRACT_VERSION = 1;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
// 함수 최대 실행 시간(ADR 0002: 300초)보다 오래 '만드는 중'이면 처리 여부를 모르는 것으로 옮긴다(tts-provider)
const STALE_PENDING_MS = 5 * 60 * 1000;
const t = trialGeneration;

// 생성 기록의 화면(T9 스펙 3절). 'trial' 내 문장 듣기, 'studio' 음성 작업실, 'drama' 드라마 작업실(T9.5)
export type Kind = "trial" | "studio" | "drama";

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
	prefix = "[trial]",
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		logDbFailure(prefix, "저장소", error);
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

// 선점할 행의 내용. 드라마 행은 대본(script)을 더 쓴다
type ClaimFields = {
	kind: Kind;
	voiceId: string;
	model: string;
	settings: Record<string, unknown>;
	text: string;
	script?: DramaScript;
};

// 공급자 호출 전에 요청 id를 선점한다(tts-provider 중복 과금). 충돌은 조회가 아니라 유니크 제약(요청 id, 소유자별 진행 중 하나)이 막는다
export async function claimRow(
	db: Database,
	input: {
		ownerId: string;
		requestId: string;
		key: string;
		usage: Usage;
		provider: ProviderId;
		fields: ClaimFields;
	},
): Promise<Claim> {
	const { ownerId, requestId, key, usage, provider } = input;
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
			...input.fields,
			ownerId,
			requestId,
			comboKey: key,
			provider,
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
	if (!existing) throw trialError(provider, "in_progress");
	if (existing.comboKey !== key) throw trialError(provider, "request_mismatch");
	return { kind: "existing", row: existing };
}

// 성우 하나의 요청(내 문장 듣기·음성 작업실)을 선점한다
export function claim(
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
	const { request, kind = "trial", ...rest } = input;
	return claimRow(db, {
		...rest,
		provider: request.provider,
		fields: {
			kind,
			voiceId: request.voiceId,
			model: request.settings.model,
			settings: usedSettings(request),
			text: normalizeText(request.text),
		},
	});
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

// 오디오를 쓰는 완료 질의만 시간 제한 20초(운영 Neon 싱가포르 32MiB 한 행 쓰기 6.8~10.7초, T15-a Task 0). 다른 질의는 풀 기본 3초(T4) 그대로다
export const AUDIO_WRITE_TIMEOUT_MS = 20_000;
// drizzle은 질의마다 pg 설정을 넘기지 않아 만든 SQL을 풀에 직접 보낸다. pg 8.23 client.query가 config.query_timeout을 읽는다(@types/pg QueryConfig에는 없어 변수로 넘긴다)
function writeAudio(
	db: Database,
	query: { toSQL(): { sql: string; params: unknown[] } },
) {
	const { sql: text, params: values } = query.toSQL();
	const config = { text, values, query_timeout: AUDIO_WRITE_TIMEOUT_MS };
	return db.$client.query(config);
}

// id는 같은 요청의 선점에서 온 값이지만 소유자 조건을 함께 건다(prokit-api 불변식 3, 계획 리뷰 E12).
// segments는 드라마 줄 구간이다. 넘기지 않으면 칸을 건드리지 않는다(선점 때 null)
export async function complete(
	db: Database,
	ownerId: string,
	id: string,
	audio: Uint8Array,
	audioType: string,
	segments?: LineSpan[] | null,
) {
	await writeAudio(
		db,
		db
			.update(t)
			.set({
				status: "done",
				audio: Buffer.from(audio),
				audioType,
				segments,
				expiresAt: later(),
			})
			.where(and(eq(t.id, id), eq(t.ownerId, ownerId))),
	);
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

// 생성 실패 기록(E7, 내 문장·작업실·드라마가 함께 쓴다). 미확인 또는 실패를 적고 429면 대기 시각을 적은 뒤 던질 오류를 돌려준다.
// runTrial이 모든 실패를 사유 있는 ORPCError로 바꾼다. 아닌 예외는 응답을 받았는지 모르므로 처리 여부 미확인으로 기록하고 원래 오류는 던지지 않는다(T5 계획 리뷰 E1).
// 늦은 결과(saveLate)는 받지 않는다. 부르는 쪽이 이 함수가 끝난 뒤(미확인을 적은 뒤)에 넘긴다
export async function recordFailure(
	db: Database,
	target: { ownerId: string; id: string; provider: ProviderId; prefix: string },
	error: unknown,
): Promise<Error> {
	const { ownerId, id, provider, prefix } = target;
	if (!(error instanceof ORPCError))
		logFailure(`${prefix} ${provider} 생성 실패`, error, []);
	const failure =
		error instanceof ORPCError
			? error
			: trialError(provider, "unknown_outcome");
	const data = failure.data as Partial<TrialErrorData> | undefined;
	const reason = data?.reason ?? "provider_error";
	await guard(
		"실패 기록",
		() =>
			settle(
				db,
				ownerId,
				id,
				reason === "unknown_outcome" ? "unknown" : "failed",
				reason,
			),
		prefix,
	);
	const retryAt = data?.retryAt;
	if (reason === "rate_limit" && retryAt) {
		await guard(
			"대기 쓰기",
			() => recordCooldown(db, provider, new Date(retryAt)),
			prefix,
		);
	}
	return failure;
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

// 저장된 결과(내 문장, 완료·만료 전) 가운데 가장 최근 것. 조회 조건은 findMany 한 곳이고(T9.5 리뷰 ponytail 9), 오디오와 만료 연장은 audioOf 한 곳이 맡는다(계획 리뷰 ponytail 13)
export async function findSaved(db: Database, ownerId: string, key: string) {
	const [hit] = await findMany(db, ownerId, [key]);
	return hit ? audioOf(db, ownerId, hit.id) : null;
}

// 여러 키의 저장된 결과(내 문장, 완료·미만료)를 한 번에 찾는다. 키마다 가장 최근 것, 순서 그대로, 없으면 null.
// 오디오를 읽지 않고 보관 기한도 늘리지 않는다(소리를 받을 때 audioOf가 늘린다)
export async function findMany(
	db: Database,
	ownerId: string,
	keys: readonly string[],
): Promise<(TrialFound | null)[]> {
	const rows = await db
		.select({
			id: t.id,
			createdAt: t.createdAt,
			usageUnit: t.usageUnit,
			usageAmount: t.usageAmount,
			comboKey: t.comboKey,
		})
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.kind, "trial"),
				inArray(t.comboKey, keys),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt));
	const latest = new Map<string, TrialFound>();
	for (const row of rows)
		if (!latest.has(row.comboKey))
			latest.set(row.comboKey, {
				id: row.id,
				createdAt: row.createdAt.toISOString(),
				usage: usageOf(row),
			});
	return keys.map((key) => latest.get(key) ?? null);
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

// 여러 키의 저장된 작업실 결과를 한 번에 찾는다(완료·미확인, 미만료). 키마다 완료가 있으면 가장 최근 완료, 없으면 가장 최근 미확인.
// 오디오를 읽지 않고 보관 기한도 늘리지 않는다. 키는 호출자가 200개 이하로 막는다
export async function findStudioMany(
	db: Database,
	ownerId: string,
	keys: readonly string[],
): Promise<(StudioFound | null)[]> {
	const rows = await db
		.select({ ...studioColumns, comboKey: t.comboKey, status: t.status })
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				studioRow,
				inArray(t.comboKey, keys),
				inArray(t.status, ["done", "unknown"]),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt));
	const best = new Map<string, StudioFound>();
	for (const row of rows) {
		const status = row.status === "done" ? "done" : "unknown";
		const held = best.get(row.comboKey);
		// 최신순이라 처음 본 것이 가장 최근이다. 미확인이 잡혀 있을 때만 완료가 이긴다
		if (held && (held.status === "done" || status === "unknown")) continue;
		best.set(row.comboKey, { ...studioOf(row), status });
	}
	return keys.map((key) => best.get(key) ?? null);
}

// ── 드라마 작업실(T9.5) ──
// 같은 요청 id 판정 키: 정리한 요청 전체(대본·모델·설정)의 해시. 화면별 기록이라 kind를 넣는다
export const dramaKey = (request: DramaRequest) =>
	cacheKey({ v: TRIAL_CONTRACT_VERSION, kind: "drama", request });
// 부분 인덱스 trial_generation_drama와 같은 조건 글자(studioRow와 같은 이유, 계획 리뷰 P9)
const dramaRow = sql`${t.kind} = 'drama'`;

// 이전 테이크: 완료와 처리 여부 미확인 최근 20개(오디오 없음). 요청은 저장한 대본 + 모델·설정이고 출력 스키마가 다시 검사한다
export async function listDrama(
	db: Database,
	ownerId: string,
): Promise<DramaItemInput[]> {
	const rows = await db
		.select({
			...studioColumns,
			status: t.status,
			model: t.model,
			settings: t.settings,
			script: t.script,
			segments: t.segments,
		})
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				dramaRow,
				inArray(t.status, ["done", "unknown"]),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(DRAMA_RESULTS_SHOWN);
	return rows.map((row) => ({
		...studioOf(row),
		status: row.status as "done" | "unknown",
		segments: row.segments,
		request: {
			...(row.script as DramaScript),
			model: row.model,
			settings: row.settings,
		} as DramaItemInput["request"],
	}));
}

// 결과 오디오의 조각 하나(3MiB). Postgres substring은 1부터 센다. 저장 방식이 EXTERNAL이라 이 조각의 TOAST 덩어리만 읽는다.
// 0번 조각(열기·내려받기의 시작)만 보관을 30일 뒤로 늘린다(T5 audioOf와 같다). 남의 것·없음·만료·완료 아님·범위 밖·다른 화면의 행은 NOT_FOUND.
// id로 찾으므로 kind는 매개변수다(부분 인덱스와 상관없다)
export async function audioPart(
	db: Database,
	ownerId: string,
	id: string,
	part: number,
	kind: "studio" | "drama" = "studio",
): Promise<File> {
	const where = and(
		eq(t.id, id),
		eq(t.ownerId, ownerId),
		eq(t.kind, kind),
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

// 합성 전 클론 검사(T13 계획 2.3): 보낼 voice id 가운데 앱이 만든 클론(my_voice 매핑)이 있는데 '내 것이고 ready'가 아니면 참이다.
// 삭제 대기·처리 중 클론과, 보관함에 담긴 남의 클론 id를 막는다. 남의 매핑도 봐야 하므로 이 select만 소유자로 거르지 않는다(결과는 참·거짓뿐이다)
export async function cloneBlocked(
	db: Database,
	ownerId: string,
	provider: ProviderId,
	voiceIds: readonly string[],
) {
	if (voiceIds.length === 0) return false;
	const [row] = await db
		.select({ id: myVoice.id })
		.from(myVoice)
		.where(
			and(
				eq(myVoice.provider, provider),
				inArray(myVoice.providerVoiceId, voiceIds),
				or(ne(myVoice.ownerId, ownerId), ne(myVoice.status, "ready")),
			),
		)
		.limit(1);
	return row !== undefined;
}

// 서버 성우 검사(T9 스펙 2절, T9.5 스펙 2절, 로드맵 T8 보안 메모): 보낼 성우가 모두 이 소유자가 그 공급자로 담았고 현재 이용 불가가 아니어야 한다.
// 부르는 쪽은 선점·공급자 호출 전에 부르고, 거짓이면 voice_unavailable로 거절한다. 클라이언트가 보낸 voice id를 믿지 않는다. 담은 성우는 소유자 조건으로만 찾는다(prokit-api 불변식 3, tts-provider 클론 보이스 절).
// 담은 성우의 voice id도 원래 클라이언트가 보낸 값(savedVoiceSave)이라 이 검사는 '이 소유자가 담은 성우'라는 앱 수준 일관성 검사이고,
// 공급자 소유(Typecast uc_ 커스텀, Fish Audio 비공개 모델 등) 검증은 아니다. 소유자가 여럿이 되면(T14) 공급자 확인을 더한다
export async function usableVoices(
	db: Database,
	ownerId: string,
	provider: ProviderId,
	voiceIds: readonly string[],
) {
	// 보낼 성우가 없으면 0 === 0으로 참이 되므로 거절한다(fail closed)
	if (voiceIds.length === 0) return false;
	if (await cloneBlocked(db, ownerId, provider, voiceIds)) return false;
	const rows = await db
		.select({ id: savedVoice.id })
		.from(savedVoice)
		.where(
			and(
				eq(savedVoice.ownerId, ownerId),
				eq(savedVoice.provider, provider),
				eq(savedVoice.unavailable, false),
				inArray(savedVoice.voiceId, voiceIds),
			),
		);
	// 두 화자가 같은 성우면 id가 겹친다. 담은 행은 (소유자, 공급자, 성우)마다 하나다(saved_voice_voice)
	return rows.length === new Set(voiceIds).size;
}

// 사용 이력(GLOSSARY): 생성이 성공한 때만 그 소유자가 그 공급자로 담은 성우마다 +1(T9 스펙 3절). 같은 id가 여럿이어도 행마다 한 번이다(드라마 화자 둘이 같은 성우).
// 보관함에서 빠졌으면 바뀌는 행이 없다
export async function recordUse(
	db: Database,
	ownerId: string,
	provider: ProviderId,
	voiceIds: readonly string[],
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
				eq(savedVoice.provider, provider),
				inArray(savedVoice.voiceId, voiceIds),
			),
		);
}

// 작업실·드라마의 같은 요청 id 재생(replayRequest와 같은 규칙). 오디오 대신 길이만 읽는다(32MiB를 통째로 읽지 않는다, 계획 리뷰 P4·E3).
// 사유의 공급자는 요청의 공급자다. 음성 작업실 출력 스키마가 segments를 걸러 낸다
export async function replayStudio(
	db: Database,
	ownerId: string,
	requestId: string,
	key: string,
	provider: ProviderId,
): Promise<(StudioResult & { segments: LineSpan[] | null }) | null> {
	const find = async () => {
		const [row] = await db
			.select({
				...studioColumns,
				segments: t.segments,
				comboKey: t.comboKey,
				status: t.status,
				failureReason: t.failureReason,
			})
			.from(t)
			.where(and(eq(t.ownerId, ownerId), eq(t.requestId, requestId)))
			.limit(1);
		return row;
	};
	const done = (row: NonNullable<Awaited<ReturnType<typeof find>>>) => ({
		...studioOf(row),
		segments: row.segments,
	});
	const existing = await find();
	if (!existing) return null;
	if (existing.comboKey !== key) throw trialError(provider, "request_mismatch");
	if (!isStale(existing)) return replayStatus(provider, existing, done);
	await expireStale(db, ownerId, requestId);
	return replayStatus(provider, (await find()) ?? existing, done);
}

// 늦은 결과: 오디오와 그 형식, 드라마는 줄 구간(나누지 못하면 null)
export type Stored = {
	audio: Uint8Array;
	audioType: string;
	segments?: LineSpan[] | null;
};
// 늦은 결과를 받을 행과 사용 이력을 올릴 성우(그 공급자로 담은 성우)
export type LateTarget = {
	ownerId: string;
	id: string;
	kind: "studio" | "drama";
	provider: ProviderId;
	voiceIds: readonly string[];
};

// 늦은 결과 저장: 시간 초과로 미확인이 된 그 소유자·그 화면의 행만 완료로 바꾼다. 그사이 지웠거나 다른 상태면 바뀌는 행이 없다
async function completeLate(
	db: Database,
	target: LateTarget,
	stored: Stored,
): Promise<boolean> {
	const { rowCount } = await writeAudio(
		db,
		db
			.update(t)
			.set({
				status: "done",
				failureReason: null,
				audio: Buffer.from(stored.audio),
				audioType: stored.audioType,
				segments: stored.segments ?? null,
				expiresAt: later(),
			})
			// 그 화면의 행만(내 문장 미확인 행은 상한이 4MiB다, 계획 리뷰 E12)
			.where(
				and(
					eq(t.id, target.id),
					eq(t.ownerId, target.ownerId),
					eq(t.kind, target.kind),
					eq(t.status, "unknown"),
				),
			),
	);
	return (rowCount ?? 0) > 0;
}

// 늦은 결과(T5-02, T9 스펙 2절). 성공이면 같은 기록을 완료로 바꾸고 사용 이력을 올린다. 실패·32MiB 초과는 미확인 그대로다.
// 부르는 쪽은 미확인 기록(recordFailure)을 쓴 뒤에 부른다(미확인 행만 완료로 바꾸므로, 먼저 부르면 아직 진행 중인 행이라 늦은 결과를 잃는다). 던지지 않는다(로그 한 줄, 접두는 화면).
// 부르는 쪽은 돌려준 약속을 응답 뒤 작업(context.defer, 배포는 Next after)으로 넘긴다.
// shortcut: 함수 수명(Vercel Hobby 300초, /api/rpc maxDuration) 안에 온 결과만 받는다. 장면은 270초 상한(SCENE_LATE_MAX_MS)이고 300초를 넘는 Typecast 응답은 잃는다(ADR 0013). 그런 응답이 실제로 생기면 플랜을 다시 본다
export function saveLate(
	db: Database,
	target: LateTarget,
	late: Promise<Stored>,
): Promise<void> {
	const prefix = `[${target.kind}]`;
	return late.then(
		async (stored) => {
			if (stored.audio.byteLength > STUDIO_AUDIO_MAX) {
				console.error(`${prefix} 늦은 결과 버림: audio_too_large`);
				return;
			}
			await guard(
				"늦은 결과 기록",
				async () => {
					if (await completeLate(db, target, stored))
						await recordUse(
							db,
							target.ownerId,
							target.provider,
							target.voiceIds,
						);
				},
				prefix,
			);
		},
		(error: unknown) => logFailure(`${prefix} 늦은 결과 실패`, error, []),
	);
}

// 유료 호출이 성공한 뒤(작업실·드라마, recordFailure의 짝): 오디오를 저장하고 사용 이력을 올린 뒤 만료 행을 정리한다. 로그 접두는 saveLate처럼 화면이다.
// 저장하지 못하면 화면이 조각을 받을 수 없다. 출력에 오디오가 없어 T5처럼 돌려줄 수 없으므로 처리 여부 미확인으로 적고 unknown_outcome을 던진다(T9 '스펙과 다른 점' 4).
// 결과가 저장되면 사용 이력·정리가 실패해도 던지지 않는다(로그 한 줄). segments가 없으면(음성 작업실) 그 칸을 건드리지 않는다
export async function recordSuccess(
	db: Database,
	target: LateTarget,
	stored: Stored,
): Promise<void> {
	const { ownerId, id, provider } = target;
	const prefix = `[${target.kind}]`;
	const saved = await guard(
		"완료 기록",
		async () => {
			await complete(
				db,
				ownerId,
				id,
				stored.audio,
				stored.audioType,
				stored.segments,
			);
			return true;
		},
		prefix,
	);
	if (!saved) {
		await guard(
			"미확인 기록",
			() => settle(db, ownerId, id, "unknown", "unknown_outcome"),
			prefix,
		);
		throw trialError(provider, "unknown_outcome");
	}
	await guard(
		"사용 이력",
		() => recordUse(db, ownerId, provider, target.voiceIds),
		prefix,
	);
	await guard("정리", () => sweep(db, ownerId), prefix);
}

// 자동 태그 답 한 항목(JSON schema로 요청했어도 서버가 다시 읽는다). 항목 수·index는 믿지 않는다
const suggestionSchema = z.object({
	index: z.number().int(),
	direction: z.string(),
	text: z.string(),
	emotion: z.string(),
	intensity: z.number().nullable(),
});

// OpenAI 시도 횟수(T10 스펙 16.1). 시도 사이에 기다리지 않는다
export const OPENAI_TRIES = 3;
// 다시 불러 볼 OpenAI 실패. 나머지(키·권한·결제·한도, 요청 거절)는 같은 실패라 남은 시도를 건너뛴다
const RETRY_REASONS = new Set([
	"unknown_outcome",
	"rate_limit",
	"provider_error",
]);
const ACCOUNT_REASONS = new Set(["provider_auth", "no_permission", "quota"]);

// 답 글을 읽는다(시도마다 같다). 못 읽으면 그 공급자의 auto_tag_reply다. 답 글·대본은 data에 넣지 않는다
function readReply(
	reply: string | null,
	key: "lines" | "paragraphs",
	provider: "openai" | "gemini",
) {
	const read = z
		.object({ [key]: z.array(suggestionSchema) })
		.safeParse(parseJsonReply(reply));
	if (!read.success)
		throw trialError(provider, "provider_input", {
			providerCode: "auto_tag_reply",
		});
	return read.data;
}

// 자동 태그 텍스트 호출(유료, 드라마 dramaAutoTag·문단 studioAutoTag). 순서는 스펙 16.1이다:
// OpenAI 최대 3번 → 끝내 실패하거나 키가 없으면 Gemini 1번 → 모두 실패하면 마지막 실패. 한 묶음의 유료 호출은 최대 4번이다.
// 처리 여부 미확인(시간 초과)도 다시 부르는 것은 tts-provider "유료 호출은 자동으로 다시 하지 않는다"의 사용자 결정 예외다(ADR 0008).
// 항목마다 그 index의 첫 제안만 돌려준다. 받을 줄·문단이 없을 때 부르지 않는 판단과 제안 검사는 라우터가 한다
export async function askSuggestions(
	context: Context,
	prompt: { system: string; input: string; schema: Record<string, unknown> },
	key: "lines" | "paragraphs",
): Promise<Map<number, Suggestion>> {
	const openai = context.providers?.openai?.suggestActing;
	const gemini = context.providers?.gemini?.suggestActing;
	let last: ORPCError<string, TrialErrorData> | undefined;
	let reply: ReturnType<typeof readReply> | undefined;
	if (openai) {
		for (let attempt = 1; attempt <= OPENAI_TRIES && !reply; attempt++) {
			try {
				reply = readReply(await openai(prompt), key, "openai");
			} catch (error) {
				// 사유가 없는 예상 밖 예외는 그대로 던진다
				if (!(error instanceof ORPCError) || !error.data?.reason) throw error;
				last = error;
				const { reason, providerCode } = error.data as TrialErrorData;
				const shown = providerCode === "auto_tag_reply" ? providerCode : reason;
				console.warn(
					`[autoTag] openai 실패 ${attempt}/${OPENAI_TRIES} ${shown}`,
				);
				if (!RETRY_REASONS.has(reason) && shown !== "auto_tag_reply") break;
			}
		}
	} else if (gemini) {
		console.warn("[autoTag] openai 키 없음, gemini로");
	}
	if (!reply && gemini) reply = readReply(await gemini(prompt), key, "gemini");
	if (!reply) {
		if (!last)
			throw trialError("openai", "no_key", { providerCode: "openai_account" });
		const { reason } = last.data as TrialErrorData;
		throw ACCOUNT_REASONS.has(reason)
			? trialError("openai", reason, { providerCode: "openai_account" })
			: last;
	}
	const first = new Map<number, Suggestion>();
	// 키는 위 schema가 보장한다(계산한 키라 타입은 undefined를 남긴다)
	for (const suggestion of reply[key] ?? [])
		if (!first.has(suggestion.index)) first.set(suggestion.index, suggestion);
	return first;
}
