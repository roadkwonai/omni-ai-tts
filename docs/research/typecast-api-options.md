# Typecast 생성 API 옵션 조사

확인일: **2026-10-05**(최초 조사 2026-09-26, 성우 목록 실측 절과 연결 확인 절 2026-09-30·2026-10-04, T5 공식 문서·약관 재확인 2026-10-05). 조사 유형: 공식 API 구현 참조. 먼저 [llms.txt](https://typecast.ai/docs/llms.txt)를 읽고, 아래 공식 API 참조의 `.md`에 포함된 OpenAPI **3.1.0 / info.version 0.1.2**와 [모델 문서](https://typecast.ai/docs/models), [변경 이력](https://typecast.ai/docs/changelog)을 대조했다. 이는 조회 시점 문서 버전이며 실제 배포 서버 버전 보장은 아니다. 2026-09-26 조사는 API 키를 읽거나 유료 API를 호출하지 않았다. 2026-10-04 재확인은 공식 문서와 설치 SDK `@neosapience/typecast-js` **0.4.15**를 읽었고 API를 호출하지 않았다. 2026-10-05 재확인은 API 참조, 개요·요금 페이지, API 약관·사용 정책·출처 표기 지침과 설치 SDK를 읽었으며 공급자 API를 호출하지 않았다. 이전 재확인과 T3 실측을 대체하는 값은 아니며, 이번에 추가 확인한 사실은 문서 끝의 "재확인에서 바뀐 것"에 반영한다. "정보 없음"은 공식 문서에서 명시를 찾지 못했다는 뜻이다.

UI 배치는 이 프로젝트를 위한 **제안**이다. `기본`은 주 편집 화면, `표현`은 감정·말하기 조절, `고급`은 접을 수 있는 상세 설정, `서버자동`은 사용자 입력 없이 서버가 처리할 전송 요소, `후속`은 별도 기능 화면이다. API 기본값과 UI 권장 기본값은 구분한다.

여기서 `후속`은 단일 TTS 생성과 분리된 별도 흐름을 뜻하며 출시 우선순위를 낮추는 표현이 아니므로, 간편 클로닝의 제품 P0 우선순위는 유지한다.

## 생성 경로와 전송

| 경로 | 입력·출력 차이 | UI 배치·출처 |
| --- | --- | --- |
| `POST /v1/text-to-speech` | JSON → 완성된 WAV/MP3 바이너리. query 없음 | 기본 생성. [일반 TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) |
| `POST /v1/text-to-speech/stream` | JSON → 오디오 청크. `output.volume` 불가. query 없음 | 서버자동 재생 전달 방식. [Streaming](https://typecast.ai/docs/api-reference/text-to-speech/streaming-text-to-speech) |
| `POST /v1/text-to-speech/with-timestamps` | 일반 TTS와 같은 body. JSON 응답의 `audio`는 base64, `audio_format`, `audio_duration`, `words`, `characters` 포함 | 후속 자막·싱크 생성. [Timestamps](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech-with-timestamps) |
| `POST /v1/text-to-speech/compose` | `segments` 배열 → 하나의 음성 파일. 여러 화자·구간별 설정·명시적 휴지 지원. query 없음 | 후속 구간 편집. [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) |

모든 경로의 base URL은 `https://api.typecast.ai`. `X-API-KEY`는 필수 인증 헤더이며 서버에서만 설정한다. 생성은 `Content-Type: application/json`. 공식 llms 가이드의 코드 생성 식별 규약은 직접 HTTP에서 정적 `User-Agent: typecast-direct/1 <HTTP-library-token> typecast-integration/1 (source=api-docs; generated_by=codex)`이고, SDK에서는 `source: "api-docs"`, `generatedBy: "codex"`를 사용하며 SDK User-Agent를 덮어쓰지 않는다. 식별 규약은 llms 가이드 요구이고 OpenAPI 필수 인증 필드는 아니다. 2026-10-04: llms.txt는 `generated_by`에 예시의 `codex` 대신 자기 에이전트 토큰을 쓰라고 한다(2026-09-26판은 `codex`를 그대로 적었다). 프로젝트 구현은 `generatedBy: "claude-code"`이고 규약에 맞다. 사용자·프로젝트·대화 정보를 식별 헤더에 넣지 않는다. 이 항목은 모두 **서버자동**이다. 별도의 사용자 지정 헤더나 `Accept` 옵션은 생성 요청 스키마에 없다. [출처](https://typecast.ai/docs/llms.txt)

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
| `seed` | **현재 공식 문서에 없음**(2026-10-04) | 2026-09-26판은 "선택 integer, 0–4,294,967,295, 생략 시 서버 무작위, 동일 입력·seed의 재현성을 문서가 명시"라 적었다. 2026-10-04에 TTS·스트리밍·타임스탬프·compose 문서(영문·한국어)에서 `seed` 문구가 **0건**이다. SDK 0.4.15는 `@deprecated Ignored; never sent`로 표시하고 코드가 보내기 전에 지운다. changelog에 제거 기록은 없다(언제 빠졌는지 정보 없음) | 쓰지 않음. 재현을 전제하지 않는다 |

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
| tts의 `language`, `prompt`, `output` | 선택. 단일 TTS와 동일한 필드·범위. **모든 tts의 audio_format은 같아야 함**. 2026-09-26판은 `seed`도 적었으나 현재 문서에 없다 |
| pause의 `duration_seconds` | 필수 number, 0 초과–10초 이하. 모든 pause 합계 60초 이하. 별도 크레딧 소비 없음 |

한 구간이라도 실패하면 전체가 실패하고 **크레딧을 받지 않는다**(2026-10-04 확인). 전체 tts 구간의 `text` 합계는 **2,000자 이하**다. 구간마다 2,000자씩 허용하는 API가 아니다. `remove_silence_ms`는 각 `segments[].output`에 적용하고 명시적 pause는 보존된다. Compose의 top-level 출력 설정·타임스탬프 query·audio 입력 필드는 공개 계약에 없다.

## 모델별 언어

v30은 2026-01 공개, 37개 언어(llms·models 문구는 "35+", API 문서 표는 37개)·Smart·7개 감정. v21은 2025-07 공개, 27개 언어·4개 감정이며 보이스별 감정 지원이 다르다. [모델](https://typecast.ai/docs/models), [TTS 언어 표](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)

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

### 성우 목록 실측(2026-10-04, T3)

(2026-10-04 실측, 목록 조회) 인원 수와 값 분포는 `GET /v3/voices` 한 번(필터 없음)의 조회 결과다. SDK 항목은 설치본 코드 읽기다.

- SDK `@neosapience/typecast-js` 0.4.15: `getVoicesV3(filter?: VoicesV2Filter)`. 필터 타입에 `voice_type`이 없다. 시간 제한·취소·재시도·응답 검사가 없다.
- `GET /v3/voices` 한 번(필터 없음)에 614명, 모두 `voice_type=original`. 응답 약 300KB(303,871바이트), 0.3초. 한글 이름(`voice_name.kor`)이 빠진 성우 0명.
- `preview_url`은 614명 모두 있다. 모두 `static2.typecast.ai`의 서명 없는 고정 `.mp3` 주소이고 쿼리가 없다.
- 모델: `ssfm-v30` 608명, `ssfm-v21` 535명(한 성우가 둘 다 가질 수 있다). 감정은 모델당 최대 10개.
- 성별: female 282명, male 332명.
- 연령: young_adult 364명, middle_age 151명, child 42명, elder 31명, teenager 26명.
- `use_cases` 실제 값 13종(SDK `UseCaseEnum`과 다르다. 한 성우가 여러 값을 가진다): `TikTok/Reels/Shorts` 174, `Audiobook/Storytelling` 152, `Game` 150, `Ads/Promotion` 146, `E-learning/Explainer` 145, `Conversational` 134, `Radio/Podcast` 133, `Anime` 117, `Documentary` 114, `Voicemail/Voice Assistant` 96, `Announcer` 51, `News Reporter` 50, `Rapper` 7.

### 성우 목록 상세 (2026-10-04 재확인)

출처: 공식 [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices), OpenAPI, [llms.txt](https://typecast.ai/docs/llms.txt), SDK `@neosapience/typecast-js` 0.4.15. 위 T3 실측 값(614명 등)은 이번에 다시 재지 않았다.

#### 엔드포인트 상태

| 엔드포인트 | 상태 | 비고 | 출처 |
| --- | --- | --- | --- |
| `GET /v3/voices` | **현행** | 내장(`tc_`)과 완료된 커스텀(`uc_`) 보이스. 커스텀이 먼저 나온다. `voice_name`은 `{eng, kor}`, `voice_type`, `preview_url` 포함 | [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices) |
| `GET /v3/voices/{voice_id}` | 현행 | 단건 | [Get Voice Details](https://typecast.ai/docs/api-reference/voices/get-voice-details) |
| `GET /v2/voices`, `GET /v2/voices/{id}` | **deprecated**(OpenAPI `deprecated: true`, 문서 "Deprecated" 그룹) | `voice_name`이 문자열 하나이고 `preview_url`·한글 이름이 없다. `voice_type`은 있다 | [List Voices (v2)](https://typecast.ai/docs/api-reference/deprecated/list-voices-v2) |
| `GET /v1/voices`, `GET /v1/voices/{id}` | **제거됨** | 2026-01 변경 이력에 "Removed". SDK 0.4.15에는 아직 메서드가 남아 있다(deprecated) | [Changelog](https://typecast.ai/docs/changelog) |
| `GET /v1/voices/recommendations` | 현행 | 설명 문장으로 추천. 결과는 `voice_id`·`voice_name`(문자열)·`score`뿐 | [Recommend](https://typecast.ai/docs/api-reference/voices/recommend-voices) |

#### `GET /v3/voices` 쿼리 파라미터 전부(모두 선택)

| 파라미터 | 값 | 비고 |
| --- | --- | --- |
| `model` | `ssfm-v21`, `ssfm-v30` (설명 문구에만 `ssfm-v31`도 언급, 열거형에는 없음) | 필터 후 `models` 배열에 다른 모델이 남는지는 정보 없음 |
| `gender` | `male`, `female` | |
| `age` | `child`, `teenager`, `young_adult`, `middle_age`, `elder` | |
| `use_cases` | 문자열 하나(문서 예 `Ads`) | 값 형식·부분 일치 여부는 정보 없음(아래 use case 표 참고) |
| `voice_type` | `original`, `custom` | SDK 0.4.15 `VoicesV2Filter`에는 이 필드가 없다 |

없는 것(문서에 없음): 이름 검색어, 언어 필터, 정렬, 페이지 나눔(`limit`/`offset`/`cursor`). 여러 필터는 함께 쓸 수 있다고 문서가 적는다. 오류: 401 `{"detail":"Invalid API key"}`, 422 `{"detail":"Invalid query parameter"}`.

**서버 필터냐 브라우저 필터냐:** 검색어·언어·정렬은 서버가 못 하므로 브라우저에서 한다. 성별·연령·콘텐츠·모델도 응답 필드에 다 들어 있으므로 브라우저에서 같은 결과를 낼 수 있다. T3 실측으로 필터 없는 한 번 호출이 614명·303,871바이트·0.3초였다. 그래서 서버 필터는 쓸 이유가 크지 않고, `use_cases` 서버 필터는 값 형식이 불확실하다.

#### 응답의 성우 필드 (`VoiceV3`)

필수: `voice_id`, `voice_name`, `voice_type`, `models`.

| 필드 | 타입 | 값·설명 |
| --- | --- | --- |
| `voice_id` | string | 내장 `tc_…`, 커스텀 `uc_…` |
| `voice_name` | `{ eng: string, kor: string }` | 영어·한글 이름. 둘 다 필수 키 |
| `voice_type` | enum | `original`(모든 계정이 쓰는 Typecast 제공 보이스), `custom`(사용자가 만든 보이스) |
| `gender` | `male` \| `female` \| null | |
| `age` | enum \| null | `child`(12세 미만), `teenager`(13~19), `young_adult`(20~35), `middle_age`(36~60), `elder`(60세 초과). 나이 범위는 문서 설명 |
| `use_cases` | string[] | 한 성우가 여러 값. 문서 열거형은 아래 표. 필드 타입은 열거형이 아니라 string[] |
| `models` | `[{ version, emotions: string[] }]` | 성우가 지원하는 모델과 모델별 감정 목록. `version`은 `ssfm-v30`/`ssfm-v21`, `emotions`는 열거형이 아니라 string[] |
| `preview_url` | string \| null | 기본 샘플 오디오 주소. 커스텀은 null일 수 있다 |

없는 것: 지원 언어·억양 필드, 샘플 문장·길이, 보이스 설명 문장, 인기·정렬 점수. llms.txt도 "보이스 상세는 지원 언어 필드를 노출하지 않으므로 언어를 확인할 수 없다고 말하고 미리듣기로 확인하게 하라"고 적는다. [llms.txt](https://typecast.ai/docs/llms.txt)

#### 열거 값 목록

| 항목 | 값 | 출처 |
| --- | --- | --- |
| 성별 | `male`, `female` | [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices) `GenderEnum` |
| 연령 | `child`, `teenager`, `young_adult`, `middle_age`, `elder` | `AgeEnum` |
| 모델 | `ssfm-v30`, `ssfm-v21` | `TTSModel` |
| 감정 프리셋 열거형 | `normal`, `sad`, `happy`, `angry`, `whisper`, `toneup`, `tonedown` (v21은 앞 4개) | `EmotionEnum` |
| 보이스 유형 | `original`, `custom` | `VoiceType` |
| use case 문서 열거형(13) | `Announcer`, `Anime`, `Audiobook`, `Conversational`, `Documentary`, `E-learning`, `Rapper`, `Game`, `Tiktok/Reels`, `News`, `Podcast`, `Voicemail`, `Ads` | `UseCasesEnum` |

**use case 문서 값과 실측 값의 차이** (실측은 위 T3 절, 재확인 안 함. 대응은 이름으로 한 추론이다. 2026-09-26판은 "SDK `UseCaseEnum`과 다르다"고만 적었다).

| 문서 열거형 | 실측 실제 값(인원) |
| --- | --- |
| Tiktok/Reels | `TikTok/Reels/Shorts` (174) |
| Audiobook | `Audiobook/Storytelling` (152) |
| Game | `Game` (150) |
| Ads | `Ads/Promotion` (146) |
| E-learning | `E-learning/Explainer` (145) |
| Conversational | `Conversational` (134) |
| Podcast | `Radio/Podcast` (133) |
| Anime | `Anime` (117) |
| Documentary | `Documentary` (114) |
| Voicemail | `Voicemail/Voice Assistant` (96) |
| Announcer | `Announcer` (51) |
| News | `News Reporter` (50) |
| Rapper | `Rapper` (7) |

문서 예시 `use_cases=Ads`가 실제 값 `Ads/Promotion`과 일치하는지는 정보 없음. 화면 선택지는 문서 열거형이 아니라 **받은 응답의 값**에서 만들어야 한다.

감정 목록 주의: 실제 `models[].emotions`는 string[]이다. T3 실측으로 모델당 최대 10개였는데 `EmotionEnum`은 7개다. 7개 밖의 값을 `emotion_preset`에 보내도 되는지는 정보 없음(요청 스키마는 7개 열거형이다). 또 문서끼리 어긋난다. [models](https://typecast.ai/docs/models)와 changelog(2026-01)는 v30 프리셋이 "모든 보이스에서 가능"이라 하는데, List Voices 응답 예시에는 v30 성우가 `normal, happy, sad, angry` 4개만 가진다.

#### 단건 조회와 `voice_type`

| 항목 | 내용 |
| --- | --- |
| `GET /v3/voices/{voice_id}` | path `voice_id` 필수, 쿼리·본문 없음. 응답은 목록의 한 항목과 같은 `VoiceV3` |
| 오류 | 400 `{"message":"Invalid voice ID","error_code":"INVALID_VOICE_ID"}`(형식 오류), 401, 404 `{"message":"Voice not found","error_code":"VOICE_NOT_FOUND"}`("없거나 이 계정에서 쓸 수 없음"), 422 |
| `voice_type` | `original` = 모든 계정이 쓰는 Typecast 보이스(`tc_`), `custom` = 사용자가 클론으로 만든 보이스(`uc_`, 소유자만 합성 가능, 목록에는 완료된 것만, `preview_url` null 가능) |
| 다른 계정의 `uc_` | 합성 문서: "소유자만 쓸 수 있다". 조회 시 동작은 404 문구("이 계정에서 쓸 수 없음")로 추정할 뿐 정보 없음 |

출처: [Get Voice Details](https://typecast.ai/docs/api-reference/voices/get-voice-details), [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech).

#### 성우 목록의 과금과 요청 제한

| 항목 | 내용 |
| --- | --- |
| 성우 목록·단건·추천 호출의 과금 | 문서에 과금·크레딧 문구가 없다 = **정보 없음**(무료라고 명시하지도 않음). 크레딧 소비 문구가 있는 곳은 합성 계열뿐이다 |
| 요청 제한 | 숫자(분당 N회 등)는 문서에 **없음**. 429 `{"detail":"Too many requests"}`는 모든 엔드포인트가 정의한다. `Retry-After` 헤더 문서 없음 |
| 동시 요청 제한 | 플랜별 `limits.concurrency_limit`: Free 2, Lite 5, Plus 15([요금 페이지](https://typecast.ai/pricing/api/)). 초과 시 429인지 대기인지는 정보 없음 |
| 인증 | 헤더 `X-API-KEY`. 키는 서버에만 둔다(llms.txt 8번 규칙) |
| 오류 공통 | 400, 401, 402(크레딧 부족), 403(구형 Starter 키·휴면 계정·키에 공백/개행), 404, 422, 429, 500([llms.txt](https://typecast.ai/docs/llms.txt)) |

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
- 응답: `plan`, `credits.plan_credits`(int), `credits.used_credits`(int), `limits.concurrency_limit`. 잔여는 `plan_credits − used_credits`로 계산한다. 초기화 시각 필드는 없다. 크레딧 단위는 **1 크레딧 = 1 글자**다([API 요금](https://typecast.ai/pricing/api/), 2026-10-04 확인. 2026-09-30판은 "문서에 없다(글자 수로 추정, 미확정)"이라 적었다). 공백·휴지 표기가 글자 수에 드는지는 정보 없음. 구독 문서는 `limits.custom_voice_slot`과 `professional_voice_slot`도 적고, 플랜 값은 `free|lite|plus|custom`이다(2026-10-04).
- 오류: 이 호출 문서에는 401 `{"detail":"Invalid API key"}`, 429, 500. 공통 오류 표에는 402(크레딧 부족), 403(구형 Starter 키, 휴면 계정, 키에 공백·개행). `Retry-After`는 명시 없음. [llms.txt](https://typecast.ai/docs/llms.txt)
- SDK `@neosapience/typecast-js` 0.4.15(2026-10-04 설치본 확인): `getMySubscription()`. 생성자 `{ apiKey, baseHost }`, 인자가 없으면 `TYPECAST_API_KEY`·`TYPECAST_API_HOST`로 대체하고 키가 없어도 예외 없이 헤더 없이 요청한다. 시간 제한·취소·재시도 옵션이 없고 응답을 검사하지 않는다. 오류는 `TypecastAPIError`(`statusCode`, `response`). HTTP는 호출 시점의 전역 `fetch`. 타입에 문서의 `professional_voice_slot`이 없다.

## 내 문장 듣기 (시험 생성) (2026-10-04 재확인)

유료 호출을 실제로 하지 않았다. 아래는 공식 문서·OpenAPI·요금 페이지·SDK `.d.ts`에서 확인한 계약이다. "시험 생성"과 "기본 샘플"을 구분한다.

### 합성 엔드포인트와 요청 필드

엔드포인트 4개와 본문 필드는 앞의 "생성 경로와 전송", "단일 생성 body 전체 목록", "감정·문맥: `prompt` 전체 목록", "음성 출력: `output` 전체 목록" 절이 정본이다. 2026-10-04 재확인에서 바뀐 필드 사실은 **`seed` 삭제**뿐이다. 그 밖에 스트리밍은 `output.volume`을 받지 않고(`OutputStream`), 일반 TTS는 쿼리가 없고, 타임스탬프는 `granularity`(`word`/`char`)만 쿼리로 받는다.

**모델별로 쓸 수 있는 옵션 비교** (출처: [models](https://typecast.ai/docs/models), [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech), [changelog](https://typecast.ai/docs/changelog))

| 옵션 | ssfm-v30 (2026.01, 권장) | ssfm-v21 (2025.07) |
| --- | --- | --- |
| 자동 감정(Smart) + 앞뒤 문맥 | 가능 | **불가** |
| 지정 감정(preset) 값 | `normal happy sad angry whisper toneup tonedown` (7) | `normal happy sad angry` (4, 보이스별 가능 여부 다름) |
| 감정 강도 0~2 | 가능 (preset일 때만) | 가능 |
| 보이스별 실제 선택 가능한 감정 | `models[].emotions`를 따른다. 문서는 "모든 보이스 가능"이라 하나 응답 예시와 어긋남 | `models[].emotions`를 따른다 |
| 지원 언어 | 37개 | 27개 |
| `output.*`(속도·음높이·음량·LUFS·형식·무음) | 동일 | 동일. 모델별 제한 문구 없음 |
| 특징 | 자연스러운 운율 | 낮은 지연 |

- v30에만 있는 언어 10개: `ben hin hun nan nor pan tha tur vie yue`.
- **한국어 `kor`는 두 모델 모두 지원.** 단, 성우 메타데이터에 언어 필드가 없어서 "이 성우가 한국어를 잘하는가"는 호출 전에 알 수 없다.

### 입력 길이, 응답 형식, 오디오 크기

| 항목 | 내용 |
| --- | --- |
| 입력 길이 상한 | `text` 1~2,000자. `previous_text`/`next_text` 각 2,000자(합산 상한 정보 없음). SDK 0.4.15 타입의 `@maxLength 5000`은 문서와 다르다(오래된 주석으로 보임). 문서 값을 쓴다 |
| 응답 형식 | **바이너리 오디오**(URL 아님). 200 본문이 곧 파일. WAV는 OpenAPI에 `audio/wav`만 적혀 있고 MP3 Content-Type은 compose 문서가 `audio/mpeg`로 적는다 |
| 길이 헤더 | OpenAPI 응답에는 헤더 정의가 없다. SDK는 응답 헤더 `x-audio-duration`(초)을 읽고 없으면 0으로 둔다 = 문서에 없는 SDK 구현 동작 |
| WAV | PCM 16bit, mono, 44,100Hz, 비압축 |
| MP3 | 320kbps, 44,100Hz |
| 크기(계산 값, 문서 아님) | WAV 약 88KB/초, MP3 약 40KB/초. 10초 오디오는 WAV 약 0.9MB·MP3 약 0.4MB, 60초는 WAV 약 5.3MB·MP3 약 2.4MB |
| 글자 수당 오디오 길이 | 문서에 없음(정보 없음) |
| 합성 소요 시간 | 일반 TTS는 정보 없음. 스트리밍 첫 청크는 약 200ms(2026-04 changelog) |
| 오류 | 400, 401, 402 `{"detail":"Insufficient credit"}`, 404 `{"detail":"Voice not found"}`, 422 `{"message":"…","error_code":"TEXT_NOT_SYNTHESIZABLE"}`(기호·특수문자만 있어 합성할 수 없는 텍스트), 429, 500 |

### 과금

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 단가 | **1 크레딧 = 1 글자**("Usage is calculated as 1 credit per character"). 2026-09-30판은 "크레딧 단위는 문서에 없다(글자 수로 추정)"이라 적었다 | [API 요금](https://typecast.ai/pricing/api/) |
| 플랜 | Free $0, 월 15,000크레딧, 동시 2. Lite $15, 월 200,000, 동시 5, 초과분 종량 $0.09/1k. Plus $280, 월 4,000,000, 동시 15, 초과분 $0.08/1k. 유료는 한도 초과 후에도 계속 사용 가능(100k·1.25M 단위 자동 청구). 무료 플랜 초과 시 동작은 402(크레딧 부족)로 추정, 명시 정보 없음 | 같은 페이지, TTS 402 정의 |
| 무료 플랜 조건 | 생성한 오디오는 **상업 이용 불가, 출처 표기 필요** | 같은 페이지 |
| 최소 과금 단위 | 정보 없음. 공백·문장부호·`<\|1s\|>` 같은 휴지 표기가 글자 수에 드는지도 정보 없음. 합성 호출 1회의 최소 크레딧 정보 없음 | |
| 실패 호출 과금 | 일반·스트리밍 TTS는 정보 없음. compose만 "실패하면 과금 안 함" 명시 | [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) |
| 중복 방지 | 멱등성 키·요청 ID 문서에 없음(검색 결과 0건). 재시도는 새 과금 호출로 봐야 한다 | |
| 재현성 | 같은 입력이 같은 오디오를 낸다는 보장 문구 없음. `seed`도 없다 | |
| **무료 커스텀 텍스트 미리듣기** | **없음.** API 문서·llms.txt·요금 페이지 어디에도 무료 시험 합성, 드라이런, 샌드박스가 없다. 소비자 Studio의 보이스 라이브러리는 로그인이 필요하고 API가 아니다(llms.txt) | |
| 무료로 들을 수 있는 것 | `preview_url`의 고정 샘플 mp3. 정적 파일 주소라 API 호출이 아니다. 샘플 문장·언어는 정보 없음. T3 실측: 614명 모두 `static2.typecast.ai`의 서명 없는 고정 `.mp3` | List Voices |

계산(문서 값 + 1글자 1크레딧):

| 시험 대본 길이 | 크레딧 | Free(15,000) 월 횟수 | Lite 한도(200,000) 월 횟수 | Lite 비용(구독 단가 $0.075/1k) |
| --- | --- | --- | --- | --- |
| 50자 | 50 | 300 | 4,000 | 약 $0.004 |
| 100자 | 100 | 150 | 2,000 | 약 $0.0075 |
| 300자 | 300 | 50 | 666 | 약 $0.0225 |
| 2,000자(상한) | 2,000 | 7 | 100 | 약 $0.15 |

이 계정의 플랜·잔여는 `GET /v1/users/me/subscription`(`plan`, `credits.plan_credits/used_credits`, `limits.concurrency_limit`, `limits.custom_voice_slot`, 문서상 `professional_voice_slot`)으로만 알 수 있다. 플랜 값은 `free|lite|plus|custom`. 2026-10-04 재확인에서는 호출하지 않았다 = 이 계정의 플랜 정보 없음.

### 스트리밍

| 항목 | 내용 |
| --- | --- |
| 지원 | 예. `POST /v1/text-to-speech/stream`. 본문은 일반 TTS와 같고 `output`만 `OutputStream`(`audio_pitch`, `audio_tempo`, `audio_format`, `target_lufs`, `remove_silence_ms`, **`volume` 없음**) |
| WAV | 16bit mono **32,000Hz**. 첫 청크에 헤더(크기 0xFFFFFFFF), 다음은 PCM만 |
| MP3 | 320kbps 44,100Hz, 청크마다 독립 디코딩 가능 |
| 지연 | 첫 청크 약 200ms(2026-04 changelog) |
| 오류 | 입력 오류는 스트림 시작 전 422 `TEXT_NOT_SYNTHESIZABLE`. 스트림이 시작된 뒤에는 HTTP 상태를 바꿀 수 없다(문서 명시) |
| 과금 | 같은 `text` 길이 문구. 중간에 끊긴 스트림의 과금은 정보 없음 |
| 이 용도의 장단 | 시험 대본은 짧으므로 일반 TTS 한 번이면 전체 오디오(Blob)를 받아 재생·재재생에 쓸 수 있다. 스트리밍은 첫 소리가 빠르지만 다시 들으려면 직접 모아 둬야 하고 SDK 0.4.15 `textToSpeechStream`은 `ReadableStream`을 주며 시간 제한·취소 옵션이 없다 |

### 시험 생성 설정 분류 (제안)

분류는 이 앱을 위한 **제안**이며 공급자 API의 구분이 아니다. 대상은 성우 캐스팅 화면의 "Typecast 성우를 내 대본·언어·감정 설정으로 들어 보기"다.

| 구분 | 설정 | 값·조건 |
| --- | --- | --- |
| UI(기본) | 내 대본 | 1~2,000자. 글자 수와 예상 크레딧(글자 수 = 크레딧)을 같이 보인다 |
| UI(기본) | 성우 | 목록에서 고른 `voice_id`(`tc_`) |
| UI(기본) | 모델 | v30 기본, 고른 성우의 `models[].version`에 있는 것만 선택 가능 |
| UI(기본) | 언어 | `kor` 기본 권장(제안). "자동 감지"도 선택지. 모델별 지원 언어만 |
| UI(기본) | 감정 방식·값·강도 | v30: 자동(Smart) / 지정(preset). v21: 지정만. 감정 값은 성우의 `models[].emotions`와 모델의 preset 열거형의 교집합만 보인다. 강도는 preset일 때만 0~2(기본 1) |
| UI(기본) | 앞 문맥 / 뒤 문맥 | Smart일 때만, 각 2,000자 이하. 대본 안에서 앞뒤 문장을 자동 제안할 수 있음(제안) |
| UI(고급, 접기) | 속도 `audio_tempo`, 음높이 `audio_pitch` | 0.5~2.0, −12~12 |
| UI(고급, 접기) | 음량 | 기본(생략) / 상대 음량 `volume`(0~200) / 일정 음량 `target_lufs`(−70~0) 중 하나만(둘을 동시에 보내면 안 됨) |
| UI(고급, 접기) | 무음 줄이기 `remove_silence_ms` | 켜기 + 남길 길이(0~1000ms, 권장 0~200). 끄기를 0으로 보내면 의미가 뒤집힌다 |
| 서버 자동 | `X-API-KEY`, `Content-Type`, `User-Agent`(SDK의 `source`/`generatedBy`) | 키는 서버에만. 클라이언트로 내보내지 않는다 |
| 서버 자동 | 소유·유효 검사 | 서버가 정한 `context.ownerId`만 사용(프로젝트 규칙). `voice_id`가 목록에 있는 `tc_` 성우인지, 모델·언어·감정이 성우·모델 조합에 맞는지 |
| 서버 자동 | 길이 검사 | 빈 문자열과 2,000자 초과는 호출 전에 거절 |
| 서버 자동 | `prompt`·`output` 직렬화 | 고른 방식에 맞는 분기 필드만 보낸다(smart에 preset·intensity를, preset에 previous/next를 같이 보내지 않음). `emotion_type`은 v30에서 명시한다. 미설정 값은 생략. `volume`·`target_lufs` 둘 중 하나. 무음 끄기는 생략 |
| 서버 자동 | `audio_format`, 응답 처리 | 시험 듣기는 mp3(파일이 WAV의 절반 이하)가 적당하다(제안, 문서 근거 아님). 바이너리를 받아 재생용으로 저장한다. MIME은 요청 형식(`audio/wav`, `audio/mpeg`)에 맞춘다 |
| 서버 자동 | 오류 매핑, 중복·재시도 방지 | 402 크레딧 부족, 429 제한, 422 `TEXT_NOT_SYNTHESIZABLE`, 404 성우 없음. 같은 요청의 연타·자동 재시도를 막는다(멱등성 보장이 없다) |
| 쓰지 않음 | `seed`, `with-timestamps`·`granularity`, `compose`, 스트리밍, SSML·발음 사전, `uc_` 커스텀 보이스, `ssfm-v31`, v21에 smart·whisper·toneup·tonedown | `seed`는 현재 API·SDK에서 제거. 나머지는 시험 듣기에 불필요하거나 미지원·열거형 밖. 캐스팅 목록은 `original`만 쓰고 있고 클론은 별도 흐름 |

### 주의점 (구현 인계)

1. **과금:** 시험 듣기 한 번이 곧 유료 호출이다(글자당 1크레딧, 무료 미리듣기 없음). 자동 테스트·브라우저 QA에서 실제 호출을 하지 않는다는 프로젝트 규칙과 같은 이유다. 무료 플랜이면 100자 시험이 월 150회로 끝난다.
2. **무료 플랜 약관:** 무료 플랜 오디오는 상업 이용 불가·출처 표기가 필요하다. 시험 오디오를 영상 제작물에 쓸 계획이면 플랜을 확인해야 한다. 이 계정의 플랜은 정보 없음.
3. **한국어 지원은 호출 전에 알 수 없다:** 메타데이터에 지원 언어가 없다. 한글 이름이 있다고 한국어 발음이 되는 것은 아니다. `preview_url` 샘플이 어느 언어인지도 정보 없음. 그래서 "내 대본으로 듣기"가 한국어 적합성을 확인하는 사실상 유일한 방법이다.
4. **감정 선택지는 성우×모델마다 다르다:** `models[].emotions`를 그대로 존중한다. v30 "모든 보이스 가능" 문구와 응답 예시가 어긋나므로 문서 문구를 믿고 7개를 다 열면 안 된다. 열거형 밖 감정 값(T3 실측 모델당 최대 10개)이 `emotion_preset`으로 통하는지는 정보 없음.
5. **`prompt`를 생략했을 때 기본 감정은 정보 없음:** 자동 감정을 원하면 v30에서 `emotion_type: "smart"`를 명시한다.
6. **재현성 없음:** `seed`가 없고 동일 출력 보장 문구도 없다. 같은 설정을 다시 눌러도 다른 소리가 나올 수 있다고 보고, 다시 듣기는 받아 둔 오디오를 재생하고 새 호출을 만들지 않는다.
7. **끊어도 과금될 수 있다:** SDK 0.4.15에는 요청 취소가 없다. T5 합성은 60초 뒤 기다리기를 끝내지만 이미 간 SDK 요청은 뒤에서 끝까지 돌아 과금될 수 있고, 늦은 결과를 저장하지 않는다. 처리 여부를 확인할 Typecast 요청 id·생성 기록 조회 API도 없다. UI는 결과를 미확인으로 안내한다. 합성 소요 시간은 정보 없음.
8. **동시 호출:** Free는 동시 2건. 429의 `Retry-After` 문서가 없으므로 자동 재시도 대신 사용자에게 안내한다.
9. **SDK 0.4.15 함정**(코드 읽기, 실행 안 함):
   - `TTSResponse.format`은 응답 `content-type`의 뒷부분이 정확히 `mp3`일 때만 `mp3`이고, 문서의 `audio/mpeg`면 `wav`로 잘못 계산한다. 요청한 `audio_format`을 기준으로 삼아야 한다.
   - `duration`은 `x-audio-duration` 헤더가 없으면 0이다. 문서에 없는 헤더라서 길이를 표시하려면 응답 크기와 형식에서 계산하거나 재생기가 읽은 길이를 써야 한다.
   - 필터 타입에 `voice_type`이 없고, `TTSRequest.text` 주석이 5,000자이고(문서 2,000자), `UseCaseEnum`이 실제 값과 다르다.
10. **서버 경계:** 응답은 바이너리다. 현재 T5는 `/api/rpc` oRPC의 `File` 직렬화로 전달한다. [oRPC 바이너리 계약](../adr/0002-orpc-only-api.md).
11. **저장·보관:** Typecast는 생성 오디오 재조회 URL을 주지 않는다. T5는 결과를 Postgres에 30일 저장하고 사용자가 앱에서 지울 수 있게 한다([ADR 0003](../adr/0003-postgres-cache.md)).

## 문서 모순·미확인 사항

1. **v31:** llms와 v3 보이스 model 필터 설명에 `ssfm-v31`이 있으나 같은 문서의 `TTSModel` enum, 모델 표, 생성 API는 v30/v21만 명시한다. v31을 생성 지원 모델로 노출하지 않는다. [List Voices](https://typecast.ai/docs/api-reference/voices/list-voices), [모델](https://typecast.ai/docs/models)
2. **옛 클로닝 경로:** llms 핵심 가이드는 `/v1/voices/clone`을 안내하지만 변경 이력은 deprecated이고 새 `/v1/custom-voices/instant-clone` 사용을 명시한다. 신규 구현은 새 경로를 기준으로 한다. 옛 문서 MB와 새 문서 MiB 표기도 다르므로 새 계약의 MiB를 적용한다. [변경 이력](https://typecast.ai/docs/changelog), [Instant Clone](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone)
3. **v2 참조 잔재:** prompt 및 추천 설명이 `/v2/voices`를 언급하지만 최신 llms와 v3 참조에 따라 조회는 v3를 사용한다. 2026-10-04: 현재 문서는 v2를 Deprecated 그룹에 두고 OpenAPI `deprecated: true`로 표시한다. v1 보이스 API는 2026-01 변경 이력에 "Removed"이고 SDK 0.4.15에는 메서드가 남아 있다(2026-09-26판은 "참조 잔재"로만 적었다). [llms.txt](https://typecast.ai/docs/llms.txt), [Recommend](https://typecast.ai/docs/api-reference/voices/recommend-voices)
4. **스키마 불완전성:** target_lufs는 바깥 type과 anyOf null 표기가 충돌한다(2026-09-26판은 seed도 같다고 적었으나 `seed`는 현재 문서에서 사라졌다). v21 Prompt는 타입·default 키 일부가 없고 Smart 문맥 maxLength는 설명에만 있다. 설명상 범위를 검증하며 미설정 값은 생략하는 보수적인 직렬화를 권장한다. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)
5. **응답 MIME:** 일반 TTS 응답 OpenAPI는 audio/wav만 열거하지만 output.audio_format과 설명은 mp3도 지원한다. 요청 포맷에 맞는 MIME 처리 필요. 2026-10-04: compose 문서와 스트리밍 changelog는 `audio/mpeg`를 적는다. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)
6. **자동 감정 기본값:** prompt 생략이 smart를 뜻하는지 명확하지 않다. 제품의 자동 감정 모드는 v30에서 `emotion_type: smart`를 명시한다.
7. **SDK 지연 가능성:** raw API 옵션과 설치된 SDK 지원은 별개다. `remove_silence_ms`는 API 2026-09-15, SDK 일괄 지원은 09-17 변경 이력에 기록되어 있다. 설치 버전 검증은 구현 담당자의 후속 작업이다. [변경 이력](https://typecast.ai/docs/changelog), [SDK Overview](https://typecast.ai/docs/sdk/overview)
8. **감정 목록:** `models[].emotions`(string[])는 T3 실측으로 모델당 최대 10개인데 `EmotionEnum`은 7개다. 문서는 v30 프리셋이 "모든 보이스에서 가능"이라 하나 List Voices 응답 예시의 v30 성우는 4개만 가진다(2026-10-04).
9. **`use_cases` 서버 필터:** 문서 예시 `Ads`와 실측 값 `Ads/Promotion`이 같은 값인지 정보 없음. 문서 열거형 13개와 실측 13개는 이름으로 1:1 대응한다(추론, 2026-10-04).
10. **SDK 타입 주석:** `TTSRequest.text`의 `@maxLength 5000`은 문서의 1~2,000자와 다르다. 문서 값을 쓴다(2026-10-04).

## 구현 인계 요약

단일 생성의 사용자 선택 항목은 대본·보이스·언어·모델, smart/preset 및 각 분기 필드, 포맷·피치·속도·배타적인 음량 모드·무음 보존 길이다(2026-09-26판은 seed도 적었으나 현재 문서·SDK에 없어 뺐다). 타임스탬프 granularity와 Compose는 별도 생성 경로에만 붙인다. 서버는 인증/식별 헤더·전송 방식과 조건부 직렬화를 담당한다. 미지원·미확인 옵션을 가상의 API 입력으로 만들지 않는다. 이 문서는 공식 문서 기반 계약 확인이며 실제 계정별 보이스 가용성과 청취 품질은 전체 검증하지 않았다. T5 승인 실험에서 민지·ssfm-v30·기본 감정 생성 1회는 성공했다(아래 실측).

## 2026-10-04 재확인에서 바뀐 것

2026-09-26판 대비(연결 확인 절 관련 항목은 2026-09-30판 대비). 이번 재확인은 API를 호출하지 않았고, 성우 목록 실측 값(614명 등)은 T3 목록 조회 결과를 그대로 옮긴 것이다.

| # | 이전 판 | 2026-10-04 | 영향 |
| --- | --- | --- | --- |
| 1 | 단일 생성 body에 `seed`(0~4,294,967,295, 재현성 명시)가 있고 "구현 인계 요약"도 seed를 사용자 선택 항목으로 적음 | 현재 TTS·스트리밍·타임스탬프·compose 문서(영문·한국어)에 `seed` 문구가 **0건**. SDK 0.4.15는 `seed`를 `@deprecated Ignored; never sent`로 표시하고 코드가 보내기 전에 지운다. changelog에 제거 기록은 없다(언제 빠졌는지 정보 없음) | seed 행·인계 요약을 현재와 맞게 고쳤다. UI에서 seed를 빼고, 재현을 전제하지 않는다 |
| 2 | 크레딧 단위는 문서에 없다(글자 수로 추정, 미확정) | 공개 요금 페이지가 **"1 credit per character"**를 명시. 플랜별 월 크레딧·동시 요청 수·초과 단가도 확인 | 예상 크레딧 = 글자 수로 UI에 보일 수 있다. 단 공백·휴지 표기 포함 여부는 여전히 정보 없음 |
| 3 | (없음) | Free 플랜 오디오는 상업 이용 불가·출처 표기 필요, 동시 2건 | 주의점 2번 |
| 4 | 이름 검색·언어·페이지 나눔 query 없음 | **그대로 확인됨.** `voice_type`을 포함한 5개 query만 있다 | 변경 없음 |
| 5 | `/v2/voices`는 "참조 잔재" | 현재 문서가 v2를 Deprecated 그룹에 두고 OpenAPI `deprecated: true`로 표시. v1 보이스 API는 2026-01 제거. SDK에는 v1·v2 메서드가 남음 | 목록은 v3만 쓴다(현재 구현과 동일) |
| 6 | 단건 조회는 간단히 설명 | 단건 오류에 구조화 코드 `INVALID_VOICE_ID`(400)·`VOICE_NOT_FOUND`(404) 추가 확인. 합성 422에 `TEXT_NOT_SYNTHESIZABLE` 추가 확인 | 오류 매핑 시 사용 |
| 7 | 응답 MIME은 audio/wav만 열거, MP3 처리 필요 | 그대로. compose 문서는 `audio/mpeg`, 스트리밍 changelog는 `audio/mpeg`를 적음. SDK는 `x-audio-duration` 헤더를 읽고 mp3를 `audio/mpeg`일 때 wav로 잘못 분류함(코드 읽기) | 주의점 9번 |
| 8 | `text` 1~2,000자 | 그대로. SDK 타입 주석 5,000자와 불일치함을 추가 | 문서 값을 쓴다 |
| 9 | 감정은 "모델 문서는 모든 보이스 지원이라고 설명, 실제 선택 목록은 보이스 메타데이터도 확인" | 그대로. 추가로 `emotions`가 열거형이 아니라 string[]이고 T3 실측이 모델당 최대 10개로 7개 열거형을 넘는다는 점, 응답 예시가 v30 성우에 4개만 준다는 점을 근거로 문서 불일치로 분류 | 감정 목록 주의 |
| 10 | use_cases 실측 13종을 `UseCaseEnum`과 다르다고만 적음 | 문서 `UseCasesEnum`(13개)과 실측 13개가 이름으로 1:1 대응함을 표로 정리(추론). 서버 필터 `use_cases=Ads`가 `Ads/Promotion`과 맞는지는 정보 없음 | 서버 필터를 쓰지 않는 근거 |
| 11 | 스트리밍: WAV 32kHz, `volume` 불가 | 그대로. 첫 청크 약 200ms, 스트림 시작 후 오류는 상태 코드를 바꿀 수 없음을 추가 | 스트리밍 절 |
| 12 | 식별 규약 예에서 `generated_by=codex` | llms.txt는 "자기 에이전트 토큰"을 쓰라고 한다. 현재 구현은 `generatedBy: "claude-code"`이고 규약에 맞다 | 변경 없음 |
| 13 | v31은 생성 지원 모델로 노출하지 않는다 | **그대로.** 목록 `model` 설명에만 `ssfm-v31`이 있고 열거형·모델 표에는 없다 | 변경 없음 |
| 14 | v30 언어 37개, v21 27개 | 그대로(API 문서 표 기준). llms/models 문구는 "35+"이며 표는 37개 | 변경 없음 |
| 15 | 구독 응답은 `plan`, `credits`, `limits.concurrency_limit` | `limits.custom_voice_slot`, 문서상 `professional_voice_slot`, 플랜 값 `free`·`lite`·`plus`·`custom` 추가 확인. 이 계정의 플랜은 조회하지 않았다 | 연결 확인 절 |
| 16 | compose는 휴지 구간에 크레딧이 들지 않는다고만 적음 | compose는 한 구간이라도 실패하면 전체 실패하고 크레딧을 받지 않는다. 일반·스트리밍 TTS의 실패 과금은 정보 없음 | 과금 절 |

## 정보 없음 / 확인하지 못한 것 (2026-10-04)

- 성우 목록·단건·추천 호출의 과금 여부(문구 없음)
- 요청 제한 숫자, `Retry-After`, 동시 한도 초과 시 동작
- 최소 과금 단위, 공백·문장부호·`<|1s|>` 표기의 글자 수 포함 여부, 실패·중간 종료 합성의 과금(compose 제외)
- 일반 TTS 소요 시간, 글자 수당 오디오 길이, 입력 상한(2,000자)에서의 오디오 길이
- `prompt` 생략 시 서버 기본 감정 동작, 7개 열거형 밖 감정 값이 통하는지, 성우별 지원 언어, `preview_url` 샘플의 언어·문장
- `use_cases` 서버 필터의 값 형식(`Ads` vs `Ads/Promotion`)과 `model` 필터 후 `models` 배열 내용
- `seed`가 제거된 시점, 같은 입력의 동일 출력 여부
- `x-audio-duration` 헤더의 공식 보장 여부(SDK 코드에서만 확인)
- 이 계정의 플랜과 잔여 크레딧(조회하려면 키를 써야 해서 하지 않음)
- 성우 목록 실측 값(614명, 감정 최대 10개, use_cases 실제 값 등)의 재확인(2026-10-04에 재측정하지 않음)

## 2026-10-05 T5 재확인

공식 API 문서와 요금 페이지, API Terms of Use(2026-09-01 시행), Usage Policy, Attribution guidelines, 설치 SDK 0.4.15를 확인했다. API를 호출하지 않았다. 기존 계약에서 달라진 핵심은 없으며 다음 사실을 구현 문서와 맞췄다.

| 항목 | 확인 내용 | 출처 |
|---|---|---|
| 무료 경로 | 사용자 문장으로 합성하는 무료 API 경로는 없다. 무료로 재생할 수 있는 것은 목록의 `preview_url` 고정 샘플뿐이다. Free 플랜 크레딧은 무료 미리듣기가 아니라 생성 한도다 | [API 요금](https://typecast.ai/pricing/api/), [Voice 목록](https://typecast.ai/docs/api-reference/voices/list-voices), [llms.txt](https://typecast.ai/docs/llms.txt) |
| `seed` | API 참조에는 없고 SDK 0.4.15도 `@deprecated Ignored; never sent`로 표시한다. 개요 페이지 예시와 FAQ JSON-LD에 `seed: 42`가 남아 있어도 전송 근거로 삼지 않는다 | [TTS API](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech), [API 개요](https://typecast.ai/developers/api/) |
| 오류 헤더 | 설치 SDK의 `TypecastAPIError`는 응답 상태 코드·본문을 제공하지만 헤더는 보존하지 않는다. `Retry-After`를 읽을 수 없다. 프로젝트는 0.4.15 전송 코드에 `redirect: "error"`를 적용했다. SDK 자체에는 취소 신호가 없어 T5의 60초 대기 종료 후 공급자 요청이 계속될 수 있다 | 설치 SDK `lib/index.js`, 프로젝트 `packages/api/src/providers/typecast.ts` |
| 보관·사용 | API 약관은 Input·Output의 권리를 사용자에게 남기지만 생성 오디오의 앱 보관을 명시적으로 허용하거나 금지하지 않는다. 입력·출력은 서비스 개선·신제품 개발에 쓰일 수 있다. Free 플랜 결과는 상업 이용 불가·출처 표기 대상이다. T5는 저장 결과를 30일 보관하고 사용자가 삭제한다 | [API 약관](https://help.typecast.ai/en/articles/11872662-typecast-api-terms-of-use), [Usage Policy](https://typecast.ai/policy/), [Attribution](https://typecast.ai/guideline/), [ADR 0003](../adr/0003-postgres-cache.md) |

SDK 버전과 현재 프로젝트 연결 동작은 위 계약과 별도로 관리한다. 공급자 요청의 지연 완료 오디오는 저장하지 않으며, 취소 불가로 처리 여부를 알 수 없는 결과는 미확인으로 안내한다.

## T5 승인 실측 (2026-10-05)

- 민지, `ssfm-v30`, 직접 기본 감정, 속도1·음높이0·음량100. 문장 “오늘도 만나서 반가워요.”는 공백2개·마침표1개를 포함해13코드포인트다.
- 생성1회 성공. MP3 1.650초, 44.1kHz mono 320kbps, 69,006바이트. 앱 저장과 저장본 조회 바이트가 같고 로컬 전사가 원문과 일치했다. 사용자 직접 청취 평가는 아직 없다.
- 공급자 잔액14949→14936: 실측13크레딧. 직후에는차이가없었고 약3분후무료조회에서확인됐다. 이 문장에서는 공백·문장부호를 포함한 총길이와차감량이일치했다. 모든문장/휴지표기/최소과금규칙으로 일반화하지 않는다.
- 증거: `tasks/evidence/T05/real-typecast-01-result-corrected.json`, `real-typecast-01.mp3`, `real-typecast-01-asr.txt`. 최초도구입력검증400은SDK호출전거절이고, 공급자 생성은1회다.

## 성우 한 명 조회 (2026-10-07, T7 성우 보관함 이용 가능 확인)

공식 [Get Voice Details](https://typecast.ai/docs/api-reference/voices/get-voice-details)와 설치 SDK `@neosapience/typecast-js` 0.4.15를 읽었다. 공급자 API는 부르지 않았다. 위 "단건 조회와 `voice_type`" 절의 계약이 정본이고 이 절은 구현이 고른 값만 적는다.

| 항목 | 내용 |
| --- | --- |
| 호출 | `GET /v3/voices/{voice_id}`, SDK `client.getVoiceV3(voiceId)`(경로에 `encodeURIComponent`). 쿼리·본문 없음. 응답은 목록의 한 항목과 같은 `VoiceV3`라 목록과 같은 변환(`rawVoiceSchema` → `toVoice`)을 쓴다 |
| 없음 판정 | 404만 "없음"이다(`VOICE_NOT_FOUND`: 없거나 이 계정에서 쓸 수 없음). 400(`INVALID_VOICE_ID`)·401·403·429·5xx는 "없음"이 아니라 공급자 오류다(`reasonFromHttp`). 판정은 `providers/errors.ts`의 `nullOnStatus(…, 404)`다 |
| `voice_type` | 단건 조회는 `custom`(`uc_`)도 줄 수 있지만 `voice_type`을 거르지 않는다. 보관함 입력이 공개 목록 성우(출처 `public`)만 받고 voiceId를 `[A-Za-z0-9_-]{1,200}`로 제한한다. 클라이언트가 보낸 id를 서버 키로 조회하므로 소유자가 둘 이상이 되면 다시 본다(로드맵 T14 메모) |
| 과금 | 문서에 과금·크레딧 문구가 없다 = 정보 없음(무료라고 명시하지도 않는다). 목록 조회와 같은 읽기 호출로 다루고 24시간에 한 번·한 번에 40명·동시 2건·429면 그 공급자를 멈춘다 |
| 시간 제한·재시도 | SDK에 시간 제한·취소·재시도가 없다. `runList`의 10초 경주로 끊고 자동 재시도하지 않는다. SDK 오류는 `Retry-After`를 주지 않아 429 대기 시각이 없으면 앱이 60초를 적는다 |
| 샘플 주소 | 서명 없는 고정 주소라 만료 문구가 없다(위 "정보 없음" 그대로) |
