import { describe, expect, it } from "vitest";
import { robotsHeaders } from "./next-headers";

describe("robotsHeaders", () => {
	const noindex = [
		{
			source: "/:path*",
			headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
		},
	];

	it("owner는 noindex", () => {
		expect(robotsHeaders("owner")).toEqual(noindex);
	});

	it("미설정도 owner로 보고 noindex", () => {
		expect(robotsHeaders(undefined)).toEqual(noindex);
	});

	it("demo는 헤더 없음", () => {
		expect(robotsHeaders("demo")).toEqual([]);
	});
});
