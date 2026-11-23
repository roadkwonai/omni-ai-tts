import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { ORPCError } from "@orpc/server";
import {
	DEFAULT_SETTINGS,
	requestOf,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	bytesOf,
	COOKIE,
	type serve,
	spawnCli,
	spawnTty,
	studioWorld,
	until,
	voiceOf,
	workspace,
} from "./harness.js";

const TEXT = "안녕하세요. 비밀 문장입니다.";
const OTHER = "11111111-1111-4111-8111-111111111111";
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

const run = (args: string[], input?: string | Buffer) =>
	spawnCli(ws.dir, args, input).done;
const gen = (...extra: string[]) => [
	"trial",
	"generate",
	"--voice",
	"typecast:v1",
	"--text",
	TEXT,
	"--out",
	ws.path("out.mp3"),
	...extra,
];
const settings = (value: unknown) =>
	ws.script(
		typeof value === "string" ? value : JSON.stringify(value),
		"settings.json",
	);
const request = (text = TEXT): TrialRequest =>
	requestOf(voiceOf("typecast", "v1") as never, text, DEFAULT_SETTINGS);
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const count = (name: string) => w.calls.filter((item) => item === name).length;
const reject = (code: string, reason?: string) => () => {
	throw new ORPCError(code, { data: reason ? { reason } : undefined });
};
// 서버는 만들었고 응답만 끊긴다
const loseCreate = (name = "trialCreate") => {
	w.hook = (path, _request, response) => {
		if (path.includes(name))
			response.writeHead = (() => {
				response.destroy();
				return response;
			}) as never;
		return false;
	};
};

describe("시험 생성 정상", { timeout: 60_000 }, () => {
	it("만든 오디오를 그대로 파일로 받고 기록을 지운다", async () => {
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(0);
		expect(json(result)).toEqual({
			origin: server.origin,
			source: "created",
			result: {
				id: w.rows[0]?.id,
				createdAt: w.rows[0]?.createdAt,
				usage: { unit: "credit", amount: 5 },
				bytes: 1234,
			},
			out: ws.path("out.mp3"),
			mime: "audio/mpeg",
		});
		expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
		expect(statSync(ws.path("out.mp3")).mode & 0o777).toBe(0o600);
		expect(w.synth).toBe(1);
		expect(w.calls).not.toContain("trialAudio");
		expect(w.calls).not.toContain("studioCreate");
		expect(ws.records()).toEqual([]);
	});

	it("파일과 stdin의 문장을 받고 설정 파일의 값으로 만든다", async () => {
		const args = gen("--yes", "--settings", settings({ tempo: 1.25 }));
		args[4] = "--input";
		args[5] = "-";
		expect((await run(args, `﻿${TEXT}\n`)).code).toBe(0);
		expect(w.created[0]?.request).toMatchObject({
			text: TEXT,
			settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.25 },
		});
		const file = gen("--yes", "--overwrite");
		file[4] = "--input";
		file[5] = ws.script("다른 문장");
		expect((await run(file)).code).toBe(0);
		expect(w.created[1]?.request.text).toBe("다른 문장");
	});

	it("담지 않은 성우도 목록에서 찾아 만들고 Gemini는 .wav다", async () => {
		w.catalog = [voiceOf("gemini", "Puck")];
		const args = gen("--yes", "--json");
		args[3] = "gemini:Puck";
		args[7] = ws.path("g.wav");
		expect(json(await run(args))).toMatchObject({ mime: "audio/wav" });
		args[7] = ws.path("g.mp3");
		expect((await run(args)).code).toBe(2);
		expect(w.synth).toBe(1);
	});

	it("목록·내려받기·지우기를 한다", async () => {
		await run(gen("--yes"));
		const id = w.rows[0]?.id ?? "";
		const list = await run([
			"trial",
			"list",
			"--voice",
			"typecast:v1",
			"--json",
		]);
		expect(json(list)).toMatchObject({
			origin: server.origin,
			results: [{ id, request: { text: TEXT }, usage: { amount: 5 } }],
		});
		const human = await run(["trial", "list", "--voice", "typecast:v1"]);
		expect(human.out).toContain(id);
		expect(human.out).toContain(TEXT);
		expect(human.out).toContain("5크레딧");
		const got = await run([
			"trial",
			"download",
			id,
			"--out",
			ws.path("again.mp3"),
			"--json",
		]);
		expect(json(got)).toMatchObject({ source: "saved", result: { id } });
		expect(readFileSync(ws.path("again.mp3")).equals(w.audio)).toBe(true);
		const removed = await run(["trial", "remove", id, "--yes", "--json"]);
		expect(json(removed)).toEqual({ origin: server.origin, removed: id });
		expect(w.rows).toEqual([]);
		expect(
			(await run(["trial", "list", "--voice", "typecast:v1"])).out,
		).toContain("없습니다");
		expect(w.synth).toBe(1);
	});

	it("도움말에 시험 생성 명령을 안내한다", async () => {
		const { out } = await run(["--help"]);
		for (const word of [
			"trial generate",
			"trial list",
			"trial download",
			"trial resume",
			"trial remove",
			"200자",
		])
			expect(out).toContain(word);
	});
});

