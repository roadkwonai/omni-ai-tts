// apps/web/src/lib/studio-view.ts
import { ORPCError } from "@orpc/client";
import {
	type EmotionValue,
	pressedEmotion,
} from "@tts-pilot-app/api/paragraph-autotag";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	EMOTION_PRESETS,
	normalizeText,
	partsOf,
	RANGES,
	type Range,
	snap,
	TYPECAST_MODELS,
	type TypecastModel,
	type TypecastSettings,
	V21_PRESETS,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";

import {
	emotionLabel,
	LANGUAGE_LABEL,
	presetsOf,
	resultWhen,
	type TrialProblem,
	trialFailureOf,
} from "./trial-view";
import { plain } from "./voice-view";

// CLI와 함께 쓰는 공용 구현(T20). EmotionValue는 감정 팔레트 뱃지 값(Typecast 자동 감정 또는 요청 열거형의 감정)이다
export {
	type EmotionValue,
	pressedEmotion,
} from "@tts-pilot-app/api/paragraph-autotag";
export { kstStamp, safeName } from "@tts-pilot-app/api/paragraph-files";
export { savedOf } from "@tts-pilot-app/api/paragraph-script";

// 음성 작업실의 화면 문구와 계산(T9 스펙 4·5절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문구는 브리프(docs/briefs/studio.md 8절)가 정본이다. 이름 뒤에 조사를 붙이지 않는다. 크레딧이 쓰였을 수 있으면 "다시 해 주세요"라고 하지 않는다

export const STUDIO_TEXT = {
	title: "음성 작업실",
	channel: "채널",
	noChannel: "채널 없음",
	toClasses: "채널·분류에서 만들기",
	pickVoice: "성우 고르기",
	settings: "설정",
	settingsNeedVoice: "성우를 고르면 설정을 바꿀 수 있어요",
	palette: "감정",
	connections: "연결 상태 보기",
	unknownNote: "늦게 도착하면 여기서 완료로 바뀌어요",
	presetVoiceUnusable: "프리셋의 성우를 쓸 수 없어요. 성우를 골라 주세요.",
	close: "닫기",
	// 대본이 비었을 때 문단 목록 자리의 빈 상태
	emptyTitle: "대본부터 시작해요",
	emptyDescription: "붙여 넣거나 저장해 둔 대본을 열면 문단으로 나뉘어요",
	openSaved: "저장한 대본 열기",
	typeHere: "직접 쓰기",
	emotionFixed: "이 성우는 감정을 바꿀 수 없어요",
	// 작업실 불러오기 알림(캐스팅은 T8 loadedMessage 그대로)
	presetLoaded: (name: string) => `‘${name}’ 프리셋을 불러왔어요`,
} as const;

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

// 대본 글자 수는 서버와 같게 NFC·앞뒤 공백 정리 뒤 코드 포인트로 센다
export const scriptCount = (text: string) => codePoints(normalizeText(text));
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
// 고를 수 있는 성우: 담은 모든 공급자 성우(문단 작업실·드라마 화자)를 최근 사용 순 → 즐겨찾기 → 담은 순(서버 목록 순서)으로. 이용 불가도 보인다(흐리게, 못 고름)
export function pickableVoices(items: readonly SavedVoice[]): SavedVoice[] {
	const lastUsed = (item: SavedVoice) =>
		item.lastUsedAt ? Date.parse(item.lastUsedAt) : 0;
	// sort는 안정 정렬이라 같으면 담은 순이 남는다
	return [...items].sort(
		(a, b) =>
			lastUsed(b) - lastUsed(a) || Number(b.favorite) - Number(a.favorite),
	);
}
export const usageLine = (item: SavedVoice, now: Date) =>
	item.lastUsedAt
		? `최근 사용 ${resultWhen(item.lastUsedAt, now)} · ${plain.format(item.useCount)}회`
		: null;

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

// 이 브라우저의 임시 작업(스펙 2절). 키에 판을 붙이고 필요한 칸만 둔다(client-localstorage-schema). 대본은 입력마다, 나머지는 바뀔 때 쓴다
export const SCRIPT_KEY = "tts-pilot:studio:v1:script";
export const SETUP_KEY = "tts-pilot:studio:v1:setup";
type Setup = {
	voiceId: string | null;
	channelId: string | null;
	settings: TypecastSettings;
};

export const pick = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);
export const inRange = (value: unknown, range: Range) =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	value >= range.min &&
	value <= range.max
		? snap(value, range)
		: range.default;
// 저장해 둔 Typecast 설정을 계약 범위로 칸마다 검사한다(T5 typecastSettingsSchema와 같은 규칙). apps/web은 zod를 쓰지 않아 trial-options의 값 상수로 본다.
// 쓸 수 없는 칸만 처음 값으로 바꾸고 나머지는 지킨다. 프리셋을 읽는 T8 readSettings와 같은 뜻이다(사용자가 고친 값을 한 칸 때문에 모두 잃지 않게, 계획 리뷰 P10).
// 감정 모드 두 값은 trial-options에 상수가 없어(계약의 z.enum) 글자로 둔다. 언어는 화면 이름표(LANGUAGE_LABEL)의 열쇠를 쓴다
export function typecastSettingsOf(raw: unknown): TypecastSettings {
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
export const VOICE_ID = /^[A-Za-z0-9_-]{1,100}$/;
export const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
	const blob = new Blob(parts, { type: parts[0]?.type || "audio/mpeg" });
	// 조각이 모자라거나 넘치면 깨진 오디오다(T9-05)
	if (blob.size !== bytes) throw new Error("audio size mismatch");
	return blob;
}
// 받은 것을 쓴다. 화면을 떠난 뒤(here가 거짓) 온 결과와 실패는 버린다(알림·blob 주소를 만들지 않는다)
export async function receiveHere<T>(
	load: () => Promise<T>,
	here: () => boolean,
	use: (value: T) => void,
	fail: (error: unknown) => void,
): Promise<void> {
	try {
		const value = await load();
		if (here()) use(value);
	} catch (error) {
		if (here()) fail(error);
	}
}

// 숫자 검수 창이 보일 항목의 번호. 고른 항목(view)이 목록에 없으면(모두 검수한 뒤, 사라진 항목) 첫 미검수 항목이고 -1이면 모두 검수했다.
// 모두 검수한 화면에서 '모두 적용'을 되돌리면 미검수가 다시 생긴다
export function reviewIndexOf(
	rows: readonly { key: string; decision: unknown }[],
	view: string,
): number {
	const at = rows.findIndex((row) => row.key === view);
	return at < 0 ? rows.findIndex((row) => !row.decision) : at;
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
	items: readonly { status: string; createdAt: string }[] | undefined,
	now: number,
): number | false {
	return items?.some(
		(item) => item.status === "unknown" && lateWaiting(item.createdAt, now),
	)
		? LATE_REFETCH_MS
		: false;
}
// 미확인 줄 셋째 줄(critique P1-b): 다시 받는 창 안이면 늦은 도착 안내, 지나면 사용 기록에서 확인하라는 안내(다시 받기가 멈추는 때와 같다)
export const unknownNoteOf = (createdAt: string, now: Date, expired: string) =>
	lateWaiting(createdAt, now.getTime()) ? STUDIO_TEXT.unknownNote : expired;

// 그 채널의 기본 프리셋. 채널당 하나라 공급자와 관계없다(T10 E6)
export const channelDefaultOf = (
	presets: readonly Preset[],
	channelId: string,
): Preset | null =>
	presets.find(
		(preset) => preset.channelId === channelId && preset.channelDefault,
	) ?? null;
