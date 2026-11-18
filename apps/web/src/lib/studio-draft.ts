// apps/web/src/lib/studio-draft.ts
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	AIRY_LANGUAGES,
	AIRY_MODELS,
	AIRY_STYLES,
	DEFAULT_SETTINGS,
	ELEVENLABS_MODELS,
	FISH_MODELS,
	GEMINI_DIRECTION_MAX,
	GEMINI_MODELS,
	PARAGRAPHS_MAX,
	RANGES,
	type SettingsOf,
	TRIAL_TAG_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";

import { PROVIDER_IDS, PROVIDER_LABEL } from "./connection-view";
import {
	type Decision,
	type LinkedScript,
	PARAGRAPH_GAP_DEFAULT,
	type Paragraph,
	SPEAKERS_MAX,
	type Speaker,
	type VoiceSetup,
	type Work,
} from "./paragraph-script";
import {
	changeLine,
	type LoadView,
	loadNotes,
	PRESET_TEXT,
	settingChanges,
} from "./preset-view";
import { speakerNameOf } from "./script-speaker";
import { GAP_MAX, gapOf } from "./sound-join";
import {
	inRange,
	pick,
	readSetup,
	STUDIO_TEXT,
	savedOf,
	typecastSettingsOf,
	UUID,
	VOICE_ID,
} from "./studio-view";
import { requestOf } from "./trial-view";

// 문단 작업실(T10)의 임시 작업 읽기·쓰기와 T9 임시 작업 옮기기(스펙 2절), 기본 성우 불러오기 비교.
// 키에 판을 붙이고 작업(Work)의 칸만 둔다(client-localstorage-schema). localStorage 접근과 try/catch는 화면이 한다

export const WORK_KEY = "tts-pilot:studio:v2:work";

const objectOf = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
// 계약 tagSchema·Gemini direction과 같은 규칙: 앞뒤 공백을 지운 뒤 상한 안이고 막는 글자가 없어야 한다(입력 칸 setting-fields.tsx와 같은 정규식)
const TAG_BAD = /[[\]\r\n]/;
const LINE_BREAK = /[\r\n]/;
const lineOf = (value: unknown, max: number, bad: RegExp) => {
	const text = typeof value === "string" ? value.trim() : null;
	return text !== null && text.length <= max && !bad.test(text) ? text : "";
};

// 저장해 둔 그 공급자 설정을 계약 범위로 칸마다 검사한다. 쓸 수 없는 칸만 처음 값이다(typecastSettingsOf를 다섯 공급자로, '스펙과 다른 점' 18)
export function settingsOf<P extends ProviderId>(
	provider: P,
	raw: unknown,
): SettingsOf[P] {
	const s = objectOf(raw) ?? {};
	const read = (): SettingsOf[ProviderId] => {
		switch (provider) {
			case "typecast":
				return typecastSettingsOf(raw);
			case "elevenlabs": {
				const base = DEFAULT_SETTINGS.elevenlabs;
				const ranges = RANGES.elevenlabs;
				return {
					model: pick(s.model, ELEVENLABS_MODELS, base.model),
					stability: inRange(s.stability, ranges.stability),
					similarity: inRange(s.similarity, ranges.similarity),
					style: inRange(s.style, ranges.style),
					speed: inRange(s.speed, ranges.speed),
					speakerBoost:
						typeof s.speakerBoost === "boolean"
							? s.speakerBoost
							: base.speakerBoost,
					tag: lineOf(s.tag, TRIAL_TAG_MAX, TAG_BAD),
				};
			}
			case "fish_audio":
				return {
					model: pick(s.model, FISH_MODELS, DEFAULT_SETTINGS.fish_audio.model),
					speed: inRange(s.speed, RANGES.fish_audio.speed),
					temperature: inRange(s.temperature, RANGES.fish_audio.temperature),
					tag: lineOf(s.tag, TRIAL_TAG_MAX, TAG_BAD),
				};
			case "airy": {
				const base = DEFAULT_SETTINGS.airy;
				return {
					model: pick(s.model, AIRY_MODELS, base.model),
					language: pick(s.language, AIRY_LANGUAGES, base.language),
					style: pick(s.style, AIRY_STYLES, base.style),
				};
			}
			default: // gemini
				return {
					model: pick(s.model, GEMINI_MODELS, DEFAULT_SETTINGS.gemini.model),
					direction: lineOf(s.direction, GEMINI_DIRECTION_MAX, LINE_BREAK),
				};
		}
	};
	return read() as SettingsOf[P];
}

