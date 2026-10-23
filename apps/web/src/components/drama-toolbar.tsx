// apps/web/src/components/drama-toolbar.tsx
"use client";

import {
	ACTING,
	type ActingFamily,
	TYPECAST_INTENSITIES,
} from "@tts-pilot-app/api/drama-acting";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import {
	DRAMA_TEXT,
	type DraftLine,
	feelPatch,
	newSpeaker,
	shownFeel,
	speakerValue,
	voiceOfSpeaker,
} from "@/lib/drama-view";
import { nextCell } from "@/lib/roving";

import { useDrama, useLines } from "./drama-provider";
import { menuItem } from "./voice-conditions";
import { lockedButton } from "./voice-problem";

// 연기 지시 도구줄(브리프 17절 6, 스펙 17.2 '연기 지시'). 대상 줄(마지막으로 포커스한 줄) 하나의 li 안, 대사 아래 drama-line-tools 칸에
// 그 줄 화자 family의 값만 놓는다. 태그 family는 첫 묶음 앞 다섯 알약 + 묶음마다 메뉴 알약(Drama 3은 끝에 '지시 쓰는 법'), Typecast는 강도 칩,
// 넣을 것이 없으면 noTags 글이다. 뱃지는 무채색 하나이고(색은 화자만 말한다, 브리프 3절) 넣는 곳은 useLines().applyBadge다.
// 감정·말투는 지시 자리의 감정 메뉴가 맡는다

