import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListInputOf } from "./contract";
import { createElevenLabs } from "./elevenlabs";
import { CHECK_TIMEOUT_MS } from "./errors";
import {
	calledUrl,
	elAccountInput,
	elPublicInput,
	fetchMock,
	json,
	useFetchMock,
} from "./test-utils";
import { DEFAULT_SETTINGS, type ElevenLabsSettings } from "./trial-options";

const KEY = "sk_elevenlabs_test_0001";
// SDK가 필수로 검사하는 필드를 모두 채운 구독 응답이다(2.70.0 serialization/types/Subscription).
const subscription = (over: Record<string, unknown> = {}) => ({
	tier: "creator",
	character_count: 1_000,
	character_limit: 100_000,
	max_credit_limit_extension: 0,
	can_extend_character_limit: false,
	allowed_to_extend_character_limit: false,
	next_character_count_reset_unix: 1_760_227_200,
	voice_slots_used: 0,
	professional_voice_slots_used: 0,
	professional_voice_slots_used_in_workspace: 0,
	voice_limit: 30,
	voice_add_edit_counter: 0,
	professional_voice_limit: 1,
	can_extend_voice_limit: false,
	can_use_instant_voice_cloning: true,
	can_use_professional_voice_cloning: true,
	current_overage: { amount: "0", currency: "usd" },
	status: "active",
	open_invoices: [],
	has_open_invoices: false,
	...over,
});
const detail = (code: string, status = code) => ({
	detail: {
		type: "authentication_error",
		code,
		message: "x",
		status,
		request_id: "r1",
	},
});
const check = () => createElevenLabs(KEY).checkStatus();

useFetchMock();
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

