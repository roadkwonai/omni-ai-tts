"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { AudioLines, Coins, Play, Square, Tag } from "lucide-react";
import {
	type FocusEvent,
	type KeyboardEvent,
	type Ref,
	useId,
	useRef,
	useState,
} from "react";

import { type Cell, type Col, navigate, tabStop } from "@/lib/roving";
import type { SampleStatus } from "@/lib/sample-state";
import { chipGroups, LIBRARY_TEXT } from "@/lib/saved-voice-view";
import {
	needsConfirm,
	requestOf,
	TRIAL_SHORT_PROBLEM,
	trialAriaLabel,
	trialProblemText,
} from "@/lib/trial-view";
import {
	badgesOf,
	geminiTagline,
	metaLine,
	nameParts,
	pillsOf,
	sampleAriaLabel,
	sampleKindOf,
	secondaryLines,
	voiceKey,
} from "@/lib/voice-view";

import { usePlayer, useSample } from "./sample-player";
import { SavedStar, useClassLists, useSavedItem } from "./saved-voices";
import { useOptionalTrial, useShownText, useTrial } from "./trial-provider";

// 행을 고른다(row는 누른 고르기 버튼. 좁은 화면에서 서랍을 닫으면 그리로 포커스를 돌린다)
export type Select = (voice: Voice, row: HTMLButtonElement) => void;

// 알약은 줄어들며 말줄임이 된다. 행 hover 바탕(muted)과 다크 카드 위에서도 보이게 안쪽 경계 한 줄을 두른다(critique 2026-10-05)
const pillClass =
	"min-w-0 max-w-32 truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs ring-1 ring-border ring-inset";

// 샘플 재생 버튼(브리프 7절): 행과 패널이 함께 쓰는 44px 둥근 아이콘 버튼. 접근 이름은 sampleAriaLabel(보이는 상태를 담는다)
export function SampleButton({
	status,
	subject,
	describedBy,
	onToggle,
	tabIndex,
}: {
	status: SampleStatus | "none";
	subject: string;
	describedBy?: string;
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
			aria-describedby={describedBy}
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

// 행의 '내 문장 듣기'(브리프 12절): 행 격자 셋째 칸. 그 공급자의 지금 설정으로 듣는다.
// 글자 버튼은 목록 칸 42rem(672px, @2xl) 이상에서만이고, 그 아래는 44px 아이콘 버튼과 툴팁이다(사용자 결정 U1: 1200~1439px에서 이름 칸을 지킨다).
// 아이콘은 유료면 Coins(경고색), Fish Audio 무료 모델이면 AudioLines다. 어느 너비에서도 유료 표식이 보인다(사용자 결정 U2).
// 이 성우의 내 문장 결과가 재생 중이면 채운 청록 '정지'가 된다(기본 샘플과 같은 문법, 사용자 결정 U8).
// 꺼져도 포커스는 받고 마우스를 올리면 툴팁에 이유가 보인다(pointer-events를 끄지 않는다, 계획 리뷰 D18. 누르기는 Base UI focusableWhenDisabled가 막는다)
function TrialButton({
	voice,
	tabIndex,
	onPick,
	describedBy,
}: {
	voice: Voice;
	tabIndex: number;
	// 1200px 이상이면 그 성우를 골라 패널에 결과·오류가 보이게 한다(계획 '스펙과 다른 점' 7)
	onPick?: () => void;
	// 행의 실패 전체 문구(계획 리뷰 D4)
	describedBy?: string;
}) {
	const trial = useTrial();
	const text = useShownText();
	const key = voiceKey(voice);
	const request = requestOf(voice, text, trial.settings);
	const block = trial.blockOf(voice, text);
	const mine = trial.busy?.key === key;
	const creating = mine && trial.busy?.phase === "creating";
	const playing = trial.playing(voice);
	const free = !needsConfirm(request);
	const reasonId = useId();
	const describe =
		[block && !playing ? reasonId : null, describedBy]
			.filter(Boolean)
			.join(" ") || undefined;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant={playing ? "default" : "outline"}
						size="lg"
						className={cn(
							"relative z-10 @max-2xl:size-11 shrink-0 @max-2xl:px-0",
							!playing && block !== null && "aria-disabled:opacity-50",
						)}
						focusableWhenDisabled
						disabled={!playing && (block !== null || mine)}
						tabIndex={tabIndex}
						aria-label={trialAriaLabel(
							voice.name,
							request,
							playing ? "playing" : creating ? "busy" : "idle",
						)}
						aria-describedby={describe}
						onClick={(event) => {
							if (playing) {
								trial.stop();
								return;
							}
							onPick?.();
							trial.listen(voice, event.currentTarget);
						}}
					/>
				}
			>
				{playing ? (
					<Square aria-hidden="true" className="fill-current" />
				) : mine ? (
					<Spinner aria-hidden="true" />
				) : free ? (
					<>
						<AudioLines aria-hidden="true" className="@2xl:hidden" />
						<Badge variant="success" className="@max-2xl:hidden">
							무료
						</Badge>
					</>
				) : (
					<Coins aria-hidden="true" className="text-warning" />
				)}
				<span className="@max-2xl:sr-only">
					{playing ? "정지" : creating ? "만드는 중…" : "내 문장 듣기"}
				</span>
			</TooltipTrigger>
			<TooltipContent>
				{block && !playing ? block : playing ? "정지" : "내 문장 듣기"}
			</TooltipContent>
			{block && !playing ? (
				<span id={reasonId} className="sr-only">
					{block}
				</span>
			) : null}
		</Tooltip>
	);
}

