// 행 목록 안 이동. 칸은 행 안 버튼 순서다: 0 재생, 1 고르기, 그 뒤는 화면마다 다르다
// (캐스팅 2 내 문장 듣기·3 별, 보관함 2 별). 오른쪽 끝은 RowList가 lastCol로 넘긴다
export type Col = 0 | 1 | 2 | 3;
export type Cell = { row: number; col: Col };

// ↑↓는 같은 칸의 이전·다음 행, Home·End는 같은 칸의 첫·끝 행, ←→는 같은 행의 칸. 끝에서는 그 자리에 머문다.
// 이동만 하고 고르지 않는다(사용자 결정 2026-10-05). 그 밖의 키와 빈 목록은 null(기본 동작에 맡긴다)
export function nextCell(
	key: string,
	from: Cell,
	rows: number,
	lastCol: Col,
): Cell | null {
	if (rows === 0) return null;
	switch (key) {
		case "ArrowUp":
			return { row: Math.max(from.row - 1, 0), col: from.col };
		case "ArrowDown":
			return { row: Math.min(from.row + 1, rows - 1), col: from.col };
		case "Home":
			return { row: 0, col: from.col };
		case "End":
			return { row: rows - 1, col: from.col };
		case "ArrowLeft":
			return { row: from.row, col: Math.max(from.col - 1, 0) as Col };
		case "ArrowRight":
			return { row: from.row, col: Math.min(from.col + 1, lastCol) as Col };
		default:
			return null;
	}
}

// 목록의 Tab 정지(지금 행): 포커스가 마지막으로 들어온 행이 목록에 있으면 그 칸,
// 없으면 고른 성우의 행, 그것도 없으면 첫 행이다. 처음 칸은 고르기다(재생 버튼은 샘플이 없으면 비활성이라 포커스를 받지 못한다)
export function tabStop(
	keys: readonly string[],
	focused: { key: string; col: Col } | null,
	selectedKey: string | null,
): { key: string; col: Col } | null {
	if (focused && keys.includes(focused.key)) return focused;
	const key =
		selectedKey !== null && keys.includes(selectedKey) ? selectedKey : keys[0];
	return key === undefined ? null : { key, col: 1 };
}

// 방향키 한 번(리뷰 판정 2026-10-05). 의도한 칸은 ←→와 사용자가 직접 준 포커스(클릭·Tab)로만 바뀐다.
// ↑↓·Home·End는 의도한 칸을 지키고, 재생 칸으로 샘플 없는 행(재생 비활성)에 닿으면 그 행의 고르기에 포커스하되 의도는 재생으로 남는다.
// actual: 지금 포커스한 칸, remembered: 기억한 의도 칸(그 행의 것이 아니면 지금 칸에서 시작한다), playable: 그 행의 재생 버튼을 누를 수 있는지.
// 반환: 기억할 의도 칸과 실제로 포커스할 칸. 목록 밖 키는 null
export function navigate(
	key: string,
	actual: Cell,
	keys: readonly string[],
	remembered: { key: string; col: Col } | null,
	playable: (row: number) => boolean,
	lastCol: Col,
): { remember: { key: string; col: Col }; focus: Cell } | null {
	const col =
		remembered !== null && remembered.key === keys[actual.row]
			? remembered.col
			: actual.col;
	const to = nextCell(key, { row: actual.row, col }, keys.length, lastCol);
	const toKey = to ? keys[to.row] : undefined;
	if (!to || toKey === undefined) return null;
	return {
		remember: { key: toKey, col: to.col },
		focus: { row: to.row, col: to.col === 0 && !playable(to.row) ? 1 : to.col },
	};
}
