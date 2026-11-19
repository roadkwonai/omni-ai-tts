import { describe, expect, it } from "vitest";

import { TRY } from "../../lib/landing-content";
import { readingItems } from "../../lib/number-reading";
import {
	type Decision,
	isCertain,
	type Paragraph,
	spokenPartsOf,
} from "../../lib/paragraph-script";
import { NUMBER_TEXT } from "../../lib/studio-text";
import { readingView } from "./try-reading";

const text = (view: ReturnType<typeof readingView>) =>
	view.parts.map((p) => p.text).join("");
const changed = (view: ReturnType<typeof readingView>) =>
	view.parts.filter((p) => p.changed).map((p) => p.text);

describe("readingView(숫자 놀이터 계산)", () => {
	it("처음 예시 문장: 숫자 네 곳만 바뀌고 확인 필요는 0이다", () => {
		const view = readingView(TRY.example);
		expect(changed(view)).toEqual([
			"이천이십육 년",
			"천오백이십삼억 달러",
			"삼 점 오 퍼센트",
			"열 시 삼십 분",
		]);
		expect(text(view)).toBe(
			"이천이십육 년 수출액은 천오백이십삼억 달러로 삼 점 오 퍼센트 늘었고, 발표는 오전 열 시 삼십 분에 해요",
		);
		expect(view.count).toBe(4);
		expect(view.checks).toEqual([]);
	});
	it("'2026년 3분기' 칩은 확인 필요를 보여 준다('3분기'의 분은 단위인지 단어('분기')의 일부인지 엔진이 확인을 요청한다)", () => {
		const view = readingView("2026년 3분기");
		expect(view.checks).toEqual([
			{ original: "3", reason: NUMBER_TEXT.reasons.unit_join },
		]);
	});
	it("예시 칩 다섯의 읽기: 확인 필요 항목('3분기'의 3)은 자동으로 바꾸지 않고 원문으로 둔다", () => {
		const reads = TRY.chips.map((chip) => text(readingView(chip)));
		expect(reads).toEqual([
			"이천이십육 년 3분기",
			"천오백이십삼억 달러",
			"삼 점 오 퍼센트",
			"오전 열 시 삼십 분",
			"공일공 일이삼사 오육칠팔",
		]);
	});
	it("앞이 글자면 띄어 붙이고 뒤 조사는 그대로 둔다", () => {
		expect(text(readingView("약 3.5%예요"))).toBe("약 삼 점 오 퍼센트예요");
	});
	it("확인 필요 항목은 이유 한 줄을 낸다(작업실 숫자 검수 창과 같은 문구)", () => {
		const view = readingView("점수는 3:1이에요");
		expect(view.checks).toEqual([
			{ original: "3:1", reason: NUMBER_TEXT.reasons.fraction },
		]);
	});
	it("후보가 없는 항목은 원문을 그대로 두고 확인 필요로만 알린다", () => {
		const view = readingView("GPT-4o를 써요");
		expect(text(view)).toBe("GPT-4o를 써요");
		expect(view.count).toBe(0);
		expect(view.checks[0]?.reason).toBe(NUMBER_TEXT.reasons.product);
	});
	it("숫자가 없거나 빈 입력이면 바꾼 곳이 없다", () => {
		expect(readingView("안녕하세요")).toEqual({
			parts: [{ text: "안녕하세요", changed: false }],
			count: 0,
			checks: [],
		});
		expect(readingView("  ")).toEqual({ parts: [], count: 0, checks: [] });
	});
});

describe("작업실과 같은 결과(확실한 것만 적용)", () => {
	// 작업실: 확실한 항목(isCertain)에만 choice 'apply'를 두고 spokenPartsOf로 발음용 글을 만든다
	function studioText(source: string): string {
		const decisions: Decision[] = readingItems(source)
			.filter((item) => isCertain(item, null))
			.map((item) => ({
				start: item.start,
				end: item.end,
				original: item.original,
				choice: "apply" as const,
			}));
		const paragraph: Paragraph = {
			id: "p",
			text: source,
			fixes: { text: source, decisions },
		};
		return spokenPartsOf(paragraph)
			.map((part) => part.text)
			.join("");
	}
	it.each([TRY.example, ...TRY.chips, "점수는 3:1이에요", "GPT-4o를 써요"])(
		"%s",
		(input) => {
			expect(text(readingView(input))).toBe(studioText(input));
		},
	);
	it("확인 필요 항목은 count에 넣지 않는다", () => {
		expect(readingView("2026년 3분기").count).toBe(1);
	});
});

describe("확인 필요 이유 문구", () => {
	it("랜딩 상수가 작업실 NUMBER_TEXT.reasons와 같은 글이다", async () => {
		const { CHECK_REASON_TEXT } = await import("../../lib/landing-content");
		expect(CHECK_REASON_TEXT).toEqual(NUMBER_TEXT.reasons);
	});
});
