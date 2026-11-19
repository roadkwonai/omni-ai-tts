// apps/web/src/lib/preset-view.ts
import type { Preset, PresetValue } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	type SettingsOf,
	type TrialRequest,
	usedSettings,
} from "@tts-pilot-app/api/providers/trial-options";

import { PROVIDER_LABEL } from "./connection-view";
import { LIBRARY_TEXT } from "./saved-voice-view";
import {
	optionText,
	requestOf,
	settingsParts,
	settingsSummary,
} from "./trial-view";

// 프리셋 화면 문구와 계산(T8 스펙 4절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문구는 브리프(18행 docs/briefs/presets.md)가 정본이고 브리프가 이긴다. 이름 뒤에 조사를 붙이지 않는다(받침을 모른다).
// 목록을 받는 동작은 '받기', 프리셋을 설정에 적용하는 동작은 '불러오기'로 나눠 쓴다(계획 리뷰 D13)

type Settings = SettingsOf[ProviderId];
type Values = Record<string, string | number | boolean>;

export const PRESET_TEXT = {
	menu: "프리셋",
	loading: "프리셋 목록을 불러오고 있어요",
	none: "이 음성 서비스 프리셋이 아직 없어요",
	listFailed: "프리셋 목록을 불러오지 못했어요",
	retry: "다시 받기",
	saveNew: "지금 설정으로 새 프리셋 저장",
	manage: "프리셋 관리",
	saveTitle: "프리셋 저장",
	saveNote: "이 성우는 성우 보관함에도 담겨요",
	editTitle: "프리셋 고치기",
	channel: "채널",
	noChannel: "채널 없음",
	chosenChannel: "고른 채널",
	noChannels: "채널은 ‘채널·분류’ 화면에서 만들 수 있어요",
	channelsFailed: "채널 목록을 불러오지 못했어요",
	channelGone: "고른 채널이 지워졌어요. 채널을 다시 골라 주세요.",
	channelDefault: "이 채널의 기본 프리셋으로",
	defaultNeedsChannel: "채널을 고르면 켤 수 있어요",
	defaultBadge: "기본",
	changesHead: "바뀌는 값",
	sameSettings: "지금 설정과 같아요",
	voiceGone: "프리셋의 성우가 보관함에서 빠졌어요",
	pickVoice: "성우를 다시 골라 주세요",
	noVoice: "성우 없음",
	// 작업실에서 성우를 고르기 전 꺼진 '새 프리셋 저장'의 둘째 줄
	needVoice: "성우를 먼저 골라 주세요",
	fixedBadge: "처음 값으로 돌아간 값 있음",
	changed: "바뀐 값 있음",
	// T6 이름 중복 문구와 같은 꼴(duplicateMessage)
	duplicate: "같은 이름의 프리셋이 이미 있어요",
	empty: "아직 프리셋이 없어요",
	emptyDetail:
		"성우 캐스팅의 ‘내 문장 듣기’에서 지금 설정을 프리셋으로 저장할 수 있어요",
	toCasting: "성우 캐스팅으로",
	listLabel: "프리셋 목록",
	removeDetail: "이미 만든 내 문장 결과는 그대로 남아요",
	overwriting: "바꾸는 중이에요",
	removing: "지우는 중이에요",
	// 메뉴의 지금 불러온 항목 접근 이름 끝(", 불러옴")
	loadedMark: "불러옴",
	noPresetVoices: "아직 프리셋에 쓰는 성우가 없어요",
	noPresetVoicesDetail:
		"성우 캐스팅의 ‘내 문장 듣기’에서 프리셋을 저장하면 그 성우가 여기 보여요",
} as const;

export const savedMessage = (name: string) => `‘${name}’ 프리셋을 저장했어요`;
export const loadedMessage = (name: string) => `‘${name}’ 설정을 불러왔어요`;
export const overwrittenMessage = (name: string) =>
	`‘${name}’ 프리셋을 지금 성우·설정으로 바꿨어요`;
export const updatedMessage = (name: string) => `‘${name}’ 프리셋을 고쳤어요`;
export const copiedMessage = (name: string) => `‘${name}’ 프리셋을 만들었어요`;
export const removedMessage = (name: string) => `‘${name}’ 프리셋을 지웠어요`;
export const loadQuestion = (name: string) => `‘${name}’ 프리셋을 불러올까요?`;
// 성우 이름은 설명 줄('성우 A → B')로 옮겼다(계획 '스펙과 다른 점' 7)
export const overwriteQuestion = (name: string) =>
	`‘${name}’ 프리셋을 지금 성우·설정으로 바꿀까요?`;
export const removeQuestion = (name: string) => `‘${name}’ 프리셋을 지울까요?`;
export const overwriteItem = (name: string) =>
	`‘${name}’에 지금 성우·설정 덮어쓰기`;
