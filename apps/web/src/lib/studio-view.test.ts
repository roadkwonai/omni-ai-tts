// apps/web/src/lib/studio-view.test.ts

import { ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioItem } from "@tts-pilot-app/api/studio-contract";
import { describe, expect, it } from "vitest";

import {
	channelDefaultOf,
	countText,
	createFailureOf,
	downloadName,
	EMOTION_NOTE,
	emotionBadges,
	emotionMark,
	emotionPatch,
	emotionShift,
	fetchAudio,
	firstLine,
	listLoad,
	liveProblem,
	pickableVoices,
	pressedEmotion,
	readSetup,
	resultTarget,
	STUDIO_TEXT,
	sameResult,
	savedOf,
	settingsNote,
	shownCaption,
	studioBlock,
	studioLoadView,
	studioProblemText,
	studioRequestOf,
	studioResultLine,
	type TypecastRequest,
	unknownNoteOf,
	unknownRefetch,
	usageLine,
	voiceNameOf,
} from "./studio-view";

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
const preset = (over: Partial<Preset> = {}): Preset =>
	({
		id: "p1",
		name: "경제 내레이션",
		provider: "typecast",
		settings: DEFAULT_SETTINGS.typecast,
		savedVoiceId: "s1",
		voice: voice(),
		unavailable: false,
		channelId: null,
		channelDefault: false,
		fixed: [],
		...over,
	}) as Preset;
