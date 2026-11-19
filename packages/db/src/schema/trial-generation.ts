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

// 생성 기록(GLOSSARY): 시험 생성(T5, kind 'trial')과 음성 생성(T9, kind 'studio')의 요청 id를 공급자 호출 전에 선점하고,
// 완료되면 오디오(MP3, Gemini는 WAV, audio_type)를 담아 30일 보관한다. 작업실 오디오는 32MiB까지이고 조각으로 읽는다(저장 방식 EXTERNAL, 마이그레이션 studio_audio_storage).
// 드라마 작업실(T9.5, kind 'drama')의 테이크도 같은 표에 쌓는다. 드라마 행은 script·segments를 더 쓴다.
// user 외래 키는 걸지 않는다(ADR 0012, 두 번째 소유자를 받을 때 다시 정한다).
export const trialGeneration = pgTable(
	"trial_generation",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		// 어느 화면의 기록인가(T9 스펙 3절). 'trial' 내 문장 듣기, 'studio' 음성 작업실, 'drama' 드라마 작업실(T9.5).
		// 조합 키에도 들어가(packages/api/src/trial.ts comboKey) 재사용·결과 목록이 화면별로 나뉜다. 동시 1건은 세 화면을 합쳐 센다
		kind: text("kind")
			.$type<"trial" | "studio" | "drama">()
			.default("trial")
			.notNull(),
		// 사용자 동작 하나에 브라우저가 만든 값. 같은 값의 재전송은 공급자를 다시 부르지 않는다
		requestId: uuid("request_id").notNull(),
		// 정리한 (공급자, 성우, 모델, 설정, 문장, 판)의 SHA-256(packages/api/src/trial.ts comboKey)
		comboKey: text("combo_key").notNull(),
		provider: text("provider").notNull(),
		// 드라마 행은 보낸 순서의 성우 id를 쉼표로 이은 값
		voiceId: text("voice_id").notNull(),
		model: text("model").notNull(),
		// 그 모델이 받는 옵션만, 정리한 값(trial-options usedSettings)
		settings: jsonb("settings").notNull(),
		// 사용자가 쓴 문장(태그 제외, NFC, 앞뒤 공백 제거). 드라마 행은 화자 표식이 든 보낸 글
		text: text("text").notNull(),
		// 테이크의 대본(장면 이름, 화자 이름·성우, 줄). 무대·테이크 묶기·되돌리기가 쓴다
		script: jsonb("script"),
		// 줄 구간(초). 나누지 못하면 null
		segments:
			jsonb("segments").$type<
				{ start: number; end: number; cutStart: number; cutEnd: number }[]
			>(),
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
		// 작업실 이전 결과(소유자, 최신순). 작업실 행만 담는다(query-partial-indexes).
		// trial.ts listStudio가 같은 조건 글자(kind = 'studio', 매개변수 아님)로 찾는다
		index("trial_generation_studio")
			.on(t.ownerId, t.createdAt.desc())
			.where(sql`${t.kind} = 'studio'`),
		// 드라마 작업실 이전 결과(소유자, 최신순). 드라마 행만 담는다(query-partial-indexes).
		// 드라마 목록 조회는 같은 조건 글자(kind = 'drama')로 찾는다
		index("trial_generation_drama")
			.on(t.ownerId, t.createdAt.desc())
			.where(sql`${t.kind} = 'drama'`),
		check(
			"trial_generation_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini')`,
		),
		check(
			"trial_generation_status",
			sql`${t.status} in ('pending', 'done', 'failed', 'unknown')`,
		),
		check(
			"trial_generation_kind",
			sql`${t.kind} in ('trial', 'studio', 'drama')`,
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
