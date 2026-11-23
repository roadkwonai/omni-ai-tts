# T20 CLI 문단과 드라마 제작

[CLI 기획·설계](../2026-11-23-cli-plan.md)의 넷째 작업이다. [T18](T18-cli-studio-generate.md)의 유료 흐름(`paid.ts`)과 [T19](T19-cli-library-and-casting.md)의 대본·시험 생성 규칙을 쓴다. CLI-Anything은 refine 방식만 쓴다.

## 빈 곳 (refine 조사)

없는 것: 문단 묶음 계획·생성·이어 하기, 문단 결합(WAV·SRT), 문단 자동 태그, 한국어 숫자 검수, 최근 대본 등록, 드라마 장면(테이크) 만들기·목록·받기·나누기·지우기, 드라마 대사별 읽기, 드라마 자동 태그. 클론은 T21이다.

## 스펙

### 공용 규칙과 묶음 빌드

- 웹과 CLI가 같은 결과를 내야 하는 순수 규칙은 `packages/api/src`로 옮기고 웹 파일은 같은 이름을 다시 내보낸다. 동작 변화는 0이다. `packages/api`의 더 엄한 타입 검사(`noUncheckedIndexedAccess` 등)에 맞추는 타입 좁히기(`?? 0` 등)만 허용한다. 웹 테스트는 파일을 고치지 않고 통과해야 한다. 옮기기 전 커밋(f66ac3e)의 출력으로 만든 고정 자료(`pcm16`·`trimSilence`·구간·`srtOf`·`readingItems`·`paragraphRequest`·`lineRequest`·`parsePaste`)로 옮긴 뒤 출력을 대조한다.

| 웹 원래 파일 | 옮기는 것 | 새 위치(`packages/api/src`) | 웹에 남는 것 |
|---|---|---|---|
| `number-reading` | 전부 | `number-reading.ts` | 재수출 |
| `script-speaker` | 전부 | `script-speaker.ts` | 재수출 |
| `paragraph-script` | 전부(+ `studio-view` `savedOf`, `preset-view` `sameSettings`) | `paragraph-script.ts` | 재수출 |
| `make-all` | 타입 `MakeItem`·`Found`·`FoundMap`·`ParagraphStatus`, `paragraphStatus`, `findTargets`, `CHUNK_MAX_BYTES`, `chunkTargets`, `mergeFound`, `makePlan`, `usageByProvider`, `receivePlan` | `make-plan.ts` | 리듀서·`runMakeAll`·요약·문구, 재수출 |
| `paragraph-autotag` | 전부(+ `studio-view` `pressedEmotion`) | `paragraph-autotag.ts` | 재수출 |
| `paragraph-files` | SRT와 파일 이름(+ `studio-view` `safeName`·`kstStamp`) | `paragraph-files.ts` | 재수출 |
| `sound-join` | `AudioContext`를 쓰지 않는 함수와 상수(`joinWav`·`gapSamples` 포함. Blob은 Node에도 있다) | `sound-join.ts` | `joinTimeline`·`joinSounds`, 재수출 |
| `drama-read`·`drama-view` | `lineRequest`, `readRequests`, `requestOf`(장면 요청: 쓰인 화자만 남기고 번호를 다시 매김), `usableSpeakers`·`voiceOfSpeaker`·`speakerValue`·`actingOf`·`allFish`, `parsePaste`(+ `speakerNameOf`·`newSpeaker`와 그 타입), `splitOk` | `drama-request.ts` | 문구(`DRAMA_TEXT`)와 묶인 판정, 재수출 |
| `drama-autotag` | `autoTagInput`·`autoTagChanges`·`autoTagApply`와 타입 | `drama-autotag.ts` | `DRAMA_TEXT`를 쓰는 `autoTagBlock`·`autoTagNotes`, 재수출 |

  의존을 따라가다 화면 문구·임시 작업에 닿으면 그 함수는 옮기지 않고 보고한다(CLI는 그 부분을 서버 계약과 위 함수로 조립하고, 같은 입력에서 웹 함수와 같은지 테스트로 대조한다).
