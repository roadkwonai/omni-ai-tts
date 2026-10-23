// apps/web/src/lib/paragraph-script.ts
import { familyOf } from "@tts-pilot-app/api/drama-acting";
import { sendText } from "@tts-pilot-app/api/paragraph-tags";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	normalizeText,
	PARAGRAPHS_MAX,
	type SettingsOf,
	studioTextMax,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";

import { sameSettings } from "./preset-view";
import { savedOf } from "./studio-view";
import { requestOf } from "./trial-view";

// 문단 작업실(T10 스펙 3절 문단 모델, 5.1 붙여 넣기·편집)의 순수 함수. 편집은 모두 새 배열을 돌려주고
// 바뀌지 않은 문단은 같은 객체다(카드가 다시 그려지지 않게, 계획 Global Constraints '입력 지연')

// 성우와 그 공급자 설정(TrialRequest와 같은 판별 모양)
export type VoiceSetup = {
	[P in ProviderId]: { provider: P; voiceId: string; settings: SettingsOf[P] };
}[ProviderId];
// gap·voice가 비면 작업의 기본 쉼·기본 성우를 따른다
export type Paragraph = {
	id: string;
	text: string;
	gap?: number;
	voice?: VoiceSetup;
};
// 작업(GLOSSARY '문단 제작 계획')
export type Work = {
	defaultVoice: VoiceSetup | null;
	gap: number;
	channelId: string | null;
	paragraphs: Paragraph[];
};
// 드라마 GAP_DEFAULT(0.3)와 다른 문단 쉼의 처음 값('스펙과 다른 점' 11)
export const PARAGRAPH_GAP_DEFAULT = 0.5;
// "empty"는 막는 이유가 아니다: 빈 문단은 만들기·받기에서 빠질 뿐이다
export type ParagraphBlock =
	| "empty"
	| "no_voice"
	| "unavailable"
	| { kind: "too_long"; length: number; max: number };

const newId = () => crypto.randomUUID();
const isBlank = (text: string) => text.trim() === "";
const SPACE = /\s/;
const SENTENCE_END = /[.!?。…]/;

// 빈 줄(공백만인 줄 포함) 하나 이상을 경계로 나눈 덩어리
export const splitBlocks = (raw: string) =>
	raw
		.replace(/\r\n?/g, "\n")
		.split(/\n\s*\n/)
		.map((block) => block.trim())
		.filter(Boolean);

// 앞 조각의 코드 포인트 수. window는 max개 + 다음 글자 하나(문장 끝 뒤 공백을 보려고)
function cutOf(window: readonly string[], max: number): number {
	for (let i = max; i > 0; i--) {
		const end = window[i - 1] ?? "";
		if (end === "\n" || (SENTENCE_END.test(end) && SPACE.test(window[i] ?? "")))
			return i;
	}
	for (let i = max; i > 0; i--) if (SPACE.test(window[i] ?? "")) return i;
	return max;
}
// 코드 포인트로 max 이하가 될 때까지 나눈다: max 안 마지막 문장 끝 → 마지막 공백 → 정확히 max(서로게이트를 가르지 않음)
export function splitLong(block: string, max: number): string[] {
	const chars = [...block.trim()];
	const pieces: string[] = [];
	let at = 0;
	while (chars.length - at > max) {
		const cut = at + cutOf(chars.slice(at, at + max + 1), max);
		pieces.push(chars.slice(at, cut).join("").trimEnd());
		at = cut;
		while (SPACE.test(chars[at] ?? "")) at++;
	}
	if (at < chars.length) pieces.push(chars.slice(at).join(""));
	return pieces;
}

// 붙여 넣은 글의 문단 글. max는 덩어리 하나의 상한이고, room개를 넘는 문단 수는 extra
export function pasteToTexts(
	raw: string,
	max: number,
	room: number,
): { texts: string[]; extra: number } {
	const all = splitBlocks(raw).flatMap((block) => splitLong(block, max));
	return {
		texts: all.slice(0, room),
		extra: Math.max(0, all.length - room),
	};
}

