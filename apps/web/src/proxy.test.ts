import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

const BASE = "http://localhost:3001";

function run(path: string, cookie?: string) {
	const headers = cookie ? { cookie } : undefined;
	return proxy(new NextRequest(`${BASE}${path}`, { headers }));
}

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy 낙관적 확인(T15-a 랜딩)", () => {
	it("쿠키 없이 정확히 /는 통과한다(쿼리 무관)", () => {
		expect(run("/").headers.get("location")).toBeNull();
		expect(run("/?utm=x").headers.get("location")).toBeNull();
	});

	it("쿠키 없이 /login은 통과한다", () => {
		expect(run("/login").headers.get("location")).toBeNull();
	});

	it("쿠키 없이 앱 화면은 /login?next=로 보낸다", () => {
		expect(run("/studio").headers.get("location")).toBe(
			`${BASE}/login?next=%2Fstudio`,
		);
		expect(run("/x").headers.get("location")).toBe(`${BASE}/login?next=%2Fx`);
	});

	it("쿼리를 next에 보존한다", () => {
		expect(run("/studio?x=1").headers.get("location")).toBe(
			`${BASE}/login?next=%2Fstudio%3Fx%3D1`,
		);
	});

	it("세션 쿠키가 있으면 앱 화면도 통과한다", () => {
		const res = run("/studio", "better-auth.session_token=abc");
		expect(res.headers.get("location")).toBeNull();
	});

	it("공개 정적 파일은 matcher에서 빠진다", () => {
		for (const url of [
			"/brand/logo-light.png",
			"/screenshots/studio.png",
			"/icon.png",
			"/apple-icon.png",
			"/robots.txt",
			"/sitemap.xml",
			"/favicon.ico",
		]) {
			expect(matches(url), url).toBe(false);
		}
	});

	it("앱 화면과 비슷한 이름은 matcher에 남는다", () => {
		for (const url of [
			"/",
			"/studio",
			"/voices",
			"/drama",
			"/brandnew",
			"/icon.png.x",
			"/login",
		]) {
			expect(matches(url), url).toBe(true);
		}
	});
});
