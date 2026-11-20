// 알림의 이동 행동 감싸기(MG-11). studio-text를 가져오므로 전역 Providers가 쓰는 toast-position과 따로 둔다(랜딩 번들에 넣지 않는다)
import { createElement } from "react";
import { type Action, type ToastT, toast } from "sonner";

import { TOAST_TEXT } from "./studio-text";
import { hasOpenModal, hintedToasts, updateToast } from "./toast-position";

let presses = 0;
// 안내 설명 노드. 누를 때마다 key가 바뀌어 새 노드로 붙는다: 흐림에서 한 번 나타나고(tw-animate-css animate-in, 150ms.
// 움직임 줄이기에도 투명도 전환은 남는다: globals.css) sonner 낭독 영역(aria-relevant "additions text", index.mjs 1145행)이 다시 읽는다.
// 색은 중립 muted-foreground. sonner의 rich 색 [data-description]{color:inherit}(457행)은 바깥 div에 걸려 span의 클래스 색이 이긴다
const hintNode = (text: string) =>
	createElement(
		"span",
		{ key: ++presses, className: "text-muted-foreground animate-in fade-in-0" },
		text,
	);

// 배경 칸으로 포커스, 배경의 창 열기(드라마 '…번 줄로'·'성우 고르기'·'무대로'·'붙여 넣기'). 모달이 열려 있으면 그 칸·창은 모달 뒤라 하지 않고
// (창 위에 창을 겹치지 않는다) 알림을 닫지 않고 남긴다(sonner는 행동 onClick 뒤 defaultPrevented면 닫지 않는다: index.mjs 882~884행).
// 반응 없는 버튼이 되지 않게 누른 그 알림의 설명을 안내(hint: 행동 대상을 말하는 문구, 없으면 일반 안내)로 바꾼다(MG-12: 알림을 하나로 두어 창 제목을 덮지 않는다).
// 행동·종류는 그대로 남고, 원래 설명은 hintedToasts에 두어 모달이 닫히면 AppToaster가 되돌린다(restoreHints)
export function unlessModal(
	go: () => void,
	hint: string = TOAST_TEXT.closeModalFirst,
	root: Pick<ParentNode, "querySelector"> = document,
) {
	const onClick = (event: { preventDefault(): void }) => {
		if (!hasOpenModal(root)) return go();
		event.preventDefault();
		// sonner는 행동에 알림을 넘기지 않아(882행) 행동 onClick이 이 함수인 활성 알림을 찾는다
		const pressed = (toast.getToasts() as ToastT[]).find(
			(t) => (t.action as Action | undefined)?.onClick === onClick,
		);
		if (!pressed) return;
		if (!hintedToasts.has(pressed.id))
			hintedToasts.set(pressed.id, pressed.description);
		updateToast(pressed, { description: hintNode(hint) });
	};
	return onClick;
}
