import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers";
import { emptyVoice } from "../providers/list";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `saved-iso-a-${Date.now()}`;
const B = `saved-iso-b-${Date.now()}`;
const as = (
	ownerId: string | null,
	database: Context["db"] = db,
	providers: Providers | null = null,
) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers } as Context,
	});
const VOICE = {
	...emptyVoice("typecast", "public"),
	voiceId: "tc_a",
	name: "민지",
};

describe.skipIf(!url)("성우 보관함 소유자 격리(스펙 8절 8번)", () => {
	beforeEach(async () => {
		await db.delete(savedVoice);
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(savedVoice);
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("B는 A의 담은 성우를 보지 못하고 빼지 못하며, 같은 성우를 따로 담는다", async () => {
		const mine = await as(A).savedVoiceSave({
			voice: VOICE,
			favorite: true,
			memo: "A 메모",
		});
		expect(await as(B).savedVoiceList()).toEqual([]);
		await expect(as(B).savedVoiceRemove({ id: mine.id })).rejects.toMatchObject(
			{
				code: "NOT_FOUND",
			},
		);
		const theirs = await as(B).savedVoiceSave({ voice: VOICE });
		expect(theirs.id).not.toBe(mine.id);
		expect(theirs).toMatchObject({ favorite: false, memo: null });
		expect(await as(A).savedVoiceList()).toEqual([mine]);
	});

	it("B가 A의 채널·분류 id를 자기 성우에 붙이면 NOT_FOUND이고 A의 수는 그대로", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const cat = await as(A).classificationCreate({
			kind: "category",
			name: "A 분류",
			memo: "",
		});
		await expect(
			as(B).savedVoiceLinks({
				voice: VOICE,
				channelIds: [ch.id],
				classificationIds: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).savedVoiceLinks({
				voice: VOICE,
				channelIds: [],
				classificationIds: [cat.id],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await as(A).channelList())[0]?.voiceCount).toBe(0);
		expect((await as(A).classificationList())[0]?.voiceCount).toBe(0);
		// 처음 담는 성우였으므로 트랜잭션이 담기까지 되돌렸다
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("입력에 ownerId를 끼워도 소유자는 서버가 정한 값이다", async () => {
		await as(B).savedVoiceSave({ voice: VOICE, ownerId: A } as never);
		expect(await as(A).savedVoiceList()).toEqual([]);
		expect(await as(B).savedVoiceList()).toHaveLength(1);
	});

	it("Airy 성우도 같은 소유자 규칙이다: B는 A의 Airy 성우를 보지 못하고 따로 담는다(샘플 호스트·DB 검사 제약 포함)", async () => {
		const url =
			"https://assets.airy.so/airy/voice_pack/vp-v9/audio/ko/a597bb7a98fc9ec1.opus";
		const airy = {
			...emptyVoice("airy", "public"),
			voiceId: "a597bb7a98fc9ec1",
			name: "Silvia",
			previewUrl: url,
			samples: [{ language: "ko", title: null, url }],
		};
		const mine = await as(A).savedVoiceSave({ voice: airy, memo: "A 메모" });
		expect(mine.voice.previewUrl).toBe(url);
		expect(await as(B).savedVoiceList()).toEqual([]);
		await expect(as(B).savedVoiceRemove({ id: mine.id })).rejects.toMatchObject(
			{
				code: "NOT_FOUND",
			},
		);
		const theirs = await as(B).savedVoiceSave({ voice: airy });
		expect(theirs.id).not.toBe(mine.id);
		expect(theirs.memo).toBeNull();
		expect(await as(A).savedVoiceList()).toEqual([mine]);
	});
});

describe("소유자 없음(스펙 8절 9번)", () => {
	it("프로시저 5개 모두 UNAUTHORIZED이고 DB·공급자 접근이 0회", async () => {
		const getVoice = vi.fn(async () => null);
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
		const nobody = as(null, failingDb, {
			typecast: { checkStatus: vi.fn(), getVoice },
		});
		const id = crypto.randomUUID();
		for (const call of [
			() => nobody.savedVoiceList(),
			() => nobody.savedVoiceCheck(),
			() => nobody.savedVoiceSave({ voice: VOICE }),
			() =>
				nobody.savedVoiceLinks({
					voice: VOICE,
					channelIds: [],
					classificationIds: [],
				}),
			() => nobody.savedVoiceRemove({ id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
		expect(getVoice).not.toHaveBeenCalled();
	});
});
