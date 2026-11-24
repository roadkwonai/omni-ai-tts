import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { emptyVoice } from "./list";
import {
	codePoints,
	comboSignature,
	DEFAULT_SETTINGS,
	type ElevenLabsSettings,
	estimate,
	FISH_FREE_UNTIL,
	fieldsOf,
	fishUsd,
	freeModelOpen,
	GEMINI_PRICE_UP_AT,
	type GeminiModel,
	geminiUsdPerMillion,
	needsConfirm,
	requestOf,
	sentText,
	snap,
	type TrialRequest,
	usedSettings,
	utf8Bytes,
} from "./trial-options";

const el = (
	over: Partial<ElevenLabsSettings> = {},
	text = "안녕하세요",
): TrialRequest => ({
	provider: "elevenlabs",
	voiceId: "el0001",
	text,
	settings: { ...DEFAULT_SETTINGS.elevenlabs, ...over },
});
const tc = (
	over: Partial<typeof DEFAULT_SETTINGS.typecast> = {},
): TrialRequest => ({
	provider: "typecast",
	voiceId: "tc_0001",
	text: "안녕",
	settings: { ...DEFAULT_SETTINGS.typecast, ...over },
});
const fish = (
	over: Partial<typeof DEFAULT_SETTINGS.fish_audio> = {},
	text = "안녕",
): TrialRequest => ({
	provider: "fish_audio",
	voiceId: "a".repeat(32),
	text,
	settings: { ...DEFAULT_SETTINGS.fish_audio, ...over },
});
const airy = (
	over: Partial<typeof DEFAULT_SETTINGS.airy> = {},
	text = "안녕",
): TrialRequest => ({
	provider: "airy",
	voiceId: "a597bb7a98fc9ec1",
	text,
	settings: { ...DEFAULT_SETTINGS.airy, ...over },
});

describe("fieldsOf", () => {
	it("Typecast v30 자동 감정은 프리셋·강도를 쓰지 않고 v21은 감정 방식이 없다", () => {
		expect(fieldsOf(tc())).toEqual([
			"emotion",
			"language",
			"tempo",
			"pitch",
			"volume",
		]);
		expect(fieldsOf(tc({ emotion: "preset" }))).toContain("intensity");
		expect(fieldsOf(tc({ model: "ssfm-v21" }))).not.toContain("emotion");
	});
	it("ElevenLabs 모델마다 받는 옵션이 다르다(스펙 4절)", () => {
		expect(fieldsOf(el())).toEqual(["stability", "similarity", "tag"]);
		expect(fieldsOf(el({ model: "eleven_v3" }))).toEqual(["stability", "tag"]);
		expect(fieldsOf(el({ model: "eleven_multilingual_v2" }))).toEqual([
			"stability",
			"similarity",
			"style",
			"speed",
			"speakerBoost",
		]);
	});
});

describe("snap", () => {
	it("단위로 반올림하고 범위 안에 두며 부동소수 끝자리를 지운다", () => {
		const range = { min: 0, max: 1, step: 0.05, default: 0.5 };
		expect(snap(0.1 + 0.2, range)).toBe(0.3);
		expect(snap(0.33, range)).toBe(0.35);
		expect(snap(1.2, range)).toBe(1);
		expect(snap(-3, { min: -12, max: 12, step: 1, default: 0 })).toBe(-3);
	});
});

