// apps/web/src/components/paragraph-focus.ts
// 문단 카드의 숨은 제목·대본 칸 id와 '문단 N 보기' 이동(T10 브리프 7절). 레일·붙여 넣기 창·카드(Task 12)·막대(Task 13)가 같이 쓴다

export const paragraphHeadId = (id: string) => `paragraph-head-${id}`;
export const paragraphTextId = (id: string) => `paragraph-text-${id}`;

// 보이는 쪽 요소(레일과 1단 작업 띠·두 '고르기' 단추처럼 같은 칸을 둘 그리고 한쪽은 display:none이라 offsetParent가 null이다)
export function visible(root: ParentNode, selector: string) {
	for (const element of root.querySelectorAll<HTMLElement>(selector))
		if (element.offsetParent !== null) return element;
	return null;
}

// 그 칸을 화면 가운데로 옮긴다(포커스는 부른 쪽이 한다). 없으면 null
export function centered(elementId: string): HTMLElement | null {
	const element = document.getElementById(elementId);
	element?.scrollIntoView({ block: "center" });
	return element;
}

// '문단 N 보기'·'이동': 그 카드 숨은 제목을 가운데로 스크롤하고 포커스
export function showParagraph(id: string) {
	centered(paragraphHeadId(id))?.focus({ preventScroll: true });
}

// 그 문단 대본 칸으로 포커스(브리프 7절 나누기·합치기·지우기·단축키·되돌리기). caret을 주면 그 자리(end면 끝)에 캐럿을 둔다
export function focusText(id: string, caret?: number | "end") {
	const field = document.getElementById(paragraphTextId(id));
	if (!(field instanceof HTMLTextAreaElement)) return;
	field.focus();
	if (caret === undefined) return;
	const at = caret === "end" ? field.value.length : caret;
	field.setSelectionRange(at, at);
}
