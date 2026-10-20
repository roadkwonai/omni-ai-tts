// apps/web/src/lib/studio-view.ts
import { ORPCError } from "@orpc/client";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	comboSignature,
	DEFAULT_SETTINGS,
	EMOTION_PRESETS,
	type EmotionPreset,
	normalizeText,
	partsOf,
	RANGES,
	type Range,
	type SettingsOf,
	STUDIO_TEXT_MAX,
	snap,
	type TrialRequest,
	TYPECAST_MODELS,
	type TypecastModel,
	type TypecastSettings,
	V21_PRESETS,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type {
	StudioItem,
	StudioResult,
} from "@tts-pilot-app/api/studio-contract";

import {
	changeLine,
	fixedNote,
	type LoadView,
	loadNotes,
	PRESET_TEXT,
	presetSettingsOf,
	settingChanges,
} from "./preset-view";
import {
	emotionLabel,
	LANGUAGE_LABEL,
	optionText,
	presetsOf,
	requestOf,
	resultWhen,
	settingsSummary,
	type TrialProblem,
	trialFailureOf,
	trialProblemText,
	usageText,
} from "./trial-view";
import { plain, retryTime } from "./voice-view";

// 음성 작업실의 화면 문구와 계산(T9 스펙 4·5절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문구는 브리프(docs/briefs/studio.md 8절)가 정본이다. 이름 뒤에 조사를 붙이지 않는다. 크레딧이 쓰였을 수 있으면 "다시 해 주세요"라고 하지 않는다

export const STUDIO_TEXT = {
	title: "음성 작업실",
	description:
		"대본과 담아 둔 Typecast 성우로 한국어 음성을 만들고 내려받아요.",
	loopback: "이 주소에서는 음성 작업실을 쓸 수 없어요",
	channel: "채널",
	noChannel: "채널 없음",
	toClasses: "채널·분류에서 만들기",
	paragraph: "문단 1",
	pickVoice: "성우 고르기",
	pickVoiceDescription:
		"성우 보관함에 담은 Typecast 성우예요. 최근에 쓴 성우, 즐겨찾기 순이에요.",
	noVoices: "담은 Typecast 성우가 없어요",
	toCasting: "성우 캐스팅에서 담기",
	voicesFailed: "담은 성우를 불러오지 못했어요",
	reload: "다시 불러오기",
	settings: "설정",
	settingsNeedVoice: "성우를 고르면 설정을 바꿀 수 있어요",
	reset: "처음 값으로",
	palette: "감정",
	scriptLabel: "대본",
	scriptPlaceholder: "음성으로 만들 대본을 써 주세요",
	barLabel: "음성 만들기와 결과",
	noResult: "음성을 만들면 여기서 들을 수 있어요",
	download: "내려받기",
	make: "음성 만들기",
	openSaved: "저장된 결과 열기",
	making: "만드는 중",
	makingStatus: "음성을 만드는 중이에요",
	made: "음성을 만들었어요.",
	opened: "저장된 결과를 열었어요. 크레딧은 쓰지 않았어요.",
	// 한 줄 칸 도움 줄(같은 조합의 결과가 있을 때)
	savedCost: "같은 대본·성우·설정은 저장된 결과를 열어요 · 크레딧 0",
	// 한 줄 칸 도움 줄(같은 조합의 결과가 이미 플레이어에 있을 때, 주 버튼은 outline, critique P2-3)
	shownSame: "지금 대본의 결과가 플레이어에 있어요 · 크레딧 0",
	connections: "연결 상태 보기",
	results: "이전 결과",
	resultsFailed: "이전 결과를 불러오지 못했어요",
	play: "재생",
	remove: "지우기",
	removeQuestion: "이 결과를 지울까요?",
	removeDetail:
		"지우면 이 결과를 다시 듣거나 내려받을 수 없어요. 공급자 사용 기록은 그대로예요.",
	removing: "지우는 중이에요",
	removed: "결과를 지웠어요.",
	unknownBadge: "처리 여부 미확인",
	unknownNote: "늦게 도착하면 여기서 완료로 바뀌어요",
	// 다시 받는 창(6분)이 지난 미확인 줄의 셋째 줄(critique P1-b). 크레딧이 쓰였을 수 있어 다시 하라고 하지 않는다
	unknownExpired:
		"확인 시간이 지났어요. 크레딧 사용 여부는 Typecast 사용 기록에서 확인해 주세요",
	presetVoiceUnusable: "프리셋의 성우를 쓸 수 없어요. 성우를 골라 주세요",
	voiceRejected:
		"이 성우는 보관함에 없거나 현재 이용 불가예요. 성우를 다시 골라 주세요",
	inProgress: "다른 생성이 진행 중이에요. 끝난 뒤 다시 눌러 주세요",
	// 조각 받기 실패(찾을 수 없음 말고). 생성 오류 줄과 따로 알림으로 보인다(계획 '스펙과 다른 점' 17)
	receiveFailed:
		"결과를 받지 못했어요. 잠시 뒤 이전 결과에서 다시 열어 주세요. 크레딧은 들지 않아요.",
	receiving: "결과를 받는 중이에요",
	// 주 버튼 글자, 줄 버튼 접근 이름 끝
	receivingShort: "결과를 받는 중",
	// 만드는 중 20초 뒤 한 줄 칸
	waitNote: "공급자 응답을 기다리고 있어요. 다시 누르지 않아도 돼요",
	// 미확인 오류 줄(T5 문구 대신)과 그 링크 버튼
	unknownOutcome:
		"처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 다시 누르기 전에 이전 결과를 확인해 주세요",
	toResults: "이전 결과 보기",
	unknownUsage: "사용 여부 미확인",
	shownBadge: "플레이어에 있음",
	resultsCap: "최근 20개까지 보여요",
	close: "닫기",
	emotionFixed: "이 성우는 감정을 바꿀 수 없어요",
	// 감정 표식 접근 이름 끝("감정 · 기쁨 바꾸기")
	markAction: "바꾸기",
	// 작업실 불러오기 알림(캐스팅은 T8 loadedMessage 그대로)
	presetLoaded: (name: string) => `‘${name}’ 프리셋을 불러왔어요.`,
} as const;

