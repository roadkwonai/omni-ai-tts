// apps/web/src/components/drama-stage.tsx
"use client";

import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import { takeKey } from "@tts-pilot-app/api/drama-script";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { TriangleAlert } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import {
	DRAMA_TEXT,
	notSplitReason,
	splitModelOf,
	stageCaption,
	takeSeconds,
	zipNoteOf,
} from "@/lib/drama-view";

import { boxClass } from "./class-group";
import { DemoBadge, useDemo } from "./demo";
import { DRAMA_STAGE_ID, useDrama, useScriptKey } from "./drama-provider";
import { lineAt, useTakeAudio, useTakeTime } from "./drama-take";
import { showScriptUndo } from "./drama-undo";
import { SPEAKER_MARK, SpeakerMark } from "./drama-voice-dialog";

// 막대 안 줄 번호를 보이는 최소 막대 폭(px, 브리프 5.10)
const NUMBER_MIN_WIDTH = 20;

// 지금 대본과 다른 테이크면 안내와 '이 테이크의 대본으로 되돌리기'(브리프 5.10). 대본 열쇠는 이 잎만 읽는다
// (Ruling 17: 시간축을 든 무대 그릇은 글자마다 다시 그리지 않는다)
function OtherScript({
	take,
	onRestore,
}: {
	take: DramaItem;
	onRestore: () => void;
}) {
	const key = useScriptKey();
	const other = key !== takeKey(take.request);
	// 알림 영역(role="status")은 안내 글만 품고 늘 그린다(내용만 바뀐다). 버튼은 그 밖, 같은 줄 옆이라 바뀔 때 버튼 글을 읽지 않는다.
	// 안내가 없으면 화면 밖에 두어 무대 상자에 빈 간격을 만들지 않는다
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-3 gap-y-2",
				!other && "sr-only",
			)}
		>
			<p role="status" className="text-muted-foreground text-sm">
				{other ? DRAMA_TEXT.otherScript : ""}
			</p>
			{other ? (
				<Button variant="neutral" size="lg" onClick={onRestore}>
					{DRAMA_TEXT.restoreScript}
				</Button>
			) : null}
		</div>
	);
}

