import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRouterClient } from "@orpc/server";
import { wavHeader } from "@tts-pilot-app/api/drama-script";
import { createProviders } from "@tts-pilot-app/api/providers/index";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { appRouter } from "@tts-pilot-app/api/routers/index";
import { readCloneWav } from "@tts-pilot-app/api/wav";
import { createDb } from "@tts-pilot-app/db";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	COOKIE,
	cloneWav,
	ffmpegPath,
	META,
	type ServeHook,
	serve,
	spawnCli,
	spawnTty,
	until,
	withMeta,
	workspace,
} from "./harness.js";

// 실제 라우터와 공급자 모듈 + PostgreSQL. 공급자 HTTP(전역 fetch)만 흉내 낸다. CLI는 다른 프로세스라 영향이 없다
const url = process.env.CLI_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
	throw new Error("CLI_TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
const OWNER = `cli-clones-${crypto.randomUUID()}`;
const OTHER = `${OWNER}-other`;
const RATE = 24_000;
const NAME = "E2E 목소리";

type Sent = {
	method: string;
	path: string;
	form?: Record<string, string>;
	// 공급자 요청에 든 오디오
	audio: Buffer[];
};
const reply = (status: number, body: unknown, headers = {}) =>
	new Response(JSON.stringify(body), { status, headers });

describe.skipIf(!url)("클론 실제 라우터 E2E", { timeout: 60_000 }, () => {
	const db = createDb({
		DATABASE_URL: url ?? "postgresql://skip@127.0.0.1:1/skip",
	});
	// 대기 표는 소유자가 없는 공용 표다. 같이 도는 다른 테스트를 막지 않게 이 연결의 임시 표로 가린다
	db.$client.options.max = 1;
	db.$client.options.idleTimeoutMillis = 0;
	const made = createProviders({
		fish_audio: "fish-test-key-0001",
		gemini: "test-gemini-key-0001",
	});
	let providers: Partial<typeof made> | null = made;
	let ownerId: string | null = OWNER;
	let hook: ServeHook | undefined;
	let server: Awaited<ReturnType<typeof serve>>;
	let ws: ReturnType<typeof workspace>;
	let sent: Sent[] = [];
	// 공급자의 답. 받은 요청마다 부른다
	let answer: (item: Sent) => Response | Promise<Response>;
	// 공급자 id는 표 전체에서 하나다. 같은 DB를 쓴 다른 실행과 겹치지 않게 한다
	const fishId = () => crypto.randomUUID().replaceAll("-", "");
	const trained: typeof answer = ({ method, path }) => {
		if (method === "DELETE") return reply(200, {});
		if (path.startsWith("/v1beta"))
			return reply(200, { id: `voices/voice_e2e${fishId()}` });
		return reply(200, { _id: fishId(), state: "trained" });
	};
	const web = (owner = OWNER) =>
		createRouterClient(appRouter, {
			context: { db, ownerId: owner, providers: made } as never,
		});

	const run = (...args: string[]) => spawnCli(ws.dir, args).done;
	const body = async (code: number, ...args: string[]) => {
		const result = await run(...args, "--json");
		expect([result.code, result.out]).toEqual([code, expect.anything()]);
		expect(result.out + result.err).not.toContain(COOKIE);
		return JSON.parse(result.out);
	};
	const SOURCE = cloneWav(12 * RATE);
	const CONSENT = cloneWav(3 * RATE, { amp: 5000 });
	const create = (provider: string, name = NAME, bytes = SOURCE) => [
		...["clones", "create", "--provider", provider, "--name", name],
		...["--source", ws.script(bytes, `${bytes.length}.wav`), "--consent"],
		...(provider === "gemini"
			? ["--consent-audio", ws.script(CONSENT, "동의.wav")]
			: []),
	];
	const fish = (...extra: string[]) => [...create("fish_audio"), ...extra];
	const posts = () => sent.filter(({ method }) => method === "POST");
	const deletes = () => sent.filter(({ method }) => method === "DELETE");
	const rows = async () =>
		(
			await db.$client.query(
				"select id, status, reason, provider_voice_id from my_voice where owner_id = $1 order by created_at desc",
				[OWNER],
			)
		).rows;
	const lose = (name: string) => {
		hook = (path, _request, response) => {
			if (path.includes(name))
				response.writeHead = (() => {
					response.destroy();
					return response;
				}) as never;
			return false;
		};
	};

	beforeAll(async () => {
		await db.$client.query(
			"create temp table provider_cooldown (like public.provider_cooldown including all)",
		);
		server = await serve(appRouter, {
			context: (cookie) => ({
				db,
				ownerId: cookie === COOKIE ? ownerId : null,
				providers: cookie === COOKIE && ownerId ? providers : null,
			}),
			user: (cookie) => (cookie === COOKIE ? { id: OWNER } : null),
			hook: (...args) => hook?.(...args) ?? false,
		});
	});
	beforeEach(() => {
		ws = workspace(server.origin);
		ownerId = OWNER;
		providers = made;
		hook = undefined;
		sent = [];
		answer = trained;
		vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
			const target = new URL(input);
			const item: Sent = {
				method: init?.method ?? "GET",
				path: target.pathname,
				audio: [],
			};
			if (init?.body instanceof FormData) {
				item.form = {};
				for (const [key, value] of init.body)
					if (typeof value === "string") item.form[key] = value;
					else item.audio.push(Buffer.from(await value.arrayBuffer()));
			} else if (typeof init?.body === "string") {
				const { replicated } = JSON.parse(init.body).voice;
				for (const part of [replicated.source_audio, replicated.consent_audio])
					item.audio.push(Buffer.from(part.data, "base64"));
			}
			sent.push(item);
			return answer(item);
		});
	});
	const clear = async () => {
		for (const table of ["voice_preset", "saved_voice", "my_voice"])
			await db.$client.query(`delete from ${table} where owner_id = any($1)`, [
				[OWNER, OTHER],
			]);
		await db.$client.query("delete from pg_temp.provider_cooldown");
	};
	afterEach(async () => {
		vi.unstubAllGlobals();
		ws.remove();
		await clear();
	});
	afterAll(async () => {
		server.close();
		await db.$client.end();
	});

	it("Fish Audio: 소리 바이트가 공급자 요청까지 그대로 닿고 보관함에 담긴다", async () => {
		const result = await body(0, ...fish("--yes"));
		expect(result.source).toBe("created");
		const [post, ...rest] = sent;
		expect(rest).toEqual([]);
		expect(post).toMatchObject({
			path: "/model",
			form: { title: NAME, visibility: "private" },
		});
		expect(post?.audio).toHaveLength(1);
		expect(
			post?.audio[0]?.equals(readFileSync(ws.path(`${SOURCE.length}.wav`))),
		).toBe(true);
		const { ref, id } = result.clone;
		const list = await body(0, "voices", "list", "--provider", "fish_audio");
		expect(list.voices).toMatchObject([{ ref }]);
		const clones = await body(0, "clones", "list");
		expect(clones.clones).toMatchObject([{ id, ref, status: "ready" }]);
		expect(clones.providers).toEqual({ fish_audio: true, gemini: true });
		expect(ws.records()).toEqual([]);
	});

	it("Gemini: 원본과 동의 녹음이 공급자 요청까지 그대로 닿는다", async () => {
		const result = await body(0, ...create("gemini"), "--yes");
		expect(result.clone.ref).toMatch(/^gemini:voice_e2e/);
		expect(posts()).toHaveLength(1);
		const [a, b] = posts()[0]?.audio ?? [];
		expect(a?.equals(SOURCE)).toBe(true);
		expect(b?.equals(CONSENT)).toBe(true);
	});

	it("상한 크기(3,000,000바이트)의 파일을 서버가 받는다", async () => {
		const big = cloneWav(60 * RATE, { size: 3_000_000 });
		await body(0, ...create("fish_audio", NAME, big), "--yes");
		// 뒤에 채운 바이트는 보내지 않는다
		expect(posts()[0]?.audio[0]?.equals(cloneWav(60 * RATE))).toBe(true);
	});

	it("부가 정보(LIST·data 뒤 바이트)는 공급자 요청에 없고 소리 바이트만 닿는다", async () => {
		const source = withMeta(SOURCE);
		expect(source.includes(META)).toBe(true);
		await body(0, ...create("fish_audio", NAME, source), "--yes");
		const args = create("gemini", NAME, source);
		ws.script(withMeta(CONSENT), "동의.wav");
		await body(0, ...args, "--yes");
		const audio = posts().flatMap((post) => post.audio);
		expect(audio).toHaveLength(3);
		for (const [i, want] of [SOURCE, SOURCE, CONSENT].entries()) {
			expect(audio[i]?.equals(want)).toBe(true);
			expect(audio[i]?.includes(META)).toBe(false);
		}
	});

	it("실제 m4a를 afconvert로 바꾼 확장형 파일도 공급자에는 일반 PCM 머리로 닿는다", async () => {
		const convert = (seconds: number, name: string) => {
			const raw = ws.path("녹음.m4a");
			execFileSync(ffmpegPath(), [
				...["-nostdin", "-y", "-loglevel", "error", "-f", "lavfi"],
				...["-i", `sine=frequency=440:duration=${seconds}`, "-ac", "1", raw],
			]);
			execFileSync("/usr/bin/afconvert", [
				...["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", raw],
				ws.path(name),
			]);
			const bytes = readFileSync(ws.path(name));
			expect(bytes.readUInt16LE(20)).toBe(0xfffe);
			return bytes;
		};
		const source = convert(12, "원본.wav");
		const consent = convert(3, "동의.wav");
		const args = create("gemini", NAME, source);
		ws.script(consent, "동의.wav");
		await body(0, ...args, "--yes");
		await body(0, ...create("fish_audio", NAME, source), "--yes");
		const audio = posts().flatMap((post) => post.audio);
		expect(audio).toHaveLength(3);
		for (const [i, from] of [source, consent, source].entries()) {
			const bytes = audio[i] ?? Buffer.alloc(0);
			expect(
				bytes.subarray(0, 44).equals(wavHeader(bytes.length - 44, RATE)),
			).toBe(true);
			expect(from.includes(bytes.subarray(44))).toBe(true);
			expect(readCloneWav(bytes)).toBeCloseTo(i === 1 ? 3 : 12, 1);
		}
	});

	it("부가 정보만 다른 파일은 같은 요청이라 응답을 잃은 뒤 다시 보내지 않는다", async () => {
		lose("myVoiceCreate");
		const { requestId } = await body(6, ...fish("--yes"));
		hook = undefined;
		const again = await body(
			0,
			...create("fish_audio", NAME, withMeta(SOURCE)),
			"--yes",
		);
		expect(again.source).toBe("resumed");
		expect(posts()).toHaveLength(1);
		const resumed = await body(0, "clones", "resume", requestId);
		expect(resumed.clone.id).toBe(again.clone.id);
	});

	it("동의·확인·dry-run·같은 이름에서 공급자를 부르지 않는다", async () => {
		const args = fish();
		await body(2, ...args.filter((arg) => arg !== "--consent"), "--yes");
		await body(2, ...args);
		await body(0, ...args, "--dry-run");
		expect(sent).toEqual([]);
		expect(await rows()).toEqual([]);
		await body(0, ...args, "--yes");
		for (const extra of ["--yes", "--dry-run"])
			expect((await body(2, ...args, extra)).code).toBe("CONFLICT");
		const other = cloneWav(15 * RATE);
		await body(2, ...create("fish_audio", ` ${NAME}\t`, other), "--yes");
		expect(posts()).toHaveLength(1);
		await body(0, ...args, "--yes", "--new");
		expect(posts()).toHaveLength(2);
	});

	it("처리 중 → check → 사용 가능, 없어진 클론은 5(not_found)", async () => {
		answer = ({ method, path }) =>
			method === "POST"
				? reply(200, { _id: fishId(), state: "training" })
				: reply(200, { _id: path.split("/").at(-1), state: "training" });
		const { clone } = await body(0, ...fish("--yes"));
		expect(clone).toMatchObject({ status: "processing", ref: null });
		expect((await body(0, "clones", "check", clone.id)).clone.status).toBe(
			"processing",
		);
		await body(4, "clones", "save", clone.id);
		answer = ({ path }) =>
			reply(200, { _id: path.split("/").at(-1), state: "trained" });
		const ready = await body(0, "clones", "check", clone.id);
		expect(ready.clone).toMatchObject({
			status: "ready",
			savedVoiceId: expect.any(String),
		});
		// 공급자 조회는 확인마다 한 번이고, 처리 중이 아니면 부르지 않는다
		const gets = () => sent.filter(({ method }) => method === "GET").length;
		expect(gets()).toBe(2);
		await body(0, "clones", "check", clone.id);
		expect(gets()).toBe(2);

		answer = ({ method }) =>
			method === "POST"
				? reply(200, { _id: fishId(), state: "training" })
				: reply(404, {});
		const other = await body(0, ...create("fish_audio", "다른"), "--yes");
		expect(await body(5, "clones", "check", other.clone.id)).toMatchObject({
			reason: "not_found",
			cloneId: other.clone.id,
		});
	});

	it("품질 실패는 5이고 다시 만들 수 있으며 remove가 공급자에서도 지운다", async () => {
		answer = (item) =>
			item.method === "POST"
				? reply(200, {
						_id: fishId(),
						state: "trained",
						quality: { audios: [{ quality_passed: false }] },
					})
				: trained(item);
		const failed = await body(5, ...fish("--yes"));
		expect(failed).toMatchObject({ code: "CREATE_FAILED", reason: "quality" });
		expect(ws.records()).toEqual([]);
		answer = trained;
		await body(0, ...fish("--yes"));
		await body(0, "clones", "remove", failed.cloneId, "--yes");
		expect(deletes()).toHaveLength(1);
		expect(await rows()).toHaveLength(1);
	});

	it("응답을 잃어도 같은 요청만 확인하고 공급자는 1회다", async () => {
		lose("myVoiceCreate");
		const { requestId } = await body(6, ...fish("--yes"));
		hook = undefined;
		expect(ws.records()).toMatchObject([{ requestId, kind: "clones" }]);
		const again = await body(0, ...fish("--yes"));
		expect(again).toMatchObject({ source: "resumed" });
		expect(ws.records()).toEqual([]);
		const resumed = await body(0, "clones", "resume", requestId);
		expect(resumed.clone.id).toBe(again.clone.id);
		expect(posts()).toHaveLength(1);
	});

	it("같은 입력·같은 이름·다른 이름의 동시 실행과 웹의 만들기에서 공급자는 1회다", async () => {
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		answer = async (item) => {
			await held;
			return trained(item);
		};
		const first = spawnCli(ws.dir, fish("--yes", "--json"));
		await until(() => posts().length === 1, "공급자 요청");
		const [record] = ws.records();
		const same = await body(6, ...fish("--yes"));
		expect(same.requestId).toBe(record?.requestId);
		const other = cloneWav(15 * RATE);
		expect(
			await body(6, ...create("fish_audio", NAME, other), "--yes"),
		).toMatchObject({ code: "UNCONFIRMED", cloneId: expect.any(String) });
		// 이름이 다르면 서버의 '보내는 중 하나' 제한이 막고 기록은 풀린다
		expect(
			await body(5, ...create("fish_audio", "다른 이름"), "--yes"),
		).toMatchObject({ reason: "in_progress" });
		expect(ws.records()).toEqual([record]);
		// 보내는 중인 줄은 지우지 않는다
		const [row] = await rows();
		await body(2, "clones", "remove", row.id, "--yes");
		open();
		expect((await first.done).code).toBe(0);
		expect(posts()).toHaveLength(1);
	});

	it("웹이 만드는 중이면 막히고 기록이 남지 않는다", async () => {
		let open!: () => void;
		const held = new Promise<void>((done) => {
			open = done;
		});
		answer = async (item) => {
			await held;
			return trained(item);
		};
		const creating = web().myVoiceCreate({
			requestId: crypto.randomUUID(),
			provider: "fish_audio",
			name: "웹에서",
			consent: true,
			source: new File([new Uint8Array(SOURCE)], "source.wav"),
		});
		await until(() => posts().length === 1, "웹의 공급자 요청");
		await body(5, ...fish("--yes"));
		expect(ws.records()).toEqual([]);
		open();
		await creating;
		expect(posts()).toHaveLength(1);
	});

	it("확인 프롬프트에 함께 선 두 프로세스에서 공급자는 1회다", async () => {
		const a = spawnTty(ws.dir, fish());
		const b = spawnTty(ws.dir, fish());
		await until(
			() => a.seen().includes("[y/N]") && b.seen().includes("[y/N]"),
			"두 확인 프롬프트",
		);
		a.write("y\r");
		expect((await a.done).code).toBe(0);
		b.write("y\r");
		expect((await b.done).code).toBe(2);
		expect(posts()).toHaveLength(1);
		expect(ws.records()).toEqual([]);
	});

	it("200이지만 id가 없으면 5이고, 치우기 전에는 다시 실행해도 공급자를 부르지 않는다", async () => {
		answer = (item) =>
			item.method === "POST" ? reply(200, { ok: true }) : trained(item);
		expect((await body(5, ...fish("--yes"))).reason).toBe("provider_error");
		const [row] = await rows();
		expect(row).toMatchObject({ status: "failed", reason: "provider_error" });
		answer = trained;
		for (const extra of ["--yes", "--dry-run"])
			expect(await body(6, ...fish(extra))).toMatchObject({ cloneId: row.id });
		expect(posts()).toHaveLength(1);
		const removed = await run("clones", "remove", row.id, "--yes");
		expect(removed.code).toBe(0);
		expect(removed.err).toContain("Fish Audio 웹");
		// 공급자 id가 없어 줄만 지운다
		expect(deletes()).toEqual([]);
		await body(0, ...fish("--yes"));
		expect(posts()).toHaveLength(2);
	});

	it("공급자 5xx도 같은 이름을 막고 잔액·입력 거절은 막지 않는다", async () => {
		answer = () => reply(402, {});
		expect((await body(5, ...fish("--yes"))).reason).toBe("quota");
		answer = () => reply(422, {});
		expect((await body(5, ...fish("--yes"))).reason).toBe("provider_input");
		answer = () => reply(503, {});
		expect((await body(5, ...fish("--yes"))).reason).toBe("provider_error");
		await body(6, ...fish("--yes"));
		expect(posts()).toHaveLength(3);
		expect(ws.records()).toEqual([]);
	});

	it("공급자 응답을 못 받으면 6이고 resume·재실행·치운 뒤에도 --new만 새로 만든다", async () => {
		answer = () => {
			throw new TypeError("fetch failed");
		};
		const { requestId } = await body(6, ...fish("--yes"));
		const [row] = await rows();
		expect(row).toMatchObject({ status: "unknown" });
		await body(6, ...fish("--yes"));
		await body(6, "clones", "resume", requestId);
		// 다른 기기(기록 없음)에서도 줄이 막는다
		const other = workspace(server.origin);
		try {
			const result = await spawnCli(other.dir, fish("--yes", "--json")).done;
			expect(result.code).toBe(6);
			expect(JSON.parse(result.out).cloneId).toBe(row.id);
		} finally {
			other.remove();
		}
		expect((await body(0, "clones", "list")).clones[0].note).toContain(
			"Fish Audio 웹",
		);
		await body(0, "clones", "remove", row.id, "--yes");
		expect(deletes()).toEqual([]);
		await body(6, ...fish("--yes"));
		await body(6, "clones", "resume", requestId);
		expect(posts()).toHaveLength(1);
		answer = trained;
		await body(0, ...fish("--yes", "--new"));
		expect(posts()).toHaveLength(2);
		expect(ws.records()).toEqual([]);
	});

	it("5분 지난 보내는 중은 resume에서 6이고 쓰지 않는다", async () => {
		lose("myVoiceCreate");
		const { requestId } = await body(6, ...fish("--yes"));
		hook = undefined;
		await db.$client.query(
			"update my_voice set status = 'sending', created_at = now() - interval '6 minutes' where owner_id = $1",
			[OWNER],
		);
		await body(6, "clones", "resume", requestId);
		expect((await rows())[0].status).toBe("sending");
		expect(ws.records()).toHaveLength(1);
		const list = await body(0, "clones", "list");
		expect(list.clones[0].status).toBe("unknown");
	});

	it("보관함에서 뺀 클론을 다시 담는다", async () => {
		const { clone } = await body(0, ...fish("--yes"));
		await body(0, "voices", "remove", clone.ref, "--yes");
		const [listed] = (await body(0, "clones", "list")).clones;
		expect(listed).toMatchObject({ savedVoiceId: null });
		expect(listed.note).toContain("clones save");
		await body(0, "clones", "save", clone.id);
		expect((await body(0, "voices", "list")).voices).toMatchObject([
			{ ref: clone.ref },
		]);
	});

	it("지우면 공급자와 보관함에서 사라지고 쓰는 프리셋을 알린다", async () => {
		const { clone } = await body(0, ...fish("--yes"));
		await web().presetCreate({
			name: "클론 프리셋",
			channelId: null,
			channelDefault: false,
			voice: clone.voice,
			provider: "fish_audio",
			settings: DEFAULT_SETTINGS.fish_audio,
		});
		const refused = await run("clones", "remove", clone.id);
		expect(refused.code).toBe(2);
		expect(refused.err).toContain("프리셋 1개(클론 프리셋)");
		expect(deletes()).toEqual([]);
		await body(0, "clones", "remove", clone.id, "--yes");
		expect(deletes()).toMatchObject([
			{ path: `/model/${clone.voice.voiceId}` },
		]);
		expect((await body(0, "voices", "list")).voices).toEqual([]);
		expect((await body(0, "clones", "list")).clones).toEqual([]);
		await body(4, "clones", "remove", clone.id, "--yes");
	});

	it("키 없음·대기 중은 줄이 그대로이고, 공급자 429는 삭제 대기로 다시 시도한다", async () => {
		const { clone } = await body(0, ...fish("--yes"));
		providers = { gemini: made.gemini };
		const none = await body(5, "clones", "remove", clone.id, "--yes");
		expect(none).toMatchObject({ reason: "no_key", cloneId: clone.id });
		expect(none.message).toContain("그대로");
		expect((await body(5, ...create("fish_audio", "새"), "--yes")).reason).toBe(
			"no_key",
		);
		providers = made;
		await db.$client.query(
			"insert into provider_cooldown (provider, until) values ('fish_audio', now() + interval '1 minute')",
		);
		const waiting = await body(5, "clones", "remove", clone.id, "--yes");
		expect(waiting).toMatchObject({
			reason: "rate_limit",
			retryAt: expect.any(String),
		});
		expect(waiting.message).toContain("그대로");
		expect((await rows())[0].status).toBe("ready");
		expect(deletes()).toEqual([]);
		await db.$client.query("delete from pg_temp.provider_cooldown");

		answer = () => reply(429, {}, { "retry-after": "30" });
		const limited = await body(5, "clones", "remove", clone.id, "--yes");
		expect(limited).toMatchObject({
			reason: "rate_limit",
			retryAt: expect.any(String),
		});
		expect(limited.message).toContain("삭제 대기");
		expect(deletes()).toHaveLength(1);
		// 이용 불가로 막힌다
		const [voice] = (await body(0, "voices", "list")).voices;
		expect(voice.unavailable).toBe(true);
		await db.$client.query("delete from pg_temp.provider_cooldown");
		answer = trained;
		await body(0, "clones", "remove", clone.id, "--yes");
		expect(await rows()).toEqual([]);
	});

	it("지우기 응답을 잃거나 공급자 응답을 못 받으면 6이다", async () => {
		const { clone } = await body(0, ...fish("--yes"));
		answer = (item) => {
			if (item.method === "DELETE") throw new TypeError("fetch failed");
			return trained(item);
		};
		const unsure = await body(6, "clones", "remove", clone.id, "--yes");
		expect(unsure.message).toContain("삭제 대기");
		answer = trained;
		lose("myVoiceDelete");
		const lost = await body(6, "clones", "remove", clone.id, "--yes");
		expect(lost.message).toContain("목록에 없");
	});

	it("남의 클론과 요청은 보이지 않고, 비소유자는 3이다", async () => {
		const { clone } = await body(0, ...fish("--yes"));
		const { rows: found } = await db.$client.query(
			"select request_id from my_voice where id = $1",
			[clone.id],
		);
		const requestId = found[0].request_id;
		const before = sent.length;
		ownerId = OTHER;
		expect((await body(0, "clones", "list")).clones).toEqual([]);
		for (const args of [
			["clones", "check", clone.id],
			["clones", "save", clone.id],
			["clones", "remove", clone.id, "--yes"],
		])
			await body(4, ...args);
		await body(6, "clones", "resume", requestId);
		ownerId = null;
		for (const args of [["clones", "list"], fish("--yes")])
			await body(3, ...args);
		expect(sent).toHaveLength(before);
	});
});