// 감정 팔레트 뱃지 값: Typecast 자동 감정(v30만) 또는 요청 열거형의 감정
export type EmotionValue = "smart" | EmotionPreset;
// 뱃지 설명(브리프 8절). 감정 태그 리서치 2절의 Typecast 감정 설명을 짧게 옮겼다
export const EMOTION_NOTE: Record<EmotionValue, string> = {
	smart: "대본 내용을 보고 감정을 정해요",
	normal: "기본 톤으로 읽어요",
	happy: "밝고 들뜬 톤으로 읽어요",
	sad: "가라앉은 톤으로 읽어요",
	angry: "화난 톤으로 읽어요",
	whisper: "속삭이듯 읽어요",
	toneup: "목소리 톤을 높여 읽어요",
	tonedown: "목소리 톤을 낮춰 읽어요",
};

export type TypecastRequest = Extract<TrialRequest, { provider: "typecast" }>;
// 이 성우에서 실제로 보내는 요청(T5 requestOf의 성우 맞춤 뒤). 작업실 성우는 늘 Typecast다
export const studioRequestOf = (voice: Voice, text: string, all: SettingsOf) =>
	requestOf(voice, text, all) as TypecastRequest;

// 대본 글자 수는 서버와 같게 NFC·앞뒤 공백 정리 뒤 코드 포인트로 센다
export const scriptCount = (text: string) => codePoints(normalizeText(text));
export const countText = (text: string) =>
	`${plain.format(scriptCount(text))} / ${plain.format(STUDIO_TEXT_MAX)}자`;