// 시간축(브리프 5.10·17절 7). 포인터용 보조라 aria-hidden이고 Tab 정지가 없다(키보드 동치는 장면 플레이어와 대본 줄 ▶).
// 화자마다 레인 하나(h-5, 사이 4px), 줄 구간 막대, 자른 위치 점선, 재생 위치 선(테이크 모드). 재생 위치(useTakeTime)만 구독한다.
// 선은 재생 중에만 rAF로 옮기고, 멈춘 채 플레이어에서 옮긴 위치는 소리의 seeked·timeupdate로 옮긴다.
// 테이크 모드에서 누르면 그 시각이 든 줄의 cutStart부터 장면 플레이어가 재생한다. 혼합 대본이면 누를 수 없다(스펙 17.2)
function StageTimeline({ take }: { take: DramaItem }) {
	const { mode, url, audioRef, seekLine } = useTakeAudio();
	const { playing, sceneLine } = useTakeTime();
	const trackRef = useRef<HTMLDivElement>(null);
	const headRef = useRef<HTMLDivElement>(null);
	// 시간축 폭(px). 막대 번호를 막대 폭 20px 이상일 때만 보이려고 ResizeObserver 하나로 잰다
	const [width, setWidth] = useState(0);
	// 나뉜 테이크에서만 그린다(StageTake)
	const segments = take.segments ?? [];
	const duration = takeSeconds(take.bytes);
	const lanes = [...new Set(take.request.lines.map((line) => line.speaker))]
		.filter((speaker) => speaker >= 0 && speaker < SPEAKER_MARK.length)
		.sort((a, b) => a - b);
	const cuts = [
		...new Set(
			segments.flatMap((segment) => [segment.cutStart, segment.cutEnd]),
		),
	].filter((time) => time > 0 && time < duration);
	const percent = (time: number) =>
		duration > 0
			? `${(Math.min(Math.max(time, 0), duration) / duration) * 100}%`
			: "0%";

	function place() {
		const audio = audioRef.current;
		const head = headRef.current;
		if (audio && head) head.style.left = percent(audio.currentTime);
	}
	// 재생 위치 선은 재생 중에만 rAF로 옮긴다(동작 줄이기 설정에서도 움직인다, 브리프 9.1)
	// biome-ignore lint/correctness/useExhaustiveDependencies: place는 ref만 읽는다. 재생 상태가 바뀔 때만 루프를 켜고 끈다
	useEffect(() => {
		if (!playing) return;
		let frame = 0;
		const tick = () => {
			place();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing]);
	// 멈춘 채 플레이어에서 위치를 옮겨도 선을 옮긴다. 소리는 주소마다 새로 그려지므로 주소가 바뀌면 다시 붙인다
	// biome-ignore lint/correctness/useExhaustiveDependencies: place는 ref만 읽는다. 소리 요소는 주소(url)마다 바뀐다
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		place();
		audio.addEventListener("seeked", place);
		audio.addEventListener("timeupdate", place);
		return () => {
			audio.removeEventListener("seeked", place);
			audio.removeEventListener("timeupdate", place);
		};
	}, [url]);
	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry?.contentRect.width ?? 0),
		);
		observer.observe(track);
		return () => observer.disconnect();
	}, []);

	function seek(event: MouseEvent<HTMLDivElement>) {
		const rect = event.currentTarget.getBoundingClientRect();
		if (rect.width === 0) return;
		seekLine(
			lineAt(segments, ((event.clientX - rect.left) / rect.width) * duration),
		);
	}

	// 줄 구간이 없으면(공개 데모 샘플) 대사별 빈 띠를 그리지 않는다
	if (segments.length === 0) return null;
	return (
		<div aria-hidden="true" className="flex gap-2">
			<div className="flex min-h-11 flex-col justify-center gap-1">
				{lanes.map((speaker) => (
					<SpeakerMark key={speaker} index={speaker} />
				))}
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: 포인터용 보조(aria-hidden). 키보드 동치는 장면 플레이어와 대본 줄 ▶다(브리프 5.10, 리뷰 D8) */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: 위와 같다(시간축에는 Tab 정지가 없다) */}
			<div
				ref={trackRef}
				className={cn(
					"relative flex min-h-11 flex-1 flex-col justify-center gap-1",
					mode ? "cursor-pointer" : "cursor-default",
				)}
				onClick={mode ? seek : undefined}
			>
				{lanes.map((speaker) => (
					<div key={speaker} className="relative h-5 rounded-sm bg-muted">
						{segments.map((segment, i) =>
							take.request.lines[i]?.speaker === speaker ? (
								<div
									// 줄은 자리로 정해진다(구간 i = 줄 i, 시각이 같은 구간이 있어도 겹치지 않게)
									key={`line-${i}`}
									className={cn(
										"absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-sm font-bold text-xs tabular-nums",
										// 시간축 막대는 화자 원과 같은 색 표. 막대 안 줄 번호는 -on 색이다(브리프 9.2)
										SPEAKER_MARK[speaker],
										sceneLine === i && "ring-2 ring-foreground",
									)}
									style={{
										left: percent(segment.start),
										width: percent(segment.end - segment.start),
									}}
								>
									{duration > 0 &&
									((segment.end - segment.start) / duration) * width >=
										NUMBER_MIN_WIDTH
										? i + 1
										: null}
								</div>
							) : null,
						)}
					</div>
				))}
				{cuts.map((time) => (
					<div
						key={time}
						className="absolute inset-y-0 border-muted-foreground border-l border-dashed"
						style={{ left: percent(time) }}
					/>
				))}
				{mode ? (
					<div
						ref={headRef}
						className="absolute inset-y-0 left-0 w-0.5 bg-foreground"
					/>
				) : null}
			</div>
		</div>
	);
}

