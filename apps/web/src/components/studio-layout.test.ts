import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// 작업실 본문(StudioBody)은 작업실 provider 묶음이 무거워 렌더하지 않고 소스의 DOM 순서와 정적 배치를 확인한다
// (touch-targets.test.ts와 같은 방식). 실제 포커스 순서는 브라우저 Tab 측정이 맡는다.
const src = readFileSync(
	new URL("./paragraph-studio.tsx", import.meta.url),
	"utf8",
);
const body = src.slice(src.indexOf("function StudioBody()"));

test("작업실 DOM 순서는 작업 설정 → 문단 목록·막대 → 작업 요약 하나다", () => {
	const settings = body.indexOf("PARAGRAPH_TEXT.settingsLabel");
	const list = body.indexOf("<ParagraphList");
	const bar = body.indexOf("<ParagraphBar");
	const summary = body.indexOf("PARAGRAPH_TEXT.summary}");
	expect(settings).toBeGreaterThan(0);
	expect(list).toBeGreaterThan(settings);
	expect(bar).toBeGreaterThan(list);
	expect(summary).toBeGreaterThan(bar);
});

test("작업 설정과 작업 요약은 각각 aside이고 한 번씩만 그린다", () => {
	expect(body.match(/<aside/g)?.length).toBe(2);
	expect(body.match(/<WorkSettings/g)?.length).toBe(1);
	expect(body.match(/<WorkSummary/g)?.length).toBe(1);
});

test("폭에 따라 DOM을 바꾸는 JS(탐침·ResizeObserver)와 CSS order를 쓰지 않는다", () => {
	expect(src).not.toContain("useWideProbe");
	expect(src).not.toContain("ResizeObserver");
	expect(src).not.toMatch(/(?:^|[\s"])(?:@\w+:)?order-/);
});

// 행 정의는 index.css의 studio-grid가 맡고, 컴포넌트는 임의 값 grid-rows를 쓰지 않는다(prokit-ui: 임의 Tailwind 값 금지)
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const gridRule = css.slice(css.indexOf("@utility studio-grid"));

test("2단 행은 studio-grid가 머리 · 머리 아래 · 나머지(1fr) 셋으로 정의한다", () => {
	const at4xl = gridRule.slice(
		gridRule.indexOf("@variant @4xl"),
		gridRule.indexOf("@variant @6xl"),
	);
	expect(at4xl).toContain("grid-template-rows: auto auto 1fr");
	expect(src).not.toMatch(/grid-rows-\[/);
});

test("2단: 머리 1행 · 설정 1~2행 · 목록 2~3행 · 요약 3행(오른쪽 열)", () => {
	const summary = body.slice(body.indexOf("PARAGRAPH_TEXT.summary}") - 80);
	const settings = body.slice(
		body.indexOf("PARAGRAPH_TEXT.settingsLabel") - 80,
		body.indexOf("<ParagraphList"),
	);
	const list = body.slice(
		body.indexOf("@4xl:col-start-1 @6xl:col-start-2 @4xl:row-span-2"),
	);
	expect(settings).toContain("@4xl:row-span-2");
	expect(settings).toContain("@4xl:row-start-1");
	expect(settings).toContain("@4xl:col-start-2");
	expect(settings).not.toContain("@4xl:studio-rail-sticky");
	expect(summary).toContain("@4xl:row-start-3");
	expect(summary).toContain("@4xl:col-start-2");
	expect(summary).toContain("@4xl:studio-rail-sticky");
	expect(list).toContain("@4xl:row-start-2");
	// 3단 값은 2단 값이 바뀌어도 움직이지 않는다
	for (const c of ["@6xl:col-start-1", "@6xl:row-span-3", "@6xl:row-start-1"]) {
		expect(settings).toContain(c);
	}
	for (const c of ["@6xl:col-start-3", "@6xl:row-start-1", "@6xl:row-span-3"]) {
		expect(summary).toContain(c);
	}
});
