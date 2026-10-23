// apps/web/src/components/emotion-palette.tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { TypecastSettings } from "@tts-pilot-app/api/providers/trial-options";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { Check } from "lucide-react";
import { type RefObject, useId } from "react";

import {
	EMOTION_NOTE,
	type EmotionValue,
	emotionBadges,
	emotionPatch,
	pressedEmotion,
	STUDIO_TEXT,
} from "@/lib/studio-view";

// 감정 팔레트(브리프 5.4): '자동'(v30) + 그 성우·모델이 받는 감정을 알약 하나 고르기로. 누르면 카드의 감정 설정이 바뀐다(대본에 글자를 넣지 않는다).
// ToggleGroup은 가로 CompositeRoot라 ←→로 옮기고 Tab 정지는 하나다(Base UI 1.8.0 설치본). 알약마다 툴팁과 숨긴 설명(EMOTION_NOTE),
// 아래 한 줄은 눌린 알약의 설명이다(터치 화면용). 알약이 하나뿐이면 팔레트 대신 한 줄. 성우·모델 때문에 값이 맞춰지면 shift 줄
export function EmotionPalette({
	voice,
	settings,
	shift,
	pressedRef,
	onChange,
}: {
	voice: Voice;
	settings: TypecastSettings;
	shift: string | null;
	// 감정 표식을 누르면 이 알약으로 포커스가 간다
	pressedRef: RefObject<HTMLButtonElement | null>;
	onChange: (patch: Partial<TypecastSettings>) => void;
}) {
	const labelId = useId();
	const noteId = useId();
	const pressed = pressedEmotion(settings);
	const badges = emotionBadges(voice, settings.model);
	return (
		<div className="flex flex-col gap-2">
			<span id={labelId} className="text-sm">
				{STUDIO_TEXT.palette}
			</span>
			{badges.length > 1 ? (
				<>
					<ToggleGroup
						aria-labelledby={labelId}
						value={[pressed]}
						onValueChange={(next) => {
							const value = next[0] as EmotionValue | undefined;
							// 눌린 알약을 다시 눌러 비울 수 없다(감정은 늘 하나다)
							if (value) onChange(emotionPatch(settings.model, value));
						}}
						className="w-full flex-wrap gap-2"
					>
						{badges.map((badge) => (
							<Tooltip key={badge.value}>
								<TooltipTrigger
									ref={badge.value === pressed ? pressedRef : undefined}
									render={
										<Toggle
											value={badge.value}
											aria-describedby={`${noteId}-${badge.value}`}
											className="rounded-full bg-card px-4 text-foreground ring-1 ring-border ring-inset data-pressed:bg-primary-subtle data-pressed:text-primary data-pressed:ring-primary"
										/>
									}
								>
									{/* data-icon을 붙이면 Toggle이 왼쪽 여백을 8px로 줄인다. 알약은 양쪽 16px(브리프 5.4), 크기는 Toggle이 16px로 둔다 */}
									{badge.value === pressed ? (
										<Check aria-hidden="true" />
									) : null}
									{badge.label}
								</TooltipTrigger>
								<TooltipContent>{EMOTION_NOTE[badge.value]}</TooltipContent>
							</Tooltip>
						))}
					</ToggleGroup>
					{/* 알약 설명(aria-describedby). 숨겨도 설명으로 읽히고 훑어 읽기에는 끼지 않는다 */}
					<div hidden>
						{badges.map((badge) => (
							<span key={badge.value} id={`${noteId}-${badge.value}`}>
								{EMOTION_NOTE[badge.value]}
							</span>
						))}
					</div>
					<p className="text-muted-foreground text-sm">
						{EMOTION_NOTE[pressed]}
					</p>
				</>
			) : (
				<p className="text-muted-foreground text-sm">
					{STUDIO_TEXT.emotionFixed}
				</p>
			)}
			{shift ? <p className="text-muted-foreground text-sm">{shift}</p> : null}
		</div>
	);
}
