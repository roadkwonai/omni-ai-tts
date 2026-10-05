"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Play, Square } from "lucide-react";
import {
	type FocusEvent,
	type KeyboardEvent,
	type Ref,
	useId,
	useState,
} from "react";

import { type Cell, type Col, navigate, tabStop } from "@/lib/roving";
import type { SampleStatus } from "@/lib/sample-state";
import {
	badgesOf,
	metaLine,
	pillsOf,
	sampleAriaLabel,
	secondaryLines,
	voiceKey,
} from "@/lib/voice-view";

import { useSample } from "./sample-player";

// 행을 고른다(row는 누른 고르기 버튼. 좁은 화면에서 서랍을 닫으면 그리로 포커스를 돌린다)
export type Select = (voice: Voice, row: HTMLButtonElement) => void;

// 알약은 줄어들며 말줄임이 된다. 행 hover 바탕(muted)과 다크 카드 위에서도 보이게 안쪽 경계 한 줄을 두른다(critique 2026-10-05)
const pillClass =
	"min-w-0 max-w-32 truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs ring-1 ring-border ring-inset";

// 샘플 재생 버튼(브리프 7절): 행과 패널이 함께 쓰는 44px 둥근 아이콘 버튼. 접근 이름은 sampleAriaLabel(보이는 상태를 담는다)
export function SampleButton({
	status,
	subject,
	onToggle,
	tabIndex,
}: {
	status: SampleStatus | "none";
	subject: string;
	onToggle?: () => void;
	// 행 목록 안에서는 지금 칸만 0이다(RowList)
	tabIndex?: number;
}) {
	const playing = status === "playing";
	return (
		<Button
			variant={
				playing ? "default" : status === "none" ? "secondary" : "outline"
			}
			size="icon-lg"
			className="relative z-10 shrink-0 rounded-full"
			disabled={status === "none"}
			aria-label={sampleAriaLabel(status, subject)}
			aria-busy={status === "loading" || undefined}
			tabIndex={tabIndex}
			onClick={onToggle}
		>
			{status === "loading" ? (
				<Spinner aria-hidden="true" />
			) : playing ? (
				<Square aria-hidden="true" className="fill-current" />
			) : (
				<Play aria-hidden="true" className="fill-current" />
			)}
		</Button>
	);
}

