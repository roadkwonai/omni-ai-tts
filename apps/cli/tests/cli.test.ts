import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	COOKIE,
	type serve,
	spawnTty,
	studioWorld,
	until,
	workspace,
} from "./harness.js";

const cli = resolve("dist/cli.js");
describe("설치된 CLI", () => {
	it("도움말에 보관함 명령을 안내한다", () => {
		const result = spawnSync(process.execPath, [cli, "--help"], {
			cwd: "/tmp",
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("voices list");
	});
	it("도움말을 읽는 쪽이 먼저 닫아도 오류 없이 0이다", () => {
		const result = spawnSync(
			"/bin/bash",
			[
				"-c",
				`"$0" "$1" --help | true; echo "\${PIPESTATUS[0]}"`,
				...[process.execPath, cli],
			],
			{ cwd: "/tmp", encoding: "utf8" },
		);
		expect([result.stdout, result.stderr]).toEqual(["0\n", ""]);
	});
	it("지원하지 않는 공급자를 JSON 오류로 거절한다", () => {
		const result = spawnSync(
			process.execPath,
			[cli, "voices", "list", "--provider", "invalid", "--json"],
			{ cwd: "/tmp", encoding: "utf8" },
		);
		expect(result.status).toBe(2);
		expect(JSON.parse(result.stdout).code).toBe("INPUT");
	});
	it("목록의 표시와 JSON 필터가 같은 보관함을 읽는다", async () => {
		const voice = {
			voice: { name: "테스트", provider: "typecast", voiceId: "v1" },
			favorite: true,
			frequent: true,
			unavailable: false,
			channelIds: ["channel-id"],
			classificationIds: ["class-id"],
			useCount: 3,
			lastUsedAt: "2026-01-01T00:00:00Z",
		};
		const server = createServer((request, response) => {
			response.setHeader("content-type", "application/json");
			if (request.url?.includes("get-session"))
				response.end(JSON.stringify({ session: {}, user: {} }));
			else response.end(JSON.stringify({ json: [voice] }));
		});
		await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("listen failed");
		const origin = `http://127.0.0.1:${address.port}`;
		const dir = mkdtempSync(join(tmpdir(), "omni-cli-test-"));
		writeFileSync(
			join(dir, "sessions.json"),
			JSON.stringify({
				current: origin,
				sessions: { [origin]: { cookie: "session=fixture", version: "v1" } },
			}),
			{ mode: 0o600 },
		);
		const run = (args: string[]) =>
			new Promise<{ code: number | null; out: string }>((done) => {
				const child = spawn(process.execPath, [cli, ...args], {
					cwd: "/tmp",
					env: { ...process.env, OMNI_TTS_CONFIG_DIR: dir },
				});
				let out = "";
				child.stdout.on("data", (chunk) => {
					out += chunk;
				});
				child.on("close", (code) => done({ code, out }));
			});
		try {
			const display = await run(["voices", "list", "--favorite"]);
			expect(display.code).toBe(0);
			expect(display.out).toContain("class-id");
			expect(display.out).toContain("2026-01-01");
			const json = await run([
				"voices",
				"list",
				"--provider",
				"typecast",
				"--json",
			]);
			expect(json.code).toBe(0);
			expect(JSON.parse(json.out).voices[0].ref).toBe("typecast:v1");
			const empty = await run([
				"voices",
				"list",
				"--provider",
				"airy",
				"--json",
			]);
			expect(JSON.parse(empty.out).voices).toEqual([]);
		} finally {
			server.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("터미널 로그인", { timeout: 60_000 }, () => {
	let status = 401;
	const sent: unknown[] = [];
	let server: Awaited<ReturnType<typeof serve>>;
	beforeAll(async () => {
		const w = studioWorld();
		w.hook = (path, request, response) => {
			if (!path.includes("sign-in/email")) return false;
			let body = "";
			request.on("data", (chunk) => {
				body += chunk;
			});
			request.on("end", () => {
				sent.push(JSON.parse(body));
				response.writeHead(status, {
					"content-type": "application/json",
					...(status === 429 ? { "x-retry-after": "42" } : {}),
					...(status === 200 ? { "set-cookie": `${COOKIE}; Path=/` } : {}),
				});
				response.end("{}");
			});
			return true;
		};
		server = await w.serve();
	});
	afterAll(() => server.close());
	const login = async (code: number, email: string, ...keys: string[]) => {
		status = code;
		const ws = workspace(server.origin);
		try {
			const tty = spawnTty(ws.dir, ["auth", "login", "--url", server.origin]);
			await until(() => tty.seen().includes("이메일"), "이메일");
			tty.write(`${email}\r`);
			await until(() => tty.seen().includes("비밀번호"), "비밀번호");
			for (const key of keys) {
				tty.write(key);
				await new Promise((done) => setTimeout(done, 50));
			}
			tty.write("\r");
			const result = await tty.done;
			return { ...result, after: result.out.split("비밀번호: ")[1] ?? "" };
		} finally {
			ws.remove();
		}
	};

	it("틀린 이메일·비밀번호와 로그인 제한을 다른 글로 알린다", async () => {
		const wrong = await login(401, "me@x.y", "wrong");
		expect([wrong.code, wrong.after]).toEqual([
			3,
			expect.stringContaining("비밀번호"),
		]);
		const limited = await login(429, "me@x.y", "wrong");
		expect([limited.code, limited.after]).toEqual([
			5,
			expect.stringContaining("42초"),
		]);
	});
	it("화살표 같은 제어 시퀀스는 이메일과 비밀번호에 넣지 않는다", async () => {
		const result = await login(
			...[200, "me\u001b[A@x.y", "a\u001b[Db"],
			...["\u001b[3~c", "\u001bOHd", "\u001b", "[Ce"],
		);
		expect([result.code, sent.at(-1)]).toEqual([
			0,
			{ email: "me@x.y", password: "abcde" },
		]);
	});
});
