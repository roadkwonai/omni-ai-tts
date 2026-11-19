"use client";

import { Button } from "@tts-pilot-app/ui/components/button";

import { ThemeProvider } from "../components/theme-provider";

// global-error는 루트 layout을 대신해 그려진다. index.css(글꼴 @font-face 포함)를 직접 불러온다.
import "../index.css";

// 루트 layout이 세션을 못 읽을 때(DB 멈춤, 스펙 8절) 보이는 화면. retry는 서버 내용을 다시 받아 그려 DB가 돌아오면 회복한다.
export default function GlobalError({
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	return (
		<html lang="ko" suppressHydrationWarning>
			<body className="antialiased" suppressHydrationWarning>
				{/* 루트 layout의 Providers 밖이라 같은 설정으로 다시 감싼다. 저장된 테마를 html class로 입힌다 */}
				{/* providers.tsx와 같은 값(함께 바꾼다) */}
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
						<h1 className="text-balance break-keep font-bold text-2xl tracking-tight">
							문제가 생겼어요
						</h1>
						<p className="break-keep text-muted-foreground text-sm">
							화면을 그리다 문제가 생겼어요. 다시 시도해 주세요.
						</p>
						<Button size="lg" onClick={() => retry()}>
							다시 시도
						</Button>
					</main>
				</ThemeProvider>
			</body>
		</html>
	);
}