// 브리프 5절 '성우 행'(높이 약 69px)과 7절 샘플 상태. 재생 버튼 밖 행 전체가 '고르기' 버튼이다.
// 칸 숨김은 뷰포트가 아니라 목록 칸 너비로 정한다(목록 ul의 @container, 계획 리뷰 D2):
// 28rem 이상이면 둘째 줄에 알약, 32rem 이상이면 오른쪽 고정 칸(보조 정보 위, 배지 아래). 그 아래면 배지가 메타 줄 아래로 내려가고 보조 정보는 빠진다.
// 둘째 줄은 메타 줄이 먼저다. 알약은 남는 자리만 쓰고, 모자라면 말줄임이 되고 들어가지 못한 알약은 숨는다(critique 2026-10-05)
export function VoiceRow({
	voice,
	selected,
	onSelect,
	panelId,
	tabbable,
}: {
	voice: Voice;
	selected: boolean;
	onSelect: Select;
	// 1200px 이상에서 고르면 바뀌는 패널(aria-controls). 서랍일 때는 없다
	panelId?: string;
	// 목록의 Tab 정지가 이 행이면 그 칸(0 재생, 1 고르기), 아니면 null(두 버튼 모두 tabIndex -1)
	tabbable: Col | null;
}) {
	const id = useId();
	const url = voice.previewUrl;
	// 재생 키는 샘플 주소다. 샘플이 없으면 어떤 키와도 같지 않은 ""
	const { status, toggle } = useSample(url ?? "");
	const playing = status === "playing";
	// 샘플이 없으면 재생 버튼이 비활성이라 포커스를 받지 못한다. 그 행의 Tab 정지는 고르기 버튼이다
	const playTabbable = tabbable === 0 && url !== null;
	const pills = pillsOf(voice);
	const secondary = secondaryLines(voice);
	const badges = badgesOf(voice);
	// 오른쪽 칸은 144px이라 가장 긴 배지 '라이브러리에서 저장'이 한 줄에 다 들어간다(audit P3-3, 코디네이터 판정). 더 긴 값은 칸을 넘지 않고 말줄임이 된다(전체 이름은 화면 밖 설명에 있다).
	// 행 배지는 회색 보통 굵기(400)라 굵은 이름보다 낮다(사용자 결정 2026-10-05, 재확인)
	const badgeList = (className: string) =>
		badges.length > 0 ? (
			<span aria-hidden="true" className={className}>
				{badges.map((label) => (
					<Badge
						key={label}
						variant="secondary"
						className="max-w-full font-normal"
					>
						<span className="truncate">{label}</span>
					</Badge>
				))}
			</span>
		) : null;
	return (
		<article
			className={cn(
				"relative flex min-h-17 items-center gap-3 px-4 py-2 transition-colors",
				selected ? "bg-primary-subtle" : "hover:bg-muted",
				// 재생 중: 청록 3px 왼쪽 띠(브리프 3·7절이 정한 표시. craft-floor의 색 있는 왼쪽 테두리 금지보다 브리프가 앞선다)
				playing &&
					"before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-primary",
			)}
		>
			<SampleButton
				status={url === null ? "none" : status}
				subject={`${voice.name} 기본 샘플`}
				onToggle={url === null ? undefined : () => toggle(url, voice.name, url)}
				tabIndex={playTabbable ? 0 : -1}
			/>
			{/* 행 전체를 덮는 고르기 버튼(재생 버튼은 z-10으로 그 위). 이름이 접근 이름이고 메타·분류·배지·재생 실패는 설명이다(계획 리뷰 D5) */}
			<button
				type="button"
				// '더 보기' 뒤 새로 붙은 첫 행으로 포커스를 옮길 때 찾는 표지(Task 11b)
				data-select=""
				aria-current={selected ? "true" : undefined}
				aria-labelledby={`${id}-name`}
				aria-describedby={`${id}-detail`}
				aria-controls={panelId}
				tabIndex={tabbable !== null && !playTabbable ? 0 : -1}
				onClick={(event) => onSelect(voice, event.currentTarget)}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-ring focus-visible:after:-outline-offset-2"
			>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex min-w-0 items-baseline gap-1.5">
						<span id={`${id}-name`} className="truncate font-bold">
							{voice.name}
						</span>
						{voice.englishName ? (
							<span
								translate="no"
								className="truncate text-muted-foreground text-sm"
							>
								{voice.englishName}
							</span>
						) : null}
						{playing ? <Badge variant="primary">재생 중</Badge> : null}
					</span>
					<span
						id={`${id}-detail`}
						className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm"
					>
						<span className="truncate">{metaLine(voice)}</span>
						{/* 남는 자리만 쓴다(basis 0, 내용 너비까지). 한 줄 높이에 줄바꿈을 두어 들어가지 못한 알약은 다음 줄로 넘어가 숨는다 */}
						{pills.all.length > 0 ? (
							<span
								aria-hidden="true"
								className="@md:flex hidden h-5 min-w-0 max-w-fit grow basis-0 flex-wrap gap-x-1.5 overflow-hidden"
							>
								{pills.shown.map((label) => (
									<span key={label} className={pillClass}>
										{label}
									</span>
								))}
								{pills.rest > 0 ? (
									<span className={pillClass}>+{pills.rest}</span>
								) : null}
							</span>
						) : null}
						<span className="sr-only">
							{pills.all.length > 0
								? `, 공급자 분류: ${pills.all.join(", ")}`
								: ""}
							{secondary.length > 0 ? `, ${secondary.join(", ")}` : ""}
							{badges.length > 0 ? `, ${badges.join(", ")}` : ""}
						</span>
						{status === "failed" ? (
							<span className="shrink-0 text-warning">재생하지 못했어요</span>
						) : null}
					</span>
					{badgeList("flex flex-wrap gap-1 @lg:hidden")}
				</span>
				<span className="@lg:flex hidden w-36 shrink-0 flex-col items-end gap-1">
					{secondary.length > 0 ? (
						<span
							aria-hidden="true"
							translate="no"
							className="flex flex-col items-end text-right text-muted-foreground text-sm tabular-nums"
						>
							{secondary.map((line) => (
								<span key={line}>{line}</span>
							))}
						</span>
					) : null}
					{badgeList("flex max-w-full flex-wrap justify-end gap-1")}
				</span>
			</button>
		</article>
	);
}

