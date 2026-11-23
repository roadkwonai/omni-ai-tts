import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { trialError } from "@tts-pilot-app/api/providers/errors";
import { emptyVoice } from "@tts-pilot-app/api/providers/list";
import {
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
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
	ffmpegPath,
	type ServeHook,
	serve,
	spawnCli,
	until,
	workspace,
} from "./harness.js";

// 실제 라우터 + 모의 공급자 + PostgreSQL. 문단 묶음·결합·자동 태그·숫자
const url = process.env.CLI_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
	throw new Error("CLI_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
const OWNER = `cli-paragraph-${crypto.randomUUID()}`;
const tone = (format: "mp3" | "wav") =>
	execFileSync(ffmpegPath(), [
		...["-loglevel", "error", "-f", "lavfi", "-i", "sine=440:duration=1"],
		...["-f", format, "-"],
	]);

describe.skipIf(!url)("문단 실제 라우터 E2E", { timeout: 60_000 }, () => {
	const db = createDb({
		DATABASE_URL: url ?? "postgresql://skip@127.0.0.1:1/skip",
	});
	const sounds = { typecast: tone("mp3"), gemini: tone("wav") };
	const synthesize = vi.fn(
		async (request: TrialRequest) =>
			sounds[request.provider as keyof typeof sounds],
	);
	const suggestActing = vi.fn(async (_prompt: object): Promise<string> => "{}");
	const client = { checkStatus: vi.fn(), synthesize };
	const providers = {
		typecast: client,
		gemini: client,
		openai: { suggestActing },
	};
	let hook: ServeHook | undefined;
	let server: Awaited<ReturnType<typeof serve>>;
	let ws: ReturnType<typeof workspace>;
	let mark = "";
	// biome-ignore lint/suspicious/noExplicitAny: 라우터 클라이언트
	let router: any;

	const run = (...args: string[]) => spawnCli(ws.dir, args).done;
	const json = (result: { out: string }) => {
		expect(result.out.trim().split("\n")).toHaveLength(1);
		return JSON.parse(result.out);
	};
	const voice = (provider: "typecast" | "gemini", voiceId: string) => ({
		provider,
		voiceId,
		settings: DEFAULT_SETTINGS[provider],
	});
	const work = (...texts: string[]) => ({
		defaultVoice: voice("typecast", "tc_0001"),
		gap: 0.5,
		paragraphs: texts.map((text, i) => ({
			id: `p${i}`,
			text: text && `${text} ${mark}`,
			...(i === 1 ? { voice: voice("gemini", "Kore") } : {}),
		})),
	});
	const file = (value: object) => ws.script(JSON.stringify(value), "work.json");
	const batch = (path: string, ...extra: string[]) => [
		...["studio", "batch", "--work", path],
		...["--out-dir", ws.path("out"), "--json", ...extra],
	];

	beforeAll(async () => {
		server = await serve(appRouter, {
			context: (cookie) => ({
				db,
				ownerId: cookie === COOKIE ? OWNER : null,
				providers: cookie === COOKIE ? providers : null,
			}),
			user: (cookie) => (cookie === COOKIE ? { id: OWNER } : null),
			hook: (...args) => hook?.(...args) ?? false,
		});
		const { createRouterClient } = await import("@orpc/server");
		router = createRouterClient(appRouter, {
			context: { db, ownerId: OWNER, providers: null },
		});
		for (const [provider, voiceId] of [
			["typecast", "tc_0001"],
			["gemini", "Kore"],
		] as const)
			await router.savedVoiceSave({
				voice: { ...emptyVoice(provider, "public"), voiceId, name: voiceId },
			});
	});
	beforeEach(() => {
		ws = workspace(server.origin);
		mkdirSync(ws.path("out"));
		// 숫자 교정에 걸리지 않게 글자만 쓴다
		mark = crypto
			.randomUUID()
			.replace(/[\d-]/g, (char) => "klmnopqrst"[Number(char)] ?? "");
		hook = undefined;
		synthesize.mockClear();
		suggestActing.mockReset();
	});
	afterEach(() => ws.remove());
	afterAll(async () => {
		server.close();
		for (const table of ["script", "saved_voice", "trial_generation"])
			await db.$client.query(`delete from ${table} where owner_id = $1`, [
				OWNER,
			]);
		await db.$client.end();
	});

	it("대본 보관함 → 계획 → 묶음 → 결합 → 최근 대본", async () => {
		const script = await router.scriptCreate({
			title: `묶음 ${mark}`,
			channelId: null,
			classificationIds: [],
			work: work("하나", "둘", "", "하나"),
		});
		const from = ["--script-id", script.id];
		const planned = json(await run("studio", "plan", ...from, "--json"));
		expect(planned).toMatchObject({ make: 2, blank: 1, needsConfirm: true });
		expect(synthesize).not.toHaveBeenCalled();
		const unmade = await run(
			...["studio", "join", ...from, "--out", ws.path("a.wav"), "--json"],
		);
		expect(unmade.code).toBe(4);
		const made = await run(
			...["studio", "batch", ...from, "--out-dir", ws.path("out")],
			...["--yes", "--json"],
		);
		expect(made.code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect(readFileSync(ws.path("out/001.mp3")).equals(sounds.typecast)).toBe(
			true,
		);
		expect(readFileSync(ws.path("out/002.wav")).equals(sounds.gemini)).toBe(
			true,
		);
		expect(readFileSync(ws.path("out/004.mp3")).equals(sounds.typecast)).toBe(
			true,
		);
		const recent = await router.scriptList({ kind: "recent" });
		expect(recent.items).toHaveLength(1);
		expect(await router.scriptGet({ id: recent.items[0].id })).toMatchObject({
			workId: script.id,
		});
		const joined = await run(
			...["studio", "join", ...from, "--out", ws.path("a.wav")],
			...["--srt", ws.path("a.srt"), "--json"],
		);
		expect(joined.code).toBe(0);
		// 1초 셋과 쉼 둘(0.46초씩)
		expect(json(joined).seconds).toBeGreaterThan(3.9);
		expect(json(joined).seconds).toBeLessThan(4.2);
		expect(readFileSync(ws.path("a.srt"), "utf8")).toContain(`둘 ${mark}`);
		// 최근 대본으로도 같은 결과를 쓴다
		const again = await run(
			...["studio", "batch", "--script-id", recent.items[0].id, "--json"],
			...["--out-dir", ws.path("out")],
		);
		expect(again.code).toBe(0);
		expect(json(again).made).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(2);
	});

	it("응답 유실 → 같은 명령이 완료를 찾아 이어 가고 문단마다 1회다", async () => {
		const path = file(work("하나", "둘", "셋"));
		let sent = 0;
		hook = (target, _request, response) => {
			if (target.includes("studioCreate")) {
				sent += 1;
				if (sent === 2)
					response.writeHead = (() => {
						response.destroy();
						return response;
					}) as never;
			}
			return false;
		};
		const lost = await run(...batch(path, "--yes"));
		expect(lost.code).toBe(6);
		expect(json(lost)).toMatchObject({
			paragraph: 2,
			requestId: ws.records()[0]?.requestId,
		});
		hook = undefined;
		const rest = await run(...batch(path, "--yes"));
		expect(rest.code).toBe(0);
		expect(json(rest).made).toBe(1);
		expect(synthesize).toHaveBeenCalledTimes(3);
		expect(ws.records()).toEqual([]);
	});

	it("공급자가 답하지 않은 문단은 --retry-unconfirmed로만 다시 만든다", async () => {
		const path = file(work("하나", "둘"));
		synthesize.mockRejectedValueOnce(trialError("typecast", "unknown_outcome"));
		const first = await run(...batch(path, "--yes"));
		expect(first.code).toBe(6);
		expect((await run(...batch(path, "--yes"))).code).toBe(6);
		expect(synthesize).toHaveBeenCalledTimes(1);
		const retried = await run(...batch(path, "--yes", "--retry-unconfirmed"));
		expect(retried.code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(3);
		expect((await run(...batch(path))).code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(3);
	});

	it("두 프로세스를 함께 실행해도 문단마다 1회다", async () => {
		const path = file(work("하나", "둘", "셋"));
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		synthesize.mockImplementationOnce(async () => {
			await held;
			return sounds.typecast;
		});
		const a = spawnCli(ws.dir, batch(path, "--yes"));
		await until(() => synthesize.mock.calls.length === 1, "합성 시작");
		const b = await run(...batch(path, "--yes"));
		expect(b.code).toBe(6);
		open();
		expect((await a.done).code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(3);
	});

	it("숫자 교정과 자동 태그의 작업 JSON을 대본에 저장하고 그대로 만든다", async () => {
		const path = file(work("사과 3개", "둘"));
		const numbers = await run(
			...["numbers", "apply", "--work", path, "--certain"],
			...["--out", ws.path("fixed.json"), "--json"],
		);
		expect(numbers.code).toBe(0);
		suggestActing.mockResolvedValueOnce(
			JSON.stringify({
				paragraphs: [
					{
						index: 0,
						direction: "",
						text: "",
						emotion: "happy",
						intensity: 1,
					},
					{
						index: 1,
						direction: "차분하게",
						text: `둘 ${mark}`,
						emotion: "",
						intensity: null,
					},
				],
			}),
		);
		const tagged = await run(
			...["studio", "autotag", "--work", ws.path("fixed.json"), "--yes"],
			...["--out", ws.path("tagged.json"), "--json"],
		);
		expect(tagged.code).toBe(0);
		expect(suggestActing).toHaveBeenCalledTimes(1);
		expect(json(tagged).changed.length).toBeGreaterThan(0);
		const created = await run(
			...["scripts", "create", "--title", `태그 ${mark}`, "--json"],
			...["--work", ws.path("tagged.json")],
		);
		expect(created.code).toBe(0);
		const made = await run(
			...["studio", "batch", "--script-id", json(created).script.id, "--yes"],
			...["--out-dir", ws.path("out"), "--json"],
		);
		expect(made.code).toBe(0);
		expect(synthesize.mock.calls[0]?.[0].text).toBe(`사과 세 개 ${mark}`);
	});

	it("자동 태그가 실패하면 서버 상한 안에서만 부르고 CLI는 다시 부르지 않는다", async () => {
		suggestActing.mockRejectedValue(trialError("openai", "unknown_outcome"));
		const path = file(work("하나"));
		const result = await run(
			...["studio", "autotag", "--work", path, "--yes"],
			...["--out", ws.path("tagged.json"), "--json"],
		);
		expect(result.code).toBe(6);
		expect(suggestActing).toHaveBeenCalledTimes(3);
	});

	it("남의 대본은 4이고 비소유자는 3이다", async () => {
		const other = `${OWNER}-other`;
		const { createRouterClient } = await import("@orpc/server");
		const theirs = createRouterClient(appRouter, {
			context: { db, ownerId: other, providers: null },
		});
		const script = await theirs.scriptCreate({
			title: `남 ${mark}`,
			channelId: null,
			classificationIds: [],
			work: work("하나") as never,
		});
		expect(
			(await run("studio", "plan", "--script-id", script.id, "--json")).code,
		).toBe(4);
		await db.$client.query("delete from script where owner_id = $1", [other]);
		writeFileSync(
			`${ws.dir}/sessions.json`,
			JSON.stringify({
				current: server.origin,
				sessions: {
					[server.origin]: { cookie: "session=other", version: "v" },
				},
			}),
			{ mode: 0o600 },
		);
		expect((await run(...batch(file(work("하나")), "--yes"))).code).toBe(3);
		expect(synthesize).not.toHaveBeenCalled();
	});
});
