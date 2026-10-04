import { TypecastAPIError, TypecastClient } from "@neosapience/typecast-js";
import { z } from "zod";

import type { Voice } from "./contract";
import {
	fieldNames,
	type ProviderClient,
	ProviderHttpError,
	providerError,
	runCheck,
	runList,
} from "./errors";

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
			hostname: /(^|\.)typecast\.ai$/,
			normalize: true,
		})
		.nullish()
		.catch(null),
});

// SDK 오류는 상태 코드만 바꿔 담는다. 응답 헤더를 주지 않는다(Retry-After 없음).
function toHttpError(error: unknown): never {
	throw error instanceof TypecastAPIError
		? new ProviderHttpError(error.statusCode)
		: error;
}

function toVoice(raw: z.infer<typeof rawVoiceSchema>): Voice {
	const english = raw.voice_name.eng.trim();
	const name = raw.voice_name.kor.trim() || english;
	return {
		provider: "typecast",
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
		generatedBy: "claude-code",
	});
	return {
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
				const voices = new Map<string, Voice>();
				const dropped: unknown[] = [];
				for (const item of originals) {
					const parsed = rawVoiceSchema.safeParse(item);
					if (!parsed.success) {
						dropped.push(parsed.error);
						continue;
					}
					const voice = toVoice(parsed.data);
					// 같은 id가 다시 오면 처음 것만 남긴다(화면의 React 키와 재생 상태가 id로 묶인다)
					if (!voices.has(voice.voiceId)) voices.set(voice.voiceId, voice);
				}
				if (dropped.length > 0) {
					// 뺀 수와 필드 이름만 남긴다(값·메시지 없음).
					console.error(
						`[voiceList] typecast 성우 ${dropped.length}명 제외: ${fieldNames(dropped).join(", ")}`,
					);
					// 모두 빠지면 공급자가 모양을 바꾼 것이다. 빈 목록이 아니라 응답 이상으로 보인다.
					if (voices.size === 0)
						throw providerError("typecast", "provider_error");
				}
				return {
					provider: "typecast" as const,
					voices: [...voices.values()],
					fetchedAt: new Date().toISOString(),
				};
			}),
	};
}
