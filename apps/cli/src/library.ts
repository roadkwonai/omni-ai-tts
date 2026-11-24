import {
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	LIBRARY_SORTS,
	type LibraryFilters,
	type LibrarySort,
	sortSaved,
	TAG_LABEL,
} from "@tts-pilot-app/api/library-filter";
import { AGE_KEY_LABEL, GENDER_LABEL } from "@tts-pilot-app/api/voice-filter";
import type { Args } from "./cli.js";
import {
	ClientError,
	type Connection,
	connect,
	input,
	manageError,
	rpcError,
	savedVoices,
} from "./client.js";
import { idsOf, lines, needChange, switchOf, yesNo } from "./manage.js";
import {
	clean,
	confirmRemoval,
	jsonText,
	note,
	print,
	table,
} from "./output.js";
import { mutate } from "./paid.js";
import { parseRef, refOf, resolveVoice } from "./voices.js";

type Saved = Connection["voices"][number];
const withRef = (saved: Saved) => ({ ...saved, ref: refOf(saved.voice) });
function printVoice(json: boolean, origin: string, saved: Saved) {
	const { voice, channelIds, classificationIds } = saved;
	print(
		json,
		{ origin, voice: withRef(saved) },
		lines([
			["성우", voice.name],
			["공급자:성우 ID", refOf(voice)],
			["사용 가능", yesNo(!saved.unavailable)],
			["즐겨찾기", yesNo(saved.favorite)],
			["자주 사용", yesNo(saved.frequent)],
			["메모", saved.memo ?? "없음"],
			["채널 ID", channelIds.join(", ") || "없음"],
			["분류 ID", classificationIds.join(", ") || "없음"],
			["사용 횟수", saved.useCount],
			["최근 사용", saved.lastUsedAt ?? "없음"],
		]),
	);
}
// 담긴 성우. connect가 방금 읽은 보관함에서 찾는다
async function savedOf({ url, extra }: Args) {
	const ref = extra[0] ?? "";
	parseRef(ref);
	const connection = await connect(url);
	const saved = connection.voices.find(({ voice }) => refOf(voice) === ref);
	if (!saved)
		throw new ClientError(
			"NOT_FOUND",
			4,
			"보관함에 담은 성우가 아닙니다. voices save로 담을 수 있습니다.",
		);
	return { connection, saved };
}
const patchOf = (args: Args) => ({
	favorite: switchOf(args, "favorite"),
	frequent: switchOf(args, "frequent"),
	memo: args.text("memo"),
});

export async function voicesShow(args: Args) {
	const { connection, saved } = await savedOf(args);
	printVoice(args.json, connection.origin, saved);
}
export async function voicesCheck({ json, url }: Args) {
	const { origin, client, voices: before } = await connect(url);
	// 확인할 성우가 없으면 null이다
	const checked = await client.savedVoiceCheck().catch(manageError);
	const voices = (checked ?? before).map(withRef);
	const changed = voices.filter((item) =>
		before.some(
			({ id, unavailable }) =>
				id === item.id && unavailable !== item.unavailable,
		),
	);
	print(
		json,
		{ origin, changed, voices },
		changed.length
			? table(
					["성우", "공급자:성우 ID", "사용 가능"],
					changed.map((item) => [
						item.voice.name,
						item.ref,
						item.unavailable ? "이용 불가" : "가능",
					]),
				)
			: "바뀐 이용 가능 여부가 없습니다.",
	);
}
export async function voicesSave(args: Args) {
	const ref = args.extra[0] ?? "";
	parseRef(ref);
	const patch = patchOf(args);
	const connection = await connect(args.url);
	const { voice } = await resolveVoice(connection, ref);
	const saved = await mutate(
		connection.client.savedVoiceSave({ voice, ...patch }),
	);
	printVoice(args.json, connection.origin, saved);
}
export async function voicesUpdate(args: Args) {
	const { given, json } = args;
	needChange(given);
	const patch = patchOf(args);
	const channelIds = idsOf(args, "channel-id");
	const classificationIds = idsOf(args, "classification-id");
	const { connection, saved } = await savedOf(args);
	const { origin, client } = connection;
	const { voice } = saved;
	const patched = Object.values(patch).some((value) => value !== undefined);
	let result = patched
		? await mutate(client.savedVoiceSave({ voice, ...patch }))
		: saved;
	if (channelIds || classificationIds)
		result = await mutate(
			client.savedVoiceLinks({
				voice,
				channelIds: channelIds ?? result.channelIds,
				classificationIds: classificationIds ?? result.classificationIds,
			}),
		).catch((error: unknown) => {
			if (patched)
				note(
					"연결을 바꾸지 못했습니다. 앞에서 바꾼 즐겨찾기·자주 사용·메모는 남습니다.",
				);
			throw error;
		});
	printVoice(json, origin, result);
}
export async function voicesRemove(args: Args) {
	const { json, flag } = args;
	const { connection, saved } = await savedOf(args);
	const { origin, client } = connection;
	const { id, voice, channelIds, classificationIds } = saved;
	const presets = (await client.presetList().catch(manageError)).filter(
		(preset) => preset.savedVoiceId === id,
	);
	await confirmRemoval(
		[
			`${voice.name}(${refOf(voice)})을 보관함에서 뺍니다.`,
			`이 성우를 쓰는 프리셋 ${presets.length}개, 연결된 채널 ${channelIds.length}개와 분류 ${classificationIds.length}개가 영향을 받습니다.`,
		],
		flag("yes"),
	);
	await mutate(client.savedVoiceRemove({ id }));
	print(json, { origin, removed: id }, `뺐습니다. ${clean(voice.name)}`);
}