- CLI는 `rolldown`(lockfile에 이미 있는 1.2.11) 설정 하나로 `dist/cli.js`로 묶는다. 빌드 전에 `dist`를 비우고 `dist`에 예상 파일만 있는지 검사한다. `@orpc/client`와 공용 모듈까지 모두 묶어 `dependencies`를 비우고 `@tts-pilot-app/api`·`@orpc/client`는 devDependencies로 옮긴다. shebang과 실행 권한을 확인한다. 스크립트는 `build`=`rolldown -c`, `check-types`=`tsc --noEmit`, `test`=`tsc --noEmit && rolldown -c && vitest run`이다. `dist/session.js`를 직접 import하는 잠금 테스트(core.test.ts)만 소스를 임시로 묶어 쓰게 고친다(허용 예외).
- 묶음에 들어가면 안 되는 것: 공급자 SDK·`drizzle`·`pg`·`better-auth`·`@orpc/server`·`routers`·`packages/db`. `zod`와 계약 파일은 들어가도 된다(로컬 JSON 검사). 묶은 파일의 모듈 목록으로 검사한다.
- `turbo`의 `check-types`가 옛 `dist`를 캐시에 담았다가 되살리지 않게 기존 `web#check-types`·`@tts-pilot-app/ui#check-types`와 같은 꼴로 루트 `turbo.json`에 `@tts-pilot-app/cli#check-types`(`dependsOn: ["^check-types"]`, `outputs: []`)를 더한다. 하네스 경로라 `table F --write --upgrade`로 H 행을 붙인다. build 뒤 check-types(적중 포함)에도 `dist` 해시가 그대로인지 확인한다.
- `studio generate`도 웹과 같이 그 모델이 받지 않는 태그를 빼고 보낸다(`sendText`). 길이는 빼기 전 글로 재고, 빼고 나서 빈 글이면 2다. 안내는 "뺀 태그 N개"다. 업그레이드 전 기록을 놓치지 않게, 뺀 글이 원문과 다르면 원문 요청의 지문으로도 기록을 한 번 보고 있으면 그 기록을 복구 대상으로 본다.
- 로컬 입력 검사: 작업 JSON은 `script-contract`의 모양 스키마(`scriptWorkProblem` 상한 앞까지를 내보내 쓴다), 장면은 `dramaRequestSchema`로 검사하고 정리된 값을 쓴다. 읽기 JSON은 줄·화자 수와 이름 규칙(`DRAMA_LINES_MAX` 등)·`feelSchema`를 다시 쓰는 모양 스키마로, 자동 태그는 확인을 묻기 전에 `dramaAutoTagInputSchema`·`studioAutoTagInputSchema`로 검사한다. 문단·줄 번호와 함께 2다.

### 명령

```text
studio plan      (--work FILE | --script-id ID) [--only 1,3-5]
studio batch     (--work FILE | --script-id ID) --out-dir DIR [--only 1,3-5] [--yes] [--overwrite]
                 [--retry-unconfirmed] [--dry-run]
studio join      (--work FILE | --script-id ID) --out FILE.wav [--srt FILE.srt] [--only 1,3-5] [--overwrite]
studio autotag   (--work FILE | --script-id ID) --out FILE.json [--only 1,3-5] [--yes] [--overwrite] [--dry-run]

numbers check    (--input FILE|- | --work FILE | --script-id ID)
numbers apply    (--input FILE|- --out FILE.txt | (--work FILE | --script-id ID) --out FILE.json)
                 [--certain] [--decisions FILE.json] [--overwrite]

drama generate   --input FILE.json|FILE.txt --out FILE.wav [--voice NAME=REF]... [--model M] [--yes] [--new] [--overwrite] [--dry-run]
drama list
drama download   RESULT_ID --out FILE.wav [--overwrite]
drama resume     [REQUEST_ID] [--out FILE.wav] [--overwrite]
drama split      RESULT_ID --out-dir DIR [--overwrite]
drama remove     RESULT_ID [--yes]
drama read       --input FILE.json --out-dir DIR [--only 1,3-5] [--join FILE.wav] [--yes] [--overwrite]
                 [--retry-unconfirmed] [--dry-run]
drama autotag    --input FILE.json --out FILE.json [--yes] [--overwrite] [--dry-run]
```

