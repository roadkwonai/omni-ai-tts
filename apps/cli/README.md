# Omni AI TTS CLI

터미널에서 작업실(TTS Pilot)의 성우를 고르고, 한국어 대본으로 음성을 만들어 파일로 받는 명령입니다. 위에서 아래로 따라 하면 설치부터 드라마와 클론까지 한 번씩 해 볼 수 있습니다(macOS). 옵션 전체는 `omni-tts --help`에 있습니다.

`REF`는 성우를 가리키는 `공급자:성우 ID`입니다. 공급자는 `typecast`, `elevenlabs`, `fish_audio`, `airy`, `gemini`입니다. 요금이 나올 수 있는 명령은 `studio generate`, `studio batch`, `studio autotag`, `trial generate`, `drama generate`, `drama read`, `drama autotag`, `clones create`뿐이고, 만들기 전에 터미널에서 `y`를 눌러야 합니다.

## 1. 설치

Node 24 이상과 pnpm이 필요합니다(Node 26에서 확인했습니다). 저장소의 의존 설치(`pnpm install`)를 마친 뒤 저장소 루트에서 빌드합니다. 실행 파일 하나(`apps/cli/dist/cli.js`)가 생기고 설치 의존이 없습니다.

```bash
pnpm --filter @tts-pilot-app/cli build
```

둘 가운데 하나로 `omni-tts`를 준비합니다.

저장소에서 바로 실행하려면(지금 터미널에서만):

```bash
alias omni-tts="node $PWD/apps/cli/dist/cli.js"
```

다른 곳에 설치하려면(저장소를 옮겨도 동작합니다):

```bash
mkdir -p "$HOME/omni-tts"
(cd apps/cli && pnpm pack --pack-destination "$HOME/omni-tts")
(cd "$HOME/omni-tts" && echo '{"private":true}' > package.json && npm install ./tts-pilot-app-cli-0.1.0.tgz)
export PATH="$HOME/omni-tts/node_modules/.bin:$PATH"
```

확인합니다.

```bash
omni-tts --help
```

문단·드라마를 한 파일로 잇는 명령은 PATH의 `ffmpeg`를 쓰고, 없으면 macOS에 있는 `afconvert`를 씁니다. 세션 파일은 macOS 기본 `/usr/bin/lockf`로 잠급니다. Linux(`/usr/bin/flock`)는 확인하지 않았습니다.

## 2. 로그인

브라우저에서 여는 작업실 주소를 그대로 씁니다(로컬이면 `http://127.0.0.1:포트`). 이메일과 비밀번호는 명령에 적지 않고 터미널이 물을 때 입력합니다. 비밀번호는 보이지 않습니다.

```bash
omni-tts auth login --url 'https://작업실주소'
omni-tts auth status
```

세션은 `~/.config/omni-tts`(0700)에 둡니다. 다른 폴더를 쓰려면 `OMNI_TTS_CONFIG_DIR`을 줍니다. 이미 있는 폴더는 본인 소유의 0700이어야 하고(`chmod 700 폴더`), 아니면 7과 함께 파일과 이유를 알립니다. 작업실이 여럿이면 명령마다 `--url`로 고릅니다. 끝나면 `omni-tts auth logout`입니다.

따라 하기용 폴더를 하나 만들고 그 안에서 이어 갑니다.

```bash
mkdir -p "$HOME/omni-tts-연습" && cd "$HOME/omni-tts-연습"
```

## 3. 성우 고르기

찾기·샘플은 요금이 없습니다.

```bash
omni-tts providers status
omni-tts casting search --provider typecast --gender female
```

목록의 `공급자:성우 ID` 하나를 복사해 넣습니다.

