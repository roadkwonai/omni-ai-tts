import { describe, expect, it } from "vitest";

import { particle, SCRIPT_TEXT } from "./script-text";

describe("particle", () => {
	it("받침 없는 끝 글자는 로·를", () => {
		expect(particle("소개", "으로")).toBe("로");
		expect(particle("아이", "을")).toBe("를");
	});
	it("ㄹ 받침은 로, 을", () => {
		expect(particle("하늘", "으로")).toBe("로");
		expect(particle("하늘", "을")).toBe("을");
	});
	it("그 밖의 받침은 으로·을", () => {
		expect(particle("첫 대본", "으로")).toBe("으로");
		expect(particle("오프닝", "으로")).toBe("으로");
		expect(particle("인사말 모음집", "을")).toBe("을");
	});
	it("한글이 아닌 끝 글자는 둘 다 보이는 꼴", () => {
		expect(particle("Intro", "으로")).toBe("(으)로");
		expect(particle("Part 2", "을")).toBe("을(를)");
	});
	it("알림 문구가 제목 끝 글자를 따른다", () => {
		expect(SCRIPT_TEXT.replaced("오프닝")).toBe("‘오프닝’으로 바꿨어요");
		expect(SCRIPT_TEXT.replaced("소개")).toBe("‘소개’로 바꿨어요");
		expect(SCRIPT_TEXT.conflictDescription("소개")).toContain(
			"‘소개’를 저장했어요",
		);
		expect(SCRIPT_TEXT.goneDescription("오프닝")).toContain(
			"‘오프닝’을 보관함",
		);
	});
});

describe("SCRIPT_TEXT.inserted", () => {
	it("넣지 못한 문단과 비운 화자를 같은 알림에 붙인다", () => {
		expect(SCRIPT_TEXT.inserted(3)).toBe("문단 3개를 넣었어요");
		expect(SCRIPT_TEXT.inserted(3, 2, 1)).toBe(
			"문단 3개를 넣었어요. 나머지 2개는 넣지 않았어요. 화자가 20명을 넘어 1개 문단의 화자를 비웠어요.",
		);
	});
});
