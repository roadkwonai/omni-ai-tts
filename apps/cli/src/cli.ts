#!/usr/bin/env node
import { parseArgs } from "node:util";
import { authLogin, authLogout, authStatus } from "./auth.js";
import {
	accents,
	providersStatus,
	refresh,
	sample,
	search,
} from "./casting.js";
import { input, normalizeOrigin } from "./client.js";
import {
	voicesCheck,
	voicesList,
	voicesRemove,
	voicesSave,
	voicesShow,
	voicesUpdate,
} from "./library.js";
import {
	categories,
	channels,
	presetCreate,
	presetDuplicate,
	presetOverwrite,
	presetRemove,
	presetShow,
	presetUpdate,
	types,
} from "./manage.js";
import { jsonText, report } from "./output.js";
import { watchInterrupt } from "./paid.js";
import {
	scriptCreate,
	scriptDuplicate,
	scriptList,
	scriptRemove,
	scriptSave,
	scriptShow,
	scriptUpdate,
} from "./scripts.js";
import { downloadResult, generate, presets, resume } from "./studio.js";
import {
	trialDownload,
	trialGenerate,
	trialList,
	trialRemove,
	trialResume,
} from "./trial.js";
import { PROVIDERS } from "./voices.js";

const help = `Omni AI TTS CLI

  omni-tts auth login --url URL
  omni-tts auth status [--url URL] [--json]
  omni-tts auth logout [--url URL] [--json]
  omni-tts providers status [--provider ID]
  omni-tts casting search --provider ID [--source public|account] [--q TEXT] [--language CODE|all] [--accent V]
                          [--gender V] [--age V] [--category V] [--use-case V]... [--descriptive V]... [--tag V]...
                          [--voice-type V] [--featured] [--licensed] [--sort V] [--direction asc|desc]
                          [--page N | --cursor C]
  omni-tts casting accents --language CODE
  omni-tts casting refresh --provider ID
  omni-tts casting sample REF --out PATH [--index N] [--overwrite]
  omni-tts trial generate --voice REF (--text TEXT | --input FILE|-) --out PATH [--settings FILE]
                          [--overwrite] [--yes] [--new] [--dry-run]
  omni-tts trial list --voice REF
  omni-tts trial download RESULT_ID --out PATH [--overwrite]
  omni-tts trial resume [REQUEST_ID] [--out PATH] [--overwrite]
  omni-tts trial remove RESULT_ID [--yes]
  omni-tts voices list [--url URL] [--provider ID] [--channel NAME | --channel-id ID] [--favorite] [--frequent] [--json]
  omni-tts voices show REF
  omni-tts voices check
  omni-tts voices save REF [--favorite | --no-favorite] [--frequent | --no-frequent] [--memo TEXT]
  omni-tts voices update REF [같은 옵션] [--channel-id ID|none]... [--classification-id ID|none]...
  omni-tts voices remove REF [--yes]
  omni-tts channels list
  omni-tts channels create --name NAME [--memo TEXT] [--link URL]
  omni-tts channels update ID [--name NAME] [--memo TEXT] [--link URL]
  omni-tts channels remove ID [--yes]
  omni-tts categories list | create | update ID | remove ID     (채널과 같고 --link가 없습니다)
  omni-tts types list | create | update ID | remove ID          (채널과 같고 --link가 없습니다)
  omni-tts presets list [--url URL] [--json]
  omni-tts presets show ID
  omni-tts presets create --name NAME --voice REF [--settings FILE] [--channel-id ID] [--default]
  omni-tts presets update ID [--name NAME] [--channel-id ID|none] [--default | --no-default]
  omni-tts presets overwrite ID --voice REF --settings FILE
  omni-tts presets duplicate ID
  omni-tts presets remove ID [--yes]
  omni-tts scripts list [--recent] [--q TEXT] [--channel-id ID|none] [--category-id ID]... [--type-id ID]...
                        [--cursor JSON]
  omni-tts scripts show ID [--out FILE.txt|FILE.json] [--overwrite]
  omni-tts scripts create --title TITLE (--input FILE|- | --work FILE.json) [--voice REF] [--channel-id ID]
                          [--classification-id ID]...
  omni-tts scripts save ID (--version N | --force) (--input FILE|- | --work FILE.json) [--yes]
  omni-tts scripts update ID [--title TITLE] [--channel-id ID|none] [--classification-id ID|none]...
  omni-tts scripts duplicate ID
  omni-tts scripts remove ID [--yes]
  omni-tts studio generate (--voice REF | --preset-id ID) --input FILE|- --out PATH
                           [--overwrite] [--yes] [--new] [--dry-run] [--url URL] [--json]
  omni-tts studio download RESULT_ID --out PATH [--overwrite] [--url URL] [--json]
  omni-tts studio resume [REQUEST_ID] [--out PATH] [--overwrite] [--url URL] [--json]

  모든 명령은 --url URL과 --json을 받습니다. 공급자 ID는 ${PROVIDERS.join(", ")}입니다.
  REF는 공급자:성우 ID입니다(예: typecast:voice-123).

성우 찾기 (casting, 요금 없음)
  casting search   공급자가 받는 조건만 받습니다. 찾은 성우의 REF를 다른 명령에 쓸 수 있습니다(ElevenLabs·Fish Audio는 24시간)
  casting refresh  저장된 목록을 만료시킵니다. 공급자를 부르지 않습니다
  casting sample   공급자의 기본 샘플을 .mp3, .wav, .m4a, .ogg로 받습니다. 시험 생성이 아닙니다

보관함·채널·분류·프리셋·대본 (요금 없음)
  준 칸만 바꿉니다. --memo ""와 --link ""는 비우고, --channel-id none과 --classification-id none은 연결을 비웁니다.
  remove는 대상과 영향을 보이고 터미널에서 확인하거나 --yes가 필요합니다.
  voices save      보관함 성우나 casting search의 성우를 담거나, 담긴 성우의 준 칸을 바꿉니다
  voices update    담긴 성우만 바꿉니다. 연결은 준 종류를 통째로 바꿉니다
  voices check     하루에 한 번 이용 가능 여부를 공급자에 확인하고 바뀐 성우를 보입니다
  presets update   채널이 바뀌고 --default가 없으면 채널 기본 지정을 끕니다
  presets create   --settings가 없으면 그 성우의 기본 설정입니다
  scripts create   글은 빈 줄로 문단을 나눕니다. --work는 scripts show --out FILE.json의 작업 JSON입니다
  scripts save     show에서 본 판(--version)이 다르면 저장하지 않습니다. --force만 판 없이 덮어씁니다
                   --input은 글이 같은 문단의 설정을 잇고, 설정이 있는 문단을 잃으면 확인을 받습니다(--yes)
                   --work는 작업 전체를 바꿉니다

음성 만들기 (studio generate, trial generate)
  요금이 나올 수 있는 명령은 이 둘뿐입니다. 터미널에서 확인을 받고, 비대화 실행이나 --input -에서는 --yes가 필요합니다.
  Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다. 자동으로 다시 만들지 않습니다.
  trial generate는 200자까지의 시험 생성입니다. 성우를 담지 않아도 됩니다.
  --voice REF      studio는 voices list의 성우, trial은 casting search의 성우도 됩니다
  --preset-id ID   presets list의 프리셋 ID
  --input FILE|-   UTF-8 대본 파일 또는 stdin. 대괄호 태그는 원문 그대로 보냅니다(웹은 모델이 받지 않는 태그를 뺍니다)
  --text TEXT      시험 생성의 문장
  --settings FILE  공급자 설정 JSON의 일부. 나머지는 기본값입니다
  --out PATH       Gemini는 .wav, 나머지는 .mp3
  --overwrite      이미 있는 일반 파일을 바꿉니다
  --yes            요금 확인과 지우기·설정 손실 확인을 대신합니다
  --new            저장된 결과와 확인하지 못한 요청을 쓰지 않고 새로 만듭니다(요금이 다시 나올 수 있습니다)
  --dry-run        만들지 않고 저장된 결과와 예상 사용량만 봅니다
  같은 입력의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다.

내려받기와 복구 (요금 없음)
  studio download, trial download  결과 ID의 파일을 받습니다
  studio resume, trial resume      응답을 받지 못한 요청을 다시 확인합니다. ID가 없으면 남은 요청을 보입니다
  trial remove                     시험 생성 결과를 지웁니다. 터미널에서 확인하거나 --yes가 필요합니다

종료 코드
  0 성공  2 입력·확인 필요  3 로그인·소유자  4 찾을 수 없음·이용 불가
  5 공급자·서비스 실패  6 처리 여부 미확인  7 로컬 파일 실패

예시
  omni-tts studio generate --voice typecast:voice-123 --input 대본.txt --out 내레이션.mp3
  omni-tts studio generate --preset-id PRESET_ID --input - --out 내레이션.wav --yes --json < 대본.txt
  omni-tts studio resume REQUEST_ID --out 내레이션.mp3
  omni-tts casting search --provider elevenlabs --q 차분한 --use-case narration
  omni-tts trial generate --voice elevenlabs:VOICE_ID --text "안녕하세요" --out 시험.mp3
  omni-tts voices save elevenlabs:VOICE_ID --favorite --memo "차분한 내레이션"
  omni-tts presets create --name 쇼츠 --voice elevenlabs:VOICE_ID --channel-id CHANNEL_ID --default
  omni-tts scripts show SCRIPT_ID --out 대본.txt
  omni-tts scripts save SCRIPT_ID --version 3 --input 대본.txt
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 서버의 UUID와 글자로 비교하게 소문자로 맞춘다
function id(value: string | undefined, message = "ID를 확인해 주세요.") {
	if (value !== undefined && !UUID.test(value)) throw input(message);
	return value?.toLowerCase();
}
function need(value: string | undefined, message: string): string {
	if (!value) throw input(message);
	return value;
}

// 명령 하나가 받는 인자. text는 마지막 값, list는 준 값 전부다
export type Args = {
	json: boolean;
	url?: string;
	extra: string[];
	given: string[];
	text(name: string): string | undefined;
	list(name: string): string[];
	flag(name: string): boolean;
	id: typeof id;
};
type Command = {
	options?: string[];
	required?: string[];
	extra?: number;
	run(args: Args): Promise<void>;
};

const FLAGS = [
	...["json", "favorite", "frequent", "overwrite", "yes", "new", "dry-run"],
	...["featured", "licensed", "no-favorite", "no-frequent"],
	...["default", "no-default", "recent", "force"],
];
const OUT = ["out", "overwrite"];
const VOICE = ["favorite", "no-favorite", "frequent", "no-frequent", "memo"];
const PAID = [...OUT, "input", "yes", "new", "dry-run"];
const fileOf = ({ url, json, text, flag }: Args) => ({
	url,
	json,
	out: text("out"),
	overwrite: flag("overwrite"),
});
const resultId = ({ extra }: Args) => {
	const value = id(extra[0]);
	return need(value, "결과 ID가 필요합니다.");
};
// 받을 요청 ID. 없으면 목록이라 파일 옵션을 받지 않는다
const requestId = ({ extra, text, flag }: Args) => {
	const value = id(extra[0]);
	if (!value && (text("out") !== undefined || flag("overwrite")))
		throw input("받을 요청 ID가 필요합니다.");
	return value;
};

// 채널·카테고리·타입은 명령이 같고 칸만 다르다
const items = (
	group: string,
	run: typeof channels,
	options: string[],
): Record<string, Command> => ({
	[`${group} list`]: { run: run.list },
	[`${group} create`]: { options, required: ["name"], run: run.create },
	[`${group} update`]: { options, extra: 1, run: run.update },
	[`${group} remove`]: { options: ["yes"], extra: 1, run: run.remove },
});

// 명령마다 받는 옵션(json·url은 늘 받는다), 필수 옵션, 위치 인자 수, 실행
const COMMANDS: Record<string, Command> = {
	"auth login": { run: authLogin },
	"auth status": { run: authStatus },
	"auth logout": { run: authLogout },
	"providers status": { options: ["provider"], run: providersStatus },
	"casting search": {
		options: [
			...["provider", "source", "q", "language", "accent", "gender", "age"],
			...["category", "use-case", "descriptive", "tag", "voice-type"],
			...["featured", "licensed", "sort", "direction", "page", "cursor"],
		],
		required: ["provider"],
		run: search,
	},
	"casting accents": {
		options: ["language"],
		required: ["language"],
		run: accents,
	},
	"casting refresh": {
		options: ["provider"],
		required: ["provider"],
		run: refresh,
	},
	"casting sample": {
		options: [...OUT, "index"],
		required: ["out"],
		extra: 1,
		run: sample,
	},
	"trial generate": {
		options: [...PAID, "voice", "text", "settings"],
		required: ["voice", "out"],
		run: trialGenerate,
	},
	"trial list": {
		options: ["voice"],
		required: ["voice"],
		run: trialList,
	},
	"trial download": {
		options: OUT,
		required: ["out"],
		extra: 1,
		run: (args) => trialDownload(resultId(args), args),
	},
	"trial resume": {
		options: OUT,
		extra: 1,
		run: (args) => trialResume(requestId(args), args),
	},
	"trial remove": {
		options: ["yes"],
		extra: 1,
		run: (args) => trialRemove(resultId(args), args),
	},
	"voices list": {
		options: ["provider", "channel", "channel-id", "favorite", "frequent"],
		run: voicesList,
	},
	"voices show": { extra: 1, run: voicesShow },
	"voices check": { run: voicesCheck },
	"voices save": { options: VOICE, extra: 1, run: voicesSave },
	"voices update": {
		options: [...VOICE, "channel-id", "classification-id"],
		extra: 1,
		run: voicesUpdate,
	},
	"voices remove": { options: ["yes"], extra: 1, run: voicesRemove },
	...items("channels", channels, ["name", "memo", "link"]),
	...items("categories", categories, ["name", "memo"]),
	...items("types", types, ["name", "memo"]),
	"presets list": { run: presets },
	"presets show": { extra: 1, run: presetShow },
	"presets create": {
		options: ["name", "voice", "settings", "channel-id", "default"],
		required: ["name", "voice"],
		run: presetCreate,
	},
	"presets update": {
		options: ["name", "channel-id", "default", "no-default"],
		extra: 1,
		run: presetUpdate,
	},
	"presets overwrite": {
		options: ["voice", "settings"],
		required: ["voice", "settings"],
		extra: 1,
		run: presetOverwrite,
	},
	"presets duplicate": { extra: 1, run: presetDuplicate },
	"presets remove": { options: ["yes"], extra: 1, run: presetRemove },
	"scripts list": {
		options: ["recent", "q", "channel-id", "category-id", "type-id", "cursor"],
		run: scriptList,
	},
	"scripts show": { options: OUT, extra: 1, run: scriptShow },
	"scripts create": {
		options: [
			...["title", "input", "work", "voice"],
			...["channel-id", "classification-id"],
		],
		required: ["title"],
		run: scriptCreate,
	},
	"scripts save": {
		options: ["version", "force", "input", "work", "yes"],
		extra: 1,
		run: scriptSave,
	},
	"scripts update": {
		options: ["title", "channel-id", "classification-id"],
		extra: 1,
		run: scriptUpdate,
	},
	"scripts duplicate": { extra: 1, run: scriptDuplicate },
	"scripts remove": { options: ["yes"], extra: 1, run: scriptRemove },
	"studio generate": {
		options: [...PAID, "voice", "preset-id"],
		required: ["input", "out"],
		run(args) {
			const { text, flag } = args;
			const voice = text("voice");
			const presetId = id(text("preset-id"));
			if ((voice === undefined) === (presetId === undefined))
				throw input("--voice와 --preset-id 중 하나를 선택해 주세요.");
			if (voice !== undefined && !/^[^:]+:./.test(voice))
				throw input("--voice는 공급자:성우 ID여야 합니다.");
			return generate({
				...fileOf(args),
				voice,
				presetId,
				input: text("input"),
				yes: flag("yes"),
				fresh: flag("new"),
				dryRun: flag("dry-run"),
			});
		},
	},
	"studio download": {
		options: OUT,
		required: ["out"],
		extra: 1,
		run: (args) => downloadResult(resultId(args), fileOf(args)),
	},
	"studio resume": {
		options: OUT,
		extra: 1,
		run: (args) => resume(requestId(args), fileOf(args)),
	},
};

// 옵션은 이름으로 종류가 정해진다. 글자 옵션은 여러 번 받고 쓰는 쪽이 고른다
const OPTIONS = Object.fromEntries(
	[
		"json",
		"url",
		...Object.values(COMMANDS).flatMap((item) => item.options ?? []),
	].map((name) => [
		name,
		FLAGS.includes(name)
			? { type: "boolean" as const }
			: { type: "string" as const, multiple: true },
	]),
);
function parse(args: string[]) {
	try {
		return parseArgs({ args, allowPositionals: true, options: OPTIONS });
	} catch (error) {
		// Node의 안내에서 옵션 이름만 꺼낸다(값은 옮기지 않는다)
		const [, name = ""] =
			/(--?[^\s'=]+)/.exec(error instanceof Error ? error.message : "") ?? [];
		throw input(
			(error as NodeJS.ErrnoException).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION"
				? `모르는 옵션입니다: ${name}`
				: `옵션의 값을 확인해 주세요: ${name}`,
		);
	}
}

async function main() {
	const argv = process.argv.slice(2);
	if (!argv.length || argv.includes("--help")) {
		process.stdout.write(
			argv.includes("--json") ? `${jsonText({ help })}\n` : help,
		);
		return;
	}
	const { values, positionals } = parse(argv);
	const [group, name, ...extra] = positionals;
	const key = `${group} ${name}`;
	const command = Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : undefined;
	if (!command || extra.length > (command.extra ?? 0))
		throw input("명령을 확인해 주세요.");
	const given = Object.keys(values);
	const denied = given.filter(
		(option) => !["json", "url", ...(command.options ?? [])].includes(option),
	);
	if (denied.length)
		throw input(
			`이 명령에서 지원하지 않는 옵션입니다: ${denied.map((option) => `--${option}`).join(", ")}`,
		);
	const list = (option: string) => {
		const value = values[option];
		return Array.isArray(value) ? value.map(String) : [];
	};
	const text = (option: string) => list(option).at(-1);
	for (const option of command.required ?? [])
		need(text(option), `--${option}이 필요합니다.`);
	const provider = text("provider");
	if (provider !== undefined && !PROVIDERS.includes(provider))
		throw input("공급자 이름을 확인해 주세요.");
	let url = text("url");
	if (url !== undefined)
		try {
			url = normalizeOrigin(url);
		} catch {
			throw input("작업실 주소를 확인해 주세요.");
		}
	if (group !== "auth") watchInterrupt();
	await command.run({
		json: values.json === true,
		url,
		extra,
		given,
		text,
		list,
		flag: (option) => values[option] === true,
		id,
	});
}

main().catch((error: unknown) => {
	process.exitCode = report(error);
});
