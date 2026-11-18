// packages/api/src/routers/clone-block.test.ts
import { createRouterClient } from "@orpc/server";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { DRAMA_SETTINGS } from "../drama-script";
import { createProviders } from "../providers/index";
import { emptyVoice } from "../providers/list";
import { fetchMock, useFetchMock } from "../providers/test-utils";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { cloneBlocked } from "../trial";
import { appRouter } from "./index";

// 합성 전 클론 검사(T13 계획 2.3 cloneBlocked): 시험 생성·작업실·드라마가 삭제 대기 클론과 남의 클론 id를 공급자 0회로 거절한다
const A = `clone-a-${Date.now()}`;
const B = `clone-b-${Date.now()}`;
const DELETING = "fish_deleting01";
const A_READY = "fish_aready0001";
const providers = createProviders({
	fish_audio: "fish-test-key-0001",
	gemini: "test-gemini-key-0001",
});
const as = (ownerId: string) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers } as Context,
	});

const clone = (
	ownerId: string,
	providerVoiceId: string,
	status: "ready" | "deleting",
) =>
	db.insert(myVoice).values({
		ownerId,
		provider: "fish_audio",
		providerVoiceId,
		name: "클론",
		status,
		requestId: crypto.randomUUID(),
		fingerprint: "x",
		consentAt: new Date(),
		consentVersion: "2026-11-18",
	});
// 이용 가능으로 담긴 행(다시 담았거나 B가 담은 행). 보관함 검사만으로는 막히지 않는다
const keep = (ownerId: string, voiceId: string) =>
	db.insert(savedVoice).values({
		ownerId,
		provider: "fish_audio",
		voiceId,
		source: "account",
		voice: { ...emptyVoice("fish_audio", "account"), voiceId, name: "클론" },
	});
const fishRequest = (voiceId: string) => ({
	provider: "fish_audio" as const,
	voiceId,
	text: "안녕하세요",
	settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" as const },
});
const scene = (voiceId: string) => ({
	sceneName: "장면",
	speakers: [
		{ name: "지연", voiceId },
		{ name: "민수", voiceId },
	],
	lines: [{ speaker: 0, direction: "", text: "안녕하세요." }],
	model: "s2.1-pro" as const,
	settings: DRAMA_SETTINGS,
});
const cases = [
	["A의 삭제 대기 클론", A, DELETING],
	["B가 담은 A의 클론", B, A_READY],
] as const;

async function clean() {
	await db.delete(trialGeneration);
	await db.delete(savedVoice);
	await db.delete(myVoice);
}

useFetchMock();

describe.skipIf(!url)("합성 전 클론 검사", () => {
	beforeEach(async () => {
		await clean();
		await clone(A, DELETING, "deleting");
		await clone(A, A_READY, "ready");
		await keep(A, DELETING);
		await keep(B, A_READY);
	});
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("cloneBlocked: 내 ready 클론과 매핑 없는 id는 통과, 삭제 대기·남의 클론은 막힌다", async () => {
		expect(
			await cloneBlocked(db, A, "fish_audio", [A_READY, "fish_public01"]),
		).toBe(false);
		expect(await cloneBlocked(db, A, "fish_audio", [A_READY, DELETING])).toBe(
			true,
		);
		expect(await cloneBlocked(db, B, "fish_audio", [A_READY])).toBe(true);
		// 같은 id라도 다른 공급자면 매핑이 아니다
		expect(await cloneBlocked(db, B, "gemini", [A_READY])).toBe(false);
		expect(await cloneBlocked(db, B, "fish_audio", [])).toBe(false);
	});

	it.each(cases)(
		"시험 생성: %s → NOT_FOUND, 공급자 0회·기록 없음",
		async (_name, owner, voiceId) => {
			await expect(
				as(owner).trialCreate({
					requestId: crypto.randomUUID(),
					request: fishRequest(voiceId),
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect(fetchMock).not.toHaveBeenCalled();
			expect(await db.select().from(trialGeneration)).toEqual([]);
		},
	);

	it.each(cases)(
		"작업실: %s → voice_unavailable, 공급자 0회·기록 없음",
		async (_name, owner, voiceId) => {
			await expect(
				as(owner).studioCreate({
					requestId: crypto.randomUUID(),
					request: fishRequest(voiceId),
				}),
			).rejects.toMatchObject({ data: { reason: "voice_unavailable" } });
			expect(fetchMock).not.toHaveBeenCalled();
			expect(await db.select().from(trialGeneration)).toEqual([]);
		},
	);

	it.each(cases)(
		"드라마: %s → voice_unavailable, 공급자 0회·기록 없음",
		async (_name, owner, voiceId) => {
			await expect(
				as(owner).dramaCreate({
					requestId: crypto.randomUUID(),
					request: scene(voiceId),
				}),
			).rejects.toMatchObject({ data: { reason: "voice_unavailable" } });
			expect(fetchMock).not.toHaveBeenCalled();
			expect(await db.select().from(trialGeneration)).toEqual([]);
		},
	);
});
