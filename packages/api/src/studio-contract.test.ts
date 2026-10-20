// packages/api/src/studio-contract.test.ts
import { describe, expect, it } from "vitest";
import { trialRequestSchema } from "./providers/trial-contract";
import {
	DEFAULT_SETTINGS,
	partsOf,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	TRIAL_TEXT_MAX,
} from "./providers/trial-options";
import {
	studioAudioInputSchema,
	studioCreateInputSchema,
	studioItemSchema,
	studioRequestSchema,
} from "./studio-contract";

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
	it("Typecast만 받고 설정은 T5 Typecast 계약이다(v21 감정 포함)", () => {
		expect(
			studioRequestSchema.safeParse({
				...request("가"),
				provider: "elevenlabs",
				settings: DEFAULT_SETTINGS.elevenlabs,
			}).success,
		).toBe(false);
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
	it("이전 결과 줄은 완료·미확인만", () => {
		const item = (status: string) =>
			studioItemSchema.safeParse({
				id: crypto.randomUUID(),
				createdAt: new Date().toISOString(),
				status,
				usage: { unit: "credit", amount: 5 },
				bytes: 0,
				request: request("가"),
			}).success;
		expect([item("done"), item("unknown")]).toEqual([true, true]);
		expect([item("failed"), item("pending")]).toEqual([false, false]);
	});
});
