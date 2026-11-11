// apps/web/src/lib/sound-join.test.ts
import { DRAMA_SAMPLE_RATE } from "@tts-pilot-app/api/drama-script";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	gapOf,
	gapText,
	joinSounds,
	joinTimeline,
	joinWav,
	monoOf,
	pcm16,
	SILENCE,
	seekOf,
	spanIndexAt,
	spansOf,
	trimSilence,
} from "./sound-join";

// 문단 셋: 0~2초, (쉼 0.5초) 2.5~4초, (쉼) 4.5~6초
const SPANS = [
	{ start: 0, end: 2 },
	{ start: 2.5, end: 4 },
	{ start: 4.5, end: 6 },
];
describe("spanIndexAt(재생 위치 → 문단, 이어 듣기 강조)", () => {
	it("구간 안이면 그 문단, 시작·끝 경계는 그 문단이다", () => {
		expect(spanIndexAt(SPANS, 0)).toBe(0);
		expect(spanIndexAt(SPANS, 1.9)).toBe(0);
		expect(spanIndexAt(SPANS, 2.5)).toBe(1);
		expect(spanIndexAt(SPANS, 4)).toBe(1);
		expect(spanIndexAt(SPANS, 5)).toBe(2);
	});
	it("쉼 구간은 앞 문단을 유지한다", () => {
		expect(spanIndexAt(SPANS, 2.2)).toBe(0);
		expect(spanIndexAt(SPANS, 4.2)).toBe(1);
	});
	it("끝을 넘으면 마지막 문단, 음수는 첫 문단, 구간이 없으면 -1", () => {
		expect(spanIndexAt(SPANS, 99)).toBe(2);
		expect(spanIndexAt(SPANS, -1)).toBe(0);
		expect(spanIndexAt([], 1)).toBe(-1);
	});
});

describe("spanIndexAt(브라우저가 시작에서 1샘플 앞에 착지하는 경우)", () => {
	const ONE = 1 / DRAMA_SAMPLE_RATE;
	it("문단 시작보다 1샘플 앞 시각도 그 문단으로 읽는다", () => {
		expect(spanIndexAt(SPANS, 2.5 - ONE)).toBe(1);
		expect(spanIndexAt(SPANS, 4.5 - ONE)).toBe(2);
	});
	it("seekOf 결과가 1샘플 앞에 착지해도 다음·이전을 연속으로 누르면 한 문단씩 옮긴다", () => {
		let index = 0;
		for (const want of [1, 2]) {
			const to = seekOf(SPANS, index, 1);
			index = spanIndexAt(SPANS, (to ?? 0) - ONE);
			expect(index).toBe(want);
		}
		for (const want of [1, 0]) {
			const to = seekOf(SPANS, index, -1);
			index = spanIndexAt(SPANS, Math.max(0, (to ?? 0) - ONE));
			expect(index).toBe(want);
		}
	});
	it("쉼 구간 한가운데는 여전히 앞 문단이다", () => {
		expect(spanIndexAt(SPANS, 2.25)).toBe(0);
	});
});

