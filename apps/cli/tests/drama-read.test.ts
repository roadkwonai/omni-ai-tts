import { execFileSync, spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import {
	type DraftLine,
	newSpeaker,
	readRequests,
} from "@tts-pilot-app/api/drama-request";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { gapSamples } from "@tts-pilot-app/api/sound-join";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import { fingerprint } from "../src/requests.js";
import {
	cli,
	ffmpegPath,
	type Run,
	saved,
	type serve,
	spawnCli,
	spawnTty,
	studioWorld,
	USER,
	until,
	voiceOf,
	workspace,
} from "./harness.js";

const RATE = 44_100;
const FREE = "2026-11-24T00:00:00+09:00";
const PRESET = "55555555-5555-4555-8555-555555555555";
const GONE = "66666666-6666-4666-8666-666666666666";
let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;

type Speaker = { name: string; voice?: string; presetId?: string };
type Line = {
	speaker: number;
	direction?: string;
	text: string;
	feel?: DraftLine["feel"];
};
const read = (speakers: Speaker[], lines: Line[], over: object = {}) => ({
	version: 1,
	speakers,
	lines,
	...over,
});
const preset = (over: object = {}) => ({
	id: PRESET,
	name: "빠른 목소리",
	provider: "typecast",
	settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.2 },
	savedVoiceId: null,
	voice: voiceOf("typecast", "v1"),
	unavailable: false,
	channelId: null,
	channelDefault: false,
	fixed: [],
	...over,
});
const one = (...texts: string[]) =>
	read(
		[{ name: "가", voice: "typecast:v1" }],
		texts.map((text) => ({ speaker: 0, text })),
	);
type Read = ReturnType<typeof read>;
const speakersOf = (value: Read) =>
	value.speakers.map(({ name, voice = "fish_audio:", presetId }) => {
		const [provider = "", voiceId = ""] = voice.split(":");
		return {
			...newSpeaker(name),
			provider: provider as ProviderId,
			voiceId: voiceId || null,
			presetId: presetId ?? null,
		};
	});
const linesOf = (value: Read): DraftLine[] =>
	value.lines.map((line, i) => ({
		id: String(i),
		direction: "",
		...line,
	}));
// 웹 읽기의 요청
const requestsOf = (value: Read): TrialRequest[] => {
	const result = readRequests(
		speakersOf(value),
		linesOf(value),
		{
			saved: w.voices as never,
			presets: w.presets as never,
			headerModel: "s2.1-pro",
			now: Date.now(),
		},
		"0",
	);
	if ("problem" in result) throw new Error(JSON.stringify(result.problem));
	return result.lines.map(({ request }) => request);
};
const requestAt = (value: Read, n: number) => {
	const request = requestsOf(value)[n - 1];
	if (!request) throw new Error("없는 줄");
	return request;
};
const args = (value: object, ...extra: string[]) => [
	...["drama", "read", "--input"],
	ws.script(JSON.stringify(value), "read.json"),
	...["--out-dir", ws.path("out"), "--json", ...extra],
];
const run = (list: string[], now?: string) =>
	spawnCli(ws.dir, list, "", now).done;
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const texts = () => w.created.map(({ request }) => request.text);
const count = (name: string) => w.calls.filter((item) => item === name).length;
const progress = () =>
	JSON.parse(readFileSync(ws.path("out/omni-tts-result.json"), "utf8"));
const record = (value: Read, n: number, requestId: string) => {
	const state = existsSync(ws.requestsPath)
		? JSON.parse(readFileSync(ws.requestsPath, "utf8"))
		: { requests: {} };
	state.requests[
		fingerprint(server.origin, USER, requestAt(value, n), "trial")
	] = {
		origin: server.origin,
		requestId,
		provider: "typecast",
		createdAt: "2026-11-24T00:00:00Z",
		kind: "trial",
	};
	writeFileSync(ws.requestsPath, JSON.stringify(state), { mode: 0o600 });
	return requestId;
};
const trial = (value: Read, n: number, status = "done") =>
	w.add(requestAt(value, n), { kind: "trial", status: status as never });

