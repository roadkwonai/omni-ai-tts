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
} from "./client.js";
import { readSettings } from "./files.js";
import { clean, confirmRemoval, note, print, table } from "./output.js";
import { mutate } from "./paid.js";
import { parseRef, refOf, resolveVoice } from "./voices.js";

type Client = Connection["client"];

export function idOf({ extra, id }: Pick<Args, "extra" | "id">): string {
	const value = id(extra[0]);
	if (!value) throw input("ID가 필요합니다.");
	return value;
}
// 준 ID 목록. none은 비우기이고 주지 않으면 undefined다
export function idsOf({ list, id }: Args, name: string): string[] | undefined {
	const values = list(name);
	if (!values.length) return undefined;
	if (values.includes("none")) {
		if (values.length > 1)
			throw input(`--${name} none은 다른 ID와 함께 쓸 수 없습니다.`);
		return [];
	}
	return values.map((value) => id(value) ?? value);
}
// 하나만 고르는 ID. none은 null이고 주지 않으면 undefined다
export function oneOf({ text, id }: Args, name: string) {
	const value = text(name);
	return value === "none" ? null : id(value);
}
// --이름과 --no-이름. 주지 않으면 undefined다
export function switchOf({ flag }: Args, name: string): boolean | undefined {
	if (flag(name) && flag(`no-${name}`))
		throw input(`--${name}과 --no-${name} 중 하나를 선택해 주세요.`);
	return flag(name) ? true : flag(`no-${name}`) ? false : undefined;
}
export function needChange(given: string[]) {
	if (!given.some((name) => name !== "json" && name !== "url"))
		throw input("바꿀 값이 없습니다.");
}
export function found<T>(item: T | undefined): T {
	if (item === undefined)
		throw new ClientError("NOT_FOUND", 4, "찾을 수 없습니다.");
	return item;
}
// 사람이 읽는 한 항목. 칸 이름과 값
export const lines = (rows: [string, string | number][]) =>
	rows.map(([name, value]) => clean(`${name} ${value}`)).join("\n");
export const yesNo = (value: boolean) => (value ? "예" : "아니요");

// ── 채널·카테고리·타입 ──
type Item = {
	id: string;
	name: string;
	memo: string | null;
	url?: string | null;
};
type Fields = { name: string; memo: string; url: string };
type Group = {
	one: string;
	many: string;
	list(client: Client): Promise<(Item & { voiceCount: number })[]>;
	create(client: Client, fields: Fields): Promise<Item>;
	update(client: Client, id: string, fields: Fields): Promise<Item>;
	remove(client: Client, id: string): Promise<unknown>;
	// 지우면 함께 바뀌는 것(연결된 성우 수 말고)
	impact?(client: Client, id: string): Promise<string[]>;
};
const CHANNEL: Group = {
	one: "channel",
	many: "channels",
	list: (client) => client.channelList(),
	create: (client, fields) => client.channelCreate(fields),
	update: (client, id, fields) => client.channelUpdate({ id, ...fields }),
	remove: (client, id) => client.channelDelete({ id }),
	async impact(client, id) {
		const presets = await client.presetList();
		const count = presets.filter((preset) => preset.channelId === id).length;
		return [`이 채널의 프리셋 ${count}개에서 채널이 비워집니다.`];
	},
};
// 다른 종류의 ID는 목록에 없는 것으로 본다
const classes = (kind: "category" | "type", many: string): Group => ({
	one: kind,
	many,
	list: async (client) =>
		(await client.classificationList()).filter((item) => item.kind === kind),
	create: (client, { name, memo }) =>
		client.classificationCreate({ kind, name, memo }),
	update: (client, id, { name, memo }) =>
		client.classificationUpdate({ id, name, memo }),
	remove: (client, id) => client.classificationDelete({ id }),
});

const itemText = ({ id, name, memo, url }: Item) =>
	lines([
		["이름", name],
		["ID", id],
		["메모", memo ?? "없음"],
		...(url === undefined
			? []
			: ([["주소", url ?? "없음"]] as [string, string][])),
	]);
const commands = (group: Group) => ({
	async list({ json, url }: Args) {
		const { origin, client } = await connect(url);
		const items = (await group.list(client).catch(manageError)).sort((a, b) =>
			a.name.localeCompare(b.name, "ko"),
		);
		print(
			json,
			{ origin, [group.many]: items },
			items.length
				? table(
						["이름", "ID", "성우 수", "메모", "주소"],
						items.map((item) => [
							item.name,
							item.id,
							item.voiceCount,
							item.memo ?? "",
							item.url ?? "",
						]),
					)
				: "항목이 없습니다.",
		);
	},
	async create({ json, url, text }: Args) {
		const { origin, client } = await connect(url);
		const item = await mutate(
			group.create(client, {
				name: text("name") ?? "",
				memo: text("memo") ?? "",
				url: text("link") ?? "",
			}),
		);
		print(json, { origin, [group.one]: item }, itemText(item));
	},
	async update(args: Args) {
		const { json, url, text, given } = args;
		const id = idOf(args);
		needChange(given);
		const { origin, client } = await connect(url);
		const items = await group.list(client).catch(manageError);
		const current = found(items.find((item) => item.id === id));
		// 서버가 칸 전체를 받는다. 없는 메모·주소(null)는 빈 글자로 보낸다
		const item = await mutate(
			group.update(client, id, {
				name: text("name") ?? current.name,
				memo: text("memo") ?? current.memo ?? "",
				url: text("link") ?? current.url ?? "",
			}),
		);
		print(json, { origin, [group.one]: item }, itemText(item));
	},
	async remove(args: Args) {
		const { json, url, flag } = args;
		const id = idOf(args);
		const { origin, client } = await connect(url);
		const items = await group.list(client).catch(manageError);
		const item = found(items.find((each) => each.id === id));
		await confirmRemoval(
			[
				`${item.name}(${id})을 지웁니다. 연결된 성우 ${item.voiceCount}명에서 빠집니다.`,
				...((await group.impact?.(client, id).catch(manageError)) ?? []),
			],
			flag("yes"),
		);
		await mutate(group.remove(client, id));
		print(json, { origin, removed: id }, `지웠습니다. ${clean(item.name)}`);
	},
});
export const channels = commands(CHANNEL);
export const categories = commands(classes("category", "categories"));
export const types = commands(classes("type", "types"));

