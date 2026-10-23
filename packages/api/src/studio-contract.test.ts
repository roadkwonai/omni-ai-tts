// packages/api/src/studio-contract.test.ts
import { describe, expect, it } from "vitest";
import { dramaAutoTagInputSchema } from "./drama-contract";
import { trialRequestSchema } from "./providers/trial-contract";
import {
	AIRY_TEXT_MAX,
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
	partsOf,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	studioTextMax,
	TRIAL_TEXT_MAX,
} from "./providers/trial-options";
import {
	studioAudioInputSchema,
	studioAutoTagInputSchema,
	studioCreateInputSchema,
	studioFindManyInputSchema,
	studioFoundSchema,
	studioRequestSchema,
} from "./studio-contract";
import { comboKey } from "./trial";

const request = (text: string) => ({
	provider: "typecast" as const,
	voiceId: "tc_0001",
	text,
	settings: DEFAULT_SETTINGS.typecast,
});
const ok = (text: string) =>
	studioRequestSchema.safeParse(request(text)).success;

describe("작업실 요청(T9 스펙 3절)", () => {
	it("대본은 NFC·앞뒤 공백을 정리한 뒤 1~2,000자(코드 포인트)", () => {
		expect(ok("")).toBe(false);
		expect(ok("  \n\t ")).toBe(false);
		expect(studioRequestSchema.parse(request(" 가 ")).text).toBe("가");
		expect(ok("가".repeat(STUDIO_TEXT_MAX))).toBe(true);
		expect(ok("가".repeat(STUDIO_TEXT_MAX + 1))).toBe(false);
		// 풀어 쓴 한글(자모 셋)은 NFC로 한 글자다. 원문 6,000코드 포인트여도 정리 뒤 2,000자면 받는다
		const decomposed = "한".normalize("NFD");
		expect([...decomposed]).toHaveLength(3);
		expect(
			studioRequestSchema.parse(request(decomposed.repeat(STUDIO_TEXT_MAX)))
				.text,
		).toBe("한".repeat(STUDIO_TEXT_MAX));
		// 이모지 하나는 1자다(UTF-16 두 칸)
		expect(ok("😀".repeat(STUDIO_TEXT_MAX))).toBe(true);
		// 원문 상한(2,000 × 4 UTF-16)을 넘으면 정리 뒤 1자여도 정리 전에 거절한다(공백만이면 상한이 없어도 실패하므로 글자 하나를 둔다, 계획 리뷰 E8)
		expect(ok(`가${" ".repeat(STUDIO_TEXT_MAX * 4)}`)).toBe(false);
	});
	it("시험 생성 문장 규칙은 그대로다(200자)", () => {
		const trial = (text: string) =>
			trialRequestSchema.safeParse({ ...request(text) }).success;
		expect(trial("가".repeat(TRIAL_TEXT_MAX))).toBe(true);
		expect(trial("가".repeat(TRIAL_TEXT_MAX + 1))).toBe(false);
	});
	it("Typecast 설정은 T5 Typecast 계약이다(v21 감정 포함)", () => {
		expect(
			studioRequestSchema.safeParse({
				...request("가"),
				settings: {
					...DEFAULT_SETTINGS.typecast,
					model: "ssfm-v21",
					preset: "whisper",
				},
			}).success,
		).toBe(false);
		expect(
			studioRequestSchema.parse({ ...request("가"), settings: {} }).settings,
		).toEqual(DEFAULT_SETTINGS.typecast);
		expect(
			studioRequestSchema.safeParse({ ...request("가"), voiceId: "../x" })
				.success,
		).toBe(false);
	});
	it("만들기 입력은 uuid 요청 id", () => {
		expect(
			studioCreateInputSchema.safeParse({
				requestId: crypto.randomUUID(),
				request: request("가"),
			}).success,
		).toBe(true);
		expect(
			studioCreateInputSchema.safeParse({
				requestId: "x",
				request: request("가"),
			}).success,
		).toBe(false);
	});
	it("조각 번호는 0부터 32MiB의 마지막 조각까지 정수", () => {
		expect(partsOf(1)).toBe(1);
		expect(partsOf(STUDIO_PART_BYTES)).toBe(1);
		expect(partsOf(STUDIO_PART_BYTES + 1)).toBe(2);
		expect(partsOf(STUDIO_AUDIO_MAX)).toBe(11);
		const id = crypto.randomUUID();
		const part = (n: number) =>
			studioAudioInputSchema.safeParse({ id, part: n }).success;
		expect([part(0), part(10)]).toEqual([true, true]);
		expect([part(11), part(-1), part(1.5)]).toEqual([false, false, false]);
	});
});

