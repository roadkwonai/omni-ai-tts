---
name: tts-provider
description: >-
  TTS Pilot에서 Typecast·ElevenLabs·Fish Audio·Airy 공급자 연동을 만들거나 바꾸거나 검토하거나 실제로 호출해 확인할 때
  사용한다. 성우 카탈로그와 기본 샘플, 음성 생성과 시험 생성, 클론 보이스 만들기·삭제, 공급자별 모델과 생성 옵션,
  예상 사용량과 요금 표시, 공급자 오류(키, 잔액, 429, 타임아웃)와 중복 과금, 오디오 업로드·다운로드·재생, 공급자
  API 키를 다룬다. TTS 붙여줘, 음성 생성 API, 성우 목록 불러오기, 내 보이스 클론, ElevenLabs·Typecast·Fish Audio·Airy
  연결, 생성 버튼, 크레딧이 두 번 빠졌어요, 실제로 생성해서 들어봐 같은 요청에 사용한다. 프로시저와 소유권 일반
  규칙은 bts-api, 테이블은 bts-db, 화면은 bts-web·bts-ui와 함께 읽는다.
---

# TTS 공급자 연동

정본은 다음과 같다. 이 스킬은 `bts-api`·`bts-db`·`bts-web` 위에 공급자 연동에만 있는 규칙을 더한다.
- 결정: `docs/adr/0002-orpc-only-api.md`. 공급자 호출은 `packages/api`의 TypeScript로 하고 Python 서비스는 두지 않는다.
- 요구사항: `docs/plans/tts-service-requirements.md`(REQ-01~13)와 `tasks/todo.md`의 P0 항목
- 공급자 계약: `docs/research/<typecast|elevenlabs|fish-audio|airy>-api-options.md`
- 용어: `GLOSSARY.md`

## 먼저
1. 공급자 코드를 쓰기 전에 그 공급자의 공식 문서(Typecast는 llms.txt)를 다시 확인한다. research 문서와 다른 점은 보고에 적는다. P0-15, P0-16, P0-25가 재확인을 요구한다.
2. SDK가 아직 설치되어 있지 않으면 `pnpm --filter @tts-pilot-app/api add <패키지>`로 추가한다(pnpm 공급망 정책은 우회하지 않는다). 메서드와 옵션은 설치한 판의 타입 선언(`packages/api/node_modules/<패키지>`)으로 확인한다. 기억이나 추측으로 쓰지 않는다.
3. 옵션 필드는 research 문서의 분류(UI, 서버 자동, 별도 기능)대로 매핑한다. 문서에서 확인하지 못한 가격, 한도, 파일 조건은 지어내지 않고 "정보 없음"으로 둔다(REQ-02, REQ-11).

## 구조
- 공급자 호출은 `packages/api/src/providers/<공급자>.ts`에만 둔다. 프로시저(`routers/`)는 이 모듈을 부르고 SDK를 직접 부르지 않는다.
- 공급자 공통 계약(성우, 생성 요청과 결과, 오류)은 zod로 한 번 정의해 화면까지 쓴다. 계약은 SDK나 서버 모듈을 import하지 않는 파일(`providers/contract.ts`)에 두어 클라이언트 번들에 공급자 모듈이 딸려 가지 않게 한다.
- Typecast와 ElevenLabs는 공식 SDK(`@neosapience/typecast-js`, `@elevenlabs/elevenlabs-js`)를 쓴다. Fish Audio·Airy는 REST를 `fetch`로 직접 부른다(ADR 0002). Airy 호스트는 `https://api.airy.so` 고정, 키는 `Authorization: Bearer`.
- 단, ElevenLabs 성우 목록·억양 조회는 REST로 부른다. SDK가 응답 전체를 한 번에 검사해(`parseOrThrow`) 성우 하나의 빠진 필드가 목록 전체를 막기 때문이다(T4). 키는 `xi-api-key` 헤더, 호스트는 `https://api.elevenlabs.io`로 고정한다.
- 키는 `apps/web/.env.schema`에 `@sensitive`로 선언된 값을 varlock `ENV`로 읽는다. 공급자 클라이언트는 소유자가 있는 요청마다 `apps/web/src/context.ts`가 `createProviders(키)`(`packages/api/src/providers/index.ts`)로 만들어 context의 `providers`로 넘긴다. 요청마다 만들어 `.env`의 키 교체가 반영된다. 소유자가 없는 요청에는 만들지 않는다. 루프백 요청이면 `publicProcedure`의 context에도 `providers`가 들어 있으므로 `publicProcedure`에서 `context.providers`를 쓰지 않는다. `packages/api`에서 `process.env`를 읽지 않는다.
- SDK 생성자에는 키와 공식 호스트를 명시적으로 넘긴다. 두 SDK는 인자가 없으면 `process.env`(`TYPECAST_API_KEY`·`TYPECAST_API_HOST`·`ELEVENLABS_API_KEY`)로 조용히 대체한다. 키가 없으면 클라이언트를 만들지 않고 그 공급자를 "연결 안 됨"으로 처리한다.
- 테스트는 `vi.stubGlobal("fetch", …)`로 HTTP 응답만 흉내 내어 SDK의 오류 처리까지 지나게 한다(두 SDK 모두 호출 시점의 전역 `fetch`를 쓴다). context의 `providers`에는 `createProviders({ … })`로 만든 클라이언트를 넣는다. `bts-api`의 `references/ownership-test.md`가 `db`를 넣는 방식과 같다.
- 코드 이름도 `GLOSSARY.md`를 따른다. Fish Audio API가 `model`이라 부르는 성우 개체는 코드에서 voice로 부르고, `s1`·`s2.1-pro` 같은 합성 엔진만 model로 부른다.

