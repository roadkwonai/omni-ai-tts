// packages/api/src/routers/preset.test.ts
import { createRouterClient } from "@orpc/server";
import { channel } from "@tts-pilot-app/db/schema/classification";
import {
	channelDefaultPreset,
	voicePreset,
} from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `preset-${Date.now()}`;
const me = createRouterClient(appRouter, {
	context: { db, ownerId: OWNER, providers: null } as Context,
});
const voiceOf = (voiceId: string, name = voiceId) => ({
	...emptyVoice("typecast", "public"),
	voiceId,
	name,
	previewUrl: "https://static.typecast.ai/a.mp3",
});
const A = voiceOf("tc_a", "민지");
const B = voiceOf("tc_b", "준호");
const TC = { ...DEFAULT_SETTINGS.typecast, tempo: 1.1, pitch: -1 };
const input = (over: Record<string, unknown> = {}) => ({
	name: "경제 내레이션",
	channelId: null as string | null,
	channelDefault: false,
	voice: A,
	provider: "typecast" as const,
	settings: TC,
	...over,
});
const newChannel = (name: string) =>
	me.channelCreate({ name, memo: "", url: "" });
const MISSING = "00000000-0000-4000-8000-000000000000";

async function clean() {
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(channel);
	await db.delete(trialGeneration);
}