```bash
REF='typecast:여기에-성우-ID'
omni-tts casting sample "$REF" --out 샘플.wav
omni-tts trial generate --voice "$REF" --text "안녕하세요. 목소리를 확인합니다." --out 시험.mp3 --dry-run
omni-tts trial generate --voice "$REF" --text "안녕하세요. 목소리를 확인합니다." --out 시험.mp3
omni-tts voices save "$REF" --favorite --memo "내레이션 후보"
omni-tts voices list --favorite
```

- 샘플 형식은 성우마다 다릅니다. 확장자가 맞지 않으면 맞는 확장자를 알려 줍니다. 샘플이 없는 성우도 있습니다.
- `--dry-run`은 만들지 않고 저장된 결과와 예상 사용량만 봅니다.
- 시험 생성은 200자까지이고 담지 않은 성우도 됩니다. Gemini는 `.wav`, 나머지는 `.mp3`입니다.
- 검색 조건은 공급자마다 다릅니다. ElevenLabs는 `--q 차분한 --use-case narration`처럼, Fish Audio는 `--q`, `--tag`로 찾습니다. ElevenLabs·Fish Audio에서 찾은 성우는 `voices.json`(0600)에 24시간, 주소마다 500명까지 두고 다른 명령에 `REF`로 쓸 수 있습니다.

담은 성우는 웹 보관함과 같은 조건으로 고릅니다.

```bash
omni-tts voices list --gender female --age young --sort name
omni-tts voices list --q 후보 --content narration --content news
omni-tts voices list --preset
```

- 같은 조건을 여러 번 주면 하나라도 맞는 성우, 다른 조건끼리는 모두 맞는 성우입니다. `--favorite`, `--frequent`, `--preset`(프리셋에 쓰는 성우)을 함께 주면 모두 맞는 성우만 남습니다.
- `--q`는 이름·영어 이름·메모를 찾습니다. `--category-id`·`--type-id`는 `categories list`·`types list`의 ID입니다.
- 키는 `--gender` `female|male|neutral`, `--age` `child|teenager|young|middle|old`, `--content` `narration|conversation|education|ads|social|entertainment|character|news|podcast`입니다. 모르는 키를 주면 2와 함께 쓸 수 있는 키를 모두 보입니다(`--mood`의 키도 그렇게 봅니다).
- `--sort`는 `recent`(담은 순, 기본), `used`(최근 쓴 순), `count`(사용 횟수), `name`(이름), `popular`(공급자 인기)입니다.

## 4. 한 문단 만들기

```bash
cat > 대본.txt <<'EOF'
안녕하세요. 오늘은 터미널에서 만든 목소리를 들려 드립니다.
EOF
omni-tts studio generate --voice "$REF" --input 대본.txt --out 내레이션.mp3 --dry-run
omni-tts studio generate --voice "$REF" --input 대본.txt --out 내레이션.mp3
```

`--voice`는 보관함에 담은 성우입니다(3번에서 담았습니다). 성우와 설정을 프리셋으로 두고 쓸 수도 있습니다.

```bash
omni-tts presets create --name "내레이션" --voice "$REF"
omni-tts presets list
PRESET_ID='여기에-프리셋-ID'
omni-tts studio generate --preset-id "$PRESET_ID" --input 대본.txt --out 프리셋.mp3
```

