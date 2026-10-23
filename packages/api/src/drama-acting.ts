import {
	cleanDirection,
	DRAMA_LINE_MAX,
	TAG_NAMES,
	TAGS,
} from "./drama-script";
import type { PresetValue } from "./preset-contract";
import type { ProviderId } from "./providers/contract";
import {
	type AiryStyle,
	codePoints,
	type EmotionPreset,
	normalizeText,
	TRIAL_TEXT_MAX,
} from "./providers/trial-options";

// 드라마 작업실 화자의 공급자별 연기 값과 순수 함수다(T9.5 Part 2). 화면과 서버가 함께 쓴다.
// zod·node:*·Buffer를 쓰지 않는다(화면 번들). 값의 근거는 docs/research/drama-acting-tags.md

export type ActingFamily =
	| "fish_drama"
	| "fish_s2"
	| "elevenlabs_tags"
	| "elevenlabs_plain"
	| "gemini"
	| "typecast_v30"
	| "typecast_v21"
	| "airy";

export function familyOf(provider: ProviderId, model: string): ActingFamily {
	switch (provider) {
		case "fish_audio":
			return model === "drama-3" ? "fish_drama" : "fish_s2";
		case "elevenlabs":
			return model === "eleven_v4" || model === "eleven_v3"
				? "elevenlabs_tags"
				: "elevenlabs_plain";
		case "typecast":
			return model === "ssfm-v30" ? "typecast_v30" : "typecast_v21";
		case "airy":
			return "airy";
		case "gemini":
			return "gemini";
	}
}

// front·feel의 value는 괄호 없는 글, sound는 태그 전체, span은 이름이다
export type Tag = { label: string; value: string };
export type ActingCatalog = {
	front: readonly Tag[];
	sound: readonly Tag[];
	span: readonly Tag[];
	feel: readonly Tag[];
};

const tags = (pairs: readonly (readonly [string, string])[]): Tag[] =>
	pairs.map(([label, value]) => ({ label, value }));
const NONE: readonly Tag[] = [];

const MOOD = tags([
	["들뜬 설렘", "with bright eager excitement"],
	["차갑게 침착", "icy calm"],
	["무거운 슬픔", "heavy, deflated sadness"],
	["비꼬듯 무표정", "sarcastic and deadpan"],
	["숨차고 겁먹은", "breathless and terrified"],
	["겨우 참는 분노", "furious, barely holding it together"],
	["다정한 잠자리 목소리", "warm, gentle bedtime voice"],
]);
const FISH_SOUND = tags([
	["한숨", "[sighs]"],
	["웃음", "[laughs]"],
	["피식", "[chuckles]"],
	["헉", "[gasps]"],
	["쉼", "[pause]"],
	["헛기침", "[clears throat]"],
	["머뭇", "[hesitates]"],
]);
const TYPECAST_FEEL = tags([
	["보통", "normal"],
	["기쁨", "happy"],
	["슬픔", "sad"],
	["화남", "angry"],
]);

export const ACTING: Record<ActingFamily, ActingCatalog> = {
	fish_drama: {
		front: MOOD,
		sound: FISH_SOUND,
		span: tags([
			["속삭임", "whisper"],
			["부드럽게", "soft"],
			["천천히", "slow"],
			["빠르게", "fast"],
			["강조", "emphasis"],
			["강세", "stress"],
			["힘차게", "forceful"],
		]),
		feel: NONE,
	},
	fish_s2: {
		front: [
			...MOOD,
			...tags([
				["기쁘게", "happy"],
				["슬프게", "sad"],
				["화나서", "angry"],
				["신나서", "excited"],
				["긴장해서", "nervous"],
				["놀라서", "surprised"],
				["속삭이며", "whispering"],
				["소리치며", "shouting"],
			]),
		],
		sound: [
			...FISH_SOUND,
			...tags([
				["짧은 쉼", "[break]"],
				["긴 쉼", "[long-break]"],
				["강조", "[emphasis]"],
			]),
		],
		span: NONE,
		feel: NONE,
	},
	elevenlabs_tags: {
		front: tags([
			["신나서", "excited"],
			["기쁘게", "happy"],
			["슬프게", "sad"],
			["화나서", "angry"],
			["긴장해서", "nervous"],
			["겁먹어", "scared"],
			["비꼬듯", "sarcastic"],
			["차분하게", "calm"],
			["속삭이며", "whispers"],
			["소리치며", "shouts"],
		]),
		sound: tags([
			["웃음", "[laughs]"],
			["피식", "[chuckles]"],
			["한숨", "[sighs]"],
			["헉", "[gasps]"],
			["헛기침", "[clears throat]"],
			["울먹", "[crying]"],
			["쉼", "[pause]"],
			["긴 쉼", "[long pause]"],
		]),
		span: NONE,
		feel: NONE,
	},
	elevenlabs_plain: { front: NONE, sound: NONE, span: NONE, feel: NONE },
	gemini: {
		front: tags([
			["밝고 친근", "cheerful and friendly"],
			["차분", "calm and relaxed"],
			["따뜻·열정", "warm and enthusiastic"],
			["화남", "angry tone"],
			["비꼼", "sarcastic"],
			["다급한 속삭임", "whispered urgently"],
			["중얼거림", "muttering"],
			["숨참", "out of breath"],
			["빠르게", "speaking rapidly"],
			["느리게", "speaking slowly"],
			["단조", "monotone and flat"],
			["편한 말투", "casual, friendly"],
		]),
		sound: tags([
			["한숨", "<sigh>"],
			["웃음", "<laugh>"],
			["피식", "<chuckle>"],
			["헉", "<gasp>"],
			["흐느낌", "<sob>"],
			["숨", "<breath>"],
			["신음", "<groan>"],
			["기침", "<cough>"],
			["짧은 쉼", "<short pause>"],
			["긴 쉼", "<long pause>"],
		]),
		span: NONE,
		feel: NONE,
	},
	typecast_v30: {
		front: NONE,
		sound: NONE,
		span: NONE,
		feel: [
			...tags([["자동", "smart"]]),
			...TYPECAST_FEEL,
			...tags([
				["속삭임", "whisper"],
				["톤 업", "toneup"],
				["톤 다운", "tonedown"],
			]),
		],
	},
	typecast_v21: { front: NONE, sound: NONE, span: NONE, feel: TYPECAST_FEEL },
	airy: {
		front: NONE,
		sound: NONE,
		span: NONE,
		feel: tags([
			["기본", "normal"],
			["밝게", "bright"],
			["차분하게", "calm"],
			["속삭임", "whisper"],
		]),
	},
};

