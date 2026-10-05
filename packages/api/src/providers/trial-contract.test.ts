import { describe, expect, it } from "vitest";

import { trialCreateInputSchema, trialRequestSchema } from "./trial-contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "./trial-options";

const parse = (value: unknown) => trialRequestSchema.safeParse(value);
const el = { provider: "elevenlabs", voiceId: "el0001", text: "안녕" } as const;

describe("trialRequestSchema", () => {
	it("빠진 옵션은 기본값으로 채우고, 기본값을 뺀 입력도 같은 조합 글자다(Review Focus 1)", () => {
		const parsed = trialRequestSchema.parse({ ...el, settings: {} });
		expect(parsed.settings).toEqual(DEFAULT_SETTINGS.elevenlabs);
		const full: TrialRequest = { ...el, settings: DEFAULT_SETTINGS.elevenlabs };
		expect(comboSignature(parsed)).toBe(comboSignature(full));
	});
	it("문장은 NFC·앞뒤 공백을 정리하고 1~200자(코드 포인트)만 받는다", () => {
		expect(parse({ ...el, text: "  안녕\n", settings: {} }).data?.text).toBe(
			"안녕",
		);
		expect(parse({ ...el, text: "   ", settings: {} }).success).toBe(false);
		expect(parse({ ...el, text: "가".repeat(200), settings: {} }).success).toBe(
			true,
		);
		expect(parse({ ...el, text: "가".repeat(201), settings: {} }).success).toBe(
			false,
		);
		expect(parse({ ...el, text: "😀".repeat(200), settings: {} }).success).toBe(
			true,
		);
	});
	it("범위 밖 값·대괄호 태그·31자 태그·경로 글자가 든 성우 id·모르는 모델은 거절한다", () => {
		expect(parse({ ...el, settings: { stability: 1.01 } }).success).toBe(false);
		expect(parse({ ...el, settings: { tag: "[x]" } }).success).toBe(false);
		expect(parse({ ...el, settings: { tag: "a".repeat(31) } }).success).toBe(
			false,
		);
		expect(parse({ ...el, voiceId: "../x", settings: {} }).success).toBe(false);
		expect(
			parse({
				provider: "fish_audio",
				voiceId: "f1",
				text: "안녕",
				settings: { model: "s1" },
			}).success,
		).toBe(false);
		expect(
			parse({
				provider: "typecast",
				voiceId: "tc_1",
				text: "안녕",
				settings: { pitch: -13 },
			}).success,
		).toBe(false);
	});
	it("Typecast v21은 v21 프리셋만 받는다", () => {
		const tc = { provider: "typecast", voiceId: "tc_1", text: "안녕" };
		expect(
			parse({ ...tc, settings: { model: "ssfm-v21", preset: "whisper" } })
				.success,
		).toBe(false);
		expect(
			parse({ ...tc, settings: { model: "ssfm-v21", preset: "happy" } })
				.success,
		).toBe(true);
	});
	it("만들기 입력은 uuid 요청 id를 받는다", () => {
		expect(
			trialCreateInputSchema.safeParse({
				requestId: "x",
				request: { ...el, settings: {} },
			}).success,
		).toBe(false);
	});
});
