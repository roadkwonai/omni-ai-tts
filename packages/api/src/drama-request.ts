// packages/api/src/drama-request.ts
import {
	type ActingFamily,
	type ActingLine,
	applyLine,
	type Feel,
	familyOf,
	readText,
} from "./drama-acting";
import type { DramaItem } from "./drama-contract";
import {
	DRAMA_LINES_MAX,
	DRAMA_SPEAKERS_MAX,
	type DramaLine,
	type DramaModel,
	type DramaRequest,
	type DramaSettings,
	type DramaSpeaker,
} from "./drama-script";
import { savedOf } from "./paragraph-script";
import type { Preset, PresetValue } from "./preset-contract";
import type { ProviderId, Voice } from "./providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	GEMINI_DIRECTION_MAX,
	normalizeText,
	presetsOf,
	type SettingsOf,
	TRIAL_TEXT_MAX,
	type TrialRequest,
	requestOf as trialRequestOf,
	typecastModelsOf,
} from "./providers/trial-options";
import type { SavedVoice } from "./saved-voice-contract";
import { speakerLine } from "./script-speaker";

// 드라마 작업실(T9.5 스펙)의 순수 함수 가운데 웹과 CLI가 함께 쓰는 것: 화자 성우·설정·연기, 장면 요청, 읽기 줄 요청, 붙여 넣기.
// 화면 문구와 임시 작업은 웹(apps/web lib/drama-view)에 있다

// 화자는 다섯 공급자 성우(보관함) 또는 프리셋을 받는다(Part 2). presetId가 있으면 그 프리셋의 성우·설정이다
export type DraftSpeaker = {
	name: string;
	provider: ProviderId;
	voiceId: string | null;
	presetId: string | null;
};
// feel은 Typecast 감정·Airy 말투(Part 2). 없으면 화자 설정 그대로다.
// gap은 이 줄 뒤 쉼(초, 0.1 단위, 스펙 15절). 없으면 기본 쉼(Draft.gap)이고 요청에는 넣지 않는다
export type DraftLine = DramaLine & { id: string; feel?: Feel; gap?: number };

// 이름을 정하지 않은 화자의 기본 이름(요청에 들어가는 값, 번호는 1부터)
export const defaultSpeakerName = (i: number) => `화자 ${i}`;
// 화면에 보이는 화자 이름(줄 칩·성우 창 제목·붙여 넣기 결과·무대). 다듬은 이름, 비었거나 없는 화자는 번호 이름.
// 이름 뒤에는 받침 따라 바뀌는 조사를 붙이지 않는다(브리프 8절)
export const speakerNameOf = (
	speakers: readonly Pick<DraftSpeaker, "name">[],
	index: number,
) =>
	normalizeText(speakers[index]?.name ?? "") || defaultSpeakerName(index + 1);

// 성우 없는 새 화자. 공급자 처음 값은 Fish Audio다(성우 창 '전체'의 처음 공급자)
export const newSpeaker = (name: string): DraftSpeaker => ({
	name,
	provider: "fish_audio",
	voiceId: null,
	presetId: null,
});

