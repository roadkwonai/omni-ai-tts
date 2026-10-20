import { TypecastAPIError, TypecastClient } from "@neosapience/typecast-js";
import { z } from "zod";

import type { Voice, VoiceSource } from "./contract";
import {
	nullOnStatus,
	type ProviderClient,
	ProviderHttpError,
	runCheck,
	runList,
	runTrial,
	type SynthesizeOptions,
} from "./errors";
import { emptyVoice, parseVoiceItems } from "./list";
import { SAMPLE_HOST } from "./sample-hosts";
import {
	sentText,
	type TrialRequest,
	type TypecastModel,
	type TypecastSettings,
	usedSettings,
} from "./trial-options";

// Typecast SDK는 응답을 검사하지 않는다. 쓰는 필드만 검사한다.
const subscriptionSchema = z.object({
	plan: z.string(),
	credits: z.object({ plan_credits: z.number(), used_credits: z.number() }),
});

// 응답 모양: 배열이고 항목마다 유형이 있다. 어긋나면 목록 전체가 응답 검증 실패(provider_error)다.
// 공개 성우만 남기려고 유형만 먼저 본다. 커스텀 항목은 모양이 달라도 목록을 깨지 않는다.
const voiceTypesSchema = z.array(z.looseObject({ voice_type: z.string() }));
// 공개 성우 하나. 어긋난 성우는 그 성우만 뺀다(사용자 확정 2026-10-04).
const rawVoiceSchema = z.object({
	voice_id: z.string().min(1),
	voice_name: z
		.object({ eng: z.string(), kor: z.string() })
		// 한글·영문 이름이 모두 비면 화면에 보일 이름이 없다. 그 성우만 뺀다
		.refine((n) => (n.kor.trim() || n.eng.trim()) !== ""),
	gender: z.string().nullish(),
	age: z.string().nullish(),
	use_cases: z.array(z.string()).nullish(),
	models: z.array(
		z.object({ version: z.string(), emotions: z.array(z.string()) }),
	),
	// 공급자 정적 주소(typecast.ai)의 https만 오디오 src에 넣는다. normalize로 https:host 꼴을 https://host로 바로잡는다. 어긋나면 그 성우만 '샘플 없음'(null)이다
	preview_url: z
		.url({
			protocol: /^https$/,
			hostname: SAMPLE_HOST.typecast,
			normalize: true,
		})
		.nullish()
		.catch(null),
});

// SDK 오류는 상태 코드와 본문의 error_code만 바꿔 담는다. 응답 헤더를 주지 않는다(Retry-After 없음, 설치본 lib/index.js 6~15행)
const typecastCodeSchema = z.object({ error_code: z.string() });
function toHttpError(error: unknown): never {
	if (!(error instanceof TypecastAPIError)) throw error;
	const code = typecastCodeSchema.safeParse(error.response).data?.error_code;
	throw new ProviderHttpError(error.statusCode, code ? [code] : []);
}

function toVoice(raw: z.infer<typeof rawVoiceSchema>): Voice {
	const english = raw.voice_name.eng.trim();
	const name = raw.voice_name.kor.trim() || english;
	return {
		...emptyVoice("typecast", "public"),
		voiceId: raw.voice_id,
		name,
		englishName: english && english !== name ? english : null,
		// 모르는 성별 값은 '정보 없음'으로 보인다. 이름으로 추정하지 않는다
		gender:
			raw.gender === "male" || raw.gender === "female" ? raw.gender : null,
		age: raw.age ?? null,
		useCases: raw.use_cases ?? [],
		models: raw.models.map(({ version, emotions }) => ({
			model: version,
			emotions,
		})),
		previewUrl: raw.preview_url ?? null,
	};
}

export function createTypecast(apiKey: string): ProviderClient {
	// 키와 공식 호스트를 명시한다. 빠지면 SDK가 TYPECAST_API_KEY·TYPECAST_API_HOST로 대체한다.
	// source·generatedBy는 Typecast llms.txt의 연동 식별 규약이다(사용자 정보는 넣지 않는다).
	const client = new TypecastClient({
		apiKey,
		baseHost: "https://api.typecast.ai",
		source: "api-docs",
		generatedBy: "codex",
	});
	return {
		// 매개변수는 이 공급자의 요청만 받는다(메서드 이변성, ProviderClient 주석)
		synthesize: (
			request: Extract<TrialRequest, { provider: "typecast" }>,
			options: SynthesizeOptions = {},
		) =>
			// ponytail: SDK에 취소 신호가 없어 runTrial의 경주로만 끊는다(내 문장 60초, 작업실 180초). 끊긴 요청은 뒤에서 끝까지 돌아 과금될 수 있다.
			// 작업실은 그 결과를 onLate로 받아 같은 생성 기록에 저장한다(T9 스펙 2절 '늦은 결과', T5-02). Node fetch는 응답 머리를 300초까지 기다린다
			runTrial(
				"typecast",
				async () => {
					const s = usedSettings(request) as Partial<TypecastSettings> & {
						model: TypecastModel;
					};
					const prompt =
						s.emotion === "smart"
							? { emotion_type: "smart" as const }
							: s.model === "ssfm-v30"
								? {
										emotion_type: "preset" as const,
										emotion_preset: s.preset,
										emotion_intensity: s.intensity,
									}
								: { emotion_preset: s.preset, emotion_intensity: s.intensity };
					const { audioData } = await client
						.textToSpeech({
							text: sentText(request),
							voice_id: request.voiceId,
							model: s.model,
							...(s.language === "kor" ? { language: "kor" as const } : {}),
							prompt,
							output: {
								audio_format: "mp3",
								audio_tempo: s.tempo,
								audio_pitch: s.pitch,
								volume: s.volume,
							},
						})
						.catch(toHttpError);
					return new Uint8Array(audioData);
				},
				options,
			),
		checkStatus: () =>
			// ponytail: SDK에 취소 옵션이 없어 runCheck의 10초 경주로만 끊는다. 끊긴 요청은 뒤에서 끝까지 돈다(상태를 바꾸지 않는 조회라 괜찮다). 생성(T8)은 끊는 방법을 그때 다시 정한다.
			runCheck("typecast", async () => {
				const raw = await client.getMySubscription().catch(toHttpError);
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
		listVoices: () =>
			// 확인 호출과 같이 10초 경주로만 끊는다. 필터 없이 부른다: SDK 필터 타입에 voice_type이 없어 공개 성우만 남기는 것은 여기서 한다(T3 스펙 3절).
			runList("typecast", async () => {
				const raw = await client.getVoicesV3().catch(toHttpError);
				const originals = voiceTypesSchema
					.parse(raw)
					.filter((voice) => voice.voice_type === "original");
				const voices = parseVoiceItems(
					"typecast",
					originals,
					rawVoiceSchema,
					toVoice,
				);
				return {
					voices,
					next: null,
					total: voices.length,
					totalExact: true,
					windowLimited: false,
				};
			}),
		// 404만 '없음'이다. 보관함에는 공개 목록에서 담은 성우만 있고 id의 종류는 바뀌지 않는다(계획 리뷰 P4)
		getVoice: (_source: VoiceSource, voiceId: string) =>
			runList("typecast", async () => {
				const raw = await nullOnStatus(
					client.getVoiceV3(voiceId).catch(toHttpError),
					404,
				);
				return raw === null ? null : toVoice(rawVoiceSchema.parse(raw));
			}),
	};
}
