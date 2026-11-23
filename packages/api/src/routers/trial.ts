import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { DRAMA_LINES_MAX } from "../drama-script";
import { protectedProcedure } from "../index";
import { providerIdSchema } from "../providers/contract";
import { trialError } from "../providers/errors";
import {
	trialAudioSchema,
	trialCreateInputSchema,
	trialFoundSchema,
	trialItemSchema,
	trialModelRateSchema,
	trialRequestSchema,
	voiceIdSchema,
} from "../providers/trial-contract";
import {
	estimate,
	freeModelOpen,
	isFreeModel,
} from "../providers/trial-options";
import {
	studioRequestStatusInputSchema,
	studioRequestStatusSchema,
} from "../studio-contract";
import {
	audioFile,
	audioOf,
	audioTypeOf,
	claim,
	cloneBlocked,
	comboKey,
	complete,
	findMany,
	findRequest,
	findSaved,
	listResults,
	recordFailure,
	remove,
	replay,
	replayRequest,
	sweep,
	withStorage,
} from "../trial";
import { cooldownOf, guard } from "../voice-cache";
import { elevenLabsRates, rateFor } from "./rates";

// 공급자 응답 오디오 상한. 200자 MP3는 1MB 안팎이다(스펙 4절, Vercel 응답 4.5MB). Typecast MP3는 320kbps라
// 200자를 속도 0.5로 들으면 상한에 닿을 수 있다. 넘으면 이미 과금된 결과라도 버리고 "문장을 줄이거나 속도를 올려"를 보인다(계획 리뷰 E8). Gemini WAV는 1분 약 2.88MB라 약 87초에서 닿는다(T7.6)
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// 시험 생성('내 문장 듣기', T5 스펙 5절). 크레딧을 쓰는 길은 trialCreate 하나다. 나머지는 DB만 본다(trialModels는 무료 목록 조회)
export const trialRouter = {
	trialModels: protectedProcedure
		.output(z.object({ rates: z.array(trialModelRateSchema) }))
		.handler(async ({ context }) => ({
			rates: (await elevenLabsRates(context)).value,
		})),
	// 같은 조합의 저장된 결과. 공급자를 부르지 않는다
	trialFind: protectedProcedure
		.input(trialRequestSchema)
		.output(trialAudioSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(input.provider, () =>
				findSaved(context.db, context.ownerId, comboKey(input)),
			),
		),
	// 드라마 읽기: 줄 여러 개의 저장 여부를 한 번에(쿼리 1회, 순서 그대로). 공급자를 부르지 않고 보관 기한도 늘리지 않는다
	trialFindMany: protectedProcedure
		.input(z.array(trialRequestSchema).min(1).max(DRAMA_LINES_MAX))
		.output(z.array(trialFoundSchema.nullable()))
		.handler(({ input, context }) =>
			withStorage(undefined, () =>
				findMany(
					context.db,
					context.ownerId,
					input.map((request) => comboKey(request)),
				),
			),
		),
	// 요청 id의 상태(T19 CLI 중단 복구, studioRequest와 같은 모양). 없거나 남의 것이면 null. 공급자를 부르지 않고 쓰지 않는다
	trialRequest: protectedProcedure
		.input(studioRequestStatusInputSchema)
		.output(studioRequestStatusSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(undefined, () =>
				findRequest(context.db, context.ownerId, input.requestId, "trial"),
			),
		),
	trialCreate: protectedProcedure
		.input(trialCreateInputSchema)
		.output(trialAudioSchema)
		.handler(async ({ input: { requestId, request }, context }) => {
			const { provider } = request;
			const { db, ownerId } = context;
			// 무료 모델은 종료일(하루 이르게)부터 보내지 않는다. 공급자에서 없어진 모델 이름은 오류 없이 유료로 처리된다(스펙 13절)
			if (isFreeModel(request) && !freeModelOpen())
				throw trialError(provider, "free_ended");
			const synthesize = context.providers?.[provider]?.synthesize;
			if (!synthesize) throw trialError(provider, "no_key");
			const key = comboKey(request);
			const existing = await withStorage(provider, () =>
				replayRequest(db, ownerId, requestId, key, provider),
			);
			if (existing) return existing;
			// 삭제 대기·처리 중 클론과 남의 클론 id는 부르지 않는다(T13 계획 2.3). DB가 실패해도 부르지 않는다
			if (
				await withStorage(provider, () =>
					cloneBlocked(db, ownerId, provider, [request.voiceId]),
				)
			)
				throw new ORPCError("NOT_FOUND");
			// 대기 시각 표를 읽지 못하면 부르지 않는다(로드맵 T5 메모)
			const until = await withStorage(provider, () =>
				cooldownOf(db, provider, new Date()),
			);
			if (until)
				throw trialError(provider, "rate_limit", {
					retryAt: until.toISOString(),
				});
			const rate = await rateFor(context, request);
			const usage = estimate(request, rate);
			const claimed = await withStorage(provider, () =>
				claim(db, {
					ownerId,
					requestId,
					request,
					key,
					usage,
				}),
			);
			if (claimed.kind === "existing") return replay(provider, claimed.row);
			let audio: Uint8Array;
			try {
				audio = await synthesize(request);
				if (audio.byteLength > MAX_AUDIO_BYTES) {
					throw trialError(provider, "provider_input", {
						providerCode: "audio_too_large",
					});
				}
			} catch (error) {
				// 미확인·실패와 429 대기 시각을 적는다(E7, 작업실·드라마와 같은 recordFailure)
				throw await recordFailure(
					db,
					{ ownerId, id: claimed.id, provider, prefix: "[trial]" },
					error,
				);
			}
			// 결과를 저장하지 못해도 오디오는 돌려준다(스펙 5절). 그 행은 pending으로 남고 5분 뒤 unknown이 된다
			await guard(
				"완료 기록",
				async () => {
					await complete(db, ownerId, claimed.id, audio, audioTypeOf(provider));
					await sweep(db, ownerId);
				},
				"[trial]",
			);
			return {
				id: claimed.id,
				createdAt: claimed.createdAt,
				usage,
				audio: audioFile(audio, audioTypeOf(provider)),
			};
		}),
	trialList: protectedProcedure
		.input(z.object({ provider: providerIdSchema, voiceId: voiceIdSchema }))
		.output(z.array(trialItemSchema))
		.handler(({ input, context }) =>
			withStorage(input.provider, () =>
				listResults(context.db, context.ownerId, input.provider, input.voiceId),
			),
		),
	trialAudio: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(trialAudioSchema)
		.handler(({ input, context }) =>
			withStorage(undefined, () =>
				audioOf(context.db, context.ownerId, input.id),
			),
		),
	trialDelete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ input, context }) => ({
			deleted: await withStorage(undefined, () =>
				remove(context.db, context.ownerId, input.id),
			),
		})),
};
