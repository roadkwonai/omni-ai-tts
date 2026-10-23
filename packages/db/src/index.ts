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
	return db;
}

export type Database = ReturnType<typeof createDb>;
