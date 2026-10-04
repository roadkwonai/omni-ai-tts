# Typecast 생성 API 옵션 조사

확인일: **2026-09-26**. 조사 유형: 공식 API 구현 참조. 먼저 [llms.txt](https://typecast.ai/docs/llms.txt)를 읽고, 아래 공식 API 참조의 `.md`에 포함된 OpenAPI **3.1.0 / info.version 0.1.2**와 [모델 문서](https://typecast.ai/docs/models), [변경 이력](https://typecast.ai/docs/changelog)을 대조했다. 이는 조회 시점 문서 버전이며 실제 배포 서버 버전 보장은 아니다. API 키를 읽거나 유료 API를 호출하지 않았다.

UI 배치는 이 프로젝트를 위한 **제안**이다. `기본`은 주 편집 화면, `표현`은 감정·말하기 조절, `고급`은 접을 수 있는 상세 설정, `서버자동`은 사용자 입력 없이 서버가 처리할 전송 요소, `후속`은 별도 기능 화면이다. API 기본값과 UI 권장 기본값은 구분한다.

여기서 `후속`은 단일 TTS 생성과 분리된 별도 흐름을 뜻하며 출시 우선순위를 낮추는 표현이 아니므로, 간편 클로닝의 제품 P0 우선순위는 유지한다.

## 생성 경로와 전송

| 경로 | 입력·출력 차이 | UI 배치·출처 |
| --- | --- | --- |
| `POST /v1/text-to-speech` | JSON → 완성된 WAV/MP3 바이너리. query 없음 | 기본 생성. [일반 TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) |
| `POST /v1/text-to-speech/stream` | JSON → 오디오 청크. `output.volume` 불가. query 없음 | 서버자동 재생 전달 방식. [Streaming](https://typecast.ai/docs/api-reference/text-to-speech/streaming-text-to-speech) |
| `POST /v1/text-to-speech/with-timestamps` | 일반 TTS와 같은 body. JSON 응답의 `audio`는 base64, `audio_format`, `audio_duration`, `words`, `characters` 포함 | 후속 자막·싱크 생성. [Timestamps](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech-with-timestamps) |
| `POST /v1/text-to-speech/compose` | `segments` 배열 → 하나의 음성 파일. 여러 화자·구간별 설정·명시적 휴지 지원. query 없음 | 후속 구간 편집. [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) |

모든 경로의 base URL은 `https://api.typecast.ai`. `X-API-KEY`는 필수 인증 헤더이며 서버에서만 설정한다. 생성은 `Content-Type: application/json`. 공식 llms 가이드의 코드 생성 식별 규약은 직접 HTTP에서 정적 `User-Agent: typecast-direct/1 <HTTP-library-token> typecast-integration/1 (source=api-docs; generated_by=codex)`이고, SDK에서는 `source: "api-docs"`, `generatedBy: "codex"`를 사용하며 SDK User-Agent를 덮어쓰지 않는다. 식별 규약은 llms 가이드 요구이고 OpenAPI 필수 인증 필드는 아니다. 사용자·프로젝트·대화 정보를 식별 헤더에 넣지 않는다. 이 항목은 모두 **서버자동**이다. 별도의 사용자 지정 헤더나 `Accept` 옵션은 생성 요청 스키마에 없다. [출처](https://typecast.ai/docs/llms.txt)

## 단일 생성 body 전체 목록

아래는 일반·스트리밍·타임스탬프 TTS의 전체 body 최상위 목록이다. `audio`, `context`, `text_normalization`, `instructions` 같은 추가 최상위 필드는 공개 스키마에 없다. `audio`는 타임스탬프 **응답** 필드다. [일반 TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech), [Streaming](https://typecast.ai/docs/api-reference/text-to-speech/streaming-text-to-speech), [Timestamps](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech-with-timestamps)

| 필드 | 타입·필수·범위 | API 기본값·조건 | UI 배치 |
| --- | --- | --- | --- |
| `text` | string, 필수, 1–2,000자 | 기본값 없음. 전처리한 경우 전송 문자열 기준으로 한도 검사 | 기본: 대본·글자 수 |
| `voice_id` | string, 필수 | 기본값 없음. `tc_` 기본 보이스 또는 소유한 `uc_` 커스텀 보이스. 소문자 접두어·대소문자 구별 | 기본: 보이스 선택 |
| `model` | enum, 필수: `ssfm-v30`, `ssfm-v21` | API 기본값 없음. 문서 권장은 v30. 선택 보이스의 지원 모델과 교집합 | 고급: 모델, UI 초기 v30 |
| `language` | string, 선택, ISO 639-3 | 생략 시 자동 감지. 대소문자 무관. 모델별 지원 언어 제한 | 기본: 자동 감지 + 언어 선택 |
| `prompt` | 선택 object union | `SmartPrompt` / `PresetPrompt` / v21 `Prompt`. 생략 시 감정 모드의 서버 기본값은 명시되지 않음 | 표현: 기본(생략)·자동 감정·지정 감정 |
| `output` | 선택 object | 아래 6개 하위 필드. 스트림은 5개 | 표현·고급으로 분산 |
| `seed` | 선택 integer, 0–4,294,967,295 | 생략 시 서버 무작위. 동일 입력·seed의 재현성을 문서가 명시. 예시 `42`는 기본값 아님. null 표기와 바깥 integer 표기가 혼재하므로 비사용 시 생략 권장 | 고급: 무작위/고정 + 정수 입력 |

## 감정·문맥: `prompt` 전체 목록

공식 [TTS prompt 스키마](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech), [모델](https://typecast.ai/docs/models), [변경 이력](https://typecast.ai/docs/changelog) 기준이다. `prompt`는 자유 지시문 문자열이 아니다. 문맥 입력은 실제 앞뒤 대본이며 말투 지시문 전용 필드로 설명되어 있지 않다.

| 모드·필드 | 타입·범위 | API 기본값·조건 | UI 배치 |
| --- | --- | --- | --- |
| v30 Smart: `prompt.emotion_type` | literal `"smart"` | SmartPrompt 내부 default `smart`. v30 전용 | 표현: 자동 감정 |
| v30 Smart: `prompt.previous_text` | string, 최대 2,000자 | default `""`. 앞 문맥; 합성하는 대상은 본문 `text` | 표현: 앞 문맥, 구간 편집에서는 서버자동 제안 가능 |
| v30 Smart: `prompt.next_text` | string, 최대 2,000자 | default `""`. 뒤 문맥; 앞→현재→뒤 문맥으로 감정 추론 | 표현: 뒤 문맥 |
| v30 Preset: `prompt.emotion_type` | literal `"preset"` | PresetPrompt 내부 default `preset` | 표현: 지정 감정 |
| v30 Preset: `prompt.emotion_preset` | `normal`, `happy`, `sad`, `angry`, `whisper`, `toneup`, `tonedown` | default `normal`. 모델 문서는 모든 보이스 지원이라고 설명. 실제 선택 목록은 보이스 메타데이터도 확인 | 표현: 보통·기쁨·슬픔·화남·속삭임·높은 톤·낮은 톤 |
| v30 Preset: `prompt.emotion_intensity` | number, 0–2 | default 1. 0은 중립, 2는 최대 강도 | 표현: 감정 강도 |
| v21: `prompt.emotion_preset` | `normal`, `happy`, `sad`, `angry` | normal 예시는 있으나 이 구형 스키마에 default 키는 없음. 지원 감정이 보이스별로 다름 | 표현: 메타데이터로 선택지 제한 |
| v21: `prompt.emotion_intensity` | number, 0–2 | 설명상 default 1. 구형 스키마에 타입·minimum·maximum 키가 불완전하지만 설명에 범위 명시 | 표현: 감정 강도 |

SmartPrompt와 PresetPrompt는 `additionalProperties: false`이다. **smart에 preset/intensity를, preset에 previous/next를 함께 보내지 않는다.** v21 Prompt에는 `emotion_type`이 없으며 v21에 smart를 보내지 않는다. 모드 전환 시 비활성 분기 필드는 payload에서 제거한다. `previous_text`/`next_text` 한도는 설명에만 있고 기계적인 `maxLength`는 누락되어 있다. 개별 2,000자 외 문맥 합산 한도는 문서에 없다.

## 음성 출력: `output` 전체 목록

기준: [일반 TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech), [Streaming](https://typecast.ai/docs/api-reference/text-to-speech/streaming-text-to-speech), [Timestamps](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech-with-timestamps).

| 필드 | 타입·범위 | API 기본값·조건 | UI 배치 |
| --- | --- | --- | --- |
| `output.audio_format` | enum `wav`, `mp3` | default `wav` | 기본 또는 고급: 다운로드 형식 |
| `output.audio_pitch` | integer, −12–12 semitones | default 0. 감정의 대체 조절로 설명하지 않음 | 표현: 음높이 |
| `output.audio_tempo` | number, 0.5–2.0 배 | default 1 | 표현: 말하기 속도 |
| `output.volume` | integer 또는 null, 0–200 | 설명상 표준 100. `target_lufs`와 동시 사용 금지. 스트림 지원 안 함 | 고급: 음량 모드가 상대 음량일 때만 표시 |
| `output.target_lufs` | number, −70–0; null 표기도 존재 | 수치 기본값 없음. 권장 예시 −14/−23은 기본값 아님. `volume`과 동시 사용 금지. 스트림 지원 | 고급: 음량 모드가 일정 음량일 때 표시 |
| `output.remove_silence_ms` | integer 또는 null, 0–1,000 ms | default null/생략=비활성. 0=감지한 무음 제거. 값은 제거량이 아니라 **남길 무음 길이**. 공식 권장 0–200ms | 고급: 무음 줄이기 켜기 + 남길 길이 입력 |

음량 UI는 `기본`(두 필드 생략) / `상대 음량`(volume만) / `일정 음량`(target_lufs만)의 배타적 선택이 적합하다. 스트림에서 상대 음량을 전달하지 않는다. null 허용 표기가 모순된 `target_lufs`는 미설정 시 생략한다. 무음 설정은 false/문자열/소수 불가; 끄기를 `0`으로 직렬화하면 의미가 뒤집힌다.

샘플레이트·비트깊이·채널·비트레이트는 선택 필드가 아니다. 일반/타임스탬프 WAV는 44,100Hz·16bit·mono, 스트리밍 WAV는 32,000Hz·16bit·mono다. MP3는 44,100Hz·320kbps. 스트리밍 첫 WAV 청크는 헤더를 포함하고 다음 청크는 PCM이다. 스트리밍의 기본 선행 무음 잘라내기와 `remove_silence_ms`는 별개이며, 너무 작은 값은 재생 청크 사이 간격을 만들 수 있어 버퍼링 검증이 필요하다. [Streaming](https://typecast.ai/docs/api-reference/text-to-speech/streaming-text-to-speech), [2026-09 변경 이력](https://typecast.ai/docs/changelog)

## 타임스탬프 query

`granularity`만 존재: 생략=words와 characters 모두, `word`=words만(characters=null), `char`=characters만(words=null). **`both`라는 값은 없다.** 일본어 `jpn`·중국어 `zho`는 char 권장; word는 문장 전체가 하나가 될 수 있다. UI 배치: **고급/후속 자막 설정**, 사용자가 선택하지 않으면 서버에서 생략 가능. 무음 제거 후 타임스탬프는 처리된 오디오와 정렬된다. 별도로 재생성한 다른 오디오와의 일치는 보장하지 않는다. [Timestamps](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech-with-timestamps), [변경 이력](https://typecast.ai/docs/changelog)

## Compose 전체 추가 입력

출처: [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech). UI 배치는 **후속 구간 편집**이다.

| 필드 | 계약 |
| --- | --- |
| `segments` | 필수 배열 1–50개, 최소 하나는 tts. 순서대로 출력 |
| `segments[].type` | 필수 구분자 `tts` 또는 `pause` |
| tts의 `voice_id`, `text`, `model` | 필수. 단일 TTS와 동일, 모델은 구간마다 달라도 됨 |
| tts의 `language`, `prompt`, `output`, `seed` | 선택. 단일 TTS와 동일한 필드·범위. **모든 tts의 audio_format은 같아야 함** |
| pause의 `duration_seconds` | 필수 number, 0 초과–10초 이하. 모든 pause 합계 60초 이하. 별도 크레딧 소비 없음 |

전체 tts 구간의 `text` 합계는 **2,000자 이하**다. 구간마다 2,000자씩 허용하는 API가 아니다. `remove_silence_ms`는 각 `segments[].output`에 적용하고 명시적 pause는 보존된다. Compose의 top-level 출력 설정·타임스탬프 query·audio 입력 필드는 공개 계약에 없다.

## 모델별 언어

v30은 2026-01 공개, 37개 언어·Smart·7개 감정. v21은 2025-07 공개, 27개 언어·4개 감정이며 보이스별 감정 지원이 다르다. [모델](https://typecast.ai/docs/models), [TTS 언어 표](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)

- v30: `ara ben bul ces dan deu ell eng fin fra hin hrv hun ind ita jpn kor msa nan nld nor pan pol por ron rus slk spa swe tam tgl tha tur ukr vie yue zho`
- v21: `ara bul ces dan deu ell eng fin fra hrv ind ita jpn kor msa nld pol por ron rus slk spa swe tam tgl ukr zho`
- `language`를 생략하는 자동 감지와 명시 언어 선택을 구별한다. 보이스 메타데이터에는 지원 언어/억양 필드가 없어 보이스 이름의 `kor`/`eng` 키를 언어 지원 증거로 해석하지 않는다. [llms.txt](https://typecast.ai/docs/llms.txt)

## 보이스 검색·추천 및 클로닝

이 절은 생성 body 옵션과 별도인 API 기능이다. UI 배치: 보이스 목록·필터는 **기본 선택 창**, 의미 기반 추천·클로닝·관리 화면은 **후속**.

| 기능·경로 | 전체 요청 입력·핵심 조건 | 공식 출처 |
| --- | --- | --- |
| 목록 `GET /v3/voices` | 선택 query: `model`, `gender`(male/female), `age`(child/teenager/young_adult/middle_age/elder), `use_cases`(string, 예: Ads), `voice_type`(original/custom). 문서화된 pagination·이름 query·language 필터 없음 | [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices) |
| 상세 `GET /v3/voices/{voice_id}` | 필수 path voice_id. body/query 없음. `models[].version/emotions`, 지역화된 `voice_name`, age/gender/use_cases/voice_type, nullable preview_url 제공 | [Get Voice](https://typecast.ai/docs/api-reference/voices/get-voice-details) |
| 추천 `GET /v1/voices/recommendations` | 필수 query `query`: 1–500자 설명. 선택 `count`: integer 1–10, default 5. 결과는 voice_id/voice_name/score뿐; 상세 조회로 모델·감정 확인 | [Recommend](https://typecast.ai/docs/api-reference/voices/recommend-voices) |
| 퀵 클로닝 `POST /v1/custom-voices/instant-clone` | multipart 필수 `file`, `name`, `model`. WAV/MP3 한 개, ≤25MiB, 5–150초; name 1–30자. 모델 enum v21/v30이나 계정·출시에 따라 가용성 달라짐. 슬롯 하나 소비, 완료된 보이스 반환 | [Instant Clone](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone) |
| 전문 클로닝 `POST /v1/custom-voices/professional-clone` | multipart 필수 `name`, `files`, `model`, `language`(ISO 639-3). files는 배열 타입이나 **한 파일만**. WAV/MP3 ≤1GiB, 5분–3시간, ≥16kHz. name 1–30자. 202/training 후 상태 조회; 최대 약 2시간 | [Professional Clone](https://typecast.ai/docs/api-reference/custom-voices/create-professional-clone) |
| 커스텀 목록 `GET /v1/custom-voices` | body/query 없음. pending/training/completed/failed 포함; completed만 합성에 사용 | [List Custom](https://typecast.ai/docs/api-reference/custom-voices/list-custom-voices) |
| 커스텀 상세 `GET /v1/custom-voices/{voice_id}` | 필수 path voice_id. completed/failed에서 훈련 조회 종료 | [Get Custom](https://typecast.ai/docs/api-reference/custom-voices/get-custom-voice) |
| 커스텀 삭제 `DELETE /v1/custom-voices/{voice_id}` | 필수 path voice_id. 소유 커스텀 보이스 soft delete, 슬롯 해제. 훈련 중이면 훈련 취소 | [Delete Custom](https://typecast.ai/docs/api-reference/custom-voices/delete-custom-voice) |

이들 호출도 인증은 서버의 X-API-KEY. multipart의 boundary는 HTTP 클라이언트가 생성한다. 목록에서 완료 커스텀 보이스는 먼저 반환되며 커스텀 preview_url은 null일 수 있다. API 클론과 소비자 Studio 클론은 별개이므로 Studio 보이스를 API 슬롯에 있다고 가정하지 않는다. [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices), [llms.txt](https://typecast.ai/docs/llms.txt)

## 지원 여부를 분리할 기능

| 항목 | 확인 결과·UI 처리 | 출처 |
| --- | --- | --- |
| 감정 자동화 | v30 Smart Emotion이 공식 지원. 별도 감정분석 endpoint나 자유 스타일 프롬프트 필드는 없음 | [모델](https://typecast.ai/docs/models), [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) |
| 숫자·날짜·금액 읽기 | AutoTag는 **별도 텍스트 전처리 SDK**. autoTag/manualTag/autoTagWithManual 결과를 text에 전달; TTS JSON 옵션 아님. UI는 후속 발음 전처리 및 변환 미리보기 | [AutoTag](https://typecast.ai/docs/bestpractice/autotag) |
| 휴지 넣기 | text의 `<\|1s\|>`, `<\|0.3s\|>`, `<\|5s\|>` 표기를 공식 가이드가 안내. 이것은 별도 pause body 필드/SSML 아님. 문서에 전체 허용 범위는 명시하지 않음. 명시적 수치 범위가 필요한 구간 UI는 Compose pause 계약 사용 | [llms.txt](https://typecast.ai/docs/llms.txt), [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) |
| SSML·발음 사전 | 현재 API 미지원이라고 llms.txt 명시. UI에서 지원 기능으로 표시하지 않음 | [llms.txt](https://typecast.ai/docs/llms.txt) |
| Speech-to-speech / voice conversion | 공개 llms 색인·현재 TTS/보이스 API 계약에서 endpoint를 확인하지 못함. **공개 API 지원 미확인**, 클로닝 후 TTS와 구별. 소비자 Studio 기능에서 추정하지 않음 | [문서 색인](https://typecast.ai/docs/llms.txt) |
| 오디오 upload로 바로 합성 | 일반 TTS에는 입력 audio 없음. 업로드는 클론 생성 계약에만 확인 | [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech), [Instant Clone](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone) |

## 연결 확인과 잔여 사용량 (2026-09-30 확인, T2)

- 호출: `GET /v1/users/me/subscription`(키 필요, 조회). 과금 여부 문구는 없다. [Get subscription](https://typecast.ai/docs/api-reference/subscription/get-subscription.md)
- 응답: `plan`, `credits.plan_credits`(int), `credits.used_credits`(int), `limits.concurrency_limit`. 잔여는 `plan_credits − used_credits`로 계산한다. 초기화 시각 필드는 없다. 크레딧 단위는 문서에 없다(글자 수로 추정, 미확정).
- 오류: 이 호출 문서에는 401 `{"detail":"Invalid API key"}`, 429, 500. 공통 오류 표에는 402(크레딧 부족), 403(구형 Starter 키, 휴면 계정, 키에 공백·개행). `Retry-After`는 명시 없음. [llms.txt](https://typecast.ai/docs/llms.txt)
- SDK `@neosapience/typecast-js` 0.4.14(npm 최신과 같음): `getMySubscription()`. 생성자 `{ apiKey, baseHost }`, 인자가 없으면 `TYPECAST_API_KEY`·`TYPECAST_API_HOST`로 대체하고 키가 없어도 예외 없이 헤더 없이 요청한다. 시간 제한·취소·재시도 옵션이 없고 응답을 검사하지 않는다. 오류는 `TypecastAPIError`(`statusCode`, `response`). HTTP는 호출 시점의 전역 `fetch`. 타입에 문서의 `professional_voice_slot`이 없다.

## 문서 모순·미확인 사항

1. **v31:** llms와 v3 보이스 model 필터 설명에 `ssfm-v31`이 있으나 같은 문서의 `TTSModel` enum, 모델 표, 생성 API는 v30/v21만 명시한다. v31을 생성 지원 모델로 노출하지 않는다. [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices), [모델](https://typecast.ai/docs/models)
2. **옛 클로닝 경로:** llms 핵심 가이드는 `/v1/voices/clone`을 안내하지만 변경 이력은 deprecated이고 새 `/v1/custom-voices/instant-clone` 사용을 명시한다. 신규 구현은 새 경로를 기준으로 한다. 옛 문서 MB와 새 문서 MiB 표기도 다르므로 새 계약의 MiB를 적용한다. [변경 이력](https://typecast.ai/docs/changelog), [Instant Clone](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone)
3. **v2 참조 잔재:** prompt 및 추천 설명이 `/v2/voices`를 언급하지만 최신 llms와 v3 참조에 따라 조회는 v3를 사용한다. [llms.txt](https://typecast.ai/docs/llms.txt), [Recommend](https://typecast.ai/docs/api-reference/voices/recommend-voices)
4. **스키마 불완전성:** seed/target_lufs는 바깥 type과 anyOf null 표기가 충돌한다. v21 Prompt는 타입·default 키 일부가 없고 Smart 문맥 maxLength는 설명에만 있다. 설명상 범위를 검증하며 미설정 값은 생략하는 보수적인 직렬화를 권장한다. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)
5. **응답 MIME:** 일반 TTS 응답 OpenAPI는 audio/wav만 열거하지만 output.audio_format과 설명은 mp3도 지원한다. 요청 포맷에 맞는 MIME 처리 필요. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)
6. **자동 감정 기본값:** prompt 생략이 smart를 뜻하는지 명확하지 않다. 제품의 자동 감정 모드는 v30에서 `emotion_type: smart`를 명시한다.
7. **SDK 지연 가능성:** raw API 옵션과 설치된 SDK 지원은 별개다. `remove_silence_ms`는 API 2026-09-15, SDK 일괄 지원은 09-17 변경 이력에 기록되어 있다. 설치 버전 검증은 구현 담당자의 후속 작업이다. [변경 이력](https://typecast.ai/docs/changelog), [SDK Overview](https://typecast.ai/docs/sdk/overview)

## 구현 인계 요약

단일 생성의 사용자 선택 항목은 대본·보이스·언어·모델, smart/preset 및 각 분기 필드, 포맷·피치·속도·배타적인 음량 모드·무음 보존 길이·seed다. 타임스탬프 granularity와 Compose는 별도 생성 경로에만 붙인다. 서버는 인증/식별 헤더·전송 방식과 조건부 직렬화를 담당한다. 미지원·미확인 옵션을 가상의 API 입력으로 만들지 않는다. 이 문서는 공식 문서 기반 계약 확인이며 실제 계정별 보이스 가용성·청취 품질·유료 생성 성공은 검증하지 않았다.
