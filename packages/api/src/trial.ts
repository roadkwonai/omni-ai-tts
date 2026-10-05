import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";

import type { ProviderId } from "./providers/contract";
import { trialError } from "./providers/errors";
import {
	type TrialAudio,
	type TrialFailure,
	type TrialItemInput,
	trialFailureSchema,
} from "./providers/trial-contract";
import {
	comboSignature,
	normalizeText,
	TRIAL_RESULTS_SHOWN,
	type TrialRequest,
	type Usage,
	usedSettings,
} from "./providers/trial-options";
import { cacheKey, logDbFailure } from "./voice-cache";

// 시험 생성 기록과 들은 결과(ADR 0003 '듣기 결과', T5 스펙 5절). 모든 읽기·쓰기에 소유자 조건을 넣는다(bts-api 불변식 3).
// 정리·옵션·조합 글자가 바뀌어 같은 요청이 다른 소리를 내게 되면 판을 올린다(옛 결과를 찾지 않는다).
// 판을 올릴 때는 같은 마이그레이션에서 `delete from trial_generation`으로 옛 결과를 지운다. 목록(listResults)은 판을 거르지 않고
// 화면의 '저장된 결과' 판정(comboSignature)에는 판이 없어서, 옛 행이 남으면 '저장됨'인데 찾기가 못 찾는다(계획 리뷰 E13)
export const TRIAL_CONTRACT_VERSION = 1;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
// 함수 최대 실행 시간(ADR 0002: 300초)보다 오래 '만드는 중'이면 처리 여부를 모르는 것으로 옮긴다(tts-provider)
const STALE_PENDING_MS = 5 * 60 * 1000;
const t = trialGeneration;

// 목록 캐시와 같은 해시 함수를 쓴다(voice-cache cacheKey, 계획 리뷰 ponytail 12)
export const comboKey = (request: TrialRequest) =>
	cacheKey({ v: TRIAL_CONTRACT_VERSION, sig: comboSignature(request) });

// Buffer(bytea)를 ArrayBuffer로 복사해 File로 만든다
export const audioFile = (bytes: Uint8Array) =>
	new File([new Uint8Array(bytes)], "trial.mp3", { type: "audio/mpeg" });

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
};
type ResultRow = {
	id: string;
	createdAt: Date;
	usageUnit: string;
	usageAmount: number;
	audio: Buffer | null;
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
		audio: audioFile(row.audio),
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
	if (
		existing.status === "pending" &&
		existing.createdAt.getTime() < Date.now() - STALE_PENDING_MS
	) {
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

// 같은 요청 id가 다시 왔다(재전송, 두 번 누름). 공급자를 다시 부르지 않고 그 행의 상태를 돌려준다
export function replay(provider: ProviderId, row: ExistingRow): TrialAudio {
	if (row.status === "done") return toAudio(row);
	if (row.status === "pending") throw trialError(provider, "in_progress");
	if (row.status === "unknown") throw trialError(provider, "unknown_outcome");
	const reason: TrialFailure =
		trialFailureSchema.safeParse(row.failureReason).data ?? "provider_error";
	throw trialError(provider, reason);
}

// id는 같은 요청의 선점에서 온 값이지만 소유자 조건을 함께 건다(bts-api 불변식 3, 계획 리뷰 E12)
export async function complete(
	db: Database,
	ownerId: string,
	id: string,
	audio: Uint8Array,
) {
	await db
		.update(t)
		.set({
			status: "done",
			audio: Buffer.from(audio),
			audioType: "audio/mpeg",
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

// 결과 하나의 오디오. 재생하면 만료를 30일 뒤로 늘린다. 남의 결과·없는 결과·만료는 NOT_FOUND(bts-api 불변식 3)
export async function audioOf(db: Database, ownerId: string, id: string) {
	const [row] = await db
		.update(t)
		.set({ expiresAt: later() })
		.where(
			and(
				eq(t.id, id),
				eq(t.ownerId, ownerId),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.returning(resultColumns);
	if (!row) throw new ORPCError("NOT_FOUND");
	return toAudio(row);
}

// 결과 지우기(앱 DB에서만, 공급자는 건드리지 않는다). 진행 중인 행은 지우지 않는다
export async function remove(
	db: Database,
	ownerId: string,
	id: string,
): Promise<true> {
	const [row] = await db
		.delete(t)
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId), ne(t.status, "pending")))
		.returning({ id: t.id });
	if (!row) throw new ORPCError("NOT_FOUND");
	return true;
}
