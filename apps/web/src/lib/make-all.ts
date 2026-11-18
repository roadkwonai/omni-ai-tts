// apps/web/src/lib/make-all.ts
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	estimate,
	GEMINI_CHARS_PER_SECOND,
	type Usage,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type {
	StudioFound,
	StudioRequest,
} from "@tts-pilot-app/api/studio-contract";

import {
	blankFor,
	blockOf,
	type Paragraph,
	type ParagraphBlock,
	paragraphRequest,
	reviewOf,
	spokenOf,
	tooLongOf,
	voiceOf,
	type Work,
} from "./paragraph-script";
import { createFailureOf, savedOf, scriptCount } from "./studio-view";
import { needsConfirm, type TrialProblem, trialFailureOf } from "./trial-view";

// 문단 작업실 '전체 만들기'(T10 스펙 5.1)의 순수 함수: 문단 상태, 찾기 대상, 만들기 계획, 요청 id 규칙, 상태 리듀서, 보내기 루프, 요약, 받기 목록.
// 화면은 새 규칙을 두지 않고 이 함수만 부른다(유료 호출 순서는 여기서만 정한다)

export type Found = StudioFound;
// 키는 comboSignature(요청). 키 없음 = 아직 찾지 않음, null = 찾았는데 없음('스펙과 다른 점' 7·27)
export type FoundMap = ReadonlyMap<string, Found | null>;
// 이번 화면의 서명별 진행·실패
export type LiveMap = ReadonlyMap<
	string,
	{ state: "making" } | { state: "failed"; problem: TrialProblem }
>;
export type ParagraphStatus =
	| "empty"
	| "checking"
	| "blocked"
	| "unmade"
	| "making"
	| "made"
	| "unknown"
	| "failed";
export type MakeItem = {
	id: string;
	n: number;
	request: StudioRequest;
	signature: string;
};

const signatureOf = (
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	now: number,
) => {
	const request = paragraphRequest(p, work, voices, now);
	return request && { request, signature: comboSignature(request) };
};
// 찾을 수 있는 문단(15): 요청이 있고 계약 상한 안이며, all이 아니면 표에 아직 키가 없다. 길이는 blockOf가 아니라 tooLongOf로 본다
// (blockOf는 이용 불가를 길이보다 먼저 돌려준다, 상한을 넘는 요청 하나로 studioFindMany 배치 전체가 거절된다). 이용 불가 성우는 빼지 않는다(16)
function findable(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	all: boolean,
	now: number,
) {
	const target = signatureOf(p, work, voices, now);
	return target &&
		!tooLongOf(spokenOf(p), target.request.provider) &&
		(all || !found.has(target.signature))
		? target
		: null;
}

// 저장된 결과(완료)가 있으면 막는 이유를 보지 않는다('스펙과 다른 점' 16). 이용 불가 성우는 찾기 대상이라 찾기 전에는 확인 중이다(27).
// 이번 화면의 응답 없는 실패(unknown_outcome)는 서버 미확인과 같은 '처리 여부 미확인'이다
export function paragraphStatus(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	live: LiveMap,
	now: number,
): ParagraphStatus {
	if (blankFor(p, work)) return "empty";
	if (!voices) return "checking";
	const target = signatureOf(p, work, voices, now);
	const hit = target ? found.get(target.signature) : undefined;
	if (hit?.status === "done") return "made";
	const mine = target ? live.get(target.signature) : undefined;
	if (mine?.state === "making") return "making";
	// 찾기 대상인데 아직 찾지 않았다
	const pending = findable(p, work, voices, found, false, now) !== null;
	const block = blockOf(p, work, voices);
	if (block === "unavailable" && pending) return "checking";
	if (block) return "blocked";
	if (mine?.state === "failed")
		return mine.problem.reason === "unknown_outcome" ? "unknown" : "failed";
	if (pending) return "checking";
	return hit?.status === "unknown" ? "unknown" : "unmade";
}

