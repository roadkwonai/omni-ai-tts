import { TypecastAPIError, TypecastClient } from "@neosapience/typecast-js";
import { z } from "zod";

import { type ProviderClient, ProviderHttpError, runCheck } from "./errors";

// Typecast SDK는 응답을 검사하지 않는다. 쓰는 필드만 검사한다.
const subscriptionSchema = z.object({
	plan: z.string(),
	credits: z.object({ plan_credits: z.number(), used_credits: z.number() }),
});

export function createTypecast(apiKey: string): ProviderClient {
	// 키와 공식 호스트를 명시한다. 빠지면 SDK가 TYPECAST_API_KEY·TYPECAST_API_HOST로 대체한다.
	// source·generatedBy는 Typecast llms.txt의 연동 식별 규약이다(사용자 정보는 넣지 않는다).
	const client = new TypecastClient({
		apiKey,
		baseHost: "https://api.typecast.ai",
		source: "api-docs",
		generatedBy: "claude-code",
	});
	return {
		checkStatus: () =>
			// ponytail: SDK에 취소 옵션이 없어 runCheck의 10초 경주로만 끊는다. 끊긴 요청은 뒤에서 끝까지 돈다(상태를 바꾸지 않는 조회라 괜찮다). 목록·생성(T3·T8)은 끊는 방법을 그때 다시 정한다.
			runCheck("typecast", async () => {
				const raw = await client.getMySubscription().catch((error: unknown) => {
					// SDK 오류는 응답 헤더를 주지 않는다(Retry-After 없음).
					throw error instanceof TypecastAPIError
						? new ProviderHttpError(error.statusCode)
						: error;
				});
				const { plan, credits } = subscriptionSchema.parse(raw);
				const remaining = credits.plan_credits - credits.used_credits;
				return {
					status: remaining <= 0 ? "quota" : "connected",
					quota: {
						remaining,
						total: credits.plan_credits,
						plan,
						resetAt: null,
						overageAllowed: false,
					},
				};
			}),
	};
}