- 터미널에서 성우·모델·글자 수·예상 사용량을 보고 `y`를 눌러야 만듭니다. 비대화 실행이나 `--input -`(stdin)에서는 `--yes`가 필요합니다. Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다.
- 같은 성우·설정·대본의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다(`source: "saved"`). 자동으로 다시 만들지 않습니다. 결과 ID로도 받습니다: `omni-tts studio download RESULT_ID --out 파일.mp3`.
- 작업실은 결과를 마지막으로 듣거나 받은 날부터 30일 보관합니다. 그 뒤에는 다시 만들어야 하니 파일로 받아 두세요.
- `-`로 시작하는 값은 `--text=-5도`, `--memo=-후보`처럼 `=`로 붙입니다.
- 파일은 같은 폴더의 임시 파일에 받아 길이와 형식을 확인한 뒤 게시합니다. 이미 있는 파일은 `--overwrite`가 있을 때만 바꾸고, 심볼릭 링크에는 쓰지 않습니다. 새 파일의 권한은 0600이고 `--overwrite`는 바꾸는 파일의 권한을 잇습니다.
- `studio`는 웹과 같이 모델이 받지 않는 태그(`[laughs]`, `<sigh>` 모양)를 빼고 보내며 뺀 수를 알립니다. `[속보]` 같은 한글 괄호 글은 그대로 둡니다. 시험 생성은 원문 그대로 보냅니다.
- 프리셋 설정 파일(`--settings`)은 공급자 설정 JSON의 일부이고 나머지는 기본값입니다. 모르는 칸과 틀린 값은 2입니다.

## 5. 문단 묶음과 결합

대본을 빈 줄로 나눠 작업실에 저장하고, 문단마다 만들어 한 파일로 잇습니다.

```bash
cat > 긴대본.txt <<'EOF'
첫 문단입니다. 사과 3개를 샀습니다.

둘째 문단입니다. 2026년 11월의 이야기입니다.
EOF
omni-tts scripts create --title "연습 1화" --input 긴대본.txt --voice "$REF"
SCRIPT_ID='여기에-대본-ID'
omni-tts studio plan --script-id "$SCRIPT_ID"
mkdir 문단
omni-tts studio batch --script-id "$SCRIPT_ID" --out-dir 문단
omni-tts studio join --script-id "$SCRIPT_ID" --out 한파일.wav --srt 한파일.srt
```

- 입력은 대본 보관함(`--script-id`)이나 작업 JSON(`--work`)입니다. 작업 JSON은 `scripts show ID --out 작업.json`이 만듭니다. 문단의 성우(문단 → 화자 → 기본), 숫자 교정, 태그 빼기는 웹과 같습니다. `--only 1,3-5`로 문단을 고르고 빈 문단도 번호를 셉니다.
- `plan`과 `--dry-run`은 상태와 예상 사용량, 검수하지 않은 숫자만 봅니다. `batch`는 한 번 확인을 받고(무료 모델뿐이면 묻지 않음) 문단마다 한 번씩 차례로 만듭니다.
- Fish Audio 무료 모델이 끝난 뒤에도 무료로 만든 결과가 있는 문단(과 `drama read`의 줄)은 그것을 쓰고, 없는 것만 유료 모델로 만듭니다.
- 실패하면 그 문단에서 멈추고 끝낸 파일은 남습니다. 같은 명령을 다시 실행하면 저장된 문단은 그대로 쓰고 남은 문단만 다시 확인받아 만듭니다.
- 성우 없음·이용 불가·글자 수 초과인 문단이 하나라도 있으면 번호와 이유를 모두 보이고 2입니다(code `BLOCKED`). 처리 여부를 모르는 문단이 있으면 만들지 않고 6입니다.
- 파일은 `문단/001.mp3`(Gemini는 `.wav`)이고 폴더는 미리 있어야 합니다. 진행 파일 `omni-tts-result.json`의 결과와 같은 파일은 그대로 두고, 다른 파일이 있으면 `--overwrite`가 필요합니다. 다른 작업실의 진행 파일이나 링크면 2입니다.
- 첫 생성 때 웹의 최근 대본에 한 번 남깁니다. 실패해도 만들기는 계속합니다.
- `join`은 고른 문단이 모두 저장돼 있어야 하고(아니면 4) 앞뒤 무음을 자르고 쉼을 넣어 44.1kHz 16비트 모노 WAV로 잇습니다. 도구가 없거나 실패하면 7이고 파일이 없습니다.

## 6. 숫자 검수와 자동 태그

숫자 검수는 요금이 없고, 자동 태그는 유료 텍스트 호출입니다. 대본이 바뀐 문단은 다시 만들어야 하므로 실제 작업에서는 5번의 `batch`보다 먼저 합니다.

