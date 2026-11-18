import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({}) as Record<string, string | undefined>);
const handler = vi.hoisted(() => vi.fn(async () => new Response("auth")));

vi.mock("../../../../env.server", () => ({ ENV: env }));
vi.mock("../../../../services", () => ({ auth: { handler } }));

import { GET, POST } from "./route";

const BASE = "http://localhost:3001/api/auth";
const call = (method: "GET" | "POST", path: string) =>
	({ GET, POST })[method](new Request(`${BASE}${path}`, { method }));

it("내보내는 메서드는 GET·POST뿐이다(그 밖은 Next가 405)", async () => {
	expect(Object.keys(await import("./route")).sort()).toEqual(["GET", "POST"]);
});

beforeEach(() => handler.mockClear());

describe("auth 라우트 공개 데모(T15-a2)", () => {
	beforeEach(() => {
		env.APP_MODE = "demo";
	});

	it.each([
		["POST", "/sign-in/email"],
		["POST", "/sign-out"],
		["GET", "/get-session"],
		["GET", "/ok"],
	] as const)(
		"%s %s → 404, Better Auth를 부르지 않는다",
		async (method, path) => {
			expect((await call(method, path)).status).toBe(404);
			expect(handler).not.toHaveBeenCalled();
		},
	);
});

describe("auth 라우트 본인용", () => {
	it.each([undefined, "owner"])(
		"APP_MODE=%s: Better Auth로 넘긴다",
		async (mode) => {
			env.APP_MODE = mode;
			expect(await (await call("POST", "/sign-in/email")).text()).toBe("auth");
			expect(await (await call("GET", "/get-session")).text()).toBe("auth");
			expect(handler).toHaveBeenCalledTimes(2);
		},
	);
});
