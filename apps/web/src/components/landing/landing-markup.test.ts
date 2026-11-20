import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려준다(공급자·서버를 부르지 않는다)
vi.mock("@/lib/landing-content", () => import("../../lib/landing-content"));
vi.mock("@/lib/landing-faq", () => import("../../lib/landing-faq"));
vi.mock("@/lib/landing", () => import("../../lib/landing"));
vi.mock("@/lib/landing-waveforms", () => import("../../lib/landing-waveforms"));
vi.mock("@/lib/classes-view", () => import("../../lib/classes-view"));

import {
	ACTING,
	COST,
	DRAMA,
	FLOW,
	HERO_SAMPLES,
	NAV_ITEMS,
	TOUR_TABS,
	TRY,
} from "../../lib/landing-content";
import { FAQ_ITEMS } from "../../lib/landing-faq";
import { DEMO_TEXT, DemoBadge, DemoProvider } from "../demo";
import { Notice } from "../notice";
import { ActingSection } from "./acting-section";
import { CostSection } from "./cost-section";
import { DramaSection } from "./drama-section";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { FlowSection } from "./flow-section";
import { Hero } from "./hero";
import { LandingBar, NavLink } from "./landing-bar";
import { LandingFooter } from "./landing-footer";
import { Tagline } from "./tagline";
import { Tour } from "./tour";
import { TrySection } from "./try-section";

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

test("막대는 같은 페이지 앵커와 /studio?example=1(데모 작업실 열기)만 걸고 /login은 없다, 메뉴 단추는 이름이 있다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).toContain('aria-label="메뉴"');
	const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
	for (const href of hrefs) {
		expect(href, String(href)).toMatch(/^(#[a-z-]+|\/studio\?example=1)$/);
	}
	expect(hrefs).toContain("/studio?example=1");
	expect(html).toContain("데모 작업실 열기");
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
});

test("막대 오른쪽 묶음에 테마 버튼이 데모 작업실 열기와 메뉴 단추 앞에 있다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	const theme = html.indexOf('aria-label="테마 바꾸기"');
	expect(theme).toBeGreaterThan(-1);
	expect(theme).toBeLessThan(html.indexOf("데모 작업실 열기"));
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
	expect(html).toMatch(/<span translate="no"[^>]*>.*?Omni AI TTS<\/span>/);
});

test("마지막 행동은 '데모 작업실 열기'(/studio?example=1)와 '처음으로 돌아가 다시 듣기'(오디션 무대 #audition-stage)이고 로그인 링크·투어 되돌리기는 없다", () => {
	const html = renderToStaticMarkup(createElement(FinalCta));
	expect(html).toContain("이제 직접 들어 보세요");
	expect(html).toMatch(
		/<a [^>]*href="\/studio\?example=1"[^>]*>데모 작업실 열기</,
	);
	expect(html).toMatch(
		/<a [^>]*href="#audition-stage"[^>]*>처음으로 돌아가 다시 듣기</,
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
		expect(href, String(href)).toMatch(
			/^(#audition-stage|\/studio\?example=1)$/,
		);
});

test("히어로 #listen: 헤드라인, '데모 작업실 열기'(/studio?example=1), 오디션 무대, 장식 감독 마스코트, 로그인 링크 없음", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain('id="listen"');
	expect(html).toContain("같은 문장을 다섯 성우에게 읽혀 보세요");
	expect(html).toMatch(
		/<a [^>]*href="\/studio\?example=1"[^>]*>데모 작업실 열기</,
	);
	expect(html).toContain('id="audition-stage"');
	expect(html).not.toContain("/login");
	expect(html).not.toContain("로그인");
	// 기존 작업실 스크린샷은 히어로에서 뺐다
	expect(html).not.toMatch(/studio(-hero)?(-dark|-mobile)?\.png/);
	// 마스코트는 장식이라 alt가 비어 있고 파일의 실제 비율(정사각)이다
	expect(html).toMatch(/<img [^>]*alt=""/);
	expect(html).toContain("mascot-director");
	expect(html).toMatch(
		/width="640"[^>]*height="640"|height="640"[^>]*width="640"/,
	);
	// 첫 화면(lg 이상)에 보이는 마스코트라 eager·높은 우선순위로 받는다(로고와 같은 방식이라 Next가 preload 링크를 함께 낸다)
	expect(html).toMatch(/<img [^>]*loading="eager"/);
	expect(html).toMatch(/<img [^>]*fetchPriority="high"/i);
	// lg 이상 두 열(소개·마스코트 / 무대), 열 폭은 줄어들 수 있다
	expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]");
});

