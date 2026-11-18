import { createRouterClient } from "@orpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { VoiceListInput } from "../providers/contract";
import { createProviders } from "../providers/index";
import {
	elAccountInput,
	elPublicInput,
	fetchMock,
	fishInput,
	json,
	useFetchMock,
} from "../providers/test-utils";
import { appRouter } from "./index";

const KEY = "typecast-router-test-key-0001";
// DB에 닿으면 세고 실패한다. 캐시는 DB가 실패하면 공급자를 바로 부른다(T4 계획 '스펙과 다른 점' 2)
let dbTouches = 0;
const failingDb = new Proxy(
	{},
	{
		get() {
			dbTouches += 1;
			throw new Error("db");
		},
	},
) as Context["db"];
const as = (ownerId: string | null, providers: Context["providers"]) =>
	createRouterClient(appRouter, {
		context: { db: failingDb, ownerId, providers },
	});
const voice = {
	voice_id: "tc_0001",
	voice_name: { eng: "Minji", kor: "민지" },
	voice_type: "original",
	gender: "female",
	age: "young_adult",
	models: [{ version: "ssfm-v30", emotions: ["normal"] }],
	use_cases: ["Game"],
	preview_url: "https://static2.typecast.ai/preview/tc_0001.mp3",
};
// 성우 한 명씩(elevenlabs.test.ts·fish-audio.test.ts 픽스처의 최소 모양). 성우 항목이 라우터 출력 검사를 지나가게 한다
const elPublicVoice = {
	voice_id: "el_lib_1",
	name: "Jiyoung - Calm Narrator",
	category: "professional",
	language: "ko",
	description: "차분하고 따뜻한 목소리",
	preview_url:
		"https://storage.googleapis.com/eleven-public-prod/el_lib_1/ko.mp3",
};
const elAccountVoice = {
	voice_id: "el_acc_1",
	name: "Rachel",
	category: "premade",
	labels: { gender: "female", language: "en" },
	preview_url:
		"https://storage.googleapis.com/eleven-public-prod/premade/rachel.mp3",
};
const fishVoice = {
	_id: "fish_1",
	type: "tts",
	state: "trained",
	visibility: "public",
	title: "차분한 내레이터",
	tags: ["female", "narration"],
	samples: [
		{ title: "기본", audio: "https://platform.r2.fish.audio/task/t1.mp3" },
	],
};
const routeGemini = () =>
	fetchMock.mockImplementation(async (url) =>
		json(200, {
			voices:
				new URL(String(url)).searchParams.get("language_code") === "ko-KR"
					? [
							{
								id: "ko-kr-advisor-1",
								type: "prebuilt",
								display_name: "Authoritative Advisor 1",
								language_code: "ko-KR",
								gender: "male",
								pitch: "low",
								accent: "Seoul Korean",
								persona: "High-Trust Advisor",
								context: "Enterprise Agent",
								description: "Lawyer from Seoul.",
							},
						]
					: [
							{
								id: "kore",
								type: "prebuilt",
								display_name: "Kore",
								language_code: "en-US",
								gender: "female",
								pitch: "medium",
							},
						],
		}),
	);
const AIRY_ID = "a597bb7a98fc9ec1";
const airyAsset = (lang: string) =>
	`https://assets.airy.so/airy/voice_pack/vp-v9/audio/${lang}/${AIRY_ID}.opus`;
const routeAiry = () =>
	fetchMock.mockImplementation(async (url) =>
		new URL(String(url)).pathname === "/v1/studio/voices"
			? json(200, {
					voices: [
						{
							id: AIRY_ID,
							audio_url: { ko: airyAsset("ko"), en: airyAsset("en") },
						},
					],
				})
			: json(200, {
					voices: [
						{
							id: AIRY_ID,
							name: "Silvia",
							gender: "female",
							langs: ["en", "ko"],
						},
					],
				}),
	);
