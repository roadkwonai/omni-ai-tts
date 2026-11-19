// apps/web/src/lib/my-voice-view.ts
// 내 보이스 줄·창의 표시 규칙(브리프 my-voices.md 5절). 순수 함수만 둔다.
import {
	CLONE_LIMITS,
	type CloneProvider,
	cloneLengthProblem,
	type MyVoice,
	type MyVoiceStatus,
} from "@tts-pilot-app/api/my-voice-contract";

import { PROVIDER_LABEL } from "./connection-view";
import { MY_VOICE_TEXT as T } from "./my-voice-text";

type Row = Pick<MyVoice, "status" | "savedVoiceId">;

// tone은 브리프 말이다: outline은 테두리 배지, warning은 경고색 글자 배지. busy는 정지 Loader2 아이콘
export type Badge = {
	label: string;
	tone: "secondary" | "outline" | "warning";
	busy: boolean;
};
const BADGE: Record<MyVoiceStatus, Badge> = {
	sending: { label: T.badgeSending, tone: "outline", busy: true },
	processing: { label: T.badgeProcessing, tone: "outline", busy: true },
	ready: { label: T.badgeReady, tone: "secondary", busy: false },
	failed: { label: T.badgeFailed, tone: "warning", busy: false },
	unknown: { label: T.badgeUnknown, tone: "warning", busy: false },
	deleting: { label: T.badgeDeleting, tone: "warning", busy: false },
};
export const badgeOf = (status: MyVoiceStatus): Badge => BADGE[status];

export type PrimaryAction = "listen" | "check" | "retryDelete";
export type MenuAction = "openLibrary" | "saveAgain" | "delete" | "dismiss";

const PRIMARY: Partial<Record<MyVoiceStatus, PrimaryAction>> = {
	ready: "listen",
	processing: "check",
	deleting: "retryDelete",
};
export const primaryActionOf = (item: Row): PrimaryAction | null =>
	PRIMARY[item.status] ?? null;

// 보내는 중·삭제 대기 줄은 메뉴가 없다(지우기 잠금)
export function menuOf(item: Row): MenuAction[] {
	switch (item.status) {
		case "ready":
			return [item.savedVoiceId ? "openLibrary" : "saveAgain", "delete"];
		case "processing":
			return ["delete"];
		case "failed":
		case "unknown":
			return ["dismiss"];
		default:
			return [];
	}
}

// 목록 응답에 공급자 id가 없어 failed는 id 유무를 모른다. failed는 공급자 계정에서도 지울 수 있으므로 확인 창을 거치고,
// id를 모르는 unknown은 앱 줄만 지우므로 확인이 없다(id 없는 failed도 확인을 한 번 거친다)
export const dismissNeedsConfirm = (item: Pick<MyVoice, "status">): boolean =>
	item.status === "failed";

const FALLBACK = T.reasonFallback;
const REASON: Record<string, (provider: string) => string> = {
	no_key: () => T.reasonNoKey,
	quota: () => T.reasonNoPlan,
	no_permission: () => T.reasonNoPlan,
	// 공급자가 401·403으로 클론을 거절한 경우. 같은 키로 생성은 될 수 있어 '연결 안 됨'이 아니라 거절로 안내한다
	provider_auth: () => T.reasonProviderAuth,
	rate_limit: () => T.reasonRateLimit,
	in_progress: () => T.reasonInProgress,
	quality: () => T.reasonQuality,
	provider_input: () => T.reasonProviderInput,
	unknown_outcome: T.reasonUnknown,
	provider_error: () => T.reasonProviderError,
	not_found: () => T.reasonNotFound,
	audio_format: () => T.reasonAudioFormat,
	audio_length: () => T.reasonAudioLength,
	audio_size: () => T.reasonAudioSize,
};
// 사유는 서버가 준 문자열이라 constructor 같은 객체 기본 속성 이름에 속지 않게 Object.hasOwn으로 본다
export function reasonText(
	reason: string | null,
	provider: CloneProvider,
): string {
	return reason !== null && Object.hasOwn(REASON, reason)
		? REASON[reason](PROVIDER_LABEL[provider])
		: FALLBACK;
}

// 줄의 사유 한 줄(브리프 5절 3번). 실패·미확인·삭제 대기만 있다
export function rowNoteOf(
	item: Pick<MyVoice, "status" | "reason" | "provider">,
): string | null {
	switch (item.status) {
		case "deleting":
			return T.reasonDeleting;
		case "unknown":
			return T.reasonUnknown(PROVIDER_LABEL[item.provider]);
		case "failed":
			return reasonText(item.reason, item.provider);
		default:
			return null;
	}
}

// 녹음 중 범위 줄(브리프 3절 보강): 최소까지 남은 초, 넘으면 충분하다는 말. elapsed는 정수 초
export function recordingHintOf(
	min: number,
	elapsed: number,
): { text: string; enough: boolean } {
	return elapsed >= min
		? { text: T.enoughRecorded, enough: true }
		: { text: T.untilMin(min, min - elapsed), enough: false };
}

const WHAT = { source: "원본", consent: "동의 녹음" } as const;
// 원본·동의 녹음이 공급자 범위 밖이면 이유 문구, 안이면 null. 길이 판정은 계약의 cloneLengthProblem 그대로
export function lengthProblemText<P extends CloneProvider>(
	provider: P,
	kind: keyof (typeof CLONE_LIMITS)[P] & keyof typeof WHAT,
	seconds: number,
): string | null {
	const problem = cloneLengthProblem(provider, kind, seconds);
	if (problem === null) return null;
	const { min, max } = CLONE_LIMITS[provider][kind] as {
		min: number;
		max: number;
	};
	const say = problem === "short" ? T.tooShort : T.tooLong;
	// 9.99초가 "10초"로 읽히면 범위 안처럼 보이므로 짧으면 내림, 길면 올림
	const shown = problem === "short" ? Math.floor(seconds) : Math.ceil(seconds);
	return say(WHAT[kind], shown, min, max);
}