describe("comboSignature (Review Focus 1)", () => {
	it("같은 소리의 요청은 같은 글자다: 키 순서·받지 않는 옵션·끝자리·NFC·앞뒤 공백·태그 공백", () => {
		const base = comboSignature(el({ tag: "whispers" }));
		const reordered: TrialRequest = {
			provider: "elevenlabs",
			voiceId: "el0001",
			text: "안녕하세요",
			settings: {
				tag: "whispers",
				speakerBoost: true,
				speed: 1,
				style: 0,
				similarity: 0.75,
				stability: 0.5,
				model: "eleven_v4",
			},
		};
		expect(comboSignature(reordered)).toBe(base);
		// v4는 스타일·속도를 받지 않는다
		expect(
			comboSignature(el({ tag: "whispers", style: 0.9, speed: 1.2 })),
		).toBe(base);
		expect(comboSignature(el({ tag: "whispers", stability: 0.1 + 0.4 }))).toBe(
			base,
		);
		expect(comboSignature(el({ tag: "  whispers " }, "  안녕하세요\n"))).toBe(
			base,
		);
		// 분해형 한글(NFD)도 같은 문장이다
		expect(
			comboSignature(el({ tag: "whispers" }, "안녕하세요".normalize("NFD"))),
		).toBe(base);
	});
	it("문장·성우·받는 옵션 값이 다르면 다른 글자다", () => {
		const base = comboSignature(el());
		expect(comboSignature(el({}, "안녕"))).not.toBe(base);
		expect(comboSignature({ ...el(), voiceId: "el0002" })).not.toBe(base);
		expect(comboSignature(el({ stability: 0.6 }))).not.toBe(base);
		expect(comboSignature(el({ model: "eleven_v3" }))).not.toBe(base);
	});
});

describe("usedSettings", () => {
	it("모델과 받는 옵션만, 정리한 값으로 남긴다", () => {
		expect(usedSettings(el({ style: 0.9, tag: " sighs " }))).toEqual({
			model: "eleven_v4",
			stability: 0.5,
			similarity: 0.75,
			tag: "sighs",
		});
		expect(
			usedSettings(tc({ model: "ssfm-v21", preset: "happy", intensity: 1.53 })),
		).toEqual({
			model: "ssfm-v21",
			preset: "happy",
			intensity: 1.5,
			language: "auto",
			tempo: 1,
			pitch: 0,
			volume: 100,
		});
	});
});

