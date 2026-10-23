import { z } from "zod";

import { protectedProcedure } from "../index";
import { STUDIO_TIMEOUT_MS, trialError } from "../providers/errors";
import type { TrialAudio } from "../providers/trial-contract";
import { estimate, STUDIO_AUDIO_MAX } from "../providers/trial-options";
import {
	type StudioResult,
	studioAudioInputSchema,
	studioCreateInputSchema,
	studioItemSchema,
	studioRequestSchema,
	studioResultSchema,
} from "../studio-contract";
import {
	audioPart,
	audioTypeOf,
	claim,
	comboKey,
	findStudio,
	type LateTarget,
	listStudio,
	recordFailure,
	recordSuccess,
	remove,
	replay,
	replayStudio,
	saveLate,
	usableVoices,
	withStorage,
} from "../trial";
import { cooldownOf } from "../voice-cache";

const PREFIX = "[studio]";
// 이번 작업실은 Typecast만 만든다(스펙 1절). T10이 다른 공급자를 붙인다
const PROVIDER = "typecast";

// 선점이 같은 요청 id에 걸린 경우(동시 재전송)의 재생. 그 행은 사실상 진행 중이라 오디오가 없다(앞 요청이 그 사이 끝난 아주 짧은 경우만 오디오를 읽는다).
// 보통의 재전송은 replayStudio가 길이만 읽는다(계획 리뷰 P4·E3)
const resultOf = (audio: TrialAudio): StudioResult => ({
	id: audio.id,
	createdAt: audio.createdAt,
	usage: audio.usage,
	bytes: audio.audio.size,
});

// 음성 작업실(T9 스펙 3절). 크레딧을 쓰는 길은 studioCreate 하나다. 나머지는 DB만 본다
export const studioRouter = {
	studioCreate: protectedProcedure
		.input(studioCreateInputSchema)
		.output(studioResultSchema)
		.handler(async ({ input: { requestId, request }, context }) => {
			const { db, ownerId } = context;
			const synthesize = context.providers?.typecast?.synthesize;
			if (!synthesize) throw trialError(PROVIDER, "no_key");
			const key = comboKey(request, "studio");
			// 같은 요청 id(두 번 누름·재전송)는 성우 검사·대기 시각보다 먼저 그 행을 돌려준다(T5 순서, tts-provider)
			const existing = await withStorage(PROVIDER, () =>
				replayStudio(db, ownerId, requestId, key),
			);
			if (existing) return existing;
			// 서버 성우 검사(T9 스펙 2절): 이 소유자가 담은 이용 가능한 Typecast 성우
			const usable = await withStorage(PROVIDER, () =>
				usableVoices(db, ownerId, PROVIDER, [request.voiceId]),
			);
			if (!usable) throw trialError(PROVIDER, "voice_unavailable");
			// 대기 시각 표를 읽지 못하면 부르지 않는다(로드맵 T5 메모)
			const until = await withStorage(PROVIDER, () =>
				cooldownOf(db, PROVIDER, new Date()),
			);
			if (until)
				throw trialError(PROVIDER, "rate_limit", {
					retryAt: until.toISOString(),
				});
			const usage = estimate(request);
			const claimed = await withStorage(PROVIDER, () =>
				claim(db, { ownerId, requestId, request, key, usage, kind: "studio" }),
			);
			if (claimed.kind === "existing")
				return resultOf(replay(PROVIDER, claimed.row));
			// 늦은 결과·성공 기록의 대상: 이 소유자의 이 작업실 행, 사용 이력을 올릴 성우
			const target: LateTarget = {
				ownerId,
				id: claimed.id,
				kind: "studio",
				provider: PROVIDER,
				voiceIds: [request.voiceId],
			};
			// 끊긴 요청의 결과 약속(onLate). 콜백 안에서 채우므로 객체 칸에 둔다(지역 변수는 타입 좁히기가 콜백 대입을 보지 못한다)
			const late: { result?: Promise<Uint8Array> } = {};
			let audio: Uint8Array;
			try {
				audio = await synthesize(request, {
					timeoutMs: STUDIO_TIMEOUT_MS,
					onLate: (result) => {
						late.result = result;
					},
				});
				if (audio.byteLength > STUDIO_AUDIO_MAX) {
					throw trialError(PROVIDER, "provider_input", {
						providerCode: "audio_too_large",
					});
				}
			} catch (error) {
				// 미확인·실패와 429 대기 시각을 적는다(E7, 내 문장·드라마와 같은 recordFailure)
				const failure = await recordFailure(
					db,
					{ ownerId, id: claimed.id, provider: PROVIDER, prefix: PREFIX },
					error,
				);
				// 미확인을 적은 뒤에 늦은 결과를 받는다. 늦은 결과 저장은 미확인 행만 완료로 바꾸므로, 미확인을 적기 전에 부르면 아직 진행 중인 행이라 늦은 결과를 잃는다. 기다리지 않는다.
				// shortcut: 끊긴 Typecast 요청은 응답까지(최대 300초) 뒤에서 돌지만 기록이 미확인이라 동시 1건에 들지 않는다.
				// 그동안 새 생성을 받으면 공급자 요청이 둘 겹칠 수 있다(계획 리뷰 P8). 다중 사용자·배포(T10·T15 메모) 때 미확인 뒤 막을 시간을 정한다
				if (late.result)
					void saveLate(
						db,
						target,
						late.result.then((audio) => ({
							audio,
							audioType: audioTypeOf(PROVIDER),
						})),
					);
				throw failure;
			}
			// 저장하지 못하면 미확인으로 적고 unknown_outcome을 던진다('스펙과 다른 점' 4). 저장되면 사용 이력·정리(드라마와 같은 recordSuccess)
			await recordSuccess(db, target, {
				audio,
				audioType: audioTypeOf(PROVIDER),
			});
			return {
				id: claimed.id,
				createdAt: claimed.createdAt,
				usage,
				bytes: audio.byteLength,
			};
		}),
	// 같은 조합의 저장된 결과. 공급자를 부르지 않는다(사용 이력도 세지 않는다)
	studioFind: protectedProcedure
		.input(studioRequestSchema)
		.output(studioResultSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(PROVIDER, () =>
				findStudio(context.db, context.ownerId, comboKey(input, "studio")),
			),
		),
	studioList: protectedProcedure
		.output(z.array(studioItemSchema))
		.handler(({ context }) =>
			withStorage(PROVIDER, () => listStudio(context.db, context.ownerId)),
		),
	// 오디오 조각 하나(multipart File, 3MiB 이하). 0번 조각이 보관을 30일 뒤로 늘린다
	studioAudio: protectedProcedure
		.input(studioAudioInputSchema)
		.output(z.file())
		.handler(({ input, context }) =>
			withStorage(undefined, () =>
				audioPart(context.db, context.ownerId, input.id, input.part),
			),
		),
	studioDelete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ input, context }) => ({
			deleted: await withStorage(undefined, () =>
				remove(context.db, context.ownerId, input.id, "studio"),
			),
		})),
};
