import { describe, expect, it } from "vitest";

import { readingItems } from "./number-reading";

// 글 하나에서 항목 하나만 나오는 입력의 항목
const one = (text: string) => {
	const items = readingItems(text);
	expect(items).toHaveLength(1);
	const [item] = items;
	if (!item) throw new Error("항목 없음");
	return item;
};
const first = (text: string) => one(text).readings[0];

describe("수용표 11행 (요구사항 5절, 스펙 4절)", () => {
	it("12,500원 → 만 이천오백 원 (쉼표 무시, 금액)", () => {
		const item = one("12,500원");
		expect(item).toMatchObject({
			start: 0,
			end: 7,
			original: "12,500원",
			kind: "money",
			needsCheck: false,
		});
		expect(item.readings).toEqual(["만 이천오백 원"]);
	});
	it("3개·3명·3시·3분", () => {
		expect(first("3개")).toBe("세 개");
		expect(first("3명")).toBe("세 명");
		expect(first("3시")).toBe("세 시");
		expect(first("3분")).toBe("삼 분");
		expect(one("3개").kind).toBe("count");
	});
	it("2026년 6월 10일 → 이천이십육 년 유월 십 일", () => {
		const item = one("2026년 6월 10일");
		expect(item.kind).toBe("date");
		expect(item.readings).toEqual(["이천이십육 년 유월 십 일"]);
		expect(item.needsCheck).toBe(false);
	});
	it("오후 3:05 → 오후 세 시 오 분 (항목은 3:05)", () => {
		const item = one("오후 3:05");
		expect(item).toMatchObject({ start: 3, end: 7, original: "3:05" });
		expect(item.kind).toBe("time");
		expect(item.readings).toEqual(["세 시 오 분"]);
	});
	it("3.5% → 삼 점 오 퍼센트", () => {
		const item = one("3.5%");
		expect(item.kind).toBe("percent");
		expect(item.readings).toEqual(["삼 점 오 퍼센트"]);
		expect(item.needsCheck).toBe(false);
	});
	it("% 뒤에 조사·어미가 와도 퍼센트로 읽는다(3.5%예요·3.5%이고)", () => {
		for (const tail of ["예요", "이고", "에요", "이에요", "입니다"]) {
			const item = one(`3.5%${tail}`);
			expect(item).toMatchObject({
				original: "3.5%",
				kind: "percent",
				needsCheck: false,
			});
			expect(item.readings).toEqual(["삼 점 오 퍼센트"]);
		}
	});
	it("-2.5도 → 영하 이 점 오 도, 둘째 후보 마이너스", () => {
		const item = one("-2.5도");
		expect(item.kind).toBe("temperature");
		expect(item.readings).toEqual(["영하 이 점 오 도", "마이너스 이 점 오 도"]);
		expect(item.needsCheck).toBe(false);
	});
	it("010-1234-5678 → 공일공 일이삼사 오육칠팔, 둘째 후보 영일영", () => {
		const item = one("010-1234-5678");
		expect(item.kind).toBe("phone");
		expect(item.readings).toEqual([
			"공일공 일이삼사 오육칠팔",
			"영일영 일이삼사 오육칠팔",
		]);
		expect(item.needsCheck).toBe(false);
	});
	it("120개 → 백스무 개, 20살 → 스무 살", () => {
		expect(first("120개")).toBe("백스무 개");
		expect(first("20살")).toBe("스무 살");
	});
	it("1~3개 → 확인 필요, 후보 한 개에서 세 개 / 일에서 삼 개", () => {
		const item = one("1~3개");
		expect(item.kind).toBe("range");
		expect(item.needsCheck).toBe(true);
		expect(item.reason).toBe("range");
		expect(item.readings).toEqual(["한 개에서 세 개", "일에서 삼 개"]);
	});
	it("1/2 → 확인 필요, 후보 이 분의 일. 3·1과 3-1은 후보 없음", () => {
		const half = one("1/2");
		expect(half).toMatchObject({
			kind: "fraction",
			needsCheck: true,
			reason: "fraction",
		});
		expect(half.readings).toEqual(["이 분의 일"]);
		for (const text of ["3·1", "3-1"]) {
			const item = one(text);
			expect(item).toMatchObject({ kind: "fraction", needsCheck: true });
			expect(item.readings).toEqual([]);
		}
	});
	it("GPT-4o · iPhone 16 · v1.2.3 → 확인 필요, 후보 없음 (숫자 규칙으로 바꾸지 않는다)", () => {
		for (const text of ["GPT-4o", "iPhone 16", "v1.2.3"]) {
			const item = one(text);
			expect(item).toMatchObject({
				kind: "product",
				original: text,
				needsCheck: true,
				reason: "product",
			});
			expect(item.readings).toEqual([]);
		}
	});
	it("이미 한글인 대본은 항목이 없다", () => {
		expect(readingItems("삼 분 뒤에 만 이천오백 원을 냈다.\n둘째 줄")).toEqual(
			[],
		);
	});
});

