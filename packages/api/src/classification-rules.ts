// packages/api/src/classification-rules.ts
// 채널·분류(T6 스펙 2절) 입력 규칙. 화면과 서버가 같이 쓴다. zod·서버 모듈을 import하지 않는다(화면 번들에 들어간다).
// 여기의 카테고리·타입은 사용자가 만든 분류다. 공급자 성우의 Voice.category(ElevenLabs 성우 종류)·voiceType(출처)과 다르다(GLOSSARY '분류').
import { codePoints, normalizeText } from "./providers/trial-options";

export const NAME_MAX = 40;
export const MEMO_MAX = 200;
export const URL_MAX = 500;

export const CLASSIFICATION_KINDS = ["category", "type"] as const;
export type ClassificationKind = (typeof CLASSIFICATION_KINDS)[number];

export type FieldProblem = "empty" | "too_long" | "bad_url";

// 보이지 않는 글자: 제어 문자(탭·줄바꿈 U+0009~000D는 아래 \s가 공백으로 합친다)·양방향 제어 문자(목록 글자 순서를 뒤집는다)·폭 없는 공백·단어 결합자·BOM은 지우고, 한글 채움 문자(U+3164)는 공백으로 본다(계획 리뷰 E10).
// 그대로 두면 보이지 않는 이름이 생기고 같은 이름 검사를 피해 간다. 이모지를 잇는 U+200D(ZWJ)는 지우지 않는다
const INVISIBLE =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어 문자를 지우는 것이 목적이다
	/[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;
// 주소의 제어 문자(NUL은 DB가 거절하고, 앞의 제어 문자는 URL 해석이 지워 스킴 검사를 피해 간다)
// biome-ignore lint/suspicious/noControlCharactersInRegex: 제어 문자를 찾는 것이 목적이다
export const URL_CONTROL = /[\u0000-\u001F\u007F-\u009F]/u;

// NFC, 앞뒤 공백 제거(T5 normalizeText), 줄바꿈·탭·전각 공백을 포함한 연속 공백을 하나로
export function cleanText(text: string): string {
	return normalizeText(
		text.replace(INVISIBLE, "").replace(/\u3164/gu, " "),
	).replace(/\s+/gu, " ");
}

export function nameProblem(raw: string): FieldProblem | null {
	const name = cleanText(raw);
	if (!name) return "empty";
	return codePoints(name) > NAME_MAX ? "too_long" : null;
}

export function memoProblem(raw: string): FieldProblem | null {
	return codePoints(cleanText(raw)) > MEMO_MAX ? "too_long" : null;
}

// http·https 절대 주소만. 목록이 이 값을 링크로 그리므로 다른 스킴(javascript: 등)을 막는다. 빈 값은 없음으로 저장한다.
// URL.parse는 Safari 17에 없어 canParse 뒤 new URL로 읽는다(계획 리뷰 P2 기각)
export function urlProblem(raw: string): FieldProblem | null {
	const url = raw.trim();
	if (!url) return null;
	if (codePoints(url) > URL_MAX) return "too_long";
	if (URL_CONTROL.test(url) || !URL.canParse(url)) return "bad_url";
	const { protocol } = new URL(url);
	return protocol === "http:" || protocol === "https:" ? null : "bad_url";
}

export function cleanMemo(raw: string): string | null {
	return cleanText(raw) || null;
}

// 주소는 사용자가 쓴 그대로 둔다(앞뒤 공백만). URL 객체로 바꾸면 끝 '/'가 붙는 등 글자가 달라진다
export function cleanUrl(raw: string): string | null {
	return raw.trim() || null;
}
