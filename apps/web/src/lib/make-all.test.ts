import { ORPCError } from "@orpc/client";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	estimate,
	STUDIO_TEXT_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";
import { describe, expect, it } from "vitest";

import {
	afterFailure,
	afterUnknownConfirmed,
	type Found,
	type FoundMap,
	fillOf,
	findTargets,
	firstLink,
	forgetFound,
	type LiveMap,
	MAKE_IDLE,
	type MakeEvent,
	type MakeItem,
	type MakeState,
	madeOf,
	makePlan,
	makeReducer,
	mergeFound,
	type ParagraphStatus,
	paragraphStatus,
	pruneFound,
	receivePlan,
	requestIdFor,
	runMakeAll,
	summaryOf,
	usageByProvider,
} from "./make-all";
import {
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	paragraphRequest,
	type VoiceSetup,
	type Work,
} from "./paragraph-script";
import type { TrialProblem } from "./trial-view";

const NOW = Date.parse("2026-10-23T12:00:00+09:00");
const voice = (over: Partial<Voice> = {}): Voice =>
	({
		provider: "typecast",
		source: "public",
		voiceId: "tc_1",
		name: "민지",
		models: [],
		...over,
	}) as Voice;
const saved = (over: Partial<SavedVoice> = {}): SavedVoice => ({
	id: "s1",
	voice: voice(),
	favorite: false,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
	...over,
});
const typecast: VoiceSetup = {
	provider: "typecast",
	voiceId: "tc_1",
	settings: DEFAULT_SETTINGS.typecast,
};
const fishFree: VoiceSetup = {
	provider: "fish_audio",
	voiceId: "f_1",
	settings: DEFAULT_SETTINGS.fish_audio,
};
const VOICES = [
	saved(),
	saved({
		id: "s2",
		voice: voice({ provider: "fish_audio", voiceId: "f_1", name: "하늘" }),
	}),
];
const work = (over: Partial<Work> = {}): Work => ({
	defaultVoice: typecast,
	gap: PARAGRAPH_GAP_DEFAULT,
	channelId: null,
	paragraphs: [],
	...over,
});
const para = (id: string, text: string, over: Partial<Paragraph> = {}) =>
	({ id, text, ...over }) as Paragraph;
const found = (status: Found["status"] = "done", id = "r1"): Found => ({
	id,
	createdAt: "2026-10-23T03:00:00.000Z",
	usage: { unit: "credit", amount: 3 },
	bytes: 100,
	status,
});
const sigOf = (p: Paragraph, w = work(), voices = VOICES) => {
	const request = paragraphRequest(p, w, voices, NOW);
	if (!request) throw new Error("요청 없음");
	return comboSignature(request);
};
const table = (entries: [Paragraph, Found | null][], w = work()): FoundMap =>
	new Map(entries.map(([p, value]) => [sigOf(p, w), value]));
const NO_LIVE: LiveMap = new Map();
const problem = (reason: TrialProblem["reason"]): TrialProblem => ({
	reason,
	retryAt: null,
	providerCode: null,
});
const itemOf = (p: Paragraph, n: number, w = work()): MakeItem => {
	const request = paragraphRequest(p, w, VOICES, NOW) as StudioRequest;
	return { id: p.id, n, request, signature: comboSignature(request) };
};

