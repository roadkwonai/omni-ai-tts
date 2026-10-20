// apps/web/src/components/studio-card.tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	STUDIO_TEXT_MAX,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { sameSettings } from "@/lib/preset-view";
import {
	countText,
	EMOTION_NOTE,
	type EmotionValue,
	emotionBadges,
	emotionMark,
	emotionPatch,
	emotionShift,
	pressedEmotion,
	STUDIO_TEXT,
	scriptCount,
	studioRequestOf,
} from "@/lib/studio-view";

import { fieldClass } from "./class-form-dialog";
import { Options } from "./setting-fields";
import { useScript, useStudio } from "./studio-provider";
import { VoicePicker } from "./studio-voice-dialog";
import { lockedButton, ReloadButton } from "./voice-problem";

// 감정 팔레트(브리프 5.4): '자동'(v30) + 그 성우·모델이 받는 감정을 알약 하나 고르기로. 누르면 카드의 감정 설정이 바뀐다(대본에 글자를 넣지 않는다).
// ToggleGroup은 가로 CompositeRoot라 ←→로 옮기고 Tab 정지는 하나다(Base UI 1.8.0 설치본). 알약마다 툴팁과 숨긴 설명(EMOTION_NOTE),
// 아래 한 줄은 눌린 알약의 설명이다(터치 화면용). 알약이 하나뿐이면 팔레트 대신 한 줄. 성우·모델 때문에 값이 맞춰지면 shift 줄
function EmotionPalette({
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

// 대본 칸(브리프 5.3). 이 컴포넌트만 대본을 읽는다(카드·옵션은 글자마다 다시 그리지 않는다, tasks/lessons.md T7.5).
// 2,000자를 넘어도 입력은 막지 않는다(붙여 넣은 글이 잘리지 않게). 생성만 막대가 막는다.
// 768px 이상은 448px까지 늘고 칸 안에서 스크롤, 767px 이하는 내용대로 늘어난다(DN-4)
function ScriptField() {
	const { text, setText } = useScript();
	const id = useId();
	const countId = useId();
	const over = scriptCount(text) > STUDIO_TEXT_MAX;
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="sr-only">
				{STUDIO_TEXT.scriptLabel}
			</label>
			<Textarea
				id={id}
				name="studio-script"
				autoComplete="off"
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={STUDIO_TEXT.scriptPlaceholder}
				aria-describedby={countId}
				aria-invalid={over || undefined}
				className={cn(fieldClass, "min-h-40 md:max-h-112")}
			/>
			<p
				id={countId}
				className={cn(
					"self-end text-sm tabular-nums",
					over ? "text-warning" : "text-muted-foreground",
				)}
			>
				{countText(text)}
			</p>
		</div>
	);
}

// 문단 카드 1장(브리프 5.3). 머리줄: 번호 · 성우 버튼 · 감정 표식(기본값과 다를 때만) · '설정'(펼침).
// 펼치면 Typecast 설정 칸(감정 칸 자리에 팔레트)과 '처음 값으로'. 카드 추가·분할·결합은 P1-04~06이다
export function StudioCard() {
	const studio = useStudio();
	const [open, setOpen] = useState(false);
	const pressedRef = useRef<HTMLButtonElement>(null);
	const headId = useId();
	const settingsId = useId();
	const voice = studio.voice?.voice ?? null;
	// 옵션·표식은 성우 맞춤 뒤 설정만 본다(대본을 읽지 않는다)
	const request = voice ? studioRequestOf(voice, "", studio.settings) : null;
	const mark = request ? emotionMark(request.settings) : null;
	// 저장 값은 그대로 두고, 이 성우·모델에서 실제로 쓰는 감정이 다르면 알린다
	const shift = request
		? emotionShift(studio.settings.typecast, request.settings)
		: null;
	// 처음 값과 다르거나 불러온 프리셋이 있으면 '처음 값으로'가 켜진다(T5·T8과 같다)
	const changed =
		!sameSettings(
			"typecast",
			studio.settings.typecast,
			DEFAULT_SETTINGS.typecast,
		) || studio.presetHost.loaded !== null;
	return (
		<section
			aria-labelledby={headId}
			className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:p-5"
		>
			<div className="flex flex-wrap items-center gap-2">
				{/* 위계는 성우 버튼에 준다(D14). 화면 낭독기는 숨은 제목 '문단 1'을 읽는다 */}
				<h2
					id={headId}
					className="font-bold text-muted-foreground text-sm tabular-nums"
				>
					<span aria-hidden="true">1</span>
					<span className="sr-only">{STUDIO_TEXT.paragraph}</span>
				</h2>
				<VoicePicker />
				{mark ? (
					// 설정을 펴고 팔레트의 눌린 알약으로 간다(DN-2)
					<Button
						variant="ghost"
						size="lg"
						aria-label={`${STUDIO_TEXT.palette} · ${mark} ${STUDIO_TEXT.markAction}`}
						className="font-normal text-muted-foreground"
						onClick={() => {
							flushSync(() => setOpen(true));
							pressedRef.current?.focus();
						}}
					>
						{STUDIO_TEXT.palette} ·
						<span className="font-bold text-foreground">{mark}</span>
					</Button>
				) : null}
				<Button
					variant="ghost"
					size="lg"
					className="ml-auto"
					aria-expanded={open}
					aria-controls={settingsId}
					onClick={() => setOpen((current) => !current)}
				>
					{STUDIO_TEXT.settings}
					<ChevronDown
						data-icon="inline-end"
						aria-hidden="true"
						className={cn(open && "rotate-180")}
					/>
				</Button>
				{/* 늘 그려 두는 화면 밖 알림 칸(글자를 담은 채 새로 붙는 칸은 읽히지 않을 수 있다).
				    프리셋 성우 알림과, 설정 칸이 접혀 있어도 감정 맞춤을 알린다. 보이는 줄에는 role이 없다 */}
				<p role="status" className="sr-only">
					{studio.notice ?? ""}
				</p>
				<p role="status" className="sr-only">
					{shift ?? ""}
				</p>
			</div>
			{studio.notice ? (
				<p className="flex gap-2 text-sm text-warning">
					<TriangleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0"
					/>
					{studio.notice}
				</p>
			) : null}
			{/* 창을 열어야만 오류를 아는 일이 없게 카드에도 둔다(D7). 백그라운드 재조회 실패는 받은 목록을 그대로 쓴다.
			    다시 받는 동안에도 남는다(스피너·aria-busy, 포커스를 쥔 버튼이 사라지지 않게) */}
			{studio.voicesLoad === "failed" ? (
				<div
					aria-busy={studio.voicesFetching || undefined}
					className="flex flex-wrap items-center gap-3"
				>
					<p className="text-sm text-warning">{STUDIO_TEXT.voicesFailed}</p>
					<ReloadButton
						reloading={studio.voicesFetching}
						onReload={studio.reloadVoices}
					/>
				</div>
			) : null}
			{/* 늘 그려 aria-controls가 있는 id를 가리킨다. 접혀 있으면 안을 그리지 않는다 */}
			<div
				id={settingsId}
				hidden={!open}
				className="border-border border-t pt-3"
			>
				{open && voice && request ? (
					<div className="flex flex-col gap-3 md:max-w-md">
						<div key={studio.resetKey} className="flex flex-col gap-3">
							<Options
								voice={voice}
								request={request}
								onChange={studio.setSetting}
								palette={
									<EmotionPalette
										voice={voice}
										settings={request.settings}
										shift={shift}
										pressedRef={pressedRef}
										onChange={studio.setSetting}
									/>
								}
							/>
						</div>
						<Button
							variant="ghost"
							size="lg"
							focusableWhenDisabled
							disabled={!changed}
							className={cn(
								"self-start text-muted-foreground",
								lockedButton(!changed),
							)}
							onClick={studio.resetSettings}
						>
							{STUDIO_TEXT.reset}
						</Button>
					</div>
				) : open ? (
					<p className="text-muted-foreground text-sm">
						{STUDIO_TEXT.settingsNeedVoice}
					</p>
				) : null}
			</div>
			<ScriptField />
		</section>
	);
}
