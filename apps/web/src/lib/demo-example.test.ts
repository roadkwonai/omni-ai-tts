import { SEND_TAGS } from "@tts-pilot-app/api/paragraph-tags";
import {
	DEFAULT_SETTINGS,
	STUDIO_TEXT_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import {
	EXAMPLE_SCRIPT,
	exampleVoiceSetup,
	shouldFillExample,
	shouldSetExampleVoice,
} from "./demo-example";
import { readingItems } from "./number-reading";
import { pasteToParts } from "./paragraph-script";

const blank = [{ text: "" }];
const base = {
	demo: true,
	example: "1",
	restored: true,
	paragraphs: blank,
};

describe("예시 대본", () => {
	it("붙여넣기와 같은 나눔으로 3문단이 되고 숫자와 연기 태그가 든다", () => {
		const { parts, extra } = pasteToParts(
			EXAMPLE_SCRIPT,
			() => STUDIO_TEXT_MAX,
			200,
		);
		expect(parts).toHaveLength(3);
		expect(extra).toBe(0);
		expect(parts.every((p) => p.speaker === undefined)).toBe(true);
		const all = parts.map((p) => p.text).join("\n");
		expect(all.match(new RegExp(SEND_TAGS))?.length).toBeGreaterThanOrEqual(3);
		expect(readingItems(all).length).toBeGreaterThanOrEqual(5);
	});
});

describe("shouldFillExample(채우는 때)", () => {
	it("공개 데모 + example=1 + 다 읽음 + 빈 작업실이면 채운다", () => {
		expect(shouldFillExample(base)).toBe(true);
		expect(
			shouldFillExample({ ...base, paragraphs: [{ text: " " }, { text: "" }] }),
		).toBe(true);
	});
	it("본인용(데모 아님)에서는 example을 무시한다", () => {
		expect(shouldFillExample({ ...base, demo: false })).toBe(false);
	});
	it("example이 없거나 1이 아니면 채우지 않는다(사이드바로 들어오면 빈 상태)", () => {
		expect(shouldFillExample({ ...base, example: null })).toBe(false);
		expect(shouldFillExample({ ...base, example: "0" })).toBe(false);
	});
	it("작업실을 다 읽기 전이나 글이 있으면 채우지 않는다(새로고침해도 다시 채우지 않는다)", () => {
		expect(shouldFillExample({ ...base, restored: false })).toBe(false);
		expect(shouldFillExample({ ...base, paragraphs: [{ text: "안녕" }] })).toBe(
			false,
		);
	});
});

const saved = (provider: string, name: string, extra = {}) =>
	({
		id: `${provider}-${name}`,
		voice: { provider, name, voiceId: `${provider}-id` },
		unavailable: false,
		...extra,
	}) as unknown as SavedVoice;

describe("exampleVoiceSetup(예시 기본 성우)", () => {
	it("보관함의 Fish Audio '일반여성2'를 공급자 기본 설정과 함께 고른다", () => {
		const setup = exampleVoiceSetup([
			saved("typecast", "일반여성2"),
			saved("fish_audio", "다른 성우"),
			saved("fish_audio", "일반여성2"),
		]);
		expect(setup).toEqual({
			provider: "fish_audio",
			voiceId: "fish_audio-id",
			settings: DEFAULT_SETTINGS.fish_audio,
		});
	});
	it("목록이 없거나 비었거나 그 성우가 없거나 이용 불가면 null이다", () => {
		expect(exampleVoiceSetup(null)).toBeNull();
		expect(exampleVoiceSetup([])).toBeNull();
		expect(exampleVoiceSetup([saved("fish_audio", "다른 성우")])).toBeNull();
		expect(
			exampleVoiceSetup([
				saved("fish_audio", "일반여성2", { unavailable: true }),
			]),
		).toBeNull();
	});
});

describe("shouldSetExampleVoice(기본 성우를 정하는 때)", () => {
	const on = {
		filled: true,
		voicesLoad: "ready",
		hasDefaultVoice: false,
	} as const;
	it("예시를 채웠고 목록 받기가 끝났고 기본 성우가 없으면 정한다(목록 실패여도 한 번 판정한다)", () => {
		expect(shouldSetExampleVoice(on)).toBe(true);
		expect(shouldSetExampleVoice({ ...on, voicesLoad: "failed" })).toBe(true);
	});
	it("목록을 받는 중이거나 예시를 안 채웠거나 이미 기본 성우가 있으면 정하지 않는다", () => {
		expect(shouldSetExampleVoice({ ...on, voicesLoad: "loading" })).toBe(false);
		expect(shouldSetExampleVoice({ ...on, filled: false })).toBe(false);
		expect(shouldSetExampleVoice({ ...on, hasDefaultVoice: true })).toBe(false);
	});
});
