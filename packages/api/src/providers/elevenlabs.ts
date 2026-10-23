import {
	ElevenLabsClient,
	ElevenLabsEnvironment,
	ElevenLabsError,
} from "@elevenlabs/elevenlabs-js";
import { z } from "zod";

import {
	type Accent,
	conditionValueSchema,
	type ListInputOf,
	type Voice,
	type VoiceListPage,
	type VoiceSample,
	type VoiceSource,
} from "./contract";
import {
	fetchJson,
	nullOnStatus,
	type ProviderClient,
	ProviderHttpError,
	providerError,
	runCheck,
	runList,
	runTrial,
	type SynthesizeOptions,
} from "./errors";
import { clip, emptyVoice, parseVoiceItems, queryOf } from "./list";
import { SAMPLE_HOST } from "./sample-hosts";
import type { TrialModelRate } from "./trial-contract";
import {
	ELEVENLABS_MODELS,
	type ElevenLabsModel,
	type ElevenLabsSettings,
	sentText,
	type TrialRequest,
	usedSettings,
} from "./trial-options";

// 오류 본문 {"detail":{"code","status",...}}에서 코드 후보를 뽑는다(권한 부족은 둘 중 하나에 온다).
const errorBodySchema = z.object({
	detail: z.object({
		code: z.string().optional(),
		status: z.string().optional(),
	}),
});

function detailCodes(body: unknown): string[] {
	const parsed = errorBodySchema.safeParse(body);
	if (!parsed.success) return [];
	const { code, status } = parsed.data.detail;
	return [code, status].filter((value): value is string => Boolean(value));
}

// SDK 오류는 상태 코드·공급자 오류 코드·Retry-After만 바꿔 담는다(연결 확인과 시험 생성이 함께 쓴다)
function toHttpError(error: unknown): never {
	throw error instanceof ElevenLabsError && error.statusCode !== undefined
		? new ProviderHttpError(
				error.statusCode,
				detailCodes(error.body),
				error.rawResponse?.headers.get("retry-after") ?? null,
			)
		: error;
}
// GET /v1/models 항목. 항목마다 검사해 모양이 다르거나 배율이 없는 모델·쓰지 않는 모델은 뺀다
// (응답 전체를 parse하면 쓰지 않는 모델 하나 때문에 배율 전체가 실패한다, T4 목록과 같은 규칙, 계획 리뷰 E11)
const modelSchema = z.looseObject({
	model_id: z.string(),
	model_rates: z.object({
		character_cost_multiplier: z.number().positive(),
		cost_discount_multiplier: z.number().positive().nullish(),
	}),
});
const isTrialModel = (id: string): id is ElevenLabsModel =>
	(ELEVENLABS_MODELS as readonly string[]).includes(id);

// 목록은 SDK 대신 REST로 부른다: SDK가 응답 전체를 한 번에 검사해 성우 하나의 빠진 필드가 목록 전체를 막는다(T4 계획 '스펙과 다른 점' 1).
const PAGE_SIZE = 100;

// 샘플은 https이고 ElevenLabs 저장소일 때만 오디오 src에 넣는다(2026-10-04 실측 호스트: storage.googleapis.com, api.us.elevenlabs.io)
const sampleUrl = z.url({
	protocol: /^https$/,
	hostname: SAMPLE_HOST.elevenlabs,
	normalize: true,
});
// 빈 글자는 null이다(실측: descriptive가 ""인 성우 1명)
const optionalText = z
	.string()
	.nullish()
	.transform((value) => value?.trim() || null);
// 언어별 샘플. 주소는 하나씩 검사해 어긋난 것만 버린다(samplesOf)
const verifiedSchema = z
	.array(
		z.looseObject({ language: z.string().min(1), preview_url: z.unknown() }),
	)
	.nullish()
	.catch(null);