export const TYPECAST_INTENSITIES = [0.5, 1, 1.5, 2] as const;
export type Feel = {
	typecast?: { emotion: "smart" | EmotionPreset; intensity: number };
	airy?: { style: AiryStyle };
};
export type ActingLine = { direction: string; text: string; feel?: Feel };

const PAIR = new RegExp(`^</?(?:${TAG_NAMES})>$`);
const GEMINI_SOUND = ACTING.gemini.sound.map((t) => t.value);
const squash = (text: string) => normalizeText(text.replace(/\s+/g, " "));
// 지시를 대사 앞 [지시]로 보내는 family(Fish·ElevenLabs v3·v4)
const prefixed = (family: ActingFamily) =>
	family === "fish_drama" ||
	family === "fish_s2" ||
	family === "elevenlabs_tags";
// 그 family의 감정·말투 값인가(서버 제안 검사와 화면 임시 작업 읽기가 함께 쓴다)
export const hasFeel = (family: ActingFamily, value: unknown) =>
	ACTING[family].feel.some((t) => t.value === value);
// Typecast 강도를 0.5 단위로 맞춰 [0.5, 2]로 자른다(TYPECAST_INTENSITIES)
export const snapIntensity = (raw: number) =>
	Math.min(2, Math.max(0.5, Math.round(raw * 2) / 2));

// 태그 하나(TAGS가 찾은 조각)가 그 family로 갈 때 태그로 남는가. 남지 않는 태그는 소리로 읽히므로 readText가 지우고 화면은 줄을 긋는다
export function tagSent(family: ActingFamily, tag: string): boolean {
	const bracket = tag.startsWith("[");
	switch (family) {
		case "fish_drama":
		case "fish_s2":
			// 쌍 태그 밖 꺾쇠는 화자를 Gemini에서 바꾼 뒤 남은 것이다('스펙과 다른 점' 22)
			return bracket || PAIR.test(tag);
		case "elevenlabs_tags":
			return bracket;
		case "gemini":
			return GEMINI_SOUND.includes(tag);
		default:
			return false;
	}
}

// 공급자에게 보낼 대사 글과 Gemini 말투. 지시는 접두(Fish·ElevenLabs v3·v4) 또는 Gemini 말투로만 간다
export function readText(
	family: ActingFamily,
	line: ActingLine,
): { text: string; style: string } {
	const direction = cleanDirection(line.direction);
	const prefix = prefixed(family) && direction ? `[${direction}] ` : "";
	const text = line.text.replace(TAGS, (tag) =>
		tagSent(family, tag) ? tag : "",
	);
	return {
		text: squash(prefix + text),
		style: family === "gemini" ? direction : "",
	};
}

