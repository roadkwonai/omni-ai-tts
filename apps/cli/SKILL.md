---
name: omni-tts
description: 터미널에서 작업실(TTS Pilot)의 성우를 찾고 담고, 채널·분류·프리셋·대본을 관리하고, 한국어 대본으로 음성을 만들어 파일로 받고, 끊긴 요청을 다시 확인할 때 쓴다. 유료 생성과 지우기가 들어 있어 사용자의 확인이 필요하다.
---

# omni-tts

`omni-tts`는 로그인한 소유자의 작업실에 붙는 명령이다. 저장소에서 `pnpm --filter @tts-pilot-app/cli build` 뒤 `pnpm --silent --filter @tts-pilot-app/cli run cli …` 또는 링크한 `omni-tts …`로 실행한다. 로그인(`omni-tts auth login --url URL`)은 비밀번호를 터미널에서 받으므로 사용자가 직접 한다.

## 명령

모든 명령은 `--url URL`(여러 작업실을 쓸 때)과 `--json`을 받는다. `REF`는 `공급자:성우 ID`다. 옵션 전체는 `omni-tts --help`.

| 명령 | 하는 일 | 주의 |
|---|---|---|
| `auth login --url URL` / `auth status` / `auth logout` | 로그인과 세션 확인 | |
| `providers status [--provider ID]` | 공급자 연결 상태 | |
| `casting search --provider ID [조건]` / `casting accents --language CODE` / `casting refresh --provider ID` | 성우 찾기. `voices[].ref`가 REF, `next`가 다음 쪽 | |
| `casting sample REF --out PATH [--index N] [--overwrite]` | 공급자 기본 샘플 받기(시험 생성 아님) | |
| `trial generate --voice REF (--text TEXT \| --input FILE\|-) --out PATH [--settings FILE] [--overwrite] [--yes] [--new] [--dry-run]` | 200자까지 시험 생성 | **요금이 나올 수 있음** |
| `trial list --voice REF` / `trial download RESULT_ID --out PATH` / `trial resume [REQUEST_ID] [--out PATH]` | 시험 생성 결과와 복구 | |
| `trial remove RESULT_ID [--yes]` | 시험 생성 결과 지우기 | **지움** |
| `voices list [--provider ID] [--channel NAME \| --channel-id ID] [--favorite] [--frequent]` / `voices show REF` / `voices check` | 담은 성우. `ref`가 `--voice` 값 | |
| `voices save REF` / `voices update REF` `[--favorite\|--no-favorite] [--frequent\|--no-frequent] [--memo TEXT]` | 담기·고치기. `update`는 `[--channel-id ID\|none]... [--classification-id ID\|none]...`도 받고 준 종류를 통째로 바꾼다 | |
| `voices remove REF [--yes]` | 보관함에서 빼기 | **지움** |
| `channels`·`categories`·`types` `list` / `create --name NAME [--memo TEXT]` / `update ID [--name] [--memo]` | 채널과 분류(채널만 `--link URL`) | |
| `channels`·`categories`·`types` `remove ID [--yes]` | 지우기 | **지움** |
| `presets list` / `presets show ID` / `presets duplicate ID` | 프리셋. `id`가 `--preset-id` 값 | |
| `presets create --name NAME --voice REF [--settings FILE] [--channel-id ID] [--default]` | 만들기(성우도 담긴다) | |
| `presets update ID [--name] [--channel-id ID\|none] [--default\|--no-default]` | 고치기. 채널이 바뀌고 `--default`가 없으면 기본이 꺼진다 | |
| `presets overwrite ID --voice REF --settings FILE` | 성우와 설정 바꾸기 | 앞 설정을 잃는다 |
| `presets remove ID [--yes]` | 지우기 | **지움** |
| `scripts list [--recent] [--q TEXT] [--channel-id ID\|none] [--category-id ID]... [--type-id ID]... [--cursor JSON]` / `scripts show ID [--out FILE.txt\|FILE.json] [--overwrite]` / `scripts duplicate ID` | 대본 보관함 | |
| `scripts create --title T (--input FILE\|- \| --work FILE.json) [--voice REF] [--channel-id ID] [--classification-id ID]...` | 만들기. 글은 빈 줄로 문단을 나눈다 | |
| `scripts save ID (--version N \| --force) (--input FILE\|- \| --work FILE.json) [--yes]` | 저장. 설정이 있는 문단을 잃으면 확인 | `--force`·`--yes`·`--work`는 **앞 내용을 잃을 수 있음** |
| `scripts update ID [--title T] [--channel-id ID\|none] [--classification-id ID\|none]...` | 제목·채널·분류 고치기 | |
| `scripts remove ID [--yes]` | 지우기 | **지움** |
| `studio generate (--voice REF \| --preset-id ID) --input FILE\|- --out PATH [--overwrite] [--yes] [--new] [--dry-run]` | 음성 만들고 받기 | **요금이 나올 수 있음** |
| `studio download RESULT_ID --out PATH [--overwrite]` / `studio resume [REQUEST_ID] [--out PATH] [--overwrite]` | 저장된 결과 받기, 응답을 잃은 요청 확인 | |
| `studio plan (--work FILE.json \| --script-id ID) [--only 1,3-5]` | 문단마다의 상태와 예상 사용량 | |
| `studio batch (--work FILE.json \| --script-id ID) --out-dir DIR [--only 1,3-5] [--yes] [--overwrite] [--retry-unconfirmed] [--dry-run]` | 문단을 차례로 만들어 `DIR/001.mp3`로 받기 | **요금이 나올 수 있음** |
| `studio join (--work FILE.json \| --script-id ID) --out FILE.wav [--srt FILE.srt] [--only 1,3-5] [--overwrite]` | 저장된 문단을 WAV 하나와 자막으로 | ffmpeg나 afconvert 필요 |
| `studio autotag (--work FILE.json \| --script-id ID) --out FILE.json [--only 1,3-5] [--yes] [--overwrite] [--dry-run]` | 문단 자동 태그를 적용한 작업 JSON | **요금(묶음당 최대 4회)** |
| `numbers check (--input FILE\|- \| --work FILE.json \| --script-id ID)` / `numbers apply … --out FILE [--certain] [--decisions FILE.json] [--overwrite]` | 한국어 숫자 검수와 교정 | |
| `drama generate --input FILE.json\|FILE.txt --out FILE.wav [--voice NAME=REF]... [--model M] [--yes] [--new] [--overwrite] [--dry-run]` | Fish Audio 장면 하나를 만들어 WAV로 | **요금이 나올 수 있음** |
| `drama list` / `drama download RESULT_ID --out FILE.wav [--overwrite]` / `drama resume [REQUEST_ID] [--out FILE.wav] [--overwrite]` | 테이크 목록, 받기, 응답을 잃은 요청 확인 | |
| `drama split RESULT_ID --out-dir DIR [--overwrite]` | 줄마다 `001-화자.wav` | `list`의 `split`이 참인 테이크만 |
| `drama remove RESULT_ID [--yes]` | 테이크 지우기 | **지움** |
| `drama read --input FILE.json --out-dir DIR [--only 1,3-5] [--join FILE.wav] [--yes] [--overwrite] [--retry-unconfirmed] [--dry-run]` | 줄마다 시험 생성으로 읽기(다섯 공급자) | **요금이 나올 수 있음** |
| `drama autotag --input FILE.json --out FILE.json [--yes] [--overwrite] [--dry-run]` | 자동 태그를 적용한 장면 파일 | **요금(최대 4회)** |

