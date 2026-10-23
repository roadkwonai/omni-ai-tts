import { z } from "zod";

import { type ProviderErrorData, providerFailureSchema } from "./contract";
import {
	AIRY_LANGUAGES,
	AIRY_MODELS,
	AIRY_STYLES,
	codePoints,
	DEFAULT_SETTINGS,
	ELEVENLABS_MODELS,
	EMOTION_PRESETS,
	FISH_MODELS,
	GEMINI_DIRECTION_MAX,
	GEMINI_MODELS,
	normalizeText,
	RANGES,
	type Range,
	TRIAL_TAG_MAX,
	TRIAL_TEXT_MAX,
	type TrialRequest,
	TYPECAST_MODELS,
	V21_PRESETS,
} from "./trial-options";

// 시험 생성 입력·출력 계약(T5 스펙 5절). 서버가 검증하고, 화면은 이 파일에서 타입만 가져간다(import type).
const num = ({ min, max, default: value }: Range) =>
	z.number().min(min).max(max).default(value);
// 말투 태그는 대괄호 안 글자다(앱이 대괄호를 붙인다). 비면 태그 없음
const tagSchema = z
	.string()
	.trim()
	.max(TRIAL_TAG_MAX)
	.regex(/^[^[\]\r\n]*$/)
	.default("");

const tc = RANGES.typecast;
export const typecastSettingsSchema = z
	.object({
		model: z.enum(TYPECAST_MODELS).default(DEFAULT_SETTINGS.typecast.model),
		emotion: z
			.enum(["smart", "preset"])
			.default(DEFAULT_SETTINGS.typecast.emotion),
		preset: z.enum(EMOTION_PRESETS).default(DEFAULT_SETTINGS.typecast.preset),
		intensity: num(tc.intensity),
		language: z
			.enum(["auto", "kor"])
			.default(DEFAULT_SETTINGS.typecast.language),
		tempo: num(tc.tempo),
		pitch: num(tc.pitch),
		volume: num(tc.volume),
	})
	.refine((s) => s.model === "ssfm-v30" || V21_PRESETS.includes(s.preset), {
		path: ["preset"],
	});
const el = RANGES.elevenlabs;
export const elevenLabsSettingsSchema = z.object({
	model: z.enum(ELEVENLABS_MODELS).default(DEFAULT_SETTINGS.elevenlabs.model),
	stability: num(el.stability),
	similarity: num(el.similarity),
	style: num(el.style),
	speed: num(el.speed),
	speakerBoost: z.boolean().default(DEFAULT_SETTINGS.elevenlabs.speakerBoost),
	tag: tagSchema,
});
const fish = RANGES.fish_audio;
export const fishSettingsSchema = z.object({
	model: z.enum(FISH_MODELS).default(DEFAULT_SETTINGS.fish_audio.model),
	speed: num(fish.speed),
	temperature: num(fish.temperature),
	tag: tagSchema,
});
export const airySettingsSchema = z.object({
	model: z.enum(AIRY_MODELS).default(DEFAULT_SETTINGS.airy.model),
	language: z.enum(AIRY_LANGUAGES).default(DEFAULT_SETTINGS.airy.language),
	style: z.enum(AIRY_STYLES).default(DEFAULT_SETTINGS.airy.style),
});
export const geminiSettingsSchema = z.object({
	model: z.enum(GEMINI_MODELS).default(DEFAULT_SETTINGS.gemini.model),
	// 말투 지시: 한 줄 자유 문장(줄바꿈 없음, 앞뒤 공백 제거). 비면 보내지 않는다(T7.6 스펙 2절)
	direction: z
		.string()
		.trim()
		.max(GEMINI_DIRECTION_MAX)
		.regex(/^[^\r\n]*$/)
		.default(""),
});

