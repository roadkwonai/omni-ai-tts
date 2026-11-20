import { readFileSync } from "node:fs";
import { toast } from "sonner";
import { expect, test, vi } from "vitest";

import {
	focusedToastIndex,
	hasOpenModal,
	hintedToasts,
	MODAL_OPEN_SELECTOR,
	MODAL_TITLE_SELECTOR,
	planToastHold,
	refocusToastLater,
	restoreHints,
	shouldReturnFocusToModal,
	TOAST_RESUME_MS,
	TOASTER_SELECTOR,
	toastMoveDelay,
	toastPlacement,
	toastRefocusTarget,
} from "./toast-position";

test("알림 자리 옮김은 기본 전환 시간(ms)만큼 흐린 뒤, 움직임 줄이기면 즉시", () => {
	expect(toastMoveDelay("150ms", false)).toBe(150);
	expect(toastMoveDelay(" 150ms", false)).toBe(150);
	// production CSS 압축은 150ms를 .15s로 바꾼다
	expect(toastMoveDelay(".15s", false)).toBe(150);
	expect(toastMoveDelay("0.15s", false)).toBe(150);
	expect(toastMoveDelay("150ms", true)).toBe(0);
	// 토큰을 못 읽으면(빈 값) 즉시 옮긴다
	expect(toastMoveDelay("", false)).toBe(0);
});

test("평소에는 아래(작업실 막대 위), 모달이 열리면 위 가운데", () => {
	const normal = toastPlacement(false, false);
	expect(normal.position).toBe("bottom-right");
	expect(normal.offset.bottom).toContain("--studio-bar-height");
	expect(toastPlacement(false, true)).toEqual(normal);
	const open = toastPlacement(true, false);
	expect(open.position).toBe("top-center");
	// 가운데 대화상자 위 알림 자리(--toast-clearance 112px) 안에 세 줄 알림(약 96px)이 들어가게 8px
	expect(open.offset.top).toBe(8);
	// 휴대폰 상단 막대 59px + 8px 이상
	expect(open.mobileOffset.top).toBe(72);
	expect(open.mobileOffset.top).toBeGreaterThanOrEqual(59 + 8);
});

test("상단 막대가 보이는 폭(601~767px, sonner는 offset을 쓴다)도 모달 중 위 간격은 72px", () => {
	const open = toastPlacement(true, true);
	expect(open.offset.top).toBe(72);
	expect(open.mobileOffset.top).toBe(72);
});

test("768px·높이 600px 이상 가운데 대화상자는 최대 높이에서 알림 자리를 위아래로 빼 위 여백이 세 줄 알림 끝 이상이다(MG-14·MG-16)", () => {
	const ui = (path: string) =>
		readFileSync(
			new URL(`../../../../packages/ui/src/${path}`, import.meta.url),
			"utf8",
		);
	const steps = ui("styles/globals.css").match(
		/--toast-clearance: calc\(var\(--spacing\) \* (\d+)\);/,
	)?.[1];
	// --spacing 기본 0.25rem(4px). 알림 자리 = 위 간격 + 세 줄 알림(약 96px)보다 커야 한다
	expect(Number(steps) * 4).toBeGreaterThan(
		toastPlacement(true, false).offset.top + 96,
	);
	expect(ui("components/dialog.tsx")).toContain(
		"[@media(min-width:48rem)_and_(min-height:37.5rem)]:max-h-[calc(100dvh_-_2*var(--toast-clearance))]",
	);
});

test("모달이 닫히면 안내로 바꾼 알림의 설명을 되돌리고(없었으면 지움), 닫힌 알림은 건너뛴다", () => {
	const error = vi.spyOn(toast, "error").mockReturnValue(1);
	const message = vi.spyOn(toast, "message").mockReturnValue(2);
	hintedToasts.set(1, "원래 설명");
	hintedToasts.set(2, undefined);
	hintedToasts.set(9, "닫힌 알림");
	restoreHints([
		{ id: 1, type: "error", title: "막혔어요" },
		{ id: 2, title: "붙여 넣을까요" },
		{ id: 5, title: "안내 안 한 알림" },
	]);
	// 종류 있는 알림은 그 종류 함수로(종류 유지), 없는 알림은 message로
	expect(error.mock.calls).toEqual([
		["막혔어요", { id: 1, description: "원래 설명" }],
	]);
	expect(message.mock.calls).toEqual([
		["붙여 넣을까요", { id: 2, description: undefined }],
	]);
	expect(hintedToasts.size).toBe(0);
	vi.restoreAllMocks();
});

// 알림 li 하나와 그 안의 행동 버튼을 흉내 낸다(sonner index.mjs 720행 data-index, 877행 data-action)
function fakeToast(index: string, hasAction: boolean) {
	const action = { name: "action" };
	const item = {
		getAttribute: (name: string) => (name === "data-index" ? index : null),
		querySelector: (selector: string) =>
			selector === "[data-action]" && hasAction ? action : null,
	};
	return { item, action };
}

test("포커스가 있던 알림의 자리 번호를 읽고, 알림 밖이면 null", () => {
	const { item } = fakeToast("1", true);
	const inToast = {
		matches: () => false,
		closest: () => item,
	} as unknown as Element;
	expect(focusedToastIndex(inToast)).toBe("1");
	const outside = {
		matches: () => false,
		closest: () => null,
	} as unknown as Element;
	expect(focusedToastIndex(outside)).toBeNull();
	expect(focusedToastIndex(null)).toBeNull();
});

