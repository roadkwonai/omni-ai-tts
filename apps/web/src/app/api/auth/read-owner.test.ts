// readOwner(apps/web/src/context.ts) 테스트. 계층 훅이 src/ 바로 아래 테스트를 화면 계층으로 보아 서버 계층 폴더에 둔다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const getSession = vi.hoisted(() => vi.fn());
const demoOwner = vi.hoisted(() => vi.fn());

vi.mock("../../../env.server", () => ({ ENV: env }));
vi.mock("../../../services", () => ({
	auth: { api: { getSession } },
	db: {},
}));
vi.mock("@tts-pilot-app/api/owner", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tts-pilot-app/api/owner")>()),
	demoOwner,
}));

import { readOwner } from "../../../context";

const KEYS = [
	"TYPECAST_API_KEY",
	"ELEVENLABS_API_KEY",
	"FISH_AUDIO_API_KEY",
	"AIRY_API_KEY",
	"GEMINI_API_KEY",
	"OPENAI_API_KEY",
] as const;
const read = () => readOwner(new Headers(), true);

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
	env.OWNER_EMAILS = "demo@example.com";
	getSession.mockReset();
	demoOwner.mockReset();
});

describe("readOwner 공개 데모(APP_MODE=demo)", () => {
	beforeEach(() => {
		env.APP_MODE = "demo";
		env.DATABASE_URL = "postgres://u:p@demo-db.example.com:5432/app";
		env.DEMO_DB_HOST = "demo-db.example.com";
	});

	it.each([
		["호스트가 다르면", "owner-db.example.com", undefined],
		["DEMO_DB_HOST가 없으면", undefined, undefined],
		["DEMO_DB_HOST가 비었으면", "", undefined],
		["DATABASE_URL을 못 읽으면", "demo-db.example.com", "not a url"],
		["대소문자만 달라도", "Demo-DB.example.com", undefined],
	])("%s DB를 부르지 않고 닫힌다", async (_, host, url) => {
		env.DEMO_DB_HOST = host;
		if (url) env.DATABASE_URL = url;
		demoOwner.mockResolvedValue({ userId: "u-demo", email: "" });
		await expect(read()).resolves.toEqual({ state: "none" });
		expect(demoOwner).not.toHaveBeenCalled();
		expect(getSession).not.toHaveBeenCalled();
	});

	it("세션을 읽지 않고 예시 소유자로 정한다. 이메일은 넘기지 않는다", async () => {
		demoOwner.mockResolvedValue({
			userId: "u-demo",
			email: "demo@example.com",
		});
		await expect(read()).resolves.toEqual({
			state: "owner",
			userId: "u-demo",
			email: "",
		});
		expect(demoOwner).toHaveBeenCalledWith({}, "demo@example.com", false);
		expect(getSession).not.toHaveBeenCalled();
	});

	it.each(KEYS)("%s가 남아 있으면 키 있음으로 넘겨 닫힌다", async (key) => {
		env[key] = "k";
		demoOwner.mockResolvedValue(null);
		await expect(read()).resolves.toEqual({ state: "none" });
		expect(demoOwner).toHaveBeenCalledWith({}, "demo@example.com", true);
		expect(getSession).not.toHaveBeenCalled();
	});

	// 지금 동작 고정: 빈 문자열은 키 없음, 공백만 든 값은 키 있음(닫힘 쪽)
	it.each([
		["", false],
		["   ", true],
	])("키 값 %j는 키 있음 %s로 넘긴다", async (value, hasKey) => {
		for (const k of KEYS) env[k] = value;
		demoOwner.mockResolvedValue(null);
		await read();
		expect(demoOwner).toHaveBeenCalledWith({}, "demo@example.com", hasKey);
	});

	it("예시 소유자가 없으면 소유자 없음", async () => {
		demoOwner.mockResolvedValue(null);
		await expect(read()).resolves.toEqual({ state: "none" });
		expect(getSession).not.toHaveBeenCalled();
	});
});

describe("readOwner 본인용(T14 그대로)", () => {
	it.each([undefined, "owner"])(
		"APP_MODE=%s: 세션 이메일로 판정",
		async (mode) => {
			env.APP_MODE = mode;
			env.TYPECAST_API_KEY = "k";
			getSession.mockResolvedValueOnce(null);
			await expect(read()).resolves.toEqual({ state: "none" });
			getSession.mockResolvedValueOnce({
				user: { id: "u1", email: "Demo@example.com" },
			});
			await expect(read()).resolves.toEqual({
				state: "owner",
				userId: "u1",
				email: "Demo@example.com",
			});
			getSession.mockResolvedValueOnce({
				user: { id: "u2", email: "other@example.com" },
			});
			await expect(read()).resolves.toEqual({
				state: "denied",
				email: "other@example.com",
			});
			expect(demoOwner).not.toHaveBeenCalled();
		},
	);
});
