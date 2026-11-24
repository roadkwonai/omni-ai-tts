// apps/web/src/lib/drama-read.test.ts
import type { ActingLine } from "@tts-pilot-app/api/drama-acting";
import type { DramaModel } from "@tts-pilot-app/api/drama-script";
import type { Preset, PresetValue } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import type { TrialFound } from "@tts-pilot-app/api/providers/trial-contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	type TrialRequest,
	utf8Bytes,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import {
	allPrepared,
	findLines,
	interrupted,
	JOIN_KEY,
	joinPlan,
	joinPlaying,
	lineRequest,
	READ_IDLE,
	type ReadState,
	readKey,
	readPaid,
	readReducer,
	readRequests,
	readSummary,
	soundExt,
} from "./drama-read";
import type { DraftLine, DraftSpeaker } from "./drama-view";
import type { Current } from "./sample-state";

const NOW = Date.parse("2026-10-22T01:00:00.000Z");
// Fish Audio 무료 기간(2026-11-30 0시 KST)이 끝난 뒤
const LATER = FISH_FREE_UNTIL + 24 * 60 * 60 * 1000;

const voice = (
	provider: ProviderId,
	voiceId: string,
	models: Voice["models"] = [],
): Voice =>
	({ provider, source: "public", voiceId, name: voiceId, models }) as Voice;
const keep = (item: Voice): SavedVoice => ({
	id: `s_${item.voiceId}`,
	voice: item,
	favorite: false,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
});
const sp = (
	name: string,
	provider: ProviderId,
	voiceId: string | null,
	presetId: string | null = null,
): DraftSpeaker => ({ name, provider, voiceId, presetId });
const ln = (
	id: string,
	speaker: number,
	text: string,
	direction = "",
	feel?: DraftLine["feel"],
): DraftLine => ({ id, speaker, direction, text, ...(feel ? { feel } : {}) });
const firstValue = (provider: ProviderId) =>
	({ provider, settings: DEFAULT_SETTINGS[provider] }) as PresetValue;

const fish = voice("fish_audio", "f1");
// v21만 있는 성우(감정 넷)
const v21 = voice("typecast", "tc_v21", [
	{ model: "ssfm-v21", emotions: ["normal", "happy", "sad", "angry"] },
]);
// 감정이 보통뿐인 v30 성우
const plain = voice("typecast", "tc_plain", [
	{ model: "ssfm-v30", emotions: ["normal"] },
]);
const eleven = voice("elevenlabs", "el1");
const gemini = voice("gemini", "kore");
const SAVED = [fish, v21, plain, eleven, gemini].map(keep);
const ctx = (
	over: Partial<{
		presets: readonly Preset[] | null;
		saved: readonly SavedVoice[];
		now: number;
	}> = {},
) => ({
	saved: SAVED,
	presets: [] as readonly Preset[] | null,
	headerModel: "s2.1-pro-free" as DramaModel,
	now: NOW,
	...over,
});
// 담은 Fish 성우의 프리셋(말투 태그 excited)
const fishPreset = {
	id: "p1",
	name: "들뜬",
	savedVoiceId: "s_f1",
	voice: fish,
	unavailable: false,
	channelId: null,
	channelDefault: false,
	fixed: [],
	provider: "fish_audio",
	settings: { ...DEFAULT_SETTINGS.fish_audio, tag: "excited" },
} as Preset;

