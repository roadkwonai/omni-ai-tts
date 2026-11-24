import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
	CHECK_TIMEOUT_MS,
	fetchJson,
	ProviderHttpError,
	reasonFromHttp,
	retryAfterSeconds,
	runCheck,
	runList,
	runTrial,
	STUDIO_TIMEOUT_MS,
	TRIAL_TIMEOUT_MS,
	trialReason,
} from "./errors";
import { createProviders } from "./index";
import { fetchMock, json, useFetchMock } from "./test-utils";
import { DEFAULT_SETTINGS, type TrialRequest } from "./trial-options";

describe("reasonFromHttp", () => {
	it("상태 코드를 tts-provider 표의 사유로 바꾼다", () => {
		expect(reasonFromHttp(401)).toBe("provider_auth");
		expect(reasonFromHttp(403)).toBe("provider_auth");
		expect(reasonFromHttp(402)).toBe("quota");
		expect(reasonFromHttp(429, ["insufficient_quota"])).toBe("quota");
		expect(reasonFromHttp(429, [])).toBe("rate_limit");
		expect(reasonFromHttp(429)).toBe("rate_limit");
		expect(reasonFromHttp(400)).toBe("provider_input");
		expect(reasonFromHttp(422)).toBe("provider_input");
		expect(reasonFromHttp(500)).toBe("provider_error");
		expect(reasonFromHttp(503)).toBe("provider_error");
	});

	it("401·403에 권한 부족 코드가 있으면 no_permission이다", () => {
		expect(reasonFromHttp(401, ["missing_permissions"])).toBe("no_permission");
		expect(reasonFromHttp(403, ["insufficient_permissions"])).toBe(
			"no_permission",
		);
		expect(reasonFromHttp(401, ["invalid_api_key"])).toBe("provider_auth");
		// 권한 코드라도 401·403이 아니면 권한 부족이 아니다.
		expect(reasonFromHttp(429, ["missing_permissions"])).toBe("rate_limit");
	});

	it("표에 없는 상태는 null이다", () => {
		expect(reasonFromHttp(404)).toBeNull();
		expect(reasonFromHttp(302)).toBeNull();
	});
});

describe("retryAfterSeconds", () => {
	it("1~999999초의 정수만 받는다", () => {
		expect(retryAfterSeconds("12")).toBe(12);
		expect(retryAfterSeconds(" 7 ")).toBe(7);
		expect(retryAfterSeconds("999999")).toBe(999_999);
		expect(retryAfterSeconds("0")).toBeNull();
		expect(retryAfterSeconds("1000000")).toBeNull();
		expect(retryAfterSeconds("Wed, 21 Oct 2015 07:28:00 GMT")).toBeNull();
		expect(retryAfterSeconds("1.5")).toBeNull();
		expect(retryAfterSeconds("-1")).toBeNull();
		expect(retryAfterSeconds("")).toBeNull();
		expect(retryAfterSeconds(null)).toBeNull();
	});
});

describe("runCheck", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("공급자 HTTP 실패를 연결 상태로 바꾼다(입력 거절과 표에 없는 상태는 확인 실패)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const expected = [
			[402, "quota"],
			[503, "provider_error"],
			[422, "check_failed"],
			[404, "check_failed"],
		] as const;
		for (const [status, connection] of expected) {
			await expect(
				runCheck("fish_audio", async () => {
					throw new ProviderHttpError(status, [], "30");
				}),
			).resolves.toMatchObject({
				status: connection,
				providerCode: `HTTP ${status}`,
				// Retry-After는 요청 제한일 때만 담는다.
				retryAfterSeconds: null,
			});
		}
		// ProviderHttpError 경로는 로그를 쓰지 않는다.
		expect(log).not.toHaveBeenCalled();
	});

	it("계약에 맞지 않는 잔여 사용량(Infinity)은 확인 실패이고 로그에 값이 없다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			runCheck("fish_audio", async () => ({
				status: "connected",
				quota: {
					remaining: Number.POSITIVE_INFINITY,
					total: null,
					plan: null,
					resetAt: null,
					overageAllowed: false,
				},
			})),
		).resolves.toMatchObject({ status: "check_failed", quota: null });
		expect(log).toHaveBeenCalledTimes(1);
		const line = String(log.mock.calls[0]?.[0]);
		expect(line).toContain("ZodError (remaining)");
		expect(line).not.toContain("Infinity");
	});
});

