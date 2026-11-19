import { cn } from "@tts-pilot-app/ui/lib/utils";
import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	actions,
	flush,
	actionsClassName,
}: {
	title: string;
	description: ReactNode;
	// 설명 아래 조작 묶음(작업실의 채널 고르기·'프리셋', T9 브리프 5.2). 모든 너비에서 같은 자리다. 주지 않으면 T1 모양 그대로다
	actions?: ReactNode;
	// 좌우 여백을 두지 않는다(문단 작업실: 머리가 여백을 가진 격자의 가운데 열 안에 있다, T10 브리프 5.1)
	flush?: boolean;
	// 조작 묶음의 보임 규칙(작업실이 빈 상태에서 휴대폰만 접는다)
	actionsClassName?: string;
}) {
	return (
		<header
			// 머리 위는 지금 값, 머리와 본문 사이는 24px 하나(R2 브리프 2절 2)
			className={cn("pt-6 pb-6 md:pt-11", !flush && "px-4 md:px-11")}
		>
			{/* tabIndex -1: 오류 경계가 제목으로 포커스를 옮길 수 있게(Tab 순서에는 없다). 제목 포커스는 보이지 않아도 된다 */}
			<h1
				tabIndex={-1}
				className="text-balance font-bold text-2xl tracking-tight outline-none md:text-3xl"
			>
				{title}
			</h1>
			<p className="mt-2 max-w-2xl text-muted-foreground text-sm md:text-base">
				{description}
			</p>
			{actions ? (
				<div
					className={cn(
						"mt-4 flex flex-wrap items-center gap-2",
						actionsClassName,
					)}
				>
					{actions}
				</div>
			) : null}
		</header>
	);
}
