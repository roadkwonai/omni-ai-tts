import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "../index.css";
import { AppNav } from "@/components/app-nav";
import Providers from "@/components/providers";

// Pretendard v1.3.9 GitHub 릴리스 zip의 web/variable/woff2 (OFL, fonts/Pretendard-LICENSE.txt)
const pretendard = localFont({
	src: "./fonts/PretendardVariable.woff2",
	variable: "--font-pretendard",
	weight: "45 920",
});

export const metadata: Metadata = {
	// 페이지는 제목만 정하고 뒤에 " · TTS Pilot"이 붙는다(WCAG 2.4.2).
	title: { template: "%s · TTS Pilot", default: "TTS Pilot" },
	description:
		"Typecast·ElevenLabs·Fish Audio·Airy·Gemini 성우로 한국어 음성을 만드는 개인 작업실",
};

// 주소창·상태 막대 색. 값은 globals.css의 --background(:root, .dark)와 같다.
export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "oklch(0.976 0.001 286)" },
		{ media: "(prefers-color-scheme: dark)", color: "oklch(0.232 0.006 286)" },
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" className={pretendard.variable} suppressHydrationWarning>
			{/* 브라우저 확장이 수화 전에 body에 넣는 속성(ap-style 등)만 무시한다. 자식은 그대로 검사된다 */}
			<body className="antialiased" suppressHydrationWarning>
				<Providers>
					{/* 앱 틀. 없는 주소 화면(루트 not-found)도 이 안에서 그린다 */}
					<div className="min-h-svh md:flex">
						<a
							href="#main-content"
							className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-card px-4 py-3 outline-ring focus:translate-y-0 focus:outline-2"
						>
							본문으로 건너뛰기
						</a>
						<AppNav />
						<main
							id="main-content"
							tabIndex={-1}
							className="min-w-0 flex-1 outline-none"
						>
							{children}
						</main>
					</div>
				</Providers>
			</body>
		</html>
	);
}