describe("시험 생성 과금 막기", { timeout: 60_000 }, () => {
	it("--yes 없는 비대화와 stdin은 2로 끝나고 합성하지 않는다", async () => {
		expect(json(await run(gen("--json"))).code).toBe("CONFIRM_REQUIRED");
		const args = gen("--json");
		args[4] = "--input";
		args[5] = "-";
		expect((await run(args, TEXT)).code).toBe(2);
		expect(w.calls).not.toContain("trialCreate");
		expect(ws.records()).toEqual([]);
	});

	it("저장 결과가 있으면 trialFindMany로 찾아 오디오만 받는다", async () => {
		const row = w.add(request(), { kind: "trial" });
		const result = await run(gen("--json"));
		expect(json(result)).toMatchObject({
			source: "saved",
			result: { id: row.id, bytes: 1234 },
		});
		expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
		expect(w.calls).not.toContain("trialCreate");
	});

	it("작업실의 저장 결과와 기록은 시험 생성의 것이 아니다", async () => {
		w.add(request());
		loseCreate("studioCreate");
		const studio = [
			...["studio", "generate", "--voice", "typecast:v1", "--new", "--yes"],
			...["--input", ws.script(TEXT), "--out", ws.path("s.mp3"), "--json"],
		];
		const studioId = json(await run(studio)).requestId;
		w.hook = undefined;
		loseCreate();
		const trialId = json(await run(gen("--yes", "--json"))).requestId;
		w.hook = undefined;
		expect(ws.records()).toMatchObject([
			{ requestId: studioId },
			{ requestId: trialId, kind: "trial" },
		]);
		expect(ws.records()[0]?.kind).toBeUndefined();
		const ids = async (group: string) =>
			json(await run([group, "resume", "--json"])).requests.map(
				(item: { requestId: string }) => item.requestId,
			);
		expect(await ids("studio")).toEqual([studioId]);
		expect(await ids("trial")).toEqual([trialId]);
		const calls = w.calls.length;
		for (const [group, id, right] of [
			["studio", trialId, "trial resume"],
			["trial", studioId, "studio resume"],
		] as const) {
			const wrong = await run([group, "resume", id, "--json"]);
			expect(wrong.code).toBe(2);
			expect(json(wrong).message).toContain(right);
		}
		expect(w.calls).toHaveLength(calls);
		expect(ws.records()).toHaveLength(2);
	});

	it("--dry-run은 생성과 기록 변경이 없다", async () => {
		const result = await run(gen("--dry-run", "--json"));
		expect(json(result)).toMatchObject({
			dryRun: true,
			saved: null,
			estimate: { unit: "credit", amount: [...TEXT].length },
		});
		expect(result.out).not.toContain("비밀");
		const row = w.add(request(), { kind: "trial" });
		expect(json(await run(gen("--dry-run", "--json"))).saved).toMatchObject({
			id: row.id,
			status: "done",
		});
		expect(w.calls).not.toContain("trialCreate");
		expect(w.calls).not.toContain("trialAudio");
		expect(existsSync(ws.requestsPath)).toBe(false);
		expect(existsSync(ws.path("out.mp3"))).toBe(false);
	});

	it("같은 입력을 동시에 실행해도 합성은 1회다", async () => {
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		w.on.trialCreate = async (_input, next) => {
			await held;
			return next();
		};
		const first = spawnCli(ws.dir, gen("--yes", "--json"));
		await until(() => w.calls.includes("trialCreate"), "첫 생성");
		const second = await run(gen("--yes", "--json"));
		expect(second.code).toBe(6);
		expect(json(second).message).toContain("trial resume");
		open();
		expect((await first.done).code).toBe(0);
		expect(w.synth).toBe(1);
	});

	it("확인 프롬프트에 함께 선 둘째 프로세스는 첫 결과를 받는다", async () => {
		const second = gen();
		second[7] = ws.path("second.mp3");
		const a = spawnTty(ws.dir, gen());
		const b = spawnTty(ws.dir, second);
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		expect((await b.done).code).toBe(0);
		expect(readFileSync(ws.path("second.mp3")).equals(w.audio)).toBe(true);
		expect(w.synth).toBe(1);
	});

	it("확인 프롬프트에 5분 넘게 선 사이 앞 요청의 완료 저장이 실패했으면 6이다", async () => {
		w.trialStatus = "pending";
		const second = gen();
		second[7] = ws.path("second.mp3");
		const b = spawnTty(ws.dir, second);
		await until(() => b.seen().includes("[y/N]"), "확인 프롬프트");
		expect((await run(gen("--yes"))).code).toBe(0);
		// 5분이 지나 서버가 미확인으로 읽는다. trialFindMany는 완료만 보므로 기록이 유일한 방어다
		if (w.rows[0]) w.rows[0].status = "unknown";
		b.write("y\r");
		expect((await b.done).code).toBe(6);
		expect(w.synth).toBe(1);
	});

	it("선점 뒤 재조회가 완료면 만들지 않고, 실패하면 내 기록을 지운다", async () => {
		w.on.trialFindMany = (_input, next) => {
			if (count("trialFindMany") === 1) return [null];
			w.add(request(), { kind: "trial" });
			return next();
		};
		expect(json(await run(gen("--yes", "--json"))).source).toBe("saved");
		w.calls.length = 0;
		w.rows.length = 0;
		w.on.trialFindMany = () =>
			count("trialFindMany") === 1
				? [null]
				: reject("SERVICE_UNAVAILABLE", "storage")();
		expect((await run(gen("--yes", "--overwrite"))).code).toBe(5);
		expect(ws.records()).toEqual([]);
		expect(w.synth).toBe(0);
	});

	it.each([{}, null, "글"])(
		"저장 결과 조회가 배열이 아니면(%j) 만들지 않고 5다",
		async (value) => {
			w.on.trialFindMany = () => value;
			expect((await run(gen("--yes"))).code).toBe(5);
			expect(w.calls).not.toContain("trialCreate");
		},
	);
});

