import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description: ReactNode;
	// 설명 아래 조작 묶음(작업실의 채널 고르기·'프리셋', T9 브리프 5.2). 모든 너비에서 같은 자리다. 주지 않으면 T1 모양 그대로다
	actions?: ReactNode;
}) {
	return (
		<header className="px-4 pt-6 pb-5 md:px-11 md:pt-11 md:pb-8">
			{/* tabIndex -1: 오류 경계가 제목으로 포커스를 옮길 수 있게(Tab 순서에는 없다). 제목 포커스는 보이지 않아도 된다 */}
			<h1
				tabIndex={-1}
				className="text-balance font-bold text-2xl tracking-tight outline-none md:text-3xl"
			>
				{title}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm md:text-base">
				{description}
			</p>
			{actions ? (
				<div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
			) : null}
		</header>
	);
}
