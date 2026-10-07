import { afterEach, describe, expect, it, vi } from "vitest";

import { AIRY_CATALOG_TIMEOUT_MS, createAiry } from "./airy";
import { CHECK_TIMEOUT_MS, TRIAL_TIMEOUT_MS } from "./errors";
import { calledUrl, fetchMock, json, useFetchMock } from "./test-utils";
import { type AirySettings, DEFAULT_SETTINGS } from "./trial-options";

// sk-로 시작하지 않는다(dev-cycle secrets 패턴 \bsk-[A-Za-z0-9_-]{20,})
const KEY = "test-airy-key-0001";
const ID = "a597bb7a98fc9ec1";
const ID2 = "0123456789abcdef";
const official = (
	voices: unknown[] = [
		{ id: ID, name: "Silvia", gender: "female", langs: ["en", "ko"] },
	],
) => ({ voices });
const asset = (lang: string, id = ID) =>
	`https://assets.airy.so/airy/voice_pack/vp-v9/audio/${lang}/${id}.opus`;
const catalogVoice = (id = ID, over: Record<string, unknown> = {}) => ({
	id,
	audio_url: { ko: asset("ko", id), en: asset("en", id) },
	...over,
});
const catalog = (voices: unknown[] = [catalogVoice()]) => ({ voices });
const airyError = (code: string) => ({
	error: { type: "x", code, message: `bad ${KEY}`, param: null },
	request_id: "req_1",
});
// 공식 목록과 카탈로그에 따로 답한다. 응답 본문은 한 번만 읽히므로 매번 새로 만든다
const route = (
	voices: () => Response | Promise<Response>,
	studio: () => Response | Promise<Response> = () => json(200, catalog()),
) =>
	fetchMock.mockImplementation(async (url) =>
		new URL(String(url)).pathname === "/v1/studio/voices" ? studio() : voices(),
	);
const list = (client = createAiry(KEY)) =>
	client.listVoices?.({ provider: "airy" });
const pathsCalled = () =>
	fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
const hang = (_url: unknown, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
	});
const KO = { language: "ko", title: null, url: asset("ko") };
const EN = { language: "en", title: null, url: asset("en") };

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// 상태 코드 → 사유 표 전체는 errors.test.ts가 고정한다. 여기서는 Airy 본문(error.code)을 읽는 것과 Airy만의 값을 본다
describe("Airy 연결 확인", () => {
	const check = () => createAiry(KEY).checkStatus();

	it("잔액이면 연결됨·남은 크레딧·플랜, 요청은 공식 호스트에 Bearer 키로 1회(리다이렉트 금지)", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				total_balance: 1234.56,
				tier: "plan_a",
			}),
		);
		await expect(check()).resolves.toMatchObject({
			provider: "airy",
			status: "connected",
			quota: {
				remaining: 1234.56,
				total: null,
				plan: "plan_a",
				resetAt: null,
				overageAllowed: false,
			},
			providerCode: null,
			retryAfterSeconds: null,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(calledUrl().href).toBe("https://api.airy.so/v1/credits/balance");
		const init = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get("authorization")).toBe(
			`Bearer ${KEY}`,
		);
		expect(init?.redirect).toBe("error");
	});

	it("잔액 0 이하는 한도 부족이고 값은 그대로 담는다", async () => {
		for (const total_balance of [0, -1.5]) {
			fetchMock.mockResolvedValueOnce(
				json(200, { total_balance, tier: "plan_a" }),
			);
			await expect(check()).resolves.toMatchObject({
				status: "quota",
				quota: { remaining: total_balance },
			});
		}
	});

	it("tier가 없거나 41자면 플랜만 비운다", async () => {
		for (const tier of [undefined, null, "x".repeat(41)]) {
			fetchMock.mockResolvedValueOnce(json(200, { total_balance: 5, tier }));
			await expect(check()).resolves.toMatchObject({
				status: "connected",
				quota: { plan: null },
			});
		}
	});

	it("429는 요청 제한이고 Airy 오류 코드와 Retry-After 초를 담으며 메시지·키는 없다", async () => {
		fetchMock.mockResolvedValue(
			json(429, airyError("rate_limit_exceeded"), { "retry-after": "30" }),
		);
		const result = await check();
		expect(result).toMatchObject({
			status: "rate_limit",
			providerCode: "rate_limit_exceeded",
			retryAfterSeconds: 30,
		});
		expect(JSON.stringify(result)).not.toContain(KEY);
	});
});

