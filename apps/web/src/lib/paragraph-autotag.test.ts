// apps/web/src/lib/paragraph-autotag.test.ts
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	EMOTION_PRESETS,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioAutoTagOutput } from "@tts-pilot-app/api/studio-contract";
import { describe, expect, it } from "vitest";

import type { ParagraphStatus } from "./make-all";
import { readingItems } from "./number-reading";
import {
	type AutoTagTarget,
	applyAutoTag,
	autoTagAsked,
	autoTagBatches,
	autoTagChanges,
	autoTagGrew,
	autoTagInputOf,
	autoTagTargets,
	excerptMarks,
	hasAutoTagTarget,
	newTagMarks,
} from "./paragraph-autotag";
import {
	applyCertain,
	blockOf,
	decide,
	ownSettings,
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	paragraphRequest,
	spokenOf,
	type VoiceSetup,
	type Work,
} from "./paragraph-script";

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
const saved = (id: string, v: Voice): SavedVoice => ({
	id,
	voice: v,
	favorite: false,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
});
const VOICES = [
	saved("s1", voice()),
	saved("s2", voice({ provider: "fish_audio", voiceId: "f_1", name: "하늘" })),
	saved("s3", voice({ provider: "gemini", voiceId: "g_1", name: "Kore" })),
	saved("s4", voice({ provider: "airy", voiceId: "a_1", name: "바람" })),
	saved(
		"s5",
		voice({ provider: "elevenlabs", voiceId: "el_1", name: "Rachel" }),
	),
	saved(
		"s6",
		voice({
			voiceId: "tc_21",
			name: "옛 성우",
			models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
		}),
	),
];
const typecast: VoiceSetup = {
	provider: "typecast",
	voiceId: "tc_1",
	settings: DEFAULT_SETTINGS.typecast,
};
const fish: VoiceSetup = {
	provider: "fish_audio",
	voiceId: "f_1",
	settings: DEFAULT_SETTINGS.fish_audio,
};
const gemini: VoiceSetup = {
	provider: "gemini",
	voiceId: "g_1",
	settings: { ...DEFAULT_SETTINGS.gemini, direction: "calm and relaxed" },
};
const airy: VoiceSetup = {
	provider: "airy",
	voiceId: "a_1",
	settings: DEFAULT_SETTINGS.airy,
};
const v2: VoiceSetup = {
	provider: "elevenlabs",
	voiceId: "el_1",
	settings: { ...DEFAULT_SETTINGS.elevenlabs, model: "eleven_multilingual_v2" },
};
const work = (over: Partial<Work> = {}): Work => ({
	defaultVoice: typecast,
	gap: PARAGRAPH_GAP_DEFAULT,
	channelId: null,
	paragraphs: [],
	...over,
});
const para = (id: string, text: string, over: Partial<Paragraph> = {}) =>
	({ id, text, ...over }) as Paragraph;
const targetsOf = (
	ps: readonly Paragraph[],
	w = work(),
	statuses: Record<string, ParagraphStatus> = {},
) =>
	autoTagTargets(
		ps,
		w,
		VOICES,
		(p) => paragraphRequest(p, w, VOICES, NOW),
		(p) => statuses[p.id] ?? "unmade",
	);
// 답: 차례대로 그대로 돌려주고 over의 칸만 바꾼다(서버는 바뀌지 않은 문단도 NFC·trim 글로 돌려준다)
const replyOf = (
	batch: readonly AutoTagTarget[],
	over: Record<string, Partial<StudioAutoTagOutput["paragraphs"][number]>>,
): StudioAutoTagOutput => {
	const input = autoTagInputOf(batch);
	return {
		paragraphs: batch.map((t, i) => {
			const sent = input.paragraphs[i];
			return {
				text: t.sent.text.normalize("NFC").trim(),
				direction: sent?.direction ?? "",
				...(sent?.feel ? { feel: sent.feel } : {}),
				...over[t.id],
			};
		}),
		skipped: 0,
	};
};

