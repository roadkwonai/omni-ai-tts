#!/usr/bin/env node
import { parseArgs } from "node:util";
import { TAG_LABEL } from "@tts-pilot-app/api/library-filter";
import { GEMINI_CONSENT_SENTENCE } from "@tts-pilot-app/api/my-voice-contract";
import { AGE_KEY_LABEL, GENDER_LABEL } from "@tts-pilot-app/api/voice-filter";
import { authLogin, authLogout, authStatus } from "./auth.js";
import { studioAutoTag } from "./autotag.js";
import { studioBatch, studioPlan } from "./batch.js";
import {
	accents,
	providersStatus,
	refresh,
	sample,
	search,
} from "./casting.js";
import { input, normalizeOrigin } from "./client.js";
import {
	clonesCheck,
	clonesCreate,
	clonesList,
	clonesRemove,
	clonesResume,
	clonesSave,
} from "./clones.js";
import {
	dramaAutoTag,
	dramaDownload,
	dramaGenerate,
	dramaList,
	dramaRead,
	dramaRemove,
	dramaResume,
	dramaSplit,
} from "./drama.js";
import { studioJoin } from "./join.js";
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
import { numbersApply, numbersCheck } from "./numbers.js";
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
  omni-tts voices list [--url URL] [--provider ID] [--channel NAME | --channel-id ID] [--favorite] [--frequent] [--preset]
                       [--q TEXT] [--category-id ID]... [--type-id ID]... [--gender KEY] [--age KEY]
                       [--content KEY]... [--mood KEY]... [--sort recent|used|count|name|popular] [--json]
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
  omni-tts studio plan (--work FILE.json | --script-id ID) [--only 1,3-5]
  omni-tts studio batch (--work FILE.json | --script-id ID) --out-dir DIR [--only 1,3-5] [--yes] [--overwrite]
                        [--retry-unconfirmed] [--dry-run]
  omni-tts studio join (--work FILE.json | --script-id ID) --out FILE.wav [--srt FILE.srt] [--only 1,3-5] [--overwrite]
  omni-tts studio autotag (--work FILE.json | --script-id ID) --out FILE.json [--only 1,3-5] [--yes] [--overwrite]
                          [--dry-run]
  omni-tts numbers check (--input FILE|- | --work FILE.json | --script-id ID)
  omni-tts numbers apply (--input FILE|- --out FILE.txt | (--work FILE.json | --script-id ID) --out FILE.json)
                         [--certain] [--decisions FILE.json] [--overwrite]
  omni-tts drama generate --input FILE.json|FILE.txt --out FILE.wav [--voice NAME=REF]... [--model M]
                          [--yes] [--new] [--overwrite] [--dry-run]
  omni-tts drama list
  omni-tts drama download RESULT_ID --out FILE.wav [--overwrite]
  omni-tts drama resume [REQUEST_ID] [--out FILE.wav] [--overwrite]
  omni-tts drama split RESULT_ID --out-dir DIR [--join FILE.wav [--input FILE.json]] [--overwrite]
  omni-tts drama remove RESULT_ID [--yes]
  omni-tts drama read --input FILE.json --out-dir DIR [--only 1,3-5] [--join FILE.wav] [--yes] [--overwrite]
                      [--retry-unconfirmed] [--dry-run]
  omni-tts drama autotag --input FILE.json --out FILE.json [--yes] [--overwrite] [--dry-run]
  omni-tts clones list
  omni-tts clones create --provider fish_audio|gemini --name NAME --source FILE.wav [--consent-audio FILE.wav]
                         --consent [--yes] [--new] [--dry-run]
  omni-tts clones check ID
  omni-tts clones save ID
  omni-tts clones remove ID [--yes]
  omni-tts clones resume [REQUEST_ID]

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
  voices list      조건은 웹 보관함과 같습니다(같은 조건 여럿은 하나라도, 다른 조건끼리는 모두). --preset은 프리셋에 쓰는 성우,
                   --q는 이름·메모입니다. 보기(--favorite, --frequent, --preset)를 함께 주면 모두 맞는 성우만 남습니다
                   --gender ${[...GENDER_LABEL.keys()].join("|")}  --age ${[...AGE_KEY_LABEL.keys()].join("|")}
                   --content ${[...TAG_LABEL.content.keys()].join("|")}
                   --mood의 키는 모르는 키를 주면 모두 보입니다(예: calm, upbeat)
  voices check     하루에 한 번 이용 가능 여부를 공급자에 확인하고 바뀐 성우를 보입니다
  presets update   채널이 바뀌고 --default가 없으면 채널 기본 지정을 끕니다
  presets create   --settings가 없으면 그 성우의 기본 설정입니다
  scripts create   글은 빈 줄로 문단을 나눕니다. --work는 scripts show --out FILE.json의 작업 JSON입니다
  scripts save     show에서 본 판(--version)이 다르면 저장하지 않습니다. --force만 판 없이 덮어씁니다
                   --input은 글이 같은 문단의 설정을 잇고, 설정이 있는 문단을 잃으면 확인을 받습니다(--yes)
                   --work는 작업 전체를 바꿉니다

