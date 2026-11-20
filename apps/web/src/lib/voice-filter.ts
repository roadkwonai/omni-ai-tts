import type { Voice } from "@tts-pilot-app/api/providers/contract";

// 성우 캐스팅의 검색·필터·선반(T3 스펙 5절, 브리프 5·6절). 화면 없이 테스트하는 순수 함수만 둔다.

export type VoiceFilters = {
	models: readonly string[];
	genders: readonly string[];
	ages: readonly string[];
	useCases: readonly string[];
};
export type FilterAxis = keyof VoiceFilters;

export const EMPTY_FILTERS: VoiceFilters = {
	models: [],
	genders: [],
	ages: [],
	useCases: [],
};

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
export const AGE_LABEL = keyLabels(TYPECAST_AGE_KEY, AGE_KEY_LABEL);
export const USE_CASE_LABEL = new Map([
	["Ads/Promotion", "광고·홍보"],
	["Audiobook/Storytelling", "오디오북·이야기"],
	["TikTok/Reels/Shorts", "틱톡·릴스·쇼츠"],
	["Game", "게임"],
	["E-learning/Explainer", "교육·설명"],
	["Conversational", "대화"],
	["Radio/Podcast", "라디오·팟캐스트"],
	["Anime", "애니메이션"],
	["Documentary", "다큐멘터리"],
	["Voicemail/Voice Assistant", "음성 안내"],
	["Announcer", "아나운서"],
	["News Reporter", "뉴스 리포터"],
	["Rapper", "랩"],
]);

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

const normalize = (text: string) => text.normalize("NFC").trim().toLowerCase();

export function hasConditions(
	query: string,
	filters: Readonly<Record<string, readonly string[]>>,
): boolean {
	return (
		normalize(query) !== "" ||
		Object.values(filters).some((values) => values.length > 0)
	);
}

// '전체' 탭의 공통 성별·연령 → Typecast 탭 조건(묶음과 '모두 보기 →' 뒤 탭이 같은 거르기라 인원이 같다)
export function typecastPeople(
	gender: string | null,
	age: string | null,
): VoiceFilters {
	const typecastAge = providerValue(TYPECAST_AGE_KEY, age);
	return {
		...EMPTY_FILTERS,
		genders: gender ? [gender] : [],
		ages: typecastAge ? [typecastAge] : [],
	};
}

// 고른 값이 없는 축은 거르지 않는다. 값이 없는(null) 성우는 그 축을 고르면 빠진다.
export const anyOf = (
	selected: readonly string[],
	values: readonly (string | null)[],
) =>
	selected.length === 0 ||
	values.some((value) => value !== null && selected.includes(value));

// 같은 축은 OR, 다른 축은 AND(REQ-02). 검색은 한글·영문 이름 부분 일치.
export function filterVoices(
	voices: readonly Voice[],
	query: string,
	filters: VoiceFilters,
): Voice[] {
	const needle = normalize(query);
	return voices.filter(
		(voice) =>
			(needle === "" ||
				normalize(voice.name).includes(needle) ||
				normalize(voice.englishName ?? "").includes(needle)) &&
			anyOf(
				filters.models,
				voice.models.map((model) => model.model),
			) &&
			anyOf(filters.genders, [voice.gender]) &&
			anyOf(filters.ages, [voice.age]) &&
			anyOf(filters.useCases, voice.useCases),
	);
}

// Airy 탭(T7.5 브리프 13절): 이름·성우 id 부분 일치(대소문자 무시) + 성별(여럿이면 OR). Typecast 검색(filterVoices, 이름만)은 그대로다
export function filterByNameOrId(
	voices: readonly Voice[],
	query: string,
	genders: readonly string[],
): Voice[] {
	const needle = normalize(query);
	return voices.filter(
		(voice) =>
			(needle === "" ||
				normalize(voice.name).includes(needle) ||
				voice.voiceId.toLowerCase().includes(needle)) &&
			anyOf(genders, [voice.gender]),
	);
}

