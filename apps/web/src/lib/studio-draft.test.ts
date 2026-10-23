// apps/web/src/lib/studio-draft.test.ts
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	PARAGRAPHS_MAX,
	type SettingsOf,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import { PROVIDER_IDS } from "./connection-view";
import {
	PARAGRAPH_GAP_DEFAULT,
	paragraphRequest,
	type VoiceSetup,
	type Work,
} from "./paragraph-script";
import {
	droppedVoices,
	migrateV1,
	readWork,
	settingsOf,
	usableDefaultVoice,
	workLoadView,
	writeWork,
} from "./studio-draft";
import { STUDIO_TEXT } from "./studio-view";
import { requestOf } from "./trial-view";

const NOW = Date.parse("2026-10-23T12:00:00+09:00");
const CHANNEL = "7d3f0c52-6a1e-4c1b-9a43-2f6f3b7b9c10";
const TC = DEFAULT_SETTINGS.typecast;
const EL = DEFAULT_SETTINGS.elevenlabs;
const voice = (over: Partial<Voice> = {}): Voice =>
	({
		provider: "typecast",
		source: "public",
		voiceId: "tc_1",
		name: "민지",
		models: [],
		...over,
	}) as Voice;
const saved = (over: Partial<SavedVoice> = {}): SavedVoice => ({
	id: "s1",
	voice: voice(),
	favorite: false,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
	...over,
});
const rachel = voice({
	provider: "elevenlabs",
	voiceId: "el_1",
	name: "Rachel",
} as Partial<Voice>);
const v21Only = voice({
	voiceId: "tc_2",
	name: "준호",
	models: [{ model: "ssfm-v21", emotions: ["normal", "sad", "whisper"] }],
} as Partial<Voice>);
const preset = (over: Partial<Preset> = {}): Preset =>
	({
		id: "p1",
		name: "경제 내레이션",
		provider: "typecast",
		settings: TC,
		savedVoiceId: "s1",
		voice: voice(),
		unavailable: false,
		channelId: null,
		channelDefault: false,
		fixed: [],
		...over,
	}) as Preset;
const work = (over: Partial<Work> = {}): Work => ({
	defaultVoice: { provider: "typecast", voiceId: "tc_1", settings: TC },
	gap: PARAGRAPH_GAP_DEFAULT,
	channelId: CHANNEL,
	paragraphs: [{ id: "a", text: "첫 문단" }],
	...over,
});
const raw = (value: unknown) => JSON.stringify(value);

