import { existsSync, readFileSync } from "node:fs";
import { emptyVoice } from "@tts-pilot-app/api/providers/list";
import {
	DEFAULT_SETTINGS,
	STUDIO_PART_BYTES,
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
	bytesOf,
	COOKIE,
	type ServeHook,
	serve,
	spawnCli,
	spawnTty,
	until,
	workspace,
} from "./harness.js";

// 실제 라우터 + 모의 공급자 + PostgreSQL. 건너뛴 것은 통과가 아니다(TEST.md)
const url = process.env.CLI_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
	throw new Error("CLI_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
const OWNER = `cli-e2e-${crypto.randomUUID()}`;

describe.skipIf(!url)("실제 라우터 E2E", { timeout: 60_000 }, () => {
	const db = createDb({
		DATABASE_URL: url ?? "postgresql://skip@127.0.0.1:1/skip",
	});
	let audio = bytesOf(2048);
	const synthesize = vi.fn(async (_request: TrialRequest) => audio);
	const client = { checkStatus: vi.fn(), synthesize };
	const providers = { typecast: client, gemini: client };
	let hook: ServeHook | undefined;
	let server: Awaited<ReturnType<typeof serve>>;
	let ws: ReturnType<typeof workspace>;
	let text = "";
	let presetId = "";
	// 소유자 세션 쿠키면 서버가 정한 소유자, 아니면 null(apps/web context.ts와 같다)
	let ownerId: string | null = OWNER;

	const run = (...args: string[]) => spawnCli(ws.dir, args).done;
	const gen = (...extra: string[]) => [
		"studio",
		"generate",
		"--voice",
		"typecast:tc_0001",
		"--input",
		ws.script(text),
		"--out",
		ws.path("out.mp3"),
		...extra,
	];
	const json = (result: { out: string }) => {
		expect(result.out.trim().split("\n")).toHaveLength(1);
		return JSON.parse(result.out);
	};

	beforeAll(async () => {
		server = await serve(appRouter, {
			context: (cookie) => ({
				db,
				ownerId: cookie === COOKIE ? ownerId : null,
				providers: cookie === COOKIE && ownerId ? providers : null,
			}),
			user: (cookie) => (cookie === COOKIE ? { id: OWNER } : null),
			hook: (...args) => hook?.(...args) ?? false,
		});
		const { createRouterClient } = await import("@orpc/server");
		const router = createRouterClient(appRouter, {
			context: { db, ownerId: OWNER, providers: null },
		});
		const voice = {
			...emptyVoice("typecast", "public"),
			voiceId: "tc_0001",
			name: "담은 성우",
		};
		await router.savedVoiceSave({ voice });
		await router.savedVoiceSave({
			voice: {
				...emptyVoice("gemini", "public"),
				voiceId: "Kore",
				name: "코레",
			},
		});
		presetId = (
			await router.presetCreate({
				name: "E2E 프리셋",
				channelId: null,
				channelDefault: false,
				voice,
				provider: "typecast",
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.2 },
			})
		).id;
	});
	beforeEach(() => {
		ws = workspace(server.origin);
		text = `E2E 대본 ${crypto.randomUUID()}`;
		audio = bytesOf(2048);
		ownerId = OWNER;
		hook = undefined;
		synthesize.mockClear();
	});
	afterEach(() => ws.remove());
	afterAll(async () => {
		server.close();
		for (const table of ["voice_preset", "saved_voice", "trial_generation"])
			await db.$client.query(`delete from ${table} where owner_id = $1`, [
				OWNER,
			]);
		await db.$client.end();
	});

	it("성우와 프리셋으로 만들고 다른 실행에서 결과 ID로 받는다", async () => {
		const made = await run(...gen("--yes", "--json"));
		expect(made.code).toBe(0);
		// 확인을 건너뛰어도 무엇을 만드는지 stderr에 보인다
		expect(made.err).toContain("예상 사용량");
		const { result, source } = json(made);
		expect(source).toBe("created");
		expect(readFileSync(ws.path("out.mp3")).equals(audio)).toBe(true);
		const again = await run(
			"studio",
			"download",
			result.id,
			"--out",
			ws.path("again.mp3"),
			"--json",
		);
		expect(json(again).result).toEqual(result);
		expect(readFileSync(ws.path("again.mp3")).equals(audio)).toBe(true);

		const list = json(await run("presets", "list", "--json"));
		expect(list.presets).toMatchObject([
			{ id: presetId, ref: "typecast:tc_0001" },
		]);
		const preset = await run(
			"studio",
			"generate",
			"--preset-id",
			presetId,
			"--input",
			ws.script(text),
			"--out",
			ws.path("preset.mp3"),
			"--yes",
		);
		expect(preset.code).toBe(0);
		expect(readFileSync(ws.path("preset.mp3")).equals(audio)).toBe(true);
		// 설정이 달라 다른 조합이다
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect(synthesize.mock.calls[1]?.[0].settings).toMatchObject({
			tempo: 1.2,
		});
	});

	it("3MiB를 넘는 오디오의 조각 순서·길이·전체 바이트가 맞는다", async () => {
		audio = bytesOf(STUDIO_PART_BYTES * 2 + 12_345);
		const made = await run(...gen("--yes", "--json"));
		expect(json(made).result.bytes).toBe(audio.byteLength);
		expect(readFileSync(ws.path("out.mp3")).equals(audio)).toBe(true);
	});

	it("Gemini 결과를 WAV로 받는다", async () => {
		const args = gen("--yes", "--json");
		args[3] = "gemini:Kore";
		args[7] = ws.path("out.wav");
		const made = await run(...args);
		expect(json(made)).toMatchObject({ mime: "audio/wav" });
		expect(readFileSync(ws.path("out.wav")).equals(audio)).toBe(true);
	});

	it("동시 실행과 재실행, dry-run에서 합성은 1회다", async () => {
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		synthesize.mockImplementationOnce(async () => {
			await held;
			return audio;
		});
		const first = spawnCli(ws.dir, gen("--yes", "--json"));
		await until(() => synthesize.mock.calls.length === 1, "합성 시작");
		const second = await run(...gen("--yes", "--json"));
		expect(second.code).toBe(6);
		open();
		expect((await first.done).code).toBe(0);
		const third = await run(...gen("--json", "--overwrite"));
		expect(json(third).source).toBe("saved");
		const dry = await run(...gen("--dry-run", "--overwrite", "--json"));
		expect(json(dry).saved.status).toBe("done");
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("확인 프롬프트에 함께 선 둘째 프로세스는 첫 결과를 받는다", async () => {
		const a = spawnTty(ws.dir, gen());
		const second = gen();
		second[7] = ws.path("second.mp3");
		const b = spawnTty(ws.dir, second);
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		expect((await b.done).code).toBe(0);
		expect(readFileSync(ws.path("second.mp3")).equals(audio)).toBe(true);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("응답을 잃어도 같은 UUID로만 받고 다시 합성하지 않는다", async () => {
		hook = (path, _request, response) => {
			if (path.includes("studioCreate"))
				response.writeHead = (() => {
					response.destroy();
					return response;
				}) as never;
			return false;
		};
		const lost = await run(...gen("--yes", "--json"));
		expect(lost.code).toBe(6);
		const { requestId } = json(lost);
		expect(ws.records()[0]?.requestId).toBe(requestId);
		expect(existsSync(ws.path("out.mp3"))).toBe(false);
		hook = undefined;
		const resumed = await run("studio", "resume", requestId, "--json");
		expect(json(resumed)).toMatchObject({ source: "resumed", out: null });
		expect(ws.records()).toEqual([]);
		expect((await run(...gen("--json"))).code).toBe(0);
		expect(readFileSync(ws.path("out.mp3")).equals(audio)).toBe(true);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("공급자 실패는 5이고 기록을 지운다. 응답을 못 받은 실패는 6이고 남긴다", async () => {
		const { trialError } = await import("@tts-pilot-app/api/providers/errors");
		synthesize.mockRejectedValueOnce(trialError("typecast", "quota"));
		const failed = await run(...gen("--yes", "--json"));
		expect(failed.code).toBe(5);
		expect(json(failed).reason).toBe("quota");
		expect(ws.records()).toEqual([]);
		synthesize.mockRejectedValueOnce(trialError("typecast", "unknown_outcome"));
		const unknown = await run(...gen("--yes", "--json"));
		expect(unknown.code).toBe(6);
		const { requestId } = json(unknown);
		expect((await run("studio", "resume", requestId)).code).toBe(6);
		expect((await run(...gen("--yes"))).code).toBe(6);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect((await run(...gen("--yes", "--new"))).code).toBe(0);
		expect(synthesize).toHaveBeenCalledTimes(3);
	});

	it("비소유자는 3이고 합성하지 않는다. 남의 결과는 4다", async () => {
		const made = json(await run(...gen("--yes", "--json")));
		ownerId = null;
		expect((await run(...gen("--yes", "--overwrite"))).code).toBe(3);
		ownerId = `${OWNER}-other`;
		const other = await run(
			"studio",
			"download",
			made.result.id,
			"--out",
			ws.path("other.mp3"),
		);
		expect(other.code).toBe(4);
		expect(existsSync(ws.path("other.mp3"))).toBe(false);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});
});