```bash
omni-tts scripts show "$SCRIPT_ID" --out 작업.json
omni-tts numbers check --work 작업.json
omni-tts numbers apply --work 작업.json --out 교정.json --certain
omni-tts studio autotag --work 교정.json --out 태그.json --dry-run
omni-tts studio autotag --work 교정.json --out 태그.json
omni-tts scripts save "$SCRIPT_ID" --version 1 --work 태그.json
```

- `scripts save`의 `--version`은 `scripts show`에 나온 판입니다. 그사이 바뀌었으면 2(`reason: "stale"`)이고 `--force`만 판 없이 덮어씁니다.
- `--certain`은 확실한 제안을 모두 적용합니다. 하나씩 고르려면 `--decisions 결정.json`을 씁니다. 항목은 `numbers check --json`의 `paragraph`·`start`·`original`과 정확히 맞아야 합니다(아니면 2).
- 글 파일은 `numbers apply --input 대본.txt --out 발음용.txt --certain`처럼 문단 하나로 봅니다.
- 자동 태그는 문단을 묶음(50문단·2,000자까지)으로 보내고 서버가 묶음당 최대 4회(OpenAI 3, Gemini 1)를 부릅니다. CLI는 다시 부르지 않습니다. 묶음 하나가 실패하거나 `Ctrl+C`를 누르면 멈추고, 앞에서 받은 묶음은 `--out`에 두며 이어 가는 명령을 알립니다. 이미 만든 문단이 바뀌면 `remake`에 번호가 나옵니다.

## 7. 드라마

장면(`drama generate`)은 보관함에 담은 Fish Audio 성우로 한 번에 만들고, 읽기(`drama read`)는 다섯 공급자 성우로 줄마다 만듭니다.

```bash
omni-tts casting search --provider fish_audio --q 차분한
FISH='fish_audio:여기에-성우-ID'
omni-tts voices save "$FISH"
cat > 장면.json <<EOF
{
  "version": 1,
  "sceneName": "재회",
  "gap": 0.5,
  "speakers": [
    { "name": "민수", "voice": "$FISH" },
    { "name": "영희", "voice": "$FISH" }
  ],
  "lines": [
    { "speaker": 0, "direction": "with bright eager excitement", "text": "왔어?", "gap": 1.2 },
    { "speaker": 1, "text": "응, 조금 늦었지." }
  ],
  "model": "s2.1-pro",
  "settings": { "speed": 1, "temperature": 0.7 }
}
EOF
omni-tts drama generate --input 장면.json --out 장면.wav --dry-run
omni-tts drama generate --input 장면.json --out 장면.wav
omni-tts drama list
TAKE_ID='여기에-결과-ID'
mkdir 줄 읽기
omni-tts drama split "$TAKE_ID" --out-dir 줄 --join 장면쉼.wav --input 장면.json
omni-tts drama read --input 장면.json --out-dir 읽기 --join 읽기.wav
omni-tts drama autotag --input 장면.json --out 태그장면.json
```