describe("readWork(임시 작업 v2)", () => {
	it("깨진 JSON·모양 밖 값은 null", () => {
		for (const value of [
			null,
			"",
			"{",
			"[]",
			'"x"',
			raw({}),
			raw({ paragraphs: "x" }),
			raw({ paragraphs: [] }),
		])
			expect(readWork(value, null)).toBeNull();
		// 문단 칸 하나가 깨져도 작업은 살린다(글이 아니면 빈 글)
		expect(
			readWork(raw({ paragraphs: [{ id: "a", text: 3 }] }), null)?.paragraphs,
		).toEqual([{ id: "a", text: "" }]);
	});
	it("writeWork로 쓴 작업은 그대로 읽는다", () => {
		const w = work({
			paragraphs: [
				{ id: "a", text: "첫 문단", gap: 1.2 },
				{
					id: "b",
					text: "둘째",
					voice: { provider: "elevenlabs", voiceId: "el_1", settings: EL },
				},
			],
		});
		const voices = [saved(), saved({ id: "s2", voice: rachel })];
		expect(readWork(writeWork(w), voices)).toEqual(w);
		expect(readWork(writeWork(w), null)).toEqual(w);
	});
	it("200개를 넘는 문단은 앞 200개", () => {
		const paragraphs = Array.from({ length: PARAGRAPHS_MAX + 5 }, (_, i) => ({
			id: `p${i}`,
			text: `문단 ${i}`,
		}));
		const read = readWork(raw(work({ paragraphs })), null);
		expect(read?.paragraphs).toHaveLength(PARAGRAPHS_MAX);
		expect(read?.paragraphs.at(-1)?.id).toBe(`p${PARAGRAPHS_MAX - 1}`);
	});
	it("id가 겹치거나 형식 밖이면 새 id", () => {
		const read = readWork(
			raw(
				work({
					paragraphs: [
						{ id: "a", text: "1" },
						{ id: "a", text: "2" },
						{ id: "<b>", text: "3" },
					],
				}),
			),
			null,
		);
		const ids = read?.paragraphs.map((p) => p.id) ?? [];
		expect(ids[0]).toBe("a");
		expect(new Set(ids).size).toBe(3);
		expect(ids[2]).not.toBe("<b>");
	});
	it("범위 밖 쉼은 지운다", () => {
		const read = readWork(
			raw({
				...work(),
				gap: 9,
				paragraphs: [
					{ id: "a", text: "1", gap: 7 },
					{ id: "b", text: "2", gap: -1 },
					{ id: "c", text: "3", gap: "1" },
					{ id: "d", text: "4", gap: 1.25 },
					{ id: "e", text: "5", gap: 0 },
				],
			}),
			null,
		);
		expect(read?.gap).toBe(PARAGRAPH_GAP_DEFAULT);
		expect(read?.paragraphs.map((p) => p.gap)).toEqual([
			undefined,
			undefined,
			undefined,
			1.3,
			0,
		]);
		expect(read?.paragraphs[0]).not.toHaveProperty("gap");
	});
	it("보관함에 없는 성우는 그 문단 voice를 지우고 기본 성우는 null", () => {
		const gone: VoiceSetup = {
			provider: "elevenlabs",
			voiceId: "el_9",
			settings: EL,
		};
		const stored = raw(
			work({
				defaultVoice: gone,
				paragraphs: [
					{ id: "a", text: "1", voice: gone },
					// 같은 id를 다른 공급자로 담았으면 없는 성우다
					{
						id: "b",
						text: "2",
						voice: { provider: "elevenlabs", voiceId: "tc_1", settings: EL },
					},
					// 이용 불가여도 담은 성우면 남긴다(만든 결과를 찾아야 한다)
					{
						id: "c",
						text: "3",
						voice: { provider: "typecast", voiceId: "tc_1", settings: TC },
					},
				],
			}),
		);
		const read = readWork(stored, [saved({ unavailable: true })]);
		expect(read?.defaultVoice).toBeNull();
		expect(read?.paragraphs[0]).toEqual({ id: "a", text: "1" });
		expect(read?.paragraphs[1]).toEqual({ id: "b", text: "2" });
		expect(read?.paragraphs[2]?.voice?.voiceId).toBe("tc_1");
		// 목록을 아직 모르면 형식만 본다
		expect(readWork(stored, null)?.defaultVoice?.voiceId).toBe("el_9");
	});
	it("모델이 바뀌어 계약 밖인 설정은 처음 값", () => {
		const read = readWork(
			raw(
				work({
					defaultVoice: {
						provider: "typecast",
						voiceId: "tc_1",
						// v21은 속삭임을 받지 않는다
						settings: {
							...TC,
							model: "ssfm-v21",
							emotion: "preset",
							preset: "whisper",
							tempo: 1.2,
						},
					},
					paragraphs: [
						{
							id: "a",
							text: "1",
							voice: {
								provider: "elevenlabs",
								voiceId: "el_1",
								// 없어진 모델
								settings: {
									...EL,
									model: "eleven_v2",
									stability: 0.3,
								} as unknown as SettingsOf["elevenlabs"],
							},
						},
					],
				}),
			),
			null,
		);
		expect(read?.defaultVoice?.settings).toEqual({
			...TC,
			model: "ssfm-v21",
			emotion: "preset",
			preset: "normal",
			tempo: 1.2,
		});
		expect(read?.paragraphs[0]?.voice?.settings).toEqual({
			...EL,
			stability: 0.3,
		});
	});
	it("채널은 uuid만", () => {
		expect(readWork(raw(work({ channelId: "c1" })), null)?.channelId).toBe(
			null,
		);
		expect(readWork(raw(work()), null)?.channelId).toBe(CHANNEL);
	});
});

describe("droppedVoices(목록으로 읽을 때 비운 성우, F30-2)", () => {
	const gone: VoiceSetup = {
		provider: "elevenlabs",
		voiceId: "el_9",
		settings: EL,
	};
	const own: VoiceSetup = {
		provider: "elevenlabs",
		voiceId: "el_1",
		settings: EL,
	};
	const voices = [saved(), saved({ id: "s2", voice: rachel })];
	it("기본 성우만 빠짐", () => {
		expect(
			droppedVoices(
				raw(work({ defaultVoice: gone, paragraphs: [{ id: "a", text: "1" }] })),
				voices,
			),
		).toEqual({ defaultVoice: true, paragraphs: 0 });
	});
	it("문단 둘 빠짐(남은 성우·성우 없는 문단은 세지 않는다)", () => {
		expect(
			droppedVoices(
				raw(
					work({
						paragraphs: [
							{ id: "a", text: "1", voice: gone },
							{ id: "b", text: "2", voice: own },
							{ id: "c", text: "3" },
							// 같은 id라도 다른 공급자로 담았으면 없는 성우다
							{
								id: "d",
								text: "4",
								voice: { provider: "typecast", voiceId: "el_1", settings: TC },
							},
						],
					}),
				),
				voices,
			),
		).toEqual({ defaultVoice: false, paragraphs: 2 });
	});
	it("아무것도 안 빠짐(이용 불가여도 담은 성우면 남긴다)", () => {
		expect(
			droppedVoices(
				raw(work({ paragraphs: [{ id: "a", text: "1", voice: own }] })),
				[saved({ unavailable: true }), saved({ id: "s2", voice: rachel })],
			),
		).toEqual({ defaultVoice: false, paragraphs: 0 });
		expect(droppedVoices(raw(work({ defaultVoice: null })), [])).toEqual({
			defaultVoice: false,
			paragraphs: 0,
		});
	});
	it("깨진 raw는 빠진 것이 없다", () => {
		for (const value of [null, "", "{", raw({ paragraphs: [] })])
			expect(droppedVoices(value, voices)).toEqual({
				defaultVoice: false,
				paragraphs: 0,
			});
	});
});