// 브리프 5절 '성우 행'(높이 약 69px)과 7절 샘플 상태. 재생 버튼 밖 행 전체가 '고르기' 버튼이다. 행 안 버튼 순서는 roving.ts의 칸 번호다.
// 칸 숨김은 뷰포트가 아니라 목록 칸 너비로 정한다(목록 ul의 @container, 계획 리뷰 D2):
// 28rem 이상이면 둘째 줄에 알약, 36rem 이상이면 오른쪽 고정 칸(보조 정보 위, 배지 아래. 별 칸이 늘어 32rem에서 올렸다, T7 브리프 B7). 그 아래면 배지가 메타 줄 아래로 내려가고 보조 정보는 빠진다.
// 담은 성우는 알약 자리에 내 분류(채널 → 카테고리 → 타입)를 같은 알약 모양으로, 이름 옆에 '자주 사용', 배지 맨 앞에 '현재 이용 불가'를 둔다(T7 브리프 B6·B8)
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
	// 목록의 Tab 정지가 이 행이면 그 칸(0 재생, 1 고르기, 캐스팅은 2 내 문장 듣기·3 별, 보관함은 2 별), 아니면 null(모든 버튼 tabIndex -1)
	tabbable: Col | null;
}) {
	const id = useId();
	const url = voice.previewUrl;
	const trial = useOptionalTrial();
	const key = voiceKey(voice);
	const trialProblem = trial?.problem(key) ?? null;
	const saved = useSavedItem(voice);
	const { channels, classes } = useClassLists();
	const mine = saved
		? chipGroups(saved, channels, classes).flatMap((group) => group.items)
		: [];
	const own = mine.length > 0;
	const player = usePlayer();
	const trialPlaying =
		player.current?.owner === key && player.current.status === "playing";
	const selectRef = useRef<HTMLButtonElement>(null);
	// 재생 키는 샘플 주소다. 샘플이 없으면 어떤 키와도 같지 않은 ""
	const { status, toggle } = useSample(url ?? "");
	const playing = status === "playing";
	// 샘플이 없으면 재생 버튼이 비활성이라 포커스를 받지 못한다. 그 행의 Tab 정지는 고르기 버튼이다
	const playTabbable = tabbable === 0 && url !== null;
	// 내 분류가 있으면 공급자 알약 대신 보인다(사용자 결정 U3). 담았지만 분류가 없으면 공급자 알약 그대로
	// 알약 key: 내 분류는 id(채널과 카테고리에 같은 이름이 있을 수 있다), 공급자 알약은 이름
	const providerPills = pillsOf(voice);
	const pills = own
		? {
				all: mine.map((entry) => entry.name),
				shown: mine
					.slice(0, 2)
					.map((entry) => ({ key: entry.id, label: entry.name })),
				rest: Math.max(0, mine.length - 2),
				// 목록 칸 28rem 미만에서는 내 분류 1개와 나머지 수만 보인다(critique P2)
				narrowRest: mine.length - 1,
			}
		: {
				...providerPills,
				shown: providerPills.shown.map((label) => ({ key: label, label })),
				narrowRest: 0,
			};
	const secondary = secondaryLines(voice);
	// Gemini는 보조 정보가 없어 그 칸에 설명 첫 마디를 둔다(critique P1). 칸이 숨는 좁은 폭에서는 이름 끝 번호가 구별을 맡는다
	const tagline = secondary.length === 0 ? geminiTagline(voice) : null;
	const name = nameParts(voice.name);
	const badges = saved?.unavailable
		? [LIBRARY_TEXT.unavailable, ...badgesOf(voice)]
		: badgesOf(voice);
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
				(playing || trialPlaying) &&
					"before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-primary",
			)}
		>
			<SampleButton
				status={url === null ? "none" : status}
				subject={`${voice.name} ${sampleKindOf(voice)}`}
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
				// 이름이 잘리면 마우스를 올려 전체 이름을 본다. 행을 덮는 after 덮개가 안쪽 span 위에 그려지므로 버튼에 둔다(접근 이름은 aria-labelledby가 앞선다).
				// Gemini 설명 첫 마디도 잘리므로 같은 자리에서 다음 줄로 본다
				title={tagline ? `${voice.name}\n${tagline}` : voice.name}
				ref={selectRef}
				tabIndex={tabbable === 1 || (tabbable === 0 && url === null) ? 0 : -1}
				onClick={(event) => onSelect(voice, event.currentTarget)}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-ring focus-visible:after:-outline-offset-2"
			>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex min-w-0 items-baseline gap-1.5">
						{/* 이름 끝 번호는 말줄임에서 빼 늘 보인다(critique P1). 두 span이 같은 id 안이라 접근 이름은 전체 이름이다 */}
						<span
							id={`${id}-name`}
							className={cn("font-bold", name ? "flex min-w-0" : "truncate")}
						>
							{name ? (
								<>
									<span className="truncate">{name.body}</span>
									<span className="shrink-0 whitespace-pre">{` ${name.number}`}</span>
								</>
							) : (
								voice.name
							)}
						</span>
						{/* 영문 이름은 남는 자리만 쓴다(basis 0, 내용 너비까지). 좁은 행에서 이름보다 먼저 줄어든다(audit P2-1) */}
						{voice.englishName ? (
							<span
								translate="no"
								className="min-w-0 max-w-fit grow basis-0 truncate text-muted-foreground text-sm"
							>
								{voice.englishName}
							</span>
						) : null}
						{saved?.frequent ? (
							// 목록 칸 20rem 미만(320px)에서는 이름 자리를 위해 숨긴다. 화면 밖 설명이 '자주 사용'을 읽는다(QA F3)
							<Badge
								aria-hidden="true"
								variant="secondary"
								className="@max-xs:hidden font-normal"
							>
								{LIBRARY_TEXT.frequent}
							</Badge>
						) : null}
						{playing || trialPlaying ? (
							<Badge variant="primary">재생 중</Badge>
						) : null}
					</span>
					<span
						id={`${id}-detail`}
						className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm"
					>
						<span className="truncate">{metaLine(voice)}</span>
						{/* 남는 자리만 쓴다(basis 0, 내용 너비까지). 한 줄 높이에 줄바꿈을 두어 들어가지 못한 알약은 다음 줄로 넘어가 숨는다 */}
						{/* 내 분류는 앞에 태그 아이콘을 두어 공급자 알약과 구별하고(critique P2), 좁은 칸에서도 1개 + '+N'으로 남는다.
						    한 줄에는 항목이 적어도 하나 들어가므로 맨 앞의 폭 0·높이 20px 자리가 첫 줄을 맡는다. 내 분류는 한 덩어리라
						    다 들어가지 못하면 조각으로 잘리지 않고 통째로 숨은 다음 줄로 간다(r24 320px 캐스팅) */}
						{pills.all.length > 0 ? (
							<span
								aria-hidden="true"
								className={cn(
									"h-5 min-w-0 max-w-fit grow basis-0 flex-wrap items-center gap-x-1.5 overflow-hidden",
									own ? "flex" : "@md:flex hidden",
								)}
							>
								{own ? (
									<>
										<span className="-mr-1.5 h-5" />
										{/* 태그·칩·'+N'은 한 덩어리다. basis 0이라 줄바꿈 기준이 최소 너비(칩은 글자 하나)이고, 자리가 모자라면 칩이 먼저 말줄임되며 '+N'은 늘 보인다.
										    좁은 칸(28rem 미만)은 첫 칩이 줄지 않는다(1개 + '+N'). 최소 너비도 들어가지 않으면 덩어리가 통째로 다음 줄로 가 숨는다(QA F2, 브리프 B8) */}
										<span className="flex grow basis-0 items-center gap-1.5">
											<Tag className="size-3 shrink-0 text-muted-foreground" />
											{pills.shown.map(({ key: pillKey, label }, index) => (
												<span
													key={pillKey}
													className={cn(
														pillClass,
														index === 0
															? "@md:line-clamp-1 @max-md:shrink-0 @md:whitespace-normal @md:break-all"
															: "line-clamp-1 @max-md:hidden whitespace-normal break-all",
													)}
												>
													{label}
												</span>
											))}
											{pills.narrowRest > 0 ? (
												<span className={cn(pillClass, "@md:hidden shrink-0")}>
													+{pills.narrowRest}
												</span>
											) : null}
											{pills.rest > 0 ? (
												<span
													className={cn(pillClass, "@max-md:hidden shrink-0")}
												>
													+{pills.rest}
												</span>
											) : null}
										</span>
									</>
								) : (
									<>
										{pills.shown.map(({ key: pillKey, label }, index) => (
											<span
												key={pillKey}
												className={cn(pillClass, index > 0 && "@max-md:hidden")}
											>
												{label}
											</span>
										))}
										{pills.rest > 0 ? (
											<span className={cn(pillClass, "@max-md:hidden")}>
												+{pills.rest}
											</span>
										) : null}
									</>
								)}
							</span>
						) : null}
						<span className="sr-only">
							{saved?.frequent ? `, ${LIBRARY_TEXT.frequent}` : ""}
							{pills.all.length > 0
								? `, ${own ? "내 분류" : "공급자 분류"}: ${pills.all.join(", ")}`
								: ""}
							{secondary.length > 0 ? `, ${secondary.join(", ")}` : ""}
							{tagline ? `, ${tagline}` : ""}
							{badges.length > 0 ? `, ${badges.join(", ")}` : ""}
						</span>
						{status === "failed" ? (
							<span className="shrink-0 text-warning">재생하지 못했어요</span>
						) : null}
						{trialProblem ? (
							<span className="shrink-0 text-warning">
								{TRIAL_SHORT_PROBLEM}
								<span id={`${id}-trial`} className="sr-only">
									: {trialProblemText(voice.provider, trialProblem).text}
								</span>
							</span>
						) : null}
					</span>
					{badgeList("flex flex-wrap gap-1 @[36rem]:hidden")}
				</span>
				<span className="@[36rem]:flex hidden w-36 shrink-0 flex-col items-end gap-1">
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
					{tagline ? (
						<span
							aria-hidden="true"
							className="max-w-full truncate text-muted-foreground text-sm"
						>
							{tagline}
						</span>
					) : null}
					{badgeList("flex max-w-full flex-wrap justify-end gap-1")}
				</span>
			</button>
			{trial ? (
				<TrialButton
					voice={voice}
					tabIndex={tabbable === 2 ? 0 : -1}
					describedBy={trialProblem ? `${id}-trial` : undefined}
					onPick={
						panelId
							? () => selectRef.current && onSelect(voice, selectRef.current)
							: undefined
					}
				/>
			) : null}
			<SavedStar
				voice={voice}
				tabIndex={tabbable === (trial ? 3 : 2) ? 0 : -1}
			/>
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
	// 마지막 칸은 별이다(캐스팅은 내 문장 듣기 뒤 3, 보관함은 2)
	const trial = useOptionalTrial();
	const lastCol: Col = trial ? 3 : 2;
	const keys = voices.map(voiceKey);
	const stop = tabStop(keys, focused, selectedKey);

	// 포커스한 버튼의 칸: 행 번호와 행 안 버튼 순서(roving.ts의 칸 번호)
	function cellOf(list: HTMLUListElement, target: EventTarget): Cell | null {
		if (!(target instanceof HTMLButtonElement)) return null;
		const item = target.closest("li");
		if (item?.parentElement !== list) return null;
		const col = [...item.querySelectorAll("button")].indexOf(target);
		if (col < 0 || col > lastCol) return null;
		return { row: [...list.children].indexOf(item), col: col as Col };
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
			? navigate(
					event.key,
					from,
					keys,
					focused,
					(row) => {
						const play = buttons(row)?.[0];
						return play !== undefined && !play.disabled;
					},
					lastCol,
				)
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
				방향키로 성우와 버튼 사이를 옮겨요
			</span>
		</>
	);
}
