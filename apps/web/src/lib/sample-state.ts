// 샘플 플레이어의 상태 전이(브리프 7절). 오디오 요소 조작과 스크린 리더 알림은 sample-player.tsx가 한다.
// 지금 재생 대상 하나만 상태를 가진다. 행과 패널은 샘플 주소(키)로 읽으므로 같은 샘플은 모두 같은 상태다.
export type SampleStatus = "idle" | "loading" | "playing" | "failed";
export type Current = {
	voiceId: string;
	name: string;
	status: Exclude<SampleStatus, "idle">;
} | null;

// 샘플 버튼을 눌렀다. 불러오는 중이거나 재생 중인 같은 성우면 멈추고, 그 밖(다른 성우, 실패한 같은 성우)은 새로 불러온다.
export function pressSample(
	current: Current,
	voiceId: string,
	name: string,
): { next: Current; effect: "stop" | "load" } {
	if (current?.voiceId === voiceId && current.status !== "failed") {
		return { next: null, effect: "stop" };
	}
	return { next: { voiceId, name, status: "loading" }, effect: "load" };
}

// 재생이 실패했다. 이미 다른 성우로 바뀌었으면(앞 성우의 늦은 실패) 그대로 둔다.
export function playFailed(current: Current, voiceId: string): Current {
	return current?.voiceId === voiceId
		? { ...current, status: "failed" }
		: current;
}

// 재생이 시작됐다. 이미 재생 중이거나(버퍼링 뒤 다시 온 playing) 다른 성우면 같은 객체를 돌려준다(다시 알리지 않는다).
export function playing(current: Current, voiceId: string): Current {
	return current?.voiceId === voiceId && current.status !== "playing"
		? { ...current, status: "playing" }
		: current;
}
