import { z } from "zod";

import type { ListInputOf, Voice, VoiceSource } from "./contract";
import {
	fetchJson,
	fetchOk,
	type ProviderClient,
	ProviderHttpError,
	providerError,
	retryAfterSeconds,
	runCheck,
	runList,
	runTrial,
	type SynthesizeOptions,
} from "./errors";
import { clip, emptyVoice, parseVoiceItems } from "./list";
import { voiceIdSchema } from "./trial-contract";
import { sentText, type TrialRequest } from "./trial-options";

// Gemini API REST(ADR 0002, Airy·Fish Audio와 같은 방식). SDK @google/genai는 기본 5회 시도·연결 오류 재시도·환경변수 대체라 쓰지 않는다(research 12절).
// 리다이렉트는 fetchOk가 막는다
const GEMINI_HOST = "https://generativelanguage.googleapis.com";

// 대표 성우 30명(공식 문서 이름표). 목록 API에서는 en-US로 분류돼 한국어 목록에 없고, id는 소문자 이름이다(2026-10-13 실측)
export const GEMINI_CLASSIC_IDS = [
	"zephyr",
	"puck",
	"charon",
	"kore",
	"fenrir",
	"leda",
	"orus",
	"aoede",
	"callirrhoe",
	"autonoe",
	"enceladus",
	"iapetus",
	"umbriel",
	"algieba",
	"despina",
	"erinome",
	"algenib",
	"rasalgethi",
	"laomedeia",
	"achernar",
	"alnilam",
	"schedar",
	"gacrux",
	"pulcherrima",
	"achird",
	"zubenelgenubi",
	"vindemiatrix",
	"sadachbia",
	"sadaltager",
	"sulafat",
] as const;
const CLASSIC = new Set<string>(GEMINI_CLASSIC_IDS);

// 참고 음성(GLOSSARY): Google Cloud 문서의 같은 이름 Chirp 3 HD 한국어 음성(다른 모델). 파일 이름은 첫 글자만 대문자다(2026-10-13 HEAD 30개 200).
// shortcut: 문서 자산이라 예고 없이 바뀔 수 있다(API 약속이 아님), 사라지면 샘플만 없다
export const referenceUrl = (id: string) =>
	`https://docs.cloud.google.com/text-to-speech/docs/audio/ko-KR-Chirp3-HD-${id.charAt(0).toUpperCase()}${id.slice(1)}.wav`;
// 언어를 두지 않아야 패널 이름표(sampleLabel)가 이 제목을 쓴다(계획 '스펙과 다른 점' 5)
const REFERENCE_TITLE = "참고 음성 · Chirp 3 HD";

// Google 오류 본문: Voices는 { error: { code: 404, status: "NOT_FOUND", details: [{ reason }] } }(2026-10-13 실측),
// Interactions는 { error: { code: "invalid_request" } }(research 9절). 이유 → 상태 → 문자열 code 순서로 담는다(연결 카드가 첫 코드를 보인다). 메시지는 읽지 않는다
const codeText = z.string().min(1).max(60);
const googleErrorSchema = z.object({
	error: z.object({
		status: codeText.optional().catch(undefined),
		code: z.union([codeText, z.number()]).optional().catch(undefined),
		details: z
			.array(
				z.object({ reason: codeText.optional().catch(undefined) }).catch({}),
			)
			.optional()
			.catch(undefined),
	}),
});
const geminiCodes = (body: unknown): string[] => {
	const error = googleErrorSchema.safeParse(body).data?.error;
	if (!error) return [];
	return [
		...(error.details ?? []).flatMap((detail) =>
			detail.reason ? [detail.reason] : [],
		),
		...(error.status ? [error.status] : []),
		// Interactions의 snake_case code도 Voices 상태와 같은 표로 판정한다(스펙 6절)
		...(typeof error.code === "string" ? [error.code.toUpperCase()] : []),
	];
};

