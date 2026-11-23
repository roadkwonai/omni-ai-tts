import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import {
	DEFAULT_SETTINGS,
	requestOf,
	STUDIO_PART_BYTES,
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

const TEXT = "안녕하세요. 비밀 대본입니다.";
const PRESET = "11111111-1111-4111-8111-111111111111";
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
// 기본 생성 명령. 인자는 뒤에 더한다
const gen = (...extra: string[]) => [
	"studio",
	"generate",
	"--voice",
	"typecast:v1",
	"--input",
	ws.script(TEXT),
	"--out",
	ws.path("out.mp3"),
	...extra,
];
const request = (text = TEXT): TrialRequest =>
	requestOf(voiceOf("typecast", "v1") as never, text, DEFAULT_SETTINGS);
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const gate = () => {
	let open!: () => void;
	const opened = new Promise<void>((done) => {
		open = done;
	});
	return { open, opened };
};
// 응답을 잃은 요청: 서버는 만들었고 연결만 끊긴다
const loseCreate = () => {
	w.on.studioCreate = async (_input, next) => {
		await next();
		throw new Error("끊는다");
	};
	w.hook = (path, _request, response) => {
		if (!path.includes("studioCreate")) return false;
		// 응답 본문을 쓰려는 순간 소켓을 끊는다
		response.writeHead = (() => {
			response.destroy();
			return response;
		}) as never;
		return false;
	};
};
const restoreCreate = () => {
	delete w.on.studioCreate;
	w.hook = undefined;
};

describe("정상", { timeout: 60_000 }, () => {
	it("성우로 만들어 저장 결과와 같은 바이트의 파일을 받는다", async () => {
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(0);
		const body = json(result);
		expect(body).toMatchObject({
			origin: server.origin,
			source: "created",
			result: { id: w.rows[0]?.id, bytes: 1234 },
			out: ws.path("out.mp3"),
			mime: "audio/mpeg",
		});
		expect(Object.keys(body.result).sort()).toEqual([
			"bytes",
			"createdAt",
			"id",
			"usage",
		]);
		expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
		expect(w.synth).toBe(1);
		expect(ws.records()).toEqual([]);
		expect(ws.leftovers()).toEqual([]);
	});

	it("사람용 성공 출력은 결과 ID·경로·크기·사용량뿐이다", async () => {
		const result = await run(gen("--yes"));
		expect(result.code).toBe(0);
		expect(result.out).toContain(w.rows[0]?.id ?? "없음");
		expect(result.out).toContain(ws.path("out.mp3"));
		expect(result.out).toContain("1,234바이트");
		expect(result.out).toContain("5크레딧");
		expect(result.out.trim().split("\n").length).toBeLessThanOrEqual(4);
	});

	it("다른 실행에서 결과 ID만으로 받고 합성하지 않는다", async () => {
		await run(gen("--yes"));
		const result = await run([
			"studio",
			"download",
			w.rows[0]?.id ?? "",
			"--out",
			ws.path("again.mp3"),
			"--json",
		]);
		expect(result.code).toBe(0);
		expect(json(result).result.id).toBe(w.rows[0]?.id);
		expect(readFileSync(ws.path("again.mp3")).equals(w.audio)).toBe(true);
		expect(w.synth).toBe(1);
	});

	it("3MiB를 넘는 오디오의 조각 순서·길이·전체 바이트가 맞는다", async () => {
		w.audio = bytesOf(STUDIO_PART_BYTES * 2 + 77);
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(0);
		expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
		expect(w.calls.filter((name) => name === "studioAudio")).toHaveLength(3);
	});

	it("프리셋의 성우·모델·설정으로 만든다", async () => {
		w.presets = [
			{
				id: PRESET,
				name: "쇼츠",
				provider: "typecast",
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.25 },
				savedVoiceId: PRESET,
				voice: voiceOf("typecast", "v1"),
				unavailable: false,
				channelId: null,
				channelDefault: false,
				fixed: ["pitch"],
			},
		];
		const list = await run(["presets", "list", "--json"]);
		expect(json(list)).toMatchObject({
			origin: server.origin,
			presets: [{ id: PRESET, name: "쇼츠", ref: "typecast:v1" }],
		});
		const human = await run(["presets", "list"]);
		expect(human.out).toContain("쇼츠");
		expect(human.out).toContain(PRESET);
		const result = await run([
			"studio",
			"generate",
			"--preset-id",
			PRESET,
			"--input",
			ws.script(TEXT),
			"--out",
			ws.path("out.mp3"),
			"--yes",
			"--json",
		]);
		expect(result.code).toBe(0);
		expect(w.created[0]?.request.settings).toMatchObject({ tempo: 1.25 });
		expect(result.err).toContain("pitch");
	});

	it("도움말에 명령·과금·종료 코드를 안내한다", async () => {
		const { out, code } = await run(["--help"]);
		expect(code).toBe(0);
		for (const word of [
			"presets list",
			"studio generate",
			"studio download",
			"studio resume",
			"--dry-run",
			"종료 코드",
			"태그",
		])
			expect(out).toContain(word);
	});
});

