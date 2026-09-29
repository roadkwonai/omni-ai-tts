# ElevenLabs TTS API 옵션 조사

## 조사 범위와 기준

- 확인일: **2026-09-26 (Asia/Seoul)**. 요청된 [TTS 소개](https://elevenlabs.io/text-to-speech-api)와 [API introduction](https://elevenlabs.io/docs/api-reference/introduction)을 먼저 확인했다.
- 조사 유형: 구현 참조 및 현재 공식 문서 조사. 중심 계약은 `POST /v1/text-to-speech/{voice_id}`이다. `v1`은 HTTP 경로 버전이며 `eleven_v3` 모델 버전과 다르다.
- 공식 [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), 각 페이지의 `.md`, 공개 [OpenAPI](https://api.elevenlabs.io/openapi.json)를 대조했다. OpenAPI의 `info.version`은 `1.0`이며 배포 날짜나 모델 릴리스를 뜻하지 않는다.
- **인증 키 조회, 실제 음성 생성, 유료 API 호출은 하지 않았다.** 공개 문서·스키마 읽기만 수행했다. 따라서 문서 충돌이 있는 동작을 실측 검증했다고 주장하지 않는다.
- 표의 **배치**는 이 앱을 위한 제안이며 ElevenLabs 실제 화면 위치를 뜻하지 않는다. `기본`=평상시 입력, `표현`=연기·음색, `고급`=접힌 전문 설정, `서버자동`=서버·작업 흐름, `후속`=단일 convert 밖의 별도 흐름 또는 지원 확인이 필요한 도구. **이 분류는 구현 우선순위가 아니다. 음성 복제는 제품 요구의 P0를 유지하며, 우선순위 정본은 계획서다.**
- 이 문서는 외부 API 계약만 다룬다. 저장소의 현재 구현과 일치하는지는 별도 코드 확인이 필요하다.

## 직접 답변

단일 화자 TTS convert에는 **body 13개, query 3개, path 1개, API 인증 header 1개**가 있다. `voice_settings`는 중첩 5개, 발음 사전 locator는 중첩 2개다. 출력 형식은 **28개**다. 현재 공개 스키마에는 `emotion`, `pitch`, `volume`, `effects`, `apply_audio_effects`, `speaker_id`, `voice_description`라는 convert 필드가 없다. 감정 태그는 `text` 안에 넣으며, 음성 제작·복제·유사 음성 찾기·다중 화자 대화는 별도 API다. [Convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [OpenAPI](https://api.elevenlabs.io/openapi.json)

## 전체 요청 필드

`—`는 고정 기본값이 문서에 없음을 뜻한다. nullable과 optional은 서로 다르며, 미입력 값을 불필요하게 `null`로 직렬화하지 않는 편이 명확하다. 아래 표의 API 사실 출처는 모두 [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) 및 [공개 OpenAPI](https://api.elevenlabs.io/openapi.json)이다.

| 위치·필드 | 형식·범위·필수 여부 | 기본값 / 미지정 | 조건·의미 | 배치 |
| --- | --- | --- | --- | --- |
| path `voice_id` | string, 필수 | 없음 | 선택한 기존 음성의 ID. clone/design으로 만든 음성도 ID로 사용 | 기본: 음성 선택 |
| header `xi-api-key` | string | 없음 | 스키마는 optional로 표시하지만 인증 가이드는 키 필요. 클라이언트에 노출 금지 | 서버자동 |
| header `Content-Type` | `application/json` | 요청 형식 | body 전송 인코딩. 음성 조절 옵션이 아님 | 서버자동 |
| query `output_format` | enum 28개, 선택 | `mp3_44100_128` | 코덱·샘플레이트·비트레이트. 아래 전체 목록 참조 | 고급: 형식별 optgroup |
| query `enable_logging` | boolean, 선택 | `true` | false는 Enterprise 전용 zero retention. 생성 기록과 request stitching도 사용 불가 | 서버자동: 정책·계약에 따라 |
| query `optimize_streaming_latency` | integer 또는 null, 선택, deprecated | 미지정/None | 0=최적화 없음, 1=일반, 2=강함, 3=최대, 4=최대+정규화 끄기. 4는 숫자·날짜 발음 악화 가능 | 후속: 호환 전용, 신규 UI 비권장 |
| body `text` | string, **필수** | 없음 | 생성할 원문. 모델별 글자 제한과 태그 지원이 다름 | 기본: 대본 |
| body `model_id` | string, 선택 | `eleven_multilingual_v2` | 모델 목록의 `can_do_text_to_speech` 확인 필요 | 기본: 모델 |
| body `language_code` | ISO 639-1 string 또는 null, 선택 | — | 언어·정규화 강제. 미지원 언어는 무시. **Multilingual v2에서 지원하지 않음**. `ko`는 한국어, locale `ko-KR`와 구분 | 고급: 언어 |
| body `voice_settings` | object 또는 null, 선택 | 저장된 음성 설정 적용 | 현재 요청만 덮어씀. 영구 음성 설정 변경 API와 구분 | 표현: 중첩 표 |
| body `pronunciation_dictionary_locators` | object[] 또는 null, 최대 3개 | — | 배열 순서로 사전 적용 | 고급: 사전 선택 |
| body `seed` | integer 또는 null, **0–4294967295** | — | 동일 seed·조건의 재현은 best effort. 완전 동일 결과 보장 아님 | 고급: 재생성 비교 |
| body `previous_text` | string 또는 null | — | 앞 문맥. `previous_request_ids`와 함께 보내면 이 텍스트는 무시 | 서버자동: 대본 문맥 |
| body `next_text` | string 또는 null | — | 뒤 문맥. `next_request_ids`와 함께 보내면 이 텍스트는 무시 | 서버자동: 대본 문맥 |
| body `previous_request_ids` | string[] 또는 null, 최대 3개 | — | 앞서 완료한 생성의 request ID. 같은 모델 사용 권장 | 서버자동: 분할 생성 |
| body `next_request_ids` | string[] 또는 null, 최대 3개 | — | 뒤에 이어질 기존 생성의 request ID. 가운데 클립 재생성에 활용 | 서버자동: 재생성 |
| body `apply_text_normalization` | `auto` / `on` / `off` | `auto` | 숫자 등을 읽는 텍스트로 정규화. Flash/Turbo v2.5의 `on`은 요금제 조건 별도 확인 | 고급: 텍스트 처리 |
| body `apply_language_text_normalization` | boolean | `false` | 현재 일본어만 지원. 지연이 크게 늘 수 있음 | 고급: 일본어 조건부 |
| body `use_pvc_as_ivc` | boolean | `false` | PVC 대신 IVC 형태 사용. 문서 deprecated / OpenAPI 비deprecated 충돌 | 후속: 호환성 확인 후 |

인증 기준은 [API Authentication](https://elevenlabs.io/docs/api-reference/authentication)을 따른다. OpenAPI에 별도 선언된 다른 convert 요청 header는 없다. `Accept` 같은 일반 HTTP header를 제품의 음성 옵션으로 분류하지 않는다. 응답의 `request-id`, `character-cost`는 입력 옵션이 아니며 서버에서 메타데이터로 수집한다. [Request stitching](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching)

### `voice_settings` 전체 중첩 필드

아래 기본값은 `VoiceSettingsResponseModel` 스키마 기본값이다. **`voice_settings` 전체를 생략했을 때 기존 음성의 저장값 대신 반드시 이 숫자가 쓰인다는 의미는 아니다.** 모델별 사용 가능 여부와 UI 지원은 다음 절을 함께 적용한다. [Convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Voice settings](https://elevenlabs.io/docs/api-reference/voices/settings/get)

| 필드 | 형식·범위 | 스키마 기본값 | 의미·조건 | 배치 |
| --- | --- | --- | --- | --- |
| `stability` | number 또는 null, **0–1** | `0.5` | 낮으면 변동·감정 폭 증가, 높으면 안정적이나 단조로울 수 있음. v3는 Creative/Natural/Robust 표현 사용 | 표현 |
| `similarity_boost` | number 또는 null, **0–1** | `0.75` | 원본 음성 유사도. 원본 잡음도 따라갈 수 있음. 제품 가이드상 v3 UI 미지원 | 표현: v3 지원미확인 |
| `style` | number 또는 null; API 스키마 min/max 없음 | `0` | 원본 스타일 강조. 추가 지연·불안정성 가능. 공식 upstream 가이드는 0–1을 안내하지만 스키마 보장으로 단정 금지 | 표현: 보수적 0–1, 모델 조건 |
| `use_speaker_boost` | boolean 또는 null | `true` | 유사도 향상, 추가 지연 가능. 제품 가이드상 v3 미지원 | 표현: v3에서는 비활성/숨김 |
| `speed` | number 또는 null; convert 스키마 min/max 없음 | `1` | 제품/Studio 문서는 **0.7–1.2**, 공식 upstream skill은 REST **0.25–4.0**으로 충돌. v3 제품 가이드는 미지원 | 기본 또는 표현: 보수적 0.7–1.2, v3 지원미확인 |

모든 중첩 필드는 선택 사항이다. 화면 50%/75%는 API 0.5/0.75로 변환해야 한다. 고정 기본값을 명시하는 UI라면 실제 전송한 설정을 생성 기록에 함께 남겨야 비교가 가능하다. 후자는 앱 구현 제안이다.

### 발음 사전 locator 전체 중첩 필드

| 필드 | 형식 | 기본값 | 조건 | 배치 |
| --- | --- | --- | --- | --- |
| `pronunciation_dictionary_id` | string, **필수** | 없음 | 미리 생성한 사전 ID | 고급: 사용자 사전 선택, ID는 서버 매핑 |
| `version_id` | string 또는 null, 선택 | 생략하면 최신 버전 | 재현성이 중요하면 버전 고정 | 서버자동 / 고급 |

사전 생성·수정은 별도 [Pronunciation Dictionaries API](https://elevenlabs.io/docs/api-reference/pronunciation-dictionaries/create-from-rules) 범위다. 사전은 대소문자를 구분하며 처음 일치한 치환을 사용한다. Multilingual v2에서는 phoneme 태그가 지원되지 않아 alias 치환을 사용한다. v3의 `/IPA/` 직접 텍스트 표기는 기존 XML phoneme 태그와 다르다. [발음 가이드](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#pronunciation)

### 문맥과 request ID 처리 조건

- `previous_request_ids`와 `next_request_ids` 각각 최대 3개다. ID는 **2시간 이내** 생성에 사용하며, 스트리밍 응답을 끝까지 읽은 후 다음 요청에 쓸 수 있다.
- 공식 stitching 가이드는 **`eleven_v3`에서 request stitching 미지원**이라고 명시한다. 공통 body에 필드가 있다는 이유만으로 v3에서 유효하다고 보장하면 안 된다. v3에서 문맥 필드까지 모두 동일하게 지원된다고 추정하지 않는다.
- `enable_logging=false`에서는 stitching을 쓸 수 없다. 동일 모델 유지와 앞뒤 ID의 대응 관계는 서버가 관리하는 편이 적절하다.
- 재생성 UI에는 사용자가 UUID를 직접 입력하게 하기보다 “앞뒤 발화와 연결” 같은 작업 의미를 제공할 수 있다. 이는 UI 제안이며 공급자 API의 실제 boolean 필드가 아니다.

출처: [Request stitching](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching), [Convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

## 출력 형식 28개 전체 목록

출처: [Create speech query](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [OpenAPI output_format enum](https://api.elevenlabs.io/openapi.json). 배치는 모두 **고급**이다. MP3를 기본 그룹으로, 나머지는 코덱별 optgroup으로 노출하는 안이다.

| optgroup | 허용 enum 전체 | 개수 | 조건·기본값 |
| --- | --- | --- | --- |
| MP3 | `mp3_22050_32`, `mp3_24000_48`, `mp3_44100_32`, `mp3_44100_64`, `mp3_44100_96`, `mp3_44100_128`, `mp3_44100_192` | 7 | 기본 `mp3_44100_128`. 192 kbps는 Creator 이상 |
| PCM | `pcm_8000`, `pcm_16000`, `pcm_22050`, `pcm_24000`, `pcm_32000`, `pcm_44100`, `pcm_48000` | 7 | PCM 44.1 kHz는 Pro 이상. raw PCM과 WAV 파일 구분 |
| WAV | `wav_8000`, `wav_16000`, `wav_22050`, `wav_24000`, `wav_32000`, `wav_44100`, `wav_48000` | 7 | WAV 44.1 kHz는 Pro 이상 |
| Opus | `opus_48000_32`, `opus_48000_64`, `opus_48000_96`, `opus_48000_128`, `opus_48000_192` | 5 | 샘플레이트 48 kHz |
| 전화 오디오 | `ulaw_8000`, `alaw_8000` | 2 | 8 kHz. μ-law는 Twilio 입력 등의 통신 용도 |

공식 convert 설명은 48 kHz PCM/WAV의 요금제 제한을 구체적으로 적지 않는다. “44.1 kHz만 제한이라고 했으므로 48 kHz는 무료”처럼 해석하지 않는다. 계정 기능 확인 없이 선택 가능 여부를 확정할 수 없다. SDK enum이나 과거 문서가 21개만 보여도 현재 TTS convert의 WAV 7개를 누락하면 안 된다.

## 모델별 차이와 조건부 UI

출처: [Models](https://elevenlabs.io/docs/overview/models), [TTS 제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech), [Best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices). 모델별 사용 가능 옵션은 실제 model capability 확인과 문서 충돌 처리가 필요하다.

| 모델 ID | 문서상 용도·언어 | 요청 길이 | 표현·처리 특징 | UI 처리안 |
| --- | --- | --- | --- | --- |
| `eleven_v3` | 표현·감정·대화, 70+ 언어 | Models/제품 가이드 **5,000자**; 마케팅 **3,000자**와 충돌 | `text` audio tag, v3 안정성 모드. SSML break·request stitching 미지원. 제품 가이드는 speed/similarity/speaker boost 미지원 명시 | 표현 중심. 안정성 모드·태그. 나머지는 지원미확인 표시; 하드 제한은 근거를 명시해 결정 |
| `eleven_multilingual_v2` | 장문 일관성·내레이션, 29언어 | **10,000자** | 저장 음성 설정/일반 voice_settings. `language_code` 미지원. 숫자 정규화가 Flash보다 강함. XML phoneme 미지원 | 일반 표현 옵션과 사전 alias; 언어 강제 비활성 |
| `eleven_flash_v2_5` | 저지연, 32언어, 문서상 약 75ms | **40,000자** | 낮은 지연을 위해 정규화 기본 비활성이라는 모델 안내. v2.5 `on`은 Enterprise 조건. 모든 voice_settings의 효과를 보장하지 말 것 | 속도·안정성·유사도 우선, 지연·정규화 조건 안내 |
| `eleven_turbo_v2_5` | 품질·속도 절충, 32언어 | 마케팅 **40,000자** | 약 250–300ms 안내. 모델 가이드의 v2.5 정규화 요금제 조건 적용 확인 | 필요시 고급 모델 선택 |
| `eleven_flash_v2` | 영어, 저지연 | **30,000자** | v2.5와 언어·길이 같다고 취급하지 않음 | 한국어 흐름 기본 후보에서 제외 |
| `eleven_v3_conversational` | 실시간 표현, 70+ 언어, 약 280ms | 이번 조사에서 일반 convert 한도 확정 안 함 | Models는 별도 Text to Dialogue WebSocket 안내 | 후속: 일반 v3 옵션과 합치지 않음 |

지연 수치는 모델 소개값이며 네트워크·지역·목소리·요청 길이·부하를 포함한 앱 응답 SLA가 아니다. v3가 모든 공식 페이지에서 일관되게 preview/GA로 표기되어 있지는 않다. Best practices에 남아 있는 “research preview” 문구를 최신 릴리스 상태의 단독 근거로 삼지 않는다.

v3의 Creative/Natural/Robust **명칭은 공식 문서로 확인**되지만, 조사한 convert 스키마와 제품 가이드에서 명칭별 숫자 매핑 및 세 값만 허용한다는 제약은 확인되지 않았다. `0 / 0.5 / 1`을 UI 프리셋으로 쓰더라도 앱의 보수적 프리셋으로 표시하고 공급자 enum이라고 단정하지 않는다.

## 감정·연기·효과의 경계

| 기능 | 실제 API 표현 | 조건 | 배치 |
| --- | --- | --- | --- |
| 감정·톤 | `text`에 `[excited]`, `[curious]`, `[sarcastic]`, `[crying]` 등 | v3 audio tag 예시. 고정 enum이나 정확한 감정 강도 보장 아님 | 표현: 태그 삽입 |
| 음성 행위 | `[whispers]`, `[laughs]`, `[sighs]`, `[exhales]` 등 | 음성과 학습 데이터에 따라 효과 다름 | 표현 |
| 속도·멈춤 | v3에서는 audio tag·구두점·문장 구조 | v3는 SSML `<break>` 미지원. 다른 모델은 break 가이드 확인 | 표현: 모델별 |
| 배경 효과 태그 | 공식 v3 가이드 예시 `[applause]`, `[clapping]` 등 | 태그 결과는 비결정적. 동일 페이지의 태그 자동 보정용 프롬프트는 음악/SFX 태그를 넣지 말라고 하므로 문맥 구분 | 표현: 실험적 표시 |
| 확정적인 효과·음악·볼륨·피치 | convert에 해당 파라미터 없음 | 별도 Sound Effects 생성, 믹싱·후처리·플레이어 제어 | 후속 도구 |
| `apply_audio_effects` | 현재 공개 convert/stream/timestamp 스키마 모두 없음 | 과거 예제·타 endpoint의 값을 현재 convert로 복사 금지 | 후속 / 미지원 |

출처: [v3 prompting](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3), [Sound Effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [OpenAPI](https://api.elevenlabs.io/openapi.json).

## Studio UI와 convert API는 같은 옵션 목록이 아니다

[Studio 공식 가이드](https://elevenlabs.io/docs/eleven-creative/products/studio)는 프로젝트·문단·타임라인·트랙 편집을 다룬다. 다음 대응표는 표면상 비슷한 조절값이 있어도 적용 범위가 다른 점을 구분한다.

| Studio 기능 | convert 대응 | 해석 / 배치 |
| --- | --- | --- |
| Voice / Model | `voice_id` / `model_id` | 기본 선택에 대응 |
| Stability / Similarity / Style / Speaker boost / Speed | `voice_settings` 일부 | 의미는 대응하지만 모델별 제공 여부·범위·기본값은 각각 확인 |
| Override settings | convert는 애초에 요청 단위 override | Studio에서 선택 문단과 프로젝트 전체 범위가 구분됨. 앱의 대본/구간 설정 범위는 별도로 설계 |
| Alias | convert 필드 없음 | 프로젝트 속 화자의 표시명. `voice_id` 자체를 바꾸지 않음. 기본: 화자 표시명 |
| Volume | convert 필드 없음 | Studio는 -30~+5 dB, 기본 0 dB. 후속: 믹싱·재생/내보내기 처리 |
| Pronunciations editor | 사전 locator 및 별도 사전 API | 사전 콘텐츠 관리와 TTS 선택을 분리. 고급 |
| Break / Timeline / 음악·SFX track | 단일 convert의 구조화 필드 없음 | 구간 생성·후처리 또는 Studio API 범위. 후속 |
| Actor Mode | convert에 오디오 입력 없음 | 녹음 연기를 이용하는 별도 Voice Changer 흐름 검토. 후속 |
| Script의 여러 화자 | convert 한 번은 path의 voice 한 명 | Text to Dialogue 또는 앱의 세그먼트별 생성 흐름. 후속 |
| Export settings / Caption | `output_format`은 오디오 인코딩만 | 비디오 내보내기·자막·타임라인은 별도 기능. 타이밍 필요시 TTS with-timestamps endpoint 검토 |

## 관련 기능: 별도 API와 앱 기능 분리

| 기능 | 공식 경로·입력 | convert와의 관계 | 배치·범위 | 직접 출처 |
| --- | --- | --- | --- | --- |
| 내 음성 검색 | `GET /v2/voices` | 기존 `voice_id` 선택 데이터 | 기본: 음성 탐색 | [List voices](https://elevenlabs.io/docs/api-reference/voices/search) |
| 공개 라이브러리·추천 후보 | `GET /v1/shared-voices`; 언어·성별·연령·accent·use_cases·descriptives·featured·sort | 추천 결과를 convert가 자동 산출하지 않음. `trending` 정렬은 사용자 대본 적합도 평가와 다름 | 기본: 탐색; 후속: 앱 추천 로직 | [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared) |
| 오디오로 유사 음성 찾기 | `POST /v1/similar-voices`, multipart `audio_file`, `similarity_threshold` 0–2(작을수록 유사), `top_k` 1–100 | 기존 공개 음성 검색이며 복제 아님. numeric defaults는 문서 미기재 | 후속: 오디오 기반 검색 | [List similar voices](https://elevenlabs.io/docs/api-reference/voices/find-similar-voices) |
| Voice Design 미리듣기 | `POST /v1/text-to-voice/design`; `voice_description` 필수, 모델 `eleven_multilingual_ttv_v2` / `eleven_ttv_v3` | `generated_voice_id`·미리듣기 반환. 일반 TTS의 model ID와 혼동 금지 | 후속: 음성 제작 | [Design](https://elevenlabs.io/docs/api-reference/text-to-voice/design) |
| 디자인 음성 저장 | `POST /v1/text-to-voice`; `voice_name`, `voice_description`, `generated_voice_id` 필수 | 저장 후 받은 `voice_id`로 TTS | 후속: 저장 단계 | [Create voice](https://elevenlabs.io/docs/api-reference/text-to-voice/create) |
| Instant Voice Cloning | `POST /v1/voices/add`; multipart `name`, `files` 필수 | 샘플로 음성 생성. `requires_verification` 응답 확인 | 후속: 복제 흐름 | [IVC](https://elevenlabs.io/docs/api-reference/voices/ivc/create) |
| Professional Voice Cloning | `POST /v1/voices/pvc`; `name`, `language`, 이후 samples·verification·train | 생성 즉시 일반 TTS 준비 완료와 같지 않음 | 후속: 별도 다단계 흐름 | [PVC create](https://elevenlabs.io/docs/api-reference/voices/pvc/create), [PVC guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning) |
| Speech to Speech / Voice Changer | `POST /v1/speech-to-speech/{voice_id}`; multipart `audio` 필수 | 오디오의 내용·연기를 다른 음색으로 변환. `voice_settings`도 JSON **문자열**로 전송. `remove_background_noise`, `file_format`은 이쪽 입력 | 후속: 녹음 연기/음성 변환 | [Voice Changer](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert) |
| 여러 화자 대본 생성 | `POST /v1/text-to-dialogue`; `inputs: [{text, voice_id}]`, 기본 `eleven_v3` | 단일 convert와 다름. 현재 문서는 최대 고유 voice 10개·전체 입력 2,000자 이하 권장 | 후속: 대화 모드 | [Create dialogue](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert) |
| 감정 추천·태그 자동 제안 | convert에 직접 필드 없음 | 공식 태그 가이드 기반 앱 보조 기능으로 구성 가능. 추천 텍스트를 사용자가 검토한 후 `text`로 전송 | 표현 / 후속 앱 기능 | [v3 guide](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3) |
| 대본 화자 자동 인식·배정 | convert에 직접 필드 없음 | 앱의 대본 분석/편집과 voice 매핑. 자동 배정 결과를 사용자에게 보여줄 필요 | 후속 앱 기능 | [Dialogue inputs 계약](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert) |
| 프로젝트·챕터·타임라인 관리 | Studio API | 단발 TTS 요청과 다른 리소스·작업 모델 | 후속 | [Studio API](https://elevenlabs.io/docs/api-reference/studio-api-information) |

Voice Design의 `guidance_scale`, `loudness`, `quality`, `prompt_strength`, `reference_audio_base64`, `auto_generate_text`, `should_enhance`, `stream_previews`와 remix session ID는 **음성 디자인 endpoint의 필드**다. TTS convert 옵션 목록에 섞지 않는다. [Design 요청 전체](https://elevenlabs.io/docs/api-reference/text-to-voice/design)

## 문서 충돌과 미확정 사항

| 항목 | 충돌·불완전한 증거 | 현재 판단·구현 인계 |
| --- | --- | --- |
| v3 길이 | [마케팅](https://elevenlabs.io/text-to-speech-api) 3,000 vs [Models](https://elevenlabs.io/docs/overview/models#character-limits)·[제품](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) 5,000 | 모델/제품 문서를 우선할 근거가 있으나 실제 호출 검증 없음. 마케팅 수치를 그대로 전 모델 validator로 사용하지 않음 |
| speed 범위 | 제품·Studio·best practices 0.7–1.2 vs 공식 upstream skill REST 0.25–4.0. convert OpenAPI에는 min/max 없음 | UI는 보수적 0.7–1.2 제안. API의 절대 허용 한도라고 설명 금지. 확대는 지원 확인 후 |
| v3 voice_settings | 제품 가이드 speed/similarity/speaker boost 미지원 vs 공식 skill 예제는 v3에 similarity/style/boost까지 전달 | 공통 스키마 수용과 실제 모델 효과는 다름. v3 기본 노출은 안정성·태그 중심. 나머지는 지원미확인 |
| style 범위 | convert OpenAPI min/max 없음; upstream skill 0–1 | UI 0–1은 보수적 범위. 공급자 스키마 검증값으로 단정 금지 |
| `use_pvc_as_ivc` | 렌더링 API 문서는 deprecated, live OpenAPI는 비deprecated이며 설명도 변경 | 신규 기본 UI에서 제외. 필요시 고급 호환성 처리 후 재확인 |
| 정규화 권한 | convert는 `auto/on/off`만 설명; 모델 가이드는 v2.5 `on` Enterprise 조건 | 모델·계정 조건 안내. 단순 enum만 보고 모든 계정에서 `on` 보장 금지 |
| 인증 | OpenAPI `xi-api-key` optional vs 인증 가이드 요청마다 필요 | 서버 인증 필수로 처리 |
| v3 release 상태 | 최신 Models와 Best practices의 research-preview 표현이 일치하지 않음 | 최신 모델 지원 자체와 preview 라벨 분리. release channel 확정 주장 안 함 |
| 발음 지원 | v3의 native IPA와 구형 SSML phoneme 설명이 함께 존재 | 모델마다 다른 텍스트 표기·사전 규칙을 적용 |
| 효과 | 일부 과거 통합 예제에서 언급될 수 있으나 현재 TTS 4개 HTTP 경로 모두 `apply_audio_effects` 없음 | API body에 전송하지 않고 별도 후속 도구로 분리 |

## 공식 문서 외 보충 근거

외부 서드파티·다른 OSS의 동작을 API 계약 증거로 사용하지 않았다. 문서의 speed/style 한계가 불완전해 ElevenLabs 자체 upstream skill을 보충 확인했다.

- `elevenlabs/skills@62eb4fcaf23f0dd888c0bb228652b6b4984e964d:text-to-speech/references/voice-settings.md:L7-L13` — [고정 SHA](https://github.com/elevenlabs/skills/blob/62eb4fcaf23f0dd888c0bb228652b6b4984e964d/text-to-speech/references/voice-settings.md#L7-L13). REST speed 0.25–4.0와 style 0–1 안내. 문서 충돌을 해소하는 확정 증거로 쓰지 않음.
- 같은 파일 `L23-L32`, `L104-L109` — [고정 SHA](https://github.com/elevenlabs/skills/blob/62eb4fcaf23f0dd888c0bb228652b6b4984e964d/text-to-speech/references/voice-settings.md#L23-L32). v3 설정 예시가 제품 가이드와 충돌하고 Flash가 일부 설정을 무시한다고만 설명하여 정확한 모델별 허용표로 쓰기 부족함.

## 구현 인계 요약

1. **기본**: 대본·목소리·모델. **표현**: 모델별 유효 설정·v3 태그. **고급**: 28개 출력 형식, 언어 강제, 정규화, 사전, seed.
2. **서버자동**: 키, 정책별 logging, request ID·문맥·사전 버전·실제 적용값 기록. **후속**: deprecated 옵션, 효과/볼륨 믹싱, 음성 제작·복제·유사 음성 검색, 여러 화자, 추천·분석.
3. API 필드 존재, 모델 지원, Studio UI 기능을 별개로 취급한다. 미지원·조건부 옵션을 모든 모델에서 동작하는 것처럼 보여주지 않는다.
4. 실제 API 검증은 수행하지 않았다. 위 충돌은 지원미확인 설명·보수적 UI 범위로 다루고, 미래 문서 업데이트나 허가된 기능 검증에서 해소한다.

## 문서 검증 증거

- 2026-09-26 공개 OpenAPI와 필드명을 자동 대조: body **13/13**, query **3/3**, voice_settings **5/5**, 사전 locator **2/2**, 출력 형식 **28/28** 포함.
- 참조 스키마 SHA-256: `4a6716242c9ed6dafa43ccbff4447818e7f4295d2c4aef89489e9649e642e643`. 공개 스키마 스냅샷의 식별값이며 공급자의 배포 버전은 아니다.
- 네 가지 HTTP TTS 경로의 body를 확인했고 효과 파라미터는 없었다. 실제 음성·품질·계정별 권한 검증은 실행하지 않았다.
