"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { CircleCheck, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { chipPress } from "@/lib/landing";
import {
	clockText,
	HERO_LISTEN_NOTE,
	HERO_NUMBER_COUNT,
	HERO_ORIGINAL,
	HERO_PICK_HINT,
	HERO_SAMPLES,
	HERO_SPOKEN,
	type HeroPart,
	sampleName,
	sampleNote,
} from "@/lib/landing-content";
import { ServiceNames } from "./service-names";

// 히어로의 '작동하는 문단 카드'(브리프 3·5절). 앱 문단 카드(paragraph-card)의 토큰·반경·간격을 따르되, 앱 컴포넌트는 데이터·상태에 묶여 있어 랜딩 전용으로 작게 둔다.
// 소리 요소는 마크업에 없다: 방문자가 칩을 고르거나 재생을 누를 때 만들고(지연 로드), 하나뿐이라 한 번에 하나만 난다. 자동 재생 없음.
type Status = "idle" | "loading" | "ready" | "playing" | "failed";
type View = "original" | "spoken";
const VIEWS: { value: View; label: string }[] = [
	{ value: "original", label: "원문" },
	{ value: "spoken", label: "발음용" },
];
// 다른 문장을 읽은 샘플(Airy)의 이유. 어느 칩을 골랐든 칩 아래에 늘 보이고, 그 칩이 설명으로 가리킨다
const OTHER_NOTE = HERO_SAMPLES.map(sampleNote).find(Boolean);

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

