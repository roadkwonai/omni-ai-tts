import { execFileSync, spawn } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LineSpan } from "@tts-pilot-app/api/drama-script";
import { cutWav, wavOf } from "@tts-pilot-app/api/drama-script";
import {
	gapSamples,
	joinWav,
	pcm16,
	spansOf,
	trimSilence,
} from "@tts-pilot-app/api/sound-join";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";
import {
	cli,
	ffmpegPath,
	type Run,
	type serve,
	spawnCli,
	studioWorld,
	until,
	workspace,
} from "./harness.js";

const RATE = 44_100;
let bins: string;
let mp3: Buffer;
let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;

beforeAll(() => {
	bins = mkdtempSync(join(tmpdir(), "omni-t21-gap-"));
	for (const [name, path] of [
		["ffmpeg", ffmpegPath()],
		["afconvert", "/usr/bin/afconvert"],
	] as const) {
		mkdirSync(join(bins, name));
		symlinkSync(path, join(bins, name, name));
	}
	for (const [name, script] of [
		["fail", "exit 1"],
		["slow", "echo run > out.wav; exec /bin/sleep 20"],
	] as const) {
		mkdirSync(join(bins, name));
		writeFileSync(join(bins, name, "ffmpeg"), `#!/bin/sh\n${script}\n`);
		chmodSync(join(bins, name, "ffmpeg"), 0o755);
	}
	mkdirSync(join(bins, "none"));
	mp3 = execFileSync(ffmpegPath(), [
		...["-loglevel", "error", "-f", "lavfi"],
		...["-i", "sine=frequency=440:duration=0.5", "-f", "mp3", "-"],
	]);
});
afterAll(() => rmSync(bins, { recursive: true, force: true }));
beforeEach(async () => {
	w = studioWorld();
	w.audio = mp3;
	server = await w.serve();
	ws = workspace(server.origin);
	for (const name of ["out", "cut", "tmp"]) mkdirSync(ws.path(name));
});
afterEach(() => {
	server.close();
	ws.remove();
});

const start = (tool: string, args: string[]) => {
	const child = spawn(process.execPath, [cli, ...args, "--json"], {
		cwd: tmpdir(),
		env: {
			...process.env,
			PATH: join(bins, tool),
			OMNI_TTS_CONFIG_DIR: ws.dir,
			TMPDIR: ws.path("tmp"),
		},
	});
	let out = "";
	child.stdout.on("data", (chunk) => {
		out += chunk;
	});
	return {
		child,
		done: new Promise<Run>((done) =>
			child.on("close", (code) => done({ code, out, err: "" })),
		),
	};
};
const body = async (code: number, args: string[], tool = "ffmpeg") => {
	const result = await start(tool, args).done;
	expect([result.code, result.out]).toEqual([
		code,
		expect.stringMatching(/^[^\n]+\n$/),
	]);
	return JSON.parse(result.out);
};
type Line = { speaker: number; text: string; gap?: unknown };
const scene = (lines: Line[], over: object = {}) => ({
	version: 1,
	speakers: [{ name: "가", voice: "fish_audio:fish" }],
	lines,
	model: "s2.1-pro",
	...over,
});
const said = (...gaps: unknown[]): Line[] =>
	gaps.map((gap, i) => ({
		speaker: 0,
		text: `줄 ${i}`,
		...(gap === undefined ? {} : { gap }),
	}));
const file = (value: object) => ws.script(JSON.stringify(value), "scene.json");
const read = (value: object, ...extra: string[]) => [
	...["drama", "read", "--input", file(value), "--out-dir", ws.path("out")],
	...extra,
];
const generate = (value: object, ...extra: string[]) => [
	...["drama", "generate", "--input", file(value)],
	...["--out", ws.path("scene.wav"), ...extra],
];
const autotag = (value: object, ...extra: string[]) => [
	...["drama", "autotag", "--input", file(value)],
	...["--out", ws.path("tagged.json"), ...extra],
];
const gapsOf = (lines: { start: number; end: number }[]) =>
	lines
		.slice(1)
		.map((line, i) => Math.round((line.start - (lines[i]?.end ?? 0)) * RATE));

