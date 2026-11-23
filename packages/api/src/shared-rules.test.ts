import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as dramaTags from "./drama-autotag";
import * as drama from "./drama-request";
import * as plan from "./make-plan";
import * as numbers from "./number-reading";
import * as tags from "./paragraph-autotag";
import * as files from "./paragraph-files";
import * as script from "./paragraph-script";
import { scriptWorkSchema, scriptWorkShapeSchema } from "./script-contract";
import * as speaker from "./script-speaker";
import { runRules, WORK } from "./shared-rules.cases";
import * as sound from "./sound-join";

// tsc -b의 include가 src의 ts뿐이라 JSON은 import하지 않고 읽는다
const fixtures = JSON.parse(
	readFileSync(
		new URL("./shared-rules.fixtures.json", import.meta.url),
		"utf8",
	),
) as { rules: Record<string, unknown> };

// 옮긴 순수 규칙이 옮기기 전 커밋(f66ac3e)의 웹 원본과 같은 값을 내는가(T20 인수 조건 1)
describe("웹에서 옮긴 순수 규칙(T20)", async () => {
	const actual = (await runRules({
		numbers,
		speaker,
		script,
		plan,
		tags,
		files,
		sound,
		drama,
		dramaTags,
	})) as Record<string, unknown>;

	it("고정 자료와 규칙 목록이 같다", () => {
		expect(Object.keys(actual)).toEqual(Object.keys(fixtures.rules));
	});
	it.each(Object.entries(fixtures.rules))("%s", (name, expected) => {
		expect(actual[name]).toEqual(expected);
	});
});

describe("작업 모양 스키마(T20)", () => {
	it("상한(scriptWorkProblem)만 보지 않는다: 빈 문단뿐인 작업은 모양은 맞고 저장 스키마는 거절한다", () => {
		const blank = { ...WORK, paragraphs: [{ id: "p1", text: " " }] };
		expect(scriptWorkShapeSchema.safeParse(blank).success).toBe(true);
		expect(scriptWorkSchema.safeParse(blank).success).toBe(false);
	});
	it("모양이 틀리면 둘 다 거절하고, 맞는 작업의 정리된 값은 같다", () => {
		const twice = {
			...WORK,
			paragraphs: [
				{ id: "p1", text: "가" },
				{ id: "p1", text: "나" },
			],
		};
		expect(scriptWorkShapeSchema.safeParse(twice).success).toBe(false);
		expect(scriptWorkSchema.safeParse(twice).success).toBe(false);
		const ok = { ...WORK, ownerId: "남" };
		expect(scriptWorkShapeSchema.parse(ok)).toEqual(scriptWorkSchema.parse(ok));
		expect(scriptWorkShapeSchema.parse(ok)).not.toHaveProperty("ownerId");
	});
});