describe("한자어 수 읽기", () => {
	it("만·억 단위는 띄어 쓰고, 십·백·천·만 앞의 일은 생략, 억 앞은 남긴다", () => {
		const cases: [string, string][] = [
			["0원", "영 원"],
			["10원", "십 원"],
			["100원", "백 원"],
			["1,000원", "천 원"],
			["10,000원", "만 원"],
			["10,001원", "만 일 원"],
			["12,500원", "만 이천오백 원"],
			["20,000,000원", "이천만 원"],
			["100,000,000원", "일억 원"],
			["150,000,000원", "일억 오천만 원"],
			["230,012,345원", "이억 삼천일만 이천삼백사십오 원"],
		];
		for (const [text, reading] of cases) expect(first(text)).toBe(reading);
	});
	it("0시는 영 시", () => {
		expect(first("0시")).toBe("영 시");
	});
});

describe("고유어 수 읽기", () => {
	it("1~99 관형형", () => {
		const cases: [number, string][] = [
			[1, "한"],
			[2, "두"],
			[3, "세"],
			[4, "네"],
			[5, "다섯"],
			[9, "아홉"],
			[10, "열"],
			[11, "열한"],
			[12, "열두"],
			[14, "열네"],
			[20, "스무"],
			[21, "스물한"],
			[24, "스물네"],
			[30, "서른"],
			[40, "마흔"],
			[50, "쉰"],
			[60, "예순"],
			[70, "일흔"],
			[80, "여든"],
			[90, "아흔"],
			[99, "아흔아홉"],
		];
		for (const [n, reading] of cases)
			expect(first(`${n}개`)).toBe(`${reading} 개`);
	});
	it("100 이상은 한자어 백·천 + 고유어 끝", () => {
		const cases: [string, string][] = [
			["100개", "백 개"],
			["101개", "백한 개"],
			["120개", "백스무 개"],
			["121개", "백스물한 개"],
			["200개", "이백 개"],
			["1,000개", "천 개"],
			["1,234개", "천이백서른네 개"],
			["12,020개", "만 이천스무 개"],
		];
		for (const [text, reading] of cases) expect(first(text)).toBe(reading);
	});
	it("시간·개월 같은 단위: 시간은 고유어, 개월은 한자어", () => {
		expect(first("2시간")).toBe("두 시간");
		expect(first("3개월")).toBe("삼 개월");
		expect(first("5층")).toBe("오 층");
	});
	it("모르는 단위는 수만 한자어로 읽고 확인 필요로 두지 않는다", () => {
		const item = one("3홉");
		expect(item.original).toBe("3");
		expect(item.readings).toEqual(["삼"]);
		expect(item.needsCheck).toBe(false);
		expect(item.kind).toBe("number");
	});
});

describe("월·시간", () => {
	it("6월은 유월, 10월은 시월, 나머지는 한자어", () => {
		expect(first("6월")).toBe("유월");
		expect(first("10월")).toBe("시월");
		expect(first("12월")).toBe("십이 월");
		expect(first("1월 5일")).toBe("일 월 오 일");
		// 달이 아닌 수는 날짜로 보지 않는다(13월 → 일반 수 13 + 월)
		expect(one("13월").kind).not.toBe("date");
	});
	it("시간 범위: 0~24시, 00~59분", () => {
		expect(first("0:30")).toBe("영 시 삼십 분");
		expect(first("12:00")).toBe("열두 시");
		expect(first("24:00")).toBe("스물네 시");
		expect(one("23:59").kind).toBe("time");
		for (const text of ["3:60", "25:00", "1:5"]) {
			expect(readingItems(text).some((i) => i.kind === "time")).toBe(false);
		}
		// 시간이 아니면 콜론 식(비율·점수)이라 후보 없이 확인 필요
		expect(readingItems("3:60")).toMatchObject([
			{ kind: "fraction", needsCheck: true, readings: [] },
		]);
	});
});

