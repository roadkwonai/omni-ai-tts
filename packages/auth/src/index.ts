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
		// 공개 가입은 서버에서 막는다(T14). 계정은 로컬 스크립트로만 만든다. 길이는 그 스크립트(owner-setup passwordProblem)와 같다.
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: 12,
			maxPasswordLength: 128,
		},
		// 로그인 60초 5회(사용자 결정 2026-11-18). DB에 두어 인스턴스가 여럿이어도 같은 횟수다. 키는 basePath를 뗀 경로이고, 나머지는 라이브러리 기본
		rateLimit: {
			enabled: true,
			storage: "database",
			customRules: { "/sign-in/email": { window: 60, max: 5 } },
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [nextCookies()],
		logger: {
			log: (level, message) =>
				console[level === "error" ? "error" : "warn"](
					`[better-auth] ${level}`,
					redactAuthLogMessage(message),
				),
		},
	});
}

// 원시 오류 객체는 찍지 않는다. better-auth는 column/relation/table 오류에서 Drizzle 'Failed query … params: …' 문자열을
// 메시지로 넘기므로(1.7.5 api onError) params(세션 토큰 등) 앞까지만 남긴다.
export function redactAuthLogMessage(message: unknown): string {
	if (typeof message !== "string") return "(오류 객체 생략)";
	// toLowerCase()는 일부 문자(İ 등)의 길이를 바꿔 원문 인덱스와 어긋나므로 원문에서 대소문자 무시로 찾는다.
	const at = message.search(/params:/i);
	return at === -1 ? message : `${message.slice(0, at)}(params 생략)`;
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
