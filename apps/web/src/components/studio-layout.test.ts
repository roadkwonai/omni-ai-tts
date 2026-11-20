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

test("2단: 머리 1행 · 설정 1~3행(오른쪽 열, sticky) · 목록 2~3행 · 요약 aside는 3단에서만 보인다", () => {
	const from = body.indexOf("PARAGRAPH_TEXT.summary}") - 80;
	const summary = body.slice(from, body.indexOf("</aside>", from));
	const settings = body.slice(
		body.indexOf("PARAGRAPH_TEXT.settingsLabel") - 80,
		body.indexOf("<ParagraphList"),
	);
	const list = body.slice(
		body.indexOf("@4xl:col-start-1 @6xl:col-start-2 @4xl:row-span-2"),
	);
	for (const c of [
		"@4xl:block",
		"@4xl:studio-rail-sticky",
		"@4xl:mt-10",
		"@4xl:row-span-3",
		"@4xl:row-start-1",
		"@4xl:col-start-2",
	]) {
		expect(settings).toContain(c);
	}
	expect(list).toContain("@4xl:row-start-2");
	// 요약 aside는 2단에서 숨고(RAIL의 hidden) 3단(@6xl)에서만 보인다. 2단 배치 클래스가 없다
	expect(summary).toContain("@6xl:block");
	expect(summary).not.toContain("@4xl:");
	// 3단 값은 2단 값이 바뀌어도 움직이지 않는다
	for (const c of ["@6xl:col-start-1", "@6xl:row-span-3", "@6xl:row-start-1"]) {
		expect(settings).toContain(c);
	}
	for (const c of [
		"@6xl:col-start-3",
		"@6xl:row-start-1",
		"@6xl:row-span-3",
		"@6xl:studio-rail-sticky",
		"@6xl:mt-10",
	]) {
		expect(summary).toContain(c);
	}
});

test("레일 칸의 기본은 hidden이고 막대의 요약 칩은 2단까지 보인다(@6xl에서 숨는다)", () => {
	expect(src).toMatch(/const RAIL =\s*"hidden /);
	expect(src).not.toContain("RAIL_STICKY");
	const bar = readFileSync(
		new URL("./paragraph-bar.tsx", import.meta.url),
		"utf8",
	);
	// 빈 상태에서는 막대 자체가 접혀 칩 래퍼에 따로 접는 class가 없다
	expect(bar).toContain('className="contents @6xl:hidden"');
	expect(bar).not.toContain("@4xl:hidden");
});

test("막대 주 버튼은 좁으면 '· N개'부터 빼고 동사만 줄며 '· 무료' 꼬리는 줄지 않는다(320, MG-03·MG-13)", () => {
	const bar = readFileSync(
		new URL("./paragraph-bar.tsx", import.meta.url),
		"utf8",
	);
	// 서식(줄바꿈·들여쓰기·class 순서)에 묶이지 않게 공백을 접고 태그·중괄호 옆 공백을 지운 뒤 class 낱말로 본다
	const flat = bar.replace(/\s+/g, " ").replace(/\s*([<>{}])\s*/g, "$1");
	const OPEN = '<span className="';
	// 내용 inner를 바로 담은 span과, parent면 그 span을 감싼 span의 class 낱말
	const classesOf = (inner: string, parent = false) => {
		const at = flat.indexOf(`">${inner}`);
		expect(at).toBeGreaterThan(0);
		let open = flat.lastIndexOf(OPEN, at);
		if (parent) open = flat.lastIndexOf(OPEN, open - 1);
		return flat
			.slice(open + OPEN.length, flat.indexOf('"', open + OPEN.length))
			.split(" ");
	};
	const verb = classesOf("{mainVerb}");
	expect(verb).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
	// '· N개'는 줄지 않는 조각이라 안 들어가면 통째로 한 줄 높이(h-lh)에 가려진 둘째 줄로 넘어간다
	expect(classesOf("{mainCount}")).toEqual(
		expect.arrayContaining(["shrink-0", "whitespace-pre"]),
	);
	expect(classesOf("{mainVerb}", true)).toEqual(
		expect.arrayContaining(["flex-wrap", "h-lh", "overflow-hidden", "min-w-0"]),
	);
	// 꼬리는 글자 공백으로 띄우고(whitespace-pre) 줄지 않는다
	const tail = classesOf("{` ${PARAGRAPH_TEXT.freeTail}`}");
	expect(tail).toEqual(expect.arrayContaining(["shrink-0", "whitespace-pre"]));
	expect(tail).not.toContain("truncate");
	// 접근 이름은 꼬리까지 전체 글
	expect(flat).toContain("aria-label={mainLabel}");
});

test("빈 상태에서는 모든 폭에서 막대와 '만들기와 받기로' 건너뛰기 링크를 접는다(MG-03)", () => {
	const bar = readFileSync(
		new URL("./paragraph-bar.tsx", import.meta.url),
		"utf8",
	);
	const band = bar.slice(bar.indexOf('id="paragraph-bar"'));
	const barClass = band.slice(0, band.indexOf("\n\t\t\t>"));
	expect(barClass).toContain("group-data-empty/studio:hidden");
	expect(barClass).not.toContain("group-data-empty/studio:max-md:hidden");
	const skip = body.slice(body.indexOf('href="#paragraph-bar"'));
	expect(skip.slice(0, skip.indexOf("</a>"))).toContain(
		'"group-data-empty/studio:hidden"',
	);
});
