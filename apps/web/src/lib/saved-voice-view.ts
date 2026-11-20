import { cleanText } from "@tts-pilot-app/api/classification-rules";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";

import {
	byName,
	GROUP_TEXT,
	GROUPS,
	type Group,
	groupLists,
	type Named,
} from "./classes-view";
import { PROVIDER_IDS } from "./connection-view";
import { EL_DESCRIPTIVE, FISH_MOOD } from "./provider-conditions";
import {
	AGE_KEY_LABEL,
	ageKeyOf,
	anyOf,
	GENDER_LABEL,
	genderKeyOf,
	type Option,
	ordered,
} from "./voice-filter";

// 보관함의 같은 성우: 공급자 + 성우 id(REQ-04). 목록 행 키 voiceKey는 출처까지 넣으므로 따로 둔다
export const savedKey = (voice: Pick<Voice, "provider" | "voiceId">) =>
	`${voice.provider}:${voice.voiceId}`;

// 공통 태그(브리프 B4-2). 공급자마다 다른 태그 값 → 한국어 공통 묶음. 표 순서가 선택지 순서이고 한 값이 여러 묶음에 걸릴 수 있다.
// 원래 값은 공급자 이름표(USE_CASE_LABEL·EL_USE_CASE·FISH_CONTENT·GEMINI_CONTEXT_LABEL) 키와 같아야 한다(테스트가 묶는다)
type TagRow = {
	key: string;
	label: string;
	typecast: readonly string[];
	elevenlabs: readonly string[];
	fish_audio: readonly string[];
	gemini: readonly string[];
};
export const CONTENT_TAGS: readonly TagRow[] = [
	{
		key: "narration",
		label: "내레이션·오디오북",
		typecast: ["Audiobook/Storytelling", "Documentary"],
		elevenlabs: ["narrative_story"],
		fish_audio: ["narration", "storytelling", "documentary"],
		gemini: [],
	},
	{
		key: "conversation",
		label: "대화·상담",
		typecast: ["Conversational", "Voicemail/Voice Assistant"],
		elevenlabs: ["conversational"],
		fish_audio: ["conversational"],
		gemini: ["Conversational / Edu", "Enterprise Agent"],
	},
	{
		key: "education",
		label: "교육·설명",
		typecast: ["E-learning/Explainer"],
		elevenlabs: ["informative_educational"],
		fish_audio: ["educational"],
		gemini: ["Conversational / Edu"],
	},
	{
		key: "ads",
		label: "광고·홍보",
		typecast: ["Ads/Promotion"],
		elevenlabs: ["advertisement"],
		fish_audio: ["advertisement"],
		gemini: ["Growth & Marketing"],
	},
	{
		key: "social",
		label: "소셜 미디어·쇼츠",
		typecast: ["TikTok/Reels/Shorts"],
		elevenlabs: ["social_media"],
		fish_audio: ["social-media"],
		gemini: ["Content & Media"],
	},
	{
		key: "entertainment",
		label: "엔터테인먼트·게임",
		typecast: ["Game", "Rapper"],
		elevenlabs: ["entertainment_tv"],
		fish_audio: ["entertainment", "gaming"],
		gemini: ["Entertainment & Gaming"],
	},
	{
		key: "character",
		label: "캐릭터·애니메이션",
		typecast: ["Anime"],
		elevenlabs: ["characters_animation"],
		fish_audio: ["character-voice", "anime"],
		gemini: [],
	},
	{
		key: "news",
		label: "뉴스·아나운서",
		typecast: ["Announcer", "News Reporter"],
		elevenlabs: [],
		fish_audio: ["announcer"],
		gemini: [],
	},
	{
		key: "podcast",
		label: "라디오·팟캐스트",
		typecast: ["Radio/Podcast"],
		elevenlabs: [],
		fish_audio: ["podcast"],
		gemini: [],
	},
];
// 분위기: 두 이름표의 같은 한국어 이름을 한 묶음으로(ElevenLabs 표 순서 → Fish Audio에만 있는 이름). 키는 묶음의 첫 원래 값이다
const BRIGHT = new Set(["밝음", "명랑함", "활기참", "경쾌함"]);
export const MOOD_TAGS: readonly TagRow[] = (() => {
	const rows = new Map<string, TagRow>();
	const add = (
		provider: "elevenlabs" | "fish_audio",
		value: string,
		name: string,
	) => {
		const label = BRIGHT.has(name) ? "밝고 경쾌함" : name;
		const row = rows.get(label) ?? {
			key: value,
			label,
			typecast: [],
			elevenlabs: [],
			fish_audio: [],
			gemini: [],
		};
		rows.set(label, { ...row, [provider]: [...row[provider], value] });
	};
	for (const [value, name] of EL_DESCRIPTIVE) add("elevenlabs", value, name);
	for (const [value, name] of FISH_MOOD) add("fish_audio", value, name);
	return [...rows.values()];
})();
const TAG_TABLE = { content: CONTENT_TAGS, mood: MOOD_TAGS } as const;
export type TagAxis = keyof typeof TAG_TABLE;
const TAG_LABEL = {
	content: new Map(CONTENT_TAGS.map((row) => [row.key, row.label])),
	mood: new Map(MOOD_TAGS.map((row) => [row.key, row.label])),
};

