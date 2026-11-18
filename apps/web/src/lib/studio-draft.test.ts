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
	checkedWork,
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
	describe("숫자 교정 결정(fixes, T11)", () => {
		const TEXT = "사과 3개와 12,500원";
		const decisions = [
			{ start: 3, end: 5, original: "3개", choice: "apply", reading: "세 개" },
			{
				start: 7,
				end: 14,
				original: "12,500원",
				choice: "manual",
				reading: "만이천오백원",
			},
		] as const;
		const withFixes = (fixes: unknown) =>
			readWork(
				raw({ ...work(), paragraphs: [{ id: "a", text: TEXT, fixes }] }),
				null,
			)?.paragraphs[0];
		it("fixes가 있는 작업은 writeWork → readWork 왕복으로 남고, 없는 예전 작업은 그대로 읽힌다", () => {
			const w = work({
				paragraphs: [
					{
						id: "a",
						text: TEXT,
						fixes: { text: TEXT, decisions: decisions.map((d) => ({ ...d })) },
					},
					{ id: "b", text: "숫자 없음" },
				],
			});
			expect(readWork(writeWork(w), null)).toEqual(w);
			expect(readWork(writeWork(w), [saved()])).toEqual(w);
			const old = work();
			expect(readWork(writeWork(old), null)?.paragraphs[0]).not.toHaveProperty(
				"fixes",
			);
			expect(readWork(writeWork(old), null)).toEqual(old);
		});
		it("fixes.text가 지금 글과 다르거나 모양이 틀리면 뺀다", () => {
			for (const fixes of [
				{ text: "다른 글", decisions },
				{ decisions },
				{ text: TEXT },
				{ text: TEXT, decisions: "x" },
				"x",
				null,
				[],
			])
				expect(withFixes(fixes)).not.toHaveProperty("fixes");
			expect(withFixes({ text: TEXT, decisions: [] })).not.toHaveProperty(
				"fixes",
			);
		});
		it("잘못된 결정만 버린다(자리가 글과 안 맞음, 모르는 선택, 빈 직접 입력, 같은 자리 중복)", () => {
			const good = decisions[0];
			const read = withFixes({
				text: TEXT,
				decisions: [
					{ ...good, original: "4개" },
					{ ...good, start: -1 },
					{ ...good, end: 99, original: "3개" },
					{ ...good, choice: "other" },
					{ ...good, choice: "manual", reading: "  " },
					{ ...good, choice: "apply", reading: 3 },
					"x",
					good,
					{ ...good, choice: "keep" },
					decisions[1],
				],
			});
			expect(read?.fixes).toEqual({
				text: TEXT,
				decisions: [good, decisions[1]],
			});
			// keep은 읽기를 남기지 않는다
			expect(
				withFixes({
					text: TEXT,
					decisions: [{ ...good, choice: "keep", reading: "세 개" }],
				})?.fixes?.decisions,
			).toEqual([{ start: 3, end: 5, original: "3개", choice: "keep" }]);
		});
		it("성우 목록이 늦게 와도 저장 글의 키 순서와 상관없이 다시 저장하지 않는다", () => {
			// 화면 상태는 fixes 칸이 문단 맨 앞이고 결정의 키 순서도 다르다
			const state = {
				...work(),
				paragraphs: [
					{
						fixes: {
							decisions: [
								{
									reading: "세 개",
									choice: "apply" as const,
									original: "3개",
									end: 5,
									start: 3,
								},
							],
							text: TEXT,
						},
						text: TEXT,
						id: "a",
					},
				],
			};
			expect(checkedWork(writeWork(state), [saved()])).toBeNull();
			expect(readWork(writeWork(state), [saved()])).toEqual(
				readWork(writeWork(state), null),
			);
		});
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
	it("T10-a 임시 작업(화자 칸 없음)은 화자 없이 읽는다", () => {
		const read = readWork(raw(work()), null);
		expect(read).not.toHaveProperty("speakers");
		expect(read?.paragraphs[0]).not.toHaveProperty("speaker");
	});
	it("화자 목록과 문단 화자가 writeWork → readWork 왕복으로 남는다", () => {
		const own: VoiceSetup = {
			provider: "elevenlabs",
			voiceId: "el_1",
			settings: EL,
		};
		const w = work({
			speakers: [
				{ name: "민수", voice: own },
				{ name: "지아", voice: null },
			],
			paragraphs: [
				{ id: "a", text: "안녕", speaker: "민수" },
				{ id: "b", text: "응", speaker: "지아", gap: 1.2 },
			],
		});
		const voices = [saved(), saved({ id: "s2", voice: rachel })];
		expect(readWork(writeWork(w), voices)).toEqual(w);
		expect(readWork(writeWork(w), null)).toEqual(w);
		// 화자 0명 목록도 그대로(저장·읽기 비교가 달라지지 않게)
		expect(readWork(writeWork(work({ speakers: [] })), null)?.speakers).toEqual(
			[],
		);
	});
	it("성우 목록이 늦게 와도 바뀐 것이 없으면 다시 쓴 글이 저장 글과 같다(키 순서 무관)", () => {
		// 화면 상태(asWork)는 speakers가 paragraphs 앞, 문단은 speaker 뒤에 gap이 붙은 순서다
		const state = {
			defaultVoice: work().defaultVoice,
			gap: PARAGRAPH_GAP_DEFAULT,
			channelId: CHANNEL,
			speakers: [{ name: "민수", voice: null }],
			paragraphs: [{ id: "a", text: "안녕", speaker: "민수", gap: 1.2 }],
		};
		expect(checkedWork(writeWork(state), [saved()])).toBeNull();
		// 성우가 보관함에 없으면 비운 작업을 돌려준다
		const own = {
			provider: "elevenlabs" as const,
			voiceId: "el_9",
			settings: EL,
		};
		const lost = checkedWork(
			writeWork({ ...state, speakers: [{ name: "민수", voice: own }] }),
			[saved()],
		);
		expect(lost?.speakers).toEqual([{ name: "민수", voice: null }]);
	});
	it("화자 이름은 speakerLine과 같은 규칙으로 정리하고 중복·규칙 밖은 버린다", () => {
		const read = readWork(
			raw({
				...work(),
				speakers: [
					{ name: "  민수 ", voice: null },
					{ name: "민수", voice: null },
					{ name: "12:30", voice: null },
					{ name: "가".repeat(21), voice: null },
					{ name: 3, voice: null },
					{ voice: null },
					"x",
					{ name: "가".repeat(20), voice: null },
				],
			}),
			null,
		);
		expect(read?.speakers?.map((s) => s.name)).toEqual([
			"민수",
			"가".repeat(20),
		]);
	});
	it("화자는 20명까지다", () => {
		const speakers = Array.from({ length: 25 }, (_, i) => ({
			name: `화자${i}`,
			voice: null,
		}));
		expect(readWork(raw({ ...work(), speakers }), null)?.speakers).toHaveLength(
			20,
		);
	});
	it("목록에 없는 문단 화자는 버린다(목록이 없어도)", () => {
		const read = readWork(
			raw({
				...work(),
				speakers: [{ name: "민수", voice: null }],
				paragraphs: [
					{ id: "a", text: "1", speaker: "민수" },
					{ id: "b", text: "2", speaker: "현우" },
					{ id: "c", text: "3", speaker: 7 },
				],
			}),
			null,
		);
		expect(read?.paragraphs.map((p) => p.speaker)).toEqual([
			"민수",
			undefined,
			undefined,
		]);
		expect(read?.paragraphs[1]).not.toHaveProperty("speaker");
		// 화자 목록이 없으면 문단 화자도 버린다
		const none = readWork(
			raw({ ...work(), paragraphs: [{ id: "a", text: "1", speaker: "민수" }] }),
			null,
		);
		expect(none?.paragraphs[0]).not.toHaveProperty("speaker");
	});
	it("보관함에 없는 화자 성우는 null이고 화자 이름은 남는다", () => {
		const gone: VoiceSetup = {
			provider: "elevenlabs",
			voiceId: "el_9",
			settings: EL,
		};
		const stored = raw({
			...work(),
			speakers: [
				{ name: "민수", voice: gone },
				{
					name: "지아",
					voice: { provider: "typecast", voiceId: "tc_1", settings: TC },
				},
			],
		});
		const read = readWork(stored, [saved({ unavailable: true })]);
		expect(read?.speakers?.[0]).toEqual({ name: "민수", voice: null });
		expect(read?.speakers?.[1]?.voice?.voiceId).toBe("tc_1");
		expect(readWork(stored, null)?.speakers?.[0]?.voice?.voiceId).toBe("el_9");
	});
	it("채널은 uuid만", () => {
		expect(readWork(raw(work({ channelId: "c1" })), null)?.channelId).toBe(
			null,
		);
		expect(readWork(raw(work()), null)?.channelId).toBe(CHANNEL);
	});
});