describe("드라마 쉼: 장면 파일", { timeout: 60_000 }, () => {
	it("read --join은 줄 쉼 → 장면 쉼 → 0.3초 순서로 잇는다", async () => {
		const joined = async (value: object, name: string, ...extra: string[]) =>
			(
				await body(
					0,
					read(
						value,
						"--yes",
						"--join",
						ws.path(name),
						"--overwrite",
						...extra,
					),
				)
			).join;
		const a = await joined(
			scene(said(0, undefined, 2.5, 5), { gap: 1.2 }),
			"a.wav",
		);
		expect(gapsOf(a.lines)).toEqual(
			[0, 1.2, 2.5].map((gap) => gapSamples(gap, RATE)),
		);
		const b = await joined(scene(said(undefined, 0.1, undefined)), "b.wav");
		expect(gapsOf(b.lines)).toEqual(
			[0.3, 0.1].map((gap) => gapSamples(gap, RATE)),
		);
		const c = await joined(
			scene(said(undefined, undefined), { gap: 0 }),
			"c.wav",
		);
		expect(gapsOf(c.lines)).toEqual([gapSamples(0, RATE)]);
		// 고른 줄만 이으면 그 줄 뒤의 쉼을 쓴다
		const d = await joined(
			scene(said(4, 0.5, 0.7)),
			"d.wav",
			...["--only", "1,3"],
		);
		expect(d.lines.map(({ n }: { n: number }) => n)).toEqual([1, 3]);
		expect(gapsOf(d.lines)).toEqual([gapSamples(4, RATE)]);
		// 파일 길이도 맞는다
		const bytes = readFileSync(ws.path("a.wav"));
		expect((bytes.length - 44) / 2 / RATE).toBeCloseTo(a.seconds, 5);
	});

	it("0~5초의 0.1초 단위는 모두 받는다", async () => {
		const tenths = Array.from({ length: 50 }, (_, i) => i / 10);
		await body(0, read(scene(said(...tenths), { gap: 5 }), "--dry-run"));
		await body(0, read(scene(said(5, 4.9), { gap: 0 }), "--dry-run"));
	});

	it.each([[5.1], [0.05], [-1], ["1"], [null], [0.25], [-0.1], [true], [1e9]])(
		"쉼이 %j이면 세 명령 모두 줄 번호와 함께 2이고 만들지 않는다",
		async (gap) => {
			for (const args of [read, generate, autotag]) {
				const line = await body(
					2,
					args(scene([...said(0, gap), ...said(gap)]), "--yes"),
				);
				expect(line).toMatchObject({
					code: "INPUT",
					lines: [
						{ n: 2, reason: "쉼" },
						{ n: 3, reason: "쉼" },
					],
				});
				const whole = await body(2, args(scene(said(0), { gap }), "--yes"));
				expect(whole.message).toContain("gap");
			}
			// 읽기·자동 태그는 남은 줄을 보려고 보관함만 읽는다(T20과 같다)
			expect([...new Set(w.calls)]).toEqual(["savedVoiceList"]);
		},
	);

	it("generate는 쉼을 보내지 않고 지문과 저장 테이크가 그대로다", async () => {
		w.hook = (path, _request, response) => {
			if (path.includes("dramaCreate"))
				response.writeHead = (() => {
					response.destroy();
					return response;
				}) as never;
			return false;
		};
		const plain = scene(said(undefined, undefined));
		const gapped = scene(said(1.5, 0), { gap: 2 });
		const { requestId } = await body(6, generate(plain, "--yes"));
		w.hook = undefined;
		// 같은 기록이라 새로 보내지 않고 그 요청을 받는다
		const again = await body(0, generate(gapped, "--yes"));
		expect(again).toMatchObject({ source: "resumed" });
		expect(w.scenes).toHaveLength(1);
		expect(w.scenes[0]?.requestId).toBe(requestId);
		expect(
			(await body(0, generate(gapped, "--yes", "--overwrite"))).source,
		).toBe("saved");
		await body(0, generate(gapped, "--yes", "--overwrite", "--new"));
		expect(JSON.stringify(w.scenes.at(-1))).not.toContain("gap");
		expect(w.scenes[1]?.request).toEqual(w.scenes[0]?.request);
	});

	it("read의 요청은 쉼이 달라도 같아 저장본을 쓴다", async () => {
		await body(0, read(scene(said(undefined, undefined)), "--yes"));
		const made = w.synth;
		await body(
			0,
			read(scene(said(1, 2), { gap: 3 }), "--join", ws.path("a.wav")),
		);
		expect(w.synth).toBe(made);
		expect(JSON.stringify(w.created)).not.toContain("gap");
	});

	it("autotag는 줄 쉼과 장면 쉼을 그대로 옮긴다", async () => {
		const value = scene(said(0, undefined, 3.4), { gap: 0.9 });
		await body(0, autotag(value, "--yes"));
		const tagged = JSON.parse(readFileSync(ws.path("tagged.json"), "utf8"));
		expect(tagged.gap).toBe(0.9);
		expect(tagged.lines).toEqual([
			{ speaker: 0, direction: "", text: "[laughs] 줄 0", gap: 0 },
			{ speaker: 0, direction: "", text: "[laughs] 줄 1" },
			{ speaker: 0, direction: "", text: "[laughs] 줄 2", gap: 3.4 },
		]);
		expect(JSON.stringify(w.dramaTagged)).not.toContain("gap");
		// 받은 파일을 그대로 다시 쓴다
		await body(0, read(tagged, "--dry-run"));
	});
});