const v30 = voice({
	models: [{ model: "ssfm-v30", emotions: ["normal", "happy", "tonemid"] }],
} as Partial<Voice>);
const v21Only = voice({
	voiceId: "tc_2",
	name: "준호",
	models: [{ model: "ssfm-v21", emotions: ["normal", "sad", "whisper"] }],
} as Partial<Voice>);
const NOW = Date.parse("2026-10-20T05:07:30.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const TC = DEFAULT_SETTINGS.typecast;
// 보낸 요청(이전 결과 줄의 request와 같은 모양)
const req = (
	settings: Partial<TypecastSettings> = {},
	text = "안녕하세요",
): TypecastRequest => ({
	provider: "typecast",
	voiceId: "tc_1",
	text,
	settings: { ...TC, ...settings },
});

describe("대본과 막는 이유(스펙 4절)", () => {
	it("글자 수는 NFC·앞뒤 공백 정리 뒤 코드 포인트, 천 단위 쉼표", () => {
		expect(countText("가".repeat(1234))).toBe("1,234 / 2,000자");
		expect(countText("  가  ")).toBe("1 / 2,000자");
		expect(countText("한".normalize("NFD"))).toBe("1 / 2,000자");
	});
	it("막는 이유 순서: 성우 → 빈 대본 → 2,000자 초과 → 이용 불가 → 대기 시각", () => {
		const later = new Date(NOW + 60_000).toISOString();
		expect(studioBlock({ voice: null, text: "", retryAt: later })).toBe(
			"성우를 골라 주세요",
		);
		expect(studioBlock({ voice: saved(), text: " \n ", retryAt: later })).toBe(
			"대본을 먼저 써 주세요",
		);
		expect(
			studioBlock({
				voice: saved({ unavailable: true }),
				text: "가".repeat(STUDIO_TEXT_MAX + 1),
				retryAt: later,
			}),
		).toBe("2,000자 이하로 줄여 주세요 (지금 2,001자)");
		expect(
			studioBlock({
				voice: saved({ unavailable: true }),
				text: "가",
				retryAt: later,
			}),
		).toBe("이 성우는 지금 쓸 수 없어요. 다른 성우를 골라 주세요");
		expect(studioBlock({ voice: saved(), text: "가", retryAt: later })).toMatch(
			/이후에 다시 만들 수 있어요$/,
		);
		expect(
			studioBlock({
				voice: saved(),
				text: "가".repeat(STUDIO_TEXT_MAX),
				retryAt: null,
			}),
		).toBeNull();
	});
});

describe("감정 팔레트(스펙 2절 Typecast)", () => {
	it("v30은 '자동' + 성우 감정과 요청 열거형의 교집합, v21은 '자동' 없이 v21 감정만", () => {
		expect(emotionBadges(v30, "ssfm-v30")).toEqual([
			{ value: "smart", label: "자동" },
			{ value: "normal", label: "기본" },
			{ value: "happy", label: "기쁨" },
		]);
		expect(emotionBadges(v21Only, "ssfm-v21")).toEqual([
			{ value: "normal", label: "기본" },
			{ value: "sad", label: "슬픔" },
		]);
		// 성우 정보가 없으면 그 모델의 전체 목록
		expect(emotionBadges(voice(), "ssfm-v30").map((b) => b.value)).toEqual([
			"smart",
			"normal",
			"happy",
			"sad",
			"angry",
			"whisper",
			"toneup",
			"tonedown",
		]);
		expect(Object.keys(EMOTION_NOTE)).toHaveLength(8);
	});
	it("눌린 뱃지와 누를 때 바뀌는 설정", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		expect(pressedEmotion(tc)).toBe("smart");
		expect(pressedEmotion({ ...tc, emotion: "preset", preset: "happy" })).toBe(
			"happy",
		);
		expect(pressedEmotion({ ...tc, model: "ssfm-v21", preset: "sad" })).toBe(
			"sad",
		);
		expect(emotionPatch("ssfm-v30", "smart")).toEqual({ emotion: "smart" });
		expect(emotionPatch("ssfm-v30", "happy")).toEqual({
			emotion: "preset",
			preset: "happy",
		});
		expect(emotionPatch("ssfm-v21", "sad")).toEqual({ preset: "sad" });
	});
	it("카드 감정 표식은 기본값과 다를 때만(v30 '자동'·v21 '기본'이면 없음)", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		expect(emotionMark(tc)).toBeNull();
		expect(emotionMark({ ...tc, emotion: "preset", preset: "happy" })).toBe(
			"기쁨",
		);
		expect(emotionMark({ ...tc, emotion: "preset", preset: "normal" })).toBe(
			"기본",
		);
		expect(
			emotionMark({ ...tc, model: "ssfm-v21", preset: "normal" }),
		).toBeNull();
		expect(emotionMark({ ...tc, model: "ssfm-v21", preset: "sad" })).toBe(
			"슬픔",
		);
	});
	it("감정 설명은 브리프 8절 문구", () => {
		expect(EMOTION_NOTE).toEqual({
			smart: "대본 내용을 보고 감정을 정해요",
			normal: "기본 톤으로 읽어요",
			happy: "밝고 들뜬 톤으로 읽어요",
			sad: "가라앉은 톤으로 읽어요",
			angry: "화난 톤으로 읽어요",
			whisper: "속삭이듯 읽어요",
			toneup: "목소리 톤을 높여 읽어요",
			tonedown: "목소리 톤을 낮춰 읽어요",
		});
	});
	it("감정 맞춤 줄: 저장한 설정과 성우 맞춤 뒤 설정의 눌린 감정이 다를 때만(브리프 5.4)", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		const sent = (target: Voice, stored: typeof tc) =>
			studioRequestOf(target, "가", { ...DEFAULT_SETTINGS, typecast: stored })
				.settings;
		// v30 '자동'을 v21만 있는 성우에 보내면 v21 '기본'이 된다
		expect(emotionShift(tc, sent(v21Only, tc))).toBe(
			"감정 자동 → 기본 (이 성우·모델에서 쓰는 값)",
		);
		// 성우가 속삭임을 받지 않으면 그 모델의 첫 감정
		const whisper = { ...tc, emotion: "preset", preset: "whisper" } as const;
		expect(emotionShift(whisper, sent(v30, whisper))).toBe(
			"감정 속삭임 → 기본 (이 성우·모델에서 쓰는 값)",
		);
		// 같으면 없다. v21에서 고른 감정은 저장된 '자동' 값이 남아 있어도 맞춤이 아니다
		expect(emotionShift(tc, sent(v30, tc))).toBeNull();
		const happy = { ...tc, emotion: "preset", preset: "happy" } as const;
		expect(emotionShift(happy, sent(v30, happy))).toBeNull();
		const v21Sad = { ...tc, model: "ssfm-v21", preset: "sad" } as const;
		expect(emotionShift(v21Sad, sent(v21Only, v21Sad))).toBeNull();
	});
});