describe("autoTagTargets(보낼 문단, T10 스펙 15.3)", () => {
	it("빈 문단·태그만 남는 문단·성우 없음·이용 불가·상한 넘김은 빼고, ElevenLabs v2는 skipped로 센다", () => {
		const ps = [
			para("a", "안녕"),
			para("blank", "  "),
			para("tags", "[sighs]"),
			para("long", "가".repeat(2001)),
			para("v2", "안녕", { voice: v2 }),
			para("gone", "안녕", { voice: { ...typecast, voiceId: "gone" } }),
			para("g", "둘", { voice: gemini }),
			para("f", "셋", { voice: fish }),
			para("air", "넷", { voice: airy }),
		];
		const w = work({ paragraphs: ps });
		const { targets, skipped } = targetsOf(ps, w, {
			f: "made",
			air: "unknown",
		});
		expect(skipped).toBe(1);
		expect(targets.map((t) => [t.id, t.n, t.family, t.result, t.own])).toEqual([
			["a", 1, "typecast_v30", null, false],
			["g", 7, "gemini", null, true],
			["f", 8, "fish_s2", "made", true],
			["air", 9, "airy", "unknown", true],
		]);
		const [a] = targets;
		expect(a).toEqual({
			id: "a",
			n: 1,
			sent: ps[0],
			request: paragraphRequest(ps[0] as Paragraph, w, VOICES, NOW),
			family: "typecast_v30",
			emotions: ["smart", ...EMOTION_PRESETS],
			result: null,
			own: false,
		});
		expect(targets.find((t) => t.id === "g")?.emotions).toBeNull();
		// 성우가 없으면 대상이 아니다
		expect(
			targetsOf([para("x", "안녕")], work({ defaultVoice: null })),
		).toEqual({ targets: [], skipped: 0 });
	});
	it("Typecast 감정은 그 성우·요청 모델이 받는 값이다(v21은 smart 없음, 드라마 actingOf와 같은 규칙)", () => {
		const old = para("o", "안녕", {
			voice: { ...typecast, voiceId: "tc_21" },
		});
		const [t] = targetsOf([old]).targets;
		expect(t?.family).toBe("typecast_v21");
		expect(t?.emotions).toEqual(["normal", "sad"]);
	});
});

describe("hasAutoTagTarget(버튼 잠김 판정)", () => {
	const has = (ps: readonly Paragraph[], w = work({ paragraphs: [...ps] })) =>
		hasAutoTagTarget(ps, w, VOICES, (p) => paragraphRequest(p, w, VOICES, NOW));
	const none = [
		para("blank", "  "),
		para("tags", "[sighs]"),
		para("long", "가".repeat(2001)),
		para("v2", "안녕", { voice: v2 }),
		para("gone", "안녕", { voice: { ...typecast, voiceId: "gone" } }),
	];
	it("보낼 문단이 하나라도 있으면 참, 없으면 거짓", () => {
		expect(has(none)).toBe(false);
		expect(has([...none, para("g", "둘", { voice: gemini })])).toBe(true);
		expect(has([para("x", "안녕")], work({ defaultVoice: null }))).toBe(false);
		expect(has([])).toBe(false);
	});
	it("문단마다 autoTagTargets와 같은 판정이다", () => {
		const all = [
			...none,
			para("a", "안녕"),
			para("f", "셋", { voice: fish }),
			para("air", "넷", { voice: airy }),
			para("o", "안녕", { voice: { ...typecast, voiceId: "tc_21" } }),
		];
		for (const p of all) {
			const w = work({ paragraphs: [p] });
			expect(has([p], w)).toBe(targetsOf([p], w).targets.length > 0);
		}
	});
});