describe("lineRequest(찾기와 만들기가 같은 요청, 성우별 보정)", () => {
	const line = (text: string, more: Partial<ActingLine> = {}): ActingLine => ({
		direction: "",
		text,
		...more,
	});
	it("v21만 있는 Typecast 성우는 모델 v21·직접 감정이다", () => {
		const request = lineRequest(
			v21,
			firstValue("typecast"),
			"typecast_v21",
			line("안녕"),
			NOW,
		);
		expect(request).toMatchObject({
			provider: "typecast",
			voiceId: "tc_v21",
			text: "안녕",
			settings: { model: "ssfm-v21", emotion: "preset", preset: "normal" },
		});
	});
	it("감정이 보통뿐인 성우에 줄 감정 화남을 주면 보통으로 좁힌다(강도는 줄 값)", () => {
		const request = lineRequest(
			plain,
			firstValue("typecast"),
			"typecast_v30",
			line("안녕", { feel: { typecast: { emotion: "angry", intensity: 2 } } }),
			NOW,
		);
		expect(request.settings).toMatchObject({
			model: "ssfm-v30",
			emotion: "preset",
			preset: "normal",
			intensity: 2,
		});
	});
	it("처음 설정 Fish 화자는 무료 기간 뒤 s2.1-pro로 간다", () => {
		const value = firstValue("fish_audio");
		expect(
			lineRequest(fish, value, "fish_s2", line("안녕"), NOW).settings.model,
		).toBe("s2.1-pro-free");
		expect(
			lineRequest(fish, value, "fish_s2", line("안녕"), LATER).settings.model,
		).toBe("s2.1-pro");
	});
	it("지시는 접두로 붙고 프리셋 말투 태그를 비운다", () => {
		const request = lineRequest(
			fish,
			{ provider: "fish_audio", settings: fishPreset.settings } as PresetValue,
			"fish_s2",
			line("안녕", { direction: "화남" }),
			NOW,
		);
		expect(request).toMatchObject({
			text: "[화남] 안녕",
			settings: { tag: "" },
		});
	});
	// 쉼이 요청·서명에 들어가면 저장된 줄을 다시 쓰지 못하고 다시 과금된다(Part 3 Review Focus)
	it("줄 쉼(gap)이 있어도 요청과 서명이 같다", () => {
		const value = firstValue("fish_audio");
		const plainLine = ln("a", 0, "안녕", "화남");
		const gapped: DraftLine = { ...plainLine, gap: 2 };
		const before = lineRequest(fish, value, "fish_s2", plainLine, NOW);
		const after = lineRequest(fish, value, "fish_s2", gapped, NOW);
		expect(after).toEqual(before);
		expect(after).not.toHaveProperty("gap");
		expect(comboSignature(after)).toBe(comboSignature(before));
		const speakers = [sp("민수", "fish_audio", "f1")];
		expect(readRequests(speakers, [gapped], ctx(), "a")).toEqual(
			readRequests(speakers, [plainLine], ctx(), "a"),
		);
	});
});

describe("readRequests(읽을 줄과 막는 이유)", () => {
	it("막는 이유는 화자 성우 → 200자 넘음 → 빈 대사 차례다(줄 차례보다 검사 차례가 먼저)", () => {
		const lines = [
			ln("a", 1, "[sighs] <sigh>"),
			ln("b", 1, "가".repeat(201)),
			ln("c", 0, "안녕"),
		];
		const noVoice = [
			sp("민수", "fish_audio", null),
			sp("지연", "typecast", "tc_v21"),
		];
		expect(readRequests(noVoice, lines, ctx(), "a")).toEqual({
			problem: { kind: "voice", lineId: null, speaker: 0 },
		});
		const speakers = [
			sp("민수", "fish_audio", "f1"),
			sp("지연", "typecast", "tc_v21"),
		];
		expect(readRequests(speakers, lines, ctx(), "a")).toEqual({
			problem: { kind: "long", lineId: "b", speaker: null },
		});
		expect(
			readRequests(
				speakers,
				[lines[0], ln("b", 1, "안녕"), lines[2]],
				ctx(),
				"a",
			),
		).toEqual({ problem: { kind: "empty", lineId: "a", speaker: null } });
	});
	it("고른 줄부터 끝까지만 보고, 그 앞 줄의 문제와 화자는 막지 않는다", () => {
		const speakers = [
			sp("민수", "fish_audio", "f1"),
			sp("지연", "typecast", null),
		];
		const lines = [
			ln("a", 1, "[sighs]"),
			ln("b", 0, "안녕"),
			ln("c", 0, "잘 가"),
		];
		const read = readRequests(speakers, lines, ctx(), "b");
		expect(read).toEqual({
			lines: [
				{ id: "b", speaker: "민수", request: expect.any(Object) },
				{ id: "c", speaker: "민수", request: expect.any(Object) },
			],
		});
		expect(readRequests(speakers, lines, ctx(), "없는 줄")).toEqual({
			lines: [],
		});
	});
	it("보낼 대사는 지시 접두를 넣어 200자까지 통과하고 201자면 막힌다", () => {
		const speakers = [sp("민수", "fish_audio", "f1")];
		// '[화남] '은 5자
		const ok = readRequests(
			speakers,
			[ln("a", 0, "가".repeat(195), "화남")],
			ctx(),
			"a",
		);
		expect(ok).toMatchObject({
			lines: [{ id: "a", request: { text: `[화남] ${"가".repeat(195)}` } }],
		});
		expect(
			readRequests(
				speakers,
				[ln("a", 0, "가".repeat(196), "화남")],
				ctx(),
				"a",
			),
		).toEqual({ problem: { kind: "long", lineId: "a", speaker: null } });
	});
	it("Gemini 말투 지시가 공급자 상한(100자)을 넘으면 그 줄을 막는다", () => {
		const speakers = [sp("민수", "gemini", "kore")];
		expect(
			readRequests(speakers, [ln("a", 0, "안녕", "a".repeat(100))], ctx(), "a"),
		).toMatchObject({ lines: [{ id: "a" }] });
		expect(
			readRequests(speakers, [ln("a", 0, "안녕", "a".repeat(101))], ctx(), "a"),
		).toEqual({ problem: { kind: "long", lineId: "a", speaker: null } });
	});
	it("태그뿐인 Typecast 줄은 보낼 대사가 없다", () => {
		expect(
			readRequests(
				[sp("지연", "typecast", "tc_v21")],
				[ln("a", 0, "[sighs] <sigh> <whisper></whisper>")],
				ctx(),
				"a",
			),
		).toEqual({ problem: { kind: "empty", lineId: "a", speaker: null } });
	});
	it("같은 줄 두 번은 같은 서명이다", () => {
		const read = readRequests(
			[sp("민수", "fish_audio", "f1")],
			[ln("a", 0, "안녕"), ln("b", 0, " 안녕 ")],
			ctx(),
			"a",
		);
		if (!("lines" in read)) throw new Error("막혔다");
		expect(comboSignature(read.lines[0].request)).toBe(
			comboSignature(read.lines[1].request),
		);
	});
	it("프리셋 화자는 그 프리셋 설정으로 읽는다", () => {
		const read = readRequests(
			[sp("민수", "fish_audio", "f1", "p1")],
			[ln("a", 0, "안녕")],
			ctx({ presets: [fishPreset] }),
			"a",
		);
		expect(read).toMatchObject({
			lines: [{ request: { settings: { tag: "excited" } } }],
		});
	});
	it("프리셋 목록을 받지 못했으면 저장된 프리셋이 있는 쓰인 화자에서 막는다(처음 설정으로 유료 호출이 나가지 않게)", () => {
		const speakers = [
			sp("민수", "fish_audio", "f1"),
			sp("지연", "fish_audio", "f1", "p1"),
		];
		expect(
			readRequests(speakers, [ln("a", 1, "안녕")], ctx({ presets: null }), "a"),
		).toEqual({ problem: { kind: "voice", lineId: null, speaker: 1 } });
		// 쓰이지 않은 화자의 프리셋은 막지 않는다
		expect(
			readRequests(speakers, [ln("a", 0, "안녕")], ctx({ presets: null }), "a"),
		).toMatchObject({ lines: [{ id: "a" }] });
		// 목록은 받았는데 프리셋이 지워졌으면 그 성우의 처음 설정으로 읽는다(usableSpeakers)
		expect(
			readRequests(speakers, [ln("a", 1, "안녕")], ctx({ presets: [] }), "a"),
		).toMatchObject({ lines: [{ request: { settings: { tag: "" } } }] });
	});
});

