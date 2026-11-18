import { describe, expect, it } from "vitest";

import {
	EMPTY_SCRIPT_FILTERS,
	hasScriptFilters,
	listInputOf,
	queryFromScriptFilters,
	recentTitle,
	sameIds,
	scriptFiltersFromQuery,
	whenLabel,
} from "./script-library-view";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("scriptFiltersFromQuery / queryFromScriptFilters", () => {
	it("빈 주소는 저장한 대본·조건 없음", () => {
		expect(scriptFiltersFromQuery(new URLSearchParams(""))).toEqual({
			view: "saved",
			...EMPTY_SCRIPT_FILTERS,
		});
	});

	it("주소를 조건으로 읽고 다시 같은 주소로 쓴다", () => {
		const query = `q=%EC%95%88%EB%85%95&channel=${A}&category=${A}&category=${B}&type=${B}`;
		const read = scriptFiltersFromQuery(new URLSearchParams(query));
		expect(read).toEqual({
			view: "saved",
			q: "안녕",
			channel: A,
			category: [A, B],
			type: [B],
		});
		expect(
			new URLSearchParams(queryFromScriptFilters(read)).getAll("category"),
		).toEqual([A, B]);
	});

	it("channel=none은 '채널 없음'이고 uuid가 아닌 값은 버린다", () => {
		expect(
			scriptFiltersFromQuery(new URLSearchParams("channel=none")).channel,
		).toBe("none");
		expect(
			scriptFiltersFromQuery(
				new URLSearchParams(`channel=x&category=y&type=${A}`),
			),
		).toMatchObject({ channel: null, category: [], type: [A] });
	});

	it("view=recent만 최근이고 최근 주소에는 조건을 쓰지 않는다", () => {
		const read = scriptFiltersFromQuery(new URLSearchParams("view=recent&q=a"));
		expect(read.view).toBe("recent");
		expect(
			queryFromScriptFilters({
				...EMPTY_SCRIPT_FILTERS,
				view: "recent",
				q: "a",
			}),
		).toBe("view=recent");
	});

	it("공백뿐인 검색어는 주소에 쓰지 않는다", () => {
		expect(queryFromScriptFilters({ ...EMPTY_SCRIPT_FILTERS, q: "  " })).toBe(
			"",
		);
	});
});

describe("주소 상한(C4)", () => {
	it("q는 100자, category·type은 50개까지만 읽는다", () => {
		const many = Array.from(
			{ length: 60 },
			(_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
		);
		const params = new URLSearchParams([
			["q", "가".repeat(150)],
			...many.map((id) => ["category", id] as [string, string]),
			...many.map((id) => ["type", id] as [string, string]),
		]);
		const read = scriptFiltersFromQuery(params);
		expect(read.q).toHaveLength(100);
		expect(read.category).toHaveLength(50);
		expect(read.type).toHaveLength(50);
	});
	it("listInputOf도 같은 상한이다", () => {
		const input = listInputOf("saved", {
			...EMPTY_SCRIPT_FILTERS,
			q: ` ${"나".repeat(150)}`,
		});
		expect("q" in input && input.q).toHaveLength(100);
	});
});

describe("hasScriptFilters", () => {
	it("조건이 하나라도 있으면 참", () => {
		expect(hasScriptFilters(EMPTY_SCRIPT_FILTERS)).toBe(false);
		expect(hasScriptFilters({ ...EMPTY_SCRIPT_FILTERS, channel: "none" })).toBe(
			true,
		);
		expect(hasScriptFilters({ ...EMPTY_SCRIPT_FILTERS, type: [A] })).toBe(true);
	});
});

describe("listInputOf", () => {
	it("저장한 대본은 조건을 보내고 빈 값은 뺀다", () => {
		expect(
			listInputOf("saved", { ...EMPTY_SCRIPT_FILTERS, q: " 안녕 " }),
		).toEqual({
			kind: "saved",
			q: "안녕",
		});
		expect(
			listInputOf("saved", {
				q: "",
				channel: "none",
				category: [A],
				type: [],
			}),
		).toEqual({ kind: "saved", channel: "none", category: [A] });
	});

	it("최근은 조건을 보내지 않는다", () => {
		expect(listInputOf("recent", { ...EMPTY_SCRIPT_FILTERS, q: "a" })).toEqual({
			kind: "recent",
		});
	});
});

describe("whenLabel", () => {
	const now = new Date(2026, 10, 18, 18, 0);
	it("오늘은 시각", () => {
		expect(whenLabel(new Date(2026, 10, 18, 15, 5).toISOString(), now)).toBe(
			"오후 3:05",
		);
	});
	it("올해는 월일", () => {
		expect(whenLabel(new Date(2026, 2, 4, 9, 0).toISOString(), now)).toBe(
			"3월 4일",
		);
	});
	it("그 전 해는 연월일", () => {
		expect(whenLabel(new Date(2025, 2, 4, 9, 0).toISOString(), now)).toBe(
			"2025. 3. 4.",
		);
	});
});

describe("sameIds", () => {
	it("순서와 상관없이 같은 값이면 같다", () => {
		expect(sameIds([A, B], [B, A])).toBe(true);
		expect(sameIds([], [])).toBe(true);
	});
	it("하나라도 다르면 다르다", () => {
		expect(sameIds([A], [A, B])).toBe(false);
		expect(sameIds([A], [B])).toBe(false);
	});
});

describe("recentTitle", () => {
	it("첫 문장을 제목 자리에 쓰고 60자를 넘으면 말줄임", () => {
		expect(recentTitle("안녕하세요. 둘째 문장입니다.")).toBe("안녕하세요.");
		expect(recentTitle("가".repeat(80))).toBe(`${"가".repeat(60)}…`);
	});
	it("빈 미리 보기는 빈 글자", () => {
		expect(recentTitle("")).toBe("");
	});
});