beforeEach(async () => {
	w = studioWorld();
	w.voices = [...w.voices, saved(voiceOf("airy", "ai"))];
	w.presets = [preset()];
	server = await w.serve();
	ws = workspace(server.origin);
	mkdirSync(ws.path("out"));
});
afterEach(() => {
	server.close();
	ws.remove();
});

describe("drama read", { timeout: 60_000 }, () => {
	const mixed = () =>
		read(
			[
				{ name: "타입", voice: "typecast:v1", presetId: PRESET },
				{ name: "일레븐", voice: "elevenlabs:el" },
				{ name: "에어리", voice: "airy:ai" },
				{ name: "제미나이", voice: "gemini:Kore" },
			],
			[
				{
					speaker: 0,
					text: "프리셋",
					feel: { typecast: { emotion: "smart", intensity: 1 } },
				},
				{ speaker: 1, direction: "with excitement", text: "둘 [laughs]" },
				{ speaker: 2, text: "셋", feel: { airy: { style: "bright" } } },
				{ speaker: 3, direction: "속삭이듯", text: "넷" },
				{
					speaker: 0,
					text: "프리셋",
					feel: { typecast: { emotion: "smart", intensity: 1 } },
				},
			],
		);

	it("다섯 공급자 줄을 웹과 같은 요청으로 한 번씩 만들고 같은 줄은 저장본을 받는다", async () => {
		const value = mixed();
		const fish = read(
			[
				{ name: "피시", voice: "fish_audio:fish" },
				{ name: "타입", voice: "typecast:v1" },
			],
			[
				{ speaker: 0, direction: "warm", text: "하나" },
				{ speaker: 1, text: "둘" },
			],
		);
		const result = await run(args(value, "--yes"));
		expect(result.code).toBe(0);
		const requests = requestsOf(value);
		expect(w.created.map(({ request }) => request)).toEqual(
			requests.slice(0, 4),
		);
		expect(w.created[0]?.request.settings).toMatchObject({ tempo: 1.2 });
		const body = json(result);
		expect(body).toMatchObject({ made: 4, join: null });
		expect(
			body.lines.map((row: { n: number; source: string; out: string }) => [
				row.n,
				row.source,
				row.out.slice(-7),
			]),
		).toEqual([
			[1, "created", "001.mp3"],
			[2, "created", "002.mp3"],
			[3, "created", "003.mp3"],
			[4, "created", "004.wav"],
			[5, "saved", "005.mp3"],
		]);
		// 같은 줄의 나머지는 저장본이다
		expect(count("trialAudio")).toBe(1);
		for (const { out } of body.lines)
			expect(readFileSync(out).equals(w.audio)).toBe(true);
		expect(progress().items).toHaveLength(5);
		expect(ws.records()).toEqual([]);
		expect(ws.leftovers()).toEqual([]);
		w.calls.length = 0;
		const again = await run(args(value));
		expect(again.code).toBe(0);
		expect(
			json(again).lines.every(
				(row: { source: string }) => row.source === "kept",
			),
		).toBe(true);
		expect(w.calls).not.toContain("trialAudio");
		expect(w.synth).toBe(4);
		const other = args(fish, "--yes", "--overwrite", "--only", "1");
		expect((await run(other)).code).toBe(0);
		expect(w.created[4]?.request).toEqual(requestAt(fish, 1));
	});

	it("성우를 주지 않은 화자는 프리셋의 성우를 쓴다", async () => {
		const value = read(
			[{ name: "가", presetId: PRESET }],
			[{ speaker: 0, text: "하나" }],
		);
		expect((await run(args(value, "--yes"))).code).toBe(0);
		expect(w.created[0]?.request).toMatchObject({
			provider: "typecast",
			voiceId: "v1",
			settings: { tempo: 1.2 },
		});
	});

	it("막는 줄은 번호를 모두 알리고 2이며 고르지 않은 줄은 보지 않는다", async () => {
		w.presets = [preset(), preset({ id: GONE, unavailable: true })];
		const value = read(
			[
				{ name: "가", voice: "typecast:v1" },
				{ name: "없음" },
				{ name: "이용 불가", voice: "typecast:gone" },
				{ name: "프리셋", voice: "typecast:v1", presetId: GONE },
			],
			[
				{ speaker: 0, text: "좋은 줄" },
				{ speaker: 1, text: "성우 없음" },
				{ speaker: 2, text: "이용 불가" },
				{ speaker: 3, text: "프리셋 이용 불가" },
				{ speaker: 0, text: "가".repeat(201) },
				{ speaker: 0, text: "[laughs]" },
			],
		);
		for (const extra of [["--yes"], ["--dry-run"]]) {
			const result = await run(args(value, ...extra));
			expect(result.code).toBe(2);
			expect(json(result).lines.map((row: { n: number }) => row.n)).toEqual([
				2, 3, 4, 5, 6,
			]);
		}
		expect(w.synth).toBe(0);
		expect((await run(args(value, "--yes", "--only", "1"))).code).toBe(0);
		expect((await run(args(value, "--yes", "--only", "7"))).code).toBe(2);
	});

	it("프리셋 목록을 받지 못하면 만들지 않는다", async () => {
		w.on.presetList = () => {
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		};
		const value = read(
			[{ name: "가", voice: "typecast:v1", presetId: PRESET }],
			[{ speaker: 0, text: "하나" }],
		);
		expect((await run(args(value, "--yes"))).code).toBe(5);
		expect(w.synth).toBe(0);
	});

	it("잘못된 읽기 파일은 줄 번호와 함께 2이고 서버를 부르지 않는다", async () => {
		const value = read(
			[{ name: "가", voice: "typecast:v1" }],
			[
				{
					speaker: 0,
					text: "가",
					feel: { typecast: { emotion: "없음" as never, intensity: 1 } },
				},
				{ speaker: 3, text: "나" },
			],
		);
		const result = await run(args(value, "--yes"));
		expect(result.code).toBe(2);
		expect(json(result).lines.map((row: { n: number }) => row.n)).toEqual([
			1, 2,
		]);
		const text = [
			...["drama", "read", "--input", ws.script("가: 나", "read.txt")],
			...["--out-dir", ws.path("out"), "--yes"],
		];
		expect((await run(text)).code).toBe(2);
		expect(w.calls).toEqual([]);
	});

	it("모양 오류와 글 오류를 한 번에 모두 알린다", async () => {
		const value = read(
			[{ name: "가", voice: "typecast:v1" }, { name: "없음" }],
			[
				{ speaker: 0, text: " " },
				{ speaker: 9, text: "없는 화자" },
				{ speaker: 0, text: "가".repeat(305) },
				{ speaker: 1, text: "성우 없음" },
				{ speaker: 0, text: "좋은 줄" },
			],
		);
		const result = await run(args(value, "--yes"));
		expect(result.code).toBe(2);
		expect(json(result).lines.map((row: { n: number }) => row.n)).toEqual([
			1, 2, 3, 4,
		]);
		expect(w.calls).not.toContain("trialFindMany");
		expect(w.synth).toBe(0);
	});

	it("계획은 수와 사용량만 보이고, 비대화 확인과 무료 모델 규칙이 같다", async () => {
		const value = mixed();
		trial(value, 2);
		const dry = await run(args(value, "--dry-run"));
		expect(dry.code).toBe(0);
		const body = json(dry);
		expect(body).toMatchObject({
			dryRun: true,
			make: 3,
			saved: 1,
			check: 0,
			needsConfirm: true,
		});
		expect(
			body.estimate.map((row: { provider: string }) => row.provider),
		).toEqual(["typecast", "airy", "gemini"]);
		const refused = await run(args(value));
		expect(refused.code).toBe(2);
		expect(json(refused).code).toBe("CONFIRM_REQUIRED");
		expect(w.synth).toBe(0);
		expect(ws.records()).toEqual([]);
		const free = read(
			[{ name: "가", voice: "fish_audio:fish" }],
			[{ speaker: 0, text: "무료" }],
		);
		expect((await run(args(free), FREE)).code).toBe(0);
		expect(w.synth).toBe(1);
		const tty = spawnTty(ws.dir, args(value, "--overwrite"));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		expect(tty.seen()).toContain("만들 줄 3개");
		tty.write("n\r");
		expect((await tty.done).code).toBe(2);
		expect(w.synth).toBe(1);
	});

	it("무료 모델이 끝난 뒤에도 무료로 만든 줄을 쓰고 없는 줄만 유료로 만든다", async () => {
		const value = read(
			[{ name: "가", voice: "fish_audio:fish" }],
			[
				{ speaker: 0, text: "하나" },
				{ speaker: 0, text: "둘" },
			],
		);
		const at = (time: string, ...extra: string[]) =>
			run(args(value, ...extra), `2026-11-${time}+09:00`);
		expect((await at("29T23:59:00", "--only", "1")).code).toBe(0);
		expect(json(await at("30T00:01:00", "--dry-run"))).toMatchObject({
			lines: [
				{ n: 1, status: "saved", resultId: w.rows[0]?.id },
				{ n: 2, status: "make" },
			],
			make: 1,
		});
		const made = await at("30T00:01:00", "--yes");
		expect(made.code).toBe(0);
		expect(json(made).lines).toMatchObject([
			{ n: 1, source: "kept", resultId: w.rows[0]?.id },
			{ n: 2, source: "created" },
		]);
		expect(w.created.map(({ request }) => request.settings.model)).toEqual([
			"s2.1-pro-free",
			"s2.1-pro",
		]);
	});

	it("중간에 실패하면 멈추고 다시 실행하면 남은 줄만 만든다", async () => {
		const value = one("하나", "둘", "셋");
		let fail = true;
		w.on.trialCreate = (input, next) => {
			if (fail && input.request.text === "둘")
				throw new ORPCError("BAD_GATEWAY", { data: { reason: "quota" } });
			return next();
		};
		const first = await run(args(value, "--yes"));
		expect(first.code).toBe(5);
		expect(json(first)).toMatchObject({ line: 2, reason: "quota" });
		expect(first.err).toContain("끝낸 줄 1개");
		expect(texts()).toEqual(["하나"]);
		expect(ws.records()).toEqual([]);
		fail = false;
		const second = await run(args(value, "--yes"));
		expect(second.code).toBe(0);
		expect(texts()).toEqual(["하나", "둘", "셋"]);
	});

	it("응답을 잃은 줄은 다시 보내지 않고 로컬 기록으로만 판정한다", async () => {
		const value = one("하나", "둘");
		let seen = 0;
		w.on.trialCreate = async (_input, next) => {
			seen += 1;
			const result = await next();
			if (seen === 2)
				throw new ORPCError("GATEWAY_TIMEOUT", {
					data: { reason: "unknown_outcome" },
				});
			return result;
		};
		const first = await run(args(value, "--yes"));
		expect(first.code).toBe(6);
		const { requestId, line, message } = json(first);
		expect(line).toBe(2);
		expect(message).toContain("trial resume");
		expect(message).toContain("--retry-unconfirmed");
		expect(ws.records()).toMatchObject([{ requestId, kind: "trial" }]);
		delete w.on.trialCreate;
		const row = w.rows.find((item) => item.requestId === requestId);
		if (row) row.status = "pending";
		const blocked = await run(args(value, "--yes"));
		expect(blocked.code).toBe(6);
		expect(json(blocked).lines).toEqual([{ n: 2, requestId }]);
		expect(blocked.err).not.toContain("예상 사용량");
		expect(w.synth).toBe(2);
		if (row) row.status = "done";
		expect((await run(args(value, "--yes"))).code).toBe(0);
		expect(w.synth).toBe(2);
		expect(ws.records()).toEqual([]);
	});

	it.each(["pending", "unknown", "없음"])(
		"완료가 확인되지 않으면(%s) 파일은 두고 그 줄에서 6으로 멈춘다",
		async (state) => {
			const value = one("하나", "둘");
			if (state === "없음") w.on.trialRequest = () => null;
			else w.trialStatus = state as never;
			const first = await run(args(value, "--yes"));
			expect(first.code).toBe(6);
			expect(json(first)).toMatchObject({
				line: 1,
				requestId: ws.records()[0]?.requestId,
			});
			expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
			expect(progress().items).toHaveLength(1);
			expect(texts()).toEqual(["하나"]);
			const again = await run(args(value, "--yes"));
			expect(again.code).toBe(6);
			expect(texts()).toEqual(["하나"]);
			expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
		},
	);

	it("확정 실패 기록은 다시 만들고 완료 기록은 쓰고 해제하며 계획은 건드리지 않는다", async () => {
		const value = one("하나", "둘");
		record(value, 1, trial(value, 1, "failed").requestId);
		const done = trial(value, 2);
		record(value, 2, done.requestId);
		const dry = json(await run(args(value, "--dry-run")));
		expect(dry.lines.map((row: { status: string }) => row.status)).toEqual([
			"make",
			"saved",
		]);
		expect(ws.records()).toHaveLength(2);
		const result = await run(args(value, "--yes"));
		expect(result.code).toBe(0);
		expect(texts()).toEqual(["하나"]);
		expect(json(result).lines[1]).toMatchObject({ resultId: done.id });
		expect(ws.records()).toEqual([]);
	});

	it("로컬 기록이 있으면 같은 조합의 다른 완료보다 먼저 본다", async () => {
		const value = one("하나");
		trial(value, 1);
		const requestId = record(value, 1, crypto.randomUUID());
		const result = await run(args(value, "--yes"));
		expect(result.code).toBe(6);
		expect(json(result).lines).toEqual([{ n: 1, requestId }]);
		expect(w.synth).toBe(0);
	});

	it("작업실 기록은 시험 생성 줄을 막지 않는다", async () => {
		const value = one("하나");
		writeFileSync(
			ws.requestsPath,
			JSON.stringify({
				requests: {
					[fingerprint(server.origin, USER, requestAt(value, 1))]: {
						origin: server.origin,
						requestId: crypto.randomUUID(),
						provider: "typecast",
						createdAt: "2026-11-24T00:00:00Z",
					},
				},
			}),
			{ mode: 0o600 },
		);
		expect((await run(args(value, "--yes"))).code).toBe(0);
		expect(ws.records()).toHaveLength(1);
	});

	it("두 프로세스를 함께 실행해도 줄마다 1회다", async () => {
		const value = one("하나", "둘");
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		w.on.trialFindMany = async (input, next) => {
			if (count("trialFindMany") <= 2) {
				await held;
				return input.map(() => null);
			}
			return next();
		};
		mkdirSync(ws.path("other"));
		const a = spawnCli(ws.dir, args(value, "--yes"));
		const b = spawnCli(ws.dir, [
			...["drama", "read", "--input", ws.path("read.json")],
			...["--out-dir", ws.path("other"), "--yes"],
		]);
		await until(() => count("trialFindMany") === 2, "두 계획");
		w.on.trialCreate = async (_input, next) => {
			await Promise.race([
				a.done,
				b.done,
				new Promise((done) => setTimeout(done, 3000)),
			]);
			return next();
		};
		open();
		const codes = [(await a.done).code, (await b.done).code].sort();
		expect(codes).toEqual([0, 6]);
		expect(texts()).toEqual(["하나", "둘"]);
	});

	it("--retry-unconfirmed는 확인 필요한 줄만 새로 만들고 두 프로세스에서도 1회다", async () => {
		const value = one("하나", "둘");
		trial(value, 1);
		const old = record(value, 2, trial(value, 2, "unknown").requestId);
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		w.on.trialFindMany = async (_input, next) => {
			if (count("trialFindMany") <= 2) await held;
			return next();
		};
		mkdirSync(ws.path("other"));
		const a = spawnCli(ws.dir, args(value, "--yes", "--retry-unconfirmed"));
		const b = spawnCli(ws.dir, [
			...["drama", "read", "--input", ws.path("read.json")],
			...["--out-dir", ws.path("other"), "--yes", "--retry-unconfirmed"],
		]);
		await until(() => count("trialFindMany") === 2, "두 계획");
		w.on.trialCreate = async (_input, next) => {
			await Promise.race([
				a.done,
				b.done,
				new Promise((done) => setTimeout(done, 3000)),
			]);
			return next();
		};
		open();
		const codes = [(await a.done).code, (await b.done).code];
		expect(codes).toContain(0);
		expect(texts()).toEqual(["둘"]);
		expect(w.created[0]?.requestId).not.toBe(old);
	});

	it("Ctrl+C: 확인 중이면 2, 응답 전이면 6, 저장본을 받는 중이면 7이다", async () => {
		const value = one("하나", "둘");
		const tty = spawnTty(ws.dir, args(value));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		w.on.trialCreate = (input, next) =>
			input.request.text === "둘" ? new Promise(() => {}) : next();
		const sending = spawnCli(ws.dir, args(value, "--yes"));
		await until(() => count("trialCreate") === 2, "둘째 생성");
		sending.child.kill("SIGINT");
		const sent = await sending.done;
		expect(sent.code).toBe(6);
		expect(json(sent)).toMatchObject({
			line: 2,
			requestId: ws.records()[0]?.requestId,
		});
		expect(progress().items).toHaveLength(1);
		delete w.on.trialCreate;
		writeFileSync(ws.requestsPath, JSON.stringify({ requests: {} }), {
			mode: 0o600,
		});
		const row = trial(value, 2);
		w.on.trialAudio = () => new Promise(() => {});
		const loading = spawnCli(ws.dir, args(value, "--yes"));
		await until(() => count("trialAudio") === 1, "내려받기");
		loading.child.kill("SIGINT");
		const cut = await loading.done;
		expect(cut.code).toBe(7);
		expect(json(cut)).toMatchObject({ line: 2, resultId: row.id });
		expect(ws.leftovers()).toEqual([]);
	});

	it("있는 파일·링크·남의 진행 파일은 만들기 전에 막고, 크기가 바뀐 파일은 그대로 두지 않는다", async () => {
		const value = one("하나", "둘");
		writeFileSync(ws.path("out/002.mp3"), "있음");
		expect((await run(args(value, "--yes"))).code).toBe(2);
		rmSync(ws.path("out/002.mp3"));
		symlinkSync(ws.path("none"), ws.path("out/001.mp3"));
		expect((await run(args(value, "--yes", "--overwrite"))).code).toBe(2);
		rmSync(ws.path("out/001.mp3"));
		writeFileSync(ws.path("out/omni-tts-result.json"), "{}");
		expect((await run(args(value, "--yes"))).code).toBe(2);
		rmSync(ws.path("out/omni-tts-result.json"));
		expect(w.synth).toBe(0);
		expect((await run(args(value, "--yes"))).code).toBe(0);
		writeFileSync(ws.path("out/001.mp3"), "짧다");
		expect((await run(args(value))).code).toBe(2);
		const fixed = await run(args(value, "--overwrite"));
		expect(
			json(fixed).lines.map((row: { source: string }) => row.source),
		).toEqual(["saved", "kept"]);
		expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
		expect(w.synth).toBe(2);
	});

	it("응답 오디오를 파일로 두지 못하면 7이고, 다시 실행하면 저장본을 받는다", async () => {
		const value = one("하나");
		w.on.trialCreate = (_input, next) => {
			// 보낸 사이 같은 이름의 파일이 생겼다
			writeFileSync(ws.path("out/001.mp3"), "남의 파일");
			return next();
		};
		const first = await run(args(value, "--yes"));
		expect(first.code).toBe(7);
		expect(json(first)).toMatchObject({ line: 1, resultId: w.rows[0]?.id });
		expect(readFileSync(ws.path("out/001.mp3"), "utf8")).toBe("남의 파일");
		delete w.on.trialCreate;
		expect((await run(args(value, "--overwrite"))).code).toBe(0);
		expect(w.synth).toBe(1);
	});
});

