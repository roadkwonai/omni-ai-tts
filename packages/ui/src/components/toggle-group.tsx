"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";

// 칸은 ui/toggle의 Toggle을 그대로 넣는다(Base UI Toggle이 그룹 컨텍스트를 읽는다). 칸 사이는 4px
function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
	return (
		<ToggleGroupPrimitive
			data-slot="toggle-group"
			className={cn("flex w-fit items-center gap-1 rounded-lg", className)}
			{...props}
		/>
	);
}

export { ToggleGroup };
