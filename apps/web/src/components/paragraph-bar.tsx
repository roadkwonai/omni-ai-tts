// apps/web/src/components/paragraph-bar.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ChevronDown,
	Coins,
	Download,
	Play,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import {
	Fragment,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { toast } from "sonner";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	fillOf,
	type MakeState,
	makePlan,
	receivePlan,
	usageByProvider,
} from "@/lib/make-all";
import { blankFor } from "@/lib/paragraph-script";
import { blockText, makeProblemText, PARAGRAPH_TEXT } from "@/lib/studio-text";
import { STUDIO_TEXT } from "@/lib/studio-view";
import { usageText } from "@/lib/trial-view";

import { useBarHeight, useElapsed, WAIT_NOTE_AFTER } from "./bar-height";
import { ParagraphMakeConfirm } from "./paragraph-confirm";
import { paragraphHeadId, showParagraph } from "./paragraph-focus";
import {
	type ReceiveKind,
	type Shown,
	useShownParagraphs,
	useWork,
} from "./paragraph-provider";
import { SummarySheet } from "./paragraph-rails";
import { usePlayer } from "./sample-player";
import { TrialConfirm } from "./trial-confirm";
import { menuItem } from "./voice-conditions";
import { lockedButton } from "./voice-problem";

// 문단 작업실 막대(T10 브리프 4·5.7·6.3). 가운데 열 바닥에 붙는다(sticky). DOM은 카드 목록 바로 뒤다.
// 결과 칸(진행·받는 중·플레이어·안내) | 동작 칸 [요약 칩(1단)][주 버튼][이어 듣기][받기 ▾] 그 아래 한 줄 칸 하나(오류 → 막는 이유 → 20초 안내 → 도움 줄).
// 주 버튼 자리는 '전체 만들기'·'이어서 만들기'·'멈추기'가 같은 요소라 만들기를 시작하거나 멈춰도 포커스와 확인 창 복귀 자리가 남는다.
// 늦춘 문단으로 셈하고(E10) 판단은 lib 순수 함수(makePlan·receivePlan·usageByProvider·fillOf·makeProblemText·blockText)만 부른다.
// 띠 높이를 <html>의 --studio-bar-height(px)로 알려 scroll-padding·알림 간격이 쓴다

// 늘 그려 둔 화면 밖 알림(브리프 6.3): 시작·내가 멈춤만. 오류 멈춤은 한 줄 칸의 role="alert"가 한 번 읽는다.
// 끝은 토스트 하나다(sonner가 자기 live 영역으로 읽어 status까지 말하면 두 번이다). 만든 문단이 없어 토스트가 없는 끝만 여기서 읽는다
// (모두 지워 건너뛰었으면 남긴 문단도 없어 말하지 않는다)
function statusOf(make: MakeState, untoasted: boolean) {
	if (make.phase === "making" || make.phase === "stopping")
		return PARAGRAPH_TEXT.started(make.queue.length);
	if (make.phase === "stopped")
		return make.stopped?.problem ? "" : PARAGRAPH_TEXT.stopped;
	return untoasted && make.left.length > 0
		? PARAGRAPH_TEXT.editedSkipped(make.left.length)
		: "";
}

// 한 줄 칸 한 줄. 경고면 TriangleAlert, 이동·조치 단추는 글 아래
function Line({
	id,
	warn = false,
	alert = false,
	text,
	children,
}: {
	id: string;
	warn?: boolean;
	alert?: boolean;
	text: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-start gap-1 md:items-end">
			<p
				id={id}
				role={alert ? "alert" : undefined}
				className={cn(
					"flex gap-2 text-sm tabular-nums md:text-right",
					warn ? "text-warning" : "text-muted-foreground",
				)}
			>
				{warn ? (
					<TriangleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0"
					/>
				) : null}
				{text}
			</p>
			{children ? (
				<div className="flex flex-wrap items-center gap-x-3 md:justify-end">
					{children}
				</div>
			) : null}
		</div>
	);
}

