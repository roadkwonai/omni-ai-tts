import type { Context } from "@tts-pilot-app/api/context";
import { localOwnerId } from "@tts-pilot-app/api/owner";

import { ENV } from "./env.server";
import { db } from "./services";

// 로그인(T14) 전에는 로컬 관리자 모드다. T14에서 이 함수가 세션과 허용 목록으로 소유자를 정한다.
export function createContext(req: Request): Context {
	return { db, ownerId: localOwnerId(ENV.NODE_ENV, req.headers.get("host")) };
}