## 유료·상태 변경 호출: 생성, 시험 생성, 클론, 클론 삭제
- 누가 부를 수 있는지부터 막는다. 모든 사용자가 서버 키 하나를 같이 쓴다. 이 호출들을 여는 프로시저는 `protectedProcedure`로만 만들고, 소유자는 `context.ownerId`에서만 얻는다(REQ-01). 과금되지 않는 호출(연결 확인, 성우 목록, 사용량)도 서버 키를 쓰고 계정의 클론 목록을 돌려줄 수 있으므로 `protectedProcedure`로만 연다. 로그인(T14) 전에는 로컬 관리자 모드라서 보호가 네 겹이다. `protectedProcedure`가 production에서 모두 거절하고, 개발 서버는 `127.0.0.1`에서만 열리고, oRPC CSRF 플러그인이 다른 사이트의 호출을 막고, 루프백이 아닌 Host(DNS 리바인딩)에는 소유자를 주지 않는다. Better Auth 가입은 현재 열려 있어도 세션은 공급자 권한에 쓰지 않으며 서버가 만든 단일 `context.ownerId`만 권한을 준다. 그래서 T14 전에는 배포하지 않고 배포 환경에 공급자 키를 넣지 않는다. T14부터는 공통 미들웨어가 세션 사용자를 서버 환경변수의 허용 목록과 비교해 `FORBIDDEN`을 던지고, 목록이 비면 모두 거부한다. 가입 차단(`disableSignUp`)은 추가 방어일 뿐이다. 가입이 열려 있던 동안 만든 계정은 막지 못하기 때문이다.
- 자동 테스트, 타입 검사, 빌드, 브라우저 QA에서는 실제 공급자를 부르지 않는다. 브라우저 QA에서 생성·시험 생성·클론·삭제 버튼은 누르지 않고 그 앞 상태까지만 확인한다.
- "실제 한국어 생성·청취" 같은 실제 호출 확인은 사용자가 그 호출을 승인한 뒤에만 한다. 승인 요청에는 공급자, 모델, 대본 길이, 호출 횟수를 적는다. 대본 길이는 Fish Audio면 UTF-8 바이트로 적는다. 짧은 대본으로 한 번만 부른다.
- 증거에는 공급자, 모델, 사용량, 결과 파일 경로를 적는다. 키, 요청 헤더, 전체 응답은 적지 않는다. 청취 결과는 `[confirm]` 행에 사용자가 들은 내용으로 적는다.
- 기본 샘플 청취는 공급자가 준 샘플 URL을 재생하는 것이라 과금되지 않는다. 샘플 재생과 시험 생성을 한 프로시저나 한 버튼으로 합치지 않고, 시험 생성을 자동으로 부르지 않는다(REQ-03).
- `bts-implementer`에게는 실제 호출을 맡기지 않는다(외부 서비스 호출 금지 규칙).

