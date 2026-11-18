import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@tts-pilot-app/db";
import * as schema from "@tts-pilot-app/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.BETTER_AUTH_URL],
		// 공개 가입은 서버에서 막는다(T14). 계정은 로컬 스크립트로만 만든다.
		emailAndPassword: { enabled: true, disableSignUp: true },
		// 로그인 60초 5회(사용자 결정 2026-11-18). DB에 두어 인스턴스가 여럿이어도 같은 횟수다. 키는 basePath를 뗀 경로이고, 나머지는 라이브러리 기본
		rateLimit: {
			enabled: true,
			storage: "database",
			customRules: { "/sign-in/email": { window: 60, max: 5 } },
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [nextCookies()],
		// 원시 오류 객체(Drizzle 'Failed query … params'에 세션 토큰이 들어감)는 찍지 않는다. 문자열 메시지만 남긴다.
		logger: {
			log: (level, message) =>
				console[level === "error" ? "error" : "warn"](
					`[better-auth] ${level}`,
					typeof message === "string" ? message : "(오류 객체 생략)",
				),
		},
	});
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
