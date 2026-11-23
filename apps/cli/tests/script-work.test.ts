import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { scriptWorkSchema } from "@tts-pilot-app/api/script-contract";
import { describe, expect, it } from "vitest";
import {
	mergeText,
	newWork,
	paragraphsOf,
	type Work,
	workText,
} from "../src/script-work.js";

type Paragraph = Work["paragraphs"][number];
const typecast = (voiceId: string) => ({
	provider: "typecast" as const,
	voiceId,
	settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.2 },
});
const p = (id: string, text: string, over: Partial<Paragraph> = {}) => ({
	id,
	text,
	...over,
});
const work = (...paragraphs: Paragraph[]): Work => ({
	defaultVoice: typecast("tc_default"),
	gap: 0.8,
	speakers: [{ name: "철수", voice: typecast("tc_speaker") }],
	paragraphs,
});
const fixes = (text: string) => ({
	text,
	decisions: [
		{ start: 0, end: 1, original: "3", choice: "manual" as const, reading: "" },
	],
});
// 이은 결과를 원래 문단은 ID로, 새 문단은 +글로 적는다
const shape = (before: Work, after: Work) => {
	const ids = new Set(before.paragraphs.map(({ id }) => id));
	return after.paragraphs.map(({ id, text }) =>
		ids.has(id) ? id : `+${text}`,
	);
};

describe("글을 문단으로 나눈다", () => {
	it.each([
		["가\n나", ["가\n나"]],
		["가\n\n나", ["가", "나"]],
		["가\r\n\r\n나\r\r다", ["가", "나", "다"]],
		["\n\n 가 \n \t\n\n  나\n\n", ["가", "나"]],
		[" \n\n ", []],
		["", []],
	])("%j", (raw, expected) => {
		expect(paragraphsOf(raw)).toEqual(expected);
	});
	it("새 대본은 쉼 0.5초, 설정 없는 문단이고 서버 계약에 맞는다", () => {
		const made = newWork("가\n\n나", null);
		expect(made).toMatchObject({
			defaultVoice: null,
			gap: 0.5,
			paragraphs: [{ text: "가" }, { text: "나" }],
		});
		expect(scriptWorkSchema.parse(made)).toEqual(made);
		expect(new Set(made.paragraphs.map(({ id }) => id)).size).toBe(2);
		expect(newWork("가", typecast("v")).defaultVoice).toEqual(typecast("v"));
	});
});

describe("글로 내보낸 뒤 그대로 이으면 작업이 같다", () => {
	it.each<[string, Work]>([
		["문단 하나", work(p("a", "가"))],
		[
			"설정 칸 전부",
			work(
				p("a", "3개", { gap: 0, voice: typecast("tc_a"), speaker: "철수" }),
				p("b", "둘", { fixes: fixes("둘") }),
			),
		],
		[
			"앞·사이·뒤 빈 문단(설정 있는 것 포함)",
			work(
				p("x", ""),
				p("y", " \n", { gap: 2 }),
				p("a", "가"),
				p("z", "", { speaker: "철수" }),
				p("b", "나"),
				p("w", "  "),
			),
		],
		[
			"빈 줄을 품은 문단",
			work(
				p("a", "가\n\n나", { gap: 1 }),
				p("b", "다\n \n라\r\n\r\n마"),
				p("c", "바"),
			),
		],
		[
			"앞뒤 공백·줄바꿈과 CRLF",
			work(
				p("a", "  가\n", { speaker: "철수" }),
				p("b", "\n\n나\r\n다  "),
				p("c", "\r라\r"),
			),
		],
		[
			"같은 글 반복",
			work(
				p("a", "네", { gap: 1 }),
				p("b", "네"),
				p("c", "네\n\n네", { speaker: "철수" }),
				p("d", "네", { gap: 3 }),
			),
		],
	])("%s", (_name, before) => {
		for (const raw of [workText(before), `﻿${workText(before)}\r\n`]) {
			const merged = mergeText(before, raw);
			expect(merged).toEqual({ work: before, lost: 0 });
		}
	});
	it("조각이 20,000개를 넘는 글은 표를 만들지 않고 2다", () => {
		const raw = (count: number) =>
			Array.from({ length: count }, (_, i) => `${i}`).join("\n\n");
		expect(
			mergeText(work(p("a", "가")), raw(20_000)).work.paragraphs,
		).toHaveLength(20_000);
		expect(() => mergeText(work(p("a", "가")), raw(20_001))).toThrow("200개");
	});
	it("문단 200개도 같다", () => {
		const before = work(
			...Array.from({ length: 200 }, (_, i) =>
				p(`p${i}`, `문단 ${i % 7}`, { gap: i % 5 }),
			),
		);
		expect(mergeText(before, workText(before))).toEqual({
			work: before,
			lost: 0,
		});
	});
});