test("히어로 행동 위계: '데모 작업실 열기'가 주 행동(채운 primary)이고 '모두 이어 듣기'는 무대 안 보조(outline)다", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	const demo =
		html.match(/<a [^>]*href="\/studio\?example=1"[^>]*>/)?.[0] ?? "";
	expect(demo).toContain("bg-primary");
	const all =
		html.match(/<button [^>]*id="audition-play-all"[^>]*>/)?.[0] ?? "";
	expect(all).toContain("border-primary");
	expect(all).not.toContain("bg-primary ");
	// 만든 방법 섹션을 뺐으므로 #built 링크는 없다
	expect(html).not.toContain("#built");
});

test("재생 중이 아니면 감독 마스코트에 음파 링이 없다(반복 애니메이션은 재생 중에만)", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).not.toContain("animate-ping");
});

test("출처 줄은 AI 음성이라는 안내 한 줄이고 번역 대상이다", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("모든 목소리는 AI로 만든 음성입니다");
	expect(html).not.toMatch(/<p [^>]*translate="no"[^>]*>모든 목소리는/);
	expect(html).not.toContain("typecast.ai");
});

test("오디션 무대: 줄 다섯(서비스·성우·길이·파형), '모두 이어 듣기'와 안내, 자동 재생·소리 요소 없음", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(count(html, /<li>/g)).toBe(HERO_SAMPLES.length);
	for (const sample of HERO_SAMPLES) expect(html).toContain(sample.provider);
	for (const voice of ["포세이돈", "Sarah", "일반여성2", "Puck"])
		expect(html).toContain(voice);
	// 줄 단추 이름에 서비스·성우, 처음엔 모두 재생 상태가 아니다
	expect(html).toContain('aria-label="Typecast 포세이돈 재생"');
	expect(html).toContain('aria-label="Airy 샘플 재생"');
	expect(html).not.toContain("멈춤");
	// 길이와 파형(막대 64개 × 5줄, 장식이라 스크린 리더에서 숨김)
	for (const time of ["0:06", "0:04", "0:10", "0:05"])
		expect(html).toContain(time);
	expect(count(html, /<rect /g)).toBe(64 * HERO_SAMPLES.length);
	expect(count(html, /<svg [^>]*viewBox="0 0 256 40"/g)).toBe(
		HERO_SAMPLES.length,
	);
	expect(
		count(html, /<svg [^>]*aria-hidden="true"[^>]*viewBox="0 0 256 40"/g),
	).toBe(HERO_SAMPLES.length);
	// 안내와 이어 듣기 단추
	expect(html).toContain("줄을 누르면 하나만 들어요");
	expect(html).toMatch(
		/<button [^>]*id="audition-play-all"[^>]*>(<[^>]+>)*모두 이어 듣기/,
	);
	// Airy 줄만 '다른 문장으로 만든 샘플' 표시
	expect(count(html, /다른 문장으로 만든 샘플/g)).toBe(1);
	// 소리는 누를 때 만든다: 마크업에 audio·source·autoplay·파일 주소가 없다
	expect(html).not.toMatch(/<audio|<source|autoplay|\.mp3|\.wav/i);
	// 재생 중인 줄이 없으니 primary로 칠한 막대가 없다
	expect(html).not.toContain("fill-primary");
});

test("오디션 무대: 원문·발음용 토글(aria-pressed, 처음 원문)과 숫자 강조", () => {
	const html = renderToStaticMarkup(createElement(Hero));
	expect(html).toContain("2026년");
	expect(html).toContain("숫자 3개 검수함");
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
});