// 성우의 공통 태그 키(표 순서, 중복 없음). Typecast·ElevenLabs·Gemini 콘텐츠는 useCases, ElevenLabs 분위기는 descriptives,
// Fish Audio는 tags(콘텐츠·분위기 섞임), Airy는 없다
export function tagKeysOf(
	voice: Pick<Voice, "provider" | "useCases" | "descriptives" | "tags">,
	axis: TagAxis,
): string[] {
	const { provider } = voice;
	if (provider === "airy") return [];
	const values =
		provider === "fish_audio"
			? voice.tags
			: axis === "mood"
				? voice.descriptives
				: voice.useCases;
	return TAG_TABLE[axis]
		.filter((row) => row[provider].some((value) => values.includes(value)))
		.map((row) => row.key);
}

// 정렬(브리프 B4-2). 조건이 아니라 hasLibraryFilters·'조건 모두 해제'에 들지 않는다
export const LIBRARY_SORTS = [
	{ value: "recent", label: "최근 담은 순" },
	{ value: "used", label: "최근 쓴 순" },
	{ value: "count", label: "사용 횟수순" },
	{ value: "name", label: "이름순" },
	{ value: "popular", label: "서비스 인기순" },
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number]["value"];

export type LibraryView = "all" | "favorite" | "frequent" | "preset";
export type LibraryFilters = {
	q: string;
	view: LibraryView;
	provider: ProviderId | null;
	channel: string[];
	category: string[];
	type: string[];
	// 공통 키 하나(voice-filter genderKeyOf·ageKeyOf, 브리프 B4 단일 선택)
	gender: string | null;
	age: string | null;
	// 공통 태그 키 여럿(CONTENT_TAGS·MOOD_TAGS)
	content: string[];
	mood: string[];
	sort: LibrarySort;
};
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
	q: "",
	view: "all",
	provider: null,
	channel: [],
	category: [],
	type: [],
	gender: null,
	age: null,
	content: [],
	mood: [],
	sort: "recent",
};
const VIEWS: readonly LibraryView[] = ["all", "favorite", "frequent", "preset"];

// 필터는 주소 쿼리가 정본이다('성우 N명' 링크가 이 주소로 온다, 스펙 2절). 모르는 값은 기본값이다
export function filtersFromQuery(params: URLSearchParams): LibraryFilters {
	const view = params.get("view");
	const provider = params.get("provider");
	const sort = params.get("sort");
	const ids = (key: string) => [...new Set(params.getAll(key).filter(Boolean))];
	return {
		q: params.get("q") ?? "",
		view: VIEWS.find((v) => v === view) ?? "all",
		provider: PROVIDER_IDS.find((p) => p === provider) ?? null,
		channel: ids("channel"),
		category: ids("category"),
		type: ids("type"),
		// 값 하나. 여럿이면 첫 아는 키, 모르는 키는 버린다
		gender:
			params.getAll("gender").find((key) => GENDER_LABEL.has(key)) ?? null,
		age: params.getAll("age").find((key) => AGE_KEY_LABEL.has(key)) ?? null,
		content: ids("content").filter((key) => TAG_LABEL.content.has(key)),
		mood: ids("mood").filter((key) => TAG_LABEL.mood.has(key)),
		sort:
			LIBRARY_SORTS.find((option) => option.value === sort)?.value ?? "recent",
	};
}

