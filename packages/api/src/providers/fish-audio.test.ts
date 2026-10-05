import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListInputOf } from "./contract";
import { CHECK_TIMEOUT_MS } from "./errors";
import { createFishAudio } from "./fish-audio";
import {
	calledUrl,
	fetchMock,
	fishInput,
	json,
	useFetchMock,
} from "./test-utils";

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
