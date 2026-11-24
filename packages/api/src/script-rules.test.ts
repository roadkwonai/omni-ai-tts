// packages/api/src/script-rules.test.ts
import { describe, expect, it } from "vitest";

import { scriptBody, scriptWorkProblem } from "./script-rules";

const work = (...texts: string[]) => ({
	paragraphs: texts.map((text, i) => ({ id: `p${i}`, text })),
});

describe("scriptWorkProblem(대본 상한, 계획 2.2)", () => {
	it("비지 않은 문단이 있으면 통과", () => {
		expect(scriptWorkProblem(work("안녕", ""))).toBeNull();
	});
	it("비지 않은 문단이 없으면 empty", () => {
		expect(scriptWorkProblem(work("", "  "))).toBe("empty");
	});
	it("201문단이면 too_many", () => {
		expect(
			scriptWorkProblem(work(...Array.from({ length: 201 }, () => "가"))),
		).toBe("too_many");
	});
	it("문단 글은 코드 포인트 10,000자까지(10,001자 too_long)", () => {
		expect(scriptWorkProblem(work("😀".repeat(10_000)))).toBeNull();
		expect(scriptWorkProblem(work("가".repeat(10_001)))).toBe("too_long");
	});
	it("검수 결정의 원문도 10,000자까지", () => {
		const long = "가".repeat(10_001);
		const fixed = {
			paragraphs: [{ text: "a", fixes: { text: long, decisions: [] } }],
		};
		expect(scriptWorkProblem(fixed)).toBe("too_long");
	});
	it("직렬화가 UTF-8 2 MB를 넘으면 too_large", () => {
		const big = work(...Array.from({ length: 100 }, () => "가".repeat(10_000)));
		expect(scriptWorkProblem(big)).toBe("too_large");
	});
	it("어느 칸이든 U+0000이 있으면 nul(설정·화자 이름 포함)", () => {
		expect(scriptWorkProblem(work("a\u0000b"))).toBe("nul");
		const named = {
			...work("a"),
			speakers: [{ name: "x\u0000", voice: null }],
		};
		expect(scriptWorkProblem(named)).toBe("nul");
	});
	it("글자 그대로의 '\\u0000'(백슬래시 문자열)은 NUL이 아니다", () => {
		expect(scriptWorkProblem(work("\\u0000"))).toBeNull();
		expect(scriptWorkProblem(work("\\\\u0000"))).toBeNull();
	});
	it("짝 없는 서로게이트(어느 칸이든)는 encoding, 짝 맞은 것·글자 그대로의 '\\ud800'은 통과", () => {
		expect(scriptWorkProblem(work("a\uD800b"))).toBe("encoding");
		expect(scriptWorkProblem(work("a\uDC00"))).toBe("encoding");
		const named = { ...work("a"), speakers: [{ name: "\uDBFF" }] };
		expect(scriptWorkProblem(named)).toBe("encoding");
		expect(scriptWorkProblem(work("😀😀"))).toBeNull();
		expect(scriptWorkProblem(work("\\ud800"))).toBeNull();
	});
});

describe("scriptBody(검색 원문과 수)", () => {
	it("비지 않은 문단 글을 빈 줄로 잇고 코드 포인트와 문단 수를 센다", () => {
		expect(scriptBody(work("하나", " ", "둘😀").paragraphs)).toEqual({
			body: "하나\n\n둘😀",
			paragraphCount: 2,
			charCount: 4,
		});
	});
	it("보이지 않는 글자뿐인 문단은 세지 않고 검색 원문에도 넣지 않는다", () => {
		const { paragraphs } = work("하나", "\u{200b}", " \u{2060}\u{feff}", "둘");
		expect(scriptBody(paragraphs)).toEqual({
			body: "하나\n\n둘",
			paragraphCount: 2,
			charCount: 3,
		});
	});
	it("검색 원문은 NFC이고 문단 글은 바꾸지 않는다(D6)", () => {
		const { paragraphs } = work("커피".normalize("NFD"));
		expect(scriptBody(paragraphs).body).toBe("커피".normalize("NFC"));
		expect(paragraphs[0]?.text).toBe("커피".normalize("NFD"));
	});
});
