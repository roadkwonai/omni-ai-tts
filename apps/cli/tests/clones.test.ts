import { execFileSync, spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { ORPCError } from "@orpc/server";
import { wavHeader } from "@tts-pilot-app/api/drama-script";
import {
	GEMINI_CONSENT_SENTENCE,
	myVoiceCreateInputSchema,
} from "@tts-pilot-app/api/my-voice-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	COOKIE,
	cloneWav,
	extensible,
	ffmpegPath,
	type serve,
	spawnCli,
	spawnTty,
	studioWorld,
	until,
	withMeta,
	workspace,
} from "./harness.js";

const NAME = "비밀 이름";
const NONE = "00000000-0000-4000-8000-000000000000";
const RATE = 24_000;
let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;

beforeEach(async () => {
	w = studioWorld();
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});

const run = (...args: string[]) => spawnCli(ws.dir, args).done;
const source = (bytes: Buffer = cloneWav(12 * RATE), name = "원본.wav") =>
	ws.script(bytes, name);
const consent = (bytes: Buffer = cloneWav(3 * RATE)) =>
	ws.script(bytes, "동의.wav");
// 조건만 뺀 만들기. file을 주지 않으면 12초 원본이다
const bare = (provider: string, file: string, ...extra: string[]) => [
	...["clones", "create", "--provider", provider],
	...["--name", NAME, "--source", file, ...extra],
];
const fish = (...extra: string[]) =>
	bare("fish_audio", source(), "--consent", ...extra);
const gemini = (...extra: string[]) =>
	bare(
		...(["gemini", source(), "--consent", "--consent-audio"] as const),
		...[consent(), ...extra],
	);
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const body = async (code: number, ...args: string[]) => {
	const result = await run(...args, "--json");
	expect([result.code, result.out, result.err]).toEqual([
		code,
		expect.anything(),
		expect.anything(),
	]);
	return json(result);
};
const count = (name: string) => w.calls.filter((item) => item === name).length;
const reject = (code: string, reason?: string, retryAt?: string) => () => {
	throw new ORPCError(code, {
		data: reason ? { provider: "fish_audio", reason, retryAt } : undefined,
	});
};
// 서버는 처리했고 응답만 끊긴다
const lose = (name = "myVoiceCreate") => {
	w.hook = (path, _request, response) => {
		if (path.includes(name))
			response.writeHead = (() => {
				response.destroy();
				return response;
			}) as never;
		return false;
	};
};

describe("클론 만들기", { timeout: 60_000 }, () => {
	it("Fish Audio: 소리 바이트 그대로(부가 정보는 닿지 않음) 한 번 보내고 REF를 알리고 기록을 지운다", async () => {
		const made = await body(0, ...fish("--yes"));
		const [row] = w.clones;
		expect(made).toMatchObject({
			origin: server.origin,
			source: "created",
			clone: {
				id: row.id,
				provider: "fish_audio",
				name: NAME,
				status: "ready",
				ref: `fish_audio:clone-${row.id}`,
			},
		});
		expect(w.cloned).toMatchObject([
			{ provider: "fish_audio", name: NAME, consent: true },
		]);
		const [sent] = w.cloned;
		expect(sent.source).toMatchObject({
			name: "source.wav",
			type: "audio/wav",
		});
		expect(sent.source.bytes.equals(readFileSync(source()))).toBe(true);
		expect(sent.consentAudio).toBeUndefined();
		expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(ws.records()).toEqual([]);
		// 받는 파일이 없다
		expect(w.calls).not.toContain("studioAudio");
	});

	it("Gemini: 원본과 동의 녹음을 정해진 이름으로 보낸다", async () => {
		const made = await body(0, ...gemini("--yes"));
		expect(made.clone.ref).toBe(`gemini:clone-${w.clones[0].id}`);
		const [sent] = w.cloned;
		expect(sent.source.bytes.equals(readFileSync(source()))).toBe(true);
		expect(sent.consentAudio).toMatchObject({ name: "consent.wav" });
		expect(sent.consentAudio.bytes.equals(cloneWav(3 * RATE))).toBe(true);
	});

	it("사람용 출력에 상태·ID·REF가 있다", async () => {
		const { code, out, err } = await run(...fish("--yes"));
		expect(code).toBe(0);
		expect(out).toContain(w.clones[0].id);
		expect(out).toContain("사용 가능");
		expect(out).toContain(`fish_audio:clone-${w.clones[0].id}`);
		// 확인을 건너뛰어도 고지는 보인다
		for (const text of ["보낼 것", "가는 곳", "보관", "되돌리기", "요금"])
			expect(err).toContain(text);
	});

	it("처리 중이면 0이고 REF가 없으며 clones check를 안내한다", async () => {
		w.cloneMade = { status: "processing" };
		const made = await body(0, ...fish("--yes"));
		expect(made.clone).toMatchObject({ status: "processing", ref: null });
		expect(ws.records()).toEqual([]);
		w.clones = [];
		const text = await run(...fish("--yes"));
		expect(text.out).toContain("처리 중");
		expect(text.out).toContain("clones check");
	});

	it("품질 실패는 기록을 풀고 5이며 사유와 ID, clones remove를 알린다", async () => {
		w.cloneMade = { status: "failed", reason: "quality" };
		const failed = await body(5, ...fish("--yes"));
		expect(failed).toMatchObject({
			code: "CREATE_FAILED",
			reason: "quality",
			cloneId: w.clones[0].id,
		});
		expect(failed.message).toContain("품질");
		expect(failed.message).toContain("clones remove");
		expect(ws.records()).toEqual([]);
		// 실패한 줄은 다음 만들기를 막지 않는다
		w.cloneMade = {};
		await body(0, ...fish("--yes"));
		expect(w.cloned).toHaveLength(2);
	});

	it.each(["constructor", null])(
		"모르는 실패 사유(%s)는 사유 없이 5다",
		async (reason) => {
			w.cloneMade = { status: "failed", reason };
			const failed = await body(5, ...fish("--yes"));
			expect(failed.reason).toBeUndefined();
			expect(failed.cloneId).toBe(w.clones[0].id);
		},
	);

	it("--consent가 없으면 --yes·--dry-run·터미널이어도 2이고 동의 문장과 고지를 보인다", async () => {
		for (const [provider, label] of [
			["fish_audio", "Fish Audio"],
			["gemini", "Gemini"],
		] as const)
			for (const extra of [["--yes"], ["--dry-run"], ["--yes", "--new"]]) {
				const audio =
					provider === "gemini" ? ["--consent-audio", consent()] : [];
				const result = await run(
					...bare(provider, source(), ...audio, ...extra, "--json"),
				);
				expect(result.code).toBe(2);
				expect(json(result).code).toBe("CONSENT_REQUIRED");
				expect(result.err).toContain(
					`제 목소리이고, ${label}에 보내 클론을 만드는 데 동의합니다`,
				);
				for (const text of ["보낼 것", "가는 곳", "보관", "되돌리기", "요금"])
					expect(result.err).toContain(text);
				expect(result.err.includes(GEMINI_CONSENT_SENTENCE)).toBe(
					provider === "gemini",
				);
			}
		const tty = spawnTty(ws.dir, bare("fish_audio", source()));
		const { code, out } = await tty.done;
		expect(code).toBe(2);
		expect(out).not.toContain("[y/N]");
		// 연결하지 않는다
		expect(w.calls).toEqual([]);
		expect(existsSync(ws.requestsPath)).toBe(false);
	});

	it("--yes 없는 비대화는 2이고 보내지 않는다. 무료 구분이 없다", async () => {
		for (const args of [fish(), gemini()])
			expect((await body(2, ...args)).code).toBe("CONFIRM_REQUIRED");
		expect(w.cloned).toEqual([]);
		expect(existsSync(ws.requestsPath)).toBe(false);
	});

	it("터미널에서 y만 보낸다", async () => {
		for (const [answer, code, made] of [
			["n\r", 2, 0],
			["\r", 2, 0],
			["y\r", 0, 1],
		] as const) {
			const tty = spawnTty(ws.dir, fish());
			await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
			tty.write(answer);
			expect([answer, (await tty.done).code]).toEqual([answer, code]);
			expect(w.cloned).toHaveLength(made);
		}
	});

	it("확인하는 사이 파일이 바뀌어도 처음 읽은 바이트를 보낸다", async () => {
		const file = source();
		const first = readFileSync(file);
		const tty = spawnTty(ws.dir, fish());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		const swap = ws.script(cloneWav(20 * RATE, { amp: 100 }), "바뀐.wav");
		renameSync(swap, file);
		tty.write("y\r");
		expect((await tty.done).code).toBe(0);
		expect(w.cloned[0].source.bytes.equals(first)).toBe(true);
	});

	it("--dry-run은 아무것도 보내지 않고 검사 결과를 알린다", async () => {
		const dry = await body(0, ...gemini("--dry-run"));
		expect(dry).toMatchObject({
			origin: server.origin,
			dryRun: true,
			request: {
				provider: "gemini",
				source: { bytes: 576_044, seconds: 12 },
				consentAudio: { bytes: 144_044, seconds: 3 },
			},
			saved: null,
			requestId: null,
			needsConfirm: true,
		});
		expect(dry).not.toHaveProperty("estimate");
		expect(JSON.stringify(dry)).not.toContain(NAME);
		const text = await run(...fish("--dry-run"));
		expect(text.code).toBe(0);
		expect(text.out).toContain("보낼 것");
		expect(w.cloned).toEqual([]);
		expect(existsSync(ws.requestsPath)).toBe(false);
	});

	it("공급자 키가 없으면 --new·--dry-run이어도 만들기 전에 5(no_key)다", async () => {
		w.cloneProviders.fish_audio = false;
		for (const extra of [["--yes"], ["--yes", "--new"], ["--dry-run"]])
			expect(await body(5, ...fish(...extra))).toMatchObject({
				code: "SERVER_ERROR",
				reason: "no_key",
			});
		expect(w.cloned).toEqual([]);
		expect(existsSync(ws.requestsPath)).toBe(false);
		// 다른 공급자는 만든다
		await body(0, ...gemini("--yes"));
	});

	it("기록에 오디오·이름·쿠키가 없고 출력에 쿠키가 없다", async () => {
		w.on.myVoiceCreate = () => new Promise(() => {});
		const started = spawnCli(ws.dir, gemini("--yes", "--json"));
		await until(() => count("myVoiceCreate") === 1, "만들기 요청");
		const text = readFileSync(ws.requestsPath, "utf8");
		expect(ws.records()).toMatchObject([
			{ provider: "gemini", kind: "clones", origin: server.origin },
		]);
		expect(Object.keys(ws.records()[0] ?? {}).sort()).toEqual(
			["createdAt", "kind", "origin", "provider", "requestId"].sort(),
		);
		expect(text).not.toContain(NAME);
		expect(text).not.toContain("wav");
		started.child.kill("SIGINT");
		const { out, err } = await started.done;
		expect(out + err).not.toContain(COOKIE);
		expect(out).not.toContain(NAME);
	});
});

