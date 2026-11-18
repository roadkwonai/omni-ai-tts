import { createAuth } from "@tts-pilot-app/auth";
import { user } from "@tts-pilot-app/db/schema/auth";
import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { testDb as db, testDatabaseUrl as url } from "./test-db";

// T14: 공개 가입은 서버에서 막힌다(disableSignUp). HTTP와 서버 호출이 같은 핸들러를 지난다.
describe.skipIf(!url)("가입 막기(테스트 DB)", () => {
	const email = "signup-blocked@example.test";
	const auth = createAuth(
		{
			BETTER_AUTH_URL: "http://127.0.0.1:3002",
			BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
		},
		db,
	);

	afterAll(async () => {
		await db.delete(user).where(eq(user.email, email));
	});

	it("signUpEmail은 EMAIL_PASSWORD_SIGN_UP_DISABLED로 거부되고 user 행이 늘지 않는다", async () => {
		const [before] = await db.select({ n: count() }).from(user);
		await expect(
			auth.api.signUpEmail({
				body: { email, password: "long-enough-password-123", name: "x" },
			}),
		).rejects.toMatchObject({
			body: { code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" },
		});
		const [after] = await db.select({ n: count() }).from(user);
		expect(after?.n).toBe(before?.n);
	});
});
