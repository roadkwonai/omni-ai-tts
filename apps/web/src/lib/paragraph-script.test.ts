import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
	STUDIO_TEXT_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it, vi } from "vitest";

import { findTargets, paragraphStatus } from "./make-all";
import { readingItems } from "./number-reading";

// 엔진 호출 수를 세려고 원래 함수를 그대로 감싼다
vi.mock("./number-reading", async (importOriginal) => {
	const real = await importOriginal<typeof import("./number-reading")>();
	return { ...real, readingItems: vi.fn(real.readingItems) };
});

import {
	applyCertain,
	batchFollow,
	batchGap,
	batchRemove,
	batchSpeaker,
	batchVoice,
	blankFor,
	blockOf,
	type Decision,
	decide,
	decisionsOf,
	followDefault,
	followOf,
	idleSpeakerCount,
	insertAfter,
	isCertain,
	mergeNext,
	move,
	ownSettings,
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	paragraphRequest,
	pasteAt,
	pasteToParts,
	removeAt,
	reviewOf,
	type Speaker,
	sameVoice,
	setupRequest,
	speakerMax,
	speakerParagraphCount,
	speakerRestore,
	speakersAdd,
	splitAt,
	splitBlocks,
	splitLong,
	spokenOf,
	spokenPartsOf,
	tooLongOf,
	undecide,
	unreviewedCount,
	unreviewedList,
	type VoiceSetup,
	voiceOf,
	type Work,
} from "./paragraph-script";
import { requestOf } from "./trial-view";

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
const eleven: VoiceSetup = {
	provider: "elevenlabs",
	voiceId: "el_1",
	settings: DEFAULT_SETTINGS.elevenlabs,
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
const many = (n: number) =>
	Array.from({ length: n }, (_, i) => para(`p${i}`, `문단 ${i + 1}`));
const blocks = (n: number) =>
	Array.from({ length: n }, (_, i) => `덩어리 ${i + 1}`).join("\n\n");

describe("splitBlocks", () => {
	it("여러 빈 줄·공백만인 줄·CRLF를 하나의 경계로 본다", () => {
		expect(splitBlocks("가\r\n\r\n나\n  \n\t\n\n다\n라\r\n\r\n\r\n마")).toEqual(
			["가", "나", "다\n라", "마"],
		);
	});
	it("앞뒤 공백을 지우고 빈 덩어리를 버린다", () => {
		expect(splitBlocks("  \n\n  가 나  \n\n \n\n")).toEqual(["가 나"]);
		expect(splitBlocks(" \n \n ")).toEqual([]);
	});
});

describe("splitLong", () => {
	it("NaN 상한은 분할 전에 거절한다", () => {
		expect(() => splitLong("안녕", Number.NaN)).toThrow(RangeError);
	});
	it("양의 정수가 아닌 상한은 빈 입력에서도 거절한다", () => {
		for (const max of [
			0,
			-1,
			1.5,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			expect(() => splitLong("", max)).toThrow(RangeError);
			expect(() => splitLong("안녕", max)).toThrow(RangeError);
		}
	});
	it("2,000자 안의 마지막 문장 끝에서 자른다", () => {
		const first = `${"가".repeat(1500)}다. ${"나".repeat(400)}요.`;
		const block = `${first} ${"라".repeat(500)}`;
		expect(splitLong(block, STUDIO_TEXT_MAX)).toEqual([
			first,
			"라".repeat(500),
		]);
		// 줄바꿈도 문장 끝이다
		expect(splitLong("하나 둘\n셋 넷", 6)).toEqual(["하나 둘", "셋 넷"]);
	});
	it("문장 끝이 없으면 마지막 공백", () => {
		expect(splitLong("하나 둘 셋 넷", 5)).toEqual(["하나 둘", "셋 넷"]);
		// 숫자 속 마침표(공백이 뒤따르지 않음)는 문장 끝이 아니다
		expect(splitLong("값은 3.14 이다", 8)).toEqual(["값은 3.14", "이다"]);
	});
	it("공백도 없는 URL은 정확히 max에서 자르고 서로게이트를 가르지 않는다", () => {
		const url = `https://example.com/${"a".repeat(30)}`;
		expect(splitLong(url, 20)).toEqual([
			url.slice(0, 20),
			url.slice(20, 40),
			url.slice(40),
		]);
		expect(splitLong(`${"😀".repeat(5)}a.b.c`, 4)).toEqual([
			"😀😀😀😀",
			"😀a.b",
			".c",
		]);
	});
	it("모든 조각이 1~max자", () => {
		const block = [
			"첫 문장이에요. 둘째 문장!",
			"https://example.com/very/long/path?query=1",
			"😀😀😀 이모지와 띄어쓰기없는긴글자가이어집니다요.",
			"마지막…   끝",
		].join(" ");
		for (const max of [1, 3, 7, 12, 40]) {
			const pieces = splitLong(block, max);
			for (const piece of pieces) {
				expect([...piece].length).toBeGreaterThanOrEqual(1);
				expect([...piece].length).toBeLessThanOrEqual(max);
				expect(piece).toBe(piece.trim());
			}
			expect(pieces.join("").replace(/\s/g, "")).toBe(block.replace(/\s/g, ""));
		}
	});
});

// 화자 없는 대본의 결과를 T10-a pasteToTexts와 같게 고정한다(스펙 17.5-5)
const textsOf = (raw: string, room: number, max = STUDIO_TEXT_MAX) => {
	const { parts, extra } = pasteToParts(raw, () => max, room);
	return { texts: parts.map((part) => part.text), extra };
};

describe("pasteToParts: 화자 없는 대본은 T10-a와 같다", () => {
	it("200개를 넘으면 앞 room개와 extra", () => {
		const raw = blocks(PARAGRAPHS_MAX + 5);
		const all = textsOf(raw, PARAGRAPHS_MAX);
		expect(all.texts).toHaveLength(PARAGRAPHS_MAX);
		expect(all.texts.at(-1)).toBe(`덩어리 ${PARAGRAPHS_MAX}`);
		expect(all.extra).toBe(5);
		expect(textsOf(blocks(4), 3)).toEqual({
			texts: ["덩어리 1", "덩어리 2", "덩어리 3"],
			extra: 1,
		});
	});
	it("조각에 화자 칸이 없고 화자 이름 목록은 비어 있다", () => {
		expect(pasteToParts("하나\n\n둘", () => 2000, 10)).toEqual({
			parts: [{ text: "하나" }, { text: "둘" }],
			names: [],
			extra: 0,
			long: 0,
		});
	});
	it("NFC가 아닌 입력도 글을 그대로 둔다(조합 키가 바뀌지 않게)", () => {
		const decomposed = "é 한한";
		expect(textsOf(`${decomposed}\n줄바꿈 뒤\n\n둘`, 10).texts).toEqual([
			`${decomposed}\n줄바꿈 뒤`,
			"둘",
		]);
	});
	it("상한을 넘는 덩어리는 문장 끝에서 더 나누고 long으로 센다", () => {
		const raw = `${"가".repeat(7)}. ${"나".repeat(5)}\n\n짧음`;
		const out = pasteToParts(raw, () => 10, 10);
		expect(out.parts.map((part) => part.text)).toEqual([
			`${"가".repeat(7)}.`,
			"나".repeat(5),
			"짧음",
		]);
		expect(out.long).toBe(1);
	});
	it("대사 속 콜론·시각·주소가 앞에 있는 줄은 화자가 아니다", () => {
		expect(textsOf("12:30 회의\nhttps://example.com", 10).texts).toEqual([
			"12:30 회의\nhttps://example.com",
		]);
	});
});

describe("pasteToParts: 화자 줄(T10 스펙 17.1 문단 나누기)", () => {
	const parts = (raw: string) => pasteToParts(raw, () => 2000, 100);
	it("화자 줄마다 새 문단이고 이름은 글에서 빠진다", () => {
		expect(parts("민수: 안녕\n지아: 반가워")).toEqual({
			parts: [
				{ text: "안녕", speaker: "민수" },
				{ text: "반가워", speaker: "지아" },
			],
			names: ["민수", "지아"],
			extra: 0,
			long: 0,
		});
	});
	it("전각 콜론, 이름·대사 앞뒤 공백 정리, 대사 속 콜론은 대사", () => {
		expect(parts("민수 ：  시간은 12:30이야  ").parts).toEqual([
			{ text: "시간은 12:30이야", speaker: "민수" },
		]);
	});
	it("덩어리 안에서 이름 없는 줄은 앞 문단에 줄바꿈으로 이어 붙는다", () => {
		expect(parts("민수: 안녕\n하세요\n지아: 응").parts).toEqual([
			{ text: "안녕\n하세요", speaker: "민수" },
			{ text: "응", speaker: "지아" },
		]);
	});
	it("빈 줄 경계는 늘 새 문단을 시작하고 앞 덩어리의 마지막 화자를 잇는다", () => {
		expect(parts("민수: 안녕\n\n이어서\n\n지아: 응\n\n끝").parts).toEqual([
			{ text: "안녕", speaker: "민수" },
			{ text: "이어서", speaker: "민수" },
			{ text: "응", speaker: "지아" },
			{ text: "끝", speaker: "지아" },
		]);
	});
	it("덩어리의 첫 화자 줄 앞 줄들은 앞 덩어리의 마지막 화자를 이은 문단이다", () => {
		expect(parts("민수: 안녕\n\n설명\n지아: 응").parts).toEqual([
			{ text: "안녕", speaker: "민수" },
			{ text: "설명", speaker: "민수" },
			{ text: "응", speaker: "지아" },
		]);
	});
	it("첫 덩어리의 첫 화자 줄 앞 줄들은 화자가 없다", () => {
		expect(parts("설명\n민수: 안녕").parts).toEqual([
			{ text: "설명" },
			{ text: "안녕", speaker: "민수" },
		]);
	});
	it("대사가 빈 화자 줄은 건너뛰고 그 화자도 만들지 않는다", () => {
		expect(parts("민수:\n지아: 응")).toMatchObject({
			parts: [{ text: "응", speaker: "지아" }],
			names: ["지아"],
		});
	});
	it("같은 이름은 한 번만 센다(나온 순서)", () => {
		expect(parts("지아: 가\n민수: 나\n지아: 다").names).toEqual([
			"지아",
			"민수",
		]);
	});
	it("상한은 그 화자의 성우 기준이고 이어 붙은 조각도 같은 화자다", () => {
		const out = pasteToParts(
			`민수: ${"가".repeat(12)}\n지아: ${"나".repeat(12)}`,
			(speaker) => (speaker === "지아" ? 5 : 10),
			100,
		);
		expect(out.parts).toEqual([
			{ text: "가".repeat(10), speaker: "민수" },
			{ text: "가".repeat(2), speaker: "민수" },
			{ text: "나".repeat(5), speaker: "지아" },
			{ text: "나".repeat(5), speaker: "지아" },
			{ text: "나".repeat(2), speaker: "지아" },
		]);
		expect(out.long).toBe(2);
	});
	it("room을 넘는 조각은 extra이고 화자 이름은 남은 조각만 센다", () => {
		expect(parts("민수: 가\n지아: 나\n현우: 다")).toMatchObject({
			names: ["민수", "지아", "현우"],
		});
		expect(
			pasteToParts("민수: 가\n지아: 나\n현우: 다", () => 2000, 2),
		).toMatchObject({
			names: ["민수", "지아"],
			extra: 1,
		});
	});
});

describe("speakerMax(화자가 따르는 성우의 상한)", () => {
	const airy: VoiceSetup = {
		provider: "airy",
		voiceId: "a_1",
		settings: DEFAULT_SETTINGS.airy,
	};
	const w = work({ speakers: [{ name: "지아", voice: airy }] });
	it("화자 성우 → 기본 성우(목록에 없는 새 이름 포함) → 성우 없으면 일반 상한", () => {
		expect(speakerMax(w, "지아")).toBe(1600);
		expect(speakerMax(w, "새이름")).toBe(STUDIO_TEXT_MAX);
		expect(speakerMax(w)).toBe(STUDIO_TEXT_MAX);
		expect(speakerMax(work({ defaultVoice: airy }), "새이름")).toBe(1600);
		expect(speakerMax(work({ defaultVoice: null }), "새이름")).toBe(
			STUDIO_TEXT_MAX,
		);
	});
});

describe("pasteAt", () => {
	it("커서 앞 글과 첫 덩어리는 지금 카드, 가운데 덩어리는 새 카드, 마지막 덩어리에 커서 뒤 글", () => {
		const a = para("a", "앞뒤");
		const b = para("b", "다음");
		const out = pasteAt(
			[a, b],
			"a",
			{ start: 1, end: 1 },
			"하나\n\n둘\n\n셋",
			work(),
			PARAGRAPHS_MAX - 2,
		);
		expect(out?.extra).toBe(0);
		expect(out?.ps.map((p) => p.text)).toEqual([
			"앞하나",
			"둘",
			"셋뒤",
			"다음",
		]);
		expect(out?.ps[0]?.id).toBe("a");
		const ids = new Set(out?.ps.map((p) => p.id));
		expect(ids.size).toBe(4);
		expect(out?.ps[3]).toBe(b);
	});
	it("새 카드는 지금 카드의 voice·gap 상태를 물려받는다", () => {
		const own = para("a", "", { voice: eleven, gap: 1.2 });
		const out = pasteAt(
			[own],
			"a",
			{ start: 0, end: 0 },
			"하나\n\n둘",
			work(),
			PARAGRAPHS_MAX - 1,
		);
		for (const p of out?.ps ?? []) {
			expect(p.voice).toEqual(eleven);
			expect(p.gap).toBe(1.2);
		}
		const follow = pasteAt(
			[para("a", "")],
			"a",
			{ start: 0, end: 0 },
			"하나\n\n둘",
			work(),
			PARAGRAPHS_MAX - 1,
		);
		expect(follow?.ps).toHaveLength(2);
		for (const p of follow?.ps ?? []) {
			expect(p.voice).toBeUndefined();
			expect(p.gap).toBeUndefined();
		}
	});
	it("빈 줄 없는 글은 null(가로채지 않음)", () => {
		const ps = [para("a", "가")];
		const sel = { start: 1, end: 1 };
		expect(pasteAt(ps, "a", sel, "한 줄\n두 줄", work(), 199)).toBeNull();
		expect(pasteAt(ps, "a", sel, "가".repeat(3000), work(), 199)).toBeNull();
		expect(pasteAt(ps, "a", sel, "하나\n\n", work(), 199)).toBeNull();
	});
	it("선택 영역은 붙여 넣은 글로 바뀐다", () => {
		const out = pasteAt(
			[para("a", "가나다라")],
			"a",
			{ start: 1, end: 3 },
			"X\n\nY",
			work(),
			PARAGRAPHS_MAX - 1,
		);
		expect(out?.ps.map((p) => p.text)).toEqual(["가X", "Y라"]);
	});
	it("카드 붙여 넣기도 200개에서 멈추고 extra", () => {
		const ps = many(PARAGRAPHS_MAX - 1);
		const out = pasteAt(ps, "p0", { start: 0, end: 0 }, blocks(4), work(), 1);
		expect(out?.ps).toHaveLength(PARAGRAPHS_MAX);
		expect(out?.extra).toBe(2);
		expect(out?.ps[0]?.text).toBe("덩어리 1");
		// 넣지 못한 덩어리가 있어도 커서 뒤 글은 남는다
		expect(out?.ps[1]?.text).toBe("덩어리 2문단 1");
	});
	it("화자 없는 대본은 화자 칸·화자 목록 변화 없이 T10-a와 같다", () => {
		const out = pasteAt(
			[para("a", "")],
			"a",
			{ start: 0, end: 0 },
			"하나\n\n둘",
			work(),
			10,
		);
		expect(out).toMatchObject({
			extra: 0,
			speakers: null,
			named: null,
			blocked: null,
		});
		expect(out?.ps.some((p) => "speaker" in p)).toBe(false);
	});
});

describe("pasteAt: 화자 줄(계획 2.3 카드 붙여 넣기 규칙)", () => {
	const sel0 = { start: 0, end: 0 };
	const airy: VoiceSetup = {
		provider: "airy",
		voiceId: "a_1",
		settings: DEFAULT_SETTINGS.airy,
	};
	it("빈 카드에 빈 줄 없는 화자 대본을 붙여 넣으면 나뉘고 지금 카드가 첫 화자가 된다(자기 성우 비움)", () => {
		const out = pasteAt(
			[para("a", "", { voice: eleven, gap: 1 })],
			"a",
			sel0,
			"민수: 안녕\n지아: 반가워",
			work(),
			10,
		);
		expect(out?.ps).toHaveLength(2);
		expect(out?.ps[0]).toEqual({
			id: "a",
			text: "안녕",
			speaker: "민수",
			gap: 1,
		});
		expect(out?.ps[1]).toMatchObject({
			text: "반가워",
			speaker: "지아",
			gap: 1,
		});
		expect(out?.ps[1]?.id).not.toBe("a");
		expect(out?.ps[1]).not.toHaveProperty("voice");
		expect(out?.speakers).toEqual([
			{ name: "민수", voice: null },
			{ name: "지아", voice: null },
		]);
		expect(out?.named).toBeNull();
	});
	it("커서 앞 글이 있으면 지금 카드는 화자·성우 그대로이고 첫 화자 조각부터 새 카드다", () => {
		const a = para("a", "앞뒤", { voice: eleven, speaker: "현우" });
		const out = pasteAt(
			[a],
			"a",
			{ start: 1, end: 1 },
			"민수: 안녕\n지아: 응",
			work({ speakers: [{ name: "현우", voice: null }] }),
			10,
		);
		expect(out?.ps.map((p) => p.text)).toEqual(["앞", "안녕", "응뒤"]);
		expect(out?.ps[0]).toMatchObject({
			id: "a",
			voice: eleven,
			speaker: "현우",
		});
		expect(out?.ps.slice(1).map((p) => p.speaker)).toEqual(["민수", "지아"]);
		for (const p of out?.ps.slice(1) ?? [])
			expect(p).not.toHaveProperty("voice");
		expect(out?.speakers?.map((s) => s.name)).toEqual(["현우", "민수", "지아"]);
	});
	it("카드 글 가운데 붙여 넣는 `시간: 3시` 한 줄은 가로채지 않는다", () => {
		expect(
			pasteAt(
				[para("a", "회의")],
				"a",
				{ start: 2, end: 2 },
				"시간: 3시",
				work(),
				10,
			),
		).toBeNull();
	});
	it("화자 줄이 아닌 한 줄·주소 한 줄은 맨 앞에서도 가로채지 않는다", () => {
		expect(
			pasteAt([para("a", "")], "a", sel0, "그냥 글", work(), 10),
		).toBeNull();
		expect(
			pasteAt([para("a", "")], "a", sel0, "https://example.com", work(), 10),
		).toBeNull();
	});
	it("화자 없는 조각으로 생긴 새 카드는 지금 카드의 화자와 성우를 잇고, 화자 조각 카드는 성우 없이 화자를 따른다", () => {
		const a = para("a", "", { voice: eleven, speaker: "현우", gap: 1.2 });
		const out = pasteAt(
			[a],
			"a",
			sel0,
			"하나\n\n둘\n\n지아: 셋",
			work({ speakers: [{ name: "현우", voice: null }] }),
			10,
		);
		expect(out?.ps).toHaveLength(3);
		expect(out?.ps[0]).toMatchObject({
			id: "a",
			text: "하나",
			voice: eleven,
			speaker: "현우",
		});
		expect(out?.ps[1]).toMatchObject({
			text: "둘",
			voice: eleven,
			speaker: "현우",
			gap: 1.2,
		});
		expect(out?.ps[2]).toMatchObject({ text: "셋", speaker: "지아", gap: 1.2 });
		expect(out?.ps[2]).not.toHaveProperty("voice");
	});
	it("커서 뒤 글은 마지막 조각에 붙고 그 조각의 화자를 따른다", () => {
		const out = pasteAt(
			[para("a", "뒷글", { speaker: "현우" })],
			"a",
			sel0,
			"민수: 안녕\n지아: 응",
			work(),
			10,
		);
		expect(out?.ps.at(-1)).toMatchObject({ text: "응뒷글", speaker: "지아" });
	});
	it("조각 하나만 가로챈 경우(빈 카드·글이 있는 카드의 맨 앞) 화자 이름을 돌려주고 200개 문구가 필요 없다", () => {
		const empty = pasteAt([para("a", "")], "a", sel0, "민수: 안녕", work(), 10);
		expect(empty).toMatchObject({ named: "민수", extra: 0, blocked: null });
		expect(empty?.ps).toHaveLength(1);
		expect(empty?.ps[0]).toMatchObject({
			id: "a",
			text: "안녕",
			speaker: "민수",
		});
		const filled = pasteAt(
			[para("a", "글")],
			"a",
			sel0,
			"민수: 안녕",
			work(),
			10,
		);
		expect(filled).toMatchObject({ named: "민수", extra: 0 });
		expect(filled?.ps[0]?.text).toBe("안녕글");
		// 200장이어도 나눌 것이 없으니 자리와 상관없다
		const full = pasteAt(
			many(PARAGRAPHS_MAX),
			"p0",
			sel0,
			"민수: 안녕",
			work(),
			0,
		);
		expect(full).toMatchObject({ named: "민수", extra: 0, blocked: null });
		expect(full?.ps).toHaveLength(PARAGRAPHS_MAX);
	});
	it("화자별 상한: 화자 조각은 그 화자가 따르는 성우의 상한, 화자 없는 조각은 지금 카드의 상한", () => {
		const w = work({ speakers: [{ name: "지아", voice: airy }] });
		const out = pasteAt(
			[para("a", "")],
			"a",
			sel0,
			`민수: ${"가".repeat(1700)}\n지아: ${"나".repeat(1700)}`,
			w,
			10,
		);
		expect(out?.ps.map((p) => [p.speaker, p.text.length])).toEqual([
			["민수", 1700],
			["지아", 1600],
			["지아", 100],
		]);
		// 화자 없는 조각(맨 앞 설명)은 지금 카드 voiceOf의 상한(Airy 1,600)
		const lead = pasteAt(
			[para("a", "", { voice: airy })],
			"a",
			sel0,
			`${"다".repeat(1700)}\n\n민수: 라`,
			work(),
			10,
		);
		expect(lead?.ps.map((p) => p.text.length)).toEqual([1600, 100, 1]);
	});
	it("자리: 200장에서 커서 앞 글 + 화자 줄이면 200개를 지키고 알림만(blocked full)", () => {
		const ps = many(PARAGRAPHS_MAX);
		const out = pasteAt(
			ps,
			"p0",
			{ start: 1, end: 1 },
			"민수: 안녕\n지아: 응",
			work(),
			0,
		);
		expect(out).toMatchObject({ blocked: "full", speakers: null, named: null });
		expect(out?.ps).toBe(ps);
	});
	it("자리: 첫 조각이 지금 카드에 합쳐지면 room + 1까지, 모두 새 카드면 room개까지(200개를 넘지 않음)", () => {
		const merged = pasteAt(
			many(PARAGRAPHS_MAX),
			"p0",
			sel0,
			"민수: 가\n지아: 나\n현우: 다",
			work(),
			0,
		);
		expect(merged?.ps).toHaveLength(PARAGRAPHS_MAX);
		expect(merged).toMatchObject({ extra: 2, blocked: null });
		// 안 들어간 조각의 화자는 목록에 더하지 않는다
		expect(merged?.speakers?.map((s) => s.name)).toEqual(["민수"]);
		const fresh = pasteAt(
			many(PARAGRAPHS_MAX - 2),
			"p0",
			{ start: 1, end: 1 },
			"민수: 가\n지아: 나\n현우: 다",
			work(),
			2,
		);
		expect(fresh?.ps).toHaveLength(PARAGRAPHS_MAX);
		expect(fresh).toMatchObject({ extra: 1 });
		expect(fresh?.speakers?.map((s) => s.name)).toEqual(["민수", "지아"]);
	});
	it("화자 상한 20명은 기존 목록 ∪ 새 이름으로 센다: 넘으면 글을 넣지 않고 blocked speakers", () => {
		const list = Array.from({ length: 19 }, (_, i) => ({
			name: `화자${i}`,
			voice: null,
		}));
		const ps = [para("a", "")];
		const over = pasteAt(
			ps,
			"a",
			sel0,
			"새1: 가\n새2: 나",
			work({ speakers: list }),
			10,
		);
		expect(over).toMatchObject({ blocked: "speakers", speakers: null });
		expect(over?.ps).toBe(ps);
		// 기존 이름과 새 이름 하나는 20명이라 들어간다
		const ok = pasteAt(
			ps,
			"a",
			sel0,
			"화자0: 가\n새1: 나",
			work({ speakers: list }),
			10,
		);
		expect(ok?.blocked).toBeNull();
		expect(ok?.speakers).toHaveLength(20);
		// 20명이 꽉 차도 기존 이름만이면 그대로 들어간다
		const full = [...list, { name: "화자19", voice: null }];
		const same = pasteAt(
			ps,
			"a",
			sel0,
			"화자3: 가\n화자4: 나",
			work({ speakers: full }),
			10,
		);
		expect(same).toMatchObject({ blocked: null, speakers: null });
	});
});

describe("편집", () => {
	it("splitAt: 커서 앞뒤로 나누고 뒤 문단이 성우·쉼 상태를 물려받는다", () => {
		const a = para("a", "가나다라", { voice: eleven, gap: 1 });
		const out = splitAt([a], "a", 2);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ id: "a", text: "가나", voice: eleven, gap: 1 });
		expect(out[1]).toMatchObject({ text: "다라", voice: eleven, gap: 1 });
		expect(out[1]?.id).not.toBe("a");
		// 200개면 아무것도 하지 않는다(브리프 6.1)
		const full = many(PARAGRAPHS_MAX);
		expect(splitAt(full, "p0", 1)).toBe(full);
		expect(insertAfter(full, "p0")).toBe(full);
	});
	it("mergeNext: 앞 문단 성우, 뒤 문단 쉼, caret은 이은 자리, 마지막 문단은 null", () => {
		const a = para("a", "😀가", { voice: eleven, gap: 1 });
		const b = para("b", "나다", { gap: 2 });
		const out = mergeNext([a, b], "a");
		expect(out?.ps).toEqual([
			{ id: "a", text: "😀가 나다", voice: eleven, gap: 2 },
		]);
		expect(out?.caret).toBe(4);
		expect(out?.ps[0]?.text.slice(out.caret)).toBe("나다");
		// 한쪽이 비면 공백 없이 잇는다. 뒤 문단 쉼이 없으면 합친 문단도 기본 쉼
		expect(mergeNext([para("a", "", { gap: 1 }), b], "a")).toEqual({
			ps: [{ id: "a", text: "나다", gap: 2 }],
			caret: 0,
		});
		const kept = mergeNext([a, para("b", "")], "a");
		expect(kept?.ps[0]?.text).toBe("😀가");
		expect(kept?.ps[0]?.gap).toBeUndefined();
		expect(kept?.caret).toBe(3);
		expect(mergeNext([a, b], "b")).toBeNull();
	});
	it("sameVoice: 둘 다 기본을 따르면 참, 같은 성우라도 설정이 다르면 거짓", () => {
		const w = work();
		const a = para("a", "가");
		const b = para("b", "나");
		expect(sameVoice(a, b, w)).toBe(true);
		expect(sameVoice(a, b, work({ defaultVoice: null }))).toBe(true);
		const copied = para("c", "다", { voice: { ...typecast } });
		expect(sameVoice(a, copied, w)).toBe(true);
		const faster = para("d", "라", {
			voice: {
				...typecast,
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.2 },
			},
		});
		expect(sameVoice(a, faster, w)).toBe(false);
		expect(sameVoice(a, para("e", "마", { voice: eleven }), w)).toBe(false);
		expect(
			sameVoice(
				a,
				para("f", "바", { voice: { ...typecast, voiceId: "x" } }),
				w,
			),
		).toBe(false);
	});
	it("removeAt: 마지막 하나는 빈 문단으로", () => {
		const [a, b] = [
			para("a", "가", { voice: eleven, gap: 1 }),
			para("b", "나"),
		];
		expect(removeAt([a, b], "a")).toEqual([b]);
		const left = removeAt([a], "a");
		expect(left).toHaveLength(1);
		expect(left[0]?.text).toBe("");
		expect(left[0]?.voice).toBeUndefined();
		expect(left[0]?.gap).toBeUndefined();
		expect(left[0]?.id).not.toBe("a");
	});
	it("move: 첫 문단 위로·마지막 아래로는 그대로", () => {
		const ps = many(3);
		expect(move(ps, "p0", -1)).toBe(ps);
		expect(move(ps, "p2", 1)).toBe(ps);
		expect(move(ps, "p1", -1).map((p) => p.id)).toEqual(["p1", "p0", "p2"]);
		expect(move(ps, "p1", 1).map((p) => p.id)).toEqual(["p0", "p2", "p1"]);
	});
	it("바뀌지 않은 문단은 같은 객체", () => {
		const ps = many(4);
		const [p0, , p2, p3] = ps as [Paragraph, Paragraph, Paragraph, Paragraph];
		const same = (out: readonly Paragraph[], kept: readonly Paragraph[]) => {
			for (const p of kept) expect(out).toContain(p);
		};
		same(splitAt(ps, "p1", 1), [p0, p2, p3]);
		same(mergeNext(ps, "p1")?.ps ?? [], [p0, p3]);
		same(move(ps, "p1", 1), ps);
		same(removeAt(ps, "p1"), [p0, p2, p3]);
		same(insertAfter(ps, "p1"), ps);
		same(
			pasteAt(ps, "p1", { start: 0, end: 0 }, "가\n\n나", work(), 196)?.ps ??
				[],
			[p0, p2, p3],
		);
		const inserted = insertAfter(ps, "p1");
		expect(inserted.map((p) => p.text)).toEqual([
			"문단 1",
			"문단 2",
			"",
			"문단 3",
			"문단 4",
		]);
		expect(new Set(inserted.map((p) => p.id)).size).toBe(5);
	});
});

