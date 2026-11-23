import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as library from "./library-filter";
import { runLibraryRules } from "./library-rules.cases";
import * as sound from "./sound-join";
import * as filter from "./voice-filter";

// tsc -b의 include가 src의 ts뿐이라 JSON은 import하지 않고 읽는다
const fixtures = JSON.parse(
	readFileSync(
		new URL("./library-rules.fixtures.json", import.meta.url),
		"utf8",
	),
) as { rules: Record<string, unknown> };

// 옮긴 순수 규칙이 옮기기 전 커밋(538df54)의 웹 원본과 같은 값을 내는가(T21 인수 조건 1)
describe("웹에서 옮긴 보관함 조건·무음 판정(T21)", () => {
	const actual = runLibraryRules({ filter, library, sound }) as Record<
		string,
		unknown
	>;

	it("고정 자료와 규칙 목록이 같다", () => {
		expect(Object.keys(actual)).toEqual(Object.keys(fixtures.rules));
	});
	it.each(Object.entries(fixtures.rules))("%s", (name, expected) => {
		expect(actual[name]).toEqual(expected);
	});
});