describe("runList", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	const fail = (error: unknown) =>
		runList("typecast", async () => {
			throw error;
		});

	it("성공하면 값을 그대로 돌려준다", async () => {
		await expect(runList("typecast", async () => 42)).resolves.toBe(42);
	});

	it.each([
		["401", new ProviderHttpError(401), "BAD_GATEWAY", "provider_auth"],
		["429", new ProviderHttpError(429), "TOO_MANY_REQUESTS", "rate_limit"],
		["400", new ProviderHttpError(400), "BAD_GATEWAY", "provider_error"],
		["402", new ProviderHttpError(402), "BAD_GATEWAY", "quota"],
		[
			"404(표에 없음)",
			new ProviderHttpError(404),
			"BAD_GATEWAY",
			"provider_error",
		],
		[
			"연결 끊김",
			new TypeError("fetch failed"),
			"GATEWAY_TIMEOUT",
			"unknown_outcome",
		],
		[
			"JSON이 아닌 응답",
			new SyntaxError("Unexpected token"),
			"BAD_GATEWAY",
			"provider_error",
		],
		[
			"응답 검증 실패",
			z.object({ voice_name: z.string() }).safeParse({ voice_name: 1 }).error,
			"BAD_GATEWAY",
			"provider_error",
		],
	])("%s → %s·%s", async (_name, error, code, reason) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(fail(error)).rejects.toMatchObject({
			code,
			data: { provider: "typecast", reason },
		});
	});

	it("응답 검증 실패의 로그는 오류 이름과 필드 이름 한 줄이다(배열 위치는 뺀다)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const invalid = z
			.array(z.object({ voice_name: z.string() }))
			.safeParse([{ voice_name: 1 }]).error;
		await fail(invalid).catch(() => {});
		expect(log).toHaveBeenCalledWith(
			"[voiceList] typecast 목록 조회 실패: ZodError (voice_name)",
		);
	});

	it("여러 항목이 같은 필드를 어기면 필드 이름은 하나이고, 뿌리 수준 실패는 (root)다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const items = z.array(z.object({ voice_name: z.string() }));
		await fail(
			items.safeParse([{ voice_name: 1 }, { voice_name: 2 }, { voice_name: 3 }])
				.error,
		).catch(() => {});
		await fail(items.safeParse({ voices: [] }).error).catch(() => {});
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 목록 조회 실패: ZodError (voice_name)"],
			["[voiceList] typecast 목록 조회 실패: ZodError ((root))"],
		]);
	});

	it("예상 밖 예외는 바꾸지 않고 던진다(500, 오류 경계)", async () => {
		const unexpected = new RangeError("bug");
		await expect(fail(unexpected)).rejects.toBe(unexpected);
	});

	it("10초가 지나면 GATEWAY_TIMEOUT·unknown_outcome이고 로그를 남기지 않는다", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const pending = runList("typecast", () => new Promise<never>(() => {}));
		let done = false;
		pending
			.catch(() => {})
			.finally(() => {
				done = true;
			});
		// 경계: 10초 직전에는 아직 끝나지 않는다.
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS - 1);
		expect(done).toBe(false);
		const settled = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(1);
		await settled;
		expect(log).not.toHaveBeenCalled();
	});
});