describe("겹침·태그·글 보존", () => {
	it("전화번호 안의 숫자를 다시 잡지 않는다", () => {
		const items = readingItems("연락처 010-1234-5678 입니다");
		expect(items).toHaveLength(1);
		expect(items[0]?.original).toBe("010-1234-5678");
	});
	it("긴 패턴이 먼저: 날짜 안의 년·월·일, 시간 안의 숫자는 하나로", () => {
		expect(readingItems("2026년 6월 10일 3:05")).toHaveLength(2);
		expect(readingItems("1~3개")).toHaveLength(1);
		expect(readingItems("3.5%")).toHaveLength(1);
	});
	it("항목은 시작 위치 순이고 start·end가 원문을 가리킨다", () => {
		const text = "사과 3개와 12,500원, 그리고 3.5%";
		const items = readingItems(text);
		expect(items.map((i) => i.original)).toEqual(["3개", "12,500원", "3.5%"]);
		for (const i of items) expect(text.slice(i.start, i.end)).toBe(i.original);
	});
	it("태그 안 숫자는 잡지 않는다", () => {
		expect(readingItems("안녕 [break 2] 하세요 <sigh> 끝")).toEqual([]);
		const items = readingItems("[break 2] 3개 <sigh>");
		expect(items.map((i) => i.original)).toEqual(["3개"]);
		// 한글이 든 괄호는 대본 글이라 안의 숫자를 잡는다
		expect(readingItems("[속보 3건]").map((i) => i.original)).toEqual(["3"]);
	});
	it("줄바꿈이 있어도 위치가 맞고 줄 사이를 잇지 않는다", () => {
		const text = "첫째 3개\n둘째 4명\n\n셋째 1~\n3개";
		const items = readingItems(text);
		for (const i of items) expect(text.slice(i.start, i.end)).toBe(i.original);
		expect(items.map((i) => i.original)).toEqual(["3개", "4명", "1", "3개"]);
	});
	it("읽은 결과를 다시 돌려도 항목이 없다", () => {
		const text = "2026년 6월 10일 오후 3:05에 12,500원 3.5% 010-1234-5678";
		let spoken = text;
		for (const i of [...readingItems(text)].reverse())
			spoken = spoken.slice(0, i.start) + i.readings[0] + spoken.slice(i.end);
		expect(readingItems(spoken)).toEqual([]);
	});
	it("숫자가 없는 글은 항목이 없다", () => {
		expect(readingItems("")).toEqual([]);
		expect(readingItems("안녕하세요. 오늘은 맑아요.")).toEqual([]);
	});
});

describe("확인 필요", () => {
	it("번은 셈과 번호가 갈려 확인 필요, 두 후보", () => {
		const item = one("3번");
		expect(item).toMatchObject({ needsCheck: true, reason: "unit" });
		expect(item.readings).toEqual(["세 번", "삼 번"]);
		// 번째는 셈이다
		expect(one("3번째")).toMatchObject({ needsCheck: false });
		expect(first("3번째")).toBe("세 번째");
	});
	it("도가 아닌 음수는 확인 필요", () => {
		const item = one("-5개");
		expect(item).toMatchObject({ needsCheck: true, reason: "negative" });
		expect(item.readings).toEqual(["마이너스 다섯 개"]);
		// 글 가운데 붙은 하이픈은 음수가 아니다
		expect(readingItems("서울-부산 3개").map((i) => i.original)).toEqual([
			"3개",
		]);
	});
	it("조 이상의 수는 확인 필요, 후보 없음", () => {
		const item = one("1,000,000,000,000원");
		expect(item).toMatchObject({ needsCheck: true, reason: "large" });
		expect(item.readings).toEqual([]);
		expect(one("999,999,999,999원").needsCheck).toBe(false);
	});
	it("셋째 자리 이하 소수는 확인 필요, 둘째 자리까지는 아니다", () => {
		expect(one("3.14").needsCheck).toBe(false);
		expect(first("3.14")).toBe("삼 점 일사");
		const item = one("3.141");
		expect(item).toMatchObject({ needsCheck: true, reason: "precision" });
		expect(item.readings).toEqual(["삼 점 일사일"]);
	});
	it("앞이 0인 수는 숫자를 하나씩 읽는 후보만 두고 확인 필요", () => {
		const item = one("007");
		expect(item).toMatchObject({ needsCheck: true, reason: "leading_zero" });
		expect(item.readings).toEqual(["영영칠"]);
	});
	it("영문자에 붙은 숫자: 4K·COVID-19·2026.06.10도 확인 필요", () => {
		for (const text of ["4K", "COVID-19", "2026.06.10"])
			expect(one(text)).toMatchObject({ kind: "product", needsCheck: true });
	});
});