## 중복 과금 막기 (REQ-09, REQ-11)
- 생성·클론 프로시저는 클라이언트가 사용자 동작 하나에 한 번 만든 요청 id(uuid)를 받는다. 재전송할 때는 같은 값을 쓴다. 서버는 소유자별 `(owner_id, request_id)` 유니크 제약이 있는 기록 행을 공급자 호출 **전에** insert해 선점한다. 충돌하면 공급자를 부르지 않고 기존 행의 상태나 결과를 돌려준다. 같은 id에 다른 입력이 오면 `BAD_REQUEST`다. 조회한 뒤 호출하는 방식은 동시에 들어온 두 요청을 막지 못한다. 버튼 잠금은 보조 수단이다.
- T5 순서: 키 없음·무료 모델 종료 검사는 기존 요청 재생보다 먼저 한다. 이미 선점된 같은 요청 id는 429 대기 조회보다 먼저 기존 상태·결과를 재생하고, 새 요청만 대기 시각을 확인한다.
- 사용자별 동시 진행은 1건이다. 이것도 조회로 확인하지 않고 선점 insert에서 막는다. T5는 진행 중 상태에만 거는 `owner_id` 부분 유니크 인덱스를 쓰고, 충돌하면 `TOO_MANY_REQUESTS`다. 5분 지난 pending 행은 "처리 여부 미확인"으로 옮겨 다음 요청을 막지 않게 한다.
- 공급자 429의 `Retry-After` 시각은 공급자별로 DB에 두고, 그 전에는 다시 부르지 않는다. 서버리스 인스턴스끼리 메모리를 나누지 않기 때문이다. 잔액·인증·입력 오류는 사용자가 조치하기 전에 반복하지 않는다.
- 생성·클론 호출은 SDK 자동 재시도를 끈다. ElevenLabs SDK는 408·429·5xx에서 기본 2회 다시 보내므로 요청 옵션에 `maxRetries: 0`을 준다. 과금이 없는 조회 호출은 재시도해도 된다. 다만 성우 목록은 아래 "목록 규칙"대로 자동 재시도하지 않는다.
- 공급자 응답 상태 코드를 받지 못한 실패는 "처리 여부 미확인"이다. SDK가 연결 끊김을 statusCode 없는 오류로 바꿔 던질 수 있으므로 네트워크 오류도 포함한다. 자동으로 다시 생성하지 않는다. 일반 재시도는 먼저 같은 조합의 저장본을 찾아 재생하고, 없으면 확인 후 다시 만든다. 명시적 새로 만들기만 저장본 조회를 건너뛴다. T5는 완료 저장이 실패해도 받은 오디오를 반환하고, 그 기록은 pending으로 남아 뒤에 unknown 처리된다.

## 오류 매핑
공급자 문제를 `UNAUTHORIZED`나 `FORBIDDEN`으로 던지지 않는다. 클라이언트가 로그인 만료로 처리한다. 아래 코드에 `data: { provider, reason }`을 붙여 던지고, 화면은 `reason`으로 안내를 고른다.

| 공급자 응답 | `ORPCError` 코드 | `reason` |
|---|---|---|
| 401·403 (서버 키 문제) | `BAD_GATEWAY` | `provider_auth` |
| 401·403이면서 본문 `detail.code`·`detail.status`가 `missing_permissions`·`insufficient_permissions` (키 권한 부족) | `BAD_GATEWAY` | `no_permission` |
| 잔액·플랜 한도 부족 (402 등 공급자별) | `BAD_GATEWAY` | `quota` |
| 429 | `TOO_MANY_REQUESTS` | `rate_limit` |
| 400·422 입력 거절 | `BAD_REQUEST` | `provider_input` |
| 5xx | `BAD_GATEWAY` | `provider_error` |
| 타임아웃, 연결 끊김 | `GATEWAY_TIMEOUT` | `unknown_outcome` |

