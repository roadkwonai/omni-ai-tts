"use client";

import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import {
	ACTING,
	AUDIO_BLOCKED_TEXT,
	AUDIO_FAILED_TEXT,
	clockText,
} from "@/lib/landing-content";
import { WAVEFORMS } from "@/lib/landing-waveforms";

import { ServiceNames } from "./service-names";
import { useSamplePlayer } from "./use-sample-player";
import { Waveform } from "./waveform";

// 장면 3 연기 비교(브리프 3·5절): 같은 문장에 연기 칩을 누르면 대본에 그 태그가 꽂힌 모양으로 바뀌고 그 소리가 난다. 오른쪽(md 이상)에는 고른 연기의 마스코트 얼굴이 크게 서고 칩을 바꾸면 크로스페이드로 바뀐다.
// 칩은 하나만 골라진 toggle(aria-pressed)이고, 고른 칩을 다시 누르면 멈춘다(멈춘 뒤 다시 누르면 처음부터 듣는다). 아래 재생 단추도 같은 일을 한다. 자동 재생 없음
export function ActingDemo() {
	const player = useSamplePlayer();
	const [pickedId, setPickedId] = useState<string>(ACTING.takes[0].id);
	// 방문자가 눌러 멈춘 직후에만 '멈춤'을 알린다(소리가 끝나서 멈춘 때와 가른다)
	const [stopped, setStopped] = useState(false);
	const picked = ACTING.takes.find((take) => take.id === pickedId);
	if (!picked) return null;
	const wave = WAVEFORMS[picked.id];
	const playing = player.currentId === picked.id;
	const loading = playing && player.status === "loading";
	const failed = player.failed.has(picked.id);
	const blocked = player.blocked === picked.id;

	function press(take: (typeof ACTING.takes)[number]) {
		setStopped(player.currentId === take.id);
		setPickedId(take.id);
		player.toggle({ id: take.id, src: take.src });
	}

	return (
		<div className="grid gap-5 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-8 md:p-6">
			<div className="flex min-w-0 flex-col gap-5">
				<p className="min-h-16 text-pretty break-keep text-xl leading-loose md:min-h-14">
					{/* 작업실 태그 칩처럼 본문과 구분되는 모양 */}
					{picked.tag ? (
						<span className="mr-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 align-middle font-bold text-base text-foreground ring-1 ring-primary ring-inset">
							{picked.tag}
						</span>
					) : null}
					{ACTING.script}
				</p>
				<div className="flex flex-col gap-2">
					<ToggleGroup
						value={[pickedId]}
						// 고른 칩을 다시 누르면 값이 비는데, 그때는 고른 칩의 재생·멈춤으로 받는다
						onValueChange={(value) =>
							press(ACTING.takes.find((take) => take.id === value[0]) ?? picked)
						}
						aria-label={ACTING.chipsLabel}
						className="flex-wrap gap-2"
					>
						{ACTING.takes.map((take) => (
							<Toggle
								key={take.id}
								value={take.id}
								className="landing-press gap-2 rounded-full bg-card py-1 pr-4 pl-1.5 text-base ring-1 ring-border ring-inset data-pressed:bg-primary-subtle data-pressed:ring-2 data-pressed:ring-primary"
							>
								<Image
									src={take.face}
									alt=""
									width={ACTING.faceSize}
									height={ACTING.faceSize}
									sizes="36px"
									className="size-9"
								/>
								{take.label}
							</Toggle>
						))}
					</ToggleGroup>
					<p className="text-pretty break-keep text-muted-foreground text-sm">
						{ACTING.hint}
					</p>
				</div>
				<div className="flex items-center gap-3 border-border border-t pt-4">
					<button
						type="button"
						aria-label={`${picked.label} ${playing ? "멈춤" : "재생"}`}
						onClick={() => press(picked)}
						className={cn(
							"landing-press flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4",
							playing
								? "bg-primary text-primary-foreground hover:bg-primary-hover"
								: "bg-muted text-foreground hover:bg-secondary",
						)}
					>
						{loading ? (
							<Spinner aria-hidden="true" />
						) : playing ? (
							<Pause aria-hidden="true" />
						) : (
							<Play aria-hidden="true" />
						)}
					</button>
					<div className="min-w-0 flex-1">
						{wave ? (
							<Waveform
								bars={wave.bars}
								progress={playing ? player.progress : null}
							/>
						) : null}
					</div>
					<span className="min-w-22 text-right text-muted-foreground text-sm tabular-nums">
						{wave
							? playing
								? `${clockText(player.time)} / ${clockText(wave.seconds)}`
								: clockText(wave.seconds)
							: null}
					</span>
				</div>
				<p className="text-pretty break-keep text-muted-foreground text-sm">
					<ServiceNames text={ACTING.source} />
				</p>
				<p
					role="status"
					className={failed || blocked ? "text-sm text-warning" : "sr-only"}
				>
					{failed
						? AUDIO_FAILED_TEXT
						: blocked
							? AUDIO_BLOCKED_TEXT
							: playing && player.status === "playing"
								? `${picked.label} 재생 중`
								: stopped && !playing
									? `${picked.label} 멈춤`
									: ""}
				</p>
			</div>
			{/* 고른 연기의 얼굴: 같은 칸에 넷을 겹쳐 두고 투명도로 크로스페이드(200ms). 칩이 이름을 말하므로 장식이다 */}
			<div
				aria-hidden="true"
				className="hidden size-40 self-start md:grid lg:size-48"
			>
				{ACTING.takes.map((take) => (
					<Image
						key={take.id}
						src={take.face}
						alt=""
						width={ACTING.faceSize}
						height={ACTING.faceSize}
						sizes="(min-width: 1024px) 192px, 160px"
						className={cn(
							"col-start-1 row-start-1 size-full transition-opacity duration-200 ease-out",
							take.id !== pickedId && "opacity-0",
						)}
					/>
				))}
			</div>
		</div>
	);
}