describe("makePlan", () => {
	it("저장된 결과가 있는 문단은 make에서 빠지고 reused에 센다", () => {
		const a = para("a", "하나");
		const b = para("b", "둘");
		const plan = makePlan(
			[a, b],
			work(),
			VOICES,
			table([
				[a, found()],
				[b, null],
			]),
			NOW,
		);
		expect(plan.make).toEqual([itemOf(b, 2)]);
		expect(plan.reused).toBe(1);
		expect(plan.firstBlocked).toBeNull();
	});
	it("막힌 문단이 하나라도 있으면 make가 비고 firstBlocked는 첫 문단", () => {
		const ps = [
			para("a", "하나"),
			para("b", "가".repeat(STUDIO_TEXT_MAX + 1)),
			para("c", "셋", { voice: { ...typecast, voiceId: "gone" } }),
		];
		const plan = makePlan(ps, work(), VOICES, new Map(), NOW);
		expect(plan.make).toEqual([]);
		expect(plan.free).toBe(false);
		expect(plan.firstBlocked).toEqual({
			id: "b",
			n: 2,
			block: { kind: "too_long", length: STUDIO_TEXT_MAX + 1, max: 2000 },
		});
	});
	it("빈 문단은 건너뛴다", () => {
		const ps = [para("a", "  "), para("b", "둘")];
		const plan = makePlan(
			ps,
			work({ defaultVoice: null }),
			VOICES,
			new Map(),
			NOW,
		);
		// 빈 문단은 성우가 없어도 막지 않는다. 번호는 카드 번호(빈 문단 포함)다
		expect(plan.firstBlocked).toEqual({ id: "b", n: 2, block: "no_voice" });
		const ok = makePlan(ps, work(), VOICES, new Map(), NOW);
		expect(ok.make).toEqual([itemOf(ps[1] as Paragraph, 2)]);
		expect(ok.reused).toBe(0);
	});
	it("모든 make가 Fish 무료면 free", () => {
		const w = work({ defaultVoice: fishFree });
		const plan = makePlan([para("a", "하나")], w, VOICES, new Map(), NOW);
		expect(plan.make).toHaveLength(1);
		expect(plan.free).toBe(true);
		const mixed = makePlan(
			[para("a", "하나"), para("b", "둘", { voice: typecast })],
			w,
			VOICES,
			new Map(),
			NOW,
		);
		expect(mixed.free).toBe(false);
		// 무료 기간이 끝나면 요청이 s2.1-pro라 무료가 아니다
		const after = Date.parse("2026-12-01T00:00:00+09:00");
		expect(
			makePlan([para("a", "하나")], w, VOICES, new Map(), after).free,
		).toBe(false);
	});
	it("make가 비면 free가 아니다", () => {
		const a = para("a", "하나");
		const w = work({ defaultVoice: fishFree });
		const plan = makePlan([a], w, VOICES, table([[a, found()]], w), NOW);
		expect(plan.make).toEqual([]);
		expect(plan.free).toBe(false);
	});
	it("미확인 문단은 unknown에 담기고 make에도 남는다", () => {
		const a = para("a", "하나");
		const plan = makePlan(
			[a],
			work(),
			VOICES,
			table([[a, found("unknown")]]),
			NOW,
		);
		expect(plan.make).toEqual([itemOf(a, 1)]);
		expect(plan.unknown).toEqual([sigOf(a)]);
	});
	it("같은 서명 문단 셋은 make 하나와 reused 둘", () => {
		const ps = [
			para("a", "같은 글"),
			para("b", "같은 글"),
			para("c", "같은 글"),
		];
		const plan = makePlan(ps, work(), VOICES, new Map(), NOW);
		expect(plan.make).toEqual([itemOf(ps[0] as Paragraph, 1)]);
		expect(plan.reused).toBe(2);
	});
	it("막힌 문단이 있어도 estimate는 막히지 않은 새 문단, blockedCount는 막힌 수(빈 문단 제외)", () => {
		const a = para("a", "하나");
		const c = para("c", "셋");
		const ps = [
			a,
			para("b", "가".repeat(STUDIO_TEXT_MAX + 1)),
			para("e", " "),
			c,
		];
		const plan = makePlan(ps, work(), VOICES, new Map(), NOW);
		expect(plan.make).toEqual([]);
		expect(plan.estimate).toEqual([itemOf(a, 1), itemOf(c, 4)]);
		expect(plan.blockedCount).toBe(1);
		expect(plan.firstBlocked?.id).toBe("b");
	});
	it("막힘이 없으면 estimate는 make와 같다", () => {
		const ps = [para("a", "하나"), para("b", "둘")];
		const plan = makePlan(ps, work(), VOICES, new Map(), NOW);
		expect(plan.make).toHaveLength(2);
		expect(plan.estimate).toEqual(plan.make);
		expect(plan.blockedCount).toBe(0);
	});
	it("같은 서명 둘 + 막힌 하나면 estimate 하나", () => {
		const ps = [
			para("a", "같은 글"),
			para("b", "같은 글"),
			para("c", "셋", { voice: { ...typecast, voiceId: "gone" } }),
		];
		const plan = makePlan(ps, work(), VOICES, new Map(), NOW);
		expect(plan.make).toEqual([]);
		expect(plan.estimate).toEqual([itemOf(ps[0] as Paragraph, 1)]);
		expect(plan.blockedCount).toBe(1);
	});
});

describe("usageByProvider", () => {
	const req = (r: StudioRequest): MakeItem => ({
		id: r.text,
		n: 1,
		request: r,
		signature: comboSignature(r),
	});
	const eleven = (text: string): StudioRequest => ({
		provider: "elevenlabs",
		voiceId: "el_1",
		text,
		settings: DEFAULT_SETTINGS.elevenlabs,
	});
	it("ElevenLabs 배율·Airy 언어·Fish 바이트·Gemini usd_micro를 공급자별로 합한다", () => {
		const gemini: StudioRequest = {
			provider: "gemini",
			voiceId: "Kore",
			text: "가".repeat(12),
			settings: DEFAULT_SETTINGS.gemini,
		};
		const make = [
			req(eleven("가나다")),
			req({
				provider: "airy",
				voiceId: "a_1",
				text: "가나",
				settings: DEFAULT_SETTINGS.airy,
			}),
			req(eleven("라마")),
			req({
				provider: "airy",
				voiceId: "a_1",
				text: "abc",
				settings: { ...DEFAULT_SETTINGS.airy, language: "en" },
			}),
			req({
				provider: "fish_audio",
				voiceId: "f_1",
				text: "가나",
				settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" },
			}),
			req({
				provider: "fish_audio",
				voiceId: "f_1",
				text: "무료",
				settings: DEFAULT_SETTINGS.fish_audio,
			}),
			req(gemini),
			req(gemini),
		];
		const rows = usageByProvider(
			make,
			(r) => (r.provider === "elevenlabs" ? 0.5 : null),
			NOW,
		);
		expect(rows).toEqual([
			{
				provider: "elevenlabs",
				count: 2,
				usage: { unit: "credit", amount: 2 + 1 },
				rateMissing: false,
			},
			{
				provider: "airy",
				count: 2,
				usage: { unit: "credit", amount: 3 + 3 },
				rateMissing: false,
			},
			// 무료 문단은 0바이트로 더한다(유료가 섞이면 바이트 줄)
			{
				provider: "fish_audio",
				count: 2,
				usage: { unit: "byte", amount: 6 },
				rateMissing: false,
			},
			{
				provider: "gemini",
				count: 2,
				usage: {
					unit: "usd_micro",
					amount: estimate(gemini, null, NOW).amount * 2,
				},
				rateMissing: false,
			},
		]);
	});
	it("배율을 모르는 ElevenLabs 줄은 rateMissing", () => {
		const rows = usageByProvider(
			[req(eleven("가나다")), req(eleven("라마"))],
			() => null,
			NOW,
		);
		expect(rows).toEqual([
			{
				provider: "elevenlabs",
				count: 2,
				usage: { unit: "credit", amount: 5 },
				rateMissing: true,
			},
		]);
	});
});

