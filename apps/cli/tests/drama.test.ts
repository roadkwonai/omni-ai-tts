import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { ORPCError } from "@orpc/server";
import { dramaRequestSchema } from "@tts-pilot-app/api/drama-contract";
import {
	newSpeaker,
	parsePaste,
	requestOf,
} from "@tts-pilot-app/api/drama-request";
import {
	cutWav,
	DRAMA_SAMPLE_RATE,
	type DramaRequest,
	dramaUsage,
	type LineSpan,
	sceneText,
	wavOf,
} from "@tts-pilot-app/api/drama-script";
import {
	STUDIO_PART_BYTES,
	utf8Bytes,
} from "@tts-pilot-app/api/providers/trial-options";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	bytesOf,
	saved,
	type serve,
	spawnCli,
	spawnTty,
	studioWorld,
	until,
	voiceOf,
	workspace,
} from "./harness.js";

let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;
// 무료 모델 기간 안과 뒤
const FREE = "2026-11-24T00:00:00+09:00";
const ENDED = "2026-12-01T00:00:00+09:00";

beforeEach(async () => {
	w = studioWorld();
	w.voices = [
		...w.voices,
		saved(voiceOf("fish_audio", "fish2")),
		saved(voiceOf("fish_audio", "fishgone"), true),
	];
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});

const run = (args: string[], now?: string) =>
	spawnCli(ws.dir, args, "", now).done;
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const count = (name: string) => w.calls.filter((item) => item === name).length;
const scene = (over: object = {}) => ({
	version: 1,
	sceneName: "  첫 장면 ",
	speakers: [
		{ name: "민수", voice: "fish_audio:fish" },
		{ name: "안 쓰는 사람", voice: "fish_audio:fishgone" },
		{ name: "영희", voice: "fish_audio:fish2" },
	],
	lines: [
		{ speaker: 2, direction: " [차갑게]  침착 ", text: " 어디  갔었어? " },
		{ speaker: 0, direction: "", text: "집에 있었어." },
	],
	model: "s2.1-pro",
	settings: { speed: 1, temperature: 0.7 },
	...over,
});
type Scene = ReturnType<typeof scene>;
// 웹과 같은 장면 요청(쓰인 화자만 남기고 번호를 다시 매긴 뒤 서버 계약으로 정리)
const requestFor = (value: Scene = scene()): DramaRequest => {
	const request = requestOf({
		...value,
		speakers: value.speakers.map(({ name, voice }) => ({
			...newSpeaker(name),
			voiceId: voice.split(":")[1] ?? null,
		})),
		model: value.model as DramaRequest["model"],
	});
	return dramaRequestSchema.parse(request);
};
const file = (value: object, name = "scene.json") =>
	ws.script(JSON.stringify(value), name);
const gen = (value: object = scene(), ...extra: string[]) => [
	...["drama", "generate", "--input", file(value)],
	...["--out", ws.path("out.wav"), "--json", ...extra],
];
const loseCreate = () => {
	w.hook = (path, _request, response) => {
		if (path.includes("dramaCreate"))
			response.writeHead = (() => {
				response.destroy();
				return response;
			}) as never;
		return false;
	};
};

