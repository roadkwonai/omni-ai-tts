// apps/web/src/lib/script-work.test.ts
import {
	comboSignature,
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import {
	type LinkedScript,
	PARAGRAPH_GAP_DEFAULT,
	paragraphRequest,
	SPEAKERS_MAX,
	type VoiceSetup,
	type Work,
} from "./paragraph-script";
import {
	afterReplace,
	appendNotes,
	appendRoom,
	appendWork,
	clipTitle,
	dirtyOf,
	fingerprintOf,
	firstSentenceTitle,
	fromScript,
	nextIdOf,
	toScriptWork,
} from "./script-work";
import { readWork, writeWork } from "./studio-draft";

const CHANNEL = "7d3f0c52-6a1e-4c1b-9a43-2f6f3b7b9c10";
const TC = DEFAULT_SETTINGS.typecast;
const EL = DEFAULT_SETTINGS.elevenlabs;
const tc: VoiceSetup = { provider: "typecast", voiceId: "tc_1", settings: TC };
const el: VoiceSetup = {
	provider: "elevenlabs",
	voiceId: "el_1",
	settings: EL,
};
const work = (over: Partial<Work> = {}): Work => ({
	defaultVoice: tc,
	gap: PARAGRAPH_GAP_DEFAULT,
	channelId: CHANNEL,
	paragraphs: [{ id: "a", text: "첫 문단" }],
	...over,
});
const linked = (over: Partial<LinkedScript> = {}): LinkedScript => ({
	scriptId: "5b0f6a9e-3c1d-4e0a-8f57-0c1d2e3f4a5b",
	title: "경제",
	version: 2,
	fingerprint: "abc",
	...over,
});
const many = (n: number, prefix = "p"): Work["paragraphs"] =>
	Array.from({ length: n }, (_, i) => ({
		id: `${prefix}${i}`,
		text: `글 ${i}`,
	}));

describe("fingerprintOf", () => {
	it("id·linked와 상관없다", () => {
		const base = fingerprintOf(work());
		expect(fingerprintOf(work({ id: "w1" }))).toBe(base);
		expect(fingerprintOf(work({ id: "w2", linked: linked() }))).toBe(base);
	});
	it("키 순서와 상관없다", () => {
		const a = work({ paragraphs: [{ id: "a", text: "글", gap: 1 }] });
		const reordered = JSON.parse(
			JSON.stringify({
				paragraphs: [{ gap: 1, text: "글", id: "a" }],
				channelId: CHANNEL,
				gap: PARAGRAPH_GAP_DEFAULT,
				defaultVoice: { settings: TC, voiceId: "tc_1", provider: "typecast" },
			}),
		) as Work;
		expect(fingerprintOf(reordered)).toBe(fingerprintOf(a));
	});
	it("글·성우·쉼·채널·화자가 바뀌면 달라진다", () => {
		const base = fingerprintOf(work());
		const changed = [
			work({ paragraphs: [{ id: "a", text: "다른 글" }] }),
			work({ defaultVoice: null }),
			work({ gap: 1 }),
			work({ channelId: null }),
			work({ speakers: [{ name: "민수", voice: null }] }),
		];
		for (const w of changed) expect(fingerprintOf(w)).not.toBe(base);
	});
	it("태그 끝 공백은 쓰기→읽기 정규화로 같은 지문이다", () => {
		const tagged = (tag: string) =>
			work({
				defaultVoice: { ...el, settings: { ...EL, tag } } as VoiceSetup,
			});
		expect(fingerprintOf(tagged("  속삭임  "))).toBe(
			fingerprintOf(tagged("속삭임")),
		);
	});
	it("쉼 칸이 추가되는 순서와 상관없다", () => {
		const ab = { id: "a", text: "글" } as Work["paragraphs"][number];
		const withGap = { ...ab, gap: 1.2 };
		const viaSpread = { gap: 1.2, ...ab };
		expect(fingerprintOf(work({ paragraphs: [withGap] }))).toBe(
			fingerprintOf(work({ paragraphs: [viaSpread] })),
		);
	});
	it("쓰기 → 읽기 왕복으로 지문이 같다", () => {
		const w = work({
			speakers: [{ name: "민수", voice: el }],
			paragraphs: [
				{ id: "a", text: "안녕", speaker: "민수", gap: 1.2 },
				{ id: "b", text: "응" },
			],
		});
		const read = readWork(writeWork(w), null) as Work;
		expect(fingerprintOf(read)).toBe(fingerprintOf(w));
	});
	it("채널이 있는 작업의 저장 지문 = 저장한 모양을 바로 다시 뜬 지문", () => {
		const w = work({ id: "w1", paragraphs: [{ id: "a", text: "글" }] });
		const saved = fingerprintOf(w);
		const row = {
			kind: "saved" as const,
			workId: null,
			channelId: w.channelId,
			work: JSON.parse(JSON.stringify(toScriptWork(w))),
		};
		expect(fingerprintOf(fromScript(row))).toBe(saved);
	});
	it("빈 작업(읽을 수 없는 모양)도 안전한 값이다", () => {
		expect(typeof fingerprintOf(work({ paragraphs: [] }))).toBe("string");
	});
});

describe("dirtyOf", () => {
	it("linked가 없으면 false", () => {
		expect(dirtyOf(work(), undefined)).toBe(false);
	});
	it("지문이 같으면 false, 다르면 true, 되돌리면 다시 false", () => {
		const w = work();
		const l = linked({ fingerprint: fingerprintOf(w) });
		expect(dirtyOf(w, l)).toBe(false);
		const edited = work({ paragraphs: [{ id: "a", text: "고침" }] });
		expect(dirtyOf(edited, l)).toBe(true);
		expect(dirtyOf(work({ id: "x" }), l)).toBe(false);
	});
});

describe("nextIdOf·afterReplace", () => {
	it("nextIdOf는 있는 id를 그대로, 없으면 새 id", () => {
		expect(nextIdOf(work({ id: "w1" }))).toBe("w1");
		const fresh = nextIdOf(work());
		expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
		expect(nextIdOf(work())).not.toBe(fresh);
	});
	it("afterReplace는 id 없는 작업에 새 id를 주고 linked는 그대로 돌려준다", () => {
		const l = linked();
		const r = afterReplace(work(), l);
		expect(r.work.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(r.linked).toBe(l);
		expect(r.work).not.toHaveProperty("linked");
		const keep = afterReplace(work({ id: "w1" }), undefined);
		expect(keep.work.id).toBe("w1");
		expect(keep.linked).toBeUndefined();
	});
});

describe("toScriptWork·fromScript", () => {
	it("서버로 보낼 모양에서 id·linked·channelId를 뺀다", () => {
		const out = toScriptWork(work({ id: "w1", linked: linked() }));
		expect(out).not.toHaveProperty("id");
		expect(out).not.toHaveProperty("linked");
		expect(out).not.toHaveProperty("channelId");
		expect(out.paragraphs).toEqual([{ id: "a", text: "첫 문단" }]);
	});
	it("저장 대본은 id 없이, 채널은 칸에서 채운다", () => {
		const w = fromScript({
			kind: "saved",
			workId: null,
			channelId: CHANNEL,
			work: toScriptWork(work()),
		});
		expect(w).toEqual(work());
		expect(w).not.toHaveProperty("id");
	});
	it("최근 대본은 workId를 작업 id로 이어 쓴다", () => {
		const w = fromScript({
			kind: "recent",
			workId: "wk-9",
			channelId: null,
			work: toScriptWork(work()),
		});
		expect(w.id).toBe("wk-9");
		expect(w.channelId).toBeNull();
	});
});

describe("appendWork", () => {
	it("끝 문단이 비었으면 그 자리부터 붙이고 문단 id는 새로 받는다", () => {
		const target = work({
			paragraphs: [
				{ id: "a", text: "앞" },
				{ id: "z", text: "  " },
			],
		});
		const source = work({ paragraphs: [{ id: "a", text: "뒤", gap: 2 }] });
		const { work: out, dropped } = appendWork(target, source);
		expect(out.paragraphs.map((p) => p.text)).toEqual(["앞", "뒤"]);
		expect(out.paragraphs[0]?.id).toBe("a");
		expect(out.paragraphs[1]?.id).not.toBe("a");
		expect(out.paragraphs[1]?.gap).toBe(2);
		expect(dropped).toEqual({ paragraphs: 0, speakers: 0 });
	});
	it("끝 문단이 비어 있지 않으면 그대로 뒤에 붙인다", () => {
		const { work: out } = appendWork(
			work(),
			work({ paragraphs: [{ id: "a", text: "뒤" }] }),
		);
		expect(out.paragraphs.map((p) => p.text)).toEqual(["첫 문단", "뒤"]);
	});
	it("글·자기 성우·설정·쉼·화자·fixes를 유지한다", () => {
		const fixes = {
			text: "3개",
			decisions: [{ start: 0, end: 1, original: "3", choice: "keep" as const }],
		};
		const source = work({
			speakers: [{ name: "민수", voice: el }],
			paragraphs: [
				{ id: "a", text: "3개", voice: el, gap: 1.5, speaker: "민수", fixes },
			],
		});
		const { work: out } = appendWork(work(), source);
		const added = out.paragraphs[1];
		expect(added).toMatchObject({
			text: "3개",
			voice: el,
			gap: 1.5,
			speaker: "민수",
			fixes,
		});
		expect(out.speakers).toEqual([{ name: "민수", voice: el }]);
	});
	it("target의 기본 성우·쉼·채널·id·linked·이미 있는 화자는 그대로다", () => {
		const l = linked();
		const target = work({
			id: "w1",
			linked: l,
			gap: 2,
			speakers: [{ name: "민수", voice: null }],
		});
		const source = work({
			defaultVoice: el,
			gap: 4,
			channelId: null,
			speakers: [{ name: "민수", voice: el }],
			paragraphs: [{ id: "a", text: "응", speaker: "민수" }],
		});
		const { work: out } = appendWork(target, source);
		expect(out).toMatchObject({
			id: "w1",
			linked: l,
			gap: 2,
			channelId: CHANNEL,
			defaultVoice: tc,
		});
		expect(out.speakers).toEqual([{ name: "민수", voice: null }]);
		expect(out.paragraphs[1]?.speaker).toBe("민수");
	});
	it("화자가 20명을 넘으면 그 문단의 화자를 비우고 수를 센다", () => {
		const names = Array.from({ length: SPEAKERS_MAX }, (_, i) => `화자${i}`);
		const target = work({
			speakers: names.map((name) => ({ name, voice: null })),
		});
		const source = work({
			speakers: [{ name: "새사람", voice: el }],
			paragraphs: [
				{ id: "a", text: "하나", speaker: "새사람" },
				{ id: "b", text: "둘", speaker: "화자3" },
			],
		});
		const { work: out, dropped } = appendWork(target, source);
		expect(out.speakers).toHaveLength(SPEAKERS_MAX);
		expect(out.paragraphs[1]).not.toHaveProperty("speaker");
		expect(out.paragraphs[2]?.speaker).toBe("화자3");
		expect(dropped).toEqual({ paragraphs: 0, speakers: 1 });
	});
	it("합쳐 200문단을 넘으면 자르고 넣지 못한 수를 돌려준다", () => {
		const target = work({ paragraphs: many(190, "t") });
		const source = work({ paragraphs: many(15, "s") });
		const { work: out, dropped } = appendWork(target, source);
		expect(out.paragraphs).toHaveLength(PARAGRAPHS_MAX);
		expect(dropped.paragraphs).toBe(5);
		expect(out.paragraphs.at(-1)?.text).toBe("글 9");
	});
	it("자른 문단의 화자는 더하지 않는다", () => {
		const target = work({ paragraphs: many(PARAGRAPHS_MAX, "t") });
		const source = work({
			speakers: [{ name: "새사람", voice: el }],
			paragraphs: [{ id: "a", text: "x", speaker: "새사람" }],
		});
		const { work: out, dropped } = appendWork(target, source);
		expect(out.paragraphs).toHaveLength(PARAGRAPHS_MAX);
		expect(dropped).toEqual({ paragraphs: 1, speakers: 0 });
		expect(out.speakers).toBeUndefined();
	});
});

describe("appendNotes(이어 넣기 경고 셋)", () => {
	it("기본 성우가 같으면 따로 안 고른 문단도 경고하지 않는다", () => {
		const notes = appendNotes(work(), work({ paragraphs: many(3) }));
		expect(notes).toEqual({ followDefault: 0, overLimit: 0, speakers: 0 });
	});
	it("기본 성우가 다르면 자기 성우가 없는 문단만 센다", () => {
		const source = work({
			defaultVoice: el,
			speakers: [{ name: "철수", voice: tc }],
			paragraphs: [
				{ id: "a", text: "기본" },
				{ id: "b", text: "자기 성우", voice: tc },
				{ id: "c", text: "화자 성우", speaker: "철수" },
				{ id: "d", text: "화자 성우 없음", speaker: "영희" },
			],
		});
		const notes = appendNotes(work(), source);
		expect(notes.followDefault).toBe(2);
	});
	it("200개를 넘어 넣지 못하는 문단은 세지 않고 수를 돌려준다", () => {
		const target = work({ paragraphs: many(198, "t") });
		const source = work({ defaultVoice: el, paragraphs: many(5, "s") });
		expect(appendNotes(target, source)).toEqual({
			followDefault: 2,
			overLimit: 3,
			speakers: 0,
		});
	});
});

describe("요청 바이트 동일 회귀(id·linked는 요청과 조합 키에 들지 않는다)", () => {
	it("id·linked가 있는 작업과 없는 작업의 paragraphRequest·comboSignature가 같다", () => {
		const voices = [
			{
				id: "s1",
				voice: {
					provider: "typecast",
					source: "public",
					voiceId: "tc_1",
					name: "민지",
					models: [],
				},
				favorite: false,
				frequent: false,
				memo: null,
				unavailable: false,
				channelIds: [],
				classificationIds: [],
				lastUsedAt: null,
				useCount: 0,
			},
		] as unknown as SavedVoice[];
		const plain = work();
		const marked = work({ id: "w1", linked: linked() });
		const now = Date.parse("2026-10-23T12:00:00+09:00");
		const a = paragraphRequest(
			plain.paragraphs[0] as never,
			plain,
			voices,
			now,
		);
		const b = paragraphRequest(
			marked.paragraphs[0] as never,
			marked,
			voices,
			now,
		);
		expect(a).not.toBeNull();
		expect(JSON.stringify(b)).toBe(JSON.stringify(a));
		expect(b && a && comboSignature(b)).toBe(a && comboSignature(a));
	});
});

describe("서버에서 받은 작업의 정규화(C1)", () => {
	it("fromScript → readWork 정규화한 작업의 요청 = 새로 고침 뒤 읽은 작업의 요청", () => {
		const voices = [
			{
				id: "s1",
				voice: {
					provider: "elevenlabs",
					source: "account",
					voiceId: "el_1",
					name: "수아",
					models: [],
				},
				favorite: false,
				frequent: false,
				memo: null,
				unavailable: false,
				channelIds: [],
				classificationIds: [],
				lastUsedAt: null,
				useCount: 0,
			},
		] as unknown as SavedVoice[];
		const fromServer = fromScript({
			kind: "saved",
			workId: null,
			channelId: CHANNEL,
			work: {
				defaultVoice: {
					...el,
					settings: { ...EL, tag: "  속삭임  ", stability: 7 },
				} as VoiceSetup,
				gap: PARAGRAPH_GAP_DEFAULT,
				paragraphs: [{ id: "a", text: "안녕" }],
			},
		});
		const normalized = readWork(writeWork(fromServer), null) as Work;
		const reloaded = readWork(writeWork(normalized), null) as Work;
		const now = Date.parse("2026-10-23T12:00:00+09:00");
		const at = (w: Work) =>
			paragraphRequest(w.paragraphs[0] as never, w, voices, now);
		expect(at(normalized)).not.toBeNull();
		expect(JSON.stringify(at(normalized))).toBe(JSON.stringify(at(reloaded)));
		// 서버 모양 그대로는 정규화한 작업과 다를 수 있다(그래서 checkedFor가 늘 readWork를 거친다)
		expect(JSON.stringify(normalized.defaultVoice)).not.toBe(
			JSON.stringify(fromServer.defaultVoice),
		);
	});
});

describe("firstSentenceTitle·clipTitle", () => {
	const para = (text: string) => ({ id: text, text });
	it("첫 비지 않은 문단의 첫 문장 앞 100자", () => {
		expect(
			firstSentenceTitle([para("  "), para("안녕하세요. 반갑습니다.")]),
		).toBe("안녕하세요.");
		expect(firstSentenceTitle([para("가".repeat(150))])).toBe("가".repeat(100));
		expect(firstSentenceTitle([para("첫 줄\n둘째 줄")])).toBe("첫 줄");
		expect(firstSentenceTitle([para("")])).toBe("");
	});
	it("코드 포인트로 자르고 말줄임표는 넘칠 때만", () => {
		expect(firstSentenceTitle([para("😀".repeat(120))])).toBe("😀".repeat(100));
		expect(clipTitle("짧은 제목", 12)).toBe("짧은 제목");
		expect(clipTitle("가".repeat(30), 24)).toBe(`${"가".repeat(24)}…`);
	});
});

describe("appendRoom(이어 넣기로 더 넣을 수 있는 수)", () => {
	it("200개가 차면 0, 끝 빈 문단은 자리로 센다", () => {
		expect(appendRoom(many(PARAGRAPHS_MAX))).toBe(0);
		expect(
			appendRoom([...many(PARAGRAPHS_MAX - 1), { id: "z", text: " " }]),
		).toBe(1);
		expect(appendRoom(many(3))).toBe(PARAGRAPHS_MAX - 3);
	});
});