describe("readRequests count(이 줄만 읽기)", () => {
	const speakers = [sp("민수", "fish_audio", "f1")];
	it("count 1이면 fromId 줄 하나만 나오고, 남은 줄 수보다 크면 끝까지 나온다", () => {
		const lines = [ln("a", 0, "하나"), ln("b", 0, "둘"), ln("c", 0, "셋")];
		const one = readRequests(speakers, lines, ctx(), "b", 1);
		expect(one).toMatchObject({ lines: [{ id: "b" }] });
		expect(readRequests(speakers, lines, ctx(), "b", 9)).toMatchObject({
			lines: [{ id: "b" }, { id: "c" }],
		});
	});
	it("뒤 줄이 200자를 넘어도 count 1이면 막히지 않고, count가 없으면 long이다", () => {
		const lines = [ln("a", 0, "하나"), ln("b", 0, "가".repeat(201))];
		expect(readRequests(speakers, lines, ctx(), "a", 1)).toMatchObject({
			lines: [{ id: "a" }],
		});
		expect(readRequests(speakers, lines, ctx(), "a")).toEqual({
			problem: { kind: "long", lineId: "b", speaker: null },
		});
	});
});

describe("readPaid·allPrepared(줄 모음 판정)", () => {
	const linesAt = (now: number, provider: "fish_audio" | "typecast") => {
		const read = readRequests(
			[
				provider === "fish_audio"
					? sp("민수", "fish_audio", "f1")
					: sp("지연", "typecast", "tc_v21"),
			],
			[ln("a", 0, "안녕"), ln("b", 0, "잘 가")],
			ctx({ now }),
			"a",
		);
		if (!("lines" in read)) throw new Error("막혔다");
		return read.lines;
	};
	it("무료 기간 Fish 줄만이면 false, 유료 줄이 있으면 true", () => {
		expect(readPaid(linesAt(NOW, "fish_audio"), NOW)).toBe(false);
		expect(readPaid(linesAt(LATER, "fish_audio"), LATER)).toBe(true);
		expect(readPaid(linesAt(NOW, "typecast"), NOW)).toBe(true);
		expect(readPaid([], NOW)).toBe(false);
		expect(
			readPaid(
				[...linesAt(NOW, "fish_audio"), ...linesAt(NOW, "typecast")],
				NOW,
			),
		).toBe(true);
	});
	it("allPrepared: 빈 줄 false, 하나 빠지면 false, 모두 있으면 true, 같은 서명은 하나로 충분하다", () => {
		const [a, b] = linesAt(NOW, "typecast");
		const sig = (line: typeof a) => comboSignature(line.request);
		expect(allPrepared([], new Set([sig(a)]))).toBe(false);
		expect(allPrepared([a, b], new Set([sig(a)]))).toBe(false);
		expect(allPrepared([a, b], new Set([sig(a), sig(b)]))).toBe(true);
		const same = readRequests(
			[sp("민수", "fish_audio", "f1")],
			[ln("a", 0, "안녕"), ln("b", 0, "안녕")],
			ctx(),
			"a",
		);
		if (!("lines" in same)) throw new Error("막혔다");
		expect(allPrepared(same.lines, new Set([sig(same.lines[0])]))).toBe(true);
	});
});

