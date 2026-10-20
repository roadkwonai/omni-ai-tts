// packages/api/src/preset-contract.ts
import { z } from "zod";

import { nameSchema } from "./classification-contract";
import { NAME_MAX } from "./classification-rules";
import { type ProviderId, voiceSchema } from "./providers/contract";
import {
	airySettingsSchema,
	elevenLabsSettingsSchema,
	fishSettingsSchema,
	geminiSettingsSchema,
	typecastSettingsSchema,
} from "./providers/trial-contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	type SettingsOf,
} from "./providers/trial-options";
import { savedVoiceInputSchema } from "./saved-voice-contract";

// 프리셋 프로시저의 입력·출력(T8 스펙 3절). 설정은 내 문장 듣기와 같은 공급자별 스키마로 검사·정리한다(T5 계약 재사용).
// 화면은 이 파일에서 타입만 가져간다(import type)
const SETTINGS_SCHEMA = {
	typecast: typecastSettingsSchema,
	elevenlabs: elevenLabsSettingsSchema,
	fish_audio: fishSettingsSchema,
	airy: airySettingsSchema,
	gemini: geminiSettingsSchema,
} as const;

// 공급자와 그 설정 한 벌. 입력·출력이 함께 쓴다
export const presetSettingsSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("typecast"),
		settings: typecastSettingsSchema,
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		settings: elevenLabsSettingsSchema,
	}),
	z.object({ provider: z.literal("fish_audio"), settings: fishSettingsSchema }),
	z.object({ provider: z.literal("airy"), settings: airySettingsSchema }),
	z.object({ provider: z.literal("gemini"), settings: geminiSettingsSchema }),
]);
// 공급자와 설정의 짝(화면이 저장 값을 만들 때 쓴다. Pick<Preset, …>은 짝을 잃는다)
export type PresetValue = z.output<typeof presetSettingsSchema>;

const channelFields = {
	name: nameSchema,
	channelId: z.uuid().nullable(),
	channelDefault: z.boolean(),
};
// 채널 없이 채널 기본은 없다
const defaultNeedsChannel = (input: {
	channelId: string | null;
	channelDefault: boolean;
}) => !input.channelDefault || input.channelId !== null;
// 프리셋의 성우는 그 공급자 성우다(다른 공급자 설정이 요청으로 가지 않게)
const sameProvider = (input: {
	voice: { provider: ProviderId };
	provider: ProviderId;
}) => input.voice.provider === input.provider;

export const presetCreateInputSchema = z
	.object({ ...channelFields, voice: savedVoiceInputSchema })
	.and(presetSettingsSchema)
	.refine(defaultNeedsChannel, { message: "channel_default" })
	.refine(sameProvider, { message: "provider" });

export const presetOverwriteInputSchema = z
	.object({ id: z.uuid(), voice: savedVoiceInputSchema })
	.and(presetSettingsSchema)
	.refine(sameProvider, { message: "provider" });

export const presetUpdateInputSchema = z
	.object({ id: z.uuid(), ...channelFields })
	.refine(defaultNeedsChannel, { message: "channel_default" });

// 목록 한 줄. settings는 쓸 수 없는 값을 처음 값으로 바꾼 것이고 fixed가 바꾼 칸 이름이다(readSettings)
export const presetSchema = z
	.object({
		id: z.uuid(),
		name: z.string(),
		savedVoiceId: z.uuid().nullable(),
		// 담은 성우의 정보. 보관함에서 빠졌으면 null
		voice: voiceSchema.nullable(),
		unavailable: z.boolean(),
		channelId: z.uuid().nullable(),
		channelDefault: z.boolean(),
		fixed: z.array(z.string()),
	})
	.and(presetSettingsSchema);
export type Preset = z.output<typeof presetSchema>;

// 저장한 설정을 지금 계약으로 읽는다(스펙 2절 '쓸 수 없는 값'). 통과하지 못한 칸만 처음 값으로 두고 그 이름을 fixed에 담는다.
// 앞 칸부터 하나씩 더해 검사하므로 칸끼리의 규칙(Typecast v21 감정)은 뒤 칸(preset)이 처음 값이 된다.
// 모르는 칸은 버리고 빠진 칸은 처음 값이다(계약이 칸을 더하거나 뺐을 뿐 값이 틀린 것이 아니다)
export function readSettings<P extends ProviderId>(
	provider: P,
	raw: unknown,
): { settings: SettingsOf[P]; fixed: string[] } {
	const schema = SETTINGS_SCHEMA[provider] as unknown as z.ZodType<
		SettingsOf[P]
	>;
	const whole = schema.safeParse(raw);
	if (whole.success) return { settings: whole.data, fixed: [] };
	const stored =
		raw !== null && typeof raw === "object"
			? (raw as Record<string, unknown>)
			: {};
	const kept: Record<string, unknown> = {};
	const fixed: string[] = [];
	for (const key of Object.keys(DEFAULT_SETTINGS[provider])) {
		if (!(key in stored)) continue;
		if (schema.safeParse({ ...kept, [key]: stored[key] }).success)
			kept[key] = stored[key];
		else fixed.push(key);
	}
	return { settings: schema.parse(kept), fixed };
}

// 복제 이름: '{이름} 사본', 있으면 '사본 2', '사본 3'… 이름 규칙(40자)을 넘으면 앞 이름을 줄인다.
// 같은 이름 비교는 유니크 인덱스(lower)와 같게 대소문자를 무시한다
export function copyName(name: string, taken: readonly string[]): string {
	const used = new Set(taken.map((entry) => entry.toLowerCase()));
	for (let n = 1; ; n += 1) {
		const suffix = n === 1 ? " 사본" : ` 사본 ${n}`;
		const base = [...name]
			.slice(0, NAME_MAX - codePoints(suffix))
			.join("")
			.trimEnd();
		const candidate = `${base}${suffix}`;
		if (!used.has(candidate.toLowerCase())) return candidate;
	}
}
