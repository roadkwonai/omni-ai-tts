import { describe, expect, it } from "vitest";

import { ACTING, replySchemaOf, type Suggestion } from "./drama-acting";
import {
	checkParagraph,
	inlineTags,
	newTagMax,
	type ParagraphTagItem,
	paragraphTagPrompt,
	sendText,
	unsentCount,
} from "./paragraph-tags";

describe("sendText(T10 스펙 15.2)", () => {
	it.each([
		["typecast_v30", "안녕 [sighs] 하세요", "안녕 하세요"],
		["airy", "[laughs] 좋아요", "좋아요"],
		["gemini", "아 <sigh> 그래 [laughs]", "아 <sigh> 그래 "],
		["fish_s2", "a <sigh> b [laughs] c", "a b [laughs] c"],
		["elevenlabs_tags", "a[x]b", "a[x]b"],
		// 쌍 태그도 뺀다. 단어 바로 뒤 태그는 태그만 빼 뒤 공백이 남는다(두 단어가 붙지 않게)
		["fish_s2", "<whisper>a</whisper> [sighs] b", "a [sighs] b"],
		["typecast_v30", "그래[sighs] 네가", "그래 네가"],
		// 이어 붙은 받지 않는 태그 둘: 둘째 태그 앞이 공백이 아니라 그 뒤 공백은 남는다(음성에는 영향 없음, Part 2 최종 리뷰)
		["typecast_v30", "a [x][y] b", "a  b"],
		["gemini", "[sighs] <sigh> <whispering> c", "<sigh> c"],
	] as const)("%s: %j → %j", (family, text, sent) => {
		expect(sendText(family, text)).toBe(sent);
	});
	it("받지 않는 태그가 없으면 같은 글이고, 줄바꿈은 그대로다", () => {
		const text = "첫 줄 [sighs]\n둘째 줄";
		expect(sendText("elevenlabs_tags", text)).toBe(text);
		expect(sendText("fish_s2", `${text} <b>`)).toBe(`${text} `);
		expect(sendText("typecast_v30", "가 [pause]\n[pause] 나")).toBe("가 \n나");
	});
	it("태그 모양이 아닌 괄호·부등호는 대본 글이라 남는다", () => {
		const text = "영화 <삼국지> 3 < 5, 7 > 2 [속보] 끝";
		expect(sendText("typecast_v30", text)).toBe(text);
	});
	it("대괄호는 60자, 꺾쇠는 30자까지가 태그다", () => {
		const bracket = (n: number) => `[${"a".repeat(n)}] 끝`;
		const angle = (n: number) => `<${"a".repeat(n)}> 끝`;
		expect(sendText("airy", bracket(60))).toBe("끝");
		expect(sendText("airy", bracket(61))).toBe(bracket(61));
		expect(sendText("airy", angle(30))).toBe("끝");
		expect(sendText("airy", angle(31))).toBe(angle(31));
	});
});

describe("unsentCount·inlineTags·newTagMax", () => {
	it("받지 않는 태그 수", () => {
		expect(unsentCount("typecast_v21", "[a] b <c>")).toBe(2);
		expect(unsentCount("gemini", "<sigh> [x] <x>")).toBe(2);
		expect(unsentCount("fish_s2", "[sighs] 가")).toBe(0);
	});
	it("소리 값에 Fish S2·ElevenLabs v3·v4는 분위기 [값]을 더한다", () => {
		expect(inlineTags("fish_s2")).toEqual(
			expect.arrayContaining(["[sighs]", "[excited]"]),
		);
		expect(inlineTags("elevenlabs_tags")).toEqual(
			expect.arrayContaining(["[laughs]", "[sarcastic]"]),
		);
		expect(inlineTags("gemini")).toContain("<sigh>");
		expect(inlineTags("gemini")).not.toContain("[cheerful and friendly]");
		expect(inlineTags("typecast_v30")).toEqual([]);
		expect(inlineTags("airy")).toEqual([]);
	});
	it("max(2, ⌈태그 뺀 글자 수 ÷ 100⌉)", () => {
		expect(newTagMax("가".repeat(150))).toBe(2);
		expect(newTagMax("가".repeat(201))).toBe(3);
		expect(newTagMax("가".repeat(450))).toBe(5);
		expect(newTagMax(`[sighs] ${"가".repeat(200)} <laugh>`)).toBe(2);
	});
});

