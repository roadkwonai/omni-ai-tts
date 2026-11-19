import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려준다(공급자·서버를 부르지 않는다)
vi.mock("@/lib/landing-content", () => import("../../lib/landing-content"));
vi.mock("@/lib/landing-faq", () => import("../../lib/landing-faq"));
vi.mock("@/lib/landing", () => import("../../lib/landing"));

import {
	BUILD_POINTS,
	DELIVER,
	DRAMA_SECTION,
	HERO_SAMPLES,
	LISTEN,
	NAV_ITEMS,
	NUMBERS,
	PROVIDERS,
	STUDIO,
	TOUR_TABS,
} from "../../lib/landing-content";
import { FAQ_ITEMS } from "../../lib/landing-faq";
import { DEMO_TEXT, DemoBadge, DemoProvider } from "../demo";
import { Notice } from "../notice";
import { Built } from "./built";
import { DeliverSection } from "./deliver-section";
import { DramaSection } from "./drama-section";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HeroCard } from "./hero-card";
import { LandingBar, NavLink } from "./landing-bar";
import { LandingFooter } from "./landing-footer";
import { ListenSection } from "./listen-section";
import { NumbersSection } from "./numbers-section";
import { ProofBand } from "./proof-band";
import { StudioSection } from "./studio-section";
import { Tagline } from "./tagline";
import { Tour } from "./tour";

function count(html: string, pattern: RegExp) {
	return html.match(pattern)?.length ?? 0;
}

