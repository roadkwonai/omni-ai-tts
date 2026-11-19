// 알림 위치: 평소에는 아래(작업실 막대 위), 시트·대화상자·알림창이 열려 있으면 화면 위.
// 열린 모달 팝업만 센다. Popover·Tooltip·Menu는 role="dialog"여도 data-slot이 달라 반응하지 않는다.
// Base UI 1.8 Dialog.Popup은 열려 있는 동안 data-open을 달고, 닫히면 data-closed(+data-ending-style)로 바뀐다
// (node_modules/@base-ui/react/dialog/popup/DialogPopup.js, DialogPopupDataAttributes.js)
export const MODAL_OPEN_SELECTOR = [
	"sheet-content",
	"dialog-content",
	"alert-dialog-content",
]
	.map((slot) => `[data-slot="${slot}"][data-open]`)
	.join(",");

// 열린 모달(시트·대화상자·알림창, 숫자 검수 창 포함)이 있는가. 되돌리기 뒤에 문단·대사 칸으로 포커스를 주는 쪽이 먼저 묻는다:
// 모달이 열려 있으면 그 칸은 창 뒤라 포커스를 옮기지 않는다
export function hasOpenModal(root: Pick<ParentNode, "querySelector">) {
	return root.querySelector(MODAL_OPEN_SELECTOR) !== null;
}

// 모달 팝업 안에서 포커스를 받을 제목(없으면 팝업 자체). 시트·대화상자·알림창 제목 슬롯이다
export const MODAL_TITLE_SELECTOR = [
	"sheet-title",
	"dialog-title",
	"alert-dialog-title",
]
	.map((slot) => `[data-slot="${slot}"]`)
	.join(",");

// 알림 영역: sonner 목록 <ol>의 표식(node_modules/sonner/dist/index.mjs 1160행 data-sonner-toaster). 알림·행동 버튼은 모두 이 안이다
export const TOASTER_SELECTOR = "[data-sonner-toaster]";

// 모달이 열린 채 알림에서 행동·닫힘으로 포커스가 나갈 때, sonner가 알림 진입 전 요소(index.mjs 1128·1174행)로 포커스를 돌려
// 열린 모달 밖(배경)에 포커스가 남는다. 알림에 있던 포커스가 모달 밖·알림 밖으로 갔을 때만 모달로 되돌린다.
// 메뉴·툴팁 같은 비모달 팝업은 알림에서 온 포커스가 아니라 건드리지 않는다
export function shouldReturnFocusToModal(state: {
	fromToaster: boolean;
	modalOpen: boolean;
	inModal: boolean;
	inToaster: boolean;
}) {
	return (
		state.fromToaster && state.modalOpen && !state.inModal && !state.inToaster
	);
}

// 모달이 열린 동안 '되돌리기' 같은 행동 알림은 저절로 사라지지 않게 멈추고(MG-09), 닫히면 이 시간 뒤 사라진다.
// sonner 2.0.8은 타이머 정지(hover·expanded·탭 숨김)를 내부 상태로만 갖고 있어 prop으로 켤 수 없다.
// 공개 API로는 같은 id에 duration을 다시 주는 갱신뿐이다(Infinity면 타이머가 서지 않는다: node_modules/sonner/dist/index.mjs 644행).
// shortcut: 멈추기 전 남은 시간은 sonner가 내보내지 않아 풀 때 남은 시간이 아니라 원래 시간 전체로 다시 흐른다(짧아도 TOAST_RESUME_MS 이상), 남은 시간이 필요하면 sonner를 올린 뒤 다시 본다
export const TOAST_RESUME_MS = 5000;
// sonner 기본 알림 시간(TOAST_LIFETIME, node_modules/sonner/dist/index.mjs 470행). 알림에 duration이 없을 때의 원래 시간이다
const TOAST_DEFAULT_MS = 4000;

type HoldableToast = {
	id: number | string;
	action?: unknown;
	duration?: number;
	jsx?: unknown;
};

// toasts: toast.getToasts()의 활성 목록(dismiss가 바로 빠진다). jsx(custom) 알림은 갱신하면 종류가 지워져 뺀다.
// held: 우리가 멈춘 알림 id → 멈추기 전 원래 duration. 모달이 열려 있으면 아직 안 멈춘 행동 알림을 멈추고,
// 닫혔으면 멈췄던 알림 중 아직 떠 있는 것을 원래 시간(최소 TOAST_RESUME_MS)으로 다시 흐르게 한다
export function planToastHold<T extends HoldableToast>(
	toasts: readonly T[],
	modalOpen: boolean,
	held: ReadonlyMap<number | string, number | undefined>,
) {
	const live = toasts.filter((t) => !t.jsx);
	return {
		freeze: modalOpen
			? live.filter((t) => t.action && t.duration !== Number.POSITIVE_INFINITY)
			: [],
		release: modalOpen
			? []
			: live
					.filter((t) => held.has(t.id))
					.map((toast) => ({
						toast,
						duration: Math.max(
							held.get(toast.id) ?? TOAST_DEFAULT_MS,
							TOAST_RESUME_MS,
						),
					})),
	};
}

const BAR_BOTTOM = "var(--studio-bar-height, 0px)";

// 아래 간격은 설치본 sonner 2.0.8 기본값(24px·휴대폰 16px)이다. 위 간격은 sonner 기본값과 같은 24px이고, 휴대폰에서 모달이 열린 동안만 72px이다. 휴대폰 상단 막대는 59px(app-nav.tsx 297·315행: 칸 50px + py-1 8px + 아래 선 1px)이라 막대 아래 13px 떨어지고, 오른쪽 시트 닫기 버튼(top-3 + 44px = 56px)과도 겹치지 않는다
export function toastPlacement(modalOpen: boolean) {
	return modalOpen
		? {
				position: "top-center" as const,
				offset: { top: 24, bottom: 24 },
				// 휴대폰은 상단 막대(59px) 아래 8px 이상, 오른쪽 시트의 닫기 버튼(top-3, 44px) 아래로 내린다(72px = 4.5rem)
				mobileOffset: { top: 72, bottom: 16 },
			}
		: {
				position: "bottom-right" as const,
				offset: { top: 24, bottom: `calc(${BAR_BOTTOM} + 24px)` },
				mobileOffset: { top: 16, bottom: `calc(${BAR_BOTTOM} + 16px)` },
			};
}
