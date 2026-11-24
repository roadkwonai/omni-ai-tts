import type { ProviderId, Voice } from "./contract";

// 시험 생성('내 문장 듣기', T5 스펙 4절)의 모델·옵션 범위·기본값과 순수 계산이다. 화면과 서버가 함께 쓴다.
// zod·SDK·서버 모듈을 import하지 않는다(화면 번들에 들어간다). 입력 검증 스키마는 trial-contract.ts가 이 값으로 만든다.

export const TRIAL_TEXT_MAX = 200;
export const TRIAL_TAG_MAX = 30;
// 패널 '내 문장 결과'에 보이는 수(최신순)
export const TRIAL_RESULTS_SHOWN = 20;

// 음성 작업실(T9 스펙 3절). 화면(글자 수·조각 수)과 서버가 함께 쓴다
export const STUDIO_TEXT_MAX = 2000;
// Airy 입력 상한(공식 문서 /v1/audio/speech input 1–1600자, 2026-10-23). 나머지 공급자는 STUDIO_TEXT_MAX
export const AIRY_TEXT_MAX = 1600;
// 문단 작업실(T10)의 문단 수 상한. studioFindMany 입력 상한이기도 하다
export const PARAGRAPHS_MAX = 200;
export const studioTextMax = (provider: ProviderId) =>
	provider === "airy" ? AIRY_TEXT_MAX : STUDIO_TEXT_MAX;
// 오디오를 나눠 받는 조각 크기. 조각 응답(multipart, 머리 약 300바이트)이 배포 환경 응답 상한 4.5MB 안에 든다(T9 계획 '설치본·문서로 확인한 것' 1)
export const STUDIO_PART_BYTES = 3 * 1024 * 1024;
// 작업실 결과 오디오 상한(T5는 4MiB). Typecast 320kbps MP3로 약 13분이다. 넘으면 이미 과금된 결과라도 버린다(audio_too_large)
export const STUDIO_AUDIO_MAX = 32 * 1024 * 1024;
// 결과 하나의 조각 수(빈 결과도 1)
export const partsOf = (bytes: number) =>
	Math.max(1, Math.ceil(bytes / STUDIO_PART_BYTES));
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
export const AIRY_MODELS = ["airy-tts-v1"] as const;
export const AIRY_LANGUAGES = ["ko", "en"] as const;
export const AIRY_STYLES = ["normal", "bright", "calm", "whisper"] as const;
// Airy 과금(공식 문서 2026-10-07): 입력 한 글자에 language가 ko면 1.5, en이면 1크레딧. 글자는 다른 공급자처럼 코드 포인트로 센다
export const AIRY_CREDITS_PER_CHAR = { ko: 1.5, en: 1 } as const;
export const GEMINI_MODELS = [
	"gemini-3.8-flash-tts",
	"gemini-3.8-flash-lite-tts",
] as const;
// 말투 지시(GLOSSARY) 상한. 공급자 문서에 상한이 없어 앱이 정한다(T7.6 스펙 2절)
export const GEMINI_DIRECTION_MAX = 100;
// 추정 금액(T7.6 스펙 2절). 출력 오디오는 25토큰/초다(가격 문서). 말 빠르기는 공급자 근거가 없는 가정이다:
// 로컬 저장 결과 6개(네 공급자, 기본 속도) 실측 5.4~8.3글자/초 가운데 느린 쪽(길게 어림해 금액이 작게 나오지 않게, T7.6 계획)
export const GEMINI_CHARS_PER_SECOND = 5;
export const GEMINI_TOKENS_PER_SECOND = 25;
// 2027-01-01부터 단가가 두 배다(가격 문서 2026-10-07). 시각은 이르게 잡아 그날 0시 KST(FISH_FREE_UNTIL과 같은 방식)
export const GEMINI_PRICE_UP_AT = Date.parse("2027-01-01T00:00:00+09:00");
// 출력 오디오 100만 토큰당 달러 [바뀌기 전, 바뀐 뒤](Gemini API 표준 등급)
const GEMINI_USD_PER_MILLION = {
	"gemini-3.8-flash-tts": [9, 18],
	"gemini-3.8-flash-lite-tts": [6, 12],
} as const;
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
export type AiryModel = (typeof AIRY_MODELS)[number];
export type AiryLanguage = (typeof AIRY_LANGUAGES)[number];
export type AiryStyle = (typeof AIRY_STYLES)[number];
export type GeminiModel = (typeof GEMINI_MODELS)[number];
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
	// 슬라이더가 없다(언어·말투는 고르기)
	airy: {},
	// 슬라이더가 없다(말투 지시는 한 줄 입력)
	gemini: {},
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
// 형식(mp3)은 서버가 정하고 끝 무음(trailing_silence)은 두지 않는다(T7.5 스펙 2절)
export type AirySettings = {
	model: AiryModel;
	language: AiryLanguage;
	// 말투(GLOSSARY). ElevenLabs의 '스타일'(수치)과 다르다
	style: AiryStyle;
};
// 말투 지시(GLOSSARY)는 Gemini 요청의 style이다. ElevenLabs '스타일'(수치)·Airy '말투'(고르기)와 섞이지 않게 코드에서는 direction이라 부른다(T7.6 계획 '스펙과 다른 점' 4)
export type GeminiSettings = {
	model: GeminiModel;
	// 비면 보내지 않는다(문서 권장: 대부분 비워 둔다)
	direction: string;
};
export type SettingsOf = {
	typecast: TypecastSettings;
	elevenlabs: ElevenLabsSettings;
	fish_audio: FishSettings;
	airy: AirySettings;
	gemini: GeminiSettings;
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
	airy: { model: "airy-tts-v1", language: "ko", style: "normal" },
	gemini: { model: "gemini-3.8-flash-tts", direction: "" },
};

