import { readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
	ACTING,
	type ActingFamily,
	applyLine,
	type Feel,
} from "@tts-pilot-app/api/drama-acting";
import {
	type AutoTagSent,
	autoTagApply,
	autoTagChanges,
	autoTagInput,
} from "@tts-pilot-app/api/drama-autotag";
import {
	dramaAutoTagInputSchema,
	dramaAutoTagOutputSchema,
	dramaFoundSchema,
	dramaRequestSchema,
} from "@tts-pilot-app/api/drama-contract";
import {
	actingOf,
	allFish,
	type DraftLine,
	type DraftSpeaker,
	defaultSpeakerName,
	newSpeaker,
	parsePaste,
	readRequests,
	requestOf,
	speakerValue,
	splitOk,
	usableSpeakers,
	usableVoice,
	voiceOfSpeaker,
} from "@tts-pilot-app/api/drama-request";
import {
	cutWav,
	DRAMA_LINES_MAX,
	DRAMA_MODELS,
	DRAMA_NAME_MAX,
	DRAMA_SETTINGS,
	DRAMA_SPEAKERS_MAX,
	type DramaModel,
	type DramaRequest,
	type DramaSettings,
	dramaUsage,
	sceneChars,
	sceneLimit,
	sceneText,
} from "@tts-pilot-app/api/drama-script";
import type { Found, MakeItem } from "@tts-pilot-app/api/make-plan";
import { pressedEmotion } from "@tts-pilot-app/api/paragraph-autotag";
import { safeName } from "@tts-pilot-app/api/paragraph-files";
import type { Preset, PresetValue } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { feelSchema } from "@tts-pilot-app/api/providers/trial-contract";
import {
	codePoints,
	comboSignature,
	DEFAULT_SETTINGS,
	freeModelOpen,
	normalizeText,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	type TrialRequest,
	requestOf as trialRequestOf,
	utf8Bytes,
} from "@tts-pilot-app/api/providers/trial-options";
import { GAP_DEFAULT, GAP_MAX, gapOf } from "@tts-pilot-app/api/sound-join";
import type { StudioResult } from "@tts-pilot-app/api/studio-contract";
import {
	CALLS_PER_BATCH,
	callsLine,
	failure,
	tagUnconfirmed,
} from "./autotag.js";
import {
	type Done,
	doneRows,
	doneTable,
	fileName,
	type Job,
	type Label,
	modeOf,
	openFolder,
	refuseUnconfirmed,
	runJobs,
	usageLines,
	usageOf,
} from "./batch.js";
import type { Args } from "./cli.js";
import {
	ClientError,
	type Connection,
	connect,
	input,
	manageError,
	rpcError,
	serverError,
} from "./client.js";
import {
	checkFolder,
	checkOut,
	fileSize,
	MIME,
	readInput,
	readJson,
	save,
	saveBytes,
} from "./files.js";
import { decoderOf, joinSounds, saveJoined } from "./join.js";
import {
	byteText,
	clean,
	confirmRemoval,
	note,
	print,
	table,
	usageText,
} from "./output.js";
import {
	checkKind,
	confirm,
	create,
	downloadStopped,
	type Kind,
	mutate,
	onInterrupt,
	recover,
	releaseOrWarn,
	resultOf,
	runRequest,
	show,
	showRecords,
	unconfirmed,
} from "./paid.js";
import { fingerprint, fingerprintOf, recordsFor } from "./requests.js";
import { downloadFailed, mimeOf } from "./studio.js";
import { download, trialKind } from "./trial.js";
import { parseRef } from "./voices.js";
import { type Check, judge, onlyOf, onlyText } from "./work.js";

type Speaker = { name: string; voice?: string; presetId?: string };
type Line = Omit<DraftLine, "id">;
// 장면·읽기 파일의 정리된 값. 빠진 칸은 없는 채로 둔다
export type Scene = {
	version: 1;
	sceneName?: string;
	// 줄 뒤 쉼의 장면 기본(초). 잇는 데만 쓴다
	gap?: number;
	speakers: Speaker[];
	lines: Line[];
	model?: DramaModel;
	settings?: Partial<DramaSettings>;
};

type Raw = Record<string, unknown>;
const objectOf = (value: unknown): Raw | null =>
	value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Raw)
		: null;
const unknownKeys = (value: Raw, allowed: readonly string[]) =>
	Object.keys(value).filter((key) => !allowed.includes(key));
const isModel = (value: unknown): value is DramaModel =>
	DRAMA_MODELS.some((model) => model === value);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 쉼은 0~5초, 0.1초 단위의 수다. 맞추지 않고 거절한다
const isGap = (value: unknown): value is number | undefined =>
	value === undefined || (typeof value === "number" && gapOf(value) === value);
// 줄 뒤의 쉼: 줄 → 장면 → 기본(웹과 같다)
const gapAfter = (scene: Scene | undefined, n: number) =>
	scene?.lines[n - 1]?.gap ?? scene?.gap ?? GAP_DEFAULT;

type Bad = { n: number; reason: string };
// 잘못된 줄을 모두 알린다
const badLines = (bad: readonly Bad[]) => {
	const lines = bad.toSorted((a, b) => a.n - b.n);
	return new ClientError(
		"INPUT",
		2,
		`장면을 확인해 주세요: ${lines.map(({ n, reason }) => `줄 ${n}(${reason})`).join(", ")}`,
		{ lines },
	);
};
const FIELD_TEXT = { direction: "지시", text: "대사", feel: "감정" };

