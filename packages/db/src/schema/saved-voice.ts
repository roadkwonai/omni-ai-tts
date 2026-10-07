import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { channel, classification } from "./classification";

// 성우 보관함(T7 스펙 3절, GLOSSARY '성우 보관함'). 담기 = 이 표의 행 하나다. 즐겨찾기·자주 사용을 꺼도 남고 '보관함에서 빼기'로만 지운다.
// voice는 담을 때(그리고 이용 가능 확인에 성공할 때) 받은 계약 Voice 그대로다. 읽을 때 api가 voiceSchema로 다시 검사한다.
// user 외래 키는 걸지 않는다(ADR 0004와 같다, T14에서 정한다)
export const savedVoice = pgTable(
	"saved_voice",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerId: text("owner_id").notNull(),
		provider: text("provider")
			.$type<"typecast" | "elevenlabs" | "fish_audio" | "airy">()
			.notNull(),
		voiceId: text("voice_id").notNull(),
		// 담은 출처. 키가 아니다(같은 성우를 공개·계정 어느 쪽에서 담아도 한 행). 이용 가능 확인이 조회 방법을 고르는 데 쓴다
		source: text("source").$type<"public" | "account">().notNull(),
		favorite: boolean("favorite").default(false).notNull(),
		frequent: boolean("frequent").default(false).notNull(),
		memo: text("memo"),
		voice: jsonb("voice").notNull(),
		// 공급자가 '없다'고 답했다(현재 이용 불가). 확인에 성공하면 다시 false
		unavailable: boolean("unavailable").default(false).notNull(),
		// 마지막으로 공급자에 확인한 시각. 담을 때는 지금(살아 있는 목록에서 담았다)
		checkedAt: timestamp("checked_at", { withTimezone: true }),
		savedAt: timestamp("saved_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// 같은 성우는 한 번만(REQ-04). 담기 upsert의 충돌 대상이다
		unique("saved_voice_voice").on(t.ownerId, t.provider, t.voiceId),
		// 목록(최근 담은 순)
		index("saved_voice_owner_saved").on(t.ownerId, t.savedAt.desc()),
		check(
			"saved_voice_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio', 'airy')`,
		),
		check("saved_voice_source", sql`${t.source} in ('public', 'account')`),
	],
);

// 성우 ↔ 채널. 어느 쪽을 지워도 연결만 지워진다(로드맵 T7 메모). saved_voice_id 조회는 기본 키 앞 컬럼이, 채널 쪽은 아래 인덱스가 맡는다
export const savedVoiceChannel = pgTable(
	"saved_voice_channel",
	{
		savedVoiceId: uuid("saved_voice_id")
			.notNull()
			.references(() => savedVoice.id, { onDelete: "cascade" }),
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channel.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({
			name: "saved_voice_channel_pk",
			columns: [t.savedVoiceId, t.channelId],
		}),
		index("saved_voice_channel_channel").on(t.channelId),
	],
);

// 성우 ↔ 카테고리·타입
export const savedVoiceClassification = pgTable(
	"saved_voice_classification",
	{
		savedVoiceId: uuid("saved_voice_id")
			.notNull()
			.references(() => savedVoice.id, { onDelete: "cascade" }),
		classificationId: uuid("classification_id")
			.notNull()
			.references(() => classification.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({
			name: "saved_voice_classification_pk",
			columns: [t.savedVoiceId, t.classificationId],
		}),
		index("saved_voice_classification_classification").on(t.classificationId),
	],
);
