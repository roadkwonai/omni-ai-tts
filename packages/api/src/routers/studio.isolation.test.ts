import { createRouterClient } from "@orpc/server";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { ProviderId } from "../providers/contract";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import {
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `studio-iso-a-${Date.now()}`;
const B = `studio-iso-b-${Date.now()}`;
const synthesize = vi.fn(
	async (_request: TrialRequest) => new Uint8Array([0xff, 0xfb, 0x90, 0x64]),
);
// 두 공급자가 같은 가짜를 쓴다. 어느 공급자로 갔는지는 호출 인자의 provider로 본다
const providers: Providers = {
	typecast: { checkStatus: vi.fn(), synthesize },
	fish_audio: { checkStatus: vi.fn(), synthesize },
};
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
// Fish는 유료 모델로 보낸다(무료 모델 종료 뒤에도 성우 검사까지 닿는다)
const fishRequest = {
	provider: "fish_audio" as const,
	voiceId: "fish_0001",
	text: "안녕하세요",
	settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" as const },
};
const create = (ownerId: string, sent: TrialRequest = request) =>
	as(ownerId).studioCreate({ requestId: crypto.randomUUID(), request: sent });
const keep = (
	ownerId: string,
	provider: ProviderId = "typecast",
	voiceId = "tc_0001",
) =>
	db.insert(savedVoice).values({
		ownerId,
		provider,
		voiceId,
		source: "public",
		voice: {
			...emptyVoice(provider, "public"),
			voiceId,
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

	it("소유자가 없으면 네 프로시저 모두 UNAUTHORIZED이고 DB 접근·공급자 0회", async () => {
		dbTouches = 0;
		const none = as(null, failingDb);
		const id = crypto.randomUUID();
		const unauthorized = { code: "UNAUTHORIZED" };
		await expect(
			none.studioCreate({ requestId: id, request }),
		).rejects.toMatchObject(unauthorized);
		await expect(none.studioFind(request)).rejects.toMatchObject(unauthorized);
		await expect(none.studioFindMany([request])).rejects.toMatchObject(
			unauthorized,
		);
		await expect(none.studioAudio({ id, part: 0 })).rejects.toMatchObject(
			unauthorized,
		);
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

	it("A의 결과는 B가 찾기·여러 찾기·조각으로 닿지 않고, A는 자기 결과를 done으로 찾고 조각을 받는다", async () => {
		await keep(A);
		const made = await create(A);
		expect(await as(B).studioFind(request)).toBeNull();
		expect(await as(B).studioFindMany([request])).toEqual([null]);
		await expect(
			as(B).studioAudio({ id: made.id, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).studioFindMany([request])).toEqual([
			{ ...made, status: "done" },
		]);
		expect((await as(A).studioAudio({ id: made.id, part: 0 })).size).toBe(4);
	});

	it("B가 A가 담은 Fish 성우로 studioCreate하면 voice_unavailable, 공급자 0회", async () => {
		await keep(A, "fish_audio", "fish_0001");
		await expect(create(B, fishRequest)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { provider: "fish_audio", reason: "voice_unavailable" },
		});
		expect(synthesize).not.toHaveBeenCalled();
		// 같은 요청을 담은 A는 Fish로 만든다(거절이 소유권 때문임을 보인다)
		await create(A, fishRequest);
		expect(synthesize.mock.calls.map(([sent]) => sent.provider)).toEqual([
			"fish_audio",
		]);
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
