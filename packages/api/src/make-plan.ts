// packages/api/src/make-plan.ts
import {
	blankFor,
	blockOf,
	type Paragraph,
	type ParagraphBlock,
	paragraphRequest,
	reviewOf,
	savedOf,
	spokenOf,
	tooLongOf,
	voiceOf,
	type Work,
} from "./paragraph-script";
import type { ProviderId } from "./providers/contract";
import type { TrialFailure } from "./providers/trial-contract";
import {
	comboSignature,
	estimate,
	needsConfirm,
	type Usage,
} from "./providers/trial-options";
import type { SavedVoice } from "./saved-voice-contract";
import type { StudioFound, StudioRequest } from "./studio-contract";

// 문단 작업실 '전체 만들기'(T10 스펙 5.1)의 순수 함수 가운데 웹과 CLI가 함께 쓰는 것: 문단 상태, 찾기 대상, 만들기 계획, 받기 목록.
// 요청 id 규칙·리듀서·보내기 루프·요약은 웹(apps/web lib/make-all)에 있다

export type Found = StudioFound;
// 키는 comboSignature(요청). 키 없음 = 아직 찾지 않음, null = 찾았는데 없음('스펙과 다른 점' 7·27)
export type FoundMap = ReadonlyMap<string, Found | null>;
// 이번 화면의 서명별 진행·실패. 실패는 사유만 본다(웹 TrialProblem이 이 모양에 맞는다)
export type LiveMap = ReadonlyMap<
	string,
	| { state: "making" }
	| { state: "failed"; problem: { reason: TrialFailure | "unexpected" } }
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

export type Lookup = { request: StudioRequest; signature: string };
// 문단의 저장 결과를 찾을 서명(찾는 순서). 마지막이 만들 요청이다. Fish 무료 모델 종료로 유료로 보정되는 문단은 보정 전(무료) 요청이 앞에 선다:
// 끝나기 전에 무료로 만든 결과(보관 30일)를 다시 쓴다. 요청을 만들 수 없으면 빈 목록
export function lookupsOf(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	now: number,
): Lookup[] {
	const request = paragraphRequest(p, work, voices, now);
	if (!request) return [];
	const lookup = (each: StudioRequest): Lookup => ({
		request: each,
		signature: comboSignature(each),
	});
	const setup = voiceOf(p, work);
	return request.provider === "fish_audio" &&
		setup?.provider === "fish_audio" &&
		setup.settings.model !== request.settings.model
		? [lookup({ ...request, settings: setup.settings }), lookup(request)]
		: [lookup(request)];
}
// 만들 요청과 서명. found를 주면 완료를 찾은 서명이 먼저다(저장된 결과를 볼 때)
export const signatureOf = (
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	now: number,
	found?: FoundMap,
): Lookup | null => {
	const lookups = lookupsOf(p, work, voices, now);
	return (
		lookups.find(({ signature }) => found?.get(signature)?.status === "done") ??
		lookups.at(-1) ??
		null
	);
};
// 문단에서 찾을 것(15): 요청이 있고 계약 상한 안이며, all이 아니면 완료를 찾지 못했고 표에 아직 키가 없는 것. 길이는 blockOf가 아니라 tooLongOf로 본다
// (blockOf는 이용 불가를 길이보다 먼저 돌려준다, 상한을 넘는 요청 하나로 studioFindMany 배치 전체가 거절된다). 이용 불가 성우는 빼지 않는다(16)
function findable(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	all: boolean,
	now: number,
): Lookup[] {
	const lookups = lookupsOf(p, work, voices, now);
	const [first] = lookups;
	if (!first || tooLongOf(spokenOf(p), first.request.provider)) return [];
	if (all) return lookups;
	return found.get(first.signature)?.status === "done"
		? []
		: lookups.filter(({ signature }) => !found.has(signature));
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
	const target = signatureOf(p, work, voices, now, found);
	const hit = target ? found.get(target.signature) : undefined;
	if (hit?.status === "done") return "made";
	const mine = target ? live.get(target.signature) : undefined;
	if (mine?.state === "making") return "making";
	// 찾기 대상인데 아직 찾지 않았다
	const pending = findable(p, work, voices, found, false, now).length > 0;
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
	for (const p of ps)
		for (const hit of findable(p, work, voices, found, all, now)) {
			if (seen.has(hit.signature)) continue;
			seen.add(hit.signature);
			targets.push(hit.request);
		}
	return targets;
}

// Vercel 함수 요청 본문 한도 4.5MB에서 oRPC 봉투 몫을 남긴 값. 실제 문단은 STUDIO_TEXT_MAX(2,000자)라 200개도 이 안에 들고, 서버 스키마 상한(8,000 UTF-16 × 200개)에 대한 안전망이다
export const CHUNK_MAX_BYTES = 3_500_000;

// studioFindMany 요청을 개수(maxCount)와 JSON 본문 크기(maxBytes)로 나눈다(순서 유지).
// 혼자 maxBytes를 넘는 항목은 단독 묶음이다(서버 입력 상한이 막지만 무한 반복을 막는다)
export function chunkTargets(
	targets: readonly StudioRequest[],
	maxCount: number,
	maxBytes: number,
): StudioRequest[][] {
	const encoder = new TextEncoder();
	const chunks: StudioRequest[][] = [];
	let chunk: StudioRequest[] = [];
	// 배열 대괄호 2바이트 + 항목 사이 쉼표
	let bytes = 2;
	for (const target of targets) {
		const size = encoder.encode(JSON.stringify(target)).length + 1;
		if (
			chunk.length > 0 &&
			(chunk.length >= maxCount || bytes + size > maxBytes)
		) {
			chunks.push(chunk);
			chunk = [];
			bytes = 2;
		}
		chunk.push(target);
		bytes += size;
	}
	if (chunk.length > 0) chunks.push(chunk);
	return chunks;
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
		const hit = signatureOf(p, work, voices, now, found);
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

// 문단 하나의 저장된 결과(완료)와 성우 이름. 없거나 미확인·빈 문단이면 null. 보관함에서 빠진 성우 이름은 성우 id(카드 듣기와 받기가 함께 쓴다)
export function madeOf(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	found: FoundMap,
	now: number,
): { found: Found; voiceName: string } | null {
	const sig = signatureOf(p, work, voices, now, found)?.signature;
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
