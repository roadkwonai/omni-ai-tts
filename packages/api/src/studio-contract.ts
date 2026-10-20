// packages/api/src/studio-contract.ts
import { z } from "zod";

import {
	textSchemaOf,
	typecastSettingsSchema,
	usageSchema,
	voiceIdSchema,
} from "./providers/trial-contract";
import {
	partsOf,
	STUDIO_AUDIO_MAX,
	STUDIO_TEXT_MAX,
} from "./providers/trial-options";

// 음성 작업실 프로시저의 입력·출력(T9 스펙 3절). 서버가 검증하고 화면은 이 파일에서 타입만 가져간다(import type).
// 값 상수(STUDIO_*)는 화면도 쓰므로 zod 없는 trial-options.ts에 있다(계획 '스펙과 다른 점' 1)

// 작업실 요청: T5 Typecast 요청 계약 + 2,000자 대본. 이번에는 Typecast만(스펙 3절)
export const studioRequestSchema = z.object({
	provider: z.literal("typecast"),
	voiceId: voiceIdSchema,
	text: textSchemaOf(STUDIO_TEXT_MAX),
	settings: typecastSettingsSchema,
});
export type StudioRequest = z.output<typeof studioRequestSchema>;

export const studioCreateInputSchema = z.object({
	requestId: z.uuid(),
	request: studioRequestSchema,
});

// 결과 하나(오디오 없음). 오디오는 studioAudio로 조각을 받아 합친다(스펙 2절 A안). bytes는 저장한 오디오 길이(미확인은 0)
export const studioResultSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
	bytes: z.number().int().nonnegative(),
});
export type StudioResult = z.infer<typeof studioResultSchema>;

// 이전 결과 한 줄. 요청을 통째로 담아 '저장된 결과 열기' 판정과 파일 이름에 쓴다(T5 trialItemSchema와 같다)
export const studioItemSchema = studioResultSchema.extend({
	status: z.enum(["done", "unknown"]),
	request: studioRequestSchema,
});
export type StudioItem = z.output<typeof studioItemSchema>;
export type StudioItemInput = z.input<typeof studioItemSchema>;

// 조각 하나. 번호는 0부터 32MiB 결과의 마지막 조각(10)까지
export const studioAudioInputSchema = z.object({
	id: z.uuid(),
	part: z
		.number()
		.int()
		.min(0)
		.max(partsOf(STUDIO_AUDIO_MAX) - 1),
});