describe("단위 뒤 한글·긴 단위·한글 수 단위·제 서수 (검수 탐침)", () => {
	it("단위 뒤에 조사가 아닌 한글이 바로 붙으면 단어 일부라 수만 잡고 확인 필요", () => {
		for (const [text, original, reading] of [
			["30원칙을 지켜요", "30", "삼십"],
			["5분석", "5", "오"],
		] as const) {
			const item = one(text);
			expect(item).toMatchObject({
				original,
				kind: "number",
				needsCheck: true,
				reason: "unit_join",
			});
			expect(item.readings).toEqual([reading]);
			expect(text.slice(item.start, item.end)).toBe(original);
		}
	});
	it("조사·어미가 붙은 단위는 그대로 읽고 확인 필요가 아니다", () => {
		for (const [text, original, reading] of [
			["3명이 왔다", "3명", "세 명"],
			["12,500원이고", "12,500원", "만 이천오백 원"],
			["3개 남았어요", "3개", "세 개"],
			["3개를 샀다", "3개", "세 개"],
			["5분만에 끝", "5분", "오 분"],
			["3시간 뒤", "3시간", "세 시간"],
		] as const) {
			const item = one(text);
			expect(item.original).toBe(original);
			expect(item.readings).toEqual([reading]);
			expect(item.needsCheck).toBe(false);
		}
	});
	it("긴 단위가 먼저: 21세기는 이십일 세기", () => {
		const item = one("21세기");
		expect(item).toMatchObject({ original: "21세기", needsCheck: false });
		expect(item.readings).toEqual(["이십일 세기"]);
	});
	it("한글 수 단위가 섞인 표기를 한 항목으로 읽는다", () => {
		const cases: [string, string][] = [
			["1억 원", "일억 원"],
			["3만 원", "삼만 원"],
			["5천만 원", "오천만 원"],
			["1억 2천만 원", "일억 이천만 원"],
			["1만 원", "만 원"],
			["1천 원", "천 원"],
			["10억", "십억"],
			["3만 명", "삼만 명"],
		];
		for (const [text, reading] of cases) {
			const item = one(text);
			expect(item.original).toBe(text);
			expect(item.readings).toEqual([reading]);
			expect(item.needsCheck).toBe(false);
		}
		expect(one("1억 원").kind).toBe("money");
		// 조 이상은 확인 필요
		const big = one("2조 3억");
		expect(big.readings).toEqual(["이조 삼억"]);
		expect(big).toMatchObject({ needsCheck: true, reason: "large" });
		// 뒤에 단어가 붙은 만큼은 만 단위가 아니다
		expect(one("3만큼").original).toBe("3");
	});
	it("제가 붙은 수는 한자어 서수이고 original에 제를 포함한다", () => {
		for (const [text, reading] of [
			["제3장", "제삼 장"],
			["제3회", "제삼 회"],
			["제1과", "제일 과"],
			["이 책 제12장은", "제십이 장"],
		] as const) {
			const item = one(text);
			expect(item.original).toBe(text.replace(/^이 책 |은$/g, ""));
			expect(item.readings).toEqual([reading]);
			expect(item.needsCheck).toBe(false);
		}
	});
	it("-2.5도는 영하·마이너스 후보에 확인 필요가 아니다", () => {
		const item = one("-2.5도");
		expect(item.readings).toEqual(["영하 이 점 오 도", "마이너스 이 점 오 도"]);
		expect(item.needsCheck).toBe(false);
	});
});