export function queryFromFilters(filters: LibraryFilters): string {
	const params = new URLSearchParams();
	if (foldName(filters.q)) params.set("q", filters.q);
	if (filters.view !== "all") params.set("view", filters.view);
	if (filters.provider) params.set("provider", filters.provider);
	for (const key of GROUPS)
		for (const id of filters[key]) params.append(key, id);
	if (filters.gender) params.set("gender", filters.gender);
	if (filters.age) params.set("age", filters.age);
	for (const key of ["content", "mood"] as const)
		for (const tag of filters[key]) params.append(key, tag);
	if (filters.sort !== "recent") params.set("sort", filters.sort);
	return params.toString();
}

// 정렬은 조건이 아니다(브리프 B4-2)
export const hasLibraryFilters = (filters: LibraryFilters) =>
	queryFromFilters({ ...filters, sort: "recent" }) !== "";

// 지워진 채널·분류의 id(옛 링크, 다른 탭에서 지움)는 버린다. 버리지 않으면 보이지 않는 조건이 목록을 비운다
export function knownOnly(
	filters: LibraryFilters,
	known: ReadonlySet<string>,
): LibraryFilters {
	const keep = (ids: string[]) => ids.filter((id) => known.has(id));
	return {
		...filters,
		channel: keep(filters.channel),
		category: keep(filters.category),
		type: keep(filters.type),
	};
}

type SavedLike = {
	id: string;
	voice: Pick<
		Voice,
		| "provider"
		| "voiceId"
		| "name"
		| "englishName"
		| "gender"
		| "age"
		| "tags"
		| "useCases"
		| "descriptives"
		| "usage"
	>;
	favorite: boolean;
	frequent: boolean;
	memo: string | null;
	channelIds: readonly string[];
	classificationIds: readonly string[];
};

// 이름 비교·검색: 서버 중복 규칙(cleanText 정리 + 대소문자 무시, T6)과 같게 접는다. 분류 붙이기 검색도 이것을 쓴다
export const foldName = (text: string) =>
	cleanText(text).toLocaleLowerCase("ko");

// '프리셋' 보기는 프리셋에 쓰는 담은 성우 id 집합으로 거른다(presetVoiceIds, T8)
// 같은 그룹 안은 하나라도 맞으면(OR), 그룹끼리는 모두 맞아야(AND). 카테고리·타입 id는 uuid라 classificationIds 하나에서 함께 찾는다
export function filterSaved<T extends SavedLike>(
	items: readonly T[],
	filters: LibraryFilters,
	presetVoices: ReadonlySet<string> = new Set(),
): T[] {
	const q = foldName(filters.q);
	return items.filter(
		(item) =>
			(filters.view === "all" ||
				(filters.view === "preset"
					? presetVoices.has(item.id)
					: item[filters.view])) &&
			(filters.provider === null || item.voice.provider === filters.provider) &&
			anyOf(filters.channel, item.channelIds) &&
			anyOf(filters.category, item.classificationIds) &&
			anyOf(filters.type, item.classificationIds) &&
			(filters.gender === null || genderKeyOf(item.voice) === filters.gender) &&
			(filters.age === null || ageKeyOf(item.voice) === filters.age) &&
			anyOf(filters.content, tagKeysOf(item.voice, "content")) &&
			anyOf(filters.mood, tagKeysOf(item.voice, "mood")) &&
			(q === "" ||
				[item.voice.name, item.voice.englishName, item.memo].some(
					(text) => text !== null && foldName(text).includes(q),
				)),
	);
}

// 성별·연령 선택지: 담은 성우에 있는 공통 키만, 표 순서로(브리프 B4). 고른 키는 담은 성우에 없어도 남겨 풀 수 있게 한다(옛 주소)
export function peopleOptions(
	items: readonly Pick<SavedLike, "voice">[],
	filters: Pick<LibraryFilters, "gender" | "age">,
): { gender: Option[]; age: Option[] } {
	const genders = new Set(filters.gender ? [filters.gender] : []);
	const ages = new Set(filters.age ? [filters.age] : []);
	for (const { voice } of items) {
		const gender = genderKeyOf(voice);
		const age = ageKeyOf(voice);
		if (gender) genders.add(gender);
		if (age) ages.add(age);
	}
	return {
		gender: ordered(genders, GENDER_LABEL),
		age: ordered(ages, AGE_KEY_LABEL),
	};
}

