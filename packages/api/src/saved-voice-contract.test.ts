import { describe, expect, it } from "vitest";

import { emptyVoice } from "./providers/list";
import {
	savedVoiceLinksInputSchema,
	savedVoiceSaveInputSchema,
} from "./saved-voice-contract";

const voice = {
	...emptyVoice("fish_audio", "public"),
	voiceId: "fish1",
	name: "차분한 남자",
	previewUrl: "https://platform.r2.fish.audio/a.mp3",
	samples: [
		{
			language: null,
			title: null,
			url: "https://platform.r2.fish.audio/a.mp3",
		},
	],
};

describe("담기 입력(T7 스펙 3절)", () => {
	it("그 공급자 호스트의 https 샘플만 받는다", () => {
		expect(savedVoiceSaveInputSchema.safeParse({ voice }).success).toBe(true);
		for (const url of [
			"https://evil.example/a.mp3",
			"https://typecast.ai/a.mp3",
		])
			expect(
				savedVoiceSaveInputSchema.safeParse({
					voice: { ...voice, previewUrl: url },
				}).success,
			).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: {
					...voice,
					samples: [
						{ language: null, title: null, url: "http://a.fish.audio/a" },
					],
				},
			}).success,
		).toBe(false);
		// 해석되지 않는 주소는 예외 없이 거절한다(BAD_REQUEST, 500이 아니다)
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: { ...voice, previewUrl: "not a url" },
			}).success,
		).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: {
					...voice,
					samples: [{ language: null, title: null, url: "not a url" }],
				},
			}).success,
		).toBe(false);
	});
	it("성우 id는 안전한 문자 1~200자, Typecast는 공개 성우만 받는다", () => {
		for (const voiceId of ["..", "a/b", "a".repeat(201), ""])
			expect(
				savedVoiceSaveInputSchema.safeParse({ voice: { ...voice, voiceId } })
					.success,
			).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: { ...voice, voiceId: "a".repeat(200) },
			}).success,
		).toBe(true);
		const typecast = {
			...emptyVoice("typecast", "public"),
			voiceId: "tc_1",
			name: "민지",
		};
		expect(
			savedVoiceSaveInputSchema.safeParse({ voice: typecast }).success,
		).toBe(true);
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: { ...typecast, source: "account" },
			}).success,
		).toBe(false);
	});
	it("Airy: assets.airy.so의 https 샘플과 공개 출처만 받는다", () => {
		const url =
			"https://assets.airy.so/airy/voice_pack/vp-v9/audio/ko/a597bb7a98fc9ec1.opus";
		const airy = {
			...emptyVoice("airy", "public"),
			voiceId: "a597bb7a98fc9ec1",
			name: "Silvia",
			previewUrl: url,
			samples: [{ language: "ko", title: null, url }],
		};
		expect(savedVoiceSaveInputSchema.safeParse({ voice: airy }).success).toBe(
			true,
		);
		for (const bad of [
			"https://cdn.airy.so/a.opus",
			"https://assets.airy.so.evil.example/a.opus",
			"https://platform.r2.fish.audio/a.mp3",
		])
			expect(
				savedVoiceSaveInputSchema.safeParse({
					voice: { ...airy, previewUrl: bad },
				}).success,
			).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: { ...airy, source: "account" },
			}).success,
		).toBe(false);
	});
	it("JSON 20,000자를 넘는 성우 정보는 거절한다", () => {
		const big = {
			...voice,
			tags: Array.from({ length: 2000 }, (_, i) => `tag${i}xxxxx`),
		};
		expect(savedVoiceSaveInputSchema.safeParse({ voice: big }).success).toBe(
			false,
		);
	});
	it("메모는 T6 규칙으로 정리하고(빈 값 null), 주지 않으면 키가 없다", () => {
		expect(
			savedVoiceSaveInputSchema.parse({ voice, memo: "  차분  함 " }).memo,
		).toBe("차분 함");
		expect(
			savedVoiceSaveInputSchema.parse({ voice, memo: "" }).memo,
		).toBeNull();
		expect("memo" in savedVoiceSaveInputSchema.parse({ voice })).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({ voice, memo: "가".repeat(201) })
				.success,
		).toBe(false);
	});
	it("연결 id는 uuid, 그룹마다 50개까지, 중복은 하나로", () => {
		const id = "6f1c1f3e-8a7b-4c2d-9e0f-1a2b3c4d5e6f";
		expect(
			savedVoiceLinksInputSchema.parse({
				voice,
				channelIds: [id, id],
				classificationIds: [],
			}).channelIds,
		).toEqual([id]);
		expect(
			savedVoiceLinksInputSchema.safeParse({
				voice,
				channelIds: ["x"],
				classificationIds: [],
			}).success,
		).toBe(false);
		expect(
			savedVoiceLinksInputSchema.safeParse({
				voice,
				channelIds: [],
				classificationIds: Array.from({ length: 51 }, () =>
					crypto.randomUUID(),
				),
			}).success,
		).toBe(false);
	});
});