// 공급자 성우 id: Typecast tc_·uc_, ElevenLabs 20자, Fish Audio 32자 16진, Airy 16자리 16진(실측), Gemini 소문자 이름(kore)·ko-kr-역할-번호(실측). ElevenLabs 경로에 그대로 들어가므로 글자를 묶는다
export const voiceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
// 글: NFC로 맞추고 앞뒤 공백을 지운 뒤 1~max자(코드 포인트). 원문은 정리 전에 max × 4(UTF-16)까지만 받는다(풀어 쓴 한글·이모지 여유).
// 내 문장은 200자, 작업실 대본은 2,000자다(studio-contract)
export const textSchemaOf = (max: number) =>
	z
		.string()
		.max(max * 4)
		.transform(normalizeText)
		.pipe(
			z
				.string()
				.min(1)
				.refine((text) => codePoints(text) <= max),
		);
const textSchema = textSchemaOf(TRIAL_TEXT_MAX);

export const trialRequestSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("typecast"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: typecastSettingsSchema,
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: elevenLabsSettingsSchema,
	}),
	z.object({
		provider: z.literal("fish_audio"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: fishSettingsSchema,
	}),
	z.object({
		provider: z.literal("airy"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: airySettingsSchema,
	}),
	z.object({
		provider: z.literal("gemini"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: geminiSettingsSchema,
	}),
]);
// 계약과 trial-options의 요청 타입이 어긋나면 타입 검사가 잡는다
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameRequest: Same<
	z.output<typeof trialRequestSchema>,
	TrialRequest
> = true;
void _sameRequest;

export const trialCreateInputSchema = z.object({
	requestId: z.uuid(),
	request: trialRequestSchema,
});

export const usageSchema = z.object({
	unit: z.enum(["credit", "byte", "free", "usd_micro"]),
	amount: z.number().nonnegative(),
});
// 들은 결과 하나(오디오 포함). 오디오는 File(MP3, Gemini는 WAV)이고 RPC가 바이너리로 보낸다(Task 1)
export const trialAudioSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
	audio: z.file(),
});
export type TrialAudio = z.infer<typeof trialAudioSchema>;
// 저장된 결과 하나의 요약(오디오 없음). 소리는 trialAudio로 받는다
export const trialFoundSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
});
export type TrialFound = z.infer<typeof trialFoundSchema>;
// 결과 목록 한 줄(오디오 없음). 요청을 통째로 담아 '새로 만들기'와 저장된 결과 알아보기에 쓴다(계획 '스펙과 다른 점' 4)
export const trialItemSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
	request: trialRequestSchema,
});
export type TrialItem = z.output<typeof trialItemSchema>;
export type TrialItemInput = z.input<typeof trialItemSchema>;
// ElevenLabs 모델 크레딧 배율(character_cost_multiplier × cost_discount_multiplier)
export const trialModelRateSchema = z.object({
	model: z.enum(ELEVENLABS_MODELS),
	multiplier: z.number().positive(),
});
export type TrialModelRate = z.infer<typeof trialModelRateSchema>;

// 시험 생성 실패 사유(스펙 6절). 공급자 사유에 입력 거절·진행 중·무료 종료·요청 id 불일치·저장소를 더했다
export const trialFailureSchema = z.enum([
	...providerFailureSchema.options,
	"provider_input",
	"in_progress",
	"free_ended",
	"request_mismatch",
	"storage",
	// 작업실 서버 성우 검사: 이 소유자가 담은 Typecast 성우가 아니거나 현재 이용 불가(T9 스펙 5절)
	"voice_unavailable",
]);
export type TrialFailure = z.infer<typeof trialFailureSchema>;
// 시험 생성 오류의 data. provider_input이면 공급자 오류 코드(화면이 문구를 고른다). 저장소 오류는 공급자가 없을 수 있다(결과 id로 부를 때)
export type TrialErrorData = Omit<ProviderErrorData, "provider" | "reason"> & {
	provider?: ProviderErrorData["provider"];
	reason: TrialFailure;
	providerCode?: string;
};
