import { describe, expect, it } from "vitest";

import { speakerLine } from "./script-speaker";

describe("speakerLine(붙여 넣기 줄 한 줄 해석)", () => {
	it("'이름: 대사'를 이름과 대사로 가른다", () => {
		expect(speakerLine("민수: 안녕")).toEqual({ name: "민수", text: " 안녕" });
	});
	it("전각 콜론도 화자 줄이다", () => {
		expect(speakerLine("지아：응")).toEqual({ name: "지아", text: "응" });
	});
	it("이름은 첫 콜론 앞이다: 대사 속 콜론은 대사", () => {
		expect(speakerLine("민수: 시간은 12:30이야")).toEqual({
			name: "민수",
			text: " 시간은 12:30이야",
		});
	});
	it("이름 앞뒤 공백은 정리하고 대사는 원문 그대로다", () => {
		expect(speakerLine("  민수 :  안녕  ")).toEqual({
			name: "민수",
			text: "  안녕  ",
		});
	});
	it("글자 없는 이름(시각)은 화자가 아니다", () => {
		expect(speakerLine("12:30 회의")).toBeNull();
		expect(speakerLine(": 안녕")).toBeNull();
	});
	it("이름은 20자까지이고 21자는 화자가 아니다", () => {
		expect(speakerLine(`${"가".repeat(20)}: 안녕`)?.name).toBe("가".repeat(20));
		expect(speakerLine(`${"가".repeat(21)}: 안녕`)).toBeNull();
	});
	it("주소(콜론 바로 뒤가 //)는 화자가 아니다", () => {
		expect(speakerLine("https://example.com")).toBeNull();
		expect(speakerLine("http：//example.com")).toBeNull();
	});
	it("글자가 섞여도 시각 표기(숫자로 끝나고 콜론 바로 뒤가 숫자)는 화자가 아니다", () => {
		expect(speakerLine("2026년 6월 10일 오후 3:05에 만나요.")).toBeNull();
		expect(speakerLine("민수:3시에 봐")?.name).toBe("민수");
		expect(speakerLine("방 3: 안녕")?.name).toBe("방 3");
	});
	it("콜론이 없으면 null", () => {
		expect(speakerLine("그냥 줄")).toBeNull();
	});
});
