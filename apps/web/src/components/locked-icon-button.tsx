// apps/web/src/components/locked-icon-button.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { type ReactNode, useId } from "react";
import { toast } from "sonner";

// 잠길 수 있는 아이콘 단추(ghost 아이콘 44px, 툴팁). reason이 있으면 잠긴다: 이유를 aria-describedby와 툴팁에 잇고(잠겨도 포커스는 받는다),
// 누르면 토스트로 같은 이유를 말한다(터치에도 보인다). 잠겨도 가리키면 툴팁이 뜨게 pointer-events를 막지 않는다(드라마 화자 빼기와 같은 방식).
// tip은 풀렸을 때 툴팁 글(없으면 label)
export function LockedIconButton({
	label,
	tip,
	reason,
	onClick,
	children,
}: {
	label: string;
	tip?: string;
	reason?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	const reasonId = useId();
	const locked = Boolean(reason);
	return (
		<>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={label}
							aria-disabled={locked || undefined}
							aria-describedby={locked ? reasonId : undefined}
							className="text-muted-foreground hover:text-foreground focus-visible:text-foreground aria-disabled:opacity-50"
							onClick={() => (locked ? toast(reason) : onClick())}
						/>
					}
				>
					{children}
				</TooltipTrigger>
				<TooltipContent>{reason ?? tip ?? label}</TooltipContent>
			</Tooltip>
			{locked ? (
				<span id={reasonId} hidden>
					{reason}
				</span>
			) : null}
		</>
	);
}
