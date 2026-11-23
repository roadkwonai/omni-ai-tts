import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	accessSync,
	constants,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import config from "../rolldown.config.js";
import { cli, studioWorld, workspace } from "./harness.js";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const hashOf = () =>
	createHash("sha256").update(readFileSync(cli)).digest("hex");

// 설정 그대로 메모리에 묶어 묶음에 든 모듈을 본다(dist는 건드리지 않는다)
const modulesOf = async () => {
	const build = await rolldown(config);
	const { output } = await build.generate(config.output);
	await build.close();
	const [chunk, ...rest] = output;
	expect(rest).toEqual([]);
	return { modules: chunk.moduleIds, imports: chunk.imports, code: chunk.code };
};

describe("묶음 빌드", { timeout: 120_000 }, () => {
	it("dist에는 실행 파일 하나만 있고 shebang과 실행 권한이 있다", () => {
		expect(readdirSync("dist")).toEqual(["cli.js"]);
		expect(readFileSync(cli, "utf8").split("\n")[0]).toBe(
			"#!/usr/bin/env node",
		);
		expect(() => accessSync(cli, constants.X_OK)).not.toThrow();
		expect(statSync(cli).mode & 0o111).toBe(0o111);
	});

	it("설치 의존이 없고 Node 내장 모듈만 불러온다", async () => {
		expect(manifest.dependencies).toBeUndefined();
		const { imports, code } = await modulesOf();
		expect(imports.filter((name) => !isBuiltin(name))).toEqual([]);
		expect(code).toBe(readFileSync(cli, "utf8"));
	});

	it("서버 모듈과 공급자 SDK가 묶음에 없다", async () => {
		const { modules } = await modulesOf();
		expect(modules.length).toBeGreaterThan(15);
		const banned =
			/drizzle|node_modules\/(?:\.pnpm\/)?pg[@/]|better-auth|@orpc\/server|@orpc\+server|elevenlabs-js|typecast-js|packages\/(?:db|auth)\/|packages\/api\/src\/(?:routers\/|trial\.ts|context\.ts|index\.ts|owner|voice-cache|providers\/(?:typecast|elevenlabs|fish-audio|airy|gemini|openai|index)\.ts)/;
		expect(modules.filter((id) => banned.test(id))).toEqual([]);
	});

	it("타입 검사는 dist를 바꾸지 않는다", () => {
		const before = hashOf();
		execFileSync("pnpm", ["run", "check-types"], { stdio: "pipe" });
		expect(hashOf()).toBe(before);
		expect(readdirSync("dist")).toEqual(["cli.js"]);
		// turbo가 옛 dist를 캐시에 담았다 되살리지 않는다
		const turbo = JSON.parse(readFileSync("../../turbo.json", "utf8"));
		expect(turbo.tasks["@tts-pilot-app/cli#check-types"]).toEqual({
			dependsOn: ["^check-types"],
			outputs: [],
		});
	});

	it("pnpm pack한 파일을 저장소 밖에 설치한 명령이 동작한다", async () => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), "omni-t20-pack-")));
		const w = studioWorld();
		const server = await w.serve();
		const ws = workspace(server.origin);
		try {
			execFileSync("pnpm", ["pack", "--pack-destination", dir], {
				stdio: "pipe",
			});
			const [tarball = ""] = readdirSync(dir);
			writeFileSync(join(dir, "package.json"), '{"private":true}');
			execFileSync(
				"npm",
				["install", "--offline", "--no-audit", "--no-fund", `./${tarball}`],
				{ cwd: dir, stdio: "pipe" },
			);
			// 의존 0: 설치된 것은 이 패키지 하나다
			expect(
				readdirSync(join(dir, "node_modules")).filter(
					(name) => !name.startsWith("."),
				),
			).toEqual(["@tts-pilot-app"]);
			const bin = join(dir, "node_modules/.bin/omni-tts");
			const help = spawnSync(bin, ["--help"], { cwd: dir, encoding: "utf8" });
			expect(help.status).toBe(0);
			for (const command of [
				...["studio generate", "studio plan", "studio batch", "studio join"],
				...["studio autotag", "numbers check", "numbers apply"],
				...["drama generate", "drama list", "drama download", "drama resume"],
				...["drama split", "drama remove", "drama read", "drama autotag"],
			])
				expect(help.stdout).toContain(`omni-tts ${command}`);
			const { spawn } = await import("node:child_process");
			const run = (...args: string[]) =>
				new Promise<{ code: number | null; out: string }>((done) => {
					const child = spawn(bin, args, {
						cwd: dir,
						env: { ...process.env, OMNI_TTS_CONFIG_DIR: ws.dir },
					});
					let text = "";
					child.stdout.on("data", (chunk) => {
						text += chunk;
					});
					child.on("close", (code) => done({ code, out: text }));
				});
			const out = await run(
				...["studio", "generate", "--voice", "typecast:v1", "--yes"],
				...["--input", ws.script("설치본"), "--json"],
				...["--out", ws.path("a.mp3")],
			);
			expect(out.code).toBe(0);
			expect(JSON.parse(out.out).source).toBe("created");
			expect(readFileSync(ws.path("a.mp3"))).toEqual(w.audio);
			expect(w.synth).toBe(1);
			// 설치한 명령의 드라마: 만들기 → 나누기, 읽기, 자동 태그
			const script = {
				version: 1,
				speakers: [{ name: "가", voice: "fish_audio:fish" }],
				lines: [{ speaker: 0, direction: "", text: "설치본" }],
				model: "s2.1-pro",
			};
			const input = ws.script(JSON.stringify(script), "scene.json");
			mkdirSync(ws.path("lines"));
			const scene = await run(
				...["drama", "generate", "--input", input, "--yes", "--json"],
				...["--out", ws.path("scene.wav")],
			);
			expect(scene.code).toBe(0);
			const [take] = w.takes;
			if (!take) throw new Error("테이크가 없다");
			expect(readFileSync(ws.path("scene.wav"))).toEqual(take.audio);
			take.segments = [{ start: 0, end: 0.05, cutStart: 0, cutEnd: 0.05 }];
			const split = await run(
				...["drama", "split", take.id, "--out-dir", ws.path("lines")],
			);
			expect(split.code).toBe(0);
			expect(readFileSync(ws.path("lines/001-가.wav"))).toEqual(take.audio);
			const read = await run(
				...["drama", "read", "--input", input, "--yes", "--json"],
				...["--out-dir", ws.path("lines")],
			);
			expect(read.code).toBe(0);
			expect(readFileSync(ws.path("lines/001.mp3"))).toEqual(w.audio);
			const tagged = await run(
				...["drama", "autotag", "--input", input, "--yes", "--json"],
				...["--out", ws.path("tagged.json")],
			);
			expect(tagged.code).toBe(0);
			expect(
				JSON.parse(readFileSync(ws.path("tagged.json"), "utf8")).lines,
			).toEqual([{ speaker: 0, direction: "", text: "[laughs] 설치본" }]);
			expect((await run("drama", "list")).code).toBe(0);
			expect((await run("drama", "remove", take.id, "--yes")).code).toBe(0);
			expect(resolve(bin).startsWith(resolve("."))).toBe(false);
		} finally {
			server.close();
			ws.remove();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
