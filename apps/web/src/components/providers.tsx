"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@tts-pilot-app/ui/components/sonner";
import { useEffect, useRef, useState } from "react";
import { type ToastT, toast, useSonner } from "sonner";

import {
	MODAL_OPEN_SELECTOR,
	planToastHold,
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
	useEffect(() => {
		const sync = () =>
			setModalOpen(document.body.querySelector(MODAL_OPEN_SELECTOR) !== null);
		const observer = new MutationObserver(sync);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-open"],
		});
		sync();
		return () => observer.disconnect();
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
	return <Toaster richColors {...toastPlacement(modalOpen)} />;
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