// Gemini 탭(T7.6 스펙 2·5절). 공급자 값 → 한국어 이름. 모르는 값과 페르소나는 공급자 값 그대로다
export const GEMINI_KIND_LABEL = new Map([
	["korean", "한국어 성우"],
	["classic", "대표 성우"],
]);
export const GEMINI_PITCH_LABEL = new Map([
	["low", "낮음"],
	["medium", "중간"],
	["high", "높음"],
]);
export const GEMINI_ACCENT_LABEL = new Map([
	["Seoul Korean", "서울"],
	["Busan Korean", "부산"],
]);
export const GEMINI_CONTEXT_LABEL = new Map([
	["Content & Media", "콘텐츠·미디어"],
	["Conversational / Edu", "대화·교육"],
	["Enterprise Agent", "기업 상담"],
	["Growth & Marketing", "성장·마케팅"],
	["Wellness & Culture", "웰니스·문화"],
	["Entertainment & Gaming", "엔터테인먼트·게임"],
]);
// 한국어 목록의 성우는 ko-KR, 대표 성우는 en-US로 온다(2026-10-13 실측, 계획에서 정한 것 8)
export const geminiKind = (voice: Voice) =>
	voice.languages.includes("ko-KR") ? "korean" : "classic";

export type GeminiFilters = {
	kinds: string[];
	genders: string[];
	pitches: string[];
	accents: string[];
	contexts: string[];
	personas: string[];
};
export const EMPTY_GEMINI_FILTERS: GeminiFilters = {
	kinds: [],
	genders: [],
	pitches: [],
	accents: [],
	contexts: [],
	personas: [],
};

// 같은 축은 OR, 다른 축은 AND. 검색은 이름·성우 id·설명 부분 일치(대소문자 무시).
// 거른 뒤 일치 등급(이름 전체 → 이름 시작 → 이름 포함 → 성우 id → 설명) → 대표 성우 먼저 → 원래 순서로 안정 정렬한다(critique P2, 사용자 결정 2026-10-13).
// 인원은 그대로라 '전체' 묶음 인원과 탭 인원이 같다
export function filterGemini(
	voices: readonly Voice[],
	query: string,
	filters: GeminiFilters,
): Voice[] {
	const needle = normalize(query);
	// 맞지 않으면 null(거른다)
	const matchRank = (voice: Voice) => {
		if (needle === "") return 0;
		const name = normalize(voice.name);
		if (name === needle) return 0;
		if (name.startsWith(needle)) return 1;
		if (name.includes(needle)) return 2;
		if (voice.voiceId.toLowerCase().includes(needle)) return 3;
		if (normalize(voice.description ?? "").includes(needle)) return 4;
		return null;
	};
	const ranked = voices.flatMap((voice) => {
		const rank = matchRank(voice);
		return rank !== null &&
			anyOf(filters.kinds, [geminiKind(voice)]) &&
			anyOf(filters.genders, [voice.gender]) &&
			anyOf(filters.pitches, [voice.pitch]) &&
			anyOf(filters.accents, [voice.accent]) &&
			anyOf(filters.contexts, voice.useCases) &&
			anyOf(filters.personas, voice.personas)
			? [{ voice, rank, korean: geminiKind(voice) === "korean" ? 1 : 0 }]
			: [];
	});
	return ranked
		.sort((a, b) => a.rank - b.rank || a.korean - b.korean)
		.map(({ voice }) => voice);
}

// '전체' 탭 한 목록 묶음: 그 탭에서 같은 검색어·성별·연령을 고른 거르기(Typecast 이름, Airy 이름·성우 id, Gemini 이름·성우 id·설명).
// Airy·Gemini는 연령 정보가 없어 연령을 고르면 0명이다(브리프 casting 5절)
export function oneListFound(
	provider: "typecast" | "airy" | "gemini",
	all: readonly Voice[],
	{
		search,
		gender,
		age,
	}: { search: string; gender: string | null; age: string | null },
): Voice[] {
	if (provider === "typecast")
		return filterVoices(all, search, typecastPeople(gender, age));
	if (age !== null) return [];
	const genders = gender === null ? [] : [gender];
	return provider === "gemini"
		? filterGemini(all, search, { ...EMPTY_GEMINI_FILTERS, genders })
		: filterByNameOrId(all, search, genders);
}

