// apps/web/src/lib/drama-read.ts
import type { DraftLine, ReadLine } from "@tts-pilot-app/api/drama-request";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import type {
	TrialFound,
	TrialModelRate,
} from "@tts-pilot-app/api/providers/trial-contract";
import {
	codePoints,
	comboSignature,
	estimate,
	sentText,
	type TrialRequest,
	type Usage,
} from "@tts-pilot-app/api/providers/trial-options";

import type { Current } from "./sample-state";
import { needsConfirm, type TrialProblem } from "./trial-view";

// 줄 요청과 막는 이유는 CLI와 함께 쓰는 공용 모듈에 있다(T20)
export {
	lineRequest,
	type ReadLine,
	type ReadProblem,
	readRequests,
} from "@tts-pilot-app/api/drama-request";

// 드라마 작업실 '읽기'(스펙 14절)·'받기'(16절)의 순수 함수 가운데 화면에만 있는 것: 확인 창 셈, 읽기 상태, 끼어듦 판정, 잇는 차례(15절).
// 비동기 흐름(찾기·받기·만들기·재생)은 components/drama-read.tsx가 이 함수들로 한다

// 유료 확인이 필요한 줄이 있는가(막대 '읽기' Coins 표시 판정. 이어 듣기 단추는 allPrepared)
export function readPaid(
	lines: readonly ReadLine[],
	now = Date.now(),
): boolean {
	return lines.some((line) => needsConfirm(line.request, now));
}

// 모든 줄의 소리를 이미 받았는가(같은 서명은 하나로 충분하다)
export function allPrepared(
	lines: readonly ReadLine[],
	prepared: ReadonlySet<string>,
): boolean {
	return (
		lines.length > 0 &&
		lines.every((line) => prepared.has(comboSignature(line.request)))
	);
}

export type ReadSummary = {
	reuse: number;
	make: number;
	// rateMissing: ElevenLabs 배율을 받지 못해 배율 1로 셌다(확인 창이 T5처럼 '배율을 확인하지 못했어요'를 붙인다)
	paid: {
		provider: ProviderId;
		lines: number;
		chars: number;
		usage: Usage;
		rateMissing: boolean;
	}[];
	confirm: boolean;
};

// 확인 창 셈(스펙 14.2 '확인'). 같은 서명(comboSignature)은 한 번만 센다(같은 대사 두 줄은 한 번 만든다).
// 찾은 줄과 ready(이미 받았거나 만드는 중인 서명)는 저장된 소리다. 새로 만들 서명 중 유료이거나 미확인으로 끝났던 것이 있으면 확인한다
export function readSummary(
	requests: readonly TrialRequest[],
	found: readonly (TrialFound | null)[],
	rates: readonly TrialModelRate[],
	unknown: ReadonlySet<string>,
	ready: ReadonlySet<string>,
	now = Date.now(),
): ReadSummary {
	const summary: ReadSummary = { reuse: 0, make: 0, paid: [], confirm: false };
	const seen = new Set<string>();
	for (const [i, request] of requests.entries()) {
		const signature = comboSignature(request);
		if (seen.has(signature)) {
			summary.reuse += 1; // 같은 대사는 앞 줄의 소리를 쓴다
			continue;
		}
		seen.add(signature);
		if (found[i] || ready.has(signature)) {
			summary.reuse += 1;
			continue;
		}
		summary.make += 1;
		if (unknown.has(signature)) summary.confirm = true;
		if (!needsConfirm(request, now)) continue;
		summary.confirm = true;
		const multiplier =
			request.provider === "elevenlabs"
				? (rates.find((rate) => rate.model === request.settings.model)
						?.multiplier ?? null)
				: null;
		const usage = estimate(request, multiplier, now);
		const chars = codePoints(sentText(request));
		const rateMissing =
			request.provider === "elevenlabs" && multiplier === null;
		const row = summary.paid.find((item) => item.provider === request.provider);
		if (!row)
			summary.paid.push({
				provider: request.provider,
				lines: 1,
				chars,
				usage,
				rateMissing,
			});
		else {
			row.lines += 1;
			row.chars += chars;
			row.usage = { ...row.usage, amount: row.usage.amount + usage.amount };
			row.rateMissing ||= rateMissing;
		}
	}
	return summary;
}