// 넓히기 전 코드로 계산한 Typecast 작업실 요청의 조합 키(T9 결과와 호환)
const T9_KEY =
	"a9486a564202ac6aa8cbd8a4d07be8f7a067801f73e884a4e452694b4ae09bbf";
const PROVIDERS = [
	"typecast",
	"elevenlabs",
	"fish_audio",
	"airy",
	"gemini",
] as const;
const reqOf = (provider: (typeof PROVIDERS)[number], text: string) => ({
	provider,
	voiceId: "v_0001",
	text,
	settings: DEFAULT_SETTINGS[provider],
});

describe("작업실 요청 다섯 공급자(T10 스펙 4.1절)", () => {
	it("상한 값", () => {
		expect(PARAGRAPHS_MAX).toBe(200);
		expect(AIRY_TEXT_MAX).toBe(1600);
		expect(studioTextMax("airy")).toBe(1600);
		expect(studioTextMax("gemini")).toBe(STUDIO_TEXT_MAX);
	});
	it.each(PROVIDERS)("%s: 상한까지 받고 상한 + 1은 거절한다", (provider) => {
		const max = studioTextMax(provider);
		const ok = (text: string) =>
			studioRequestSchema.safeParse(reqOf(provider, text)).success;
		expect(ok("가".repeat(max))).toBe(true);
		expect(ok("가".repeat(max + 1))).toBe(false);
		expect(ok("😀".repeat(max))).toBe(true);
		expect(ok("😀".repeat(max + 1))).toBe(false);
	});
	it("Typecast 작업실 요청의 조합 키는 T9와 같다", () => {
		const parsed = studioRequestSchema.parse({
			provider: "typecast",
			voiceId: "tc_a",
			text: "안녕하세요. 문단입니다.",
			settings: DEFAULT_SETTINGS.typecast,
		});
		expect(comboKey(parsed, "studio")).toBe(T9_KEY);
	});
	it.each(PROVIDERS)("%s: 공백만인 대본은 거절한다", (provider) => {
		expect(
			studioRequestSchema.safeParse(reqOf(provider, " \n\t ")).success,
		).toBe(false);
	});
	it("studioFindManyInputSchema는 1~200개만 받는다", () => {
		const list = (n: number) =>
			studioFindManyInputSchema.safeParse(
				Array.from({ length: n }, () => request("가")),
			).success;
		expect([list(0), list(1), list(200), list(201)]).toEqual([
			false,
			true,
			true,
			false,
		]);
	});
	it("studioFoundSchema는 status done·unknown만 받는다", () => {
		const found = (status: string) =>
			studioFoundSchema.safeParse({
				id: crypto.randomUUID(),
				createdAt: new Date().toISOString(),
				usage: { unit: "credit", amount: 5 },
				bytes: 0,
				status,
			}).success;
		expect([found("done"), found("unknown"), found("failed")]).toEqual([
			true,
			true,
			false,
		]);
	});
	const BAD = {
		typecast: { model: "ssfm-v99" },
		elevenlabs: { speed: 2 },
		fish_audio: { model: "s9" },
		airy: { style: "angry" },
		gemini: { direction: "가".repeat(101) },
	} as const;
	it.each(PROVIDERS)("%s: 설정 계약 밖 값은 거절한다", (provider) => {
		expect(
			studioRequestSchema.safeParse({
				...reqOf(provider, "가"),
				settings: { ...DEFAULT_SETTINGS[provider], ...BAD[provider] },
			}).success,
		).toBe(false);
	});
});

