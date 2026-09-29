---
name: tts-provider
description: >-
  TTS Pilot에서 Typecast·ElevenLabs·Fish Audio 공급자 연동을 만들거나 바꾸거나 검토하거나 실제로 호출해 확인할 때
  사용한다. 성우 카탈로그와 기본 샘플, 음성 생성과 시험 생성, 클론 보이스 만들기·삭제, 공급자별 모델과 생성 옵션,
  예상 사용량과 요금 표시, 공급자 오류(키, 잔액, 429, 타임아웃)와 중복 과금, 오디오 업로드·다운로드·재생, 공급자
  API 키를 다룬다. TTS 붙여줘, 음성 생성 API, 성우 목록 불러오기, 내 보이스 클론, ElevenLabs·Typecast·Fish Audio
  연결, 생성 버튼, 크레딧이 두 번 빠졌어요, 실제로 생성해서 들어봐 같은 요청에 사용한다. 프로시저와 소유권 일반
  규칙은 bts-api, 테이블은 bts-db, 화면은 bts-web·bts-ui와 함께 읽는다.
---

# TTS 공급자 연동

정본은 다음과 같다. 이 스킬은 `bts-api`·`bts-db`·`bts-web` 위에 공급자 연동에만 있는 규칙을 더한다.
- 결정: `docs/adr/0002-orpc-only-api.md`. 공급자 호출은 `packages/api`의 TypeScript로 하고 Python 서비스는 두지 않는다.
- 요구사항: `docs/plans/tts-service-requirements.md`(REQ-01~13)와 `tasks/todo.md`의 P0 항목
- 공급자 계약: `docs/research/<typecast|elevenlabs|fish-audio>-api-options.md`
- 용어: `CONTEXT.md`

## 먼저
1. 공급자 코드를 쓰기 전에 그 공급자의 공식 문서(Typecast는 llms.txt)를 다시 확인한다. research 문서와 다른 점은 보고에 적는다. P0-15, P0-16, P0-25가 재확인을 요구한다.
2. SDK가 아직 설치되어 있지 않으면 `pnpm --filter @tts-pilot-app/api add <패키지>`로 추가한다(pnpm 공급망 정책은 우회하지 않는다). 메서드와 옵션은 설치한 판의 타입 선언(`packages/api/node_modules/<패키지>`)으로 확인한다. 기억이나 추측으로 쓰지 않는다.
3. 옵션 필드는 research 문서의 분류(UI, 서버 자동, 별도 기능)대로 매핑한다. 문서에서 확인하지 못한 가격, 한도, 파일 조건은 지어내지 않고 "정보 없음"으로 둔다(REQ-02, REQ-11).

## 구조
- 공급자 호출은 `packages/api/src/providers/<공급자>.ts`에만 둔다. 프로시저(`routers/`)는 이 모듈을 부르고 SDK를 직접 부르지 않는다.
- 공급자 공통 계약(성우, 생성 요청과 결과, 오류)은 zod로 한 번 정의해 화면까지 쓴다. 계약은 SDK나 서버 모듈을 import하지 않는 파일(`providers/contract.ts`)에 두어 클라이언트 번들에 공급자 모듈이 딸려 가지 않게 한다.
- Typecast와 ElevenLabs는 공식 SDK(`@neosapience/typecast-js`, `@elevenlabs/elevenlabs-js`)를 쓴다. Fish Audio는 REST를 `fetch`로 직접 부른다(ADR 0002).
- 키는 `apps/web/.env.schema`에 `@sensitive`로 선언된 값을 varlock `ENV`로 읽는다. `apps/web/src/services.ts`가 `createDb(ENV)`처럼 공급자 클라이언트를 만들고 `apps/web/src/context.ts`가 context로 넘긴다. `packages/api`에서 `process.env`를 읽지 않는다.
- SDK 생성자에는 키와 공식 호스트를 명시적으로 넘긴다. 두 SDK는 인자가 없으면 `process.env`(`TYPECAST_API_KEY`·`TYPECAST_API_HOST`·`ELEVENLABS_API_KEY`)로 조용히 대체한다. 키가 없으면 클라이언트를 만들지 않고 그 공급자를 "연결 안 됨"으로 처리한다.
- 테스트는 context에 가짜 공급자를 넣는다. `bts-api`의 `references/ownership-test.md`가 `db`를 넣는 방식과 같다.
- 코드 이름도 `CONTEXT.md`를 따른다. Fish Audio API가 `model`이라 부르는 성우 개체는 코드에서 voice로 부르고, `s1`·`s2.1-pro` 같은 합성 엔진만 model로 부른다.

