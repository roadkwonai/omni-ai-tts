"use client";

import {
	CLONE_LIMITS,
	type CloneProvider,
} from "@tts-pilot-app/api/my-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Mic, Play, RotateCcw, Square, Upload } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { toCloneWav } from "@/lib/clone-audio";
import { MY_VOICE_TEXT as T } from "@/lib/my-voice-text";
import { lengthProblemText, recordingHintOf } from "@/lib/my-voice-view";
import { sampleAriaLabel } from "@/lib/voice-view";

import { usePlayer, useSample } from "./sample-player";

// 서버가 받는 24kHz 모노 WAV와 그 길이(초). 길이·무음 검사를 통과한 값만 부모에게 간다
export type CaptureValue = { wav: Blob; seconds: number };

type Range = { min: number; max: number };
const rangeOf = (provider: CloneProvider, kind: "source" | "consent"): Range =>
	(CLONE_LIMITS[provider] as Record<string, Range>)[kind];

// 상한에서 멈춘 녹음이 멈춤 뒤 꼬리(MediaRecorder 지연)로 상한을 넘으면 서버가 '너무 김'으로 거절한다. 그 여유를 미리 뺀다
const STOP_MARGIN = 0.5;

// 고른 파일의 크기 상한. 넘으면 디코드하지 않는다
const FILE_MAX_BYTES = 50 * 1024 * 1024;

export const clockOf = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

type Opened =
	| { stream: MediaStream; recorder: MediaRecorder }
	| "denied"
	| "missing";

// 컴포넌트 밖에 둔다: 컴포넌트 안 try/catch는 React Compiler가 그 컴포넌트를 건너뛴다
async function openRecorder(): Promise<Opened> {
	let stream: MediaStream | undefined;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		return { stream, recorder: new MediaRecorder(stream) };
	} catch (error) {
		stream?.getTracks().forEach((track) => {
			track.stop();
		});
		return error instanceof DOMException &&
			(error.name === "NotAllowedError" || error.name === "SecurityError")
			? "denied"
			: "missing";
	}
}

const stopTracks = (stream: MediaStream) =>
	stream.getTracks().forEach((track) => {
		track.stop();
	});

type Checked = { value: CaptureValue } | { problem: string };

// 풀기 → 길이 → 무음 순으로 보고 첫 문제를 문구로 돌려준다
async function check(
	blob: Blob,
	provider: CloneProvider,
	kind: "source" | "consent",
): Promise<Checked> {
	let made: Awaited<ReturnType<typeof toCloneWav>>;
	try {
		made = await toCloneWav(blob);
	} catch {
		return { problem: T.undecodable };
	}
	// 동의 녹음(consent)은 Gemini에만 있다. Fish에서는 이 칸을 쓰지 않는다
	const length = lengthProblemText(provider as "gemini", kind, made.seconds);
	if (length) return { problem: length };
	if (made.silent) return { problem: T.silent };
	return { value: { wav: made.wav, seconds: made.seconds } };
}

// '내 원본'·'동의 녹음' 재생(앱의 한 번에 한 소리 플레이어). 주소는 값이 바뀔 때·언마운트에 해제하고 그 소리가 아직 나면 멈춘다.
// SamplePlayerProvider 안에서만 쓴다
export function OriginalPlayer({
	label,
	value,
	focusWhenReady = false,
}: {
	label: string;
	value: CaptureValue;
	// 녹음을 막 멈춘 뒤: 주소가 준비돼 버튼이 켜지면 포커스를 받는다
	focusWhenReady?: boolean;
}) {
	const key = useId();
	const player = usePlayer();
	const { status, toggle } = useSample(key);
	const [url, setUrl] = useState<string | null>(null);
	// 내가 튼 소리의 순번. 그 뒤 다른 소리가 시작되지 않았을 때만 멈춘다
	const startedAt = useRef<number | null>(null);
	const button = useRef<HTMLButtonElement>(null);
	// Provider의 stop·version은 렌더마다 새 함수다. deps에 두면 재생 중 cleanup이 돌아 소리가 멈추고 주소가 해제되므로 ref로 읽는다
	const playerRef = useRef(player);
	useLayoutEffect(() => {
		playerRef.current = player;
	});

	useEffect(() => {
		const next = URL.createObjectURL(value.wav);
		setUrl(next);
		return () => {
			const { stop, version } = playerRef.current;
			if (startedAt.current === version()) stop();
			startedAt.current = null;
			URL.revokeObjectURL(next);
		};
	}, [value]);

	useEffect(() => {
		if (focusWhenReady && url !== null) button.current?.focus();
	}, [focusWhenReady, url]);

	return (
		<div className="flex items-center gap-3">
			<Button
				ref={button}
				type="button"
				variant={status === "playing" ? "default" : "outline"}
				size="icon-lg"
				className="shrink-0 rounded-full"
				disabled={url === null}
				aria-label={sampleAriaLabel(status, label)}
				aria-busy={status === "loading" || undefined}
				onClick={() => {
					if (url === null) return;
					toggle(key, label, url);
					startedAt.current = player.version();
				}}
			>
				{status === "loading" ? (
					<Spinner aria-hidden="true" className="motion-reduce:animate-none" />
				) : status === "playing" ? (
					<Square aria-hidden="true" className="fill-current" />
				) : (
					<Play aria-hidden="true" className="fill-current" />
				)}
			</Button>
			<p className="flex flex-col text-sm">
				<span className="font-bold">{label}</span>
				<span className="text-muted-foreground tabular-nums">
					{clockOf(value.seconds)}
				</span>
			</p>
		</div>
	);
}

