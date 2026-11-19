import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
} from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import {
	castingLoadView,
	changeLine,
	fixedNote,
	loadChanges,
	loadedName,
	loadNotes,
	PRESET_TEXT,
	presetBadges,
	presetCountOf,
	presetRemoveNote,
	presetSettingsOf,
	presetSummary,
	presetSummaryParts,
	presetVoiceIds,
	providerVoiceLine,
	removeDefaultNote,
	sameSettings,
	settingChanges,
	settingsOnly,
} from "./preset-view";

const voice = (over: Partial<Voice>): Voice =>
	({
		provider: "typecast",
		source: "public",
		voiceId: "tc_1",
		name: "민지",
		models: [],
		...over,
	}) as Voice;
const v21Only = voice({
	models: [{ model: "ssfm-v21", emotions: ["normal"] }],
} as Partial<Voice>);
const preset = (over: Partial<Preset>): Preset =>
	({
		id: "p1",
		name: "경제 내레이션",
		provider: "typecast",
		settings: DEFAULT_SETTINGS.typecast,
		savedVoiceId: "s1",
		voice: voice({}),
		unavailable: false,
		channelId: null,
		channelDefault: false,
		fixed: [],
		...over,
	}) as Preset;

describe("저장 값(사용자 결정 2026-10-14 '들은 값 그대로')", () => {
	it("v21만 있는 성우에서는 화면에 보이는 ssfm-v21·감정 직접을 저장한다", () => {
		expect(presetSettingsOf(v21Only, DEFAULT_SETTINGS)).toEqual({
			provider: "typecast",
			settings: {
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
			},
		});
	});
	it("성우 맞춤이 없는 공급자는 설정 그대로다", () => {
		expect(
			presetSettingsOf(
				voice({ provider: "gemini", voiceId: "kore" }),
				DEFAULT_SETTINGS,
			),
		).toEqual({ provider: "gemini", settings: DEFAULT_SETTINGS.gemini });
	});
});

describe("설정 비교(스펙 4절 불러오기)", () => {
	it("같은 설정이면 바뀌는 값이 없다", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		expect(sameSettings("typecast", tc, { ...tc })).toBe(true);
		expect(settingChanges("typecast", tc, { ...tc })).toEqual([]);
	});
	it("새 설정의 모델이 쓰는 칸 가운데 다른 것만, 모델 먼저", () => {
		const next = {
			...DEFAULT_SETTINGS.typecast,
			model: "ssfm-v21" as const,
			emotion: "preset" as const,
			tempo: 1.1,
		};
		expect(
			settingChanges("typecast", DEFAULT_SETTINGS.typecast, next).map(
				changeLine,
			),
		).toEqual(["모델 ssfm-v30 → ssfm-v21", "속도 1.00배 → 1.10배"]);
		expect(sameSettings("typecast", DEFAULT_SETTINGS.typecast, next)).toBe(
			false,
		);
	});
	it("Gemini 말투 지시는 '없음 → 문장'", () => {
		const next = { ...DEFAULT_SETTINGS.gemini, direction: "차분하게" };
		expect(
			settingChanges("gemini", DEFAULT_SETTINGS.gemini, next).map(changeLine),
		).toEqual(["말투 지시 없음 → 차분하게"]);
	});
	it("불러오기 비교는 양쪽 모두 이 성우에서 듣는 값이다(v21만 있는 성우에 v30 프리셋)", () => {
		expect(
			loadChanges(v21Only, DEFAULT_SETTINGS, DEFAULT_SETTINGS.typecast),
		).toEqual([]);
		expect(
			loadChanges(v21Only, DEFAULT_SETTINGS, {
				...DEFAULT_SETTINGS.typecast,
				tempo: 1.1,
			}).map(changeLine),
		).toEqual(["속도 1.00배 → 1.10배"]);
	});
});

