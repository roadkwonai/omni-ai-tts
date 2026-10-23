# Airy API 옵션 정리

- 확인: 2026-10-07, 공식 문서 `https://airy.so/cloud-api/docs/`(빠른 시작, 인증, 음성 합성, 스트리밍 합성, 성우 목록, 모델 목록, 크레딧 잔액, 오류)의 영어판. 문서 사이트는 자바스크립트 앱이라 번들에 든 문서 원문을 읽었다.
- 공개 카탈로그 `GET /v1/studio/voices`는 문서에 없다. 문서 사이트의 '성우(Voices)' 안내 화면이 키 없이 부르는 주소이고, 2026-10-07 한 번 불러 응답 모양을 확인했다(성우 104명, 과금 없음).
- 쓰는 곳: [T7.5 스펙](../plans/tasks/T07.5-airy-provider.md). 공급자 공통 규칙은 [tts-provider 스킬](../../.agents/skills/tts-provider/SKILL.md).

## 1. 연결

| 항목 | 값 |
|---|---|
| 호스트 | `https://api.airy.so` (문서 사이트 번들에 스테이징 `api-stg.airy.so`도 있으나 쓰지 않는다) |
| 인증 | `Authorization: Bearer <키>`. 키는 `sk-oos-…` 모양이고 콘솔에서 만들 때 한 번만 보인다. 문서: "키는 서버에 두고 공개 웹 앱에 두지 않는다" |
| SDK | 없음. REST를 `fetch`로 부른다(Fish Audio와 같은 방식, ADR 0002) |
| 키 없이 부르면 | `GET /v1/voices` → 401 (2026-10-07 확인) |

## 2. 호출

| 호출 | 과금 | 용도(이 앱) | 응답 |
|---|---|---|---|
| `GET /v1/credits/balance` | 문서에 과금 문구 없음(조회) | 연결 확인, 남은 크레딧 | `total_balance`(number), `tier`(예 `plan_a`), `next_expires_at`(Unix 초·null), `breakdown.{promotion,subscription,additional}.{balance, expires_at, refreshes_at}` |
| `GET /v1/voices` | 문서에 과금 문구 없음(조회) | 성우 목록 | `voices[].{id, name, gender, langs[]}`. 페이지 나눔·검색·필터 없음 |
| `GET /v1/models` | 문서에 과금 문구 없음(조회) | 쓰지 않음(모델이 하나뿐) | `data[].{id, product, unit, credit_rates, display_name}`. 예 `airy-tts-v1`, 단위 `character` |
| `GET /v1/studio/voices` (문서 없음, 키 불필요) | 없음 | 기본 샘플 주소 | 아래 3절 |
| `POST /v1/audio/speech` | **유료** | 내 문장 듣기(T7.5), 작업실 생성(T10) | 오디오 파일 전체. 아래 4절 |
| `POST /v1/audio/speech/stream` | 유료 | 쓰지 않음 | PCM 24kHz s16le mono 스트림 |

성우 한 명 조회 호출은 문서에 없다. 이용 가능 확인(T7)은 `GET /v1/voices` 목록에서 id를 찾는다.

## 3. 공개 카탈로그 `GET /v1/studio/voices` (문서 없음)

- 최상위: `object`, `pack_id`, `lang`, `langs`, `eval_text`, `eval_texts`, `voice_count`, `voices[]`.
- 성우: `id`(16자리 소문자 16진수), `display_name`, `gender`(`female`·`male`), `order`, `description`(지금은 이름과 같다), `preview_sample`, `preview_samples.{ko,en}`(샘플 문장), `image_url`, `langs`, `audio_url.{ko,en}`.
- 샘플 주소: `https://assets.airy.so/airy/voice_pack/vp-v9/audio/<언어>/<id>.opus`. 서명·만료가 없는 고정 주소이고 `content-type: audio/opus`(Ogg 컨테이너), `cache-control: public, max-age=31536000, immutable`이다. 한 개 약 20KB.
- 2026-10-07 응답: 104명(여 52, 남 52), 모두 `langs: ["en","ko"]`, 모두 ko·en 샘플이 있다.
- 문서에 없는 주소라 예고 없이 바뀔 수 있다. 이 앱은 샘플 주소만 여기서 가져오고, 성우 목록 자체는 공식 `GET /v1/voices`를 따른다(T7.5 사용자 결정).

