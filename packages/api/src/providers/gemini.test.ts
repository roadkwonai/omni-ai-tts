import { afterEach, describe, expect, it, vi } from "vitest";

import {
	CHECK_TIMEOUT_MS,
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
	TRIAL_TIMEOUT_MS,
} from "./errors";
import {
	AUTO_TAG_TIMEOUT_MS,
	createGemini,
	GEMINI_CLASSIC_IDS,
	referenceUrl,
} from "./gemini";
import { calledUrl, fetchMock, json, useFetchMock } from "./test-utils";
import {
	DEFAULT_SETTINGS,
	type GeminiSettings,
	type TrialRequest,
} from "./trial-options";

// sk-·AIza로 시작하지 않는다(dev-cycle secrets 패턴)
const KEY = "test-gemini-key-0001";
const HOST = "https://generativelanguage.googleapis.com";
const korean = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	type: "prebuilt",
	display_name: `Advisor ${id}`,
	language_code: "ko-KR",
	region_code: "KR",
	accent: "Seoul Korean",
	persona: "High-Trust Advisor / Authoritative Advisor (Lawyer)",
	context: "Enterprise Agent | Conversational / Edu",
	gender: "male",
	pitch: "low",
	description: "38-year-old Lawyer from Seoul, South Korea.",
	...over,
});
const english = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	type: "prebuilt",
	display_name: `${id.charAt(0).toUpperCase()}${id.slice(1)}`,
	language_code: "en-US",
	region_code: "US",
	accent: "Northwest",
	persona: "Storyteller & Narrator",
	context: "Content & Media",
	gender: "female",
	pitch: "high",
	description: "Soft, calm voice.",
	...over,
});
// 한국어 목록과 en-US 목록에 따로 답한다. 응답 본문은 한 번만 읽히므로 매번 새로 만든다
const route = (
	ko: () => Response | Promise<Response>,
	en: () => Response | Promise<Response> = () =>
		json(200, { voices: [english("kore"), english("en-us-advisor-1")] }),
) =>
	fetchMock.mockImplementation(async (url) =>
		new URL(String(url)).searchParams.get("language_code") === "ko-KR"
			? ko()
			: en(),
	);
const googleError = (code: number, status: string, reason?: string) => ({
	error: {
		code,
		message: `bad ${KEY}`,
		status,
		...(reason
			? {
					details: [
						{
							"@type": "type.googleapis.com/google.rpc.ErrorInfo",
							reason,
							domain: "googleapis.com",
						},
					],
				}
			: {}),
	},
});
const WAV = Buffer.concat([
	Buffer.from("RIFF"),
	Buffer.alloc(4),
	Buffer.from("WAVEfmt "),
	Buffer.alloc(24),
]);
const interaction = (data: string | null = WAV.toString("base64")) => ({
	id: "i1",
	status: "completed",
	steps: [
		{ type: "user_input", content: [{ type: "text", text: "x" }] },
		{
			type: "model_output",
			content:
				data === null ? [] : [{ type: "audio", data, mime_type: "audio/wav" }],
		},
	],
	usage: { total_input_tokens: 10, total_output_tokens: 50 },
});
const request = (
	over: Partial<GeminiSettings> = {},
): Extract<TrialRequest, { provider: "gemini" }> => ({
	provider: "gemini",
	voiceId: "kore",
	text: "안녕하세요",
	settings: { ...DEFAULT_SETTINGS.gemini, ...over },
});
const hang = (_url: unknown, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
	});

