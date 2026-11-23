import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { wavHeader } from "@tts-pilot-app/api/drama-script";
import {
	CLONE_LIMITS,
	CLONE_PROVIDERS,
	CLONE_SAMPLE_RATE,
	type CloneProvider,
	cloneLengthProblem,
	GEMINI_CONSENT_SENTENCE,
	MY_VOICE_NAME_MAX,
	type MyVoice,
	type MyVoiceStatus,
	myVoiceListSchema,
	myVoiceNameSchema,
	myVoiceSchema,
} from "@tts-pilot-app/api/my-voice-contract";
import { isSilent } from "@tts-pilot-app/api/sound-join";
import { readCloneWav } from "@tts-pilot-app/api/wav";
import type { Args } from "./cli.js";
import {
	ClientError,
	type CloneFailure,
	type Connection,
	connect,
	detailOf,
	type ErrorDetail,
	input,
	manageError,
	REASON_TEXT,
	reasonOf,
	serverError,
} from "./client.js";
import { MIME, readBytes } from "./files.js";
import { wavChunks } from "./join.js";
import { found, idOf, lines, yesNo } from "./manage.js";
import {
	byteText,
	clean,
	confirmRemoval,
	note,
	print,
	table,
} from "./output.js";
import {
	checkKind,
	type Kind,
	mutate,
	onInterrupt,
	recover,
	runRequest,
	type StatusRow,
	showRecords,
} from "./paid.js";
import { fingerprintOf } from "./requests.js";
import { refOf } from "./voices.js";

// 서버가 받는 파일 상한(packages/api my-voice-contract.ts SOURCE_BYTES_MAX·CONSENT_BYTES_MAX)
const SOURCE_MAX = 3_000_000;
const CONSENT_MAX = 1_000_000;
const LABEL: Record<CloneProvider, string> = {
	fish_audio: "Fish Audio",
	gemini: "Gemini",
};
const STATUS: Record<MyVoiceStatus, string> = {
	sending: "보내는 중",
	processing: "처리 중",
	ready: "사용 가능",
	failed: "실패",
	unknown: "처리 여부 미확인",
	deleting: "삭제 대기",
};

// ── 실패 글(웹 my-voice-text와 같은 뜻) ──
const unknownText = (provider: CloneProvider) =>
	`공급자에 만들어졌을 수 있습니다. ${LABEL[provider]} 웹에서 확인하고 필요하면 지워 주세요.`;
const NO_PLAN =
	"이 계정은 클론을 만들 수 없습니다. 공급자 요금제를 확인해 주세요.";
type Reason = NonNullable<ErrorDetail["reason"]>;
const FAILURE: Partial<Record<Reason, (provider: CloneProvider) => string>> = {
	quota: () => NO_PLAN,
	no_permission: () => NO_PLAN,
	provider_auth: () =>
		"공급자가 이 계정의 클론 요청을 거절했습니다. 연결 상태와 공급자 요금제·잔액을 확인해 주세요.",
	in_progress: () =>
		"다른 내 보이스를 만드는 중입니다. 끝난 뒤 다시 실행해 주세요.",
	quality: () =>
		"녹음 품질 검사를 통과하지 못했습니다. 조용한 곳에서 다시 녹음해 주세요.",
	provider_input: () =>
		"공급자가 이 원본을 받지 않았습니다. 원본과 동의 녹음을 확인해 주세요.",
	provider_error: (provider) =>
		`공급자가 오류를 돌려줬습니다. ${unknownText(provider)}`,
	not_found: () => "공급자에서 클론을 찾지 못했습니다.",
	audio_format: () => "원본이나 동의 녹음의 형식이 맞지 않습니다.",
	audio_length: () => "원본 길이나 동의 녹음 길이가 범위 밖입니다.",
	consent_audio_missing: () => "동의 녹음이 없습니다.",
};
// 입력을 고치면 되는 사유(2)
const INPUT_REASONS: readonly unknown[] = [
	"audio_format",
	"audio_length",
	"consent_audio_missing",
] satisfies CloneFailure[];
const knownReason = (value: unknown): Reason | undefined =>
	typeof value === "string" && Object.hasOwn(FAILURE, value)
		? (value as Reason)
		: reasonOf(value);