describe("drama read --join", { timeout: 60_000 }, () => {
	let bins: string;
	let mp3: Buffer;
	let wav: Buffer;
	const tone = (...format: string[]) =>
		execFileSync(ffmpegPath(), [
			...["-loglevel", "error", "-f", "lavfi"],
			...["-i", "sine=frequency=440:duration=1", ...format, "-"],
		]);
	beforeAll(() => {
		bins = mkdtempSync(join(tmpdir(), "omni-t20-read-"));
		for (const [name, path] of [
			["ffmpeg", ffmpegPath()],
			["afconvert", "/usr/bin/afconvert"],
		] as const) {
			mkdirSync(join(bins, name));
			symlinkSync(path, join(bins, name, name));
		}
		mkdirSync(join(bins, "none"));
		mp3 = tone("-f", "mp3");
		wav = tone("-ar", "24000", "-f", "wav");
	});
	afterAll(() => rmSync(bins, { recursive: true, force: true }));
	const runWith = (path: string, list: string[]) => {
		const child = spawn(process.execPath, [cli, ...list], {
			cwd: tmpdir(),
			env: {
				...process.env,
				PATH: join(bins, path),
				OMNI_TTS_CONFIG_DIR: ws.dir,
			},
		});
		let out = "";
		child.stdout.on("data", (chunk) => {
			out += chunk;
		});
		return new Promise<Run>((done) =>
			child.on("close", (code) => done({ code, out, err: "" })),
		);
	};
	const value = () =>
		read(
			[
				{ name: "가", voice: "typecast:v1" },
				{ name: "나", voice: "gemini:Kore" },
			],
			[
				{ speaker: 0, text: "하나" },
				{ speaker: 1, text: "둘" },
				{ speaker: 0, text: "하나" },
			],
		);
	const sounds = () => {
		w.on.trialCreate = (input, next) => {
			w.audio = input.request.provider === "gemini" ? wav : mp3;
			return next();
		};
	};

	it.each(["ffmpeg", "afconvert"])(
		"섞인 공급자 줄을 %s로 풀어 0.3초 쉼으로 한 WAV에 잇는다",
		async (tool) => {
			sounds();
			const result = await runWith(
				tool,
				args(value(), "--yes", "--join", ws.path("all.wav")),
			);
			expect(result.code).toBe(0);
			const { join: joined, lines } = json(result);
			expect(lines).toHaveLength(3);
			const bytes = readFileSync(ws.path("all.wav"));
			expect(joined.out).toBe(ws.path("all.wav"));
			expect(joined.bytes).toBe(bytes.length);
			expect(bytes.readUInt32LE(24)).toBe(RATE);
			expect(bytes.readUInt16LE(22)).toBe(1);
			expect(bytes.readUInt16LE(34)).toBe(16);
			expect(joined.seconds).toBeCloseTo((bytes.length - 44) / 2 / RATE, 5);
			expect(joined.lines.map((row: { n: number }) => row.n)).toEqual([
				1, 2, 3,
			]);
			for (let i = 0; i < 2; i += 1)
				expect(
					Math.round((joined.lines[i + 1].start - joined.lines[i].end) * RATE),
				).toBe(gapSamples(0.3, RATE));
			for (const { start, end } of joined.lines) {
				expect(end - start).toBeGreaterThan(0.95);
				expect(end - start).toBeLessThan(1.1);
			}
			expect(w.synth).toBe(2);
			// 다시 실행하면 만들지 않고 잇기만 한다
			const again = await runWith(
				tool,
				args(value(), "--join", ws.path("again.wav")),
			);
			expect(again.code).toBe(0);
			expect(readFileSync(ws.path("again.wav")).equals(bytes)).toBe(true);
			expect(w.synth).toBe(2);
		},
	);

	it.each([
		["링크로 본 같은 폴더", "link/001.wav"],
		["대소문자만 다른 이름", "out/001.WAV"],
		["링크와 대소문자", "link/001.Wav"],
	])(
		"줄 파일과 같은 파일이 되는 결합 경로(%s)는 만들기 전에 2다",
		async (_name, path) => {
			// 줄 파일이 WAV여야 --join과 겹친다
			const same = read(
				[{ name: "나", voice: "gemini:Kore" }],
				[{ speaker: 0, text: "하나" }],
			);
			symlinkSync(ws.path("out"), ws.path("link"));
			const result = await runWith(
				"ffmpeg",
				args(same, "--yes", "--overwrite", "--join", ws.path(path)),
			);
			expect(result.code).toBe(2);
			expect(json(result).message).toContain("--join");
			expect(w.synth).toBe(0);
		},
	);

	it("폴더 이름의 대소문자만 다른 결합 경로는 같은 폴더일 때만 만들기 전에 2다", async () => {
		sounds();
		const value = read(
			[{ name: "나", voice: "gemini:Kore" }],
			[{ speaker: 0, text: "하나" }],
		);
		// 대소문자를 구분하는 볼륨이면 다른 폴더다
		const same = existsSync(ws.path("OUT"));
		if (!same) mkdirSync(ws.path("OUT"));
		const result = await runWith(
			"ffmpeg",
			args(value, "--yes", "--overwrite", "--join", ws.path("OUT/001.wav")),
		);
		expect(result.code).toBe(same ? 2 : 0);
		expect(w.synth).toBe(same ? 0 : 1);
	});

	it("도구가 없거나 경로가 막히면 만들기 전에 멈춘다", async () => {
		const none = await runWith(
			"none",
			args(value(), "--yes", "--join", ws.path("all.wav")),
		);
		expect(none.code).toBe(7);
		expect(json(none).message).toContain("ffmpeg");
		writeFileSync(ws.path("all.wav"), "있음");
		expect(
			(
				await runWith(
					"ffmpeg",
					args(value(), "--yes", "--join", ws.path("all.wav")),
				)
			).code,
		).toBe(2);
		expect(
			(
				await runWith(
					"ffmpeg",
					args(value(), "--yes", "--join", ws.path("a.mp3")),
				)
			).code,
		).toBe(2);
		expect(w.synth).toBe(0);
		// 줄 파일과 같은 경로로는 잇지 않는다
		const same = read(
			[{ name: "나", voice: "gemini:Kore" }],
			[{ speaker: 0, text: "하나" }],
		);
		expect(
			(
				await runWith(
					"ffmpeg",
					args(same, "--yes", "--join", ws.path("out/001.wav")),
				)
			).code,
		).toBe(2);
		expect(w.synth).toBe(0);
	});

	it("풀지 못하면 7이고 만든 줄 파일은 남는다", async () => {
		const result = await runWith(
			"ffmpeg",
			args(one("하나"), "--yes", "--join", ws.path("all.wav")),
		);
		expect(result.code).toBe(7);
		expect(json(result).code).toBe("DECODE_FAILED");
		expect(existsSync(ws.path("all.wav"))).toBe(false);
		expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
		expect(w.synth).toBe(1);
	});
});
