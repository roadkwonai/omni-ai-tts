import { createRouterClient } from "@orpc/server";
import { providerCooldown } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers";
import type { Voice } from "../providers/contract";
import { providerError } from "../providers/errors";
import { createProviders } from "../providers/index";
import { emptyVoice } from "../providers/list";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `check-${Date.now()}`;
const OTHER = `check-other-${Date.now()}`;
const voiceOf = (
	provider: Voice["provider"],
	source: Voice["source"],
	voiceId: string,
): Voice => ({
	...emptyVoice(provider, source),
	voiceId,
	name: voiceId,
});
const tc = (id: string) => voiceOf("typecast", "public", id);
const fish = (id: string) => voiceOf("fish_audio", "public", id);
const DAY = 24 * 60 * 60 * 1000;

function setup(providers: Providers) {
	return (ownerId: string) =>
		createRouterClient(appRouter, {
			context: { db, ownerId, providers } as Context,
		});
}
type Client = ReturnType<ReturnType<typeof setup>>;
// 담은 뒤 확인 시각을 하루 전(또는 준 시각)으로 돌려 확인 대상으로 만든다
async function saveStale(
	as: Client,
	voice: Voice,
	checkedAt = new Date(Date.now() - DAY - 1000),
) {
	const item = await as.savedVoiceSave({ voice });
	await db
		.update(savedVoice)
		.set({ checkedAt })
		.where(eq(savedVoice.id, item.id));
	return item;
}
const byId = <T extends { voice: Voice }>(list: T[], id: string) =>
	list.find((item) => item.voice.voiceId === id);

