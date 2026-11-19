import Image from "next/image";

// 심볼 + 글자 로고. 라이트·다크는 글자 색이 달라 두 판을 CSS로 가른다(숨은 판은 받지 않는다).
// eager: 첫 화면 막대 로고는 LCP라 바로 받는다(Next 문서: preload 대신 loading="eager"). 숨은 판도 같이 받는 비용이 있다
export function LandingLogo({
	className,
	eager,
}: {
	className?: string;
	eager?: boolean;
}) {
	const loading = eager ? "eager" : undefined;
	return (
		<>
			<Image
				src="/brand/logo-light.png"
				alt="Omni AI TTS"
				width={1200}
				height={400}
				translate="no"
				sizes="120px"
				loading={loading}
				className={`${className} dark:hidden`}
			/>
			<Image
				src="/brand/logo-dark.png"
				alt="Omni AI TTS"
				width={1200}
				height={400}
				translate="no"
				sizes="120px"
				loading={loading}
				className={`${className} hidden dark:block`}
			/>
		</>
	);
}
