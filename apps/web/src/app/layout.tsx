import type { Metadata } from "next";
import localFont from "next/font/local";

import "../index.css";
import Providers from "@/components/providers";

// Pretendard v1.3.9 GitHub 릴리스 zip의 web/variable/woff2 (OFL, fonts/Pretendard-LICENSE.txt)
const pretendard = localFont({
	src: "./fonts/PretendardVariable.woff2",
	variable: "--font-pretendard",
	weight: "45 920",
});

export const metadata: Metadata = {
	title: "TTS Pilot",
	description:
		"Typecast·ElevenLabs·Fish Audio 성우로 한국어 음성을 만드는 개인 작업실",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" className={pretendard.variable} suppressHydrationWarning>
			<body className="antialiased">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