describe("무료 모델 종료 뒤 같은 성우·글의 무료 줄과 유료 줄", () => {
	const paidPreset = {
		...fishPreset,
		id: "p2",
		settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" },
	} as Preset;
	const read = readRequests(
		[
			sp("민수", "fish_audio", "f1"),
			sp("지아", "fish_audio", "f1", paidPreset.id),
		],
		[ln("a", 0, "안녕"), ln("b", 1, "안녕")],
		ctx({ now: LATER, presets: [paidPreset] }),
		"a",
	);
	if (!("lines" in read)) throw new Error("막혔다");
	const { lines } = read;
	const requests = lines.map((line) => line.request);
	// 서버가 가진 결과(모델마다 하나)
	const server = (...models: string[]) =>
		findLines(lines, async (asked) =>
			asked.map(({ settings: { model } }) =>
				models.includes(model)
					? {
							id: model,
							createdAt: "2026-11-29T00:00:00.000Z",
							usage: { unit: "free", amount: 0 },
						}
					: null,
			),
		);
	const none = new Set<string>();
	it("보낼 요청은 같지만 무료로 찾은 줄의 서명은 무료 요청의 것이라 유료 줄이 무료 소리를 쓰지 않는다", async () => {
		expect(comboSignature(requests[0])).toBe(comboSignature(requests[1]));
		const found = await server("s2.1-pro-free");
		expect(found[0]?.signature).toBe(
			comboSignature(lines[0].before as TrialRequest),
		);
		expect(found[1]).toBeNull();
		expect(readSummary(requests, found, [], none, none, LATER)).toMatchObject({
			reuse: 1,
			make: 1,
			confirm: true,
		});
	});
	it("유료 줄은 자기 결과를 쓴다", async () => {
		const found = await server("s2.1-pro-free", "s2.1-pro");
		expect(found.map((hit) => hit?.id)).toEqual(["s2.1-pro-free", "s2.1-pro"]);
		expect(found[1]?.signature).toBe(comboSignature(requests[1]));
	});
	it("무료 소리를 받은 줄도 준비된 줄이고 유료 줄은 자기 소리가 있어야 한다", () => {
		const free = comboSignature(lines[0].before as TrialRequest);
		expect(allPrepared([lines[0]], new Set([free]))).toBe(true);
		expect(allPrepared(lines, new Set([free]))).toBe(false);
	});
});

