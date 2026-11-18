import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlignedSegment, SceneAudio, SceneRequest } from "../drama-script";
import type { ListInputOf } from "./contract";
import {
	CHECK_TIMEOUT_MS,
	SCENE_LATE_MAX_MS,
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
} from "./errors";
import { createFishAudio } from "./fish-audio";
import {
	calledUrl,
	fetchMock,
	fishInput,
	json,
	useFetchMock,
} from "./test-utils";
import { DEFAULT_SETTINGS, type FishSettings } from "./trial-options";

const KEY = "fish-test-key-0001";
const check = () => createFishAudio(KEY).checkStatus();
// 2026-10-04 실측 모양(무료 플랜). 남은 값이 전체보다 크다(extra_balance 포함).
const PACKAGE = {
	type: "free",
	balance: 10000,
	total: 8000,
	extra_balance: 2000,
};

// 잔액 조회와 웹 플랜(패키지) 조회에 따로 답한다. 응답 본문은 한 번만 읽히므로 매번 새로 만든다.
const route = (
	credit: () => Response,
	pkg: () => Response = () => json(200, PACKAGE),
) =>
	fetchMock.mockImplementation(async (url) =>
		new URL(String(url)).pathname.endsWith("/package") ? pkg() : credit(),
	);

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// 상태 코드 → 사유 표 전체는 errors.test.ts가 고정한다. 여기서는 fetch 응답을 바꿔 담는 것만 본다.
describe("Fish Audio 연결 확인", () => {
	it("200이면 연결됨과 API 충전 잔액·웹 플랜 크레딧, 요청은 공식 호스트에 Bearer 키로 잔액 → 웹 플랜 순서 2회", async () => {
		route(() => json(200, { credit: "12.345", has_free_credit: false }));
		const result = await check();
		expect(result).toMatchObject({
			provider: "fish_audio",
			status: "connected",
			quota: {
				remaining: 12.345,
				total: null,
				plan: null,
				resetAt: null,
				overageAllowed: false,
				webCredit: { plan: "free", remaining: 10000, total: 8000 },
			},
			providerCode: null,
			retryAfterSeconds: null,
		});
		expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const targets = fetchMock.mock.calls.map(([url, init]) => {
			const target = new URL(String(url));
			expect(target.origin).toBe("https://api.fish.audio");
			expect(new Headers(init?.headers).get("authorization")).toBe(
				`Bearer ${KEY}`,
			);
			return target.pathname;
		});
		expect(targets).toEqual([
			"/wallet/self/api-credit",
			"/wallet/self/package",
		]);
	});

	it.each([
		["500", () => json(500, {}), "HTTP 500"],
		["429", () => json(429, {}, { "retry-after": "30" }), "HTTP 429"],
		[
			"모양 다름",
			() => json(200, { type: "free" }),
			"ZodError (balance, total)",
		],
		[
			"플랜 이름 41자",
			() => json(200, { ...PACKAGE, type: "x".repeat(41) }),
			"ZodError (type)",
		],
		[
			"플랜 이름 빈칸",
			() => json(200, { ...PACKAGE, type: "  " }),
			"ZodError (type)",
		],
	])(
		"웹 플랜 조회가 실패해도(%s) 연결됨이고 웹 플랜만 비며 로그에는 사유만 남는다",
		async (_name, pkg, why) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			route(() => json(200, { credit: "1" }), pkg);
			const result = await check();
			expect(result).toMatchObject({
				status: "connected",
				quota: { remaining: 1 },
				retryAfterSeconds: null,
			});
			expect(result.quota?.webCredit).toBeUndefined();
			expect(log).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledWith(
				`[providerStatus] fish_audio 웹 플랜 조회 실패: ${why}`,
			);
		},
	);

	it("잔액 0이어도 연결됨이다(한도 부족은 402뿐)", async () => {
		route(() => json(200, { credit: "0" }));
		await expect(check()).resolves.toMatchObject({
			status: "connected",
			quota: { remaining: 0 },
		});
	});

	it("401이면 키 오류이고 재시도하지 않으며 웹 플랜은 부르지 않는다", async () => {
		route(() => json(401, { message: "x", status: 401 }));
		await expect(check()).resolves.toMatchObject({
			status: "provider_auth",
			quota: null,
			providerCode: "HTTP 401",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429면 요청 제한이고 Retry-After 초를 담으며 재시도하지 않고 웹 플랜은 부르지 않는다", async () => {
		route(() => json(429, { message: "x" }, { "retry-after": "30" }));
		await expect(check()).resolves.toMatchObject({
			status: "rate_limit",
			retryAfterSeconds: 30,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		["필드 누락", {}],
		["숫자 아님", { credit: 12 }],
		["빈 문자열", { credit: "" }],
		["숫자 모양 아님", { credit: "abc" }],
	])(
		"응답 검증 실패(%s)는 확인 실패이고 필드 경로를 남긴다",
		async (_name, body) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			route(() => json(200, body));
			await expect(check()).resolves.toMatchObject({
				status: "check_failed",
				quota: null,
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledWith(
				"[providerStatus] fish_audio 확인 실패: ZodError (credit)",
			);
		},
	);

	it("잔액은 왔는데 웹 플랜이 10초를 넘기면 확인 실패이고 로그를 남기지 않는다(두 호출이 제한을 함께 쓴다)", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async (url, init) =>
			new URL(String(url)).pathname.endsWith("/package")
				? new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("aborted", "AbortError")),
						);
					})
				: json(200, { credit: "1" }),
		);
		const pending = check();
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await expect(pending).resolves.toMatchObject({
			status: "check_failed",
			quota: null,
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(log).not.toHaveBeenCalled();
	});

	it("연결이 끊기면 확인 실패이고 로그에는 공급자와 오류 이름만 남는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValue(new TypeError(`fetch failed ${KEY}`));
		await expect(check()).resolves.toMatchObject({ status: "check_failed" });
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(
			"[providerStatus] fish_audio 확인 실패: TypeError",
		);
	});

	it("10초 안에 답이 없으면 요청을 끊고 확인 실패다", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const pending = check();
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await expect(pending).resolves.toMatchObject({ status: "check_failed" });
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
		expect(log).not.toHaveBeenCalled();
	});
});

