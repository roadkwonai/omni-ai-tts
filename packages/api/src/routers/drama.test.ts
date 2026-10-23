import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRouterClient } from "@orpc/server";
import { providerCooldown } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq } from "drizzle-orm";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { z } from "zod";

import type { Context } from "../context";
import { autoTagPrompt } from "../drama-acting";
import type { dramaAutoTagInputSchema } from "../drama-contract";
import * as dramaScript from "../drama-script";
import {
	type AlignedSegment,
	DRAMA_MODELS,
	DRAMA_SETTINGS,
	type DramaLine,
	type DramaModel,
	type DramaSpeaker,
	type SceneAudio,
	type SceneRequest,
	sceneText,
	WAV_HEADER_BYTES,
	wavOf,
} from "../drama-script";
import {
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
	trialError,
} from "../providers/errors";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	type TrialRequest,
	utf8Bytes,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import * as trialModule from "../trial";
import { claim, claimRow, comboKey, complete } from "../trial";
import { appRouter } from "./index";

// 가짜 결과: PCM 자료(2026-10-22)의 4줄 대본과 정렬, 0으로 채운 PCM(13.5초)
const fixture = (name: string) =>
	readFileSync(
		fileURLToPath(
			new URL(
				`../../../../docs/research/data/fish-drama-pcm-2026-10-22/${name}`,
				import.meta.url,
			),
		),
		"utf8",
	);
const WORDS = JSON.parse(fixture("words.json")) as AlignedSegment[];
const PCM_BYTES = 1_190_720;
const WAV_BYTES = WAV_HEADER_BYTES + PCM_BYTES;
// Task 2 "PCM 자료: 4줄 구간" 기대값 [start, end, cutStart, cutEnd]
const SPANS = [
	[0, 2.96, 0, 3.28],
	[3.6, 7.28, 3.28, 7.36],
	[7.44, 9.76, 7.36, 9.922630385487528],
	[
		10.085260770975056, 13.365260770975055, 9.922630385487528,
		13.500226757369614,
	],
];
const spansLike = SPANS.map(([start, end, cutStart, cutEnd]) => ({
	start: expect.closeTo(start as number, 6),
	end: expect.closeTo(end as number, 6),
	cutStart: expect.closeTo(cutStart as number, 6),
	cutEnd: expect.closeTo(cutEnd as number, 6),
}));

const OWNER = `drama-r-${Date.now()}`;
const JIYEON = "fa_jiyeon";
const MINSU = "fa_minsu";
const SPEAKERS: DramaSpeaker[] = [
	{ name: "지연", voiceId: JIYEON },
	{ name: "민수", voiceId: MINSU },
];
const LINES: DramaLine[] = [
	{
		speaker: 0,
		direction: "놀라며",
		text: "너 지금 몇 시인지 알아? 회의 벌써 시작했어.",
	},
	{
		speaker: 1,
		direction: "sighs",
		text: "알아, 알아. 버스를 놓쳐서 한 대 더 기다렸어.",
	},
	{
		speaker: 0,
		direction: "",
		text: "<whisper>팀장님은 아직 모르셔.</whisper> 빨리 들어가.",
	},
	{
		speaker: 1,
		direction: "laughs",
		text: "고마워, 진짜. 오늘 커피는 내가 살게.",
	},
];
const drama = (
	over: {
		model?: DramaModel;
		speakers?: DramaSpeaker[];
		lines?: DramaLine[];
		sceneName?: string;
	} = {},
) => ({
	sceneName: "지각",
	speakers: SPEAKERS,
	lines: LINES,
	model: "s2.1-pro" as DramaModel,
	settings: DRAMA_SETTINGS,
	...over,
});
const scene = (over: Partial<SceneAudio> = {}): SceneAudio => ({
	pcm: new Uint8Array(PCM_BYTES),
	segments: WORDS,
	...over,
});
const synthesizeScene = vi.fn(
	async (_scene: SceneRequest, _options?: SynthesizeOptions<SceneAudio>) =>
		scene(),
);
// 가짜 자동 태그(Gemini 텍스트 모델). 기본 답은 제안 없음(모든 줄 원래 값)
const suggestActing = vi.fn(
	async (_prompt: ReturnType<typeof autoTagPrompt>): Promise<string | null> =>
		JSON.stringify({ lines: [] }),
);
const providers: Providers = {
	fish_audio: { checkStatus: vi.fn(), synthesizeScene },
	gemini: { checkStatus: vi.fn(), suggestActing },
};
const as = (ownerId: string | null, ctx: Partial<Context> = {}) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers, ...ctx } as Context,
	});