// 찾을 요청(findable). 같은 서명은 하나로
export function findTargets(
	ps: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	all: boolean,
	now: number,
): StudioRequest[] {
	const seen = new Set<string>();
	const targets: StudioRequest[] = [];
	for (const p of ps) {
		const hit = findable(p, work, voices, found, all, now);
		if (!hit || seen.has(hit.signature)) continue;
		seen.add(hit.signature);
		targets.push(hit.request);
	}
	return targets;
}

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
		ps.map((p) => signatureOf(p, work, voices, now)?.signature),
	);
	const next = new Map(
		[...found].filter(([sig, value]) => value !== null || current.has(sig)),
	);
	return next.size === found.size ? found : next;
}

// 찾기 응답을 표에 합친다. 이미 완료인 키는 늦게 온 null·미확인으로 내리지 않는다(E22)
export function mergeFound(
	found: FoundMap,
	requests: readonly StudioRequest[],
	results: readonly (Found | null)[],
): FoundMap {
	const next = new Map(found);
	for (const [i, request] of requests.entries()) {
		const sig = comboSignature(request);
		const value = results[i] ?? null;
		if (next.get(sig)?.status === "done" && value?.status !== "done") continue;
		next.set(sig, value);
	}
	return next;
}

// 받을 수 없는 결과(만료·다른 곳에서 지움, NOT_FOUND)의 항목을 지운다. 다시 찾으면 null이 들어간다(mergeFound는 완료 키를 null로 내리지 않는다, E22).
// 그 결과가 없으면 같은 표
export function forgetFound(found: FoundMap, resultId: string): FoundMap {
	const next = new Map(
		[...found].filter(([, value]) => value?.id !== resultId),
	);
	return next.size === found.size ? found : next;
}

export type MakePlan = {
	make: MakeItem[];
	// 막힌 문단을 뺀 새로 만들 문단(예상 사용량, 브리프 5.6). 막히지 않았으면 make와 같은 목록
	estimate: MakeItem[];
	reused: number;
	firstBlocked: { id: string; n: number; block: ParagraphBlock } | null;
	// 막힌 문단 수(빈 문단은 막힘이 아니다)
	blockedCount: number;
	unknown: string[];
	// 만들 문단(make)에 든 검수 안 한 숫자 수(T11). 0보다 크면 확인 창을 거친다
	unreviewed: number;
	free: boolean;
};
// 만들기 계획(스펙 5.1 '전체 만들기'). 시작 전 찾기로 모든 대상의 키가 표에 있을 때 부른다. n은 카드 번호(빈 문단 포함).
// 막힌 문단이 하나라도 있으면 아무것도 만들지 않는다(스펙 2절 '막는 문단'). 예상 사용량은 막힌 문단만 뺀 estimate로 센다(브리프 5.6). 같은 서명은 한 번만 만든다(E12, drama-read readSummary와 같다).
// unknown은 미확인 서명이다(확인 창 경고, afterUnknownConfirmed). 성우 목록이 있어야 계획할 수 있다(막대 주 버튼이 그 전까지 잠김, 27)
export function makePlan(
	ps: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[],
	found: FoundMap,
	now: number,
): MakePlan {
	const plan: MakePlan = {
		make: [],
		estimate: [],
		reused: 0,
		firstBlocked: null,
		blockedCount: 0,
		unknown: [],
		unreviewed: 0,
		free: false,
	};
	const seen = new Set<string>();
	for (const [i, p] of ps.entries()) {
		if (blankFor(p, work)) continue;
		const hit = signatureOf(p, work, voices, now);
		const result = hit && found.get(hit.signature);
		if (result?.status === "done") {
			plan.reused += 1;
			continue;
		}
		const block = blockOf(p, work, voices);
		if (block) {
			plan.firstBlocked ??= { id: p.id, n: i + 1, block };
			plan.blockedCount += 1;
			continue;
		}
		if (!hit) continue;
		if (seen.has(hit.signature)) {
			plan.reused += 1;
			continue;
		}
		seen.add(hit.signature);
		if (result?.status === "unknown") plan.unknown.push(hit.signature);
		plan.make.push({ id: p.id, n: i + 1, ...hit });
		plan.unreviewed += reviewOf(p).unreviewed;
	}
	plan.estimate = plan.make;
	if (plan.firstBlocked)
		return { ...plan, make: [], unknown: [], unreviewed: 0 };
	plan.free =
		plan.make.length > 0 &&
		plan.make.every((item) => !needsConfirm(item.request, now));
	return plan;
}