// 공급자별 금액 한 줄(브리프 4절 '만들 수 있음'). 공급자 이름은 번역하지 않는다(확인 창 ProviderRow와 같다)
function UsageLine({ rows }: { rows: ReturnType<typeof usageByProvider> }) {
	return (
		<span>
			{rows.map((row, i) => (
				<Fragment key={row.provider}>
					{i > 0 ? " · " : null}
					<span translate="no">{PROVIDER_LABEL[row.provider]}</span>{" "}
					{usageText(row.usage)}
				</Fragment>
			))}
		</span>
	);
}

function ShowLink({ id, n }: { id: string; n: number }) {
	return (
		<Button variant="link" size="lg" onClick={() => showParagraph(id)}>
			{PARAGRAPH_TEXT.show(n)}
		</Button>
	);
}

// 결과 플레이어(T9 그대로 <audio controls>, 접근 이름은 캡션). 새로 올린 소리는 바로 튼다(카드 ▶·이어 듣기를 누른 결과다).
// 한 번에 한 오디오(REQ-03): 기본 샘플이 울리면 멈추고, 이것을 틀면 샘플을 멈춘다. 플레이어를 읽으므로 잎으로 둔다
function BarPlayer({ shown }: { shown: Shown }) {
	const player = usePlayer();
	const audioRef = useRef<HTMLAudioElement>(null);
	const captionId = useId();
	const sampling =
		player.current !== null && player.current.status !== "failed";
	useEffect(() => {
		if (sampling) audioRef.current?.pause();
	}, [sampling]);
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<p id={captionId} className="truncate text-muted-foreground text-sm">
				{shown.kind === "paragraph"
					? PARAGRAPH_TEXT.listenCaption(shown.n, shown.voiceName, shown.text)
					: PARAGRAPH_TEXT.joinCaption(shown.seconds)}
			</p>
			{/* biome-ignore lint/a11y/useMediaCaption: 만든 음성의 글은 문단 카드에 있다(생성 오디오에는 자막 트랙이 없다) */}
			<audio
				ref={audioRef}
				key={shown.url}
				controls
				autoPlay
				preload="metadata"
				src={shown.url}
				aria-labelledby={captionId}
				className="w-full min-w-0 lg:max-w-md"
				onPlay={player.stop}
			/>
		</div>
	);
}