// 쉼: 0~5초 수만(0.1초 단위로 맞춘다). 범위 밖이면 null(지운다)
const gapIn = (value: unknown) =>
	typeof value === "number" && value >= 0 && value <= GAP_MAX
		? gapOf(value)
		: null;
// 성우와 설정. 목록이 주어지면 그 공급자로 담은 성우일 때만(이용 불가여도 남긴다: 만든 결과를 찾아야 한다, '스펙과 다른 점' 16)
function setupOf(
	raw: unknown,
	voices: readonly SavedVoice[] | null,
): VoiceSetup | null {
	const s = objectOf(raw);
	const provider = PROVIDER_IDS.find((id) => id === s?.provider);
	const voiceId = s?.voiceId;
	if (!s || !provider || typeof voiceId !== "string" || !VOICE_ID.test(voiceId))
		return null;
	if (voices && !savedOf(voices, voiceId, provider)) return null;
	return {
		provider,
		voiceId,
		settings: settingsOf(provider, s.settings),
	} as VoiceSetup;
}

// 화자 목록. 이름은 붙여 넣기 줄 해석(speakerNameOf)과 같은 규칙으로 정리하고 중복·규칙 밖은 버리며 20명까지다.
// 성우는 setupOf로 읽는다(목록이 주어지면 보관함에 없는 성우는 null, 이름은 남긴다)
function speakersOf(
	raw: unknown,
	voices: readonly SavedVoice[] | null,
): Speaker[] {
	const speakers: Speaker[] = [];
	for (const item of Array.isArray(raw) ? raw : []) {
		const s = objectOf(item);
		const name = typeof s?.name === "string" ? speakerNameOf(s.name) : null;
		if (name === null || speakers.some((known) => known.name === name))
			continue;
		speakers.push({ name, voice: setupOf(s?.voice, voices) });
		if (speakers.length === SPEAKERS_MAX) break;
	}
	return speakers;
}

// 숫자 교정 결정 하나(T11 스펙 3절). 자리가 지금 글과 맞고(original), 선택이 알려진 값이며, 직접 입력은 비지 않아야 한다. 키 순서는 늘 같게 만든다(저장 글 비교가 순서에 흔들리지 않게)
function decisionOf(raw: unknown, text: string): Decision | null {
	const d = objectOf(raw);
	const { start, end, original, choice, reading } = d ?? {};
	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		typeof start !== "number" ||
		typeof end !== "number" ||
		start < 0 ||
		end <= start ||
		end > text.length ||
		typeof original !== "string" ||
		text.slice(start, end) !== original ||
		(choice !== "apply" && choice !== "keep" && choice !== "manual")
	)
		return null;
	if (choice === "keep") return { start, end, original, choice };
	if (reading === undefined && choice === "apply")
		return { start, end, original, choice };
	return typeof reading === "string" && reading.trim() !== ""
		? { start, end, original, choice, reading: reading.trim() }
		: null;
}
// 결정 목록. fixes.text가 지금 글과 다르거나 모양이 틀리면 null이고, 같은 자리의 중복은 첫 결정만 둔다. 남은 결정이 없으면 null
function fixesOf(raw: unknown, text: string): Paragraph["fixes"] | null {
	const f = objectOf(raw);
	if (!f || f.text !== text || !Array.isArray(f.decisions)) return null;
	const starts = new Set<number>();
	const decisions: Decision[] = [];
	for (const item of f.decisions) {
		const d = decisionOf(item, text);
		if (!d || starts.has(d.start)) continue;
		starts.add(d.start);
		decisions.push(d);
	}
	return decisions.length > 0 ? { text, decisions } : null;
}