// ── 프리셋 ──
type Preset = Awaited<ReturnType<Client["presetList"]>>[number];
const presetOf = async (client: Client, id: string): Promise<Preset> =>
	found(
		(await client.presetList().catch(manageError)).find(
			(preset) => preset.id === id,
		),
	);
function printPreset(json: boolean, origin: string, preset: Preset) {
	const ref = preset.voice ? refOf(preset.voice) : null;
	print(
		json,
		{ origin, preset: { ...preset, ref } },
		lines([
			["프리셋", preset.name],
			["프리셋 ID", preset.id],
			["성우", preset.voice?.name ?? "없음"],
			["공급자:성우 ID", ref ?? "없음"],
			["사용 가능", yesNo(preset.voice !== null && !preset.unavailable)],
			["채널 ID", preset.channelId ?? "없음"],
			["채널 기본", yesNo(preset.channelDefault)],
			["설정", JSON.stringify(preset.settings)],
		]),
	);
}
export async function presetShow(args: Args) {
	const id = idOf(args);
	const { origin, client } = await connect(args.url);
	const preset = await presetOf(client, id);
	if (preset.fixed.length)
		note(
			`프리셋의 쓸 수 없는 값을 처음 값으로 바꿨습니다: ${preset.fixed.join(", ")}`,
		);
	printPreset(args.json, origin, preset);
}
// 공급자와 설정의 짝은 parseRef·readSettings가 지킨다(TS가 합집합의 짝을 따라가지 못한다)
type PresetInput = Parameters<Client["presetCreate"]>[0];
export async function presetCreate(args: Args) {
	const { json, url, text, flag } = args;
	const ref = text("voice") ?? "";
	const { provider } = parseRef(ref);
	const channelId = args.id(text("channel-id")) ?? null;
	const file = text("settings");
	const given = file === undefined ? null : await readSettings(provider, file);
	const connection = await connect(url);
	const { voice } = await resolveVoice(connection, ref);
	const preset = await mutate(
		connection.client.presetCreate({
			name: text("name"),
			channelId,
			channelDefault: flag("default"),
			voice,
			provider,
			// 설정을 주지 않으면 이 성우의 기본 설정이다
			settings: given ?? requestOf(voice, "", DEFAULT_SETTINGS).settings,
		} as PresetInput),
	);
	printPreset(json, connection.origin, preset);
}
export async function presetUpdate(args: Args) {
	const { json, url, text, given } = args;
	const id = idOf(args);
	needChange(given);
	const channel = oneOf(args, "channel-id");
	const chosen = switchOf(args, "default");
	const { origin, client } = await connect(url);
	const current = await presetOf(client, id);
	const channelId = channel === undefined ? current.channelId : channel;
	// 채널을 옮기면 기본은 따라가지 않는다(웹과 같다)
	const kept = channelId === current.channelId && current.channelDefault;
	const preset = await mutate(
		client.presetUpdate({
			id,
			name: text("name") ?? current.name,
			channelId,
			channelDefault: chosen ?? kept,
		}),
	);
	if (chosen === undefined && current.channelDefault && !kept)
		note("채널이 바뀌어 채널 기본 지정을 껐습니다.");
	printPreset(json, origin, preset);
}
export async function presetOverwrite(args: Args) {
	const { json, url, text } = args;
	const id = idOf(args);
	const ref = text("voice") ?? "";
	const { provider } = parseRef(ref);
	const settings = await readSettings(provider, text("settings") ?? "");
	const connection = await connect(url);
	const { voice } = await resolveVoice(connection, ref);
	const preset = await mutate(
		connection.client.presetOverwrite({
			id,
			voice,
			provider,
			settings,
		} as Parameters<Client["presetOverwrite"]>[0]),
	);
	printPreset(json, connection.origin, preset);
}
export async function presetDuplicate(args: Args) {
	const id = idOf(args);
	const { origin, client } = await connect(args.url);
	const preset = await mutate(client.presetDuplicate({ id }));
	printPreset(args.json, origin, preset);
}
export async function presetRemove(args: Args) {
	const { json, url, flag } = args;
	const id = idOf(args);
	const { origin, client } = await connect(url);
	const preset = await presetOf(client, id);
	await confirmRemoval(
		[
			`프리셋 ${preset.name}(${id})을 지웁니다.${preset.channelDefault ? " 이 채널의 기본 프리셋이 없어집니다." : ""}`,
		],
		flag("yes"),
	);
	await mutate(client.presetRemove({ id }));
	print(json, { origin, removed: id }, `지웠습니다. ${clean(preset.name)}`);
}
