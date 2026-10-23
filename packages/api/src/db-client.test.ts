import { createDb } from "@tts-pilot-app/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testDatabaseUrl as url } from "./test-db";

afterEach(() => {
	vi.restoreAllMocks();
});

// T7-01: DB가 쉬는 연결을 끊으면(컨테이너 정지, Neon 유휴 끊김) 풀이 'error'를 보낸다. 받을 곳이 없으면 uncaughtException으로 서버가 죽는다.
describe.skipIf(!url)("DB 연결(테스트 DB)", () => {
	it("DB가 쉬는 연결을 끊어도 로그 한 줄만 남기고 다음 질의는 새 연결로 된다", async () => {
		const db = createDb({ DATABASE_URL: url as string });
		const admin = createDb({ DATABASE_URL: url as string });
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { rows } = await db.$client.query<{ pid: number }>(
				"select pg_backend_pid() as pid",
			);
			await admin.$client.query("select pg_terminate_backend($1)", [
				rows[0]?.pid,
			]);
			await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
			const line = String(log.mock.calls[0]?.[0]);
			expect(line).toMatch(/^\[db\] 쉬는 연결 오류: /);
			expect(line).not.toContain("postgresql://");
			expect((await db.$client.query("select 1 as one")).rows).toEqual([
				{ one: 1 },
			]);
		} finally {
			await db.$client.end();
			await admin.$client.end();
		}
	});
});
