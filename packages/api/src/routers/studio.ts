import { z } from "zod";

import { familyOf } from "../drama-acting";
import { protectedProcedure } from "../index";
import {
	checkParagraph,
	type ParagraphTagItem,
	paragraphTagPrompt,
} from "../paragraph-tags";
import { STUDIO_TIMEOUT_MS, trialError } from "../providers/errors";
import {
	estimate,
	freeModelOpen,
	isFreeModel,
	STUDIO_AUDIO_MAX,
	studioTextMax,
} from "../providers/trial-options";
import {
	studioAudioInputSchema,
	studioAutoTagInputSchema,
	studioAutoTagOutputSchema,
	studioCreateInputSchema,
	studioFindManyInputSchema,
	studioFoundSchema,
	studioInfoInputSchema,
	studioInfoSchema,
	studioRequestSchema,
	studioRequestStatusInputSchema,
	studioRequestStatusSchema,
	studioResultSchema,
} from "../studio-contract";
import {
	askSuggestions,
	audioPart,
	audioTypeOf,
	claim,
	comboKey,
	findRequest,
	findStudio,
	findStudioInfo,
	findStudioMany,
	type LateTarget,
	recordFailure,
	recordSuccess,
	replayStudio,
	saveLate,
	usableVoices,
	withStorage,
} from "../trial";
import { cooldownOf } from "../voice-cache";
import { rateFor } from "./rates";

const PREFIX = "[studio]";