const me = as(OWNER);
const create = (
	request: ReturnType<typeof drama> = drama(),
	requestId: string = crypto.randomUUID(),
) => me.dramaCreate({ requestId, request });
const keep = (
	ownerId: string,
	voiceId: string,
	over: { provider?: "fish_audio" | "typecast"; unavailable?: boolean } = {},
) => {
	const provider = over.provider ?? "fish_audio";
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
const used = async (voiceId: string) => {
	const [found] = await db
		.select({ useCount: savedVoice.useCount })
		.from(savedVoice)
		.where(
			and(
				eq(savedVoice.ownerId, OWNER),
				eq(savedVoice.provider, "fish_audio"),
				eq(savedVoice.voiceId, voiceId),
			),
		);
	return found?.useCount;
};
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
const rows = () => db.select().from(trialGeneration);
// 이 소유자의 생성 기록(실패 행 포함, dramaList는 실패 행을 숨긴다)
const ownerRows = () =>
	db.select().from(trialGeneration).where(eq(trialGeneration.ownerId, OWNER));
const sent = () => synthesizeScene.mock.calls.map(([request]) => request);
// 음성 작업실(typecast) 기록 하나. 화면별 기록 검사에 쓴다
const typecast = (text: string): TrialRequest => ({
	provider: "typecast",
	voiceId: "tc_0001",
	text,
	settings: DEFAULT_SETTINGS.typecast,
});
async function otherRow(kind: "trial" | "studio", done = true) {
	const request = typecast(`${kind} 문장`);
	const claimed = await claim(db, {
		ownerId: OWNER,
		requestId: crypto.randomUUID(),
		request,
		key: comboKey(request, kind),
		usage: { unit: "credit", amount: 4 },
		kind,
	});
	if (claimed.kind !== "claimed") throw new Error("선점 실패");
	if (done)
		await complete(
			db,
			OWNER,
			claimed.id,
			new Uint8Array([0xff, 0xfb]),
			"audio/mpeg",
		);
	return claimed.id;
}
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

// DB를 쓰지 않는 테스트는 skipIf 밖에 둬 TEST_DATABASE_URL이 없어도 늘 돈다(T9 계획 리뷰 E4)
describe("드라마 프로시저: DB 없이(T9.5 스펙 5절)", () => {
	beforeEach(() => {
		synthesizeScene.mockClear();
		dbTouches = 0;
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("키 없음 → no_key, DB·공급자 0회", async () => {
		await expect(
			as(OWNER, {
				db: failingDb,
				providers: { fish_audio: { checkStatus: vi.fn() } },
			}).dramaCreate({ requestId: crypto.randomUUID(), request: drama() }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider: "fish_audio", reason: "no_key" },
		});
		expect(dbTouches).toBe(0);
		expect(synthesizeScene).not.toHaveBeenCalled();
	});

	it("무료 기간 뒤 s2.1-pro-free → free_ended(키 검사보다 먼저), DB·공급자 0회", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(FISH_FREE_UNTIL);
		await expect(
			as(OWNER, { db: failingDb, providers: {} }).dramaCreate({
				requestId: crypto.randomUUID(),
				request: drama({ model: "s2.1-pro-free" }),
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { provider: "fish_audio", reason: "free_ended" },
		});
		expect(dbTouches).toBe(0);
		expect(synthesizeScene).not.toHaveBeenCalled();
	});

	it("DB가 실패하면 공급자를 부르지 않고 storage, 목록도 storage", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const broken = as(OWNER, { db: failingDb });
		await expect(
			broken.dramaCreate({ requestId: crypto.randomUUID(), request: drama() }),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		});
		expect(dbTouches).toBeGreaterThan(0);
		expect(synthesizeScene).not.toHaveBeenCalled();
		await expect(broken.dramaList()).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
	});
});

type AutoTagInput = z.input<typeof dramaAutoTagInputSchema>;
type TagLine = AutoTagInput["lines"][number];
const TAG_SPEAKERS: AutoTagInput["speakers"] = [
	{ name: "지연", provider: "fish_audio", model: "drama-3", emotions: null },
	{
		name: "민수",
		provider: "typecast",
		model: "ssfm-v30",
		emotions: ["normal", "happy", "sad"],
	},
	{
		name: "하나",
		provider: "elevenlabs",
		model: "eleven_multilingual_v2",
		emotions: null,
	},
	{ name: "솔", provider: "airy", model: "airy-tts-v1", emotions: null },
];
const fishLine = (text: string, direction = ""): TagLine => ({
	speaker: 0,
	direction,
	text,
});
const autoTag = (
	over: Partial<AutoTagInput> = {},
	client = as(OWNER, { db: failingDb }),
) =>
	client.dramaAutoTag({
		mode: "read",
		speakers: TAG_SPEAKERS,
		lines: [fishLine("안녕.")],
		...over,
	});
// 모델 답 한 줄. 지정하지 않은 칸은 빈 제안이다(빈 대사는 대사가 바뀐 것이라 원래 대사로 남는다)
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
const answer = (...lines: ReturnType<typeof tip>[]) =>
	suggestActing.mockResolvedValueOnce(JSON.stringify({ lines }));
const autoTagFailed = {
	code: "BAD_REQUEST",
	data: {
		provider: "gemini",
		reason: "provider_input",
		providerCode: "auto_tag_reply",
	},
};

