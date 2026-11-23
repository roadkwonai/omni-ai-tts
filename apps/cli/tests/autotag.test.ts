import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ORPCError } from "@orpc/server";
import {
	applyAutoTag,
	autoTagBatches,
	autoTagChanges,
	autoTagInputOf,
	autoTagTargets,
} from "@tts-pilot-app/api/paragraph-autotag";
import {
	paragraphRequest,
	type VoiceSetup,
	type Work,
} from "@tts-pilot-app/api/paragraph-script";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import type { StudioAutoTagOutput } from "@tts-pilot-app/api/studio-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
	w.voices = [...w.voices, saved(voiceOf("airy", "ai"))];
	server = await w.serve();
	ws = workspace(server.origin);
});
afterEach(() => {
	server.close();
	ws.remove();
});
const setup = (provider: VoiceSetup["provider"], voiceId: string, over = {}) =>
	({
		provider,
		voiceId,
		settings: { ...DEFAULT_SETTINGS[provider], ...over },
	}) as VoiceSetup;
const FISH = setup("fish_audio", "fish");
// 앞의 둘이 2,000자를 나눠 묶음 셋이 된다
const long = () => ({
	defaultVoice: FISH as VoiceSetup | null,
	gap: 0.5,
	paragraphs: ["가", "나", "다"].map((char, i) => ({
		id: `p${i + 1}`,
		text: char.repeat(1500),
	})),
});
const mixed = () => ({
	...long(),
	paragraphs: [
		{ id: "a", text: "하나" },
		{ id: "b", text: " " },
		{
			id: "c",
			text: "셋",
			voice: setup("elevenlabs", "el", { model: "eleven_flash_v2_5" }),
		},
		{ id: "d", text: "넷", voice: setup("typecast", "gone") },
		{ id: "e", text: "다섯", voice: setup("gemini", "Kore") },
		{ id: "f", text: "여섯", voice: setup("airy", "ai") },
	],
});
const tag = (work: object, ...extra: string[]) => [
	...["studio", "autotag", "--work"],
	ws.script(JSON.stringify(work), "work.json"),
	...["--out", ws.path("out.json"), ...extra],
];
const run = (args: string[]) => spawnCli(ws.dir, args).done;
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const outFile = () => JSON.parse(readFileSync(ws.path("out.json"), "utf8"));
const calls = () => w.calls.filter((name) => name === "studioAutoTag").length;