- Airy는 본문 `error.code`만 읽는다(`airyCodes`). 403 `account_banned`는 `provider_auth`다. 입력 거절 화면 문구는 공급자 코드를 보이지 않는다.
- 판정은 `packages/api/src/providers/errors.ts`의 `reasonFromHttp`가 한다. SDK 오류는 `ProviderHttpError`(상태 코드, 공급자 오류 코드, `Retry-After`)로 바꿔 담는다. 로그에는 허용한 오류 코드·공급자·정규화된 사유 또는 검증 필드 경로만 남긴다. 문장, SQL, 연결 문자열, 키, SDK 오류 객체와 cause, 응답 본문·헤더, 오류 메시지는 로그에 남기지 않는다.
- 연결 확인(`providerStatus`)은 던지지 않고 연결 상태 값으로 돌려준다(`runCheck`). 입력 거절(400·422)과 표에 없는 상태는 `check_failed`다. 이 확인의 시간 초과·연결 끊김은 `unknown_outcome`이 아니라 `check_failed`다. 상태를 바꾸지 않는 조회라 처리 여부를 따질 필요가 없다.
- 목록·생성처럼 결과가 필요한 호출은 `runList`처럼 사유를 붙여 던진다(`providers/errors.ts`). 목록 조회의 시간 초과·연결 끊김은 T3 스펙 4절대로 `GATEWAY_TIMEOUT`·`unknown_outcome`(화면 문구 '응답하지 않아요')이고, 응답 검증 실패는 `provider_error`다.
- 목록 응답은 항목 단위로 검사한다. 응답 모양(배열이 아님, 유형 필드 없음)이 어긋나면 `provider_error`, 성우 하나가 어긋나면 그 성우만 빼고 뺀 수와 필드 이름만 한 줄 남긴다(`[voiceList] typecast 성우 N명 제외: voice_name`). 샘플 주소만 어긋나면(https가 아니거나 공급자 호스트 typecast.ai가 아님) 그 성우의 샘플을 null로 둔다. 모두 빠지면 `provider_error`다.
- SDK 오류 객체를 `cause`로 넘기거나 그대로 로그에 쓰지 않는다. rpc 라우트의 `onError`는 의도한 4xx를 남기지 않고, 사유(`data.reason`)가 붙은 공급자 오류는 `[rpc] 코드 공급자 사유` 한 줄만 남긴다. 출력 검증 오류는 오류 코드, 고정 표식 `validation`, 필드 경로만 남긴다. 그 밖의 오류는 ORPC 코드 또는 고정 코드 `UNEXPECTED_ERROR`만 남긴다. `error.message`나 원시 오류 객체는 기록하지 않는다.
- 한 공급자의 장애가 다른 공급자의 목록이나 생성을 막지 않게 공급자별로 따로 처리한다(REQ-02).

## 목록 규칙 (T4)
- 목록 캐시(`packages/api/src/voice-cache.ts`)는 조건별로 24시간 보관한다. 공급자가 실패하면 지난 목록(만료 뒤 7일까지)을 `stale`로 돌려준다. DB가 실패하면 캐시 없이 공급자를 부른다(목록만. 유료 호출은 대기 표 조회가 실패하면 부르지 않는다, T5). DB 연결·질의 시간 제한은 3초다(`connectionTimeoutMillis`, `query_timeout`).
- 캐시 행에는 공급자 모듈이 변환하고 거른 성우가 들어 있다. 계약이나 공급자 모듈의 변환·거르기(샘플 호스트 포함)가 바뀌면 `CONTRACT_VERSION`을 올린다(또는 개발 DB의 `provider_list_cache`를 비운다). 안 올리면 옛 모양의 행이 24시간 그대로 보인다.
- 계정 목록 행만 소유자 id가 있다. 소유자는 서버가 정하고 입력에서 받지 않는다. 공개 목록·억양 행은 소유자 null이라 소유자끼리 함께 쓴다.
- 429 `Retry-After`(1시간 상한)는 `provider_cooldown` 표에 적고, 그 전에는 부르지 않는다. '목록 새로 고침'(`voiceListRefresh`)도 대기 중이면 아무것도 바꾸지 않고 시각만 돌려준다.
- 목록 조회는 서버(`runList`)·화면(`LIST_QUERY`의 `retry: false`) 모두 자동 재시도하지 않는다. 다시 부르는 것은 사용자가 누를 때뿐이다.
- Fish Audio 목록의 시간 제한은 20초다(그 밖의 목록·연결 확인은 10초).
- 샘플 주소 허용 호스트는 넷이다: Typecast `*.typecast.ai`, ElevenLabs `storage.googleapis.com`·`*.elevenlabs.io`, Fish Audio `*.fish.audio`, Airy `assets.airy.so`(정확히 하나). 샘플은 주소가 같으면 처음 것만 남긴다(화면 패널의 key가 주소다).
- Fish Audio 목록은 `svc`·학습 전·삭제 요청 성우를 응답에서 거르고, 여러 태그·언어는 반복 키이며 모두 포함(AND)이다. 공개 출처는 `visibility`가 `public`인 성우만 보인다. 공용 공개 캐시 행에 워크스페이스 비공개 성우가 섞이지 않게 하려는 것이다.
- 입력 상한: 조건 배열 40개(화면 선택지 최대치보다 크게), 조건 값 40자(`[A-Za-z0-9_-]`), 검색어 100자. Fish Audio 페이지는 1~10(조건마다 1,000명)이다.
- Airy 목록은 공식 `GET /v1/voices`(키)와 공개 카탈로그 `GET /v1/studio/voices`(키 보내지 않음, 문서 없음)를 함께 부르고 id로 샘플(한국어 → 영어)을 붙인다. 카탈로그는 `withTimeout` 8초로 끊고, 실패하면 목록은 그대로 두고 `[voiceList] airy 샘플 카탈로그 실패: <오류 이름>` 한 줄만 남긴다.
- 카탈로그 실패 목록도 24시간 공용 캐시에 남는다. 화면은 모든 성우에 샘플이 없으면 '목록 새로 고침'을 안내하고(`samplesMissing`), 새로 고침이 회복한다(U1).
- ElevenLabs 목록·억양은 `fetchJson`(`providers/errors.ts`)으로 부른다. 리다이렉트를 따라가지 않고(`redirect: "error"`), 실패하면 상태 코드·공급자 오류 코드·`Retry-After`만 바꿔 담는다.

