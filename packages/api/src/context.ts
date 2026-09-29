import type { Database } from "@tts-pilot-app/db";

export type Context = {
	db: Database;
	// 서버가 정한 소유자. 지금은 로컬 관리자(owner.ts), 로그인(T14) 뒤에는 세션 사용자다.
	ownerId: string | null;
};
