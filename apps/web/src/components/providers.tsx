"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@tts-pilot-app/ui/components/sonner";
import { useEffect, useState } from "react";

import { MODAL_OPEN_SELECTOR, toastPlacement } from "@/lib/toast-position";
import { getQueryClient } from "@/utils/orpc";

import { ThemeProvider } from "./theme-provider";

// 평소에는 작업실 하단 막대 위(브리프 5.6), 시트·대화상자·알림창이 열려 있는 동안은 화면 위(MG-08).
// 열림 표식(data-open)과 팝업 추가·제거만 본다. 이미 뜬 알림도 같은 Toaster라 위치가 함께 옮겨진다
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