describe("리뷰 지적 반영 (T11 29·30행)", () => {
	it("대는 대수와 연령대가 갈려 확인 필요, 고유어·한자어 두 후보", () => {
		for (const [text, native, sino] of [
			["20대 여성", "스무 대", "이십 대"],
			["3대 문제", "세 대", "삼 대"],
			["차 2대", "두 대", "이 대"],
		] as const) {
			const item = readingItems(text)[0];
			expect(item).toMatchObject({ needsCheck: true, reason: "unit" });
			expect(item?.readings).toEqual([native, sino]);
		}
	});
	it("쉼표로 이은 수 목록은 한 항목, 후보 없이 확인 필요(천 단위 묶음은 그대로)", () => {
		for (const [text, original] of [
			["1,2,3 번호", "1,2,3"],
			["3,4명", "3,4"],
			["1,234,5", "1,234,5"],
		] as const) {
			const item = readingItems(text)[0];
			expect(item).toMatchObject({
				original,
				needsCheck: true,
				reason: "list",
			});
			expect(item?.readings).toEqual([]);
			expect(readingItems(text)).toHaveLength(1);
		}
		expect(first("1,234원")).toBe("천이백삼십사 원");
		expect(first("12,500원")).toBe("만 이천오백 원");
	});
	it("시각은 오전·오후 등이 앞에 있거나 시간 조사가 뒤에 오면 확실, 아니면 확인 필요", () => {
		for (const text of [
			"오후 3:05에",
			"3:05에 만나요",
			"오전 10:30",
			"7:00부터",
		])
			expect(readingItems(text)[0]).toMatchObject({
				kind: "time",
				needsCheck: false,
			});
		for (const text of ["16:10 비율", "5:30 승"])
			expect(readingItems(text)[0]).toMatchObject({
				kind: "time",
				needsCheck: true,
				reason: "time",
			});
	});
	it("시간 조사 뒤에 한글이 바로 붙으면(2:10 경기, 3:05 에어컨) 확인 필요", () => {
		for (const text of ["2:10 경기", "9:00 경기", "3:05 에어컨", "3:05에어컨"])
			expect(readingItems(text)[0]).toMatchObject({
				kind: "time",
				needsCheck: true,
				reason: "time",
			});
		for (const text of ["3:05에서 만나요", "3:05에는 닫아요", "9:00 경 도착"])
			expect(readingItems(text)[0]?.needsCheck).toBe(false);
	});
	it("3:05pm·10:30am은 전체가 확인 필요 한 항목이다(3이 확정 수가 되지 않는다)", () => {
		for (const text of ["3:05pm", "10:30am"]) {
			expect(readingItems(text)).toMatchObject([
				{ original: text, needsCheck: true },
			]);
		}
	});
	it("24시는 24:00만 시각이다(24:01~24:59는 시각이 아니다)", () => {
		expect(one("24:00").kind).toBe("time");
		for (const text of ["24:01", "24:59"])
			expect(readingItems(text).some((i) => i.kind === "time")).toBe(false);
	});
	it("분이 한 자리인 콜론(3:1, 1:1 상담)은 확인 필요", () => {
		for (const text of ["3:1", "1:1 상담"]) {
			expect(readingItems(text)).toHaveLength(1);
			expect(readingItems(text)[0]).toMatchObject({
				kind: "fraction",
				needsCheck: true,
				reason: "fraction",
			});
		}
	});
	it("1,000년 6월 3일은 천 년과 날짜로 나뉜다(000년으로 잘리지 않는다)", () => {
		expect(readingItems("1,000년 6월 3일").map((i) => i.original)).toEqual([
			"1,000년",
			"6월 3일",
		]);
	});
});

describe("결과 캐시", () => {
	it("같은 글이면 같은 배열을 돌려준다", () => {
		const text = "캐시 확인 3개와 12,500원";
		expect(readingItems(text)).toBe(readingItems(text));
		expect(readingItems("캐시 확인 4개")).not.toBe(readingItems(text));
	});
	it("적중한 글은 최근 사용으로 올라 가득 차도 오래된 것부터 버려진다", () => {
		// 캐시를 400개 채움 글로 비운 뒤(상한 400), 보존·오래됨 순으로 넣고 보존을 다시 쓴다
		for (let i = 0; i < 400; i++) readingItems(`LRU 비움 ${i}개`);
		const keep = readingItems("LRU 보존 1개");
		const old = readingItems("LRU 오래됨 1개");
		expect(readingItems("LRU 보존 1개")).toBe(keep);
		// 오래됨까지 밀려나는 399개를 더해도 최근에 쓴 보존은 남는다
		for (let i = 0; i < 399; i++) readingItems(`LRU 채움 ${i}개`);
		expect(readingItems("LRU 보존 1개")).toBe(keep);
		expect(readingItems("LRU 오래됨 1개")).not.toBe(old);
	});
});
