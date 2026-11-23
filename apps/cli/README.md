# Omni AI TTS CLI

저장소에서 다음 명령으로 빌드하고 로그인합니다. 로그인할 때 터미널에 이메일과 비밀번호를 입력합니다.

```bash
pnpm --filter @tts-pilot-app/cli build
pnpm --filter @tts-pilot-app/cli run cli auth login --url 'https://작업실주소'
pnpm --silent --filter @tts-pilot-app/cli run cli voices list --json
```

빌드하면 실행 파일 하나(`dist/cli.js`)로 묶이고 설치 의존이 없습니다. `pnpm pack`으로 만든 파일을 다른 곳에 `npm install ./tts-pilot-app-cli-0.1.0.tgz`로 설치하거나, 다른 pnpm 프로젝트에서 `pnpm link /path/to/repo/apps/cli`로 링크해 `omni-tts --help`로 실행할 수 있습니다. Node 24 이상이 필요합니다(Node 26에서 확인했습니다).

macOS에서는 기본 제공되는 `/usr/bin/lockf`로 세션 저장을 잠급니다. Linux의 `/usr/bin/flock` 경로는 구현 예정이며 이 환경에서 검증하지 않았습니다.

## 명령

모든 명령은 `--url URL`과 `--json`을 받습니다. `REF`는 `공급자:성우 ID`이고 공급자는 `typecast`, `elevenlabs`, `fish_audio`, `airy`, `gemini`입니다. 요금이 나올 수 있는 명령은 `studio generate`, `studio batch`, `studio autotag`, `trial generate`, `drama generate`, `drama read`, `drama autotag`뿐입니다. 옵션은 `omni-tts --help`에 모두 있습니다.

| 묶음 | 명령 | 하는 일 |
|---|---|---|
| `auth` | `login`, `status`, `logout` | 로그인과 세션 확인 |
| `providers` | `status` | 공급자 연결 상태 |
| `casting` | `search`, `accents`, `refresh`, `sample` | 성우 찾기, 억양, 목록 새로 고침, 기본 샘플 받기 |
| `trial` | `generate`(요금), `list`, `download`, `resume`, `remove`(지움) | 200자까지의 시험 생성 |
| `voices` | `list`, `show`, `check`, `save`, `update`, `remove`(지움) | 성우 보관함 |
| `channels`, `categories`, `types` | `list`, `create`, `update`, `remove`(지움) | 채널과 분류 |
| `presets` | `list`, `show`, `create`, `update`, `overwrite`, `duplicate`, `remove`(지움) | 프리셋 |
| `scripts` | `list`, `show`, `create`, `save`, `update`, `duplicate`, `remove`(지움) | 대본 보관함 |
| `studio` | `generate`(요금), `download`, `resume` | 음성 만들기와 받기 |
| `studio` | `plan`, `batch`(요금), `join`, `autotag`(요금) | 문단 묶음 계획·만들기·결합·자동 태그 |
| `numbers` | `check`, `apply` | 한국어 숫자 검수 |
| `drama` | `generate`(요금), `list`, `download`, `resume`, `split`, `remove`(지움) | 드라마 장면(테이크) |
| `drama` | `read`(요금), `autotag`(요금) | 드라마 대사별 읽기와 자동 태그 |

## 성우 찾기와 시험 생성

```bash
omni-tts providers status
omni-tts casting search --provider elevenlabs --q 차분한 --use-case narration
omni-tts casting sample elevenlabs:VOICE_ID --out 샘플.mp3
omni-tts trial generate --voice elevenlabs:VOICE_ID --text "안녕하세요" --out 시험.mp3 --dry-run
omni-tts trial generate --voice elevenlabs:VOICE_ID --text "안녕하세요" --out 시험.mp3
omni-tts trial list --voice elevenlabs:VOICE_ID
```

