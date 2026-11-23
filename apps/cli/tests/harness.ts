import { type ChildProcess, spawn } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type AnyRouter, ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import {
	comboSignature,
	STUDIO_PART_BYTES,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";

export const cli = resolve("dist/cli.js");
export const COOKIE = "session=fixture-cookie";
export const USER = "user-1";

export type Run = { code: number | null; out: string; err: string };
export type Started = {
	child: ChildProcess;
	done: Promise<Run>;
	seen: () => string;
};

// 실패한 테스트가 프롬프트에 선 프로세스를 남기지 않게 끝에서 모두 끝낸다
const running = new Set<() => void>();
function track(child: ChildProcess, group = false) {
	const kill = () => {
		try {
			if (group && child.pid) process.kill(-child.pid, "SIGKILL");
			else child.kill("SIGKILL");
		} catch {
			/* 이미 끝났다 */
		}
	};
	running.add(kill);
	child.once("close", () => running.delete(kill));
}

export function spawnCli(
	dir: string,
	args: string[],
	input?: string | Buffer,
	now?: string,
): Started {
	const child = spawn(
		process.execPath,
		[
			// 시계만 바꾼다(제품 코드에는 테스트용 길이 없다)
			...(now
				? [
						`--import=data:text/javascript,Date.now=()=>${Date.parse(now).toString()}`,
					]
				: []),
			cli,
			...args,
		],
		{ cwd: tmpdir(), env: { ...process.env, OMNI_TTS_CONFIG_DIR: dir } },
	);
	track(child);
	let out = "";
	let err = "";
	child.stdout.on("data", (chunk) => {
		out += chunk;
	});
	child.stderr.on("data", (chunk) => {
		err += chunk;
	});
	child.stdin.on("error", () => {});
	child.stdin.end(input ?? "");
	return {
		child,
		seen: () => out + err,
		done: new Promise((done) =>
			child.on("close", (code) => done({ code, out, err })),
		),
	};
}

// 진짜 TTY에서 실행한다(macOS script). Node의 파이프는 소켓이라 cat을 거쳐 진짜 파이프로 준다
export function spawnTty(dir: string, args: string[]) {
	const child = spawn(
		"/bin/sh",
		[
			"-c",
			'cat | { /usr/bin/script -q /dev/null "$@"; printf "EXIT:%s\\n" "$?"; }',
			"sh",
			process.execPath,
			cli,
			...args,
		],
		{
			cwd: tmpdir(),
			env: { ...process.env, OMNI_TTS_CONFIG_DIR: dir },
			detached: true,
		},
	);
	track(child, true);
	let text = "";
	child.stdin.on("error", () => {});
	child.stdout.on("data", (chunk) => {
		text += chunk;
		if (/EXIT:\d+/.test(text)) child.stdin.end();
	});
	child.stderr.on("data", (chunk) => {
		text += chunk;
	});
	return {
		seen: () => text,
		write: (value: string) => child.stdin.write(value),
		done: new Promise<Run>((done) =>
			child.on("close", () =>
				done({
					code: Number(/EXIT:(\d+)/.exec(text)?.[1] ?? -1),
					out: text,
					err: text,
				}),
			),
		),
	};
}

export async function until(check: () => boolean, what: string, ms = 20_000) {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error(`기다리다 끝남: ${what}`);
		await new Promise((done) => setTimeout(done, 15));
	}
}

// 임시 설정 폴더(0700)와 세션, 결과 파일을 받을 폴더
export function workspace(origin: string) {
	const dir = mkdtempSync(join(tmpdir(), "omni-t18-"));
	const files = mkdtempSync(join(tmpdir(), "omni-t18-out-"));
	writeFileSync(
		join(dir, "sessions.json"),
		JSON.stringify({
			current: origin,
			sessions: { [origin]: { cookie: COOKIE, version: "v1" } },
		}),
		{ mode: 0o600 },
	);
	const requestsPath = join(dir, "requests.json");
	return {
		dir,
		files,
		requestsPath,
		path: (name: string) => join(files, name),
		script: (text: string | Buffer, name = "script.txt") => {
			writeFileSync(join(files, name), text);
			return join(files, name);
		},
		// 남은 요청 기록
		records: (): {
			origin: string;
			requestId: string;
			provider: string;
			createdAt: string;
		}[] =>
			existsSync(requestsPath)
				? Object.values(JSON.parse(readFileSync(requestsPath, "utf8")).requests)
				: [],
		leftovers: () => readdirSync(files).filter((name) => name.endsWith(".tmp")),
		remove: () => {
			for (const kill of running) kill();
			rmSync(dir, { recursive: true, force: true });
			rmSync(files, { recursive: true, force: true });
		},
	};
}

