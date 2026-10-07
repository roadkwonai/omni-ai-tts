import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { createProviders } from "../providers/index";
import { fetchMock, useFetchMock } from "../providers/test-utils";
import { appRouter } from "./index";

const KEY = "fish-router-test-key-0001";
const as = (ownerId: string | null, providers: Context["providers"]) =>
	createRouterClient(appRouter, {
		context: { db: {} as Context["db"], ownerId, providers },
	});

useFetchMock();

describe("providerStatus", () => {
	it("소유자가 없으면 UNAUTHORIZED이고 공급자를 부르지 않는다", async () => {
		await expect(
			as(null, createProviders({ fish_audio: KEY })).providerStatus({
				provider: "fish_audio",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("키가 없거나 공백이면 no_key이고 공급자를 부르지 않는다", async () => {
		const client = as(
			"local-admin",
			createProviders({ typecast: "", elevenlabs: "  " }),
		);
		for (const provider of [
			"typecast",
			"elevenlabs",
			"fish_audio",
			"airy",
		] as const) {
			await expect(client.providerStatus({ provider })).resolves.toMatchObject({
				provider,
				status: "no_key",
				quota: null,
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("없는 공급자 id는 BAD_REQUEST다", async () => {
		await expect(
			as("local-admin", createProviders({})).providerStatus({
				provider: "openai" as never,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("결과에 키 문자열이 없다(성공과 키 오류 모두)", async () => {
		const client = as("local-admin", createProviders({ fish_audio: KEY }));
		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ credit: "1.5" }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ type: "free", balance: 10, total: 8 }), {
					status: 200,
				}),
			);
		const ok = await client.providerStatus({ provider: "fish_audio" });
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ message: `bad key ${KEY}`, status: 401 }), {
				status: 401,
			}),
		);
		const denied = await client.providerStatus({ provider: "fish_audio" });
		expect(ok.status).toBe("connected");
		expect(ok.quota?.webCredit).toEqual({
			plan: "free",
			remaining: 10,
			total: 8,
		});
		expect(denied.status).toBe("provider_auth");
		expect(JSON.stringify([ok, denied])).not.toContain(KEY);
	});
});
