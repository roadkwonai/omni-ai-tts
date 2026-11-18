"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import localFont from "next/font/local";

import "../index.css";

// global-error는 루트 layout을 대신해 그려져 전역 스타일·글꼴을 싣지 않는다. layout.tsx와 같은 글꼴 설정을 다시 둔다.
const pretendard = localFont({
	src: "./fonts/PretendardVariable.woff2",
	variable: "--font-pretendard",
	weight: "45 920",
});

// 루트 layout이 세션을 못 읽을 때(DB 멈춤, 스펙 8절) 보이는 화면. retry는 서버 내용을 다시 받아 그려 DB가 돌아오면 회복한다.
export default function GlobalError({
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	return (
		<html lang="ko" className={pretendard.variable}>
			<body className="antialiased">
				<main className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
					<h1 className="break-keep font-bold text-2xl tracking-tight">
						문제가 생겼어요
					</h1>
					<p className="break-keep text-muted-foreground text-sm">
						화면을 그리다 문제가 생겼어요. 다시 시도해 주세요.
					</p>
					<Button size="lg" onClick={() => retry()}>
						다시 시도
					</Button>
				</main>
			</body>
		</html>
	);
}