// 콘텐츠·분위기 선택지: 담은 성우에 있는 묶음만 표 순서로. 고른 키는 없어도 남겨 풀 수 있게 한다(peopleOptions와 같다)
export function tagOptions(
	items: readonly Pick<SavedLike, "voice">[],
	filters: Pick<LibraryFilters, TagAxis>,
): Record<TagAxis, Option[]> {
	const of = (axis: TagAxis) => {
		const keys = new Set(filters[axis]);
		for (const { voice } of items)
			for (const key of tagKeysOf(voice, axis)) keys.add(key);
		return ordered(keys, TAG_LABEL[axis]);
	};
	return { content: of("content"), mood: of("mood") };
}

const HANGUL = /^\p{Script=Hangul}/u;
const collator = new Intl.Collator("ko");
// 공급사 수치 묶음: ElevenLabs(최근 1년 글자 수) → Fish Audio(사용 횟수) → 수치 없음. 단위가 달라 섞지 않는다
const usageGroup = (usage: Voice["usage"]) =>
	usage === null ? 2 : usage.kind === "chars_1y" ? 0 : 1;
type SortLike = Pick<SavedLike, "voice"> & {
	lastUsedAt: string | null;
	useCount: number;
};
const compare: Record<
	Exclude<LibrarySort, "recent">,
	(a: SortLike, b: SortLike) => number
> = {
	// ISO 시각이라 글자 비교가 시간 비교다. 쓴 적 없으면 뒤
	used: (a, b) =>
		a.lastUsedAt === b.lastUsedAt
			? 0
			: a.lastUsedAt === null
				? 1
				: b.lastUsedAt === null
					? -1
					: b.lastUsedAt.localeCompare(a.lastUsedAt),
	count: (a, b) => b.useCount - a.useCount,
	name: (a, b) =>
		Number(!HANGUL.test(a.voice.name.trim())) -
			Number(!HANGUL.test(b.voice.name.trim())) ||
		collator.compare(a.voice.name.trim(), b.voice.name.trim()),
	popular: (a, b) =>
		usageGroup(a.voice.usage) - usageGroup(b.voice.usage) ||
		(b.voice.usage?.count ?? 0) - (a.voice.usage?.count ?? 0),
};
// 거른 뒤 보이는 목록에만 건다. 서버가 준 순서가 담은 순서(savedAt desc)이고, 안정 정렬이라 동률은 담은 순서다
export function sortSaved<T extends SortLike>(
	items: readonly T[],
	sort: LibrarySort,
): T[] {
	return sort === "recent" ? [...items] : items.toSorted(compare[sort]);
}

// 서비스 인기순 목록의 묶음 머리(브리프 B4-2). sortSaved(popular)를 거친 목록을 받아 행이 있는 묶음만 돌려준다
const POPULAR_LABEL = [
	"ElevenLabs · 최근 1년 글자 수",
	"Fish Audio · 사용 횟수",
	"인기 수치 없음",
];
export function popularGroups<T extends Pick<SavedLike, "voice">>(
	items: readonly T[],
): { label: string; items: T[] }[] {
	return POPULAR_LABEL.map((label, group) => ({
		label,
		items: items.filter((item) => usageGroup(item.voice.usage) === group),
	})).filter((group) => group.items.length > 0);
}

// 다른 조건은 통과했지만 고른 태그 축(콘텐츠·분위기)에 값이 없어서만 빠진 성우 수(브리프 B4-2 안내 줄)
export function tagMissingCount<T extends SavedLike>(
	items: readonly T[],
	filters: LibraryFilters,
	presetVoices?: ReadonlySet<string>,
): number {
	const axes = (["content", "mood"] as const).filter(
		(axis) => filters[axis].length > 0,
	);
	if (axes.length === 0) return 0;
	return filterSaved(
		items,
		{ ...filters, content: [], mood: [] },
		presetVoices,
	).filter((item) => {
		const keyed = axes.map(
			(axis) => [axis, tagKeysOf(item.voice, axis)] as const,
		);
		return (
			keyed.some(([, keys]) => keys.length === 0) &&
			keyed.every(
				([axis, keys]) => keys.length === 0 || anyOf(filters[axis], keys),
			)
		);
	}).length;
}