- 문단 묶음의 입력은 작업 JSON이다(`scripts show --out FILE.json`과 같은 모양). `--script-id`는 대본 보관함에서 읽는다. CLI는 대본을 고쳐 저장하지 않는다(자동 태그·숫자 결과는 새 작업 JSON 파일이고 `scripts save --work`로 저장한다).
- 드라마 장면 JSON은 `{ version: 1, sceneName, speakers: [{ name, voice?: REF }], lines: [{ speaker, direction, text }], model, settings }`다. `.txt`는 `이름: 대사` 줄(웹 붙여 넣기 규칙 `parsePaste`)이고 화자 성우는 `--voice 이름=REF`로 준다. 모델을 주지 않으면 무료 기간이면 무료 모델, 아니면 `s2.1-pro`다. 읽기(`drama read`) JSON은 여기에 화자별 `presetId?`와 줄별 `feel?`를 더하고 다섯 공급자 성우를 받는다(장면은 Fish Audio 성우만).
- 행 번호 오류: 잘못된 줄·문단은 번호와 함께 만들기 전에 모두 알리고 2다.

### 문단 묶음 (`studio plan`·`batch`)

1. 고른 문단(`--only`, 없으면 전부)의 요청을 웹 `paragraphRequest`로 만들고(발음용 대본, 화자·기본 성우, 태그 빼기), `findTargets`·`chunkTargets`로 나눠 `studioFindMany`를 부른 뒤 웹 `makePlan`으로 계획한다. 순서는 찾기 → 계획이라, 성우가 이용 불가가 된 문단도 저장 완료가 있으면 쓴다. 빈 문단은 웹 `blankFor`(태그를 빼면 비는 문단 포함)다.
2. 만들어야 하는데 막힌 문단(성우 없음·이용 불가·길이 초과)이 하나라도 있으면 번호와 이유를 모두 보이고 2, 생성 0회다. 고르지 않은 문단은 보지 않는다.
3. 문단 상태와 처리(같은 조합은 하나로 본다):

| 상태 | `plan`·`--dry-run` | `batch` |
|---|---|---|
| 로컬 기록 없음 + 서버 저장 완료 | 저장됨 | 재사용 |
| 로컬 기록 + 상태 `done` | 저장됨(기록은 지우지 않음) | 재사용하고 기록 해제 |
| 로컬 기록 + 상태 `failed` | 만들 것 | 기록 해제 뒤 만들 것 |
| 로컬 기록 + `pending`·`unknown`·없음·조회 실패, 또는 기록 없는 서버 미확인 | 확인 필요 | 확인 필요가 하나라도 있으면 확인 프롬프트 전에 생성 0회로 6(번호·요청 ID) |
| 그 밖 | 만들 것 | 만들 것 |

   로컬 기록이 있으면 T18과 같이 저장 완료보다 먼저 본다(같은 조합의 다른 완료를 그 요청의 완료로 보지 않는다).
