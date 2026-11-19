// 공개 데모 예시 대본(랜딩 브리프 7절): 소개 페이지의 '데모 작업실 열기'(/studio?example=1)가 빈 작업실에 채운다.
// 빈 줄로 나뉜 3문단이고 숫자와 연기 태그가 든 해요체 안내 글이다. 작업실이 붙여넣기에 쓰는 pasteToParts가 문단으로 나눈다
export const EXAMPLE_SCRIPT = `[whispers] 잠시 안내 말씀드려요. 2026년 3분기 반도체 수출액은 1,523억 달러로 집계됐어요.

전년 같은 기간보다 3.5% 늘었고요, 오전 10:30 발표를 기다리던 분들께는 [sighs] 반가운 소식이에요.

문의는 010-1234-5678로 남겨 주세요. [laughs] 오늘도 편안한 하루 보내세요.`;

// 채우는 때: 공개 데모이고 주소에 example=1이 있고 작업실을 다 읽었고 대본이 비어 있을 때만. 본인용(데모 아님)에서는 example을 무시한다.
// 빈 작업실 조건이 곧 '한 번만'이다(채운 뒤에는 글이 있어 새로고침해도 다시 채우지 않는다)
export function shouldFillExample(input: {
	demo: boolean;
	example: string | null;
	restored: boolean;
	paragraphs: readonly { text: string }[];
}): boolean {
	return (
		input.demo &&
		input.example === "1" &&
		input.restored &&
		input.paragraphs.every((p) => p.text.trim() === "")
	);
}