## 성우 한 명 조회 (T7 보관함 이용 가능 확인)
- `ProviderClient.getVoice(source, voiceId, preferred?)`는 읽기 호출이다. 결과는 `Voice` 또는 `null`(공급자가 "없다"고 답함)이다. 세 공급자 문서 모두 이 조회의 과금 문구가 없고 무료라고 명시하지도 않는다(2026-10-07). 그래서 목록 조회와 같은 읽기 호출로 다루되 `savedVoiceCheck`는 24시간에 한 번, 한 번에 40명, 공급자마다 동시 2건으로 부르고 자동 재시도하지 않는다. 시간 제한은 `runList`의 10초다.
- "없음"은 `errors.ts`의 `nullOnStatus`로 판정한다. Typecast·ElevenLabs는 404만이다. Fish Audio는 403·404와, 응답이 왔어도 `fishVoice`가 `null`인 성우(학습 전·삭제 요청·공개 출처인데 비공개)다. 그 밖의 오류는 `runList`의 목록 매핑(401·403 → `provider_auth`·`no_permission`, 429 → `rate_limit`, 5xx → `provider_error`, 시간 초과 → `unknown_outcome`)을 그대로 따른다.
- ElevenLabs 공개 라이브러리 성우(`source: "public"`)는 한 명 조회 방법이 공식 문서에 없어 확인하지 않는다. 라우터가 확인 대상에서 빼고, 공급자 모듈은 불러도 `provider_error`로 거절한다. 계정에 추가하는 호출(`POST /v1/voices/add/…`)은 계정 상태를 바꾸므로 쓰지 않는다. 계정 성우는 REST `GET /v1/voices/{id}`로 부르고 담을 때 고른 샘플 언어(`preferred`)를 지킨다.
- 라우터가 이 오류를 다루는 규칙: `rate_limit`이면 대기 시각(`Retry-After`가 없으면 60초. Typecast SDK는 헤더를 주지 않는다)을 `provider_cooldown`에 적고 그 공급자를 멈춘다. `provider_auth`·`no_permission`·`quota`면 기록 없이 그 공급자를 멈춘다. 5xx·시간 초과는 그 행을 그대로 둔다.
- Airy는 한 명 조회 호출이 없어 목록에서 찾는다. 목록 약속을 클라이언트 하나(요청 하나)에 한 번만 만든다. 없으면 null. 카탈로그만 실패한 확인에서는 저장한 샘플이 비워진다(백로그 T7.5-02).
- 시험 생성·생성의 voice id 허용 검사("클론 보이스" 절)도 이 호출을 쓸 수 있다. Typecast 단건 조회는 `voice_type`을 거르지 않고, Fish Audio는 공개 출처에서만 `visibility`를 거른다.