const SAMPLE = "https://platform.r2.fish.audio/task/t1.mp3";
const rawVoice = (overrides: Record<string, unknown> = {}) => ({
	_id: "fish_1",
	type: "tts",
	title: "차분한 내레이터",
	description: "따뜻한 목소리",
	cover_image: "https://platform.r2.fish.audio/cover/fish_1.png",
	train_mode: "fast",
	state: "trained",
	tags: ["Korean", "female", "young", "narration", "calm"],
	samples: [
		{ title: "기본", text: "안녕하세요", task_id: "t1", audio: SAMPLE },
	],
	languages: ["ko"],
	visibility: "public",
	dmca_taken_down: false,
	licensed: true,
	pvc_release_state: null,
	task_count: 377_693,
	like_count: 1,
	mark_count: 1,
	shared_count: 1,
	author: { _id: "a1", nickname: "n", avatar: "" },
	created_at: "2026-09-01T00:00:00Z",
	updated_at: "2026-09-01T00:00:00Z",
	...overrides,
});
const rawVoicePage = (
	items: unknown[],
	extra: Record<string, unknown> = {},
) => ({
	items,
	total: 1000,
	has_more: true,
	max_offset: 1000,
	accessible_upper_bound: 1000,
	window_limited: true,
	total_is_exact: false,
	...extra,
});
const listFish = (input: ListInputOf<"fish_audio">) =>
	createFishAudio(KEY).listVoices?.(input);

