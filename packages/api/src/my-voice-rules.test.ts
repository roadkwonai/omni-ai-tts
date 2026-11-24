// packages/api/src/my-voice-rules.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import * as contract from "./my-voice-contract";
import * as rules from "./my-voice-rules";

afterEach(() => {
	vi.doUnmock("zod");
	vi.resetModules();
});

describe("내 보이스 화면용 규칙", () => {
	it.each(["./my-voice-rules", "./wav"])(
		"%s는 zod를 불러오지 않는다(화면 번들)",
		async (path) => {
			vi.resetModules();
			vi.doMock("zod", () => {
				throw new Error("zod를 불러왔다");
			});
			// 이 검사가 zod를 알아보는지
			await expect(import("./my-voice-contract")).rejects.toThrow();
			vi.resetModules();
			await expect(import(/* @vite-ignore */ path)).resolves.toBeDefined();
		},
	);
	it("서버 계약이 같은 값을 쓴다", () => {
		const file = (bytes: number) => new File([new Uint8Array(bytes)], "a.wav");
		const input = {
			requestId: "0197c0de-0000-4000-8000-000000000001",
			provider: "gemini",
			name: "가".repeat(rules.MY_VOICE_NAME_MAX),
			consent: true,
			source: file(rules.SOURCE_MAX),
			consentAudio: file(rules.CONSENT_MAX),
		};
		const ok = (over: object = {}) =>
			contract.myVoiceCreateInputSchema.safeParse({ ...input, ...over })
				.success;
		expect(ok()).toBe(true);
		expect(ok({ source: file(rules.SOURCE_MAX + 1) })).toBe(false);
		expect(ok({ consentAudio: file(rules.CONSENT_MAX + 1) })).toBe(false);
		expect(ok({ name: "가".repeat(rules.MY_VOICE_NAME_MAX + 1) })).toBe(false);
		for (const provider of rules.CLONE_PROVIDERS)
			expect(ok({ provider })).toBe(true);
		expect(ok({ provider: "airy" })).toBe(false);
	});
	it("이름 검사는 계약과 같은 판정이다", () => {
		for (const [raw, problem] of [
			["내 목소리", null],
			[` ${"가".repeat(30)} \u{200b}`, null],
			["😀".repeat(30), null],
			[" \u{200b}\n", "empty"],
			["가".repeat(31), "too_long"],
			[`가${" ".repeat(1000)}`, "too_long"],
		] as const) {
			expect(rules.myVoiceNameProblem(raw)).toBe(problem);
			expect(contract.myVoiceNameSchema.safeParse(raw).success).toBe(
				problem === null,
			);
		}
	});
	it("길이 범위 안의 60초·20초 WAV가 파일 상한 안에 든다", () => {
		const bytes = (seconds: number) =>
			44 + seconds * rules.CLONE_SAMPLE_RATE * 2;
		expect(bytes(rules.CLONE_LIMITS.fish_audio.source.max)).toBeLessThan(
			rules.SOURCE_MAX,
		);
		expect(bytes(rules.CLONE_LIMITS.gemini.consent.max)).toBeLessThan(
			rules.CONSENT_MAX,
		);
		expect(rules.cloneLengthProblem("fish_audio", "source", 61)).toBe("long");
	});
});
