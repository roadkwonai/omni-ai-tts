import { afterEach, describe, expect, it, vi } from "vitest";

import {
	ProviderHttpError,
	reasonFromHttp,
	retryAfterSeconds,
	runCheck,
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
