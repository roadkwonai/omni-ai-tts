import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	type AlignedSegment,
	cleanDirection,
	cutWav,
	DRAMA_LAUNCH_UNTIL,
	dramaUsage,
	mergeChunks,
	pcmSeconds,
	type SceneChunk,
	sceneChars,
	sceneLimit,
	sceneText,
	splitLines,
	splitRisk,
	WAV_HEADER_BYTES,
	wavHeader,
	wavOf,
} from "./drama-script";

const data = (path: string) =>
	readFileSync(
		fileURLToPath(
			new URL(`../../../docs/research/data/${path}`, import.meta.url),
		),
		"utf8",
	);
const json = <T>(path: string) => JSON.parse(data(path)) as T;

const A = { name: "지연", voiceId: "voice_a" };
const B = { name: "민수", voiceId: "voice_b" };
const C = { name: "하나", voiceId: "voice_c" };
const seg = (text: string, start: number, end: number): AlignedSegment => ({
	text,
	start,
	end,
});

describe("sceneText", () => {
	it("쓰인 화자만 처음 나온 순서로 번호를 매긴다", () => {
		expect(
			sceneText({
				speakers: [A, B, C],
				lines: [
					{ speaker: 2, direction: "", text: "안녕" },
					{ speaker: 0, direction: " [작게] 웃으며 ", text: "응\n그래" },
					{ speaker: 2, direction: "", text: "가자" },
				],
			}),
		).toEqual({
			text: "<|speaker:0|>안녕\n<|speaker:1|>[작게 웃으며] 응 그래\n<|speaker:0|>가자",
			referenceIds: ["voice_c", "voice_a"],
		});
	});
	it("쓰인 화자가 하나면 표식 없이 보낸다", () => {
		expect(
			sceneText({
				speakers: [A, B],
				lines: [
					{ speaker: 1, direction: "", text: "안녕" },
					{ speaker: 1, direction: "", text: "응" },
				],
			}),
		).toEqual({ text: "안녕\n응", referenceIds: ["voice_b"] });
	});
});

it("cleanDirection", () => {
	expect(cleanDirection(" [작게]\n한숨 ")).toBe("작게 한숨");
	expect(cleanDirection("")).toBe("");
	expect(cleanDirection("한".normalize("NFD"))).toBe("한".normalize("NFC"));
});

it("sceneChars는 정리한 지시와 대사의 코드 포인트 합이다", () => {
	expect(sceneChars([{ direction: " [작게] ", text: "안녕😀" }])).toBe(5);
	expect(sceneChars([{ direction: "", text: "한".normalize("NFD") }])).toBe(1);
});

it("sceneLimit", () => {
	expect(sceneLimit(1)).toBe(2000);
	expect(sceneLimit(2)).toBe(2000);
	expect(sceneLimit(0.5)).toBe(1000);
	expect(sceneLimit(0.55)).toBe(1100);
});

it("splitRisk", () => {
	expect(splitRisk([{ text: "[sighs]" }])).toBe("no_text");
	expect(splitRisk([{ text: "Go slow" }])).toBe("tag_word");
	expect(splitRisk([{ text: "Slow" }])).toBe("tag_word");
	expect(splitRisk([{ text: "breakfast 먹자" }])).toBe("tag_word");
	expect(splitRisk([{ text: "<whisper>응</whisper>" }])).toBeNull();
	expect(splitRisk([{ text: "안녕, 잘 지냈어?" }])).toBeNull();
});

it("dramaUsage", () => {
	expect(dramaUsage("s2.1-pro-free", 322)).toEqual({ unit: "free", amount: 0 });
	expect(dramaUsage("s2.1-pro", 322)).toEqual({
		unit: "usd_micro",
		amount: 4830,
	});
	expect(dramaUsage("drama-3", 322, DRAMA_LAUNCH_UNTIL - 1)).toEqual({
		unit: "usd_micro",
		amount: 3220,
	});
	expect(dramaUsage("drama-3", 322, DRAMA_LAUNCH_UNTIL)).toEqual({
		unit: "usd_micro",
		amount: 16100,
	});
});

