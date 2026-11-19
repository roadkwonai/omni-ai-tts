// apps/web/src/lib/tag-view.ts
import type { Tag } from "@tts-pilot-app/api/drama-acting";

import {
	type TrialProblem,
	trialFallback,
	trialProblemText,
} from "./trial-view";
import { retryTime } from "./voice-view";

// 태그 도구줄 문구, 태그 넣기, 자동 태그 실패 문구(T10 스펙 15.1·15.3). 드라마 drama-view에서 옮겼고 드라마 동작·문구는 같다.
// 넣기는 작업실마다 하나다(insertSound 드라마, insertTagSpaced 문단). 실패 문구는 autoTagProblemText 하나에 작업실이 자기 문구 표를 넘긴다

export const TAG_TEXT = {
	// 첫 묶음 나머지를 담은 메뉴 알약, 묶음 짧은 이름(메뉴 알약 글), 뱃지 접근 이름
	moreOf: (name: string) => `${name} 더 보기`,
	soundShort: "소리",
	moodShort: "분위기",
	badgeName: (label: string, text: string) => `${label}, ${text}`,
} as const;

// 도구줄 묶음 하나(tag-tools TagTools): 메뉴 안 머리(긴 이름), 메뉴 알약 글(짧은 이름), 알약
export type TagKind = "sound" | "span" | "mood";
export type TagGroup = {
	kind: TagKind;
	title: string;
	short: string;
	items: readonly Tag[];
};

// 자동 태그 실패 한 줄의 문구 표(autoTagProblemText). retryAt은 429 대기 시각(ISO)을 받는다
type AutoTagTexts = {
	reply: string;
	retryAt: (iso: string) => string;
	failed: string;
	unknown: string;
};

// 드라마 문구 표. 처리 여부 미확인도 받지 못함과 같은 글이다(문단은 studio-text PARAGRAPH_AUTO_TAG_TEXT)
const AUTO_TAG_FAILED = "추천을 받지 못했어요. 잠시 뒤 다시 해 주세요.";
export const AUTO_TAG_ACCOUNT =
	"OpenAI 키(OPENAI_API_KEY)나 결제·한도를 확인해 주세요";
export const AUTO_TAG_TEXT = {
	reply: "추천을 읽지 못했어요. 다시 해 주세요.",
	// 수정 회차 1(코디네이터 판정): 맥락이 틀린 T5 문구만 바꾼다
	retryAt: (iso: string) => `${retryTime(iso)} 이후에 다시 추천받을 수 있어요`,
	failed: AUTO_TAG_FAILED,
	unknown: AUTO_TAG_FAILED,
} as const;

// 소리 뱃지: 커서 위치에 '태그 '를 넣고 커서를 그 뒤로(위치는 UTF-16 단위, textarea selectionStart와 같다).
// 값은 태그 전체 글이다(ACTING의 sound, [sighs]·<sigh>, '스펙과 다른 점' 19)
export function insertSound(
	text: string,
	at: number,
	tag: string,
): { text: string; caret: number } {
	const inserted = `${tag} `;
	return {
		text: `${text.slice(0, at)}${inserted}${text.slice(at)}`,
		caret: at + inserted.length,
	};
}

// 문단 작업실 넣기(브리프 15.1): 단어에 붙지 않고 두 칸이 되지 않게, 앞 글자가 공백이 아니면 앞에, 뒤 글자가 공백이 아니면(끝 포함) 뒤에 공백 하나.
// 커서는 넣은 글 바로 뒤다(뒤가 원래 공백이면 그 공백 앞). 드라마는 insertSound 그대로다
export function insertTagSpaced(
	text: string,
	at: number,
	tag: string,
): { text: string; caret: number } {
	const before = at > 0 && !/\s/.test(text[at - 1] ?? "") ? " " : "";
	const after = /\s/.test(text[at] ?? "") ? "" : " ";
	const inserted = `${before}${tag}${after}`;
	return {
		text: `${text.slice(0, at)}${inserted}${text.slice(at)}`,
		caret: at + inserted.length,
	};
}

// 자동 태그 오류 줄(확인 창 안, 코디네이터 판정): 답을 읽지 못함은 reply, 대기 시각은 retryAt, 처리 여부 미확인은 unknown,
// 공급자 오류·예상 못 한 사유는 failed, openai_account는 OpenAI 키·결제 문구, 입력 거절은 failed, 나머지(키·계정·잔액 등)는 T5 Gemini 문구 그대로
export function autoTagProblemText(
	problem: TrialProblem,
	texts: AutoTagTexts = AUTO_TAG_TEXT,
): string {
	if (problem.providerCode === "openai_account") return AUTO_TAG_ACCOUNT;
	if (problem.providerCode === "auto_tag_reply") return texts.reply;
	// 자동 태그의 입력 거절은 OpenAI·Gemini 구분 없이 '받지 못함'이다(Gemini 입력 거절 문구는 TTS 문장용)
	if (problem.reason === "provider_input") return texts.failed;
	if (problem.reason === "rate_limit" && problem.retryAt)
		return texts.retryAt(problem.retryAt);
	if (problem.reason === "unknown_outcome") return texts.unknown;
	if (problem.reason === "provider_error") return texts.failed;
	const { text } = trialProblemText("gemini", problem);
	return text === trialFallback("gemini") ? texts.failed : text;
}