describe("시험 생성 기록 해제", { timeout: 60_000 }, () => {
	it.each([
		["pending", "파일 성공"],
		["unknown", "파일 성공"],
		["없음", "파일 성공"],
		["조회 실패", "파일 성공"],
		["pending", "파일 실패"],
		["조회 실패", "파일 실패"],
	] as const)(
		"응답을 받아도 요청 상태가 %s면 기록을 남긴다(%s). 다시 실행하면 합성 없이 6이다",
		async (status, file) => {
			if (status === "pending" || status === "unknown") w.trialStatus = status;
			if (status === "없음") w.on.trialRequest = () => null;
			if (status === "조회 실패")
				w.on.trialRequest = reject("SERVICE_UNAVAILABLE", "storage");
			if (file === "파일 실패")
				w.on.trialCreate = (_input, next) => {
					writeFileSync(ws.path("out.mp3"), "먼저 온 파일");
					return next();
				};
			const result = await run(gen("--yes", "--json"));
			const [record] = ws.records();
			expect(record).toMatchObject({ kind: "trial" });
			const body = json(result);
			expect(body.requestId).toBe(record?.requestId);
			if (file === "파일 실패") {
				expect(result.code).toBe(7);
				expect(body.resultId).toBe(w.rows[0]?.id);
				expect(readFileSync(ws.path("out.mp3"), "utf8")).toBe("먼저 온 파일");
			} else {
				expect(result.code).toBe(0);
				expect(result.err).toContain("trial resume");
				expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
			}
			const again = await run(gen("--yes", "--overwrite", "--json"));
			expect(again.code).toBe(6);
			expect(json(again).requestId).toBe(record?.requestId);
			expect(w.synth).toBe(1);
			expect(ws.records()).toHaveLength(1);
		},
	);

	it("파일을 쓰지 못해도 완료면 기록을 지우고 결과 ID로 다시 받는다", async () => {
		w.on.trialCreate = (_input, next) => {
			writeFileSync(ws.path("out.mp3"), "먼저 온 파일");
			return next();
		};
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(7);
		const body = json(result);
		expect(body).toMatchObject({
			code: "DOWNLOAD_FAILED",
			resultId: w.rows[0]?.id,
		});
		expect(body.requestId).toBeUndefined();
		expect(body.message).toContain("trial download");
		expect(ws.records()).toEqual([]);
		expect(ws.leftovers()).toEqual([]);
		expect(
			(
				await run([
					"trial",
					"download",
					body.resultId,
					"--out",
					ws.path("b.mp3"),
				])
			).code,
		).toBe(0);
		expect(w.synth).toBe(1);
	});

	it("파일을 먼저 쓰고 나서 완료를 확인한다", async () => {
		let before = false;
		w.on.trialRequest = (_input, next) => {
			before = existsSync(ws.path("out.mp3"));
			return next();
		};
		expect((await run(gen("--yes"))).code).toBe(0);
		expect(before).toBe(true);
	});

	it.each([
		["빈 오디오", () => new File([], "a", { type: "audio/mpeg" })],
		[
			"4MiB 초과",
			() =>
				new File([new Uint8Array(4 * 1024 * 1024 + 1)], "a", {
					type: "audio/mpeg",
				}),
		],
		["모르는 형식", () => new File(["가"], "a", { type: "text/html" })],
		["다른 형식", () => new File(["가"], "a", { type: "audio/wav" })],
		["오디오 없음", () => "글"],
	])("응답이 %s면 기록을 남기고 6이다", async (name, audio) => {
		w.on.trialCreate = (_input, next) => ({ ...next(), audio: audio() });
		const result = await run(gen("--yes", "--json"));
		expect([name, result.code]).toEqual([name, 6]);
		expect(json(result).requestId).toBe(ws.records()[0]?.requestId);
		expect(existsSync(ws.path("out.mp3"))).toBe(false);
		expect(w.synth).toBe(1);
	});

	it.each(["{}", '{"json":{"id":"글","audio":{}}}', "<h1>중간 장비</h1>"])(
		"생성 응답이 결과 모양이 아니면(%s) 기록을 남기고 6이다",
		async (text) => {
			w.hook = (path, _request, response) => {
				if (!path.includes("trialCreate")) return false;
				response.setHeader("content-type", "application/json");
				response.end(text);
				return true;
			};
			expect((await run(gen("--yes"))).code).toBe(6);
			expect(ws.records()).toHaveLength(1);
		},
	);
});

