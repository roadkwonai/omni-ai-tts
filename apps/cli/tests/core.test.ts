import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ORPCError } from "@orpc/client";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { build } from "rolldown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type Connection,
	login,
	logout,
	manageError,
	normalizeOrigin,
	status,
} from "../src/client.js";
import { checkOut, readInput, readJson, readSettings } from "../src/files.js";
import { clean, jsonText, usageText } from "../src/output.js";
import { create, type Kind } from "../src/paid.js";
import {
	claim,
	fingerprint,
	fingerprintOf,
	kindOf,
	recordOf,
	recordsFor,
	recordsOf,
	release,
} from "../src/requests.js";
import { change } from "../src/session.js";
import { parseRef, remember, remembered } from "../src/voices.js";
import { voiceOf } from "./harness.js";

// 세션 변경 직전에 한 번 끼어드는 길(겹친 실행을 재현한다)
const hooks = vi.hoisted(() => ({
	beforeChange: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("../src/session.js", async (load) => {
	const real = await load<typeof import("../src/session.js")>();
	return {
		...real,
		change: async (fn: Parameters<typeof real.change>[0]) => {
			const before = hooks.beforeChange;
			hooks.beforeChange = undefined;
			await before?.();
			return real.change(fn);
		},
	};
});

describe("작업실 주소", () => {
	it("HTTPS와 루프백 HTTP를 허용하고 외부 HTTP를 거절한다", () => {
		expect(normalizeOrigin("https://example.com")).toBe("https://example.com");
		expect(normalizeOrigin("http://127.0.0.1:3001")).toBe(
			"http://127.0.0.1:3001",
		);
		expect(() => normalizeOrigin("http://example.com")).toThrow();
	});
});

it("로그아웃 후 도착한 세션 갱신이 이전 세션을 복원하지 않는다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-race-"));
	process.env.OMNI_TTS_CONFIG_DIR = dir;
	const original = globalThis.fetch;
	let release!: (response: Response) => void;
	let started!: () => void;
	const entered = new Promise<void>((resolve) => {
		started = resolve;
	});
	globalThis.fetch = async (input) => {
		if (String(input).includes("get-session")) {
			started();
			return new Promise<Response>((resolve) => {
				release = resolve;
			});
		}
		return new Response("{}", { status: 200 });
	};
	try {
		await change((state) => {
			state.current = "https://example.com";
			state.sessions[state.current] = { cookie: "session=old", version: "v1" };
		});
		const pending = status("https://example.com");
		await entered;
		await logout("https://example.com");
		release(
			new Response(JSON.stringify({ session: {}, user: {} }), {
				headers: { "set-cookie": "session=new; Path=/" },
			}),
		);
		await expect(pending).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(status("https://example.com")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	} finally {
		globalThis.fetch = original;
		delete process.env.OMNI_TTS_CONFIG_DIR;
		rmSync(dir, { recursive: true, force: true });
	}
});

it("인증 API가 데모 404를 반환하면 로그인 세션을 저장하지 않는다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-demo-"));
	process.env.OMNI_TTS_CONFIG_DIR = dir;
	const original = globalThis.fetch;
	globalThis.fetch = async () => new Response(null, { status: 404 });
	try {
		await expect(
			login("https://example.com", "owner@example.com", "password"),
		).rejects.toMatchObject({ exitCode: 3 });
		await expect(status("https://example.com")).rejects.toMatchObject({
			exitCode: 3,
		});
	} finally {
		globalThis.fetch = original;
		delete process.env.OMNI_TTS_CONFIG_DIR;
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("요청 기록", () => {
	const request = (text: string): TrialRequest => ({
		provider: "airy",
		voiceId: "a",
		text,
		settings: DEFAULT_SETTINGS.airy,
	});
	const record = (requestId: string, origin = "https://a.example") => ({
		origin,
		requestId,
		provider: "airy",
		createdAt: "2026-01-01T00:00:00Z",
	});
	it("지문은 주소·사용자·조합마다 다르고 앞뒤 공백에는 같다", () => {
		const base = fingerprint("https://a.example", "u", request("가"));
		expect(base).toMatch(/^[0-9a-f]{64}$/);
		expect(fingerprint("https://a.example", "u", request(" 가\n"))).toBe(base);
		expect(fingerprint("https://b.example", "u", request("가"))).not.toBe(base);
		expect(fingerprint("https://a.example", "v", request("가"))).not.toBe(base);
		expect(fingerprint("https://a.example", "u", request("나"))).not.toBe(base);
	});
	it("시험 생성의 지문은 다르고 작업실의 지문과 옛 기록은 T18과 같다", () => {
		const of = (kind?: "studio" | "trial") =>
			fingerprint("https://a.example", "u", request("가"), kind);
		expect(of()).toBe(of("studio"));
		expect(of("trial")).not.toBe(of("studio"));
		expect(kindOf(record("1"))).toBe("studio");
		expect(kindOf({ ...record("1"), kind: "trial" })).toBe("trial");
		expect(kindOf({ ...record("1"), kind: "drama" })).toBe("drama");
	});
	it("서명으로 만든 지문은 T18 식 그대로이고 종류마다 다르다", () => {
		const signature = comboSignature(request("가"));
		const formula = (kind: string) =>
			createHash("sha256")
				.update(JSON.stringify(["https://a.example", "u", kind, signature]))
				.digest("hex");
		expect(fingerprint("https://a.example", "u", request("가"))).toBe(
			formula("studio"),
		);
		expect(fingerprintOf("https://a.example", "u", signature, "drama")).toBe(
			formula("drama"),
		);
	});
	it("요청 ID를 주면 앞 기록이 그 요청일 때만 바꾼다", async () => {
		const dir = mkdtempSync(join(tmpdir(), "omni-cli-requests-"));
		process.env.OMNI_TTS_CONFIG_DIR = dir;
		const ignore = () => {};
		try {
			// 기록이 없으면 본 기록이 사라진 것이다
			expect(await claim("k", record("2"), "1", ignore)).toEqual({
				claimed: false,
				previous: undefined,
			});
			expect(await recordOf("k")).toBeUndefined();
			await claim("k", record("1"), false, ignore);
			expect(await claim("k", record("2"), "9", ignore)).toMatchObject({
				claimed: false,
				previous: { requestId: "1" },
			});
			expect(await claim("k", record("2"), "1", ignore)).toMatchObject({
				claimed: true,
				previous: { requestId: "1" },
			});
			expect(await recordsFor(["k", "없음"])).toMatchObject([
				{ requestId: "2" },
				undefined,
			]);
		} finally {
			delete process.env.OMNI_TTS_CONFIG_DIR;
			rmSync(dir, { recursive: true, force: true });
		}
	});
	it("요청 모양이 다른 종류(drama)도 같은 흐름으로 한 번만 만들고 종류를 적는다", async () => {
		const dir = mkdtempSync(join(tmpdir(), "omni-cli-requests-"));
		process.env.OMNI_TTS_CONFIG_DIR = dir;
		const connection = { origin: "https://a.example" } as Connection;
		const scene = { key: "k", provider: "fish_audio", request: { lines: 2 } };
		const seen: unknown[] = [];
		const kind: Kind<{ lines: number }> = {
			name: "drama",
			find: async () => null,
			create: async (_connection, value) => {
				seen.push(value.request, await recordOf("k"));
				return { id: "r" };
			},
			status: async () => null,
			settle: async () => false,
			finish: async () => {},
		};
		const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		try {
			expect(await create(kind, connection, scene, "reuse")).toMatchObject({
				source: "created",
				id: "r",
			});
			expect(seen).toMatchObject([{ lines: 2 }, { kind: "drama" }]);
			// 완료를 확인하지 못해 남은 기록은 다시 만들지 않는다
			await expect(
				create(kind, connection, scene, "reuse"),
			).rejects.toMatchObject({ exitCode: 6 });
			expect(seen).toHaveLength(2);
			expect(
				(await recordsOf("https://a.example")).map((item) => kindOf(item)),
			).toEqual(["drama"]);
		} finally {
			err.mockRestore();
			delete process.env.OMNI_TTS_CONFIG_DIR;
			rmSync(dir, { recursive: true, force: true });
		}
	});
	it("기록이 없을 때만 선점하고 내 것만 지우거나 되돌린다", async () => {
		const dir = mkdtempSync(join(tmpdir(), "omni-cli-requests-"));
		process.env.OMNI_TTS_CONFIG_DIR = dir;
		const ignore = () => {};
		try {
			expect(await claim("k", record("1"), false, ignore)).toMatchObject({
				claimed: true,
			});
			expect(await claim("k", record("2"), false, ignore)).toMatchObject({
				claimed: false,
				previous: { requestId: "1" },
			});
			await release("https://a.example", "2");
			await release("https://b.example", "1");
			expect(await recordOf("k")).toMatchObject({ requestId: "1" });
			const { previous } = await claim("k", record("3"), true, ignore);
			await release("https://a.example", "1");
			expect(await recordOf("k")).toMatchObject({ requestId: "3" });
			await release("https://a.example", "3", previous);
			expect(await recordOf("k")).toMatchObject({ requestId: "1" });
			expect(await recordsOf("https://b.example")).toEqual([]);
			await release("https://a.example", "1");
			expect(await recordOf("k")).toBeUndefined();
		} finally {
			delete process.env.OMNI_TTS_CONFIG_DIR;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("찾은 성우(voices.json)", () => {
	const origin = "https://a.example";
	let dir = "";
	const path = () => join(dir, "voices.json");
	const voices = (count: number, prefix = "v") =>
		Array.from({ length: count }, (_, i) =>
			voiceOf("elevenlabs", `${prefix}${i}`),
		) as never[];
	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), "omni-cli-voices-"));
		process.env.OMNI_TTS_CONFIG_DIR = dir;
		await change((state) => {
			state.sessions[origin] = { cookie: "c", version: "v1" };
			state.sessions["https://b.example"] = { cookie: "c", version: "v1" };
		});
	});
	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.OMNI_TTS_CONFIG_DIR;
		rmSync(dir, { recursive: true, force: true });
	});
	const put = (found: never[], version = "v1", at = origin) =>
		remember({ origin: at, version }, found);

	it("origin마다 최근 500명을 0600으로 두고 같은 성우는 하나다", async () => {
		await put(voices(400));
		await put(voices(1, "b"), "v1", "https://b.example");
		await put(voices(150, "n"));
		await put([voiceOf("elevenlabs", "n0", { name: "새 이름" }) as never]);
		expect(statSync(path()).mode & 0o777).toBe(0o600);
		const stored = JSON.parse(readFileSync(path(), "utf8")).voices;
		expect(stored[origin]).toHaveLength(500);
		expect(stored["https://b.example"]).toHaveLength(1);
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
		expect(await remembered(origin, "elevenlabs:v399")).toBeDefined();
		expect(await remembered(origin, "elevenlabs:n0")).toMatchObject({
			name: "새 이름",
		});
		expect(await remembered(origin, "elevenlabs:b0")).toBeUndefined();
	});
	it("24시간이 지나면 없는 것으로 본다", async () => {
		const start = Date.now();
		await put(voices(1));
		const now = vi.spyOn(Date, "now");
		now.mockReturnValue(start + 23 * 60 * 60 * 1000);
		expect(await remembered(origin, "elevenlabs:v0")).toBeDefined();
		now.mockReturnValue(start + 24 * 60 * 60 * 1000 + 60_000);
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
		await put(voices(1, "n"));
		expect(readFileSync(path(), "utf8")).not.toContain('"v0"');
	});
	it("세션 버전이 다르거나 없으면 쓰지 않는다", async () => {
		await put(voices(1), "old");
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
		await change((state) => {
			delete state.sessions[origin];
		});
		await put(voices(1));
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
	});
	it("느슨한 권한의 파일은 7이고, 로그아웃은 서버 로그아웃까지 한 뒤 알린다", async () => {
		await put(voices(1));
		chmodSync(path(), 0o644);
		await expect(remembered(origin, "elevenlabs:v0")).rejects.toMatchObject({
			code: "STORAGE_ERROR",
			exitCode: 7,
		});
		const fetched = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("{}"));
		await expect(logout(origin)).rejects.toMatchObject({ exitCode: 7 });
		expect(String(fetched.mock.calls[0]?.[0])).toContain("sign-out");
		await expect(status(origin)).rejects.toMatchObject({ exitCode: 3 });
	});
	it("로그인에 성공하면 그 주소의 찾은 성우만 지운다", async () => {
		await put(voices(1));
		await put(voices(1), "v1", "https://b.example");
		let ok = false;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
			const path = request instanceof Request ? request.url : String(request);
			if (path.includes("/api/rpc"))
				return Response.json({ json: [] }, { status: 200 });
			if (path.includes("sign-in") && !ok)
				return new Response("{}", { status: 401 });
			return Response.json(
				{ session: {}, user: { id: "u" } },
				{ headers: { "set-cookie": "session=new; Path=/" } },
			);
		});
		const again = () => login(origin, "owner@example.com", "password");
		await expect(again()).rejects.toMatchObject({ exitCode: 3 });
		expect(await remembered(origin, "elevenlabs:v0")).toBeDefined();
		ok = true;
		await again();
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
		expect(
			await remembered("https://b.example", "elevenlabs:v0"),
		).toBeDefined();
		// 앞 세션의 늦은 검색도 다시 쓰지 않는다
		await put(voices(1));
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
	});
	it("찾은 성우를 지우지 못하면 로그인은 세션을 바꾸지 않고 7이다", async () => {
		await put(voices(1));
		chmodSync(path(), 0o644);
		vi.spyOn(globalThis, "fetch").mockImplementation(async (request) =>
			request instanceof Request
				? Response.json({ json: [] })
				: Response.json(
						{ session: {}, user: { id: "u" } },
						{ headers: { "set-cookie": "session=new; Path=/" } },
					),
		);
		await expect(
			login(origin, "owner@example.com", "password"),
		).rejects.toMatchObject({ exitCode: 7 });
		expect(await change((state) => state.sessions[origin])).toEqual({
			cookie: "c",
			version: "v1",
		});
	});
	it("로그인의 지우기와 세션 저장 사이에 끝난 옛 검색도 지우고, 그 실패는 알리기만 한다", async () => {
		const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		vi.spyOn(globalThis, "fetch").mockImplementation(async (request) => {
			if (!(request instanceof Request))
				return Response.json(
					{ session: {}, user: { id: "u" } },
					{ headers: { "set-cookie": "session=new; Path=/" } },
				);
			// 다음 세션 변경(새 세션 저장) 직전에 옛 세션의 늦은 검색이 끝난다
			hooks.beforeChange = late;
			return Response.json({ json: [] });
		});
		let late = () => put(voices(1));
		await login(origin, "owner@example.com", "password");
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
		expect(err).not.toHaveBeenCalled();
		late = async () => chmodSync(path(), 0o644);
		await login(origin, "owner@example.com", "password");
		expect(err.mock.calls.join()).toContain("voices.json");
	});
	it("세션이 없어도 로그아웃은 그 주소의 찾은 성우를 지운다", async () => {
		await put(voices(1));
		await put(voices(1), "v1", "https://b.example");
		await change((state) => {
			delete state.sessions[origin];
		});
		const fetched = vi.spyOn(globalThis, "fetch");
		await expect(logout(origin)).rejects.toMatchObject({ exitCode: 3 });
		expect(fetched).not.toHaveBeenCalled();
		expect(await remembered(origin, "elevenlabs:v0")).toBeUndefined();
		expect(
			await remembered("https://b.example", "elevenlabs:v0"),
		).toBeDefined();
	});
	it("서버 로그아웃을 확인하지 못해도 찾은 성우를 지우지 못한 것을 알린다", async () => {
		await put(voices(1));
		chmodSync(path(), 0o644);
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("끊김"));
		const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		await expect(logout(origin)).rejects.toMatchObject({
			code: "LOGOUT_UNCONFIRMED",
		});
		expect(err.mock.calls.join()).toContain("voices.json");
	});
	it("REF는 첫 콜론에서 나누고 모르는 공급자와 빈 ID는 거절한다", () => {
		expect(parseRef("gemini:a:b")).toEqual({
			provider: "gemini",
			voiceId: "a:b",
		});
		for (const ref of ["", "gemini", "gemini:", ":a", "openai:a"])
			expect(() => parseRef(ref)).toThrow();
	});
});

