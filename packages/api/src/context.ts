import type { Database } from "@tts-pilot-app/db";

import type { Providers } from "./providers/index";

export type Context = {
	db: Database;
	// 서버가 정한 소유자. 세션 사용자의 이메일이 OWNER_EMAILS의 이메일 한 개와 같을 때만 그 user.id다(owner.ts).
	ownerId: string | null;
	// 키가 든 공급자 클라이언트. 소유자가 있는 요청에만 만든다(apps/web/src/context.ts). 소유자가 없으면 null이다.
	providers: Providers | null;
	// 응답 뒤 작업(늦은 결과 저장). /api/rpc 라우트가 Next after로 채운다. 없으면 기다리지 않는다(로컬·테스트는 프로세스가 살아 있어 그대로 끝난다, ADR 0013)
	defer?: (task: Promise<unknown>) => void;
};
