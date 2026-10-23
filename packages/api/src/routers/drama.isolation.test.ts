import { createRouterClient } from "@orpc/server";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { DRAMA_SETTINGS, WAV_HEADER_BYTES } from "../drama-script";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `drama-iso-a-${Date.now()}`;
const B = `drama-iso-b-${Date.now()}`;
const synthesizeScene = vi.fn(async () => ({
	pcm: new Uint8Array(4),
	segments: null,
}));
const providers: Providers = {
	fish_audio: { checkStatus: vi.fn(), synthesizeScene },
};
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers } as Context,
	});
const request = {
	sceneName: "",
	speakers: [
		{ name: "지연", voiceId: "fa_jiyeon" },
		{ name: "민수", voiceId: "fa_minsu" },
	],
	lines: [
		{ speaker: 0, direction: "", text: "안녕" },
		{ speaker: 1, direction: "", text: "반가워" },
	],
	model: "s2.1-pro" as const,
	settings: DRAMA_SETTINGS,
};
const create = (ownerId: string) =>
	as(ownerId).dramaCreate({ requestId: crypto.randomUUID(), request });
const keep = (ownerId: string, voiceId: string) =>
	db.insert(savedVoice).values({
		ownerId,
		provider: "fish_audio",
		voiceId,
		source: "public",
		voice: { ...emptyVoice("fish_audio", "public"), voiceId, name: voiceId },
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

// 소유자 없음은 DB를 쓰지 않아 skipIf 밖에서 늘 돈다(T9 계획 리뷰 E4)
describe("드라마 소유자 없음(T9.5 스펙 8절 13번)", () => {
	beforeEach(() => synthesizeScene.mockClear());

	it("소유자가 없으면 네 프로시저 모두 UNAUTHORIZED이고 DB 접근·공급자 0회", async () => {
		dbTouches = 0;
		const none = as(null, failingDb);
		const id = crypto.randomUUID();
		const unauthorized = { code: "UNAUTHORIZED" };
		await expect(
			none.dramaCreate({ requestId: id, request }),
		).rejects.toMatchObject(unauthorized);
		await expect(none.dramaList()).rejects.toMatchObject(unauthorized);
		await expect(none.dramaAudio({ id, part: 0 })).rejects.toMatchObject(
			unauthorized,
		);
		await expect(none.dramaDelete({ id })).rejects.toMatchObject(unauthorized);
		expect(dbTouches).toBe(0);
		expect(synthesizeScene).not.toHaveBeenCalled();
	});
});

describe.skipIf(!url)("드라마 소유자 격리(T9.5 스펙 8절 13번)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		synthesizeScene.mockClear();
		await keep(A, "fa_jiyeon");
		await keep(A, "fa_minsu");
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.$client.end();
	});

	it("B는 A의 테이크를 목록·조각·지우기로 닿지 못하고 A의 테이크는 그대로다", async () => {
		const made = await create(A);
		expect(await as(B).dramaList()).toEqual([]);
		await expect(
			as(B).dramaAudio({ id: made.id, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(as(B).dramaDelete({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect((await as(A).dramaList()).map((item) => item.id)).toEqual([made.id]);
		expect((await as(A).dramaAudio({ id: made.id, part: 0 })).size).toBe(
			WAV_HEADER_BYTES + 4,
		);
	});

	it("B가 A만 담은 성우로 만들면(B는 한 명만 담음) voice_unavailable이고 공급자 0회", async () => {
		await keep(B, "fa_jiyeon");
		await expect(create(B)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { provider: "fish_audio", reason: "voice_unavailable" },
		});
		expect(synthesizeScene).not.toHaveBeenCalled();
		// 거절한 요청은 실패 행도 남기지 않는다(dramaList는 실패 행을 숨기므로 표를 직접 읽는다)
		expect(
			await db
				.select({ id: trialGeneration.id })
				.from(trialGeneration)
				.where(eq(trialGeneration.ownerId, B)),
		).toEqual([]);
	});
});
