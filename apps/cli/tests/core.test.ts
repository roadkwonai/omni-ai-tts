import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";
import { login, logout, normalizeOrigin, status } from "../src/client.js";
import { clean, jsonText, usageText } from "../src/output.js";
import {
	claim,
	fingerprint,
	recordOf,
	recordsOf,
	release,
} from "../src/requests.js";
import { change } from "../src/session.js";

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
	const moduleUrl = pathToFileURL(resolve("dist/session.js")).href;
	try {
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
