#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
	ClientError,
	login,
	logout,
	normalizeOrigin,
	savedVoices,
	status,
} from "./client.js";

const help = `Omni AI TTS CLI

  omni-tts auth login --url URL
  omni-tts auth status [--url URL] [--json]
  omni-tts auth logout [--url URL] [--json]
  omni-tts voices list [--url URL] [--provider ID] [--channel NAME | --channel-id ID] [--favorite] [--frequent] [--json]
`;

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

async function main() {
	const args = process.argv.slice(2);
	if (!args.length || args.includes("--help")) {
		process.stdout.write(
			args.includes("--json") ? `${JSON.stringify({ help })}\n` : help,
		);
		return;
	}
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			json: { type: "boolean" },
			url: { type: "string" },
			provider: { type: "string" },
			channel: { type: "string" },
			"channel-id": { type: "string" },
			favorite: { type: "boolean" },
			frequent: { type: "boolean" },
		},
	});
	const [group, command, ...extra] = positionals;
	if (extra.length) throw new ClientError("INPUT", 2, "명령을 확인해 주세요.");
	const voiceCommand = group === "voices" && command === "list";
	if (
		!voiceCommand &&
		(values.provider !== undefined ||
			values.channel !== undefined ||
			values["channel-id"] !== undefined ||
			values.favorite ||
			values.frequent)
	)
		throw new ClientError("INPUT", 2, "이 명령에서 지원하지 않는 옵션입니다.");
	if (
		values.provider !== undefined &&
		!["typecast", "elevenlabs", "fish_audio", "airy", "gemini"].includes(
			values.provider,
		)
	)
		throw new ClientError("INPUT", 2, "공급자 이름을 확인해 주세요.");
	if (
		values["channel-id"] !== undefined &&
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			values["channel-id"],
		)
	)
		throw new ClientError("INPUT", 2, "채널 ID를 확인해 주세요.");
	let result: unknown;
	if (group === "auth" && command === "login") {
		if (!values.url)
			throw new ClientError("INPUT", 2, "작업실 주소가 필요합니다.");
		let origin: string;
		try {
			origin = normalizeOrigin(values.url);
		} catch {
			throw new ClientError("INPUT", 2, "작업실 주소를 확인해 주세요.");
		}
		process.stderr.write(`작업실 ${origin}\n`);
		const { email, password } = await credentials();
		result = await login(origin, email, password);
	} else if (group === "auth" && command === "status")
		result = await status(values.url);
	else if (group === "auth" && command === "logout")
		result = await logout(values.url);
	else if (group === "voices" && command === "list") {
		if (values.channel && values["channel-id"])
			throw new ClientError(
				"INPUT",
				2,
				"채널 이름과 ID 중 하나를 선택해 주세요.",
			);
		const data = await savedVoices(
			values.url,
			Boolean(values.channel || values["channel-id"]),
		);
		let channelId = values["channel-id"];
		if (values.channel) {
			const matches = data.channels.filter(
				(channel) => channel.name === values.channel,
			);
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
					(!values.provider || item.voice.provider === values.provider) &&
					(!values.favorite || item.favorite) &&
					(!values.frequent || item.frequent) &&
					(!channelId || item.channelIds.includes(channelId)),
			)
			.map((item) => ({
				...item,
				ref: `${item.voice.provider}:${item.voice.voiceId}`,
			}));
		result = { origin: data.origin, voices };
		if (!values.json) {
			const clean = (value: string) =>
				Array.from(value)
					.filter((char) => {
						const n = char.codePointAt(0) ?? 0;
						return n >= 32 && !(n >= 127 && n <= 159);
					})
					.join("");
			process.stdout.write(
				voices.length
					? `성우\t공급자:성우 ID\t사용 가능\t즐겨찾기\t자주 사용\t채널 ID\t분류 ID\t사용 횟수\t최근 사용\n${voices.map((item) => `${clean(item.voice.name)}\t${clean(item.ref)}\t${item.unavailable ? "이용 불가" : "가능"}\t${item.favorite ? "예" : "아니요"}\t${item.frequent ? "예" : "아니요"}\t${item.channelIds.map(clean).join(", ")}\t${item.classificationIds.map(clean).join(", ")}\t${item.useCount}\t${clean(item.lastUsedAt ?? "없음")}`).join("\n")}\n`
					: "담은 성우가 없습니다.\n",
			);
			return;
		}
	} else throw new ClientError("INPUT", 2, "명령을 확인해 주세요.");
	if (values.json) process.stdout.write(`${JSON.stringify(result)}\n`);
	else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
	const known = error instanceof ClientError;
	const result = {
		code: known ? error.code : "INPUT",
		message: known ? error.message : "명령을 처리하지 못했습니다.",
	};
	if (process.argv.includes("--json"))
		process.stdout.write(`${JSON.stringify(result)}\n`);
	else process.stderr.write(`${result.message}\n`);
	process.exitCode = known ? error.exitCode : 2;
});
