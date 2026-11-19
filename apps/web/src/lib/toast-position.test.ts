import { expect, test } from "vitest";

import {
	MODAL_OPEN_SELECTOR,
	planToastHold,
	TOAST_RESUME_MS,
	toastPlacement,
} from "./toast-position";

test("평소에는 아래(작업실 막대 위), 모달이 열리면 위 가운데", () => {
	const normal = toastPlacement(false);
	expect(normal.position).toBe("bottom-right");
	expect(normal.offset.bottom).toContain("--studio-bar-height");
	const open = toastPlacement(true);
	expect(open.position).toBe("top-center");
	expect(open.offset.top).toBe(24);
	expect(open.mobileOffset.top).toBe(64);
});

test("열린 시트·대화상자·알림창만 센다(툴팁·팝오버·메뉴는 아니다)", () => {
	expect(MODAL_OPEN_SELECTOR).toContain(
		'[data-slot="sheet-content"][data-open]',
	);
	expect(MODAL_OPEN_SELECTOR).toContain(
		'[data-slot="dialog-content"][data-open]',
	);
	expect(MODAL_OPEN_SELECTOR).toContain(
		'[data-slot="alert-dialog-content"][data-open]',
	);
	expect(MODAL_OPEN_SELECTOR).not.toMatch(/popover|tooltip|menu/);
});

test("모달이 열리면 행동 알림만 멈추고(duration Infinity 대상), 단순 안내는 두다", () => {
	const toasts = [
		{ id: 1, action: { label: "되돌리기" }, duration: 10_000 },
		{ id: 2 },
		{ id: 3, action: {}, duration: Number.POSITIVE_INFINITY },
	];
	const plan = planToastHold(toasts, true, new Map());
	expect(plan.freeze.map((t) => t.id)).toEqual([1]);
	expect(plan.release).toEqual([]);
});

test("멈출 알림에 종류(error)가 그대로 남는다(갱신 때 종류 함수로 부르기 위해)", () => {
	const plan = planToastHold(
		[{ id: 1, type: "error", action: {}, duration: 4000 }],
		true,
		new Map(),
	);
	expect(plan.freeze[0]?.type).toBe("error");
});

test("jsx(custom) 알림은 멈춤·풀기 대상에서 뺀다", () => {
	const toasts = [{ id: 1, jsx: {}, action: {}, duration: 4000 }];
	expect(planToastHold(toasts, true, new Map()).freeze).toEqual([]);
	expect(planToastHold(toasts, false, new Map([[1, 4000]])).release).toEqual(
		[],
	);
});

test("모달이 닫히면 멈췄던 알림 중 아직 떠 있는 것만 다시 흐르게 한다", () => {
	const toasts = [
		{ id: 1, action: {}, duration: Number.POSITIVE_INFINITY },
		{ id: 3, action: {}, duration: Number.POSITIVE_INFINITY },
	];
	const plan = planToastHold(
		toasts,
		false,
		new Map([
			[1, 10_000],
			[9, 4000],
		]),
	);
	expect(plan.release.map((r) => r.toast.id)).toEqual([1]);
	expect(plan.freeze).toEqual([]);
});

test("풀 때 원래 duration을 되살리고, 짧거나 없으면 5초 이상으로 둔다", () => {
	const toasts = [
		{ id: 1, action: {} },
		{ id: 2, action: {} },
		{ id: 3, action: {} },
	];
	const held = new Map<number | string, number | undefined>([
		[1, 10_000],
		[2, 2000],
		[3, undefined],
	]);
	const { release } = planToastHold(toasts, false, held);
	expect(release.map((r) => r.duration)).toEqual([10_000, 5000, 5000]);
	expect(TOAST_RESUME_MS).toBe(5000);
});