describe("자동 태그 대상 길이는 원문 기준(T11 계획 결정 2)", () => {
	const w = work();
	const has = (p: Paragraph) =>
		hasAutoTagTarget([p], w, VOICES, (q) =>
			paragraphRequest(q, w, VOICES, NOW),
		);
	// 읽기가 길어져 발음용 대본만 상한을 넘는 문단: 원문은 상한 안이라 대상이다
	const grown = decide(
		para("g", `${"가".repeat(1997)} 3개`),
		readingItems(`${"가".repeat(1997)} 3개`)[0],
		{ choice: "apply" },
	);
	// 읽기가 짧아져 발음용 대본은 상한 안이지만 원문이 상한을 넘는 문단: 대상이 아니다
	const money = Array.from({ length: 300 }, () => "1,000원").join(" ");
	const shrunk = applyCertain([para("s", money)])[0] as Paragraph;
	it("발음용 대본만 상한을 넘으면 대상이다", () => {
		expect(spokenOf(grown).length).toBeGreaterThan(2000);
		expect(blockOf(grown, w, VOICES)).toMatchObject({ kind: "too_long" });
		expect(targetsOf([grown]).targets.map((t) => t.id)).toEqual(["g"]);
		expect(has(grown)).toBe(true);
	});
	it("원문이 상한을 넘으면 읽기가 짧아져도 대상이 아니다", () => {
		expect(money.length).toBeGreaterThan(2000);
		expect(spokenOf(shrunk).length).toBeLessThan(2000);
		expect(blockOf(shrunk, w, VOICES)).toBeNull();
		expect(targetsOf([shrunk]).targets).toEqual([]);
		expect(has(shrunk)).toBe(false);
	});
	it("다른 막는 이유(빈 문단·성우 없음)는 그대로 대상에서 뺀다", () => {
		expect(targetsOf([para("e", "  ")]).targets).toEqual([]);
		expect(
			targetsOf([para("n", "3개")], work({ defaultVoice: null })).targets,
		).toEqual([]);
	});
});

describe("autoTagBatches(나눠 보내기)", () => {
	const ofLength = (lengths: readonly number[]) =>
		lengths.map(
			(length, i) =>
				({
					id: `t${i}`,
					sent: para(`t${i}`, "가".repeat(length)),
				}) as AutoTagTarget,
		);
	const ids = (batches: AutoTagTarget[][]) =>
		batches.map((batch) => batch.map((t) => t.id));
	it("차례를 지키고 합계 2,000자·50문단까지 한 묶음", () => {
		expect(ids(autoTagBatches(ofLength([1000, 1000, 1])))).toEqual([
			["t0", "t1"],
			["t2"],
		]);
		expect(ids(autoTagBatches(ofLength([1, 2000, 1])))).toEqual([
			["t0"],
			["t1"],
			["t2"],
		]);
		expect(
			autoTagBatches(ofLength(Array(51).fill(1))).map((b) => b.length),
		).toEqual([50, 1]);
		expect(autoTagBatches([])).toEqual([]);
	});
	it("글자는 NFC·앞뒤 공백 정리 뒤 코드 포인트로 센다(계약과 같다)", () => {
		const [a, b] = ofLength([1999, 0]);
		const padded = { ...b, sent: para("t1", "  가\n") } as AutoTagTarget;
		expect(ids(autoTagBatches([a as AutoTagTarget, padded]))).toEqual([
			["t0", "t1"],
		]);
	});
	it("autoTagAsked: 확인 창에 보이는 문단 수와 호출(묶음) 수", () => {
		expect(autoTagAsked(ofLength([1000, 1000, 1]))).toEqual({
			paragraphs: 3,
			calls: 2,
		});
		expect(autoTagAsked([])).toEqual({ paragraphs: 0, calls: 0 });
	});
	it("autoTagGrew: 문단 수나 호출 수가 창에 보인 수보다 많을 때만 true(승인한 횟수보다 많이 보내지 않는다)", () => {
		const asked = { paragraphs: 3, calls: 1 };
		expect(autoTagGrew(asked, { paragraphs: 4, calls: 1 })).toBe(true);
		// 문단은 줄어도 긴 문단으로 바뀌어 호출이 늘면 보내지 않는다
		expect(autoTagGrew(asked, { paragraphs: 2, calls: 2 })).toBe(true);
		expect(autoTagGrew(asked, { paragraphs: 3, calls: 1 })).toBe(false);
		expect(autoTagGrew(asked, { paragraphs: 1, calls: 1 })).toBe(false);
	});
});