type Values = Record<string, string | number | boolean>;

// 그 공급자 칸이 모두 같은가('바뀐 값 있음')
export function sameSettings(
	provider: ProviderId,
	a: SettingsOf[ProviderId],
	b: SettingsOf[ProviderId],
): boolean {
	const x = a as Values;
	const y = b as Values;
	return Object.keys(DEFAULT_SETTINGS[provider]).every(
		(key) => x[key] === y[key],
	);
}

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
	airy: { "airy-tts-v1": ["language", "style"] },
	gemini: {
		"gemini-3.8-flash-tts": ["direction"],
		"gemini-3.8-flash-lite-tts": ["direction"],
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
					? normalizeText(value)
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

// 공급자에게 보내는 문장. 말투 태그를 받는 모델이면 문장 앞에 붙인다(두 공급자 문서 모두 문장 앞을 권한다).
// Typecast·Airy는 태그가 없고, Gemini 말투 지시는 문장이 아니라 따로 보낸다(gemini.ts)
export function sentText(request: TrialRequest): string {
	const text = normalizeText(request.text);
	if (
		request.provider === "typecast" ||
		request.provider === "airy" ||
		request.provider === "gemini"
	)
		return text;
	const tag = normalizeText(request.settings.tag);
	return tag && fieldsOf(request).includes("tag") ? `[${tag}] ${text}` : text;
}

// usd_micro: Gemini 추정 금액(백만분의 1달러, 정수). 금액이 모델·날짜에 달려 생성 때 정한 값을 기록한다(T7.6 계획 '스펙과 다른 점' 3)
export type Usage = {
	unit: "credit" | "byte" | "free" | "usd_micro";
	amount: number;
};
export const isFreeModel = (request: TrialRequest) =>
	request.provider === "fish_audio" &&
	request.settings.model === "s2.1-pro-free";
export const freeModelOpen = (now = Date.now()) => now < FISH_FREE_UNTIL;

// Gemini 출력 오디오 100만 토큰당 단가(달러). 바뀌는 시각부터 두 배
export const geminiUsdPerMillion = (model: GeminiModel, now = Date.now()) =>
	GEMINI_USD_PER_MILLION[model][now < GEMINI_PRICE_UP_AT ? 0 : 1];
// 가정한 오디오 길이(초). 올림이고 1글자라도 1초다
export const geminiSeconds = (text: string) =>
	Math.max(1, Math.ceil(codePoints(text) / GEMINI_CHARS_PER_SECOND));

// 예상 사용량(스펙 4절). 보낼 문장(태그 포함)으로 센다. ElevenLabs 배율을 모르면 1로 센다(화면이 "배율을 확인하지 못했어요"를 붙인다).
// Gemini는 출력 오디오로 과금되어 가정한 길이 × 25토큰 × 단가를 백만분의 1달러로 담는다(입력 텍스트 요금은 200자에 $0.0001 미만이라 뺀다)
export function estimate(
	request: TrialRequest,
	multiplier: number | null = null,
	now = Date.now(),
): Usage {
	const sent = sentText(request);
	if (request.provider === "fish_audio") {
		return isFreeModel(request)
			? { unit: "free", amount: 0 }
			: { unit: "byte", amount: utf8Bytes(sent) };
	}
	if (request.provider === "gemini") {
		return {
			unit: "usd_micro",
			amount:
				geminiSeconds(sent) *
				GEMINI_TOKENS_PER_SECOND *
				geminiUsdPerMillion(request.settings.model, now),
		};
	}
	const chars = codePoints(sent);
	const rate =
		request.provider === "airy"
			? AIRY_CREDITS_PER_CHAR[request.settings.language]
			: request.provider === "elevenlabs"
				? (multiplier ?? 1)
				: 1;
	// 부동소수 끝자리를 지운 뒤 올린다(25 × 0.28 = 7.000000000000001)
	return {
		unit: "credit",
		amount: Math.ceil(Number((chars * rate).toFixed(6))),
	};
}
export const fishUsd = (bytes: number) => bytes * FISH_USD_PER_BYTE;

// ── 성우에 맞춘 요청(T18). 웹(trial-view)과 CLI가 같은 보정을 쓴다 ──
// 그 성우가 지원하는 Typecast 모델(성우 데이터 models). 정보가 없으면 둘 다
export function typecastModelsOf(voice: Voice): TypecastModel[] {
	const offered = TYPECAST_MODELS.filter((model) =>
		voice.models.some((m) => m.model === model),
	);
	return offered.length > 0 ? offered : [...TYPECAST_MODELS];
}
// 그 성우·모델이 지원하는 프리셋. v21은 넷까지. 정보가 없으면 모델의 전체 목록
export function presetsOf(voice: Voice, model: TypecastModel): EmotionPreset[] {
	const allowed = model === "ssfm-v30" ? EMOTION_PRESETS : V21_PRESETS;
	const emotions = voice.models.find((m) => m.model === model)?.emotions;
	const list = emotions
		? allowed.filter((preset) => emotions.includes(preset))
		: [...allowed];
	return list.length > 0 ? list : ["normal"];
}
// 고를 수 있는 Fish Audio 모델. 무료 기간이 끝나면 유료만
export const fishModelsOf = (now = Date.now()): FishModel[] =>
	freeModelOpen(now) ? [...FISH_MODELS] : ["s2.1-pro"];

// 공급자 설정은 공급자마다 하나다. 이 성우가 받지 않는 값만 이 요청에서 보정한다(공급자 설정 자체는 바꾸지 않는다)
function typecastFor(
	voice: Voice,
	settings: TypecastSettings,
): TypecastSettings {
	const models = typecastModelsOf(voice);
	const model = models.includes(settings.model)
		? settings.model
		: (models[0] ?? "ssfm-v30");
	const presets = presetsOf(voice, model);
	return {
		...settings,
		model,
		emotion: model === "ssfm-v21" ? "preset" : settings.emotion,
		preset: presets.includes(settings.preset)
			? settings.preset
			: (presets[0] ?? "normal"),
	};
}
export function requestOf(
	voice: Voice,
	text: string,
	settings: SettingsOf,
	now = Date.now(),
): TrialRequest {
	const { voiceId } = voice;
	switch (voice.provider) {
		case "typecast":
			return {
				provider: "typecast",
				voiceId,
				text,
				settings: typecastFor(voice, settings.typecast),
			};
		case "elevenlabs":
			return {
				provider: "elevenlabs",
				voiceId,
				text,
				settings: settings.elevenlabs,
			};
		case "fish_audio": {
			const fish = settings.fish_audio;
			return {
				provider: "fish_audio",
				voiceId,
				text,
				settings: fishModelsOf(now).includes(fish.model)
					? fish
					: { ...fish, model: "s2.1-pro" },
			};
		}
		case "airy":
			return {
				provider: "airy",
				voiceId,
				text,
				settings: settings.airy,
			};
		case "gemini":
			return {
				provider: "gemini",
				voiceId,
				text,
				settings: settings.gemini,
			};
	}
}

// 확인 창이 필요한가(스펙 2절: 누를 때마다, Fish Audio 무료 모델은 묻지 않는다)
export const needsConfirm = (request: TrialRequest, now = Date.now()) =>
	!(isFreeModel(request) && freeModelOpen(now));
