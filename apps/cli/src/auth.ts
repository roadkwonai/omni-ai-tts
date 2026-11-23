import type { Args } from "./cli.js";
import { ClientError, login, logout, status } from "./client.js";
import { jsonText } from "./output.js";

async function credentials(): Promise<{ email: string; password: string }> {
	if (!process.stdin.isTTY)
		throw new ClientError("INPUT", 2, "터미널에서 로그인해 주세요.");
	process.stdin.setRawMode(true);
	process.stdin.setEncoding("utf8");
	return new Promise((resolve, reject) => {
		let value = "";
		let email: string | undefined;
		const cleanup = () => {
			process.stdin.off("data", onData);
			process.stdin.off("end", onEnd);
			process.stdin.off("error", onError);
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stderr.write("\n");
		};
		const onEnd = () => {
			cleanup();
			reject(new ClientError("INPUT", 2, "입력이 종료됐습니다."));
		};
		const onError = () => {
			cleanup();
			reject(new ClientError("INPUT", 2, "입력을 읽지 못했습니다."));
		};
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				if (ch === "\u0003") {
					cleanup();
					reject(new ClientError("INPUT", 2, "입력이 취소됐습니다."));
					return;
				}
				if (ch === "\u0004") {
					onEnd();
					return;
				}
				if (ch === "\r" || ch === "\n") {
					if (email === undefined) {
						email = value;
						value = "";
						process.stderr.write("\n비밀번호: ");
						continue;
					}
					cleanup();
					resolve({ email, password: value });
					return;
				}
				if (ch === "\u007f") {
					if (value && email === undefined) process.stderr.write("\b \b");
					value = [...value].slice(0, -1).join("");
				} else if (ch >= " ") {
					value += ch;
					if (email === undefined) process.stderr.write(ch);
				}
			}
		};
		process.stdin.on("data", onData);
		process.stdin.once("end", onEnd);
		process.stdin.once("error", onError);
		process.stdin.resume();
		process.stderr.write("이메일: ");
	});
}

const done = (json: boolean, result: { origin: string }) => {
	process.stdout.write(`${jsonText(result, json ? undefined : 2)}\n`);
};
export async function authLogin({ json, url }: Args) {
	if (!url) throw new ClientError("INPUT", 2, "작업실 주소가 필요합니다.");
	process.stderr.write(`작업실 ${url}\n`);
	const { email, password } = await credentials();
	done(json, await login(url, email, password));
}
export const authStatus = async ({ json, url }: Args) =>
	done(json, await status(url));
export const authLogout = async ({ json, url }: Args) =>
	done(json, await logout(url));