describe("paragraphRequest·blockOf", () => {
	it("기본을 따르면 기본 성우로 요청", () => {
		const v30 = voice({
			models: [{ model: "ssfm-v30", emotions: ["normal"] }],
		});
		const req = paragraphRequest(
			para("a", "안녕"),
			work(),
			[saved({ voice: v30 })],
			NOW,
		);
		expect(req).toEqual({
			provider: "typecast",
			voiceId: "tc_1",
			text: "안녕",
			settings: DEFAULT_SETTINGS.typecast,
		});
		// 자기 성우가 있으면 그 성우
		const el = saved({
			voice: voice({ provider: "elevenlabs", voiceId: "el_1" }),
		});
		expect(
			paragraphRequest(para("b", "안녕", { voice: eleven }), work(), [el], NOW),
		).toEqual({
			provider: "elevenlabs",
			voiceId: "el_1",
			text: "안녕",
			settings: DEFAULT_SETTINGS.elevenlabs,
		});
	});
	it("v21 전용 Typecast 성우 + 저장 v30·smart → 요청 v21·preset", () => {
		const v21 = voice({
			models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
		});
		const req = paragraphRequest(
			para("a", "안녕"),
			work(),
			[saved({ voice: v21 })],
			NOW,
		);
		expect(req?.settings).toMatchObject({
			model: "ssfm-v21",
			emotion: "preset",
			preset: "normal",
		});
	});
	it("Fish 무료 종료 뒤(2026-12-01 KST) 무료 설정 → s2.1-pro", () => {
		const fish: VoiceSetup = {
			provider: "fish_audio",
			voiceId: "f_1",
			settings: DEFAULT_SETTINGS.fish_audio,
		};
		const voices = [
			saved({ voice: voice({ provider: "fish_audio", voiceId: "f_1" }) }),
		];
		const w = work({ defaultVoice: fish });
		const after = Date.parse("2026-12-01T00:00:00+09:00");
		expect(
			paragraphRequest(para("a", "안녕"), w, voices, after)?.settings,
		).toMatchObject({ model: "s2.1-pro" });
		expect(
			paragraphRequest(para("a", "안녕"), w, voices, NOW)?.settings,
		).toMatchObject({ model: "s2.1-pro-free" });
	});
	it("보관함에 없는 성우는 맞추지 않은 요청", () => {
		expect(paragraphRequest(para("a", "안녕"), work(), [], NOW)).toEqual({
			provider: "typecast",
			voiceId: "tc_1",
			text: "안녕",
			settings: DEFAULT_SETTINGS.typecast,
		});
	});
	it("voices가 null이면 null", () => {
		expect(paragraphRequest(para("a", "안녕"), work(), null, NOW)).toBeNull();
		expect(
			paragraphRequest(
				para("a", "안녕"),
				work({ defaultVoice: null }),
				[saved()],
				NOW,
			),
		).toBeNull();
	});
	it("막는 이유 순서: no_voice → unavailable → too_long", () => {
		const long = para("a", "가".repeat(STUDIO_TEXT_MAX + 1));
		expect(blockOf(long, work({ defaultVoice: null }), [saved()])).toBe(
			"no_voice",
		);
		expect(blockOf(long, work(), [])).toBe("unavailable");
		expect(blockOf(long, work(), [saved({ unavailable: true })])).toBe(
			"unavailable",
		);
		expect(blockOf(long, work(), [saved()])).toEqual({
			kind: "too_long",
			length: STUDIO_TEXT_MAX + 1,
			max: STUDIO_TEXT_MAX,
		});
		expect(blockOf(para("b", "안녕"), work(), [saved()])).toBeNull();
		const airy: VoiceSetup = {
			provider: "airy",
			voiceId: "airy_1",
			settings: DEFAULT_SETTINGS.airy,
		};
		const airySaved = saved({
			voice: voice({ provider: "airy", voiceId: "airy_1" }),
		});
		expect(
			blockOf(para("c", "가".repeat(1601), { voice: airy }), work(), [
				airySaved,
			]),
		).toEqual({ kind: "too_long", length: 1601, max: 1600 });
	});
	it("원문 8,001 UTF-16(코드 포인트 2,000 이하)도 too_long", () => {
		const text = `${"가".repeat(STUDIO_TEXT_MAX)}${" ".repeat(6001)}`;
		expect(text.length).toBe(STUDIO_TEXT_MAX * 4 + 1);
		expect(blockOf(para("a", text), work(), [saved()])).toEqual({
			kind: "too_long",
			length: STUDIO_TEXT_MAX,
			max: STUDIO_TEXT_MAX,
		});
		expect(blockOf(para("a", text.slice(1)), work(), [saved()])).toBeNull();
	});
	it("tooLongOf: 코드 포인트 초과와 원문 UTF-16 초과를 모두 잡고, 상한이면 null", () => {
		expect(tooLongOf("가".repeat(STUDIO_TEXT_MAX), "typecast")).toBeNull();
		expect(tooLongOf("가".repeat(STUDIO_TEXT_MAX + 1), "elevenlabs")).toEqual({
			length: STUDIO_TEXT_MAX + 1,
			max: STUDIO_TEXT_MAX,
		});
		expect(tooLongOf("가".repeat(1600), "airy")).toBeNull();
		expect(tooLongOf("가".repeat(1601), "airy")).toEqual({
			length: 1601,
			max: 1600,
		});
		// 앞뒤 공백은 코드 포인트에서 빠지지만 원문 UTF-16 상한(× 4)에는 든다
		const padded = `${"가".repeat(1600)}${" ".repeat(4801)}`;
		expect(padded.length).toBe(1600 * 4 + 1);
		expect(tooLongOf(padded, "airy")).toEqual({ length: 1600, max: 1600 });
		expect(tooLongOf(padded.slice(1), "airy")).toBeNull();
	});
	it("빈 문단은 요청 null이고 막지 않는다", () => {
		const blank = para("a", "  \n ");
		expect(paragraphRequest(blank, work(), [saved()], NOW)).toBeNull();
		expect(blockOf(blank, work({ defaultVoice: null }), [])).toBe("empty");
	});
});

