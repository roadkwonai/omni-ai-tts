import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
	createServer,
	type IncomingHttpHeaders,
	type ServerResponse,
} from "node:http";
import { ORPCError } from "@orpc/server";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { fetchSample } from "../src/casting.js";
import {
	type serve,
	spawnCli,
	studioWorld,
	voiceOf,
	workspace,
} from "./harness.js";

let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;

beforeEach(async () => {
	w = studioWorld();
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});

const run = (args: string[]) => spawnCli(ws.dir, args).done;
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const search = (...args: string[]) =>
	run(["casting", "search", ...args, "--json"]);
// voiceList가 받은 입력을 남긴다
const inputs = () => {
	const seen: unknown[] = [];
	w.on.voiceList = (input, next) => {
		seen.push(input);
		return next();
	};
	return seen;
};
const reject = (code: string, data?: object) => () => {
	throw new ORPCError(code, { data });
};

describe("공급자 상태", { timeout: 60_000 }, () => {
	it("다섯 공급자나 하나의 상태를 보인다", async () => {
		w.on.providerStatus = (input, next) => ({
			...next(),
			...(input.provider === "gemini" ? { status: "no_key" } : {}),
		});
		const all = json(await run(["providers", "status", "--json"]));
		expect(all.origin).toBe(server.origin);
		expect(
			all.providers.map((item: { provider: string }) => item.provider),
		).toEqual(["typecast", "elevenlabs", "fish_audio", "airy", "gemini"]);
		const one = await run(["providers", "status", "--provider", "gemini"]);
		expect(one.code).toBe(0);
		expect(one.out).toContain("키 없음");
		expect(one.out).not.toContain("typecast");
	});
});