describe("Fish Audio 목록", () => {
	it("공개 성우를 계약 모양으로 바꾼다. 태그·언어·샘플·사용 횟수·보증 성우", async () => {
		fetchMock.mockResolvedValue(json(200, rawVoicePage([rawVoice()])));
		const page = await listFish(fishInput());
		expect(page).toMatchObject({
			next: 2,
			total: 1000,
			totalExact: false,
			windowLimited: true,
		});
		expect(page?.voices).toEqual([
			{
				provider: "fish_audio",
				source: "public",
				voiceId: "fish_1",
				name: "차분한 내레이터",
				englishName: null,
				gender: null,
				age: null,
				accent: null,
				pitch: null,
				personas: [],
				useCases: [],
				descriptives: [],
				tags: ["Korean", "female", "young", "narration", "calm"],
				languages: ["ko"],
				category: null,
				origin: null,
				description: "따뜻한 목소리",
				models: [],
				previewUrl: SAMPLE,
				samples: [{ language: null, title: "기본", url: SAMPLE }],
				usage: { kind: "tasks", count: 377_693 },
				terms: {
					freeUsersAllowed: null,
					noticePeriodDays: null,
					liveModeration: false,
					creditRate: null,
					licensed: true,
					retiring: false,
				},
			},
		]);
	});

	it("조건을 쿼리로 보낸다: 태그는 반복 키, 보증 성우는 켤 때만, 키는 Bearer, 한 번만 부른다", async () => {
		// 한 테스트에서 두 번 부르므로 호출마다 새 응답을 준다(본문은 한 번만 읽힌다)
		fetchMock.mockImplementation(async () => json(200, rawVoicePage([])));
		await listFish(
			fishInput({
				page: 3,
				query: {
					search: "내레이터",
					tags: ["female", "narration"],
					licensed: true,
					sort: "task_count",
				},
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = calledUrl();
		expect(url.origin + url.pathname).toBe("https://api.fish.audio/model");
		expect(url.searchParams.get("page_size")).toBe("100");
		expect(url.searchParams.get("page_number")).toBe("3");
		expect(url.searchParams.get("title")).toBe("내레이터");
		expect(url.searchParams.get("language")).toBe("ko");
		expect(url.searchParams.getAll("tag")).toEqual(["female", "narration"]);
		expect(url.searchParams.get("licensed")).toBe("true");
		expect(url.searchParams.get("sort_by")).toBe("task_count");
		expect(url.searchParams.has("self")).toBe(false);
		const init = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get("authorization")).toBe(
			`Bearer ${KEY}`,
		);
		// 보증 성우를 끄면 licensed 키 자체를 보내지 않는다(공급자 기본값 그대로)
		await listFish(fishInput({ query: { licensed: false } }));
		const off = calledUrl(1);
		expect(off.searchParams.has("licensed")).toBe(false);
	});

	it("내 계정은 self=true이고 보증 성우 조건을 보내지 않으며 출처는 내가 만든 성우다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				rawVoicePage([rawVoice({ visibility: "private" })], {
					total: 1,
					has_more: false,
					window_limited: false,
					total_is_exact: true,
				}),
			),
		);
		const page = await listFish(
			fishInput({ source: "account", query: { licensed: true } }),
		);
		const url = calledUrl();
		expect(url.searchParams.get("self")).toBe("true");
		expect(url.searchParams.has("licensed")).toBe(false);
		expect(page?.voices[0]).toMatchObject({ source: "account", origin: "own" });
		expect(page).toMatchObject({
			next: null,
			totalExact: true,
			windowLimited: false,
		});
	});

	it("합성할 수 없는 성우(svc, 학습 전, 삭제 요청)는 로그 없이 빼고, 공개 종료 중은 남겨 알린다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(
				200,
				rawVoicePage([
					rawVoice({ _id: "svc", type: "svc" }),
					rawVoice({ _id: "training", state: "training" }),
					rawVoice({ _id: "dmca", dmca_taken_down: true }),
					rawVoice({ _id: "retiring", pvc_release_state: "retiring" }),
				]),
			),
		);
		const page = await listFish(fishInput());
		expect(page?.voices.map((v) => [v.voiceId, v.terms.retiring])).toEqual([
			["retiring", true],
		]);
		expect(log).not.toHaveBeenCalled();
	});

	it("공개 출처는 visibility가 public이 아닌 성우(private, unlist)를 로그 없이 뺀다. 내 계정은 거르지 않는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () =>
			json(
				200,
				rawVoicePage([
					rawVoice({ _id: "priv", visibility: "private" }),
					rawVoice({ _id: "unl", visibility: "unlist" }),
					rawVoice(),
				]),
			),
		);
		expect((await listFish(fishInput()))?.voices.map((v) => v.voiceId)).toEqual(
			["fish_1"],
		);
		expect(
			(await listFish(fishInput({ source: "account" })))?.voices.map(
				(v) => v.voiceId,
			),
		).toEqual(["priv", "unl", "fish_1"]);
		expect(log).not.toHaveBeenCalled();
	});

	it("10페이지면 has_more가 참이어도 다음이 없고 window_limited가 빠져도 창 제한이다(조건마다 1,000명)", async () => {
		fetchMock.mockResolvedValue(
			json(200, rawVoicePage([rawVoice()], { window_limited: undefined })),
		);
		expect(await listFish(fishInput({ page: 10 }))).toMatchObject({
			next: null,
			windowLimited: true,
		});
	});

	it("공급자 호스트가 아닌 샘플은 버리고 첫 올바른 샘플이 행 샘플이다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				rawVoicePage([
					rawVoice({
						samples: [
							{ title: "밖", audio: "https://evil.example/a.mp3" },
							// 호스트 끝이 아닌 곳이나 앞 글자가 붙은 호스트, https가 아닌 주소도 버린다
							{ title: "접미", audio: "https://fish.audio.evil.example/a.mp3" },
							{ title: "접두", audio: "https://notfish.audio/a.mp3" },
							{ title: "평문", audio: "http://platform.r2.fish.audio/a.mp3" },
							{ title: "둘째", audio: SAMPLE },
						],
					}),
				]),
			),
		);
		const [voice] = (await listFish(fishInput()))?.voices ?? [];
		expect(voice?.samples).toEqual([
			{ language: null, title: "둘째", url: SAMPLE },
		]);
		expect(voice?.previewUrl).toBe(SAMPLE);
	});

	it("같은 주소의 샘플은 처음 것만 남긴다(화면 패널의 key가 주소다)", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				rawVoicePage([
					rawVoice({
						samples: [
							{ title: "처음", audio: SAMPLE },
							{ title: "같은 주소", audio: SAMPLE },
						],
					}),
				]),
			),
		);
		const [voice] = (await listFish(fishInput()))?.voices ?? [];
		expect(voice?.samples).toEqual([
			{ language: null, title: "처음", url: SAMPLE },
		]);
		expect(voice?.previewUrl).toBe(SAMPLE);
	});

	it("429는 rate_limit이고 Retry-After가 없으므로 retryAt이 없다", async () => {
		fetchMock.mockResolvedValue(
			json(429, { message: "Too many", status: 429 }),
		);
		// listFish는 undefined일 수 있어 ?.catch로 받고 모양을 단언한다(계획 리뷰 E3 실행 확인)
		const error = (await listFish(fishInput())?.catch((e: unknown) => e)) as {
			code: string;
			data: object;
		};
		expect(error.code).toBe("TOO_MANY_REQUESTS");
		expect(error.data).toEqual({
			provider: "fish_audio",
			reason: "rate_limit",
		});
	});

	it("목록은 20초까지 기다린다(실측 1.7~11.4초)", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
		const pending = listFish(fishInput());
		const settled = vi.fn();
		pending?.then(settled, settled);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		await expect(pending).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		vi.useRealTimers();
	});

	it.each([
		[401, "BAD_GATEWAY", "provider_auth"],
		[503, "BAD_GATEWAY", "provider_error"],
	])("%s → %s·%s, 재시도하지 않는다", async (status, code, reason) => {
		fetchMock.mockResolvedValue(json(status, { message: "x", status }));
		await expect(listFish(fishInput())).rejects.toMatchObject({
			code,
			data: { provider: "fish_audio", reason },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("응답 모양이 어긋나면(items가 배열이 아님) 목록 전체가 provider_error다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(json(200, { items: null, total: 0 }));
		await expect(listFish(fishInput())).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "fish_audio", reason: "provider_error" },
		});
	});

	it('type이 없거나 dmca_taken_down이 불리언이 아닌("true") 항목은 모양이 어긋난 것이라 그 성우만 빼고 필드 이름만 한 줄 남긴다(계획 리뷰 E11)', async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(
				200,
				rawVoicePage([
					rawVoice({ _id: "odd", type: undefined }),
					rawVoice({ _id: "takedown", dmca_taken_down: "true" }),
					rawVoice(),
				]),
			),
		);
		const page = await listFish(fishInput());
		expect(page?.voices.map((v) => v.voiceId)).toEqual(["fish_1"]);
		expect(log.mock.calls).toEqual([
			["[voiceList] fish_audio 성우 2명 제외: type, dmca_taken_down"],
		]);
	});

	it("visibility가 없는 항목은 공개 출처에서는 로그 없이 빠지고(닫히는 쪽), 내 계정 출처에서는 남는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () =>
			json(
				200,
				rawVoicePage([
					rawVoice({ _id: "hidden", visibility: undefined }),
					rawVoice({ _id: "none", visibility: null }),
				]),
			),
		);
		expect((await listFish(fishInput()))?.voices).toEqual([]);
		expect(
			(await listFish(fishInput({ source: "account" })))?.voices.map(
				(v) => v.voiceId,
			),
		).toEqual(["hidden", "none"]);
		expect(log).not.toHaveBeenCalled();
	});

	it("has_more가 없으면 total로 다음 페이지를 정한다", async () => {
		fetchMock.mockImplementation(async () =>
			json(
				200,
				rawVoicePage([rawVoice()], { has_more: undefined, total: 150 }),
			),
		);
		expect((await listFish(fishInput()))?.next).toBe(2);
		expect((await listFish(fishInput({ page: 2 })))?.next).toBeNull();
	});
});

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9]);
const audio = () =>
	new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