// '이어 듣기' + '받기 ▾'(브리프 4·5.7). 받기 트리거는 잠그지 않는다. 받을 수 없으면 맨 위 이유 줄(+ '문단 N 보기')과 꺼진 파일 항목 셋, 트리거 aria-describedby도 같은 이유(D6).
// '이어 듣기'는 받기 트리거 앞 무채색 버튼이고 같은 때(이유·받는 중) 잠기며 같은 이유를 단다(잠겨도 포커스는 받는다).
// '문단 N 보기'는 메뉴가 다 닫힌 뒤 착지한다(열린 채 옮기면 닫히는 동안 포커스를 되가져간다, 카드 ⋯ 메뉴 F12-6). 받는 중에는 Spinner·aria-busy
function ReceiveMenu({
	triggerRef,
	filled,
	reason,
	first,
	count,
	busy,
	onReceive,
}: {
	triggerRef: RefObject<HTMLButtonElement | null>;
	filled: boolean;
	reason: string | null;
	first: { id: string; n: number } | null;
	count: number;
	busy: boolean;
	onReceive: (kind: ReceiveKind) => void;
}) {
	const reasonId = useId();
	const labelId = useId();
	const jump = useRef<string | null>(null);
	const off = reason !== null || busy;
	const item = (kind: ReceiveKind, label: string, note: string) => (
		<DropdownMenuItem
			className={cn(
				menuItem,
				"flex-col items-stretch gap-0.5 data-disabled:opacity-100",
			)}
			disabled={off}
			aria-describedby={reason ? labelId : undefined}
			onClick={() => onReceive(kind)}
		>
			<span className="group-data-disabled/dropdown-menu-item:opacity-50">
				{label}
			</span>
			<span className="text-muted-foreground">{note}</span>
		</DropdownMenuItem>
	);
	return (
		<>
			<Button
				variant="neutral"
				size="lg"
				focusableWhenDisabled
				disabled={off}
				aria-describedby={reason ? reasonId : undefined}
				className={cn("max-md:flex-1", lockedButton(true))}
				onClick={() => onReceive("play")}
			>
				<Play data-icon="inline-start" aria-hidden="true" />
				{PARAGRAPH_TEXT.playAll}
			</Button>
			<DropdownMenu
				onOpenChange={(open) => {
					if (open) jump.current = null;
				}}
				onOpenChangeComplete={(open) => {
					const id = jump.current;
					jump.current = null;
					if (!open && id) showParagraph(id);
				}}
			>
				<DropdownMenuTrigger
					render={
						<Button
							ref={triggerRef}
							variant={filled ? "default" : "neutral"}
							size="lg"
							aria-busy={busy || undefined}
							aria-describedby={reason ? reasonId : undefined}
							className="max-md:flex-1"
						/>
					}
				>
					{busy ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : (
						<Download data-icon="inline-start" aria-hidden="true" />
					)}
					{PARAGRAPH_TEXT.receive}
					<ChevronDown data-icon="inline-end" aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					finalFocus={() => jump.current === null}
					className="w-72 p-1"
				>
					{reason ? (
						<>
							<DropdownMenuGroup>
								<DropdownMenuLabel id={labelId} className="text-sm">
									{reason}
								</DropdownMenuLabel>
								{first ? (
									<DropdownMenuItem
										className={menuItem}
										onClick={() => {
											jump.current = first.id;
										}}
									>
										{PARAGRAPH_TEXT.show(first.n)}
									</DropdownMenuItem>
								) : null}
							</DropdownMenuGroup>
							<DropdownMenuSeparator className="my-1" />
						</>
					) : null}
					<DropdownMenuGroup>
						{item(
							"wav",
							PARAGRAPH_TEXT.receiveWav,
							PARAGRAPH_TEXT.receiveWavNote,
						)}
						{item(
							"zip",
							PARAGRAPH_TEXT.receiveZip,
							PARAGRAPH_TEXT.receiveZipNote(count),
						)}
						{item(
							"srt",
							PARAGRAPH_TEXT.receiveSrt,
							PARAGRAPH_TEXT.receiveSrtNote,
						)}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{/* 메뉴는 닫히면 그리지 않아 트리거 설명은 화면 밖 글로 둔다 */}
			{reason ? (
				<span id={reasonId} className="sr-only">
					{reason}
				</span>
			) : null}
		</>
	);
}

