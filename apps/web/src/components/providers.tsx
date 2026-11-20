"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@tts-pilot-app/ui/components/sonner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type ToastT, toast, useSonner } from "sonner";

import {
	hasOpenModal,
	MODAL_OPEN_SELECTOR,
	MODAL_TITLE_SELECTOR,
	planToastHold,
	shouldReturnFocusToModal,
	TOASTER_SELECTOR,
	toastMoveDelay,
	toastPlacement,
} from "@/lib/toast-position";
import { getQueryClient } from "@/utils/orpc";

import { ThemeProvider } from "./theme-provider";

const KINDS = ["success", "error", "info", "warning", "loading"] as const;

// 같은 id로 duration만 바꾼다. toast()는 종류를 지우므로(sonner index.mjs 249~256행) 원래 종류 함수로 부른다
function retime(t: ToastT, duration: number) {
	const kind = KINDS.find((k) => k === t.type);
	(kind ? toast[kind] : toast)(t.title, { id: t.id, duration });
}

// 평소에는 작업실 하단 막대 위(브리프 5.6), 시트·대화상자·알림창이 열려 있는 동안은 화면 위(MG-08).
// 열림 표식(data-open)과 팝업 추가·제거만 본다. 이미 뜬 알림도 같은 Toaster라 위치가 함께 옮겨진다.
// 같은 모달 신호로 행동 알림(action이 있는 것)만 시간을 멈춘다. 단순 안내까지 붙잡아 두면 쌓이기만 한다
function AppToaster() {
	const [modalOpen, setModalOpen] = useState(false);
	// 같은 효과에서 모달 알림 뒤 포커스 복귀도 한다(MG-10). 알림에서 행동·닫힘으로 포커스가 나갈 때 sonner가 알림 진입 전 요소(모달 밖 배경)로 돌려놓거나,
	// 알림이 DOM에서 사라져 포커스가 body로 떨어지면 열린 모달 안으로 되돌린다. 순서: 모달 안에서 마지막으로 포커스했던 요소(아직 연결돼 있으면), 없으면 가장 위 모달의 제목.
	// 제목은 tabIndex가 없을 때만 -1을 주어 프로그램 포커스만 받게 한다(MG-07과 같다)
	useEffect(() => {
		let fromToaster = false;
		let lastInModal: HTMLElement | null = null;
		const restore = () => {
			const popups =
				document.body.querySelectorAll<HTMLElement>(MODAL_OPEN_SELECTOR);
			const popup = popups[popups.length - 1];
			const heading =
				popup?.querySelector<HTMLElement>(MODAL_TITLE_SELECTOR) ?? popup;
			const back =
				lastInModal?.isConnected && popup?.contains(lastInModal)
					? lastInModal
					: heading;
			if (back && !back.hasAttribute("tabindex") && back === heading)
				back.setAttribute("tabindex", "-1");
			fromToaster = false;
			back?.focus({ preventScroll: true });
		};
		// 알림에서 온 포커스가 모달·알림 밖이거나(target이 null이면 body로 떨어진 것) 이미 그런 상태면 복귀한다
		const check = (target: Element | null) =>
			shouldReturnFocusToModal({
				fromToaster,
				modalOpen: hasOpenModal(document.body),
				inModal: target?.closest(MODAL_OPEN_SELECTOR) != null,
				inToaster: target?.closest(TOASTER_SELECTOR) != null,
			});
		const onFocusIn = (event: FocusEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			if (check(target)) return restore();
			if (target?.closest(TOASTER_SELECTOR)) fromToaster = true;
			else {
				fromToaster = false;
				if (
					target instanceof HTMLElement &&
					target.closest(MODAL_OPEN_SELECTOR)
				)
					lastInModal = target;
			}
		};
		const sync = () => {
			setModalOpen(hasOpenModal(document.body));
			// 알림이 사라져 focusin 없이 body로 떨어진 경우
			const active = document.activeElement;
			if (active === document.body && check(null)) restore();
		};
		const observer = new MutationObserver(sync);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-open"],
		});
		document.addEventListener("focusin", onFocusIn);
		sync();
		return () => {
			observer.disconnect();
			document.removeEventListener("focusin", onFocusIn);
		};
	}, []);

	// 모달이 열린 동안 행동 알림의 시간을 멈추고, 닫히면 다시 흐르게 한다(MG-09).
	// 키보드 사용자가 모달을 닫은 뒤 Alt+T로 알림에 닿아 '되돌리기'를 누를 수 있게 한다
	const { toasts } = useSonner();
	const held = useRef(new Map<number | string, number | undefined>());
	// biome-ignore lint/correctness/useExhaustiveDependencies: toasts는 목록이 바뀔 때 다시 돌리는 신호다
	useEffect(() => {
		// toasts는 다시 그리기 신호일 뿐이다. useSonner 목록은 dismiss 반영이 늦어(index.mjs 941~950행)
		// 막 닫은 알림을 되살릴 수 있으니 계획 입력은 활성 목록(toast.getToasts, dismiss 즉시 빠짐)에서 읽는다
		const { freeze, release } = planToastHold(
			toast.getToasts() as ToastT[],
			modalOpen,
			held.current,
		);
		for (const t of freeze) {
			held.current.set(t.id, t.duration);
			retime(t, Number.POSITIVE_INFINITY);
		}
		for (const { toast: t, duration } of release) retime(t, duration);
		if (!modalOpen) held.current.clear();
	}, [toasts, modalOpen]);

	// 알림 자리(위·아래)는 모달 신호를 늦게 따른다(MG-11). sonner는 자리마다 목록 <ol>을 key={position}으로 그려(index.mjs 1150~1155행)
	// 자리가 바뀌면 옛 목록이 바로 사라지고 새 목록의 알림이 다시 들어온다(Toast mounted 진입, 570행·CSS [data-mounted=true]).
	// 옛 자리에서 기본 전환 시간(150ms 토큰)만큼 흐린 뒤 옮긴다. 움직임 줄이기면 그리기 전에 바로 옮긴다(layout effect)
	const [placedOpen, setPlacedOpen] = useState(false);
	const moving = placedOpen !== modalOpen;
	useLayoutEffect(() => {
		if (!moving) return;
		const delay = toastMoveDelay(
			getComputedStyle(document.documentElement).getPropertyValue(
				"--default-transition-duration",
			),
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		);
		if (delay === 0) {
			setPlacedOpen(modalOpen);
			return;
		}
		const timer = window.setTimeout(() => setPlacedOpen(modalOpen), delay);
		return () => window.clearTimeout(timer);
	}, [moving, modalOpen]);
	return (
		<Toaster
			richColors
			{...toastPlacement(placedOpen)}
			// 래퍼가 기본 클래스(toaster group)와 합친다. sonner CSS가 레이어 밖에서 목록 transition을 정해(index.mjs 457행 [data-sonner-toaster]{transition:transform .4s ease}) 중요도(!)로 덮는다
			className={cn(
				"transition-opacity!",
				moving && "pointer-events-none opacity-0",
			)}
		/>
	);
}

export default function Providers({ children }: { children: React.ReactNode }) {
	const queryClient = getQueryClient();

	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			<AppToaster />
		</ThemeProvider>
	);
}