describe("setupRequest(문단 요청·카드 설정 칸·기본 성우 설정 칸이 함께 쓰는 성우 맞춤)", () => {
	it("담은 성우면 그 성우가 받는 값(requestOf)으로 맞춘다. 빈 대본(설정 칸)도 같다", () => {
		const v21 = voice({
			models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
		});
		const voices = [saved({ voice: v21 })];
		const all = { ...DEFAULT_SETTINGS, typecast: typecast.settings };
		for (const text of ["", "안녕"])
			expect(setupRequest(typecast, voices, text, NOW)).toEqual(
				requestOf(v21, text, all, NOW),
			);
		expect(setupRequest(typecast, voices, "", NOW).settings).toMatchObject({
			model: "ssfm-v21",
			emotion: "preset",
			preset: "normal",
		});
	});
	it("now를 넘긴다: Fish 무료 종료 뒤(2026-12-01 KST) 무료 설정 → s2.1-pro", () => {
		const fish: VoiceSetup = {
			provider: "fish_audio",
			voiceId: "f_1",
			settings: DEFAULT_SETTINGS.fish_audio,
		};
		const voices = [
			saved({ voice: voice({ provider: "fish_audio", voiceId: "f_1" }) }),
		];
		const after = Date.parse("2026-12-01T00:00:00+09:00");
		expect(setupRequest(fish, voices, "", after).settings).toMatchObject({
			model: "s2.1-pro",
		});
		expect(setupRequest(fish, voices, "", NOW).settings).toMatchObject({
			model: "s2.1-pro-free",
		});
	});
	it("담지 않은 성우(목록에 없거나 다른 공급자)는 맞추지 않은 값에 대본만 붙인다", () => {
		expect(setupRequest(eleven, [saved()], "", NOW)).toEqual({
			...eleven,
			text: "",
		});
		expect(setupRequest(typecast, [], "안녕", NOW)).toEqual({
			...typecast,
			text: "안녕",
		});
	});
	it("paragraphRequest는 문단 성우·대본으로 setupRequest와 같은 값", () => {
		const p = para("a", "안녕", { voice: eleven });
		const el = saved({
			voice: voice({ provider: "elevenlabs", voiceId: "el_1" }),
		});
		expect(paragraphRequest(p, work(), [el], NOW)).toEqual(
			setupRequest(eleven, [el], "안녕", NOW),
		);
	});
});