// 공개 라이브러리 성우와 계정 성우가 함께 쓰는 필드
const commonFields = {
	voice_id: z.string().min(1),
	name: z.string().trim().min(1),
	category: optionalText,
	description: optionalText,
	preview_url: sampleUrl.nullish().catch(null),
	verified_languages: verifiedSchema,
};
const libraryVoiceSchema = z.object({
	...commonFields,
	gender: optionalText,
	age: optionalText,
	accent: optionalText,
	descriptive: optionalText,
	use_case: optionalText,
	language: optionalText,
	usage_character_count_1y: z
		.number()
		.int()
		.nonnegative()
		.nullish()
		.catch(null),
	free_users_allowed: z.boolean().nullish().catch(null),
	live_moderation_enabled: z.boolean().nullish().catch(null),
	notice_period: z.number().int().nonnegative().nullish().catch(null),
	rate: z.number().nonnegative().nullish().catch(null),
});
// 라이브러리 모양 + 계정 성우의 출처(공개 목록은 없음)
type ElRaw = z.infer<typeof libraryVoiceSchema> & { origin?: Voice["origin"] };
// 계정 성우는 label 맵을 라이브러리 모양으로 옮긴다. 이용 조건(free_users_allowed·rate 등)은 응답의 sharing 안에 있지만 계정 성우에는 쓰지 않는다(T4 범위 밖, ponytail: 조립 함수 하나)
const accountVoiceSchema = z
	.object({
		...commonFields,
		labels: z.record(z.string(), z.string()).nullish().catch(null),
		is_owner: z.boolean().nullish().catch(null),
	})
	.transform(({ labels, is_owner, ...raw }): ElRaw => {
		const label = (key: string) => labels?.[key]?.trim() || null;
		return {
			...raw,
			gender: label("gender"),
			age: label("age"),
			accent: label("accent"),
			descriptive: label("descriptive"),
			use_case: label("use_case"),
			language: label("language"),
			// 실측(2026-10-04, 31명): premade 21, 라이브러리에서 저장한 professional 9(sharing.status copied), 내가 만든 클론 1(is_owner)
			origin:
				raw.category === "premade" ? "premade" : is_owner ? "own" : "saved",
		};
	});
// 응답 모양. 어긋나면 목록 전체가 provider_error다
const libraryPageSchema = z.object({
	voices: z.array(z.unknown()),
	has_more: z.boolean(),
	total_count: z.number().int().nonnegative().nullish(),
});
const accountPageSchema = libraryPageSchema.extend({
	next_page_token: z.string().min(1).nullish(),
});
const accentsSchema = z.object({
	accents: z.array(z.object({ accent: z.string().min(1), name: z.string() })),
});

// 공급자 성별 값(소문자로 맞춘다. 문서 예시에 "Female"이 있다). 모르는 값은 null이다(추정하지 않는다)
function genderOf(value: string | null): Voice["gender"] {
	const lower = value?.toLowerCase();
	return lower === "male" || lower === "female" || lower === "neutral"
		? lower
		: null;
}
const present = (values: (string | null | undefined)[]) => [
	...new Set(values.filter((value): value is string => Boolean(value))),
];

// 언어별 샘플(verified_languages)과 기본 샘플을 같은 주소 없이 모은다. 같은 언어는 첫 샘플만 남긴다(모델·억양별로 여러 개 올 수 있다, 계획 리뷰 D21).
// 지금 언어 조건의 샘플이 맨 앞이고 행의 샘플이다(T4 스펙 3절). 그 언어 샘플이 없으면 행의 샘플은 기본 샘플(preview_url)이다.
function samplesOf(
	preview: string | null,
	verified: { language: string; preview_url: unknown }[] | null,
	preferred: string | null,
): { previewUrl: string | null; samples: VoiceSample[] } {
	const samples: VoiceSample[] = [];
	const seen = new Set<string>();
	const languages = new Set<string>();
	for (const entry of verified ?? []) {
		const url = sampleUrl.safeParse(entry.preview_url);
		if (!url.success || seen.has(url.data) || languages.has(entry.language))
			continue;
		seen.add(url.data);
		languages.add(entry.language);
		samples.push({ language: entry.language, title: null, url: url.data });
	}
	if (preview !== null && !seen.has(preview))
		samples.push({ language: null, title: null, url: preview });
	const index =
		preferred === null
			? -1
			: samples.findIndex((sample) => sample.language === preferred);
	if (index > 0) samples.unshift(...samples.splice(index, 1));
	return {
		previewUrl:
			index >= 0
				? (samples[0]?.url ?? null)
				: (preview ?? samples[0]?.url ?? null),
		samples,
	};
}

