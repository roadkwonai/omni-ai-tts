import { ORPCError, onError, ValidationError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { pathToString } from "@tts-pilot-app/api/providers/errors";
import { appRouter } from "@tts-pilot-app/api/routers/index";
import type { NextRequest } from "next/server";

import { createContext } from "../../../../context";

// 로컬 관리자 모드에는 로그인 쿠키가 없다. 다른 사이트가 이 API를 부르지 못하게 JS가 붙이는 헤더를 요구한다.
const rpcHandler = new RPCHandler(appRouter, {
	plugins: [new SimpleCsrfProtectionHandlerPlugin()],
	interceptors: [
		onError((error) => {
			// 의도한 4xx 거절(CSRF 403, UNAUTHORIZED, BAD_REQUEST)은 남기지 않는다(AF-11). 그 밖의 오류만 남긴다.
			if (error instanceof ORPCError && error.status < 500) return;
			// 출력 검증 실패의 cause(ValidationError)는 data에 응답 값이 들어 있다. 코드·메시지·이슈 경로만 한 줄 남긴다.
			if (
				error instanceof ORPCError &&
				error.cause instanceof ValidationError
			) {
				const paths = error.cause.issues.map((issue) =>
					pathToString(issue.path),
				);
				console.error(
					`[rpc] ${error.code} ${error.message}: ${paths.join(", ")}`,
				);
				return;
			}
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
