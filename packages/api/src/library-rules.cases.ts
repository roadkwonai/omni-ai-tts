// 웹에서 옮긴 보관함 조건·무음 판정의 대조 입력(T21). 기대값 library-rules.fixtures.json은 옮기기 전 커밋 538df54의 웹 원본(apps/web/src/lib)으로 이 함수를 돌려 만들었다.
// 시험에서만 쓴다. 입력을 고치면 기대값을 그 커밋의 원본으로 다시 만든다(T20의 shared-rules는 f66ac3e 자료라 따로 둔다)
import { createHash } from "node:crypto";

import type * as library from "./library-filter";
import type { LibraryFilters, LibraryView } from "./library-filter";
import type { Voice } from "./providers/contract";
import type * as sound from "./sound-join";
import type * as filter from "./voice-filter";

export type LibraryRules = {
	filter: Pick<
		typeof filter,
		| "GENDER_LABEL"
		| "AGE_KEY_LABEL"
		| "TYPECAST_AGE_KEY"
		| "EL_AGE_KEY"
		| "FISH_GENDER_KEY"
		| "FISH_AGE_KEY"
		| "EL_DESCRIPTIVE"
		| "FISH_MOOD"
		| "keyLabels"
		| "labelOf"
		| "providerValue"
		| "genderKeyOf"
		| "ageKeyOf"
		| "anyOf"
	>;
	library: Pick<
		typeof library,
		| "CONTENT_TAGS"
		| "MOOD_TAGS"
		| "LIBRARY_SORTS"
		| "EMPTY_LIBRARY_FILTERS"
		| "tagKeysOf"
		| "foldName"
		| "filterSaved"
		| "sortSaved"
	>;
	sound: Pick<typeof sound, "isSilent" | "SILENCE">;
};

const NFD = "하늘".normalize("NFD");

type Item = {
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
	channelIds: string[];
	classificationIds: string[];
	lastUsedAt: string | null;
	useCount: number;
};
const item = (
	id: string,
	provider: Voice["provider"],
	name: string,
	voice: Partial<Item["voice"]> = {},
	over: Partial<Omit<Item, "voice">> = {},
): Item => ({
	id,
	voice: {
		provider,
		voiceId: `v-${id}`,
		name,
		englishName: null,
		gender: null,
		age: null,
		tags: [],
		useCases: [],
		descriptives: [],
		usage: null,
		...voice,
	},
	favorite: false,
	frequent: false,
	memo: null,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
	...over,
});
const DAY = (n: number) =>
	`2026-11-${String(n).padStart(2, "0")}T00:00:00.000Z`;