describe("paragraphStatus", () => {
	it("완료가 있으면 성우가 이용 불가여도 made", () => {
		const a = para("a", "하나");
		const off = [saved({ unavailable: true })];
		const map = new Map([[sigOf(a, work(), off), found()]]);
		expect(paragraphStatus(a, work(), off, map, NO_LIVE, NOW)).toBe("made");
		expect(
			paragraphStatus(
				a,
				work(),
				off,
				new Map([[sigOf(a, work(), off), null]]),
				NO_LIVE,
				NOW,
			),
		).toBe("blocked");
	});
	it("표에 키가 없으면 checking, null이면 unmade", () => {
		const a = para("a", "하나");
		expect(paragraphStatus(a, work(), VOICES, new Map(), NO_LIVE, NOW)).toBe(
			"checking",
		);
		expect(
			paragraphStatus(a, work(), VOICES, table([[a, null]]), NO_LIVE, NOW),
		).toBe("unmade");
		expect(
			paragraphStatus(
				a,
				work(),
				VOICES,
				table([[a, found("unknown")]]),
				NO_LIVE,
				NOW,
			),
		).toBe("unknown");
		// 이용 불가 성우도 찾기 대상이라 찾기 전에는 확인 중이다
		expect(
			paragraphStatus(
				a,
				work(),
				[saved({ unavailable: true })],
				new Map(),
				NO_LIVE,
				NOW,
			),
		).toBe("checking");
		// 이용 불가 + 길이 초과는 찾기 대상이 아니라(찾지 않으므로) 바로 막힘
		expect(
			paragraphStatus(
				para("l", "가".repeat(STUDIO_TEXT_MAX + 1)),
				work(),
				[saved({ unavailable: true })],
				new Map(),
				NO_LIVE,
				NOW,
			),
		).toBe("blocked");
		// 찾기 대상이 아닌 막힘(성우 없음·길이 초과)은 바로 막힘
		expect(
			paragraphStatus(
				a,
				work({ defaultVoice: null }),
				VOICES,
				new Map(),
				NO_LIVE,
				NOW,
			),
		).toBe("blocked");
		expect(
			paragraphStatus(para("e", " "), work(), VOICES, new Map(), NO_LIVE, NOW),
		).toBe("empty");
	});
	it("voices가 null이면 checking", () => {
		const a = para("a", "하나");
		expect(
			paragraphStatus(a, work(), null, table([[a, found()]]), NO_LIVE, NOW),
		).toBe("checking");
	});
	it("이번 화면의 진행·실패: making, failed, 응답 없음은 unknown", () => {
		const a = para("a", "하나");
		const live = (
			value: LiveMap extends ReadonlyMap<string, infer V> ? V : never,
		) => new Map([[sigOf(a), value]]);
		const map = table([[a, null]]);
		const of = (l: LiveMap): ParagraphStatus =>
			paragraphStatus(a, work(), VOICES, map, l, NOW);
		expect(of(live({ state: "making" }))).toBe("making");
		expect(of(live({ state: "failed", problem: problem("in_progress") }))).toBe(
			"failed",
		);
		expect(
			of(live({ state: "failed", problem: problem("unknown_outcome") })),
		).toBe("unknown");
	});
});

describe("findTargets·pruneFound·mergeFound", () => {
	it("성우 없음·상한 초과(UTF-16 포함) 문단은 찾기에서 빠진다", () => {
		const ok = para("a", "하나");
		const ps = [
			ok,
			para("c", "가".repeat(STUDIO_TEXT_MAX + 1)),
			para("d", `${"가".repeat(10)}${" ".repeat(STUDIO_TEXT_MAX * 4)}`),
			para("e", "  "),
		];
		const w = work();
		expect(findTargets(ps, w, VOICES, new Map(), true, NOW)).toEqual([
			paragraphRequest(ok, w, VOICES, NOW),
		]);
		// 성우 없음(기본도 없음)·성우 목록 전
		const noDefault = work({ defaultVoice: null });
		expect(findTargets(ps, noDefault, VOICES, new Map(), true, NOW)).toEqual(
			[],
		);
		expect(findTargets(ps, w, null, new Map(), true, NOW)).toEqual([]);
		// 이용 불가 성우 + 상한 초과: blockOf는 unavailable을 먼저 돌려주지만 찾기에 넣으면 배치 전체가 계약에서 거절된다
		const off = [saved({ unavailable: true })];
		expect(
			findTargets(ps.slice(1), w, off, new Map(), true, NOW).map((r) => r.text),
		).toEqual([]);
		expect(findTargets([ok], w, off, new Map(), true, NOW)).toHaveLength(1);
	});
	it("이용 불가 성우 문단은 찾기에 들고, 찾으면 made이며 makePlan의 firstBlocked가 아니다", () => {
		const a = para("a", "하나");
		const off = [saved({ unavailable: true })];
		const targets = findTargets([a], work(), off, new Map(), false, NOW);
		expect(targets).toHaveLength(1);
		const map = mergeFound(new Map(), targets, [found()]);
		expect(paragraphStatus(a, work(), off, map, NO_LIVE, NOW)).toBe("made");
		const plan = makePlan([a], work(), off, map, NOW);
		expect(plan.firstBlocked).toBeNull();
		expect(plan.reused).toBe(1);
	});
	it("all이 아니면 표에 있는 서명은 빼고 같은 서명은 하나", () => {
		const a = para("a", "하나");
		const b = para("b", "둘");
		const ps = [a, b, para("c", "둘"), para("d", "셋")];
		const map = table([[a, null]]);
		const texts = (all: boolean) =>
			findTargets(ps, work(), VOICES, map, all, NOW).map((r) => r.text);
		expect(texts(false)).toEqual(["둘", "셋"]);
		expect(texts(true)).toEqual(["하나", "둘", "셋"]);
	});
	it("지금 문단에 없는 null 항목은 버리고 완료 항목은 남긴다", () => {
		const a = para("a", "하나");
		const gone = para("x", "지운 문단");
		const old = para("y", "고치기 전");
		const map = table([
			[a, null],
			[gone, null],
			[old, found()],
		]);
		const next = pruneFound(map, [a], work(), VOICES, NOW);
		expect([...next.keys()]).toEqual([sigOf(a), sigOf(old)]);
		// 버릴 것이 없으면 같은 표
		expect(pruneFound(next, [a], work(), VOICES, NOW)).toBe(next);
	});
	it("mergeFound: 완료 키에 늦은 null이 와도 완료로 남는다", () => {
		const a = para("a", "하나");
		const b = para("b", "둘");
		const done = found();
		const start = table([
			[a, done],
			[b, found("unknown", "r2")],
		]);
		const requests = [a, b].map(
			(p) => paragraphRequest(p, work(), VOICES, NOW) as StudioRequest,
		);
		const next = mergeFound(start, requests, [found("unknown"), null]);
		expect(next.get(sigOf(a))).toBe(done);
		// 완료가 아니던 키는 새 값으로 바뀐다
		expect(next.get(sigOf(b))).toBeNull();
		const again = mergeFound(next, requests, [null, found()]);
		expect(again.get(sigOf(b))).toEqual(found());
		// 둘째 합치기의 늦은 null에도 완료로 남는다
		expect(again.get(sigOf(a))).toBe(done);
	});
});