describe("Airy 목록", () => {
	it("공식 목록에 카탈로그 샘플을 id로 붙인다: 한국어 → 영어, 행 샘플은 한국어", async () => {
		route(() => json(200, official()));
		const page = await list();
		expect(page).toMatchObject({
			next: null,
			total: 1,
			totalExact: true,
			windowLimited: false,
		});
		expect(page?.voices).toEqual([
			expect.objectContaining({
				provider: "airy",
				source: "public",
				voiceId: ID,
				name: "Silvia",
				gender: "female",
				age: null,
				languages: ["en", "ko"],
				previewUrl: asset("ko"),
				samples: [KO, EN],
			}),
		]);
	});

	it("공식 목록은 키를 보내고 카탈로그에는 키를 보내지 않는다(둘 다 공식 호스트, 리다이렉트 금지)", async () => {
		route(() => json(200, official()));
		await list();
		expect(pathsCalled().sort()).toEqual(["/v1/studio/voices", "/v1/voices"]);
		for (const [url, init] of fetchMock.mock.calls) {
			expect(new URL(String(url)).origin).toBe("https://api.airy.so");
			expect(init?.redirect).toBe("error");
			const auth = new Headers(init?.headers).get("authorization");
			expect(auth).toBe(
				new URL(String(url)).pathname === "/v1/voices" ? `Bearer ${KEY}` : null,
			);
		}
	});

	it.each([
		["500", () => json(500, {}), "HTTP 500"],
		["모양 다름", () => json(200, { items: [] }), "ZodError"],
		[
			"연결 끊김",
			() => Promise.reject(new TypeError("fetch failed")),
			"TypeError",
		],
	])(
		"카탈로그가 실패해도(%s) 목록은 그대로이고 샘플만 없으며 한 줄만 남긴다(Review Focus 1)",
		async (_name, studio, why) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			route(() => json(200, official()), studio);
			const page = await list();
			expect(page?.voices[0]).toMatchObject({
				voiceId: ID,
				previewUrl: null,
				samples: [],
			});
			expect(log).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledWith(
				`[voiceList] airy 샘플 카탈로그 실패: ${why}`,
			);
		},
	);

	it("카탈로그가 8초 안에 답하지 않으면 끊고 목록은 샘플 없이 보인다(목록 10초 제한 안, Review Focus 1)", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation((url, init) =>
			new URL(String(url)).pathname === "/v1/studio/voices"
				? hang(url, init)
				: Promise.resolve(json(200, official())),
		);
		const pending = list();
		await vi.advanceTimersByTimeAsync(AIRY_CATALOG_TIMEOUT_MS);
		await expect(pending).resolves.toMatchObject({
			voices: [{ voiceId: ID, samples: [] }],
		});
		expect(AIRY_CATALOG_TIMEOUT_MS).toBeLessThan(CHECK_TIMEOUT_MS);
		expect(log).toHaveBeenCalledWith(
			"[voiceList] airy 샘플 카탈로그 실패: ProviderTimeoutError",
		);
	});

	it("카탈로그에 없는 id의 성우는 샘플 없이 남고 로그가 없다(Review Focus 2)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		route(() =>
			json(
				200,
				official([
					{ id: ID, name: "Silvia", gender: "female", langs: ["ko"] },
					{ id: ID2, name: "Mark", gender: "male", langs: ["ko"] },
				]),
			),
		);
		const page = await list();
		expect(page?.voices.map((v) => [v.voiceId, v.samples.length])).toEqual([
			[ID, 2],
			[ID2, 0],
		]);
		expect(page?.voices[1]?.previewUrl).toBeNull();
		expect(log).not.toHaveBeenCalled();
	});

	it.each([
		[
			"카탈로그 항목 하나가 어긋나면(audio_url 없음) 그 성우만 샘플이 없다",
			{ id: ID, name: "Silvia", gender: "female", langs: ["ko"] },
			[{ id: ID, display_name: "Silvia" }],
			{ samples: [], previewUrl: null },
		],
		[
			"모르는 성별 값은 정보 없음(null)이다",
			{ id: ID, name: "Silvia", gender: "other", langs: ["ko"] },
			[catalogVoice()],
			{ gender: null },
		],
		[
			"langs가 없으면 언어는 빈 목록이다",
			{ id: ID, name: "Silvia", gender: "female" },
			[catalogVoice()],
			{ languages: [] },
		],
		[
			"langs 모양이 어긋나면 언어만 빈 목록이다",
			{ id: ID, name: "Silvia", gender: "female", langs: "ko" },
			[catalogVoice()],
			{ languages: [], name: "Silvia" },
		],
	])("%s(로그 없음, E3)", async (_name, voice, studioVoices, expected) => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		route(
			() => json(200, official([voice])),
			() => json(200, catalog(studioVoices)),
		);
		expect((await list())?.voices[0]).toMatchObject({
			voiceId: ID,
			...expected,
		});
		expect(log).not.toHaveBeenCalled();
	});

	it("한국어·영어 주소가 같으면 샘플은 하나다(화면 패널의 key가 주소다, E3)", async () => {
		route(
			() => json(200, official()),
			() =>
				json(
					200,
					catalog([
						catalogVoice(ID, {
							audio_url: { ko: asset("ko"), en: asset("ko") },
						}),
					]),
				),
		);
		expect((await list())?.voices[0]?.samples).toEqual([KO]);
	});

	it("assets.airy.so의 https가 아닌 샘플 주소는 버리고, 한국어가 없으면 영어가 행 샘플이다", async () => {
		route(
			() => json(200, official()),
			() =>
				json(
					200,
					catalog([
						catalogVoice(ID, {
							audio_url: {
								ko: "https://assets.airy.so.evil.example/a.opus",
								en: asset("en"),
							},
						}),
					]),
				),
		);
		const voice = (await list())?.voices[0];
		expect(voice?.samples).toEqual([EN]);
		expect(voice?.previewUrl).toBe(asset("en"));
		for (const bad of [
			"http://assets.airy.so/a.opus",
			"https://cdn.airy.so/a.opus",
			"javascript:alert(1)",
		]) {
			fetchMock.mockReset();
			route(
				() => json(200, official()),
				() =>
					json(
						200,
						catalog([catalogVoice(ID, { audio_url: { ko: bad, en: bad } })]),
					),
			);
			expect((await list())?.voices[0]?.samples).toEqual([]);
		}
	});

	it("어긋난 성우(경로 글자 id, 이름 없음, 201자 이름)만 빼고 뺀 수와 필드 이름만 한 줄 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		route(() =>
			json(
				200,
				official([
					{ id: ID, name: "Silvia", gender: "female", langs: ["ko"] },
					{ id: "../x", name: "경로" },
					{ id: ID2 },
					{ id: "fedcba9876543210", name: "x".repeat(201) },
				]),
			),
		);
		const page = await list();
		expect(page?.voices.map((v) => v.voiceId)).toEqual([ID]);
		expect(log).toHaveBeenCalledWith(
			"[voiceList] airy 성우 3명 제외: id, name",
		);
	});

	it("모두 어긋나면 provider_error, 응답 모양이 어긋나도 provider_error", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		route(() => json(200, official([{ id: "../x" }])));
		await expect(list()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "airy", reason: "provider_error" },
		});
		fetchMock.mockReset();
		route(() => json(200, { data: [] }));
		await expect(list()).rejects.toMatchObject({
			data: { provider: "airy", reason: "provider_error" },
		});
	});

	it("공식 목록이 비면 provider_error다(104명 카탈로그가 0명이 될 리 없다)", async () => {
		route(() => json(200, { voices: [] }));
		await expect(list()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "airy", reason: "provider_error" },
		});
	});

	it("429는 rate_limit이고 Retry-After로 다음 호출 가능 시각을 담는다", async () => {
		route(() =>
			json(429, airyError("concurrent_limit_exceeded"), {
				"retry-after": "30",
			}),
		);
		const error = (await list()?.catch((e: unknown) => e)) as {
			code: string;
			data: { reason: string; retryAt?: string };
		};
		expect(error.code).toBe("TOO_MANY_REQUESTS");
		expect(error.data.reason).toBe("rate_limit");
		expect(Date.parse(error.data.retryAt ?? "")).toBeGreaterThan(Date.now());
	});
});

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9]);
const audio = () =>
	new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