const item = (over: Partial<ParagraphTagItem> = {}): ParagraphTagItem => ({
	family: "gemini",
	emotions: null,
	max: 2000,
	text: "가나 다라",
	direction: "",
	...over,
});
const tip = (over: Partial<Suggestion> = {}): Suggestion => ({
	direction: "",
	text: "",
	emotion: "",
	intensity: null,
	...over,
});
// Gemini 문단에 대본과 목록 값 지시를 함께 제안한다. 대본이 어긋나도 지시는 받는다
const CALM = "calm and relaxed";
const both = (text: string, base = item()) =>
	checkParagraph(base, tip({ text, direction: CALM }));

describe("checkParagraph 대본(T10 스펙 15.3)", () => {
	it("허용한 새 태그와 지시를 함께 받는다", () => {
		expect(both("<sigh> 가나 다라")).toEqual({
			text: "<sigh> 가나 다라",
			direction: CALM,
		});
	});
	it("글자가 바뀌면 대본만 원래 값", () => {
		expect(both("<sigh> 가나 다마")).toEqual({
			text: "가나 다라",
			direction: CALM,
		});
	});
	it("줄바꿈을 지우면 원래 값이고, 줄바꿈 둘레 공백은 받는다", () => {
		const base = item({ family: "fish_s2", text: "가\n나" });
		expect(checkParagraph(base, tip({ text: "가 [sighs] 나" })).text).toBe(
			"가\n나",
		);
		expect(checkParagraph(base, tip({ text: "가 [sighs]\n나" })).text).toBe(
			"가 [sighs]\n나",
		);
	});
	it("연속 공백 길이 차이는 받는다", () => {
		const base = item({ family: "fish_s2", text: "가  나" });
		expect(checkParagraph(base, tip({ text: "가 [sighs] 나" })).text).toBe(
			"가 [sighs] 나",
		);
	});
	it("새 태그가 없는 제안(공백만 바꿈·원래 태그 옮김)은 원래 값이다(가짜 변경이면 저장된 결과가 '안 만듦'이 된다)", () => {
		const spaced = item({ family: "fish_s2", text: "가  나" });
		expect(checkParagraph(spaced, tip({ text: "가 나" })).text).toBe("가  나");
		const moved = item({ family: "fish_s2", text: "[sighs] 가" });
		expect(checkParagraph(moved, tip({ text: "가 [sighs]" })).text).toBe(
			"[sighs] 가",
		);
	});
	it("원문의 <삼국지>를 빼면 원래 값, 남기면 받는다", () => {
		const base = item({ text: "영화 <삼국지> 봤어" });
		expect(both("<sigh> 영화 봤어", base)).toEqual({
			text: base.text,
			direction: CALM,
		});
		expect(both("<sigh> 영화 <삼국지> 봤어", base).text).toBe(
			"<sigh> 영화 <삼국지> 봤어",
		);
	});
	it("원래 태그 하나가 빠지면 원래 값", () => {
		const base = item({ text: "<sigh> 가나 <laugh> 다라" });
		expect(both("<sigh> 가나 다라", base)).toEqual({
			text: base.text,
			direction: CALM,
		});
	});
	it("목록 밖 태그는 원래 값", () => {
		const base = item({ family: "fish_s2" });
		expect(
			checkParagraph(base, tip({ text: "[whispering softly] 가나 다라" })).text,
		).toBe(base.text);
		expect(
			checkParagraph(base, tip({ text: "[whispering] 가나 다라" })).text,
		).toBe("[whispering] 가나 다라");
	});
	it("Gemini 문단의 대괄호 태그는 원래 값", () => {
		expect(both("[laughs] 가나 다라")).toEqual({
			text: "가나 다라",
			direction: CALM,
		});
	});
	it("새 태그는 newTagMax개까지(150자 문단은 2개)", () => {
		const base = item({ text: "가".repeat(150) });
		const two = `<sigh> <laugh> ${base.text}`;
		expect(both(two, base).text).toBe(two);
		expect(both(`<sigh> <laugh> <gasp> ${base.text}`, base)).toEqual({
			text: base.text,
			direction: CALM,
		});
	});
	it("<|가 든 글은 원래 값", () => {
		expect(both("<|speaker:0|> 가나 다라")).toEqual({
			text: "가나 다라",
			direction: CALM,
		});
	});
	it("제안 글(태그 포함) 코드 포인트가 max를 넘으면 원래 값", () => {
		const base = item({ text: "가".repeat(10), max: 17 });
		// "<sigh> " 7자 + 10자 = 17자, "<laugh> " 8자 + 10자 = 18자
		expect(both(`<sigh> ${base.text}`, base).text).toBe(`<sigh> ${base.text}`);
		expect(both(`<laugh> ${base.text}`, base)).toEqual({
			text: base.text,
			direction: CALM,
		});
	});
});