describe("성우 고르기 창(스펙 4절)", () => {
	it("담은 Typecast 성우만, 최근 사용 순 → 즐겨찾기 → 담은 순(목록 순서). 이용 불가도 보인다", () => {
		const day = 24 * 60 * 60 * 1000;
		const items = [
			saved({ id: "a", favorite: true }),
			saved({ id: "b" }),
			saved({ id: "c", lastUsedAt: new Date(NOW - 3 * day).toISOString() }),
			saved({
				id: "d",
				lastUsedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
				unavailable: true,
			}),
			saved({ id: "e", voice: voice({ provider: "elevenlabs" }) }),
			saved({ id: "f", favorite: true }),
		];
		expect(pickableVoices(items).map((item) => item.id)).toEqual([
			"d",
			"c",
			"a",
			"f",
			"b",
		]);
	});
	it("사용 이력 줄과 이름 찾기", () => {
		const item = saved({
			lastUsedAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(),
			useCount: 12,
		});
		expect(usageLine(item, new Date(NOW))).toBe("최근 사용 3일 전 · 12회");
		expect(usageLine(saved(), new Date(NOW))).toBeNull();
		expect(voiceNameOf([saved()], "tc_1")).toBe("민지");
		expect(voiceNameOf([saved()], "tc_gone")).toBe("tc_gone");
	});
	it("담은 성우 목록 받기 상태: 첫 받기 중 → 받는 중, 받은 목록이 있으면(백그라운드 실패여도) 받음", () => {
		expect(listLoad({ data: undefined, errorUpdateCount: 0 })).toBe("loading");
		expect(listLoad({ data: [], errorUpdateCount: 0 })).toBe("ready");
		expect(listLoad({ data: [saved()], errorUpdateCount: 3 })).toBe("ready");
	});
	it("데이터 없는 실패는 다시 받는 동안에도 실패다(TanStack fetchState가 status를 pending으로 되돌린다, QA-1)", async () => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
			},
		});
		const queryKey = ["savedVoiceList"];
		const down = () => Promise.reject(new Error("db down"));
		await expect(
			queryClient.fetchQuery({ queryKey, queryFn: down }),
		).rejects.toThrow();
		const state = () => queryClient.getQueryState(queryKey);
		expect(listLoad(state() ?? { data: undefined, errorUpdateCount: 0 })).toBe(
			"failed",
		);
		// 다시 받는 중: 설치한 TanStack은 status를 pending으로 되돌린다(이것을 '받는 중'으로 보면 카드가 뼈대로 돌아가 반복된다)
		const again = queryClient.fetchQuery({ queryKey, queryFn: down });
		expect(state()?.status).toBe("pending");
		expect(listLoad(state() ?? { data: undefined, errorUpdateCount: 0 })).toBe(
			"failed",
		);
		await expect(again).rejects.toThrow();
		queryClient.clear();
	});
});

