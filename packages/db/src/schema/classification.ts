import { sql } from "drizzle-orm";
import {
	check,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// 채널·분류(T6 스펙 3절, ADR 0004). 채널은 프리셋(T8)·저장 대본(T12)이 하나만 가리키는 제작 단위라 분류와 따로 둔다.
// user 외래 키는 걸지 않는다(ADR 0012): owner_id는 서버가 세션에서만 넣는 문자열이다. 두 번째 소유자를 받을 때 외래 키를 다시 정한다.
export const channel = pgTable(
	"channel",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		name: text("name").notNull(),
		memo: text("memo"),
		// http·https만(classification-rules urlProblem). 목록이 링크로 그린다
		url: text("url"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// 같은 소유자 안 대소문자 무시 중복 금지. 조회가 아니라 이 인덱스가 막는다(동시 만들기 포함). 이름은 라우터의 CONFLICT 판정이 쓴다.
		// 목록 조회(owner_id)도 앞 컬럼을 쓴다
		uniqueIndex("channel_name").on(t.ownerId, sql`lower(${t.name})`),
	],
);

// 카테고리·타입(GLOSSARY '분류'). 성우(T7)·대본(T12)에 여러 개 붙는 이름표다
export const classification = pgTable(
	"classification",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerId: text("owner_id").notNull(),
		kind: text("kind").$type<"category" | "type">().notNull(),
		name: text("name").notNull(),
		memo: text("memo"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// 같은 소유자·같은 kind 안 대소문자 무시 중복 금지. 카테고리 '경제'와 타입 '경제'는 된다
		uniqueIndex("classification_name").on(
			t.ownerId,
			t.kind,
			sql`lower(${t.name})`,
		),
		check("classification_kind", sql`${t.kind} in ('category', 'type')`),
	],
);