describe("seekOf(이전·다음 문단의 시작 시각)", () => {
	it("이전은 앞 문단 시작, 다음은 뒤 문단 시작이다", () => {
		expect(seekOf(SPANS, 1, -1)).toBe(0);
		expect(seekOf(SPANS, 2, -1)).toBe(2.5);
		expect(seekOf(SPANS, 0, 1)).toBe(2.5);
		expect(seekOf(SPANS, 1, 1)).toBe(4.5);
	});
	it("첫 문단의 이전은 처음(0), 마지막 문단의 다음은 null(잠긴다)", () => {
		expect(seekOf(SPANS, 0, -1)).toBe(0);
		expect(seekOf(SPANS, 2, 1)).toBeNull();
		expect(seekOf([], 0, 1)).toBeNull();
	});
});

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
	const part = (samples: number) =>
		new Blob([new Uint8Array(samples * 2).fill(1)]);
	it("part 사이에 쉼 무음을 넣고 머리를 맞춘다", () => {
		const out = joinWav([part(10), part(20)], [0.1]);
		const silence = Math.round((0.1 - 0.04) * DRAMA_SAMPLE_RATE);
		expect(out).toHaveLength(4);
		expect(out[2]).toEqual(new Uint8Array(silence * 2));
		const bytes = (10 + 20 + silence) * 2;
		const v = new DataView(out[0].buffer);
		expect(v.getUint32(4, true)).toBe(36 + bytes);
		expect(v.getUint32(24, true)).toBe(44100);
		expect(v.getUint32(40, true)).toBe(bytes);
	});
	it("조각 순서가 part0, 무음, part1이다", () => {
		const a = new Blob([new Uint8Array(20).fill(1)]);
		const b = new Blob([new Uint8Array(40).fill(2)]);
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

describe("spansOf", () => {
	it("spansOf: 쉼을 더하고 마지막 조각 뒤 쉼은 없다", () => {
		const [a, b] = spansOf([44100, 22050], [0.5, 0.5], 44100);
		expect(a.start).toBeCloseTo(0, 3);
		expect(a.end).toBeCloseTo(1, 3);
		expect(b.start).toBeCloseTo(1.46, 3);
		expect(b.end).toBeCloseTo(1.96, 3);
	});
	it("쉼이 EDGE 두 배보다 짧으면 0", () => {
		const [, b] = spansOf([44100, 100], [0.03, 0], 44100);
		expect(b.start).toBeCloseTo(1, 3);
	});
	it("spansOf의 끝 = joinWav 바이트로 센 길이", () => {
		const counts = [1000, 2000, 3000];
		const gaps = [0.1, 0.3, 0];
		const parts = counts.map((n) => new Blob([new Uint8Array(n * 2)]));
		const out = joinWav(parts, gaps);
		const bytes = new Blob(out).size - out[0].length;
		const spans = spansOf(counts, gaps, DRAMA_SAMPLE_RATE);
		expect(spans[2].end).toBeCloseTo(bytes / 2 / DRAMA_SAMPLE_RATE, 6);
	});
});

describe("joinTimeline·joinSounds(문단 한 파일·자막, 드라마 잇기)", () => {
	// node에는 Web Audio가 없어 디코딩만 흉내 낸다: Blob 바이트가 곧 모노 float32 샘플이다
	beforeEach(() => {
		vi.stubGlobal(
			"OfflineAudioContext",
			class {
				async decodeAudioData(buffer: ArrayBuffer) {
					const samples = new Float32Array(buffer);
					return { numberOfChannels: 1, getChannelData: () => samples };
				}
			},
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	const sound = (count: number, gap: number) => ({
		blob: new Blob([new Float32Array(count).fill(0.5)]),
		gap,
	});
	const silence = (gap: number) => Math.round((gap - 0.04) * DRAMA_SAMPLE_RATE);
	it("WAV는 [머리, 조각, 쉼, …]이고 자막 끝 = WAV 길이(마지막 쉼 없음)", async () => {
		const sounds = [sound(1000, 0.1), sound(2000, 0.3), sound(3000, 2)];
		const { blob, spans } = await joinTimeline(sounds);
		const data = (1000 + 2000 + 3000 + silence(0.1) + silence(0.3)) * 2;
		expect(blob.type).toBe("audio/wav");
		expect(blob.size).toBe(44 + data);
		const v = new DataView(await blob.arrayBuffer());
		expect(v.getUint32(4, true)).toBe(36 + data);
		expect(v.getUint32(40, true)).toBe(data);
		// 첫 조각 끝 뒤는 쉼(0), 쉼 뒤 둘째 조각 첫 샘플은 0.5
		expect(v.getInt16(44 + 1000 * 2, true)).toBe(0);
		expect(v.getInt16(44 + (1000 + silence(0.1)) * 2, true)).toBe(16384);
		expect(
			spans.map((span) => Math.round(span.end * DRAMA_SAMPLE_RATE)),
		).toEqual([1000, 3000 + silence(0.1), 6000 + silence(0.1) + silence(0.3)]);
		expect(spans[2].end).toBeCloseTo(data / 2 / DRAMA_SAMPLE_RATE, 6);
	});
	it("드라마 joinSounds는 joinTimeline과 같은 바이트", async () => {
		const sounds = [sound(500, 0.5), sound(700, 0)];
		const timeline = await joinTimeline(sounds);
		const drama = await joinSounds(sounds);
		expect(drama.type).toBe("audio/wav");
		expect(new Uint8Array(await drama.arrayBuffer())).toEqual(
			new Uint8Array(await timeline.blob.arrayBuffer()),
		);
	});
});
