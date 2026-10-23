import { createRouterClient } from "@orpc/server";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers/index";
import {
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `trial-iso-a-${Date.now()}`;
const B = `trial-iso-b-${Date.now()}`;
const synthesize = vi.fn(async () => new Uint8Array([0xff, 0xfb, 0x90, 0x64]));
const providers: Providers = { typecast: { checkStatus: vi.fn(), synthesize } };
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers } as Context,
	});
let dbTouches = 0;
const failingDb = new Proxy(
	{},
	{
		get() {
			dbTouches += 1;
			throw new Error("db access without owner");
		},
	},
) as Context["db"];
const request: TrialRequest = {
	provider: "typecast",
	voiceId: "tc_0001",
	text: "안녕하세요",
	settings: DEFAULT_SETTINGS.typecast,
};

describe.skipIf(!url)("시험 생성 소유자 격리(AC15)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		synthesize.mockClear();
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.$client.end();
	});

	it("A의 결과는 B가 찾기·목록·오디오·지우기로 닿지 않고 A의 행은 그대로다", async () => {
		const made = await as(A).trialCreate({
			requestId: crypto.randomUUID(),
			request,
		});
		expect(await as(B).trialFind(request)).toBeNull();
		expect(await as(B).trialFindMany([request])).toEqual([null]);
		expect((await as(A).trialFindMany([request]))[0]?.id).toBe(made.id);
		expect(
			await as(B).trialList({ provider: "typecast", voiceId: "tc_0001" }),
		).toEqual([]);
		await expect(as(B).trialAudio({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(as(B).trialDelete({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect((await as(A).trialAudio({ id: made.id })).id).toBe(made.id);
	});

	it("같은 요청 id를 A와 B가 써도 섞이지 않는다(Review Focus 5)", async () => {
		const id = crypto.randomUUID();
		const a = await as(A).trialCreate({ requestId: id, request });
		const b = await as(B).trialCreate({
			requestId: id,
			request: { ...request, text: "다른 문장" },
		});
		expect(b.id).not.toBe(a.id);
		expect(synthesize).toHaveBeenCalledTimes(2);
	});

	it("B가 만드는 중이어도 A는 막히지 않는다", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return new Uint8Array([0xff]);
		});
		const pending = as(B).trialCreate({
			requestId: crypto.randomUUID(),
			request,
		});
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		await expect(
			as(A).trialCreate({ requestId: crypto.randomUUID(), request }),
		).resolves.toMatchObject({
			usage: { unit: "credit" },
		});
		release();
		await pending;
	});

	it("소유자가 없으면 여섯 프로시저 모두 UNAUTHORIZED이고 공급자 0회(AC14)", async () => {
		dbTouches = 0;
		const unauthorized = { code: "UNAUTHORIZED" };
		const id = crypto.randomUUID();
		await expect(as(null, failingDb).trialModels()).rejects.toMatchObject(
			unauthorized,
		);
		await expect(as(null, failingDb).trialFind(request)).rejects.toMatchObject(
			unauthorized,
		);
		await expect(
			as(null, failingDb).trialFindMany([request]),
		).rejects.toMatchObject(unauthorized);
		await expect(
			as(null, failingDb).trialCreate({ requestId: id, request }),
		).rejects.toMatchObject(unauthorized);
		await expect(
			as(null, failingDb).trialList({
				provider: "typecast",
				voiceId: "tc_0001",
			}),
		).rejects.toMatchObject(unauthorized);
		await expect(as(null, failingDb).trialAudio({ id })).rejects.toMatchObject(
			unauthorized,
		);
		await expect(as(null, failingDb).trialDelete({ id })).rejects.toMatchObject(
			unauthorized,
		);
		expect(synthesize).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});
});