describe("followDefault", () => {
	it("followDefault: 자기 성우를 지우면 voiceOf가 기본 성우가 되고, 이미 기본을 따르면 같은 객체", () => {
		const w = work();
		const own = para("a", "가", { voice: eleven, gap: 1 });
		const back = followDefault(own);
		expect(back).toEqual({ id: "a", text: "가", gap: 1 });
		expect("voice" in back).toBe(false);
		expect(voiceOf(back, w)).toBe(w.defaultVoice);
		expect(own.voice).toBe(eleven);
		const follow = para("b", "나");
		expect(followDefault(follow)).toBe(follow);
	});
});

describe("ownSettings", () => {
	it("기본을 따르던 문단에 속도를 바꾸면 기본을 복사한 자기 성우가 된다", () => {
		const w = work();
		const p = para("a", "가", { gap: 1 });
		const out = ownSettings(p, w, { tempo: 1.2 });
		expect(out).toEqual({
			id: "a",
			text: "가",
			gap: 1,
			voice: {
				provider: "typecast",
				voiceId: "tc_1",
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.2 },
			},
		});
		expect(w.defaultVoice?.settings).toEqual(DEFAULT_SETTINGS.typecast);
		// 자기 성우면 그 설정에 더한다. 기본 성우도 없으면 그대로
		expect(ownSettings(out, w, { pitch: 2 }).voice?.settings).toMatchObject({
			tempo: 1.2,
			pitch: 2,
		});
		expect(ownSettings(p, work({ defaultVoice: null }), { tempo: 1.2 })).toBe(
			p,
		);
	});
});

