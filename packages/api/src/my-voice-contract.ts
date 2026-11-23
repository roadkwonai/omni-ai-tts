// packages/api/src/my-voice-contract.ts
import { z } from "zod";

import { cleanText } from "./classification-rules";
import { voiceSchema } from "./providers/contract";
import { codePoints } from "./providers/trial-options";

// 내 보이스(클론) 프로시저의 입력·출력과 원본 조건(T13 계획 2.3, ADR 0011). 화면도 import하므로 서버 모듈·SDK·db를 import하지 않는다.
// 모르는 키(ownerId 등)는 버려진다

// 지금은 두 공급자만 받는다. 표(my_voice.provider)는 다섯 공급자를 받으므로 T13-b에서 여기만 넓힌다
export const CLONE_PROVIDERS = ["fish_audio", "gemini"] as const;
export type CloneProvider = (typeof CLONE_PROVIDERS)[number];

// 원본·동의 녹음 길이(초). Fish Audio는 앱 상한(공급자 권장 1~2분), Gemini 참조 10~30초, 동의 녹음은 앱 기준(스펙 3절)
export const CLONE_LIMITS = {
	fish_audio: { source: { min: 10, max: 60 } },
	gemini: { source: { min: 10, max: 30 }, consent: { min: 1, max: 20 } },
} as const;
// 브라우저가 만들고 서버가 다시 검사하는 WAV 형식: 24kHz 모노 16비트 PCM
export const CLONE_SAMPLE_RATE = 24_000;
export const CONSENT_VERSION = "2026-11-18";
// Gemini 동의 녹음에서 그대로 읽는 ko-KR 고정 문장(공급자 문서)
export const GEMINI_CONSENT_SENTENCE =
	"나는 이 음성의 소유자이며 구글이 이 음성을 사용하여 음성 합성 모델을 생성할 것을 허용합니다.";
export const MY_VOICE_NAME_MAX = 30;

// 60초 WAV 약 2.88MB, 20초 약 0.96MB. 합계 4MB로 Vercel 요청 본문 4.5MB 안이다(ADR 0011)
const SOURCE_BYTES_MAX = 3_000_000;
const CONSENT_BYTES_MAX = 1_000_000;

export function cloneLengthProblem<P extends CloneProvider>(
	provider: P,
	kind: keyof (typeof CLONE_LIMITS)[P],
	seconds: number,
): "short" | "long" | null {
	const range = CLONE_LIMITS[provider][kind] as { min: number; max: number };
	if (seconds < range.min) return "short";
	return seconds > range.max ? "long" : null;
}

export const myVoiceStatusSchema = z.enum([
	"sending",
	"processing",
	"ready",
	"failed",
	"unknown",
	"deleting",
]);
export type MyVoiceStatus = z.infer<typeof myVoiceStatusSchema>;

const cloneProviderSchema = z.enum(CLONE_PROVIDERS);

// 이름: 원문 1,000자 상한, T6 이름 정리(cleanText) 뒤 1~30 코드 포인트(script-contract titleSchema와 같은 꼴)
export const myVoiceNameSchema = z
	.string()
	.max(1000)
	.refine(
		(value) => {
			const name = cleanText(value);
			return name !== "" && codePoints(name) <= MY_VOICE_NAME_MAX;
		},
		{ message: "name" },
	)
	.transform(cleanText);

// MIME은 보지 않는다(서버가 바이트로 다시 검사). Gemini인데 동의 녹음이 없으면 핸들러가 consent_audio_missing으로 막는다
export const myVoiceCreateInputSchema = z.object({
	requestId: z.uuid(),
	provider: cloneProviderSchema,
	name: myVoiceNameSchema,
	consent: z.literal(true),
	source: z.file().max(SOURCE_BYTES_MAX),
	consentAudio: z.file().max(CONSENT_BYTES_MAX).optional(),
});
export const myVoiceIdInputSchema = z.object({ id: z.uuid() });
export const myVoiceRequestInputSchema = z.object({ requestId: z.uuid() });

export const myVoiceSchema = z.object({
	id: z.uuid(),
	provider: cloneProviderSchema,
	name: z.string(),
	status: myVoiceStatusSchema,
	reason: z.string().nullable(),
	createdAt: z.iso.datetime(),
	// 같은 (소유자, 공급자, 공급자 id)의 보관함 행. 보관함에서 뺐으면 null
	savedVoiceId: z.uuid().nullable(),
	// ready일 때만 있다(보관함에 담는 값과 같다)
	voice: voiceSchema.nullable(),
	presets: z.array(z.string()),
});
export type MyVoice = z.infer<typeof myVoiceSchema>;

export const myVoiceListSchema = z.object({
	items: z.array(myVoiceSchema),
	// 공급자 키가 있어 클론을 만들 수 있는가
	providers: z.object({ fish_audio: z.boolean(), gemini: z.boolean() }),
});
export type MyVoiceList = z.infer<typeof myVoiceListSchema>;
