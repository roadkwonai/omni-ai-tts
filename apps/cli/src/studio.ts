import { resolve } from "node:path";
import { familyOf } from "@tts-pilot-app/api/drama-acting";
import { sendText, unsentCount } from "@tts-pilot-app/api/paragraph-tags";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	normalizeText,
	partsOf,
	requestOf,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	studioTextMax,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import {
	ClientError,
	type Connection,
	connect,
	detailOf,
	rpcError,
	serverError,
} from "./client.js";
import {
	checkExtension,
	checkOut,
	extensionOf,
	type FileOptions,
	MIME,
	readInput,
	save,
} from "./files.js";
import { clean, note, print } from "./output.js";
import {
	downloadStopped,
	type Kind,
	noteChanged,
	onInterrupt,
	type PaidOptions,
	resumeRequest,
	runPaid,
	show,
} from "./paid.js";
import type { KindName } from "./requests.js";

// 공급자가 돌려주는 형식
export const mimeOf = (provider: string) =>
	provider === "gemini" ? MIME[".wav"] : MIME[".mp3"];

export type GenerateOptions = FileOptions &
	PaidOptions & {
		voice?: string;
		presetId?: string;
	};

// 결과 하나의 정보. 모르는 형식은 거절한다
export async function infoOf({ client }: Connection, id: string) {
	const resultId = id;
	const info = await client
		.studioInfo({ id })
		.catch((error: unknown) => rpcError(error, { resultId }));
	if (!Object.values(MIME).includes(info?.audioType))
		throw serverError("결과의 파일 형식을 알 수 없습니다.", { resultId });
	return info;
}
export type Info = Awaited<ReturnType<typeof infoOf>>;
// 결과의 조각. 조각 길이의 합이 bytes라 전체 길이도 함께 확인된다
export async function* partsFrom(
	{ client }: Connection,
	{ id, bytes, audioType }: Info,
) {
	if (!Number.isInteger(bytes) || bytes < 1 || bytes > STUDIO_AUDIO_MAX)
		throw new Error("결과 길이가 올바르지 않다");
	for (let part = 0; part < partsOf(bytes); part += 1) {
		const file = await client.studioAudio({ id, part });
		const length = Math.min(
			STUDIO_PART_BYTES,
			bytes - part * STUDIO_PART_BYTES,
		);
		if (file.size !== length || file.type !== audioType)
			throw new Error("조각 길이나 형식이 다르다");
		yield new Uint8Array(await file.arrayBuffer());
	}
}
export const downloadFailed = (
	error: unknown,
	resultId: string,
	kind: KindName = "studio",
) =>
	new ClientError(
		"DOWNLOAD_FAILED",
		7,
		`음성 파일을 저장하지 못했습니다. ${kind} download로 다시 받을 수 있습니다.`,
		{ ...detailOf(error), resultId },
	);
export async function downloadTo(
	connection: Connection,
	info: Info,
	out: string,
	overwrite: boolean,
) {
	try {
		await save(out, overwrite, partsFrom(connection, info));
	} catch (error) {
		throw downloadFailed(error, info.id);
	}
}

async function download(
	connection: Connection,
	id: string,
	out: string,
	overwrite: boolean,
) {
	onInterrupt(() => downloadStopped("studio", id));
	const info = await infoOf(connection, id);
	try {
		checkExtension(out, info.audioType);
	} catch (error) {
		if (error instanceof ClientError) error.detail = { resultId: id };
		throw error;
	}
	await downloadTo(connection, info, out, overwrite);
	const { createdAt, usage, bytes } = info;
	return {
		result: { id, createdAt, usage, bytes },
		out: resolve(out),
		mime: info.audioType,
	};
}

export const studioKind = ({
	json,
	out = "",
	overwrite,
}: FileOptions): Kind => ({
	name: "studio",
	async find({ client }, request) {
		const found = await client.studioFindMany([request]).catch(rpcError);
		if (!Array.isArray(found)) throw serverError();
		return found[0] ?? null;
	},
	async create({ client }, input) {
		const result = await client.studioCreate(input);
		// 중간 장비의 200 같은 응답은 결과가 아니다(처리 여부 미확인)
		if (typeof result?.id !== "string") throw new Error("결과가 아닌 응답");
		return result;
	},
	status: ({ client }, requestId) => client.studioRequest({ requestId }),
	// 작업실은 완료를 저장한 뒤에만 응답한다
	settle: async () => true,
	finish: async (connection, source, id) =>
		show(json, {
			origin: connection.origin,
			source,
			...(await download(connection, id, out, overwrite)),
		}),
});

