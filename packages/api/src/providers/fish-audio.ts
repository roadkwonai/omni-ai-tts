import { z } from "zod";

import {
	DRAMA_SAMPLE_RATE,
	mergeChunks,
	pcmSeconds,
	type SceneAudio,
	type SceneChunk,
	type SceneRequest,
} from "../drama-script";
import type { ListInputOf, Voice, VoiceSource } from "./contract";
import {
	CLONE_TIMEOUT_MS,
	type CloneState,
	fetchJson,
	fetchOk,
	logFailure,
	nullOnStatus,
	type ProviderClient,
	runCheck,
	runList,
	runTrial,
	SCENE_LATE_MAX_MS,
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
	trialError,
} from "./errors";
import { clip, emptyVoice, parseVoiceItems, queryOf } from "./list";
import { SAMPLE_HOST } from "./sample-hosts";
import { voiceIdSchema } from "./trial-contract";
import {
	type FishModel,
	type FishSettings,
	STUDIO_AUDIO_MAX,
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

// 클론(내 보이스) 응답의 상태(T13 계획 2.2). 모르는 state는 failed로 본다(id는 남겨 지울 수 있게)
const fishCloneSchema = z.object({
	_id: voiceIdSchema,
	state: z.enum(["created", "training", "trained", "failed"]).catch("failed"),
	quality: z
		.object({
			audios: z.array(
				z.object({ quality_passed: z.boolean().optional() }).catch({}),
			),
		})
		.nullish()
		.catch(null),
});
function fishCloneState({ state, quality }: z.infer<typeof fishCloneSchema>): {
	state: CloneState;
	reason?: string;
} {
	if (quality?.audios.some((audio) => audio.quality_passed === false))
		return { state: "failed", reason: "quality" };
	if (state === "trained") return { state: "ready" };
	return { state: state === "failed" ? "failed" : "processing" };
}

// 장면 SSE 이벤트는 두 층으로 읽는다(계획 리뷰 E1). 오디오(돈)는 느슨하게 읽어 정렬 모양이 달라도 잃지 않고,
// 정렬은 이벤트마다 엄격하게 읽는다(조사 4·9절 모양). alignment가 없거나 null인 이벤트는 정렬이 없는 것이다
const sceneAudioSchema = z.object({
	audio_base64: z.string().nullish(),
	// zod 4는 z.unknown() 칸도 있어야 한다고 본다
	alignment: z.unknown().optional(),
});
const sceneChunkSchema = z
	.object({
		alignment: z.object({
			segments: z.array(
				z.object({ text: z.string(), start: z.number(), end: z.number() }),
			),
			audio_duration: z.number(),
		}),
		chunk_seq: z.number().int().nonnegative(),
		chunk_audio_offset_sec: z.number().nonnegative(),
	})
	.transform(
		(event): SceneChunk => ({
			seq: event.chunk_seq,
			offset: event.chunk_audio_offset_sec,
			duration: event.alignment.audio_duration,
			segments: event.alignment.segments,
		}),
	);

// SSE 블록 구분(빈 줄)
const SSE_GAP = /\r?\n\r?\n/;
// 덜 온 블록 하나의 상한(글자). base64는 바이트의 약 4/3이고 JSON이 붙는다. 이보다 긴 블록은 오디오만으로 32MiB를 넘어 어차피 버려진다
const SSE_BLOCK_MAX = STUDIO_AUDIO_MAX * 2;

// SSE 본문을 조각마다 읽는다(조사 자료 pcm-check.mjs). 빈 줄로 블록을 나누고 덜 온 끝만 들고 있어 본문 전체를 한 문자열로 만들지 않는다(E14).
// 끝에 빈 줄 없이 남은 블록도 같은 규칙으로 읽는다(버리면 오디오가 잘려도 정상 결과처럼 보인다). JSON이 아니거나 오디오 칸 모양이 다르면 던진다(runTrial이 처리 여부 미확인으로 바꾼다)
// 오디오가 32MiB를 넘거나 덜 온 블록이 상한을 넘으면 더 읽지 않는다(for await를 빠져나가면 본문이 취소된다, 서버 리뷰)
async function readScene(response: Response): Promise<SceneAudio> {
	const decoder = new TextDecoder();
	const audio: Buffer[] = [];
	let pcmBytes = 0;
	const chunks: SceneChunk[] = [];
	let misshapen = false;
	const take = (block: string) => {
		const data = block
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trim())
			.join("");
		if (!data || data === "[DONE]") return;
		const event: unknown = JSON.parse(data);
		const { audio_base64, alignment } = sceneAudioSchema.parse(event);
		if (audio_base64) {
			const bytes = Buffer.from(audio_base64, "base64");
			audio.push(bytes);
			pcmBytes += bytes.length;
		}
		if (alignment == null) return;
		const chunk = sceneChunkSchema.safeParse(event);
		if (chunk.success) chunks.push(chunk.data);
		else misshapen = true;
	};
	// 덜 온 블록은 조각 배열로 들고, 구분은 새 조각과 앞 끝 3글자에서만 찾는다(구분은 최대 4글자). 덜 온 블록 전체를 조각마다 다시 훑지 않는다
	let pending: string[] = [];
	let pendingChars = 0;
	let tail = "";
	for await (const part of response.body ?? []) {
		const piece = decoder.decode(part, { stream: true });
		pending.push(piece);
		pendingChars += piece.length;
		if (SSE_GAP.test(tail + piece)) {
			const blocks = pending.join("").split(SSE_GAP);
			const rest = blocks.pop() ?? "";
			for (const block of blocks) take(block);
			pending = [rest];
			pendingChars = rest.length;
			tail = rest.slice(-3);
		} else tail = (tail + piece).slice(-3);
		// 넘은 오디오는 라우터가 audio_too_large(늦은 결과면 '늦은 결과 버림')로 버린다. 정렬은 쓰지 않는다
		if (pcmBytes > STUDIO_AUDIO_MAX)
			return { pcm: Buffer.concat(audio), segments: null };
		// 오디오는 상한 안인데 블록이 끝나지 않는다: 깨진 스트림
		if (pendingChars > SSE_BLOCK_MAX) throw new RangeError("SSE block");
	}
	take(pending.join("") + decoder.decode());
	const pcm = Buffer.concat(audio);
	if (pcm.byteLength === 0) throw trialError("fish_audio", "unknown_outcome");
	// 모양이 다른 정렬이 하나라도 있으면 장면의 정렬을 모두 버린다. 틀리게 자른 파일보다 나누지 못함이 낫다
	if (misshapen) {
		console.error("[drama] 정렬 버림: 모양");
		return { pcm, segments: null };
	}
	const segments = mergeChunks(chunks, pcmSeconds(pcm.byteLength));
	// 정렬이 왔는데 합치지 못했다(끝이 PCM 길이와 0.1초 넘게 다름). 정렬이 아예 없으면 남기지 않는다
	if (!segments && chunks.length > 0) console.error("[drama] 정렬 버림: 길이");
	return { pcm, segments };
}

