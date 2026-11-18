import { describe, expect, it } from "vitest";

import { safeNext } from "./safe-next";

describe("로그인 뒤 이동 주소(스펙 5.1, 수용 기준 7)", () => {
	it("앱 안 경로는 검색어와 함께 그대로 통과한다", () => {
		expect(safeNext("/voices")).toBe("/voices");
		expect(safeNext("/voices?x=1&y=2")).toBe("/voices?x=1&y=2");
		expect(safeNext("/")).toBe("/");
	});

	it("앱 밖 주소와 우회 꼴은 /studio로 보낸다", () => {
		for (const raw of [
			"https://evil.example",
			"http://evil.example/studio",
			"//evil.example",
			"/\\evil.example",
			"evil",
			"javascript:alert(1)",
		]) {
			expect(safeNext(raw)).toBe("/studio");
		}
	});

	it("제어 문자(줄바꿈·탭·널)가 든 주소는 /studio로 보낸다", () => {
		for (const raw of ["/a\nb", "/a\tb", "/a\rb", "/a\u0000b", "/\t/evil"]) {
			expect(safeNext(raw)).toBe("/studio");
		}
	});

	it("/login으로 시작하는 주소는 되돌아가는 고리가 되므로 /studio로 보낸다", () => {
		expect(safeNext("/login")).toBe("/studio");
		expect(safeNext("/login?next=/voices")).toBe("/studio");
	});

	it("배열·빈 값·없음은 /studio다", () => {
		expect(safeNext(["/voices", "/scripts"])).toBe("/studio");
		expect(safeNext("")).toBe("/studio");
		expect(safeNext(undefined)).toBe("/studio");
	});
});
