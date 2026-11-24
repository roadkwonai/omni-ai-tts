import { mkdirSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	COOKIE,
	cloneWav,
	type serve,
	spawnCli,
	studioWorld,
	USER,
	workspace,
} from "./harness.js";

const ID = "00000000-0000-4000-8000-000000000001";
const TYPE = "00000000-0000-4000-8000-000000000002";
const VOICE = "typecast:v1";
const READ = {
	version: 1,
	speakers: [{ name: "가", voice: VOICE }],
	lines: [{ speaker: 0, text: "줄" }],
};
const SCENE = {
	...READ,
	speakers: [{ name: "가", voice: "fish_audio:fish" }],
};
const WORK = {
	defaultVoice: {
		provider: "typecast",
		voiceId: "v1",
		settings: DEFAULT_SETTINGS.typecast,
	},
	gap: 0.5,
	paragraphs: [{ id: "p1", text: "하나" }],
};
type Ws = ReturnType<typeof workspace>;
// [작업실이 아닌 응답을 받을 요청, 종료 코드, 응답이 끊겼을 때의 종료 코드, 명령]
type Row = [string, number, number, (ws: Ws) => string[]];
const row = (
	[bad, cut]: [number, number],
	target: string,
	command: string,
	rest: (ws: Ws) => string[] = () => [],
): Row => [target, bad, cut, (ws) => [...command.split(" "), ...rest(ws)]];
const read = (...args: [string, string, ((ws: Ws) => string[])?]) =>
	row([5, 5], ...args);
const change = (...args: [string, string, ((ws: Ws) => string[])?]) =>
	row([5, 6], ...args);
// 요금이 나올 수 있거나 공급자에서 지우는 요청, 그 요청의 확인
const unsure = (...args: [string, string, ((ws: Ws) => string[])?]) =>
	row([6, 6], ...args);

const work = (ws: Ws) => ["--work", ws.script(JSON.stringify(WORK), "w.json")];
const text = (ws: Ws) => ["--input", ws.script("대본", "t.txt")];
const json = (value: object) => (ws: Ws) => [
	"--input",
	ws.script(JSON.stringify(value), "s.json"),
];
const out = (name: string) => (ws: Ws) => ["--out", ws.path(name)];
const outDir = (ws: Ws) => {
	mkdirSync(ws.path("out"));
	return ["--out-dir", ws.path("out")];
};
const settings = (ws: Ws) => ["--settings", ws.script("{}", "set.json")];
const source = (ws: Ws) => ["--source", ws.script(cloneWav(12 * 24_000), "c")];
const all =
	(...parts: ((ws: Ws) => string[])[]) =>
	(ws: Ws) =>
		parts.flatMap((part) => part(ws));
const yes = () => ["--yes"];
const mp3 = out("a.mp3");
const wav = out("a.wav");

const items = (group: string, name: string, id: string) => [
	read(`${name}List`, `${group} list`),
	change(`${name}Create`, `${group} create --name 이름`),
	change(`${name}Update`, `${group} update ${id} --memo 메모`),
	change(`${name}Delete`, `${group} remove ${id} --yes`),
];
const clone = "clones create --provider fish_audio --name 이름 --consent";
const ROWS: Row[] = [
	read("savedVoiceList", "auth status"),
	read("sign-out", "auth logout"),
	read("savedVoiceList", "voices list"),
	read("providerStatus", "providers status --provider typecast"),
	read("voiceList", "casting search --provider typecast"),
	read("voiceAccents", "casting accents --language ko"),
	change("voiceListRefresh", "casting refresh --provider airy"),
	read("voiceList", "casting sample typecast:none", mp3),
	read("trialList", `trial list --voice ${VOICE}`),
	read("trialAudio", `trial download ${ID}`, mp3),
	unsure("trialRequest", `trial resume ${ID}`),
	change("trialDelete", `trial remove ${ID} --yes`),
	read("trialFindMany", `trial generate --voice ${VOICE} --text 글 --yes`, mp3),
	unsure("trialCreate", `trial generate --voice ${VOICE} --text 글 --yes`, mp3),
	read("savedVoiceCheck", "voices check"),
	change("savedVoiceSave", `voices save ${VOICE}`),
	change("savedVoiceSave", `voices update ${VOICE} --favorite`),
	change("savedVoiceLinks", `voices update ${VOICE} --channel-id none`),
	change("savedVoiceRemove", `voices remove ${VOICE} --yes`),
	...items("channels", "channel", ID),
	...items("categories", "classification", ID),
	...items("types", "classification", TYPE),
	read("presetList", "presets list"),
	read("presetList", `presets show ${ID}`),
	change("presetCreate", `presets create --name 이름 --voice ${VOICE}`),
	change("presetUpdate", `presets update ${ID} --name 이름`),
	change(
		"presetOverwrite",
		`presets overwrite ${ID} --voice ${VOICE}`,
		settings,
	),
	change("presetDuplicate", `presets duplicate ${ID}`),
	change("presetRemove", `presets remove ${ID} --yes`),
	read("scriptList", "scripts list"),
	read("scriptGet", `scripts show ${ID}`),
	change("scriptCreate", "scripts create --title 제목", text),
	change("scriptSave", `scripts save ${ID} --force`, work),
	change("scriptUpdate", `scripts update ${ID} --title 제목`),
	change("scriptDuplicate", `scripts duplicate ${ID}`),
	change("scriptRemove", `scripts remove ${ID} --yes`),
	read("studioInfo", `studio download ${ID}`, mp3),
	unsure("studioRequest", `studio resume ${ID}`),
	read("studioFindMany", "studio plan", work),
	read("scriptGet", `studio plan --script-id ${ID}`),
	read("scriptGet", `studio join --script-id ${ID}`, wav),
	read("scriptGet", `numbers check --script-id ${ID}`),
	read(
		"studioFindMany",
		`studio generate --voice ${VOICE} --yes`,
		all(text, mp3),
	),
	unsure(
		"studioCreate",
		`studio generate --voice ${VOICE} --yes`,
		all(text, mp3),
	),
	unsure("studioCreate", "studio batch", all(work, outDir, yes)),
	unsure("studioAutoTag", "studio autotag", all(work, out("a.json"), yes)),
	read("dramaList", "drama list"),
	read("dramaList", `drama split ${ID}`, outDir),
	unsure("dramaRequest", `drama resume ${ID}`),
	change("dramaDelete", `drama remove ${ID} --yes`),
	read("dramaFind", "drama generate", all(json(SCENE), wav, yes)),
	unsure("dramaCreate", "drama generate", all(json(SCENE), wav, yes)),
	unsure("trialCreate", "drama read", all(json(READ), outDir, yes)),
	unsure("dramaAutoTag", "drama autotag", all(json(READ), out("a.json"), yes)),
	read("myVoiceList", "clones list"),
	change("myVoiceCheck", `clones check ${ID}`),
	change("myVoiceSave", `clones save ${ID}`),
	unsure("myVoiceRequest", `clones resume ${ID}`),
	unsure("myVoiceDelete", `clones remove ${ID} --yes`),
	read("myVoiceList", clone, all(source, yes)),
	unsure("myVoiceCreate", clone, all(source, yes)),
];

