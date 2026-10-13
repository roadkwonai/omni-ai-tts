import type { z } from "zod";

import type { ProviderId, Voice, VoiceSource } from "./contract";
import { fieldNames, providerError } from "./errors";

// 공급자가 주지 않은 필드의 기본값. 공급자 모듈은 { ...emptyVoice(…), 바뀌는 필드 }로 성우를 만든다.
// 이용 조건의 기본도 '주지 않음'이다(Typecast 전부, 계정 성우).
export const emptyVoice = (
	provider: ProviderId,
	source: VoiceSource,
): Omit<Voice, "voiceId" | "name"> => ({
	provider,
	source,
	englishName: null,
	gender: null,
	age: null,
	accent: null,
	pitch: null,
	personas: [],
	useCases: [],
	descriptives: [],
	tags: [],
	languages: [],
	category: null,
	origin: null,
	description: null,
	models: [],
	previewUrl: null,
	samples: [],
	usage: null,
	terms: {
		freeUsersAllowed: null,
		noticePeriodDays: null,
		liveModeration: false,
		creditRate: null,
		licensed: false,
		retiring: false,
	},
});

// 설명은 1,000자(UTF-16)까지 담는다(T4 스펙 6절: 응답·캐시 행 크기와 패널 높이를 묶는다). 비면 null
// 서로게이트 쌍 한가운데서 잘려 끝에 남은 짝 없는 high surrogate는 지운다(jsonb 캐시 쓰기가 실패한다)
export function clip(text: string | null | undefined): string | null {
	const trimmed = text?.trim();
	return trimmed
		? trimmed.slice(0, 1000).replace(/[\uD800-\uDBFF]$/, "")
		: null;
}

type QueryValue =
	| string
	| number
	| boolean
	| readonly string[]
	| null
	| undefined;

// 조건을 쿼리로 바꾼다. 빈 값·null·false는 보내지 않는다(공급자 기본값 그대로). 배열은 반복 키다(ElevenLabs SDK 직렬화와 Fish Audio 실측 2026-10-04).
export function queryOf(entries: Record<string, QueryValue>): URLSearchParams {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(entries)) {
		if (value == null || value === "" || value === false) continue;
		for (const one of [value].flat()) query.append(key, String(one));
	}
	return query;
}

// 성우 항목 단위 검증(T3 스펙 2절, T4 스펙 3절): 어긋난 성우만 빼고 뺀 수와 필드 이름만 한 줄 남긴다.
// 항목이 하나 이상인데 모두 빠지면 공급자가 모양을 바꾼 것이라 provider_error다. 같은 id는 처음 것만 남긴다(화면의 키가 id로 묶인다).
// toVoice가 null을 돌려준 항목은 공급자 모듈이 일부러 거른 성우라(Fish Audio의 합성할 수 없는 성우) 기록하지 않는다.
export function parseVoiceItems<T>(
	provider: ProviderId,
	items: readonly unknown[],
	schema: z.ZodType<T>,
	toVoice: (raw: T) => Voice | null,
): Voice[] {
	const voices = new Map<string, Voice>();
	const dropped: unknown[] = [];
	for (const item of items) {
		const parsed = schema.safeParse(item);
		if (!parsed.success) {
			dropped.push(parsed.error);
			continue;
		}
		const voice = toVoice(parsed.data);
		if (voice !== null && !voices.has(voice.voiceId))
			voices.set(voice.voiceId, voice);
	}
	if (dropped.length > 0) {
		console.error(
			`[voiceList] ${provider} 성우 ${dropped.length}명 제외: ${fieldNames(dropped).join(", ")}`,
		);
		if (voices.size === 0) throw providerError(provider, "provider_error");
	}
	return [...voices.values()];
}