// 읽기 상태. 읽는 줄·만드는 줄·실패 줄은 줄 번호가 아니라 줄 id로 가리킨다(읽는 중 줄을 옮겨도 강조가 따라가지 않게).
// mode는 '읽기'(줄마다 튼다)와 '받기'(재생 없이 준비만, 스펙 16절)다. 받기의 reading은 줄을 준비하는 단계이고 atId는 준비하는 줄이다.
// done은 끝까지 들은(받기는 준비한) 줄 수, total은 이번 읽기의 줄 수다
export type ReadMode = "read" | "save";
// 받기를 마친 뒤 할 일: 한 파일(WAV), 줄마다(zip), 이어 듣기
export type SaveKind = "wav" | "zip" | "play";
export type ReadState = {
	run: number;
	phase: "idle" | "finding" | "confirm" | "reading";
	mode: ReadMode;
	atId: string | null;
	makingId: string | null;
	failed: { lineId: string; problem: TrialProblem } | null;
	total: number;
	done: number;
};
export const READ_IDLE: ReadState = {
	run: 0,
	phase: "idle",
	mode: "read",
	atId: null,
	makingId: null,
	failed: null,
	total: 0,
	done: 0,
};
export type ReadEvent =
	| { type: "start"; mode: ReadMode }
	| { type: "stop" }
	| {
			type: "found";
			run: number;
			atId: string;
			total: number;
			confirm: boolean;
	  }
	| { type: "confirm"; run: number }
	| { type: "cancel"; run: number }
	| { type: "making"; run: number; lineId: string | null }
	| { type: "playing"; run: number; lineId: string }
	| { type: "ended"; run: number; lineId: string; next: string | null }
	| { type: "fail"; run: number; lineId: string; problem: TrialProblem };

// 무시한 이벤트는 같은 객체를 돌려준다(부른 쪽이 바뀌었는지로 한 번만 처리한다). start·stop 밖의 이벤트는 run이 지금과 다르면
// 무시한다: 멈춘 뒤 앞 읽기의 늦은 결과가 새 읽기를 건드리지 않게(재리뷰 N2). 모드는 start만 정한다
export function readReducer(state: ReadState, event: ReadEvent): ReadState {
	if (event.type === "start")
		return state.phase === "idle"
			? { ...READ_IDLE, run: state.run + 1, phase: "finding", mode: event.mode }
			: state;
	if (event.type === "stop")
		return {
			...state,
			run: state.run + 1,
			phase: "idle",
			atId: null,
			makingId: null,
		};
	if (event.run !== state.run) return state;
	switch (event.type) {
		case "found":
			return state.phase === "finding"
				? {
						...state,
						phase: event.confirm ? "confirm" : "reading",
						atId: event.atId,
						total: event.total,
					}
				: state;
		// 확인은 확인 창 단계에서 한 번만 받는다(빠르게 두 번 눌러도 줄마다 생성 1회)
		case "confirm":
			return state.phase === "confirm" ? { ...state, phase: "reading" } : state;
		case "cancel":
			return state.phase === "confirm"
				? { ...state, phase: "idle", atId: null }
				: state;
		case "making":
			return state.phase === "reading" && state.makingId !== event.lineId
				? { ...state, makingId: event.lineId }
				: state;
		// 그 줄을 틀면 만드는 중 표시를 내린다. 앞 읽기가 보낸 만들기를 기다린 줄은 그 만들기의 끝 표시(앞 run)가 무시되기 때문이다
		case "playing":
			return state.phase === "reading"
				? {
						...state,
						atId: event.lineId,
						makingId: state.makingId === event.lineId ? null : state.makingId,
					}
				: state;
		// 받기는 playing을 보내지 않으므로 그 줄의 '만드는 중'은 여기서 내린다(읽기는 playing이 이미 내렸다, 계획 리뷰 P4-2)
		case "ended":
			if (state.phase !== "reading" || event.lineId !== state.atId)
				return state;
			return event.next
				? {
						...state,
						atId: event.next,
						makingId: state.makingId === event.lineId ? null : state.makingId,
						done: state.done + 1,
					}
				: {
						...state,
						phase: "idle",
						atId: null,
						makingId: null,
						done: state.done + 1,
					};
		case "fail":
			return state.phase === "finding" || state.phase === "reading"
				? {
						...state,
						phase: "idle",
						atId: null,
						makingId: null,
						failed: { lineId: event.lineId, problem: event.problem },
					}
				: state;
	}
}

