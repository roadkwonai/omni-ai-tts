import { createHash } from "node:crypto";

import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type {
	ProviderErrorData,
	ProviderFailure,
	ProviderId,
} from "./providers/contract";
import { providerError } from "./providers/errors";

// 공급자 목록 캐시(ADR 0003, T4 스펙 5절). 계약이나 공급자 모듈의 변환·거르기(샘플 호스트 포함)가 바뀌면 판을 올린다. 캐시 행에는 변환을 마친 성우가 들어 있다.
export const CONTRACT_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
// 만료 뒤 이만큼은 공급자가 실패할 때 지난 목록으로 쓰고, 그 뒤 쓰기 때 지운다
const KEEP_STALE_MS = 7 * 24 * 60 * 60 * 1000;
// 대기 표에는 1시간 뒤까지만 적는다. providers/errors.ts의 Retry-After 상한과 같고, 이 표에 쓰는 다른 곳(T5 생성)이 긴 값을 넘겨도 풀 방법 없이 며칠씩 막히지 않게 한 번 더 지킨다(계획 리뷰 E16)
const MAX_COOLDOWN_MS = 60 * 60 * 1000;

// 공개 목록(public·accents·models, models는 ElevenLabs 모델 배율, T5)은 ownerId null(소유자끼리 함께 쓴다), 계정 목록은 서버가 정한 소유자.
// 계정 행이 ownerId null로 저장되는 실수(남의 계정 목록이 공개로 섞인다)를 타입이 막는다.
export type CacheScope = { provider: ProviderId } & (
	| { ownerId: null; kind: "public" | "accents" | "models" }
	| { ownerId: string; kind: "account" }
);
export type Cached<T> = {
	value: T;
	fetchedAt: string;
	stale: { reason: ProviderFailure; retryAt: string | null } | null;
};

const t = providerListCache;

// 키 순서를 맞춘 JSON. 조건의 배열은 집합이라(같은 축 OR, Fish Audio 태그 AND) 정렬한다.
function stable(value: unknown): unknown {
	if (Array.isArray(value)) {
		const items = value.map(stable);
		return items.every((item) => typeof item === "string")
			? [...items].sort()
			: items;
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, item]) => [key, stable(item)]),
		);
	}
	return value;
}
export function cacheKey(params: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(stable(params)))
		.digest("hex");
}

// DB 오류 코드(ECONNREFUSED, 23505 등). drizzle 오류는 pg 오류를 cause에 넣는다
export function dbCode(error: unknown): string | null {
	const { code, cause } = (error ?? {}) as {
		code?: unknown;
		cause?: { code?: unknown };
	};
	if (typeof cause?.code === "string") return cause.code;
	return typeof code === "string" ? code : null;
}

// DB 오류 한 줄. drizzle 오류의 message에는 SQL과 값이 들어 있어 이름과 코드(ECONNREFUSED 등)만 남긴다
export function logDbFailure(prefix: string, step: string, error: unknown) {
	const name = error instanceof Error ? error.name : typeof error;
	const tag = dbCode(error);
	console.error(`${prefix} ${step} 실패: ${name}${tag ? ` ${tag}` : ""}`);
}

// DB가 꺼져 있거나 실패해도 목록은 보인다: 캐시 없이 공급자를 부른다(T4 계획 '스펙과 다른 점' 2).
export async function guard<T>(
	step: string,
	run: () => Promise<T>,
	prefix = "[voiceCache]",
): Promise<T | undefined> {
	try {
		return await run();
	} catch (error) {
		logDbFailure(prefix, step, error);
		return undefined;
	}
}

// 같은 키의 동시 요청은 공급자 호출(과 쓰기) 하나로 합친다.
// ponytail: 서버 프로세스 안에서만 합친다. 배포 뒤 인스턴스끼리 겹친 호출이 보이면 pg advisory lock으로 넓힌다.
const inflight = new Map<string, Promise<unknown>>();
function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
	const running = inflight.get(key);
	if (running) return running as Promise<T>;
	const started = run().finally(() => inflight.delete(key));
	inflight.set(key, started);
	return started;
}