// 카드 대본 칸에 붙여 넣기(스펙 5.1). 덩어리가 둘 이상일 때만 가로챈다(아니면 null: 브라우저 기본 붙여 넣기와 되돌리기, E7).
// room은 200개까지 남은 자리다. 지금 카드는 자리를 쓰지 않으므로 글은 room + 1개까지 넣는다(적어도 1개: 지금 카드 글을 잃지 않게)
// shortcut: 커서 앞 글과 첫 덩어리를 그대로 잇는다(붙여 넣은 글 맨 앞 빈 줄은 경계로 보지 않는다), 사용자 테스트에서 어색하면 고친다
export function pasteAt(
	ps: Paragraph[],
	id: string,
	sel: { start: number; end: number },
	raw: string,
	max: number,
	room: number,
): { ps: Paragraph[]; extra: number } | null {
	const i = ps.findIndex((p) => p.id === id);
	const p = ps[i];
	if (!p || splitBlocks(raw).length < 2) return null;
	const { texts, extra } = pasteToTexts(raw, max, Math.max(0, room) + 1);
	const last = texts.length - 1;
	const cards = texts.map((text, k) => ({
		...p,
		id: k === 0 ? p.id : newId(),
		text: `${k === 0 ? p.text.slice(0, sel.start) : ""}${text}${k === last ? p.text.slice(sel.end) : ""}`,
	}));
	return { ps: [...ps.slice(0, i), ...cards, ...ps.slice(i + 1)], extra };
}

// 커서에서 나눈다. 뒤 문단은 성우·쉼 상태를 물려받는다. 200개면 그대로(브리프 6.1)
export function splitAt(
	ps: Paragraph[],
	id: string,
	caret: number,
): Paragraph[] {
	const i = ps.findIndex((p) => p.id === id);
	const p = ps[i];
	if (!p || ps.length >= PARAGRAPHS_MAX) return ps;
	return [
		...ps.slice(0, i),
		{ ...p, text: p.text.slice(0, caret) },
		{ ...p, id: newId(), text: p.text.slice(caret) },
		...ps.slice(i + 1),
	];
}

// 다음 문단과 합친다. 성우·설정은 앞 문단, 쉼은 뒤 문단('스펙과 다른 점' 26). caret은 이은 자리(UTF-16)
export function mergeNext(
	ps: Paragraph[],
	id: string,
): { ps: Paragraph[]; caret: number } | null {
	const i = ps.findIndex((p) => p.id === id);
	const a = ps[i];
	const b = ps[i + 1];
	if (!a || !b) return null;
	const head = a.text.trimEnd();
	const tail = b.text.trimStart();
	const text = head && tail ? `${head} ${tail}` : head + tail;
	return {
		ps: [...ps.slice(0, i), { ...a, text, gap: b.gap }, ...ps.slice(i + 2)],
		caret: text.length - tail.length,
	};
}

export function move(ps: Paragraph[], id: string, dir: -1 | 1): Paragraph[] {
	const i = ps.findIndex((p) => p.id === id);
	const a = ps[i];
	const b = ps[i + dir];
	if (!a || !b) return ps;
	const next = [...ps];
	next[i] = b;
	next[i + dir] = a;
	return next;
}

// 마지막 하나를 지우면 빈 문단 하나가 남는다(스펙 3절 '대본을 비우면 빈 카드 1장')
export function removeAt(ps: Paragraph[], id: string): Paragraph[] {
	const next = ps.filter((p) => p.id !== id);
	return next.length > 0 ? next : [{ id: newId(), text: "" }];
}

// 아래에 빈 문단(기본 성우·기본 쉼). 200개면 그대로
export function insertAfter(ps: Paragraph[], id: string): Paragraph[] {
	const i = ps.findIndex((p) => p.id === id);
	if (i < 0 || ps.length >= PARAGRAPHS_MAX) return ps;
	return [...ps.slice(0, i + 1), { id: newId(), text: "" }, ...ps.slice(i + 1)];
}

export const voiceOf = (p: Paragraph, work: Work): VoiceSetup | null =>
	p.voice ?? work.defaultVoice;

// 두 문단이 같은 공급자·성우·설정인가(Backspace 합치기 조건, 브리프 8절). 둘 다 성우가 없어도 같다
export function sameVoice(a: Paragraph, b: Paragraph, work: Work): boolean {
	const x = voiceOf(a, work);
	const y = voiceOf(b, work);
	if (!x || !y) return x === y;
	return (
		x.provider === y.provider &&
		x.voiceId === y.voiceId &&
		sameSettings(x.provider, x.settings, y.settings)
	);
}

