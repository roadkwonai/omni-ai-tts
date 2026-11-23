import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRouterClient } from "@orpc/server";
import { emptyVoice } from "@tts-pilot-app/api/providers/list";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
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
	vi,
} from "vitest";
import {
	COOKIE,
	type ServeHook,
	serve,
	spawnCli,
	spawnTty,
	until,
	workspace,
} from "./harness.js";

// 실제 라우터 + PostgreSQL. 건너뛴 것은 통과가 아니다(TEST.md)
const url = process.env.CLI_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
	throw new Error("CLI_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
const OWNER = `cli-manage-${crypto.randomUUID()}`;
const OTHER = `${OWNER}-other`;
const NONE = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!url)("보관함·분류·프리셋·대본", { timeout: 60_000 }, () => {
	const db = createDb({
		DATABASE_URL: url ?? "postgresql://skip@127.0.0.1:1/skip",
	});
	const synthesize = vi.fn();
	const getVoice = vi.fn();
	const provider = {
		checkStatus: vi.fn(),
		synthesize,
		getVoice,
		listVoices: vi.fn(),
	};
	const providers = { typecast: provider, gemini: provider };
	// 웹이 부르는 것과 같은 라우터. CLI가 바꾼 것을 웹 쪽에서 본다
	const web = createRouterClient(appRouter, {
		context: { db, ownerId: OWNER, providers: null } as never,
	});
	let server: Awaited<ReturnType<typeof serve>>;
	let ws: ReturnType<typeof workspace>;
	let ownerId: string | null = OWNER;
	let hook: ServeHook | undefined;
	let calls: string[] = [];

	const run = (...args: string[]) => spawnCli(ws.dir, args).done;
	const ask = async (code: number, ...args: string[]) => {
		const result = await run(...args, "--json");
		expect({ code: result.code, err: result.err, out: result.out }).toEqual({
			code,
			err: result.err,
			out: expect.stringMatching(/^[^\n]+\n$/),
		});
		return { ...JSON.parse(result.out), err: result.err };
	};
	const ok = (...args: string[]) => ask(0, ...args);
	const as = async (id: string | null, run: () => Promise<unknown>) => {
		ownerId = id;
		await run().finally(() => {
			ownerId = OWNER;
		});
	};
	const name = (text: string) => `${text} ${crypto.randomUUID().slice(0, 8)}`;
	const voice = (
		voiceId: string,
		from: "typecast" | "gemini" = "typecast",
	) => ({
		...emptyVoice(from, "public"),
		voiceId,
		name: `성우 ${voiceId}`,
	});
	const saved = async (ref: string) =>
		(await web.savedVoiceList()).find(
			(item) => `${item.voice.provider}:${item.voice.voiceId}` === ref,
		);
	const preset = async (id: string) =>
		(await web.presetList()).find((item) => item.id === id);

	beforeAll(async () => {
		server = await serve(appRouter, {
			context: (cookie) => ({
				db,
				ownerId: cookie === COOKIE ? ownerId : null,
				providers: cookie === COOKIE && ownerId ? providers : null,
			}),
			user: (cookie) => (cookie === COOKIE ? { id: OWNER } : null),
			hook: (path, ...rest) => {
				calls.push(path);
				return hook?.(path, ...rest) ?? false;
			},
		});
	});
	beforeEach(() => {
		ws = workspace(server.origin);
		ownerId = OWNER;
		hook = undefined;
		calls = [];
		const found = [
			voice("tc_one"),
			voice("tc_two"),
			voice("tc_three"),
			voice("kore", "gemini"),
		];
		writeFileSync(
			ws.voicesPath,
			JSON.stringify({
				voices: {
					[server.origin]: found.map((item) => ({
						voice: item,
						savedAt: Date.now(),
					})),
				},
			}),
			{ mode: 0o600 },
		);
	});
	afterEach(async () => {
		ws.remove();
		for (const table of [
			"script",
			"voice_preset",
			"saved_voice",
			"channel",
			"classification",
		])
			await db.$client.query(
				`delete from ${table} where owner_id = any($1::text[])`,
				[[OWNER, OTHER]],
			);
	});
	afterAll(async () => {
		// 이 단계의 명령은 유료 호출이 없다
		expect(synthesize).not.toHaveBeenCalled();
		server.close();
		await db.$client.end();
	});

	describe("성우 보관함", () => {
		it("담고 보고 준 칸만 고치고 뺀다", async () => {
			const ref = "typecast:tc_one";
			const made = await ok(
				...["voices", "save", ref, "--favorite", "--memo", "차분함"],
			);
			expect(made.voice).toMatchObject({
				ref,
				favorite: true,
				frequent: false,
				memo: "차분함",
			});
			expect(await saved(ref)).toMatchObject({ favorite: true });
			await ok("voices", "save", ref, "--frequent");
			expect((await ok("voices", "show", ref)).voice).toMatchObject({
				favorite: true,
				frequent: true,
				memo: "차분함",
			});
			await ok("voices", "save", ref, "--no-favorite", "--memo", "");
			expect(await saved(ref)).toMatchObject({
				favorite: false,
				frequent: true,
				memo: null,
			});
			const human = await run("voices", "show", ref);
			expect(human.out).toContain("성우 tc_one");
			const removed = await ok("voices", "remove", ref, "--yes");
			expect(removed.removed).toBe(made.voice.id);
			expect(await saved(ref)).toBeUndefined();
		});
		it("연결은 준 종류만 통째로 바꾸고 결과에 최종 연결을 보인다", async () => {
			const ref = "typecast:tc_one";
			const a = (await ok("channels", "create", "--name", name("가"))).channel;
			const b = (await ok("channels", "create", "--name", name("나"))).channel;
			const c = (await ok("types", "create", "--name", name("타입"))).type;
			await ok("voices", "save", ref, "--memo", "메모");
			const linked = await ok(
				...["voices", "update", ref, "--channel-id", a.id.toUpperCase()],
				...["--channel-id", b.id, "--classification-id", c.id, "--favorite"],
			);
			expect(linked.voice.channelIds.sort()).toEqual([a.id, b.id].sort());
			expect(linked.voice).toMatchObject({
				classificationIds: [c.id],
				favorite: true,
				memo: "메모",
			});
			const one = await ok("voices", "update", ref, "--channel-id", b.id);
			expect(one.voice).toMatchObject({
				channelIds: [b.id],
				classificationIds: [c.id],
			});
			await ok("voices", "update", ref, "--channel-id", "none");
			expect(await saved(ref)).toMatchObject({
				channelIds: [],
				classificationIds: [c.id],
				favorite: true,
			});
		});
		it("연결이 실패하면 앞의 변경은 남는다고 알린다", async () => {
			const ref = "typecast:tc_one";
			await ok("voices", "save", ref);
			const args = ["voices", "update", ref, "--favorite"];
			const gone = await ask(4, ...args, "--channel-id", NONE);
			expect(gone.err).toContain("남");
			expect(await saved(ref)).toMatchObject({ favorite: true });
			hook = (path, _request, response) => {
				if (!path.includes("savedVoiceLinks")) return false;
				response.statusCode = 500;
				response.end();
				return true;
			};
			expect(
				(await ask(5, ...args, "--memo", "새 메모", "--channel-id", "none"))
					.err,
			).toContain("남");
			expect(await saved(ref)).toMatchObject({ memo: "새 메모" });
		});
		it("담지 않은 성우는 4, 잘못된 옵션은 2이고 바꾸지 않는다", async () => {
			const ref = "typecast:tc_one";
			for (const args of [
				["show", ref],
				["update", ref, "--favorite"],
				["remove", ref, "--yes"],
				["save", "elevenlabs:nobody"],
			])
				await ask(4, "voices", ...args);
			await ok("voices", "save", ref);
			calls = [];
			for (const args of [
				["update", ref],
				["update", ref, "--favorite", "--no-favorite"],
				["save", ref, "--frequent", "--no-frequent"],
				["update", ref, "--channel-id", "none", "--channel-id", NONE],
				["update", ref, "--classification-id", "x"],
				["show"],
				["save", "openai:a"],
			])
				await ask(2, "voices", ...args);
			expect(calls).toEqual([]);
			// 서버의 메모 규칙(200자)
			await ask(2, "voices", "save", ref, "--memo", "가".repeat(201));
			expect(await saved(ref)).toMatchObject({ memo: null, favorite: false });
		});
		it("빼기 전에 쓰는 프리셋과 연결 수를 보인다", async () => {
			const ref = "typecast:tc_one";
			const { channel } = await ok("channels", "create", "--name", name("가"));
			await ok("presets", "create", "--name", name("프"), "--voice", ref);
			await ok("voices", "update", ref, "--channel-id", channel.id);
			const asked = await ask(2, "voices", "remove", ref);
			expect(asked.code).toBe("CONFIRM_REQUIRED");
			expect(asked.err).toContain("성우 tc_one");
			expect(asked.err).toContain("프리셋 1개");
			expect(asked.err).toContain("채널 1개");
			expect(await saved(ref)).toBeDefined();
			expect(calls.some((path) => path.includes("Remove"))).toBe(false);
		});
		it("이용 가능 확인은 바뀐 성우를 보인다", async () => {
			await ok("voices", "save", "typecast:tc_one");
			await ok("voices", "save", "typecast:tc_two");
			await db.$client.query(
				"update saved_voice set checked_at = now() - interval '2 days' where owner_id = $1",
				[OWNER],
			);
			getVoice.mockImplementation(async (_source, voiceId) =>
				voiceId === "tc_one" ? null : voice(voiceId),
			);
			const checked = await ok("voices", "check");
			expect(checked.changed).toMatchObject([
				{ ref: "typecast:tc_one", unavailable: true },
			]);
			expect(checked.voices).toHaveLength(2);
			// 24시간 안에는 다시 부르지 않는다
			getVoice.mockClear();
			expect((await ok("voices", "check")).changed).toEqual([]);
			expect(getVoice).not.toHaveBeenCalled();
		});
	});

	describe("채널·카테고리·타입", () => {
		it("채널을 만들고 준 칸만 고치고 지운다", async () => {
			const first = name("채널");
			const { channel } = await ok(
				...["channels", "create", "--name", first, "--memo", "메모"],
				...["--link", "https://example.com/a"],
			);
			expect(channel).toMatchObject({
				name: first,
				memo: "메모",
				url: "https://example.com/a",
			});
			const renamed = name("새 이름");
			await ok("channels", "update", channel.id, "--name", renamed);
			const list = await ok("channels", "list");
			expect(list.channels).toEqual([
				{ ...channel, name: renamed, voiceCount: 0 },
			]);
			await ok("channels", "update", channel.id, "--memo", "", "--link", "");
			expect(await web.channelList()).toMatchObject([
				{ name: renamed, memo: null, url: null },
			]);
			// 메모·주소가 없는 채널의 이름만 바꾼다(null은 빈 글자로 보낸다)
			await ok("channels", "update", channel.id, "--name", first);
			expect(await web.channelList()).toMatchObject([
				{ name: first, memo: null, url: null },
			]);
			expect((await run("channels", "list")).out).toContain(channel.id);
			await ok("channels", "remove", channel.id, "--yes");
			expect(await web.channelList()).toEqual([]);
			await ask(4, "channels", "remove", channel.id, "--yes");
			await ask(4, "channels", "update", channel.id, "--name", first);
		});
		it.each([
			["categories", "category", "types"],
			["types", "type", "categories"],
		])("%s는 자기 종류만 다룬다", async (group, key, other) => {
			const first = name("분류");
			const made = await ok(
				...[group, "create", "--name", first, "--memo", "메모"],
			);
			const { id } = made[key];
			expect(made[key]).toMatchObject({ kind: key, name: first });
			expect((await ok(group, "list"))[group]).toMatchObject([
				{ id, memo: "메모", voiceCount: 0 },
			]);
			expect((await ok(other, "list"))[other]).toEqual([]);
			// 다른 종류의 명령으로는 4이고 바꾸지 않는다
			calls = [];
			await ask(4, other, "update", id, "--name", "바꿈");
			await ask(4, other, "remove", id, "--yes");
			expect(calls.filter((path) => /Update|Delete/.test(path))).toEqual([]);
			const renamed = name("새 분류");
			const changed = await ok(group, "update", id, "--name", renamed);
			expect(changed[key]).toMatchObject({ name: renamed, memo: "메모" });
			await ok(group, "update", id, "--memo", "");
			await ok(group, "update", id, "--name", first);
			expect(await web.classificationList()).toMatchObject([
				{ id, name: first, memo: null },
			]);
			await ok(group, "remove", id, "--yes");
			expect(await web.classificationList()).toEqual([]);
		});
		it("같은 이름과 규칙에 어긋난 값은 2다", async () => {
			const first = name("이름");
			for (const group of ["channels", "categories", "types"]) {
				await ok(group, "create", "--name", first);
				const second = await ok(group, "create", "--name", name("둘"));
				const { id } =
					second[
						group === "channels"
							? "channel"
							: group === "types"
								? "type"
								: "category"
					];
				const args = [
					[group, "create"],
					[group, "update", id],
				];
				for (const each of args) {
					expect(await ask(2, ...each, "--name", first)).toMatchObject({
						code: "CONFLICT",
						reason: "duplicate_name",
					});
					await ask(2, ...each, "--name", "가".repeat(41));
					await ask(2, ...each, "--name", "이름", "--memo", "가".repeat(201));
					await ask(2, ...each, "--name", " ");
				}
				await ask(2, group, "update", id);
				await ask(2, group, "update", "--name", "이름");
				await ask(2, group, "create");
			}
			await ask(
				2,
				"categories",
				"create",
				"--name",
				"가",
				"--link",
				"https://a.b",
			);
			await ask(
				2,
				"channels",
				"create",
				"--name",
				"가",
				"--link",
				"javascript:1",
			);
		});
		it("지우기 전에 성우와 프리셋 수를 보이고 확인받는다", async () => {
			const first = name("채널");
			const { channel } = await ok("channels", "create", "--name", first);
			const { type } = await ok("types", "create", "--name", name("타입"));
			await ok(
				...["presets", "create", "--name", name("프"), "--voice"],
				...["typecast:tc_one", "--channel-id", channel.id],
			);
			await ok(
				...["voices", "update", "typecast:tc_one", "--channel-id", channel.id],
				...["--classification-id", type.id],
			);
			const asked = await ask(2, "channels", "remove", channel.id);
			expect(asked.code).toBe("CONFIRM_REQUIRED");
			for (const text of [first, "성우 1명", "프리셋 1개"])
				expect(asked.err).toContain(text);
			expect((await ask(2, "types", "remove", type.id)).err).toContain(
				"성우 1명",
			);
			expect(await web.channelList()).toHaveLength(1);
			const no = spawnTty(ws.dir, ["channels", "remove", channel.id]);
			await until(() => no.seen().includes("[y/N]"), "확인 프롬프트");
			no.write("n\r");
			expect((await no.done).code).toBe(2);
			expect(await web.channelList()).toHaveLength(1);
			const yes = spawnTty(ws.dir, ["channels", "remove", channel.id]);
			await until(() => yes.seen().includes("[y/N]"), "확인 프롬프트");
			yes.write("y\r");
			expect((await yes.done).code).toBe(0);
			expect(await web.channelList()).toEqual([]);
		});
	});

	describe("프리셋", () => {
		const create = async (...extra: string[]) =>
			(
				await ok(
					...["presets", "create", "--name", name("프리셋")],
					...["--voice", "typecast:tc_one", ...extra],
				)
			).preset;
		it("만들고 보고 설정을 다시 쓰고 복제하고 지운다", async () => {
			const settings = ws.script('{"tempo":1.5}', "settings.json");
			const made = await create("--settings", settings);
			expect(made).toMatchObject({
				ref: "typecast:tc_one",
				channelId: null,
				channelDefault: false,
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.5 },
			});
			// 프리셋의 성우는 담긴다
			expect(await saved("typecast:tc_one")).toBeDefined();
			const shown = await ok("presets", "show", made.id);
			const again = ws.script(
				JSON.stringify(shown.preset.settings),
				"again.json",
			);
			const over = await ok(
				...["presets", "overwrite", made.id, "--voice", "typecast:tc_two"],
				...["--settings", again],
			);
			expect(over.preset).toMatchObject({
				name: made.name,
				ref: "typecast:tc_two",
				settings: made.settings,
			});
			expect((await run("presets", "show", made.id)).out).toContain("tempo");
			const copy = (await ok("presets", "duplicate", made.id)).preset;
			expect(copy.name).toBe(`${made.name} 사본`);
			const asked = await ask(2, "presets", "remove", made.id);
			expect(asked.err).toContain(made.name);
			await ok("presets", "remove", made.id, "--yes");
			expect((await web.presetList()).map(({ id }) => id)).toEqual([copy.id]);
			await ask(4, "presets", "remove", made.id, "--yes");
		});
		it("준 칸만 고치고 채널이 바뀌면 기본을 끈다", async () => {
			const a = (await ok("channels", "create", "--name", name("가"))).channel;
			const b = (await ok("channels", "create", "--name", name("나"))).channel;
			const { id } = await create("--channel-id", a.id, "--default");
			const update = (...args: string[]) =>
				ok("presets", "update", id, ...args);
			const renamed = name("새 이름");
			await update("--name", renamed);
			expect(await preset(id)).toMatchObject({
				name: renamed,
				channelId: a.id,
				channelDefault: true,
			});
			// 같은 채널이면 기본은 그대로다
			expect((await update("--channel-id", a.id)).err).toBe("");
			expect(await preset(id)).toMatchObject({ channelDefault: true });
			const moved = await update("--channel-id", b.id);
			expect(moved.err).toContain("기본");
			expect(await preset(id)).toMatchObject({
				name: renamed,
				channelId: b.id,
				channelDefault: false,
			});
			await update("--default");
			await update("--channel-id", a.id, "--default");
			expect(await preset(id)).toMatchObject({
				channelId: a.id,
				channelDefault: true,
			});
			await update("--no-default");
			expect(await preset(id)).toMatchObject({
				channelId: a.id,
				channelDefault: false,
			});
			await update("--default");
			await update("--channel-id", "none");
			expect(await preset(id)).toMatchObject({
				name: renamed,
				channelId: null,
				channelDefault: false,
			});
		});
		it("설정·공급자·기본·이름의 잘못은 2이고 바꾸지 않는다", async () => {
			const made = await create();
			const other = await create();
			const args = ["presets", "create", "--voice", "typecast:tc_one"];
			const settings = (text: string) => ws.script(text, "s.json");
			expect(
				(
					await ask(
						2,
						...args,
						"--name",
						"새",
						"--settings",
						settings('{"speed":1}'),
					)
				).message,
			).toContain("speed");
			await ask(
				2,
				...args,
				"--name",
				"새",
				"--settings",
				settings('{"tempo":9}'),
			);
			await ask(2, ...args, "--name", "새", "--settings", settings("{"));
			await ask(2, ...args, "--name", "새", "--default");
			await ask(2, ...args);
			expect(
				await ask(2, ...args, "--name", made.name.toUpperCase()),
			).toMatchObject({ code: "CONFLICT", reason: "duplicate_name" });
			expect(
				await ask(2, "presets", "update", other.id, "--name", made.name),
			).toMatchObject({ reason: "duplicate_name" });
			await ask(2, "presets", "update", made.id);
			await ask(2, "presets", "update", made.id, "--default", "--no-default");
			await ask(2, "presets", "update", made.id, "--default");
			await ask(
				2,
				...["presets", "overwrite", made.id, "--voice", "gemini:kore"],
				...["--settings", settings("{}")],
			);
			await ask(
				4,
				...["presets", "overwrite", NONE, "--voice", "typecast:tc_one"],
				...["--settings", settings("{}")],
			);
			for (const extra of [
				["show", NONE],
				["update", NONE, "--name", "가"],
				["duplicate", NONE],
			])
				await ask(4, "presets", ...extra);
			await ask(4, ...args, "--name", "새", "--channel-id", NONE);
			expect(await web.presetList()).toHaveLength(2);
			expect(await preset(made.id)).toMatchObject({
				name: made.name,
				settings: DEFAULT_SETTINGS.typecast,
			});
		});
	});

	describe("대본", () => {
		const create = async (text: string, ...extra: string[]) =>
			(
				await ok(
					...["scripts", "create", "--title", name("대본")],
					...["--input", ws.script(text), ...extra],
				)
			).script;
		const get = (id: string) => web.scriptGet({ id });
		// 웹이 만드는 작업 모양
		const setup = (voiceId: string) => ({
			provider: "typecast" as const,
			voiceId,
			settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.1 },
		});
		const fullWork = {
			defaultVoice: setup("tc_one"),
			gap: 0.8,
			speakers: [
				{ name: "철수", voice: setup("tc_two") },
				{ name: "영희", voice: null },
			],
			paragraphs: [
				{ id: "a", text: "" },
				{ id: "b", text: "  첫 문단 3개\n", voice: setup("tc_two"), gap: 0 },
				{ id: "c", text: "둘째\n\n빈 줄을 품음", speaker: "철수" },
				{ id: "d", text: " ", gap: 2 },
				{
					id: "e",
					text: "네",
					fixes: {
						text: "네",
						decisions: [
							{
								start: 0,
								end: 1,
								original: "네",
								choice: "manual" as const,
								reading: "넷",
							},
						],
					},
				},
				{ id: "f", text: "네" },
			],
		};

		it("글로 만들고 목록에서 찾고 글과 JSON으로 받는다", async () => {
			const { channel } = await ok(
				"channels",
				"create",
				"--name",
				name("채널"),
			);
			const { category } = await ok(
				"categories",
				"create",
				"--name",
				name("카"),
			);
			const { type } = await ok("types", "create", "--name", name("타"));
			const made = await create(
				"첫 문단\r\n이어짐\r\n\r\n둘째 문단\n",
				...["--channel-id", channel.id, "--classification-id", category.id],
				...["--classification-id", type.id, "--voice", "typecast:tc_one"],
			);
			expect(made).toMatchObject({ version: 1 });
			const script = await get(made.id);
			expect(script).toMatchObject({
				channelId: channel.id,
				work: {
					defaultVoice: {
						provider: "typecast",
						voiceId: "tc_one",
						settings: DEFAULT_SETTINGS.typecast,
					},
					gap: 0.5,
					paragraphs: [{ text: "첫 문단\n이어짐" }, { text: "둘째 문단" }],
				},
			});
			await create("다른 글");
			const list = async (...args: string[]) =>
				(await ok("scripts", "list", ...args)).scripts.map(
					(item: { id: string }) => item.id,
				);
			expect(await list()).toHaveLength(2);
			for (const args of [
				["--q", "둘째"],
				["--channel-id", channel.id],
				["--category-id", category.id, "--type-id", type.id],
			])
				expect(await list(...args)).toEqual([made.id]);
			expect(await list("--category-id", type.id, "--type-id", NONE)).toEqual(
				[],
			);
			expect(await list("--channel-id", "none")).not.toContain(made.id);
			const shown = await run("scripts", "show", made.id);
			expect(shown.out).toContain("첫 문단\n이어짐");
			const text = await ok(
				"scripts",
				"show",
				made.id,
				"--out",
				ws.path("a.txt"),
			);
			expect(text.script.work).toBeUndefined();
			expect(readFileSync(ws.path("a.txt"), "utf8")).toBe(
				"첫 문단\n이어짐\n\n둘째 문단\n",
			);
			await ok("scripts", "show", made.id, "--out", ws.path("a.json"));
			expect(JSON.parse(readFileSync(ws.path("a.json"), "utf8"))).toEqual(
				script.work,
			);
			// 있는 파일·확장자·심볼릭 링크 규칙은 음성 파일과 같다
			await ask(2, "scripts", "show", made.id, "--out", ws.path("a.txt"));
			await ask(2, "scripts", "show", made.id, "--out", ws.path("a.mp3"));
			await ask(2, "scripts", "show", made.id, "--overwrite");
			await ok(
				...["scripts", "show", made.id, "--out", ws.path("a.txt")],
				"--overwrite",
			);
			expect((await run("scripts", "list")).out).toContain(made.id);
		});
		it("목록의 다음 쪽과 최근 대본을 본다", async () => {
			const work = {
				defaultVoice: null,
				gap: 0.5,
				paragraphs: [{ id: "a", text: "가" }],
			};
			for (let i = 0; i < 31; i += 1)
				await web.scriptCreate({
					title: `대본 ${i}`,
					channelId: null,
					classificationIds: [],
					work,
				});
			const recent = await web.scriptRecordRecent({
				workId: crypto.randomUUID(),
				channelId: null,
				work,
			});
			const first = await ok("scripts", "list");
			expect(first.scripts).toHaveLength(30);
			const human = await run("scripts", "list");
			const [, cursor = ""] = /--cursor '([^']+)'/.exec(human.out) ?? [];
			expect(JSON.parse(cursor)).toEqual(first.next);
			const second = await ok("scripts", "list", "--cursor", cursor);
			expect(second.scripts).toMatchObject([{ title: "대본 0" }]);
			expect(second.next).toBeNull();
			const list = await ok("scripts", "list", "--recent");
			expect(list.scripts).toMatchObject([{ id: recent.id, kind: "recent" }]);
			for (const args of [
				["--recent", "--q", "가"],
				["--cursor", "{"],
				["--cursor", "{}"],
				["--category-id", "none"],
			])
				await ask(2, "scripts", "list", ...args);
			// 최근 대본은 저장·고치기 대상이 아니고 지울 수 있다
			await ask(
				4,
				...[
					"scripts",
					"save",
					recent.id,
					"--force",
					"--input",
					ws.script("가"),
				],
			);
			await ok("scripts", "remove", recent.id, "--yes");
		});
		it("작업 JSON으로 만들고 글로 내보냈다 그대로 저장해도 작업이 같다", async () => {
			const { script } = await ok(
				...["scripts", "create", "--title", name("작업"), "--work"],
				// 웹 작업의 연결 칸은 서버가 버린다
				ws.script(
					JSON.stringify({ ...fullWork, id: "w", linked: {} }),
					"w.json",
				),
			);
			expect((await get(script.id)).work).toEqual(fullWork);
			await ok("scripts", "show", script.id, "--out", ws.path("a.txt"));
			const kept = await ok(
				...["scripts", "save", script.id, "--version", "1"],
				...["--input", ws.path("a.txt")],
			);
			expect(kept).toMatchObject({ script: { version: 2 }, lost: 0 });
			expect((await get(script.id)).work).toEqual(fullWork);
			await ok("scripts", "show", script.id, "--out", ws.path("a.json"));
			await ok(
				...["scripts", "save", script.id, "--version", "2"],
				...["--work", ws.path("a.json")],
			);
			expect(await get(script.id)).toMatchObject({
				version: 3,
				work: fullWork,
			});
		});
		it("설정이 있는 문단을 잃으면 확인받고, 채널은 그대로다", async () => {
			const { channel } = await ok(
				"channels",
				"create",
				"--name",
				name("채널"),
			);
			const { script } = await ok(
				...["scripts", "create", "--title", name("작업"), "--work"],
				ws.script(JSON.stringify(fullWork), "w.json"),
				...["--channel-id", channel.id],
			);
			const args = ["scripts", "save", script.id, "--version", "1", "--input"];
			const file = ws.script("첫 문단 3개\n\n새 글\n\n네\n\n네", "new.txt");
			const asked = await ask(2, ...args, file);
			expect(asked.code).toBe("CONFIRM_REQUIRED");
			// 둘째 문단과 그 옆의 쉼이 있는 빈 문단
			expect(asked.err).toContain("2개");
			expect((await get(script.id)).version).toBe(1);
			const no = spawnTty(ws.dir, [...args, file]);
			await until(() => no.seen().includes("[y/N]"), "확인 프롬프트");
			no.write("n\r");
			expect((await no.done).code).toBe(2);
			expect((await get(script.id)).version).toBe(1);
			expect(await ok(...args, file, "--yes")).toMatchObject({ lost: 2 });
			const after = await get(script.id);
			expect(after).toMatchObject({ version: 2, channelId: channel.id });
			expect(after.work).toEqual({
				...fullWork,
				paragraphs: [
					fullWork.paragraphs[0],
					fullWork.paragraphs[1],
					{ id: expect.any(String), text: "새 글" },
					fullWork.paragraphs[4],
					fullWork.paragraphs[5],
				],
			});
		});
		it("판이 다르면 2(stale)이고 --force만 덮어쓴다", async () => {
			const { id } = await create("처음");
			const args = [
				"scripts",
				"save",
				id,
				"--input",
				ws.script("CLI", "c.txt"),
			];
			const { work } = await get(id);
			await web.scriptSave({
				id,
				version: 1,
				channelId: null,
				work: { ...work, paragraphs: [{ id: "w", text: "웹", gap: 1 }] },
			});
			// 손실 확인보다 판 충돌을 먼저 알린다
			expect(await ask(2, ...args, "--version", "1")).toMatchObject({
				code: "CONFLICT",
				reason: "stale",
			});
			// 앞선 판 번호와 글·작업 JSON 모두 서버를 부르지 않고 끝낸다
			const json = ws.script(JSON.stringify(work), "stale.json");
			for (const source of [
				["--input", ws.script("CLI", "c.txt")],
				["--work", json],
			])
				for (const version of ["1", "3"])
					expect(
						await ask(
							2,
							...["scripts", "save", id, "--version", version, "--yes"],
							...source,
						),
					).toMatchObject({ code: "CONFLICT", reason: "stale" });
			expect(calls.filter((path) => path.includes("scriptSave"))).toEqual([]);
			expect((await get(id)).work.paragraphs).toMatchObject([{ text: "웹" }]);
			expect((await ask(2, ...args, "--force")).code).toBe("CONFIRM_REQUIRED");
			await ok(...args, "--force", "--yes");
			expect(await get(id)).toMatchObject({
				version: 3,
				work: { paragraphs: [{ text: "CLI" }] },
			});
			await ok(...args, "--version", "3");
			const file = ws.script(JSON.stringify(work), "w.json");
			await ask(2, "scripts", "save", id, "--version", "3", "--work", file);
			await ok("scripts", "save", id, "--force", "--work", file);
			expect((await get(id)).work).toEqual(work);
		});
		it.each([
			["--version", 2, "웹"],
			["--force", 0, "CLI"],
		])("확인하는 사이 웹이 저장하면 %s은 %i이다", async (mode, code, text) => {
			const { id } = await create("처음");
			const save = async (value: string) =>
				web.scriptSave({
					id,
					version: 1,
					force: true,
					channelId: null,
					work: {
						...(await get(id)).work,
						paragraphs: [{ id: "w", text: value, gap: 1 }],
					},
				});
			await save("설정 있음");
			const tty = spawnTty(ws.dir, [
				...["scripts", "save", id, "--input", ws.script("CLI", "c.txt")],
				...(mode === "--force" ? [mode] : [mode, "2"]),
			]);
			await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
			await save("웹");
			tty.write("y\r");
			expect((await tty.done).code).toBe(code);
			expect((await get(id)).work.paragraphs).toMatchObject([{ text }]);
		});
		it("--input -이면 터미널이어도 손실 확인에 --yes가 필요하다", async () => {
			const { script } = await ok(
				...["scripts", "create", "--title", name("작업"), "--work"],
				ws.script(JSON.stringify(fullWork), "w.json"),
			);
			const tty = spawnTty(ws.dir, [
				...["scripts", "save", script.id, "--version", "1", "--input", "-"],
			]);
			tty.write("새 글\n\u0004");
			const result = await tty.done;
			expect(result.code).toBe(2);
			expect(result.out).toContain("--yes");
			expect(result.out).not.toContain("[y/N]");
			expect((await get(script.id)).version).toBe(1);
		});
		it("제목·채널·분류만 고치고 복제하고 지운다", async () => {
			const { channel } = await ok(
				"channels",
				"create",
				"--name",
				name("채널"),
			);
			const { type } = await ok("types", "create", "--name", name("타"));
			const made = await create("글", "--classification-id", type.id);
			const other = await create("글 둘");
			const update = (...args: string[]) =>
				ok("scripts", "update", made.id, ...args);
			expect((await update("--channel-id", channel.id)).script).toMatchObject({
				title: made.title,
				channelId: channel.id,
				classificationIds: [type.id],
				version: 1,
			});
			const title = name("새 제목");
			await update("--title", title, "--classification-id", "none");
			expect(await get(made.id)).toMatchObject({
				title,
				channelId: channel.id,
				classificationIds: [],
			});
			await update("--channel-id", "none");
			expect((await get(made.id)).channelId).toBeNull();
			expect(
				await ask(2, "scripts", "update", made.id, "--title", other.title),
			).toMatchObject({ code: "CONFLICT", reason: "duplicate_name" });
			await ask(2, "scripts", "update", made.id);
			await ask(2, "scripts", "update", made.id, "--title", "가".repeat(101));
			await ask(4, "scripts", "update", made.id, "--channel-id", NONE);
			const copy = (await ok("scripts", "duplicate", made.id)).script;
			expect(copy.title).toBe(`${title} 사본`);
			expect((await ask(2, "scripts", "remove", made.id)).err).toContain(title);
			expect(await get(made.id)).toBeDefined();
			await ok("scripts", "remove", made.id, "--yes");
			await ask(4, "scripts", "remove", made.id, "--yes");
			for (const args of [
				["show", NONE],
				["update", NONE, "--title", "가"],
				["duplicate", NONE],
				["save", NONE, "--force", "--input", ws.script("가")],
			])
				await ask(4, "scripts", ...args);
		});
		it("글·작업 상한과 잘못된 입력은 2다", async () => {
			const args = ["scripts", "create", "--title", name("상한")];
			const file = (text: string) => ws.script(text, "limit.txt");
			for (const text of [
				"",
				" \n\n ",
				"가".repeat(10_001),
				Array.from({ length: 201 }, (_, i) => `${i}`).join("\n\n"),
				"가\u0000나",
			])
				await ask(2, ...args, "--input", file(text));
			for (const text of ["{", "null", "[]", "{}"])
				await ask(2, ...args, "--work", file(text));
			await ask(2, ...args);
			await ask(2, ...args, "--input", file("가"), "--work", file("{}"));
			await ask(2, ...args, "--work", file("{}"), "--voice", "typecast:tc_one");
			await ask(2, ...args, "--work", ws.path("none.json"));
			const save = ["scripts", "save", NONE];
			for (const extra of [
				["--input", file("가")],
				["--input", file("가"), "--version", "1", "--force"],
				["--input", file("가"), "--version", "0"],
				["--input", file("가"), "--version", "1.5"],
				["--version", "1"],
			])
				await ask(2, ...save, ...extra);
			await ask(
				4,
				...args,
				"--input",
				file("가"),
				"--voice",
				"elevenlabs:nobody",
			);
			expect((await web.scriptList({ kind: "saved" })).items).toEqual([]);
			await ok(...args, "--input", file("가".repeat(10_000)));
			// 1MiB를 넘는 작업 JSON은 받고 2MiB를 넘으면 서버가 거절한다
			const big = (count: number) =>
				JSON.stringify({
					defaultVoice: null,
					gap: 0.5,
					paragraphs: Array.from({ length: count }, (_, i) => ({
						id: `p${i}`,
						text: "가".repeat(9_000),
					})),
				});
			const made = await ok(
				...["scripts", "create", "--title", name("큰"), "--work"],
				file(big(50)),
			);
			await ok(
				...["scripts", "show", made.script.id, "--out", ws.path("big.json")],
			);
			expect(readFileSync(ws.path("big.json")).byteLength).toBeGreaterThan(
				1024 * 1024,
			);
			// 1MiB를 넘는 글도 내보낸 것을 그대로 저장한다
			const { id } = made.script;
			const before = (await get(id)).work;
			await ok("scripts", "show", id, "--out", ws.path("big.txt"));
			await ok(
				...["scripts", "save", id, "--version", "1"],
				...["--input", ws.path("big.txt")],
			);
			expect((await get(id)).work).toEqual(before);
			for (const count of [90, 150])
				expect(
					await ask(
						2,
						...["scripts", "create", "--title", name("넘침")],
						...["--work", file(big(count))],
					),
				).toMatchObject({ code: "INPUT" });
		});
		it("stdin 글로 만들고 사람용 출력에서 제어 문자를 지운다", async () => {
			const title = name("표준");
			const made = await spawnCli(
				ws.dir,
				["scripts", "create", "--title", title, "--input", "-", "--json"],
				"가\u001b[31m나‮\n\n다",
			).done;
			const { script } = JSON.parse(made.out);
			const shown = await run("scripts", "show", script.id);
			expect(shown.out).toContain("가[31m나\n\n다");
			const json = await run("scripts", "show", script.id, "--json");
			expect(json.out).not.toContain("‮");
			expect(JSON.parse(json.out).script.work.paragraphs[0].text).toContain("‮");
		});
	});

	it("변경 요청을 보낸 뒤 Ctrl+C는 6이고 조회 중에는 2다", async () => {
		const hold = async (procedure: string, ...args: string[]) => {
			calls = [];
			hook = (path) => path.includes(procedure);
			const started = spawnCli(ws.dir, [...args, "--json"]);
			const sent = () => calls.some((path) => path.includes(procedure));
			await until(sent, procedure);
			started.child.kill("SIGINT");
			const result = await started.done;
			return { code: result.code, ...{ body: JSON.parse(result.out) } };
		};
		const made = ["channels", "create", "--name", name("채널")];
		const cut = await hold("channelCreate", ...made);
		expect(cut).toMatchObject({ code: 6, body: { code: "UNCONFIRMED" } });
		expect(cut.body.requestId).toBeUndefined();
		for (const [procedure, ...args] of [
			["savedVoiceSave", "voices", "save", "typecast:tc_one"],
			["trialDelete", "trial", "remove", NONE, "--yes"],
			["voiceListRefresh", "casting", "refresh", "--provider", "gemini"],
			["scriptDuplicate", "scripts", "duplicate", NONE],
			["presetDuplicate", "presets", "duplicate", NONE],
		] as const)
			expect((await hold(procedure, ...args)).code).toBe(6);
		expect(await hold("channelList", "channels", "list")).toMatchObject({
			code: 2,
			body: { code: "CANCELED" },
		});
	});

	it("남의 항목은 4이고 그대로다. 비소유자는 3이다", async () => {
		const ref = "typecast:tc_one";
		const { channel } = await ok("channels", "create", "--name", name("채널"));
		const { category } = await ok("categories", "create", "--name", name("카"));
		const { type } = await ok("types", "create", "--name", name("타"));
		const { preset: mine } = await ok(
			...["presets", "create", "--name", name("프"), "--voice", ref],
		);
		const { script } = await ok(
			...["scripts", "create", "--title", name("대본")],
			...["--input", ws.script("글")],
		);
		const state = async () => [
			await web.savedVoiceList(),
			await web.channelList(),
			await web.classificationList(),
			await web.presetList(),
			await web.scriptGet({ id: script.id }),
		];
		const before = await state();
		const settings = ws.script("{}", "s.json");
		const text = ws.script("바꿈", "t.txt");
		const others = [
			["channels", "update", channel.id, "--name", "바꿈"],
			["channels", "remove", channel.id, "--yes"],
			["categories", "update", category.id, "--name", "바꿈"],
			["categories", "remove", category.id, "--yes"],
			["types", "update", type.id, "--name", "바꿈"],
			["types", "remove", type.id, "--yes"],
			["presets", "show", mine.id],
			["presets", "update", mine.id, "--name", "바꿈"],
			["presets", "overwrite", mine.id, "--voice", ref, "--settings", settings],
			["presets", "duplicate", mine.id],
			["presets", "remove", mine.id, "--yes"],
			["scripts", "show", script.id],
			["scripts", "show", script.id, "--out", ws.path("other.txt")],
			["scripts", "save", script.id, "--force", "--input", text],
			["scripts", "update", script.id, "--title", "바꿈"],
			["scripts", "duplicate", script.id],
			["scripts", "remove", script.id, "--yes"],
			[
				"scripts",
				"create",
				"--title",
				"새",
				"--input",
				text,
				"--channel-id",
				channel.id,
			],
			[
				"presets",
				"create",
				"--name",
				"새",
				"--voice",
				ref,
				"--channel-id",
				channel.id,
			],
			["voices", "show", ref],
			["voices", "update", ref, "--favorite"],
			["voices", "remove", ref, "--yes"],
		];
		await as(OTHER, async () => {
			for (const args of others) await ask(4, ...args);
			for (const group of [
				"channels",
				"categories",
				"types",
				"presets",
				"scripts",
			])
				expect((await ok(group, "list"))[group]).toEqual([]);
		});
		await as(null, async () => {
			for (const args of [
				["channels", "list"],
				["scripts", "remove", script.id, "--yes"],
				["presets", "show", mine.id],
				["voices", "check"],
			])
				await ask(3, ...args);
		});
		expect(await state()).toEqual(before);
		expect(existsSync(ws.path("other.txt"))).toBe(false);
	});
});
