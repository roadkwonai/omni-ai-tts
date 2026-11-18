import Image from "next/image";

// 심볼 + 글자 로고. 라이트·다크는 글자 색이 달라 두 판을 CSS로 가른다(숨은 판은 받지 않는다).
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
				className={`${className} dark:hidden`}
			/>
			<Image
				src="/brand/logo-dark.png"
				alt="Omni AI TTS"
				width={1200}
				height={400}
				translate="no"
				sizes="120px"
				className={`${className} hidden dark:block`}
			/>
		</>
	);
}