describe.skipIf(!url)("이용 가능 확인(T7 스펙 2·3절)", () => {
	beforeEach(async () => {
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
	});
	afterAll(async () => {
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("없음이면 이용 불가, 있으면 정보를 바꾸고 이용 가능으로 되돌리며 목록을 돌려준다", async () => {
		const getVoice = vi.fn(async (_source: string, id: string) =>
			id === "gone" ? null : { ...tc(id), name: `${id}-새` },
		);
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("gone"));
		const back = await saveStale(as, tc("back"));
		await db
			.update(savedVoice)
			.set({ unavailable: true })
			.where(eq(savedVoice.id, back.id));
		const list = await as.savedVoiceCheck();
		expect(list).toEqual(await as.savedVoiceList());
		expect(byId(list, "gone")).toMatchObject({
			unavailable: true,
			voice: { name: "gone" },
		});
		expect(byId(list, "back")).toMatchObject({
			unavailable: false,
			voice: { name: "back-새" },
		});
		// 확인한 행은 checked_at이 갱신돼 바로 다시 부르지 않는다
		getVoice.mockClear();
		await as.savedVoiceCheck();
		expect(getVoice).not.toHaveBeenCalled();
	});

	it("24시간이 안 된 행과 ElevenLabs 공개 성우는 부르지 않는다", async () => {
		const getVoice = vi.fn(async () => null);
		const as = setup({
			typecast: { checkStatus: vi.fn(), getVoice },
			elevenlabs: { checkStatus: vi.fn(), getVoice },
		})(OWNER);
		await as.savedVoiceSave({ voice: tc("fresh") });
		await saveStale(as, voiceOf("elevenlabs", "public", "lib1"));
		await as.savedVoiceCheck();
		expect(getVoice).not.toHaveBeenCalled();
	});

	it("ElevenLabs 계정 성우는 담을 때의 샘플 언어를 preferred로 넘긴다", async () => {
		const getVoice = vi.fn(async () => null);
		const as = setup({ elevenlabs: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, {
			...voiceOf("elevenlabs", "account", "el1"),
			previewUrl: "https://storage.googleapis.com/ko.mp3",
			samples: [
				{
					language: "ko",
					title: null,
					url: "https://storage.googleapis.com/ko.mp3",
				},
			],
		});
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledWith("account", "el1", "ko");
	});

	it("5xx·타임아웃은 행을 바꾸지 않고 다음에 다시 확인한다", async () => {
		const getVoice = vi.fn(async () => {
			throw providerError("typecast", "provider_error");
		});
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("a"));
		expect((await as.savedVoiceCheck())[0]?.unavailable).toBe(false);
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledTimes(2);
	});

	it("키·권한·잔액 오류(provider_auth)면 그 공급자 나머지를 멈추고 행은 그대로 둔다", async () => {
		const getVoice = vi.fn(async () => {
			throw providerError("typecast", "provider_auth");
		});
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		for (const id of ["t1", "t2", "t3", "t4"]) await saveStale(as, tc(id));
		const list = await as.savedVoiceCheck();
		expect(getVoice.mock.calls.length).toBeLessThanOrEqual(2);
		expect(list.every((item) => !item.unavailable)).toBe(true);
		expect(await db.select().from(providerCooldown)).toHaveLength(0);
	});

	it("reason이 없는 예외는 오류 이름만 한 줄 남기고 다음 행으로 간다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const getVoice = vi.fn(async (_s: string, id: string) => {
			if (id === "bug") throw new TypeError("secret 메모");
			return tc(id);
		});
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("bug"));
		await saveStale(as, tc("ok"));
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenCalledWith(
			"[savedVoice] typecast 확인 실패: TypeError",
		);
		expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
		log.mockRestore();
	});

	it("429면 대기 시각을 적고 그 공급자 나머지는 부르지 않으며, 다른 공급자는 확인한다", async () => {
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		const tcGet = vi.fn(async () => {
			throw providerError("typecast", "rate_limit", retryAt);
		});
		const fishGet = vi.fn(async () => null);
		const as = setup({
			typecast: { checkStatus: vi.fn(), getVoice: tcGet },
			fish_audio: { checkStatus: vi.fn(), getVoice: fishGet },
		})(OWNER);
		for (const id of ["t1", "t2", "t3", "t4"]) await saveStale(as, tc(id));
		await saveStale(as, fish("f1"));
		const list = await as.savedVoiceCheck();
		expect(byId(list, "f1")?.unavailable).toBe(true);
		// 동시 2건이라 429를 받기 전에 둘까지 나갈 수 있다. 나머지는 멈춘다
		expect(tcGet.mock.calls.length).toBeLessThanOrEqual(2);
		const [cool] = await db.select().from(providerCooldown);
		expect(cool?.provider).toBe("typecast");
		tcGet.mockClear();
		await as.savedVoiceCheck();
		expect(tcGet).not.toHaveBeenCalled();
	});

	it("429에 retryAt이 없어도(Typecast SDK) 60초 대기 시각을 적는다", async () => {
		const tcGet = vi.fn(async () => {
			throw providerError("typecast", "rate_limit");
		});
		const as = setup({
			typecast: { checkStatus: vi.fn(), getVoice: tcGet },
		})(OWNER);
		await saveStale(as, tc("t1"));
		const before = Date.now();
		await as.savedVoiceCheck();
		const [cool] = await db.select().from(providerCooldown);
		expect(cool?.until.getTime()).toBeGreaterThanOrEqual(before + 59_000);
	});

	it("한 번에 40명까지, 가장 오래 확인하지 않은 순", async () => {
		const getVoice = vi.fn(async (_s: string, id: string) => tc(id));
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("oldest"), new Date(Date.now() - 10 * DAY));
		for (let i = 0; i < 40; i++) await saveStale(as, tc(`v${i}`));
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledTimes(40);
		expect(getVoice.mock.calls.map((call) => call[1])).toContain("oldest");
	});

	it("키가 없는 공급자는 건너뛰고, 다른 소유자의 행은 확인하지 않는다", async () => {
		const getVoice = vi.fn(async () => null);
		const make = setup({ typecast: { checkStatus: vi.fn(), getVoice } });
		await saveStale(make(OTHER), tc("other"));
		await saveStale(make(OWNER), fish("nokey"));
		await make(OWNER).savedVoiceCheck();
		expect(getVoice).not.toHaveBeenCalled();
	});

	it("Airy는 한 번의 확인에서 목록을 한 번만 부르고, 목록에 없는 id는 현재 이용 불가다(스펙 8절 8번)", async () => {
		const here = "a597bb7a98fc9ec1";
		const gone = "0000000000000000";
		const fetchMock = vi.fn(async (url: string | URL | Request) =>
			new URL(String(url)).pathname === "/v1/studio/voices"
				? Response.json({ voices: [] })
				: Response.json({
						voices: [
							{ id: here, name: "Silvia", gender: "female", langs: ["ko"] },
						],
					}),
		);
		vi.stubGlobal("fetch", fetchMock);
		try {
			// sk-로 시작하지 않는다(dev-cycle secrets 패턴)
			const as = setup(createProviders({ airy: "test-airy-check-key-0001" }))(
				OWNER,
			);
			await saveStale(as, voiceOf("airy", "public", here));
			await saveStale(as, voiceOf("airy", "public", gone));
			const list = await as.savedVoiceCheck();
			expect(byId(list, gone)?.unavailable).toBe(true);
			expect(byId(list, here)).toMatchObject({
				unavailable: false,
				voice: { name: "Silvia", gender: "female" },
			});
			const paths = fetchMock.mock.calls.map(
				([url]) => new URL(String(url)).pathname,
			);
			expect(paths.filter((p) => p === "/v1/voices")).toHaveLength(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("Gemini는 한 번의 확인에서 두 목록을 한 번씩만 부르고, 목록에 없는 id는 현재 이용 불가다", async () => {
		const fetchMock = vi.fn(async (url: string | URL | Request) =>
			Response.json({
				voices:
					new URL(String(url)).searchParams.get("language_code") === "ko-KR"
						? [
								{
									id: "ko-kr-advisor-1",
									display_name: "Authoritative Advisor 1",
									language_code: "ko-KR",
									gender: "male",
								},
							]
						: [{ id: "kore", display_name: "Kore", language_code: "en-US" }],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		try {
			const as = setup(
				createProviders({ gemini: "test-gemini-check-key-0001" }),
			)(OWNER);
			await saveStale(as, voiceOf("gemini", "public", "ko-kr-advisor-1"));
			await saveStale(as, voiceOf("gemini", "public", "kore"));
			await saveStale(as, voiceOf("gemini", "public", "ko-kr-advisor-99"));
			const list = await as.savedVoiceCheck();
			expect(byId(list, "ko-kr-advisor-99")?.unavailable).toBe(true);
			expect(byId(list, "ko-kr-advisor-1")).toMatchObject({
				unavailable: false,
				voice: { name: "Authoritative Advisor 1", gender: "male" },
			});
			expect(byId(list, "kore")?.voice.samples).toHaveLength(1);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
