// packages/api/src/number-reading.test.ts
import { describe, expect, it } from "vitest";

import { readingItems } from "./number-reading";
import { applyCertain, spokenOf } from "./paragraph-script";

// 글 하나에서 항목 하나만 나오는 입력의 항목
const one = (text: string) => {
	const items = readingItems(text);
	expect(items).toHaveLength(1);
	const [item] = items;
	if (!item) throw new Error("항목 없음");
	return item;
};
// '확실한 것 모두 적용'한 발음용 대본
const spoken = (text: string) =>
	applyCertain([{ id: "p1", text }]).map(spokenOf)[0];

describe("한글 수 단위가 섞인 수", () => {
	it.each([
		["3천5백만 원", "삼천오백만 원"],
		["2천5백만 명", "이천오백만 명"],
		["1억2천3백만 원", "일억 이천삼백만 원"],
		["1억 5천3백만 원", "일억 오천삼백만 원"],
		["3천 500만 원", "삼천오백만 원"],
		["1백2십만 원", "백이십만 원"],
		["1천2백3십만 4천 원", "천이백삼십만 사천 원"],
	])("만·억·조 앞의 천·백·십은 그 단위에 함께 묶인다: %s", (text, reading) => {
		expect(one(text)).toMatchObject({
			original: text,
			readings: [reading],
			needsCheck: false,
		});
	});
	it("1조2천5백억 원은 조 이상이라 후보만 두고 확인 필요", () => {
		expect(one("1조2천5백억 원")).toMatchObject({
			original: "1조2천5백억 원",
			readings: ["일조 이천오백억 원"],
			needsCheck: true,
			reason: "large",
		});
	});
	it.each([
		["3백 원", "삼백 원"],
		["5십만 원", "오십만 원"],
		["7천2백 원", "칠천이백 원"],
		["5천만 원", "오천만 원"],
		["1억 2천만 원", "일억 이천만 원"],
		["1만 2천5백 원", "만 이천오백 원"],
		["3천만 2천 원", "삼천만 이천 원"],
		["1.15억 원", "일억 천오백만 원"],
		// 4.35 × 10,000은 부동소수로 43499.99…다
		["4.35만 원", "사만 삼천오백 원"],
		["15,000원", "만 오천 원"],
		// 조각이 하나뿐이면 만 이상이어도 나열이 아니다
		["1,234백만 원", "십이억 삼천사백만 원"],
		["12,000만 원", "일억 이천만 원"],
		["15000만 원", "일억 오천만 원"],
		["100백만 원", "일억 원"],
		["30,000천 원", "삼천만 원"],
	])("지금 맞게 읽는 수는 그대로다: %s", (text, reading) => {
		expect(readingItems(text)[0]).toMatchObject({
			readings: [reading],
			needsCheck: false,
		});
	});
	it.each([
		"3만 5만 원",
		"2천 3천 원",
		"3천만 2천만 원",
		"3백 500만 원",
		"1억 2억",
		"3만 1억 원",
		"2조 3조 원",
		"1억 20000만 원",
		"12000만 3천 원",
		"300백 5십만 원",
	])("단위가 작아지지 않는 나열은 더하지 않고 확인 필요: %s", (text) => {
		expect(one(text)).toMatchObject({
			original: text,
			readings: [],
			needsCheck: true,
			reason: "list",
		});
		expect(spoken(text)).toBe(text);
	});
	it("정확히 1조부터 확인 필요", () => {
		expect(one("1조 원")).toMatchObject({
			readings: ["일조 원"],
			needsCheck: true,
			reason: "large",
		});
		expect(one("9999억 9999만 원")).toMatchObject({ needsCheck: false });
	});
});

describe("배·번째", () => {
	it.each([
		["2배", "두 배"],
		["3배로 늘었다", "세 배"],
		["10배", "열 배"],
		// 큰 수는 명·개와 같은 규칙이다
		["20배", "스무 배"],
		["100배", "백 배"],
		["1.5배", "일 점 오 배"],
		["1번째", "첫 번째"],
		["2번째", "두 번째"],
		["11번째", "열한 번째"],
		["21번째", "스물한 번째"],
	])("%s → %s", (text, reading) => {
		expect(one(text)).toMatchObject({
			kind: "count",
			readings: [reading],
			needsCheck: false,
		});
	});
	it("범위 안에서도 같다", () => {
		expect(one("2~3배").readings[0]).toBe("두 배에서 세 배");
		expect(one("1~3번째").readings[0]).toBe("첫 번째에서 세 번째");
	});
});

describe("통화 기호와 빼기표", () => {
	it.each([
		"$1,200에 샀다",
		"US$5입니다",
		"₩15,000",
		"€20",
		"£5.50",
		"¥300",
		"￦15,000",
		"＄20",
		"￥300",
		"￡5",
		"$3천만",
		"$-5",
	])("통화 기호 바로 뒤 숫자는 확정 적용하지 않는다: %s", (text) => {
		expect(one(text)).toMatchObject({ needsCheck: true, reason: "unit" });
		expect(spoken(text)).toBe(text);
	});
	it("통화 기호에서 떨어진 숫자는 그대로 읽는다", () => {
		expect(spoken("$5 말고 3개")).toBe("$5 말고 세 개");
	});
	it.each([
		"-5도",
		"기온은 -2.5도예요",
		"-5개",
		"-3.5",
		"3-1",
		"서울-부산 3개",
		"010-1234-5678",
		"GPT-4",
	])("U+2212 빼기표는 ASCII '-'와 같다: %s", (text) => {
		const minus = (value: string) => value.replaceAll("-", "\u{2212}");
		expect(readingItems(minus(text))).toEqual(
			readingItems(text).map((item) => ({
				...item,
				original: minus(item.original),
			})),
		);
	});
});

describe("단위 없는 범위와 제N", () => {
	it("1~3은 확인 필요이고 후보는 하나", () => {
		expect(one("1~3")).toMatchObject({
			readings: ["일에서 삼"],
			needsCheck: true,
		});
	});
	it("제3은 제삼", () => {
		expect(one("제3")).toMatchObject({
			original: "제3",
			readings: ["제삼"],
			needsCheck: false,
		});
	});
});