describe("autoTagInputOf(묶음 하나의 입력)", () => {
	it("공급자·모델·감정 목록·원문, Gemini만 말투 지시, Typecast·Airy는 지금 감정·말투", () => {
		const happy: VoiceSetup = {
			...typecast,
			settings: {
				...DEFAULT_SETTINGS.typecast,
				emotion: "preset",
				preset: "happy",
				intensity: 1.5,
			},
		};
		const ps = [
			para("a", "안녕 [sighs]"),
			para("h", "기뻐", { voice: happy }),
			para("g", "둘", { voice: gemini }),
			para("f", "셋 [sighs]", { voice: fish }),
			para("air", "넷", { voice: airy }),
		];
		const { targets } = targetsOf(ps, work({ paragraphs: ps }));
		expect(autoTagInputOf(targets)).toEqual({
			paragraphs: [
				{
					provider: "typecast",
					model: "ssfm-v30",
					emotions: ["smart", ...EMOTION_PRESETS],
					text: "안녕 [sighs]",
					direction: "",
					feel: { typecast: { emotion: "smart", intensity: 1 } },
				},
				{
					provider: "typecast",
					model: "ssfm-v30",
					emotions: ["smart", ...EMOTION_PRESETS],
					text: "기뻐",
					direction: "",
					feel: { typecast: { emotion: "happy", intensity: 1.5 } },
				},
				{
					provider: "gemini",
					model: "gemini-3.8-flash-tts",
					emotions: null,
					text: "둘",
					direction: "calm and relaxed",
				},
				{
					provider: "fish_audio",
					model: "s2.1-pro-free",
					emotions: null,
					text: "셋 [sighs]",
					direction: "",
				},
				{
					provider: "airy",
					model: "airy-tts-v1",
					emotions: null,
					text: "넷",
					direction: "",
					feel: { airy: { style: "normal" } },
				},
			],
		});
	});
});

describe("autoTagChanges(바뀐 문단)", () => {
	const ps = [
		para("f", "안녕 하세요", { voice: fish }),
		para("t", "반가워"),
		para("g", "둘", { voice: gemini }),
		para("air", "넷", { voice: airy }),
		para("same", "그대로", { voice: fish }),
	];
	const { targets } = targetsOf(ps, work({ paragraphs: ps }));
	it("글만 바뀐 문단, 감정만 바뀐 문단, 말투·말투 지시가 바뀐 문단만 담고 그대로인 문단은 뺀다", () => {
		const changes = autoTagChanges(
			targets,
			replyOf(targets, {
				f: { text: "안녕 [sighs] 하세요" },
				t: { feel: { typecast: { emotion: "happy", intensity: 1.5 } } },
				g: { direction: "speaking slowly" },
				air: { feel: { airy: { style: "bright" } } },
			}),
		);
		expect(
			changes.map(({ id, text, settings, fields }) => ({
				id,
				text,
				settings,
				fields,
			})),
		).toEqual([
			{
				id: "f",
				text: "안녕 [sighs] 하세요",
				settings: null,
				fields: [
					{
						field: "text",
						before: "안녕 하세요",
						after: "안녕 [sighs] 하세요",
					},
				],
			},
			{
				id: "t",
				text: null,
				settings: { emotion: "preset", preset: "happy", intensity: 1.5 },
				fields: [{ field: "emotion", before: "자동", after: "기쁨 · 1.5" }],
			},
			{
				id: "g",
				text: null,
				settings: { direction: "speaking slowly" },
				fields: [
					{
						field: "direction",
						before: "calm and relaxed",
						after: "speaking slowly",
					},
				],
			},
			{
				id: "air",
				text: null,
				settings: { style: "bright" },
				fields: [{ field: "style", before: "기본", after: "밝게" }],
			},
		]);
		const [f] = changes;
		expect(f).toMatchObject({
			n: 1,
			result: null,
			own: true,
			family: "fish_s2",
			sent: ps[0],
		});
	});
	it("자동으로 바꾸면 강도 없이 '자동', 자동끼리 강도만 다르면 바뀐 문단이 아니다", () => {
		const happy = para("h", "기뻐", {
			voice: {
				...typecast,
				settings: {
					...DEFAULT_SETTINGS.typecast,
					emotion: "preset",
					preset: "happy",
					intensity: 1.5,
				},
			},
		});
		const { targets: two } = targetsOf([happy, para("t", "반가워")]);
		const changes = autoTagChanges(
			two,
			replyOf(two, {
				h: { feel: { typecast: { emotion: "smart", intensity: 1 } } },
				t: { feel: { typecast: { emotion: "smart", intensity: 2 } } },
			}),
		);
		expect(changes.map((c) => [c.id, c.settings, c.fields])).toEqual([
			[
				"h",
				{ emotion: "smart" },
				[{ field: "emotion", before: "기쁨 · 1.5", after: "자동" }],
			],
		]);
	});
	it("서버가 NFC·앞뒤 공백을 정리해 돌려준 같은 글은 바뀐 문단이 아니다(Review Focus 8)", () => {
		const nfd = "한글 문단".normalize("NFD");
		const loose = [
			para("a", "가 \n", { voice: fish }),
			para("b", nfd, { voice: fish }),
		];
		const { targets: two } = targetsOf(loose);
		const reply = replyOf(two, {});
		expect(reply.paragraphs.map((p) => p.text)).toEqual([
			"가",
			"한글 문단".normalize("NFC"),
		]);
		expect(autoTagChanges(two, reply)).toEqual([]);
	});
});

