import { afterEach, describe, expect, it, vi } from "vitest";

import { createElevenLabs } from "./elevenlabs";
import { CHECK_TIMEOUT_MS } from "./errors";
import { fetchMock, json, useFetchMock } from "./test-utils";

const KEY = "sk_elevenlabs_test_0001";
// SDK가 필수로 검사하는 필드를 모두 채운 구독 응답이다(2.70.0 serialization/types/Subscription).
const subscription = (over: Record<string, unknown> = {}) => ({
	tier: "creator",
	character_count: 1_000,
	character_limit: 100_000,
	max_credit_limit_extension: 0,
	can_extend_character_limit: false,
	allowed_to_extend_character_limit: false,
	next_character_count_reset_unix: 1_760_227_200,
	voice_slots_used: 0,
	professional_voice_slots_used: 0,
	professional_voice_slots_used_in_workspace: 0,
	voice_limit: 30,
	voice_add_edit_counter: 0,
	professional_voice_limit: 1,
	can_extend_voice_limit: false,
	can_use_instant_voice_cloning: true,
	can_use_professional_voice_cloning: true,
	current_overage: { amount: "0", currency: "usd" },
	status: "active",
	open_invoices: [],
	has_open_invoices: false,
	...over,
});
const detail = (code: string, status = code) => ({
	detail: {
		type: "authentication_error",
		code,
		message: "x",
		status,
		request_id: "r1",
	},
});
const check = () => createElevenLabs(KEY).checkStatus();

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

// 상태 코드 → 사유 표 전체는 errors.test.ts가 고정한다. 여기서는 SDK 오류를 바꿔 담는 것과 권한 부족 형태만 본다.
describe("ElevenLabs 연결 확인", () => {
	it("200이면 연결됨과 남은 글자·초기화 시각, 요청은 공식 호스트에 키를 붙여 1회", async () => {
		vi.stubEnv("ELEVENLABS_API_KEY", "env-key");
		fetchMock.mockResolvedValue(json(200, subscription()));
		await expect(check()).resolves.toMatchObject({
			provider: "elevenlabs",
			status: "connected",
			quota: {
				remaining: 99_000,
				total: 100_000,
				plan: null,
				resetAt: new Date(1_760_227_200 * 1000).toISOString(),
				overageAllowed: false,
			},
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.elevenlabs.io");
		expect(target.pathname).toBe("/v1/user/subscription");
		expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
	});

	it("초기화 시각이 null이고 모르는 필드가 더 와도 연결됨이다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				subscription({
					next_character_count_reset_unix: null,
					field_added_later: { any: "shape" },
				}),
			),
		);
		await expect(check()).resolves.toMatchObject({
			status: "connected",
			quota: { resetAt: null },
		});
	});

	it("잔여 0 이하는 확장이 0일 때만 한도 부족이다", async () => {
		fetchMock.mockImplementation(async () =>
			json(200, subscription({ character_count: 100_000 })),
		);
		await expect(check()).resolves.toMatchObject({
			status: "quota",
			quota: { remaining: 0, overageAllowed: false },
		});
		fetchMock.mockImplementation(async () =>
			json(
				200,
				subscription({
					character_count: 100_500,
					max_credit_limit_extension: 5_000,
				}),
			),
		);
		await expect(check()).resolves.toMatchObject({
			status: "connected",
			quota: { remaining: -500, overageAllowed: true },
		});
		fetchMock.mockImplementation(async () =>
			json(
				200,
				subscription({
					character_count: 100_000,
					max_credit_limit_extension: "unlimited",
				}),
			),
		);
		await expect(check()).resolves.toMatchObject({ status: "connected" });
	});

	it.each([
		[401, detail("invalid_api_key"), "provider_auth", "invalid_api_key"],
		[
			403,
			detail("insufficient_permissions"),
			"no_permission",
			"insufficient_permissions",
		],
		// 비공식 자료의 형태: code는 다르고 status에 권한 코드가 온다. 코드 줄에는 권한 코드를 먼저 보인다.
		[
			401,
			detail("unauthorized", "missing_permissions"),
			"no_permission",
			"missing_permissions",
		],
	] as const)(
		"HTTP %i(%j)이면 %s, 코드 %s이고 재시도하지 않는다",
		async (status, body, expected, code) => {
			fetchMock.mockImplementation(async () => json(status, body));
			await expect(check()).resolves.toMatchObject({
				status: expected,
				providerCode: code,
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		},
	);

	it("429면 요청 제한이고 Retry-After 초를 담으며 재시도하지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(429, detail("rate_limit_exceeded"), { "retry-after": "7" }),
		);
		await expect(check()).resolves.toMatchObject({
			status: "rate_limit",
			retryAfterSeconds: 7,
			providerCode: "rate_limit_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		["필드 누락", subscription({ character_limit: undefined })],
		["숫자 아님", subscription({ character_count: "1000" })],
	])(
		"응답 검증 실패(%s)는 확인 실패이고 SDK가 준 경로만 남긴다",
		async (_name, body) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			fetchMock.mockResolvedValue(json(200, body));
			await expect(check()).resolves.toMatchObject({ status: "check_failed" });
			expect(log).toHaveBeenCalledTimes(1);
			expect(log.mock.calls[0]?.[0]).toMatch(
				/^\[providerStatus\] elevenlabs 확인 실패: ParseError \(response/,
			);
			// ParseError 메시지에는 받은 값이 들어 있어 남기지 않는다.
			expect(String(log.mock.calls[0]?.[0])).not.toContain("1000");
		},
	);

	it("연결이 끊기면 확인 실패이고 로그에 키가 없다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));
		await expect(check()).resolves.toMatchObject({ status: "check_failed" });
		expect(log).toHaveBeenCalledWith(
			"[providerStatus] elevenlabs 확인 실패: ElevenLabsError",
		);
		expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
	});

	it("10초 안에 답이 없으면 abortSignal로 요청을 끊고 확인 실패다", async () => {
		vi.useFakeTimers();
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
	});
});