음성 만들기 (studio generate, trial generate)
  요금이 나올 수 있는 명령은 이 둘과 studio batch, studio autotag, drama generate, drama read, drama autotag,
  clones create뿐입니다.
  터미널에서 확인을 받고, 비대화 실행이나 --input -에서는 --yes가 필요합니다.
  Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다. 자동으로 다시 만들지 않습니다.
  trial generate는 200자까지의 시험 생성입니다. 성우를 담지 않아도 됩니다.
  --voice REF      studio는 voices list의 성우, trial은 casting search의 성우도 됩니다
  --preset-id ID   presets list의 프리셋 ID
  --input FILE|-   UTF-8 대본 파일 또는 stdin. studio는 웹처럼 모델이 받지 않는 태그를 빼고 보냅니다
  --text TEXT      시험 생성의 문장
  --settings FILE  공급자 설정 JSON의 일부. 나머지는 기본값입니다
  --out PATH       Gemini는 .wav, 나머지는 .mp3
  --overwrite      이미 있는 일반 파일을 바꿉니다
  --yes            요금 확인과 지우기·설정 손실 확인을 대신합니다
  --new            저장된 결과와 확인하지 못한 요청을 쓰지 않고 새로 만듭니다(요금이 다시 나올 수 있습니다)
  --dry-run        만들지 않고 저장된 결과와 예상 사용량만 봅니다
  같은 입력의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다.

문단 묶음과 결합 (작업 JSON은 scripts show --out FILE.json과 같은 모양)
  studio plan      문단마다의 상태(만들 것·저장됨·확인 필요·빈 문단)와 예상 사용량만 봅니다. 요금과 쓰기가 없습니다
  studio batch     만들 문단을 한 번 확인받아 차례로 만들고 DIR/001.mp3처럼 번호 파일로 받습니다. 저장된 문단은 그대로 씁니다
                   실패하면 멈추고, 같은 명령을 다시 실행하면 남은 문단만 만듭니다(다시 확인합니다)
                   확인 필요한 문단이 있으면 만들지 않고 6입니다. --retry-unconfirmed는 그 문단만 새로 만듭니다(요금이 다시 나올 수 있습니다)
  studio join      저장된 문단을 44.1kHz 16비트 모노 WAV 하나로 잇습니다. ffmpeg나 macOS afconvert를 씁니다. --srt는 자막입니다
  studio autotag   문단 자동 태그를 받아 적용한 작업 JSON을 씁니다. 서버가 묶음당 텍스트 호출을 최대 4회 합니다(요금)
  --only           문단 번호(1,3-5). 빈 문단도 번호를 셉니다
  대본은 고쳐 저장하지 않습니다. 결과 작업 JSON은 scripts save --work로 저장합니다.

숫자 검수 (요금 없음. --script-id 말고는 서버도 부르지 않습니다)
  numbers check    읽을 숫자와 제안을 봅니다
  numbers apply    --certain은 확실한 제안을 모두 적용하고, --decisions는
                   [{ "paragraph": 1, "start": 3, "original": "3개", "choice": "apply|keep|manual", "reading": "세 개" }] 파일입니다

드라마
  drama generate   Fish Audio 화자로 장면 하나를 만들어 WAV로 받습니다. 같은 장면의 저장된 테이크가 있으면 그것을 받고 --new만 새로 만듭니다
                   .json은 { version: 1, sceneName, speakers: [{ name, voice }], lines: [{ speaker, direction, text }], model, settings }이고
                   speaker는 0부터 세는 화자 번호입니다. .txt는 '이름: 대사' 줄이고 화자 성우는 --voice 이름=REF로 줍니다
                   모델을 주지 않으면 무료 기간에는 s2.1-pro-free, 아니면 s2.1-pro입니다(--model은 drama-3도 받습니다)
  drama list       최근 테이크 20개. split·remove·download의 결과 ID를 봅니다
  drama split      테이크를 줄마다 DIR/001-화자.wav로 자릅니다. 최근 20개 안의, 줄 구간이 맞는 테이크만 됩니다
                   --join은 조각의 앞뒤 무음을 줄이고 쉼을 넣어 한 WAV에도 잇습니다. 쉼은 --input 장면 파일의 값이고 없으면 0.3초입니다
  drama read       다섯 공급자 화자의 줄을 시험 생성(줄마다 200자)으로 읽어 DIR/001.mp3로 받습니다. 규칙은 studio batch와 같습니다
                   화자에 presetId, 줄에 feel을 더 줄 수 있습니다. --join은 줄을 쉼을 넣어 한 WAV에 잇습니다
                   쉼은 줄의 gap(그 줄 뒤), 없으면 장면의 gap, 둘 다 없으면 0.3초입니다(0~5초, 0.1초 단위)
  drama autotag    자동 태그를 한 번 받아 적용한 같은 모양의 파일을 씁니다(유료 텍스트 호출 최대 4회)

