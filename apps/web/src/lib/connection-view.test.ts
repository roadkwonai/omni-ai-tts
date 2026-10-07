import { describe, expect, it } from "vitest";

import {
	creditNumber,
	isUpcoming,
	recheckUntil,
	toView,
} from "./connection-view";

const failedAt = Date.parse("2026-10-04T07:00:00.000Z");

describe("toView", () => {
	it("조회가 실패하면 그 시각의 확인 실패 결과다", () => {
		expect(
			toView("elevenlabs", {
				data: undefined,
				isError: true,
				errorUpdatedAt: failedAt,
			}),
		).toEqual({
			provider: "elevenlabs",
			status: "check_failed",
			quota: null,
			providerCode: null,
			retryAfterSeconds: null,
			checkedAt: "2026-10-04T07:00:00.000Z",
		});
	});

	it("데이터 없이 실패한 조회를 다시 확인하는 동안에도 확인 실패를 유지한다(query-core가 오류를 지운다)", () => {
		expect(
			toView("typecast", {
				data: undefined,
				isError: false,
				errorUpdatedAt: failedAt,
			})?.status,
		).toBe("check_failed");
	});
});

describe("recheckUntil", () => {
	it("rate_limit과 초가 있을 때만 확인 시각에 초를 더한다", () => {
		const result = {
			provider: "typecast",
			status: "rate_limit",
			quota: null,
			providerCode: null,
			retryAfterSeconds: 60,
			checkedAt: "2026-10-05T10:00:00.000Z",
		} as const;
		expect(recheckUntil(result)).toBe("2026-10-05T10:01:00.000Z");
		expect(recheckUntil({ ...result, retryAfterSeconds: null })).toBeNull();
		expect(recheckUntil({ ...result, status: "connected" })).toBeNull();
		expect(recheckUntil(null)).toBeNull();
	});
});

describe("isUpcoming", () => {
	const now = Date.parse("2026-10-04T00:00:00.000Z");
	it("지금보다 뒤인 시각만 참이다(CS-08)", () => {
		expect(isUpcoming("2026-10-20T00:00:00.000Z", now)).toBe(true);
		expect(isUpcoming("2026-09-20T00:00:00.000Z", now)).toBe(false);
		expect(isUpcoming("2026-10-04T00:00:00.000Z", now)).toBe(false);
	});
});

describe("creditNumber", () => {
	it("소수 한 자리까지 버림, 0 아래는 0(실제보다 크게 보이지 않게, 연결 상태 브리프 카드 절)", () => {
		expect(creditNumber(12.56)).toBe("12.5");
		expect(creditNumber(9.9996)).toBe("9.9");
		expect(creditNumber(1234.5)).toBe("1,234.5");
		expect(creditNumber(7)).toBe("7");
		expect(creditNumber(-3)).toBe("0");
	});
});
