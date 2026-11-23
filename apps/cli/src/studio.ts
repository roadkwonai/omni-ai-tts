import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { ORPCError } from "@orpc/client";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	estimate,
	needsConfirm,
	normalizeText,
	partsOf,
	requestOf,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	studioTextMax,
	type TrialRequest,
	type Usage,
} from "@tts-pilot-app/api/providers/trial-options";
import type { StudioResult } from "@tts-pilot-app/api/studio-contract";
import {
	ClientError,
	type Connection,
	connect,
	currentOrigin,
	detailOf,
	REASON_TEXT,
	reasonOf,
	rpcError,
	serverError,
} from "./client.js";
import {
	checkExtension,
	checkOut,
	discard,
	extensionOf,
	MIME,
	readInput,
	save,
} from "./files.js";
import { byteText, clean, note, print, report, usageText } from "./output.js";
import {
	claim,
	fingerprint,
	recordOf,
	recordsOf,
	release,
} from "./requests.js";

export type StudioOptions = {
	url?: string;
	json: boolean;
	out?: string;
	overwrite: boolean;
};
export type GenerateOptions = StudioOptions & {
	voice?: string;
	presetId?: string;
	input?: string;
	yes: boolean;
	fresh: boolean;
	dryRun: boolean;
};

const canceled = () => new ClientError("CANCELED", 2, "취소했습니다.");
const unconfirmed = (requestId: string, message?: string) =>
	new ClientError(
		"UNCONFIRMED",
		6,
		message ??
			"처리 여부를 확인하지 못했습니다. studio resume으로 다시 확인하세요. 새로 만들려면 --new를 쓰세요(요금이 다시 나올 수 있습니다).",
		{ requestId },
	);
const downloadStopped = (resultId: string) =>
	new ClientError(
		"DOWNLOAD_STOPPED",
		7,
		"내려받기를 멈췄습니다. studio download로 다시 받을 수 있습니다.",
		{ resultId },
	);

// 지금 Ctrl+C를 누르면 알릴 결과. 선점, 응답, 내려받기 단계마다 바꾼다
let interrupted: () => ClientError = canceled;
export function watchInterrupt() {
	process.on("SIGINT", () => {
		discard();
		process.exit(report(interrupted()));
	});
}

// 기록을 못 지워도 결과를 잃지 않는다. 남은 기록은 다음 실행에서 같은 요청 ID로 다시 확인한다
async function releaseOrWarn(...args: Parameters<typeof release>) {
	try {
		await release(...args);
	} catch {
		note("요청 기록을 정리하지 못했습니다.");
	}
}

async function download(
	{ client }: Connection,
	result: { id: string },
	out: string,
	overwrite: boolean,
) {
	const { id } = result;
	const resultId = id;
	interrupted = () => downloadStopped(id);
	const info = await client
		.studioInfo({ id })
		.catch((error: unknown) => rpcError(error, { resultId }));
	if (!Object.values(MIME).includes(info?.audioType))
		throw serverError("결과의 파일 형식을 알 수 없습니다.", { resultId });
	try {
		checkExtension(out, info.audioType);
	} catch (error) {
		if (error instanceof ClientError) error.detail = { resultId };
		throw error;
	}
	const { bytes } = info;
	let reason = {};
	async function* parts() {
		if (!Number.isInteger(bytes) || bytes < 1 || bytes > STUDIO_AUDIO_MAX)
			throw new Error("결과 길이가 올바르지 않다");
		// 조각 길이의 합이 bytes라 전체 길이도 함께 확인된다
		for (let part = 0; part < partsOf(bytes); part += 1) {
			const file = await client
				.studioAudio({ id, part })
				.catch((error: unknown) => {
					reason = detailOf(error);
					throw error;
				});
			const length = Math.min(
				STUDIO_PART_BYTES,
				bytes - part * STUDIO_PART_BYTES,
			);
			if (file.size !== length || file.type !== info.audioType)
				throw new Error("조각 길이나 형식이 다르다");
			yield new Uint8Array(await file.arrayBuffer());
		}
	}
	try {
		await save(out, overwrite, parts());
	} catch {
		throw new ClientError(
			"DOWNLOAD_FAILED",
			7,
			"음성 파일을 저장하지 못했습니다. studio download로 다시 받을 수 있습니다.",
			{ ...reason, resultId },
		);
	}
	return {
		result: {
			id,
			createdAt: info.createdAt,
			usage: info.usage,
			bytes,
		},
		out: resolve(out),
		mime: info.audioType,
	};
}