function speakerOf(value: unknown, n: number): Speaker {
	const raw = objectOf(value);
	const fail = (what: string) => input(`화자 ${n}의 ${what}을 확인해 주세요.`);
	if (!raw) throw fail("모양");
	const { name, voice, presetId } = raw;
	const unknown = unknownKeys(raw, ["name", "voice", "presetId"]);
	if (unknown.length) throw fail(`모르는 칸(${unknown.join(", ")})`);
	const clean = typeof name === "string" ? normalizeText(name) : "";
	if (!clean || codePoints(clean) > DRAMA_NAME_MAX) throw fail("이름");
	if (voice !== undefined && typeof voice !== "string") throw fail("성우");
	if (
		presetId !== undefined &&
		(typeof presetId !== "string" || !UUID.test(presetId))
	)
		throw fail("프리셋 ID");
	return {
		name: clean,
		...(voice === undefined ? {} : { voice }),
		...(presetId === undefined ? {} : { presetId: presetId.toLowerCase() }),
	};
}
function lineOf(value: unknown, speakers: number): Line | string {
	const raw = objectOf(value);
	if (!raw) return "모양";
	const { speaker, direction = "", text, feel, gap } = raw;
	const unknown = unknownKeys(raw, [
		...["speaker", "direction", "text", "feel", "gap"],
	]);
	if (unknown.length) return `모르는 칸 ${unknown.join(", ")}`;
	if (
		typeof speaker !== "number" ||
		!Number.isInteger(speaker) ||
		speaker < 0 ||
		speaker >= speakers
	)
		return "화자 번호";
	if (typeof direction !== "string") return "지시";
	if (typeof text !== "string") return "대사";
	const parsed = feelSchema.optional().safeParse(feel);
	if (!parsed.success) return "감정";
	if (!isGap(gap)) return "쉼";
	return {
		speaker,
		direction,
		text,
		...(parsed.data ? { feel: parsed.data } : {}),
		...(gap === undefined ? {} : { gap }),
	};
}
// 모양이 틀린 줄(bad)은 빈 줄로 자리만 두고, 쓰는 명령이 글의 오류와 함께 알린다
type Read = { scene: Scene; bad: Bad[] };
// 장면 JSON의 모양. 글의 길이와 성우는 쓰는 명령이 본다
function sceneOf(value: unknown): Read {
	const raw = objectOf(value);
	if (raw?.version !== 1)
		throw input("장면 파일은 version이 1인 JSON 객체여야 합니다.");
	const { sceneName, gap, speakers, lines, model, settings } = raw;
	const unknown = unknownKeys(raw, [
		...["version", "sceneName", "gap", "speakers", "lines", "model"],
		"settings",
	]);
	if (unknown.length)
		throw input(`장면 파일에 모르는 칸이 있습니다: ${unknown.join(", ")}`);
	if (sceneName !== undefined && typeof sceneName !== "string")
		throw input("sceneName을 확인해 주세요.");
	if (!isGap(gap))
		throw input(`gap은 0~${GAP_MAX}초, 0.1초 단위의 수여야 합니다.`);
	if (model !== undefined && !isModel(model))
		throw input(`model은 ${DRAMA_MODELS.join(", ")} 중 하나여야 합니다.`);
	const given = settings === undefined ? {} : objectOf(settings);
	if (!given || unknownKeys(given, ["speed", "temperature"]).length)
		throw input("settings를 확인해 주세요.");
	if (
		!Array.isArray(speakers) ||
		speakers.length < 1 ||
		speakers.length > DRAMA_SPEAKERS_MAX
	)
		throw input(`화자는 1~${DRAMA_SPEAKERS_MAX}명이어야 합니다.`);
	const who = speakers.map((item, i) => speakerOf(item, i + 1));
	if (new Set(who.map(({ name }) => name)).size !== who.length)
		throw input("화자 이름이 겹칩니다.");
	if (
		!Array.isArray(lines) ||
		lines.length < 1 ||
		lines.length > DRAMA_LINES_MAX
	)
		throw input(`줄은 1~${DRAMA_LINES_MAX}개여야 합니다.`);
	const bad: Bad[] = [];
	const said = lines.map((item, i): Line => {
		const line = lineOf(item, who.length);
		if (typeof line !== "string") return line;
		bad.push({ n: i + 1, reason: line });
		return { speaker: 0, direction: "", text: "" };
	});
	const scene: Scene = {
		version: 1,
		...(sceneName === undefined ? {} : { sceneName }),
		...(gap === undefined ? {} : { gap }),
		speakers: who,
		lines: said,
		...(model === undefined ? {} : { model }),
		...(settings === undefined
			? {}
			: { settings: given as Partial<DramaSettings> }),
	};
	return { scene, bad };
}

const PASTE_TEXT = {
	too_many_speakers: `화자는 ${DRAMA_SPEAKERS_MAX}명까지입니다.`,
	too_many_lines: `줄은 ${DRAMA_LINES_MAX}개까지입니다.`,
	empty: "대본이 비어 있습니다.",
};
// .json은 장면, .txt는 '이름: 대사' 줄(웹 붙여 넣기 규칙)
async function readScene(path: string): Promise<Scene> {
	const { scene, bad } = await readShape(path);
	// 서버 계약이 거절할 글을 모양 오류와 함께 모두 알린다
	const wrong = new Set(bad.map(({ n }) => n));
	scene.lines.forEach((line, i) => {
		if (wrong.has(i + 1)) return;
		const result = dramaRequestSchema.shape.lines.element.safeParse(line);
		const field = result.error?.issues[0]?.path[0];
		if (field === "text" || field === "direction")
			bad.push({ n: i + 1, reason: FIELD_TEXT[field] });
	});
	if (bad.length) throw badLines(bad);
	return scene;
}
async function readShape(path: string): Promise<Read> {
	const kind = extname(path).toLowerCase();
	if (kind === ".json") return sceneOf(await readJson(path));
	if (kind !== ".txt")
		throw input("--input은 .json이나 .txt 파일이어야 합니다.");
	const pasted = parsePaste(
		await readInput(path),
		[newSpeaker(defaultSpeakerName(1))],
		() => "",
	);
	if ("error" in pasted) throw input(PASTE_TEXT[pasted.error]);
	const scene: Scene = {
		version: 1,
		speakers: pasted.speakers.map(({ name }) => ({ name })),
		lines: pasted.lines.map(({ speaker, direction, text }) => ({
			speaker,
			direction,
			text,
		})),
	};
	return { scene, bad: [] };
}
// --voice 이름=REF. 이름에 =이 있어도 되게 마지막 =에서 나눈다
function giveVoices(scene: Scene, given: readonly string[]): Scene {
	const voices = new Map(
		given.map((item) => {
			const at = item.lastIndexOf("=");
			const name = normalizeText(item.slice(0, Math.max(at, 0)));
			if (!scene.speakers.some((speaker) => speaker.name === name))
				throw input("--voice는 장면의 화자 이름=공급자:성우 ID여야 합니다.");
			return [name, item.slice(at + 1)] as const;
		}),
	);
	return {
		...scene,
		speakers: scene.speakers.map((speaker) => {
			const voice = voices.get(speaker.name);
			return voice === undefined ? speaker : { ...speaker, voice };
		}),
	};
}
// 화자의 성우 REF. 틀리면 화자 이름과 함께 알린다
function refOf({ name, voice }: Speaker) {
	if (voice === undefined) return null;
	try {
		return parseRef(voice);
	} catch {
		throw input(`화자 ${name}의 성우는 공급자:성우 ID여야 합니다.`);
	}
}

