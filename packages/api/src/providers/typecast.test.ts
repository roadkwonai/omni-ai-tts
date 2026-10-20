import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CHECK_TIMEOUT_MS,
	STUDIO_TIMEOUT_MS,
	TRIAL_TIMEOUT_MS,
} from "./errors";
import { calledUrl, fetchMock, json, useFetchMock } from "./test-utils";
import { DEFAULT_SETTINGS, type TypecastSettings } from "./trial-options";
import { createTypecast } from "./typecast";

const KEY = "typecast-test-key-0001";
const { TypecastClient: CjsTypecastClient } = createRequire(import.meta.url)(
	"@neosapience/typecast-js",
) as typeof import("@neosapience/typecast-js");
const subscription = (plan_credits: number, used_credits: number) => ({
	plan: "plus",
	credits: { plan_credits, used_credits },
	limits: { concurrency_limit: 5 },
});
const check = () => createTypecast(KEY).checkStatus();

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

// 상태 코드 → 사유 표 전체는 errors.test.ts가 고정한다. 여기서는 SDK 오류를 바꿔 담는 것만 본다.
describe("Typecast 연결 확인", () => {
	it("200이면 연결됨과 남은 크레딧, 요청은 공식 호스트에 키와 연동 식별을 붙여 1회", async () => {
		// 명시한 키와 호스트가 환경변수 대체보다 앞서는지 본다.
		vi.stubEnv("TYPECAST_API_KEY", "env-key");
		vi.stubEnv("TYPECAST_API_HOST", "https://env-host.example");
		fetchMock.mockResolvedValue(json(200, subscription(10_000, 1_234)));
		await expect(check()).resolves.toMatchObject({
			provider: "typecast",
			status: "connected",
			quota: { remaining: 8_766, total: 10_000, plan: "plus", resetAt: null },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(init?.redirect).toBe("error");
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.typecast.ai");
		expect(target.pathname).toBe("/v1/users/me/subscription");
		const headers = new Headers(init?.headers);
		expect(headers.get("x-api-key")).toBe(KEY);
		expect(headers.get("user-agent")).toContain(
			"typecast-integration/1 (source=api-docs; generated_by=codex)",
		);
	});

	it("잔여가 0 이하면 한도 부족이고 사용량을 함께 준다", async () => {
		fetchMock.mockResolvedValue(json(200, subscription(10_000, 10_000)));
		await expect(check()).resolves.toMatchObject({
			status: "quota",
			quota: { remaining: 0, total: 10_000 },
		});
	});

	it("401이면 키 오류이고 재시도하지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(401, { detail: "Invalid API key" }),
		);
		await expect(check()).resolves.toMatchObject({
			status: "provider_auth",
			providerCode: "HTTP 401",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429면 요청 제한이다. SDK 오류에 응답 헤더가 없어 Retry-After는 null이다", async () => {
		fetchMock.mockImplementation(
			async () =>
				new Response(JSON.stringify({ detail: "x" }), {
					status: 429,
					headers: { "content-type": "application/json", "retry-after": "30" },
				}),
		);
		await expect(check()).resolves.toMatchObject({
			status: "rate_limit",
			retryAfterSeconds: null,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		["필드 누락", { plan: "plus" }],
		[
			"숫자 아님",
			{ plan: "plus", credits: { plan_credits: "10", used_credits: 0 } },
		],
	])("응답 검증 실패(%s)는 확인 실패다", async (_name, body) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(json(200, body));
		await expect(check()).resolves.toMatchObject({ status: "check_failed" });
	});

	it("연결이 끊기면 확인 실패다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));
		await expect(check()).resolves.toMatchObject({ status: "check_failed" });
		expect(log).toHaveBeenCalledWith(
			"[providerStatus] typecast 확인 실패: TypeError",
		);
	});

	it("SDK가 끊지 못해도 10초에 확인 실패로 끝난다", async () => {
		vi.useFakeTimers();
		fetchMock.mockReturnValue(new Promise<Response>(() => {}));
		const pending = check();
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await expect(pending).resolves.toMatchObject({ status: "check_failed" });
	});
});

const rawVoice = (overrides: Record<string, unknown> = {}) => ({
	voice_id: "tc_0001",
	voice_name: { eng: "Minji", kor: "민지" },
	voice_type: "original",
	gender: "female",
	age: "young_adult",
	models: [
		{ version: "ssfm-v30", emotions: ["normal", "happy"] },
		{ version: "ssfm-v21", emotions: ["normal"] },
	],
	use_cases: ["Ads/Promotion", "Game"],
	preview_url: "https://static2.typecast.ai/preview/tc_0001.mp3",
	...overrides,
});
const list = () => createTypecast(KEY).listVoices?.({ provider: "typecast" });

describe("Typecast 성우 목록", () => {
	it("공개 성우를 계약 모양으로 바꾸고 커스텀 성우는 뺀다. 요청은 공식 호스트의 /v3/voices에 필터 없이 1회", async () => {
		fetchMock.mockResolvedValue(
			json(200, [
				rawVoice(),
				// 커스텀은 모양이 달라도(models 없음) 목록을 깨지 않는다
				{
					voice_id: "custom_1",
					voice_name: { eng: "Me", kor: "나" },
					voice_type: "custom",
					preview_url: null,
				},
			]),
		);
		const result = await list();
		expect(result).toMatchObject({
			next: null,
			total: 1,
			totalExact: true,
			windowLimited: false,
		});
		expect(result?.voices).toEqual([
			{
				provider: "typecast",
				source: "public",
				voiceId: "tc_0001",
				name: "민지",
				englishName: "Minji",
				gender: "female",
				age: "young_adult",
				accent: null,
				pitch: null,
				personas: [],
				useCases: ["Ads/Promotion", "Game"],
				descriptives: [],
				tags: [],
				languages: [],
				category: null,
				origin: null,
				description: null,
				models: [
					{ model: "ssfm-v30", emotions: ["normal", "happy"] },
					{ model: "ssfm-v21", emotions: ["normal"] },
				],
				previewUrl: "https://static2.typecast.ai/preview/tc_0001.mp3",
				samples: [],
				usage: null,
				terms: {
					freeUsersAllowed: null,
					noticePeriodDays: null,
					liveModeration: false,
					creditRate: null,
					licensed: false,
					retiring: false,
				},
			},
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.typecast.ai");
		expect(target.pathname).toBe("/v3/voices");
		expect(target.search).toBe("");
		expect(new Headers(init?.headers).get("x-api-key")).toBe(KEY);
	});

	it("값이 없거나 모르는 값: 성별은 null, 콘텐츠는 빈 배열, 샘플 주소는 null, 한글 이름이 비면 영문 이름을 쓴다", async () => {
		const { use_cases: _omit, ...withoutUseCases } = rawVoice({
			voice_name: { eng: "Sora", kor: " " },
			gender: "unknown",
			age: null,
			preview_url: null,
		});
		fetchMock.mockResolvedValue(json(200, [withoutUseCases]));
		const [voice] = (await list())?.voices ?? [];
		expect(voice).toMatchObject({
			name: "Sora",
			englishName: null,
			gender: null,
			age: null,
			useCases: [],
			previewUrl: null,
		});
	});

	it("같은 voice_id는 처음 것만 남긴다", async () => {
		fetchMock.mockResolvedValue(
			json(200, [
				rawVoice(),
				rawVoice({ voice_name: { eng: "Dup", kor: "중복" } }),
			]),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((voice) => voice.name)).toEqual(["민지"]);
	});

	it("401은 BAD_GATEWAY·provider_auth이고 재시도하지 않으며 오류에 키가 없다", async () => {
		fetchMock.mockImplementation(async () =>
			json(401, { detail: `Invalid API key ${KEY}` }),
		);
		const thrown = await list()?.catch((error) => error);
		expect(thrown).toMatchObject({ code: "BAD_GATEWAY" });
		expect(thrown.cause).toBeUndefined();
		expect(thrown.data).toEqual({
			provider: "typecast",
			reason: "provider_auth",
		});
		expect(JSON.stringify(thrown.toJSON())).not.toContain(KEY);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429는 SDK 경로로도 TOO_MANY_REQUESTS·rate_limit이다", async () => {
		fetchMock.mockResolvedValue(json(429, { detail: "too many" }));
		await expect(list()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { provider: "typecast", reason: "rate_limit" },
		});
	});

	it("JSON이 아닌 200 응답은 BAD_GATEWAY·provider_error이고 로그는 SyntaxError 한 줄이다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			new Response("<html>", {
				status: 200,
				headers: { "content-type": "text/html" },
			}),
		);
		await expect(list()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 목록 조회 실패: SyntaxError"],
		]);
	});

	it("https가 아니거나 공급자 호스트(typecast.ai)가 아닌 샘플 주소는 그 성우만 샘플 없음(null)이고 로그는 없다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, [
				rawVoice({
					voice_id: "tc_http",
					preview_url: "http://static2.typecast.ai/a.mp3",
				}),
				rawVoice({
					voice_id: "tc_other",
					preview_url: "https://evil.example/a.mp3",
				}),
				rawVoice({
					voice_id: "tc_suffix",
					preview_url: "https://typecast.ai.evil.example/a.mp3",
				}),
				rawVoice({
					voice_id: "tc_noslash",
					preview_url: "https:evil.example/a.mp3",
				}),
				rawVoice(),
			]),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((voice) => [voice.voiceId, voice.previewUrl])).toEqual([
			["tc_http", null],
			["tc_other", null],
			["tc_suffix", null],
			["tc_noslash", null],
			["tc_0001", "https://static2.typecast.ai/preview/tc_0001.mp3"],
		]);
		expect(log).not.toHaveBeenCalled();
	});

	it("https:host 꼴의 typecast.ai 주소는 https://host로 바로잡아 담는다", async () => {
		fetchMock.mockResolvedValue(
			json(200, [rawVoice({ preview_url: "https:static2.typecast.ai/a.mp3" })]),
		);
		const [voice] = (await list())?.voices ?? [];
		expect(voice?.previewUrl).toBe("https://static2.typecast.ai/a.mp3");
	});

	it("한글·영문 이름이 모두 비면 그 성우만 빼고 voice_name으로 한 줄 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, [
				rawVoice({ voice_id: "tc_blank", voice_name: { eng: " ", kor: "" } }),
				rawVoice(),
			]),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((voice) => voice.voiceId)).toEqual(["tc_0001"]);
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 성우 1명 제외: voice_name"],
		]);
	});

	it("공개 성우가 모두 어긋나면 BAD_GATEWAY·provider_error다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, [rawVoice({ models: undefined }), rawVoice({ voice_id: "" })]),
		);
		await expect(list()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "typecast", reason: "provider_error" },
		});
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 성우 2명 제외: models, voice_id"],
		]);
	});
});

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9]);
const audio = () =>
	new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