test("숫자 놀이터 #try: 입력칸(200자, 예시 문장)·칩 다섯·aria-live 결과, 돋보기 마스코트", () => {
	const html = renderToStaticMarkup(createElement(TrySection));
	expect(html).toContain('id="try"');
	expect(html).toContain(TRY.title);
	expect(html).toContain(TRY.body);
	expect(html).toMatch(
		/<textarea [^>]*maxLength="200"|<textarea [^>]*maxlength="200"/,
	);
	expect(html).toContain(`>${TRY.example}</textarea>`);
	expect(html).toContain('<label for="try-input"');
	for (const chip of TRY.chips) expect(html).toContain(`>${chip}</button>`);
	expect(html).toContain(TRY.resultHead);
	expect(html).toContain('aria-live="polite"');
	// 처음 예시 문장: 바뀐 곳 넷이고 확인 필요는 없다(처음 보는 사람이 오류로 읽지 않게)
	expect(count(html, /<mark /g)).toBe(4);
	expect(html).not.toContain("확인 필요:");
	expect(html).toMatch(/<img [^>]*alt=""/);
	expect(html).toContain("mascot-magnifier");
});

test("연기 비교 #acting: 제목·본문, 연기 칩 넷(aria-pressed, 처음 기본만 고름)과 태그 없는 대본, 파형 한 줄, 출처 한 줄", () => {
	const html = renderToStaticMarkup(createElement(ActingSection));
	expect(html).toContain('id="acting"');
	expect(html).toContain("태그 하나로 연기가 바뀌어요");
	expect(html).toContain(ACTING.body);
	expect(html).toContain('aria-label="연기 고르기"');
	expect(count(html, /<button [^>]*aria-pressed="true"/g)).toBe(1);
	expect(count(html, /<button [^>]*aria-pressed="false"/g)).toBe(3);
	for (const take of ACTING.takes) expect(html).toContain(take.label);
	expect(html).toMatch(/aria-pressed="true"[^>]*>(<[^>]+>)*기본/);
	// 처음엔 태그가 꽂히지 않은 같은 문장이다
	expect(html).toContain(ACTING.script);
	expect(html).not.toContain("[속삭이며]");
	// 표정 그림은 칩 아이콘 넷과 오른쪽 큰 얼굴 넷(고른 연기만 보이고 나머지는 투명, 장식이라 alt 비움), 파형은 한 줄(막대 64개)
	expect(count(html, /<img [^>]*alt=""/g)).toBe(8);
	expect(count(html, /opacity-0/g)).toBe(3);
	// 재생은 가짜 원이 아니라 이름 있는 실제 단추(44px)다
	expect(html).toMatch(/<button [^>]*aria-label="기본 재생"[^>]*size-11/);
	for (const name of ["plain", "whisper", "laugh", "sigh"])
		expect(html).toContain(`mascot-face-${name}`);
	expect(count(html, /<rect /g)).toBe(64);
	expect(html).toContain("0:03");
	expect(plain(html)).toContain(
		"Fish Audio 효정2 · 같은 문장에 태그만 바꿨어요",
	);
	// 소리는 누를 때 만든다: 자동 재생·소리 요소·파일 주소가 마크업에 없다
	expect(html).not.toMatch(/<audio|<source|autoplay|\.mp3/i);
	expect(html).not.toContain("fill-primary");
});

test("드라마 장면 #drama: '장면 듣기'와 대사 네 줄(화자 이름·지시 괄호), 처음엔 강조·소리 요소 없음", () => {
	const html = renderToStaticMarkup(createElement(DramaSection));
	expect(html).toContain('id="drama"');
	expect(html).toContain(DRAMA.title);
	expect(html).toContain(DRAMA.body);
	expect(html).toMatch(/<button [^>]*>(<[^>]+>)*장면 듣기</);
	expect(html).toContain('aria-label="대사"');
	for (const line of DRAMA.lines) expect(html).toContain(line.text);
	for (const direction of ["놀라며", "웃으며", "속삭이며"])
		expect(html).toContain(`(${direction})`);
	// 화자는 색과 이름·번호가 함께 간다(색 토큰 클래스, 원시 색 없음)
	for (const n of [1, 2]) expect(html).toContain(`bg-speaker-${n}-subtle`);
	for (const speaker of DRAMA.speakers) expect(html).toContain(speaker.name);
	expect(html).not.toContain("bg-speaker-3");
	expect(html).not.toContain('aria-current="true"');
	expect(html).toContain(DRAMA.numberNote);
	expect(html).not.toMatch(/<audio|<source|autoplay/i);
	expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
});

