import { createRouterClient } from "@orpc/server";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `studio-iso-a-${Date.now()}`;
const B = `studio-iso-b-${Date.now()}`;
const synthesize = vi.fn(async () => new Uint8Array([0xff, 0xfb, 0x90, 0x64]));
const providers: Providers = { typecast: { checkStatus: vi.fn(), synthesize } };
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers } as Context,
	});
const request = {
	provider: "typecast" as const,
	voiceId: "tc_0001",
	text: "안녕하세요",
	settings: DEFAULT_SETTINGS.typecast,
};
const create = (ownerId: string) =>
	as(ownerId).studioCreate({ requestId: crypto.randomUUID(), request });
const keep = (ownerId: string) =>
	db.insert(savedVoice).values({
		ownerId,
		provider: "typecast",
		voiceId: "tc_0001",
		source: "public",
		voice: {
			...emptyVoice("typecast", "public"),
			voiceId: "tc_0001",
			name: "민지",
		},
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

// 소유자 없음은 DB를 쓰지 않아 skipIf 밖에서 늘 돈다(계획 리뷰 E4)
describe("작업실 소유자 없음(AC13)", () => {
	beforeEach(() => synthesize.mockClear());

	it("소유자가 없으면 다섯 프로시저 모두 UNAUTHORIZED이고 DB 접근·공급자 0회", async () => {
		dbTouches = 0;
		const none = as(null, failingDb);
		const id = crypto.randomUUID();
		const unauthorized = { code: "UNAUTHORIZED" };
		await expect(
			none.studioCreate({ requestId: id, request }),
		).rejects.toMatchObject(unauthorized);
		await expect(none.studioFind(request)).rejects.toMatchObject(unauthorized);
		await expect(none.studioList()).rejects.toMatchObject(unauthorized);
		await expect(none.studioAudio({ id, part: 0 })).rejects.toMatchObject(
			unauthorized,
		);
		await expect(none.studioDelete({ id })).rejects.toMatchObject(unauthorized);
		expect(dbTouches).toBe(0);
		expect(synthesize).not.toHaveBeenCalled();
	});
});

describe.skipIf(!url)("작업실 소유자 격리(AC13)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		synthesize.mockClear();
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.$client.end();
	});

	it("A의 결과는 B가 찾기·목록·조각·지우기로 닿지 않고 A의 행은 그대로다", async () => {
		await keep(A);
		const made = await create(A);
		expect(await as(B).studioFind(request)).toBeNull();
		expect(await as(B).studioList()).toEqual([]);
		await expect(
			as(B).studioAudio({ id: made.id, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(as(B).studioDelete({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect((await as(A).studioList()).map((item) => item.id)).toEqual([
			made.id,
		]);
		expect((await as(A).studioAudio({ id: made.id, part: 0 })).size).toBe(4);
	});

	it("B가 A만 담은 성우로 만들면 voice_unavailable이고 공급자 0회(T8 보안 메모)", async () => {
		await keep(A);
		await expect(create(B)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "voice_unavailable" },
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("같은 성우를 둘 다 담았으면 각자 만든 것만 자기 사용 이력에 센다", async () => {
		await keep(A);
		await keep(B);
		await create(B);
		const counts = await db
			.select({ ownerId: savedVoice.ownerId, useCount: savedVoice.useCount })
			.from(savedVoice);
		expect(
			Object.fromEntries(counts.map((row) => [row.ownerId, row.useCount])),
		).toEqual({ [A]: 0, [B]: 1 });
	});
});
