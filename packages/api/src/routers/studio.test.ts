import { createRouterClient } from "@orpc/server";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq, sql } from "drizzle-orm";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { Context } from "../context";
import { paragraphTagPrompt } from "../paragraph-tags";
import { type ProviderId, providerIdSchema } from "../providers/contract";
import {
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
	trialError,
} from "../providers/errors";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import {
	AIRY_TEXT_MAX,
	DEFAULT_SETTINGS,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	type TrialRequest,
} from "../providers/trial-options";
import type { StudioAutoTagInput, StudioRequest } from "../studio-contract";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { claim, comboKey, complete } from "../trial";
import { appRouter } from "./index";

const OWNER = `studio-r-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 5]);
const PROVIDERS = providerIdSchema.options;
// 공급자마다 따로 둔 가짜 synthesize. 요청이 다른 공급자로 새지 않음을 호출 수로 본다(T10 Ruling 6)
const fake = () =>
	vi.fn(async (_request: TrialRequest, _options?: SynthesizeOptions) => MP3);
const fakes = {
	typecast: fake(),
	elevenlabs: fake(),
	fish_audio: fake(),
	airy: fake(),
	gemini: fake(),
} satisfies Record<ProviderId, unknown>;
const synthesize = fakes.typecast;
// 가짜 자동 태그(Gemini 텍스트 모델). 기본 답은 제안 없음(모든 문단 원래 값)
const suggestActing = vi.fn(
	async (
		_prompt: ReturnType<typeof paragraphTagPrompt>,
	): Promise<string | null> => JSON.stringify({ paragraphs: [] }),
);
const listModels = vi.fn(async () => [
	{ model: "eleven_v4" as const, multiplier: 1.5 },
]);
const providers: Providers = {
	typecast: { checkStatus: vi.fn(), synthesize },
	elevenlabs: {
		checkStatus: vi.fn(),
		synthesize: fakes.elevenlabs,
		listModels,
	},
	fish_audio: { checkStatus: vi.fn(), synthesize: fakes.fish_audio },
	airy: { checkStatus: vi.fn(), synthesize: fakes.airy },
	gemini: { checkStatus: vi.fn(), synthesize: fakes.gemini, suggestActing },
};
// 공급자별 가짜 호출 수. only(p)는 p만 1회, only()는 모두 0회
const calls = () =>
	Object.fromEntries(PROVIDERS.map((p) => [p, fakes[p].mock.calls.length]));
const only = (provider?: ProviderId) =>
	Object.fromEntries(PROVIDERS.map((p) => [p, p === provider ? 1 : 0]));
// 공급자마다 담아 두는 성우(beforeEach)
const VOICE: Record<ProviderId, string> = {
	typecast: "tc_0001",
	elevenlabs: "el_0001",
	fish_audio: "fish_0001",
	airy: "airy_0001",
	gemini: "Kore",
};
// Fish는 유료 모델로 보낸다(무료 모델은 2026-11-30에 끝나 테스트가 날짜에 묶인다)
const requestOf = (
	provider: ProviderId,
	text = "안녕하세요",
	voiceId = VOICE[provider],
) =>
	({
		provider,
		voiceId,
		text,
		settings:
			provider === "fish_audio"
				? { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" }
				: DEFAULT_SETTINGS[provider],
	}) as StudioRequest;
const as = (ownerId: string | null, ctx: Partial<Context> = {}) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers, ...ctx } as Context,
	});
const me = as(OWNER);
const request = (text = "안녕하세요", voiceId = "tc_0001") => ({
	provider: "typecast" as const,
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.typecast,
});
const create = (text?: string, requestId: string = crypto.randomUUID()) =>
	me.studioCreate({ requestId, request: request(text) });
const createOf = (provider: ProviderId, text?: string) =>
	me.studioCreate({
		requestId: crypto.randomUUID(),
		request: requestOf(provider, text),
	});
const keep = (
	ownerId: string,
	voiceId = "tc_0001",
	over: { provider?: ProviderId; unavailable?: boolean } = {},
) => {
	const provider = over.provider ?? "typecast";
	return db.insert(savedVoice).values({
		ownerId,
		provider,
		voiceId,
		source: "public",
		voice: {
			...emptyVoice(provider, "public"),
			voiceId,
			name: `성우 ${voiceId}`,
		},
		unavailable: over.unavailable ?? false,
	});
};
const used = async (voiceId = "tc_0001") => {
	const [found] = await db
		.select({ useCount: savedVoice.useCount })
		.from(savedVoice)
		.where(and(eq(savedVoice.ownerId, OWNER), eq(savedVoice.voiceId, voiceId)));
	return found;
};
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
const rows = () => db.select().from(trialGeneration);
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

// DB를 쓰지 않는 테스트는 skipIf 밖에 둬 TEST_DATABASE_URL이 없어도 늘 돈다(계획 리뷰 E4)
describe("음성 작업실 프로시저: DB 없이(스펙 5절)", () => {
	beforeEach(() => {
		for (const provider of PROVIDERS) fakes[provider].mockClear();
	});
	afterEach(() => vi.restoreAllMocks());

	it("DB가 실패하면 공급자를 부르지 않고 storage, 찾기도 storage(스펙 5절)", async () => {
		dbTouches = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const broken = as(OWNER, { db: failingDb });
		await expect(
			broken.studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		});
		expect(dbTouches).toBeGreaterThan(0);
		expect(synthesize).not.toHaveBeenCalled();
		await expect(broken.studioFind(request())).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		await expect(broken.studioFindMany([request()])).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		// 조회 실패는 storage이고 '없음'(NOT_FOUND·null)으로 읽히지 않는다(T18)
		const id = crypto.randomUUID();
		const storage = {
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		};
		await expect(broken.studioInfo({ id })).rejects.toMatchObject(storage);
		await expect(broken.studioRequest({ requestId: id })).rejects.toMatchObject(
			storage,
		);
		expect(calls()).toEqual(only());
	});

	it("Typecast 키가 없으면 DB·공급자보다 먼저 no_key(순서 고정, 수정 F1)", async () => {
		dbTouches = 0;
		await expect(
			as(OWNER, { db: failingDb, providers: {} }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider: "typecast", reason: "no_key" },
		});
		expect(dbTouches).toBe(0);
		expect(synthesize).not.toHaveBeenCalled();
	});
});

type TagParagraph = StudioAutoTagInput["paragraphs"][number];
// 자동 태그 추천 입력 문단 하나. 지정하지 않은 칸은 빈 지시·감정 없음이다
const tagOf = (
	provider: ProviderId,
	model: string,
	text = "안녕.",
	over: Partial<Pick<TagParagraph, "direction" | "emotions" | "feel">> = {},
) =>
	({
		provider,
		model,
		emotions: null,
		text,
		direction: "",
		...over,
	}) as TagParagraph;
const fishTag = (text: string) => tagOf("fish_audio", "s2.1-pro", text);
const autoTag = (
	paragraphs: TagParagraph[] = [fishTag("안녕.")],
	client = as(OWNER, { db: failingDb }),
) => client.studioAutoTag({ paragraphs });
// 모델 답 한 문단. 지정하지 않은 칸은 빈 제안이다(빈 대본은 글이 바뀐 것이라 원래 대본으로 남는다)
const tip = (
	index: number,
	over: Partial<{
		direction: string;
		text: string;
		emotion: string;
		intensity: number | null;
	}> = {},
) => ({
	index,
	direction: "",
	text: "",
	emotion: "",
	intensity: null,
	...over,
});
const answer = (...paragraphs: ReturnType<typeof tip>[]) =>
	suggestActing.mockResolvedValueOnce(JSON.stringify({ paragraphs }));
const autoTagFailed = {
	code: "BAD_REQUEST",
	data: {
		provider: "gemini",
		reason: "provider_input",
		providerCode: "auto_tag_reply",
	},
};

// 자동 태그 추천은 DB를 쓰지 않는다. failingDb로 DB 접근 0회를 함께 본다
describe("자동 태그 추천 studioAutoTag(T10 스펙 15.3)", () => {
	beforeEach(() => {
		suggestActing.mockReset();
		dbTouches = 0;
	});
	afterEach(() => {
		expect(dbTouches).toBe(0);
	});

	it("소유자가 없으면 UNAUTHORIZED, 공급자·DB 0회", async () => {
		await expect(
			autoTag(undefined, as(null, { db: failingDb })),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("OpenAI·Gemini 키 없음(Gemini는 클라이언트 없음·자동 태그 없음) → no_key + openai_account, 공급자 0회", async () => {
		for (const gemini of [undefined, { checkStatus: vi.fn() }])
			await expect(
				autoTag(
					undefined,
					as(OWNER, { db: failingDb, providers: { ...providers, gemini } }),
				),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				data: {
					provider: "openai",
					reason: "no_key",
					providerCode: "openai_account",
				},
			});
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("모두 ElevenLabs v2·flash면 부르지 않고 원래 값·skipped 2, 키가 없어도 같다", async () => {
		const paragraphs = [
			tagOf("elevenlabs", "eleven_multilingual_v2", "빨리 들어가."),
			tagOf("elevenlabs", "eleven_flash_v2_5", "고마워. [sighs]"),
		];
		const expected = {
			paragraphs: [
				{ text: "빨리 들어가.", direction: "" },
				{ text: "고마워. [sighs]", direction: "" },
			],
			skipped: 2,
		};
		await expect(autoTag(paragraphs)).resolves.toEqual(expected);
		await expect(
			autoTag(paragraphs, as(OWNER, { db: failingDb, providers: {} })),
		).resolves.toEqual(expected);
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("깨진 JSON·모양이 다른 답·답 없음 → provider_input(auto_tag_reply)이고 data에 대본이 없다", async () => {
		for (const reply of [
			'{"paragraphs":[{"index":0,"text":"[sighs] 안',
			'{"paragraphs":"x"}',
			// 드라마 답 모양(lines)은 문단 답이 아니다
			JSON.stringify({ lines: [] }),
			JSON.stringify({ paragraphs: [{ ...tip(0), index: 0.5 }] }),
			null,
		]) {
			suggestActing.mockResolvedValueOnce(reply);
			const error = await autoTag().catch((caught: unknown) => caught);
			expect(error).toMatchObject(autoTagFailed);
			expect((error as { data?: unknown }).data).toEqual(autoTagFailed.data);
		}
		expect(suggestActing).toHaveBeenCalledTimes(5);
	});

	it("index가 겹치면 첫 제안, 빠진 index는 원래 값, 범위 밖 index는 버린다", async () => {
		answer(
			tip(0, { text: "[sighs] 하나." }),
			tip(0, { text: "[laughs] 하나." }),
			tip(2, { text: "셋. [pause]" }),
			tip(3, { text: "[sighs] 둘." }),
			tip(-1, { text: "[sighs] 둘." }),
		);
		const result = await autoTag([
			fishTag("하나."),
			fishTag("둘."),
			fishTag("셋."),
		]);
		expect(result.paragraphs).toEqual([
			{ text: "[sighs] 하나.", direction: "" },
			{ text: "둘.", direction: "" },
			{ text: "셋. [pause]", direction: "" },
		]);
	});

	it("ElevenLabs v2·flash 문단은 프롬프트에 넣지 않고, 답의 index는 보낸 문단 차례다", async () => {
		const paragraphs = [
			tagOf("elevenlabs", "eleven_multilingual_v2", "하나."),
			fishTag("둘."),
			tagOf("elevenlabs", "eleven_flash_v2_5", "셋."),
			tagOf("elevenlabs", "eleven_v3", "넷."),
		];
		answer(
			tip(-1, { text: "[sighs] 하나." }),
			tip(0, { text: "[sighs] 둘." }),
			tip(1, { text: "[laughs] 넷." }),
			tip(2, { text: "[sighs] 셋." }),
		);
		await expect(autoTag(paragraphs)).resolves.toEqual({
			paragraphs: [
				{ text: "하나.", direction: "" },
				{ text: "[sighs] 둘.", direction: "" },
				{ text: "셋.", direction: "" },
				{ text: "[laughs] 넷.", direction: "" },
			],
			skipped: 2,
		});
		expect(suggestActing).toHaveBeenCalledTimes(1);
		expect(suggestActing.mock.calls[0]?.[0]).toEqual(
			paragraphTagPrompt([
				{
					family: "fish_s2",
					emotions: null,
					max: STUDIO_TEXT_MAX,
					text: "둘.",
					direction: "",
				},
				{
					family: "elevenlabs_tags",
					emotions: null,
					max: STUDIO_TEXT_MAX,
					text: "넷.",
					direction: "",
				},
			]),
		);
	});

	it("허용 값만 남는다(Fish·Gemini·Typecast·Airy): 공급자·모델의 값, 성우 감정으로 좁힘, 원래 감정 유지", async () => {
		const sad = { typecast: { emotion: "sad" as const, intensity: 1 } };
		const paragraphs = [
			fishTag("너 지금 몇 시인지 알아?"),
			tagOf("gemini", "gemini-3.8-flash-tts", "알아, 알아.", {
				direction: "muttering",
			}),
			tagOf("typecast", "ssfm-v30", "빨리 들어가.", {
				emotions: ["normal", "happy", "sad"],
			}),
			tagOf("typecast", "ssfm-v21", "고마워.", { feel: sad }),
			tagOf("airy", "airy-tts-v1", "오늘 커피는 내가 살게."),
		];
		answer(
			// Fish는 소리·분위기 대괄호를 받고, 지시·감정은 받지 않는다
			tip(0, {
				direction: "icy calm",
				text: "[excited] 너 지금 몇 시인지 알아? [sighs]",
				emotion: "happy",
			}),
			// Gemini는 꺾쇠 소리와 지시를 받는다
			tip(1, { direction: "calm and relaxed", text: "<sigh> 알아, 알아." }),
			// Typecast는 대본 태그 없이 감정만 받는다. 강도는 0.5 눈금
			tip(2, {
				text: "[sighs] 빨리 들어가.",
				emotion: "happy",
				intensity: 1.4,
			}),
			// v21에는 smart가 없다
			tip(3, { text: "고마워.", emotion: "smart" }),
			tip(4, {
				direction: "calm",
				text: "<laugh> 오늘 커피는 내가 살게.",
				emotion: "bright",
			}),
		);
		await expect(autoTag(paragraphs)).resolves.toEqual({
			paragraphs: [
				{ text: "[excited] 너 지금 몇 시인지 알아? [sighs]", direction: "" },
				{ text: "<sigh> 알아, 알아.", direction: "calm and relaxed" },
				{
					text: "빨리 들어가.",
					direction: "",
					feel: { typecast: { emotion: "happy", intensity: 1.5 } },
				},
				{ text: "고마워.", direction: "", feel: sad },
				{
					text: "오늘 커피는 내가 살게.",
					direction: "",
					feel: { airy: { style: "bright" } },
				},
			],
			skipped: 0,
		});
		expect(suggestActing).toHaveBeenCalledTimes(1);
	});
});

// 호출 순서는 askSuggestions 한 곳이다(T10 스펙 16.1). 드라마도 같이 쓴다
describe("자동 태그 호출 순서 OpenAI 우선, Gemini 보조(T10 스펙 16.1)", () => {
	const openai = vi.fn(
		async (_prompt: ReturnType<typeof paragraphTagPrompt>) =>
			null as string | null,
	);
	const good = JSON.stringify({
		paragraphs: [tip(0, { text: "[sighs] 안녕." })],
	});
	const withOpenai = (extra: Partial<Providers> = {}) =>
		as(OWNER, {
			db: failingDb,
			providers: { ...providers, openai: { suggestActing: openai }, ...extra },
		});
	const geminiGood = () =>
		suggestActing.mockResolvedValueOnce(
			JSON.stringify({ paragraphs: [tip(0, { text: "[laughs] 안녕." })] }),
		);
	beforeEach(() => {
		openai.mockReset();
		suggestActing.mockReset();
		dbTouches = 0;
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
		expect(dbTouches).toBe(0);
	});

	it("1. OpenAI가 첫 시도에 맞으면 OpenAI 1회, Gemini 0회", async () => {
		openai.mockResolvedValueOnce(good);
		const result = await autoTag(undefined, withOpenai());
		expect(result.paragraphs[0]?.text).toBe("[sighs] 안녕.");
		expect(openai).toHaveBeenCalledTimes(1);
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("2. unknown_outcome, 깨진 글, 맞는 답 순이면 OpenAI 3회, Gemini 0회", async () => {
		openai
			.mockRejectedValueOnce(trialError("openai", "unknown_outcome"))
			.mockResolvedValueOnce("{")
			.mockResolvedValueOnce(good);
		const result = await autoTag(undefined, withOpenai());
		expect(result.paragraphs[0]?.text).toBe("[sighs] 안녕.");
		expect(openai).toHaveBeenCalledTimes(3);
		expect(suggestActing).not.toHaveBeenCalled();
		// 사유 글자만 남는다(대본·답 글 없음)
		expect(vi.mocked(console.warn).mock.calls).toEqual([
			["[autoTag] openai 실패 1/3 unknown_outcome"],
			["[autoTag] openai 실패 2/3 auto_tag_reply"],
		]);
	});

	it("3. OpenAI가 3번 provider_error면 OpenAI 3회 뒤 Gemini 1회, Gemini 제안", async () => {
		openai.mockRejectedValue(trialError("openai", "provider_error"));
		geminiGood();
		const result = await autoTag(undefined, withOpenai());
		expect(result.paragraphs[0]?.text).toBe("[laughs] 안녕.");
		expect(openai).toHaveBeenCalledTimes(3);
		expect(suggestActing).toHaveBeenCalledTimes(1);
		expect(vi.mocked(console.warn).mock.calls).toEqual([
			["[autoTag] openai 실패 1/3 provider_error"],
			["[autoTag] openai 실패 2/3 provider_error"],
			["[autoTag] openai 실패 3/3 provider_error"],
		]);
	});

	it("OpenAI 키가 없고 Gemini만 있으면 Gemini 1회, 키 없음 한 줄만 남긴다", async () => {
		geminiGood();
		await autoTag(undefined, withOpenai({ openai: undefined }));
		expect(suggestActing).toHaveBeenCalledTimes(1);
		expect(vi.mocked(console.warn).mock.calls).toEqual([
			["[autoTag] openai 키 없음, gemini로"],
		]);
	});

	it("4. OpenAI가 provider_auth면 OpenAI 1회, Gemini 1회", async () => {
		openai.mockRejectedValue(trialError("openai", "provider_auth"));
		geminiGood();
		await autoTag(undefined, withOpenai());
		expect(openai).toHaveBeenCalledTimes(1);
		expect(suggestActing).toHaveBeenCalledTimes(1);
	});

	it("5. Gemini 없이 OpenAI가 3번 unknown_outcome이면 GATEWAY_TIMEOUT, providerCode 없음", async () => {
		openai.mockRejectedValue(trialError("openai", "unknown_outcome"));
		const error = await autoTag(
			undefined,
			withOpenai({ gemini: undefined }),
		).catch((caught: unknown) => caught);
		expect(error).toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "openai", reason: "unknown_outcome" },
		});
		expect((error as { data: object }).data).not.toHaveProperty("providerCode");
		expect(openai).toHaveBeenCalledTimes(3);
	});

	it("6. Gemini 없이 OpenAI가 quota면 OpenAI 1회, openai_account", async () => {
		openai.mockRejectedValue(trialError("openai", "quota"));
		await expect(
			autoTag(undefined, withOpenai({ gemini: undefined })),
		).rejects.toMatchObject({
			data: {
				provider: "openai",
				reason: "quota",
				providerCode: "openai_account",
			},
		});
		expect(openai).toHaveBeenCalledTimes(1);
	});

	it("7. 둘 다 없으면 PRECONDITION_FAILED no_key + openai_account, 호출 0회", async () => {
		await expect(
			autoTag(undefined, withOpenai({ gemini: undefined, openai: undefined })),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: {
				provider: "openai",
				reason: "no_key",
				providerCode: "openai_account",
			},
		});
		expect(openai).not.toHaveBeenCalled();
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("8. 소유자가 없으면 UNAUTHORIZED, 두 가짜 모두 0회", async () => {
		await expect(
			autoTag(
				undefined,
				as(null, {
					db: failingDb,
					providers: { ...providers, openai: { suggestActing: openai } },
				}),
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(openai).not.toHaveBeenCalled();
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("9. OpenAI 3번 provider_error 뒤 Gemini가 깨진 글이면 Gemini 1회, gemini auto_tag_reply(openai_account 없음)", async () => {
		openai.mockRejectedValue(trialError("openai", "provider_error"));
		suggestActing.mockResolvedValueOnce("{");
		const error = await autoTag(undefined, withOpenai()).catch(
			(caught: unknown) => caught,
		);
		expect((error as { data: unknown }).data).toEqual({
			provider: "gemini",
			reason: "provider_input",
			providerCode: "auto_tag_reply",
		});
		expect(openai).toHaveBeenCalledTimes(3);
		expect(suggestActing).toHaveBeenCalledTimes(1);
	});

	it("10. 9와 같고 Gemini가 unknown_outcome이면 Gemini의 오류", async () => {
		openai.mockRejectedValue(trialError("openai", "provider_error"));
		suggestActing.mockRejectedValueOnce(
			trialError("gemini", "unknown_outcome"),
		);
		const error = await autoTag(undefined, withOpenai()).catch(
			(caught: unknown) => caught,
		);
		expect((error as { data: unknown }).data).toEqual({
			provider: "gemini",
			reason: "unknown_outcome",
		});
		expect(suggestActing).toHaveBeenCalledTimes(1);
	});
});

describe.skipIf(!url)("음성 작업실 프로시저(T9 스펙 3·9절)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.delete(providerListCache);
		for (const provider of PROVIDERS) fakes[provider].mockClear();
		listModels.mockClear();
		vi.useRealTimers();
		for (const provider of PROVIDERS)
			await keep(OWNER, VOICE[provider], { provider });
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.delete(providerListCache);
		await db.$client.end();
	});

	it.each(PROVIDERS)(
		"%s: 만들면 공급자 1회, 기록 완료, 조각을 받을 수 있다",
		async (provider) => {
			const made = await createOf(provider);
			expect(calls()).toEqual(only(provider));
			expect(await me.studioFindMany([requestOf(provider)])).toEqual([
				{ ...made, status: "done" },
			]);
			const part = await me.studioAudio({ id: made.id, part: 0 });
			expect(part.type).toBe(
				provider === "gemini" ? "audio/wav" : "audio/mpeg",
			);
			expect(await bytes(part)).toEqual(MP3);
		},
	);

	it.each(PROVIDERS)(
		"%s: synthesize에 작업실 대기와 접두어를 넘긴다",
		async (provider) => {
			await createOf(provider);
			expect(fakes[provider].mock.calls[0]?.[1]).toMatchObject({
				timeoutMs: STUDIO_TIMEOUT_MS,
				logPrefix: "[studio]",
			});
		},
	);

	it("Typecast가 아닌 공급자에는 onLate를 넘기지 않는다", async () => {
		for (const provider of PROVIDERS.filter((p) => p !== "typecast")) {
			await createOf(provider);
			expect(fakes[provider].mock.calls[0]?.[1]).not.toHaveProperty("onLate");
		}
	});

	it.each(PROVIDERS)(
		"%s: 성공하면 그 성우 use_count +1, 실패면 그대로",
		async (provider) => {
			await createOf(provider);
			expect(await used(VOICE[provider])).toMatchObject({ useCount: 1 });
			fakes[provider].mockRejectedValueOnce(trialError(provider, "quota"));
			await expect(createOf(provider, "실패할 대본")).rejects.toMatchObject({
				data: { provider, reason: "quota" },
			});
			expect(await used(VOICE[provider])).toMatchObject({ useCount: 1 });
		},
	);

	it("ElevenLabs는 모델 배율로 예상 사용량을 센다(배율 1.5 → 2,000자 3,000크레딧)", async () => {
		const made = await createOf("elevenlabs", "가".repeat(STUDIO_TEXT_MAX));
		expect(made.usage).toEqual({ unit: "credit", amount: 3000 });
		expect(listModels).toHaveBeenCalledTimes(1);
	});

	it("Fish 무료 모델이 끝난 뒤에는 free_ended, 공급자 0회, 기록 없음", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-12-01T00:00:00+09:00"));
		const free = {
			...requestOf("fish_audio"),
			settings: DEFAULT_SETTINGS.fish_audio,
		} as StudioRequest;
		const freeEnded = {
			code: "BAD_REQUEST",
			data: { provider: "fish_audio", reason: "free_ended" },
		};
		await expect(
			me.studioCreate({ requestId: crypto.randomUUID(), request: free }),
		).rejects.toMatchObject(freeEnded);
		// 키 없음보다 먼저 본다(T5 순서)
		await expect(
			as(OWNER, { providers: {} }).studioCreate({
				requestId: crypto.randomUUID(),
				request: free,
			}),
		).rejects.toMatchObject(freeEnded);
		expect(calls()).toEqual(only());
		expect(await rows()).toHaveLength(0);
	});

	it("담지 않은 다른 공급자 성우는 voice_unavailable, 공급자 0회", async () => {
		// Typecast로만 담은 성우 id를 다른 공급자 요청에 넣는다. 공급자가 Typecast로 새면 만들어진다(Ruling 6)
		for (const provider of PROVIDERS.filter((p) => p !== "typecast"))
			await expect(
				me.studioCreate({
					requestId: crypto.randomUUID(),
					request: requestOf(provider, "가", VOICE.typecast),
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { provider, reason: "voice_unavailable" },
			});
		expect(calls()).toEqual(only());
		expect(await rows()).toHaveLength(0);
	});

	it("Airy 1,601자는 BAD_REQUEST, 공급자 0회", async () => {
		await expect(
			createOf("airy", "가".repeat(AIRY_TEXT_MAX + 1)),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(calls()).toEqual(only());
		expect(await rows()).toHaveLength(0);
	});

	it("studioFindMany는 요청 순서대로 done·unknown·null을 돌려주고 공급자 0회", async () => {
		const done = await createOf("elevenlabs", "완료");
		synthesize.mockRejectedValueOnce(trialError("typecast", "unknown_outcome"));
		await expect(createOf("typecast", "미확인")).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
		});
		const before = calls();
		expect(
			await me.studioFindMany([
				requestOf("elevenlabs", "완료"),
				requestOf("typecast", "미확인"),
				requestOf("gemini", "없음"),
			]),
		).toEqual([
			{ ...done, status: "done" },
			{
				id: expect.any(String),
				createdAt: expect.any(String),
				usage: { unit: "credit", amount: 3 },
				bytes: 0,
				status: "unknown",
			},
			null,
		]);
		expect(calls()).toEqual(before);
	});

	it("studioInfo·studioRequest는 공급자를 부르지 않고 만든 결과·실패 사유를 돌려준다(T18)", async () => {
		const requestId = crypto.randomUUID();
		const made = await me.studioCreate({
			requestId,
			request: requestOf("gemini"),
		});
		const failedId = crypto.randomUUID();
		synthesize.mockRejectedValueOnce(trialError("typecast", "quota"));
		await expect(create(undefined, failedId)).rejects.toMatchObject({
			data: { reason: "quota" },
		});
		const before = calls();
		expect(await me.studioInfo({ id: made.id })).toEqual({
			...made,
			audioType: "audio/wav",
		});
		expect(await me.studioRequest({ requestId })).toEqual({
			...made,
			status: "done",
			reason: null,
		});
		const failed = await me.studioRequest({ requestId: failedId });
		expect(failed).toEqual({
			id: expect.any(String),
			createdAt: expect.any(String),
			usage: { unit: "credit", amount: 5 },
			bytes: 0,
			status: "failed",
			reason: "quota",
		});
		await expect(
			me.studioInfo({ id: failed?.id as string }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			me.studioInfo({ id: crypto.randomUUID() }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			await me.studioRequest({ requestId: crypto.randomUUID() }),
		).toBeNull();
		await expect(me.studioInfo({ id: "x" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		await expect(me.studioRequest({ requestId: "x" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(calls()).toEqual(before);
	});

	it("만들면 공급자 1회(180초 기다림), 출력은 오디오 없이 길이만, 조각 0이 같은 바이트, 여러 찾기는 완료 한 줄, 같은 조합 찾기는 공급자 0회(AC1·AC5)", async () => {
		const made = await create();
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(synthesize.mock.calls[0]?.[1]).toMatchObject({
			timeoutMs: STUDIO_TIMEOUT_MS,
		});
		expect(made).toEqual({
			id: expect.any(String),
			createdAt: expect.any(String),
			usage: { unit: "credit", amount: 5 },
			bytes: MP3.byteLength,
		});
		expect(await bytes(await me.studioAudio({ id: made.id, part: 0 }))).toEqual(
			MP3,
		);
		expect(await me.studioFindMany([request()])).toEqual([
			{ ...made, status: "done" },
		]);
		expect((await me.studioFind(request("  안녕하세요 ")))?.id).toBe(made.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
		// 화면별 기록: 캐스팅 결과 목록에는 나오지 않는다
		expect(
			await me.trialList({ provider: "typecast", voiceId: "tc_0001" }),
		).toEqual([]);
	});

	it("같은 요청 id를 동시에 두 번 보내도 공급자 1회, 끝난 뒤 같은 id는 같은 결과(AC4)", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return MP3;
		});
		const id = crypto.randomUUID();
		const first = create(undefined, id);
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		await expect(create(undefined, id)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		release();
		const done = await first;
		expect(await create(undefined, id)).toEqual(done);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("같은 조합이라도 새 요청 id면 다시 만든다(공급자 2회, 기록 둘). 조합 재사용은 화면의 studioFind가 맡는다(디자인 리뷰 DN-6)", async () => {
		const first = await create();
		const second = await create();
		expect(second.id).not.toBe(first.id);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect((await rows()).map((row) => row.id).sort()).toEqual(
			[first.id, second.id].sort(),
		);
		expect((await me.studioFind(request()))?.id).toBe(second.id);
	});

	it("진행 중인 생성이 있으면(캐스팅의 내 문장 포함) in_progress, 공급자 0회(AC4)", async () => {
		const trial: TrialRequest = request("내 문장");
		await claim(db, {
			ownerId: OWNER,
			requestId: crypto.randomUUID(),
			request: trial,
			key: comboKey(trial),
			usage: { unit: "credit", amount: 4 },
		});
		await expect(create()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("담지 않은·이용 불가·다른 공급자로 담은 성우는 voice_unavailable, 공급자 0회, 기록 없음(스펙 5절)", async () => {
		await keep(OWNER, "tc_off", { unavailable: true });
		await keep(OWNER, "tc_el", { provider: "elevenlabs" });
		for (const voiceId of ["tc_none", "tc_off", "tc_el"])
			await expect(
				me.studioCreate({
					requestId: crypto.randomUUID(),
					request: request("가", voiceId),
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { provider: "typecast", reason: "voice_unavailable" },
			});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
	});

	it("빈 대본·공백만·2,001자는 입력 검사에서 거절하고 공급자 0회, 기록 없음. 다른 공급자도 그 공급자로 만든다(AC3, T10)", async () => {
		for (const text of ["", "   ", "가".repeat(STUDIO_TEXT_MAX + 1)])
			await expect(create(text)).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(calls()).toEqual(only());
		expect(await rows()).toHaveLength(0);
		await createOf("elevenlabs");
		expect(calls()).toEqual(only("elevenlabs"));
	});

	it("시간 초과는 미확인(같은 id를 다시 보내도 공급자 0회), 뒤늦은 성공은 같은 행을 완료로 바꾸고 사용 이력 1회(AC7)", async () => {
		let deliver: (audio: Uint8Array) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((resolve) => {
					deliver = resolve;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		const requestId = crypto.randomUUID();
		const timedOut = {
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		};
		await expect(create(undefined, requestId)).rejects.toMatchObject(timedOut);
		expect(await me.studioFindMany([request()])).toMatchObject([
			{ status: "unknown", bytes: 0 },
		]);
		await expect(create(undefined, requestId)).rejects.toMatchObject(timedOut);
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(await used()).toMatchObject({ useCount: 0 });
		deliver(MP3);
		await vi.waitFor(async () =>
			expect((await me.studioFindMany([request()]))[0]?.status).toBe("done"),
		);
		const [item] = await me.studioFindMany([request()]);
		expect(item?.bytes).toBe(MP3.byteLength);
		expect(
			await bytes(await me.studioAudio({ id: item?.id ?? "", part: 0 })),
		).toEqual(MP3);
		// 사용 이력은 완료 쓰기 뒤에 오른다. 상태가 바뀐 순간 아직 안 올랐을 수 있어 기다린다(계획 재리뷰 R3)
		await vi.waitFor(async () =>
			expect(await used()).toMatchObject({ useCount: 1 }),
		);
		expect((await me.studioFind(request()))?.id).toBe(item?.id);
	});

	it("늦은 결과 저장은 context.defer로 한 번 넘기고, 넘긴 작업이 끝나면 행은 완료·사용 이력 1회(T15-a, ADR 0013)", async () => {
		let deliver: (audio: Uint8Array) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((resolve) => {
					deliver = resolve;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		const tasks: Promise<unknown>[] = [];
		const defer = vi.fn((task: Promise<unknown>) => {
			tasks.push(task);
		});
		await expect(
			as(OWNER, { defer }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		expect(defer).toHaveBeenCalledTimes(1);
		deliver(MP3);
		// 넘긴 작업 하나가 저장 전체(완료 쓰기와 사용 이력)를 덮는다. 기다린 뒤 바로 본다
		await Promise.all(tasks);
		expect((await me.studioFindMany([request()]))[0]).toMatchObject({
			status: "done",
			bytes: MP3.byteLength,
		});
		expect(await used()).toMatchObject({ useCount: 1 });
	});

	it("늦은 결과가 없으면 context.defer를 부르지 않는다", async () => {
		const defer = vi.fn();
		await as(OWNER, { defer }).studioCreate({
			requestId: crypto.randomUUID(),
			request: request(),
		});
		expect(defer).not.toHaveBeenCalled();
	});

	it("뒤늦은 실패는 미확인 그대로이고 사용 이력도 그대로다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		let refuse: (error: unknown) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((_resolve, reject) => {
					refuse = reject;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		await expect(create()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		refuse(new TypeError("fetch failed"));
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith("[studio] 늦은 결과 실패: TypeError"),
		);
		expect(await me.studioFindMany([request()])).toMatchObject([
			{ status: "unknown" },
		]);
		expect(await used()).toMatchObject({ useCount: 0 });
	});

	it("3MiB를 넘는 결과도 3MiB 이하 조각으로 받아 이으면 원본이고 범위 밖 조각은 NOT_FOUND(AC6)", async () => {
		const big = new Uint8Array(STUDIO_PART_BYTES * 2 + 7).map(
			(_, i) => (i * 7) % 256,
		);
		synthesize.mockResolvedValueOnce(big);
		const made = await create();
		expect(made.bytes).toBe(big.byteLength);
		const parts = [
			await me.studioAudio({ id: made.id, part: 0 }),
			await me.studioAudio({ id: made.id, part: 1 }),
			await me.studioAudio({ id: made.id, part: 2 }),
		];
		expect(parts.map((part) => part.size)).toEqual([
			STUDIO_PART_BYTES,
			STUDIO_PART_BYTES,
			7,
		]);
		expect(
			Buffer.from(await new Blob(parts).arrayBuffer()).equals(Buffer.from(big)),
		).toBe(true);
		await expect(
			me.studioAudio({ id: made.id, part: 3 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("작업실 오디오는 압축 없이 TOAST 표에(본 행 밖) 둔다(마이그레이션 studio_audio_storage, 계획 리뷰 E10)", async () => {
		// 0으로 채운 1MiB는 압축하면 수 KB가 된다. 압축됐으면 이 테스트가 잡는다
		synthesize.mockResolvedValueOnce(new Uint8Array(1024 * 1024));
		const made = await create();
		const result = await db.execute<{ method: string | null; stored: number }>(
			sql`select pg_column_compression(audio) as method, pg_column_size(audio) as stored from trial_generation where id = ${made.id}`,
		);
		expect(result.rows[0]?.method).toBeNull();
		expect(Number(result.rows[0]?.stored)).toBeGreaterThanOrEqual(1024 * 1024);
	});

	it("성공 1회에 사용 이력 +1이고 보관함 목록에 두 칸이 보인다. 저장된 결과 찾기·내 문장 듣기·실패는 세지 않는다(AC8)", async () => {
		await keep(OWNER, "tc_0002");
		await create();
		const list = await me.savedVoiceList();
		expect(list.find((item) => item.voice.voiceId === "tc_0001")).toMatchObject(
			{ useCount: 1, lastUsedAt: expect.any(String) },
		);
		expect(list.find((item) => item.voice.voiceId === "tc_0002")).toMatchObject(
			{ useCount: 0, lastUsedAt: null },
		);
		await me.studioFind(request());
		await me.trialCreate({
			requestId: crypto.randomUUID(),
			request: request("내 문장"),
		});
		synthesize.mockRejectedValueOnce(trialError("typecast", "quota"));
		await expect(create("실패할 대본")).rejects.toMatchObject({
			data: { reason: "quota" },
		});
		expect(await used()).toMatchObject({ useCount: 1 });
	});

	it("여러 찾기는 작업실의 완료·미확인만 찾고 실패·내 문장은 null(스펙 9절)", async () => {
		const done = await create();
		synthesize.mockRejectedValueOnce(trialError("typecast", "unknown_outcome"));
		await expect(create("미확인")).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
		});
		synthesize.mockRejectedValueOnce(trialError("typecast", "provider_error"));
		await expect(create("실패")).rejects.toMatchObject({ code: "BAD_GATEWAY" });
		await me.trialCreate({
			requestId: crypto.randomUUID(),
			request: request("내 문장"),
		});
		expect(
			await me.studioFindMany([
				request("미확인"),
				request(),
				request("실패"),
				request("내 문장"),
			]),
		).toMatchObject([
			{ status: "unknown" },
			{ id: done.id, status: "done" },
			null,
			null,
		]);
	});

	it("32MiB를 넘는 오디오는 audio_too_large이고 기록은 실패, 사용 이력은 그대로다", async () => {
		synthesize.mockResolvedValueOnce(new Uint8Array(STUDIO_AUDIO_MAX + 1));
		await expect(create()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "audio_too_large" },
		});
		expect((await rows()).map((row) => row.status)).toEqual(["failed"]);
		expect(await used()).toMatchObject({ useCount: 0 });
	});

	it("결과 저장에 실패하면 처리 여부 미확인으로 알리고 사용 이력은 올리지 않는다('스펙과 다른 점' 4)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let failWrites = false;
		const writeFailingDb = new Proxy(db, {
			get(target, key, receiver) {
				if (failWrites && key === "update")
					return () => {
						throw new Error("update");
					};
				return Reflect.get(target, key, receiver);
			},
		}) as Context["db"];
		synthesize.mockImplementationOnce(async () => {
			failWrites = true;
			return MP3;
		});
		await expect(
			as(OWNER, { db: writeFailingDb }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(await used()).toMatchObject({ useCount: 0 });
		expect((await rows()).map((row) => row.status)).toEqual(["pending"]);
	});

	it("대기 중이면 새 요청은 rate_limit(공급자 0회·기록 없음)이고, 같은 요청 id 재생과 성우 검사는 대기 시각보다 먼저다(순서 고정, 수정 F1)", async () => {
		await db
			.insert(providerCooldown)
			.values({ provider: "typecast", until: new Date(Date.now() + 60_000) });
		await expect(create()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: {
				provider: "typecast",
				reason: "rate_limit",
				retryAt: expect.any(String),
			},
		});
		await expect(
			me.studioCreate({
				requestId: crypto.randomUUID(),
				request: request("가", "tc_none"),
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "voice_unavailable" },
		});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
		// 대기 전에 끝난 같은 요청 id(선점·완료를 직접 쓴다)는 대기 중에도 그 결과로 재생한다
		const requestId = crypto.randomUUID();
		const usage = { unit: "credit" as const, amount: 5 };
		const claimed = await claim(db, {
			ownerId: OWNER,
			requestId,
			request: request(),
			key: comboKey(request(), "studio"),
			usage,
			kind: "studio",
		});
		if (claimed.kind !== "claimed") throw new Error("선점 실패");
		await complete(db, OWNER, claimed.id, MP3, "audio/mpeg");
		expect(await create(undefined, requestId)).toEqual({
			id: claimed.id,
			createdAt: claimed.createdAt,
			usage,
			bytes: MP3.byteLength,
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("늦은 결과는 미확인 기록을 쓴 뒤에 받는다: 미확인 쓰기가 늦어도 행은 완료, 사용 이력 1회(라우터 순서 고정, 수정 F2)", async () => {
		let deliver: (audio: Uint8Array) => void = () => {};
		let slowNext = false;
		// 실패 기록(settle)의 update 하나만 늦춘다: 실행 직전에 늦은 오디오를 먼저 보내고 실제 쓰기는 50ms 뒤.
		// saveLate를 settle 앞으로 옮기면 늦은 저장이 아직 진행 중인 행을 만나 오디오를 잃고 행은 미확인으로 남는다
		const slow = (builder: object): object =>
			new Proxy(builder, {
				get(target, key) {
					const value = Reflect.get(target, key);
					if (key === "then")
						return (ok: unknown, fail: unknown) => {
							deliver(MP3);
							setTimeout(() => value.call(target, ok, fail), 50);
						};
					return typeof value === "function"
						? (...args: unknown[]) => slow(value.apply(target, args))
						: value;
				},
			});
		const slowDb = new Proxy(db, {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				if (key !== "update" || !slowNext) return value;
				slowNext = false;
				return (...args: unknown[]) => slow(value.apply(target, args));
			},
		}) as Context["db"];
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((resolve) => {
					deliver = resolve;
				}),
			);
			slowNext = true;
			throw trialError("typecast", "unknown_outcome");
		});
		await expect(
			as(OWNER, { db: slowDb }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		await vi.waitFor(async () =>
			expect((await me.studioFindMany([request()]))[0]).toMatchObject({
				status: "done",
				bytes: MP3.byteLength,
			}),
		);
		await vi.waitFor(async () =>
			expect(await used()).toMatchObject({ useCount: 1 }),
		);
	});

	it("자동 태그 추천은 대기 시각 표를 쓰지도 읽지도 않는다: 429 뒤 행 0개, Gemini 대기 중에도 부른다(T10 스펙 15.3)", async () => {
		suggestActing.mockReset();
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		suggestActing.mockRejectedValueOnce(
			trialError("gemini", "rate_limit", { retryAt }),
		);
		await expect(autoTag(undefined, me)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { provider: "gemini", reason: "rate_limit", retryAt },
		});
		expect(await db.select().from(providerCooldown)).toHaveLength(0);
		await db
			.insert(providerCooldown)
			.values({ provider: "gemini", until: new Date(Date.now() + 60_000) });
		await expect(autoTag(undefined, me)).resolves.toMatchObject({ skipped: 0 });
		expect(suggestActing).toHaveBeenCalledTimes(2);
		expect(await rows()).toHaveLength(0);
	});
});