describe("mergeChunks", () => {
	const x = seg("x", 0, 0.1);
	const y = seg("y", 0.1, 0.3);
	const z = seg("z", 0.1, 0.2);
	it("청크마다 마지막 스냅샷만 남기고 오프셋을 더한다", () => {
		const chunks: SceneChunk[] = [
			{ seq: 0, offset: 0, duration: 9.5, segments: [x] },
			{ seq: 1, offset: 9.5, duration: 1, segments: [y] },
			{ seq: 0, offset: 0, duration: 9.5, segments: [x, z] },
		];
		const merged = mergeChunks(chunks, 10.5);
		expect(merged).toHaveLength(3);
		expect(merged?.slice(0, 2)).toEqual([x, z]);
		expect(merged?.[2]?.text).toBe("y");
		expect(merged?.[2]?.start).toBeCloseTo(9.6, 6);
		expect(merged?.[2]?.end).toBeCloseTo(9.8, 6);
	});
	it("뒤 청크가 먼저 와도 청크 번호 순으로 잇는다", () => {
		expect(
			mergeChunks(
				[
					{ seq: 1, offset: 9.5, duration: 1, segments: [y] },
					{ seq: 0, offset: 0, duration: 9.5, segments: [x] },
				],
				10.5,
			)?.map((s) => s.text),
		).toEqual(["x", "y"]);
	});
	it("세그먼트 0개나 빈 배열이면 null", () => {
		expect(
			mergeChunks([{ seq: 0, offset: 0, duration: 1, segments: [] }], 1),
		).toBeNull();
		expect(mergeChunks([], 0)).toBeNull();
	});
	it("duration이 NaN이면 null", () => {
		expect(
			mergeChunks(
				[{ seq: 0, offset: 0, duration: Number.NaN, segments: [x] }],
				1,
			),
		).toBeNull();
	});
	it("끝이 PCM 길이와 0.1초 넘게 다르면 null(잘린 스트림)", () => {
		const chunks = [{ seq: 0, offset: 0, duration: 9.5, segments: [x] }];
		expect(mergeChunks(chunks, 9.5)).not.toBeNull();
		expect(mergeChunks(chunks, 9.7)).toBeNull();
	});
});

describe("splitLines 자료", () => {
	// 요청 글에서 화자 표식과 앞 [지시]를 뺀 대사
	const linesOf = (path: string) =>
		data(path)
			.trim()
			.split("\n")
			.map((l) =>
				l.replace(/^<\|speaker:\d+\|>/, "").replace(/^\[[^\]]*\]\s*/, ""),
			);

	it("PCM 자료: 4줄 구간", () => {
		const spans = splitLines(
			linesOf("fish-drama-pcm-2026-10-22/request-text.txt"),
			json<AlignedSegment[]>("fish-drama-pcm-2026-10-22/words.json"),
			13.500226757369614,
		);
		const want = [
			[0, 2.96, 0, 3.28],
			[3.6, 7.28, 3.28, 7.36],
			[7.44, 9.76, 7.36, 9.922630385487528],
			[
				10.085260770975056, 13.365260770975055, 9.922630385487528,
				13.500226757369614,
			],
		];
		expect(spans).toHaveLength(4);
		want.forEach(([start, end, cutStart, cutEnd], i) => {
			expect(spans?.[i]?.start).toBeCloseTo(start as number, 6);
			expect(spans?.[i]?.end).toBeCloseTo(end as number, 6);
			expect(spans?.[i]?.cutStart).toBeCloseTo(cutStart as number, 6);
			expect(spans?.[i]?.cutEnd).toBeCloseTo(cutEnd as number, 6);
		});
	});

	it("spike 자료: 6줄이 모두 맞고 6번 줄은 17.42~18.06초", () => {
		const spans = splitLines(
			linesOf("fish-drama-spike-2026-10-21/request-text.txt"),
			json<AlignedSegment[]>("fish-drama-spike-2026-10-21/words.json"),
			18.259,
		);
		expect(spans).not.toBeNull();
		expect(spans).toHaveLength(6);
		expect(spans?.[5]?.start).toBeCloseTo(17.419, 2);
		expect(spans?.[5]?.end).toBeCloseTo(18.059, 2);
		expect(spans?.[0]?.cutStart).toBe(0);
		expect(spans?.[5]?.cutEnd).toBe(18.259);
	});
});

it("줄 가운데 청크 경계", () => {
	const merged = mergeChunks(
		[
			{ seq: 0, offset: 0, duration: 2, segments: [seg("안녕", 0.5, 1.5)] },
			{ seq: 1, offset: 2, duration: 1, segments: [seg("하세요", 0, 0.5)] },
		],
		3,
	);
	const spans = splitLines(["안녕하세요"], merged ?? [], 3);
	expect(spans).toHaveLength(1);
	expect(spans?.[0]?.start).toBeCloseTo(0.5, 6);
	expect(spans?.[0]?.end).toBeCloseTo(2.5, 6);
});

