// apps/web/src/lib/make-all.ts
import {
	type Found,
	type FoundMap,
	lookupsOf,
	type MakeItem,
	type MakePlan,
	makePlan,
	type ParagraphStatus,
	signatureOf,
} from "@tts-pilot-app/api/make-plan";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import { GEMINI_CHARS_PER_SECOND } from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";

import {
	blankFor,
	type Paragraph,
	spokenOf,
	voiceOf,
	type Work,
} from "./paragraph-script";
import { createFailureOf, type ListLoad, scriptCount } from "./studio-view";
import { type TrialProblem, trialFailureOf } from "./trial-view";

// 문단 상태·찾기 대상·만들기 계획·받기 목록은 CLI와 함께 쓰는 공용 모듈에 있다(T20)
export {
	CHUNK_MAX_BYTES,
	chunkTargets,
	type Found,
	type FoundMap,
	findTargets,
	type MakeItem,
	type MakePlan,
	madeOf,
	makePlan,
	mergeFound,
	type ParagraphStatus,
	paragraphStatus,
	receivePlan,
	usageByProvider,
} from "@tts-pilot-app/api/make-plan";

// 문단 작업실 '전체 만들기'(T10 스펙 5.1)의 순수 함수 가운데 화면에만 있는 것: 요청 id 규칙, 상태 리듀서, 보내기 루프, 요약.
// 화면은 새 규칙을 두지 않고 이 파일의 함수만 부른다(유료 호출 순서는 여기서만 정한다)

// 이번 화면의 서명별 진행·실패
export type LiveMap = ReadonlyMap<
	string,
	{ state: "making" } | { state: "failed"; problem: TrialProblem }
>;

// 지금 문단에 없는 서명의 null 항목을 버린다(되돌리기에는 완료 항목만 필요, 15). 버릴 것이 없으면 같은 표
export function pruneFound(
	found: FoundMap,
	ps: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[] | null,
	now: number,
): FoundMap {
	if (!voices) return found;
	const current = new Set(
		ps.flatMap((p) =>
			lookupsOf(p, work, voices, now).map(({ signature }) => signature),
		),
	);
	const next = new Map(
		[...found].filter(([sig, value]) => value !== null || current.has(sig)),
	);
	return next.size === found.size ? found : next;
}

// 받을 수 없는 결과(만료·다른 곳에서 지움, NOT_FOUND)의 항목을 지운다. 다시 찾으면 null이 들어간다(mergeFound는 완료 키를 null로 내리지 않는다, E22).
// 그 결과가 없으면 같은 표
export function forgetFound(found: FoundMap, resultId: string): FoundMap {
	const next = new Map(
		[...found].filter(([, value]) => value?.id !== resultId),
	);
	return next.size === found.size ? found : next;
}

// 확인 중: 성우 목록을 받는 중이거나 복원 뒤 첫 찾기 전(입력 뒤 배경 찾기는 잠그지 않는다, '스펙과 다른 점' 27)
export const checkingOf = (
	voicesLoad: ListLoad,
	findState: "first" | "ok" | "failed",
): boolean => voicesLoad === "loading" || findState === "first";

// 막대 주 버튼이 '· 무료' 꼬리를 보이는지(MG-03·MG-13). free는 makePlan의 free, ready는 복원했고 확인 중이 아님.
// 만드는 중·멈추는 중('멈추기')과 확인 중(꼬리 없는 '전체 만들기')에는 없다. 카드는 이 값이 참일 때만 '무료' 배지를 뺀다
export const freeTailOf = (
	free: boolean,
	phase: MakeState["phase"],
	ready: boolean,
): boolean => free && ready && phase !== "making" && phase !== "stopping";

// 카드 '만들기' 옆 사용량 표식(MG-03): 유료면 Coins, 무료면 '무료' 배지. 막대가 '· 무료' 꼬리를 보이면(freeTailOf) 막대만 말하고 카드는 표식이 없다
export const makeMarkOf = (
	free: boolean,
	allFree: boolean,
): "free" | "paid" | null => (!free ? "paid" : allFree ? null : "free");