describe("readSummary(확인 창 셈)", () => {
	const fishLine = (text: string, now = NOW) =>
		lineRequest(
			fish,
			firstValue("fish_audio"),
			"fish_s2",
			{ direction: "", text },
			now,
		);
	const elevenLine = (text: string) =>
		lineRequest(
			eleven,
			firstValue("elevenlabs"),
			"elevenlabs_tags",
			{ direction: "", text },
			NOW,
		);
	const saved = (id: string): TrialFound => ({
		id,
		createdAt: "2026-10-22T00:00:00.000Z",
		usage: { unit: "free", amount: 0 },
	});
	const none = new Set<string>();
	const sig = (request: TrialRequest) => comboSignature(request);

	it("찾은 줄은 저장된 소리를 쓰고 나머지는 새로 만든다", () => {
		const requests = [fishLine("가"), fishLine("나"), fishLine("다")];
		expect(
			readSummary(
				requests,
				[saved("1"), null, saved("2")],
				[],
				none,
				none,
				NOW,
			),
		).toEqual({ reuse: 2, make: 1, paid: [], confirm: false });
	});
	it("같은 서명 두 줄은 한 번만 만든다", () => {
		const requests = [fishLine("가"), fishLine("가")];
		expect(readSummary(requests, [null, null], [], none, none, NOW)).toEqual({
			reuse: 1,
			make: 1,
			paid: [],
			confirm: false,
		});
	});
	it("만들 서명과 저장된 소리의 합이 줄 수와 같다", () => {
		const requests = [
			fishLine("가"),
			fishLine("나"),
			fishLine("다"),
			fishLine("다"),
			fishLine("라"),
			fishLine("마"),
		];
		const found = [saved("1"), saved("2"), null, null, null, null];
		const { reuse, make } = readSummary(requests, found, [], none, none, NOW);
		expect({ reuse, make }).toEqual({ reuse: 3, make: 3 });
		expect(reuse + make).toBe(requests.length);
	});
	it("이미 받았거나 만드는 중인 서명은 저장된 소리로 센다", () => {
		const requests = [fishLine("가"), fishLine("나")];
		expect(
			readSummary(
				requests,
				[null, null],
				[],
				none,
				new Set([sig(requests[0])]),
				NOW,
			),
		).toMatchObject({ reuse: 1, make: 1 });
	});
	it("무료 기간 뒤 Fish 줄은 유료라 확인 창을 거친다", () => {
		const request = fishLine("안녕", LATER);
		expect(readSummary([request], [null], [], none, none, LATER)).toEqual({
			reuse: 0,
			make: 1,
			paid: [
				{
					provider: "fish_audio",
					lines: 1,
					chars: 2,
					usage: { unit: "byte", amount: utf8Bytes("안녕") },
					rateMissing: false,
				},
			],
			confirm: true,
		});
	});
	it("ElevenLabs 줄은 모델 배율로 크레딧을 합한다", () => {
		const requests = [elevenLine("가나다"), elevenLine("라마"), fishLine("바")];
		expect(
			readSummary(
				requests,
				[null, null, null],
				[{ model: "eleven_v4", multiplier: 2 }],
				none,
				none,
				NOW,
			),
		).toEqual({
			reuse: 0,
			make: 3,
			paid: [
				{
					provider: "elevenlabs",
					lines: 2,
					chars: 5,
					usage: { unit: "credit", amount: 10 },
					rateMissing: false,
				},
			],
			confirm: true,
		});
	});
	it("배율 목록을 받지 못했으면 배율 1로 세고 그 행에 rateMissing을 둔다(T5 '배율을 확인하지 못했어요')", () => {
		const requests = [elevenLine("가나다"), elevenLine("라마")];
		expect(
			readSummary(requests, [null, null], [], none, none, NOW).paid,
		).toEqual([
			{
				provider: "elevenlabs",
				lines: 2,
				chars: 5,
				usage: { unit: "credit", amount: 5 },
				rateMissing: true,
			},
		]);
	});
	it("미확인으로 끝났던 서명을 다시 만들면 무료여도 확인한다. 저장된 소리를 찾았으면 묻지 않는다", () => {
		const request = fishLine("안녕");
		const unknown = new Set([sig(request)]);
		expect(readSummary([request], [null], [], unknown, none, NOW).confirm).toBe(
			true,
		);
		expect(
			readSummary([request], [saved("1")], [], unknown, none, NOW).confirm,
		).toBe(false);
	});
});