// 프리셋·처음 설정에 줄 값을 덮은 새 값. 성우별 보정(모델·감정 좁히기·무료 기간)은 Task 17이 한다
export function applyLine<V extends PresetValue>(
	value: V,
	family: ActingFamily,
	line: ActingLine,
): V {
	const out: PresetValue = structuredClone(value);
	const direction = cleanDirection(line.direction);
	if (direction) {
		// 지시는 접두로 가므로 설정의 말투 태그가 겹치지 않게 비운다
		if (
			prefixed(family) &&
			(out.provider === "fish_audio" || out.provider === "elevenlabs")
		)
			out.settings.tag = "";
		if (family === "gemini" && out.provider === "gemini")
			out.settings.direction = direction;
	}
	const { typecast, airy } = line.feel ?? {};
	if (
		typecast &&
		out.provider === "typecast" &&
		hasFeel(family, typecast.emotion)
	)
		Object.assign(
			out.settings,
			typecast.emotion === "smart"
				? { emotion: "smart" }
				: {
						emotion: "preset",
						preset: typecast.emotion,
						intensity: typecast.intensity,
					},
		);
	if (airy && out.provider === "airy" && hasFeel(family, airy.style))
		out.settings.style = airy.style;
	return out as V;
}

// Fish·Gemini 자유 문구: 짧은 영어. 앞뒤 공백을 뺀 값이고 영문 글자가 하나는 있어야 한다('-'·','만인 지시는 받지 않는다)
export const freePhraseOk = (text: string) =>
	/^(?=.*[A-Za-z])[A-Za-z0-9 ,'-]{1,60}$/.test(text.trim());

export type Suggestion = {
	direction: string;
	text: string;
	emotion: string;
	intensity: number | null;
};

const bare = (text: string) =>
	text.replace(TAGS, "").replace(/\s+/g, " ").trim();
const tagsOf = (text: string): string[] => text.match(TAGS) ?? [];
// 쌍 태그가 바른 차례로 열고 닫히는가(뒤집힘·엇갈림·닫지 않은 여는 태그가 없다)
function spansOk(text: string): boolean {
	const open: string[] = [];
	for (const tag of tagsOf(text)) {
		if (!PAIR.test(tag)) continue;
		if (!tag.startsWith("</")) open.push(tag.slice(1, -1));
		else if (open.pop() !== tag.slice(2, -1)) return false;
	}
	return open.length === 0;
}

function textOk(
	family: ActingFamily,
	mode: "scene" | "read",
	original: ActingLine,
	suggested: ActingLine,
): boolean {
	const { sound, span } = ACTING[family];
	if (suggested.text.includes("<|")) return false;
	if (bare(suggested.text) !== bare(original.text)) return false;
	const old = tagsOf(original.text);
	const added = tagsOf(suggested.text).filter((tag) => {
		const at = old.indexOf(tag);
		if (at >= 0) old.splice(at, 1);
		return at < 0;
	});
	// 원래 태그는 하나도 빼지 않는다(쌍 태그 한 짝만 빠져도 깨진다)
	if (old.length > 0) return false;
	// 원래 대사가 이미 깨져 있으면 차례는 보지 않는다(사용자가 쓴 글이라 제안 탓이 아니다)
	if (spansOk(original.text) && !spansOk(suggested.text)) return false;
	const allowed = (tag: string) =>
		sound.some((t) => t.value === tag) ||
		span.some((t) => tag === `<${t.value}>` || tag === `</${t.value}>`);
	if (!added.every(allowed)) return false;
	// 쌍 태그 한 짝은 새 태그 1개다. 여닫이 수가 이름마다 맞아야 깨진 태그가 가지 않는다
	if (added.filter((tag) => !tag.startsWith("</")).length > 2) return false;
	if (
		span.some(
			(t) =>
				added.filter((tag) => tag === `<${t.value}>`).length !==
				added.filter((tag) => tag === `</${t.value}>`).length,
		)
	)
		return false;
	return mode === "scene"
		? codePoints(normalizeText(suggested.text)) <= DRAMA_LINE_MAX
		: codePoints(readText(family, suggested).text) <= TRIAL_TEXT_MAX;
}

function feelOf(
	family: ActingFamily,
	emotions: readonly string[] | null,
	original: ActingLine,
	suggested: Suggestion,
): Feel | undefined {
	const { emotion } = suggested;
	if (!hasFeel(family, emotion)) return original.feel;
	if (family === "airy")
		return { ...original.feel, airy: { style: emotion as AiryStyle } };
	// v30은 smart를 늘 허용한다. 그 밖 값은 성우가 가진 감정(null이면 전부)이어야 한다
	if (emotion !== "smart" && emotions && !emotions.includes(emotion))
		return original.feel;
	return {
		...original.feel,
		typecast: {
			emotion: emotion as "smart" | EmotionPreset,
			intensity: snapIntensity(suggested.intensity ?? 1),
		},
	};
}

// 모델이 낸 제안에서 허용한 부분만 받는다. 어긴 부분(지시·대사·감정)은 따로 원래 값으로 둔다
export function checkSuggestion(
	family: ActingFamily,
	emotions: readonly string[] | null,
	mode: "scene" | "read",
	original: ActingLine,
	suggested: Suggestion,
): ActingLine {
	const { front } = ACTING[family];
	// 대괄호가 든 제안은 정리하지 않고 거절한다. 앞뒤 공백만 뺀다
	const phrase = suggested.direction.trim();
	let direction =
		front.length > 0 &&
		(front.some((t) => t.value === phrase) || freePhraseOk(phrase))
			? phrase
			: original.direction;
	const textWith = (withDirection: string) =>
		textOk(family, mode, original, {
			direction: withDirection,
			text: suggested.text,
		})
			? suggested.text
			: original.text;
	let text = textWith(direction);
	// 읽기에서 새 지시 때문에 200자를 넘으면 지시를 되돌리고, 대사 제안은 원래 지시로 다시 잰다(지시 탓에 대사 제안까지 버리지 않게)
	if (
		mode === "read" &&
		codePoints(readText(family, { direction, text }).text) > TRIAL_TEXT_MAX
	) {
		direction = original.direction;
		text = textWith(direction);
	}
	const feel = feelOf(family, emotions, original, suggested);
	return feel ? { direction, text, feel } : { direction, text };
}

export type AutoTagSpeaker = {
	name: string;
	family: ActingFamily;
	emotions: readonly string[] | null;
};

// 화자 한 명에게 허용한 값을 한 줄 글로 만든다
function allowedOf({ family, emotions }: AutoTagSpeaker): string {
	const { front, sound, span, feel } = ACTING[family];
	const parts: string[] = [];
	if (front.length)
		parts.push(
			`direction (one of: ${front.map((t) => `"${t.value}"`).join(", ")}; or your own short English phrase of letters, digits, spaces, commas, apostrophes and hyphens, at most 60 characters)`,
		);
	if (sound.length)
		parts.push(`sounds in the text: ${sound.map((t) => t.value).join(" ")}`);
	if (span.length)
		parts.push(
			`spans in the text: ${span.map((t) => `<${t.value}>…</${t.value}>`).join(" ")}`,
		);
	if (feel.length) {
		const values = feel
			.map((t) => t.value)
			.filter((v) => v === "smart" || !emotions || emotions.includes(v));
		parts.push(
			`emotion (one of: ${values.join(", ")})${family.startsWith("typecast") ? `, intensity one of ${TYPECAST_INTENSITIES.join(", ")}` : ""}`,
		);
	}
	return parts.length
		? parts.join("; ")
		: "no tags allowed (return the line unchanged)";
}

const EMOTIONS = [
	...new Set(Object.values(ACTING).flatMap((c) => c.feel.map((t) => t.value))),
];

// 자동 태그 요청 글(Gemini 텍스트 모델). 규칙은 ElevenLabs Enhance 프롬프트 요약이다
export function autoTagPrompt(
	speakers: readonly AutoTagSpeaker[],
	lines: readonly (ActingLine & { speaker: number })[],
): { system: string; input: string; schema: Record<string, unknown> } {
	const system = [
		"You add acting tags to Korean drama dialogue for text-to-speech.",
		"- Never change, add, remove, translate or re-space the dialogue characters. Only insert allowed tags.",
		"- Tags are about the voice only (delivery, sounds, pauses). No music, sound effects, body movements or sensitive topics.",
		"- Put a tag right before the words it affects. At most one direction per line and at most two new tags inside the dialogue.",
		"- Keep tags already in the dialogue. Write tags in English. Never write <|...|> tokens.",
		"- If unsure, leave direction and emotion empty and the text unchanged.",
		"- Reply with JSON only: one item per input line, same index.",
		"Each speaker may use only these values:",
		// 이름은 JSON 글로 넣는다(줄바꿈·따옴표로 지시문을 흉내 내지 못하게)
		...speakers.map(
			(s, i) =>
				`- ${i} ${JSON.stringify(s.name)} (${s.family}): ${allowedOf(s)}`,
		),
	].join("\n");
	const input = JSON.stringify(
		lines.map((line, index) => ({
			index,
			speaker: speakers[line.speaker]?.name ?? "",
			direction: line.direction,
			text: line.text,
		})),
	);
	const schema = {
		type: "object",
		properties: {
			lines: {
				type: "array",
				minItems: lines.length,
				maxItems: lines.length,
				items: {
					type: "object",
					properties: {
						index: { type: "integer" },
						direction: { type: "string" },
						text: { type: "string" },
						emotion: { type: "string", enum: ["", ...EMOTIONS] },
						intensity: { anyOf: [{ type: "number" }, { type: "null" }] },
					},
					required: ["index", "direction", "text", "emotion", "intensity"],
					additionalProperties: false,
				},
			},
		},
		required: ["lines"],
		additionalProperties: false,
	};
	return { system, input, schema };
}
