import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import {
	isTabbable,
	wrapTarget,
} from "../../../../packages/ui/src/lib/focus-wrap";

// 대화상자 Tab 순환(T15-b 결함 3). Base UI 포커스 가드는 포커스를 받은 뒤 다음 프레임(rAF)에 첫·끝 요소로 옮긴다.
// 그 사이에 Tab이 한 번 더 오면 가드를 지나 뒤 페이지로 샌다. 끝에서의 Tab은 가드에 닿기 전에 우리가 바로 감싼다.
const a = { id: "a" };
const b = { id: "b" };
const c = { id: "c" };
const root = { id: "root" };

test("마지막 요소에서 Tab은 첫 요소로 감싼다", () => {
	expect(wrapTarget([a, b, c], c, false, root)).toBe(a);
});

test("첫 요소 또는 대화상자 자신에서 Shift+Tab은 마지막 요소로 감싼다", () => {
	expect(wrapTarget([a, b, c], a, true, root)).toBe(c);
	expect(wrapTarget([a, b, c], root, true, root)).toBe(c);
});

test("가운데에서는 감싸지 않고 브라우저에 맡긴다", () => {
	expect(wrapTarget([a, b, c], b, false, root)).toBeNull();
	expect(wrapTarget([a, b, c], b, true, root)).toBeNull();
	expect(wrapTarget([a, b, c], a, false, root)).toBeNull();
	expect(wrapTarget([a, b, c], c, true, root)).toBeNull();
});

test("탭 정지가 없으면 감싸지 않는다", () => {
	expect(wrapTarget([], root, false, root)).toBeNull();
});

test("요소 하나뿐이면 Tab·Shift+Tab 모두 자기 자신으로 돌아온다", () => {
	expect(wrapTarget([a], a, false, root)).toBe(a);
	expect(wrapTarget([a], a, true, root)).toBe(a);
});

// 한계: DOM 테스트 환경(jsdom·happy-dom)이 없고 새 의존성도 더하지 않는다. trapTab의 이벤트 처리(팝업 밖 대상·defaultPrevented 건너뜀,
// preventDefault와 focus)는 여기서 못 보고 브라우저 QA로 본다. 필터 조건만 가짜 요소로 본다.
const el = (over: Record<string, unknown> = {}) =>
	({
		tabIndex: 0,
		matches: () => false,
		closest: () => null,
		checkVisibility: () => true,
		...over,
	}) as unknown as HTMLElement;

test("보이고 막히지 않은 요소만 탭 정지다", () => {
	expect(isTabbable(el())).toBe(true);
	expect(isTabbable(el({ tabIndex: -1 }))).toBe(false);
	expect(isTabbable(el({ matches: () => true }))).toBe(false); // :disabled(fieldset[disabled] 자손 포함)
	expect(isTabbable(el({ closest: () => ({}) }))).toBe(false); // [inert] 안
	expect(isTabbable(el({ checkVisibility: () => false }))).toBe(false);
});

test("checkVisibility가 없는 브라우저(Safari 17.4 미만)에서는 예외 없이 보이는 것으로 본다", () => {
	expect(isTabbable(el({ checkVisibility: undefined }))).toBe(true);
});

// 모달 팝업을 그리는 래퍼는 모두 같은 감싸기를 건다
test.each(["dialog.tsx", "alert-dialog.tsx", "sheet.tsx"])(
	"%s의 Content가 Tab 감싸기를 연결한다",
	(file) => {
		const src = readFileSync(
			new URL(
				`../../../../packages/ui/src/components/${file}`,
				import.meta.url,
			),
			"utf8",
		);
		expect(src).toContain('from "@tts-pilot-app/ui/lib/focus-wrap"');
		expect(src).toContain("trapTab");
	},
);
