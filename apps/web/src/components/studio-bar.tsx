// apps/web/src/components/studio-bar.tsx
"use client";

import {
	comboSignature,
	estimate,
} from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Download, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useId, useRef } from "react";

import {
	liveProblem,
	STUDIO_TEXT,
	sameResult,
	studioBlock,
	studioProblemText,
	studioRequestOf,
} from "@/lib/studio-view";
import { costCopy, usageText } from "@/lib/trial-view";

import { useBarHeight, useElapsed, WAIT_NOTE_AFTER } from "./bar-height";
import { usePlayer } from "./sample-player";
import { useShownScript, useStudio, useStudioItems } from "./studio-provider";
import { lockedButton } from "./voice-problem";

// 하단 막대(브리프 5.6): 화면 바닥에 고정된 띠, DOM은 카드 바로 뒤(DN-1). 결과 칸(캡션·플레이어·'내려받기') → 동작 칸(주 버튼 → 한 줄 칸).
// 늦춘 대본으로 그린다(입력이 끊는다). 띠 높이를 <html>의 --studio-bar-height(단위 px)로 알려 열 바닥 여백·scroll-padding·알림 간격이 쓴다.
// 한 번에 한 오디오(REQ-03): 기본 샘플이 재생되면 결과를 멈추고, 결과를 재생하면 샘플을 멈춘다
export function StudioBar({
	mainRef,
	resultsRef,
}: {
	// 주 버튼(이전 결과가 사라질 때 포커스가 온다)
	mainRef: RefObject<HTMLButtonElement | null>;
	// '이전 결과' 제목('이전 결과 보기'가 포커스를 옮긴다)
	resultsRef: RefObject<HTMLHeadingElement | null>;
}) {
	const studio = useStudio();
	const text = useShownScript();
	const items = useStudioItems();
	const player = usePlayer();
	const bandRef = useRef<HTMLElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const captionId = useId();
	const lineId = useId();
	const creating = studio.busy?.phase === "creating";
	const finding = studio.busy?.phase === "finding";
	// 방금 만든 결과의 조각을 받는 중(생성 성공 뒤, 브리프 11.21). 그사이 이전 결과 줄 재생은 fresh가 없어 여기에 들지 않는다
	const receivingNew = studio.receiving?.fresh === true;
	const elapsed = useElapsed(creating ? (studio.busy?.since ?? null) : null);
	const voice = studio.voice;
	const block = studioBlock({ voice, text, retryAt: studio.waiting });
	// 복원 전에는 잠그고 한 줄 칸을 비운다(깜빡임 없음, 브리프 6절)
	const locked = !studio.restored || block !== null;
	// 지금 대본·성우·설정의 요청. 대기 시각만으로 막혔으면 있다(대기 시각은 그 실패에서 생겨 오류 줄이 같은 말을 한다, 오류 줄 판정용)
	const current =
		voice &&
		studio.restored &&
		studioBlock({ voice, text, retryAt: null }) === null
			? studioRequestOf(voice.voice, text, studio.settings)
			: null;
	const currentSignature = current ? comboSignature(current) : null;
	const request = locked ? null : current;
	const signature = locked ? null : currentSignature;
	const shown = studio.shown;
	// 지금 조합의 결과가 이미 플레이어에 있다(critique P2-3). 주 버튼을 outline으로 내린다. 최근 20개 밖에서 찾아 연 결과도 알아본다
	const shownSame = signature !== null && shown?.signature === signature;
	// shortcut: 최근 20개만 보고 판정한다. 그보다 오래된 같은 조합은 '음성 만들기'로 보이지만 누르면 start가 studioFind로 찾아 크레딧 0으로 연다(계획 리뷰 P9·E11).
	// 입력마다 찾기를 부르지 않으려고 둔 한계다. 자주 보이면 서명별 찾기 결과를 기억한다
	const saved = shownSame || sameResult(items.data, signature, "done") !== null;
	// 오류 줄은 그 요청과 같은 조합이고 그 조합의 결과가 아직 완료되지 않았을 때만(critique P1-b). 아니면 막는 이유·도움 줄이 제 순서로 보인다
	const live = liveProblem(studio.problem, currentSignature, items.data);
	const problem = live ? studioProblemText(live) : null;
	const sampling =
		player.current !== null && player.current.status !== "failed";
	// '이전 결과' 구역이 있을 때만(받는 중·0개면 구역이 없다, DN-10) '이전 결과 보기'를 둔다.
	// 첫 받기 실패는 실패 횟수로 본다(데이터 없이 다시 받으면 TanStack이 status를 pending으로 되돌린다, studio-results와 같다)
	const hasResults = items.data
		? items.data.length > 0
		: items.errorUpdateCount > 0;

	// 주 버튼 글자(브리프 5.6 표). 접근 이름은 글자 그대로이고 금액이 없는 '음성 만들기'만 유료임을 덧붙인다(캐스팅 12절)
	const label = receivingNew
		? STUDIO_TEXT.receivingShort
		: creating
			? `${STUDIO_TEXT.making} · ${elapsed}초`
			: saved
				? STUDIO_TEXT.openSaved
				: request
					? `${STUDIO_TEXT.make} · ${usageText(estimate(request))}`
					: STUDIO_TEXT.make;
	// 한 줄 칸(한 번에 하나): 오류 → 막는 이유 → 20초 안내 → 저장된 결과 도움 줄(플레이어에 있으면 shownSame). 복원 전에는 비운다(오류도 복원 뒤에만 있다)
	const note = !studio.restored
		? null
		: (block ??
			(creating && !receivingNew && elapsed >= WAIT_NOTE_AFTER
				? STUDIO_TEXT.waitNote
				: shownSame
					? STUDIO_TEXT.shownSame
					: saved
						? STUDIO_TEXT.savedCost
						: null));
	// 주 버튼이 '저장된 결과 열기'이고 그 결과가 이미 플레이어에 있으면 outline(채운 청록은 하나, critique P2-3)
	const quiet = shownSame && !creating && !receivingNew;

	useBarHeight(bandRef);
	// 기본 샘플이 재생을 시작하면 결과를 멈춘다(오디오 요소 동기화)
	useEffect(() => {
		if (sampling) audioRef.current?.pause();
	}, [sampling]);
	// 이전 결과 '재생'으로 올린 결과는 처음부터 재생한다. 이미 올라 있는 결과를 다시 눌러도 새 객체가 오므로 주소가 아니라 객체에 반응한다.
	// 만든 직후·저장된 결과 열기는 올리기만 한다(계획 '스펙과 다른 점' 13)
	useEffect(() => {
		const audio = audioRef.current;
		if (!shown?.autoplay || !audio) return;
		audio.currentTime = 0;
		void audio.play().catch(() => {});
	}, [shown]);

	return (
		<section
			ref={bandRef}
			aria-label={STUDIO_TEXT.barLabel}
			// 767px 이하는 띠가 곧 막대(카드색, 위 모서리만 둥글게), 768px 이상은 페이지 바탕 띠 안에 뜬 카드. z-5는 앱 메뉴(z-10) 아래다.
			// 바닥 여백은 모든 너비 16px. env(safe-area-inset-bottom)는 앱 viewport에 viewport-fit=cover가 없어 늘 0이라 쓰지 않는다(audit F2)
			className="studio-bar-scroll fixed inset-x-0 bottom-0 z-5 rounded-t-2xl bg-card px-4 pt-3 pb-4 ring-1 ring-border md:left-16 md:rounded-none md:bg-background md:px-11 md:ring-0 xl:left-64"
		>
			<div className="flex max-w-4xl flex-col gap-3 md:rounded-2xl md:bg-card md:p-4 md:ring-1 md:ring-border md:ring-inset lg:flex-row lg:items-center lg:gap-6">
				{shown ? (
					// 767px 이하에서 대본 칸에 포커스가 있으면(소프트 키보드) 숨는다(studio-bar-result, DN-3)
					<div className="studio-bar-result flex min-w-0 flex-col justify-center gap-1 lg:min-h-20 lg:flex-1">
						<p
							id={captionId}
							className="truncate text-muted-foreground text-sm"
						>
							{shown.caption}
						</p>
						<div className="flex items-center gap-2">
							{/* biome-ignore lint/a11y/useMediaCaption: 만든 음성의 글은 대본 칸과 이전 결과 줄에 있다(생성 오디오에는 자막 트랙이 없다) */}
							<audio
								ref={audioRef}
								key={shown.url}
								controls
								preload="metadata"
								src={shown.url}
								aria-labelledby={captionId}
								className="min-w-0 flex-1 lg:max-w-md"
								onPlay={player.stop}
							/>
							{/* 767px 이하는 44px 아이콘 버튼(글자는 화면 밖 접근 이름), 768px 이상은 아이콘 + 글자 */}
							<Button
								variant="outline"
								size="lg"
								className="w-11 shrink-0 px-0 md:w-auto md:pr-5 md:pl-4"
								onClick={studio.downloadShown}
							>
								<Download aria-hidden="true" />
								<span className="max-md:sr-only">{STUDIO_TEXT.download}</span>
							</Button>
						</div>
					</div>
				) : (
					// 결과가 없으면 768px 이상에서만 한 줄. 1024px 이상은 결과 칸 높이를 지켜 막대가 흔들리지 않는다
					<p className="hidden text-muted-foreground text-sm md:block lg:flex lg:min-h-20 lg:flex-1 lg:items-center">
						{STUDIO_TEXT.noResult}
					</p>
				)}
				{/* 주 버튼 아래 한 줄 칸(모든 너비, DOM과 화면이 같다) */}
				<div className="flex flex-col gap-1 md:items-end lg:max-w-sm lg:shrink-0">
					<Button
						ref={mainRef}
						variant={quiet ? "outline" : "default"}
						size="lg"
						className={cn(
							"w-full tabular-nums md:w-auto",
							// 막혔거나 복원 전이면 흐리게, 만드는 중·받는 중은 잠그되 흐리지 않는다
							lockedButton(locked && studio.busy === null),
						)}
						focusableWhenDisabled
						disabled={locked || creating}
						aria-busy={finding || undefined}
						aria-label={
							label === STUDIO_TEXT.make
								? `${STUDIO_TEXT.make}, ${costCopy("typecast").paid}`
								: undefined
						}
						aria-describedby={problem || note ? lineId : undefined}
						onClick={(event) => studio.start(event.currentTarget)}
					>
						{studio.busy ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : saved ? null : (
							// 채운 청록 버튼 안의 유료 표식은 글자색이다(DESIGN.md 598행)
							<Coins data-icon="inline-start" aria-hidden="true" />
						)}
						{label}
					</Button>
					{problem ? (
						<div className="flex flex-col items-start md:items-end">
							<p
								id={lineId}
								role="alert"
								className="flex gap-2 text-sm text-warning md:text-right"
							>
								<TriangleAlert
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0"
								/>
								{problem.text}
							</p>
							{problem.connections ? (
								<Button
									variant="link"
									size="lg"
									nativeButton={false}
									render={<Link href="/connections" />}
								>
									{STUDIO_TEXT.connections}
								</Button>
							) : null}
							{problem.results && hasResults ? (
								<Button
									variant="link"
									size="lg"
									onClick={() => resultsRef.current?.focus()}
								>
									{STUDIO_TEXT.toResults}
								</Button>
							) : null}
						</div>
					) : note ? (
						<p
							id={lineId}
							className="text-muted-foreground text-sm md:text-right"
						>
							{note}
						</p>
					) : null}
					{/* 늘 그려 두는 화면 밖 알림. 만들기 시작 때 한 번, 만든 결과를 받기 시작할 때 한 번 읽힌다(지난 초는 읽지 않는다).
					    줄 재생·내려받기는 줄 버튼의 aria-busy와 "… 받는 중"이 알린다 */}
					<p role="status" className="sr-only">
						{receivingNew
							? STUDIO_TEXT.receiving
							: creating
								? STUDIO_TEXT.makingStatus
								: ""}
					</p>
				</div>
			</div>
		</section>
	);
}
