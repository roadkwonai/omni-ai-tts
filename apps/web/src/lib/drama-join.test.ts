// apps/web/src/lib/drama-join.test.ts
import { DRAMA_SAMPLE_RATE } from "@tts-pilot-app/api/drama-script";
import { describe, expect, it } from "vitest";

import {
	gapOf,
	gapText,
	joinWav,
	monoOf,
	pcm16,
	SILENCE,
	trimSilence,
} from "./drama-join";

describe("gapOf", () => {
	it.each<[unknown, number | null]>([
		[0.25, 0.3],
		[0.05, 0.1],
		[0.04, 0],
		[4.96, 5],
		[7, 5],
		[-1, 0],
		["1.5", 1.5],
		[" 2 ", 2],
		["", null],
		["  ", null],
		["abc", null],
		[Number.NaN, null],
		[Number.POSITIVE_INFINITY, null],
		[null, null],
		[{}, null],
		["1e1", 5],
	])("%j -> %j", (value, expected) => {
		expect(gapOf(value)).toBe(expected);
	});

	it("gapText는 소수 한 자리다", () => {
		expect(gapText(2)).toBe("2.0");
		expect(gapText(0.3)).toBe("0.3");
	});
});

describe("monoOf", () => {
	it("한 채널은 같은 객체다", () => {
		const one = new Float32Array([0.1, 0.2]);
		expect(monoOf([one])).toBe(one);
	});
	it("여러 채널은 샘플마다 평균이다", () => {
		const mono = monoOf([new Float32Array([1, 0]), new Float32Array([0, 1])]);
		expect([...mono]).toEqual([0.5, 0.5]);
	});
	it("채널이 없으면 길이 0이다", () => {
		expect(monoOf([]).length).toBe(0);
	});
});

describe("trimSilence", () => {
	// rate 1000이면 남김은 20샘플이다
	const loud = (length: number, at: number, count: number) => {
		const s = new Float32Array(length);
		s.fill(0.5, at, at + count);
		return s;
	};
	it("앞뒤 무음을 자르고 20샘플씩 남긴다", () => {
		expect(trimSilence(loud(250, 100, 50), 1000).length).toBe(90);
	});
	it("첫 큰 샘플이 0번이면 앞 남김 없이 0부터다", () => {
		expect(trimSilence(loud(100, 0, 10), 1000).length).toBe(10 + 20);
	});
	it("마지막 큰 샘플이 끝이면 끝까지다", () => {
		expect(trimSilence(loud(100, 90, 10), 1000).length).toBe(20 + 10);
	});
	it("문턱 이하뿐이면 길이 0이다", () => {
		const s = new Float32Array(50).fill(Math.fround(SILENCE));
		expect(trimSilence(s, 1000).length).toBe(0);
	});
	it("문턱을 조금 넘는 한 샘플이면 1 + 앞뒤 남김이다", () => {
		const s = new Float32Array(200);
		s[100] = SILENCE * 1.001;
		expect(trimSilence(s, 1000).length).toBe(1 + 40);
	});
});

describe("pcm16", () => {
	const read = (samples: number[]) => {
		const bytes = pcm16(new Float32Array(samples));
		const v = new DataView(bytes.buffer);
		return {
			length: bytes.length,
			values: samples.map((_, i) => v.getInt16(i * 2, true)),
		};
	};
	it("16비트 리틀 엔디언으로 바꾼다", () => {
		const { length, values } = read([1.5, -2, 0.5, 0]);
		expect(values).toEqual([32767, -32767, 16384, 0]);
		expect(length).toBe(8);
	});
});

describe("joinWav", () => {
	const part = (samples: number) => new Uint8Array(samples * 2).fill(1);
	it("part 사이에 쉼 무음을 넣고 머리를 맞춘다", () => {
		const out = joinWav([part(10), part(20)], [0.1]);
		const silence = Math.round((0.1 - 0.04) * DRAMA_SAMPLE_RATE);
		expect(out).toHaveLength(4);
		expect(out[2].length).toBe(silence * 2);
		expect(out[2].every((b) => b === 0)).toBe(true);
		const bytes = (10 + 20 + silence) * 2;
		const v = new DataView(out[0].buffer);
		expect(v.getUint32(4, true)).toBe(36 + bytes);
		expect(v.getUint32(24, true)).toBe(44100);
		expect(v.getUint32(40, true)).toBe(bytes);
	});
	it("조각 순서가 part0, 무음, part1이다", () => {
		const a = new Uint8Array(20).fill(1);
		const b = new Uint8Array(40).fill(2);
		const out = joinWav([a, b], [0.1]);
		expect(out[1]).toBe(a);
		expect(out[3]).toBe(b);
	});
	it("40ms 미만과 0은 무음 조각이 없다", () => {
		expect(joinWav([part(1), part(1)], [0.03])).toHaveLength(3);
		expect(joinWav([part(1), part(1)], [0])).toHaveLength(3);
	});
	it("마지막 part 뒤에는 쉼이 없다", () => {
		expect(joinWav([part(1)], [2])).toHaveLength(2);
	});
	it("gaps가 모자라면 쉼 0이다", () => {
		expect(joinWav([part(1), part(1)], [])).toHaveLength(3);
	});
});