export function HeroCard() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [pick, setPick] = useState(0);
	const [status, setStatus] = useState<Status>("idle");
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [view, setView] = useState<View>("original");
	// 칩을 누르면 click(선택·재생)이 먼저, 라디오 change가 뒤에 온다. 같은 칩을 두 번 받지 않게 지금 고른 칸은 ref로 바로 안다
	const pickRef = useRef(0);
	useEffect(() => () => audioRef.current?.pause(), []);
	const sample = HERO_SAMPLES[pick] ?? HERO_SAMPLES[0];
	if (!sample) return null;
	const name = sampleName(sample);

	function audio() {
		if (audioRef.current) return audioRef.current;
		const el = new Audio();
		el.addEventListener("loadedmetadata", () => setDuration(el.duration));
		el.addEventListener("canplay", () =>
			setStatus((s) => (s === "loading" ? "ready" : s)),
		);
		el.addEventListener("playing", () => setStatus("playing"));
		el.addEventListener("pause", () =>
			setStatus((s) => (s === "playing" ? "ready" : s)),
		);
		el.addEventListener("ended", () => {
			el.currentTime = 0;
			setTime(0);
			setStatus("ready");
		});
		el.addEventListener("timeupdate", () => setTime(el.currentTime));
		el.addEventListener("error", () => setStatus("failed"));
		audioRef.current = el;
		return el;
	}

	// 칩을 고르면 지금 소리를 멈추고 그 샘플을 받아 둔다
	function load(index: number) {
		const next = HERO_SAMPLES[index];
		if (!next) return null;
		const el = audio();
		el.pause();
		el.preload = "auto";
		el.src = next.src;
		el.load();
		setTime(0);
		setDuration(0);
		setStatus("loading");
		return el;
	}

	function play(el: HTMLAudioElement) {
		el.play().catch((error: unknown) => {
			if (!(error instanceof DOMException && error.name === "AbortError"))
				setStatus("failed");
		});
	}

	// 방향키 이동: 고르고 받아 두기만 한다(소리는 방문자가 누를 때만)
	function select(index: number) {
		if (index === pickRef.current) return;
		pickRef.current = index;
		setPick(index);
		load(index);
	}

	// 마우스·터치로 누름(사용자 제스처): 다른 칩이면 고르고 바로 재생, 고른 칩이면 재생·멈춤
	function press(index: number) {
		if (chipPress(pickRef.current, index) === "toggle") {
			toggle();
			return;
		}
		pickRef.current = index;
		setPick(index);
		const el = load(index);
		if (el) play(el);
	}

	// 재생 중이거나 받는 중이면 멈추고, 아니면 재생한다(처음이나 실패 뒤에는 다시 받는다)
	function toggle() {
		const el = audio();
		if (status === "playing" || status === "loading") {
			el.pause();
			setStatus(status === "loading" ? "idle" : "ready");
			return;
		}
		if (status === "idle" || status === "failed") load(pick);
		play(el);
	}

	const failed = status === "failed";
	const label = failed
		? `${name} 다시 재생`
		: status === "playing"
			? `${name} 멈춤`
			: status === "loading"
				? `${name} 불러오는 중, 멈춤`
				: `${name} 재생`;

	return (
		<div
			id="hero-card"
			className="flex flex-col gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-border ring-inset"
		>
			<div className="flex items-baseline gap-3">
				<span className="min-w-6 font-bold text-muted-foreground text-sm tabular-nums">
					<span className="sr-only">문단 </span>1
				</span>
				{/* 원문·발음용을 같은 칸에 겹쳐 두고 투명도로 크로스페이드(200ms). 보이지 않는 판은 스크린 리더에서 숨긴다 */}
				<div className="grid flex-1 text-base leading-relaxed">
					<p
						aria-hidden={view !== "original"}
						className={cn(
							"col-start-1 row-start-1 break-keep transition-opacity duration-200 ease-out",
							view !== "original" && "opacity-0",
						)}
					>
						<Text parts={HERO_ORIGINAL} />
					</p>
					<p
						aria-hidden={view !== "spoken"}
						className={cn(
							"col-start-1 row-start-1 break-keep transition-opacity duration-200 ease-out",
							view !== "spoken" && "opacity-0",
						)}
					>
						<Text parts={HERO_SPOKEN} />
					</p>
				</div>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
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
			{/* 안내는 재생한 뒤에도 그대로 둔다(상태에 따라 사라지지 않는다) */}
			<p
				id="hero-pick-hint"
				className="border-border border-t pt-3 font-bold text-sm"
			>
				{HERO_PICK_HINT}
			</p>
			<div
				role="radiogroup"
				aria-label="목소리 고르기"
				aria-describedby="hero-pick-hint"
				className="-mt-1 flex flex-wrap gap-2"
			>
				{HERO_SAMPLES.map((item, index) => {
					const on = index === pick;
					return (
						// biome-ignore lint/a11y/useKeyWithClickEvents: 키보드는 안쪽 라디오(방향키·Space)가 맡고 여기는 마우스·터치만 받는다
						<label
							key={item.id}
							className="relative"
							// 마우스·터치 누름은 라벨 안쪽(span)에서 온 click이다. 라벨이 input에 다시 보내는 click과 방향키 click은 target이 input이라 거른다
							onClick={(event) => {
								if (!(event.target instanceof HTMLInputElement)) press(index);
							}}
						>
							<input
								type="radio"
								name="hero-voice"
								className="peer sr-only"
								aria-describedby={item.other ? "hero-other-note" : undefined}
								checked={on}
								// 방향키 이동은 고르고 받아 두기만 한다(자동 재생 없음)
								onChange={() => select(index)}
							/>
							<span className="landing-press flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5 ring-1 ring-border ring-inset transition-colors hover:bg-muted peer-checked:bg-primary-subtle peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2">
								<span className="font-bold text-sm" translate="no">
									{item.provider}
								</span>
								<span
									className={cn(
										"flex items-center gap-1 text-xs",
										on && failed ? "text-warning" : "text-muted-foreground",
									)}
								>
									{on && failed ? (
										"재생할 수 없어요"
									) : on && status === "loading" ? (
										<>
											<Spinner aria-hidden="true" className="size-3" />
											불러오는 중
										</>
									) : item.other ? (
										"다른 문장"
									) : (
										<span translate="no">{item.voice}</span>
									)}
								</span>
							</span>
						</label>
					);
				})}
			</div>
			{OTHER_NOTE ? (
				<p
					id="hero-other-note"
					className="text-pretty break-keep text-muted-foreground text-sm"
				>
					<ServiceNames text={OTHER_NOTE} />
				</p>
			) : null}
			<div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
				<Button size="icon-lg" aria-label={label} onClick={toggle}>
					{status === "playing" ? (
						<Pause aria-hidden="true" />
					) : status === "loading" ? (
						<Spinner aria-hidden="true" />
					) : (
						<Play aria-hidden="true" />
					)}
				</Button>
				{/* 진행은 막대 하나(무한 반복 없음). 길이를 알면 비율, 아니면 비어 있다 */}
				<div
					role="progressbar"
					aria-label="재생 위치"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={duration > 0 ? Math.round((time / duration) * 100) : 0}
					className="h-1 flex-1 overflow-hidden rounded-full bg-border"
				>
					<div
						className="h-full origin-left rounded-full bg-primary transition-transform duration-200 ease-linear"
						style={{
							transform: `scaleX(${duration > 0 ? Math.min(time / duration, 1) : 0})`,
						}}
					/>
				</div>
				<span className="text-muted-foreground text-sm tabular-nums">
					{`${clockText(time)} / ${clockText(duration)}`}
				</span>
			</div>
			<p role="status" className="sr-only">
				{status === "playing"
					? `${name} 재생 중`
					: failed
						? "재생할 수 없어요"
						: ""}
			</p>
		</div>
	);
}