describe("요청 id", () => {
	let n = 0;
	const makeId = () => `uuid-${++n}`;
	it("같은 서명을 두 번 물으면 같은 id", () => {
		const first = requestIdFor(new Map(), "s", makeId);
		const second = requestIdFor(first.ids, "s", makeId);
		expect(second.id).toBe(first.id);
		expect(requestIdFor(second.ids, "t", makeId).id).not.toBe(first.id);
	});
	it.each(["in_progress", "unknown_outcome"] as const)(
		"%s 뒤에는 같은 id",
		(reason) => {
			const { id, ids } = requestIdFor(new Map(), "s", makeId);
			const after = afterFailure(ids, "s", reason);
			expect(requestIdFor(after, "s", makeId).id).toBe(id);
		},
	);
	it.each([
		"rate_limit",
		"quota",
		"provider_auth",
		"no_permission",
		"provider_input",
		"provider_error",
		"free_ended",
		"voice_unavailable",
		"no_key",
		"storage",
		"request_mismatch",
		"unexpected",
	] as const)("%s 뒤에는 새 id", (reason) => {
		const { id, ids } = requestIdFor(new Map(), "s", makeId);
		const after = afterFailure(ids, "s", reason);
		expect(requestIdFor(after, "s", makeId).id).not.toBe(id);
	});
	it("provider_input + audio_too_large 뒤에도 새 id", () => {
		const { id, ids } = requestIdFor(new Map(), "s", makeId);
		const tooLarge: TrialProblem = {
			reason: "provider_input",
			retryAt: null,
			providerCode: "audio_too_large",
		};
		const after = afterFailure(ids, "s", tooLarge.reason);
		expect(requestIdFor(after, "s", makeId).id).not.toBe(id);
	});
	it("미확인은 경고 확인 뒤에만 새 id", () => {
		const a = requestIdFor(new Map(), "s", makeId);
		const b = requestIdFor(a.ids, "t", makeId);
		const kept = afterFailure(b.ids, "s", "unknown_outcome");
		expect(requestIdFor(kept, "s", makeId).id).toBe(a.id);
		const confirmed = afterUnknownConfirmed(kept, ["s"]);
		expect(requestIdFor(confirmed, "s", makeId).id).not.toBe(a.id);
		// 확인한 서명만 지운다
		expect(requestIdFor(confirmed, "t", makeId).id).toBe(b.id);
	});
});

