import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atPageEnd, chipPress, landingRedirect, splitTagline } from "./landing";
import * as content from "./landing-content";
import {
	BENEFITS,
	BUILD_POINTS,
	clockText,
	HERO_LISTEN_NOTE,
	HERO_NUMBER_COUNT,
	HERO_ORIGINAL,
	HERO_SAMPLES,
	HERO_SPOKEN,
	type HeroPart,
	NAV_ITEMS,
	PROVIDERS,
	STEPS,
	sampleName,
	sampleNote,
	TAGLINE_LINES,
	TEST_COUNT_TEXT,
	TOUR_TABS,
} from "./landing-content";
import { FAQ_ITEMS, faqJsonLd, jsonLdText } from "./landing-faq";

const PUBLIC = join(__dirname, "../../public");

describe("landingRedirect", () => {
	it("본인용: 소유자는 작업실로, 아니면 로그인으로 보낸다(소개 페이지 없음)", () => {
		expect(landingRedirect("owner", "owner")).toBe("/studio");
		expect(landingRedirect("none", "owner")).toBe("/login");
		expect(landingRedirect("denied", "owner")).toBe("/login");
	});
	it("공개 데모: 예시 소유자여도 소개 페이지를 그린다", () => {
		expect(landingRedirect("owner", "demo")).toBeNull();
		expect(landingRedirect("none", "demo")).toBeNull();
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
			...TOUR_TABS.flatMap((tab) => [tab.light, tab.mobile]),
			...TOUR_TABS.flatMap((tab) => [tab.dark, tab.mobileDark]),
			...HERO_SAMPLES.map((sample) => sample.src),
		].filter((src): src is string => Boolean(src));
		for (const src of files) {
			expect(existsSync(join(PUBLIC, src)), src).toBe(true);
		}
	});
	it("투어 다크 판은 `<이름>-dark.png` 경로로 연결한다(파일은 따로 넣는다)", () => {
		const dark = TOUR_TABS.filter((tab) => tab.dark);
		expect(dark.map((tab) => tab.value)).toEqual([
			"studio",
			"casting",
			"drama",
			"scripts",
			"voices",
			"presets",
		]);
		for (const tab of dark)
			expect(tab.dark).toBe(tab.light.replace(".png", "-dark.png"));
	});
	it("히어로 카드: 원문·발음용 숫자 강조 셋, 샘플 다섯(Airy만 다른 문장)", () => {
		const text = (parts: readonly HeroPart[]) =>
			parts.map((p) => p.text).join("");
		expect(text(HERO_ORIGINAL)).toBe(
			"2026년 3분기 반도체 수출액은 1,523억 달러로 집계됐습니다.",
		);
		expect(text(HERO_SPOKEN)).toBe(
			"이천이십육 년 삼 분기 반도체 수출액은 천오백이십삼억 달러로 집계됐습니다.",
		);
		expect(HERO_NUMBER_COUNT).toBe(3);
		expect(HERO_SPOKEN.filter((p) => p.num)).toHaveLength(3);
		expect(HERO_SAMPLES.map((s) => s.provider)).toEqual([...PROVIDERS]);
		expect(HERO_SAMPLES.filter((s) => s.other).map((s) => s.id)).toEqual([
			"airy",
		]);
	});
	it("재생 시간은 m:ss, 모르면 0:00", () => {
		expect(clockText(0)).toBe("0:00");
		expect(clockText(Number.NaN)).toBe("0:00");
		expect(clockText(7.9)).toBe("0:07");
		expect(clockText(65)).toBe("1:05");
	});
	it("공개 데모 FAQ는 로그인 없는 데모와 공급자를 부르지 않는 비용을 말한다", () => {
		const own = FAQ_ITEMS.find((i) => i.question === "직접 써 볼 수 있나요?");
		const cost = FAQ_ITEMS.find((i) => i.question === "비용은 어떻게 되나요?");
		expect(own?.answer).toContain("로그인 없이");
		expect(own?.answer).toContain("한국에서만");
		expect(cost?.answer).toContain("공급자를 부르지 않아");
		expect(
			BUILD_POINTS.some((p) => p.text.includes("공급자 키가 없는 별도 배포")),
		).toBe(true);
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
	it("안 쓰는 히어로 크롭과 data-step 2·3 규칙은 지웠다", () => {
		for (const name of ["studio-hero.png", "studio-hero-dark.png"])
			expect(existsSync(join(PUBLIC, "screenshots", name)), name).toBe(false);
		const css = readFileSync(
			join(__dirname, "../components/landing/landing.css"),
			"utf8",
		);
		expect(css).not.toContain('data-step="2"');
		expect(css).not.toContain('data-step="3"');
	});
	it("투어 휴대폰 판: 여섯 탭 모두 `<이름>-mobile(-dark).png`가 public에 있다", () => {
		for (const tab of TOUR_TABS) {
			expect(tab.mobile).toBe(`/screenshots/${tab.value}-mobile.png`);
			expect(tab.mobileDark).toBe(`/screenshots/${tab.value}-mobile-dark.png`);
			expect(existsSync(join(PUBLIC, tab.mobileDark)), tab.mobileDark).toBe(
				true,
			);
		}
	});
	it("칩 누름: 고른 칩은 재생·멈춤, 다른 칩은 고르고 재생한다", () => {
		expect(chipPress(2, 2)).toBe("toggle");
		expect(chipPress(0, 3)).toBe("play");
	});
	it("샘플 이름: Airy는 성우 이름이 없어 'Airy 샘플', 다른 문장 한 줄은 Airy만", () => {
		const names = HERO_SAMPLES.map(sampleName);
		expect(names[0]).toBe("Typecast 포세이돈");
		expect(names[3]).toBe("Airy 샘플");
		expect(HERO_SAMPLES.map(sampleNote)).toEqual([
			null,
			null,
			null,
			"Airy는 다른 문장을 읽은 샘플이에요",
			null,
		]);
		expect(HERO_LISTEN_NOTE).toBe("듣기는 발음용 대본으로 만든 소리예요");
	});
	it("FAQ 첫 항목은 공개 데모와 본인용 비공개 서비스를 구분하고 JSON-LD와 같은 글이다", () => {
		const first = FAQ_ITEMS[0];
		expect(first?.question).toBe("공개 서비스인가요?");
		expect(first?.answer).toBe(
			"공개 데모는 누구나 로그인 없이 써 볼 수 있습니다. 소유자 본인용 작업실은 별도 주소의 비공개 서비스입니다.",
		);
		expect(faqJsonLd(FAQ_ITEMS).mainEntity[0]?.acceptedAnswer.text).toBe(
			first?.answer,
		);
		expect(BUILD_POINTS[0]?.text).toContain("공개 데모");
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
