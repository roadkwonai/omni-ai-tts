// apps/web/src/components/paragraph-select-bar.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronDown, ListChecks, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
	batchFollow,
	batchGap,
	batchRemove,
	batchSpeaker,
	batchVoice,
	PARAGRAPH_GAP_DEFAULT,
} from "@/lib/paragraph-script";
import { gapOf, gapText } from "@/lib/sound-join";
import { PARAGRAPH_TEXT } from "@/lib/studio-text";

import { useBarHeight } from "./bar-height";
import { fieldClass, isComposingEnter } from "./class-form-dialog";
import { GapInput } from "./drama-gap";
import { SpeakerMark } from "./drama-voice-dialog";
import { visible } from "./paragraph-focus";
import { useParagraphs, useWork } from "./paragraph-provider";
import { menuItem } from "./voice-conditions";
import { VoicePickerDialog } from "./voice-picker-dialog";
import { lockedButton } from "./voice-problem";

// 고르기 막대(T10-b 브리프 16.2, 계획 2.4). 고른 문단 id 집합은 목록(ParagraphList)이 들고 여기는 원시 값과 함수만 받는다.
// 동작은 lib의 batch* 순수 함수 → edit 한 번(되돌리기 알림 하나)이다. 전체 만들기가 도는 동안과 0개를 골랐을 때는 동작 다섯이 잠기고
// 이유를 한 줄 보인다(aria-disabled + aria-describedby, 잠겨도 포커스는 받는다). '지우기' 뒤 포커스는 첫 동작(data-select-first)이다

// '고르기' 켜기·끄기(머리 오른쪽 끝과 1단 작업 띠 끝에 하나씩 그린다, 한쪽만 보인다). 끝낼 때 포커스가 돌아올 곳을 data 표식으로 찾는다
export function SelectToggle({
	selecting,
	onToggle,
}: {
	selecting: boolean;
	onToggle: () => void;
}) {
	return (
		<Button
			variant="ghost"
			size="lg"
			aria-pressed={selecting}
			data-select-toggle=""
			onClick={onToggle}
		>
			<ListChecks data-icon="inline-start" aria-hidden="true" />
			{PARAGRAPH_TEXT.select}
		</Button>
	);
}

// 두 '고르기' 단추 가운데 보이는 것(숨은 쪽은 display:none이라 offsetParent가 null)으로 포커스를 돌려준다
export function focusSelectToggle() {
	visible(document, "[data-select-toggle]")?.focus();
}

// 767px 이하 둘째 줄: 동작 다섯이 같은 폭(basis-0 + flex-1)이고 가로 여백을 줄여 320px에서도 한 줄에 든다
const ACTION =
	"max-md:min-w-0 max-md:flex-1 max-md:basis-0 max-md:gap-0.5 max-md:px-1 max-md:has-data-[icon=inline-end]:pr-1";
const FIRST = { "data-select-first": "" } as const;

// Esc가 입력 중이거나 한글 조합 중에 눌린 것이면 고르기를 끄지 않는다(대본 칸·숫자 칸의 Esc는 그 칸의 일이다)
function typing(event: KeyboardEvent) {
	return (
		event.isComposing ||
		(event.target instanceof HTMLElement &&
			(event.target.isContentEditable ||
				event.target.closest("input, textarea, select") !== null))
	);
}

// 잠긴 동작 하나(눌리지 않고 이유를 잇는다)
function LockedAction({
	children,
	reasonId,
	first = false,
	destructive = false,
}: {
	children: ReactNode;
	reasonId: string;
	first?: boolean;
	destructive?: boolean;
}) {
	return (
		<Button
			variant="neutral"
			size="lg"
			focusableWhenDisabled
			disabled
			aria-describedby={reasonId}
			className={cn(
				ACTION,
				lockedButton(true),
				destructive && "text-destructive",
			)}
			{...(first ? FIRST : {})}
		>
			{children}
		</Button>
	);
}

