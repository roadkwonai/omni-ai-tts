import { sql } from "drizzle-orm";
import {
	check,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { channel } from "./classification";
import { savedVoice } from "./saved-voice";

// 프리셋(T8 스펙 3절, GLOSSARY '프리셋'). 한 공급자의 담은 성우·설정(모델 포함) 조합에 이름을 붙인 것.
// 성우를 보관함에서 빼거나 채널을 지우면 그 칸만 비고 프리셋은 남는다(on delete set null).
// user 외래 키는 걸지 않는다(ADR 0004와 같다, T14에서 정한다)
export const voicePreset = pgTable(
	"voice_preset",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		name: text("name").notNull(),
		provider: text("provider")
			.$type<"typecast" | "elevenlabs" | "fish_audio" | "airy" | "gemini">()
			.notNull(),
		// 프리셋의 성우(담은 성우). null이면 '성우를 다시 골라 주세요'
		savedVoiceId: uuid("saved_voice_id").references(() => savedVoice.id, {
			onDelete: "set null",
		}),
		// 그 공급자 설정 전체(모델 포함). 쓸 때 trial-contract 공급자 스키마로 정리한 값이고, 읽을 때 다시 검사한다(preset-contract readSettings)
		settings: jsonb("settings").notNull(),
		channelId: uuid("channel_id").references(() => channel.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// 같은 소유자 안 대소문자 무시 중복 금지(T6 channel_name과 같다). 조회가 아니라 이 인덱스가 막는다(동시 저장 포함).
		// 이름은 라우터의 CONFLICT 판정이 쓴다. 목록 조회(owner_id)도 앞 컬럼을 쓴다
		uniqueIndex("voice_preset_name").on(t.ownerId, sql`lower(${t.name})`),
		// 외래 키 컬럼은 자동 인덱스가 없다(schema-foreign-key-indexes). 보관함 빼기·채널 지우기의 set null이 쓴다
		index("voice_preset_saved_voice").on(t.savedVoiceId),
		index("voice_preset_channel").on(t.channelId),
		check(
			"voice_preset_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini')`,
		),
	],
);

// 채널 기본 프리셋(T8 스펙 2절, ADR 0005). 채널마다 하나(기본 키), 프리셋은 한 채널의 기본만 된다(유니크).
// 채널 ↔ 프리셋이 서로 가리키지 않게 따로 둔다. 어느 쪽을 지워도 이 줄이 지워진다.
// 기본 프리셋의 채널이 그 프리셋의 채널인지는 프로시저가 같은 트랜잭션에서 지킨다(routers/preset.ts setDefault)
export const channelDefaultPreset = pgTable(
	"channel_default_preset",
	{
		channelId: uuid("channel_id")
			.primaryKey()
			.references(() => channel.id, { onDelete: "cascade" }),
		presetId: uuid("preset_id")
			.notNull()
			.references(() => voicePreset.id, { onDelete: "cascade" }),
	},
	(t) => [uniqueIndex("channel_default_preset_preset").on(t.presetId)],
);