// 행 목록(Task 12b 공통화): 서버 목록·Typecast·'전체' 묶음이 함께 쓴다. 다시 받는 중이면 흐리게 두고 누를 수 없다(브리프 8절).
// 목록 하나가 Tab 정지 하나다(roving tabindex, 브리프 9절): 지금 행의 버튼 하나만 tabIndex 0이고, ↑↓·Home·End·←→로 옮긴다(고르지 않는다).
// Enter·Space는 버튼 기본 동작이다. 스크립트가 옮긴 포커스('더 보기' 뒤 새 첫 행, 서랍을 닫고 돌아온 행)도 그 행을 지금 행으로 만든다.
// 방향키를 쓴다는 것은 목록마다 화면 밖 안내 한 줄로 알린다(aria-describedby, audit N1). 목록 의미(역할)는 그대로다
export function RowList({
	voices,
	label,
	selectedKey,
	select,
	panelId,
	refreshing,
	ref,
}: {
	voices: Voice[];
	label?: string;
	selectedKey: string | null;
	select: Select;
	panelId?: string;
	refreshing: boolean;
	// '더 보기' 뒤 새로 붙은 첫 행을 찾는다(서버 목록)
	ref?: Ref<HTMLUListElement>;
}) {
	// 포커스가 마지막으로 들어온 칸. 그 행이 목록에서 빠지면 tabStop이 고른 성우의 행이나 첫 행으로 돌아간다
	const [focused, setFocused] = useState<{ key: string; col: Col } | null>(
		null,
	);
	const hintId = useId();
	const keys = voices.map(voiceKey);
	const stop = tabStop(keys, focused, selectedKey);

	// 포커스한 버튼의 칸: 행 번호와 행 안 버튼 순서(0 재생, 1 고르기)
	function cellOf(list: HTMLUListElement, target: EventTarget): Cell | null {
		if (!(target instanceof HTMLButtonElement)) return null;
		const item = target.closest("li");
		if (item?.parentElement !== list) return null;
		const col = [...item.querySelectorAll("button")].indexOf(target);
		if (col !== 0 && col !== 1) return null;
		return { row: [...list.children].indexOf(item), col };
	}
	// 사용자가 직접 준 포커스(클릭·Tab·스크립트)는 그 칸을 의도한 칸으로 기억한다
	function onFocus(event: FocusEvent<HTMLUListElement>) {
		const cell = cellOf(event.currentTarget, event.target);
		const key = cell ? keys[cell.row] : undefined;
		if (!cell || key === undefined) return;
		if (focused?.key !== key || focused.col !== cell.col) {
			setFocused({ key, col: cell.col });
		}
	}
	function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
			return;
		}
		const list = event.currentTarget;
		const buttons = (row: number) =>
			list.children[row]?.querySelectorAll("button");
		const from = cellOf(list, event.target);
		const move = from
			? navigate(event.key, from, keys, focused, (row) => {
					const play = buttons(row)?.[0];
					return play !== undefined && !play.disabled;
				})
			: null;
		if (!move) return;
		event.preventDefault();
		buttons(move.focus.row)?.[move.focus.col]?.focus();
		// focus()가 부른 onFocus가 실제 칸(샘플 없는 행이면 고르기)을 적은 뒤, 의도한 칸으로 덮는다(나중 setState가 이긴다)
		setFocused(move.remember);
	}

	return (
		<>
			<ul
				ref={ref}
				aria-label={label}
				aria-describedby={hintId}
				inert={refreshing}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
				className={cn(
					"@container divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-border ring-inset",
					refreshing && "opacity-60",
				)}
			>
				{voices.map((voice) => {
					const key = voiceKey(voice);
					return (
						<li key={key} className="voice-row">
							<VoiceRow
								voice={voice}
								selected={key === selectedKey}
								onSelect={select}
								panelId={panelId}
								tabbable={key === stop?.key ? stop.col : null}
							/>
						</li>
					);
				})}
			</ul>
			<span id={hintId} className="sr-only">
				방향키로 성우 사이를 옮겨요
			</span>
		</>
	);
}
