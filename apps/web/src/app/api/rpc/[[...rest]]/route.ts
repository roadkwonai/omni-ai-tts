import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { appRouter } from "@tts-pilot-app/api/routers/index";
import type { NextRequest } from "next/server";

import { createContext } from "../../../../context";

// 로컬 관리자 모드에는 로그인 쿠키가 없다. 다른 사이트가 이 API를 부르지 못하게 JS가 붙이는 헤더를 요구한다.
const rpcHandler = new RPCHandler(appRouter, {
	plugins: [new SimpleCsrfProtectionHandlerPlugin()],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

async function handleRequest(req: NextRequest) {
	const { response } = await rpcHandler.handle(req, {
		prefix: "/api/rpc",
		context: createContext(req),
	});
	return response ?? new Response("Not found", { status: 404 });
}

// RPC 프로토콜은 GET·POST만 쓴다.
export const GET = handleRequest;
export const POST = handleRequest;