describe("splitLines가 null인 경우", () => {
	it.each([
		["글자 수 불일치", ["안녕하세요"], [seg("안녕", 0, 1)]],
		["남는 세그먼트", ["안녕"], [seg("안녕", 0, 1), seg("하세요", 1, 2)]],
		["한 세그먼트가 두 줄에 걸침", ["안녕", "하"], [seg("안녕하", 0, 1)]],
		["세그먼트 0개", ["안녕"], []],
		["지시뿐인 줄", ["[sighs]"], [seg("한숨", 0, 1)]],
		[
			"태그 이름 단어 대사(쌍 태그)",
			["<soft>soft</soft> 응"],
			[seg("응", 0, 1)],
		],
		[
			"태그 이름 단어 대사(평문)",
			["Go slow"],
			[seg("고", 0, 1), seg("슬로", 1, 2)],
		],
		[
			"지시를 읽은 세그먼트",
			["너 왔어?", "응"],
			[
				seg("놀라며", 0, 1),
				seg("너", 1, 2),
				seg("왔어", 2, 3),
				seg("응", 3, 4),
			],
		],
		[
			"숫자를 읽은 세그먼트",
			["100원이야", "응 그래"],
			[
				seg("백", 0, 1),
				seg("원이야", 1, 2),
				seg("응", 2, 3),
				seg("그래", 3, 4),
			],
		],
		["시각 역행", ["안녕", "잘가"], [seg("안녕", 1, 2), seg("잘가", 0.5, 1.5)]],
	])("%s", (_name, lines, segments) => {
		expect(splitLines(lines, segments, 10)).toBeNull();
	});
	it("줄 안 시각 역행", () => {
		expect(
			splitLines(
				["가", "안녕하세요", "응"],
				[
					seg("가", 0, 0.4),
					seg("안녕", 0.5, 1.5),
					seg("하세요", 0.2, 0.7),
					seg("응", 2.5, 3),
				],
				10,
			),
		).toBeNull();
	});
	it("글자 수만 맞고 글자가 다르면 null", () => {
		// 줄 글자 4(너왔어응), 세그먼트 글자 4(놀라며너)
		expect(
			splitLines(
				["너 왔어?", "응"],
				[seg("놀라며", 0, 1), seg("너", 1, 2)],
				10,
			),
		).toBeNull();
	});
	it("NFD 대사·세그먼트도 나눈다", () => {
		const spans = splitLines(
			["안녕".normalize("NFD")],
			[seg("안녕".normalize("NFC"), 0, 1)],
			1,
		);
		expect(spans).toHaveLength(1);
	});
	it("끝 줄 end > duration + 0.05", () => {
		expect(splitLines(["안녕"], [seg("안녕", 0, 3.1)], 3)).toBeNull();
		expect(splitLines(["안녕"], [seg("안녕", 0, 3.04)], 3)).not.toBeNull();
	});
});

it("wavOf 머리", () => {
	const wav = wavOf(new Uint8Array(6));
	const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
	expect(wav.length).toBe(50);
	expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
	expect(v.getUint32(4, true)).toBe(42);
	expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
	expect(v.getUint16(22, true)).toBe(1);
	expect(v.getUint32(24, true)).toBe(44100);
	expect(v.getUint16(34, true)).toBe(16);
	expect(v.getUint32(40, true)).toBe(6);
	expect(wavOf(new Uint8Array(7)).length - WAV_HEADER_BYTES).toBe(6);
	expect(wavHeader(6).length).toBe(WAV_HEADER_BYTES);
	expect(pcmSeconds(88_201)).toBe(1);
});

describe("cutWav", () => {
	const pcm = Uint8Array.from({ length: 88_200 }, (_, i) => i & 0xff);
	const wav = wavOf(pcm);
	const dataLen = (head: Uint8Array) =>
		new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(
			40,
			true,
		);

	it("샘플 경계에서 자르고 머리를 새로 쓴다", () => {
		const [head, body] = cutWav(wav, { cutStart: 0.5, cutEnd: 0.75 });
		expect(head.length).toBe(44);
		expect(body.length).toBe(22_050);
		expect(body[0]).toBe(44_100 & 0xff);
		expect(body.buffer).toBe(wav.buffer);
		expect(dataLen(head)).toBe(22_050);
	});
	it("짝수 바이트에서 시작한다", () => {
		const [, body] = cutWav(wav, { cutStart: 0.00003, cutEnd: 0.5 });
		expect((body.byteOffset - wav.byteOffset - WAV_HEADER_BYTES) % 2).toBe(0);
		expect(body.byteOffset - wav.byteOffset - WAV_HEADER_BYTES).toBe(2);
	});
	it("ArrayBuffer 위 WAV에서 자른 두 조각은 ArrayBuffer 뷰다(화면이 Blob 조각으로 쓴다, 타입 검사가 본다)", () => {
		const parts: [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>] = cutWav(
			wav,
			{ cutStart: 0, cutEnd: 0.25 },
		);
		expect(parts[1].buffer).toBe(wav.buffer);
	});
	it("cutEnd가 장면 끝을 넘으면 끝까지", () => {
		const [head, body] = cutWav(wav, { cutStart: 0.5, cutEnd: 99 });
		expect(body.length).toBe(88_200 - 44_100);
		expect(dataLen(head)).toBe(body.length);
	});
});
