import {
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// 공급자 성우 목록 캐시(ADR 0003, T4 스펙 5절). 조건별로 24시간 보관하고, 공급자가 실패하면 만료 뒤 7일까지 지난 목록으로 쓴다.
// 지워도 되는 데이터라 user 외래 키를 걸지 않는다(T4 스펙 2절). 지속 소유 데이터의 외래 키는 T6에서 정한다.
export const providerListCache = pgTable(
	"provider_list_cache",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 공개 목록은 null(소유자끼리 함께 쓴다), 계정 목록은 서버가 정한 소유자 id
		ownerId: text("owner_id"),
		provider: text("provider").notNull(),
		// public·account·accents
		listKind: text("list_kind").notNull(),
		// 정규화한 조건·페이지의 SHA-256(packages/api/src/voice-cache.ts cacheKey)
		paramsKey: text("params_key").notNull(),
		// 계약 판. 계약이 바뀌면 판을 올려 옛 행을 읽지 않는다
		contractVersion: integer("contract_version").notNull(),
		// 계약 스키마로 검사한 목록 한 페이지(읽을 때도 다시 검사한다)
		payload: jsonb("payload").notNull(),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		// 조회 조건 전체가 키다. 공개 행(owner_id null)끼리도 겹치지 않게 NULLS NOT DISTINCT(Postgres 15+). 이 제약의 인덱스가 조회 인덱스를 겸한다.
		// ponytail: 만료 행 정리(expires_at < …)용 인덱스는 두지 않는다. 1인 사용에서 행이 수백 개라 순차 스캔이 싸다. 행이 수만 개가 되면 expires_at 인덱스를 더한다.
		unique("provider_list_cache_key")
			.on(t.ownerId, t.provider, t.listKind, t.paramsKey, t.contractVersion)
			.nullsNotDistinct(),
	],
);

// 공급자 429 Retry-After로 정한 다음 호출 가능 시각(T4 목록, T5 생성). 서버 인스턴스끼리 메모리를 나누지 않으므로 DB에 둔다(tts-provider).
export const providerCooldown = pgTable("provider_cooldown", {
	provider: text("provider").primaryKey(),
	until: timestamp("until", { withTimezone: true }).notNull(),
});
