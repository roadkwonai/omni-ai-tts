import type * as React from "react";

// 모달 팝업(대화상자·시트)의 Tab 감싸기.
// Base UI는 팝업 앞뒤에 포커스 가드(span tabindex=0)를 두고, 가드가 포커스를 받으면 다음 프레임(requestAnimationFrame)에
// 첫·끝 요소로 옮긴다(floating-ui-react/utils/enqueueFocus). 그 프레임 전에 Tab이 한 번 더 오면(빠른 키 입력, 느린 CPU, 가려진 창의 rAF 지연)
// 포커스가 가드를 지나 뒤 페이지 링크로 샌다. 끝에서의 Tab이 가드에 닿기 전에 여기서 바로 감싼다.
// shortcut: tabindex가 0보다 큰 요소와 라디오 묶음의 탭 순서는 따로 계산하지 않는다(쓰지 않는다), 쓰게 되면 그때 넓힌다.
const TABBABLE =
	'a[href],button,input:not([type="hidden"]),select,textarea,summary,audio[controls],video[controls],iframe,[tabindex],[contenteditable=""],[contenteditable="true"]';

// 순수 판정: 감쌀 대상(감쌀 필요가 없으면 null). 앞으로는 마지막 요소에서 첫 요소로, 뒤로는 첫 요소나 팝업 자신에서 마지막 요소로
export function wrapTarget<T>(
	items: readonly T[],
	active: unknown,
	shift: boolean,
	container: unknown,
): T | null {
	const first = items.at(0) ?? null;
	const last = items.at(-1) ?? null;
	if (shift) return active === first || active === container ? last : null;
	return active === last ? first : null;
}

// Tab으로 닿는 요소인가(보이고, 막히지 않고, tabindex가 음수가 아닌 것). checkVisibility가 없는 브라우저(Safari 17.4 미만)는 보이는 것으로 본다
export function isTabbable(el: HTMLElement) {
	return (
		el.tabIndex >= 0 &&
		!el.matches(":disabled") &&
		!el.closest("[inert]") &&
		(el.checkVisibility?.({ visibilityProperty: true }) ?? true)
	);
}

function tabbableIn(root: HTMLElement) {
	return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
		isTabbable,
	);
}

// 팝업 Content의 onKeyDown에서 부른다. 팝업 밖(포털로 띄운 중첩 팝업)에서 온 키는 건드리지 않는다
export function trapTab(event: React.KeyboardEvent<HTMLElement>) {
	if (
		event.key !== "Tab" ||
		event.defaultPrevented ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey
	)
		return;
	const root = event.currentTarget;
	if (!(event.target instanceof Node) || !root.contains(event.target)) return;
	const target = wrapTarget(
		tabbableIn(root),
		event.target,
		event.shiftKey,
		root,
	);
	if (!target) return;
	event.preventDefault();
	target.focus();
}
