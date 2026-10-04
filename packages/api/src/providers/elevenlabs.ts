import {
	ElevenLabsClient,
	ElevenLabsEnvironment,
	ElevenLabsError,
} from "@elevenlabs/elevenlabs-js";
import { z } from "zod";

import { type ProviderClient, ProviderHttpError, runCheck } from "./errors";

// 오류 본문 {"detail":{"code","status",...}}에서 코드 후보를 뽑는다(권한 부족은 둘 중 하나에 온다).
const errorBodySchema = z.object({
	detail: z.object({
		code: z.string().optional(),
		status: z.string().optional(),
	}),
});

function detailCodes(body: unknown): string[] {
	const parsed = errorBodySchema.safeParse(body);
	if (!parsed.success) return [];
	const { code, status } = parsed.data.detail;
	return [code, status].filter((value): value is string => Boolean(value));
}

export function createElevenLabs(apiKey: string): ProviderClient {
	// 키와 공식 호스트를 명시한다. 키가 빠지면 SDK가 ELEVENLABS_API_KEY로 대체하고, 그래도 없으면 생성자가 던진다.
	const client = new ElevenLabsClient({
		apiKey,
		environment: ElevenLabsEnvironment.Production,
	});
	return {
		checkStatus: () =>
			runCheck("elevenlabs", async (signal) => {
				// SDK가 응답 전체를 검사한다. 필수 필드가 없거나 숫자가 아니면 ParseError를 던져 확인 실패가 된다.
				// 재시도는 끈다(기본 2회). 시간 제한은 SDK timeoutInSeconds 대신 runCheck의 신호로 한다.
				const subscription = await client.user.subscription
					.get({ maxRetries: 0, abortSignal: signal })
					.catch((error: unknown) => {
						throw error instanceof ElevenLabsError &&
							error.statusCode !== undefined
							? new ProviderHttpError(
									error.statusCode,
									detailCodes(error.body),
									error.rawResponse?.headers.get("retry-after") ?? null,
								)
							: error;
					});
				const { characterCount, characterLimit, maxCreditLimitExtension } =
					subscription;
				const remaining = characterLimit - characterCount;
				// 확장("unlimited" 또는 0이 아닌 수)이 있으면 한도를 넘어도 생성될 수 있어 한도 부족이 아니다.
				const overageAllowed = maxCreditLimitExtension !== 0;
				const resetUnix = subscription.nextCharacterCountResetUnix;
				return {
					status: remaining <= 0 && !overageAllowed ? "quota" : "connected",
					quota: {
						remaining,
						total: characterLimit,
						plan: null,
						resetAt:
							resetUnix === undefined
								? null
								: new Date(resetUnix * 1000).toISOString(),
						overageAllowed,
					},
				};
			}),
	};
}
