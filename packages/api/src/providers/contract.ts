import { z } from "zod";

// 화면과 서버가 함께 쓰는 공급자 계약이다. SDK와 서버 모듈을 import하지 않는다.
// 화면은 이 파일에서 타입만 가져간다(import type). zod가 클라이언트 번들에 들어가지 않게 하기 위해서다.
export const providerIdSchema = z.enum([
	"typecast",
	"elevenlabs",
	"fish_audio",
	"airy",
	"gemini",
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

// 연결 상태 8종(스펙 4절)
export const connectionStatusSchema = z.enum([
	"connected",
	"no_key",
	"provider_auth",
	"no_permission",
	"quota",
	"rate_limit",
	"provider_error",
	"check_failed",
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

// Gemini는 잔액 조회 API가 없어 연결 상태의 quota가 null이다(T7.6 스펙 2절)
// 잔여 사용량. 공급자가 준 값만 담는다. 단위는 공급자마다 다르다(Typecast·Airy 크레딧, ElevenLabs 글자, Fish Audio API 충전 잔액).
export const remainingQuotaSchema = z.object({
	remaining: z.number(),
	total: z.number().nullable(), // Fish Audio·Airy는 전체 값이 없다
	plan: z.string().nullable(), // Typecast·Airy(tier)
	resetAt: z.iso.datetime().nullable(), // ElevenLabs만
	overageAllowed: z.boolean(), // ElevenLabs 한도 확장(max_credit_limit_extension이 0이 아님)
	// Fish Audio만: fish.audio 웹 플랜(구독 패키지) 크레딧. remaining(API 충전 잔액)과 따로 조회한다. 조회에 실패하면 없다
	webCredit: z
		.object({ plan: z.string(), remaining: z.number(), total: z.number() })
		.optional(),
});
export type RemainingQuota = z.infer<typeof remainingQuotaSchema>;

export const providerStatusResultSchema = z.object({
	provider: providerIdSchema,
	status: connectionStatusSchema,
	quota: remainingQuotaSchema.nullable(),
	providerCode: z.string().nullable(), // 공급자가 준 오류 코드. 없으면 "HTTP 503" 꼴
	retryAfterSeconds: z.number().int().nonnegative().nullable(),
	checkedAt: z.iso.datetime(),
});
export type ProviderStatusResult = z.infer<typeof providerStatusResultSchema>;

// 공급자 호출이 실패한 사유. 목록 조회가 던지는 ORPCError의 data.reason이고 화면이 이 값으로 안내를 고른다(T3 스펙 4절).
// 연결 상태에서 '연결됨'·'확인 실패'를 빼고 '결과 모름'을 더한 것이다. 지난 목록의 사유(stale.reason)도 이 값이다.
export const providerFailureSchema = z.enum([
	"no_key",
	"provider_auth",
	"no_permission",
	"quota",
	"rate_limit",
	"provider_error",
	"unknown_outcome",
]);
export type ProviderFailure = z.infer<typeof providerFailureSchema>;
export type ProviderErrorData = {
	provider: ProviderId;
	reason: ProviderFailure;
	// 429 Retry-After로 정한 다음 호출 가능 시각(ISO). 공급자가 주지 않으면 없다
	retryAt?: string;
};

// 성우의 출처(T4 스펙 2절): 공개 목록(공개 성우 라이브러리, Typecast 공개 성우) 또는 서버 키 계정의 계정 성우
export const voiceSourceSchema = z.enum(["public", "account"]);
export type VoiceSource = z.infer<typeof voiceSourceSchema>;

// 오디오 src에 다른 스킴이 들어가지 않게 https만 받는다. 공급자 호스트 검사는 공급자 모듈이 한다(스펙 3절)
const httpsUrl = z.url({ protocol: /^https$/ });

// 기본 샘플 하나. ElevenLabs는 언어별(verified_languages), Fish Audio는 제목이 있는 여러 개다
export const voiceSampleSchema = z.object({
	// 샘플 언어 코드. 모르면 null
	language: z.string().nullable(),
	// 공급자가 준 샘플 이름. 없으면 null
	title: z.string().nullable(),
	url: httpsUrl,
});
export type VoiceSample = z.infer<typeof voiceSampleSchema>;

// 이용 조건(브리프 5절 패널 4). 공급자가 준 값만 담는다. 주지 않으면 null·false다
export const voiceTermsSchema = z.object({
	// ElevenLabs 라이브러리 free_users_allowed
	freeUsersAllowed: z.boolean().nullable(),
	// ElevenLabs 공유가 끝난 뒤 쓸 수 있는 일수(notice_period)
	noticePeriodDays: z.number().int().nonnegative().nullable(),
	// ElevenLabs 실시간 검수 성우
	liveModeration: z.boolean(),
	// ElevenLabs 크레딧 배율(rate). 공급자 값 그대로
	creditRate: z.number().nonnegative().nullable(),
	// Fish Audio 보증 성우(licensed)
	licensed: z.boolean(),
	// Fish Audio 공개 종료 중(pvc_release_state retiring)
	retiring: z.boolean(),
});
export type VoiceTerms = z.infer<typeof voiceTermsSchema>;

// 성우 하나(T3 스펙 5절 1, T4 스펙 6절 1). 공급자가 준 값만 담고 추정하지 않는다.
export const voiceSchema = z.object({
	provider: providerIdSchema,
	source: voiceSourceSchema,
	voiceId: z.string().min(1),
	// 화면 이름. Typecast는 한글 이름(비면 영문 이름)
	name: z.string(),
	// 화면 이름과 다른 영문 이름(Typecast). 없거나 같으면 null
	englishName: z.string().nullable(),
	gender: z.enum(["male", "female", "neutral"]).nullable(),
	// 공급자 연령 값 그대로(Typecast young_adult, ElevenLabs middle_aged 등)
	age: z.string().nullable(),
	// ElevenLabs 억양(seoul, standard …)
	accent: z.string().nullable(),
	// Gemini 피치(low·medium·high, 공급자 값 그대로). 다른 공급자는 null.
	// 기본값은 T7.6 전에 담은 보관함 행(saved_voice.voice)을 다시 읽을 때를 위한 것이다
	pitch: z.string().nullable().default(null),
	// Gemini 페르소나(여러 값이면 ' | '로 나눈 각각, 공급자 값 그대로). 다른 공급자는 []
	personas: z.array(z.string()).default([]),
	// 콘텐츠(공급자 use_cases). 실제 값이 문서 enum과 달라 문자열로 받는다
	useCases: z.array(z.string()),
	// 분위기(ElevenLabs descriptive)
	descriptives: z.array(z.string()),
	// Fish Audio 태그 그대로(성별·연령·콘텐츠·분위기가 섞여 있다). 다른 공급자는 []
	tags: z.array(z.string()),
	// 공급자가 준 언어 코드
	languages: z.array(z.string()),
	// 공급자 성우 종류(ElevenLabs category). 사용자 분류의 카테고리(classification 표)와 다르다
	category: z.string().nullable(),
	// 계정 성우의 출처: premade 제공 성우, saved 라이브러리에서 저장, own 내가 만든 성우. 공개 목록은 null
	origin: z.enum(["premade", "saved", "own"]).nullable(),
	description: z.string().max(1000).nullable(),
	// Typecast 모델별 감정. 다른 공급자는 []
	models: z.array(
		z.object({ model: z.string(), emotions: z.array(z.string()) }),
	),
	// 행의 샘플. 브라우저가 공급자 주소에서 바로 받는다
	previewUrl: httpsUrl.nullable(),
	// 패널의 샘플 전부(언어별·제목별). Typecast는 [](패널은 previewUrl을 쓴다)
	samples: z.array(voiceSampleSchema),
	// 사용량: ElevenLabs 최근 1년 글자 수, Fish Audio 사용 횟수
	usage: z
		.object({
			kind: z.enum(["chars_1y", "tasks"]),
			count: z.number().int().nonnegative(),
		})
		.nullable(),
	terms: voiceTermsSchema,
});
export type Voice = z.infer<typeof voiceSchema>;

// 목록 한 페이지(공급자 모듈이 돌려주고 목록 캐시가 보관하는 값)
export const voiceListPageSchema = z.object({
	voices: z.array(voiceSchema),
	// 다음 페이지: ElevenLabs 공개·Fish Audio는 페이지 번호, ElevenLabs 내 계정은 커서. 끝이면 null
	next: z.union([z.number().int().nonnegative(), z.string().min(1)]).nullable(),
	// 공급자가 준 전체 수. 주지 않으면 null
	total: z.number().int().nonnegative().nullable(),
	// 전체 수가 정확한가(Fish Audio total_is_exact)
	totalExact: z.boolean(),
	// 공급자가 조건마다 보여 주는 수에 상한이 있다(Fish Audio 1,000명)
	windowLimited: z.boolean(),
});
export type VoiceListPage = z.infer<typeof voiceListPageSchema>;

export const voiceListResultSchema = voiceListPageSchema.extend({
	provider: providerIdSchema,
	source: voiceSourceSchema,
	fetchedAt: z.iso.datetime(),
	// 공급자가 실패해 지난 목록(만료 뒤 7일 안)을 돌려줄 때만 있다
	stale: z
		.object({
			reason: providerFailureSchema,
			retryAt: z.iso.datetime().nullable(),
		})
		.nullable(),
});
export type VoiceListResult = z.infer<typeof voiceListResultSchema>;

// 공급자에게 그대로 가는 조건 값. 화면은 고정 선택지만 보낸다(브리프 6절). 실측 값: ko, gyeongsang, middle-aged, social-media
export const conditionValueSchema = z
	.string()
	.trim()
	.min(1)
	.max(40)
	.regex(/^[A-Za-z0-9_-]+$/);
const searchSchema = z.string().trim().max(100);
// 화면 선택지 최대치(Fish Audio 태그 드롭다운 넷 합계 34, ElevenLabs 분위기 18)보다 크게. 고정 선택지만 고르면 BAD_REQUEST가 나지 않는다(스펙 4절)
const valuesSchema = z.array(conditionValueSchema).max(40);
const optionalValue = conditionValueSchema.nullable();

// 목록 입력(T4 스펙 3절). 페이지 크기는 공급자 모듈이 100으로 정한다.
export const voiceListInputSchema = z.union([
	z.object({ provider: z.literal("typecast") }),
	// Airy: 공식 목록 하나(공개 출처, 조건 없음, T7.5 스펙 3절)
	z.object({ provider: z.literal("airy") }),
	// Gemini: 한국어 목록 + 대표 성우(공개 출처, 조건 없음, T7.6 스펙 4절)
	z.object({ provider: z.literal("gemini") }),
	z.object({
		provider: z.literal("elevenlabs"),
		source: z.literal("public"),
		page: z.number().int().min(0).max(999),
		query: z.object({
			search: searchSchema,
			// null이면 모든 언어
			language: optionalValue,
			accent: optionalValue,
			gender: optionalValue,
			age: optionalValue,
			category: z.enum(["professional", "famous", "high_quality"]).nullable(),
			useCases: valuesSchema,
			descriptives: valuesSchema,
			featured: z.boolean(),
			sort: z.enum([
				"trending",
				"created_date",
				"usage_character_count_1y",
				"cloned_by_count",
			]),
		}),
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		source: z.literal("account"),
		// 첫 페이지는 null, 다음은 공급자가 준 next_page_token
		cursor: z.string().min(1).max(1000).nullable(),
		query: z.object({
			search: searchSchema,
			// ElevenLabs 계정 성우 출처 필터(화면 '출처'). 사용자 분류의 타입(classification kind 'type')과 다르다
			voiceType: z.enum(["personal", "community", "default"]).nullable(),
			category: z
				.enum(["premade", "cloned", "generated", "professional"])
				.nullable(),
			gender: optionalValue,
			age: optionalValue,
			language: optionalValue,
			accent: optionalValue,
			useCases: valuesSchema,
			sort: z.enum(["created_at_unix", "name"]),
			direction: z.enum(["desc", "asc"]),
		}),
	}),
	z.object({
		provider: z.literal("fish_audio"),
		source: voiceSourceSchema,
		// 조건마다 1,000명(100명 × 10페이지)까지다(2026-10-04 실측)
		page: z.number().int().min(1).max(10),
		query: z.object({
			search: searchSchema,
			language: optionalValue,
			// 모두 포함(AND, 2026-10-04 실측)
			tags: valuesSchema,
			licensed: z.boolean(),
			sort: z.enum(["score", "task_count", "created_at"]),
		}),
	}),
]);
export type VoiceListInput = z.infer<typeof voiceListInputSchema>;
export type ListInputOf<P extends ProviderId> = Extract<
	VoiceListInput,
	{ provider: P }
>;

// ElevenLabs 억양 하나(억양 조건의 선택지). value는 조회 값, name은 공급자 표시 이름
export const accentSchema = z.object({ value: z.string(), name: z.string() });
export type Accent = z.infer<typeof accentSchema>;
export const accentListSchema = z.object({
	language: z.string(),
	accents: z.array(accentSchema),
	fetchedAt: z.iso.datetime(),
	stale: voiceListResultSchema.shape.stale,
});
export type AccentList = z.infer<typeof accentListSchema>;
