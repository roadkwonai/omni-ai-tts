import type {
	ListInputOf,
	VoiceListInput,
	VoiceSource,
} from "@tts-pilot-app/api/providers/contract";
import { EL_DESCRIPTIVE, FISH_MOOD } from "@tts-pilot-app/api/voice-filter";

import {
	AGE_KEY_LABEL,
	EL_AGE_KEY,
	FISH_AGE_KEY,
	FISH_GENDER_KEY,
	GENDER_LABEL,
	keyLabels,
	type Option,
	providerValue,
} from "./voice-filter";

// 분위기 이름표는 CLI와 함께 쓰는 공용 모듈에 있다(T21)
export { EL_DESCRIPTIVE, FISH_MOOD } from "@tts-pilot-app/api/voice-filter";

// ElevenLabs·Fish Audio 조건 줄(T4 브리프 6절). 조건은 공급자 입력의 query 그대로 들고, 서버가 공급자에게 그대로 보낸다.
export type ElPublicQuery = Extract<
	ListInputOf<"elevenlabs">,
	{ source: "public" }
>["query"];
export type ElAccountQuery = Extract<
	ListInputOf<"elevenlabs">,
	{ source: "account" }
>["query"];
export type FishQuery = ListInputOf<"fish_audio">["query"];
export type ServerList =
	| { provider: "elevenlabs"; source: "public"; query: ElPublicQuery }
	| { provider: "elevenlabs"; source: "account"; query: ElAccountQuery }
	| { provider: "fish_audio"; source: VoiceSource; query: FishQuery };
export type ServerProvider = ServerList["provider"];

const names = new Intl.DisplayNames(["ko"], { type: "language" });
// 언어 코드의 한국어 이름("ko" → "한국어"). 모르는 코드는 코드 그대로
export function languageName(code: string): string {
	try {
		return names.of(code) ?? code;
	} catch {
		return code;
	}
}

// 브리프 6절 값 표(2026-10-04 실측 값). Map 순서가 선택지 순서다. 성별은 voice-filter의 GENDER_LABEL(여성·남성·중성)을 쓴다.
export const EL_AGE = keyLabels(EL_AGE_KEY, AGE_KEY_LABEL);
export const ACCENT_KO = new Map([
	["standard", "표준 억양"],
	["seoul", "서울 억양"],
	["gyeongsang", "경상 억양"],
	["jeolla", "전라 억양"],
	["chungcheong", "충청 억양"],
	["hamgyong", "함경 억양"],
]);
// 억양 선택지(브리프 6절): 한국어면 ACCENT_KO 이름과 표 순서(표준·서울 먼저), 표에 없는 값은 뒤에 공급자 순서로(critique 2026-10-05).
// 다른 언어는 공급자 이름과 순서 그대로다
export function accentOptions(
	accents: readonly { value: string; name: string }[],
	language: string | null,
): Option[] {
	const options = accents.map(({ value, name }) => ({
		value,
		label: language === "ko" ? (ACCENT_KO.get(value) ?? name) : name,
	}));
	if (language !== "ko") return options;
	const order = [...ACCENT_KO.keys()];
	const rank = (value: string) =>
		order.includes(value) ? order.indexOf(value) : order.length;
	// sort는 안정 정렬이라 표에 없는 값끼리는 공급자 순서가 남는다
	return options.sort((a, b) => rank(a.value) - rank(b.value));
}
export const EL_USE_CASE = new Map([
	["narrative_story", "이야기·내레이션"],
	["informative_educational", "정보·교육"],
	["conversational", "대화"],
	["social_media", "소셜 미디어"],
	["characters_animation", "캐릭터·애니메이션"],
	["entertainment_tv", "엔터테인먼트·TV"],
	["advertisement", "광고"],
]);
export const EL_PUBLIC_CATEGORY = new Map([
	["professional", "전문 클론"],
	["famous", "유명인"],
	["high_quality", "고품질"],
]);
export const EL_ACCOUNT_CATEGORY = new Map([
	["premade", "제공 성우"],
	["cloned", "클론"],
	["generated", "보이스 디자인"],
	["professional", "전문 클론"],
]);
// 계정 성우의 출처 문구. 조건 선택지(EL_ORIGIN)와 행 배지(voice-view)가 함께 쓴다
export const ORIGIN_TEXT = {
	premade: "제공 성우",
	saved: "라이브러리에서 저장",
	own: "내가 만든 성우",
} as const;
export const EL_ORIGIN = new Map([
	["personal", ORIGIN_TEXT.own],
	["community", ORIGIN_TEXT.saved],
	["default", ORIGIN_TEXT.premade],
]);
export const FISH_GENDER = keyLabels(FISH_GENDER_KEY, GENDER_LABEL);
export const FISH_AGE = keyLabels(FISH_AGE_KEY, AGE_KEY_LABEL);
export const FISH_CONTENT = new Map([
	["narration", "내레이션"],
	["social-media", "소셜 미디어"],
	["conversational", "대화"],
	["entertainment", "엔터테인먼트"],
	["storytelling", "이야기"],
	["educational", "교육"],
	["advertisement", "광고"],
	["character-voice", "캐릭터"],
	["announcer", "아나운서"],
	["documentary", "다큐멘터리"],
	["gaming", "게임"],
	["podcast", "팟캐스트"],
	["anime", "애니메이션"],
]);
const LANGUAGES = ["ko", "en", "ja", "zh"];