// 콘텐츠별 선반. 인원 많은 순, 같으면 처음 나온 순(정렬은 안정적이다). 콘텐츠가 없는 성우는 마지막 묶음(null)이다.
export function groupByUseCase(
	voices: readonly Voice[],
): { useCase: string | null; voices: Voice[] }[] {
	const groups = new Map<string, Voice[]>();
	const none: Voice[] = [];
	for (const voice of voices) {
		if (voice.useCases.length === 0) none.push(voice);
		for (const useCase of new Set(voice.useCases)) {
			const members = groups.get(useCase) ?? [];
			members.push(voice);
			groups.set(useCase, members);
		}
	}
	const sorted = [...groups]
		.map(([useCase, members]) => ({ useCase, voices: members }))
		.sort((a, b) => b.voices.length - a.voices.length);
	return none.length > 0
		? [...sorted, { useCase: null, voices: none }]
		: sorted;
}

export type Option = { value: string; label: string };

// 아는 값은 표 순서, 모르는 값은 그 뒤에 처음 나온 순서
export function ordered(
	values: ReadonlySet<string>,
	labels: Map<string, string>,
): Option[] {
	const known = [...labels.keys()].filter((value) => values.has(value));
	const unknown = [...values].filter((value) => !labels.has(value));
	return [...known, ...unknown].map((value) => ({
		value,
		label: labelOf(labels, value),
	}));
}

// 받은 목록에 있는 값으로 선택지를 만든다(공급자가 새 값을 더해도 보인다, 스펙 5절).
export function filterOptions(
	voices: readonly Voice[],
): Record<FilterAxis, Option[]> {
	const models = new Set<string>();
	const genders = new Set<string>();
	const ages = new Set<string>();
	for (const voice of voices) {
		for (const { model } of voice.models) models.add(model);
		if (voice.gender) genders.add(voice.gender);
		if (voice.age) ages.add(voice.age);
	}
	return {
		// 공급자 값 그대로, 새 판(숫자가 큰 것)이 먼저
		models: [...models]
			.sort((a, b) => b.localeCompare(a, "en", { numeric: true }))
			.map((value) => ({ value, label: value })),
		genders: ordered(genders, GENDER_LABEL),
		ages: ordered(ages, AGE_LABEL),
		useCases: groupByUseCase(voices).flatMap(({ useCase }) =>
			useCase === null
				? []
				: [{ value: useCase, label: labelOf(USE_CASE_LABEL, useCase) }],
		),
	};
}

// Gemini 조건 선택지(받은 목록의 값으로). 억양은 한국어 성우 값만(대표 성우의 영어 억양은 선택지가 아니다, 계획에서 정한 것 9)
export function geminiOptions(
	voices: readonly Voice[],
): Record<keyof GeminiFilters, Option[]> {
	const sets = {
		kinds: new Set<string>(),
		genders: new Set<string>(),
		pitches: new Set<string>(),
		accents: new Set<string>(),
		contexts: new Set<string>(),
		personas: new Set<string>(),
	};
	for (const voice of voices) {
		const kind = geminiKind(voice);
		sets.kinds.add(kind);
		if (voice.gender) sets.genders.add(voice.gender);
		if (voice.pitch) sets.pitches.add(voice.pitch);
		if (voice.accent && kind === "korean") sets.accents.add(voice.accent);
		for (const value of voice.useCases) sets.contexts.add(value);
		for (const value of voice.personas) sets.personas.add(value);
	}
	return {
		kinds: ordered(sets.kinds, GEMINI_KIND_LABEL),
		genders: ordered(sets.genders, GENDER_LABEL),
		pitches: ordered(sets.pitches, GEMINI_PITCH_LABEL),
		accents: ordered(sets.accents, GEMINI_ACCENT_LABEL),
		contexts: ordered(sets.contexts, GEMINI_CONTEXT_LABEL),
		// 이름표가 없어 공급자 값 그대로, 알파벳순
		personas: [...sets.personas]
			.sort((a, b) => a.localeCompare(b, "en"))
			.map((value) => ({ value, label: value })),
	};
}