- `speaker`는 0부터 세는 화자 번호입니다. `sceneName`·`gap`·`direction`·`model`·`settings`·`voice`는 없어도 됩니다. 화자에 `presetId`, 줄에 `feel`(예: `{ "typecast": { "emotion": "happy", "intensity": 1.5 } }`)을 줄 수 있고 읽기에서만 씁니다. 화자 4명, 줄 50개까지이고, 모르는 칸과 잘못된 줄은 번호를 모두 알리고 2입니다.
- 쉼(`gap`)은 초이고 0~5의 0.1 단위입니다(아니면 2). 줄의 `gap`은 그 줄 뒤의 쉼이고, 없으면 장면의 `gap`, 둘 다 없으면 0.3초입니다. 잇는 데만 쓰고 공급자에 보내지 않으므로 쉼을 바꿔도 다시 만들지 않습니다. 자동 태그는 쉼을 그대로 옮깁니다.
- `generate`는 성우가 보관함에 없거나 이용 불가면 4, 다른 공급자면 2입니다. 쓰지 않는 화자는 빼고 보냅니다. `.txt`는 웹 붙여 넣기와 같은 `이름: 대사` 줄이고 성우를 `--voice 이름=REF`로 줍니다(`omni-tts drama generate --input 장면.txt --voice "민수=$FISH" --out 장면.wav`).
- 같은 장면(글·성우·모델·설정)의 저장된 테이크가 있으면 만들지 않고 받습니다. `--new`만 새 테이크를 만듭니다.
- `split`은 최근 20개 안의 완료된 테이크 가운데 줄 구간 수가 줄 수와 같은 것만 됩니다(아니면 4와 이유). 파일은 `001-화자.wav`입니다. `--join`은 조각의 앞뒤 무음을 줄이고 쉼을 넣어 한 WAV로도 잇습니다. 쉼은 `--input` 장면 파일의 값이고(줄 수가 다르면 2) 파일을 주지 않으면 0.3초입니다. 막힌 경로나 실패가 있으면 이번에 만든 파일을 남기지 않습니다.
- `read`는 줄마다 시험 생성(200자까지)입니다. 같은 줄은 한 번만 만듭니다. 확인·이어 하기·진행 파일은 문단 묶음과 같고, 처리 여부는 이 컴퓨터의 요청 기록으로만 봅니다. 막는 줄은 번호를 모두 알리고 2입니다. 결합 도구와 경로는 만들기 전에 봅니다.
- `autotag`는 화자가 모두 Fish Audio면 장면으로, 아니면 읽기로 한 번 부릅니다(서버가 텍스트 호출을 최대 4회). 실패하거나 `Ctrl+C`를 누르면 파일이 없고 다시 부르지 않습니다.

## 8. 내 보이스(클론)

본인 목소리 녹음으로 클론을 만들어 다른 성우처럼 씁니다. 공급자 계정에 클론이 남고, 공급자 문서에 클론 요금 정보가 없습니다.

먼저 녹음을 24kHz 모노 16비트 WAV로 바꿉니다(CLI는 변환하지 않습니다). 둘 가운데 하나를 씁니다.

```bash
ffmpeg -i 녹음.m4a -ac 1 -ar 24000 -c:a pcm_s16le 원본.wav
afconvert -f WAVE -d LEI16@24000 -c 1 녹음.m4a 원본.wav
```

Fish Audio는 10~60초 원본 하나, Gemini는 10~30초 원본과 동의 녹음(1~20초)이 필요합니다. 동의 녹음에서는 이 문장을 그대로 읽습니다: "나는 이 음성의 소유자이며 구글이 이 음성을 사용하여 음성 합성 모델을 생성할 것을 허용합니다."

```bash
omni-tts clones create --provider fish_audio --name "내 목소리" --source 원본.wav
omni-tts clones create --provider fish_audio --name "내 목소리" --source 원본.wav --consent --dry-run
omni-tts clones create --provider fish_audio --name "내 목소리" --source 원본.wav --consent
omni-tts clones list
CLONE_ID='여기에-클론-ID'
omni-tts clones check "$CLONE_ID"
MY='fish_audio:여기에-성우-ID'
omni-tts trial generate --voice "$MY" --text "제 목소리로 만든 문장입니다." --out 내목소리.mp3
omni-tts clones remove "$CLONE_ID"
```

Gemini는 동의 녹음을 더합니다.

```bash
omni-tts clones create --provider gemini --name "내 목소리" --source 원본.wav --consent-audio 동의.wav --consent
```