// 그 공급자로 담은 성우이고 이용 가능(같은 id를 다른 공급자로 담았으면 아니다)
export const usableVoice = (
	voices: readonly SavedVoice[],
	voiceId: string | null,
	provider: ProviderId,
) => {
	const saved = savedOf(voices, voiceId, provider);
	return saved && !saved.unavailable ? saved.voice : null;
};
// 화자의 성우: 화자 공급자로 담은 이용 가능한 성우, 아니면 null
export const voiceOfSpeaker = (
	speaker: DraftSpeaker,
	saved: readonly SavedVoice[],
): Voice | null => usableVoice(saved, speaker.voiceId, speaker.provider);
// 렌더할 때 쓸 수 없는 성우·프리셋을 비운다. 초안(저장 값)은 그대로 둔다.
// 프리셋은 목록에 있고 이용 가능하며 그 성우(공급자·id)가 화자 성우와 같을 때만 남는다
export function usableSpeakers(
	speakers: readonly DraftSpeaker[],
	saved: readonly SavedVoice[],
	presets: readonly Preset[],
): DraftSpeaker[] {
	return speakers.map((speaker) => {
		const voiceId = voiceOfSpeaker(speaker, saved) ? speaker.voiceId : null;
		const preset = presets.find((item) => item.id === speaker.presetId);
		const presetId =
			preset &&
			!preset.unavailable &&
			preset.voice?.provider === speaker.provider &&
			preset.voice.voiceId === voiceId
				? preset.id
				: null;
		return voiceId === speaker.voiceId && presetId === speaker.presetId
			? speaker
			: { ...speaker, voiceId, presetId };
	});
}
// 화자의 설정 한 벌: 프리셋이면 그 공급자·설정 짝, 아니면 화자 공급자의 처음 설정.
// TS가 provider와 settings의 짝을 따라가지 못해 여기서 묶는다(preset-view presetSettingsOf와 같다)
export function speakerValue(
	speaker: DraftSpeaker,
	presets: readonly Preset[],
): PresetValue {
	const preset = presets.find((item) => item.id === speaker.presetId);
	return (
		preset
			? { provider: preset.provider, settings: preset.settings }
			: {
					provider: speaker.provider,
					settings: DEFAULT_SETTINGS[speaker.provider],
				}
	) as PresetValue;
}
// 쓰인 화자(줄의 화자)가 모두 Fish Audio인가. 장면 만들기는 이때만 된다
export const allFish = (
	speakers: readonly DraftSpeaker[],
	lines: readonly Pick<DramaLine, "speaker">[],
) => lines.every((line) => speakers[line.speaker]?.provider === "fish_audio");
// 화자의 연기 family·받는 감정(null이면 제한 없음)·모델. 모두 Fish면 Fish 화자는 머리 모델(장면), 아니면 화자 설정의 모델(읽기).
// Typecast는 성우가 가진 모델로 고치고 감정은 그 성우·모델이 받는 프리셋이다(v30은 smart도 받는다). 성우가 없으면 설정 그대로
export function actingOf(
	speaker: DraftSpeaker,
	voice: Voice | null,
	value: PresetValue,
	headerModel: DramaModel,
	fishOnly: boolean,
): { family: ActingFamily; emotions: string[] | null; model: string } {
	let model: string =
		fishOnly && speaker.provider === "fish_audio"
			? headerModel
			: value.settings.model;
	let emotions: string[] | null = null;
	if (speaker.provider === "typecast" && voice) {
		const models = typecastModelsOf(voice);
		const fixed = models.find((each) => each === model) ?? models[0];
		if (fixed) {
			model = fixed;
			const presets = presetsOf(voice, fixed);
			emotions = fixed === "ssfm-v30" ? ["smart", ...presets] : presets;
		}
	}
	return { family: familyOf(speaker.provider, model), emotions, model };
}

// 보낼 요청. usableSpeakers를 거친 초안을 받는다. 계약은 모든 화자에 성우를 받으므로 대본에 쓰인 화자만 보내고 번호를 다시 매긴다.
// 쓰인 화자가 모두 Fish Audio가 아니거나 성우가 없으면 null
export function requestOf(draft: {
	sceneName: string;
	speakers: DraftSpeaker[];
	lines: DramaLine[];
	model: DramaModel;
	settings: DramaSettings;
}): DramaRequest | null {
	if (!allFish(draft.speakers, draft.lines)) return null;
	const speakers: DramaSpeaker[] = [];
	const renumbered = new Map<number, number>();
	for (const index of [
		...new Set(draft.lines.map((line) => line.speaker)),
	].sort((a, b) => a - b)) {
		const speaker = draft.speakers[index];
		if (!speaker || speaker.voiceId === null) return null;
		renumbered.set(index, speakers.length);
		speakers.push({ name: speaker.name, voiceId: speaker.voiceId });
	}
	return {
		sceneName: draft.sceneName,
		speakers,
		lines: draft.lines.map(({ speaker, direction, text }) => ({
			speaker: renumbered.get(speaker) ?? 0,
			direction,
			text,
		})),
		model: draft.model,
		settings: draft.settings,
	};
}

