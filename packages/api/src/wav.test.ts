import { describe, expect, it } from "vitest";

import { wavHeader } from "./drama-script";
import { cloneLengthProblem } from "./my-voice-contract";
import { readCloneWav } from "./wav";

// 24kHz 모노 16비트 = 1초 48,000바이트
const BYTES_PER_SECOND = 48_000;
const wav = (dataBytes: number) => {
	const out = new Uint8Array(44 + dataBytes);
	out.set(wavHeader(dataBytes, 24_000));
	return out;
};
const patch = (bytes: Uint8Array, at: number, size: 16 | 32, value: number) => {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (size === 16) v.setUint16(at, value, true);
	else v.setUint32(at, value, true);
	return bytes;
};

describe("readCloneWav", () => {
	it("wavHeader(n, 24000)로 만든 머리말을 읽어 길이를 초로 돌려준다", () => {
		expect(readCloneWav(wav(BYTES_PER_SECOND * 12))).toBe(12);
	});

	it("fmt 앞뒤에 다른 청크가 있어도 청크를 차례로 걸어 찾는다", () => {
		const head = wavHeader(BYTES_PER_SECOND, 24_000);
		// RIFF(12) + LIST(8+4) + fmt(24) + 홀수 크기 청크(8+3+채움 1) + data(8 + n)
		const list = [..."LIST"].map((c) => c.charCodeAt(0));
		const odd = [..."junk"].map((c) => c.charCodeAt(0));
		const out = new Uint8Array(12 + 12 + 24 + 12 + 8 + BYTES_PER_SECOND);
		out.set(head.subarray(0, 12), 0);
		out.set([...list, 4, 0, 0, 0, 1, 2, 3, 4], 12);
		out.set(head.subarray(12, 36), 24);
		out.set([...odd, 3, 0, 0, 0, 9, 9, 9, 0], 48);
		out.set(head.subarray(36, 44), 60);
		expect(readCloneWav(out)).toBe(1);
	});

	it("44.1kHz는 format", () => {
		expect(readCloneWav(patch(wav(4410), 24, 32, 44_100))).toBeNull();
	});

	it("스테레오는 format", () => {
		expect(readCloneWav(patch(wav(4800), 22, 16, 2))).toBeNull();
	});

	it("8비트는 format", () => {
		expect(readCloneWav(patch(wav(4800), 34, 16, 8))).toBeNull();
	});

	it("PCM이 아니면(부동소수 3) format", () => {
		expect(readCloneWav(patch(wav(4800), 20, 16, 3))).toBeNull();
	});

	it("머리말이 깨지면(RIFF·WAVE 아님) format", () => {
		const riff = wav(4800);
		riff[0] = 0x58;
		expect(readCloneWav(riff)).toBeNull();
		const wave = wav(4800);
		wave[8] = 0x58;
		expect(readCloneWav(wave)).toBeNull();
	});

	it("data 청크가 없으면 format", () => {
		expect(readCloneWav(wav(0).subarray(0, 36))).toBeNull();
	});

	it("data가 적힌 크기보다 짧으면(잘린 파일) format", () => {
		expect(readCloneWav(wav(4800).subarray(0, 44 + 100))).toBeNull();
	});

	it("짧은 바이트는 format", () => {
		expect(readCloneWav(new Uint8Array(0))).toBeNull();
		expect(readCloneWav(wav(4800).subarray(0, 20))).toBeNull();
	});
});

describe("cloneLengthProblem", () => {
	const secondsOf = (dataBytes: number) => {
		const seconds = readCloneWav(wav(dataBytes));
		if (seconds === null) throw new Error("format");
		return seconds;
	};

	it("Fish Audio 원본 10~60초 경계", () => {
		expect(cloneLengthProblem("fish_audio", "source", secondsOf(479_520))).toBe(
			"short",
		); // 9.99초
		expect(
			cloneLengthProblem("fish_audio", "source", secondsOf(480_000)),
		).toBeNull(); // 10초
		expect(
			cloneLengthProblem("fish_audio", "source", secondsOf(2_880_000)),
		).toBeNull(); // 60초
		expect(
			cloneLengthProblem("fish_audio", "source", secondsOf(2_880_480)),
		).toBe("long"); // 60.01초
	});

	it("Gemini 원본 10~30초, 동의 녹음 1~20초", () => {
		expect(cloneLengthProblem("gemini", "source", 9.99)).toBe("short");
		expect(cloneLengthProblem("gemini", "source", 30)).toBeNull();
		expect(cloneLengthProblem("gemini", "source", 30.01)).toBe("long");
		expect(cloneLengthProblem("gemini", "consent", 0.99)).toBe("short");
		expect(cloneLengthProblem("gemini", "consent", 1)).toBeNull();
		expect(cloneLengthProblem("gemini", "consent", 20)).toBeNull();
		expect(cloneLengthProblem("gemini", "consent", 20.01)).toBe("long");
	});
});