describe("drama split --join", { timeout: 60_000 }, () => {
	// 줄마다 앞뒤에 무음이 있는 1.5초 장면
	const pcm = new Int16Array(RATE * 1.5);
	pcm.fill(9000, RATE * 0.1, RATE * 0.4);
	pcm.fill(-7000, RATE * 0.7, RATE * 0.9);
	pcm.fill(5000, RATE * 1.1, RATE * 1.45);
	const sound = Buffer.from(wavOf(new Uint8Array(pcm.buffer)));
	const spans = [
		[0, 0.5],
		[0.5, 1],
		[1, 1.5],
	].map(
		([from = 0, to = 0]): LineSpan => ({
			start: from,
			end: to,
			cutStart: from,
			cutEnd: to,
		}),
	);
	const take = () =>
		w.take(
			{
				sceneName: "",
				speakers: [
					{ name: "민수", voiceId: "fish" },
					{ name: "Amy", voiceId: "fish2" },
				],
				lines: [
					{ speaker: 0, direction: "", text: "하나" },
					{ speaker: 1, direction: "", text: "둘" },
					{ speaker: 0, direction: "", text: "셋" },
				],
				model: "s2.1-pro",
				settings: { speed: 1, temperature: 0.7 },
			},
			{ audio: sound, segments: spans },
		);
	const NAMES = ["001-민수.wav", "002-Amy.wav", "003-민수.wav"];
	const split = (...extra: string[]) => [
		...["drama", "split", w.takes[0]?.id ?? "", "--out-dir", ws.path("cut")],
		...extra,
	];
	const all = () => ["--join", ws.path("all.wav")];
	// 웹이 쓰는 공용 함수로 만든 같은 파일
	const expected = async (gaps: number[]) => {
		const parts = spans.map((span) => {
			const bytes = Buffer.concat(cutWav(new Uint8Array(sound), span));
			const samples = Float32Array.from(
				{ length: (bytes.length - 44) / 2 },
				(_, i) => bytes.readInt16LE(44 + i * 2) / 32768,
			);
			return pcm16(trimSilence(samples));
		});
		const counts = parts.map((part) => part.length / 2);
		return {
			bytes: Buffer.from(
				await new Blob(
					joinWav(
						parts.map((part) => new Blob([part])),
						gaps,
					),
				).arrayBuffer(),
			),
			spans: spansOf(counts, gaps, RATE),
		};
	};
	const names = () => readdirSync(ws.path("cut")).sort();

	it.each(["ffmpeg", "afconvert"])(
		"%s로 조각의 무음을 줄이고 0.3초 쉼으로 잇는다",
		async (tool) => {
			take();
			const result = await body(0, split(...all()), tool);
			const want = await expected([0.3, 0.3, 0.3]);
			const bytes = readFileSync(ws.path("all.wav"));
			expect(bytes.equals(want.bytes)).toBe(true);
			expect(result.join).toEqual({
				out: ws.path("all.wav"),
				bytes: bytes.length,
				seconds: want.spans.at(-1)?.end,
				lines: want.spans.map((span, i) => ({ n: i + 1, ...span })),
			});
			expect(names()).toEqual(NAMES);
			// 줄 파일은 자른 그대로다
			expect(readFileSync(ws.path(`cut/${NAMES[0]}`))).toEqual(
				Buffer.concat(cutWav(new Uint8Array(sound), spans[0] as LineSpan)),
			);
			expect(result.lines).toHaveLength(3);
		},
	);

	it("--join이 없으면 지금과 같은 칸이고 도구도 보지 않는다", async () => {
		take();
		const result = await body(0, split(), "none");
		expect(Object.keys(result).sort()).toEqual(
			["lines", "origin", "outDir", "resultId"].sort(),
		);
	});

	it("장면 파일의 쉼으로 잇는다", async () => {
		take();
		const value = scene(said(2.2, undefined, 1), { gap: 0.6 });
		await body(0, split(...all(), "--input", file(value)));
		const want = await expected([2.2, 0.6, 1]);
		expect(readFileSync(ws.path("all.wav")).equals(want.bytes)).toBe(true);
		// 장면 쉼도 없으면 0.3초다
		await body(
			0,
			split(
				...["--join", ws.path("b.wav"), "--overwrite"],
				...["--input", file(scene(said(0, undefined, undefined)))],
			),
		);
		const other = await expected([0, 0.3, 0.3]);
		expect(readFileSync(ws.path("b.wav")).equals(other.bytes)).toBe(true);
	});

	it("줄 수가 다르거나 잘못된 장면 파일이면 쓰기 전에 2다", async () => {
		take();
		const two = await body(
			2,
			split(...all(), "--input", file(scene(said(0, 0)))),
		);
		expect(two.message).toContain("줄 수");
		for (const value of [
			scene(said(0, 0, 9)),
			scene(said(0, 0, 0), { gap: -1 }),
			{ version: 2 },
		])
			await body(2, split(...all(), "--input", file(value)));
		await body(2, split(...all(), "--input", ws.script("가: 나", "a.txt")));
		await body(2, split(...all(), "--input", ws.path("없음.json")));
		// --join 없이는 쉼을 쓸 곳이 없다
		await body(2, split("--input", file(scene(said(0, 0, 0)))));
		expect(w.calls).not.toContain("dramaAudio");
		expect(names()).toEqual([]);
		expect(existsSync(ws.path("all.wav"))).toBe(false);
	});

	it("경로와 도구는 쓰기 전에 본다", async () => {
		take();
		writeFileSync(ws.path("있음.wav"), "있음");
		symlinkSync(ws.path("없는 대상"), ws.path("링크.wav"));
		for (const path of ["a.mp3", "있음.wav", "링크.wav", "없는 폴더/a.wav"])
			await body(2, split("--join", ws.path(path)));
		await body(2, split("--join", ws.path("링크.wav"), "--overwrite"));
		expect((await body(7, split(...all()), "none")).message).toContain(
			"ffmpeg",
		);
		expect(w.calls).toEqual([]);
	});

	it.each([
		["같은 이름", `cut/${NAMES[0]}`],
		["대소문자만 다른 이름", "cut/002-AMY.wav"],
		["확장자 대소문자", "cut/002-Amy.WAV"],
		["풀어 쓴 한글", `cut/${NAMES[0]?.normalize("NFD")}`],
		["링크로 본 같은 폴더", `link/${NAMES[2]}`],
	])(
		"줄 파일과 같은 파일이 되는 결합 경로(%s)는 쓰기 전에 2다",
		async (_name, path) => {
			take();
			symlinkSync(ws.path("cut"), ws.path("link"));
			const failed = await body(
				2,
				split("--join", ws.path(path), "--overwrite"),
			);
			expect(failed.message).toContain("--join");
			expect(w.calls).not.toContain("dramaAudio");
			expect(names()).toEqual([]);
		},
	);

	it("풀지 못하면 7이고 파일이 하나도 없다", async () => {
		take();
		expect((await body(7, split(...all()), "fail")).code).toBe("DECODE_FAILED");
		expect(names()).toEqual([]);
		expect(existsSync(ws.path("all.wav"))).toBe(false);
		expect(ws.leftovers()).toEqual([]);
	});

	it("게시하는 동안 결합 경로가 막히면 새로 만든 줄 파일을 지우고 남의 파일은 둔다", async () => {
		const { id } = take();
		w.on.dramaAudio = (_input, next) => {
			writeFileSync(ws.path("all.wav"), "남의 파일");
			return next();
		};
		const failed = await body(7, split(...all()));
		expect(failed.resultId).toBe(id);
		expect(names()).toEqual([]);
		expect(readFileSync(ws.path("all.wav"), "utf8")).toBe("남의 파일");
	});

	it("게시하는 동안 줄 경로가 막히면 결합 파일도 만들지 않는다", async () => {
		take();
		w.on.dramaAudio = (_input, next) => {
			writeFileSync(ws.path(`cut/${NAMES[2]}`), "남의 파일");
			return next();
		};
		await body(7, split(...all()));
		expect(names()).toEqual([NAMES[2]]);
		expect(existsSync(ws.path("all.wav"))).toBe(false);
	});

	it("--overwrite는 줄 파일과 결합 파일을 바꾸고 실패해도 있던 파일을 지우지 않는다", async () => {
		take();
		for (const path of [`cut/${NAMES[0]}`, "all.wav"])
			writeFileSync(ws.path(path), "앞 파일");
		await body(2, split(...all()));
		await body(0, split(...all(), "--overwrite"));
		expect(readFileSync(ws.path("all.wav")).length).toBeGreaterThan(1000);
		w.on.dramaAudio = (_input, next) => {
			rmSync(ws.path("all.wav"), { force: true });
			mkdirSync(ws.path("all.wav"), { recursive: true });
			return next();
		};
		rmSync(ws.path(`cut/${NAMES[1]}`));
		await body(7, split(...all(), "--overwrite"));
		expect(names()).toEqual([NAMES[0], NAMES[2]]);
	});

	it("Ctrl+C로 푸는 중에 멈추면 7이고 파일이 없다", async () => {
		const { id } = take();
		const started = start("slow", split(...all()));
		await until(
			() =>
				readdirSync(ws.path("tmp")).some((name) =>
					existsSync(join(ws.path("tmp"), name, "out.wav")),
				),
			"푸는 중",
		);
		started.child.kill("SIGINT");
		const stopped = await started.done;
		expect(stopped.code).toBe(7);
		expect(JSON.parse(stopped.out).resultId).toBe(id);
		expect(names()).toEqual([]);
		expect(readdirSync(ws.path("tmp"))).toEqual([]);
		expect(existsSync(ws.path("all.wav"))).toBe(false);
	});

	it("도움말에 쉼과 결합을 안내한다", async () => {
		const { out } = await spawnCli(ws.dir, ["--help"]).done;
		expect(out).toContain(
			"omni-tts drama split RESULT_ID --out-dir DIR [--join FILE.wav [--input FILE.json]]",
		);
		expect(out).toContain("gap");
	});
});
