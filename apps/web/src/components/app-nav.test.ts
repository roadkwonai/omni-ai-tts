import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다. 로그아웃·경로만 가짜로 둔다
const h = vi.hoisted(() => ({ pathname: "/studio" }));
vi.mock("@/lib/auth-client", () => ({
	signOutToLogin: vi.fn(),
	authClient: {},
}));
vi.mock("next/navigation", async (original) => ({
	...(await original<typeof import("next/navigation")>()),
	usePathname: () => h.pathname,
}));

import { AppNav } from "./app-nav";
import { DemoProvider } from "./demo";

beforeEach(() => {
	h.pathname = "/studio";
});

function render(demo = false) {
	return renderToStaticMarkup(
		createElement(DemoProvider, {
			demo,
			children: createElement(AppNav, { email: "me@example.com" }),
		}),
	);
}

// 목록 하나(시작 표시부터 첫 </ul>까지)의 링크 href와 더보기 버튼 위치를 DOM 순서대로 낸다
function listOf(html: string, marker: string) {
	const start = html.indexOf(marker);
	const list = html.slice(start, html.indexOf("</ul>", start));
	return [
		...list.matchAll(
			/<a [^>]*href="(\/[a-z-]+)"|aria-controls="app-nav-more"/g,
		),
	].map((m) => m[1] ?? "더보기");
}
const BAR = 'class="grid grid-cols-4';
const SIDEBAR = 'class="hidden md:flex md:flex-col';

test("사이드바는 세 묶음 순서다: 만들기, 성우와 대본, 설정", () => {
	expect(listOf(render(), SIDEBAR)).toEqual([
		"/studio",
		"/drama",
		"/casting",
		"/voices",
		"/my-voices",
		"/presets",
		"/scripts",
		"/classes",
		"/connections",
	]);
});

test("묶음의 첫 항목만 위 여백을 둔다(768px 이상, 묶음 이름 줄은 없다)", () => {
	const html = render();
	expect(html.match(/md:mt-5/g)?.length).toBe(2);
});

test("메뉴 글자는 1200px 이상에서 16px이다(18px 아님)", () => {
	const html = render();
	expect(html).toContain("xl:text-base");
	expect(html).not.toContain("xl:text-lg");
});

test("휴대폰 위 막대: DOM 순서가 보이는 순서(음성 작업실 · 성우 캐스팅 · 드라마 작업실 · 더보기)다", () => {
	const html = render();
	// Tab 순서 = DOM 순서. CSS order로 순서를 맞추지 않는다
	expect(listOf(html, BAR)).toEqual([
		"/studio",
		"/casting",
		"/drama",
		"더보기",
	]);
	expect(html).not.toMatch(/\border-[1-4]\b/);
});

test("연결 상태는 위 막대에 없고 더보기 안 '열린 화면'에 있다", () => {
	const html = render();
	expect(listOf(html, BAR)).not.toContain("/connections");
	expect(listOf(html, 'aria-label="열린 화면"')).toContain("/connections");
});

test("공개 데모는 사이드바·더보기에서 연결 상태를 숨긴다(주소는 그대로 열린다)", () => {
	const html = render(true);
	expect(html).not.toContain('href="/connections"');
	expect(listOf(html, SIDEBAR)).not.toContain("/connections");
	expect(render(false)).toContain('href="/connections"');
});

test("더보기 안 화면에 있으면 더보기 칸의 글자가 그 화면 이름이다", () => {
	h.pathname = "/scripts";
	const html = render();
	expect(html).toContain('aria-label="더보기, 현재 대본 보관함"');
	expect(html).toMatch(
		/aria-controls="app-nav-more"[^>]*>.*?대본 보관함<\/span>/,
	);
	h.pathname = "/studio";
	expect(render()).toMatch(
		/aria-controls="app-nav-more"[^>]*>.*?<span[^>]*>더보기<\/span>/,
	);
});

test("앱 틀에 프로킷 제작 표시가 있고 아이콘 사이드바(768~1199px)에서는 숨는다", () => {
	const html = render();
	expect(html).toContain("으로 만들었어요");
	expect(html).toMatch(/class="[^"]*md:hidden xl:flex[^"]*"/);
});

test("'다음에 열릴 화면'은 공개 데모에서 지우고 본인용에는 남긴다", () => {
	expect(render(false)).toContain("다음에 열릴 화면");
	expect(render(true)).not.toContain("다음에 열릴 화면");
	expect(render(true)).not.toContain("준비 중");
});
