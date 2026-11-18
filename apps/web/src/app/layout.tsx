import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "../index.css";
import { AppNav } from "@/components/app-nav";
import Providers from "@/components/providers";
import { getOwnerSession } from "@/context";

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

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	// 세션을 못 읽으면(DB 멈춤) 던지고 global-error가 받는다. 같은 요청의 (app)/layout·page와 React cache로 한 번만 읽는다.
	const owner = await getOwnerSession();
	return (
		<html lang="ko" className={pretendard.variable} suppressHydrationWarning>
			{/* 브라우저 확장이 수화 전에 body에 넣는 속성(ap-style 등)만 무시한다. 자식은 그대로 검사된다 */}
			<body className="antialiased" suppressHydrationWarning>
				<Providers>
					{owner.state === "owner" ? (
						// 앱 틀. 없는 주소 화면(루트 not-found)도 소유자에게는 이 안에서 그린다
						<div className="min-h-svh md:flex">
							<a
								href="#main-content"
								className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-card px-4 py-3 outline-ring focus:translate-y-0 focus:outline-2"
							>
								본문으로 건너뛰기
							</a>
							<AppNav email={owner.email} />
							<main
								id="main-content"
								tabIndex={-1}
								className="min-w-0 flex-1 outline-none"
							>
								{children}
							</main>
						</div>
					) : (
						// 로그인·접근 권한 없음 판: 메뉴 없이 본문만
						<main id="main-content" tabIndex={-1} className="outline-none">
							{children}
						</main>
					)}
				</Providers>
			</body>
		</html>
	);
}