4. `plan`과 `--dry-run`은 상태만 읽고 쓰기·과금 0이다. 만들 문단 수, 공급자별 예상 사용량, 검수하지 않은 숫자(앞 3개 표기)를 보인다. `batch`는 만들 것이 무료 모델뿐이면 묻지 않고 아니면 한 번 확인을 받는다.
5. 만들 문단마다 T18 `create`(선점 → 재조회 → 생성 1회 → 해제)를 차례로 부른다. 재조회는 언제나 한다. 실패하거나 실행 중 미확인이 생기면 그 자리에서 멈춘다. 같은 명령을 다시 실행하면 저장 결과를 받아 이어 가고 남은 새 문단은 다시 확인한다.
6. `--retry-unconfirmed`는 시작할 때 '확인 필요'인 문단만 새 UUID로 만든다(유료 확인은 똑같이 받는다). 선점은 시작할 때 본 기록(요청 ID, 없으면 없음)이 그대로일 때만 바꾼다. 다른 프로세스가 먼저 바꿨으면 그 기록을 복구 대상으로 본다. 시작할 때 본 기록이 없어졌으면 재조회만 하고, 완료면 재사용하고 아니면 만들지 않고 6으로 멈춘다. 이 문단의 재조회는 완료만 재사용하고 미확인은 건너뛴다. 완료된 문단은 다시 만들지 않는다. 완료 문단을 다시 만드는 길은 `studio generate --new`뿐이다.
7. 파일은 `DIR/001.mp3`처럼 문단 번호(세 자리, 빈 문단도 번호를 셈)와 실제 형식 확장자다. `DIR`은 있어야 하고 모든 출력 경로를 만들기 전에 검사한다. 진행 파일은 `DIR/omni-tts-result.json`(`{ version: 1, origin, items: [{ n, resultId, bytes, mime, file }] }`)이고 문단이 끝날 때마다 0600 임시 파일로 원자 교체한다. `version`·`origin`이 맞는 우리 파일일 때만 `--overwrite` 없이 바꾸고, 다른 파일·링크면 2다. 있는 소리 파일은 진행 파일의 그 문단 결과 ID와 크기가 지금 결과와 같을 때만 그대로 두고, 아니면 `--overwrite`가 필요하다.
8. 최근 대본: 첫 생성 요청을 보낼 때 한 번 `scriptRecordRecent`를 부른다. `--script-id`가 최근 대본이면 그 `workId`, 저장 대본이면 대본 id이고 채널은 그 대본의 `channelId`다. 파일이면 `[origin, 사용자, realpath]`의 해시로 만든 고정 UUID(버전·변형 비트를 맞춘 v5 꼴)와 채널 없음이다. `scriptWorkProblem`이 있으면 건너뛴다. 실패는 stderr 안내뿐이고, 프로세스가 끝나기 전에 최대 5초 기다린다.
9. `Ctrl+C`: 보내기 전 2, 응답 전 6(문단 번호·요청 ID), 내려받는 중 7(결과 ID). 끝낸 문단의 진행 파일은 남는다.

### 결합 (`studio join`, `drama read --join`)

- 웹 `receivePlan`과 같이 고른 비지 않은 문단이 모두 저장 완료일 때만 한다. 없는 문단은 번호를 보이고 4, 생성 0회다.
- 도구는 채널을 보존한 44.1kHz 32비트 실수 WAV까지만 만들고, 모노 평균(`monoOf`)·무음 자르기·쉼·16비트 변환은 공용 함수가 한다(웹과 같은 순서). 디코드는 PATH의 `ffmpeg`, 없으면 macOS 기본 `afconvert`를 쓴다. 고른 도구가 실패하면 다른 도구로 넘어가지 않고 7이다. 둘 다 없으면 7과 설치 안내다.
- 셸 없이 인자 배열로 부르고 입력 형식을 MIME으로 고정한다(ffmpeg: `-nostdin -hide_banner -loglevel error -protocol_whitelist file,pipe -f mp3|wav -i <우리가 정한 이름>`). 도구마다 60초 제한, 출력 크기 상한, 종료 코드, 0샘플을 검사한다. 임시 폴더(0700)는 끝나면 지우고, `Ctrl+C`는 자식을 끝내고 임시 폴더와 게시 전 파일을 지운다.
- 결과는 44.1kHz 16비트 모노 WAV다. `--srt`는 웹 자막(원문, 구간)이고 WAV와 함께 게시한다(WAV 먼저, SRT가 실패하면 WAV는 남고 7). 웹 결합과의 차이는 디코더뿐이다.

### 자동 태그와 숫자

