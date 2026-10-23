import { z } from "zod";

import { fetchOk, type ProviderClient, runTrial } from "./errors";

export const OPENAI_TEXT_MODEL = "gpt-6-luna";
// 시도마다 45초(T10 스펙 16.2). 다시 부르기는 askSuggestions가 한다
export const OPENAI_AUTO_TAG_TIMEOUT_MS = 45_000;

const OPENAI_HOST = "https://api.openai.com";

// 자동 태그 텍스트만 쓰는 클라이언트. OpenAI는 TTS 공급자가 아니라 ProviderId에 없다(스펙 16.2)
export type TextClient = Required<Pick<ProviderClient, "suggestActing">>;

// 오류 본문 { error: { code, type } }에서 문자열인 것만 공급자 오류 코드로 쓴다
const errorSchema = z.object({
	error: z.object({ code: z.unknown(), type: z.unknown() }).partial(),
});
const openaiCodes = (body: unknown): string[] => {
	const error = errorSchema.safeParse(body).data?.error;
	return [error?.code, error?.type].filter(
		(code): code is string => typeof code === "string",
	);
};

// 모양을 읽지 못하면 던진다: runTrial이 처리 여부 미확인으로 바꾼다
const replySchema = z.object({
	output: z
		.array(
			z.object({
				type: z.string(),
				content: z
					.array(z.object({ type: z.string(), text: z.string().optional() }))
					.optional(),
			}),
		)
		.optional(),
});

// message 항목의 output_text를 잇는다. 없으면(refusal 포함) null이고 라우터가 auto_tag_reply로 본다
const textOf = (body: unknown): string | null => {
	const text = (replySchema.parse(body).output ?? [])
		.filter((item) => item.type === "message")
		.flatMap((item) => item.content ?? [])
		.filter((part) => part.type === "output_text")
		.map((part) => part.text ?? "")
		.join("");
	return text === "" ? null : text;
};

export const createOpenAI = (key: string): TextClient => ({
	suggestActing: ({ system, input, schema }) =>
		runTrial(
			"openai",
			async (signal) => {
				const response = await fetchOk(
					`${OPENAI_HOST}/v1/responses`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${key}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: OPENAI_TEXT_MODEL,
							instructions: system,
							input,
							text: {
								format: {
									type: "json_schema",
									name: "auto_tags",
									schema,
									strict: true,
								},
							},
							reasoning: { effort: "low" },
							max_output_tokens: 8192,
							store: false,
						}),
						signal,
					},
					openaiCodes,
				);
				return textOf(await response.json());
			},
			{ timeoutMs: OPENAI_AUTO_TAG_TIMEOUT_MS, logPrefix: "[autoTag]" },
		),
});