// 목록과 시험 생성(T5)이 함께 쓴다
export async function cooldownOf(
	db: Database,
	provider: ProviderId,
	now: Date,
) {
	const [row] = await db
		.select({ until: providerCooldown.until })
		.from(providerCooldown)
		.where(
			and(
				eq(providerCooldown.provider, provider),
				gt(providerCooldown.until, now),
			),
		)
		.limit(1);
	return row?.until ?? null;
}

// 429 대기 시각을 적는다(목록과 시험 생성이 함께 쓴다). 1시간 뒤까지만(계획 리뷰 E16)
export async function recordCooldown(
	db: Database,
	provider: ProviderId,
	retryAt: Date,
) {
	const until = new Date(
		Math.min(retryAt.getTime(), Date.now() + MAX_COOLDOWN_MS),
	);
	await db
		.insert(providerCooldown)
		.values({ provider, until })
		.onConflictDoUpdate({ target: providerCooldown.provider, set: { until } });
}

export async function cachedList<T>(
	db: Database,
	scope: CacheScope,
	params: unknown,
	schema: z.ZodType<T>,
	fetch: () => Promise<T>,
): Promise<Cached<T>> {
	const key = cacheKey(params);
	const now = new Date();
	const where = and(
		scope.ownerId === null ? isNull(t.ownerId) : eq(t.ownerId, scope.ownerId),
		eq(t.provider, scope.provider),
		eq(t.listKind, scope.kind),
		eq(t.paramsKey, key),
		eq(t.contractVersion, CONTRACT_VERSION),
	);
	const rows = await guard("읽기", () =>
		db
			.select({
				payload: t.payload,
				fetchedAt: t.fetchedAt,
				expiresAt: t.expiresAt,
			})
			.from(t)
			.where(where)
			.limit(1),
	);
	// 읽기가 DB 오류로 실패했으면(select는 늘 배열을 돌려준다) 이 요청은 대기 확인·쓰기도 건너뛴다. 응답 없는 DB에서 시간 제한(3초)을 세 번 기다리지 않는다.
	const dbDown = rows === undefined;
	const [row] = rows ?? [];
	// 읽을 때도 계약으로 검사한다. 어긋난 행은 없는 것으로 보고 다시 받는다(덮어쓴다)
	const kept = row ? schema.safeParse(row.payload) : undefined;
	const hit =
		row && kept?.success
			? { value: kept.data, fetchedAt: row.fetchedAt.toISOString() }
			: null;
	if (hit && row && row.expiresAt > now) return { ...hit, stale: null };
	// 지난 목록은 만료 뒤 7일까지만 쓴다. 쓰기 때 지우는 범위와 같다. 공급자가 계속 실패해 쓰기가 없어도 오래된 목록을 내주지 않는다(계획 리뷰 E5)
	const fallback =
		hit && row && row.expiresAt.getTime() > now.getTime() - KEEP_STALE_MS
			? hit
			: null;

	// 429 대기 시각 전에는 공급자를 부르지 않는다(지난 목록이 있으면 그것을)
	const blocked = dbDown
		? undefined
		: await guard("대기 확인", () => cooldownOf(db, scope.provider, now));
	if (blocked) {
		const retryAt = blocked.toISOString();
		if (fallback)
			return { ...fallback, stale: { reason: "rate_limit", retryAt } };
		throw providerError(scope.provider, "rate_limit", retryAt);
	}

	try {
		return await coalesce(
			`${scope.ownerId ?? ""}|${scope.provider}|${scope.kind}|${key}`,
			async () => {
				const value = await fetch();
				const fetchedAt = new Date();
				if (!dbDown)
					await guard("쓰기", async () => {
						const expiresAt = new Date(fetchedAt.getTime() + TTL_MS);
						await db
							.insert(t)
							.values({
								ownerId: scope.ownerId,
								provider: scope.provider,
								listKind: scope.kind,
								paramsKey: key,
								contractVersion: CONTRACT_VERSION,
								payload: value,
								fetchedAt,
								expiresAt,
							})
							.onConflictDoUpdate({
								target: [
									t.ownerId,
									t.provider,
									t.listKind,
									t.paramsKey,
									t.contractVersion,
								],
								// excluded로 갱신해 payload(최대 약 0.9MB)를 두 번 보내지 않는다
								set: {
									payload: sql`excluded.payload`,
									fetchedAt: sql`excluded.fetched_at`,
									expiresAt: sql`excluded.expires_at`,
								},
							});
						await db
							.delete(t)
							.where(
								lt(t.expiresAt, new Date(fetchedAt.getTime() - KEEP_STALE_MS)),
							);
					});
				return { value, fetchedAt: fetchedAt.toISOString(), stale: null };
			},
		);
	} catch (error) {
		const data =
			error instanceof ORPCError
				? (error.data as Partial<ProviderErrorData> | undefined)
				: undefined;
		// 사유가 없는 예외(버그)는 그대로 던진다(오류 경계)
		if (!data?.reason) throw error;
		if (!dbDown && data.reason === "rate_limit" && data.retryAt) {
			await guard("대기 쓰기", () =>
				recordCooldown(
					db,
					scope.provider,
					new Date(Date.parse(data.retryAt as string)),
				),
			);
		}
		if (fallback) {
			console.error(
				`[voiceCache] ${scope.provider} 지난 목록 반환: ${data.reason}`,
			);
			return {
				...fallback,
				stale: { reason: data.reason, retryAt: data.retryAt ?? null },
			};
		}
		throw error;
	}
}