describe("문단 자동 태그", { timeout: 60_000 }, () => {
	it("보낼 문단·묶음·적용이 웹 함수와 같다", async () => {
		const value = mixed();
		const work = { ...value, channelId: null } as Work;
		const { targets, skipped } = autoTagTargets(
			work.paragraphs,
			work,
			w.voices as never,
			(p) => paragraphRequest(p, work, w.voices as never, Date.now()),
			() => "unmade",
		);
		const batches = autoTagBatches(targets);
		const replies: StudioAutoTagOutput[] = [];
		w.on.studioAutoTag = (input, next) => {
			w.tagged.push(input);
			const reply = {
				paragraphs: input.paragraphs.map(
					(item: { text: string; provider: string; direction: string }) => ({
						text:
							item.provider === "fish_audio"
								? `[laughs] ${item.text}`
								: item.text,
						direction: item.provider === "gemini" ? "차분하게" : "",
						...(item.provider === "airy"
							? { feel: { airy: { style: "calm" } } }
							: {}),
					}),
				),
				skipped: 0,
			};
			replies.push(reply);
			void next;
			return reply;
		};
		const result = await run(tag(value, "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(w.tagged).toEqual(batches.map(autoTagInputOf));
		const changes = batches.flatMap((batch, i) =>
			autoTagChanges(batch, replies[i] as StudioAutoTagOutput),
		);
		const { paragraphs } = applyAutoTag(
			work.paragraphs,
			work,
			changes,
			new Set(changes.map(({ id }) => id)),
		);
		expect(outFile()).toEqual({ ...value, paragraphs });
		expect(json(result)).toMatchObject({
			paragraphs: 3,
			skipped,
			remake: [],
			changed: [
				{ n: 1, fields: [{ field: "text", after: "[laughs] 하나" }] },
				{ n: 5, fields: [{ field: "direction", after: "차분하게" }] },
				{ n: 6, fields: [{ field: "style" }] },
			],
		});
		expect(w.synth).toBe(0);
	});

	it("다시 만들어야 하는 문단과 --only를 안다", async () => {
		const value = mixed();
		const work = { ...value, channelId: null } as Work;
		const p = work.paragraphs[0];
		const request =
			p && paragraphRequest(p, work, w.voices as never, Date.now());
		if (request) w.add(request);
		const result = await run(tag(value, "--only", "1", "--yes", "--json"));
		expect(json(result)).toMatchObject({ remake: [1], paragraphs: 1 });
		expect(w.tagged[0]?.paragraphs).toHaveLength(1);
		// 고르지 않은 문단은 그대로다
		expect(outFile().paragraphs.slice(1)).toEqual(value.paragraphs.slice(1));
	});

	it("비대화에서 --yes가 없거나 확인을 거절하면 0회이고 확인문에 최대 호출 수가 있다", async () => {
		const result = await run(tag(long(), "--json"));
		expect(result.code).toBe(2);
		expect(json(result).code).toBe("CONFIRM_REQUIRED");
		const tty = spawnTty(ws.dir, tag(long()));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		expect(tty.seen()).toContain(`작업실 ${server.origin}`);
		expect(tty.seen()).toContain("묶음 3개");
		expect(tty.seen()).toContain("최대 12회");
		expect(tty.seen()).toContain("OpenAI 3, Gemini 1");
		tty.write("n\r");
		expect((await tty.done).code).toBe(2);
		expect(calls()).toBe(0);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it("--dry-run은 수만 보이고 부르지 않는다", async () => {
		const result = await run(tag(mixed(), "--dry-run", "--json"));
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			dryRun: true,
			paragraphs: [1, 5, 6],
			skipped: 1,
			batches: 1,
			maxCalls: 4,
		});
		expect(calls()).toBe(0);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it.each([
		["network", undefined, 6],
		["unknown_outcome", "GATEWAY_TIMEOUT", 6],
		["", "INTERNAL_SERVER_ERROR", 6],
		["quota", "BAD_GATEWAY", 5],
		["rate_limit", "TOO_MANY_REQUESTS", 5],
		["", "UNAUTHORIZED", 3],
	])(
		"첫 묶음이 실패(%s %s)하면 파일 0개와 %i이고 다시 부르지 않는다",
		async (reason, code, exit) => {
			w.hook = (path, _request, response) => {
				if (code !== undefined || !path.includes("studioAutoTag")) return false;
				w.calls.push("studioAutoTag");
				response.destroy();
				return true;
			};
			w.on.studioAutoTag = () => {
				throw new ORPCError(code ?? "INTERNAL_SERVER_ERROR", {
					data: reason ? { reason } : undefined,
				});
			};
			const result = await run(tag(long(), "--yes", "--json"));
			expect(result.code).toBe(exit);
			const body = json(result);
			expect(body).toMatchObject({ paragraph: 1 });
			expect(body.message).toContain("과금됐을 수 있습니다");
			expect(calls()).toBe(1);
			expect(existsSync(ws.path("out.json"))).toBe(false);
		},
	);

	it("둘째 묶음이 실패하면 앞 묶음을 게시하고 이어 가는 명령을 알린다", async () => {
		w.on.studioAutoTag = (_input, next) => {
			if (calls() === 2)
				throw new ORPCError("BAD_GATEWAY", { data: { reason: "quota" } });
			return next();
		};
		const value = long();
		const result = await run(tag(value, "--yes", "--json"));
		expect(result.code).toBe(5);
		expect(json(result)).toMatchObject({
			reason: "quota",
			paragraph: 2,
			remaining: "2-3",
			out: ws.path("out.json"),
		});
		// 다른 작업실에서 실행해도 같은 작업실로 이어 간다
		expect(result.err).toContain(
			`omni-tts studio autotag --url ${server.origin} --work ${ws.path("out.json")} --only 2-3 --out ${ws.path("out.json")} --overwrite`,
		);
		expect(calls()).toBe(2);
		const partial = outFile();
		expect(partial.paragraphs[0].text).toBe(`[laughs] ${"가".repeat(1500)}`);
		expect(partial.paragraphs.slice(1)).toEqual(value.paragraphs.slice(1));
		// 이어 가기
		delete w.on.studioAutoTag;
		const rest = await run([
			...["studio", "autotag", "--work", ws.path("out.json"), "--only", "2-3"],
			...["--out", ws.path("out.json"), "--overwrite", "--yes", "--json"],
		]);
		expect(rest.code).toBe(0);
		expect(w.tagged.at(-1)?.paragraphs).toHaveLength(1);
		expect(
			outFile().paragraphs.every((p: { text: string }) =>
				p.text.startsWith("[laughs]"),
			),
		).toBe(true);
		expect(calls()).toBe(4);
	});

	it("모양이 다른 응답은 처리 여부 미확인(6)이다", async () => {
		w.on.studioAutoTag = () => ({ paragraphs: [], skipped: 0 });
		const result = await run(tag(long(), "--yes", "--json"));
		expect(result.code).toBe(6);
		expect(calls()).toBe(1);
		expect(existsSync(ws.path("out.json"))).toBe(false);
	});

	it.each([1, 2])("Ctrl+C: %i번째 묶음에서 멈추면 6이다", async (nth) => {
		w.on.studioAutoTag = (_input, next) =>
			calls() === nth ? new Promise(() => {}) : next();
		const started = spawnCli(ws.dir, tag(long(), "--yes", "--json"));
		await until(() => calls() === nth, "호출");
		started.child.kill("SIGINT");
		const result = await started.done;
		expect(result.code).toBe(6);
		expect(json(result).paragraph).toBe(nth);
		expect(existsSync(ws.path("out.json"))).toBe(nth === 2);
		if (nth === 2) expect(outFile().paragraphs[0].text).toContain("[laughs]");
		expect(ws.leftovers()).toEqual([]);
	});

	it("출력 경로와 보낼 문단을 먼저 검사한다", async () => {
		writeFileSync(ws.path("out.json"), "있음");
		expect((await run(tag(long(), "--yes"))).code).toBe(2);
		expect(readFileSync(ws.path("out.json"), "utf8")).toBe("있음");
		const none = { ...mixed(), paragraphs: mixed().paragraphs.slice(1, 4) };
		expect((await run(tag(none, "--yes", "--overwrite"))).code).toBe(2);
		expect(calls()).toBe(0);
	});
});