describe("시험 생성 분류와 복구", { timeout: 60_000 }, () => {
	it.each([
		["BAD_REQUEST", undefined, 5, 0],
		["UNAUTHORIZED", undefined, 3, 0],
		["BAD_REQUEST", "provider_input", 5, 0],
		["BAD_REQUEST", "free_ended", 5, 0],
		["BAD_GATEWAY", "quota", 5, 0],
		["TOO_MANY_REQUESTS", "in_progress", 5, 0],
		["SERVICE_UNAVAILABLE", "storage", 5, 0],
		// 관리 명령의 사유는 유료 분류의 허용 목록에 없다
		["CONFLICT", "duplicate_name", 6, 1],
		["CONFLICT", "stale", 6, 1],
		["GATEWAY_TIMEOUT", "unknown_outcome", 6, 1],
		["TOO_MANY_REQUESTS", undefined, 6, 1],
		["INTERNAL_SERVER_ERROR", undefined, 6, 1],
		// 삭제 대기·처리 중·남의 클론: 선점 전 거절
		["NOT_FOUND", undefined, 4, 0],
	] as const)(
		"생성 거절 %s %s → %i, 남은 기록 %i",
		async (code, reason, exit, left) => {
			w.on.trialCreate = reject(code, reason);
			const result = await run(gen("--yes", "--json"));
			expect(result.code).toBe(exit);
			expect(ws.records()).toHaveLength(left);
			expect(w.synth).toBe(0);
		},
	);

	it.each(["pending", "done", "조회 실패"] as const)(
		"사유 없는 NOT_FOUND여도 요청 상태가 %s면 6이고 기록을 남긴다",
		async (status) => {
			w.on.trialCreate = (input) => {
				if (status === "조회 실패")
					w.on.trialRequest = reject("SERVICE_UNAVAILABLE", "storage");
				else
					w.add(input.request, {
						kind: "trial",
						requestId: input.requestId,
						status,
					});
				return reject("NOT_FOUND")();
			};
			expect((await run(gen("--yes"))).code).toBe(6);
			expect(ws.records()).toHaveLength(1);
		},
	);

	it("응답을 잃으면 6이고, 다시 실행하면 같은 UUID만 보고 받는다", async () => {
		loseCreate();
		const lost = await run(gen("--yes", "--json"));
		expect(lost.code).toBe(6);
		const text = readFileSync(ws.requestsPath, "utf8");
		for (const secret of ["비밀", "문장", "fixture-cookie", COOKIE])
			expect(text).not.toContain(secret);
		w.hook = undefined;
		const again = await run(gen("--json"));
		expect(json(again)).toMatchObject({
			source: "resumed",
			result: { id: w.rows[0]?.id, bytes: 1234 },
		});
		expect(w.synth).toBe(1);
		expect(ws.records()).toEqual([]);
	});

	it("resume은 같은 UUID의 완료 결과만 받고, --out이 없으면 결과 ID를 알린다", async () => {
		loseCreate();
		const { requestId } = json(await run(gen("--yes", "--json")));
		w.hook = undefined;
		const result = await run([
			...["trial", "resume", requestId.toUpperCase(), "--json"],
			...["--out", ws.path("resumed.mp3")],
		]);
		expect(json(result)).toMatchObject({ source: "resumed" });
		expect(readFileSync(ws.path("resumed.mp3")).equals(w.audio)).toBe(true);
		expect(ws.records()).toEqual([]);
		const row = w.add(request("다른"), { kind: "trial" });
		expect(
			json(await run(["trial", "resume", row.requestId, "--json"])),
		).toMatchObject({ result: { id: row.id }, out: null });
		// 다른 종류의 요청은 서버가 모른다고 답한다
		const studio = w.add(request());
		expect((await run(["trial", "resume", studio.requestId])).code).toBe(6);
	});

	it.each([
		["pending", 6, 1],
		["unknown", 6, 1],
		["failed", 5, 0],
	] as const)("resume에서 %s면 %i이다", async (status, code, left) => {
		loseCreate();
		const { requestId } = json(await run(gen("--yes", "--json")));
		if (w.rows[0]) Object.assign(w.rows[0], { status, reason: "quota" });
		w.hook = undefined;
		expect((await run(["trial", "resume", requestId])).code).toBe(code);
		expect(ws.records()).toHaveLength(left);
		expect(w.synth).toBe(1);
	});

	it("--new만 새 UUID로 만들고, 확정 거절되면 앞 기록으로 되돌린다", async () => {
		loseCreate();
		const { requestId } = json(await run(gen("--yes", "--json")));
		w.hook = undefined;
		w.on.trialCreate = reject("BAD_GATEWAY", "quota");
		expect((await run(gen("--new", "--yes"))).code).toBe(5);
		expect(ws.records()).toMatchObject([{ requestId, kind: "trial" }]);
		delete w.on.trialCreate;
		w.calls.length = 0;
		expect((await run(gen("--new", "--yes"))).code).toBe(0);
		expect(w.calls).not.toContain("trialFindMany");
		expect(w.created[1]?.requestId).not.toBe(requestId);
		expect(ws.records()).toEqual([]);
	});

	it("Ctrl+C: 확인 중이면 2, 응답 전이면 6, 완료 확인 중이면 6이고 파일은 남는다", async () => {
		const tty = spawnTty(ws.dir, gen());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		expect(existsSync(ws.requestsPath)).toBe(false);

		w.on.trialCreate = () => new Promise(() => {});
		const sent = spawnCli(ws.dir, gen("--yes", "--json"));
		await until(() => w.calls.includes("trialCreate"), "생성 요청");
		sent.child.kill("SIGINT");
		const cut = await sent.done;
		expect(cut.code).toBe(6);
		expect(json(cut).requestId).toBe(ws.records()[0]?.requestId);

		delete w.on.trialCreate;
		w.on.trialRequest = () => new Promise(() => {});
		const waiting = spawnCli(ws.dir, gen("--new", "--yes", "--json"));
		await until(() => w.calls.includes("trialRequest"), "완료 확인");
		waiting.child.kill("SIGINT");
		const stopped = await waiting.done;
		expect(stopped.code).toBe(6);
		expect(json(stopped).requestId).toBe(ws.records()[0]?.requestId);
		expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
	});

	it("Ctrl+C: 완료를 확인한 뒤 기록을 지우는 중이면 7이고 결과 ID를 알린다", async () => {
		let holder: ReturnType<typeof spawn> | undefined;
		w.on.trialRequest = async (_input, next) => {
			// 기록을 지우지 못하게 잠금을 쥔 채 완료를 알린다
			holder = spawn("/usr/bin/lockf", [
				...["-k", `${ws.dir}/lock`, "/bin/sh"],
				...["-c", "printf ready; exec /bin/sleep 10"],
			]);
			await new Promise((ready) => holder?.stdout?.once("data", ready));
			return next();
		};
		const child = spawnCli(ws.dir, gen("--yes", "--json"));
		await until(() => Boolean(holder?.stdout?.readableDidRead), "잠금");
		await new Promise((done) => setTimeout(done, 800));
		child.child.kill("SIGINT");
		const stopped = await child.done;
		holder?.kill("SIGKILL");
		expect(stopped.code).toBe(7);
		expect(json(stopped).resultId).toBe(w.rows[0]?.id);
	});

	it("Ctrl+C: 내려받는 중이면 7이고 결과 ID를 알린다", async () => {
		const row = w.add(request(), { kind: "trial" });
		w.on.trialAudio = () => new Promise(() => {});
		const child = spawnCli(ws.dir, gen("--json"));
		await until(() => w.calls.includes("trialAudio"), "내려받기");
		child.child.kill("SIGINT");
		const stopped = await child.done;
		expect(stopped.code).toBe(7);
		expect(json(stopped).resultId).toBe(row.id);
	});
});

