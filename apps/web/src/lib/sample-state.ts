// 샘플 플레이어의 상태 전이(브리프 7절). 오디오 요소 조작과 스크린 리더 알림은 sample-player.tsx가 한다.
// 지금 재생 대상 하나만 상태를 가진다. 행과 패널은 샘플 주소(키)로 읽으므로 같은 샘플은 모두 같은 상태다.
export type SampleStatus = "idle" | "loading" | "playing" | "failed";
export type Noun = "샘플" | "내 문장" | "저장된 결과" | "대사";
export type Current = {
	voiceId: string;
	name: string;
	noun: Noun;
	owner: string | null;
	status: Exclude<SampleStatus, "idle">;
} | null;

// 받침 없는 말(저장된 결과, 대사)은 '를'
const object = (noun: Noun) =>
	noun === "저장된 결과" || noun === "대사" ? `${noun}를` : `${noun}을`;
// 저장된 결과의 owner는 voiceKey라 "공급자:…"로 시작한다. Gemini는 크레딧이 아니라 요금이다(trial-view costCopy)
export const announceOf = (current: NonNullable<Current>) =>
	`${current.name} ${current.noun} 재생 중${current.noun === "저장된 결과" ? (current.owner?.startsWith("gemini:") ? ", 요금 없음" : ", 크레딧 0") : ""}`;
export const stoppedText = (current: NonNullable<Current>) =>
	`${current.name} ${object(current.noun)} 멈췄어요`;
export const failedText = (current: NonNullable<Current>) =>
	`${current.name} ${object(current.noun)} 재생하지 못했어요`;

// 샘플 버튼을 눌렀다. 불러오는 중이거나 재생 중인 같은 성우면 멈추고, 그 밖(다른 성우, 실패한 같은 성우)은 새로 불러온다.
export function pressSample(
	current: Current,
	voiceId: string,
	name: string,
	noun: Noun = "샘플",
	owner: string | null = null,
): { next: Current; effect: "stop" | "load" } {
	if (current?.voiceId === voiceId && current.status !== "failed") {
		return { next: null, effect: "stop" };
	}
	return {
		next: { voiceId, name, noun, owner, status: "loading" },
		effect: "load",
	};
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