// 글 속 서비스 이름 span(translate="no")을 벗겨 문장이 이어진 글로 비교한다
function plain(html: string) {
	return html
		.replaceAll('<span translate="no" class="whitespace-nowrap">', "")
		.replaceAll("</span>", "");
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

test("FAQ는 질문마다 aria-expanded 단추이고 첫 항목만 펼쳐져 있다", () => {
	const html = renderToStaticMarkup(createElement(Faq));
	expect(count(html, /aria-expanded="true"/g)).toBe(1);
	expect(count(html, /aria-expanded="false"/g)).toBe(FAQ_ITEMS.length - 1);
	expect(html).toMatch(
		new RegExp(`aria-expanded="true"[^>]*>(<[^>]+>)*${FAQ_ITEMS[0]?.question}`),
	);
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

test("마지막 행동은 '데모 써 보기'(/studio)와 '처음으로 돌아가 다시 듣기'(히어로 카드 #hero-card)이고 로그인 링크·투어 되돌리기는 없다", () => {
	const html = renderToStaticMarkup(createElement(FinalCta));
	expect(html).toContain("이제 직접 들어 보세요");
	expect(html).toMatch(/<a [^>]*href="\/studio"[^>]*>데모 써 보기</);
	expect(html).toMatch(
		/<a [^>]*href="#hero-card"[^>]*>처음으로 돌아가 다시 듣기</,
	);
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
	expect(html).not.toContain("#tour");
	expect(html).not.toContain("기능 둘러보기");
	expect(html).toContain(
		"Next.js · oRPC · Better Auth · Drizzle · Neon · Vercel",
	);
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	for (const href of hrefs)
		expect(href, String(href)).toMatch(/^(#hero-card|\/studio)$/);
});

test("히어로: 헤드라인과 문단 카드, 주 버튼 '데모 써 보기'(/studio)·보조 '기능 둘러보기'(#listen), 로그인 링크 없음", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("같은 문장을 다섯 성우에게 읽혀 보세요");
	expect(html).toMatch(/<a [^>]*href="\/studio"[^>]*>데모 써 보기</);
	expect(html).toMatch(/<a [^>]*href="#listen"[^>]*>기능 둘러보기</);
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
	// 기존 작업실 스크린샷은 히어로에서 뺐다
	expect(html).not.toMatch(/studio(-hero)?(-dark|-mobile)?\.png/);
	// 장식 마스코트는 alt를 비운다(곁의 글이 뜻을 말한다)
	expect(html).toMatch(/<img [^>]*alt=""/);
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
	// Airy 칩만 '다른 문장' 표시이고, 이유 한 줄('Airy는 다른 문장…')은 처음(Typecast)에도 칩 아래에 보인다
	expect(count(html, /다른 문장/g)).toBe(2);
	// 서비스 이름은 translate="no" 묶음으로 감싸 이름과 뒷말이 태그로 나뉜다
	expect(html).toContain("</span>는 다른 문장을 읽은 샘플이에요");
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

test("카드 아래 출처 줄은 AI 음성이라는 안내 한 줄뿐이다(서비스 이름은 증명 띠가 말한다)", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("모든 목소리는 AI로 만든 음성입니다");
	// 안내 문장은 번역 대상이다: 문장을 감싼 p에는 translate="no"가 없다
	expect(html).not.toMatch(/<p [^>]*translate="no"[^>]*>모든 목소리는/);
	expect(html).not.toContain("typecast.ai");
	expect(html).not.toContain("· ");
});

test("문단 카드: id=hero-card, 칩 위 안내는 늘 보이고 로드 전 시간은 0:00 이며 Airy 칩은 '다른 문장' 이유를 가리킨다", () => {
	const html = renderToStaticMarkup(createElement(HeroCard));
	expect(html).toContain('id="hero-card"');
	expect(html).toContain("성우를 눌러 들어 보세요");
	expect(html).toContain('aria-describedby="hero-pick-hint"');
	expect(html).toContain("0:00 / 0:00");
	expect(html).not.toContain("--:--");
	// 이유 한 줄은 어느 칩을 골랐든 보이고, Airy 칩만 그 줄을 설명으로 가리킨다
	expect(html).toContain("</span>는 다른 문장을 읽은 샘플이에요");
	expect(count(html, /aria-describedby="hero-other-note"/g)).toBe(1);
});

test("증명 띠: 서비스 다섯 이름과 받는 형식 한 줄, 로고 이미지 없음", () => {
	const html = renderToStaticMarkup(createElement(ProofBand));
	for (const name of PROVIDERS) expect(html).toContain(name);
	expect(html).toContain("한 대본으로 한 파일 WAV, 문단별 zip, 자막 SRT까지");
	expect(html).not.toContain("<img");
	expect(count(html, /translate="no"/g)).toBe(PROVIDERS.length);
});

test("들어 보고 고른다 #listen: 캐스팅 크롭 한 쌍(라이트·다크)과 '기본 샘플은 무료로 들어요' 글", () => {
	const html = renderToStaticMarkup(createElement(ListenSection));
	expect(html).toContain('id="listen"');
	expect(html).toContain(LISTEN.title);
	expect(html).toContain("기본 샘플은 무료로 들어요");
	expect(html).toContain("casting-dark.png");
	// 휴대폰 판과 넓은 판, 각 라이트·다크
	expect(count(html, /<img /g)).toBe(4);
	expect(html).toContain("casting-mobile-dark.png");
	expect(html).not.toMatch(/<img [^>]*alt=""/);
});

test("문단마다 다르게 #studio: 크롭 셋(각 휴대폰·넓은 판 × 라이트·다크)과 장식 마스코트 한 컷, 좌우로 번갈아 서고 캡션은 기능 이름 + 한 문장이다", () => {
	const html = renderToStaticMarkup(createElement(StudioSection));
	expect(html).toContain('id="studio"');
	expect(html).toContain(STUDIO.title);
	expect(count(html, /<img /g)).toBe(3 * 4 + 1);
	for (const name of ["paragraphs", "tags", "makebar"]) {
		expect(html).toContain(`${name}-dark.png`);
		expect(html).toContain(`${name}-mobile-dark.png`);
	}
	expect(count(html, /md:order-last/g)).toBe(1);
	for (const item of STUDIO.items) {
		expect(html).toContain(item.text);
		expect(html).toMatch(new RegExp(`<h3 [^>]*>${item.name}</h3>`));
	}
	// 마스코트는 제목 줄이 아니라 첫 캡션 안에 서고 alt가 비어 있다
	expect(count(html, /<img [^>]*alt=""/g)).toBe(1);
	expect(
		html.indexOf(STUDIO.mascot.src.split("/").pop() ?? ""),
	).toBeGreaterThan(html.indexOf(STUDIO.items[0]?.text ?? ""));
});

test("숫자를 제대로 읽는다: 제목의 따옴표 안 숫자만 강조(mark)하고 검수 창 크롭 한 쌍이 있다", () => {
	const html = renderToStaticMarkup(createElement(NumbersSection));
	expect(count(html, /<mark /g)).toBe(1);
	expect(html).toMatch(/<mark [^>]*>“1,523억 달러”<\/mark>/);
	expect(html).toContain(NUMBERS.body);
	expect(count(html, /<img /g)).toBe(4);
	expect(html).toContain("numbers-mobile.png");
});

test("대화 장면과 내 목소리 #drama: 짝 카드 둘, 드라마 카드에만 화자 색 칩 넷(번호와 이름이 함께)", () => {
	const html = renderToStaticMarkup(createElement(DramaSection));
	expect(html).toContain('id="drama"');
	for (const card of DRAMA_SECTION.cards) {
		expect(html).toContain(card.title);
		expect(plain(html)).toContain(card.body);
	}
	expect(count(html, /<img /g)).toBe(2);
	for (const n of [1, 2, 3, 4]) {
		expect(html).toContain(`bg-speaker-${n}-subtle`);
		expect(html).toContain(`화자 ${n}`);
	}
	// 마스코트는 장식(alt 비움), 본문의 서비스 이름은 번역하지 않고 끊기지 않는다
	expect(count(html, /<img [^>]*alt=""/g)).toBe(2);
	expect(html).toContain(
		'<span translate="no" class="whitespace-nowrap">Fish Audio</span>',
	);
});

test("받기와 안심: 3열, 칸마다 아이콘(aria-hidden)과 제목·한 문장", () => {
	const html = renderToStaticMarkup(createElement(DeliverSection));
	expect(count(html, /<h3 /g)).toBe(DELIVER.items.length);
	expect(count(html, /<svg [^>]*aria-hidden="true"/g)).toBe(3);
	for (const item of DELIVER.items) {
		expect(html).toContain(item.title);
		expect(plain(html)).toContain(item.detail);
	}
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
	expect(DEMO_TEXT.listDescription).toContain("다른 음성 서비스를 골라 보세요");
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

test("바닥에 프로킷 제작 표시가 있다", () => {
	expect(renderToStaticMarkup(createElement(LandingFooter))).toContain(
		"으로 만들었어요",
	);
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