- ElevenLabs·Fish Audio 검색에 나온 성우는 세션 폴더의 `voices.json`(0600)에 24시간, 주소마다 500명까지 둡니다. 목록 전체를 주는 Typecast·Airy·Gemini는 두지 않고 목록에서 다시 찾습니다. `REF`는 보관함, `voices.json`, (Typecast·Airy·Gemini) 목록 순서로 찾습니다. 로그인과 로그아웃은 그 주소의 찾은 성우를 지웁니다.
- 기본 샘플은 공급자가 준 파일이라 요금이 없고 시험 생성으로 이어지지 않습니다.
- 시험 생성의 확인·저장 결과 재사용·복구 규칙은 아래 음성 만들기와 같습니다.

## 보관함·채널·분류

```bash
omni-tts voices save elevenlabs:VOICE_ID --favorite --memo "차분한 내레이션"
omni-tts channels create --name 쇼츠 --link https://www.youtube.com/@channel
omni-tts types create --name 내레이션
omni-tts voices update elevenlabs:VOICE_ID --channel-id CHANNEL_ID --classification-id TYPE_ID
omni-tts voices update elevenlabs:VOICE_ID --channel-id none     # 채널 연결만 비웁니다
omni-tts channels update CHANNEL_ID --name "쇼츠 본편"            # 메모와 주소는 그대로입니다
omni-tts channels remove CHANNEL_ID
omni-tts voices check
```

- 준 칸만 바꿉니다. `--memo ""`와 `--link ""`는 비우기입니다.
- `voices save`는 담거나(없으면) 준 칸을 바꿉니다. `voices update`는 담긴 성우만 바꾸고, 연결은 준 종류(채널 또는 분류)를 통째로 바꿉니다. 저장과 연결이 나뉜 두 호출이라 연결이 실패하면 앞의 변경은 남고 그 사실을 stderr에 알립니다.
- `categories`와 `types`는 자기 종류의 ID만 받습니다. 다른 종류의 ID는 4이고 바꾸지 않습니다.
- 지우기(`remove`)는 대상과 영향(연결된 성우 수, 쓰는 프리셋 수)을 stderr에 보이고 터미널에서 `y`를 받습니다. 비대화 실행에서는 `--yes`가 없으면 2이고 지우지 않습니다.
- 채널·분류·프리셋 고치기는 쓰기 직전에 지금 값을 읽어 합칩니다. 그사이 웹에서 바꾼 칸은 잃을 수 있습니다.

## 프리셋

```bash
omni-tts presets create --name 쇼츠 --voice elevenlabs:VOICE_ID --channel-id CHANNEL_ID --default
omni-tts presets show PRESET_ID --json | jq .preset.settings > 설정.json
omni-tts presets overwrite PRESET_ID --voice elevenlabs:VOICE_ID --settings 설정.json
omni-tts presets update PRESET_ID --name "쇼츠 2" --channel-id none
omni-tts presets duplicate PRESET_ID
```

- 설정 파일은 그 공급자 설정 JSON의 일부이고 나머지는 기본값입니다. 모르는 칸과 틀린 값은 2입니다. `presets create`에 설정 파일이 없으면 그 성우의 기본 설정입니다.
- 프리셋을 만들거나 덮어쓰면 그 성우를 보관함에 담습니다(웹과 같습니다).
- 채널이 바뀌고 `--default`가 없으면 채널 기본 지정을 끄고 stderr에 알립니다.

## 대본

```bash
omni-tts scripts create --title "1화" --input 대본.txt --voice elevenlabs:VOICE_ID
omni-tts scripts list --q 1화
omni-tts scripts show SCRIPT_ID --out 대본.txt
omni-tts scripts save SCRIPT_ID --version 1 --input 대본.txt
omni-tts scripts show SCRIPT_ID --out 작업.json
omni-tts scripts save SCRIPT_ID --version 2 --work 작업.json
omni-tts scripts remove SCRIPT_ID
```

