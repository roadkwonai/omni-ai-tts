import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { voiceListResultSchema } from "../providers/contract";
import { createProviders } from "../providers/index";
import { fetchMock, json, useFetchMock } from "../providers/test-utils";
import { appRouter } from "./index";

const KEY = "typecast-router-test-key-0001";
const as = (ownerId: string | null, providers: Context["providers"]) =>
	createRouterClient(appRouter, {
		context: { db: {} as Context["db"], ownerId, providers },
	});
const voice = {
	voice_id: "tc_0001",
	voice_name: { eng: "Minji", kor: "민지" },
	voice_type: "original",
	gender: "female",
	age: "young_adult",
	models: [{ version: "ssfm-v30", emotions: ["normal"] }],
	use_cases: ["Game"],
	preview_url: "https://static2.typecast.ai/preview/tc_0001.mp3",
};

useFetchMock();

describe("voiceList", () => {
	it("소유자가 없으면 UNAUTHORIZED이고 공급자를 부르지 않는다", async () => {
		await expect(
			as(null, createProviders({ typecast: KEY })).voiceList({
				provider: "typecast",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("키가 없거나 공백이면 PRECONDITION_FAILED·no_key이고 공급자를 부르지 않는다", async () => {
		for (const typecast of [undefined, "  "]) {
			await expect(
				as("local-admin", createProviders({ typecast })).voiceList({
					provider: "typecast",
				}),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				data: { provider: "typecast", reason: "no_key" },
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("정상 응답은 출력 스키마를 통과하고 결과에 키 문자열이 없다", async () => {
		fetchMock.mockResolvedValue(json(200, [voice]));
		const result = await as(
			"local-admin",
			createProviders({ typecast: KEY }),
		).voiceList({ provider: "typecast" });
		expect(voiceListResultSchema.parse(result)).toEqual(result);
		expect(result.voices).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain(KEY);
	});
});