describe("readReducer(유료 호출이 늘지 않는 읽기 상태)", () => {
	const finding = readReducer(READ_IDLE, { type: "start", mode: "read" });
	const found = (confirm: boolean) =>
		readReducer(finding, {
			type: "found",
			run: finding.run,
			atId: "a",
			total: 2,
			confirm,
		});
	const reading = found(false);

	it("start는 idle에서만이고 run을 올린다", () => {
		expect(finding).toMatchObject({ phase: "finding", run: 1 });
		expect(reading).toMatchObject({ phase: "reading", atId: "a", total: 2 });
		expect(readReducer(reading, { type: "start", mode: "read" })).toBe(reading);
	});
	it("confirm은 confirm 단계에서 한 번이다", () => {
		const asking = found(true);
		expect(asking.phase).toBe("confirm");
		const once = readReducer(asking, { type: "confirm", run: asking.run });
		expect(once.phase).toBe("reading");
		expect(readReducer(once, { type: "confirm", run: once.run })).toBe(once);
	});
	it("cancel은 확인 창을 닫고 idle로", () => {
		const asking = found(true);
		expect(
			readReducer(asking, { type: "cancel", run: asking.run }),
		).toMatchObject({ phase: "idle", atId: null });
	});
	it("finding 밖의 found는 무시한다", () => {
		expect(
			readReducer(reading, {
				type: "found",
				run: reading.run,
				atId: "b",
				total: 9,
				confirm: true,
			}),
		).toBe(reading);
	});
	it("stop은 어느 단계든 idle이고 run을 올린다. 그 뒤 다시 start할 수 있다", () => {
		const stopped = readReducer(reading, { type: "stop" });
		expect(stopped).toMatchObject({ phase: "idle", run: 2, atId: null });
		expect(readReducer(stopped, { type: "start", mode: "read" })).toMatchObject(
			{
				phase: "finding",
				run: 3,
			},
		);
	});
	it("stop 뒤 같은 run의 늦은 fail은 무시한다", () => {
		const stopped = readReducer(reading, { type: "stop" });
		expect(
			readReducer(stopped, {
				type: "fail",
				run: reading.run,
				lineId: "a",
				problem: { reason: "quota", retryAt: null, providerCode: null },
			}),
		).toBe(stopped);
	});
	it("stop 뒤 새 읽기에서 앞 run의 fail·ended·making은 무시한다", () => {
		const again = readReducer(
			readReducer(readReducer(reading, { type: "stop" }), {
				type: "start",
				mode: "read",
			}),
			{ type: "found", run: 3, atId: "b", total: 1, confirm: false },
		);
		const old = reading.run;
		expect(
			readReducer(again, {
				type: "fail",
				run: old,
				lineId: "b",
				problem: { reason: "quota", retryAt: null, providerCode: null },
			}),
		).toBe(again);
		expect(
			readReducer(again, { type: "ended", run: old, lineId: "b", next: null }),
		).toBe(again);
		expect(readReducer(again, { type: "making", run: old, lineId: "b" })).toBe(
			again,
		);
	});
	it("ended는 다음 줄로 가고 마지막 줄이면 idle이다", () => {
		const next = readReducer(reading, {
			type: "ended",
			run: reading.run,
			lineId: "a",
			next: "b",
		});
		expect(next).toMatchObject({ phase: "reading", atId: "b", done: 1 });
		expect(
			readReducer(next, {
				type: "ended",
				run: next.run,
				lineId: "b",
				next: null,
			}),
		).toMatchObject({ phase: "idle", atId: null, done: 2 });
		// 읽는 줄이 아닌 줄의 끝은 무시한다
		expect(
			readReducer(reading, {
				type: "ended",
				run: reading.run,
				lineId: "z",
				next: null,
			}),
		).toBe(reading);
	});
	it("making은 만드는 줄을 표시하고 fail은 그 줄에서 멈춘다", () => {
		const making = readReducer(reading, {
			type: "making",
			run: reading.run,
			lineId: "b",
		});
		expect(making.makingId).toBe("b");
		// 그 줄을 틀면 만드는 중 표시를 내린다(앞 읽기가 보낸 만들기를 기다린 줄은 앞 run의 끝 표시가 무시된다). 다른 줄을 틀면 그대로
		expect(
			readReducer(making, { type: "playing", run: making.run, lineId: "a" })
				.makingId,
		).toBe("b");
		expect(
			readReducer(making, { type: "playing", run: making.run, lineId: "b" }),
		).toMatchObject({ atId: "b", makingId: null });
		const problem = {
			reason: "in_progress" as const,
			retryAt: null,
			providerCode: null,
		};
		expect(
			readReducer(making, {
				type: "fail",
				run: making.run,
				lineId: "b",
				problem,
			}),
		).toMatchObject({
			phase: "idle",
			atId: null,
			makingId: null,
			failed: { lineId: "b", problem },
		});
		// 새 읽기는 실패 표시를 지운다
		const failed = readReducer(making, {
			type: "fail",
			run: making.run,
			lineId: "b",
			problem,
		});
		expect(
			readReducer(failed, { type: "start", mode: "read" }).failed,
		).toBeNull();
	});
});

