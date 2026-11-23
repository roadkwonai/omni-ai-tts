# Omni AI TTS CLI

저장소에서 다음 명령으로 빌드하고 로그인합니다. 로그인할 때 터미널에 이메일과 비밀번호를 입력합니다.

```bash
pnpm --filter @tts-pilot-app/cli build
pnpm --filter @tts-pilot-app/cli run cli auth login --url 'https://작업실주소'
pnpm --silent --filter @tts-pilot-app/cli run cli voices list --json
```

다른 pnpm 프로젝트에서는 `pnpm link /path/to/repo/apps/cli`로 로컬 링크한 뒤 `pnpm exec omni-tts --help`로 실행할 수 있습니다. 저장소의 타입스크립트 모듈을 그대로 읽으므로 Node 24 이상이 필요합니다(Node 26에서 확인했습니다).

macOS에서는 기본 제공되는 `/usr/bin/lockf`로 세션 저장을 잠급니다. Linux의 `/usr/bin/flock` 경로는 구현 예정이며 이 환경에서 검증하지 않았습니다.

## 명령

모든 명령은 `--url URL`과 `--json`을 받습니다. `REF`는 `공급자:성우 ID`이고 공급자는 `typecast`, `elevenlabs`, `fish_audio`, `airy`, `gemini`입니다. 요금이 나올 수 있는 명령은 `studio generate`와 `trial generate`뿐입니다. 옵션은 `omni-tts --help`에 모두 있습니다.

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

- 요금이 나올 수 있는 명령은 `studio generate`와 `trial generate`뿐입니다. 터미널에서 성우·모델·글자 수·예상 사용량을 보고 `y`를 눌러야 만듭니다. 비대화 실행이나 `--input -`에서는 `--yes`가 필요합니다. Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다.
- 같은 성우·설정·대본의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다(`source: "saved"`). 자동으로 다시 만들지 않습니다.
- 응답을 받지 못하면 종료 코드 6이고 요청 기록이 남습니다. 같은 명령이나 `studio resume REQUEST_ID`(시험 생성은 `trial resume`)가 그 요청만 다시 확인합니다. 만들어진 것이 없다고 직접 확인했을 때만 `--new`로 새로 만듭니다(요금이 다시 나올 수 있습니다).
- 시험 생성은 서버가 완료를 저장하지 못해도 파일을 받을 수 있습니다. 그때는 종료 코드가 0이어도 요청 기록이 남고(`requestId`), 다음 실행이 6에서 멈춥니다.
- 파일은 같은 폴더의 임시 파일에 받아 길이와 형식을 확인한 뒤 게시합니다. 이미 있는 파일은 `--overwrite`가 있을 때만 바꾸고, 심볼릭 링크에는 쓰지 않습니다. Gemini는 `.wav`, 나머지는 `.mp3`입니다.
- 새 파일의 권한은 소유자만 읽고 쓰는 0600입니다. `--overwrite`는 바꾸는 파일의 권한을 그대로 잇습니다.
- 대본의 대괄호 태그는 원문 그대로 보냅니다. 웹은 모델이 받지 않는 태그를 빼므로, 태그가 든 대본은 웹과 다른 결과로 다시 만들어질 수 있습니다.
- 요청 기록은 세션 폴더의 `requests.json`(0600)에 주소·요청 ID·공급자·시각·종류만 둡니다. 대본과 쿠키는 두지 않습니다.

## 종료 코드

| 코드 | 뜻 |
|---|---|
| 0 | 성공 |
| 2 | 입력·확인 필요(옵션, 대본, `--out` 경로, 요금·지우기·설정 손실 확인, 취소, 같은 이름, 판 충돌) |
| 3 | 로그인·소유자 |
| 4 | 찾을 수 없음·이용 불가(성우, 채널, 분류, 프리셋, 대본, 결과) |
| 5 | 공급자·서비스 실패나 제한 |
| 6 | 처리 여부 미확인(음성은 다시 만들지 말고 `studio resume`·`trial resume`. `requestId`도 `resultId`도 없으면 끊긴 변경 명령이니 목록이나 `show`로 확인. `resultId`만 있으면 같은 요청의 처리 여부를 모르는 것이니 다시 만들지 않고 직접 확인) |
| 7 | 로컬 파일 실패(세션·요청 기록, 내려받기와 게시) |

하드 링크를 못 쓰는 볼륨(exFAT 등)에서는 새 파일 게시가 7로 끝납니다. 다른 폴더로 받거나 `--overwrite`를 쓰세요.

## JSON

`--json`은 stdout에 한 건만 씁니다. 안내와 확인 질문은 stderr로 갑니다.

```text
음성 성공       { origin, source: "created"|"saved"|"resumed", result: { id, createdAt, usage, bytes }, out, mime, requestId? }
실패            { code, message, reason?, retryAt?, requestId?, resultId? }
                같은 이름·판 충돌은 code "CONFLICT", reason "duplicate_name"|"stale"
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
