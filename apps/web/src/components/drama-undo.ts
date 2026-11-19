// apps/web/src/components/drama-undo.ts
// 드라마 화면의 실행 취소 알림 칸 둘. 대본 구역·무대·장면 플레이어가 함께 쓴다(drama-lines와 drama-take가 서로 가져오지 않게 따로 둔다)
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { DRAMA_TEXT } from "@/lib/drama-view";
import { hasOpenModal } from "@/lib/toast-position";

// 실행 취소 알림의 지속 시간(audit P2-1). 다른 알림은 sonner 기본값이다
const UNDO_TOAST_MS = 10_000;

// 실행 취소 알림 칸. 칸마다 알림이 하나다: 새 알림이 앞 알림을 닫아 옛 스냅숏이 그 뒤 바꾼 상태를 덮지 않고,
// 대본 구역(DramaLines)이 사라지면(화면을 떠나면) 닫는다. undo는 provider가 돌려준 함수, after는 되살린 뒤 포커스.
// 알림 id는 이벤트와 정리에서만 쓰는 브라우저 값이라 칸의 모듈 변수 하나에 둔다
function undoSlot() {
	let id: string | number | null = null;
	return {
		show(message: string, undo: () => void, after?: () => void) {
			if (id !== null) toast.dismiss(id);
			id = toast(message, {
				duration: UNDO_TOAST_MS,
				action: {
					label: DRAMA_TEXT.undo,
					onClick: () => {
						id = null;
						flushSync(undo);
						// 모달이 열려 있으면 대사 칸은 창 뒤라 포커스를 옮기지 않는다(providers.tsx가 모달 안으로 되돌린다, MG-10)
						if (!hasOpenModal(document)) after?.();
					},
				},
			});
		},
		dismiss() {
			if (id !== null) toast.dismiss(id);
			id = null;
		},
	};
}
// 대본 스냅숏(Task 11): 줄 지우기, 붙여 넣기 '바꾸기', 이 테이크의 대본으로 되돌리기(removeLine·replace·restoreScript)
const scriptUndo = undoSlot();
// 고른 테이크: '모든 줄을 이 테이크로'(clearPicks). 대본을 덮지 않으므로 칸을 따로 두어 대본 실행 취소 알림을 닫지 않는다(리뷰 M1)
const picksUndo = undoSlot();
export const showScriptUndo = scriptUndo.show;
export const showPicksUndo = picksUndo.show;
// 두 칸의 알림을 닫는다. 대본 구역(DramaLines)이 사라질 때 부른다(칸의 수명 주인)
export function dismissUndo() {
	scriptUndo.dismiss();
	picksUndo.dismiss();
}
