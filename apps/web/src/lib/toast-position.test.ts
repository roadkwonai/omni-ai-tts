import { expect, test } from "vitest";

import { MODAL_OPEN_SELECTOR, toastPlacement } from "./toast-position";

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
