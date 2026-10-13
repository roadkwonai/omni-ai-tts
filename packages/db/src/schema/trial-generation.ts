import { sql } from "drizzle-orm";
import {
	bytea,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// 시험 생성 기록과 들은 결과(ADR 0003 '듣기 결과', T5 스펙 5절). 요청 id를 공급자 호출 전에 선점하고, 완료되면 오디오(MP3, Gemini는 WAV, audio_type)를 담아 30일 보관한다.
// user 외래 키는 걸지 않는다(T4와 같다, 지속 소유 데이터의 외래 키는 T6에서 정한다).
export const trialGeneration = pgTable(
	"trial_generation",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		// 사용자 동작 하나에 브라우저가 만든 값. 같은 값의 재전송은 공급자를 다시 부르지 않는다
		requestId: uuid("request_id").notNull(),
		// 정리한 (공급자, 성우, 모델, 설정, 문장, 판)의 SHA-256(packages/api/src/trial.ts comboKey)
		comboKey: text("combo_key").notNull(),
		provider: text("provider").notNull(),
		voiceId: text("voice_id").notNull(),
		model: text("model").notNull(),
		// 그 모델이 받는 옵션만, 정리한 값(trial-options usedSettings)
		settings: jsonb("settings").notNull(),
		// 사용자가 쓴 문장(태그 제외, NFC, 앞뒤 공백 제거)
		text: text("text").notNull(),
		usageAmount: integer("usage_amount").notNull(),
		usageUnit: text("usage_unit").notNull(),
		status: text("status").notNull(),
		failureReason: text("failure_reason"),
		audio: bytea("audio"),
		audioType: text("audio_type"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		// 마지막으로 들은 때 + 30일. 만료 행은 새 결과를 쓸 때 지운다(cron 없음)
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		unique("trial_generation_request").on(t.ownerId, t.requestId),
		// 소유자별 동시 1건(tts-provider). 조회가 아니라 선점 insert가 이 인덱스에 걸려 막힌다
		uniqueIndex("trial_generation_one_pending")
			.on(t.ownerId)
			.where(sql`${t.status} = 'pending'`),
		// 저장된 결과 찾기(소유자·조합 키, 최신)
		index("trial_generation_find")
			.on(t.ownerId, t.comboKey, t.createdAt.desc())
			.where(sql`${t.status} = 'done'`),
		// 성우별 결과 목록(최신순)
		index("trial_generation_voice").on(
			t.ownerId,
			t.provider,
			t.voiceId,
			t.createdAt.desc(),
		),
		check(
			"trial_generation_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini')`,
		),
		check(
			"trial_generation_status",
			sql`${t.status} in ('pending', 'done', 'failed', 'unknown')`,
		),
		// usd_micro: Gemini 추정 금액(백만분의 1달러, T7.6)
		check(
			"trial_generation_usage_unit",
			sql`${t.usageUnit} in ('credit', 'byte', 'free', 'usd_micro')`,
		),
		// 완료된 행만 오디오가 있다
		check(
			"trial_generation_audio",
			sql`(${t.status} = 'done') = (${t.audio} is not null)`,
		),
	],
);
