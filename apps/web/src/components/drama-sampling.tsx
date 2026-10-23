// apps/web/src/components/drama-sampling.tsx
"use client";

import { DRAMA_SETTINGS } from "@tts-pilot-app/api/drama-script";
import {
	RANGES,
	type Range,
	snap,
} from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import { Slider } from "@tts-pilot-app/ui/components/slider";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { useId, useRef } from "react";

import { DRAMA_TEXT, samplingText } from "@/lib/drama-view";
import { valueText } from "@/lib/trial-view";

import { DialogCloseButton } from "./dialog-close-button";
import { useDrama } from "./drama-provider";
import { lockedButton } from "./voice-problem";

// 샘플링 창의 슬라이더 한 줄: 이름표와 지금 값(처음 값이 아니면 굵게), 조작 줄 44px, 아래 회색 도움(있으면)
function SliderRow({
	label,
	field,
	value,
	range,
	note,
	onChange,
}: {
	label: string;
	field: "temperature" | "speed";
	value: number;
	range: Range;
	note?: string;
	onChange: (value: number) => void;
}) {
	const id = useId();
	const noteId = useId();
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between text-sm">
				<span id={id}>{label}</span>
				<span
					className={cn("tabular-nums", value !== range.default && "font-bold")}
				>
					{valueText(field, value)}
				</span>
			</div>
			<Slider
				aria-labelledby={id}
				aria-describedby={note ? noteId : undefined}
				getAriaValueText={(_formatted, next) => valueText(field, next)}
				className="min-h-11"
				min={range.min}
				max={range.max}
				step={range.step}
				value={value}
				onValueChange={(next) =>
					onChange(
						snap(
							Array.isArray(next) ? (next[0] ?? value) : (next as number),
							range,
						),
					)
				}
			/>
			{note ? (
				<p id={noteId} className="text-muted-foreground text-sm">
					{note}
				</p>
			) : null}
		</div>
	);
}

// '샘플링' 버튼과 창(브리프 5.8, D12-2: 띄우는 칸 프리미티브가 없어 Dialog. 767px 이하 아래 시트, 768px 이상 가운데 md:max-w-sm).
// 바꾸면 바로 적용하고 저장 버튼은 없다. 열면 첫 슬라이더, 닫으면 이 버튼으로(DialogTrigger 기본)
export function Sampling() {
	const drama = useDrama();
	const { settings } = drama;
	const fieldsRef = useRef<HTMLDivElement>(null);
	const initial =
		settings.speed === DRAMA_SETTINGS.speed &&
		settings.temperature === DRAMA_SETTINGS.temperature;
	return (
		<Dialog>
			<DialogTrigger
				render={
					<Button
						variant="outline"
						size="lg"
						aria-label={DRAMA_TEXT.samplingLabel(settings)}
					/>
				}
			>
				{/* 767px 이하는 '샘플링'만, 768px 이상은 처음 값이 아닌 값을 붙인다 */}
				<span className="md:hidden">{DRAMA_TEXT.sampling}</span>
				<span className="max-md:hidden">{samplingText(settings)}</span>
			</DialogTrigger>
			<DialogContent
				initialFocus={() =>
					fieldsRef.current?.querySelector<HTMLElement>(
						'input[type="range"]',
					) ?? true
				}
				className="md:max-w-sm"
			>
				{/* 오른쪽 위 '닫기'(44px + 12px)와 제목이 겹치지 않게 오른쪽을 비운다 */}
				<DialogHeader className="pr-12">
					<DialogTitle>{DRAMA_TEXT.sampling}</DialogTitle>
					<DialogDescription>
						{DRAMA_TEXT.samplingDescription}
					</DialogDescription>
				</DialogHeader>
				<div ref={fieldsRef} className="flex flex-col gap-4">
					<SliderRow
						label={DRAMA_TEXT.temperature}
						field="temperature"
						value={settings.temperature}
						range={RANGES.fish_audio.temperature}
						note={DRAMA_TEXT.temperatureNote}
						onChange={(temperature) =>
							drama.setSettings({ ...settings, temperature })
						}
					/>
					<SliderRow
						label={DRAMA_TEXT.speed}
						field="speed"
						value={settings.speed}
						range={RANGES.fish_audio.speed}
						onChange={(speed) => drama.setSettings({ ...settings, speed })}
					/>
				</div>
				<Button
					variant="ghost"
					size="lg"
					focusableWhenDisabled
					disabled={initial}
					className={cn("justify-self-start", lockedButton(true))}
					onClick={() => drama.setSettings({ ...DRAMA_SETTINGS })}
				>
					{DRAMA_TEXT.reset}
				</Button>
				<DialogCloseButton label={DRAMA_TEXT.close} />
			</DialogContent>
		</Dialog>
	);
}
