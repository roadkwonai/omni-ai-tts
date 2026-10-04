import type { Database } from "@tts-pilot-app/db";

import type { Providers } from "./providers/index";

export type Context = {
	db: Database;
	// 서버가 정한 소유자. 지금은 로컬 관리자(owner.ts), 로그인(T14) 뒤에는 세션 사용자다.
	ownerId: string | null;
	// 키가 든 공급자 클라이언트. 소유자가 있는 요청에만 만든다(apps/web/src/context.ts). 소유자가 없으면 null이다.
	providers: Providers | null;
};