## 에이전트 규칙

1. 늘 `--json`으로 실행하고 stdout의 JSON 한 건과 종료 코드로 판단한다. 안내는 stderr다.
2. 한 번 만들기(`studio generate`, `trial generate`, `drama generate`) 전에 같은 인자에 `--dry-run --json`을 붙여 `saved`, `estimate`, `needsConfirm`을 본다.
3. `saved.status`가 `done`이면 요금 없이 받는다. 없고 `needsConfirm`이 참이면 성우·모델·글자 수·`estimate`를 사용자에게 보이고 승인을 받은 뒤에만 `--yes`를 붙인다.
4. 종료 코드 6이면 다시 만들지 않는다. `requestId`로 `studio resume`(시험 생성과 `drama read`는 `trial resume`, `drama generate`는 `drama resume`)을 실행한다. `requestId`도 `resultId`도 없으면 끊긴 변경 명령이니 목록이나 `show`로 적용됐는지 본다. `resultId`만 있으면 같은 요청의 처리 여부를 모르는 것이니 다시 만들지 않고 사용자에게 알린다. `--new`는 요금이 다시 나올 수 있으니 사용자가 그 요청에 대해 따로 승인할 때만 쓴다.
5. 종료 코드 7에 `resultId`가 있으면 `studio download`, `trial download`(시험 생성·`drama read`), `drama download`(`drama generate`·`split`)로 받는다(요금 없음).
6. 성공하면 `out` 파일의 크기가 `result.bytes`와 같은지 확인한다.
7. 지우는 명령은 먼저 `--yes` 없이 실행해(종료 코드 2, `CONFIRM_REQUIRED`, 변경 없음) stderr의 대상과 영향을 사용자에게 보이고, 승인을 받은 뒤에만 `--yes`를 붙인다. `scripts save`의 설정 손실 확인도 같다.
8. 대본은 `scripts show ID --json`의 `version`을 `--version`에 넣어 저장한다. `reason`이 `stale`이면 다시 보고 합친다. `--force`는 사용자가 덮어쓰기를 승인할 때만 쓴다.
9. 문단의 성우·쉼을 지키려면 `show --out 대본.txt`를 고쳐 `save --input`하거나, 설정까지 바꿀 때는 `show --out 작업.json`을 고쳐 `save --work`한다.
10. 여러 문단은 `studio plan --json`으로 `make`·`estimate`·`check`·`unreviewed`를 먼저 보이고, 승인을 받은 뒤에만 `studio batch --yes`를 실행한다. 실패하면 같은 명령을 다시 실행해 이어 가되, 남은 새 문단의 승인을 다시 받는다.
11. `batch`가 6이면 `paragraphs`의 요청을 `studio resume`으로 확인한다. `--retry-unconfirmed`는 요금이 다시 나올 수 있으니 사용자가 그 문단에 대해 따로 승인할 때만 쓴다.
12. `studio autotag` 전에는 `--dry-run --json`의 `batches`와 `maxCalls`를 보이고 승인을 받는다. 실패 JSON에 `remaining`이 있으면 `out` 파일로 그 문단만 이어 받는다(새 승인 필요). 다시 부르는 것은 사용자가 정한다.
13. 자동 태그·숫자 결과 작업 JSON은 파일일 뿐이다. 대본에 남기려면 `scripts save ID --version N --work FILE.json`을 쓴다.
14. 드라마 장면 파일은 `{ version: 1, sceneName?, speakers: [{ name, voice?, presetId? }], lines: [{ speaker, direction?, text, feel? }], model?, settings? }`이고 `speaker`는 0부터 센다. 실패 JSON의 `lines`에 잘못된 줄 번호와 이유가 모두 있다. `drama read`는 10·11번을 문단 대신 줄로 따르고 `trial resume`으로 확인한다. `drama autotag`는 12번과 같다.

