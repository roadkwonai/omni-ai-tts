"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { CircleCheck, Pause, Play, Square } from "lucide-react";
import { memo, useState } from "react";

import {
	AUDIO_BLOCKED_TEXT,
	AUDIO_FAILED_TEXT,
	clockText,
	HERO_LISTEN_NOTE,
	HERO_NUMBER_COUNT,
	HERO_ORIGINAL,
	HERO_PICK_HINT,
	HERO_PLAY_ALL,
	HERO_PLAY_ALL_STOP,
	HERO_SAMPLES,
	HERO_SPOKEN,
	type HeroPart,
	OTHER_SAMPLE_LABEL,
	sampleName,
} from "@/lib/landing-content";
import { WAVEFORMS } from "@/lib/landing-waveforms";

import type { PlayItem, SamplePlayer } from "./use-sample-player";
import { Waveform } from "./waveform";

// 장면 1 오디션 무대(브리프 3절 1번): 같은 문장 아래 성우 줄 다섯. 줄마다 파형이 있고, 줄을 누르면 그 줄만, '모두 이어 듣기'는 위에서부터 차례로 난다.
// 재생 중인 줄만 진행 위치까지 primary로 칠하고 나머지 줄은 흐리게 둔다. 자동 재생 없음.
// 소리 처리(useSamplePlayer)는 감독 마스코트도 재생 상태를 보여 줘야 해서 위 HeroStage가 갖고 이 무대에 넘긴다
type View = "original" | "spoken";
const VIEWS: { value: View; label: string }[] = [
	{ value: "original", label: "원문" },
	{ value: "spoken", label: "발음용" },
];
const ITEMS = HERO_SAMPLES.map(({ id, src }) => ({ id, src }));

// 숫자 부분만 강조 색(토큰). 같은 글이 겹쳐 있어 두 판 모두 그린다
function Text({ parts }: { parts: readonly HeroPart[] }) {
	return parts.map((part) =>
		part.num ? (
			<mark
				key={part.text}
				className="rounded-sm bg-primary-subtle px-0.5 font-bold text-foreground"
			>
				{part.text}
			</mark>
		) : (
			part.text
		),
	);
}

// 줄 하나. 원시 값만 받는 memo라 재생 위치가 바뀌어도 재생 중인 줄만 다시 그린다
const Row = memo(function Row({
	sample,
	playing,
	loading,
	failed,
	blocked,
	dim,
	progress,
	time,
	onToggle,
}: {
	sample: (typeof HERO_SAMPLES)[number];
	playing: boolean;
	loading: boolean;
	failed: boolean;
	blocked: boolean;
	// 다른 줄이 재생 중이라 이 줄은 흐리게 둔다
	dim: boolean;
	// 재생 중인 줄만 값을 받는다(다른 줄은 null)
	progress: number | null;
	time: number | null;
	onToggle: (item: PlayItem) => void;
}) {
	const wave = WAVEFORMS[sample.id];
	const name = sampleName(sample);
	const label = failed
		? `${name} 다시 재생`
		: loading
			? `${name} 불러오는 중, 멈춤`
			: playing
				? `${name} 멈춤`
				: `${name} 재생`;
	const noteId = `audition-note-${sample.id}`;
	// 줄 이름(aria-label)이 덮어쓰지 않게, 문장이 다르다는 표시와 실패·차단 문구는 설명으로 잇는다
	const hasNote = sample.other || failed || blocked;
	return (
		<li>
			<button
				type="button"
				aria-label={label}
				aria-describedby={hasNote ? noteId : undefined}
				onClick={() => onToggle({ id: sample.id, src: sample.src })}
				className={cn(
					"landing-press grid min-h-14 w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2 text-left outline-offset-2 ring-1 ring-border ring-inset transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[auto_8.5rem_1fr_auto]",
					playing &&
						"bg-primary-subtle ring-2 ring-primary hover:bg-primary-subtle",
				)}
			>
				<span
					aria-hidden="true"
					className={cn(
						"flex size-10 items-center justify-center rounded-full transition-colors",
						playing
							? "bg-primary text-primary-foreground"
							: "bg-muted text-foreground",
					)}
				>
					{loading ? <Spinner /> : playing ? <Pause /> : <Play />}
				</span>
				<span className="flex min-w-0 flex-col">
					<span className="font-bold text-base" translate="no">
						{sample.provider}
					</span>
					<span
						id={hasNote ? noteId : undefined}
						className={cn(
							"text-pretty break-keep text-sm",
							failed || blocked ? "text-warning" : "text-muted-foreground",
						)}
					>
						{failed ? (
							AUDIO_FAILED_TEXT
						) : blocked ? (
							AUDIO_BLOCKED_TEXT
						) : sample.other ? (
							OTHER_SAMPLE_LABEL
						) : (
							<span translate="no">{sample.voice}</span>
						)}
					</span>
				</span>
				<span
					className={cn(
						"col-span-3 row-start-2 min-w-0 transition-opacity sm:col-span-1 sm:col-start-3 sm:row-start-1",
						dim && "opacity-60",
					)}
				>
					{wave ? <Waveform bars={wave.bars} progress={progress} /> : null}
				</span>
				<span className="min-w-22 text-right text-muted-foreground text-sm tabular-nums sm:col-start-4">
					{wave
						? time === null
							? clockText(wave.seconds)
							: `${clockText(time)} / ${clockText(wave.seconds)}`
						: null}
				</span>
			</button>
		</li>
	);
});

