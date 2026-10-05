import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

// 시간 제한 3초: DB 컨테이너가 포트는 받는데 응답하지 않으면 목록 캐시가 기다리지 않고 캐시 없이 공급자를 부른다(T4 스펙 4절).
// connectionTimeoutMillis는 새 연결에만 걸리고, 풀의 기존 연결로 보낸 질의는 query_timeout이 끊는다.
export function createDb(env: DatabaseConfig) {
	return drizzle({
		connection: {
			connectionString: env.DATABASE_URL,
			connectionTimeoutMillis: 3000,
			query_timeout: 3000,
		},
		relations,
	});
}

export type Database = ReturnType<typeof createDb>;
