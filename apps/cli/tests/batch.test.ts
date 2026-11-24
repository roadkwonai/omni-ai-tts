import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { ORPCError } from "@orpc/server";
import {
	type Paragraph,
	paragraphRequest,
	type VoiceSetup,
	type Work,
} from "@tts-pilot-app/api/paragraph-script";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import type { StudioRequest } from "@tts-pilot-app/api/studio-contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprint } from "../src/requests.js";
import {
	bytesOf,
	cli,
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

let w: ReturnType<typeof studioWorld>;
let ws: ReturnType<typeof workspace>;
let server: Awaited<ReturnType<typeof serve>>;

const setup = (provider: VoiceSetup["provider"], voiceId: string) =>
	({ provider, voiceId, settings: DEFAULT_SETTINGS[provider] }) as VoiceSetup;
const VOICE = setup("typecast", "v1");
// 글만 주면 기본 성우를 따르는 문단이다
const workOf = (
	paragraphs: (string | (Partial<Paragraph> & { text: string }))[],
	over: Partial<Work> = {},
) => ({
	defaultVoice: VOICE as VoiceSetup | null,
	gap: 0.5,
	paragraphs: paragraphs.map((item, i) => ({
		id: `p${i + 1}`,
		...(typeof item === "string" ? { text: item } : item),
	})),
	...over,
});
type Json = ReturnType<typeof workOf>;
const file = (work: object, name = "work.json") =>
	ws.script(JSON.stringify(work), name);
const requestAt = (work: Json, n: number): StudioRequest => {
	const p = work.paragraphs[n - 1];
	const request =
		p && paragraphRequest(p, work as Work, w.voices as never, Date.now());
	if (!request) throw new Error("요청이 없는 문단");
	return request;
};
const run = (args: string[], input?: string) =>
	spawnCli(ws.dir, args, input).done;
const batch = (work: object, ...extra: string[]) => [
	...["studio", "batch", "--work", file(work)],
	...["--out-dir", ws.path("out"), ...extra],
];
const plan = (work: object, ...extra: string[]) => [
	...["studio", "plan", "--work", file(work), "--json", ...extra],
];
const json = (result: { out: string }) => {
	expect(result.out.trim().split("\n")).toHaveLength(1);
	return JSON.parse(result.out);
};
const texts = () => w.created.map(({ request }) => request.text);
const progress = () =>
	JSON.parse(readFileSync(ws.path("out/omni-tts-result.json"), "utf8"));
const record = (work: Json, n: number, requestId: string) => {
	const state = existsSync(ws.requestsPath)
		? JSON.parse(readFileSync(ws.requestsPath, "utf8"))
		: { requests: {} };
	state.requests[fingerprint(server.origin, USER, requestAt(work, n))] = {
		origin: server.origin,
		requestId,
		provider: "typecast",
		createdAt: "2026-11-24T00:00:00Z",
	};
	writeFileSync(ws.requestsPath, JSON.stringify(state), { mode: 0o600 });
	return requestId;
};
const count = (name: string) => w.calls.filter((item) => item === name).length;
const gate = () => {
	let open!: () => void;
	const opened = new Promise<void>((done) => {
		open = done;
	});
	return { open, opened };
};
// n번째 생성의 응답만 잃는다. 서버는 만들었다(받은 상태로 남긴다)
const loseCreate = (nth: number, status: "done" | "unknown" = "done") => {
	let seen = 0;
	w.on.studioCreate = async (_input, next) => {
		seen += 1;
		const result = await next();
		if (seen !== nth) return result;
		const row = w.rows.at(-1);
		if (row) row.status = status;
		throw new ORPCError("GATEWAY_TIMEOUT", {
			data: { reason: "unknown_outcome" },
		});
	};
};

beforeEach(async () => {
	w = studioWorld();
	w.voices = [...w.voices, saved(voiceOf("airy", "ai"))];
	server = await w.serve();
	ws = workspace(server.origin);
	mkdirSync(ws.path("out"));
});
afterEach(() => {
	server.close();
	ws.remove();
});

describe("계획과 묶음", { timeout: 60_000 }, () => {
	// 다섯 공급자, 같은 조합, 빈 문단, 태그만 있는 문단, 화자, 교정, 이용 불가
	const mixed = () =>
		workOf(
			[
				"첫째 문단",
				{ text: "둘째", voice: setup("elevenlabs", "el") },
				{ text: "셋째 [pause]", voice: setup("fish_audio", "fish") },
				{ text: "넷째", voice: setup("airy", "ai") },
				{ text: "다섯째", voice: setup("gemini", "Kore") },
				"첫째 문단",
				"  ",
				"[pause]",
				{ text: "일곱 [pause] 째", speaker: "민수" },
				{
					text: "3개",
					fixes: {
						text: "3개",
						decisions: [
							{
								start: 0,
								end: 2,
								original: "3개",
								choice: "apply" as const,
								reading: "세 개",
							},
						],
					},
				},
			],
			{ speakers: [{ name: "민수", voice: setup("airy", "ai") }] },
		);

	it("계획은 상태·수·사용량만 보이고 만들지 않는다", async () => {
		const work = mixed();
		w.add(requestAt(work, 4));
		const result = await run(plan(work));
		expect(result.code).toBe(0);
		const body = json(result);
		expect(
			body.paragraphs.map((row: { status: string }) => row.status),
		).toEqual([
			...["make", "make", "make", "saved", "make", "make"],
			...["blank", "blank", "make", "make"],
		]);
		expect(body).toMatchObject({
			dryRun: true,
			make: 6,
			saved: 1,
			check: 0,
			blank: 2,
			needsConfirm: true,
		});
		expect(
			body.estimate.map((row: { provider: string; count: number }) => [
				row.provider,
				row.count,
			]),
		).toEqual([
			["typecast", 2],
			["elevenlabs", 1],
			["fish_audio", 1],
			["gemini", 1],
			["airy", 1],
		]);
		expect(w.synth).toBe(0);
		expect(existsSync(ws.requestsPath)).toBe(false);
		expect(w.calls).not.toContain("scriptRecordRecent");
	});

	it("문단마다 웹과 같은 요청을 한 번씩 보내고 번호 파일로 받는다", async () => {
		const work = mixed();
		const result = await run(batch(work, "--yes", "--json"));
		expect(result.code).toBe(0);
		// 같은 조합(1·6)은 한 번, 빈 문단(7·8)은 없다
		expect(w.created.map(({ request }) => request)).toEqual(
			[1, 2, 3, 4, 5, 9, 10].map((n) => requestAt(work, n)),
		);
		expect(texts()).toContain("셋째 [pause]");
		expect(texts()).toContain("일곱 째");
		expect(texts()).toContain("세 개");
		const body = json(result);
		expect(body.made).toBe(7);
		expect(
			body.paragraphs.map((row: { n: number; out: string; source: string }) => [
				row.n,
				row.out.slice(-7),
				row.source,
			]),
		).toEqual([
			[1, "001.mp3", "created"],
			[2, "002.mp3", "created"],
			[3, "003.mp3", "created"],
			[4, "004.mp3", "created"],
			[5, "005.wav", "created"],
			[6, "006.mp3", "saved"],
			[9, "009.mp3", "created"],
			[10, "010.mp3", "created"],
		]);
		for (const { out } of body.paragraphs)
			expect(readFileSync(out).equals(w.audio)).toBe(true);
		expect(progress()).toMatchObject({ version: 1, origin: server.origin });
		expect(progress().items).toHaveLength(8);
		expect(statSync(ws.path("out/omni-tts-result.json")).mode & 0o777).toBe(
			0o600,
		);
		expect(ws.records()).toEqual([]);
		// 다시 실행하면 아무것도 받지 않고 그대로 둔다
		w.calls.length = 0;
		const again = await run(batch(work, "--json"));
		expect(again.code).toBe(0);
		expect(
			json(again).paragraphs.every(
				(row: { source: string }) => row.source === "kept",
			),
		).toBe(true);
		expect(w.calls).not.toContain("studioAudio");
		expect(w.synth).toBe(7);
	});

	it("--only는 고른 문단만 본다", async () => {
		const work = workOf(["하나", "둘", "셋", "넷", "다섯"], {});
		const result = await run(batch(work, "--only", "1,3-4", "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(texts()).toEqual(["하나", "셋", "넷"]);
		expect(json(result).paragraphs.map((row: { n: number }) => row.n)).toEqual([
			1, 3, 4,
		]);
		// 번호는 작업의 차례다
		expect(existsSync(ws.path("out/003.mp3"))).toBe(true);
		expect(existsSync(ws.path("out/002.mp3"))).toBe(false);
		for (const only of ["0", "6", "3-1", "a", "", "1,,2"])
			expect((await run(plan(work, "--only", only))).code).toBe(2);
	});

	it("막힌 문단은 번호와 이유를 모두 알리고 만들지 않는다", async () => {
		const work = workOf(
			[
				"하나",
				{ text: "이용 불가", voice: setup("typecast", "gone") },
				{ text: "가".repeat(2001), voice: VOICE },
				{ text: "보관함에 없음", voice: setup("typecast", "missing") },
				{ text: "나".repeat(1601), voice: setup("airy", "ai") },
			],
			{ defaultVoice: null },
		);
		for (const args of [
			batch(work, "--yes", "--json"),
			batch(work, "--dry-run", "--json"),
			plan(work),
		]) {
			const result = await run(args);
			expect(result.code).toBe(2);
			const body = json(result);
			expect(body.code).toBe("BLOCKED");
			expect(body.paragraphs).toEqual([
				{ n: 1, reason: "성우 없음" },
				{ n: 2, reason: "지금 쓸 수 없는 성우" },
				{ n: 3, reason: "글자 수 초과 2,001/2,000자" },
				{ n: 4, reason: "지금 쓸 수 없는 성우" },
				{ n: 5, reason: "글자 수 초과 1,601/1,600자" },
			]);
		}
		expect(w.synth).toBe(0);
		// 고르지 않은 문단은 보지 않는다
		const only = await run(
			batch({ ...work, defaultVoice: VOICE }, "--only", "1", "--yes", "--json"),
		);
		expect(only.code).toBe(0);
	});

	it("이용 불가이지만 저장된 문단은 쓴다", async () => {
		const work = workOf([
			{ text: "저장됨", voice: setup("typecast", "gone") },
			"새것",
		]);
		const row = w.add(requestAt(work, 1));
		const result = await run(batch(work, "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(json(result).paragraphs[0]).toMatchObject({
			source: "saved",
			resultId: row.id,
		});
		expect(texts()).toEqual(["새것"]);
	});

	it("잘못된 작업 JSON은 문단 번호와 함께 2이고 요청하지 않는다", async () => {
		const bad = [
			[{ ...workOf(["가"]), gap: "x" }, "gap"],
			[workOf(["가", { text: 1 as never }]), "문단 2"],
			[
				workOf([
					{ text: "가", id: "같음" },
					{ text: "나", id: "!" },
				]),
				"문단",
			],
			[workOf([]), "paragraphs"],
		] as const;
		for (const [work, word] of bad) {
			const result = await run(plan(work));
			expect(result.code).toBe(2);
			expect(json(result).message).toContain(word);
		}
		expect(w.calls).toEqual([]);
		const voice = { ...VOICE, settings: { model: "없는 모델", tempo: 9 } };
		const settings = await run(
			plan(workOf(["가", { text: "나", voice: voice as never }])),
		);
		expect(settings.code).toBe(2);
		expect(json(settings).message).toContain("문단 2");
		expect(w.calls).not.toContain("studioFindMany");
	});

	it("빠진 설정 칸은 웹처럼 처음 값으로 보낸다", async () => {
		const voice = { provider: "typecast", voiceId: "v1", settings: {} };
		const work = workOf(["가"], { defaultVoice: voice as never });
		expect((await run(batch(work, "--yes"))).code).toBe(0);
		expect(w.created[0]?.request.settings).toEqual(
			requestAt(workOf(["가"]), 1).settings,
		);
	});

	it("검수하지 않은 숫자를 앞 3개까지 보인다", async () => {
		const result = await run(
			plan(workOf(["3개와 5번", "2026년 3월", "1시 20분"])),
		);
		const body = json(result);
		expect(body.unreviewed).toBeGreaterThan(3);
		expect(body.unreviewedText).toContain("외");
		expect(body.unreviewedText.split(" · ")).toHaveLength(3);
	});
});

describe("과금 막기", { timeout: 60_000 }, () => {
	it("비대화에서 --yes가 없으면 만들지 않는다", async () => {
		const result = await run(batch(workOf(["하나", "둘"]), "--json"));
		expect(result.code).toBe(2);
		expect(json(result).code).toBe("CONFIRM_REQUIRED");
		expect(w.synth).toBe(0);
		expect(ws.records()).toEqual([]);
	});

	it("만들 것이 무료 모델뿐이면 묻지 않고, 하나라도 유료면 묻는다", async () => {
		const fish = setup("fish_audio", "fish");
		const free = workOf([{ text: "무료", voice: fish }]);
		const now = "2026-11-24T00:00:00+09:00";
		const made = await spawnCli(ws.dir, batch(free, "--json"), "", now).done;
		expect(made.code).toBe(0);
		const both = workOf([{ text: "무료 둘", voice: fish }, "유료"]);
		const asked = await spawnCli(
			ws.dir,
			batch(both, "--json", "--overwrite"),
			"",
			now,
		).done;
		expect(asked.code).toBe(2);
		expect(w.synth).toBe(1);
	});

	it("무료 모델이 끝난 뒤에도 무료로 만든 문단을 쓰고 없는 문단만 유료로 만든다", async () => {
		const work = workOf(["하나", "둘"], {
			defaultVoice: setup("fish_audio", "fish"),
		});
		const at = (time: string, list: string[]) =>
			spawnCli(ws.dir, list, "", `2026-11-${time}+09:00`).done;
		const first = batch(work, "--only", "1", "--json");
		expect((await at("29T23:59:00", first)).code).toBe(0);
		const planned = json(await at("30T00:01:00", plan(work)));
		expect(planned).toMatchObject({
			paragraphs: [
				{ n: 1, status: "saved", resultId: w.rows[0]?.id },
				{ n: 2, status: "make" },
			],
			...{ make: 1, needsConfirm: true },
		});
		const made = await at("30T00:01:00", batch(work, "--yes", "--json"));
		expect(made.code).toBe(0);
		expect(json(made).paragraphs).toMatchObject([
			{ n: 1, source: "kept", resultId: w.rows[0]?.id },
			{ n: 2, source: "created" },
		]);
		expect(w.created.map(({ request }) => request.settings.model)).toEqual([
			"s2.1-pro-free",
			"s2.1-pro",
		]);
	});

	it("중간에 실패하면 거기서 멈추고 다시 실행하면 남은 문단만 만든다", async () => {
		const work = workOf(["하나", "둘", "셋"]);
		let fail = true;
		w.on.studioCreate = (input, next) => {
			if (fail && input.request.text === "둘")
				throw new ORPCError("BAD_GATEWAY", { data: { reason: "quota" } });
			return next();
		};
		const first = await run(batch(work, "--yes", "--json"));
		expect(first.code).toBe(5);
		expect(json(first)).toMatchObject({ reason: "quota", paragraph: 2 });
		expect(first.err).toContain("끝낸 문단 1개");
		expect(texts()).toEqual(["하나"]);
		expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
		expect(progress().items.map((item: { n: number }) => item.n)).toEqual([1]);
		fail = false;
		// 남은 새 문단은 다시 확인한다
		expect((await run(batch(work, "--json"))).code).toBe(2);
		const second = await run(batch(work, "--yes", "--json"));
		expect(second.code).toBe(0);
		expect(texts()).toEqual(["하나", "둘", "셋"]);
		expect(
			json(second).paragraphs.map((row: { source: string }) => row.source),
		).toEqual(["kept", "created", "created"]);
	});

	it("응답을 잃은 문단은 자동으로 다시 보내지 않고, 완료가 확인되면 이어 간다", async () => {
		const work = workOf(["하나", "둘", "셋"]);
		loseCreate(2, "unknown");
		const first = await run(batch(work, "--yes", "--json"));
		expect(first.code).toBe(6);
		const body = json(first);
		expect(body).toMatchObject({ code: "UNCONFIRMED", paragraph: 2 });
		expect(body.message).toContain("--retry-unconfirmed");
		expect(body.requestId).toBe(ws.records()[0]?.requestId);
		expect(w.synth).toBe(2);
		delete w.on.studioCreate;
		const blocked = await run(batch(work, "--yes", "--json"));
		expect(blocked.code).toBe(6);
		expect(json(blocked).paragraphs).toEqual([
			{ n: 2, requestId: body.requestId },
		]);
		expect(w.synth).toBe(2);
		expect(json(await run(plan(work))).paragraphs[1]).toEqual({
			n: 2,
			status: "check",
			requestId: body.requestId,
		});
		const row = w.rows.find((item) => item.requestId === body.requestId);
		if (row) row.status = "done";
		const done = await run(batch(work, "--yes", "--json"));
		expect(done.code).toBe(0);
		expect(json(done).paragraphs[1]).toMatchObject({
			source: "saved",
			resultId: row?.id,
		});
		expect(w.synth).toBe(3);
		expect(ws.records()).toEqual([]);
	});

	it.each(["pending", "unknown", "없음", "조회 실패"])(
		"확인 필요(%s)가 하나라도 있으면 확인을 묻기 전에 생성 0회로 6이다",
		async (state) => {
			const work = workOf(["하나", "둘"]);
			const row =
				state === "없음" || state === "조회 실패"
					? undefined
					: w.add(requestAt(work, 2), { status: state as never });
			// 같은 조합의 다른 완료는 그 요청의 완료가 아니다
			if (state === "unknown") w.add(requestAt(work, 2));
			if (state === "조회 실패")
				w.on.studioRequest = () => {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				};
			const requestId = record(work, 2, row?.requestId ?? crypto.randomUUID());
			const result = await run(batch(work, "--json"));
			expect(result.code).toBe(6);
			expect(json(result).paragraphs).toEqual([{ n: 2, requestId }]);
			expect(result.err).not.toContain("예상 사용량");
			expect(w.synth).toBe(0);
			expect(ws.records()).toHaveLength(1);
		},
	);

	it("기록 없는 서버 미확인도 확인 필요다", async () => {
		const work = workOf(["하나"]);
		const row = w.add(requestAt(work, 1), { status: "unknown" });
		const result = await run(batch(work, "--yes", "--json"));
		expect(result.code).toBe(6);
		expect(json(result).paragraphs).toEqual([{ n: 1, resultId: row.id }]);
		expect(w.synth).toBe(0);
	});

	it("확정 실패 기록은 해제하고 다시 만들고, 완료 기록은 재사용하고 해제한다", async () => {
		const work = workOf(["하나", "둘"]);
		const failedRow = w.add(requestAt(work, 1), { status: "failed" });
		const doneRow = w.add(requestAt(work, 2));
		record(work, 1, failedRow.requestId);
		record(work, 2, doneRow.requestId);
		// 계획은 읽기만 한다
		const planned = json(await run(plan(work)));
		expect(
			planned.paragraphs.map((row: { status: string }) => row.status),
		).toEqual(["make", "saved"]);
		expect(
			json(await run(batch(work, "--dry-run", "--json"))).paragraphs,
		).toEqual(planned.paragraphs);
		expect(ws.records()).toHaveLength(2);
		const result = await run(batch(work, "--yes", "--json"));
		expect(result.code).toBe(0);
		expect(texts()).toEqual(["하나"]);
		expect(json(result).paragraphs[1]).toMatchObject({ resultId: doneRow.id });
		expect(ws.records()).toEqual([]);
	});

	it("두 프로세스가 같은 묶음을 함께 실행해도 문단마다 1회다", async () => {
		const work = workOf(["하나", "둘", "셋"]);
		const held = gate();
		// 두 프로세스가 모두 '만들 것'으로 계획한 뒤 시작한다
		w.on.studioFindMany = async (input, next) => {
			if (count("studioFindMany") <= 2) {
				await held.opened;
				return input.map(() => null);
			}
			return next();
		};
		const other = ws.path("other");
		mkdirSync(other);
		const a = spawnCli(ws.dir, batch(work, "--yes"));
		const b = spawnCli(ws.dir, [
			...["studio", "batch", "--work", ws.path("work.json")],
			...["--out-dir", other, "--yes"],
		]);
		await until(() => count("studioFindMany") === 2, "두 계획");
		// 한 프로세스가 끝날 때까지 첫 생성을 붙잡아 나머지가 선점된 기록을 만나게 한다
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
		expect(texts()).toEqual(["하나", "둘", "셋"]);
	});

	it("확인 프롬프트 둘이 함께 서 있어도 문단마다 1회다", async () => {
		const work = workOf(["하나", "둘"]);
		mkdirSync(ws.path("other"));
		const a = spawnTty(ws.dir, batch(work));
		const b = spawnTty(ws.dir, [
			...["studio", "batch", "--work", ws.path("work.json")],
			...["--out-dir", ws.path("other")],
		]);
		await until(() => a.seen().includes("[y/N]"), "첫 확인");
		await until(() => b.seen().includes("[y/N]"), "둘째 확인");
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		// 확인 뒤 이미 저장된 문단은 만들지 않는다
		b.write("y\r");
		expect((await b.done).code).toBe(0);
		expect(w.synth).toBe(2);
		expect(existsSync(ws.path("other/002.mp3"))).toBe(true);
		expect(ws.records()).toEqual([]);
	});

	it("확인을 거절하면 만들지 않고 2다", async () => {
		const tty = spawnTty(ws.dir, batch(workOf(["하나"])));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		expect(tty.seen()).toContain("만들 문단 1개");
		expect(tty.seen()).toContain("예상 사용량");
		tty.write("n\r");
		expect((await tty.done).code).toBe(2);
		expect(w.synth).toBe(0);
	});

	it("Ctrl+C: 확인 중이면 2, 응답 전이면 6, 내려받는 중이면 7이고 끝낸 문단은 남는다", async () => {
		const work = workOf(["하나", "둘"]);
		const asking = spawnTty(ws.dir, batch(work));
		await until(() => asking.seen().includes("[y/N]"), "확인 프롬프트");
		asking.write("\u0003");
		expect((await asking.done).code).toBe(2);

		w.on.studioCreate = (input, next) =>
			input.request.text === "둘" ? new Promise(() => {}) : next();
		const sending = spawnCli(ws.dir, batch(work, "--yes", "--json"));
		await until(() => count("studioCreate") === 2, "둘째 생성");
		sending.child.kill("SIGINT");
		const stopped = await sending.done;
		expect(stopped.code).toBe(6);
		expect(json(stopped)).toMatchObject({
			paragraph: 2,
			requestId: ws.records()[0]?.requestId,
		});
		expect(progress().items).toHaveLength(1);

		delete w.on.studioCreate;
		writeFileSync(ws.requestsPath, JSON.stringify({ requests: {} }), {
			mode: 0o600,
		});
		w.on.studioAudio = () => new Promise(() => {});
		const before = count("studioAudio");
		const loading = spawnCli(ws.dir, batch(work, "--yes", "--json"));
		await until(() => count("studioAudio") > before, "내려받기");
		loading.child.kill("SIGINT");
		const cut = await loading.done;
		expect(cut.code).toBe(7);
		expect(json(cut)).toMatchObject({
			paragraph: 2,
			resultId: w.rows.at(-1)?.id,
		});
		expect(ws.leftovers()).toEqual([]);
		expect(progress().items).toHaveLength(1);
	});
});

describe("--retry-unconfirmed", { timeout: 60_000 }, () => {
	it("확인 필요한 문단만 새 UUID로 만들고 완료된 문단은 만들지 않는다(유료 확인은 받는다)", async () => {
		const work = workOf(["하나", "둘", "셋"]);
		loseCreate(2, "unknown");
		await run(batch(work, "--yes"));
		delete w.on.studioCreate;
		const old = ws.records()[0]?.requestId;
		expect(
			json(await run(batch(work, "--retry-unconfirmed", "--json"))).code,
		).toBe("CONFIRM_REQUIRED");
		expect(ws.records()[0]?.requestId).toBe(old);
		const result = await run(
			batch(work, "--retry-unconfirmed", "--yes", "--json"),
		);
		expect(result.code).toBe(0);
		expect(texts()).toEqual(["하나", "둘", "둘", "셋"]);
		expect(w.created[2]?.requestId).not.toBe(old);
		expect(
			json(result).paragraphs.map((row: { source: string }) => row.source),
		).toEqual(["kept", "created", "created"]);
		expect(ws.records()).toEqual([]);
		// 다시 쓰여도 완료된 문단은 만들지 않는다
		expect((await run(batch(work, "--retry-unconfirmed", "--yes"))).code).toBe(
			0,
		);
		expect(w.synth).toBe(4);
	});

	it("중간에 실패한 뒤 다시 실행해도 문단마다 1회이고 앞 문단은 0회다", async () => {
		const work = workOf(["하나", "둘", "셋"]);
		for (const n of [1, 2])
			record(
				work,
				n,
				w.add(requestAt(work, n), { status: "unknown" }).requestId,
			);
		let fail = true;
		w.on.studioCreate = (input, next) => {
			if (fail && input.request.text === "둘")
				throw new ORPCError("BAD_GATEWAY", { data: { reason: "quota" } });
			return next();
		};
		const before = ws.records()[1]?.requestId;
		const first = await run(
			batch(work, "--retry-unconfirmed", "--yes", "--json"),
		);
		expect(first.code).toBe(5);
		expect(texts()).toEqual(["하나"]);
		// 거절된 재시도는 앞 기록을 되돌린다
		expect(ws.records().map((item) => item.requestId)).toEqual([before]);
		fail = false;
		const second = await run(
			batch(work, "--retry-unconfirmed", "--yes", "--json"),
		);
		expect(second.code).toBe(0);
		expect(texts()).toEqual(["하나", "둘", "셋"]);
	});

	it.each([
		["로컬 기록", true],
		["서버 미확인", false],
	])(
		"두 프로세스가 함께 재시도해도 문단마다 1회다(%s)",
		async (_name, local) => {
			const work = workOf(["하나"]);
			const row = w.add(requestAt(work, 1), { status: "unknown" });
			if (local) record(work, 1, row.requestId);
			const held = gate();
			w.on.studioFindMany = async (_input, next) => {
				if (count("studioFindMany") <= 2) await held.opened;
				return next();
			};
			mkdirSync(ws.path("other"));
			const a = spawnCli(
				ws.dir,
				batch(work, "--retry-unconfirmed", "--yes", "--json"),
			);
			const b = spawnCli(ws.dir, [
				...["studio", "batch", "--work", ws.path("work.json"), "--out-dir"],
				...[ws.path("other"), "--retry-unconfirmed", "--yes", "--json"],
			]);
			await until(() => count("studioFindMany") === 2, "두 계획");
			// 한 프로세스가 끝날 때까지 생성을 붙잡아 나머지가 바뀐 기록을 만나게 한다
			w.on.studioCreate = async (_input, next) => {
				await Promise.race([
					a.done,
					b.done,
					new Promise((done) => setTimeout(done, 3000)),
				]);
				return next();
			};
			held.open();
			const codes = [(await a.done).code, (await b.done).code];
			expect(w.synth).toBe(1);
			// 뒤의 실행은 앞 실행의 결과를 받거나, 앞 실행이 아직 보내는 중이라 6이다
			expect(codes).toContain(0);
			expect(codes.every((code) => code === 0 || code === 6)).toBe(true);
		},
	);

	it("시작할 때 본 기록을 다른 프로세스가 바꿨으면 그 요청을 복구한다", async () => {
		const work = workOf(["하나"]);
		record(work, 1, w.add(requestAt(work, 1), { status: "unknown" }).requestId);
		const tty = spawnTty(ws.dir, batch(work, "--retry-unconfirmed", "--json"));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		const other = w.add(requestAt(work, 1));
		record(work, 1, other.requestId);
		tty.write("y\r");
		expect((await tty.done).code).toBe(0);
		expect(tty.seen()).toContain(other.id);
		expect(w.synth).toBe(0);
	});

	it.each([
		["완료", 0],
		["미확인", 6],
	])("본 기록이 사라졌으면 재조회만 한다(%s)", async (state, code) => {
		const work = workOf(["하나"]);
		record(work, 1, w.add(requestAt(work, 1), { status: "unknown" }).requestId);
		const tty = spawnTty(ws.dir, batch(work, "--retry-unconfirmed", "--json"));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		writeFileSync(ws.requestsPath, JSON.stringify({ requests: {} }), {
			mode: 0o600,
		});
		if (state === "완료") w.add(requestAt(work, 1));
		tty.write("y\r");
		expect((await tty.done).code).toBe(code);
		expect(w.synth).toBe(0);
		expect(ws.records()).toEqual([]);
	});

	it("확인하는 사이 완료되면 만들지 않고 쓴다", async () => {
		const work = workOf(["하나"]);
		w.add(requestAt(work, 1), { status: "unknown" });
		const tty = spawnTty(ws.dir, batch(work, "--retry-unconfirmed"));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		const row = w.add(requestAt(work, 1));
		tty.write("y\r");
		expect((await tty.done).code).toBe(0);
		expect(tty.seen()).toContain(row.id);
		expect(w.synth).toBe(0);
		expect(ws.records()).toEqual([]);
	});

	it("재조회가 실패하면 앞 기록을 되돌린다", async () => {
		const work = workOf(["하나"]);
		const requestId = record(
			work,
			1,
			w.add(requestAt(work, 1), { status: "unknown" }).requestId,
		);
		w.on.studioFindMany = (_input, next) => {
			if (count("studioFindMany") > 1)
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			return next();
		};
		const result = await run(
			batch(work, "--retry-unconfirmed", "--yes", "--json"),
		);
		expect(result.code).toBe(5);
		expect(ws.records().map((item) => item.requestId)).toEqual([requestId]);
		expect(w.synth).toBe(0);
	});
});

describe("파일", { timeout: 60_000 }, () => {
	it("폴더가 없으면 2이고 요청하지 않는다", async () => {
		const result = await run([
			...["studio", "batch", "--work", file(workOf(["가"])), "--json"],
			...["--out-dir", ws.path("없음"), "--yes"],
		]);
		expect(result.code).toBe(2);
		expect(w.calls).toEqual([]);
	});

	it("있는 파일·링크·폴더는 만들기 전에 막고 --overwrite는 일반 파일만 바꾼다", async () => {
		const work = workOf(["하나", "둘"]);
		writeFileSync(ws.path("out/002.mp3"), "남의 파일");
		const taken = await run(batch(work, "--yes", "--json"));
		expect(taken.code).toBe(2);
		expect(json(taken).message).toContain("002.mp3");
		symlinkSync(ws.path("out/002.mp3"), ws.path("out/001.mp3"));
		expect((await run(batch(work, "--yes", "--overwrite"))).code).toBe(2);
		expect(w.synth).toBe(0);
		const only = await run(batch(work, "--only", "2", "--yes", "--overwrite"));
		expect(only.code).toBe(0);
		expect(readFileSync(ws.path("out/002.mp3")).equals(w.audio)).toBe(true);
	});

	it("크기가 같아도 다른 결과면 --overwrite가 필요하다", async () => {
		const work = workOf(["하나"]);
		await run(batch(work, "--yes"));
		// 글을 고쳐 다시 만든 저장 결과: 크기는 같고 결과 ID와 소리가 다르다
		const edited = workOf(["고친 글"]);
		w.add(requestAt(edited, 1), { audio: Buffer.alloc(1234, 9) });
		const result = await run(batch(edited, "--json"));
		expect(result.code).toBe(2);
		expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
		const replaced = await run(batch(edited, "--overwrite", "--json"));
		expect(replaced.code).toBe(0);
		expect(readFileSync(ws.path("out/001.mp3"))).toEqual(Buffer.alloc(1234, 9));
		// 진행 파일은 같지만 소리 파일의 크기가 바뀌었다
		writeFileSync(ws.path("out/001.mp3"), "짧다");
		expect((await run(batch(edited, "--json"))).code).toBe(2);
	});

	it("남의 진행 파일·깨진 파일·링크면 2이고 만들지 않는다", async () => {
		const path = ws.path("out/omni-tts-result.json");
		for (const body of [
			"{}",
			"깨짐",
			JSON.stringify({
				version: 1,
				origin: "https://other.example",
				items: [],
			}),
			JSON.stringify({ version: 2, origin: server.origin, items: [] }),
		]) {
			writeFileSync(path, body);
			const result = await run(
				batch(workOf(["가"]), "--yes", "--overwrite", "--json"),
			);
			expect(result.code).toBe(2);
			expect(readFileSync(path, "utf8")).toBe(body);
		}
		writeFileSync(
			ws.path("real.json"),
			JSON.stringify({ version: 1, origin: server.origin, items: [] }),
		);
		rmSync(path);
		symlinkSync(ws.path("real.json"), path);
		expect((await run(batch(workOf(["가"]), "--yes"))).code).toBe(2);
		expect(w.synth).toBe(0);
	});

	it("진행 파일은 문단이 끝날 때마다 통째로 바뀌고 다른 문단의 줄을 지킨다", async () => {
		const work = workOf(["하나", "둘", "셋"]);
		await run(batch(work, "--only", "3", "--yes"));
		const seen: number[][] = [];
		w.on.studioCreate = (_input, next) => {
			seen.push(progress().items.map((item: { n: number }) => item.n));
			return next();
		};
		await run(batch(work, "--yes"));
		expect(seen).toEqual([[3], [1, 3]]);
		expect(progress().items.map((item: { n: number }) => item.n)).toEqual([
			1, 2, 3,
		]);
		expect(ws.leftovers()).toEqual([]);
	});

	it("같은 폴더에서 겹친 두 묶음이 서로의 진행 줄을 지키고 다음 실행이 이어진다", async () => {
		const work = workOf(["하나", "둘", "셋", "넷"]);
		const held = gate();
		// 둘 다 폴더를 연 뒤, 뒤 묶음은 앞 묶음이 끝날 때까지 만들지 않는다
		w.on.studioCreate = async (input, next) => {
			if (["하나", "둘"].includes(input.request.text))
				await until(() => count("studioCreate") > 1, "두 묶음");
			else await held.opened;
			return next();
		};
		const args = batch(work, "--yes", "--json");
		const a = spawnCli(ws.dir, [...args, "--only", "1,2"]);
		const b = spawnCli(ws.dir, [...args, "--only", "3,4"]);
		expect((await a.done).code).toBe(0);
		held.open();
		expect((await b.done).code).toBe(0);
		expect(progress().items.map((item: { n: number }) => item.n)).toEqual([
			1, 2, 3, 4,
		]);
		const again = await run(batch(work, "--json"));
		expect(again.code).toBe(0);
		expect(
			json(again).paragraphs.map((row: { source: string }) => row.source),
		).toEqual(["kept", "kept", "kept", "kept"]);
		expect(w.synth).toBe(4);
	});

	it.each([
		["stdout", "> >(true)"],
		["stderr", "2> >(true)"],
		["둘 다", "> >(true) 2> >(true)"],
	])("읽는 쪽이 %s를 닫아도 끝까지 만들고 0이다", async (_name, redirect) => {
		const args = batch(workOf(["하나", "둘", "셋"]), "--yes");
		const child = spawn(
			"/bin/bash",
			["-c", `"$0" "$@" ${redirect}`, process.execPath, cli, ...args],
			{ env: { ...process.env, OMNI_TTS_CONFIG_DIR: ws.dir } },
		);
		let seen = "";
		for (const stream of [child.stdout, child.stderr])
			stream.on("data", (chunk) => {
				seen += chunk;
			});
		const code = await new Promise((done) => child.on("close", done));
		expect([code, seen, w.synth]).toEqual([
			0,
			expect.not.stringContaining("EPIPE"),
			3,
		]);
		expect(progress().items).toHaveLength(3);
		expect(ws.records()).toEqual([]);
	});

	it("내려받기가 실패하면 7이고, 다시 실행하면 만들지 않고 받는다", async () => {
		const work = workOf(["하나", "둘"]);
		w.on.studioAudio = (input, next) => {
			const row = w.rows.find((item) => item.id === input.id);
			if (row?.request.text === "둘")
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			return next();
		};
		const first = await run(batch(work, "--yes", "--json"));
		expect(first.code).toBe(7);
		expect(json(first)).toMatchObject({
			paragraph: 2,
			resultId: w.rows[1]?.id,
		});
		expect(existsSync(ws.path("out/001.mp3"))).toBe(true);
		expect(existsSync(ws.path("out/002.mp3"))).toBe(false);
		delete w.on.studioAudio;
		expect((await run(batch(work, "--json"))).code).toBe(0);
		expect(w.synth).toBe(2);
	});

	it("3MiB를 넘는 결과도 바이트가 같다", async () => {
		w.audio = bytesOf(3 * 1024 * 1024 + 17);
		await run(batch(workOf(["가"]), "--yes"));
		expect(readFileSync(ws.path("out/001.mp3")).equals(w.audio)).toBe(true);
	});
});

describe("대본과 최근 대본", { timeout: 60_000 }, () => {
	const SCRIPT = "22222222-2222-4222-8222-222222222222";
	const WORK = "33333333-3333-4333-8333-333333333333";
	const CHANNEL = "44444444-4444-4444-8444-444444444444";
	const script = (over: object = {}) => ({
		id: SCRIPT,
		kind: "saved",
		title: "대본",
		channelId: CHANNEL,
		classificationIds: [],
		version: 1,
		workId: null,
		work: workOf(["하나", "둘"]),
		...over,
	});
	const byId = (...extra: string[]) => [
		...["studio", "batch", "--script-id", SCRIPT],
		...["--out-dir", ws.path("out"), ...extra],
	];

	it("저장 대본은 대본 id와 채널로 첫 생성 때 한 번 남긴다", async () => {
		w.scripts = [script()];
		expect((await run(byId("--yes"))).code).toBe(0);
		expect(w.recent).toEqual([
			{ workId: SCRIPT, channelId: CHANNEL, work: workOf(["하나", "둘"]) },
		]);
		expect(w.calls.indexOf("scriptRecordRecent")).toBeGreaterThan(-1);
		// 만들 것이 없으면 남기지 않는다
		expect((await run(byId())).code).toBe(0);
		expect(w.recent).toHaveLength(1);
	});

	it("최근 대본은 그 workId로 남긴다", async () => {
		w.scripts = [
			script({ kind: "recent", title: null, workId: WORK, channelId: null }),
		];
		expect((await run(byId("--yes"))).code).toBe(0);
		expect(w.recent).toMatchObject([{ workId: WORK, channelId: null }]);
	});

	it("파일은 실제 경로마다 같은 v5 꼴 id이고 채널이 없다", async () => {
		const work = workOf(["하나"]);
		const path = file(work);
		symlinkSync(realpathSync(path), ws.path("link.json"));
		const args = (from: string, dir: string) => {
			mkdirSync(ws.path(dir));
			return [
				...["studio", "batch", "--work", from],
				...["--out-dir", ws.path(dir), "--yes"],
			];
		};
		await run(args(path, "a"));
		file(workOf(["둘"]));
		await run(args(ws.path("link.json"), "b"));
		await run(args(file(workOf(["셋"]), "other.json"), "c"));
		const ids = w.recent.map((item) => item.workId);
		expect(ids).toHaveLength(3);
		expect(ids[0]).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(ids[1]).toBe(ids[0]);
		expect(ids[2]).not.toBe(ids[0]);
		expect(w.recent.every((item) => item.channelId === null)).toBe(true);
	});

	it("실패하거나 늦어도 만들기는 성공하고 안내만 한다(최대 5초)", async () => {
		w.on.scriptRecordRecent = () => {
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		};
		const failed = await run(batch(workOf(["하나"]), "--yes", "--json"));
		expect(failed.code).toBe(0);
		expect(failed.err).toContain("최근 대본");
		w.on.scriptRecordRecent = () => new Promise(() => {});
		const started = Date.now();
		const slow = await run(
			batch(workOf(["둘"]), "--yes", "--overwrite", "--json"),
		);
		const took = Date.now() - started;
		expect(slow.code).toBe(0);
		expect(slow.err).toContain("최근 대본");
		expect(took).toBeGreaterThan(4500);
		expect(took).toBeLessThan(9000);
	});

	it("최근 대본을 기다리는 동안 Ctrl+C를 눌러도 stdout은 한 건이다", async () => {
		w.on.scriptRecordRecent = () => new Promise(() => {});
		const started = spawnCli(
			ws.dir,
			batch(workOf(["하나"]), "--yes", "--json"),
		);
		await until(
			() => existsSync(ws.path("out/omni-tts-result.json")),
			"끝낸 문단",
		);
		await new Promise((done) => setTimeout(done, 500));
		started.child.kill("SIGINT");
		const result = await started.done;
		expect(result.code).toBe(2);
		expect(json(result).code).toBe("CANCELED");
		expect(existsSync(ws.path("out/001.mp3"))).toBe(true);
	});

	it("대본 상한을 넘는 작업은 남기지 않는다", async () => {
		const long = "가".repeat(10_001);
		const work = workOf([
			"하나",
			{ text: long, fixes: { text: long, decisions: [] } },
		]);
		expect(
			(await run(batch(work, "--only", "1", "--yes", "--json"))).code,
		).toBe(0);
		expect(w.recent).toEqual([]);
	});

	it("없는 대본은 4이고 입력 선택은 하나여야 한다", async () => {
		expect((await run(byId("--yes", "--json"))).code).toBe(4);
		expect(
			(await run([...byId("--yes"), "--work", file(workOf(["가"]))])).code,
		).toBe(2);
		expect((await run(["studio", "plan"])).code).toBe(2);
		expect((await run(["studio", "plan", "--script-id", "x"])).code).toBe(2);
		const stdin = JSON.stringify(workOf(["가"]));
		expect((await run(["studio", "plan", "--work", "-"], stdin)).code).toBe(2);
	});

	it("확인하는 사이 작업 파일이 없어져도 보낸 요청을 잃지 않는다", async () => {
		const tty = spawnTty(ws.dir, batch(workOf(["하나"])));
		await until(() => tty.seen().includes("[y/N]"), "확인 프롬프트");
		rmSync(ws.path("work.json"));
		tty.write("y\r");
		expect((await tty.done).code).toBe(0);
		expect(w.recent).toHaveLength(1);
		expect(ws.records()).toEqual([]);
	});
});
