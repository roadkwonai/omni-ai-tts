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

// 브리프 6절 표. Map의 순서가 선택지 순서다.
export const GENDER_LABEL = new Map([
	["female", "여성"],
	["male", "남성"],
	["neutral", "중성"],
]);
export const AGE_LABEL = new Map([
	["child", "어린이"],
	["teenager", "청소년"],
	["young_adult", "청년"],
	["middle_age", "중년"],
	["elder", "노년"],
]);
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
export const labelOf = (labels: Map<string, string>, value: string) =>
	labels.get(value) ?? value;

const normalize = (text: string) => text.normalize("NFC").trim().toLowerCase();

export function hasConditions(query: string, filters: VoiceFilters): boolean {
	return (
		normalize(query) !== "" ||
		Object.values(filters).some((values) => values.length > 0)
	);
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
function ordered(
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
