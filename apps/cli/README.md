# Omni AI TTS CLI

저장소에서 다음 명령으로 빌드하고 로그인합니다. 로그인할 때 터미널에 이메일과 비밀번호를 입력합니다.

```bash
pnpm --filter @tts-pilot-app/cli build
pnpm --filter @tts-pilot-app/cli run cli auth login --url 'https://작업실주소'
pnpm --silent --filter @tts-pilot-app/cli run cli voices list --json
```

다른 pnpm 프로젝트에서는 `pnpm link /path/to/repo/apps/cli`로 로컬 링크한 뒤 `pnpm exec omni-tts --help`로 실행할 수 있습니다. 저장소의 타입스크립트 모듈을 그대로 읽으므로 Node 24 이상이 필요합니다(Node 26에서 확인했습니다).

macOS에서는 기본 제공되는 `/usr/bin/lockf`로 세션 저장을 잠급니다. Linux의 `/usr/bin/flock` 경로는 구현 예정이며 이 환경에서 검증하지 않았습니다.

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

- 요금이 나올 수 있는 명령은 `studio generate`뿐입니다. 터미널에서 성우·모델·글자 수·예상 사용량을 보고 `y`를 눌러야 만듭니다. 비대화 실행이나 `--input -`에서는 `--yes`가 필요합니다. Fish Audio 무료 모델은 무료 기간 안에서 묻지 않습니다.
- 같은 성우·설정·대본의 저장된 결과가 있으면 만들지 않고 그 파일을 받습니다(`source: "saved"`). 자동으로 다시 만들지 않습니다.
- 응답을 받지 못하면 종료 코드 6이고 요청 기록이 남습니다. 같은 명령이나 `studio resume REQUEST_ID`가 그 요청만 다시 확인합니다. 만들어진 것이 없다고 직접 확인했을 때만 `--new`로 새로 만듭니다(요금이 다시 나올 수 있습니다).
- 파일은 같은 폴더의 임시 파일에 받아 길이와 형식을 확인한 뒤 게시합니다. 이미 있는 파일은 `--overwrite`가 있을 때만 바꾸고, 심볼릭 링크에는 쓰지 않습니다. Gemini는 `.wav`, 나머지는 `.mp3`입니다.
- 새 파일의 권한은 소유자만 읽고 쓰는 0600입니다. `--overwrite`는 바꾸는 파일의 권한을 그대로 잇습니다.
- 대본의 대괄호 태그는 원문 그대로 보냅니다. 웹은 모델이 받지 않는 태그를 빼므로, 태그가 든 대본은 웹과 다른 결과로 다시 만들어질 수 있습니다.
- 요청 기록은 세션 폴더의 `requests.json`(0600)에 주소·요청 ID·공급자·시각만 둡니다. 대본과 쿠키는 두지 않습니다.

## 종료 코드

| 코드 | 뜻 |
|---|---|
| 0 | 성공 |
| 2 | 입력·확인 필요(옵션, 대본, `--out` 경로, 요금 확인, 취소) |
| 3 | 로그인·소유자 |
| 4 | 찾을 수 없음·이용 불가(성우, 프리셋, 결과) |
| 5 | 공급자·서비스 실패나 제한 |
| 6 | 처리 여부 미확인(다시 만들지 말고 `studio resume`) |
| 7 | 로컬 파일 실패(세션·요청 기록, 내려받기와 게시) |

하드 링크를 못 쓰는 볼륨(exFAT 등)에서는 새 파일 게시가 7로 끝납니다. 다른 폴더로 받거나 `--overwrite`를 쓰세요.

## JSON

`--json`은 stdout에 한 건만 씁니다. 안내와 확인 질문은 stderr로 갑니다.

```text
성공   { origin, source: "created"|"saved"|"resumed", result: { id, createdAt, usage, bytes }, out, mime }
실패   { code, message, reason?, retryAt?, requestId?, resultId? }
dry-run { origin, dryRun, request: { provider, voiceId, model, characters }, saved, requestId, estimate, rateKnown, needsConfirm }
resume(ID 없음) { origin, requests: [{ requestId, provider, createdAt }] }
presets list   { origin, presets: [{ id, name, ref, provider, settings, voice, unavailable, fixed, … }] }
```

에이전트가 쓸 때의 순서는 [SKILL.md](SKILL.md), 테스트 계획과 결과는 [tests/TEST.md](tests/TEST.md)에 있습니다.
