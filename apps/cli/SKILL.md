---
name: omni-tts
description: 터미널에서 작업실(TTS Pilot)의 담은 성우와 프리셋을 찾고, 한국어 대본으로 음성을 만들어 파일로 받고, 끊긴 요청을 다시 확인할 때 쓴다. 유료 생성이 들어 있어 사용자의 확인이 필요하다.
---

# omni-tts

`omni-tts`는 로그인한 소유자의 작업실에 붙는 명령이다. 저장소에서 `pnpm --filter @tts-pilot-app/cli build` 뒤 `pnpm --silent --filter @tts-pilot-app/cli run cli …` 또는 링크한 `omni-tts …`로 실행한다. 로그인(`omni-tts auth login --url URL`)은 비밀번호를 터미널에서 받으므로 사용자가 직접 한다.

## 명령

| 명령 | 하는 일 | 요금 |
|---|---|---|
| `auth login --url URL` / `auth status` / `auth logout` | 로그인과 세션 확인 | 없음 |
| `voices list [--provider ID] [--channel NAME \| --channel-id ID] [--favorite] [--frequent]` | 담은 성우. `ref`가 `--voice` 값 | 없음 |
| `presets list` | 프리셋. `id`가 `--preset-id` 값 | 없음 |
| `studio generate (--voice REF \| --preset-id ID) --input FILE\|- --out PATH [--overwrite] [--yes] [--new] [--dry-run]` | 음성 만들고 받기 | **나올 수 있음** |
| `studio download RESULT_ID --out PATH [--overwrite]` | 저장된 결과 받기 | 없음 |
| `studio resume [REQUEST_ID] [--out PATH] [--overwrite]` | 응답을 잃은 요청 확인. ID가 없으면 목록 | 없음 |

모든 명령은 `--url URL`(여러 작업실을 쓸 때)과 `--json`을 받는다.

## 에이전트 규칙

1. 늘 `--json`으로 실행하고 stdout의 JSON 한 건과 종료 코드로 판단한다. 안내는 stderr다.
2. 만들기 전에 같은 인자에 `--dry-run --json`을 붙여 `saved`, `estimate`, `needsConfirm`을 본다.
3. `saved.status`가 `done`이면 요금 없이 받는다. 없고 `needsConfirm`이 참이면 성우·모델·글자 수·`estimate`를 사용자에게 보이고 승인을 받은 뒤에만 `--yes`를 붙인다.
4. 종료 코드 6이면 다시 만들지 않는다. `requestId`로 `studio resume`을 실행한다. `--new`는 요금이 다시 나올 수 있으니 사용자가 그 요청에 대해 따로 승인할 때만 쓴다.
5. 종료 코드 7에 `resultId`가 있으면 `studio download`로 받는다(요금 없음).
6. 성공하면 `out` 파일의 크기가 `result.bytes`와 같은지 확인한다.

`estimate.unit`: `credit` 크레딧, `byte` 바이트, `usd_micro` 추정 백만분의 1달러, `free` 무료. `rateKnown`이 거짓이면 ElevenLabs 배율을 확인하지 못한 값이다.

## 종료 코드

0 성공, 2 입력·확인 필요, 3 로그인·소유자, 4 찾을 수 없음·이용 불가, 5 공급자·서비스 실패, 6 처리 여부 미확인, 7 로컬 파일 실패. 실패 JSON은 `{ code, message, reason?, retryAt?, requestId?, resultId? }`이고 `retryAt` 전에는 다시 부르지 않는다.

## 예시

```bash
omni-tts presets list --json
omni-tts studio generate --preset-id PRESET_ID --input 대본.txt --out 내레이션.mp3 --dry-run --json
omni-tts studio generate --preset-id PRESET_ID --input 대본.txt --out 내레이션.mp3 --yes --json
omni-tts studio resume --json
omni-tts studio download RESULT_ID --out 내레이션.mp3 --json
```