test("드라마 분해 도해: 파형 하나와 줄별 조각 넷, '대사 n.wav'와 '자막.srt', 캡션 한 줄(그림은 스크린 리더에서 숨김)", () => {
	const html = renderToStaticMarkup(createElement(DramaSection));
	expect(html).toContain(
		`<figcaption class="text-pretty break-keep font-bold text-lg">${DRAMA.splitCaption}</figcaption>`,
	);
	for (const n of [1, 2, 3, 4]) expect(html).toContain(`대사 ${n}.wav`);
	expect(html).toContain("자막.srt");
	// 파형 막대: 장면 줄 64 + 도해 전체 64 + 줄별 조각(막대를 나눠 가져 합이 64) = 192
	expect(count(html, /<rect /g)).toBe(64 * 3);
});

test("드라마 짝 카드 '내 목소리도 성우처럼': 장식 마스코트와 글, 서비스 이름은 번역하지 않고 끊기지 않는다", () => {
	const html = renderToStaticMarkup(createElement(DramaSection));
	expect(html).toContain(DRAMA.clone.title);
	expect(plain(html)).toContain(DRAMA.clone.body);
	expect(html).toContain("mascot-feature-clone");
	expect(count(html, /<img [^>]*alt=""/g)).toBe(1);
	expect(html).toContain(
		'<span translate="no" class="whitespace-nowrap">Fish Audio</span>',
	);
});

test("작업 흐름: 순서 목록 넷(성우 캐스팅 → 보관함 → 문단 작업실 → 받기), 단마다 크롭 한 쌍×휴대폰·넓은 판과 한 줄", () => {
	const html = renderToStaticMarkup(createElement(FlowSection));
	expect(html).toContain(FLOW.title);
	expect(count(html, /<li /g)).toBe(4);
	// 크롭 단계 셋은 휴대폰 판 한 쌍만(글자가 읽히는 핵심 크롭), 보관함은 휴대폰·넓은 판 두 쌍
	expect(count(html, /<img /g)).toBe(3 * 2 + 4);
	const at = FLOW.steps.map((step) => html.indexOf(`>${step.name}</h3>`));
	expect(at.every((i) => i > -1)).toBe(true);
	expect(at).toEqual([...at].sort((a, b) => a - b));
	for (const step of FLOW.steps) expect(html).toContain(step.text);
	for (const name of ["casting", "voices", "paragraphs", "makebar"])
		expect(html).toContain(`${name}-mobile-dark.png`);
	// md 이상은 2×2(칸이 넓어 글자가 읽힌다)
	expect(html).toContain("md:grid-cols-2");
	expect(html).not.toContain("lg:grid-cols-4");
	expect(html).not.toContain("lg:aspect-4/3");
});

test("비용 재현: 문단 카드 둘과 '만들기', 처음엔 확인 창·배지가 없고 세 줄과 저금통 마스코트가 있다", () => {
	const html = renderToStaticMarkup(createElement(CostSection));
	expect(html).toContain(COST.title);
	expect(count(html, /<li /g)).toBe(2 + COST.points.length);
	expect(html).toMatch(/<button [^>]*>만들기<\/button>/);
	// 누르기 전에도 원장이 '호출 0 · 크레딧 0'으로 보인다
	expect(html).toContain(COST.ledgerLabel);
	expect(html).toContain(COST.ledgerIdle);
	expect(html).toMatch(/호출<\/span>[\s\S]*?>0<\/span>/);
	expect(html).not.toContain(COST.reused);
	expect(html).not.toContain(COST.confirmTitle);
	expect(html).not.toContain("다시 해 보기");
	for (const point of COST.points) expect(html).toContain(point);
	expect(html).toMatch(/<img [^>]*alt=""/);
	expect(html).toContain("mascot-piggy");
});