export const defaultNote = (name: string) => `지금 기본 프리셋: ‘${name}’`;
export const loadedName = (name: string) => `프리셋 ‘${name}’`;
export const countLine = (count: number) => `프리셋 ${count}개`;
export const savedVoiceLine = (preset: Pick<Preset, "voice">) =>
	preset.voice ? `저장할 때 성우 ${preset.voice.name}` : PRESET_TEXT.pickVoice;
// 불러오기 창 설명 첫 줄(지금 성우가 프리셋의 성우와 다를 때). 불러오기는 성우를 바꾸지 않는다(critique P1, 브리프 5절)
export const settingsOnly = (name: string) =>
	`지금 성우 ${name}에 설정만 불러와요`;
// 지우기 확인에 붙인다(앞 문장의 마침표를 이 조각이 가지고 온다). 채널 기본이면 그 채널의 기본도 빈다(T9 자동 적용 대상, 계획 리뷰 D17)
export const removeDefaultNote = (channelName: string | null) =>
	channelName
		? `. 채널 ‘${channelName}’의 기본 프리셋도 비워져요.`
		: ". 고른 채널의 기본 프리셋도 비워져요.";

// 지금 성우에서 화면에 보이고 실제로 듣는 값(requestOf의 성우 맞춤 뒤 설정)을 프리셋 한 벌로 묶는다(사용자 결정 2026-10-14 '들은 값 그대로').
// TS가 provider와 settings의 짝을 따라가지 못해 여기서 한 번 묶는다
export const presetSettingsOf = (voice: Voice, all: SettingsOf) =>
	({
		provider: voice.provider,
		settings: requestOf(voice, "", all).settings,
	}) as PresetValue;

const requestFor = (provider: ProviderId, settings: Settings) =>
	({ provider, voiceId: "", text: "", settings }) as TrialRequest;

// 그 공급자 칸이 모두 같은가('바뀐 값 있음')
export function sameSettings(
	provider: ProviderId,
	a: Settings,
	b: Settings,
): boolean {
	const x = a as Values;
	const y = b as Values;
	return Object.keys(DEFAULT_SETTINGS[provider]).every(
		(key) => x[key] === y[key],
	);
}

type Change = { label: string; from: string; to: string };
const change = (
	provider: ProviderId,
	field: string,
	from: string | number | boolean,
	to: string | number | boolean,
): Change => ({
	label: optionText(provider, field, to).label,
	from: optionText(provider, field, from).value,
	to: optionText(provider, field, to).value,
});

// 바뀌는 값: next의 모델이 쓰는 칸 가운데 current와 다른 것(모델 먼저, FIELDS 순서).
// 그 모델이 쓰지 않는 칸은 소리에 영향이 없어 보이지 않는다
export function settingChanges(
	provider: ProviderId,
	current: Settings,
	next: Settings,
): Change[] {
	const now = current as Values;
	return Object.entries(usedSettings(requestFor(provider, next)))
		.filter(([field, value]) => now[field] !== value)
		.map(([field, value]) => change(provider, field, now[field], value));
}

export const changeLine = ({ label, from, to }: Change) =>
	`${label} ${from} → ${to}`;

// 불러오기 창의 바뀌는 값: 지금 성우에서 듣는 값 → 불러온 뒤 이 성우에서 듣는 값. 양쪽을 같은 기준(성우 맞춤 뒤)으로 비교해야
// 이 성우에서 실제로 바뀌지 않는 값을 바뀐다고 하지 않는다(계획 재리뷰 N1). 성우 맞춤으로 달라지는 값은 loadNotes가 따로 알린다
export function loadChanges(
	voice: Voice,
	all: SettingsOf,
	settings: Settings,
): Change[] {
	return settingChanges(
		voice.provider,
		presetSettingsOf(voice, all).settings,
		presetSettingsOf(voice, {
			...all,
			[voice.provider]: settings,
		} as SettingsOf).settings,
	);
}

// 처음 값으로 바꾼 칸 알림(불러오기 창 알림 줄 끝, 경고 문법). 캐스팅·작업실이 함께 쓴다
export function fixedNote(
	preset: Pick<Preset, "provider" | "fixed">,
): { text: string; warn: boolean } | null {
	if (preset.fixed.length === 0) return null;
	const defaults = DEFAULT_SETTINGS[preset.provider] as Values;
	const labels = preset.fixed.map(
		(field) => optionText(preset.provider, field, defaults[field] ?? "").label,
	);
	return {
		text: `지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: ${labels.join(", ")}`,
		warn: true,
	};
}

