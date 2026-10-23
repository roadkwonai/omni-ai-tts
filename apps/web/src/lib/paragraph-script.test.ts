import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
	STUDIO_TEXT_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import { findTargets, paragraphStatus } from "./make-all";
import {
	blankFor,
	blockOf,
	followDefault,
	insertAfter,
	mergeNext,
	move,
	ownSettings,
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	paragraphRequest,
	pasteAt,
	pasteToTexts,
	removeAt,
	sameVoice,
	setupRequest,
	splitAt,
	splitBlocks,
	splitLong,
	tooLongOf,
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

describe("pasteToTexts", () => {
	it("200개를 넘으면 앞 room개와 extra", () => {
		const raw = blocks(PARAGRAPHS_MAX + 5);
		const all = pasteToTexts(raw, STUDIO_TEXT_MAX, PARAGRAPHS_MAX);
		expect(all.texts).toHaveLength(PARAGRAPHS_MAX);
		expect(all.texts.at(-1)).toBe(`덩어리 ${PARAGRAPHS_MAX}`);
		expect(all.extra).toBe(5);
		expect(pasteToTexts(blocks(4), STUDIO_TEXT_MAX, 3)).toEqual({
			texts: ["덩어리 1", "덩어리 2", "덩어리 3"],
			extra: 1,
		});
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
			STUDIO_TEXT_MAX,
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
			STUDIO_TEXT_MAX,
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
			STUDIO_TEXT_MAX,
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
		expect(pasteAt(ps, "a", sel, "한 줄\n두 줄", 2000, 199)).toBeNull();
		expect(pasteAt(ps, "a", sel, "가".repeat(3000), 2000, 199)).toBeNull();
		expect(pasteAt(ps, "a", sel, "하나\n\n", 2000, 199)).toBeNull();
	});
	it("선택 영역은 붙여 넣은 글로 바뀐다", () => {
		const out = pasteAt(
			[para("a", "가나다라")],
			"a",
			{ start: 1, end: 3 },
			"X\n\nY",
			STUDIO_TEXT_MAX,
			PARAGRAPHS_MAX - 1,
		);
		expect(out?.ps.map((p) => p.text)).toEqual(["가X", "Y라"]);
	});
	it("카드 붙여 넣기도 200개에서 멈추고 extra", () => {
		const ps = many(PARAGRAPHS_MAX - 1);
		const out = pasteAt(
			ps,
			"p0",
			{ start: 0, end: 0 },
			blocks(4),
			STUDIO_TEXT_MAX,
			1,
		);
		expect(out?.ps).toHaveLength(PARAGRAPHS_MAX);
		expect(out?.extra).toBe(2);
		expect(out?.ps[0]?.text).toBe("덩어리 1");
		// 넣지 못한 덩어리가 있어도 커서 뒤 글은 남는다
		expect(out?.ps[1]?.text).toBe("덩어리 2문단 1");
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
			pasteAt(ps, "p1", { start: 0, end: 0 }, "가\n\n나", 2000, 196)?.ps ?? [],
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
