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
	STUDIO_TEXT_MAX,
	studioTextMax,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";

import { sameSettings } from "./preset-view";
import { speakerLine } from "./script-speaker";
import { savedOf } from "./studio-view";
import { requestOf } from "./trial-view";

// 문단 작업실(T10 스펙 3절 문단 모델, 5.1 붙여 넣기·편집)의 순수 함수. 편집은 모두 새 배열을 돌려주고
// 바뀌지 않은 문단은 같은 객체다(카드가 다시 그려지지 않게, 계획 Global Constraints '입력 지연')

// 성우와 그 공급자 설정(TrialRequest와 같은 판별 모양)
export type VoiceSetup = {
	[P in ProviderId]: { provider: P; voiceId: string; settings: SettingsOf[P] };
}[ProviderId];
// gap·voice가 비면 작업의 기본 쉼·기본 성우를 따른다
// speaker는 작업 화자 목록(Work.speakers)에 있는 이름이고, 없는 이름은 화자 없음으로 본다(followOf·readWork)
export type Paragraph = {
	id: string;
	text: string;
	gap?: number;
	voice?: VoiceSetup;
	speaker?: string;
};
// 화자(GLOSSARY): 이름과 성우(비면 기본 성우를 따른다). 화자 이름은 생성 요청에 들지 않는다
export type Speaker = { name: string; voice: VoiceSetup | null };
// 작업(GLOSSARY '문단 제작 계획'). speakers는 선택 칸이라 T10-a 임시 작업도 그대로 읽힌다
export type Work = {
	defaultVoice: VoiceSetup | null;
	gap: number;
	channelId: string | null;
	paragraphs: Paragraph[];
	speakers?: Speaker[];
};
export const SPEAKERS_MAX = 20;
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

// 붙여 넣은 글의 화자 조각(T10 스펙 17.1). 빈 줄 덩어리 안에서 화자 줄(speakerLine)마다 새 조각을 시작하고, 이름 없는 줄은 앞 조각에 줄바꿈으로 이어 붙는다.
// 덩어리의 첫 화자 줄 앞 줄들(덩어리 전체가 이름 없는 경우 포함)은 앞 덩어리의 마지막 화자를 이은 조각이고, 첫 덩어리면 화자가 없다.
// named는 화자 줄로 시작한 조각이다. 화자 줄이 없으면 조각은 덩어리 그대로라 글이 T10-a와 같다. 대사가 빈 화자 줄은 건너뛴다
type Segment = { text: string; speaker?: string; named: boolean };
function segmentsOf(raw: string): Segment[] {
	const out: Segment[] = [];
	let last: string | undefined;
	for (const block of splitBlocks(raw)) {
		let lines: string[] = [];
		let speaker = last;
		let named = false;
		const flush = () => {
			const text = lines.join("\n").trim();
			if (text)
				out.push({
					text,
					...(speaker === undefined ? {} : { speaker }),
					named,
				});
		};
		for (const row of block.split("\n")) {
			const line = speakerLine(row);
			if (!line) {
				lines.push(row);
				continue;
			}
			flush();
			lines = [line.text];
			speaker = last = line.name;
			named = true;
		}
		flush();
	}
	return out;
}
type Part = { text: string; speaker?: string };
// 조각을 그 화자의 상한(maxOf)으로 문장 끝에서 더 나눈다. long은 더 나뉜 조각의 수
function partsOf(
	segments: readonly Segment[],
	maxOf: (speaker?: string) => number,
): { all: Part[]; long: number } {
	let long = 0;
	const all = segments.flatMap(({ text, speaker }) => {
		const pieces = splitLong(text, maxOf(speaker));
		if (pieces.length > 1) long += 1;
		return pieces.map((piece) =>
			speaker === undefined ? { text: piece } : { text: piece, speaker },
		);
	});
	return { all, long };
}
const namesOf = (parts: readonly Part[]) => [
	...new Set(parts.flatMap((part) => part.speaker ?? [])),
];

// 붙여 넣은 글의 문단 조각(글과 화자). maxOf는 그 화자가 따르는 성우의 상한(speakerMax), room개를 넘는 조각 수는 extra.
// names는 들어가는 조각의 화자 이름(나온 순서), long은 상한 때문에 더 나뉜 조각 수(미리 보기)
export function pasteToParts(
	raw: string,
	maxOf: (speaker?: string) => number,
	room: number,
): { parts: Part[]; names: string[]; extra: number; long: number } {
	const { all, long } = partsOf(segmentsOf(raw), maxOf);
	const parts = all.slice(0, room);
	return {
		parts,
		names: namesOf(parts),
		extra: Math.max(0, all.length - room),
		long,
	};
}

const maxOfVoice = (voice: VoiceSetup | null) =>
	voice ? studioTextMax(voice.provider) : STUDIO_TEXT_MAX;
// 그 화자가 따르는 성우의 글자 상한(화자 성우 → 기본 성우, 목록에 없는 새 이름은 기본 성우). 화자가 없으면 기본 성우
export const speakerMax = (work: Followed, name?: string) =>
	maxOfVoice(
		name === undefined
			? work.defaultVoice
			: (work.speakers?.find((s) => s.name === name)?.voice ??
					work.defaultVoice),
	);