// 자동 태그는 DB를 쓰지 않는다. failingDb로 DB 접근 0회를 함께 본다(T9.5 스펙 14.5·14.7)
describe("전체 자동 태그 dramaAutoTag(T9.5 스펙 14.5)", () => {
	beforeEach(() => {
		suggestActing.mockReset();
		dbTouches = 0;
	});
	afterEach(() => {
		expect(dbTouches).toBe(0);
	});

	it("허용 값만 남는다: 화자 공급자·모델의 값, 성우 감정으로 좁힘, 원래 감정 유지, skipped는 태그 없는 ElevenLabs 줄 수", async () => {
		const lines: TagLine[] = [
			fishLine("너 지금 몇 시인지 알아?"),
			{ speaker: 1, direction: "", text: "알아, 알아." },
			{ speaker: 2, direction: "", text: "빨리 들어가." },
			{ speaker: 3, direction: "", text: "고마워." },
			{
				speaker: 1,
				direction: "",
				text: "오늘 커피는 내가 살게.",
				feel: { typecast: { emotion: "sad", intensity: 1 } },
			},
		];
		answer(
			tip(0, {
				direction: "icy calm",
				text: "[sighs] 너 지금 몇 시인지 알아?",
			}),
			// Typecast는 지시·대사 태그가 없고 감정만 받는다. 강도는 0.5 눈금
			tip(1, {
				direction: "calm",
				text: "[sighs] 알아, 알아.",
				emotion: "happy",
				intensity: 1.4,
			}),
			tip(2, {
				direction: "excited",
				text: "[laughs] 빨리 들어가.",
				emotion: "happy",
			}),
			tip(3, { direction: "calm", text: "<laugh> 고마워.", emotion: "bright" }),
			// 이 성우에 없는 감정·한국어 태그는 버린다
			tip(4, {
				text: "[한숨] 오늘 커피는 내가 살게.",
				emotion: "angry",
				intensity: 2,
			}),
		);
		await expect(autoTag({ lines })).resolves.toEqual({
			lines: [
				{ direction: "icy calm", text: "[sighs] 너 지금 몇 시인지 알아?" },
				{
					direction: "",
					text: "알아, 알아.",
					feel: { typecast: { emotion: "happy", intensity: 1.5 } },
				},
				{ direction: "", text: "빨리 들어가." },
				{ direction: "", text: "고마워.", feel: { airy: { style: "bright" } } },
				{
					direction: "",
					text: "오늘 커피는 내가 살게.",
					feel: { typecast: { emotion: "sad", intensity: 1 } },
				},
			],
			skipped: 1,
		});
		expect(suggestActing).toHaveBeenCalledTimes(1);
		expect(suggestActing.mock.calls[0]?.[0]).toEqual(
			autoTagPrompt(
				[
					{ name: "지연", family: "fish_drama", emotions: null },
					{
						name: "민수",
						family: "typecast_v30",
						emotions: ["normal", "happy", "sad"],
					},
					{ name: "하나", family: "elevenlabs_plain", emotions: null },
					{ name: "솔", family: "airy", emotions: null },
				],
				lines,
			),
		);
	});

	it("index가 빠진 줄은 원래 값, 중복이면 첫 제안, 범위 밖 index는 버린다", async () => {
		answer(
			tip(0, { direction: "icy calm" }),
			tip(0, { direction: "heavy, deflated sadness" }),
			tip(2, { direction: "sarcastic and deadpan" }),
			tip(7, { direction: "icy calm" }),
			tip(-1, { direction: "icy calm" }),
		);
		const result = await autoTag({
			lines: [fishLine("하나."), fishLine("둘.", "놀라며"), fishLine("셋.")],
		});
		expect(result.lines).toEqual([
			{ direction: "icy calm", text: "하나." },
			{ direction: "놀라며", text: "둘." },
			{ direction: "sarcastic and deadpan", text: "셋." },
		]);
	});

	it("깨진 글·모양이 다른 글·답 없음 → auto_tag_reply이고 data에 대본이 없다", async () => {
		for (const reply of [
			'{"lines":[{"index":0,"direction":"icy',
			'{"lines":"x"}',
			"[]",
			JSON.stringify({ lines: [{ ...tip(0), index: 0.5 }] }),
			null,
		]) {
			suggestActing.mockResolvedValueOnce(reply);
			const error = await autoTag().catch((caught: unknown) => caught);
			expect(error).toMatchObject(autoTagFailed);
			expect((error as { data?: unknown }).data).toEqual(autoTagFailed.data);
		}
	});

	it("OpenAI·Gemini 키 없음(Gemini는 클라이언트 없음·자동 태그 없음) → no_key + openai_account, 공급자 0회", async () => {
		for (const gemini of [undefined, { checkStatus: vi.fn() }])
			await expect(
				autoTag(
					{},
					as(OWNER, {
						db: failingDb,
						providers: { fish_audio: providers.fish_audio, gemini },
					}),
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

	// 호출 순서는 askSuggestions 한 곳이다(T10 스펙 16.1). 문단 작업실 테스트가 전체 경우를 본다
	describe("OpenAI 우선, Gemini 보조", () => {
		const openai = vi.fn(async (_prompt: unknown) => null as string | null);
		const withOpenai = (extra: Partial<Providers> = {}) =>
			as(OWNER, {
				db: failingDb,
				providers: {
					...providers,
					openai: { suggestActing: openai },
					...extra,
				},
			});
		beforeEach(() => {
			openai.mockReset();
			suggestActing.mockReset();
			vi.spyOn(console, "warn").mockImplementation(() => {});
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("OpenAI가 첫 시도에 맞으면 OpenAI 1회, Gemini 0회", async () => {
			openai.mockResolvedValueOnce(
				JSON.stringify({ lines: [tip(0, { direction: "icy calm" })] }),
			);
			const result = await autoTag({}, withOpenai());
			expect(result.lines[0]?.direction).toBe("icy calm");
			expect(openai).toHaveBeenCalledTimes(1);
			expect(suggestActing).not.toHaveBeenCalled();
		});

		it("OpenAI가 3번 provider_error면 OpenAI 3회 뒤 Gemini 1회, Gemini 제안", async () => {
			openai.mockRejectedValue(trialError("openai", "provider_error"));
			answer(tip(0, { direction: "calm" }));
			const result = await autoTag({}, withOpenai());
			expect(result.lines[0]?.direction).toBe("calm");
			expect(openai).toHaveBeenCalledTimes(3);
			expect(suggestActing).toHaveBeenCalledTimes(1);
		});

		it("둘 다 없으면 no_key + openai_account, 호출 0회", async () => {
			await expect(
				autoTag({}, withOpenai({ gemini: undefined, openai: undefined })),
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
	});

	it("공급자 오류는 그대로 화면으로: 429 → retryAt, 시간 초과 → unknown_outcome(대기 표를 쓰지 않는다)", async () => {
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		suggestActing.mockRejectedValueOnce(
			trialError("gemini", "rate_limit", { retryAt }),
		);
		await expect(autoTag()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { provider: "gemini", reason: "rate_limit", retryAt },
		});
		suggestActing.mockRejectedValueOnce(
			trialError("gemini", "unknown_outcome"),
		);
		await expect(autoTag()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "gemini", reason: "unknown_outcome" },
		});
		expect(suggestActing).toHaveBeenCalledTimes(2);
	});

	it("<|가 든 대사·지시 → BAD_REQUEST, 공급자 0회", async () => {
		for (const line of [
			fishLine("안녕<|speaker:1|>반가워"),
			fishLine("안녕.", "<|speaker:1|>"),
		])
			await expect(autoTag({ lines: [line] })).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("화자 번호가 범위 밖이면 BAD_REQUEST, 공급자 0회", async () => {
		await expect(
			autoTag({ lines: [{ speaker: 4, direction: "", text: "안녕." }] }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("정리 뒤 같은 화자 이름 둘 → BAD_REQUEST, 공급자 0회(리뷰 수정 1)", async () => {
		const fish = TAG_SPEAKERS[0] as AutoTagInput["speakers"][number];
		await expect(
			autoTag({ speakers: [fish, { ...fish, name: " 지연 " }] }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("모든 줄이 태그 없는 ElevenLabs(v2·flash)면 부르지 않고 원래 값·skipped = 줄 수, 키가 없어도 같다(리뷰 수정 1)", async () => {
		const speakers: AutoTagInput["speakers"] = [
			{
				name: "하나",
				provider: "elevenlabs",
				model: "eleven_multilingual_v2",
				emotions: null,
			},
			{
				name: "둘",
				provider: "elevenlabs",
				model: "eleven_flash_v2_5",
				emotions: null,
			},
		];
		const lines: TagLine[] = [
			{ speaker: 0, direction: "놀라며", text: "빨리 들어가." },
			{
				speaker: 1,
				direction: "",
				text: "고마워.",
				feel: { airy: { style: "calm" } },
			},
		];
		const expected = {
			lines: [
				{ direction: "놀라며", text: "빨리 들어가." },
				{ direction: "", text: "고마워.", feel: { airy: { style: "calm" } } },
			],
			skipped: 2,
		};
		await expect(autoTag({ speakers, lines })).resolves.toEqual(expected);
		const noKey = as(OWNER, {
			db: failingDb,
			providers: { fish_audio: providers.fish_audio },
		});
		await expect(autoTag({ speakers, lines }, noKey)).resolves.toEqual(
			expected,
		);
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("대본 합계 2,000자는 보내고 2,001자는 BAD_REQUEST·공급자 0회(계획 리뷰 M4)", async () => {
		const full = Array.from({ length: 6 }, () => fishLine("가".repeat(300)));
		await expect(
			autoTag({ lines: [...full, fishLine("가".repeat(200))] }),
		).resolves.toMatchObject({ skipped: 0 });
		expect(suggestActing).toHaveBeenCalledTimes(1);
		suggestActing.mockClear();
		await expect(
			autoTag({ lines: [...full, fishLine("가".repeat(201))] }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(suggestActing).not.toHaveBeenCalled();
	});

	it("장면 모드: 1,990자 대본에 지시를 넣어 2,000자를 넘으면 뒤 줄부터 원래 값(읽기 모드는 그대로, '스펙과 다른 점' 23)", async () => {
		// 300자 6줄 + 190자 1줄 = 1,990자. 지시 "icy calm"(8자)을 모두 받으면 2,046자
		const lines = [
			...Array.from({ length: 6 }, () => fishLine("가".repeat(300))),
			fishLine("가".repeat(190)),
		];
		const all = lines.map((_, index) => tip(index, { direction: "icy calm" }));
		answer(...all);
		const scene = await autoTag({ mode: "scene", lines });
		// 첫 줄만 남아야 1,998자다(둘째 줄까지면 2,006자)
		expect(scene.lines.map((line) => line.direction)).toEqual([
			"icy calm",
			"",
			"",
			"",
			"",
			"",
			"",
		]);
		expect(dramaScript.sceneChars(scene.lines)).toBe(1998);
		// 읽기는 합계로 되돌리지 않는다. 줄마다 읽기 200자 안(181자 + "[icy calm] ")이고 합계는 1,991자 → 2,079자
		const short = Array.from({ length: 11 }, () => fishLine("가".repeat(181)));
		answer(...short.map((_, index) => tip(index, { direction: "icy calm" })));
		const read = await autoTag({ mode: "read", lines: short });
		expect(read.lines.every((line) => line.direction === "icy calm")).toBe(
			true,
		);
		expect(dramaScript.sceneChars(read.lines)).toBe(2079);
	});

	it("소유자 없음 → UNAUTHORIZED, 공급자·DB 0회", async () => {
		await expect(
			autoTag({}, as(null, { db: failingDb })),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(suggestActing).not.toHaveBeenCalled();
	});
});

describe.skipIf(!url)("드라마 프로시저(T9.5 스펙 3·8절)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		synthesizeScene.mockClear();
		await keep(OWNER, JIYEON);
		await keep(OWNER, MINSU);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("담지 않은 성우·이용 불가·Typecast로 담은 같은 id → voice_unavailable, 공급자 0회, 기록 없음", async () => {
		await keep(OWNER, "fa_off", { unavailable: true });
		await keep(OWNER, "fa_tc", { provider: "typecast" });
		for (const voiceId of ["fa_none", "fa_off", "fa_tc"])
			await expect(
				create(
					drama({
						speakers: [SPEAKERS[0] as DramaSpeaker, { name: "민수", voiceId }],
					}),
				),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { provider: "fish_audio", reason: "voice_unavailable" },
			});
		expect(synthesizeScene).not.toHaveBeenCalled();
		// 거절한 요청은 실패 행도 남기지 않는다(표를 직접 읽는다)
		expect(await ownerRows()).toHaveLength(0);
	});

	it("같은 요청 id 재생은 성우 검사보다 먼저다: 성우가 이용 불가가 돼도 같은 결과, 공급자 1회", async () => {
		const id = crypto.randomUUID();
		const made = await create(drama(), id);
		await db
			.update(savedVoice)
			.set({ unavailable: true })
			.where(
				and(eq(savedVoice.ownerId, OWNER), eq(savedVoice.voiceId, JIYEON)),
			);
		expect(await create(drama(), id)).toEqual(made);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		// 새 요청 id는 성우 검사에 걸린다(재생이 검사를 건너뛴 것임을 확인한다)
		await expect(create()).rejects.toMatchObject({
			data: { reason: "voice_unavailable" },
		});
	});

	it("쓰이지 않는 화자의 성우는 검사하지 않는다(보내지도 않는다)", async () => {
		await create(
			drama({
				speakers: [...SPEAKERS, { name: "하나", voiceId: "fa_none" }],
			}),
		);
		expect(sent()[0]?.referenceIds).toEqual([JIYEON, MINSU]);
	});

	it("대기 시각 → rate_limit(공급자 0회·기록 없음). 같은 요청 id 재생은 대기 시각보다 먼저다", async () => {
		const requestId = crypto.randomUUID();
		const made = await create(drama(), requestId);
		synthesizeScene.mockClear();
		await db
			.insert(providerCooldown)
			.values({ provider: "fish_audio", until: new Date(Date.now() + 60_000) });
		await expect(create()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: {
				provider: "fish_audio",
				reason: "rate_limit",
				retryAt: expect.any(String),
			},
		});
		expect(await create(drama(), requestId)).toEqual(made);
		expect(synthesizeScene).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(1);
	});

	it("자동 태그는 대기 시각 표를 쓰지도 읽지도 않는다: 429 뒤 행 0개, Gemini 대기 중에도 부른다(T9.5 스펙 14.5)", async () => {
		suggestActing.mockReset();
		suggestActing.mockRejectedValueOnce(
			trialError("gemini", "rate_limit", {
				retryAt: new Date(Date.now() + 60_000).toISOString(),
			}),
		);
		await expect(autoTag({}, me)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { provider: "gemini", reason: "rate_limit" },
		});
		expect(await db.select().from(providerCooldown)).toHaveLength(0);
		await db
			.insert(providerCooldown)
			.values({ provider: "gemini", until: new Date(Date.now() + 60_000) });
		await expect(autoTag({}, me)).resolves.toMatchObject({ skipped: 0 });
		expect(suggestActing).toHaveBeenCalledTimes(2);
		expect(await rows()).toHaveLength(0);
	});

	it("같은 성우 두 화자 → 통과, referenceIds 둘(같은 id), 사용 이력 1(E16-1)", async () => {
		await create(
			drama({
				speakers: [
					{ name: "지연", voiceId: JIYEON },
					{ name: "민수", voiceId: JIYEON },
				],
			}),
		);
		expect(sent()[0]?.referenceIds).toEqual([JIYEON, JIYEON]);
		expect(await used(JIYEON)).toBe(1);
		expect(await used(MINSU)).toBe(0);
	});

	it("모델 헤더 값이 그대로 넘어가고 사용량은 usd_micro·free다", async () => {
		// 무료 기간·Drama 3 출시가 안에 드는 시각으로 고정한다(날짜가 지나도 같은 결과)
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-01T00:00:00+09:00"));
		const n = utf8Bytes(sceneText(drama()).text);
		const usage = {
			"s2.1-pro-free": { unit: "free", amount: 0 },
			"s2.1-pro": { unit: "usd_micro", amount: n * 15 },
			"drama-3": { unit: "usd_micro", amount: n * 10 },
		};
		for (const model of DRAMA_MODELS)
			expect((await create(drama({ model }))).usage).toEqual(usage[model]);
		expect(sent().map((request) => request.model)).toEqual([...DRAMA_MODELS]);
	});

	it("scene.text·referenceIds가 sceneText와 같고 설정이 함께 가며 180초를 기다린다", async () => {
		await create(drama({ model: "drama-3" }));
		const { text, referenceIds } = sceneText(drama());
		expect(text).toBe(fixture("request-text.txt").trim());
		expect(synthesizeScene.mock.calls[0]?.[0]).toEqual({
			model: "drama-3",
			text,
			referenceIds,
			...DRAMA_SETTINGS,
		});
		expect(synthesizeScene.mock.calls[0]?.[1]).toMatchObject({
			timeoutMs: STUDIO_TIMEOUT_MS,
		});
	});

	it("같은 요청 id 동시 두 번 → 공급자 1회, 끝난 뒤 같은 id는 같은 결과", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesizeScene.mockImplementationOnce(async () => {
			await gate;
			return scene();
		});
		const id = crypto.randomUUID();
		const first = create(drama(), id);
		await vi.waitFor(() => expect(synthesizeScene).toHaveBeenCalledTimes(1));
		await expect(create(drama(), id)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		release();
		const done = await first;
		expect(await create(drama(), id)).toEqual(done);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
	});

	it("겹친 선점: 같은 요청 id 둘이 모두 첫 재생을 지나면 하나는 선점 충돌 뒤 in_progress, 공급자 1회, 다른 하나는 풀린 뒤 끝난다", async () => {
		// 실제 재생을 부르되 두 요청의 첫 재생(아직 행 없음 → null)이 모두 끝날 때까지 붙잡는다.
		// 그래서 둘 다 선점까지 가고 하나가 충돌한다(시각에 기대지 않는다)
		const realReplay = trialModule.replayStudio;
		let arrived = 0;
		let bothPassed = () => {};
		const barrier = new Promise<void>((resolve) => {
			bothPassed = resolve;
		});
		const replay = vi
			.spyOn(trialModule, "replayStudio")
			.mockImplementation(async (...args) => {
				const result = await realReplay(...args);
				if (arrived < 2) {
					arrived += 1;
					if (arrived === 2) bothPassed();
					await barrier;
				}
				return result;
			});
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesizeScene.mockImplementationOnce(async () => {
			await gate;
			return scene();
		});
		const id = crypto.randomUUID();
		const settled = [create(drama(), id), create(drama(), id)].map((call) =>
			call.then(
				(value) => ({ value }),
				(error: unknown) => ({ error }),
			),
		);
		// 공급자가 막혀 있어 먼저 끝나는 쪽은 충돌한 요청이다
		expect(await Promise.race(settled)).toMatchObject({
			error: { code: "TOO_MANY_REQUESTS", data: { reason: "in_progress" } },
		});
		// 첫 재생 둘 + 선점 충돌 뒤 재생 하나(drama.ts의 existing 분기)
		expect(replay).toHaveBeenCalledTimes(3);
		await vi.waitFor(() => expect(synthesizeScene).toHaveBeenCalledTimes(1));
		release();
		const results = await Promise.all(settled);
		expect(results.filter((result) => "error" in result)).toHaveLength(1);
		expect(results.find((result) => "value" in result)).toMatchObject({
			value: { bytes: WAV_BYTES, segments: spansLike },
		});
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		expect(await ownerRows()).toHaveLength(1);
	});

	it("같은 대본 다른 요청 id → 테이크 2개(공급자 2회)", async () => {
		const first = await create();
		const second = await create();
		expect(second.id).not.toBe(first.id);
		expect(synthesizeScene).toHaveBeenCalledTimes(2);
		expect((await me.dramaList()).map((item) => item.id)).toEqual([
			second.id,
			first.id,
		]);
	});

	it("같은 요청 id 다른 요청 → request_mismatch, 공급자 다시 부르지 않음", async () => {
		const id = crypto.randomUUID();
		await create(drama(), id);
		await expect(
			create(drama({ sceneName: "다른 장면" }), id),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { provider: "fish_audio", reason: "request_mismatch" },
		});
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
	});

	it("시간 초과 뒤 같은 요청 id 재전송 → unknown_outcome, 공급자 0회(E11)", async () => {
		synthesizeScene.mockRejectedValueOnce(
			trialError("fish_audio", "unknown_outcome"),
		);
		const id = crypto.randomUUID();
		const timedOut = {
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		};
		await expect(create(drama(), id)).rejects.toMatchObject(timedOut);
		await expect(create(drama(), id)).rejects.toMatchObject(timedOut);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
	});

	it("진행 중인 trial·studio 기록이 있으면 in_progress, 공급자 0회", async () => {
		for (const kind of ["trial", "studio"] as const) {
			await db.delete(trialGeneration);
			const other = await otherRow(kind, false);
			await expect(create()).rejects.toMatchObject({
				code: "TOO_MANY_REQUESTS",
				data: { reason: "in_progress" },
			});
			// 거절한 드라마 요청은 행을 남기지 않는다(진행 중인 다른 화면의 행만 있다)
			expect((await ownerRows()).map((row) => row.id)).toEqual([other]);
		}
		expect(synthesizeScene).not.toHaveBeenCalled();
	});

	it("성공 → done, audio/wav, bytes = 44 + PCM, segments 4개, 화자 성우 각 사용 이력 1", async () => {
		const made = await create();
		expect(made).toEqual({
			id: expect.any(String),
			createdAt: expect.any(String),
			usage: {
				unit: "usd_micro",
				amount: utf8Bytes(sceneText(drama()).text) * 15,
			},
			bytes: WAV_BYTES,
			segments: spansLike,
		});
		const [row] = await rows();
		expect(row).toMatchObject({
			kind: "drama",
			status: "done",
			audioType: "audio/wav",
			provider: "fish_audio",
			voiceId: `${JIYEON},${MINSU}`,
			model: "s2.1-pro",
		});
		const audio = await me.dramaAudio({ id: made.id, part: 0 });
		expect(audio.type).toBe("audio/wav");
		expect(await bytes(audio)).toEqual(wavOf(new Uint8Array(PCM_BYTES)));
		expect(await used(JIYEON)).toBe(1);
		expect(await used(MINSU)).toBe(1);
	});

	it("나누기 실패(대사를 바꾼 대본) → done, segments null", async () => {
		const lines = LINES.map((line, i) =>
			i === 3
				? { ...line, text: "고마워, 정말. 오늘 커피는 내가 살게." }
				: line,
		);
		const made = await create(drama({ lines }));
		expect(made).toMatchObject({ bytes: WAV_BYTES, segments: null });
		expect((await rows())[0]).toMatchObject({ status: "done", segments: null });
	});

	it("정렬 없음 → done, segments null", async () => {
		synthesizeScene.mockResolvedValueOnce(scene({ segments: null }));
		const made = await create();
		expect(made).toMatchObject({ bytes: WAV_BYTES, segments: null });
		expect((await rows())[0]).toMatchObject({ status: "done", segments: null });
	});

	it("나누기가 예외를 던져도 done·segments null이고 로그에 오류 이름만 남긴다(E9)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(dramaScript, "splitLines").mockImplementation(() => {
			throw new TypeError("너 지금 몇 시인지");
		});
		const made = await create();
		expect(made).toMatchObject({ bytes: WAV_BYTES, segments: null });
		expect((await rows())[0]).toMatchObject({ status: "done", segments: null });
		expect(log).toHaveBeenCalledWith("[drama] 나누기 실패: TypeError");
		expect(await used(JIYEON)).toBe(1);
	});

	it("WAV 32MiB 초과 → audio_too_large, 기록 failed, 사용 이력 그대로", async () => {
		synthesizeScene.mockResolvedValueOnce(
			scene({ pcm: new Uint8Array(STUDIO_AUDIO_MAX - WAV_HEADER_BYTES + 2) }),
		);
		await expect(create()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "audio_too_large" },
		});
		expect((await rows()).map((row) => row.status)).toEqual(["failed"]);
		expect(await used(JIYEON)).toBe(0);
	});

	it("결과 저장에 실패하면 미확인 행으로 적고 unknown_outcome, 사용 이력은 올리지 않는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		// 공급자 뒤 첫 update(완료 기록)만 실패시키고 이어지는 미확인 기록(settle)은 쓴다
		let failNext = false;
		const writeFailingDb = new Proxy(db, {
			get(target, key, receiver) {
				if (failNext && key === "update") {
					failNext = false;
					return () => {
						throw new Error("update");
					};
				}
				return Reflect.get(target, key, receiver);
			},
		}) as Context["db"];
		synthesizeScene.mockImplementationOnce(async () => {
			failNext = true;
			return scene();
		});
		await expect(
			as(OWNER, { db: writeFailingDb }).dramaCreate({
				requestId: crypto.randomUUID(),
				request: drama(),
			}),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(log).toHaveBeenCalledWith("[drama] 완료 기록 실패: Error");
		expect(await used(JIYEON)).toBe(0);
		expect(await ownerRows()).toMatchObject([
			{ status: "unknown", failureReason: "unknown_outcome", audio: null },
		]);
		expect(await me.dramaList()).toMatchObject([
			{ status: "unknown", bytes: 0 },
		]);
	});

	// 끊긴 요청의 늦은 결과를 넘기고 미확인으로 끝나는 가짜. 늦은 결과는 돌려준 함수로 정한다
	const lateOnce = () => {
		const late: {
			deliver: (audio: SceneAudio) => void;
			refuse: (error: unknown) => void;
		} = { deliver: () => {}, refuse: () => {} };
		synthesizeScene.mockImplementationOnce(async (_scene, options) => {
			options?.onLate?.(
				new Promise<SceneAudio>((resolve, reject) => {
					late.deliver = resolve;
					late.refuse = reject;
				}),
			);
			throw trialError("fish_audio", "unknown_outcome");
		});
		return late;
	};

	it("시간 초과 → unknown, 늦은 성공 → done·segments·사용 이력 1", async () => {
		const late = lateOnce();
		await expect(create()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		expect(await me.dramaList()).toMatchObject([
			{ status: "unknown", bytes: 0, segments: null },
		]);
		expect(await used(JIYEON)).toBe(0);
		late.deliver(scene());
		await vi.waitFor(async () =>
			expect((await me.dramaList())[0]).toMatchObject({
				status: "done",
				bytes: WAV_BYTES,
				segments: spansLike,
			}),
		);
		await vi.waitFor(async () => {
			expect(await used(JIYEON)).toBe(1);
			expect(await used(MINSU)).toBe(1);
		});
		expect((await rows())[0]?.audioType).toBe("audio/wav");
	});

	it("늦은 실패 → unknown 그대로, 로그는 오류 이름만", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const late = lateOnce();
		await expect(create()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		late.refuse(new SyntaxError("너 지금 몇 시인지 알아?"));
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith("[drama] 늦은 결과 실패: SyntaxError"),
		);
		expect(await me.dramaList()).toMatchObject([{ status: "unknown" }]);
		expect(await used(JIYEON)).toBe(0);
		expect(log.mock.calls.flat().join("\n")).not.toContain("몇 시");
	});

	it("늦은 결과가 32MiB를 넘으면 버리고 unknown 그대로(Ruling 7)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const late = lateOnce();
		await expect(create()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		late.deliver(
			scene({ pcm: new Uint8Array(STUDIO_AUDIO_MAX - WAV_HEADER_BYTES + 2) }),
		);
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith(
				"[drama] 늦은 결과 버림: audio_too_large",
			),
		);
		expect(await me.dramaList()).toMatchObject([{ status: "unknown" }]);
		expect(await used(JIYEON)).toBe(0);
	});

	it("미확인 쓰기가 늦어도(settle을 지연시킴) 늦은 결과는 done(P1, studio F2와 같은 모양)", async () => {
		let deliver: (audio: SceneAudio) => void = () => {};
		let slowNext = false;
		// 실패 기록(settle)의 update 하나만 늦춘다: 실행 직전에 늦은 결과를 먼저 보내고 실제 쓰기는 50ms 뒤.
		// saveLate를 settle 앞으로 옮기면 늦은 저장이 아직 진행 중인 행을 만나 결과를 잃고 행은 미확인으로 남는다
		const slow = (builder: object): object =>
			new Proxy(builder, {
				get(target, key) {
					const value = Reflect.get(target, key);
					if (key === "then")
						return (ok: unknown, fail: unknown) => {
							deliver(scene());
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
		synthesizeScene.mockImplementationOnce(async (_scene, options) => {
			options?.onLate?.(
				new Promise<SceneAudio>((resolve) => {
					deliver = resolve;
				}),
			);
			slowNext = true;
			throw trialError("fish_audio", "unknown_outcome");
		});
		await expect(
			as(OWNER, { db: slowDb }).dramaCreate({
				requestId: crypto.randomUUID(),
				request: drama(),
			}),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		await vi.waitFor(async () =>
			expect((await me.dramaList())[0]).toMatchObject({
				status: "done",
				bytes: WAV_BYTES,
				segments: spansLike,
			}),
		);
		await vi.waitFor(async () => expect(await used(JIYEON)).toBe(1));
	});

	it("조각: 3MiB + 5바이트 넘는 WAV를 이어 붙이면 원본과 같고 범위 밖·다른 화면의 행은 NOT_FOUND", async () => {
		const pcm = new Uint8Array(STUDIO_PART_BYTES + 6).map(
			(_, i) => (i * 7) % 256,
		);
		synthesizeScene.mockResolvedValueOnce(scene({ pcm, segments: null }));
		const made = await create();
		const wav = wavOf(pcm);
		expect(made.bytes).toBe(wav.byteLength);
		const parts = [
			await me.dramaAudio({ id: made.id, part: 0 }),
			await me.dramaAudio({ id: made.id, part: 1 }),
		];
		expect(parts.map((part) => part.size)).toEqual([
			STUDIO_PART_BYTES,
			WAV_HEADER_BYTES + 6,
		]);
		expect(
			Buffer.from(await new Blob(parts).arrayBuffer()).equals(Buffer.from(wav)),
		).toBe(true);
		await expect(me.dramaAudio({ id: made.id, part: 2 })).rejects.toMatchObject(
			{ code: "NOT_FOUND" },
		);
		const studioId = await otherRow("studio");
		await expect(
			me.dramaAudio({ id: studioId, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("목록: 최근 20개(21개 넣고), trial·studio 행 없음, request는 저장한 대본, 미확인 포함·실패 제외", async () => {
		const small = () =>
			synthesizeScene.mockResolvedValueOnce(
				scene({ pcm: new Uint8Array(8), segments: null }),
			);
		const made: string[] = [];
		for (let i = 0; i < 20; i++) {
			small();
			made.push((await create()).id);
		}
		// 21번째: 미확인. 정리한 값으로 저장되는지 보려고 지시·대사에 공백과 대괄호를 넣는다
		synthesizeScene.mockRejectedValueOnce(
			trialError("fish_audio", "unknown_outcome"),
		);
		await expect(
			create(
				drama({
					sceneName: "  첫 만남 ",
					lines: [
						{ speaker: 1, direction: " [작게] 웃으며 ", text: " 안녕\n그래 " },
					],
				}),
			),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		synthesizeScene.mockRejectedValueOnce(
			trialError("fish_audio", "provider_error"),
		);
		await expect(create()).rejects.toMatchObject({ code: "BAD_GATEWAY" });
		const failedId = (await rows()).find((row) => row.status === "failed")?.id;
		const trialId = await otherRow("trial");
		const studioId = await otherRow("studio");
		const list = await me.dramaList();
		expect(list).toHaveLength(20);
		expect(list[0]).toMatchObject({
			status: "unknown",
			bytes: 0,
			segments: null,
			request: {
				sceneName: "첫 만남",
				speakers: SPEAKERS,
				lines: [{ speaker: 1, direction: "작게 웃으며", text: "안녕\n그래" }],
				model: "s2.1-pro",
				settings: DRAMA_SETTINGS,
			},
		});
		const ids = list.map((item) => item.id);
		expect(ids.slice(1)).toEqual(made.slice(1).reverse());
		expect(ids).not.toContain(made[0]);
		for (const other of [failedId, trialId, studioId])
			expect(ids).not.toContain(other);
		expect(list[1]).toMatchObject({
			status: "done",
			bytes: WAV_HEADER_BYTES + 8,
			request: drama(),
		});
	});

	it("지우기: 진행 중이면 NOT_FOUND, 완료는 지운다, studio 행 id → NOT_FOUND", async () => {
		const done = await create();
		const studioId = await otherRow("studio");
		await expect(me.dramaDelete({ id: studioId })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const pending = await claimRow(db, {
			ownerId: OWNER,
			requestId: crypto.randomUUID(),
			key: "pending",
			usage: { unit: "free", amount: 0 },
			provider: "fish_audio",
			fields: {
				kind: "drama",
				voiceId: JIYEON,
				model: "s2.1-pro-free",
				settings: DRAMA_SETTINGS,
				text: "진행 중",
			},
		});
		if (pending.kind !== "claimed") throw new Error("선점 실패");
		await expect(me.dramaDelete({ id: pending.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await me.dramaDelete({ id: done.id })).toEqual({ deleted: true });
		await expect(me.dramaAudio({ id: done.id, part: 0 })).rejects.toMatchObject(
			{ code: "NOT_FOUND" },
		);
		expect((await rows()).map((row) => row.id).sort()).toEqual(
			[studioId, pending.id].sort(),
		);
	});
});
