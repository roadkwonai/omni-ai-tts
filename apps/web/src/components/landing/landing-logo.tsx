import Image from "next/image";

// 심볼 + 글자 로고. 라이트·다크는 글자 색이 달라 두 판을 CSS로 가른다(숨은 판은 받지 않는다).
// 막대 로고는 첫 화면에 보이는 LCP 후보라 loading="eager"·fetchPriority="high"를 준다(없으면 개발 서버가 LCP 경고를 낸다).
// shortcut: 숨은 테마 로고(120px)도 함께 받는다, 로고를 SVG 한 장(currentColor)으로 바꿀 때 없앤다
export function LandingLogo({ className }: { className?: string }) {
	return (
		<>
			<Image
				src="/brand/logo-light.png"
				alt="Omni AI TTS"
				width={1200}
				height={400}
				translate="no"
				sizes="120px"
				loading="eager"
				fetchPriority="high"
				className={`${className} dark:hidden`}
			/>
			<Image
				src="/brand/logo-dark.png"
				alt="Omni AI TTS"
				width={1200}
				height={400}
				translate="no"
				sizes="120px"
				loading="eager"
				fetchPriority="high"
				className={`${className} hidden dark:block`}
			/>
		</>
	);
}