const voicesSchema = z.object({ voices: z.array(z.unknown()) });
// 성우 id는 시험 생성과 같은 voiceIdSchema(본문에 그대로 들어간다). 글자 값은 공용 캐시 행과 화면에 그대로 가므로 상한을 둔다
const rawVoiceSchema = z.object({
	id: voiceIdSchema,
	display_name: z.string().trim().min(1).max(200),
	language_code: z.string().max(20),
	gender: z.string().nullish(),
	pitch: z.string().max(20).nullish(),
	accent: z.string().max(100).nullish(),
	persona: z.string().max(500).nullish(),
	context: z.string().max(200).nullish(),
	description: z.string().nullish(),
});
// 맥락·페르소나는 여러 값을 ' | '로 잇는다(실측)
const split = (value: string | null | undefined) =>
	(value ?? "")
		.split(" | ")
		.map((part) => part.trim())
		.filter(Boolean);

function geminiVoice(raw: z.infer<typeof rawVoiceSchema>): Voice {
	const url = CLASSIC.has(raw.id) ? referenceUrl(raw.id) : null;
	return {
		...emptyVoice("gemini", "public"),
		voiceId: raw.id,
		name: raw.display_name,
		// 모르는 성별은 '정보 없음'이다. 이름으로 추정하지 않는다
		gender:
			raw.gender === "male" ||
			raw.gender === "female" ||
			raw.gender === "neutral"
				? raw.gender
				: null,
		accent: raw.accent?.trim() || null,
		pitch: raw.pitch?.trim() || null,
		personas: split(raw.persona),
		useCases: split(raw.context),
		languages: [raw.language_code],
		description: clip(raw.description),
		previewUrl: url,
		samples: url ? [{ language: null, title: REFERENCE_TITLE, url }] : [],
	};
}

const interactionSchema = z.object({
	status: z.string().max(60).nullish().catch(undefined),
	// 어긋난 단계·steps는 버리고 남은 단계에서 오디오를 찾는다(ZodError로 받은 오디오를 잃으면 다시 만들어 두 번 과금된다)
	steps: z
		.array(
			z
				.object({ type: z.string(), content: z.array(z.unknown()).nullish() })
				.catch({ type: "", content: null }),
		)
		.nullish()
		.catch(undefined),
});
const audioContentSchema = z.object({
	type: z.literal("audio"),
	data: z.string().min(1),
});
// 응답은 받았지만 쓸 오디오가 없다. runTrial이 처리 여부 미확인으로 바꾼다(계획 '스펙과 다른 점' 2). 로그에는 이 이름만 남는다
class GeminiAudioMissingError extends Error {
	override name = "GeminiAudioMissingError";
}

// 마지막 model_output 단계의 마지막 오디오(문서 REST 예시의 jq와 같다). 기본 형식은 RIFF 머리말이 있는 WAV다(문서 2026-10-13).
// WAV가 있으면 상태와 상관없이 쓴다(받은 오디오를 버리면 다시 만들어 두 번 과금된다, R2-3)
function wavOf(body: unknown): Uint8Array {
	const { status, steps } = interactionSchema.parse(body);
	const last = (steps ?? [])
		.filter((step) => step.type === "model_output")
		.flatMap((step) => step.content ?? [])
		.flatMap((item) => {
			const parsed = audioContentSchema.safeParse(item);
			return parsed.success ? [parsed.data] : [];
		})
		.at(-1);
	const bytes = last ? Buffer.from(last.data, "base64") : null;
	if (
		bytes &&
		bytes.length > 12 &&
		bytes.toString("ascii", 0, 4) === "RIFF" &&
		bytes.toString("ascii", 8, 12) === "WAVE"
	)
		return new Uint8Array(bytes);
	// failed만 입력 거절이다. in_progress 등 다른 상태는 과금됐을 수 있어 '다시 해도 된다'고 보이지 않게 처리 여부 미확인으로 둔다
	// shortcut: 거절로 보는 상태는 failed 하나다, 첫 승인 호출에서 실제 status 값을 기록한 뒤 넓힌다
	if (status?.toLowerCase() === "failed")
		throw new ProviderHttpError(400, [status.toUpperCase()]);
	throw new GeminiAudioMissingError();
}

