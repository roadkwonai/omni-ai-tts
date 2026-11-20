// 알림의 이동 행동 감싸기(MG-11). studio-text를 가져오므로 전역 Providers가 쓰는 toast-position과 따로 둔다(랜딩 번들에 넣지 않는다)
import { toast } from "sonner";

import { TOAST_TEXT } from "./studio-text";
import { hasOpenModal } from "./toast-position";

// 안내 알림 id. 고정이라 연달아 눌러도 떠 있는 안내를 갱신할 뿐 쌓이지 않는다(sonner create의 같은 id 갱신, index.mjs 195~215행)
export const MODAL_HINT_ID = "modal-action-hint";

// 배경 칸으로 포커스, 배경의 창 열기(드라마 '…번 줄로'·'성우 고르기'·'무대로'·'붙여 넣기'). 모달이 열려 있으면 그 칸·창은 모달 뒤라 하지 않고
// (창 위에 창을 겹치지 않는다) 알림을 닫지 않고 남긴다(sonner는 행동 onClick 뒤 defaultPrevented면 닫지 않는다: index.mjs 882~884행).
// 반응 없는 버튼이 되지 않게 짧은 안내를 띄운다. 안내는 행동이 없어 모달 중 시간 멈춤(planToastHold) 대상이 아니다
export function unlessModal(
	go: () => void,
	root: Pick<ParentNode, "querySelector"> = document,
) {
	return (event: { preventDefault(): void }) => {
		if (!hasOpenModal(root)) return go();
		event.preventDefault();
		toast.message(TOAST_TEXT.closeModalFirst, { id: MODAL_HINT_ID });
	};
}