- 자동 태그는 유료 텍스트 호출이다. 서버가 묶음당 최대 4회(OpenAI 3, Gemini 1) 부를 수 있음을 확인문에 적고 묶음 수와 최대 호출 수를 보인다. 확인 규칙은 유료 생성과 같다. CLI는 다시 부르지 않는다.
- 묶음 하나가 실패하면 멈춘다. 앞에서 받은 묶음이 1개 이상이면 적용한 작업 JSON을 `--out`에 게시하고, 0이 아닌 코드와 멈춘 문단 번호, 이어 가는 명령(`--work <out> --only <남은 번호>`)을 알린다(웹도 받은 제안을 보존한다). 첫 묶음이 실패했을 때만 파일 0개다. `Ctrl+C`도 같다. 코드는 기존 분류를 쓰고, 처리 여부를 모르는 것(`unknown_outcome`·사유 없는 오류·연결 끊김)만 6, 그 밖은 3·5와 "과금됐을 수 있음" 안내다.
- 보낼 문단·묶음·적용은 웹 `paragraph-autotag` 함수 그대로다. 바뀐 문단 수와 칸, 다시 만들어야 하는 문단을 보인다.
- `numbers check`는 항목(문단, 원문, 종류, 제안 읽기, 확인 필요와 이유, 지금 결정)을 보인다. `apply --certain`은 웹 '확실한 것 모두 적용', `--decisions`는 `[{ paragraph, start, original, choice: apply|keep|manual, reading? }]`이고 항목과 정확히 맞지 않으면 2다. `--input`은 발음용 대본 글을, 작업은 `fixes`가 든 작업 JSON을 쓴다. 공급자·서버 호출 0이다(`--script-id`의 대본 읽기만 있다).

### 드라마

- `generate`는 `dramaCreate`(Fish Audio 장면)다. 서버에 읽기 전용 조회 둘을 더한다. `dramaRequest`(요청 UUID 상태, `findRequest` 종류 `drama`)와 `dramaFind(request)`(입력 스키마로 정리한 뒤 기존 `dramaKey` 조합 키로 완료 → 미확인 순 하나, `findStudioMany`와 같은 선택 규칙, 세션 소유자·`drama`·미만료). 둘 다 공급자 0회, 쓰기 0회다.
- 유료 흐름은 `paid.ts`의 `create`를 `{ key, provider, request }`를 받게 일반화해 쓴다(studio·trial의 동작과 지문은 그대로). 장면은 `dramaRequestSchema`로 정리한 요청으로 지문을 만든다. 저장 완료가 있으면 다시 만들지 않고, `--new`만 새 테이크를 만든다(T18과 같은 확인). 미확인이면 6이다. 무료 모델(`s2.1-pro-free`, 기간 안)만 묻지 않는다. 예상 사용량은 `dramaUsage`다. 화자 성우는 보관함의 Fish Audio 성우여야 한다.
- `list`는 서버 최근 20개다. `download`·`split`은 테이크 WAV를 조각으로 받는다. `split`은 웹 `splitOk`(완료이고 구간 수 = 줄 수)일 때 `001-화자.wav`로 자른다(`cutWav`). 이름은 `safeName`으로 정리하고 모든 경로를 쓰기 전에 검사하며(부모가 DIR인지 포함) 하나라도 막히면 파일 0개다. 나눌 수 없으면 4와 이유다. 구간은 `list`의 20개 안에서만 얻으므로 그 밖의 테이크는 4다.
- `read`는 줄마다 시험 생성(`trialCreate`)이다. 요청은 웹 `lineRequest`, 검사는 웹과 같고(화자 성우·프리셋 사용 불가, 200자 초과, 태그를 빼면 빈 줄) 줄 번호와 함께 2다. 묶음 규칙은 문단 묶음과 같고 다른 점은 넷이다. 서버 미확인은 조회되지 않으므로 로컬 기록(`trialRequest`)으로만 판정한다. 같은 요청의 줄은 한 번 만들고 나머지 줄은 저장본(`trialAudio`)을 받는다. 완료 확인이 안 되면(T19 규칙) 파일은 두고 멈춘다(6). 저장 결과에 크기가 없어 건너뛰기는 진행 파일의 결과 ID와 파일 크기로 한다. `--join`은 위 결합 규칙(드라마 쉼 0.3초 기본)이다.
- `drama autotag`는 `dramaAutoTag` 한 번이다. 장면·읽기 구분은 웹 `allFish`로 정하고 규칙은 문단 자동 태그와 같다.