describe("sentText와 예상 사용량", () => {
	it("말투 태그는 받는 모델에서만 문장 앞에 붙고 사용량에 든다", () => {
		expect(sentText(el({ tag: "whispers" }, "안녕"))).toBe("[whispers] 안녕");
		expect(
			sentText(
				el({ model: "eleven_multilingual_v2", tag: "whispers" }, "안녕"),
			),
		).toBe("안녕");
		expect(sentText(fish({ tag: "happy" }))).toBe("[happy] 안녕");
		expect(estimate(el({ tag: "whispers" }, "안녕"))).toEqual({
			unit: "credit",
			amount: 13,
		});
	});
	it("Typecast는 코드 포인트 글자 수, ElevenLabs는 배율을 곱해 올림, 배율이 없으면 1", () => {
		expect(estimate(tc())).toEqual({ unit: "credit", amount: 2 });
		expect(codePoints("😀가")).toBe(2);
		expect(estimate(el({}, "가나다"), 0.5)).toEqual({
			unit: "credit",
			amount: 2,
		});
		expect(estimate(el({}, "가나다"), null)).toEqual({
			unit: "credit",
			amount: 3,
		});
	});
	it("배율을 곱한 올림은 부동소수 끝자리에 흔들리지 않는다(25자 × 0.28 = 7)", () => {
		const credits = (chars: number, rate: number) =>
			estimate(el({}, "가".repeat(chars)), rate).amount;
		expect(credits(25, 0.28)).toBe(7);
		expect(credits(100, 0.28)).toBe(28);
		// 배율 = 백분율 정수 / 100으로 센 정확한 올림과 1~2,000자에서 같다
		const wrong = [14, 28, 33, 55, 70, 110, 150].flatMap((percent) =>
			Array.from({ length: 2000 }, (_, i) => i + 1)
				.filter(
					(chars) =>
						credits(chars, percent / 100) !==
						Math.floor((chars * percent + 99) / 100),
				)
				.map((chars) => `${chars}자 × ${percent / 100}`),
		);
		expect(wrong).toEqual([]);
	});
	it("말투 태그·지시가 분해형 한글(NFD)이어도 같은 조합·같은 문장·같은 사용량이다", () => {
		const nfd = "속삭임".normalize("NFD");
		const gemini = (direction: string): TrialRequest => ({
			provider: "gemini",
			voiceId: "kore",
			text: "안녕",
			settings: { ...DEFAULT_SETTINGS.gemini, direction },
		});
		for (const [a, b] of [
			[el({ tag: "속삭임" }), el({ tag: nfd })],
			[
				fish({ model: "s2.1-pro", tag: "속삭임" }),
				fish({ model: "s2.1-pro", tag: nfd }),
			],
			[gemini("속삭임"), gemini(nfd)],
		] as const) {
			expect(comboSignature(b)).toBe(comboSignature(a));
			expect(sentText(b)).toBe(sentText(a));
			expect(estimate(b)).toEqual(estimate(a));
		}
	});
	it("Fish Audio 유료는 UTF-8 바이트(한글 3바이트), 무료 모델은 0", () => {
		expect(utf8Bytes("안녕")).toBe(6);
		expect(estimate(fish({ model: "s2.1-pro" }))).toEqual({
			unit: "byte",
			amount: 6,
		});
		expect(estimate(fish())).toEqual({ unit: "free", amount: 0 });
		expect(fishUsd(300)).toBeCloseTo(0.0045, 6);
	});
	it("무료 모델은 종료일 0시(KST) 전까지만 열려 있다", () => {
		expect(freeModelOpen(FISH_FREE_UNTIL - 1)).toBe(true);
		expect(freeModelOpen(FISH_FREE_UNTIL)).toBe(false);
	});
	it("Airy 예상 크레딧: 한국어 1.5배 올림, 영어 1배, 태그 없이 보낸 문장 그대로(Review Focus 3)", () => {
		expect(sentText(airy({}, "  가나다 "))).toBe("가나다");
		expect(estimate(airy({}, "가나다"))).toEqual({ unit: "credit", amount: 5 });
		expect(estimate(airy({}, "가나"))).toEqual({ unit: "credit", amount: 3 });
		expect(estimate(airy({ language: "en" }, "abc"))).toEqual({
			unit: "credit",
			amount: 3,
		});
		// 이모지 하나는 한 글자(코드 포인트)다
		expect(estimate(airy({}, "😀"))).toEqual({ unit: "credit", amount: 2 });
	});
	it("Airy는 언어·말투만 받고 같은 조합 글자에 들어간다", () => {
		expect(fieldsOf(airy())).toEqual(["language", "style"]);
		expect(usedSettings(airy({ style: "calm" }))).toEqual({
			model: "airy-tts-v1",
			language: "ko",
			style: "calm",
		});
		expect(comboSignature(airy({ style: "calm" }))).not.toBe(
			comboSignature(airy()),
		);
	});
});