const bodyOf = (i = 0) =>
	JSON.parse(String(fetchMock.mock.calls[i]?.[1]?.body));

describe("Fish Audio 시험 생성 (Review Focus 2)", () => {
	const synth = (
		settings: Partial<FishSettings> = {},
		options?: SynthesizeOptions,
	) =>
		createFishAudio(KEY).synthesize?.(
			{
				provider: "fish_audio",
				voiceId: "f".repeat(32),
				text: "안녕",
				settings: { ...DEFAULT_SETTINGS.fish_audio, ...settings },
			},
			options,
		);

	it("두 모델 모두 model 헤더를 그대로 보내고 즉석 클론 필드는 보내지 않는다", async () => {
		fetchMock.mockImplementation(async () => audio());
		for (const model of ["s2.1-pro-free", "s2.1-pro"] as const) {
			fetchMock.mockClear();
			await expect(synth({ model, tag: "happy", speed: 1.2 })).resolves.toEqual(
				MP3,
			);
			const [url, init] = fetchMock.mock.calls[0] ?? [];
			expect(String(url)).toBe("https://api.fish.audio/v1/tts");
			expect(new Headers(init?.headers).get("model")).toBe(model);
			const body = bodyOf();
			expect(body).toEqual({
				text: "[happy] 안녕",
				reference_id: "f".repeat(32),
				temperature: 0.7,
				prosody: { speed: 1.2 },
				format: "mp3",
				mp3_bitrate: 128,
				latency: "normal",
			});
			expect(body).not.toHaveProperty("references");
		}
	});
	it("402는 quota, Retry-After 없는 429는 시각 없이 rate_limit", async () => {
		fetchMock.mockResolvedValueOnce(
			json(402, { status: 402, message: "x", reason: null }),
		);
		await expect(synth()).rejects.toMatchObject({ data: { reason: "quota" } });
		fetchMock.mockResolvedValueOnce(json(429, { status: 429, message: "x" }));
		const error = await synth()?.catch((e: unknown) => e);
		expect(error).toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit" },
		});
		expect(
			(error as { data: { retryAt?: string } }).data.retryAt,
		).toBeUndefined();
	});
	it("연결이 끊기면(fetch TypeError) 처리 여부 미확인이고 한 번만 부른다(E1)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("작업실 대기(timeoutMs)를 받으면 60초를 넘겨도 끊지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			() =>
				new Promise<Response>((resolve) =>
					setTimeout(() => resolve(audio()), 120_000),
				),
		);
		const pending = synth({}, { timeoutMs: STUDIO_TIMEOUT_MS });
		await vi.advanceTimersByTimeAsync(120_000);
		await expect(pending).resolves.toBeDefined();
	});

	it("timeoutMs를 넘기면 unknown_outcome이고 onLate를 부르지 않는다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const onLate = vi.fn();
		const assertion = expect(
			synth({}, { timeoutMs: STUDIO_TIMEOUT_MS, onLate }),
		).rejects.toMatchObject({
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS);
		await assertion;
		expect(onLate).not.toHaveBeenCalled();
	});
});