// 자동 태그 추천 입력 문단 하나(Fish 유료 모델). over로 칸을 바꾼다
const para = (over: Record<string, unknown> = {}) => ({
	provider: "fish_audio",
	model: "s2.1-pro",
	emotions: null,
	text: "가",
	direction: "",
	...over,
});
const tagOk = (paragraphs: unknown[]) =>
	studioAutoTagInputSchema.safeParse({ paragraphs }).success;

describe("자동 태그 추천 입력(T10 스펙 15.3)", () => {
	it("문단은 1~50개", () => {
		const list = (n: number) => Array.from({ length: n }, () => para());
		expect([tagOk(list(0)), tagOk(list(1)), tagOk(list(50))]).toEqual([
			false,
			true,
			true,
		]);
		expect(tagOk(list(51))).toBe(false);
	});
	it("글자 합계는 정리 뒤 2,000자까지", () => {
		const half = para({ text: ` ${"가".repeat(1000)} ` });
		expect(tagOk([half, half])).toBe(true);
		expect(tagOk([half, half, para()])).toBe(false);
		expect(tagOk([half, para({ text: "가".repeat(1001) })])).toBe(false);
	});
	it("문단 글은 공급자 상한까지(Airy 1,600자)", () => {
		const airy = (n: number) =>
			para({ provider: "airy", model: "airy-tts-v1", text: "가".repeat(n) });
		expect(tagOk([airy(1600)])).toBe(true);
		expect(tagOk([airy(1601)])).toBe(false);
		expect(tagOk([para({ text: " " })])).toBe(false);
	});
	it("모델은 그 공급자의 작업실 모델 열거형이다", () => {
		expect(tagOk([para({ model: "drama-3" })])).toBe(false);
		expect(tagOk([para({ provider: "typecast", model: "s2.1-pro" })])).toBe(
			false,
		);
		expect(
			tagOk([
				para({ provider: "typecast", model: "ssfm-v21" }),
				para({ provider: "elevenlabs", model: "eleven_flash_v2_5" }),
				para({ provider: "gemini", model: "gemini-3.8-flash-tts" }),
			]),
		).toBe(true);
	});
	it("말투 지시는 Gemini만 100자(코드 포인트)까지, 다른 공급자는 빈 글만", () => {
		const gemini = (direction: string) =>
			para({ provider: "gemini", model: "gemini-3.8-flash-tts", direction });
		expect(
			tagOk([
				para({ provider: "typecast", model: "ssfm-v30", direction: "calm" }),
			]),
		).toBe(false);
		expect(tagOk([para({ direction: "calm" })])).toBe(false);
		expect(tagOk([gemini("가".repeat(100)), gemini("😀".repeat(100))])).toBe(
			true,
		);
		expect(tagOk([gemini("가".repeat(101))])).toBe(false);
	});
	it("성우 감정은 32자 20개까지", () => {
		const emotions = (list: string[]) =>
			para({ provider: "typecast", model: "ssfm-v30", emotions: list });
		expect(tagOk([emotions(Array.from({ length: 20 }, () => "happy"))])).toBe(
			true,
		);
		expect(tagOk([emotions(Array.from({ length: 21 }, () => "happy"))])).toBe(
			false,
		);
		expect(tagOk([emotions(["a".repeat(33)])])).toBe(false);
	});
	it("feelSchema는 드라마·작업실 계약에서 함께 동작한다(순환 import 없음)", () => {
		const feel = { typecast: { emotion: "happy", intensity: 1.5 } };
		const bad = { typecast: { emotion: "joy", intensity: 1 } };
		const studio = (value: unknown) =>
			tagOk([para({ provider: "typecast", model: "ssfm-v30", feel: value })]);
		const drama = (value: unknown) =>
			dramaAutoTagInputSchema.safeParse({
				mode: "read",
				speakers: [
					{
						name: "민수",
						provider: "typecast",
						model: "ssfm-v30",
						emotions: null,
					},
				],
				lines: [{ speaker: 0, direction: "", text: "가", feel: value }],
			}).success;
		expect([studio(feel), drama(feel)]).toEqual([true, true]);
		expect([studio(bad), drama(bad)]).toEqual([false, false]);
		expect(studio({ airy: { style: "bright" } })).toBe(true);
	});
});
