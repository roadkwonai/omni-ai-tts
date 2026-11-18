import { afterEach, describe, expect, it, vi } from "vitest";

import { CHECK_TIMEOUT_MS, CLONE_TIMEOUT_MS } from "./errors";
import { createFishAudio } from "./fish-audio";
import { createGemini } from "./gemini";
import { calledUrl, fetchMock, json, useFetchMock } from "./test-utils";

// 내 보이스 클론 메서드(T13 계획 2.2). 실제 공급자는 부르지 않는다. 키는 dev-cycle secrets 패턴(sk-·AIza)을 피한다
const FISH_KEY = "fish-test-key-0001";
const GEMINI_KEY = "test-gemini-key-0001";
const FISH = "https://api.fish.audio";
const GEMINI = "https://generativelanguage.googleapis.com";
const SOURCE = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 250, 0, 7]);
const CONSENT = new Uint8Array([82, 73, 70, 70, 9, 8, 7]);

const hang = (_url: unknown, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
	});
const sent = (index = 0) => fetchMock.mock.calls[index]?.[1] ?? {};
const fishModel = (over: Record<string, unknown> = {}) => ({
	_id: "8f2c0a1b9d3e4f5a6b7c8d9e0f1a2b3c",
	type: "tts",
	title: "내 목소리",
	state: "trained",
	visibility: "private",
	...over,
});
const googleError = (code: number, status: string) => ({
	error: { code, message: `bad ${GEMINI_KEY}`, status },
});

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Fish Audio 클론 만들기(상태 변경)", () => {
	const create = () =>
		createFishAudio(FISH_KEY).cloneCreate?.(
			{ name: "내 목소리", source: SOURCE },
			{},
		);

	it("POST /model 멀티파트로 비공개·fast 클론 하나를 보내고 references·texts는 보내지 않는다", async () => {
		fetchMock.mockResolvedValueOnce(json(201, fishModel()));
		await expect(create()).resolves.toEqual({
			voiceId: "8f2c0a1b9d3e4f5a6b7c8d9e0f1a2b3c",
			state: "ready",
		});
		expect(calledUrl().href).toBe(`${FISH}/model`);
		const init = sent();
		expect(init.method).toBe("POST");
		const headers = new Headers(init.headers);
		expect(headers.get("authorization")).toBe(`Bearer ${FISH_KEY}`);
		// 경계는 fetch가 붙인다
		expect(headers.has("content-type")).toBe(false);
		const form = init.body as FormData;
		expect(form).toBeInstanceOf(FormData);
		expect(form.get("type")).toBe("tts");
		expect(form.get("title")).toBe("내 목소리");
		expect(form.get("train_mode")).toBe("fast");
		expect(form.get("visibility")).toBe("private");
		expect(form.get("enhance_audio_quality")).toBe("true");
		expect(form.has("references")).toBe(false);
		expect(form.has("texts")).toBe(false);
		const voices = form.getAll("voices");
		expect(voices).toHaveLength(1);
		const file = voices[0] as File;
		expect(file.type).toBe("audio/wav");
		expect(file.name).toBe("source.wav");
		expect(new Uint8Array(await file.arrayBuffer())).toEqual(SOURCE);
	});

	it("state를 ready·processing·failed로 바꾸고, failed여도 id를 돌려준다", async () => {
		const cases = [
			["trained", "ready"],
			["created", "processing"],
			["training", "processing"],
			["failed", "failed"],
		] as const;
		for (const [state, expected] of cases) {
			fetchMock.mockResolvedValueOnce(json(201, fishModel({ state })));
			await expect(create()).resolves.toMatchObject({
				voiceId: "8f2c0a1b9d3e4f5a6b7c8d9e0f1a2b3c",
				state: expected,
			});
		}
	});

	it("품질 검사에 떨어진 원본이 하나라도 있으면 failed(quality)이고 id는 돌려준다", async () => {
		fetchMock.mockResolvedValueOnce(
			json(
				201,
				fishModel({
					quality: {
						audios: [
							{ filename: "a.wav", duration_ms: 1, quality_passed: true },
							{ filename: "b.wav", duration_ms: 1, quality_passed: false },
						],
					},
				}),
			),
		);
		await expect(create()).resolves.toEqual({
			voiceId: "8f2c0a1b9d3e4f5a6b7c8d9e0f1a2b3c",
			state: "failed",
			reason: "quality",
		});
		fetchMock.mockResolvedValueOnce(
			json(
				201,
				fishModel({
					quality: {
						audios: [
							{ filename: "a.wav", duration_ms: 1, quality_passed: true },
						],
					},
				}),
			),
		);
		await expect(create()).resolves.toMatchObject({ state: "ready" });
	});

	it("받은 id가 성우 id 모양이 아니면 provider_error다", async () => {
		fetchMock.mockResolvedValueOnce(json(201, fishModel({ _id: "../x" })));
		await expect(create()).rejects.toMatchObject({
			data: { provider: "fish_audio", reason: "provider_error" },
		});
	});

	it("401·402·429(Retry-After)·5xx를 tts-provider 표의 사유로 바꾸고 다시 부르지 않는다", async () => {
		const cases = [
			[() => json(401, { status: 401, message: "x" }), "provider_auth"],
			[() => json(402, { status: 402, message: "x" }), "quota"],
			[() => json(400, { status: 400, message: "x" }), "provider_input"],
			[() => json(503, { status: 503, message: "x" }), "provider_error"],
		] as const;
		for (const [response, reason] of cases) {
			fetchMock.mockReset();
			fetchMock.mockImplementation(async () => response());
			await expect(create()).rejects.toMatchObject({
				data: { provider: "fish_audio", reason },
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		}
		fetchMock.mockReset();
		fetchMock.mockImplementation(async () =>
			json(429, { status: 429, message: "x" }, { "retry-after": "30" }),
		);
		const error = (await create()?.catch((caught: unknown) => caught)) as {
			code: string;
			data: { reason: string; retryAt: string };
		};
		expect(error.code).toBe("TOO_MANY_REQUESTS");
		expect(error.data.reason).toBe("rate_limit");
		const seconds = (Date.parse(error.data.retryAt) - Date.now()) / 1000;
		expect(seconds).toBeGreaterThan(25);
		expect(seconds).toBeLessThanOrEqual(30);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("120초 안에 답하지 않으면 처리 여부 미확인이고 다시 부르지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(create()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(CLONE_TIMEOUT_MS);
		await assertion;
		expect(CLONE_TIMEOUT_MS).toBe(120_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("로그에 원본 바이트·응답 본문·공급자 id·키를 남기지 않는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(create()).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		const text = log.mock.calls.flat().join(" ");
		expect(text).not.toContain(FISH_KEY);
		expect(text).not.toContain("8f2c0a1b");
	});
});

describe("Fish Audio 클론 조회·지우기", () => {
	const client = () => createFishAudio(FISH_KEY);

	it("GET /model/{id}의 state를 돌려주고 403·404는 null이다", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, fishModel({ state: "training" })),
		);
		await expect(client().cloneGet?.("abc_1")).resolves.toEqual({
			state: "processing",
		});
		expect(calledUrl().href).toBe(`${FISH}/model/abc_1`);
		for (const status of [403, 404]) {
			fetchMock.mockResolvedValueOnce(json(status, { status, message: "x" }));
			await expect(client().cloneGet?.("abc_1")).resolves.toBeNull();
		}
	});

	it("조회는 10초에 끊는다(처리 여부 미확인)", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(
			client().cloneGet?.("abc_1"),
		).rejects.toMatchObject({
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await assertion;
	});

	it("DELETE /model/{id}를 한 번 부르고 404는 성공이다", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
		await expect(client().cloneDelete?.("abc_1")).resolves.toBeUndefined();
		expect(calledUrl().href).toBe(`${FISH}/model/abc_1`);
		expect(sent().method).toBe("DELETE");
		fetchMock.mockResolvedValueOnce(json(404, { status: 404, message: "x" }));
		await expect(client().cloneDelete?.("abc_1")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("지우기 연결 끊김은 '지우기 실패' 한 줄을 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(client().cloneDelete?.("abc_1")).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		expect(log.mock.calls).toEqual([
			["[myVoice] fish_audio 지우기 실패: TypeError"],
		]);
	});

	it("지우기 503은 provider_error이고 다시 부르지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(503, { status: 503, message: "x" }),
		);
		await expect(client().cloneDelete?.("abc_1")).rejects.toMatchObject({
			data: { provider: "fish_audio", reason: "provider_error" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("Gemini 클론 만들기(상태 변경)", () => {
	const create = () =>
		createGemini(GEMINI_KEY).cloneCreate?.(
			{ name: "내 목소리", source: SOURCE, consent: CONSENT },
			{},
		);

	it("POST /v1beta/voices에 store true·replicated·base64 원본과 동의 녹음을 보내고 ready를 돌려준다", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, { id: "voice_abc123def456", type: "replicated" }),
		);
		await expect(create()).resolves.toEqual({
			voiceId: "voice_abc123def456",
			state: "ready",
		});
		expect(calledUrl().href).toBe(`${GEMINI}/v1beta/voices`);
		const init = sent();
		expect(init.method).toBe("POST");
		const headers = new Headers(init.headers);
		expect(headers.get("x-goog-api-key")).toBe(GEMINI_KEY);
		expect(headers.get("content-type")).toBe("application/json");
		const body = JSON.parse(String(init.body));
		expect(body.store).toBe(true);
		expect(body.voice).toMatchObject({
			model: "gemini-3.8-flash-tts",
			type: "replicated",
			display_name: "내 목소리",
		});
		const { source_audio, consent_audio } = body.voice.replicated;
		expect(source_audio.mime_type).toBe("audio/wav");
		expect(consent_audio.mime_type).toBe("audio/wav");
		expect(new Uint8Array(Buffer.from(source_audio.data, "base64"))).toEqual(
			SOURCE,
		);
		expect(new Uint8Array(Buffer.from(consent_audio.data, "base64"))).toEqual(
			CONSENT,
		);
	});

	it("id가 voices/로 시작하면 접두어를 뗀다", async () => {
		fetchMock.mockResolvedValueOnce(json(200, { id: "voices/voice_abc123" }));
		await expect(create()).resolves.toMatchObject({ voiceId: "voice_abc123" });
	});

	it("뗀 id가 성우 id 모양이 아니거나 없으면 provider_error다", async () => {
		for (const body of [{ id: "voices/a/b" }, { id: "" }, {}]) {
			fetchMock.mockResolvedValueOnce(json(200, body));
			await expect(create()).rejects.toMatchObject({
				data: { provider: "gemini", reason: "provider_error" },
			});
		}
	});

	it("동의 녹음이 없으면 공급자를 부르지 않고 입력 거절이다", async () => {
		const call = createGemini(GEMINI_KEY).cloneCreate?.(
			{ name: "내 목소리", source: SOURCE },
			{},
		);
		await expect(call).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { provider: "gemini", reason: "provider_input" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("401·429(Retry-After)·5xx를 tts-provider 표의 사유로 바꾸고 다시 부르지 않는다", async () => {
		const cases = [
			[() => json(401, googleError(401, "UNAUTHENTICATED")), "provider_auth"],
			[() => json(403, googleError(403, "PERMISSION_DENIED")), "no_permission"],
			[() => json(400, googleError(400, "INVALID_ARGUMENT")), "provider_input"],
			[() => json(500, googleError(500, "INTERNAL")), "provider_error"],
		] as const;
		for (const [response, reason] of cases) {
			fetchMock.mockReset();
			fetchMock.mockImplementation(async () => response());
			await expect(create()).rejects.toMatchObject({
				data: { provider: "gemini", reason },
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		}
		fetchMock.mockReset();
		fetchMock.mockImplementation(async () =>
			json(429, googleError(429, "RESOURCE_EXHAUSTED"), {
				"retry-after": "30",
			}),
		);
		const error = (await create()?.catch((caught: unknown) => caught)) as {
			data: { reason: string; retryAt: string };
		};
		expect(error.data.reason).toBe("rate_limit");
		const seconds = (Date.parse(error.data.retryAt) - Date.now()) / 1000;
		expect(seconds).toBeGreaterThan(25);
		expect(seconds).toBeLessThanOrEqual(30);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("120초 안에 답하지 않으면 처리 여부 미확인이고 다시 부르지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(create()).rejects.toMatchObject({
			data: { provider: "gemini", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(CLONE_TIMEOUT_MS - 1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("Gemini 클론 조회·지우기", () => {
	const client = () => createGemini(GEMINI_KEY);

	it("GET /v1beta/voices/{id}가 있으면 ready, 404면 null이다", async () => {
		fetchMock.mockResolvedValueOnce(json(200, { id: "voice_abc123" }));
		await expect(client().cloneGet?.("voice_abc123")).resolves.toEqual({
			state: "ready",
		});
		expect(calledUrl().href).toBe(`${GEMINI}/v1beta/voices/voice_abc123`);
		expect(new Headers(sent().headers).get("x-goog-api-key")).toBe(GEMINI_KEY);
		fetchMock.mockResolvedValueOnce(json(404, googleError(404, "NOT_FOUND")));
		await expect(client().cloneGet?.("voice_abc123")).resolves.toBeNull();
	});

	it("DELETE /v1beta/voices/{id}를 한 번 부르고 404는 성공이다", async () => {
		fetchMock.mockResolvedValueOnce(json(200, {}));
		await expect(
			client().cloneDelete?.("voice_abc123"),
		).resolves.toBeUndefined();
		expect(calledUrl().href).toBe(`${GEMINI}/v1beta/voices/voice_abc123`);
		expect(sent().method).toBe("DELETE");
		fetchMock.mockResolvedValueOnce(json(404, googleError(404, "NOT_FOUND")));
		await expect(
			client().cloneDelete?.("voice_abc123"),
		).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("지우기 연결 끊김은 '지우기 실패' 한 줄을 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(client().cloneDelete?.("voice_abc123")).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		expect(log.mock.calls).toEqual([
			["[myVoice] gemini 지우기 실패: TypeError"],
		]);
	});

	it("지우기 5xx는 provider_error이고 다시 부르지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(500, googleError(500, "INTERNAL")),
		);
		await expect(client().cloneDelete?.("voice_abc123")).rejects.toMatchObject({
			data: { provider: "gemini", reason: "provider_error" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