type Session = {
	stream: MediaStream;
	recorder: MediaRecorder;
	timer: ReturnType<typeof setInterval>;
};

// 녹음·파일 칸 하나(원본·동의 녹음 공용, 브리프 3절). 마이크는 녹음 버튼을 누를 때만 연다.
// 멈춤·언마운트에 모든 트랙을 끄고, 언마운트 때 진행 중인 녹음은 버린다. 첫 Esc는 창이 아니라 녹음을 멈춘다
export function AudioCapture({
	kind,
	provider,
	value,
	onChange,
}: {
	kind: "source" | "consent";
	provider: CloneProvider;
	value: CaptureValue | null;
	onChange: (value: CaptureValue | null) => void;
}) {
	const [phase, setPhase] = useState<"idle" | "opening" | "recording" | "busy">(
		"idle",
	);
	const [elapsed, setElapsed] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState("");
	// 상한에 닿아 자동으로 멈춘 뒤 화면에도 한 줄 남긴다(새 녹음·파일 고르기에서 지운다)
	const [capped, setCapped] = useState(false);
	const session = useRef<Session | null>(null);
	const alive = useRef(true);
	const fileInput = useRef<HTMLInputElement>(null);
	const recordButton = useRef<HTMLButtonElement>(null);
	const fileButton = useRef<HTMLButtonElement>(null);
	// 녹음을 멈췄거나 파일을 고른 직후. 사라지거나 꺼진 버튼에서 떨어진 포커스를 결과 쪽으로 옮긴다
	// (원본이 있으면 재생 버튼, 문제가 있으면 방금 쓴 '녹음하기'·'파일 고르기')
	const [focusBack, setFocusBack] = useState<"record" | "file" | null>(null);
	const { min, max } = rangeOf(provider, kind);
	const recording = phase === "recording";

	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			const open = session.current;
			if (!open) return;
			clearInterval(open.timer);
			open.recorder.onstop = null;
			open.recorder.ondataavailable = null;
			if (open.recorder.state !== "inactive") open.recorder.stop();
			stopTracks(open.stream);
			session.current = null;
		};
	}, []);

	// 녹음 중 Esc: 창 닫기보다 먼저 받아 녹음만 멈춘다(창이 같은 키를 못 보게 막는다)
	// biome-ignore lint/correctness/useExhaustiveDependencies: stopRecording은 ref만 읽는다
	useEffect(() => {
		if (!recording) return;
		function onKey(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			stopRecording();
		}
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [recording]);

	// 문제가 있으면 방금 쓴 버튼이 켜진 뒤 포커스를 준다(원본이 있으면 OriginalPlayer가 받는다)
	useEffect(() => {
		if (focusBack && phase === "idle" && !value) {
			(focusBack === "file" ? fileButton : recordButton).current?.focus();
			setFocusBack(null);
		}
	}, [focusBack, phase, value]);

	function stopRecording() {
		const recorder = session.current?.recorder;
		if (recorder && recorder.state !== "inactive") recorder.stop();
	}

	async function finish(blob: Blob) {
		setPhase("busy");
		const checked = await check(blob, provider, kind);
		if (!alive.current) return;
		setPhase("idle");
		if ("problem" in checked) {
			setError(checked.problem);
			onChange(null);
		} else {
			setError(null);
			onChange(checked.value);
		}
	}

	async function start() {
		setError(null);
		setFocusBack(null);
		setPhase("opening");
		const opened = await openRecorder();
		if (!alive.current) {
			if (typeof opened !== "string") stopTracks(opened.stream);
			return;
		}
		if (typeof opened === "string") {
			setPhase("idle");
			setError(opened === "denied" ? T.micDenied : T.micMissing);
			return;
		}
		const { stream, recorder } = opened;
		const chunks: Blob[] = [];
		const began = Date.now();
		let announced = 0;
		const timer = setInterval(() => {
			const seconds = (Date.now() - began) / 1000;
			const whole = Math.floor(seconds);
			setElapsed(whole);
			if (whole >= 10 && whole % 10 === 0 && whole !== announced) {
				announced = whole;
				setAnnouncement(T.recordedSeconds(whole));
			}
			if (seconds >= max - STOP_MARGIN) {
				setCapped(true);
				stopRecording();
			}
		}, 200);
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => {
			clearInterval(timer);
			setFocusBack("record");
			stopTracks(stream);
			session.current = null;
			void finish(new Blob(chunks, { type: recorder.mimeType }));
		};
		session.current = { stream, recorder, timer };
		// 새 녹음이 시작되면 앞 원본은 버린다
		onChange(null);
		setElapsed(0);
		setAnnouncement("");
		setCapped(false);
		recorder.start();
		setPhase("recording");
	}

	const idle = phase === "idle";
	const clock = recording ? elapsed : (value?.seconds ?? 0);
	const hint = recording ? recordingHintOf(min, elapsed) : null;

	return (
		<div className="flex flex-col items-center gap-4 py-2">
			<div className="flex flex-col items-center gap-1">
				<p className="flex items-center gap-2">
					{recording ? (
						<span
							aria-hidden="true"
							className="size-3 rounded-full bg-warning motion-safe:animate-pulse"
						/>
					) : null}
					<span className="font-bold text-4xl tabular-nums">
						{clockOf(clock)}
					</span>
					{recording ? (
						<span className="font-bold text-sm">{T.recording}</span>
					) : null}
				</p>
				<p
					className={cn(
						"text-sm",
						hint?.enough ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{hint ? hint.text : T.rangeHint(min, max)}
				</p>
				{capped && idle ? (
					<p role="status" className="text-muted-foreground text-sm">
						{T.recordStopped}
					</p>
				) : null}
			</div>

			{value && idle ? (
				<OriginalPlayer
					label={kind === "source" ? T.sourceAudio : T.consentAudio}
					value={value}
					focusWhenReady={focusBack !== null}
				/>
			) : null}

			<div className="flex flex-wrap justify-center gap-2">
				{recording ? (
					<Button type="button" size="lg" onClick={stopRecording}>
						<Square
							data-icon="inline-start"
							aria-hidden="true"
							className="fill-current"
						/>
						{T.stop}
					</Button>
				) : (
					<>
						<Button
							ref={recordButton}
							type="button"
							size="lg"
							variant={value ? "neutral" : "default"}
							disabled={!idle}
							onClick={() => void start()}
						>
							{phase === "opening" || phase === "busy" ? (
								<Spinner
									data-icon="inline-start"
									aria-hidden="true"
									className="motion-reduce:animate-none"
								/>
							) : value ? (
								<RotateCcw data-icon="inline-start" aria-hidden="true" />
							) : (
								<Mic data-icon="inline-start" aria-hidden="true" />
							)}
							{value ? T.reRecord : T.record}
						</Button>
						<Button
							ref={fileButton}
							type="button"
							size="lg"
							variant="neutral"
							disabled={!idle}
							onClick={() => fileInput.current?.click()}
						>
							<Upload data-icon="inline-start" aria-hidden="true" />
							{value ? T.changeFile : T.pickFile}
						</Button>
					</>
				)}
			</div>
			<input
				ref={fileInput}
				type="file"
				accept="audio/*"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0];
					// 같은 파일을 다시 골라도 change가 오게 비운다
					event.target.value = "";
					if (!file) return;
					setCapped(false);
					setFocusBack("file");
					// 디코드는 파일 전체를 메모리에 푼다. 너무 큰 파일은 풀지 않고 돌려보낸다
					if (file.size > FILE_MAX_BYTES) {
						setError(T.fileTooBig);
						onChange(null);
						return;
					}
					setError(null);
					void finish(file);
				}}
			/>

			{error ? (
				<p role="alert" className="text-center text-sm text-warning">
					{error}
				</p>
			) : null}
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</div>
	);
}
