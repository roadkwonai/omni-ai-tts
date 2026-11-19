// apps/web/src/lib/tag-view.test.ts
import { describe, expect, it } from "vitest";

import { PARAGRAPH_AUTO_TAG_TEXT } from "./studio-text";
import {
	AUTO_TAG_ACCOUNT,
	AUTO_TAG_TEXT,
	autoTagProblemText,
	insertSound,
	insertTagSpaced,
	TAG_TEXT,
} from "./tag-view";
import { trialProblemText } from "./trial-view";
import { retryTime } from "./voice-view";

// 드라마 작업실 테스트(drama-view.test.ts)에서 옮겼다. 두 작업실이 함께 쓴다(T10 스펙 15.1·15.3)

describe("insertSound", () => {
	it("소리 뱃지는 커서 위치에 '태그 '를 넣고 커서를 그 뒤로(UTF-16 단위). 값은 태그 전체 글이다('스펙과 다른 점' 19)", () => {
		expect(insertSound("안녕 하세요", 3, "[sighs]")).toEqual({
			text: "안녕 [sighs] 하세요",
			caret: 11,
		});
		expect(insertSound("", 0, "[clears throat]")).toEqual({
			text: "[clears throat] ",
			caret: 16,
		});
		// Gemini 꺾쇠도 같은 동작이다
		expect(insertSound("가나", 1, "<sigh>")).toEqual({
			text: "가<sigh> 나",
			caret: 8,
		});
		// BMP 밖 글자(이모지)는 UTF-16 두 단위다. 커서도 textarea selectionStart와 같은 단위
		expect(insertSound("😀가", 2, "[x]")).toEqual({
			text: "😀[x] 가",
			caret: 6,
		});
	});
});

describe("insertTagSpaced(문단 작업실 넣기, 브리프 15.1)", () => {
	it("단어 바로 뒤: 앞에 공백을 붙이고, 뒤가 이미 공백이면 붙이지 않는다. 커서는 넣은 태그 바로 뒤(기존 공백 앞)", () => {
		expect(insertTagSpaced("넣어 봅니다", 2, "[x]")).toEqual({
			text: "넣어 [x] 봅니다",
			// "넣어 [x]"까지 6. "[x] " 뒤(7)가 아니다
			caret: 6,
		});
	});
	it("맨 앞: 앞 글자가 없으면 앞 공백 없이, 뒤 글자가 공백이 아니면 뒤에 공백", () => {
		expect(insertTagSpaced("가나", 0, "[x]")).toEqual({
			text: "[x] 가나",
			caret: 4,
		});
		// 빈 칸은 끝이므로 뒤에 공백
		expect(insertTagSpaced("", 0, "[sighs]")).toEqual({
			text: "[sighs] ",
			caret: 8,
		});
	});
	it("맨 끝: 앞이 글자면 앞에, 끝이므로 뒤에도 공백", () => {
		expect(insertTagSpaced("가나", 2, "<sigh>")).toEqual({
			text: "가나 <sigh> ",
			caret: 10,
		});
	});
	it("공백 뒤: 앞 공백은 붙이지 않고, 뒤가 글자면 뒤에 공백(두 칸이 되지 않게)", () => {
		expect(insertTagSpaced("가 나", 2, "[x]")).toEqual({
			text: "가 [x] 나",
			caret: 6,
		});
		// 줄바꿈도 공백이다
		expect(insertTagSpaced("가\n나", 2, "[x]")).toEqual({
			text: "가\n[x] 나",
			caret: 6,
		});
	});
	it("단어 가운데: 앞뒤 모두 공백", () => {
		expect(insertTagSpaced("가나", 1, "[x]")).toEqual({
			text: "가 [x] 나",
			caret: 6,
		});
	});
});