// 요청 UUID 하나의 상태만 본다. 합성하지 않는다. 같은 조합의 다른 결과는 이 요청의 완료가 아니다
async function recover(
	{ client, origin }: Connection,
	requestId: string,
): Promise<StudioResult> {
	interrupted = () => unconfirmed(requestId);
	const row = await client.studioRequest({ requestId }).catch(() => null);
	if (row?.status === "done") {
		interrupted = () => downloadStopped(row.id);
		await releaseOrWarn(origin, requestId);
		const { id, createdAt, usage, bytes } = row;
		return { id, createdAt, usage, bytes };
	}
	if (row?.status === "failed") {
		await releaseOrWarn(origin, requestId);
		const reason = reasonOf(row.reason);
		throw new ClientError(
			"CREATE_FAILED",
			5,
			reason ? REASON_TEXT[reason] : "음성을 만들지 못했습니다.",
			{ requestId, ...(reason ? { reason } : {}) },
		);
	}
	throw unconfirmed(requestId);
}

type Output = {
	origin: string;
	source: "created" | "saved" | "resumed";
	result: StudioResult;
	out: string | null;
	mime: string | null;
};
const show = (json: boolean, output: Output) =>
	print(
		json,
		output,
		[
			`결과 ID ${clean(output.result.id)}`,
			...(output.out ? [`저장 ${clean(output.out)}`] : []),
			`크기 ${byteText(output.result.bytes)}`,
			`사용량 ${usageText(output.result.usage)}${output.source === "saved" ? " (저장된 결과라 새로 쓰지 않았습니다)" : ""}`,
		].join("\n"),
	);

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
	const before: Record<string, unknown> = preset.settings;
	const changed = Object.entries(request.settings).filter(
		([key, value]) => before[key] !== value,
	);
	if (changed.length)
		note(
			`지금 쓸 수 없는 값을 바꿨습니다: ${changed.map(([key, value]) => `${key} ${before[key]} → ${value}`).join(", ")}`,
		);
	if (request.provider === "fish_audio" && changed.length)
		note("Fish Audio 무료 기간이 끝나 유료 모델로 만듭니다.");
	return { voice: preset.voice, request };
}

function summary(
	voice: Voice,
	request: TrialRequest,
	usage: Usage,
	rateKnown: boolean,
): string[] {
	return [
		`성우 ${voice.name} (${request.provider}:${request.voiceId})`,
		`모델 ${request.settings.model}`,
		`글자 수 ${codePoints(request.text)}자`,
		`예상 사용량 ${usageText(usage)}${rateKnown ? "" : " (배율을 확인하지 못했어요)"}`,
		...(/\[[^\]]*\]/.test(request.text)
			? [
					"대괄호 태그를 원문 그대로 보냅니다(모델이 태그를 읽거나 웹과 다른 결과가 될 수 있습니다).",
				]
			: []),
	].map(clean);
}

async function confirm(
	lines: string[],
	{ yes, input }: GenerateOptions,
): Promise<void> {
	for (const line of lines) note(line);
	if (yes) return;
	if (!process.stdin.isTTY || input === "-")
		throw new ClientError(
			"CONFIRM_REQUIRED",
			2,
			"요금이 나올 수 있는 생성입니다. 확인했으면 --yes를 붙여 실행하세요.",
		);
	const answer = await new Promise<string>((done) => {
		const prompt = createInterface({
			input: process.stdin,
			output: process.stderr,
		});
		prompt.once("SIGINT", () => prompt.close());
		prompt.once("close", () => done(""));
		prompt.question("요금이 나올 수 있습니다. 만들까요? [y/N] ", (value) => {
			done(value);
			prompt.close();
		});
	});
	if (answer.trim().toLowerCase() !== "y") throw canceled();
}