// '음성 만들기'를 막는 이유(스펙 4절 순서). 없으면 null. 2,000자를 넘어도 입력은 막지 않는다(붙여 넣은 글이 잘리지 않게).
// '다른 생성이 진행 중이에요'는 서버 거절 뒤 오류 줄이다(계획 '스펙과 다른 점' 6)
export function studioBlock(input: {
	voice: Pick<SavedVoice, "unavailable"> | null;
	text: string;
	retryAt: string | null;
}): string | null {
	if (!input.voice) return "성우를 골라 주세요";
	const count = scriptCount(input.text);
	if (count === 0) return "대본을 먼저 써 주세요";
	if (count > STUDIO_TEXT_MAX)
		return `${plain.format(STUDIO_TEXT_MAX)}자 이하로 줄여 주세요 (지금 ${plain.format(count)}자)`;
	if (input.voice.unavailable)
		return "이 성우는 지금 쓸 수 없어요. 다른 성우를 골라 주세요";
	if (input.retryAt)
		return `${retryTime(input.retryAt)} 이후에 다시 만들 수 있어요`;
	return null;
}

const emotionName = (value: EmotionValue) =>
	value === "smart" ? "자동" : emotionLabel(value);
// 감정 팔레트(스펙 2절): '자동'(v30만) + 그 성우·모델의 emotions와 요청 열거형의 교집합(presetsOf)
export function emotionBadges(
	voice: Voice,
	model: TypecastModel,
): { value: EmotionValue; label: string }[] {
	const values: EmotionValue[] = presetsOf(voice, model);
	return (model === "ssfm-v30" ? ["smart" as const, ...values] : values).map(
		(value) => ({ value, label: emotionName(value) }),
	);
}
// 지금 눌린 뱃지. settings는 성우 맞춤 뒤 요청의 설정이다(v21은 늘 직접 감정)
export const pressedEmotion = (settings: TypecastSettings): EmotionValue =>
	settings.model === "ssfm-v30" && settings.emotion === "smart"
		? "smart"
		: settings.preset;
// 뱃지를 누르면 바뀌는 칸. 대본에 글자를 넣지 않는다(Typecast는 요청 필드로 감정을 받는다)
export function emotionPatch(
	model: TypecastModel,
	value: EmotionValue,
): Partial<TypecastSettings> {
	if (value === "smart") return { emotion: "smart" };
	return model === "ssfm-v30"
		? { emotion: "preset", preset: value }
		: { preset: value };
}
// 감정 맞춤 줄(브리프 5.4): 저장한 설정(stored)과 성우 맞춤 뒤 요청 설정(sent)의 눌린 감정이 다를 때만. 저장 값은 그대로 둔다
export function emotionShift(
	stored: TypecastSettings,
	sent: TypecastSettings,
): string | null {
	const from = pressedEmotion(stored);
	const to = pressedEmotion(sent);
	return from === to
		? null
		: `감정 ${emotionName(from)} → ${emotionName(to)} (이 성우·모델에서 쓰는 값)`;
}
// 카드 머리줄의 감정 표식: 기본값과 다를 때만(v30 '자동', v21 '기본'이면 없음)
export function emotionMark(settings: TypecastSettings): string | null {
	const pressed = pressedEmotion(settings);
	if (pressed === "smart") return null;
	if (settings.model === "ssfm-v21" && pressed === "normal") return null;
	return emotionLabel(pressed);
}
// 감정 글자("감정 기쁨", 확인 창 설정 요약과 같은 말)
const emotionPart = (preset: string) => {
	const { label, value } = optionText("typecast", "preset", preset);
	return `${label} ${value}`;
};
// 이전 결과 줄의 설정(critique P1-a): 확인 창 요약(settingsSummary)에서 처음 값인 모델(ssfm-v30)과 감정(카드 감정 표식이 없는 값)을 뺀다.
// 같은 대본을 다른 감정·속도로 만든 결과를 가른다. 모두 처음 값이면 null. Typecast 요약의 각 값에는 ' · '가 없다
export function settingsNote(request: TypecastRequest): string | null {
	const emotion =
		emotionMark(request.settings) === null
			? emotionPart(request.settings.preset)
			: null;
	const parts = settingsSummary(request)
		.split(" · ")
		.filter(
			(part) => part !== DEFAULT_SETTINGS.typecast.model && part !== emotion,
		);
	return parts.length > 0 ? parts.join(" · ") : null;
}

