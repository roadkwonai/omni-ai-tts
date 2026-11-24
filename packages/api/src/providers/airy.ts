import { z } from "zod";

import type { ListInputOf, Voice, VoiceSample, VoiceSource } from "./contract";
import {
	audioBytes,
	fetchJson,
	fetchOk,
	logFailure,
	type ProviderClient,
	providerError,
	runCheck,
	runList,
	runTrial,
	type SynthesizeOptions,
	withTimeout,
} from "./errors";
import { emptyVoice, parseVoiceItems } from "./list";
import { SAMPLE_HOST } from "./sample-hosts";
import { voiceIdSchema } from "./trial-contract";
import { sentText, type TrialRequest } from "./trial-options";

// Airy는 SDK가 없어 REST를 직접 부른다(ADR 0002, Fish Audio와 같은 방식). 리다이렉트는 fetchOk가 막는다
const AIRY_HOST = "https://api.airy.so";
// 공개 카탈로그(문서 없음, 키 불필요)는 목록 제한(10초)보다 먼저 끊는다. 걸려도 목록은 샘플 없이 돌아온다(계획에서 정한 것 3)
export const AIRY_CATALOG_TIMEOUT_MS = 8_000;

// 오류 본문 { error: { type, code, message, param }, request_id }에서 code만 읽는다. 메시지는 읽지 않는다
const airyErrorSchema = z.object({
	error: z.object({ code: z.string().min(1).max(60) }),
});
const airyCodes = (body: unknown) => {
	const code = airyErrorSchema.safeParse(body).data?.error.code;
	return code ? [code] : [];
};

// tier는 화면에 그대로 찍히므로 1~40자만 받는다. 어긋나면 플랜만 비운다
const balanceSchema = z.object({
	total_balance: z.number(),
	tier: z.string().trim().min(1).max(40).nullish().catch(null),
});

// 공식 목록과 공개 카탈로그의 최상위 모양(둘 다 { voices: [...] }). 공식 목록이 어긋나면 provider_error, 카탈로그가 어긋나면 샘플만 없다
const voicesSchema = z.object({ voices: z.array(z.unknown()) });
// 성우 id는 시험 생성과 같은 voiceIdSchema로 받는다(본문에 그대로 들어간다). 이름·언어는 공용 캐시 행과 화면에 그대로 가므로 상한을 둔다(E12)
const rawVoiceSchema = z.object({
	id: voiceIdSchema,
	name: z.string().trim().min(1).max(200),
	gender: z.string().nullish(),
	langs: z.array(z.string().max(20)).max(20).nullish().catch(null),
});

const sampleUrl = z.url({
	protocol: /^https$/,
	hostname: SAMPLE_HOST.airy,
	normalize: true,
});
// 카탈로그 성우 하나. 어긋나면 그 성우만 샘플이 없다(로그 없음)
const catalogVoiceSchema = z.object({
	id: z.string().min(1),
	audio_url: z.object({
		ko: sampleUrl.nullish().catch(null),
		en: sampleUrl.nullish().catch(null),
	}),
});

// 한국어 먼저(행 샘플, 스펙 2절). 이름표는 화면 sampleLabel이 언어로 만든다. 같은 주소는 하나만(화면 패널의 key가 주소다)
function samplesById(body: unknown): Map<string, VoiceSample[]> {
	const byId = new Map<string, VoiceSample[]>();
	for (const item of voicesSchema.parse(body).voices) {
		const parsed = catalogVoiceSchema.safeParse(item);
		if (!parsed.success) continue;
		const { ko, en } = parsed.data.audio_url;
		byId.set(parsed.data.id, [
			...(ko ? [{ language: "ko", title: null, url: ko }] : []),
			...(en && en !== ko ? [{ language: "en", title: null, url: en }] : []),
		]);
	}
	return byId;
}

function airyVoice(
	raw: z.infer<typeof rawVoiceSchema>,
	samples: VoiceSample[] = [],
): Voice {
	return {
		...emptyVoice("airy", "public"),
		voiceId: raw.id,
		name: raw.name,
		// 모르는 성별 값은 '정보 없음'이다. 이름으로 추정하지 않는다
		gender:
			raw.gender === "male" || raw.gender === "female" ? raw.gender : null,
		languages: raw.langs ?? [],
		previewUrl: samples[0]?.url ?? null,
		samples,
	};
}

