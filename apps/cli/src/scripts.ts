import { resolve } from "node:path";
import {
	DEFAULT_SETTINGS,
	requestOf,
} from "@tts-pilot-app/api/providers/trial-options";
import type { Args } from "./cli.js";
import {
	ClientError,
	type Connection,
	connect,
	input,
	manageError,
	stale,
} from "./client.js";
import { checkOut, readInput, readJson, saveBytes } from "./files.js";
import { idOf, idsOf, lines, needChange, oneOf } from "./manage.js";
import {
	byteText,
	clean,
	confirmRemoval,
	note,
	print,
	table,
} from "./output.js";
import { mutate } from "./paid.js";
import {
	mergeText,
	newWork,
	paragraphsOf,
	type Work,
	workText,
} from "./script-work.js";
import { parseRef, resolveVoice } from "./voices.js";

type Client = Connection["client"];
// 서버 상한 2MiB에 여유를 더한다(정확한 상한은 서버가 본다)
const WORK_BYTES_MAX = 3 * 1024 * 1024;

const get = (client: Client, id: string) =>
	client.scriptGet({ id }).catch(manageError);
type Script = Awaited<ReturnType<typeof get>>;
const titleOf = ({ title, work }: Script) =>
	title ?? `최근 대본 "${[...workText(work)].slice(0, 30).join("")}"`;
const head = (script: Script): [string, string | number][] => [
	["대본", titleOf(script)],
	["대본 ID", script.id],
	["판", script.version],
	["채널 ID", script.channelId ?? "없음"],
	["분류 ID", script.classificationIds.join(", ") || "없음"],
];

// 커서는 목록이 준 JSON 그대로다
function cursorOf(value: string | undefined) {
	if (value === undefined) return undefined;
	try {
		return JSON.parse(value) as { at: string; id: string };
	} catch {
		throw input("--cursor는 목록이 준 JSON이어야 합니다.");
	}
}
export async function scriptList(args: Args) {
	const { json, url, text, list, flag, given, id } = args;
	const ids = (name: string) => list(name).map((value) => id(value) ?? value);
	const recent = flag("recent");
	if (recent && given.some((name) => !["json", "url", "recent"].includes(name)))
		throw input("--recent에는 다른 조건을 쓸 수 없습니다.");
	const channel = oneOf(args, "channel-id");
	const query = {
		kind: recent ? ("recent" as const) : ("saved" as const),
		q: text("q"),
		channel: channel === null ? "none" : channel,
		category: ids("category-id"),
		type: ids("type-id"),
		cursor: cursorOf(text("cursor")),
	};
	const { origin, client } = await connect(url);
	const { items, next } = await client.scriptList(query).catch(manageError);
	print(
		json,
		{ origin, scripts: items, next },
		[
			items.length
				? table(
						["대본", "대본 ID", "판", "문단", "글자", "채널 ID", "고친 시각"],
						items.map((item) => [
							item.title ?? item.preview.slice(0, 30),
							item.id,
							item.version,
							item.paragraphCount,
							item.charCount,
							item.channelId ?? "",
							item.updatedAt,
						]),
					)
				: "대본이 없습니다.",
			...(next ? [`다음 쪽 --cursor '${clean(JSON.stringify(next))}'`] : []),
		].join("\n"),
	);
}

export async function scriptShow(args: Args) {
	const { json, url, text, flag } = args;
	const id = idOf(args);
	const out = text("out");
	const overwrite = flag("overwrite");
	if (out === undefined && overwrite)
		throw input("--overwrite에는 --out이 필요합니다.");
	if (out !== undefined) checkOut(out, overwrite, [".txt", ".json"]);
	const { origin, client } = await connect(url);
	const script = await get(client, id);
	const { work, ...rest } = script;
	if (out === undefined) {
		// 줄바꿈은 남기고 줄마다 제어 문자를 지운다
		const body = workText(work).split(/\r\n?|\n/);
		print(
			json,
			{ origin, script },
			`${lines(head(script))}\n\n${body.map(clean).join("\n")}`,
		);
		return;
	}
	const body = Buffer.from(
		`${out.toLowerCase().endsWith(".json") ? JSON.stringify(work) : workText(work)}\n`,
	);
	try {
		await saveBytes(out, overwrite, body);
	} catch {
		throw new ClientError(
			"DOWNLOAD_FAILED",
			7,
			"대본 파일을 저장하지 못했습니다.",
		);
	}
	const bytes = body.byteLength;
	print(
		json,
		{ origin, script: rest, out: resolve(out), bytes },
		`${lines(head(script))}\n저장 ${clean(resolve(out))}\n크기 ${byteText(bytes)}`,
	);
}

