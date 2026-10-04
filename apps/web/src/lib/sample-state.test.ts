import { describe, expect, it } from "vitest";

import { type Current, playFailed, playing, pressSample } from "./sample-state";

const minji = (status: NonNullable<Current>["status"]): Current => ({
	voiceId: "a",
	name: "민지",
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
			next: { voiceId: "b", name: "준호", status: "loading" },
			effect: "load",
		});
		expect(pressSample(null, "a", "민지").effect).toBe("load");
	});
});

describe("playFailed", () => {
	it("지금 성우의 실패는 failed이고, 앞 성우의 늦은 실패는 지금 상태를 바꾸지 않는다", () => {
		expect(playFailed(minji("loading"), "a")).toEqual(minji("failed"));
		const junho: Current = { voiceId: "b", name: "준호", status: "playing" };
		expect(playFailed(junho, "a")).toBe(junho);
		expect(playFailed(null, "a")).toBeNull();
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