// 성우 설정으로 그 성우가 받는 요청('스펙과 다른 점' 21). 담은 성우면 T5 requestOf로 맞춘다(드라마 lineRequest와 같은 서명).
// 보관함에서 빠진 성우는 맞추지 않은 요청(찾기에만 쓴다, 만들기는 blockOf가 막는다). 문단 요청·카드 설정 칸·기본 성우 설정 칸이 함께 쓴다
export function setupRequest(
	setup: VoiceSetup,
	voices: readonly SavedVoice[],
	text: string,
	now: number,
): StudioRequest {
	const saved = savedOf(voices, setup.voiceId, setup.provider);
	if (!saved) return { ...setup, text };
	return requestOf(
		saved.voice,
		text,
		{ ...DEFAULT_SETTINGS, [setup.provider]: setup.settings } as SettingsOf,
		now,
	);
}

// 그 성우·모델로 보낼 글: 받지 않는 태그를 뺀다(T10 스펙 15.2). 성우 설정·요청 모두 provider와 settings.model이 있다
const sendOf = (
	voice: { provider: ProviderId; settings: { model: string } },
	text: string,
) => sendText(familyOf(voice.provider, voice.settings.model), text);

// 빈 문단: 원문이 공백뿐이거나, 성우가 있고 보낼 글(태그를 뺀 글)이 빈다(스펙 15.2 '보낼 글이 비는 문단').
// 성우 설정의 모델로 본다. requestOf가 바꾸는 모델(Typecast v30↔v21, Fish 무료→유료)은 태그 판정이 같다
export function blankFor(p: Paragraph, work: Work): boolean {
	if (isBlank(p.text)) return true;
	const setup = voiceOf(p, work);
	return setup !== null && normalizeText(sendOf(setup, p.text)) === "";
}

// 문단 요청. 성우나 성우 목록이 아직 없거나 빈 문단(blankFor)이면 null. 글은 보낼 글이다(받지 않는 태그가 없으면 원문 그대로라 조합 키가 같다)
export function paragraphRequest(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[] | null,
	now: number,
): StudioRequest | null {
	const setup = voiceOf(p, work);
	if (!setup || !voices || blankFor(p, work)) return null;
	const request = setupRequest(setup, voices, p.text, now);
	return { ...request, text: sendOf(request, p.text) };
}

// 막는 이유(순서: 빈 문단 → 성우 없음 → 이용 불가 → 길이 초과). 길이는 대본 칸 글 그대로 잰다(스펙 15.2)
export function blockOf(
	p: Paragraph,
	work: Work,
	voices: readonly SavedVoice[],
): ParagraphBlock | null {
	if (blankFor(p, work)) return "empty";
	const setup = voiceOf(p, work);
	if (!setup) return "no_voice";
	const saved = savedOf(voices, setup.voiceId, setup.provider);
	if (!saved || saved.unavailable) return "unavailable";
	const long = tooLongOf(p.text, setup.provider);
	return long && { kind: "too_long", ...long };
}

// 계약 textSchemaOf와 같은 길이 판정: 원문 UTF-16이 상한 × 4를 넘거나 NFC·앞뒤 공백 정리 뒤 코드 포인트가 상한을 넘는다(T9-05)
export function tooLongOf(
	text: string,
	provider: ProviderId,
): { length: number; max: number } | null {
	const max = studioTextMax(provider);
	const length = codePoints(normalizeText(text));
	return length > max || text.length > max * 4 ? { length, max } : null;
}

// 문단 설정 바꾸기. 기본을 따르던 문단이면 기본 성우·설정을 복사해 자기 성우를 만든 뒤 바꾼다(스펙 3절). 성우가 없으면 그대로
export function ownSettings(
	p: Paragraph,
	work: Work,
	patch: Partial<Record<string, string | number | boolean>>,
): Paragraph {
	const setup = voiceOf(p, work);
	if (!setup) return p;
	return {
		...p,
		voice: {
			...setup,
			settings: { ...setup.settings, ...patch },
		} as VoiceSetup,
	};
}

// '기본 따르기': 자기 성우·설정을 지워 기본 성우를 따르게 한다(스펙 3절). 쉼은 그대로
export function followDefault(p: Paragraph): Paragraph {
	if (!p.voice) return p;
	const { voice: _, ...rest } = p;
	return rest;
}
