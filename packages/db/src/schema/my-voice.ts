import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// 내 보이스(T13 계획 2.1, GLOSSARY '내 보이스'). 앱에서 만든 공급자 클론 하나가 한 행이다.
// 보관함과의 연결 칸은 두지 않는다. 보관함 행은 saved_voice의 (owner_id, provider, voice_id = provider_voice_id)로 찾는다.
// user 외래 키는 걸지 않는다(ADR 0004와 같다, T14에서 정한다)
export const myVoice = pgTable(
	"my_voice",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		provider: text("provider")
			.$type<"typecast" | "elevenlabs" | "fish_audio" | "airy" | "gemini">()
			.notNull(),
		// 공급자가 준 클론 id. 만들기 응답 전에는 null
		providerVoiceId: text("provider_voice_id"),
		name: text("name").notNull(),
		status: text("status")
			.$type<
				"sending" | "processing" | "ready" | "failed" | "unknown" | "deleting"
			>()
			.notNull(),
		// 실패·미확인·삭제 대기 사유
		reason: text("reason"),
		// 만들기 요청 id. 같은 id 재전송은 fingerprint가 같을 때만 같은 행을 돌려준다
		requestId: uuid("request_id").notNull(),
		fingerprint: text("fingerprint").notNull(),
		// 본인 음성 동의 시각과 동의 문구 판
		consentAt: timestamp("consent_at", {
			withTimezone: true,
			precision: 3,
		}).notNull(),
		consentVersion: text("consent_version").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// 재전송 재생. 만들기 insert의 충돌 대상이다
		unique("my_voice_request").on(t.ownerId, t.requestId),
		// 소유자별 만들기 진행 1건
		uniqueIndex("my_voice_one_sending")
			.on(t.ownerId)
			.where(sql`${t.status} = 'sending'`),
		// 공급자 클론 하나는 매핑 하나뿐(두 소유자가 같은 id를 가질 수 없다)
		uniqueIndex("my_voice_provider_voice")
			.on(t.provider, t.providerVoiceId)
			.where(sql`${t.providerVoiceId} is not null`),
		// 목록(최근 만든 순)
		index("my_voice_owner_created").on(t.ownerId, t.createdAt.desc()),
		check(
			"my_voice_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini')`,
		),
		check(
			"my_voice_status",
			sql`${t.status} in ('sending', 'processing', 'ready', 'failed', 'unknown', 'deleting')`,
		),
	],
);
