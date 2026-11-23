import { type ChildProcess, spawn } from "node:child_process";
import {
	accessSync,
	constants,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { DRAMA_SAMPLE_RATE } from "@tts-pilot-app/api/drama-script";
import { receivePlan } from "@tts-pilot-app/api/make-plan";
import { srtOf, stripTags } from "@tts-pilot-app/api/paragraph-files";
import {
	joinWav,
	monoOf,
	pcm16,
	spansOf,
	trimSilence,
} from "@tts-pilot-app/api/sound-join";
import type { Args } from "./cli.js";
import { ClientError, connect, input } from "./client.js";
import {
	checkOut,
	cleanups,
	extensionOf,
	MIME,
	save,
	saveBytes,
} from "./files.js";
import { byteText, clean, print } from "./output.js";
import { downloadFailed, infoOf, partsFrom } from "./studio.js";
import { inspect, onlyOf, resolveWork, sourceOf, workOf } from "./work.js";

const TOOL_MS = 60_000;
const WATCH_MS = 50;
// 푼 소리 하나의 상한(44.1kHz 32비트 스테레오 약 25분)
const DECODED_MAX = 512 * 1024 * 1024;

const failed = (message: string) =>
	new ClientError("DECODE_FAILED", 7, message);

// PATH의 ffmpeg, 없으면 macOS 기본 afconvert
export function decoderOf(): { name: "ffmpeg" | "afconvert"; path: string } {
	const folders = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
	for (const name of ["ffmpeg", "afconvert"] as const)
		for (const folder of folders) {
			const path = join(folder, name);
			try {
				accessSync(path, constants.X_OK);
				if (statSync(path).isFile()) return { name, path };
			} catch {
				/* 다음 폴더를 본다 */
			}
		}
	throw failed(
		"소리를 풀 도구가 없습니다. ffmpeg를 설치해 주세요(macOS는 기본 afconvert도 씁니다).",
	);
}

// RIFF/WAVE의 조각을 차례로 본다
function wavChunks(bytes: Buffer) {
	if (
		bytes.length < 12 ||
		bytes.toString("latin1", 0, 4) !== "RIFF" ||
		bytes.toString("latin1", 8, 12) !== "WAVE"
	)
		throw new Error("WAV가 아니다");
	const chunks = new Map<string, { at: number; size: number }>();
	let at = 12;
	while (at + 8 <= bytes.length) {
		const name = bytes.toString("latin1", at, at + 4);
		const size = bytes.readUInt32LE(at + 4);
		if (!chunks.has(name)) chunks.set(name, { at: at + 8, size });
		at += 8 + size + (size % 2);
	}
	return chunks;
}
// 길이를 모르는 채 흘려 쓴 머리(0xFFFFFFFF)는 잘린 것이 아니다
function isCutWav(bytes: Buffer): boolean {
	const data = wavChunks(bytes).get("data");
	return (
		!data || (data.size !== 0xffffffff && data.at + data.size > bytes.length)
	);
}
// 도구가 만든 44.1kHz 32비트 실수 WAV를 채널별로 나눈다
function channelsOf(bytes: Buffer): Float32Array[] {
	const chunks = wavChunks(bytes);
	const format = chunks.get("fmt ");
	const data = chunks.get("data");
	if (!format || !data) throw new Error("WAV 조각이 없다");
	const tag = bytes.readUInt16LE(format.at);
	const count = bytes.readUInt16LE(format.at + 2);
	const rate = bytes.readUInt32LE(format.at + 4);
	const bits = bytes.readUInt16LE(format.at + 14);
	// 채널이 셋 이상이면 확장 머리(0xFFFE)로 온다
	if (
		(tag !== 3 && tag !== 0xfffe) ||
		bits !== 32 ||
		rate !== DRAMA_SAMPLE_RATE ||
		count < 1
	)
		throw new Error("약속한 형식이 아니다");
	const size = Math.min(data.size, bytes.length - data.at);
	const frames = Math.floor(size / 4 / count);
	if (frames === 0) throw new Error("샘플이 없다");
	const view = new DataView(bytes.buffer, bytes.byteOffset + data.at, size);
	return Array.from({ length: count }, (_, channel) => {
		const out = new Float32Array(frames);
		for (let i = 0; i < frames; i += 1)
			out[i] = view.getFloat32((i * count + channel) * 4, true);
		return out;
	});
}

export type Sound = { bytes: Buffer; mime: string; gap: number };

// 소리를 차례로 풀고 다듬어 44.1kHz 16비트 모노 WAV 조각과 구간을 만든다. 셈은 웹과 같은 공용 함수가 한다
export async function joinSounds(sounds: AsyncIterable<Sound>) {
	const tool = decoderOf();
	const dir = mkdtempSync(join(tmpdir(), "omni-tts-join-"));
	let child: ChildProcess | undefined;
	const clean = () => {
		child?.kill("SIGKILL");
		rmSync(dir, { recursive: true, force: true });
	};
	cleanups.add(clean);
	// 이름은 우리가 정하고 셸을 거치지 않는다. 입력 형식은 MIME으로 고정한다
	const argsOf = (from: string, format: string) =>
		tool.name === "ffmpeg"
			? [
					...["-nostdin", "-hide_banner", "-loglevel", "error"],
					...["-protocol_whitelist", "file,pipe", "-f", format, "-i", from],
					...["-map", "0:a:0", "-ar", String(DRAMA_SAMPLE_RATE)],
					...["-c:a", "pcm_f32le", "-f", "wav", "out.wav"],
				]
			: ["-f", "WAVE", "-d", `LEF32@${DRAMA_SAMPLE_RATE}`, from, "out.wav"];
	const decode = async ({ bytes, mime }: Sound) => {
		const wav = mime === MIME[".wav"];
		if (wav && isCutWav(bytes)) throw new Error("잘린 WAV");
		const from = `in${extensionOf(mime)}`;
		const out = join(dir, "out.wav");
		writeFileSync(join(dir, from), bytes, { mode: 0o600 });
		const code = await new Promise<number | null>((done, reject) => {
			child = spawn(tool.path, argsOf(from, wav ? "wav" : "mp3"), {
				cwd: dir,
				stdio: "ignore",
			});
			const stop = () => child?.kill("SIGKILL");
			const timer = setTimeout(stop, TOOL_MS);
			// 도구와 상관없이 푸는 동안 크기를 본다(디스크를 채우지 않게)
			const watch = setInterval(() => {
				const size = statSync(out, { throwIfNoEntry: false })?.size ?? 0;
				if (size > DECODED_MAX) stop();
			}, WATCH_MS);
			const settle = () => {
				clearTimeout(timer);
				clearInterval(watch);
			};
			child.once("error", (error) => {
				settle();
				reject(error);
			});
			child.once("close", (status) => {
				settle();
				child = undefined;
				done(status);
			});
		});
		if (code !== 0) throw new Error("도구가 실패했다");
		if (statSync(out).size > DECODED_MAX) throw new Error("너무 크다");
		const channels = channelsOf(readFileSync(out));
		rmSync(out);
		return pcm16(trimSilence(monoOf(channels)));
	};
	try {
		const parts: Blob[] = [];
		const counts: number[] = [];
		const gaps: number[] = [];
		for await (const sound of sounds) {
			const pcm = await decode(sound).catch(() => {
				throw failed(
					`소리를 풀지 못했습니다(${tool.name}, ${parts.length + 1}번째).`,
				);
			});
			parts.push(new Blob([pcm]));
			counts.push(pcm.length / 2);
			gaps.push(sound.gap);
		}
		return {
			chunks: joinWav(parts, gaps),
			spans: spansOf(counts, gaps, DRAMA_SAMPLE_RATE),
		};
	} finally {
		cleanups.delete(clean);
		clean();
	}
}
// 결합한 조각을 한 파일로 게시하고 크기를 돌려준다
export async function saveJoined(
	out: string,
	overwrite: boolean,
	chunks: readonly (Blob | Uint8Array)[],
): Promise<number> {
	let bytes = 0;
	try {
		await save(
			out,
			overwrite,
			(async function* () {
				for (const chunk of chunks) {
					const part =
						chunk instanceof Blob
							? new Uint8Array(await chunk.arrayBuffer())
							: chunk;
					bytes += part.byteLength;
					yield part;
				}
			})(),
		);
	} catch {
		throw new ClientError(
			"DOWNLOAD_FAILED",
			7,
			"결합한 파일을 저장하지 못했습니다.",
		);
	}
	return bytes;
}

export async function studioJoin(args: Args) {
	const { json, url, text, flag } = args;
	const out = text("out") ?? "";
	const srt = text("srt");
	const overwrite = flag("overwrite");
	checkOut(out, overwrite, [".wav"]);
	if (srt !== undefined) checkOut(srt, overwrite, [".srt"], "--srt");
	const source = await sourceOf(args);
	const connection = await connect(url);
	const { origin, voices } = connection;
	const { work: value } = await resolveWork(source, connection);
	const work = workOf(value);
	const only = onlyOf(args, work.paragraphs.length);
	const { ps, rows, found, now } = await inspect(connection, work, only);
	const missing = rows.filter(
		({ state }) => state !== "blank" && state !== "saved",
	);
	if (missing.length)
		throw new ClientError(
			"NOT_MADE",
			4,
			`아직 만들지 않은 문단이 있습니다: ${missing.map(({ n }) => n).join(", ")}. studio batch로 먼저 만들어 주세요.`,
			{ paragraphs: missing.map(({ n }) => ({ n })) },
		);
	const plan = receivePlan(ps, work, voices, found, now);
	if (!plan.ok) throw input("결합할 문단이 없습니다.");
	const { items } = plan;
	const numbers = new Map(rows.map(({ p, n }) => [p.id, n]));
	async function* sounds(): AsyncGenerator<Sound> {
		for (const { found: result, gap } of items) {
			const info = await infoOf(connection, result.id);
			const parts: Uint8Array[] = [];
			try {
				for await (const part of partsFrom(connection, info)) parts.push(part);
			} catch (error) {
				throw downloadFailed(error, result.id);
			}
			yield { bytes: Buffer.concat(parts), mime: info.audioType, gap };
		}
	}
	const { chunks, spans } = await joinSounds(sounds());
	const bytes = await saveJoined(out, overwrite, chunks);
	if (srt !== undefined)
		try {
			const cues = items.map((item, i) => ({
				start: spans[i]?.start ?? 0,
				end: spans[i]?.end ?? 0,
				text: stripTags(item.text),
			}));
			saveBytes(srt, overwrite, Buffer.from(srtOf(cues)));
		} catch {
			throw new ClientError(
				"DOWNLOAD_FAILED",
				7,
				"자막을 저장하지 못했습니다. WAV는 저장했습니다.",
				{ out: resolve(out) },
			);
		}
	const seconds = spans.at(-1)?.end ?? 0;
	print(
		json,
		{
			origin,
			out: resolve(out),
			srt: srt === undefined ? null : resolve(srt),
			bytes,
			seconds,
			paragraphs: items.map((item, i) => ({
				n: numbers.get(item.id),
				resultId: item.found.id,
				...spans[i],
			})),
		},
		[
			`저장 ${clean(resolve(out))}`,
			...(srt === undefined ? [] : [`자막 ${clean(resolve(srt))}`]),
			`크기 ${byteText(bytes)}`,
			`길이 ${seconds.toFixed(1)}초`,
		].join("\n"),
	);
}
