"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@tts-pilot-app/ui/components/sonner";

import { getQueryClient } from "@/utils/orpc";

import { ThemeProvider } from "./theme-provider";

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
			{/* 작업실 하단 막대 위에 뜬다(브리프 5.6). 아래 간격은 설치본 sonner 2.0.8 기본값(24px·휴대폰 16px)이고, 변수가 없는 화면은 그대로다 */}
			<Toaster
				richColors
				offset={{ bottom: "calc(var(--studio-bar-height, 0px) + 24px)" }}
				mobileOffset={{ bottom: "calc(var(--studio-bar-height, 0px) + 16px)" }}
			/>
		</ThemeProvider>
	);
}
