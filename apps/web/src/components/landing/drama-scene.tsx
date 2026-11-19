"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Play, Square } from "lucide-react";

import {
	AUDIO_BLOCKED_TEXT,
	AUDIO_FAILED_TEXT,
	clockText,
	DRAMA,
	dramaLineAt,
} from "@/lib/landing-content";
import { WAVEFORMS } from "@/lib/landing-waveforms";

import { ServiceNames } from "./service-names";
import { SPEAKER_CLASSES } from "./speaker-classes";
import { useSamplePlayer } from "./use-sample-player";
import { Waveform } from "./waveform";

const ITEM = { id: DRAMA.id, src: DRAMA.src };

// 화자 칩: 번호 원과 이름(색만으로 구분하지 않는다)
function SpeakerChip({ n, name }: { n: 1 | 2; name: string }) {
	return (
		<span
			className={cn(
				"flex w-fit items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm",
				SPEAKER_CLASSES[n].chip,
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"flex size-6 items-center justify-center rounded-full font-bold text-xs tabular-nums",
					SPEAKER_CLASSES[n].dot,
				)}
			>
				{n}
			</span>
			{name}
		</span>
	);
}

// 장면 4 드라마 장면(브리프 3·5절): 대사 네 줄 자막과 '장면 듣기'. 재생 중에는 지금 시각의 줄을 aria-current로 강조하고 끝나면 푼다.
// 줄을 누르면 그 줄 시작 시각부터 듣는다(이미 재생 중이면 그 시각으로 옮긴다). 자동 재생 없음
export function DramaScene() {
	const player = useSamplePlayer();
	const playing = player.currentId === DRAMA.id;
	const loading = playing && player.status === "loading";
	const at = playing && !loading ? dramaLineAt(player.time) : null;
	const failed = player.failed.has(DRAMA.id);
	const blocked = player.blocked === DRAMA.id;
	const wave = WAVEFORMS[DRAMA.id];

	return (
		<div className="flex flex-col gap-5 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:p-6">
			<div className="flex items-center gap-3">
				<Button
					size="lg"
					className="landing-press shrink-0"
					onClick={() => player.toggle(ITEM)}
				>
					{loading ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : playing ? (
						<Square data-icon="inline-start" aria-hidden="true" />
					) : (
						<Play data-icon="inline-start" aria-hidden="true" />
					)}
					{playing ? DRAMA.stop : DRAMA.play}
				</Button>
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
			<ul aria-label="화자" className="flex flex-wrap gap-2">
				{DRAMA.speakers.map((speaker) => (
					<li key={speaker.n} className="flex items-center gap-2">
						<SpeakerChip n={speaker.n} name={speaker.name} />
						<span className="text-muted-foreground text-sm">
							<ServiceNames text={speaker.voice} />
						</span>
					</li>
				))}
			</ul>
			<ol aria-label={DRAMA.linesLabel} className="flex flex-col gap-2">
				{DRAMA.lines.map((line, index) => {
					const speaker = DRAMA.speakers.find((s) => s.n === line.speaker);
					return (
						<li key={line.start}>
							<button
								type="button"
								aria-current={at === index ? "true" : undefined}
								onClick={() =>
									playing
										? player.seek(line.start)
										: player.toggle({ ...ITEM, start: line.start })
								}
								className={cn(
									"landing-press flex min-h-14 w-full cursor-pointer flex-col items-start gap-1.5 rounded-xl px-3 py-3 text-left outline-offset-2 ring-1 ring-border ring-inset transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:gap-4",
									at === index &&
										"bg-primary-subtle ring-2 ring-primary hover:bg-primary-subtle",
								)}
							>
								<span className="sm:w-20 sm:shrink-0">
									<SpeakerChip n={line.speaker} name={speaker?.name ?? ""} />
								</span>
								<span className="text-pretty break-keep text-lg">
									{line.direction ? (
										<span className="mr-1.5 text-muted-foreground text-sm">
											({line.direction})
										</span>
									) : null}
									{line.text}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
			<div className="flex flex-col gap-0.5 text-pretty break-keep text-muted-foreground text-sm">
				<p>{DRAMA.lineHint}</p>
				<p>{DRAMA.numberNote}</p>
				<p>
					<ServiceNames text={DRAMA.source} />
				</p>
			</div>
			<p
				role="status"
				className={failed || blocked ? "text-sm text-warning" : "sr-only"}
			>
				{failed
					? AUDIO_FAILED_TEXT
					: blocked
						? AUDIO_BLOCKED_TEXT
						: playing && !loading
							? "장면 재생 중"
							: ""}
			</p>
		</div>
	);
}