describe.skipIf(!url)("프리셋(T8 스펙 3·8절)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("만들기 왕복: 성우가 보관함에 담기고 목록에 한 줄", async () => {
		const made = await me.presetCreate(input({ name: "  경제   내레이션 " }));
		expect(made).toMatchObject({
			name: "경제 내레이션",
			provider: "typecast",
			settings: TC,
			voice: A,
			unavailable: false,
			channelId: null,
			channelDefault: false,
			fixed: [],
		});
		const saved = await me.savedVoiceList();
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({
			id: made.savedVoiceId,
			favorite: false,
			frequent: false,
		});
		expect(await me.presetList()).toEqual([made]);
	});

	it("이미 담긴 성우의 즐겨찾기·메모는 그대로다", async () => {
		await me.savedVoiceSave({ voice: A, favorite: true, memo: "차분" });
		await me.presetCreate(input());
		expect((await me.savedVoiceList())[0]).toMatchObject({
			favorite: true,
			memo: "차분",
		});
	});

	it("이름 중복(대소문자 무시)은 CONFLICT이고 동시 저장도 한 행", async () => {
		await me.presetCreate(input({ name: "Econ" }));
		await expect(
			me.presetCreate(input({ name: "econ" })),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
		const results = await Promise.allSettled([
			me.presetCreate(input({ name: "같이" })),
			me.presetCreate(input({ name: "같이" })),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(await me.presetList()).toHaveLength(2);
	});

	it("채널 기본은 채널마다 하나이고 채널을 바꾸면 이전 기본이 풀린다", async () => {
		const ch = await newChannel("경제");
		const ch2 = await newChannel("주말");
		const p1 = await me.presetCreate(
			input({ name: "하나", channelId: ch.id, channelDefault: true }),
		);
		expect(p1.channelDefault).toBe(true);
		const p2 = await me.presetCreate(
			input({ name: "둘", channelId: ch.id, channelDefault: true }),
		);
		const byId = async () =>
			Object.fromEntries(
				(await me.presetList()).map((p) => [p.id, p.channelDefault]),
			);
		expect(await byId()).toEqual({ [p1.id]: false, [p2.id]: true });
		await me.presetUpdate({
			id: p2.id,
			name: "둘",
			channelId: ch2.id,
			channelDefault: false,
		});
		expect(await byId()).toEqual({ [p1.id]: false, [p2.id]: false });
		expect(await db.select().from(channelDefaultPreset)).toEqual([]);
	});

	it("고치기: 이름·채널·채널 기본을 바꾸고 설정·성우는 그대로", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(input());
		const updated = await me.presetUpdate({
			id: made.id,
			name: "새 이름",
			channelId: ch.id,
			channelDefault: true,
		});
		expect(updated).toMatchObject({
			name: "새 이름",
			channelId: ch.id,
			channelDefault: true,
			settings: TC,
			voice: A,
		});
	});

	it("채널을 지우면 프리셋은 남고 채널과 기본만 풀린다", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		await me.channelDelete({ id: ch.id });
		expect(await me.presetList()).toEqual([
			{ ...made, channelId: null, channelDefault: false },
		]);
		expect(await db.select().from(channelDefaultPreset)).toEqual([]);
	});

	it("보관함에서 빼면 성우만 비고, 덮어쓰기로 다시 붙는다", async () => {
		const made = await me.presetCreate(input());
		await me.savedVoiceRemove({ id: made.savedVoiceId ?? MISSING });
		expect(await me.presetList()).toEqual([
			{ ...made, savedVoiceId: null, voice: null },
		]);
		const changed = { ...TC, tempo: 1.3 };
		const over = await me.presetOverwrite({
			id: made.id,
			voice: B,
			provider: "typecast",
			settings: changed,
		});
		expect(over).toMatchObject({ voice: B, settings: changed });
		expect(over.savedVoiceId).not.toBeNull();
	});

	it("다른 공급자로 덮어쓰기는 BAD_REQUEST이고 프리셋은 그대로", async () => {
		const made = await me.presetCreate(input());
		const gemini = {
			...emptyVoice("gemini", "public"),
			voiceId: "kore",
			name: "Kore",
		};
		await expect(
			me.presetOverwrite({
				id: made.id,
				voice: gemini,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(await me.presetList()).toEqual([made]);
		expect(await me.savedVoiceList()).toHaveLength(1);
	});

	it("복제: '사본', '사본 2', 같은 채널, 기본은 아니다", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		const one = await me.presetDuplicate({ id: made.id });
		const two = await me.presetDuplicate({ id: made.id });
		expect(one).toMatchObject({
			name: "경제 내레이션 사본",
			channelId: ch.id,
			channelDefault: false,
			settings: TC,
			savedVoiceId: made.savedVoiceId,
		});
		expect(two.name).toBe("경제 내레이션 사본 2");
	});

	it("지우기: 줄과 기본 지정이 사라지고 내 문장 결과는 그대로", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		await db.insert(trialGeneration).values({
			requestId: crypto.randomUUID(),
			comboKey: "k",
			provider: "typecast",
			voiceId: "tc_a",
			model: "ssfm-v30",
			settings: TC,
			text: "안녕하세요",
			usageAmount: 15,
			usageUnit: "credit",
			status: "done",
			audio: Buffer.from([1, 2, 3]),
			audioType: "audio/mpeg",
			expiresAt: new Date(Date.now() + 86_400_000),
			ownerId: OWNER,
		});
		expect(await me.presetRemove({ id: made.id })).toEqual({ deleted: true });
		expect(await me.presetList()).toEqual([]);
		expect(await db.select().from(channelDefaultPreset)).toEqual([]);
		expect(await db.select().from(trialGeneration)).toHaveLength(1);
	});

	it("계약이 받지 않는 옛 값은 처음 값과 fixed로 읽는다", async () => {
		const made = await me.presetCreate(input());
		await db
			.update(voicePreset)
			.set({ settings: { ...TC, model: "ssfm-v99" } })
			.where(eq(voicePreset.id, made.id));
		expect((await me.presetList())[0]).toMatchObject({
			settings: { ...TC, model: "ssfm-v30" },
			fixed: ["model"],
		});
	});

	it("고치기로 다른 프리셋 이름(대소문자만 다름)이 되면 CONFLICT이고 이름은 그대로", async () => {
		await me.presetCreate(input({ name: "Econ" }));
		const other = await me.presetCreate(input({ name: "주말" }));
		await expect(
			me.presetUpdate({
				id: other.id,
				name: "econ",
				channelId: null,
				channelDefault: false,
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
		expect((await me.presetList()).map((p) => p.name).sort()).toEqual([
			"Econ",
			"주말",
		]);
	});

	it("덮어쓰기는 이름·채널·채널 기본을 그대로 둔다", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		const over = await me.presetOverwrite({
			id: made.id,
			voice: B,
			provider: "typecast",
			settings: { ...TC, pitch: 3 },
		});
		expect(over).toMatchObject({
			name: made.name,
			channelId: ch.id,
			channelDefault: true,
		});
	});

	it("성우가 빠진 프리셋을 복제하면 사본도 성우가 비었다", async () => {
		const made = await me.presetCreate(input());
		await me.savedVoiceRemove({ id: made.savedVoiceId ?? MISSING });
		const copy = await me.presetDuplicate({ id: made.id });
		expect(copy).toMatchObject({ savedVoiceId: null, voice: null });
	});

	it("없는 id·없는 채널은 NOT_FOUND이고 아무것도 바뀌지 않는다", async () => {
		await expect(
			me.presetCreate(input({ channelId: MISSING })),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await me.savedVoiceList()).toEqual([]);
		for (const call of [
			() =>
				me.presetUpdate({
					id: MISSING,
					name: "a",
					channelId: null,
					channelDefault: false,
				}),
			() =>
				me.presetOverwrite({
					id: MISSING,
					voice: A,
					provider: "typecast",
					settings: TC,
				}),
			() => me.presetDuplicate({ id: MISSING }),
			() => me.presetRemove({ id: MISSING }),
		])
			await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await me.savedVoiceList()).toEqual([]);
	});

	// 기본 지정 동시 저장(Task 1 DB 리뷰): 같은 프리셋은 voice_preset 행 잠금이, 같은 채널은 on conflict가 줄 세운다. 유니크 위반 500이 없다
	it("같은 프리셋·같은 채널의 기본 지정을 동시에 해도 모두 성공하고 채널·프리셋마다 한 줄", async () => {
		const ch = await newChannel("경제");
		const ch2 = await newChannel("주말");
		const made = await me.presetCreate(input());
		await Promise.all([
			me.presetUpdate({
				id: made.id,
				name: made.name,
				channelId: ch.id,
				channelDefault: true,
			}),
			me.presetUpdate({
				id: made.id,
				name: made.name,
				channelId: ch2.id,
				channelDefault: true,
			}),
		]);
		expect(await db.select().from(channelDefaultPreset)).toHaveLength(1);
		await Promise.all([
			me.presetCreate(
				input({ name: "가", channelId: ch.id, channelDefault: true }),
			),
			me.presetCreate(
				input({ name: "나", channelId: ch.id, channelDefault: true }),
			),
		]);
		const rows = await db.select().from(channelDefaultPreset);
		expect(rows.filter((row) => row.channelId === ch.id)).toHaveLength(1);
		expect(new Set(rows.map((row) => row.presetId)).size).toBe(rows.length);
	});
});
