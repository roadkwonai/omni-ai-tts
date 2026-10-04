import { afterEach, describe, expect, it, vi } from "vitest";

import { CHECK_TIMEOUT_MS } from "./errors";
import { fetchMock, json, useFetchMock } from "./test-utils";
import { createTypecast } from "./typecast";

const KEY = "typecast-test-key-0001";
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
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.typecast.ai");
		expect(target.pathname).toBe("/v1/users/me/subscription");
		const headers = new Headers(init?.headers);
		expect(headers.get("x-api-key")).toBe(KEY);
		expect(headers.get("user-agent")).toContain(
			"typecast-integration/1 (source=api-docs; generated_by=claude-code)",
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
