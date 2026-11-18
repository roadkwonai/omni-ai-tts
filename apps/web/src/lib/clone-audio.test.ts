// apps/web/src/lib/clone-audio.test.ts
import { CLONE_SAMPLE_RATE } from "@tts-pilot-app/api/my-voice-contract";
import { describe, expect, it } from "vitest";

import { isSilent, wavFromSamples } from "./clone-audio";
import { SILENCE } from "./sound-join";

const tag = (v: DataView, at: number) =>
	String.fromCharCode(...[0, 1, 2, 3].map((k) => v.getUint8(at + k)));

describe("wavFromSamples", () => {
	it("24kHz 모노 16비트 PCM 머리말과 데이터 크기를 만든다", async () => {
		const { wav, seconds } = wavFromSamples(
			new Float32Array([0, 0.5, -0.5, 1]),
		);
		expect(wav.type).toBe("audio/wav");
		expect(wav.size).toBe(44 + 8);
		expect(seconds).toBe(4 / CLONE_SAMPLE_RATE);
		const v = new DataView(await wav.arrayBuffer());
		expect(tag(v, 0)).toBe("RIFF");
		expect(v.getUint32(4, true)).toBe(36 + 8);
		expect(tag(v, 8)).toBe("WAVE");
		expect(tag(v, 12)).toBe("fmt ");
		expect(v.getUint16(20, true)).toBe(1);
		expect(v.getUint16(22, true)).toBe(1);
		expect(v.getUint32(24, true)).toBe(CLONE_SAMPLE_RATE);
		expect(v.getUint16(34, true)).toBe(16);
		expect(tag(v, 36)).toBe("data");
		expect(v.getUint32(40, true)).toBe(8);
		expect(v.getInt16(44 + 2, true)).toBe(Math.round(0.5 * 32767));
		expect(v.getInt16(44 + 6, true)).toBe(32767);
	});

	it("표본이 없으면 머리말만 있는 0초 WAV다", () => {
		const { wav, seconds, silent } = wavFromSamples(new Float32Array(0));
		expect(wav.size).toBe(44);
		expect(seconds).toBe(0);
		expect(silent).toBe(true);
	});

	it("1초 분량은 길이 1초", () => {
		const { seconds, wav, silent } = wavFromSamples(
			new Float32Array(CLONE_SAMPLE_RATE).fill(0.1),
		);
		expect(seconds).toBe(1);
		expect(wav.size).toBe(44 + CLONE_SAMPLE_RATE * 2);
		expect(silent).toBe(false);
	});
});

describe("isSilent", () => {
	it.each([
		["문턱 바로 아래", SILENCE * 0.99, true],
		["문턱과 같음", SILENCE, false],
		["문턱 위", SILENCE * 2, false],
		["0", 0, true],
	])("%s", (_, peak, silent) => {
		expect(isSilent(new Float32Array([0, peak, -peak / 2]))).toBe(silent);
	});
	it("음수 쪽 최대도 센다", () => {
		expect(isSilent(new Float32Array([0, -0.5]))).toBe(false);
	});
	it("표본이 없으면 무음이다", () => {
		expect(isSilent(new Float32Array(0))).toBe(true);
	});
});
