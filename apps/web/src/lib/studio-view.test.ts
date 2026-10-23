// apps/web/src/lib/studio-view.test.ts

import { ORPCError } from "@orpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	STUDIO_PART_BYTES,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { describe, expect, it } from "vitest";

import {
	channelDefaultOf,
	createFailureOf,
	EMOTION_NOTE,
	emotionBadges,
	emotionPatch,
	emotionShift,
	fetchAudio,
	kstStamp,
	listLoad,
	pickableVoices,
	pressedEmotion,
	readSetup,
	STUDIO_TEXT,
	safeName,
	savedOf,
	scriptCount,
	unknownNoteOf,
	unknownRefetch,
	usageLine,
} from "./studio-view";
import { requestOf } from "./trial-view";

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

describe("대본 글자 수(스펙 4절)", () => {
	it("글자 수는 NFC·앞뒤 공백 정리 뒤 코드 포인트", () => {
		expect(scriptCount("가".repeat(1234))).toBe(1234);
		expect(scriptCount("  가  ")).toBe(1);
		expect(scriptCount("한".normalize("NFD"))).toBe(1);
		expect(scriptCount("😀")).toBe(1);
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
			requestOf(target, "가", { ...DEFAULT_SETTINGS, typecast: stored })
				.settings as typeof tc;
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
	it("담은 성우를 공급자와 관계없이 최근 사용 순 → 즐겨찾기 → 담은 순(목록 순서). 이용 불가도 보인다", () => {
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
			"e",
		]);
	});
	it("savedOf: 그 공급자로 담은 성우만(같은 id라도 다른 공급자로 담았으면 없다)", () => {
		const fish = (id: string, over: Partial<SavedVoice> = {}) =>
			saved({
				id,
				voice: voice({ provider: "fish_audio", voiceId: `f_${id}` }),
				...over,
			});
		const items = [
			saved({ id: "t" }),
			fish("a"),
			fish("b", { favorite: true }),
		];
		expect(savedOf(items, "f_a", "fish_audio")?.id).toBe("a");
		// 같은 id라도 다른 공급자로 담았으면 없다
		expect(savedOf(items, "tc_1", "fish_audio")).toBeNull();
		expect(savedOf(items, "f_a", "typecast")).toBeNull();
	});
	it("공급자 null: 모든 공급자 성우를 같은 정렬로(드라마 작업실 화자)", () => {
		const items = [
			saved({ id: "t" }),
			saved({
				id: "f",
				voice: voice({ provider: "fish_audio", voiceId: "f_1" }),
				favorite: true,
			}),
			saved({
				id: "e",
				voice: voice({ provider: "elevenlabs" }),
				lastUsedAt: new Date(NOW).toISOString(),
			}),
		];
		expect(pickableVoices(items).map((item) => item.id)).toEqual([
			"e",
			"f",
			"t",
		]);
	});
	it("사용 이력 줄", () => {
		const item = saved({
			lastUsedAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(),
			useCount: 12,
		});
		expect(usageLine(item, new Date(NOW))).toBe("최근 사용 3일 전 · 12회");
		expect(usageLine(saved(), new Date(NOW))).toBeNull();
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

describe("파일 이름 조각(스펙 2절)", () => {
	it("못 쓰는 글자·공백·줄바꿈은 _, 시각은 한국 시간 YYYYMMDD-HHmm", () => {
		expect(safeName("안녕하세요, 오늘은\n경제 뉴스: 금리 / 환율")).toBe(
			"안녕하세요,_오늘은_경제_뉴스__금리___환율",
		);
		expect(safeName("A/B 성우")).toBe("A_B_성우");
		expect(kstStamp("2026-10-20T05:07:30.000Z")).toBe("20261020-1407");
		expect(kstStamp("2026-10-20T15:30:00.000Z")).toBe("20261021-0030");
		expect(kstStamp("2026-01-01T00:00:00Z")).toBe("20260101-0900");
	});
	it("C1 제어 문자와 형식 문자(방향 바꿈 RLO, 폭 없는 공백)도 _", () => {
		expect(safeName("민지‮\u0085")).toBe("민지__");
		expect(safeName("가​나\u0009다")).toBe("가_나_다");
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
		expect(savedOf(items, "tc_1", "typecast")?.id).toBe("s1");
		expect(savedOf(items, "el1", "typecast")).toBeNull();
		expect(savedOf(items, "tc_gone", "typecast")).toBeNull();
		expect(savedOf(items, null, "typecast")).toBeNull();
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
	it("fetchAudio는 첫 조각 형식(audio/wav)으로 합친다", async () => {
		const blob = await fetchAudio(STUDIO_PART_BYTES + 2, async (part) => {
			const size = part === 0 ? STUDIO_PART_BYTES : 2;
			return new Blob([new Uint8Array(size)], {
				type: part === 0 ? "audio/wav" : "",
			});
		});
		expect(blob.type).toBe("audio/wav");
	});
	it("합친 크기가 bytes와 다르면 실패한다", async () => {
		await expect(
			fetchAudio(STUDIO_PART_BYTES + 2, async (part) => {
				const size = part === 0 ? STUDIO_PART_BYTES : 1;
				return new Blob([new Uint8Array(size)]);
			}),
		).rejects.toThrow();
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
	it("미확인 줄 셋째 줄: 다시 받는 6분 안이면 늦은 도착 안내, 지나면 넘긴 만료 문구(critique P1-b)", () => {
		const ago = (minutes: number) =>
			new Date(NOW - minutes * 60_000).toISOString();
		// 만료 문구 인자(드라마 작업실은 Fish Audio 사용 기록). 창 안 문구는 같다
		expect(unknownNoteOf(ago(6), new Date(NOW), "만료")).toBe("만료");
		expect(unknownNoteOf(ago(5.9), new Date(NOW), "만료")).toBe(
			"늦게 도착하면 여기서 완료로 바뀌어요",
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

describe("채널 기본 프리셋", () => {
	it("channelDefaultOf: ElevenLabs 기본 프리셋도 돌려준다", () => {
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
		expect(channelDefaultOf(list, "c2")?.id).toBe("c");
		expect(channelDefaultOf(list, "c3")).toBeNull();
	});
});

describe("생성 실패 사유(스펙 5절)", () => {
	it("생성의 사유 없는 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)는 처리 여부 미확인이다(크레딧이 쓰였을 수 있다, 계획 리뷰 E1)", () => {
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
	});
	it("서버가 처리 전에 거절한 실패(입력 검사·CSRF·소유자 없음)는 미확인으로 바꾸지 않는다(공급자에 닿지 않았다, 계획 재리뷰 R4·N3)", () => {
		for (const code of ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"])
			expect(
				createFailureOf(new ORPCError(code, { data: { issues: [] } })).reason,
			).toBe("unexpected");
	});
});

describe("작업실 문구(브리프 8절 정본)", () => {
	it("바뀐 문구와 새 키, 지운 키", () => {
		expect(STUDIO_TEXT).toMatchObject({
			close: "닫기",
			emotionFixed: "이 성우는 감정을 바꿀 수 없어요",
		});
		expect(STUDIO_TEXT.presetLoaded("경제 내레이션")).toBe(
			"‘경제 내레이션’ 프리셋을 불러왔어요.",
		);
		// 금액은 주 버튼으로(DN-7), 이전 결과 0개면 구역을 숨긴다(DN-10)
		expect(STUDIO_TEXT).not.toHaveProperty("costPrefix");
		expect(STUDIO_TEXT).not.toHaveProperty("resultsEmpty");
		// 실패 문구는 문단 작업실 makeProblemText 하나가 정한다(28행 #1)
		for (const key of [
			"unknownOutcome",
			"inProgress",
			"unknownExpired",
			"voiceRejected",
		])
			expect(STUDIO_TEXT).not.toHaveProperty(key);
	});
});