// 상태 코드 → 사유 표 전체는 errors.test.ts가 고정한다. 여기서는 SDK 오류를 바꿔 담는 것과 권한 부족 형태만 본다.
describe("ElevenLabs 연결 확인", () => {
	it("200이면 연결됨과 남은 글자·초기화 시각, 요청은 공식 호스트에 키를 붙여 1회", async () => {
		vi.stubEnv("ELEVENLABS_API_KEY", "env-key");
		fetchMock.mockResolvedValue(json(200, subscription()));
		await expect(check()).resolves.toMatchObject({
			provider: "elevenlabs",
			status: "connected",
			quota: {
				remaining: 99_000,
				total: 100_000,
				plan: null,
				resetAt: new Date(1_760_227_200 * 1000).toISOString(),
				overageAllowed: false,
			},
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(init?.redirect).toBe("error");
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.elevenlabs.io");
		expect(target.pathname).toBe("/v1/user/subscription");
		expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
	});

	it("초기화 시각이 null이고 모르는 필드가 더 와도 연결됨이다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				subscription({
					next_character_count_reset_unix: null,
					field_added_later: { any: "shape" },
				}),
			),
		);
		await expect(check()).resolves.toMatchObject({
			status: "connected",
			quota: { resetAt: null },
		});
	});

	it("잔여 0 이하는 확장이 0일 때만 한도 부족이다", async () => {
		fetchMock.mockImplementation(async () =>
			json(200, subscription({ character_count: 100_000 })),
		);
		await expect(check()).resolves.toMatchObject({
			status: "quota",
			quota: { remaining: 0, overageAllowed: false },
		});
		fetchMock.mockImplementation(async () =>
			json(
				200,
				subscription({
					character_count: 100_500,
					max_credit_limit_extension: 5_000,
				}),
			),
		);
		await expect(check()).resolves.toMatchObject({
			status: "connected",
			quota: { remaining: -500, overageAllowed: true },
		});
		fetchMock.mockImplementation(async () =>
			json(
				200,
				subscription({
					character_count: 100_000,
					max_credit_limit_extension: "unlimited",
				}),
			),
		);
		await expect(check()).resolves.toMatchObject({ status: "connected" });
	});

	it.each([
		[401, detail("invalid_api_key"), "provider_auth", "invalid_api_key"],
		[
			403,
			detail("insufficient_permissions"),
			"no_permission",
			"insufficient_permissions",
		],
		// 비공식 자료의 형태: code는 다르고 status에 권한 코드가 온다. 코드 줄에는 권한 코드를 먼저 보인다.
		[
			401,
			detail("unauthorized", "missing_permissions"),
			"no_permission",
			"missing_permissions",
		],
	] as const)(
		"HTTP %i(%j)이면 %s, 코드 %s이고 재시도하지 않는다",
		async (status, body, expected, code) => {
			fetchMock.mockImplementation(async () => json(status, body));
			await expect(check()).resolves.toMatchObject({
				status: expected,
				providerCode: code,
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
		},
	);

	it("429면 요청 제한이고 Retry-After 초를 담으며 재시도하지 않는다", async () => {
		fetchMock.mockImplementation(async () =>
			json(429, detail("rate_limit_exceeded"), { "retry-after": "7" }),
		);
		await expect(check()).resolves.toMatchObject({
			status: "rate_limit",
			retryAfterSeconds: 7,
			providerCode: "rate_limit_exceeded",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([
		["필드 누락", subscription({ character_limit: undefined })],
		["숫자 아님", subscription({ character_count: "1000" })],
	])(
		"응답 검증 실패(%s)는 확인 실패이고 SDK가 준 경로만 남긴다",
		async (_name, body) => {
			const log = vi.spyOn(console, "error").mockImplementation(() => {});
			fetchMock.mockResolvedValue(json(200, body));
			await expect(check()).resolves.toMatchObject({ status: "check_failed" });
			expect(log).toHaveBeenCalledTimes(1);
			expect(log.mock.calls[0]?.[0]).toMatch(
				/^\[providerStatus\] elevenlabs 확인 실패: ParseError \(response/,
			);
			// ParseError 메시지에는 받은 값이 들어 있어 남기지 않는다.
			expect(String(log.mock.calls[0]?.[0])).not.toContain("1000");
		},
	);

	it("연결이 끊기면 확인 실패이고 로그에 키가 없다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValue(new TypeError("fetch failed"));
		await expect(check()).resolves.toMatchObject({ status: "check_failed" });
		expect(log).toHaveBeenCalledWith(
			"[providerStatus] elevenlabs 확인 실패: ElevenLabsError",
		);
		expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
	});

	it("10초 안에 답이 없으면 abortSignal로 요청을 끊고 확인 실패다", async () => {
		vi.useFakeTimers();
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
	});
});

const SAMPLE_EN =
	"https://storage.googleapis.com/eleven-public-prod/el_lib_1/en.mp3";
const SAMPLE_KO =
	"https://api.us.elevenlabs.io/v1/voices/el_lib_1/previews/audio?payload=abc";
const libraryVoice = (overrides: Record<string, unknown> = {}) => ({
	public_owner_id: "owner_1",
	voice_id: "el_lib_1",
	name: "Jiyoung - Calm Narrator",
	gender: "female",
	age: "young",
	accent: "seoul",
	descriptive: "calm",
	use_case: "narrative_story",
	category: "professional",
	language: "ko",
	locale: "ko-KR",
	description: "  차분하고 따뜻한 목소리  ",
	preview_url: SAMPLE_EN,
	verified_languages: [
		{
			language: "en",
			model_id: "eleven_multilingual_v2",
			preview_url: SAMPLE_EN,
		},
		{ language: "ko", model_id: "eleven_v4", preview_url: SAMPLE_KO },
	],
	usage_character_count_1y: 2_100_000,
	usage_character_count_7d: 10,
	play_api_usage_character_count_1y: 10,
	cloned_by_count: 3,
	rate: 1,
	free_users_allowed: false,
	live_moderation_enabled: true,
	featured: false,
	notice_period: 730,
	date_unix: 1_790_000_000,
	...overrides,
});
const libraryPage = (
	voices: unknown[],
	extra: Record<string, unknown> = {},
) => ({
	voices,
	has_more: true,
	total_count: 5953,
	...extra,
});
// 쿼리를 { 키: 값 배열 } 로 만든다(반복 키는 배열 여러 칸)
const queryOfUrl = (url: URL) =>
	Object.fromEntries(
		[...new Set(url.searchParams.keys())].map((key) => [
			key,
			url.searchParams.getAll(key),
		]),
	);
const listEl = (input: ListInputOf<"elevenlabs">) =>
	createElevenLabs(KEY).listVoices?.(input);

describe("ElevenLabs 공개 라이브러리", () => {
	it("성우를 계약 모양으로 바꾼다. 지금 언어의 샘플이 행 샘플이고 패널 샘플의 맨 앞이며 같은 주소는 한 번이다", async () => {
		fetchMock.mockResolvedValue(json(200, libraryPage([libraryVoice()])));
		const page = await listEl(elPublicInput());
		expect(page).toMatchObject({
			next: 1,
			total: 5953,
			totalExact: true,
			windowLimited: false,
		});
		expect(page?.voices).toEqual([
			{
				provider: "elevenlabs",
				source: "public",
				voiceId: "el_lib_1",
				name: "Jiyoung - Calm Narrator",
				englishName: null,
				gender: "female",
				age: "young",
				accent: "seoul",
				useCases: ["narrative_story"],
				descriptives: ["calm"],
				tags: [],
				languages: ["ko", "en"],
				category: "professional",
				origin: null,
				description: "차분하고 따뜻한 목소리",
				models: [],
				previewUrl: SAMPLE_KO,
				samples: [
					{ language: "ko", title: null, url: SAMPLE_KO },
					{ language: "en", title: null, url: SAMPLE_EN },
				],
				usage: { kind: "chars_1y", count: 2_100_000 },
				terms: {
					freeUsersAllowed: false,
					noticePeriodDays: 730,
					liveModeration: true,
					creditRate: 1,
					licensed: false,
					retiring: false,
				},
			},
		]);
	});

	it("조건을 쿼리로 보낸다: 보내는 키 전부를 고정한다. 빈 값·false는 빼고, 배열은 반복 키, 키는 xi-api-key 헤더, 한 번만 부른다", async () => {
		fetchMock.mockResolvedValue(
			json(200, libraryPage([], { has_more: false })),
		);
		await listEl(
			elPublicInput({
				page: 2,
				query: {
					accent: "seoul",
					gender: "female",
					useCases: ["narrative_story", "conversational"],
					descriptives: ["calm"],
					category: "professional",
					sort: "created_date",
				},
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = calledUrl();
		expect(url.origin + url.pathname).toBe(
			"https://api.elevenlabs.io/v1/shared-voices",
		);
		// 값은 키마다 getAll 배열이다: 반복 키(use_cases)와 쉼표로 이은 한 값을 구분한다. search·age·featured는 키가 없어야 한다
		expect(queryOfUrl(url)).toEqual({
			page_size: ["100"],
			page: ["2"],
			language: ["ko"],
			accent: ["seoul"],
			gender: ["female"],
			category: ["professional"],
			use_cases: ["narrative_story", "conversational"],
			descriptives: ["calm"],
			sort: ["created_date"],
		});
		const init = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
	});

	it("검색어·연령·추천을 켜면 search·age·featured=true를 보낸다", async () => {
		fetchMock.mockResolvedValue(
			json(200, libraryPage([], { has_more: false })),
		);
		await listEl(
			elPublicInput({
				query: {
					search: "차분한",
					age: "young",
					featured: true,
					language: null,
				},
			}),
		);
		expect(queryOfUrl(calledUrl())).toEqual({
			page_size: ["100"],
			page: ["0"],
			search: ["차분한"],
			age: ["young"],
			featured: ["true"],
			sort: ["trending"],
		});
	});

	it("마지막 페이지면 next가 null이고, 전체 수가 없으면 total null·totalExact false다", async () => {
		fetchMock.mockResolvedValue(
			json(200, { voices: [libraryVoice()], has_more: false }),
		);
		expect(await listEl(elPublicInput())).toMatchObject({
			next: null,
			total: null,
			totalExact: false,
		});
	});

	it("모든 언어(null)면 기본 샘플이 행 샘플이다. 공급자 호스트가 아니거나 http인 샘플은 버린다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({
						verified_languages: [
							{ language: "ko", preview_url: "https://evil.example/ko.mp3" },
							// 호스트 끝이 아닌 곳이나 앞 글자가 붙은 호스트도 버린다(정규식 앵커)
							{
								language: "ja",
								preview_url: "https://elevenlabs.io.evil.example/a.mp3",
							},
							{
								language: "de",
								preview_url: "https://evilelevenlabs.io/a.mp3",
							},
							{
								language: "fr",
								preview_url:
									"https://storage.googleapis.com.evil.example/a.mp3",
							},
						],
					}),
					libraryVoice({
						voice_id: "el_lib_2",
						preview_url: "http://storage.googleapis.com/x.mp3",
						verified_languages: null,
					}),
				]),
			),
		);
		const page = await listEl(elPublicInput({ query: { language: null } }));
		expect(page?.voices.map((v) => [v.previewUrl, v.samples.length])).toEqual([
			[SAMPLE_EN, 1],
			[null, 0],
		]);
	});

	it("설명은 1,000자로 자르고, 빈 descriptive·use_case는 배열에 넣지 않는다. 모르는 성별은 null이다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({
						description: "가".repeat(1500),
						descriptive: "",
						use_case: "",
						gender: "Unknown",
					}),
				]),
			),
		);
		const [voice] = (await listEl(elPublicInput()))?.voices ?? [];
		expect(voice?.description).toHaveLength(1000);
		expect(voice?.descriptives).toEqual([]);
		expect(voice?.useCases).toEqual([]);
		expect(voice?.gender).toBeNull();
	});

	it("이름이 없는 성우만 빼고 한 줄 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({ name: "" }),
					libraryVoice({ voice_id: "el_lib_2" }),
				]),
			),
		);
		const page = await listEl(elPublicInput());
		expect(page?.voices.map((v) => v.voiceId)).toEqual(["el_lib_2"]);
		expect(log.mock.calls).toEqual([
			["[voiceList] elevenlabs 성우 1명 제외: name"],
		]);
	});

	it.each([
		[401, {}, "BAD_GATEWAY", "provider_auth"],
		[
			401,
			{ detail: { status: "missing_permissions" } },
			"BAD_GATEWAY",
			"no_permission",
		],
		[503, {}, "BAD_GATEWAY", "provider_error"],
	])("%s → %s·%s, 재시도하지 않는다", async (status, body, code, reason) => {
		fetchMock.mockResolvedValue(json(status, body));
		await expect(listEl(elPublicInput())).rejects.toMatchObject({
			code,
			data: { provider: "elevenlabs", reason },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429면 TOO_MANY_REQUESTS이고 Retry-After를 다음 호출 시각으로 담는다", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
		fetchMock.mockResolvedValue(
			json(
				429,
				{ detail: { status: "rate_limit_exceeded" } },
				{ "retry-after": "30" },
			),
		);
		await expect(listEl(elPublicInput())).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: "2026-10-05T00:00:30.000Z" },
		});
		vi.useRealTimers();
	});

	it("10초 안에 답이 없으면 unknown_outcome이다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
		const pending = listEl(elPublicInput());
		const assertion = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
		vi.useRealTimers();
	});

	it("응답 모양이 어긋나면(voices가 배열이 아님) 목록 전체가 provider_error다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(json(200, { voices: null, has_more: false }));
		await expect(listEl(elPublicInput())).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "elevenlabs", reason: "provider_error" },
		});
	});

	it("Retry-After가 1시간보다 길면 1시간 뒤로 줄인다", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
		fetchMock.mockResolvedValue(json(429, {}, { "retry-after": "86400" }));
		await expect(listEl(elPublicInput())).rejects.toMatchObject({
			data: { reason: "rate_limit", retryAt: "2026-10-05T01:00:00.000Z" },
		});
		vi.useRealTimers();
	});

	it("같은 언어 샘플이 여럿이면(모델·억양별) 첫 것만 남긴다", async () => {
		const SAMPLE_KO_2 =
			"https://api.us.elevenlabs.io/v1/voices/el_lib_1/previews/audio?payload=def";
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({
						verified_languages: [
							{ language: "ko", model_id: "eleven_v4", preview_url: SAMPLE_KO },
							{
								language: "ko",
								model_id: "eleven_multilingual_v2",
								preview_url: SAMPLE_KO_2,
							},
						],
					}),
				]),
			),
		);
		const [voice] = (await listEl(elPublicInput()))?.voices ?? [];
		expect(voice?.samples.map((sample) => sample.url)).toEqual([
			SAMPLE_KO,
			SAMPLE_EN,
		]);
	});
});