describe("applyAutoTag(고른 문단 바꾸기)", () => {
	const w = work();
	const a = para("a", "하나");
	const g = para("g", "둘", { voice: gemini });
	const f = para("f", "셋", { voice: fish });
	const u = para("u", "넷", { voice: fish });
	const base = [a, g, f, u];
	const { targets } = targetsOf(base, w);
	const changes = autoTagChanges(
		targets,
		replyOf(targets, {
			a: { feel: { typecast: { emotion: "sad", intensity: 2 } } },
			g: { direction: "speaking slowly" },
			f: { text: "셋 [sighs]" },
			u: { text: "넷 [laughs]" },
		}),
	);
	it("고른 문단만 바꾼다: 기본을 따르던 Typecast는 ownSettings와 같은 자기 성우, 자기 성우인 Gemini는 말투 지시만", () => {
		const out = applyAutoTag(base, w, changes, new Set(["a", "g", "f"]));
		expect(out.applied).toBe(3);
		expect(out.changed).toBe(0);
		const [na, ng, nf, nu] = out.paragraphs;
		expect(na).toEqual(
			ownSettings(a, w, { emotion: "preset", preset: "sad", intensity: 2 }),
		);
		expect(na?.voice?.voiceId).toBe("tc_1");
		expect(na?.voice?.settings).toMatchObject({ preset: "sad" });
		expect(ng).toEqual({
			...g,
			voice: {
				...gemini,
				settings: { ...gemini.settings, direction: "speaking slowly" },
			},
		});
		expect(nf).toEqual({ ...f, text: "셋 [sighs]" });
		// 고르지 않은 문단은 같은 객체
		expect(nu).toBe(u);
	});
	it("보낸 뒤 고친 문단·지운 문단·기본 성우가 다른 공급자로 바뀐 기본 따르기 문단은 건너뛰고 센다", () => {
		const edited = { ...f, text: "셋 고침" };
		const now = [a, edited];
		const out = applyAutoTag(
			now,
			work({ defaultVoice: gemini }),
			changes,
			new Set(["a", "g", "f"]),
		);
		expect(out).toEqual({ paragraphs: now, applied: 0, changed: 3 });
		expect(out.paragraphs).toBe(now);
	});
	it("바뀐 것이 없으면 같은 배열", () => {
		const out = applyAutoTag(base, w, changes, new Set());
		expect(out.paragraphs).toBe(base);
		expect(out).toMatchObject({ applied: 0, changed: 0 });
	});
	it("Typecast 성우가 v21만 받아 요청 모델이 설정과 달라도 같은 성우면 바꾼다", () => {
		const old = para("o", "안녕", {
			voice: { ...typecast, voiceId: "tc_21" },
		});
		const { targets: one } = targetsOf([old]);
		const change = autoTagChanges(
			one,
			replyOf(one, {
				o: { feel: { typecast: { emotion: "sad", intensity: 1 } } },
			}),
		);
		const out = applyAutoTag([old], w, change, new Set(["o"]));
		expect(out.applied).toBe(1);
		expect(out.paragraphs[0]?.voice?.settings).toMatchObject({
			emotion: "preset",
			preset: "sad",
			intensity: 1,
		});
	});
});

