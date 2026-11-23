// packages/api/src/library-filter.ts
// 성우 보관함의 공통 태그·거르기·정렬(브리프 B4). 화면과 CLI가 같이 쓴다. zod·서버 모듈을 값으로 import하지 않는다(화면 번들).
import { cleanText } from "./classification-rules";
import type { ProviderId, Voice } from "./providers/contract";
import {
	ageKeyOf,
	anyOf,
	EL_DESCRIPTIVE,
	FISH_MOOD,
	genderKeyOf,
} from "./voice-filter";

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
export const TAG_LABEL = {
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

export type SavedLike = {
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

const HANGUL = /^\p{Script=Hangul}/u;
const collator = new Intl.Collator("ko");
// 공급사 수치 묶음: ElevenLabs(최근 1년 글자 수) → Fish Audio(사용 횟수) → 수치 없음. 단위가 달라 섞지 않는다
export const usageGroup = (usage: Voice["usage"]) =>
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