// 드라마 전체 자동 태그(T9.5 Part 2)의 텍스트 모델과 시간 제한. TTS 모델과 다르다
export const GEMINI_TEXT_MODEL = "gemini-3.8-flash";
export const AUTO_TAG_TIMEOUT_MS = 60_000;
const textContentSchema = z.object({
	type: z.literal("text"),
	text: z.string(),
});

// model_output 단계의 글(나뉘어 오면 잇는다). 없으면 null이다.
// JSON으로 읽지 않는다: 깨진 답이 여기서 던지면 runTrial이 처리 여부 미확인으로 바꾼다(계획 리뷰 L5)
function textOf(body: unknown): string | null {
	const texts = (interactionSchema.parse(body).steps ?? [])
		.filter((step) => step.type === "model_output")
		.flatMap((step) => step.content ?? [])
		.flatMap((item) => {
			const parsed = textContentSchema.safeParse(item);
			return parsed.success ? [parsed.data.text] : [];
		});
	return texts.length > 0 ? texts.join("") : null;
}

// 스펙 6절: 429에 Retry-After가 없거나 못 읽으면(0, HTTP 날짜) 60초 대기(Google은 본문 RetryInfo로 준다). 기존 대기 기록 경로(runTrial·runList retryAt)가 그대로 쓴다
async function waitDefault<T>(call: Promise<T>): Promise<T> {
	try {
		return await call;
	} catch (error) {
		if (
			error instanceof ProviderHttpError &&
			error.status === 429 &&
			retryAfterSeconds(error.retryAfter) === null
		)
			throw new ProviderHttpError(429, error.codes, "60");
		throw error;
	}
}