describe("settingsOf", () => {
	const cases: {
		[P in keyof SettingsOf]: { stored: unknown; read: SettingsOf[P] };
	} = {
		typecast: {
			stored: { model: "ssfm-v21", preset: "sad", tempo: 9, pitch: 3 },
			read: { ...TC, model: "ssfm-v21", preset: "sad", pitch: 3 },
		},
		elevenlabs: {
			stored: {
				model: "eleven_v3",
				stability: 0.3,
				similarity: 5,
				speakerBoost: "yes",
				tag: "excited",
			},
			read: { ...EL, model: "eleven_v3", stability: 0.3, tag: "excited" },
		},
		fish_audio: {
			stored: { model: "s2.1-pro", speed: 1.5, temperature: -1, tag: 3 },
			read: {
				...DEFAULT_SETTINGS.fish_audio,
				model: "s2.1-pro",
				speed: 1.5,
			},
		},
		airy: {
			stored: { model: "airy-tts-v1", language: "ja", style: "calm" },
			read: { ...DEFAULT_SETTINGS.airy, style: "calm" },
		},
		gemini: {
			stored: { model: "gemini-2", direction: "calm and relaxed" },
			read: { ...DEFAULT_SETTINGS.gemini, direction: "calm and relaxed" },
		},
	};
	it.each(PROVIDER_IDS)("settingsOf %s: 계약 밖 칸만 처음 값", (provider) => {
		expect(settingsOf(provider, cases[provider].stored)).toEqual(
			cases[provider].read,
		);
		expect(settingsOf(provider, "x")).toEqual(DEFAULT_SETTINGS[provider]);
	});
	it("settingsOf: 대괄호·줄바꿈이 든 태그·지시는 처음 값", () => {
		expect(settingsOf("elevenlabs", { tag: "[happy]" }).tag).toBe("");
		expect(settingsOf("elevenlabs", { tag: "a".repeat(31) }).tag).toBe("");
		expect(settingsOf("fish_audio", { tag: "a\nb" }).tag).toBe("");
		expect(settingsOf("fish_audio", { tag: " 웃으며 " }).tag).toBe("웃으며");
		expect(settingsOf("gemini", { direction: "calm\r\nslow" }).direction).toBe(
			"",
		);
		expect(settingsOf("gemini", { direction: "a".repeat(101) }).direction).toBe(
			"",
		);
		// 대괄호는 지시에서 쓸 수 있다(계약은 줄바꿈만 막는다)
		expect(settingsOf("gemini", { direction: "[calm]" }).direction).toBe(
			"[calm]",
		);
	});
});