### 만들지 않는 것

재생·미리 듣기, 테이크 격자·비교, 모바일·화면 편집, zip, 서버 쪽 결합, 자동 재시도, 여러 묶음 병렬, 대본 자동 저장, 드라마 장면의 보관함 저장(T12-01 백로그), 묶음에서 완료 문단 다시 만들기, 화자별 설정 직접 지정, 새 DB 스키마·환경 변수.

### 인수 조건과 테스트 시나리오

1. 웹과 같은 결과: 옮긴 모듈의 웹 테스트가 그대로 통과하고, 옮기기 전 커밋의 고정 자료와 같다(요청·조합 키·숫자 교정·SRT·소리 잇기). 쓰이지 않는 화자가 있는 장면도 웹 `requestOf`와 CLI 요청이 같다.
2. 묶음: 다섯 공급자가 섞인 작업, 같은 조합 문단, 빈 문단(태그만 있는 문단 포함), 막힌 문단(생성 0회), 이용 불가이지만 저장된 문단, `--only`, 계획 출력의 수와 사용량. `plan`·`--dry-run`·`join`·`numbers`의 생성·자동 태그 호출 0.
3. 과금 막기: 중간 실패 뒤 재실행이 남은 문단만 만든다, 응답 유실 문단이 자동 재전송되지 않는다, 두 프로세스가 같은 묶음을 동시에 실행해도 문단마다 1회, `--yes` 없는 비대화 0회, 확인 뒤 문단이 이미 저장되면 만들지 않는다. 확정 실패 기록은 다시 만들 수 있고, 확인 필요가 있으면 생성 0회다. `--retry-unconfirmed`로 중간 실패한 뒤 재실행과 두 프로세스 동시 실행에서 문단마다 1회, 앞서 만든 문단 0회, 본 기록이 사라진 경우 생성 0회. 기록의 종류 호환(없음=studio, trial, drama).
4. 파일: 같은 크기의 다른 결과, 남의 진행 파일, 있는 파일·링크·없는 폴더, 중간 실패 뒤 이미 받은 파일 보존과 재실행 복구, 진행 파일의 원자 교체. 최근 대본(저장·최근·파일)의 작업 id와 채널.
5. 결합: MP3(모노·위상이 같은 스테레오·다른 표본율)와 WAV가 섞인 입력의 길이·크기·쉼·무음 자르기, 디코더 없음·실패·잘린 입력·`Ctrl+C`는 파일 0개, SRT 구간. `ffmpeg`·`afconvert` 각각 실제로 돌린다.
6. 자동 태그: 확인 없이 0회, 네트워크 오류 뒤 재호출 0, 둘째 묶음 실패 때 앞 묶음이 든 파일 게시와 이어 가기, 첫 묶음 실패 때 파일 0개, 묶음·상한, 적용 결과가 웹 함수와 같다.
7. 드라마: 장면 JSON·붙여 넣기 글, 줄 번호 오류, 저장 테이크 재사용(정리 전후가 다른 장면, 최근 20개 밖 테이크)과 `--new`, 확인 프롬프트 두 개, 응답 유실 → `resume`, `dramaRequest`·`dramaFind` 격리·종류·만료, `split`(구간 있음·없음, `../`·긴 이름·같은 이름 화자), `read` 혼합 공급자와 `--join`, 지우기 확인.
8. 묶은 `dist`에 서버 모듈이 없고, `pnpm pack`한 파일을 저장소 밖에 설치한 명령이 동작한다(의존 0, shebang·실행 권한). check-types 캐시 적중 뒤에도 `dist`가 그대로다. T17·T18·T19 테스트가 그대로 통과한다(태그 안내 문구와 잠금 테스트의 모듈 경로 변경 제외).