describe("파일 이름과 결과 줄(스펙 2절)", () => {
	it("{성우}_{대본 앞 20자}_{YYYYMMDD-HHmm}.mp3, 못 쓰는 글자·공백·줄바꿈은 _, 시각은 한국 시간", () => {
		expect(
			downloadName(
				"민지",
				" 안녕하세요, 오늘은\n경제 뉴스: 금리 / 환율 이야기",
				"2026-10-20T05:07:30.000Z",
			),
		).toBe("민지_안녕하세요,_오늘은_경제_뉴스__금리_20261020-1407.mp3");
		expect(downloadName("A/B 성우", "가", "2026-10-20T15:30:00.000Z")).toBe(
			"A_B_성우_가_20261021-0030.mp3",
		);
		expect(downloadName("민지", "😀".repeat(25), "2026-01-01T00:00:00Z")).toBe(
			`민지_${"😀".repeat(20)}_20260101-0900.mp3`,
		);
	});
	it("C1 제어 문자와 형식 문자(방향 바꿈 RLO, 폭 없는 공백)도 _", () => {
		expect(
			downloadName("민지‮\u0085", "가​나\u0009다", "2026-10-20T05:07:30.000Z"),
		).toBe("민지___가_나_다_20261020-1407.mp3");
	});
	it("첫 줄과 결과 줄", () => {
		const item = {
			id: "r1",
			createdAt: new Date(NOW - 3 * 60_000).toISOString(),
			status: "done",
			usage: { unit: "credit", amount: 1234 },
			bytes: 10,
			request: {
				provider: "typecast",
				voiceId: "tc_1",
				text: "  첫 줄\n둘째 줄",
				settings: DEFAULT_SETTINGS.typecast,
			},
		} as StudioItem;
		expect(firstLine(item.request.text)).toBe("첫 줄");
		expect(studioResultLine(item, "민지", new Date(NOW))).toBe(
			"3분 전 · 민지 · 약 1,234크레딧",
		);
		// 처리 여부 미확인 줄은 크레딧이 쓰였는지 모른다고 덧붙인다(브리프 5.8)
		expect(
			studioResultLine({ ...item, status: "unknown" }, "민지", new Date(NOW)),
		).toBe("3분 전 · 민지 · 약 1,234크레딧 · 사용 여부 미확인");
	});
	it("결과 줄은 성우와 크레딧 사이에 처음 값이 아닌 설정을 넣는다. 처음 값인 모델(v30)·감정(v30 '자동'·v21 '기본')은 뺀다(critique P1-a)", () => {
		const item = {
			createdAt: new Date(NOW - 3 * 60_000).toISOString(),
			status: "done",
			usage: { unit: "credit", amount: 25 },
			request: req({ emotion: "preset", preset: "happy", tempo: 1.2 }),
		} as const;
		expect(studioResultLine(item, "포세이돈", new Date(NOW))).toBe(
			"3분 전 · 포세이돈 · 감정 기쁨 · 속도 1.20배 · 약 25크레딧",
		);
		expect(
			studioResultLine(
				{ ...item, status: "unknown" },
				"포세이돈",
				new Date(NOW),
			),
		).toBe(
			"3분 전 · 포세이돈 · 감정 기쁨 · 속도 1.20배 · 약 25크레딧 · 사용 여부 미확인",
		);
		// 확인 창 요약(settingsSummary)과 같은 말이다
		expect(settingsNote(req())).toBeNull();
		// v30 '직접 · 기본'은 '자동'과 소리가 달라 남긴다(카드 감정 표식과 같은 기준)
		expect(settingsNote(req({ emotion: "preset", preset: "normal" }))).toBe(
			"감정 기본",
		);
		expect(settingsNote(req({ model: "ssfm-v21", preset: "normal" }))).toBe(
			"ssfm-v21",
		);
		expect(
			settingsNote(req({ model: "ssfm-v21", preset: "sad", pitch: 2 })),
		).toBe("ssfm-v21 · 감정 슬픔 · 음높이 +2반음");
		// '자동'은 저장된 감정 값을 쓰지 않는다
		expect(
			settingsNote(req({ preset: "whisper", language: "kor", volume: 120 })),
		).toBe("한국어 · 음량 120");
	});
	it("막대 캡션은 처음 값이 아닌 감정을 성우 뒤에 붙인다(critique P1-a)", () => {
		expect(
			shownCaption("민지", req({ emotion: "preset", preset: "happy" })),
		).toBe("민지 · 감정 기쁨 · 안녕하세요");
		expect(shownCaption("민지", req({ tempo: 1.2 }, "짧은 대본"))).toBe(
			"민지 · 짧은 대본",
		);
		expect(
			shownCaption("준호", req({ model: "ssfm-v21", preset: "normal" })),
		).toBe("준호 · 안녕하세요");
	});
});

