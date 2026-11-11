// apps/web/src/lib/script-speaker.ts
import { DRAMA_NAME_MAX } from "@tts-pilot-app/api/drama-script";
import {
	codePoints,
	normalizeText,
} from "@tts-pilot-app/api/providers/trial-options";

// 붙여 넣은 줄 한 줄의 '이름: 대사' 해석. 드라마 작업실과 문단 작업실이 같은 규칙을 쓴다(T10 스펙 17.1).
// 이름은 첫 콜론(: 또는 전각 ：) 앞이고 글자를 하나 이상 품은 20자 이하다(시각 '12:30 회의'는 화자가 아니다).
// 주소(콜론 바로 뒤가 //)도 화자가 아니다. 줄은 \r·\n으로만 나누므로 대사에 남는 U+2028·U+2029도 대사다([\s\S])
const LINE = /^([^:：]*)[:：]([\s\S]*)$/;
const LETTER = /\p{L}/u;

// 화자 이름 규칙: 정리한 이름이 글자를 하나 이상 품고 20자 이하면 그 이름, 아니면 null(임시 작업 읽기도 이 규칙을 쓴다)
export function speakerNameOf(raw: string): string | null {
	const name = normalizeText(raw);
	return LETTER.test(name) && codePoints(name) <= DRAMA_NAME_MAX ? name : null;
}

// 화자 줄이면 이름(정리한 글)과 콜론 뒤 글(원문 그대로, 대사 정리는 소비자가 한다), 아니면 null
export function speakerLine(
	row: string,
): { name: string; text: string } | null {
	const match = LINE.exec(row);
	const name = speakerNameOf(match?.[1] ?? "");
	const text = match?.[2] ?? "";
	return name === null || text.startsWith("//") ? null : { name, text };
}