// 429 오류의 다음 호출 가능 시각까지 남은 초(R2-2)
const waitSeconds = async (call: Promise<unknown> | undefined) => {
	const error = (await call?.then(
		() => null,
		(caught: unknown) => caught,
	)) as { data?: { reason?: string; retryAt?: string } } | null;
	expect(error?.data?.reason).toBe("rate_limit");
	return (Date.parse(error?.data?.retryAt ?? "") - Date.now()) / 1000;
};

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Gemini 연결 확인", () => {
	const check = () => createGemini(KEY).checkStatus();

	it("목록 1명 조회가 되면 연결됨이고 잔액은 없다(quota null). 키는 x-goog-api-key 헤더, 리다이렉트 금지", async () => {
		fetchMock.mockResolvedValue(
			json(200, { voices: [korean("ko-kr-advisor-1")] }),
		);
		await expect(check()).resolves.toMatchObject({
			provider: "gemini",
			status: "connected",
			quota: null,
			providerCode: null,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = calledUrl();
		expect(url.origin + url.pathname).toBe(`${HOST}/v1beta/voices`);
		expect(Object.fromEntries(url.searchParams)).toEqual({
			type: "prebuilt",
			language_code: "ko-KR",
			page_size: "1",
		});
		const init = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(KEY);
		expect(init?.redirect).toBe("error");
	});

	it("틀린 키(400 INVALID_ARGUMENT + API_KEY_INVALID)는 키 오류이고 이유 코드를 먼저 보이며 메시지·키는 없다", async () => {
		fetchMock.mockResolvedValue(
			json(400, googleError(400, "INVALID_ARGUMENT", "API_KEY_INVALID")),
		);
		const result = await check();
		expect(result).toMatchObject({
			status: "provider_auth",
			providerCode: "API_KEY_INVALID",
		});
		expect(JSON.stringify(result)).not.toContain(KEY);
	});

	it("403 PERMISSION_DENIED는 권한 부족, 429 RESOURCE_EXHAUSTED는 요청 제한(Retry-After 없으면 60초, R2-2)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(403, googleError(403, "PERMISSION_DENIED", "SERVICE_DISABLED")),
		);
		await expect(check()).resolves.toMatchObject({
			status: "no_permission",
			providerCode: "PERMISSION_DENIED",
		});
		fetchMock.mockResolvedValueOnce(
			json(429, googleError(429, "RESOURCE_EXHAUSTED")),
		);
		await expect(check()).resolves.toMatchObject({
			status: "rate_limit",
			providerCode: "RESOURCE_EXHAUSTED",
			retryAfterSeconds: 60, // R2-2: 헤더가 없으면 gemini.ts가 60을 채운다
		});
	});
});