// 서버가 공급자를 부르기 전에 거절한 코드(웹 studio-view의 BEFORE_PROVIDER와 같다)
const BEFORE_PROVIDER = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"]);
async function isRejected(
	{ client }: Connection,
	requestId: string,
	error: unknown,
): Promise<boolean> {
	const { reason } = detailOf(error);
	if (reason === "unknown_outcome") return false;
	if (reason === "in_progress" || reason === "storage") {
		try {
			const row = await client.studioRequest({ requestId });
			return row === null || row.status === "failed";
		} catch {
			return false;
		}
	}
	return (
		reason !== undefined ||
		(error instanceof ORPCError && BEFORE_PROVIDER.has(error.code))
	);
}

// 합성 요청을 보내는 유일한 곳. 먼저 선점하고, 보내는 것은 한 번뿐이다
async function create(
	connection: Connection,
	request: TrialRequest,
	fresh: boolean,
): Promise<{ source: Output["source"]; result: StudioResult }> {
	const { client, origin, userId } = connection;
	const requestId = randomUUID();
	const { claimed, previous } = await claim(
		fingerprint(origin, userId, request),
		{
			origin,
			requestId,
			provider: request.provider,
			createdAt: new Date().toISOString(),
		},
		fresh,
		() => {
			interrupted = () => unconfirmed(requestId);
		},
	);
	// 확인하는 사이 다른 프로세스가 선점했다
	if (!claimed && previous)
		return {
			source: "resumed",
			result: await recover(connection, previous.requestId),
		};
	if (!fresh) {
		// 앞선 프로세스가 확인하는 사이 끝냈을 수 있다. 완료는 기록이 지워지기 전에 서버에 저장된다
		const found = await lookup(connection, request).catch(
			async (error: unknown) => {
				await releaseOrWarn(origin, requestId);
				throw error;
			},
		);
		if (found) {
			await releaseOrWarn(origin, requestId);
			return { source: "saved", result: usable(found) };
		}
	}
	try {
		const result = await client.studioCreate({ requestId, request });
		// 중간 장비의 200 같은 응답은 결과가 아니다(처리 여부 미확인)
		if (typeof result?.id !== "string") throw new Error("결과가 아닌 응답");
		interrupted = () => downloadStopped(result.id);
		await releaseOrWarn(origin, requestId);
		return { source: "created", result };
	} catch (error) {
		if (await isRejected(connection, requestId, error)) {
			await releaseOrWarn(origin, requestId, previous);
			rpcError(error);
		}
		const unknown = unconfirmed(requestId);
		unknown.detail = { ...detailOf(error), requestId };
		throw unknown;
	}
}

type Found = StudioResult & { status: "done" | "unknown" };
async function lookup(
	{ client }: Connection,
	request: TrialRequest,
): Promise<Found | null> {
	const found = await client.studioFindMany([request]).catch(rpcError);
	if (!Array.isArray(found)) throw serverError();
	return found[0] ?? null;
}
function usable({ status, ...result }: Found): StudioResult {
	if (status === "done") return result;
	throw new ClientError(
		"UNCONFIRMED",
		6,
		"같은 대본과 설정으로 만든 요청의 처리 여부를 아직 모릅니다. 새로 만들려면 --new를 쓰세요(요금이 다시 나올 수 있습니다).",
		{ resultId: result.id },
	);
}

