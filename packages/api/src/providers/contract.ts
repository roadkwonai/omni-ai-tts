import { z } from "zod";

// 화면과 서버가 함께 쓰는 공급자 계약이다. SDK와 서버 모듈을 import하지 않는다.
// 화면은 이 파일에서 타입만 가져간다(import type). zod가 클라이언트 번들에 들어가지 않게 하기 위해서다.
export const providerIdSchema = z.enum([
	"typecast",
	"elevenlabs",
	"fish_audio",
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

// 잔여 사용량. 공급자가 준 값만 담는다. 단위는 공급자마다 다르다(Typecast 크레딧, ElevenLabs 글자, Fish Audio API 크레딧).
export const remainingQuotaSchema = z.object({
	remaining: z.number(),
	total: z.number().nullable(), // Fish Audio는 전체 값이 없다
	plan: z.string().nullable(), // Typecast만
	resetAt: z.iso.datetime().nullable(), // ElevenLabs만
	overageAllowed: z.boolean(), // ElevenLabs 한도 확장(max_credit_limit_extension이 0이 아님)
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
// 화면은 zod를 가져가지 않으므로 타입만 둔다. 연결 상태에서 '연결됨'·'확인 실패'를 빼고 '결과 모름'을 더한 것이다.
export type ProviderFailure =
	| Exclude<ConnectionStatus, "connected" | "check_failed">
	| "unknown_outcome";
export type ProviderErrorData = {
	provider: ProviderId;
	reason: ProviderFailure;
};

// 성우 하나(T3 스펙 5절 1). 공급자가 준 값만 담고 추정하지 않는다. 성별·연령이 없으면 null이다.
export const voiceSchema = z.object({
	provider: providerIdSchema,
	voiceId: z.string().min(1),
	// 화면 이름. Typecast는 한글 이름(비면 영문 이름)
	name: z.string(),
	// 화면 이름과 다른 영문 이름. 없거나 같으면 null
	englishName: z.string().nullable(),
	gender: z.enum(["male", "female"]).nullable(),
	// Typecast child·teenager·young_adult·middle_age·elder. 모르는 값도 그대로 받는다
	age: z.string().nullable(),
	// 콘텐츠. 실제 값이 SDK enum과 달라 문자열로 받는다(스펙 3절)
	useCases: z.array(z.string()),
	models: z.array(
		z.object({ model: z.string(), emotions: z.array(z.string()) }),
	),
	// 기본 샘플. 브라우저가 공급자 주소에서 바로 받는다. 오디오 src에 다른 스킴이 들어가지 않게 https만 받는다
	previewUrl: z.url({ protocol: /^https$/ }).nullable(),
});
export type Voice = z.infer<typeof voiceSchema>;

export const voiceListResultSchema = z.object({
	provider: providerIdSchema,
	voices: z.array(voiceSchema),
	fetchedAt: z.iso.datetime(),
});
export type VoiceListResult = z.infer<typeof voiceListResultSchema>;
