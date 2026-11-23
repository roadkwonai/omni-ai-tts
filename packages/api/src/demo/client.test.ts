import { createRouterClient, ORPCError } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { myVoice } from "@tts-pilot-app/db/schema/my-voice";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { script } from "@tts-pilot-app/db/schema/script";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { DRAMA_SETTINGS, wavHeader } from "../drama-script";
import {
	type ProviderId,
	providerIdSchema,
	type VoiceListInput,
} from "../providers/contract";
import { emptyVoice } from "../providers/list";
import { fetchMock, useFetchMock } from "../providers/test-utils";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { appRouter } from "../routers/index";
import type { StudioRequest } from "../studio-contract";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { CONTRACT_VERSION, cacheKey } from "../voice-cache";
import { createDemoProviders, type DemoSample } from "./client";

// 공개 데모 클라이언트(T15-a2 Task 1b). 데모 Context로 모든 프로시저를 불러 공급자 호출(fetch) 0회, 500 없음을 본다
const PROVIDERS = providerIdSchema.options;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 7]);
const WAV = (() => {
	const out = new Uint8Array(44 + 480);
	out.set(wavHeader(480, 24_000));
	return out;
})();
const PCM = new Uint8Array(4410);
const SAMPLES: Record<DemoSample, Uint8Array> = {
	typecast: MP3,
	elevenlabs: MP3,
	fish_audio: MP3,
	airy: MP3,
	gemini: WAV,
	drama: PCM,
};
const loadSample = async (name: DemoSample) => SAMPLES[name];
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());

useFetchMock();
afterEach(() => {
	expect(fetchMock).not.toHaveBeenCalled();
});

describe("데모 클라이언트(DB 없이)", () => {
	const providers = createDemoProviders(loadSample);

	it("공급자 5개 모두 생성만 있고 클론·자동 태그·단건 조회는 없다", () => {
		for (const provider of PROVIDERS) {
			const client = providers[provider];
			expect(client?.demo).toBe(true);
			expect(client?.synthesize).toBeTypeOf("function");
			expect(client?.cloneCreate).toBeUndefined();
			expect(client?.cloneGet).toBeUndefined();
			expect(client?.cloneDelete).toBeUndefined();
			expect(client?.suggestActing).toBeUndefined();
			expect(client?.getVoice).toBeUndefined();
		}
		expect(providers.openai).toBeUndefined();
		expect(providers.fish_audio?.synthesizeScene).toBeTypeOf("function");
	});

	it.each(PROVIDERS)("%s: 생성은 그 공급자의 샘플 바이트", async (provider) => {
		const audio = await providers[provider]?.synthesize?.({
			provider,
			voiceId: "v",
			text: "안녕",
			settings: DEFAULT_SETTINGS[provider],
		} as StudioRequest);
		expect(audio).toEqual(SAMPLES[provider]);
	});

	it("드라마 장면은 드라마 PCM과 segments null", async () => {
		await expect(
			providers.fish_audio?.synthesizeScene?.({
				model: "s2.1-pro",
				text: "안녕",
				referenceIds: ["a"],
				...DRAMA_SETTINGS,
			}),
		).resolves.toEqual({ pcm: PCM, segments: null });
	});

	it("연결 상태는 no_key, 목록·억양·모델은 provider_error(BAD_GATEWAY)", async () => {
		for (const provider of PROVIDERS) {
			const client = providers[provider];
			await expect(client?.checkStatus()).resolves.toMatchObject({
				provider,
				status: "no_key",
				quota: null,
			});
			for (const call of [
				() => client?.listVoices?.({ provider: "typecast" } as never),
				() => client?.listAccents?.("ko"),
				() => client?.listModels?.(),
			])
				await expect(call()).rejects.toMatchObject({
					code: "BAD_GATEWAY",
					data: { provider, reason: "provider_error" },
				});
		}
	});

	it("샘플 파일을 읽지 못하면 공급자 오류(500 아님)", async () => {
		const broken = createDemoProviders(async () => {
			throw new Error("ENOENT");
		});
		await expect(
			broken.gemini?.synthesize?.({
				provider: "gemini",
				voiceId: "Kore",
				text: "안녕",
				settings: DEFAULT_SETTINGS.gemini,
			} as StudioRequest),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "gemini", reason: "provider_error" },
		});
		await expect(
			broken.fish_audio?.synthesizeScene?.({
				model: "s2.1-pro",
				text: "안녕",
				referenceIds: ["a"],
				...DRAMA_SETTINGS,
			}),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "fish_audio", reason: "provider_error" },
		});
	});
});

