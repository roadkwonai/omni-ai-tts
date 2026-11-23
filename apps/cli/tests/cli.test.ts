import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
