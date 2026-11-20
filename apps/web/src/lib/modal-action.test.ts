import { toast } from "sonner";
import { afterEach, expect, test, vi } from "vitest";

import { MODAL_HINT_ID, unlessModal } from "./modal-action";
import { TOAST_TEXT } from "./studio-text";

afterEach(() => {
	vi.restoreAllMocks();
});

// 열린 모달이 있는(없는) 가짜 루트에서 알림 행동을 한 번 누른다
function press(open: boolean) {
	const hint = vi.spyOn(toast, "message").mockReturnValue(MODAL_HINT_ID);
	const seen = { went: 0, prevented: false };
	const root = {
		querySelector: () => (open ? {} : null),
	} as unknown as ParentNode;
	const onClick = unlessModal(() => seen.went++, root);
	onClick({
		preventDefault: () => {
			seen.prevented = true;
		},
	});
	return { ...seen, hints: hint.mock.calls };
}

test("이동 행동은 모달이 없으면 하고 알림을 닫게 둔다(안내 없음)", () => {
	expect(press(false)).toEqual({ went: 1, prevented: false, hints: [] });
});

test("모달이 열려 있으면 하지 않고 알림을 남기며, 고정 id 안내를 한 번 띄운다", () => {
	expect(press(true)).toEqual({
		went: 0,
		prevented: true,
		hints: [[TOAST_TEXT.closeModalFirst, { id: MODAL_HINT_ID }]],
	});
});

test("안내는 해요체 한 문장이라 끝 마침표가 없다", () => {
	expect(TOAST_TEXT.closeModalFirst).toMatch(/요$/);
});
