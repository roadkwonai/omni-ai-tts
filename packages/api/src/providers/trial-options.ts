import type { ProviderId } from "./contract";

// 시험 생성('내 문장 듣기', T5 스펙 4절)의 모델·옵션 범위·기본값과 순수 계산이다. 화면과 서버가 함께 쓴다.
// zod·SDK·서버 모듈을 import하지 않는다(화면 번들에 들어간다). 입력 검증 스키마는 trial-contract.ts가 이 값으로 만든다.

export const TRIAL_TEXT_MAX = 200;
export const TRIAL_TAG_MAX = 30;
// 패널 '내 문장 결과'에 보이는 수(최신순)
export const TRIAL_RESULTS_SHOWN = 20;
// Fish Audio 무료 모델(s2.1-pro-free)은 블로그 기준 2026-11-30까지다. 공급자에서 먼저 없어지면 '모르는 모델'이 되어
// 오류 없이 유료 s2.1-pro로 처리되므로 하루 이르게(그날 0시 KST) 보내지 않는다(스펙 4·13절)
export const FISH_FREE_UNTIL = Date.parse("2026-11-30T00:00:00+09:00");
// Fish Audio 유료 단가(요금 문서 2026-10-05): 100만 UTF-8 바이트당 15달러
const FISH_USD_PER_BYTE = 15 / 1_000_000;

export const TYPECAST_MODELS = ["ssfm-v30", "ssfm-v21"] as const;
export const ELEVENLABS_MODELS = [
	"eleven_v4",
	"eleven_v3",
	"eleven_multilingual_v2",
	"eleven_flash_v2_5",
] as const;
export const FISH_MODELS = ["s2.1-pro-free", "s2.1-pro"] as const;
export const EMOTION_PRESETS = [
	"normal",
	"happy",
	"sad",
	"angry",
	"whisper",
	"toneup",
	"tonedown",
] as const;
export type TypecastModel = (typeof TYPECAST_MODELS)[number];
export type ElevenLabsModel = (typeof ELEVENLABS_MODELS)[number];
export type FishModel = (typeof FISH_MODELS)[number];
export type EmotionPreset = (typeof EMOTION_PRESETS)[number];
// ssfm-v21이 받는 프리셋(공식 문서)
export const V21_PRESETS: readonly EmotionPreset[] = [
	"normal",
	"happy",
	"sad",
	"angry",
];

export type Range = { min: number; max: number; step: number; default: number };
const range = (
	min: number,
	max: number,
	step: number,
	value: number,
): Range => ({
	min,
	max,
	step,
	default: value,
});
// 슬라이더 범위·단위·기본값(공식 문서 2026-10-05, tasks/evidence/T05/research). 단위는 같은 조합 판정의 반올림 단위이기도 하다
export const RANGES = {
	typecast: {
		intensity: range(0, 2, 0.1, 1),
		tempo: range(0.5, 2, 0.05, 1),
		pitch: range(-12, 12, 1, 0),
		volume: range(0, 200, 5, 100),
	},
	elevenlabs: {
		stability: range(0, 1, 0.05, 0.5),
		similarity: range(0, 1, 0.05, 0.75),
		style: range(0, 1, 0.05, 0),
		speed: range(0.7, 1.2, 0.05, 1),
	},
	fish_audio: {
		speed: range(0.5, 2, 0.05, 1),
		temperature: range(0, 1, 0.05, 0.7),
	},
} as const;

export type TypecastSettings = {
	model: TypecastModel;
	emotion: "smart" | "preset";
	preset: EmotionPreset;
	intensity: number;
	language: "auto" | "kor";
	tempo: number;
	pitch: number;
	volume: number;
};
export type ElevenLabsSettings = {
	model: ElevenLabsModel;
	stability: number;
	similarity: number;
	style: number;
	speed: number;
	speakerBoost: boolean;
	// 말투 태그(대괄호 안 글자). 비면 없음
	tag: string;
};
export type FishSettings = {
	model: FishModel;
	speed: number;
	temperature: number;
	tag: string;
};
export type SettingsOf = {
	typecast: TypecastSettings;
	elevenlabs: ElevenLabsSettings;
	fish_audio: FishSettings;
};
// 시험 생성 요청 하나(성우·문장·설정). 화면이 만들고 프로시저가 받는 모양이다
export type TrialRequest = {
	[P in ProviderId]: {
		provider: P;
		voiceId: string;
		text: string;
		settings: SettingsOf[P];
	};
}[ProviderId];

export const DEFAULT_SETTINGS: SettingsOf = {
	typecast: {
		model: "ssfm-v30",
		emotion: "smart",
		preset: "normal",
		intensity: RANGES.typecast.intensity.default,
		language: "auto",
		tempo: RANGES.typecast.tempo.default,
		pitch: RANGES.typecast.pitch.default,
		volume: RANGES.typecast.volume.default,
	},
	elevenlabs: {
		model: "eleven_v4",
		stability: RANGES.elevenlabs.stability.default,
		similarity: RANGES.elevenlabs.similarity.default,
		style: RANGES.elevenlabs.style.default,
		speed: RANGES.elevenlabs.speed.default,
		speakerBoost: true,
		tag: "",
	},
	fish_audio: {
		model: "s2.1-pro-free",
		speed: RANGES.fish_audio.speed.default,
		temperature: RANGES.fish_audio.temperature.default,
		tag: "",
	},
};

type Field<P extends ProviderId> = Exclude<keyof SettingsOf[P], "model"> &
	string;
