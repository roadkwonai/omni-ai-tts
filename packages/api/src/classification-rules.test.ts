import { describe, expect, it } from "vitest";

import {
	channelInputSchema,
	channelUpdateInputSchema,
} from "./classification-contract";
import {
	cleanMemo,
	cleanText,
	cleanUrl,
	memoProblem,
	nameProblem,
	urlProblem,
} from "./classification-rules";

describe("cleanText", () => {
	it("NFC로 모으고 앞뒤 공백을 지우고 줄바꿈·탭·전각 공백을 공백 하나로 합친다(Review Focus 1)", () => {
		expect(cleanText("  경제\u3000\t한   입\n")).toBe("경제 한 입");
		expect(cleanText("경제".normalize("NFD"))).toBe("경제");
	});
	it("보이지 않는 글자는 지우거나 공백으로 보고, 이모지를 잇는 ZWJ는 둔다(Review Focus 1, 계획 리뷰 E10)", () => {
		expect(cleanText("경제\u200B")).toBe("경제");
		expect(cleanText("\u2060경\uFEFF제")).toBe("경제");
		expect(cleanText("경제\u3164한 입")).toBe("경제 한 입");
		expect(nameProblem("\u200B\u3164")).toBe("empty");
		expect(cleanText("👨\u200D👩")).toBe("👨\u200D👩");
		expect(cleanText("경\u0000제\u202E")).toBe("경제");
		expect(nameProblem("\u0000")).toBe("empty");
	});
});

describe("nameProblem", () => {
	it("빈 이름과 공백뿐인 이름은 empty다", () => {
		expect(nameProblem("")).toBe("empty");
		expect(nameProblem(" \u3000\n")).toBe("empty");
	});
	it("정리한 뒤 코드 포인트로 40자까지 받는다", () => {
		expect(nameProblem("가".repeat(40))).toBeNull();
		expect(nameProblem(`  ${"가".repeat(40)}  `)).toBeNull();
		expect(nameProblem("가".repeat(41))).toBe("too_long");
		expect(nameProblem("😀".repeat(40))).toBeNull();
		expect(nameProblem("😀".repeat(41))).toBe("too_long");
	});
});

describe("memoProblem", () => {
	it("빈 메모는 괜찮고 200자까지 받는다", () => {
		expect(memoProblem("")).toBeNull();
		expect(memoProblem("가".repeat(200))).toBeNull();
		expect(memoProblem("가".repeat(201))).toBe("too_long");
	});
});

describe("urlProblem", () => {
	it("http·https 절대 주소와 빈 값은 통과한다(대문자 스킴 포함, Review Focus 2)", () => {
		for (const url of [
			"https://youtube.com/@econ",
			"http://example.com",
			"HTTPS://Example.com/a",
			" https://youtube.com/@경제한입 ",
			"",
			"   ",
		])
			expect(urlProblem(url), url).toBeNull();
	});
	it("다른 스킴, 스킴 없는 주소, 상대 주소, 호스트 없는 주소는 bad_url이다(Review Focus 2)", () => {
		for (const url of [
			"javascript:alert(1)",
			"JavaScript:alert(1)",
			"data:text/html,x",
			"ftp://example.com",
			"example.com",
			"/path",
			"https://",
			"http://a.com/\u0000",
			"\u0001javascript:alert(1)",
		])
			expect(urlProblem(url), url).toBe("bad_url");
	});
	it("500자까지 받는다", () => {
		const base = "https://example.com/";
		expect(urlProblem(base + "a".repeat(500 - base.length))).toBeNull();
		expect(urlProblem(base + "a".repeat(501 - base.length))).toBe("too_long");
	});
});

describe("저장 값", () => {
	it("빈 메모·URL은 null이고 나머지는 정리한 값이다", () => {
		expect(cleanMemo("  ")).toBeNull();
		expect(cleanMemo("  토요일   아침\n두 번째 줄 ")).toBe(
			"토요일 아침 두 번째 줄",
		);
		expect(cleanUrl("  ")).toBeNull();
		expect(cleanUrl(" https://a.example/x ")).toBe("https://a.example/x");
	});
});

describe("계약", () => {
	it("채널 입력을 정리한 값으로 바꾼다", () => {
		expect(
			channelInputSchema.parse({
				name: " 경제  한 입 ",
				memo: "",
				url: " https://youtube.com/@econ ",
			}),
		).toEqual({
			name: "경제 한 입",
			memo: null,
			url: "https://youtube.com/@econ",
		});
	});
	it("uuid가 아닌 id는 거절한다(그 밖의 거절은 Task 3 서버 경계 테스트)", () => {
		expect(
			channelUpdateInputSchema.safeParse({
				id: "1",
				name: "a",
				memo: "",
				url: "",
			}).success,
		).toBe(false);
	});
});
