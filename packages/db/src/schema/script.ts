import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { channel, classification } from "./classification";

// 대본 보관함(T12 계획 2.1, ADR 0010, GLOSSARY '대본'). 저장한 대본(saved)과 최근 대본(recent)을 한 표에 둔다.
// 채널을 지우면 그 칸만 빈다(on delete set null). user 외래 키는 걸지 않는다(ADR 0004와 같다, T14에서 정한다)
export const script = pgTable(
	"script",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		kind: text("kind").$type<"saved" | "recent">().notNull(),
		// 저장한 대본만 있다(check script_shape)
		title: text("title"),
		// 최근 대본만 있다. 화면 임시 작업의 id(작업 하나당 최근 대본 한 줄)
		workId: uuid("work_id"),
		channelId: uuid("channel_id").references(() => channel.id, {
			onDelete: "set null",
		}),
		// 작업 JSON(채널 제외). 쓸 때 script-contract로 검사한 값이고 읽을 때 다시 검사한다. 목록은 이 칸을 읽지 않는다
		work: jsonb("work").notNull(),
		// 검색용 원문(문단 글을 빈 줄로 이은 것). 서버가 저장할 때 만든다
		body: text("body").notNull(),
		paragraphCount: integer("paragraph_count").notNull(),
		charCount: integer("char_count").notNull(),
		// 판 조건 저장(저장한 대본)
		version: integer("version").default(1).notNull(),
		// ms 정밀도: 목록 커서 (updated_at, id)가 JS Date와 같은 값이 되게(계획 2.1, 리뷰 P1)
		createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// 같은 소유자 안 저장한 대본의 대소문자 무시 제목 중복 금지. 이름은 라우터의 CONFLICT 판정이 쓴다
		uniqueIndex("script_title")
			.on(t.ownerId, sql`lower(${t.title})`)
			.where(sql`${t.kind} = 'saved'`),
		// 작업 하나당 최근 대본 한 줄. 최근 보관 upsert의 충돌 대상이다
		uniqueIndex("script_recent_work")
			.on(t.ownerId, t.workId)
			.where(sql`${t.kind} = 'recent'`),
		// 목록 (updated_at, id) 커서
		index("script_owner_list").on(
			t.ownerId,
			t.kind,
			t.updatedAt.desc(),
			t.id.desc(),
		),
		// 외래 키 컬럼은 자동 인덱스가 없다(schema-foreign-key-indexes). 채널 지우기의 set null과 채널 거르기가 쓴다
		index("script_channel").on(t.channelId),
		// ILIKE '%…%' 검색(pg_trgm, 앞 마이그레이션 script_trgm이 켠다)
		index("script_title_trgm").using("gin", t.title.op("gin_trgm_ops")),
		index("script_body_trgm").using("gin", t.body.op("gin_trgm_ops")),
		check("script_kind", sql`${t.kind} in ('saved', 'recent')`),
		check(
			"script_shape",
			sql`(${t.kind} = 'saved' and ${t.title} is not null and ${t.workId} is null) or (${t.kind} = 'recent' and ${t.title} is null and ${t.workId} is not null)`,
		),
	],
);

// 대본 ↔ 카테고리·타입(saved_voice_classification과 같은 모양)
export const scriptClassification = pgTable(
	"script_classification",
	{
		scriptId: uuid("script_id")
			.notNull()
			.references(() => script.id, { onDelete: "cascade" }),
		classificationId: uuid("classification_id")
			.notNull()
			.references(() => classification.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({
			name: "script_classification_pk",
			columns: [t.scriptId, t.classificationId],
		}),
		index("script_classification_classification").on(t.classificationId),
	],
);