describe("Fish Audio 성우 한 명 조회(T7)", () => {
	const raw = {
		_id: "fish1",
		type: "tts",
		state: "trained",
		visibility: "public",
		title: "차분한 남자",
		tags: ["male"],
		languages: ["ko"],
		samples: [{ title: "샘플", audio: "https://platform.r2.fish.audio/a.mp3" }],
	};
	const get = (source: "public" | "account" = "public", id = "fish1") =>
		createFishAudio(KEY).getVoice?.(source, id);

	it("200이면 Voice, 경로는 /model/{id}(인코딩)", async () => {
		fetchMock.mockResolvedValue(json(200, raw));
		expect(await get()).toMatchObject({
			provider: "fish_audio",
			voiceId: "fish1",
			name: "차분한 남자",
		});
		expect(calledUrl().pathname).toBe("/model/fish1");
		fetchMock.mockResolvedValue(json(200, raw));
		await get("public", "a/b");
		expect(calledUrl(1).pathname).toBe("/model/a%2Fb");
	});
	it("404·403이면 null", async () => {
		fetchMock.mockResolvedValueOnce(json(404, {}));
		expect(await get()).toBeNull();
		fetchMock.mockResolvedValueOnce(json(403, {}));
		expect(await get()).toBeNull();
	});
	it("공개 출처인데 비공개로 바뀌었거나 학습 전이면 null", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, { ...raw, visibility: "private" }),
		);
		expect(await get()).toBeNull();
		fetchMock.mockResolvedValueOnce(json(200, { ...raw, state: "training" }));
		expect(await get()).toBeNull();
	});
	it("401은 null이 아니라 provider_auth", async () => {
		fetchMock.mockResolvedValue(json(401, {}));
		await expect(get()).rejects.toMatchObject({
			data: { provider: "fish_audio", reason: "provider_auth" },
		});
	});
});

// 2026-10-22 실제 응답(조사 9절). 이벤트의 오디오는 길이("<N bytes>")로만 남아 있어 그 길이만큼의 0바이트로 되살린다
const research = <T>(file: string) =>
	JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL(
					`../../../../docs/research/data/fish-drama-pcm-2026-10-22/${file}`,
					import.meta.url,
				),
			),
			"utf8",
		),
	) as T;
type SseEvent = Record<string, unknown>;
const EVENTS = research<SseEvent[]>("events.json").map((event) => {
	const bytes = /^<(\d+) bytes>$/.exec(String(event.audio_base64))?.[1];
	return bytes
		? {
				...event,
				audio_base64: Buffer.alloc(Number(bytes)).toString("base64"),
			}
		: event;
});
const WORDS = research<AlignedSegment[]>("words.json");

// SSE 본문을 size바이트 조각의 스트림으로 흘린다(한글 글자 가운데서도 끊긴다)
const streamOf = (text: string, size = 4093) => {
	const bytes = new TextEncoder().encode(text);
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (let at = 0; at < bytes.length; at += size)
					controller.enqueue(bytes.subarray(at, at + size));
				controller.close();
			},
		}),
		{ status: 200, headers: { "content-type": "text/event-stream" } },
	);
};
const sseOf = (events: readonly unknown[]) =>
	streamOf(
		events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
	);
