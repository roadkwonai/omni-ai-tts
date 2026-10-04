import type { RouterClient } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
	providerIdSchema,
	providerStatusResultSchema,
} from "../providers/contract";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	// 공급자 하나의 연결 상태. 공급자 문제는 던지지 않고 상태 값으로 돌려준다. 던지는 것은 UNAUTHORIZED·BAD_REQUEST뿐이다.
	providerStatus: protectedProcedure
		.input(z.object({ provider: providerIdSchema }))
		.output(providerStatusResultSchema)
		.handler(({ input, context }) => {
			const client = context.providers?.[input.provider];
			if (!client) {
				// 키가 없으면 공급자를 부르지 않는다.
				return {
					provider: input.provider,
					status: "no_key" as const,
					quota: null,
					providerCode: null,
					retryAfterSeconds: null,
					checkedAt: new Date().toISOString(),
				};
			}
			return client.checkStatus();
		}),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