describe("시험 생성 경계", { timeout: 60_000 }, () => {
	it("문장·옵션을 요청 전에 검사한다", async () => {
		const long = gen("--yes");
		long[5] = "가".repeat(201);
		const both = gen("--yes", "--input", ws.script(TEXT));
		const empty = gen("--yes");
		empty[5] = "  ";
		const none = gen("--yes");
		none.splice(4, 2);
		const noVoice = gen("--yes");
		noVoice.splice(2, 2);
		const noOut = gen("--yes");
		noOut.splice(6, 2);
		const badVoice = gen("--yes");
		badVoice[3] = "모름:v1";
		for (const args of [
			long,
			both,
			empty,
			none,
			noVoice,
			noOut,
			badVoice,
			gen("--yes", "--preset-id", OTHER),
			["trial", "list"],
			["trial", "list", "--voice", "typecast"],
			["trial", "download", "글", "--out", ws.path("a.mp3")],
			["trial", "download", OTHER],
			["trial", "resume", "--out", ws.path("a.mp3")],
			["trial", "remove"],
		])
			expect([args, (await run(args)).code]).toEqual([args, 2]);
		expect(w.calls.filter((name) => name.startsWith("trial"))).toEqual([]);
		const max = gen("--yes");
		max[5] = "가".repeat(200);
		expect((await run(max)).code).toBe(0);
	});

	it("설정 파일의 모양·모르는 칸·모르는 모델은 만들기 전에 2다", async () => {
		for (const [value, word] of [
			["{", "JSON"],
			["[]", "객체"],
			["null", "객체"],
			[{ tempo: 1, speed: 2, 가: 1 }, "speed, 가"],
			[{ model: "ssfm-v99" }, "model"],
			[{ preset: "joyful" }, "preset"],
			[{ tempo: "빠르게" }, "tempo"],
		] as const) {
			const result = await run(
				gen("--yes", "--json", "--settings", settings(value)),
			);
			expect([value, result.code]).toEqual([value, 2]);
			expect(json(result).message).toContain(word);
		}
		expect(w.calls.filter((name) => name.startsWith("trial"))).toEqual([]);
		expect(
			(await run(gen("--yes", "--settings", ws.path("없음.json")))).code,
		).toBe(2);
	});

	it("서버가 거절한 설정 값은 과금 전 조회에서 2이고, --new면 5다", async () => {
		const bad = reject("BAD_REQUEST");
		w.on.trialFindMany = bad;
		w.on.trialCreate = bad;
		const args = gen("--yes", "--settings", settings({ tempo: 99 }));
		expect((await run(args)).code).toBe(2);
		expect((await run([...args, "--new"])).code).toBe(5);
		expect(ws.records()).toEqual([]);
		expect(w.synth).toBe(0);
	});

	it("성우가 받지 않는 값을 보정하고 알린다", async () => {
		w.voices = [
			{
				...w.voices[0],
				voice: voiceOf("typecast", "v1", {
					models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
				}),
			},
		];
		const result = await run(gen("--yes"));
		expect(result.code).toBe(0);
		expect(result.err).toContain("ssfm-v30 → ssfm-v21");
	});

	it("이용 불가·없는 성우는 4이고 casting search를 안내한다", async () => {
		const gone = gen("--yes");
		gone[3] = "typecast:gone";
		expect((await run(gone)).code).toBe(4);
		const none = gen("--yes", "--json");
		none[3] = "elevenlabs:none";
		const result = await run(none);
		expect(result.code).toBe(4);
		expect(json(result).message).toContain("casting search");
		expect(w.calls).not.toContain("trialCreate");
	});

	it("출력 경로는 만들기 전에 검사한다", async () => {
		writeFileSync(ws.path("old.mp3"), "old");
		mkdirSync(ws.path("dir.mp3"));
		for (const out of ["old.mp3", "dir.mp3", "none/a.mp3", "a.txt", "a.wav"]) {
			const args = gen("--yes");
			args[7] = ws.path(out);
			expect([out, (await run(args)).code]).toEqual([out, 2]);
		}
		expect(w.calls).not.toContain("trialCreate");
	});

	it("없는 결과와 형식이 다른 결과는 파일을 만들지 않는다", async () => {
		const missing = await run([
			...["trial", "download", OTHER, "--out", ws.path("a.mp3"), "--json"],
		]);
		expect(missing.code).toBe(4);
		expect(json(missing).resultId).toBe(OTHER);
		const wav = w.add(request(), { kind: "trial", audioType: "audio/wav" });
		const result = await run([
			...["trial", "download", wav.id, "--out", ws.path("a.mp3"), "--json"],
		]);
		expect(result.code).toBe(2);
		expect(json(result).resultId).toBe(wav.id);
		const big = w.add(request(), {
			kind: "trial",
			audio: bytesOf(4 * 1024 * 1024 + 1),
		});
		expect(
			(await run(["trial", "download", big.id, "--out", ws.path("a.mp3")]))
				.code,
		).toBe(5);
		expect(existsSync(ws.path("a.mp3"))).toBe(false);
	});

	it("지우기는 확인을 받고 없는 결과는 4다", async () => {
		const row = w.add(request(), { kind: "trial" });
		const refused = await run(["trial", "remove", row.id, "--json"]);
		expect(json(refused).code).toBe("CONFIRM_REQUIRED");
		expect(refused.err).toContain(row.id);
		expect(refused.code).toBe(2);
		expect(w.calls).not.toContain("trialDelete");
		const no = spawnTty(ws.dir, ["trial", "remove", row.id]);
		await until(() => no.seen().includes("[y/N]"), "지우기 확인");
		no.write("n\r");
		expect((await no.done).code).toBe(2);
		expect(w.rows).toHaveLength(1);
		const yes = spawnTty(ws.dir, ["trial", "remove", row.id]);
		await until(() => yes.seen().includes("[y/N]"), "지우기 확인");
		yes.write("y\r");
		expect((await yes.done).code).toBe(0);
		expect(w.rows).toHaveLength(0);
		expect((await run(["trial", "remove", row.id, "--yes"])).code).toBe(4);
	});

	it("Fish Audio 무료 모델은 묻지 않고, 무료 기간이 끝나면 확인을 요구한다", async () => {
		const args = gen("--json");
		args[3] = "fish_audio:fish";
		const after = await spawnCli(ws.dir, args, "", "2026-11-30T00:00:01+09:00")
			.done;
		expect(json(after).code).toBe("CONFIRM_REQUIRED");
		expect(after.err).toContain("유료");
		const before = await spawnCli(ws.dir, args, "", "2026-11-29T23:59:59+09:00")
			.done;
		expect(before.code).toBe(0);
		expect(w.synth).toBe(1);
	});
});
