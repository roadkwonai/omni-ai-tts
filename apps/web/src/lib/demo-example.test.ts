import { SEND_TAGS } from "@tts-pilot-app/api/paragraph-tags";
import { STUDIO_TEXT_MAX } from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import { EXAMPLE_SCRIPT, shouldFillExample } from "./demo-example";
import { readingItems } from "./number-reading";
import { pasteToParts } from "./paragraph-script";

const blank = [{ text: "" }];
const base = {
	demo: true,
	example: "1",
	restored: true,
	paragraphs: blank,
};

describe("예시 대본", () => {
	it("붙여넣기와 같은 나눔으로 3문단이 되고 숫자와 연기 태그가 든다", () => {
		const { parts, extra } = pasteToParts(
			EXAMPLE_SCRIPT,
			() => STUDIO_TEXT_MAX,
			200,
		);
		expect(parts).toHaveLength(3);
		expect(extra).toBe(0);
		expect(parts.every((p) => p.speaker === undefined)).toBe(true);
		const all = parts.map((p) => p.text).join("\n");
		expect(all.match(new RegExp(SEND_TAGS))?.length).toBeGreaterThanOrEqual(3);
		expect(readingItems(all).length).toBeGreaterThanOrEqual(5);
	});
});

describe("shouldFillExample(채우는 때)", () => {
	it("공개 데모 + example=1 + 다 읽음 + 빈 작업실이면 채운다", () => {
		expect(shouldFillExample(base)).toBe(true);
		expect(
			shouldFillExample({ ...base, paragraphs: [{ text: " " }, { text: "" }] }),
		).toBe(true);
	});
	it("본인용(데모 아님)에서는 example을 무시한다", () => {
		expect(shouldFillExample({ ...base, demo: false })).toBe(false);
	});
	it("example이 없거나 1이 아니면 채우지 않는다(사이드바로 들어오면 빈 상태)", () => {
		expect(shouldFillExample({ ...base, example: null })).toBe(false);
		expect(shouldFillExample({ ...base, example: "0" })).toBe(false);
	});
	it("작업실을 다 읽기 전이나 글이 있으면 채우지 않는다(새로고침해도 다시 채우지 않는다)", () => {
		expect(shouldFillExample({ ...base, restored: false })).toBe(false);
		expect(shouldFillExample({ ...base, paragraphs: [{ text: "안녕" }] })).toBe(
			false,
		);
	});
});
