import type { Metadata, Viewport } from "next";

// 글꼴(Pretendard 동적 서브셋)은 index.css가 부르는 fonts.css의 @font-face로 싣는다.
import "../index.css";
import Providers from "@/components/providers";

export const metadata: Metadata = {
	// 페이지는 제목만 정하고 뒤에 " · Omni AI TTS"가 붙는다(WCAG 2.4.2).
	title: { template: "%s · Omni AI TTS", default: "Omni AI TTS" },
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

// html·body·Providers만 그린다. 앱 틀(메뉴·main)은 (app)/layout, 소개 페이지·로그인·없는 주소는 각자 main을 둔다.
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" suppressHydrationWarning>
			{/* 브라우저 확장이 수화 전에 body에 넣는 속성(ap-style 등)만 무시한다. 자식은 그대로 검사된다 */}
			<body className="antialiased" suppressHydrationWarning>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