// '목록 새로 고침': 그 공급자의 공개 행과 이 소유자의 계정 행을 만료로 바꾼다. 행을 지우지 않아 다시 받기가 실패해도 지난 목록을 보인다.
// 대기 시각 전이면 아무것도 바꾸지 않고 그 시각을 돌려준다.
export async function expireProvider(
	db: Database,
	provider: ProviderId,
	ownerId: string,
): Promise<{ retryAt: string | null }> {
	const now = new Date();
	const blocked = await guard("대기 확인", () => cooldownOf(db, provider, now));
	// DB가 실패했다. 만료 표시도 같은 DB라 보내지 않는다(cachedList의 읽기 실패 뒤 건너뛰기와 같은 규칙)
	if (blocked === undefined) return { retryAt: null };
	if (blocked) return { retryAt: blocked.toISOString() };
	await guard("만료 표시", () =>
		db
			.update(t)
			.set({ expiresAt: now })
			.where(
				and(
					eq(t.provider, provider),
					or(isNull(t.ownerId), eq(t.ownerId, ownerId)),
					gt(t.expiresAt, now),
				),
			),
	);
	return { retryAt: null };
}

// 소유 데이터 프로시저의 저장소 오류 틀(T6에서 뽑음, T7 두 번째 사용처). mapError가 고른 오류(CONFLICT·NOT_FOUND 등)는 그대로,
// 그 밖은 한 줄(오류 이름·DB 코드)만 남기고 500이다. 오류 객체(쿼리 파라미터 = 사용자 입력)는 로그와 cause에 넘기지 않는다
export async function stored<T>(
	prefix: string,
	step: string,
	run: () => Promise<T>,
	mapError: (error: unknown) => ORPCError<string, unknown> | null = () => null,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		const mapped = mapError(error);
		if (mapped) throw mapped;
		logDbFailure(prefix, step, error);
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}
}

// 바뀐 행이 없으면 NOT_FOUND. 남의 것인지 없는 것인지 드러내지 않는다(bts-api 불변식 3)
export function found<T>(row: T | undefined): T {
	if (!row) throw new ORPCError("NOT_FOUND");
	return row;
}
