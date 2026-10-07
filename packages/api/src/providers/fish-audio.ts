import { z } from "zod";

import type { ListInputOf, Voice, VoiceSource } from "./contract";
import {
	fetchJson,
	fetchOk,
	logFailure,
	nullOnStatus,
	type ProviderClient,
	runCheck,
	runList,
	runTrial,
} from "./errors";
import { clip, emptyVoice, parseVoiceItems, queryOf } from "./list";
import { SAMPLE_HOST } from "./sample-hosts";
import {
	type FishModel,
	type FishSettings,
	sentText,
	type TrialRequest,
	usedSettings,
} from "./trial-options";

// Fish Audio는 SDK가 초기판이라 REST를 직접 부른다(ADR 0002).
const FISH_AUDIO_HOST = "https://api.fish.audio";

// 오류 본문 {status, message, reason}의 reason(있으면)
const fishErrorSchema = z.object({ reason: z.string().min(1) });
const fishCodes = (body: unknown) => {
	const reason = fishErrorSchema.safeParse(body).data?.reason;
	return reason ? [reason] : [];
};

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

const PAGE_SIZE = 100;
// 공개 목록은 조건마다 1,000명(10페이지)까지다(2026-10-04 실측: max_offset 1000, window_limited true)
const LAST_PAGE = 10;
// 목록은 조건에 따라 1.7~11.4초 걸렸다(2026-10-04 실측). 연결 확인은 10초 그대로다
export const FISH_LIST_TIMEOUT_MS = 20_000;

// 샘플은 https이고 Fish Audio 호스트일 때만(실측 platform.r2.fish.audio)
const sampleUrl = z.url({
	protocol: /^https$/,
	hostname: SAMPLE_HOST.fish_audio,
	normalize: true,
});
// 응답 모양. 어긋나면 목록 전체가 provider_error다
const rawVoicePageSchema = z.object({
	items: z.array(z.unknown()),
	total: z.number().int().nonnegative(),
	has_more: z.boolean().nullish(),
	total_is_exact: z.boolean().nullish(),
	window_limited: z.boolean().nullish(),
});
// type·state가 없거나 dmca_taken_down이 불리언이 아닌 항목은 모양이 어긋난 것이라 빼고 기록한다(parseVoiceItems, 계획 리뷰 E11)
// 이 API가 model이라 부르는 성우 개체는 코드에서 voice로 부른다(tts-provider)
const rawVoiceSchema = z.object({
	_id: z.string().min(1),
	type: z.string(),
	state: z.string(),
	visibility: z.string().nullish(),
	dmca_taken_down: z.boolean().nullish(),
	title: z.string().trim().min(1),
	description: z.string().nullish(),
	tags: z.array(z.string()).catch([]),
	languages: z.array(z.string()).nullish().catch(null),
	samples: z
		.array(z.looseObject({ title: z.string().nullish(), audio: z.unknown() }))
		.nullish()
		.catch(null),
	licensed: z.boolean().nullish().catch(null),
	pvc_release_state: z.string().nullish().catch(null),
	task_count: z.number().int().nonnegative().nullish().catch(null),
});