// 고를 수 있는 성우: 담은 Typecast 성우를 최근 사용 순 → 즐겨찾기 → 담은 순(서버 목록 순서)으로. 이용 불가도 보인다(흐리게, 못 고름)
export function pickableVoices(items: readonly SavedVoice[]): SavedVoice[] {
	const lastUsed = (item: SavedVoice) =>
		item.lastUsedAt ? Date.parse(item.lastUsedAt) : 0;
	// sort는 안정 정렬이라 같으면 담은 순이 남는다
	return items
		.filter((item) => item.voice.provider === "typecast")
		.sort(
			(a, b) =>
				lastUsed(b) - lastUsed(a) || Number(b.favorite) - Number(a.favorite),
		);
}
// 임시 작업의 성우 id를 담은 Typecast 성우에서만 되살린다(스펙 2절 '임시 작업')
export const savedOf = (
	items: readonly SavedVoice[],
	voiceId: string | null,
): SavedVoice | null =>
	items.find(
		(item) =>
			item.voice.provider === "typecast" && item.voice.voiceId === voiceId,
	) ?? null;
export const usageLine = (item: SavedVoice, now: Date) =>
	item.lastUsedAt
		? `최근 사용 ${resultWhen(item.lastUsedAt, now)} · ${plain.format(item.useCount)}회`
		: null;
// 이전 결과의 성우 이름. 보관함에서 빠졌으면 성우 id를 보인다
export const voiceNameOf = (items: readonly SavedVoice[], voiceId: string) =>
	savedOf(items, voiceId)?.voice.name ?? voiceId;

// 담은 성우 목록의 받기 상태. 첫 받기 실패는 실패 횟수로 본다: 데이터 없이 다시 받으면 TanStack 5.103 fetchState가
// status를 pending·error를 null로 되돌려, isPending·isLoadingError로 보면 다시 받는 동안 실패가 '받는 중'으로 바뀐다(QA-1)
export type ListLoad = "loading" | "failed" | "ready";
export const listLoad = (query: {
	data: unknown;
	errorUpdateCount: number;
}): ListLoad =>
	query.data !== undefined
		? "ready"
		: query.errorUpdateCount > 0
			? "failed"
			: "loading";

// 파일 이름에 못 쓰는 글자(Windows·macOS 공통), 공백(줄바꿈 포함), 제어 문자(C0·C1), 형식 문자(RLO 같은 방향 바꿈, 폭 없는 공백)는 '_'로 바꾼다
const BAD_NAME = /[\\/:*?"<>|\s\p{Cc}\p{Cf}]/gu;
const safeName = (text: string) => text.replace(BAD_NAME, "_");
const two = (value: number) => String(value).padStart(2, "0");
// 결과를 만든 시각의 한국 시간(일광 절약 없음)
function kstStamp(iso: string): string {
	const at = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
	return `${at.getUTCFullYear()}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}-${two(at.getUTCHours())}${two(at.getUTCMinutes())}`;
}
// 내려받는 파일 이름(스펙 2절): {성우 이름}_{대본 앞 20자}_{YYYYMMDD-HHmm}.mp3
export const downloadName = (
	voiceName: string,
	text: string,
	createdAt: string,
) =>
	`${safeName(voiceName)}_${safeName([...normalizeText(text)].slice(0, 20).join(""))}_${kstStamp(createdAt)}.mp3`;

export const firstLine = (text: string) =>
	normalizeText(text).split("\n")[0] ?? "";
// 이전 결과 둘째 줄: 언제 · 성우 · (처음 값이 아닌 설정) · 크레딧(추정). 미확인이면 크레딧이 쓰였는지 모른다고 덧붙인다(브리프 5.8, critique P1-a)
export function studioResultLine(
	item: Pick<StudioItem, "createdAt" | "usage" | "status" | "request">,
	voiceName: string,
	now: Date,
): string {
	const note = settingsNote(item.request);
	return `${resultWhen(item.createdAt, now)} · ${voiceName}${note ? ` · ${note}` : ""} · ${usageText(item.usage)}${item.status === "unknown" ? ` · ${STUDIO_TEXT.unknownUsage}` : ""}`;
}

// 이 브라우저의 임시 작업(스펙 2절). 키에 판을 붙이고 필요한 칸만 둔다(client-localstorage-schema). 대본은 입력마다, 나머지는 바뀔 때 쓴다
export const SCRIPT_KEY = "tts-pilot:studio:v1:script";
export const SETUP_KEY = "tts-pilot:studio:v1:setup";
type Setup = {
	voiceId: string | null;
	channelId: string | null;
	settings: TypecastSettings;
};

const pick = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);
const inRange = (value: unknown, range: Range) =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	value >= range.min &&
	value <= range.max
		? snap(value, range)
		: range.default;
