import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import { os, type RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// 시험 생성 결과는 base64 JSON이 아니라 바이너리로 보낸다(T5 스펙 5절, Vercel 4.5MB 한도).
// 이 저장소에서 처음 쓰는 방식이라 실제 핸들러·링크(앱과 같은 CSRF 플러그인)를 메모리 안에서 이어 확인한다(스펙 13절).
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
const router = {
	audio: os
		.output(z.object({ id: z.string(), audio: z.file() }))
		.handler(() => ({
			id: "x",
			audio: new File([MP3], "trial.mp3", { type: "audio/mpeg" }),
		})),
};

describe("oRPC File 출력", () => {
	it("multipart로 보내고 링크가 같은 바이트의 File로 돌려준다", async () => {
		const handler = new RPCHandler(router, {
			plugins: [new SimpleCsrfProtectionHandlerPlugin()],
		});
		let contentType = "";
		const link = new RPCLink({
			url: "http://127.0.0.1:3001/api/rpc",
			plugins: [new SimpleCsrfProtectionLinkPlugin()],
			fetch: async (request) => {
				const { response } = await handler.handle(request, {
					prefix: "/api/rpc",
					context: {},
				});
				contentType = response?.headers.get("content-type") ?? "";
				return response ?? new Response("Not found", { status: 404 });
			},
		});
		const client: RouterClient<typeof router> = createORPCClient(link);
		const result = await client.audio();
		expect(contentType).toMatch(/^multipart\/form-data/);
		expect(result.id).toBe("x");
		expect(result.audio).toBeInstanceOf(Blob);
		expect(result.audio.type).toBe("audio/mpeg");
		expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(MP3);
	});
});