it.each([
	["BAD_REQUEST", undefined, "INPUT", 2],
	["BAD_REQUEST", "provider_input", "SERVER_ERROR", 5],
	["CONFLICT", "duplicate_name", "CONFLICT", 2],
	["CONFLICT", "stale", "CONFLICT", 2],
	["CONFLICT", "모름", "SERVER_ERROR", 5],
	["BAD_GATEWAY", "stale", "SERVER_ERROR", 5],
	["NOT_FOUND", undefined, "NOT_FOUND", 4],
	["UNAUTHORIZED", undefined, "UNAUTHORIZED", 3],
	["TOO_MANY_REQUESTS", "rate_limit", "SERVER_ERROR", 5],
])("관리 명령의 오류 %s %s → %s %i", (code, reason, expected, exitCode) => {
	let thrown: unknown;
	try {
		manageError(new ORPCError(code, { data: reason ? { reason } : undefined }));
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toMatchObject({ code: expected, exitCode });
	if (expected === "CONFLICT")
		expect(thrown).toMatchObject({ detail: { reason } });
});

it("파일의 확장자와 입력 상한을 인자로 받는다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-files-"));
	try {
		const big = join(dir, "big.json");
		writeFileSync(big, JSON.stringify({ text: "a".repeat(1024 * 1024) }));
		await expect(readInput(big)).rejects.toMatchObject({ exitCode: 2 });
		await expect(readJson(big, 3 * 1024 * 1024)).resolves.toMatchObject({
			text: expect.any(String),
		});
		expect(() => checkOut(join(dir, "a.txt"), false)).toThrow(
			"--out은 .mp3나 .wav 파일이어야 합니다.",
		);
		checkOut(join(dir, "a.txt"), false, [".txt", ".json"]);
		expect(() => checkOut(join(dir, "a.mp3"), false, [".txt"])).toThrow();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("설정 파일의 고정 선택지 오타는 2로 거절한다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-settings-"));
	const file = join(dir, "settings.json");
	const read = (
		provider: "typecast" | "airy" | "elevenlabs",
		value: object,
	) => {
		writeFileSync(file, JSON.stringify(value));
		return readSettings(provider, file);
	};
	try {
		for (const [provider, value] of [
			["airy", { language: "kr" }],
			["airy", { style: "soft" }],
			["airy", { model: "airy" }],
			["airy", { language: "toString" }],
			["typecast", { emotion: "auto" }],
			["typecast", { preset: "joy" }],
			["typecast", { language: "ko" }],
			["elevenlabs", { model: "v4" }],
		] as const)
			await expect(read(provider, value)).rejects.toMatchObject({
				exitCode: 2,
				message: expect.stringContaining(Object.keys(value)[0] ?? ""),
			});
		await expect(
			read("airy", { language: "en", style: "calm" }),
		).resolves.toMatchObject({ language: "en", style: "calm" });
		// 같은 이름의 다른 공급자 칸은 선택지가 아니다
		await expect(read("elevenlabs", { style: 0.3 })).resolves.toMatchObject({
			style: 0.3,
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// 소스에 보이지 않는 글자를 두지 않게 코드로 만든다
const HIDDEN = String.fromCodePoint(
	...[0x7f, 0x80, 0x9f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e],
	...[0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c],
);
it("사람용 글에서 제어 문자와 방향 제어 문자를 지운다", () => {
	expect(clean(`가\u0000\n\u001b${HIDDEN}나 é`)).toBe("가나 é");
});
it("JSON의 제어 문자와 방향 제어 문자를 이스케이프해도 값은 같다", () => {
	const value = { name: `가\n${HIDDEN}나` };
	const text = jsonText(value, 2);
	expect(text).toContain("\\u007f\\u0080\\u009f\\u202a\\u202b");
	for (const char of HIDDEN) expect(text).not.toContain(char);
	expect(JSON.parse(text)).toEqual(value);
});

it("사용량을 단위마다 다르게 보인다", () => {
	expect(usageText({ unit: "credit", amount: 1200 })).toBe("1,200크레딧");
	expect(usageText({ unit: "byte", amount: 30 })).toBe("30바이트");
	expect(usageText({ unit: "usd_micro", amount: 1234 })).toBe("추정 $0.0013");
	expect(usageText({ unit: "free", amount: 0 })).toBe("무료");
});

it("세션이 없으면 인증 오류를 반환한다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-test-"));
	process.env.OMNI_TTS_CONFIG_DIR = dir;
	try {
		await expect(status("https://example.com")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			exitCode: 3,
		});
	} finally {
		delete process.env.OMNI_TTS_CONFIG_DIR;
		rmSync(dir, { recursive: true, force: true });
	}
});

