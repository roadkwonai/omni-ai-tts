import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

// 시간 제한 3초: DB 컨테이너가 포트는 받는데 응답하지 않으면 목록 캐시가 기다리지 않고 캐시 없이 공급자를 부른다(T4 스펙 4절).
// connectionTimeoutMillis는 새 연결에만 걸리고, 풀의 기존 연결로 보낸 질의는 query_timeout이 끊는다.
export function createDb(env: DatabaseConfig) {
	const db = drizzle({
		connection: {
			connectionString: env.DATABASE_URL,
			connectionTimeoutMillis: 3000,
			query_timeout: 3000,
		},
		relations,
	});
	// DB가 쉬는 연결을 끊으면(컨테이너 정지, Neon 유휴 끊김) 풀이 'error'를 보낸다. 받을 곳이 없으면 uncaughtException으로 서버가 죽는다.
	// 풀은 그 연결을 이미 버렸고 다음 질의는 새로 붙으므로 한 줄만 남긴다(T7-01).
	db.$client.on("error", (error) => {
		console.error(`[db] 쉬는 연결 오류: ${error.message}`);
	});
	// 시간 제한에 걸린 연결은 열린 트랜잭션째 풀로 돌아가 다음 저장을 삼키고(D1), drizzle은 begin이 실패하면 연결을 돌려주지 않는다(D2). 그 연결은 버린다.
	// pg 오류 문구와 drizzle의 begin·release 호출에 기대므로 packages/api/src/db-client.test.ts가 이 계약을 지킨다.
	db.$client.on("connect", (client) => {
		// 빌린 동안에는 풀의 오류 처리기가 없다. 오류는 질의가 받으므로 uncaughtException만 막는다.
		client.on("error", () => {});
		client.query = new Proxy(client.query, {
			apply(query, self, args) {
				const result: unknown = Reflect.apply(query, self, args);
				if (result instanceof Promise) {
					result.catch((error: Error) => {
						if (
							error.message !== "Query read timeout" &&
							!/^begin\b/i.test(args[0].text ?? args[0])
						) {
							return;
						}
						const { release } = client;
						// drizzle의 finally나 함께 보낸 질의의 시간 제한이 다시 불러도 예외를 내지 않게 한다.
						client.release = () => {};
						release(error);
					});
				}
				return result;
			},
		});
	});
	return db;
}

export type Database = ReturnType<typeof createDb>;