type Reply = (request: IncomingMessage, response: ServerResponse) => void;
const REPLIES: Record<"302" | "HTML 200" | "끊김", Reply> = {
	"302": (_request, response) => {
		response.writeHead(302, { location: "/login" });
		response.end();
	},
	"HTML 200": (_request, response) => {
		response.setHeader("content-type", "text/html; charset=utf-8");
		response.end("<h1>점검 중</h1>");
	},
	끊김: (request) => {
		request.socket.destroy();
	},
};

describe("작업실이 아닌 응답과 끊긴 응답", { timeout: 120_000 }, () => {
	let w: ReturnType<typeof studioWorld>;
	let server: Awaited<ReturnType<typeof serve>>;
	let reply: Reply;
	// 망가진 응답을 실제로 받은 줄
	const hit = new Set<number>();
	beforeAll(async () => {
		w = studioWorld();
		w.voices = w.voices.map((item) => ({ ...item, id: ID, memo: null }));
		w.channels = [{ id: ID, name: "채널", memo: null, url: null }];
		w.classes = [
			{ id: ID, kind: "category", name: "분류", memo: null },
			{ id: TYPE, kind: "type", name: "타입", memo: null },
		];
		w.presets = [
			{
				...{ id: ID, name: "프리셋", provider: "typecast", voice: null },
				...{ channelId: null, channelDefault: false, savedVoiceId: null },
				...{ settings: {}, fixed: [], unavailable: false },
			},
		];
		const script = {
			...{ id: ID, title: "대본", version: 1, workId: null },
			...{ channelId: null, classificationIds: [], work: WORK },
		};
		w.scripts = [script];
		w.clone({ id: ID });
		// 요청 하나만 망가뜨린다. 어느 것인지는 쿠키로 알려 한 서버를 함께 쓴다
		w.user = (cookie) => (cookie.startsWith(COOKIE) ? { id: USER } : null);
		w.hook = (path, request, response) => {
			const [, target, at] =
				/target=([^.]+)\.(\d+)/.exec(request.headers.cookie ?? "") ?? [];
			if (!target || path.split("?")[0]?.endsWith(`/${target}`) !== true)
				return false;
			hit.add(Number(at));
			reply(request, response);
			return true;
		};
		server = await w.serve();
	});
	afterAll(() => server.close());

	// 명령 하나를 자기 세션 폴더에서 실행하고, 기대와 다르면 그 까닭을 돌려준다
	async function check(
		ws: Ws,
		at: number,
		expected: number,
		[target, , , args]: Row,
	) {
		const cookie = `${COOKIE}; target=${target}.${at}`;
		const sessions = { [server.origin]: { cookie, version: "v1" } };
		writeFileSync(
			join(ws.dir, "sessions.json"),
			JSON.stringify({ current: server.origin, sessions }),
			{ mode: 0o600 },
		);
		const command = args(ws);
		const { code, out } = await spawnCli(ws.dir, [...command, "--json"]).done;
		const problems = [
			...(code === expected ? [] : [`${expected} 기대, ${code}`]),
			...(out.trim().split("\n").length === 1 ? [] : ["JSON 한 건 아님"]),
			...(hit.has(at) ? [] : ["요청 안 함"]),
		];
		return problems.map(
			(text) => `${command.slice(0, 2).join(" ")}(${target}) ${text}`,
		);
	}

	it.each(["302", "HTML 200", "끊김"] as const)(
		"%s이면 모든 명령이 관리 5, 유료 6이고 끊긴 변경은 6이다",
		async (mode) => {
			reply = REPLIES[mode];
			hit.clear();
			const wrong: string[] = [];
			const spaces: Ws[] = [];
			const queue = [...ROWS.entries()];
			const worker = async () => {
				for (let next = queue.shift(); next; next = queue.shift()) {
					const [at, item] = next;
					const ws = workspace(server.origin);
					spaces.push(ws);
					const expected = item[mode === "끊김" ? 2 : 1];
					wrong.push(...(await check(ws, at, expected, item)));
				}
			};
			await Promise.all(Array.from({ length: 8 }, worker)).finally(() => {
				for (const ws of spaces) ws.remove();
			});
			expect(wrong).toEqual([]);
			expect(w.synth).toBe(0);
		},
	);
});