describe("클론 입력 검사", { timeout: 60_000 }, () => {
	// 검사에 걸리면 연결하지 않는다
	const bad = async (args: string[], text?: string) => {
		const result = await run(...args, "--json");
		expect([args.at(-1), result.code]).toEqual([args.at(-1), 2]);
		const failed = json(result);
		expect(failed.code).toBe("INPUT");
		if (text) expect(failed.message).toContain(text);
		expect(failed.message).not.toContain(NAME);
		expect(w.calls).toEqual([]);
		expect(existsSync(ws.requestsPath)).toBe(false);
		return failed;
	};
	const give = (bytes: Buffer, provider = "fish_audio") =>
		provider === "gemini"
			? bare(
					...(["gemini", source(bytes), "--consent-audio"] as const),
					...[consent(), "--consent", "--yes"],
				)
			: bare("fish_audio", source(bytes), "--consent", "--yes");
	const giveConsent = (bytes: Buffer) =>
		bare(
			...(["gemini", source(), "--consent-audio"] as const),
			...[consent(bytes), "--consent", "--yes"],
		);

	it("원본 3,000,000바이트는 되고 한 바이트 넘으면 2다", async () => {
		await bad(give(cloneWav(60 * RATE, { size: 3_000_001 })), "큽니다");
		await body(0, ...give(cloneWav(60 * RATE, { size: 3_000_000 })));
		expect(w.cloned[0].source.bytes.equals(cloneWav(60 * RATE))).toBe(true);
	});
	it("동의 녹음 1,000,000바이트는 되고 한 바이트 넘으면 2다", async () => {
		await bad(
			giveConsent(cloneWav(20 * RATE, { size: 1_000_001 })),
			"1,000,000바이트",
		);
		await body(0, ...giveConsent(cloneWav(20 * RATE, { size: 1_000_000 })));
		expect(w.cloned[0].consentAudio.bytes.equals(cloneWav(20 * RATE))).toBe(
			true,
		);
	});
	it("크기 상한이 서버 계약과 같다", () => {
		const { source: s, consentAudio: c } = myVoiceCreateInputSchema.shape;
		const file = (size: number) => new File([new Uint8Array(size)], "a");
		expect(s.safeParse(file(3_000_000)).success).toBe(true);
		expect(s.safeParse(file(3_000_001)).success).toBe(false);
		expect(c.safeParse(file(1_000_000)).success).toBe(true);
		expect(c.safeParse(file(1_000_001)).success).toBe(false);
	});

	it.each([
		["fish_audio", 10],
		["fish_audio", 60],
		["gemini", 10],
		["gemini", 30],
	])("%s 원본 %i초 경계", async (provider, seconds) => {
		const over = seconds === 10 ? -1 : 1;
		await bad(give(cloneWav(seconds * RATE + over), provider), "원본");
		await body(0, ...give(cloneWav(seconds * RATE), provider));
	});
	it.each([
		[1, -1],
		[20, 1],
	])("동의 녹음 %i초 경계", async (seconds, over) => {
		await bad(giveConsent(cloneWav(seconds * RATE + over)), "동의 녹음");
		await body(0, ...giveConsent(cloneWav(seconds * RATE)));
	});

	it("무음(−50dBFS 미만)은 원본과 동의 녹음 모두 2이고 경계는 된다", async () => {
		// 32768 × 10^(-50/20) = 103.6
		await bad(give(cloneWav(12 * RATE, { amp: 103 })), "원본");
		await bad(give(cloneWav(12 * RATE, { amp: -103 })), "소리");
		await bad(giveConsent(cloneWav(3 * RATE, { amp: 0 })), "동의 녹음");
		await bad(giveConsent(cloneWav(3 * RATE, { amp: 103 })), "동의 녹음");
		await body(0, ...give(cloneWav(12 * RATE, { amp: -104 })));
		await body(0, ...giveConsent(cloneWav(3 * RATE, { amp: 104 })));
	});
	it("data 조각 밖의 글자는 소리로 세지 않는다", async () => {
		const quiet = cloneWav(12 * RATE, { amp: 0 });
		// fmt와 data 사이에 큰 값의 LIST 조각(홀수 길이라 채움 1바이트)
		const list = Buffer.concat([
			Buffer.from("LIST"),
			Buffer.from([5, 0, 0, 0]),
			Buffer.alloc(6, 0x7f),
		]);
		const withList = (wav: Buffer) =>
			Buffer.concat([wav.subarray(0, 36), list, wav.subarray(36)]);
		await bad(give(withList(quiet)), "소리");
		await body(0, ...give(withList(cloneWav(12 * RATE))));
		expect(w.cloned[0].source.bytes.equals(cloneWav(12 * RATE))).toBe(true);
	});
	it("원본·동의 녹음 모두 소리만 새 머리로 싸서 보내고 홀수 바이트를 버린다", async () => {
		const args = giveConsent(withMeta(cloneWav(3 * RATE)));
		source(withMeta(cloneWav(12 * RATE)));
		await body(0, ...args);
		const [sent] = w.cloned;
		expect(sent.source.bytes.equals(cloneWav(12 * RATE))).toBe(true);
		expect(sent.consentAudio.bytes.equals(cloneWav(3 * RATE))).toBe(true);
		// data가 홀수 길이면 마지막 샘플 반쪽은 소리가 아니다
		const odd = Buffer.concat([cloneWav(12 * RATE), Buffer.from([1])]);
		odd.writeUInt32LE(12 * RATE * 2 + 1, 40);
		await body(0, ...give(odd), "--new");
		expect(w.cloned[1].source.bytes.equals(cloneWav(12 * RATE))).toBe(true);
	});
	it("고지와 dry-run의 크기는 보내는 크기다", async () => {
		const dry = await body(
			0,
			...give(withMeta(cloneWav(12 * RATE))),
			"--dry-run",
		);
		expect(dry.request.source.bytes).toBe(576_044);
	});

	it.each([
		["빈 파일", Buffer.alloc(0)],
		["글 파일", Buffer.from("글입니다".repeat(100))],
		["44.1kHz", cloneWav(11 * 44_100, { rate: 44_100 })],
		["잘린 WAV", cloneWav(12 * RATE).subarray(0, 500_000)],
		["데이터 없음", cloneWav(12 * RATE).subarray(0, 36)],
	])("형식이 틀리면(%s) 2이고 변환 명령을 안내한다", async (_name, bytes) => {
		const failed = await bad(give(bytes), "ffmpeg");
		expect(failed.message).toContain("afconvert");
		expect(failed.message).toContain("원본.wav");
		const consented = await bad(giveConsent(bytes), "동의 녹음");
		expect(consented.message).toContain("동의.wav");
		expect(consented.message).not.toContain("원본.wav");
	});
	it("스테레오와 8비트는 2다", async () => {
		const stereo = cloneWav(12 * RATE);
		stereo.writeUInt16LE(2, 22);
		await bad(give(stereo));
		const eight = cloneWav(12 * RATE);
		eight.writeUInt16LE(8, 34);
		await bad(give(eight));
	});
	it("확장형 머리(0xFFFE)는 하위 형식이 PCM이면 일반 머리로 바꿔 보낸다", async () => {
		// 무음·길이 검사는 그대로다
		await bad(give(extensible(cloneWav(12 * RATE, { amp: 0 }))), "소리");
		await bad(give(extensible(cloneWav(10 * RATE - 1))), "짧습니다");
		const plain = cloneWav(12 * RATE);
		await body(0, ...give(extensible(plain)));
		expect(w.cloned[0].source.bytes.equals(plain)).toBe(true);
		await body(0, ...giveConsent(extensible(cloneWav(3 * RATE))));
		expect(w.cloned[1].consentAudio.bytes.equals(cloneWav(3 * RATE))).toBe(
			true,
		);
	});
	it.each<[string, (wav: Buffer) => Buffer]>([
		["하위 형식이 실수", (wav) => extensible(wav, 3)],
		["하위 형식이 A-law", (wav) => extensible(wav, 6)],
		[
			"하위 형식의 나머지가 다름",
			(wav) => {
				const bytes = extensible(wav);
				bytes[59] = 0;
				return bytes;
			},
		],
		[
			"확장형인데 fmt가 16바이트",
			(wav) => {
				const bytes = Buffer.from(wav);
				bytes.writeUInt16LE(0xfffe, 20);
				return bytes;
			},
		],
		[
			// 하위 형식 자리의 값이 다른 조각의 것이다
			"fmt 뒤의 조각이 하위 형식처럼 보임",
			(wav) => {
				const bytes = extensible(wav);
				bytes.writeUInt32LE(16, 16);
				bytes.writeUInt32LE(16, 40);
				return bytes;
			},
		],
		[
			"유효 비트가 16이 아님",
			(wav) => {
				const bytes = extensible(wav);
				bytes.writeUInt16LE(12, 38);
				return bytes;
			},
		],
		[
			"확장형 스테레오",
			(wav) => {
				const bytes = extensible(wav);
				bytes.writeUInt16LE(2, 22);
				return bytes;
			},
		],
		["확장형 44.1kHz", () => extensible(cloneWav(60_000, { rate: 44_100 }))],
		[
			"블록 크기 어긋남",
			(wav) => {
				const bytes = Buffer.from(wav);
				bytes.writeUInt16LE(4, 32);
				return bytes;
			},
		],
		["잘린 fmt", (wav) => extensible(wav).subarray(0, 40)],
		["잘린 data", (wav) => extensible(wav).subarray(0, 100_000)],
		[
			"data가 fmt보다 앞",
			(wav) =>
				Buffer.concat([
					...[wav.subarray(0, 12), wav.subarray(36), wav.subarray(12, 36)],
				]),
		],
	])("%s이면 2이고 변환 명령을 안내한다", async (_name, change) => {
		await bad(give(change(cloneWav(12 * RATE))), "ffmpeg");
		await bad(giveConsent(change(cloneWav(3 * RATE))), "동의.wav");
	});

	it("크기 초과에도 변환 명령을 안내한다", async () => {
		const big = cloneWav(60 * RATE, { size: 3_000_001 });
		const source = (await bad(give(big), "3,000,000바이트")).message;
		for (const text of ["ffmpeg", "afconvert", "원본.wav"])
			expect(source).toContain(text);
		const audio = (await bad(giveConsent(big), "1,000,000바이트")).message;
		for (const text of ["ffmpeg", "afconvert", "동의.wav"])
			expect(audio).toContain(text);
	});

	// afconvert는 모노 m4a에서만 확장형 머리를 쓴다(스테레오와 mp3는 일반 머리)
	it.each([
		["m4a", "1", 0xfffe],
		["m4a", "2", 1],
		["mp3", "2", 1],
	] as const)(
		"안내한 변환 명령의 결과를 받는다(%s, %s채널)",
		async (type, channels, tag) => {
			const raw = ws.path(`raw.${type}`);
			execFileSync(ffmpegPath(), [
				...["-nostdin", "-loglevel", "error", "-f", "lavfi"],
				...["-i", "sine=frequency=440:duration=12", "-ac", channels, raw],
			]);
			const { message } = await bad(
				bare("fish_audio", raw, "--consent", "--yes"),
			);
			const commands = (message as string).match(
				/(ffmpeg|afconvert) .+?원본\.wav/g,
			);
			expect(commands).toHaveLength(2);
			for (const [i, command] of (commands ?? []).entries()) {
				const out = ws.path(`변환${i}.wav`);
				const [tool = "", ...args] = command
					.trim()
					.split(" ")
					.map((word) =>
						word === "녹음파일" ? raw : word === "원본.wav" ? out : word,
					);
				execFileSync(tool, args, { stdio: "ignore" });
				if (tool === "afconvert")
					expect(readFileSync(out).readUInt16LE(20)).toBe(tag);
				await body(
					0,
					...bare("fish_audio", out, "--consent", "--yes", "--new"),
				);
				// 보낸 것은 늘 일반 PCM 머리 44바이트와 소리다
				const { bytes } = w.cloned.at(-1).source;
				expect(
					bytes.subarray(0, 44).equals(wavHeader(bytes.length - 44, RATE)),
				).toBe(true);
				expect(readFileSync(out).includes(bytes.subarray(44))).toBe(true);
			}
		},
	);

	it("Gemini는 동의 녹음이 있어야 하고 읽을 문장을 알린다. Fish Audio에 주면 2다", async () => {
		await bad(
			bare("gemini", source(), "--consent", "--yes"),
			GEMINI_CONSENT_SENTENCE,
		);
		await bad(
			bare(
				...(["fish_audio", source(), "--consent"] as const),
				...["--yes", "--consent-audio", consent()],
			),
			"Fish Audio",
		);
	});

	it("이름은 정리한 뒤 1~30 코드 포인트다", async () => {
		const named = (name: string) =>
			fish("--yes", "--new").map((arg) => (arg === NAME ? name : arg));
		await bad(named("가".repeat(31)), "30");
		await bad(named("😀".repeat(31)), "30");
		await bad(named("  ​ "), "이름");
		await bad(named("a".repeat(1001)));
		await body(0, ...named("😀".repeat(30)));
		await body(0, ...named(`  ${"가".repeat(15)}\t\n ${"나".repeat(14)} `));
		expect(w.cloned.map((item) => item.name)).toEqual([
			"😀".repeat(30),
			`${"가".repeat(15)} ${"나".repeat(14)}`,
		]);
	});

	it("일반 파일이 아니면 2다. 일반 파일을 가리키는 링크는 된다", async () => {
		const at = (file: string) => bare("fish_audio", file, "--consent", "--yes");
		mkdirSync(ws.path("폴더"));
		execFileSync("/usr/bin/mkfifo", [ws.path("파이프")]);
		symlinkSync(ws.path("폴더"), ws.path("폴더 링크"));
		symlinkSync(ws.path("파이프"), ws.path("파이프 링크"));
		symlinkSync(ws.path("없음"), ws.path("끊긴 링크"));
		for (const name of [
			...["폴더", "파이프", "폴더 링크", "파이프 링크", "끊긴 링크", "없음"],
		])
			await bad(at(ws.path(name)), "일반 파일");
		await bad(at("/dev/zero"), "일반 파일");
		source();
		symlinkSync(ws.path("원본.wav"), ws.path("링크.wav"));
		await body(0, ...at(ws.path("링크.wav")));
		expect(w.cloned[0].source.bytes.equals(cloneWav(12 * RATE))).toBe(true);
	});

	it("옵션을 검사한다", async () => {
		const without = (name: string) => {
			const args = fish("--yes");
			args.splice(args.indexOf(name), 2);
			return args;
		};
		for (const name of ["--provider", "--name", "--source"])
			await bad(without(name), name);
		for (const provider of ["typecast", "elevenlabs", "airy", "x"])
			await bad(bare(provider, source(), "--consent", "--yes"));
		await bad(fish("--yes", "--out", "a.wav"), "--out");
		await bad(["clones", "check"]);
		await bad(["clones", "check", "글"]);
		await bad(["clones", "remove", "글", "--yes"]);
		await bad(["clones", "resume", "글"]);
		await bad(["clones", "list", "--yes"]);
	});

	it("도움말에 클론 명령을 안내한다", async () => {
		const { out } = await run("--help");
		for (const name of ["list", "create", "check", "save", "remove", "resume"])
			expect(out).toContain(`omni-tts clones ${name}`);
		expect(out).toContain(GEMINI_CONSENT_SENTENCE);
	});
});