// 읽는 줄의 재생 키. 페이지 플레이어 하나를 함께 쓰므로 샘플 주소·장면 조각 키와 겹치지 않게 앞에 붙인다
const READ_KEY = "drama-read:";
export const readKey = (lineId: string) => `${READ_KEY}${lineId}`;
export const isReadKey = (key: string) => key.startsWith(READ_KEY);

// 읽는 중 플레이어가 바뀌었다. null(줄 사이·만드는 중)과 읽기 키(다음 줄을 막 튼 순간)는 끼어듦이 아니다.
// 읽는 줄 키가 실패면 그 줄 실패, 다른 소리면 멈춤. before(바뀌기 전 값)가 끝나지 않은 읽는 줄이었는데 null이 됐으면
// 다른 곳의 player.stop()(무대 재생·성우 창 닫기)이 끊은 것이라 멈춤이다. 끝난 줄은 같은 일괄 처리에서 atId가 다음 줄로 간다.
// 받기는 재생하지 않으므로 받는 중에 샘플·무대를 틀어도 끼어듦이 아니다(스펙 16절)
export function interrupted(
	current: Current,
	state: ReadState,
	before: Current = null,
): "none" | "stop" | "fail" {
	if (state.mode !== "read" || state.phase !== "reading" || state.atId === null)
		return "none";
	const at = readKey(state.atId);
	if (current === null)
		return before?.voiceId === at && before.status !== "failed"
			? "stop"
			: "none";
	if (current.voiceId === at && current.status === "failed") return "fail";
	return isReadKey(current.voiceId) ? "none" : "stop";
}

// 받은 줄을 이을 차례와 줄 뒤 쉼(스펙 15·16절). 받은 순서(대본 순서) 그대로이고 같은 소리를 쓰는 두 줄은 두 번 넣는다.
// 쉼은 그 줄의 gap, 없거나 받은 뒤 지운 줄이면 기본 쉼이다
export function joinPlan(
	heard: readonly { lineId: string; blob: Blob }[],
	lines: readonly Pick<DraftLine, "id" | "gap">[],
	defaultGap: number,
): { blob: Blob; gap: number }[] {
	const gaps = new Map(lines.map((line) => [line.id, line.gap]));
	return heard.map(({ lineId, blob }) => ({
		blob,
		gap: gaps.get(lineId) ?? defaultGap,
	}));
}

// 이어 듣기의 재생 키. 읽기 키(drama-read:)가 아니라 읽는 중에 틀리면 다른 소리(멈춤)이고 읽지 않을 때·받는 중에는 끼어듦이 아니다
export const JOIN_KEY = "drama-join";
// 이어 듣는 중(불러오기·재생). 재생에 실패했으면 아니다: player.stop()이 실패한 소리를 건드리지 않으므로 다시 누르면 다시 잇는다
export const joinPlaying = (current: Current) =>
	current?.voiceId === JOIN_KEY && current.status !== "failed";

// 받은 소리의 파일 확장자(스펙 14.2: 공급자 형식 그대로). Gemini는 WAV, 그 밖은 MP3
export const soundExt = (type: string) =>
	type === "audio/wav" ? "wav" : "mp3";
