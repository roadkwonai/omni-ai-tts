import { ORPCError, onError, ValidationError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import type { ProviderErrorData } from "@tts-pilot-app/api/providers/contract";
import { pathToString } from "@tts-pilot-app/api/providers/errors";
import { appRouter } from "@tts-pilot-app/api/routers/index";
import { after, type NextRequest } from "next/server";

import { createContext } from "../../../../context";

// Vercel Hobby 함수 최대 300초. 응답 뒤 작업(after, 늦은 결과 저장)도 이 시간 안에서만 돈다(ADR 0013)
export const maxDuration = 300;

// 세션 쿠키가 있어도 SimpleCsrf 헤더가 다른 사이트 요청을 막는다(JS가 붙이는 헤더를 요구한다).
const rpcHandler = new RPCHandler(appRouter, {
	plugins: [new SimpleCsrfProtectionHandlerPlugin()],
	interceptors: [
		onError((error) => {
			// 의도한 4xx 거절(CSRF 403, UNAUTHORIZED, BAD_REQUEST, 공급자 412·429)은 남기지 않는다(AF-11).
			if (error instanceof ORPCError && error.status < 500) return;
			if (error instanceof ORPCError) {
				// 사유가 붙은 공급자 문제(BAD_GATEWAY·GATEWAY_TIMEOUT)는 runList가 필요한 것만 남겼다. 코드·공급자·사유만 한 줄 남긴다.
				const data = error.data as Partial<ProviderErrorData> | undefined;
				if (typeof data?.reason === "string") {
					console.error(`[rpc] ${error.code} ${data.provider} ${data.reason}`);
					return;
				}
				// 출력 검증 실패의 cause(ValidationError)는 data에 응답 값이 들어 있다. 코드·고정 표식·필드 경로만 남긴다.
				if (error.cause instanceof ValidationError) {
					const paths = error.cause.issues.map((issue) =>
						pathToString(issue.path),
					);
					console.error(`[rpc] ${error.code} validation ${paths.join(", ")}`);
					return;
				}
			}
			console.error(
				`[rpc] ${error instanceof ORPCError ? error.code : "UNEXPECTED_ERROR"}`,
			);
		}),
	],
});

async function handleRequest(req: NextRequest) {
	const { response } = await rpcHandler.handle(req, {
		prefix: "/api/rpc",
		context: {
			...(await createContext(req)),
			defer: (task) => after(() => task),
		},
	});
	return response ?? new Response("Not found", { status: 404 });
}

// RPC 프로토콜은 GET·POST만 쓴다.
export const GET = handleRequest;
export const POST = handleRequest;