export type PasteAtResult = {
	ps: Paragraph[];
	extra: number;
	// 더한 화자 목록(바뀐 것이 없으면 null)
	speakers: Speaker[] | null;
	// 조각 하나만 가로채 화자만 정한 경우 그 이름(알림 '화자를 민수로 정했어요')
	named: string | null;
	// 문단 배열은 그대로이고 알림만 띄운다: 화자 20명 상한을 넘음 / 문단 200개 자리가 없음
	blocked: "speakers" | "full" | null;
};
// 카드 대본 칸에 붙여 넣기(스펙 5.1, T10-b 계획 2.3). 화자 줄은 늘 문단의 처음이다.
// 가로채는 때: 조각(빈 줄 덩어리·화자 줄)이 둘 이상이거나, 커서 앞 글이 비고 첫 줄이 화자 줄일 때. 아니면 null(브라우저 기본 붙여 넣기와 되돌리기, E7. 글 가운데 `시간: 3시` 한 줄 포함).
// 첫 조각이 지금 카드에 합쳐지는 때(커서 앞 글이 비었거나 첫 조각이 화자 없음): 지금 카드가 첫 조각이 되고(화자 조각이면 그 화자, 자기 성우 비움), 지금 카드는 자리를 쓰지 않아 조각은 room + 1개까지다.
// 커서 앞 글이 있고 첫 조각이 화자 조각이면 지금 카드는 앞 글만 남기고 모든 조각이 새 카드라 room개까지다(0이면 blocked full).
// 새 카드는 쉼을 지금 카드에서 잇는다. 화자 조각의 카드는 성우 없이 그 화자를 따르고, 화자 없는 조각의 카드는 지금 카드의 화자·성우를 잇는다. 커서 뒤 글은 마지막 조각에 붙는다.
// maxOf는 화자 조각은 그 화자가 따르는 성우의 상한, 화자 없는 조각은 지금 카드의 voiceOf 상한이다. 화자는 기존 목록 ∪ 새 이름이 20명을 넘으면 blocked speakers
// shortcut: 커서 앞 글과 첫 덩어리를 그대로 잇는다(붙여 넣은 글 맨 앞 빈 줄은 경계로 보지 않는다), 사용자 테스트에서 어색하면 고친다
export function pasteAt(
	ps: Paragraph[],
	id: string,
	sel: { start: number; end: number },
	raw: string,
	work: Followed,
	room: number,
): PasteAtResult | null {
	const i = ps.findIndex((p) => p.id === id);
	const p = ps[i];
	if (!p) return null;
	const segments = segmentsOf(raw);
	const before = p.text.slice(0, sel.start);
	const blankBefore = before.trim() === "";
	if (segments.length < 2 && !(blankBefore && segments[0]?.named)) return null;
	const { all } = partsOf(segments, (speaker) =>
		speaker === undefined
			? maxOfVoice(voiceOf(p, work))
			: speakerMax(work, speaker),
	);
	const lead = all[0]?.speaker !== undefined;
	// 첫 조각이 지금 카드에 합쳐진다
	const merge = blankBefore || !lead;
	const parts = all.slice(0, Math.max(0, room) + (merge ? 1 : 0));
	const none = { ps, extra: all.length, speakers: null, named: null };
	if (parts.length === 0) return { ...none, blocked: "full" };
	const list = work.speakers ?? [];
	const added = speakersAdd(list, namesOf(parts));
	if (!added) return { ...none, blocked: "speakers" };
	const last = parts.length - 1;
	const cards = parts.map((part, k) => {
		const text = `${k === 0 && merge && part.speaker === undefined ? before : ""}${part.text}${k === last ? p.text.slice(sel.end) : ""}`;
		// 화자 조각의 카드는 자기 성우 없이 그 화자를 따른다. 화자 없는 조각은 지금 카드의 상태를 잇는다
		const base =
			part.speaker === undefined
				? p
				: { ...followDefault(p), speaker: part.speaker };
		return { ...base, id: k === 0 && merge ? p.id : newId(), text };
	});
	const next = merge ? cards : [{ ...p, text: before }, ...cards];
	const extra = all.length - parts.length;
	return {
		ps: [...ps.slice(0, i), ...next, ...ps.slice(i + 1)],
		extra,
		speakers: added === list ? null : added,
		// 지금 카드가 화자 조각 하나만 되는 경우(다 들어갔을 때)
		named:
			merge && parts.length === 1 && extra === 0
				? (parts[0]?.speaker ?? null)
				: null,
		blocked: null,
	};
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

type Followed = Pick<Work, "defaultVoice" | "speakers">;
// 문단 화자의 성우(목록에 없는 이름·성우 없는 화자는 null)
const speakerVoice = (p: Paragraph, work: Followed): VoiceSetup | null =>
	(p.speaker !== undefined &&
		work.speakers?.find((s) => s.name === p.speaker)?.voice) ||
	null;
// 문단이 자기 성우가 없을 때 따르는 성우: 화자 성우 → 기본 성우(T10-b 계획 2.1). 실제 성우를 셈하지 않는 화면 곳이 이것을 쓴다
export const followOf = (p: Paragraph, work: Followed): VoiceSetup | null =>
	speakerVoice(p, work) ?? work.defaultVoice;
// 따르는 성우가 화자 것이면 그 화자 이름(카드 '화자 따르기'·접근 이름), 아니면 null
export const followedSpeaker = (p: Paragraph, work: Followed): string | null =>
	speakerVoice(p, work) ? (p.speaker ?? null) : null;
// 실제 성우: 문단 자기 성우 → 화자 성우 → 기본 성우. 요청·상태·사용량이 모두 이것을 거친다
export const voiceOf = (p: Paragraph, work: Followed): VoiceSetup | null =>
	p.voice ?? followOf(p, work);

// 화자 목록에 없는 이름만 끝에 더한다(지우지 않는다: 되돌리기가 문단 배열 하나만 되돌려도 이름이 남게, 계획 2.2).
// 같은 이름 화자는 성우를 그대로 둔다. 더할 것이 없으면 같은 목록 객체, 기존 목록 ∪ 새 이름이 20명을 넘으면 null
export function speakersAdd(
	list: Speaker[],
	names: readonly string[],
): Speaker[] | null {
	const fresh = [...new Set(names)].filter(
		(name) => !list.some((s) => s.name === name),
	);
	if (fresh.length === 0) return list;
	return list.length + fresh.length > SPEAKERS_MAX
		? null
		: [...list, ...fresh.map((name) => ({ name, voice: null }))];
}
// 지운 화자를 이름·성우·자리 그대로 되살린다(화자 지우기 '되돌리기'). 자리는 목록 안으로 맞춘다.
// 그 이름이 이미 있거나(그 사이 붙여 넣기가 다시 더했다) 20명이 찼으면 같은 목록 객체
// shortcut: 20명이 차서 되살리지 못해도 알리지 않는다(10초 안에 붙여 넣기로 19명 이상이 되는 드문 경우), 겪으면 알림을 더한다
export function speakerRestore(
	list: Speaker[],
	speaker: Speaker,
	at: number,
): Speaker[] {
	if (list.length >= SPEAKERS_MAX || list.some((s) => s.name === speaker.name))
		return list;
	const to = Math.min(Math.max(at, 0), list.length);
	return [...list.slice(0, to), speaker, ...list.slice(to)];
}
export const speakerParagraphCount = (ps: readonly Paragraph[], name: string) =>
	ps.filter((p) => p.speaker === name).length;
// 문단이 없어 지울 수 있는 화자 수(상한 안내 '문단이 없는 화자 N명을 지우면 넣을 수 있어요')
export const idleSpeakerCount = (
	list: readonly Speaker[],
	ps: readonly Paragraph[],
) => list.filter((s) => speakerParagraphCount(ps, s.name) === 0).length;

// 일괄 작업(GLOSSARY '일괄 작업', 계획 2.4): 고른 문단(ids)만 고친 새 배열. 고르지 않은 문단·바뀌지 않은 문단은 같은 객체이고,
// 바뀐 것이 없으면 같은 배열이다(edit이 알림을 띄우지 않는다). 화자 목록은 바꾸지 않는다
function batch(
	ps: Paragraph[],
	ids: ReadonlySet<string>,
	fn: (p: Paragraph) => Paragraph,
): Paragraph[] {
	let changed = false;
	const next = ps.map((p) => {
		const out = ids.has(p.id) ? fn(p) : p;
		if (out !== p) changed = true;
		return out;
	});
	return changed ? next : ps;
}
export const batchVoice = (
	ps: Paragraph[],
	ids: ReadonlySet<string>,
	setup: VoiceSetup,
) => batch(ps, ids, (p) => (p.voice === setup ? p : { ...p, voice: setup }));
export const batchFollow = (ps: Paragraph[], ids: ReadonlySet<string>) =>
	batch(ps, ids, followDefault);
// name이 없으면 화자 없음(칸 자체를 지운다)
export const batchSpeaker = (
	ps: Paragraph[],
	ids: ReadonlySet<string>,
	name: string | undefined,
) =>
	batch(ps, ids, (p) => {
		if (p.speaker === name) return p;
		const { speaker: _, ...rest } = p;
		return name === undefined ? rest : { ...rest, speaker: name };
	});
export const batchGap = (
	ps: Paragraph[],
	ids: ReadonlySet<string>,
	gap: number,
) => batch(ps, ids, (p) => (p.gap === gap ? p : { ...p, gap }));
// 모두 지우면 빈 카드 1장(removeAt과 같은 규칙)
export function batchRemove(
	ps: Paragraph[],
	ids: ReadonlySet<string>,
): Paragraph[] {
	if (!ps.some((p) => ids.has(p.id))) return ps;
	const next = ps.filter((p) => !ids.has(p.id));
	return next.length > 0 ? next : [{ id: newId(), text: "" }];
}

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
