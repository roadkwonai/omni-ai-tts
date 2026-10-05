import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { failureOf, retryAtOf } from "./voice-failure";

const providerFailure = (reason: string) =>
	new ORPCError("BAD_GATEWAY", { data: { provider: "typecast", reason } });

describe("failureOf", () => {
	it("ORPCError가 아니면 null이다(오류 경계로 던진다)", () => {
		expect(failureOf(new TypeError("Failed to fetch"))).toBeNull();
		expect(failureOf(null)).toBeNull();
	});

	it("소유자 없음(UNAUTHORIZED)은 unauthorized다", () => {
		expect(failureOf(new ORPCError("UNAUTHORIZED"))).toBe("unauthorized");
	});

	it("사유가 붙은 공급자 오류는 그 사유다", () => {
		expect(failureOf(providerFailure("provider_error"))).toBe("provider_error");
		expect(
			failureOf(
				new ORPCError("PRECONDITION_FAILED", {
					data: { provider: "typecast", reason: "no_key" },
				}),
			),
		).toBe("no_key");
	});

	it("모르는 사유, 객체 기본 속성 이름, data 없음은 null이다", () => {
		expect(failureOf(providerFailure("foo"))).toBeNull();
		expect(failureOf(providerFailure("constructor"))).toBeNull();
		expect(failureOf(new ORPCError("INTERNAL_SERVER_ERROR"))).toBeNull();
	});
});

describe("retryAtOf", () => {
	it("retryAtOf는 사유 오류의 data.retryAt을, 없거나 다른 오류면 null을 돌려준다", () => {
		const limited = new ORPCError("TOO_MANY_REQUESTS", {
			data: {
				provider: "elevenlabs",
				reason: "rate_limit",
				retryAt: "2026-10-05T00:00:30.000Z",
			},
		});
		expect(retryAtOf(limited)).toBe("2026-10-05T00:00:30.000Z");
		expect(
			retryAtOf(
				new ORPCError("BAD_GATEWAY", {
					data: { provider: "elevenlabs", reason: "quota" },
				}),
			),
		).toBeNull();
		expect(retryAtOf(new Error("x"))).toBeNull();
		// 문자열이 아닌 retryAt은 시각으로 쓰지 않는다
		expect(
			retryAtOf(
				new ORPCError("TOO_MANY_REQUESTS", {
					data: { provider: "elevenlabs", reason: "rate_limit", retryAt: 30 },
				}),
			),
		).toBeNull();
	});
});