const options = (labels: Map<string, string>): Option[] => {
	const seen = new Set<string>();
	// middle_aged·middle-aged처럼 같은 이름표는 첫 값만 선택지로 둔다
	return [...labels].flatMap(([value, label]) => {
		if (seen.has(label)) return [];
		seen.add(label);
		return [{ value, label }];
	});
};
const LANGUAGE_OPTIONS: Option[] = LANGUAGES.map((code) => ({
	value: code,
	label: languageName(code),
}));

export function initialList(
	provider: ServerProvider,
	source: VoiceSource,
): ServerList {
	if (provider === "fish_audio") {
		return {
			provider,
			source,
			query: {
				search: "",
				language: source === "public" ? "ko" : null,
				tags: [],
				licensed: false,
				sort: "score",
			},
		};
	}
	return source === "public"
		? {
				provider,
				source,
				query: {
					search: "",
					language: "ko",
					accent: null,
					gender: null,
					age: null,
					category: null,
					useCases: [],
					descriptives: [],
					featured: false,
					sort: "trending",
				},
			}
		: {
				provider,
				source,
				query: {
					search: "",
					voiceType: null,
					category: null,
					gender: null,
					age: null,
					language: null,
					accent: null,
					useCases: [],
					sort: "created_at_unix",
					direction: "desc",
				},
			};
}

// 첫 페이지 매개변수(ElevenLabs 공개 0, Fish Audio 1, ElevenLabs 내 계정은 커서 null)
export function firstPage(list: ServerList): number | null {
	if (list.provider === "fish_audio") return 1;
	return list.source === "public" ? 0 : null;
}

const sorted = (values: readonly string[]) => [...values].sort();

// 같은 조건은 같은 입력이다(배열 정렬, 검색어 앞뒤 공백 제거). 브라우저 조회 키와 서버 캐시 키가 함께 맞는다(Review Focus 1)
export function inputOf(
	list: ServerList,
	page: number | string | null,
): VoiceListInput {
	if (list.provider === "fish_audio") {
		return {
			provider: "fish_audio",
			source: list.source,
			page: typeof page === "number" ? page : 1,
			query: {
				...list.query,
				search: list.query.search.trim(),
				tags: sorted(list.query.tags),
			},
		};
	}
	if (list.source === "public") {
		return {
			provider: "elevenlabs",
			source: "public",
			page: typeof page === "number" ? page : 0,
			query: {
				...list.query,
				search: list.query.search.trim(),
				useCases: sorted(list.query.useCases),
				descriptives: sorted(list.query.descriptives),
			},
		};
	}
	return {
		provider: "elevenlabs",
		source: "account",
		cursor: typeof page === "string" ? page : null,
		query: {
			...list.query,
			search: list.query.search.trim(),
			useCases: sorted(list.query.useCases),
		},
	};
}

// 조건 일부만 바꾼 목록. 공급자·출처마다 query 모양이 달라 합친 결과를 ServerList로 본다
const withQuery = <L extends ServerList>(
	list: L,
	patch: Partial<L["query"]>,
): ServerList =>
	({ ...list, query: { ...list.query, ...patch } }) as ServerList;
export const withSearch = (list: ServerList, search: string) =>
	withQuery(list, { search });
// '전체' 탭의 공통 성별·연령(키) → 그 공급자 탭이 같은 조건을 고른 것과 같은 조회 인자(ElevenLabs gender·age, Fish Audio 태그)
export function withPeople(
	list: ServerList,
	gender: string | null,
	age: string | null,
): ServerList {
	if (list.provider === "fish_audio") {
		const added = [
			providerValue(FISH_GENDER_KEY, gender),
			providerValue(FISH_AGE_KEY, age),
		].filter((tag) => tag !== null);
		return added.length === 0
			? list
			: withQuery(list, { tags: [...list.query.tags, ...added] });
	}
	if (gender === null && age === null) return list;
	return withQuery(list, {
		gender,
		age: providerValue(EL_AGE_KEY, age),
	} as Partial<ElPublicQuery>);
}

