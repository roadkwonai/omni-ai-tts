// packages/api/src/routers/my-voice.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { wavHeader } from "../drama-script";
import type { Voice } from "../providers/contract";
import { createProviders } from "../providers/index";
import { fetchMock, json, useFetchMock } from "../providers/test-utils";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

// 내 보이스 소유자 격리(스펙 11절 5번, tts-provider 검사 ③④). 공급자는 전역 fetch만 바꿔 끼운다
const A = `myvoice-iso-a-${Date.now()}`;
const B = `myvoice-iso-b-${Date.now()}`;
const providers = createProviders({
	fish_audio: "fish-test-key-0001",
	gemini: "test-gemini-key-0001",
});
const as = (ownerId: string | null) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers } as Context,
	});
const wav = (seconds: number) => {
	const bytes = seconds * 24_000 * 2;
	const out = new Uint8Array(44 + bytes);
	out.set(wavHeader(bytes, 24_000));
	return new File([out], "a.wav", { type: "audio/wav" });
};

async function clean() {
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(myVoice);
}

let dbTouches = 0;
const failingDb = new Proxy(
	{},
	{
		get() {
			dbTouches += 1;
			throw new Error("db");
		},
	},
) as Context["db"];

useFetchMock();

describe("내 보이스 요청 조회: 소유자 없음", () => {
	it("myVoiceRequest는 UNAUTHORIZED, 공급자·DB 0회", async () => {
		const none = createRouterClient(appRouter, {
			context: { db: failingDb, ownerId: null, providers } as Context,
		});
		await expect(
			none.myVoiceRequest({ requestId: crypto.randomUUID() }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe.skipIf(!url)("내 보이스 소유자 격리", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	// A의 Fish 클론(processing: 확인이 공급자를 부를 수 있는 상태)과 Gemini 클론(ready)
	async function aVoices() {
		fetchMock.mockResolvedValueOnce(
			json(201, { _id: "c".repeat(32), state: "training" }),
		);
		const fish = await as(A).myVoiceCreate({
			requestId: crypto.randomUUID(),
			provider: "fish_audio",
			name: "A 목소리",
			consent: true,
			source: wav(20),
		});
		fetchMock.mockResolvedValueOnce(json(200, { id: "voice_isoa0001" }));
		const gemini = await as(A).myVoiceCreate({
			requestId: crypto.randomUUID(),
			provider: "gemini",
			name: "A 제미니",
			consent: true,
			source: wav(15),
			consentAudio: wav(3),
		});
		fetchMock.mockClear();
		return { fish, gemini };
	}

	it("B는 A의 행을 목록에서 보지 못하고 확인·지우기·다시 담기가 NOT_FOUND, 공급자 0회, A 행 그대로", async () => {
		const { fish, gemini } = await aVoices();
		const before = await as(A).myVoiceList();
		expect((await as(B).myVoiceList()).items).toEqual([]);
		for (const id of [fish.id, gemini.id]) {
			await expect(as(B).myVoiceCheck({ id })).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
			await expect(as(B).myVoiceDelete({ id })).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
			await expect(as(B).myVoiceSave({ id })).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await as(A).myVoiceList()).toEqual(before);
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("요청 조회: B는 A의 요청 id로 null, A는 자기 행, 공급자 0회·쓰기 0(T21)", async () => {
		const { fish } = await aVoices();
		const rows = () => db.select().from(myVoice).orderBy(myVoice.id);
		const before = await rows();
		for (const { requestId } of before)
			expect(await as(B).myVoiceRequest({ requestId })).toBeNull();
		const requestId = before.find((row) => row.id === fish.id)
			?.requestId as string;
		expect(await as(A).myVoiceRequest({ requestId })).toEqual(fish);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await rows()).toEqual(before);
	});

	it("요청 조회: 요청 id가 같아도 소유자마다 자기 행만, 남의 5분 지난 sending도 null(T21)", async () => {
		const requestId = crypto.randomUUID();
		const stale = crypto.randomUUID();
		const row = (ownerId: string, id: string, createdAt = new Date()) => ({
			ownerId,
			provider: "fish_audio" as const,
			name: ownerId,
			status: "sending" as const,
			requestId: id,
			fingerprint: "f",
			consentAt: new Date(),
			consentVersion: "v1",
			createdAt,
		});
		await db
			.insert(myVoice)
			.values([
				{ ...row(A, requestId), status: "processing" as const },
				row(B, requestId),
				row(A, stale, new Date(Date.now() - 6 * 60_000)),
			]);
		expect(await as(A).myVoiceRequest({ requestId })).toMatchObject({
			name: A,
			status: "processing",
		});
		expect(await as(B).myVoiceRequest({ requestId })).toMatchObject({
			name: B,
			status: "sending",
		});
		expect(await as(B).myVoiceRequest({ requestId: stale })).toBeNull();
		expect(await as(A).myVoiceRequest({ requestId: stale })).toMatchObject({
			status: "unknown",
		});
	});

	it("B는 A의 Gemini 클론 id를 보관함·프리셋에 담을 수 없다(매핑은 A의 것)", async () => {
		const { gemini } = await aVoices();
		const voice = gemini.voice as Voice;
		await expect(as(B).savedVoiceSave({ voice })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			as(B).presetCreate({
				name: "B 프리셋",
				channelId: null,
				channelDefault: false,
				voice,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("B는 A의 Gemini 클론 id를 public 출처로 바꿔도 담기·연결·프리셋이 NOT_FOUND", async () => {
		const { gemini } = await aVoices();
		const voice = { ...(gemini.voice as Voice), source: "public" as const };
		await expect(as(B).savedVoiceSave({ voice })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			as(B).savedVoiceLinks({ voice, channelIds: [], classificationIds: [] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).presetCreate({
				name: "B 프리셋",
				channelId: null,
				channelDefault: false,
				voice,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("A도 ready가 아닌(지우는 중) 자기 클론 id는 보관함·프리셋에 담을 수 없다", async () => {
		const { gemini } = await aVoices();
		const voice = gemini.voice as Voice;
		await db
			.update(myVoice)
			.set({ status: "deleting" })
			.where(eq(myVoice.id, gemini.id));
		const before = await as(A).savedVoiceList();
		await expect(as(A).savedVoiceSave({ voice })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			as(A).presetCreate({
				name: "A 프리셋",
				channelId: null,
				channelDefault: false,
				voice,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).savedVoiceList()).toEqual(before);
	});

	it("A는 자기 행을 확인하고 지운다", async () => {
		const { fish } = await aVoices();
		fetchMock.mockResolvedValueOnce(
			json(200, { _id: "c".repeat(32), state: "trained" }),
		);
		expect((await as(A).myVoiceCheck({ id: fish.id })).status).toBe("ready");
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
		expect(await as(A).myVoiceDelete({ id: fish.id })).toEqual({
			deleted: true,
		});
	});

	it("소유자가 없으면 다섯 프로시저 모두 UNAUTHORIZED, 공급자 0회", async () => {
		const id = crypto.randomUUID();
		const unauthorized = { code: "UNAUTHORIZED" };
		await expect(as(null).myVoiceList()).rejects.toMatchObject(unauthorized);
		await expect(
			as(null).myVoiceCreate({
				requestId: id,
				provider: "fish_audio",
				name: "x",
				consent: true,
				source: wav(20),
			}),
		).rejects.toMatchObject(unauthorized);
		await expect(as(null).myVoiceCheck({ id })).rejects.toMatchObject(
			unauthorized,
		);
		await expect(as(null).myVoiceDelete({ id })).rejects.toMatchObject(
			unauthorized,
		);
		await expect(as(null).myVoiceSave({ id })).rejects.toMatchObject(
			unauthorized,
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await db.select().from(myVoice)).toEqual([]);
	});
});
