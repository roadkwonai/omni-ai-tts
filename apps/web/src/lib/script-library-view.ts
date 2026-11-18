import { SCRIPT_LINKS_MAX } from "@tts-pilot-app/api/script-rules";

import { clipTitle, firstSentenceTitle } from "./script-work";

// /scripts의 조건↔주소 변환과 줄 글자(브리프 scripts.md 5절). 순수 함수만 둔다.

export type ScriptView = "saved" | "recent";
export type ScriptFilters = {
	q: string;
	// null이면 모든 채널, "none"이면 채널 없음, 아니면 채널 id
	channel: string | null;
	category: string[];
	type: string[];
};
export const EMPTY_SCRIPT_FILTERS: ScriptFilters = {
	q: "",
	channel: null,
	category: [],
	type: [],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 서버 입력 상한(q 100자, 분류 연결 50개)을 넘는 주소는 잘라 읽어 400이 나지 않게 한다
const Q_MAX = 100;
const ids = (params: URLSearchParams, key: string) =>
	[...new Set(params.getAll(key).filter((value) => UUID.test(value)))].slice(
		0,
		SCRIPT_LINKS_MAX,
	);

// 주소가 정본이다. 모르는 값은 기본값(uuid가 아닌 id는 서버가 400으로 거절하므로 미리 버린다)
export function scriptFiltersFromQuery(
	params: URLSearchParams,
): ScriptFilters & { view: ScriptView } {
	const channel = params.get("channel");
	return {
		view: params.get("view") === "recent" ? "recent" : "saved",
		q: (params.get("q") ?? "").slice(0, Q_MAX),
		channel:
			channel === "none" || (channel && UUID.test(channel)) ? channel : null,
		category: ids(params, "category"),
		type: ids(params, "type"),
	};
}

// 최근 만든 대본에는 조건이 없다(주소에 view만)
export function queryFromScriptFilters(
	filters: ScriptFilters & { view?: ScriptView },
): string {
	const params = new URLSearchParams();
	if (filters.view === "recent") {
		params.set("view", "recent");
		return params.toString();
	}
	if (filters.q.trim()) params.set("q", filters.q);
	if (filters.channel) params.set("channel", filters.channel);
	for (const id of filters.category) params.append("category", id);
	for (const id of filters.type) params.append("type", id);
	return params.toString();
}

export const hasScriptFilters = (filters: ScriptFilters) =>
	queryFromScriptFilters(filters) !== "";

// scriptList 입력(cursor 제외). 최근은 거르기를 보내지 않는다
export function listInputOf(kind: ScriptView, filters: ScriptFilters) {
	if (kind === "recent") return { kind } as const;
	const q = filters.q.trim().slice(0, Q_MAX);
	const category = filters.category.slice(0, SCRIPT_LINKS_MAX);
	const type = filters.type.slice(0, SCRIPT_LINKS_MAX);
	return {
		kind,
		...(q ? { q } : {}),
		...(filters.channel ? { channel: filters.channel } : {}),
		...(category.length ? { category } : {}),
		...(type.length ? { type } : {}),
	} as const;
}

// 바꾼 때: 오늘은 "오후 3:05", 올해는 "11월 18일", 그 전은 "2025. 3. 4."
export function whenLabel(iso: string, now = new Date()): string {
	const at = new Date(iso);
	if (at.toDateString() === now.toDateString())
		return at.toLocaleTimeString("ko-KR", {
			hour: "numeric",
			minute: "2-digit",
		});
	return at.getFullYear() === now.getFullYear()
		? at.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
		: at.toLocaleDateString("ko-KR", {
				year: "numeric",
				month: "numeric",
				day: "numeric",
			});
}

// 순서와 상관없이 같은 id 모음인가(창을 닫기 전에 분류가 바뀌었는지 본다)
export const sameIds = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((id) => b.includes(id));

// 최근 대본 줄의 제목 자리: 첫 문장 앞 60자
export const recentTitle = (preview: string) =>
	clipTitle(firstSentenceTitle([{ text: preview }]), 60);