describe("테이크 목록·받기·나누기·지우기", { timeout: 60_000 }, () => {
	const span = (from: number, to: number): LineSpan => ({
		start: from,
		end: to,
		cutStart: from,
		cutEnd: to,
	});
	const spans = [span(0, 0.25), span(0.25, 1)];
	const sound = Buffer.from(wavOf(bytesOf(DRAMA_SAMPLE_RATE * 2)));
	const split = (id: string, ...extra: string[]) => [
		...["drama", "split", id, "--out-dir", ws.path("cut"), "--json", ...extra],
	];
	beforeEach(() => mkdirSync(ws.path("cut")));

	it("최근 20개를 보이고 나눌 수 있는지 알린다", async () => {
		for (let i = 0; i < 21; i += 1)
			w.take(requestFor(scene({ sceneName: `장면 ${i}\u001b[31m` })));
		w.take(requestFor(), { segments: spans });
		const result = await run(["drama", "list", "--json"]);
		expect(result.code).toBe(0);
		const { takes } = json(result);
		expect(takes).toHaveLength(20);
		expect(takes[0]).toMatchObject({ id: w.takes[0]?.id, split: true });
		expect(takes[1]).toMatchObject({ split: false });
		const text = await run(["drama", "list"]);
		expect(text.out).toContain(w.takes[0]?.id);
		expect(text.out).toContain("첫 장면");
		expect(text.out).not.toContain("\u001b");
		w.takes = [];
		expect((await run(["drama", "list"])).out).toContain("없습니다");
		expect(w.synth).toBe(0);
	});

	it("결과 ID로 WAV를 받고, 최근 20개 밖도 받는다", async () => {
		const take = w.take(requestFor(), { audio: sound });
		const args = (id: string, ...extra: string[]) => [
			...["drama", "download", id, "--out", ws.path("a.wav"), "--json"],
			...extra,
		];
		const result = await run(args(take.id));
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			source: "saved",
			result: { id: take.id, bytes: sound.byteLength, usage: take.usage },
			mime: "audio/wav",
		});
		expect(readFileSync(ws.path("a.wav")).equals(sound)).toBe(true);
		expect((await run(args(take.id))).code).toBe(2);
		for (let i = 0; i < 20; i += 1) w.take(requestFor());
		const old = await run(args(take.id, "--overwrite"));
		expect(old.code).toBe(0);
		expect(json(old).result).toMatchObject({
			id: take.id,
			bytes: sound.byteLength,
		});
		const gone = await run(args(crypto.randomUUID(), "--overwrite"));
		expect(gone.code).toBe(4);
		expect(readFileSync(ws.path("a.wav")).equals(sound)).toBe(true);
		expect((await run(args("uuid아님"))).code).toBe(2);
		expect(w.synth).toBe(0);
	});

	it("목록을 받지 못해도 받고, 로그인이 끊겼으면 3이다", async () => {
		const take = w.take(requestFor(), { audio: sound });
		const args = [
			...["drama", "download", take.id, "--out", ws.path("a.wav"), "--json"],
		];
		w.on.dramaList = () => {
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		};
		const result = await run(args);
		expect(result.code).toBe(0);
		expect(json(result).result).toEqual({
			id: take.id,
			createdAt: null,
			usage: null,
			bytes: sound.byteLength,
		});
		expect(readFileSync(ws.path("a.wav")).equals(sound)).toBe(true);
		for (const name of ["dramaList", "dramaAudio"])
			w.on[name] = () => {
				throw new ORPCError("UNAUTHORIZED");
			};
		expect((await run([...args, "--overwrite"])).code).toBe(3);
	});

	it("줄마다 001-화자.wav로 자른다", async () => {
		const take = w.take(requestFor(), { audio: sound, segments: spans });
		const result = await run(split(take.id));
		expect(result.code).toBe(0);
		expect(readdirSync(ws.path("cut")).sort()).toEqual([
			"001-영희.wav",
			"002-민수.wav",
		]);
		for (const [i, name] of ["001-영희.wav", "002-민수.wav"].entries())
			expect(readFileSync(ws.path(`cut/${name}`))).toEqual(
				Buffer.concat(
					cutWav(new Uint8Array(sound), spans[i] as LineSpan).map((part) =>
						Buffer.from(part),
					),
				),
			);
		expect(json(result)).toMatchObject({
			resultId: take.id,
			outDir: ws.path("cut"),
			lines: [
				{ n: 1, speaker: "영희", out: ws.path("cut/001-영희.wav") },
				{ n: 2, speaker: "민수", out: ws.path("cut/002-민수.wav") },
			],
		});
	});

	it("경로 글자·긴 이름·같은 이름 화자도 폴더 안의 다른 파일이다", async () => {
		const request: DramaRequest = {
			...requestFor(),
			speakers: [
				{ name: "../밖/a:b", voiceId: "fish" },
				{ name: "가".repeat(20), voiceId: "fish2" },
			],
			lines: [
				{ speaker: 0, direction: "", text: "하나" },
				{ speaker: 1, direction: "", text: "둘" },
				{ speaker: 0, direction: "", text: "셋" },
			],
		};
		const take = w.take(request, {
			audio: sound,
			segments: [span(0, 0.3), span(0.3, 0.6), span(0.6, 1)],
		});
		expect((await run(split(take.id))).code).toBe(0);
		expect(readdirSync(ws.path("cut")).sort()).toEqual([
			"001-.._밖_a_b.wav",
			`002-${"가".repeat(20)}.wav`,
			"003-.._밖_a_b.wav",
		]);
		expect(readdirSync(ws.files)).not.toContain("밖");
	});

	it("하나라도 막히면 파일 0개와 2이고 --overwrite는 일반 파일만 바꾼다", async () => {
		const take = w.take(requestFor(), { audio: sound, segments: spans });
		writeFileSync(ws.path("cut/002-민수.wav"), "있음");
		const taken = await run(split(take.id));
		expect(taken.code).toBe(2);
		expect(json(taken).message).toContain("002-민수.wav");
		expect(readdirSync(ws.path("cut"))).toEqual(["002-민수.wav"]);
		symlinkSync(ws.path("none"), ws.path("cut/001-영희.wav"));
		expect((await run(split(take.id, "--overwrite"))).code).toBe(2);
		expect(readFileSync(ws.path("cut/002-민수.wav"), "utf8")).toBe("있음");
		expect(
			(
				await run([
					...["drama", "split", take.id, "--out-dir", ws.path("없음")],
				])
			).code,
		).toBe(2);
		expect(w.calls).not.toContain("dramaAudio");
	});

	it("나눌 수 없거나 최근 20개 밖이거나 없는 테이크는 4와 이유다", async () => {
		const none = w.take(requestFor());
		const odd = w.take(requestFor(), { segments: [span(0, 1)] });
		const unknown = w.take(requestFor(), { status: "unknown" });
		for (const [id, word] of [
			[none.id, "구간"],
			[odd.id, "구간"],
			[unknown.id, "처리 여부"],
			[crypto.randomUUID(), "최근 20개"],
		] as const) {
			const result = await run(split(id));
			expect(result.code).toBe(4);
			expect(json(result).message).toContain(word);
		}
		const old = w.take(requestFor(), { audio: sound, segments: spans });
		for (let i = 0; i < 20; i += 1) w.take(requestFor());
		expect((await run(split(old.id))).code).toBe(4);
		expect(readdirSync(ws.path("cut"))).toEqual([]);
	});

	it("받는 사이 경로가 막히면 이번에 만든 조각을 지우고 남의 파일은 둔다", async () => {
		const take = w.take(requestFor(), { audio: sound, segments: spans });
		w.on.dramaAudio = (_input, next) => {
			writeFileSync(ws.path("cut/002-민수.wav"), "남의 파일");
			return next();
		};
		const result = await run(split(take.id));
		expect(result.code).toBe(7);
		expect(readdirSync(ws.path("cut"))).toEqual(["002-민수.wav"]);
		expect(readFileSync(ws.path("cut/002-민수.wav"), "utf8")).toBe("남의 파일");
	});

	it("내려받기가 깨지면 나눈 파일 0개와 7이다", async () => {
		const take = w.take(requestFor(), { audio: sound, segments: spans });
		w.on.dramaAudio = async (_input, next) => {
			const part: File = await next();
			return new File([part.slice(2)], "a", { type: part.type });
		};
		const result = await run(split(take.id));
		expect(result.code).toBe(7);
		expect(json(result).resultId).toBe(take.id);
		expect(readdirSync(ws.path("cut"))).toEqual([]);
	});

	it("지우기는 대상과 함께 확인을 받는다", async () => {
		const take = w.take(requestFor());
		const refused = await run(["drama", "remove", take.id, "--json"]);
		expect(refused.code).toBe(2);
		expect(json(refused).code).toBe("CONFIRM_REQUIRED");
		expect(refused.err).toContain("첫 장면");
		expect(w.calls).not.toContain("dramaDelete");
		const no = spawnTty(ws.dir, ["drama", "remove", take.id]);
		await until(() => no.seen().includes("[y/N]"), "확인");
		no.write("n\r");
		expect((await no.done).code).toBe(2);
		expect(w.takes).toHaveLength(1);
		const yes = await run(["drama", "remove", take.id, "--yes", "--json"]);
		expect(yes.code).toBe(0);
		expect(json(yes).removed).toBe(take.id);
		expect(w.takes).toEqual([]);
		expect((await run(["drama", "remove", take.id, "--yes"])).code).toBe(4);
		expect((await run(["drama", "remove"])).code).toBe(2);
	});
});

