// packages/api/src/routers/preset.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import { channel } from "@tts-pilot-app/db/schema/classification";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `preset-iso-a-${Date.now()}`;
const B = `preset-iso-b-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const VOICE = {
	...emptyVoice("typecast", "public"),
	voiceId: "tc_a",
	name: "민지",
};
const SETTINGS = DEFAULT_SETTINGS.typecast;

async function clean() {
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(channel);
}

describe.skipIf(!url)("프리셋 소유자 격리(스펙 8절 11번)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("B는 A의 프리셋을 보지 못하고 고치기·덮어쓰기·복제·지우기가 NOT_FOUND이며 A는 그대로", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const mine = await as(A).presetCreate({
			name: "A 프리셋",
			channelId: ch.id,
			channelDefault: true,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
		});
		expect(await as(B).presetList()).toEqual([]);
		for (const call of [
			() =>
				as(B).presetUpdate({
					id: mine.id,
					name: "B가 바꿈",
					channelId: null,
					channelDefault: false,
				}),
			() =>
				as(B).presetOverwrite({
					id: mine.id,
					voice: VOICE,
					provider: "typecast",
					settings: { ...SETTINGS, tempo: 2 },
				}),
			() => as(B).presetDuplicate({ id: mine.id }),
			() => as(B).presetRemove({ id: mine.id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).presetList()).toEqual([mine]);
		// 덮어쓰기가 거절되며 B의 보관함에도 아무것도 담기지 않았다(트랜잭션 되돌림)
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("B가 A의 채널 id로 만들기·고치기는 NOT_FOUND이고 A 채널의 기본은 그대로", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const mine = await as(A).presetCreate({
			name: "A 프리셋",
			channelId: ch.id,
			channelDefault: true,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
		});
		await expect(
			as(B).presetCreate({
				name: "B 프리셋",
				channelId: ch.id,
				channelDefault: true,
				voice: VOICE,
				provider: "typecast",
				settings: SETTINGS,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const theirs = await as(B).presetCreate({
			name: "B 프리셋",
			channelId: null,
			channelDefault: false,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
		});
		await expect(
			as(B).presetUpdate({
				id: theirs.id,
				name: "B 프리셋",
				channelId: ch.id,
				channelDefault: true,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).presetList()).toEqual([mine]);
		expect((await as(B).presetList())[0]).toMatchObject({
			channelId: null,
			channelDefault: false,
		});
	});

	it("같은 이름도 소유자가 다르면 따로 만든다", async () => {
		const make = (owner: string) =>
			as(owner).presetCreate({
				name: "같은 이름",
				channelId: null,
				channelDefault: false,
				voice: VOICE,
				provider: "typecast",
				settings: SETTINGS,
			});
		const mine = await make(A);
		const theirs = await make(B);
		expect(theirs.id).not.toBe(mine.id);
	});

	it("입력에 소유자를 끼워도 B의 것으로 만들어지고 A는 그대로", async () => {
		await as(B).presetCreate({
			name: "소유자 덮기",
			channelId: null,
			channelDefault: false,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
			ownerId: A,
			owner_id: A,
			savedVoiceId: crypto.randomUUID(),
		} as never);
		expect(await as(A).presetList()).toEqual([]);
		expect(await as(A).savedVoiceList()).toEqual([]);
		expect(await as(B).presetList()).toHaveLength(1);
	});
});

describe("소유자 없음(스펙 8절 11번)", () => {
	it("프로시저 6개 모두 UNAUTHORIZED이고 DB 접근이 0회", async () => {
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
		const nobody = as(null, failingDb);
		const id = crypto.randomUUID();
		for (const call of [
			() => nobody.presetList(),
			() =>
				nobody.presetCreate({
					name: "a",
					channelId: null,
					channelDefault: false,
					voice: VOICE,
					provider: "typecast",
					settings: SETTINGS,
				}),
			() =>
				nobody.presetOverwrite({
					id,
					voice: VOICE,
					provider: "typecast",
					settings: SETTINGS,
				}),
			() =>
				nobody.presetUpdate({
					id,
					name: "a",
					channelId: null,
					channelDefault: false,
				}),
			() => nobody.presetDuplicate({ id }),
			() => nobody.presetRemove({ id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
	});
});
