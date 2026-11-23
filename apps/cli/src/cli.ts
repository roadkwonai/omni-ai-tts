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
import { clean, jsonText, report } from "./output.js";
import {
	downloadResult,
	generate,
	presets,
	resume,
	watchInterrupt,
} from "./studio.js";

const help = `Omni AI TTS CLI

  omni-tts auth login --url URL
  omni-tts auth status [--url URL] [--json]
  omni-tts auth logout [--url URL] [--json]
  omni-tts voices list [--url URL] [--provider ID] [--channel NAME | --channel-id ID] [--favorite] [--frequent] [--json]
  omni-tts presets list [--url URL] [--json]
  omni-tts studio generate (--voice REF | --preset-id ID) --input FILE|- --out PATH
                           [--overwrite] [--yes] [--new] [--dry-run] [--url URL] [--json]
  omni-tts studio download RESULT_ID --out PATH [--overwrite] [--url URL] [--json]
  omni-tts studio resume [REQUEST_ID] [--out PATH] [--overwrite] [--url URL] [--json]

음성 만들기 (studio generate)
  요금이 나올 수 있는 명령은 이것뿐입니다. 터미널에서 확인을 받고, 비대화 실행이나 --input -에서는 --yes가 필요합니다.
  Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다. 자동으로 다시 만들지 않습니다.
  --voice REF      voices list의 공급자:성우 ID(예: typecast:voice-123)
  --preset-id ID   presets list의 프리셋 ID
  --input FILE|-   UTF-8 대본 파일 또는 stdin. 대괄호 태그는 원문 그대로 보냅니다(웹은 모델이 받지 않는 태그를 뺍니다)
  --out PATH       Gemini는 .wav, 나머지는 .mp3
  --overwrite      이미 있는 일반 파일을 바꿉니다
  --yes            요금 확인을 대신합니다
  --new            저장된 결과와 확인하지 못한 요청을 쓰지 않고 새로 만듭니다(요금이 다시 나올 수 있습니다)
  --dry-run        만들지 않고 저장된 결과와 예상 사용량만 봅니다
  같은 입력의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다.

내려받기와 복구 (요금 없음)
  studio download  결과 ID의 파일을 받습니다
  studio resume    응답을 받지 못한 요청을 다시 확인합니다. ID가 없으면 남은 요청을 보입니다

종료 코드
  0 성공  2 입력·확인 필요  3 로그인·소유자  4 찾을 수 없음·이용 불가
  5 공급자·서비스 실패  6 처리 여부 미확인  7 로컬 파일 실패

예시
  omni-tts studio generate --voice typecast:voice-123 --input 대본.txt --out 내레이션.mp3
  omni-tts studio generate --preset-id PRESET_ID --input - --out 내레이션.wav --yes --json < 대본.txt
  omni-tts studio resume REQUEST_ID --out 내레이션.mp3
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input = (message: string) => new ClientError("INPUT", 2, message);
// 명령마다 받는 옵션(json·url은 늘 받는다)과 위치 인자 수
const COMMANDS: Record<string, { options: string[]; extra: number }> = {
	"auth login": { options: [], extra: 0 },
	"auth status": { options: [], extra: 0 },
	"auth logout": { options: [], extra: 0 },
	"voices list": {
		options: ["provider", "channel", "channel-id", "favorite", "frequent"],
		extra: 0,
	},
	"presets list": { options: [], extra: 0 },
	"studio generate": {
		options: [
			"voice",
			"preset-id",
			"input",
			"out",
			"overwrite",
			"yes",
			"new",
			"dry-run",
		],
		extra: 0,
	},
	"studio download": { options: ["out", "overwrite"], extra: 1 },
	"studio resume": { options: ["out", "overwrite"], extra: 1 },
};

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
			args.includes("--json") ? `${jsonText({ help })}\n` : help,
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
			voice: { type: "string" },
			"preset-id": { type: "string" },
			input: { type: "string" },
			out: { type: "string" },
			overwrite: { type: "boolean" },
			yes: { type: "boolean" },
			new: { type: "boolean" },
			"dry-run": { type: "boolean" },
		},
	});
	const [group, command, ...extra] = positionals;
	const name = `${group} ${command}`;
	const spec = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
	if (extra.length > (spec?.extra ?? 0)) throw input("명령을 확인해 주세요.");
	if (
		Object.keys(values).some(
			(option) =>
				option !== "json" &&
				option !== "url" &&
				!spec?.options.includes(option),
		)
	)
		throw input("이 명령에서 지원하지 않는 옵션입니다.");
	for (const id of [...extra, values["preset-id"]])
		if (id !== undefined && !UUID.test(id)) throw input("ID를 확인해 주세요.");
	if (
		values.provider !== undefined &&
		!["typecast", "elevenlabs", "fish_audio", "airy", "gemini"].includes(
			values.provider,
		)
	)
		throw new ClientError("INPUT", 2, "공급자 이름을 확인해 주세요.");
	if (values["channel-id"] !== undefined && !UUID.test(values["channel-id"]))
		throw new ClientError("INPUT", 2, "채널 ID를 확인해 주세요.");
	if (group === "presets" || group === "studio") {
		const options = {
			url: values.url,
			json: values.json ?? false,
			out: values.out,
			overwrite: values.overwrite ?? false,
		};
		watchInterrupt();
		if (name === "presets list") return presets(options);
		if (name === "studio generate") {
			const { voice, "preset-id": presetId } = values;
			if ((voice === undefined) === (presetId === undefined))
				throw input("--voice와 --preset-id 중 하나를 선택해 주세요.");
			if (voice !== undefined && !/^[^:]+:./.test(voice))
				throw input("--voice는 공급자:성우 ID여야 합니다.");
			if (!values.input) throw input("--input이 필요합니다.");
			if (!values.out) throw input("--out이 필요합니다.");
			return generate({
				...options,
				voice,
				presetId: presetId?.toLowerCase(),
				input: values.input,
				yes: values.yes ?? false,
				fresh: values.new ?? false,
				dryRun: values["dry-run"] ?? false,
			});
		}
		// 기록의 UUID와 글자로 비교한다
		const id = extra[0]?.toLowerCase();
		if (name === "studio download") {
			if (!id || !values.out) throw input("결과 ID와 --out이 필요합니다.");
			return downloadResult(id, options);
		}
		if (name === "studio resume") {
			if (!id && (values.out !== undefined || values.overwrite))
				throw input("받을 요청 ID가 필요합니다.");
			return resume(id, options);
		}
	}
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
			process.stdout.write(
				voices.length
					? `성우\t공급자:성우 ID\t사용 가능\t즐겨찾기\t자주 사용\t채널 ID\t분류 ID\t사용 횟수\t최근 사용\n${voices.map((item) => `${clean(item.voice.name)}\t${clean(item.ref)}\t${item.unavailable ? "이용 불가" : "가능"}\t${item.favorite ? "예" : "아니요"}\t${item.frequent ? "예" : "아니요"}\t${item.channelIds.map(clean).join(", ")}\t${item.classificationIds.map(clean).join(", ")}\t${item.useCount}\t${clean(item.lastUsedAt ?? "없음")}`).join("\n")}\n`
					: "담은 성우가 없습니다.\n",
			);
			return;
		}
	} else throw new ClientError("INPUT", 2, "명령을 확인해 주세요.");
	process.stdout.write(`${jsonText(result, values.json ? undefined : 2)}\n`);
}

main().catch((error: unknown) => {
	process.exitCode = report(error);
});