- 글(`--input`)은 빈 줄로 문단을 나눕니다. 화자 줄과 긴 글 자동 나누기는 하지 않습니다. 새 대본의 쉼은 0.5초이고 기본 성우는 `--voice`입니다. 웹은 담은 성우만 쓰므로 담지 않은 성우이면 stderr에 알립니다.
- `save --input`은 기본 성우·쉼·화자를 그대로 두고, 글이 같은 문단의 성우·쉼·화자·숫자 검수를 순서대로 잇습니다. `show --out 대본.txt`를 그대로 저장하면 작업이 바뀌지 않습니다. 고치거나 자리를 바꾼 문단은 새 문단입니다. 설정이 있는 문단을 잃으면 수를 보이고 지우기와 같은 확인을 받습니다(`--input -`이면 터미널이어도 `--yes`가 필요합니다).
- `--work`는 문단·성우·쉼이 든 작업 JSON 전체입니다. `show --out 작업.json`이 만든 파일을 그대로 씁니다(3MiB까지 읽고 서버가 2MiB까지 받습니다).
- `save`의 `--version`은 `show`에서 본 판입니다. 그사이 바뀌었으면 2(`reason: "stale"`)이고, `--force`만 판 없이 덮어씁니다.
- 문단 200개, 문단마다 10,000자 같은 상한은 서버가 보고 2로 알립니다. 최근 대본(`list --recent`)은 보고 지울 수만 있습니다.

## 음성 만들기

```bash
omni-tts voices list                      # 공급자:성우 ID를 복사합니다
omni-tts presets list                     # 프리셋 ID를 복사합니다
omni-tts studio generate --voice typecast:voice-123 --input 대본.txt --out 내레이션.mp3
omni-tts studio generate --preset-id PRESET_ID --input - --out 내레이션.wav --yes --json < 대본.txt
omni-tts studio generate --voice typecast:voice-123 --input 대본.txt --out 내레이션.mp3 --dry-run
omni-tts studio download RESULT_ID --out 내레이션.mp3
omni-tts studio resume
omni-tts studio resume REQUEST_ID --out 내레이션.mp3
```

- 터미널에서 성우·모델·글자 수·예상 사용량을 보고 `y`를 눌러야 만듭니다. 비대화 실행이나 `--input -`에서는 `--yes`가 필요합니다. Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다.
- 같은 성우·설정·대본의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다(`source: "saved"`). 자동으로 다시 만들지 않습니다.
- 응답을 받지 못하면 종료 코드 6이고 요청 기록이 남습니다. 같은 명령이나 `studio resume REQUEST_ID`(시험 생성은 `trial resume`)가 그 요청만 다시 확인합니다. 만들어진 것이 없다고 직접 확인했을 때만 `--new`로 새로 만듭니다(요금이 다시 나올 수 있습니다).
- 시험 생성은 서버가 완료를 저장하지 못해도 파일을 받을 수 있습니다. 그때는 종료 코드가 0이어도 요청 기록이 남고(`requestId`), 다음 실행이 6에서 멈춥니다.
- 파일은 같은 폴더의 임시 파일에 받아 길이와 형식을 확인한 뒤 게시합니다. 이미 있는 파일은 `--overwrite`가 있을 때만 바꾸고, 심볼릭 링크에는 쓰지 않습니다. Gemini는 `.wav`, 나머지는 `.mp3`입니다.
- 새 파일의 권한은 소유자만 읽고 쓰는 0600입니다. `--overwrite`는 바꾸는 파일의 권한을 그대로 잇습니다.
- `studio`는 웹과 같이 모델이 받지 않는 태그(`[laughs]`, `<sigh>` 모양)를 빼고 보내며 뺀 수를 stderr에 알립니다. 길이는 빼기 전 글로 재고, 빼고 나서 빈 글이면 2입니다. `[속보]` 같은 한글 괄호 글은 그대로 둡니다. 시험 생성은 원문 그대로 보냅니다.
- 요청 기록은 세션 폴더의 `requests.json`(0600)에 주소·요청 ID·공급자·시각·종류만 둡니다. 대본과 쿠키는 두지 않습니다.

## 문단 묶음

```bash
omni-tts scripts show SCRIPT_ID --out 작업.json      # 문단·성우·쉼이 든 작업 JSON
omni-tts studio plan --work 작업.json
mkdir 문단 && omni-tts studio batch --work 작업.json --out-dir 문단
omni-tts studio batch --script-id SCRIPT_ID --out-dir 문단 --only 1,3-5 --dry-run
omni-tts studio join --work 작업.json --out 내레이션.wav --srt 내레이션.srt
```