describe("ElevenLabs 내 계정", () => {
	const accountVoice = (overrides: Record<string, unknown> = {}) => ({
		voice_id: "el_acc_1",
		name: "Rachel",
		category: "premade",
		labels: {
			gender: "female",
			age: "young",
			accent: "american",
			language: "en",
			use_case: "narrative_story",
			descriptive: "calm",
		},
		description: null,
		preview_url:
			"https://storage.googleapis.com/eleven-public-prod/premade/rachel.mp3",
		verified_languages: [],
		is_owner: false,
		...overrides,
	});

	it("출처를 정한다: premade는 제공 성우, is_owner는 내가 만든 성우, 그 밖은 라이브러리에서 저장. label을 성별·연령·억양·언어·콘텐츠·분위기로 옮긴다", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				voices: [
					accountVoice(),
					accountVoice({ voice_id: "el_acc_2", category: "professional" }),
					accountVoice({
						voice_id: "el_acc_3",
						category: "cloned",
						is_owner: true,
						labels: {},
					}),
				],
				has_more: true,
				total_count: 31,
				next_page_token: "tok_2",
			}),
		);
		const page = await listEl(elAccountInput());
		expect(page).toMatchObject({ next: "tok_2", total: 31, totalExact: true });
		expect(page?.voices.map((v) => [v.voiceId, v.source, v.origin])).toEqual([
			["el_acc_1", "account", "premade"],
			["el_acc_2", "account", "saved"],
			["el_acc_3", "account", "own"],
		]);
		expect(page?.voices[0]).toMatchObject({
			gender: "female",
			age: "young",
			accent: "american",
			languages: ["en"],
			useCases: ["narrative_story"],
			descriptives: ["calm"],
			category: "premade",
			terms: { freeUsersAllowed: null, licensed: false },
		});
		const url = calledUrl();
		expect(url.pathname).toBe("/v2/voices");
		expect(url.searchParams.get("include_total_count")).toBe("true");
		expect(url.searchParams.get("sort")).toBe("created_at_unix");
		expect(url.searchParams.get("sort_direction")).toBe("desc");
		expect(url.searchParams.has("next_page_token")).toBe(false);
	});

	it("다음 페이지는 커서를 보내고, has_more가 거짓이면 next가 null이다", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				voices: [],
				has_more: false,
				total_count: 31,
				next_page_token: null,
			}),
		);
		const page = await listEl(elAccountInput({ cursor: "tok_2" }));
		expect(calledUrl().searchParams.get("next_page_token")).toBe("tok_2");
		expect(page?.next).toBeNull();
	});

	it("조건을 쿼리로 보낸다: 출처·성우 종류·label 조건·콘텐츠·정렬과 방향", async () => {
		fetchMock.mockResolvedValue(
			json(200, { voices: [], has_more: false, total_count: 0 }),
		);
		await listEl(
			elAccountInput({
				query: {
					search: "rachel",
					voiceType: "community",
					category: "professional",
					gender: "female",
					age: "young",
					language: "en",
					accent: "american",
					useCases: ["narrative_story"],
					sort: "name",
					direction: "asc",
				},
			}),
		);
		expect(queryOfUrl(calledUrl())).toEqual({
			page_size: ["100"],
			include_total_count: ["true"],
			search: ["rachel"],
			voice_type: ["community"],
			category: ["professional"],
			gender: ["female"],
			age: ["young"],
			language: ["en"],
			accent: ["american"],
			use_cases: ["narrative_story"],
			sort: ["name"],
			sort_direction: ["asc"],
		});
	});
});

