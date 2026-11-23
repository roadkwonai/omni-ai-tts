import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DRAMA_SAMPLE_RATE, wavOf } from "@tts-pilot-app/api/drama-script";
import { trialError } from "@tts-pilot-app/api/providers/errors";
import { emptyVoice } from "@tts-pilot-app/api/providers/list";
import type { TrialRequest } from "@tts-pilot-app/api/providers/trial-options";
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
	bytesOf,
	COOKIE,
	ffmpegPath,
	type ServeHook,
	serve,
	spawnCli,
	spawnTty,
	until,
	workspace,
} from "./harness.js";

// 실제 라우터 + 모의 공급자 + PostgreSQL. 드라마 장면·읽기·자동 태그
const url = process.env.CLI_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
	throw new Error("CLI_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
const OWNER = `cli-drama-${crypto.randomUUID()}`;
const OTHER = `${OWNER}-other`;
const tone = (format: "mp3" | "wav") =>
	execFileSync(ffmpegPath(), [
		...["-loglevel", "error", "-f", "lavfi", "-i", "sine=440:duration=1"],
		...["-f", format, "-"],
	]);

describe.skipIf(!url)("드라마 실제 라우터 E2E", { timeout: 60_000 }, () => {
	const db = createDb({
		DATABASE_URL: url ?? "postgresql://skip@127.0.0.1:1/skip",
	});
	const pcm = bytesOf(DRAMA_SAMPLE_RATE * 2);
	const wav = Buffer.from(wavOf(pcm));
	type Segment = { text: string; start: number; end: number };
	let segments: Segment[] | null = null;
	const synthesizeScene = vi.fn(async (_request: object) => ({
		pcm: new Uint8Array(pcm),
		segments,
	}));
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
		fish_audio: { checkStatus: vi.fn(), synthesizeScene },
		openai: { suggestActing },
	};
	let hook: ServeHook | undefined;
	let owner = OWNER;
	let server: Awaited<ReturnType<typeof serve>>;
	let ws: ReturnType<typeof workspace>;
	let mark = "";
	// biome-ignore lint/suspicious/noExplicitAny: 라우터 클라이언트
	let routerAs: (ownerId: string) => any;

	const run = (...args: string[]) => spawnCli(ws.dir, args).done;
	const json = (result: { out: string }) => {
		expect(result.out.trim().split("\n")).toHaveLength(1);
		return JSON.parse(result.out);
	};
	const scene = () => ({
		version: 1,
		sceneName: ` 장면 ${mark} `,
		speakers: [
			{ name: "가", voice: "fish_audio:fishone" },
			{ name: "쓰지 않음" },
			{ name: "나", voice: "fish_audio:fishtwo" },
		],
		lines: [
			{ speaker: 2, direction: "", text: `하나 ${mark}` },
			{ speaker: 0, direction: "", text: "둘" },
		],
		model: "s2.1-pro",
	});
	const file = (value: object, name = "scene.json") =>
		ws.script(JSON.stringify(value), name);
	const gen = (...extra: string[]) => [
		...["drama", "generate", "--input", file(scene())],
		...["--out", ws.path("out.wav"), "--json", ...extra],
	];
	const loseCreate = () => {
		hook = (path, _request, response) => {
			if (path.includes("dramaCreate"))
				response.writeHead = (() => {
					response.destroy();
					return response;
				}) as never;
			return false;
		};
	};

	beforeAll(async () => {
		server = await serve(appRouter, {
			context: (cookie) => ({
				db,
				ownerId: cookie === COOKIE ? owner : null,
				providers: cookie === COOKIE ? providers : null,
			}),
			user: (cookie) => (cookie === COOKIE ? { id: owner } : null),
			hook: (...args) => hook?.(...args) ?? false,
		});
		const { createRouterClient } = await import("@orpc/server");
		routerAs = (ownerId) =>
			createRouterClient(appRouter, {
				context: { db, ownerId, providers: null },
			});
		for (const ownerId of [OWNER, OTHER])
			for (const [provider, voiceId] of [
				["fish_audio", "fishone"],
				["fish_audio", "fishtwo"],
				["typecast", "tc_0001"],
				["gemini", "Kore"],
			] as const)
				await routerAs(ownerId).savedVoiceSave({
					voice: { ...emptyVoice(provider, "public"), voiceId, name: voiceId },
				});
	});
	beforeEach(() => {
		ws = workspace(server.origin);
		mkdirSync(ws.path("out"));
		mark = crypto
			.randomUUID()
			.replace(/[\d-]/g, (char) => "klmnopqrst"[Number(char)] ?? "");
		hook = undefined;
		owner = OWNER;
		segments = null;
		synthesizeScene.mockClear();
		synthesize.mockClear();
		suggestActing.mockReset();
	});
	afterEach(() => ws.remove());
	afterAll(async () => {
		server.close();
		for (const ownerId of [OWNER, OTHER])
			for (const table of ["saved_voice", "trial_generation"])
				await db.$client.query(`delete from ${table} where owner_id = $1`, [
					ownerId,
				]);
		await db.$client.end();
	});

	it("장면 → 목록 → 저장 재사용 → 받기 → 나누기 → 지우기", async () => {
		segments = [
			{ text: `하나 ${mark}`, start: 0.1, end: 0.4 },
			{ text: "둘", start: 0.5, end: 0.9 },
		];
		const made = await run(...gen("--yes"));
		expect(made.code).toBe(0);
		expect(readFileSync(ws.path("out.wav")).equals(wav)).toBe(true);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		const { id } = json(made).result;
		const [take] = json(await run("drama", "list", "--json")).takes;
		expect(take).toMatchObject({ id, split: true });
		// 쓰지 않는 화자는 빠지고 이름은 정리된다
		expect(take.request).toMatchObject({
			sceneName: `장면 ${mark}`,
			speakers: [{ name: "가" }, { name: "나" }],
		});
		const again = await run(...gen("--overwrite"));
		expect(json(again)).toMatchObject({ source: "saved", result: { id } });
		const down = await run(
			...["drama", "download", id, "--out", ws.path("d.wav"), "--json"],
		);
		expect(down.code).toBe(0);
		expect(readFileSync(ws.path("d.wav")).equals(wav)).toBe(true);
		const cut = await run(
			...["drama", "split", id, "--out-dir", ws.path("out"), "--json"],
		);
		expect(cut.code).toBe(0);
		expect(readdirSync(ws.path("out")).sort()).toEqual([
			"001-나.wav",
			"002-가.wav",
		]);
		const parts = ["001-나.wav", "002-가.wav"].map((name) =>
			readFileSync(ws.path(`out/${name}`)),
		);
		expect(Buffer.concat(parts.map((part) => part.subarray(44)))).toEqual(
			wav.subarray(44),
		);
		expect((await run("drama", "remove", id, "--yes", "--json")).code).toBe(0);
		expect(
			(await run("drama", "download", id, "--out", ws.path("e.wav"))).code,
		).toBe(4);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
	});

	it("구간이 없는 테이크는 나눌 수 없고 --new는 새 테이크다", async () => {
		const first = json(await run(...gen("--yes"))).result.id;
		expect(
			(await run("drama", "split", first, "--out-dir", ws.path("out"))).code,
		).toBe(4);
		const second = json(await run(...gen("--yes", "--new", "--overwrite")))
			.result.id;
		expect(second).not.toBe(first);
		expect(synthesizeScene).toHaveBeenCalledTimes(2);
	});

	it("최근 20개 밖의 테이크도 저장 결과로 찾는다", async () => {
		const { id } = json(await run(...gen("--yes"))).result;
		await db.$client.query(
			"update trial_generation set created_at = now() - interval '1 day' where id = $1",
			[id],
		);
		for (let i = 0; i < 20; i += 1)
			await db.$client.query(
				`insert into trial_generation (owner_id, request_id, kind, provider, voice_id, model, settings, text, script, status, combo_key, usage_unit, usage_amount, expires_at)
				 select owner_id, gen_random_uuid(), kind, provider, voice_id, model, settings, text, script, 'unknown', $2, usage_unit, usage_amount, expires_at from trial_generation where id = $1`,
				[id, `밀어내기 ${i} ${mark}`],
			);
		const list = json(await run("drama", "list", "--json")).takes;
		expect(list.map((take: { id: string }) => take.id)).not.toContain(id);
		const again = await run(...gen("--overwrite"));
		expect(json(again).result.id).toBe(id);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		await db.$client.query(
			"delete from trial_generation where owner_id = $1 and status = 'unknown'",
			[OWNER],
		);
	});

	it("응답 유실 → resume이 같은 요청을 받고 같은 명령은 다시 만들지 않는다", async () => {
		loseCreate();
		const lost = await run(...gen("--yes"));
		expect(lost.code).toBe(6);
		const { requestId } = json(lost);
		hook = undefined;
		const resumed = await run(
			...["drama", "resume", requestId, "--out", ws.path("r.wav"), "--json"],
		);
		expect(resumed.code).toBe(0);
		expect(readFileSync(ws.path("r.wav")).equals(wav)).toBe(true);
		expect(ws.records()).toEqual([]);
		expect((await run(...gen())).code).toBe(0);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
	});

	it("공급자가 답하지 않으면 6이고 --new 없이는 다시 만들지 않는다", async () => {
		synthesizeScene.mockRejectedValueOnce(
			trialError("fish_audio", "unknown_outcome"),
		);
		expect((await run(...gen("--yes"))).code).toBe(6);
		expect((await run(...gen("--yes"))).code).toBe(6);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		synthesizeScene.mockRejectedValueOnce(trialError("fish_audio", "quota"));
		const refused = await run(...gen("--yes", "--new"));
		expect(refused.code).toBe(5);
		expect(json(refused).reason).toBe("quota");
		expect((await run(...gen("--yes", "--new"))).code).toBe(0);
		expect(synthesizeScene).toHaveBeenCalledTimes(3);
	});

	it("확인 프롬프트 둘에서 합성은 1회다", async () => {
		const a = spawnTty(ws.dir, gen());
		const second = gen();
		second[5] = ws.path("second.wav");
		const b = spawnTty(ws.dir, second);
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		expect((await b.done).code).toBe(0);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		expect(readFileSync(ws.path("second.wav")).equals(wav)).toBe(true);
	});

	it("남의 테이크·요청과 다른 종류·만료된 것은 쓰지 않는다", async () => {
		loseCreate();
		const { requestId } = json(await run(...gen("--yes")));
		hook = undefined;
		const [{ id }] = await routerAs(OWNER).dramaList();
		owner = OTHER;
		expect((await run("drama", "resume", requestId)).code).toBe(6);
		expect(
			(await run("drama", "download", id, "--out", ws.path("a.wav"))).code,
		).toBe(4);
		expect(
			(await run("drama", "split", id, "--out-dir", ws.path("out"))).code,
		).toBe(4);
		expect((await run("drama", "remove", id, "--yes")).code).toBe(4);
		expect(json(await run(...gen("--dry-run"))).saved).toBeNull();
		owner = OWNER;
		expect(
			(await routerAs(OWNER).dramaList()).map(
				(take: { id: string }) => take.id,
			),
		).toContain(id);
		// 작업실의 요청 ID는 드라마 요청이 아니다
		const studio = await run(
			...["studio", "generate", "--voice", "typecast:tc_0001", "--yes"],
			...["--input", ws.script(`종류 ${mark}`), "--out", ws.path("s.mp3")],
			"--json",
		);
		const { rows } = await db.$client.query(
			"select request_id from trial_generation where id = $1",
			[json(studio).result.id],
		);
		expect((await run("drama", "resume", rows[0].request_id)).code).toBe(6);
		await db.$client.query(
			"update trial_generation set expires_at = now() - interval '1 minute' where id = $1",
			[id],
		);
		expect((await run("drama", "resume", requestId)).code).toBe(6);
		expect(
			(await run("drama", "download", id, "--out", ws.path("a.wav"))).code,
		).toBe(4);
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
	});

	it("보관함에 없는 성우면 서버를 부르기 전에 4다", async () => {
		const value = scene();
		const speaker = value.speakers[0];
		if (speaker) speaker.voice = "fish_audio:nobody";
		const result = await run(
			...["drama", "generate", "--input", file(value), "--yes"],
			...["--out", ws.path("a.wav"), "--json"],
		);
		expect(result.code).toBe(4);
		expect(synthesizeScene).not.toHaveBeenCalled();
	});

	const read = () => ({
		version: 1,
		speakers: [
			{ name: "가", voice: "typecast:tc_0001" },
			{ name: "나", voice: "gemini:Kore" },
		],
		lines: [
			{ speaker: 0, direction: "", text: `하나 ${mark}` },
			{ speaker: 1, direction: "차분하게", text: `둘 ${mark}` },
			{ speaker: 0, direction: "", text: `하나 ${mark}` },
		],
	});
	const readArgs = (...extra: string[]) => [
		...["drama", "read", "--input", file(read(), "read.json")],
		...["--out-dir", ws.path("out"), "--json", ...extra],
	];
	it("섞인 공급자 줄을 읽고 잇고, 다시 실행하면 만들지 않는다", async () => {
		const made = await run(...readArgs("--yes", "--join", ws.path("all.wav")));
		expect(made.code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect(readdirSync(ws.path("out")).sort()).toEqual([
			"001.mp3",
			"002.wav",
			"003.mp3",
			"omni-tts-result.json",
		]);
		expect(readFileSync(ws.path("out/003.mp3")).equals(sounds.typecast)).toBe(
			true,
		);
		const { seconds } = json(made).join;
		expect(seconds).toBeGreaterThan(3.4);
		expect(seconds).toBeLessThan(3.7);
		const again = await run(...readArgs());
		expect(again.code).toBe(0);
		expect(json(again).made).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect(ws.records()).toEqual([]);
	});

	it("쉼이 든 장면: 요청은 그대로이고 나누며 잇고, 읽어 잇고, 자동 태그가 쉼을 지킨다(T21)", async () => {
		segments = [
			{ text: `하나 ${mark}`, start: 0.1, end: 0.4 },
			{ text: "둘", start: 0.5, end: 0.9 },
		];
		const { id } = json(await run(...gen("--yes"))).result;
		const [first, second] = scene().lines;
		const gapped = {
			...scene(),
			gap: 1.1,
			lines: [{ ...first, gap: 2 }, second],
		};
		// 쉼이 있어도 같은 장면이라 저장된 테이크를 받는다
		const same = await run(
			...["drama", "generate", "--input", file(gapped, "gap.json"), "--json"],
			...["--out", ws.path("same.wav")],
		);
		expect(json(same)).toMatchObject({ source: "saved", result: { id } });
		expect(synthesizeScene).toHaveBeenCalledTimes(1);
		const cut = await run(
			...["drama", "split", id, "--out-dir", ws.path("out"), "--json"],
			...["--join", ws.path("split.wav"), "--input", ws.path("gap.json")],
		);
		expect(cut.code).toBe(0);
		const gapOf = (lines: { start: number; end: number }[]) =>
			(lines[1]?.start ?? 0) - (lines[0]?.end ?? 0);
		// 앞뒤 숨 0.02초씩이 쉼에 든다
		expect(gapOf(json(cut).join.lines)).toBeCloseTo(1.96, 3);
		expect(readFileSync(ws.path("split.wav")).length).toBe(
			json(cut).join.bytes,
		);
		const lines = readArgs("--yes", "--join", ws.path("read.wav"));
		file(
			{ ...read(), gap: 0.5, lines: read().lines.map((l) => ({ ...l })) },
			"read.json",
		);
		const joined = json(await run(...lines)).join;
		expect(gapOf(joined.lines)).toBeCloseTo(0.46, 3);
		suggestActing.mockResolvedValueOnce(
			JSON.stringify({
				lines: [
					{
						...{ index: 1, direction: "warmly", text: `둘 ${mark}` },
						...{ emotion: "", intensity: null },
					},
				],
			}),
		);
		const tagged = await run(
			...["drama", "autotag", "--input", ws.path("read.json"), "--yes"],
			...["--out", ws.path("tagged.json"), "--json"],
		);
		expect(tagged.code).toBe(0);
		expect(JSON.parse(readFileSync(ws.path("tagged.json"), "utf8")).gap).toBe(
			0.5,
		);
	});

	it("공급자가 답하지 않은 줄은 6이고 --retry-unconfirmed만 다시 만든다", async () => {
		synthesize.mockRejectedValueOnce(trialError("typecast", "unknown_outcome"));
		const first = await run(...readArgs("--yes"));
		expect(first.code).toBe(6);
		expect(json(first).line).toBe(1);
		expect((await run(...readArgs("--yes"))).code).toBe(6);
		expect(synthesize).toHaveBeenCalledTimes(1);
		const retried = await run(...readArgs("--yes", "--retry-unconfirmed"));
		expect(retried.code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(3);
		expect(ws.records()).toEqual([]);
	});

	it("자동 태그를 적용한 파일로 읽고, 실패는 CLI가 다시 부르지 않는다", async () => {
		suggestActing.mockResolvedValueOnce(
			JSON.stringify({
				lines: [
					{
						index: 1,
						direction: "warmly",
						text: `둘 ${mark}`,
						emotion: "",
						intensity: null,
					},
				],
			}),
		);
		const tagged = await run(
			...["drama", "autotag", "--input", file(read(), "read.json"), "--yes"],
			...["--out", ws.path("tagged.json"), "--json"],
		);
		expect(tagged.code).toBe(0);
		expect(json(tagged)).toMatchObject({
			mode: "read",
			changed: [{ n: 2, fields: [{ field: "direction", after: "warmly" }] }],
		});
		const made = await run(
			...["drama", "read", "--input", ws.path("tagged.json"), "--yes"],
			...["--out-dir", ws.path("out"), "--json"],
		);
		expect(made.code).toBe(0);
		expect(synthesize.mock.calls[1]?.[0].settings).toMatchObject({
			direction: "warmly",
		});
		suggestActing.mockReset();
		suggestActing.mockRejectedValue(trialError("openai", "unknown_outcome"));
		const failed = await run(
			...["drama", "autotag", "--input", ws.path("tagged.json"), "--yes"],
			...["--out", ws.path("t2.json"), "--json"],
		);
		expect(failed.code).toBe(6);
		expect(suggestActing).toHaveBeenCalledTimes(3);
	});

	it("비소유자는 3이고 부르지 않는다", async () => {
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
		for (const args of [gen("--yes"), readArgs("--yes"), ["drama", "list"]])
			expect((await run(...args)).code).toBe(3);
		expect(synthesizeScene).not.toHaveBeenCalled();
	});
});
