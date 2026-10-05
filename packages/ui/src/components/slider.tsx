"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@tts-pilot-app/ui/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	getAriaValueText,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledBy,
	"aria-describedby": ariaDescribedBy,
	...props
}: SliderPrimitive.Root.Props &
	Pick<SliderPrimitive.Thumb.Props, "getAriaValueText">) {
	const actual = value ?? defaultValue ?? min;
	const values = Array.isArray(actual) ? actual : [actual];

	return (
		<SliderPrimitive.Root
			className={cn("data-vertical:h-full data-horizontal:w-full", className)}
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			thumbAlignment="edge"
			{...props}
		>
			<SliderPrimitive.Control className="relative flex min-h-11 w-full touch-none select-none items-center data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col data-disabled:opacity-50">
				<SliderPrimitive.Track
					data-slot="slider-track"
					className="relative grow select-none overflow-hidden rounded-full bg-muted data-horizontal:h-1 data-vertical:h-full data-horizontal:w-full data-vertical:w-1"
				>
					<SliderPrimitive.Indicator
						data-slot="slider-range"
						className="select-none bg-foreground data-horizontal:h-full data-vertical:w-full"
					/>
				</SliderPrimitive.Track>
				{values.map((_, index) => (
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						key={index}
						index={index}
						getAriaValueText={getAriaValueText}
						aria-label={ariaLabel}
						aria-labelledby={ariaLabelledBy}
						aria-describedby={ariaDescribedBy}
						className="relative block size-4 shrink-0 select-none rounded-full border border-foreground bg-background transition-colors after:absolute after:-inset-3.5 hover:ring-1 active:ring-1 disabled:pointer-events-none disabled:opacity-50 has-focus-visible:outline-hidden has-focus-visible:ring-2 has-focus-visible:ring-ring"
					/>
				))}
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };
