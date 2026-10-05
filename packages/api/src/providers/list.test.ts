import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Voice } from "./contract";
import { clip, emptyVoice, parseVoiceItems, queryOf } from "./list";

afterEach(() => vi.restoreAllMocks());

const voice = (voiceId: string, name: string): Voice => ({
	...emptyVoice("fish_audio", "public"),
	voiceId,
	name,
});
const item = z.object({ id: z.string().min(1), title: z.string().min(1) });
const parse = (items: unknown[]) =>
	parseVoiceItems("fish_audio", items, item, (raw) => voice(raw.id, raw.title));

describe("queryOf", () => {
	it("null·undefined·빈 글자·false는 보내지 않고 0과 true는 보내며 배열은 반복 키다", () => {
		const query = queryOf({
			page: 0,
			search: "",
			language: "ko",
			accent: null,
			gender: undefined,
			featured: false,
			include_total_count: true,
			tag: ["female", "narration"],
		});
		expect(query.toString()).toBe(
			"page=0&language=ko&include_total_count=true&tag=female&tag=narration",
		);
	});
});

describe("parseVoiceItems", () => {
	it("어긋난 항목만 빼고 수와 필드 이름만 한 줄 남긴다. 같은 id는 처음 것만 남긴다", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const voices = parse([
			{ id: "a", title: "가" },
			{ id: "b" },
			{ id: "a", title: "다른 가" },
		]);
		expect(voices.map((v) => [v.voiceId, v.name])).toEqual([["a", "가"]]);
		expect(log.mock.calls).toEqual([
			["[voiceList] fish_audio 성우 1명 제외: title"],
		]);
	});

	it("toVoice가 null을 돌려준 항목(공급자 모듈이 일부러 거른 성우)은 기록 없이 뺀다", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const voices = parseVoiceItems(
			"fish_audio",
			[
				{ id: "a", title: "가" },
				{ id: "b", title: "나" },
			],
			item,
			(raw) => (raw.id === "b" ? null : voice(raw.id, raw.title)),
		);
		expect(voices.map((v) => v.voiceId)).toEqual(["a"]);
		expect(log).not.toHaveBeenCalled();
	});

	it("항목이 하나 이상인데 모두 빠지면 provider_error다. 빈 목록은 그대로 빈 목록이다", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => parse([{ id: "" }])).toThrow(
			expect.objectContaining({
				code: "BAD_GATEWAY",
				data: { provider: "fish_audio", reason: "provider_error" },
			}),
		);
		expect(parse([])).toEqual([]);
	});
});

describe("clip", () => {
	it("앞뒤 공백을 지우고 1,000자로 자르며 비면 null이다", () => {
		expect(clip("  안녕  ")).toBe("안녕");
		expect(clip("가".repeat(1200))).toHaveLength(1000);
		expect(clip("   ")).toBeNull();
		expect(clip(null)).toBeNull();
	});

	it("서로게이트 쌍 한가운데서 잘리면 짝 없는 high surrogate를 지운다(jsonb 쓰기가 깨지지 않게)", () => {
		const clipped = clip(`${"가".repeat(999)}😀`);
		expect(clipped).toHaveLength(999);
		expect(clipped).not.toMatch(/[\uD800-\uDBFF]$/);
	});
});