export type ServeHook = (
	path: string,
	request: IncomingMessage,
	response: ServerResponse,
) => boolean;
// 라우터를 실제 oRPC 처리기로 띄운다. get-session만 흉내 낸다
export async function serve(
	router: AnyRouter,
	options: {
		context?: (cookie: string) => object;
		user?: (cookie: string) => object | null;
		hook?: ServeHook;
	} = {},
) {
	const handler = new RPCHandler(router, {
		plugins: [new SimpleCsrfProtectionHandlerPlugin()],
	});
	const server = createServer(async (request, response) => {
		const path = request.url ?? "";
		const cookie = request.headers.cookie ?? "";
		if (path.startsWith("/api/auth/get-session")) {
			const user = options.user
				? options.user(cookie)
				: cookie === COOKIE
					? { id: USER }
					: null;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify(user ? { session: {}, user } : null));
			return;
		}
		if (options.hook?.(path, request, response)) return;
		const { matched } = await handler.handle(request, response, {
			prefix: "/api/rpc",
			context: options.context?.(cookie) ?? {},
		} as never);
		if (!matched) {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("listen failed");
	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () => {
			server.closeAllConnections();
			server.close();
		},
	};
}

export const bytesOf = (size: number) =>
	Buffer.from(Uint8Array.from({ length: size }, (_, i) => (i * 7 + 3) % 251));

type Row = {
	id: string;
	requestId: string;
	status: "pending" | "done" | "failed" | "unknown";
	reason: string | null;
	createdAt: string;
	usage: { unit: string; amount: number };
	combo: string;
	audio: Buffer;
	audioType: string;
};
export const voiceOf = (provider: string, voiceId: string, over = {}) => ({
	provider,
	voiceId,
	name: `성우 ${voiceId}`,
	models: [],
	...over,
});
const saved = (voice: object, unavailable = false) => ({
	voice,
	unavailable,
	favorite: false,
	frequent: false,
	channelIds: [],
	classificationIds: [],
	useCount: 0,
	lastUsedAt: null,
});

// biome-ignore lint/suspicious/noExplicitAny: 프로시저마다 입력 모양이 다르다
type Any = any;
// 작업실 서버를 흉내 낸 상태. on으로 프로시저를, hook으로 HTTP를 바꾼다
export function studioWorld() {
	const w = {
		synth: 0,
		calls: [] as string[],
		created: [] as { requestId: string; request: TrialRequest }[],
		rows: [] as Row[],
		audio: bytesOf(1234),
		hook: undefined as ServeHook | undefined,
		user: undefined as ((cookie: string) => object | null) | undefined,
		on: {} as Record<string, (input: Any, next: () => Any) => Any>,
		voices: [
			saved(voiceOf("typecast", "v1")),
			saved(voiceOf("typecast", "gone"), true),
			saved(voiceOf("gemini", "Kore")),
			saved(voiceOf("fish_audio", "fish")),
			saved(voiceOf("elevenlabs", "el")),
		] as object[],
		presets: [] as object[],
		add(request: TrialRequest, over: Partial<Row> = {}) {
			const row: Row = {
				id: crypto.randomUUID(),
				requestId: crypto.randomUUID(),
				status: "done",
				reason: null,
				createdAt: new Date().toISOString(),
				usage: { unit: "credit", amount: 5 },
				combo: comboSignature(request),
				audio: w.audio,
				audioType: request.provider === "gemini" ? "audio/wav" : "audio/mpeg",
				...over,
			};
			w.rows.push(row);
			return row;
		},
	};
	const out = (row: Row) => ({
		id: row.id,
		createdAt: row.createdAt,
		usage: row.usage,
		bytes: row.audio.byteLength,
	});
	const proc = (name: string, fn: (input: Any) => Any) =>
		os.handler(async ({ input }) => {
			w.calls.push(name);
			const hook = w.on[name];
			return hook ? hook(input, () => fn(input)) : fn(input);
		});
	const done = (id: string) => {
		const row = w.rows.find((item) => item.id === id && item.status === "done");
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	};
	const router = {
		savedVoiceList: proc("savedVoiceList", () => w.voices),
		channelList: proc("channelList", () => []),
		presetList: proc("presetList", () => w.presets),
		trialModels: proc("trialModels", () => ({
			rates: [{ model: "eleven_v4", multiplier: 1.5 }],
		})),
		studioFindMany: proc("studioFindMany", (input) =>
			input.map((request: TrialRequest) => {
				const rows = w.rows.filter(
					(row) => row.combo === comboSignature(request),
				);
				const row =
					rows.find((item) => item.status === "done") ??
					rows.find((item) => item.status === "unknown");
				return row ? { ...out(row), status: row.status } : null;
			}),
		),
		studioCreate: proc("studioCreate", (input) => {
			w.created.push(input);
			w.synth += 1;
			return out(w.add(input.request, { requestId: input.requestId }));
		}),
		studioRequest: proc("studioRequest", (input) => {
			const row = w.rows.find((item) => item.requestId === input.requestId);
			return row
				? { ...out(row), status: row.status, reason: row.reason }
				: null;
		}),
		studioInfo: proc("studioInfo", (input) => {
			const row = done(input.id);
			return { ...out(row), audioType: row.audioType };
		}),
		studioAudio: proc("studioAudio", (input) => {
			const row = done(input.id);
			const part = row.audio.subarray(
				input.part * STUDIO_PART_BYTES,
				(input.part + 1) * STUDIO_PART_BYTES,
			);
			return new File([new Uint8Array(part)], "a", { type: row.audioType });
		}),
	};
	return Object.assign(w, {
		serve: () =>
			serve(router, {
				hook: (...args) => w.hook?.(...args) ?? false,
				user: (cookie) =>
					w.user ? w.user(cookie) : cookie === COOKIE ? { id: USER } : null,
			}),
	});
}