describe("클론 두 번 만들기 막기", { timeout: 60_000 }, () => {
	it("같은 명령을 다시 실행하면 2(CONFLICT, ID)이고 보내지 않는다", async () => {
		await body(0, ...fish("--yes"));
		for (const extra of [["--yes"], ["--dry-run"], []])
			expect(await body(2, ...fish(...extra))).toMatchObject({
				code: "CONFLICT",
				cloneId: w.clones[0].id,
			});
		expect(w.cloned).toHaveLength(1);
		expect(ws.records()).toEqual([]);
	});

	it("같은 이름·다른 원본도 막고, 다른 공급자·다른 이름은 막지 않는다", async () => {
		await body(0, ...fish("--yes"));
		source(cloneWav(15 * RATE), "다른.wav");
		const other = bare("fish_audio", ws.path("다른.wav"), "--consent", "--yes");
		expect((await body(2, ...other)).code).toBe("CONFLICT");
		// 정리하면 같은 이름이다
		other[5] = ` ${NAME.replace(" ", "\t ")} `;
		expect((await body(2, ...other)).code).toBe("CONFLICT");
		expect(w.cloned).toHaveLength(1);
		other[5] = `${NAME} 2`;
		await body(0, ...other);
		await body(0, ...gemini("--yes"));
		expect(w.cloned).toHaveLength(3);
	});

	it.each([
		["ready", null, 2, "CONFLICT"],
		["processing", null, 2, "CONFLICT"],
		["sending", null, 6, "UNCONFIRMED"],
		["unknown", "unknown_outcome", 6, "UNCONFIRMED"],
		["failed", "provider_error", 6, "UNCONFIRMED"],
	] as const)(
		"같은 이름의 %s(%s) 줄이 있으면 %i이고 0회다",
		async (status, reason, code, name) => {
			const row = w.clone({ name: NAME, status, reason });
			for (const extra of [["--yes"], ["--dry-run"]]) {
				const failed = await body(code, ...fish(...extra));
				expect(failed).toMatchObject({ code: name, cloneId: row.id });
				expect(failed.message).not.toContain(NAME);
				// 보내는 중이면 공급자 웹이 아니라 끝나기를 기다린다
				for (const text of status === "sending"
					? ["끝난 뒤", "clones list"]
					: code === 6
						? ["clones remove", "Fish Audio 웹"]
						: [])
					expect(failed.message).toContain(text);
				if (status === "sending")
					expect(failed.message).not.toContain("clones remove");
			}
			expect(w.cloned).toEqual([]);
			expect(ws.records()).toEqual([]);
			// --new만 이 검사를 건너뛴다. 확인은 그대로다
			expect((await body(2, ...fish("--new"))).code).toBe("CONFIRM_REQUIRED");
			await body(0, ...fish("--new", "--yes"));
			expect(w.cloned).toHaveLength(1);
		},
	);

	it("앞선 줄이 막지 않아도 뒤의 막는 줄을 본다. 미확인이 앞선다", async () => {
		const unknown = w.clone({ name: NAME, status: "unknown" });
		w.clone({ name: NAME });
		w.clone({ name: NAME, status: "failed", reason: "quality" });
		expect(await body(6, ...fish("--yes"))).toMatchObject({
			cloneId: unknown.id,
		});
		expect(w.cloned).toEqual([]);
	});

	it.each([
		["failed", "quality"],
		["failed", "rate_limit"],
		["failed", null],
		["deleting", null],
		["deleting", "provider_error"],
	] as const)("%s(%s) 줄은 막지 않는다", async (status, reason) => {
		w.clone({ name: NAME, status, reason });
		await body(0, ...fish("--yes"));
		expect(w.cloned).toHaveLength(1);
	});

	it("200이지만 id를 못 읽은 실패(failed·provider_error) 뒤 다시 실행해도 0회다", async () => {
		w.on.myVoiceCreate = async (_input, next) => {
			await next();
			Object.assign(w.clones[0], {
				status: "failed",
				reason: "provider_error",
			});
			return reject("BAD_GATEWAY", "provider_error")();
		};
		const first = await body(5, ...fish("--yes"));
		expect(first.reason).toBe("provider_error");
		expect(first.message).toContain("Fish Audio 웹");
		expect(ws.records()).toEqual([]);
		delete w.on.myVoiceCreate;
		expect(await body(6, ...fish("--yes"))).toMatchObject({
			cloneId: w.clones[0].id,
		});
		expect(w.cloned).toHaveLength(1);
	});

	it("같은 입력의 두 프로세스 동시 실행은 1회다", async () => {
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		w.on.myVoiceCreate = async (_input, next) => {
			const row = await next();
			await held;
			return row;
		};
		const first = spawnCli(ws.dir, fish("--yes", "--json"));
		await until(() => w.cloned.length === 1, "만들기 시작");
		// 아직 보내는 중이다
		const at = w.clones[0];
		at.status = "sending";
		const second = await body(6, ...fish("--yes"));
		expect(second.requestId).toBe(ws.records()[0]?.requestId);
		at.status = "ready";
		open();
		expect((await first.done).code).toBe(0);
		expect(w.cloned).toHaveLength(1);
		expect(ws.records()).toEqual([]);
	});

	it("확인 프롬프트에 함께 선 두 프로세스에서 1회다", async () => {
		const a = spawnTty(ws.dir, fish());
		const b = spawnTty(ws.dir, fish());
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		const second = await b.done;
		expect(second.code).toBe(2);
		expect(second.out).toContain(w.clones[0].id);
		expect(w.cloned).toHaveLength(1);
		expect(ws.records()).toEqual([]);
	});

	it("확인하는 사이 다른 프로세스가 선점했으면 서버에 줄이 없어도 보내지 않고 그 요청을 본다", async () => {
		const waiting = spawnTty(ws.dir, fish());
		await until(() => waiting.seen().includes("[y/N]"), "확인 프롬프트");
		// 서버가 줄을 쓰기 전이다
		w.on.myVoiceCreate = () => new Promise(() => {});
		const first = spawnCli(ws.dir, fish("--yes", "--json"));
		await until(() => count("myVoiceCreate") === 1, "만들기 요청");
		const [record] = ws.records();
		waiting.write("y\r");
		const second = await waiting.done;
		expect(second.code).toBe(6);
		expect(second.out).toContain(record?.requestId);
		expect(count("myVoiceCreate")).toBe(1);
		expect(ws.records()).toEqual([record]);
		first.child.kill("SIGINT");
		await first.done;
	});

	it("함께 선 프롬프트에서 같은 이름·다른 원본도 둘째는 막힌다", async () => {
		const a = spawnTty(ws.dir, fish());
		const file = source(cloneWav(15 * RATE), "다른.wav");
		const b = spawnTty(ws.dir, bare("fish_audio", file, "--consent"));
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		expect((await b.done).code).toBe(2);
		expect(w.cloned).toHaveLength(1);
	});

	it("선점 뒤 재검사 조회가 실패하면 기록을 풀고 0회다", async () => {
		let during = 0;
		w.on.myVoiceList = (_input, next) => {
			if (!ws.records().length) return next();
			during += 1;
			return reject("SERVICE_UNAVAILABLE", "storage")();
		};
		await body(5, ...fish("--yes"));
		expect(during).toBe(1);
		expect(w.cloned).toEqual([]);
		expect(ws.records()).toEqual([]);
	});

	it("선점 뒤 재검사가 다른 요청의 줄을 보면 기록을 풀고 0회다", async () => {
		w.on.myVoiceList = (_input, next) => {
			if (ws.records().length) w.clone({ name: NAME, status: "sending" });
			return next();
		};
		await body(6, ...fish("--yes"));
		expect(w.cloned).toEqual([]);
		expect(ws.records()).toEqual([]);
	});

	it("목록을 읽지 못하거나 모양이 다르면 보내지 않는다", async () => {
		w.on.myVoiceList = reject("SERVICE_UNAVAILABLE", "storage");
		await body(5, ...fish("--yes"));
		for (const value of [null, [], { items: [] }, { items: [{ id: 1 }] }]) {
			w.on.myVoiceList = () => value;
			await body(5, ...fish("--yes"));
		}
		expect(w.cloned).toEqual([]);
		expect(existsSync(ws.requestsPath)).toBe(false);
	});

	it("응답을 잃으면 6이고 기록이 남고, 다시 실행하면 그 요청만 본다", async () => {
		lose();
		const lost = await body(6, ...fish("--yes"));
		expect(lost).toMatchObject({ code: "UNCONFIRMED" });
		expect(lost.message).toContain("clones resume");
		expect(ws.records()).toMatchObject([
			{ requestId: lost.requestId, kind: "clones" },
		]);
		w.hook = undefined;
		const again = await body(0, ...fish());
		expect(again).toMatchObject({
			source: "resumed",
			clone: { id: w.clones[0].id },
		});
		expect(w.cloned).toHaveLength(1);
		expect(ws.records()).toEqual([]);
		// 기록이 풀린 뒤에는 같은 이름이 막는다
		await body(2, ...fish("--yes"));
	});

	it.each([
		["sending", null, 6, 1],
		["unknown", "unknown_outcome", 6, 1],
		["deleting", null, 6, 1],
		["없음", null, 6, 1],
		["조회 실패", null, 6, 1],
		["모르는 모양", null, 6, 1],
		["failed", "quality", 5, 0],
		["ready", null, 0, 0],
		["processing", null, 0, 0],
	] as const)(
		"응답 유실 뒤 그 줄이 %s이면 다시 실행과 resume은 같은 코드다",
		async (status, reason, code, left) => {
			lose();
			const { requestId } = await body(6, ...fish("--yes"));
			w.hook = undefined;
			const [row] = w.clones;
			if (status === "없음") w.clones = [];
			else if (status === "조회 실패")
				w.on.myVoiceRequest = reject("SERVICE_UNAVAILABLE", "storage");
			else if (status === "모르는 모양")
				w.on.myVoiceRequest = () => ({ ...row, provider: "x" });
			else Object.assign(row, { status, reason });
			if (status !== "ready") row.voice = null;
			const listed = count("myVoiceList");
			// 로컬 기록이 같은 이름 검사보다 먼저다(6·5도 확인 없이)
			if (code === 6) {
				const again = await body(6, ...fish("--yes"));
				expect(again.requestId).toBe(requestId);
				expect(again.message).toContain("공급자 웹");
				expect(again.message).toContain("clones remove");
				expect(again.message).toContain("--new");
			}
			const resumed = await body(code, "clones", "resume", requestId);
			if (code === 0) expect(resumed).toMatchObject({ source: "resumed" });
			if (code === 5)
				expect(resumed).toMatchObject({
					code: "CREATE_FAILED",
					reason: "quality",
					requestId,
					cloneId: row.id,
				});
			expect(ws.records()).toHaveLength(left);
			expect(w.cloned).toHaveLength(1);
			// myVoiceRequest만 부른다
			expect(count("myVoiceList")).toBe(listed);
			expect(w.calls).not.toContain("myVoiceCheck");
		},
	);

	it.each(["sending", "unknown", "deleting", "처음 보는 상태"])(
		"응답 상태가 %s이면 6이고 기록이 남는다",
		async (status) => {
			w.cloneMade = { status };
			const failed = await body(6, ...fish("--yes"));
			expect(failed.requestId).toBe(ws.records()[0]?.requestId);
			await body(6, ...fish("--yes"));
			expect(w.cloned).toHaveLength(1);
		},
	);
	it.each(["{}", '{"json":{"id":"글"}}', "<h1>중간 장비</h1>"])(
		"응답이 클론 모양이 아니면(%s) 6이고 기록이 남는다",
		async (text) => {
			w.hook = (path, _request, response) => {
				if (!path.includes("myVoiceCreate")) return false;
				response.setHeader("content-type", "application/json");
				response.end(text);
				return true;
			};
			await body(6, ...fish("--yes"));
			expect(ws.records()).toHaveLength(1);
		},
	);

	it.each([
		["BAD_REQUEST", undefined, 5, 0],
		["UNAUTHORIZED", undefined, 3, 0],
		["BAD_REQUEST", "audio_format", 2, 0],
		["BAD_REQUEST", "audio_length", 2, 0],
		["BAD_REQUEST", "consent_audio_missing", 2, 0],
		["BAD_REQUEST", "provider_input", 5, 0],
		["BAD_GATEWAY", "quota", 5, 0],
		["BAD_GATEWAY", "no_permission", 5, 0],
		["BAD_GATEWAY", "provider_auth", 5, 0],
		["BAD_GATEWAY", "provider_error", 5, 0],
		["BAD_GATEWAY", "no_key", 5, 0],
		["TOO_MANY_REQUESTS", "rate_limit", 5, 0],
		["TOO_MANY_REQUESTS", "in_progress", 5, 0],
		["SERVICE_UNAVAILABLE", "storage", 5, 0],
		["CONFLICT", "request_mismatch", 5, 0],
		["GATEWAY_TIMEOUT", "unknown_outcome", 6, 1],
		["TOO_MANY_REQUESTS", undefined, 6, 1],
		["INTERNAL_SERVER_ERROR", undefined, 6, 1],
		["NOT_FOUND", undefined, 6, 1],
		["BAD_GATEWAY", "quality", 6, 1],
	] as const)(
		"만들기 거절 %s %s → %i, 남은 기록 %i",
		async (code, reason, exit, left) => {
			w.on.myVoiceCreate = reject(code, reason);
			const failed = await body(exit, ...fish("--yes"));
			if (reason && exit === 2) expect(failed.reason).toBe(reason);
			if (exit === 2) expect(failed.code).toBe("INPUT");
			expect(ws.records()).toHaveLength(left);
			expect(count("myVoiceCreate")).toBe(1);
		},
	);

	it("거절의 글은 클론 문구이고 대기 시각을 알린다", async () => {
		const text = async (code: string, reason: string, at?: string) => {
			w.on.myVoiceCreate = reject(code, reason, at);
			const result = await run(...fish("--yes"));
			return result.err.split("\n").slice(-4).join("\n");
		};
		expect(await text("BAD_REQUEST", "audio_length")).toContain("원본 길이");
		expect(await text("BAD_REQUEST", "provider_input")).not.toContain("대본");
		expect(await text("TOO_MANY_REQUESTS", "in_progress")).toContain(
			"내 보이스",
		);
		expect(await text("BAD_GATEWAY", "quota")).toContain("요금제");
		expect(
			await text("TOO_MANY_REQUESTS", "rate_limit", "2026-11-24T01:00:00Z"),
		).toContain("2026-11-24T01:00:00.000Z");
	});

	it.each(["sending", "ready"])(
		"사유가 storage여도 그 요청의 줄이 %s이면 6이고 기록이 남는다",
		async (status) => {
			w.on.myVoiceCreate = async (_input, next) => {
				Object.assign(await next(), { status });
				return reject("SERVICE_UNAVAILABLE", "storage")();
			};
			await body(6, ...fish("--yes"));
			expect(ws.records()).toHaveLength(1);
		},
	);

	it("--new는 새 요청 ID로 만들고, 확정 거절되면 앞 기록으로 되돌린다", async () => {
		lose();
		const { requestId } = await body(6, ...fish("--yes"));
		w.hook = undefined;
		w.on.myVoiceCreate = reject("BAD_GATEWAY", "quota");
		await body(5, ...fish("--new", "--yes"));
		expect(ws.records()).toMatchObject([{ requestId }]);
		delete w.on.myVoiceCreate;
		await body(0, ...fish("--new", "--yes"));
		expect(w.cloned).toHaveLength(2);
		expect(w.cloned[1].requestId).not.toBe(requestId);
		expect(ws.records()).toEqual([]);
	});

	it("기록은 입력·사용자·주소마다 따로다", async () => {
		lose();
		await body(6, ...fish("--yes"));
		w.clones = [];
		// 원본·이름·공급자가 다르면 다른 기록이다
		source(cloneWav(15 * RATE), "다른.wav");
		await body(
			...([6, ...bare("fish_audio", ws.path("다른.wav"))] as const),
			...["--consent", "--yes"],
		);
		w.clones = [];
		await body(6, ...gemini("--yes"));
		w.clones = [];
		// 동의 녹음만 달라도 다른 기록이다
		const args = gemini("--yes");
		consent(cloneWav(4 * RATE));
		await body(6, ...args);
		w.clones = [];
		expect(ws.records()).toHaveLength(4);
		// 다른 사용자
		w.user = (cookie) => (cookie === COOKIE ? { id: "user-2" } : null);
		await body(6, ...fish("--yes"));
		w.clones = [];
		expect(ws.records()).toHaveLength(5);
		expect(w.cloned).toHaveLength(5);
		// 다른 주소
		const other = await w.serve();
		try {
			const state = JSON.parse(readFileSync(`${ws.dir}/sessions.json`, "utf8"));
			state.sessions[other.origin] = { cookie: COOKIE, version: "v1" };
			writeFileSync(`${ws.dir}/sessions.json`, JSON.stringify(state));
			await body(6, ...fish("--yes", "--url", other.origin));
			expect(ws.records()).toHaveLength(6);
			expect(
				(await body(0, "clones", "resume", "--url", other.origin)).requests,
			).toHaveLength(1);
			expect((await body(0, "clones", "resume")).requests).toHaveLength(5);
		} finally {
			other.close();
		}
	});

	it("resume: ID가 없으면 남은 요청이고 다른 종류의 요청은 2다", async () => {
		expect((await run("clones", "resume")).out).toContain("없습니다");
		lose();
		const { requestId } = await body(6, ...fish("--yes"));
		expect((await body(0, "clones", "resume")).requests).toMatchObject([
			{ requestId, provider: "fish_audio" },
		]);
		expect((await body(0, "studio", "resume")).requests).toEqual([]);
		for (const kind of ["studio", "trial", "drama"])
			expect((await body(2, kind, "resume", requestId)).message).toContain(
				"clones resume",
			);
		w.on.studioCreate = () => new Promise(() => {});
		const gen = spawnCli(ws.dir, [
			...["studio", "generate", "--voice", "typecast:v1", "--yes"],
			...["--input", ws.script("글"), "--out", ws.path("a.mp3")],
		]);
		await until(() => w.calls.includes("studioCreate"), "생성 요청");
		gen.child.kill("SIGINT");
		await gen.done;
		const studio = ws.records().find((item) => !item.kind)?.requestId ?? "";
		expect((await body(2, "clones", "resume", studio)).message).toContain(
			"studio resume",
		);
		expect((await body(6, "clones", "resume", NONE)).requestId).toBe(NONE);
	});

	it("Ctrl+C: 확인 중이면 2, 응답 전이면 6이고 기록이 남는다", async () => {
		const tty = spawnTty(ws.dir, fish());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		expect(existsSync(ws.requestsPath)).toBe(false);
		w.on.myVoiceCreate = () => new Promise(() => {});
		const sent = spawnCli(ws.dir, fish("--yes", "--json"));
		await until(() => w.calls.includes("myVoiceCreate"), "만들기 요청");
		sent.child.kill("SIGINT");
		const cut = await sent.done;
		expect(cut.code).toBe(6);
		expect(json(cut).requestId).toBe(ws.records()[0]?.requestId);
	});

	it("Ctrl+C: 응답을 받은 뒤면 7(OUTPUT_STOPPED)이고 ID와 clones list를 알린다", async () => {
		let holder: ReturnType<typeof spawn> | undefined;
		w.on.myVoiceCreate = async (_input, next) => {
			// 기록을 지우지 못하게 잠금을 쥔 채 응답한다
			holder = spawn("/usr/bin/lockf", [
				...["-k", `${ws.dir}/lock`, "/bin/sh"],
				...["-c", "printf ready; exec /bin/sleep 10"],
			]);
			await new Promise((ready) => holder?.stdout?.once("data", ready));
			return next();
		};
		const child = spawnCli(ws.dir, fish("--yes", "--json"));
		await until(() => Boolean(holder?.stdout?.readableDidRead), "잠금");
		await new Promise((done) => setTimeout(done, 800));
		child.child.kill("SIGINT");
		const stopped = await child.done;
		holder?.kill("SIGKILL");
		expect(stopped.code).toBe(7);
		expect(json(stopped)).toMatchObject({
			code: "OUTPUT_STOPPED",
			cloneId: w.clones[0].id,
		});
		expect(json(stopped).message).toContain("clones list");
		expect(json(stopped).resultId).toBeUndefined();
	});

	it("사람용 오류에 클론 ID가 있다", async () => {
		const row = w.clone({ name: NAME, status: "unknown" });
		const { code, err } = await run(...fish("--yes"));
		expect(code).toBe(6);
		expect(err).toContain(`클론 ID ${row.id}`);
	});
});