- 입력은 작업 JSON(`--work`)이나 대본 보관함(`--script-id`)입니다. 문단의 성우(문단 → 화자 → 기본), 숫자 교정, 태그 빼기는 웹과 같습니다. 문단 번호는 빈 문단도 세고 `--only`로 고릅니다.
- `plan`과 `--dry-run`은 상태와 예상 사용량, 검수하지 않은 숫자만 봅니다. `batch`는 무료 모델뿐이 아니면 한 번 확인을 받고 문단마다 생성을 한 번씩 차례로 보냅니다.
- 성우 없음·이용 불가·글자 수 초과인 문단이 하나라도 있으면(저장된 문단은 빼고) 번호와 이유를 모두 보이고 2입니다(code `BLOCKED`). 만들지 않습니다.
- 처리 여부를 모르는 문단이 있으면 확인을 묻기 전에 만들지 않고 6입니다(번호와 요청 ID). 같은 명령이나 `studio resume`이 완료를 확인하면 이어 갑니다. `--retry-unconfirmed`는 그 문단만 새로 만들며 요금이 다시 나올 수 있습니다. 완료된 문단을 다시 만드는 길은 `studio generate --new`뿐입니다.
- 실패하면 그 문단에서 멈추고 끝낸 문단의 파일은 남습니다. 같은 명령을 다시 실행하면 저장된 결과를 쓰고 남은 문단만 다시 확인받아 만듭니다.
- 파일은 `DIR/001.mp3`(Gemini는 `.wav`)이고 폴더는 미리 있어야 합니다. 진행 파일 `DIR/omni-tts-result.json`의 결과 ID와 크기가 같은 파일은 그대로 두고, 다른 파일이 있으면 `--overwrite`가 필요합니다. 다른 작업실의 진행 파일이나 링크면 2입니다.
- 첫 생성 때 웹의 최근 대본에 한 번 남깁니다. 실패해도 만들기는 계속합니다.
- `join`은 고른 문단이 모두 저장돼 있어야 하고(아니면 4), PATH의 `ffmpeg`, 없으면 macOS `afconvert`로 소리를 풀어 앞뒤 무음을 자르고 쉼을 넣습니다. 결과는 44.1kHz 16비트 모노 WAV입니다. 도구가 없거나 실패하면 7이고 파일을 만들지 않습니다.

## 자동 태그와 숫자

```bash
omni-tts studio autotag --work 작업.json --out 태그.json --dry-run
omni-tts studio autotag --work 작업.json --out 태그.json
omni-tts numbers check --work 작업.json
omni-tts numbers apply --work 작업.json --out 교정.json --certain
omni-tts numbers apply --input 대본.txt --out 발음용.txt --certain --decisions 결정.json
omni-tts scripts save SCRIPT_ID --version 2 --work 교정.json
```

- 자동 태그는 유료 텍스트 호출입니다. 문단을 묶음(50문단·2,000자까지)으로 나눠 보내고 서버가 묶음당 최대 4회(OpenAI 3, Gemini 1)를 부릅니다. CLI는 다시 부르지 않습니다.
- 묶음 하나가 실패하거나 `Ctrl+C`를 누르면 멈춥니다. 앞에서 받은 묶음이 있으면 적용한 작업 JSON을 `--out`에 두고 이어 가는 명령을 stderr에 알립니다. 첫 묶음이 실패하면 파일이 없습니다.
- 이미 만든 문단의 대본·설정이 바뀌면 `remake`에 번호가 나옵니다.
- 숫자 검수의 `--input` 글은 문단 하나로 보고 발음용 대본을 글로 씁니다. 작업은 교정 결정(`fixes`)이 든 작업 JSON을 씁니다. `--decisions`의 항목은 `numbers check --json`의 `paragraph`·`start`·`original`과 정확히 맞아야 합니다(아니면 2).

## 드라마

```bash
omni-tts drama generate --input 장면.json --out 장면.wav --dry-run
omni-tts drama generate --input 장면.txt --voice 민수=fish_audio:VOICE_ID --out 장면.wav
omni-tts drama list
mkdir 줄 && omni-tts drama split RESULT_ID --out-dir 줄
omni-tts drama read --input 읽기.json --out-dir 줄 --join 읽기.wav
omni-tts drama autotag --input 장면.json --out 태그.json
```