describe("임시 작업 읽기(스펙 2절, client-localstorage-schema)", () => {
	const empty = {
		voiceId: null,
		channelId: null,
		settings: DEFAULT_SETTINGS.typecast,
	};
	it("깨진 값·모양이 다른 값은 처음 값", () => {
		expect(readSetup(null)).toEqual(empty);
		expect(readSetup("{깨짐")).toEqual(empty);
		expect(readSetup("[1,2]")).toEqual(empty);
		expect(
			readSetup(
				JSON.stringify({ voiceId: "../x", channelId: "abc", settings: "x" }),
			),
		).toEqual(empty);
	});
	it("설정은 칸마다 계약 범위로 검사해 쓸 수 없는 칸만 처음 값(v21 감정 포함), 왕복은 그대로", () => {
		const channelId = "6f1c2b9e-1d2c-4f3a-9b8e-0a1b2c3d4e5f";
		const setup = readSetup(
			JSON.stringify({
				voiceId: "tc_2",
				channelId,
				settings: {
					model: "ssfm-v21",
					emotion: "smart",
					preset: "whisper",
					intensity: 1.5,
					language: "kor",
					tempo: 1.234,
					pitch: 99,
					volume: "x",
					extra: 1,
				},
			}),
		);
		expect(setup).toEqual({
			voiceId: "tc_2",
			channelId,
			settings: {
				model: "ssfm-v21",
				emotion: "smart",
				preset: "normal",
				intensity: 1.5,
				language: "kor",
				tempo: 1.25,
				pitch: 0,
				volume: 100,
			},
		});
		expect(readSetup(JSON.stringify(setup))).toEqual(setup);
	});
	it("성우는 담은 Typecast 성우 목록에 있을 때만 되살린다", () => {
		const items = [
			saved(),
			saved({
				id: "s2",
				voice: voice({ provider: "elevenlabs", voiceId: "el1" }),
			}),
		];
		expect(savedOf(items, "tc_1")?.id).toBe("s1");
		expect(savedOf(items, "el1")).toBeNull();
		expect(savedOf(items, "tc_gone")).toBeNull();
		expect(savedOf(items, null)).toBeNull();
	});
});

describe("나눠 받기(스펙 2절 A안)", () => {
	it("조각 수만큼 0번부터 차례로 받아 MP3 하나로 합친다", async () => {
		const asked: number[] = [];
		const blob = await fetchAudio(STUDIO_PART_BYTES + 2, async (part) => {
			asked.push(part);
			return new Blob([
				new Uint8Array(part === 0 ? STUDIO_PART_BYTES : 2).fill(part + 1),
			]);
		});
		expect(asked).toEqual([0, 1]);
		expect(blob.size).toBe(STUDIO_PART_BYTES + 2);
		expect(blob.type).toBe("audio/mpeg");
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect([
			bytes[0],
			bytes[STUDIO_PART_BYTES - 1],
			bytes[STUDIO_PART_BYTES],
		]).toEqual([1, 1, 2]);
	});
	it("생성 결과를 올릴 대상: 파일 이름·캡션·서명은 그때의 성우·요청이고, 조각 수만큼 받아 원래 길이가 된다(계획 리뷰 E6, 디자인 리뷰 D3, critique P2-3)", async () => {
		const request = req({}, "안녕하세요\n둘째 줄");
		const target = resultTarget(
			{
				id: "r1",
				bytes: STUDIO_PART_BYTES * 2 + 1,
				createdAt: "2026-10-20T05:07:30.000Z",
			},
			"민지",
			request,
		);
		expect(target).toEqual({
			id: "r1",
			bytes: STUDIO_PART_BYTES * 2 + 1,
			// 파일 이름은 설정을 담지 않는다(스펙 2절)
			fileName: "민지_안녕하세요_둘째_줄_20261020-1407.mp3",
			caption: "민지 · 안녕하세요…",
			// 막대가 '지금 조합의 결과가 플레이어에 있음'을 알아본다
			signature: comboSignature(request),
		});
		expect(
			resultTarget(
				{ id: "r2", bytes: 1, createdAt: NOW_ISO },
				"민지",
				req({}, "짧은 대본"),
			).caption,
		).toBe("민지 · 짧은 대본");
		expect(
			resultTarget(
				{ id: "r3", bytes: 1, createdAt: NOW_ISO },
				"민지",
				req({}, "가".repeat(25)),
			).caption,
		).toBe(`민지 · ${"가".repeat(20)}…`);
		const asked: number[] = [];
		const blob = await fetchAudio(target.bytes, async (part) => {
			asked.push(part);
			return new Blob([new Uint8Array(part < 2 ? STUDIO_PART_BYTES : 1)]);
		});
		expect(asked).toEqual([0, 1, 2]);
		expect(blob.size).toBe(target.bytes);
	});
	it("만든 지 6분 안의 미확인 줄이 있으면 15초마다 다시 받고, 없으면 멈춘다(스펙 8절 7번, 계획 리뷰 P2)", () => {
		const at = (minutes: number, status: "done" | "unknown") => ({
			status,
			createdAt: new Date(NOW - minutes * 60_000).toISOString(),
		});
		expect(unknownRefetch(undefined, NOW)).toBe(false);
		expect(unknownRefetch([at(1, "done")], NOW)).toBe(false);
		expect(unknownRefetch([at(1, "done"), at(3, "unknown")], NOW)).toBe(15_000);
		expect(unknownRefetch([at(7, "unknown")], NOW)).toBe(false);
	});
	it("미확인 줄 셋째 줄: 다시 받는 6분 안이면 늦은 도착 안내, 지나면 Typecast 사용 기록 안내(critique P1-b)", () => {
		const ago = (minutes: number) =>
			new Date(NOW - minutes * 60_000).toISOString();
		expect(unknownNoteOf(ago(5.9), new Date(NOW))).toBe(
			"늦게 도착하면 여기서 완료로 바뀌어요",
		);
		expect(unknownNoteOf(ago(6), new Date(NOW))).toBe(
			"확인 시간이 지났어요. 크레딧 사용 여부는 Typecast 사용 기록에서 확인해 주세요",
		);
		// 다시 받기가 멈추는 때와 같다
		expect(
			unknownRefetch([{ status: "unknown", createdAt: ago(6) }], NOW),
		).toBe(false);
		expect(
			unknownRefetch([{ status: "unknown", createdAt: ago(5.9) }], NOW),
		).toBe(15_000);
	});
});

