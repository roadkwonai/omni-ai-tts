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
import { ORPCError } from "@orpc/server";
import { wavHeader } from "@tts-pilot-app/api/drama-script";
import { srtTime } from "@tts-pilot-app/api/paragraph-files";
import {
	paragraphRequest,
	type VoiceSetup,
	type Work,
} from "@tts-pilot-app/api/paragraph-script";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { gapSamples } from "@tts-pilot-app/api/sound-join";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";
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
const TONE = 0.5;
const FFMPEG = ffmpegPath();
const AFCONVERT = "/usr/bin/afconvert";
let sounds: string;
// 앞뒤 무음 0.3초 사이에 1초 사인파. 채널·표본율만 다르다
const tone = (name: string, channels: number, rate: number) => {
	const path = join(sounds, name);
	execFileSync(FFMPEG, [
		...["-loglevel", "error", "-y", "-f", "lavfi"],
		...["-i", `sine=frequency=440:sample_rate=${rate}:duration=${TONE * 2}`],
		// 스테레오는 두 채널이 같은 위상·같은 크기다
		...[
			"-af",
			`adelay=300:all=1,apad=pad_dur=0.3${channels === 2 ? ",pan=stereo|c0=c0|c1=c0" : ""}`,
		],
		...["-ar", String(rate), path],
	]);
	return readFileSync(path);
};

let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;
let audio: Record<"mono" | "stereo" | "low" | "wav", Buffer>;
let bins: string;

const setup = (provider: VoiceSetup["provider"], voiceId: string) =>
	({ provider, voiceId, settings: DEFAULT_SETTINGS[provider] }) as VoiceSetup;
const VOICE = setup("typecast", "v1");
const KORE = setup("gemini", "Kore");
const TEXTS = ["[laughs] 하나 <b>", "둘", "셋", "넷\n줄"];
const work = () => ({
	defaultVoice: VOICE,
	gap: 0.5,
	paragraphs: [
		{ id: "a", text: TEXTS[0] ?? "" },
		{ id: "b", text: TEXTS[1] ?? "", gap: 1.23 },
		{ id: "x", text: " " },
		{ id: "c", text: TEXTS[2] ?? "" },
		{ id: "d", text: TEXTS[3] ?? "", voice: KORE },
	],
});
const requestAt = (n: number): StudioRequest => {
	const value = work() as Work;
	const p = value.paragraphs[n - 1];
	const request =
		p && paragraphRequest(p, value, w.voices as never, Date.now());
	if (!request) throw new Error("요청이 없는 문단");
	return request;
};
const saveAll = () => {
	w.add(requestAt(1), { audio: audio.mono });
	w.add(requestAt(2), { audio: audio.stereo });
	w.add(requestAt(4), { audio: audio.low });
	w.add(requestAt(5), { audio: audio.wav });
};
const args = (...extra: string[]) => [
	...["studio", "join", "--work", ws.script(JSON.stringify(work()), "w.json")],
	...["--out", ws.path("out.wav"), "--json", ...extra],
];
// PATH에 고른 도구만 두고 실행한다
const tools = (name: string, script?: Record<string, string>) => {
	const dir = join(bins, name);
	mkdirSync(dir, { recursive: true });
	for (const [tool, body] of Object.entries(script ?? {})) {
		writeFileSync(join(dir, tool), `#!/bin/sh\n${body}\n`);
		chmodSync(join(dir, tool), 0o755);
	}
	return dir;
};
const runWith = (path: string, list: string[], preload?: string) => {
	const child = spawn(
		process.execPath,
		[
			...(preload
				? [`--import=data:text/javascript,${encodeURIComponent(preload)}`]
				: []),
			cli,
			...list,
		],
		{
			cwd: tmpdir(),
			env: { ...process.env, PATH: path, OMNI_TTS_CONFIG_DIR: ws.dir },
		},
	);
	let out = "";
	let err = "";
	child.stdout.on("data", (chunk) => {
		out += chunk;
	});
	child.stderr.on("data", (chunk) => {
		err += chunk;
	});
	return {
		child,
		done: new Promise<Run>((done) =>
			child.on("close", (code) => done({ code, out, err })),
		),
	};
};
const json = (result: { out: string }) => JSON.parse(result.out);
const tempDirs = () =>
	readdirSync(tmpdir()).filter((name) => name.startsWith("omni-tts-join-"));