describe("과금 막기", { timeout: 60_000 }, () => {
	it.each([
		["--yes 없는 비대화", () => gen()],
		[
			"stdin 대본",
			() => [
				"studio",
				"generate",
				"--voice",
				"typecast:v1",
				"--input",
				"-",
				"--out",
				ws.path("out.mp3"),
			],
		],
	])("%s는 2로 끝나고 합성하지 않는다", async (_name, args) => {
		const result = await run([...args(), "--json"], TEXT);
		expect(result.code).toBe(2);
		expect(json(result).code).toBe("CONFIRM_REQUIRED");
		expect(w.calls).not.toContain("studioCreate");
		expect(ws.records()).toEqual([]);
		expect(existsSync(ws.path("out.mp3"))).toBe(false);
	});

	it("stdin 대본과 --yes로 만든다", async () => {
		const result = await run(
			[
				"studio",
				"generate",
				"--voice",
				"typecast:v1",
				"--input",
				"-",
				"--out",
				ws.path("out.mp3"),
				"--yes",
			],
			TEXT,
		);
		expect(result.code).toBe(0);
		expect(w.created[0]?.request.text).toBe(TEXT);
	});

	it("터미널에서 n이면 2이고 기록을 바꾸지 않는다", async () => {
		const tty = spawnTty(ws.dir, gen());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		expect(tty.seen()).toContain("성우 v1");
		expect(tty.seen()).toContain("ssfm-v30");
		expect(tty.seen()).toContain("크레딧");
		tty.write("n\r");
		expect((await tty.done).code).toBe(2);
		expect(w.calls).not.toContain("studioCreate");
		expect(existsSync(ws.requestsPath)).toBe(false);
	});

	it("터미널에서 y면 만든다", async () => {
		const tty = spawnTty(ws.dir, gen());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("y\r");
		expect((await tty.done).code).toBe(0);
		expect(w.synth).toBe(1);
		expect(readFileSync(ws.path("out.mp3")).equals(w.audio)).toBe(true);
	});

	it("확인 프롬프트에 함께 선 두 프로세스는 합성을 1회만 한다", async () => {
		const second = [...gen()];
		second[second.indexOf(ws.path("out.mp3"))] = ws.path("second.mp3");
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
		expect(w.synth).toBe(1);
		expect(readFileSync(ws.path("second.mp3")).equals(w.audio)).toBe(true);
		expect(ws.records()).toEqual([]);
	});

	it("같은 입력을 동시에 실행해도 합성은 1회다", async () => {
		const held = gate();
		w.on.studioCreate = async (_input, next) => {
			await held.opened;
			return next();
		};
		const first = spawnCli(ws.dir, gen("--yes", "--json"));
		await until(() => w.calls.includes("studioCreate"), "첫 생성");
		const second = await run(gen("--yes", "--json"));
		expect(second.code).toBe(6);
		expect(json(second).requestId).toBe(ws.records()[0]?.requestId);
		held.open();
		expect((await first.done).code).toBe(0);
		expect(w.synth).toBe(1);
	});

	it("저장 결과 조회를 함께 지난 두 프로세스도 합성은 1회다", async () => {
		const held = gate();
		w.on.studioFindMany = async (_input, next) => {
			if (w.calls.filter((name) => name === "studioFindMany").length <= 2) {
				await held.opened;
				return [null];
			}
			return next();
		};
		const a = spawnCli(ws.dir, gen("--yes"));
		const b = spawnCli(ws.dir, gen("--yes", "--overwrite"));
		await until(
			() => w.calls.filter((name) => name === "studioFindMany").length === 2,
			"두 조회",
		);
		// 한 프로세스가 끝날 때까지 합성 응답을 붙잡아 나머지가 선점된 기록을 만나게 한다
		w.on.studioCreate = async (_input, next) => {
			await Promise.race([
				a.done,
				b.done,
				new Promise((done) => setTimeout(done, 3000)),
			]);
			return next();
		};
		held.open();
		const codes = [(await a.done).code, (await b.done).code].sort();
		expect(codes).toEqual([0, 6]);
		expect(w.synth).toBe(1);
	});

	it("저장 결과가 있으면 만들지 않고 받는다", async () => {
		const row = w.add(request());
		const result = await run(gen("--json"));
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			source: "saved",
			result: { id: row.id },
		});
		expect(w.calls).not.toContain("studioCreate");
	});

	it("같은 조합의 미확인 결과만 있으면 6이고 --new를 안내한다", async () => {
		w.add(request(), { status: "unknown" });
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(6);
		expect(json(result).message).toContain("--new");
		expect(w.calls).not.toContain("studioCreate");
	});

	it("--dry-run은 사용량만 보이고 생성과 기록 변경이 없다", async () => {
		const result = await run(gen("--dry-run", "--json"));
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			dryRun: true,
			saved: null,
			estimate: { unit: "credit", amount: [...TEXT].length },
		});
		expect(result.out).not.toContain("비밀");
		const human = await run(gen("--dry-run"));
		expect(human.code).toBe(0);
		expect(human.out).toContain("크레딧");
		const row = w.add(request());
		expect(json(await run(gen("--dry-run", "--json"))).saved.id).toBe(row.id);
		expect(w.calls).not.toContain("studioCreate");
		expect(existsSync(ws.requestsPath)).toBe(false);
		expect(existsSync(ws.path("out.mp3"))).toBe(false);
	});

	it("선점 뒤 재조회가 완료면 그 결과를 받고 기록을 지운다", async () => {
		w.on.studioFindMany = (_input, next) => {
			if (w.calls.filter((name) => name === "studioFindMany").length === 1)
				return [null];
			w.add(request());
			return next();
		};
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(0);
		expect(json(result).source).toBe("saved");
		expect(w.synth).toBe(0);
		expect(ws.records()).toEqual([]);
	});

	it.each([
		["미확인", () => w.add(request(), { status: "unknown" }), 6],
		[
			"세션 만료",
			() => {
				throw new ORPCError("UNAUTHORIZED");
			},
			3,
		],
		[
			"저장소 실패",
			() => {
				throw new ORPCError("SERVICE_UNAVAILABLE", {
					data: { reason: "storage" },
				});
			},
			5,
		],
	])(
		"선점 뒤 재조회가 %s면 만들지 않고 내 기록을 지운다",
		async (_name, act, code) => {
			w.on.studioFindMany = (_input, next) => {
				if (w.calls.filter((name) => name === "studioFindMany").length === 1)
					return [null];
				act();
				return next();
			};
			const result = await run(gen("--yes", "--json"));
			expect(result.code).toBe(code);
			expect(w.synth).toBe(0);
			expect(ws.records()).toEqual([]);
		},
	);

	it("ElevenLabs 배율을 모르면 그렇게 알린다", async () => {
		const args = [
			"studio",
			"generate",
			"--voice",
			"elevenlabs:el",
			"--input",
			ws.script("가나다라"),
			"--out",
			ws.path("el.mp3"),
			"--dry-run",
		];
		expect(json(await run([...args, "--json"])).estimate.amount).toBe(6);
		w.on.trialModels = () => {
			throw new ORPCError("BAD_GATEWAY");
		};
		const result = await run(args);
		expect(result.code).toBe(0);
		expect(result.out).toContain("배율을 확인하지 못했어요");
	});
});

