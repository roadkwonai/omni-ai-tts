import { createRouterClient } from "@orpc/server";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { VoiceListPage } from "../providers/contract";
import { providerError } from "../providers/errors";
import type { Providers } from "../providers/index";
import { elAccountInput, elPublicInput } from "../providers/test-utils";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `iso-a-${Date.now()}`;
const B = `iso-b-${Date.now()}`;
const page: VoiceListPage = {
	voices: [],
	next: null,
	total: 0,
	totalExact: true,
	windowLimited: false,
};
const listVoices = vi.fn(async () => page);
const providers: Providers = {
	elevenlabs: { checkStatus: vi.fn(), listVoices },
};
const as = (ownerId: string) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers } as Context,
	});
const account = elAccountInput();
const publicList = elPublicInput();

describe.skipIf(!url)("목록 캐시 소유자 격리", () => {
	beforeEach(async () => {
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		listVoices.mockClear();
	});
	afterAll(async () => {
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("A가 받은 계정 목록은 B가 같은 조건으로 불러도 읽히지 않고 B는 공급자를 새로 부른다", async () => {
		await as(A).voiceList(account);
		await as(B).voiceList(account);
		expect(listVoices).toHaveBeenCalledTimes(2);
		const owners = (await db.select().from(providerListCache))
			.map((row) => row.ownerId)
			.sort();
		expect(owners).toEqual([A, B].sort());
	});

	it("A의 계정 행이 만료되고 공급자가 실패하면 B는 A의 지난 목록이 아니라 오류를 받는다(계획 리뷰 E9)", async () => {
		await as(A).voiceList(account);
		await db
			.update(providerListCache)
			.set({ expiresAt: new Date(Date.now() - 60_000) });
		listVoices.mockRejectedValueOnce(
			providerError("elevenlabs", "provider_error"),
		);
		await expect(as(B).voiceList(account)).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
	});

	it("B의 새로 고침은 A의 계정 행을 만료로 바꾸지 않는다", async () => {
		await as(A).voiceList(account);
		await as(B).voiceListRefresh({ provider: "elevenlabs" });
		await as(A).voiceList(account);
		expect(listVoices).toHaveBeenCalledTimes(1);
	});

	it("공개 목록 행은 A와 B가 함께 쓴다", async () => {
		await as(A).voiceList(publicList);
		await as(B).voiceList(publicList);
		expect(listVoices).toHaveBeenCalledTimes(1);
		const [row] = await db.select().from(providerListCache);
		expect(row?.ownerId).toBeNull();
	});
});