너비·테마·키보드는 해당 없다(화면 변경 없음).

## 구현과 재사용

| 단계 | 수행자와 파일 | 즉시 검사 |
|---|---|---|
| 1 공용 이동·서버 | `prokit-api-builder`: 이동 표의 새 순수 모듈, `trial.ts`·`drama-contract.ts`·`routers/drama.ts`(`dramaRequest`·`dramaFind`)·격리·데모 테스트, `script-contract.ts`(모양 스키마 내보내기), 고정 자료. 이어서 `prokit-ui-builder`: 웹 `lib` 재수출 | 웹·API 전체 테스트, 타입, 빌드 |
| 2 묶음 빌드·문단 | `prokit-implementer`: `apps/cli` 빌드 전환과 루트 `turbo.json`(`@tts-pilot-app/cli#check-types` 한 항목), `work.ts`(작업 읽기), `batch.ts`, `numbers.ts`, `join.ts`, `autotag.ts`, `paid.ts`·`requests.ts`·`session.ts` 일반화(기록 종류 `drama`), `studio`의 태그 빼기, 테스트 | T18·T19 테스트 불변, 새 테스트 |
| 3 드라마 | `prokit-implementer`: `drama.ts`, 명령 표, README·SKILL·TEST | 실제 라우터 E2E |
| 4 실행 확인 | `prokit-runtime-checker`: 설치본, 모의 공급자, 임시 PostgreSQL, 실제 ffmpeg·afconvert | 시나리오 1~8 |
| 5 리뷰 | `prokit-reviewer` code·security, ponytail-review | 지적 처리 |
| 문서 | Main: `docs/domain/project.md`(`dramaRequest`·`dramaFind`, 옮긴 모듈 위치) | |

### 구현 중 정한 것

- `failed` 기록은 기록이 없는 것과 같이 본다(같은 조합의 저장 완료가 있으면 저장됨, 서버 미확인이면 확인 필요). 남의 진행 파일은 `--overwrite`가 있어도 2다. 확인 필요가 있으면 출력 경로 검사보다 먼저 6이다.
- 드라마 줄의 `speaker`는 0부터 세는 화자 번호다(서버 계약과 같다). 모르는 칸은 2로 거절하고 장면에서는 `presetId`·`feel`을 쓰지 않는다. `read --join`의 쉼은 0.3초다. 최근 20개 밖 테이크의 `download`는 시각·사용량이 없다.
- `numbers --input`은 글 전체를 문단 하나로 본다. 자동 태그에 보낼 문단이 없으면 2다. 이어 가기 안내와 확인문에 작업실 주소를 넣는다.
- 디코드 출력 상한은 두 도구 공통으로 푸는 동안 크기를 보고 끊는다. 잘린 WAV는 거절하고 잘린 MP3는 풀리는 곳까지 잇는다(웹과 같다).
- `--new`가 성공하면 같은 요청의 옛 태그 기록을 지운다. `sameSettings`는 `/presets` 묶음이 커지지 않게 `providers/trial-options`에 두었다. 공용 패키지에 `version`이 없어 `apps/cli`의 내부 의존은 `workspace:0.0.0`이다.

환경 변수·DB 변경 없음. 루트 `turbo.json`은 CLI `check-types` 캐시 항목 하나만 더한다(H 행). 새 의존은 `apps/cli` devDependency `rolldown` 하나(lockfile 기존 판)이고, 결합의 `ffmpeg`·`afconvert`는 설치 의존이 아니라 사용자 컴퓨터에 있는 도구다. 실제 생성·자동 태그 호출은 사용자가 승인한 것만 한다. 되돌리기: 서버 조회는 읽기 전용 추가, 공용 이동은 동작 변화가 없어 CLI 커밋만 되돌려도 웹은 그대로다.
