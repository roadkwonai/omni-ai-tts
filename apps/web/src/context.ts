import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Context } from "@tts-pilot-app/api/context";
import {
	createDemoProviders,
	type DemoSample,
} from "@tts-pilot-app/api/demo/client";
import { demoOwner, ownerEmailFrom, ownerIdOf } from "@tts-pilot-app/api/owner";
import { createProviders } from "@tts-pilot-app/api/providers/index";
import { headers } from "next/headers";
import { cache } from "react";

import { ENV } from "./env.server";
import { auth, db } from "./services";

// 공개 데모의 샘플 파일(apps/web/public/samples). Vercel 함수에는 next.config outputFileTracingIncludes로 실린다
const DEMO_SAMPLE_FILES: Record<DemoSample, string> = {
	typecast: "typecast.mp3",
	elevenlabs: "elevenlabs.mp3",
	fish_audio: "fish_audio.mp3",
	airy: "airy.mp3",
	gemini: "gemini.wav",
	drama: "drama.pcm",
};
const loadDemoSample = (name: DemoSample) =>
	readFile(path.join(process.cwd(), "public/samples", DEMO_SAMPLE_FILES[name]));

export type OwnerSession =
	| { state: "none" }
	| { state: "denied"; email: string }
	| { state: "owner"; userId: string; email: string };

// 공급자·OpenAI 키 목록의 한 벌. 데모 닫힘 검사와 createProviders가 같이 쓴다. 요청마다 ENV를 읽는다
const providerKeys = () => ({
	typecast: ENV.TYPECAST_API_KEY,
	elevenlabs: ENV.ELEVENLABS_API_KEY,
	fish_audio: ENV.FISH_AUDIO_API_KEY,
	airy: ENV.AIRY_API_KEY,
	gemini: ENV.GEMINI_API_KEY,
	openai: ENV.OPENAI_API_KEY,
});

// 공개 데모가 본인용 DB를 가리키면 닫는다. 읽지 못하는 주소나 빈 DEMO_DB_HOST도 닫힘이다
const isDemoDb = () => {
	if (!ENV.DEMO_DB_HOST) return false;
	try {
		return new URL(ENV.DATABASE_URL).hostname === ENV.DEMO_DB_HOST;
	} catch {
		return false;
	}
};

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
	if (ENV.APP_MODE === "demo") {
		// 공개 데모(T15-a2): 세션을 읽지 않고 예시 소유자로 연다. 키가 하나라도 있으면 닫힌다(demoOwner).
		if (!isDemoDb()) return { state: "none" };
		const hasKey = Object.values(providerKeys()).some(Boolean);
		const demo = await demoOwner(db, ENV.OWNER_EMAILS, hasKey);
		// 데모는 이메일을 화면으로 넘기지 않는다
		return demo
			? { state: "owner", userId: demo.userId, email: "" }
			: { state: "none" };
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
		// 공개 데모는 공급자를 부르지 않는 데모 클라이언트(샘플 바이트)다
		providers: !ownerId
			? null
			: ENV.APP_MODE === "demo"
				? createDemoProviders(loadDemoSample)
				: createProviders(providerKeys()),
	};
}
