import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import {
	byName,
	deleteDetail,
	doneMessage,
	duplicateMessage,
	emptyMessage,
	fieldMessage,
	neighborId,
	readableUrl,
	saveFailure,
	shortUrl,
} from "./classes-view";

describe("byName", () => {
	it("가나다순이고 숫자는 자연 순서다(2화 < 10화)", () => {
		const names = ["10화", "2화", "나", "가", "Bob", "alice"].map((name) => ({
			name,
		}));
		expect(byName(names).map((item) => item.name)).toEqual([
			"2화",
			"10화",
			"가",
			"나",
			"alice",
			"Bob",
		]);
	});
	it("원래 배열을 바꾸지 않는다", () => {
		const items = [{ name: "나" }, { name: "가" }];
		byName(items);
		expect(items[0].name).toBe("나");
	});
});

describe("문구", () => {
	it("그룹마다 받침에 맞는 조사를 쓴다", () => {
		expect(duplicateMessage("channel")).toBe("같은 이름의 채널이 이미 있어요.");
		expect(duplicateMessage("category")).toBe(
			"같은 이름의 카테고리가 이미 있어요.",
		);
		expect(duplicateMessage("type")).toBe("같은 이름의 타입이 이미 있어요.");
		expect(doneMessage("category", "뉴스", "update")).toBe(
			"‘뉴스’ 카테고리를 고쳤어요.",
		);
	});
	it("한 줄 상태는 마침표가 없다(브리프 6절)", () => {
		expect(emptyMessage("channel")).toBe("아직 채널이 없어요");
	});
	it("채널 삭제 설명은 '채널 주소'라고 쓴다(브리프 B5)", () => {
		expect(deleteDetail("channel")).toBe(
			"메모와 채널 주소도 함께 지워지고 되돌릴 수 없어요.",
		);
		expect(deleteDetail("type")).toBe("메모도 함께 지워지고 되돌릴 수 없어요.");
	});
	it("칸 문제마다 이유를 알려 준다(스펙 9절)", () => {
		expect(fieldMessage("name", "empty")).toBe("이름을 입력해 주세요.");
		expect(fieldMessage("name", "too_long")).toBe("40자까지 쓸 수 있어요.");
		expect(fieldMessage("memo", "too_long")).toBe("200자까지 쓸 수 있어요.");
		expect(fieldMessage("url", "too_long")).toBe("500자까지 쓸 수 있어요.");
		expect(fieldMessage("url", "bad_url")).toBe(
			"http:// 또는 https://로 시작하는 주소를 넣어 주세요.",
		);
	});
});

describe("saveFailure", () => {
	it("같은 이름, 없어진 항목, 나머지로 나눈다(Review Focus 5)", () => {
		expect(
			saveFailure(
				new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } }),
			),
		).toBe("duplicate");
		expect(saveFailure(new ORPCError("NOT_FOUND"))).toBe("not_found");
		expect(saveFailure(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe("failed");
		expect(saveFailure(new TypeError("Failed to fetch"))).toBe("failed");
	});
});

describe("neighborId", () => {
	it("지운 행의 다음 행, 없으면 이전 행, 그마저 없으면 null(사용자 결정 2026-10-06)", () => {
		expect(neighborId(["a", "b", "c"], "b")).toBe("c");
		expect(neighborId(["a", "b", "c"], "c")).toBe("b");
		expect(neighborId(["a"], "a")).toBeNull();
		expect(neighborId(["a", "b"], "x")).toBeNull();
	});
});

describe("shortUrl", () => {
	it("스킴·www·끝 '/'를 빼고 한글 경로는 풀어 보인다", () => {
		expect(shortUrl("https://www.youtube.com/@econ")).toBe("youtube.com/@econ");
		expect(shortUrl("https://example.com/")).toBe("example.com");
		expect(shortUrl("http://a.example/x?y=1")).toBe("a.example/x?y=1");
		expect(shortUrl("https://youtube.com/@경제한입")).toBe(
			"youtube.com/@경제한입",
		);
		expect(shortUrl("https://youtube.com/@%EA%B2%BD%EC%A0%9C")).toBe(
			"youtube.com/@경제",
		);
	});
	it("풀 수 없는 퍼센트 글자는 그대로 둔다", () => {
		expect(shortUrl("https://a.example/%E0%A4%A")).toBe("a.example/%E0%A4%A");
	});
	it("퍼센트로 숨긴 양방향 제어문자는 풀면서 지운다", () => {
		expect(shortUrl("https://a.example/%E2%80%AEab")).toBe("a.example/ab");
	});
});

describe("readableUrl", () => {
	it("전체 주소의 퍼센트 글자를 풀고, 풀 수 없으면 원문 그대로 둔다", () => {
		expect(readableUrl("https://www.youtube.com/@%EA%B2%BD%EC%A0%9C")).toBe(
			"https://www.youtube.com/@경제",
		);
		expect(readableUrl("https://a.example/%E0%A4%A")).toBe(
			"https://a.example/%E0%A4%A",
		);
		expect(readableUrl("https://a.example/%0Ax")).toBe(
			"https://a.example/%0Ax",
		);
		expect(readableUrl("https://a.example/a%2520b")).toBe(
			"https://a.example/a%2520b",
		);
		expect(readableUrl("https://a.example/a%20")).toBe(
			"https://a.example/a%20",
		);
		expect(readableUrl("https://a.example/x%5Cy")).toBe(
			"https://a.example/x%5Cy",
		);
	});
});
