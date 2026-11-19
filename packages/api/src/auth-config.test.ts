import { createAuth, redactAuthLogMessage } from "@tts-pilot-app/auth";
import { describe, expect, it } from "vitest";

import { testDb as db } from "./test-db";

// T15b-02: Better Auth 쪽(비밀번호 설정·변경 경로) 비밀번호 길이를 계정 생성 스크립트(owner-setup passwordProblem 12~128자)와 맞춘다.
describe("Better Auth 비밀번호 길이", () => {
	const auth = createAuth(
		{
			BETTER_AUTH_URL: "http://127.0.0.1:3002",
			BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
		},
		db,
	);

	it("최소 12자, 최대 128자다", () => {
		expect(auth.options.emailAndPassword).toMatchObject({
			minPasswordLength: 12,
			maxPasswordLength: 128,
		});
	});
});

// T14-03: better-auth는 column/relation/table 오류에서 Drizzle 'Failed query … params: …'를 메시지로 넘긴다. params(세션 토큰 등)는 로그에 남기지 않는다.
describe("redactAuthLogMessage", () => {
	it("params: 뒤를 지운다", () => {
		expect(
			redactAuthLogMessage(
				'Failed query: select "id" from "session" where "token" = $1\nparams: secret-session-token',
			),
		).toBe(
			'Failed query: select "id" from "session" where "token" = $1\n(params 생략)',
		);
	});

	it("대소문자가 달라도 Params: 뒤를 지운다", () => {
		expect(redactAuthLogMessage("Failed query: x\nParams: secret")).toBe(
			"Failed query: x\n(params 생략)",
		);
	});

	it("params가 없는 문자열은 그대로 둔다", () => {
		expect(redactAuthLogMessage("relation does not exist")).toBe(
			"relation does not exist",
		);
	});

	it("문자열이 아니면 오류 객체를 찍지 않는다", () => {
		expect(redactAuthLogMessage(new Error("params: x"))).toBe(
			"(오류 객체 생략)",
		);
	});
});
