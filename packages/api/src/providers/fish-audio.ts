import { z } from "zod";

import { type ProviderClient, ProviderHttpError, runCheck } from "./errors";

// Fish Audio는 SDK가 초기판이라 REST를 직접 부른다(ADR 0002).
const FISH_AUDIO_HOST = "https://api.fish.audio";

// credit은 문자열로 온다. 숫자 모양일 때만 받는다. z.coerce.number()는 ""를 0으로 바꾸므로 쓰지 않는다.
const creditSchema = z.object({ credit: z.string().regex(/^\d+(\.\d+)?$/) });

export function createFishAudio(apiKey: string): ProviderClient {
	return {
		checkStatus: () =>
			runCheck("fish_audio", async (signal) => {
				const response = await fetch(
					`${FISH_AUDIO_HOST}/wallet/self/api-credit`,
					{
						headers: { Authorization: `Bearer ${apiKey}` },
						signal,
					},
				);
				if (!response.ok) {
					throw new ProviderHttpError(
						response.status,
						[],
						response.headers.get("retry-after"),
					);
				}
				const { credit } = creditSchema.parse(await response.json());
				return {
					// 잔액 0도 연결됨이다. 무료 크레딧과 패키지 잔액이 따로 있어 이 값만으로는 생성 가능 여부를 모른다. 한도 부족은 402뿐이다.
					status: "connected",
					quota: {
						remaining: Number(credit),
						total: null,
						plan: null,
						resetAt: null,
						overageAllowed: false,
					},
				};
			}),
	};
}
