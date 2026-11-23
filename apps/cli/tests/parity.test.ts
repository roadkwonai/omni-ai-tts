import { readdirSync, readFileSync } from "node:fs";
import { appRouter } from "@tts-pilot-app/api/routers/index";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 서버의 모든 프로시저를 CLI가 부르는지 본다. 부르지 않는 것은 이유를 적는다
const EXCEPTIONS: Record<string, string> = {
	healthCheck: "배포 확인용 공개 조회다. 명령으로 낼 기능이 없다",
	studioFind: "studioFindMany가 한 건 조회까지 대신한다",
	trialFind: "trialFindMany가 한 건 조회까지 대신한다",
};

// `.이름(` 꼴로 부른 이름만 모은다. 구문 나무라 주석·글자열·타입 참조·구조 분해는 세지 않는다
function calledIn(source: string): Set<string> {
	const called = new Set<string>();
	const visit = (node: ts.Node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression)
		)
			called.add(node.expression.name.text);
		ts.forEachChild(node, visit);
	};
	visit(ts.createSourceFile("a.ts", source, ts.ScriptTarget.Latest));
	return called;
}
const problems = (
	procedures: readonly string[],
	called: ReadonlySet<string>,
	exceptions: Record<string, string>,
) => [
	...procedures
		.filter((name) => !called.has(name) && !Object.hasOwn(exceptions, name))
		.map((name) => `부르지 않음: ${name}`),
	...Object.entries(exceptions).flatMap(([name, why]) => [
		...(procedures.includes(name) ? [] : [`없는 예외: ${name}`]),
		...(called.has(name) ? [`이미 부르는 예외: ${name}`] : []),
		...(why.trim() ? [] : [`이유 없는 예외: ${name}`]),
	]),
];
const source = readdirSync("src")
	.filter((name) => name.endsWith(".ts"))
	.map((name) => readFileSync(`src/${name}`, "utf8"))
	.join("\n");

describe("기능 대조", () => {
	it("서버의 모든 프로시저를 CLI가 부르거나 이유가 적힌 예외다", () => {
		const procedures = Object.keys(appRouter);
		expect(procedures.length).toBeGreaterThan(55);
		expect(problems(procedures, calledIn(source), EXCEPTIONS)).toEqual([]);
	});

	it("부른 것만 센다: 주석·글자열·타입·구조 분해·넘긴 이름은 아니다", () => {
		const called = calledIn(`
			// client.inComment()
			/* client.inBlock() */
			const text = "client.inText()";
			const url = "https://a.example"; client.afterUrl();
			type A = ReturnType<Connection["client"]["inType"]>;
			type B = Awaited<ReturnType<typeof client.inTypeof>>;
			const { destructured } = client;
			destructured();
			pass(client.passed);
			client.called({});
			connection.client
				.chained({ id })
				.catch(fail);
			client.optional?.();
		`);
		for (const name of ["afterUrl", "called", "chained", "optional"])
			expect([name, called.has(name)]).toEqual([name, true]);
		for (const name of [
			...["inComment", "inBlock", "inText", "inType", "inTypeof"],
			...["destructured", "passed"],
		])
			expect([name, called.has(name)]).toEqual([name, false]);
	});

	it("빠진 프로시저와 낡은 예외를 알린다", () => {
		const called = new Set(["a", "b"]);
		expect(problems(["a", "c"], called, {})).toEqual(["부르지 않음: c"]);
		expect(problems(["a"], called, { gone: "없어짐" })).toEqual([
			"없는 예외: gone",
		]);
		expect(problems(["a", "b"], called, { b: "이유" })).toEqual([
			"이미 부르는 예외: b",
		]);
		expect(problems(["a", "c"], called, { c: " " })).toEqual([
			"이유 없는 예외: c",
		]);
		expect(problems(["a", "c"], called, { c: "이유" })).toEqual([]);
	});

	it("지금 예외를 빼면 실패한다", () => {
		for (const name of Object.keys(EXCEPTIONS)) {
			const { [name]: _, ...rest } = EXCEPTIONS;
			expect(problems(Object.keys(appRouter), calledIn(source), rest)).toEqual([
				`부르지 않음: ${name}`,
			]);
		}
	});
});
