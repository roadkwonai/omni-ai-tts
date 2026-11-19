"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// 장면 공통 플레이어(브리프 5절): 소리 요소는 마크업에 없고 방문자가 누를 때 하나를 만든다(자동 재생 없음).
// 요소 하나를 돌려 쓰므로 새 재생이 이전 재생을 멈추고, 한 번 허락받은 요소라 '이어 듣기'가 다음 줄로 넘어가도 막히지 않는다.
// 진행 위치(progress)와 재생 시각(time, 초)은 지금 재생 중인 줄 하나만 받는다. 로드에 실패한 줄은 failed에 남고 이어 듣기는 다음 줄로 넘어간다.
// 재생을 브라우저가 막은 줄(자동 재생 차단)은 실패가 아니라 blocked로 두고 다시 누르게 한다.
// 장면(히어로·연기·드라마)마다 이 훅을 따로 쓰므로, 한 장면이 재생을 시작하면 다른 장면의 재생을 멈춘다(active). start는 그 시각(초)부터 재생한다
export type PlayItem = { id: string; src: string; start?: number };
type Current = { id: string; status: "loading" | "playing"; all: boolean };
const NONE: ReadonlySet<string> = new Set();
type Handle = { stop: () => void };
let active: Handle | null = null;

// play()가 거절된 까닭을 가른다. abort는 다른 줄을 눌러 로드가 끊긴 것, unsupported는 소리 요소의 error 이벤트가 따로 알리므로 여기서는 세지 않는다(이중 실패 방지),
// blocked는 자동 재생 차단이다
export type PlayErrorKind = "abort" | "blocked" | "unsupported" | "failed";
export function playErrorKind(error: unknown): PlayErrorKind {
	if (error instanceof DOMException) {
		if (error.name === "AbortError") return "abort";
		if (error.name === "NotAllowedError") return "blocked";
		if (error.name === "NotSupportedError") return "unsupported";
	}
	return "failed";
}

// 늦게 온 실패 알림은 지금 재생 중인 줄의 것일 때만 센다(이미 다음 줄로 넘어갔으면 무시)
export function isCurrentItem(
	current: PlayItem | undefined,
	id: string,
): boolean {
	return current?.id === id;
}

export function useSamplePlayer() {
	const handle = useRef<Handle>({ stop: () => {} }).current;
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const queueRef = useRef<readonly PlayItem[]>([]);
	const atRef = useRef(0);
	const allRef = useRef(false);
	const [current, setCurrent] = useState<Current | null>(null);
	const [progress, setProgress] = useState(0);
	const [time, setTime] = useState(0);
	const [failed, setFailed] = useState<ReadonlySet<string>>(NONE);
	const [blocked, setBlocked] = useState<string | null>(null);

	useEffect(
		() => () => {
			audioRef.current?.pause();
			if (active === handle) active = null;
		},
		[handle],
	);

	function end() {
		setCurrent(null);
		setProgress(0);
		setTime(0);
	}

	// 지금 줄 다음으로 넘어간다(끝났거나 실패했을 때). 없으면 멈춘다
	function next() {
		if (atRef.current + 1 < queueRef.current.length) startAt(atRef.current + 1);
		else end();
	}

	function audio() {
		if (audioRef.current) return audioRef.current;
		const el = new Audio();
		el.addEventListener("playing", () =>
			setCurrent((now) => now && { ...now, status: "playing" }),
		);
		el.addEventListener("timeupdate", () => {
			if (el.duration > 0)
				setProgress(Math.min(el.currentTime / el.duration, 1));
			setTime(el.currentTime);
		});
		el.addEventListener("ended", next);
		el.addEventListener("error", () => {
			const item = queueRef.current[atRef.current];
			if (item) fail(item.id);
		});
		audioRef.current = el;
		return el;
	}

	function fail(id: string) {
		if (!isCurrentItem(queueRef.current[atRef.current], id)) return;
		setFailed((now) => new Set(now).add(id));
		next();
	}

	function startAt(index: number) {
		const item = queueRef.current[index];
		if (!item) return end();
		atRef.current = index;
		if (active && active !== handle) active.stop();
		active = handle;
		const el = audio();
		el.pause();
		el.src = item.src;
		if (item.start) el.currentTime = item.start;
		setCurrent({ id: item.id, status: "loading", all: allRef.current });
		setProgress(0);
		setTime(item.start ?? 0);
		el.play().catch((error: unknown) => {
			const kind = playErrorKind(error);
			if (kind === "abort" || kind === "unsupported") return;
			if (kind === "failed") return fail(item.id);
			// 자동 재생 차단: 그 줄만 '다시 눌러 주세요'로 두고 멈춘다
			if (!isCurrentItem(queueRef.current[atRef.current], item.id)) return;
			setBlocked(item.id);
			queueRef.current = [];
			end();
		});
	}

	function stop() {
		audioRef.current?.pause();
		queueRef.current = [];
		end();
	}

	// 재생 중인 소리의 위치만 옮긴다(드라마 줄을 눌렀을 때)
	function seek(seconds: number) {
		if (audioRef.current) audioRef.current.currentTime = seconds;
	}

	// 재생 중인 줄이면 멈추고(이어 듣기 중이면 이어 듣기째), 다른 줄이면 그 줄만 재생한다(이전 재생은 멈춘다)
	function toggle(item: PlayItem) {
		if (current?.id === item.id) return stop();
		setBlocked(null);
		setFailed((now) => {
			if (!now.has(item.id)) return now;
			const copy = new Set(now);
			copy.delete(item.id);
			return copy;
		});
		queueRef.current = [item];
		allRef.current = false;
		startAt(0);
	}

	// 위에서부터 차례로. 지금 이어 듣는 중이면 멈춘다
	function playAll(items: readonly PlayItem[]) {
		if (current?.all) return stop();
		setBlocked(null);
		setFailed(NONE);
		queueRef.current = items;
		allRef.current = true;
		startAt(0);
	}

	// 줄 컴포넌트를 메모할 수 있게 toggle은 늘 같은 함수다(최신 클로저를 ref로 부른다)
	const latest = useRef(toggle);
	// 렌더 중에 ref를 쓰지 않고 그리기 직후 최신 클로저로 바꾼다(paragraph-provider와 같은 방식)
	useLayoutEffect(() => {
		handle.stop = stop;
		latest.current = toggle;
	});
	const stableToggle = useRef((item: PlayItem) => latest.current(item)).current;

	return {
		currentId: current?.id ?? null,
		status: current?.status ?? "idle",
		all: current?.all ?? false,
		progress,
		time,
		failed,
		blocked,
		toggle: stableToggle,
		playAll,
		stop,
		seek,
	};
}

export type SamplePlayer = ReturnType<typeof useSamplePlayer>;