test("포커스가 목록(ol) 자체면(Alt+T) 맨 앞 알림(0번)으로 본다", () => {
	const list = {
		matches: (selector: string) => selector === TOASTER_SELECTOR,
		closest: () => null,
	} as unknown as Element;
	expect(focusedToastIndex(list)).toBe("0");
});

// 다음 프레임 복귀: 가짜 문서(키·누름 듣기, 알림 하나)와 손으로 돌리는 프레임
function laterSetup() {
	const frames = new Map<number, FrameRequestCallback>();
	let next = 1;
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		frames.set(next, cb);
		return next++;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
	const listeners = new Map<string, () => void>();
	const focus = vi.fn();
	const doc = {
		addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
		removeEventListener: (type: string) => listeners.delete(type),
		querySelector: () => ({ querySelector: () => ({ focus }) }),
	} as unknown as Document;
	const runFrames = () => {
		for (const [id, cb] of [...frames]) {
			frames.delete(id);
			cb(0);
		}
	};
	return { doc, focus, listeners, runFrames };
}

test("Base UI의 연 버튼 복귀(마이크로태스크) 뒤인 다음 프레임에 같은 알림 행동 버튼으로 돌린다", () => {
	const { doc, focus, listeners, runFrames } = laterSetup();
	refocusToastLater(doc, "0");
	expect(focus).not.toHaveBeenCalled();
	runFrames();
	expect(focus).toHaveBeenCalledWith({ preventScroll: true });
	expect(listeners.size).toBe(0);
	vi.unstubAllGlobals();
});

test("그 사이 사용자가 키를 치거나 누르면(포커스를 직접 옮겼을 수 있다) 건드리지 않는다", () => {
	for (const type of ["keydown", "pointerdown"]) {
		const { doc, focus, listeners, runFrames } = laterSetup();
		refocusToastLater(doc, "0");
		listeners.get(type)?.();
		runFrames();
		expect(focus).not.toHaveBeenCalled();
		expect(listeners.size).toBe(0);
		vi.unstubAllGlobals();
	}
});

test("취소하면 프레임과 듣기를 모두 거둔다", () => {
	const { doc, focus, listeners, runFrames } = laterSetup();
	refocusToastLater(doc, "0")();
	runFrames();
	expect(focus).not.toHaveBeenCalled();
	expect(listeners.size).toBe(0);
	vi.unstubAllGlobals();
});

test("옮긴 뒤 같은 자리 알림의 행동 버튼(없으면 알림)으로, 알림이 사라졌으면 null", () => {
	const seen: string[] = [];
	const root = (found: ReturnType<typeof fakeToast>["item"] | null) => ({
		querySelector: (selector: string) => {
			seen.push(selector);
			return found;
		},
	});
	const withAction = fakeToast("1", true);
	expect(
		toastRefocusTarget(root(withAction.item) as unknown as ParentNode, "1"),
	).toBe(withAction.action);
	expect(seen[0]).toContain('[data-index="1"]');
	expect(seen[0]).toContain(TOASTER_SELECTOR);
	const plain = fakeToast("0", false);
	expect(
		toastRefocusTarget(root(plain.item) as unknown as ParentNode, "0"),
	).toBe(plain.item);
	expect(toastRefocusTarget(root(null) as unknown as ParentNode, "2")).toBe(
		null,
	);
});

test("알림에 있던 포커스가 모달·알림 밖으로 가면 모달로 되돌린다", () => {
	const base = {
		fromToaster: true,
		modalOpen: true,
		inModal: false,
		inToaster: false,
	};
	expect(shouldReturnFocusToModal(base)).toBe(true);
	expect(shouldReturnFocusToModal({ ...base, inModal: true })).toBe(false);
	expect(shouldReturnFocusToModal({ ...base, inToaster: true })).toBe(false);
	expect(shouldReturnFocusToModal({ ...base, modalOpen: false })).toBe(false);
	// 알림에서 온 포커스가 아니면(메뉴·툴팁 등) 건드리지 않는다
	expect(shouldReturnFocusToModal({ ...base, fromToaster: false })).toBe(false);
});

test("hasOpenModal은 열린 모달 선택자로 찾고 있으면 true, 없으면 false다", () => {
	const seen: string[] = [];
	const root = (found: boolean) => ({
		querySelector: (selector: string) => {
			seen.push(selector);
			return found ? {} : null;
		},
	});
	expect(hasOpenModal(root(true) as unknown as ParentNode)).toBe(true);
	expect(hasOpenModal(root(false) as unknown as ParentNode)).toBe(false);
	expect(seen[0]).toBe(MODAL_OPEN_SELECTOR);
});

test("제목 선택자는 시트·대화상자·알림창 제목만 가리킨다", () => {
	expect(MODAL_TITLE_SELECTOR).toContain('[data-slot="sheet-title"]');
	expect(MODAL_TITLE_SELECTOR).toContain('[data-slot="dialog-title"]');
	expect(MODAL_TITLE_SELECTOR).toContain('[data-slot="alert-dialog-title"]');
	expect(MODAL_TITLE_SELECTOR).not.toMatch(/card|popover/);
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
