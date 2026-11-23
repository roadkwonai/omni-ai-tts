# T19 CLI 캐스팅·보관함·제작 자료 관리

[CLI 기획·설계](../2026-11-23-cli-plan.md)의 셋째 작업이다. T17 세션, [T18](T18-cli-studio-generate.md)의 파일·유료 실행 규칙을 쓴다. CLI-Anything은 refine 방식(현재 명령 조사 → 빈 곳 → `TEST.md` 먼저 → 구현 → 설치본을 실제 백엔드로 검증)만 쓴다.

## 빈 곳 (refine 조사)

지금 있는 명령: `auth login/status/logout`, `voices list`, `presets list`, `studio generate/download/resume`. 없는 것: 공급자 상태, 캐스팅(목록·억양·새로 고침·기본 샘플), 시험 생성, 보관함 변경, 채널·카테고리·타입, 프리셋 변경, 대본. 문단·드라마·자동 태그·숫자 검수는 T20, 클론은 T21이다.

## 스펙

공통: 읽기 명령은 표(사람용)와 `--json`. 변경 명령은 바뀐 항목을 보인다. 지우기는 대상 이름과 영향(연결된 성우 수 등)을 stderr에 보이고 TTY `y` 또는 `--yes`를 받는다(비대화에서 `--yes` 없으면 2, 변경 0회). 성우는 `REF`(`공급자:성우ID`)로 고른다. 오류: 없는 항목 4, 같은 이름·판 충돌은 2(`code: "CONFLICT"`, `reason: duplicate_name|stale`), 입력 거절 2, 세션 3, 공급자·서버 5(사유·`retryAt`). 모르는 옵션은 이름을 알리고 2, 잘못된 `--url`은 2다(T18-02).

오류 변환은 관리 명령 전용 하나를 둔다: 사유 없는 `BAD_REQUEST` → 2, `CONFLICT`+`duplicate_name`·`stale` → 2, `NOT_FOUND` → 4, 그 밖은 지금의 `rpcError`. 공용 `rpcError`와 유료 분류(`isRejected`)의 동작은 T18 그대로이고(`BAD_REQUEST`·`provider_input`·`free_ended`는 5), `duplicate_name`·`stale`은 관리 변환에서만 읽어 유료 분류의 사유 허용 목록에 넣지 않는다. `casting`·`trial`의 과금 전 조회(`trialFindMany`)·`trial list/remove/download`는 관리 변환을 쓰고 `trialCreate`만 T18 표를 쓴다. `--new`는 조회를 건너뛰므로 그때 틀린 설정 값은 5다.

```text
providers status [--provider ID]

casting search --provider ID [--source public|account] [--q TEXT] [--language CODE|all] [--accent V] [--gender V] [--age V]
               [--category V] [--use-case V]... [--descriptive V]... [--tag V]... [--voice-type V] [--featured] [--licensed]
               [--sort V] [--direction asc|desc] [--page N | --cursor C]
casting accents --language CODE
casting refresh --provider ID
casting sample REF --out PATH [--index N] [--overwrite]

trial generate --voice REF (--text TEXT | --input FILE|-) --out PATH [--settings FILE] [--overwrite] [--yes] [--new] [--dry-run]
trial list --voice REF
trial download RESULT_ID --out PATH [--overwrite]
trial resume [REQUEST_ID] [--out PATH] [--overwrite]
trial remove RESULT_ID [--yes]

voices show REF
voices check
voices save REF [--favorite|--no-favorite] [--frequent|--no-frequent] [--memo TEXT]
voices update REF [같은 옵션] [--channel-id ID|none]... [--classification-id ID|none]...
voices remove REF [--yes]

channels list|create|update|remove      (--name, --memo, --link)
categories list|create|update|remove    (--name, --memo)
types list|create|update|remove         (--name, --memo)

presets list|show|create|update|overwrite|duplicate|remove
        create: --name NAME --voice REF [--settings FILE] [--channel-id ID] [--default]
        update: ID [--name] [--channel-id ID|none] [--default|--no-default]
        overwrite: ID --voice REF --settings FILE

scripts list [--recent] [--q TEXT] [--channel-id ID|none] [--category-id ID]... [--type-id ID]... [--cursor JSON]
scripts show ID [--out FILE.txt|.json] [--overwrite]
scripts create --title T (--input FILE|- | --work FILE.json) [--voice REF] [--channel-id ID] [--classification-id ID]...
scripts save ID (--version N | --force) (--input FILE|- | --work FILE.json) [--yes]
scripts update ID [--title] [--channel-id ID|none] [--classification-id ID|none]...
scripts duplicate ID
scripts remove ID [--yes]
```