// 저장해 둔 Typecast 설정을 계약 범위로 칸마다 검사한다(T5 typecastSettingsSchema와 같은 규칙). apps/web은 zod를 쓰지 않아 trial-options의 값 상수로 본다.
// 쓸 수 없는 칸만 처음 값으로 바꾸고 나머지는 지킨다. 프리셋을 읽는 T8 readSettings와 같은 뜻이다(사용자가 고친 값을 한 칸 때문에 모두 잃지 않게, 계획 리뷰 P10).
// 감정 모드 두 값은 trial-options에 상수가 없어(계약의 z.enum) 글자로 둔다. 언어는 화면 이름표(LANGUAGE_LABEL)의 열쇠를 쓴다
function typecastSettingsOf(raw: unknown): TypecastSettings {
	const stored =
		raw !== null && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const base = DEFAULT_SETTINGS.typecast;
	const ranges = RANGES.typecast;
	const model = pick(stored.model, TYPECAST_MODELS, base.model);
	const preset = pick(stored.preset, EMOTION_PRESETS, base.preset);
	return {
		model,
		emotion: pick(stored.emotion, ["smart", "preset"] as const, base.emotion),
		// v21은 넷만 받는다(계약 refine)
		preset:
			model === "ssfm-v30" || V21_PRESETS.includes(preset)
				? preset
				: base.preset,
		intensity: inRange(stored.intensity, ranges.intensity),
		language: pick(
			stored.language,
			Object.keys(LANGUAGE_LABEL) as (keyof typeof LANGUAGE_LABEL)[],
			base.language,
		),
		tempo: inRange(stored.tempo, ranges.tempo),
		pitch: inRange(stored.pitch, ranges.pitch),
		volume: inRange(stored.volume, ranges.volume),
	};
}
const VOICE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 깨진 값·모양이 다른 값은 처음 값이다. 성우는 담은 성우 목록과 다시 맞춘다(savedOf), 채널은 채널 목록과 맞춘다(화면)
export function readSetup(raw: string | null): Setup {
	let stored: Record<string, unknown> = {};
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
			stored = parsed as Record<string, unknown>;
	} catch {
		// 깨진 값은 처음 값으로 시작한다
	}
	return {
		voiceId:
			typeof stored.voiceId === "string" && VOICE_ID.test(stored.voiceId)
				? stored.voiceId
				: null,
		channelId:
			typeof stored.channelId === "string" && UUID.test(stored.channelId)
				? stored.channelId
				: null,
		settings: typecastSettingsOf(stored.settings),
	};
}

// 결과 오디오를 조각으로 받아 하나로 합친다(스펙 2절 A안). 0번 조각이 보관을 늘리므로 먼저 받고, 서버 부담을 줄이려 차례로 받는다
export async function fetchAudio(
	bytes: number,
	part: (index: number) => Promise<Blob>,
): Promise<Blob> {
	const parts: Blob[] = [];
	for (let index = 0; index < partsOf(bytes); index += 1)
		parts.push(await part(index));
	return new Blob(parts, { type: "audio/mpeg" });
}

// 프리셋의 성우를 쓸 수 있으면 그 성우(담은 Typecast 성우이고 이용 불가 아님). 아니면 null(자동 대체 없음, 스펙 2절)
export const usablePresetVoice = (
	preset: Pick<Preset, "provider" | "voice" | "unavailable">,
) =>
	preset.provider === "typecast" && preset.voice && !preset.unavailable
		? preset.voice
		: null;
const voiceChange = (from: Voice | null, to: Voice | null) =>
	from
		? `성우 ${from.name} → ${to?.name ?? PRESET_TEXT.noVoice}`
		: `${PRESET_TEXT.noVoice} → ${to?.name ?? PRESET_TEXT.noVoice}`;