describe("checkParagraph 지시·감정", () => {
	it("Gemini 지시는 목록 값·짧은 영어 문구만 받고, 영문이 없거나 빈 값이면 원래 값", () => {
		const base = item({ direction: "muttering" });
		const direction = (value: string) =>
			checkParagraph(base, tip({ direction: value })).direction;
		expect(direction(CALM)).toBe(CALM);
		expect(direction(" tired but kind ")).toBe("tired but kind");
		expect(direction("속삭여")).toBe("muttering");
		expect(direction("")).toBe("muttering");
	});
	it("다른 family의 지시는 늘 원래 값", () => {
		for (const family of [
			"fish_s2",
			"elevenlabs_tags",
			"typecast_v30",
			"airy",
		] as const)
			expect(
				checkParagraph(item({ family }), tip({ direction: CALM })).direction,
			).toBe("");
	});
	it("Typecast v30은 성우가 가진 감정만 받고, 강도는 0.5 눈금이다", () => {
		const feel = { typecast: { emotion: "normal" as const, intensity: 1 } };
		const base = item({
			family: "typecast_v30",
			emotions: ["smart", "happy"],
			feel,
		});
		expect(checkParagraph(base, tip({ emotion: "sad" }))).toEqual({
			text: base.text,
			direction: "",
			feel,
		});
		expect(
			checkParagraph(base, tip({ emotion: "happy", intensity: 1.3 })).feel,
		).toEqual({ typecast: { emotion: "happy", intensity: 1.5 } });
	});
	it("v21의 smart는 원래 값", () => {
		expect(
			checkParagraph(
				item({ family: "typecast_v21" }),
				tip({ emotion: "smart" }),
			).feel,
		).toBeUndefined();
	});
	it("Airy bright는 받는다", () => {
		expect(
			checkParagraph(item({ family: "airy" }), tip({ emotion: "bright" })).feel,
		).toEqual({ airy: { style: "bright" } });
	});
	it("감정·말투 제안이 지금 값과 같으면 원래 feel 객체 그대로다(가짜 변경 없음)", () => {
		const typecast = item({
			family: "typecast_v30",
			feel: { typecast: { emotion: "sad", intensity: 1.5 } },
		});
		expect(
			checkParagraph(typecast, tip({ emotion: "sad", intensity: 1.5 })).feel,
		).toBe(typecast.feel);
		const airy = item({ family: "airy", feel: { airy: { style: "calm" } } });
		expect(checkParagraph(airy, tip({ emotion: "calm" })).feel).toBe(airy.feel);
		// 강도만 달라도 바뀐 값이다
		expect(
			checkParagraph(typecast, tip({ emotion: "sad", intensity: 1 })).feel,
		).toEqual({ typecast: { emotion: "sad", intensity: 1 } });
	});
	it("강도는 0.5 눈금으로 맞춘 뒤 견준다: 지금 1.3에 같은 감정을 되풀이하면 원래 feel 객체", () => {
		const typecast = item({
			family: "typecast_v30",
			feel: { typecast: { emotion: "sad", intensity: 1.3 } },
		});
		expect(
			checkParagraph(typecast, tip({ emotion: "sad", intensity: 1.3 })).feel,
		).toBe(typecast.feel);
		expect(
			checkParagraph(typecast, tip({ emotion: "sad", intensity: 2 })).feel,
		).toEqual({ typecast: { emotion: "sad", intensity: 2 } });
	});
});