- 첫 명령은 `--consent`가 없어 2로 끝나고 동의 문장과 보낼 것·가는 곳·보관·되돌리기·요금 정보를 보여 줍니다. `--consent`는 본인 목소리이고 그 공급자에 보내는 데 동의한다는 뜻이며 `--yes`가 대신하지 않습니다. 만들기는 언제나 확인(터미널의 `y` 또는 `--yes`)도 받습니다.
- 파일은 한 번만 읽고, 소리만 새 WAV 머리로 싸서 보냅니다. 제목 같은 부가 정보는 나가지 않습니다. 원본 3,000,000바이트, 동의 녹음 1,000,000바이트까지이고, 형식·길이가 틀리거나 소리가 거의 없으면 2입니다. 요청 기록에는 파일도 이름도 두지 않습니다.
- 같은 공급자에 같은 이름의 클론이 있으면 2(code `CONFLICT`)입니다. 보내는 중이면 6이고 끝난 뒤 `clones list`로 봅니다. 처리 여부 미확인이거나 공급자 오류로 실패한 줄이면 6이고, 공급자 웹에서 확인하고 `clones remove`로 치운 뒤 다시 실행합니다. `--new`만 이 검사와 요청 기록을 건너뜁니다.
- 처리 중이면 `clones check`가 공급자에 한 번 확인합니다(요금 없음). 사용 가능하면 보관함에 담기고, 보관함에서 뺀 클론은 `clones save`로 다시 담습니다.
- `remove`는 공급자 계정에서도 지우고 되돌릴 수 없습니다. 공급자 id를 모르는 줄(처리 여부 미확인 등)은 줄만 지워집니다. 실패하면 줄의 실제 상태(그대로, 삭제 대기, 없음)를 알리고, 삭제 대기는 같은 명령으로 다시 시도합니다.

## 9. 끊겼을 때

`Ctrl+C`나 연결 끊김으로 응답을 받지 못하면 종료 코드 6이고 요청 기록이 남습니다. 다시 만들지 말고 먼저 확인합니다(요금 없음).

```bash
omni-tts studio resume
omni-tts trial resume
omni-tts drama resume
omni-tts clones resume
```

ID 없이 실행하면 남은 요청을 보입니다. 요청 ID를 주면 그 요청만 확인하고, `studio`·`trial`·`drama`는 `--out`을 주면 파일도 받습니다.

```bash
omni-tts studio resume REQUEST_ID --out 내레이션.mp3
```

- 같은 명령을 다시 실행해도 그 요청만 다시 확인합니다. 새로 보내지 않습니다.
- `--new`(`studio generate`, `trial generate`, `drama generate`, `clones create`)는 저장된 결과와 확인하지 못한 요청을 쓰지 않고 새로 만듭니다. 요금이 다시 나오거나 클론이 또 생길 수 있으니 만들어진 것이 없다고 직접 확인했을 때만 씁니다.
- `--retry-unconfirmed`(`studio batch`, `drama read`)는 처리 여부를 모르는 문단·줄만 새로 만듭니다. 요금이 다시 나올 수 있습니다. 이미 완료된 문단은 다시 만들지 않습니다.
- 종료 코드 7에 결과 ID가 있으면 음성은 만들어졌습니다. `studio download`, `trial download`, `drama download`로 받습니다.
- 시험 생성은 서버가 완료를 저장하지 못해도 파일을 받을 수 있습니다. 그때는 종료 코드가 0이어도 요청 기록이 남고(`requestId`), 다음 실행이 6에서 멈춥니다.
- 요청 기록은 세션 폴더의 `requests.json`(0600)에 주소·요청 ID·공급자·시각·종류만 둡니다. 대본·쿠키·오디오는 두지 않습니다.

## 10. 종료 코드

