import { describe, expect, it } from "vitest";

import { isUpcoming, toView } from "./connection-view";

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

describe("isUpcoming", () => {
	const now = Date.parse("2026-10-04T00:00:00.000Z");
	it("지금보다 뒤인 시각만 참이다(CS-08)", () => {
		expect(isUpcoming("2026-10-20T00:00:00.000Z", now)).toBe(true);
		expect(isUpcoming("2026-09-20T00:00:00.000Z", now)).toBe(false);
		expect(isUpcoming("2026-10-04T00:00:00.000Z", now)).toBe(false);
	});
});
