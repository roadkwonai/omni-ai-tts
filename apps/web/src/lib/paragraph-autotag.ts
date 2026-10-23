// apps/web/src/lib/paragraph-autotag.ts
import {
	ACTING,
	type ActingFamily,
	familyOf,
} from "@tts-pilot-app/api/drama-acting";
import {
	PARAGRAPH_TAG_ITEMS_MAX,
	PARAGRAPH_TAG_TOTAL_MAX,
	SEND_TAGS,
} from "@tts-pilot-app/api/paragraph-tags";
import {
	codePoints,
	normalizeText,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type {
	StudioAutoTagInput,
	StudioAutoTagOutput,
	StudioRequest,
} from "@tts-pilot-app/api/studio-contract";

import type { ParagraphStatus } from "./make-all";
import {
	blockOf,
	ownSettings,
	type Paragraph,
	voiceOf,
	type Work,
} from "./paragraph-script";
import { pressedEmotion, savedOf } from "./studio-view";
import { presetsOf } from "./trial-view";

// 문단 작업실 자동 태그 추천(T10 스펙 15.3)의 순수 함수: 보낼 문단, 묶음, 입력, 바뀐 문단, 바꾸기.
// 유료 호출(studioAutoTag)은 화면이 사용자 확인 뒤 묶음마다 차례로 부른다(자동 재시도 없음)

// 보낸 문단(그때의 문단 객체와 카드 번호). family는 보낼 요청의 공급자·모델로 정한다. own은 자기 성우가 있음
export type AutoTagTarget = {
	id: string;
	n: number;
	sent: Paragraph;
	request: StudioRequest;
	family: ActingFamily;
	emotions: string[] | null;
	result: "made" | "unknown" | null;
	own: boolean;
};
export type AutoTagChange = {
	id: string;
	n: number;
	result: "made" | "unknown" | null;
	own: boolean;
	family: ActingFamily;
	sent: Paragraph;
	// 바뀐 칸만: 대본은 정리한 제안 글, 설정은 ownSettings에 넘길 조각
	text: string | null;
	settings: Record<string, string | number> | null;
	fields: {
		field: "text" | "emotion" | "style" | "direction";
		before: string;
		after: string;
	}[];
};

// Typecast 성우가 받는 감정(드라마 actingOf와 같은 규칙: 그 성우·모델의 프리셋, v30은 smart도). 요청 모델은 requestOf가 성우 모델로 맞췄다
function emotionsOf(
	request: StudioRequest,
	voices: readonly SavedVoice[],
): string[] | null {
	if (request.provider !== "typecast") return null;
	const voice = savedOf(voices, request.voiceId, request.provider)?.voice;
	if (!voice) return null;
	const { model } = request.settings;
	const presets = presetsOf(voice, model);
	return model === "ssfm-v30" ? ["smart", ...presets] : presets;
}

// 보낼 문단: 막는 이유가 없고(빈 문단·성우 없음·이용 불가·길이 초과가 아님) 요청이 있으며 태그나 감정·말투를 받는다.
// skipped는 요청이 있는 ElevenLabs v2·flash 문단 수(미리 보기 '그대로 둬요')
export function autoTagTargets(
	paragraphs: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[],
	requestOf: (p: Paragraph) => StudioRequest | null,
	statusOf: (p: Paragraph) => ParagraphStatus,
): { targets: AutoTagTarget[]; skipped: number } {
	const targets: AutoTagTarget[] = [];
	let skipped = 0;
	for (const [i, p] of paragraphs.entries()) {
		const request = requestOf(p);
		if (!request) continue;
		const family = familyOf(request.provider, request.settings.model);
		if (family === "elevenlabs_plain") {
			skipped += 1;
			continue;
		}
		if (blockOf(p, work, voices) !== null) continue;
		const status = statusOf(p);
		targets.push({
			id: p.id,
			n: i + 1,
			sent: p,
			request,
			family,
			emotions: emotionsOf(request, voices),
			result: status === "made" || status === "unknown" ? status : null,
			own: p.voice !== undefined,
		});
	}
	return { targets, skipped };
}

// 보낼 문단이 하나라도 있는가(버튼 잠김 판정). autoTagTargets와 같은 조건이고 처음 대상에서 멈춘다(긴 대본에서 키 입력마다 모두 세지 않게)
export function hasAutoTagTarget(
	paragraphs: readonly Paragraph[],
	work: Work,
	voices: readonly SavedVoice[],
	requestOf: (p: Paragraph) => StudioRequest | null,
): boolean {
	return paragraphs.some((p) => {
		const request = requestOf(p);
		return (
			request !== null &&
			familyOf(request.provider, request.settings.model) !==
				"elevenlabs_plain" &&
			blockOf(p, work, voices) === null
		);
	});
}

// 계약의 합계와 같은 셈(NFC·앞뒤 공백 정리 뒤 코드 포인트)
const charsOf = (target: AutoTagTarget) =>
	codePoints(normalizeText(target.sent.text));

// 차례대로 나눈다. 한 묶음은 합계 2,000자·50문단까지(2,000자 문단은 혼자 한 묶음)
export function autoTagBatches(
	targets: readonly AutoTagTarget[],
): AutoTagTarget[][] {
	const batches: AutoTagTarget[][] = [];
	let total = 0;
	for (const target of targets) {
		const chars = charsOf(target);
		const last = batches.at(-1);
		if (
			last &&
			last.length < PARAGRAPH_TAG_ITEMS_MAX &&
			total + chars <= PARAGRAPH_TAG_TOTAL_MAX
		) {
			last.push(target);
			total += chars;
		} else {
			batches.push([target]);
			total = chars;
		}
	}
	return batches;
}

// 확인 창에 보이는 수: 문단 수와 호출(묶음) 수
export type AutoTagAsked = { paragraphs: number; calls: number };
export const autoTagAsked = (
	targets: readonly AutoTagTarget[],
): AutoTagAsked => ({
	paragraphs: targets.length,
	calls: autoTagBatches(targets).length,
});

// '추천 받기'를 누를 때 지금 대상이 창에 보인 수보다 많은가(사용자가 승인한 횟수보다 많이 보내지 않는다, security low 1). 같거나 적으면 보낸다
export const autoTagGrew = (asked: AutoTagAsked, now: AutoTagAsked) =>
	now.paragraphs > asked.paragraphs || now.calls > asked.calls;

const typecastFeel = (settings: TypecastSettings) => ({
	emotion: pressedEmotion(settings),
	intensity: settings.intensity,
});

// 묶음 하나의 입력. 글은 원문(받지 않는 태그도 둔다: 서버가 원래 태그가 남는지 본다), 말투 지시는 Gemini만,
// feel은 지금 감정·말투(Typecast 감정·강도, Airy 말투)
export function autoTagInputOf(
	batch: readonly AutoTagTarget[],
): StudioAutoTagInput {
	return {
		paragraphs: batch.map(
			({
				request,
				emotions,
				sent,
			}): StudioAutoTagInput["paragraphs"][number] => {
				const base = { emotions, text: sent.text, direction: "" };
				// 공급자마다 나눠야 공급자·모델 짝이 판별 유니온으로 타입 검사된다
				switch (request.provider) {
					case "typecast":
						return {
							...base,
							provider: "typecast",
							model: request.settings.model,
							feel: { typecast: typecastFeel(request.settings) },
						};
					case "airy":
						return {
							...base,
							provider: "airy",
							model: request.settings.model,
							feel: { airy: { style: request.settings.style } },
						};
					case "gemini":
						return {
							...base,
							provider: "gemini",
							model: request.settings.model,
							direction: request.settings.direction,
						};
					case "elevenlabs":
						return {
							...base,
							provider: "elevenlabs",
							model: request.settings.model,
						};
					// 남은 공급자는 fish_audio다(TS가 좁힌다)
					default:
						return {
							...base,
							provider: request.provider,
							model: request.settings.model,
						};
				}
			},
		),
	};
}

const labelOf = (family: ActingFamily, value: string) =>
	ACTING[family].feel.find((tag) => tag.value === value)?.label ?? value;
// 감정 글: 카탈로그 이름과 강도('기쁨 · 1.5'), 자동(smart)은 강도 없이 '자동'
const emotionText = (
	family: ActingFamily,
	feel: { emotion: string; intensity: number },
) =>
	feel.emotion === "smart"
		? labelOf(family, "smart")
		: `${labelOf(family, feel.emotion)} · ${feel.intensity}`;

// 미리 보기의 바뀐 문단(보낸 차례). 대본은 둘 다 정리해 견준다(서버는 원래 글만 입력 검사에서 정리하고 제안 글은 정리하지 않고 돌려준다, Review Focus 8).
// 감정은 보이는 글로 견준다(자동끼리 강도만 다른 제안은 바뀐 것이 아니다). 말투 지시는 앞뒤 공백을 빼고 견준다
export function autoTagChanges(
	batch: readonly AutoTagTarget[],
	reply: StudioAutoTagOutput,
): AutoTagChange[] {
	return batch.flatMap(
		({ id, n, result, own, family, sent, request }, i): AutoTagChange[] => {
			const next = reply.paragraphs[i];
			if (!next) return [];
			const fields: AutoTagChange["fields"] = [];
			let settings: AutoTagChange["settings"] = null;
			const before = normalizeText(sent.text);
			const after = normalizeText(next.text);
			if (after !== before) fields.push({ field: "text", before, after });
			switch (request.provider) {
				case "typecast": {
					const was = typecastFeel(request.settings);
					const now = next.feel?.typecast ?? was;
					const from = emotionText(family, was);
					const to = emotionText(family, now);
					if (to === from) break;
					fields.push({ field: "emotion", before: from, after: to });
					settings =
						now.emotion === "smart"
							? { emotion: "smart" }
							: {
									emotion: "preset",
									preset: now.emotion,
									intensity: now.intensity,
								};
					break;
				}
				case "airy": {
					const was = request.settings.style;
					const now = next.feel?.airy?.style ?? was;
					if (now === was) break;
					fields.push({
						field: "style",
						before: labelOf(family, was),
						after: labelOf(family, now),
					});
					settings = { style: now };
					break;
				}
				case "gemini": {
					const was = request.settings.direction;
					if (next.direction.trim() === was.trim()) break;
					fields.push({
						field: "direction",
						before: was,
						after: next.direction,
					});
					settings = { direction: next.direction };
					break;
				}
			}
			if (fields.length === 0) return [];
			const text = after !== before ? after : null;
			return [{ id, n, result, own, family, sent, text, settings, fields }];
		},
	);
}

// 미리 보기 '대본' 칸 조각(브리프 15.2, critique P1). mark는 새로 넣은 태그다
export type TagMark = { text: string; mark: boolean };

// 글의 태그와 그 자리. 자리는 태그 앞의 공백·태그가 아닌 글자 수라 넣기 공백(insertTagSpaced)이 달라도 같다.
// 전역 식이라 new RegExp로 복사해 matchAll한다(paragraph-tags SEND_TAGS)
function tagsAt(text: string) {
	const tags: { tag: string; index: number; key: string }[] = [];
	let from = 0;
	let at = 0;
	for (const { 0: tag, index } of text.matchAll(new RegExp(SEND_TAGS))) {
		at += text.slice(from, index).replace(/\s/g, "").length;
		tags.push({ tag, index, key: `${at} ${tag}` });
		from = index + tag.length;
	}
	return tags;
}

const take = (counts: Map<string, number>, key: string) => {
	const left = counts.get(key) ?? 0;
	if (left > 0) counts.set(key, left - 1);
	return left > 0;
};
const countOf = (keys: readonly string[]) => {
	const counts = new Map<string, number>();
	for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	return counts;
};

// after를 조각으로 나눈다. after 태그를 먼저 (자리, 값)으로 before 태그와 짝짓고, 남은 것끼리 값으로 짝짓는다(옮긴 원래 태그).
// 끝까지 남은 태그만 mark다(새 태그를 같은 값의 원래 태그 앞에 넣어도 새 태그에 붙는다). 그 밖의 글은 붙어 있으면 한 조각이다
export function newTagMarks(before: string, after: string): TagMark[] {
	const was = tagsAt(before);
	const now = tagsAt(after);
	const byKey = countOf(was.map(({ key }) => key));
	const moved = now.filter(({ key }) => !take(byKey, key));
	const byValue = countOf(
		was.filter(({ key }) => take(byKey, key)).map(({ tag }) => tag),
	);
	const fresh = new Set(moved.filter(({ tag }) => !take(byValue, tag)));
	const parts: TagMark[] = [];
	const push = (text: string, mark: boolean) => {
		if (!text) return;
		const last = parts.at(-1);
		if (last && !last.mark && !mark) last.text += text;
		else parts.push({ text, mark });
	};
	let from = 0;
	for (const item of now) {
		push(after.slice(from, item.index), false);
		push(item.tag, fresh.has(item));
		from = item.index + item.tag.length;
	}
	push(after.slice(from), false);
	return parts;
}

// 긴 글은 mark 조각마다 앞뒤 radius 글자(코드 포인트)만 남기고, 떨어진 구간 사이와 잘린 앞뒤는 "…" 조각으로 잇는다.
// 경계가 원래 태그 가운데면 그 태그를 통째로 남긴다(반쪽 태그를 보이지 않게). 전체가 radius×2 + 새 태그 길이 이하이거나 새 태그가 없으면 그대로다
export function excerptMarks(
	parts: readonly TagMark[],
	radius = 40,
): TagMark[] {
	const chars = parts.map((part) => [...part.text]);
	const spans: [number, number][] = [];
	let total = 0;
	let marked = 0;
	for (const [i, part] of parts.entries()) {
		const length = chars[i]?.length ?? 0;
		if (part.mark) {
			spans.push([total, total + length]);
			marked += length;
		}
		total += length;
	}
	if (marked === 0 || total <= radius * 2 + marked) return [...parts];
	const kept = new Array<boolean>(total).fill(false);
	for (const [start, end] of spans)
		kept.fill(true, Math.max(0, start - radius), end + radius);
	let offset = 0;
	for (const [i, part] of parts.entries()) {
		if (!part.mark)
			for (const { 0: tag, index } of part.text.matchAll(
				new RegExp(SEND_TAGS),
			)) {
				// 태그는 ASCII라 길이가 코드 포인트 수와 같다. 앞 글은 코드 포인트로 센다
				const start = offset + [...part.text.slice(0, index)].length;
				if (kept.slice(start, start + tag.length).includes(true))
					kept.fill(true, start, start + tag.length);
			}
		offset += chars[i]?.length ?? 0;
	}
	const shown: TagMark[] = [];
	let pos = 0;
	let cut = false;
	for (const [i, part] of parts.entries()) {
		let text = "";
		for (const char of chars[i] ?? []) {
			if (kept[pos]) {
				if (cut) shown.push({ text: "…", mark: false });
				cut = false;
				text += char;
			} else {
				if (text) shown.push({ text, mark: part.mark });
				text = "";
				cut = true;
			}
			pos += 1;
		}
		if (text) shown.push({ text, mark: part.mark });
	}
	if (cut) shown.push({ text: "…", mark: false });
	return shown;
}

// requestOf가 바꾸는 Typecast 모델(v30↔v21)은 같은 갈래로 본다: 성우 설정의 모델(지금)과 요청의 모델(보낼 때)이 달라도 같은 성우다
const kindOf = (family: ActingFamily) =>
	family.startsWith("typecast") ? "typecast" : family;

// '고른 문단 바꾸기': 고른 변경 가운데 보낸 뒤 그대로인 문단만 바꾼다. 문단 객체가 다르거나(글·성우·설정을 고침) 지웠거나,
// 기본 성우가 바뀌어 지금 성우의 family가 보낼 때와 다르면 건너뛰고 changed로 센다. 설정은 카드 설정 칸과 같은 ownSettings라
// 기본을 따르던 문단은 기본 성우 복사본에 제안을 더한 자기 성우가 된다. 바뀐 문단이 없으면 같은 배열
export function applyAutoTag(
	paragraphs: readonly Paragraph[],
	work: Work,
	changes: readonly AutoTagChange[],
	chosen: ReadonlySet<string>,
): { paragraphs: Paragraph[]; applied: number; changed: number } {
	const picked = new Map(
		changes
			.filter((change) => chosen.has(change.id))
			.map((change) => [change.id, change]),
	);
	let applied = 0;
	const next = paragraphs.map((p) => {
		const change = picked.get(p.id);
		if (!change || p !== change.sent) return p;
		const setup = voiceOf(p, work);
		if (
			!setup ||
			kindOf(familyOf(setup.provider, setup.settings.model)) !==
				kindOf(change.family)
		)
			return p;
		applied += 1;
		const edited = change.text === null ? p : { ...p, text: change.text };
		return change.settings
			? ownSettings(edited, work, change.settings)
			: edited;
	});
	return {
		// 바꾼 것이 없으면 부른 쪽이 그대로 둘 수 있게 같은 배열
		paragraphs: applied > 0 ? next : (paragraphs as Paragraph[]),
		applied,
		changed: picked.size - applied,
	};
}
