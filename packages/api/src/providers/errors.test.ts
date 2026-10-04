import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
	CHECK_TIMEOUT_MS,
	ProviderHttpError,
	reasonFromHttp,
	retryAfterSeconds,
	runCheck,
	runList,
} from "./errors";

describe("reasonFromHttp", () => {
	it("상태 코드를 tts-provider 표의 사유로 바꾼다", () => {
		expect(reasonFromHttp(401)).toBe("provider_auth");
		expect(reasonFromHttp(403)).toBe("provider_auth");
		expect(reasonFromHttp(402)).toBe("quota");
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