test("바닥에 GitHub 저장소 외부 링크가 새 창 안내와 함께 있다(숫자로 보는 제작 섹션은 없다)", () => {
	const html = renderToStaticMarkup(createElement(LandingFooter));
	const link = html.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
	expect(link).toContain('href="https://github.com/roadkwonai/omni-ai-tts"');
	expect(link).toContain('target="_blank"');
	expect(link).toContain('rel="noopener noreferrer"');
	expect(link).toContain('<span translate="no">GitHub</span>');
	expect(link).toContain("에서 코드 보기");
	expect(link).toMatch(/<span class="sr-only">[^<]*새 창[^<]*<\/span>/);
	expect(link).toMatch(/<svg [^>]*aria-hidden="true"/);
	expect(link).toContain("focus-visible:outline-ring");
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

test("태그라인 스크롤 채움은 큰 화면·정밀 포인터·움직임 허용일 때만 걸리고, 안 채운 어절은 opacity 0.71(muted 수준, 3:1 이상)이고 opacity만 전환한다", () => {
	const css = readFileSync(new URL("./landing.css", import.meta.url), "utf8");
	const armed = css.slice(css.indexOf(".landing-tagline[data-armed]"));
	// 포매터가 조건을 여러 줄로 나눌 수 있어 공백을 하나로 모은다
	const guard = css
		.slice(
			css.lastIndexOf("@media", css.indexOf(".landing-tagline[data-armed]")),
			css.indexOf(".landing-tagline[data-armed]"),
		)
		.replace(/\s+/g, "");
	// 공백을 지웠으므로 아래 기대도 공백 없이 쓴다
	expect(guard).toContain("(min-width:768px)");
	expect(guard).toContain("(pointer:fine)");
	expect(guard).toContain("(prefers-reduced-motion:no-preference)");
	const block = armed.slice(0, armed.indexOf("/* 누름"));
	// 안 채운 어절은 opacity 0.71(foreground 알파 0.85 × 0.71 ≈ muted-foreground 0.6)이고 opacity만 전환한다(color 전환은 단어마다 다시 칠한다)
	expect(block).toMatch(/opacity:\s*0\.71/);
	expect(block).toMatch(/transition:\s*opacity 300ms/);
	expect(block).not.toMatch(/transition:\s*color/);
	expect(block).not.toMatch(/opacity:\s*0\.3\b/);
});

test("막대 로고는 이미지 요청 없이 인라인 SVG 심볼(aria-hidden)과 진짜 글자라 링크 이름이 'Omni AI TTS'다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).not.toContain("<img");
	expect(html).not.toContain("/brand/logo-");
	expect(html).toMatch(
		/<a [^>]*href="#top"[^>]*><span translate="no"[^>]*><svg aria-hidden="true"[^>]*>.*?<\/svg>Omni AI TTS<\/span><\/a>/,
	);
	// hover는 글자를 primary로 바꾸는 색 신호다(투명도만 낮추지 않는다)
	expect(html).toMatch(
		/<a [^>]*href="#top"[^>]*class="[^"]*hover:text-primary/,
	);
});

test("막대의 로고 링크와 '데모 작업실 열기'는 눌림 영역이 44px 이상이다", () => {
	const html = renderToStaticMarkup(createElement(LandingBar));
	expect(html).toMatch(/<a [^>]*href="#top"[^>]*class="[^"]*min-h-11/);
	// 데스크톱 링크는 보이는 높이가 44px(buttonVariants size lg = h-11)라 눌림 영역을 따로 넓히지 않는다
	expect(html).toMatch(
		/<a [^>]*class="[^"]*\bh-11\b[^"]*"[^>]*href="\/studio\?example=1"/,
	);
	expect(html).not.toContain("after:-inset-y-1.75");
});
