// apps/web/src/components/drama-toolbar.tsx
"use client";

import {
	ACTING,
	type ActingFamily,
	TYPECAST_INTENSITIES,
} from "@tts-pilot-app/api/drama-acting";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";

import {
	DRAMA_TEXT,
	type DraftLine,
	feelPatch,
	newSpeaker,
	shownFeel,
	speakerValue,
	voiceOfSpeaker,
} from "@/lib/drama-view";
import { TAG_TEXT } from "@/lib/tag-view";

import { useDrama, useLines } from "./drama-provider";
import { TAG_ROW, type TagGroup, type TagKind, TagTools } from "./tag-tools";
import { lockedButton } from "./voice-problem";

// 연기 지시 도구줄(브리프 17절 6, 스펙 17.2 '연기 지시'). 대상 줄(마지막으로 포커스한 줄) 하나의 li 안, 대사 아래 drama-line-tools 칸에
// 그 줄 화자 family의 값만 놓는다. 태그 family는 공용 태그 도구줄(tag-tools, Drama 3은 끝에 '지시 쓰는 법'), Typecast는 강도 칩,
// 넣을 것이 없으면 noTags 글이다. 뱃지는 무채색 하나이고(색은 화자만 말한다, 브리프 3절) 넣는 곳은 useLines().applyBadge다.
// 감정·말투는 지시 자리의 감정 메뉴가 맡는다

type Lines = ReturnType<typeof useLines>;

// 화자 하나의 연기 family·받는 감정(actingOf)과 감정 칸이 보일 값의 재료(성우·설정). 줄 칸과 도구줄이 함께 쓴다
export function castOf(drama: ReturnType<typeof useDrama>, index: number) {
	const speaker = drama.speakers[index] ?? newSpeaker("");
	return {
		...drama.actingOf(index),
		voice: voiceOfSpeaker(speaker, drama.savedVoices),
		value: speakerValue(speaker, drama.presets),
	};
}
type Cast = ReturnType<typeof castOf>;
type Shown = NonNullable<ReturnType<typeof shownFeel>>;
// 대상 줄 도구줄(role="toolbar", 넣을 것이 없으면 noTags 글)의 id. 줄 메뉴 '연기 지시 넣기'가 찾는다
const dramaToolbarId = (line: string) => `drama-tools-${line}`;

// 그 family의 태그 묶음(소리 → 범위 → 분위기, 빈 묶음은 뺀다). 감정·말투 묶음은 도구줄에 넣지 않는다
function groupsOf(family: ActingFamily): TagGroup[] {
	const { sound, span, front } = ACTING[family];
	const all: TagGroup[] = [
		{
			kind: "sound",
			title: DRAMA_TEXT.soundGroup,
			short: TAG_TEXT.soundShort,
			items: sound,
		},
		{
			kind: "span",
			title: DRAMA_TEXT.spanGroup,
			short: DRAMA_TEXT.spanShort,
			items: span,
		},
		{
			kind: "mood",
			title: DRAMA_TEXT.moodGroup,
			short: TAG_TEXT.moodShort,
			items: front,
		},
	];
	return all.filter((group) => group.items.length > 0);
}
const HOW_TO = [
	DRAMA_TEXT.howToDot,
	DRAMA_TEXT.howToSpan,
	DRAMA_TEXT.howToLine,
	DRAMA_TEXT.howToNote,
];
// 줄 메뉴 '연기 지시 넣기'(브리프 17절 6): 다시 그린 뒤 그 줄 도구줄의 Tab 정지로 포커스한다.
// Typecast는 눌린 강도 칩(없으면 Tab 정지인 첫 칩), 단추가 없으면(noTags) 그 글이다(tabIndex -1)
export function focusToolbar(line: string) {
	requestAnimationFrame(() => {
		const tools = document.getElementById(dramaToolbarId(line));
		(
			tools?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
			tools?.querySelector<HTMLElement>('[tabindex="0"]') ??
			tools
		)?.focus();
	});
}

// '지시 쓰는 법'의 한 줄. `…`로 감싼 부분이 예시 code다
function HowToLine({ text }: { text: string }) {
	return (
		<p>
			{text.split("`").map((part, i) =>
				i % 2 === 1 ? (
					<code key={part} className="rounded-md bg-muted px-1">
						{part}
					</code>
				) : (
					part
				),
			)}
		</p>
	);
}

