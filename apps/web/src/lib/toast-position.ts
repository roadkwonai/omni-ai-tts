import { type ExternalToast, type ToastT, toast } from "sonner";

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

// 알림 자리를 옮기기 전 흐리는 시간(ms). token은 기본 전환 시간 토큰 값(globals.css --default-transition-duration).
// 개발은 "150ms", production CSS 압축은 ".15s"로 내보내 단위를 보고 초면 ms로 바꾼다. 못 읽거나 움직임 줄이기면 0(즉시 옮긴다)
export function toastMoveDelay(token: string, reducedMotion: boolean) {
	if (reducedMotion) return 0;
	const value = Number.parseFloat(token) || 0;
	return token.trim().endsWith("ms") ? value : Math.round(value * 1000);
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
const TOAST_ITEM_SELECTOR = `${TOASTER_SELECTOR} [data-sonner-toast]`;

// 알림 자리를 옮기면 목록이 새로 그려져(아래 AppToaster 주석) 알림 안 포커스가 body로 떨어진다(MG-12).
// 옮기기 전 포커스가 있던 알림의 자리 번호(li data-index, index.mjs 720행. 같은 목록을 옮기므로 번호가 같다)를 읽고, 알림 밖이면 null.
// Alt+T는 목록 <ol> 자체에 포커스를 준다(1111행). 그때는 맨 앞 알림(0번: 새 알림이 앞에 붙고 1047~1050행, 508행 isFront = index 0)으로 본다
export function focusedToastIndex(active: Element | null) {
	if (active?.matches(TOASTER_SELECTOR)) return "0";
	return (
		active?.closest(TOAST_ITEM_SELECTOR)?.getAttribute("data-index") ?? null
	);
}

// 옮긴 뒤 같은 자리 알림의 행동 버튼(data-action, 877행), 없으면 알림 자체. 알림이 사라졌으면 null
export function toastRefocusTarget(
	root: Pick<ParentNode, "querySelector">,
	index: string,
) {
	const item = root.querySelector<HTMLElement>(
		`${TOAST_ITEM_SELECTOR}[data-index="${index}"]`,
	);
	return item?.querySelector<HTMLElement>("[data-action]") ?? item;
}

// 복귀는 다음 프레임에 한다. Base UI는 닫힌 창을 걷을 때 포커스가 body면 연 버튼으로 돌린다(마이크로태스크,
// @base-ui/react floating-ui-react/components/FloatingFocusManager.mjs 480~507행). 움직임 줄이기(지연 0)면 그 걷기가 목록 교체와 같은 커밋이라
// 바로 돌리면 덮인다. 그 사이 사용자가 키를 치거나 눌렀으면 직접 옮겼을 수 있어 건드리지 않는다. 돌려받은 함수로 취소한다
export function refocusToastLater(doc: Document, index: string) {
	let acted = false;
	const act = () => {
		acted = true;
	};
	const events = ["keydown", "pointerdown"] as const;
	for (const type of events) doc.addEventListener(type, act, true);
	const stop = () => {
		cancelAnimationFrame(frame);
		for (const type of events) doc.removeEventListener(type, act, true);
	};
	const frame = requestAnimationFrame(() => {
		stop();
		if (!acted) toastRefocusTarget(doc, index)?.focus({ preventScroll: true });
	});
	return stop;
}

const KINDS = ["success", "error", "info", "warning", "loading"] as const;

// 같은 id 갱신. sonner create는 기존 알림에 준 필드만 덮어 행동·설명 등은 남지만(index.mjs 195~215행),
// toast()·message는 종류를 지우므로(252행 type: undefined) 원래 종류 함수로 부른다
export function updateToast(
	t: ToastT,
	data: Pick<ExternalToast, "duration" | "description">,
) {
	const kind = KINDS.find((k) => k === t.type);
	(kind ? toast[kind] : toast.message)(t.title, { id: t.id, ...data });
}

// 모달 중 이동 행동을 눌러 설명을 안내로 바꾼 알림(modal-action unlessModal) id → 원래 설명(MG-12).
// 바꾸는 쪽(드라마 알림)과 되돌리는 쪽(전역 AppToaster)이 이 모듈만 함께 가져와 여기 둔다. 알림 상태가 sonner 모듈 하나에 있는 것과 같다
export const hintedToasts = new Map<number | string, ToastT["description"]>();

// 모달이 닫히면 활성 알림(toast.getToasts) 가운데 안내로 바꾼 것의 설명을 되돌린다(원래 없었으면 지운다). 이미 닫힌 알림은 건너뛴다
export function restoreHints(live: readonly ToastT[]) {
	for (const t of live)
		if (hintedToasts.has(t.id))
			updateToast(t, { description: hintedToasts.get(t.id) });
	hintedToasts.clear();
}

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

// 아래 간격은 설치본 sonner 2.0.8 기본값(24px·휴대폰 16px)이다. 위 간격은 모달이 열린 동안만 쓰며 데스크톱 8px, 상단 막대가 보이는 폭(767px 이하) 72px이다.
// 8px(MG-11): 가운데 대화상자는 위아래 여백이 같아, 위 간격이 크면 키 큰 창의 제목을 덮는다.
// 알림 자리(MG-14·MG-16): 폭 768px·높이 600px 이상에서 가운데 대화상자는 최대 높이가 100dvh - 2 × --toast-clearance(112px = 8px + 세 줄 알림 약 96px + 여유 8px,
// packages/ui globals.css)라 위 여백이 늘 112px 이상이다. 1280×600에서 최대 376px, 위 여백 112px ≥ 세 줄 알림 끝 104px. 모달 중 안내 알림은 세 줄 이하다(modal-hint-lines.test).
// shortcut: 높이 600px 미만 화면(가로 휴대폰 등, 창 최대 = 화면 높이, dialog.tsx)은 알림이 키 큰 창의 제목을 덮을 수 있다(그 높이에선 알림 자리를 빼면 폼 창이 들어가지 않는다), 그런 화면이 흔해지면 모달 중 알림을 창 아래로 옮기는 것을 검토한다.
// 72px: 상단 막대는 59px(app-nav.tsx 297·315행: 칸 50px + py-1 8px + 아래 선 1px)이라 막대 아래 13px 떨어지고, 오른쪽 시트 닫기 버튼(top-3 + 44px = 56px)과도 겹치지 않는다.
// sonner의 mobileOffset은 600px 이하에서만 쓰여(index.mjs 457행 @media (max-width:600px)) 601~767px은 offset으로 같은 72px을 준다(MG-12)
export function toastPlacement(modalOpen: boolean, topBar: boolean) {
	return modalOpen
		? {
				position: "top-center" as const,
				offset: { top: topBar ? 72 : 8, bottom: 24 },
				mobileOffset: { top: 72, bottom: 16 },
			}
		: {
				position: "bottom-right" as const,
				offset: { top: 24, bottom: `calc(${BAR_BOTTOM} + 24px)` },
				mobileOffset: { top: 16, bottom: `calc(${BAR_BOTTOM} + 16px)` },
			};
}
