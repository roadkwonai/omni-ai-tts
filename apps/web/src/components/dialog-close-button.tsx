// apps/web/src/components/dialog-close-button.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { DialogClose } from "@tts-pilot-app/ui/components/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { X } from "lucide-react";
import type { Ref } from "react";

// 창 오른쪽 위 '닫기'(44px ghost 아이콘 + 툴팁, 접근 이름과 툴팁이 같은 글). 창 머리는 이 자리(44px + 12px)만큼 오른쪽을 비운다.
// ref는 창을 열 때 포커스를 받을 자리가 필요한 창만 넘긴다(drama-voice-dialog 목록 받는 중)
export function DialogCloseButton({
	label,
	ref,
}: {
	label: string;
	ref?: Ref<HTMLButtonElement>;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<DialogClose
						render={
							<Button
								ref={ref}
								variant="ghost"
								size="icon-lg"
								aria-label={label}
								className="absolute top-3 right-3"
							/>
						}
					/>
				}
			>
				<X aria-hidden="true" />
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