// --input의 글이나 --work의 작업 JSON. 모양과 상한은 서버가 본다
async function readSource({ text }: Args): Promise<string | { work: Work }> {
	const file = text("input");
	const work = text("work");
	if ((file === undefined) === (work === undefined))
		throw input("--input과 --work 중 하나를 선택해 주세요.");
	if (work !== undefined)
		return { work: (await readJson(work, WORK_BYTES_MAX)) as Work };
	const raw = await readInput(file ?? "", WORK_BYTES_MAX);
	if (!paragraphsOf(raw).length) throw input("대본이 비어 있습니다.");
	return raw;
}
async function voiceSetup(connection: Connection, ref: string | undefined) {
	if (ref === undefined) return null;
	const { voice, saved } = await resolveVoice(connection, ref);
	if (!saved)
		note("보관함에 담지 않은 성우입니다. 웹에서는 담은 뒤에 쓸 수 있습니다.");
	const { provider, voiceId, settings } = requestOf(
		voice,
		"",
		DEFAULT_SETTINGS,
	);
	return { provider, voiceId, settings: { ...settings } };
}
export async function scriptCreate(args: Args) {
	const { json, url, text, id } = args;
	const ref = text("voice");
	if (ref !== undefined) parseRef(ref);
	if (ref !== undefined && text("work") !== undefined)
		throw input(
			"--voice는 --input과 함께 씁니다. 작업 JSON에 성우가 있습니다.",
		);
	const channelId = id(text("channel-id")) ?? null;
	const classificationIds = idsOf(args, "classification-id") ?? [];
	const source = await readSource(args);
	const connection = await connect(url);
	const work =
		typeof source === "string"
			? newWork(source, await voiceSetup(connection, ref))
			: source.work;
	const script = await mutate(
		connection.client.scriptCreate({
			title: text("title") ?? "",
			channelId,
			classificationIds,
			work,
		}),
	);
	print(
		json,
		{ origin: connection.origin, script },
		lines([
			["대본", script.title],
			["대본 ID", script.id],
			["판", script.version],
		]),
	);
}

export async function scriptSave(args: Args) {
	const { json, url, text, flag } = args;
	const id = idOf(args);
	const force = flag("force");
	const given = text("version");
	if ((given === undefined) === !force)
		throw input("--version과 --force 중 하나를 선택해 주세요.");
	if (given !== undefined && !/^[1-9]\d{0,9}$/.test(given))
		throw input("--version은 show에서 본 판 번호여야 합니다.");
	const source = await readSource(args);
	const { origin, client } = await connect(url);
	const current = await get(client, id);
	const { version } = current;
	if (given !== undefined && Number(given) !== version) throw stale();
	const { work, lost } =
		typeof source === "string"
			? mergeText(current.work, source)
			: { ...source, lost: 0 };
	if (lost)
		await confirmRemoval(
			[
				`대본 ${titleOf(current)}(${id})에서 설정(쉼·성우·화자·숫자 검수)이 있는 문단 ${lost}개를 잃습니다.`,
			],
			flag("yes"),
			"문단의 설정을 잃는 저장입니다.",
			"저장할까요?",
			// stdin을 대본으로 다 읽어 답을 받을 수 없다
			process.stdin.isTTY && text("input") !== "-",
		);
	const { channelId } = current;
	const result = await mutate(
		client.scriptSave({ id, version, force, channelId, work }),
	);
	print(
		json,
		{
			origin,
			script: { id, title: current.title, version: result.version },
			lost,
		},
		lines([
			["대본", titleOf(current)],
			["대본 ID", id],
			["판", result.version],
		]),
	);
}

export async function scriptUpdate(args: Args) {
	const { json, url, text, given } = args;
	const id = idOf(args);
	needChange(given);
	const channelId = oneOf(args, "channel-id");
	const classificationIds = idsOf(args, "classification-id");
	const { origin, client } = await connect(url);
	const title = text("title");
	await mutate(
		client.scriptUpdate({ id, title, channelId, classificationIds }),
	);
	const script = await get(client, id);
	const { work: _, ...rest } = script;
	print(json, { origin, script: rest }, lines(head(script)));
}
export async function scriptDuplicate(args: Args) {
	const id = idOf(args);
	const { origin, client } = await connect(args.url);
	const script = await mutate(client.scriptDuplicate({ id }));
	print(
		args.json,
		{ origin, script },
		lines([
			["대본", script.title],
			["대본 ID", script.id],
		]),
	);
}
export async function scriptRemove(args: Args) {
	const { json, url, flag } = args;
	const id = idOf(args);
	const { origin, client } = await connect(url);
	const title = titleOf(await get(client, id));
	await confirmRemoval([`대본 ${title}(${id})을 지웁니다.`], flag("yes"));
	await mutate(client.scriptRemove({ id }));
	print(json, { origin, removed: id }, `지웠습니다. ${clean(title)}`);
}