// 결과가 44.1kHz 16비트 모노 WAV인가
const pcmOf = (path: string) => {
	const bytes = readFileSync(path);
	expect(bytes.toString("latin1", 0, 4)).toBe("RIFF");
	expect(bytes.toString("latin1", 8, 16)).toBe("WAVEfmt ");
	expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
	expect(bytes.readUInt16LE(20)).toBe(1);
	expect(bytes.readUInt16LE(22)).toBe(1);
	expect(bytes.readUInt32LE(24)).toBe(RATE);
	expect(bytes.readUInt16LE(34)).toBe(16);
	expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
	return new Int16Array(
		bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.length),
	);
};

beforeAll(() => {
	sounds = mkdtempSync(join(tmpdir(), "omni-t20-sounds-"));
	bins = mkdtempSync(join(tmpdir(), "omni-t20-bins-"));
	symlinkSync(FFMPEG, join(tools("ffmpeg"), "ffmpeg"));
	symlinkSync(AFCONVERT, join(tools("afconvert"), "afconvert"));
	audio = {
		mono: tone("mono.mp3", 1, 44_100),
		stereo: tone("stereo.mp3", 2, 48_000),
		low: tone("low.mp3", 1, 22_050),
		wav: tone("gemini.wav", 1, 24_000),
	};
});
afterAll(() => {
	rmSync(sounds, { recursive: true, force: true });
	rmSync(bins, { recursive: true, force: true });
});
beforeEach(async () => {
	w = studioWorld();
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});

