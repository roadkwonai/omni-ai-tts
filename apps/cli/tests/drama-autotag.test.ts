import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ORPCError } from "@orpc/server";
import {
	autoTagApply,
	autoTagChanges,
	autoTagInput,
} from "@tts-pilot-app/api/drama-autotag";
import { dramaRequestSchema } from "@tts-pilot-app/api/drama-contract";
import {
	actingOf,
	allFish,
	type DraftLine,
	newSpeaker,
	readRequests,
	requestOf,
	speakerValue,
	usableSpeakers,
	voiceOfSpeaker,
} from "@tts-pilot-app/api/drama-request";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// 공용 모듈에 없는 감정 칸 글은 웹 함수와 같은지 대조한다
import { feelText, shownFeel } from "../../web/src/lib/drama-view";
import { feelLabel } from "../src/drama.js";
import {
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
beforeEach(async () => {
	w = studioWorld();
	w.voices = [
		...w.voices,
		saved(voiceOf("airy", "ai")),
		saved(
			voiceOf("typecast", "v30", {
				models: [{ model: "ssfm-v30", emotions: ["normal", "happy", "sad"] }],
			}),
		),
	];
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});

const scene = () => ({
	version: 1,
	sceneName: "장면",
	speakers: [
		{ name: "가", voice: "fish_audio:fish" },
		{ name: "나", voice: "fish_audio:fish" },
	],
	lines: [
		{ speaker: 0, direction: "calm", text: "하나" },
		{ speaker: 1, direction: "", text: " " },
		{ speaker: 1, direction: "", text: "셋" },
	],
	model: "s2.1-pro",
	settings: { speed: 1, temperature: 0.7 },
});
const mixed = () => ({
	version: 1,
	speakers: [
		{ name: "타입", voice: "typecast:v30" },
		{ name: "에어리", voice: "airy:ai" },
		{ name: "쓰지 않음", voice: "elevenlabs:el" },
	],
	lines: [
		{ speaker: 1, direction: "숨은 지시", text: "하나" },
		{ speaker: 0, direction: "", text: "둘" },
	],
});
type Value = ReturnType<typeof scene> | ReturnType<typeof mixed>;
const draftOf = (value: Value) => {
	const speakers = usableSpeakers(
		value.speakers.map(({ name, voice }) => {
			const [provider = "", voiceId = ""] = voice.split(":");
			return { ...newSpeaker(name), provider: provider as ProviderId, voiceId };
		}),
		w.voices as never,
		[],
	);
	const lines: DraftLine[] = value.lines.map((line, i) => ({
		...line,
		id: String(i),
	}));
	const fishOnly = allFish(speakers, lines);
	const cast = (index: number) => {
		const speaker = speakers[index] ?? newSpeaker("");
		return actingOf(
			speaker,
			voiceOfSpeaker(speaker, w.voices as never),
			speakerValue(speaker, []),
			"s2.1-pro",
			fishOnly,
		);
	};
	return { speakers, lines, fishOnly, cast };
};
const tag = (value: object, ...extra: string[]) => [
	...["drama", "autotag", "--input"],
	ws.script(JSON.stringify(value), "scene.json"),
	...["--out", ws.path("out.json"), ...extra],
];
const run = (args: string[]) => spawnCli(ws.dir, args).done;
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const outFile = () => JSON.parse(readFileSync(ws.path("out.json"), "utf8"));
const calls = () => w.calls.filter((name) => name === "dramaAutoTag").length;
const reply = (
	lines: { direction: string; text: string; feel?: object }[],
	skipped = 0,
) => {
	w.on.dramaAutoTag = (input) => {
		w.dramaTagged.push(input);
		return { lines, skipped };
	};
};

describe("drama autotag", { timeout: 60_000 }, () => {
	it("모두 Fish면 장면으로, 빈 줄을 빼고 웹과 같은 입력을 한 번 보낸다", async () => {
		const value = scene();
		const { speakers, lines, fishOnly, cast } = draftOf(value);
		const { input, sent } = autoTagInput(speakers, lines, cast, fishOnly);
		const answer = [
			{ direction: "icy calm", text: "하나 [laughs]" },
			{ direction: "", text: "셋" },
		];
		reply(answer);
		const result = await run(tag(value, "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(w.dramaTagged).toEqual([JSON.parse(JSON.stringify(input))]);
		expect(input.mode).toBe("scene");
		const changes = autoTagChanges(sent, answer, () => null);
		const applied = autoTagApply(lines, changes).lines.map(
			({ id: _, ...line }) => line,
		);
		expect(outFile()).toEqual({ ...value, lines: applied });
		expect(json(result)).toMatchObject({
			out: ws.path("out.json"),
			mode: "scene",
			lines: 2,
			skipped: 0,
			remake: [],
			changed: [
				{
					n: 1,
					fields: [
						{ field: "direction", before: "calm", after: "icy calm" },
						{ field: "text", after: "하나 [laughs]" },
					],
				},
			],
		});
		// 만든 장면 파일을 그대로 쓸 수 있다
		const made = await run([
			...["drama", "generate", "--input", ws.path("out.json"), "--dry-run"],
			...["--out", ws.path("a.wav"), "--json"],
		]);
		expect(made.code).toBe(2); // 빈 줄이 남아 있다
		expect(json(made).lines).toMatchObject([{ n: 2 }]);
	});

	it("공급자가 섞이면 읽기로 보내고 감정 칸까지 적용한다", async () => {
		const value = mixed();
		const { speakers, lines, fishOnly, cast } = draftOf(value);
		const { input, sent } = autoTagInput(speakers, lines, cast, fishOnly);
		const answer = [
			{
				direction: "",
				text: "하나",
				feel: { airy: { style: "bright" as const } },
			},
			{
				direction: "",
				text: "둘",
				feel: { typecast: { emotion: "happy" as const, intensity: 1.5 } },
			},
		];
		reply(answer, 1);
		const result = await run(tag(value, "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(w.dramaTagged).toEqual([JSON.parse(JSON.stringify(input))]);
		expect(input.mode).toBe("read");
		const label = (line: DraftLine, feel: DraftLine["feel"]) => {
			const speaker = speakers[line.speaker] ?? newSpeaker("");
			const { family } = cast(line.speaker);
			return feelText(
				family,
				shownFeel(
					voiceOfSpeaker(speaker, w.voices as never),
					speakerValue(speaker, []),
					family,
					feel,
				),
			);
		};
		const changes = autoTagChanges(sent, answer, label);
		expect(changes).toHaveLength(2);
		const applied = autoTagApply(lines, changes).lines.map(
			({ id: _, ...line }) => line,
		);
		expect(outFile()).toEqual({ ...value, lines: applied });
		// 숨은 지시는 지우지 않는다
		expect(outFile().lines[0].direction).toBe("숨은 지시");
		expect(json(result)).toMatchObject({
			mode: "read",
			skipped: 1,
			changed: changes.map(({ n, fields }) => ({ n, fields })),
		});
	});

	it("감정 칸 글은 웹과 같다", () => {
		const voices = [
			voiceOf("typecast", "v30", {
				models: [{ model: "ssfm-v30", emotions: ["normal", "happy"] }],
			}),
			voiceOf("typecast", "v21", {
				models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
			}),
			null,
		];
		const feels = [
			undefined,
			{ typecast: { emotion: "smart" as const, intensity: 1 } },
			{ typecast: { emotion: "happy" as const, intensity: 1.5 } },
			{ typecast: { emotion: "sad" as const, intensity: 0.5 } },
			{ airy: { style: "whisper" as const } },
		];
		const families = [
			["typecast", "typecast_v30"],
			["typecast", "typecast_v21"],
			["airy", "airy"],
			["fish_audio", "fish_s2"],
			["gemini", "gemini"],
		] as const;
		for (const voice of voices)
			for (const feel of feels)
				for (const [provider, family] of families) {
					const value = { provider, settings: DEFAULT_SETTINGS[provider] };
					expect(feelLabel(voice as never, value as never, family, feel)).toBe(
						feelText(
							family,
							shownFeel(voice as never, value as never, family, feel),
						),
					);
				}
	});

	it("이미 만든 줄이나 장면이 바뀌면 다시 만들어야 함을 알린다", async () => {
		const value = scene();
		value.lines.splice(1, 1);
		const { speakers } = draftOf(value);
		w.take(
			dramaRequestSchema.parse(
				requestOf({ ...value, speakers, model: "s2.1-pro" }),
			),
		);
		const made = await run(tag(value, "--yes", "--json"));
		expect(json(made).remake).toEqual([1, 2]);
		const other = mixed();
		const draft = draftOf(other);
		const read = readRequests(
			draft.speakers,
			draft.lines,
			{
				saved: w.voices as never,
				presets: [],
				headerModel: "s2.1-pro",
				now: Date.now(),
			},
			"1",
			1,
		);
		if ("problem" in read) throw new Error("막힌 줄");
		const request = read.lines[0]?.request;
		if (request) w.add(request, { kind: "trial" });
		const lines = await run(tag(other, "--yes", "--overwrite", "--json"));
		expect(json(lines).remake).toEqual([2]);
		expect(w.synth).toBe(0);
	});

	it("무료 모델이 끝난 뒤에도 무료로 만든 줄을 이미 만든 줄로 센다", async () => {
		const other = mixed();
		other.speakers[1] = { name: "피시", voice: "fish_audio:fish" };
		const { speakers, lines } = draftOf(other);
		const read = readRequests(
			...[speakers, lines],
			{
				...{ saved: w.voices as never, presets: [], headerModel: "s2.1-pro" },
				now: Date.parse("2026-11-29T23:59:00+09:00"),
			},
			...(["0", 1] as const),
		);
		if ("problem" in read) throw new Error("막힌 줄");
		const request = read.lines[0]?.request;
		expect(request?.settings.model).toBe("s2.1-pro-free");
		if (request) w.add(request, { kind: "trial" });
		const result = await spawnCli(
			ws.dir,
			tag(other, "--yes", "--json"),
			...["", "2026-11-30T00:01:00+09:00"],
		).done;
		expect(json(result).remake).toEqual([1]);
	});

	it("확인 없이 부르지 않고 --dry-run은 수만 보인다", async () => {
		const refused = await run(tag(scene(), "--json"));
		expect(refused.code).toBe(2);
		expect(json(refused).code).toBe("CONFIRM_REQUIRED");
		const tty = spawnTty(ws.dir, tag(scene()));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		expect(tty.seen()).toContain(`작업실 ${server.origin}`);
		expect(tty.seen()).toContain("최대 4회");
		expect(tty.seen()).toContain("OpenAI 3, Gemini 1");
		tty.write("n\r");
		expect((await tty.done).code).toBe(2);
		const dry = await run(tag(scene(), "--dry-run", "--json"));
		expect(dry.code).toBe(0);
		expect(json(dry)).toMatchObject({
			dryRun: true,
			mode: "scene",
			lines: [1, 3],
			maxCalls: 4,
			needsConfirm: true,
		});
		expect(calls()).toBe(0);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it.each([
		["network", undefined, 6],
		["unknown_outcome", "GATEWAY_TIMEOUT", 6],
		["", "INTERNAL_SERVER_ERROR", 6],
		["quota", "BAD_GATEWAY", 5],
		["", "UNAUTHORIZED", 3],
	])(
		"실패(%s %s)하면 파일 0개와 %i이고 다시 부르지 않는다",
		async (reason, code, exit) => {
			w.hook = (path, _request, response) => {
				if (code !== undefined || !path.includes("dramaAutoTag")) return false;
				w.calls.push("dramaAutoTag");
				response.destroy();
				return true;
			};
			w.on.dramaAutoTag = () => {
				throw new ORPCError(code ?? "INTERNAL_SERVER_ERROR", {
					data: reason ? { reason } : undefined,
				});
			};
			const result = await run(tag(scene(), "--yes", "--json"));
			expect(result.code).toBe(exit);
			expect(json(result).message).toContain("과금됐을 수 있습니다");
			expect(calls()).toBe(1);
			expect(existsSync(ws.path("out.json"))).toBe(false);
		},
	);

	it.each([
		["줄 수", { lines: [], skipped: 0 }],
		["모양", { lines: "글" }],
	])("%s가 다른 응답은 6이고 파일 0개다", async (_name, value) => {
		w.on.dramaAutoTag = () => value;
		expect((await run(tag(scene(), "--yes", "--json"))).code).toBe(6);
		expect(calls()).toBe(1);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it("Ctrl+C는 보내기 전 2, 보낸 뒤 6이고 파일 0개다", async () => {
		const tty = spawnTty(ws.dir, tag(scene()));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		w.on.dramaAutoTag = () => new Promise(() => {});
		const sent = spawnCli(ws.dir, tag(scene(), "--yes", "--json"));
		await until(() => calls() === 1, "호출");
		sent.child.kill("SIGINT");
		expect((await sent.done).code).toBe(6);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it("보낼 수 없는 줄은 원래 번호로, 출력 경로는 먼저 알린다", async () => {
		const long = scene();
		const line = long.lines[2];
		if (line) line.text = "가".repeat(301);
		const bad = await run(tag(long, "--yes", "--json"));
		expect(bad.code).toBe(2);
		expect(json(bad).lines).toMatchObject([{ n: 3 }]);
		// 모양 오류와 글 오류를 함께 알린다
		const both = scene();
		const wrong = both.lines[0];
		if (wrong) wrong.speaker = 9;
		const last = both.lines[2];
		if (last) last.text = "가".repeat(301);
		const all = await run(tag(both, "--yes", "--json"));
		expect(all.code).toBe(2);
		expect(json(all).lines.map((row: { n: number }) => row.n)).toEqual([1, 3]);
		const blank = scene();
		for (const item of blank.lines) item.text = " ";
		expect((await run(tag(blank, "--yes"))).code).toBe(2);
		writeFileSync(ws.path("out.json"), "있음");
		expect((await run(tag(scene(), "--yes"))).code).toBe(2);
		expect(readFileSync(ws.path("out.json"), "utf8")).toBe("있음");
		expect(calls()).toBe(0);
	});
});