// 요청 id 규칙('스펙과 다른 점' 14 표). 서버는 같은 id에 그 행의 상태를 그대로 돌려준다(replayStatus)
export function requestIdFor(
	ids: ReadonlyMap<string, string>,
	signature: string,
	makeId: () => string,
): { id: string; ids: ReadonlyMap<string, string> } {
	const id = ids.get(signature);
	if (id) return { id, ids };
	const fresh = makeId();
	return { id: fresh, ids: new Map(ids).set(signature, fresh) };
}
const without = (
	ids: ReadonlyMap<string, string>,
	signatures: readonly string[],
) => new Map([...ids].filter(([sig]) => !signatures.includes(sig)));
// 진행 중·미확인은 같은 id(다시 보내면 서버가 완료면 결과를, 진행 중이면 in_progress를 돌려준다). 그 밖은 실패 행이 같은 실패를 되풀이하므로 새 id.
// `sent: true` 실패만 이 함수로 보낸다(보내기 전 찾기 실패로 미확인 뒤 남겨 둔 id를 지우면 서버의 옛 행 재생이 끊긴다)
export const afterFailure = (
	ids: ReadonlyMap<string, string>,
	signature: string,
	reason: TrialProblem["reason"],
): ReadonlyMap<string, string> =>
	reason === "in_progress" || reason === "unknown_outcome"
		? ids
		: without(ids, [signature]);
// 미확인 서명은 중복 과금 경고를 확인한 뒤에만 새 id(행도 미확인이면 같은 id는 늘 unknown_outcome이다, 22)
export const afterUnknownConfirmed = (
	ids: ReadonlyMap<string, string>,
	signatures: readonly string[],
): ReadonlyMap<string, string> => without(ids, signatures);

// 전체 만들기 상태. at은 큐에서 지금 문단, since는 지금 문단을 보낸 시각(보내기 전 null).
// stopped.problem이 null이면 사용자가 멈췄다. left는 만드는 동안 고쳐 확인 범위 밖이라 남긴 문단 id다.
// made는 이번 실행에서 결과가 생긴 문단 수다(done과 저장된 결과를 찾은 skip, 끝 알림, F30-1)
export type MakeState = {
	phase: "idle" | "finding" | "confirm" | "making" | "stopping" | "stopped";
	run: number;
	queue: MakeItem[];
	at: number;
	since: number | null;
	stopped: {
		id: string;
		n: number;
		provider: ProviderId;
		problem: TrialProblem | null;
	} | null;
	left: string[];
	made: number;
	notice: "nothing" | "find_failed" | null;
};
export const MAKE_IDLE: MakeState = {
	phase: "idle",
	run: 0,
	queue: [],
	at: 0,
	since: null,
	stopped: null,
	left: [],
	made: 0,
	notice: null,
};
// 모든 이벤트에 run이 있다. start의 run은 누를 때 본 run이고 리듀서가 하나 올린다(그 뒤 이벤트는 올린 run을 쓴다)
export type MakeEvent =
	| { type: "start"; run: number }
	| {
			type: "planned";
			run: number;
			queue: MakeItem[];
			blocked: boolean;
			unknown: number;
			unreviewed: number;
			free: boolean;
	  }
	| { type: "confirm"; run: number }
	| { type: "cancel"; run: number }
	| { type: "sent"; run: number; since: number }
	| { type: "done"; run: number; item: MakeItem; found: Found }
	// found: 보내기 직전 찾기가 완료를 돌려줌. null이면 문단이 없거나 비었다
	| { type: "skip"; run: number; item: MakeItem; found: Found | null }
	| { type: "changed"; run: number; item: MakeItem }
	// sent: 보낸 뒤의 실패(false면 보내기 전 찾기 실패라 요청 id를 건드리지 않는다)
	| {
			type: "fail";
			run: number;
			item: MakeItem;
			problem: TrialProblem;
			sent: boolean;
	  }
	| { type: "findFailed"; run: number }
	| { type: "stop"; run: number }
	| { type: "halted"; run: number };

const stoppedOf = (
	item: MakeItem | undefined,
	problem: TrialProblem | null,
): MakeState["stopped"] =>
	item
		? { id: item.id, n: item.n, provider: item.request.provider, problem }
		: null;
// 지금 문단을 끝내고 다음으로. 큐 끝이면 idle(멈추는 중이어도 남은 것이 없다)
function next(state: MakeState, left = state.left): MakeState {
	const at = state.at + 1;
	return {
		...state,
		at,
		since: null,
		left,
		phase: at >= state.queue.length ? "idle" : state.phase,
	};
}

