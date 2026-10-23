// apps/web/src/components/drama-bar.tsx
"use client";

import { takeKey } from "@tts-pilot-app/api/drama-script";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	AudioLines,
	ChevronDown,
	Coins,
	Download,
	ExternalLink,
	FileAudio,
	FolderDown,
	Play,
	Square,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useDeferredValue, useId, useRef } from "react";

import {
	allPrepared,
	joinPlaying,
	readPaid,
	readRequests,
} from "@/lib/drama-read";
import {
	type BarReason,
	barReason,
	countLine,
	DRAMA_TEXT,
	dramaBlock,
	dramaModelsOf,
	dramaProblemText,
	FREE_MODEL,
	readBlockOf,
	splitWarning,
} from "@/lib/drama-view";

import { useBarHeight, useElapsed, WAIT_NOTE_AFTER } from "./bar-height";
import {
	DRAMA_MAIN_ID,
	dramaFieldId,
	useDrama,
	useLines,
	useScriptKey,
} from "./drama-provider";
import { useDramaRead, useReadCtx } from "./drama-read";
import { TakePlayer, useTakeAudio } from "./drama-take";
import { DRAMA_TAKES_ID } from "./drama-takes";
import { speakerFieldId } from "./drama-voice-dialog";
import { usePlayer } from "./sample-player";
import { menuItem } from "./voice-conditions";
import { lockedButton } from "./voice-problem";

const RESULT_CLASS = "drama-bar-result min-w-0 lg:flex-1";

// 16절 받기와 '이어 듣기'가 꺼지는 때: 복원 전·읽거나 받는 중·잇는 중·장면을 만드는 중
const saveOffOf = (
	drama: ReturnType<typeof useDrama>,
	read: ReturnType<typeof useDramaRead>,
) =>
	!drama.ready ||
	read.state.phase !== "idle" ||
	read.joining ||
	drama.generating !== null;