describe("성우 찾기", { timeout: 60_000 }, () => {
	it("공급자·출처별 기본 조건은 웹과 같다", async () => {
		const seen = inputs();
		for (const args of [
			["--provider", "typecast"],
			["--provider", "elevenlabs"],
			["--provider", "elevenlabs", "--source", "account"],
			["--provider", "fish_audio"],
			["--provider", "fish_audio", "--source", "account"],
		])
			expect((await search(...args)).code).toBe(0);
		expect(seen).toEqual([
			{ provider: "typecast" },
			{
				provider: "elevenlabs",
				source: "public",
				page: 0,
				query: {
					search: "",
					language: "ko",
					accent: null,
					gender: null,
					age: null,
					category: null,
					useCases: [],
					descriptives: [],
					featured: false,
					sort: "trending",
				},
			},
			{
				provider: "elevenlabs",
				source: "account",
				cursor: null,
				query: {
					search: "",
					voiceType: null,
					category: null,
					gender: null,
					age: null,
					language: null,
					accent: null,
					useCases: [],
					sort: "created_at_unix",
					direction: "desc",
				},
			},
			{
				provider: "fish_audio",
				source: "public",
				page: 1,
				query: {
					search: "",
					language: "ko",
					tags: [],
					licensed: false,
					sort: "score",
				},
			},
			{
				provider: "fish_audio",
				source: "account",
				page: 1,
				query: {
					search: "",
					language: null,
					tags: [],
					licensed: false,
					sort: "score",
				},
			},
		]);
	});

	it("받은 조건을 공급자의 칸으로 옮긴다", async () => {
		const seen = inputs();
		await search(
			...["--provider", "elevenlabs", "--q", "하나", "--language", "all"],
			...["--accent", "seoul", "--gender", "female", "--age", "young"],
			...["--category", "famous", "--use-case", "a", "--use-case", "b"],
			...["--descriptive", "calm", "--featured", "--sort", "created_date"],
			...["--page", "3"],
		);
		await search(
			...["--provider", "elevenlabs", "--source", "account", "--q", "둘"],
			...["--voice-type", "personal", "--category", "cloned", "--sort", "name"],
			...["--direction", "asc", "--cursor", "next-1", "--language", "ko"],
		);
		await search(
			...["--provider", "fish_audio", "--tag", "female", "--tag", "calm"],
			...["--licensed", "--sort", "task_count", "--page", "10"],
		);
		expect(seen).toMatchObject([
			{
				page: 3,
				query: {
					search: "하나",
					language: null,
					accent: "seoul",
					gender: "female",
					age: "young",
					category: "famous",
					useCases: ["a", "b"],
					descriptives: ["calm"],
					featured: true,
					sort: "created_date",
				},
			},
			{
				cursor: "next-1",
				query: {
					search: "둘",
					voiceType: "personal",
					category: "cloned",
					sort: "name",
					direction: "asc",
					language: "ko",
				},
			},
			{
				page: 10,
				query: {
					tags: ["female", "calm"],
					licensed: true,
					sort: "task_count",
				},
			},
		]);
	});

	it("그 공급자가 받지 않는 조건은 이름을 알리고 요청하지 않는다", async () => {
		for (const [args, word] of [
			[["--provider", "typecast", "--language", "ko"], "--language"],
			[["--provider", "airy", "--page", "1"], "--page"],
			[["--provider", "gemini", "--source", "account"], "--source"],
			[["--provider", "elevenlabs", "--tag", "a"], "--tag"],
			[["--provider", "elevenlabs", "--cursor", "a"], "--cursor"],
			[
				["--provider", "elevenlabs", "--source", "account", "--featured"],
				"--featured",
			],
			[["--provider", "fish_audio", "--gender", "male"], "--gender"],
			[["--provider", "fish_audio", "--page", "0"], "--page"],
			[["--provider", "fish_audio", "--page", "11"], "--page"],
			[["--provider", "elevenlabs", "--page", "1.5"], "--page"],
			[["--provider", "elevenlabs", "--source", "mine"], "--source"],
			[["--provider", "typecast", "--gender", "여성"], "--gender"],
			[[], "--provider"],
		] as const) {
			const result = await search(...args);
			expect([args, result.code]).toEqual([args, 2]);
			expect(json(result).message).toContain(word);
		}
		expect(w.calls).not.toContain("voiceList");
	});

	it("목록 전체를 주는 공급자는 이름·영문 이름·성우 ID와 성별을 CLI가 거른다", async () => {
		w.catalog = [
			voiceOf("typecast", "tc_1", { name: "하나", gender: "female" }),
			voiceOf("typecast", "tc_2", {
				name: "둘",
				englishName: "Hana Kim",
				gender: "male",
			}),
			voiceOf("typecast", "hana_3", { name: "셋", gender: "male" }),
			voiceOf("typecast", "tc_4", { name: "넷", gender: "male" }),
		];
		const refs = async (...args: string[]) =>
			json(await search("--provider", "typecast", ...args)).voices.map(
				(voice: { ref: string }) => voice.ref,
			);
		expect(await refs("--q", "HANA")).toEqual([
			"typecast:tc_2",
			"typecast:hana_3",
		]);
		expect(await refs("--q", "하나".normalize("NFD"))).toEqual([
			"typecast:tc_1",
		]);
		expect(await refs("--gender", "male")).toHaveLength(3);
		expect(await refs("--gender", "male", "--q", "넷")).toEqual([
			"typecast:tc_4",
		]);
	});

	it("다음 페이지·지난 목록 사유·다음 호출 시각을 보인다", async () => {
		w.catalog = [voiceOf("fish_audio", "f1")];
		w.on.voiceList = (_input, next) => ({
			...next(),
			next: 2,
			total: 1000,
			totalExact: false,
			windowLimited: true,
			stale: { reason: "rate_limit", retryAt: "2026-11-24T01:00:00.000Z" },
		});
		const result = await search("--provider", "fish_audio");
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			origin: server.origin,
			provider: "fish_audio",
			source: "public",
			voices: [{ ref: "fish_audio:f1", voiceId: "f1" }],
			next: 2,
			total: 1000,
			totalExact: false,
			windowLimited: true,
			fetchedAt: "2026-11-24T00:00:00.000Z",
			stale: { reason: "rate_limit" },
		});
		expect(result.err).toContain("2026-11-24T01:00:00.000Z");
		const human = await run(["casting", "search", "--provider", "fish_audio"]);
		expect(human.out).toContain("--page 2");
		expect(human.out).toContain("fish_audio:f1");
	});

	it("공급자 사유는 5, 서버가 거절한 조건은 2, 세션은 3이다", async () => {
		w.on.voiceList = reject("TOO_MANY_REQUESTS", {
			reason: "rate_limit",
			retryAt: "2026-11-24T01:00:00.000Z",
		});
		const limited = await search("--provider", "airy");
		expect(limited.code).toBe(5);
		expect(json(limited)).toMatchObject({
			reason: "rate_limit",
			retryAt: "2026-11-24T01:00:00.000Z",
		});
		w.on.voiceList = reject("PRECONDITION_FAILED", { reason: "no_key" });
		expect(json(await search("--provider", "airy")).reason).toBe("no_key");
		w.on.voiceList = reject("BAD_REQUEST");
		const bad = await search("--provider", "elevenlabs", "--sort", "모름");
		expect(bad.code).toBe(2);
		expect(json(bad).code).toBe("INPUT");
		w.on.voiceList = reject("UNAUTHORIZED");
		expect((await search("--provider", "airy")).code).toBe(3);
	});

	it("찾은 성우를 voices.json(0600)에 두고 로그아웃 때 지운다", async () => {
		w.catalog = [voiceOf("elevenlabs", "el-9")];
		await search("--provider", "elevenlabs");
		expect(statSync(ws.voicesPath).mode & 0o777).toBe(0o600);
		const stored = readFileSync(ws.voicesPath, "utf8");
		expect(stored).toContain("el-9");
		expect(stored).not.toContain("fixture-cookie");
		w.hook = (path, _request, response) => {
			if (!path.includes("sign-out")) return false;
			response.end("{}");
			return true;
		};
		expect((await run(["auth", "logout"])).code).toBe(0);
		expect(readFileSync(ws.voicesPath, "utf8")).not.toContain("el-9");
	});

	it("목록 전체를 주는 공급자의 성우는 두지 않아 다른 공급자의 자리를 밀어내지 않는다", async () => {
		w.catalog = [
			voiceOf("elevenlabs", "el-9", { samples: [] }),
			...Array.from({ length: 600 }, (_, i) => voiceOf("typecast", `tc_${i}`)),
		];
		await search("--provider", "elevenlabs");
		const all = json(await search("--provider", "typecast"));
		expect(all.voices).toHaveLength(600);
		// 성우를 찾은 뒤의 4다
		const found = await run([
			...["casting", "sample", "elevenlabs:el-9", "--json"],
			...["--out", ws.path("a.mp3")],
		]);
		expect(json(found).message).toContain("기본 샘플이 없습니다");
		expect(readFileSync(ws.voicesPath, "utf8")).not.toContain("tc_0");
	});

	it("로그아웃과 겹친 늦은 검색은 voices.json을 다시 쓰지 않는다", async () => {
		w.catalog = [voiceOf("elevenlabs", "el-9")];
		w.on.voiceList = (_input, next) => {
			writeFileSync(
				`${ws.dir}/sessions.json`,
				JSON.stringify({ sessions: {} }),
				{ mode: 0o600 },
			);
			return next();
		};
		expect((await search("--provider", "elevenlabs")).code).toBe(0);
		expect(existsSync(ws.voicesPath)).toBe(false);
	});

	it("억양 목록과 새로 고침", async () => {
		const accents = await run([
			...["casting", "accents", "--language", "ko", "--json"],
		]);
		expect(json(accents)).toMatchObject({
			language: "ko",
			accents: [{ value: "seoul" }],
		});
		const refreshed = await run([
			...["casting", "refresh", "--provider", "airy", "--json"],
		]);
		expect(json(refreshed)).toEqual({
			origin: server.origin,
			provider: "airy",
			retryAt: null,
		});
		w.on.voiceListRefresh = () => ({ retryAt: "2026-11-24T01:00:00.000Z" });
		const waiting = await run(["casting", "refresh", "--provider", "airy"]);
		expect(waiting.code).toBe(0);
		expect(waiting.out + waiting.err).toContain("2026-11-24T01:00:00.000Z");
		for (const args of [
			["casting", "accents"],
			["casting", "refresh"],
		])
			expect((await run(args)).code).toBe(2);
	});
});

