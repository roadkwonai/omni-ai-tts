// apps/web/src/lib/drama-view.test.ts
import {
	ACTING,
	type ActingFamily,
	type Feel,
} from "@tts-pilot-app/api/drama-acting";
import type { DramaItem } from "@tts-pilot-app/api/drama-contract";
import {
	type DramaRequest,
	sceneText,
	TAG_NAMES,
	TAGS,
	takeKey,
} from "@tts-pilot-app/api/drama-script";
import type { Preset, PresetValue } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	type Usage,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import {
	type AutoTagChange,
	actingOf,
	allFish,
	autoTagApply,
	autoTagBlock,
	autoTagChanges,
	autoTagInput,
	autoTagNotes,
	badgeEdit,
	badSpeakerNames,
	barReason,
	castOrder,
	chipStateOf,
	countLine,
	DRAFT_KEY,
	DRAMA_TEXT,
	type Draft,
	type DraftLine,
	type DraftSpeaker,
	dramaBlock,
	dramaModelsOf,
	dramaProblemText,
	feelOptions,
	feelPatch,
	feelText,
	firstEmptySpeaker,
	joinFileName,
	lineFileName,
	lineText,
	modelText,
	newestOf,
	nextSpeaker,
	nextSpeakerName,
	notSplitReason,
	parsePaste,
	pickedTakes,
	readBlockOf,
	readDraft,
	readLineProblemText,
	refocusAfterReload,
	requestOf,
	restorePicks,
	samplingText,
	sceneFileName,
	scriptBlock,
	scriptHead,
	scriptUndo,
	shownFeel,
	speakerNameOf,
	speakerValue,
	speakerVoice,
	splitModelOf,
	splitOk,
	splitWarning,
	stageCaption,
	tagSpans,
	takeGroup,
	takeJoinFileName,
	takeLineOf,
	takeSeconds,
	takeTime,
	takeTitleOf,
	unusableSpeaker,
	usableSpeakers,
	voiceOfSpeaker,
	withoutPicks,
	wrapSpan,
	zipFileName,
	zipNoteOf,
} from "./drama-view";
import { announceOf, failedText, stoppedText } from "./sample-state";
import { trialProblemText } from "./trial-view";

const NOW = Date.parse("2026-10-22T01:00:00.000Z");
// 무료 기간(2026-11-30 0시 KST)과 drama-3 출시가(2026-11-12 0시 KST)가 모두 끝난 뒤
const LATER = Date.parse("2026-12-01T00:00:00+09:00");

// 줄 id를 정해진 순서로 만든다(같은 순서면 같은 초안)
const ids = () => {
	let n = 0;
	return () => `id${++n}`;
};
const sp = (
	name: string,
	voiceId: string | null = null,
	provider: ProviderId = "fish_audio",
	presetId: string | null = null,
): DraftSpeaker => ({ name, provider, voiceId, presetId });
const ln = (
	id: string,
	speaker: number,
	text: string,
	direction = "",
): DraftLine => ({ id, speaker, direction, text });