모든 명령은 `--url`·`--json`을 받는다. 채널의 주소 옵션은 작업실 주소 `--url`과 겹치지 않게 `--link`다. 바꾸지 않은 칸은 그대로 둔다(서버가 전체를 받는 채널·분류·프리셋 고치기는 CLI가 쓰기 직전에 지금 값을 읽어 합친다. 읽기와 쓰기 사이 웹 변경은 잃을 수 있다: 단일 소유자 한계). 합칠 때 `null` 메모·주소는 빈 글자로 보내고 `--memo ""`·`--link ""`는 비우기다. `categories`·`types`의 고치기·지우기는 먼저 목록에서 그 id의 종류를 확인하고 다르면 4, 변경 0회다. 프리셋은 채널이 바뀌고 `--default`가 없으면 기본 지정을 끄고(웹과 같다) stderr에 알린다. 지우기 영향은 채널·카테고리·타입의 `voiceCount`와 `presetList`에서 그 채널·성우를 쓰는 프리셋 수를 보인다. `trial remove`는 결과 ID만 보인다.

### 캐스팅

- `search`는 공급자가 받는 조건만 받고 나머지 조건은 2로 거절한다. 공급자별 조건은 서버 `voiceListInputSchema` 그대로다.
  - Typecast·Airy·Gemini: 서버가 목록 전체를 준다. `--q`(이름·영문 이름·성우 ID)와 `--gender`만 CLI가 거른다.
  - ElevenLabs public: `--q`·`--language`(기본 `ko`, `all`이면 전체)·`--accent`·`--gender`·`--age`·`--category`·`--use-case`·`--descriptive`·`--featured`·`--sort`·`--page`(0부터). account: `--q`·`--voice-type`·`--category`·`--gender`·`--age`·`--language`(기본 전체)·`--accent`·`--use-case`·`--sort`·`--direction`·`--cursor`.
  - Fish Audio: `--source`·`--q`·`--language`(public 기본 `ko`, account 기본 전체)·`--tag`·`--licensed`·`--sort`·`--page`(1~10).
  - 정렬·방향 기본은 웹 `initialList`와 같다(ElevenLabs public `trending`, account `created_at_unix`·`desc`, Fish `score`).
- 출력은 `{ origin, provider, source, voices: [{ ...voice, ref }], next, total, totalExact, windowLimited, fetchedAt, stale }`. 지난 목록(`stale`)이면 사유와 `retryAt`을 stderr에 알린다. 다음 페이지 값(`next`)은 사람용 출력에도 보인다.
- (리뷰 반영) 목록 전체를 주는 Typecast·Airy·Gemini 검색 결과는 `voices.json`에 쓰지 않는다(614명이 다른 공급자 자리를 밀어낸다). 로그인도 그 origin의 `voices.json`을 세션 저장 전에 지운다. 변경 요청을 보낸 뒤 `Ctrl+C`는 6(적용 여부 미확인)이다.
- 검색에 나온 성우를 세션 디렉터리의 `voices.json`(0600, T17의 잠금·권한 검사·원자 교체, origin별 최근 500명)에 둔다. 담기·샘플·시험 생성·프리셋이 `REF`로 성우 값을 찾는 데 쓴다. 항목마다 저장 시각을 두고 24시간이 지나면 없는 것으로 본다(서버 목록 캐시와 같다). 쓸 때 그 origin의 세션 버전이 `verified`가 돌려준(쿠키 갱신 뒤) 버전과 같은지 잠금 안에서 확인해(`Connection`에 그 버전을 더한다), 로그아웃과 겹친 늦은 검색이 다시 쓰지 않는다. 계정 성우 정보도 들어간다. 서버가 담을 때 보는 것은 모양·샘플 주소·크기·성우 ID 글자뿐이고 성우의 존재는 보지 않으며, 새로 담은 성우는 24시간 뒤부터 이용 가능 확인 대상이다. 찾는 순서: 보관함 → `voices.json` → (Typecast·Airy·Gemini) 목록. 없으면 4이고 `casting search`를 안내한다. `auth logout`은 그 origin의 `voices.json`을 지운다.
- `sample`은 성우의 공급자 기본 샘플을 받는다. `previewUrl`과 `samples`를 순서대로 세고(주소가 같으면 한 번) `--index`(기본 0)로 고른다. 주소가 `https:`이고 `isSampleUrl`을 통과할 때만 세션 쿠키·origin 헤더 없이 `redirect: "error"`, 30초, 32MiB까지 받는다. `content-type`은 보지 않는다(ElevenLabs 보관 서버가 MP3를 `text/plain`으로 준다, 2026-11-24 실측). 확장자는 `.mp3`·`.wav`·`.m4a`·`.ogg` 가운데 실제 형식과 같아야 한다(형식은 앞 바이트로 판정한다). 샘플이 없으면 4다. Gemini 대표 성우는 '참고 음성(Gemini 소리가 아님)'이라고 알린다. 무료 샘플은 시험 생성으로 이어지지 않는다.
- `refresh`는 캐시를 만료시킬 뿐 공급자를 부르지 않는다. `retryAt`이 있으면 5가 아니라 0으로 끝내고 시각을 알린다.