// 목록 필터에 유형·상태가 없어 합성할 수 없는 성우(svc, 학습 전, 삭제 요청)는 null을 돌려 기록 없이 뺀다(T4 스펙 3절)
// 공개 출처에는 공개 성우만 둔다(private·unlist가 섞여 오거나 visibility가 없어도 뺀다). 내 계정 출처는 visibility를 거르지 않는다(응답 모양 실측이 없다)
function fishVoice(
	raw: z.infer<typeof rawVoiceSchema>,
	source: VoiceSource,
): Voice | null {
	if (
		raw.type !== "tts" ||
		raw.state !== "trained" ||
		raw.dmca_taken_down === true ||
		(source === "public" && raw.visibility !== "public")
	)
		return null;
	// 같은 주소는 처음 것만 남긴다(화면 패널의 key가 주소다)
	const seen = new Set<string>();
	const samples = (raw.samples ?? []).flatMap((sample) => {
		const url = sampleUrl.safeParse(sample.audio);
		if (!url.success || seen.has(url.data)) return [];
		seen.add(url.data);
		return [
			{ language: null, title: sample.title?.trim() || null, url: url.data },
		];
	});
	return {
		...emptyVoice("fish_audio", source),
		voiceId: raw._id,
		name: raw.title,
		// 성별·연령은 필드가 없다. 태그(female, young …)는 화면이 공급자 분류로 보인다(추정하지 않는다)
		tags: [...new Set(raw.tags)],
		languages: raw.languages ?? [],
		origin: source === "account" ? "own" : null,
		description: clip(raw.description),
		previewUrl: samples[0]?.url ?? null,
		samples,
		usage:
			raw.task_count == null ? null : { kind: "tasks", count: raw.task_count },
		terms: {
			freeUsersAllowed: null,
			noticePeriodDays: null,
			liveModeration: false,
			creditRate: null,
			licensed: raw.licensed === true,
			retiring: raw.pvc_release_state === "retiring",
		},
	};
}

export function createFishAudio(apiKey: string): ProviderClient {
	const getJson = (path: string, signal: AbortSignal) =>
		fetchJson(
			`${FISH_AUDIO_HOST}${path}`,
			{ Authorization: `Bearer ${apiKey}` },
			signal,
		);
	return {
		synthesize: (request: Extract<TrialRequest, { provider: "fish_audio" }>) =>
			runTrial("fish_audio", async (signal) => {
				const s = usedSettings(request) as Partial<FishSettings> & {
					model: FishModel;
				};
				const response = await fetchOk(
					`${FISH_AUDIO_HOST}/v1/tts`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"Content-Type": "application/json",
							// 늘 보낸다. 빠지거나 모르는 값이면 오류 없이 유료 s2.1-pro로 처리된다(스펙 4절)
							model: s.model,
						},
						// 계약 필드로만 만든다. references(요청 안의 즉석 클론)는 보내지 않는다(tts-provider)
						body: JSON.stringify({
							text: sentText(request),
							reference_id: request.voiceId,
							temperature: s.temperature,
							prosody: { speed: s.speed },
							format: "mp3",
							mp3_bitrate: 128,
							latency: "normal",
						}),
						signal,
					},
					fishCodes,
				);
				return new Uint8Array(await response.arrayBuffer());
			}),
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
		listVoices: (input: ListInputOf<"fish_audio">) =>
			runList(
				"fish_audio",
				async (signal) => {
					const { source, page, query } = input;
					const body = rawVoicePageSchema.parse(
						await getJson(
							`/model?${queryOf({
								page_size: PAGE_SIZE,
								page_number: page,
								self: source === "account",
								title: query.search,
								language: query.language,
								tag: query.tags,
								// 내 계정(self=true)에서는 문서상 무시되므로 보내지 않는다
								licensed: source === "public" && query.licensed,
								sort_by: query.sort,
							})}`,
							signal,
						),
					);
					const more = body.has_more ?? page * PAGE_SIZE < body.total;
					return {
						voices: parseVoiceItems(
							"fish_audio",
							body.items,
							rawVoiceSchema,
							(raw) => fishVoice(raw, source),
						),
						next: more && page < LAST_PAGE ? page + 1 : null,
						total: body.total,
						totalExact: body.total_is_exact !== false,
						windowLimited:
							body.window_limited === true || (more && page >= LAST_PAGE),
					};
				},
				FISH_LIST_TIMEOUT_MS,
			),
		// 404·403과 합성할 수 없게 된 성우(fishVoice가 null: 학습 전·삭제 요청·공개 출처인데 비공개)는 '없음'이다(T7 계획 '스펙과 다른 점' 4)
		getVoice: (source: VoiceSource, voiceId: string) =>
			runList("fish_audio", async (signal) => {
				const raw = await nullOnStatus(
					getJson(`/model/${encodeURIComponent(voiceId)}`, signal),
					403,
					404,
				);
				return raw === null
					? null
					: fishVoice(rawVoiceSchema.parse(raw), source);
			}),
	};
}
