import type { Args } from "./cli.js";
import {
	ClientError,
	type Connection,
	connect,
	manageError,
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
	const voices = (await client.savedVoiceCheck().catch(manageError)).map(
		withRef,
	);
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

export async function voicesList({ json, url, text, flag, id }: Args) {
	const channel = text("channel");
	const provider = text("provider");
	let channelId = id(text("channel-id"), "채널 ID를 확인해 주세요.");
	if (channel && channelId)
		throw new ClientError(
			"INPUT",
			2,
			"채널 이름과 ID 중 하나를 선택해 주세요.",
		);
	const data = await savedVoices(url, Boolean(channel || channelId));
	if (channel) {
		const matches = data.channels.filter((item) => item.name === channel);
		if (matches.length !== 1)
			throw new ClientError(
				"INPUT",
				2,
				"일치하는 채널을 하나 찾을 수 없습니다. 채널 ID를 사용해 주세요.",
			);
		channelId = matches[0]?.id;
	}
	const voices = data.voices
		.filter(
			(item) =>
				(!provider || item.voice.provider === provider) &&
				(!flag("favorite") || item.favorite) &&
				(!flag("frequent") || item.frequent) &&
				(!channelId || item.channelIds.includes(channelId)),
		)
		.map((item) => ({
			...item,
			ref: `${item.voice.provider}:${item.voice.voiceId}`,
		}));
	process.stdout.write(
		json
			? `${jsonText({ origin: data.origin, voices })}\n`
			: voices.length
				? `성우\t공급자:성우 ID\t사용 가능\t즐겨찾기\t자주 사용\t채널 ID\t분류 ID\t사용 횟수\t최근 사용\n${voices.map((item) => `${clean(item.voice.name)}\t${clean(item.ref)}\t${item.unavailable ? "이용 불가" : "가능"}\t${item.favorite ? "예" : "아니요"}\t${item.frequent ? "예" : "아니요"}\t${item.channelIds.map(clean).join(", ")}\t${item.classificationIds.map(clean).join(", ")}\t${item.useCount}\t${clean(item.lastUsedAt ?? "없음")}`).join("\n")}\n`
				: "담은 성우가 없습니다.\n",
	);
}
