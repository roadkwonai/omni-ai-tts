import { describe, expect, it } from "vitest";

import {
	paragraphFileName,
	srtOf,
	srtTime,
	stripTags,
	workFileName,
} from "./paragraph-files";

describe("paragraph-files", () => {
	it("srtTime 3725.5 → 01:02:05,500", () => {
		expect(srtTime(3725.5)).toBe("01:02:05,500");
		expect(srtTime(0)).toBe("00:00:00,000");
		// 부동소수 끝자리는 밀리초로 반올림한다
		expect(srtTime(0.1 + 0.2)).toBe("00:00:00,300");
	});
	it("srtOf 번호·빈 줄·끝 줄바꿈", () => {
		expect(
			srtOf([
				{ start: 0, end: 1.5, text: "안녕" },
				{ start: 2, end: 3.25, text: "잘 가" },
			]),
		).toBe(
			"1\n00:00:00,000 --> 00:00:01,500\n안녕\n\n2\n00:00:02,000 --> 00:00:03,250\n잘 가\n",
		);
	});
	it("srtOf는 빈 글 자막을 빼고 번호를 이어 매긴다", () => {
		expect(
			srtOf([
				{ start: 0, end: 1, text: "하나" },
				{ start: 1.5, end: 2, text: "" },
				{ start: 2.5, end: 3, text: "셋" },
			]),
		).toBe(
			"1\n00:00:00,000 --> 00:00:01,000\n하나\n\n2\n00:00:02,500 --> 00:00:03,000\n셋\n",
		);
	});
	it("stripTags는 [whispers]·<sigh>를 지우고 공백을 하나로", () => {
		expect(stripTags("[whispers] 안녕  <sigh>  하세요\n\n반가워요 ")).toBe(
			"안녕 하세요 반가워요",
		);
	});
	it("stripTags는 태그 모양(SEND_TAGS)만 지운다: 한글 괄호 글은 자막에 남는다(스펙 15.2)", () => {
		expect(stripTags("영화 <삼국지> [sighs] 봤어 <sigh>")).toBe(
			"영화 <삼국지> 봤어",
		);
		expect(stripTags("[속보] 3 < 5, 7 > 2 </whisper>")).toBe(
			"[속보] 3 < 5, 7 > 2",
		);
	});
	it("파일 이름의 못 쓰는 글자·공백은 _, 성우 이름 40자 상한, 한국 시간", () => {
		// 2026-10-23 15:30 UTC = 2026-10-24 00:30 KST
		const at = new Date("2026-10-23T15:30:00.000Z");
		expect(
			workFileName(" 오늘: 서울/부산 날씨는 맑고 따뜻합니다", at, "wav"),
		).toBe("오늘__서울_부산_날씨는_맑고_따뜻합_20261024-0030.wav");
		expect(workFileName("짧은 글", at, "srt")).toBe(
			"짧은_글_20261024-0030.srt",
		);
		const longName = "가".repeat(45);
		expect(paragraphFileName(7, longName, "첫 문단\n둘째 줄?", "mp3")).toBe(
			`007_${"가".repeat(40)}_첫_문단_둘째_줄_.mp3`,
		);
		expect(paragraphFileName(123, "Rachel", "Hello", "wav")).toBe(
			"123_Rachel_Hello.wav",
		);
	});
});
