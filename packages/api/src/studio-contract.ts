// packages/api/src/studio-contract.ts
import { z } from "zod";

import {
	PARAGRAPH_TAG_ITEMS_MAX,
	PARAGRAPH_TAG_TOTAL_MAX,
} from "./paragraph-tags";
import {
	airySettingsSchema,
	elevenLabsSettingsSchema,
	feelSchema,
	fishSettingsSchema,
	geminiSettingsSchema,
	textSchemaOf,
	trialFailureSchema,
	typecastSettingsSchema,
	usageSchema,
	voiceIdSchema,
} from "./providers/trial-contract";
import {
	AIRY_MODELS,
	codePoints,
	ELEVENLABS_MODELS,
	FISH_MODELS,
	GEMINI_DIRECTION_MAX,
	GEMINI_MODELS,
	PARAGRAPHS_MAX,
	partsOf,
	STUDIO_AUDIO_MAX,
	studioTextMax,
	type TrialRequest,
	TYPECAST_MODELS,
} from "./providers/trial-options";

// 음성 작업실 프로시저의 입력·출력(T9 스펙 3절). 서버가 검증하고 화면은 이 파일에서 타입만 가져간다(import type).
// 값 상수(STUDIO_*)는 화면도 쓰므로 zod 없는 trial-options.ts에 있다(계획 '스펙과 다른 점' 1)

// 작업실 요청: 시험 생성 요청 계약(분기 순서·설정 스키마 같음) + 공급자별 대본 상한(스펙 4.1절). Typecast 요청 모양은 T9와 같다
export const studioRequestSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("typecast"),
		voiceId: voiceIdSchema,
		text: textSchemaOf(studioTextMax("typecast")),
		settings: typecastSettingsSchema,
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		voiceId: voiceIdSchema,
		text: textSchemaOf(studioTextMax("elevenlabs")),
		settings: elevenLabsSettingsSchema,
	}),
	z.object({
		provider: z.literal("fish_audio"),
		voiceId: voiceIdSchema,
		text: textSchemaOf(studioTextMax("fish_audio")),
		settings: fishSettingsSchema,
	}),
	z.object({
		provider: z.literal("airy"),
		voiceId: voiceIdSchema,
		text: textSchemaOf(studioTextMax("airy")),
		settings: airySettingsSchema,
	}),
	z.object({
		provider: z.literal("gemini"),
		voiceId: voiceIdSchema,
		text: textSchemaOf(studioTextMax("gemini")),
		settings: geminiSettingsSchema,
	}),
]);
export type StudioRequest = z.output<typeof studioRequestSchema>;
// 작업실 요청은 TrialRequest로 쓸 수 있어야 한다(조합 키·공급자 호출이 같은 함수)
const _asTrial: TrialRequest = {} as StudioRequest;
void _asTrial;

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

// 저장된 결과 찾기: 요청 하나당 결과 하나 또는 없음(스펙 4.1절)
export const studioFoundSchema = studioResultSchema.extend({
	status: z.enum(["done", "unknown"]),
});
export type StudioFound = z.infer<typeof studioFoundSchema>;
export const studioFindManyInputSchema = z
	.array(studioRequestSchema)
	.min(1)
	.max(PARAGRAPHS_MAX);

// 결과 하나의 정보(T18 CLI 내려받기). 조각을 받기 전에 길이와 형식을 안다
export const studioInfoInputSchema = z.object({ id: z.uuid() });
export const studioInfoSchema = studioResultSchema.extend({
	audioType: z.enum(["audio/mpeg", "audio/wav"]),
});
export type StudioInfo = z.infer<typeof studioInfoSchema>;

// 요청 id의 상태(T18 CLI 중단 복구). studioRequestSchema(만들 요청의 내용)와 다르다
export const studioRequestStatusInputSchema = z.object({
	requestId: z.uuid(),
});
export const studioRequestStatusSchema = studioResultSchema.extend({
	status: z.enum(["pending", "done", "failed", "unknown"]),
	reason: trialFailureSchema.nullable(),
});
export type StudioRequestStatus = z.infer<typeof studioRequestStatusSchema>;

// 조각 하나. 번호는 0부터 32MiB 결과의 마지막 조각(10)까지
export const studioAudioInputSchema = z.object({
	id: z.uuid(),
	part: z
		.number()
		.int()
		.min(0)
		.max(partsOf(STUDIO_AUDIO_MAX) - 1),
});

// 자동 태그 추천(T10 스펙 15.3). 공급자·모델로 family를 정한다. emotions는 Typecast 성우가 가진 감정이고 제안을 좁히는 데만 쓴다.
// direction은 Gemini 문단의 지금 말투 지시이고 다른 공급자는 빈 글이다(superRefine)
const tagFields = {
	emotions: z.array(z.string().max(32)).max(20).nullable(),
	direction: z
		.string()
		.max(GEMINI_DIRECTION_MAX * 4)
		.refine((text) => codePoints(text) <= GEMINI_DIRECTION_MAX),
	feel: feelSchema.optional(),
};
export const studioAutoTagInputSchema = z
	.object({
		paragraphs: z
			.array(
				z.discriminatedUnion("provider", [
					z.object({
						provider: z.literal("typecast"),
						model: z.enum(TYPECAST_MODELS),
						text: textSchemaOf(studioTextMax("typecast")),
						...tagFields,
					}),
					z.object({
						provider: z.literal("elevenlabs"),
						model: z.enum(ELEVENLABS_MODELS),
						text: textSchemaOf(studioTextMax("elevenlabs")),
						...tagFields,
					}),
					z.object({
						provider: z.literal("fish_audio"),
						model: z.enum(FISH_MODELS),
						text: textSchemaOf(studioTextMax("fish_audio")),
						...tagFields,
					}),
					z.object({
						provider: z.literal("airy"),
						model: z.enum(AIRY_MODELS),
						text: textSchemaOf(studioTextMax("airy")),
						...tagFields,
					}),
					z.object({
						provider: z.literal("gemini"),
						model: z.enum(GEMINI_MODELS),
						text: textSchemaOf(studioTextMax("gemini")),
						...tagFields,
					}),
				]),
			)
			.min(1)
			.max(PARAGRAPH_TAG_ITEMS_MAX),
	})
	.superRefine((req, ctx) => {
		req.paragraphs.forEach((paragraph, i) => {
			if (paragraph.provider !== "gemini" && paragraph.direction)
				ctx.addIssue({
					code: "custom",
					path: ["paragraphs", i, "direction"],
				});
		});
		// 긴 대본은 답 JSON이 출력 상한에서 잘려 돈만 쓴다(드라마 자동 태그와 같다)
		const total = req.paragraphs.reduce(
			(sum, paragraph) => sum + codePoints(paragraph.text),
			0,
		);
		if (total > PARAGRAPH_TAG_TOTAL_MAX)
			ctx.addIssue({ code: "custom", path: ["paragraphs"], message: "total" });
	});
export type StudioAutoTagInput = z.input<typeof studioAutoTagInputSchema>;

// 입력과 같은 수·차례. 검사를 통과하지 못한 칸은 원래 값이다. skipped는 태그·감정을 받지 않는 문단(ElevenLabs v2·flash) 수
export const studioAutoTagOutputSchema = z.object({
	paragraphs: z.array(
		z.object({
			text: z.string(),
			direction: z.string(),
			feel: feelSchema.optional(),
		}),
	),
	skipped: z.number().int(),
});
export type StudioAutoTagOutput = z.output<typeof studioAutoTagOutputSchema>;
