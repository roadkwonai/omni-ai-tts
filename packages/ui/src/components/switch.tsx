"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@tts-pilot-app/ui/lib/utils";

function Switch({
	className,
	size = "default",
	...props
}: SwitchPrimitive.Root.Props & {
	size?: "sm" | "default";
}) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				"peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent px-0.5 outline-none transition-colors after:absolute after:-inset-x-3 after:-inset-y-3.5 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 data-[size=default]:h-5 data-[size=sm]:h-4 data-[size=default]:w-9 data-[size=sm]:w-7 data-disabled:cursor-not-allowed data-checked:bg-foreground data-unchecked:bg-input data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block rounded-full bg-background ring-0 transition-transform data-unchecked:translate-x-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-3.5 group-data-[size=sm]/switch:data-checked:translate-x-2.5"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