async function pick(
	connection: Connection,
	options: GenerateOptions,
	text: string,
): Promise<{ voice: Voice; request: TrialRequest }> {
	const unavailable = (message: string) =>
		new ClientError("VOICE_UNAVAILABLE", 4, message);
	if (options.voice !== undefined) {
		const at = options.voice.indexOf(":");
		const provider = options.voice.slice(0, at);
		const voiceId = options.voice.slice(at + 1);
		const found = connection.voices.find(
			({ voice }) => voice.provider === provider && voice.voiceId === voiceId,
		);
		if (!found) throw unavailable("보관함에 담은 성우가 아닙니다.");
		if (found.unavailable) throw unavailable("지금 쓸 수 없는 성우입니다.");
		return {
			voice: found.voice,
			request: requestOf(found.voice, text, DEFAULT_SETTINGS),
		};
	}
	const presets = await connection.client.presetList().catch(rpcError);
	const preset = presets.find(({ id }) => id === options.presetId);
	if (!preset)
		throw new ClientError("NOT_FOUND", 4, "프리셋을 찾을 수 없습니다.");
	if (!preset.voice)
		throw unavailable("프리셋의 성우가 보관함에서 빠졌습니다.");
	if (preset.unavailable)
		throw unavailable("프리셋의 성우를 지금 쓸 수 없습니다.");
	const request = requestOf(preset.voice, text, {
		...DEFAULT_SETTINGS,
		[preset.provider]: preset.settings,
	});
	if (preset.fixed.length)
		note(
			`프리셋의 쓸 수 없는 값을 처음 값으로 바꿨습니다: ${preset.fixed.join(", ")}`,
		);
	noteChanged(preset.settings, request);
	return { voice: preset.voice, request };
}

export async function generate(options: GenerateOptions) {
	const { out = "", overwrite } = options;
	checkOut(out, overwrite);
	const text = normalizeText(await readInput(options.input ?? ""));
	if (!text) throw new ClientError("INPUT", 2, "대본이 비어 있습니다.");
	const connection = await connect(options.url);
	const { voice, request } = await pick(connection, options, text);
	const max = studioTextMax(request.provider);
	if (codePoints(text) > max)
		throw new ClientError(
			"INPUT",
			2,
			`대본은 ${max}자까지 보낼 수 있습니다(지금 ${codePoints(text)}자).`,
		);
	checkExtension(out, mimeOf(request.provider));
	// 웹과 같이 모델이 받지 않는 태그를 빼고 보낸다
	const family = familyOf(request.provider, request.settings.model);
	const removed = unsentCount(family, text);
	const sent = removed ? normalizeText(sendText(family, text)) : text;
	if (!sent)
		throw new ClientError(
			"INPUT",
			2,
			"모델이 받지 않는 태그를 빼면 대본이 비어 있습니다.",
		);
	if (removed) note(`모델이 받지 않아 뺀 태그 ${removed}개`);
	await runPaid(
		studioKind(options),
		connection,
		voice,
		removed ? { ...request, text: sent } : request,
		options,
		removed ? request : undefined,
	);
}

export async function downloadResult(id: string, options: FileOptions) {
	const { out = "", overwrite } = options;
	checkOut(out, overwrite);
	const connection = await connect(options.url);
	await studioKind(options).finish(connection, "saved", id);
}

export const resume = (requestId: string | undefined, options: FileOptions) =>
	resumeRequest(studioKind(options), requestId, options);

export async function presets(options: Pick<FileOptions, "url" | "json">) {
	const { origin, client } = await connect(options.url);
	const list = (await client.presetList().catch(rpcError)).map((preset) => ({
		...preset,
		ref: preset.voice
			? `${preset.voice.provider}:${preset.voice.voiceId}`
			: null,
	}));
	print(
		options.json,
		{ origin, presets: list },
		list.length
			? `프리셋\t프리셋 ID\t성우\t공급자:성우 ID\t모델\t사용 가능\t파일 형식\n${list
					.map((item) =>
						[
							item.name,
							item.id,
							item.voice?.name ?? "없음",
							item.ref ?? "없음",
							item.settings.model,
							item.voice && !item.unavailable ? "가능" : "이용 불가",
							extensionOf(mimeOf(item.provider)),
						]
							.map(clean)
							.join("\t"),
					)
					.join("\n")}`
			: "프리셋이 없습니다.",
	);
}