// 줄 하나의 시험 생성 요청. 찾기(trialFindMany·trialFind)와 만들기(trialCreate)가 이 함수 하나로 요청을 만들어 저장된 줄을 놓치지 않는다.
// 성우별 보정(Typecast 모델·감정 좁히기, Fish 무료 기간)은 T5 requestOf가 한다
export function lineRequest(
	voice: Voice,
	value: PresetValue,
	family: ActingFamily,
	line: ActingLine,
	now = Date.now(),
): TrialRequest {
	return trialRequestOf(
		voice,
		readText(family, line).text,
		{
			...DEFAULT_SETTINGS,
			[value.provider]: applyLine(value, family, line).settings,
		} as SettingsOf,
		now,
	);
}

export type ReadLine = { id: string; request: TrialRequest; speaker: string };
export type ReadProblem = {
	kind: "voice" | "long" | "empty";
	lineId: string | null;
	speaker: number | null;
};

// 읽을 줄(fromId부터 끝까지, count면 그 수만큼)의 요청. 막는 이유는 그 범위만 본다(대본 전체 판정 allFish는 전체 줄). 순서는 화자 성우 없음 → 보낼 대사 200자 넘음 → 태그를 빼면 빈 대사 차례다(줄 차례보다 검사 차례가 먼저).
// speakers는 저장된 화자다. 렌더와 같게 usableSpeakers로 거른 뒤에만 성우·설정·연기 값을 읽는다.
// presets가 null이면 프리셋 목록을 받지 못했다: 저장된 프리셋이 있는 쓰인 화자는 성우 없음으로 막는다(사용자가 고르지 않은 처음 설정으로 유료 호출이 나가지 않게)
export function readRequests(
	speakers: readonly DraftSpeaker[],
	lines: readonly DraftLine[],
	ctx: {
		saved: readonly SavedVoice[];
		presets: readonly Preset[] | null;
		headerModel: DramaModel;
		now: number;
	},
	fromId: string,
	count?: number,
): { lines: ReadLine[] } | { problem: ReadProblem } {
	const from = lines.findIndex((line) => line.id === fromId);
	const range =
		from < 0
			? []
			: lines.slice(from, count === undefined ? undefined : from + count);
	const presets = ctx.presets ?? [];
	const usable = usableSpeakers(speakers, ctx.saved, presets);
	const voiceOf = (index: number) => {
		const speaker = usable[index];
		if (!speaker || (ctx.presets === null && speakers[index]?.presetId))
			return null;
		return voiceOfSpeaker(speaker, ctx.saved);
	};
	const missing = range
		.map((line) => line.speaker)
		.filter((index) => !voiceOf(index))
		.sort((a, b) => a - b)[0];
	if (missing !== undefined)
		return { problem: { kind: "voice", lineId: null, speaker: missing } };
	// 도구줄·자동 태그와 같은 family(DramaProvider.actingOf). Fish 화자의 두 family는 보낼 글이 같다
	const fishOnly = allFish(usable, lines);
	const read = range.flatMap((line): ReadLine[] => {
		const speaker = usable[line.speaker];
		const voice = voiceOf(line.speaker);
		if (!speaker || !voice) return [];
		const value = speakerValue(speaker, presets);
		const { family } = actingOf(
			speaker,
			voice,
			value,
			ctx.headerModel,
			fishOnly,
		);
		return [
			{
				id: line.id,
				speaker: speakerNameOf(usable, line.speaker),
				request: lineRequest(voice, value, family, line, ctx.now),
			},
		];
	});
	// Gemini 말투 지시는 글이 아니라 따로 가지만 공급자 계약 상한(100자)을 넘으면 요청이 통째로 거절된다
	const long = read.find(
		({ request }) =>
			codePoints(request.text) > TRIAL_TEXT_MAX ||
			(request.provider === "gemini" &&
				codePoints(request.settings.direction) > GEMINI_DIRECTION_MAX),
	);
	if (long)
		return { problem: { kind: "long", lineId: long.id, speaker: null } };
	const empty = read.find(({ request }) => request.text === "");
	if (empty)
		return { problem: { kind: "empty", lineId: empty.id, speaker: null } };
	return { lines: read };
}