function reasonText(provider: CloneProvider, raw: string | null): string {
	const reason = knownReason(raw);
	const common = reasonOf(raw);
	return (
		(reason && FAILURE[reason]?.(provider)) ??
		(common && REASON_TEXT[common]) ??
		"클론을 만들지 못했습니다."
	);
}
// 실패한 줄의 오류. 줄은 남아 있으므로 치우는 명령을 알린다
function failedRow(
	{ id, provider, reason: raw }: MyVoice,
	detail: ErrorDetail = {},
) {
	const reason = knownReason(raw);
	return new ClientError(
		"CREATE_FAILED",
		5,
		`${reasonText(provider, raw)} clones remove로 목록에서 치울 수 있습니다.`,
		{ ...(reason ? { reason } : {}), ...detail, cloneId: id },
	);
}

// ── 입력 검사 ──
// bytes는 보낼 바이트다. 읽은 파일의 소리만 새 머리로 싼 것이라 부가 정보가 나가지 않는다
type Audio = { bytes: Buffer; seconds: number };
function readAudio(
	provider: CloneProvider,
	what: "원본" | "동의 녹음",
	path: string,
): Audio {
	const source = what === "원본";
	const out = source ? "원본.wav" : "동의.wav";
	const convert = `바꾸는 명령: ffmpeg -i 녹음파일 -ac 1 -ar 24000 -c:a pcm_s16le ${out} 또는 afconvert -f WAVE -d LEI16@24000 -c 1 녹음파일 ${out}`;
	const file = readBytes(
		path,
		source ? SOURCE_MAX : CONSENT_MAX,
		what,
		convert,
	);
	const pcm = pcmOf(file);
	// 머리 44바이트는 WAV의 가장 짧은 머리라 읽은 파일(상한 안)보다 커지지 않는다
	const bytes =
		pcm && Buffer.concat([wavHeader(pcm.length, CLONE_SAMPLE_RATE), pcm]);
	const seconds = bytes && readCloneWav(bytes);
	if (!pcm || !bytes || seconds === null)
		throw input(`${what}은 24kHz 모노 16비트 PCM WAV여야 합니다. ${convert}`);
	const problem = source
		? cloneLengthProblem(provider, "source", seconds)
		: cloneLengthProblem("gemini", "consent", seconds);
	if (problem) {
		const { min, max } = source
			? CLONE_LIMITS[provider].source
			: CLONE_LIMITS.gemini.consent;
		// 9.99초가 10초로 읽히지 않게 짧으면 내리고 길면 올린다
		throw input(
			problem === "short"
				? `${what}이 너무 짧습니다. ${min}~${max}초가 필요합니다(지금 ${Math.floor(seconds)}초).`
				: `${what}이 너무 깁니다. ${min}~${max}초가 필요합니다(지금 ${Math.ceil(seconds)}초).`,
		);
	}
	const samples = Float32Array.from(
		{ length: pcm.length / 2 },
		(_, i) => pcm.readInt16LE(i * 2) / 32768,
	);
	if (isSilent(samples))
		throw input(`${what}에 소리가 거의 없습니다. 다시 녹음해 주세요.`);
	return { bytes, seconds };
}
// 확장형 fmt(0xFFFE)의 하위 형식이 PCM인 GUID
const PCM_GUID = Buffer.from("0100000000001000800000aa00389b71", "hex");
// 24kHz 모노 16비트 PCM 파일의 소리. afconvert는 모노 m4a를 확장형 머리로 쓴다. 그 밖의 파일은 null이다
function pcmOf(file: Buffer): Buffer | null {
	let chunks: ReturnType<typeof wavChunks>;
	try {
		chunks = wavChunks(file);
	} catch {
		return null;
	}
	const fmt = chunks.get("fmt ");
	const data = chunks.get("data");
	if (
		!fmt ||
		!data ||
		fmt.size < 16 ||
		fmt.at > data.at ||
		data.at + data.size > file.length
	)
		return null;
	const u16 = (at: number) => file.readUInt16LE(fmt.at + at);
	const isPcm =
		u16(0) === 1 ||
		(u16(0) === 0xfffe &&
			fmt.size >= 40 &&
			u16(18) === 16 &&
			PCM_GUID.equals(file.subarray(fmt.at + 24, fmt.at + 40)));
	if (
		!isPcm ||
		u16(2) !== 1 ||
		file.readUInt32LE(fmt.at + 4) !== CLONE_SAMPLE_RATE ||
		u16(12) !== 2 ||
		u16(14) !== 16
	)
		return null;
	return file.subarray(data.at, data.at + data.size - (data.size % 2));
}