export function ParagraphSelectBar({
	total,
	chosen,
	locked,
	speakers,
	onAll,
	onEnd,
}: {
	// 문단 수와 고른 문단 id(지금 문단으로 거른 집합)
	total: number;
	chosen: ReadonlySet<string>;
	// 전체 만들기가 도는 중
	locked: boolean;
	// 작업의 화자 이름들(0명이면 '화자' 동작을 그리지 않는다)
	speakers: readonly string[];
	onAll: (on: boolean) => void;
	// '끝내기'와 Esc. 고른 것을 비우고 '고르기' 단추로 포커스를 돌려주는 일은 부른 쪽이 한다
	onEnd: () => void;
}) {
	const { paragraphs, edit } = useParagraphs();
	const work = useWork();
	const barRef = useRef<HTMLElement>(null);
	const allRef = useRef<HTMLSpanElement>(null);
	const gapRef = useRef<HTMLInputElement>(null);
	const reasonId = useId();
	const gapId = useId();
	const unitId = useId();
	const count = chosen.size;
	const [gapOpen, setGapOpen] = useState(false);
	const [gapValue, setGapValue] = useState(work.work.gap);
	const reason = locked
		? PARAGRAPH_TEXT.selectLocked
		: count === 0
			? PARAGRAPH_TEXT.selectNone
			: null;

	// 켜면 모두 고르기 체크로 포커스(브리프 16.4)
	useEffect(() => {
		allRef.current?.focus();
	}, []);
	// 막대 높이를 <html>의 --studio-select-height(px)로 알린다(index.css studio-select-sticky가 scroll-padding-top에 쓴다)
	useBarHeight(barRef, "--studio-select-height");
	// Esc는 창·메뉴 밖에서만 끈다(창·메뉴가 열려 있으면 그것이 Esc를 받는다). 입력 중이거나 한글 조합 중이어도 끄지 않는다(브리프 16.8)
	const endRef = useRef(onEnd);
	useEffect(() => {
		endRef.current = onEnd;
	});
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key !== "Escape" || event.defaultPrevented || typing(event))
				return;
			if (
				document.querySelector(
					'[role="dialog"], [role="alertdialog"], [role="menu"]',
				)
			)
				return;
			endRef.current();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const some = count > 0 && count < total;
	function toFirstAction() {
		barRef.current?.querySelector<HTMLElement>("[data-select-first]")?.focus();
	}
	function openGap(next: boolean) {
		if (next) {
			// 처음 값은 처음 고른 문단의 쉼
			const first = paragraphs.find((p) => chosen.has(p.id));
			setGapValue(first?.gap ?? work.work.gap);
		}
		setGapOpen(next);
	}
	function applyGap() {
		const next = gapOf(gapRef.current?.value) ?? PARAGRAPH_GAP_DEFAULT;
		edit((ps) => batchGap(ps, chosen, next), {
			message: PARAGRAPH_TEXT.batchGapDone(count),
		});
		setGapOpen(false);
	}
	function remove() {
		// 지운 뒤 0개라 동작이 잠긴다. 포커스를 받는 첫 동작(잠겨도 포커스는 받는다)으로 옮긴다
		flushSync(() =>
			edit((ps) => batchRemove(ps, chosen), {
				message: PARAGRAPH_TEXT.batchRemoveDone(count),
			}),
		);
		toFirstAction();
	}

	return (
		<section
			ref={barRef}
			aria-label={PARAGRAPH_TEXT.selectBarLabel}
			// 앱 메뉴(767px 이하 위쪽 띠, z-10) 바로 아래에 붙고, 막대가 있는 동안 위쪽 scroll-padding을 둔다(index.css)
			className="studio-select-sticky z-5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-border border-b bg-background py-2"
		>
			{/* 1440 한 줄 [체크 · 개수(+이유)] [동작] … [끝내기]. 767 이하 첫 줄 [체크 · 개수(+이유) · 끝내기], 둘째 줄 동작 다섯 */}
			<div className="flex min-w-0 items-center gap-3 max-md:order-1">
				<Checkbox
					ref={allRef}
					checked={count > 0 && count === total}
					indeterminate={some}
					onCheckedChange={(on) => onAll(on)}
					aria-label={PARAGRAPH_TEXT.selectAll}
					className="after:-inset-3.5"
				/>
				<span className="text-sm tabular-nums">
					{PARAGRAPH_TEXT.selectedOf(count, total)}
					{reason ? (
						<span className="font-normal text-muted-foreground">
							<span aria-hidden="true">{" · "}</span>
							<span id={reasonId}>{reason}</span>
						</span>
					) : null}
				</span>
			</div>
			<div className="flex items-center gap-2 max-md:order-3 max-md:w-full max-md:gap-1">
				{reason ? (
					<LockedAction reasonId={reasonId} first>
						{PARAGRAPH_TEXT.selectVoice}
					</LockedAction>
				) : (
					<VoicePickerDialog
						target={{ kind: "selection", count }}
						current={null}
						onPick={(setup) =>
							edit((ps) => batchVoice(ps, chosen, setup), {
								message: PARAGRAPH_TEXT.batchVoiceDone(count),
							})
						}
						trigger={
							<Button variant="neutral" size="lg" className={ACTION} {...FIRST}>
								{PARAGRAPH_TEXT.selectVoice}
							</Button>
						}
					/>
				)}
				{speakers.length === 0 ? null : reason ? (
					<LockedAction reasonId={reasonId}>
						{PARAGRAPH_TEXT.speaker}
						<ChevronDown data-icon="inline-end" aria-hidden="true" />
					</LockedAction>
				) : (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant="neutral" size="lg" className={ACTION} />}
						>
							{PARAGRAPH_TEXT.speaker}
							<ChevronDown data-icon="inline-end" aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-44 p-1">
							<DropdownMenuGroup>
								{speakers.map((name, index) => (
									<DropdownMenuItem
										key={name}
										className={menuItem}
										onClick={() =>
											edit((ps) => batchSpeaker(ps, chosen, name), {
												message: PARAGRAPH_TEXT.batchSpeakerDone(count),
											})
										}
									>
										<SpeakerMark index={index} />
										<span className="truncate">{name}</span>
									</DropdownMenuItem>
								))}
								<DropdownMenuItem
									className={menuItem}
									onClick={() =>
										edit((ps) => batchSpeaker(ps, chosen, undefined), {
											message: PARAGRAPH_TEXT.batchSpeakerDone(count),
										})
									}
								>
									{PARAGRAPH_TEXT.noSpeaker}
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				<Dialog open={gapOpen} onOpenChange={openGap}>
					{reason ? (
						<LockedAction reasonId={reasonId}>
							{PARAGRAPH_TEXT.selectGap}
						</LockedAction>
					) : (
						<DialogTrigger
							render={<Button variant="neutral" size="lg" className={ACTION} />}
						>
							{PARAGRAPH_TEXT.selectGap}
						</DialogTrigger>
					)}
					<DialogContent
						initialFocus={() => gapRef.current ?? true}
						className="md:max-w-sm"
					>
						<form
							noValidate
							className="contents"
							onSubmit={(event) => {
								event.preventDefault();
								applyGap();
							}}
							onKeyDown={(event) => {
								if (isComposingEnter(event)) event.preventDefault();
							}}
						>
							<DialogHeader>
								<DialogTitle>{PARAGRAPH_TEXT.batchGapTitle(count)}</DialogTitle>
							</DialogHeader>
							<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
								<label htmlFor={gapId} className="sr-only">
									{PARAGRAPH_TEXT.batchGapTitle(count)}
								</label>
								<GapInput
									id={gapId}
									name="paragraph-batch-gap"
									value={gapText(gapValue)}
									describedBy={unitId}
									inputRef={gapRef}
									className={cn(fieldClass, "w-14 text-center")}
									onCommit={(next) =>
										setGapValue(next ?? PARAGRAPH_GAP_DEFAULT)
									}
								/>
								<span id={unitId}>{PARAGRAPH_TEXT.gapUnit}</span>
							</span>
							<DialogFooter>
								<DialogClose
									render={
										<Button
											variant="neutral"
											size="lg"
											className="flex-1 md:flex-none"
										/>
									}
								>
									{PARAGRAPH_TEXT.cancel}
								</DialogClose>
								<Button type="submit" size="lg" className="flex-1 md:flex-none">
									{PARAGRAPH_TEXT.apply}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
				{reason ? (
					<LockedAction reasonId={reasonId}>
						{PARAGRAPH_TEXT.selectFollow}
					</LockedAction>
				) : (
					<Button
						variant="neutral"
						size="lg"
						className={ACTION}
						onClick={() =>
							edit((ps) => batchFollow(ps, chosen), {
								message: PARAGRAPH_TEXT.batchFollowDone(count),
							})
						}
					>
						{PARAGRAPH_TEXT.selectFollow}
					</Button>
				)}
				<span
					aria-hidden="true"
					className="mx-1 h-6 w-px shrink-0 bg-border max-md:hidden"
				/>
				{reason ? (
					<LockedAction reasonId={reasonId} destructive>
						{PARAGRAPH_TEXT.remove}
					</LockedAction>
				) : (
					<Button
						variant="neutral"
						size="lg"
						className={cn(ACTION, "text-destructive")}
						onClick={remove}
					>
						{PARAGRAPH_TEXT.remove}
					</Button>
				)}
			</div>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={PARAGRAPH_TEXT.selectEnd}
							className="ml-auto text-muted-foreground hover:text-foreground focus-visible:text-foreground max-md:order-2"
							onClick={onEnd}
						/>
					}
				>
					<X aria-hidden="true" />
				</TooltipTrigger>
				<TooltipContent>{PARAGRAPH_TEXT.selectEnd}</TooltipContent>
			</Tooltip>
		</section>
	);
}