// 새로 만들 문단의 공급자별 예상 사용량(estimate 합계, 첫 등장 순). 배율을 모르는 ElevenLabs 요청은 1로 세고 rateMissing(E20).
// Fish 무료와 유료가 섞이면 바이트 줄이다(무료는 0바이트)
export function usageByProvider(
	make: readonly MakeItem[],
	rates: (request: StudioRequest) => number | null,
	now: number,
): {
	provider: ProviderId;
	count: number;
	usage: Usage;
	rateMissing: boolean;
}[] {
	const rows: ReturnType<typeof usageByProvider> = [];
	for (const { request } of make) {
		const rate = rates(request);
		const usage = estimate(request, rate, now);
		const rateMissing = request.provider === "elevenlabs" && rate === null;
		const row = rows.find((item) => item.provider === request.provider);
		if (!row) {
			rows.push({ provider: request.provider, count: 1, usage, rateMissing });
			continue;
		}
		row.count += 1;
		row.usage = {
			unit: row.usage.unit === "free" ? usage.unit : row.usage.unit,
			amount: row.usage.amount + usage.amount,
		};
		row.rateMissing ||= rateMissing;
	}
	return rows;
}

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
		const sig = signatureOf(p, work, voices, now)?.signature;
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

// 문단 하나의 저장된 결과(완료)와 성우 이름. 없거나 미확인·빈 문단이면 null. 보관함에서 빠진 성우 이름은 성우 id(카드 듣기와 받기가 함께 쓴다)
export function madeOf(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	now: number,
): { found: Found; voiceName: string } | null {
	const sig = signatureOf(p, work, voices, now)?.signature;
	const hit = sig === undefined ? undefined : found.get(sig);
	if (hit?.status !== "done") return null;
	const setup = voiceOf(p, work);
	return {
		found: hit,
		voiceName:
			(setup &&
				savedOf(voices ?? [], setup.voiceId, setup.provider)?.voice.name) ??
			setup?.voiceId ??
			"",
	};
}

// 받을 문단(스펙 5.1 '받기'). 누른 때의 값으로 새 배열을 만든다(받는 도중 편집이 파일·자막 시각을 섞지 않게, Review Focus 5).
// 빈 문단은 빠지고 n은 카드 번호, 마지막 문단 뒤 쉼은 0이다
// 잇기 키: 이어 붙인 문단 id·결과 id·쉼 줄. 마지막 잇기 캐시(provider joinOf)와 이어 듣기 낡음 판정(막대)이 같은 함수를 쓴다
export const joinKeyOf = (
	items: readonly { id: string; found: { id: string }; gap: number }[],
) => items.map((item) => `${item.id}:${item.found.id}:${item.gap}`).join(",");

export function receivePlan(
	ps: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	now: number,
):
	| {
			ok: true;
			items: {
				id: string;
				n: number;
				found: Found;
				gap: number;
				voiceName: string;
				text: string;
			}[];
	  }
	| { ok: false; reason: "unmade"; unmade: number; firstId: string }
	| { ok: false; reason: "empty" } {
	const rows = ps.flatMap((p, i) =>
		blankFor(p, work)
			? []
			: [{ p, n: i + 1, made: madeOf(p, work, voices, found, now) }],
	);
	if (rows.length === 0) return { ok: false, reason: "empty" };
	const unmade = rows.filter((row) => !row.made);
	if (unmade[0])
		return {
			ok: false,
			reason: "unmade",
			unmade: unmade.length,
			firstId: unmade[0].p.id,
		};
	const last = rows.length - 1;
	return {
		ok: true,
		// 위에서 모두 만들었음을 봤다(made가 늘 있다)
		items: rows.flatMap(({ p, n, made }, k) =>
			made
				? [
						{
							id: p.id,
							n,
							found: made.found,
							gap: k === last ? 0 : (p.gap ?? work.gap),
							voiceName: made.voiceName,
							text: p.text,
						},
					]
				: [],
		),
	};
}
