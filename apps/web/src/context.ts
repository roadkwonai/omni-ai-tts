import type { Context } from "@tts-pilot-app/api/context";
import { localOwnerId } from "@tts-pilot-app/api/owner";
import { createProviders } from "@tts-pilot-app/api/providers/index";

import { ENV } from "./env.server";
import { db } from "./services";

// 로그인(T14) 전에는 로컬 관리자 모드다. T14에서 이 함수가 세션과 허용 목록으로 소유자를 정한다.
export function createContext(req: Request): Context {
	const ownerId = localOwnerId(ENV.NODE_ENV, req.headers.get("host"));
	return {
		db,
		ownerId,
		// 키가 든 공급자 클라이언트는 소유자가 있는 요청에만 만든다. 요청마다 ENV를 읽어 .env의 키 교체를 반영한다.
		providers: ownerId
			? createProviders({
					typecast: ENV.TYPECAST_API_KEY,
					elevenlabs: ENV.ELEVENLABS_API_KEY,
					fish_audio: ENV.FISH_AUDIO_API_KEY,
					airy: ENV.AIRY_API_KEY,
					gemini: ENV.GEMINI_API_KEY,
				})
			: null,
	};
}
