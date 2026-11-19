import { cn } from "@tts-pilot-app/ui/lib/utils";

const SLOT = 4;
const HEIGHT = 40;

// 미리 뽑은 막대 값으로 그린 파형(브리프 5절, SVG만). progress가 있으면(재생 중인 줄) 그 위치까지 primary로 칠하고 나머지는 약간 흐리게 둔다.
// 지금 소리가 나는 막대 하나는 foreground로 짙게, 그 앞에 진행 위치 세로선(playhead)을 긋는다.
// 칠하기와 선 위치만 바뀌고 막대 높이는 움직이지 않아 움직임 줄이기에서도 같다. 장식이라 스크린 리더에서 숨긴다
export function Waveform({
	bars,
	progress,
	className,
}: {
	bars: readonly number[];
	progress: number | null;
	className?: string;
}) {
	const cut = progress === null ? -1 : Math.floor(progress * bars.length);
	return (
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${bars.length * SLOT} ${HEIGHT}`}
			preserveAspectRatio="none"
			className={cn("h-10 w-full", className)}
		>
			{bars.map((value, index) => {
				const h = Math.max(2, value * (HEIGHT - 4));
				return (
					<rect
						key={index}
						x={index * SLOT + 0.8}
						y={(HEIGHT - h) / 2}
						width={SLOT - 1.6}
						height={h}
						rx={0.8}
						className={cn(
							"transition-colors",
							index === cut
								? "fill-foreground"
								: index < cut
									? "fill-primary"
									: "fill-muted-foreground",
							progress !== null && index > cut && "opacity-70",
						)}
					/>
				);
			})}
			{progress !== null && progress > 0 ? (
				<line
					x1={progress * bars.length * SLOT}
					x2={progress * bars.length * SLOT}
					y1={0}
					y2={HEIGHT}
					vectorEffect="non-scaling-stroke"
					strokeWidth={2}
					className="stroke-foreground"
				/>
			) : null}
		</svg>
	);
}
