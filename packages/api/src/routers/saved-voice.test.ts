import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `saved-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const me = as(OWNER);
const voiceOf = (voiceId: string, name = voiceId) => ({
	...emptyVoice("typecast", "public"),
	voiceId,
	name,
	previewUrl: "https://static.typecast.ai/a.mp3",
});
const VOICE_A = voiceOf("tc_a", "민지");
const VOICE_B = voiceOf("tc_b", "준호");

describe.skipIf(!url)("성우 보관함(T7 스펙 3·8절)", () => {
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

	it("담기 왕복: 처음 담기면 기본값, 목록은 최근 담은 순", async () => {
		const a = await me.savedVoiceSave({ voice: VOICE_A, favorite: true });
		expect(a).toMatchObject({
			voice: VOICE_A,
			favorite: true,
			frequent: false,
			memo: null,
			unavailable: false,
			channelIds: [],
			classificationIds: [],
		});
		await me.savedVoiceSave({ voice: VOICE_B });
		expect(
			(await me.savedVoiceList()).map((item) => item.voice.voiceId),
		).toEqual(["tc_b", "tc_a"]);
	});

	it("같은 성우를 다시 담으면 한 행이고 준 필드만 바뀌며 정보는 새 값이다", async () => {
		await me.savedVoiceSave({ voice: VOICE_A, favorite: true, memo: "차분" });
		const again = await me.savedVoiceSave({
			voice: { ...VOICE_A, name: "민지(새)" },
			frequent: true,
		});
		expect(again).toMatchObject({
			favorite: true,
			frequent: true,
			memo: "차분",
		});
		expect(again.voice.name).toBe("민지(새)");
		expect(await me.savedVoiceList()).toHaveLength(1);
		const off = await me.savedVoiceSave({
			voice: VOICE_A,
			favorite: false,
			frequent: false,
		});
		expect(off).toMatchObject({ favorite: false, frequent: false });
		expect(await me.savedVoiceList()).toHaveLength(1);
	});

	it("같은 성우를 동시에 두 번 담아도 둘 다 성공하고 한 행", async () => {
		const [x, y] = await Promise.all([
			me.savedVoiceSave({ voice: VOICE_A, favorite: true }),
			me.savedVoiceSave({ voice: VOICE_A, frequent: true }),
		]);
		expect(x.id).toBe(y.id);
		expect(await me.savedVoiceList()).toMatchObject([
			{ favorite: true, frequent: true },
		]);
	});

	it("같은 성우의 연결 바꾸기 둘이 동시에 와도 둘 다 성공하고 한쪽 목록이 남는다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const c2 = await me.channelCreate({ name: "주말", memo: "", url: "" });
		await Promise.all([
			me.savedVoiceLinks({
				voice: VOICE_A,
				channelIds: [c1.id],
				classificationIds: [],
			}),
			me.savedVoiceLinks({
				voice: VOICE_A,
				channelIds: [c2.id],
				classificationIds: [],
			}),
		]);
		const [item] = await me.savedVoiceList();
		expect([[c1.id], [c2.id]]).toContainEqual(item?.channelIds);
	});

	it("연결을 목록으로 바꾸고(담기지 않았으면 담는다) 다시 바꾸면 빠진 것이 풀린다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const c2 = await me.channelCreate({ name: "주말", memo: "", url: "" });
		const cat = await me.classificationCreate({
			kind: "category",
			name: "뉴스",
			memo: "",
		});
		const linked = await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c1.id, c2.id],
			classificationIds: [cat.id],
		});
		expect(new Set(linked.channelIds)).toEqual(new Set([c1.id, c2.id]));
		expect(linked.classificationIds).toEqual([cat.id]);
		const fewer = await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c2.id],
			classificationIds: [],
		});
		expect(fewer).toMatchObject({ channelIds: [c2.id], classificationIds: [] });
	});

	it("없는 채널 id가 하나라도 섞이면 NOT_FOUND이고 아무것도 바뀌지 않는다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c1.id],
			classificationIds: [],
		});
		await expect(
			me.savedVoiceLinks({
				voice: VOICE_A,
				channelIds: [c1.id, crypto.randomUUID()],
				classificationIds: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await me.savedVoiceList())[0]?.channelIds).toEqual([c1.id]);
	});

	it("채널·분류를 지우면 연결만 풀리고 성우는 남는다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const cat = await me.classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "",
		});
		await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c1.id],
			classificationIds: [cat.id],
		});
		await me.channelDelete({ id: c1.id });
		await me.classificationDelete({ id: cat.id });
		expect(await me.savedVoiceList()).toMatchObject([
			{ voice: { voiceId: "tc_a" }, channelIds: [], classificationIds: [] },
		]);
	});

	it("빼기하면 연결도 사라지고, 없는 id는 NOT_FOUND", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const item = await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c1.id],
			classificationIds: [],
		});
		expect(await me.savedVoiceRemove({ id: item.id })).toEqual({
			deleted: true,
		});
		expect(await me.savedVoiceList()).toEqual([]);
		expect((await me.channelList())[0]?.voiceCount).toBe(0);
		await expect(me.savedVoiceRemove({ id: item.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("저장한 정보가 계약과 어긋나면 이름 자리에 성우 id를 보인다", async () => {
		const item = await me.savedVoiceSave({ voice: VOICE_A });
		await db.update(savedVoice).set({ voice: { broken: true } });
		expect((await me.savedVoiceList())[0]).toMatchObject({
			id: item.id,
			voice: { provider: "typecast", voiceId: "tc_a", name: "tc_a" },
		});
	});
});

describe("저장소 오류(DB 없이)", () => {
	const throwingDb = (error: unknown) =>
		new Proxy(
			{},
			{
				get() {
					throw error;
				},
			},
		) as Context["db"];

	it("외래 키 위반(연결 중 지워짐)은 NOT_FOUND, 그 밖은 한 줄 로그와 500", async () => {
		const fk = Object.assign(new Error("query failed"), {
			cause: { code: "23503" },
		});
		await expect(
			as(OWNER, throwingDb(fk)).savedVoiceLinks({
				voice: VOICE_A,
				channelIds: [],
				classificationIds: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const down = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
		await expect(
			as(OWNER, throwingDb(down)).savedVoiceSave({
				voice: VOICE_A,
				memo: "비밀 메모",
			}),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0]?.[0])).toMatch(
			/^\[savedVoice\] 담기 실패: /,
		);
		expect(JSON.stringify(log.mock.calls)).not.toContain("비밀 메모");
		log.mockRestore();
	});
});