describe("ElevenLabs 억양 목록", () => {
	it("언어의 억양을 { value, name }으로 돌려준다", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				accents: [
					{ accent: "seoul", language: "ko", code: "ko-seoul", name: "Seoul" },
					{
						accent: "gyeongsang",
						language: "ko",
						code: "ko-gyeongsang",
						name: "Gyeongsang",
					},
				],
			}),
		);
		const accents = await createElevenLabs(KEY).listAccents?.("ko");
		expect(accents).toEqual([
			{ value: "seoul", name: "Seoul" },
			{ value: "gyeongsang", name: "Gyeongsang" },
		]);
		expect(calledUrl().pathname).toBe("/v1/voices/accents");
		expect(calledUrl().searchParams.get("language")).toBe("ko");
	});

	it("조건 값 검사를 통과하지 못하는 억양은 선택지에서 빼고 한 줄 남긴다(고르면 BAD_REQUEST가 되므로)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, {
				accents: [
					{ accent: "seoul", language: "ko", code: "ko-seoul", name: "Seoul" },
					{
						accent: "new york",
						language: "en",
						code: "en-ny",
						name: "New York",
					},
				],
			}),
		);
		expect(await createElevenLabs(KEY).listAccents?.("ko")).toEqual([
			{ value: "seoul", name: "Seoul" },
		]);
		expect(log.mock.calls).toEqual([
			["[voiceList] elevenlabs 억양 1개 제외: accent"],
		]);
	});

	it("억양 조회가 401이면 provider_auth이고 재시도하지 않는다", async () => {
		fetchMock.mockResolvedValue(json(401, {}));
		await expect(
			createElevenLabs(KEY).listAccents?.("ko"),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "elevenlabs", reason: "provider_auth" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9]);
const audio = () =>
	new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
const bodyOf = (i = 0) =>
	JSON.parse(String(fetchMock.mock.calls[i]?.[1]?.body));

describe("ElevenLabs 시험 생성", () => {
	const synth = (settings: Partial<ElevenLabsSettings> = {}, text = "안녕") =>
		createElevenLabs(KEY).synthesize?.({
			provider: "elevenlabs",
			voiceId: "el0001",
			text,
			settings: { ...DEFAULT_SETTINGS.elevenlabs, ...settings },
		});

	it("v4: 말투 태그를 문장 앞에, 안정성·유사도만, MP3 128kbps", async () => {
		fetchMock.mockResolvedValueOnce(audio());
		await expect(synth({ tag: "whispers", style: 0.9 })).resolves.toEqual(MP3);
		expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("error");
		expect(calledUrl().pathname).toBe("/v1/text-to-speech/el0001");
		expect(calledUrl().searchParams.get("output_format")).toBe("mp3_44100_128");
		expect(bodyOf()).toEqual({
			text: "[whispers] 안녕",
			model_id: "eleven_v4",
			voice_settings: { stability: 0.5, similarity_boost: 0.75 },
		});
	});
	it("multilingual v2는 다섯 옵션, v3는 안정성만(받지 않는 옵션은 null로도 보내지 않는다, E3)", async () => {
		fetchMock.mockImplementation(async () => audio());
		await synth({
			model: "eleven_multilingual_v2",
			speed: 1.1,
			speakerBoost: false,
		});
		expect(bodyOf(0).voice_settings).toEqual({
			stability: 0.5,
			similarity_boost: 0.75,
			style: 0,
			speed: 1.1,
			use_speaker_boost: false,
		});
		await synth({ model: "eleven_v3" });
		expect(bodyOf(1).voice_settings).toEqual({ stability: 0.5 });
	});
	it("SDK 재시도를 끈다: 500에도 한 번만, 402 insufficient_credits는 quota, 403 voice_access_denied는 입력 거절", async () => {
		fetchMock.mockResolvedValueOnce(
			json(500, { detail: { code: "internal_error" } }),
		);
		await expect(synth()).rejects.toMatchObject({
			data: { reason: "provider_error" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		fetchMock.mockResolvedValueOnce(
			json(402, { detail: { code: "insufficient_credits" } }),
		);
		await expect(synth()).rejects.toMatchObject({ data: { reason: "quota" } });
		fetchMock.mockResolvedValueOnce(
			json(403, { detail: { code: "voice_access_denied" } }),
		);
		await expect(synth()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "voice_access_denied" },
		});
	});
	it("모델 배율: 쓰는 네 모델만, 배율 × 할인", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, [
				{
					model_id: "eleven_v4",
					model_rates: {
						character_cost_multiplier: 1,
						cost_discount_multiplier: 0.28,
					},
				},
				{
					model_id: "eleven_flash_v2_5",
					model_rates: { character_cost_multiplier: 0.5 },
				},
				{
					model_id: "eleven_english_sts_v2",
					model_rates: { character_cost_multiplier: 1 },
				},
				{ model_id: "eleven_v3" },
			]),
		);
		await expect(createElevenLabs(KEY).listModels?.()).resolves.toEqual([
			{ model: "eleven_v4", multiplier: 0.28 },
			{ model: "eleven_flash_v2_5", multiplier: 0.5 },
		]);
		expect(calledUrl().pathname).toBe("/v1/models");
	});
	it("모양이 다른 모델 항목 하나가 배율 전체를 깨지 않는다(E11)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, [
				{
					model_id: "eleven_v4",
					model_rates: { character_cost_multiplier: 1 },
				},
				{
					model_id: "eleven_v3",
					model_rates: { character_cost_multiplier: 0 },
				},
				"이상한 항목",
			]),
		);
		await expect(createElevenLabs(KEY).listModels?.()).resolves.toEqual([
			{ model: "eleven_v4", multiplier: 1 },
		]);
	});
	it("연결이 끊기면(SDK가 statusCode 없는 오류로 바꿔 던짐) 처리 여부 미확인이고 한 번만 부른다(E1)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("SDK의 리다이렉트 거절은 처리 여부 미확인이고 재전송하지 않는다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockImplementation(async (_url, init) => {
			if (init?.redirect === "error") throw new TypeError("redirect rejected");
			return audio();
		});
		await expect(synth()).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "elevenlabs", reason: "unknown_outcome" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("ElevenLabs 성우 한 명 조회(T7)", () => {
	const raw = {
		voice_id: "el1",
		name: "Jiyoung",
		category: "professional",
		description: "차분함",
		preview_url: "https://storage.googleapis.com/a.mp3",
		labels: { gender: "female", accent: "seoul" },
		verified_languages: [],
	};
	const get = (source: "public" | "account" = "account", id = "el1") =>
		createElevenLabs(KEY).getVoice?.(source, id);

	it("계정 성우 200이면 Voice(account), 경로는 /v1/voices/{id}", async () => {
		fetchMock.mockResolvedValue(json(200, raw));
		expect(await get()).toMatchObject({
			provider: "elevenlabs",
			source: "account",
			voiceId: "el1",
			name: "Jiyoung",
			gender: "female",
		});
		expect(calledUrl().pathname).toBe("/v1/voices/el1");
	});
	it("404면 null", async () => {
		fetchMock.mockResolvedValue(
			json(404, { detail: { code: "voice_not_found" } }),
		);
		expect(await get()).toBeNull();
	});
	it("403은 null이 아니라 키 문제(목록과 같은 매핑)", async () => {
		fetchMock.mockResolvedValue(
			json(403, { detail: { code: "voice_access_denied" } }),
		);
		await expect(get()).rejects.toMatchObject({
			data: { provider: "elevenlabs" },
		});
	});
	it("preferred 언어의 샘플을 행 샘플로 고른다(확인 뒤에도 담을 때의 언어, E14)", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				...raw,
				verified_languages: [
					{
						language: "en",
						preview_url: "https://storage.googleapis.com/en.mp3",
					},
					{
						language: "ko",
						preview_url: "https://storage.googleapis.com/ko.mp3",
					},
				],
			}),
		);
		const voice = await createElevenLabs(KEY).getVoice?.(
			"account",
			"el1",
			"ko",
		);
		expect(voice?.previewUrl).toBe("https://storage.googleapis.com/ko.mp3");
	});
	it("공개 라이브러리 성우는 부르지 않는다(한 명 조회 방법 없음)", async () => {
		await expect(get("public")).rejects.toMatchObject({
			data: { provider: "elevenlabs", reason: "provider_error" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