| 코드 | 뜻 |
|---|---|
| 0 | 성공 |
| 2 | 입력·확인 필요(옵션, 대본, `--out` 경로, 본인 동의, 요금·지우기·설정 손실 확인, 취소, 같은 이름, 판 충돌) |
| 3 | 로그인·소유자 |
| 4 | 찾을 수 없음·이용 불가(성우, 채널, 분류, 프리셋, 대본, 결과, 클론, 결합할 문단) |
| 5 | 공급자·서비스 실패나 제한 |
| 6 | 처리 여부 미확인. 다시 만들지 말고 9번을 따릅니다. `cloneId`가 있으면 `clones list`의 그 줄을 봅니다. `requestId`·`resultId`·`cloneId`가 모두 없으면 끊긴 변경 명령이니 목록이나 `show`로 확인합니다. `resultId`만 있으면 같은 요청의 처리 여부를 모르는 것이니 다시 만들지 않고 직접 확인합니다 |
| 7 | 로컬 파일 실패(세션·요청 기록, 내려받기와 게시, 소리 풀기) |

점검 화면이나 리다이렉트처럼 작업실이 아닌 곳의 응답을 받으면 관리 명령은 5, 요금이 나올 수 있거나 공급자에서 지우는 요청은 6입니다. 응답이 끊긴 변경 명령은 6입니다. 같은 폴더에 두 묶음을 함께 실행할 수 있지만, 같은 순간에 진행 파일을 쓰면 한 줄을 잃어 다음 실행에 `--overwrite`가 필요할 수 있습니다.

## 11. 웹과 다른 점

- 재생과 미리 듣기가 없습니다. 파일로 받아 듣습니다.
- 드라마 테이크 격자·비교, 줄마다 다른 테이크 고르기, zip 받기가 없습니다. `split`은 테이크 하나를 나눕니다.
- 숫자 검수에 Typecast AutoTag 참고 후보가 없습니다.
- 브라우저 녹음과 오디오 변환·편집이 없습니다. 클론 원본은 변환한 WAV 파일입니다.
- 대본·드라마의 화면 편집이 없습니다. 파일을 고쳐 저장합니다. 글(`--input`)은 빈 줄로만 문단을 나누고 화자 줄과 긴 글 자동 나누기를 하지 않습니다.
- `voices list`는 즐겨찾기·자주 사용·프리셋 보기를 함께 고를 수 있습니다(웹은 하나).
- 소리를 푸는 도구(ffmpeg·afconvert)가 브라우저와 달라 결합 파일이 웹과 샘플까지 같지는 않을 수 있습니다.

## 보관함·채널·분류 관리

```bash
omni-tts channels create --name 쇼츠 --link https://www.youtube.com/@channel
omni-tts types create --name 내레이션
omni-tts voices update "$REF" --channel-id CHANNEL_ID --classification-id TYPE_ID
omni-tts voices update "$REF" --channel-id none                  # 채널 연결만 비웁니다
omni-tts channels update CHANNEL_ID --name "쇼츠 본편"            # 메모와 주소는 그대로입니다
omni-tts channels remove CHANNEL_ID
omni-tts voices check
```

- 준 칸만 바꿉니다. `--memo ""`와 `--link ""`는 비우기입니다.
- `voices save`는 담거나(없으면) 준 칸을 바꿉니다. `voices update`는 담긴 성우만 바꾸고, 연결은 준 종류(채널 또는 분류)를 통째로 바꿉니다. 저장과 연결이 나뉜 두 호출이라 연결이 실패하면 앞의 변경은 남고 그 사실을 stderr에 알립니다.
- `categories`와 `types`는 자기 종류의 ID만 받습니다. 다른 종류의 ID는 4이고 바꾸지 않습니다.
- 지우기(`remove`)는 대상과 영향(연결된 성우 수, 쓰는 프리셋 수)을 stderr에 보이고 터미널에서 `y`를 받습니다. 비대화 실행에서는 `--yes`가 없으면 2이고 지우지 않습니다.
- 채널·분류·프리셋 고치기는 쓰기 직전에 지금 값을 읽어 합칩니다. 그사이 웹에서 바꾼 칸은 잃을 수 있습니다.
- `REF`는 보관함, `voices.json`, (Typecast·Airy·Gemini) 목록 순서로 찾습니다. 로그인과 로그아웃은 그 주소의 찾은 성우를 지웁니다.