function elVoice(
	raw: ElRaw,
	source: VoiceSource,
	preferred: string | null,
): Voice {
	return {
		...emptyVoice("elevenlabs", source),
		voiceId: raw.voice_id,
		name: raw.name,
		gender: genderOf(raw.gender),
		age: raw.age,
		accent: raw.accent,
		useCases: present([raw.use_case]),
		descriptives: present([raw.descriptive]),
		languages: present([
			raw.language,
			...(raw.verified_languages ?? []).map((entry) => entry.language),
		]),
		category: raw.category,
		origin: raw.origin ?? null,
		description: clip(raw.description),
		...samplesOf(
			raw.preview_url ?? null,
			raw.verified_languages ?? null,
			preferred,
		),
		usage:
			raw.usage_character_count_1y == null
				? null
				: { kind: "chars_1y", count: raw.usage_character_count_1y },
		terms: {
			freeUsersAllowed: raw.free_users_allowed ?? null,
			noticePeriodDays: raw.notice_period ?? null,
			liveModeration: raw.live_moderation_enabled === true,
			creditRate: raw.rate ?? null,
			licensed: false,
			retiring: false,
		},
	};
}

export function createElevenLabs(apiKey: string): ProviderClient {
	// 키와 공식 호스트를 명시한다. 키가 빠지면 SDK가 ELEVENLABS_API_KEY로 대체하고, 그래도 없으면 생성자가 던진다.
	const client = new ElevenLabsClient({
		apiKey,
		environment: ElevenLabsEnvironment.Production,
		fetch: (input, init) =>
			globalThis.fetch(input, { ...init, redirect: "error" }),
	});

	const getJson = (path: string, query: URLSearchParams, signal: AbortSignal) =>
		fetchJson(
			`${ElevenLabsEnvironment.Production}${path}?${query}`,
			{ "xi-api-key": apiKey },
			signal,
			detailCodes,
		);

	async function listPage(
		input: ListInputOf<"elevenlabs">,
		signal: AbortSignal,
	): Promise<VoiceListPage> {
		if (input.source === "public") {
			const { query, page } = input;
			const body = libraryPageSchema.parse(
				await getJson(
					"/v1/shared-voices",
					queryOf({
						page_size: PAGE_SIZE,
						page,
						search: query.search,
						language: query.language,
						accent: query.accent,
						gender: query.gender,
						age: query.age,
						category: query.category,
						use_cases: query.useCases,
						descriptives: query.descriptives,
						featured: query.featured,
						sort: query.sort,
					}),
					signal,
				),
			);
			return {
				voices: parseVoiceItems(
					"elevenlabs",
					body.voices,
					libraryVoiceSchema,
					(raw) => elVoice(raw, "public", query.language),
				),
				next: body.has_more ? page + 1 : null,
				total: body.total_count ?? null,
				totalExact: body.total_count != null,
				windowLimited: false,
			};
		}
		const { query, cursor } = input;
		const body = accountPageSchema.parse(
			await getJson(
				"/v2/voices",
				queryOf({
					page_size: PAGE_SIZE,
					include_total_count: true,
					next_page_token: cursor,
					search: query.search,
					voice_type: query.voiceType,
					category: query.category,
					gender: query.gender,
					age: query.age,
					language: query.language,
					accent: query.accent,
					use_cases: query.useCases,
					sort: query.sort,
					sort_direction: query.direction,
				}),
				signal,
			),
		);
		return {
			voices: parseVoiceItems(
				"elevenlabs",
				body.voices,
				accountVoiceSchema,
				(raw) => elVoice(raw, "account", query.language),
			),
			next: body.has_more ? (body.next_page_token ?? null) : null,
			total: body.total_count ?? null,
			totalExact: body.total_count != null,
			windowLimited: false,
		};
	}
	return {
		synthesize: (
			request: Extract<TrialRequest, { provider: "elevenlabs" }>,
			options: SynthesizeOptions = {},
		) =>
			runTrial(
				"elevenlabs",
				async (signal) => {
					const s = usedSettings(request) as Partial<ElevenLabsSettings> & {
						model: ElevenLabsModel;
					};
					// SDK는 명시적 undefined를 null로 보낸다(설치본 직렬화, 계획 리뷰 E3). 그 모델이 받는 옵션만 키로 남긴다
					const voiceSettings = Object.fromEntries(
						Object.entries({
							stability: s.stability,
							similarityBoost: s.similarity,
							style: s.style,
							speed: s.speed,
							useSpeakerBoost: s.speakerBoost,
						}).filter(([, value]) => value !== undefined),
					);
					const stream = await client.textToSpeech
						.convert(
							request.voiceId,
							{
								text: sentText(request),
								modelId: s.model,
								outputFormat: "mp3_44100_128",
								voiceSettings,
							},
							// 자동 재시도를 끈다(기본 2회, 408·429·5xx). 시간 제한은 runTrial의 신호로 한다
							{ maxRetries: 0, abortSignal: signal },
						)
						.catch(toHttpError);
					return new Uint8Array(await new Response(stream).arrayBuffer());
				},
				// onLate는 넘기지 않는다: 이 공급자는 시간 초과 때 요청을 끊어 늦은 결과가 없다
				{ timeoutMs: options.timeoutMs, logPrefix: options.logPrefix },
			),
		listModels: () =>
			runList(
				"elevenlabs",
				async (signal): Promise<TrialModelRate[]> =>
					z
						.array(z.unknown())
						.parse(await getJson("/v1/models", new URLSearchParams(), signal))
						.flatMap((item) => {
							const model = modelSchema.safeParse(item).data;
							return model && isTrialModel(model.model_id)
								? [
										{
											model: model.model_id,
											multiplier:
												model.model_rates.character_cost_multiplier *
												(model.model_rates.cost_discount_multiplier ?? 1),
										},
									]
								: [];
						}),
			),
		checkStatus: () =>
			runCheck("elevenlabs", async (signal) => {
				// SDK가 응답 전체를 검사한다. 필수 필드가 없거나 숫자가 아니면 ParseError를 던져 확인 실패가 된다.
				// 재시도는 끈다(기본 2회). 시간 제한은 SDK timeoutInSeconds 대신 runCheck의 신호로 한다.
				const subscription = await client.user.subscription
					.get({ maxRetries: 0, abortSignal: signal })
					.catch(toHttpError);
				const { characterCount, characterLimit, maxCreditLimitExtension } =
					subscription;
				const remaining = characterLimit - characterCount;
				// 확장("unlimited" 또는 0이 아닌 수)이 있으면 한도를 넘어도 생성될 수 있어 한도 부족이 아니다.
				const overageAllowed = maxCreditLimitExtension !== 0;
				const resetUnix = subscription.nextCharacterCountResetUnix;
				return {
					status: remaining <= 0 && !overageAllowed ? "quota" : "connected",
					quota: {
						remaining,
						total: characterLimit,
						plan: null,
						resetAt:
							resetUnix === undefined
								? null
								: new Date(resetUnix * 1000).toISOString(),
						overageAllowed,
					},
				};
			}),
		listVoices: (input: ListInputOf<"elevenlabs">) =>
			runList("elevenlabs", (signal) => listPage(input, signal)),
		// 계정 성우만 확인한다. 공개 라이브러리 성우는 한 명 조회 방법이 문서에 없어 부르지 않는다(T7 계획 '스펙과 다른 점' 2).
		// 이 거절은 라우터 조건과 겹치지만 둔다: 계정 조회로 부르면 404가 와 이용 불가로 오판한다(계획 리뷰 P5 기각).
		// SDK voices.get은 응답 전체를 한 번에 검사하므로 목록처럼 REST로 부른다. 404만 '없음'이다(P6)
		getVoice: (
			source: VoiceSource,
			voiceId: string,
			preferred?: string | null,
		) =>
			runList("elevenlabs", async (signal) => {
				if (source === "public")
					throw providerError("elevenlabs", "provider_error");
				const body = await nullOnStatus(
					getJson(
						`/v1/voices/${encodeURIComponent(voiceId)}`,
						new URLSearchParams(),
						signal,
					),
					404,
				);
				return body === null
					? null
					: elVoice(
							accountVoiceSchema.parse(body),
							"account",
							preferred ?? null,
						);
			}),
		listAccents: (language: string) =>
			runList("elevenlabs", async (signal): Promise<Accent[]> => {
				const { accents } = accentsSchema.parse(
					await getJson("/v1/voices/accents", queryOf({ language }), signal),
				);
				// 억양 값은 조건 값으로 그대로 다시 보낸다. 입력 검사를 통과하지 못하는 값(공백 등)은 고르는 순간 BAD_REQUEST라 선택지에서 뺀다(계획 리뷰 E7)
				const usable = accents.filter(
					({ accent }) => conditionValueSchema.safeParse(accent).success,
				);
				if (usable.length < accents.length) {
					console.error(
						`[voiceList] elevenlabs 억양 ${accents.length - usable.length}개 제외: accent`,
					);
				}
				return usable.map(({ accent, name }) => ({ value: accent, name }));
			}),
	};
}