describe("TAG_TEXT·AUTO_TAG_TEXT", () => {
	it("도구줄 문구(드라마 스펙 17.3, 문단 브리프 15.3)", () => {
		expect(TAG_TEXT.moreOf("소리")).toBe("소리 더 보기");
		expect(TAG_TEXT.badgeName("한숨", "[sighs]")).toBe("한숨, [sighs]");
		expect(TAG_TEXT).toMatchObject({ soundShort: "소리", moodShort: "분위기" });
		// 범위는 드라마만 쓴다(DRAMA_TEXT.spanShort)
		expect(TAG_TEXT).not.toHaveProperty("spanShort");
	});
	it("자동 태그 실패 문구(대기 시각은 ISO를 받아 앱 공통 retryTime으로, 미확인은 받지 못함과 같다)", () => {
		expect(AUTO_TAG_TEXT.reply).toBe("추천을 읽지 못했어요. 다시 해 주세요.");
		const at = "2026-10-22T03:04:30.000Z";
		expect(AUTO_TAG_TEXT.retryAt(at)).toBe(
			`${retryTime(at)} 이후에 다시 추천받을 수 있어요`,
		);
		expect(AUTO_TAG_TEXT.failed).toBe(
			"추천을 받지 못했어요. 잠시 뒤 다시 해 주세요.",
		);
		expect(AUTO_TAG_TEXT.unknown).toBe(AUTO_TAG_TEXT.failed);
	});
});

describe("autoTagProblemText", () => {
	const problem = (
		reason: string,
		extra: { retryAt?: string; providerCode?: string } = {},
	) =>
		({
			reason,
			retryAt: extra.retryAt ?? null,
			providerCode: extra.providerCode ?? null,
		}) as Parameters<typeof autoTagProblemText>[0];
	it("오류: 답을 읽지 못함·대기 시각·받지 못함은 자동 태그 문구, 키·계정 문구는 T5 Gemini 그대로", () => {
		expect(
			autoTagProblemText(
				problem("provider_input", { providerCode: "auto_tag_reply" }),
			),
		).toBe("추천을 읽지 못했어요. 다시 해 주세요.");
		const at = "2026-10-22T03:04:30.000Z";
		expect(autoTagProblemText(problem("rate_limit", { retryAt: at }))).toBe(
			`${retryTime(at)} 이후에 다시 추천받을 수 있어요`,
		);
		for (const reason of [
			"provider_error",
			"unknown_outcome",
			"unexpected",
			"odd_reason",
		])
			expect(autoTagProblemText(problem(reason))).toBe(
				"추천을 받지 못했어요. 잠시 뒤 다시 해 주세요.",
			);
		for (const reason of ["no_key", "provider_auth", "quota", "no_permission"])
			expect(autoTagProblemText(problem(reason))).toBe(
				trialProblemText("gemini", problem(reason)).text,
			);
	});
	it("OpenAI 계정 문제는 표의 account, 자동 태그의 입력 거절은 failed(두 문구 표 모두)", () => {
		const account = problem("quota", { providerCode: "openai_account" });
		expect(autoTagProblemText(account)).toBe(AUTO_TAG_ACCOUNT);
		expect(autoTagProblemText(account, PARAGRAPH_AUTO_TAG_TEXT)).toBe(
			AUTO_TAG_ACCOUNT,
		);
		const input = problem("provider_input", {
			providerCode: "model_not_found",
		});
		expect(autoTagProblemText(input)).toBe(AUTO_TAG_TEXT.failed);
		expect(autoTagProblemText(input, PARAGRAPH_AUTO_TAG_TEXT)).toBe(
			PARAGRAPH_AUTO_TAG_TEXT.failed,
		);
	});
	it("문구 표를 받는다(문단 작업실): 미확인은 unknown 칸, 공급자 오류·공통 대체 문구는 failed 칸", () => {
		const texts = {
			reply: "답",
			retryAt: (iso: string) => `대기 ${iso}`,
			failed: "실패",
			unknown: "미확인",
		};
		expect(
			autoTagProblemText(
				problem("provider_input", { providerCode: "auto_tag_reply" }),
				texts,
			),
		).toBe("답");
		expect(
			autoTagProblemText(problem("rate_limit", { retryAt: "T" }), texts),
		).toBe("대기 T");
		expect(autoTagProblemText(problem("unknown_outcome"), texts)).toBe(
			"미확인",
		);
		for (const reason of ["provider_error", "unexpected"])
			expect(autoTagProblemText(problem(reason), texts)).toBe("실패");
		expect(autoTagProblemText(problem("no_key"), texts)).toBe(
			trialProblemText("gemini", problem("no_key")).text,
		);
	});
});