describe("같은 조합의 이전 결과(막대 판정·찾기·중복 과금 경고·오류 줄)", () => {
	it("같은 서명·같은 상태의 줄만 찾는다. 다른 상태·다른 서명·서명 없음·목록 없음은 null", () => {
		const request = req();
		const signature = comboSignature(request);
		const unknown = { status: "unknown", request } as const;
		const done = { status: "done", request } as const;
		const other = { status: "unknown", request: req({ tempo: 1.2 }) } as const;
		// 확인 창 중복 과금 경고(unknownSame)
		expect(sameResult([done, other, unknown], signature, "unknown")).toBe(
			unknown,
		);
		expect(sameResult([done, other], signature, "unknown")).toBeNull();
		// 막대 '저장된 결과 열기'·'음성 만들기' 찾기·오류 줄 내리기
		expect(sameResult([unknown, done], signature, "done")).toBe(done);
		expect(sameResult([unknown], signature, "done")).toBeNull();
		expect(sameResult([done], null, "done")).toBeNull();
		expect(sameResult(undefined, signature, "unknown")).toBeNull();
	});
});

describe("막대 오류 줄(critique P1-b)", () => {
	const request = req();
	const signature = comboSignature(request);
	const problem = {
		reason: "unknown_outcome",
		retryAt: null,
		providerCode: null,
		signature,
	} as const;
	it("그 요청과 같은 대본·성우·설정일 때만 보인다. 바꾸었거나 막는 이유가 있으면(지금 서명 null) 내린다", () => {
		expect(liveProblem(problem, signature, [])).toBe(problem);
		expect(
			liveProblem(problem, comboSignature(req({}, "다른 대본")), []),
		).toBeNull();
		expect(
			liveProblem(problem, comboSignature(req({ tempo: 1.2 })), []),
		).toBeNull();
		expect(liveProblem(problem, null, [])).toBeNull();
		expect(liveProblem(null, signature, [])).toBeNull();
	});
	it("같은 조합의 이전 결과가 완료로 바뀌면 내린다. 미확인이거나 목록이 없으면 그대로", () => {
		const row = (status: "done" | "unknown") => ({ status, request });
		expect(liveProblem(problem, signature, [row("unknown")])).toBe(problem);
		expect(liveProblem(problem, signature, undefined)).toBe(problem);
		expect(liveProblem(problem, signature, [row("done")])).toBeNull();
		expect(
			liveProblem(problem, signature, [
				{ status: "done", request: req({}, "다른 대본") },
			]),
		).toBe(problem);
	});
});