### 시험 생성

- 200자까지(서버 `TRIAL_TEXT_MAX`). 설정은 `--settings FILE`(그 공급자 설정 JSON의 일부, 나머지는 기본값)이고 `requestOf`로 보정하며 바뀐 칸을 stderr에 알린다. 설정 파일은 객체여야 하고 `Object.keys(DEFAULT_SETTINGS[공급자])` 밖의 칸이 있으면 이름을 알리고 2다(서버는 모르는 칸을 조용히 버린다). 프리셋 `--settings`도 같다.
- 요금 확인·`--yes`·`--dry-run`·`--new`·저장 결과 재사용·요청 기록·`resume`·분류 규칙은 T18 `studio`와 같은 코드(`paid.ts`)를 쓰고 지문·기록의 종류만 `trial`이다. 다른 점 셋:
  1. **기록 해제:** `trialCreate`는 완료 저장이 실패해도 오디오를 돌려주고 행을 pending으로 둔다. 순서는 응답 검사 → 파일 저장 시도 → 저장 성공·실패와 상관없이 `trialRequest` 확인 → `done`이면 기록 해제다(확인을 기다리다 손에 든 오디오를 잃지 않게). 저장 실패(7)에는 `resultId`와, 기록이 남으면 `requestId`도 넣는다. 응답을 받아도 `trialRequest(requestId)`가 `done`일 때만 기록을 지운다. pending·미확인·없음·조회 실패면 파일은 저장하되 기록을 남겨 다음 실행이 6에서 멈춘다(그 사실을 stderr에 알린다). 응답의 id와 오디오(1바이트~4MiB, MIME 두 값)를 검사하고 어긋나면 기록을 남기고 6이다.
  2. **사유 없는 `NOT_FOUND`**(삭제 대기·처리 중·남의 클론, 선점 전 거절)는 `trialRequest`가 `null`·실패일 때만 기록을 지우고 4다. 아니면 6이다.
  3. **저장 결과 조회**는 오디오를 받지 않고 보관 기한을 늘리지 않는 `trialFindMany([request])`(done만), 파일은 `trialAudio(id)`다. 미확인은 조회되지 않으므로 1번의 기록이 유일한 방어다.
- 기록(`RequestRecord`)에 `kind`를 더한다(없는 옛 기록은 `studio`). 목록과 복구는 종류로 거르고, 다른 종류의 기록 ID를 `resume`에 주면 2로 맞는 명령을 안내한다.
- 파일을 쓰다 실패하면 결과 ID를 알리고 `trial download`(`trialAudio`)로 다시 받는다. 서버 저장에 실패한 결과는 다시 받을 수 없어 4다.
- 상태 확인에 서버 조회 `trialRequest`를 더한다: `studioRequest`와 같고 종류만 `trial`이다. 같은 함수에 종류를 받게 하고(`findRequest(db, ownerId, requestId, kind)`), 출력 스키마는 `studioRequestStatusSchema`를 함께 쓴다. 다른 종류의 요청 id는 `null`이다.
- 시험 생성은 성우를 담지 않아도 된다(웹과 같다). `trial list`는 요청과 사용량, 만든 시각을 보인다.

### 보관함·분류·프리셋·대본