// 담은 순서(서버가 준 순서). 다섯 공급자, 아는 값·모르는 값·빈 값, 동률을 섞는다
const ITEMS: Item[] = [
	item(
		"t1",
		"typecast",
		"민지",
		{
			englishName: "Minji",
			gender: "female",
			age: "young_adult",
			useCases: ["Audiobook/Storytelling", "Game", "Documentary"],
		},
		{ favorite: true, channelIds: ["c1"], lastUsedAt: DAY(3), useCount: 4 },
	),
	item(
		"t2",
		"typecast",
		" 준호",
		{ gender: "male", age: "middle_age", useCases: ["News Reporter"] },
		{ frequent: true, classificationIds: ["k1"], useCount: 4 },
	),
	item(
		"t3",
		"typecast",
		"로봇",
		{ gender: "neutral", age: "elder", useCases: ["없는 값", "Rapper"] },
		{ memo: "광고 Voice", classificationIds: ["k2", "y1"] },
	),
	item("t4", "typecast", "아이", { age: "child" }, { lastUsedAt: DAY(3) }),
	item("t5", "typecast", "모름", { gender: "male", age: "ageless" }),
	item(
		"e1",
		"elevenlabs",
		"Rachel",
		{
			englishName: "Rachel K",
			gender: "female",
			age: "middle-aged",
			useCases: ["narrative_story", "conversational"],
			descriptives: ["calm", "upbeat"],
			usage: { kind: "chars_1y", count: 10 },
		},
		{ favorite: true, frequent: true, lastUsedAt: DAY(9), useCount: 1 },
	),
	item(
		"e2",
		"elevenlabs",
		"adam",
		{
			gender: "male",
			age: "middle_aged",
			useCases: ["advertisement", "social_media"],
			descriptives: ["deep", "casual"],
			usage: { kind: "chars_1y", count: 900 },
		},
		{ channelIds: ["c1", "c2"], classificationIds: ["k1", "y2"] },
	),
	item("e3", "elevenlabs", "Zoe", {
		gender: "female",
		age: "young",
		descriptives: ["모르는 분위기"],
	}),
	item(
		"f1",
		"fish_audio",
		"하늘",
		{
			tags: ["female", "young", "narration", "calm", "bright"],
			usage: { kind: "tasks", count: 5 },
		},
		{ lastUsedAt: DAY(1), useCount: 12, channelIds: ["c2"] },
	),
	item(
		"f2",
		"fish_audio",
		NFD,
		{
			tags: ["old", "male", "gaming", "deep", "advertisement"],
			// Fish Audio는 칸이 아니라 태그를 본다
			gender: "female",
			age: "young",
			useCases: ["Anime"],
			descriptives: ["cute"],
			usage: { kind: "tasks", count: 70 },
		},
		{ memo: "  굵은   목소리 ", favorite: true, classificationIds: ["y1"] },
	),
	item("f3", "fish_audio", "1번 성우", {
		tags: ["middle-aged", "cheerful", "professional"],
	}),
	item("a1", "airy", "에어리", {
		gender: "female",
		age: "young",
		tags: ["narration"],
		useCases: ["conversational"],
		descriptives: ["calm"],
	}),
	item(
		"g1",
		"gemini",
		"Kore",
		{
			gender: "female",
			useCases: ["Conversational / Edu", "Growth & Marketing"],
		},
		{ channelIds: ["c2"], lastUsedAt: DAY(9), useCount: 1 },
	),
	item("g2", "gemini", "가온", {
		gender: "male",
		useCases: ["Entertainment & Gaming"],
	}),
];
const PRESET_VOICES = new Set(["t2", "f2", "g1", "없는 id"]);

// 이름 → 조건. 하나씩, 같은 종류 안 여럿(OR), 종류끼리(AND), 검색, 없는 값
const FILTERS: Record<string, Partial<LibraryFilters>> = {
	none: {},
	viewFavorite: { view: "favorite" },
	viewFrequent: { view: "frequent" },
	viewPreset: { view: "preset" },
	provider: { provider: "fish_audio" },
	channel: { channel: ["c1"] },
	channelOr: { channel: ["c1", "c2"] },
	category: { category: ["k1", "k2"] },
	type: { type: ["y1"] },
	categoryAndType: { category: ["k1", "k2"], type: ["y1", "y2"] },
	genderFemale: { gender: "female" },
	genderNeutral: { gender: "neutral" },
	genderUnknown: { gender: "x" },
	ageChild: { age: "child" },
	ageYoung: { age: "young" },
	ageMiddle: { age: "middle" },
	ageOld: { age: "old" },
	people: { gender: "male", age: "middle" },
	contentNarration: { content: ["narration"] },
	contentOr: { content: ["ads", "news"] },
	contentUnknown: { content: ["x"] },
	moodCalm: { mood: ["calm"] },
	moodBright: { mood: ["upbeat", "deep"] },
	tagsAnd: { content: ["narration", "ads"], mood: ["calm", "deep"] },
	q: { q: "minji" },
	qCase: { q: " RACHEL " },
	qMemo: { q: "굵은 목소리" },
	qMemoCase: { q: "광고 voice" },
	qNfd: { q: NFD },
	qBlank: { q: " \t " },
	qNone: { q: "없는 이름" },
	mixed: {
		q: "a",
		provider: "elevenlabs",
		channel: ["c1"],
		gender: "male",
		content: ["social"],
		mood: ["deep"],
	},
	sortIgnored: { sort: "name", view: "favorite" },
};

const hash = (value: unknown) =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ids = (items: readonly Item[]) => items.map((i) => i.id).join(" ");