type Request = {
	provider: CloneProvider;
	name: string;
	source: Audio;
	consent: Audio | null;
};
function requestOf({ text }: Args): Request {
	const provider = CLONE_PROVIDERS.find((id) => id === text("provider"));
	if (!provider)
		throw input(`--provider는 ${CLONE_PROVIDERS.join("나 ")}여야 합니다.`);
	const name = myVoiceNameSchema.safeParse(text("name"));
	if (!name.success) throw input(`이름은 1~${MY_VOICE_NAME_MAX}자여야 합니다.`);
	const consent = text("consent-audio");
	if (provider === "gemini" && consent === undefined)
		throw input(
			`Gemini는 --consent-audio가 필요합니다. 이 문장을 그대로 읽어 녹음해 주세요: ${GEMINI_CONSENT_SENTENCE}`,
		);
	if (provider === "fish_audio" && consent !== undefined)
		throw input("Fish Audio에는 --consent-audio를 쓰지 않습니다.");
	return {
		provider,
		name: name.data,
		source: readAudio(provider, "원본", text("source") ?? ""),
		consent:
			consent === undefined ? null : readAudio(provider, "동의 녹음", consent),
	};
}
const audioText = ({ bytes, seconds }: Audio) =>
	`${Math.floor(seconds * 10) / 10}초, ${byteText(bytes.length)}`;
// 보내기 전 고지와 동의 문장(웹 만들기 창의 마지막 단계와 같은 내용)
const noticeOf = ({ provider, name, source, consent }: Request) =>
	[
		`이름 ${name}`,
		`보낼 것 원본 ${audioText(source)}${consent ? ` / 동의 녹음 ${audioText(consent)}` : ""}`,
		`가는 곳 ${LABEL[provider]} 계정에 클론을 만듭니다.`,
		"보관 공급자도 원본을 보관할 수 있습니다. 작업실에는 남기지 않습니다.",
		`되돌리기 clones remove로 지우면 ${LABEL[provider]} 계정에서도 지워집니다.`,
		"요금 공급자 문서에 클론 요금 정보가 없습니다.",
		`동의 제 목소리이고, ${LABEL[provider]}에 보내 클론을 만드는 데 동의합니다`,
		...(provider === "gemini"
			? [`동의 녹음에서 읽을 문장 ${GEMINI_CONSENT_SENTENCE}`]
			: []),
	].map(clean);

