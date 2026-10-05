import { describe, expect, it } from "vitest";

import { navigate, nextCell, tabStop } from "./roving";

describe("행 목록 안 이동(브리프 9절, 격자 패턴)", () => {
	it("↑↓는 같은 칸의 이전·다음 행, 끝에서는 그 자리에 머문다", () => {
		expect(nextCell("ArrowDown", { row: 1, col: 0 }, 5)).toEqual({
			row: 2,
			col: 0,
		});
		expect(nextCell("ArrowUp", { row: 1, col: 1 }, 5)).toEqual({
			row: 0,
			col: 1,
		});
		expect(nextCell("ArrowUp", { row: 0, col: 1 }, 5)).toEqual({
			row: 0,
			col: 1,
		});
		expect(nextCell("ArrowDown", { row: 4, col: 0 }, 5)).toEqual({
			row: 4,
			col: 0,
		});
	});

	it("Home·End는 같은 칸의 첫·끝 행이다", () => {
		expect(nextCell("Home", { row: 3, col: 0 }, 5)).toEqual({
			row: 0,
			col: 0,
		});
		expect(nextCell("End", { row: 1, col: 1 }, 5)).toEqual({
			row: 4,
			col: 1,
		});
	});

	it("←→는 같은 행의 재생(0)·고르기(1)다", () => {
		expect(nextCell("ArrowLeft", { row: 2, col: 1 }, 5)).toEqual({
			row: 2,
			col: 0,
		});
		expect(nextCell("ArrowRight", { row: 2, col: 0 }, 5)).toEqual({
			row: 2,
			col: 1,
		});
		expect(nextCell("ArrowLeft", { row: 2, col: 0 }, 5)).toEqual({
			row: 2,
			col: 0,
		});
	});

	it("목록 밖 키(Enter·Space·Tab 등)와 빈 목록은 null이다", () => {
		expect(nextCell("Enter", { row: 0, col: 1 }, 5)).toBeNull();
		expect(nextCell(" ", { row: 0, col: 1 }, 5)).toBeNull();
		expect(nextCell("Tab", { row: 0, col: 1 }, 5)).toBeNull();
		expect(nextCell("ArrowDown", { row: 0, col: 1 }, 0)).toBeNull();
	});
});

describe("목록의 Tab 정지(지금 행)", () => {
	const keys = ["a", "b", "c"];

	it("처음에는 고른 성우의 행, 목록에 없으면 첫 행의 고르기 칸이다", () => {
		expect(tabStop(keys, null, "b")).toEqual({ key: "b", col: 1 });
		expect(tabStop(keys, null, "z")).toEqual({ key: "a", col: 1 });
		expect(tabStop(keys, null, null)).toEqual({ key: "a", col: 1 });
	});

	it("포커스가 들어온 행·칸을 기억하고, 그 행이 목록에서 빠지면 처음 규칙으로 돌아간다", () => {
		expect(tabStop(keys, { key: "c", col: 0 }, "b")).toEqual({
			key: "c",
			col: 0,
		});
		expect(tabStop(keys, { key: "z", col: 0 }, "b")).toEqual({
			key: "b",
			col: 1,
		});
	});

	it("빈 목록은 null이다", () => {
		expect(tabStop([], { key: "a", col: 0 }, "a")).toBeNull();
	});
});

describe("방향키 한 번: 의도한 칸 기억(리뷰 판정 2026-10-05)", () => {
	const keys = ["a", "b", "c", "d"];
	// b(1행)는 샘플이 없어 재생 버튼이 비활성이다
	const playable = (row: number) => row !== 1;

	it("재생 칸에서 ↓로 샘플 없는 행에 닿으면 고르기에 포커스하되 의도한 칸은 재생으로 남는다", () => {
		expect(
			navigate(
				"ArrowDown",
				{ row: 0, col: 0 },
				keys,
				{ key: "a", col: 0 },
				playable,
			),
		).toEqual({ remember: { key: "b", col: 0 }, focus: { row: 1, col: 1 } });
	});

	it("그 행에서 다시 ↓하면(실제 포커스는 고르기) 기억한 재생 칸으로 다음 행의 재생 버튼에 간다. 행을 건너뛰지 않는다", () => {
		expect(
			navigate(
				"ArrowDown",
				{ row: 1, col: 1 },
				keys,
				{ key: "b", col: 0 },
				playable,
			),
		).toEqual({ remember: { key: "c", col: 0 }, focus: { row: 2, col: 0 } });
		expect(
			navigate(
				"ArrowUp",
				{ row: 2, col: 0 },
				keys,
				{ key: "c", col: 0 },
				playable,
			),
		).toEqual({ remember: { key: "b", col: 0 }, focus: { row: 1, col: 1 } });
	});

	it("Home·End도 의도한 칸을 지킨다", () => {
		expect(
			navigate(
				"Home",
				{ row: 3, col: 1 },
				keys,
				{ key: "d", col: 0 },
				() => false,
			),
		).toEqual({ remember: { key: "a", col: 0 }, focus: { row: 0, col: 1 } });
	});

	it("←→만 의도한 칸을 바꾼다(샘플 없는 행에서 ←는 의도만 재생, 포커스는 고르기)", () => {
		expect(
			navigate(
				"ArrowRight",
				{ row: 1, col: 1 },
				keys,
				{ key: "b", col: 0 },
				playable,
			),
		).toEqual({ remember: { key: "b", col: 1 }, focus: { row: 1, col: 1 } });
		expect(
			navigate(
				"ArrowLeft",
				{ row: 1, col: 1 },
				keys,
				{ key: "b", col: 1 },
				playable,
			),
		).toEqual({ remember: { key: "b", col: 0 }, focus: { row: 1, col: 1 } });
	});

	it("기억한 칸이 다른 행의 것이면(클릭·Tab으로 옮겨 온 뒤) 지금 포커스한 칸에서 시작한다", () => {
		expect(
			navigate(
				"ArrowDown",
				{ row: 2, col: 1 },
				keys,
				{ key: "a", col: 0 },
				playable,
			),
		).toEqual({ remember: { key: "d", col: 1 }, focus: { row: 3, col: 1 } });
		expect(
			navigate("ArrowDown", { row: 2, col: 1 }, keys, null, playable),
		).toEqual({ remember: { key: "d", col: 1 }, focus: { row: 3, col: 1 } });
	});

	it("목록 밖 키는 null이다", () => {
		expect(
			navigate("Enter", { row: 0, col: 0 }, keys, null, playable),
		).toBeNull();
	});
});