describe("migrateV1(T9 임시 작업 옮기기, 스펙 2절)", () => {
	const script = "첫 줄입니다.\n\n둘째 문단입니다.";
	const setup = raw({
		voiceId: "tc_2",
		channelId: CHANNEL,
		settings: { ...TC, tempo: 1.2 },
	});
	it("migrateV1: 대본은 나누지 않고 문단 1장, 성우·설정은 기본 성우", () => {
		const w = migrateV1(script, setup);
		expect(w).toEqual({
			defaultVoice: {
				provider: "typecast",
				voiceId: "tc_2",
				settings: { ...TC, tempo: 1.2 },
			},
			gap: PARAGRAPH_GAP_DEFAULT,
			channelId: CHANNEL,
			paragraphs: [{ id: expect.any(String), text: script }],
		});
		expect(migrateV1(script, null)).toEqual({
			defaultVoice: null,
			gap: PARAGRAPH_GAP_DEFAULT,
			channelId: null,
			paragraphs: [{ id: expect.any(String), text: script }],
		});
		expect(migrateV1(null, setup)?.paragraphs).toEqual([
			{ id: expect.any(String), text: "" },
		]);
	});
	it("migrateV1로 옮긴 문단의 서명 = comboSignature(requestOf(voice, script, all))", () => {
		const w = migrateV1(script, setup);
		const p = w?.paragraphs[0];
		if (!w || !p) throw new Error("옮기지 못함");
		const request = paragraphRequest(p, w, [saved({ voice: v21Only })], NOW);
		const all = { ...DEFAULT_SETTINGS, typecast: { ...TC, tempo: 1.2 } };
		// v21 전용 성우: 저장한 v30 설정이 그 성우가 받는 값으로 맞춰진다(E1)
		expect(request?.settings.model).toBe("ssfm-v21");
		expect(request && comboSignature(request)).toBe(
			comboSignature(requestOf(v21Only, script, all)),
		);
	});
	it("v1 둘 다 없으면 null", () => {
		expect(migrateV1(null, null)).toBeNull();
	});
});

describe("기본 성우 불러오기", () => {
	it("usableDefaultVoice는 다섯 공급자 모두 그 공급자의 담은 성우만, 이용 불가는 null", () => {
		for (const provider of PROVIDER_IDS) {
			const v = voice({ provider, voiceId: "v_1" } as Partial<Voice>);
			const item = saved({ voice: v });
			const p = preset({ provider, voice: v });
			expect(usableDefaultVoice(p, [item])).toBe(item);
			expect(
				usableDefaultVoice(p, [saved({ ...item, unavailable: true })]),
			).toBeNull();
			expect(
				usableDefaultVoice({ ...p, unavailable: true }, [item]),
			).toBeNull();
		}
		// 같은 id를 다른 공급자로 담았으면 아니다
		expect(
			usableDefaultVoice(preset({ provider: "elevenlabs", voice: rachel }), [
				saved({ voice: { ...rachel, provider: "typecast" } as Voice }),
			]),
		).toBeNull();
		expect(usableDefaultVoice(preset({ voice: null }), [saved()])).toBeNull();
	});
	it("workLoadView: 바뀌는 값은 넘긴 now로 성우를 맞춘다(Fish 무료 종료 전후)", () => {
		const fish = voice({
			provider: "fish_audio",
			voiceId: "f_1",
			name: "하늘",
		} as Partial<Voice>);
		const voices = [saved({ voice: fish })];
		const w = work({
			defaultVoice: {
				provider: "fish_audio",
				voiceId: "f_1",
				settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" },
			},
		});
		const free = preset({
			provider: "fish_audio",
			voice: fish,
			settings: DEFAULT_SETTINGS.fish_audio,
		});
		expect(workLoadView(free, w, voices, FISH_FREE_UNTIL - 1).changes).toEqual([
			"모델 s2.1-pro → s2.1-pro-free",
		]);
		// 종료 뒤에는 무료 모델이 s2.1-pro로 보내져 바뀌는 값이 없다
		expect(workLoadView(free, w, voices, FISH_FREE_UNTIL).changes).toEqual([]);
	});
	it("workLoadView: 공급자가 바뀌면 성우·설정 변화, 쓸 수 없는 성우면 비움 알림", () => {
		const voices = [saved(), saved({ id: "s2", voice: rachel })];
		const el = preset({
			provider: "elevenlabs",
			voice: rachel,
			savedVoiceId: "s2",
			settings: { ...EL, model: "eleven_v3", stability: 0.3 },
		});
		expect(workLoadView(el, work(), voices, NOW)).toEqual({
			lead: null,
			changes: [
				"공급자 Typecast → ElevenLabs",
				"성우 민지 → Rachel",
				"모델 eleven_v4 → eleven_v3",
				"안정성 0.50 → 0.30",
			],
			notes: [],
		});
		// 같은 공급자·같은 성우면 설정만
		expect(
			workLoadView(
				preset({ settings: { ...TC, tempo: 1.2 } }),
				work(),
				voices,
				NOW,
			).changes,
		).toEqual(["속도 1.00배 → 1.20배"]);
		// 기본 성우가 없으면 성우 없음에서
		expect(
			workLoadView(el, work({ defaultVoice: null }), voices, NOW).changes[0],
		).toBe("성우 없음 → Rachel");
		// 쓸 수 없는 성우: 성우를 비운다고 알린다(자동 대체 없음)
		expect(
			workLoadView({ ...el, unavailable: true }, work(), voices, NOW),
		).toEqual({
			lead: null,
			changes: ["성우 민지 → 성우 없음"],
			notes: [{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true }],
		});
	});
});