// ── 조회 ──
async function listOf({ client }: Connection) {
	const result = myVoiceListSchema.safeParse(
		await client.myVoiceList().catch(manageError),
	);
	if (!result.success) throw serverError();
	return result.data;
}
function cloneOf(value: unknown): MyVoice {
	const result = myVoiceSchema.safeParse(value);
	if (!result.success) throw serverError();
	return result.data;
}
// 줄의 사유와 다음 동작
function noteOf({ status, reason, provider, savedVoiceId }: MyVoice) {
	switch (status) {
		case "processing":
			return "clones check로 확인해 주세요.";
		case "ready":
			return savedVoiceId ? null : "clones save로 보관함에 담을 수 있습니다.";
		case "failed":
			return `${reasonText(provider, reason)} clones remove로 치울 수 있습니다.`;
		case "unknown":
			return `${unknownText(provider)} 확인한 뒤 clones remove로 치워 주세요.`;
		case "deleting":
			return "공급자에서 아직 지워지지 않았습니다. clones remove를 다시 실행해 주세요.";
		default:
			return null;
	}
}
const viewOf = (clone: MyVoice) => ({
	...clone,
	ref: clone.voice && refOf(clone.voice),
	note: noteOf(clone),
});
function printClone(
	json: boolean,
	facts: { origin: string; source?: string },
	clone: MyVoice,
) {
	const view = viewOf(clone);
	print(
		json,
		{ ...facts, clone: view },
		lines([
			["이름", view.name],
			["클론 ID", view.id],
			["상태", STATUS[view.status]],
			["공급자:성우 ID", view.ref ?? "없음"],
			["안내", view.note ?? "없음"],
		]),
	);
}
// 공급자에 만들어졌을 수 있는 줄. id를 읽지 못한 응답이나 5xx로 끝난 실패도 그렇다
const maybeMade = ({ status, reason }: MyVoice) =>
	status === "sending" ||
	status === "unknown" ||
	(status === "failed" && reason === "provider_error");

// ── 만들기 ──
type Row = StatusRow & { clone: MyVoice };
function cloneKind(
	json: boolean,
	provider?: CloneProvider,
): Kind<Request, Row> {
	// 응답이나 조회로 받은 줄. 결과를 알릴 때 쓴다
	const known = new Map<string, MyVoice>();
	const know = (value: unknown) => {
		const clone = cloneOf(value);
		known.set(clone.id, clone);
		return clone;
	};
	return {
		name: "clones",
		// 같은 이름 검사. 막는 줄이 있으면 던진다(저장 결과로 쓰지 않는다)
		async find(connection, { provider, name }) {
			const same = (await listOf(connection)).items.filter(
				(item) => item.provider === provider && item.name === name,
			);
			const unsure = same.find(maybeMade);
			if (unsure)
				throw new ClientError(
					"UNCONFIRMED",
					6,
					unsure.status === "sending"
						? "같은 이름의 클론을 보내는 중입니다. 끝난 뒤 clones list로 확인해 주세요."
						: `같은 이름의 클론이 공급자에 만들어졌을 수 있습니다. ${LABEL[provider]} 웹에서 확인하고 clones remove로 줄을 치운 뒤 다시 실행해 주세요.`,
					{ cloneId: unsure.id },
				);
			const made = same.find(
				({ status }) => status === "ready" || status === "processing",
			);
			if (made)
				throw new ClientError(
					"CONFLICT",
					2,
					"같은 이름의 클론이 이미 있습니다. 다른 이름을 쓰거나, 새로 만들려면 --new를 쓰세요.",
					{ cloneId: made.id },
				);
			return null;
		},
		async create({ client }, { requestId, request }) {
			const { provider, name, source, consent } = request;
			const file = ({ bytes }: Audio, title: string) =>
				new File([new Uint8Array(bytes)], title, { type: MIME[".wav"] });
			const clone = know(
				await client.myVoiceCreate({
					requestId,
					provider,
					name,
					consent: true,
					source: file(source, "source.wav"),
					...(consent ? { consentAudio: file(consent, "consent.wav") } : {}),
				}),
			);
			if (!["ready", "processing", "failed"].includes(clone.status))
				throw new Error("결과가 아닌 상태");
			return clone;
		},
		async status({ client }, requestId) {
			const value = await client.myVoiceRequest({ requestId });
			if (value === null) return null;
			const clone = know(value);
			const { id, status, reason } = clone;
			const done = status === "ready" || status === "processing";
			return { id, status: done ? "done" : status, reason, clone };
		},
		// 서버는 상태를 저장한 뒤에만 응답한다
		settle: async () => true,
		async finish({ origin }, source, id) {
			const clone = known.get(id);
			if (!clone) throw serverError();
			if (clone.status === "failed") throw failedRow(clone);
			printClone(json, { origin, source }, clone);
		},
		failure(raw, detail, row) {
			if (row) return failedRow(row.clone, detail);
			const reason = knownReason(raw);
			const text = reason && provider && FAILURE[reason]?.(provider);
			if (!text) return undefined;
			return INPUT_REASONS.includes(reason)
				? new ClientError("INPUT", 2, text, { ...detail, reason })
				: new ClientError("SERVER_ERROR", 5, text, { ...detail, reason });
		},
	};
}