// 줄을 본 장면의 요청. 화자 성우와 장면 전체를 서버 계약으로 본다
function checkedRequest(scene: Scene, model: DramaModel): DramaRequest {
	const used = new Set(scene.lines.map(({ speaker }) => speaker));
	const speakers = scene.speakers.map((speaker, i): DraftSpeaker => {
		const blank = newSpeaker(speaker.name);
		if (!used.has(i)) return blank;
		const ref = refOf(speaker);
		if (!ref) throw input(`화자 ${speaker.name}의 성우가 없습니다.`);
		if (ref.provider !== "fish_audio")
			throw input(
				`화자 ${speaker.name}: 장면은 Fish Audio 성우만 씁니다. 다른 공급자는 drama read를 쓰세요.`,
			);
		return { ...blank, voiceId: ref.voiceId };
	});
	const settings = { ...DRAMA_SETTINGS, ...scene.settings };
	const request = requestOf({
		sceneName: scene.sceneName ?? "",
		speakers,
		lines: scene.lines,
		model,
		settings,
	});
	const result = dramaRequestSchema.safeParse(request);
	if (result.success) return result.data;
	const wrong = result.error.issues.map(({ path }) =>
		path.join(".") === "lines"
			? `글자 수 ${sceneChars(scene.lines)}/${sceneLimit(settings.speed)}자`
			: path.join("."),
	);
	throw input(`장면을 확인해 주세요: ${[...new Set(wrong)].join(", ")}`);
}

// 테이크의 WAV 조각. 전체 길이는 서버가 쓴 머리에서 읽고, 조각마다 길이와 형식을 본다
async function takeParts({ client }: Connection, id: string) {
	const first = await client
		.dramaAudio({ id, part: 0 })
		.catch((error: unknown) => rpcError(error, { resultId: id }));
	return (async function* () {
		const bytes = new Uint8Array(await first.arrayBuffer());
		const view = new DataView(bytes.buffer);
		const total = bytes.length >= 44 ? view.getUint32(4, true) + 8 : 0;
		if (
			new TextDecoder("latin1").decode(bytes.subarray(0, 4)) !== "RIFF" ||
			total < 44 ||
			total > STUDIO_AUDIO_MAX
		)
			throw new Error("WAV가 아니다");
		for (let at = 0; at < total; at += STUDIO_PART_BYTES) {
			const file =
				at === 0
					? first
					: await client.dramaAudio({ id, part: at / STUDIO_PART_BYTES });
			if (
				file.size !== Math.min(STUDIO_PART_BYTES, total - at) ||
				file.type !== MIME[".wav"]
			)
				throw new Error("조각 길이나 형식이 다르다");
			yield at === 0 ? bytes : new Uint8Array(await file.arrayBuffer());
		}
	})();
}
async function downloadTake(
	connection: Connection,
	id: string,
	out: string,
	overwrite: boolean,
): Promise<number> {
	onInterrupt(() => downloadStopped("drama", id));
	const parts = await takeParts(connection, id);
	let bytes = 0;
	try {
		await save(
			out,
			overwrite,
			(async function* () {
				for await (const part of parts) {
					bytes += part.byteLength;
					yield part;
				}
			})(),
		);
	} catch (error) {
		throw downloadFailed(error, id, "drama");
	}
	return bytes;
}

const optionsOf = ({ json, url, text, flag }: Args) => ({
	json,
	url,
	out: text("out") ?? "",
	overwrite: flag("overwrite"),
});
// 장면 만들기의 종류. 응답으로 받은 결과 정보를 알릴 때 쓴다
function dramaKind({
	json,
	out,
	overwrite,
}: ReturnType<typeof optionsOf>): Kind<DramaRequest> {
	const known = new Map<string, StudioResult>();
	const know = <T extends StudioResult>(result: T) => {
		const { id, createdAt, usage, bytes } = result;
		known.set(id, { id, createdAt, usage, bytes });
		return result;
	};
	return {
		name: "drama",
		async find({ client }, request) {
			const found = await client.dramaFind(request).catch(manageError);
			const result = dramaFoundSchema.nullable().safeParse(found);
			if (!result.success) throw serverError();
			return result.data && know(result.data);
		},
		async create({ client }, value) {
			const result = await client.dramaCreate(value);
			if (typeof result?.id !== "string") throw new Error("결과가 아닌 응답");
			return know(result);
		},
		async status({ client }, requestId) {
			const row = await client.dramaRequest({ requestId });
			return row && know(row);
		},
		// 서버는 완료를 저장한 뒤에만 응답한다
		settle: async () => true,
		async finish(connection, source, id) {
			const result = known.get(id);
			if (!result) throw serverError();
			await downloadTake(connection, id, out, overwrite);
			show(json, {
				origin: connection.origin,
				source,
				result,
				out: resolve(out),
				mime: MIME[".wav"],
			});
		},
	};
}