## 클론 보이스와 공급자 리소스 소유권 (REQ-01, REQ-13)
- 모든 사용자가 공급자 계정 하나(서버 키)를 같이 쓴다. 그래서 계정 단위 목록에는 모든 사용자의 클론이 섞인다. ElevenLabs 계정 성우, Fish Audio 내 모델, Typecast custom voice 목록이 그렇고, Typecast 기본 목록 `GET /v3/voices`도 완료된 커스텀 성우를 함께 돌려준다. Airy는 미확인(T14에서 확인). 이 목록을 그대로 보여 주거나 허용 목록으로 쓰지 않는다.
- 예외(T4 목록, T5 듣기): 앱의 공급자 권한은 development·test의 루프백 Host에서 서버가 정한 단일 `context.ownerId`에서 온다. 가입은 열려 있어도 Better Auth 세션은 공급자 권한에 쓰지 않는다. 현재 이 한 명 소유 예외에서는 `ownerId`가 있는 요청의 계정 성우를 보여 주며, 내 문장 듣기는 성우 소유권을 조회하지 않고 공급자의 거절(과금 없는 오류)에 맡긴다. 목록 캐시의 계정 행은 소유자별이다. 아래의 일반적인 모든 voice id 서버 조회 규칙은 이 단일 소유 예외가 끝난 뒤, 허용 소유자가 둘 이상이 되거나 T14 세션 권한을 도입할 때 적용한다. 그때는 클론 voice id를 앱 소유 매핑 또는 공급자 공개 성우 기준으로 검사한다(로드맵 T14 메모).
- 클론은 앱 DB의 소유 매핑(`userId`, 공급자, 공급자 voice id)으로 관리한다. 매핑의 voice id는 앱이 부른 클론 생성의 응답에서만 기록한다. voice id를 입력받아 기존 클론을 내 것으로 등록하는 기능은 만들지 않는다. 공용 계정에서는 id를 아는 사람이 남의 클론을 먼저 가져갈 수 있다. 앱 밖(공급자 웹)에서 만든 클론을 가져와야 하면 구현 전에 사용자에게 묻는다(REQ-13 7번: 자동 소유자 배정 금지).
- 합성과 시험 생성: 요청에 들어가는 모든 voice id(Fish Audio `reference_id` 배열 포함)를 검사한다. 판정에는 서버가 그 id로 직접 조회한 결과만 쓴다. 클라이언트가 보낸 유형 값이나 목록은 믿지 않는다. 허용하는 경우는 둘이고, 둘 다 아니면 공급자를 부르지 않고 `NOT_FOUND`다.
  - 세션 사용자의 매핑에 있고 상태가 "사용 가능"인 클론. 처리 중, 실패, 삭제 대기면 거절한다(REQ-13 9번: 삭제 요청 뒤 신규 합성 차단).
  - 공급자별 기준을 통과한 공개 성우. Typecast는 `GET /v3/voices/{id}`가 `voice_type=original`인 것, Fish Audio는 `GET /model/{id}`가 `visibility=public`인 것이다(`private`·`unlist`는 매핑이 있어야 한다). ElevenLabs는 research 문서에 유형 필드가 아직 없다. 구현할 때 공식 문서로 기본 성우와 공개 라이브러리 성우를 판정할 필드를 확인해 research 문서에 적고, 그 전에는 매핑만 허용한다.
- 공급자 요청 본문은 계약에 있는 필드로만 서버가 만든다. 입력을 그대로 넘기지 않는다. Fish Audio `references`(요청 안의 원본 오디오로 하는 즉석 클론)는 동의·소유 매핑을 거치지 않으므로 보내지 않는다.
- 삭제와 상태 조회: 입력은 매핑 행 id다. `and(eq(<클론 테이블>.id, id), eq(<클론 테이블>.userId, session.user.id))`로 찾은 공급자 voice id만 공급자에게 보낸다. 공개 성우는 삭제 대상이 아니다.
- 클론은 서버에서 공개 범위를 비공개로 고정한다(Fish Audio `visibility: "private"`를 명시해 보낸다). 공개·공유 옵션은 화면에 두지 않는다. 공개하면 공개 라이브러리로 나가 본인 음성 동의 범위(REQ-13)를 넘는다.
- 이 검사들은 `bts-api` 불변식 7(권한 판정)에 해당하므로 security 리뷰 대상이다.
- 업로드 전에 본인 음성 동의와 전송할 공급자를 받고 동의 시각을 기록한다. 원본 오디오는 앱에 영구 보관하지 않는다. 성공, 실패, 취소, 그리고 업로드 뒤 클론 요청이 오지 않은 시간 초과 때도 정리한다(REQ-13 8번). 서버를 거치지 않는 업로드를 정하는 ADR에는 만료 시간과 만료된 원본을 지우는 방법을 적는다.