const synth = (settings: Partial<AirySettings> = {}, text = "안녕하세요") =>
	createAiry(KEY).synthesize?.({
		provider: "airy",
		voiceId: ID,
		text,
		settings: { ...DEFAULT_SETTINGS.airy, ...settings },
	});

describe("Airy 시험 생성", () => {
	it("본문은 필드 여섯뿐이고 공식 호스트에 POST 1회, 바이트를 돌려준다", async () => {
		fetchMock.mockImplementation(async () => audio());
		await expect(
			synth({ language: "en", style: "whisper" }, "  Hello  "),
		).resolves.toEqual(MP3);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toBe("https://api.airy.so/v1/audio/speech");
		expect(init?.method).toBe("POST");
		expect(init?.redirect).toBe("error");
		const headers = new Headers(init?.headers);
		expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
		expect(headers.get("content-type")).toBe("application/json");
		expect(JSON.parse(String(init?.body))).toEqual({
			model: "airy-tts-v1",
			input: "Hello",
			voice: ID,
			language: "en",
			style: "whisper",
			response_format: "mp3",
		});
	});

	it.each([
		[400, "unsupported_characters", "BAD_REQUEST", "provider_input"],
		[402, "insufficient_credits", "BAD_GATEWAY", "quota"],
		[429, "inference_busy", "TOO_MANY_REQUESTS", "rate_limit"],
	])(
		"%s %s → %s·%s, 다시 부르지 않는다(입력 거절은 공급자 오류 코드를 담는다)",
		async (status, code, orpcCode, reason) => {
			fetchMock.mockResolvedValue(json(status, airyError(code)));
			await expect(synth()).rejects.toMatchObject({
				code: orpcCode,
				data: {
					provider: "airy",
					reason,
					...(reason === "provider_input" ? { providerCode: code } : {}),
				},
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		},
	);

	it("연결이 끊기거나 60초를 넘기면 처리 여부 미확인이고 한 번만 부른다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.useFakeTimers();
		fetchMock.mockReset();
		fetchMock.mockImplementation(hang);
		const pending = synth();
		const settled = vi.fn();
		pending?.then(settled, settled);
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		await expect(pending).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("Airy 성우 한 명 조회(이용 가능 확인)", () => {
	it("목록에서 id를 찾고, 같은 클라이언트에서는 여러 번 불러도 목록·카탈로그를 한 번씩만 부른다", async () => {
		route(() =>
			json(
				200,
				official([{ id: ID, name: "Silvia", gender: "female", langs: ["ko"] }]),
			),
		);
		const client = createAiry(KEY);
		const [found, gone, again] = await Promise.all([
			client.getVoice?.("public", ID),
			client.getVoice?.("public", ID2),
			client.getVoice?.("public", ID),
		]);
		expect(found).toMatchObject({
			provider: "airy",
			voiceId: ID,
			samples: [KO, EN],
		});
		expect(gone).toBeNull();
		expect(again).toEqual(found);
		expect(pathsCalled().sort()).toEqual(["/v1/studio/voices", "/v1/voices"]);
	});

	it("카탈로그만 실패하면 성우는 찾고 샘플만 비며 로그는 한 줄이다(계획에서 정한 것 12, E3)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		route(
			() => json(200, official()),
			() => json(500, {}),
		);
		await expect(
			createAiry(KEY).getVoice?.("public", ID),
		).resolves.toMatchObject({ voiceId: ID, samples: [], previewUrl: null });
		expect(log).toHaveBeenCalledTimes(1);
	});

	it("새 클라이언트(새 요청)는 목록을 다시 부른다", async () => {
		route(() => json(200, official()));
		await createAiry(KEY).getVoice?.("public", ID);
		await createAiry(KEY).getVoice?.("public", ID);
		expect(pathsCalled().filter((p) => p === "/v1/voices")).toHaveLength(2);
	});

	it("공식 목록이 비면 null이 아니라 provider_error로 거절한다", async () => {
		route(() => json(200, { voices: [] }));
		await expect(
			createAiry(KEY).getVoice?.("public", ID),
		).rejects.toMatchObject({
			data: { provider: "airy", reason: "provider_error" },
		});
	});

	it("목록 오류는 null이 아니라 사유를 붙여 던진다", async () => {
		route(() => json(401, airyError("invalid_api_key")));
		await expect(
			createAiry(KEY).getVoice?.("public", ID),
		).rejects.toMatchObject({
			data: { provider: "airy", reason: "provider_auth" },
		});
	});
});