describe("불러오기 창 알림 줄", () => {
	it("성우 맞춤: v21만 있는 성우에 v30 프리셋을 불러오면 모델이 달라진다", () => {
		expect(loadNotes(v21Only, preset({ voice: v21Only }))).toEqual([
			{ text: "모델 ssfm-v30 → ssfm-v21 (이 성우에서 쓰는 값)", warn: false },
		]);
		expect(loadNotes(voice({}), preset({}))).toEqual([]);
	});
	it("Fish Audio 무료 모델은 무료 기간 뒤 성우 맞춤 줄이 생긴다", () => {
		const fish = voice({ provider: "fish_audio", voiceId: "f".repeat(32) });
		const saved = preset({
			provider: "fish_audio",
			settings: DEFAULT_SETTINGS.fish_audio,
			voice: fish,
		});
		expect(loadNotes(fish, saved, FISH_FREE_UNTIL - 1)).toEqual([]);
		expect(loadNotes(fish, saved, FISH_FREE_UNTIL)).toEqual([
			{
				text: "모델 s2.1-pro-free → s2.1-pro (이 성우에서 쓰는 값)",
				warn: false,
			},
		]);
	});
	it("성우 다름은 회색, 성우 빠짐과 처음 값으로 바뀐 값은 경고", () => {
		expect(loadNotes(voice({ voiceId: "tc_2" }), preset({}))).toEqual([
			{ text: "저장할 때 성우 민지", warn: false },
		]);
		expect(
			loadNotes(voice({}), preset({ voice: null, fixed: ["model", "preset"] })),
		).toEqual([
			{ text: "프리셋의 성우가 보관함에서 빠졌어요", warn: true },
			{
				text: "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 모델, 감정",
				warn: true,
			},
		]);
	});
	it("불러오기는 설정만: 성우가 다를 때 창 설명 첫 줄(브리프 5·8절)", () => {
		expect(settingsOnly("민지")).toBe("지금 성우 민지에 설정만 불러와요");
	});
	it("처음 값으로 바꾼 칸 알림은 따로도 만든다(작업실이 쓴다)", () => {
		expect(fixedNote(preset({}))).toBeNull();
		expect(fixedNote(preset({ fixed: ["model", "preset"] }))).toEqual({
			text: "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 모델, 감정",
			warn: true,
		});
	});
	it("캐스팅 불러오기 창은 T8 그대로: 성우가 다르면 '설정만' 첫 줄, 이 성우에서 듣는 값의 바뀌는 값, 알림 줄(회귀)", () => {
		expect(castingLoadView(voice({}), DEFAULT_SETTINGS, preset({}))).toEqual({
			lead: null,
			changes: [],
			notes: [],
		});
		const other = voice({ voiceId: "tc_2", name: "준호" });
		const tempo = preset({
			settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.1 },
		});
		expect(castingLoadView(other, DEFAULT_SETTINGS, tempo)).toEqual({
			lead: settingsOnly("준호"),
			changes: loadChanges(other, DEFAULT_SETTINGS, tempo.settings).map(
				changeLine,
			),
			notes: loadNotes(other, tempo),
		});
		expect(castingLoadView(other, DEFAULT_SETTINGS, tempo).changes).toEqual([
			"속도 1.00배 → 1.10배",
		]);
	});
});

describe("프리셋 줄과 안내", () => {
	it("요약은 모델과 처음 값과 다른 값만", () => {
		expect(
			presetSummary({
				provider: "typecast",
				settings: { ...DEFAULT_SETTINGS.typecast, pitch: -1 },
			}),
		).toBe("ssfm-v30 · 음높이 -1반음");
		const value = {
			provider: "typecast",
			settings: { ...DEFAULT_SETTINGS.typecast, pitch: -1 },
		} as const;
		expect(presetSummaryParts(value)).toEqual(["ssfm-v30", "음높이 -1반음"]);
		expect(presetSummaryParts(value).join(" · ")).toBe(presetSummary(value));
	});
	it("공급자·성우 줄과 배지(성우 없음 → 이용 불가 → 바뀐 값)", () => {
		expect(providerVoiceLine(preset({}))).toBe("Typecast · 민지");
		expect(providerVoiceLine(preset({ voice: null, savedVoiceId: null }))).toBe(
			"Typecast · 성우 없음",
		);
		expect(presetBadges(preset({}))).toEqual([]);
		expect(
			presetBadges(
				preset({ voice: null, savedVoiceId: null, fixed: ["model"] }),
			),
		).toEqual(["성우를 다시 골라 주세요", "처음 값으로 돌아간 값 있음"]);
		expect(presetBadges(preset({ unavailable: true }))).toEqual([
			"현재 이용 불가",
		]);
	});
	it("불러온 프리셋 이름과 지우기의 채널 기본 문구", () => {
		expect(loadedName("경제")).toBe("프리셋 ‘경제’");
		// 작업실에서 성우를 고르기 전 꺼진 '새 프리셋 저장'의 둘째 줄
		expect(PRESET_TEXT.needVoice).toBe("성우를 먼저 골라 주세요");
		expect(removeDefaultNote("주말")).toBe(
			". 채널 ‘주말’의 기본 프리셋도 비워져요.",
		);
		expect(removeDefaultNote(null)).toBe(
			". 고른 채널의 기본 프리셋도 비워져요.",
		);
	});
	it("보관함: 프리셋 성우 집합, 성우별 프리셋 수, 빼기 문구", () => {
		const list = [
			preset({ id: "a", savedVoiceId: "s1" }),
			preset({ id: "b", savedVoiceId: "s1" }),
			preset({ id: "c", savedVoiceId: null }),
		];
		expect([...presetVoiceIds(list)]).toEqual(["s1"]);
		expect(presetCountOf(list, "s1")).toBe(2);
		expect(presetRemoveNote(2)).toBe(
			". 이 성우를 쓰는 프리셋 2개는 성우를 다시 골라야 해요.",
		);
		expect(presetRemoveNote(0)).toBe("");
		expect(presetRemoveNote(0, true)).toBe(
			". 프리셋에서 쓰는 성우인지 확인하지 못했어요.",
		);
	});
});