## 4. 음성 합성 `POST /v1/audio/speech`

| 필드 | 필수 | 값 | 이 앱 |
|---|---|---|---|
| `input` | 예 | 1~1,600자(2026-10-23 공식 문서 확인. T7.5 때 적은 1,280자는 틀렸다) | 내 문장 듣기는 앱 상한 200자(T5), 작업실 문단은 1,600자(T10) |
| `language` | 예 | `ko`·`en` | UI '언어', 기본 `ko` |
| `model` | 아니오 | 기본 `airy-tts-v1` | 서버가 `airy-tts-v1`을 명시해 보낸다. 화면 선택지 하나 |
| `voice` | 아니오 | `GET /v1/voices`의 `id`. 기본 `a597bb7a98fc9ec1` | 항상 보낸다 |
| `style` | 아니오 | `normal`·`bright`·`calm`·`whisper`, 기본 `normal` | UI '말투' |
| `response_format` | 아니오 | `wav`·`pcm`·`mp3`·`opus`, 기본 `mp3` | 서버 자동 `mp3` |
| `trailing_silence` | 아니오 | 0~5초, 기본 0 | 쓰지 않음(짧은 듣기에는 필요 없다. 작업실 T10에서 다시 본다) |

- 응답: `Content-Type`이 형식을 따르는 오디오. 표본 주파수 24kHz.
- 응답 헤더(200만): `X-Request-Id`, `X-Response-Time-Ms`, `X-Audio-Sample-Rate`, `X-Credits-Charged`(이번 차감), `X-Credits-Remaining`(남은 크레딧).
- 과금: 입력 한 글자에 `en` 1크레딧, `ko` 1.5크레딧(`language` 기준). 글자를 무엇으로 세는지(코드포인트, UTF-16)는 문서에 없다. 이 앱은 다른 공급자처럼 코드포인트로 세고 올림한다.
- 가입 보너스·구독·추가 충전 크레딧이 따로 있다(`breakdown`). 무료 모델이나 무료 미리듣기는 문서에 없다. 그래서 내 문장 듣기는 유료 확인을 거친다.

## 5. 오류

실패 응답은 모두 같은 JSON이다: `{ "error": { "type", "code", "message", "param" }, "request_id" }`.

| 상태 | `error.code` | 이 앱의 `reason` |
|---|---|---|
| 400 | `invalid_value`, `unsupported_characters` | `provider_input` |
| 401 | `invalid_api_key` | `provider_auth` |
| 402 | `insufficient_credits` | `quota` |
| 403 | `account_banned` | `provider_auth` (키가 속한 계정이 정지됨) |
| 404 | `not_found` | 확인 `check_failed`, 목록 `provider_error`, 듣기 `provider_input`. 이용 가능 확인에서는 '없음'이 아니다(한 명 조회 호출이 없다) |
| 429 | `rate_limit_exceeded`, `concurrent_limit_exceeded`, `inference_busy` | `rate_limit`. `Retry-After`(초)를 대기 시각으로 적는다 |
| 500 | `internal_error` | `provider_error` |

## 6. 이 앱에서 정한 것과 모르는 것

- 성우 출처는 `public` 하나다(Typecast처럼). 공식 목록이 계정 전용 성우(콘솔의 커스텀 성우)를 섞어 돌려주는지는 문서에 없다. 섞여 와도 한 명 소유 예외(tts-provider '클론 보이스' 절)에서는 그대로 보인다.
- Airy 콘솔의 커스텀 성우 목록·미리듣기(`/v1/cloud-api/voices…`)는 콘솔 로그인 토큰이 필요한 다른 경로라 쓰지 않는다.
- 클론 API는 문서에 없다(T13에서 다시 확인).
- 카탈로그 8초 제한(`withTimeout`), 키 미전송, 행 샘플은 첫 샘플(한국어, 없으면 영어), 카탈로그 실패 목록도 24시간 캐시되고 '목록 새로 고침'이 회복한다.
- 요청 제한 값(분당 요청 수, 동시 수)은 문서에 숫자가 없다. "정보 없음".
- 샘플은 Ogg Opus다. Chrome·Firefox·Edge는 재생한다. Safari는 버전에 따라 다를 수 있어 사용자 테스트에서 확인한다.