export function runLibraryRules({
	filter: f,
	library: l,
	sound: s,
}: LibraryRules) {
	const samples = (...values: number[]) => s.isSilent(new Float32Array(values));
	return {
		// 이름표·표는 순서까지 같아야 한다(선택지 순서)
		genderLabel: [...f.GENDER_LABEL].join(" "),
		ageKeyLabel: [...f.AGE_KEY_LABEL].join(" "),
		providerKeys: [
			f.TYPECAST_AGE_KEY,
			f.EL_AGE_KEY,
			f.FISH_GENDER_KEY,
			f.FISH_AGE_KEY,
		].map((keys) => [...keys].join(" ")),
		elDescriptive: [f.EL_DESCRIPTIVE.size, hash([...f.EL_DESCRIPTIVE])],
		fishMood: [f.FISH_MOOD.size, hash([...f.FISH_MOOD])],
		contentTags: [l.CONTENT_TAGS.length, hash(l.CONTENT_TAGS)],
		moodTags: l.MOOD_TAGS.map(
			(row) =>
				`${row.key} ${row.label} | ${row.elevenlabs} | ${row.fish_audio} | ${row.typecast.length + row.gemini.length}`,
		),
		librarySorts: l.LIBRARY_SORTS.map((row) => `${row.value} ${row.label}`),
		emptyFilters: JSON.stringify(l.EMPTY_LIBRARY_FILTERS),
		keyLabels: [
			f.keyLabels(f.EL_AGE_KEY, f.AGE_KEY_LABEL),
			f.keyLabels(new Map([["a", "모르는 키"]]), f.GENDER_LABEL),
		].map((labels) => [...labels].join(" ")),
		labelOf: [
			f.labelOf(f.GENDER_LABEL, "male"),
			f.labelOf(f.GENDER_LABEL, "x"),
		],
		providerValue: [
			f.providerValue(f.EL_AGE_KEY, "middle"),
			f.providerValue(f.TYPECAST_AGE_KEY, "old"),
			f.providerValue(f.FISH_GENDER_KEY, "neutral"),
			f.providerValue(f.FISH_AGE_KEY, null),
		],
		anyOf: [
			f.anyOf([], []),
			f.anyOf(["a"], []),
			f.anyOf(["a"], [null]),
			f.anyOf(["a", "b"], [null, "b"]),
			f.anyOf(["a"], ["b"]),
		],
		keysOf: ITEMS.map(({ id, voice }) =>
			[
				id,
				f.genderKeyOf(voice),
				f.ageKeyOf(voice),
				l.tagKeysOf(voice, "content"),
				l.tagKeysOf(voice, "mood"),
			].join(" / "),
		),
		foldName: [" News ", "경제　한  입", NFD, "ÀB​C", ""].map(l.foldName),
		filterSaved: Object.fromEntries(
			Object.entries(FILTERS).map(([name, patch]) => [
				name,
				ids(
					l.filterSaved(
						ITEMS,
						{ ...l.EMPTY_LIBRARY_FILTERS, ...patch },
						PRESET_VOICES,
					),
				),
			]),
		),
		// 프리셋 집합을 주지 않으면 '프리셋' 보기는 아무도 없다
		filterSavedNoPresets: ids(
			l.filterSaved(ITEMS, {
				...l.EMPTY_LIBRARY_FILTERS,
				view: "preset" satisfies LibraryView,
			}),
		),
		sortSaved: Object.fromEntries(
			l.LIBRARY_SORTS.map(({ value }) => [
				value,
				ids(l.sortSaved(ITEMS, value)),
			]),
		),
		// 거꾸로 담아도 동률은 담은 순서다
		sortSavedReversed: Object.fromEntries(
			l.LIBRARY_SORTS.map(({ value }) => [
				value,
				ids(l.sortSaved([...ITEMS].reverse(), value)),
			]),
		),
		// 정렬은 받은 목록을 바꾸지 않는다
		sortSavedPure: (() => {
			const given = [...ITEMS];
			l.sortSaved(given, "name");
			return ids(given) === ids(ITEMS);
		})(),
		isSilent: [
			samples(),
			samples(0, 0),
			samples(0, s.SILENCE),
			samples(0, -s.SILENCE),
			samples(0, s.SILENCE * 0.999),
			samples(-s.SILENCE * 0.999),
			samples(0, 0.5, 0),
			samples(Number.NaN),
		],
	};
}