const sha256 = ({ bytes }: Audio) =>
	createHash("sha256").update(bytes).digest("hex");
const sizeOf = ({ bytes, seconds }: Audio) => ({
	bytes: bytes.length,
	seconds,
});
export async function clonesCreate(args: Args) {
	const { json, url, flag } = args;
	const request = requestOf(args);
	const { provider, name, source, consent } = request;
	const notice = noticeOf(request);
	if (!flag("consent")) {
		for (const line of notice) note(line);
		throw new ClientError(
			"CONSENT_REQUIRED",
			2,
			"본인 목소리 동의가 필요합니다. 위 내용에 동의하면 --consent를 붙여 실행하세요.",
		);
	}
	const connection = await connect(url);
	const { origin, userId } = connection;
	const signature = [
		provider,
		name,
		sha256(source),
		consent && sha256(consent),
	];
	await runRequest(
		cloneKind(json, provider),
		connection,
		{
			key: fingerprintOf(origin, userId, JSON.stringify(signature), "clones"),
			provider,
			request,
		},
		{ json, yes: flag("yes"), fresh: flag("new"), dryRun: flag("dry-run") },
		async () => {
			const { providers } = await listOf(connection);
			if (!providers[provider])
				throw serverError(REASON_TEXT.no_key, { reason: "no_key" });
			return {
				lines: notice,
				request: {
					provider,
					source: sizeOf(source),
					consentAudio: consent && sizeOf(consent),
				},
				// 요금 정보가 없고 공급자 계정에 남는다. 언제나 확인한다
				needsConfirm: true,
			};
		},
	);
}

export async function clonesResume(requestId: string | undefined, args: Args) {
	const { json, url } = args;
	if (requestId === undefined) return showRecords("clones", url, json);
	await checkKind("clones", url, requestId);
	const connection = await connect(url);
	const kind = cloneKind(json);
	const { id } = await recover(kind, connection, requestId);
	await kind.finish(connection, "resumed", id);
}

// ── 관리 ──
export async function clonesList({ json, url }: Args) {
	const connection = await connect(url);
	const { items, providers } = await listOf(connection);
	const clones = items.map(viewOf);
	const names = (open: boolean) =>
		CLONE_PROVIDERS.filter((id) => providers[id] === open)
			.map((id) => LABEL[id])
			.join(", ") || "없음";
	print(
		json,
		{ origin: connection.origin, providers, clones },
		[
			clones.length
				? table(
						[
							...["이름", "ID", "공급자", "상태", "사유와 다음 동작"],
							...["공급자:성우 ID", "보관함", "프리셋", "만든 때"],
						],
						clones.map((item) => [
							item.name,
							item.id,
							LABEL[item.provider],
							STATUS[item.status],
							item.note ?? "",
							item.ref ?? "",
							yesNo(item.savedVoiceId !== null),
							item.presets.join(", "),
							item.createdAt,
						]),
					)
				: "만든 클론이 없습니다.",
			`만들 수 있음: ${names(true)}`,
			`연결 안 됨: ${names(false)}`,
		].join("\n"),
	);
}

export async function clonesCheck(args: Args) {
	const id = idOf(args);
	const { origin, client } = await connect(args.url);
	const clone = cloneOf(await mutate(client.myVoiceCheck({ id })));
	if (clone.status === "failed") throw failedRow(clone);
	printClone(args.json, { origin }, clone);
}

