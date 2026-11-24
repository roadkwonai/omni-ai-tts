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
import type { Voice } from "@tts-pilot-app/api/providers/contract";

export type Session = { cookie: string; version: string };
type State = { current?: string; sessions: Record<string, Session> };
// 과금될 수 있는 요청의 로컬 기록(T18). 대본과 쿠키는 두지 않는다
export type RequestRecord = {
	origin: string;
	requestId: string;
	provider: string;
	createdAt: string;
	// 없으면 작업실(T18 기록)
	kind?: "trial" | "drama" | "clones";
};
export type Requests = { requests: Record<string, RequestRecord> };
// 검색에 나온 성우(T19). 담기·샘플·시험 생성이 REF로 찾는다
export type CachedVoice = { voice: Voice; savedAt: number };
export type Voices = { voices: Record<string, CachedVoice[]> };

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
		throw new Error(
			`${path}의 권한이 올바르지 않습니다. 본인 소유의 0700 폴더여야 합니다.`,
		);
	return path;
}

export const change = <T>(fn: (state: State) => T) =>
	changeFile("sessions", { sessions: {} } as State, fn);
export const changeRequests = <T>(fn: (state: Requests) => T) =>
	changeFile("requests", { requests: {} } as Requests, fn);
// 같은 잠금 아래에서 지금 세션도 본다(로그아웃과 겹친 늦은 쓰기를 버린다)
export const changeVoices = <T>(
	fn: (state: Voices, sessions: State["sessions"]) => T,
) =>
	changeFile("voices", { voices: {} } as Voices, (state, dir) =>
		fn(state, readState(dir, "sessions", { sessions: {} } as State).sessions),
	);

function readState<S extends object>(
	dir: string,
	name: keyof S & string,
	empty: S,
): S {
	const path = join(dir, `${name}.json`);
	try {
		const stat = lstatSync(path);
		if (
			!stat.isFile() ||
			stat.isSymbolicLink() ||
			(stat.mode & 0o077) !== 0 ||
			stat.uid !== process.getuid?.()
		)
			throw new Error(
				`${path}의 권한이 올바르지 않습니다. 본인 소유의 0600 일반 파일이어야 합니다.`,
			);
		const state = parsed(readFileSync(path, "utf8")) as S | null;
		if (!state?.[name] || typeof state[name] !== "object")
			throw new Error(`${path}의 형식이 올바르지 않습니다.`);
		return state;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return empty;
	}
}
// JSON.parse의 오류 글에는 파일 내용(쿠키)이 들어간다
function parsed(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// 한 잠금 아래에서 <name>.json을 읽고 바꾼다. fn은 동기라 네트워크를 기다리며 잠금을 잡지 않는다
async function changeFile<S extends object, T>(
	name: keyof S & string,
	empty: S,
	fn: (state: S, dir: string) => T,
): Promise<T> {
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
		throw new Error(
			`${lock}의 권한이 올바르지 않습니다. 본인 소유의 0600 일반 파일이어야 합니다.`,
		);
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
		const path = join(dir, `${name}.json`);
		const state = readState(dir, name, empty);
		const original = JSON.stringify(state);
		const result = fn(state, dir);
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