// 조건 하나. 하나·여럿 고르기는 값 배열, 토글은 불린이다(ponytail)
type AxisBase = { key: string; label: string };
export type ChoiceAxis = AxisBase & {
	kind: "single" | "multi";
	options: Option[];
	selected: string[];
	apply: (values: string[]) => ServerList;
	// 하나 고르기의 '조건 없음' 항목 이름(기본 '전체')
	emptyLabel?: string;
	// 드롭다운 머리의 회색 작은 글자(Fish Audio 태그 '모두 포함')
	note?: string;
	// 고를 값이 없는 사유. 있으면 선택지가 비어도 열어서 이 한 줄을 본다
	hint?: string;
};
export type ToggleAxis = AxisBase & {
	kind: "toggle";
	on: boolean;
	apply: (on: boolean) => ServerList;
};
export type Axis = ChoiceAxis | ToggleAxis;

// 축 빌더. 선택지는 options에서만 오므로 하나 고르기 값은 그 축의 값 형으로 좁힌다
const single = <V extends string>(
	key: string,
	label: string,
	choices: Option[],
	value: V | null,
	apply: (value: V | null) => ServerList,
	extra: Partial<ChoiceAxis> = {},
): ChoiceAxis => ({
	key,
	label,
	kind: "single",
	options: choices,
	selected: value === null ? [] : [value],
	apply: (values) => apply((values[0] ?? null) as V | null),
	...extra,
});
const multi = (
	key: string,
	label: string,
	choices: Option[],
	values: readonly string[],
	apply: (values: string[]) => ServerList,
	extra: Partial<ChoiceAxis> = {},
): ChoiceAxis => ({
	key,
	label,
	kind: "multi",
	options: choices,
	selected: [...values],
	apply,
	...extra,
});
const toggle = (
	key: string,
	label: string,
	on: boolean,
	apply: (on: boolean) => ServerList,
): ToggleAxis => ({ key, label, kind: "toggle", on, apply });

// Fish Audio 태그 드롭다운: 이 묶음의 태그만 바꾸고 다른 묶음의 태그는 남긴다(모두 query.tags 하나에 쓴다)
function tagAxis(
	list: Extract<ServerList, { provider: "fish_audio" }>,
	key: string,
	label: string,
	labels: Map<string, string>,
): ChoiceAxis {
	const own = new Set(labels.keys());
	return multi(
		key,
		label,
		options(labels),
		list.query.tags.filter((tag) => own.has(tag)),
		(values) =>
			withQuery(list, {
				tags: [...list.query.tags.filter((tag) => !own.has(tag)), ...values],
			}),
		{ note: "모두 포함" },
	);
}

// 억양(ElevenLabs 공개·내 계정): 언어가 '모든 언어'(null)면 끄지 않고, 열면 고를 값 없이 사유 한 줄만 보인다(재확인 critique 2026-10-05).
// 캐시에 남은 다른 언어의 억양 선택지도 넣지 않는다
const accentAxis = (
	language: string | null,
	accent: string | null,
	accents: Option[],
	apply: (accent: string | null) => ServerList,
): ChoiceAxis =>
	language === null
		? single("accent", "억양", [], accent, apply, {
				hint: "언어를 먼저 고르면 억양을 고를 수 있어요",
			})
		: single("accent", "억양", accents, accent, apply);