describe("문단 결합", { timeout: 60_000 }, () => {
	it.each(["ffmpeg", "afconvert"])(
		"MP3(모노·스테레오·다른 표본율)와 WAV를 실제 %s로 풀어 무음을 자르고 쉼을 넣어 잇는다",
		async (tool) => {
			saveAll();
			const result = await runWith(
				join(bins, tool),
				args("--srt", ws.path("out.srt")),
			).done;
			expect(result.err).toBe("");
			expect(result.code).toBe(0);
			const body = json(result);
			const samples = pcmOf(ws.path("out.wav"));
			expect(body.bytes).toBe(44 + samples.length * 2);
			expect(body.seconds).toBeCloseTo(samples.length / RATE, 5);
			expect(body.paragraphs.map((row: { n: number }) => row.n)).toEqual([
				1, 2, 4, 5,
			]);
			// 앞뒤 무음 0.3초씩을 잘라 1초 안팎만 남는다(MP3 부호화 여유 60ms)
			for (const { start, end } of body.paragraphs) {
				expect(end - start).toBeGreaterThan(1);
				expect(end - start).toBeLessThan(1.1);
			}
			// 쉼: 기본 0.5, 문단 쉼 1.23은 웹처럼 1.2로 맞춘다. 마지막 뒤에는 없다
			const gaps = [0.5, 1.2, 0.5];
			gaps.forEach((gap, i) => {
				const at = body.paragraphs[i].end;
				expect(Math.round((body.paragraphs[i + 1].start - at) * RATE)).toBe(
					gapSamples(gap, RATE),
				);
				const from = Math.round(at * RATE);
				expect(
					samples
						.subarray(from, from + gapSamples(gap, RATE))
						.every((value) => value === 0),
				).toBe(true);
			});
			// 440Hz 사인파의 크기가 남아 있다(스테레오 평균도 같은 위상이라 줄지 않는다)
			const peaks = body.paragraphs.map(
				({ start, end }: { start: number; end: number }) =>
					Math.max(
						...samples.subarray(
							Math.round((start + 0.3) * RATE),
							Math.round((end - 0.3) * RATE),
						),
					),
			);
			for (const peak of peaks) {
				expect(peak).toBeGreaterThan(3500);
				expect(peak).toBeLessThan(5000);
			}
			// 자막은 원문에서 태그를 뺀 글과 구간이다
			const cues = body.paragraphs as { start: number; end: number }[];
			expect(readFileSync(ws.path("out.srt"), "utf8")).toBe(
				["하나", "둘", "셋", "넷 줄"]
					.map(
						(text, i) =>
							`${i + 1}\n${srtTime(cues[i]?.start ?? 0)} --> ${srtTime(cues[i]?.end ?? 0)}\n${text}\n`,
					)
					.join("\n"),
			);
			expect(w.synth).toBe(0);
			expect(w.calls).not.toContain("studioCreate");
			expect(ws.leftovers()).toEqual([]);
		},
	);

	it("PATH에 둘 다 있으면 ffmpeg를 쓰고, 실패해도 afconvert로 넘어가지 않는다", async () => {
		saveAll();
		// 결과를 남기고도 실패로 끝난다
		const dir = tools("bad", { ffmpeg: `${FFMPEG} "$@"; exit 1` });
		const result = await runWith(
			`${dir}:${join(bins, "afconvert")}`,
			args("--srt", ws.path("out.srt")),
		).done;
		expect(result.code).toBe(7);
		expect(json(result).code).toBe("DECODE_FAILED");
		expect(json(result).message).toContain("ffmpeg");
		expect(existsSync(ws.path("out.wav"))).toBe(false);
		expect(existsSync(ws.path("out.srt"))).toBe(false);
		expect(ws.leftovers()).toEqual([]);
	});

	it("도구가 없으면 7과 설치 안내다", async () => {
		saveAll();
		const result = await runWith(tools("none"), args()).done;
		expect(result.code).toBe(7);
		expect(json(result).message).toContain("ffmpeg를 설치");
		expect(existsSync(ws.path("out.wav"))).toBe(false);
	});

	it.each([
		["0샘플", () => wavHeader(0)],
		["잘린 WAV", (data: Buffer) => data.subarray(0, data.length / 2)],
		["WAV가 아닌 것", () => Buffer.alloc(5000, 7)],
	])("풀 수 없는 입력(%s)이면 파일 0개와 7이다", async (_name, cut) => {
		saveAll();
		const row = w.rows.at(-1);
		if (row) row.audio = Buffer.from(cut(audio.wav));
		for (const tool of ["ffmpeg", "afconvert"]) {
			const result = await runWith(join(bins, tool), args()).done;
			expect(result.code).toBe(7);
			expect(json(result).message).toContain("4번째");
			expect(existsSync(ws.path("out.wav"))).toBe(false);
		}
		expect(ws.leftovers()).toEqual([]);
	});

	it("잘려 풀리지 않는 MP3는 파일 0개와 7이다", async () => {
		saveAll();
		const row = w.rows[0];
		if (row) row.audio = Buffer.from(audio.mono.subarray(0, 20));
		for (const tool of ["ffmpeg", "afconvert"]) {
			const result = await runWith(join(bins, tool), args()).done;
			expect(result.code).toBe(7);
			expect(existsSync(ws.path("out.wav"))).toBe(false);
		}
	});

	it("길이가 다르게 온 조각은 파일 0개와 7이다", async () => {
		saveAll();
		w.on.studioAudio = async (_input, next) => {
			const part: File = await next();
			return new File([part.slice(0, part.size - 1)], "a", { type: part.type });
		};
		const result = await runWith(join(bins, "ffmpeg"), args()).done;
		expect(result.code).toBe(7);
		expect(json(result).resultId).toBe(w.rows[0]?.id);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
	});

	it("출력 크기 상한과 시간 제한을 넘으면 7이다", async () => {
		saveAll();
		// 머리는 올바른 32비트 실수 WAV이고 크기만 상한을 넘는다
		const head = Buffer.from(wavHeader(600 * 1024 * 1024 - 44));
		head.writeUInt16LE(3, 20);
		head.writeUInt16LE(32, 34);
		writeFileSync(ws.path("head"), head);
		const big = tools("big", {
			ffmpeg: `/bin/cp '${ws.path("head")}' out.wav; /usr/bin/truncate -s 600m out.wav`,
		});
		const large = await runWith(big, args()).done;
		expect(large.code).toBe(7);
		const slow = tools("slow", { ffmpeg: "exec /bin/sleep 30" });
		const started = Date.now();
		const late = await runWith(
			slow,
			args(),
			"const real=globalThis.setTimeout;globalThis.setTimeout=(f,ms,...a)=>real(f,ms===60000?200:ms,...a);",
		).done;
		expect(late.code).toBe(7);
		expect(Date.now() - started).toBeLessThan(10_000);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
	});

	it.each(["ffmpeg", "afconvert"])(
		"%s가 푸는 동안 출력이 상한을 넘으면 끝나기를 기다리지 않고 멈춘다",
		async (tool) => {
			saveAll();
			// 자리만 차지하지 않는 큰 파일을 만들고 계속 돈다
			const grow = tools(`grow-${tool}`, {
				[tool]: "/usr/bin/truncate -s 600m out.wav; exec /bin/sleep 30",
			});
			const started = Date.now();
			const result = await runWith(grow, args()).done;
			expect(result.code).toBe(7);
			expect(json(result).code).toBe("DECODE_FAILED");
			expect(Date.now() - started).toBeLessThan(10_000);
			expect(existsSync(ws.path("out.wav"))).toBe(false);
		},
	);

	it("Ctrl+C는 자식을 끝내고 임시 폴더와 게시 전 파일을 지운다", async () => {
		saveAll();
		const pid = ws.path("pid");
		const slow = tools("wait", {
			ffmpeg: `echo $$ > '${pid}'\nexec /bin/sleep 60`,
		});
		const before = tempDirs();
		const started = runWith(slow, args());
		await until(() => existsSync(pid) && readFileSync(pid).length > 1, "도구");
		started.child.kill("SIGINT");
		expect((await started.done).code).toBe(2);
		const alive = () => {
			try {
				process.kill(Number(readFileSync(pid, "utf8")), 0);
				return true;
			} catch {
				return false;
			}
		};
		await until(() => !alive(), "자식 종료");
		expect(tempDirs().filter((name) => !before.includes(name))).toEqual([]);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
		expect(ws.leftovers()).toEqual([]);
	});

	it("임시 폴더는 0700이고 끝나면 지운다", async () => {
		saveAll();
		const seen = ws.path("seen");
		const spy = tools("spy", {
			ffmpeg: `/usr/bin/stat -f '%Lp %N' "$PWD" > '${seen}'\necho "$@" >> '${seen}'\nexec ${FFMPEG} "$@"`,
		});
		const before = tempDirs();
		expect((await runWith(spy, args()).done).code).toBe(0);
		const text = readFileSync(seen, "utf8");
		expect(text).toMatch(/^700 /);
		expect(text).toContain("-nostdin");
		expect(text).toContain("-protocol_whitelist file,pipe -f wav -i in.wav");
		expect(tempDirs().filter((name) => !before.includes(name))).toEqual([]);
	});

	it("만들지 않은 문단은 번호를 보이고 4, 생성 0회다", async () => {
		w.add(requestAt(1), { audio: audio.mono });
		w.add(requestAt(4), { status: "unknown" });
		const result = await spawnCli(ws.dir, args()).done;
		expect(result.code).toBe(4);
		expect(json(result)).toMatchObject({
			code: "NOT_MADE",
			paragraphs: [{ n: 2 }, { n: 4 }, { n: 5 }],
		});
		expect(w.synth).toBe(0);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
		// 고른 문단만 본다
		const only = await spawnCli(ws.dir, args("--only", "1,3")).done;
		expect(only.code).toBe(0);
		expect(json(only).paragraphs).toHaveLength(1);
	});

	it("빈 문단뿐이면 2다", async () => {
		expect((await spawnCli(ws.dir, args("--only", "3")).done).code).toBe(2);
	});

	it("출력 경로를 먼저 보고, 자막이 실패하면 WAV는 남고 7이다", async () => {
		saveAll();
		writeFileSync(ws.path("out.wav"), "있음");
		const taken = await spawnCli(ws.dir, args()).done;
		expect(taken.code).toBe(2);
		for (const extra of [
			["--srt", ws.path("a.txt")],
			["--srt", ws.path("없음/a.srt")],
		])
			expect(
				(await spawnCli(ws.dir, args("--overwrite", ...extra)).done).code,
			).toBe(2);
		expect(w.calls).toEqual([]);
		expect(readFileSync(ws.path("out.wav"), "utf8")).toBe("있음");
		// WAV를 게시하는 사이 자막 자리에 폴더가 생겼다
		w.on.studioAudio = (_input, next) => {
			mkdirSync(ws.path("late.srt"), { recursive: true });
			return next();
		};
		const late = await runWith(
			join(bins, "ffmpeg"),
			args("--overwrite", "--srt", ws.path("late.srt")),
		).done;
		expect(late.code).toBe(7);
		expect(json(late)).toMatchObject({ out: ws.path("out.wav") });
		expect(pcmOf(ws.path("out.wav")).length).toBeGreaterThan(RATE);
	});

	it("서버 오류는 5이고 파일이 없다", async () => {
		saveAll();
		w.on.studioInfo = () => {
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		};
		const result = await spawnCli(ws.dir, args()).done;
		expect(result.code).toBe(5);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
	});
});
