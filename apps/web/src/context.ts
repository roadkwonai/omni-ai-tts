import type { Context } from "@tts-pilot-app/api/context";
import { ownerEmailFrom, ownerIdOf } from "@tts-pilot-app/api/owner";
import { createProviders } from "@tts-pilot-app/api/providers/index";
import { headers } from "next/headers";
import { cache } from "react";

import { ENV } from "./env.server";
import { auth, db } from "./services";

export type OwnerSession =
	| { state: "none" }
	| { state: "denied"; email: string }
	| { state: "owner"; userId: string; email: string };

let warnedTooMany = false;

// 세션과 OWNER_EMAILS 한 개로 소유자를 정한다(T14). 세션 읽기 오류(DB 멈춤)는 잡지 않고 그대로 던진다.
// refresh는 쿠키를 쓸 수 있는 Route Handler(/api/rpc)에서만 켠다. Server Component는 쿠키를 못 써서 갱신하면 DB만 바뀐다.
export async function readOwner(
	headers: Headers,
	refresh: boolean,
): Promise<OwnerSession> {
	if (!warnedTooMany && ownerEmailFrom(ENV.OWNER_EMAILS).tooMany) {
		warnedTooMany = true;
		console.warn("[auth] OWNER_EMAILS에 이메일이 둘 이상이라 모두 거부합니다");
	}
	const session = await auth.api.getSession({
		headers,
		query: { disableRefresh: !refresh },
	});
	if (!session) return { state: "none" };
	const { email } = session.user;
	const userId = ownerIdOf(session.user, ENV.OWNER_EMAILS);
	return userId
		? { state: "owner", userId, email }
		: { state: "denied", email };
}

// Server Component(layout·page)용. 한 요청 안에서는 한 번만 읽고 세션을 갱신하지 않는다.
export const getOwnerSession = cache(async () =>
	readOwner(await headers(), false),
);

export async function createContext(req: Request): Promise<Context> {
	const owner = await readOwner(req.headers, true);
	const ownerId = owner.state === "owner" ? owner.userId : null;
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
					openai: ENV.OPENAI_API_KEY,
				})
			: null,
	};
}