export function ParagraphBar({
	madeFrom,
}: {
	// 마지막으로 '만들기'를 누른 카드 id(문단 하나 확인 창이 닫힐 때 돌아갈 숨은 제목)
	madeFrom: RefObject<string | null>;
}) {
	const work = useWork();
	const ps = useShownParagraphs();
	const bandRef = useRef<HTMLElement>(null);
	const mainRef = useRef<HTMLButtonElement | null>(null);
	const receiveRef = useRef<HTMLButtonElement>(null);
	// 주 버튼이 포커스를 가진 채 떼어졌다. ref를 떼는 때는 DOM에서 빼기 전이라 포커스가 아직 그 버튼에 있다
	const mainLost = useRef(false);
	// 문단 하나 확인 창을 '만들기'로 닫았다(그 카드의 '만들기'는 곧 '만드는 중'으로 빠진다)
	const oneConfirmed = useRef(false);
	const setMain = useCallback((button: HTMLButtonElement | null) => {
		if (!button)
			mainLost.current =
				mainRef.current !== null && mainRef.current === document.activeElement;
		mainRef.current = button;
	}, []);
	const lineId = useId();
	const reasonId = useId();
	const {
		restored,
		voices,
		voicesLoad,
		findState,
		found,
		make,
		now,
		receiving,
		shown,
	} = work;
	const meta = work.work;
	const running = make.phase === "making" || make.phase === "stopping";
	const elapsed = useElapsed(running ? make.since : null);
	const { plan, receive, filled } = useMemo(() => {
		const all = { ...meta, paragraphs: ps };
		return {
			plan: voices ? makePlan(ps, all, voices, found, now) : null,
			receive: receivePlan(ps, all, voices, found, now),
			filled: ps.filter((p) => !blankFor(p, all)).length,
		};
	}, [ps, meta, voices, found, now]);
	const numberOf = (id: string) => ps.findIndex((p) => p.id === id) + 1;

	// 확인 중: 성우 목록을 받는 중이거나 복원 뒤 첫 찾기 전(입력 뒤 배경 찾기는 잠그지 않는다, '스펙과 다른 점' 27)
	const voicesFailed = voicesLoad === "failed";
	const checking = voicesLoad === "loading" || findState === "first";
	const ready = restored && plan !== null && !checking;
	const noScript = restored && !receive.ok && receive.reason === "empty";
	const allMade =
		ready && !noScript && plan.make.length === 0 && !plan.firstBlocked;
	const stopped = make.phase === "stopped" ? make.stopped : null;
	const problem = stopped?.problem ?? null;
	// 429 대기 시각까지 '이어서 만들기'를 잠근다(now는 1분마다 바뀐다)
	const waiting =
		problem?.reason === "rate_limit" &&
		problem.retryAt !== null &&
		Date.parse(problem.retryAt) > now;
	const count = ready && !plan.firstBlocked ? plan.make.length : 0;
	const mainShown = running || !allMade;
	const mainLocked = running
		? make.phase === "stopping"
		: !ready || noScript || plan.firstBlocked !== null || waiting;
	const fill = fillOf(
		ps,
		{ ...meta, paragraphs: ps },
		(mainShown && !running && !mainLocked) || allMade,
	);
	const paid = count > 0 && plan !== null && !plan.free;
	const finding = make.phase === "finding";
	// 큐를 끝까지 돌았다. 시작 전 찾기 실패(findFailed)는 지난 실행의 큐를 그대로 둔 채 idle로 오므로 notice로 가른다
	const ended =
		make.phase === "idle" &&
		make.notice === null &&
		make.queue.length > 0 &&
		make.at >= make.queue.length;

	useBarHeight(bandRef);
	// 끝 알림(브리프 6.3). 실행마다 한 번
	const endRun = ended ? make.run : null;
	// 결과가 생긴 문단만 센다(남김·지움으로 건너뛴 문단은 빼고, F30-1)
	const endText =
		ended && make.made > 0 ? PARAGRAPH_TEXT.done(make.made) : null;
	useEffect(() => {
		if (endRun !== null && endText) toast(endText);
	}, [endRun, endText]);
	// 포커스가 있던 주 버튼이 사라지면(만들기가 끝나 모두 만듦) 그 자리를 이어받은 '받기'로 옮긴다(포커스가 문서 밖으로 빠지지 않게)
	useLayoutEffect(() => {
		if (!mainLost.current) return;
		mainLost.current = false;
		if (!mainRef.current) receiveRef.current?.focus();
	});

	// 한 줄 칸(하나만): 오류 → 막는 이유 → 20초 안내 → 도움 줄
	function lineOf(): ReactNode {
		if (running) {
			if (make.phase === "stopping")
				return <Line id={lineId} text={PARAGRAPH_TEXT.stopping} />;
			return elapsed >= WAIT_NOTE_AFTER ? (
				<Line id={lineId} text={PARAGRAPH_TEXT.waitNote} />
			) : null;
		}
		if (!restored) return null;
		if (stopped && problem) {
			const no = numberOf(stopped.id);
			const reason = makeProblemText(stopped.provider, problem);
			return (
				// key: 실행마다 새로 붙여야 role="alert"가 읽힌다(있던 칸에 글만 바뀌면 낭독기가 놓칠 수 있다)
				<Line
					key={`stop-${make.run}`}
					id={lineId}
					warn
					alert
					text={PARAGRAPH_TEXT.stoppedAt(no || stopped.n, reason.text)}
				>
					{no ? <ShowLink id={stopped.id} n={no} /> : null}
					{reason.connections ? (
						<Button
							variant="link"
							size="lg"
							nativeButton={false}
							render={<Link href="/connections" />}
						>
							{STUDIO_TEXT.connections}
						</Button>
					) : null}
				</Line>
			);
		}
		if (voicesFailed)
			return (
				<Line id={lineId} warn text={PARAGRAPH_TEXT.voicesFailed}>
					<Button
						variant="link"
						size="lg"
						aria-busy={work.voicesFetching || undefined}
						onClick={() => {
							if (!work.voicesFetching) work.reloadVoices();
						}}
					>
						{work.voicesFetching ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						{PARAGRAPH_TEXT.reload}
					</Button>
				</Line>
			);
		if (make.notice === "find_failed")
			return (
				<Line
					key={`not-started-${make.run}`}
					id={lineId}
					warn
					alert
					text={PARAGRAPH_TEXT.notStarted}
				/>
			);
		if (findState === "failed")
			return (
				<Line id={lineId} warn text={PARAGRAPH_TEXT.findFailed}>
					<Button variant="link" size="lg" onClick={work.refind}>
						{PARAGRAPH_TEXT.refind}
					</Button>
				</Line>
			);
		if (checking) return <Line id={lineId} text={PARAGRAPH_TEXT.finding} />;
		if (!plan) return null;
		const blocked = plan.firstBlocked;
		if (blocked)
			return (
				<Line
					id={lineId}
					warn
					text={PARAGRAPH_TEXT.blockedAt(
						blocked.n,
						blockText(blocked.block, false),
					)}
				>
					<ShowLink id={blocked.id} n={blocked.n} />
				</Line>
			);
		if (receiving) return <Line id={lineId} text={PARAGRAPH_TEXT.cantStop} />;
		// 눌렀는데 새로 만들 문단이 없었으면 그 말, 아니면 도움 줄(고쳐서 만들 문단이 생기면 notice가 남아도 보이지 않는다)
		if (allMade)
			return (
				<Line
					id={lineId}
					text={
						make.notice === "nothing"
							? PARAGRAPH_TEXT.nothingNew
							: PARAGRAPH_TEXT.receiveFree
					}
				/>
			);
		if (stopped)
			return <Line id={lineId} text={PARAGRAPH_TEXT.stoppedLeft(count)} />;
		const left = make.left.find((id) => numberOf(id) > 0);
		if (left)
			return (
				<Line id={lineId} text={PARAGRAPH_TEXT.editedSkipped(make.left.length)}>
					<ShowLink id={left} n={numberOf(left)} />
				</Line>
			);
		if (count === 0) return null;
		// 모두 무료여도 미확인 문단이 있으면 확인 창이 뜨고 무료 줄 대신 미확인 문구다(브리프 4절). 유료면 금액 줄(확인 창이 경고한다)
		const unknown = plan.free
			? plan.make.find((item) => plan.unknown.includes(item.signature))
			: undefined;
		if (unknown)
			return (
				<Line
					id={lineId}
					warn
					text={PARAGRAPH_TEXT.unknownOutcome(unknown.request.provider)}
				/>
			);
		return (
			<Line
				id={lineId}
				text={
					plan.free ? (
						PARAGRAPH_TEXT.freeLine
					) : (
						<UsageLine rows={usageByProvider(plan.estimate, work.rates, now)} />
					)
				}
			/>
		);
	}
	const line = lineOf();

	// 결과 칸: 진행 줄·받는 중(있으면) 위, 플레이어(들은 것이 있으면) 아래, 둘 다 없으면 회색 안내(767px 이하에서는 줄째 접는다)
	const item = running ? make.queue[make.at] : undefined;
	const itemNo = item ? numberOf(item.id) || item.n : 0;
	const progress = item ? (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center gap-x-3">
				<p className="text-sm tabular-nums">
					{PARAGRAPH_TEXT.progress(
						make.at + 1,
						make.queue.length,
						itemNo,
						elapsed,
					)}
				</p>
				<ShowLink id={item.id} n={itemNo} />
			</div>
			{/* 끝낸 문단 수만큼(가짜 진행률 없음). 무채색(D9) */}
			<span
				aria-hidden="true"
				className="block h-1 w-full overflow-hidden rounded-full bg-muted"
			>
				<span
					className="block h-full rounded-full bg-foreground"
					style={{ width: `${(make.at / make.queue.length) * 100}%` }}
				/>
			</span>
		</div>
	) : receiving ? (
		<p className="text-sm tabular-nums">
			{receiving.phase === "join"
				? PARAGRAPH_TEXT.joining
				: PARAGRAPH_TEXT.receivingAt(
						Math.min(receiving.done + 1, receiving.total),
						receiving.total,
					)}
		</p>
	) : null;
	// 만든 문단이 하나라도 있으면(안 만든 수 < 비지 않은 수) 듣기 안내(F13-2)
	const someMade =
		!receive.ok && receive.reason === "unmade" && receive.unmade < filled;
	const hint = !restored
		? null
		: noScript
			? PARAGRAPH_TEXT.pasteHint
			: allMade
				? PARAGRAPH_TEXT.allMadeHint
				: someMade
					? PARAGRAPH_TEXT.listenHint
					: PARAGRAPH_TEXT.resultHint;

	const mainLabel = running
		? PARAGRAPH_TEXT.stop
		: count > 0
			? stopped
				? PARAGRAPH_TEXT.makeRest(count)
				: PARAGRAPH_TEXT.makeAll(count, plan?.free ?? false)
			: stopped
				? PARAGRAPH_TEXT.makeRestPlain
				: PARAGRAPH_TEXT.makeAllPlain;
	const mainFilled = !running && fill === "bar";
	const receiveReason = receive.ok
		? null
		: voicesFailed
			? PARAGRAPH_TEXT.voicesFailed
			: checking
				? PARAGRAPH_TEXT.finding
				: receive.reason === "empty"
					? PARAGRAPH_TEXT.nothingToReceive
					: PARAGRAPH_TEXT.unmadeLeft(receive.unmade);
	const one = work.confirming?.kind === "one" ? work.confirming.pending : null;
	const receiveFirst =
		!receive.ok && receive.reason === "unmade" && !checking && !voicesFailed
			? { id: receive.firstId, n: numberOf(receive.firstId) }
			: null;

	return (
		<section
			ref={bandRef}
			id="paragraph-bar"
			aria-label={PARAGRAPH_TEXT.barLabel}
			tabIndex={-1}
			// 767px 이하는 바닥에 붙은 판(카드색, 위 모서리만 둥글게, 본문 여백 밖까지), 768px 이상은 바탕색 띠 안에 뜬 카드. z-5는 앱 메뉴(z-10) 아래다
			className="studio-bar-scroll sticky bottom-0 z-5 focus-visible:outline-2 focus-visible:outline-ring max-md:-mx-4 max-md:rounded-t-2xl max-md:bg-card max-md:px-4 max-md:pt-3 max-md:pb-4 max-md:ring-1 max-md:ring-border md:bg-background md:pt-3 md:pb-4"
		>
			<div className="flex flex-col gap-3 md:rounded-2xl md:bg-card md:p-4 md:ring-1 md:ring-border md:ring-inset">
				<div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
					{progress || shown || hint ? (
						// 767px 이하에서 대본 칸에 포커스가 있는 동안(소프트 키보드) 숨는다(studio-bar-result)
						<div
							className={cn(
								"studio-bar-result flex min-w-0 flex-col gap-2 md:min-w-60 md:flex-1",
								!progress && !shown && "max-md:hidden",
							)}
						>
							{progress}
							{shown ? <BarPlayer shown={shown} /> : null}
							{!progress && !shown ? (
								<p className="text-muted-foreground text-sm">{hint}</p>
							) : null}
						</div>
					) : null}
					{/* DOM은 요약 칩 → 주 버튼 → 받기(브리프 7절). 767px 이하는 한 줄로 흐르고(320에서 안 들어가면 칩이 위 줄, D22),
					    768px 이상은 주 버튼을 오른쪽 끝에 둔다 */}
					<div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
						<div className="contents @4xl:hidden">
							{restored ? <SummarySheet /> : null}
						</div>
						<div className="max-md:contents md:flex md:flex-row-reverse md:gap-2">
							{mainShown ? (
								<Button
									ref={setMain}
									variant={mainFilled ? "default" : "neutral"}
									size="lg"
									className={cn(
										"tabular-nums max-md:flex-1",
										lockedButton(mainLocked),
									)}
									focusableWhenDisabled
									disabled={mainLocked}
									aria-busy={finding || undefined}
									aria-describedby={
										line ? lineId : noScript && !running ? reasonId : undefined
									}
									onClick={(event) => {
										if (running) work.stop();
										else work.makeAll(event.currentTarget);
									}}
								>
									{finding ? (
										<Spinner data-icon="inline-start" aria-hidden="true" />
									) : !running && paid ? (
										// 채운 청록 버튼 안은 글자색, 테두리 버튼 위는 경고색(DESIGN.md 사용량 표식)
										<Coins
											data-icon="inline-start"
											aria-hidden="true"
											className={mainFilled ? undefined : "text-warning"}
										/>
									) : null}
									{mainLabel}
								</Button>
							) : null}
							{/* 만드는 중 막대에는 '받기'가 없다(브리프 머리). 복원 전에도 없다 */}
							{!running && restored ? (
								<ReceiveMenu
									triggerRef={receiveRef}
									filled={allMade && fill === "bar"}
									reason={receiveReason}
									first={receiveFirst}
									// 꺼졌을 때도 비지 않은 문단 수(받을 수 있게 되면 같은 수다, F13-1)
									count={filled}
									busy={receiving !== null}
									onReceive={work.receive}
								/>
							) : null}
						</div>
					</div>
				</div>
				{line ? <div className="min-w-0">{line}</div> : null}
				{noScript && !line ? (
					<span id={reasonId} className="sr-only">
						{PARAGRAPH_TEXT.nothingToMake}
					</span>
				) : null}
				<p role="status" className="sr-only">
					{statusOf(make, ended && endText === null)}
				</p>
			</div>
			<ParagraphMakeConfirm finalFocus={() => mainRef.current ?? true} />
			{/* 카드 '만들기'(문단 하나). 미확인이면 무료여도 중복 과금 경고가 있는 이 창이다('스펙과 다른 점' 22) */}
			<TrialConfirm
				kind="studio"
				pending={one}
				onClose={() => {
					oneConfirmed.current = false;
					work.cancel();
				}}
				onConfirm={() => {
					oneConfirmed.current = true;
					work.confirm();
				}}
				// 취소면 연 '만들기'로. 만들기로 닫았거나 그 단추가 이미 빠졌으면 그 카드 숨은 제목(body로 떨어지지 않게)
				finalFocus={() => {
					const opener = one?.opener;
					if (opener?.isConnected && !oneConfirmed.current) return opener;
					const id = madeFrom.current;
					return (id && document.getElementById(paragraphHeadId(id))) || true;
				}}
			/>
		</section>
	);
}