## 오디오 입출력 (Vercel 제한, ADR 0002)
- Vercel 함수의 요청·응답 본문은 4.5MB까지다. 오디오를 base64 JSON으로 돌려주지 않는다(크기가 약 1.33배가 된다). oRPC RPC 프로토콜은 `File`·`Blob`을 바이너리 그대로 주고받으므로 프로시저가 `File`을 돌려주면 된다(`@orpc/client` 1.15.4 직렬화기에서 확인). 결과 크기는 대략 길이 × 비트레이트다. 128kbps MP3는 1분에 약 1MB이므로 2,000자 한국어 대본은 한도에 가까워질 수 있다. 넘을 수 있으면 전송 방식(Blob 저장 뒤 서명 URL, 스트리밍)을 사용자와 정하고 ADR로 남긴다. 저장소는 P1-02에서 미정이다.
- 클론 원본은 공급자 권장 길이(Fish Audio 1~2분)의 WAV면 4.5MB를 넘기 쉽다. 브라우저 녹음은 `MediaRecorder`의 압축 형식을 쓰되 공급자가 받는 형식인지 research 문서로 확인한다.
- 서버를 거치지 않는 업로드가 필요하면 ADR로 정한다. 업로드 토큰을 주는 라우트는 세션과 소유자 제한을 검사하고 크기·형식 상한을 건다. 원본은 비공개 접근, 사용자별 경로에 둔다. 서버는 자신이 기록한 경로로만 원본을 읽고, 클라이언트가 준 URL을 가져오지 않는다. `apps/web/src/app/api/` 아래에 두면 `authPaths`가 security 리뷰 행을 붙이고, 그 밖에 두면 대조표에 직접 추가한다. 로그인(T14) 전에 만든다면 `AGENTS.md`의 로컬 관리자 모드 'Route Handler 금지' 예외를 그 ADR에 적는다.
- 업로드는 서버에서 크기, 형식(파일 앞 바이트), 길이를 다시 검사한다(REQ-13).
- SDK의 오디오 인자에는 바이트(`Uint8Array`, `Blob`, `File`)만 넘긴다. Typecast SDK의 `cloneVoice`는 문자열을 서버 파일 경로로 읽어 업로드하므로 입력 문자열이 닿으면 서버 파일이 공급자에게 나간다.
- 긴 대본 결합과 ffmpeg 후처리는 P1-04 범위다(ADR 0002: Blob과 백그라운드 작업). P0에서 미리 만들지 않는다.

## 사용량 표시 (REQ-11)
- 예상 사용량 단위는 공급자마다 다르다. Typecast·ElevenLabs는 글자 수, Fish Audio는 UTF-8 바이트다(서버 `Buffer.byteLength(text, "utf8")`, 브라우저 `new TextEncoder().encode(text).length`). 한글은 대부분 한 글자가 3바이트다. 교정을 반영한 발음용 대본으로 계산한다.
- Airy는 크레딧 = 코드 포인트 × 1.5(ko) 또는 × 1(en), 올림(`AIRY_CREDITS_PER_CHAR`). 확인 창 근거 '(Airy 요금 기준: 한국어 1글자 1.5크레딧)'. 근거는 고른 언어를 따른다(영어는 '영어 1글자 1크레딧'). 남은 크레딧은 소수 한 자리 버림(`creditNumber`).
- 금액은 공급자 문서에 근거가 있을 때만 출처와 함께 보여 준다. 예상치와 공급자가 돌려준 실제 사용량을 구분한다.

## 화면 (`bts-web`, `bts-ui`와 함께)
- Typecast 기본 샘플 주소는 서명 없는 고정 주소다(2026-10-04 실측). 주소에 서명·만료가 생기면 만료를 따로 구분한다.
- 한 번에 한 오디오만 재생한다(REQ-03). `URL.createObjectURL`로 만든 주소는 교체하거나 언마운트할 때 `URL.revokeObjectURL`한다.
- 마이크 권한은 녹음 버튼을 누를 때 요청하고, 멈추거나 화면을 떠날 때 모든 `MediaStreamTrack`을 `stop()`한다(REQ-13).
- 다운로드는 이미 받은 결과를 쓴다. 다운로드가 생성을 다시 부르지 않는다(REQ-10).
- 진행률은 공급자가 준 값만 보여 준다. 가짜 진행률을 만들지 않는다(REQ-11).