export function createGemini(apiKey: string): ProviderClient {
	const auth = { "x-goog-api-key": apiKey };
	// 공용 캐시에 프로젝트 맞춤 성우(디자인·복제)가 섞이지 않게 늘 type=prebuilt다(research 11절)
	const voicesUrl = (language: string, pageSize: number) =>
		`${GEMINI_HOST}/v1beta/voices?${new URLSearchParams({
			type: "prebuilt",
			language_code: language,
			page_size: String(pageSize),
		})}`;
	// ponytail: 다음 페이지 토큰은 따라가지 않는다(ko-KR 117명, en-US 215명 실측(2026-10-13)). 1,000명을 넘으면 뒤 성우가 빠진다
	const voicesOf = async (language: string, signal: AbortSignal) =>
		voicesSchema.parse(
			await waitDefault(
				fetchJson(voicesUrl(language, 1000), auth, signal, geminiCodes),
			),
		).voices;

	// 클라이언트는 요청마다 만들어지므로(apps/web/src/context.ts) 한 요청에서 목록은 한 번만 부른다(이용 가능 확인, 스펙 2절)
	let listing: Promise<Voice[]> | undefined;
	const allVoices = () => {
		listing ??= runList("gemini", async (signal) => {
			const [korean, english] = await Promise.all([
				voicesOf("ko-KR", signal),
				voicesOf("en-US", signal),
			]);
			// 한국어 117명(실측)이 0명이면 이상 상태다. 지난 목록을 쓰고 보관함 확인은 행을 바꾸지 않게 한다(Airy와 같다)
			if (korean.length === 0) throw providerError("gemini", "provider_error");
			// en-US에서는 검사 전에 대표 성우만 남긴다(나머지 en-US 항목 모양은 기록하지 않는다, R2-4)
			return parseVoiceItems(
				"gemini",
				[
					...korean,
					...english.filter((item) =>
						CLASSIC.has(String((item as { id?: unknown } | null)?.id)),
					),
				],
				rawVoiceSchema,
				(raw) => geminiVoice(raw),
			);
		});
		return listing;
	};

	return {
		// 매개변수는 이 공급자의 요청만 받는다(메서드 이변성, ProviderClient 주석)
		synthesize: (
			request: Extract<TrialRequest, { provider: "gemini" }>,
			options: SynthesizeOptions = {},
		) =>
			runTrial(
				"gemini",
				async (signal) => {
					const { model, direction } = request.settings;
					const response = await waitDefault(
						fetchOk(
							`${GEMINI_HOST}/v1beta/interactions`,
							{
								method: "POST",
								headers: { ...auth, "Content-Type": "application/json" },
								// 계약 필드만 서버가 만든다. store: false로 공급자가 요청·응답을 저장하지 않게 한다(research 10절). 언어는 모델이 감지한다
								body: JSON.stringify({
									model,
									input: [
										{
											type: "user_input",
											content: [
												{
													type: "text",
													text: sentText(request),
													// 말투 지시는 대본이 아니라 주석이다(문서: 대본에 쓴 지시는 읽힐 수 있다)
													...(direction
														? {
																annotations: [
																	{ type: "speech_metadata", style: direction },
																],
															}
														: {}),
												},
											],
										},
									],
									response_format: { type: "audio" },
									generation_config: {
										speech_config: [{ voice: request.voiceId }],
									},
									store: false,
								}),
								signal,
							},
							geminiCodes,
						),
					);
					return wavOf(await response.json());
				},
				// onLate는 넘기지 않는다: 이 공급자는 시간 초과 때 요청을 끊어 늦은 결과가 없다
				{ timeoutMs: options.timeoutMs, logPrefix: options.logPrefix },
			),
		// 대본은 input 문자열로 보낸다(문서 텍스트 예시). 2026-10-22 사용자 승인 실호출에서 이 모양이 200으로 받아들여졌다(research drama-acting-tags 3-2)
		suggestActing: ({ system, input, schema }) =>
			runTrial(
				"gemini",
				async (signal) => {
					const response = await waitDefault(
						fetchOk(
							`${GEMINI_HOST}/v1beta/interactions`,
							{
								method: "POST",
								headers: { ...auth, "Content-Type": "application/json" },
								// 사고·출력 토큰에 상한을 둔다(사고 토큰 과금 미확인, research 3-2)
								body: JSON.stringify({
									model: GEMINI_TEXT_MODEL,
									system_instruction: system,
									input,
									response_format: {
										type: "text",
										mime_type: "application/json",
										schema,
									},
									generation_config: {
										max_output_tokens: 8192,
										thinking_level: "low",
									},
									store: false,
								}),
								signal,
							},
							geminiCodes,
						),
					);
					return textOf(await response.json());
				},
				{ timeoutMs: AUTO_TAG_TIMEOUT_MS },
			),
		checkStatus: () =>
			runCheck("gemini", async (signal) => {
				// 과금 문구가 없는 목록 조회 1명으로 키를 확인한다. 잔액 조회 API가 없어 quota는 null이다(research 8절)
				await waitDefault(
					fetchJson(voicesUrl("ko-KR", 1), auth, signal, geminiCodes),
				);
				return { status: "connected", quota: null };
			}),
		listVoices: (_input: ListInputOf<"gemini">) =>
			allVoices().then((voices) => ({
				voices,
				next: null,
				total: voices.length,
				totalExact: true,
				windowLimited: false,
			})),
		// 미리 만든 성우는 한 명 조회가 404다(2026-10-13 실측). 목록에서 찾는다(Airy와 같다). 없으면 '현재 이용 불가'
		getVoice: (_source: VoiceSource, voiceId: string) =>
			allVoices().then(
				(voices) => voices.find((voice) => voice.voiceId === voiceId) ?? null,
			),
	};
}