export async function dramaGenerate(args: Args) {
	const { text, flag, list } = args;
	const options = {
		...optionsOf(args),
		yes: flag("yes"),
		fresh: flag("new"),
		dryRun: flag("dry-run"),
	};
	checkOut(options.out, options.overwrite, [".wav"]);
	const picked = text("model");
	if (picked !== undefined && !isModel(picked))
		throw input(`--model은 ${DRAMA_MODELS.join(", ")} 중 하나여야 합니다.`);
	const scene = giveVoices(await readScene(text("input") ?? ""), list("voice"));
	const model = picked ?? modelOf(scene);
	const request = checkedRequest(scene, model);
	const connection = await connect(options.url);
	const { origin, userId, voices } = connection;
	for (const { name, voiceId } of request.speakers)
		if (!usableVoice(voices, voiceId, "fish_audio"))
			throw new ClientError(
				"VOICE_UNAVAILABLE",
				4,
				`화자 ${name}의 성우가 보관함에 없거나 지금 쓸 수 없습니다.`,
			);
	const usage = dramaUsage(model, utf8Bytes(sceneText(request).text));
	await runRequest(
		dramaKind(options),
		connection,
		{
			key: fingerprintOf(origin, userId, JSON.stringify(request), "drama"),
			provider: "fish_audio",
			request,
		},
		options,
		async () => ({
			lines: [
				...(request.sceneName ? [`장면 ${request.sceneName}`] : []),
				`화자 ${request.speakers.map(({ name }) => name).join(", ")}`,
				`줄 ${request.lines.length}개, 글자 수 ${sceneChars(request.lines)}자`,
				`모델 ${model}`,
				`예상 사용량 ${usageText(usage)}`,
			].map(clean),
			request: {
				model,
				speakers: request.speakers.length,
				lines: request.lines.length,
				characters: sceneChars(request.lines),
			},
			estimate: usage,
			needsConfirm: !(model === "s2.1-pro-free" && freeModelOpen()),
		}),
	);
}

const takesOf = ({ client }: Connection) =>
	client.dramaList().catch(manageError);
type Take = Awaited<ReturnType<typeof takesOf>>[number];
const titleOf = ({ request: { sceneName, lines } }: Take) =>
	sceneName || `"${[...(lines[0]?.text ?? "")].slice(0, 20).join("")}"`;

export async function dramaList({ json, url }: Args) {
	const connection = await connect(url);
	const takes = (await takesOf(connection)).map((take) => ({
		...take,
		split: splitOk(take),
	}));
	print(
		json,
		{ origin: connection.origin, takes },
		takes.length
			? table(
					["장면", "결과 ID", "상태", "모델", "줄", "나누기", "사용량", "시각"],
					takes.map((take) => [
						titleOf(take),
						take.id,
						take.status === "done" ? "완료" : "처리 여부 미확인",
						take.request.model,
						take.request.lines.length,
						take.split ? "가능" : "안 됨",
						usageText(take.usage),
						take.createdAt,
					]),
				)
			: "테이크가 없습니다.",
	);
}

export async function dramaDownload(id: string, args: Args) {
	const { json, url, out, overwrite } = optionsOf(args);
	checkOut(out, overwrite, [".wav"]);
	const connection = await connect(url);
	// 목록은 시각과 사용량을 알리는 데만 쓴다. 최근 20개 밖이거나 받지 못하면 모르는 것으로 둔다
	const takes = await takesOf(connection).catch(() => []);
	const take = takes.find((item) => item.id === id);
	const bytes = await downloadTake(connection, id, out, overwrite);
	print(
		json,
		{
			origin: connection.origin,
			source: "saved",
			result: {
				id,
				createdAt: take?.createdAt ?? null,
				usage: take?.usage ?? null,
				bytes,
			},
			out: resolve(out),
			mime: MIME[".wav"],
		},
		[
			`결과 ID ${id}`,
			`저장 ${clean(resolve(out))}`,
			`크기 ${byteText(bytes)}`,
		].join("\n"),
	);
}

// 링크로 본 같은 폴더나 대소문자·한글 조합만 다른 이름도 같은 파일일 수 있다
function checkJoin(joined: string, dir: string, files: readonly string[]) {
	const fold = (name: string) => name.normalize("NFC").toLowerCase();
	if (
		realpathSync.native(dirname(joined)) === realpathSync.native(dir) &&
		files.some((file) => fold(file) === fold(basename(joined)))
	)
		throw input("--join은 줄 파일과 다른 경로여야 합니다.");
}
const cannotSplit = (message: string, resultId: string) =>
	new ClientError("NOT_SPLIT", 4, message, { resultId });