describe("newTagMarks(미리 보기 '대본'의 새 태그, critique P1)", () => {
	it("before에 없던 태그만 mark다. 사이 글은 한 조각으로 잇는다", () => {
		expect(newTagMarks("안녕 하세요", "안녕 [sighs] 하세요")).toEqual([
			{ text: "안녕 ", mark: false },
			{ text: "[sighs]", mark: true },
			{ text: " 하세요", mark: false },
		]);
		// Gemini 꺾쇠 태그도 태그다
		expect(newTagMarks("가나", "가나 <sigh>")).toEqual([
			{ text: "가나 ", mark: false },
			{ text: "<sigh>", mark: true },
		]);
	});
	it("원래 있던 태그는 mark가 아니다", () => {
		expect(newTagMarks("[laughs] 가 나", "[laughs] 가 [sighs] 나")).toEqual([
			{ text: "[laughs] 가 ", mark: false },
			{ text: "[sighs]", mark: true },
			{ text: " 나", mark: false },
		]);
	});
	it("같은 태그가 원래 하나·새로 하나면 하나만 mark다. 태그를 뺀 글에서의 자리로 먼저 짝짓는다(새 태그가 원래 태그 앞이어도)", () => {
		// 원래 [sighs]는 '가' 뒤(자리 1), 새 [sighs]는 맨 앞(자리 0)이다
		expect(newTagMarks("가 [sighs] 나", "[sighs] 가 [sighs] 나")).toEqual([
			{ text: "[sighs]", mark: true },
			{ text: " 가 [sighs] 나", mark: false },
		]);
		// 원래 태그 뒤에 넣은 경우도 그대로
		expect(newTagMarks("가 [sighs] 나", "가 [sighs] 나 [sighs]")).toEqual([
			{ text: "가 [sighs] 나 ", mark: false },
			{ text: "[sighs]", mark: true },
		]);
	});
	it("자리는 공백·태그를 뺀 글자 수라 넣기 공백(insertTagSpaced의 ' [x] ')이 달라도 같다", () => {
		expect(newTagMarks("가나[laughs]다", "가 [x] 나 [laughs] 다")).toEqual([
			{ text: "가 ", mark: false },
			{ text: "[x]", mark: true },
			{ text: " 나 [laughs] 다", mark: false },
		]);
	});
	it("자리가 옮겨진 원래 태그는 같은 값으로 짝지어 mark가 아니다", () => {
		expect(newTagMarks("[sighs] 가 나", "가 [sighs] 나")).toEqual([
			{ text: "가 [sighs] 나", mark: false },
		]);
	});
	it("<삼국지>는 태그가 아니다(한글 꺾쇠는 대본 글)", () => {
		expect(newTagMarks("가", "<삼국지> 가")).toEqual([
			{ text: "<삼국지> 가", mark: false },
		]);
		expect(
			newTagMarks("<삼국지>를 읽어요", "<삼국지>를 [sighs] 읽어요"),
		).toEqual([
			{ text: "<삼국지>를 ", mark: false },
			{ text: "[sighs]", mark: true },
			{ text: " 읽어요", mark: false },
		]);
	});
});