describe("작업실 새 문구(critique P2-3)", () => {
	it("플레이어에 지금 조합의 결과가 있을 때 한 줄 칸", () => {
		expect(STUDIO_TEXT.shownSame).toBe(
			"지금 대본의 결과가 플레이어에 있어요 · 크레딧 0",
		);
	});
});

describe("작업실 프리셋 불러오기(스펙 2절: 성우와 설정을 함께)", () => {
	it("성우가 바뀌면 첫 줄이 성우, 이어서 그 성우에서 듣는 설정의 바뀌는 값", () => {
		const view = studioLoadView(
			voice(),
			DEFAULT_SETTINGS,
			preset({
				voice: v21Only,
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.1 },
			}),
		);
		expect(view).toEqual({
			lead: null,
			// v21만 있는 성우에는 감정 모드 칸이 없고 감정은 양쪽 모두 '기본'이라 바뀌는 값에 없다(settingChanges는 다음 모델이 쓰는 칸만 본다)
			changes: [
				"성우 민지 → 준호",
				"모델 ssfm-v30 → ssfm-v21",
				"속도 1.00배 → 1.10배",
			],
			notes: [
				{ text: "모델 ssfm-v30 → ssfm-v21 (이 성우에서 쓰는 값)", warn: false },
			],
		});
	});
	it("성우를 고르기 전이면 '성우 없음 → …'", () => {
		expect(studioLoadView(null, DEFAULT_SETTINGS, preset()).changes).toEqual([
			"성우 없음 → 민지",
		]);
	});
	it("프리셋 성우가 비었거나 이용 불가면 성우 칸을 비운다고 알린다(자동 대체 없음)", () => {
		for (const gone of [
			preset({ voice: null, savedVoiceId: null }),
			preset({ unavailable: true }),
		])
			expect(studioLoadView(voice(), DEFAULT_SETTINGS, gone)).toMatchObject({
				changes: ["성우 민지 → 성우 없음"],
				notes: [{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true }],
			});
		expect(
			studioLoadView(
				voice(),
				DEFAULT_SETTINGS,
				preset({ voice: null, fixed: ["preset"] }),
			).notes,
		).toEqual([
			{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true },
			{
				text: "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 감정",
				warn: true,
			},
		]);
	});
	it("채널 기본 프리셋은 그 채널의 Typecast 기본만", () => {
		const list = [
			preset({ id: "a", channelId: "c1", channelDefault: false }),
			preset({ id: "b", channelId: "c1", channelDefault: true }),
			preset({
				id: "c",
				provider: "elevenlabs",
				channelId: "c2",
				channelDefault: true,
			}),
		];
		expect(channelDefaultOf(list, "c1")?.id).toBe("b");
		expect(channelDefaultOf(list, "c2")).toBeNull();
		expect(channelDefaultOf(list, "c3")).toBeNull();
	});
});