describe("paragraphTagPrompt", () => {
	const items = [
		item({ family: "fish_s2", text: "첫 문단\n둘째 줄 [sighs]" }),
		item({
			family: "typecast_v30",
			emotions: ["normal", "sad"],
			text: "둘",
			feel: { typecast: { emotion: "sad", intensity: 1 } },
		}),
		item({ family: "fish_s2", text: "셋" }),
		item({ family: "typecast_v30", emotions: ["normal", "happy"], text: "넷" }),
		item({ text: "가".repeat(450), direction: "muttering" }),
		item({ family: "airy", text: "여섯", feel: { airy: { style: "calm" } } }),
	];
	const prompt = paragraphTagPrompt(items);
	it("schema의 문단 수는 항목 수이고 감정 enum을 담는다", () => {
		const schema = prompt.schema as {
			properties: {
				paragraphs: {
					minItems: number;
					maxItems: number;
					items: { properties: { emotion: { enum: string[] } } };
				};
			};
		};
		expect(schema.properties.paragraphs.minItems).toBe(items.length);
		expect(schema.properties.paragraphs.maxItems).toBe(items.length);
		const options = schema.properties.paragraphs.items.properties.emotion.enum;
		expect(options).toContain("");
		for (const value of Object.values(ACTING).flatMap((c) =>
			c.feel.map((t) => t.value),
		))
			expect(options).toContain(value);
		// 드라마와 같은 답 모양(키만 paragraphs)
		expect(prompt.schema).toEqual(replySchemaOf("paragraphs", items.length));
	});
	it("system 첫 줄과 묶음마다 한 줄인 허용 목록", () => {
		const lines = prompt.system.split("\n");
		expect(lines[0]).toBe(
			"You add delivery tags to Korean narration paragraphs for text-to-speech.",
		);
		const groups = lines.filter((line) => /^- \d+ \(/.test(line));
		expect(groups).toHaveLength(5);
		expect(groups[0]).toMatch(/^- 0 \(fish_s2\): /);
		expect(groups[0]).toContain("[sighs]");
		expect(groups[0]).toContain("[excited]");
		expect(groups[0]).not.toContain("direction");
		expect(groups[1]).toContain("sad");
		expect(groups[1]).not.toContain("happy");
		expect(groups[2]).toContain("happy");
		expect(groups[3]).toMatch(/^- 3 \(gemini\): direction /);
		expect(groups[3]).toContain("<sigh>");
		expect(groups[4]).toContain("bright");
	});
	it("input은 원문 그대로와 묶음 번호·지금 값(감정·강도)·새 태그 상한을 담은 JSON이다", () => {
		expect(JSON.parse(prompt.input)).toEqual([
			{
				index: 0,
				group: 0,
				direction: "",
				emotion: "",
				intensity: null,
				maxNewTags: 2,
				text: "첫 문단\n둘째 줄 [sighs]",
			},
			{
				index: 1,
				group: 1,
				direction: "",
				emotion: "sad",
				intensity: 1,
				maxNewTags: 2,
				text: "둘",
			},
			{
				index: 2,
				group: 0,
				direction: "",
				emotion: "",
				intensity: null,
				maxNewTags: 2,
				text: "셋",
			},
			{
				index: 3,
				group: 2,
				direction: "",
				emotion: "",
				intensity: null,
				maxNewTags: 2,
				text: "넷",
			},
			{
				index: 4,
				group: 3,
				direction: "muttering",
				emotion: "",
				intensity: null,
				maxNewTags: 5,
				text: "가".repeat(450),
			},
			{
				index: 5,
				group: 4,
				direction: "",
				emotion: "calm",
				intensity: null,
				maxNewTags: 2,
				text: "여섯",
			},
		]);
	});
});
