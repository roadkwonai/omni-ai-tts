import { cn } from "@tts-pilot-app/ui/lib/utils";
import type { ReactNode } from "react";

// 섹션 틀: 위아래 간격 64·80px(토큰 section), 안쪽 폭 max-w-5xl. 막대에 가리지 않는 건 landing.css의 scroll-padding-top이고,
// tabIndex -1은 휴대폰 메뉴 링크로 온 뒤 포커스를 이 섹션으로 옮기기 위해서다(링 없음, 키보드 순서에는 끼지 않는다).
// 합성: <Section id labelledBy> 안에 <SectionHeading id>와 내용을 둔다(불리언 prop 없음).
// sectionClassName은 바깥 section(배경 교차: 기본 background, bg-card로 한 칸씩 번갈아 칠한다, 브리프 3절 리듬)
export function Section({
	id,
	labelledBy,
	sectionClassName,
	children,
}: {
	id?: string;
	labelledBy: string;
	sectionClassName?: string;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			aria-labelledby={labelledBy}
			tabIndex={-1}
			className={cn(
				"py-section outline-none md:py-section-lg",
				sectionClassName,
			)}
		>
			<div className="mx-auto max-w-5xl px-4 md:px-8">{children}</div>
		</section>
	);
}

export function SectionHeading({
	id,
	className,
	children,
}: {
	id: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<h2
			id={id}
			className={cn(
				"text-balance break-keep font-bold text-3xl tracking-tight md:text-4xl",
				className,
			)}
		>
			{children}
		</h2>
	);
}