const fish = (voiceId: string, over: Partial<SavedVoice> = {}): SavedVoice => ({
	id: `s_${voiceId}`,
	voice: {
		provider: "fish_audio",
		source: "public",
		voiceId,
		name: voiceId,
		models: [],
	} as unknown as Voice,
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
const typecast = (voiceId: string): SavedVoice => ({
	...fish(voiceId),
	id: `t_${voiceId}`,
	voice: {
		provider: "typecast",
		source: "public",
		voiceId,
		name: voiceId,
		models: [],
	} as unknown as Voice,
});
// 담은 성우의 프리셋(처음 설정). over로 설정·이용 불가를 바꾼다
const preset = (
	id: string,
	saved: SavedVoice,
	over: Partial<Preset> = {},
): Preset =>
	({
		id,
		name: id,
		savedVoiceId: saved.id,
		voice: saved.voice,
		unavailable: false,
		channelId: null,
		channelDefault: false,
		fixed: [],
		provider: saved.voice.provider,
		settings: DEFAULT_SETTINGS[saved.voice.provider],
		...over,
	}) as Preset;

describe("임시 작업(스펙 2절, client-localstorage-schema)", () => {
	it("처음 값: 화자 1·화자 2, 화자 0의 빈 줄 하나, 무료 기간이면 무료 모델, 고른 테이크 없음, 키에 판", () => {
		expect(DRAFT_KEY).toBe("tts-pilot:drama:v1");
		expect(readDraft(null, ids(), NOW)).toEqual({
			sceneName: "",
			speakers: [sp("화자 1"), sp("화자 2")],
			lines: [ln("id1", 0, "")],
			model: "s2.1-pro-free",
			settings: { speed: 1, temperature: 0.7 },
			picks: {},
			gap: 0.3,
		});
		// 무료 기간이 끝나면 첫 모델은 s2.1-pro
		expect(readDraft(null, ids(), LATER).model).toBe("s2.1-pro");
	});
	it("고를 수 있는 모델: 무료 기간(2026-11-30 0시 KST 전)에만 s2.1-pro-free", () => {
		expect(dramaModelsOf(NOW)).toEqual([
			"s2.1-pro-free",
			"s2.1-pro",
			"drama-3",
		]);
		expect(dramaModelsOf(FISH_FREE_UNTIL - 1)[0]).toBe("s2.1-pro-free");
		expect(dramaModelsOf(FISH_FREE_UNTIL)).toEqual(["s2.1-pro", "drama-3"]);
	});
	it("깨진 값·모양이 다른 값은 처음 값", () => {
		for (const raw of [null, "", "{깨짐", "[1,2]", "3", "null"])
			expect(readDraft(raw, ids(), NOW)).toEqual(readDraft(null, ids(), NOW));
	});
	it("왕복은 그대로이고 줄 id만 새로 만든다. 성우 id는 형식만 보고 목록과 맞추지 않는다", () => {
		const draft: Draft = {
			sceneName: "S03_약속장소",
			speakers: [sp("지연", "fish_gone"), sp("민수", "t1", "typecast", "p1")],
			lines: [
				{ ...ln("old1", 0, "또 늦었네.", "작게"), gap: 1.5 },
				{ ...ln("old2", 1, "미안!"), feel: { airy: { style: "bright" } } },
			],
			model: "drama-3",
			settings: { speed: 1.2, temperature: 0.5 },
			picks: { '{"text":"a"}': { 0: "t1", 3: "t2" } },
			gap: 0.8,
		};
		expect(readDraft(JSON.stringify(draft), ids(), NOW)).toEqual({
			...draft,
			lines: [
				{ ...ln("id1", 0, "또 늦었네.", "작게"), gap: 1.5 },
				{ ...ln("id2", 1, "미안!"), feel: { airy: { style: "bright" } } },
			],
		});
	});
	it("쉼(스펙 15절): 기본 쉼은 0~5초·0.1초 단위로 맞추고 없거나 깨지면 0.3. 줄 쉼은 맞춰 남기고 깨진 줄 쉼은 그 칸만 버린다", () => {
		const read = (stored: Record<string, unknown>) =>
			readDraft(JSON.stringify(stored), ids(), NOW);
		// 쉼 칸이 없는 지금 저장 모양: 기본 0.3, 줄 쉼 없음
		const old = read({ sceneName: "장면A", lines: [ln("x", 0, "가")] });
		expect(old.gap).toBe(0.3);
		expect(old.lines[0]).not.toHaveProperty("gap");
		for (const [stored, gap] of [
			[1.25, 1.3],
			[9, 5],
			[-1, 0],
			["x", 0.3],
			[null, 0.3],
		] as const)
			expect(read({ gap: stored }).gap).toBe(gap);
		const draft = read({
			sceneName: "장면A",
			model: "s2.1-pro",
			gap: 2,
			lines: [
				{ speaker: 0, direction: "작게", text: "가", gap: 9 },
				{ speaker: 0, direction: "", text: "나", gap: 0 },
				{ speaker: 0, direction: "", text: "다", gap: null },
			],
		});
		expect(draft.gap).toBe(2);
		expect(draft.lines).toEqual([
			{ ...ln("id1", 0, "가", "작게"), gap: 5 },
			{ ...ln("id2", 0, "나"), gap: 0 },
			ln("id3", 0, "다"),
		]);
		// 깨진 줄 쉼은 칸이 없다(줄은 살아 있다)
		expect(draft.lines[2]).not.toHaveProperty("gap");
		// 다른 칸은 그대로
		expect(draft.sceneName).toBe("장면A");
		expect(draft.model).toBe("s2.1-pro");
	});
	it("새 칸이 없는 지금 저장 모양({ name, voiceId })은 Fish Audio 화자·프리셋 없음으로 읽는다. 모르는 공급자·깨진 프리셋 id도 처음 값", () => {
		const draft = readDraft(
			JSON.stringify({
				speakers: [
					{ name: "지연", voiceId: "f1" },
					{ name: "민수", provider: "typecast", voiceId: "t1", presetId: "p1" },
					{ name: "셋", provider: "toString", voiceId: null, presetId: 3 },
					{ name: "넷", provider: "airy", voiceId: "a1", presetId: "../x" },
				],
			}),
			ids(),
			NOW,
		);
		expect(draft.speakers).toEqual([
			sp("지연", "f1"),
			sp("민수", "t1", "typecast", "p1"),
			sp("셋"),
			sp("넷", "a1", "airy"),
		]);
	});
	it("줄 감정·말투(feel): 맞는 값은 지키고 깨진 칸·없는 감정 값만 버린다(줄은 살린다)", () => {
		const lineOf = (feel: unknown) =>
			readDraft(
				JSON.stringify({
					lines: [{ speaker: 0, direction: "", text: "가", feel }],
				}),
				ids(),
				NOW,
			).lines[0];
		const plainLine = ln("id1", 0, "가");
		const happy = { emotion: "happy", intensity: 1.5 } as const;
		expect(lineOf({ typecast: happy, airy: { style: "calm" } })).toEqual({
			...plainLine,
			feel: { typecast: happy, airy: { style: "calm" } },
		});
		expect(lineOf({ typecast: { emotion: "smart", intensity: 1 } })).toEqual({
			...plainLine,
			feel: { typecast: { emotion: "smart", intensity: 1 } },
		});
		// 없는 감정·강도 단계 밖·없는 말투는 그 값만 버린다
		expect(
			lineOf({
				typecast: { emotion: "furious", intensity: 1 },
				airy: { style: "calm" },
			}),
		).toEqual({ ...plainLine, feel: { airy: { style: "calm" } } });
		for (const broken of [
			"x",
			3,
			null,
			[],
			{ typecast: "happy" },
			{ typecast: { emotion: "happy", intensity: 1.2 } },
			{ typecast: { emotion: "happy" } },
			{ airy: { style: "loud" } },
		]) {
			const line = lineOf(broken);
			expect(line).toEqual(plainLine);
			// 버린 줄에는 feel 칸이 없다
			expect(line).not.toHaveProperty("feel");
		}
	});
	it("고른 테이크(DN-5): 모양이 하나라도 다르면 빈 값", () => {
		const picks = (value: unknown) =>
			readDraft(JSON.stringify({ picks: value }), ids(), NOW).picks;
		for (const broken of [
			"x",
			[1],
			{ k: "t1" },
			{ k: { a: "t1" } },
			{ k: { "-1": "t1" } },
			{ k: { "1.5": "t1" } },
			{ k: { "50": "t1" } },
			{ k: { 0: 5 } },
			{ good: { 0: "t1" }, bad: null },
		])
			expect(picks(broken)).toEqual({});
		expect(picks({ k: { 0: "t1", 49: "t2" }, j: {} })).toEqual({
			k: { 0: "t1", 49: "t2" },
			j: {},
		});
		// 키 이름이 __proto__여도 프로토타입을 바꾸지 않는다
		const odd = readDraft(
			'{"picks":{"__proto__":{"0":"t1"}}}',
			ids(),
			NOW,
		).picks;
		expect(Object.getPrototypeOf(odd)).toBe(Object.prototype);
		expect(Object.keys(odd)).toEqual(["__proto__"]);
	});
	it("화자 칸 모양이 깨지면(5개·0개·배열 아님·객체 아닌 화자·글 아닌 이름) 화자 칸만 처음 값, 범위 밖이 된 줄 화자는 0", () => {
		const five = Array.from({ length: 5 }, (_, i) => sp(`이름${i}`, "f1"));
		const stored = (speakers: unknown) =>
			JSON.stringify({
				sceneName: "장면A",
				speakers,
				lines: [ln("x", 4, "가"), ln("y", 1, "나")],
				model: "s2.1-pro",
				settings: { speed: 1, temperature: 0.7 },
			});
		for (const speakers of [
			five,
			[],
			"x",
			[sp("지연", "f1"), "x"],
			[sp("지연", "f1"), { name: 3, voiceId: "f2" }],
		]) {
			const draft = readDraft(stored(speakers), ids(), NOW);
			expect(draft.speakers).toEqual([sp("화자 1"), sp("화자 2")]);
			expect(draft.lines.map((line) => line.speaker)).toEqual([0, 1]);
			// 다른 칸은 지킨다
			expect(draft.sceneName).toBe("장면A");
			expect(draft.model).toBe("s2.1-pro");
		}
	});
	it("이름이 빈 화자는 그대로 둔다(성우 id 포함). 막는 이유가 빈 이름을 말한다(Ruling 10)", () => {
		const draft = readDraft(
			JSON.stringify({
				speakers: [sp("지연", "f1"), sp("  ", "f2"), sp("", null)],
				lines: [ln("x", 2, "가")],
			}),
			ids(),
			NOW,
		);
		expect(draft.speakers).toEqual([
			sp("지연", "f1"),
			sp("  ", "f2"),
			sp("", null),
		]);
		expect(draft.lines).toEqual([ln("id1", 2, "가")]);
		expect(
			dramaBlock({
				sceneName: draft.sceneName,
				speakers: draft.speakers.slice(0, 2),
				lines: draft.lines.map((line) => ({ ...line, speaker: 1 })),
				speed: draft.settings.speed,
			}),
		).toEqual({
			text: "화자 2의 이름을 써 주세요",
			target: { kind: "speaker", index: 1 },
		});
	});
	it("원문 상한(계약과 같은 상한 × 4 UTF-16)을 넘는 글도 지운 것 없이 되살린다. 막는 이유가 말하고 요청을 막는다(Ruling 14)", () => {
		const longName = `민수${" ".repeat(79)}`;
		const longText = `가${" ".repeat(1200)}`;
		const longDirection = `지${" ".repeat(240)}`;
		const longScene = `장면${" ".repeat(159)}`;
		const draft = readDraft(
			JSON.stringify({
				sceneName: longScene,
				speakers: [sp("지연", "f1"), sp(longName, "f2")],
				lines: [
					ln("a", 0, longText, longDirection),
					ln("b", 1, "나".repeat(301), "시".repeat(61)),
				],
			}),
			ids(),
			NOW,
		);
		expect(draft.sceneName).toBe(longScene);
		expect(draft.speakers).toEqual([sp("지연", "f1"), sp(longName, "f2")]);
		expect(draft.lines).toEqual([
			ln("id1", 0, longText, longDirection),
			ln("id2", 1, "나".repeat(301), "시".repeat(61)),
		]);
		const block = (over: Partial<Draft>) => {
			const next = { ...draft, ...over };
			return dramaBlock({
				sceneName: next.sceneName,
				speakers: next.speakers,
				lines: next.lines,
				speed: next.settings.speed,
			});
		};
		expect(block({})).toEqual({
			text: "화자 2의 이름을 20자 이하로 줄여 주세요 (지금 81자)",
			target: { kind: "speaker", index: 1 },
		});
		const named = { speakers: [sp("지연", "f1"), sp("민수", "f2")] };
		expect(block(named)).toEqual({
			text: "1번 줄의 대사가 300자를 넘었어요 (지금 1,201자)",
			target: { kind: "line", id: "id1", field: "text" },
		});
		expect(
			block({ ...named, lines: [ln("id1", 0, "가", longDirection)] }),
		).toEqual({
			text: "1번 줄의 지시가 60자를 넘었어요 (지금 241자)",
			target: { kind: "line", id: "id1", field: "direction" },
		});
		expect(block({ ...named, lines: [ln("id1", 0, "가")] })).toEqual({
			text: "장면 이름을 40자 이하로 줄여 주세요 (지금 161자)",
			target: null,
		});
	});
	it("성우 id 형식이 틀리면 그 화자의 성우만 비운다", () => {
		const draft = readDraft(
			JSON.stringify({ speakers: [sp("지연", "../x"), sp("민수", "f_2")] }),
			ids(),
			NOW,
		);
		expect(draft.speakers).toEqual([sp("지연", null), sp("민수", "f_2")]);
	});
	it("줄: 범위 밖·정수 아닌 화자 번호는 0, 글이 아닌 칸은 빈 글, 줄이 없거나 51줄이면 처음 값", () => {
		const draft = readDraft(
			JSON.stringify({
				speakers: [sp("지연"), sp("민수")],
				lines: [
					{ speaker: 2, direction: "작게", text: "가" },
					{ speaker: -1, direction: 3, text: "나" },
					{ speaker: 1.5, text: null },
					{ speaker: "1", direction: "", text: "라" },
					"x",
					{ speaker: 1, direction: "", text: "마" },
				],
			}),
			ids(),
			NOW,
		);
		expect(draft.lines).toEqual([
			ln("id1", 0, "가", "작게"),
			ln("id2", 0, "나"),
			ln("id3", 0, ""),
			ln("id4", 0, "라"),
			ln("id5", 0, ""),
			ln("id6", 1, "마"),
		]);
		for (const lines of [
			[],
			"x",
			Array.from({ length: 51 }, () => ln("z", 0, "가")),
		])
			expect(readDraft(JSON.stringify({ lines }), ids(), NOW).lines).toEqual([
				ln("id1", 0, ""),
			]);
	});
	it("모르는 모델·끝난 무료 모델은 그때의 첫 모델, 설정은 범위로 맞추고(snap) 숫자가 아니면 처음 값", () => {
		const read = (model: unknown, settings: unknown, now: number) =>
			readDraft(JSON.stringify({ model, settings }), ids(), now);
		expect(read("s1", {}, NOW).model).toBe("s2.1-pro-free");
		expect(read("drama-3", {}, NOW).model).toBe("drama-3");
		expect(read("s2.1-pro-free", {}, LATER).model).toBe("s2.1-pro");
		expect(read("x", { speed: 3, temperature: 0.123 }, NOW).settings).toEqual({
			speed: 2,
			temperature: 0.1,
		});
		expect(
			read("x", { speed: "1.5", temperature: Number.NaN }, NOW).settings,
		).toEqual({ speed: 1, temperature: 0.7 });
		expect(read("x", "x", NOW).settings).toEqual({
			speed: 1,
			temperature: 0.7,
		});
	});
	it("장면 이름: 글이 아니면 빈 값", () => {
		const scene = (sceneName: unknown) =>
			readDraft(JSON.stringify({ sceneName }), ids(), NOW).sceneName;
		expect(scene("가".repeat(40))).toBe("가".repeat(40));
		expect(scene(7)).toBe("");
	});
});

describe("쓸 수 있는 성우(렌더할 때 거르기, 계획 리뷰 P4)", () => {
	const voices = [
		fish("f1"),
		fish("f2", { unavailable: true }),
		typecast("t1"),
		// 같은 id를 Typecast로 담았어도 Fish 성우가 아니다
		typecast("same"),
	];
	const speakers = [
		sp("A", "f1"),
		sp("B", "f2"),
		sp("C", "t1"),
		sp("D", "same"),
		sp("E", "gone"),
		sp("F", null),
	];
	it("화자 공급자로 담은 성우이고 이용 가능일 때만 남긴다", () => {
		expect(usableSpeakers(speakers, voices, [])).toEqual([
			sp("A", "f1"),
			sp("B", null),
			sp("C", null),
			sp("D", null),
			sp("E", null),
			sp("F", null),
		]);
		// Typecast 화자는 Typecast로 담은 성우만 쓴다
		expect(
			usableSpeakers(
				[sp("G", "t1", "typecast"), sp("H", "f1", "typecast")],
				voices,
				[],
			),
		).toEqual([sp("G", "t1", "typecast"), sp("H", null, "typecast")]);
	});
	it("프리셋: 없거나(지움) 이용 불가이거나 성우(공급자·id)가 다르면 프리셋만 비운다", () => {
		const presets = [
			preset("p1", typecast("t1")),
			preset("p2", fish("f1"), { unavailable: true }),
			preset("p3", fish("f2")),
			// 같은 id를 Fish로 담은 성우의 프리셋
			preset("p4", fish("t1")),
		];
		expect(
			usableSpeakers(
				[
					sp("A", "t1", "typecast", "p1"),
					sp("B", "t1", "typecast", "gone"),
					sp("C", "f1", "fish_audio", "p2"),
					sp("D", "f1", "fish_audio", "p1"),
					sp("E", "t1", "typecast", "p4"),
					// 성우를 쓸 수 없으면 프리셋도 비운다
					sp("F", "f2", "fish_audio", "p3"),
				],
				voices,
				presets,
			),
		).toEqual([
			sp("A", "t1", "typecast", "p1"),
			sp("B", "t1", "typecast"),
			sp("C", "f1"),
			sp("D", "f1"),
			sp("E", "t1", "typecast"),
			sp("F"),
		]);
	});
	it("받은 목록이 비어도 초안 자체는 바꾸지 않는다(새 배열)", () => {
		const before = structuredClone(speakers);
		const usable = usableSpeakers(speakers, [], []);
		expect(usable.every((speaker) => speaker.voiceId === null)).toBe(true);
		expect(usable).not.toBe(speakers);
		expect(speakers).toEqual(before);
	});
	it("쓸 수 없는 첫 화자(오류 문구의 이름, '스펙과 다른 점' 7)", () => {
		expect(unusableSpeaker([sp("A", "f1"), sp("B", null)], voices)).toBe(1);
		expect(unusableSpeaker([sp("A", "f2"), sp("B", "f1")], voices)).toBe(0);
		expect(unusableSpeaker([sp("A", "same"), sp("B", "f1")], voices)).toBe(0);
		expect(unusableSpeaker([sp("A", "f1"), sp("B", "f1")], voices)).toBeNull();
	});
});

describe("요청 만들기", () => {
	const draft = (speakers: DraftSpeaker[]): Draft => ({
		sceneName: "첫 만남",
		speakers,
		lines: [ln("a", 0, "안녕", "작게"), ln("b", 1, "응")],
		model: "drama-3",
		settings: { speed: 1.2, temperature: 0.5 },
		picks: { k: { 0: "t1" } },
		gap: 0.3,
	});
	it("성우가 모두 있으면 줄 id·고른 테이크를 뺀 계약 모양", () => {
		expect(requestOf(draft([sp("지연", "f1"), sp("민수", "f2")]))).toEqual({
			sceneName: "첫 만남",
			speakers: [
				{ name: "지연", voiceId: "f1" },
				{ name: "민수", voiceId: "f2" },
			],
			lines: [
				{ speaker: 0, direction: "작게", text: "안녕" },
				{ speaker: 1, direction: "", text: "응" },
			],
			model: "drama-3",
			settings: { speed: 1.2, temperature: 0.5 },
		} satisfies DramaRequest);
	});
	it("쓰이는 화자의 성우가 없으면 null", () => {
		expect(requestOf(draft([sp("지연", "f1"), sp("민수", null)]))).toBeNull();
	});
	it("기본 쉼·줄 쉼은 요청에 넣지 않는다(저장 키가 그대로라 저장된 줄을 다시 쓴다, 스펙 15.2)", () => {
		const base = draft([sp("지연", "f1"), sp("민수", "f2")]);
		const request = requestOf({
			...base,
			gap: 2,
			lines: base.lines.map((line) => ({ ...line, gap: 1.5 })),
		});
		expect(request).toEqual(requestOf(base));
		expect(request).not.toHaveProperty("gap");
		for (const line of request?.lines ?? [])
			expect(line).not.toHaveProperty("gap");
	});
	it("쓰이는 화자가 모두 Fish Audio가 아니면 null(장면은 Fish만). 쓰이지 않는 다른 공급자 화자는 빠진다", () => {
		expect(
			requestOf(draft([sp("지연", "f1"), sp("민수", "t1", "typecast")])),
		).toBeNull();
		expect(
			requestOf(
				draft([sp("지연", "f1"), sp("민수", "f2"), sp("셋", "t1", "typecast")]),
			)?.speakers,
		).toEqual([
			{ name: "지연", voiceId: "f1" },
			{ name: "민수", voiceId: "f2" },
		]);
	});
	it("allFish: 쓰인 화자만 본다(쓰이지 않는 Typecast 화자는 상관없다)", () => {
		const speakers = [sp("A", "f1"), sp("B", "t1", "typecast")];
		expect(allFish(speakers, [{ speaker: 0 }, { speaker: 0 }])).toBe(true);
		expect(allFish(speakers, [{ speaker: 0 }, { speaker: 1 }])).toBe(false);
		expect(allFish([sp("A", null, "gemini")], [{ speaker: 0 }])).toBe(false);
	});
	it("쓰이지 않는 화자는 성우가 없어도 빼고 번호를 다시 매긴다", () => {
		const base = draft([sp("지연", "f1"), sp("빈", null), sp("민수", "f2")]);
		expect(
			requestOf({
				...base,
				lines: [ln("a", 0, "안녕"), ln("b", 2, "응")],
			}),
		).toMatchObject({
			speakers: [
				{ name: "지연", voiceId: "f1" },
				{ name: "민수", voiceId: "f2" },
			],
			lines: [
				{ speaker: 0, text: "안녕" },
				{ speaker: 1, text: "응" },
			],
		});
	});
});

describe("요청 만들기: 재번호와 열쇠", () => {
	it("[A, 빈, C]에서 줄 [2, 0]이면 [A, C]·줄 [1, 0]이고 열쇠가 초안과 같다", () => {
		const speakers = [sp("A", "f1"), sp("빈", null), sp("C", "f2")];
		const lines = [ln("a", 2, "가"), ln("b", 0, "나")];
		const request = requestOf({
			sceneName: "",
			speakers,
			lines,
			model: "drama-3",
			settings: { speed: 1, temperature: 0.5 },
			picks: {},
			gap: 0.3,
		});
		expect(request?.speakers.map((s) => s.name)).toEqual(["A", "C"]);
		expect(request?.lines.map((l) => l.speaker)).toEqual([1, 0]);
		if (!request) throw new Error("request");
		expect(takeKey(request)).toBe(
			takeKey({
				speakers: speakers.map((s) => ({
					name: s.name,
					voiceId: s.voiceId ?? "",
				})),
				lines,
			}),
		);
		expect(sceneText(request).referenceIds).toEqual(["f2", "f1"]);
	});
});

describe("채운 성우 고르기", () => {
	it("줄이 쓰는 화자 중 성우 없는 첫 화자만 가리킨다", () => {
		const cards = [sp("A", "f1"), sp("B", null), sp("C", null)];
		expect(firstEmptySpeaker(cards, [1, 0, 1])).toBe(2);
		expect(firstEmptySpeaker(cards, [1, 1, 1])).toBe(1);
		expect(
			firstEmptySpeaker(
				[sp("A", "f1"), sp("B", "f2"), sp("C", null)],
				[1, 1, 0],
			),
		).toBeNull();
	});
});

describe("막는 이유(브리프 8절, 이 순서)", () => {
	// 모든 문제를 한꺼번에 담은 대본에서 앞 문제부터 하나씩 고친다
	const fixed = [
		ln("l1", 0, "한".normalize("NFD").repeat(300)),
		ln("l2", 1, "나".repeat(300)),
		ln("l3", 0, "다"),
		ln("l4", 1, "라", "지".repeat(50)),
		ln("l5", 0, "마"),
		ln("l6", 1, "바".repeat(300)),
		ln("l7", 0, "사".repeat(300)),
		ln("l8", 1, "아".repeat(300)),
		ln("l9", 0, "자".repeat(300)),
		ln("l10", 1, "차".repeat(300)),
	];
	// 고친 줄 id만 고친 값, 나머지 넷(l3·l7·l4·l5)은 문제 값
	const broken = (done: string[]) =>
		fixed.map((line) => {
			if (done.includes(line.id)) return line;
			if (line.id === "l3") return { ...line, text: "  \n " };
			if (line.id === "l7") return { ...line, text: ` ${"사".repeat(312)} ` };
			if (line.id === "l4")
				return { ...line, direction: `  [${"지".repeat(63)}]` };
			if (line.id === "l5") return { ...line, text: "마<|speaker:1|>" };
			return line;
		});
	const voiced = [sp("지연", "f1"), sp("민수", "f2")];
	const all = ["l3", "l7", "l4", "l5"];
	const block = (
		input: {
			speakers?: DraftSpeaker[];
			done?: string[];
			speed?: number;
			sceneName?: string;
		} = {},
	) =>
		dramaBlock({
			sceneName: input.sceneName ?? `장면${"가".repeat(41)}`,
			speakers: input.speakers ?? voiced,
			lines: broken(input.done ?? []),
			speed: input.speed ?? 1,
		});
	it("(섞임 →) 성우 → 이름 빈 → 이름 겹침 → 이름 20자 → 빈 대사 → 300자 → 지시 60자 → <| → 장면 이름 40자 → 상한 → 없음", () => {
		// 이름이 빈 화자가 앞에 있어도 성우 없는 화자가 먼저다
		expect(block({ speakers: [sp("", "f1"), sp("민수")] })).toEqual({
			text: "화자 ‘민수’의 성우를 골라 주세요",
			target: { kind: "speaker", index: 1 },
		});
		expect(
			block({ speakers: [sp("가".repeat(21), "f3"), sp(" ", "f1")] }),
		).toEqual({
			text: "화자 2의 이름을 써 주세요",
			target: { kind: "speaker", index: 1 },
		});
		// 정리 뒤 같은 이름이면 겹친다. 대상은 뒤 화자. 앞 화자의 20자 초과보다 먼저다(화자 순서가 아니라 검사 차례)
		expect(
			block({
				speakers: [
					sp("가".repeat(21), "f3"),
					sp("지연", "f1"),
					sp(" 지연", "f2"),
				],
			}),
		).toEqual({
			text: "같은 이름의 화자가 있어요 (‘지연’)",
			target: { kind: "speaker", index: 2 },
		});
		expect(
			block({ speakers: [sp("가".repeat(23), "f1"), sp("민수", "f2")] }),
		).toEqual({
			text: "화자 1의 이름을 20자 이하로 줄여 주세요 (지금 23자)",
			target: { kind: "speaker", index: 0 },
		});
		expect(block()).toEqual({
			text: "3번 줄의 대사가 비었어요",
			target: { kind: "line", id: "l3", field: "text" },
		});
		// 1번 줄(NFD 900 코드 포인트 = NFC 300자)은 넘지 않는다. 글자는 정리 뒤 값으로 센다
		expect(block({ done: all.slice(0, 1) })).toEqual({
			text: "7번 줄의 대사가 300자를 넘었어요 (지금 312자)",
			target: { kind: "line", id: "l7", field: "text" },
		});
		expect(block({ done: all.slice(0, 2) })).toEqual({
			text: "4번 줄의 지시가 60자를 넘었어요 (지금 63자)",
			target: { kind: "line", id: "l4", field: "direction" },
		});
		expect(block({ done: all.slice(0, 3) })).toEqual({
			text: "5번 줄에 쓸 수 없는 글자(<|)가 있어요",
			target: { kind: "line", id: "l5", field: "text" },
		});
		expect(block({ done: all })).toEqual({
			text: "장면 이름을 40자 이하로 줄여 주세요 (지금 43자)",
			target: null,
		});
		expect(block({ done: all, sceneName: " 첫 만남 " })).toEqual({
			text: "2,000자 이하로 줄여 주세요 (지금 2,153자)",
			target: null,
		});
		// 속도가 느리면 상한이 준다('스펙과 다른 점' 14). 속도 1 이상은 2,000자 그대로
		expect(block({ done: all, sceneName: "", speed: 0.5 })).toEqual({
			text: "속도 0.50배에서는 1,000자 이하로 줄여 주세요 (지금 2,153자)",
			target: null,
		});
		expect(block({ done: all, sceneName: "", speed: 1.5 })?.text).toBe(
			"2,000자 이하로 줄여 주세요 (지금 2,153자)",
		);
		expect(
			dramaBlock({
				sceneName: "가".repeat(40),
				speakers: voiced,
				lines: fixed.slice(0, 6),
				speed: 1,
			}),
		).toBeNull();
	});
	it("섞인 화자(mixed)가 첫 이유다. 성우·이름 검사보다 먼저이고 쓰이지 않는 다른 공급자 화자는 막지 않는다", () => {
		expect(
			dramaBlock({
				sceneName: "",
				speakers: [sp("", null), sp("민수", "t1", "typecast")],
				lines: [ln("a", 0, ""), ln("b", 1, "나")],
				speed: 1,
			}),
		).toEqual({
			text: "다른 공급자 화자가 있어 장면은 만들 수 없어요. 읽기를 쓰세요",
			target: null,
		});
		expect(
			dramaBlock({
				sceneName: "",
				speakers: [...voiced, sp("셋", "t1", "typecast")],
				lines: [ln("a", 0, "가"), ln("b", 1, "나")],
				speed: 1,
			}),
		).toBeNull();
	});
	it("지시 칸의 <|도 막고, 지시에만 있으면 지시 칸을 가리킨다", () => {
		expect(
			dramaBlock({
				sceneName: "",
				speakers: voiced,
				lines: [ln("a", 0, "가"), ln("b", 1, "나", "<|speaker:0|>")],
				speed: 1,
			}),
		).toEqual({
			text: "2번 줄에 쓸 수 없는 글자(<|)가 있어요",
			target: { kind: "line", id: "b", field: "direction" },
		});
	});
	it("원문이 계약 상한(× 4 UTF-16)을 넘으면 정리 뒤 글자가 적어도 막는다(서버 BAD_REQUEST 대신)", () => {
		const ok = [ln("a", 0, "가"), ln("b", 1, "나")];
		const at = (input: Partial<Parameters<typeof dramaBlock>[0]>) =>
			dramaBlock({
				sceneName: "",
				speakers: voiced,
				lines: ok,
				speed: 1,
				...input,
			});
		expect(
			at({ speakers: [sp("지연", "f1"), sp(`민수${" ".repeat(79)}`, "f2")] }),
		).toEqual({
			text: "화자 2의 이름을 20자 이하로 줄여 주세요 (지금 81자)",
			target: { kind: "speaker", index: 1 },
		});
		expect(
			at({ lines: [ln("a", 0, `가${" ".repeat(1200)}`), ok[1] as DraftLine] }),
		).toEqual({
			text: "1번 줄의 대사가 300자를 넘었어요 (지금 1,201자)",
			target: { kind: "line", id: "a", field: "text" },
		});
		expect(
			at({ lines: [ok[0] as DraftLine, ln("b", 1, "나", "[".repeat(241))] }),
		).toEqual({
			text: "2번 줄의 지시가 60자를 넘었어요 (지금 241자)",
			target: { kind: "line", id: "b", field: "direction" },
		});
		expect(at({ sceneName: " ".repeat(161) })).toEqual({
			text: "장면 이름을 40자 이하로 줄여 주세요 (지금 161자)",
			target: null,
		});
		expect(at({ sceneName: " ".repeat(160) })).toBeNull();
	});
	it("대본에 나오는 화자만 성우를 요구한다", () => {
		const three = [sp("지연", "f1"), sp("민수", "f2"), sp("셋", null)];
		const at = (speakers: DraftSpeaker[], lines: DraftLine[]) =>
			dramaBlock({ sceneName: "", speakers, lines, speed: 1 });
		const two = [ln("a", 0, "가"), ln("b", 1, "나")];
		expect(at(three, two)).toBeNull();
		expect(at(three, [...two, ln("c", 2, "다")])).toEqual({
			text: "화자 ‘셋’의 성우를 골라 주세요",
			target: { kind: "speaker", index: 2 },
		});
		expect(
			at(
				[sp("지연", "f1"), sp("민수"), sp("셋")],
				[ln("a", 2, "가"), ln("b", 1, "나")],
			)?.target,
		).toEqual({ kind: "speaker", index: 1 });
		// 이름 검사는 쓰이지 않는 카드도 본다
		expect(
			at([sp("지연", "f1"), sp("민수", "f2"), sp(" ")], two)?.target,
		).toEqual({
			kind: "speaker",
			index: 2,
		});
	});
	it("이름 칸 경고 경계(badSpeakerNames)는 막는 이유의 이름 검사와 같은 기준이다", () => {
		// 빈 이름(정리 뒤)
		expect(badSpeakerNames([sp("지연"), sp("  ")])).toEqual([false, true]);
		// 겹침은 막는 이유가 가리키는 뒤 화자에만(정리 뒤 비교)
		expect(badSpeakerNames([sp("민수"), sp(" 민수 "), sp("지연")])).toEqual([
			false,
			true,
			false,
		]);
		// 20자는 괜찮고 21자(코드 포인트)는 넘친다
		expect(badSpeakerNames([sp("가".repeat(20)), sp("나".repeat(21))])).toEqual(
			[false, true],
		);
		// 원문이 계약의 원문 상한(20 × 4 = 80 UTF-16)을 넘으면 정리 뒤 글자가 적어도 넘친다
		expect(
			badSpeakerNames([
				sp(`민수${" ".repeat(78)}`),
				sp(`지연${" ".repeat(79)}`),
			]),
		).toEqual([false, true]);
	});
});

describe("예상(글자·바이트·사용량)", () => {
	const draft = (model: Draft["model"]): Draft => ({
		sceneName: "",
		speakers: [sp("지연", "f1"), sp("민수", null)],
		lines: [ln("a", 0, " 안녕 ", "[작게]"), ln("b", 1, "응")],
		model,
		settings: { speed: 0.5, temperature: 0.7 },
		picks: {},
		gap: 0.3,
	});
	// 보낼 글: "<|speaker:0|>[작게] 안녕\n<|speaker:1|>응" = 13 + 9 + 6 + 1 + 13 + 3 바이트
	it("글자는 sceneChars, 상한은 속도, 바이트는 화자 표식까지 넣은 보낼 글(성우 없는 화자도 센다)", () => {
		expect(countLine(draft("drama-3"), NOW)).toEqual({
			chars: 5,
			limit: 1000,
			bytes: 45,
			usage: { unit: "usd_micro", amount: 450 } satisfies Usage,
		});
		expect(countLine(draft("drama-3"), LATER).usage).toEqual({
			unit: "usd_micro",
			amount: 2250,
		});
		expect(countLine(draft("s2.1-pro"), NOW).usage).toEqual({
			unit: "usd_micro",
			amount: 675,
		});
		expect(countLine(draft("s2.1-pro-free"), NOW).usage).toEqual({
			unit: "free",
			amount: 0,
		});
	});
	it("예상 줄: 무료면 끝에 무료 끝 날짜(앱이 끊는 전날), 유료면 usageText의 추정 금액", () => {
		expect(DRAMA_TEXT.estimate(1234, 2345, { unit: "free", amount: 0 })).toBe(
			"1,234자 · 2,345바이트 · 무료 · 11월 29일까지",
		);
		expect(
			DRAMA_TEXT.estimate(261, 783, { unit: "usd_micro", amount: 4900 }),
		).toBe("261자 · 783바이트 · 추정 약 $0.0049");
	});
	it("확인 창 근거 줄: drama-3는 출시가 기간(11월 11일까지)과 그 뒤, s2.1-pro는 요금표, 무료는 없음", () => {
		expect(DRAMA_TEXT.basis("drama-3", NOW)).toBe(
			"Drama 3 출시가(100만 바이트당 $10, 11월 11일까지)로 셈한 추정이에요",
		);
		expect(DRAMA_TEXT.basis("drama-3", LATER)).toBe(
			"Drama 3 정가(100만 바이트당 $50)로 셈한 추정이에요",
		);
		expect(DRAMA_TEXT.basis("s2.1-pro", NOW)).toBe(
			"S2.1 Pro 요금(100만 바이트당 $15)으로 셈한 추정이에요",
		);
		expect(DRAMA_TEXT.basis("s2.1-pro-free", NOW)).toBeNull();
	});
	it("나누지 못함 경고('스펙과 다른 점' 13): 지시뿐인 줄, 태그 이름 단어, 보통 대본은 없음", () => {
		expect(splitWarning([{ text: "안녕" }, { text: "[sighs]" }])).toBe(
			"대사 없이 지시만 있는 줄이 있어요. 대사별 파일 없이 장면 파일만 나와요",
		);
		expect(splitWarning([{ text: "Go slow" }])).toBe(
			"대사의 영어 단어에 지시 이름(soft·fast 등)이 들어 있어요. 대사별 파일 없이 장면 파일만 나와요",
		);
		expect(
			splitWarning([
				{ text: "또 늦었네 [sighs]" },
				{ text: "<whisper>미안</whisper>" },
			]),
		).toBeNull();
	});
});

describe("대본 편집 도움", () => {
	it("다음 화자: 두 화자면 번갈아, 끝이면 처음으로", () => {
		expect(nextSpeaker(0, 2)).toBe(1);
		expect(nextSpeaker(1, 2)).toBe(0);
		expect(nextSpeaker(2, 4)).toBe(3);
		expect(nextSpeaker(3, 4)).toBe(0);
		expect(nextSpeaker(0, 1)).toBe(0);
	});
	it("새 화자 이름: 카드 자리(화자 수 + 1)의 '화자 N'부터, 쓰는 이름이면 하나씩 올린다(이름 검사와 같은 정리 뒤 비교)", () => {
		expect(nextSpeakerName([sp("화자 1"), sp("화자 2")])).toBe("화자 3");
		// 이름을 바꾼 화자뿐이어도 카드 자리 번호
		expect(nextSpeakerName([sp("지연"), sp("민수")])).toBe("화자 3");
		// [화자 1, 화자 2] → 추가 → 화자 3 → 화자 2 빼기 → 다시 추가해도 이름이 겹치지 않는다
		const removed = [sp("화자 1"), sp("화자 3")];
		const name = nextSpeakerName(removed);
		expect(name).toBe("화자 4");
		expect(badSpeakerNames([...removed, sp(name)])).toEqual([
			false,
			false,
			false,
		]);
		// 공백·NFD도 이름 검사처럼 정리한 뒤 비교한다
		expect(nextSpeakerName([sp("지연"), sp(" 화자 3 ")])).toBe("화자 4");
		expect(nextSpeakerName([sp("지연"), sp("화자 3".normalize("NFD"))])).toBe(
			"화자 4",
		);
	});
	it("범위 뱃지는 고른 글자를 감싸고 안쪽 글자를 고른다. 빈 범위면 빈 쌍과 가운데 커서", () => {
		expect(wrapSpan("안녕 하세요", 3, 6, "whisper")).toEqual({
			text: "안녕 <whisper>하세요</whisper>",
			start: 12,
			end: 15,
		});
		expect(wrapSpan("안녕", 2, 2, "soft")).toEqual({
			text: "안녕<soft></soft>",
			start: 8,
			end: 8,
		});
	});
	it("뱃지 넣기 범위(브리프 5.5, DN-6): 소리는 커서 자리, 범위는 고른 글자를 감싸고, 분위기는 지시 칸을 덮어쓴다", () => {
		const text = (start: number, end = start) =>
			({ field: "text", start, end }) as const;
		const direction = { field: "direction", start: 1, end: 1 } as const;
		// 소리: 커서 자리에 넣고 커서를 그 뒤로
		expect(badgeEdit("sound", "안녕 하세요", text(3), "[sighs]")).toEqual({
			from: 3,
			to: 3,
			text: "안녕 [sighs] 하세요",
			select: [11, 11],
		});
		// 소리: 고른 글자가 있어도 지우지 않고 그 앞에 넣는다
		expect(
			badgeEdit("sound", "그래 네가 이겼어", text(3, 5), "[sighs]"),
		).toEqual({
			from: 3,
			to: 3,
			text: "그래 [sighs] 네가 이겼어",
			select: [11, 11],
		});
		// 범위: 고른 글자를 감싸고 안쪽 글자를 고른다
		expect(badgeEdit("span", "안녕 하세요", text(3, 6), "whisper")).toEqual({
			from: 3,
			to: 6,
			text: "안녕 <whisper>하세요</whisper>",
			select: [12, 15],
		});
		// 범위: 빈 범위면 빈 쌍을 넣고 커서를 가운데에
		expect(badgeEdit("span", "안녕", text(2), "soft")).toEqual({
			from: 2,
			to: 2,
			text: "안녕<soft></soft>",
			select: [8, 8],
		});
		// 마지막 칸이 지시였으면 소리·범위는 대사 끝(빈 쌍)
		expect(badgeEdit("sound", "안녕", direction, "[sighs]")).toEqual({
			from: 2,
			to: 2,
			text: "안녕[sighs] ",
			select: [10, 10],
		});
		expect(badgeEdit("span", "안녕", direction, "soft")).toEqual({
			from: 2,
			to: 2,
			text: "안녕<soft></soft>",
			select: [8, 8],
		});
		// 분위기: 커서와 상관없이 지시 칸 전체를 바꾸고 커서는 끝(DN-6 덮어쓰기)
		expect(badgeEdit("mood", "작게 한숨 쉬며", text(1), "icy calm")).toEqual({
			from: 0,
			to: 8,
			text: "icy calm",
			select: [8, 8],
		});
		expect(badgeEdit("mood", "", direction, "icy calm")).toEqual({
			from: 0,
			to: 0,
			text: "icy calm",
			select: [8, 8],
		});
		// 글이 줄어 커서가 글 밖이면 끝으로 당긴다
		expect(badgeEdit("sound", "안녕", text(10, 12), "[x]")).toMatchObject({
			from: 2,
			to: 2,
			text: "안녕[x] ",
		});
	});
	it("뱃지 넣기: 바뀐 글은 [from, to) 밖을 그대로 두므로 그 자리에 넣을 글만 바꿔 넣으면 된다(insertText)", () => {
		const cases = [
			["sound", "그래 네가 이겼어", 3, 5],
			["span", "안녕 하세요", 3, 6],
			["span", "", 0, 0],
			["mood", "작게 한숨 쉬며", 2, 4],
		] as const;
		for (const [kind, old, start, end] of cases) {
			const { from, to, text } = badgeEdit(
				kind,
				old,
				{ field: "text", start, end },
				"soft",
			);
			const insert = text.slice(from, text.length - (old.length - to));
			expect(old.slice(0, from) + insert + old.slice(to)).toBe(text);
		}
	});
	it("대사 칸 뒤판: 태그와 글을 차례로 나누고 이으면 원래 글", () => {
		const text = "[sighs] 응 <soft>네</soft>";
		expect(tagSpans(text)).toEqual([
			{ text: "[sighs]", tag: true },
			{ text: " 응 ", tag: false },
			{ text: "<soft>", tag: true },
			{ text: "네", tag: false },
			{ text: "</soft>", tag: true },
		]);
		expect(
			tagSpans(text)
				.map((span) => span.text)
				.join(""),
		).toBe(text);
		// 함께 쓰는 전역 식 TAGS의 lastIndex가 앞 사용(test)으로 남아 있어도 처음부터 모든 태그를 찾는다(Ruling 14)
		TAGS.lastIndex = 0;
		expect(TAGS.test(text)).toBe(true);
		expect(TAGS.lastIndex).toBeGreaterThan(0);
		expect(tagSpans(text).filter((span) => span.tag)).toHaveLength(3);
		expect(tagSpans(text)[0]).toEqual({ text: "[sighs]", tag: true });
		TAGS.lastIndex = 0;
		expect(tagSpans("응")).toEqual([{ text: "응", tag: false }]);
		expect(tagSpans("")).toEqual([]);
		// 닫히지 않은 괄호는 글이다
		expect(tagSpans("a < b [c")).toEqual([{ text: "a < b [c", tag: false }]);
	});
	it("팔레트 값(ACTING.fish_drama): 소리는 태그 전체 글, 범위는 drama-script의 쌍 태그 이름 7종(나누기가 세그먼트에서 지운다)", () => {
		expect(ACTING.fish_drama.sound.map((b) => b.value)).toEqual([
			"[sighs]",
			"[laughs]",
			"[chuckles]",
			"[gasps]",
			"[pause]",
			"[clears throat]",
			"[hesitates]",
		]);
		expect(ACTING.fish_drama.span.map((b) => b.value).sort()).toEqual(
			TAG_NAMES.split("|").sort(),
		);
		expect(ACTING.fish_drama.front[1]).toEqual({
			label: "차갑게 침착",
			value: "icy calm",
		});
	});
});

describe("실행 취소 스냅숏(Ruling 18, 스펙 9절)", () => {
	const before: Draft = {
		...readDraft(null, ids(), NOW),
		sceneName: "S03_약속장소",
		speakers: [sp("지연", "fa_1"), sp("민수", "fa_2")],
		lines: [
			ln("a", 0, "또 늦었네."),
			ln("b", 1, "미안, 미안!"),
			ln("c", 0, "됐어."),
		],
	};
	it("바꾸기 뒤 실행 취소: 바꾸기 전 화자(성우 id 포함)·줄·장면 이름으로, 모델·샘플링·고른 테이크는 지금 값", () => {
		const undo = scriptUndo(before, false);
		// 붙여 넣기 바꾸기: 화자 차례·성우가 바뀌고 새 화자는 성우 없음, 줄도 새것. 그 뒤 모델을 바꿨다
		const after: Draft = {
			...before,
			speakers: [sp("민수", "fa_2"), sp("수아"), sp("지연", "fa_1")],
			lines: [ln("x", 2, "안녕"), ln("y", 1, "응")],
			model: "s2.1-pro",
			picks: { k: { 0: "t1" } },
		};
		expect(undo(after)).toEqual({
			...after,
			sceneName: "S03_약속장소",
			speakers: [sp("지연", "fa_1"), sp("민수", "fa_2")],
			lines: before.lines,
		});
		// 지금 상태를 고쳐 쓰지 않는다
		expect(after.speakers).toHaveLength(3);
	});
	it("줄 지우기 뒤 실행 취소: 지운 줄을 원래 자리에 같은 id로 되살린다", () => {
		const undo = scriptUndo(before, false);
		const after: Draft = {
			...before,
			lines: before.lines.filter((line) => line.id !== "b"),
		};
		expect(undo(after).lines).toEqual([
			ln("a", 0, "또 늦었네."),
			ln("b", 1, "미안, 미안!"),
			ln("c", 0, "됐어."),
		]);
	});
	it("이전 테이크 대본으로 바꾼 뒤 실행 취소: 장면 이름까지 되살린다", () => {
		const undo = scriptUndo(before, true);
		const after: Draft = {
			...before,
			sceneName: "S01",
			speakers: [sp("가", "fa_9")],
			lines: [ln("z", 0, "다른 대본")],
		};
		expect(undo(after)).toEqual(before);
	});
});

describe("대본 붙여 넣기(브리프 5.6 화자 규칙 1~7, Ruling 18)", () => {
	// 지금 화자: 기본 이름(겹치는 이름 없음)과 이름 붙은 화자
	const firsts = [sp("화자 1", "v1"), sp("화자 2", "v2")];
	const named = [sp("지연", "v1"), sp("민수", "v2")];
	it("'이름: 대사'를 나온 순서대로 화자로, 전각 콜론도 이름, 이름 없는 줄은 앞 줄의 화자(규칙 1·2·4)", () => {
		expect(parsePaste("민수: 안녕\n지연：응\n그래", firsts, ids())).toEqual({
			speakers: [sp("민수", "v1"), sp("지연", "v2")],
			lines: [ln("id1", 0, "안녕"), ln("id2", 1, "응"), ln("id3", 1, "그래")],
			from: [0, 1],
		});
	});
	it("같은 이름이 다시 나오면 같은 화자, 이름과 대사 앞뒤 공백은 떼고 대사 속 콜론은 대사다", () => {
		expect(
			parsePaste(
				"민수 :  시간은 12:30이야  \n지연: 응\n민수: 그래",
				firsts,
				ids(),
			),
		).toMatchObject({
			speakers: [sp("민수", "v1"), sp("지연", "v2")],
			lines: [
				ln("id1", 0, "시간은 12:30이야"),
				ln("id2", 1, "응"),
				ln("id3", 0, "그래"),
			],
		});
	});
	it("이름은 글자를 하나 이상 품고 20자 이하: '12:30 회의야'·21자 앞말은 이름 없는 줄", () => {
		const long = "가".repeat(21);
		expect(parsePaste(`12:30 회의야\n${long}: 안녕`, named, ids())).toEqual({
			speakers: named,
			lines: [ln("id1", 0, "12:30 회의야"), ln("id2", 0, `${long}: 안녕`)],
			from: [0, 1],
		});
		// 20자는 이름이다
		expect(parsePaste(`${"가".repeat(20)}: 안녕`, named, ids())).toMatchObject({
			speakers: [{ name: "가".repeat(20) }],
		});
	});
	it("주소 줄(https://…)은 화자가 아니라 이름 없는 줄이다(T10-b 공용 줄 해석)", () => {
		expect(
			parsePaste("https://example.com/a:b\n민수: 안녕", named, ids()),
		).toEqual({
			speakers: [sp("민수", "v2")],
			lines: [ln("id1", 0, "https://example.com/a:b"), ln("id2", 0, "안녕")],
			from: [1],
		});
	});
	it("첫 이름 앞의 이름 없는 줄은 첫 화자(규칙 4)", () => {
		expect(parsePaste("음…\n민수: 안녕", named, ids())).toEqual({
			speakers: [sp("민수", "v2")],
			lines: [ln("id1", 0, "음…"), ln("id2", 0, "안녕")],
			from: [1],
		});
	});
	it("이름이 지금 화자와 같으면 그 화자의 성우를 잇는다(규칙 2)", () => {
		expect(parsePaste("민수: 미안\n지연: 늦었네", named, ids())).toEqual({
			speakers: [sp("민수", "v2"), sp("지연", "v1")],
			lines: [ln("id1", 0, "미안"), ln("id2", 1, "늦었네")],
			from: [1, 0],
		});
	});
	it("이름이 하나라도 겹치면 겹친 이름만 잇는다(규칙 3 뒤 문장)", () => {
		expect(parsePaste("현우: 안녕\n민수: 응", named, ids())).toMatchObject({
			speakers: [sp("현우", null), sp("민수", "v2")],
			from: [null, 1],
		});
	});
	it("겹치는 이름이 없으면 지금 화자의 성우를 순서대로 잇고 남는 새 화자는 성우 없음(규칙 3)", () => {
		expect(
			parsePaste("민수: 하나\n지연: 둘\n현우: 셋", firsts, ids()),
		).toMatchObject({
			speakers: [sp("민수", "v1"), sp("지연", "v2"), sp("현우", null)],
			from: [0, 1, null],
		});
		// 지금 화자에 성우가 없으면 이어도 성우 없음(번호는 그대로 잇는다)
		expect(
			parsePaste("민수: 하나", [sp("화자 1"), sp("화자 2", "v2")], ids()),
		).toMatchObject({ speakers: [sp("민수", null)], from: [0] });
	});
	it("이름이 하나도 없으면 지금 화자를 그대로 두고 모든 줄을 1번 화자로, from은 그대로 잇기(규칙 5)", () => {
		const three = [sp("지연", "v1"), sp("민수", null), sp("현우", "v3")];
		const result = parsePaste("안녕\n그래, 가자", three, ids());
		expect(result).toEqual({
			speakers: three,
			lines: [ln("id1", 0, "안녕"), ln("id2", 0, "그래, 가자")],
			from: [0, 1, 2],
		});
		// 지금 화자 목록을 바꾸지 않는다(replace가 새 배열을 받는다)
		expect("speakers" in result && result.speakers).not.toBe(three);
	});
	it("빈 줄과 대사가 빈 이름 줄('민수:')은 건너뛰고 화자도 만들지 않는다(규칙 6)", () => {
		expect(
			parsePaste("\n민수:\n  \n지연: 응\r\n그래\r\n민수 ：  ", named, ids()),
		).toEqual({
			speakers: [sp("지연", "v1")],
			lines: [ln("id1", 0, "응"), ln("id2", 0, "그래")],
			from: [0],
		});
	});
	it("화자 5명 이상은 too_many_speakers, 4명은 된다(규칙 7)", () => {
		const names = ["가", "나", "다", "라", "마"];
		expect(
			parsePaste(names.map((name) => `${name}: 대사`).join("\n"), named, ids()),
		).toEqual({ error: "too_many_speakers" });
		expect(
			parsePaste(
				names
					.slice(0, 4)
					.map((name) => `${name}: 대사`)
					.join("\n"),
				named,
				ids(),
			),
		).toMatchObject({ from: [0, 1, null, null] });
	});
	it("51줄 이상은 too_many_lines, 50줄은 된다(규칙 7)", () => {
		const lines = (count: number) =>
			Array.from({ length: count }, (_, i) => `줄 ${i + 1}`).join("\n");
		expect(parsePaste(lines(51), named, ids())).toEqual({
			error: "too_many_lines",
		});
		const fifty = parsePaste(lines(50), named, ids());
		expect("lines" in fifty && fifty.lines).toHaveLength(50);
	});
	it("남는 줄이 없으면 empty(규칙 7)", () => {
		for (const raw of ["", "  \n\t\n", "민수:", "민수:\n지연：  "])
			expect(parsePaste(raw, named, ids())).toEqual({ error: "empty" });
	});
	it("대사 301자와 대사 속 태그는 그대로 둔다(자르지 않고 지시를 읽지 않는다, 규칙 7)", () => {
		const long = "가".repeat(301);
		expect(
			parsePaste(
				`민수: ${long}\n지연: [sighs] 그래 <soft>응</soft>`,
				named,
				ids(),
			),
		).toMatchObject({
			lines: [ln("id1", 0, long), ln("id2", 1, "[sighs] 그래 <soft>응</soft>")],
		});
	});
	it("성우를 이을 때 공급자·프리셋도 함께 잇는다. 새 화자는 Fish Audio·성우 없음(Part 2)", () => {
		const mixed = [sp("지연", "t1", "typecast", "p1"), sp("민수", "f2")];
		expect(
			parsePaste("민수: 응\n지연: 그래\n현우: 안녕", mixed, ids()),
		).toMatchObject({
			speakers: [
				sp("민수", "f2"),
				sp("지연", "t1", "typecast", "p1"),
				sp("현우"),
			],
			from: [1, 0, null],
		});
	});
	it("대사 속 줄 구분 문자(U+2028·U+2029)가 있어도 '이름: 대사' 줄이다", () => {
		expect(
			parsePaste("민수: 안녕 하세요\n지연: 응 그래", named, ids()),
		).toEqual({
			speakers: [sp("민수", "v2"), sp("지연", "v1")],
			lines: [ln("id1", 0, "안녕 하세요"), ln("id2", 1, "응 그래")],
			from: [1, 0],
		});
	});
});

describe("화자 성우·설정·연기 값(Part 2)", () => {
	const tcVoice = (models: Voice["models"]): Voice =>
		({ ...typecast("t1").voice, models }) as Voice;
	it("화자 성우와 보이는 이름: 프리셋이면 '프리셋 이름 · 성우 이름', 성우만이면 성우 이름, 쓸 수 없으면 null", () => {
		const voices = [typecast("t1"), fish("f2", { unavailable: true })];
		const presets = [preset("p1", typecast("t1"), { name: "차분한 내레이션" })];
		expect(
			speakerVoice(sp("A", "t1", "typecast", "p1"), voices, presets),
		).toEqual({ voice: voices[0]?.voice, name: "차분한 내레이션 · t1" });
		expect(speakerVoice(sp("A", "t1", "typecast"), voices, presets)).toEqual({
			voice: voices[0]?.voice,
			name: "t1",
		});
		// 지워진 프리셋 id는 성우 이름만
		expect(
			speakerVoice(sp("A", "t1", "typecast", "gone"), voices, presets)?.name,
		).toBe("t1");
		// 이용 불가, 다른 공급자로 담은 같은 id, 성우 없음
		expect(speakerVoice(sp("A", "f2"), voices, presets)).toBeNull();
		expect(speakerVoice(sp("A", "t1"), voices, presets)).toBeNull();
		expect(speakerVoice(sp("A"), voices, presets)).toBeNull();
	});
	it("성우 버튼의 모델 짧은 이름: 드라마 모델은 modelName, 그 밖은 모델 값 그대로", () => {
		expect(modelText("s2.1-pro-free")).toBe("S2.1 Pro Free");
		expect(modelText("drama-3")).toBe("Drama 3");
		expect(modelText("ssfm-v30")).toBe("ssfm-v30");
	});
	it("화자 성우: 화자 공급자로 담은 이용 가능한 성우, 아니면 null", () => {
		const voices = [
			fish("f1"),
			fish("f2", { unavailable: true }),
			typecast("t1"),
		];
		expect(voiceOfSpeaker(sp("A", "t1", "typecast"), voices)).toBe(
			voices[2]?.voice,
		);
		expect(voiceOfSpeaker(sp("A", "f1"), voices)).toBe(voices[0]?.voice);
		// 같은 id를 다른 공급자로 담았거나, 이용 불가이거나, 성우가 없으면 null
		expect(voiceOfSpeaker(sp("A", "t1"), voices)).toBeNull();
		expect(voiceOfSpeaker(sp("A", "f2"), voices)).toBeNull();
		expect(voiceOfSpeaker(sp("A"), voices)).toBeNull();
	});
	it("화자 설정: 프리셋이면 그 공급자·설정 짝, 아니면(없음·지움) 화자 공급자의 처음 설정", () => {
		const settings = {
			...DEFAULT_SETTINGS.typecast,
			model: "ssfm-v21",
			emotion: "preset",
			preset: "sad",
		} as const;
		const presets = [preset("p1", typecast("t1"), { settings })];
		expect(speakerValue(sp("A", "t1", "typecast", "p1"), presets)).toEqual({
			provider: "typecast",
			settings,
		});
		for (const presetId of [null, "gone"])
			expect(
				speakerValue(sp("A", "t1", "typecast", presetId), presets),
			).toEqual({ provider: "typecast", settings: DEFAULT_SETTINGS.typecast });
		expect(speakerValue(sp("A"), [])).toEqual({
			provider: "fish_audio",
			settings: DEFAULT_SETTINGS.fish_audio,
		});
	});
	it("Fish 화자: 모두 Fish면 머리 모델(drama-3 → fish_drama), 섞이면 화자 설정의 모델(fish_s2)", () => {
		const speaker = sp("A", "f1");
		const value = speakerValue(speaker, []);
		const voice = fish("f1").voice;
		expect(actingOf(speaker, voice, value, "drama-3", true)).toEqual({
			family: "fish_drama",
			emotions: null,
			model: "drama-3",
		});
		expect(actingOf(speaker, voice, value, "drama-3", false)).toEqual({
			family: "fish_s2",
			emotions: null,
			model: "s2.1-pro-free",
		});
	});
	it("Typecast 화자: 성우가 가진 모델로 고치고 감정은 그 성우·모델이 받는 값(v30이면 smart를 앞에)", () => {
		const speaker = sp("A", "t1", "typecast");
		const value = speakerValue(speaker, []);
		// v21만 있는 성우는 처음 설정(v30)을 v21로 고친다
		expect(
			actingOf(
				speaker,
				tcVoice([
					{ model: "ssfm-v21", emotions: ["normal", "happy", "sad", "angry"] },
				]),
				value,
				"drama-3",
				false,
			),
		).toEqual({
			family: "typecast_v21",
			emotions: ["normal", "happy", "sad", "angry"],
			model: "ssfm-v21",
		});
		// 감정이 normal뿐인 성우
		expect(
			actingOf(
				speaker,
				tcVoice([{ model: "ssfm-v21", emotions: ["normal"] }]),
				value,
				"drama-3",
				false,
			).emotions,
		).toEqual(["normal"]);
		expect(
			actingOf(
				speaker,
				tcVoice([{ model: "ssfm-v30", emotions: ["normal"] }]),
				value,
				"drama-3",
				true,
			),
		).toEqual({
			family: "typecast_v30",
			emotions: ["smart", "normal"],
			model: "ssfm-v30",
		});
		// 성우가 없으면 설정 모델 그대로, 감정 제한 없음
		expect(actingOf(speaker, null, value, "drama-3", false)).toEqual({
			family: "typecast_v30",
			emotions: null,
			model: "ssfm-v30",
		});
	});
	it("그 밖 공급자: 설정 모델의 family, 감정 제한 없음", () => {
		const at = (provider: ProviderId, model: string) =>
			actingOf(
				sp("A", "x", provider),
				null,
				{
					provider,
					settings: { ...DEFAULT_SETTINGS[provider], model },
				} as PresetValue,
				"drama-3",
				false,
			);
		expect(at("elevenlabs", "eleven_v3")).toEqual({
			family: "elevenlabs_tags",
			emotions: null,
			model: "eleven_v3",
		});
		expect(at("elevenlabs", "eleven_flash_v2_5").family).toBe(
			"elevenlabs_plain",
		);
		expect(at("airy", "airy-tts-v1")).toEqual({
			family: "airy",
			emotions: null,
			model: "airy-tts-v1",
		});
		expect(at("gemini", "gemini-3.8-flash-tts").family).toBe("gemini");
	});
});

describe("줄 감정 칸(Part 2, 브리프 14절 배치 3·7)", () => {
	const tcVoice = (models: Voice["models"]): Voice =>
		({ ...typecast("t1").voice, models }) as Voice;
	const v30 = tcVoice([{ model: "ssfm-v30", emotions: ["normal", "happy"] }]);
	const v21 = tcVoice([
		{ model: "ssfm-v21", emotions: ["normal", "happy", "sad"] },
	]);
	const tcValue = speakerValue(sp("A", "t1", "typecast"), []);
	const airyValue = speakerValue(sp("A", "a1", "airy"), []);
	const labels = (tags: readonly { label: string }[]) =>
		tags.map((tag) => tag.label);
	it("고를 값: 그 family 값 중 성우가 받는 것(actingOf의 emotions), null이면 전부", () => {
		expect(
			labels(feelOptions("typecast_v30", ["smart", "normal", "sad"])),
		).toEqual(["자동", "보통", "슬픔"]);
		expect(labels(feelOptions("typecast_v21", ["normal", "happy"]))).toEqual([
			"보통",
			"기쁨",
		]);
		expect(feelOptions("typecast_v30", null)).toEqual(ACTING.typecast_v30.feel);
		expect(labels(feelOptions("airy", null))).toEqual([
			"기본",
			"밝게",
			"차분하게",
			"속삭임",
		]);
		expect(feelOptions("fish_drama", null)).toEqual([]);
	});
	it("보일 값: 줄 값이 없으면 화자 설정, 있으면 줄 값. 읽기 요청과 같이 성우에 맞춘다", () => {
		expect(shownFeel(v30, tcValue, "typecast_v30", undefined)).toEqual({
			value: "smart",
			intensity: 1,
		});
		expect(
			shownFeel(v30, tcValue, "typecast_v30", {
				typecast: { emotion: "happy", intensity: 1.5 },
			}),
		).toEqual({ value: "happy", intensity: 1.5 });
		// 성우에 없는 감정은 요청처럼 그 성우의 첫 감정으로 맞춘다
		expect(
			shownFeel(v30, tcValue, "typecast_v30", {
				typecast: { emotion: "whisper", intensity: 2 },
			}),
		).toEqual({ value: "normal", intensity: 2 });
		// v21 성우: 처음 설정의 smart는 직접 감정(보통)이다
		expect(shownFeel(v21, tcValue, "typecast_v21", undefined)).toEqual({
			value: "normal",
			intensity: 1,
		});
		// 프리셋 감정·강도(네 단계 밖 강도도 그대로 보인다)
		const preset = {
			provider: "typecast",
			settings: {
				...DEFAULT_SETTINGS.typecast,
				emotion: "preset",
				preset: "happy",
				intensity: 1.3,
			},
		} as const;
		expect(shownFeel(v30, preset, "typecast_v30", undefined)).toEqual({
			value: "happy",
			intensity: 1.3,
		});
		// 성우가 없으면 맞추지 않는다
		expect(shownFeel(null, tcValue, "typecast_v30", undefined)).toEqual({
			value: "smart",
			intensity: 1,
		});
		expect(shownFeel(null, airyValue, "airy", undefined)).toEqual({
			value: "normal",
			intensity: null,
		});
		expect(
			shownFeel(null, airyValue, "airy", { airy: { style: "bright" } }),
		).toEqual({ value: "bright", intensity: null });
		expect(
			shownFeel(null, speakerValue(sp("A", "f1"), []), "fish_s2", undefined),
		).toBeNull();
	});
	it("고르면: 고른 쪽만 바꾸고 다른 공급자 값은 둔다. 강도는 네 단계로 맞춘다", () => {
		const shown = { value: "sad", intensity: 1.3 };
		expect(
			feelPatch("typecast_v30", undefined, shown, { value: "happy" }),
		).toEqual({ typecast: { emotion: "happy", intensity: 1.5 } });
		expect(
			feelPatch("typecast_v30", { airy: { style: "calm" } }, shown, {
				intensity: 2,
			}),
		).toEqual({
			airy: { style: "calm" },
			typecast: { emotion: "sad", intensity: 2 },
		});
		expect(
			feelPatch(
				"typecast_v30",
				undefined,
				{ value: "smart", intensity: 1 },
				{ value: "smart" },
			),
		).toEqual({ typecast: { emotion: "smart", intensity: 1 } });
		const typecastFeel = {
			typecast: { emotion: "angry", intensity: 0.5 },
		} as const;
		expect(
			feelPatch(
				"airy",
				typecastFeel,
				{ value: "normal", intensity: null },
				{ value: "whisper" },
			),
		).toEqual({ ...typecastFeel, airy: { style: "whisper" } });
		// 그 family 값이 아니면 그대로
		expect(
			feelPatch("typecast_v21", typecastFeel, shown, { value: "smart" }),
		).toBe(typecastFeel);
		expect(
			feelPatch("fish_drama", undefined, null, { value: "happy" }),
		).toBeUndefined();
	});
});

describe("파일 이름(스펙 2절)", () => {
	const at = "2026-10-22T01:42:00Z";
	it("장면·대사·모두 받기. 장면 이름 기본값 '장면', 못 쓰는 글자와 공백은 _, 한국 시간, 두 자리 줄 번호", () => {
		expect(sceneFileName("", at)).toBe("장면_장면_20261022-1042.wav");
		expect(sceneFileName("  ", at)).toBe("장면_장면_20261022-1042.wav");
		expect(sceneFileName("첫 만남", at)).toBe("첫_만남_장면_20261022-1042.wav");
		expect(lineFileName("첫 만남/1", 0, "민 수")).toBe(
			"첫_만남_1_01_민_수.wav",
		);
		expect(lineFileName("", 11, "지연")).toBe("장면_12_지연.wav");
		// 받기 zip의 줄 파일은 공급자 형식 그대로(MP3·WAV, 스펙 14.2)
		expect(lineFileName("첫 만남", 2, "지연", "mp3")).toBe(
			"첫_만남_03_지연.mp3",
		);
		expect(zipFileName("첫 만남", at)).toBe("첫_만남_20261022-1042.zip");
		expect(zipFileName("", at)).toBe("장면_20261022-1042.zip");
	});
	it("대본 한 파일(받기)(스펙 15.2): {장면 이름}_읽기_{받은 한국 시간}.wav", () => {
		expect(joinFileName("", "2026-10-23T03:05:00Z")).toBe(
			"장면_읽기_20261023-1205.wav",
		);
		expect(joinFileName("첫 만남", "2026-10-23T03:05:00Z")).toBe(
			"첫_만남_읽기_20261023-1205.wav",
		);
	});
	it("무대 테이크 쉼 넣어 한 파일로(스펙 17.2): {장면 이름}_이음_{무대 테이크 한국 시간}.wav", () => {
		expect(takeJoinFileName("첫 만남", "2026-10-23T03:05:00Z")).toBe(
			"첫_만남_이음_20261023-1205.wav",
		);
		expect(takeJoinFileName("", "2026-10-23T03:05:00Z")).toBe(
			"장면_이음_20261023-1205.wav",
		);
	});
});

describe("테이크 묶기와 줄마다 고르기(E5)", () => {
	const request = (over: Partial<DramaRequest> = {}): DramaRequest => ({
		sceneName: "첫 만남",
		speakers: [
			{ name: "지연", voiceId: "f1" },
			{ name: "민수", voiceId: "f2" },
		],
		lines: [
			{ speaker: 0, direction: "작게", text: "또 늦었네." },
			{ speaker: 1, direction: "", text: "미안!" },
		],
		model: "s2.1-pro-free",
		settings: { speed: 1, temperature: 0.7 },
		...over,
	});
	const spans = (n: number) =>
		Array.from({ length: n }, (_, i) => ({
			start: i,
			end: i + 0.5,
			cutStart: i,
			cutEnd: i + 1,
		}));
	const take = (
		id: string,
		minute: number,
		over: Partial<DramaItem> = {},
	): DramaItem => ({
		id,
		createdAt: new Date(NOW + minute * 60_000).toISOString(),
		usage: { unit: "free", amount: 0 },
		bytes: 1000,
		segments: spans(2),
		status: "done",
		request: request(),
		...over,
	});
	const t1 = take("t1", 1);
	// 모델·샘플링·장면 이름이 달라도 같은 대본
	const t2 = take("t2", 2, {
		request: request({
			model: "drama-3",
			sceneName: "다른 이름",
			settings: { speed: 1.5, temperature: 0.2 },
		}),
	});
	const otherText = take("t3", 3, {
		request: request({
			lines: [
				{ speaker: 0, direction: "작게", text: "또 늦었어." },
				{ speaker: 1, direction: "", text: "미안!" },
			],
		}),
	});
	const unknown = take("t4", 4, { status: "unknown", segments: null });
	const notSplit = take("t5", 5, { segments: null });
	const shortSplit = take("t6", 6, { segments: spans(1) });
	const otherVoice = take("t7", 7, {
		request: request({
			speakers: [
				{ name: "지연", voiceId: "f9" },
				{ name: "민수", voiceId: "f2" },
			],
		}),
	});
	// 서버 목록은 최근 순이다
	const items = [otherVoice, shortSplit, notSplit, unknown, otherText, t2, t1];
	it("나눈 테이크: 완료이고 구간 수 = 줄 수", () => {
		expect([t1, unknown, notSplit, shortSplit].map(splitOk)).toEqual([
			true,
			false,
			false,
			false,
		]);
	});
	it("같은 대본·같은 성우이고 나눈 테이크만, 오래된 순", () => {
		expect(takeGroup(items, t2).map((t) => t.id)).toEqual(["t1", "t2"]);
		expect(takeGroup(items, otherVoice).map((t) => t.id)).toEqual(["t7"]);
		// 나누지 못한 테이크는 자기 그룹에도 없다(화면은 splitOk(shown)으로 칩·모두 받기를 숨긴다, 재리뷰 R2)
		expect(takeGroup(items, notSplit).map((t) => t.id)).toEqual(["t1", "t2"]);
	});
	it("처음 무대(브리프 5.10): 같은 대본의 가장 새 완료 테이크. 미확인은 빼고 나누지 못한 완료는 넣는다", () => {
		const key = takeKey(t1.request);
		// 목록은 최근 순. t6(구간 수가 다름)·t5(구간 없음)는 나누지 못했어도 완료다
		expect(newestOf(items, key)).toBe("t6");
		// 지운 테이크는 빼고 고른다(removeTake)
		expect(newestOf(items, key, "t6")).toBe("t5");
		// 미확인은 무대에 올리지 않는다
		expect(newestOf([unknown, t1], key)).toBe("t1");
		expect(newestOf([unknown], key)).toBeNull();
		// 모델·샘플링·장면 이름은 대본이 아니다. 성우가 다르면 다른 대본이다
		expect(newestOf([otherVoice, t2, t1], key)).toBe("t2");
		expect(newestOf([otherVoice], key)).toBeNull();
		// 같은 대본이 없거나 목록이 비면 null(빈 무대)
		expect(newestOf([otherText], key)).toBeNull();
		expect(newestOf([], key)).toBeNull();
		// 성우 없는 화자(빈 id, 화면의 지금 초안)는 어느 테이크와도 같지 않다
		const noVoice = takeKey({
			speakers: [
				{ name: "지연", voiceId: "" },
				{ name: "민수", voiceId: "f2" },
			],
			lines: t1.request.lines,
		});
		expect(newestOf(items, noVoice)).toBeNull();
	});
	it("줄마다 고른 테이크. 고르지 않았거나 그룹 밖(지운 테이크·다른 대본)이면 무대의 테이크", () => {
		const group = takeGroup(items, t2);
		expect(pickedTakes(group, { 0: "t1" }, t2).map((t) => t.id)).toEqual([
			"t1",
			"t2",
		]);
		expect(
			pickedTakes(group, { 0: "gone", 1: "t3" }, t2).map((t) => t.id),
		).toEqual(["t2", "t2"]);
		expect(pickedTakes(group, {}, t1).map((t) => t.id)).toEqual(["t1", "t1"]);
	});
	it("테이크 칩(브리프 5.10): 줄이 쓰는 테이크의 칩이 고른 값이면 고름, 고른 값이 없으면 무대 따라감, 나머지는 꺼짐", () => {
		const group = takeGroup(items, t2);
		// 줄이 쓰는 테이크(pickedTakes)를 셋째 값으로 넘긴다
		const states = (picks: Record<number, string>, line: number) => {
			const used = pickedTakes(group, picks, t2)[line]?.id ?? "";
			return group.map((take) => chipStateOf(take.id, picks[line], used));
		};
		// 고른 값이 없으면 무대 테이크(t2) 칩이 따라간다
		expect(states({}, 0)).toEqual(["off", "follows"]);
		// 고른 칩만 고름이다
		expect(states({ 0: "t1" }, 0)).toEqual(["picked", "off"]);
		expect(states({ 0: "t1" }, 1)).toEqual(["off", "follows"]);
		// 무대 테이크를 직접 고른 것도 고름이다(picks에 실제 값이 있다)
		expect(states({ 0: "t2" }, 0)).toEqual(["off", "picked"]);
		// 그룹에 없는 값(지운 테이크·다른 대본)은 무대 테이크를 쓰므로 따라감이다
		expect(states({ 0: "gone" }, 0)).toEqual(["off", "follows"]);
	});
	it("'모든 줄을 이 테이크로' 비우기와 실행 취소는 그 대본(takeKey)의 고른 값만 바꾼다", () => {
		const picks = { a: { 0: "t1" }, b: { 1: "t2" } };
		const cleared = withoutPicks(picks, "a");
		expect(cleared).toEqual({ b: { 1: "t2" } });
		// 원본은 그대로다(초안 상태를 고쳐 쓰지 않는다)
		expect(picks).toEqual({ a: { 0: "t1" }, b: { 1: "t2" } });
		// 비운 뒤 다른 대본에서 고른 값은 되살린 뒤에도 남는다
		expect(restorePicks({ ...cleared, c: { 2: "t3" } }, "a", picks.a)).toEqual({
			a: { 0: "t1" },
			b: { 1: "t2" },
			c: { 2: "t3" },
		});
		// 같은 대본에서 비운 뒤 새로 고른 값은 비우기 전 값으로 돌아간다(브리프: 비우기 전 picks로 되돌림, 리뷰 M2)
		expect(restorePicks({ a: { 1: "t9" } }, "a", picks.a)).toEqual({
			a: { 0: "t1" },
		});
		// 비울 값이 없었으면 그대로
		expect(restorePicks(cleared, "z", undefined)).toBe(cleared);
	});
	it("대사 파일이 나오는 모델(나누지 못함 안내의 바꾸기): 무료 모델이 남아 있으면 그것, 끝났으면 S2.1 Pro", () => {
		expect(splitModelOf(FISH_FREE_UNTIL - 1)).toBe("s2.1-pro-free");
		expect(splitModelOf(FISH_FREE_UNTIL)).toBe("s2.1-pro");
	});
});

describe("오류 문구(브리프 8절)", () => {
	const problem = (
		reason: string,
		extra: { retryAt?: string; providerCode?: string } = {},
	) =>
		({
			reason,
			retryAt: extra.retryAt ?? null,
			providerCode: extra.providerCode ?? null,
		}) as Parameters<typeof dramaProblemText>[0];
	it("402: API 크레딧 문구와 바깥 링크", () => {
		expect(dramaProblemText(problem("quota"), null)).toEqual({
			text: "Fish Audio API 크레딧이 부족해요. API 크레딧은 웹 플랜 크레딧과 따로예요",
			connections: false,
			fishCredit: true,
		});
		expect(DRAMA_TEXT.fishCreditUrl).toBe("https://fish.audio/app/billing");
		expect(DRAMA_TEXT.fishCreditLink).toBe(
			"Fish Audio에서 API 크레딧 충전하기",
		);
	});
	it("쓸 수 없는 성우: 화면이 찾은 화자 이름, 못 찾으면 이름 없이('스펙과 다른 점' 7)", () => {
		expect(dramaProblemText(problem("voice_unavailable"), "민수").text).toBe(
			"화자 ‘민수’의 성우를 쓸 수 없어요. 다시 골라 주세요",
		);
		expect(dramaProblemText(problem("voice_unavailable"), null).text).toBe(
			"성우를 쓸 수 없는 화자가 있어요. 다시 골라 주세요",
		);
	});
	it("처리 여부 미확인은 '이전 테이크 보기'를 붙이고 다시 누르라고 하지 않는다", () => {
		const view = dramaProblemText(problem("unknown_outcome"), null);
		expect(view).toEqual({
			text: "처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 다시 누르기 전에 이전 테이크를 확인해 주세요",
			connections: false,
			takes: true,
		});
		expect(
			dramaProblemText(problem("in_progress"), null).takes,
		).toBeUndefined();
	});
	it("드라마 문구: 진행 중·대기 시각·무료 끝·너무 큰 결과·저장소·알 수 없는 실패", () => {
		expect(dramaProblemText(problem("in_progress"), null).text).toBe(
			"다른 생성이 진행 중이에요. 끝난 뒤 다시 눌러 주세요",
		);
		expect(
			dramaProblemText(
				problem("rate_limit", {
					retryAt: new Date(NOW + 60_000).toISOString(),
				}),
				null,
			).text,
		).toMatch(/이후에 다시 만들 수 있어요$/);
		expect(dramaProblemText(problem("free_ended"), null)).toEqual({
			text: "Fish Audio 무료 모델 기간이 끝났어요. 모델을 다시 골라 주세요",
			connections: false,
		});
		expect(
			dramaProblemText(
				problem("provider_input", { providerCode: "audio_too_large" }),
				null,
			).text,
		).toBe("결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요");
		expect(dramaProblemText(problem("storage"), null).text).toBe(
			"지금은 장면을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
		);
		expect(dramaProblemText(problem("unexpected"), null).text).toBe(
			"장면을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
		);
	});
	it("나머지는 T5 Fish Audio 문구(키 문제는 '연결 상태 보기', 계획 리뷰 P2)", () => {
		for (const reason of [
			"no_key",
			"provider_auth",
			"provider_error",
			"rate_limit",
		])
			expect(dramaProblemText(problem(reason), null)).toEqual(
				trialProblemText("fish_audio", problem(reason)),
			);
		expect(dramaProblemText(problem("no_key"), null)).toMatchObject({
			text: expect.stringMatching(/^Fish Audio 키가/),
			connections: true,
		});
		expect(
			dramaProblemText(problem("provider_input", { providerCode: "bad" }), null)
				.text,
		).toBe("Fish Audio가 이 요청을 받지 않았어요. bad");
	});
});

describe("드라마 문구(브리프 8절 정본)", () => {
	it("세션 만료 안내는 공용 SignInNotice라 화면별 '이 주소' 제목이 없다", () => {
		const addressTitles = Object.values(DRAMA_TEXT).filter(
			(value) => typeof value === "string" && value.includes("이 주소"),
		);
		expect(addressTitles).toEqual([]);
	});

	it("글 키는 8절 표 그대로", () => {
		expect(DRAMA_TEXT).toMatchObject({
			title: "드라마 작업실",
			description: "화자마다 성우를 붙이고 대본을 연기시켜요.",
			sceneName: "장면 이름",
			scenePlaceholder: "장면",
			model: "모델",
			modelLabel: {
				"s2.1-pro-free": "S2.1 Pro Free",
				"s2.1-pro": "S2.1 Pro · 유료",
				"drama-3": "Drama 3 · 유료",
			},
			speakers: "화자",
			speakersHelp: "대본에 나오는 화자만 장면에 들어가요 · 최대 4명",
			pickVoice: "성우 고르기",
			removeTip: "빼기",
			removeLast: "화자는 1명 이상이어야 해요.",
			addSpeaker: "화자 추가",
			speakersFull: "화자는 4명까지예요",
			voicesFailed: "담은 성우를 불러오지 못했어요",
			reload: "다시 불러오기",
			pickerDescription:
				"담은 성우나 프리셋, 공급자 전체에서 골라요. 전체에서 고르면 성우 보관함에도 담겨요.",
			source: "성우 출처",
			savedTab: "담은 성우",
			allTab: "전체",
			toAll: "전체에서 고르기",
			toCasting: "성우 캐스팅에서 담기",
			savedToLibrary: "성우 보관함에도 담았어요.",
			voiceUnusable: "이 성우는 지금 쓸 수 없어요. 다른 성우를 골라 주세요.",
			close: "닫기",
			script: "대본",
			textPlaceholder: "대사",
			moveUp: "위로",
			moveDown: "아래로",
			insertDirection: "연기 지시 넣기",
			removeLine: "지우기",
			lastLine: "줄은 1개 이상이어야 해요",
			undo: "실행 취소",
			addLine: "줄 추가",
			paste: "대본 붙여 넣기",
			linesFull: "줄은 50개까지예요",
			enterHelp:
				"대사 칸에서 Enter를 누르면 바로 아래에 다음 화자의 새 줄이 생겨요",
			multiLinePasted:
				"여러 줄을 한 줄로 합쳤어요. 줄마다 나누려면 대본 붙여 넣기를 써 주세요.",
			pasteDescription:
				"‘이름: 대사’ 줄을 화자와 줄로 바꿔요. 이름이 없는 줄은 앞 줄의 화자가 이어 말해요.",
			pasteLabel: "붙여 넣을 대본",
			pastePlaceholder:
				"지연: 또 늦었네. 삼십 분이나 기다렸어.\n민수: 미안, 미안! 지하철이 갑자기 멈춰 버렸어.",
			pasteNoVoice: "성우 없음, 바꾼 뒤 골라 주세요",
			pasteTooManySpeakers: "화자는 4명까지예요. 이름을 4개 이하로 줄여 주세요",
			pasteTooManyLines: "줄은 50개까지예요. 50줄 이하로 줄여 주세요",
			pasteEmpty: "붙여 넣은 글에 대사가 없어요",
			replace: "바꾸기",
			cancel: "취소",
			palette: "연기 지시",
			soundGroup: "소리 · 커서 위치에",
			spanGroup: "범위 · 고른 글자를 감싸요",
			moodGroup: "분위기 · 그 줄의 지시 칸에",
			howTo: "지시 쓰는 법",
			howToDot: "점 태그: `그래 [sighs] 네가 이겼어.`",
			howToSpan:
				"범위 태그: `약속해 <whisper>아무한테도 말 안 한다고</whisper>.`",
			howToLine:
				"줄 지시: 지시 칸에 `icy calm` 또는 `작게 한숨 쉬며`. 어떤 말로 써도 되고 소리로 읽지 않아요.",
			howToNote: "한국어 지시와 영어 지시 중 무엇이 나은지는 들어 보고 정해요.",
			barLabel: "장면 만들기",
			make: "장면 만들기",
			makePaid: "장면 만들기, 크레딧 사용",
			makeFree: "장면 만들기, 무료",
			makingStatus: "장면을 연기하는 중이에요",
			waitNote: "공급자 응답을 기다리고 있어요. 다시 누르지 않아도 돼요",
			sampling: "샘플링",
			samplingDescription:
				"테이크마다 연기가 달라져요. 바꾼 값은 다음에 만드는 테이크부터 써요.",
			temperature: "연기 변화",
			temperatureNote: "높을수록 테이크마다 연기가 더 달라져요",
			speed: "속도",
			reset: "처음 값으로",
			toStage: "무대 보기",
			confirmTitle: "크레딧을 써서 장면을 만들까요?",
			confirmCredit:
				"Fish Audio API 크레딧이 쓰여요. API 크레딧은 웹 플랜 크레딧과 따로예요.",
			confirmScene: "장면",
			confirmScript: "대본",
			confirmSpeakers: "화자",
			confirmModel: "모델",
			confirmEstimate: "예상",
			drama3Warning:
				"Drama 3는 대사별 시각 정보를 주지 않을 수 있어요. 그러면 대사별 파일 없이 장면 파일만 받아요",
			unknownRetry:
				"같은 대본의 앞 요청은 처리 여부를 아직 몰라요. 다시 만들면 크레딧이 한 번 더 쓰일 수 있어요",
			confirmMake: "크레딧 쓰고 만들기",
			fishCreditLink: "Fish Audio에서 API 크레딧 충전하기",
			fishCreditUrl: "https://fish.audio/app/billing",
			toFreeModel: "무료 모델로 바꾸기",
			modelNote: {
				"s2.1-pro-free": "대사별 파일도 나와요",
				"s2.1-pro": "대사별 파일도 나와요",
				"drama-3": "장면 파일만 나올 수 있어요",
			},
			newWindow: "(새 창)",
			toSplitModel: "대사 파일이 나오는 모델로 바꾸기",
			followAll: "모든 줄을 이 테이크로",
			followedAll: "모든 줄을 무대의 테이크로 맞췄어요.",
			lineNoun: "대사",
			stage: "무대",
			stageGenerating: "새 테이크를 연기하는 중이에요",
			receivingScene: "장면을 받는 중이에요",
			sceneFailed:
				"장면을 받지 못했어요. 잠시 뒤 다시 받아 주세요. 크레딧은 들지 않아요",
			retryReceive: "다시 받기",
			prevTake: "앞 테이크",
			nextTake: "다음 테이크",
			receivingShort: "받는 중",
			downloadFailed:
				"받지 못했어요. 잠시 뒤 다시 해 주세요. 크레딧은 들지 않아요.",
			otherScript: "지금 대본과 다른 테이크예요",
			restoreScript: "이 테이크의 대본으로 되돌리기",
			restored: "테이크의 대본으로 되돌렸어요.",
			notSplit: "대사별로 나누지 못했어요. 장면 파일은 받을 수 있어요",
			notSplitDrama3:
				"Drama 3는 대사별 시각 정보를 주지 않을 수 있어요. 대사 파일이 필요하면 S2.1 Pro 계열 모델로 만들어 보세요",
			notSplitNoText: "대사 없이 지시만 있는 줄이 있어서 나누지 않았어요",
			notSplitTagWord:
				"대사의 영어 단어에 지시 이름이 들어 있어서 나누지 않았어요",
			notSplitMismatch:
				"읽은 글자가 대본과 맞지 않았어요. 지시나 숫자를 대본과 다르게 읽었을 수 있어요",
			made: "장면을 만들었어요.",
			notFound: "이미 지워졌거나 찾을 수 없어요.",
			takes: "이전 테이크",
			takesFailed: "이전 테이크를 불러오지 못했어요",
			toTakes: "이전 테이크 보기",
			putOnStage: "무대에 올리기",
			onStageBadge: "무대에 있음",
			otherScriptBadge: "다른 대본",
			notSplitBadge: "나누지 못함",
			unknownBadge: "처리 여부 미확인",
			unknownUsage: "사용 여부 미확인",
			unknownExpired:
				"확인 시간이 지났어요. 크레딧 사용 여부는 Fish Audio 사용 기록에서 확인해 주세요",
			takesCap: "최근 20개까지 보여요",
			remove: "지우기",
			removeQuestion: "이 테이크를 지울까요?",
			removeDetail:
				"지우면 이 테이크를 다시 듣거나 받을 수 없어요. 공급자 사용 기록은 그대로예요.",
			removing: "지우는 중이에요",
			removed: "테이크를 지웠어요.",
			removeFailed: "지우지 못했어요. 잠시 뒤 다시 해 주세요.",
		});
		// 767px 이하 '지시' 버튼을 없앴다(칩 줄에 지시 칸이 늘 있다)
		expect(DRAMA_TEXT).not.toHaveProperty("addDirection");
		expect(DRAMA_TEXT).not.toHaveProperty("addDirectionLabel");
		// 쓰는 곳이 없던 키(ponytail 8): 주 버튼은 makingFor, 미확인 셋째 줄은 음성 작업실 문구(STUDIO_TEXT.unknownNote)를 같이 쓴다
		for (const key of ["freeUntil", "making", "unknownNote"])
			expect(DRAMA_TEXT).not.toHaveProperty(key);
	});
	it("자리 값이 있는 키는 8절 예 그대로", () => {
		const t = DRAMA_TEXT;
		expect([
			t.speakerName(3),
			t.nameLabel(1),
			t.removeSpeaker(2),
			t.removeLocked(3),
			t.pickerTitle("민수"),
			t.usedBy("지연"),
			t.count(6, 261, 2000),
			t.lineSpeaker(3, "지연"),
			t.directionLabel(4),
			t.textLabel(3),
			t.fieldCount(251, 300),
			t.lineMenu(3),
			t.lineRemoved(3),
			t.pasteSummary(6, 2),
			t.pasteCarried("효정2"),
			t.pasteReplaceNote(6),
			t.replaced(6, 2),
			t.samplingSummary("속도 1.20배"),
			t.sceneSummary("S03_약속장소", 6, 261),
			t.castPair("지연", "효정2"),
			t.takeCaption(2, 3, "10:42", "Drama 3", 18.3),
			t.zipNote(6),
			t.zipMixed([1, 2]),
			t.playLine(3, "지연"),
			t.stopLine(3, "지연"),
			t.takeChip(2, "10:42", "Drama 3"),
			t.takeTitle("S03_약속장소", "또 늦었네."),
			t.takeLine("3분 전", "Drama 3", ["지연", "민수"], 18.3, {
				unit: "usd_micro",
				amount: 3200,
			}),
			t.removedPicked(2),
			t.modelSwitched("S2.1 Pro Free"),
		]).toEqual([
			"화자 3",
			"화자 1 이름",
			"화자 2 빼기",
			"이 화자의 줄이 3개 있어요. 줄을 지우거나 다른 화자로 바꾼 뒤에 뺄 수 있어요.",
			"화자 ‘민수’의 성우 고르기",
			"지연도 쓰는 중",
			"6줄 · 261 / 2,000자",
			"3번 줄 화자, 지연",
			"4번 줄 연기 지시",
			"3번 줄 대사",
			"251 / 300자",
			"3번 줄 메뉴",
			"3번 줄을 지웠어요.",
			"6줄 · 화자 2명",
			"성우 이어 씀 · 효정2",
			"바꾸면 지금 대본 6줄이 이 글로 바뀌어요",
			"대본을 바꿨어요. 6줄, 화자 2명.",
			"샘플링 · 속도 1.20배",
			"S03_약속장소 · 6줄 · 261자",
			"지연 → 효정2",
			"테이크 2 / 3 · 10:42 · Drama 3 · 18.3초",
			"대사별 파일: 장면 1 + 대사 6",
			" · 대사는 테이크 1·2에서",
			"3번 줄 지연 듣기",
			"3번 줄 지연 정지",
			"테이크 2 · 10:42 · Drama 3",
			"S03_약속장소 · 또 늦었네.",
			"3분 전 · Drama 3 · 지연·민수 · 18.3초 · 추정 약 $0.0032",
			"테이크를 지웠어요. 이 테이크를 고른 줄 2개는 무대의 테이크로 받아요.",
			"모델을 S2.1 Pro Free로 바꿨어요.",
		]);
	});
	it("Part 2 문구는 14절 표 그대로(글 키와 자리 값 키)", () => {
		const t = DRAMA_TEXT;
		expect(t).toMatchObject({
			mixedBlock:
				"다른 공급자 화자가 있어 장면은 만들 수 없어요. 읽기를 쓰세요",
			read: "읽기",
			readFrom: "이 줄부터 읽기",
			readAgainFrom: "이 줄부터 다시 읽기",
			makingNow: "만드는 중",
			noDirection: "이 성우는 지시를 받지 않아요",
			noTags: "이 성우는 연기 태그를 받지 않아요",
			feelLabel: "감정",
			intensityLabel: "강도",
			intensityAuto: "감정이 자동이면 강도는 쓰지 않아요",
			styleLabel: "말투",
			presetTab: "프리셋",
			providerPick: "공급자",
			readConfirmTitle: "새로 만들 줄이 있어요",
			readConfirmGo: "읽기",
			autoTag: "전체 자동 태그",
			autoTagTitle: "대본을 보내 연기 값을 제안받을까요?",
			autoTagBody:
				"OpenAI 텍스트 모델(gpt-6-luna)로 대본을 보내요. 3번 실패하면 Gemini(gemini-3.8-flash)로 보내요. 예상 약 $0.01. Gemini 키가 무료 등급이면 Google이 보낸 대본을 학습에 쓸 수 있어요",
			autoTagGo: "제안 받기",
			autoTagPreviewTitle: "자동 태그 제안",
			autoTagNone: "바꿀 값이 없어요",
			autoTagApply: "모두 바꾸기",
		});
		expect([
			t.readStop(3, 12),
			t.readAnnounce(3, "지연"),
			t.readConfirmBody(2, 1005),
			t.readConfirmRow("gemini", 2, 1234, { unit: "usd_micro", amount: 3200 }),
			t.readVoiceBlock("민수"),
			t.readLongBlock(4),
			t.readEmptyBlock(5),
			t.autoTagLong(2153),
			t.autoTagSkipped(3),
			t.autoTagChanged(2),
			t.autoTagApplied(7),
		]).toEqual([
			"멈춤 · 3/12줄",
			"3번 줄, 지연",
			"2줄을 새로 만들고 1,005줄은 저장된 소리를 써요",
			"Gemini · 2줄 · 1,234자 · 추정 약 $0.0032",
			"화자 ‘민수’의 성우를 골라 주세요",
			"4번 줄이 읽기 상한 200자를 넘어요(지시 포함)",
			"5번 줄은 보낼 대사가 없어요(태그만 있어요)",
			"대본이 2,000자를 넘어 자동 태그를 쓸 수 없어요 (지금 2,153자)",
			"연기 값을 받지 않는 성우의 줄 3개는 그대로 둬요",
			"보낸 뒤 고친 줄 2개는 건너뛰었어요",
			"줄 7개를 바꿨어요 (실행 취소 10초)",
		]);
	});
	it("Part 3 문구는 15절 표 그대로(받기·카드 쉼 칸은 16절 값)", () => {
		const t = DRAMA_TEXT;
		expect(t).toMatchObject({
			gapUnit: "초",
			gapHelp: "0~5초, 0.1초 단위. 한 파일로 받을 때 줄 사이에 넣어요",
			gapReset: "기본으로",
			joinPlay: "이어 듣기",
			joinStop: "이어 듣기 멈춤",
			joinSave: "한 파일로 받기 (WAV)",
			readZip: "줄마다 받기 (zip)",
			joinAnnounce: "대본 전체",
			joining: "대본을 잇는 중",
			joinFailed: "한 파일로 잇지 못했어요. ‘줄마다 받기’로 받아 주세요",
		});
		expect([t.gapResetLine(3), t.gapLineHelp("0.3")]).toEqual([
			"기본으로, 3번 줄 뒤 쉼",
			"0~5초, 0.1초 단위. 비우면 기본 0.3초",
		]);
		// 줄 쉼 창·카드 표시·줄 메뉴 항목을 없앴다(브리프 16절)
		for (const key of [
			"gapMenu",
			"gapLast",
			"gapField",
			"gapSave",
			"gapTitle",
			"gapBody",
			"gapShown",
			"gapButton",
		])
			expect(t).not.toHaveProperty(key);
	});
	it("무대 줄이기 문구(스펙 17.2·17.3): 테이크 넘기기 글, 대사별 파일 안내, 없앤 무대 키", () => {
		const t = DRAMA_TEXT;
		expect(t.takeAt(2, 3)).toBe("테이크 2 / 3");
		expect(t.zipNote(4)).toBe("대사별 파일: 장면 1 + 대사 4");
		// 쉼 넣어 한 파일로 받기의 화면 밖 시작·끝 알림('모두 받기'와 따로)
		expect(t).toMatchObject({
			joinTakeSaving: "쉼 넣어 한 파일로 받는 중이에요",
			joinTakeSaved: "쉼 넣어 한 파일로 받았어요",
		});
		// 무대의 플레이어·줄 목록·받기 단추·빈 상태를 없앴다(스펙 17.2 '무대')
		for (const key of [
			"downloadScene",
			"downloadAll",
			"stageEmpty",
			"stageNoCurrent",
			"playing",
			"chipHelp",
			"span",
			"receivingCount",
		])
			expect(t).not.toHaveProperty(key);
	});
	it("막대 문구(스펙 17.3 결과 칸·주 버튼·받기 메뉴·한 줄 칸)", () => {
		const t = DRAMA_TEXT;
		expect(t).toMatchObject({
			resultScene: "장면을 만들면 여기서 들을 수 있어요",
			resultJoin: "모든 줄을 읽으면 여기서 이어 들을 수 있어요",
			otherWays: "다른 방법",
			readByLine: "줄마다 읽기",
			readPaidName: "읽기, 크레딧 사용",
			saveSceneFile: "장면 파일 (WAV)",
			saveTakeJoin: "쉼 넣어 한 파일로 (WAV)",
			saveTakeZip: "대사별 파일 (zip)",
		});
		expect(t.readEstimate(4, 49, true)).toBe(
			"4줄 · 49자 · 유료 공급자 화자가 있어요 · 누르면 예상 사용량을 먼저 보여 드려요",
		);
		expect(t.readEstimate(4, 49, false)).toBe("4줄 · 49자");
		expect(t.readEstimate(1200, 1500, false)).toBe("1,200줄 · 1,500자");
	});
	it("대본 지면 문구(스펙 17.3 대본 머리·기본 쉼·가름선·지시 칸)", () => {
		const t = DRAMA_TEXT;
		expect(t.gapLineName(3)).toBe("3번 줄 뒤 쉼(초)");
		expect(t).toMatchObject({
			gapDefault: "기본 쉼",
			directionShort: "지시",
			pasteShort: "붙여 넣기",
			autoTagShort: "자동 태그",
			autoTagName: "전체 자동 태그, 크레딧 사용",
		});
		// 카드 쉼 이름표·'읽는 중' 글·긴 지시 자리 표시·무대 건너뛰기 링크를 없앴다(브리프 17절 3·4·5)
		for (const key of [
			"gapNext",
			"gapNextName",
			"readingNow",
			"directionPlaceholder",
			"skipToStage",
		])
			expect(t).not.toHaveProperty(key);
	});
	it("도구줄 문구(스펙 17.3 도구줄)", () => {
		const t = DRAMA_TEXT;
		// 지시 칸 이름(directionLabel)과 다르게 줄 메뉴 항목 '연기 지시 넣기'를 따른다
		expect(t.toolbarName(3)).toBe("3번 줄 연기 지시 넣기");
		// 소리·분위기 짧은 이름과 메뉴 알약·뱃지 이름은 두 작업실 공용 TAG_TEXT로 옮겼다(tag-view.test.ts)
		expect(t).toMatchObject({
			spanShort: "범위",
			// 자동 태그 미리 보기가 지시 칸 이름으로 쓴다
			palette: "연기 지시",
		});
		// 오른쪽 칸 머리 상태 글과 막대 '연기 지시'(시트) 단추를 없앴다(스펙 17.2 '연기 지시')
		for (const key of ["paletteTarget", "paletteLocked", "paletteOpen"])
			expect(t).not.toHaveProperty(key);
	});
	it("줄 동작 문구(스펙 17.3 줄 ▶·받을 테이크·줄 메뉴)", () => {
		const t = DRAMA_TEXT;
		expect(t.saveThisLine).toBe("이 줄 받기");
		expect(t.playLine(3, "민준")).toBe("3번 줄 민준 듣기");
		expect(t.stopLine(3, "민준")).toBe("3번 줄 민준 정지");
		// '이 줄만 읽기' ▶가 잠긴 이유(읽기·받기 중. 장면을 만드는 중은 makingStatus)
		expect(t.playLocked).toBe("읽기나 받기가 끝나면 들을 수 있어요");
		// 무대 줄 '받기' 단추와 테이크 칩 묶음을 없앴다(줄 메뉴 '이 줄 받기'와 받을 테이크 ▾가 대신한다)
		for (const key of ["downloadLine", "takeChoice", "takeMenu"])
			expect(t).not.toHaveProperty(key);
	});
	it("받기 문구는 16절 표 그대로이고 '읽은 줄' 메뉴 글은 없다", () => {
		const t = DRAMA_TEXT;
		expect(t).toMatchObject({ saveMenu: "받기", saveConfirmGo: "받기" });
		expect(t.saveStop(3, 8)).toBe("멈춤 · 받는 중 3/8줄");
		expect(t).not.toHaveProperty("heardMenu");
	});
	it("화자 이름(줄 칩·성우 창 제목·붙여 넣기·무대): 다듬은 이름, 비었거나 없는 화자는 '화자 N'", () => {
		const speakers = [sp("  지연 "), sp("  "), sp("민수")];
		expect(speakerNameOf(speakers, 0)).toBe("지연");
		expect(speakerNameOf(speakers, 1)).toBe("화자 2");
		expect(speakerNameOf(speakers, 2)).toBe("민수");
		expect(speakerNameOf(speakers, 3)).toBe("화자 4");
	});
});

describe("무대·이전 테이크·막대 도움(Task 11, Ruling 12)", () => {
	const request = (over: Partial<DramaRequest> = {}): DramaRequest => ({
		sceneName: "S03_약속장소",
		speakers: [
			{ name: "지연", voiceId: "f1" },
			{ name: "민수", voiceId: "f2" },
			{ name: "안 나옴", voiceId: "f3" },
		],
		lines: [
			{ speaker: 1, direction: "", text: "미안 [sighs] 늦었어." },
			{ speaker: 0, direction: "작게", text: "또 늦었네." },
			{ speaker: 1, direction: "", text: "다음엔 안 늦을게." },
		],
		model: "drama-3",
		settings: { speed: 1, temperature: 0.7 },
		...over,
	});
	const span = (i: number) => ({
		start: i,
		end: i + 0.5,
		cutStart: i,
		cutEnd: i + 1,
	});
	// 10:42 KST, 길이 18.3초(머리 44바이트 + 88,200바이트/초)
	const take = (id: string, over: Partial<DramaItem> = {}): DramaItem => ({
		id,
		createdAt: "2026-10-22T01:42:00.000Z",
		usage: { unit: "usd_micro", amount: 3200 },
		bytes: 44 + 88_200 * 18.3,
		segments: [span(0), span(1), span(2)],
		status: "done",
		request: request(),
		...over,
	});

	it("테이크 길이는 (bytes − 44) / 88,200초이고 머리보다 작으면 0이다", () => {
		expect(takeSeconds(44 + 88_200 * 18.3)).toBeCloseTo(18.3, 6);
		expect(takeSeconds(44)).toBe(0);
		expect(takeSeconds(0)).toBe(0);
	});

	it("테이크 시각은 만든 한국 시간 시:분이다", () => {
		expect(takeTime("2026-10-22T01:42:00.000Z")).toBe("10:42");
		expect(takeTime("2026-10-21T15:05:59.000Z")).toBe("00:05");
	});

	it("화자는 대본에 처음 나온 순서이고 나오지 않는 화자는 빠진다", () => {
		expect(castOrder(request().lines)).toEqual([1, 0]);
	});

	it("확인 창 대본은 대사를 이어 붙인 앞 100자이고 넘으면 …", () => {
		expect(scriptHead(request().lines)).toBe(
			"미안 [sighs] 늦었어. 또 늦었네. 다음엔 안 늦을게.",
		);
		const long = scriptHead([
			{ text: ` ${"가".repeat(50)} ` },
			{ text: "나".repeat(50) },
		]);
		expect([...long]).toHaveLength(101);
		expect(long.endsWith(`${"가".repeat(50)} ${"나".repeat(49)}…`)).toBe(true);
	});

	it("샘플링 버튼은 처음 값이 아닌 값만 붙이고 접근 이름은 보이는 글로 시작해 늘 지금 값을 말한다", () => {
		expect(samplingText({ speed: 1, temperature: 0.7 })).toBe("샘플링");
		expect(samplingText({ speed: 1.2, temperature: 0.7 })).toBe(
			"샘플링 · 속도 1.20배",
		);
		expect(samplingText({ speed: 1.2, temperature: 0.5 })).toBe(
			"샘플링 · 연기 변화 0.50 · 속도 1.20배",
		);
		expect(DRAMA_TEXT.samplingLabel({ speed: 1, temperature: 0.7 })).toBe(
			"샘플링, 연기 변화 0.70, 속도 1.00배",
		);
		// 보이는 글(WCAG 2.5.3) 뒤에 처음 값인 항목만 붙인다
		expect(DRAMA_TEXT.samplingLabel({ speed: 1.2, temperature: 0.7 })).toBe(
			"샘플링 · 속도 1.20배, 연기 변화 0.70",
		);
		expect(DRAMA_TEXT.samplingLabel({ speed: 1, temperature: 0.5 })).toBe(
			"샘플링 · 연기 변화 0.50, 속도 1.00배",
		);
		expect(DRAMA_TEXT.samplingLabel({ speed: 1.2, temperature: 0.5 })).toBe(
			"샘플링 · 연기 변화 0.50 · 속도 1.20배",
		);
	});

	it("막는 이유의 줄 대상은 문제가 있는 칸(대사·지시)을 가리킨다('{n}번 줄로')", () => {
		const speakers = [sp("지연", "f1"), sp("민수", "f2")];
		const at = (lines: DraftLine[]) =>
			dramaBlock({ sceneName: "", speakers, lines, speed: 1 })?.target;
		// 지시 60자 초과 → 지시 칸
		expect(
			at([ln("l1", 0, "또 늦었네."), ln("l2", 1, "미안!", "가".repeat(61))]),
		).toEqual({ kind: "line", id: "l2", field: "direction" });
		// 빈 대사가 지시 60자 초과보다 먼저 → 대사 칸
		expect(
			at([ln("l1", 0, "또 늦었네."), ln("l2", 1, "", "가".repeat(61))]),
		).toEqual({ kind: "line", id: "l2", field: "text" });
		// <|가 지시에만 있으면 지시 칸, 대사에도 있으면 대사 칸
		expect(at([ln("l1", 0, "또 늦었네.", "<|")])).toEqual({
			kind: "line",
			id: "l1",
			field: "direction",
		});
		expect(at([ln("l1", 0, "또 <|늦었네.", "<|")])).toEqual({
			kind: "line",
			id: "l1",
			field: "text",
		});
		expect([DRAMA_TEXT.toName, DRAMA_TEXT.toLine(3)]).toEqual([
			"이름 칸으로",
			"3번 줄로",
		]);
	});

	it("나누지 못한 이유는 지시뿐인 줄 → 태그 이름 단어 → Drama 3 → 그 밖 순서다", () => {
		const lines = (text: string) => [
			{ speaker: 0, direction: "", text: "또 늦었네." },
			{ speaker: 1, direction: "", text },
		];
		expect(
			notSplitReason(
				take("a", { request: request({ lines: lines("[sighs]") }) }),
			),
		).toBe(DRAMA_TEXT.notSplitNoText);
		expect(
			notSplitReason(
				take("b", { request: request({ lines: lines("Go slow") }) }),
			),
		).toBe(DRAMA_TEXT.notSplitTagWord);
		expect(notSplitReason(take("c"))).toBe(DRAMA_TEXT.notSplitDrama3);
		expect(
			notSplitReason(take("d", { request: request({ model: "s2.1-pro" }) })),
		).toBe(DRAMA_TEXT.notSplitMismatch);
	});

	it("무대 캡션은 그룹이 둘 이상이면 번호를 붙이고, 아니면 시각·모델·길이만", () => {
		const t1 = take("t1");
		const t2 = take("t2");
		const t3 = take("t3");
		expect(stageCaption(t2, [t1, t2, t3])).toBe(
			"테이크 2 / 3 · 10:42 · Drama 3 · 18.3초",
		);
		expect(stageCaption(t1, [t1])).toBe("10:42 · Drama 3 · 18.3초");
		// 나누지 못한 테이크는 그룹 밖이다
		expect(stageCaption(take("x", { segments: null }), [t1, t2])).toBe(
			"10:42 · Drama 3 · 18.3초",
		);
	});

	it("대사별 파일 안내는 고른 테이크가 섞였을 때만 테이크 번호를 붙인다", () => {
		const t1 = take("t1");
		const t2 = take("t2");
		expect(zipNoteOf([t1, t2], [t1, t1, t1])).toBe(
			"대사별 파일: 장면 1 + 대사 3",
		);
		expect(zipNoteOf([t1, t2], [t2, t1, t2])).toBe(
			"대사별 파일: 장면 1 + 대사 3 · 대사는 테이크 1·2에서",
		);
	});

	it("무대 줄 대사는 태그를 뺀 글이다", () => {
		expect(lineText(" 미안 [sighs] 늦었어. <whisper>쉿</whisper> ")).toBe(
			"미안 늦었어. 쉿",
		);
	});

	it("이전 테이크 첫째 줄은 장면 이름(없으면 '장면') · 첫 줄 대사 앞 20자", () => {
		expect(takeTitleOf(take("t1"))).toBe("S03_약속장소 · 미안 늦었어.");
		expect(
			takeTitleOf(
				take("t2", {
					request: request({
						sceneName: "  ",
						lines: [{ speaker: 0, direction: "", text: "가".repeat(21) }],
					}),
				}),
			),
		).toBe(`장면 · ${"가".repeat(20)}…`);
	});

	it("이전 테이크 둘째 줄: 완료는 길이까지, 미확인은 길이 없이 끝에 '사용 여부 미확인'", () => {
		const now = new Date(Date.parse("2026-10-22T01:45:00.000Z"));
		expect(takeLineOf(take("t1"), now)).toBe(
			"3분 전 · Drama 3 · 민수·지연 · 18.3초 · 추정 약 $0.0032",
		);
		expect(takeLineOf(take("t2", { status: "unknown", bytes: 0 }), now)).toBe(
			"3분 전 · Drama 3 · 민수·지연 · 추정 약 $0.0032 · 사용 여부 미확인",
		);
	});

	it("8절에 키가 없던 조합 문구", () => {
		const t = DRAMA_TEXT;
		expect([
			t.takeCaptionShort("10:42", "Drama 3", 18.3),
			t.confirmUsage({ unit: "usd_micro", amount: 3200 }, 1322),
			t.takeMenuLabel(3, 2),
			t.takeMenuLabel(3, t.follows("2")),
			t.follows(t.takeChip(2, "10:42", "Drama 3")),
			t.follows("2"),
			t.lineName(3, "지연"),
		]).toEqual([
			"10:42 · Drama 3 · 18.3초",
			"추정 약 $0.0032 · 1,322바이트",
			"3번 줄 테이크, 2 선택됨",
			"3번 줄 테이크, 2 · 무대 따라감 선택됨",
			"테이크 2 · 10:42 · Drama 3 · 무대 따라감",
			"2 · 무대 따라감",
			"3번 줄 지연",
		]);
	});
	it("줄 듣기 플레이어 알림은 '대사'로 말한다('저장된 결과'는 테이크 대신 쓰지 않는다, GLOSSARY)", () => {
		const line = {
			voiceId: "take-1:0",
			name: DRAMA_TEXT.lineName(3, "지연"),
			noun: DRAMA_TEXT.lineNoun,
			owner: null,
			status: "playing",
		} as const;
		expect(announceOf(line)).toBe("3번 줄 지연 대사 재생 중");
		expect(stoppedText(line)).toBe("3번 줄 지연 대사를 멈췄어요");
		expect(failedText(line)).toBe("3번 줄 지연 대사를 재생하지 못했어요");
	});
});

describe("refocusAfterReload", () => {
	const base = {
		success: true,
		activeIsButton: false,
		activeIsBody: false,
		userMoved: false,
	};
	it("성공하고 포커스가 버튼에 남았으면 옮긴다", () => {
		expect(refocusAfterReload({ ...base, activeIsButton: true })).toBe(true);
	});
	it("성공하고 body로 빠졌으며 사용자가 옮기지 않았으면 옮긴다", () => {
		expect(refocusAfterReload({ ...base, activeIsBody: true })).toBe(true);
	});
	it("사용자가 다른 곳을 눌렀으면 옮기지 않는다", () => {
		expect(
			refocusAfterReload({ ...base, activeIsBody: true, userMoved: true }),
		).toBe(false);
	});
	it("실패하면 옮기지 않는다", () => {
		expect(
			refocusAfterReload({ ...base, success: false, activeIsButton: true }),
		).toBe(false);
	});
});

describe("읽기를 막는 이유와 막대 이유 줄(브리프 14절 배치 5)", () => {
	const speakers = [sp("민수"), sp(" ")];
	const lines = [ln("a", 0, "  "), ln("b", 1, "응"), ln("c", 0, "[sighs]")];
	it("readRequests의 problem → 문구와 대상(성우 창 또는 그 줄 대사 칸, 번호는 지금 줄 차례)", () => {
		expect(
			readBlockOf({ kind: "voice", lineId: null, speaker: 1 }, speakers, lines),
		).toEqual({
			text: "화자 ‘화자 2’의 성우를 골라 주세요",
			target: { kind: "voice", index: 1 },
		});
		expect(
			readBlockOf(
				{ kind: "long", lineId: "b", speaker: null },
				speakers,
				lines,
			),
		).toEqual({
			text: "2번 줄이 읽기 상한 200자를 넘어요(지시 포함)",
			target: { kind: "line", id: "b", field: "text" },
		});
		expect(
			readBlockOf(
				{ kind: "empty", lineId: "c", speaker: null },
				speakers,
				lines,
			),
		).toEqual({
			text: "3번 줄은 보낼 대사가 없어요(태그만 있어요)",
			target: { kind: "line", id: "c", field: "text" },
		});
	});
	it("그냥 빈 대사는 장면과 같은 emptyLine(모두 Fish 대본에서 이유가 하나로 합쳐진다)", () => {
		const read = readBlockOf(
			{ kind: "empty", lineId: "a", speaker: null },
			speakers,
			lines,
		);
		expect(read).toEqual({
			text: "1번 줄의 대사가 비었어요",
			target: { kind: "line", id: "a", field: "text" },
		});
		const scene = dramaBlock({
			sceneName: "",
			speakers: [sp("민수", "f1"), sp("지연", "f2")],
			lines,
			speed: 1,
		});
		expect(scene?.text).toBe(read.text);
	});
	const scene = { text: "장면 이유", target: null };
	const read = { text: "읽기 이유", target: null };
	it("보이는 이유는 하나: 주 버튼의 이유(모두 Fish면 장면, 섞이면 읽기), 없으면 보조 버튼의 이유", () => {
		expect(barReason(true, scene, read)).toEqual({ ...scene, for: ["scene"] });
		expect(barReason(false, scene, read)).toEqual({ ...read, for: ["read"] });
		expect(barReason(true, null, read)).toEqual({ ...read, for: ["read"] });
		expect(barReason(false, scene, null)).toEqual({
			...scene,
			for: ["scene"],
		});
		expect(barReason(true, null, null)).toBeNull();
	});
	it("같은 글(성우 없음·빈 대사)은 두 버튼이 함께 가리킨다", () => {
		const voice = {
			text: "화자 ‘민수’의 성우를 골라 주세요",
			target: { kind: "speaker", index: 0 } as const,
		};
		expect(
			barReason(true, voice, {
				text: voice.text,
				target: { kind: "voice", index: 0 },
			}),
		).toEqual({ ...voice, for: ["scene", "read"] });
	});
	it("찾는 중(줄 수를 아직 모름)의 멈춤 글", () => {
		expect(DRAMA_TEXT.readStopOnly).toBe("멈춤");
	});
	it("줄 실패 문구: T5 그대로, 다만 '내 문장' 기본 문구는 '이 줄'", () => {
		const problem = (reason: string) =>
			({ reason, retryAt: null, providerCode: null }) as Parameters<
				typeof readLineProblemText
			>[1];
		expect(readLineProblemText("typecast", problem("unexpected"))).toEqual({
			text: "이 줄을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요",
			connections: false,
		});
		expect(readLineProblemText("typecast", problem("odd_reason")).text).toBe(
			"이 줄을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요",
		);
		for (const reason of ["quota", "no_key", "in_progress", "provider_error"])
			expect(readLineProblemText("airy", problem(reason))).toEqual(
				trialProblemText("airy", problem(reason)),
			);
	});
});

describe("전체 자동 태그(브리프 14절 배치 6, 스펙 14.5)", () => {
	const speakers = [
		sp("민수", "f1"),
		sp(" ", "t1", "typecast"),
		sp("지연", "e1", "elevenlabs"),
	];
	const casts: {
		family: ActingFamily;
		model: string;
		emotions: string[] | null;
	}[] = [
		{ family: "fish_s2", model: "s2.1-pro", emotions: null },
		{
			family: "typecast_v30",
			model: "ssfm-v30",
			emotions: ["smart", "normal", "happy"],
		},
		{ family: "elevenlabs_tags", model: "eleven_v3", emotions: null },
	];
	const cast = (index: number) => casts[index] ?? casts[0];
	// 모두 Fish 화자(지시 칸이 보인다)
	const fishCast = () => ({ family: "fish_s2" as const });
	const happy: Feel = { typecast: { emotion: "happy", intensity: 1.5 } };

	it("입력: 대사가 있는 줄만 보내고 그 줄이 쓰는 화자만 번호를 다시 매긴다(이름·공급자·모델·감정)", () => {
		const lines = [
			ln("a", 2, "안녕", "icy calm"),
			// 빈 대사는 계약이 받지 않는다. 그 화자(민수)도 보내지 않는다
			ln("b", 0, "  ", "작게"),
			{ ...ln("c", 1, "응"), feel: happy },
		];
		const { input, sent } = autoTagInput(speakers, lines, cast, false);
		expect(input).toEqual({
			mode: "read",
			speakers: [
				{
					name: "화자 2",
					provider: "typecast",
					model: "ssfm-v30",
					emotions: ["smart", "normal", "happy"],
				},
				{
					name: "지연",
					provider: "elevenlabs",
					model: "eleven_v3",
					emotions: null,
				},
			],
			lines: [
				{ speaker: 1, direction: "icy calm", text: "안녕" },
				{ speaker: 0, direction: "", text: "응", feel: happy },
			],
		});
		// 줄 번호는 지금 대본의 차례다(빈 줄 포함)
		expect(sent).toEqual([
			{ line: lines[0], n: 1, direction: "icy calm" },
			{ line: lines[2], n: 3, direction: "" },
		]);
		expect(autoTagInput(speakers, lines, cast, true).input.mode).toBe("scene");
	});

	it("이름·줄 검사(scriptBlock): dramaBlock의 이름·줄 차례 그대로, 성우·섞임·장면 이름·글자 상한은 보지 않는다", () => {
		const mixed = [sp("민수"), sp("민수", "t1", "typecast")];
		expect(scriptBlock(mixed, [ln("a", 0, "안녕")])?.text).toBe(
			"같은 이름의 화자가 있어요 (‘민수’)",
		);
		expect(
			scriptBlock(
				[sp("민수"), sp("지연")],
				[ln("a", 0, "안녕"), ln("b", 1, "")],
			),
		).toEqual({
			text: "2번 줄의 대사가 비었어요",
			target: { kind: "line", id: "b", field: "text" },
		});
		expect(
			scriptBlock([sp("민수")], [ln("a", 0, "안녕", "x".repeat(61))])?.target,
		).toEqual({ kind: "line", id: "a", field: "direction" });
		// 성우 없음·장면 글자 상한은 이 검사가 아니다
		expect(
			scriptBlock([sp("민수")], [ln("a", 0, "가".repeat(300))]),
		).toBeNull();
	});
	it("자동 태그 잠김: 서버가 거절할 입력(이름·줄)이 먼저, 그다음 대본 2,000자. 섞인 대본에서도 본다", () => {
		const mixed = [sp(""), sp("지연", "t1", "typecast")];
		expect(autoTagBlock(mixed, [ln("a", 1, "안녕")], cast)?.text).toBe(
			DRAMA_TEXT.noName(1),
		);
		expect(
			autoTagBlock(
				[sp("민수"), sp("지연", "t1", "typecast")],
				[ln("a", 1, "a<|b")],
				cast,
			)?.text,
		).toBe(DRAMA_TEXT.marker(1));
		const long = Array.from({ length: 7 }, (_, i) =>
			ln(`l${i}`, 0, "가".repeat(300)),
		);
		expect(autoTagBlock([sp("민수")], long, fishCast)).toEqual({
			text: "대본이 2,000자를 넘어 자동 태그를 쓸 수 없어요 (지금 2,100자)",
			target: null,
		});
		expect(
			autoTagBlock([sp("민수")], [ln("a", 0, "안녕")], fishCast),
		).toBeNull();
	});

	it("자동 태그 잠김은 빈 대사 줄을 건너뛴다(입력이 빼고 보낸다). 번호는 원래 줄 번호, 모두 비었으면 보낼 줄이 없어 잠근다", () => {
		const speakers2 = [sp("민수"), sp("지연")];
		expect(
			autoTagBlock(
				speakers2,
				[ln("a", 0, "안녕"), ln("b", 1, " ", "작게")],
				fishCast,
			),
		).toBeNull();
		expect(
			autoTagBlock(
				speakers2,
				[ln("a", 0, ""), ln("b", 1, "가".repeat(301))],
				fishCast,
			)?.text,
		).toBe(DRAMA_TEXT.lineTooLong(2, 301));
		expect(
			autoTagBlock(speakers2, [ln("a", 0, ""), ln("b", 1, "")], fishCast),
		).toEqual({
			text: "1번 줄의 대사가 비었어요",
			target: { kind: "line", id: "a", field: "text" },
		});
		// 장면 막는 이유는 지금처럼 빈 줄에서 막는다
		expect(
			scriptBlock(speakers2, [ln("a", 0, "안녕"), ln("b", 1, "")])?.text,
		).toBe("2번 줄의 대사가 비었어요");
	});

	// 감정 칸 글: 화자 1(Typecast)만 감정이 있고, 없으면 성우 설정(보통)이 보인다
	const label = (line: DraftLine, feel: Feel | undefined) =>
		line.speaker === 1 ? (feel?.typecast?.emotion ?? "normal") : null;

	it("미리 보기: 정리한 값끼리 견줘 바뀐 칸만, 칸마다 전·후와 넣을 정리한 값", () => {
		const a = ln("a", 0, " 안녕 [sighs] ", " icy  calm ");
		const b = ln("b", 1, "응");
		const c = ln("c", 0, "그래");
		const sent = [
			{ line: a, n: 1, direction: a.direction },
			{ line: b, n: 3, direction: "" },
			{ line: c, n: 4, direction: "" },
		];
		const reply = [
			// 정리(NFC·앞뒤 공백·지시 공백)만 다르면 바뀌지 않았다(답 쪽 공백도)
			{ direction: "icy calm ", text: " 안녕 [sighs]" },
			{ direction: "", text: "응", feel: { ...happy } },
			{ direction: " warm  tone", text: "[laughs] 그래 " },
		];
		expect(autoTagChanges(sent, reply, label)).toEqual([
			{
				line: b,
				n: 3,
				direction: "",
				fields: [{ field: "feel", before: "normal", after: "happy" }],
				patch: { feel: happy },
			},
			{
				line: c,
				n: 4,
				direction: "",
				fields: [
					{ field: "direction", before: "", after: "warm tone" },
					{ field: "text", before: "그래", after: "[laughs] 그래" },
				],
				patch: { direction: "warm tone", text: "[laughs] 그래" },
			},
		]);
	});
	it("감정은 보이는 글로 견준다: 성우 설정과 같은 값을 줄에 적는 제안, 감정 칸이 없는 화자는 바뀐 칸이 아니다", () => {
		const b = ln("b", 1, "응");
		const a = ln("a", 0, "안녕");
		expect(
			autoTagChanges(
				[
					{ line: b, n: 1, direction: "" },
					{ line: a, n: 2, direction: "" },
				],
				[
					{
						direction: "",
						text: "응",
						feel: { typecast: { emotion: "normal", intensity: 1 } },
					},
					{ direction: "", text: "안녕", feel: happy },
				],
				label,
			),
		).toEqual([]);
	});

	it("지시 칸이 숨은 화자(Typecast)의 줄: 지시를 빈 값으로 보내고 잠금에서 재지 않으며, 미리 보기·모두 바꾸기가 숨은 지시를 그대로 둔다", () => {
		const named = [sp("민수", "f1"), sp("도윤", "t1", "typecast")];
		// Fish였을 때 쓴 지시(61자 넘음·<|)가 화자를 Typecast로 바꾼 뒤 숨어 있다
		const hidden = `<|${"x".repeat(61)}`;
		const lines = [ln("a", 0, "안녕", "icy calm"), ln("b", 1, "응", hidden)];
		expect(scriptBlock(named, lines)?.target).toEqual({
			kind: "line",
			id: "b",
			field: "direction",
		});
		expect(autoTagBlock(named, lines, cast)).toBeNull();
		// 지시 칸이 보이는 화자의 지시는 지금처럼 잰다
		expect(
			autoTagBlock(named, [ln("a", 0, "안녕", "x".repeat(61))], cast)?.target,
		).toEqual({ kind: "line", id: "a", field: "direction" });
		const { input, sent } = autoTagInput(named, lines, cast, false);
		expect(input.lines.map((line) => line.direction)).toEqual(["icy calm", ""]);
		// 서버는 지시 칸이 없는 family의 지시를 보낸 값("")으로 돌려준다
		const changes = autoTagChanges(
			sent,
			[
				{ direction: "icy calm", text: "안녕" },
				{ direction: "", text: "응", feel: happy },
			],
			label,
		);
		expect(changes).toEqual([
			{
				line: lines[1],
				n: 2,
				direction: "",
				fields: [{ field: "feel", before: "normal", after: "happy" }],
				patch: { feel: happy },
			},
		]);
		expect(autoTagApply(lines, changes)).toEqual({
			lines: [lines[0], { ...lines[1], feel: happy }],
			applied: 1,
			changed: 0,
		});
	});

	it("모두 바꾸기: 보낸 뒤 바뀌지 않은 줄만 id로 찾아 바뀐 칸만 넣고, 고쳤거나 지운 줄은 건너뛰어 센다", () => {
		const a = ln("a", 0, "안녕");
		const b = { ...ln("b", 1, "응"), feel: happy };
		const c = ln("c", 0, "그래");
		const d = ln("d", 0, "가자", "작게");
		const e = ln("e", 2, "어");
		const change = (line: DraftLine, patch: AutoTagChange["patch"]) => ({
			line,
			n: 0,
			direction: line.direction,
			fields: [],
			patch,
		});
		const changes = [
			change(a, { text: "[sighs] 안녕" }),
			change(b, { direction: "warm" }),
			change(c, { direction: "warm" }),
			change(d, { text: "가자 [laughs]" }),
			change(e, { text: "[gasps] 어" }),
		];
		const added = ln("x", 0, "새 줄");
		// 그사이: a는 그대로, b는 값이 같은 새 객체(위로 옮김), c는 지움, d는 대사를 고침, e는 화자를 바꿈
		const now = [
			{ ...b, feel: { typecast: { intensity: 1.5, emotion: "happy" } } },
			a,
			{ ...d, text: "가자!" },
			{ ...e, speaker: 0 },
			added,
		] satisfies DraftLine[];
		expect(autoTagApply(now, changes)).toEqual({
			lines: [
				{ ...now[0], direction: "warm" },
				{ ...a, text: "[sighs] 안녕" },
				now[2],
				now[3],
				added,
			],
			applied: 2,
			changed: 3,
		});
	});

	it("미리 보기 안내: 바꿀 값 없음, 받지 않는 줄 수, 모두 Fish면 바꾼 결과가 장면 상한(속도 < 1)을 넘을 때 tooLong", () => {
		const a = ln("a", 0, "가".repeat(900));
		const change = {
			line: a,
			n: 1,
			direction: "",
			fields: [],
			patch: { text: `[sighs] ${"가".repeat(900)}` },
		};
		expect(autoTagNotes([], 2, [a], true, 1)).toEqual([
			"바꿀 값이 없어요",
			"연기 값을 받지 않는 성우의 줄 2개는 그대로 둬요",
		]);
		// 속도 0.5배 상한 1,000자: 900자 → 908자는 괜찮고, 1,000자 넘으면 안내
		expect(autoTagNotes([change], 0, [a], true, 0.5)).toEqual([]);
		const b = ln("b", 0, "가".repeat(95));
		expect(autoTagNotes([change], 0, [a, b], true, 0.5)).toEqual([
			DRAMA_TEXT.tooLong(1000, 1003, 0.5),
		]);
		// 섞인 대본은 장면을 만들지 않으므로 안내하지 않는다
		expect(autoTagNotes([change], 0, [a, b], false, 0.5)).toEqual([]);
	});
	it("미리 보기 전·후 이름표(화면 밖)", () => {
		expect([DRAMA_TEXT.autoTagBefore, DRAMA_TEXT.autoTagAfter]).toEqual([
			"전",
			"후",
		]);
	});

	it("감정 칸 글: 이름(강도), 자동이면 강도 없이, 감정 칸이 없으면 null", () => {
		expect(feelText("typecast_v30", { value: "happy", intensity: 1.5 })).toBe(
			"기쁨 · 강도 1.5",
		);
		expect(feelText("typecast_v30", { value: "smart", intensity: 1 })).toBe(
			"자동",
		);
		expect(feelText("airy", { value: "bright", intensity: null })).toBe("밝게");
		expect(feelText("airy", null)).toBeNull();
	});
});
