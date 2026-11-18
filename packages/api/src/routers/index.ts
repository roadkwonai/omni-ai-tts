import type { RouterClient } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
	accentListSchema,
	accentSchema,
	conditionValueSchema,
	providerIdSchema,
	providerStatusResultSchema,
	voiceListInputSchema,
	voiceListPageSchema,
	voiceListResultSchema,
} from "../providers/contract";
import { providerError } from "../providers/errors";
import { cachedList, expireProvider } from "../voice-cache";
import { classificationRouter } from "./classification";
import { dramaRouter } from "./drama";
import { myVoiceRouter } from "./my-voice";
import { presetRouter } from "./preset";
import { savedVoiceRouter } from "./saved-voice";
import { scriptRouter } from "./script";
import { studioRouter } from "./studio";
import { trialRouter } from "./trial";

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
	// 성우 목록 한 페이지(T4 스펙 3·5절). 목록 캐시를 거친다. 공급자 문제는 사유를 붙여 던지고, 지난 목록이 있으면 stale로 돌려준다.
	voiceList: protectedProcedure
		.input(voiceListInputSchema)
		.output(voiceListResultSchema)
		.handler(async ({ input, context }) => {
			// 입력의 공급자로 그 공급자의 클라이언트를 고른다(공급자 구현은 자기 입력 모양만 받는다)
			const listVoices = context.providers?.[input.provider]?.listVoices;
			// 키가 없으면 공급자와 DB를 부르지 않는다.
			if (!listVoices) throw providerError(input.provider, "no_key");
			// Typecast·Airy는 출처가 공개 하나라 입력에 출처가 없다
			const source = "source" in input ? input.source : "public";
			const { value, fetchedAt, stale } = await cachedList(
				context.db,
				// 계정 목록만 소유자로 나눈다. 소유자는 서버가 정한 값뿐이다(입력에 없다)
				source === "account"
					? {
							ownerId: context.ownerId,
							provider: input.provider,
							kind: "account",
						}
					: { ownerId: null, provider: input.provider, kind: "public" },
				input,
				voiceListPageSchema,
				() => listVoices(input),
			);
			return { provider: input.provider, source, ...value, fetchedAt, stale };
		}),
	// ElevenLabs 억양 목록(억양 조건의 선택지). 공개 캐시를 쓴다.
	voiceAccents: protectedProcedure
		.input(z.object({ language: conditionValueSchema }))
		.output(accentListSchema)
		.handler(async ({ input, context }) => {
			const listAccents = context.providers?.elevenlabs?.listAccents;
			if (!listAccents) throw providerError("elevenlabs", "no_key");
			const { value, fetchedAt, stale } = await cachedList(
				context.db,
				{ ownerId: null, provider: "elevenlabs", kind: "accents" },
				input,
				z.array(accentSchema),
				() => listAccents(input.language),
			);
			return { language: input.language, accents: value, fetchedAt, stale };
		}),
	// '목록 새로 고침'(T4 스펙 5절). 공급자를 부르지 않는다. 화면이 이어서 그 공급자의 열린 목록(지금 목록과 '전체' 묶음)을 다시 받는다.
	voiceListRefresh: protectedProcedure
		.input(z.object({ provider: providerIdSchema }))
		.output(z.object({ retryAt: z.iso.datetime().nullable() }))
		.handler(({ input, context }) =>
			expireProvider(context.db, input.provider, context.ownerId),
		),
	// 시험 생성 여섯 프로시저(T5)
	...trialRouter,
	...classificationRouter,
	...savedVoiceRouter,
	// 프리셋 여섯 프로시저(T8)
	...presetRouter,
	// 음성 작업실 네 프로시저(T9, T10 studioFindMany)
	...studioRouter,
	// 드라마 작업실 네 프로시저(T9.5)
	...dramaRouter,
	// 대본 보관함 여덟 프로시저(T12)
	...scriptRouter,
	// 내 보이스 다섯 프로시저(T13)
	...myVoiceRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