// 모델이 받는 옵션(스펙 4절 표). 받지 않는 옵션은 화면에서 숨고 정리·공급자 본문에서 빠진다.
// ponytail: flash v2.5의 스타일·화자 증폭은 공식 문서에 모델별 명시가 없어 두지 않는다(계획 '스펙과 다른 점' 2). 실제 확인 뒤 이 표에 더한다
export const FIELDS: {
	[P in ProviderId]: Record<SettingsOf[P]["model"], readonly Field<P>[]>;
} = {
	typecast: {
		"ssfm-v30": [
			"emotion",
			"preset",
			"intensity",
			"language",
			"tempo",
			"pitch",
			"volume",
		],
		"ssfm-v21": ["preset", "intensity", "language", "tempo", "pitch", "volume"],
	},
	elevenlabs: {
		eleven_v4: ["stability", "similarity", "tag"],
		eleven_v3: ["stability", "tag"],
		eleven_multilingual_v2: [
			"stability",
			"similarity",
			"style",
			"speed",
			"speakerBoost",
		],
		eleven_flash_v2_5: ["stability", "similarity", "speed"],
	},
	fish_audio: {
		"s2.1-pro-free": ["speed", "temperature", "tag"],
		"s2.1-pro": ["speed", "temperature", "tag"],
	},
};

// 이 요청의 모델이 받는 옵션. Typecast v30 '자동' 감정은 프리셋·강도를 쓰지 않는다
export function fieldsOf(request: TrialRequest): readonly string[] {
	const fields =
		(FIELDS[request.provider] as Record<string, readonly string[]>)[
			request.settings.model
		] ?? [];
	return request.provider === "typecast" &&
		request.settings.model === "ssfm-v30" &&
		request.settings.emotion === "smart"
		? fields.filter((field) => field !== "preset" && field !== "intensity")
		: fields;
}

// 슬라이더 단위로 반올림하고 범위 안에 둔다. 부동소수 끝자리(0.30000000000000004)를 지워 같은 소리의 요청이 같은 값이 되게 한다
export const snap = (value: number, { min, max, step }: Range) =>
	Number(
		Math.min(
			max,
			Math.max(min, min + Math.round((value - min) / step) * step),
		).toFixed(4),
	);

export const normalizeText = (text: string) => text.normalize("NFC").trim();
// 글자 수는 코드 포인트로 센다(이모지 하나 = 1)
export const codePoints = (text: string) => [...text].length;
export const utf8Bytes = (text: string) =>
	new TextEncoder().encode(text).length;

export type UsedSettings = Record<string, string | number | boolean>;
// 그 모델이 받는 옵션만 정리한 값으로 남긴다(같은 조합 판정·저장·공급자 본문). 받지 않는 옵션의 값은 소리에 영향이 없다
export function usedSettings(request: TrialRequest): UsedSettings {
	const ranges: Partial<Record<string, Range>> = RANGES[request.provider];
	const values = request.settings as Record<string, string | number | boolean>;
	const used: UsedSettings = { model: request.settings.model };
	for (const field of fieldsOf(request)) {
		const value = values[field];
		if (value === undefined) continue;
		const limits = ranges[field];
		used[field] =
			typeof value === "number" && limits
				? snap(value, limits)
				: typeof value === "string"
					? value.trim()
					: value;
	}
	return used;
}

// 같은 소리를 내는 요청이면 같은 글자다(계획 Review Focus 1). 서버의 조합 키(trial.ts comboKey)는 이 글자의 해시이고,
// 화면은 이 글자로 결과 목록에서 '저장된 결과'를 알아본다. usedSettings가 model 뒤에 FIELDS 표 순서로만 키를 넣으므로
// 입력 키 순서와 상관없이 같은 글자다. 받지 않는 옵션·끝자리·NFC·앞뒤 공백은 usedSettings·normalizeText가 지운다
export function comboSignature(request: TrialRequest): string {
	return JSON.stringify([
		request.provider,
		request.voiceId,
		normalizeText(request.text),
		usedSettings(request),
	]);
}

// 공급자에게 보내는 문장. 말투 태그를 받는 모델이면 문장 앞에 붙인다(두 공급자 문서 모두 문장 앞을 권한다)
export function sentText(request: TrialRequest): string {
	const text = normalizeText(request.text);
	if (request.provider === "typecast") return text;
	const tag = request.settings.tag.trim();
	return tag && fieldsOf(request).includes("tag") ? `[${tag}] ${text}` : text;
}

export type Usage = { unit: "credit" | "byte" | "free"; amount: number };
export const isFreeModel = (request: TrialRequest) =>
	request.provider === "fish_audio" &&
	request.settings.model === "s2.1-pro-free";
export const freeModelOpen = (now = Date.now()) => now < FISH_FREE_UNTIL;

// 예상 사용량(스펙 4절). 보낼 문장(태그 포함)으로 센다. ElevenLabs 배율을 모르면 1로 센다(화면이 "배율을 확인하지 못했어요"를 붙인다)
export function estimate(
	request: TrialRequest,
	multiplier: number | null = null,
): Usage {
	const sent = sentText(request);
	if (request.provider === "fish_audio") {
		return isFreeModel(request)
			? { unit: "free", amount: 0 }
			: { unit: "byte", amount: utf8Bytes(sent) };
	}
	const chars = codePoints(sent);
	return {
		unit: "credit",
		amount:
			request.provider === "elevenlabs"
				? Math.ceil(chars * (multiplier ?? 1))
				: chars,
	};
}
export const fishUsd = (bytes: number) => bytes * FISH_USD_PER_BYTE;