describe("readReducer 받기 모드(스펙 16절: 재생 없이 준비, ended = 그 줄을 준비했다)", () => {
	const finding = readReducer(READ_IDLE, { type: "start", mode: "save" });
	const found = (confirm: boolean) =>
		readReducer(finding, {
			type: "found",
			run: finding.run,
			atId: "a",
			total: 3,
			confirm,
		});
	const saving = found(false);
	const problem = {
		reason: "quota" as const,
		retryAt: null,
		providerCode: null,
	};

	it("start의 모드가 남고 찾기·확인을 지나도 그대로다", () => {
		expect(finding).toMatchObject({ phase: "finding", mode: "save", run: 1 });
		expect(saving).toMatchObject({ phase: "reading", mode: "save", atId: "a" });
		const asking = found(true);
		expect(asking).toMatchObject({ phase: "confirm", mode: "save" });
		expect(
			readReducer(asking, { type: "confirm", run: asking.run }),
		).toMatchObject({ phase: "reading", mode: "save" });
	});
	it("ended 셋이면 마지막에 idle이고 done은 줄 수다", () => {
		const b = readReducer(saving, {
			type: "ended",
			run: saving.run,
			lineId: "a",
			next: "b",
		});
		const c = readReducer(b, {
			type: "ended",
			run: b.run,
			lineId: "b",
			next: "c",
		});
		const end = readReducer(c, {
			type: "ended",
			run: c.run,
			lineId: "c",
			next: null,
		});
		expect(c).toMatchObject({ phase: "reading", atId: "c", done: 2 });
		expect(end).toMatchObject({ phase: "idle", atId: null, done: 3 });
	});
	it("받는 중 멈추면 idle, run + 1이고 앞 run의 ended·making·fail은 무시한다", () => {
		const stopped = readReducer(saving, { type: "stop" });
		expect(stopped).toMatchObject({ phase: "idle", run: saving.run + 1 });
		const old = saving.run;
		expect(
			readReducer(stopped, { type: "ended", run: old, lineId: "a", next: "b" }),
		).toBe(stopped);
		expect(
			readReducer(stopped, { type: "making", run: old, lineId: "a" }),
		).toBe(stopped);
		expect(
			readReducer(stopped, { type: "fail", run: old, lineId: "a", problem }),
		).toBe(stopped);
	});
	it("ended는 그 줄의 '만드는 중'을 내리고 다른 줄의 표시는 둔다(받기는 playing을 보내지 않는다)", () => {
		const making = readReducer(saving, {
			type: "making",
			run: saving.run,
			lineId: "a",
		});
		expect(
			readReducer(making, {
				type: "ended",
				run: making.run,
				lineId: "a",
				next: "b",
			}).makingId,
		).toBeNull();
		const other = readReducer(saving, {
			type: "making",
			run: saving.run,
			lineId: "m",
		});
		expect(
			readReducer(other, {
				type: "ended",
				run: other.run,
				lineId: "a",
				next: "b",
			}).makingId,
		).toBe("m");
	});
	it("fail은 idle이고 실패 줄과 이유를 남긴다", () => {
		expect(
			readReducer(saving, {
				type: "fail",
				run: saving.run,
				lineId: "a",
				problem,
			}),
		).toMatchObject({
			phase: "idle",
			atId: null,
			makingId: null,
			failed: { lineId: "a", problem },
		});
	});
	it("새 start는 앞 모드를 남기지 않는다", () => {
		const reading = readReducer(READ_IDLE, { type: "start", mode: "read" });
		expect(reading.mode).toBe("read");
		expect(
			readReducer(readReducer(reading, { type: "stop" }), {
				type: "start",
				mode: "save",
			}).mode,
		).toBe("save");
		expect(
			readReducer(readReducer(saving, { type: "stop" }), {
				type: "start",
				mode: "read",
			}).mode,
		).toBe("read");
		expect(READ_IDLE.mode).toBe("read");
	});
});

describe("interrupted(읽는 중 다른 소리)", () => {
	const reading: ReadState = {
		...READ_IDLE,
		run: 1,
		phase: "reading",
		atId: "a",
		total: 2,
	};
	const now = (
		voiceId: string,
		status: NonNullable<Current>["status"] = "playing",
	): Current => ({
		voiceId,
		name: "1번 줄, 민수",
		noun: "대사",
		owner: null,
		status,
	});

	it("줄 사이(null)와 읽기 키는 끼어듦이 아니다", () => {
		expect(interrupted(null, reading)).toBe("none");
		expect(interrupted(now(readKey("b"), "loading"), reading)).toBe("none");
		expect(interrupted(now(readKey("a")), reading)).toBe("none");
	});
	it("다른 키면 멈춤, 읽는 줄 키가 실패면 실패다", () => {
		expect(interrupted(now("https://cdn.fish.audio/a.mp3"), reading)).toBe(
			"stop",
		);
		expect(interrupted(now(readKey("a"), "failed"), reading)).toBe("fail");
	});
	it("읽는 중이 아니면 늘 none이다", () => {
		for (const phase of ["idle", "finding", "confirm"] as const)
			expect(
				interrupted(now("https://cdn.fish.audio/a.mp3"), {
					...reading,
					phase,
				}),
			).toBe("none");
	});
	it("끝나지 않은 읽는 줄 소리가 사라지면(다른 곳의 player.stop) 멈춤이다. 끝나서 다음 줄로 갔으면 아니다", () => {
		expect(interrupted(null, reading, now(readKey("a")))).toBe("stop");
		expect(
			interrupted(null, { ...reading, atId: "b" }, now(readKey("a"))),
		).toBe("none");
	});
	it("받기 모드는 재생하지 않으므로 다른 소리·사라진 소리·읽기 키 실패 모두 none이다", () => {
		const saving: ReadState = { ...reading, mode: "save" };
		expect(interrupted(now("https://cdn.fish.audio/a.mp3"), saving)).toBe(
			"none",
		);
		expect(interrupted(now(JOIN_KEY), saving)).toBe("none");
		expect(interrupted(null, saving, now(readKey("a")))).toBe("none");
		expect(interrupted(now(readKey("a"), "failed"), saving)).toBe("none");
	});
});