- `voices save`는 담거나(없으면) 준 칸만 바꾼다. `voices update`는 담긴 성우만 바꾸고 연결은 `--channel-id`·`--classification-id`를 준 종류만 통째로 바꾼다(`none`이면 비움). 저장과 연결이 나뉜 두 호출이라 연결이 실패하면 앞의 변경은 남는다고 알린다(5 또는 4).
- `voices check`는 `savedVoiceCheck`(서버가 24시간에 한 번, 40명까지)이고 바뀐 이용 가능 여부를 보인다.
- 프리셋 설정 파일은 그 공급자 설정 JSON이다. `presets show --json`의 `settings`를 그대로 다시 쓸 수 있다. 모르는 칸은 CLI가, 값은 서버가 거절하고 2다. `voices update`는 쓰기 직전에 보관함을 다시 읽어 담긴 성우인지 본다. 그사이 웹에서 빼면 다시 담길 수 있다(서버 동작, 한계). 결과에 최종 연결을 보인다.
- 대본 `--input`은 빈 줄로 문단을 나눈다(웹 붙여 넣기의 빈 줄 규칙과 같고 화자 줄·긴 글 자동 나누기는 하지 않는다). 새 대본은 쉼 0.5초, 기본 성우는 `--voice`가 있으면 그 성우의 기본 설정, 없으면 비움이다. `save --input`은 기본 성우·쉼·화자를 유지하고, 글이 같은 문단(앞뒤 공백·줄바꿈을 정리해 비교하고, 빈 줄을 품은 기존 문단은 이어진 조각을 한 문단으로 맞춘다)은 그 문단을 글까지 그대로 순서대로 잇고 나머지는 새 문단이다. 빈 문단은 양옆 문단이 이어지면 제자리에 둔다. `scripts show --out .txt` 뒤 그대로 `save --input`하면 작업이 바뀌지 않아야 한다. 설정이 있는 빈 문단을 잃으면 손실 수에 넣는다. 설정이 있는 문단을 1개 이상 잃으면 수를 보이고 지우기와 같은 확인(TTY `y` 또는 `--yes`)을 받는다. `--work`는 작업 JSON 전체다.
- `save`는 `--version`(show에서 본 판)이 필요하고 판이 다르면 2(`stale`)다. `--force`만 판 없이 덮어쓴다. 상한은 서버가 검사하고 `BAD_REQUEST`를 2로 알린다. 최근 대본 등록(`scriptRecordRecent`)은 문단 작업의 일이라 T20에서 한다.

### 만들지 않는 것

샘플 재생, 성우 비교, 문단·드라마 묶음·자동 태그·숫자 검수(T20), 클론(T21), 최근 대본 등록, 프리셋·대본의 화면 편집기 기능, 여러 항목 한 번에 지우기, 새 DB 스키마·환경 변수.

### 인수 조건과 테스트 시나리오

1. CLI 변경이 웹 계약(같은 라우터)에서 그대로 보인다: 담기·연결·빼기, 채널·분류·프리셋·대본 만들기·고치기·지우기를 실제 라우터와 테스트 DB로 확인한다. 바꾸지 않은 칸은 그대로다.
2. 공급자별 조건 매핑과 거절, 페이지(`next`)·`stale`·`retryAt`, 공급자 사유(키 없음·한도)를 고정 응답으로 확인한다.
3. `REF` 찾기: 보관함 → `voices.json` → 목록 순서, 못 찾으면 4, 500명 상한, 24시간 만료, 로그아웃과 겹친 늦은 쓰기 폐기, 로그아웃 때 지움, 권한 0600.
4. 샘플: 허용되지 않은 주소·리다이렉트·`http:` 주소·느린 응답·큰 응답·형식 불일치는 파일 0개. 요청에 쿠키가 없다. 샘플과 시험 생성 호출이 섞이지 않는다(샘플 명령의 `synthesize` 0회).
5. 시험 생성: 완료 저장 실패 뒤 파일 성공·파일 실패 각각 재실행 `synthesize` 0회와 6, 5분 넘게 선 확인 프롬프트, 사유 없는 `NOT_FOUND`(4·기록 없음), 종류별 `resume` 목록 분리와 옛 기록 호환. T18 시나리오 2·3(동시 두 프로세스 1회, 응답 유실 뒤 0회, `--new`, 확정 거절 되돌리기)이 `trial`에서도 성립하고 `studio` 기록과 섞이지 않는다(같은 글이라도 지문이 다르다). `trialRequest`의 두 계정 격리·종류·만료.
6. 지우기: `--yes` 없는 비대화는 변경 0회, 없는 항목 4, 남의 항목 4, `categories remove <타입 ID>`는 4이고 변경 0회. 메모 없는 채널의 이름 변경, 채널을 바꾼 프리셋의 기본 지정 해제, `--channel-id none`. 같은 이름 2, 대본 판 충돌 2, `--force`만 덮어쓴다.
7. 입력 경계: 이름·메모·주소·제목 규칙, 200자, 대본 문단 200개·10,000자, `show --out` → `save --input` 왕복 불변과 설정 손실 확인, 1MiB 넘는 작업 JSON, 잘못된 JSON 파일·설정의 모르는 칸. JSON stdout 한 건, 종료 코드.
8. T17·T18 명령의 출력과 테스트가 그대로다.

