// 숫자 놀이터(브리프 3·5절)의 계산. 작업실과 같은 읽기 엔진(readingItems)을 브라우저에서 그대로 부른다(서버 호출 없음).
// 발음용 글은 작업실 spokenPartsOf와 같은 규칙(앞 글이 글자·숫자로 끝나면 읽기를 띄어 붙이고 뒤 조사는 그대로)으로 만든다.
// spokenPartsOf가 든 paragraph-script는 서버 통신·성우 모듈을 끌어와 랜딩 번들에 크므로 이 규칙만 여기 둔다.
// 이 모듈은 상대 경로로 가져와 화면 없이 테스트한다
import { CHECK_REASON_TEXT } from "../../lib/landing-content";
import { readingItems } from "../../lib/number-reading";

export type ReadingPart = { text: string; changed: boolean };
export type ReadingView = {
	// 읽기 글. 바뀐 자리만 changed다. 빈 입력이면 빈 배열
	parts: ReadingPart[];
	// 읽기를 정한 항목 수
	count: number;
	// 확인 필요 항목과 이유 한 줄
	checks: { original: string; reason: string }[];
};

export function readingView(text: string): ReadingView {
	if (text.trim() === "") return { parts: [], count: 0, checks: [] };
	const items = readingItems(text);
	const parts: ReadingPart[] = [];
	let out = "";
	let at = 0;
	let count = 0;
	for (const item of items) {
		const reading = item.readings[0];
		// 작업실 '확실한 것'(isCertain)과 같은 기준: 확인 필요 항목과 후보가 없는 항목은 원문 그대로 두고 확인 필요 한 줄만 낸다
		if (item.needsCheck || !reading?.trim() || item.start < at) continue;
		const before = text.slice(at, item.start);
		const lead = /[A-Za-z0-9가-힣]$/.test(out + before) ? `${before} ` : before;
		if (lead) parts.push({ text: lead, changed: false });
		parts.push({ text: reading, changed: true });
		out += lead + reading;
		at = item.end;
		count += 1;
	}
	if (at < text.length) parts.push({ text: text.slice(at), changed: false });
	return {
		parts,
		count,
		checks: items.flatMap((item) =>
			item.needsCheck && item.reason
				? [{ original: item.original, reason: CHECK_REASON_TEXT[item.reason] }]
				: [],
		),
	};
}