// 웹과 CLI가 함께 쓰는 설정 보정(T18). 자세한 경우는 apps/web의 trial-view 테스트가 본다
describe("requestOf (T18)", () => {
	const voice = (
		provider: "typecast" | "fish_audio",
		models: { model: string; emotions: string[] }[] = [],
	) => ({
		...emptyVoice(provider, "public"),
		voiceId: "v1",
		name: "민지",
		models,
	});
	it("Typecast v21만 되는 성우는 모델을 v21로, 감정을 직접·그 성우의 프리셋으로 맞춘다. 공급자 설정은 그대로다", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			typecast: {
				...DEFAULT_SETTINGS.typecast,
				emotion: "smart" as const,
				preset: "whisper" as const,
			},
		};
		const before = structuredClone(settings);
		expect(
			requestOf(
				voice("typecast", [{ model: "ssfm-v21", emotions: ["normal", "sad"] }]),
				"안녕",
				settings,
			),
		).toEqual({
			provider: "typecast",
			voiceId: "v1",
			text: "안녕",
			settings: {
				...settings.typecast,
				model: "ssfm-v21",
				emotion: "preset",
				preset: "normal",
			},
		});
		expect(settings).toEqual(before);
	});
	it("Fish 무료 모델은 종료 전에는 그대로(확인 없음), 종료 뒤에는 유료 모델로 바뀌고 확인이 필요하다", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			fish_audio: {
				...DEFAULT_SETTINGS.fish_audio,
				model: "s2.1-pro-free" as const,
			},
		};
		const at = (now: number) => {
			const request = requestOf(voice("fish_audio"), "안녕", settings, now);
			return [request.settings.model, needsConfirm(request, now)];
		};
		expect(at(FISH_FREE_UNTIL - 1)).toEqual(["s2.1-pro-free", false]);
		expect(at(FISH_FREE_UNTIL)).toEqual(["s2.1-pro", true]);
	});
	it("값 import가 없다: 화면 번들과 Node 타입 제거로 바로 실행하는 CLI가 쓴다", () => {
		const source = readFileSync(
			new URL("./trial-options.ts", import.meta.url),
			"utf8",
		);
		expect(source.match(/^import (?!type )/gm)).toBeNull();
	});
});

describe("Gemini 추정 금액(T7.6 스펙 2절, 계획에서 정한 것 1)", () => {
	const gemini = (
		text: string,
		model: GeminiModel = "gemini-3.8-flash-tts",
		direction = "",
	): TrialRequest => ({
		provider: "gemini",
		voiceId: "kore",
		text,
		settings: { model, direction },
	});
	const before = GEMINI_PRICE_UP_AT - 1;

	it("가정한 길이(1초 5글자, 올림, 최소 1초) × 25토큰 × 단가를 백만분의 1달러로 담는다", () => {
		expect(estimate(gemini("가"), null, before)).toEqual({
			unit: "usd_micro",
			amount: 225,
		});
		expect(estimate(gemini("가나다라마"), null, before)).toEqual({
			unit: "usd_micro",
			amount: 225,
		});
		expect(estimate(gemini("가나다라마바"), null, before)).toEqual({
			unit: "usd_micro",
			amount: 450,
		});
		expect(
			estimate(
				gemini("가나다라마바", "gemini-3.8-flash-lite-tts"),
				null,
				before,
			),
		).toEqual({ unit: "usd_micro", amount: 300 });
	});

	it("2027-01-01 0시 KST부터 단가가 두 배다", () => {
		expect(estimate(gemini("가"), null, GEMINI_PRICE_UP_AT)).toEqual({
			unit: "usd_micro",
			amount: 450,
		});
		expect(geminiUsdPerMillion("gemini-3.8-flash-tts", before)).toBe(9);
		expect(
			geminiUsdPerMillion("gemini-3.8-flash-lite-tts", GEMINI_PRICE_UP_AT),
		).toBe(12);
	});

	it("말투 지시는 문장에 붙지 않고 금액에 들지 않지만 같은 조합 판정에는 든다(앞뒤 공백 무시)", () => {
		const plainRequest = gemini("안녕하세요");
		const directed = gemini(
			"안녕하세요",
			"gemini-3.8-flash-tts",
			"  calm and relaxed ",
		);
		expect(sentText(directed)).toBe("안녕하세요");
		expect(estimate(directed, null, before)).toEqual(
			estimate(plainRequest, null, before),
		);
		expect(usedSettings(directed)).toEqual({
			model: "gemini-3.8-flash-tts",
			direction: "calm and relaxed",
		});
		expect(comboSignature(directed)).not.toBe(comboSignature(plainRequest));
		expect(comboSignature(directed)).toBe(
			comboSignature(
				gemini("안녕하세요", "gemini-3.8-flash-tts", "calm and relaxed"),
			),
		);
	});
});
