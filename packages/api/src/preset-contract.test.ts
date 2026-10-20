// packages/api/src/preset-contract.test.ts
import { describe, expect, it } from "vitest";

import {
	copyName,
	presetCreateInputSchema,
	presetOverwriteInputSchema,
	presetUpdateInputSchema,
	readSettings,
} from "./preset-contract";
import { emptyVoice } from "./providers/list";
import { DEFAULT_SETTINGS } from "./providers/trial-options";

const VOICE = {
	...emptyVoice("typecast", "public"),
	voiceId: "tc_a",
	name: "민지",
};
const CHANNEL = "11111111-1111-4111-8111-111111111111";

describe("readSettings(스펙 2절 '쓸 수 없는 값')", () => {
	it("지금 계약에 맞는 값은 그대로이고 fixed는 비었다", () => {
		const typecast = { ...DEFAULT_SETTINGS.typecast, tempo: 1.1, pitch: -1 };
		expect(readSettings("typecast", typecast)).toEqual({
			settings: typecast,
			fixed: [],
		});
	});
	it("없어진 모델은 처음 값이고 나머지 값은 남는다", () => {
		expect(
			readSettings("elevenlabs", {
				...DEFAULT_SETTINGS.elevenlabs,
				model: "eleven_v2_old",
				stability: 0.3,
			}),
		).toEqual({
			settings: { ...DEFAULT_SETTINGS.elevenlabs, stability: 0.3 },
			fixed: ["model"],
		});
	});
	it("범위 밖 값은 처음 값이다", () => {
		expect(
			readSettings("fish_audio", { ...DEFAULT_SETTINGS.fish_audio, speed: 9 }),
		).toEqual({ settings: DEFAULT_SETTINGS.fish_audio, fixed: ["speed"] });
	});
	it("Typecast v21이 받지 않는 감정은 감정만 처음 값이다(모델은 남는다)", () => {
		expect(
			readSettings("typecast", {
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
				preset: "whisper",
			}),
		).toEqual({
			settings: {
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
			},
			fixed: ["preset"],
		});
	});
	it("모르는 칸은 버리고 빠진 칸은 처음 값이며 둘 다 fixed에 넣지 않는다", () => {
		expect(
			readSettings("gemini", { model: "gemini-3.8-flash-tts", extra: 1 }),
		).toEqual({ settings: DEFAULT_SETTINGS.gemini, fixed: [] });
	});
	// 공급자마다 처음 값이 아닌 정상 값. 공급자와 스키마 짝이 어긋나면(예: airy↔gemini) 여기서 잡힌다(계획 리뷰 F8)
	it.each([
		[
			"typecast",
			{
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
				preset: "sad",
				tempo: 1.2,
			},
		],
		[
			"elevenlabs",
			{
				...DEFAULT_SETTINGS.elevenlabs,
				model: "eleven_multilingual_v2",
				style: 0.4,
			},
		],
		[
			"fish_audio",
			{ ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro", temperature: 0.3 },
		],
		["airy", { ...DEFAULT_SETTINGS.airy, language: "en", style: "calm" }],
		[
			"gemini",
			{
				...DEFAULT_SETTINGS.gemini,
				model: "gemini-3.8-flash-lite-tts",
				direction: "차분하게",
			},
		],
	] as const)("%s 정상 값은 그대로다", (provider, settings) => {
		expect(readSettings(provider, settings)).toEqual({ settings, fixed: [] });
	});
	it("객체가 아닌 값은 처음 값이다", () => {
		for (const raw of [null, "x", 3])
			expect(readSettings("typecast", raw)).toEqual({
				settings: DEFAULT_SETTINGS.typecast,
				fixed: [],
			});
	});
});

describe("입력 계약(스펙 3절)", () => {
	const create = {
		name: "  경제   내레이션 ",
		channelId: null,
		channelDefault: false,
		voice: VOICE,
		provider: "typecast",
		settings: DEFAULT_SETTINGS.typecast,
	};
	it("이름을 정리하고 모르는 키(ownerId)는 버린다", () => {
		const parsed = presetCreateInputSchema.parse({
			...create,
			ownerId: "someone",
		});
		expect(parsed.name).toBe("경제 내레이션");
		expect("ownerId" in parsed).toBe(false);
	});
	it("성우 공급자와 설정 공급자가 다르면 거절한다", () => {
		expect(
			presetCreateInputSchema.safeParse({
				...create,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}).success,
		).toBe(false);
		expect(
			presetOverwriteInputSchema.safeParse({
				id: CHANNEL,
				voice: VOICE,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}).success,
		).toBe(false);
	});
	it("채널 없이 채널 기본은 거절하고, 채널이 있으면 된다", () => {
		expect(
			presetCreateInputSchema.safeParse({ ...create, channelDefault: true })
				.success,
		).toBe(false);
		expect(
			presetUpdateInputSchema.safeParse({
				id: CHANNEL,
				name: "a",
				channelId: null,
				channelDefault: true,
			}).success,
		).toBe(false);
		expect(
			presetCreateInputSchema.safeParse({
				...create,
				channelId: CHANNEL,
				channelDefault: true,
			}).success,
		).toBe(true);
	});
	it("빈 이름·41자 이름은 거절하고 40자는 된다", () => {
		for (const [name, ok] of [
			["   ", false],
			["가".repeat(41), false],
			["가".repeat(40), true],
		] as const)
			expect(
				presetCreateInputSchema.safeParse({ ...create, name }).success,
			).toBe(ok);
	});
});

describe("copyName(복제 이름)", () => {
	it("'사본', 있으면 '사본 2', '사본 3'(대소문자 무시)", () => {
		expect(copyName("Econ", ["Econ"])).toBe("Econ 사본");
		expect(copyName("Econ", ["Econ", "econ 사본"])).toBe("Econ 사본 2");
		expect(copyName("Econ", ["Econ", "Econ 사본", "Econ 사본 2"])).toBe(
			"Econ 사본 3",
		);
	});
	it("40자를 넘으면 앞 이름을 줄인다", () => {
		const name = "가".repeat(40);
		const copy = copyName(name, [name]);
		expect([...copy]).toHaveLength(40);
		expect(copy.endsWith(" 사본")).toBe(true);
	});
});