// 무시한 이벤트는 같은 객체를 돌려준다(부른 쪽이 바뀌었는지로 한 번만 처리한다, drama-read readReducer와 같다).
// 실패는 사유와 상관없이 멈춘다(자동 재시도 없음). 두 번 누른 start·confirm은 한 번이다(스펙 9절 5번)
export function makeReducer(state: MakeState, event: MakeEvent): MakeState {
	if (event.run !== state.run) return state;
	const running = state.phase === "making" || state.phase === "stopping";
	switch (event.type) {
		case "start":
			return state.phase === "idle" || state.phase === "stopped"
				? {
						...state,
						phase: "finding",
						run: state.run + 1,
						since: null,
						stopped: null,
						left: [],
						made: 0,
						notice: null,
					}
				: state;
		case "planned": {
			if (state.phase !== "finding") return state;
			const planned = { ...state, queue: event.queue, at: 0, since: null };
			if (event.blocked) return { ...planned, phase: "idle" };
			if (event.queue.length === 0)
				return { ...planned, phase: "idle", notice: "nothing" };
			return {
				...planned,
				phase:
					!event.free || event.unknown > 0 || event.unreviewed > 0
						? "confirm"
						: "making",
			};
		}
		case "confirm":
			return state.phase === "confirm" ? { ...state, phase: "making" } : state;
		case "cancel":
			return state.phase === "confirm" ? { ...state, phase: "idle" } : state;
		case "findFailed":
			return state.phase === "finding"
				? { ...state, phase: "idle", notice: "find_failed" }
				: state;
		case "sent":
			return running ? { ...state, since: event.since } : state;
		// 지웠거나 빈 문단의 skip(found null)은 결과가 없어 세지 않는다
		case "done":
		case "skip":
			return running
				? {
						...next(state),
						made: state.made + (event.found ? 1 : 0),
					}
				: state;
		case "changed":
			return running ? next(state, [...state.left, event.item.id]) : state;
		case "fail":
			return running
				? {
						...state,
						phase: "stopped",
						since: null,
						stopped: stoppedOf(event.item, event.problem),
					}
				: state;
		case "stop":
			return state.phase === "making" ? { ...state, phase: "stopping" } : state;
		// making도 받는다: 멈춤 ref를 읽은 루프가 stop 이벤트보다 먼저 끝나도 상태가 making에 남지 않게
		case "halted":
			return running
				? {
						...state,
						phase: "stopped",
						since: null,
						stopped: stoppedOf(state.queue[state.at], null),
					}
				: state;
	}
}

// 확인한 큐를 차례로 보낸다('스펙과 다른 점' 12·13, Review Focus 1·2). 문단마다 보내기 직전에 다시 본다:
// shouldContinue → 지금 문단(없거나 비면 skip, 서명이 다르면 보내지 않고 changed) → 저장된 결과 찾기(완료면 skip) →
// 찾는 사이 떠남·멈춤·편집을 다시 보고 → 보낸다. 실패는 그 자리에서 끝난다. "gone"(언마운트·다른 실행)은 이벤트 없이 끝난다(E4).
// 멈춤·실행 번호·마운트 여부는 컴포넌트 ref에 있다(await 뒤에는 렌더된 상태를 읽지 못한다, rerender-use-ref-transient-values)
export async function runMakeAll(
	queue: readonly MakeItem[],
	run: number,
	deps: {
		current(id: string): { signature: string } | "gone" | "empty";
		find(request: StudioRequest): Promise<Found | null>;
		send(item: MakeItem, requestId: string): Promise<Found>;
		idFor(signature: string): string;
		shouldContinue(): "go" | "stop" | "gone";
		on(event: MakeEvent): void;
	},
): Promise<void> {
	// 보내도 되면 null, 아니면 끝(true)·다음 문단(false)
	const recheck = (item: MakeItem): boolean | null => {
		const go = deps.shouldContinue();
		if (go === "gone") return true;
		if (go === "stop") {
			deps.on({ type: "halted", run });
			return true;
		}
		const now = deps.current(item.id);
		if (now === "gone" || now === "empty") {
			deps.on({ type: "skip", run, item, found: null });
			return false;
		}
		if (now.signature !== item.signature) {
			deps.on({ type: "changed", run, item });
			return false;
		}
		return null;
	};
	for (const item of queue) {
		const before = recheck(item);
		if (before) return;
		if (before === false) continue;
		let hit: Found | null;
		try {
			hit = await deps.find(item.request);
		} catch (error) {
			deps.on({
				type: "fail",
				run,
				item,
				problem: trialFailureOf(error),
				sent: false,
			});
			return;
		}
		if (hit?.status === "done") {
			deps.on({ type: "skip", run, item, found: hit });
			continue;
		}
		const after = recheck(item);
		if (after) return;
		if (after === false) continue;
		deps.on({ type: "sent", run, since: Date.now() });
		try {
			const found = await deps.send(item, deps.idFor(item.signature));
			deps.on({ type: "done", run, item, found });
		} catch (error) {
			deps.on({
				type: "fail",
				run,
				item,
				problem: createFailureOf(error),
				sent: true,
			});
			return;
		}
	}
}

