import {
	filterSaved,
	foldName,
	LIBRARY_SORTS,
	type LibraryFilters,
	type LibraryView,
	type SavedLike,
	TAG_LABEL,
	type TagAxis,
	tagKeysOf,
	usageGroup,
} from "@tts-pilot-app/api/library-filter";
import type { Voice } from "@tts-pilot-app/api/providers/contract";

import {
	byName,
	GROUP_TEXT,
	GROUPS,
	type Group,
	groupLists,
	type Named,
} from "./classes-view";
import { PROVIDER_IDS } from "./connection-view";
import {
	AGE_KEY_LABEL,
	ageKeyOf,
	anyOf,
	GENDER_LABEL,
	genderKeyOf,
	type Option,
	ordered,
} from "./voice-filter";

// 공통 태그·거르기·정렬은 CLI와 함께 쓰는 공용 모듈에 있다(T21)
export {
	CONTENT_TAGS,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	foldName,
	LIBRARY_SORTS,
	type LibraryFilters,
	type LibrarySort,
	type LibraryView,
	MOOD_TAGS,
	sortSaved,
	type TagAxis,
	tagKeysOf,
} from "@tts-pilot-app/api/library-filter";

// 보관함의 같은 성우: 공급자 + 성우 id(REQ-04). 목록 행 키 voiceKey는 출처까지 넣으므로 따로 둔다
export const savedKey = (voice: Pick<Voice, "provider" | "voiceId">) =>
	`${voice.provider}:${voice.voiceId}`;

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