describe("보낼 글: 받지 않는 태그 빼기(T10 스펙 15.2)", () => {
	const fish: VoiceSetup = {
		provider: "fish_audio",
		voiceId: "f_1",
		settings: DEFAULT_SETTINGS.fish_audio,
	};
	const gemini: VoiceSetup = {
		provider: "gemini",
		voiceId: "g_1",
		settings: DEFAULT_SETTINGS.gemini,
	};
	const voices = [
		saved(),
		saved({
			id: "s2",
			voice: voice({ provider: "fish_audio", voiceId: "f_1" }),
		}),
		saved({ id: "s3", voice: voice({ provider: "gemini", voiceId: "g_1" }) }),
	];
	const textOf = (p: Paragraph) =>
		paragraphRequest(p, work(), voices, NOW)?.text;
	it("Typecast는 태그와 뒤 공백 한 칸을 빼고, Fish는 [태그]를 남기고, Gemini는 소리 꺾쇠만 남긴다", () => {
		expect(textOf(para("a", "안녕 [sighs] 하세요"))).toBe("안녕 하세요");
		expect(textOf(para("b", "안녕 [sighs] 하세요", { voice: fish }))).toBe(
			"안녕 [sighs] 하세요",
		);
		expect(
			textOf(para("c", "안녕 <sigh> [sighs] 하세요", { voice: gemini })),
		).toBe("안녕 <sigh> 하세요");
		// 한글이 든 괄호는 태그가 아니라 대본 글이다(Review Focus 7)
		expect(textOf(para("d", "<삼국지> [속보] 3 < 5"))).toBe(
			"<삼국지> [속보] 3 < 5",
		);
	});
	it("받지 않는 태그가 없는 문단은 요청 글·조합 키가 전과 같다(Review Focus 1)", () => {
		for (const [p, setup] of [
			[para("a", "  안녕 하세요\n"), typecast],
			[para("b", "안녕 [sighs] 하세요", { voice: fish }), fish],
			[para("c", "안녕 <sigh> 하세요", { voice: gemini }), gemini],
		] as const) {
			const request = paragraphRequest(p, work(), voices, NOW);
			const before = setupRequest(setup, voices, p.text, NOW);
			expect(request).toEqual(before);
			expect(request && comboSignature(request)).toBe(comboSignature(before));
		}
	});
	it("태그만 있는 Typecast 문단은 빈 문단이다: 요청 null, 막는 이유 empty, 상태 empty, 찾기 대상에서 빠진다(Review Focus 6)", () => {
		const tagOnly = para("a", " [sighs] [pause] ");
		const other = para("b", "안녕");
		const w = work({ paragraphs: [tagOnly, other] });
		expect(blankFor(tagOnly, w)).toBe(true);
		expect(paragraphRequest(tagOnly, w, voices, NOW)).toBeNull();
		expect(blockOf(tagOnly, w, voices)).toBe("empty");
		expect(paragraphStatus(tagOnly, w, voices, new Map(), new Map(), NOW)).toBe(
			"empty",
		);
		expect(findTargets(w.paragraphs, w, voices, new Map(), true, NOW)).toEqual([
			paragraphRequest(other, w, voices, NOW),
		]);
		// 같은 글도 태그를 읽는 성우면 빈 문단이 아니다
		const fishTags = para("c", "[sighs]", { voice: fish });
		expect(blankFor(fishTags, w)).toBe(false);
		expect(paragraphRequest(fishTags, w, voices, NOW)?.text).toBe("[sighs]");
	});
	it("blankFor: 공백뿐이면 성우가 없어도 빈 문단, 태그만 있고 성우가 없으면 빈 문단이 아니다(성우 없음으로 막는다)", () => {
		const none = work({ defaultVoice: null });
		expect(blankFor(para("a", " \n "), none)).toBe(true);
		expect(blankFor(para("b", "[sighs]"), none)).toBe(false);
		expect(blockOf(para("b", "[sighs]"), none, voices)).toBe("no_voice");
		expect(blankFor(para("c", "안녕"), work())).toBe(false);
	});
});

