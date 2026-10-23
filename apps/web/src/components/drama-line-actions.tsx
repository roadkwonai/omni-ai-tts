// apps/web/src/components/drama-line-actions.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { DropdownMenuItem } from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { type LucideIcon, Play, Square } from "lucide-react";
import { type ReactNode, useId } from "react";

import { readKey } from "@/lib/drama-read";
import { DRAMA_TEXT, type DraftLine } from "@/lib/drama-view";
import type { Current } from "@/lib/sample-state";

import { useDrama } from "./drama-provider";
import { useDramaRead } from "./drama-read";
import { lineKey, useTakeAudio } from "./drama-take";
import { usePlayer } from "./sample-player";
import { menuItem } from "./voice-conditions";

// 대본 줄 동작(브리프 17절 10, 스펙 17.2 '줄 ▶'·'줄 ▶ 잠금'·'줄 메뉴'). 줄 ▶는 테이크 조각(segment: 테이크 모드, 나뉨, 지금 대본과 같음)이면
// 그 줄의 받을 테이크 조각 듣기(호출 없음), 아니면 '이 줄만 읽기'다(읽기의 확인 창을 지난다. 공급자를 여기서 부르지 않는다, tts-provider).
// 받을 테이크 ▾(TakePick)는 줄 행이 받을 테이크 칸에 둔다

// 그 키의 소리가 나는 중(재생 실패가 아니다). 줄 ▶의 ■와 대본 줄 강조(DramaLines)가 같은 판정을 쓴다
export const playsKey = (now: Current, key: string) =>
	now?.voiceId === key && now.status !== "failed";

// 줄 동작 버튼(RowAction 모양: 44px ghost 아이콘 + 툴팁, 받는 중이면 같은 버튼의 아이콘만 스피너). 대본 줄 ▶(LineActions)가 쓴다.
// 잠긴 버튼은 흐리고 이유를 설명과 툴팁(tip)으로 잇는다(브리프 9.1). 툴팁이 뜨게 가리킬 수는 있고 누름은 Base UI가 막는다(focusableWhenDisabled). 스피너 중에는 가리킴도 막는다.
// shortcut: class-group RowAction에 aria-describedby가 없어 같은 모양을 여기 둔다. RowAction이 설명을 받게 되면 그것으로 바꾼다
function LineAction({
	label,
	tip,
	icon: Icon,
	primary = false,
	busy,
	disabled,
	describedBy,
	onClick,
}: {
	label: string;
	// 툴팁 글(잠긴 이유). 없으면 이름
	tip?: string;
	icon: LucideIcon;
	// 시안 ▶: 청록 글자와 채운 14px 아이콘(스피너 중에는 평소 모양)
	primary?: boolean;
	busy: boolean;
	disabled: boolean;
	describedBy: string | undefined;
	onClick: (button: HTMLButtonElement) => void;
}) {
	const tinted = primary && !busy;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-lg"
						focusableWhenDisabled
						disabled={busy || disabled}
						aria-busy={busy || undefined}
						aria-describedby={describedBy}
						className={cn(
							tinted
								? "text-primary hover:text-primary focus-visible:text-primary"
								: "text-muted-foreground hover:text-foreground focus-visible:text-foreground",
							busy && "pointer-events-none",
							disabled &&
								!busy &&
								"opacity-50 hover:bg-transparent dark:hover:bg-transparent",
						)}
						aria-label={label}
						onClick={(event) => onClick(event.currentTarget)}
					/>
				}
			>
				{busy ? (
					<Spinner aria-hidden="true" />
				) : (
					<Icon
						aria-hidden="true"
						className={tinted ? "size-3.5 fill-current" : undefined}
					/>
				)}
			</TooltipTrigger>
			<TooltipContent>{tip ?? label}</TooltipContent>
		</Tooltip>
	);
}