describe("복구", { timeout: 60_000 }, () => {
	it("응답을 잃으면 6이고, 다시 실행하면 같은 UUID만 보고 받는다", async () => {
		loseCreate();
		const lost = await run(gen("--yes", "--json"));
		expect(lost.code).toBe(6);
		const requestId = json(lost).requestId;
		expect(ws.records()).toMatchObject([
			{ origin: server.origin, requestId, provider: "typecast" },
		]);
		restoreCreate();
		const again = await run(gen("--json"));
		expect(again.code).toBe(0);
		expect(json(again)).toMatchObject({
			source: "resumed",
			result: { id: w.rows[0]?.id },
		});
		expect(w.synth).toBe(1);
		expect(ws.records()).toEqual([]);
	});

	it("기록 파일은 0600이고 대본·쿠키를 담지 않는다", async () => {
		loseCreate();
		const lost = await run(gen("--yes", "--json"));
		const text = readFileSync(ws.requestsPath, "utf8");
		expect(statSync(ws.requestsPath).mode & 0o777).toBe(0o600);
		for (const secret of ["비밀", "대본", COOKIE, "fixture-cookie"]) {
			expect(text).not.toContain(secret);
			expect(lost.out + lost.err).not.toContain(secret);
		}
		expect(Object.keys(ws.records()[0] ?? {}).sort()).toEqual([
			"createdAt",
			"origin",
			"provider",
			"requestId",
		]);
	});

	it("resume은 같은 UUID의 완료 결과만 받고 합성하지 않는다", async () => {
		loseCreate();
		const requestId = json(await run(gen("--yes", "--json"))).requestId;
		restoreCreate();
		const list = await run(["studio", "resume", "--json"]);
		expect(json(list).requests).toMatchObject([
			{ requestId, provider: "typecast" },
		]);
		const result = await run([
			"studio",
			"resume",
			requestId.toUpperCase(),
			"--out",
			ws.path("resumed.mp3"),
			"--json",
		]);
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({
			source: "resumed",
			mime: "audio/mpeg",
		});
		expect(readFileSync(ws.path("resumed.mp3")).equals(w.audio)).toBe(true);
		expect(ws.records()).toEqual([]);
		expect(w.synth).toBe(1);
	});

	it("resume은 --out 없이 결과 ID를 알리고, 기록이 없으면 없다고 한다", async () => {
		const row = w.add(request());
		const result = await run(["studio", "resume", row.requestId, "--json"]);
		expect(result.code).toBe(0);
		expect(json(result)).toMatchObject({ result: { id: row.id }, out: null });
		expect((await run(["studio", "resume"])).out).toContain("없습니다");
	});

	it("같은 조합의 다른 완료 결과가 있어도 resume과 generate는 6이다", async () => {
		w.on.studioCreate = () => {
			throw new Error("기록 없이 실패");
		};
		const requestId = json(await run(gen("--yes", "--json"))).requestId;
		delete w.on.studioCreate;
		w.add(request());
		const resumed = await run(["studio", "resume", requestId, "--json"]);
		expect(resumed.code).toBe(6);
		expect(json(resumed).requestId).toBe(requestId);
		expect((await run(gen("--json"))).code).toBe(6);
		expect(ws.records()).toHaveLength(1);
		expect(w.synth).toBe(0);
	});

	it.each([
		["pending", 6, 1],
		["unknown", 6, 1],
		["failed", 5, 0],
	] as const)("resume에서 %s면 %i이다", async (status, code, left) => {
		loseCreate();
		const requestId = json(await run(gen("--yes", "--json"))).requestId;
		const row = w.rows[0];
		if (row)
			Object.assign(row, {
				status,
				reason: status === "failed" ? "quota" : null,
			});
		const result = await run(["studio", "resume", requestId, "--json"]);
		expect(result.code).toBe(code);
		if (status === "failed") expect(json(result).reason).toBe("quota");
		expect(ws.records()).toHaveLength(left);
		expect(w.synth).toBe(1);
	});

	it.each(["constructor", "처음 보는 사유"])(
		"resume은 허용 목록 밖 사유(%s)를 버린다",
		async (reason) => {
			const row = w.add(request(), { status: "failed", reason });
			const result = await run(["studio", "resume", row.requestId, "--json"]);
			expect(result.code).toBe(5);
			expect(json(result)).toEqual({
				code: "CREATE_FAILED",
				message: "음성을 만들지 못했습니다.",
				requestId: row.requestId,
			});
		},
	);

	it("--new만 새 UUID로 만들고 앞 기록과 저장 결과를 쓰지 않는다", async () => {
		loseCreate();
		const requestId = json(await run(gen("--yes", "--json"))).requestId;
		restoreCreate();
		w.calls.length = 0;
		const refused = await run(gen("--new", "--json"));
		expect(refused.code).toBe(2);
		expect(ws.records()[0]?.requestId).toBe(requestId);
		const result = await run(gen("--new", "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(json(result).source).toBe("created");
		expect(w.synth).toBe(2);
		expect(w.created[1]?.requestId).not.toBe(requestId);
		expect(w.calls).not.toContain("studioFindMany");
		expect(ws.records()).toEqual([]);
	});

	it("--new가 확정 거절되면 앞 기록으로 되돌린다", async () => {
		loseCreate();
		const requestId = json(await run(gen("--yes", "--json"))).requestId;
		w.hook = undefined;
		w.on.studioCreate = () => {
			throw new ORPCError("BAD_GATEWAY", { data: { reason: "quota" } });
		};
		const result = await run(gen("--new", "--yes", "--json"));
		expect(result.code).toBe(5);
		expect(json(result).reason).toBe("quota");
		expect(ws.records()).toMatchObject([{ requestId }]);
	});

	it("남의 requestId로 바뀐 기록은 지우지도 되돌리지도 않는다", async () => {
		// 부를 때마다 다른 UUID라 앞 기록으로 되돌리면 드러난다
		let other = "";
		w.on.studioCreate = () => {
			other = crypto.randomUUID();
			const state = JSON.parse(readFileSync(ws.requestsPath, "utf8"));
			for (const record of Object.values(state.requests) as {
				requestId: string;
			}[])
				record.requestId = other;
			writeFileSync(ws.requestsPath, JSON.stringify(state), { mode: 0o600 });
			throw new ORPCError("BAD_GATEWAY", { data: { reason: "quota" } });
		};
		expect((await run(gen("--yes"))).code).toBe(5);
		expect(ws.records()).toMatchObject([{ requestId: other }]);
		expect((await run(gen("--new", "--yes"))).code).toBe(5);
		expect(ws.records()).toMatchObject([{ requestId: other }]);
	});

	const reject = (code: string, reason?: string) => () => {
		throw new ORPCError(code, { data: reason ? { reason } : undefined });
	};
	it.each([
		// 확정 거절: 기록을 지운다
		["BAD_REQUEST", undefined, 5, 0],
		["UNAUTHORIZED", undefined, 3, 0],
		["FORBIDDEN", undefined, 3, 0],
		["BAD_REQUEST", "provider_input", 5, 0],
		["BAD_REQUEST", "free_ended", 5, 0],
		["BAD_REQUEST", "request_mismatch", 5, 0],
		["BAD_REQUEST", "voice_unavailable", 4, 0],
		["PRECONDITION_FAILED", "no_key", 5, 0],
		["BAD_GATEWAY", "provider_auth", 5, 0],
		["BAD_GATEWAY", "no_permission", 5, 0],
		["BAD_GATEWAY", "quota", 5, 0],
		["BAD_GATEWAY", "provider_error", 5, 0],
		["TOO_MANY_REQUESTS", "rate_limit", 5, 0],
		// 요청 행이 없을 때만 지운다(아래 테스트)
		["TOO_MANY_REQUESTS", "in_progress", 5, 0],
		["SERVICE_UNAVAILABLE", "storage", 5, 0],
		// 처리 여부를 모른다: 기록을 남긴다
		["GATEWAY_TIMEOUT", "unknown_outcome", 6, 1],
		["BAD_GATEWAY", "처음 보는 사유", 6, 1],
		["NOT_FOUND", undefined, 6, 1],
		["TIMEOUT", undefined, 6, 1],
		["TOO_MANY_REQUESTS", undefined, 6, 1],
		["INTERNAL_SERVER_ERROR", undefined, 6, 1],
		["SERVICE_UNAVAILABLE", undefined, 6, 1],
	] as const)(
		"생성 거절 %s %s → %i, 남은 기록 %i",
		async (code, reason, exit, left) => {
			w.on.studioCreate = reject(code, reason);
			const result = await run(gen("--yes", "--json"));
			expect(result.code).toBe(exit);
			expect(ws.records()).toHaveLength(left);
			const body = json(result);
			if (left) expect(body.requestId).toBe(ws.records()[0]?.requestId);
			if (reason && reason !== "처음 보는 사유")
				expect(body.reason).toBe(reason);
			else expect(body.reason).toBeUndefined();
		},
	);

	it.each([404, 408, 429, 500, 502, 503])(
		"앞단이 사유 없는 HTTP %i를 주면 기록을 남기고 6이다",
		async (status) => {
			w.hook = (path, _request, response) => {
				if (!path.includes("studioCreate")) return false;
				response.statusCode = status;
				response.setHeader("content-type", "text/html");
				response.end("<h1>오류</h1>");
				return true;
			};
			expect((await run(gen("--yes"))).code).toBe(6);
			expect(ws.records()).toHaveLength(1);
		},
	);

	it.each([
		["in_progress", "failed", 5, 0],
		["in_progress", "pending", 6, 1],
		["in_progress", "unknown", 6, 1],
		["storage", "done", 6, 1],
		["storage", "failed", 5, 0],
		["storage", "조회 실패", 6, 1],
	] as const)(
		"%s이고 요청 상태가 %s면 %i이다",
		async (reason, status, exit, left) => {
			w.on.studioCreate = (input) => {
				if (status === "조회 실패")
					w.on.studioRequest = reject("SERVICE_UNAVAILABLE", "storage");
				else w.add(input.request, { requestId: input.requestId, status });
				return reject("SERVICE_UNAVAILABLE", reason)();
			};
			expect((await run(gen("--yes"))).code).toBe(exit);
			expect(ws.records()).toHaveLength(left);
		},
	);

	it.each(["{}", '{"json":{}}', "<h1>중간 장비</h1>"])(
		"생성 응답이 결과 모양이 아니면(%s) 기록을 남기고 6이다",
		async (text) => {
			w.hook = (path, _request, response) => {
				if (!path.includes("studioCreate")) return false;
				response.setHeader("content-type", "application/json");
				response.end(text);
				return true;
			};
			const result = await run(gen("--yes", "--json"));
			expect(result.code).toBe(6);
			expect(json(result).requestId).toBe(ws.records()[0]?.requestId);
		},
	);

	it("retryAt을 JSON으로 전한다", async () => {
		const retryAt = "2026-12-01T00:00:00.000Z";
		w.on.studioCreate = () => {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				data: { reason: "rate_limit", retryAt, provider: "typecast" },
			});
		};
		expect(json(await run(gen("--yes", "--json")))).toMatchObject({
			reason: "rate_limit",
			retryAt,
		});
	});

	it("Ctrl+C: 확인 중이면 2, 응답 전이면 6, 내려받는 중이면 7이다", async () => {
		const tty = spawnTty(ws.dir, gen());
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		tty.write("\u0003");
		expect((await tty.done).code).toBe(2);
		expect(existsSync(ws.requestsPath)).toBe(false);

		w.on.studioAudio = async (input, next) => {
			if (input.part === 1) await new Promise(() => {});
			return next();
		};
		w.audio = bytesOf(STUDIO_PART_BYTES + 10);
		const download = spawnCli(ws.dir, gen("--yes", "--json"));
		await until(
			() => w.calls.filter((name) => name === "studioAudio").length === 2,
			"둘째 조각",
		);
		expect(ws.leftovers()).toHaveLength(1);
		download.child.kill("SIGINT");
		const stopped = await download.done;
		expect(stopped.code).toBe(7);
		expect(json(stopped).resultId).toBe(w.rows[0]?.id);
		expect(ws.leftovers()).toEqual([]);
		expect(existsSync(ws.path("out.mp3"))).toBe(false);

		w.on.studioCreate = () => new Promise(() => {});
		const sent = spawnCli(ws.dir, gen("--new", "--yes", "--json"));
		await until(
			() => w.calls.filter((name) => name === "studioCreate").length === 2,
			"생성 요청",
		);
		sent.child.kill("SIGINT");
		const cut = await sent.done;
		expect(cut.code).toBe(6);
		expect(json(cut).requestId).toBe(ws.records()[0]?.requestId);
	});
});