describe("화자 성우(T10-b 2.1: followOf·voiceOf)", () => {
	const fish: VoiceSetup = {
		provider: "fish_audio",
		voiceId: "f_1",
		settings: DEFAULT_SETTINGS.fish_audio,
	};
	const speakers: Speaker[] = [
		{ name: "민수", voice: eleven },
		{ name: "지아", voice: null },
	];
	it("문단 자기 성우 → 화자 성우 → 기본 성우 순서다", () => {
		const w = work({ speakers });
		expect(voiceOf(para("a", "x", { speaker: "민수", voice: fish }), w)).toBe(
			fish,
		);
		expect(voiceOf(para("a", "x", { speaker: "민수" }), w)).toBe(eleven);
		expect(voiceOf(para("a", "x"), w)).toBe(typecast);
	});
	it("화자 성우를 비우면 그 화자의 문단은 기본 성우를 따른다", () => {
		expect(
			voiceOf(para("a", "x", { speaker: "지아" }), work({ speakers })),
		).toBe(typecast);
	});
	it("목록에 없는 화자 이름은 화자 없음으로 본다", () => {
		expect(
			voiceOf(para("a", "x", { speaker: "현우" }), work({ speakers })),
		).toBe(typecast);
		expect(voiceOf(para("a", "x", { speaker: "민수" }), work())).toBe(typecast);
	});
	it("followOf는 자기 성우를 보지 않고 따르는 성우만 돌려준다", () => {
		const w = work({ speakers });
		expect(followOf(para("a", "x", { speaker: "민수", voice: fish }), w)).toBe(
			eleven,
		);
		expect(followOf(para("a", "x"), work({ defaultVoice: null }))).toBeNull();
	});
	it("화자 없는 작업의 문단 요청은 T10-a와 같다(요청 모양·글 불변)", () => {
		const req = paragraphRequest(para("a", "안녕"), work(), [saved()], NOW);
		expect(req).toEqual({
			provider: "typecast",
			voiceId: "tc_1",
			text: "안녕",
			settings: DEFAULT_SETTINGS.typecast,
		});
		expect(Object.keys(req ?? {}).sort()).toEqual([
			"provider",
			"settings",
			"text",
			"voiceId",
		]);
	});
	it("화자 이름은 요청에 들지 않고 화자 성우의 요청이 된다", () => {
		const el = saved({
			voice: voice({ provider: "elevenlabs", voiceId: "el_1" }),
		});
		const req = paragraphRequest(
			para("a", "안녕", { speaker: "민수" }),
			work({ speakers }),
			[saved(), el],
			NOW,
		);
		expect(req).toEqual({
			provider: "elevenlabs",
			voiceId: "el_1",
			text: "안녕",
			settings: DEFAULT_SETTINGS.elevenlabs,
		});
		expect(JSON.stringify(req)).not.toContain("민수");
	});
	it("화자를 따르는 문단의 설정을 바꾸면 화자 성우를 복사해 자기 것이 된다", () => {
		const own = ownSettings(
			para("a", "x", { speaker: "민수" }),
			work({ speakers }),
			{ speed: 1.2 },
		);
		expect(own.voice?.provider).toBe("elevenlabs");
		expect(own.voice?.settings).toMatchObject({ speed: 1.2 });
	});
	it("두 문단의 같은 성우 판정(sameVoice)도 화자 성우로 본다", () => {
		const w = work({ speakers: [{ name: "민수", voice: typecast }] });
		expect(
			sameVoice(para("a", "x", { speaker: "민수" }), para("b", "y"), w),
		).toBe(true);
	});
});

describe("화자 목록(speakersAdd·speakerParagraphCount, 계획 2.2)", () => {
	const list: Speaker[] = [{ name: "민수", voice: typecast }];
	it("없는 이름만 끝에 더하고 같은 이름 화자는 성우를 그대로 둔다", () => {
		const next = speakersAdd(list, ["민수", "지아", "지아"]);
		expect(next).toEqual([
			{ name: "민수", voice: typecast },
			{ name: "지아", voice: null },
		]);
		expect(next?.[0]).toBe(list[0]);
	});
	it("더할 이름이 없으면 같은 목록 객체를 돌려준다", () => {
		expect(speakersAdd(list, ["민수"])).toBe(list);
		expect(speakersAdd(list, [])).toBe(list);
	});
	it("상한 20명은 기존 목록 ∪ 새 이름으로 센다(넘으면 null)", () => {
		const full = Array.from({ length: 19 }, (_, i) => ({
			name: `화자${i}`,
			voice: null,
		}));
		expect(speakersAdd(full, ["화자0", "새1"])).toHaveLength(20);
		expect(speakersAdd(full, ["새1", "새2"])).toBeNull();
		expect(speakersAdd([], ["a", "b", "c"])).toHaveLength(3);
	});
	it("지운 화자를 이름·성우·자리 그대로 되살린다(speakerRestore)", () => {
		const a: Speaker = { name: "민수", voice: typecast };
		const b: Speaker = { name: "지아", voice: null };
		const c: Speaker = { name: "도윤", voice: null };
		expect(speakerRestore([a, c], b, 1)).toEqual([a, b, c]);
		expect(speakerRestore([a, b], c, 2)).toEqual([a, b, c]);
		// 자리가 목록 밖이면 양 끝으로 맞춘다
		expect(speakerRestore([a], b, 9)).toEqual([a, b]);
		expect(speakerRestore([a], b, -3)).toEqual([b, a]);
	});
	it("그 이름이 이미 있거나 20명이 차면 목록을 그대로 둔다(speakerRestore)", () => {
		const list: Speaker[] = [{ name: "민수", voice: null }];
		expect(speakerRestore(list, { name: "민수", voice: typecast }, 0)).toBe(
			list,
		);
		const full = Array.from({ length: 20 }, (_, i) => ({
			name: `화자${i}`,
			voice: null,
		}));
		expect(speakerRestore(full, { name: "새", voice: null }, 0)).toBe(full);
	});
	it("화자 문단 수", () => {
		const ps = [
			para("a", "x", { speaker: "민수" }),
			para("b", "y"),
			para("c", "z", { speaker: "민수" }),
		];
		expect(speakerParagraphCount(ps, "민수")).toBe(2);
		expect(speakerParagraphCount(ps, "지아")).toBe(0);
		// 문단이 없어 지울 수 있는 화자 수
		expect(
			idleSpeakerCount(
				[
					{ name: "민수", voice: null },
					{ name: "지아", voice: null },
				],
				ps,
			),
		).toBe(1);
	});
});