// 작업 요약(브리프 5.6). 글자는 NFC·앞뒤 공백 정리 뒤 코드 포인트, 예상 초는 1초 5자 올림(추정)
export function summaryOf(
	ps: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	now: number,
): {
	paragraphs: number;
	empty: number;
	chars: number;
	made: number;
	total: number;
	seconds: number;
} {
	const filled = ps.filter((p) => !blankFor(p, work));
	const chars = filled.reduce((sum, p) => sum + scriptCount(spokenOf(p)), 0);
	const made = filled.filter((p) => {
		const sig = signatureOf(p, work, voices, now, found)?.signature;
		return sig !== undefined && found.get(sig)?.status === "done";
	}).length;
	return {
		paragraphs: filled.length,
		empty: ps.length - filled.length,
		chars,
		made,
		total: filled.length,
		seconds: Math.ceil(chars / GEMINI_CHARS_PER_SECOND),
	};
}

// 요약 링크 하나(브리프 5.6 우선순위): 멈춘 문단 → 막힌 문단 → 안 만든 문단(실패·미확인 포함).
// 멈춘 문단은 지금 번호로 가리키고, 지웠으면 다음 순위다
export function firstLink(
	state: MakeState,
	plan: Pick<MakePlan, "firstBlocked">,
	statuses: readonly { id: string; n: number; status: ParagraphStatus }[],
): { kind: "stopped" | "blocked" | "unmade"; id: string; n: number } | null {
	const stopped =
		state.phase === "stopped" &&
		statuses.find((s) => s.id === state.stopped?.id);
	if (stopped) return { kind: "stopped", id: stopped.id, n: stopped.n };
	if (plan.firstBlocked)
		return {
			kind: "blocked",
			id: plan.firstBlocked.id,
			n: plan.firstBlocked.n,
		};
	const unmade = statuses.find(
		(s) =>
			s.status === "unmade" || s.status === "failed" || s.status === "unknown",
	);
	return unmade ? { kind: "unmade", id: unmade.id, n: unmade.n } : null;
}

// 요약 레일·시트가 같이 쓰는 계획과 링크 하나. 성우 목록이 없으면 계획이 없고(plan null) 막힌 문단도 없다
export function summaryLinkOf(
	ps: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	now: number,
	make: MakeState,
	statusOf: (p: Paragraph) => ParagraphStatus,
): { plan: MakePlan | null; link: ReturnType<typeof firstLink> } {
	const plan = voices ? makePlan(ps, work, voices, found, now) : null;
	const link = firstLink(
		make,
		plan ?? { firstBlocked: null },
		ps.map((p, i) => ({ id: p.id, n: i + 1, status: statusOf(p) })),
	);
	return { plan, link };
}

// 요약 칩의 '확인할 문단' 표식: 요약 링크가 멈춘 문단이나 막힌 문단을 가리킬 때만이다(안 만든 문단뿐이면 평상시라 없다)
export function needsCheck(link: ReturnType<typeof firstLink>): boolean {
	return link?.kind === "stopped" || link?.kind === "blocked";
}

// 채운 청록 버튼 하나(브리프 4절 우선순위, DN-5)
export function fillOf(
	ps: readonly Paragraph[],
	work: Work,
	barReady: boolean,
): "paste" | "default_voice" | "bar" | null {
	const filled = ps.filter((p) => !blankFor(p, work));
	if (filled.length === 0) return "paste";
	if (!work.defaultVoice && filled.some((p) => !voiceOf(p, work)))
		return "default_voice";
	return barReady ? "bar" : null;
}

// 잇기 키: 이어 붙인 문단 id·결과 id·쉼 줄. 마지막 잇기 캐시(provider joinOf)와 이어 듣기 낡음 판정(막대)이 같은 함수를 쓴다
export const joinKeyOf = (
	items: readonly { id: string; found: { id: string }; gap: number }[],
) => items.map((item) => `${item.id}:${item.found.id}:${item.gap}`).join(",");