// 줄 해석 '이름: 대사'는 문단 작업실과 공용(script-speaker.ts). 대사 정리(normalizeText)는 여기서만 한다
export type PasteResult =
	| { speakers: DraftSpeaker[]; lines: DraftLine[]; from: (number | null)[] }
	| { error: "too_many_speakers" | "too_many_lines" | "empty" };
// 대본 붙여 넣기 '바꾸기'(브리프 5.6 화자 규칙 1~7). 이름은 글자를 하나 이상 품고 20자 이하라 '12:30 회의야'는 이름 없는 줄이다.
// 이름이 나온 순서대로 화자를 새로 만들고, from[i]는 새 화자 i가 성우(공급자·성우·프리셋)를 잇는 지금 화자의 번호다(없으면 null, Ruling 18).
// 이름이 하나라도 겹치면 겹친 이름만, 하나도 안 겹치면 차례대로 잇는다. 이름이 하나도 없으면 지금 화자 그대로(from은 제자리).
// 이름 없는 줄은 앞 줄의 화자(첫 이름 앞이면 첫 화자). 빈 줄과 대사가 빈 이름 줄은 건너뛰고 화자도 만들지 않는다.
// 대사는 자르지 않고(301자도 그대로, 막는 이유가 말한다) 지시를 읽지 않는다(대사 속 [ ]·< >는 태그 그대로)
export function parsePaste(
	raw: string,
	speakers: readonly DraftSpeaker[],
	id: () => string,
): PasteResult {
	const names: string[] = [];
	const rows: { name: string | null; text: string }[] = [];
	for (const row of raw.split(/\r\n|\r|\n/)) {
		const line = speakerLine(row);
		const text = normalizeText(line ? line.text : row);
		if (text === "") continue;
		if (line && !names.includes(line.name)) names.push(line.name);
		rows.push({ name: line?.name ?? null, text });
	}
	if (names.length > DRAMA_SPEAKERS_MAX) return { error: "too_many_speakers" };
	if (rows.length > DRAMA_LINES_MAX) return { error: "too_many_lines" };
	if (rows.length === 0) return { error: "empty" };
	const lineOf = (speaker: number, text: string): DraftLine => ({
		id: id(),
		speaker,
		direction: "",
		text,
	});
	if (names.length === 0)
		return {
			speakers: [...speakers],
			lines: rows.map((row) => lineOf(0, row.text)),
			from: speakers.map((_, i) => i),
		};
	const current = speakers.map((speaker) => normalizeText(speaker.name));
	const overlap = names.some((name) => current.includes(name));
	const from = names.map((name, i) => {
		const at = overlap ? current.indexOf(name) : i;
		return at >= 0 && at < speakers.length ? at : null;
	});
	let speaker = 0;
	return {
		speakers: names.map((name, i) => {
			const carried = speakers[from[i] ?? -1];
			return carried
				? {
						name,
						provider: carried.provider,
						voiceId: carried.voiceId,
						presetId: carried.presetId,
					}
				: newSpeaker(name);
		}),
		lines: rows.map((row) => {
			if (row.name !== null) speaker = names.indexOf(row.name);
			return lineOf(speaker, row.text);
		}),
		from,
	};
}

// 대사별로 나눈 테이크: 완료이고 구간 수 = 줄 수
export const splitOk = (take: DramaItem) =>
	take.status === "done" && take.segments?.length === take.request.lines.length;