describe("excerptMarks(긴 글은 새 태그 둘레만, critique P1)", () => {
	it("짧은 글은 그대로", () => {
		const parts = newTagMarks("안녕 하세요", "안녕 [sighs] 하세요");
		expect(excerptMarks(parts)).toEqual(parts);
		// 앞뒤 40자 × 2 + 태그 길이 정도면 자르지 않는다
		const edge = newTagMarks("가".repeat(79), `[sighs] ${"가".repeat(79)}`);
		expect(excerptMarks(edge)).toEqual(edge);
		// 새 태그가 없으면 자를 기준이 없어 그대로
		const plain = [{ text: "가".repeat(200), mark: false }];
		expect(excerptMarks(plain)).toEqual(plain);
	});
	it("긴 글은 새 태그 앞뒤 radius 글자만 남기고 잘린 앞뒤를 '…'로 잇는다(기본 40)", () => {
		const parts = newTagMarks(
			`${"가".repeat(100)}${"나".repeat(100)}`,
			`${"가".repeat(100)}[sighs] ${"나".repeat(100)}`,
		);
		expect(excerptMarks(parts)).toEqual([
			{ text: "…", mark: false },
			{ text: "가".repeat(40), mark: false },
			{ text: "[sighs]", mark: true },
			{ text: ` ${"나".repeat(39)}`, mark: false },
			{ text: "…", mark: false },
		]);
	});
	it("떨어진 새 태그 사이는 '…' 하나로 잇고, 가까우면 잇지 않는다", () => {
		expect(
			excerptMarks(
				[
					{ text: "0123456789", mark: false },
					{ text: "[x]", mark: true },
					{ text: "abcdefghij", mark: false },
					{ text: "[y]", mark: true },
					{ text: "ABCDEFGHIJ", mark: false },
				],
				3,
			),
		).toEqual([
			{ text: "…", mark: false },
			{ text: "789", mark: false },
			{ text: "[x]", mark: true },
			{ text: "abc", mark: false },
			{ text: "…", mark: false },
			{ text: "hij", mark: false },
			{ text: "[y]", mark: true },
			{ text: "ABC", mark: false },
			{ text: "…", mark: false },
		]);
		expect(
			excerptMarks(
				[
					{ text: "ab", mark: false },
					{ text: "[x]", mark: true },
					{ text: "cd", mark: false },
					{ text: "[y]", mark: true },
					{ text: "efghijklmnop", mark: false },
				],
				3,
			),
		).toEqual([
			{ text: "ab", mark: false },
			{ text: "[x]", mark: true },
			{ text: "cd", mark: false },
			{ text: "[y]", mark: true },
			{ text: "efg", mark: false },
			{ text: "…", mark: false },
		]);
	});
	it("발췌 경계가 원래 태그 가운데면 태그 밖으로 밀어 반쪽 태그를 보이지 않는다", () => {
		// 새 [laughs]는 94에서 시작해 앞 40자 경계(54)가 원래 [sighs](50~56) 가운데다
		const parts = newTagMarks(
			`${"나".repeat(50)}[sighs]${"가".repeat(37)}${"다".repeat(50)}`,
			`${"나".repeat(50)}[sighs]${"가".repeat(37)}[laughs]${"다".repeat(50)}`,
		);
		expect(excerptMarks(parts)).toEqual([
			{ text: "…", mark: false },
			{ text: `[sighs]${"가".repeat(37)}`, mark: false },
			{ text: "[laughs]", mark: true },
			{ text: "다".repeat(40), mark: false },
			{ text: "…", mark: false },
		]);
	});
	it("자를 때 BMP 밖 글자(이모지)를 반으로 가르지 않는다", () => {
		const shown = excerptMarks(
			[
				{ text: "😀".repeat(10), mark: false },
				{ text: "[x]", mark: true },
			],
			2,
		);
		expect(shown).toEqual([
			{ text: "…", mark: false },
			{ text: "😀😀", mark: false },
			{ text: "[x]", mark: true },
		]);
	});
});
