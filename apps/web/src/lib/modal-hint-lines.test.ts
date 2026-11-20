import {
	DRAMA_LINES_MAX,
	DRAMA_NAME_MAX,
} from "@tts-pilot-app/api/drama-script";
import { expect, test } from "vitest";

import { DRAMA_TEXT } from "./drama-view";
import { TOAST_TEXT } from "./studio-text";

// 모달 중 행동별 안내(MG-12)를 단 알림은 제목 + 안내가 세 줄까지다(MG-16). 가운데 대화상자 위 알림 자리(--toast-clearance 112px)가 세 줄 알림(약 96px)까지 담는다.
// 폭 어림(넘치게 잡는다, sonner 2.0.8 styles.css): 알림 356px − 안쪽 여백 16×2 − 테두리 1×2 = 322px. 글자 13px에서 한글·전각 1em(13px, Pretendard 한글은 1em보다 좁다),
// 띄어쓰기 4px, 그 밖(숫자·문장부호) 8px. 아이콘(오류·완료) 16 − 3 + 4 + 간격 6 = 23px. 행동 버튼은 12px 글자(한글 12, 띄어쓰기 4, 그 밖 7) + 좌우 8×2 + 간격 6.
// 줄 나눔은 body의 break-keep(띄어쓰기에서만) + 알림의 overflow-wrap:anywhere(한 줄보다 긴 낱말만 아무 데서나)다
const WIDE = /[ᄀ-ᇿ　-〿㄰-㆏가-힯＀-￯]/u;
const widthOf = (text: string, wide: number, other: number) =>
	[...text].reduce(
		(sum, ch) => sum + (ch === " " ? 4 : WIDE.test(ch) ? wide : other),
		0,
	);
const INNER = 356 - 16 * 2 - 1 * 2;
const ICON = 16 - 3 + 4 + 6;
const textWidth = (label: string, icon: boolean) =>
	INNER - (icon ? ICON : 0) - (widthOf(label, 12, 7) + 8 * 2 + 6);

function lineCount(text: string, max: number) {
	let count = 1;
	let used = 0;
	for (const word of text.split(" ")) {
		const w = widthOf(word, 13, 8);
		if (used > 0 && used + 4 + w <= max) {
			used += 4 + w;
			continue;
		}
		if (used > 0) count++;
		used = 0;
		for (const ch of word) {
			const c = widthOf(ch, 13, 8);
			if (used + c > max) {
				count++;
				used = 0;
			}
			used += c;
		}
	}
	return count;
}

test("줄 수 어림: 띄어쓰기에서 나누고, 한 줄보다 긴 낱말은 새 줄에서 시작해 아무 데서나 나눈다", () => {
	expect(lineCount("가나 다라", 60)).toBe(1);
	expect(lineCount("가나 다라", 40)).toBe(2);
	expect(lineCount("가 가나다라마바", 52)).toBe(3);
});

// 화자 이름은 저장 상한(DRAMA_NAME_MAX) 글자, 줄 번호는 줄 상한(DRAMA_LINES_MAX)으로 가장 긴 경우를 본다
const NAME = "가".repeat(DRAMA_NAME_MAX);
const LINE = DRAMA_LINES_MAX;
const CASES = [
	{
		titles: [DRAMA_TEXT.readVoiceBlock(NAME)],
		hint: DRAMA_TEXT.afterCloseVoice,
		label: DRAMA_TEXT.pickVoice,
		icon: true,
	},
	{
		titles: [
			DRAMA_TEXT.readLongBlock(LINE),
			DRAMA_TEXT.readEmptyBlock(LINE),
			DRAMA_TEXT.emptyLine(LINE),
		],
		hint: DRAMA_TEXT.afterCloseLine(LINE),
		label: DRAMA_TEXT.toLine(LINE),
		icon: true,
	},
	{
		titles: [DRAMA_TEXT.made],
		hint: DRAMA_TEXT.afterCloseStage,
		label: DRAMA_TEXT.toStage,
		icon: true,
	},
	{
		titles: [DRAMA_TEXT.multiLinePasted],
		hint: DRAMA_TEXT.afterClosePaste,
		label: DRAMA_TEXT.paste,
		icon: false,
	},
];

test("모달 중 안내를 단 드라마 알림은 가장 긴 화자 이름·줄 번호에서도 제목 + 안내가 세 줄 이하다(MG-16)", () => {
	for (const { titles, hint, label, icon } of CASES) {
		const max = textWidth(label, icon);
		for (const title of titles)
			expect(
				lineCount(title, max) + lineCount(hint, max),
				`${title} / ${hint}`,
			).toBeLessThanOrEqual(3);
	}
});

test("일반 안내(행동 대상이 없을 때)는 가장 좁은 알림 글 폭에서도 한 줄이다(제목은 두 줄까지 남는다)", () => {
	const narrowest = Math.min(
		...CASES.map(({ label, icon }) => textWidth(label, icon)),
	);
	expect(lineCount(TOAST_TEXT.closeModalFirst, narrowest)).toBe(1);
});
