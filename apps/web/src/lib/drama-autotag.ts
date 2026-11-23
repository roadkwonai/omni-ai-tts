// apps/web/src/lib/drama-autotag.ts
import type { ActingFamily } from "@tts-pilot-app/api/drama-acting";
import {
	type AutoTagChange,
	autoTagApply,
	directionSent,
} from "@tts-pilot-app/api/drama-autotag";
import {
	DRAMA_SCENE_MAX,
	sceneChars,
	sceneLimit,
} from "@tts-pilot-app/api/drama-script";
import { normalizeText } from "@tts-pilot-app/api/providers/trial-options";

import {
	DRAMA_TEXT,
	type DraftLine,
	type DraftSpeaker,
	scriptBlock,
} from "./drama-view";

// 입력·바뀐 줄·적용은 CLI와 함께 쓰는 공용 모듈에 있다(T20)
export {
	type AutoTagChange,
	type AutoTagSent,
	autoTagApply,
	autoTagChanges,
	autoTagInput,
} from "@tts-pilot-app/api/drama-autotag";

// 자동 태그 버튼을 잠그는 이유(브리프 14절 배치 6): 서버 계약이 거절할 이름·줄(scriptBlock)이 먼저, 그다음 대본 합계 2,000자.
// 화자가 섞여도 본다(dramaBlock은 섞이면 mixedBlock에서 멈춘다). 빈 대사 줄은 입력이 빼고 보내므로 건너뛰고,
// 대사가 하나도 없을 때만 보낼 줄이 없어 빈 줄 이유로 잠근다. 지시는 입력처럼 보낼 지시로 잰다(숨은 지시는 재지 않는다)
export function autoTagBlock(
	speakers: readonly DraftSpeaker[],
	lines: readonly DraftLine[],
	cast: (index: number) => { family: ActingFamily },
): ReturnType<typeof scriptBlock> {
	const directionOf = directionSent(speakers, cast);
	const sent = lines.map((line) => ({ ...line, direction: directionOf(line) }));
	const spoken = sent.some((line) => normalizeText(line.text) !== "");
	const script = scriptBlock(speakers, sent, spoken);
	if (script) return script;
	const chars = sceneChars(sent);
	return chars > DRAMA_SCENE_MAX
		? { text: DRAMA_TEXT.autoTagLong(chars), target: null }
		: null;
}

// 미리 보기 안내: 바꿀 값 없음, 받지 않는 줄 수, 그리고 모두 Fish면 모두 바꾼 결과가 장면 상한(속도 < 1이면 2,000자보다 낮다)을
// 넘을 때 지금 막는 이유(tooLong)를 미리 알린다('스펙과 다른 점' 23). lines는 지금 줄이다
export function autoTagNotes(
	changes: readonly AutoTagChange[],
	skipped: number,
	lines: readonly DraftLine[],
	fishOnly: boolean,
	speed: number,
): string[] {
	const notes: string[] = [];
	if (changes.length === 0) notes.push(DRAMA_TEXT.autoTagNone);
	if (skipped > 0) notes.push(DRAMA_TEXT.autoTagSkipped(skipped));
	if (fishOnly) {
		const chars = sceneChars(autoTagApply(lines, changes).lines);
		const limit = sceneLimit(speed);
		if (chars > limit) notes.push(DRAMA_TEXT.tooLong(limit, chars, speed));
	}
	return notes;
}
