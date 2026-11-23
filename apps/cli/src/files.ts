import { randomUUID } from "node:crypto";
import {
	accessSync,
	chmodSync,
	closeSync,
	constants,
	createReadStream,
	linkSync,
	lstatSync,
	openSync,
	renameSync,
	rmSync,
	statSync,
	writeSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { ClientError } from "./client.js";

const input = (message: string) => new ClientError("INPUT", 2, message);
// 대본 상한 2,000자는 UTF-8로 8KB다. 앞뒤 공백을 넉넉히 받아도 이보다 크면 대본이 아니다
const INPUT_BYTES_MAX = 1024 * 1024;

export async function readInput(path: string): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	try {
		for await (const chunk of path === "-"
			? process.stdin
			: createReadStream(path)) {
			size += chunk.length;
			if (size > INPUT_BYTES_MAX) break;
			chunks.push(Buffer.from(chunk));
		}
	} catch {
		throw input("대본을 읽지 못했습니다.");
	}
	if (size > INPUT_BYTES_MAX) throw input("대본이 너무 깁니다.");
	try {
		// 앞의 BOM은 해석기가 뺀다
		return new TextDecoder("utf-8", { fatal: true }).decode(
			Buffer.concat(chunks),
		);
	} catch {
		throw input("대본이 UTF-8이 아닙니다.");
	}
}

const entry = (path: string) => lstatSync(path, { throwIfNoEntry: false });
export const MIME = { ".mp3": "audio/mpeg", ".wav": "audio/wav" } as const;
export const extensionOf = (mime: string) =>
	mime === "audio/wav" ? ".wav" : ".mp3";
export const checkExtension = (out: string, mime: string) => {
	if (extname(out).toLowerCase() !== extensionOf(mime))
		throw input(`이 음성은 ${extensionOf(mime)} 파일로 받아야 합니다.`);
};

// 유료 요청 전에 출력 경로를 본다
export function checkOut(out: string, overwrite: boolean) {
	if (!Object.hasOwn(MIME, extname(out).toLowerCase()))
		throw input("--out은 .mp3나 .wav 파일이어야 합니다.");
	const folder = dirname(out);
	try {
		if (!statSync(folder).isDirectory()) throw new Error();
		accessSync(folder, constants.W_OK | constants.X_OK);
	} catch {
		throw input("--out의 폴더가 없거나 쓸 수 없습니다.");
	}
	const found = entry(out);
	if (!found) return;
	if (!found.isFile())
		throw input("--out이 심볼릭 링크나 폴더라 쓸 수 없습니다.");
	if (!overwrite)
		throw input("--out에 이미 파일이 있습니다. 바꾸려면 --overwrite를 쓰세요.");
}

// 지금 쓰는 임시 파일. Ctrl+C가 지운다
let temporary: string | undefined;
export function discard() {
	if (temporary) rmSync(temporary, { force: true });
	temporary = undefined;
}

// 같은 폴더의 임시 파일에 쓰고 끝난 뒤에만 게시한다. 실패하면 기존 파일은 그대로다
export async function save(
	out: string,
	overwrite: boolean,
	parts: AsyncIterable<Uint8Array>,
) {
	const temp = join(dirname(out), `.omni-tts-${randomUUID()}.tmp`);
	try {
		const fd = openSync(temp, "wx", 0o600);
		temporary = temp;
		try {
			for await (const part of parts) {
				let at = 0;
				while (at < part.length) at += writeSync(fd, part, at);
			}
		} finally {
			closeSync(fd);
		}
		if (overwrite) {
			const found = entry(out);
			if (found && !found.isFile())
				throw new Error("일반 파일만 덮어쓸 수 있다");
			if (found) chmodSync(temp, found.mode & 0o777);
			renameSync(temp, out);
		}
		// shortcut: 하드 링크를 못 쓰는 파일 시스템(exFAT 등)은 게시에 실패한다(7). 그런 볼륨이 필요해지면 copyFile COPYFILE_EXCL로 바꾼다
		else linkSync(temp, out);
	} finally {
		discard();
	}
}