describe("일괄 작업(batch*, 브리프 16.2·스펙 17.2)", () => {
	const ps = [
		para("a", "하나", { speaker: "민수", voice: typecast, gap: 1 }),
		para("b", "둘"),
		para("c", "셋", { voice: eleven }),
		para("d", "넷"),
	];
	const ids = new Set(["a", "c"]);
	it("성우: 고른 문단만 자기 성우로 갖고 나머지는 같은 객체다", () => {
		const next = batchVoice(ps, ids, eleven);
		expect(next[0].voice).toBe(eleven);
		expect(next[2].voice).toBe(eleven);
		expect(next[1]).toBe(ps[1]);
		expect(next[3]).toBe(ps[3]);
		expect(ps[0].voice).toBe(typecast);
	});
	it("따르기: 고른 문단의 자기 성우를 비우고 쉼·화자는 그대로 둔다", () => {
		const next = batchFollow(ps, ids);
		expect(next[0]).toEqual({ id: "a", text: "하나", speaker: "민수", gap: 1 });
		expect(next[2].voice).toBeUndefined();
		expect(next[1]).toBe(ps[1]);
		// 자기 성우가 없던 문단만 고르면 바뀐 것이 없어 같은 배열이다
		expect(batchFollow(ps, new Set(["b", "d"]))).toBe(ps);
	});
	it("화자: 이름이면 정하고, undefined이면 화자 없음(성우는 그대로)", () => {
		const named = batchSpeaker(ps, new Set(["b", "c"]), "지아");
		expect(named[1].speaker).toBe("지아");
		expect(named[2]).toEqual({ ...ps[2], speaker: "지아" });
		expect(named[0]).toBe(ps[0]);
		const none = batchSpeaker(ps, ids, undefined);
		expect("speaker" in none[0]).toBe(false);
		expect(none[0].voice).toBe(typecast);
		expect(none[2]).toBe(ps[2]);
		// 이미 그 화자인 문단만 고르면 같은 배열
		expect(batchSpeaker(ps, new Set(["a"]), "민수")).toBe(ps);
	});
	it("쉼: 고른 문단의 문단 뒤 쉼을 한 값으로 바꾼다(같은 값이면 같은 객체)", () => {
		const next = batchGap(ps, ids, 2.5);
		expect(next[0].gap).toBe(2.5);
		expect(next[2].gap).toBe(2.5);
		expect(next[1]).toBe(ps[1]);
		expect(batchGap(ps, new Set(["a"]), 1)).toBe(ps);
	});
	it("지우기: 고른 문단만 지우고, 모두 지우면 빈 카드 1장이 남는다", () => {
		expect(batchRemove(ps, ids).map((p) => p.id)).toEqual(["b", "d"]);
		const left = batchRemove(ps, new Set(ps.map((p) => p.id)));
		expect(left).toHaveLength(1);
		expect(left[0].text).toBe("");
		expect(ps.map((p) => p.id)).not.toContain(left[0].id);
	});
	it("아무 문단도 고르지 않았거나 없는 id면 같은 배열이다", () => {
		const none = new Set<string>();
		const gone = new Set(["zzz"]);
		for (const set of [none, gone]) {
			expect(batchVoice(ps, set, eleven)).toBe(ps);
			expect(batchFollow(ps, set)).toBe(ps);
			expect(batchSpeaker(ps, set, "x")).toBe(ps);
			expect(batchGap(ps, set, 1)).toBe(ps);
			expect(batchRemove(ps, set)).toBe(ps);
		}
	});
});