describe("명령 공통", { timeout: 60_000 }, () => {
	it("모르는 옵션은 이름을 알리고 2다", async () => {
		for (const [args, word] of [
			[["presets", "list", "--모름"], "--모름"],
			[["presets", "list", "--out", "a.mp3"], "--out"],
			[["casting", "refresh", "--provider", "airy", "--yes"], "--yes"],
			[["trial", "list", "--voice"], "--voice"],
		] as const) {
			const result = await run([...args, "--json"]);
			expect([args, result.code]).toEqual([args, 2]);
			expect(json(result)).toMatchObject({ code: "INPUT" });
			expect(json(result).message).toContain(word);
		}
	});

	it("잘못된 --url은 모든 명령에서 2이고 요청하지 않는다", async () => {
		for (const command of [
			["auth", "login"],
			["auth", "status"],
			["auth", "logout"],
			["voices", "list"],
			["presets", "list"],
			["studio", "resume"],
			["providers", "status"],
			["casting", "refresh", "--provider", "airy"],
			["trial", "resume"],
		])
			for (const url of ["http://example.com", "글", `${server.origin}/a`]) {
				const result = await run([...command, "--url", url, "--json"]);
				expect([command, url, result.code]).toEqual([command, url, 2]);
				expect(json(result).code).toBe("INPUT");
			}
		expect(w.calls).toEqual([]);
	});
});