// 줄 ▶와 ⋮(menu). ▶는 늘 같은 단추 하나다: 확인 창이 닫히면 이 단추로 돌아오므로 ▶·■·만드는 중에 아이콘과 이름만 바꾼다(계획 리뷰 P5-10).
// 만드는 줄은 스피너와 ' · 만드는 중'(보이는 글은 단추 옆), 조각을 받는 줄은 스피너와 ' 받는 중'(무대 줄 단추와 같다).
// ▶는 시안처럼 청록 채운 아이콘이다. 잠긴 ▶는 흐리고 이유를 툴팁과 설명으로 잇는다: 조각 ▶는 받는 중, '이 줄만 읽기' ▶는 읽기·받기 중이거나 장면을 만드는 중. 소리가 나는 줄의 ■는 잠그지 않는다
export function LineActions({
	line,
	index,
	n,
	speaker,
	segment,
	menu,
}: {
	line: DraftLine;
	index: number;
	n: number;
	// 줄 화자 이름(speakerNameOf)
	speaker: string;
	segment: boolean;
	menu: ReactNode;
}) {
	const take = useTakeAudio();
	const read = useDramaRead();
	const drama = useDrama();
	const generating = drama.generating !== null;
	const now = usePlayer().current;
	const reasonId = useId();
	// 이 줄이 받을 테이크(segment면 늘 있다)
	const piece = segment ? take.picked[index] : undefined;
	const active = playsKey(
		now,
		piece ? lineKey(piece.id, index) : readKey(line.id),
	);
	const { phase, makingId } = read.state;
	const making = phase === "reading" && makingId === line.id;
	// 누른 줄만 스피너(줄 듣기의 받는 키는 `play:${i}`)
	const receiving = piece !== undefined && drama.receiving === `play:${index}`;
	const locked =
		!active && (piece ? take.busy : phase !== "idle" || generating);
	const reason = piece
		? DRAMA_TEXT.receivingShort
		: generating
			? DRAMA_TEXT.makingStatus
			: DRAMA_TEXT.playLocked;
	const name = (active ? DRAMA_TEXT.stopLine : DRAMA_TEXT.playLine)(n, speaker);
	const label = making
		? `${name} · ${DRAMA_TEXT.makingNow}`
		: receiving
			? `${name} ${DRAMA_TEXT.receivingShort}`
			: name;
	// 스피너 단추는 이름이 상태를 말하므로 이유를 잇지 않는다
	const described = locked && !making && !receiving;

	// '이 줄만 읽기'의 확인 창은 닫히면 누른 단추로 돌아온다
	function press(button: HTMLButtonElement) {
		if (piece) take.play(index, piece, true);
		else if (active) read.stop();
		else read.start(line.id, button, true);
	}

	return (
		<>
			<LineAction
				label={label}
				tip={described ? reason : undefined}
				icon={active ? Square : Play}
				primary={!active}
				busy={making || receiving}
				disabled={locked}
				describedBy={described ? reasonId : undefined}
				onClick={press}
			/>
			{described ? (
				<span id={reasonId} hidden>
					{reason}
				</span>
			) : null}
			{/* 단추 이름이 이미 '만드는 중'을 말한다 */}
			{making ? (
				<span
					aria-hidden="true"
					className="flex h-11 items-center pr-2 text-muted-foreground text-sm"
				>
					{DRAMA_TEXT.makingNow}
				</span>
			) : null}
			{menu}
		</>
	);
}

// 줄 메뉴 '이 줄 받기'(스펙 17.2 '줄 메뉴'): 줄 ▶가 테이크 조각일 때만 줄 행이 그린다. 그 줄의 받을 테이크 대사 파일(WAV, 호출 없음)이다.
// 메뉴가 열려 있을 때만 그려져 받기 상태를 읽는다. 받는 중에는 꺼진다
export function SaveLineItem({ index }: { index: number }) {
	const take = useTakeAudio();
	return (
		<DropdownMenuItem
			className={menuItem}
			disabled={take.busy}
			onClick={() => take.saveLine(index)}
		>
			{DRAMA_TEXT.saveThisLine}
		</DropdownMenuItem>
	);
}