// 작업실 불러오기 창(스펙 2절): 성우와 설정을 함께 바꾼다. 바뀌는 값은 성우 줄 → 불러온 뒤 그 성우에서 듣는 설정.
// 프리셋 성우를 쓸 수 없으면 성우 칸을 비운다고 알린다(자동 대체 없음). '설정만' 첫 줄은 없다
export function studioLoadView(
	current: Voice | null,
	all: SettingsOf,
	preset: Preset,
): LoadView {
	const target = usablePresetVoice(preset);
	const next = { ...all, typecast: preset.settings } as SettingsOf;
	const from = current ? presetSettingsOf(current, all).settings : all.typecast;
	const to = target ? presetSettingsOf(target, next).settings : preset.settings;
	const fixed = fixedNote(preset);
	return {
		lead: null,
		changes: [
			...(current?.voiceId === target?.voiceId
				? []
				: [voiceChange(current, target)]),
			...settingChanges("typecast", from, to).map(changeLine),
		],
		notes: target
			? loadNotes(target, preset)
			: [
					{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true },
					...(fixed ? [fixed] : []),
				],
	};
}
// 서버가 처리 전에 거절한 코드(입력 검사, CSRF, 소유자 없음). 공급자에 닿지 않았다(계획 재리뷰 R4·N3)
const BEFORE_PROVIDER = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"]);
// 생성 실패의 화면 사유. 서버 사유가 없는 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)는 크레딧이 쓰였을 수 있어 처리 여부 미확인으로 본다
// (스펙 5절 '응답 상태를 받지 못함', tts-provider, 계획 리뷰 E1). 처리 전 거절은 그대로 '만들지 못했어요'다. 찾기·조각 받기는 유료가 아니라 이 함수를 쓰지 않는다
export function createFailureOf(error: unknown): TrialProblem {
	const problem = trialFailureOf(error);
	if (problem.reason !== "unexpected") return problem;
	return error instanceof ORPCError && BEFORE_PROVIDER.has(error.code)
		? problem
		: { ...problem, reason: "unknown_outcome" };
}

// 늦은 결과가 보고 있는 화면에서도 완료로 바뀌게(스펙 8절 7번, 계획 '스펙과 다른 점' 16). 만든 지 6분 안의 미확인 줄이 있으면 15초마다 다시 받는다.
// 요청 300초 뒤 결과는 오지 않는다(Node fetch 응답 머리 300초, 저장 여유 1분)
const LATE_WINDOW_MS = 6 * 60 * 1000;
const LATE_REFETCH_MS = 15_000;
const lateWaiting = (createdAt: string, now: number) =>
	now - Date.parse(createdAt) < LATE_WINDOW_MS;
export function unknownRefetch(
	items: readonly Pick<StudioItem, "status" | "createdAt">[] | undefined,
	now: number,
): number | false {
	return items?.some(
		(item) => item.status === "unknown" && lateWaiting(item.createdAt, now),
	)
		? LATE_REFETCH_MS
		: false;
}
// 미확인 줄 셋째 줄(critique P1-b): 다시 받는 창 안이면 늦은 도착 안내, 지나면 사용 기록에서 확인하라는 안내(다시 받기가 멈추는 때와 같다)
export const unknownNoteOf = (createdAt: string, now: Date) =>
	lateWaiting(createdAt, now.getTime())
		? STUDIO_TEXT.unknownNote
		: STUDIO_TEXT.unknownExpired;