## 프리셋 관리

```bash
omni-tts presets show "$PRESET_ID"
omni-tts presets overwrite "$PRESET_ID" --voice "$REF" --settings 설정.json
omni-tts presets update "$PRESET_ID" --name "쇼츠 2" --channel-id none
omni-tts presets duplicate "$PRESET_ID"
```

- 프리셋을 만들거나 덮어쓰면 그 성우를 보관함에 담습니다(웹과 같습니다). `presets create`에 설정 파일이 없으면 그 성우의 기본 설정입니다.
- 채널이 바뀌고 `--default`가 없으면 채널 기본 지정을 끄고 stderr에 알립니다.

## 대본 관리

```bash
omni-tts scripts list --q 연습
omni-tts scripts show "$SCRIPT_ID" --out 받은대본.txt
omni-tts scripts save "$SCRIPT_ID" --version 2 --input 받은대본.txt
omni-tts scripts remove "$SCRIPT_ID"
```

- 새 대본의 쉼은 0.5초이고 기본 성우는 `--voice`입니다. 웹은 담은 성우만 쓰므로 담지 않은 성우이면 stderr에 알립니다.
- `save --input`은 기본 성우·쉼·화자를 그대로 두고, 글이 같은 문단의 성우·쉼·화자·숫자 검수를 순서대로 잇습니다. 고치거나 자리를 바꾼 문단은 새 문단입니다. 설정이 있는 문단을 잃으면 수를 보이고 지우기와 같은 확인을 받습니다(`--input -`이면 터미널이어도 `--yes`가 필요합니다).
- `--work`는 문단·성우·쉼이 든 작업 JSON 전체입니다(3MiB까지 읽고 서버가 2MiB까지 받습니다).
- 문단 200개, 문단마다 10,000자 같은 상한은 서버가 보고 2로 알립니다. 최근 대본(`list --recent`)은 보고 지울 수만 있습니다.

## 명령 묶음

모든 명령은 `--url URL`과 `--json`을 받습니다.

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
| `clones` | `create`(요금 정보 없음), `list`, `check`, `save`, `resume`, `remove`(지움) | 내 보이스(클론) |

## JSON

`--json`은 stdout에 한 건만 씁니다. 안내와 확인 질문은 stderr로 갑니다.

```text
음성 성공       { origin, source: "created"|"saved"|"resumed", result: { id, createdAt, usage, bytes }, out, mime, requestId? }
실패            { code, message, reason?, retryAt?, requestId?, resultId?, cloneId?, paragraph?, paragraphs?, line?, lines?, out?, remaining? }
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
drama split     { origin, resultId, outDir, lines: [{ n, speaker, out, bytes }], join? }  --join이면 join: { out, bytes, seconds, lines: [{ n, start, end }] }
drama read      { origin, outDir, made, lines: [{ n, source, resultId, bytes, mime, out }], join: { out, bytes, seconds, lines } | null }
                --dry-run { origin, dryRun, lines: [{ n, status, resultId?, requestId? }], make, saved, check, estimate, needsConfirm }
drama autotag   { origin, out, mode: "scene"|"read", lines, changed: [{ n, fields }], skipped, remake }
clones list     { origin, providers: { fish_audio, gemini }, clones: [{ id, provider, name, status, reason, createdAt, savedVoiceId, voice, presets, ref, note }] }
clones create   { origin, source: "created"|"resumed", clone }  check·save는 { origin, clone }  resume은 { origin, source, clone }
                dry-run의 request는 { provider, source: { bytes, seconds }, consentAudio }이고 estimate가 없다. bytes는 보내는 크기다
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