const bodyOf = (i = 0) =>
	JSON.parse(String(fetchMock.mock.calls[i]?.[1]?.body));

describe("Typecast 시험 생성", () => {
	const synth = (settings: Partial<TypecastSettings> = {}) =>
		createTypecast(KEY).synthesize?.({
			provider: "typecast",
			voiceId: "tc_0001",
			text: "  안녕하세요 ",
			settings: { ...DEFAULT_SETTINGS.typecast, ...settings },
		});

	it("v30 자동 감정: MP3, 받는 옵션만, 언어 자동이면 language를 보내지 않고 바이트를 돌려준다", async () => {
		fetchMock.mockResolvedValueOnce(audio());
		await expect(synth({ tempo: 1.2, pitch: 2 })).resolves.toEqual(MP3);
		expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("error");
		expect(calledUrl().pathname).toBe("/v1/text-to-speech");
		expect(bodyOf()).toEqual({
			text: "안녕하세요",
			voice_id: "tc_0001",
			model: "ssfm-v30",
			prompt: { emotion_type: "smart" },
			output: {
				audio_format: "mp3",
				audio_tempo: 1.2,
				audio_pitch: 2,
				volume: 100,
			},
		});
	});
	it("v30 프리셋과 v21, 한국어 고정", async () => {
		fetchMock.mockImplementation(async () => audio());
		await synth({
			emotion: "preset",
			preset: "happy",
			intensity: 1.5,
			language: "kor",
		});
		expect(bodyOf(0)).toMatchObject({
			language: "kor",
			prompt: {
				emotion_type: "preset",
				emotion_preset: "happy",
				emotion_intensity: 1.5,
			},
		});
		await synth({ model: "ssfm-v21", preset: "sad" });
		expect(bodyOf(1).prompt).toEqual({
			emotion_preset: "sad",
			emotion_intensity: 1,
		});
	});
	it("402는 quota, 422는 공급자 오류 코드를 담은 입력 거절, 500은 한 번만 부른다", async () => {
		fetchMock.mockResolvedValueOnce(
			json(402, { detail: "Insufficient credit" }),
		);
		await expect(synth()).rejects.toMatchObject({ data: { reason: "quota" } });
		fetchMock.mockResolvedValueOnce(
			json(422, { message: "x", error_code: "TEXT_NOT_SYNTHESIZABLE" }),
		);
		await expect(synth()).rejects.toMatchObject({
			data: {
				reason: "provider_input",
				providerCode: "TEXT_NOT_SYNTHESIZABLE",
			},
		});
		fetchMock.mockClear();
		fetchMock.mockResolvedValueOnce(json(500, { detail: "x" }));
		await expect(synth()).rejects.toMatchObject({
			data: { reason: "provider_error" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("연결이 끊기면(fetch TypeError) 처리 여부 미확인이고 한 번만 부른다(E1)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("리다이렉트 거절은 처리 여부 미확인이고 재전송하지 않는다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async (_url, init) => {
			if (init?.redirect === "error") throw new TypeError("redirect rejected");
			return audio();
		});
		await expect(synth()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "typecast", reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("작업실은 180초까지 기다리고, 넘으면 처리 여부 미확인과 함께 끊긴 요청의 결과를 넘긴다(T5-02)", async () => {
		vi.useFakeTimers();
		let respond: (response: Response) => void = () => {};
		fetchMock.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					respond = resolve;
				}),
		);
		const onLate = vi.fn<(late: Promise<Uint8Array>) => void>();
		let settled = false;
		const run = createTypecast(KEY).synthesize?.(
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "긴 대본",
				settings: DEFAULT_SETTINGS.typecast,
			},
			{ timeoutMs: STUDIO_TIMEOUT_MS, onLate },
		);
		const assertion = expect(run).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "typecast", reason: "unknown_outcome" },
		});
		void run
			?.catch(() => {})
			.finally(() => {
				settled = true;
			});
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS - TRIAL_TIMEOUT_MS);
		await assertion;
		expect(onLate).toHaveBeenCalledTimes(1);
		// 응답 본문은 진짜 타이머로 읽는다
		vi.useRealTimers();
		respond(audio());
		await expect(onLate.mock.calls[0]?.[0]).resolves.toEqual(MP3);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("Typecast CJS 전송 경계", () => {
	it("CJS의 조회와 합성도 전역 fetch를 교체하지 않고 리다이렉트를 막는다", async () => {
		fetchMock.mockImplementation(async (url) =>
			new URL(String(url)).pathname.endsWith("/subscription")
				? json(200, subscription(100, 0))
				: audio(),
		);
		const client = new CjsTypecastClient({
			apiKey: KEY,
			baseHost: "https://api.typecast.ai",
		});
		await expect(client.getMySubscription()).resolves.toMatchObject({
			credits: { plan_credits: 100, used_credits: 0 },
		});
		const result = await client.textToSpeech({
			voice_id: "tc_0001",
			model: "ssfm-v30",
			text: "안녕",
			output: { audio_format: "mp3" },
		});
		expect(new Uint8Array(result.audioData)).toEqual(MP3);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		for (const [, init] of fetchMock.mock.calls) {
			expect(init?.redirect).toBe("error");
		}
		expect(globalThis.fetch).toBe(fetchMock);
	});
});

describe("Typecast 성우 한 명 조회(T7)", () => {
	const raw = {
		voice_id: "tc_abc",
		voice_name: { eng: "Minji", kor: "민지" },
		voice_type: "original",
		gender: "female",
		age: "young_adult",
		use_cases: ["Audiobook"],
		models: [{ version: "ssfm-v30", emotions: ["normal"] }],
		preview_url: "https://static.typecast.ai/a.mp3",
	};
	const get = (id = "tc_abc") => createTypecast(KEY).getVoice?.("public", id);

	it("200이면 목록과 같은 Voice, 경로는 /v3/voices/{id}", async () => {
		fetchMock.mockResolvedValue(json(200, raw));
		const voice = await get();
		expect(voice).toMatchObject({
			provider: "typecast",
			source: "public",
			voiceId: "tc_abc",
			name: "민지",
			previewUrl: "https://static.typecast.ai/a.mp3",
		});
		expect(calledUrl().pathname).toBe("/v3/voices/tc_abc");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("404면 null(현재 이용 불가)", async () => {
		fetchMock.mockResolvedValue(
			json(404, { message: "Voice not found", error_code: "VOICE_NOT_FOUND" }),
		);
		expect(await get()).toBeNull();
	});
	it("5xx는 null이 아니라 provider_error", async () => {
		fetchMock.mockResolvedValue(json(503, {}));
		await expect(get()).rejects.toMatchObject({
			data: { provider: "typecast", reason: "provider_error" },
		});
	});
});
