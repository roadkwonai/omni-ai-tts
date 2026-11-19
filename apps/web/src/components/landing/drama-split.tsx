import { cn } from "@tts-pilot-app/ui/lib/utils";
import { FileText } from "lucide-react";

import { DRAMA } from "@/lib/landing-content";
import { WAVEFORMS } from "@/lib/landing-waveforms";

import { SPEAKER_CLASSES } from "./speaker-classes";
import { Waveform } from "./waveform";

// 분해 도해(정적, 브리프 3절 4번): 장면 파형 하나가 줄별 조각 넷으로 갈라지고 조각마다 '대사 n.wav', 옆에 '자막.srt'.
// 조각 폭은 줄 길이에 비례한다(flex-grow). 그림은 장식이라 스크린 리더에는 캡션 한 줄만 읽힌다
export function DramaSplit() {
	const wave = WAVEFORMS[DRAMA.id];
	if (!wave) return null;
	const count = wave.bars.length;
	const pieces = DRAMA.lines.map((line) => ({
		line,
		grow: line.end - line.start,
		bars: wave.bars.slice(
			Math.round((line.start / DRAMA.total) * count),
			Math.round((line.end / DRAMA.total) * count),
		),
	}));

	return (
		<figure className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:p-6">
			<figcaption className="text-pretty break-keep font-bold text-lg">
				{DRAMA.splitCaption}
			</figcaption>
			<div aria-hidden="true" className="flex flex-col gap-1">
				<Waveform bars={wave.bars} progress={null} />
				<div className="flex gap-2">
					{pieces.map(({ line, grow }) => (
						<span
							key={line.start}
							style={{ flexGrow: grow }}
							className="flex h-4 min-w-0 basis-0 justify-center"
						>
							<span className="w-px bg-border" />
						</span>
					))}
				</div>
				<div className="flex gap-2">
					{pieces.map(({ line, grow, bars }, index) => (
						<div
							key={line.start}
							style={{ flexGrow: grow }}
							className="flex min-w-0 basis-0 flex-col gap-1.5"
						>
							<span
								className={cn(
									"rounded-lg px-1.5 py-1",
									SPEAKER_CLASSES[line.speaker].chip,
								)}
							>
								<Waveform bars={bars} progress={null} className="h-8" />
							</span>
							<span className="wrap-break-word text-center font-mono text-muted-foreground text-xs">
								{DRAMA.splitFile(index + 1)}
							</span>
						</div>
					))}
				</div>
				<span className="mt-2 flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-muted-foreground text-xs">
					<FileText className="size-4" />
					{DRAMA.srtFile}
				</span>
			</div>
		</figure>
	);
}
