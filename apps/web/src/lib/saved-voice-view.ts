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
import { anyOf } from "./voice-filter";

// 보관함의 같은 성우: 공급자 + 성우 id(REQ-04). 목록 행 키 voiceKey는 출처까지 넣으므로 따로 둔다
export const savedKey = (voice: Pick<Voice, "provider" | "voiceId">) =>
	`${voice.provider}:${voice.voiceId}`;

export type LibraryView = "all" | "favorite" | "frequent" | "preset";
export type LibraryFilters = {
	q: string;
	view: LibraryView;
	provider: ProviderId | null;
	channel: string[];
	category: string[];
	type: string[];
};
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
	q: "",
	view: "all",
	provider: null,
	channel: [],
	category: [],
	type: [],
};

const VIEWS: readonly LibraryView[] = ["all", "favorite", "frequent", "preset"];

// 필터는 주소 쿼리가 정본이다('성우 N명' 링크가 이 주소로 온다, 스펙 2절). 모르는 값은 기본값이다
export function filtersFromQuery(params: URLSearchParams): LibraryFilters {
	const view = params.get("view");
	const provider = params.get("provider");
	const ids = (key: string) => [...new Set(params.getAll(key).filter(Boolean))];
	return {
		q: params.get("q") ?? "",
		view: VIEWS.find((v) => v === view) ?? "all",
		provider: PROVIDER_IDS.find((p) => p === provider) ?? null,
		channel: ids("channel"),
		category: ids("category"),
		type: ids("type"),
	};
}

export function queryFromFilters(filters: LibraryFilters): string {
	const params = new URLSearchParams();
	if (foldName(filters.q)) params.set("q", filters.q);
	if (filters.view !== "all") params.set("view", filters.view);
	if (filters.provider) params.set("provider", filters.provider);
	for (const key of GROUPS)
		for (const id of filters[key]) params.append(key, id);
	return params.toString();
}

export const hasLibraryFilters = (filters: LibraryFilters) =>
	queryFromFilters(filters) !== "";

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
	voice: Pick<Voice, "provider" | "voiceId" | "name" | "englishName">;
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
			(q === "" ||
				[item.voice.name, item.voice.englishName, item.memo].some(
					(text) => text !== null && foldName(text).includes(q),
				)),
	);
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