describe("readWork의 작업 id·연결된 대본(T12)", () => {
	const linked = {
		scriptId: "5b0f6a9e-3c1d-4e0a-8f57-0c1d2e3f4a5b",
		title: "경제 나레이션",
		version: 3,
		fingerprint: "1a2b3c4d",
	};
	it("올바른 id·linked는 writeWork → readWork 왕복으로 남는다", () => {
		const w = work({ id: "work-1", linked });
		expect(readWork(writeWork(w), null)).toEqual(w);
		expect(readWork(writeWork(w), [saved()])).toEqual(w);
	});
	it("옛 작업(두 칸 없음)은 두 칸 없이 그대로 읽고 새 id를 만들지 않는다", () => {
		const read = readWork(raw(work()), null);
		expect(read).not.toHaveProperty("id");
		expect(read).not.toHaveProperty("linked");
		expect(read).toEqual(work());
	});
	it("깨진 id·linked는 칸을 비운다", () => {
		for (const bad of [
			{ id: 3 },
			{ id: "" },
			{ id: "공백 있음" },
			{ id: "x".repeat(101) },
			{ linked: "x" },
			{ linked: { ...linked, scriptId: "not-a-uuid" } },
			{ linked: { ...linked, title: "" } },
			{ linked: { ...linked, version: 0 } },
			{ linked: { ...linked, version: 1.5 } },
			{ linked: { ...linked, fingerprint: "" } },
			{ linked: { ...linked, fingerprint: 3 } },
		]) {
			const read = readWork(raw({ ...work(), ...bad }), null);
			expect(read).not.toHaveProperty(Object.keys(bad)[0] as string);
		}
	});
	it("옛 작업에서는 checkedWork가 id를 만들지 않아 null이다", () => {
		expect(checkedWork(raw(work()), [saved()])).toBeNull();
		// id·linked가 있는 작업도 성우 목록이 맞으면 null
		expect(
			checkedWork(raw(work({ id: "work-1", linked })), [saved()]),
		).toBeNull();
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
		).toEqual({ defaultVoice: true, paragraphs: 0, speakers: 0 });
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
		).toEqual({ defaultVoice: false, paragraphs: 2, speakers: 0 });
	});
	it("화자 성우만 빠져도 센다(화자 이름은 남는다)", () => {
		expect(
			droppedVoices(
				raw(
					work({
						speakers: [
							{ name: "민수", voice: gone },
							{ name: "지아", voice: own },
							{ name: "현우", voice: null },
						],
					}),
				),
				voices,
			),
		).toEqual({ defaultVoice: false, paragraphs: 0, speakers: 1 });
	});
	it("아무것도 안 빠짐(이용 불가여도 담은 성우면 남긴다)", () => {
		expect(
			droppedVoices(
				raw(work({ paragraphs: [{ id: "a", text: "1", voice: own }] })),
				[saved({ unavailable: true }), saved({ id: "s2", voice: rachel })],
			),
		).toEqual({ defaultVoice: false, paragraphs: 0, speakers: 0 });
		expect(droppedVoices(raw(work({ defaultVoice: null })), [])).toEqual({
			defaultVoice: false,
			paragraphs: 0,
			speakers: 0,
		});
	});
	it("깨진 raw는 빠진 것이 없다", () => {
		for (const value of [null, "", "{", raw({ paragraphs: [] })])
			expect(droppedVoices(value, voices)).toEqual({
				defaultVoice: false,
				paragraphs: 0,
				speakers: 0,
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
