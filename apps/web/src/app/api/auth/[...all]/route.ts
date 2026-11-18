import { toNextJsHandler } from "better-auth/next-js";

import { ENV } from "../../../../env.server";
import { auth } from "../../../../services";

const handlers = toNextJsHandler(auth);

// 공개 데모(T15-a2)에는 로그인·가입·로그아웃이 없다. Better Auth를 부르지 않고 모든 경로를 404로 닫는다.
// 내보내는 메서드는 전과 같이 GET·POST뿐이다(HEAD는 GET을 따르고, 그 밖의 메서드는 Next가 405로 답해 Better Auth에 닿지 않는다).
const gate =
	(handler: (request: Request) => Promise<Response>) => (request: Request) =>
		ENV.APP_MODE === "demo"
			? new Response(null, { status: 404 })
			: handler(request);

export const GET = gate(handlers.GET);
export const POST = gate(handlers.POST);