export async function clonesSave(args: Args) {
	const id = idOf(args);
	const { origin, client } = await connect(args.url);
	const clone = cloneOf(await mutate(client.myVoiceSave({ id })));
	printClone(args.json, { origin }, clone);
}

const removalLines = (clone: MyVoice) => {
	const { id, name, provider, status, presets } = clone;
	const label = LABEL[provider];
	return [
		`${name}(${label}, ${id}) 클론을 지웁니다.`,
		maybeMade(clone)
			? `작업실의 줄만 지워지고 공급자 쪽에 남았을 수 있습니다. ${label} 웹에서 확인하고 필요하면 지워 주세요. 되돌릴 수 없습니다.`
			: status === "failed"
				? `${label} 계정에 남은 것이 있으면 함께 지워지고 되돌릴 수 없습니다.`
				: `${label} 계정에서도 지워지고 되돌릴 수 없습니다.`,
		...(presets.length
			? [
					`이 성우를 쓰는 프리셋 ${presets.length}개(${presets.join(", ")})는 성우를 다시 골라야 합니다.`,
				]
			: []),
		"이미 만든 음성 결과는 그대로 남습니다.",
	];
};
const stillSending = (cloneId: string) =>
	new ClientError(
		"CONFLICT",
		2,
		"보내는 중인 클론은 지울 수 없습니다. 끝난 뒤 다시 실행해 주세요.",
		{ reason: "in_progress", cloneId },
	);
const removeUnsure = (cloneId: string, detail: ErrorDetail = {}) =>
	new ClientError(
		"UNCONFIRMED",
		6,
		"지워졌는지 확인하지 못했습니다. clones list로 확인해 주세요.",
		{ ...detail, cloneId },
	);
// 지우기 실패. 줄의 실제 상태를 한 번 읽어 알린다
async function removeError(
	connection: Connection,
	id: string,
	error: unknown,
): Promise<ClientError> {
	const detail = detailOf(error);
	if (
		error instanceof ORPCError &&
		error.code === "CONFLICT" &&
		detail.reason === "in_progress"
	)
		return stillSending(id);
	// 응답을 읽지 못했거나 사유 없는 5xx면 지워졌는지 모른다
	const unsure =
		!(error instanceof ORPCError) ||
		detail.reason === "unknown_outcome" ||
		(!detail.reason && error.status >= 500);
	let failure = removeUnsure(id, detail);
	if (!unsure)
		try {
			manageError(error, { cloneId: id });
		} catch (known) {
			failure = known as ClientError;
			// 공통 글은 대본·설정 이야기다
			if (detail.reason === "provider_input")
				failure.message = "공급자가 지우기 요청을 받지 않았습니다.";
		}
	const list = await listOf(connection).catch(() => null);
	if (!list) return failure;
	const row = list.items.find((item) => item.id === id);
	failure.message += !row
		? " 지금 목록에 없습니다."
		: row.status === "deleting"
			? " 지금 삭제 대기입니다. 같은 명령으로 다시 시도해 주세요."
			: ` 줄은 그대로입니다(${STATUS[row.status]}).`;
	return failure;
}
export async function clonesRemove(args: Args) {
	const { json, url, flag } = args;
	const id = idOf(args);
	const connection = await connect(url);
	const { items } = await listOf(connection);
	const clone = found(items.find((item) => item.id === id));
	if (clone.status === "sending") throw stillSending(id);
	await confirmRemoval(removalLines(clone), flag("yes"));
	onInterrupt(() => removeUnsure(id));
	try {
		const { deleted } = await connection.client.myVoiceDelete({ id });
		if (deleted !== true) throw new Error("결과가 아닌 응답");
	} catch (error) {
		throw await removeError(connection, id, error);
	}
	print(
		json,
		{ origin: connection.origin, removed: id },
		`지웠습니다. ${clean(clone.name)}`,
	);
}
