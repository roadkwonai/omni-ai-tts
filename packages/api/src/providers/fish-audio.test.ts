import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_TIMEOUT_MS } from "./errors";
import { createFishAudio } from "./fish-audio";
import { fetchMock, json, useFetchMock } from "./test-utils";

const KEY = "fish-test-key-0001";
const check = () => createFishAudio(KEY).checkStatus();

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// 상태 코드 → 사유 표 전체는 errors.test.ts가 고정한다. 여기서는 fetch 응답을 바꿔 담는 것만 본다.
describe("Fish Audio 연결 확인", () => {
	it("200이면 연결됨과 API 크레딧 잔액, 요청은 공식 호스트에 Bearer 키로 1회", async () => {
		fetchMock.mockResolvedValue(
			json(200, { credit: "12.345", has_free_credit: false }),
		);
		const result = await check();
		expect(result).toMatchObject({
			provider: "fish_audio",
			status: "connected",
			quota: {
				remaining: 12.345,
				total: null,
				plan: null,
				resetAt: null,
				overageAllowed: false,
			},
			providerCode: null,
			retryAfterSeconds: null,
		});
		expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.fish.audio");
		expect(target.pathname).toBe("/wallet/self/api-credit");
		expect(new Headers(init?.headers).get("authorization")).toBe(
			`Bearer ${KEY}`,
		);
	});

	it("잔액 0이어도 연결됨이다(한도 부족은 402뿐)", async () => {
		fetchMock.mockResolvedValue(json(200, { credit: "0" }));
		await expect(check()).resolves.toMatchObject({
			status: "connected",
			quota: { remaining: 0 },
		});
	});

	it("401이면 키 오류이고 재시도하지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(401, { message: "x", status: 401 }),
		);
		await expect(check()).resolves.toMatchObject({
			status: "provider_auth",
			quota: null,
			providerCode: "HTTP 401",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429면 요청 제한이고 Retry-After 초를 담으며 재시도하지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(429, { message: "x" }, { "retry-after": "30" }),
		);
		await expect(check()).resolves.toMatchObject({
			status: "rate_limit",
			retryAfterSeconds: 30,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		["필드 누락", {}],
		["숫자 아님", { credit: 12 }],
		["빈 문자열", { credit: "" }],
		["숫자 모양 아님", { credit: "abc" }],
	])(
		"응답 검증 실패(%s)는 확인 실패이고 필드 경로를 남긴다",
		async (_name, body) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			fetchMock.mockResolvedValue(json(200, body));
			await expect(check()).resolves.toMatchObject({
				status: "check_failed",
				quota: null,
			});
			expect(log).toHaveBeenCalledWith(
				"[providerStatus] fish_audio 확인 실패: ZodError (credit)",
			);
		},
	);

	it("연결이 끊기면 확인 실패이고 로그에는 공급자와 오류 이름만 남는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValue(new TypeError(`fetch failed ${KEY}`));
		await expect(check()).resolves.toMatchObject({ status: "check_failed" });
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"[providerStatus] fish_audio 확인 실패: TypeError",
		);
	});

	it("10초 안에 답이 없으면 요청을 끊고 확인 실패다", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const pending = check();
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await expect(pending).resolves.toMatchObject({ status: "check_failed" });
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
		expect(log).not.toHaveBeenCalled();
	});
});