// Typecast 강도 네 단계(브리프 14절 배치 3). 고르면 그 줄 feel만 바꾼다. 방향키는 ToggleGroup이 스스로 다룬다
function IntensityChips({
	line,
	cast,
	shown,
	onChange,
}: {
	line: DraftLine;
	cast: Cast;
	shown: Shown;
	onChange: Lines["setLine"];
}) {
	const intensityId = useId();
	const autoId = useId();
	const smart = shown.value === "smart";
	return (
		<div className="flex items-center gap-2">
			<span id={intensityId} className="text-muted-foreground text-sm">
				{DRAMA_TEXT.intensityLabel}
			</span>
			{/* 하나 고르기. 눌린 칸을 다시 눌러 비울 수 없다(강도는 늘 하나다, emotion-palette와 같다).
			    감정이 '자동'이면 잠기지만 포커스는 받고 이유(intensityAuto)를 설명으로 읽는다(빼기 잠금과 같은 aria-disabled 모양) */}
			<ToggleGroup
				aria-labelledby={intensityId}
				value={smart ? [] : [String(shown.intensity)]}
				onValueChange={(next) => {
					const step = next[0];
					if (!smart && typeof step === "string")
						onChange(line.id, {
							feel: feelPatch(cast.family, line.feel, shown, {
								intensity: Number(step),
							}),
						});
				}}
			>
				{TYPECAST_INTENSITIES.map((step) => (
					<Toggle
						key={step}
						value={String(step)}
						aria-disabled={smart || undefined}
						aria-describedby={smart ? autoId : undefined}
						className={cn(
							"rounded-full bg-card px-3 text-foreground tabular-nums ring-1 ring-border ring-inset data-pressed:bg-primary-subtle data-pressed:text-primary data-pressed:ring-primary",
							lockedButton(true),
						)}
					>
						{!smart && step === shown.intensity ? (
							<Check aria-hidden="true" />
						) : null}
						{step}
					</Toggle>
				))}
			</ToggleGroup>
			{smart ? (
				<span id={autoId} className="sr-only">
					{DRAMA_TEXT.intensityAuto}
				</span>
			) : null}
		</div>
	);
}

// 접힌 '지시 쓰는 법'(Drama 3 화자만, 예시의 범위 태그를 Drama 3만 읽어서). 펼치면 도구줄 아래 전체 폭이다
function HowTo() {
	return (
		<details className="group open:basis-full">
			<summary className="flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1 text-muted-foreground text-sm outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
				{DRAMA_TEXT.howTo}
				<ChevronDown
					aria-hidden="true"
					className="size-4 group-open:rotate-180"
				/>
			</summary>
			<div className="flex flex-col gap-2 pb-2 text-sm">
				{HOW_TO.map((text) => (
					<HowToLine key={text} text={text} />
				))}
			</div>
		</details>
	);
}

// 대상 줄 하나의 도구줄. 줄 칸(drama-lines)이 badgeTarget 줄에만 그린다(포커스한 줄이 없으면 도구줄도 없다).
// 도구줄 안의 포커스는 대상을 바꾸지 않는다(noteFocus를 부르지 않는다)
export function DramaToolbar({ line, n }: { line: DraftLine; n: number }) {
	const drama = useDrama();
	const { applyBadge, setLine } = useLines();
	// applyBadge는 줄이 바뀔 때마다 새 함수다. 알약에는 늘 같은 함수를 넘겨 글자마다 다시 그리지 않는다(advanced-event-handler-refs, drama-lines onNote와 같다)
	const badgeRef = useRef(applyBadge);
	useLayoutEffect(() => {
		badgeRef.current = applyBadge;
	});
	const pick = (kind: TagKind, value: string) => badgeRef.current(kind, value);
	const cast = castOf(drama, line.speaker);
	const shown = shownFeel(cast.voice, cast.value, cast.family, line.feel);
	const [first, ...rest] = groupsOf(cast.family);
	const id = dramaToolbarId(line.id);
	return (
		// 768px 이상 지시 열부터 끝까지, 767px 이하 전체 폭(index.css drama-line-tools). 아래 8px: 가름선 칸 이름표의 위로 넓힌 눌림 영역(-my-2)이 알약 눌림 영역을 덮지 않게
		<div className="drama-line-tools flex min-w-0 flex-wrap items-center gap-x-1.5 pb-2">
			{shown && shown.intensity !== null ? (
				<div
					id={id}
					role="toolbar"
					aria-label={DRAMA_TEXT.toolbarName(n)}
					aria-orientation="horizontal"
					className={TAG_ROW}
				>
					<IntensityChips
						line={line}
						cast={cast}
						shown={shown}
						onChange={setLine}
					/>
				</div>
			) : first ? (
				<TagTools
					id={id}
					label={DRAMA_TEXT.toolbarName(n)}
					first={first}
					rest={rest}
					onPick={pick}
					after={cast.family === "fish_drama" ? <HowTo /> : undefined}
				/>
			) : (
				<p
					id={id}
					tabIndex={-1}
					className="flex min-h-11 items-center rounded-md text-muted-foreground text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
				>
					{DRAMA_TEXT.noTags}
				</p>
			)}
		</div>
	);
}
