import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");

// 눌림 영역 44px(T15-b, P0-07). 클래스 문자열이라 소스에서 규칙 존재를 확인한다(reduced-motion.test.ts와 같은 방식).
// 버튼 바탕에는 1px 투명 테두리가 있어 after의 기준 상자(padding box)가 36 × 가로 - 2px다. 위아래 5px + 양옆 1px로 44px를 맞춘다.
test("감정 태그 알약은 눌림 영역이 위아래 44px·양옆 44px 이상이다", () => {
	const src = read("./tag-tools.tsx");
	const pill = src.match(/const TAG_PILL =\s*"([^"]*)"/)?.[1] ?? "";
	expect(pill).toContain("after:-inset-y-1.25");
	expect(pill).toContain("after:-inset-x-px");
	expect(pill).not.toContain("after:inset-x-0");
});

// 검색 칸: 상자(h-11)의 1px 테두리가 입력을 42px로 줄였다. 테두리 대신 안쪽 링으로 그려 입력이 44px 전체를 채운다.
test("검색 칸 상자는 레이아웃을 차지하는 테두리 없이 안쪽 링으로 그려 입력이 44px다", () => {
	const src = read("./voice-conditions.tsx");
	const box = src.match(/<InputGroup className="(h-11[^"]*)"/)?.[1] ?? "";
	expect(box).toContain("border-0");
	expect(box).toContain("ring-1");
	expect(box).toContain("ring-inset");
	expect(box).toContain("ring-input");
	// 포커스 중에도 안쪽 링 테두리는 남는다(바깥 2px 윤곽선만 더해진다)
	expect(box).not.toContain("ring-0");
});