내 보이스 (클론. 공급자 계정에 남고 공급자 문서에 요금 정보가 없습니다)
  clones create    본인 목소리 녹음으로 클론을 만듭니다. --consent(본인 동의)와 확인(--yes)이 모두 필요합니다
                   원본은 24kHz 모노 16비트 WAV(3,000,000바이트까지)이고 Fish Audio는 10~60초, Gemini는 10~30초입니다
                   Gemini는 아래 문장을 읽은 동의 녹음(--consent-audio, 1~20초, 1,000,000바이트까지)이 더 필요합니다
                   "${GEMINI_CONSENT_SENTENCE}"
                   같은 공급자에 같은 이름의 클론이 있으면 2, 만들어졌을 수 있는 줄이 있으면 6이고 만들지 않습니다
                   --new는 이 검사와 확인하지 못한 요청을 건너뜁니다. 자동으로 다시 만들지 않습니다
  clones check     처리 중인 클론을 공급자에 한 번 확인합니다
  clones save      사용 가능한 클론을 보관함에 다시 담습니다. 들어 보기는 trial generate --voice REF입니다
  clones remove    공급자 계정에서도 지웁니다. 터미널에서 확인하거나 --yes가 필요합니다
  clones resume    응답을 받지 못한 만들기를 다시 확인합니다. ID가 없으면 남은 요청을 보입니다

내려받기와 복구 (요금 없음)
  studio download, trial download  결과 ID의 파일을 받습니다
  studio resume, trial resume      응답을 받지 못한 요청을 다시 확인합니다. ID가 없으면 남은 요청을 보입니다
  drama download, drama resume     드라마 테이크의 같은 일입니다
  trial remove, drama remove       결과를 지웁니다. 터미널에서 확인하거나 --yes가 필요합니다

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
  omni-tts studio plan --script-id SCRIPT_ID
  omni-tts studio batch --script-id SCRIPT_ID --out-dir 문단
  omni-tts studio join --script-id SCRIPT_ID --out 내레이션.wav --srt 내레이션.srt
  omni-tts drama generate --input 장면.txt --voice 민수=fish_audio:VOICE_ID --out 장면.wav
  omni-tts drama read --input 읽기.json --out-dir 줄 --join 읽기.wav
  omni-tts clones create --provider fish_audio --name "내 목소리" --source 원본.wav --consent
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
	...["retry-unconfirmed", "certain", "consent", "preset"],
];
const OUT = ["out", "overwrite"];
const WORK = ["work", "script-id"];
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
		options: [
			...["provider", "channel", "channel-id", "favorite", "frequent"],
			...["preset", "q", "category-id", "type-id", "gender", "age"],
			...["content", "mood", "sort"],
		],
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
	"studio plan": { options: [...WORK, "only"], run: studioPlan },
	"studio batch": {
		options: [
			...[...WORK, "only", "out-dir", "yes", "overwrite"],
			...["retry-unconfirmed", "dry-run"],
		],
		required: ["out-dir"],
		run: studioBatch,
	},
	"studio join": {
		options: [...WORK, ...OUT, "only", "srt"],
		required: ["out"],
		run: studioJoin,
	},
	"studio autotag": {
		options: [...WORK, ...OUT, "only", "yes", "dry-run"],
		required: ["out"],
		run: studioAutoTag,
	},
	"drama generate": {
		options: [...PAID, "voice", "model"],
		required: ["input", "out"],
		run: dramaGenerate,
	},
	"drama list": { run: dramaList },
	"drama download": {
		options: OUT,
		required: ["out"],
		extra: 1,
		run: (args) => dramaDownload(resultId(args), args),
	},
	"drama split": {
		options: ["out-dir", "join", "input", "overwrite"],
		required: ["out-dir"],
		extra: 1,
		run: (args) => dramaSplit(resultId(args), args),
	},
	"drama remove": {
		options: ["yes"],
		extra: 1,
		run: (args) => dramaRemove(resultId(args), args),
	},
	"drama read": {
		options: [
			...["input", "out-dir", "only", "join", "yes", "overwrite"],
			...["retry-unconfirmed", "dry-run"],
		],
		required: ["input", "out-dir"],
		run: dramaRead,
	},
	"drama autotag": {
		options: [...OUT, "input", "yes", "dry-run"],
		required: ["input", "out"],
		run: dramaAutoTag,
	},
	"drama resume": {
		options: OUT,
		extra: 1,
		run: (args) => dramaResume(requestId(args), args),
	},
	"clones list": { run: clonesList },
	"clones create": {
		options: [
			...["provider", "name", "source", "consent-audio", "consent"],
			...["yes", "new", "dry-run"],
		],
		required: ["provider", "name", "source"],
		run: clonesCreate,
	},
	"clones check": { extra: 1, run: clonesCheck },
	"clones save": { extra: 1, run: clonesSave },
	"clones remove": { options: ["yes"], extra: 1, run: clonesRemove },
	"clones resume": {
		extra: 1,
		run: (args) => clonesResume(requestId(args), args),
	},
	"numbers check": { options: [...WORK, "input"], run: numbersCheck },
	"numbers apply": {
		options: [...WORK, ...OUT, "input", "certain", "decisions"],
		required: ["out"],
		run: numbersApply,
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
