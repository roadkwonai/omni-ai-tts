import { z } from "zod";

import { memoSchema } from "./classification-contract";
import { type Voice, voiceSchema } from "./providers/contract";
import { isSampleUrl } from "./providers/sample-hosts";

// 성우 보관함 프로시저의 입력·출력(T7 스펙 3절). 담기의 voice는 클라이언트가 목록에서 받은 값이라 서버가 다시 검사한다:
// 계약 모양(https 포함) + 샘플 주소가 그 공급자 호스트 + 크기 상한. 다음 이용 가능 확인에서 공급자 값으로 바뀐다
const VOICE_JSON_MAX = 20_000;
const LINK_MAX = 50;

const sampleUrls = (voice: Voice) => [
	...(voice.previewUrl ? [voice.previewUrl] : []),
	...voice.samples.map((sample) => sample.url),
];
export const savedVoiceInputSchema = voiceSchema
	// 샘플 주소가 그 공급자의 허용 호스트(Gemini는 경로까지)인가. 해석되지 않는 주소는 isSampleUrl이 거른다
	.refine(
		(voice) =>
			sampleUrls(voice).every((url) => isSampleUrl(voice.provider, url)),
		{ message: "sample_host" },
	)
	// voiceId는 공급자 REST 경로에 들어간다(encodeURIComponent 앞에서 모양을 한 번 더 제한). Typecast·Airy·Gemini는 공개 목록만 있다
	.refine((voice) => /^[A-Za-z0-9_-]{1,200}$/.test(voice.voiceId), {
		message: "voice_id",
	})
	.refine(
		(voice) =>
			!["typecast", "airy", "gemini"].includes(voice.provider) ||
			voice.source === "public",
		{ message: "source" },
	)
	.refine((voice) => JSON.stringify(voice).length <= VOICE_JSON_MAX, {
		message: "too_large",
	});

const idsSchema = z
	.array(z.uuid())
	.max(LINK_MAX)
	.transform((ids) => [...new Set(ids)]);

// 주지 않은 필드는 바꾸지 않는다(처음 담기면 기본값 false·null)
export const savedVoiceSaveInputSchema = z.object({
	voice: savedVoiceInputSchema,
	favorite: z.boolean().optional(),
	frequent: z.boolean().optional(),
	memo: memoSchema.optional(),
});
// 그 성우의 연결을 이 목록으로 바꾼다(담기지 않았으면 담는다)
export const savedVoiceLinksInputSchema = z.object({
	voice: savedVoiceInputSchema,
	channelIds: idsSchema,
	classificationIds: idsSchema,
});

export const savedVoiceSchema = z.object({
	id: z.uuid(),
	voice: voiceSchema,
	favorite: z.boolean(),
	frequent: z.boolean(),
	memo: z.string().nullable(),
	unavailable: z.boolean(),
	channelIds: z.array(z.uuid()),
	classificationIds: z.array(z.uuid()),
});
export type SavedVoice = z.infer<typeof savedVoiceSchema>;
