import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { providerError, trialError } from "../providers/errors";
import {
	type TrialErrorData,
	trialModelRateSchema,
} from "../providers/trial-contract";
import type { TrialRequest } from "../providers/trial-options";
import { withStorage } from "../trial";
import { cachedList, cooldownOf } from "../voice-cache";

// ElevenLabs 모델 크레딧 배율. 목록 캐시(24시간, 소유자 없음)를 거친다
export async function elevenLabsRates(context: Context) {
	const listModels = context.providers?.elevenlabs?.listModels;
	if (!listModels) throw providerError("elevenlabs", "no_key");
	return cachedList(
		context.db,
		{ ownerId: null, provider: "elevenlabs", kind: "models" },
		{},
		z.array(trialModelRateSchema),
		listModels,
	);
}

// 유료 호출 직전의 배율과 두 번째 대기 시각 확인(시험 생성·작업실 공통). 배율 없으면 null
export async function rateFor(
	context: Context,
	request: TrialRequest,
	prefix = "[trial]",
): Promise<number | null> {
	const { db } = context;
	const { provider } = request;
	// 일반 배율 조회 실패는 배율 1로 계속하지만 429와 대기 시각은 버리지 않는다.
	let rate: number | null = null;
	let modelRetryAt: string | null | undefined;
	if (request.provider === "elevenlabs") {
		try {
			const models = await elevenLabsRates(context);
			rate =
				models.value.find((r) => r.model === request.settings.model)
					?.multiplier ?? null;
			if (models.stale?.reason === "rate_limit")
				modelRetryAt = models.stale.retryAt;
		} catch (error) {
			const data =
				error instanceof ORPCError
					? (error.data as Partial<TrialErrorData> | undefined)
					: undefined;
			if (data?.reason === "rate_limit") modelRetryAt = data.retryAt ?? null;
		}
	}
	const latestUntil = await withStorage(
		provider,
		() => cooldownOf(db, provider, new Date()),
		prefix,
	);
	if (latestUntil)
		throw trialError(provider, "rate_limit", {
			retryAt: latestUntil.toISOString(),
		});
	if (modelRetryAt !== undefined)
		throw trialError(provider, "rate_limit", {
			retryAt: modelRetryAt ?? undefined,
		});
	return rate;
}