describe("runMakeAll", () => {
	const a = para("a", "하나");
	const b = para("b", "둘");
	const A = itemOf(a, 1);
	const B = itemOf(b, 2);
	type Deps = Parameters<typeof runMakeAll>[2];
	function harness(over: Partial<Deps> = {}) {
		const events: MakeEvent[] = [];
		const sent: { id: string; requestId: string }[] = [];
		const deps: Deps = {
			current: (id) => ({ signature: id === "a" ? A.signature : B.signature }),
			find: async () => null,
			send: async (item, requestId) => {
				sent.push({ id: item.id, requestId });
				return found("done", `made-${item.id}`);
			},
			idFor: (signature) => `req:${signature === A.signature ? "a" : "b"}`,
			shouldContinue: () => "go",
			on: (event) => events.push(event),
			...over,
		};
		return { deps, events, sent };
	}
	const types = (events: MakeEvent[]) => events.map((e) => e.type);

	it("모든 이벤트에 인자로 받은 run을 붙이고 idFor의 요청 id로 보낸다", async () => {
		const { deps, events, sent } = harness();
		await runMakeAll([A, B], 7, deps);
		expect(types(events)).toEqual(["sent", "done", "sent", "done"]);
		expect(events.every((e) => e.run === 7)).toBe(true);
		expect(events[0]).toEqual({
			type: "sent",
			run: 7,
			since: expect.any(Number),
		});
		expect(events[1]).toEqual({
			type: "done",
			run: 7,
			item: A,
			found: found("done", "made-a"),
		});
		expect(sent).toEqual([
			{ id: "a", requestId: "req:a" },
			{ id: "b", requestId: "req:b" },
		]);
	});
	it("find를 기다리는 사이 shouldContinue가 gone이 되면 send 0회, 이벤트 없음", async () => {
		let go: "go" | "gone" = "go";
		const { deps, events, sent } = harness({
			shouldContinue: () => go,
			find: async () => {
				go = "gone";
				return null;
			},
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent).toEqual([]);
		expect(events).toEqual([]);
	});
	it("find를 기다리는 사이 멈춤을 누르면 send 0회와 halted", async () => {
		let go: "go" | "stop" = "go";
		const { deps, events, sent } = harness({
			shouldContinue: () => go,
			find: async () => {
				go = "stop";
				return null;
			},
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent).toEqual([]);
		expect(events).toEqual([{ type: "halted", run: 1 }]);
	});
	it("find를 기다리는 사이 문단을 고치면 send 0회와 changed", async () => {
		let edited = false;
		const { deps, events, sent } = harness({
			current: (id) =>
				id === "a" ? { signature: edited ? "고친 서명" : A.signature } : "gone",
			find: async () => {
				edited = true;
				return null;
			},
		});
		await runMakeAll([A], 1, deps);
		expect(sent).toEqual([]);
		expect(events).toEqual([{ type: "changed", run: 1, item: A }]);
	});
	it("find가 실패하면 send 0회와 fail 이벤트", async () => {
		const { deps, events, sent } = harness({
			find: async () => {
				throw new TypeError("Failed to fetch");
			},
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent).toEqual([]);
		// sent false: 보내지 않은 실패라 컴포넌트가 afterFailure로 요청 id를 지우지 않는다(미확인 뒤 남겨 둔 id 보호)
		expect(events).toEqual([
			{
				type: "fail",
				run: 1,
				item: A,
				problem: problem("unexpected"),
				sent: false,
			},
		]);
	});
	it("보낸 뒤 지운 문단도 결과는 done으로 넘기고 다음 문단을 보낸다", async () => {
		let deleted = false;
		const { deps, events, sent } = harness({
			current: (id) =>
				id === "a" && deleted
					? "gone"
					: { signature: id === "a" ? A.signature : B.signature },
			send: async (item, requestId) => {
				sent.push({ id: item.id, requestId });
				if (item.id === "a") deleted = true;
				return found("done", `made-${item.id}`);
			},
		});
		await runMakeAll([A, B], 1, deps);
		expect(types(events)).toEqual(["sent", "done", "sent", "done"]);
		expect(events[1]).toEqual({
			type: "done",
			run: 1,
			item: A,
			found: found("done", "made-a"),
		});
		expect(sent.map((s) => s.id)).toEqual(["a", "b"]);
	});
	it("보내기 전에 지운 문단은 보내지 않고 다음으로", async () => {
		const { deps, events, sent } = harness({
			current: (id) => (id === "a" ? "gone" : { signature: B.signature }),
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent.map((s) => s.id)).toEqual(["b"]);
		expect(events[0]).toEqual({ type: "skip", run: 1, item: A, found: null });
		expect(types(events)).toEqual(["skip", "sent", "done"]);
		// 빈 문단도 같다
		const empty = harness({
			current: (id) => (id === "a" ? "empty" : { signature: B.signature }),
		});
		await runMakeAll([A, B], 1, empty.deps);
		expect(empty.sent.map((s) => s.id)).toEqual(["b"]);
	});
	it("보내기 전에 고친 문단은 옛 요청을 보내지 않고 changed", async () => {
		const { deps, events, sent } = harness({
			current: (id) => ({
				signature: id === "a" ? "고친 서명" : B.signature,
			}),
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent.map((s) => s.id)).toEqual(["b"]);
		expect(types(events)).toEqual(["changed", "sent", "done"]);
	});
	it("find가 완료를 돌려주면 보내지 않고 건너뛴다", async () => {
		const other = found("done", "other-tab");
		const { deps, events, sent } = harness({
			find: async (request) => (request === A.request ? other : null),
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent.map((s) => s.id)).toEqual(["b"]);
		expect(events[0]).toEqual({ type: "skip", run: 1, item: A, found: other });
	});
	it("항목 하나, find가 완료를 주면 send 0회", async () => {
		const { deps, events, sent } = harness({ find: async () => found() });
		await runMakeAll([A], 1, deps);
		expect(sent).toEqual([]);
		expect(types(events)).toEqual(["skip"]);
	});
	it("shouldContinue가 stop이면 다음 문단을 보내지 않고 halted", async () => {
		let go: "go" | "stop" = "go";
		const { deps, events, sent } = harness({
			shouldContinue: () => go,
			send: async (item, requestId) => {
				sent.push({ id: item.id, requestId });
				go = "stop";
				return found();
			},
		});
		await runMakeAll([A, B], 1, deps);
		expect(sent.map((s) => s.id)).toEqual(["a"]);
		expect(types(events)).toEqual(["sent", "done", "halted"]);
	});
	it("send가 실패하면 fail 이벤트 뒤 끝나고 다음 문단을 보내지 않는다", async () => {
		let calls = 0;
		const { deps, events } = harness({
			send: async () => {
				calls += 1;
				throw new TypeError("Failed to fetch");
			},
		});
		await runMakeAll([A, B], 1, deps);
		expect(calls).toBe(1);
		// 응답을 받지 못한 실패는 처리 여부 미확인(createFailureOf)
		expect(events.at(-1)).toEqual({
			type: "fail",
			run: 1,
			item: A,
			problem: problem("unknown_outcome"),
			sent: true,
		});
		// 진행 중(in_progress)도 그 자리에서 멈춘다(자동 재시도 없음)
		const busy = harness({
			send: async () => {
				calls += 1;
				throw new ORPCError("TOO_MANY_REQUESTS", {
					data: { reason: "in_progress" },
				});
			},
		});
		await runMakeAll([A, B], 1, busy.deps);
		expect(calls).toBe(2);
		expect(busy.events.at(-1)).toMatchObject({
			type: "fail",
			problem: { reason: "in_progress" },
			sent: true,
		});
	});
});

describe("makeReducer", () => {
	const A = itemOf(para("a", "하나"), 1);
	const B = itemOf(para("b", "둘", { voice: fishFree }), 3);
	const started = (): MakeState =>
		makeReducer(MAKE_IDLE, { type: "start", run: MAKE_IDLE.run });
	const plannedWith = (
		over: Partial<Extract<MakeEvent, { type: "planned" }>> = {},
		state = started(),
	) =>
		makeReducer(state, {
			type: "planned",
			run: state.run,
			queue: [A, B],
			blocked: false,
			unknown: 0,
			free: false,
			...over,
		});
	const making = () => plannedWith({ free: true });
	// 지금 run을 붙여 보낸다(union마다 run을 뺀 모양)
	type NoRun = MakeEvent extends infer E
		? E extends MakeEvent
			? Omit<E, "run">
			: never
		: never;
	const go = (state: MakeState, ...events: NoRun[]) =>
		events.reduce(
			(s, event) => makeReducer(s, { ...event, run: s.run } as MakeEvent),
			state,
		);

	it("start는 run을 올리고 finding, left·notice를 비운다", () => {
		const s = started();
		expect(s).toMatchObject({
			phase: "finding",
			run: 1,
			left: [],
			notice: null,
		});
	});
	it("무료 계획은 confirm 없이 making", () => {
		const s = making();
		expect(s.phase).toBe("making");
		expect(s.queue).toEqual([A, B]);
		expect(s.at).toBe(0);
		expect(plannedWith().phase).toBe("confirm");
	});
	it("무료여도 미확인이 있으면 confirm", () => {
		expect(plannedWith({ free: true, unknown: 1 }).phase).toBe("confirm");
	});
	it("빈 큐 planned는 idle과 notice nothing", () => {
		expect(plannedWith({ queue: [], free: false })).toMatchObject({
			phase: "idle",
			notice: "nothing",
		});
	});
	it("blocked planned는 notice 없이 idle(빈 큐보다 먼저)", () => {
		expect(plannedWith({ queue: [], blocked: true })).toMatchObject({
			phase: "idle",
			notice: null,
		});
	});
	it("findFailed는 idle과 notice find_failed", () => {
		expect(go(started(), { type: "findFailed" })).toMatchObject({
			phase: "idle",
			notice: "find_failed",
		});
	});
	it("making 중 start와 confirm 아닐 때 confirm은 무시", () => {
		const s = making();
		expect(go(s, { type: "start" })).toBe(s);
		expect(go(s, { type: "confirm" })).toBe(s);
		const f = started();
		expect(go(f, { type: "start" })).toBe(f);
		const c = plannedWith();
		const confirmed = go(c, { type: "confirm" });
		expect(confirmed.phase).toBe("making");
		// 두 번 눌러도 한 번
		expect(go(confirmed, { type: "confirm" })).toBe(confirmed);
		expect(go(plannedWith(), { type: "cancel" }).phase).toBe("idle");
	});
	it("done이 큐 끝이면 idle", () => {
		const s = go(
			making(),
			{ type: "sent", since: 10 },
			{ type: "done", item: A, found: found() },
		);
		expect(s).toMatchObject({ phase: "making", at: 1, since: null });
		expect(go(s, { type: "done", item: B, found: found() })).toMatchObject({
			phase: "idle",
			at: 2,
		});
	});
	it("건너뛴 문단(skip·changed)은 at을 올린다", () => {
		const s = go(making(), { type: "skip", item: A, found: null });
		expect(s.at).toBe(1);
		const end = go(s, { type: "changed", item: B });
		expect(end).toMatchObject({ phase: "idle", at: 2, left: ["b"] });
	});
	it("stop은 지금 문단 끝(done 또는 fail) 뒤 stopped", () => {
		const stopping = go(making(), { type: "sent", since: 1 }, { type: "stop" });
		expect(stopping.phase).toBe("stopping");
		const afterDone = go(stopping, { type: "done", item: A, found: found() });
		expect(afterDone).toMatchObject({ phase: "stopping", at: 1 });
		expect(go(afterDone, { type: "halted" })).toMatchObject({
			phase: "stopped",
			stopped: { id: "b", n: 3, provider: "fish_audio", problem: null },
		});
		const afterFail = go(stopping, {
			type: "fail",
			item: A,
			problem: problem("quota"),
			sent: true,
		});
		expect(afterFail).toMatchObject({
			phase: "stopped",
			stopped: { id: "a", problem: problem("quota") },
		});
	});
	it("halted는 problem null로 stopped", () => {
		const s = go(making(), { type: "halted" });
		expect(s.phase).toBe("stopped");
		expect(s.stopped).toEqual({
			id: "a",
			n: 1,
			provider: "typecast",
			problem: null,
		});
	});
	it("fail은 stopped에 provider를 담는다", () => {
		const s = go(
			making(),
			{ type: "done", item: A, found: found() },
			{ type: "sent", since: 5 },
			{ type: "fail", item: B, problem: problem("rate_limit"), sent: true },
		);
		expect(s).toMatchObject({
			phase: "stopped",
			since: null,
			stopped: {
				id: "b",
				n: 3,
				provider: "fish_audio",
				problem: problem("rate_limit"),
			},
		});
	});
	it("in_progress는 멈춤이고 다시 보내지 않는다", () => {
		const s = go(
			making(),
			{ type: "sent", since: 1 },
			{
				type: "fail",
				item: A,
				problem: problem("in_progress"),
				sent: true,
			},
		);
		expect(s.phase).toBe("stopped");
		expect(s.stopped?.problem?.reason).toBe("in_progress");
		// 멈춘 뒤의 보냄·완료는 받지 않는다(이어서 만들기는 새 start)
		expect(go(s, { type: "sent", since: 2 })).toBe(s);
		expect(go(s, { type: "done", item: A, found: found() })).toBe(s);
		expect(go(s, { type: "start" }).phase).toBe("finding");
	});
	it("다른 run의 done은 무시", () => {
		const s = making();
		expect(
			makeReducer(s, { type: "done", run: s.run - 1, item: A, found: found() }),
		).toBe(s);
		const stopped = go(s, { type: "halted" });
		expect(makeReducer(stopped, { type: "start", run: s.run - 1 })).toBe(
			stopped,
		);
	});
	it("보낸 문단이 사라져도 done은 다음으로 넘어가고 만든 수에 든다", () => {
		const s = go(making(), { type: "sent", since: 1 });
		// 리듀서는 문단 목록을 보지 않는다: 지워진 문단의 결과도 다음으로 넘어가고 남긴 문단에 들지 않는다(결과는 생겼다)
		const next = go(s, { type: "done", item: A, found: found() });
		expect(next).toEqual({ ...s, at: 1, since: null, made: 1 });
	});
	it("made는 이번 실행에서 결과가 생긴 문단만 센다: done·저장된 결과 skip은 세고 지움 skip·남김은 빼고(F30-1)", () => {
		const items = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
			itemOf(para(id, `문단 ${id}`), i + 1),
		);
		const [a, b, c, d, e, f] = items;
		const end = go(
			plannedWith({ queue: items, free: true }),
			{ type: "done", item: a, found: found() },
			{ type: "done", item: b, found: found() },
			// 보내기 직전 찾기가 저장된 결과를 찾았다
			{ type: "skip", item: c, found: found() },
			{ type: "done", item: d, found: found() },
			{ type: "changed", item: e },
			// 지웠거나 비운 문단
			{ type: "skip", item: f, found: null },
		);
		expect(end).toMatchObject({ phase: "idle", at: 6, left: ["e"], made: 4 });
		expect(started().made).toBe(0);
		expect(go(end, { type: "start" }).made).toBe(0);
	});
});

describe("summaryOf·firstLink", () => {
	it("빈 문단을 빼고 글자·만든 수·예상 초", () => {
		const a = para("a", " 안녕하세요 ");
		const ps = [a, para("e", "  "), para("b", "가나다라마바")];
		expect(summaryOf(ps, work(), VOICES, table([[a, found()]]), NOW)).toEqual({
			paragraphs: 2,
			empty: 1,
			chars: 11,
			made: 1,
			total: 2,
			seconds: 3,
		});
		expect(summaryOf([para("e", "")], work(), null, new Map(), NOW)).toEqual({
			paragraphs: 0,
			empty: 1,
			chars: 0,
			made: 0,
			total: 0,
			seconds: 0,
		});
	});
	it("우선순위 멈춘 문단 → 막힌 문단 → 안 만든 문단", () => {
		const statuses: { id: string; n: number; status: ParagraphStatus }[] = [
			{ id: "a", n: 1, status: "made" },
			{ id: "b", n: 2, status: "unknown" },
			{ id: "c", n: 3, status: "blocked" },
			{ id: "d", n: 4, status: "unmade" },
		];
		const A = itemOf(para("b", "둘"), 7);
		const stopped = makeReducer(
			makeReducer(makeReducer(MAKE_IDLE, { type: "start", run: 0 }), {
				type: "planned",
				run: 1,
				queue: [A],
				blocked: false,
				unknown: 0,
				free: true,
			}),
			{ type: "fail", run: 1, item: A, problem: problem("quota"), sent: true },
		);
		const plan = makePlan(
			[
				para("x", "하나"),
				para("c", "셋", { voice: { ...typecast, voiceId: "gone" } }),
			],
			work(),
			VOICES,
			new Map(),
			NOW,
		);
		// 멈춘 문단의 번호는 지금 번호(옮겼으면 바뀐 자리)
		expect(firstLink(stopped, plan, statuses)).toEqual({
			kind: "stopped",
			id: "b",
			n: 2,
		});
		expect(firstLink(MAKE_IDLE, plan, statuses)).toEqual({
			kind: "blocked",
			id: "c",
			n: 2,
		});
		const clear = makePlan([para("x", "하나")], work(), VOICES, new Map(), NOW);
		// 멈춘 문단을 지웠으면 다음 순위
		expect(
			firstLink(
				stopped,
				clear,
				statuses.filter((s) => s.id !== "b"),
			),
		).toEqual({ kind: "unmade", id: "d", n: 4 });
		expect(firstLink(MAKE_IDLE, clear, statuses)).toEqual({
			kind: "unmade",
			id: "b",
			n: 2,
		});
		expect(firstLink(MAKE_IDLE, clear, statuses.slice(0, 1))).toBeNull();
	});
});

describe("fillOf", () => {
	it("대본이 없으면 기본 성우가 있어도 paste", () => {
		expect(fillOf([para("a", " ")], work(), true)).toBe("paste");
	});
	it("대본이 있고 기본 성우·문단 성우가 없으면 default_voice", () => {
		const ps = [para("a", "하나", { voice: typecast }), para("b", "둘")];
		expect(fillOf(ps, work({ defaultVoice: null }), true)).toBe(
			"default_voice",
		);
	});
	it("모든 문단에 자기 성우가 있으면 기본 성우가 없어도 bar", () => {
		const ps = [para("a", "하나", { voice: typecast }), para("b", " ")];
		expect(fillOf(ps, work({ defaultVoice: null }), true)).toBe("bar");
	});
	it("막대 주 버튼이 잠겼으면 null", () => {
		expect(fillOf([para("a", "하나")], work(), false)).toBeNull();
	});
});

describe("receivePlan", () => {
	it("하나라도 안 만들었으면 ok false, unmade와 첫 문단", () => {
		const a = para("a", "하나");
		const ps = [a, para("b", "둘"), para("c", "셋")];
		expect(receivePlan(ps, work(), VOICES, table([[a, found()]]), NOW)).toEqual(
			{ ok: false, reason: "unmade", unmade: 2, firstId: "b" },
		);
		// 미확인도 받을 수 없다
		expect(
			receivePlan([a], work(), VOICES, table([[a, found("unknown")]]), NOW),
		).toEqual({ ok: false, reason: "unmade", unmade: 1, firstId: "a" });
	});
	it("비지 않은 문단이 없으면 ok false, empty", () => {
		expect(
			receivePlan([para("a", " ")], work(), VOICES, new Map(), NOW),
		).toEqual({ ok: false, reason: "empty" });
	});
	it("마지막 문단 쉼 0, 나머지는 문단 쉼 또는 기본 쉼", () => {
		const fish = para("b", "둘", { voice: fishFree });
		const ps = [
			para("a", "하나", { gap: 1.2 }),
			fish,
			para("e", ""),
			para("c", "셋", { gap: 2 }),
		];
		const w = work();
		const map: FoundMap = new Map(
			[ps[0], fish, ps[3]].map((p, i) => [
				sigOf(p as Paragraph, w),
				found("done", `r${i}`),
			]),
		);
		const plan = receivePlan(ps, w, VOICES, map, NOW);
		expect(plan).toEqual({
			ok: true,
			items: [
				{
					id: "a",
					n: 1,
					found: found("done", "r0"),
					gap: 1.2,
					voiceName: "민지",
					text: "하나",
				},
				{
					id: "b",
					n: 2,
					found: found("done", "r1"),
					gap: PARAGRAPH_GAP_DEFAULT,
					voiceName: "하늘",
					text: "둘",
				},
				{
					id: "c",
					n: 4,
					found: found("done", "r2"),
					gap: 0,
					voiceName: "민지",
					text: "셋",
				},
			],
		});
	});
	it("부른 뒤 문단 배열을 바꿔도 돌려준 items는 그대로", () => {
		const a = para("a", "하나");
		const b = para("b", "둘");
		const ps = [a, b];
		const plan = receivePlan(
			ps,
			work(),
			VOICES,
			table([
				[a, found("done", "r1")],
				[b, found("done", "r2")],
			]),
			NOW,
		);
		const before = JSON.stringify(plan);
		a.text = "고친 글";
		b.gap = 3;
		ps.reverse();
		ps.push(para("c", "더한 문단"));
		expect(JSON.stringify(plan)).toBe(before);
	});
});

describe("madeOf·forgetFound", () => {
	it("madeOf: 완료면 결과와 성우 이름(보관함에서 빠진 성우는 id), 미확인·표에 없음·빈 문단은 null", () => {
		const a = para("a", "하나");
		const gone = para("b", "둘", {
			voice: { ...typecast, voiceId: "tc_gone" },
		});
		const map = new Map([
			...table([[a, found("done", "r1")]]),
			[sigOf(gone), found("done", "r2")],
		]);
		expect(madeOf(a, work(), VOICES, map, NOW)).toEqual({
			found: found("done", "r1"),
			voiceName: "민지",
		});
		// 보관함에서 빠진 성우도 맞추지 않은 요청으로 찾은 결과를 쓴다(receivePlan과 같다)
		expect(madeOf(gone, work(), VOICES, map, NOW)?.voiceName).toBe("tc_gone");
		expect(
			madeOf(a, work(), VOICES, table([[a, found("unknown")]]), NOW),
		).toBeNull();
		expect(madeOf(a, work(), VOICES, new Map(), NOW)).toBeNull();
		expect(madeOf(para("e", " "), work(), VOICES, map, NOW)).toBeNull();
	});
	it("forgetFound: 그 결과 id 항목만 지우고, 없으면 같은 표", () => {
		const a = para("a", "하나");
		const b = para("b", "둘");
		const map = table([
			[a, found("done", "r1")],
			[b, found("done", "r2")],
			[para("c", "셋"), null],
		]);
		const next = forgetFound(map, "r1");
		expect(next.has(sigOf(a))).toBe(false);
		expect(next.get(sigOf(b))).toEqual(found("done", "r2"));
		expect(next.size).toBe(2);
		expect(forgetFound(map, "r9")).toBe(map);
	});
});

describe("태그만 있는 문단은 빈 문단과 같다(T10 스펙 15.2, blankFor)", () => {
	it("상태·계획·요약·채운 버튼·받기가 같은 판정으로 뺀다", () => {
		const a = para("a", "하나");
		const tags = para("t", " [sighs] <sigh> ");
		const ps = [a, tags];
		const w = work({ paragraphs: ps });
		expect(paragraphStatus(tags, w, VOICES, new Map(), NO_LIVE, NOW)).toBe(
			"empty",
		);
		const plan = makePlan(ps, w, VOICES, table([[a, null]], w), NOW);
		expect(plan.make).toEqual([itemOf(a, 1, w)]);
		expect(plan.firstBlocked).toBeNull();
		expect(plan.blockedCount).toBe(0);
		const made = table([[a, found()]], w);
		expect(summaryOf(ps, w, VOICES, made, NOW)).toMatchObject({
			paragraphs: 1,
			empty: 1,
			made: 1,
			total: 1,
		});
		expect(fillOf([tags], w, true)).toBe("paste");
		expect(receivePlan(ps, w, VOICES, made, NOW)).toMatchObject({
			ok: true,
			items: [{ id: "a", n: 1, gap: 0 }],
		});
	});
});

describe("받기 메뉴 셈(빈 문단 수와 안 만든 문단 수가 같은 판정, blankFor)", () => {
	it("태그만 있는 Typecast 문단은 비지 않은 문단 수에도, 안 만든 문단 수에도 들지 않는다", () => {
		const made = para("a", "하나");
		const unmade = para("b", "둘");
		const tags = para("t", "[sighs]");
		const ps = [made, tags, unmade];
		const w = work({ paragraphs: ps });
		const results = table([[made, found()]], w);
		// 막대의 filled(받기 메뉴 count·someMade)는 summaryOf.paragraphs와 같은 셈이다
		expect(summaryOf(ps, w, VOICES, results, NOW).paragraphs).toBe(2);
		expect(receivePlan(ps, w, VOICES, results, NOW)).toEqual({
			ok: false,
			reason: "unmade",
			unmade: 1,
			firstId: "b",
		});
	});
});
