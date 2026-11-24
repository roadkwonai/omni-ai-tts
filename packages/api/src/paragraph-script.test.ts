// packages/api/src/paragraph-script.test.ts
import { describe, expect, it } from "vitest";

import {
	blankFor,
	paragraphRequest,
	pasteAt,
	pasteToParts,
	splitBlocks,
} from "./paragraph-script";
import { DEFAULT_SETTINGS } from "./providers/trial-options";

// 웹페이지·메신저에서 복사한 글에 딸려 오는 보이지 않는 글자(소스에 그대로 두지 않는다)
const INVISIBLE = ["\u{200b}", "\u{2060}", "\u{feff}"];
const paste = (raw: string) => pasteToParts(raw, () => 2000, 200);

describe("붙여 넣은 글의 제로폭 글자", () => {
	it.each(INVISIBLE)("%j만 있는 줄은 빈 줄이다", (z) => {
		const raw = `첫 문단.\n${z}\n둘째 문단.\n ${z}${z} \n셋째 문단.`;
		expect(splitBlocks(raw)).toEqual(["첫 문단.", "둘째 문단.", "셋째 문단."]);
		expect(splitBlocks(`${z}\n${z}`)).toEqual([]);
	});
	it.each(INVISIBLE)("화자 이름 앞의 %j는 무시한다", (z) => {
		const { names, parts } = paste(`민수: 안녕\n${z}민수: 잘 지내?`);
		expect(names).toEqual(["민수"]);
		expect(parts).toEqual([
			{ text: "안녕", speaker: "민수" },
			{ text: "잘 지내?", speaker: "민수" },
		]);
	});
	it.each(INVISIBLE)("%j뿐인 문단은 빈 문단이라 요청이 없다", (z) => {
		const work = {
			defaultVoice: {
				provider: "typecast" as const,
				voiceId: "tc1",
				settings: DEFAULT_SETTINGS.typecast,
			},
			gap: 0.5,
			channelId: null,
			paragraphs: [],
		};
		// 받지 않는 태그를 뺀 글이 제로폭뿐이어도 같다
		for (const text of [z, ` ${z}\n`, `[laughs]${z}`]) {
			expect(blankFor({ id: "p1", text }, work)).toBe(true);
			expect(paragraphRequest({ id: "p1", text }, work, [], 0)).toBeNull();
		}
		expect(blankFor({ id: "p1", text: `${z}글` }, work)).toBe(false);
	});
	it("카드에 붙여 넣을 때도 같다", () => {
		const work = { defaultVoice: null, speakers: [] };
		const result = pasteAt(
			[{ id: "p1", text: "" }],
			"p1",
			{ start: 0, end: 0 },
			"하나\n\u{200b}\n둘",
			work,
			10,
		);
		expect(result?.ps.map((p) => p.text)).toEqual(["하나", "둘"]);
	});
	it("이모지를 잇는 U+200D(ZWJ)는 남긴다", () => {
		const family = "👨\u{200d}👩\u{200d}👧";
		expect(paste(`민수: ${family} 우리`).parts).toEqual([
			{ text: `${family} 우리`, speaker: "민수" },
		]);
	});
});