```json
{
  "version": 1,
  "sceneName": "재회",
  "speakers": [
    { "name": "민수", "voice": "fish_audio:VOICE_ID" },
    { "name": "영희", "voice": "typecast:VOICE_ID", "presetId": "PRESET_ID" }
  ],
  "lines": [
    { "speaker": 0, "direction": "with bright eager excitement", "text": "왔어?" },
    { "speaker": 1, "text": "응.", "feel": { "typecast": { "emotion": "happy", "intensity": 1.5 } } }
  ],
  "model": "s2.1-pro",
  "settings": { "speed": 1, "temperature": 0.7 }
}
```

- `speaker`는 0부터 세는 화자 번호입니다. `sceneName`·`direction`·`model`·`settings`·`voice`는 없어도 됩니다. `presetId`와 `feel`은 읽기에서만 쓰고 장면은 무시합니다. 화자 4명, 줄 50개까지이고, 모르는 칸과 잘못된 줄은 번호를 모두 알리고 2입니다.
- `generate`의 화자 성우는 보관함에 담은 Fish Audio 성우여야 합니다(담지 않았거나 이용 불가면 4, 다른 공급자면 2). 쓰지 않는 화자는 빼고 보냅니다. `.txt`는 웹 붙여 넣기와 같은 `이름: 대사` 줄이고 화자 성우를 `--voice 이름=REF`로 줍니다. 이름이 없는 글의 화자 이름은 `화자 1`입니다.
- 같은 장면(정리한 글·성우·모델·설정)의 저장된 테이크가 있으면 만들지 않고 받습니다. `--new`만 새 테이크를 만듭니다. 확인과 복구(6, `drama resume`)는 음성 만들기와 같습니다.
- `split`은 최근 20개 안의 완료된 테이크 가운데 줄 구간 수가 줄 수와 같은 것만 됩니다(아니면 4와 이유). 파일은 `001-화자.wav`이고, 막힌 경로가 하나라도 있으면 파일을 만들지 않습니다.
- `read`는 줄마다 시험 생성입니다. 다섯 공급자 성우와 프리셋을 받고, 성우 없음·이용 불가, 프리셋 이용 불가, 보낼 글 200자 초과, 태그를 빼면 빈 줄은 번호를 모두 알리고 2입니다. 같은 줄은 한 번만 만듭니다. 확인·이어 하기·진행 파일·`--retry-unconfirmed`는 문단 묶음과 같고, 처리 여부는 이 컴퓨터의 요청 기록으로만 봅니다(`trial resume`으로 확인). 서버 저장을 확인하지 못한 줄은 파일을 두고 6으로 멈춥니다.
- `--join`은 줄을 0.3초 쉼으로 잇습니다. 도구(`ffmpeg`·`afconvert`)와 경로는 만들기 전에 봅니다.
- `autotag`는 화자가 모두 Fish Audio면 장면으로, 아니면 읽기로 한 번 부릅니다(서버가 텍스트 호출을 최대 4회). 실패하거나 `Ctrl+C`를 누르면 파일이 없고 다시 부르지 않습니다. 이미 만든 소리가 있는 바뀐 줄은 `remake`에 나옵니다.

## 종료 코드

| 코드 | 뜻 |
|---|---|
| 0 | 성공 |
| 2 | 입력·확인 필요(옵션, 대본, `--out` 경로, 요금·지우기·설정 손실 확인, 취소, 같은 이름, 판 충돌) |
| 3 | 로그인·소유자 |
| 4 | 찾을 수 없음·이용 불가(성우, 채널, 분류, 프리셋, 대본, 결과, 결합할 문단) |
| 5 | 공급자·서비스 실패나 제한 |
| 6 | 처리 여부 미확인(음성은 다시 만들지 말고 `studio resume`·`trial resume`·`drama resume`. `requestId`도 `resultId`도 없으면 끊긴 변경 명령이니 목록이나 `show`로 확인. `resultId`만 있으면 같은 요청의 처리 여부를 모르는 것이니 다시 만들지 않고 직접 확인) |
| 7 | 로컬 파일 실패(세션·요청 기록, 내려받기와 게시, 소리 풀기) |