// 플레이어에 올린 결과의 캡션·접근 이름(디자인 리뷰 D3 초안): {성우} · (처음 값이 아닌 감정) · {대본 첫 줄 앞 20자}(뒤가 더 있으면 …).
// 감정은 카드 감정 표식과 같은 기준이다(critique P1-a). 캡션은 한 줄 말줄임이라 대본보다 앞에 둔다
export function shownCaption(
	voiceName: string,
	request: Pick<TypecastRequest, "text" | "settings">,
): string {
	const all = [...normalizeText(request.text)];
	const head = [...firstLine(request.text)].slice(0, 20);
	const emotion = emotionMark(request.settings)
		? ` · ${emotionPart(request.settings.preset)}`
		: "";
	return `${voiceName}${emotion} · ${head.join("")}${all.length > head.length ? "…" : ""}`;
}
// 생성·찾기·이전 결과를 플레이어에 올릴 대상. 파일 이름·캡션은 그때의 성우 이름과 요청으로 정한다(생성 성공 → 조각 → 플레이어의 순수 부분, 계획 리뷰 E6).
// signature는 그 결과의 조합이다(막대가 지금 조합의 결과가 플레이어에 있는지 본다, critique P2-3)
export type ResultTarget = {
	id: string;
	bytes: number;
	fileName: string;
	caption: string;
	signature: string;
};
export const resultTarget = (
	result: Pick<StudioResult, "id" | "bytes" | "createdAt">,
	voiceName: string,
	request: TypecastRequest,
): ResultTarget => ({
	id: result.id,
	bytes: result.bytes,
	fileName: downloadName(voiceName, request.text, result.createdAt),
	caption: shownCaption(voiceName, request),
	signature: comboSignature(request),
});

// 그 채널의 기본 프리셋(Typecast만, 계획 '스펙과 다른 점' 12)
export const channelDefaultOf = (
	presets: readonly Preset[],
	channelId: string,
): Preset | null =>
	presets.find(
		(preset) =>
			preset.provider === "typecast" &&
			preset.channelId === channelId &&
			preset.channelDefault,
	) ?? null;

// 지금 조합(서명)의 이전 결과 가운데 그 상태인 줄. 막대 '저장된 결과 열기'·'음성 만들기' 찾기(done), 확인 창 중복 과금 경고(unknown),
// 오류 줄 내리기(done)가 함께 쓴다(한 곳만 바뀌어 버튼 글자와 동작이 갈라지지 않게)
export const sameResult = <T extends Pick<StudioItem, "status" | "request">>(
	items: readonly T[] | undefined,
	signature: string | null,
	status: StudioItem["status"],
): T | null =>
	items?.find(
		(item) =>
			item.status === status && comboSignature(item.request) === signature,
	) ?? null;

// 막대 오류 줄에 둔 실패와 그 요청의 조합(critique P1-b)
export type StudioProblem = TrialProblem & { signature: string };
// 막대가 보일 오류(critique P1-b). 지금 조합(current: 대기 시각 말고 막는 이유가 있으면 null)이 그 요청과 같고, 그 조합의 완료 결과가 아직 없을 때만.
// 대본·성우·설정을 바꾸거나 막는 이유가 생기거나 늦은 결과가 완료로 바뀌면 내린다(막는 이유·도움 줄이 제 순서로 보인다)
export function liveProblem(
	problem: StudioProblem | null,
	current: string | null,
	items: readonly Pick<StudioItem, "status" | "request">[] | undefined,
): StudioProblem | null {
	if (problem === null || problem.signature !== current) return null;
	return sameResult(items, current, "done") ? null : problem;
}

// 작업실 오류 줄(스펙 5절, 브리프 8절). 작업실 문구가 따로 있는 사유만 여기서, 나머지는 T5 문구다.
// results면 막대가 '이전 결과 보기'를 붙인다(처리 여부 미확인: 다시 누르기 전에 이전 결과를 확인)
export function studioProblemText(problem: TrialProblem): {
	text: string;
	connections: boolean;
	results?: boolean;
} {
	switch (problem.reason) {
		case "unknown_outcome":
			return {
				text: STUDIO_TEXT.unknownOutcome,
				connections: false,
				results: true,
			};
		case "voice_unavailable":
			return { text: STUDIO_TEXT.voiceRejected, connections: false };
		case "in_progress":
			return { text: STUDIO_TEXT.inProgress, connections: false };
		case "storage":
			return {
				text: "지금은 음성을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
				connections: false,
			};
		case "rate_limit":
			if (problem.retryAt)
				return {
					text: `${retryTime(problem.retryAt)} 이후에 다시 만들 수 있어요`,
					connections: false,
				};
			break;
		case "provider_input":
			if (problem.providerCode === "audio_too_large")
				return {
					text: "결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요",
					connections: false,
				};
			break;
		case "unexpected":
			return {
				text: "음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
				connections: false,
			};
	}
	return trialProblemText("typecast", problem);
}