## 확인한 SDK 동작 (2026-09-28, 2026-09-30, 2026-10-04, 2026-10-07, npm 패키지 소스)
| SDK | 판 | 동작 |
|---|---|---|
| `@elevenlabs/elevenlabs-js` | 2.70.0 | 기본 `maxRetries` 2, 408·429·5xx 재시도(요청 옵션 `maxRetries: 0`으로 끈다). 키가 없으면 `process.env.ELEVENLABS_API_KEY`, 그래도 없으면 생성자가 예외. 요청 옵션 `maxRetries`·`abortSignal`·`timeoutInSeconds`(기본 240초). 네트워크 오류는 `errors/handleNonStatusCodeError.js` 경로에서 `statusCode` 없는 `ElevenLabsError`로 던질 수 있다. 프로젝트는 합성마다 `maxRetries: 0`, 60초 `AbortSignal`, fetch `redirect: "error"`를 적용한다. `undefined` 필드는 SDK 직렬화 때 `null`이 되므로 요청에서 생략한다. 구독 조회 `user.subscription.get()`과 voice 목록은 응답 전체를 검사한다. HTTP는 호출 시점의 전역 `fetch` |
| `@neosapience/typecast-js` | 0.4.15 | 키가 없으면 `process.env.TYPECAST_API_KEY`(없어도 헤더 없이 요청), 호스트는 `TYPECAST_API_HOST`. 생성자 `{ apiKey, baseHost, source, generatedBy }`에서 `source`와 `generatedBy`는 함께 줘야 하고 형식이 틀리면 생성자가 예외(연동 식별은 `source: "api-docs"`, `generatedBy: "codex"`). SDK에는 시간 제한·취소·재시도·응답 검증이 없다. 구독 조회 `getMySubscription()`. HTTP 오류는 `TypecastAPIError`(`statusCode`, `response`)이고 응답 헤더가 없어 `Retry-After`를 읽지 못한다. 프로젝트는 설치본 fetch를 `redirect: "error"`로 패치했다. T5 대기 종료 뒤에도 공급자 요청은 계속될 수 있다. SDK는 TTS `seed`를 보내지 않는다. 한 명 조회 `getVoiceV3(voiceId)`(`GET /v3/voices/{id}`, 경로에 `encodeURIComponent`)는 시간 제한·취소·재시도가 없어 `runList`의 10초 경주로만 끊는다. 404는 `TypecastAPIError.statusCode`로 오고 헤더가 없어 429의 `Retry-After`는 읽지 못한다(2026-10-07) |

판을 올리면 이 표를 다시 확인한다.

## 검사
- `bts-api` 격리 테스트에 흉내 낸 fetch 응답으로 다음 경우를 더한다.
  ① 같은 요청 id를 동시에 두 번 보내면 공급자 호출이 1회다. 다른 요청 id 둘을 동시에 보내도 진행은 1건이다.
  ② 공급자 401·429·타임아웃이 위 표의 코드로 바뀐다.
  ③ B가 A의 클론 voice id로 생성하면 `NOT_FOUND`이고 공급자 호출은 0회다. 공급자 목록에 섞여 나온 A의 클론 id, 다른 사용자의 비공개 Fish Audio 모델 id, 삭제를 요청한 자기 클론으로 시도해도 같다.
  ④ B가 A의 매핑 행 id나 공개 성우 id로 삭제하면 `NOT_FOUND`이고 공급자 호출은 0회다.
  ⑤ 소유자가 없는 context(`ownerId: null`, production의 로컬 관리자 모드)는 유료 호출 프로시저에서 `UNAUTHORIZED`이고 공급자 호출은 0회다. T14부터는 허용 목록에 없는 세 번째 계정 C가 `FORBIDDEN`이고 공급자 호출은 0회다. ③·④의 A와 B는 context의 `ownerId`로 넣는다(T14 뒤에는 허용 목록에도 넣는다). 그래야 거절보다 소유권 검사까지 도달한다.
- `packages/api/src/providers/`는 `.dev-cycle.json`의 `authPaths`에 있어 security 리뷰 행이 자동으로 붙는다.
- 실제 호출은 "유료 호출" 절대로 사용자가 승인할 때만 한다.
