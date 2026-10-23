import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createOpenAI,
	OPENAI_AUTO_TAG_TIMEOUT_MS,
	OPENAI_TEXT_MODEL,
} from "./openai";
import { calledUrl, fetchMock, json, useFetchMock } from "./test-utils";

// sk-로 시작하지 않는다(dev-cycle secrets 패턴)
const KEY = "test-openai-key-0001";
const PROMPT = {
	system: "You add acting tags.",
	input: '[{"index":0,"text":"안녕"}]',
	schema: { type: "object", required: ["lines"] },
};
const suggest = () => createOpenAI(KEY).suggestActing(PROMPT);
const hang = (_url: unknown, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
	});
const message = (...content: unknown[]) => ({ type: "message", content });
const failure = (status: number, code: string) =>
	json(status, { error: { code, type: code } });

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
});

describe("OpenAI 자동 태그 텍스트 호출(유료, T10 스펙 16.2)", () => {
	it("모델·지시문·입력·JSON schema strict·reasoning low·출력 상한·store false만 보낸다", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				output: [message({ type: "output_text", text: '{"lines":[]}' })],
			}),
		);
		await suggest();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(calledUrl().href).toBe("https://api.openai.com/v1/responses");
		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.method).toBe("POST");
		expect(init?.redirect).toBe("error");
		expect(new Headers(init?.headers).get("authorization")).toBe(
			`Bearer ${KEY}`,
		);
		expect(OPENAI_TEXT_MODEL).toBe("gpt-6-luna");
		expect(JSON.parse(String(init?.body))).toEqual({
			model: "gpt-6-luna",
			instructions: PROMPT.system,
			input: PROMPT.input,
			text: {
				format: {
					type: "json_schema",
					name: "auto_tags",
					schema: PROMPT.schema,
					strict: true,
				},
			},
			reasoning: { effort: "low" },
			max_output_tokens: 8192,
			store: false,
		});
	});

	it("message의 output_text를 이어 돌려준다(reasoning 항목은 건너뛴다)", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				output: [
					{ type: "reasoning" },
					message(
						{ type: "output_text", text: '{"a":' },
						{ type: "output_text", text: "1}" },
					),
				],
			}),
		);
		await expect(suggest()).resolves.toBe('{"a":1}');
	});

	it("거절(refusal)뿐이거나 message가 없으면 null", async () => {
		for (const output of [
			[message({ type: "refusal", refusal: "no" })],
			[{ type: "reasoning" }],
			[],
		]) {
			fetchMock.mockResolvedValueOnce(json(200, { output }));
			await expect(suggest()).resolves.toBeNull();
		}
	});

	it("401은 provider_auth, 429 insufficient_quota는 quota, 429 rate_limit_exceeded는 rate_limit, 모두 한 번만 부른다", async () => {
		fetchMock
			.mockResolvedValueOnce(failure(401, "invalid_api_key"))
			.mockResolvedValueOnce(failure(429, "insufficient_quota"))
			.mockResolvedValueOnce(failure(429, "rate_limit_exceeded"));
		for (const reason of ["provider_auth", "quota", "rate_limit"])
			await expect(suggest()).rejects.toMatchObject({
				data: { provider: "openai", reason },
			});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("45초 안에 답하지 않으면 처리 여부 미확인이다", async () => {
		expect(OPENAI_AUTO_TAG_TIMEOUT_MS).toBe(45_000);
		vi.useFakeTimers();
		fetchMock.mockImplementation(hang);
		const assertion = expect(suggest()).rejects.toMatchObject({
			data: { provider: "openai", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(OPENAI_AUTO_TAG_TIMEOUT_MS);
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("답 본문이 모양 밖이면 처리 여부 미확인이다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(json(200, { output: "x" }));
		await expect(suggest()).rejects.toMatchObject({
			data: { provider: "openai", reason: "unknown_outcome" },
		});
	});
});
