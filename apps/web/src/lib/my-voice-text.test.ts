// apps/web/src/lib/my-voice-text.test.ts
import { TRIAL_TEXT_MAX } from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import {
	READING_FIRST_SENTENCE,
	READING_PASSAGE,
	MY_VOICE_TEXT as T,
} from "./my-voice-text";

describe("noSample", () => {
	it("들어보기 비용은 말하지 않는다(요금은 모델별 표시가 맡는다)", () => {
		expect(T.noSample).toBe("클론에는 기본 샘플이 없어요");
	});
});

describe("fileTooBig", () => {
	it("파일 크기 문제를 말한다(길이가 아니다)", () => {
		expect(T.fileTooBig).toBe(
			"파일이 너무 커요. 더 짧은 오디오 파일을 골라 주세요.",
		);
	});
});

describe("READING_FIRST_SENTENCE", () => {
	it("읽을 거리의 첫 문장 하나이고 들어보기 문장 한도 안이다", () => {
		expect(READING_PASSAGE.startsWith(READING_FIRST_SENTENCE)).toBe(true);
		expect(READING_FIRST_SENTENCE.endsWith(".")).toBe(true);
		expect(READING_FIRST_SENTENCE.slice(0, -1)).not.toContain(".");
		expect([...READING_FIRST_SENTENCE].length).toBeLessThanOrEqual(
			TRIAL_TEXT_MAX,
		);
	});
});

describe("지우기 확인 문구", () => {
	it("공급자와 프리셋 안내가 줄로 나뉜다", () => {
		expect(T.deleteDescription("Fish Audio")).toBe(
			"Fish Audio 계정에서도 지워지고 되돌릴 수 없어요.",
		);
		expect(T.deletePresets(2)).toContain("프리셋 2개");
		expect(T.deleteKeepsResults).toContain("음성 결과는 그대로");
	});
});

describe("확인 단계 고지", () => {
	it("되돌리는 법과 요금을 단정으로 말한다", () => {
		expect(T.undoHow("Gemini")).toBe(
			"내 보이스에서 지우면 Gemini 계정에서도 지워져요",
		);
		expect(T.cloneCost).toBe("음성 서비스 문서에 클론 요금 정보가 없어요");
	});
});
