import { isValidElement, type ReactElement } from "react";
import { type ToastT, toast } from "sonner";
import { afterEach, expect, test, vi } from "vitest";

import { unlessModal } from "./modal-action";
import { TOAST_TEXT } from "./studio-text";
import { hintedToasts } from "./toast-position";

afterEach(() => {
	vi.restoreAllMocks();
	hintedToasts.clear();
});

// 열린 모달이 있는(없는) 가짜 루트에서, 그 행동을 단 활성 알림(id 7, 성공·설명 있음)의 행동을 누른다
function press(open: boolean, times = 1, hint?: string) {
	const seen = { went: 0, prevented: 0 };
	const root = {
		querySelector: () => (open ? {} : null),
	} as unknown as ParentNode;
	const onClick = unlessModal(() => seen.went++, hint, root);
	const pressed: ToastT = {
		id: 7,
		type: "success",
		title: "만들었어요",
		description: "원래 설명",
		action: { label: "무대로", onClick },
	};
	vi.spyOn(toast, "getToasts").mockReturnValue([
		{ id: 3, title: "다른 알림", action: { label: "x", onClick: () => {} } },
		pressed,
	]);
	// sonner처럼 같은 id 갱신이 활성 알림의 설명을 바꾼다
	const success = vi
		.spyOn(toast, "success")
		.mockImplementation((_title, data) => {
			pressed.description = data?.description;
			return 7;
		});
	const message = vi.spyOn(toast, "message").mockReturnValue(0);
	for (let i = 0; i < times; i++)
		onClick({
			preventDefault: () => {
				seen.prevented++;
			},
		});
	return {
		...seen,
		updates: success.mock.calls,
		messages: message.mock.calls,
	};
}

type HintNode = ReactElement<{ className: string; children: string }>;
// 갱신에 실린 설명 노드(안내 문구를 담은 span)
const hintOf = (update: unknown[]) => {
	const node = (update[1] as { description: HintNode }).description;
	expect(isValidElement(node)).toBe(true);
	return node;
};

test("이동 행동은 모달이 없으면 하고 알림을 닫게 둔다(안내 없음)", () => {
	expect(press(false)).toEqual({
		went: 1,
		prevented: 0,
		updates: [],
		messages: [],
	});
	expect(hintedToasts.size).toBe(0);
});

test("모달이 열려 있으면 하지 않고, 누른 그 알림의 설명만 안내로 바꾼다(종류 유지, 새 알림 없음)", () => {
	const { went, prevented, updates, messages } = press(true);
	expect({ went, prevented, messages }).toEqual({
		went: 0,
		prevented: 1,
		messages: [],
	});
	expect(updates).toHaveLength(1);
	expect(updates[0]?.[0]).toBe("만들었어요");
	expect(updates[0]?.[1]).toMatchObject({ id: 7 });
	// 문구를 주지 않으면 일반 안내
	expect(hintOf(updates[0] ?? []).props.children).toBe(
		TOAST_TEXT.closeModalFirst,
	);
	expect(hintedToasts.get(7)).toBe("원래 설명");
});

test("행동마다 준 안내 문구를 쓴다", () => {
	const { updates } = press(true, 1, "창을 닫으면 무대로 갈 수 있어요");
	expect(hintOf(updates[0] ?? []).props.children).toBe(
		"창을 닫으면 무대로 갈 수 있어요",
	);
});

test("안내 줄은 알림 종류 색(rich error 빨강)을 물려받지 않는 중립색이고 한 번 흐림에서 나타난다", () => {
	const { className } = hintOf(press(true).updates[0] ?? []).props;
	expect(className).toContain("text-muted-foreground");
	expect(className).toContain("animate-in");
	expect(className).toContain("fade-in-0");
});

test("다시 누르면 새 key 노드라 다시 나타나고 다시 읽힌다. 되돌릴 원래 설명은 처음 것 그대로다", () => {
	const { updates } = press(true, 2);
	expect(updates).toHaveLength(2);
	const [first, second] = updates.map(hintOf);
	expect(first?.key).not.toBeNull();
	expect(second?.key).not.toBe(first?.key);
	expect(second?.props.children).toBe(first?.props.children);
	expect(hintedToasts.get(7)).toBe("원래 설명");
	expect([...hintedToasts.keys()]).toEqual([7]);
});

test("안내는 해요체 한 문장이라 끝 마침표가 없다", () => {
	expect(TOAST_TEXT.closeModalFirst).toMatch(/요$/);
});
