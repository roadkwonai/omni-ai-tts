// packages/api/src/my-voice-contract.ts
import { z } from "zod";

import { cleanText } from "./classification-rules";
import {
	CLONE_PROVIDERS,
	CONSENT_MAX,
	myVoiceNameProblem,
	SOURCE_MAX,
} from "./my-voice-rules";
import { voiceSchema } from "./providers/contract";

// 내 보이스(클론) 프로시저의 입력·출력(T13 계획 2.3, ADR 0011). 원본 조건과 이름 규칙은 zod 없는 my-voice-rules.ts에 있고 화면은 그쪽을 import한다.
// 모르는 키(ownerId 등)는 버려진다
export * from "./my-voice-rules";

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

export const myVoiceNameSchema = z
	.string()
	.refine((value) => myVoiceNameProblem(value) === null, { message: "name" })
	.transform(cleanText);

// MIME은 보지 않는다(서버가 바이트로 다시 검사). Gemini인데 동의 녹음이 없으면 핸들러가 consent_audio_missing으로 막는다
export const myVoiceCreateInputSchema = z.object({
	requestId: z.uuid(),
	provider: cloneProviderSchema,
	name: myVoiceNameSchema,
	consent: z.literal(true),
	source: z.file().max(SOURCE_MAX),
	consentAudio: z.file().max(CONSENT_MAX).optional(),
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
