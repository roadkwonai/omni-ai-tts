import { z } from "zod";

import {
	type ActingLine,
	autoTagPrompt,
	checkSuggestion,
	familyOf,
} from "../drama-acting";
import {
	dramaAudioInputSchema,
	dramaAutoTagInputSchema,
	dramaAutoTagOutputSchema,
	dramaCreateInputSchema,
	dramaItemSchema,
	dramaResultSchema,
} from "../drama-contract";
import {
	DRAMA_SCENE_MAX,
	type DramaLine,
	dramaUsage,
	type LineSpan,
	pcmSeconds,
	type SceneAudio,
	sceneChars,
	sceneText,
	splitLines,
	wavOf,
} from "../drama-script";
import { protectedProcedure } from "../index";
import { logFailure, STUDIO_TIMEOUT_MS, trialError } from "../providers/errors";
import {
	freeModelOpen,
	STUDIO_AUDIO_MAX,
	utf8Bytes,
} from "../providers/trial-options";
import {
	askSuggestions,
	audioPart,
	claimRow,
	dramaKey,
	type LateTarget,
	listDrama,
	recordFailure,
	recordSuccess,
	remove,
	replayStudio,
	type Stored,
	saveLate,
	usableVoices,
	withStorage,
} from "../trial";
import { cooldownOf } from "../voice-cache";

const PREFIX = "[drama]";
// 장면 생성은 Fish Audio만 쓴다(T9.5 스펙 1절)
const PROVIDER = "fish_audio";
const WAV = "audio/wav";

// 받은 장면을 저장할 모양으로(WAV, 줄 구간). 바로 온 결과와 늦은 결과가 함께 쓰고 던지지 않는다.
// 줄 나누기가 예외를 던져도 이미 과금된 결과를 버리지 않고 '나누지 못함'(null)으로 저장한다(E9). 로그는 오류 이름만(대본이 든 message를 남기지 않는다)
function toStored(scene: SceneAudio, lines: readonly DramaLine[]): Stored {
	let segments: LineSpan[] | null = null;
	try {
		segments =
			scene.segments &&
			splitLines(
				lines.map((line) => line.text),
				scene.segments,
				pcmSeconds(scene.pcm.byteLength),
			);
	} catch (error) {
		logFailure(`${PREFIX} 나누기 실패`, error, []);
	}
	return { audio: wavOf(scene.pcm), audioType: WAV, segments };
}

