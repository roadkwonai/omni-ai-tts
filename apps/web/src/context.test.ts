import { beforeEach, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
	env: { DATABASE_URL: "", DEMO_DB_HOST: "" } as Record<string, string>,
}));
vi.mock("./env.server", () => ({ ENV: h.env }));
vi.mock("./services", () => ({ auth: {}, db: {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { isDemoDb } from "./context";

const HOST = "demo.example.com";
beforeEach(() => {
	h.env.DEMO_DB_HOST = HOST;
});

test("접속 호스트가 DEMO_DB_HOST와 같으면 데모 DB다", () => {
	h.env.DATABASE_URL = `postgres://u:p@${HOST}:5432/db`;
	expect(isDemoDb()).toBe(true);
});

test("다른 호스트면 닫는다", () => {
	h.env.DATABASE_URL = "postgres://u:p@owner.example.com/db";
	expect(isDemoDb()).toBe(false);
});

test("쿼리 host·hostaddr로 실제 호스트를 바꾸면 닫는다", () => {
	h.env.DATABASE_URL = `postgres://u:p@${HOST}/db?host=owner.example.com`;
	expect(isDemoDb()).toBe(false);
	h.env.DATABASE_URL = `postgres://u:p@${HOST}/db?hostaddr=10.0.0.1`;
	expect(isDemoDb()).toBe(false);
});

test("DEMO_DB_HOST가 비었거나 주소를 읽지 못하면 닫는다", () => {
	h.env.DATABASE_URL = `postgres://u:p@${HOST}/db`;
	h.env.DEMO_DB_HOST = "";
	expect(isDemoDb()).toBe(false);
	h.env.DEMO_DB_HOST = HOST;
	h.env.DATABASE_URL = "not a url";
	expect(isDemoDb()).toBe(false);
});