// 깨진 JSON·문단 목록이 없거나 빈 값은 null(화면이 v1 옮기기나 처음 상태로 간다). 칸마다 검사해 깨진 칸만 버리거나 처음 값으로 둔다(drama readDraft와 같은 뜻).
// 상한을 넘는 글은 지우지 않는다(blockOf가 막는다)
export function readWork(
	raw: string | null,
	voices: readonly SavedVoice[] | null,
): Work | null {
	let stored: Record<string, unknown> | null;
	try {
		stored = objectOf(raw ? JSON.parse(raw) : null);
	} catch {
		return null;
	}
	const list = stored?.paragraphs;
	if (!stored || !Array.isArray(list) || list.length === 0) return null;
	// 화자 칸은 저장된 값이 배열일 때만 둔다(T10-a 임시 작업은 칸 없이 그대로, 0명 목록은 0명 그대로 읽어 저장 값과 같다)
	const speakers = Array.isArray(stored.speakers)
		? speakersOf(stored.speakers, voices)
		: null;
	const seen = new Set<string>();
	const paragraphs = list.slice(0, PARAGRAPHS_MAX).map((item) => {
		const p = objectOf(item);
		const id =
			typeof p?.id === "string" && VOICE_ID.test(p.id) && !seen.has(p.id)
				? p.id
				: crypto.randomUUID();
		seen.add(id);
		const gap = gapIn(p?.gap);
		const voice = setupOf(p?.voice, voices);
		// 목록에 없는 화자 이름은 화자 없음으로 읽는다
		const name =
			typeof p?.speaker === "string" ? speakerNameOf(p.speaker) : null;
		const speaker = name !== null && speakers?.some((s) => s.name === name);
		const text = typeof p?.text === "string" ? p.text : "";
		const fixes = fixesOf(p?.fixes, text);
		return {
			id,
			text,
			...(gap === null ? {} : { gap }),
			...(voice ? { voice } : {}),
			...(speaker ? { speaker: name } : {}),
			...(fixes ? { fixes } : {}),
		};
	});
	const id =
		typeof stored.id === "string" && VOICE_ID.test(stored.id)
			? stored.id
			: null;
	const linked = linkedOf(stored.linked);
	return {
		defaultVoice: setupOf(stored.defaultVoice, voices),
		gap: gapIn(stored.gap) ?? PARAGRAPH_GAP_DEFAULT,
		channelId:
			typeof stored.channelId === "string" && UUID.test(stored.channelId)
				? stored.channelId
				: null,
		paragraphs,
		...(speakers ? { speakers } : {}),
		...(id ? { id } : {}),
		...(linked ? { linked } : {}),
	};
}

// 작업 id와 연결된 대본(T12). 올바를 때만 두고 아니면 비운다. 새 id는 만들지 않는다(checkedWork가 두 번 읽어 견주므로 결정적이어야 한다)
const linkedOf = (raw: unknown): LinkedScript | null => {
	const l = objectOf(raw);
	const { scriptId, title, version, fingerprint } = l ?? {};
	return typeof scriptId === "string" &&
		UUID.test(scriptId) &&
		typeof title === "string" &&
		title.length >= 1 &&
		title.length <= 200 &&
		typeof version === "number" &&
		Number.isInteger(version) &&
		version >= 1 &&
		typeof fingerprint === "string" &&
		fingerprint.length >= 1 &&
		fingerprint.length <= 64
		? { scriptId, title, version, fingerprint }
		: null;
};

// 목록으로 읽을 때 비운 성우(보관함에 없음): 목록 없이 읽은 결과와 견준다. 문단·화자는 같은 자리끼리(readWork가 같은 순서로 읽는다). 깨진 raw는 비운 것이 없다
export function droppedVoices(
	raw: string | null,
	voices: readonly SavedVoice[],
): { defaultVoice: boolean; paragraphs: number; speakers: number } {
	const before = readWork(raw, null);
	const after = readWork(raw, voices);
	if (!before || !after)
		return { defaultVoice: false, paragraphs: 0, speakers: 0 };
	return {
		defaultVoice: before.defaultVoice !== null && after.defaultVoice === null,
		paragraphs: before.paragraphs.filter(
			(p, i) => p.voice && !after.paragraphs[i]?.voice,
		).length,
		speakers: (before.speakers ?? []).filter(
			(s, i) => s.voice && !after.speakers?.[i]?.voice,
		).length,
	};
}

export const writeWork = (work: Work) => JSON.stringify(work);