export async function generate(options: GenerateOptions) {
	const { json, out = "", overwrite, fresh, dryRun } = options;
	checkOut(out, overwrite);
	const text = normalizeText(await readInput(options.input ?? ""));
	if (!text) throw new ClientError("INPUT", 2, "대본이 비어 있습니다.");
	const connection = await connect(options.url);
	const { origin, client, userId } = connection;
	const { voice, request } = await pick(connection, options, text);
	const max = studioTextMax(request.provider);
	if (codePoints(text) > max)
		throw new ClientError(
			"INPUT",
			2,
			`대본은 ${max}자까지 보낼 수 있습니다(지금 ${codePoints(text)}자).`,
		);
	checkExtension(
		out,
		request.provider === "gemini" ? MIME[".wav"] : MIME[".mp3"],
	);
	const finish = async (source: Output["source"], result: StudioResult) =>
		show(json, {
			origin,
			source,
			...(await download(connection, result, out, overwrite)),
		});

	const record = fresh
		? undefined
		: await recordOf(fingerprint(origin, userId, request));
	if (record && !dryRun)
		return finish("resumed", await recover(connection, record.requestId));
	const found = fresh ? null : await lookup(connection, request);
	if (found && !dryRun) return finish("saved", usable(found));

	let rate: number | null = null;
	if (request.provider === "elevenlabs") {
		const models = await client.trialModels().catch(() => null);
		rate =
			models?.rates.find(({ model }) => model === request.settings.model)
				?.multiplier ?? null;
	}
	const rateKnown = request.provider !== "elevenlabs" || rate !== null;
	const usage = estimate(request, rate);
	const lines = summary(voice, request, usage, rateKnown);
	if (dryRun) {
		const { provider, voiceId } = request;
		return print(
			json,
			{
				origin,
				dryRun: true,
				request: {
					provider,
					voiceId,
					model: request.settings.model,
					characters: codePoints(text),
				},
				saved: found,
				requestId: record?.requestId ?? null,
				estimate: usage,
				rateKnown,
				needsConfirm: needsConfirm(request),
			},
			[
				...lines,
				found
					? found.status === "done"
						? `저장된 결과 ${clean(found.id)} (다시 만들지 않고 받습니다)`
						: "같은 요청의 처리 여부를 모릅니다(--new가 필요합니다)"
					: "저장된 결과 없음",
				...(record ? [`확인할 요청 ID ${clean(record.requestId)}`] : []),
			].join("\n"),
		);
	}
	if (needsConfirm(request)) await confirm(lines, options);
	const { source, result } = await create(connection, request, fresh);
	await finish(source, result);
}

export async function downloadResult(id: string, options: StudioOptions) {
	const { json, out = "", overwrite } = options;
	checkOut(out, overwrite);
	const connection = await connect(options.url);
	show(json, {
		origin: connection.origin,
		source: "saved",
		...(await download(connection, { id }, out, overwrite)),
	});
}

export async function resume(
	requestId: string | undefined,
	options: StudioOptions,
) {
	const { json, out, overwrite } = options;
	if (requestId === undefined) {
		const origin = await currentOrigin(options.url);
		const requests = (await recordsOf(origin)).map(
			({ requestId, provider, createdAt }) => ({
				requestId,
				provider,
				createdAt,
			}),
		);
		return print(
			json,
			{ origin, requests },
			requests.length
				? `요청 ID\t공급자\t요청 시각\n${requests.map((item) => [item.requestId, item.provider, item.createdAt].map(clean).join("\t")).join("\n")}`
				: "확인할 요청이 없습니다.",
		);
	}
	if (out !== undefined) checkOut(out, overwrite);
	const connection = await connect(options.url);
	const result = await recover(connection, requestId);
	show(json, {
		origin: connection.origin,
		source: "resumed",
		...(out === undefined
			? { result, out: null, mime: null }
			: await download(connection, result, out, overwrite)),
	});
}

export async function presets(options: Pick<StudioOptions, "url" | "json">) {
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
							extensionOf(
								item.provider === "gemini" ? MIME[".wav"] : MIME[".mp3"],
							),
						]
							.map(clean)
							.join("\t"),
					)
					.join("\n")}`
			: "프리셋이 없습니다.",
	);
}