type Kind = "sound" | "span" | "mood";
type Badge = { label: string; value: string };
type Group = {
	kind: Kind;
	// 메뉴 안 머리(긴 이름)와 메뉴 알약 글(짧은 이름)
	title: string;
	short: string;
	items: readonly Badge[];
};
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
function groupsOf(family: ActingFamily): Group[] {
	const { sound, span, front } = ACTING[family];
	const all: Group[] = [
		{
			kind: "sound",
			title: DRAMA_TEXT.soundGroup,
			short: DRAMA_TEXT.soundShort,
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
			short: DRAMA_TEXT.moodShort,
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
// 첫 묶음에서 바로 보이는 알약 수. 나머지는 '… 더 보기' 메뉴 알약이 담는다
const PILLS = 5;

// 뱃지 접근 이름 뒤에 붙는 넣는 글("한숨, [sighs]"). 소리 값은 태그 전체 글이다
const insertedOf = (kind: Kind, value: string) =>
	kind === "span" ? `<${value}>…</${value}>` : value;
// 알약을 누를 때 포커스를 빼앗지 않는다(칸의 커서가 그대로라 소리 알약이 커서 자리에 넣는다).
// 메뉴 알약에는 달지 않는다: Base UI 트리거는 누른 뒤 포커스가 트리거에 온 다음 프레임에 연다. 미룬 넣기는 applyBadge가 칸과 고른 자리를 되살린다
const keepFocus = (event: MouseEvent) => event.preventDefault();

// 도구줄 한 줄: 768px 이상은 넘치면 줄을 바꾸고, 767px 이하는 한 줄 가로 넘김(스크롤바 대신 오른쪽 흐림, index.css tabs-overflow-fade).
// 위아래 4px는 알약의 눌림 영역과 포커스 링이 넘김 칸에 잘리지 않게 둔다(767px 이하는 양옆도). 바뀐 줄 사이 8px라 눌림 영역이 겹치지 않는다
const ROW =
	"flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2 py-1 max-md:basis-full max-md:flex-nowrap max-md:overflow-x-auto max-md:px-1 max-md:tabs-overflow-fade";
// 알약(시안 .pill): 높이 36px에 after로 위아래 4px를 더해 눌림 영역 44px, 한 글자 알약(헉·쉼)도 너비 44px. 메뉴 알약은 회색 글과 ▾(시안 .pill.menu)
const PILL =
	"relative h-9 min-w-11 gap-1 rounded-full bg-card px-3 font-normal ring-1 ring-border ring-inset after:absolute after:inset-x-0 after:-inset-y-1";

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
			{/* 하나 고르기. 눌린 칸을 다시 눌러 비울 수 없다(강도는 늘 하나다, studio-card 감정 팔레트와 같다).
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

// 묶음 하나를 담은 메뉴 알약. 항목을 고르면 넣기를 미뤄 두고 메뉴가 닫힌 뒤(onOpenChangeComplete) 넣는다:
// 칸에 포커스가 있어야 applyBadge가 execCommand로 넣어 Ctrl+Z가 남는다. 미룬 넣기가 있으면 닫을 때 포커스를 이 알약으로 돌리지 않는다(넣기가 칸으로 옮긴다)
function MenuPill({
	name,
	group,
	items,
	tabIndex,
	onFocus,
	onPick,
}: {
	name: string;
	group: Group;
	items: readonly Badge[];
	tabIndex: number;
	onFocus: () => void;
	onPick: (kind: Kind, value: string) => void;
}) {
	// 메뉴가 닫힌 뒤 할 넣기. 다시 열 때 비운다(닫힐 때 비우면 그 뒤 정하는 finalFocus가 넣기를 보지 못한다)
	const pending = useRef<(() => void) | null>(null);
	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (open) pending.current = null;
			}}
			onOpenChangeComplete={(open) => {
				if (!open) pending.current?.();
			}}
		>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						tabIndex={tabIndex}
						onFocus={onFocus}
						className={cn(
							PILL,
							"text-muted-foreground aria-expanded:text-foreground",
						)}
					/>
				}
			>
				{name}
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-auto min-w-48 p-1"
				finalFocus={() => pending.current === null}
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel className="py-1.5">
						{group.title}
					</DropdownMenuLabel>
					{items.map((badge) => (
						<DropdownMenuItem
							key={badge.value}
							className={menuItem}
							aria-label={DRAMA_TEXT.badgeName(
								badge.label,
								insertedOf(group.kind, badge.value),
							)}
							onClick={() => {
								pending.current = () => onPick(group.kind, badge.value);
							}}
						>
							{badge.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 태그 family 도구줄(Tab 정지 하나, ←→↑↓·Home·End로 옮긴다)과 접힌 '지시 쓰는 법'(Drama 3 화자만, 예시의 범위 태그를 Drama 3만 읽어서).
// 차례는 보이는 알약 → 메뉴 알약이다(메뉴 항목은 팝업이라 도구줄 DOM 밖). 메뉴 알약의 ↑↓는 메뉴가 먼저 받아 연다
function TagTools({
	id,
	n,
	first,
	rest,
	howTo,
	onPick,
}: {
	id: string;
	n: number;
	first: Group;
	rest: readonly Group[];
	howTo: boolean;
	onPick: (kind: Kind, value: string) => void;
}) {
	const pills = first.items.slice(0, PILLS);
	const menus = [
		...(first.items.length > PILLS
			? [
					{
						name: DRAMA_TEXT.moreOf(first.short),
						group: first,
						items: first.items.slice(PILLS),
					},
				]
			: []),
		...rest.map((group) => ({ name: group.short, group, items: group.items })),
	];
	const count = pills.length + menus.length;
	const [active, setActive] = useState(0);
	// 화자가 바뀌어 차례가 줄면 Tab 정지가 사라지지 않게 마지막 단추로 당긴다
	const stop = Math.min(active, count - 1);
	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		// 메뉴 팝업(포털)의 키도 React 트리로 여기까지 올라온다. 도구줄 DOM 안의 키만 다룬다
		if (!event.currentTarget.contains(event.target as Node)) return;
		// 한 줄 차례라 ←→도 ↑↓처럼 앞뒤 단추다(nextCell의 행 = 단추 차례, 끝에서는 머문다)
		const key =
			event.key === "ArrowLeft"
				? "ArrowUp"
				: event.key === "ArrowRight"
					? "ArrowDown"
					: event.key;
		const to = nextCell(key, { row: stop, col: 0 }, count, 0);
		if (!to) return;
		event.preventDefault();
		setActive(to.row);
		event.currentTarget.querySelectorAll("button")[to.row]?.focus();
	}
	return (
		<>
			<div
				id={id}
				role="toolbar"
				aria-label={DRAMA_TEXT.toolbarName(n)}
				aria-orientation="horizontal"
				onKeyDown={onKeyDown}
				className={ROW}
			>
				{/* 첫 묶음 이름(시안 .lbl). 767px 이하는 숨긴다 */}
				<span className="mr-0.5 text-muted-foreground text-sm max-md:hidden">
					{first.short}
				</span>
				{pills.map((badge, i) => (
					<Button
						key={badge.value}
						variant="ghost"
						tabIndex={i === stop ? 0 : -1}
						aria-label={DRAMA_TEXT.badgeName(
							badge.label,
							insertedOf(first.kind, badge.value),
						)}
						onMouseDown={keepFocus}
						onFocus={() => setActive(i)}
						onClick={() => onPick(first.kind, badge.value)}
						className={PILL}
					>
						{badge.label}
					</Button>
				))}
				{menus.map((menu, j) => (
					<MenuPill
						key={menu.group.kind}
						name={menu.name}
						group={menu.group}
						items={menu.items}
						tabIndex={pills.length + j === stop ? 0 : -1}
						onFocus={() => setActive(pills.length + j)}
						onPick={onPick}
					/>
				))}
			</div>
			{howTo ? (
				// 펼치면 도구줄 아래 전체 폭이다
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
			) : null}
		</>
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
	const pick = (kind: Kind, value: string) => badgeRef.current(kind, value);
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
					className={ROW}
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
					n={n}
					first={first}
					rest={rest}
					howTo={cast.family === "fish_drama"}
					onPick={pick}
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