it("다른 사용자가 접근할 수 있는 세션 폴더를 거절한다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-permissions-"));
	process.env.OMNI_TTS_CONFIG_DIR = dir;
	chmodSync(dir, 0o755);
	try {
		await expect(status("https://example.com")).rejects.toMatchObject({
			code: "STORAGE_ERROR",
			exitCode: 7,
		});
	} finally {
		delete process.env.OMNI_TTS_CONFIG_DIR;
		rmSync(dir, { recursive: true, force: true });
	}
});

it("잠금 중 프로세스가 강제 종료돼도 다음 요청이 잠금을 얻는다", async () => {
	const dir = mkdtempSync(join(tmpdir(), "omni-cli-crash-"));
	try {
		// 묶음에는 session 모듈이 따로 없다
		const file = join(dir, "session.mjs");
		await build({
			input: "src/session.ts",
			platform: "node",
			output: { file },
		});
		const moduleUrl = pathToFileURL(file).href;
		const child = spawn(
			process.execPath,
			[
				"--input-type=module",
				"-e",
				`import { change } from ${JSON.stringify(moduleUrl)}; await change(() => process.kill(process.pid, 'SIGKILL'));`,
			],
			{ env: { ...process.env, OMNI_TTS_CONFIG_DIR: dir }, stdio: "ignore" },
		);
		const signal = await new Promise<string | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (_code, signal) => resolve(signal));
		});
		expect(signal).toBe("SIGKILL");
		process.env.OMNI_TTS_CONFIG_DIR = dir;
		await expect(change(() => "ok")).resolves.toBe("ok");
	} finally {
		delete process.env.OMNI_TTS_CONFIG_DIR;
		rmSync(dir, { recursive: true, force: true });
	}
});