`estimate.unit`: `credit` 크레딧, `byte` 바이트, `usd_micro` 추정 백만분의 1달러, `free` 무료. `rateKnown`이 거짓이면 ElevenLabs 배율을 확인하지 못한 값이다.

## 종료 코드

0 성공, 2 입력·확인 필요(같은 이름·판 충돌 포함), 3 로그인·소유자, 4 찾을 수 없음·이용 불가, 5 공급자·서비스 실패, 6 처리 여부 미확인, 7 로컬 파일 실패. 실패 JSON은 `{ code, message, reason?, retryAt?, requestId?, resultId?, paragraph?, paragraphs?, line?, lines?, out?, remaining? }`이고 `retryAt` 전에는 다시 부르지 않는다.

## 예시

```bash
omni-tts casting search --provider elevenlabs --q 차분한 --json
omni-tts voices save elevenlabs:VOICE_ID --favorite --json
omni-tts presets create --name 쇼츠 --voice elevenlabs:VOICE_ID --json
omni-tts scripts show SCRIPT_ID --json
omni-tts scripts save SCRIPT_ID --version 3 --input 대본.txt --json
omni-tts studio generate --preset-id PRESET_ID --input 대본.txt --out 내레이션.mp3 --dry-run --json
omni-tts studio generate --preset-id PRESET_ID --input 대본.txt --out 내레이션.mp3 --yes --json
omni-tts studio resume --json
omni-tts studio download RESULT_ID --out 내레이션.mp3 --json
omni-tts studio plan --script-id SCRIPT_ID --json
omni-tts studio batch --script-id SCRIPT_ID --out-dir 문단 --yes --json
omni-tts studio join --script-id SCRIPT_ID --out 내레이션.wav --srt 내레이션.srt --json
omni-tts drama generate --input 장면.json --out 장면.wav --dry-run --json
omni-tts drama split RESULT_ID --out-dir 줄 --json
omni-tts drama read --input 읽기.json --out-dir 줄 --join 읽기.wav --yes --json
```