describe("Gemini 성우 목록", () => {
	const list = (client = createGemini(KEY)) =>
		client.listVoices?.({ provider: "gemini" });

	it("한국어 목록을 먼저, en-US 목록에서는 대표 성우만 뒤에 둔다", async () => {
		route(() =>
			json(200, {
				voices: [
					korean("ko-kr-advisor-1"),
					korean("ko-kr-advisor-2", {
						gender: "female",
						accent: "Busan Korean",
					}),
				],
			}),
		);
		const page = await list();
		expect(page?.voices.map((voice) => voice.voiceId)).toEqual([
			"ko-kr-advisor-1",
			"ko-kr-advisor-2",
			"kore",
		]);
		expect(page).toMatchObject({
			next: null,
			total: 3,
			totalExact: true,
			windowLimited: false,
		});
	});

	it("두 목록 모두 type=prebuilt·page_size=1000이고 키 헤더로 한 번씩 부른다(맞춤 성우가 공용 캐시에 섞이지 않게)", async () => {
		route(() => json(200, { voices: [korean("ko-kr-advisor-1")] }));
		await list();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const queries = fetchMock.mock.calls.map(([url]) =>
			Object.fromEntries(new URL(String(url)).searchParams),
		);
		expect(queries).toEqual(
			expect.arrayContaining([
				{ type: "prebuilt", language_code: "ko-KR", page_size: "1000" },
				{ type: "prebuilt", language_code: "en-US", page_size: "1000" },
			]),
		);
		for (const [, init] of fetchMock.mock.calls)
			expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(KEY);
	});

	it("한국어 성우: 공급자 값 그대로이고 맥락·페르소나는 ' | '로 나누며 샘플은 없다", async () => {
		route(() => json(200, { voices: [korean("ko-kr-advisor-1")] }));
		const [voice] = (await list())?.voices ?? [];
		expect(voice).toMatchObject({
			provider: "gemini",
			source: "public",
			voiceId: "ko-kr-advisor-1",
			name: "Advisor ko-kr-advisor-1",
			gender: "male",
			age: null,
			accent: "Seoul Korean",
			pitch: "low",
			personas: ["High-Trust Advisor / Authoritative Advisor (Lawyer)"],
			useCases: ["Enterprise Agent", "Conversational / Edu"],
			languages: ["ko-KR"],
			description: "38-year-old Lawyer from Seoul, South Korea.",
			previewUrl: null,
			samples: [],
		});
	});

	it("대표 성우에는 참고 음성(언어 없음, 제목 '참고 음성 · Chirp 3 HD')을 붙인다", async () => {
		route(() => json(200, { voices: [korean("ko-kr-advisor-1")] }));
		const kore = (await list())?.voices.find((v) => v.voiceId === "kore");
		const url =
			"https://docs.cloud.google.com/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Kore.wav";
		expect(kore).toMatchObject({
			name: "Kore",
			accent: "Northwest",
			languages: ["en-US"],
			previewUrl: url,
			samples: [{ language: null, title: "참고 음성 · Chirp 3 HD", url }],
		});
	});

	it("대표 성우는 30명이고 참고 음성 파일 이름은 첫 글자만 대문자다", () => {
		expect(GEMINI_CLASSIC_IDS).toHaveLength(30);
		expect(new Set(GEMINI_CLASSIC_IDS).size).toBe(30);
		expect(referenceUrl("zubenelgenubi")).toBe(
			"https://docs.cloud.google.com/text-to-speech/docs/audio/ko-KR-Chirp3-HD-Zubenelgenubi.wav",
		);
	});

	it("모르는 성별·빈 피치는 정보 없음(null)이고 어긋난 성우만 빠지며 로그에 키가 없다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		route(() =>
			json(200, {
				voices: [
					korean("ko-kr-advisor-1", { gender: "unknown", pitch: "" }),
					korean("bad id!"),
					{ id: "ko-kr-x" },
				],
			}),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((v) => v.voiceId)).toEqual(["ko-kr-advisor-1", "kore"]);
		expect(voices[0]).toMatchObject({ gender: null, pitch: null });
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0]?.[0])).not.toContain(KEY);
	});

	it("en-US의 대표 성우가 아닌 항목은 검사 전에 빠져 모양이 어긋나도 기록하지 않는다(R2-4)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		route(
			() => json(200, { voices: [korean("ko-kr-advisor-1")] }),
			() => json(200, { voices: [english("kore"), { id: "en-us-x" }, null] }),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((v) => v.voiceId)).toEqual(["ko-kr-advisor-1", "kore"]);
		expect(log).not.toHaveBeenCalled();
	});

	it("한국어 목록이 0명이거나 en-US 목록이 실패하면 목록 전체가 공급자 장애다", async () => {
		route(() => json(200, { voices: [] }));
		await expect(list()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "provider_error" },
		});
		route(
			() => json(200, { voices: [korean("ko-kr-advisor-1")] }),
			() => json(500, googleError(500, "INTERNAL")),
		);
		await expect(list()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "provider_error" },
		});
	});

	it("429는 요청 제한이고 Retry-After가 있으면 다음 호출 시각을 담는다", async () => {
		route(() =>
			json(429, googleError(429, "RESOURCE_EXHAUSTED"), {
				"retry-after": "30",
			}),
		);
		await expect(list()).rejects.toMatchObject({
			data: {
				provider: "gemini",
				reason: "rate_limit",
				retryAt: expect.any(String),
			},
		});
	});

	it("429에 Retry-After가 없으면 60초 뒤를 다음 호출 시각으로 담는다(R2-2)", async () => {
		route(() => json(429, googleError(429, "RESOURCE_EXHAUSTED")));
		const seconds = await waitSeconds(list());
		expect(seconds).toBeGreaterThan(55);
		expect(seconds).toBeLessThan(65);
	});

	it("10초 안에 답하지 않으면 응답 없음(unknown_outcome)이고 다시 부르지 않는다(R2-5)", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(list()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("Gemini 한 명 조회", () => {
	it("목록에서 찾고 없으면 null이다. 여러 번 불러도 두 목록을 한 번씩만 부른다", async () => {
		route(() => json(200, { voices: [korean("ko-kr-advisor-1")] }));
		const client = createGemini(KEY);
		await expect(client.getVoice?.("public", "kore")).resolves.toMatchObject({
			voiceId: "kore",
		});
		await expect(
			client.getVoice?.("public", "ko-kr-advisor-9"),
		).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("Gemini 내 문장 듣기(유료일 수 있다)", () => {
	const synth = (r = request(), options?: SynthesizeOptions) =>
		createGemini(KEY).synthesize?.(r, options);

	it("Interactions에 모델·문장·성우·오디오 형식·store false만 보내고 WAV 바이트를 돌려준다", async () => {
		fetchMock.mockResolvedValue(json(200, interaction()));
		const audio = await synth();
		expect(Buffer.from(audio ?? new Uint8Array()).equals(WAV)).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(calledUrl().href).toBe(`${HOST}/v1beta/interactions`);
		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.method).toBe("POST");
		expect(init?.redirect).toBe("error");
		expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(KEY);
		expect(JSON.parse(String(init?.body))).toEqual({
			model: "gemini-3.8-flash-tts",
			input: [
				{
					type: "user_input",
					content: [{ type: "text", text: "안녕하세요" }],
				},
			],
			response_format: { type: "audio" },
			generation_config: { speech_config: [{ voice: "kore" }] },
			store: false,
		});
	});

	it("말투 지시가 있으면 문장에 speech_metadata 주석으로 붙는다(문장 앞에 붙이지 않는다)", async () => {
		fetchMock.mockResolvedValue(json(200, interaction()));
		await synth(
			request({
				model: "gemini-3.8-flash-lite-tts",
				direction: "calm and relaxed",
			}),
		);
		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(body.model).toBe("gemini-3.8-flash-lite-tts");
		expect(body.input[0].content[0]).toEqual({
			type: "text",
			text: "안녕하세요",
			annotations: [{ type: "speech_metadata", style: "calm and relaxed" }],
		});
	});

	it("오디오가 없거나 WAV가 아니거나 모양이 다르면 처리 여부 미확인이다(응답은 받았지만 쓸 수 없다)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		for (const body of [
			interaction(null),
			interaction(Buffer.from("ID3-not-a-wave-file").toString("base64")),
			{ steps: "x" },
		]) {
			fetchMock.mockResolvedValueOnce(json(200, body));
			await expect(synth()).rejects.toMatchObject({
				data: { provider: "gemini", reason: "unknown_outcome" },
			});
		}
	});

	it("오디오가 없고 상태가 failed면 입력 거절, 그 밖은 처리 여부 미확인이고, 오디오가 있으면 상태와 상관없이 쓴다(R2-3, fix round 1)", async () => {
		fetchMock.mockResolvedValueOnce(json(200, { status: "failed" }));
		await expect(synth()).rejects.toMatchObject({
			data: {
				provider: "gemini",
				reason: "provider_input",
				providerCode: "FAILED",
			},
		});
		// 상태 없음·failed가 아닌 상태(과금됐을 수 있다)는 처리 여부 미확인이다(fix round 1)
		vi.spyOn(console, "error").mockImplementation(() => {});
		for (const body of [
			{ steps: interaction(null).steps },
			{ status: "in_progress", steps: interaction(null).steps },
			{ status: "in_progress" },
		]) {
			fetchMock.mockResolvedValueOnce(json(200, body));
			await expect(synth()).rejects.toMatchObject({
				data: { provider: "gemini", reason: "unknown_outcome" },
			});
		}
		for (const status of ["COMPLETED", "failed"]) {
			fetchMock.mockResolvedValueOnce(json(200, { ...interaction(), status }));
			const audio = await synth();
			expect(Buffer.from(audio ?? new Uint8Array()).equals(WAV)).toBe(true);
		}
	});

	it("어긋난 다른 단계가 있어도 받은 오디오를 버리지 않고, steps가 배열이 아니면 오디오 없음으로 본다(fix round 2)", async () => {
		const [, audioStep] = interaction().steps;
		fetchMock.mockResolvedValueOnce(
			json(200, { status: "completed", steps: [{ content: {} }, audioStep] }),
		);
		const audio = await synth();
		expect(Buffer.from(audio ?? new Uint8Array()).equals(WAV)).toBe(true);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValueOnce(json(200, { status: "failed", steps: {} }));
		await expect(synth()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "provider_input" },
		});
		expect(log).not.toHaveBeenCalled();
	});

	it("429에 Retry-After가 없으면 60초 뒤를 다음 호출 시각으로 담는다(R2-2)", async () => {
		fetchMock.mockResolvedValue(
			json(429, googleError(429, "RESOURCE_EXHAUSTED")),
		);
		const seconds = await waitSeconds(synth());
		expect(seconds).toBeGreaterThan(55);
		expect(seconds).toBeLessThan(65);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("Retry-After를 못 읽으면(HTTP 날짜) 없는 것과 같이 60초 뒤다(fix round 1)", async () => {
		fetchMock.mockResolvedValue(
			json(429, googleError(429, "RESOURCE_EXHAUSTED"), {
				"retry-after": "Wed, 21 Oct 2026 07:28:00 GMT",
			}),
		);
		const seconds = await waitSeconds(synth());
		expect(seconds).toBeGreaterThan(55);
		expect(seconds).toBeLessThan(65);
	});

	it("오류 사유 표이고 모두 한 번만 부른다", async () => {
		const cases = [
			[
				() =>
					json(400, googleError(400, "INVALID_ARGUMENT", "API_KEY_INVALID")),
				{ reason: "provider_auth" },
			],
			[
				() => json(400, googleError(400, "INVALID_ARGUMENT")),
				{ reason: "provider_input", providerCode: "INVALID_ARGUMENT" },
			],
			[
				() => json(400, googleError(400, "FAILED_PRECONDITION")),
				{ reason: "quota" },
			],
			[
				() =>
					json(429, googleError(429, "RESOURCE_EXHAUSTED"), {
						"retry-after": "30",
					}),
				{ reason: "rate_limit", retryAt: expect.any(String) },
			],
			[
				() => json(500, googleError(500, "INTERNAL")),
				{ reason: "provider_error" },
			],
			[
				() => json(400, { error: { code: "invalid_request", message: "x" } }),
				{ reason: "provider_input", providerCode: "INVALID_REQUEST" },
			],
			// R2-1: Interactions의 snake_case code도 같은 표다
			[
				() =>
					json(400, { error: { code: "failed_precondition", message: "x" } }),
				{ reason: "quota" },
			],
			[
				() => json(403, { error: { code: "permission_denied", message: "x" } }),
				{ reason: "no_permission" },
			],
			// R2-5
			[
				() => json(401, googleError(401, "UNAUTHENTICATED")),
				{ reason: "provider_auth" },
			],
			[
				() => json(402, googleError(402, "PAYMENT_REQUIRED")),
				{ reason: "quota" },
			],
			[
				() => json(404, googleError(404, "NOT_FOUND")),
				{ reason: "provider_input", providerCode: "NOT_FOUND" },
			],
			[
				() => json(504, googleError(504, "DEADLINE_EXCEEDED")),
				{ reason: "provider_error" },
			],
		] as const;
		for (const [response, data] of cases) {
			fetchMock.mockReset();
			fetchMock.mockImplementation(async () => response());
			await expect(synth()).rejects.toMatchObject({
				data: { provider: "gemini", ...data },
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		}
	});

	it("60초 안에 답하지 않으면 처리 여부 미확인이고 다시 부르지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(synth()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("작업실 대기(timeoutMs)를 받으면 60초를 넘겨도 끊지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			() =>
				new Promise<Response>((resolve) =>
					setTimeout(() => resolve(json(200, interaction())), 120_000),
				),
		);
		const pending = synth(request(), { timeoutMs: STUDIO_TIMEOUT_MS });
		await vi.advanceTimersByTimeAsync(120_000);
		await expect(pending).resolves.toBeDefined();
	});

	it("timeoutMs를 넘기면 unknown_outcome이고 onLate를 부르지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const onLate = vi.fn();
		const assertion = expect(
			synth(request(), { timeoutMs: STUDIO_TIMEOUT_MS, onLate }),
		).rejects.toMatchObject({
			data: { provider: "gemini", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS);
		await assertion;
		expect(onLate).not.toHaveBeenCalled();
	});
});

describe("Gemini 전체 자동 태그(유료, T9.5 Part 2)", () => {
	const PROMPT = {
		system: "You add acting tags.",
		input: '[{"index":0,"speaker":"지연","direction":"","text":"안녕"}]',
		schema: { type: "object", required: ["lines"] },
	};
	const suggest = () => createGemini(KEY).suggestActing?.(PROMPT);
	// 사용자 입력 단계에도 글이 있다(답으로 읽지 않아야 한다)
	const replied = (...steps: unknown[]) => ({
		id: "i2",
		status: "completed",
		steps: [
			{ type: "user_input", content: [{ type: "text", text: "질문 글" }] },
			...steps,
		],
	});
	const output = (...content: unknown[]) => ({ type: "model_output", content });

	it("텍스트 모델·지시문·문자열 입력·JSON 형식·사고 low·출력 상한·store false만 보내고 답 글을 돌려준다", async () => {
		fetchMock.mockResolvedValue(
			json(200, replied(output({ type: "text", text: '{"lines":[]}' }))),
		);
		await expect(suggest()).resolves.toBe('{"lines":[]}');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(calledUrl().href).toBe(`${HOST}/v1beta/interactions`);
		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.method).toBe("POST");
		expect(init?.redirect).toBe("error");
		expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(KEY);
		expect(JSON.parse(String(init?.body))).toEqual({
			model: "gemini-3.8-flash",
			system_instruction: PROMPT.system,
			input: PROMPT.input,
			response_format: {
				type: "text",
				mime_type: "application/json",
				schema: PROMPT.schema,
			},
			generation_config: { max_output_tokens: 8192, thinking_level: "low" },
			store: false,
		});
	});

	it("200인데 잘린 JSON 글이면 오류가 아니라 그 글을 그대로 돌려준다(읽기는 라우터, 계획 리뷰 L5). 나뉜 글은 잇는다", async () => {
		const cut = '{"lines":[{"index":0,"direction":"icy';
		fetchMock.mockResolvedValueOnce(
			json(200, replied(output({ type: "text", text: cut }))),
		);
		await expect(suggest()).resolves.toBe(cut);
		fetchMock.mockResolvedValueOnce(
			json(
				200,
				replied(
					output(
						{ type: "text", text: '{"lines":' },
						{ type: "thought", summary: "x" },
						{ type: "text", text: "[]}" },
					),
				),
			),
		);
		await expect(suggest()).resolves.toBe('{"lines":[]}');
	});

	it("model_output 단계나 그 안의 글이 없으면 null이다(사용자 입력 단계의 글은 보지 않는다)", async () => {
		for (const body of [
			replied(),
			replied(output()),
			replied(output({ type: "audio", data: "AAAA" })),
			{ status: "completed" },
			{ status: "completed", steps: "x" },
		]) {
			fetchMock.mockResolvedValueOnce(json(200, body));
			await expect(suggest()).resolves.toBeNull();
		}
	});

	it("429는 요청 제한이고(Retry-After 없으면 60초) 한 번만 부른다", async () => {
		fetchMock.mockResolvedValue(
			json(429, googleError(429, "RESOURCE_EXHAUSTED")),
		);
		const seconds = await waitSeconds(suggest());
		expect(seconds).toBeGreaterThan(55);
		expect(seconds).toBeLessThan(65);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("60초 안에 답하지 않으면 처리 여부 미확인이고 다시 부르지 않는다", async () => {
		expect(AUTO_TAG_TIMEOUT_MS).toBe(60_000);
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(suggest()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(AUTO_TAG_TIMEOUT_MS);
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