describe("숫자 교정 결정과 발음용 대본(T11 스펙 3절, 계획 결정 1·2)", () => {
	const TEXT = "사과 3개와 12,500원, 3.5%";
	const [n3, money, pct] = readingItems(TEXT);
	const base = para("a", TEXT);
	const voices = [saved()];

	it("결정이 없으면 발음용 대본은 원문과 같은 문자열이고 요청·조합 키가 바이트까지 같다", () => {
		expect(spokenOf(base)).toBe(TEXT);
		expect(spokenOf(para("b", "숫자 없음"))).toBe("숫자 없음");
		const none = paragraphRequest(base, work(), voices, NOW);
		const empty = paragraphRequest(
			{ ...base, fixes: { text: TEXT, decisions: [] } },
			work(),
			voices,
			NOW,
		);
		const keep = paragraphRequest(
			decide(base, n3, { choice: "keep" }),
			work(),
			voices,
			NOW,
		);
		expect(none?.text).toBe(TEXT);
		for (const other of [empty, keep]) {
			expect(JSON.stringify(other)).toBe(JSON.stringify(none));
			expect(other && none && comboSignature(other)).toBe(
				none && comboSignature(none),
			);
		}
	});
	it("여러 결정은 시작 위치 순으로 적용하고 keep·검수 안 함은 원문 그대로", () => {
		let p = decide(base, pct, { choice: "apply", reading: "삼 점 오 퍼센트" });
		p = decide(p, n3, { choice: "apply", reading: "세 개" });
		p = decide(p, money, { choice: "manual", reading: "만 이천오백 원" });
		expect(p.fixes?.decisions.map((d) => d.start)).toEqual([
			n3?.start,
			money?.start,
			pct?.start,
		]);
		expect(spokenOf(p)).toBe("사과 세 개와 만 이천오백 원, 삼 점 오 퍼센트");
		const some = decide(decide(base, n3, { choice: "keep" }), money, {
			choice: "apply",
			reading: "만 이천오백 원",
		});
		expect(spokenOf(some)).toBe("사과 3개와 만 이천오백 원, 3.5%");
		// apply에 읽기를 안 주면 첫 제안
		expect(spokenOf(decide(base, n3, { choice: "apply" }))).toBe(
			"사과 세 개와 12,500원, 3.5%",
		);
	});
	it("앞이 글자·숫자면 읽기 앞에 띄어 쓰고, 뒤 조사는 그대로 붙인다", () => {
		const p = para("a", "약3개를 샀고 12,500원이다");
		const [a, b] = readingItems(p.text);
		const done = decide(decide(p, a, { choice: "apply" }), b, {
			choice: "apply",
		});
		expect(spokenOf(done)).toBe("약 세 개를 샀고 만 이천오백 원이다");
	});
	it("결정이 없는 문단은 spokenPartsOf·spokenOf가 엔진을 돌리지 않는다", () => {
		const engine = vi.mocked(readingItems);
		for (const p of [
			para("n1", "사과 3개와 12,500원"),
			para("n2", "사과 3개", { fixes: { text: "사과 3개", decisions: [] } }),
		]) {
			engine.mockClear();
			expect(spokenPartsOf(p)).toEqual([{ text: p.text, changed: false }]);
			expect(spokenOf(p)).toBe(p.text);
			expect(engine).not.toHaveBeenCalled();
		}
	});
	it("isCertain: 결정이 없고 확인 필요가 아니며 읽기가 있는 항목만 확실하다", () => {
		const [three, times] = readingItems("3개 3번");
		if (!three || !times) throw new Error("항목 없음");
		expect(isCertain(three, null)).toBe(true);
		const kept: Decision = {
			start: three.start,
			end: three.end,
			original: three.original,
			choice: "keep",
		};
		expect(isCertain(three, kept)).toBe(false);
		expect(isCertain(times, null)).toBe(false);
		expect(isCertain({ ...three, readings: [] }, null)).toBe(false);
	});
	it("spokenPartsOf는 발음용 대본을 바뀐 자리와 그대로인 자리로 나눈다(이으면 spokenOf, 띄어 쓴 공백은 그대로인 쪽)", () => {
		expect(spokenPartsOf(base)).toEqual([{ text: TEXT, changed: false }]);
		const p = para("a", "약3개를 샀고 12,500원이다");
		const [a, b] = readingItems(p.text);
		const done = decide(decide(p, a, { choice: "apply" }), b, {
			choice: "apply",
		});
		expect(spokenPartsOf(done)).toEqual([
			{ text: "약 ", changed: false },
			{ text: "세 개", changed: true },
			{ text: "를 샀고 ", changed: false },
			{ text: "만 이천오백 원", changed: true },
			{ text: "이다", changed: false },
		]);
		expect(
			spokenPartsOf(done)
				.map((part) => part.text)
				.join(""),
		).toBe(spokenOf(done));
		// keep만 있으면 바뀐 자리가 없다
		expect(spokenPartsOf(decide(p, a, { choice: "keep" }))).toEqual([
			{ text: p.text, changed: false },
		]);
	});
	it("직접 입력이 비면 결정하지 않고 같은 문단을 돌려준다", () => {
		expect(decide(base, n3, { choice: "manual", reading: "  " })).toBe(base);
		expect(decide(base, n3, { choice: "manual" })).toBe(base);
		expect(
			spokenOf(decide(base, n3, { choice: "manual", reading: " 셋 " })),
		).toBe("사과 셋와 12,500원, 3.5%");
	});
	it("같은 항목을 다시 결정하면 바꾸고, 되돌리면 검수 안 함이다", () => {
		const a = decide(base, n3, { choice: "apply" });
		const b = decide(a, n3, { choice: "keep" });
		expect(b.fixes?.decisions).toHaveLength(1);
		expect(b.fixes?.decisions[0]?.choice).toBe("keep");
		expect(b.fixes?.text).toBe(TEXT);
		const back = undecide(a, n3);
		expect(back).not.toBe(a);
		expect(back.fixes).toEqual({ text: TEXT, decisions: [] });
		expect(spokenOf(back)).toBe(TEXT);
		expect(reviewOf(back).unreviewed).toBe(3);
		// 결정이 없는 항목을 되돌리면 같은 문단
		expect(undecide(base, n3)).toBe(base);
		// 원문 문단은 바뀌지 않는다
		expect(base.fixes).toBeUndefined();
	});
	it("원문이 바뀌면 결정이 무효이고 요청 글이 원문이다. 같은 글로 돌아오면 다시 유효", () => {
		const done = decide(base, n3, { choice: "apply" });
		const edited = { ...done, text: `${TEXT}!` };
		expect(decisionsOf(edited)).toEqual([]);
		expect(spokenOf(edited)).toBe(`${TEXT}!`);
		expect(paragraphRequest(edited, work(), voices, NOW)?.text).toBe(
			`${TEXT}!`,
		);
		expect(reviewOf(edited).unreviewed).toBe(3);
		expect(spokenOf({ ...edited, text: TEXT })).toBe(
			"사과 세 개와 12,500원, 3.5%",
		);
	});
	it("지금 항목과 위치·글이 다른 낡은 결정은 무시한다", () => {
		const reading = "엉뚱";
		const bad = (d: Partial<Decision>) =>
			spokenOf({
				...base,
				fixes: {
					text: TEXT,
					decisions: [
						{
							start: n3?.start ?? 0,
							end: n3?.end ?? 0,
							original: "3개",
							choice: "apply",
							reading,
							...d,
						},
					],
				},
			});
		expect(bad({ original: "4개" })).toBe(TEXT);
		expect(bad({ start: 4 })).toBe(TEXT);
		expect(bad({ end: (n3?.end ?? 0) + 1 })).toBe(TEXT);
		expect(bad({})).toBe("사과 엉뚱와 12,500원, 3.5%");
	});
	it("같은 결정이 겹쳐 있어도 한 번만 바꾼다", () => {
		const d: Decision = {
			start: n3?.start ?? 0,
			end: n3?.end ?? 0,
			original: "3개",
			choice: "apply",
			reading: "세 개",
		};
		const p = { ...base, fixes: { text: TEXT, decisions: [d, d] } };
		expect(spokenOf(p)).toBe("사과 세 개와 12,500원, 3.5%");
	});
	it("paragraphRequest 글이 발음용 대본이고 조합 키가 요청 글을 따른다", () => {
		const done = decide(base, n3, { choice: "apply" });
		const req = paragraphRequest(done, work(), voices, NOW);
		const plain = paragraphRequest(base, work(), voices, NOW);
		expect(req?.text).toBe("사과 세 개와 12,500원, 3.5%");
		expect(req && plain && comboSignature(req)).not.toBe(
			req && plain && comboSignature(plain),
		);
		// 받지 않는 태그는 발음용 대본에서 뺀다
		const tagged = decide(
			para("t", "안녕 [sighs] 3개"),
			readingItems("안녕 [sighs] 3개")[0],
			{
				choice: "apply",
			},
		);
		expect(paragraphRequest(tagged, work(), voices, NOW)?.text).toBe(
			"안녕 세 개",
		);
	});
	it("길이 검사는 발음용 대본 기준(blockOf)이고 원문 기준은 tooLongOf(p.text)다", () => {
		const long = para("l", `${"가".repeat(STUDIO_TEXT_MAX - 3)} 3개`);
		expect(blockOf(long, work(), voices)).toBeNull();
		const done = decide(long, readingItems(long.text)[0], { choice: "apply" });
		expect(spokenOf(done).length).toBe(STUDIO_TEXT_MAX + 1);
		expect(blockOf(done, work(), voices)).toEqual({
			kind: "too_long",
			length: STUDIO_TEXT_MAX + 1,
			max: STUDIO_TEXT_MAX,
		});
		expect(tooLongOf(done.text, "typecast")).toBeNull();
	});
	it("reviewOf: 항목·결정 짝과 검수 안 한 수·확인 필요 수", () => {
		const p = para("r", "3번 3개 5%");
		const [bun, gae, per] = readingItems(p.text);
		expect(reviewOf(para("x", "숫자 없음"))).toEqual({
			pairs: [],
			unreviewed: 0,
			needsCheck: 0,
		});
		const first = reviewOf(p);
		expect(first.pairs.map((x) => x.decision)).toEqual([null, null, null]);
		expect(first).toMatchObject({ unreviewed: 3, needsCheck: 1 });
		const done = decide(decide(p, gae, { choice: "apply" }), bun, {
			choice: "keep",
		});
		const next = reviewOf(done);
		expect(next).toMatchObject({ unreviewed: 1, needsCheck: 0 });
		expect(next.pairs[0]?.decision?.choice).toBe("keep");
		expect(next.pairs[2]?.item).toBe(per);
		expect(next.pairs[2]?.decision).toBeNull();
	});
	it("applyCertain: 확인 필요가 아닌 미검수에만 첫 제안을 적용하고, 바뀐 것이 없으면 같은 배열", () => {
		const p = para("a", "3번 3개 5%");
		const other = para("b", "숫자 없음");
		const next = applyCertain([p, other]);
		expect(next[1]).toBe(other);
		expect(spokenOf(next[0] ?? p)).toBe("3번 세 개 오 퍼센트");
		expect(reviewOf(next[0] ?? p)).toMatchObject({
			unreviewed: 1,
			needsCheck: 1,
		});
		// 이미 정한 항목(keep 포함)은 건드리지 않는다
		const kept = decide(p, readingItems(p.text)[1], { choice: "keep" });
		expect(spokenOf(applyCertain([kept])[0] ?? kept)).toBe("3번 3개 오 퍼센트");
		// 더 바꿀 것이 없으면 같은 배열
		expect(applyCertain(next)).toBe(next);
		expect(applyCertain([other])).toEqual([other]);
		const only = [other];
		expect(applyCertain(only)).toBe(only);
	});
	it("unreviewedCount: 모든 문단의 검수 안 한 항목 수", () => {
		const ps = [para("a", "3번 3개"), para("b", "숫자 없음"), para("c", "5%")];
		expect(unreviewedCount(ps)).toBe(3);
		expect(unreviewedCount(applyCertain(ps))).toBe(1);
		expect(unreviewedCount([])).toBe(0);
	});
	it("unreviewedList: 검수 안 한 원문 표기를 최대 3개 나열하고 넘치면 ' 외 N개'", () => {
		const ps = [
			para("a", "1~3개 GPT-4o"),
			para("b", "숫자 없음"),
			para("c", "1/2"),
		];
		expect(unreviewedList(ps)).toBe("1~3개 · GPT-4o · 1/2");
		expect(unreviewedList([para("d", "3번 3개 5% 7일")])).toBe(
			"3번 · 3개 · 5% 외 1개",
		);
		// 정한 항목은 뺀다
		const p = para("e", "3번 3개");
		const done = decide(p, readingItems(p.text)[0], { choice: "keep" });
		expect(unreviewedList([done])).toBe("3개");
		expect(unreviewedList([])).toBe("");
	});
});