const b64 = (...bytes: number[]) => Buffer.from(bytes).toString("base64");
// 정렬 하나(청크 0, 오프셋 0). 4바이트 오디오는 2샘플이라 길이 0초로 둔다
const aligned = (segments: AlignedSegment[]) => ({
	alignment: { segments, audio_duration: 0 },
	chunk_seq: 0,
	chunk_audio_offset_sec: 0,
});
// 늦은 결과 시험의 작은 장면
const SMALL = [
	{
		audio_base64: b64(1, 2, 3, 4),
		...aligned([{ text: "안녕", start: 0, end: 0 }]),
	},
];
// 공급자 신호를 따르는 fetch: 끊기면 AbortError로 거절한다
const abortable = (
	init: RequestInit | undefined,
	reject: (e: unknown) => void,
) =>
	init?.signal?.addEventListener("abort", () =>
		reject(new DOMException("aborted", "AbortError")),
	);
// 같은 조각을 times번까지 흘리는 본문. 미리 당기지 않아(highWaterMark 0) 꺼낸 횟수가 읽은 조각 수다
const repeated = (chunk: Uint8Array, times: number) => {
	const seen = { pulls: 0, cancel: vi.fn() };
	const body = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				if (seen.pulls < times) {
					seen.pulls++;
					controller.enqueue(chunk);
				} else controller.close();
			},
			cancel: seen.cancel,
		},
		{ highWaterMark: 0 },
	);
	return { response: new Response(body, { status: 200 }), seen };
};
const MiB = 1024 * 1024;

