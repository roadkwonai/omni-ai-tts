import { type ChildProcess, execFileSync, spawn } from "node:child_process";
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
import { dramaRequestSchema } from "@tts-pilot-app/api/drama-contract";
import {
	type DramaRequest,
	type LineSpan,
	wavHeader,
	wavOf,
} from "@tts-pilot-app/api/drama-script";
import { CLONE_SAMPLE_RATE } from "@tts-pilot-app/api/my-voice-contract";
import { emptyVoice } from "@tts-pilot-app/api/providers/list";
import {
	comboSignature,
	STUDIO_PART_BYTES,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";

export const cli = resolve("dist/cli.js");
// 소리를 만들고 결합을 실제로 돌릴 ffmpeg. 없으면 그 테스트 파일이 실패한다
export const ffmpegPath = () =>
	execFileSync("/bin/sh", ["-c", "command -v ffmpeg"], {
		encoding: "utf8",
	}).trim();
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
	preload?: string,
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
			...(preload
				? [`--import=data:text/javascript,${encodeURIComponent(preload)}`]
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
		voicesPath: join(dir, "voices.json"),
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
			kind?: string;
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

// 클론 원본: 24kHz 모노 16비트. amp는 모든 샘플의 값, size는 뒤를 채워 맞출 파일 크기다
export function cloneWav(
	samples: number,
	{
		amp = 8000,
		rate = CLONE_SAMPLE_RATE,
		size = 0,
	}: { amp?: number; rate?: number; size?: number } = {},
) {
	const sample = Buffer.alloc(2);
	sample.writeInt16LE(amp);
	const bytes = 44 + samples * 2;
	return Buffer.concat([
		wavHeader(samples * 2, rate),
		Buffer.alloc(samples * 2, sample),
		Buffer.alloc(Math.max(0, size - bytes)),
	]);
}

// 같은 소리를 확장형 머리(태그 0xFFFE, fmt 40바이트)로 싼 파일. sub는 하위 형식(1 PCM, 3 실수)이다
export function extensible(wav: Buffer, sub = 1) {
	const head = Buffer.alloc(68);
	wav.copy(head, 0, 0, 36);
	head.writeUInt32LE(wav.length + 24 - 8, 4);
	head.writeUInt32LE(40, 16);
	head.writeUInt16LE(0xfffe, 20);
	head.writeUInt16LE(22, 36);
	head.writeUInt16LE(16, 38);
	head.writeUInt32LE(4, 40);
	Buffer.from("0000000000001000800000aa00389b71", "hex").copy(head, 44);
	head.writeUInt16LE(sub, 44);
	wav.copy(head, 60, 36, 44);
	return Buffer.concat([head, wav.subarray(44)]);
}
export const META = "SECRET-META";
// 같은 소리에 부가 정보를 더한 파일: 앞의 LIST 조각(홀수 길이)과 data 뒤의 조각·남은 바이트
export function withMeta(wav: Buffer) {
	const chunk = (name: string) => {
		const body = Buffer.from(`INFOINAM${META}\0\0`);
		const head = Buffer.alloc(8);
		head.write(name);
		head.writeUInt32LE(body.length, 4);
		return Buffer.concat([head, body, Buffer.alloc(body.length % 2)]);
	};
	return Buffer.concat([
		...[wav.subarray(0, 36), chunk("LIST"), wav.subarray(36)],
		...[chunk("id3 "), Buffer.from(META)],
	]);
}

type Row = {
	kind: "studio" | "trial";
	request: TrialRequest;
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
export const saved = (voice: object, unavailable = false) => ({
	voice,
	unavailable,
	favorite: false,
	frequent: false,
	channelIds: [],
	classificationIds: [],
	useCount: 0,
	lastUsedAt: null,
});

type Take = Omit<Row, "kind" | "request" | "combo" | "audioType"> & {
	request: DramaRequest;
	segments: LineSpan[] | null;
};

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
		channels: [] as object[],
		classes: [] as object[],
		scripts: [] as { id: string; work: object }[],
		// 최근 대본에 남긴 것과 자동 태그로 받은 입력
		recent: [] as { workId: string; channelId: string | null; work: object }[],
		tagged: [] as { paragraphs: { text: string; direction: string }[] }[],
		// 드라마 테이크와 자동 태그로 받은 입력
		takes: [] as Take[],
		scenes: [] as { requestId: string; request: DramaRequest }[],
		dramaTagged: [] as Any[],
		// 내 보이스(requestId는 응답에 없다)와 만들기로 받은 입력
		clones: [] as Any[],
		cloned: [] as Any[],
		cloneProviders: { fish_audio: true, gemini: true },
		// 만들기가 남기는 줄의 값
		cloneMade: {} as object,
		clone(over: object = {}) {
			const row: Any = {
				requestId: crypto.randomUUID(),
				id: crypto.randomUUID(),
				provider: "fish_audio",
				name: "내 목소리",
				status: "ready",
				reason: null,
				createdAt: new Date().toISOString(),
				savedVoiceId: null,
				presets: [],
				...over,
			};
			row.voice =
				row.status === "ready"
					? {
							...emptyVoice(row.provider, "account"),
							voiceId: `clone-${row.id}`,
							name: row.name,
						}
					: null;
			w.clones.unshift(row);
			return row;
		},
		take(request: DramaRequest, over: Partial<Take> = {}) {
			const take: Take = {
				request,
				id: crypto.randomUUID(),
				requestId: crypto.randomUUID(),
				status: "done",
				reason: null,
				createdAt: new Date().toISOString(),
				usage: { unit: "usd_micro", amount: 7 },
				audio: Buffer.from(wavOf(bytesOf(4410))),
				segments: null,
				...over,
			};
			w.takes.unshift(take);
			return take;
		},
		// 공급자 목록(voiceList)의 성우
		catalog: [] as { provider: string }[],
		// 시험 생성의 완료 저장이 실패하면 응답은 오고 행은 이 상태로 남는다
		trialStatus: "done" as Row["status"],
		add(request: TrialRequest, over: Partial<Row> = {}) {
			const row: Row = {
				kind: "studio",
				request,
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
	const sceneKey = (request: unknown) =>
		JSON.stringify(dramaRequestSchema.parse(request));
	const takeOut = ({
		id,
		createdAt,
		usage,
		audio,
		segments,
		status,
	}: Take) => ({
		id,
		createdAt,
		usage,
		bytes: status === "done" ? audio.byteLength : 0,
		segments,
		status,
	});
	const proc = (name: string, fn: (input: Any) => Any) =>
		os.handler(async ({ input }) => {
			w.calls.push(name);
			const hook = w.on[name];
			return hook ? hook(input, () => fn(input)) : fn(input);
		});
	const done = (id: string, kind: Row["kind"] = "studio") => {
		const row = w.rows.find(
			(item) => item.id === id && item.kind === kind && item.status === "done",
		);
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	};
	const statusOf = (kind: Row["kind"], requestId: string) => {
		const row = w.rows.find(
			(item) => item.kind === kind && item.requestId === requestId,
		);
		return row ? { ...out(row), status: row.status, reason: row.reason } : null;
	};
	const cloneOf = (id: string, status?: string) => {
		const row = w.clones.find(
			(item) => item.id === id && (!status || item.status === status),
		);
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	};
	const trialOut = (row: Row) => ({
		id: row.id,
		createdAt: row.createdAt,
		usage: row.usage,
		audio: new File([new Uint8Array(row.audio)], "a", { type: row.audioType }),
	});
	const router = {
		providerStatus: proc("providerStatus", ({ provider }) => ({
			provider,
			status: "connected",
			quota: null,
			providerCode: null,
			retryAfterSeconds: null,
			checkedAt: "2026-11-24T00:00:00.000Z",
		})),
		voiceList: proc("voiceList", (input) => ({
			provider: input.provider,
			source: input.source ?? "public",
			voices: w.catalog.filter((voice) => voice.provider === input.provider),
			next: null,
			total: null,
			totalExact: true,
			windowLimited: false,
			fetchedAt: "2026-11-24T00:00:00.000Z",
			stale: null,
		})),
		voiceAccents: proc("voiceAccents", ({ language }) => ({
			language,
			accents: [{ value: "seoul", name: "Seoul" }],
			fetchedAt: "2026-11-24T00:00:00.000Z",
			stale: null,
		})),
		voiceListRefresh: proc("voiceListRefresh", () => ({ retryAt: null })),
		trialFindMany: proc("trialFindMany", (input) =>
			input.map((request: TrialRequest) => {
				const row = w.rows.find(
					(item) =>
						item.kind === "trial" &&
						item.status === "done" &&
						item.combo === comboSignature(request),
				);
				if (!row) return null;
				const { id, createdAt, usage } = row;
				return { id, createdAt, usage };
			}),
		),
		trialCreate: proc("trialCreate", (input) => {
			w.created.push(input);
			w.synth += 1;
			return trialOut(
				w.add(input.request, {
					kind: "trial",
					requestId: input.requestId,
					status: w.trialStatus,
				}),
			);
		}),
		trialRequest: proc("trialRequest", (input) =>
			statusOf("trial", input.requestId),
		),
		trialAudio: proc("trialAudio", (input) =>
			trialOut(done(input.id, "trial")),
		),
		trialList: proc("trialList", (input) =>
			w.rows
				.filter(
					(row) =>
						row.kind === "trial" &&
						row.status === "done" &&
						row.request.provider === input.provider &&
						row.request.voiceId === input.voiceId,
				)
				.map(({ id, createdAt, usage, request }) => ({
					id,
					createdAt,
					usage,
					request,
				})),
		),
		trialDelete: proc("trialDelete", (input) => {
			const row = done(input.id, "trial");
			w.rows.splice(w.rows.indexOf(row), 1);
			return { deleted: true };
		}),
		scriptGet: proc("scriptGet", ({ id }) => {
			const script = w.scripts.find((item) => item.id === id);
			if (!script) throw new ORPCError("NOT_FOUND");
			return script;
		}),
		scriptRecordRecent: proc("scriptRecordRecent", (input) => {
			w.recent.push(input);
			return { id: crypto.randomUUID() };
		}),
		studioAutoTag: proc("studioAutoTag", (input) => {
			w.tagged.push(input);
			return {
				paragraphs: input.paragraphs.map((item: { text: string }) => ({
					...item,
					text: `[laughs] ${item.text}`,
				})),
				skipped: 0,
			};
		}),
		// 실제 서버처럼 정리한 요청으로 조합을 본다
		dramaFind: proc("dramaFind", (input) => {
			const combo = sceneKey(input);
			const same = w.takes.filter((take) => sceneKey(take.request) === combo);
			const take =
				same.find((item) => item.status === "done") ??
				same.find((item) => item.status === "unknown");
			return take ? takeOut(take) : null;
		}),
		dramaCreate: proc("dramaCreate", (input) => {
			w.scenes.push(input);
			w.synth += 1;
			const { status: _, ...made } = takeOut(
				w.take(input.request, { requestId: input.requestId }),
			);
			return made;
		}),
		dramaRequest: proc("dramaRequest", ({ requestId }) => {
			const take = w.takes.find((item) => item.requestId === requestId);
			if (!take) return null;
			const { segments: _, ...found } = takeOut(take);
			return { ...found, reason: take.reason };
		}),
		dramaList: proc("dramaList", () =>
			w.takes
				.filter(({ status }) => status === "done" || status === "unknown")
				.slice(0, 20)
				.map((take) => ({ ...takeOut(take), request: take.request })),
		),
		dramaAudio: proc("dramaAudio", ({ id, part }) => {
			const take = w.takes.find(
				(item) => item.id === id && item.status === "done",
			);
			const chunk = take?.audio.subarray(
				part * STUDIO_PART_BYTES,
				(part + 1) * STUDIO_PART_BYTES,
			);
			if (!chunk?.length) throw new ORPCError("NOT_FOUND");
			return new File([new Uint8Array(chunk)], "a", { type: "audio/wav" });
		}),
		dramaDelete: proc("dramaDelete", ({ id }) => {
			const at = w.takes.findIndex((item) => item.id === id);
			if (at < 0) throw new ORPCError("NOT_FOUND");
			w.takes.splice(at, 1);
			return { deleted: true };
		}),
		dramaAutoTag: proc("dramaAutoTag", (input) => {
			w.dramaTagged.push(input);
			return {
				lines: input.lines.map((line: { text: string }) => ({
					...line,
					text: `[laughs] ${line.text}`,
				})),
				skipped: 0,
			};
		}),
		myVoiceList: proc("myVoiceList", () => ({
			items: w.clones,
			providers: w.cloneProviders,
		})),
		myVoiceCreate: proc("myVoiceCreate", async (input) => {
			const read = async (file?: File) =>
				file && {
					name: file.name,
					type: file.type,
					bytes: Buffer.from(await file.arrayBuffer()),
				};
			const { requestId, provider, name, consent } = input;
			w.cloned.push({
				...{ requestId, provider, name, consent },
				source: await read(input.source),
				consentAudio: await read(input.consentAudio),
			});
			return w.clone({ requestId, provider, name, ...w.cloneMade });
		}),
		myVoiceRequest: proc(
			"myVoiceRequest",
			({ requestId }) =>
				w.clones.find((item) => item.requestId === requestId) ?? null,
		),
		myVoiceCheck: proc("myVoiceCheck", ({ id }) => cloneOf(id)),
		myVoiceSave: proc("myVoiceSave", ({ id }) =>
			Object.assign(cloneOf(id, "ready"), {
				savedVoiceId: crypto.randomUUID(),
			}),
		),
		myVoiceDelete: proc("myVoiceDelete", ({ id }) => {
			w.clones.splice(w.clones.indexOf(cloneOf(id)), 1);
			return { deleted: true };
		}),
		savedVoiceList: proc("savedVoiceList", () => w.voices),
		channelList: proc("channelList", () => w.channels),
		classificationList: proc("classificationList", () => w.classes),
		presetList: proc("presetList", () => w.presets),
		trialModels: proc("trialModels", () => ({
			rates: [{ model: "eleven_v4", multiplier: 1.5 }],
		})),
		studioFindMany: proc("studioFindMany", (input) =>
			input.map((request: TrialRequest) => {
				const rows = w.rows.filter(
					(row) =>
						row.kind === "studio" && row.combo === comboSignature(request),
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
		studioRequest: proc("studioRequest", (input) =>
			statusOf("studio", input.requestId),
		),
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
