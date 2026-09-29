# Fish Audio TTS API 옵션 조사

확인일: **2026-09-28**. 조사 유형: 공식 API 구현 참조. 시작점은 [API Introduction](https://docs.fish.audio/api-reference/introduction)이며, 먼저 [llms.txt](https://docs.fish.audio/llms.txt) 색인으로 관련 페이지 목록을 확인한 뒤 각 `.md` 페이지와 공개 [OpenAPI](https://api.fish.audio/openapi.json) 설명을 대조했다. 이는 조회 시점 문서 스냅샷이며 실제 배포 서버 버전을 보장하지 않는다. 실 API 키로 **읽기 전용·무료 조회 2회**(잔액 조회, 성우 목록 조회)만 수행했고, 유료·상태 변경 호출(TTS 생성, 클론 생성, 삭제)은 하지 않았다.

UI 배치는 이 프로젝트를 위한 **제안**이며 Fish Audio 실제 화면 위치를 뜻하지 않는다. `기본`=주 편집 화면, `표현`=감정·말하기 조절, `고급`=접을 수 있는 상세 설정, `서버자동`=사용자 입력 없이 서버가 처리, `후속`=단일 TTS 생성과 분리된 별도 흐름. 이 분류는 구현 우선순위가 아니며, 간편 클로닝의 제품 P0 우선순위는 [요구사항 계획](../plans/tts-service-requirements.md)을 따른다.

## 인증과 기본 URL

- 기본 URL: `https://api.fish.audio`
- 인증 헤더: `Authorization: Bearer <API 키>`. 키는 https://fish.audio/app/api-keys/ 에서 발급한다. [Quickstart](https://docs.fish.audio/developer-guide/getting-started/quickstart), [WebSocket TTS](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live.md)
- W3C `traceparent` 헤더로 분산 추적을 지원한다(선택). [API Introduction](https://docs.fish.audio/api-reference/introduction)
- 모든 오류는 JSON 바디로 `message`, `status`를 반환한다고 일반 오류 문서는 설명하지만, TTS 엔드포인트 개별 문서는 401/402/503 오류 바디에 `status`, `message`, `reason` 세 필드를 명시해 필드 구성이 다르다. 파싱 자체가 실패한 잘못된 요청 바디는 평문 오류를 반환할 수 있다. [Errors](https://docs.fish.audio/api-reference/errors), [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)
- 키는 서버에서만 보관한다. 클라이언트 번들에 노출하지 않는다.

## TTS 생성 엔드포인트

- `POST /v1/tts`. 요청 `Content-Type`은 `application/json` 또는 `application/msgpack`. 응답은 **200 성공 시 오디오 스트림**(`Transfer-Encoding: chunked`)이며, Typecast/ElevenLabs처럼 일반 생성과 스트리밍이 별도 경로로 나뉘지 않고 이 경로 하나가 청크 전송을 겸한다. [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)
- 모델 선택은 **body 필드가 아니라 요청 헤더** `model`로 한다. 허용값: `s1`, `s2-pro`, `s2.1-pro`, `s2.1-pro-free`, `drama-3-preview`. 헤더를 생략하거나 인식하지 못하면 TTS 엔드포인트 문서는 기본값을 `s2.1-pro`(유료)로 명시한다. **문서 충돌:** Python SDK 가이드는 SDK 기본 모델을 `s2-pro`로 설명하면서도 항상 모델을 명시적으로 전송한다고 적어, "헤더 생략 시 서버 기본값"과 "SDK 기본값"이 다르다. 이 앱은 헤더를 항상 명시적으로 보내는 쪽을 권장한다. [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [핵심 가이드](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md), [Python 인증 가이드](https://docs.fish.audio/developer-guide/sdk-guide/python/authentication.md)

### 전체 요청 필드

| 필드 | 타입 | 기본값 | 범위·허용값 | 필수 | UI 배치 제안 |
| --- | --- | --- | --- | --- | --- |
| `text` | string | 없음 | — | **필수** | 기본: 대본 |
| `reference_id` | string 또는 string[] | null | 저장된 성우(모델) ID. 문자열은 단일 화자, 배열은 다중 화자 | 선택 | 기본: 성우 선택 |
| `references` | ReferenceAudio[] (다중 화자는 중첩 배열) | null | 요청 안에 오디오+대본을 직접 넣는 즉석(zero-shot) 클로닝. `reference_id`와 별개 경로 | 선택 | 후속: 즉석 클로닝 |
| `temperature` | number | 0.7 | 0–1 | 선택 | 표현: 표현력 |
| `top_p` | number | 0.7 | 0–1 | 선택 | 고급: 다양성(nucleus sampling) |
| `prosody` | object | null | 하위 3개 필드(아래) | 선택 | 표현 |
| `chunk_length` | integer | 300(엔드포인트 문서) / 200(핵심 가이드 예시) | 100–300 | 선택 | 고급: 청크 길이. **문서 간 기본값 수치 불일치, 미확정** |
| `normalize` | boolean | true | 영어·중국어 대상 정규화 | 선택 | 고급: 텍스트 정규화 |
| `format` | enum | `mp3` | `wav`, `pcm`, `mp3`, `opus` | 선택 | 고급: 다운로드 형식 |
| `sample_rate` | integer 또는 null | null(형식별 기본값 사용) | 형식별 허용값은 출력 형식 절 참고 | 선택 | 고급 |
| `mp3_bitrate` | integer | 128 | 64, 128, 192 (kbps) | 선택 | 고급: mp3 선택 시만 |
| `opus_bitrate` | integer | -1000 | -1000(자동), 24000, 32000, 48000, 64000 | 선택 | 고급: opus 선택 시만 |
| `latency` | enum | `normal` | `low`, `normal`, `balanced`. 핵심 가이드는 `balanced`를 "TTFA 약 300ms" 저지연으로, `normal`을 더 안정적인 옵션으로 설명해 값 의미가 문서마다 다르게 강조됨 | 선택 | 고급: 지연 모드 |
| `max_new_tokens` | integer | 1024 | 청크당 최대 오디오 토큰 | 선택 | 고급 |
| `repetition_penalty` | number | 1.2 | 1.0 초과 시 반복 감소 | 선택 | 고급 |
| `min_chunk_length` | integer | 50 | 0–100 | 선택 | 고급 |
| `condition_on_previous_chunks` | boolean | true | 이전 청크를 문맥으로 사용해 일관성 유지 | 선택 | 서버자동 |
| `early_stop_threshold` | number | 1 | 0–1 | 선택 | 고급 |
| `features` | string[] | [] | 요청 단위 기능 플래그(예: `quality-guard`). **전체 허용값 목록 미확인** | 선택 | 후속: 허용값 확정 전 미노출 |
| `pronunciation_dictionary` | 배열(참조 또는 인라인), 최대 3개 | null | 아래 발음 사전 절 | 선택 | 고급 |

`prosody` 하위 필드: `speed`(number, 기본 1, 0.5–2.0 배속), `volume`(number, 기본 0, dB 단위 조절), `normalize_loudness`(boolean, 기본 true). `ReferenceAudio`: `audio`(binary, 필수, WAV/MP3/FLAC), `text`(string, 필수, 오디오의 정확한 대본). [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)

### 발음 사전 (`pronunciation_dictionary`)

요청당 최대 3개까지 참조(`id`+불변 `version`) 또는 인라인(`items`, 최대 5,000개) 방식으로 넣는다. 인라인 항목은 `key`(최대 256자), `value`(최대 1,024자), `case_sensitive`(boolean, 기본 false)로 구성된다. 사전 자체는 웹 앱에서 만들고 미리듣고 게시한 뒤 TTS 요청에서 재사용한다고 설명하나, **사전 생성/수정을 위한 REST API 엔드포인트 존재 여부는 이번 조사에서 확인하지 못했다.** [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [Fine-grained control](https://docs.fish.audio/developer-guide/core-features/fine-grained-control.md)

## 감정·연기·휴지: 텍스트 인라인 태그

Fish Audio는 감정을 **별도 request 필드가 아니라 `text` 안의 인라인 태그**로만 제어한다. 구조화된 enum이나 강도(intensity) 숫자 필드는 없다.

| 모델·기능 | 문법 | 조건 | UI 배치 |
| --- | --- | --- | --- |
| S2 계열(감정) | 대괄호 자연어, 예: `[happy]`, `[slightly sad]`, `[very excited]` | 수식어 조합 가능. 대본에 삽입 | 표현: 태그 삽입 |
| S1(구형) | 괄호 고정 태그, 예: `(happy)` | S2와 문법이 다름 | 표현: 모델별 문법 분기 |
| 휴지·paralanguage | `(break)`, `(long-break)`, `(breath)`, `(laugh)`, `(cough)`, `(lip-smacking)`, `(sigh)` 등 괄호 명령, "음", "어" 같은 자연스러운 머뭇거림 단어 | 문장 안에 자유롭게 삽입, 예: `"I am, um, an (break) engineer"` | 표현: 휴지·군더더기 삽입 |
| 발음 지정 | `<|phoneme_start|>...<|phoneme_end|>` | 언어별 표기: 영어 CMU Arpabet, 중국어 성조 숫자 병음, 일본어 OpenJTalk 로마자 | 고급: 발음 직접 지정 |

감정 태그 전체 목록(요약): 기쁨·슬픔·분노 등 기본 24종과 경멸·불안·히스테리 등 심화 25종, 그 외 어조(외침·속삭임)와 효과음(웃음·흐느낌·한숨 등) 마커가 문서화되어 있고, 13개 지원 언어 전체에서 사용 가능하며 모든 요금제에서 동일하게 제공된다고 설명한다. **다만 이 목록은 WebFetch 요약이며 원문 표를 줄 단위로 직접 인용·대조하지 못했으므로 정확한 철자·전체 개수는 구현 전 재확인이 필요하다.** 정규화(`normalize`)를 끄면 숫자·날짜·URL 낭독 안정성이 떨어질 수 있다고 명시한다. SSML 지원 여부는 문서에서 언급되지 않았다(비공식 지원 미확인). [Emotions](https://docs.fish.audio/developer-guide/core-features/emotions.md), [Fine-grained control](https://docs.fish.audio/developer-guide/core-features/fine-grained-control.md)

## 스트리밍/WebSocket

`POST /v1/tts` 자체가 청크 스트리밍 응답이므로 별도 REST 스트림 경로는 없다. 추가로 순수 WebSocket 경로가 있다.

- `wss://api.fish.audio/v1/tts/live`. 인증은 동일하게 `Authorization: Bearer <키>` 헤더. 모델은 여기서도 선택적 `model` 헤더(기본 `s2.1-pro`)로 지정한다.
- 메시지는 MessagePack으로 직렬화한다. 흐름: `StartEvent`(`event: "start"` + REST와 동일한 `request` 객체, 이때 `text`는 보통 비워둠) → `TextEvent`(실제 텍스트 조각 전송) → 필요 시 `FlushEvent`(버퍼 강제 합성) → 서버가 여러 `AudioEvent`(이어붙여 완성 오디오 구성) 반환 → `FinishEvent`로 종료/오류 신호.
- REST의 요청 필드(성우 선택, `temperature`/`top_p`/`repetition_penalty`, `prosody`, 출력 형식·샘플레이트, `latency`, `chunk_length`류)를 `StartEvent.request`가 그대로 수용한다고 설명한다.

UI 배치: **후속**(단발 생성 UI 우선 구현 후 실시간 재생이 필요할 때). [WebSocket TTS](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live.md), [AsyncAPI 스키마](https://docs.fish.audio/api-reference/asyncapi.yml)

## 출력 형식

| 형식 | 샘플레이트 | 비트레이트/비트깊이 | 비고 |
| --- | --- | --- | --- |
| WAV / PCM | 8k, 16k, 24k, 32k, 44.1k(기본) Hz | 16-bit, mono | `format: "wav"` 또는 `"pcm"` |
| MP3 | 32k, 44.1k(기본) Hz | 64, 128(기본), 192 kbps, mono | |
| Opus | 48k Hz(고정, 유일 옵션) | -1000(자동), 24, 32(기본), 48, 64 kbps, mono | |

출처: [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [핵심 가이드](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md)

## 성우(모델) 목록·검색·상세

`voice`라는 별도 용어 없이 이 API는 성우를 **모델(model)**로 통칭하며 `type: "tts"`인 항목이 합성 가능 성우다. 목록·상세 조회는 OpenAPI에 `security: []`로 표시되어 있어 문서상 인증 없이도 호출 가능하다고 되어 있으나, 이번 조사에서는 **인증 헤더를 포함한 호출만** 실행해 확인했다(무인증 호출은 시도하지 않음).

| 기능·경로 | 핵심 계약 | 출처 |
| --- | --- | --- |
| 목록 `GET /model` | 페이지네이션: `page_size`(1–100, 기본 10), `page_number`(최소 1, 기본 1). 필터: `title`, `tag`, `language`, `title_language`, `author_id`, `self`(내 워크스페이스 소유), `licensed`(Fish Audio 보증 성우만). 정렬: `sort_by`(`score`/`task_count`/`created_at`) | [List Models](https://docs.fish.audio/api-reference/endpoint/model/list-models.md) |
| 상세 `GET /model/{id}` | path `id` 필수. 목록과 동일한 필드 반환 | [Get Model](https://docs.fish.audio/api-reference/endpoint/model/get-model.md) |

실제 무료 조회로 확인한 목록 응답 봉투 필드: `items`, `total`, `has_more`, `max_offset`, `accessible_upper_bound`, `total_is_exact`, `window_limited`. 항목(성우) 필드: `_id`, `type`(`svc`/`tts`), `title`, `description`, `cover_image`, `state`, `created_at`, `updated_at`, `tags`, `languages`, `visibility`, `default_text`, `source`, `train_mode`, `licensed`, `like_count`/`liked`, `mark_count`/`marked`/`unliked`, `shared_count`, `task_count`, `lock_visibility`, `dmca_taken_down`, `takedown_category`, `pvc_notice_period_months`, `pvc_release_state`, `pvc_released_at`, `pvc_retire_effective_at`, `pvc_retire_requested_at`, `author`(중첩), `quality`(중첩, `quality.audios[]`에 `filename`/`duration_ms`/`language`/품질 지표), `samples`(중첩, 각 항목의 `audio` 필드가 **샘플 오디오 URL**). 이 필드 목록은 2026-09-28 실제 호출 응답과 문서 요약을 대조해 확인했다. [List Models](https://docs.fish.audio/api-reference/endpoint/model/list-models.md)

## 보이스 클론(모델 생성) API

| 기능·경로 | 계약 |
| --- | --- |
| 생성 `POST /model` | `multipart/form-data`. 필수: `type`(const `"tts"`), `title`(string), `train_mode`(const `"fast"`), `voices`(오디오 파일 1–20개). 선택: `visibility`(기본 `private`; `public`/`unlist`/`private`), `description`, `cover_image`, `texts`(음성 파일과 짝지을 대본, 최대 20개), `voice_design_signatures`, `tags`, `enhance_audio_quality`(boolean, 기본 true — 학습 전 배경 잡음 제거·레벨 정규화), `generate_sample`(boolean, 기본 false) |
| 상세 `GET /model/{id}` | 위 목록·상세와 동일 경로 재사용 |
| 수정 `PATCH /model/{id}`(추정) | llms.txt 색인에 Update Model 페이지가 존재함만 확인했고 **전체 요청 필드는 이번 조사에서 확인하지 못했다** |
| 삭제 `DELETE /model/{id}` | path `id` 필수. `BearerAuth` 필요, 소유자만 가능(권한 없으면 401). 200 성공. 503은 과부하로 처리 실패 |

**입력 파일 조건**(생성 가이드 기준, 다른 페이지): 형식 `.wav`, `.mp3`, `.m4a`, `.opus`. 클립당 **최소 10초**, 권장 1–2분의 깨끗한 단일 화자 음성. 배경음악·잔향·겹치는 목소리는 피하라고 안내. **파일 크기 상한은 문서에서 확인하지 못했다.** `train_mode: "fast"`(현재 유일하게 문서화된 값)는 "거의 즉시 사용 가능"이라고 설명해 Typecast 전문 클론처럼 긴 훈련 대기가 필요 없어 보이지만, 정확한 처리 소요 시간의 수치 보장은 없다.

**공개/비공개**: `visibility`는 `private`(기본, 생성자만), `unlist`(링크 소지자만), `public`(Voice Library 게시)의 3단계다. 이후 관리 화면에서 변경 가능하다고 설명한다. [Create Model](https://docs.fish.audio/api-reference/endpoint/model/create-model.md), [Creating Models 가이드](https://docs.fish.audio/developer-guide/core-features/creating-models.md)

## 잔액/사용량, 요금, 요율 제한, 오류 코드

### 잔액(API 크레딧) 조회

- `GET /wallet/{user_id}/api-credit`. `user_id`에 `"self"`를 넣으면 본인 잔액을 조회한다. `Authorization: Bearer <키>` 필요. 쿼리 `check_free_credit`(boolean, 기본 false), `team_id`(선택).
- 응답 필드: `_id`, `user_id`, `credit`, `cumulative_top_up`, `created_at`, `updated_at`, `has_phone_sha256`, `has_free_credit`.
- **2026-09-28 실제 호출 결과: 성공, HTTP 200.** 응답 JSON의 키 구성이 문서와 일치함을 확인했다(금액·잔액 수치는 이 문서에 기록하지 않음). 이 호출이 과금되는지 여부는 문서에 명시되어 있지 않다(계정 정보 조회 성격상 무료로 추정하나 **미확정**). [Get API Credit](https://docs.fish.audio/api-reference/endpoint/wallet/get-api-credit)

### 요금 단위

| 항목 | 단가 |
| --- | --- |
| TTS(`s1`, `s2-pro`, `s2.1-pro`) | **US $15.00 / 백만 UTF-8 바이트**. 문서는 약 18만 영어 단어 또는 약 12시간 분량 음성에 해당한다고 예시함 |
| TTS(`s2.1-pro-free`) | 무료 |
| 음성 인식(`transcribe-1`, `transcribe-1-pro`) | US $0.36 / 오디오 시간(초 단위 올림) |
| Voice Design(`voice-design-1`) | US $0.01 / 성공한 API 요청 |
| 모델 생성(클론) | 이번 조사에서 별도 단가를 확인하지 못했다(**미확인**) |

과금 기준이 **글자 수가 아니라 UTF-8 바이트**라는 점이 Typecast(글자 수 상한)·ElevenLabs(character-cost 기반)와 다르다. 한글은 UTF-8에서 보통 3바이트를 차지하므로 같은 글자 수라도 영어 대비 청구 바이트가 커진다. [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md)

### 요율 제한

QPS/QPM이 아니라 **동시 요청 수(concurrency)** 기준이며, 누적 결제 금액에 따라 단계가 오른다.

| 등급 | 조건(누적 결제) | 동시 요청 상한 |
| --- | --- | --- |
| Starter | < $100 | 5 |
| Elevated | ≥ $100 | 15 |
| High Volume | ≥ $1,000 | 50 |
| Enterprise | 별도 계약 | 커스텀 |

문서는 QPS ≈ 동시성 ÷ 평균 요청 처리 시간(초), QPM ≈ 동시성 × 60 ÷ 평균 요청 처리 시간(초) 환산식을 제공한다(예: 동시성 5, 요청당 2초면 QPM 150, 요청당 60초면 QPM 5). [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md)

### 주요 오류 코드

| 코드 | 의미 |
| --- | --- |
| 400 | 잘못된 요청(파라미터 오류, 존재하지 않는 `reference_id`/성우) |
| 401 | API 키 없음/무효 |
| 402 | 크레딧 부족 |
| 403 | 해당 키/리소스에 권한 없음 |
| 404 | 모델·성우 없음 |
| 429 | 요율 제한 초과 |
| 5xx | 서버 오류(지수 백오프 재시도 대상) |

일반 오류 응답은 `{ "message": string, "status": number }`이지만, TTS 엔드포인트 개별 문서의 401/402/503 예시는 `status`, `message`, `reason` 세 필드로 설명해 **문서 간 응답 스키마가 완전히 일치하지 않는다.** 429·5xx만 지수 백오프로 재시도하고 나머지 4xx는 요청 자체를 고쳐야 한다고 안내한다. [Errors](https://docs.fish.audio/api-reference/errors), [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)

## 한국어 지원

- `s1`(구형) 모델은 지원 언어를 명시적으로 나열하며 그 안에 한국어가 포함된다: "English, Chinese, Japanese, German, French, Spanish, Korean, Arabic, Russian, Dutch, Italian, Polish, Portuguese"(13개 언어).
- `s2-pro`는 "80개 이상 언어", `s2.1-pro`는 "83개 언어"와 자동 언어 감지를 지원한다. 2026-09-28 [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md) 원문을 직접 확인한 결과, 이 페이지에서 한국어를 이름으로 나열한 목록은 S1의 13개 언어뿐이고 S2 계열은 언어 수와 자동 감지만 적혀 있다. **S2 계열의 한국어 품질은 실제 청취로 확인해야 한다(미검증).**
- 같은 원문에서 `s2.1-pro`를 운영 권장 모델로, `s2.1-pro-free`를 같은 모델·같은 언어 범위의 개발·테스트용 무료 모델(공정 사용 한도, TTFA·DPA 보장 없음)로 설명한다. S1은 기존 통합용으로 유지된다.
- 감정 태그 절은 "13개 지원 언어 전체에서 감정 마커 사용 가능"이라고 설명하는데, 이 "13개"가 `s1`의 13개 언어를 가리키는지 별도 기준인지는 문서에서 명확히 구분되지 않는다. [Choosing a model](https://docs.fish.audio/developer-guide/models-pricing/choosing-a-model.md), [Emotions](https://docs.fish.audio/developer-guide/core-features/emotions.md)

## 이 앱에 넣을 때 주의점

1. **서버 전용 키**: `FISH_AUDIO_API_KEY`는 서버에서만 `Authorization: Bearer` 헤더로 사용하고 클라이언트 번들·로그·응답에 노출하지 않는다. 기존 `X-API-KEY`(Typecast)·`xi-api-key`(ElevenLabs)와 헤더 이름·스킴이 다르므로 공급자 어댑터에서 분기해야 한다.
2. **모델은 헤더로, 성우는 바디로**: 기존 두 공급자는 모델이 body 필드였지만 Fish Audio는 `model` **요청 헤더**다. 공통 어댑터가 "모델 선택"을 항상 body 필드로 가정하고 있다면 이 예외를 처리해야 한다.
3. **과금 호출과 무료 호출 구분**: `POST /v1/tts`(생성), `POST /model`(클론 생성), 음성 인식은 명백히 과금 대상이다. `GET /model`·`GET /model/{id}`(목록·상세)는 OpenAPI상 인증 불필요로 표시되어 사실상 무료 조회로 다뤄도 안전하다. `GET /wallet/{user_id}/api-credit`은 계정 조회 성격이라 무료로 추정되나 문서에 명시적 확인 문구는 없다 — 실제 통합 시 이 호출도 과금 여부를 재확인하고, 자동 폴링으로 반복 호출하지 않는다.
4. **바이트 기준 사용량 계산**: 과금이 문자 수가 아닌 UTF-8 바이트다. 한글 대본의 예상 사용량 표시는 `text.length`가 아니라 `Buffer.byteLength(text, 'utf-8')` 같은 바이트 길이로 계산해야 한다.
5. **중복 요청 억제**: `POST /v1/tts` 응답이 청크 스트림이라 재전송·중복 클릭 시 서버가 멱등하게 처리한다는 보장이 문서에 없다. 기존 REQ-09가 요구하는 "중복 클릭은 생성 요청 1회"를 앱 쪽 요청 ID·버튼 잠금으로 직접 구현해야 한다.
6. **즉석 클로닝과 저장 클로닝 분리**: `references` 필드로 저장 없이 바로 클로닝해 합성할 수 있지만, 이 앱의 REQ-13(내 보이스)은 영속적인 클론 성우 관리를 요구하므로 초기 구현은 `POST /model`로 만든 저장된 `reference_id` 경로만 쓰고, 즉석 클로닝은 후속으로 분리하는 편이 요구사항과 맞는다.
7. **삭제 확인**: `DELETE /model/{id}`는 200만 성공을 뜻하며 별도 상태 전이(예: soft delete 유예)가 문서에 없다. REQ-13의 "삭제 대기 상태 유지·재확인" 요구를 만족하려면 앱 쪽에서 삭제 요청 후 `GET /model/{id}` 404 여부로 재확인하는 로직이 필요하다.

## 확인하지 못한 것 (미검증)

1. `s2.1-pro`/`s2-pro`의 83개/80+개 언어 전체 목록과 한국어 품질(원문에는 언어 수와 자동 감지만 있음. 실제 청취 필요).
2. 클론 생성 입력 파일의 **파일 크기 상한**(MB/GB), 파일 개수 20개 초과 시 동작.
3. `PATCH /model/{id}`(모델 수정) 엔드포인트의 전체 요청 필드.
4. 발음 사전(`pronunciation_dictionary`)을 웹 UI가 아니라 **API로 생성/수정**할 수 있는 엔드포인트 존재 여부.
5. `features` 배열에 허용되는 전체 기능 플래그 목록(확인된 예시는 `quality-guard` 하나뿐).
6. `chunk_length` 기본값이 300인지 200인지(엔드포인트 문서와 핵심 가이드 예시가 다름).
7. `GET /wallet/{user_id}/api-credit` 호출 자체의 과금 여부에 대한 명시적 문서 문구.
8. 클론(모델) 생성 자체의 요금 단가.
9. WebSocket `StartEvent.request`가 REST의 모든 필드(특히 `pronunciation_dictionary`, `features`)를 동일하게 지원하는지 개별 확인.
10. 감정 태그 전체 목록의 정확한 철자·개수(요약 결과이며 원문 표를 줄 단위로 대조하지 않음).

## 기존 Typecast/ElevenLabs와 비교해 다른 점

1. **모델 지정 위치**: Typecast·ElevenLabs는 body 필드(`model`/`model_id`)지만 Fish Audio는 HTTP 헤더(`model`)다. 공급자 어댑터의 "모델 선택 전송 위치" 추상화를 헤더까지 확장해야 한다.
2. **과금 단위**: 문자 수(Typecast `text` 길이, ElevenLabs character-cost)가 아니라 **UTF-8 바이트**다. 예상 사용량 표시 로직을 성우/제공자별로 분기해야 한다.
3. **성우 개념의 통합**: Typecast·ElevenLabs는 "성우(voice_id)"와 "모델(음성 합성 방식)"이 분리된 축이지만, Fish Audio는 클론으로 만든 성우 자체가 `type: "tts"`인 "모델(model)" 레코드다. 이 앱의 `공급자 분류`·`Model` 용어 매핑 시 Fish Audio의 "model"을 성우(Voice) 엔터티에 대응시켜야 하며, 동시에 `s1`/`s2-pro`/`s2.1-pro` 같은 합성 엔진 선택도 별도로 "모델(Model)" 개념으로 존재해 이름 충돌에 유의해야 한다.
4. **감정 제어 방식**: 세 공급자 모두 구조화 감정(Typecast v30 preset)·태그(ElevenLabs v3 텍스트 태그) 방식이 있지만, Fish Audio는 감정 강도(intensity) 숫자 필드가 아예 없고 전부 텍스트 인라인 태그(`[happy]`, `(break)` 등)로만 표현한다. 세 공급자 공통 "표현" UI를 만들 때 강도 슬라이더 같은 파라미터 UI는 Fish Audio에서 제공할 수 없다.
5. **생성/스트리밍 경로 수**: Typecast(일반/스트림/타임스탬프/컴포즈 4경로), ElevenLabs(convert/stream/timestamp/dialogue 등)와 달리 Fish Audio는 `POST /v1/tts` 단일 REST 경로가 청크 스트림 응답을 겸하고, 추가로 완전히 별도인 WebSocket(`wss://.../v1/tts/live`)까지 3번째 실시간 옵션을 둔다.
6. **클론 파일 개수·공개 단계**: Typecast 인스턴트 클론은 파일 1개, ElevenLabs IVC는 별도 계약이지만 Fish Audio는 한 번의 `POST /model` 요청에 **오디오 파일 최대 20개**를 첨부하고 `private`/`unlist`/`public` 3단계 공개 범위를 직접 선택한다. 또한 `references` 필드로 **모델을 저장하지 않는 즉석 클로닝**까지 TTS 요청 한 번에 지원하는 것은 두 기존 공급자에는 없는 경로다.
