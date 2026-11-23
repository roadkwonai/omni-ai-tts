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

## 에이전트 규칙

1. 늘 `--json`으로 실행하고 stdout의 JSON 한 건과 종료 코드로 판단한다. 안내는 stderr다.
2. 만들기(`studio generate`, `trial generate`) 전에 같은 인자에 `--dry-run --json`을 붙여 `saved`, `estimate`, `needsConfirm`을 본다.
3. `saved.status`가 `done`이면 요금 없이 받는다. 없고 `needsConfirm`이 참이면 성우·모델·글자 수·`estimate`를 사용자에게 보이고 승인을 받은 뒤에만 `--yes`를 붙인다.
4. 종료 코드 6이면 다시 만들지 않는다. `requestId`로 `studio resume`(시험 생성은 `trial resume`)을 실행한다. `requestId`도 `resultId`도 없으면 끊긴 변경 명령이니 목록이나 `show`로 적용됐는지 본다. `resultId`만 있으면 같은 요청의 처리 여부를 모르는 것이니 다시 만들지 않고 사용자에게 알린다. `--new`는 요금이 다시 나올 수 있으니 사용자가 그 요청에 대해 따로 승인할 때만 쓴다.
5. 종료 코드 7에 `resultId`가 있으면 `studio download`나 `trial download`로 받는다(요금 없음).
6. 성공하면 `out` 파일의 크기가 `result.bytes`와 같은지 확인한다.
7. 지우는 명령은 먼저 `--yes` 없이 실행해(종료 코드 2, `CONFIRM_REQUIRED`, 변경 없음) stderr의 대상과 영향을 사용자에게 보이고, 승인을 받은 뒤에만 `--yes`를 붙인다. `scripts save`의 설정 손실 확인도 같다.
8. 대본은 `scripts show ID --json`의 `version`을 `--version`에 넣어 저장한다. `reason`이 `stale`이면 다시 보고 합친다. `--force`는 사용자가 덮어쓰기를 승인할 때만 쓴다.
9. 문단의 성우·쉼을 지키려면 `show --out 대본.txt`를 고쳐 `save --input`하거나, 설정까지 바꿀 때는 `show --out 작업.json`을 고쳐 `save --work`한다.

`estimate.unit`: `credit` 크레딧, `byte` 바이트, `usd_micro` 추정 백만분의 1달러, `free` 무료. `rateKnown`이 거짓이면 ElevenLabs 배율을 확인하지 못한 값이다.

## 종료 코드

0 성공, 2 입력·확인 필요(같은 이름·판 충돌 포함), 3 로그인·소유자, 4 찾을 수 없음·이용 불가, 5 공급자·서비스 실패, 6 처리 여부 미확인, 7 로컬 파일 실패. 실패 JSON은 `{ code, message, reason?, retryAt?, requestId?, resultId? }`이고 `retryAt` 전에는 다시 부르지 않는다.

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
```