## 유료·상태 변경 호출: 생성, 시험 생성, 클론, 클론 삭제
- 누가 부를 수 있는지부터 막는다. 모든 사용자가 서버 키 하나를 같이 쓰는데 지금은 가입이 열려 있다(`packages/auth`의 `emailAndPassword`). 이 호출들을 여는 프로시저에는 호출마다 소유자 검사(REQ-01)를 두고, 그 뒤에만 연결한다. 공통 미들웨어가 세션 사용자를 서버 환경변수의 허용 목록과 비교해 `FORBIDDEN`을 던지고, 목록이 비면 모두 거부한다. 가입 차단(`disableSignUp`)은 추가 방어일 뿐이다. 가입이 열려 있던 동안 만든 계정은 막지 못하기 때문이다. 소유자 검사가 없는 배포 환경에는 공급자 키를 넣지 않는다.
- 자동 테스트, 타입 검사, 빌드, 브라우저 QA에서는 실제 공급자를 부르지 않는다. 브라우저 QA에서 생성·시험 생성·클론·삭제 버튼은 누르지 않고 그 앞 상태까지만 확인한다.
- "실제 한국어 생성·청취" 같은 실제 호출 확인은 사용자가 그 호출을 승인한 뒤에만 한다. 승인 요청에는 공급자, 모델, 대본 길이, 호출 횟수를 적는다. 대본 길이는 Fish Audio면 UTF-8 바이트로 적는다. 짧은 대본으로 한 번만 부른다.
- 증거에는 공급자, 모델, 사용량, 결과 파일 경로를 적는다. 키, 요청 헤더, 전체 응답은 적지 않는다. 청취 결과는 `[confirm]` 행에 사용자가 들은 내용으로 적는다.
- 기본 샘플 청취는 공급자가 준 샘플 URL을 재생하는 것이라 과금되지 않는다. 샘플 재생과 시험 생성을 한 프로시저나 한 버튼으로 합치지 않고, 시험 생성을 자동으로 부르지 않는다(REQ-03).
- `bts-implementer`에게는 실제 호출을 맡기지 않는다(외부 서비스 호출 금지 규칙).

## 중복 과금 막기 (REQ-09, REQ-11)
- 생성·클론 프로시저는 클라이언트가 사용자 동작 하나에 한 번 만든 요청 id(uuid)를 받는다. 재전송할 때는 같은 값을 쓴다. 서버는 `(userId, requestId)` 유니크 제약이 있는 기록 행을 공급자 호출 **전에** insert해 선점한다. 충돌하면 공급자를 부르지 않고 기존 행의 상태나 결과를 돌려준다. 같은 id에 다른 입력이 오면 `BAD_REQUEST`다. 조회한 뒤 호출하는 방식은 동시에 들어온 두 요청을 막지 못한다. 버튼 잠금은 보조 수단이다.
- 사용자별 동시 진행은 1건이다. 이것도 조회로 확인하지 않고 선점 insert에서 막는다. 예를 들어 진행 중 상태에만 거는 `userId` 부분 유니크 인덱스를 두고, 충돌하면 `TOO_MANY_REQUESTS`다. 함수 최대 실행 시간(ADR 0002: 300초)보다 오래 진행 중인 행은 "처리 여부 미확인"으로 옮겨 다음 요청을 막지 않게 한다.
- 공급자 429의 `Retry-After` 시각은 공급자별로 DB에 두고, 그 전에는 다시 부르지 않는다. 서버리스 인스턴스끼리 메모리를 나누지 않기 때문이다. 잔액·인증·입력 오류는 사용자가 조치하기 전에 반복하지 않는다.
- 생성·클론 호출은 SDK 자동 재시도를 끈다. ElevenLabs SDK는 408·429·5xx에서 기본 2회 다시 보내므로 요청 옵션에 `maxRetries: 0`을 준다. 과금이 없는 목록·조회 호출은 재시도해도 된다.
- 타임아웃이나 연결 끊김은 실패가 아니라 "처리 여부 미확인"이다. 자동으로 다시 생성하지 않는다. 사용자에게 상태를 알리고, 공급자가 기록을 조회할 수 있으면 확인한 뒤 다시 할지 사용자가 정한다.

## 오류 매핑
공급자 문제를 `UNAUTHORIZED`나 `FORBIDDEN`으로 던지지 않는다. 클라이언트가 로그인 만료로 처리한다. 아래 코드에 `data: { provider, reason }`을 붙여 던지고, 화면은 `reason`으로 안내를 고른다.

| 공급자 응답 | `ORPCError` 코드 | `reason` |
|---|---|---|
| 401·403 (서버 키 문제) | `BAD_GATEWAY` | `provider_auth` |
| 잔액·플랜 한도 부족 (402 등 공급자별) | `BAD_GATEWAY` | `quota` |
| 429 | `TOO_MANY_REQUESTS` | `rate_limit` |
| 400·422 입력 거절 | `BAD_REQUEST` | `provider_input` |
| 5xx | `BAD_GATEWAY` | `provider_error` |
| 타임아웃, 연결 끊김 | `GATEWAY_TIMEOUT` | `unknown_outcome` |

- SDK 오류 객체를 `cause`로 넘기거나 그대로 로그에 쓰지 않는다. rpc 라우트의 `onError`가 오류 전체를 `console.error`한다. 로그에는 공급자, 상태 코드, 공급자 오류 코드만 남긴다.
- 한 공급자의 장애가 다른 공급자의 목록이나 생성을 막지 않게 공급자별로 따로 처리한다(REQ-02).