describe("오류 문구(스펙 5절)", () => {
	const problem = (
		reason: string,
		extra: { retryAt?: string; providerCode?: string } = {},
	) =>
		({
			reason,
			retryAt: extra.retryAt ?? null,
			providerCode: extra.providerCode ?? null,
		}) as Parameters<typeof studioProblemText>[0];
	it("작업실 문구: 성우 거절·진행 중·너무 큰 결과·저장소·대기 시각·알 수 없는 실패", () => {
		expect(studioProblemText(problem("voice_unavailable")).text).toBe(
			"이 성우는 보관함에 없거나 현재 이용 불가예요. 성우를 다시 골라 주세요",
		);
		expect(studioProblemText(problem("in_progress")).text).toBe(
			"다른 생성이 진행 중이에요. 끝난 뒤 다시 눌러 주세요",
		);
		expect(
			studioProblemText(
				problem("provider_input", { providerCode: "audio_too_large" }),
			).text,
		).toBe("결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요");
		expect(studioProblemText(problem("storage")).text).toBe(
			"지금은 음성을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
		);
		expect(
			studioProblemText(
				problem("rate_limit", {
					retryAt: new Date(NOW + 60_000).toISOString(),
				}),
			).text,
		).toMatch(/이후에 다시 만들 수 있어요$/);
		expect(studioProblemText(problem("unexpected")).text).toBe(
			"음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
		);
	});
	it("처리 여부 미확인은 다시 누르라고 하지 않고 '이전 결과 보기'를 붙인다(크레딧이 쓰였을 수 있다, 브리프 8절)", () => {
		expect(studioProblemText(problem("unknown_outcome"))).toEqual({
			text: "처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 다시 누르기 전에 이전 결과를 확인해 주세요",
			connections: false,
			results: true,
		});
		expect(studioProblemText(problem("in_progress")).results).toBeUndefined();
	});
	it("나머지는 T5 문구(키 문제는 '연결 상태 보기')", () => {
		expect(studioProblemText(problem("no_key")).connections).toBe(true);
		expect(studioProblemText(problem("no_key")).results).toBeUndefined();
		expect(studioProblemText(problem("quota")).text).toBe(
			"크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요",
		);
	});
	it("생성의 사유 없는 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)는 처리 여부 미확인 문구다(크레딧이 쓰였을 수 있다, 계획 리뷰 E1)", () => {
		expect(createFailureOf(new TypeError("Failed to fetch")).reason).toBe(
			"unknown_outcome",
		);
		expect(createFailureOf(new ORPCError("INTERNAL_SERVER_ERROR")).reason).toBe(
			"unknown_outcome",
		);
		expect(
			createFailureOf(
				new ORPCError("BAD_REQUEST", {
					data: { provider: "typecast", reason: "voice_unavailable" },
				}),
			).reason,
		).toBe("voice_unavailable");
		expect(
			studioProblemText(createFailureOf(new TypeError("Failed to fetch"))).text,
		).toBe(STUDIO_TEXT.unknownOutcome);
		// 조각 받기 실패 알림(생성 오류 줄과 따로, '스펙과 다른 점' 17)
		expect(STUDIO_TEXT.receiveFailed).toBe(
			"결과를 받지 못했어요. 잠시 뒤 이전 결과에서 다시 열어 주세요. 크레딧은 들지 않아요.",
		);
	});
	it("서버가 처리 전에 거절한 실패(입력 검사·CSRF·소유자 없음)는 미확인으로 바꾸지 않는다(공급자에 닿지 않았다, 계획 재리뷰 R4·N3)", () => {
		for (const code of ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"])
			expect(
				createFailureOf(new ORPCError(code, { data: { issues: [] } })).reason,
			).toBe("unexpected");
		expect(
			studioProblemText(createFailureOf(new ORPCError("BAD_REQUEST"))).text,
		).toBe("음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요");
	});
});

describe("작업실 문구(브리프 8절 정본)", () => {
	it("바뀐 문구와 새 키, 지운 키", () => {
		expect(STUDIO_TEXT).toMatchObject({
			pickVoiceDescription:
				"성우 보관함에 담은 Typecast 성우예요. 최근에 쓴 성우, 즐겨찾기 순이에요.",
			made: "음성을 만들었어요.",
			opened: "저장된 결과를 열었어요. 크레딧은 쓰지 않았어요.",
			savedCost: "같은 대본·성우·설정은 저장된 결과를 열어요 · 크레딧 0",
			removeDetail:
				"지우면 이 결과를 다시 듣거나 내려받을 수 없어요. 공급자 사용 기록은 그대로예요.",
			inProgress: "다른 생성이 진행 중이에요. 끝난 뒤 다시 눌러 주세요",
			receivingShort: "결과를 받는 중",
			waitNote: "공급자 응답을 기다리고 있어요. 다시 누르지 않아도 돼요",
			toResults: "이전 결과 보기",
			unknownUsage: "사용 여부 미확인",
			shownBadge: "플레이어에 있음",
			resultsCap: "최근 20개까지 보여요",
			close: "닫기",
			emotionFixed: "이 성우는 감정을 바꿀 수 없어요",
			markAction: "바꾸기",
		});
		expect(STUDIO_TEXT.presetLoaded("경제 내레이션")).toBe(
			"‘경제 내레이션’ 프리셋을 불러왔어요.",
		);
		// 금액은 주 버튼으로(DN-7), 이전 결과 0개면 구역을 숨긴다(DN-10)
		expect(STUDIO_TEXT).not.toHaveProperty("costPrefix");
		expect(STUDIO_TEXT).not.toHaveProperty("resultsEmpty");
	});
});
