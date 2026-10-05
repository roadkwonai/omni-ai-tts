"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "@tts-pilot-app/ui/lib/utils";

// 고른 상태는 Base UI의 data-pressed 하나로만 칠한다(쓰는 쪽이 data-pressed:*로 덮어쓸 수 있게). 터치 높이 44px(min-h-11).
// ToggleGroup 안에 두면 Base UI Toggle이 그룹 값을 스스로 읽는다(useToggleGroupContext)
function Toggle({ className, ...props }: TogglePrimitive.Props) {
	return (
		<TogglePrimitive
			data-slot="toggle"
			className={cn(
				"inline-flex min-h-11 min-w-11 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2.5 font-normal text-sm outline-offset-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 data-pressed:bg-muted data-pressed:font-bold [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

export { Toggle };