// 공개 카탈로그는 키를 보내지 않는다(문서 없는 주소에 키를 맡기지 않는다). 실패하면 샘플만 없다(스펙 2절). 오류 이름만 한 줄
// ponytail: 목록이 먼저 실패해도 카탈로그는 8초까지 돈다(키 없는 무료 조회). 카탈로그 실패 목록도 24시간 공용 캐시에 들어가고 '목록 새로 고침'이 회복한다(화면 안내 줄, 계획 리뷰 E1·U1). 자주 보이면 cachedList에 '저장하지 않음' 신호를 더한다
const catalog = (): Promise<Map<string, VoiceSample[]>> =>
	withTimeout(
		(signal) => fetchJson(`${AIRY_HOST}/v1/studio/voices`, {}, signal),
		AIRY_CATALOG_TIMEOUT_MS,
	)
		.then(samplesById)
		.catch((error: unknown) => {
			logFailure("[voiceList] airy 샘플 카탈로그 실패", error, []);
			return new Map();
		});

export function createAiry(apiKey: string): ProviderClient {
	const auth = { Authorization: `Bearer ${apiKey}` };

	// 공식 목록과 카탈로그를 함께 부르고 id로 샘플을 붙인다. 클라이언트는 요청마다 만들어지므로(apps/web/src/context.ts)
	// 한 요청에서 목록은 한 번만 부른다(이용 가능 확인, 스펙 2절). 실패한 약속도 그 요청 안에서는 다시 쓴다
	let listing: Promise<Voice[]> | undefined;
	const allVoices = () => {
		listing ??= runList("airy", async (signal) => {
			const [body, samples] = await Promise.all([
				fetchJson(`${AIRY_HOST}/v1/voices`, auth, signal, airyCodes),
				catalog(),
			]);
			const items = voicesSchema.parse(body).voices;
			// 104명 카탈로그가 갑자기 0명이면 이상 상태다. 지난 목록을 쓰고 보관함 확인은 행을 바꾸지 않게 한다
			if (items.length === 0) throw providerError("airy", "provider_error");
			return parseVoiceItems("airy", items, rawVoiceSchema, (raw) =>
				airyVoice(raw, samples.get(raw.id)),
			);
		});
		return listing;
	};

	return {
		// 매개변수는 이 공급자의 요청만 받는다(메서드 이변성, ProviderClient 주석)
		synthesize: (
			request: Extract<TrialRequest, { provider: "airy" }>,
			options: SynthesizeOptions = {},
		) =>
			runTrial(
				"airy",
				async (signal) => {
					const { model, language, style } = request.settings;
					const response = await fetchOk(
						`${AIRY_HOST}/v1/audio/speech`,
						{
							method: "POST",
							headers: { ...auth, "Content-Type": "application/json" },
							// 계약 필드 여섯만 서버가 만든다. trailing_silence·다른 형식은 보내지 않는다(스펙 2절)
							body: JSON.stringify({
								model,
								input: sentText(request),
								voice: request.voiceId,
								language,
								style,
								response_format: "mp3",
							}),
							signal,
						},
						airyCodes,
					);
					return audioBytes(await response.arrayBuffer());
				},
				// onLate는 넘기지 않는다: 이 공급자는 시간 초과 때 요청을 끊어 늦은 결과가 없다
				{ timeoutMs: options.timeoutMs, logPrefix: options.logPrefix },
			),
		checkStatus: () =>
			runCheck("airy", async (signal) => {
				const { total_balance, tier } = balanceSchema.parse(
					await fetchJson(
						`${AIRY_HOST}/v1/credits/balance`,
						auth,
						signal,
						airyCodes,
					),
				);
				return {
					// 0 이하이면 한도 부족(Typecast와 같다, 스펙 2절)
					status: total_balance <= 0 ? "quota" : "connected",
					quota: {
						remaining: total_balance,
						total: null,
						plan: tier ?? null,
						resetAt: null,
						overageAllowed: false,
					},
				};
			}),
		listVoices: (_input: ListInputOf<"airy">) =>
			allVoices().then((voices) => ({
				voices,
				next: null,
				total: voices.length,
				totalExact: true,
				windowLimited: false,
			})),
		// 한 명 조회 호출이 없어 목록에서 찾는다(research 2절). 없으면 '현재 이용 불가'
		// ponytail: 카탈로그만 실패한 확인에서는 저장한 정보의 샘플이 비워진다(다음 확인에서 돌아온다, 백로그 T7.5-02). 자주 보이면 라우터가 이전 샘플을 남긴다
		getVoice: (_source: VoiceSource, voiceId: string) =>
			allVoices().then(
				(voices) => voices.find((voice) => voice.voiceId === voiceId) ?? null,
			),
	};
}