describe("클론 관리", { timeout: 60_000 }, () => {
	it("목록: 상태·사유와 다음 동작·REF·보관함·프리셋·만들 수 있는지", async () => {
		const ready = w.clone({
			name: "준비",
			savedVoiceId: NONE,
			presets: ["쇼츠", "뉴스"],
		});
		w.clone({ name: "처리", status: "processing", provider: "gemini" });
		w.clone({ name: "보냄", status: "sending" });
		w.clone({ name: "품질", status: "failed", reason: "quality" });
		w.clone({ name: "모름", status: "unknown", reason: "unknown_outcome" });
		w.clone({ name: "대기", status: "deleting", reason: "rate_limit" });
		w.clone({ name: "이상", status: "failed", reason: "constructor" });
		w.cloneProviders.gemini = false;
		const data = await body(0, "clones", "list");
		expect(data.providers).toEqual({ fish_audio: true, gemini: false });
		expect(data.clones).toHaveLength(7);
		const of = (name: string) =>
			data.clones.find((item: { name: string }) => item.name === name);
		expect(of("준비")).toMatchObject({
			id: ready.id,
			ref: `fish_audio:clone-${ready.id}`,
			note: null,
		});
		expect(of("준비").requestId).toBeUndefined();
		expect(of("처리")).toMatchObject({ ref: null });
		for (const [name, texts] of [
			["처리", ["clones check"]],
			["품질", ["품질", "clones remove"]],
			["모름", ["Fish Audio 웹", "clones remove"]],
			["대기", ["지워지지", "clones remove"]],
			["이상", ["만들지 못했", "clones remove"]],
		] as const)
			for (const text of texts) expect(of(name).note).toContain(text);
		const { out } = await run("clones", "list");
		const rows = out.split("\n").map((line) => line.split("\t"));
		expect(rows[0]).toEqual([
			...["이름", "ID", "공급자", "상태", "사유와 다음 동작"],
			...["공급자:성우 ID", "보관함", "프리셋", "만든 때"],
		]);
		const line = rows.find(([name]) => name === "준비");
		expect(line).toEqual([
			...["준비", ready.id, "Fish Audio", "사용 가능", ""],
			...[`fish_audio:clone-${ready.id}`, "예", "쇼츠, 뉴스", ready.createdAt],
		]);
		expect(out).toContain("만들 수 있음: Fish Audio");
		expect(out).toContain("연결 안 됨: Gemini");
		w.clones = [];
		expect((await run("clones", "list")).out).toContain("없습니다");
	});

	it("공통 사유(한도·저장소·키)의 글이 목록과 실패에서 사라지지 않는다", async () => {
		for (const [reason, text] of [
			["rate_limit", "요청 한도"],
			["storage", "저장소"],
			["no_key", "키가 없"],
		] as const) {
			const row = w.clone({ status: "failed", reason });
			const { clones } = await body(0, "clones", "list");
			expect(clones[0].note).toContain(text);
			const failed = await body(5, "clones", "resume", row.requestId);
			expect(failed.message).toContain(text);
			expect(failed.reason).toBe(reason);
		}
	});

	it("지우기의 입력 거절은 대본이 아니라 지우기 글이다", async () => {
		const row = w.clone();
		w.on.myVoiceDelete = reject("BAD_REQUEST", "provider_input");
		const failed = await body(5, "clones", "remove", row.id, "--yes");
		expect(failed).toMatchObject({ reason: "provider_input", cloneId: row.id });
		expect(failed.message).toContain("지우기");
		expect(failed.message).toContain("그대로");
		expect(failed.message).not.toContain("대본");
	});

	it("이름·사유의 제어 문자를 터미널에 그대로 쓰지 않는다", async () => {
		w.clone({ name: "나\u001b[31m쁜" });
		expect((await run("clones", "list")).out).not.toContain("\u001b");
	});

	it.each([
		["ready", null, 0],
		["processing", null, 0],
		["sending", null, 0],
		["unknown", "unknown_outcome", 0],
		["deleting", null, 0],
		["failed", "not_found", 5],
	] as const)("check 결과가 %s이면 %i다", async (status, reason, code) => {
		const row = w.clone({ status: "processing" });
		w.on.myVoiceCheck = () => {
			Object.assign(row, { status, reason });
			return row;
		};
		const result = await body(code, "clones", "check", row.id);
		if (code === 0) expect(result.clone).toMatchObject({ id: row.id, status });
		else expect(result).toMatchObject({ reason: "not_found", cloneId: row.id });
		expect(count("myVoiceCheck")).toBe(1);
		// 사람용 글에도 상태가 있다
		if (code === 0)
			expect((await run("clones", "check", row.id)).out).toContain("상태");
	});
	it("check의 실패는 기존 분류다", async () => {
		const row = w.clone({ status: "processing" });
		for (const [code, reason, exit] of [
			["BAD_GATEWAY", "no_key", 5],
			["TOO_MANY_REQUESTS", "rate_limit", 5],
			["UNAUTHORIZED", undefined, 3],
			["NOT_FOUND", undefined, 4],
		] as const) {
			w.on.myVoiceCheck = reject(code, reason);
			await body(exit, "clones", "check", row.id);
		}
		w.on.myVoiceCheck = () => ({ id: row.id });
		await body(5, "clones", "check", row.id);
	});
	it("save는 사용 가능한 클론만 다시 담는다", async () => {
		const row = w.clone();
		const result = await body(0, "clones", "save", row.id.toUpperCase());
		expect(result.clone.savedVoiceId).toBe(row.savedVoiceId);
		const other = w.clone({ status: "processing" });
		await body(4, "clones", "save", other.id);
		await body(4, "clones", "save", NONE);
	});

	it("remove는 확인 없이 지우지 않고 이름·공급자·프리셋과 되돌릴 수 없음을 보인다", async () => {
		const row = w.clone({ name: "지울 것", presets: ["쇼츠", "뉴스"] });
		const refused = await run("clones", "remove", row.id, "--json");
		expect(refused.code).toBe(2);
		expect(json(refused).code).toBe("CONFIRM_REQUIRED");
		for (const text of [
			...["지울 것", "Fish Audio", "프리셋 2개", "쇼츠, 뉴스"],
			...["되돌릴 수 없", "이미 만든 음성"],
		])
			expect(refused.err).toContain(text);
		expect(count("myVoiceDelete")).toBe(0);
		const tty = spawnTty(ws.dir, ["clones", "remove", row.id]);
		await until(() => tty.seen().includes("[y/N]"), "확인");
		tty.write("n\r");
		expect((await tty.done).code).toBe(2);
		expect(count("myVoiceDelete")).toBe(0);
		expect(await body(0, "clones", "remove", row.id, "--yes")).toEqual({
			origin: server.origin,
			removed: row.id,
		});
		expect(w.clones).toEqual([]);
		await body(4, "clones", "remove", row.id, "--yes");
		expect(count("myVoiceDelete")).toBe(1);
	});

	it.each([
		["ready", null, ["계정에서도 지워지고"], ["남았을 수"]],
		["failed", "quality", ["남은 것이 있으면 함께"], ["남았을 수"]],
		["failed", "provider_error", ["남았을 수", "Fish Audio 웹"], ["함께"]],
		["unknown", null, ["남았을 수", "Fish Audio 웹"], ["계정에서도"]],
	] as const)("remove 고지: %s(%s)", async (status, reason, shown, hidden) => {
		const row = w.clone({ status, reason });
		const { err } = await run("clones", "remove", row.id);
		for (const text of shown) expect(err).toContain(text);
		for (const text of hidden) expect(err).not.toContain(text);
	});

	it("보내는 중이면 목록에서든 서버 CONFLICT로든 2이고 지우지 않는다", async () => {
		const row = w.clone({ status: "sending" });
		expect(await body(2, "clones", "remove", row.id, "--yes")).toMatchObject({
			code: "CONFLICT",
			cloneId: row.id,
		});
		expect(count("myVoiceDelete")).toBe(0);
		row.status = "ready";
		w.on.myVoiceDelete = reject("CONFLICT", "in_progress");
		expect((await body(2, "clones", "remove", row.id, "--yes")).code).toBe(
			"CONFLICT",
		);
	});

	it.each([
		["BAD_GATEWAY", "no_key", 5],
		["TOO_MANY_REQUESTS", "rate_limit", 5],
		["BAD_GATEWAY", "provider_auth", 5],
		["SERVICE_UNAVAILABLE", "storage", 5],
		["GATEWAY_TIMEOUT", "unknown_outcome", 6],
		["INTERNAL_SERVER_ERROR", undefined, 6],
		["UNAUTHORIZED", undefined, 3],
		["NOT_FOUND", undefined, 4],
	] as const)(
		"remove 실패 %s %s → %i이고 줄의 실제 상태를 한 번 읽어 알린다",
		async (code, reason, exit) => {
			const row = w.clone();
			const at = "2026-11-24T01:00:00.000Z";
			const fail = reject(code, reason, at);
			w.on.myVoiceDelete = fail;
			const kept = await body(exit, "clones", "remove", row.id, "--yes");
			expect(kept.cloneId).toBe(row.id);
			if (reason) expect(kept).toMatchObject({ reason, retryAt: at });
			expect(kept.message).toContain("그대로");
			// 처음과 실패 뒤 한 번씩
			expect(count("myVoiceList")).toBe(2);
			expect(count("myVoiceDelete")).toBe(1);
			w.on.myVoiceDelete = () => {
				row.status = "deleting";
				return fail();
			};
			const waiting = await body(exit, "clones", "remove", row.id, "--yes");
			expect(waiting.message).toContain("삭제 대기");
			expect(waiting.message).toContain("같은 명령");
			w.on.myVoiceDelete = () => {
				w.clones = [];
				return fail();
			};
			const gone = await body(exit, "clones", "remove", row.id, "--yes");
			expect(gone.message).toContain("목록에 없");
		},
	);

	it("지우기 응답을 잃으면 6이고, 목록을 못 읽으면 상태를 단정하지 않는다", async () => {
		const row = w.clone();
		lose("myVoiceDelete");
		const lost = await body(6, "clones", "remove", row.id, "--yes");
		expect(lost).toMatchObject({ code: "UNCONFIRMED", cloneId: row.id });
		expect(lost.message).toContain("목록에 없");
		w.hook = undefined;
		const other = w.clone();
		w.on.myVoiceDelete = () => {
			w.on.myVoiceList = reject("SERVICE_UNAVAILABLE", "storage");
			return reject("GATEWAY_TIMEOUT", "unknown_outcome")();
		};
		const blind = await body(6, "clones", "remove", other.id, "--yes");
		for (const text of ["그대로", "삭제 대기", "목록에 없"])
			expect(blind.message).not.toContain(text);
	});

	it("지우기 응답이 결과 모양이 아니면 6이다", async () => {
		const row = w.clone();
		for (const value of [null, {}, { deleted: false }]) {
			w.on.myVoiceDelete = () => value;
			const failed = await body(6, "clones", "remove", row.id, "--yes");
			expect(failed.message).toContain("그대로");
		}
	});

	it("삭제 대기 줄은 같은 명령으로 다시 시도한다", async () => {
		const row = w.clone({ status: "deleting", reason: "rate_limit" });
		await body(0, "clones", "remove", row.id, "--yes");
		expect(w.clones).toEqual([]);
	});

	it("Ctrl+C: 확인 중이면 2, 지우기를 보낸 뒤면 6이다", async () => {
		const row = w.clone();
		const tty = spawnTty(ws.dir, ["clones", "remove", row.id]);
		await until(() => tty.seen().includes("[y/N]"), "확인");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		w.on.myVoiceDelete = () => new Promise(() => {});
		const args = ["clones", "remove", row.id, "--yes", "--json"];
		const sent = spawnCli(ws.dir, args);
		await until(() => w.calls.includes("myVoiceDelete"), "지우기 요청");
		sent.child.kill("SIGINT");
		const cut = await sent.done;
		expect(cut.code).toBe(6);
		expect(json(cut)).toMatchObject({ code: "UNCONFIRMED", cloneId: row.id });
	});
});
