// packages/api/src/script-contract.test.ts
import { describe, expect, it } from "vitest";

import { readingItems } from "./number-reading";
import { applyCertain, decide, type Paragraph } from "./paragraph-script";
import { scriptWorkSchema } from "./script-contract";
import {
	SCRIPT_JSON_MAX,
	SCRIPT_TEXT_MAX,
	scriptWorkProblem,
} from "./script-rules";

const work = (paragraph: Omit<Paragraph, "id">) => ({
	defaultVoice: null,
	gap: 0.5,
	paragraphs: [{ id: "p1", ...paragraph }],
});
const issues = (value: unknown) => {
	const result = scriptWorkSchema.safeParse(value);
	return result.success
		? []
		: result.error.issues.map(({ path, code }) => `${path.join(".")} ${code}`);
};
const first = (text: string) => {
	const item = readingItems(text)[0];
	if (!item) throw new Error("항목 없음");
	return item;
};

// 화면 잠금(scriptWorkProblem)이 막지 않는 작업을 서버만 거절하면 사용자는 이유 없이 저장하지 못한다
describe("화면이 만들 수 있는 작업은 저장된다", () => {
	it.each([
		[
			"직접 입력한 읽기 201자",
			() => {
				const text = "암호는 1,2,3 입니다";
				return work(
					decide({ id: "p1", text }, first(text), {
						choice: "manual",
						reading: "가".repeat(201),
					}),
				);
			},
		],
		[
			"100자 넘는 원문을 원문대로",
			() => {
				const text = `번호는 ${Array.from({ length: 50 }, (_, i) => i + 1).join(",")} 입니다`;
				const item = first(text);
				expect(item.original.length).toBeGreaterThan(100);
				return work(decide({ id: "p1", text }, item, { choice: "keep" }));
			},
		],
		[
			"결정 501개",
			() => {
				const text = Array.from({ length: 501 }, (_, i) => i + 1).join(" ");
				const p = applyCertain([{ id: "p1", text }])[0] as Paragraph;
				expect(p.fixes?.decisions).toHaveLength(501);
				return work(p);
			},
		],
	])("%s", (_, make) => {
		const value = make();
		expect(scriptWorkProblem(value)).toBeNull();
		expect(issues(value)).toEqual([]);
	});
});

describe("상한은 그대로다", () => {
	const decided = (
		decision: object,
		text = "1",
		count = 1,
	): Record<string, unknown> =>
		work({
			text,
			fixes: {
				text,
				decisions: Array.from({ length: count }, () => ({
					start: 0,
					end: 1,
					original: "1",
					choice: "manual",
					...decision,
				})),
			},
		} as Omit<Paragraph, "id">);
	it("문단 글과 결정할 때의 원문은 10,000자까지", () => {
		expect(issues(work({ text: "가".repeat(SCRIPT_TEXT_MAX) }))).toEqual([]);
		const long = "가".repeat(SCRIPT_TEXT_MAX + 1);
		expect(issues(work({ text: long }))).not.toEqual([]);
		expect(
			issues(work({ text: "1", fixes: { text: long, decisions: [] } })),
		).not.toEqual([]);
	});
	it("작업은 2 MiB까지", () => {
		const reading = "가".repeat(SCRIPT_TEXT_MAX);
		const value = decided({ reading }, "1", 80);
		expect(JSON.stringify(value).length * 3).toBeGreaterThan(SCRIPT_JSON_MAX);
		expect(issues(value)).toContain(" custom");
	});
	it("읽기와 원문도 문단 글보다 길 수 없고 원문은 비지 않는다", () => {
		const long = "가".repeat(SCRIPT_TEXT_MAX * 2 + 1);
		expect(issues(decided({ reading: long }))).not.toEqual([]);
		expect(issues(decided({ original: long }))).not.toEqual([]);
		expect(issues(decided({ original: "" }))).not.toEqual([]);
	});
	it("화자 이름은 20자까지", () => {
		const name = "가".repeat(21);
		expect(issues(work({ text: "안녕", speaker: name }))).not.toEqual([]);
	});
});