describe("파일", { timeout: 60_000 }, () => {
	const at = (out: string, ...extra: string[]) => {
		const args = gen("--yes", "--json", ...extra);
		args[args.indexOf(ws.path("out.mp3"))] = out;
		return args;
	};
	it("있는 파일·심볼릭 링크·폴더·없는 폴더·확장자는 요청 전에 거절한다", async () => {
		writeFileSync(ws.path("old.mp3"), "old");
		symlinkSync(ws.path("old.mp3"), ws.path("link.mp3"));
		symlinkSync(ws.path("nowhere"), ws.path("dead.mp3"));
		mkdirSync(ws.path("dir.mp3"));
		for (const args of [
			at(ws.path("old.mp3")),
			at(ws.path("link.mp3")),
			at(ws.path("link.mp3"), "--overwrite"),
			at(ws.path("dead.mp3"), "--overwrite"),
			at(ws.path("dir.mp3"), "--overwrite"),
			at(ws.path("none/a.mp3")),
			at(ws.path("a.txt")),
			at(ws.path("a.wav")),
		])
			expect([args, (await run(args)).code]).toEqual([args, 2]);
		expect(w.calls).not.toContain("studioCreate");
		expect(readFileSync(ws.path("old.mp3"), "utf8")).toBe("old");
	});

	it("Gemini는 .wav로 받는다", async () => {
		const args = at(ws.path("g.wav"));
		args[args.indexOf("typecast:v1")] = "gemini:Kore";
		const result = await run(args);
		expect(result.code).toBe(0);
		expect(json(result).mime).toBe("audio/wav");
	});

	it("--overwrite는 일반 파일만 바꾼다", async () => {
		writeFileSync(ws.path("old.mp3"), "old");
		expect((await run(at(ws.path("old.mp3"), "--overwrite"))).code).toBe(0);
		expect(readFileSync(ws.path("old.mp3")).equals(w.audio)).toBe(true);
	});

	it("내려받기의 실제 형식이 확장자와 다르면 조각 요청 없이 2다", async () => {
		const row = w.add(request(), { audioType: "audio/wav" });
		const result = await run([
			"studio",
			"download",
			row.id,
			"--out",
			ws.path("a.mp3"),
			"--json",
		]);
		expect(result.code).toBe(2);
		expect(w.calls).not.toContain("studioAudio");
		expect(existsSync(ws.path("a.mp3"))).toBe(false);
	});

	it.each([
		["조각 길이", () => new File(["짧다"], "a", { type: "audio/mpeg" })],
		[
			"MIME",
			() => new File([new Uint8Array(1234)], "a", { type: "audio/wav" }),
		],
		[
			"중간 실패",
			() => {
				throw new ORPCError("SERVICE_UNAVAILABLE", {
					data: { reason: "storage" },
				});
			},
		],
	])("%s가 어긋나면 기존 파일을 두고 7이다", async (_name, part) => {
		const row = w.add(request());
		writeFileSync(ws.path("old.mp3"), "old");
		w.on.studioAudio = part;
		const result = await run([
			"studio",
			"download",
			row.id,
			"--out",
			ws.path("old.mp3"),
			"--overwrite",
			"--json",
		]);
		expect(result.code).toBe(7);
		expect(json(result).resultId).toBe(row.id);
		expect(readFileSync(ws.path("old.mp3"), "utf8")).toBe("old");
		expect(ws.leftovers()).toEqual([]);
	});

	it("새 파일은 0600이고 --overwrite는 기존 권한을 잇는다", async () => {
		expect((await run(at(ws.path("new.mp3")))).code).toBe(0);
		expect(statSync(ws.path("new.mp3")).mode & 0o777).toBe(0o600);
		writeFileSync(ws.path("old.mp3"), "old");
		chmodSync(ws.path("old.mp3"), 0o664);
		expect((await run(at(ws.path("old.mp3"), "--overwrite"))).code).toBe(0);
		expect(statSync(ws.path("old.mp3")).mode & 0o777).toBe(0o664);
	});

	it.each([undefined, "audio/ogg", "audio/wav; x"])(
		"모르는 형식(%s)의 결과는 조각 요청 없이 5다",
		async (audioType) => {
			const row = w.add(request());
			w.on.studioInfo = (_input, next) => ({ ...next(), audioType });
			const result = await run([
				"studio",
				"download",
				row.id,
				"--out",
				ws.path("a.mp3"),
				"--json",
			]);
			expect(result.code).toBe(5);
			expect(json(result)).toMatchObject({
				code: "SERVER_ERROR",
				resultId: row.id,
			});
			expect(w.calls).not.toContain("studioAudio");
		},
	);

	it("내려받는 사이 생긴 파일을 덮어쓰지 않는다", async () => {
		w.on.studioAudio = (_input, next) => {
			writeFileSync(ws.path("out.mp3"), "먼저 온 파일");
			return next();
		};
		const result = await run(gen("--yes", "--json"));
		expect(result.code).toBe(7);
		expect(json(result).resultId).toBe(w.rows[0]?.id);
		expect(readFileSync(ws.path("out.mp3"), "utf8")).toBe("먼저 온 파일");
		expect(ws.leftovers()).toEqual([]);
	});

	it("--overwrite 중에 심볼릭 링크로 바뀌면 게시하지 않는다", async () => {
		writeFileSync(ws.path("target"), "대상");
		w.on.studioAudio = (_input, next) => {
			symlinkSync(ws.path("target"), ws.path("out.mp3"));
			return next();
		};
		expect((await run(gen("--yes", "--overwrite"))).code).toBe(7);
		expect(readFileSync(ws.path("target"), "utf8")).toBe("대상");
		expect(ws.leftovers()).toEqual([]);
	});
});