// 무대의 테이크(브리프 17절 7): 안내 줄(나누지 못함·다른 모델로 바꾸기·지금 대본과 다름) → 시간축 → 대사별 파일 안내와 '모든 줄을 이 테이크로'.
// 플레이어·넘기기는 장면 플레이어(TakePlayer), 받기는 막대, 줄 듣기·받을 테이크는 대본 줄이 맡는다(스펙 17.2 '무대')
function StageTake({ take }: { take: DramaItem }) {
	const drama = useDrama();
	const demo = useDemo();
	const { split, group, picked, followAll } = useTakeAudio();
	// 이 테이크의 대본으로 되돌리고 포커스는 무대 제목(브리프 7절). 알림 '실행 취소'는 대본 실행 취소의 한 주인(showScriptUndo)이 띄운다
	function restore() {
		const undo = drama.restoreScript(take);
		drama.focusStage();
		showScriptUndo(DRAMA_TEXT.restored, undo);
	}
	// 무대 테이크와 다른 테이크를 쓰는 줄이 있다('모든 줄을 이 테이크로'를 보인다)
	const mixed = picked.some((target) => target.id !== take.id);
	// 공개 데모의 샘플은 줄 구간이 없다. 나누지 못한 게 아니라 데모 샘플이라 경고를 내지 않는다
	const reason = split || demo ? null : notSplitReason(take);
	// 나누지 못함 셋째 행: Drama 3 이유이고 지금 모델도 Drama 3
	const toSplit =
		reason === DRAMA_TEXT.notSplitDrama3 && drama.model === "drama-3";
	return (
		<>
			{/* 안내 줄(있을 때만 보인다). 알림 영역은 늘 있고 내용만 바뀐다(없으면 화면 밖). 나누지 못함은 1행 경고 notSplit, 2행 회색 이유 */}
			<div className={cn("flex flex-col gap-2", reason === null && "sr-only")}>
				<div role="status">
					{reason === null ? null : (
						<div className="flex gap-2 text-sm">
							<TriangleAlert
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0 text-warning"
							/>
							<div className="flex min-w-0 flex-col gap-1">
								<p className="text-warning">{DRAMA_TEXT.notSplit}</p>
								<p className="text-muted-foreground">{reason}</p>
							</div>
						</div>
					)}
				</div>
				{/* 3행 모델 바꾸기는 알림 영역 밖에 둔다(안내가 바뀔 때 버튼 글까지 읽지 않게). 아이콘 폭 + 사이(24px)만큼 들여 이유 아래에 맞춘다.
				    만들기는 사용자가 다시 누른다 */}
				{toSplit ? (
					<Button
						variant="neutral"
						size="lg"
						className="ml-6 self-start"
						onClick={() => drama.switchModel(splitModelOf())}
					>
						{DRAMA_TEXT.toSplitModel}
					</Button>
				) : null}
			</div>
			<OtherScript take={take} onRestore={restore} />
			{split ? (
				<div className="flex flex-col gap-2">
					<StageTimeline take={take} />
					<div className="flex flex-wrap items-center gap-x-3">
						<p className="text-muted-foreground text-sm">
							{zipNoteOf(group, picked)}
						</p>
						{mixed ? (
							<Button variant="link" size="lg" onClick={followAll}>
								{DRAMA_TEXT.followAll}
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</>
	);
}

// 무대(스펙 17.2 '무대', 브리프 17절 7). 무대에 테이크가 있거나 장면을 만드는 중일 때만 그린다(빈 상태 문장 없음, 17.5-9).
// 제목 h2는 스크립트 포커스 자리('무대 보기'·'무대에 올리기'·되돌리기. 무대가 없으면 stageOrMain이 주 버튼으로 보낸다), 옆에 캡션.
// 상자: 만드는 중 줄 → 테이크(장면 플레이어는 막대 결과 칸). 목록 받기 실패는 이전 테이크가 말한다.
// 줄 목록(useLines)과 대본 열쇠(useScriptKey)를 이 그릇에서 읽지 않는다(입력 지연, Ruling 17)
export function DramaStage() {
	const { generating } = useDrama();
	const { take, group, status } = useTakeAudio();
	if (!take && !generating) return null;
	return (
		<section aria-labelledby={DRAMA_STAGE_ID} className="flex flex-col gap-3">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				{/* 키보드·스크립트로 옮긴 포커스는 브라우저가 :focus-visible을 줄 때 ring으로 보인다(마우스 클릭에는 없다, audit P2-2) */}
				<h2
					id={DRAMA_STAGE_ID}
					tabIndex={-1}
					// w-fit: 포커스 윤곽이 줄 전체가 아니라 제목 글에 붙는다
					className="w-fit font-bold text-xl outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
				>
					{DRAMA_TEXT.stage}
				</h2>
				{take ? (
					// 모델 이름('Drama 3' 등)이 번역되지 않게 캡션째 둔다(나머지는 숫자·시각)
					<p
						className="text-muted-foreground text-sm tabular-nums"
						translate="no"
					>
						{stageCaption(take, group)}
					</p>
				) : null}
				{take ? <DemoBadge /> : null}
			</div>
			<div className={cn(boxClass, "flex flex-col gap-4 p-4 md:p-5")}>
				{generating ? (
					// 지난 초는 막대 버튼만 보인다(가짜 진행률 없음)
					<p className="flex items-center gap-2 text-sm">
						<Spinner aria-hidden="true" />
						{DRAMA_TEXT.stageGenerating}
					</p>
				) : null}
				{take ? <StageTake take={take} /> : null}
			</div>
			{/* 늘 그려 두는 화면 밖 알림: 장면 받기 시작, 대사별 파일·한 파일 받기 시작·끝 */}
			<p role="status" className="sr-only">
				{status}
			</p>
		</section>
	);
}