const OWNER = `demo-${Date.now()}`;
const VOICE: Record<ProviderId, string> = {
	typecast: "tc_demo",
	elevenlabs: "el_demo",
	fish_audio: "fa_demo",
	airy: "airy_demo",
	gemini: "Kore",
};
// Fish는 유료 모델로 보낸다(무료 모델 종료일에 테스트가 묶이지 않게)
const requestOf = (provider: ProviderId) =>
	({
		provider,
		voiceId: VOICE[provider],
		text: "안녕하세요",
		settings:
			provider === "fish_audio"
				? { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro" }
				: DEFAULT_SETTINGS[provider],
	}) as StudioRequest;
const voiceOf = (provider: ProviderId) => ({
	...emptyVoice(provider, "public"),
	voiceId: VOICE[provider],
	name: `성우 ${provider}`,
});
const CACHED = { provider: "typecast" as const };
const PAGE = {
	voices: [],
	next: null,
	total: 0,
	totalExact: true,
	windowLimited: false,
};
const FAR = new Date("2099-01-01T00:00:00.000Z");

async function clean() {
	await db.delete(trialGeneration);
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(myVoice);
	await db.delete(script);
	await db.delete(channel);
	await db.delete(classification);
	await db.delete(providerListCache);
	await db.delete(providerCooldown);
}

// 부른 프로시저 이름과 오류 코드를 모은다(마지막 it가 모든 프로시저·500 없음을 본다)
const called = new Set<string>();
const codes: string[] = [];
const raw = createRouterClient(appRouter, {
	context: {
		db,
		ownerId: OWNER,
		providers: createDemoProviders(loadSample),
	} as Context,
});
const demo = new Proxy(raw, {
	get(target, name) {
		called.add(String(name));
		const call = Reflect.get(target, name) as (
			...args: unknown[]
		) => Promise<unknown>;
		return async (...args: unknown[]) => {
			try {
				return await call(...args);
			} catch (error) {
				codes.push(error instanceof ORPCError ? error.code : "NOT_ORPC");
				throw error;
			}
		};
	},
}) as typeof raw;
const rejects = (code: string, data?: object) =>
	data ? { code, data } : { code };

describe.skipIf(!url)("데모 Context로 모든 프로시저(T15-a2 Task 1b)", () => {
	beforeAll(async () => {
		await clean();
		for (const provider of PROVIDERS)
			await db.insert(savedVoice).values({
				ownerId: OWNER,
				provider,
				voiceId: VOICE[provider],
				source: "public",
				voice: voiceOf(provider),
			});
		// 시드처럼 먼 미래까지 남는 목록 캐시 한 행(Typecast 기본 페이지)
		await db.insert(providerListCache).values({
			ownerId: null,
			provider: "typecast",
			listKind: "public",
			paramsKey: cacheKey(CACHED),
			contractVersion: CONTRACT_VERSION,
			payload: PAGE,
			fetchedAt: new Date("2026-11-01T00:00:00.000Z"),
			expiresAt: FAR,
		});
	});
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("healthCheck·providerStatus: 연결 상태는 공급자마다 no_key", async () => {
		expect(await demo.healthCheck()).toBe("OK");
		for (const provider of PROVIDERS)
			expect(await demo.providerStatus({ provider })).toMatchObject({
				provider,
				status: "no_key",
			});
	});

	it("voiceList: 캐시 적중이면 그대로, 캐시에 없으면 오류 없이 빈 목록이고 캐시에 쓰지 않는다", async () => {
		const rows = () => db.$count(providerListCache);
		const before = await rows();
		expect(await demo.voiceList(CACHED)).toMatchObject({
			provider: "typecast",
			voices: [],
			stale: null,
		});
		const inputs: VoiceListInput[] = [
			{ provider: "airy" },
			{
				provider: "elevenlabs",
				source: "public",
				page: 0,
				query: {
					search: "",
					language: null,
					accent: null,
					gender: null,
					age: null,
					category: null,
					useCases: [],
					descriptives: [],
					featured: false,
					sort: "trending",
				},
			},
		];
		for (const input of inputs)
			expect(await demo.voiceList(input)).toMatchObject({
				provider: input.provider,
				voices: [],
				next: null,
				total: 0,
				stale: null,
			});
		// 익명 방문자의 검색어·페이지 조합마다 행이 늘지 않는다(리뷰 T15-b)
		expect(await rows()).toBe(before);
	});

	it("voiceAccents·trialModels: 공급자 오류", async () => {
		await expect(demo.voiceAccents({ language: "ko" })).rejects.toMatchObject(
			rejects("BAD_GATEWAY", { reason: "provider_error" }),
		);
		await expect(demo.trialModels()).rejects.toMatchObject(
			rejects("BAD_GATEWAY", { reason: "provider_error" }),
		);
	});

	it("voiceListRefresh: no_key이고 캐시 expires_at이 그대로", async () => {
		await expect(
			demo.voiceListRefresh({ provider: "typecast" }),
		).rejects.toMatchObject(
			rejects("PRECONDITION_FAILED", {
				provider: "typecast",
				reason: "no_key",
			}),
		);
		const [row] = await db
			.select({ expiresAt: providerListCache.expiresAt })
			.from(providerListCache)
			.where(eq(providerListCache.provider, "typecast"));
		expect(row?.expiresAt).toEqual(FAR);
	});

	it("trialCreate와 저장본 조회·지우기: 공급자마다 샘플이 done으로 저장된다", async () => {
		for (const provider of PROVIDERS) {
			const request = requestOf(provider);
			const requestId = crypto.randomUUID();
			const made = await demo.trialCreate({ requestId, request });
			expect(made.audio.type).toBe(
				provider === "gemini" ? "audio/wav" : "audio/mpeg",
			);
			expect(await bytes(made.audio)).toEqual(SAMPLES[provider]);
			const [row] = await db
				.select()
				.from(trialGeneration)
				.where(eq(trialGeneration.id, made.id));
			expect(row?.status).toBe("done");
			expect(row?.audio).toEqual(Buffer.from(SAMPLES[provider]));
			expect(await demo.trialFind(request)).toMatchObject({ id: made.id });
			expect(await demo.trialFindMany([request])).toMatchObject([
				{ id: made.id },
			]);
			expect(
				await demo.trialList({ provider, voiceId: VOICE[provider] }),
			).toEqual(
				expect.arrayContaining([expect.objectContaining({ id: made.id })]),
			);
			expect(
				await bytes((await demo.trialAudio({ id: made.id })).audio),
			).toEqual(SAMPLES[provider]);
			expect(await demo.trialRequest({ requestId })).toEqual({
				id: made.id,
				createdAt: made.createdAt,
				usage: made.usage,
				bytes: SAMPLES[provider].byteLength,
				status: "done",
				reason: null,
			});
			await demo.trialDelete({ id: made.id });
		}
	});

	it("studioCreate와 작업실 조회: 공급자마다 샘플이 done으로 저장된다", async () => {
		for (const provider of PROVIDERS) {
			const request = requestOf(provider);
			const requestId = crypto.randomUUID();
			const made = await demo.studioCreate({ requestId, request });
			const [row] = await db
				.select()
				.from(trialGeneration)
				.where(
					and(
						eq(trialGeneration.id, made.id),
						eq(trialGeneration.ownerId, OWNER),
					),
				);
			expect(row).toMatchObject({ kind: "studio", status: "done" });
			expect(row?.audio).toEqual(Buffer.from(SAMPLES[provider]));
			expect(await demo.studioFind(request)).toMatchObject({ id: made.id });
			expect(await demo.studioFindMany([request])).toMatchObject([
				{ id: made.id },
			]);
			expect(await demo.studioInfo({ id: made.id })).toEqual({
				...made,
				bytes: SAMPLES[provider].byteLength,
				audioType: provider === "gemini" ? "audio/wav" : "audio/mpeg",
			});
			expect(await demo.studioRequest({ requestId })).toEqual({
				...made,
				status: "done",
				reason: null,
			});
			expect(
				await bytes(await demo.studioAudio({ id: made.id, part: 0 })),
			).toEqual(SAMPLES[provider]);
		}
	});

	it("dramaCreate와 드라마 조회·지우기: 드라마 PCM이 WAV로 done 저장, 줄 구간 없음", async () => {
		const made = await demo.dramaCreate({
			requestId: crypto.randomUUID(),
			request: {
				sceneName: "데모",
				speakers: [{ name: "지연", voiceId: VOICE.fish_audio }],
				lines: [{ speaker: 0, direction: "", text: "안녕하세요." }],
				model: "s2.1-pro",
				settings: DRAMA_SETTINGS,
			},
		});
		expect(made.segments).toBeNull();
		const [row] = await db
			.select()
			.from(trialGeneration)
			.where(eq(trialGeneration.id, made.id));
		expect(row).toMatchObject({ kind: "drama", status: "done" });
		expect(row?.audio?.byteLength).toBe(44 + PCM.byteLength);
		expect((await demo.dramaList()).map((item) => item.id)).toContain(made.id);
		expect((await demo.dramaAudio({ id: made.id, part: 0 })).size).toBe(
			44 + PCM.byteLength,
		);
		await demo.dramaDelete({ id: made.id });
	});

	it("자동 태그·클론 만들기는 no_key", async () => {
		await expect(
			demo.studioAutoTag({
				paragraphs: [
					{
						provider: "fish_audio",
						model: "s2.1-pro",
						emotions: null,
						text: "안녕.",
						direction: "",
					},
				],
			}),
		).rejects.toMatchObject({ data: { reason: "no_key" } });
		await expect(
			demo.dramaAutoTag({
				mode: "read",
				speakers: [
					{
						name: "지연",
						provider: "fish_audio",
						model: "drama-3",
						emotions: null,
					},
				],
				lines: [{ speaker: 0, direction: "", text: "안녕." }],
			}),
		).rejects.toMatchObject({ data: { reason: "no_key" } });
		const source = new Uint8Array(44 + 48_000 * 20);
		source.set(wavHeader(48_000 * 20, 24_000));
		await expect(
			demo.myVoiceCreate({
				requestId: crypto.randomUUID(),
				provider: "fish_audio",
				name: "데모 목소리",
				consent: true,
				source: new File([source], "a.wav", { type: "audio/wav" }),
			}),
		).rejects.toMatchObject(
			rejects("PRECONDITION_FAILED", {
				provider: "fish_audio",
				reason: "no_key",
			}),
		);
	});

	it("내 보이스: 목록은 클론 불가, 처리 중 클론의 확인·지우기는 no_key, 다시 담기는 NOT_FOUND", async () => {
		const [row] = await db
			.insert(myVoice)
			.values({
				ownerId: OWNER,
				provider: "fish_audio",
				providerVoiceId: "fa_clone",
				name: "시드 클론",
				status: "processing",
				requestId: crypto.randomUUID(),
				fingerprint: "f",
				consentAt: new Date(),
				consentVersion: "v1",
			})
			.returning({ id: myVoice.id });
		const id = row?.id as string;
		expect((await demo.myVoiceList()).providers).toEqual({
			fish_audio: false,
			gemini: false,
		});
		for (const call of [
			() => demo.myVoiceCheck({ id }),
			() => demo.myVoiceDelete({ id }),
		])
			await expect(call()).rejects.toMatchObject(
				rejects("PRECONDITION_FAILED", { reason: "no_key" }),
			);
		await expect(demo.myVoiceSave({ id })).rejects.toMatchObject(
			rejects("NOT_FOUND"),
		);
	});

	it("보관함·분류·프리셋·대본: DB만 쓰고 공급자를 부르지 않는다", async () => {
		const voice = voiceOf("typecast");
		expect(await demo.savedVoiceList()).toHaveLength(PROVIDERS.length);
		// 데모 클라이언트에 단건 조회가 없어 확인은 공급자를 부르지 않고 목록을 돌려준다
		expect(await demo.savedVoiceCheck()).toHaveLength(PROVIDERS.length);
		const ch = await demo.channelCreate({
			name: "데모 채널",
			memo: "",
			url: "",
		});
		await demo.channelUpdate({ id: ch.id, name: "데모", memo: "", url: "" });
		expect(await demo.channelList()).toHaveLength(1);
		const cat = await demo.classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "",
		});
		await demo.classificationUpdate({ id: cat.id, name: "차분", memo: "" });
		expect(await demo.classificationList()).toHaveLength(1);
		await demo.savedVoiceSave({ voice });
		await demo.savedVoiceLinks({
			voice,
			channelIds: [ch.id],
			classificationIds: [cat.id],
		});
		const preset = await demo.presetCreate({
			name: "데모 프리셋",
			channelId: null,
			channelDefault: false,
			voice,
			provider: "typecast",
			settings: DEFAULT_SETTINGS.typecast,
		});
		await demo.presetOverwrite({
			id: preset.id,
			voice,
			provider: "typecast",
			settings: DEFAULT_SETTINGS.typecast,
		});
		await demo.presetUpdate({
			id: preset.id,
			name: "데모 프리셋 2",
			channelId: null,
			channelDefault: false,
		});
		const copy = await demo.presetDuplicate({ id: preset.id });
		await demo.presetRemove({ id: copy.id });
		expect(await demo.presetList()).toHaveLength(1);
		const work = (text: string) => ({
			defaultVoice: null,
			gap: 0.5,
			paragraphs: [{ id: "p1", text }],
		});
		const saved = await demo.scriptCreate({
			title: "데모 대본",
			channelId: null,
			classificationIds: [],
			work: work("안녕"),
		});
		await demo.scriptSave({
			id: saved.id,
			version: saved.version,
			channelId: null,
			work: work("안녕하세요"),
		});
		await demo.scriptUpdate({ id: saved.id, title: "데모 대본 2" });
		expect(await demo.scriptGet({ id: saved.id })).toMatchObject({
			id: saved.id,
		});
		const dup = await demo.scriptDuplicate({ id: saved.id });
		await demo.scriptRemove({ id: dup.id });
		await demo.scriptRecordRecent({
			workId: crypto.randomUUID(),
			channelId: null,
			work: work("최근"),
		});
		expect((await demo.scriptList({ kind: "saved" })).items).toHaveLength(1);
		await demo.savedVoiceRemove({
			id: (await demo.savedVoiceList())[0]?.id as string,
		});
		await demo.channelDelete({ id: ch.id });
		await demo.classificationDelete({ id: cat.id });
	});

	it("appRouter의 모든 프로시저를 불렀고 500(INTERNAL_SERVER_ERROR)이 없다", () => {
		expect([...called].sort()).toEqual(Object.keys(appRouter).sort());
		expect(codes).not.toContain("INTERNAL_SERVER_ERROR");
		expect(codes).not.toContain("NOT_ORPC");
	});
});