export async function dramaSplit(id: string, args: Args) {
	const { json, url, text, flag } = args;
	const dir = resolve(text("out-dir") ?? "");
	const overwrite = flag("overwrite");
	const joined = text("join");
	const path = text("input");
	checkFolder(dir, "--out-dir의 폴더");
	if (path !== undefined && joined === undefined)
		throw input("--input의 쉼은 --join과 함께 씁니다.");
	const draft = path === undefined ? undefined : await readDraft(path);
	if (draft?.bad.length) throw badLines(draft.bad);
	const scene = draft?.scene;
	if (joined !== undefined) {
		checkOut(joined, overwrite, [".wav"], "--join");
		decoderOf();
	}
	const connection = await connect(url);
	const take = (await takesOf(connection)).find((item) => item.id === id);
	if (!take)
		throw cannotSplit(
			"최근 20개에 없는 테이크라 줄 구간을 알 수 없습니다.",
			id,
		);
	if (take.status !== "done")
		throw cannotSplit("처리 여부를 모르는 테이크입니다.", id);
	const { request, segments } = take;
	if (!splitOk(take) || !segments)
		throw cannotSplit("줄 구간이 줄과 맞지 않아 나눌 수 없습니다.", id);
	if (scene && scene.lines.length !== request.lines.length)
		throw input(
			`장면 파일의 줄 수가 테이크와 다릅니다(${scene.lines.length}/${request.lines.length}줄).`,
		);
	const cuts = request.lines.map((line, i) => {
		const speaker = request.speakers[line.speaker]?.name ?? "";
		const file = `${String(i + 1).padStart(3, "0")}-${safeName(speaker)}.wav`;
		return { n: i + 1, speaker, file, out: join(dir, file) };
	});
	const taken = cuts.filter(({ out, file }) => {
		if (dirname(out) !== dir) throw input(`${file}은 폴더 밖의 경로입니다.`);
		return fileSize(out, file) !== undefined && !overwrite;
	});
	if (taken.length)
		throw input(
			`이미 있는 파일이 있습니다: ${taken.map(({ file }) => file).join(", ")}. 바꾸려면 --overwrite를 쓰세요.`,
		);
	if (joined !== undefined)
		checkJoin(
			joined,
			dir,
			cuts.map(({ file }) => file),
		);
	onInterrupt(() => downloadStopped("drama", id));
	const parts: Uint8Array[] = [];
	const source = await takeParts(connection, id);
	try {
		for await (const part of source) parts.push(part);
	} catch (error) {
		throw downloadFailed(error, id, "drama");
	}
	const wav = new Uint8Array(Buffer.concat(parts));
	const bodies = segments.map((span) => Buffer.concat(cutWav(wav, span)));
	// 잇기를 끝낸 뒤에 게시한다
	const whole =
		joined === undefined
			? undefined
			: await joinSounds(
					(async function* () {
						for (const [i, bytes] of bodies.entries())
							yield {
								bytes,
								mime: MIME[".wav"],
								gap: gapAfter(scene, i + 1),
							};
					})(),
				);
	const wholeBytes =
		whole && Buffer.from(await new Blob(whole.chunks).arrayBuffer());
	const fresh: string[] = [];
	const lines = [];
	// 게시는 동기라 Ctrl+C가 끼어들지 않는다
	try {
		for (const [i, { n, speaker, file, out }] of cuts.entries()) {
			const body = bodies[i];
			if (!body) throw new Error("줄 구간이 없다");
			const isNew = fileSize(out, file) === undefined;
			saveBytes(out, overwrite, body);
			if (isNew) fresh.push(out);
			lines.push({ n, speaker, out, bytes: body.byteLength });
		}
		if (joined !== undefined && wholeBytes)
			saveBytes(joined, overwrite, wholeBytes);
	} catch (error) {
		// 이번에 새로 만든 조각을 남기지 않는다
		for (const path of fresh) rmSync(path, { force: true });
		throw downloadFailed(error, id, "drama");
	}
	const made =
		joined === undefined || !whole || !wholeBytes
			? undefined
			: {
					out: resolve(joined),
					bytes: wholeBytes.byteLength,
					seconds: whole.spans.at(-1)?.end ?? 0,
					lines: lines.map(({ n }, i) => ({ n, ...whole.spans[i] })),
				};
	print(
		json,
		{
			origin: connection.origin,
			resultId: id,
			outDir: dir,
			lines,
			...(made ? { join: made } : {}),
		},
		[
			table(
				["줄", "화자", "파일"],
				lines.map(({ n, speaker, out }) => [n, speaker, out]),
			),
			...(made
				? [`결합 ${clean(made.out)} (${made.seconds.toFixed(1)}초)`]
				: []),
		].join("\n"),
	);
}

export async function dramaRemove(id: string, { json, url, flag }: Args) {
	const connection = await connect(url);
	const take = (await takesOf(connection)).find((item) => item.id === id);
	await confirmRemoval(
		[`드라마 테이크 ${take ? `${titleOf(take)} ` : ""}(${id})를 지웁니다.`],
		flag("yes"),
	);
	await mutate(connection.client.dramaDelete({ id }));
	print(
		json,
		{ origin: connection.origin, removed: id },
		`지웠습니다. 결과 ID ${id}`,
	);
}

// 화자를 웹 초안 모양으로. 성우를 주지 않았으면 프리셋의 성우를 쓴다
const draftSpeakers = (
	scene: Scene,
	presets: readonly Preset[],
): DraftSpeaker[] =>
	scene.speakers.map((speaker) => {
		const presetId = speaker.presetId ?? null;
		const ref =
			refOf(speaker) ?? presets.find(({ id }) => id === presetId)?.voice;
		return {
			...newSpeaker(speaker.name),
			presetId,
			...(ref ? { provider: ref.provider, voiceId: ref.voiceId } : {}),
		};
	});
const draftLines = (scene: Scene): DraftLine[] =>
	scene.lines.map((line, i) => ({ ...line, id: String(i) }));
const modelOf = (scene: Scene): DramaModel =>
	scene.model ?? (freeModelOpen() ? "s2.1-pro-free" : "s2.1-pro");
// 프리셋을 쓰는 화자가 있을 때만 목록을 받는다
const presetsOf = async ({ client }: Connection, scene: Scene) =>
	scene.speakers.some(({ presetId }) => presetId !== undefined)
		? await client.presetList().catch(manageError)
		: [];
async function readDraft(path: string): Promise<Read> {
	if (extname(path).toLowerCase() !== ".json")
		throw input("--input은 .json 파일이어야 합니다.");
	const draft = sceneOf(await readJson(path));
	const { scene, bad } = draft;
	// 더 볼 줄이 없으면 서버를 부르지 않고 알린다. 남은 줄의 글은 성우를 알아야 볼 수 있다
	if (bad.length === scene.lines.length) throw badLines(bad);
	for (const speaker of scene.speakers) refOf(speaker);
	return draft;
}