describe("오류와 경계", { timeout: 60_000 }, () => {
	const withInput = (text: string | Buffer, ...extra: string[]) => {
		const args = gen("--yes", "--json", ...extra);
		args[args.indexOf("--input") + 1] = ws.script(text, "input.txt");
		return args;
	};
	it("빈 글·공백·상한 초과·잘못된 UTF-8·없는 파일은 2다", async () => {
		for (const args of [
			withInput(""),
			withInput(" \n\t "),
			withInput("가".repeat(2001)),
			withInput(Buffer.from([0xec, 0x95, 0xff])),
			(() => {
				const missing = gen("--yes", "--json");
				missing[missing.indexOf("--input") + 1] = join(ws.files, "없음.txt");
				return missing;
			})(),
		])
			expect((await run(args)).code).toBe(2);
		expect(w.calls).not.toContain("studioCreate");
	});

	it("BOM을 빼고 상한 2,000자까지 보낸다", async () => {
		expect((await run(withInput(`﻿${"가".repeat(2000)}\n`))).code).toBe(0);
		expect(w.created[0]?.request.text).toBe("가".repeat(2000));
	});

	it("대괄호 태그를 원문 그대로 보낸다", async () => {
		const text = "[웃음] 안녕하세요 [pause]";
		expect((await run(withInput(text))).code).toBe(0);
		expect(w.created[0]?.request.text).toBe(text);
	});

	it("태그가 든 대본은 확인문에 알린다", async () => {
		const args = withInput("[웃음] 안녕").filter((arg) => arg !== "--yes");
		const tty = spawnTty(ws.dir, args);
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		expect(tty.seen()).toContain("태그");
		tty.write("n\r");
		await tty.done;
	});

	it("옵션 조합을 검사한다", async () => {
		for (const args of [
			gen("--preset-id", PRESET),
			["studio", "generate", "--input", "a", "--out", ws.path("a.mp3")],
			["studio", "generate", "--voice", "typecast:v1", "--out", "a.mp3"],
			["studio", "generate", "--voice", "typecast:v1", "--input", "a"],
			["studio", "generate", "--voice", "콜론없음", "--input", "a"],
			["studio", "download", "uuid아님", "--out", ws.path("a.mp3")],
			["studio", "download", PRESET],
			["studio", "resume", "uuid아님"],
			["studio", "resume", "--out", ws.path("a.mp3")],
			["studio", "download", PRESET, "--out", ws.path("a.mp3"), "--yes"],
			["presets", "list", "--out", "a.mp3"],
			["voices", "list", "--new"],
			["studio", "generate", "extra"],
		]) {
			const result = await run([...args, "--json"]);
			expect([args, result.code]).toEqual([args, 2]);
			expect(json(result).code).toBe("INPUT");
		}
		expect(w.calls).toEqual([]);
	});

	it("없는 성우·이용 불가·없는 프리셋·성우 빠진 프리셋은 4다", async () => {
		w.presets = [
			{
				id: PRESET,
				name: "빠짐",
				provider: "typecast",
				settings: DEFAULT_SETTINGS.typecast,
				savedVoiceId: null,
				voice: null,
				unavailable: false,
				channelId: null,
				channelDefault: false,
				fixed: [],
			},
		];
		const swap = (flag: string, value: string) => {
			const args = gen("--yes", "--json");
			args[2] = flag;
			args[3] = value;
			return args;
		};
		for (const args of [
			swap("--voice", "typecast:none"),
			swap("--voice", "airy:v1"),
			swap("--voice", "typecast:gone"),
			swap("--preset-id", PRESET),
			swap("--preset-id", "33333333-3333-4333-8333-333333333333"),
		])
			expect([args, (await run(args)).code]).toEqual([args, 4]);
		w.presets = [
			{ ...w.presets[0], voice: voiceOf("typecast", "v1"), unavailable: true },
		];
		expect((await run(swap("--preset-id", PRESET))).code).toBe(4);
		expect(w.calls).not.toContain("studioCreate");
	});

	it("없는 결과는 4다", async () => {
		const result = await run([
			"studio",
			"download",
			PRESET,
			"--out",
			ws.path("a.mp3"),
			"--json",
		]);
		expect(result.code).toBe(4);
		expect(json(result)).toMatchObject({ code: "NOT_FOUND", resultId: PRESET });
	});

	it("세션 없음·user id 없음·비소유자는 3이고 만들지 않는다", async () => {
		w.user = () => ({});
		expect((await run(gen("--yes"))).code).toBe(3);
		w.user = () => null;
		expect((await run(gen("--yes"))).code).toBe(3);
		w.user = undefined;
		w.on.savedVoiceList = () => {
			throw new ORPCError("UNAUTHORIZED");
		};
		for (const args of [
			gen("--yes"),
			["presets", "list"],
			["studio", "resume", PRESET],
			["studio", "download", PRESET, "--out", ws.path("a.mp3")],
		])
			expect([args, (await run(args)).code]).toEqual([args, 3]);
		writeFileSync(
			join(ws.dir, "sessions.json"),
			JSON.stringify({ sessions: {} }),
		);
		expect((await run(gen("--yes"))).code).toBe(3);
		expect(w.calls).not.toContain("studioCreate");
	});

	it("성우가 받지 않는 프리셋 값을 보정하고 알린다", async () => {
		w.presets = [
			{
				id: PRESET,
				name: "v21",
				provider: "typecast",
				settings: {
					...DEFAULT_SETTINGS.typecast,
					emotion: "preset",
					preset: "whisper",
				},
				savedVoiceId: PRESET,
				voice: voiceOf("typecast", "v1", {
					models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }],
				}),
				unavailable: false,
				channelId: null,
				channelDefault: false,
				fixed: [],
			},
		];
		const args = gen("--yes", "--json");
		args[2] = "--preset-id";
		args[3] = PRESET;
		const result = await run(args);
		expect(result.code).toBe(0);
		expect(w.created[0]?.request.settings).toMatchObject({
			model: "ssfm-v21",
			preset: "normal",
		});
		expect(result.err).toContain("ssfm-v21");
	});

	it("Fish Audio 무료 모델은 기간 안에서만 묻지 않고, 끝나면 유료로 바뀐 것을 알린다", async () => {
		w.presets = [
			{
				id: PRESET,
				name: "무료",
				provider: "fish_audio",
				settings: DEFAULT_SETTINGS.fish_audio,
				savedVoiceId: PRESET,
				voice: voiceOf("fish_audio", "fish"),
				unavailable: false,
				channelId: null,
				channelDefault: false,
				fixed: [],
			},
		];
		const args = gen("--json");
		args[2] = "--preset-id";
		args[3] = PRESET;
		const after = await spawnCli(ws.dir, args, "", "2026-11-30T00:00:01+09:00")
			.done;
		expect(after.code).toBe(2);
		expect(json(after).code).toBe("CONFIRM_REQUIRED");
		expect(after.err).toContain("s2.1-pro-free → s2.1-pro");
		expect(after.err).toContain("유료");
		expect(w.synth).toBe(0);
		const before = await spawnCli(ws.dir, args, "", "2026-11-29T23:59:59+09:00")
			.done;
		expect(before.code).toBe(0);
		expect(before.err).not.toContain("유료");
		expect(w.created[0]?.request.settings.model).toBe("s2.1-pro-free");
	});

	it.each([{}, null, "글"])(
		"저장 결과 조회가 배열이 아니면(%j) 만들지 않고 5다",
		async (value) => {
			w.on.studioFindMany = () => value;
			const first = await run(gen("--yes", "--json"));
			expect(first.code).toBe(5);
			expect(json(first).code).toBe("SERVER_ERROR");
			w.calls.length = 0;
			w.on.studioFindMany = () =>
				w.calls.filter((name) => name === "studioFindMany").length === 1
					? [null]
					: value;
			expect((await run(gen("--yes"))).code).toBe(5);
			expect(ws.records()).toEqual([]);
			expect(w.calls).not.toContain("studioCreate");
		},
	);

	it("이름의 제어 문자를 지우고 보인다", async () => {
		const bidi = String.fromCodePoint(0x202e, 0x2066, 0x200f, 0x061c);
		const name = `가${String.fromCodePoint(0x1b)}[31m${bidi}나`;
		w.presets = [
			{
				id: PRESET,
				name,
				provider: "typecast",
				settings: DEFAULT_SETTINGS.typecast,
				savedVoiceId: null,
				voice: null,
				unavailable: false,
				channelId: null,
				channelDefault: false,
				fixed: [],
			},
		];
		const { out } = await run(["presets", "list"]);
		expect(out).not.toContain("\u001b");
		expect(out).toContain("가[31m나");
		const listed = await run(["presets", "list", "--json"]);
		expect(listed.out).toContain("\\u202e\\u2066\\u200f\\u061c");
		for (const char of bidi) expect(listed.out).not.toContain(char);
		expect(json(listed).presets[0].name).toBe(name);
	});

	it("깨진 기록 파일이면 만들지 않고 7이다", async () => {
		writeFileSync(ws.requestsPath, "{", { mode: 0o600 });
		const broken = await run(gen("--yes", "--json"));
		expect(broken.code).toBe(7);
		expect(json(broken)).toEqual({
			code: "STORAGE_ERROR",
			message: "요청 기록(requests.json)에 접근하지 못했습니다.",
		});
		writeFileSync(ws.requestsPath, '{"requests":{}}');
		chmodSync(ws.requestsPath, 0o644);
		expect((await run(gen("--yes"))).code).toBe(7);
		expect(w.calls).not.toContain("studioCreate");
	});
});