export function Audition({ player }: { player: SamplePlayer }) {
	const [view, setView] = useState<View>("original");
	const failedNames = HERO_SAMPLES.filter((s) => player.failed.has(s.id)).map(
		sampleName,
	);
	const playingName = HERO_SAMPLES.find((s) => s.id === player.currentId);
	const blockedName = HERO_SAMPLES.find((s) => s.id === player.blocked);

	return (
		<div
			id="audition-stage"
			className="flex flex-col gap-4 rounded-2xl bg-card p-4 text-left ring-1 ring-border ring-inset md:p-6"
		>
			{/* 원문·발음용을 같은 칸에 겹쳐 두고 투명도로 크로스페이드(200ms). 보이지 않는 판은 스크린 리더와 키보드에서 뺀다 */}
			<div className="grid text-lg leading-relaxed">
				<p
					aria-hidden={view !== "original"}
					inert={view !== "original"}
					className={cn(
						"col-start-1 row-start-1 break-keep transition-opacity duration-200 ease-out",
						view !== "original" && "opacity-0",
					)}
				>
					<Text parts={HERO_ORIGINAL} />
				</p>
				<p
					aria-hidden={view !== "spoken"}
					inert={view !== "spoken"}
					className={cn(
						"col-start-1 row-start-1 break-keep transition-opacity duration-200 ease-out",
						view !== "spoken" && "opacity-0",
					)}
				>
					<Text parts={HERO_SPOKEN} />
				</p>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<div className="flex flex-col gap-0.5">
					<p className="flex items-center gap-1.5 text-sm">
						<CircleCheck
							aria-hidden="true"
							className="size-4 shrink-0 text-success"
						/>
						숫자 {HERO_NUMBER_COUNT}개 검수함
					</p>
					<p className="text-pretty break-keep text-muted-foreground text-sm">
						{HERO_LISTEN_NOTE}
					</p>
				</div>
				<ToggleGroup
					value={[view]}
					// 하나 고르기. 고른 칸을 다시 눌러 비우는 것은 막는다(앱 보관함 보기 전환과 같다)
					onValueChange={(value) => {
						const next = value[0] as View | undefined;
						if (next) setView(next);
					}}
					aria-label="대본 보기"
					className="bg-muted p-1"
				>
					{VIEWS.map((item) => (
						<Toggle
							key={item.value}
							value={item.value}
							className="shrink-0 px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border"
						>
							{item.label}
						</Toggle>
					))}
				</ToggleGroup>
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-border border-t pt-4">
				{/* 주 행동은 히어로의 '데모 작업실 열기'다. 이어 듣기는 무대 안 보조(outline) */}
				<Button
					id="audition-play-all"
					variant="outline"
					size="lg"
					className="landing-press"
					onClick={() => player.playAll(ITEMS)}
				>
					{player.all ? (
						<Square data-icon="inline-start" aria-hidden="true" />
					) : (
						<Play data-icon="inline-start" aria-hidden="true" />
					)}
					{player.all ? HERO_PLAY_ALL_STOP : HERO_PLAY_ALL}
				</Button>
				<p className="text-pretty break-keep text-muted-foreground text-sm">
					{HERO_PICK_HINT}
				</p>
			</div>
			<ul aria-label="성우별 샘플" className="flex flex-col gap-2">
				{HERO_SAMPLES.map((sample) => {
					const playing = player.currentId === sample.id;
					return (
						<Row
							key={sample.id}
							sample={sample}
							playing={playing}
							loading={playing && player.status === "loading"}
							failed={player.failed.has(sample.id)}
							blocked={player.blocked === sample.id}
							dim={player.currentId !== null && !playing}
							progress={playing ? player.progress : null}
							time={playing ? player.time : null}
							onToggle={player.toggle}
						/>
					);
				})}
			</ul>
			<p role="status" className="sr-only">
				{playingName && player.status === "playing"
					? `${sampleName(playingName)} 재생 중`
					: player.currentId === null && blockedName
						? `${sampleName(blockedName)} ${AUDIO_BLOCKED_TEXT}`
						: player.currentId === null && failedNames.length > 0
							? `${failedNames.join(", ")} ${AUDIO_FAILED_TEXT}`
							: ""}
			</p>
		</div>
	);
}
