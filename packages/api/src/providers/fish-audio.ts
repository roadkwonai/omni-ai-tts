import { z } from "zod";

import {
	logFailure,
	type ProviderClient,
	ProviderHttpError,
	runCheck,
} from "./errors";

// Fish Audio는 SDK가 초기판이라 REST를 직접 부른다(ADR 0002).
const FISH_AUDIO_HOST = "https://api.fish.audio";

// credit은 문자열로 온다. 숫자 모양일 때만 받는다. z.coerce.number()는 ""를 0으로 바꾸므로 쓰지 않는다.
const creditSchema = z.object({ credit: z.string().regex(/^\d+(\.\d+)?$/) });
// 웹 플랜(구독 패키지). balance가 total보다 클 수 있다(extra_balance 포함, 2026-10-04 실측).
// type은 화면에 그대로 찍히므로 1~40자만 받는다.
const packageSchema = z
	.object({
		type: z.string().trim().min(1).max(40),
		balance: z.number(),
		total: z.number(),
	})
	.transform(({ type, balance, total }) => ({
		plan: type,
		remaining: balance,
		total,
	}));

export function createFishAudio(apiKey: string): ProviderClient {
	const getJson = async (path: string, signal: AbortSignal) => {
		const response = await fetch(`${FISH_AUDIO_HOST}${path}`, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal,
		});
		if (!response.ok) {
			throw new ProviderHttpError(
				response.status,
				[],
				response.headers.get("retry-after"),
			);
		}
		return response.json();
	};
	return {
		checkStatus: () =>
			runCheck("fish_audio", async (signal) => {
				const { credit } = creditSchema.parse(
					await getJson("/wallet/self/api-credit", signal),
				);
				// 웹 플랜은 덧붙이는 정보라 실패해도 연결 상태는 잔액 조회로 정한다. 잔액 조회가 실패하면 부르지 않는다.
				// ponytail: 10초 제한은 두 호출을 합친 시간이라, 웹 플랜이 늦어 넘기면 잔액을 받았어도 확인 실패다. 자주 보이면 웹 플랜을 runCheck 밖에서 따로 제한한다.
				const webCredit = await getJson("/wallet/self/package", signal)
					.then((body) => packageSchema.parse(body))
					.catch((error: unknown) => {
						// 시간 초과로 끊긴 것은 runCheck가 확인 실패로 돌려주고 로그를 남기지 않는다.
						if (!signal.aborted) {
							logFailure(
								"[providerStatus] fish_audio 웹 플랜 조회 실패",
								error,
							);
						}
						return undefined;
					});
				return {
					// 잔액 0도 연결됨이다. 무료 크레딧과 패키지 잔액이 따로 있어 이 값만으로는 생성 가능 여부를 모른다. 한도 부족은 402뿐이다.
					status: "connected",
					quota: {
						remaining: Number(credit),
						total: null,
						plan: null,
						resetAt: null,
						overageAllowed: false,
						webCredit,
					},
				};
			}),
	};
}
