import { resolve } from "node:path";
import {
	codePoints,
	DEFAULT_SETTINGS,
	normalizeText,
	requestOf,
	TRIAL_TEXT_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { Args } from "./cli.js";
import {
	ClientError,
	type Connection,
	connect,
	input,
	manageError,
	serverError,
} from "./client.js";
import {
	checkExtension,
	checkOut,
	MIME,
	readInput,
	readSettings,
	saveBytes,
} from "./files.js";
import { confirmRemoval, print, table, usageText } from "./output.js";
import {
	checkKind,
	downloadStopped,
	type Kind,
	mutate,
	noteChanged,
	type Output,
	onInterrupt,
	recover,
	runPaid,
	show,
	showRecords,
	unconfirmed,
} from "./paid.js";
import { parseRef, resolveVoice } from "./voices.js";

// 서버가 받는 시험 생성 오디오 상한(packages/api routers/trial.ts MAX_AUDIO_BYTES)
const TRIAL_AUDIO_MAX = 4 * 1024 * 1024;

type Audio = Awaited<ReturnType<Connection["client"]["trialAudio"]>>;
const isAudio = (audio: unknown): audio is File =>
	audio instanceof Blob &&
	audio.size > 0 &&
	audio.size <= TRIAL_AUDIO_MAX &&
	Object.values<string>(MIME).includes(audio.type);

async function write(
	{ id, createdAt, usage, audio }: Audio,
	out: string,
	overwrite: boolean,
): Promise<Pick<Output, "result" | "out" | "mime">> {
	try {
		saveBytes(out, overwrite, new Uint8Array(await audio.arrayBuffer()));
	} catch {
		throw new ClientError(
			"DOWNLOAD_FAILED",
			7,
			"음성 파일을 저장하지 못했습니다. trial download로 다시 받을 수 있습니다.",
			{ resultId: id },
		);
	}
	return {
		result: { id, createdAt, usage, bytes: audio.size },
		out: resolve(out),
		mime: audio.type,
	};
}

export async function download(
	{ client }: Connection,
	id: string,
	out: string,
	overwrite: boolean,
) {
	const resultId = id;
	onInterrupt(() => downloadStopped("trial", id));
	const result = await client
		.trialAudio({ id })
		.catch((error: unknown) => manageError(error, { resultId }));
	if (!isAudio(result?.audio))
		throw serverError("결과의 오디오가 올바르지 않습니다.", { resultId });
	try {
		checkExtension(out, result.audio.type);
	} catch (error) {
		if (error instanceof ClientError) error.detail = { resultId };
		throw error;
	}
	return write(result, out, overwrite);
}

const optionsOf = ({ json, url, text, flag }: Args) => ({
	url,
	json,
	out: text("out"),
	overwrite: flag("overwrite"),
});
type Written = Awaited<ReturnType<typeof write>> | { error: ClientError };
export function trialKind({
	json,
	out = "",
	overwrite,
}: Pick<ReturnType<typeof optionsOf>, "json" | "out" | "overwrite">): Kind & {
	written(): Written | undefined;
} {
	// 응답으로 받은 오디오를 파일로 둔 결과. 응답을 받은 뒤에만 있다
	let written: Written | undefined;
	return {
		name: "trial",
		written: () => written,
		async find({ client }, request) {
			const found = await client.trialFindMany([request]).catch(manageError);
			if (!Array.isArray(found)) throw serverError();
			return found[0] ? { ...found[0], status: "done" as const } : null;
		},
		async create({ client }, input) {
			const result = await client.trialCreate(input);
			if (typeof result?.id !== "string" || !isAudio(result.audio))
				throw new Error("결과가 아닌 응답");
			// 확장자와 다른 형식은 요청과 다른 응답이다
			checkExtension(out, result.audio.type);
			return result;
		},
		status: ({ client }, requestId) => client.trialRequest({ requestId }),
		// 서버는 완료를 저장하지 못해도 오디오를 돌려준다. 손에 든 오디오를 먼저 파일로 두고 완료를 확인한다
		async settle({ client }, requestId, result) {
			onInterrupt(() => downloadStopped("trial", result.id, requestId));
			try {
				written = await write(result as Audio, out, overwrite);
				onInterrupt(() => unconfirmed("trial", requestId));
			} catch (error) {
				written = { error: error as ClientError };
			}
			const row = await client.trialRequest({ requestId }).catch(() => null);
			if (row?.status !== "done") return false;
			onInterrupt(() => downloadStopped("trial", result.id));
			return true;
		},
		async finish(connection, source, id, requestId) {
			const kept = requestId ? { requestId } : {};
			const saved =
				(source === "created" && written) ||
				(await download(connection, id, out, overwrite));
			if ("error" in saved) {
				saved.error.detail = { ...saved.error.detail, ...kept };
				throw saved.error;
			}
			show(json, { origin: connection.origin, source, ...saved, ...kept });
		},
	};
}

export async function trialGenerate(args: Args) {
	const { text, flag } = args;
	const options = {
		...optionsOf(args),
		input: text("input"),
		yes: flag("yes"),
		fresh: flag("new"),
		dryRun: flag("dry-run"),
	};
	const { out = "", overwrite } = options;
	const ref = text("voice") ?? "";
	const { provider } = parseRef(ref);
	const given = text("text");
	if ((given === undefined) === (options.input === undefined))
		throw input("--text와 --input 중 하나를 선택해 주세요.");
	checkOut(out, overwrite);
	checkExtension(out, provider === "gemini" ? MIME[".wav"] : MIME[".mp3"]);
	const line = normalizeText(given ?? (await readInput(options.input ?? "")));
	if (!line) throw input("문장이 비어 있습니다.");
	if (codePoints(line) > TRIAL_TEXT_MAX)
		throw input(
			`시험 생성은 ${TRIAL_TEXT_MAX}자까지 보낼 수 있습니다(지금 ${codePoints(line)}자).`,
		);
	const file = text("settings");
	const settings =
		file === undefined
			? DEFAULT_SETTINGS[provider]
			: await readSettings(provider, file);
	const connection = await connect(options.url);
	const { voice, saved } = await resolveVoice(connection, ref);
	if (saved?.unavailable)
		throw new ClientError(
			"VOICE_UNAVAILABLE",
			4,
			"지금 쓸 수 없는 성우입니다.",
		);
	const request = requestOf(voice, line, {
		...DEFAULT_SETTINGS,
		[provider]: settings,
	});
	noteChanged(settings, request);
	await runPaid(trialKind(options), connection, voice, request, options);
}

export async function trialDownload(id: string, args: Args) {
	const options = optionsOf(args);
	checkOut(options.out ?? "", options.overwrite);
	const connection = await connect(options.url);
	await trialKind(options).finish(connection, "saved", id);
}

export async function trialResume(requestId: string | undefined, args: Args) {
	const options = optionsOf(args);
	if (requestId === undefined)
		return showRecords("trial", options.url, options.json);
	if (options.out !== undefined) checkOut(options.out, options.overwrite);
	await checkKind("trial", options.url, requestId);
	const connection = await connect(options.url);
	const kind = trialKind(options);
	const result = await recover(kind, connection, requestId);
	if (options.out !== undefined)
		return kind.finish(connection, "resumed", result.id);
	show(options.json, {
		origin: connection.origin,
		source: "resumed",
		result,
		out: null,
		mime: null,
	});
}

export async function trialList({ json, url, text }: Args) {
	const { provider, voiceId } = parseRef(text("voice") ?? "");
	const { origin, client } = await connect(url);
	const results = await client
		.trialList({ provider, voiceId })
		.catch(manageError);
	print(
		json,
		{ origin, results },
		results.length
			? table(
					["결과 ID", "문장", "모델", "사용량", "만든 시각"],
					results.map(({ id, request, usage, createdAt }) => [
						id,
						request.text,
						request.settings.model,
						usageText(usage),
						createdAt,
					]),
				)
			: "시험 생성 결과가 없습니다.",
	);
}

export async function trialRemove(id: string, { json, url, flag }: Args) {
	const { origin, client } = await connect(url);
	await confirmRemoval(
		[`시험 생성 결과 ${id}를 작업실에서 지웁니다.`],
		flag("yes"),
	);
	await mutate(client.trialDelete({ id }));
	print(json, { origin, removed: id }, `지웠습니다. 결과 ID ${id}`);
}
