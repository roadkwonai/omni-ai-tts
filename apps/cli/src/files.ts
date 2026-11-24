import { randomUUID } from "node:crypto";
import {
	accessSync,
	chmodSync,
	closeSync,
	constants,
	createReadStream,
	fstatSync,
	linkSync,
	lstatSync,
	openSync,
	readSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import {
	AIRY_LANGUAGES,
	AIRY_STYLES,
	DEFAULT_SETTINGS,
	EMOTION_PRESETS,
	FIELDS,
	type SettingsOf,
} from "@tts-pilot-app/api/providers/trial-options";
import type { Args } from "./cli.js";
import { ClientError, type ErrorDetail, input } from "./client.js";

export type FileOptions = {
	url?: string;
	json: boolean;
	out?: string;
	overwrite: boolean;
};
export const fileOf = ({ url, json, text, flag }: Args): FileOptions => ({
	url,
	json,
	out: text("out"),
	overwrite: flag("overwrite"),
});

// 대본 상한 2,000자는 UTF-8로 8KB다. 앞뒤 공백을 넉넉히 받아도 이보다 크면 대본이 아니다
const INPUT_BYTES_MAX = 1024 * 1024;

export async function readInput(
	path: string,
	max = INPUT_BYTES_MAX,
	what = "대본",
): Promise<string> {
	const chunks: Buffer[] = [];
	let size = 0;
	try {
		for await (const chunk of path === "-"
			? process.stdin
			: createReadStream(path)) {
			size += chunk.length;
			if (size > max) break;
			chunks.push(Buffer.from(chunk));
		}
	} catch {
		throw input(`${what}을 읽지 못했습니다.`);
	}
	if (size > max) throw input(`${what}이 너무 깁니다.`);
	try {
		// 앞의 BOM은 해석기가 뺀다
		return new TextDecoder("utf-8", { fatal: true }).decode(
			Buffer.concat(chunks),
		);
	} catch {
		throw input(`${what}이 UTF-8이 아닙니다.`);
	}
}
export async function readJson(path: string, max?: number): Promise<unknown> {
	const text = await readInput(path, max, "JSON 파일");
	try {
		return JSON.parse(text);
	} catch {
		throw input("JSON 파일의 형식이 올바르지 않습니다.");
	}
}

// 일반 파일(링크면 대상이)을 한 번 열어 상한까지 읽는다. hint는 너무 클 때 덧붙이는 안내다
export function readBytes(
	path: string,
	max: number,
	what: string,
	hint: string,
): Buffer {
	const bytes = Buffer.alloc(max + 1);
	let size = 0;
	try {
		// 파이프를 열며 기다리지 않는다
		const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
		try {
			if (!fstatSync(fd).isFile()) throw new Error("일반 파일이 아니다");
			let read = -1;
			while (read !== 0 && size < bytes.length) {
				read = readSync(fd, bytes, size, bytes.length - size, null);
				size += read;
			}
		} finally {
			closeSync(fd);
		}
	} catch {
		throw input(`${what} 파일을 읽지 못했습니다. 일반 파일이어야 합니다.`);
	}
	if (size > max)
		throw input(
			`${what} 파일이 너무 큽니다. ${max.toLocaleString("ko-KR")}바이트까지 보낼 수 있습니다. ${hint}`,
		);
	return bytes.subarray(0, size);
}

// 모델 말고 고정 선택지인 칸(서버 계약 trial-contract.ts와 같다)
const CHOICES: Partial<Record<ProviderId, Record<string, readonly unknown[]>>> =
	{
		typecast: {
			emotion: ["smart", "preset"],
			preset: EMOTION_PRESETS,
			language: ["auto", "kor"],
		},
		airy: { language: AIRY_LANGUAGES, style: AIRY_STYLES },
	};
// 공급자 설정 JSON(일부여도 된다). 서버는 모르는 칸을 조용히 버리고 모르는 모델·프리셋은 보정되므로 여기서 거절한다
export async function readSettings<P extends ProviderId>(
	provider: P,
	path: string,
): Promise<SettingsOf[P]> {
	const value = await readJson(path);
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw input("설정 파일은 JSON 객체여야 합니다.");
	const base: Record<string, unknown> = DEFAULT_SETTINGS[provider];
	const unknown = Object.keys(value).filter((key) => !Object.hasOwn(base, key));
	if (unknown.length)
		throw input(`설정 파일에 모르는 칸이 있습니다: ${unknown.join(", ")}`);
	const bad = Object.entries(value)
		.filter(
			([key, item]) =>
				typeof item !== typeof base[key] ||
				(key === "model" && !Object.hasOwn(FIELDS[provider], item)) ||
				CHOICES[provider]?.[key]?.includes(item) === false,
		)
		.map(([key]) => key);
	if (bad.length)
		throw input(`설정 파일의 값을 확인해 주세요: ${bad.join(", ")}`);
	return { ...DEFAULT_SETTINGS[provider], ...value };
}

const entry = (path: string) => lstatSync(path, { throwIfNoEntry: false });
export const MIME = { ".mp3": "audio/mpeg", ".wav": "audio/wav" } as const;
export const extensionOf = (mime: string) =>
	mime === "audio/wav" ? ".wav" : ".mp3";
export const checkExtension = (out: string, mime: string) => {
	if (extname(out).toLowerCase() !== extensionOf(mime))
		throw input(`이 음성은 ${extensionOf(mime)} 파일로 받아야 합니다.`);
};

export function checkFolder(folder: string, what: string) {
	try {
		if (!statSync(folder).isDirectory()) throw new Error();
		accessSync(folder, constants.W_OK | constants.X_OK);
	} catch {
		throw input(`${what}가 없거나 쓸 수 없습니다.`);
	}
}
// 있으면 일반 파일인가. 링크나 폴더면 거절하고, 없으면 크기도 없다
export function fileSize(out: string, name: string): number | undefined {
	let found: ReturnType<typeof entry>;
	try {
		found = entry(out);
	} catch {
		throw input(`${name}의 이름이 너무 길거나 볼 수 없는 경로입니다.`);
	}
	if (found && !found.isFile())
		throw input(`${name}이 심볼릭 링크나 폴더라 쓸 수 없습니다.`);
	return found?.size;
}
// 유료 요청 전에 출력 경로를 본다
export function checkOut(
	out: string,
	overwrite: boolean,
	allowed: string[] = Object.keys(MIME),
	name = "--out",
) {
	// extname은 끝 빗금을 무시한다
	if (out.endsWith("/") || !allowed.includes(extname(out).toLowerCase()))
		throw input(`${name}은 ${allowed.join("나 ")} 파일이어야 합니다.`);
	checkFolder(dirname(out), `${name}의 폴더`);
	if (fileSize(out, name) !== undefined && !overwrite)
		throw input(
			`${name}에 이미 파일이 있습니다. 바꾸려면 --overwrite를 쓰세요.`,
		);
}

// 지금 쓰는 임시 파일. Ctrl+C가 지운다
let temporary: string | undefined;
function discard() {
	if (temporary) rmSync(temporary, { force: true });
	temporary = undefined;
}
// 그 밖에 Ctrl+C가 정리할 것(결합의 임시 폴더와 자식 프로세스)
export const cleanups = new Set<() => void>();
export function discardAll() {
	discard();
	for (const run of cleanups) run();
}

// 다 쓴 임시 파일을 게시한다. 실패하면 기존 파일은 그대로다
function publish(temp: string, out: string, overwrite: boolean) {
	if (overwrite) {
		const found = entry(out);
		if (found && !found.isFile()) throw new Error("일반 파일만 덮어쓸 수 있다");
		if (found) chmodSync(temp, found.mode & 0o777);
		return renameSync(temp, out);
	}
	try {
		linkSync(temp, out);
	} catch (error) {
		const { code = "" } = error as NodeJS.ErrnoException;
		if (!["ENOTSUP", "EPERM"].includes(code)) throw error;
		// 하드 링크를 못 쓰는 볼륨(exFAT 등). 빈 파일로 이름을 잡고 바꿔 치워 남의 파일을 덮지도 반쪽 파일을 남기지도 않는다
		closeSync(openSync(out, "wx", 0o600));
		try {
			renameSync(temp, out);
		} catch (failed) {
			rmSync(out, { force: true });
			throw failed;
		}
	}
}
const tempOf = (out: string) =>
	join(dirname(out), `.omni-tts-${randomUUID()}.tmp`);

// 같은 폴더의 임시 파일에 쓰고 끝난 뒤에만 게시한다
export async function save(
	out: string,
	overwrite: boolean,
	parts: AsyncIterable<Uint8Array>,
) {
	const temp = tempOf(out);
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
		publish(temp, out, overwrite);
	} finally {
		discard();
	}
}
// 한 번에 쓴다. 동기라 Ctrl+C 처리에서도 쓰고, 다른 save가 쓰는 임시 파일을 건드리지 않는다
export function saveBytes(out: string, overwrite: boolean, bytes: Uint8Array) {
	const temp = tempOf(out);
	try {
		writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" });
		publish(temp, out, overwrite);
	} finally {
		rmSync(temp, { force: true });
	}
}
// 저장하지 못하면 종료 코드 7이다
export function saveOr7(
	out: string,
	overwrite: boolean,
	bytes: Uint8Array,
	message: string,
	detail?: ErrorDetail,
) {
	try {
		saveBytes(out, overwrite, bytes);
	} catch {
		throw new ClientError("DOWNLOAD_FAILED", 7, message, detail);
	}
}