// 패널 칩: 채널 → 카테고리 → 타입, 그룹 안은 T6 이름순. 모르는 id(목록을 받기 전, 다른 탭에서 지움)는 뺀다
export function chipGroups(
	item: Pick<SavedLike, "channelIds" | "classificationIds">,
	channels: readonly Named[],
	classes: readonly (Named & { kind: "category" | "type" })[],
): { group: Group; items: Named[] }[] {
	const lists = groupLists(channels, classes);
	return GROUPS.map((group) => {
		const ids = group === "channel" ? item.channelIds : item.classificationIds;
		return {
			group,
			items: byName(lists[group].filter((entry) => ids.includes(entry.id))),
		};
	}).filter((group) => group.items.length > 0);
}

// 분류 붙이기의 '이미 있는 이름': 서버 중복 규칙(cleanText 정리 + 대소문자 무시, T6)과 같게 찾는다
export function sameName<T extends { name: string }>(
	items: readonly T[],
	name: string,
): T | undefined {
	const target = foldName(name);
	return items.find((entry) => foldName(entry.name) === target);
}

// 문구는 브리프(17행 B5)가 정본이다. 한 줄 상태는 마침표 없이, 문장 알림은 마침표로(T6 규칙)
export const LIBRARY_TEXT = {
	loading: "성우 보관함을 불러오고 있어요",
	empty: "아직 담은 성우가 없어요",
	emptyDetail: "성우 캐스팅에서 별을 누르면 여기에 담겨요",
	toCasting: "성우 캐스팅으로",
	listFailed: "성우 보관함을 불러오지 못했어요",
	classesFailed: "채널·분류 목록을 불러오지 못했어요",
	checking: "이용 가능 여부를 확인하고 있어요",
	unavailable: "현재 이용 불가",
	unavailableNotice:
		"음성 서비스 목록에서 찾을 수 없어요. 저장해 둔 정보로 보여요. 메모와 분류는 그대로 남아 있어요.",
	notChecked: "공개 성우 라이브러리의 성우는 이용 가능 여부를 확인하지 않아요",
	frequent: "자주 사용",
	saving: "저장하는 중이에요",
	memoSaved: "메모를 저장했어요",
	memoUnsaved: "저장하지 않은 변경이 있어요",
	removeDetail: "즐겨찾기·자주 사용·메모·분류 연결도 함께 지워져요",
	removing: "빼는 중이에요",
	removeFailed: "빼지 못했어요. 잠시 뒤 다시 해 주세요.",
	pickerPlaceholder: "이름으로 찾거나 새로 만들기",
	pickerFirst: "이름을 쓰면 바로 만들어 붙일 수 있어요",
	noMatchName: "일치하는 이름이 없어요",
	tagMissing: (count: number) => `태그 정보가 없는 성우 ${count}명은 빠졌어요`,
} as const;

export const voiceCountText = (count: number) =>
	count > 0 ? `성우 ${count}명` : null;

// 채널·분류 삭제 확인 창 설명 뒤에 붙인다. 앞 문장은 한 문장일 때 마침표가 없어서 덧붙이는 조각이 앞 마침표를 가지고 온다. 사용자 걱정은 "성우가 지워지나"다(계획 리뷰 D18)
export const linkedNote = (count: number, group: Group) =>
	count > 0
		? `. 연결된 성우 ${count}명은 보관함에 그대로 남고, 이 ${GROUP_TEXT[group].label} 연결만 풀려요.`
		: "";

// 이름 뒤 조사는 받침을 몰라 붙이지 않는다('성우'를 사이에 둔다)
export const removeQuestion = (name: string) =>
	`‘${name}’ 성우를 보관함에서 뺄까요?`;
export const removedMessage = (name: string) =>
	`‘${name}’ 성우를 보관함에서 뺐어요`;

// 칩 붙임·뗌 알림(화면 밖 role=status, 계획 리뷰 D5). 그룹 이름 뒤 조사는 GROUP_TEXT가 받침에 맞춘다
export const linkMessage = (name: string, group: Group, on: boolean) =>
	`‘${name}’ ${GROUP_TEXT[group].object} ${on ? "붙였어요" : "뗐어요"}.`;

// 상태 줄(캐스팅과 같은 모양, 계획 리뷰 D19). 조건이 걸리면 전체 수를 함께 보인다
export const countLine = (total: number, shown: number) =>
	shown === total
		? `담은 성우 ${total}명`
		: `담은 성우 ${total}명 중 ${shown}명`;