// '받기' 메뉴(스펙 17.2 '받기 메뉴', 브리프 17절 받기 메뉴 표). 늘 보인다.
// 테이크 모드면 무대 테이크의 파일이다: 장면 파일 → 쉼 넣어 한 파일로(나뉘었고 지금 대본과 같을 때) → 대사별 파일(나뉘었을 때).
// 받는 중·장면을 만드는 중·복원 전에는 꺼지고, 받는 중 알림은 무대의 화면 밖 상태 글이 말한다.
// 그 밖에는 16절 받기(읽지 않고 대본 전체를 한 파일·줄마다)다. 받거나 잇는 동안 트리거 앞 아이콘이 Spinner이고 aria-busy
// (받는 줄 수는 주 버튼, 잇는 중 알림은 막대의 화면 밖 상태 글). 막는 이유는 누른 뒤 알림으로 말하고, 확인 창은 닫히면 이 트리거(opener)로 돌아온다.
// 640px 미만은 앞 아이콘을 숨겨 320px에서도 주 버튼과 한 줄에 든다. 받는 중에는 스피너가 화살표 자리를 쓴다
function SaveMenu() {
	const drama = useDrama();
	const read = useDramaRead();
	const take = useTakeAudio();
	const scriptKey = useScriptKey();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const shown = take.mode ? take.take : null;
	const { phase, mode } = read.state;
	const busy = shown
		? take.busy
		: (mode === "save" && phase !== "idle") || read.joining;
	const off = shown
		? take.busy || drama.generating !== null || !drama.ready
		: saveOffOf(drama, read);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						ref={triggerRef}
						variant="outline"
						size="lg"
						aria-busy={busy}
					/>
				}
			>
				{busy ? (
					<Spinner data-icon="inline-start" aria-hidden="true" />
				) : (
					<Download
						data-icon="inline-start"
						aria-hidden="true"
						className="max-sm:hidden"
					/>
				)}
				{DRAMA_TEXT.saveMenu}
				<ChevronDown
					data-icon="inline-end"
					aria-hidden="true"
					className={busy ? "max-sm:hidden" : undefined}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-48 p-1">
				{shown ? (
					<DropdownMenuGroup>
						<DropdownMenuItem
							className={menuItem}
							disabled={off}
							onClick={take.saveScene}
						>
							<FileAudio aria-hidden="true" />
							{DRAMA_TEXT.saveSceneFile}
						</DropdownMenuItem>
						{/* 쉼은 지금 대본의 줄 쉼이라 같은 대본일 때만 잇는다 */}
						{take.split && takeKey(shown.request) === scriptKey ? (
							<DropdownMenuItem
								className={menuItem}
								disabled={off}
								onClick={take.saveJoined}
							>
								<AudioLines aria-hidden="true" />
								{DRAMA_TEXT.saveTakeJoin}
							</DropdownMenuItem>
						) : null}
						{take.split ? (
							<DropdownMenuItem
								className={menuItem}
								disabled={off}
								onClick={take.saveAll}
							>
								<FolderDown aria-hidden="true" />
								{DRAMA_TEXT.saveTakeZip}
							</DropdownMenuItem>
						) : null}
					</DropdownMenuGroup>
				) : (
					<DropdownMenuGroup>
						<DropdownMenuItem
							className={menuItem}
							disabled={off}
							onClick={() => read.save("wav", triggerRef.current)}
						>
							<FileAudio aria-hidden="true" />
							{DRAMA_TEXT.joinSave}
						</DropdownMenuItem>
						<DropdownMenuItem
							className={menuItem}
							disabled={off}
							onClick={() => read.save("zip", triggerRef.current)}
						>
							<FolderDown aria-hidden="true" />
							{DRAMA_TEXT.readZip}
						</DropdownMenuItem>
					</DropdownMenuGroup>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 혼합 대본 결과 칸의 '이어 듣기'(스펙 17.2 '혼합 이어 듣기'): 16절 이어 듣기 그대로(호출 없음, 페이지 플레이어, <audio>로 그리지 않는다).
// 모든 줄 소리가 준비됐거나 이어 듣는 중이면 단추, 아니면 회색 안내다(듣는 사이 대본을 고쳐도 '이어 듣기 멈춤'이 사라지지 않게).
// 꺼짐은 16절 받기와 같고 이어 듣는 중의 '이어 듣기 멈춤'만 늘 누를 수 있다. 잇는 중이면 잠그되 흐리지 않고 aria-busy와 Spinner다(P5-22).
// 플레이어를 읽으므로 잎으로 둔다(소리가 바뀔 때 막대 전체를 다시 그리지 않게)
function JoinButton({
	prepared,
	className,
}: {
	prepared: boolean;
	className: string;
}) {
	const drama = useDrama();
	const read = useDramaRead();
	const playing = joinPlaying(usePlayer().current);
	const off = saveOffOf(drama, read);
	if (!prepared && !playing)
		return (
			<div className={cn(className, "max-md:hidden")}>
				<p className="text-muted-foreground text-sm">{DRAMA_TEXT.resultJoin}</p>
			</div>
		);
	return (
		<div className={className}>
			<Button
				variant="outline"
				size="lg"
				className={lockedButton(off && !playing && !read.joining)}
				focusableWhenDisabled
				disabled={off && !playing}
				aria-busy={read.joining || undefined}
				onClick={(event) => {
					read.save("play", event.currentTarget);
					// 고친 대본을 이어 듣다 멈추면 이 단추가 회색 안내로 바뀌므로 포커스는 주 버튼으로
					if (playing && !prepared)
						document.getElementById(DRAMA_MAIN_ID)?.focus();
				}}
			>
				{read.joining ? (
					<Spinner data-icon="inline-start" aria-hidden="true" />
				) : playing ? (
					<Square data-icon="inline-start" aria-hidden="true" />
				) : (
					<Play data-icon="inline-start" aria-hidden="true" />
				)}
				{playing ? DRAMA_TEXT.joinStop : DRAMA_TEXT.joinPlay}
			</Button>
		</div>
	);
}

// 하단 막대(브리프 17절 9, 음성 작업실 막대와 같은 배치). 화면 바닥에 붙지만 DOM은 대본 바로 뒤라 Tab이 대본에서 몇 번 만에 주 버튼에 닿는다(5.1, 7절).
// DOM 순서(모든 너비): 결과 칸 → 동작 칸 [받기][주 버튼] → 한 줄 칸. 1024px 이상은 결과 칸 | 동작 칸 한 줄 아래 한 줄 칸,
// 1023px 이하는 세 줄이고 767px 이하에서 입력 칸(장면 이름·화자 이름·대본 줄·쉼 칸)에 포커스가 있으면 결과 칸이 숨는다(drama-bar-result).
// 결과 칸: 테이크 모드면 장면 플레이어(TakePlayer), 혼합 대본은 늘 JoinButton(모든 줄 소리가 준비됐거나 이어 듣는 중이면 '이어 듣기' 아니면 회색 안내),
// Fish 대본에 테이크가 없으면 회색 안내.
// 주 버튼: 읽거나 받는 중이면 '멈춤 · N/M줄'·'멈춤 · 받는 중 N/M줄'(■). 아니면 Fish 대본은 '장면 만들기'와 붙은 ▾('다른 방법': 줄마다 읽기),
// 혼합 대본은 '읽기'다. 주 버튼은 어느 쪽이든 같은 요소라(같은 자리, 같은 부품) 읽기를 시작하거나 끝내도 포커스와 확인 창 복귀 자리가 남는다.
// 서버 동시 1건이라 만드는 중에는 읽기를, 읽거나 받는 중에는 장면 만들기를 막는다. 줄 실패는 줄이 알리므로(role="alert") 막대는 다시 알리지 않는다.
// 줄 목록은 늦춘 값으로 읽는다(입력이 끊는다, 전역 제약). 띠 높이를 <html>의 --studio-bar-height(px)로 알려 열 바닥 여백·scroll-padding·알림 간격이 쓴다.
// 주 버튼 id(DRAMA_MAIN_ID)는 모델을 바꾼 뒤(switchModel)와 무대가 없을 때(stageOrMain) 포커스가 오는 자리다. 확인 창은 누른 버튼(opener)으로 돌아온다
export function DramaBar() {
	const drama = useDrama();
	const read = useDramaRead();
	const take = useTakeAudio();
	const ctxOf = useReadCtx();
	const { lines } = useLines();
	const shownLines = useDeferredValue(lines);
	const bandRef = useRef<HTMLElement>(null);
	const mainRef = useRef<HTMLButtonElement>(null);
	const otherRef = useRef<HTMLButtonElement>(null);
	const lineId = useId();
	const sceneReasonId = useId();
	const readReasonId = useId();
	const { ready, sceneName, speakers, model, settings, fishOnly } = drama;
	const generating = drama.generating !== null;
	const { phase, mode, done, total } = read.state;
	const reading = phase !== "idle";
	const elapsed = useElapsed(drama.generating?.startedAt ?? null);
	const block = dramaBlock({
		sceneName,
		speakers,
		lines: shownLines,
		speed: settings.speed,
	});
	const count = countLine({ speakers, lines: shownLines, model, settings });
	// 무료 모델이면 확인 없이 만든다(provider.start와 같은 판정). 유료면 Coins 표식(브리프 3절)
	const paid = count.usage.unit !== "free";
	// 복원 전이거나 막는 이유가 있으면 잠근다(브리프 6절)
	const locked = !ready || block !== null;
	// 첫 줄부터 읽을 때 막는 이유(브리프 14절): 읽기 시작과 같은 재료(useReadCtx)로 늦춘 줄을 한 번 거른다.
	// 막 바꾼 대본은 읽기 시작이 다시 거른다(DramaReadProvider.start)
	const readCheck =
		ready && shownLines[0]
			? readRequests(
					drama.storedSpeakers,
					shownLines,
					ctxOf(),
					shownLines[0].id,
				)
			: null;
	const readBlock =
		readCheck && "problem" in readCheck
			? readBlockOf(readCheck.problem, speakers, shownLines)
			: null;
	const readLines = readCheck && "lines" in readCheck ? readCheck.lines : null;
	// 유료 확인이 필요한 줄이 있으면 '읽기'에 Coins(스펙 17.2 '읽기 Coins'). 막는 이유가 있으면 붙이지 않는다
	const readCost = readLines !== null && readPaid(readLines);
	const readLocked = !ready || readBlock !== null;
	// 보이는 막는 이유 하나: 주 버튼의 이유, 없으면 읽기의 이유(barReason). 같은 글이면 두 쪽의 이유다.
	// 혼합 대본에는 장면 버튼이 없으므로 장면 이유(섞임)를 보이지 않는다(한 줄 칸이 읽기 예상을 보이게)
	const reason = ready
		? barReason(fishOnly, fishOnly ? block : null, readBlock)
		: null;
	const problem = drama.problem
		? dramaProblemText(drama.problem, drama.problem.speaker)
		: null;
	// 보이지 않는 이유로 잠긴 버튼은 화면 밖 이유 글로 잇는다(9.1 꺼진 것도 닿는다). 오류 줄이 보이면 장면 버튼은 그 오류를 잇는다.
	// Fish 대본의 읽기 이유는 ▾('다른 방법')가 잇는다
	const sceneHidden =
		fishOnly &&
		problem === null &&
		block !== null &&
		!reason?.for.includes("scene");
	const readHidden =
		readBlock !== null && (problem !== null || !reason?.for.includes("read"));
	const readDescribed = readHidden
		? readReasonId
		: reason?.for.includes("read")
			? lineId
			: undefined;
	// 나누지 못함은 장면(Fish 대본)만의 경고다
	const split = fishOnly ? splitWarning(shownLines) : null;
	// 한 줄 칸에 다른 글이 없을 때의 예상(스펙 17.3): Fish 대본은 장면 예상, 혼합 대본은 읽을 줄·글자(유료 화자가 있으면 덧붙임)
	const estimate = !ready
		? null
		: fishOnly
			? DRAMA_TEXT.estimate(count.chars, count.bytes, count.usage)
			: readLines
				? DRAMA_TEXT.readEstimate(shownLines.length, count.chars, readCost)
				: null;
	// '이전 테이크 보기'는 그 구역이 있을 때만(받는 중·0개면 구역이 없다, 5.11)
	const hasTakes =
		(drama.takes?.length ?? 0) > 0 || drama.takesLoad === "failed";

	useBarHeight(bandRef);

	// 막는 이유의 이동 버튼(브리프 5.8, 7절): 성우 없음 → 그 화자의 성우 창(카드의 성우 버튼을 누른다, 두 번째 열기 장치를 두지 않는다),
	// 이름 → 그 이름 칸, 줄 → 그 줄의 문제 칸(dramaBlock·readBlockOf가 정한 대사·지시 칸). 읽기의 성우 없음(voice)은 늘 성우 창이다
	function blockAction(target: BarReason["target"]): ReactNode {
		if (!target) return null;
		if (target.kind === "speaker" || target.kind === "voice") {
			const empty =
				target.kind === "voice" || speakers[target.index]?.voiceId === null;
			return (
				<Button
					variant="link"
					size="lg"
					onClick={() => {
						const field = document.getElementById(
							speakerFieldId(target.index, empty ? "voice" : "name"),
						);
						if (empty) field?.click();
						else field?.focus();
					}}
				>
					{empty ? DRAMA_TEXT.pickVoice : DRAMA_TEXT.toName}
				</Button>
			);
		}
		const n = shownLines.findIndex((line) => line.id === target.id) + 1;
		if (n === 0) return null;
		return (
			<Button
				variant="link"
				size="lg"
				onClick={() =>
					document
						.getElementById(dramaFieldId(target.id, target.field))
						?.focus()
				}
			>
				{DRAMA_TEXT.toLine(n)}
			</Button>
		);
	}

	// 한 줄 칸(한 번에 하나, 이 순서로 이긴다): 오류 → 막는 이유 → 나누지 못함 경고 → 20초 안내 → 예상. 복원 전에는 비운다(브리프 5.8, 6절)
	const slot = !ready ? null : problem ? (
		<div className="flex flex-col items-start gap-1 md:items-end">
			<p
				id={lineId}
				role="alert"
				className="flex gap-2 text-sm text-warning md:text-right"
			>
				<TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				{problem.text}
			</p>
			<div className="flex flex-wrap items-center gap-x-3 md:justify-end">
				{problem.connections ? (
					<Button
						variant="link"
						size="lg"
						nativeButton={false}
						render={<Link href="/connections" />}
					>
						{DRAMA_TEXT.connections}
					</Button>
				) : null}
				{problem.takes && hasTakes ? (
					<Button
						variant="link"
						size="lg"
						onClick={() => document.getElementById(DRAMA_TAKES_ID)?.focus()}
					>
						{DRAMA_TEXT.toTakes}
					</Button>
				) : null}
				{problem.fishCredit ? (
					<>
						<Button
							variant="link"
							size="lg"
							nativeButton={false}
							render={
								<a
									href={DRAMA_TEXT.fishCreditUrl}
									target="_blank"
									rel="noopener noreferrer"
								/>
							}
						>
							{DRAMA_TEXT.fishCreditLink}
							<span className="sr-only">{` ${DRAMA_TEXT.newWindow}`}</span>
							<ExternalLink data-icon="inline-end" aria-hidden="true" />
						</Button>
						{/* DN-7: 모델만 바꾸고 포커스는 주 버튼(switchModel). 다시 만들기는 사용자가 누른다 */}
						{paid && dramaModelsOf().includes(FREE_MODEL) ? (
							<Button
								variant="outline"
								size="lg"
								onClick={() => drama.switchModel(FREE_MODEL)}
							>
								{DRAMA_TEXT.toFreeModel}
							</Button>
						) : null}
					</>
				) : null}
			</div>
		</div>
	) : reason ? (
		<div className="flex flex-wrap items-center gap-x-3 md:justify-end">
			<p id={lineId} className="text-muted-foreground text-sm md:text-right">
				{reason.text}
			</p>
			{blockAction(reason.target)}
		</div>
	) : split ? (
		<p id={lineId} className="flex gap-2 text-sm text-warning md:text-right">
			<TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			{split}
		</p>
	) : generating && elapsed >= WAIT_NOTE_AFTER ? (
		<p id={lineId} className="text-muted-foreground text-sm md:text-right">
			{DRAMA_TEXT.waitNote}
		</p>
	) : null;

	// '장면 만들기'(Fish 대본, 읽거나 받지 않을 때). 오른쪽은 붙은 ▾다
	const sceneButton = (
		<Button
			ref={mainRef}
			id={DRAMA_MAIN_ID}
			size="lg"
			className={cn(
				"flex-1 rounded-r-none tabular-nums md:flex-none",
				// 막혔거나 복원 전이면 흐리게, 만드는 중은 잠그되 흐리지 않는다(5.8 표)
				lockedButton(locked && !generating),
			)}
			focusableWhenDisabled
			disabled={locked || generating}
			// 지난 초는 글자만 바뀐다. 만드는 중이 아니면 유료·무료를 이름에 담는다
			aria-label={
				generating
					? undefined
					: paid
						? DRAMA_TEXT.makePaid
						: DRAMA_TEXT.makeFree
			}
			// 보이는 한 줄 칸이 이 버튼 것(오류·제 막는 이유·경고·안내)이면 그것, 보이지 않는 이유로 잠겼으면 화면 밖 이유
			aria-describedby={
				problem || (!reason && slot) || reason?.for.includes("scene")
					? lineId
					: sceneHidden
						? sceneReasonId
						: undefined
			}
			onClick={(event) => drama.start(event.currentTarget)}
		>
			{generating ? (
				<Spinner data-icon="inline-start" aria-hidden="true" />
			) : paid ? (
				// 채운 청록 버튼 안의 유료 표식은 글자색이다(DESIGN.md)
				<Coins data-icon="inline-start" aria-hidden="true" />
			) : null}
			{generating ? DRAMA_TEXT.makingFor(elapsed) : DRAMA_TEXT.make}
		</Button>
	);
	// '읽기'(혼합 대본, ▶ 또는 유료면 Coins)와 읽는 중 '멈춤 · N/M줄'·받는 중 '멈춤 · 받는 중 N/M줄'(■). 첫 줄부터 읽는다
	const readButton = (
		<Button
			ref={mainRef}
			id={DRAMA_MAIN_ID}
			size="lg"
			className={cn(
				"flex-1 tabular-nums md:flex-none",
				// 막혔거나 장면을 만드는 중이면 흐리게(서버 동시 1건). 멈춤은 늘 누를 수 있다
				lockedButton(!reading && (readLocked || generating)),
			)}
			focusableWhenDisabled
			disabled={!reading && (readLocked || generating)}
			aria-label={!reading && readCost ? DRAMA_TEXT.readPaidName : undefined}
			aria-describedby={readDescribed}
			onClick={(event) => {
				if (reading) read.stop();
				else if (lines[0]) read.start(lines[0].id, event.currentTarget);
			}}
		>
			{reading ? (
				<Square data-icon="inline-start" aria-hidden="true" />
			) : readCost ? (
				<Coins data-icon="inline-start" aria-hidden="true" />
			) : (
				<Play data-icon="inline-start" aria-hidden="true" />
			)}
			{/* 찾는 중에는 줄 수를 아직 모른다(found 전 total 0) */}
			{!reading
				? DRAMA_TEXT.read
				: total === 0
					? DRAMA_TEXT.readStopOnly
					: mode === "save"
						? DRAMA_TEXT.saveStop(Math.min(done + 1, total), total)
						: DRAMA_TEXT.readStop(Math.min(done + 1, total), total)}
		</Button>
	);
	const scene = fishOnly && !reading;
	// '장면 만들기'가 흐리고(막힘·복원 전) 읽기도 막혀 '줄마다 읽기'를 쓸 수 없으면 ▾도 같이 흐린다. 누르면 이유를 말하므로 잠그지는 않는다
	const otherDim = locked && !generating && readLocked;

	return (
		<section
			ref={bandRef}
			aria-label={DRAMA_TEXT.barLabel}
			// 767px 이하는 바닥에 붙은 판(카드색, 위 모서리만 둥글게), 768px 이상은 페이지 바탕 띠 안에 뜬 카드. z-5는 앱 메뉴(z-10) 아래다(studio-bar와 같다)
			className="studio-bar-scroll fixed inset-x-0 bottom-0 z-5 rounded-t-2xl bg-card px-4 pt-3 pb-4 ring-1 ring-border md:left-16 md:rounded-none md:bg-background md:px-11 md:ring-0 xl:left-64"
		>
			{/* 1024px 이상은 결과 칸과 동작 칸이 한 줄이고 한 줄 칸이 줄을 바꿔 가득 폭이다 */}
			<div className="flex max-w-5xl flex-col gap-3 md:rounded-2xl md:bg-card md:p-4 md:ring-1 md:ring-border md:ring-inset lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
				{take.mode ? (
					<div className={RESULT_CLASS}>
						<TakePlayer />
					</div>
				) : !fishOnly ? (
					// 막는 줄이 생겨도(듣는 사이 Enter로 빈 줄 등) JoinButton이 정한다: 이어 듣는 중이면 '이어 듣기 멈춤'이 남는다
					<JoinButton
						className={RESULT_CLASS}
						prepared={
							readLines !== null && allPrepared(readLines, read.prepared)
						}
					/>
				) : (
					// 회색 안내만 있는 칸은 767px 이하에서 줄째 접는다(들을 것이 생기면 나타난다)
					<div className={cn(RESULT_CLASS, "max-md:hidden")}>
						<p className="text-muted-foreground text-sm">
							{DRAMA_TEXT.resultScene}
						</p>
					</div>
				)}
				{/* 좁으면 주 버튼이 남은 폭을 채운다. 주 버튼은 늘 첫 자리라 장면·읽기·멈춤이 같은 요소다 */}
				<div className="flex flex-wrap gap-2 md:justify-end lg:shrink-0">
					<SaveMenu />
					<div className="flex flex-1 md:flex-none">
						{scene ? sceneButton : readButton}
						{scene ? (
							<DropdownMenu>
								{/* 트리거는 늘 누를 수 있다(9.1, 받기 메뉴와 같다). 장면만 막는 이유로는 잠그지도 흐리지도 않는다(P5-8) */}
								<DropdownMenuTrigger
									render={
										<Button
											ref={otherRef}
											size="icon-lg"
											className={cn(
												"rounded-l-none border-l-primary-foreground/25",
												otherDim && "opacity-50",
											)}
											aria-label={DRAMA_TEXT.otherWays}
											aria-describedby={readDescribed}
										/>
									}
								>
									<ChevronDown aria-hidden="true" />
								</DropdownMenuTrigger>
								{/* 읽기를 시작하면 ▾가 사라지므로 포커스는 같은 요소인 주 버튼(멈춤)으로 간다.
								    막는 이유로 시작하지 않았으면(알림) ▾로 돌아온다 */}
								<DropdownMenuContent
									align="end"
									className="w-auto min-w-48 p-1"
									finalFocus={() =>
										otherRef.current?.isConnected ? true : mainRef.current
									}
								>
									<DropdownMenuGroup>
										{/* 복원 전·만드는 중(서버 동시 1건)에만 꺼진다. 읽기를 막는 이유는 누른 뒤 알림으로 말한다 */}
										<DropdownMenuItem
											className={menuItem}
											disabled={!ready || generating}
											onClick={() => {
												if (lines[0]) read.start(lines[0].id, mainRef.current);
											}}
										>
											<Play aria-hidden="true" />
											{DRAMA_TEXT.readByLine}
										</DropdownMenuItem>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						) : null}
					</div>
				</div>
				{/* 한 줄 칸(가득 폭). 767px 이하에서 예상은 한 줄로 자르고, 768px 이상은 비용 글이 가려지지 않게 줄을 바꾼다(audit P2-4) */}
				{slot || estimate ? (
					<div className="min-w-0 lg:basis-full">
						{slot ?? (
							<p className="text-muted-foreground text-sm tabular-nums max-md:truncate md:break-keep md:text-right">
								{estimate}
							</p>
						)}
					</div>
				) : null}
				{/* 보이지 않는 막는 이유(버튼 설명으로만 잇는다) */}
				{sceneHidden ? (
					<span id={sceneReasonId} className="sr-only">
						{block?.text}
					</span>
				) : null}
				{readHidden ? (
					<span id={readReasonId} className="sr-only">
						{readBlock?.text}
					</span>
				) : null}
				{/* 늘 그려 두는 화면 밖 알림. 만들기를 시작할 때 한 번 읽힌다(지난 초는 읽지 않는다) */}
				<p role="status" className="sr-only">
					{generating ? DRAMA_TEXT.makingStatus : ""}
				</p>
				{/* 받은 대본을 잇는 동안('받기' 메뉴·'이어 듣기'). 장면 만들기와 겹칠 수 있어 따로 둔다 */}
				<p role="status" className="sr-only">
					{read.joining ? DRAMA_TEXT.joining : ""}
				</p>
			</div>
		</section>
	);
}