export function axesOf(list: ServerList, accents: Option[]): Axis[] {
	if (list.provider === "fish_audio") {
		const { query } = list;
		return [
			single(
				"language",
				"언어",
				LANGUAGE_OPTIONS,
				query.language,
				(language) => withQuery(list, { language }),
				{ emptyLabel: "모든 언어" },
			),
			tagAxis(list, "gender", "성별", FISH_GENDER),
			tagAxis(list, "age", "연령", FISH_AGE),
			tagAxis(list, "content", "콘텐츠", FISH_CONTENT),
			tagAxis(list, "mood", "분위기", FISH_MOOD),
			...(list.source === "public"
				? [
						toggle("licensed", "보증 성우만", query.licensed, (licensed) =>
							withQuery(list, { licensed }),
						),
					]
				: []),
		];
	}
	if (list.source === "public") {
		const { query } = list;
		return [
			// 언어를 바꾸면 억양 선택지가 바뀌므로 억양 조건을 푼다(AC3)
			single(
				"language",
				"언어",
				LANGUAGE_OPTIONS,
				query.language,
				(language) => withQuery(list, { language, accent: null }),
				{ emptyLabel: "모든 언어" },
			),
			accentAxis(query.language, query.accent, accents, (accent) =>
				withQuery(list, { accent }),
			),
			single("gender", "성별", options(GENDER_LABEL), query.gender, (gender) =>
				withQuery(list, { gender }),
			),
			single("age", "연령", options(EL_AGE), query.age, (age) =>
				withQuery(list, { age }),
			),
			multi(
				"useCases",
				"콘텐츠",
				options(EL_USE_CASE),
				query.useCases,
				(useCases) => withQuery(list, { useCases }),
			),
			multi(
				"descriptives",
				"분위기",
				options(EL_DESCRIPTIVE),
				query.descriptives,
				(descriptives) => withQuery(list, { descriptives }),
			),
			single(
				"category",
				"성우 종류",
				options(EL_PUBLIC_CATEGORY),
				query.category,
				(category) => withQuery(list, { category }),
			),
			toggle("featured", "추천 성우만", query.featured, (featured) =>
				withQuery(list, { featured }),
			),
		];
	}
	const { query } = list;
	return [
		single(
			"voiceType",
			"출처",
			options(EL_ORIGIN),
			query.voiceType,
			(voiceType) => withQuery(list, { voiceType }),
		),
		single(
			"category",
			"성우 종류",
			options(EL_ACCOUNT_CATEGORY),
			query.category,
			(category) => withQuery(list, { category }),
		),
		single("gender", "성별", options(GENDER_LABEL), query.gender, (gender) =>
			withQuery(list, { gender }),
		),
		single("age", "연령", options(EL_AGE), query.age, (age) =>
			withQuery(list, { age }),
		),
		single(
			"language",
			"언어",
			LANGUAGE_OPTIONS,
			query.language,
			(language) => withQuery(list, { language, accent: null }),
			{ emptyLabel: "모든 언어" },
		),
		accentAxis(query.language, query.accent, accents, (accent) =>
			withQuery(list, { accent }),
		),
		multi(
			"useCases",
			"콘텐츠",
			options(EL_USE_CASE),
			query.useCases,
			(useCases) => withQuery(list, { useCases }),
		),
	];
}

export type SortView = {
	options: Option[];
	value: string;
	apply: (value: string) => ServerList;
};
const SORTS = {
	fish: new Map([
		["score", "점수"],
		["task_count", "사용 횟수"],
		["created_at", "최신"],
	]),
	elPublic: new Map([
		["trending", "인기 급상승"],
		["created_date", "최신"],
		["usage_character_count_1y", "1년 사용량"],
		["cloned_by_count", "복제 수"],
	]),
	// 내 계정: 정렬과 방향을 선택 하나로 묶는다(T4 계획 '스펙과 다른 점' 5, 사용자 승인 2026-10-04)
	elAccount: new Map([
		["created_at_unix:desc", "최근 만든 순"],
		["created_at_unix:asc", "오래된 순"],
		["name:asc", "이름순"],
		["name:desc", "이름 역순"],
	]),
};

export function sortOf(list: ServerList): SortView {
	if (list.provider === "fish_audio") {
		return {
			options: options(SORTS.fish),
			value: list.query.sort,
			apply: (value) => withQuery(list, { sort: value as FishQuery["sort"] }),
		};
	}
	if (list.source === "public") {
		return {
			options: options(SORTS.elPublic),
			value: list.query.sort,
			apply: (value) =>
				withQuery(list, { sort: value as ElPublicQuery["sort"] }),
		};
	}
	return {
		options: options(SORTS.elAccount),
		value: `${list.query.sort}:${list.query.direction}`,
		apply: (value) => {
			const [sort, direction] = value.split(":") as [
				ElAccountQuery["sort"],
				ElAccountQuery["direction"],
			];
			return withQuery(list, { sort, direction });
		},
	};
}

const picked = (axis: Axis): string[] =>
	axis.kind === "toggle" ? (axis.on ? [axis.key] : []) : axis.selected;

// 시작값과 다른 조건의 수('조건' 버튼 배지). 검색어와 정렬은 세지 않는다
export function conditionCount(list: ServerList): number {
	const start = new Map(
		axesOf(initialList(list.provider, list.source), []).map((axis) => [
			axis.key,
			picked(axis),
		]),
	);
	return axesOf(list, []).reduce((sum, axis) => {
		const now = picked(axis);
		const initial = start.get(axis.key) ?? [];
		const same =
			now.length === initial.length &&
			now.every((value) => initial.includes(value));
		return sum + (same ? 0 : Math.max(now.length, 1));
	}, 0);
}

// 검색어·조건·정렬이 모두 시작값이면 참('조건 모두 해제'를 숨긴다)
export function isInitial(list: ServerList): boolean {
	return (
		list.query.search.trim() === "" &&
		conditionCount(list) === 0 &&
		sortOf(list).value === sortOf(initialList(list.provider, list.source)).value
	);
}
