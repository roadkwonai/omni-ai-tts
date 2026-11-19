import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려준다(공급자·서버를 부르지 않는다)
vi.mock("@/lib/landing-content", () => import("../../lib/landing-content"));
vi.mock("@/lib/landing-faq", () => import("../../lib/landing-faq"));
vi.mock("@/lib/landing", () => import("../../lib/landing"));

import {
	BUILD_POINTS,
	HERO_SAMPLES,
	NAV_ITEMS,
	TOUR_TABS,
} from "../../lib/landing-content";
import { FAQ_ITEMS } from "../../lib/landing-faq";
import { DEMO_TEXT, DemoBadge, DemoProvider } from "../demo";
import { Notice } from "../notice";
import { Built } from "./built";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HeroCard } from "./hero-card";
import { LandingBar, NavLink } from "./landing-bar";
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

test("첫 탭(음성 작업실)은 라이트·다크 × 데스크톱·휴대폰 네 판을 실제 화면 파일로 쓰고 모두 대체 글이 있다", () => {
	const html = renderToStaticMarkup(createElement(Tour));
	expect(html).toContain("studio-dark.png");
	expect(html).toContain("studio-mobile.png");
	expect(html).toContain("studio-mobile-dark.png");
	// 다크 판은 dark:block, 라이트 판은 dark:hidden. 데스크톱·휴대폰 쌍이라 각각 둘이다
	expect(count(html, /dark:block/g)).toBe(2);
	expect(count(html, /dark:hidden/g)).toBe(2);
	expect(count(html, /<img /g)).toBe(4);
	expect(html).not.toMatch(/<img [^>]*alt=""/);
});

test("FAQ는 질문마다 aria-expanded=false 단추이고 처음엔 모두 닫혀 있다", () => {
	const html = renderToStaticMarkup(createElement(Faq));
	expect(count(html, /aria-expanded="false"/g)).toBe(FAQ_ITEMS.length);
	expect(html).not.toContain('aria-expanded="true"');
	for (const item of FAQ_ITEMS) expect(html).toContain(item.question);
});

test("막대는 같은 페이지 앵커와 /studio(데모 써 보기)만 걸고 /login은 없다, 메뉴 단추는 이름이 있다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).toContain('aria-label="메뉴"');
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	for (const href of hrefs) {
		expect(href, String(href)).toMatch(/^(#[a-z-]+|\/studio)$/);
	}
	expect(hrefs).toContain("/studio");
	expect(html).toContain("데모 써 보기");
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
});

test("막대 오른쪽 묶음에 테마 버튼이 데모 써 보기와 메뉴 단추 앞에 있다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	const theme = html.indexOf('aria-label="테마 바꾸기"');
	expect(theme).toBeGreaterThan(-1);
	expect(theme).toBeLessThan(html.indexOf("데모 써 보기"));
	expect(theme).toBeLessThan(html.indexOf('aria-label="메뉴"'));
});

test("막대 링크: 지금 보는 섹션만 aria-current=location이고 처음엔 아무것도 아니다", () => {
	const item = NAV_ITEMS[1];
	if (!item) throw new Error("NAV_ITEMS");
	const on = renderToStaticMarkup(
		createElement(NavLink, { item, current: true }),
	);
	const off = renderToStaticMarkup(
		createElement(NavLink, { item, current: false }),
	);
	expect(on).toContain('aria-current="location"');
	expect(off).not.toContain("aria-current");
	expect(on).toContain(item.label);
	expect(renderToStaticMarkup(createElement(LandingBar))).not.toContain(
		"aria-current",
	);
});

test("막대 바탕은 불투명하다(390에서 뒤 글자가 비치지 않는다)", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).toContain("bg-background ");
	expect(html).not.toMatch(/bg-background\/\d/);
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