const LINE: Label = { what: "줄", one: "line", many: "lines", kind: "trial" };
const PROBLEM_TEXT = {
	voice: "성우 없음·이용 불가",
	long: "보낼 글 200자나 말투 지시 100자를 넘음",
	empty: "태그를 빼면 빈 줄",
};
type ReadRow = {
	n: number;
	request: TrialRequest;
	signature: string;
	state: "saved" | "make" | "check";
};
// 고른 줄의 요청. 쓸 수 없는 줄은 번호와 이유를 모두 알린다(요청과 검사는 웹 읽기와 같다)
function readRows(
	{ voices }: Connection,
	{ scene, bad: wrong }: Read,
	presets: Preset[],
	only: ReadonlySet<number>,
	now: number,
) {
	const speakers = draftSpeakers(scene, presets);
	const lines = draftLines(scene);
	const usable = usableSpeakers(speakers, voices, presets);
	const bad = [...wrong];
	const rows = lines.flatMap((line, i) => {
		const n = i + 1;
		if (!only.has(n) || wrong.some((item) => item.n === n)) return [];
		const result = readRequests(
			speakers,
			lines,
			{ saved: voices, presets, headerModel: modelOf(scene), now },
			line.id,
			1,
		);
		const reason =
			"problem" in result
				? PROBLEM_TEXT[result.problem.kind]
				: speakers[line.speaker]?.presetId && !usable[line.speaker]?.presetId
					? "프리셋 이용 불가"
					: undefined;
		if (reason !== undefined) bad.push({ n, reason });
		const request = "lines" in result ? result.lines[0]?.request : undefined;
		return request ? [{ n, request, signature: comboSignature(request) }] : [];
	});
	if (bad.length) throw badLines(bad);
	return rows;
}

export async function dramaRead(args: Args) {
	const { json, url, text, flag } = args;
	const dir = resolve(text("out-dir") ?? "");
	const overwrite = flag("overwrite");
	const retry = flag("retry-unconfirmed");
	const dryRun = flag("dry-run");
	const joined = text("join");
	const draft = await readDraft(text("input") ?? "");
	const { scene } = draft;
	const only = onlyOf(args, scene.lines.length);
	checkFolder(dir, "--out-dir의 폴더");
	if (joined !== undefined) {
		checkOut(joined, overwrite, [".wav"], "--join");
		// 만든 뒤에야 도구가 없다고 알리지 않게 먼저 본다
		decoderOf();
	}
	const connection = await connect(url);
	const { origin, userId, client } = connection;
	const now = Date.now();
	const asked = readRows(
		connection,
		draft,
		await presetsOf(connection, scene),
		only,
		now,
	);
	const requests = new Map(
		asked.map(({ signature, request }) => [signature, request]),
	);
	const keyOf = (request: TrialRequest) =>
		fingerprint(origin, userId, request, "trial");
	const signatures = [...requests.keys()];
	// 서버 미확인은 조회되지 않으므로 처리 여부는 로컬 기록으로만 본다
	const records = await recordsFor([...requests.values()].map(keyOf));
	const saved = await client
		.trialFindMany([...requests.values()])
		.catch(manageError);
	if (!Array.isArray(saved) || saved.length !== signatures.length)
		throw serverError();
	const found = new Map(
		signatures.map((signature, i): [string, Found | null] => {
			const hit = saved[i];
			return [signature, hit ? { ...hit, bytes: 0, status: "done" } : null];
		}),
	);
	const { checks, settled } = await judge(
		(requestId) => client.trialRequest({ requestId }),
		new Map(signatures.map((signature, i) => [signature, records[i]])),
		found,
	);
	const rows = asked.map(
		(row): ReadRow => ({
			...row,
			state: found.get(row.signature)
				? "saved"
				: checks.has(row.signature)
					? "check"
					: "make",
		}),
	);
	const make = signatures.flatMap((signature): MakeItem[] => {
		const row = rows.find((item) => item.signature === signature);
		return row && (row.state === "make" || (retry && row.state === "check"))
			? [{ id: signature, n: row.n, request: row.request, signature }]
			: [];
	});
	const plan = await usageOf(connection, make, now);
	const jobs = rows.map(({ n, signature, request }): Job => {
		const hit = found.get(signature);
		return {
			n,
			signature,
			mime: mimeOf(request.provider),
			result: hit ? { id: hit.id } : undefined,
		};
	});
	if (joined !== undefined)
		checkJoin(
			joined,
			dir,
			jobs.map(({ n, mime }) => fileName(n, mime)),
		);
	if (!retry && !dryRun)
		refuseUnconfirmed(
			LINE,
			rows.flatMap(({ n, state, signature }) =>
				state === "check" ? [{ n, ...checks.get(signature) }] : [],
			),
		);
	const folder = openFolder(
		dir,
		origin,
		jobs.filter((job) => retry || !checks.has(job.signature)),
		overwrite,
	);
	if (dryRun) return showRead(json, origin, rows, found, checks, plan);
	for (const requestId of settled) await releaseOrWarn(origin, requestId);
	if (plan.needsConfirm)
		await confirm(usageLines("줄", plan), { yes: flag("yes") }, "읽기입니다");
	const done = await runJobs(
		LINE,
		{ dir, origin, jobs, folder },
		async ({ n, signature, mime }) => {
			const request = requests.get(signature);
			if (!request) throw input("만들 요청을 찾지 못했습니다.");
			const file = fileName(n, mime);
			const kind = trialKind({ json, out: join(dir, file), overwrite });
			const made = await create(
				kind,
				connection,
				{ key: keyOf(request), provider: request.provider, request },
				modeOf(checks.get(signature)),
			);
			const { id, requestId } = made;
			const written = made.source === "created" ? kind.written() : undefined;
			if (!written) return made;
			if ("error" in written) {
				const { error } = written;
				error.detail = { ...error.detail, ...(requestId ? { requestId } : {}) };
				throw error;
			}
			const { bytes } = written.result;
			return {
				id,
				source: made.source,
				item: { n, resultId: id, bytes, mime: written.mime ?? mime, file },
				// 파일은 있지만 서버 완료를 확인하지 못했다(T19 규칙)
				stop: requestId ? unconfirmed("trial", requestId) : undefined,
			};
		},
		async (id, n) => {
			const request = rows.find((row) => row.n === n)?.request;
			const file = fileName(n, mimeOf(request?.provider ?? ""));
			const { result, mime } = await download(
				connection,
				id,
				join(dir, file),
				overwrite,
			);
			return { n, resultId: id, bytes: result.bytes, mime: mime ?? "", file };
		},
	);
	const result =
		joined === undefined
			? null
			: await joinLines(done, scene, joined, overwrite);
	print(
		json,
		{
			origin,
			outDir: dir,
			made: done.filter((row) => row.source === "created").length,
			lines: doneRows(done),
			join: result,
		},
		[
			doneTable(LINE, done),
			...(result
				? [`결합 ${clean(result.out)} (${result.seconds.toFixed(1)}초)`]
				: []),
		].join("\n"),
	);
}
// 받은 줄 파일을 드라마 쉼으로 잇는다
async function joinLines(
	done: readonly Done[],
	scene: Scene,
	path: string,
	overwrite: boolean,
) {
	const { chunks, spans } = await joinSounds(
		(async function* () {
			for (const { n, out, mime, resultId } of done) {
				let bytes: Buffer;
				try {
					bytes = readFileSync(out);
				} catch (error) {
					throw downloadFailed(error, resultId, "trial");
				}
				yield { bytes, mime, gap: gapAfter(scene, n) };
			}
		})(),
	);
	const bytes = await saveJoined(path, overwrite, chunks);
	return {
		out: resolve(path),
		bytes,
		seconds: spans.at(-1)?.end ?? 0,
		lines: done.map(({ n }, i) => ({ n, ...spans[i] })),
	};
}
const STATE_TEXT = { saved: "저장됨", make: "만들 것", check: "확인 필요" };
function showRead(
	json: boolean,
	origin: string,
	rows: readonly ReadRow[],
	found: ReadonlyMap<string, Found | null>,
	checks: ReadonlyMap<string, Check>,
	plan: Awaited<ReturnType<typeof usageOf>>,
) {
	const count = (state: ReadRow["state"]) =>
		rows.filter((row) => row.state === state).length;
	const lines = rows.map(({ n, state, signature }) => ({
		n,
		status: state,
		...(state === "saved"
			? { resultId: found.get(signature)?.id }
			: checks.get(signature)),
	}));
	print(
		json,
		{
			origin,
			dryRun: true,
			lines,
			make: plan.make.length,
			saved: count("saved"),
			check: count("check"),
			estimate: plan.usage,
			needsConfirm: plan.needsConfirm,
		},
		[
			table(
				["줄", "상태", "결과·요청 ID"],
				lines.map((row) => [
					row.n,
					STATE_TEXT[row.status],
					("requestId" in row ? row.requestId : row.resultId) ?? "",
				]),
			),
			...usageLines("줄", plan),
		].join("\n"),
	);
}

