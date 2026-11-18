import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려준다(공급자·서버를 부르지 않는다)
vi.mock("@/lib/landing-content", () => import("../../lib/landing-content"));
vi.mock("@/lib/landing-faq", () => import("../../lib/landing-faq"));
vi.mock("@/lib/landing", () => import("../../lib/landing"));

import { TOUR_TABS } from "../../lib/landing-content";
import { FAQ_ITEMS } from "../../lib/landing-faq";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { LandingBar } from "./landing-bar";
import { LandingFooter } from "./landing-footer";
import { Tagline } from "./tagline";
import { Tour } from "./tour";

function count(html: string, pattern: RegExp) {
	return html.match(pattern)?.length ?? 0;
}

test("투어는 ARIA tabs로 탭 6개 중 첫 탭만 선택하고 이름을 가진다", () => {
	const html = renderToStaticMarkup(createElement(Tour));
	expect(html).toContain('role="tablist"');
	expect(html).toContain('aria-label="기능 화면"');
	expect(count(html, /role="tab"/g)).toBe(TOUR_TABS.length);
	// 고른 탭의 패널만 그린다(나머지 화면 이미지는 탭을 열 때 받는다)
	expect(count(html, /role="tabpanel"/g)).toBe(1);
	expect(count(html, /aria-selected="true"/g)).toBe(1);
	for (const tab of TOUR_TABS) expect(html).toContain(tab.label);
});

test("투어 첫 탭 이름은 앱 이름 '음성 작업실'이고 '문단 작업실'은 어디에도 없다", () => {
	const html = renderToStaticMarkup(createElement(Tour));
	expect(TOUR_TABS[0]?.label).toBe("음성 작업실");
	expect(html).toContain("음성 작업실");
	expect(html).not.toContain("문단 작업실");
});

test("첫 탭(음성 작업실)은 라이트·다크·휴대폰 판을 실제 화면 파일로 쓰고 모두 대체 글이 있다", () => {
	const html = renderToStaticMarkup(createElement(Tour));
	expect(html).toContain("studio-dark.png");
	expect(count(html, /dark:block/g)).toBe(1);
	expect(html).toContain("studio-mobile.png");
	expect(count(html, /<img /g)).toBe(3);
	expect(html).not.toMatch(/<img [^>]*alt=""/);
});

test("FAQ는 질문마다 aria-expanded=false 단추이고 처음엔 모두 닫혀 있다", () => {
	const html = renderToStaticMarkup(createElement(Faq));
	expect(count(html, /aria-expanded="false"/g)).toBe(FAQ_ITEMS.length);
	expect(html).not.toContain('aria-expanded="true"');
	for (const item of FAQ_ITEMS) expect(html).toContain(item.question);
});

test("막대는 같은 페이지 앵커와 /login만 걸고, 메뉴 단추는 이름이 있다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).toContain('aria-label="메뉴"');
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	for (const href of hrefs) {
		expect(href, String(href)).toMatch(/^(#[a-z-]+|\/login)$/);
	}
	expect(hrefs).toContain("/login");
});

test("메뉴 단추는 열림 상태(aria-expanded)를 알리고 처음엔 닫혀 있다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).toMatch(
		/aria-label="메뉴"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="메뉴"/,
	);
});

test("막대 로고와 이름은 번역하지 않는다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(count(html, /<img [^>]*translate="no"/g)).toBeGreaterThanOrEqual(2);
});

test("마지막 행동은 '맨 위로'(#top)와 '소유자 로그인'(/login)이고 투어로 되돌리지 않는다", () => {
	const html = renderToStaticMarkup(createElement(FinalCta));
	expect(html).toMatch(/<a [^>]*href="#top"[^>]*>맨 위로</);
	expect(html).toMatch(/<a [^>]*href="\/login"[^>]*>소유자 로그인</);
	expect(html).not.toContain("#tour");
	expect(html).not.toContain("기능 둘러보기");
	expect(html).toContain(
		"Next.js · oRPC · Better Auth · Drizzle · Neon · Vercel",
	);
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	for (const href of hrefs)
		expect(href, String(href)).toMatch(/^(#top|\/login)$/);
});

test("히어로: 768px 이상은 자른 1:1 판(라이트·다크), 767px 이하는 휴대폰 판이고 전체 화면 판은 쓰지 않는다", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("studio-hero.png");
	expect(html).toContain("studio-hero-dark.png");
	expect(html).toContain("studio-mobile.png");
	expect(html).not.toMatch(/studio(-dark)?\.png/);
	expect(html).not.toContain("문단 작업실");
	expect(html).not.toMatch(/<img [^>]*alt=""/);
	// 보이는 판만 받는다: 숨은 판은 lazy(기본)라 eager·preload가 없다(Next 16 Image 문서: 테마 판은 fetchPriority만)
	expect(html).not.toContain('loading="eager"');
	expect(html).not.toContain('rel="preload"');
});

test("공급자 이름이 든 증거 줄·바닥 글·스택 배지는 번역하지 않는다", () => {
	expect(renderToStaticMarkup(createElement(Hero))).toMatch(
		/<span translate="no">Typecast/,
	);
	expect(renderToStaticMarkup(createElement(LandingFooter))).toContain(
		'translate="no"',
	);
});

test("태그라인은 서버 그림에서 모든 어절이 진하다(JS 없이도 읽힌다)", () => {
	const html = renderToStaticMarkup(
		createElement(Tagline, {
			lines: ["다섯 곳의 목소리를", "한 대본에 담는다."],
		}),
	);
	expect(count(html, /landing-word/g)).toBe(6);
	expect(html).not.toContain("data-armed");
	expect(html).not.toContain("data-on");
});