describe("Fish Audio 장면 생성 (T9.5)", () => {
	const SCENE: SceneRequest = {
		model: "drama-3",
		text: "<|speaker:0|>[놀라며] 너 지금 몇 시인지 알아?\n<|speaker:1|>알아, 알아.",
		referenceIds: ["a".repeat(32), "b".repeat(32)],
		speed: 1.1,
		temperature: 0.6,
	};
	const scene = (
		over: Partial<SceneRequest> = {},
		options?: SynthesizeOptions<SceneAudio>,
	) => createFishAudio(KEY).synthesizeScene?.({ ...SCENE, ...over }, options);

	it("synthesizeScene에 logPrefix를 주면 실패 로그가 [drama]로 시작한다", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(scene({}, { logPrefix: "[drama]" })).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		expect(String(spy.mock.calls[0]?.[0])).toMatch(
			/^\[drama\] fish_audio 생성 실패:/,
		);
	});

	it("POST /v1/tts/stream/with-timestamp, model 헤더는 세 모델 각각 그대로, 본문은 정한 칸만", async () => {
		fetchMock.mockImplementation(async () => sseOf(SMALL));
		for (const model of ["s2.1-pro-free", "s2.1-pro", "drama-3"] as const) {
			fetchMock.mockClear();
			await scene({ model });
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0] ?? [];
			expect(String(url)).toBe(
				"https://api.fish.audio/v1/tts/stream/with-timestamp",
			);
			expect(init?.method).toBe("POST");
			const headers = new Headers(init?.headers);
			expect(headers.get("model")).toBe(model);
			expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
			expect(headers.get("content-type")).toBe("application/json");
			expect(bodyOf()).toEqual({
				text: SCENE.text,
				reference_id: ["a".repeat(32), "b".repeat(32)],
				format: "pcm",
				sample_rate: 44100,
				temperature: 0.6,
				prosody: { speed: 1.1 },
				latency: "normal",
			});
		}
	});

	it("reference_id는 성우 하나면 문자열이다", async () => {
		fetchMock.mockImplementation(async () => sseOf(SMALL));
		await scene({ referenceIds: ["a".repeat(32)] });
		expect(bodyOf().reference_id).toBe("a".repeat(32));
	});

	it("실제 응답(events.json) → pcm은 이벤트 오디오의 합, segments는 words.json(청크 1은 오프셋을 더한 값)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () => sseOf(EVENTS));
		const result = await scene();
		expect(result?.pcm.byteLength).toBe(1_190_720);
		expect(WORDS).toHaveLength(33);
		expect(result?.segments).toEqual(WORDS);
		// 청크 1의 첫 세그먼트(0.24~0.88초)에 청크 오프셋 9.845260770975056초를 더했다
		expect(result?.segments?.[26]).toEqual({
			text: "고마워",
			start: 10.085260770975056,
			end: 10.725260770975057,
		});
		expect(log).not.toHaveBeenCalled();
	});

	it("CRLF 구분, event: 줄, [DONE], 빈 data를 건너뛰고 1바이트씩 와도(한글 가운데 끊김) 같다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const first = {
			audio_base64: b64(1, 2),
			...aligned([{ text: "안녕", start: 0, end: 0 }]),
		};
		const second = {
			audio_base64: b64(3, 4),
			...aligned([
				{ text: "안녕", start: 0, end: 0 },
				{ text: "하세요", start: 0, end: 0 },
			]),
		};
		fetchMock.mockImplementation(async () =>
			streamOf(
				[
					`event: message\r\ndata: ${JSON.stringify(first)}\r\n\r\n`,
					"event: message\r\ndata:\r\n\r\n",
					`data: ${JSON.stringify(second)}\r\n\r\n`,
					"data: [DONE]\r\n\r\n",
				].join(""),
				1,
			),
		);
		const result = await scene();
		expect(Array.from(result?.pcm ?? [])).toEqual([1, 2, 3, 4]);
		// 같은 청크의 마지막 스냅샷만 쓴다
		expect(result?.segments).toEqual([
			{ text: "안녕", start: 0, end: 0 },
			{ text: "하세요", start: 0, end: 0 },
		]);
		expect(log).not.toHaveBeenCalled();
	});

	it.each([
		["chunk_seq null", { chunk_seq: null }],
		["alignment {}", { alignment: {} }],
		["segments 없음", { alignment: { audio_duration: 1 } }],
	])(
		"정렬 모양이 다르면(%s) pcm은 그대로이고 segments null, 로그 한 줄(E1)",
		async (_name, broken) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			fetchMock.mockImplementation(async () =>
				sseOf(
					EVENTS.map((event, i) => (i === 5 ? { ...event, ...broken } : event)),
				),
			);
			const result = await scene();
			expect(result?.pcm.byteLength).toBe(1_190_720);
			expect(result?.segments).toBeNull();
			expect(log.mock.calls).toEqual([["[drama] 정렬 버림: 모양"]]);
		},
	);

	it("audio_base64가 없거나 null인 정렬만의 이벤트는 오디오 없이 정렬만 쓴다", async () => {
		const segments = [{ text: "안녕", start: 0, end: 0 }];
		fetchMock.mockImplementation(async () =>
			sseOf([
				{ audio_base64: b64(1, 2) },
				{ audio_base64: null, ...aligned([]) },
				{ audio_base64: b64(3, 4) },
				aligned(segments),
			]),
		);
		const result = await scene();
		expect(Array.from(result?.pcm ?? [])).toEqual([1, 2, 3, 4]);
		expect(result?.segments).toEqual(segments);
	});

	it("alignment가 없거나 null인 응답은 segments null이고 로그가 없다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () =>
			sseOf(
				EVENTS.map(({ alignment: _drop, ...rest }, i) =>
					i % 2 ? rest : { ...rest, alignment: null },
				),
			),
		);
		const result = await scene();
		expect(result?.pcm.byteLength).toBe(1_190_720);
		expect(result?.segments).toBeNull();
		expect(log).not.toHaveBeenCalled();
	});

	it("오디오 합이 0바이트면 처리 여부 미확인이다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () =>
			sseOf(EVENTS.map((event) => ({ ...event, audio_base64: "" }))),
		);
		await expect(scene()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		// runTrial 공통 틀의 한 줄(ORPCError의 name은 Error다)
		expect(log.mock.calls).toEqual([["[trial] fish_audio 생성 실패: Error"]]);
	});

	it("JSON이 아닌 data는 처리 여부 미확인이고 로그에는 오류 이름만 남는다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () =>
			streamOf(
				`data: ${JSON.stringify(SMALL[0])}\n\ndata: {"audio_base64": "AQI\n\n`,
			),
		);
		await expect(scene()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		expect(log.mock.calls).toEqual([
			["[trial] fish_audio 생성 실패: SyntaxError"],
		]);
	});

	it("402는 quota, 429 + Retry-After는 rate_limit과 다음 호출 가능 시각, 재시도하지 않는다", async () => {
		fetchMock.mockResolvedValueOnce(
			json(402, { status: 402, message: "x", reason: null }),
		);
		await expect(scene()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "fish_audio", reason: "quota" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		fetchMock.mockResolvedValueOnce(
			json(429, { status: 429, message: "x" }, { "retry-after": "30" }),
		);
		const before = Date.now();
		const error = (await scene()?.catch((e: unknown) => e)) as {
			code: string;
			data: { reason: string; retryAt?: string };
		};
		expect(error).toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit" },
		});
		const wait = Date.parse(error.data.retryAt ?? "") - before;
		expect(wait).toBeGreaterThanOrEqual(30_000);
		expect(wait).toBeLessThan(31_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("180초가 지나면 처리 여부 미확인이고 요청은 끊지 않아 onLate의 약속이 나중에 장면 결과로 풀린다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise<Response>((resolve, reject) => {
					abortable(init, reject);
					// 180초 뒤, 늦은 상한(270초) 전에 답한다
					setTimeout(() => resolve(sseOf(SMALL)), STUDIO_TIMEOUT_MS + 20_000);
				}),
		);
		const onLate = vi.fn<(late: Promise<SceneAudio>) => void>();
		const pending = scene({}, { timeoutMs: STUDIO_TIMEOUT_MS, onLate });
		const failed = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS);
		await failed;
		const signal = fetchMock.mock.calls[0]?.[1]?.signal;
		expect(signal?.aborted).toBe(false);
		expect(onLate).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(20_000);
		const late = await onLate.mock.calls[0]?.[0];
		expect(Array.from(late?.pcm ?? [])).toEqual([1, 2, 3, 4]);
		expect(late?.segments).toEqual([{ text: "안녕", start: 0, end: 0 }]);
		// 끝난 요청의 늦은 상한 타이머는 지웠다
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(SCENE_LATE_MAX_MS);
		expect(signal?.aborted).toBe(false);
	});

	it("270초까지 답이 없으면 fetch 신호를 끊고 늦은 약속은 거절된다(E2, ADR 0013)", async () => {
		// Vercel Hobby 함수 300초 − 저장 여유 30초
		expect(SCENE_LATE_MAX_MS).toBe(270_000);
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => abortable(init, reject)),
		);
		const onLate = vi.fn<(late: Promise<SceneAudio>) => void>();
		const pending = scene({}, { timeoutMs: STUDIO_TIMEOUT_MS, onLate });
		const failed = expect(pending).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS);
		await failed;
		const late = onLate.mock.calls[0]?.[0];
		const lateFailed = expect(late).rejects.toHaveProperty(
			"name",
			"AbortError",
		);
		const signal = fetchMock.mock.calls[0]?.[1]?.signal;
		await vi.advanceTimersByTimeAsync(
			SCENE_LATE_MAX_MS - STUDIO_TIMEOUT_MS - 1,
		);
		expect(signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(signal?.aborted).toBe(true);
		await lateFailed;
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("옵션 없이 부르면 60초가 아니라 180초까지 기다린다(유료 결과를 일찍 버리지 않는다)", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => abortable(init, reject)),
		);
		const settled = vi.fn();
		const pending = scene();
		pending?.then(settled, settled);
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS - 1);
		expect(settled).not.toHaveBeenCalled();
		const failed = expect(pending).rejects.toMatchObject({
			data: { reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(1);
		await failed;
		// 끊긴 요청은 늦은 상한(SCENE_LATE_MAX_MS)까지 그대로 둔다(아래 정리용으로 끝까지 돌린다)
		expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(SCENE_LATE_MAX_MS);
	});

	it("빈 줄 없이 끝난 마지막 블록도 읽는다(오디오가 잘려도 정상처럼 보이지 않게)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const segments = [{ text: "안녕", start: 0, end: 0 }];
		fetchMock.mockImplementation(async () =>
			streamOf(
				`data: ${JSON.stringify({ audio_base64: b64(1, 2) })}\n\ndata: ${JSON.stringify(
					{ audio_base64: b64(3, 4), ...aligned(segments) },
				)}`,
				1,
			),
		);
		const result = await scene();
		expect(Array.from(result?.pcm ?? [])).toEqual([1, 2, 3, 4]);
		expect(result?.segments).toEqual(segments);
		expect(log).not.toHaveBeenCalled();
	});

	it("PCM이 32MiB(STUDIO_AUDIO_MAX)를 넘으면 더 읽지 않고 본문을 취소하며 모은 오디오를 정렬 없이 돌려준다", async () => {
		// 8MiB 오디오 이벤트 하나를 열 번까지 흘린다. 다섯 번째(40MiB)에서 32MiB를 넘는다
		const event = new TextEncoder().encode(
			`data: ${JSON.stringify({ audio_base64: Buffer.alloc(8 * MiB).toString("base64"), ...aligned([]) })}\n\n`,
		);
		const { response, seen } = repeated(event, 10);
		fetchMock.mockResolvedValue(response);
		const result = await scene();
		expect(result?.pcm.byteLength).toBe(40 * MiB);
		expect(result?.segments).toBeNull();
		expect(seen.pulls).toBe(5);
		expect(seen.cancel).toHaveBeenCalledTimes(1);
	});

	it("빈 줄 없이 덜 온 블록이 STUDIO_AUDIO_MAX × 2글자를 넘으면 본문을 취소하고 처리 여부 미확인이다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		// 16MiB 'A' 조각. 네 번째까지 64Mi글자(= 상한), 다섯 번째에서 넘는다
		const { response, seen } = repeated(new Uint8Array(16 * MiB).fill(65), 8);
		fetchMock.mockResolvedValue(response);
		await expect(scene()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		expect(seen.pulls).toBe(5);
		expect(seen.cancel).toHaveBeenCalledTimes(1);
		expect(log.mock.calls).toEqual([
			["[trial] fish_audio 생성 실패: RangeError"],
		]);
	});

	it("정렬 모양은 맞는데 끝이 PCM 길이와 다르면 segments null, 로그 한 줄", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async () =>
			sseOf([
				// 4바이트(약 0초)인데 정렬은 1초라고 한다
				{
					audio_base64: b64(1, 2, 3, 4),
					alignment: {
						segments: [{ text: "안녕", start: 0, end: 0 }],
						audio_duration: 1,
					},
					chunk_seq: 0,
					chunk_audio_offset_sec: 0,
				},
			]),
		);
		const result = await scene();
		expect(Array.from(result?.pcm ?? [])).toEqual([1, 2, 3, 4]);
		expect(result?.segments).toBeNull();
		expect(log.mock.calls).toEqual([["[drama] 정렬 버림: 길이"]]);
	});
});
