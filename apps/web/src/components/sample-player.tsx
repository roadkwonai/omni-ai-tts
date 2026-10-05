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
	type Current,
	playFailed,
	playing,
	pressSample,
	type SampleStatus,
} from "@/lib/sample-state";

// name은 알림의 "{name} 샘플 재생 중"에 들어간다. '샘플'은 알림이 붙이므로 부르는 쪽은 넘기지 않는다(브리프 9절)
type Toggle = (voiceId: string, name: string, url: string) => void;

const SamplePlayerContext = createContext<{
	current: Current;
	toggle: Toggle;
} | null>(null);

// 페이지에 오디오 요소 하나를 두고 모든 행과 패널이 함께 쓴다. 한 번에 하나만 재생한다(REQ-03, 스펙 5절).
// 기본 샘플은 공급자 주소를 브라우저가 바로 재생한다(과금 없음). 시험 생성과 합치지 않는다.
// ponytail: 상태가 바뀌면 행 전부가 다시 그려진다(최대 수백 행). 느려지면 성우 id별 구독(useSyncExternalStore)으로 바꾼다.
export function SamplePlayerProvider({ children }: { children: ReactNode }) {
	const audioRef = useRef<HTMLAudioElement>(null);
	// 마지막으로 불러온 성우. 앞 성우의 늦은 실패가 다른 성우를 듣는 중에 알림을 띄우지 않게 거른다.
	const latestVoiceId = useRef<string | null>(null);
	const [current, setCurrent] = useState<Current>(null);
	const [announcement, setAnnouncement] = useState("");

	// 페이지를 떠나면 멈춘다(AC11).
	useEffect(() => {
		const audio = audioRef.current;
		return () => audio?.pause();
	}, []);

	// 재생 실패 하나로 play() 거절과 오디오 error 이벤트가 함께 쓴다.
	function markFailed(voiceId: string, name: string) {
		if (latestVoiceId.current !== voiceId) return;
		setCurrent((latest) => playFailed(latest, voiceId));
		setAnnouncement(`${name} 샘플을 재생하지 못했어요`);
	}

	const toggle: Toggle = (voiceId, name, url) => {
		const audio = audioRef.current;
		if (!audio) return;
		const { next, effect } = pressSample(current, voiceId, name);
		setCurrent(next);
		if (effect === "stop") {
			latestVoiceId.current = null;
			audio.pause();
			// 받던 샘플을 끊는다. src를 빈 문자열로 두면 페이지 주소를 불러와 error가 난다.
			audio.removeAttribute("src");
			audio.load();
			setAnnouncement(`${name} 샘플을 멈췄어요`);
			return;
		}
		latestVoiceId.current = voiceId;
		audio.src = url;
		setAnnouncement("");
		audio.play().catch((error: unknown) => {
			// 다른 샘플로 바뀌거나 멈춰서 끊긴 play()는 실패가 아니다.
			if (error instanceof DOMException && error.name === "AbortError") return;
			markFailed(voiceId, name);
		});
	};

	return (
		<SamplePlayerContext value={{ current, toggle }}>
			{children}
			{/* 화면에 보이지 않는다. 기본 샘플 재생에만 쓴다 */}
			{/* biome-ignore lint/a11y/useMediaCaption: 공급자 기본 샘플은 자막이 없다(화면 밖 재생 전용) */}
			<audio
				ref={audioRef}
				preload="none"
				onPlaying={() => {
					const next = playing(current, latestVoiceId.current ?? "");
					// 버퍼링 뒤 다시 온 playing은 같은 객체라 다시 알리지 않는다.
					if (next === current || next === null) return;
					setCurrent(next);
					setAnnouncement(`${next.name} 샘플 재생 중`);
				}}
				onEnded={() => setCurrent(null)}
				onError={(event) => {
					// 멈출 때 src를 지워 생긴 이벤트는 실패가 아니다.
					if (!event.currentTarget.getAttribute("src") || !current) return;
					markFailed(current.voiceId, current.name);
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
	const player = useContext(SamplePlayerContext);
	if (!player)
		throw new Error("useSample은 SamplePlayerProvider 안에서만 쓴다");
	const status: SampleStatus =
		player.current?.voiceId === voiceId ? player.current.status : "idle";
	return { status, toggle: player.toggle };
}