useFetchMock();
beforeEach(() => {
	dbTouches = 0;
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("voiceList", () => {
	it("소유자가 없으면 UNAUTHORIZED이고 공급자를 부르지 않는다", async () => {
		await expect(
			as(null, createProviders({ typecast: KEY })).voiceList({
				provider: "typecast",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("키가 없거나 공백이면 PRECONDITION_FAILED·no_key이고 공급자를 부르지 않는다", async () => {
		for (const typecast of [undefined, "  "]) {
			await expect(
				as("local-admin", createProviders({ typecast })).voiceList({
					provider: "typecast",
				}),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				data: { provider: "typecast", reason: "no_key" },
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("정상 응답은 출력 스키마를 통과하고 결과에 키 문자열이 없다", async () => {
		fetchMock.mockResolvedValue(json(200, [voice]));
		const result = await as(
			"local-admin",
			createProviders({ typecast: KEY }),
		).voiceList({ provider: "typecast" });
		expect(result.voices).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain(KEY);
	});

	it("소유자가 없으면 세 프로시저 모두 UNAUTHORIZED이고 공급자·DB를 건드리지 않는다", async () => {
		const providers = createProviders({ elevenlabs: KEY, fish_audio: KEY });
		const client = as(null, providers);
		await expect(client.voiceList(elPublicInput())).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		await expect(client.voiceAccents({ language: "ko" })).rejects.toMatchObject(
			{ code: "UNAUTHORIZED" },
		);
		await expect(
			client.voiceListRefresh({ provider: "elevenlabs" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});

	it.each(["elevenlabs", "fish_audio"] as const)(
		"%s 키가 없으면 no_key이고 공급자·DB를 건드리지 않는다",
		async (provider) => {
			const input = provider === "elevenlabs" ? elPublicInput() : fishInput();
			await expect(
				as("local-admin", createProviders({})).voiceList(input),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				data: { provider, reason: "no_key" },
			});
			expect(fetchMock).not.toHaveBeenCalled();
			expect(dbTouches).toBe(0);
		},
	);

	it.each([
		[
			"조건 값에 공백·기호",
			elPublicInput({ query: { accent: "seoul; drop" } }),
		],
		[
			"태그 41개",
			fishInput({
				query: { tags: Array.from({ length: 41 }, (_, i) => `t${i}`) },
			}),
		],
		["Fish Audio 11페이지", fishInput({ page: 11 })],
		["검색어 101자", elPublicInput({ query: { search: "가".repeat(101) } })],
		["모르는 정렬", elPublicInput({ query: { sort: "random" as never } })],
	])("%s: BAD_REQUEST이고 공급자를 부르지 않는다", async (_name, input) => {
		await expect(
			as(
				"local-admin",
				createProviders({ elevenlabs: KEY, fish_audio: KEY }),
			).voiceList(input as VoiceListInput),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("DB가 실패해도 ElevenLabs·Fish Audio 공개 결과가 출력 스키마를 통과하고 키 문자열이 없다", async () => {
		fetchMock
			.mockResolvedValueOnce(
				json(200, { voices: [elPublicVoice], has_more: false, total_count: 1 }),
			)
			.mockResolvedValueOnce(
				json(200, { items: [fishVoice], total: 1, has_more: false }),
			);
		const client = as(
			"local-admin",
			createProviders({ elevenlabs: KEY, fish_audio: KEY }),
		);
		for (const input of [elPublicInput(), fishInput()]) {
			const result = await client.voiceList(input);
			expect(result.voices).toHaveLength(1);
			expect(result).toMatchObject({
				provider: input.provider,
				source: "public",
				stale: null,
			});
			expect(JSON.stringify(result)).not.toContain(KEY);
		}
		// 캐시가 DB에 닿았다가 실패해 공급자를 바로 부른 경로다
		expect(dbTouches).toBeGreaterThan(0);
	});

	it("조건 배열은 40개까지 통과한다(화면 선택지 최대치보다 크게, 스펙 4절)", async () => {
		fetchMock.mockResolvedValue(
			json(200, { items: [fishVoice], total: 1, has_more: false }),
		);
		const result = await as(
			"local-admin",
			createProviders({ fish_audio: KEY }),
		).voiceList(
			fishInput({
				query: { tags: Array.from({ length: 40 }, (_, i) => `t${i}`) },
			}),
		);
		expect(result.voices).toHaveLength(1);
	});

	it.each([
		["키 없음", createProviders({})],
		[
			"listVoices 없는 클라이언트(공개 데모)",
			{ elevenlabs: { checkStatus: vi.fn() } },
		],
	])(
		"%s: 목록 새로 고침은 no_key이고 캐시(DB)·공급자를 건드리지 않는다",
		async (_name, providers) => {
			await expect(
				as("local-admin", providers as Context["providers"]).voiceListRefresh({
					provider: "elevenlabs",
				}),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				data: { provider: "elevenlabs", reason: "no_key" },
			});
			expect(dbTouches).toBe(0);
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it("DB가 실패해도 목록 새로 고침은 retryAt null로 끝나고 공급자를 부르지 않는다", async () => {
		await expect(
			as("local-admin", createProviders({ elevenlabs: KEY })).voiceListRefresh({
				provider: "elevenlabs",
			}),
		).resolves.toEqual({ retryAt: null });
		expect(dbTouches).toBeGreaterThan(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("voiceAccents도 키가 없으면 no_key이고 공급자·DB를 건드리지 않는다", async () => {
		await expect(
			as("local-admin", createProviders({})).voiceAccents({ language: "ko" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider: "elevenlabs", reason: "no_key" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});

	it("ElevenLabs 내 계정·억양 결과도 출력 스키마를 통과한다(계획 리뷰 E8)", async () => {
		fetchMock
			.mockResolvedValueOnce(
				json(200, {
					voices: [elAccountVoice],
					has_more: false,
					total_count: 1,
					next_page_token: null,
				}),
			)
			.mockResolvedValueOnce(
				json(200, {
					accents: [
						{
							accent: "seoul",
							language: "ko",
							code: "ko-seoul",
							name: "Seoul",
						},
					],
				}),
			);
		const client = as("local-admin", createProviders({ elevenlabs: KEY }));
		const account = await client.voiceList(elAccountInput());
		expect(account.voices).toHaveLength(1);
		expect(account.voices[0]?.origin).toBe("premade");
		expect(account).toMatchObject({
			provider: "elevenlabs",
			source: "account",
			stale: null,
		});
		const accents = await client.voiceAccents({ language: "ko" });
		expect(accents).toMatchObject({
			language: "ko",
			accents: [{ value: "seoul", name: "Seoul" }],
			stale: null,
		});
	});

	it("Airy: 입력은 { provider: 'airy' }뿐이고 공개 출처로 돌려주며 결과에 키가 없다", async () => {
		routeAiry();
		const result = await as(
			"local-admin",
			createProviders({ airy: KEY }),
		).voiceList({ provider: "airy" });
		expect(result).toMatchObject({
			provider: "airy",
			source: "public",
			stale: null,
		});
		expect(result.voices[0]?.samples).toHaveLength(2);
		expect(JSON.stringify(result)).not.toContain(KEY);
	});

	it("Airy 키가 없으면 no_key이고 공급자·DB를 건드리지 않는다", async () => {
		await expect(
			as("local-admin", createProviders({})).voiceList({ provider: "airy" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider: "airy", reason: "no_key" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});

	it("Airy 입력에 출처·조건을 끼워도 무시된다", async () => {
		routeAiry();
		const client = as("local-admin", createProviders({ airy: KEY }));
		const result = await client.voiceList({
			provider: "airy",
			source: "account",
		} as never);
		expect(result.source).toBe("public");
	});

	it("Gemini: 입력은 { provider: 'gemini' }뿐이고 공개 출처로 한국어 성우와 대표 성우를 돌려주며 결과에 키가 없다", async () => {
		routeGemini();
		const result = await as(
			"local-admin",
			createProviders({ gemini: KEY }),
		).voiceList({ provider: "gemini" });
		expect(result).toMatchObject({
			provider: "gemini",
			source: "public",
			stale: null,
		});
		expect(result.voices.map((voice) => voice.voiceId)).toEqual([
			"ko-kr-advisor-1",
			"kore",
		]);
		expect(result.voices[1]?.samples).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain(KEY);
	});

	it("Gemini 키가 없으면 no_key이고 공급자·DB를 건드리지 않는다", async () => {
		await expect(
			as("local-admin", createProviders({})).voiceList({ provider: "gemini" }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider: "gemini", reason: "no_key" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});
});