// 보관함 조건의 키와 이름(웹 조건 칸과 같은 표)
const KEYS = {
	gender: GENDER_LABEL,
	age: AGE_KEY_LABEL,
	content: TAG_LABEL.content,
	mood: TAG_LABEL.mood,
	sort: new Map<string, string>(
		LIBRARY_SORTS.map(({ value, label }) => [value, label]),
	),
};
function keysOf({ list }: Args, name: keyof typeof KEYS): string[] {
	const keys = list(name);
	const known = KEYS[name];
	if (!keys.every((key) => known.has(key)))
		throw input(
			`--${name}는 다음 가운데 하나여야 합니다: ${[...known].map(([key, label]) => `${key}(${label})`).join(", ")}`,
		);
	return keys;
}
// 주지 않은 조건은 거르지 않는다
function filtersOf(args: Args): LibraryFilters {
	const { text, list, flag, id } = args;
	const ids = (name: string) => list(name).map((value) => id(value) ?? value);
	return {
		...EMPTY_LIBRARY_FILTERS,
		q: text("q") ?? "",
		view: flag("preset") ? "preset" : "all",
		category: ids("category-id"),
		type: ids("type-id"),
		gender: keysOf(args, "gender").at(-1) ?? null,
		age: keysOf(args, "age").at(-1) ?? null,
		content: keysOf(args, "content"),
		mood: keysOf(args, "mood"),
		sort: (keysOf(args, "sort").at(-1) ?? "recent") as LibrarySort,
	};
}
// 이 옵션이 있을 때만 웹의 거르기를 건다
const CONDITIONS = [
	...["q", "preset", "category-id", "type-id"],
	...["gender", "age", "content", "mood"],
];
// 없거나 다른 종류의 분류 ID는 찾을 수 없는 것이다
async function checkClasses(client: Connection["client"], f: LibraryFilters) {
	if (!f.category.length && !f.type.length) return;
	const all = await client.classificationList().catch(rpcError);
	const has = (kind: string) => (id: string) =>
		all.some((item) => item.id === id && item.kind === kind);
	if (!f.category.every(has("category")) || !f.type.every(has("type")))
		throw new ClientError("NOT_FOUND", 4, "분류를 찾을 수 없습니다.");
}
export async function voicesList(args: Args) {
	const { json, url, text, flag, id, given } = args;
	const channel = text("channel");
	const provider = text("provider");
	let channelId = id(text("channel-id"), "채널 ID를 확인해 주세요.");
	if (channel && channelId)
		throw new ClientError(
			"INPUT",
			2,
			"채널 이름과 ID 중 하나를 선택해 주세요.",
		);
	const filters = filtersOf(args);
	const data = await savedVoices(url);
	await checkClasses(data.client, filters);
	const presets = flag("preset")
		? await data.client.presetList().catch(rpcError)
		: [];
	if (channel) {
		const channels = await data.client.channelList().catch(rpcError);
		const matches = channels.filter((item) => item.name === channel);
		if (matches.length !== 1)
			throw new ClientError(
				"INPUT",
				2,
				"일치하는 채널을 하나 찾을 수 없습니다. 채널 ID를 사용해 주세요.",
			);
		channelId = matches[0]?.id;
	}
	const kept = data.voices.filter(
		(item) =>
			(!provider || item.voice.provider === provider) &&
			(!flag("favorite") || item.favorite) &&
			(!flag("frequent") || item.frequent) &&
			(!channelId || item.channelIds.includes(channelId)),
	);
	const found = given.some((name) => CONDITIONS.includes(name))
		? filterSaved(
				kept,
				filters,
				new Set(presets.flatMap(({ savedVoiceId }) => savedVoiceId ?? [])),
			)
		: kept;
	const voices = sortSaved(found, filters.sort).map((item) => ({
		...item,
		ref: `${item.voice.provider}:${item.voice.voiceId}`,
	}));
	process.stdout.write(
		json
			? `${jsonText({ origin: data.origin, voices })}\n`
			: voices.length
				? `성우\t공급자:성우 ID\t사용 가능\t즐겨찾기\t자주 사용\t채널 ID\t분류 ID\t사용 횟수\t최근 사용\n${voices.map((item) => `${clean(item.voice.name)}\t${clean(item.ref)}\t${item.unavailable ? "이용 불가" : "가능"}\t${item.favorite ? "예" : "아니요"}\t${item.frequent ? "예" : "아니요"}\t${item.channelIds.map(clean).join(", ")}\t${item.classificationIds.map(clean).join(", ")}\t${item.useCount}\t${clean(item.lastUsedAt ?? "없음")}`).join("\n")}\n`
				: given.some((name) => !["json", "url", "sort"].includes(name))
					? "조건에 맞는 성우가 없습니다.\n"
					: "담은 성우가 없습니다.\n",
	);
}
