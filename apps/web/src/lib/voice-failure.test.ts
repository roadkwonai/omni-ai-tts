import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { failureOf } from "./voice-failure";

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