// 목록으로 읽어 보관함에 없는 성우를 비운 작업. 바뀐 것이 없으면 null이다.
// 화면 상태와 readWork는 키 순서가 달라 저장 글(raw)과 문자열로 견주면 늘 달라 보이므로, 목록 없이 읽은 결과와 견준다
export function checkedWork(
	raw: string,
	voices: readonly SavedVoice[],
): Work | null {
	const checked = readWork(raw, voices);
	const plain = readWork(raw, null);
	return checked && plain && writeWork(checked) !== writeWork(plain)
		? checked
		: null;
}

// T9 임시 작업(SCRIPT_KEY·SETUP_KEY 값)을 옮긴다. 대본은 나누지 않고 문단 1장이다(나누면 글이 달라져 T9 결과를 찾지 못한다, 스펙 2절)
export function migrateV1(
	script: string | null,
	setup: string | null,
): Work | null {
	if (script === null && setup === null) return null;
	const v1 = readSetup(setup);
	return {
		defaultVoice: v1.voiceId
			? { provider: "typecast", voiceId: v1.voiceId, settings: v1.settings }
			: null,
		gap: PARAGRAPH_GAP_DEFAULT,
		channelId: v1.channelId,
		paragraphs: [{ id: crypto.randomUUID(), text: script ?? "" }],
	};
}

// 프리셋의 성우를 기본 성우로 쓸 수 있으면 그 담은 성우(프리셋 공급자로 담았고 이용 가능). 아니면 null(자동 대체 없음)
export function usableDefaultVoice(
	preset: Pick<Preset, "provider" | "voice" | "unavailable">,
	voices: readonly SavedVoice[],
): SavedVoice | null {
	const saved =
		preset.voice && !preset.unavailable
			? savedOf(voices, preset.voice.voiceId, preset.provider)
			: null;
	return saved && !saved.unavailable ? saved : null;
}

const voiceLine = (from: string | null, to: string | null) =>
	`${from === null ? PRESET_TEXT.noVoice : `성우 ${from}`} → ${to ?? PRESET_TEXT.noVoice}`;
// 기본 성우 불러오기 창(T8 LoadView 모양, '스펙과 다른 점' 17): 공급자 줄 → 성우 줄 → 불러온 뒤 그 성우에서 듣는 설정.
// 공급자가 바뀌면 새 공급자의 처음 값과 비교한다. 쓸 수 없는 성우면 기본 성우를 비운다고 알린다(성우 없는 기본 성우는 설정도 없다)
export function workLoadView(
	preset: Preset,
	work: Pick<Work, "defaultVoice">,
	voices: readonly SavedVoice[],
	now = Date.now(),
): LoadView {
	const current = work.defaultVoice;
	const from = current
		? (savedOf(voices, current.voiceId, current.provider)?.voice ?? null)
		: null;
	const fromName = current ? (from?.name ?? current.voiceId) : null;
	const target = usableDefaultVoice(preset, voices)?.voice ?? null;
	if (!target)
		return {
			lead: null,
			changes: current ? [voiceLine(fromName, null)] : [],
			notes: [{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true }],
		};
	// 그 성우에서 듣는 값(presetSettingsOf와 같고 now를 넘긴다: Fish 무료 모델 종료)
	const heard = (voice: Voice, all: SettingsOf) =>
		requestOf(voice, "", all, now).settings;
	const same = current?.provider === preset.provider ? current : null;
	const before = same
		? from
			? heard(from, {
					...DEFAULT_SETTINGS,
					[same.provider]: same.settings,
				} as SettingsOf)
			: same.settings
		: heard(target, DEFAULT_SETTINGS);
	const after = heard(target, {
		...DEFAULT_SETTINGS,
		[preset.provider]: preset.settings,
	} as SettingsOf);
	return {
		lead: null,
		changes: [
			...(current && !same
				? [
						`공급자 ${PROVIDER_LABEL[current.provider]} → ${PROVIDER_LABEL[preset.provider]}`,
					]
				: []),
			...(same?.voiceId === target.voiceId
				? []
				: [voiceLine(fromName, target.name)]),
			...settingChanges(preset.provider, before, after).map(changeLine),
		],
		notes: loadNotes(target, preset, now),
	};
}