test("마지막 행동은 '데모 써 보기'(/studio)와 '맨 위로'(#top)이고 로그인 링크·투어 되돌리기는 없다", () => {
	const html = renderToStaticMarkup(createElement(FinalCta));
	expect(html).toMatch(/<a [^>]*href="\/studio"[^>]*>데모 써 보기</);
	expect(html).toMatch(/<a [^>]*href="#top"[^>]*>맨 위로</);
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
	expect(html).not.toContain("#tour");
	expect(html).not.toContain("기능 둘러보기");
	expect(html).toContain(
		"Next.js · oRPC · Better Auth · Drizzle · Neon · Vercel",
	);
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	for (const href of hrefs)
		expect(href, String(href)).toMatch(/^(#top|\/studio)$/);
});

test("히어로: 헤드라인과 문단 카드, 주 버튼 '데모 써 보기'(/studio)·보조 '기능 둘러보기'(#tour), 로그인 링크 없음", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("같은 문단, 다섯 목소리로 들어 보세요");
	expect(html).toMatch(/<a [^>]*href="\/studio"[^>]*>데모 써 보기</);
	expect(html).toMatch(/<a [^>]*href="#tour"[^>]*>기능 둘러보기</);
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
	// 기존 작업실 스크린샷은 히어로에서 뺐다
	expect(html).not.toMatch(/studio(-hero)?(-dark|-mobile)?\.png/);
	expect(html).not.toMatch(/<img [^>]*alt=""/);
	// 보이는 판만 받는다: eager·preload가 없다
	expect(html).not.toContain('loading="eager"');
	expect(html).not.toContain('rel="preload"');
});

test("문단 카드: 칩 다섯은 이름 있는 라디오 그룹이고 처음엔 하나만 골라져 있으며 자동 재생·소리 요소가 없다", () => {
	const html = renderToStaticMarkup(createElement(HeroCard));
	expect(html).toContain('role="radiogroup"');
	expect(html).toContain('aria-label="목소리 고르기"');
	expect(count(html, /type="radio"/g)).toBe(5);
	expect(count(html, /checked=""/g)).toBe(1);
	for (const sample of HERO_SAMPLES) expect(html).toContain(sample.provider);
	for (const voice of ["포세이돈", "Sarah", "일반여성2", "Puck"])
		expect(html).toContain(voice);
	// Airy만 '다른 문장' 표시. 처음(Typecast)에는 카드 위 'Airy는 다른 문장…' 한 줄이 없다
	expect(count(html, /다른 문장/g)).toBe(1);
	expect(html).not.toContain("Airy는 다른 문장을 읽은 샘플이에요");
	// 소리는 누를 때 지연 로드한다: 마크업에 audio·source·autoplay가 없다
	expect(html).not.toMatch(/<audio|<source|autoplay|\.mp3|\.wav/i);
	// 재생 단추 이름에 공급자·성우
	expect(html).toContain('aria-label="Typecast 포세이돈 재생"');
});

test("문단 카드: 문단 번호·원문·숫자 검수 줄·토글(aria-pressed, 처음 원문)", () => {
	const html = renderToStaticMarkup(createElement(HeroCard));
	expect(html).toContain("2026년");
	expect(html).toContain("숫자 3개 검수함");
	// 원문/발음용은 ui ToggleGroup(하나 고르기)이다
	expect(html).toContain('data-slot="toggle-group"');
	expect(html).toContain('aria-label="대본 보기"');
	expect(count(html, /<button [^>]*aria-pressed="true"/g)).toBe(1);
	expect(count(html, /<button [^>]*aria-pressed="false"/g)).toBe(1);
	expect(html).toMatch(/aria-pressed="true"[^>]*>원문</);
	expect(html).toMatch(/aria-pressed="false"[^>]*>발음용</);
	expect(html).toContain("듣기는 발음용 대본으로 만든 소리예요");
	// 숫자 부분만 강조(mark), 안 보이는 글은 스크린 리더에서 숨긴다
	expect(count(html, /<mark /g)).toBe(6);
	expect(html).toContain("이천이십육 년");
	expect(html).not.toContain("/login");
});

test("문단 카드 아래 출처 표기는 AI 음성임과 공급자를 밝히고, 브랜드·도메인만 번역하지 않으며 항목은 줄 끝에서 쪼개지지 않는다", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("모든 목소리는 AI로 만든 음성입니다");
	expect(html).toContain("typecast.ai");
	expect(html).toContain("elevenlabs.io");
	// 안내 문장은 번역 대상이다: 문장을 감싼 p에는 translate="no"가 없다
	expect(html).not.toMatch(/<p [^>]*translate="no"[^>]*>모든 목소리는/);
	expect(html).toContain('<span translate="no">Gemini</span>');
	expect(html).toContain('<span translate="no">typecast.ai</span>');
	// '· Gemini'처럼 점과 이름이 한 덩어리(nowrap)다
	expect(html).toMatch(
		/<span class="whitespace-nowrap">· <span translate="no">Gemini<\/span><\/span>/,
	);
	expect(count(html, /whitespace-nowrap">· /g)).toBe(5);
});

test("마지막 만든 방법 항목은 2열 격자의 빈 칸을 채우려 두 칸을 차지한다", () => {
	const html = renderToStaticMarkup(createElement(Built));
	// 항목이 홀수라 마지막 칸이 비는 경우에만 필요하다. 클래스는 모든 항목에 달리지만 `last:`가 마지막 하나에만 건다
	expect(BUILD_POINTS.length % 2).toBe(1);
	expect(count(html, /md:last:col-span-2/g)).toBe(BUILD_POINTS.length);
});

test("만든 방법 끝에 GitHub 저장소 외부 링크가 새 창 안내와 함께 있다", () => {
	const html = renderToStaticMarkup(createElement(Built));
	const link = html.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
	expect(link).toContain('href="https://github.com/roadkwonai/omni-ai-tts"');
	expect(link).toContain('target="_blank"');
	expect(link).toContain('rel="noopener noreferrer"');
	expect(link).toContain('<span translate="no">GitHub</span>');
	expect(link).toMatch(/<span class="sr-only">[^<]*새 창[^<]*<\/span>/);
	expect(link).toMatch(/<svg [^>]*aria-hidden="true"/);
});

test("안내 제목은 한글 단어가 쪼개지지 않게 break-keep이다", () => {
	const html = renderToStaticMarkup(
		createElement(Notice, { title: "공개 데모는 저장해 둔 목록만 보여요" }),
	);
	expect(html).toMatch(/<h2 [^>]*break-keep/);
});

test("데모 목록 없음 안내는 다음 행동을 한 줄로 알린다", () => {
	expect(DEMO_TEXT.listDescription).toContain("다른 공급자를 골라 보세요");
});

test("데모 표시는 크기를 덮어쓰지 않고 Badge 기본 크기를 쓴다", () => {
	const html = renderToStaticMarkup(
		createElement(DemoProvider, {
			demo: true,
			children: createElement(DemoBadge),
		}),
	);
	expect(html).toContain("데모 샘플");
	expect(html).not.toMatch(/min-h-6|text-xs|px-2[^.]/);
	expect(html).toContain("shrink-0");
});

test("바닥 글·스택 배지는 번역하지 않는다", () => {
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
