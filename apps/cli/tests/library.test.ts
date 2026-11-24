import { ORPCError } from "@orpc/server";
import { emptyVoice } from "@tts-pilot-app/api/providers/list";
import { appRouter } from "@tts-pilot-app/api/routers/index";
import { createDb } from "@tts-pilot-app/db";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
// 웹 화면이 쓰는 함수와 같은지 대조한다
import {
	CONTENT_TAGS,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	LIBRARY_SORTS,
	type LibraryFilters,
	type LibrarySort,
	MOOD_TAGS,
	sortSaved,
} from "../../web/src/lib/saved-voice-view";
import { COOKIE, serve, spawnCli, studioWorld, workspace } from "./harness.js";

const id = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CH1, CH2, CAT1, CAT2, TYPE1] = [1, 2, 3, 4, 5].map(id) as [
	...[string, string, string, string, string],
];
type Provider = Parameters<typeof emptyVoice>[0];
const item = (
	n: number,
	provider: Provider,
	name: string,
	voice: object = {},
	over: object = {},
) => ({
	id: id(100 + n),
	voice: {
		...emptyVoice(provider, "public"),
		voiceId: `v${n}`,
		name,
		...voice,
	},
	favorite: false,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [] as string[],
	classificationIds: [] as string[],
	useCount: 0,
	lastUsedAt: null as string | null,
	...over,
});
const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}T00:00:00Z`;
// 서버가 준 순서(담은 순서). 다섯 공급자, 아는 값·모르는 값·빈 값, 동률
const ITEMS = [
	item(
		1,
		"typecast",
		"민지",
		{
			englishName: "Minji",
			gender: "female",
			age: "young_adult",
			useCases: ["Documentary", "Game"],
		},
		{ favorite: true, channelIds: [CH1], useCount: 4, lastUsedAt: day(3) },
	),
	item(
		2,
		"elevenlabs",
		"Aria",
		{
			gender: "female",
			age: "middle-aged",
			useCases: ["narrative_story"],
			descriptives: ["calm", "upbeat"],
			usage: { kind: "chars_1y", count: 50 },
		},
		{
			...{ favorite: true, frequent: true, classificationIds: [CAT1, TYPE1] },
			...{ useCount: 9, lastUsedAt: day(1) },
		},
	),
	item(
		3,
		"fish_audio",
		"가온",
		{
			tags: ["male", "young", "narration", "bright", "cheerful"],
			usage: { kind: "tasks", count: 900 },
		},
		{ frequent: true, classificationIds: [CAT2], memo: "광고 Voice" },
	),
	item(
		4,
		"airy",
		"에어리",
		{ gender: "male" },
		{ channelIds: [CH1, CH2], useCount: 4, lastUsedAt: day(9) },
	),
	item(
		5,
		"gemini",
		" Kore",
		{ gender: "neutral", useCases: ["Content & Media"] },
		{ classificationIds: [CAT2, TYPE1] },
	),
	item(6, "elevenlabs", "Zed", {
		gender: "male",
		age: "old",
		descriptives: ["calm"],
		usage: { kind: "chars_1y", count: 80 },
	}),
	item(7, "typecast", "모름", { gender: "male", age: "ageless" }),
	item(8, "fish_audio", "소라", { tags: ["female", "old", "educational"] }),
];
const PRESETS = [
	{ id: id(201), savedVoiceId: id(102) },
	{ id: id(202), savedVoiceId: id(104) },
	{ id: id(203), savedVoiceId: null },
];
const PRESET_VOICES = new Set([id(102), id(104)]);

let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;
beforeEach(async () => {
	w = studioWorld();
	w.voices = ITEMS;
	w.presets = PRESETS;
	w.channels = [
		{ id: CH1, name: "쇼츠" },
		{ id: CH2, name: "롱폼" },
	];
	w.classes = [
		{ id: CAT1, kind: "category", name: "뉴스" },
		{ id: CAT2, kind: "category", name: "광고" },
		{ id: TYPE1, kind: "type", name: "내레이션" },
	];
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});
const run = (...args: string[]) =>
	spawnCli(ws.dir, ["voices", "list", ...args, "--json"]).done;
const body = async (code: number, ...args: string[]) => {
	const result = await run(...args);
	expect([args, result.code, result.out]).toEqual([
		...[args, code, expect.stringMatching(/^[^\n]+\n$/)],
	]);
	return JSON.parse(result.out);
};
const names = async (...args: string[]): Promise<string[]> =>
	(await body(0, ...args)).voices.map(
		({ voice }: { voice: { name: string } }) => voice.name,
	);
const web = (filters: Partial<LibraryFilters>, sort: LibrarySort = "recent") =>
	sortSaved(
		filterSaved(ITEMS, { ...EMPTY_LIBRARY_FILTERS, ...filters }, PRESET_VOICES),
		sort,
	).map(({ voice }) => voice.name);

describe("voices list 조건", { timeout: 60_000 }, () => {
	it.each<[string[], Partial<LibraryFilters>]>([
		[["--q", "aria"], { q: "aria" }],
		[["--q", "MINJI"], { q: "MINJI" }],
		[["--q", "voice"], { q: "voice" }],
		[["--q", "  에어 "], { q: "  에어 " }],
		[["--q", "없음"], { q: "없음" }],
		[["--q", ""], {}],
		[["--preset"], { view: "preset" }],
		[["--favorite"], { view: "favorite" }],
		[["--frequent"], { view: "frequent" }],
		[["--channel-id", CH1], { channel: [CH1] }],
		[["--category-id", CAT1], { category: [CAT1] }],
		[
			["--category-id", CAT1, "--category-id", CAT2.toUpperCase()],
			{ category: [CAT1, CAT2] },
		],
		[["--type-id", TYPE1], { type: [TYPE1] }],
		[
			["--type-id", TYPE1, "--category-id", CAT2],
			{ type: [TYPE1], category: [CAT2] },
		],
		[["--gender", "female"], { gender: "female" }],
		[["--gender", "neutral"], { gender: "neutral" }],
		[["--age", "young"], { age: "young" }],
		[["--age", "middle"], { age: "middle" }],
		[["--age", "old"], { age: "old" }],
		[["--age", "child"], { age: "child" }],
		[["--content", "narration"], { content: ["narration"] }],
		[
			["--content", "education", "--content", "social"],
			{ content: ["education", "social"] },
		],
		[["--mood", "calm"], { mood: ["calm"] }],
		[["--mood", "upbeat"], { mood: ["upbeat"] }],
		[
			["--mood", "calm", "--content", "narration", "--gender", "female"],
			{ mood: ["calm"], content: ["narration"], gender: "female" },
		],
		[
			["--provider", "elevenlabs", "--gender", "male", "--q", "z"],
			{ provider: "elevenlabs", gender: "male", q: "z" },
		],
		[
			["--preset", "--channel-id", CH2, "--gender", "male"],
			{ view: "preset", channel: [CH2], gender: "male" },
		],
	])("%j가 웹과 같다", async (args, filters) => {
		expect(await names(...args)).toEqual(web(filters));
	});

	it("공통 태그의 모든 키가 웹과 같다", async () => {
		for (const [option, axis, rows] of [
			["--content", "content", CONTENT_TAGS],
			["--mood", "mood", MOOD_TAGS.slice(0, 6)],
		] as const)
			for (const { key } of rows)
				expect([key, await names(option, key)]).toEqual([
					key,
					web({ [axis]: [key] }),
				]);
	});

	it.each(LIBRARY_SORTS.map(({ value }) => value))(
		"정렬 %s이 웹과 같다",
		async (sort) => {
			expect(await names("--sort", sort)).toEqual(web({}, sort));
			expect(
				await names("--sort", sort, "--gender", "male", "--q", "e"),
			).toEqual(web({ gender: "male", q: "e" }, sort));
		},
	);

	it("보기 여럿은 모두 맞는 것만 남긴다", async () => {
		expect(await names("--favorite", "--frequent")).toEqual(["Aria"]);
		expect(await names("--favorite", "--preset")).toEqual(["Aria"]);
		expect(await names("--frequent", "--preset")).toEqual(["Aria"]);
		expect(await names("--preset")).toEqual(["Aria", "에어리"]);
		expect(
			await names("--favorite", "--frequent", "--preset", "--q", "민지"),
		).toEqual([]);
	});

	it("필요할 때만 조회하고 쓰지 않는다", async () => {
		const extra = () =>
			w.calls.filter((name) => name !== "savedVoiceList").sort();
		await names("--q", "a", "--gender", "male", "--sort", "name");
		expect(extra()).toEqual([]);
		await names("--preset");
		expect(extra()).toEqual(["presetList"]);
		w.calls.length = 0;
		await names("--type-id", TYPE1, "--category-id", CAT1);
		expect(extra()).toEqual(["classificationList"]);
	});

	it("기존 출력과 JSON 칸은 그대로다", async () => {
		const data = await body(0);
		expect(data).toEqual({
			origin: server.origin,
			voices: ITEMS.map((each) => ({
				...each,
				ref: `${each.voice.provider}:${each.voice.voiceId}`,
			})),
		});
		expect(await names("--channel", "쇼츠")).toEqual(["민지", "에어리"]);
		const text = await spawnCli(ws.dir, [
			...["voices", "list", "--q", "aria", "--sort", "name"],
		]).done;
		expect(text.out.split("\n")[0]).toBe(
			"성우\t공급자:성우 ID\t사용 가능\t즐겨찾기\t자주 사용\t채널 ID\t분류 ID\t사용 횟수\t최근 사용",
		);
		expect(text.out).toContain("Aria\televenlabs:v2");
	});

	it("조건에 맞는 성우가 없으면 담은 성우가 없는 것과 다르게 알린다", async () => {
		const text = async (...args: string[]) => {
			const result = await spawnCli(ws.dir, ["voices", "list", ...args]).done;
			expect(result.code).toBe(0);
			return result.out;
		};
		for (const args of [
			["--q", "없음"],
			["--age", "child"],
			["--provider", "gemini", "--favorite"],
			["--channel-id", id(999)],
			["--frequent", "--preset", "--gender", "neutral"],
		])
			expect([args, await text(...args)]).toEqual([
				...[args, "조건에 맞는 성우가 없습니다.\n"],
			]);
		// JSON은 그대로다
		expect(await body(0, "--q", "없음")).toEqual({
			origin: server.origin,
			voices: [],
		});
		w.voices = [];
		expect(await text("--q", "가")).toBe("조건에 맞는 성우가 없습니다.\n");
		expect(await text()).toBe("담은 성우가 없습니다.\n");
		expect(await text("--sort", "name")).toBe("담은 성우가 없습니다.\n");
	});

	it("모르는 키는 쓸 수 있는 키와 함께 2이고 서버를 부르지 않는다", async () => {
		for (const [option, value, keys] of [
			["--gender", "여성", ["female", "male", "neutral"]],
			["--age", "young_adult", ["child", "teenager", "young", "middle", "old"]],
			["--content", "Game", CONTENT_TAGS.map(({ key }) => key)],
			["--mood", "bright", MOOD_TAGS.map(({ key }) => key)],
			["--sort", "최근", LIBRARY_SORTS.map(({ value }) => value)],
			["--gender", "", ["female"]],
			["--gender", "constructor", ["female"]],
		] as const) {
			const failed = await body(2, option, value);
			expect(failed.code).toBe("INPUT");
			expect(failed.message).toContain(option);
			for (const key of keys) expect(failed.message).toContain(key);
		}
		// 여럿 가운데 하나만 틀려도 2다
		await body(2, "--content", "narration", "--content", "없음");
		await body(2, "--category-id", "글");
		await body(2, "--type-id", "글");
		expect(w.calls).toEqual([]);
	});

	it("없는 분류 ID나 종류가 다른 ID는 4다", async () => {
		for (const args of [
			["--category-id", id(999)],
			["--category-id", TYPE1],
			["--type-id", CAT1],
			["--category-id", CAT1, "--category-id", id(999)],
		])
			expect((await body(4, ...args)).code).toBe("NOT_FOUND");
	});

	it("조회 실패는 기존 분류다", async () => {
		const fail = (code: string) => () => {
			throw new ORPCError(code);
		};
		w.on.presetList = fail("UNAUTHORIZED");
		await body(3, "--preset");
		w.on.classificationList = fail("SERVICE_UNAVAILABLE");
		await body(5, "--category-id", CAT1);
	});

	it("이용 가능 확인에 볼 성우가 없으면(null) 보관함을 그대로 보인다", async () => {
		w.on.savedVoiceCheck = () => null;
		const { code, out } = await spawnCli(ws.dir, ["voices", "check", "--json"])
			.done;
		expect([code, JSON.parse(out)]).toMatchObject([
			0,
			{
				changed: [],
				voices: ITEMS.map(({ id, voice }) => ({
					id,
					ref: `${voice.provider}:${voice.voiceId}`,
				})),
			},
		]);
	});

	it("도움말에 조건과 키를 안내한다", async () => {
		const { out } = await spawnCli(ws.dir, ["--help"]).done;
		for (const text of [
			...["--preset", "--content KEY", "--mood KEY", "--category-id ID"],
			"--sort recent|used|count|name|popular",
		])
			expect(out).toContain(text);
	});
});

// 실제 라우터 + PostgreSQL. 건너뛴 것은 통과가 아니다(TEST.md)
const url = process.env.CLI_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
	throw new Error("CLI_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
const OWNER = `cli-library-${crypto.randomUUID()}`;
describe.skipIf(!url)("voices list 실제 라우터", { timeout: 60_000 }, () => {
	const db = createDb({
		DATABASE_URL: url ?? "postgresql://skip@127.0.0.1:1/skip",
	});
	let real: Awaited<ReturnType<typeof serve>>;
	let space: ReturnType<typeof workspace>;
	// biome-ignore lint/suspicious/noExplicitAny: 라우터 클라이언트
	let router: any;
	const refs = async (...args: string[]) => {
		const result = await spawnCli(space.dir, [
			...["voices", "list", ...args, "--json"],
		]).done;
		expect([args, result.code]).toEqual([args, 0]);
		return JSON.parse(result.out).voices.map(({ ref }: { ref: string }) => ref);
	};
	let categoryId = "";
	let typeId = "";

	beforeAll(async () => {
		real = await serve(appRouter, {
			context: (cookie) => ({
				db,
				ownerId: cookie === COOKIE ? OWNER : null,
				providers: null,
			}),
			user: (cookie) => (cookie === COOKIE ? { id: OWNER } : null),
		});
		space = workspace(real.origin);
		const { createRouterClient } = await import("@orpc/server");
		router = createRouterClient(appRouter, {
			context: { db, ownerId: OWNER, providers: null },
		});
		const make = (provider: Provider, voiceId: string, over: object) => ({
			...emptyVoice(provider, "public"),
			voiceId,
			name: voiceId,
			...over,
		});
		categoryId = (
			await router.classificationCreate({
				...{ kind: "category", name: "뉴스", memo: "" },
			})
		).id;
		typeId = (
			await router.classificationCreate({
				...{ kind: "type", name: "내레이션", memo: "" },
			})
		).id;
		const first = make("elevenlabs", "first", {
			...{ gender: "female", age: "young", descriptives: ["calm"] },
			useCases: ["narrative_story"],
		});
		const second = make("fish_audio", "second", {
			tags: ["male", "old", "podcast", "calm"],
		});
		await router.savedVoiceSave({ voice: first, favorite: true, memo: "메모" });
		await router.savedVoiceSave({ voice: second });
		await router.savedVoiceLinks({
			...{ voice: first, channelIds: [] },
			classificationIds: [categoryId, typeId],
		});
		await router.presetCreate({
			...{ name: "프리셋", channelId: null, channelDefault: false },
			...{ voice: second, provider: "fish_audio" },
			settings: (await import("@tts-pilot-app/api/providers/trial-options"))
				.DEFAULT_SETTINGS.fish_audio,
		});
	});
	afterAll(async () => {
		real.close();
		space.remove();
		for (const table of ["voice_preset", "saved_voice", "classification"])
			await db.$client.query(`delete from ${table} where owner_id = $1`, [
				OWNER,
			]);
		await db.$client.end();
	});

	it("조건과 정렬이 저장된 성우에 걸린다", async () => {
		const FIRST = "elevenlabs:first";
		const SECOND = "fish_audio:second";
		expect(await refs()).toEqual([SECOND, FIRST]);
		expect(await refs("--sort", "name")).toEqual([FIRST, SECOND]);
		expect(await refs("--mood", "calm")).toEqual([SECOND, FIRST]);
		expect(await refs("--content", "podcast")).toEqual([SECOND]);
		expect(await refs("--gender", "female")).toEqual([FIRST]);
		expect(await refs("--age", "old")).toEqual([SECOND]);
		expect(await refs("--preset")).toEqual([SECOND]);
		expect(await refs("--preset", "--favorite")).toEqual([]);
		expect(await refs("--q", "메모")).toEqual([FIRST]);
		expect(await refs("--category-id", categoryId)).toEqual([FIRST]);
		expect(
			await refs("--type-id", typeId, "--category-id", categoryId),
		).toEqual([FIRST]);
		const wrong = await spawnCli(space.dir, [
			...["voices", "list", "--type-id", categoryId, "--json"],
		]).done;
		expect(wrong.code).toBe(4);
	});
});