describe("fetchJson", () => {
	useFetchMock();

	it("다른 호스트로의 리다이렉트를 따라가지 않는다(키 헤더가 새지 않게 redirect: error)", async () => {
		fetchMock.mockResolvedValue(json(200, { ok: true }));
		const signal = new AbortController().signal;
		await fetchJson("https://api.example.com/x", { "x-api-key": "k" }, signal);
		expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/x", {
			headers: { "x-api-key": "k" },
			signal,
			redirect: "error",
		});
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("trialReason", () => {
	it("성우·플랜 거절(403 코드)과 404는 입력 거절이고 키 문제가 아니다", () => {
		expect(trialReason(403, ["voice_access_denied"])).toBe("provider_input");
		expect(trialReason(403, ["subscription_required"])).toBe("provider_input");
		expect(trialReason(404, [])).toBe("provider_input");
		expect(trialReason(403, ["insufficient_permissions"])).toBe(
			"no_permission",
		);
		expect(trialReason(401, [])).toBe("provider_auth");
		expect(trialReason(402, ["insufficient_credits"])).toBe("quota");
		expect(trialReason(429, [])).toBe("rate_limit");
		expect(trialReason(422, ["TEXT_NOT_SYNTHESIZABLE"])).toBe("provider_input");
		expect(trialReason(503, [])).toBe("provider_error");
		expect(trialReason(418, [])).toBe("provider_error");
	});
});

describe("runTrial", () => {
	it("60초가 지나면 처리 여부 미확인", async () => {
		vi.useFakeTimers();
		const pending = runTrial("fish_audio", () => new Promise<never>(() => {}));
		const assertion = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		await assertion;
	});
	it("429는 Retry-After를 1시간까지 다음 호출 가능 시각으로, 입력 거절은 공급자 오류 코드를 담는다", async () => {
		await expect(
			runTrial("elevenlabs", async () => {
				throw new ProviderHttpError(429, [], "30");
			}),
		).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: expect.any(String) },
		});
		await expect(
			runTrial("elevenlabs", async () => {
				throw new ProviderHttpError(403, ["voice_access_denied"]);
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "voice_access_denied" },
		});
	});
	it("연결 끊김(TypeError)과 상태 코드 없는 SDK 오류는 처리 여부 미확인(계획 리뷰 E1)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			runTrial("typecast", async () => {
				throw new TypeError("fetch failed");
			}),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		// ElevenLabs SDK는 응답 전 네트워크 오류를 statusCode 없는 ElevenLabsError로 던진다. 원래 오류를 던지지 않는다(로그·화면 '다시 눌러'로 이중 과금)
		const sdkError = Object.assign(new Error("Network error"), {
			rawResponse: { headers: {} },
			body: "secret",
		});
		const error = await runTrial("elevenlabs", async () => {
			throw sdkError;
		}).catch((e: unknown) => e);
		expect(error).toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(error).not.toBe(sdkError);
		// 로그는 한 줄이고 SDK 오류 객체를 넘기지 않는다
		expect(log.mock.calls.flat().some((arg) => arg === sdkError)).toBe(false);
	});
	it("onLate가 있으면 제한 시간에 끊긴 요청의 결과를 넘긴다(T9 늦은 결과)", async () => {
		vi.useFakeTimers();
		let finish: (value: string) => void = () => {};
		const call = new Promise<string>((resolve) => {
			finish = resolve;
		});
		const onLate = vi.fn<(late: Promise<string>) => void>();
		const pending = runTrial("typecast", () => call, {
			timeoutMs: STUDIO_TIMEOUT_MS,
			onLate,
		});
		const assertion = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "typecast", reason: "unknown_outcome" },
		});
		// 내 문장의 60초에는 아직 기다린다
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		expect(onLate).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS - TRIAL_TIMEOUT_MS);
		await assertion;
		expect(onLate).toHaveBeenCalledTimes(1);
		finish("늦은 오디오");
		await expect(onLate.mock.calls[0]?.[0]).resolves.toBe("늦은 오디오");
		vi.useRealTimers();
	});
	it("제한 시간 안에 끝난 성공·실패에는 onLate를 부르지 않는다", async () => {
		const onLate = vi.fn();
		await expect(
			runTrial("typecast", async () => "ok", { onLate }),
		).resolves.toBe("ok");
		await expect(
			runTrial(
				"typecast",
				async () => {
					throw new ProviderHttpError(500);
				},
				{ onLate },
			),
		).rejects.toMatchObject({ data: { reason: "provider_error" } });
		expect(onLate).not.toHaveBeenCalled();
	});
});