export function createFishAudio(apiKey: string): ProviderClient {
	const getJson = (path: string, signal: AbortSignal) =>
		fetchJson(
			`${FISH_AUDIO_HOST}${path}`,
			{ Authorization: `Bearer ${apiKey}` },
			signal,
		);
	return {
		synthesize: (
			request: Extract<TrialRequest, { provider: "fish_audio" }>,
			options: SynthesizeOptions = {},
		) =>
			runTrial(
				"fish_audio",
				async (signal) => {
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
				},
				// onLate는 넘기지 않는다: 이 공급자는 시간 초과 때 요청을 끊어 늦은 결과가 없다
				{ timeoutMs: options.timeoutMs, logPrefix: options.logPrefix },
			),
		// 드라마 장면 1회(T9.5). runTrial의 신호는 넘기지 않는다. 넘기면 시간 초과(180초)에 요청이 끊겨 늦은 결과가 오지 않는다(계획 '스펙과 다른 점' 3)
		synthesizeScene: (
			scene: SceneRequest,
			options?: SynthesizeOptions<SceneAudio>,
		) =>
			runTrial(
				"fish_audio",
				async () => {
					// shortcut: 끊긴 요청은 늦은 상한(SCENE_LATE_MAX_MS 270초)까지 뒤에서 돌고 그동안 동시 1건에 들지 않는다(T9 P8과 같다).
					// 270초를 넘는 장면 결과는 잃는다(Vercel Hobby 함수 300초, ADR 0013). 그런 장면이 실제로 생기면 플랜을 다시 본다
					const cap = new AbortController();
					// AbortSignal.timeout()은 가짜 타이머로 진행되지 않는다(withTimeout과 같다)
					const timer = setTimeout(() => cap.abort(), SCENE_LATE_MAX_MS);
					try {
						const response = await fetchOk(
							`${FISH_AUDIO_HOST}/v1/tts/stream/with-timestamp`,
							{
								method: "POST",
								headers: {
									Authorization: `Bearer ${apiKey}`,
									"Content-Type": "application/json",
									// DRAMA_MODELS 값 그대로. 모르는 값이면 오류 없이 유료 s2.1-pro로 처리된다
									model: scene.model,
								},
								body: JSON.stringify({
									text: scene.text,
									// 화자 번호가 배열 위치다. 한 명이면 문자열로 보낸다
									reference_id:
										scene.referenceIds.length === 1
											? scene.referenceIds[0]
											: scene.referenceIds,
									format: "pcm",
									sample_rate: DRAMA_SAMPLE_RATE,
									temperature: scene.temperature,
									prosody: { speed: scene.speed },
									latency: "normal",
								}),
								signal: cap.signal,
							},
							fishCodes,
						);
						return await readScene(response);
					} finally {
						clearTimeout(timer);
					}
				},
				// 옵션 없이 불러도 작업실 시간(180초)이다. runTrial 기본 60초면 늦은 결과를 받을 곳 없이 일찍 끊긴다
				{ ...options, timeoutMs: options?.timeoutMs ?? STUDIO_TIMEOUT_MS },
			),
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
		// 내 보이스 클론 만들기 1회(T13). 비공개 고정, references(즉석 클론)·texts(없으면 ASR)는 보내지 않는다(tts-provider)
		cloneCreate: async ({ name, source }, options) => {
			const body = await runTrial(
				"fish_audio",
				async (signal) => {
					const form = new FormData();
					form.set("type", "tts");
					form.set("title", name);
					form.set("train_mode", "fast");
					form.set("visibility", "private");
					form.set("enhance_audio_quality", "true");
					form.set(
						"voices",
						// slice: BlobPart는 ArrayBuffer 기반 배열만 받는다(타입). 원본 3MB 이하라 복사해도 된다
						new Blob([source.slice()], { type: "audio/wav" }),
						"source.wav",
					);
					// Content-Type은 쓰지 않는다(fetch가 멀티파트 경계를 붙인다)
					const response = await fetchOk(
						`${FISH_AUDIO_HOST}/model`,
						{
							method: "POST",
							headers: { Authorization: `Bearer ${apiKey}` },
							body: form,
							signal: options.signal
								? AbortSignal.any([signal, options.signal])
								: signal,
						},
						fishCodes,
					);
					return (await response.json()) as unknown;
				},
				{ timeoutMs: CLONE_TIMEOUT_MS, logPrefix: "[myVoice]" },
			);
			// 응답은 받았는데 id를 쓸 수 없다. 처리 여부는 알지만 지울 id가 없어 공급자 오류로 보인다
			const parsed = fishCloneSchema.safeParse(body);
			if (!parsed.success) throw trialError("fish_audio", "provider_error");
			return { voiceId: parsed.data._id, ...fishCloneState(parsed.data) };
		},
		cloneGet: (voiceId: string) =>
			runList("fish_audio", async (signal) => {
				const raw = await nullOnStatus(
					getJson(`/model/${encodeURIComponent(voiceId)}`, signal),
					403,
					404,
				);
				return raw === null
					? null
					: { state: fishCloneState(fishCloneSchema.parse(raw)).state };
			}),
		cloneDelete: (voiceId: string) =>
			runTrial(
				"fish_audio",
				async (signal) => {
					await nullOnStatus(
						fetchOk(
							`${FISH_AUDIO_HOST}/model/${encodeURIComponent(voiceId)}`,
							{
								method: "DELETE",
								headers: { Authorization: `Bearer ${apiKey}` },
								signal,
							},
							fishCodes,
						),
						404,
					);
				},
				{
					timeoutMs: CLONE_TIMEOUT_MS,
					logPrefix: "[myVoice]",
					logLabel: "지우기 실패",
				},
			),
	};
}
