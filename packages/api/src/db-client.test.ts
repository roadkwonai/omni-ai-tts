import net from "node:net";

import { createDb } from "@tts-pilot-app/db";
import { channel } from "@tts-pilot-app/db/schema/classification";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { testDatabaseUrl as url } from "./test-db";

// 시간 제한 3초를 기다리지 않게 줄인다(pg는 연결 문자열의 값을 먼저 쓴다). 3초 그대로는 '다른 연결에서 보이고' 테스트가 본다
const quick = (href: string) => {
	const short = new URL(href);
	short.searchParams.set("query_timeout", "500");
	return short.href;
};

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

	// 시간 제한에 걸린 연결이 열린 트랜잭션째 풀로 돌아가면 다음 저장이 그 안에서 성공한 뒤 사라진다(D1)
	it("트랜잭션 질의가 시간 제한에 걸린 뒤의 저장은 다른 연결에서 보이고 열린 트랜잭션이 남지 않는다", async () => {
		const ownerId = `tx-timeout-${Date.now()}`;
		const db = createDb({ DATABASE_URL: url as string });
		const admin = createDb({ DATABASE_URL: url as string });
		const holder = await admin.$client.connect();
		const open = async () =>
			(
				await admin.$client.query(
					"select pid from pg_stat_activity where datname = current_database() and state like 'idle in transaction%'",
				)
			).rows;
		try {
			await admin.insert(channel).values({ ownerId, name: "잠긴 채널" });
			await holder.query("begin");
			await holder.query(
				"select 1 from channel where owner_id = $1 for update",
				[ownerId],
			);
			await expect(
				db.transaction((tx) =>
					tx
						.update(channel)
						.set({ memo: "늦은 쓰기" })
						.where(eq(channel.ownerId, ownerId)),
				),
			).rejects.toThrow();
			await holder.query("rollback");
			// 잠금이 풀린 뒤 서버가 밀린 쓰기를 마칠 시간
			await new Promise((resolve) => setTimeout(resolve, 300));
			await db.insert(channel).values({ ownerId, name: "새 채널" });
			const seen = await admin
				.select({ name: channel.name, memo: channel.memo })
				.from(channel)
				.where(eq(channel.ownerId, ownerId))
				.orderBy(channel.name);
			expect(seen).toEqual([
				{ name: "새 채널", memo: null },
				{ name: "잠긴 채널", memo: null },
			]);
			expect(await open()).toEqual([]);
		} finally {
			holder.release(true);
			await db.$client.end();
			await admin.delete(channel).where(eq(channel.ownerId, ownerId));
			await admin.$client.end();
		}
	}, 20_000);

	// 연결을 버린 뒤의 release(두 번째 시간 제한, drizzle의 finally)는 예외를 내지 않아야 한다
	it("트랜잭션의 두 질의가 함께 시간 제한에 걸려도 unhandledRejection이 없고 풀 자리가 남아 다음 질의가 된다", async () => {
		const db = createDb({ DATABASE_URL: quick(url as string) });
		const unhandled: string[] = [];
		const onUnhandled = (error: Error) => unhandled.push(error.message);
		process.on("unhandledRejection", onUnhandled);
		try {
			const error = await db
				.transaction((tx) =>
					Promise.all([
						tx.execute(sql`select pg_sleep(2)`),
						tx.execute(sql`select pg_sleep(2)`),
					]),
				)
				.catch((reason: unknown) => reason);
			// 처리되지 않은 거절이 올라올 시간
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(unhandled).toEqual([]);
			expect(String(error)).not.toContain("already been released");
			expect(error).toBeInstanceOf(Error);
			expect(db.$client.totalCount - db.$client.idleCount).toBe(0);
			expect((await db.$client.query("select 1 as one")).rows).toEqual([
				{ one: 1 },
			]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
			await db.$client.end();
		}
	}, 20_000);

	// begin이 시간 제한이나 끊김으로 실패하면 풀 자리가 영구히 새고, 그 연결이 끊기면 'error'를 받을 곳이 없어 서버가 죽는다(D2)
	const survivesFailedBegin = async (kind: "stall" | "cut") => {
		const ownerId = `begin-${kind}-${Date.now()}`;
		const target = new URL(url as string);
		// 고장을 흉내 내는 프록시. stall은 받은 데이터를 버리고(TCP는 살아 있고 DB만 답하지 않는다) cut은 begin을 받으면 소켓을 끊는다
		let fault: "stall" | "cut" | null = null;
		const sockets: net.Socket[] = [];
		const server = net.createServer((near) => {
			const far = net.connect(Number(target.port || 5432), target.hostname);
			sockets.push(near, far);
			for (const [from, to] of [
				[near, far],
				[far, near],
			] as const) {
				from.on("data", (data) => {
					if (fault === "cut" && data.includes("begin")) from.destroy();
					else if (fault !== "stall") to.write(data);
				});
				from.on("error", () => {});
				from.on("close", () => to.destroy());
			}
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", () => resolve()),
		);
		const proxied = new URL(target);
		proxied.hostname = "127.0.0.1";
		proxied.port = String((server.address() as net.AddressInfo).port);
		const db = createDb({ DATABASE_URL: quick(proxied.href) });
		const admin = createDb({ DATABASE_URL: url as string });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const uncaught: string[] = [];
		const onUncaught = (error: Error) => uncaught.push(error.message);
		process.on("uncaughtException", onUncaught);
		const save = (name: string) =>
			db
				.transaction((tx) => tx.insert(channel).values({ ownerId, name }))
				.then(
					() => "저장됨",
					() => "실패",
				);
		try {
			// 풀 자리 10개를 모두 연결해 둔다
			await Promise.all(
				Array.from({ length: 10 }, () =>
					db.$client.query("select pg_sleep(0.1)"),
				),
			);
			fault = kind;
			const failed = await Promise.all(
				Array.from({ length: 10 }, (_, i) => save(`실패 ${i}`)),
			);
			fault = null;
			const next = await save("살아난 뒤");
			for (const socket of sockets) socket.destroy();
			// 끊긴 소켓의 'error'가 올라올 시간
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect({ failed: new Set(failed), next, uncaught }).toEqual({
				failed: new Set(["실패"]),
				next: "저장됨",
				uncaught: [],
			});
			expect(
				await admin
					.select({ name: channel.name })
					.from(channel)
					.where(eq(channel.ownerId, ownerId)),
			).toEqual([{ name: "살아난 뒤" }]);
		} finally {
			process.off("uncaughtException", onUncaught);
			server.close();
			// 자리가 샌 풀은 end()가 끝나지 않으므로 기다리지 않는다
			void db.$client.end();
			await admin.delete(channel).where(eq(channel.ownerId, ownerId));
			await admin.$client.end();
		}
	};
	it("begin이 10번 시간 초과된 뒤 DB가 살아나면 다음 저장이 성공하고 uncaughtException이 없다", async () => {
		await survivesFailedBegin("stall");
	}, 20_000);
	it("begin을 보내고 10번 끊긴 뒤 DB가 살아나면 다음 저장이 성공하고 uncaughtException이 없다", async () => {
		await survivesFailedBegin("cut");
	}, 20_000);
});
