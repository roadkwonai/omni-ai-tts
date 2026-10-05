# ElevenLabs TTS API 옵션 조사

## 조사 범위와 기준

- 확인일: **2026-10-04 (Asia/Seoul)**. 2026-09-26 최초 조사와 2026-09-30 연결 확인(T2) 위에 2026-10-04 재확인(성우 목록, 내 문장 듣기)을 합쳤다. 최초 조사는 요청된 [TTS 소개](https://elevenlabs.io/text-to-speech-api)와 [API introduction](https://elevenlabs.io/docs/api-reference/introduction)을 먼저 확인했다.
- 조사 유형: 구현 참조 및 현재 공식 문서 조사. 중심 계약은 `POST /v1/text-to-speech/{voice_id}`이다. `v1`은 HTTP 경로 버전이며 `eleven_v3` 모델 버전과 다르다.
- 공식 [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), 각 페이지의 `.md`, 공개 [OpenAPI](https://api.elevenlabs.io/openapi.json)를 대조했다. OpenAPI의 `info.version`은 `1.0`이며 배포 날짜나 모델 릴리스를 뜻하지 않는다.
- **실제 음성 생성, 계정 상태를 바꾸는 호출, 유료 API 호출은 하지 않았다.** 2026-09-26 조사는 공개 문서·스키마 읽기만 수행했다. 2026-10-04 재확인은 공식 문서 `.md`, 공개 OpenAPI, 설치 SDK `.d.ts`를 다시 읽고 **목록 조회만** 실제로 호출했다(공개 라이브러리 `language=ko`, 계정 성우 목록, 한국어 억양 목록). 실측 값은 "(2026-10-04 실측, 목록 조회)"로 표시한다. 따라서 문서 충돌이 있는 합성 동작을 실측 검증했다고 주장하지 않는다.
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
| body `apply_text_normalization` | `auto` / `on` / `off` | `auto` | 숫자 등을 읽는 텍스트로 정규화. v2.5 계열(Flash/Turbo)의 `on`은 **Enterprise만**(2026-09-26판은 "요금제 조건 별도 확인"이라 적었다) | 고급: 텍스트 처리 |
| body `apply_language_text_normalization` | boolean | `false` | 현재 일본어만 지원. 지연이 크게 늘 수 있음 | 고급: 일본어 조건부 |
| body `use_pvc_as_ivc` | boolean | `false` | PVC 대신 IVC 형태 사용. 문서 deprecated / OpenAPI 비deprecated 충돌 | 후속: 호환성 확인 후 |

인증 기준은 [API Authentication](https://elevenlabs.io/docs/api-reference/authentication)을 따른다. OpenAPI에 별도 선언된 다른 convert 요청 header는 없다. `Accept` 같은 일반 HTTP header를 제품의 음성 옵션으로 분류하지 않는다. 응답의 `request-id`, `character-cost`는 입력 옵션이 아니며 서버에서 메타데이터로 수집한다. [Request stitching](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching) 2026-10-04: API 소개의 "Tracking generation costs"에 `character-cost`, `request-id`, `x-trace-id`가 공식 문서화돼 있다(2026-09-26판은 stitching 가이드만 근거로 들었다). 동시성 헤더 `current-concurrent-requests`, `maximum-concurrent-requests`도 확인했다. SDK는 `.withRawResponse()`로 `rawResponse.headers`를 읽는다. [API introduction](https://elevenlabs.io/docs/api-reference/introduction)

### `voice_settings` 전체 중첩 필드

아래 기본값은 `VoiceSettingsResponseModel` 스키마 기본값이다. **`voice_settings` 전체를 생략했을 때 기존 음성의 저장값 대신 반드시 이 숫자가 쓰인다는 의미는 아니다.** 모델별 사용 가능 여부와 UI 지원은 다음 절을 함께 적용한다. [Convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Voice settings](https://elevenlabs.io/docs/api-reference/voices/settings/get)

| 필드 | 형식·범위 | 스키마 기본값 | 의미·조건 | 배치 |
| --- | --- | --- | --- | --- |
| `stability` | number 또는 null, **0–1**(스키마에 min/max 있음) | `0.5` | 낮으면 변동·감정 폭 증가, 높으면 안정적이나 단조로울 수 있음. v4·v3·v2·Flash 모두 있다(2026-10-04). v3의 허용값 형태는 **정보 없음**. 2026-09-26판은 "v3는 Creative/Natural/Robust 표현 사용"이라 적었으나 2026-10-04에 받은 공식 페이지에서 이 명칭을 찾지 못했다 | 표현 |
| `similarity_boost` | number 또는 null, **0–1**(스키마에 min/max 있음) | `0.75` | 원본 음성 유사도. 원본 잡음도 따라갈 수 있음. 제품 가이드상 v3 UI 미지원. v4는 있다(2026-10-04) | 표현: v3 지원미확인 |
| `style` | number 또는 null; API 스키마 min/max 없음 | `0` | 원본 스타일 강조. 추가 지연·불안정성 가능. 공식 upstream 가이드는 0–1을 안내하지만 스키마 보장으로 단정 금지. **v4는 없다**(2026-10-04). 일반적으로 0 유지 권장 | 표현: 보수적 0–1, 모델 조건 |
| `use_speaker_boost` | boolean 또는 null | `true` | 유사도 향상, 추가 지연 가능. 제품 가이드상 v3 미지원. v4는 두 설정(Stability·Similarity)만이라 사실상 없다(2026-10-04) | 표현: v3·v4에서는 비활성/숨김 |
| `speed` | number 또는 null; convert 스키마 min/max 없음 | `1` | 제품/Studio 문서는 **0.7–1.2**, 공식 upstream skill은 REST **0.25–4.0**으로 충돌. v3 제품 가이드는 미지원. **v4도 없다**(2026-10-04) | 기본 또는 표현: 보수적 0.7–1.2, v3·v4에서는 비활성/숨김 |

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

공식 convert 설명은 48 kHz PCM/WAV의 요금제 제한을 구체적으로 적지 않는다(2026-10-04에도 **정보 없음**). “44.1 kHz만 제한이라고 했으므로 48 kHz는 무료”처럼 해석하지 않는다. 계정 기능 확인 없이 선택 가능 여부를 확정할 수 없다. SDK enum이나 과거 문서가 21개만 보여도 현재 TTS convert의 WAV 7개를 누락하면 안 된다.

2026-10-04 확인: 21개 목록은 `/stream` 계열의 실제 목록이다. convert와 with-timestamps는 **28개**, `/stream` 계열은 **21개**이며 convert 목록에서 **WAV 7개가 빠진다**(SDK 2.70.0 `.d.ts`도 같다). stream의 안내 문구는 PCM 44.1 kHz가 Pro 이상이다. "더 높은 품질 옵션은 유료 플랜 전용"이라는 일반 문구도 있다([TTS 개요](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)). 응답은 200 바이너리 오디오이고 공개 OpenAPI는 `audio/mpeg`만 적는다. mp3 외 형식의 응답 content-type은 **정보 없음**이다.

## 모델별 차이와 조건부 UI

출처: [Models](https://elevenlabs.io/docs/overview/models), [TTS 제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech), [Best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices). 모델별 사용 가능 옵션은 실제 model capability 확인과 문서 충돌 처리가 필요하다.

| 모델 ID | 문서상 용도·언어 | 요청 길이 | 표현·처리 특징 | UI 처리안 |
| --- | --- | --- | --- | --- |
| `eleven_v4` (2026-10-04 추가) | 최신. 90+ 언어(목록에 Korean). 다른 언어를 말할 때 원래 억양을 가져오지 않고 대상 언어로 자연스럽게 발음한다고 안내("every voice usable across every supported language") | **10,000자** | 오디오 태그(v3보다 정교하다고 안내), 텍스트 안 `"/IPA/"` 직접 표기. 음성 설정은 Stability·Similarity 둘뿐(Style·Speed·speaker boost·SSML 없음). 출시 후에도 계속 학습되어 "행동이 시간이 지나며 바뀔 수 있다"고 명시. PVC 지원은 "rolling out" | 한국어 흐름 기본 후보. "일부 언어는 더 유창함"이라 했으므로 효과는 직접 들어 확인 |
| `eleven_v4_turbo` (2026-10-04 추가) | v4 계열 실시간. 같은 v4 계열 언어 목록 | 정보 없음 | 오디오 태그 지원("Audio tags for fine-grained control"). 지연 약 100ms(문서 수치) | `POST /v1/text-to-speech/...`에서 되는지 공식 문구 없음(정보 없음). 가격 페이지에는 "Text to Speech (v4 Turbo)"로 올라 있고 Models는 "Text to Dialogue websocket"을 적었다. 모델 목록의 `can_do_text_to_speech`로 확인할 때까지 숨김 |
| `eleven_v3` | 표현·감정·대화, 70+ 언어. Models는 "이전 세대"로 분류(2026-10-04) | Models·가격 페이지·제품 가이드 **5,000자**; 마케팅 FAQ **3,000자**와 충돌(2026-10-04에도 지속) | `text` audio tag. SSML break·request stitching 미지원. 제품 가이드는 speed/similarity/speaker boost 미지원 명시. 안정성 모드의 명칭(Creative/Natural/Robust)은 2026-10-04 문서에서 찾지 못했고 허용값은 정보 없음 | 표현 중심. 태그. 안정성은 슬라이더 숨김 또는 보수적으로. 나머지는 지원미확인 표시; 하드 제한은 근거를 명시해 결정 |
| `eleven_multilingual_v2` | 장문 일관성·내레이션, 29언어 | **10,000자** | 저장 음성 설정/일반 voice_settings. `language_code` 미지원. 숫자 정규화가 Flash보다 강함. XML phoneme 미지원 | 일반 표현 옵션과 사전 alias; 언어 강제 비활성 |
| `eleven_flash_v2_5` | 저지연, 32언어, 문서상 약 75ms | **40,000자** | 낮은 지연을 위해 정규화 기본 비활성이라는 모델 안내. v2.5 `on`은 Enterprise 조건. 모든 voice_settings의 효과를 보장하지 말 것 | 속도·안정성·유사도 우선, 지연·정규화 조건 안내 |
| `eleven_turbo_v2_5` | 품질·속도 절충, 32언어. **2026-10-04: deprecated**. Models 문서의 Deprecated 표로 옮겨졌고(`eleven_turbo_v2`도 같다) Flash 사용을 권장 | 마케팅 **40,000자**(UI 가이드 FAQ도 40,000) | 약 250–300ms 안내. 모델 가이드의 v2.5 정규화 요금제 조건 적용 확인 | 숨김(2026-09-26판은 "필요시 고급 모델 선택"이라 적었다) |
| `eleven_flash_v2` | 영어, 저지연 | **30,000자** | v2.5와 언어·길이 같다고 취급하지 않음 | 한국어 흐름 기본 후보에서 제외 |
| `eleven_v3_conversational` | 실시간 표현, 70+ 언어, 약 280ms | 이번 조사에서 일반 convert 한도 확정 안 함 | Models는 별도 Text to Dialogue WebSocket 안내 | 후속: 일반 v3 옵션과 합치지 않음 |

지연 수치는 모델 소개값이며 네트워크·지역·목소리·요청 길이·부하를 포함한 앱 응답 SLA가 아니다. v3가 모든 공식 페이지에서 일관되게 preview/GA로 표기되어 있지는 않다. Best practices에 남아 있는 “research preview” 문구를 최신 릴리스 상태의 단독 근거로 삼지 않는다. 2026-10-04 Models 문서는 v3를 "이전 세대"로 분류한다.

v3의 안정성 표현: 2026-09-26판은 "Creative/Natural/Robust **명칭은 공식 문서로 확인**"된다고 적었다. 2026-10-04에 받은 공식 페이지(Models, v4, best practices, playground, 도움말)에서는 이 명칭을 **찾지 못했다**. v3 `stability`의 API 허용값(3단계 여부)은 **정보 없음**으로 되돌린다. 조사한 convert 스키마와 제품 가이드에서 명칭별 숫자 매핑 및 세 값만 허용한다는 제약도 확인되지 않았다. `0 / 0.5 / 1`을 UI 프리셋으로 쓰더라도 앱의 보수적 프리셋으로 표시하고 공급자 enum이라고 단정하지 않는다.

### 모델별 사용 가능 옵션 표 (2026-10-04 확인)

각 칸 출처: [Models](https://elevenlabs.io/docs/overview/models), [Eleven v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4), [Best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech). "정보 없음"은 공식 문서에서 그 모델에 대한 명시를 찾지 못했다는 뜻이다. 최종 판정은 `GET /v1/models`의 `can_use_style`·`can_use_speaker_boost`로 하는 편이 낫다.

| 옵션 | `eleven_v4` | `eleven_v4_turbo` | `eleven_v3` | `eleven_multilingual_v2` | `eleven_flash_v2_5` | `eleven_turbo_v2_5`(deprecated) |
| --- | --- | --- | --- | --- | --- | --- |
| 한국어 | 지원(90+언어 목록에 Korean) | 같은 v4 계열 목록 | 지원(70+언어 목록에 Korean) | 지원(`ko`) | 지원(`ko`) | 지원(`ko`) |
| 요청 글자 상한 | 10,000 | 정보 없음 | 5,000(Models·가격 페이지) 대 3,000(마케팅 FAQ) 충돌 | 10,000 | 40,000 | 40,000(UI 가이드 FAQ) |
| 오디오 태그(`[whispers]` 등) | 지원, v3보다 정교하다고 안내 | 지원 | 지원 | 없음(문맥·문장부호로 표현) | 없음 | 없음 |
| `stability` | 있음 | 있음(두 설정 공통) | 있음. 허용값 형태는 정보 없음 | 있음 | 있음 | 있음 |
| `similarity_boost` | 있음 | 있음 | 없음 | 있음 | v3만 제외로 명시되어 있음으로 읽힘(모델별 명시는 없음) | 같음 |
| `style` | **없음**(v4 문서: Style 없음) | 같음(효과는 정보 없음) | 정보 없음 | 있음 | 정보 없음(`can_use_style`) | 정보 없음 |
| `use_speaker_boost` | 사실상 없음(v4 문서는 Stability·Similarity 두 설정만 말한다) | 같음 | **없음** | 있음 | 정보 없음(`can_use_speaker_boost`) | 정보 없음 |
| `speed` | **없음** | 없음 | **없음** | 있음(0.7–1.2) | v3·v4만 제외로 명시(모델별 명시는 없음) | 같음 |
| SSML `<break>` | 없음 | 없음 | 없음 | 일반 안내상 가능(최대 3초) | 정보 없음(v3·v4만 불가로 명시) | 정보 없음 |
| 발음 | 텍스트 안 `"/IPA/"` 직접 표기. 사전 지원 정보 없음 | 정보 없음 | 문서에 IPA 지원 언급 | 사전 alias만(phoneme 태그 미지원) | 정보 없음. 문서상 phoneme 태그는 `eleven_flash_v2`(영어)만 | 정보 없음 |
| `language_code` | 정보 없음 | 정보 없음 | 정보 없음 | **미지원** | 지원 가능성(무시될 수 있음) | 같음 |
| `previous_text`/`next_text`/request IDs | 정보 없음(stitching 문서는 v3만 불가로 명시) | 정보 없음 | **request stitching 불가** | 가능 | 가능 | 가능 |
| `seed` | 가능(best effort) | 가능 | 가능 | 가능 | 가능 | 가능 |
| `apply_text_normalization: on` | 정보 없음 | 정보 없음 | 정보 없음 | 가능 | **Enterprise만** | Enterprise만 |
| 숫자 정규화 | 정보 없음 | 정보 없음 | 정보 없음 | 강함(권장) | 기본 약함("default normalization disabled" 문서 문구). 같은 문서의 다른 곳은 "모든 TTS 모델에서 기본 활성"이라 서로 충돌 | Flash와 같음 |
| 지연(문서 수치) | 정보 없음 | ~100ms | 정보 없음(v3 Conversational ~280ms) | 높음(Flash보다) | ~75ms | 250–300ms(마케팅) |
| 세대 | 최신 | 최신(실시간) | "이전 세대" | 이전 세대 | 저가·저지연 | deprecated(Flash로 대체 권장) |

추가 사실:

- v4의 PVC 지원은 "rolling out"이라고 적혀 있다. 라이브러리 성우는 PVC라서 v3보다 v4를 권장한다고 안내한다("PVCs are not fully optimized for Eleven v3 ... try Eleven v4").
- v4는 출시 후에도 계속 학습되어 "행동이 시간이 지나며 바뀔 수 있다"고 명시했다.
- Models 페이지는 "Eleven v4는 Text to Dialogue API로 쓸 수 있다"고 적고, v4 Turbo는 "Text to Dialogue websocket"을 적었다. 한편 UI 가이드는 `eleven_v4`를 **Create speech·Stream speech에서 model ID로 쓸 수 있다**고 명시한다. `eleven_v4_turbo`가 `POST /v1/text-to-speech/...`에서 되는지는 공식 문구가 없다(정보 없음). 모델 목록의 `can_do_text_to_speech`로 확인한다.

## 감정·연기·효과의 경계

| 기능 | 실제 API 표현 | 조건 | 배치 |
| --- | --- | --- | --- |
| 감정·톤 | `text`에 `[excited]`, `[curious]`, `[sarcastic]`, `[crying]` 등 | v3 audio tag 예시. v4·v4 Turbo도 오디오 태그를 지원한다(2026-10-04). 고정 enum이나 정확한 감정 강도 보장 아님. 태그를 지원하지 않는 모델에 넣으면 괄호를 읽는지, 한국어 대본에서 영어 태그의 효과는 정보 없음 | 표현: 태그 삽입 |
| 음성 행위 | `[whispers]`, `[laughs]`, `[sighs]`, `[exhales]` 등 | 음성과 학습 데이터에 따라 효과 다름 | 표현 |
| 속도·멈춤 | v3에서는 audio tag·구두점·문장 구조 | v3는 SSML `<break>` 미지원. v4도 SSML 없음(2026-10-04). 다른 모델은 break 가이드 확인 | 표현: 모델별 |
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
| 내 음성 검색 | `GET /v2/voices`. 쿼리·응답 전부는 "성우 목록" 절 | 기존 `voice_id` 선택 데이터 | 기본: 음성 탐색 | [List voices](https://elevenlabs.io/docs/api-reference/voices/search) |
| 공개 라이브러리·추천 후보 | `GET /v1/shared-voices`. 쿼리 18개 전부는 "성우 목록" 절(2026-09-26판은 언어·성별·연령·accent·use_cases·descriptives·featured·sort만 적었다) | 추천 결과를 convert가 자동 산출하지 않음. `trending` 정렬은 사용자 대본 적합도 평가와 다름 | 기본: 탐색; 후속: 앱 추천 로직 | [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared) |
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

## 연결 확인과 잔여 사용량 (2026-09-30 확인, T2)

- 호출: `GET /v1/user/subscription`(키 필요, 조회). 과금 여부 문구는 없다. OpenAPI에 정의된 응답은 200·422뿐이다. [OpenAPI](https://api.elevenlabs.io/openapi.json)
- 응답: `character_count`, `character_limit`(int), `next_character_count_reset_unix`(int 또는 null), `status`, `max_credit_limit_extension`(int 또는 `"unlimited"`), `current_overage`. 확장이 0이 아니면 한도를 넘어도 생성될 수 있다.
- 오류 본문은 `{"detail":{"type","code","message","status","request_id","param"}}`(2026-10-04 재확인으로 `param`을 더했다). 401 `invalid_api_key`·`missing_api_key`, 402 `insufficient_credits`, 403 `insufficient_permissions`, 429 `rate_limit_exceeded`·`concurrent_limit_exceeded`. [Errors](https://elevenlabs.io/docs/eleven-api/resources/errors.md)
- 키 권한 범위: 키를 엔드포인트별로 제한할 수 있다([Authentication](https://elevenlabs.io/docs/api-reference/authentication.md)). 이 호출에 필요한 권한 이름은 공식 문서에 없다. 비공식 자료는 `user_read`가 없으면 401과 `detail.status: "missing_permissions"`라고 한다(미실측). 그래서 상태 코드만으로는 키 오류와 권한 부족을 나눌 수 없고 `detail.code`·`detail.status`를 본다.
- 2026-10-04 추가: 설치된 SDK는 2.70.0이다(2026-09-30판은 2.69.0). 구독 응답(SDK `Subscription`)에 `tier`, `voiceSlotsUsed`, `voiceLimit`, `voiceAddEditCounter`, `maxVoiceAddEdits`가 있어 플랜 표시와 voice 작업 한도 확인에 쓸 수 있다. 위 응답 목록은 OpenAPI 필드이며 전부가 아니다.
- SDK `@elevenlabs/elevenlabs-js` 2.69.0(2026-09-30 확인. npm 최신 2.70.0, `user` 클라이언트와 재시도 코드는 같음): `user.subscription.get(requestOptions)`. 생성자 `{ apiKey, baseUrl, environment, timeoutInSeconds, maxRetries, fetch }`. 키가 없으면 `ELEVENLABS_API_KEY`로 대체하고 그래도 없으면 생성자가 예외를 던진다. 기본 `timeoutInSeconds` 240, `maxRetries` 2(408·429·5xx, `Retry-After` 반영). 오류는 `ElevenLabsError`(`statusCode`, `body`, `rawResponse`), 시간 초과는 `ElevenLabsTimeoutError`. HTTP는 주입한 `fetch` 또는 호출 시점의 전역 `fetch`.

## 성우 목록 (2026-10-04 확인, T4 설계용)

근거: 공식 문서 `.md`, 공개 [OpenAPI](https://api.elevenlabs.io/openapi.json)(2026-10-04 수집), 설치 SDK `@elevenlabs/elevenlabs-js` 2.70.0의 `.d.ts`. 실측은 "(2026-10-04 실측, 목록 조회)"로 표시한다. "정보 없음"은 공식 문서에서 명시를 찾지 못했다는 뜻이다. 용어는 `GLOSSARY.md`의 성우, 성우 카탈로그, 공개 성우 라이브러리, 공급자 분류를 따른다.

T4 구현은 목록·억양을 REST로 부른다(SDK 응답 전체 검사 때문, T4 계획).

### 쿼리 파라미터 전부

#### 내 계정 성우 목록 `GET /v2/voices` (SDK `client.voices.search(VoicesSearchRequest)`)

출처: [List voices](https://elevenlabs.io/docs/api-reference/voices/search), 공개 OpenAPI, SDK `api/resources/voices/client/requests/VoicesSearchRequest.d.ts`. 쿼리는 20개다.

| 쿼리 (SDK 이름) | 형식 | 기본값 | 가능한 값·설명 |
| --- | --- | --- | --- |
| `next_page_token` (`nextPageToken`) | string | 없음 | 이전 응답의 `next_page_token`. `has_more`와 함께 쓰는 것이 신뢰할 수 있다고 안내 |
| `page_size` (`pageSize`) | integer | **10** | **최대 100**. 0페이지는 기본(default) 성우가 포함돼 더 많이 올 수 있다 |
| `search` | string | 없음 | name, description, labels, category에서 검색 |
| `sort` | string | 없음 | `created_at_unix` 또는 `name`. 오래된 성우는 `created_at_unix`가 없을 수 있다 |
| `sort_direction` (`sortDirection`) | string | 없음 | `asc`, `desc` |
| `voice_type` (`voiceType`) | string | 없음 | `personal`, `community`, `default`, `workspace`, `non-default`(default 제외 전부), `non-community`(personal+workspace, 라이브러리 복사본 제외), `saved`(non-default + 컬렉션에 담은 default 포함) |
| `category` | string | 없음 | `premade`, `cloned`, `generated`, `professional` (응답 category에는 `famous`, `high_quality`도 있으나 필터 값으로 문서화된 것은 4개) |
| `fine_tuning_state` (`fineTuningState`) | string | 없음 | PVC 전용. `draft`, `not_verified`, `not_started`, `queued`, `fine_tuning`, `fine_tuned`, `failed`, `delayed` |
| `collection_id` (`collectionId`) | string | 없음 | 컬렉션 ID |
| `gender` | string | 없음 | 성우의 `gender` label 기준. 값 목록 없음(예시 `male`) |
| `age` | string | 없음 | `age` label 기준. 값 목록 없음(예시 `young`) |
| `language` | string 배열 | 없음 | `language` label 기준, 하나라도 맞으면 반환. 예시 `["en","es"]` |
| `accent` | string | 없음 | `accent` label 기준. 예시 `american` |
| `use_cases` (`useCases`) | string 배열 | 없음 | `use_case` label 기준, OR 매칭. 예시 `["conversational","narrative_story"]` |
| `min_notice_period_days` (`minNoticePeriodDays`) | integer | 없음 | 공유 notice period가 이 일수 이상인 성우 |
| `include_custom_rates` (`includeCustomRates`) | boolean | 포함 | 커스텀 요율(크레딧 배율) 성우 포함 여부 |
| `include_live_moderated` (`includeLiveModerated`) | boolean | 포함 | Live Moderation 성우 포함 여부 |
| `high_quality` (`highQuality`) | boolean | 없음 | true면 스튜디오 품질(`category=high_quality`)만 |
| `include_total_count` (`includeTotalCount`) | boolean | **true** | 총 개수를 계산해 돌려줌. 성능 비용이 있으니 필요할 때만 켜라고 안내. 앱은 `false`로 보내는 편이 안전 |
| `voice_ids` (`voiceIds`) | string 배열 | 없음 | ID로 조회, **최대 100개** |

이 호출에 없는 필터: `locale`, `descriptives`, `featured`, `reader_app_enabled`, `owner_id`(라이브러리 전용).

#### 공개 성우 라이브러리 `GET /v1/shared-voices` (SDK `client.voices.getShared(VoicesGetSharedRequest)`)

출처: [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared), 공개 OpenAPI, SDK `VoicesGetSharedRequest.d.ts`. 쿼리는 18개다.

| 쿼리 (SDK 이름) | 형식 | 기본값 | 가능한 값·설명 |
| --- | --- | --- | --- |
| `page_size` (`pageSize`) | integer | **30** | **최대 100** |
| `page` | integer | 0 | 0부터 시작하는 페이지 번호 |
| `category` | enum | 없음 | `professional`, `famous`, `high_quality` (3개만 허용) |
| `gender` | string | 없음 | 값 목록 없음. 문서의 응답 예시는 `Female`(대문자 시작), 필터 예시는 `male`. 대소문자 규칙은 문서에 없다. 실측 응답은 소문자였다(아래 실측) |
| `age` | string | 없음 | 값 목록 없음(예시 `young`) |
| `accent` | string | 없음 | `GET /v1/voices/accents`가 돌려주는 `accent` 값을 쓰라고 명시 |
| `language` | string(**단일**) | 없음 | 문서 예시는 `en`뿐이다. **`ko`가 동작한다**(2026-10-04 실측, 목록 조회). 2026-09-26판 이후 증거는 "한국어 값(`ko`)은 문서에 예시가 없다"였다 |
| `locale` | string | 없음 | 예시 `en-US`. `ko-KR`을 쿼리로 보내 거르는 동작은 확인하지 않았다(`language=ko` 응답의 `locale`은 전부 `ko-KR`) |
| `search` | string | 없음 | 검색어(예시 `tiktok`) |
| `use_cases` (`useCases`) | string 배열 | 없음 | 예시 `audiobook`. 응답 `use_case` 예시 `characters_animation` |
| `descriptives` | string 배열 | 없음 | 설명문이 "Search term used for filtering"으로 복사돼 있어 자유 검색어 성격(예시 `tiktok`). 응답 `descriptive` 예시 `calm` |
| `featured` | boolean | false | 추천 성우만. false가 "필터 없음"인지 문서에 없음 -> 필터를 쓰지 않을 때는 보내지 않는 쪽이 안전 |
| `min_notice_period_days` | integer | 없음 | notice period 최소 일수 |
| `include_custom_rates` | boolean | 없음 | 커스텀 요율 포함/제외 |
| `include_live_moderated` | boolean | 없음 | Live Moderation 포함/제외 |
| `reader_app_enabled` | boolean | false | Reader 앱 사용 가능 성우 |
| `owner_id` (`ownerId`) | string | 없음 | 공개 소유자(`public_owner_id`) |
| `sort` | enum | `created_date` | `created_date`, `usage_character_count_1y`, `trending`, `cloned_by_count`. 정렬 방향 파라미터는 없다 |

**각 필터의 가능한 값 목록**: 공식 스키마에 `gender`·`age`·`accent`·`language`·`locale`·`use_cases`·`descriptives` enum이 없다(자유 문자열). 공식 문서로 확인된 것은 예시값뿐이다: `male`/`Female`, `young`, `american`, `en`, `en-US`, `audiobook`, `conversational`, `narrative_story`, `characters_animation`, `calm`. UI 가이드의 표시 이름은 성별 Male/Female/Neutral, 나이 Young/Middle Aged/Old, 용도 Conversational/Narration/Characters/Social Media/Educational/Advertisement/Entertainment인데 API 문자열과 같다는 보장은 없다. 한국어 결과의 실제 값은 아래 실측 절에 있다. 앱은 응답의 실제 값을 모아서 보여 주고 값을 추정하지 않는 편이 맞다(`GLOSSARY.md`의 "미제공 정보는 추정하지 않는다"와 같은 방향).

#### 보조 조회 호출

| 호출 | SDK | 용도 | 출처 |
| --- | --- | --- | --- |
| `GET /v1/voices/accents?language=&model_id=` | `client.voices.accents.get({ language, modelId })` | 라이브러리 `accent` 필터의 유효값 목록. 응답 `{accent, language, code, name}`. 2026-10-04에 새로 확인한 호출. `language=ko` 실측은 아래 | [Accents](https://elevenlabs.io/docs/api-reference/voices/accents/get) |
| `GET /v1/models` | `client.models.list()` | 모델별 `can_do_text_to_speech`, `can_use_style`, `can_use_speaker_boost`, `maximum_text_length_per_request`, `languages`, `model_rates.character_cost_multiplier`, `token_cost_factor`. 모델 목록·한도를 코드에 박지 않고 읽을 수 있다 | 공개 OpenAPI `ModelResponseModel`, SDK `api/types/Model.d.ts` |
| `GET /v1/voices` | `client.voices.getAll({ showLegacy })` | 필터 없는 전체 목록(legacy). 신규에는 `/v2/voices`를 쓴다 | SDK `VoicesGetAllRequest.d.ts` |
| `GET /v1/voices/{voice_id}` | `client.voices.get(id)` | 성우 1명 메타데이터(`with_settings`는 deprecated, 무시됨) | SDK `VoicesGetRequest.d.ts` |

### 응답 필드

#### 내 계정 `GET /v2/voices` (SDK `GetVoicesV2Response` / `Voice`)

루트: `voices[]`, `has_more`, `total_count`(필수), `next_page_token`(없으면 null).

| 필드 | 형식 | 의미·주의 |
| --- | --- | --- |
| `voice_id` | string | 합성 경로의 `{voice_id}` |
| `name`, `description` | string | |
| `category` | enum | `premade`, `cloned`, `generated`, `professional`, `famous`, `high_quality` |
| `labels` | map<string,string> | 문서 예시 키는 `accent`, `gender`. 필터 설명에서 `age`, `language`, `use_case` label이 확인됨. 공식 전체 키 목록은 정보 없음. 실측에서 관찰된 키 6종은 아래. 예시 값은 소문자(`female`) |
| `preview_url` | string 또는 null | 기본 샘플 |
| `verified_languages[]` | `{language, model_id, accent, locale, preview_url}` | 검증된 언어별 모델·억양·샘플. 한국어 성우 판별의 1순위 |
| `high_quality_base_model_ids` | string[] | 기본 모델 ID들. **라이브러리 목록에는 없다** |
| `available_for_tiers` | string[] | |
| `settings` | `{stability, use_speaker_boost, similarity_boost, style, speed}` | 이 성우의 저장된 음성 설정(스키마 기본 0.5 / true / 0.75 / 0 / 1) |
| `sharing` | object | `status`(`enabled`, `disabled`, `copied`, `copied_disabled`), `public_owner_id`, `original_voice_id`, `free_users_allowed`, `cloned_by_count`, `liked_by_count`, `rate`, `fiat_rate`, `notice_period`, `disable_at_unix`, `live_moderation_enabled`, `featured`, `category`, `labels` 등 |
| `is_owner`, `is_legacy`, `is_mixed`, `is_bookmarked` | boolean | `is_bookmarked`는 "community(library-copied) 성우에만 의미" |
| `created_at_unix` | integer | |
| `recording_quality`, `recording_quality_reason`, `labelling_status` | enum/string | `studio`/`good`/`ok`/`poor`/`bad`, `in_review`/`review_complete` |
| `fine_tuning`, `voice_verification`, `samples`, `collection_ids`, `safety_control`, `permission_on_resource`, `favorited_at_unix` | | PVC·샘플·권한 정보 |

#### 공개 라이브러리 `GET /v1/shared-voices` (SDK `GetLibraryVoicesResponse` / `LibraryVoiceResponse`)

루트: `voices[]`, `has_more`, `total_count`(선택), `last_sort_id`(선택). 2026-10-04 실측에서 `last_sort_id`는 없거나 null이었다(`has_more`는 true).

| 필드 | 필수 | 의미·주의 |
| --- | --- | --- |
| `voice_id`, `public_owner_id` | 예 | 추가 호출에는 두 값이 모두 필요 |
| `name` | 예 | |
| `category` | 예 | `generated`, `cloned`, `premade`, `professional`, `famous`, `high_quality` |
| `gender`, `age`, `accent`, `descriptive`, `use_case` | 예 | **label이 평평한 필드로 온다**(`labels` 맵 없음. 실측에서도 같다) |
| `language`, `locale` | 아니오 | 성우가 학습된 주 언어 |
| `verified_languages[]` | 아니오 | 언어별 `{language, model_id, accent, locale, preview_url}` |
| `preview_url` | 아니오 | 기본 샘플 |
| `free_users_allowed` | 예 | Free 사용자 허용 여부 |
| `cloned_by_count` | 예 | 복제된 횟수 |
| `usage_character_count_1y`, `usage_character_count_7d`, `play_api_usage_character_count_1y` | 예 | 사용량 |
| `rate`, `fiat_rate` | 아니오 | 크레딧 배율, 1000크레딧당 USD(기본이면 null) |
| `live_moderation_enabled`, `featured` | 예 | Live Moderation은 지연이 늘 수 있음(UI 가이드) |
| `notice_period` | 아니오 | 일수. 최소 30일~최대 2년(UI 가이드) |
| `date_unix`, `description`, `image_url`, SNS username 4종 | 일부 | |
| `is_added_by_user`, `is_bookmarked` | 아니오 | **내 계정에 이미 추가했는지**. 추가 여부 판별에 쓴다 |

(2026-10-04 실측, 목록 조회) 첫 항목의 키 32개가 위 표와 일치한다.

### 한국어 성우를 찾는 방법

| 방법 | 근거 | 한계 |
| --- | --- | --- |
| 라이브러리 `language=ko` | 필터가 존재한다. **(2026-10-04 실측, 목록 조회) 동작 확인**: 총 5,953명, 반환된 100명 모두 응답 `language=ko`·`locale=ko-KR`. 이전 증거는 "`ko`·`ko-KR`로 실제 걸러지는지는 미확인(정보 없음)"이었다 | `locale=ko-KR`을 쿼리로 보낸 동작은 확인하지 않았다. 분포는 첫 100명 기준이다 |
| 응답 `verified_languages[].language === "ko"` 확인, 해당 `model_id`·`preview_url` 사용 | 필드 존재. (2026-10-04 실측, 목록 조회) 라이브러리 `language=ko` 100명 모두 `ko` 항목과 그 `preview_url`이 있다 | 언어별 샘플이 여러 개일 수 있음("If a voice has multiple previews for different languages", UI 가이드) |
| `GET /v1/voices/accents?language=ko` | (2026-10-04 실측, 목록 조회) 6종: `chungcheong`, `gyeongsang`, `hamgyong`, `jeolla`, `seoul`, `standard` | 같은 `language=ko` 라이브러리 첫 100명의 `accent`는 `standard`·`seoul`·`gyeongsang`·`jeolla` 4종만 나왔다. 억양 목록과 응답 값이 같은 집합은 아니다 |
| 내 계정은 `language=["ko"]` | label 기준 필터. (2026-10-04 실측, 목록 조회) 계정 성우 31명 중 label `language`=`ko`가 4명, `verified_languages`에 `ko`가 있는 성우도 4명 | 사용자가 label을 달지 않은 성우는 안 잡힌다. 두 4명이 같은 사람인지는 교차 집계하지 않았다 |
| 기본(premade)·generated 성우 | 문서: "All pre-made voices and generated voices are English" | 한국어 억양이 어색할 수 있음. 라이브러리 `professional` 카테고리가 "학습 언어 태그가 있어 그 언어의 원어민"이라고 안내됨 |
| v4로 합성 | 문서: v4는 다른 언어를 말할 때 원래 억양을 가져오지 않고 대상 언어로 자연스럽게 발음("every voice usable across every supported language") | 껐다 켤 수 없음, "일부 언어는 더 유창함"이라고 함. 효과는 직접 들어 봐야 한다 |

### 구분 필드, 추가(add), 플랜 제한

| 구분 | 어디서 | 판별 필드 |
| --- | --- | --- |
| 기본(premade/Default) 성우 | `/v2/voices` | `category=premade` 또는 `voice_type=default`. `is_legacy`로 legacy 표시. **2026-03 이후 만든 계정에는 없다** |
| 내 클론(IVC) | `/v2/voices` | `category=cloned`, `voice_type=personal`, `is_owner=true` |
| 내 클론(PVC) | `/v2/voices` | `category=professional`, `fine_tuning`·`voice_verification` 채워짐 |
| Voice Design 생성 | `/v2/voices` | `category=generated` |
| 라이브러리에서 계정에 추가한 복사본 | `/v2/voices` | `voice_type=community`로 필터(문서: non-community는 "library copies 제외"). `sharing.original_voice_id`·`sharing.public_owner_id`·`sharing.status`(`copied` 값이 이 경우인지 정의 문구는 없음), `is_bookmarked` |
| 공개 라이브러리 항목(미추가 포함) | `/v1/shared-voices` | 엔드포인트 자체. `category`는 professional/famous/high_quality 중심. 추가 여부는 `is_added_by_user` |

**공개 라이브러리 성우를 "추가"(add shared voice)**

출처: [Add shared voice](https://elevenlabs.io/docs/api-reference/voices/voice-library/share), SDK `client.voices.share(publicUserId, voiceId, { newName, bookmarked })`.

| 항목 | 내용 |
| --- | --- |
| 호출 | `POST /v1/voices/add/{public_user_id}/{voice_id}`, body `new_name`(필수), `bookmarked`(기본 true), 응답 `{voice_id}` |
| 계정 상태 변경 | 예. 문서 설명이 "Add a shared voice to your collection of Voices". 응답 `voice_id`가 원본 `voice_id`와 같은지는 정보 없음 |
| 과금 | 문서에 과금·플랜 제한 문구 없음(정보 없음). 크레딧을 쓴다는 표기는 없음 |
| 커스텀 성우 슬롯 | **사용하지 않음**("Voices saved from the Voice Library do not take up your custom voice slots") |
| 월별 voice 작업 한도 | "voice add/edit" 작업이 플랜별 월 한도를 가진다(Free 55 / Starter 65 / Creator 95 / Pro 290 / Scale 1040 / Business 1040). 라이브러리 추가가 이 한도에 세어지는지는 정보 없음. 구독 응답에 `voiceAddEditCounter`, `maxVoiceAddEdits`가 있어 현재값은 읽을 수 있다 |
| 되돌림 | `DELETE /v1/voices/{voice_id}`(SDK `voices.delete`). 단, 라이브러리에서 내려간 성우를 내 계정에서 지우면 "다시 저장할 수 없다"고 명시 |
| 라이브러리에서 내려간 뒤 | 성우 주인이 공유를 끄면 라이브러리에서 사라진다. 이전에 쓴 사용자는 notice period 동안 계속 쓸 수 있고 `disable_at_unix`로 종료 시점을 알 수 있다 |

출처(add): [Edit/add 한도](https://elevenlabs.io/docs/help-center/account/general/is-there-a-limit-on-how-many-times-i-can-edit-add-voices).

**플랜별 제한**

| 제한 | 값 | 출처 |
| --- | --- | --- |
| 라이브러리 성우 API 사용 | **Free 불가**. 유료는 가능하나 성우마다 `free_users_allowed`·크레딧 배율이 다름. 어느 유료 플랜부터인지 최저 플랜 명시는 없음 | [TTS 개요](https://elevenlabs.io/docs/overview/capabilities/text-to-speech), [Voices 개요](https://elevenlabs.io/docs/overview/capabilities/voices), [Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library) |
| 커스텀 성우 슬롯 | Free 3 / Starter 10 / Creator 30 / Pro 160 / Scale 660 / Business 660. Default·Legacy와 라이브러리 저장본은 제외 | [슬롯 안내](https://elevenlabs.io/docs/help-center/account/general/how-many-voice-slots-do-i-get-per-tier-and-how-can-i-increase-it) |
| Default 성우 | 2026-03 이전 계정만. **2026-12-31 종료**. Legacy ID는 대체 성우로 자동 라우팅(소리가 달라질 수 있음) | [Default voices](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices) |
| 크레딧 배율 성우 | 일부 라이브러리 성우에 커스텀 요율. 신규 공유에는 더 이상 없는 legacy 기능. 배율은 성우 주인 요율과 사용자 플랜에 따라 달라짐. 정확한 계산식은 정보 없음 | [Custom rates](https://elevenlabs.io/docs/help-center/product/voices/voice-library/what-are-custom-rates-and-credit-multipliers) |
| 라이브러리 규모 | "over 10,000"(voices 개요), "3,000+"(TTS 개요), "11,000+"(마케팅). 문서끼리 불일치. (2026-10-04 실측, 목록 조회) `language=ko`만 5,953명 | 각 페이지 |

### 과금 여부, 요청 제한, 페이지 크기

| 항목 | 내용 |
| --- | --- |
| 목록 조회 과금 | `GET /v2/voices`, `GET /v1/shared-voices`, `GET /v1/models`, accents: 과금·크레딧 문구가 문서에 **없음(정보 없음)**. 문서가 크레딧 사용을 명시한 것은 생성류(합성, Voice Design 미리듣기 등)뿐이다 |
| 요청 제한 | 목록 조회의 분당 요청 수 제한: 정보 없음. 공식은 동시성(concurrency)만 문서화한다. TTS 동시 요청 수: Free 2 / Starter 3 / Creator 5 / Pro 10 / Scale·Business 15 (Flash·Turbo 모델은 각각 4/6/10/20/30). 초과 시 429 `concurrent_limit_exceeded`, 빈도 초과는 429 `rate_limit_exceeded`. 응답 헤더 `current-concurrent-requests`, `maximum-concurrent-requests`로 확인 |
| 페이지 크기 상한 | 두 목록 모두 **100**. 오류 코드 `invalid_page_size`(범위 밖), `invalid_cursor`(토큰 만료·오류) |
| 페이지 방식 | 내 계정은 `next_page_token` + `has_more`, 라이브러리는 `page`(0부터) + `has_more`(+ `last_sort_id`) |
| 권한 | 키에 제한을 걸면 성우 조회에 "Voices (read)", 합성에 "Text to Speech" 권한이 필요하다고 안내(help center). `GET /v1/models`·구독 조회에 필요한 권한 이름은 정보 없음 |

출처: [TTS 요청 수 안내](https://elevenlabs.io/docs/help-center/technical/how-many-text-to-speech-requests-can-i-make-and-can-i-increase-it), [Models: concurrency](https://elevenlabs.io/docs/overview/models#concurrency-and-priority), [Errors](https://elevenlabs.io/docs/eleven-api/resources/errors), [서드파티 접근 안내](https://elevenlabs.io/docs/help-center/product/voices/my-voices/why-cant-i-access-my-voices-via-third-party-services).

### 실측 (2026-10-04, 목록 조회)

키와 전체 응답은 저장하지 않고 통계만 남겼다. 합성·추가·삭제 호출은 하지 않았다.

#### 공개 라이브러리 `GET /v1/shared-voices?page_size=100&language=ko`

HTTP 200, 0.7초(717ms), 100명 응답 본문이 934,774자(JS 문자열 길이, 약 0.9MB). `total_count` 5,953, `has_more` true, `last_sort_id` 없음 또는 null. **아래 분포는 기본 정렬(`created_date`)의 첫 페이지 100명 기준이며 전체 5,953명의 분포가 아니다.** 첫 페이지의 `date_unix`는 2026-08-04~2026-10-03이다(최근 두 달 등록분이라 정렬 방향은 최신순으로 보이나 문서에 방향 설명은 없다, 추정).

| 필드 | 값 분포 (명) |
| --- | --- |
| `language` / `locale` | `ko` 100 / `ko-KR` 100 |
| `gender` | `male` 62, `female` 38 (소문자) |
| `age` | `young` 57, `middle_aged` 40, `old` 2, `middle-aged` 1 (한 건만 하이픈 표기) |
| `accent` | `standard` 49, `seoul` 42, `gyeongsang` 8, `jeolla` 1 |
| `use_case` | `narrative_story` 49, `informative_educational` 17, `conversational` 13, `social_media` 10, `characters_animation` 5, `entertainment_tv` 5, `advertisement` 1 (7종) |
| `descriptive` | `calm` 36, `casual` 13, `confident` 9, `crisp` 9, `gentle` 7, `classy` 6, `deep` 5, `neutral` 2, `relaxed` 2, `cute` 2, `serious` 1, `upbeat` 1, `formal` 1, `chill` 1, `soft` 1, `professional` 1, `pleasant` 1, `mature` 1, 빈 문자열 1 (19종, 빈 문자열 포함) |
| `category` | `professional` 96, `high_quality` 4 |
| `free_users_allowed` | `false` 73, `true` 27 |
| `live_moderation_enabled` | `false` 74, `true` 26 |
| `featured` | `false` 100 |
| `rate` | 100명 모두 `1`, `fiat_rate`는 모두 null(2026-10-04 다음 조회에서 값 확인) |
| `is_added_by_user` | `false` 98, `true` 2 |
| `notice_period` (일) | 730 95, 30 3, 180 1, null 1 |
| `verified_languages` | `ko` 항목이 있고 그 `preview_url`도 있음 100 |
| `image_url` | 없음 100 |
| `description` 최대 길이 | 765자 |

#### 내 계정 `GET /v2/voices?page_size=100&include_total_count=true`

HTTP 200, 0.3초(283ms). `total_count` 31, 31명, `has_more` false(한 번에 전부).

| 필드 | 값 분포 (명) |
| --- | --- |
| `category` | `premade` 21, `professional` 9, `cloned` 1 |
| `is_owner` | `false` 30, `true` 1 |
| `sharing.status` | `copied` 9, 필드 없음 22. `copied` 9와 `professional` 9의 수가 같아 라이브러리에서 추가한 복사본으로 보이나 교차 집계하지 않았다(추정) |
| `labels` 키 | `accent` 31, `age` 31, `gender` 31, `language` 31, `use_case` 30, `descriptive` 28 (6종. 공식 전체 키 목록은 여전히 정보 없음) |
| label `gender` | `female` 17, `male` 13, `neutral` 1 |
| label `age` | `young` 16, `middle_aged` 14, `old` 1 |
| label `language` | `en` 25, `ko` 4, `uk` 1, `ru` 1 |
| `verified_languages`에 `ko` | 4 |

#### 한국어 억양 `GET /v1/voices/accents?language=ko`

HTTP 200, 0.2초(213ms). 6종, 항목 형식 `{accent, language: "ko", code: "ko-<accent>", name}`: `chungcheong`, `gyeongsang`, `hamgyong`, `jeolla`, `seoul`, `standard`.

#### 기본 샘플 주소

두 종류다(`preview_url`의 호스트 기준).

| 주소 | 공개 라이브러리 `language=ko` 100명 | 내 계정 31명 |
| --- | --- | --- |
| `storage.googleapis.com` 고정 주소(쿼리 없음) | 74 | 25 |
| `api.us.elevenlabs.io/v1/voices/<id>/previews/audio?payload=<토큰>` (쿼리 키는 `payload` 하나, 길이 192·212자. 계정 목록과 라이브러리 목록에서 각각 확인) | 26 | 6 |

쿼리 토큰 주소의 만료 여부는 **정보 없음**이다.

## 내 문장 듣기 (시험 생성) (2026-10-04 확인, T4·T5 설계용)

유료 호출을 실제로 하지 않았다. 아래는 공식 문서·OpenAPI·SDK `.d.ts`에서 확인한 계약이다. 용어의 "시험 생성"과 "기본 샘플"을 구분한다.

### 합성 엔드포인트

출처: [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Stream speech](https://elevenlabs.io/docs/api-reference/text-to-speech/stream), 공개 OpenAPI, SDK `BodyTextToSpeechFull.d.ts`·`StreamTextToSpeechRequest.d.ts`.

| 엔드포인트 | SDK | 반환 |
| --- | --- | --- |
| `POST /v1/text-to-speech/{voice_id}` | `client.textToSpeech.convert(voiceId, body, opts)` | `ReadableStream<Uint8Array>`(바이너리 오디오) |
| `POST /v1/text-to-speech/{voice_id}/stream` | `textToSpeech.stream(...)` | 스트림. 본문 필드는 convert와 같다 |
| `.../with-timestamps`, `.../stream/with-timestamps` | `convertWithTimestamps`, `streamWithTimestamps` | 글자별 타이밍 JSON |

요청 필드(본문 13개, query 3개, path 1개)는 앞의 "전체 요청 필드" 절이 정본이며 2026-10-04에도 개수가 같다. SDK 이름은 `outputFormat`, `enableLogging`, `modelId`, `languageCode`, `voiceSettings`처럼 camelCase다. 2026-10-04 재확인에서 바뀐 필드 사실은 `apply_text_normalization: on`이 v2.5 계열에서 Enterprise만이라는 점과 모델별 지원이 달라진 점(위 "모델별 사용 가능 옵션 표")이다.

### 입력 길이, 응답, 오류

| 항목 | 내용 |
| --- | --- |
| 길이 초과 | 400 `text_too_long`. 모델별 상한은 `GET /v1/models`의 `maximum_text_length_per_request`("Longer requests are rejected")로 읽을 수 있다. 약 1,000자당 1분 분량([Models](https://elevenlabs.io/docs/overview/models) 표) |
| 응답 | 200 + 바이너리 오디오(공개 OpenAPI는 `audio/mpeg`만 기재). 422는 검증 오류(`detail[]`) |
| 응답 헤더 | `request-id`, `character-cost`, `x-trace-id`, `current-concurrent-requests`, `maximum-concurrent-requests`. SDK는 `.withRawResponse()`로 `rawResponse.headers`를 읽는다 |
| 오류 본문 | `{"detail":{"type","code","message","status","request_id","param"}}`(2026-09-30판은 `param` 없이 5개 키를 적었다). 주요 코드: `voice_not_found`(404), `voice_access_denied`(403), `model_access_denied`(403), `unsupported_model`(400), `invalid_output_format`(400), `invalid_voice_settings`(400), `text_too_long`(400), `feature_not_available`·`subscription_required`(403), `insufficient_credits`(402), `rate_limit_exceeded`·`concurrent_limit_exceeded`(429), `system_busy`(429) |

출처: [Errors](https://elevenlabs.io/docs/eleven-api/resources/errors), [API introduction](https://elevenlabs.io/docs/api-reference/introduction).

### 과금, 무료 경로, 자동 재시도

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 단위 | 글자당 과금. 응답 `character-cost` 헤더로 실제 소모를 읽을 수 있다 | [가격 페이지 FAQ](https://elevenlabs.io/pricing/api), [API introduction](https://elevenlabs.io/docs/api-reference/introduction) |
| UI 크레딧 | UI 생성은 모든 모델이 "1글자 = 1크레딧(크레딧 배율 제외)". API 생성은 할인되며 "API pricing 참고"라고만 적혀 있다 | [모델 안내](https://elevenlabs.io/docs/help-center/technical/what-models-do-you-offer-and-what-is-the-difference-between-them) |
| API 요금(1,000자) | v4 **$0.022**(72% 할인, 2026-10-12까지, 할인 전 $0.08 표기), v4 Turbo $0.011(같은 할인, 정가 $0.04), v3 $0.08, v3 Conversational $0.04, Multilingual v2 $0.08, Flash/Turbo $0.04. 가격 페이지 FAQ는 "API 사용은 크레딧이 아니라 달러로 청구"라고 적는다 | [API 요금](https://elevenlabs.io/pricing/api) |
| 모델별 크레딧 배율 | "Flash/Turbo 0.5" 같은 **배율 표는 문서에 없다**(정보 없음). 달러 단가가 Multilingual v2의 절반이라는 사실만 확인된다. 계정이 읽는 `character_count`와 달러 환산의 관계, 구독 플랜 크레딧에서 v4가 며칠 후 정가로 바뀌는 영향은 정보 없음. 실제 값은 `GET /v1/models`의 `model_rates.character_cost_multiplier`·`token_cost_factor`로 읽을 수 있다(값은 미확인) | SDK `ModelRatesResponseModel` |
| 정규 가격 변동 | v4 할인은 2026-10-12 종료 예정. 예상 비용 표시는 할인 종료 후 바뀔 수 있다 | [API 요금](https://elevenlabs.io/pricing/api) |
| **사용자 텍스트로 무료 미리듣기** | **없음**. 공식: "There's no way to test or preview a voice using your own text without using credits." 무료 재생성(최대 2회)은 **웹 전용이며 API에는 없다**("not available via the API") | [제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) |
| Voice Design 미리듣기와 구분 | `POST /v1/text-to-voice/design`은 설명문으로 새 성우를 만드는 **다른 기능**이다. 기존 성우를 내 대본으로 듣는 용도가 아니고, 미리듣기 글자 수만큼 크레딧을 쓴다("only charge ... credits to generate your preview text", 3개 샘플에 1회 과금). `eleven_multilingual_ttv_v2`/`eleven_ttv_v3` 모델과 별도 필드 | [Voice Design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design) |
| 자동 재시도 | SDK 기본 `maxRetries` **2**. 대상 408·429·5xx, 백오프 1초 시작·최대 60초, `Retry-After` 반영. 기본 `timeoutInSeconds` 240. 끄기: 클라이언트 `new ElevenLabsClient({ maxRetries: 0 })` 또는 호출마다 `{ maxRetries: 0 }`. 5xx·타임아웃 실패가 과금되는지는 정보 없음 | SDK `core/fetcher/requestWithRetries.js`, `BaseClient.d.ts` |

### 라이브러리 성우를 추가 없이 바로 합성할 수 있는가

| 근거 | 내용 | 신뢰 |
| --- | --- | --- |
| UI 가이드 | "You can use voices from the Voice Library directly without saving them to My Voices." 사용하면 notice period가 계정에 저장됨 | 공식, **UI 설명** |
| API 일반 문구 | "Voice Library voices are not available via the API to free tier users." | 공식, 3개 페이지 |
| 마케팅 FAQ | "Reference any voice in your library by voice ID" ("your library"가 My Voices인지 라이브러리 전체인지 불명) | 공식, 모호 |
| API 레퍼런스 | 추가 없이 `voice_id`로 합성되는지, 안 되면 어떤 오류인지 문서에 **없다**. `voice_not_found`는 "ID가 존재하지 않음", `voice_access_denied`는 "접근 권한 없음"으로만 정의 | 공식, **공백** |
| 비공식 사례 | 서드파티 포럼 일부가 "내 계정에 추가해야 한다"고 적는다 | 비공식, 미검증 |

**결론: 정보 없음.** UI는 추가 없이 가능, API는 공식 확인 불가. 실제 동작은 사용자가 승인한 유료 호출 1회로만 확인할 수 있다. 앱 설계는 "먼저 `voice_id`로 합성 시도 -> `voice_not_found`/`voice_access_denied`면 '내 계정에 추가 필요' 안내 -> 사용자 확인 후 add 호출"처럼 add를 **별도의 상태 변경 단계**로 분리하는 편이 안전하다(제안. 프로젝트 규칙의 "공급자 상태를 바꾸는 호출은 사용자 승인").

### 시험 생성 설정 분류 (제안)

분류는 이 앱을 위한 **제안**이며 공급자 API의 구분이 아니다.

| 구분 | 설정 | 값·조건 |
| --- | --- | --- |
| UI | 대본(`text`) | 글자 수와 모델 상한을 보이고 상한 초과 시 전송을 막는다. 시험 생성이라 짧은 대본(200자 안팎) 기본값을 권장 |
| UI | 모델(`model_id`) | `GET /v1/models` 중 `can_do_text_to_speech`. 후보 `eleven_v4`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_v3`. deprecated(turbo)는 숨김. v4 Turbo는 convert 지원 확인 전까지 숨김 |
| UI | 감정(오디오 태그) | v4·v4 Turbo·v3만. `[whispers]`, `[laughs]`, `[sighs]`, `[excited]`, `[curious]`, `[sarcastic]`, `[crying]` 등 공식 예시를 삽입하는 도구. 태그 미지원 모델에서는 UI를 숨긴다 |
| UI | 안정성(`stability`) | 모두. 0–1 슬라이더. v3는 슬라이더 숨김 또는 보수적으로(허용값 정보 없음) |
| UI(고급) | 유사도(`similarity_boost`), 속도(`speed`) | 유사도는 v3 제외. 속도는 Multilingual v2·Flash만, v3·v4 제외. 범위는 문서 기준 0.7–1.2 |
| UI(선택) | 성우(`voice_id`) | 라이브러리 성우는 미추가 시 실패할 수 있음(위 절) |
| 서버 자동 | 언어 | 문서: 언어는 대본 텍스트로 정해지고 억양은 성우가 정한다. 한국어 대본이면 `language_code: "ko"`를 붙이되 `eleven_multilingual_v2`에는 붙이지 않는다(미지원이라 오류 가능성) |
| 서버 자동 | 출력 형식 | `mp3_44100_128`(기본, 모든 플랜). 청취용이므로 고정 |
| 서버 자동 | `xi-api-key`, `maxRetries: 0`, `character-cost`·`request-id`·`x-trace-id` 수집, `seed`(선택) | 키는 브라우저 노출 금지. 재시도는 429 `concurrent_limit_exceeded`도 하지 않는다. `seed`는 같은 대본을 여러 성우로 비교할 때 무작위성을 줄이는 용도이며 결정성은 보장되지 않는다 |
| 쓰지 않음 | `style`, `use_speaker_boost`, `previous_text`·`next_text`·`*_request_ids`, `pronunciation_dictionary_locators`, `apply_text_normalization`·`apply_language_text_normalization`, `enable_logging`, `optimize_streaming_latency`, `use_pvc_as_ivc`, `/stream`, with-timestamps | 시험 생성에 불필요하거나 v3·v4 미지원이거나 Enterprise·일본어 전용·deprecated. 전체를 받아 저장·재생하는 흐름이면 `convert`로 충분 |

### 주의점 (구현 인계)

1. **항상 유료다.** 한 번 들을 때마다 글자 수만큼 크레딧을 쓴다. 호출 전에 글자 수 기반 예상 사용량을 보이고 사용자가 누를 때만 호출한다. 자동 재생성·자동 재시도·자동 일괄 청취는 만들지 않는다.
2. **재시도 끄기가 필수다.** SDK 기본 2회 재시도가 429·5xx에서 같은 유료 호출을 반복할 수 있다. 실패한 유료 호출의 과금 여부는 문서에 없다.
3. **동시성.** TTS 동시 요청은 플랜별로 2–15개(Flash·Turbo는 더 많음). 청취 호출은 한 번에 하나씩 직렬로 처리한다. 플랜은 구독 조회 응답의 `tier`에서 읽을 수 있다.
4. **기본 샘플과 내 대본 청취는 다르다.** `preview_url`은 무료이고 언어가 맞지 않을 수 있다(대개 영어 샘플). 라이브러리 성우는 `verified_languages[].preview_url`에 언어별 샘플이 있을 수 있다. 이 차이가 "내 대본으로 듣기"가 필요한 이유다.
5. **라이브러리 성우.** Free 플랜은 API 사용 불가. `free_users_allowed=false` 성우, `rate`(크레딧 배율)가 1이 아닌 성우, `live_moderation_enabled` 성우(지연 증가)는 알린다. 한국어 첫 100명의 `rate`는 모두 1이었다(실측). 직접 합성이 되는지는 미확인이므로 add 단계를 분리한다.
6. **기본(premade) 성우는 믿지 않는다.** 2026-03 이후 계정에는 없고 2026-12-31에 사라진다. 전부 영어라 한국어 억양이 어색할 수 있다. premade가 0개인 계정을 정상으로 처리한다.
7. **v4 효과.** 문서상 v4는 다른 언어도 억양 없이 자연스럽게 읽는다. 영어 성우로 한국어 대본을 듣는 비교가 의미 있을 수 있다. 다만 "일부 언어가 더 유창함", "모델이 계속 바뀜"이라 했으니 모델 ID·성우·설정·시드·`request-id`를 청취 기록과 같이 남긴다.
8. **v4 할인 종료.** 2026-10-12에 v4 가격 표시가 바뀐다. 예상 비용 상수를 코드에 박지 않고 모델 정보나 설정으로 둔다.
9. **오류 안내.** `voice_not_found`, `voice_access_denied`, `model_access_denied`, `text_too_long`, `invalid_voice_settings`, `insufficient_credits`(402), 429 두 종류를 화면 문구로 나눈다. 본문은 `detail.code`를 본다.
10. **키 권한.** 키를 제한했다면 "Voices (read)"와 "Text to Speech"가 필요하다. 권한이 없을 때 오류 코드는 확인하지 못했다.
11. **자동 테스트 금지.** 합성·add·삭제는 유료 또는 상태 변경 호출이므로 자동 테스트·브라우저 QA에서 부르지 않는다. 목록 조회도 과금 문구가 없을 뿐 무료라고 확정된 것은 아니다.

## 문서 충돌과 미확정 사항

| 항목 | 충돌·불완전한 증거 | 현재 판단·구현 인계 |
| --- | --- | --- |
| v3 길이 | [마케팅](https://elevenlabs.io/text-to-speech-api) 3,000 vs [Models](https://elevenlabs.io/docs/overview/models#character-limits)·[제품](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) 5,000. 2026-10-04 재확인에서도 충돌이 지속된다(Models·가격 페이지·UI 가이드 5,000, 마케팅 FAQ 3,000) | 모델/제품 문서를 우선할 근거가 있으나 실제 호출 검증 없음. 마케팅 수치를 그대로 전 모델 validator로 사용하지 않음. 상한은 `GET /v1/models`의 `maximum_text_length_per_request`로 읽을 수 있다 |
| speed 범위 | 제품·Studio·best practices 0.7–1.2 vs 공식 upstream skill REST 0.25–4.0. convert OpenAPI에는 min/max 없음 | UI는 보수적 0.7–1.2 제안. API의 절대 허용 한도라고 설명 금지. 확대는 지원 확인 후 |
| v3 voice_settings | 제품 가이드 speed/similarity/speaker boost 미지원 vs 공식 skill 예제는 v3에 similarity/style/boost까지 전달. v4는 Stability·Similarity만(2026-10-04) | 공통 스키마 수용과 실제 모델 효과는 다름. v3 기본 노출은 안정성·태그 중심. 나머지는 지원미확인 |
| style 범위 | convert OpenAPI min/max 없음; upstream skill 0–1 | UI 0–1은 보수적 범위. 공급자 스키마 검증값으로 단정 금지 |
| `use_pvc_as_ivc` | 렌더링 API 문서는 deprecated, live OpenAPI는 비deprecated이며 설명도 변경 | 신규 기본 UI에서 제외. 필요시 고급 호환성 처리 후 재확인 |
| 정규화 권한 | convert는 `auto/on/off`만 설명; 모델 가이드는 v2.5 `on` Enterprise 조건 | 모델·계정 조건 안내. 단순 enum만 보고 모든 계정에서 `on` 보장 금지 |
| 인증 | OpenAPI `xi-api-key` optional vs 인증 가이드 요청마다 필요 | 서버 인증 필수로 처리 |
| v3 release 상태 | 최신 Models와 Best practices의 research-preview 표현이 일치하지 않음. 2026-10-04 Models 문서는 v3를 "이전 세대"로 분류하고 최신은 v4다 | 최신 모델 지원 자체와 preview 라벨 분리. release channel 확정 주장 안 함. preview 표기 일치 여부는 2026-10-04에 다시 확인한 기록이 없다 |
| v3 안정성 명칭 | 2026-09-26판 "Creative/Natural/Robust 명칭은 공식 문서로 확인" vs 2026-10-04에 받은 공식 페이지에서 명칭을 찾지 못함 | v3 `stability` 허용값은 정보 없음. 숫자 프리셋은 앱의 보수적 프리셋으로만 표시 |
| 발음 지원 | v3의 native IPA와 구형 SSML phoneme 설명이 함께 존재. v4는 텍스트 안 `"/IPA/"` 직접 표기(2026-10-04) | 모델마다 다른 텍스트 표기·사전 규칙을 적용. v4의 사전 지원은 정보 없음 |
| 정규화 기본값 | Flash 문서는 "default normalization disabled", 같은 문서의 다른 곳은 "모든 TTS 모델에서 기본 활성"(2026-10-04) | 기본값을 가정하지 않는다. 숫자·날짜 낭독은 직접 들어 확인 |
| v4 합성 경로 | Models는 "v4는 Text to Dialogue API로 쓸 수 있다"(v4 Turbo는 Text to Dialogue websocket)고 적고, UI 가이드는 `eleven_v4`를 Create speech·Stream speech에서 model ID로 쓸 수 있다고 명시(2026-10-04) | `eleven_v4`는 convert 후보. `eleven_v4_turbo`는 convert 지원이 정보 없음이라 `can_do_text_to_speech` 확인 전까지 숨김 |
| 라이브러리 규모 | "over 10,000"(voices 개요), "3,000+"(TTS 개요), "11,000+"(마케팅). 실측은 `language=ko`만 5,953명(2026-10-04) | 규모 문구를 앱 수치로 쓰지 않는다. 응답의 `total_count`를 쓴다 |
| 라이브러리 성우 직접 합성 | UI 가이드는 추가 없이 사용 가능, API 레퍼런스는 공백, 일부 서드파티는 추가가 필요하다고 적음(2026-10-04) | 정보 없음. add를 별도 상태 변경 단계로 분리 |
| 효과 | 일부 과거 통합 예제에서 언급될 수 있으나 현재 TTS 4개 HTTP 경로 모두 `apply_audio_effects` 없음 | API body에 전송하지 않고 별도 후속 도구로 분리 |

## 공식 문서 외 보충 근거

외부 서드파티·다른 OSS의 동작을 API 계약 증거로 사용하지 않았다. 문서의 speed/style 한계가 불완전해 ElevenLabs 자체 upstream skill을 보충 확인했다.

- `elevenlabs/skills@62eb4fcaf23f0dd888c0bb228652b6b4984e964d:text-to-speech/references/voice-settings.md:L7-L13` — [고정 SHA](https://github.com/elevenlabs/skills/blob/62eb4fcaf23f0dd888c0bb228652b6b4984e964d/text-to-speech/references/voice-settings.md#L7-L13). REST speed 0.25–4.0와 style 0–1 안내. 문서 충돌을 해소하는 확정 증거로 쓰지 않음.
- 같은 파일 `L23-L32`, `L104-L109` — [고정 SHA](https://github.com/elevenlabs/skills/blob/62eb4fcaf23f0dd888c0bb228652b6b4984e964d/text-to-speech/references/voice-settings.md#L23-L32). v3 설정 예시가 제품 가이드와 충돌하고 Flash가 일부 설정을 무시한다고만 설명하여 정확한 모델별 허용표로 쓰기 부족함.

## 구현 인계 요약

1. **기본**: 대본·목소리·모델. **표현**: 모델별 유효 설정·v3·v4 태그. **고급**: 28개 출력 형식(`/stream`은 21개), 언어 강제, 정규화, 사전, seed.
2. **서버자동**: 키, 정책별 logging, request ID·문맥·사전 버전·실제 적용값 기록. **후속**: deprecated 옵션, 효과/볼륨 믹싱, 음성 제작·복제·유사 음성 검색, 여러 화자, 추천·분석.
3. API 필드 존재, 모델 지원, Studio UI 기능을 별개로 취급한다. 미지원·조건부 옵션을 모든 모델에서 동작하는 것처럼 보여주지 않는다.
4. 합성 등 유료·상태 변경 호출의 API 검증은 수행하지 않았다(2026-09-26판은 "실제 API 검증은 수행하지 않았다"). 2026-10-04에 목록 조회만 실측했다. 위 충돌은 지원미확인 설명·보수적 UI 범위로 다루고, 미래 문서 업데이트나 허가된 기능 검증에서 해소한다.
5. 성우 목록은 값 목록(`gender`·`age`·`accent`·`use_case` 등)을 코드에 박지 않고 응답의 실제 값에서 만든다. 한국어는 라이브러리 `language=ko`와 `verified_languages`로 찾는다. 라이브러리 성우를 직접 합성할 수 있는지는 정보 없음이라 add를 별도 상태 변경 단계로 분리한다. 시험 생성은 항상 유료이고 무료 경로가 없으며 `maxRetries: 0`이 필요하다.

## 2026-10-04 재확인에서 바뀐 것

2026-09-26판 대비. 실측은 목록 조회 결과다.

| 영역 | 2026-09-26판 | 2026-10-04 |
| --- | --- | --- |
| 모델 | v3·multilingual_v2·flash_v2_5·turbo_v2_5·flash_v2·v3_conversational | **`eleven_v4`, `eleven_v4_turbo` 추가.** v4는 10,000자, 90+언어, Stability·Similarity만(Style·Speed 없음), SSML 없음, 오디오 태그, IPA `/…/` 직접 표기, 다른 언어에서 원 억양을 가져오지 않음. v3는 "이전 세대". `eleven_turbo_v2_5`·`eleven_turbo_v2`는 Deprecated 표로 이동하고 Flash 사용을 권장 |
| v3 길이 | 마케팅 3,000 대 Models·제품 5,000 충돌 | 충돌 **지속**. Models·가격 페이지·UI 가이드 5,000, 마케팅 FAQ 3,000 |
| v3 안정성 명칭 | "Creative/Natural/Robust 명칭은 공식 문서로 확인" | 이번에 받은 공식 페이지(Models, v4, best practices, playground, 도움말)에서 이 명칭을 **찾지 못함**. v3 stability 허용값은 정보 없음으로 되돌림 |
| 출력 형식 | convert 28개. 21개는 과거 문서·SDK enum의 누락으로 취급 | convert 28개는 같다. **`/stream`은 21개(WAV 7개 없음)**. SDK 2.70.0의 convert/with-timestamps는 28, stream 계열은 21 |
| 응답 헤더 | `request-id`, `character-cost`를 stitching 가이드 근거로 언급 | API 소개의 "Tracking generation costs"에 `character-cost`, `request-id`, `x-trace-id`가 공식 문서화됨. 동시성 헤더 `current-/maximum-concurrent-requests`도 확인 |
| 정규화 `on` | 요금제 조건 별도 확인 | v2.5 계열은 **Enterprise만** |
| 성우 목록 | `GET /v2/voices`는 한 줄, `shared-voices` 필터 일부만 | 두 호출의 쿼리 전부를 표로 정리(내 계정 20개, 라이브러리 18개). 기존에 빠진 것: shared의 `category`, `locale`, `search`, `min_notice_period_days`, `include_custom_rates`, `include_live_moderated`, `reader_app_enabled`, `owner_id`, `page`, `page_size`. `GET /v2/voices`의 `voice_type`, `high_quality`, `voice_ids`, `fine_tuning_state`, `collection_id`, `include_total_count`(기본 true). `GET /v1/voices/accents` 신규 확인 |
| 한국어 찾기 | 정보 없음(`language=ko` 동작 미확인) | **실측으로 확정**: 라이브러리 `language=ko` 5,953명, 첫 100명 모두 `language=ko`·`locale=ko-KR`·`verified_languages`에 `ko`와 샘플. 억양 6종. 계정 성우 31명 중 label `language`=`ko` 4명 |
| 값 목록 | 예시값뿐 | 한국어 첫 100명의 실제 값 분포 확인(gender 소문자 `male`·`female`, age `young`·`middle_aged`·`old`(+`middle-aged` 1건), accent 4종, use_case 7종, descriptive 19종). 공식 enum은 여전히 없음 |
| 기본 샘플 주소 | 언급 없음 | 2종: `storage.googleapis.com` 고정 주소, `api.us.elevenlabs.io/.../previews/audio?payload=` 쿼리 토큰 주소(만료 여부 정보 없음) |
| 기본 성우 | 언급 없음 | **Default 성우 2026-12-31 종료, 2026-03 이후 계정에는 없음.** Legacy ID는 대체 성우로 자동 라우팅. 실측 계정에는 premade 21명이 있다 |
| 라이브러리 | 언급 없음 | Free 플랜 API 사용 불가, 저장해도 커스텀 슬롯 미사용, 슬롯·voice 작업 한도 표, add 호출(`bookmarked` 기본 true) 정리, API 직접 합성 가능 여부는 공식 공백 |
| 동시성·오류 | 오류 코드 일부 | 플랜별 TTS 동시성 표, `text_too_long`·`invalid_page_size`·`invalid_cursor`·`system_busy` 등 확인. 오류 본문에 `param` 키 추가 |
| 과금 | 언급 없음 | v4 $0.022/1K(72% 할인, 2026-10-12까지), v4 Turbo $0.011, v3·v2 $0.08, Flash/Turbo $0.04. **사용자 텍스트 무료 미리듣기 없음**, 무료 재생성은 웹 전용 |
| SDK | 2.69.0 | 2.70.0 설치됨. 재시도 기본값(2회, 408·429·5xx)은 같다. 구독 응답에 `tier`, `voiceSlotsUsed`, `voiceLimit`, `voiceAddEditCounter`가 있어 플랜 표시에 쓸 수 있다 |
| 공개 OpenAPI | SHA-256 `4a671624…` | SHA-256 `bcda2b74…`로 바뀌었다. 필드 수는 같다 |
| 같은 것 | | convert 본문 13·query 3·voice_settings 5 필드, `speed` 0.7–1.2(스키마엔 상한 없음), `style` 스키마 min/max 없음, `language_code` multilingual_v2 미지원, `apply_language_text_normalization` 일본어 전용, `enable_logging=false` Enterprise 전용 |

## 정보 없음 / 확인하지 못한 것 (2026-10-04)

| 항목 | 상태 |
| --- | --- |
| 라이브러리 성우를 add 없이 API로 합성할 수 있는지, 안 되면 오류 코드 | 공식 문서에 없음. 실제 호출로만 확인 가능 |
| add 호출이 voice 작업 한도(`voiceAddEditCounter`)에 세어지는지, 응답 `voice_id`가 원본과 같은지 | 정보 없음 |
| 라이브러리 `locale`에 `ko-KR`을 쿼리로 보낸 동작, `language`·`locale`의 공식 값 목록 | `language=ko`만 실측. 나머지는 공식 enum 없음 |
| `gender`·`age`·`use_cases`·`descriptives`·`accent` 전체 enum | 스키마에 enum 없음. 한국어 첫 100명의 값만 실측. 전체 5,953명의 분포는 확인하지 않았다 |
| `eleven_v4_turbo`가 `POST /v1/text-to-speech`에서 되는지, 글자 상한 | 문서 문구 없음 |
| v4·v4 Turbo의 `language_code`, request stitching, 발음 사전, `apply_text_normalization: on`, `style`·`speaker_boost` 효과 | 정보 없음(`GET /v1/models` 플래그로 일부 확인 가능) |
| v3의 `stability` API 허용값(3단계 여부), v3 `style` 지원 | 정보 없음 |
| 크레딧 배율 숫자(Flash/Turbo 0.5 등), 구독 크레딧에서 v4 할인 종료의 영향 | 달러 단가만 확인 |
| 목록 조회(`/v2/voices`, `/v1/shared-voices`, `/v1/models`, accents)의 과금 여부와 분당 요청 제한 | 정보 없음 |
| 실패한 유료 호출(5xx, 타임아웃)의 과금 여부 | 정보 없음 |
| 오디오 태그를 지원하지 않는 모델에 넣으면 괄호를 읽는지, 한국어 대본에 영어 태그 효과 | 정보 없음 |
| 48kHz PCM/WAV의 플랜 제한, mp3 외 형식의 응답 content-type | 정보 없음 |
| `GET /v1/models`·구독 조회에 필요한 API 키 권한 이름 | 정보 없음("Voices (read)", "Text to Speech"만 확인) |
| 쿼리 토큰 샘플 주소(`api.us.elevenlabs.io/.../previews/audio?payload=`)의 만료 여부 | 정보 없음 |
| `sharing.status`의 `copied`가 라이브러리 복사본인지 | 정의 문구 없음. 실측에서 `copied` 9명, 수는 `professional` 9명과 같다(교차 집계 없음) |

## 문서 검증 증거

- 2026-09-26 공개 OpenAPI와 필드명을 자동 대조: body **13/13**, query **3/3**, voice_settings **5/5**, 사전 locator **2/2**, 출력 형식 **28/28** 포함.
- 참조 스키마 SHA-256(2026-09-26): `4a6716242c9ed6dafa43ccbff4447818e7f4295d2c4aef89489e9649e642e643`. 공개 스키마 스냅샷의 식별값이며 공급자의 배포 버전은 아니다.
- 2026-10-04 공개 OpenAPI 재수집. SHA-256: `bcda2b74cf627d3fcbb5f4235bef17845fc823cb5e18a1aaa21362a7cc1702b7`. 필드 수는 같다(body 13, query 3, voice_settings 5, convert 출력 형식 28). 해시가 달라진 원인은 확인하지 않았다(정보 없음).
- 네 가지 HTTP TTS 경로의 body를 확인했고 효과 파라미터는 없었다. 실제 음성·품질·계정별 권한 검증은 실행하지 않았다.
- 2026-10-04 실측은 목록 조회 5회다(공개 라이브러리 `language=ko` 2회, 계정 성우 목록 2회, 한국어 억양 목록 1회. 내역 `tasks/evidence/T04/research/calls.md`). 키와 전체 응답은 남기지 않고 통계만 `tasks/evidence/T04/research/list-probe-2026-10-04.json`에 있다(git 제외 증거 폴더).
