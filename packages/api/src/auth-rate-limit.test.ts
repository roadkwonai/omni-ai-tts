import { createAuth } from "@tts-pilot-app/auth";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { testDb as db, testDatabaseUrl as url } from "./test-db";

// T15-a: 로그인 시도 제한(60초 5회)은 DB rate_limit 표에 쌓여 인스턴스가 여럿이어도 같은 횟수다(스펙 결정 8).
// 시도 제한은 HTTP 핸들러에서만 돈다(auth.api 직접 호출은 지나지 않는다). 키는 `<IP>|<basePath를 뗀 경로>`이고 IP는 x-forwarded-for 한 값이다(better-auth 1.7.5 getIP).
describe.skipIf(!url)("로그인 시도 제한(테스트 DB)", () => {
	const base = "http://127.0.0.1:3002";
	const auth = createAuth(
		{
			BETTER_AUTH_URL: base,
			BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
		},
		db,
	);
	// 공유 테스트 DB에서 다시 돌려도 첫 요청이 429가 되지 않게 실행마다 다른 IP(198.18.0.0/15 시험용 대역)
	const n = Date.now();
	const ip = `198.18.${(n >> 8) & 255}.${n & 255}`;
	const key = `${ip}|/sign-in/email`;
	const signIn = () =>
		auth.handler(
			new Request(`${base}/api/auth/sign-in/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: base,
					"x-forwarded-for": ip,
				},
				body: JSON.stringify({
					email: "rate-limit-nobody@example.test",
					password: "wrong-password-0000",
				}),
			}),
		);

	afterAll(async () => {
		await db.execute(sql`delete from rate_limit where key = ${key}`);
	});

	it("틀린 비밀번호 로그인은 5회까지 401이고 6번째는 429이며 rate_limit 행이 생긴다", async () => {
		const statuses: number[] = [];
		for (let i = 0; i < 6; i += 1) statuses.push((await signIn()).status);
		expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
		const { rows } = await db.execute<{ count: number }>(
			sql`select count from rate_limit where key = ${key}`,
		);
		// 막힌 6번째는 세지 않는다(허용된 5회만 count)
		expect(rows.map((row) => Number(row.count))).toEqual([5]);
	});
});