// 드라마 작업실(T9.5 스펙 3·14절). 돈을 쓰는 길은 dramaCreate(Fish 장면)와 dramaAutoTag(OpenAI, 실패하면 Gemini 텍스트, 묶음당 최대 4회 ADR 0008) 둘이다. 나머지는 DB만 본다
export const dramaRouter = {
	dramaCreate: protectedProcedure
		.input(dramaCreateInputSchema)
		.output(dramaResultSchema)
		.handler(async ({ input: { requestId, request }, context }) => {
			const { db, ownerId } = context;
			// 무료 모델은 종료일(하루 이르게)부터 보내지 않는다(T5 trialCreate와 같다, 계획 '스펙과 다른 점' 4)
			if (request.model === "s2.1-pro-free" && !freeModelOpen())
				throw trialError(PROVIDER, "free_ended");
			const synthesizeScene = context.providers?.fish_audio?.synthesizeScene;
			if (!synthesizeScene) throw trialError(PROVIDER, "no_key");
			const { text, referenceIds } = sceneText(request);
			const key = dramaKey(request);
			const replayed = () =>
				withStorage(
					PROVIDER,
					() => replayStudio(db, ownerId, requestId, key, PROVIDER),
					PREFIX,
				);
			// 같은 요청 id(두 번 누름·재전송)는 성우 검사·대기 시각보다 먼저 그 행을 돌려준다(T5 순서, tts-provider)
			const existing = await replayed();
			if (existing) return existing;
			// 서버 성우 검사(T9.5 스펙 2절): 보낼 성우(쓰인 화자의 성우)가 모두 이 소유자가 Fish Audio로 담은 이용 가능한 성우
			const usable = await withStorage(
				PROVIDER,
				() => usableVoices(db, ownerId, PROVIDER, referenceIds),
				PREFIX,
			);
			if (!usable) throw trialError(PROVIDER, "voice_unavailable");
			// 대기 시각 표를 읽지 못하면 부르지 않는다(로드맵 T5 메모)
			const until = await withStorage(
				PROVIDER,
				() => cooldownOf(db, PROVIDER, new Date()),
				PREFIX,
			);
			if (until)
				throw trialError(PROVIDER, "rate_limit", {
					retryAt: until.toISOString(),
				});
			const { sceneName, speakers, lines, model, settings } = request;
			const usage = dramaUsage(model, utf8Bytes(text));
			const claimed = await withStorage(
				PROVIDER,
				() =>
					claimRow(db, {
						ownerId,
						requestId,
						key,
						usage,
						provider: PROVIDER,
						fields: {
							kind: "drama",
							voiceId: referenceIds.join(","),
							model,
							settings,
							text,
							script: { sceneName, speakers, lines },
						},
					}),
				PREFIX,
			);
			if (claimed.kind === "existing") {
				// 선점이 같은 요청 id에 걸렸다(동시 재전송). 그 행의 상태를 돌려준다(진행 중이면 in_progress)
				const again = await replayed();
				if (again) return again;
				// 그사이 그 행이 지워졌다(드묾). 결과를 돌려줄 수 없어 처리 여부 미확인으로 알린다
				throw trialError(PROVIDER, "unknown_outcome");
			}
			// 늦은 결과·성공 기록의 대상: 이 소유자의 이 드라마 행, 사용 이력을 올릴 화자 성우
			const target: LateTarget = {
				ownerId,
				id: claimed.id,
				kind: "drama",
				provider: PROVIDER,
				voiceIds: referenceIds,
			};
			// 끊긴 요청의 결과 약속(onLate). 콜백 안에서 채우므로 객체 칸에 둔다(studio.ts와 같다)
			const late: { result?: Promise<SceneAudio> } = {};
			let stored: Stored;
			try {
				const scene = await synthesizeScene(
					{ model, text, referenceIds, ...settings },
					{
						timeoutMs: STUDIO_TIMEOUT_MS,
						logPrefix: PREFIX,
						onLate: (result) => {
							late.result = result;
						},
					},
				);
				stored = toStored(scene, lines);
				if (stored.audio.byteLength > STUDIO_AUDIO_MAX)
					throw trialError(PROVIDER, "provider_input", {
						providerCode: "audio_too_large",
					});
			} catch (error) {
				// 미확인·실패와 429 대기 시각을 적는다(E7, 내 문장·작업실과 같은 recordFailure)
				const failure = await recordFailure(
					db,
					{ ownerId, id: claimed.id, provider: PROVIDER, prefix: PREFIX },
					error,
				);
				// 미확인을 적은 뒤에 늦은 결과를 받는다(saveLate는 미확인 행만 완료로 바꾼다). 기다리지 않고 응답 뒤 작업(context.defer)으로 넘긴다(studio.ts와 같다).
				// 늦은 결과는 던지지 않는 변환만 거친다. 32MiB 초과는 saveLate가 버리고 '늦은 결과 버림'을 남긴다(Ruling 7)
				if (late.result) {
					const saving = saveLate(
						db,
						target,
						late.result.then((scene) => toStored(scene, lines)),
					);
					context.defer?.(saving);
				}
				throw failure;
			}
			// 저장하지 못하면 미확인으로 적고 unknown_outcome을 던진다. 저장되면 사용 이력·정리(작업실과 같은 recordSuccess)
			await recordSuccess(db, target, stored);
			return {
				id: claimed.id,
				createdAt: claimed.createdAt,
				usage,
				bytes: stored.audio.byteLength,
				segments: stored.segments ?? null,
			};
		}),
	// 전체 자동 태그(T9.5 스펙 14.5). 유료 텍스트 호출(OpenAI 우선·Gemini 보조, askSuggestions, 스펙 16.1)이고 DB를 쓰지 않는다(기록·대기 시각 표 없음, 429는 화면에만 알린다)
	dramaAutoTag: protectedProcedure
		.input(dramaAutoTagInputSchema)
		.output(dramaAutoTagOutputSchema)
		.handler(async ({ input: { mode, speakers, lines }, context }) => {
			const acting = speakers.map(({ name, provider, model, emotions }) => ({
				name,
				family: familyOf(provider, model),
				emotions,
			}));
			const originalOf = ({ direction, text, feel }: ActingLine) => ({
				direction,
				text,
				feel,
			});
			// 태그·감정을 받지 않는 줄(ElevenLabs v2·flash) 수
			const skipped = lines.filter(
				(line) => acting[line.speaker]?.family === "elevenlabs_plain",
			).length;
			// 받을 줄이 없으면 돈을 쓰지 않는다. 키가 없어도 할 일이 없으니 오류가 아니다(리뷰 수정 1)
			if (skipped === lines.length)
				return { lines: lines.map(originalOf), skipped };
			// 줄마다 그 index의 첫 제안. 없으면 원래 값이다
			const first = await askSuggestions(
				context,
				autoTagPrompt(acting, lines),
				"lines",
			);
			const pairs = lines.map((line, index) => {
				const original = originalOf(line);
				const suggestion = first.get(index);
				const who = acting[line.speaker];
				return {
					original,
					checked:
						suggestion && who
							? checkSuggestion(
									who.family,
									who.emotions,
									mode,
									original,
									suggestion,
								)
							: original,
				};
			});
			// 장면 모드는 결과 합계도 2,000자 안이어야 한다. 넘으면 뒤 줄부터 원래 값으로 되돌린다('스펙과 다른 점' 23)
			const merged = (keep: number) =>
				pairs.map((pair, i) => (i < keep ? pair.checked : pair.original));
			let keep = pairs.length;
			while (
				mode === "scene" &&
				keep > 0 &&
				sceneChars(merged(keep)) > DRAMA_SCENE_MAX
			)
				keep -= 1;
			return { lines: merged(keep), skipped };
		}),
	dramaList: protectedProcedure
		.output(z.array(dramaItemSchema))
		.handler(({ context }) =>
			withStorage(
				PROVIDER,
				() => listDrama(context.db, context.ownerId),
				PREFIX,
			),
		),
	// 오디오 조각 하나(multipart File, 3MiB 이하). 0번 조각이 보관을 30일 뒤로 늘린다
	dramaAudio: protectedProcedure
		.input(dramaAudioInputSchema)
		.output(z.file())
		.handler(({ input, context }) =>
			withStorage(
				undefined,
				() =>
					audioPart(context.db, context.ownerId, input.id, input.part, "drama"),
				PREFIX,
			),
		),
	dramaDelete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ input, context }) => ({
			deleted: await withStorage(
				undefined,
				() => remove(context.db, context.ownerId, input.id, "drama"),
				PREFIX,
			),
		})),
};
