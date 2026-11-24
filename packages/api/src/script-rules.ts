// packages/api/src/script-rules.ts
// 대본 보관함(T12 계획 2.2) 상한 규칙. 서버 계약(script-contract.ts)의 검사와 화면 '대본' 메뉴 잠금이 같이 쓴다.
// zod·서버 모듈을 import하지 않는다(화면 번들에 들어간다, classification-rules.ts와 같다)
import { isBlank } from "./paragraph-script";
import { codePoints, PARAGRAPHS_MAX } from "./providers/trial-options";

export const SCRIPT_TITLE_MAX = 100;
export const SCRIPT_TEXT_MAX = 10_000;
// 작업 JSON의 UTF-8 바이트 상한(2 MiB)
export const SCRIPT_JSON_MAX = 2 * 1024 * 1024;
// 분류 연결과 목록 거르기 id 수 상한
export const SCRIPT_LINKS_MAX = 50;

export type ScriptWorkProblem =
	| "empty"
	| "too_many"
	| "too_long"
	| "too_large"
	| "nul"
	| "encoding";

type WorkLike = {
	paragraphs: readonly { text: string; fixes?: { text: string } }[];
};

// JSON 안의 \u0000 이스케이프(앞의 백슬래시가 짝수 개일 때만 진짜 NUL이다). Postgres는 jsonb·text의 NUL을 거절한다
const NUL_ESCAPE = /(?:^|[^\\])(?:\\\\)*\\u0000/;
// JSON.stringify는 짝 맞은 서로게이트를 글자 그대로 쓰고 외짝만 \udXXX로 이스케이프한다. Postgres jsonb는 외짝을 거절한다(22P02)
const LONE_SURROGATE_ESCAPE = /(?:^|[^\\])(?:\\\\)*\\ud[89a-f][0-9a-f]{2}/;

// 비지 않은 문단 1~200, 글(검수 원문 포함) 10,000자, 직렬화 2 MB, NUL·외짝 서로게이트 없음. 문제가 없으면 null
export function scriptWorkProblem(work: WorkLike): ScriptWorkProblem | null {
	const { paragraphs } = work;
	if (paragraphs.length > PARAGRAPHS_MAX) return "too_many";
	if (!paragraphs.some((p) => p.text.trim() !== "")) return "empty";
	if (
		paragraphs.some(
			(p) =>
				codePoints(p.text) > SCRIPT_TEXT_MAX ||
				(p.fixes !== undefined && codePoints(p.fixes.text) > SCRIPT_TEXT_MAX),
		)
	)
		return "too_long";
	const json = JSON.stringify(work);
	if (new TextEncoder().encode(json).length > SCRIPT_JSON_MAX)
		return "too_large";
	if (NUL_ESCAPE.test(json)) return "nul";
	return LONE_SURROGATE_ESCAPE.test(json) ? "encoding" : null;
}

// 검색 원문(비지 않은 문단 글을 빈 줄로 이은 것, 검색어처럼 NFC)과 목록의 수(비지 않은 문단 수, 코드 포인트 수). 서버가 저장할 때 만든다
export function scriptBody(paragraphs: readonly { text: string }[]): {
	body: string;
	paragraphCount: number;
	charCount: number;
} {
	const texts = paragraphs.map((p) => p.text).filter((t) => !isBlank(t));
	return {
		body: texts.join("\n\n").normalize("NFC"),
		paragraphCount: texts.length,
		charCount: texts.reduce((sum, t) => sum + codePoints(t), 0),
	};
}