// 실제 CDN 대신 로컬 서버. 요청의 헤더와 옵션은 그대로 둔다
describe("기본 샘플", { timeout: 60_000 }, () => {
	const MP3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
	const WAV = Buffer.concat([
		Buffer.from("RIFF"),
		Buffer.alloc(4),
		Buffer.from("WAVEfmt "),
	]);
	const M4A = Buffer.concat([
		Buffer.from([0, 0, 0, 32]),
		Buffer.from("ftypM4A "),
	]);
	const OGG = Buffer.from("OggS\u0000\u0002");
	const base = "https://static.typecast.ai";
	let reply: (response: ServerResponse) => void;
	let seen: { url?: string; headers: IncomingHttpHeaders }[] = [];
	let port = 0;
	const cdn = createServer((request, response) => {
		seen.push({ url: request.url, headers: request.headers });
		reply(response);
	});
	const ok =
		(body: Buffer, type = "audio/mpeg") =>
		(response: ServerResponse) => {
			response.setHeader("content-type", type);
			response.end(body);
		};
	beforeAll(async () => {
		await new Promise<void>((done) => cdn.listen(0, "127.0.0.1", done));
		const address = cdn.address();
		if (address && typeof address === "object") port = address.port;
	});
	afterAll(() => {
		cdn.closeAllConnections();
		cdn.close();
	});
	beforeEach(() => {
		seen = [];
		reply = ok(MP3);
	});
	const preload = () =>
		`const f=globalThis.fetch;globalThis.fetch=(u,o)=>typeof u==="string"&&u.startsWith("https://")?f("http://127.0.0.1:${port}"+new URL(u).pathname,o):f(u,o);`;
	const sample = (ref: string, out: string, ...extra: string[]) =>
		spawnCli(
			ws.dir,
			["casting", "sample", ref, "--out", ws.path(out), "--json", ...extra],
			"",
			undefined,
			preload(),
		).done;
	const only = (provider: string, over: object) => {
		w.voices = [{ ...w.voices[0], voice: voiceOf(provider, "s1", over) }];
	};

	it("쿠키·origin 없이 받고 합성·시험 생성을 부르지 않는다", async () => {
		only("typecast", { previewUrl: `${base}/a.mp3` });
		const result = await sample("typecast:s1", "a.mp3");
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			origin: server.origin,
			ref: "typecast:s1",
			out: ws.path("a.mp3"),
			mime: "audio/mpeg",
			bytes: MP3.byteLength,
		});
		expect(readFileSync(ws.path("a.mp3")).equals(MP3)).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.headers.cookie).toBeUndefined();
		expect(seen[0]?.headers.origin).toBeUndefined();
		expect(w.synth).toBe(0);
		expect(w.calls.filter((name) => /Create|^trial/.test(name))).toEqual([]);
	});

	it("previewUrl과 samples를 순서대로 세고 같은 주소는 한 번이다", async () => {
		only("typecast", {
			previewUrl: `${base}/0.mp3`,
			samples: ["0", "1", "2"].map((name) => ({
				language: null,
				title: null,
				url: `${base}/${name}.mp3`,
			})),
		});
		expect((await sample("typecast:s1", "a.mp3", "--index", "2")).code).toBe(0);
		expect(seen[0]?.url).toBe("/2.mp3");
		expect((await sample("typecast:s1", "b.mp3", "--index", "3")).code).toBe(4);
		expect((await sample("typecast:s1", "b.mp3", "--index", "-1")).code).toBe(
			2,
		);
		expect((await sample("typecast:s1", "b.mp3", "--index", "a")).code).toBe(2);
		expect(existsSync(ws.path("b.mp3"))).toBe(false);
	});

	it.each([
		["a.wav", WAV, "audio/wav"],
		["a.m4a", M4A, "audio/mp4"],
		["a.ogg", OGG, "application/octet-stream"],
	])("실제 형식이 확장자와 같으면 받는다(%s)", async (name, body, type) => {
		only("typecast", { previewUrl: `${base}/x` });
		reply = ok(body, type);
		expect((await sample("typecast:s1", name)).code).toBe(0);
		expect(readFileSync(ws.path(name)).equals(body)).toBe(true);
	});

	it("content-type이 아니라 앞 바이트로 형식을 정한다", async () => {
		only("elevenlabs", {
			previewUrl: "https://storage.googleapis.com/a.mp3",
		});
		// 실제 ElevenLabs 샘플은 MP3를 text/plain으로 준다
		for (const type of ["text/plain", "text/html", ""]) {
			reply = ok(MP3, type);
			const result = await sample("elevenlabs:s1", "a.mp3", "--overwrite");
			expect([type, result.code]).toEqual([type, 0]);
			expect(json(result).mime).toBe("audio/mpeg");
			expect(readFileSync(ws.path("a.mp3")).equals(MP3)).toBe(true);
		}
	});

	it("형식이 확장자와 다르거나 오디오가 아니면 파일을 만들지 않는다", async () => {
		only("typecast", { previewUrl: `${base}/x` });
		reply = ok(WAV, "audio/mpeg");
		const result = await sample("typecast:s1", "a.mp3");
		expect(result.code).toBe(2);
		expect(json(result).message).toContain(".wav");
		for (const [body, type] of [
			[Buffer.from("<!doctype html><html></html>"), "audio/mpeg"],
			// UTF-16LE 글
			[Buffer.from([0xff, 0xfe, 0x3c, 0x00]), "audio/mpeg"],
			[Buffer.alloc(0), "audio/mpeg"],
		] as const) {
			reply = ok(body, type);
			expect((await sample("typecast:s1", "a.mp3")).code).toBe(5);
		}
		reply = (response) => {
			response.statusCode = 403;
			response.end();
		};
		expect((await sample("typecast:s1", "a.mp3")).code).toBe(5);
		expect((await sample("typecast:s1", "a.txt")).code).toBe(2);
		expect(existsSync(ws.path("a.mp3"))).toBe(false);
		expect(ws.leftovers()).toEqual([]);
	});

	it("허용하지 않은 주소는 요청하지 않고 리다이렉트를 따라가지 않는다", async () => {
		for (const url of [
			"https://evil.example/a.mp3",
			"http://static.typecast.ai/a.mp3",
			"https://static.typecast.ai:444/a.mp3",
			"https://u:p@static.typecast.ai/a.mp3",
			"file:///etc/passwd",
		]) {
			only("typecast", { previewUrl: url });
			expect([url, (await sample("typecast:s1", "a.mp3")).code]).toEqual([
				url,
				5,
			]);
		}
		expect(seen).toEqual([]);
		only("typecast", { previewUrl: `${base}/r` });
		reply = (response) => {
			response.statusCode = 302;
			response.setHeader("location", `http://127.0.0.1:${port}/evil`);
			response.end();
		};
		expect((await sample("typecast:s1", "a.mp3")).code).toBe(5);
		expect(seen).toHaveLength(1);
		expect(existsSync(ws.path("a.mp3"))).toBe(false);
	});

	it("샘플이 없거나 성우를 찾지 못하면 4다", async () => {
		only("typecast", { previewUrl: null, samples: [] });
		expect((await sample("typecast:s1", "a.mp3")).code).toBe(4);
		const none = await sample("elevenlabs:none", "a.mp3");
		expect(none.code).toBe(4);
		expect(json(none).message).toContain("casting search");
	});

	it("보관함 → voices.json → 목록 순서로 찾는다", async () => {
		const at = (name: string) => ({
			previewUrl: `${name === "list" ? base : "https://storage.googleapis.com"}/${name}`,
		});
		w.catalog = [
			voiceOf("elevenlabs", "s1", at("cached")),
			voiceOf("elevenlabs", "s2", at("cached")),
		];
		await search("--provider", "elevenlabs");
		w.catalog = [
			voiceOf("elevenlabs", "s2", at("list")),
			voiceOf("typecast", "s3", at("list")),
		];
		only("elevenlabs", at("saved"));
		w.calls.length = 0;
		for (const [ref, path] of [
			["elevenlabs:s1", "/saved"],
			["elevenlabs:s2", "/cached"],
			["typecast:s3", "/list"],
		] as const) {
			expect((await sample(ref, "a.mp3", "--overwrite")).code).toBe(0);
			expect(seen.at(-1)?.url).toBe(path);
		}
		expect(w.calls.filter((name) => name === "voiceList")).toHaveLength(1);
	});

	it("Gemini 샘플은 참고 음성이라고 알린다", async () => {
		only("gemini", {
			previewUrl:
				"https://docs.cloud.google.com/text-to-speech/docs/audio/a.wav",
		});
		reply = ok(WAV, "audio/wav");
		const result = await sample("gemini:s1", "a.wav");
		expect(result.code).toBe(0);
		expect(result.err).toContain("참고 음성(Gemini 소리가 아님)");
	});

	describe("받기 함수", () => {
		const real = globalThis.fetch;
		beforeEach(() => {
			globalThis.fetch = (_url, init) =>
				real(`http://127.0.0.1:${port}/x`, init);
		});
		afterEach(() => {
			globalThis.fetch = real;
			vi.restoreAllMocks();
		});
		it("32MiB를 넘으면 길이 헤더가 없어도 끊는다", async () => {
			let sent = 0;
			reply = (response) => {
				response.setHeader("content-type", "audio/mpeg");
				const chunk = Buffer.alloc(1024 * 1024, 1);
				const push = () => {
					if (response.destroyed || sent >= 64) return response.end();
					sent += 1;
					response.write(chunk, push);
				};
				push();
			};
			await expect(fetchSample(`${base}/x`)).rejects.toMatchObject({
				exitCode: 5,
			});
			expect(sent).toBeLessThan(64);
		});
		it("느린 응답은 30초에 끊는다", async () => {
			const timeout = AbortSignal.timeout.bind(AbortSignal);
			const spy = vi
				.spyOn(AbortSignal, "timeout")
				.mockImplementation(() => timeout(200));
			reply = (response) => {
				response.setHeader("content-type", "audio/mpeg");
				response.write(MP3);
			};
			await expect(fetchSample(`${base}/x`)).rejects.toMatchObject({
				exitCode: 5,
			});
			expect(spy).toHaveBeenCalledWith(30_000);
		});
	});
});
