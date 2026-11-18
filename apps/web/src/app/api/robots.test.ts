// app/robots.ts 테스트. 계층 훅이 app/robots.test.ts를 화면 계층으로 보아 서버 계층 폴더에 둔다.
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("../../env.server", () => ({ ENV: env }));

import robots from "../robots";

describe("robots(T15-a2)", () => {
	it.each([undefined, "owner"])("APP_MODE=%s: 전체 차단", (mode) => {
		env.APP_MODE = mode;
		expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
	});

	it("공개 데모: 전체 허용", () => {
		env.APP_MODE = "demo";
		expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" } });
	});
});