// 불러오기 창의 알림 줄(바뀌는 값 다음). 성우 맞춤(requestOf: Typecast 모델·감정, Fish Audio 무료 기간 종료) → 성우 다름 → 처음 값으로 바뀐 값.
// warn은 경고 줄 문법(text-warning + 삼각형)으로 그린다(계획 리뷰 D14)
export function loadNotes(
	voice: Voice,
	preset: Pick<Preset, "provider" | "settings" | "voice" | "fixed">,
	now = Date.now(),
): { text: string; warn: boolean }[] {
	const wanted = preset.settings as Values;
	const all = {
		...DEFAULT_SETTINGS,
		[voice.provider]: preset.settings,
	} as SettingsOf;
	const notes = Object.entries(usedSettings(requestOf(voice, "", all, now)))
		.filter(([field, value]) => field in wanted && wanted[field] !== value)
		.map(([field, value]) => ({
			text: `${changeLine(change(voice.provider, field, wanted[field], value))} (이 성우에서 쓰는 값)`,
			warn: false,
		}));
	if (!preset.voice) notes.push({ text: PRESET_TEXT.voiceGone, warn: true });
	else if (preset.voice.voiceId !== voice.voiceId)
		notes.push({ text: savedVoiceLine(preset), warn: false });
	const fixed = fixedNote(preset);
	if (fixed) notes.push(fixed);
	return notes;
}

// 불러오기 창 내용(T9). lead는 설명 첫 줄(없으면 null), changes는 '바뀌는 값' 줄, notes는 알림 줄이다.
// 프리셋 메뉴가 화면마다 다른 비교를 받는다(캐스팅: 설정만, 작업실: 성우와 설정, preset-menu.tsx PresetHost)
export type LoadView = {
	lead: string | null;
	changes: string[];
	notes: { text: string; warn: boolean }[];
};

// 캐스팅 불러오기 창: 설정만 불러온다(성우는 그대로, T8). 비교와 알림은 지금 성우에서 듣는 값으로 한다
export function castingLoadView(
	voice: Voice,
	all: SettingsOf,
	preset: Preset,
	now = Date.now(),
): LoadView {
	return {
		lead:
			preset.voice?.voiceId !== voice.voiceId ? settingsOnly(voice.name) : null,
		changes: loadChanges(voice, all, preset.settings).map(changeLine),
		notes: loadNotes(voice, preset, now),
	};
}

// /presets 줄과 저장 창의 요약(모델 + 처음 값과 다른 값, 설정 요약과 같은 표기)
export const presetSummary = (preset: PresetValue) =>
	settingsSummary(requestFor(preset.provider, preset.settings));

// 같은 요약을 칩 하나씩 그리려고 조각으로 돌려준다(값에 ' · '가 들어가도 쪼개지지 않게 문자열을 다시 자르지 않는다)
export const presetSummaryParts = (preset: PresetValue) =>
	settingsParts(requestFor(preset.provider, preset.settings));

export const providerVoiceLine = (preset: Pick<Preset, "provider" | "voice">) =>
	`${PROVIDER_LABEL[preset.provider]} · ${preset.voice?.name ?? PRESET_TEXT.noVoice}`;

// 상태 배지: 성우 없음 → 이용 불가 → 처음 값으로 바뀐 값
export function presetBadges(
	preset: Pick<Preset, "savedVoiceId" | "unavailable" | "fixed">,
): string[] {
	const badges: string[] = [];
	if (preset.savedVoiceId === null) badges.push(PRESET_TEXT.pickVoice);
	else if (preset.unavailable) badges.push(LIBRARY_TEXT.unavailable);
	if (preset.fixed.length > 0) badges.push(PRESET_TEXT.fixedBadge);
	return badges;
}

// 성우 보관함: 프리셋에 쓰는 담은 성우 id('프리셋' 보기), 그 성우를 쓰는 프리셋 수(빼기 확인).
// 이름은 Typecast 감정 목록 presetsOf(trial-view)와 헷갈리지 않게 개수임을 드러낸다(계획 리뷰 F9)
export const presetVoiceIds = (
	presets: readonly Pick<Preset, "savedVoiceId">[],
) =>
	new Set(
		presets.flatMap((preset) =>
			preset.savedVoiceId ? [preset.savedVoiceId] : [],
		),
	);
export const presetCountOf = (
	presets: readonly Pick<Preset, "savedVoiceId">[],
	savedVoiceId: string,
) => presets.filter((preset) => preset.savedVoiceId === savedVoiceId).length;
// 빼기 확인 창 설명 뒤에 붙인다(linkedNote와 같다). 프리셋 목록을 받지 못했으면 확인하지 못했다고 알린다(계획 리뷰 D10)
export const presetRemoveNote = (count: number, unknown = false) =>
	unknown
		? ". 프리셋에서 쓰는 성우인지 확인하지 못했어요."
		: count > 0
			? `. 이 성우를 쓰는 프리셋 ${count}개는 성우를 다시 골라야 해요.`
			: "";