하드 링크를 못 쓰는 볼륨(exFAT 등)에서는 새 파일 게시가 7로 끝납니다. 다른 폴더로 받거나 `--overwrite`를 쓰세요.

## JSON

`--json`은 stdout에 한 건만 씁니다. 안내와 확인 질문은 stderr로 갑니다.

```text
음성 성공       { origin, source: "created"|"saved"|"resumed", result: { id, createdAt, usage, bytes }, out, mime, requestId? }
실패            { code, message, reason?, retryAt?, requestId?, resultId?, paragraph?, paragraphs?, line?, lines?, out?, remaining? }
                같은 이름·판 충돌은 code "CONFLICT", reason "duplicate_name"|"stale"
studio plan     { origin, dryRun, paragraphs: [{ n, status, resultId?, requestId? }], make, saved, check, blank, estimate, unreviewed, unreviewedText, needsConfirm }
                status는 make, saved, check, blank. batch --dry-run도 같다
studio batch    { origin, outDir, made, paragraphs: [{ n, source: "created"|"saved"|"resumed"|"kept", resultId, bytes, mime, out }] }
studio join     { origin, out, srt, bytes, seconds, paragraphs: [{ n, resultId, start, end }] }
studio autotag  { origin, out, paragraphs, changed: [{ n, fields, remake }], skipped, remake }
                --dry-run { origin, dryRun, paragraphs, skipped, batches, maxCalls, needsConfirm }
numbers         check { items: [{ paragraph, start, end, original, kind, readings, needsCheck, reason?, decision }], unreviewed, needsCheck }
                apply { out, decided, added, unreviewed }
drama generate  음성 성공과 같다(download는 최근 20개 밖이면 createdAt·usage가 null). dry-run의 request는 { model, speakers, lines, characters }
drama list      { origin, takes: [{ id, status, request, segments, split, usage, bytes, createdAt }] }
drama split     { origin, resultId, outDir, lines: [{ n, speaker, out, bytes }] }
drama read      { origin, outDir, made, lines: [{ n, source, resultId, bytes, mime, out }], join: { out, bytes, seconds, lines } | null }
                --dry-run { origin, dryRun, lines: [{ n, status, resultId?, requestId? }], make, saved, check, estimate, needsConfirm }
drama autotag   { origin, out, mode: "scene"|"read", lines, changed: [{ n, fields }], skipped, remake }
dry-run         { origin, dryRun, request: { provider, voiceId, model, characters }, saved, requestId, estimate, rateKnown, needsConfirm }
resume(ID 없음) { origin, requests: [{ requestId, provider, createdAt }] }
casting search  { origin, provider, source, voices: [{ …, ref }], next, total, totalExact, windowLimited, fetchedAt, stale }
casting refresh { origin, provider, retryAt }
casting sample  { origin, ref, index, out, mime, bytes }  공급자의 샘플 주소가 아니면 받지 않고 5(code "SAMPLE_BLOCKED")
trial list      { origin, results: [{ id, request, usage, createdAt }] }
voices          list { origin, voices }  show·save·update { origin, voice: { …, ref } }  check { origin, changed, voices }
channels        list { origin, channels: [{ …, voiceCount }] }  create·update { origin, channel }
categories      list { origin, categories }  create·update { origin, category }
types           list { origin, types }  create·update { origin, type }
presets         list { origin, presets }  그 밖 { origin, preset: { id, name, ref, provider, settings, voice, channelId, channelDefault, … } }
scripts         list { origin, scripts, next }  show { origin, script: { id, title, version, work, … } }
                show --out { origin, script, out, bytes }  create·duplicate { origin, script }
                save { origin, script: { id, title, version }, lost }  update { origin, script }
remove          { origin, removed: ID }
```

에이전트가 쓸 때의 순서는 [SKILL.md](SKILL.md), 테스트 계획과 결과는 [tests/TEST.md](tests/TEST.md)에 있습니다.
