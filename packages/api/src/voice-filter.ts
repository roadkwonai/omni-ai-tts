// packages/api/src/voice-filter.ts
// 성우의 공통 성별·연령 키와 공급자 값 이름표(T3 스펙 5절, 브리프 6절). 화면과 CLI가 같이 쓴다. zod·서버 모듈을 값으로 import하지 않는다(화면 번들).
import type { Voice } from "./providers/contract";

// 브리프 6절 표. Map의 순서가 선택지 순서다. 성별은 키가 공통 키다('전체' 탭·보관함 조건)
export const GENDER_LABEL = new Map([
	["female", "여성"],
	["male", "남성"],
	["neutral", "중성"],
]);
// 공통 연령 키('전체' 탭·보관함 조건, 메타 줄 이름표)
export const AGE_KEY_LABEL = new Map([
	["child", "어린이"],
	["teenager", "청소년"],
	["young", "청년"],
	["middle", "중년"],
	["old", "노년"],
]);
// 공급자 값 → 공통 키. 공통 키를 공급자 값으로 바꿀 때는 표의 첫 값이다(providerValue). 공급자 이름표(AGE_LABEL·EL_AGE·FISH_AGE)도 이 표에서 만든다
export const TYPECAST_AGE_KEY = new Map([
	["child", "child"],
	["teenager", "teenager"],
	["young_adult", "young"],
	["middle_age", "middle"],
	["elder", "old"],
]);
export const EL_AGE_KEY = new Map([
	["young", "young"],
	["middle_aged", "middle"],
	["middle-aged", "middle"],
	["old", "old"],
]);
export const FISH_GENDER_KEY = new Map([
	["female", "female"],
	["male", "male"],
]);
export const FISH_AGE_KEY = new Map([
	["young", "young"],
	["middle-aged", "middle"],
	["old", "old"],
]);
// 공급자 값 → 한국어 이름(공통 키의 이름표)
export const keyLabels = (
	keys: Map<string, string>,
	labels: Map<string, string>,
) => new Map([...keys].map(([value, key]) => [value, labelOf(labels, key)]));
export const providerValue = (keys: Map<string, string>, key: string | null) =>
	[...keys].find(([, common]) => common === key)?.[0] ?? null;

// 모르는 값은 공급자 값 그대로 보인다(브리프 6절).
export function labelOf(labels: Map<string, string>, value: string) {
	return labels.get(value) ?? value;
}

const tagKey = (keys: Map<string, string>, tags: readonly string[]) => {
	const tag = tags.find((value) => keys.has(value));
	return tag === undefined ? null : (keys.get(tag) ?? null);
};
// 성우의 공통 성별·연령 키. 모르는 값과 값 없음은 null이다. Fish Audio는 태그, Airy·Gemini는 연령이 없다.
// 메타 줄(voice-view personOf)도 이 판단으로 이름을 붙인다
export function genderKeyOf(
	voice: Pick<Voice, "provider" | "gender" | "tags">,
): string | null {
	// 계약의 성별 값(male·female·neutral)이 공통 키다
	if (voice.provider === "fish_audio")
		return tagKey(FISH_GENDER_KEY, voice.tags);
	return voice.gender;
}
export function ageKeyOf(
	voice: Pick<Voice, "provider" | "age" | "tags">,
): string | null {
	if (voice.provider === "fish_audio") return tagKey(FISH_AGE_KEY, voice.tags);
	const keys =
		voice.provider === "typecast"
			? TYPECAST_AGE_KEY
			: voice.provider === "elevenlabs"
				? EL_AGE_KEY
				: null;
	return (keys && voice.age && keys.get(voice.age)) || null;
}

// 고른 값이 없는 축은 거르지 않는다. 값이 없는(null) 성우는 그 축을 고르면 빠진다.
export const anyOf = (
	selected: readonly string[],
	values: readonly (string | null)[],
) =>
	selected.length === 0 ||
	values.some((value) => value !== null && selected.includes(value));

// 분위기 이름표(브리프 6절 값 표, 2026-10-04 실측 값). Map 순서가 선택지 순서다
export const EL_DESCRIPTIVE = new Map([
	["calm", "차분함"],
	["casual", "편안함"],
	["confident", "자신감"],
	["crisp", "또렷함"],
	["gentle", "다정함"],
	["classy", "고급스러움"],
	["deep", "깊음"],
	["neutral", "담담함"],
	["relaxed", "느긋함"],
	["cute", "귀여움"],
	["serious", "진지함"],
	["upbeat", "경쾌함"],
	["formal", "격식"],
	["chill", "여유로움"],
	["soft", "부드러움"],
	["professional", "전문적"],
	["pleasant", "상냥함"],
	["mature", "성숙함"],
]);
export const FISH_MOOD = new Map([
	["friendly", "친근함"],
	["clear", "또렷함"],
	["energetic", "활기참"],
	["professional", "전문적"],
	["calm", "차분함"],
	["bright", "밝음"],
	["soft", "부드러움"],
	["expressive", "표현력"],
	["smooth", "매끄러움"],
	["gentle", "다정함"],
	["cheerful", "명랑함"],
	["confident", "자신감"],
	["warm", "따뜻함"],
	["playful", "장난스러움"],
	["authoritative", "권위 있음"],
	["deep", "깊음"],
]);