// 음성 작업실(T9 스펙 3절, T10 다섯 공급자). 크레딧을 쓰는 길은 studioCreate 하나다. 나머지는 DB만 본다
export const studioRouter = {
	studioCreate: protectedProcedure
		.input(studioCreateInputSchema)
		.output(studioResultSchema)
		.handler(async ({ input: { requestId, request }, context }) => {
			// 공급자는 요청의 것뿐이다. 성우 검사·대기 시각·호출·기록이 모두 이 값을 쓴다(다른 공급자로 새지 않는다)
			const { provider } = request;
			const { db, ownerId } = context;
			// 무료 모델 종료·키 없음은 재생보다 먼저 본다(T5 순서, tts-provider '중복 과금 막기')
			if (isFreeModel(request) && !freeModelOpen())
				throw trialError(provider, "free_ended");
			const synthesize = context.providers?.[provider]?.synthesize;
			if (!synthesize) throw trialError(provider, "no_key");
			const key = comboKey(request, "studio");
			// 같은 요청 id(두 번 누름·재전송)는 성우 검사·대기 시각보다 먼저 그 행을 돌려준다(T5 순서, tts-provider)
			const existing = await withStorage(
				provider,
				() => replayStudio(db, ownerId, requestId, key, provider),
				PREFIX,
			);
			if (existing) return existing;
			// 서버 성우 검사(T9 스펙 2절): 이 소유자가 그 공급자로 담은 이용 가능한 성우
			const usable = await withStorage(
				provider,
				() => usableVoices(db, ownerId, provider, [request.voiceId]),
				PREFIX,
			);
			if (!usable) throw trialError(provider, "voice_unavailable");
			// 대기 시각 표를 읽지 못하면 부르지 않는다(로드맵 T5 메모)
			const until = await withStorage(
				provider,
				() => cooldownOf(db, provider, new Date()),
				PREFIX,
			);
			if (until)
				throw trialError(provider, "rate_limit", {
					retryAt: until.toISOString(),
				});
			// ElevenLabs 배율과 두 번째 대기 확인(시험 생성과 같은 rateFor, '스펙과 다른 점' 4)
			const rate = await rateFor(context, request, PREFIX);
			const usage = estimate(request, rate);
			const claimed = await withStorage(
				provider,
				() =>
					claim(db, {
						ownerId,
						requestId,
						request,
						key,
						usage,
						kind: "studio",
					}),
				PREFIX,
			);
			if (claimed.kind === "existing") {
				const again = await withStorage(
					provider,
					() => replayStudio(db, ownerId, requestId, key, provider),
					PREFIX,
				);
				if (again) return again;
				throw trialError(provider, "unknown_outcome");
			}
			// 늦은 결과·성공 기록의 대상: 이 소유자의 이 작업실 행, 사용 이력을 올릴 성우
			const target: LateTarget = {
				ownerId,
				id: claimed.id,
				kind: "studio",
				provider,
				voiceIds: [request.voiceId],
			};
			// 끊긴 요청의 결과 약속(onLate). 콜백 안에서 채우므로 객체 칸에 둔다(지역 변수는 타입 좁히기가 콜백 대입을 보지 못한다)
			const late: { result?: Promise<Uint8Array> } = {};
			let audio: Uint8Array;
			try {
				audio = await synthesize(request, {
					timeoutMs: STUDIO_TIMEOUT_MS,
					logPrefix: PREFIX,
					// 늦은 결과는 Typecast만이다. 네 공급자는 시간 초과 때 요청을 끊는다('스펙과 다른 점' 3)
					...(provider === "typecast"
						? {
								onLate: (result: Promise<Uint8Array>) => {
									late.result = result;
								},
							}
						: {}),
				});
				if (audio.byteLength > STUDIO_AUDIO_MAX) {
					throw trialError(provider, "provider_input", {
						providerCode: "audio_too_large",
					});
				}
			} catch (error) {
				// 미확인·실패와 429 대기 시각을 적는다(E7, 내 문장·드라마와 같은 recordFailure)
				const failure = await recordFailure(
					db,
					{ ownerId, id: claimed.id, provider, prefix: PREFIX },
					error,
				);
				// 미확인을 적은 뒤에 늦은 결과를 받는다. 미확인을 적지 못해 진행 중으로 남은 행도 늦은 결과가 완료로 바꾼다(saveLate).
				// 기다리지 않고 응답 뒤 작업(context.defer, 배포는 Next after)으로 넘긴다. defer가 없으면(로컬·테스트) 프로세스가 살아 있어 그대로 끝난다.
				// shortcut: 끊긴 Typecast 요청은 응답까지(최대 300초) 뒤에서 돌지만 기록이 미확인이라 동시 1건에 들지 않는다. 그동안 새 생성을 받으면 공급자 요청이 둘 겹칠 수 있다(계획 리뷰 P8).
				// 배포(Vercel Hobby)에서는 함수가 300초에 끝나면 그 뒤에 온 늦은 응답을 잃는다(ADR 0013). 다중 사용자 때 미확인 뒤 막을 시간을 정하고, 300초 넘는 응답이 실제로 생기면 플랜을 다시 본다
				if (late.result) {
					const saving = saveLate(
						db,
						target,
						late.result.then((audio) => ({
							audio,
							audioType: audioTypeOf(provider),
						})),
					);
					context.defer?.(saving);
				}
				throw failure;
			}
			// 저장하지 못하면 미확인으로 적고 unknown_outcome을 던진다('스펙과 다른 점' 4). 저장되면 사용 이력·정리(드라마와 같은 recordSuccess)
			await recordSuccess(db, target, {
				audio,
				audioType: audioTypeOf(provider),
			});
			return {
				id: claimed.id,
				createdAt: claimed.createdAt,
				usage,
				bytes: audio.byteLength,
			};
		}),
	// 자동 태그 추천(T10 스펙 15.3). 유료 텍스트 호출(OpenAI 우선·Gemini 보조, askSuggestions, 스펙 16.1)이고 DB를 쓰지 않는다(기록·대기 시각 표 없음, 429는 화면에만 알린다)
	studioAutoTag: protectedProcedure
		.input(studioAutoTagInputSchema)
		.output(studioAutoTagOutputSchema)
		.handler(async ({ input: { paragraphs }, context }) => {
			const items: ParagraphTagItem[] = paragraphs.map(
				({ provider, model, emotions, text, direction, feel }) => ({
					family: familyOf(provider, model),
					emotions,
					max: studioTextMax(provider),
					text,
					direction,
					feel,
				}),
			);
			const originalOf = ({ text, direction, feel }: ParagraphTagItem) => ({
				text,
				direction,
				feel,
			});
			// 태그·감정을 받지 않는 문단(ElevenLabs v2·flash)은 프롬프트에도 넣지 않는다(문단은 길어 토큰을 아낀다)
			const sent = items.filter((item) => item.family !== "elevenlabs_plain");
			const skipped = items.length - sent.length;
			// 받을 문단이 없으면 돈을 쓰지 않는다. 키가 없어도 할 일이 없으니 오류가 아니다
			if (!sent.length) return { paragraphs: items.map(originalOf), skipped };
			// 답의 index는 보낸 문단(sent) 차례다
			const first = await askSuggestions(
				context,
				paragraphTagPrompt(sent),
				"paragraphs",
			);
			return {
				paragraphs: items.map((item) => {
					const at = sent.indexOf(item);
					const suggestion = at < 0 ? undefined : first.get(at);
					return suggestion
						? checkParagraph(item, suggestion)
						: originalOf(item);
				}),
				skipped,
			};
		}),
	// 같은 조합의 저장된 결과. 공급자를 부르지 않는다(사용 이력도 세지 않는다)
	studioFind: protectedProcedure
		.input(studioRequestSchema)
		.output(studioResultSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(
				input.provider,
				() =>
					findStudio(context.db, context.ownerId, comboKey(input, "studio")),
				PREFIX,
			),
		),
	// 문단 여러 개의 저장된 결과(완료·미확인)를 한 번에(쿼리 1회, 요청 순서 그대로, T10 스펙 4.1절). 공급자를 부르지 않고 보관 기한도 늘리지 않는다
	studioFindMany: protectedProcedure
		.input(studioFindManyInputSchema)
		.output(z.array(studioFoundSchema.nullable()))
		.handler(({ input, context }) =>
			withStorage(
				undefined,
				() =>
					findStudioMany(
						context.db,
						context.ownerId,
						input.map((request) => comboKey(request, "studio")),
					),
				PREFIX,
			),
		),
	// 결과 하나의 길이·형식(T18 CLI 내려받기). 공급자를 부르지 않고 쓰지 않는다
	studioInfo: protectedProcedure
		.input(studioInfoInputSchema)
		.output(studioInfoSchema)
		.handler(({ input, context }) =>
			withStorage(
				undefined,
				() => findStudioInfo(context.db, context.ownerId, input.id),
				PREFIX,
			),
		),
	// 요청 id의 상태(T18 CLI 중단 복구). 없거나 남의 것이면 null. 공급자를 부르지 않고 쓰지 않는다
	studioRequest: protectedProcedure
		.input(studioRequestStatusInputSchema)
		.output(studioRequestStatusSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(
				undefined,
				() =>
					findRequest(context.db, context.ownerId, input.requestId, "studio"),
				PREFIX,
			),
		),
	// 오디오 조각 하나(multipart File, 3MiB 이하). 0번 조각이 보관을 30일 뒤로 늘린다
	studioAudio: protectedProcedure
		.input(studioAudioInputSchema)
		.output(z.file())
		.handler(({ input, context }) =>
			withStorage(
				undefined,
				() => audioPart(context.db, context.ownerId, input.id, input.part),
				PREFIX,
			),
		),
};
