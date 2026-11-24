// apps/web/src/lib/script-work.ts
import { PARAGRAPHS_MAX } from "@tts-pilot-app/api/providers/trial-options";

import {
	isBlank,
	type LinkedScript,
	type Paragraph,
	SPEAKERS_MAX,
	type Speaker,
	type VoiceSetup,
	type Work,
} from "./paragraph-script";
import { readWork, writeWork } from "./studio-draft";

// 대본 보관함(T12)의 작업 모델 순수 함수(계획 2.3). 서버 계약 타입은 쓰지 않고 작업 모양만 안다

// 서버에 저장하는 작업 모양: 채널은 칸 channel_id에 두고 id·linked는 임시 작업에만 있다
export type ScriptWork = Omit<Work, "id" | "linked" | "channelId">;

// FNV-1a 32비트(저장 안 됨 판정용 지문, 보안 용도 아님)
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

// 지문 = id·linked를 뺀 작업을 readWork로 정규화해(키 순서·태그 공백·쉼) 다시 쓴 글의 해시. 입력은 늘 channelId가 있는 Work다.
// 읽을 수 없는 빈 작업은 고정 값이다
export function fingerprintOf(work: Work): string {
	const { id: _id, linked: _linked, ...rest } = work;
	const read = readWork(writeWork(rest), null);
	return read ? fnv1a(writeWork(read)) : "empty";
}

export const dirtyOf = (
	work: Work,
	linked: LinkedScript | undefined,
): boolean =>
	linked !== undefined && fingerprintOf(work) !== linked.fingerprint;

export const nextIdOf = (work: Work): string => work.id ?? crypto.randomUUID();

// 작업을 바꿀 때: id를 채우고 linked는 작업 밖(linkedRef)에서 따로 돌려준다
export function afterReplace(
	next: Work,
	linked: LinkedScript | undefined,
): { work: Work; linked: LinkedScript | undefined } {
	const { linked: _linked, ...rest } = next;
	return { work: { ...rest, id: nextIdOf(next) }, linked };
}

export function toScriptWork(work: Work): ScriptWork {
	const { id: _id, linked: _linked, channelId: _channel, ...rest } = work;
	return rest;
}

export function fromScript(row: {
	kind: "saved" | "recent";
	workId: string | null;
	channelId: string | null;
	work: ScriptWork;
}): Work {
	return {
		...row.work,
		channelId: row.channelId,
		...(row.kind === "recent" && row.workId ? { id: row.workId } : {}),
	};
}

// 새 대본의 제목 처음 값: 첫 비지 않은 문단의 첫 문장(마침표·물음표·느낌표·줄바꿈 앞) 앞 100코드 포인트
export function firstSentenceTitle(paragraphs: readonly { text: string }[]) {
	const first = paragraphs.find((p) => p.text.trim() !== "")?.text.trim() ?? "";
	const sentence =
		first.match(/^[^\n]*?[.!?。！？](?=\s|$)|^[^\n]*/)?.[0] ?? "";
	return [...sentence.trim()].slice(0, 100).join("");
}

// 머리 메뉴 버튼의 제목(앞 max자, 넘치면 말줄임표). 전체는 title 속성이 맡는다
export function clipTitle(title: string, max: number) {
	const chars = [...title];
	return chars.length > max ? `${chars.slice(0, max).join("")}…` : title;
}

export function isBlankEnd(ps: readonly { text: string }[]): boolean {
	const end = ps.at(-1);
	return end !== undefined && isBlank(end.text);
}

const sameVoice = (a: VoiceSetup | null, b: VoiceSetup | null) =>
	a?.provider === b?.provider && a?.voiceId === b?.voiceId;

// 이어 넣기 창의 경고 셋(브리프 18.3). followDefault: 넣는 문단 가운데 자기 성우도 화자 성우도 없어 지금 기본 성우로 읽게 되는 수
// (기본 성우가 같으면 읽는 소리가 그대로라 0). overLimit·speakers는 appendWork의 dropped 그대로
export function appendNotes(target: Work, source: Work) {
	const { work, dropped } = appendWork(target, source);
	const added = work.paragraphs.slice(
		work.paragraphs.length - (source.paragraphs.length - dropped.paragraphs),
	);
	const followDefault = sameVoice(target.defaultVoice, source.defaultVoice)
		? 0
		: added.filter(
				(p) =>
					p.voice === undefined &&
					!(work.speakers ?? []).some((s) => s.name === p.speaker && s.voice),
			).length;
	return {
		followDefault,
		overLimit: dropped.paragraphs,
		speakers: dropped.speakers,
	};
}

// 이어 넣기로 더 넣을 수 있는 문단 수(끝 빈 문단은 그 자리에 들어가므로 센다)
export const appendRoom = (ps: Paragraph[]) =>
	Math.max(0, PARAGRAPHS_MAX - (isBlankEnd(ps) ? ps.length - 1 : ps.length));

// 이어 넣기: target 끝(끝 문단이 비었으면 그 자리)에 source 문단을 붙인다. dropped.paragraphs는 200개 상한으로 넣지 못한 수,
// dropped.speakers는 화자가 20명을 넘어 화자를 비운 문단 수
export function appendWork(
	target: Work,
	source: Work,
): { work: Work; dropped: { paragraphs: number; speakers: number } } {
	const base = isBlankEnd(target.paragraphs)
		? target.paragraphs.slice(0, -1)
		: target.paragraphs;
	const room = Math.max(0, PARAGRAPHS_MAX - base.length);
	const taken = source.paragraphs.slice(0, room);
	const speakers: Speaker[] = [...(target.speakers ?? [])];
	let cleared = 0;
	const added = taken.map((p): Paragraph => {
		const fresh = { ...p, id: crypto.randomUUID() };
		if (p.speaker === undefined || speakers.some((s) => s.name === p.speaker))
			return fresh;
		if (speakers.length >= SPEAKERS_MAX) {
			cleared++;
			const { speaker: _speaker, ...rest } = fresh;
			return rest;
		}
		speakers.push({
			name: p.speaker,
			voice: source.speakers?.find((s) => s.name === p.speaker)?.voice ?? null,
		});
		return fresh;
	});
	const grew = speakers.length !== (target.speakers?.length ?? 0);
	return {
		work: {
			...target,
			paragraphs: [...base, ...added],
			...(grew ? { speakers } : {}),
		},
		dropped: {
			paragraphs: source.paragraphs.length - taken.length,
			speakers: cleared,
		},
	};
}