describe("글이 같은 문단을 순서대로 잇는다", () => {
	const set = { gap: 1 };
	it.each<[string, Work, string, string[], number]>([
		["더하기", work(p("a", "가", set)), "가\n\n나", ["a", "+나"], 0],
		[
			"사이에 더하기",
			work(p("a", "가"), p("b", "나", set)),
			"가\n\n새\n\n나",
			["a", "+새", "b"],
			0,
		],
		[
			"설정 있는 문단 빼기",
			work(p("a", "가", set), p("b", "나")),
			"나",
			["b"],
			1,
		],
		["설정 없는 문단 빼기", work(p("a", "가"), p("b", "나")), "나", ["b"], 0],
		[
			"고치기",
			work(p("a", "가", set), p("b", "나")),
			"각\n\n나",
			["+각", "b"],
			1,
		],
		[
			"자리 바꾸기는 많이 남는 쪽",
			work(p("a", "가", set), p("b", "나", set), p("c", "다", set)),
			"다\n\n가\n\n나",
			["+다", "a", "b"],
			1,
		],
		[
			"같은 글 반복에서 하나 빼기",
			work(p("a", "네", set), p("b", "네", set), p("c", "응", set)),
			"네\n\n응",
			["a", "c"],
			1,
		],
		[
			"반복 앞에 다른 글이 들어감",
			work(p("a", "네", set), p("b", "아니", set), p("c", "네", set)),
			"아니\n\n네",
			["b", "c"],
			1,
		],
		[
			"빈 줄을 품은 문단의 일부만 남음",
			work(p("a", "가\n\n나", set), p("b", "다")),
			"가\n\n다",
			["+가", "b"],
			1,
		],
		[
			"빈 줄을 품은 문단 앞뒤에 더하기",
			work(p("a", "가\n\n나", set)),
			"앞\n\n가\n\n나\n\n뒤",
			["+앞", "a", "+뒤"],
			0,
		],
		[
			"양옆이 이어진 빈 문단은 남고 사이에 더해진 빈 문단은 빠진다",
			work(
				p("a", "가"),
				p("x", ""),
				p("b", "나"),
				p("y", "", set),
				p("c", "다"),
			),
			"가\n\n나\n\n새\n\n다",
			["a", "x", "b", "+새", "c"],
			1,
		],
		[
			"앞·뒤 빈 문단은 첫·끝 문단이 남을 때만 남는다",
			work(p("x", "", set), p("a", "가"), p("b", "나"), p("y", "", set)),
			"가\n\n새",
			["x", "a", "+새"],
			1,
		],
		[
			"모두 바뀜",
			work(p("a", "가", set), p("x", "", set), p("b", "나")),
			"다",
			["+다"],
			2,
		],
	])("%s", (_name, before, raw, expected, lost) => {
		const merged = mergeText(before, raw);
		expect(shape(before, merged.work)).toEqual(expected);
		expect(merged.lost).toBe(lost);
		const { paragraphs: _, ...kept } = merged.work;
		const { paragraphs, ...rest } = before;
		expect(kept).toEqual(rest);
		// 이은 문단은 글까지 같은 값이고 새 문단에는 글만 있다
		for (const item of merged.work.paragraphs)
			if (paragraphs.some(({ id }) => id === item.id))
				expect(paragraphs).toContainEqual(item);
			else expect(Object.keys(item)).toEqual(["id", "text"]);
		expect(scriptWorkSchema.safeParse(merged.work).success).toBe(true);
	});
	it.each<[string, Partial<Paragraph>]>([
		["쉼", { gap: 0 }],
		["성우", { voice: typecast("v") }],
		["화자", { speaker: "철수" }],
		["숫자 검수", { fixes: fixes("가") }],
	])("%s이 있는 문단을 잃으면 센다", (_name, over) => {
		expect(mergeText(work(p("a", "가", over)), "나").lost).toBe(1);
	});
});