## 클론 보이스와 공급자 리소스 소유권 (REQ-01, REQ-13)
- 모든 사용자가 공급자 계정 하나(서버 키)를 같이 쓴다. 그래서 계정 단위 목록에는 모든 사용자의 클론이 섞인다. ElevenLabs 계정 성우, Fish Audio 내 모델, Typecast custom voice 목록이 그렇고, Typecast 기본 목록 `GET /v3/voices`도 완료된 커스텀 성우를 함께 돌려준다. 이 목록을 그대로 보여 주거나 허용 목록으로 쓰지 않는다.
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
- 서버를 거치지 않는 업로드가 필요하면 ADR로 정한다. 업로드 토큰을 주는 라우트는 세션과 소유자 제한을 검사하고 크기·형식 상한을 건다. 원본은 비공개 접근, 사용자별 경로에 둔다. 서버는 자신이 기록한 경로로만 원본을 읽고, 클라이언트가 준 URL을 가져오지 않는다. 이 라우트는 `authPaths` 밖이므로 대조표에 security 리뷰 행을 직접 추가한다.
- 업로드는 서버에서 크기, 형식(파일 앞 바이트), 길이를 다시 검사한다(REQ-13).
- SDK의 오디오 인자에는 바이트(`Uint8Array`, `Blob`, `File`)만 넘긴다. Typecast SDK의 `cloneVoice`는 문자열을 서버 파일 경로로 읽어 업로드하므로 입력 문자열이 닿으면 서버 파일이 공급자에게 나간다.
- 긴 대본 결합과 ffmpeg 후처리는 P1-04 범위다(ADR 0002: Blob과 백그라운드 작업). P0에서 미리 만들지 않는다.

## 사용량 표시 (REQ-11)
- 예상 사용량 단위는 공급자마다 다르다. Typecast·ElevenLabs는 글자 수, Fish Audio는 UTF-8 바이트다(서버 `Buffer.byteLength(text, "utf8")`, 브라우저 `new TextEncoder().encode(text).length`). 한글은 대부분 한 글자가 3바이트다. 교정을 반영한 발음용 대본으로 계산한다.
- 금액은 공급자 문서에 근거가 있을 때만 출처와 함께 보여 준다. 예상치와 공급자가 돌려준 실제 사용량을 구분한다.

## 화면 (`bts-web`, `bts-ui`와 함께)
- 한 번에 한 오디오만 재생한다(REQ-03). `URL.createObjectURL`로 만든 주소는 교체하거나 언마운트할 때 `URL.revokeObjectURL`한다.
- 마이크 권한은 녹음 버튼을 누를 때 요청하고, 멈추거나 화면을 떠날 때 모든 `MediaStreamTrack`을 `stop()`한다(REQ-13).
- 다운로드는 이미 받은 결과를 쓴다. 다운로드가 생성을 다시 부르지 않는다(REQ-10).
- 진행률은 공급자가 준 값만 보여 준다. 가짜 진행률을 만들지 않는다(REQ-11).

## 확인한 SDK 동작 (2026-09-28, npm 패키지 소스)
| SDK | 판 | 동작 |
|---|---|---|
| `@elevenlabs/elevenlabs-js` | 2.69.0 | 기본 `maxRetries` 2, 408·429·5xx 재시도. 키가 없으면 `process.env.ELEVENLABS_API_KEY` |
| `@neosapience/typecast-js` | 0.4.14 | 키가 없으면 `process.env.TYPECAST_API_KEY`, 호스트는 `TYPECAST_API_HOST`. 클론 파일 상한 25MB, 문자열 인자를 파일 경로로 읽음 |

판을 올리면 이 표를 다시 확인한다.

## 검사
- `bts-api` 격리 테스트에 가짜 공급자로 다음 경우를 더한다.
  ① 같은 요청 id를 동시에 두 번 보내면 공급자 호출이 1회다. 다른 요청 id 둘을 동시에 보내도 진행은 1건이다.
  ② 공급자 401·429·타임아웃이 위 표의 코드로 바뀐다.
  ③ B가 A의 클론 voice id로 생성하면 `NOT_FOUND`이고 공급자 호출은 0회다. 공급자 목록에 섞여 나온 A의 클론 id, 다른 사용자의 비공개 Fish Audio 모델 id, 삭제를 요청한 자기 클론으로 시도해도 같다.
  ④ B가 A의 매핑 행 id나 공개 성우 id로 삭제하면 `NOT_FOUND`이고 공급자 호출은 0회다.
  ⑤ 허용 목록에 없는 세 번째 계정 C는 유료 호출 프로시저에서 `FORBIDDEN`이고 공급자 호출은 0회다. ③·④의 A와 B는 허용 목록에 넣는다. 그래야 `FORBIDDEN`보다 소유권 검사까지 도달한다.
- `packages/api/src/providers/`는 `.dev-cycle.json`의 `authPaths`에 있어 security 리뷰 행이 자동으로 붙는다.
- 실제 호출은 "유료 호출" 절대로 사용자가 승인할 때만 한다.
