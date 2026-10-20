"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	announceOf,
	type Current,
	failedText,
	type Noun,
	playFailed,
	playing,
	pressSample,
	type SampleStatus,
	stoppedText,
} from "@/lib/sample-state";

// name은 알림의 "{name} 샘플 재생 중"에 들어간다. '샘플'은 알림이 붙이므로 부르는 쪽은 넘기지 않는다(브리프 9절)
type Toggle = (
	voiceId: string,
	name: string,
	url: string,
	noun?: Noun,
	owner?: string | null,
) => void;

const SamplePlayerContext = createContext<{
	current: Current;
	toggle: Toggle;
	stop: () => void;
	idle: () => boolean;
	version: () => number;
} | null>(null);

// 페이지에 오디오 요소 하나를 두고 모든 행과 패널이 함께 쓴다. 한 번에 하나만 재생한다(REQ-03, 스펙 5절).
// 기본 샘플과 시험 생성 결과(blob: 주소)를 같은 오디오 요소로 재생한다. 호출은 합치지 않는다(REQ-03).
// ponytail: 상태가 바뀌면 행 전부가 다시 그려진다(최대 수백 행). 느려지면 성우 id별 구독(useSyncExternalStore)으로 바꾼다.
export function SamplePlayerProvider({ children }: { children: ReactNode }) {
	const audioRef = useRef<HTMLAudioElement>(null);
	// 마지막으로 불러온 성우. 앞 성우의 늦은 실패가 다른 성우를 듣는 중에 알림을 띄우지 않게 거른다.
	const latestVoiceId = useRef<string | null>(null);
	const [current, setCurrent] = useState<Current>(null);
	const currentRef = useRef<Current>(null);
	const versionRef = useRef(0);
	const [announcement, setAnnouncement] = useState("");
	const updateCurrent = (next: Current) => {
		currentRef.current = next;
		setCurrent(next);
	};

	// 페이지를 떠나면 멈춘다(AC11).
	useEffect(() => {
		const audio = audioRef.current;
		return () => audio?.pause();
	}, []);

	// 재생 실패 하나로 play() 거절과 오디오 error 이벤트가 함께 쓴다.
	function markFailed(voiceId: string) {
		if (latestVoiceId.current !== voiceId) return;
		const next = playFailed(currentRef.current, voiceId);
		if (next === currentRef.current || !next) return;
		updateCurrent(next);
		setAnnouncement(failedText(next));
	}

	const toggle: Toggle = (voiceId, name, url, noun = "샘플", owner = null) => {
		const audio = audioRef.current;
		if (!audio) return;
		const previous = currentRef.current;
		const { next, effect } = pressSample(previous, voiceId, name, noun, owner);
		versionRef.current += 1;
		updateCurrent(next);
		if (effect === "stop") {
			latestVoiceId.current = null;
			audio.pause();
			// 받던 샘플을 끊는다. src를 빈 문자열로 두면 페이지 주소를 불러와 error가 난다.
			audio.removeAttribute("src");
			audio.load();
			if (previous) setAnnouncement(stoppedText(previous));
			return;
		}
		latestVoiceId.current = voiceId;
		audio.src = url;
		setAnnouncement("");
		audio.play().catch((error: unknown) => {
			// 다른 샘플로 바뀌거나 멈춰서 끊긴 play()는 실패가 아니다.
			if (error instanceof DOMException && error.name === "AbortError") return;
			markFailed(voiceId);
		});
	};

	return (
		<SamplePlayerContext
			value={{
				current,
				toggle,
				// 듣는 샘플을 같은 샘플을 다시 누른 꼴로 멈춘다. 실패한 샘플은 소리가 없고, 다시 누르면 다시 불러오므로(pressSample) 건드리지 않는다
				stop: () => {
					const last = currentRef.current;
					if (last && last.status !== "failed")
						toggle(
							last.voiceId,
							last.name,
							last.voiceId,
							last.noun,
							last.owner,
						);
				},
				idle: () =>
					currentRef.current === null || currentRef.current.status === "failed",
				version: () => versionRef.current,
			}}
		>
			{children}
			{/* 화면에 보이지 않는다. 기본 샘플과 내 문장 결과를 재생한다 */}
			{/* biome-ignore lint/a11y/useMediaCaption: 공급자 기본 샘플은 자막이 없다(화면 밖 재생 전용) */}
			<audio
				ref={audioRef}
				preload="none"
				onPlaying={() => {
					const next = playing(currentRef.current, latestVoiceId.current ?? "");
					// 버퍼링 뒤 다시 온 playing은 같은 객체라 다시 알리지 않는다.
					if (next === currentRef.current || next === null) return;
					updateCurrent(next);
					setAnnouncement(announceOf(next));
				}}
				onEnded={() => updateCurrent(null)}
				onError={(event) => {
					// 멈출 때 src를 지워 생긴 이벤트는 실패가 아니다.
					const latest = currentRef.current;
					if (!event.currentTarget.getAttribute("src") || !latest) return;
					markFailed(latest.voiceId);
				}}
			/>
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</SamplePlayerContext>
	);
}

// 재생 키는 T4부터 샘플 오디오 주소다. 행과 패널의 같은 샘플이 같은 상태를 보이고, 공급자끼리 성우 id가 겹쳐도 섞이지 않는다. 이름 voiceId는 T3 그대로다.
export function useSample(voiceId: string) {
	const player = usePlayer();
	const status: SampleStatus =
		player.current?.voiceId === voiceId ? player.current.status : "idle";
	return { status, toggle: player.toggle };
}

export function usePlayer() {
	const player = useContext(SamplePlayerContext);
	if (!player)
		throw new Error("usePlayer는 SamplePlayerProvider 안에서만 쓴다");
	return player;
}
