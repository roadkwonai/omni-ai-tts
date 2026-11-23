import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Session = { cookie: string; version: string };
type State = { current?: string; sessions: Record<string, Session> };

function directory(): string {
	const path =
		process.env.OMNI_TTS_CONFIG_DIR ?? join(homedir(), ".config", "omni-tts");
	mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (
		!stat.isDirectory() ||
		stat.isSymbolicLink() ||
		(stat.mode & 0o077) !== 0 ||
		stat.uid !== process.getuid?.()
	)
		throw new Error("세션 디렉터리 권한이 올바르지 않습니다.");
	return path;
}

export async function change<T>(fn: (state: State) => T): Promise<T> {
	if (process.platform !== "darwin" && process.platform !== "linux") {
		throw new Error("지원하지 않는 운영체제입니다.");
	}
	const dir = directory();
	const lock = join(dir, "lock");
	const fd = openSync(
		lock,
		constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
		0o600,
	);
	const stat = fstatSync(fd);
	if (
		!stat.isFile() ||
		(stat.mode & 0o077) !== 0 ||
		stat.uid !== process.getuid?.()
	) {
		closeSync(fd);
		throw new Error("잠금 파일 권한이 올바르지 않습니다.");
	}
	const child = spawn(
		process.platform === "darwin" ? "/usr/bin/lockf" : "/usr/bin/flock",
		[
			...(process.platform === "darwin"
				? ["-k", "-t", "2"]
				: ["-x", "-w", "2"]),
			"/dev/fd/3",
			"/bin/sh",
			"-c",
			"printf ready; exec /bin/cat >/dev/null",
		],
		{ stdio: ["pipe", "pipe", "ignore", fd] },
	);
	closeSync(fd);
	const exited = new Promise<void>((resolve) =>
		child.once("close", () => resolve()),
	);
	await new Promise<void>((resolve, reject) => {
		child.stdout?.once("data", () => resolve());
		child.once("error", reject);
		child.once("close", () =>
			reject(new Error("세션 잠금을 얻지 못했습니다.")),
		);
	});
	try {
		const path = join(dir, "sessions.json");
		let state: State = { sessions: {} };
		try {
			const stat = lstatSync(path);
			if (
				!stat.isFile() ||
				stat.isSymbolicLink() ||
				(stat.mode & 0o077) !== 0 ||
				stat.uid !== process.getuid?.()
			)
				throw new Error("세션 파일 권한이 올바르지 않습니다.");
			state = JSON.parse(readFileSync(path, "utf8")) as State;
			if (!state.sessions || typeof state.sessions !== "object")
				throw new Error("세션 파일이 올바르지 않습니다.");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const original = JSON.stringify(state);
		const result = fn(state);
		const serialized = JSON.stringify(state);
		if (serialized === original) return result;
		const temp = join(dir, `.${randomUUID()}.tmp`);
		try {
			writeFileSync(temp, serialized, { mode: 0o600, flag: "wx" });
			chmodSync(temp, 0o600);
			renameSync(temp, path);
		} finally {
			rmSync(temp, { force: true });
		}
		return result;
	} finally {
		child.stdin?.end();
		await exited;
	}
}