너비·테마·키보드는 해당 없다(화면 변경 없음).

## 구현과 재사용

- `apps/cli/src/cli.ts`는 명령 표(이름 → 옵션·필수·실행 함수)만 두고 실행은 모듈로 옮긴다: `casting.ts`, `trial.ts`, `library.ts`(voices), `manage.ts`(채널·분류·프리셋·대본). 인자 해석은 지금의 `parseArgs` 하나를 쓴다.
- 유료 흐름(선점 → 재조회 → 생성 1회 → 해제, `recover`, 분류, 확인, Ctrl+C)은 `studio.ts`에서 `paid.ts`로 옮겨 종류별 함수(저장 결과 조회, 생성, 상태 조회)를 받는다. 옮기기 전후 T18 테스트가 그대로 통과해야 한다. 시험 생성만 다른 해제 조건은 `paid.ts`가 종류별 '완료 확인' 함수로 받는다.
- `files.ts`는 허용 확장자와 입력 상한을 인자로 받는다(`studio` 기본값 `.mp3`·`.wav`·1MiB는 그대로, 작업 JSON 2MiB+여유, 샘플·대본 확장자 추가).
- 런타임 공용 모듈은 값 import가 없는 `providers/trial-options`와 `providers/sample-hosts` 둘이다(둘 다 타입 import뿐). `script-rules`·`classification-rules`는 확장자 없는 값 import가 있어 Node가 바로 실행하지 못하므로 쓰지 않는다. 이름·제목·대본 상한은 서버가 거절한 것을 2로 알린다(`BAD_REQUEST` → 2).
- 서버: `packages/api/src/trial.ts`(`findStudioRequest`에 종류 추가), `routers/trial.ts`(`trialRequest`), 격리·데모 테스트. DB·환경 변수 변경 없음.

| 단계 | 수행자와 파일 | 즉시 검사 |
|---|---|---|
| 1 서버 | `prokit-api-builder`: `packages/api/src/{trial.ts,routers/trial.ts,routers/studio.ts,routers/trial.isolation.test.ts,trial-studio.test.ts,demo/client.test.ts}` | 격리 테스트 먼저, API 타입·테스트 |
| 2 CLI 기반·캐스팅·시험 생성 | `prokit-implementer`: `apps/cli/src/{cli,client,session,paid,studio,requests,casting,trial,files,output}.ts`와 그 테스트, `TEST.md` | T18 테스트 불변 통과 → 새 테스트 |
| 3 보관함·분류·프리셋·대본 | `prokit-implementer`(2단계 뒤): `apps/cli/src/{library,manage}.ts`, `cli.ts` 명령 표, 테스트, `README.md`·`SKILL.md` | 실제 라우터 E2E |
| 4 실행 확인 | `prokit-runtime-checker`: 설치본, 모의 공급자, 임시 PostgreSQL | 시나리오 1~7 |
| 5 리뷰 | `prokit-reviewer` code·security, ponytail-review | 지적 처리 |
| 문서 | Main: `docs/domain/project.md` API 표(`trialRequest`) | |

실제 공급자를 부르는 시험 생성은 사용자가 승인한 것만 한다. `casting search`·`providers status`·`voices check`·`casting sample`은 과금 없는 읽기지만 자동 테스트에서는 모의 응답을 쓴다. 되돌리기: 서버 조회는 읽기 전용 추가이고 CLI 커밋만 되돌려도 웹은 그대로다.
