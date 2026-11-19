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

const BAR_BOTTOM = "var(--studio-bar-height, 0px)";

// 아래 간격은 설치본 sonner 2.0.8 기본값(24px·휴대폰 16px)이다. 위 간격은 sonner 기본값과 같은 24px이고, 휴대폰에서 모달이 열린 동안만 64px(오른쪽 시트 닫기 버튼·상단 막대 아래)이다
export function toastPlacement(modalOpen: boolean) {
	return modalOpen
		? {
				position: "top-center" as const,
				offset: { top: 24, bottom: 24 },
				// 휴대폰은 오른쪽 시트의 닫기 버튼(top-3, 44px)과 상단 막대 아래로 내린다(4rem)
				mobileOffset: { top: 64, bottom: 16 },
			}
		: {
				position: "bottom-right" as const,
				offset: { top: 24, bottom: `calc(${BAR_BOTTOM} + 24px)` },
				mobileOffset: { top: 16, bottom: `calc(${BAR_BOTTOM} + 16px)` },
			};
}
