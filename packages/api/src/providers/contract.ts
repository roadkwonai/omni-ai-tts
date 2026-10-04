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
