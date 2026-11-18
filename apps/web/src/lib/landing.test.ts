import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atPageEnd, landingRedirect, splitTagline } from "./landing";
import * as content from "./landing-content";
import {
	BENEFITS,
	BUILD_POINTS,
	NAV_ITEMS,
	STEPS,
	TAGLINE_LINES,
	TEST_COUNT_TEXT,
	TOUR_TABS,
} from "./landing-content";
import { FAQ_ITEMS, faqJsonLd, jsonLdText } from "./landing-faq";

const PUBLIC = join(__dirname, "../../public");

describe("landingRedirect", () => {
	it("소유자는 작업실로 보낸다", () => {
		expect(landingRedirect("owner")).toBe("/studio");
	});
	it("로그인하지 않았거나 소유자가 아니면 랜딩을 그린다", () => {
		expect(landingRedirect("none")).toBeNull();
		expect(landingRedirect("denied")).toBeNull();
	});
});

describe("splitTagline", () => {
	it("줄은 그대로 두고 줄 안을 어절로 나눈다", () => {
		expect(splitTagline(["다섯 곳의 목소리를", "한 대본에 담는다."])).toEqual([
			["다섯", "곳의", "목소리를"],
			["한", "대본에", "담는다."],
		]);
	});
	it("빈 줄과 겹친 공백은 버린다", () => {
		expect(splitTagline(["  가   나 ", ""])).toEqual([["가", "나"]]);
	});
	it("태그라인은 두 줄 이상이다", () => {
		expect(splitTagline(TAGLINE_LINES).length).toBeGreaterThanOrEqual(2);
	});
});

describe("atPageEnd(태그라인이 끝까지 켜지는 기준)", () => {
	it("맨 아래에 닿으면 참이고, 반올림 오차 2px까지 봐준다", () => {
		expect(atPageEnd(1000, 900, 1900)).toBe(true);
		expect(atPageEnd(998.5, 900, 1900)).toBe(true);
	});
	it("아직 남았으면 거짓이다", () => {
		expect(atPageEnd(0, 900, 1900)).toBe(false);
		expect(atPageEnd(990, 900, 1900)).toBe(false);
	});
});

describe("문제/해결 섹션 제거(브리프 2번 뺌)", () => {
	it("PROBLEM 상수와 problem.tsx가 없다", () => {
		expect("PROBLEM" in content).toBe(false);
		expect(
			existsSync(join(__dirname, "../components/landing/problem.tsx")),
		).toBe(false);
		expect(
			readFileSync(join(__dirname, "../app/page.tsx"), "utf8"),
		).not.toMatch(/Problem/);
	});
	it("대비 한 문장은 혜택 머리로 옮겨 있다", () => {
		expect(content.BENEFITS_LEAD.length).toBeGreaterThan(10);
	});
});

describe("FAQ JSON-LD", () => {
	const data = faqJsonLd(FAQ_ITEMS);
	it("FAQPage 구조로 질문마다 답을 담는다", () => {
		expect(data["@context"]).toBe("https://schema.org");
		expect(data["@type"]).toBe("FAQPage");
		expect(data.mainEntity).toHaveLength(FAQ_ITEMS.length);
		const [first] = data.mainEntity;
		expect(first).toEqual({
			"@type": "Question",
			name: FAQ_ITEMS[0]?.question,
			acceptedAnswer: { "@type": "Answer", text: FAQ_ITEMS[0]?.answer },
		});
	});
	it("질문은 6~8개이고 답은 글자만이다", () => {
		expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(6);
		expect(FAQ_ITEMS.length).toBeLessThanOrEqual(8);
		for (const item of FAQ_ITEMS) {
			expect(item.answer).not.toMatch(/[<>]/);
			expect(item.answer.length).toBeGreaterThan(10);
		}
	});
	it("script 안에서 태그를 닫는 글자를 이스케이프한다", () => {
		const text = jsonLdText({ a: "</script><b>" });
		expect(text).not.toContain("<");
		expect(JSON.parse(text)).toEqual({ a: "</script><b>" });
	});
});

describe("랜딩 내용(브리프 4·6·9절)", () => {
	it("혜택 5개, 작동 방식 3단계, 투어 탭 6개", () => {
		expect(BENEFITS).toHaveLength(5);
		expect(STEPS).toHaveLength(3);
		expect(TOUR_TABS).toHaveLength(6);
	});
	it("쓰는 이미지가 모두 public에 있다", () => {
		const files = [
			...STEPS.map((step) => step.image),
			...TOUR_TABS.flatMap((tab) => [tab.light, tab.dark, tab.mobile]),
		].filter((src): src is string => Boolean(src));
		for (const src of files) {
			expect(existsSync(join(PUBLIC, src)), src).toBe(true);
		}
	});
	it("이미지마다 대체 글이 있다", () => {
		for (const step of STEPS) expect(step.alt.length).toBeGreaterThan(5);
		for (const tab of TOUR_TABS) expect(tab.alt.length).toBeGreaterThan(5);
	});
	it("투어 탭 값은 겹치지 않는다", () => {
		const values = TOUR_TABS.map((tab) => tab.value);
		expect(new Set(values).size).toBe(values.length);
	});
	it("막대 링크 이름은 히어로 버튼과 겹치지 않는다", () => {
		expect(NAV_ITEMS[0]?.label).toBe("할 수 있는 일");
	});
	it("히어로 자른 이미지가 920×445로 public에 있다", () => {
		for (const name of ["studio-hero.png", "studio-hero-dark.png"]) {
			const png = readFileSync(join(PUBLIC, "screenshots", name));
			expect(png.readUInt32BE(16), name).toBe(920);
			expect(png.readUInt32BE(20), name).toBe(445);
		}
	});
	it("막대 링크는 같은 페이지 앵커뿐이다(만들지 않는 페이지로 가지 않는다)", () => {
		for (const item of NAV_ITEMS) expect(item.href).toMatch(/^#[a-z-]+$/);
	});
	it("증거 한 줄의 테스트 수는 어림수로 적는다", () => {
		expect(TEST_COUNT_TEXT).toBe("자동 테스트 1,900여 개");
		expect(BUILD_POINTS.length).toBeGreaterThanOrEqual(3);
	});
	it("금지어와 꾸민 수치가 없다(브리프 4절)", () => {
		const all = JSON.stringify([
			BENEFITS,
			STEPS,
			TOUR_TABS,
			BUILD_POINTS,
			FAQ_ITEMS,
		]);
		for (const word of ["혁신", "강력한", "손쉽게", "획기적", "최고의"]) {
			expect(all, word).not.toContain(word);
		}
	});
});