describe("joinPlan(들은 줄과 줄 뒤 쉼)", () => {
	const a = new Blob(["a"]);
	const b = new Blob(["b"]);
	const c = new Blob(["c"]);
	it("줄 쉼이 있으면 그 값, 0이면 0, 없으면 기본 쉼이다", () => {
		expect(
			joinPlan(
				[
					{ lineId: "a", blob: a },
					{ lineId: "b", blob: b },
					{ lineId: "c", blob: c },
				],
				[{ id: "a", gap: 1.5 }, { id: "b", gap: 0 }, { id: "c" }],
				0.3,
			),
		).toEqual([
			{ blob: a, gap: 1.5 },
			{ blob: b, gap: 0 },
			{ blob: c, gap: 0.3 },
		]);
	});
	it("읽은 뒤 지운 줄은 기본 쉼이다", () => {
		expect(
			joinPlan([{ lineId: "gone", blob: a }], [{ id: "b", gap: 2 }], 0.7),
		).toEqual([{ blob: a, gap: 0.7 }]);
	});
	it("들은 순서 그대로다(읽은 뒤 줄을 옮겨도)", () => {
		const plan = joinPlan(
			[
				{ lineId: "a", blob: a },
				{ lineId: "b", blob: b },
			],
			[
				{ id: "b", gap: 2 },
				{ id: "a", gap: 1 },
			],
			0.3,
		);
		expect(plan[0].blob).toBe(a);
		expect(plan[1].blob).toBe(b);
		expect(plan.map((item) => item.gap)).toEqual([1, 2]);
	});
	it("같은 소리를 쓰는 두 줄은 그 소리를 두 번, 받은(대본) 차례로 둔다", () => {
		expect(
			joinPlan(
				[
					{ lineId: "a", blob: a },
					{ lineId: "b", blob: b },
					{ lineId: "c", blob: a },
				],
				[{ id: "a" }, { id: "b", gap: 1 }, { id: "c" }],
				0.3,
			),
		).toEqual([
			{ blob: a, gap: 0.3 },
			{ blob: b, gap: 1 },
			{ blob: a, gap: 0.3 },
		]);
	});
	it("들은 줄이 없으면 빈 목록이다", () => {
		expect(joinPlan([], [{ id: "a", gap: 1 }], 0.3)).toEqual([]);
	});
});

describe("JOIN_KEY·joinPlaying(이어 듣기 재생 키)", () => {
	const now = (
		voiceId: string,
		status: NonNullable<Current>["status"] = "playing",
	): Current => ({
		voiceId,
		name: "읽은 줄",
		noun: "대사",
		owner: null,
		status,
	});
	it("읽기 키가 아니다: 읽는 중에 틀리면 다른 소리(멈춤), 읽지 않을 때는 none", () => {
		const reading: ReadState = {
			...READ_IDLE,
			run: 1,
			phase: "reading",
			atId: "a",
		};
		expect(interrupted(now(JOIN_KEY), reading)).toBe("stop");
		expect(interrupted(now(JOIN_KEY), READ_IDLE)).toBe("none");
	});
	it("불러오는 중·재생 중이면 이어 듣는 중이고, 실패했거나 다른 소리면 아니다", () => {
		expect(joinPlaying(now(JOIN_KEY, "loading"))).toBe(true);
		expect(joinPlaying(now(JOIN_KEY))).toBe(true);
		expect(joinPlaying(now(JOIN_KEY, "failed"))).toBe(false);
		expect(joinPlaying(now(readKey("a")))).toBe(false);
		expect(joinPlaying(null)).toBe(false);
	});
});

describe("soundExt(받기 zip의 줄 파일 확장자)", () => {
	it("WAV(Gemini)는 wav, 그 밖은 mp3", () => {
		expect(soundExt("audio/wav")).toBe("wav");
		expect(soundExt("audio/mpeg")).toBe("mp3");
		expect(soundExt("")).toBe("mp3");
	});
});