// 상태 코드는 200인데 오디오가 아닌 응답(게이트웨이 점검 화면 등). 저장하면 재생되지 않는 유료 결과가 저장본으로 남는다(P1)
describe.each(["typecast", "elevenlabs", "fish_audio", "airy"] as const)(
	"%s 생성의 오디오가 아닌 200",
	(provider) => {
		useFetchMock();
		afterEach(() => vi.restoreAllMocks());
		const synthesize = () =>
			createProviders({ [provider]: "audio-test-key-0001" })[
				provider
			]?.synthesize?.({
				provider,
				voiceId: "v1",
				text: "안녕하세요",
				settings: DEFAULT_SETTINGS[provider],
			} as TrialRequest);

		it.each([
			["빈 본문", "", "audio/mpeg"],
			["JSON", '{"error":"upstream"}', "application/json"],
			["HTML", "<html>maintenance</html>", "text/html"],
			["빈 줄 뒤 HTML", "\r\n<!doctype html>", "audio/mpeg"],
		])("%s: 처리 여부 미확인이고 다시 부르지 않는다", async (_, body, type) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			const headers = { "content-type": type };
			fetchMock.mockImplementation(
				async () => new Response(body, { status: 200, headers }),
			);
			await expect(synthesize()).rejects.toMatchObject({
				code: "GATEWAY_TIMEOUT",
				data: { provider, reason: "unknown_outcome" },
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(log.mock.calls.flat().join(" ")).not.toMatch(
				/upstream|maintenance|doctype/,
			);
		});

		it.each([
			["MP3 프레임", [0xff, 0xfb, 0x90, 0x64, 0x7b, 0x3c]],
			["MP3 ID3", [0x49, 0x44, 0x33, 4, 0, 0]],
			["WAV", [0x52, 0x49, 0x46, 0x46, 1, 2]],
			["OGG", [0x4f, 0x67, 0x67, 0x53, 0, 2]],
		])("%s 바이트는 그대로 돌려준다", async (_name, bytes) => {
			fetchMock.mockImplementation(
				async () =>
					new Response(new Uint8Array(bytes), {
						status: 200,
						headers: { "content-type": "audio/mpeg" },
					}),
			);
			await expect(synthesize()).resolves.toEqual(new Uint8Array(bytes));
		});
	},
);

describe("Google(Gemini) 오류 코드(T7.6 스펙 6절)", () => {
	it("API_KEY_INVALID는 상태와 상관없이 키 오류다", () => {
		expect(reasonFromHttp(400, ["API_KEY_INVALID", "INVALID_ARGUMENT"])).toBe(
			"provider_auth",
		);
		expect(trialReason(400, ["API_KEY_INVALID", "INVALID_ARGUMENT"])).toBe(
			"provider_auth",
		);
	});

	it("403 PERMISSION_DENIED는 권한 부족, 400 FAILED_PRECONDITION은 한도 부족, 400 INVALID_ARGUMENT만이면 입력 거절", () => {
		expect(reasonFromHttp(403, ["SERVICE_DISABLED", "PERMISSION_DENIED"])).toBe(
			"no_permission",
		);
		expect(reasonFromHttp(400, ["FAILED_PRECONDITION"])).toBe("quota");
		expect(reasonFromHttp(400, ["INVALID_ARGUMENT"])).toBe("provider_input");
		// 기존 공급자의 403은 그대로 키 오류다
		expect(reasonFromHttp(403, ["account_banned"])).toBe("provider_auth");
	});

	it("잔액 조회가 없는 공급자는 quota null로 연결됨을 돌려준다", async () => {
		await expect(
			runCheck("gemini", async () => ({ status: "connected", quota: null })),
		).resolves.toMatchObject({
			provider: "gemini",
			status: "connected",
			quota: null,
		});
	});
});