describe("drama generate", { timeout: 60_000 }, () => {
	it("쓰이지 않는 화자를 빼고 웹과 같은 장면을 보내 WAV로 받는다", async () => {
		const result = await run(gen(scene(), "--yes"));
		expect(result.code).toBe(0);
		expect(w.scenes).toHaveLength(1);
		expect(w.scenes[0]?.request).toEqual(requestFor());
		expect(w.scenes[0]?.request.speakers).toEqual([
			{ name: "민수", voiceId: "fish" },
			{ name: "영희", voiceId: "fish2" },
		]);
		expect(w.scenes[0]?.request.lines[0]).toEqual({
			speaker: 1,
			direction: "차갑게 침착",
			text: "어디  갔었어?",
		});
		expect(json(result)).toMatchObject({
			source: "created",
			result: { id: w.takes[0]?.id, bytes: w.takes[0]?.audio.byteLength },
			out: ws.path("out.wav"),
			mime: "audio/wav",
		});
		expect(
			readFileSync(ws.path("out.wav")).equals(w.takes[0]?.audio as Buffer),
		).toBe(true);
		expect(ws.records()).toEqual([]);
		expect(ws.leftovers()).toEqual([]);
	});

	it("빠진 칸은 처음 값이고 모델은 무료 기간이면 무료, 아니면 s2.1-pro다", async () => {
		const value = {
			version: 1,
			speakers: [{ name: "가", voice: "fish_audio:fish" }],
			lines: [{ speaker: 0, text: "안녕" }],
		};
		const free = await run(gen(value), FREE);
		expect(free.code).toBe(0);
		expect(w.scenes[0]?.request).toMatchObject({
			sceneName: "",
			model: "s2.1-pro-free",
			settings: { speed: 1, temperature: 0.7 },
			lines: [{ speaker: 0, direction: "", text: "안녕" }],
		});
		const paid = await run(gen(value, "--overwrite", "--yes"), ENDED);
		expect(paid.code).toBe(0);
		expect(w.scenes[1]?.request.model).toBe("s2.1-pro");
		const picked = await run(
			gen(value, "--overwrite", "--yes", "--model", "drama-3"),
		);
		expect(picked.code).toBe(0);
		expect(w.scenes[2]?.request.model).toBe("drama-3");
		expect((await run(gen(value, "--model", "s9"))).code).toBe(2);
	});

	it("붙여 넣기 글은 웹 규칙으로 나누고 --voice로 성우를 준다", async () => {
		const raw =
			"민수: 안녕 12:30에 봐\n이어지는 말\n\n영희： <laugh> 그래\n민수:\n";
		const result = await run([
			...["drama", "generate", "--input", ws.script(raw, "scene.txt")],
			...[
				"--voice",
				"민수=fish_audio:fish",
				"--voice",
				"영희=fish_audio:fish2",
			],
			...["--model", "s2.1-pro", "--out", ws.path("out.wav"), "--yes"],
		]);
		expect(result.code).toBe(0);
		const pasted = parsePaste(raw, [newSpeaker("화자 1")], () => "x");
		if ("error" in pasted) throw new Error(pasted.error);
		expect(w.scenes[0]?.request.lines).toEqual(
			pasted.lines.map(({ speaker, direction, text }) => ({
				speaker,
				direction,
				text,
			})),
		);
		expect(w.scenes[0]?.request.speakers).toEqual([
			{ name: "민수", voiceId: "fish" },
			{ name: "영희", voiceId: "fish2" },
		]);
		// 이름이 없는 글은 '화자 1'이다
		const plain = await run([
			...["drama", "generate", "--input", ws.script("혼잣말", "one.txt")],
			...["--voice", "화자 1=fish_audio:fish", "--model", "s2.1-pro"],
			...["--out", ws.path("one.wav"), "--yes"],
		]);
		expect(plain.code).toBe(0);
		expect(w.scenes[1]?.request.speakers[0]?.name).toBe("화자 1");
		for (const bad of [
			" \n",
			"가: 1\n나: 1\n다: 1\n라: 1\n마: 1",
			"말\n".repeat(51),
		])
			expect(
				(
					await run([
						...["drama", "generate", "--input", ws.script(bad, "bad.txt")],
						...["--out", ws.path("bad.wav"), "--yes"],
					])
				).code,
			).toBe(2);
		expect(w.scenes).toHaveLength(2);
	});

	it("모양 오류와 글 오류, 성우 없는 화자의 줄도 한 번에 알린다", async () => {
		const lines = [
			{ speaker: 0, direction: "", text: "" },
			{ speaker: 9, direction: "", text: "없는 화자" },
			{ speaker: 2, direction: "", text: "가".repeat(305) },
		];
		const result = await run(gen(scene({ lines }), "--yes"));
		expect(result.code).toBe(2);
		expect(json(result).lines).toEqual([
			{ n: 1, reason: "대사" },
			{ n: 2, reason: "화자 번호" },
			{ n: 3, reason: "대사" },
		]);
		// 붙여 넣기 글은 성우를 주기 전에도 긴 줄을 알린다
		const text = await run([
			...["drama", "generate", "--out", ws.path("t.wav"), "--yes", "--json"],
			...["--input", ws.script(`가: 하나\n가: ${"나".repeat(301)}`, "t.txt")],
		]);
		expect(text.code).toBe(2);
		expect(json(text).lines).toEqual([{ n: 2, reason: "대사" }]);
		expect(w.calls).toEqual([]);
	});

	it("잘못된 줄은 번호를 모두 알리고 서버를 부르지 않는다", async () => {
		const lines = [
			{ speaker: 0, direction: "", text: "좋은 줄" },
			{ speaker: 0, direction: "", text: " " },
			{ speaker: 2, direction: "가".repeat(61), text: "긴 지시" },
			{ speaker: 2, direction: "", text: "나".repeat(301) },
			{ speaker: 0, direction: "", text: "표식 <|speaker:1|>" },
		];
		const result = await run(gen(scene({ lines }), "--yes"));
		expect(result.code).toBe(2);
		const { message, lines: bad } = json(result);
		expect(bad.map((row: { n: number }) => row.n)).toEqual([2, 3, 4, 5]);
		expect(message).toContain("줄 2");
		expect(message).toContain("줄 5");
		const shape = await run(
			gen(
				scene({
					lines: [
						{ speaker: 9, direction: "", text: "없는 화자" },
						{ speaker: 0, direction: "", text: 3 },
						{ speaker: 0, directon: "오타", text: "모르는 칸" },
						"글",
					],
				}),
				"--yes",
			),
		);
		expect(shape.code).toBe(2);
		expect(json(shape).lines.map((row: { n: number }) => row.n)).toEqual([
			1, 2, 3, 4,
		]);
		expect(w.calls).toEqual([]);
	});

	it.each([
		["판이 다름", { version: 2 }],
		["화자 없음", { speakers: [] }],
		[
			"화자 다섯",
			{
				speakers: "가나다라마"
					.split("")
					.map((name) => ({ name, voice: "fish_audio:fish" })),
			},
		],
		[
			"같은 이름",
			{
				speakers: [
					{ name: "가", voice: "fish_audio:fish" },
					{ name: " 가", voice: "fish_audio:fish" },
					{ name: "나", voice: "fish_audio:fish" },
				],
			},
		],
		[
			"긴 이름",
			{
				speakers: [
					{ name: "가".repeat(21), voice: "fish_audio:fish" },
					{ name: "나", voice: "fish_audio:fish" },
					{ name: "다", voice: "fish_audio:fish" },
				],
			},
		],
		["줄 없음", { lines: [] }],
		[
			"줄 51개",
			{
				lines: Array.from({ length: 51 }, () => ({
					speaker: 0,
					direction: "",
					text: "가",
				})),
			},
		],
		[
			"장면이 너무 김",
			{
				lines: Array.from({ length: 10 }, () => ({
					speaker: 0,
					direction: "",
					text: "가".repeat(201),
				})),
			},
		],
		["모르는 모델", { model: "s1" }],
		["속도 범위", { settings: { speed: 9, temperature: 0.7 } }],
		["모르는 칸", { scenename: "오타" }],
		["긴 장면 이름", { sceneName: "가".repeat(41) }],
		["배열", []],
	])("잘못된 장면(%s)은 2이고 서버를 부르지 않는다", async (_name, over) => {
		const value = Array.isArray(over) ? over : scene(over);
		const result = await run(gen(value, "--yes"));
		expect(result.code).toBe(2);
		const { code, message } = json(result);
		expect(code).toBe("INPUT");
		// 명령이나 옵션이 아니라 장면의 무엇이 틀렸는지 말한다
		expect(message).toMatch(
			/version|화자|이름이 겹|줄은|글자 수|model은|settings|모르는 칸|sceneName/,
		);
		expect(w.calls).toEqual([]);
	});

	it("화자 성우는 보관함의 쓸 수 있는 Fish Audio 성우여야 한다", async () => {
		const with0 = (voice: string | undefined) =>
			scene({
				speakers: [
					{ name: "민수", ...(voice ? { voice } : {}) },
					{ name: "빈 사람" },
					{ name: "영희", voice: "fish_audio:fish2" },
				],
			});
		for (const [voice, code] of [
			[undefined, 2],
			["typecast:v1", 2],
			["콜론없음", 2],
			["fish_audio:fishgone", 4],
			["fish_audio:unknown", 4],
		] as const) {
			const result = await run(gen(with0(voice), "--yes"));
			expect([voice, result.code]).toEqual([voice, code]);
			expect(json(result).message).toContain("민수");
		}
		expect(w.calls).not.toContain("dramaCreate");
		// --voice는 장면 파일의 성우보다 먼저고, 없는 화자 이름은 2다
		expect(
			(await run(gen(with0(undefined), "--voice", "철수=fish_audio:fish")))
				.code,
		).toBe(2);
		const given = await run(
			gen(with0("typecast:v1"), "--yes", "--voice", "민수=fish_audio:fish"),
		);
		expect(given.code).toBe(0);
		expect(w.scenes[0]?.request.speakers[0]?.voiceId).toBe("fish");
	});

	it("저장된 테이크가 있으면 만들지 않고, 최근 20개 밖이어도, 정리 전 글이 달라도 쓴다", async () => {
		const take = w.take(requestFor());
		for (let i = 0; i < 20; i += 1)
			w.take(requestFor(scene({ sceneName: `다른 장면 ${i}` })));
		const result = await run(gen());
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			source: "saved",
			result: { id: take.id },
		});
		const dirty = scene({
			sceneName: "첫 장면",
			lines: [
				{ speaker: 2, direction: "차갑게 침착", text: "어디  갔었어?\n" },
				{ speaker: 0, direction: "  ", text: "집에 있었어." },
			],
		});
		const again = await run(gen(dirty, "--overwrite"));
		expect(json(again).result.id).toBe(take.id);
		expect(w.synth).toBe(0);
	});

	it("--new만 새 테이크를 만들고 확인을 받는다", async () => {
		const old = w.take(requestFor());
		expect((await run(gen(scene(), "--new"))).code).toBe(2);
		expect(w.synth).toBe(0);
		const result = await run(gen(scene(), "--new", "--yes"));
		expect(result.code).toBe(0);
		expect(json(result).result.id).not.toBe(old.id);
		expect(w.synth).toBe(1);
	});

	it("비대화에서 --yes가 없으면 만들지 않고, 무료 모델은 기간 안에서만 묻지 않는다", async () => {
		const refused = await run(gen());
		expect(refused.code).toBe(2);
		expect(json(refused).code).toBe("CONFIRM_REQUIRED");
		expect(ws.records()).toEqual([]);
		const free = scene({ model: "s2.1-pro-free" });
		expect((await run(gen(free), ENDED)).code).toBe(2);
		expect(w.synth).toBe(0);
		expect((await run(gen(free), FREE)).code).toBe(0);
		expect(w.synth).toBe(1);
	});

	it("--dry-run은 저장 테이크와 예상 사용량만 본다", async () => {
		const result = await run(gen(scene(), "--dry-run"));
		expect(result.code).toBe(0);
		const { text } = sceneText(requestFor());
		expect(json(result)).toMatchObject({
			dryRun: true,
			request: { model: "s2.1-pro", speakers: 2, lines: 2 },
			saved: null,
			requestId: null,
			estimate: dramaUsage("s2.1-pro", utf8Bytes(text)),
			needsConfirm: true,
		});
		const take = w.take(requestFor());
		expect(json(await run(gen(scene(), "--dry-run"))).saved).toMatchObject({
			id: take.id,
			status: "done",
		});
		expect(w.synth).toBe(0);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
	});

	it("확인 프롬프트 둘이 함께 서 있어도 한 번만 만든다", async () => {
		const a = spawnTty(ws.dir, gen());
		const second = gen();
		second[5] = ws.path("second.wav");
		const b = spawnTty(ws.dir, second);
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		expect(a.seen()).toContain("예상 사용량");
		expect(a.seen()).toContain("s2.1-pro");
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		expect((await b.done).code).toBe(0);
		expect(w.synth).toBe(1);
		expect(existsSync(ws.path("second.wav"))).toBe(true);
	});

	it("선점한 프로세스가 만드는 동안 둘째 실행은 6이고 만들지 않는다", async () => {
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		w.on.dramaCreate = async (_input, next) => {
			await held;
			return next();
		};
		const first = spawnCli(ws.dir, gen(scene(), "--yes"));
		await until(() => count("dramaCreate") === 1, "생성");
		expect(ws.records()).toMatchObject([
			{ kind: "drama", provider: "fish_audio" },
		]);
		const second = await run(gen(scene(), "--yes"));
		expect(second.code).toBe(6);
		open();
		expect((await first.done).code).toBe(0);
		expect(w.synth).toBe(1);
	});

	it("응답을 잃으면 6이고, 같은 명령도 resume도 그 요청만 확인한다", async () => {
		loseCreate();
		const lost = await run(gen(scene(), "--yes"));
		expect(lost.code).toBe(6);
		const { requestId, message } = json(lost);
		expect(message).toContain("drama resume");
		expect(ws.records()).toMatchObject([{ requestId, kind: "drama" }]);
		expect(existsSync(ws.path("out.wav"))).toBe(false);
		w.hook = undefined;
		const list = json(await run(["drama", "resume", "--json"]));
		expect(list.requests).toMatchObject([{ requestId }]);
		expect(json(await run(["studio", "resume", "--json"])).requests).toEqual(
			[],
		);
		const wrong = await run(["studio", "resume", requestId, "--json"]);
		expect(wrong.code).toBe(2);
		expect(json(wrong).message).toContain("drama resume");
		const resumed = await run([
			...["drama", "resume", requestId, "--out", ws.path("r.wav"), "--json"],
		]);
		expect(resumed.code).toBe(0);
		expect(json(resumed)).toMatchObject({
			source: "resumed",
			result: { id: w.takes[0]?.id },
		});
		expect(ws.records()).toEqual([]);
		expect((await run(gen())).code).toBe(0);
		expect(w.synth).toBe(1);
	});

	it.each([
		["pending", 6, 1],
		["unknown", 6, 1],
		["없음", 6, 1],
		["failed", 5, 0],
	])(
		"기록이 남은 요청(%s)은 같은 명령에서 다시 보내지 않는다",
		async (state, code, left) => {
			loseCreate();
			await run(gen(scene(), "--yes"));
			w.hook = undefined;
			if (state === "없음") w.takes = [];
			else if (w.takes[0]) w.takes[0].status = state as never;
			const again = await run(gen(scene(), "--yes"));
			expect(again.code).toBe(code);
			expect(ws.records()).toHaveLength(left);
			expect(w.synth).toBe(1);
		},
	);

	it("서버 미확인 테이크가 있으면 6이고 --new만 만든다", async () => {
		const take = w.take(requestFor(), { status: "unknown" });
		const result = await run(gen(scene(), "--yes"));
		expect(result.code).toBe(6);
		expect(json(result).resultId).toBe(take.id);
		expect(w.synth).toBe(0);
		expect((await run(gen(scene(), "--yes", "--new"))).code).toBe(0);
		expect(w.synth).toBe(1);
	});

	it.each([
		["quota", "BAD_GATEWAY", 5, 0],
		["free_ended", "PRECONDITION_FAILED", 5, 0],
		["voice_unavailable", "BAD_REQUEST", 4, 0],
		["unknown_outcome", "GATEWAY_TIMEOUT", 6, 1],
		["", "INTERNAL_SERVER_ERROR", 6, 1],
	])(
		"서버 거절(%s %s)은 %i이고 기록은 %i개다",
		async (reason, code, exit, left) => {
			w.on.dramaCreate = () => {
				throw new ORPCError(code, { data: reason ? { reason } : undefined });
			};
			const result = await run(gen(scene(), "--yes"));
			expect(result.code).toBe(exit);
			expect(ws.records()).toHaveLength(left);
			expect(count("dramaCreate")).toBe(1);
		},
	);

	it.each([[[]], ["글"], [{}], [{ id: 1, status: "done" }]])(
		"저장 조회의 모양이 다르면(%j) 만들지 않고 5다",
		async (value) => {
			w.on.dramaFind = () => value;
			expect((await run(gen(scene(), "--yes"))).code).toBe(5);
			expect(w.synth).toBe(0);
		},
	);

	it("결과가 아닌 응답은 6이고 기록을 남긴다", async () => {
		w.on.dramaCreate = () => ({});
		expect((await run(gen(scene(), "--yes"))).code).toBe(6);
		expect(ws.records()).toHaveLength(1);
	});

	it("Ctrl+C: 확인 중이면 2, 응답 전이면 6, 내려받는 중이면 7이다", async () => {
		const tty = spawnTty(ws.dir, gen());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		w.on.dramaCreate = () => new Promise(() => {});
		const sending = spawnCli(ws.dir, gen(scene(), "--yes"));
		await until(() => count("dramaCreate") === 1, "생성");
		sending.child.kill("SIGINT");
		const sent = await sending.done;
		expect(sent.code).toBe(6);
		expect(json(sent).requestId).toBe(ws.records()[0]?.requestId);
		delete w.on.dramaCreate;
		writeFileSync(ws.requestsPath, JSON.stringify({ requests: {} }), {
			mode: 0o600,
		});
		w.on.dramaAudio = () => new Promise(() => {});
		const loading = spawnCli(ws.dir, gen(scene(), "--yes"));
		await until(() => count("dramaAudio") === 1, "내려받기");
		loading.child.kill("SIGINT");
		const cut = await loading.done;
		expect(cut.code).toBe(7);
		expect(json(cut).resultId).toBe(w.takes[0]?.id);
		expect(ws.leftovers()).toEqual([]);
	});

	it("출력 경로는 만들기 전에 보고, 조각의 길이·형식이 다르면 파일 0개와 7이다", async () => {
		writeFileSync(ws.path("out.wav"), "있음");
		expect((await run(gen(scene(), "--yes"))).code).toBe(2);
		symlinkSync(ws.path("out.wav"), ws.path("link.wav"));
		const link = gen(scene(), "--yes", "--overwrite");
		link[5] = ws.path("link.wav");
		expect((await run(link)).code).toBe(2);
		const mp3 = gen(scene(), "--yes");
		mp3[5] = ws.path("out.mp3");
		expect((await run(mp3)).code).toBe(2);
		expect(w.calls).toEqual([]);
		const big = Buffer.from(wavOf(bytesOf(STUDIO_PART_BYTES + 5000)));
		w.take(requestFor(), { audio: big });
		const ok = await run(gen(scene(), "--overwrite"));
		expect(ok.code).toBe(0);
		expect(readFileSync(ws.path("out.wav")).equals(big)).toBe(true);
		for (const bad of [
			// 머리는 맞고 끝만 잘린 조각
			(part: File) =>
				new File([part.slice(0, part.size - 1)], "a", { type: part.type }),
			(part: File) => new File([part.slice(1)], "a", { type: part.type }),
			(part: File) => new File([part], "a", { type: "audio/mpeg" }),
		]) {
			w.on.dramaAudio = async (_input, next) => bad(await next());
			const result = await run(gen(scene(), "--overwrite"));
			expect(result.code).toBe(7);
			expect(readFileSync(ws.path("out.wav")).equals(big)).toBe(true);
		}
		// 정확히 3MiB인 결과는 조각 하나다
		delete w.on.dramaAudio;
		const exact = Buffer.from(wavOf(bytesOf(STUDIO_PART_BYTES - 44)));
		w.takes = [];
		w.take(requestFor(), { audio: exact });
		expect((await run(gen(scene(), "--overwrite"))).code).toBe(0);
		expect(readFileSync(ws.path("out.wav")).equals(exact)).toBe(true);
	});
});