// 줄 감정 칸의 글. 웹 shownFeel·feelText와 같다(화면 문구라 공용 모듈에 없다)
export function feelLabel(
	voice: Voice | null,
	value: PresetValue,
	family: ActingFamily,
	feel: Feel | undefined,
): string | null {
	const nameOf = (value: string) =>
		ACTING[family].feel.find((tag) => tag.value === value)?.label ?? value;
	const applied = applyLine(value, family, { direction: "", text: "", feel });
	if (applied.provider === "airy" && family === "airy")
		return nameOf(applied.settings.style);
	if (applied.provider !== "typecast" || !family.startsWith("typecast"))
		return null;
	const request =
		voice?.provider === "typecast"
			? trialRequestOf(voice, "", {
					...DEFAULT_SETTINGS,
					typecast: applied.settings,
				})
			: null;
	const settings =
		request?.provider === "typecast" ? request.settings : applied.settings;
	const emotion = pressedEmotion(settings);
	return emotion === "smart"
		? nameOf(emotion)
		: `${nameOf(emotion)} · 강도 ${settings.intensity}`;
}

export async function dramaAutoTag(args: Args) {
	const { json, url, text, flag } = args;
	const out = text("out") ?? "";
	const overwrite = flag("overwrite");
	checkOut(out, overwrite, [".json"]);
	const { scene, bad } = await readDraft(text("input") ?? "");
	const connection = await connect(url);
	const { origin, voices } = connection;
	const presets = await presetsOf(connection, scene);
	const speakers = usableSpeakers(
		draftSpeakers(scene, presets),
		voices,
		presets,
	);
	const lines = draftLines(scene);
	const fishOnly = allFish(speakers, lines);
	const who = (index: number) => {
		const speaker = speakers[index] ?? newSpeaker("");
		return {
			voice: voiceOfSpeaker(speaker, voices),
			value: speakerValue(speaker, presets),
			speaker,
		};
	};
	const cast = (index: number) => {
		const { speaker, voice, value } = who(index);
		return actingOf(speaker, voice, value, modelOf(scene), fishOnly);
	};
	const { sent, input: body } = autoTagInput(speakers, lines, cast, fishOnly);
	checkTagInput(body, sent, bad);
	if (!sent.length) throw input("자동 태그를 받을 줄이 없습니다.");
	const numbers = sent.map(({ n }) => n);
	const asked = [
		`작업실 ${origin}`,
		`자동 태그 ${fishOnly ? "장면" : "읽기"}, 줄 ${sent.length}개`,
		callsLine(1),
	];
	if (flag("dry-run"))
		return print(
			json,
			{
				origin,
				dryRun: true,
				mode: body.mode,
				lines: numbers,
				maxCalls: CALLS_PER_BATCH,
				needsConfirm: true,
			},
			asked.join("\n"),
		);
	const made = await madeLines(connection, scene, speakers, presets, fishOnly);
	await confirm(
		asked,
		{ yes: flag("yes") },
		"자동 태그입니다",
		"추천을 받을까요?",
	);
	onInterrupt(() => tagUnconfirmed());
	const reply = await connection.client
		.dramaAutoTag(body)
		.then((value) => {
			const result = dramaAutoTagOutputSchema.parse(value);
			if (result.lines.length !== sent.length)
				throw new Error("줄 수가 다른 응답");
			return result;
		})
		.catch((error: unknown) => {
			throw failure(error);
		});
	const changes = autoTagChanges(sent, reply.lines, (line, feel) => {
		const { voice, value } = who(line.speaker);
		return feelLabel(voice, value, cast(line.speaker).family, feel);
	});
	const next = autoTagApply(lines, changes).lines;
	try {
		saveBytes(
			out,
			overwrite,
			Buffer.from(
				`${JSON.stringify({ ...scene, lines: next.map(({ id: _, ...line }) => line) })}\n`,
			),
		);
	} catch {
		throw new ClientError(
			"DOWNLOAD_FAILED",
			7,
			"자동 태그 결과를 저장하지 못했습니다.",
		);
	}
	if (fishOnly) {
		const chars = sceneChars(next);
		const limit = sceneLimit({ ...DRAMA_SETTINGS, ...scene.settings }.speed);
		if (chars > limit)
			note(`태그를 넣은 장면이 ${chars}자라 상한 ${limit}자를 넘습니다.`);
	}
	const changed = changes.map(({ n, fields }) => ({ n, fields }));
	const remake = numbers.filter(
		(n) => made.has(n) && changed.some((item) => item.n === n),
	);
	print(
		json,
		{
			origin,
			out: resolve(out),
			mode: body.mode,
			lines: sent.length,
			changed,
			skipped: reply.skipped,
			remake,
		},
		[
			...(changed.length
				? [
						table(
							["줄", "칸", "전", "후"],
							changed.flatMap(({ n, fields }) =>
								fields.map(({ field, before, after }) => [
									n,
									FIELD_TEXT[field],
									before,
									after,
								]),
							),
						),
					]
				: []),
			`저장 ${clean(resolve(out))}`,
			`바뀐 줄 ${changed.length}개, 태그를 받지 않는 줄 ${reply.skipped}개`,
			...(remake.length ? [`다시 만들어야 하는 줄 ${onlyText(remake)}`] : []),
		].join("\n"),
	);
}
// 서버 계약이 거절할 줄을 원래 번호로 알린다
function checkTagInput(
	body: ReturnType<typeof autoTagInput>["input"],
	sent: readonly AutoTagSent[],
	wrong: readonly Bad[],
) {
	const result = dramaAutoTagInputSchema.safeParse(body);
	const bad = [...wrong];
	for (const { path } of result.error?.issues ?? []) {
		const n =
			path[0] === "lines" && typeof path[1] === "number"
				? sent[path[1]]?.n
				: undefined;
		if (n !== undefined && !bad.some((item) => item.n === n))
			bad.push({
				n,
				reason: FIELD_TEXT[path[2] as keyof typeof FIELD_TEXT] ?? "화자 번호",
			});
	}
	if (bad.length) throw badLines(bad);
	if (sent.length && !result.success)
		throw input("장면의 화자나 전체 글자 수를 확인해 주세요.");
}
// 이미 만든 소리가 있는 줄. 장면은 저장된 테이크가 있으면 모든 줄이다. 읽기만 하고 막힌 줄은 건너뛴다
async function madeLines(
	{ client, voices }: Connection,
	scene: Scene,
	speakers: DraftSpeaker[],
	presets: Preset[],
	fishOnly: boolean,
): Promise<Set<number>> {
	const lines = draftLines(scene);
	if (fishOnly) {
		const request = requestOf({
			sceneName: scene.sceneName ?? "",
			speakers,
			lines,
			model: modelOf(scene),
			settings: { ...DRAMA_SETTINGS, ...scene.settings },
		});
		const checked = dramaRequestSchema.safeParse(request);
		const take = checked.success
			? await client.dramaFind(checked.data).catch(manageError)
			: null;
		return new Set(take ? lines.map((_, i) => i + 1) : []);
	}
	const ctx = {
		saved: voices,
		presets,
		headerModel: modelOf(scene),
		now: Date.now(),
	};
	const requests = lines.flatMap((line, i) => {
		const result = readRequests(speakers, lines, ctx, line.id, 1);
		const request = "lines" in result ? result.lines[0]?.request : undefined;
		return request ? [{ n: i + 1, request }] : [];
	});
	if (!requests.length) return new Set();
	const found = await client
		.trialFindMany(requests.map(({ request }) => request))
		.catch(manageError);
	return new Set(requests.filter((_, i) => found[i]).map(({ n }) => n));
}

export async function dramaResume(requestId: string | undefined, args: Args) {
	const options = optionsOf(args);
	const { json, url, out, overwrite } = options;
	if (requestId === undefined) return showRecords("drama", url, json);
	const wanted = args.text("out") !== undefined;
	if (wanted) checkOut(out, overwrite, [".wav"]);
	await checkKind("drama", url, requestId);
	const connection = await connect(url);
	const kind = dramaKind(options);
	const result = resultOf(await recover(kind, connection, requestId));
	if (wanted) return kind.finish(connection, "resumed", result.id);
	show(json, {
		origin: connection.origin,
		source: "resumed",
		result,
		out: null,
		mime: null,
	});
}
