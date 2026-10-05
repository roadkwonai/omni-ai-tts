import { describe, expect, it } from "vitest";

import {
	announceOf,
	type Current,
	playFailed,
	playing,
	pressSample,
	stoppedText,
} from "./sample-state";

const minji = (
	status: NonNullable<Current>["status"],
): NonNullable<Current> => ({
	voiceId: "a",
	name: "민지",
	noun: "샘플",
	owner: null,
	status,
});

describe("pressSample", () => {
	it("불러오는 중이거나 재생 중인 같은 성우를 누르면 멈춘다", () => {
		expect(pressSample(minji("loading"), "a", "민지")).toEqual({
			next: null,
			effect: "stop",
		});
		expect(pressSample(minji("playing"), "a", "민지")).toEqual({
			next: null,
			effect: "stop",
		});
	});

	it("실패한 같은 성우를 누르면 다시 불러온다", () => {
		expect(pressSample(minji("failed"), "a", "민지")).toEqual({
			next: minji("loading"),
			effect: "load",
		});
	});

	it("다른 성우를 누르면 그 성우를 불러온다(앞 성우의 상태는 사라진다)", () => {
		expect(pressSample(minji("playing"), "b", "준호")).toEqual({
			next: {
				voiceId: "b",
				name: "준호",
				noun: "샘플",
				owner: null,
				status: "loading",
			},
			effect: "load",
		});
		expect(pressSample(null, "a", "민지").effect).toBe("load");
	});
});

describe("playFailed", () => {
	it("지금 성우의 실패는 failed이고, 앞 성우의 늦은 실패는 지금 상태를 바꾸지 않는다", () => {
		expect(playFailed(minji("loading"), "a")).toEqual(minji("failed"));
		const junho: Current = {
			voiceId: "b",
			name: "준호",
			noun: "샘플",
			owner: null,
			status: "playing",
		};
		expect(playFailed(junho, "a")).toBe(junho);
		expect(playFailed(null, "a")).toBeNull();
	});
});

describe("재생 대상과 알림", () => {
	it("명사와 성우 키를 넘기면 그대로 담는다", () => {
		expect(
			pressSample(null, "result-1", "민지", "내 문장", "typecast:tc_1").next,
		).toEqual({
			voiceId: "result-1",
			name: "민지",
			noun: "내 문장",
			owner: "typecast:tc_1",
			status: "loading",
		});
	});
	it("저장된 결과는 크레딧 0을 함께 알린다", () => {
		expect(announceOf({ ...minji("playing"), noun: "저장된 결과" })).toBe(
			"민지 저장된 결과 재생 중, 크레딧 0",
		);
	});
	it("멈춤 알림의 명사 조사를 맞춘다", () => {
		expect(stoppedText(minji("playing"))).toBe("민지 샘플을 멈췄어요");
		expect(stoppedText({ ...minji("playing"), noun: "내 문장" })).toBe(
			"민지 내 문장을 멈췄어요",
		);
		expect(stoppedText({ ...minji("playing"), noun: "저장된 결과" })).toBe(
			"민지 저장된 결과를 멈췄어요",
		);
	});
});

describe("playing", () => {
	it("불러오던 성우는 playing이 되고, 이미 재생 중이면 같은 객체라 다시 알리지 않는다", () => {
		expect(playing(minji("loading"), "a")).toEqual(minji("playing"));
		const current = minji("playing");
		expect(playing(current, "a")).toBe(current);
		expect(playing(null, "a")).toBeNull();
	});
});
