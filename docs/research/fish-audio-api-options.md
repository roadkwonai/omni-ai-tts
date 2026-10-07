# Fish Audio TTS API 옵션 조사

확인일: **2026-10-05**(최초 조사 2026-09-28, 연결 확인 절 2026-09-30·2026-10-04, T5 약관·무료 모델 재확인 2026-10-05). 조사 유형: 공식 API 구현 참조. 시작점은 [API Introduction](https://docs.fish.audio/api-reference/introduction)이며, 먼저 [llms.txt](https://docs.fish.audio/llms.txt) 색인으로 관련 페이지 목록을 확인한 뒤 각 `.md` 페이지와 공개 [OpenAPI](https://api.fish.audio/openapi.json)(39개 경로) 설명을 대조했다. 이는 조회 시점 문서 스냅샷이며 실제 배포 서버 버전을 보장하지 않는다. 2026-09-28판은 일부를 WebFetch 요약으로 적었고, 2026-10-04에 각 `.md`와 OpenAPI 원문을 내려받아 줄 단위로 다시 대조했다. 2026-10-05에는 무료 모델 안내와 약관을 확인했고 API를 호출하지 않았다. 읽기 전용 실측 내역은 `tasks/evidence/T04/research/calls.md`에 둔다. 초기조사의유료·상태변경(TTS생성/클론/삭제)호출은0이었다. 2026-10-06 사용자승인무료모델TTS1회는아래실측에별도기록한다. 실측 값은 날짜와 조회 종류를 함께 표시한다. "정보 없음"은 공식 문서에서 명시를 찾지 못했다는 뜻이다.

UI 배치는 이 프로젝트를 위한 **제안**이며 Fish Audio 실제 화면 위치를 뜻하지 않는다. `기본`=주 편집 화면, `표현`=감정·말하기 조절, `고급`=접을 수 있는 상세 설정, `서버자동`=사용자 입력 없이 서버가 처리, `후속`=단일 TTS 생성과 분리된 별도 흐름. 이 분류는 구현 우선순위가 아니며, 간편 클로닝의 제품 P0 우선순위는 [요구사항 계획](../plans/tts-service-requirements.md)을 따른다.

## 인증과 기본 URL

- 기본 URL: `https://api.fish.audio`
- 인증 헤더: `Authorization: Bearer <API 키>`. 키는 https://fish.audio/app/api-keys/ 에서 발급한다. [Quickstart](https://docs.fish.audio/developer-guide/getting-started/quickstart), [WebSocket TTS](https://docs.fish.audio/api-reference/endpoint/websocket/tts-live.md)
- W3C `traceparent` 헤더로 분산 추적을 지원한다(선택). [API Introduction](https://docs.fish.audio/api-reference/introduction)
- 모든 오류는 JSON 바디로 `message`, `status`를 반환한다고 일반 오류 문서는 설명하지만, TTS 엔드포인트 개별 문서는 401/402/503 오류 바디에 `status`, `message`, `reason` 세 필드를 명시해 필드 구성이 다르다. 파싱 자체가 실패한 잘못된 요청 바디는 평문 오류를 반환할 수 있다. [Errors](https://docs.fish.audio/api-reference/errors), [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)
- 키는 서버에서만 보관한다. 클라이언트 번들에 노출하지 않는다.

## TTS 생성 엔드포인트

- `POST /v1/tts`. 요청 `Content-Type`은 `application/json` 또는 `application/msgpack`. 응답은 **200 성공 시 오디오 스트림**(`Transfer-Encoding: chunked`)이며, Typecast/ElevenLabs처럼 일반 생성과 스트리밍이 별도 경로로 나뉘지 않고 이 경로 하나가 청크 전송을 겸한다. [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)
- 모델 선택은 **body 필드가 아니라 요청 헤더** `model`로 한다. 허용값: `s1`, `s2-pro`, `s2.1-pro`, `s2.1-pro-free`, `drama-3-preview`. 헤더를 생략하거나 인식하지 못하면 TTS 엔드포인트 문서는 기본값을 `s2.1-pro`(유료)로 명시한다. 철자가 틀려도 오류 없이 유료 모델로 간다(2026-10-04 재확인). **문서 충돌:** Python SDK 가이드는 SDK 기본 모델을 `s2-pro`로 설명하면서도 항상 모델을 명시적으로 전송한다고 적고, JS SDK 기본은 `s1`이다(TTS 가이드). "헤더 생략 시 서버 기본값"과 "SDK 기본값"이 다르다. 이 앱은 헤더를 항상 명시적으로 보내는 쪽을 권장한다. [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [핵심 가이드](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md), [Python 인증 가이드](https://docs.fish.audio/developer-guide/sdk-guide/python/authentication.md)

### 전체 요청 필드

| 필드 | 타입 | 기본값 | 범위·허용값 | 필수 | UI 배치 제안 |
| --- | --- | --- | --- | --- | --- |
| `text` | string | 없음 | 길이 상한 문서에 없음(`maxLength` 없음, 문서 전체에 상한 문장 없음. 2026-10-04 재확인) | **필수** | 기본: 대본. 감정·휴지 태그도 이 문자열 안에 넣는다 |
| `reference_id` | string 또는 string[] | null | 저장된 성우(모델) ID(`_id`). 문자열은 단일 화자, 배열은 다중 화자(S2 계열·`drama-3-preview`만, `s1`은 불가로 422). `reference_id`도 `references`도 없을 때 어떤 목소리가 나오는지는 정보 없음 | 선택 | 기본: 성우 선택 |
| `references` | ReferenceAudio[] (다중 화자는 중첩 배열) | null | 요청 안에 오디오+대본을 직접 넣는 즉석(zero-shot) 클로닝. `reference_id`와 별개 경로. **msgpack만 가능(JSON 불가)**, 10~30초 권장 | 선택 | 후속: 즉석 클로닝 |
| `temperature` | number | 0.7 | 0–1 | 선택 | 표현: 표현력 |
| `top_p` | number | 0.7 | 0–1 | 선택 | 고급: 다양성(nucleus sampling) |
| `prosody` | object | null | 하위 3개 필드(아래) | 선택 | 표현 |
| `chunk_length` | integer | 300(엔드포인트 문서·agent skill) / 200(핵심 가이드 예시·Python 타입) | 100–300 | 선택 | 고급: 청크 길이("한 번에 생성하는 글자 수"라고 가이드가 설명). **문서 간 기본값 수치 불일치, 미확정(2026-10-04에도 지속)** |
| `normalize` | boolean | true | **영어·중국어** 숫자 등 정규화. 한국어에 적용되는지는 정보 없음. 한국어 phoneme·발음 사전 표기는 문서에 없다(2026-10-04 확인) | 선택 | 고급: 텍스트 정규화 |
| `format` | enum | `mp3` | `wav`, `pcm`, `mp3`, `opus` | 선택 | 고급: 다운로드 형식 |
| `sample_rate` | integer 또는 null | null(형식별 기본값 사용) | 형식별 허용값은 출력 형식 절 참고 | 선택 | 고급 |
| `mp3_bitrate` | integer | 128 | 64, 128, 192 (kbps) | 선택 | 고급: mp3 선택 시만 |
| `opus_bitrate` | integer | -1000 | -1000(자동), 24000, 32000, 48000, 64000 | 선택 | 고급: opus 선택 시만 |
| `latency` | enum | `normal`(엔드포인트 문서·agent skill) / `balanced`(TTS 가이드) | `low`, `normal`, `balanced`. OpenAPI 설명은 normal=최고 품질, balanced=지연 감소, low=최저 지연. 핵심 가이드는 `balanced`를 "TTFA 약 300ms" 저지연으로, `normal`을 더 안정적인 옵션으로 설명해 값 의미와 기본값이 문서마다 다름 | 선택 | 고급: 지연 모드 |
| `max_new_tokens` | integer | 1024 | 청크당 최대 오디오 토큰. 범위 문서에 없음 | 선택 | 고급 |
| `repetition_penalty` | number | 1.2 | 1.0 초과 시 반복 감소. 범위 문서에 없음 | 선택 | 고급 |
| `min_chunk_length` | integer | 50 | 0–100 | 선택 | 고급 |
| `condition_on_previous_chunks` | boolean | true | 이전 청크를 문맥으로 사용해 일관성 유지 | 선택 | 서버자동 |
| `early_stop_threshold` | number | 1 | 0–1 | 선택 | 고급 |
| `features` | string[] | [] | 요청 단위 기능 플래그(예: `quality-guard`). **전체 허용값 목록 미확인** | 선택 | 후속: 허용값 확정 전 미노출 |
| `pronunciation_dictionary` | 배열(참조 또는 인라인), 최대 3개 | null | 아래 발음 사전 절 | 선택 | 고급 |

`prosody` 하위 필드: `speed`(number, 기본 1, 0.5–2.0 배속), `volume`(number, 기본 0, dB 단위 조절. 양수는 크게, 음수는 작게. 범위는 문서에 없음), `normalize_loudness`(boolean, 기본 true. S2 계열에서만 효과가 있고 `s1`은 받지만 효과 없음). `ReferenceAudio`: `audio`(binary, 필수, WAV/MP3/FLAC), `text`(string, 필수, 오디오의 정확한 대본). [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [Text to Speech Guide](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md)

### 발음 사전 (`pronunciation_dictionary`)

요청당 최대 3개까지 참조(`id`+불변 `version`) 또는 인라인(`items`, 최대 5,000개) 방식으로 넣는다. 인라인 항목은 `key`(최대 256자), `value`(최대 1,024자), `case_sensitive`(boolean, 기본 false)로 구성된다. 사전 자체는 웹 앱에서 만들고 미리듣고 게시한 뒤 TTS 요청에서 재사용한다고 설명한다. 2026-09-28판은 "사전 생성/수정을 위한 REST API 엔드포인트 존재 여부는 확인하지 못했다"고 적었다. **2026-10-04 확인: 사전을 만들고 게시하는 REST 엔드포인트는 OpenAPI 39개 경로에 없다(웹 앱에서만 만든다).** 사전의 값 형식도 영어·중국어·일본어 세 언어뿐이라 **한국어는 쓸 수 없다**. 참조 id를 못 찾으면 조용히 건너뛰고 200을 준다. 한국어 발음 교정은 앱의 발음용 대본(텍스트 치환)으로 해야 한다. [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [Fine-grained control](https://docs.fish.audio/developer-guide/core-features/fine-grained-control.md), [Pronunciation Dictionaries](https://docs.fish.audio/developer-guide/core-features/fine-grained-control/pronunciation-dictionaries.md)

### 모델별로 쓸 수 있는 옵션 차이 (2026-10-04 확인)

출처: [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md), [Text to Speech Guide](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md), [S2.1 Pro 무료 API 블로그](https://fish.audio/blog/s2-1-pro-free-api/).

| 항목 | `s1` | `s2-pro` | `s2.1-pro` / `s2.1-pro-free` | `drama-3-preview` |
| --- | --- | --- | --- | --- |
| 가격(/백만 UTF-8 바이트) | $15 | $15 | $15 / **$0** | 문서에 없음 |
| 언어 | 13개(영어·중국어·일본어·독일어·프랑스어·스페인어·**한국어**·아랍어·러시아어·네덜란드어·이탈리아어·폴란드어·포르투갈어), 이름 명시 | 80개 이상, 자동 감지, 이름 나열 없음 | 83개, 자동 감지. 공식 블로그([2026-06-23](https://fish.audio/blog/s2-1-pro-free-api/))는 Korean을 이름으로 언급. 개발 문서 Models Overview에는 이름 나열 없음 | 정보 없음 |
| 감정 문법 | `(happy)` 괄호, 고정 태그 세트 | `[happy]` 대괄호, 자유 자연어 | 동일(S2 계열) | 정보 없음 |
| 다화자(`reference_id` 배열, `<\|speaker:N\|>`) | **불가**(422) | 가능 | 가능 | 가능 |
| `prosody.normalize_loudness` | 받지만 효과 없음 | 효과 있음 | 효과 있음 | 정보 없음 |
| 그 밖의 필드(`temperature`, `top_p`, `format`, `latency` 등) | 같은 필드. 모델별 차이는 문서에 없음 | 동일 | 동일 | 정보 없음 |
| 보장 | | | `s2.1-pro`: TTFA·DPA 보장 대상. `-free`: 없음 | 프리뷰. "동작·제공 여부가 바뀔 수 있다". 가격·언어·태그 문법은 문서에 설명 없음(정보 없음) |

### 입력 길이, 응답 형식, 언어 (2026-10-04 확인)

| 항목 | 내용 |
| --- | --- |
| 입력 길이 상한 | **정보 없음.** `text`에 `maxLength`가 없고 문서 어디에도 상한 문장이 없다. 일반 오류 문서에 "엣지가 반환하는 일부 413·5xx는 JSON이 아닐 수 있다"는 문장이 있어 요청 크기 제한이 어딘가 있을 수는 있다. 앱이 자체 상한을 둬야 한다 |
| 성공 응답 | HTTP 200, `Transfer-Encoding: chunked`, 본문은 `format`에 맞는 **오디오 바이트 스트림**(JSON 래퍼 없음). 응답 `Content-Type` 값은 문서에 없다(요청한 형식으로 정한다) |
| 오류 응답 | 일반: `{message, status}` JSON. TTS 문서의 401·402·503은 `{status, message, reason}`. 400(파라미터·없는 성우)·403·404·429·5xx. 422는 `{loc, type, msg, ctx, in}` 배열([agent skill](https://docs.fish.audio/.well-known/agent-skills/fish-audio-api/SKILL.md)). 본문 파싱이 실패한 요청은 평문 오류. 일부 엣지 오류는 JSON이 아님 |
| 재시도 | 문서는 429와 5xx를 지수 백오프로 재시도하라고 하고 다른 4xx는 고치라고 한다. TTS 요청의 멱등성(중복 전송 시 이중 처리 여부)은 문서에 없다(정보 없음) |
| 언어 지정 | **필드 없음.** S2 계열은 "언어는 자동 감지, 대상 언어로 텍스트를 쓰면 된다"고 한다([Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md)). `s1`은 13개 언어 목록 안에서 텍스트로 정한다 |
| 성우 언어와 텍스트 언어가 다를 때 | 성우의 `languages`에 `ko`가 없어도 한국어 텍스트를 읽을 수 있는지, 품질이 어떤지는 정보 없음 |

## 감정·연기·휴지: 텍스트 인라인 태그

Fish Audio는 감정을 **별도 request 필드가 아니라 `text` 안의 인라인 태그**로만 제어한다. 구조화된 enum이나 강도(intensity) 숫자 필드는 없다.

| 모델·기능 | 문법 | 조건 | UI 배치 |
| --- | --- | --- | --- |
| S2 계열(감정) | 대괄호 자연어, 예: `[happy]`, `[slightly sad]`, `[very excited]` | 수식어 조합 가능. 대본에 삽입 | 표현: 태그 삽입 |
| S1(구형) | 괄호 고정 태그, 예: `(happy)` | S2와 문법이 다름 | 표현: 모델별 문법 분기 |
| 휴지·paralanguage | S2: `[break]`, `[long-break]`([Emotion Control](https://docs.fish.audio/developer-guide/core-features/emotions.md)). 괄호 `(break)`, `(long-break)`, `(breath)`, `(laugh)`, `(cough)`, `(lip-smacking)`, `(sigh)` 등은 Fine-grained Control 페이지의 V1.6 시절 실험 기능 표. "음", "어" 같은 자연스러운 머뭇거림 단어 | 문장 안에 자유롭게 삽입, 예: `"I am, um, an (break) engineer"`. 두 문법이 문서 사이에서 다르다. S2에서는 `[break]`를 따르고 청취로 확인한다(2026-09-28판은 `(break)`를 S2 행 근처에 적었다) | 표현: 휴지·군더더기 삽입 |
| 발음 지정 | `<|phoneme_start|>...<|phoneme_end|>` | 언어별 표기: 영어 CMU Arpabet, 중국어 성조 숫자 병음, 일본어 OpenJTalk 로마자 | 고급: 발음 직접 지정 |

감정·톤 태그 전체 목록(**2026-10-04 원문 표 직접 확인**. 2026-09-28판은 WebFetch 요약이라 "정확한 철자·전체 개수는 구현 전 재확인이 필요하다"고 적었다):

| 종류 | S2 계열 `[대괄호]` | `s1` `(괄호)` |
| --- | --- | --- |
| 기본 감정 24 | happy, sad, angry, excited, calm, nervous, confident, surprised, satisfied, delighted, scared, worried, upset, frustrated, depressed, empathetic, embarrassed, disgusted, moved, proud, relaxed, grateful, curious, sarcastic | 같은 이름(Emotion Control 페이지). [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md)의 S1 목록은 일부가 다르다(`joyful`, `interested`, `confused`가 있고 `happy`, `calm`, `sarcastic`이 없다) |
| 심화 감정 25 | disdainful, unhappy, anxious, hysterical, indifferent, uncertain, doubtful, confused, disappointed, regretful, guilty, ashamed, jealous, envious, hopeful, optimistic, pessimistic, nostalgic, lonely, bored, contemptuous, sympathetic, compassionate, determined, resigned | 같은 이름 |
| 톤 | `[in a hurry tone]`, `[shouting]`, `[screaming]`, `[whispering]`, `[soft tone]`, `[emphasis]`(강조할 말 바로 앞) | `(in a hurry tone)`, `(shouting)`, `(screaming)`, `(whispering)`, `(soft tone)` (5개) |
| 효과음 | `[laughing]`, `[chuckling]`, `[sobbing]`, `[crying loudly]`, `[sighing]`, `[groaning]`, `[panting]`, `[gasping]`, `[yawning]`, `[snoring]`, `[clear throat]` (11개) | 같은 목록에서 `clear throat` 제외 (10개) |
| 특수 효과 | `[audience laughing]`, `[background laughter]`, `[crowd laughing]`, `[break]`, `[long-break]` | 괄호 버전 |
| 자유 표현 | `[whispers sweetly]`, `[laughing nervously]`, `[slightly sad]`, `[very excited]`, `[extremely angry]`처럼 어떤 설명이든 가능("고정 세트에 한정되지 않음"). 강도는 수식어로 준다 | 불가(고정 태그) |

사용 규칙(문서): 문장 수준 감정은 문장 맨 앞에 두는 것이 가장 잘 먹는다. 톤·효과음은 어디든 가능. 한 문장에 감정은 하나, 많아야 3개 조합. 강도 숫자 필드는 없다. 감정 마커는 토큰 한도에 포함되지 않고 추가 지연이 없고 모든 요금제에서 쓸 수 있다고 적혀 있다.

한국어 동작: 문서는 "13개 지원 언어 전체(한국어 포함)에서 감정 마커를 쓸 수 있다"고만 적는다(그 13개가 S1의 13개와 같은지는 문서가 구분하지 않는다). 문서의 모든 예시 태그는 영어다. 한국어로 쓴 태그(예 `[기쁘게]`)가 동작하는지는 정보 없음. 한국어 문장에서 영어 태그가 효과를 내는지, 태그가 소리 내어 읽히는지도 정보 없음(청취 필요).

정규화(`normalize`)를 끄면 숫자·날짜·URL 낭독 안정성이 떨어질 수 있다고 명시한다. SSML 지원 여부는 문서에서 언급되지 않았다(비공식 지원 미확인). [Emotions](https://docs.fish.audio/developer-guide/core-features/emotions.md), [Fine-grained control](https://docs.fish.audio/developer-guide/core-features/fine-grained-control.md)

발음 지정(`<|phoneme_start|>…<|phoneme_end|>`)은 영어(CMU Arpabet), 중국어(성조 숫자 병음), 일본어(OpenJTalk 로마자)만 문서화돼 있다. **한국어 음소 표기는 문서에 없다**(2026-10-04 확인).

## 스트리밍/WebSocket

`POST /v1/tts` 자체가 청크 스트리밍 응답이므로 일반 오디오용 별도 REST 스트림 경로는 없다. 2026-10-04 확인: 단어 단위 정렬(`alignment`)이 필요한 SSE 변형 `POST /v1/tts/stream/with-timestamp`(요청 필드는 동일, 응답이 SSE로 base64 오디오 청크와 단어 단위 `alignment`)와 WebSocket `wss://api.fish.audio/v1/tts/live/with-timestamp`가 더 있다(2026-09-28판은 두 경로를 적지 않았다). `/v1/voice-design`도 있으나 이 프로젝트 범위 밖이다. 이 프로젝트는 타임스탬프 변형을 쓰지 않는다. 순수 WebSocket 경로는 다음과 같다.

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

`voice`라는 별도 용어 없이 이 API는 성우를 **모델(model)**로 통칭하며 `type: "tts"`인 항목이 합성 가능 성우다. 인증: 목록·상세 모두 `BearerAuth`가 필요하다(`security: [BearerAuth]`). 문서 최상단의 `security: []`는 기본값일 뿐 엔드포인트가 덮어쓴다. 2026-09-28판은 "OpenAPI에 `security: []`로 표시되어 있어 문서상 인증 없이도 호출 가능"이라 적었으나 2026-09-30 이후 판은 `BearerAuth`를 요구한다(아래 "이 앱에 넣을 때 주의점" 3번과 같다). 이번 조사는 인증 헤더를 포함한 호출만 실행했다.

| 기능·경로 | 핵심 계약 | 출처 |
| --- | --- | --- |
| 목록 `GET /model` | 페이지네이션: `page_size`(1–**100**, 기본 10), `page_number`(최소 1, 기본 1, 상한 정보 없음). 필터: `title`(제목 검색, 가이드는 "fuzzy하고 사용량 순으로 정렬"이라 설명), `tag`(string 또는 string[], 허용값 목록 정보 없음), `language`(string 또는 string[]), `title_language`(string 또는 string[], "제목의 언어로 거른다"는 한 줄 설명뿐), `author_id`(공개 성우를 작성자로 거름. `self=true`이면 무시), `self`(boolean, 기본 false. true이면 현재 워크스페이스 소유 성우, 팀 워크스페이스 포함. false이면 공개 라이브러리), `licensed`(boolean, 기본 false. true이면 Fish Audio가 권리를 확보한 공개 성우만. `self=true`이면 무시). 정렬: `sort_by`(`score` 기본/`task_count`/`created_at`). `score`의 산식은 정보 없음. **Python SDK 기본은 `task_count`**로 REST 기본과 다르다([SDK resources](https://docs.fish.audio/api-reference/sdk/python/resources.md)) | [List Models](https://docs.fish.audio/api-reference/endpoint/model/list-models.md), [openapi.json](https://api.fish.audio/openapi.json) |
| 상세 `GET /model/{id}` | path `id` 필수. 목록과 동일한 `ModelEntity`를 200으로 주고 403·404를 문서화한다 | [Get Model](https://docs.fish.audio/api-reference/endpoint/model/get-model.md) |

없는 것: `visibility`, `type`(tts/svc), `state` 쿼리, 정렬 방향(오름·내림), `licensed`가 아닌 라이선스 조건 필터. 따라서 `type=tts`, `state=trained`, `dmca_taken_down=false`는 응답을 받고 서버 코드에서 거른다. `visibility` 쿼리는 현재 OpenAPI에 없다(2026-10-04 확인). `tag`·`language` 배열을 쿼리스트링에 싣는 방식은 문서에 없다. 실측(2026-10-04, 목록 조회 2회)으로는 반복 키(`tag=female&tag=narration`)가 동작하고, 여러 값의 뜻은 **모두 포함(AND)**이다. 태그 둘을 보낸 결과 100명 모두 두 태그를 가졌다. `language=ko&language=ja`는 `total` 557(정확)이었고 100명 모두 두 언어를 가졌다. 응답 시간은 1.7초와 11.4초였다. 두 OpenAPI(`api.fish.audio`, `docs.fish.audio/api-reference/openapi.json`)의 `/model` 파라미터는 같다. 목록 조회는 200만 문서화돼 있다(오류 코드 목록 없음).

실제 무료 조회로 확인한 목록 응답 봉투 필드: `items`, `total`, `has_more`, `max_offset`, `accessible_upper_bound`, `total_is_exact`, `window_limited`. `items`(성우 배열)와 `total`(정수, 필수) 외의 `has_more`, `max_offset`, `accessible_upper_bound`, `window_limited`(기본 false), `total_is_exact`(기본 true)는 설명 문장이 없다. 이름으로 보면 깊은 페이지는 제한될 수 있다는 신호로 읽히나 공식 의미는 **정보 없음**이다. 실측값은 아래 "실측" 절에 있다.

항목(성우) 필드: `_id`, `type`(`svc`/`tts`), `title`, `description`, `cover_image`, `state`, `created_at`, `updated_at`, `tags`, `languages`, `visibility`, `default_text`, `source`, `train_mode`, `licensed`, `like_count`/`liked`, `mark_count`/`marked`/`unliked`, `shared_count`, `task_count`, `lock_visibility`, `dmca_taken_down`, `takedown_category`, `pvc_notice_period_months`, `pvc_release_state`, `pvc_released_at`, `pvc_retire_effective_at`, `pvc_retire_requested_at`, `author`(중첩), `quality`(중첩, `quality.audios[]`에 `filename`/`duration_ms`/`language`/품질 지표), `samples`(중첩, 각 항목의 `audio` 필드가 **샘플 오디오 URL**). 이 필드 목록은 2026-09-28 실제 호출 응답과 문서 요약을 대조해 확인했고, 2026-10-04 실측에서 반환된 항목의 키 33개가 같은 목록이다. [List Models](https://docs.fish.audio/api-reference/endpoint/model/list-models.md)

필드별 형식·필수 여부(2026-10-04 OpenAPI `ModelEntity`의 `required` 기준):

| 필드 | 타입·값 | 필수 | 비고 |
| --- | --- | --- | --- |
| `_id` | string | 필수 | `reference_id`로 쓰는 값 |
| `type` | `tts` \| `svc` | 필수 | `svc`는 노래 음성 변환(Python SDK 설명). 합성 대상은 `tts`. 필터가 없어 직접 거른다 |
| `title` | string | 필수 | |
| `description` | string | 선택(기본 "") | |
| `cover_image` | string(URL) | 선택(기본 "") | |
| `train_mode` | `fast` \| `full` | 선택(기본 `full`) | 생성 API는 `fast`만 받는다 |
| `state` | `created` \| `training` \| `trained` \| `failed` | 필수 | 합성에 쓰려면 `trained`여야 할 것으로 보이나, 다른 상태에서 TTS가 어떻게 되는지는 정보 없음 |
| `tags` | string[] | 필수 | 허용값 목록 정보 없음. 실측 상위 60개는 아래 실측 절에 있다 |
| `languages` | string[] | 선택(기본 []) | 언어 코드(SDK 설명 `["en","zh"]`). 공식 값 목록은 정보 없음 |
| `visibility` | `public` \| `unlist` \| `private` | 필수 | |
| `lock_visibility` | boolean | 선택 | |
| `samples` | `SampleEntity[]` | 선택(기본 []) | 항목마다 `title`, `text`(샘플 대본), `task_id`, `audio`(**샘플 오디오 URL**) 모두 필수 |
| `default_text` | string | 선택 | 성우의 기본 문구 |
| `licensed` | boolean | 선택 | Fish Audio가 권리 확보 |
| `source` | string \| null | 선택 | 의미 정보 없음 |
| `like_count`, `mark_count`, `shared_count`, `task_count` | integer | 필수 | `task_count`는 합성 횟수(Python SDK 설명) |
| `liked`, `marked`, `unliked` | boolean | 선택 | 호출한 계정 기준 |
| `author` | `{ _id, nickname, avatar }` | 필수 | |
| `quality` | `{ audios[], created_at, updated_at }` \| null | 선택 | `audios[]`: `filename`, `duration_ms`, `language`, `quality`(숫자 맵), `quality_passed`, `quality_reason` |
| `created_at`, `updated_at` | date-time | 필수 | |
| `dmca_taken_down`, `takedown_category`(`dmca`\|`policy`) | boolean\|null, enum\|null | 선택 | 삭제 요청으로 내려진 성우 표시. 거르는 편이 안전(추정) |
| `pvc_release_state`(`released`\|`retiring`), `pvc_notice_period_months`, `pvc_released_at`, `pvc_retire_requested_at`, `pvc_retire_effective_at` | 각각 enum/정수/date-time \| null | 선택 | PVC가 무엇의 약어인지, 은퇴(retiring) 후 합성이 어떻게 되는지는 문서에 설명 없음(정보 없음). `retiring`이면 경고를 보이는 것이 안전하다(추정) |

### 한국어 성우를 찾는 방법

`GET /model?language=ko&page_size=100`(정렬은 기본 `score` 또는 `sort_by=task_count`). **`language=ko`는 실제로 동작한다**(2026-10-04 실측, 목록 조회): 반환된 첫 100명 모두 `languages`에 `ko`가 있다. 2026-10-04 이전 증거는 `ko`를 "추정"으로 적었다(문서 예시는 `en`뿐이고 `ko`는 에이전트 문서의 52개 언어 코드 표에만 있었다, [Voice & Language](https://docs.fish.audio/agents/build/voice-language.md)). 주의점:

- `language=ko`는 성우의 `languages` 배열이 `ko`를 포함하는 것만 거른다. `languages`가 비어 있거나 `ko`가 없는 성우도 S2 계열에서는 한국어 텍스트를 읽을 수 있을 수 있으나, 품질은 정보 없음(청취 필요).
- 제목 검색은 `title`이고 제목 언어는 `title_language`다. 한글 제목 성우는 `title_language=ko`가 맞을 것으로 **추정**하나 문서에 값 예시가 없다(이번 실측에서도 보내지 않았다).
- `tag`의 `Korean`은 `language=ko` 첫 100명 중 56명뿐이다. 한국어 판별은 `tag`가 아니라 `languages`로 한다(실측 근거).
- 접근 가능한 결과가 조건마다 최대 1,000명 창으로 보인다(추정, 아래 실측). 100명씩 10페이지가 끝이라는 뜻으로 보이나 `page_number` 11 이후 동작은 확인하지 않았다.

### 공개·비공개·unlist와 남의 성우 사용

| 구분 | 의미 | 남이 `reference_id`로 합성 | 출처 |
| --- | --- | --- | --- |
| `public` | 공개 라이브러리에 게시 | **가능**. "게시하면 누구나 `reference_id`로 쓸 수 있다", "공개 성우 id는 그대로 `reference_id`로 쓰고 내 계정에는 아무것도 저장되지 않는다" | [Manage Voices](https://docs.fish.audio/features/manage-voices.md), [cookbook](https://docs.fish.audio/developer-guide/sdk-guide/cookbook/discover-library-voice.md) |
| `unlist` | 링크를 아는 사람만 접근 | 링크 소지자는 접근한다고 OpenAPI가 적는다. 목록에는 안 보인다. API로 id만 알 때 합성되는지는 정보 없음 | [Create Model](https://docs.fish.audio/api-reference/endpoint/model/create-model.md) |
| `private` | 만든 사람만 | 불가. 보이지 않는 성우는 404("없거나 보이지 않음") | [agent skill](https://docs.fish.audio/.well-known/agent-skills/fish-audio-api/SKILL.md) |

- `self=true`는 "현재 워크스페이스" 소유 성우를 준다. 공개 라이브러리 조회에서 내 `private`·`unlist` 성우가 섞이는지는 정보 없음(`self`로 분리해서 부르는 것이 문서 사용법).
- 클론 생성 API에서 `visibility=public`을 보내면 **private으로 낮춰진다**("웹 게시 흐름을 쓰라")고 OpenAPI가 적는다. API만으로 공개 게시는 못 하는 것으로 보인다.
- 남의 공개 성우를 쓸 때 별도 사용료·라이선스 비용이 있는지, 상업 이용 조건(YouTube 수익화 등)은 읽은 문서에 없다(정보 없음). 이용약관·성우별 라이선스는 조사 범위 밖이다. `licensed=true`는 "Fish Audio가 권리를 확보"라는 표시일 뿐이다.

### 성우 목록의 과금과 요청 제한

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 목록·상세 과금 | 요금표에 항목이 없다(TTS, ASR, Voice Design만 있다). 명시적인 "무료" 문구는 없다. **정보 없음**, 요금표에 없으니 무료로 보는 것은 추정 | [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md) |
| 요청 제한 | 초당·분당 호출 수가 아니라 **동시 요청 수**: Starter(누적 결제 $100 미만) 5, Elevated(≥$100) 15, High Volume(≥$1,000) 50. 한도는 계정의 모든 API 키가 공유한다 | 같은 문서 |
| 한도 초과 | 429, `Retry-After` 헤더 없음, 지수 백오프로 재시도하라고 안내 | 같은 문서, [Errors](https://docs.fish.audio/api-reference/errors.md) |
| 목록 조회가 동시 한도에 포함되는지 | 문서는 "native API"의 요청이라고만 쓴다. 목록 조회를 포함하는지는 정보 없음 | |

### 실측 (2026-10-04, 목록 조회)

키와 전체 응답은 저장하지 않고 통계만 남겼다. 합성·클론·삭제 호출은 하지 않았다.

| 조회 | 결과 |
| --- | --- |
| `GET /model?page_size=100&language=ko` | HTTP 200, **4.0초(4,040ms)**, 100명 응답 본문 163,272자(JS 문자열 길이). `total` 1000, `has_more` true, `max_offset` 1000, `accessible_upper_bound` 1000, `window_limited` true, `total_is_exact` false |
| `GET /model?page_size=100`(필터 없음) | HTTP 200, 2.9초(2,934ms). 봉투 값은 위와 같다(`total` 1000, `max_offset` 1000, `accessible_upper_bound` 1000, `window_limited` true, `total_is_exact` false). 100명 모두 `type`=`tts` |
| `GET /model?page_size=100&self=true` | HTTP 200, 0.4초(369ms). **0명**(`total` 0). 이 계정에는 내 성우가 없다 |

`total`·`max_offset`·`accessible_upper_bound`가 1000이고 `window_limited`가 true, `total_is_exact`가 false인 것은 두 조회(`language=ko`, 필터 없음) 모두 같다. 이름과 값으로 보면 조건마다 접근 가능한 결과가 최대 1,000명 창이고 `total`은 정확한 전체 수가 아니다. 공식 설명은 여전히 정보 없음이다(해석은 추정). 따라서 한국어 성우의 실제 전체 수는 알 수 없다.

`language=ko` 첫 100명(기본 정렬 `score`) 기준 분포. **전체가 아니라 첫 페이지 100명이다.**

| 필드 | 값 분포 (명) |
| --- | --- |
| `type` / `state` / `visibility` | `tts` 100 / `trained` 100 / `public` 100 |
| `train_mode` | `fast` 100 |
| `licensed` | `false` 100 |
| `dmca_taken_down` | `false` 100 |
| `pvc_release_state` | null 100 |
| `languages` | `["ko"]` 86, `["ja","ko"]` 3, `["en","ko"]` 2, `["ko","en"]` 2, `["ja","ko","en"]` 2, `["en","ja","ko"]` 1, `["ko","ja"]` 1, `["ko","en","ja","id","es"]` 1, 9개 언어 1, 12개 언어 1. 100명 모두 `ko` 포함. 같은 언어 집합이 배열 순서만 달라 따로 집계된다(순서가 일정하지 않다) |
| `tags` | 허용값 목록 정보 없음. 상위 60개까지 기록했고 더 있을 수 있다. 상위: `Korean` 56, `female` 53, `young` 52, `middle-aged` 44, `friendly` 41, `clear` 41, `male` 40, `energetic` 40, `professional` 40, `narration` 39, `calm` 39, `social-media` 34, `conversational` 33, `bright` 32 등. 기록된 태그 중 `Korean`만 대문자로 시작한다 |
| `samples` 개수 | 0개 4명, 1개 95명, 2개 1명(샘플 97개) |
| 샘플 주소 | 호스트 `platform.r2.fish.audio` 97개. 쿼리가 있는 주소는 없었다(기록 방식상 쿼리가 있으면 표시됨). 만료 여부는 정보 없음 |
| `cover_image` | 있음 100 |
| 제목에 한글 | 53명 |
| `task_count` 범위 | 1,033 ~ 377,693 |

필터 없는 첫 100명(기본 정렬 `score`)의 `languages` 집계(성우 한 명이 여러 언어를 가질 수 있어 합이 100을 넘는다): `en` 47, `es` 22, `ar` 10, `ru` 7, `zh` 5, `ja` 4, `pt` 4, `fr` 2, `it` 2. 이 첫 100명에는 `ko`가 없다. 한국어 성우를 찾으려면 `language=ko`를 써야 한다.

## 보이스 클론(모델 생성) API

| 기능·경로 | 계약 |
| --- | --- |
| 생성 `POST /model` | `multipart/form-data`. 필수: `type`(const `"tts"`), `title`(string), `train_mode`(const `"fast"`), `voices`(오디오 파일 1–20개). 선택: `visibility`(기본 `private`; `public`/`unlist`/`private`이 enum이나 생성 때 `public`은 private으로 낮춰진다. 아래 공개/비공개), `description`, `cover_image`, `texts`(음성 파일과 짝지을 대본, 최대 20개), `voice_design_signatures`, `tags`, `enhance_audio_quality`(boolean, 기본 true — 학습 전 배경 잡음 제거·레벨 정규화), `generate_sample`(boolean, 기본 false) |
| 상세 `GET /model/{id}` | 위 목록·상세와 동일 경로 재사용 |
| 수정 `PATCH /model/{id}`(추정) | llms.txt 색인에 Update Model 페이지가 존재함만 확인했고 **전체 요청 필드는 이번 조사에서 확인하지 못했다** |
| 삭제 `DELETE /model/{id}` | path `id` 필수. `BearerAuth` 필요, 소유자만 가능(권한 없으면 401). 200 성공. 503은 과부하로 처리 실패 |

**입력 파일 조건**(생성 가이드 기준, 다른 페이지): 형식 `.wav`, `.mp3`, `.m4a`, `.opus`. 클립당 **최소 10초**, 권장 1–2분의 깨끗한 단일 화자 음성. 배경음악·잔향·겹치는 목소리는 피하라고 안내. **파일 크기 상한은 문서에서 확인하지 못했다.** `train_mode: "fast"`(현재 유일하게 문서화된 값)는 "거의 즉시 사용 가능"이라고 설명해 Typecast 전문 클론처럼 긴 훈련 대기가 필요 없어 보이지만, 정확한 처리 소요 시간의 수치 보장은 없다.

**공개/비공개**: `visibility`는 `private`(기본, 생성자만), `unlist`(링크 소지자만), `public`(Voice Library 게시)의 3단계다. 이후 관리 화면에서 변경 가능하다고 설명한다. **2026-10-04 확인: 생성 때 `public`을 보내면 OpenAPI가 private으로 낮춰진다고 적는다(웹 게시 흐름을 쓰라는 안내). 같은 사이트의 agent skill 문서는 기본값을 `public`이라 적어 문서끼리 어긋난다.** 2026-09-28판은 생성 때 세 값 중 직접 선택할 수 있는 것처럼 적었다. API만으로 공개 게시는 못 하는 것으로 보인다(추정). [Create Model](https://docs.fish.audio/api-reference/endpoint/model/create-model.md), [Creating Models 가이드](https://docs.fish.audio/developer-guide/core-features/creating-models.md)

## 잔액/사용량, 요금, 요율 제한, 오류 코드

### 잔액(API 크레딧) 조회

- `GET /wallet/{user_id}/api-credit`. `user_id`에 `"self"`를 넣으면 본인 잔액을 조회한다. `Authorization: Bearer <키>` 필요. 쿼리 `check_free_credit`(boolean, 기본 false), `team_id`(선택).
- 응답 필드: `_id`, `user_id`, `credit`, `cumulative_top_up`, `created_at`, `updated_at`, `has_phone_sha256`, `has_free_credit`.
- **2026-09-28 실제 호출 결과: 성공, HTTP 200.** 응답 JSON의 키 구성이 문서와 일치함을 확인했다(금액·잔액 수치는 이 문서에 기록하지 않음). 이 호출이 과금되는지 여부는 문서에 명시되어 있지 않다(계정 정보 조회 성격상 무료로 추정하나 **미확정**). [Get API Credit](https://docs.fish.audio/api-reference/endpoint/wallet/get-api-credit)

#### 연결 확인 (2026-09-30 재확인, T2)
- T2 연결 확인은 이 호출(`GET /wallet/self/api-credit`)을 쓴다. 키가 있어야 성공하고 잔액을 함께 준다.
- OpenAPI상 `credit`과 `cumulative_top_up`은 **문자열**이다. 단위는 문서에 없다(USD로 추정하나 미확정). 초기화 시각은 없다. [OpenAPI](https://docs.fish.audio/api-reference/openapi.json)
- 문서화된 응답은 200·401·503이다. 402(잔액 부족)·429는 일반 오류 문서에 있고 본문은 `{message, status}`다. `Retry-After`는 명시 없음. 잔액 0 계정이 이 조회에서 200을 받는지는 명시 없음(추정: 200에 잔액 0). [Errors](https://docs.fish.audio/api-reference/errors.md)
- 정수 `balance`·`total`을 주는 `GET /wallet/self/package`도 있다. 아래 "웹 플랜(구독 패키지) 조회"를 본다.

#### 웹 플랜(구독 패키지) 조회 (2026-10-04, T2 후속 수정)
- `GET /wallet/{user_id}/package`. 문서 설명은 "Get current user premium information"이다. `Authorization: Bearer <키>` 필요. 응답 필드: `user_id`, `type`, `total`·`balance`(정수), `extra_balance`(정수, 기본 0), `billing_period`, `current_period_end`, `subscription_status`, `stripe_*`, `has_used_trial` 등. [Get User Package](https://docs.fish.audio/api-reference/endpoint/wallet/get-user-package)
- **2026-10-04 실제 호출 결과: 성공, HTTP 200(무료 플랜 계정).** `type`은 `free`, `balance`가 `total`보다 컸다(추가 크레딧 `extra_balance` 포함). `current_period_end`는 null이라 웹 화면의 '다음 크레딧 갱신' 날짜는 이 응답에 없다. 수치는 기록하지 않는다. 사용자 웹 화면의 '남은 크레딧 N / M'과 같은 값이었다.
- 이 값은 fish.audio 웹 플랜 크레딧이고 `api-credit`의 충전 잔액과 따로 조회된다(확인한 사실). API 생성(`POST /v1/tts`)이 웹 크레딧을 쓰지 않고 충전 잔액(pay-as-you-go)만 쓰는지는 **미확정**이다. 공식 요금 문서와 플랜 페이지에는 이 구분을 직접 적은 문구가 없다. 플랜 페이지는 "Premium subscribers get access to our flexible pay-as-you-go API"라고만 적는다. 외부 정리 글([smallest.ai](https://smallest.ai/blog/fish-audio-pricing-plans-api-billing-commercial-use-in-2026))은 API가 플랜 크레딧을 쓰지 않는다고 적는다. 그래서 화면은 두 값이 별개라는 것까지만 말한다(문구는 `docs/briefs/provider-status.md` 7절). 실제 생성 호출을 승인받는 T5 설계에서 확인한다.
- 연결 확인은 `api-credit`이 성공한 뒤 이 조회를 순서대로 부른다. 이 조회가 실패하면 웹 플랜 칸만 빠지고 연결 상태는 바뀌지 않는다. 다만 두 호출이 10초 제한을 함께 쓰므로, 시간을 넘기면 확인 실패다. 과금 여부는 `api-credit`과 같이 문서에 명시가 없다(**미확정**).

### 요금 단위

| 항목 | 단가 |
| --- | --- |
| TTS(`s1`, `s2-pro`, `s2.1-pro`) | **US $15.00 / 백만 UTF-8 바이트**. 문서는 약 18만 영어 단어 또는 약 12시간 분량 음성에 해당한다고 예시함 |
| TTS(`s2.1-pro-free`) | **US $0.00 / 백만 바이트**(무료). 공정 사용 한도, TTFA·DPA 보장 없음. 무료 기간·학습 사용 등 조건은 아래 "무료 시험 생성 경로" |
| TTS(`drama-3-preview`) | 가격표에 없음(**정보 없음**) |
| 음성 인식(`transcribe-1`, `transcribe-1-pro`) | US $0.36 / 오디오 시간(초 단위 올림) |
| Voice Design(`voice-design-1`) | US $0.01 / 성공한 API 요청 |
| 모델 생성(클론) | 이번 조사에서 별도 단가를 확인하지 못했다(**미확인**) |

과금 기준이 **글자 수가 아니라 UTF-8 바이트**라는 점이 Typecast(글자 수 상한)·ElevenLabs(character-cost 기반)와 다르다. 한글은 UTF-8에서 보통 3바이트를 차지하므로 같은 글자 수라도 영어 대비 청구 바이트가 커진다. [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md)

| 과금 세부 (2026-10-04 확인) | 내용 |
| --- | --- |
| 과금 단위 | 입력 텍스트의 **UTF-8 바이트** 수. 100만 바이트 ≈ 영어 18만 단어 ≈ 음성 약 12시간 |
| 한국어 환산 | 한글 음절은 UTF-8에서 3바이트, 공백·숫자·ASCII 태그 문자는 1바이트다. 한글 1,000자 ≈ 3,000바이트 ≈ **$0.045**, 100자 ≈ $0.0045(계산값, 모델이 유료일 때). 태그(`[happy]` 7바이트)가 과금 바이트에 들어가는지는 문서에 없다. 보수적으로 `text` 전체를 센다(추정) |
| 모델별 차이 | 유료 세 모델은 같은 단가. 무료는 `s2.1-pro-free`뿐 |
| 최소 과금 | 정보 없음 |
| 실패한 요청의 과금 | ASR·Voice Design은 "오류 응답은 과금하지 않는다"고 적혀 있다. TTS는 그 문장이 없다(정보 없음). 스트림 중간에 끊긴 요청의 과금도 정보 없음 |

#### 무료 시험 생성 경로: `s2.1-pro-free`

무료 시험 생성 경로는 **있다**: `model: s2.1-pro-free`. 출처: [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md), [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md), [S2.1 Pro 무료 API 블로그](https://fish.audio/blog/s2-1-pro-free-api/)(2026-06-23 게시, 이후 갱신). 조건은 다음과 같다.

- **무료 기간**: 블로그가 "2026-11-30까지"로 갱신돼 있다(블로그 본문의 삭제선 처리된 이전 문구는 7월 24일, 7월 말, 8월 31일이었다. 세 번 연장). **API 문서(Pricing 페이지)에는 종료일이 없고 "$0, 공정 사용 한도"만 있다.** 문서와 블로그가 다르므로 종료 후 가격과 동작은 정보 없음이다. 2026-10-04부터 약 8주 남았다. 2026-09-28판은 "무료"로만 적었다.
- 하드 글자 수 상한은 없고 공정 사용 정책이 적용된다. 공정 사용의 구체 수치는 정보 없음.
- SLA·지연 보장 없음.
- **데이터 보존: "요청이 모델 품질 개선에 쓰일 수 있다"**(블로그). 사용자가 쓴 대본이 학습에 쓰일 수 있다는 뜻이므로 비공개 대본에는 주의가 필요하다. 유료 모델의 같은 항목은 읽은 문서에 없다(정보 없음).
- 상업 이용: "일부 상업 시나리오에 제한이 있을 수 있고 연 매출 $1M 초과 제품은 사전 문의". 세부는 정보 없음.
- 계정 조건(잔액 0 계정, 전화 인증 등)에서 호출이 되는지는 정보 없음. `GET /wallet/self/api-credit?check_free_credit=true`의 `has_free_credit`이 무료 크레딧 수령 여부를 주지만 수치 의미는 문서에 없다.
- Fish 웹 앱에서 대본을 미리 듣는 방법은 별도 경로이고 API 문서에는 그 한도가 없다(정보 없음).

### 요율 제한

QPS/QPM이 아니라 **동시 요청 수(concurrency)** 기준이며, 누적 결제 금액에 따라 단계가 오른다.

| 등급 | 조건(누적 결제) | 동시 요청 상한 |
| --- | --- | --- |
| Starter | < $100 | 5 |
| Elevated | ≥ $100 | 15 |
| High Volume | ≥ $1,000 | 50 |
| Enterprise | 별도 계약 | 커스텀 |

한도는 계정의 모든 API 키가 공유한다. 429에는 `Retry-After` 헤더가 없고 지수 백오프로 재시도하라고 안내한다(2026-10-04 확인. 연결 확인 절의 "`Retry-After`는 명시 없음"과 같은 쪽). 문서는 QPS ≈ 동시성 ÷ 평균 요청 처리 시간(초), QPM ≈ 동시성 × 60 ÷ 평균 요청 처리 시간(초) 환산식을 제공한다(예: 동시성 5, 요청당 2초면 QPM 150, 요청당 60초면 QPM 5). [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md)

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

일반 오류 응답은 `{ "message": string, "status": number }`이지만, TTS 엔드포인트 개별 문서의 401/402/503 예시는 `status`, `message`, `reason` 세 필드로 설명해 **문서 간 응답 스키마가 완전히 일치하지 않는다.** 429·5xx만 지수 백오프로 재시도하고 나머지 4xx는 요청 자체를 고쳐야 한다고 안내한다. 422는 `{loc, type, msg, ctx, in}` 배열([agent skill](https://docs.fish.audio/.well-known/agent-skills/fish-audio-api/SKILL.md)), 본문 파싱이 실패한 요청은 평문 오류, 일부 엣지 413·5xx는 JSON이 아닐 수 있다(2026-10-04 확인). [Errors](https://docs.fish.audio/api-reference/errors), [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md)

## 한국어 지원

- `s1`(구형) 모델은 지원 언어를 명시적으로 나열하며 그 안에 한국어가 포함된다: "English, Chinese, Japanese, German, French, Spanish, Korean, Arabic, Russian, Dutch, Italian, Polish, Portuguese"(13개 언어).
- `s2-pro`는 "80개 이상 언어", `s2.1-pro`는 "83개 언어"와 자동 언어 감지를 지원한다. 2026-09-28 [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md) 원문을 직접 확인한 결과, 이 페이지에서 한국어를 이름으로 나열한 목록은 S1의 13개 언어뿐이고 S2 계열은 언어 수와 자동 감지만 적혀 있다. **S2 계열의 한국어 품질은 실제 청취로 확인해야 한다(미검증).** 2026-10-04: 공식 블로그([2026-06-23](https://fish.audio/blog/s2-1-pro-free-api/))는 S2.1 Pro의 83개 언어에 **Korean을 이름으로 포함**한다고 적는다(Models Overview에는 여전히 이름 나열이 없다). 품질은 여전히 미검증이다. 성우 쪽 한국어 지원은 `language=ko` 목록의 `languages`로 확인된다(위 "한국어 성우를 찾는 방법").
- 같은 원문에서 `s2.1-pro`를 운영 권장 모델로, `s2.1-pro-free`를 같은 모델·같은 언어 범위의 개발·테스트용 무료 모델(공정 사용 한도, TTFA·DPA 보장 없음)로 설명한다. S1은 기존 통합용으로 유지된다.
- 감정 태그 절은 "13개 지원 언어 전체에서 감정 마커 사용 가능"이라고 설명하는데, 이 "13개"가 `s1`의 13개 언어를 가리키는지 별도 기준인지는 문서에서 명확히 구분되지 않는다. [Choosing a model](https://docs.fish.audio/developer-guide/models-pricing/choosing-a-model.md), [Emotions](https://docs.fish.audio/developer-guide/core-features/emotions.md)

## 이 앱에 넣을 때 주의점

1. **서버 전용 키**: `FISH_AUDIO_API_KEY`는 서버에서만 `Authorization: Bearer` 헤더로 사용하고 클라이언트 번들·로그·응답에 노출하지 않는다. 기존 `X-API-KEY`(Typecast)·`xi-api-key`(ElevenLabs)와 헤더 이름·스킴이 다르므로 공급자 어댑터에서 분기해야 한다.
2. **모델은 헤더로, 성우는 바디로**: 기존 두 공급자는 모델이 body 필드였지만 Fish Audio는 `model` **요청 헤더**다. 공통 어댑터가 "모델 선택"을 항상 body 필드로 가정하고 있다면 이 예외를 처리해야 한다.
3. **과금 호출과 무료 호출 구분**: `POST /v1/tts`(생성), `POST /model`(클론 생성), 음성 인식은 명백히 과금 대상이다. `GET /model`·`GET /model/{id}`(목록·상세)는 요금표에 항목이 없고 명시적 "무료" 문구도 없다(**정보 없음**, 무료로 보는 것은 추정. 2026-09-28판은 "조회라 과금 대상이 아니다"라 적었다). 2026-09-30 재확인: 현재 OpenAPI는 둘 다 `BearerAuth`를 요구한다. 예전 판의 "인증 불필요" 표시는 바뀌었다. `GET /wallet/{user_id}/api-credit`은 계정 조회 성격이라 무료로 추정되나 문서에 명시적 확인 문구는 없다 — 실제 통합 시 이 호출도 과금 여부를 재확인하고, 자동 폴링으로 반복 호출하지 않는다.
4. **바이트 기준 사용량 계산**: 과금이 문자 수가 아닌 UTF-8 바이트다. 한글 대본의 예상 사용량 표시는 `text.length`가 아니라 `Buffer.byteLength(text, 'utf-8')` 같은 바이트 길이로 계산해야 한다.
5. **중복 요청 억제**: `POST /v1/tts` 응답이 청크 스트림이라 재전송·중복 클릭 시 서버가 멱등하게 처리한다는 보장이 문서에 없다. 기존 REQ-09가 요구하는 "중복 클릭은 생성 요청 1회"를 앱 쪽 요청 ID·버튼 잠금으로 직접 구현해야 한다.
6. **즉석 클로닝과 저장 클로닝 분리**: `references` 필드로 저장 없이 바로 클로닝해 합성할 수 있지만, 이 앱의 REQ-13(내 보이스)은 영속적인 클론 성우 관리를 요구하므로 초기 구현은 `POST /model`로 만든 저장된 `reference_id` 경로만 쓰고, 즉석 클로닝은 후속으로 분리하는 편이 요구사항과 맞는다.
7. **삭제 확인**: `DELETE /model/{id}`는 200만 성공을 뜻하며 별도 상태 전이(예: soft delete 유예)가 문서에 없다. REQ-13의 "삭제 대기 상태 유지·재확인" 요구를 만족하려면 앱 쪽에서 삭제 요청 후 `GET /model/{id}` 404 여부로 재확인하는 로직이 필요하다.

### 시험 생성 설정 분류 (제안, 2026-10-04)

분류는 이 앱을 위한 **제안**이며 공급자 API의 구분이 아니다. 대상은 성우 캐스팅 화면의 "Fish Audio 성우를 내 대본·언어·감정 설정으로 들어 보기"다.

| 구분 | 설정 | 값·근거 |
| --- | --- | --- |
| UI | 대본(`text`) | 필수. 글자 수와 UTF-8 바이트 수, 예상 비용(유료일 때)을 함께 보인다. 앱의 발음용 대본을 넣는 자리 |
| UI | 모델 | 2개만: `s2.1-pro-free`(무료, 한시), `s2.1-pro`(정식). 서버가 화이트리스트로 검사 |
| UI | 감정·톤 | 필드가 아니라 **태그 삽입 도우미**: 선택한 감정을 문장 맨 앞에 `[happy]` 꼴로 넣는다(S2 계열 문법). 기본 24종 + 톤 6종 정도를 고르게 하고, 강도는 `slightly`, `very` 수식어. 한 문장에 감정 1개(최대 3개) |
| UI | 속도(`prosody.speed`) | 0.5–2.0, 기본 1 |
| UI(고급) | 표현력(`temperature`) | 0–1, 기본 0.7 |
| UI | 언어 | **합성 필드가 아니다.** 화면의 "언어"는 (a) 성우 목록 거르기(`language=ko`), (b) 대본 언어 안내일 뿐이다. 합성 언어는 텍스트가 정한다 |
| 서버 | `model` 헤더 | 화이트리스트 값을 항상 명시한다(누락·오타가 유료 `s2.1-pro`가 된다) |
| 서버 | `reference_id` | 앱이 가진 성우 id(클라이언트가 임의 id를 보내지 못하게 서버가 카탈로그·`GET /model/{id}`로 확인) |
| 서버 | `format`·`mp3_bitrate`·`sample_rate`, `latency` | `mp3`·128·기본 샘플레이트(시험 생성용 청취). `latency`는 `normal`(품질 우선)로 명시(기본값이 문서마다 다르다) |
| 서버 | `chunk_length`·`min_chunk_length` | 기본값 충돌(300/200)이므로 한 값을 명시하거나 서버 기본을 쓴다. 선택은 스펙에서 정한다 |
| 서버 | `normalize`·`normalize_loudness` | 기본(true) 유지. 한국어 숫자·날짜는 정규화 대상이 아닐 수 있으므로 발음용 대본 단계에서 풀어 쓴다 |
| 서버 | `condition_on_previous_chunks`, `max_new_tokens`, `repetition_penalty`, `early_stop_threshold`, `top_p` | 기본값 유지(보내지 않음) |
| 쓰지 않음 | `references`(즉석 클로닝), `reference_id` 배열·`<\|speaker:N\|>`(다화자), `pronunciation_dictionary`·`<\|phoneme_start\|>`, `features`, `opus_bitrate`, `format=wav/pcm/opus`, `prosody.volume`, `s1`·`s2-pro`·`drama-3-preview`, WebSocket·`with-timestamp` | msgpack 필요, 클론은 별도 흐름, 후속, 한국어 미지원, 허용값 불명확, 시험 생성에 불필요, 두 가지 모델로 충분 |

### 시험 생성 주의점 (구현 인계, 2026-10-04)

1. **`model` 헤더 오타는 유료 처리다.** 헤더가 없거나 인식하지 못하면 `s2.1-pro`로 처리되고 오류가 없다. 무료 시험 생성이 조용히 유료가 될 수 있다. 서버에서 enum으로 검증하고 사용자 문자열을 그대로 넣지 않는다.
2. **무료 모델은 한시적이고 학습에 쓰일 수 있다.** 블로그 기준 2026-11-30까지이며 API 문서에는 종료일이 없다. 종료 여부와 이후 가격은 정보 없음이다. "시험 생성은 무료"를 앱의 전제로 박지 않고, 모델·가격을 설정으로 둔다. 대본이 모델 개선에 쓰일 수 있다는 점은 화면이나 문서에 적어 둔다.
3. **바이트 과금.** 한글은 3바이트라 같은 글자 수의 영어보다 3배 과금된다. 예상 사용량은 `text.length`가 아니라 UTF-8 바이트로 계산한다. 감정 태그 바이트의 과금 여부는 정보 없음이므로 포함해 센다.
4. **자동 테스트·브라우저 QA에서 부르지 않는다.** 시험 생성은 유료·공급자 상태 호출이다(무료 모델이라도 같다). 실제 호출은 사용자가 승인할 때만 한다. 단위 테스트는 요청 조립과 오류 매핑을 가짜 응답으로 확인한다.
5. **중복·재시도.** TTS 멱등성 문서가 없다. 버튼 잠금과 요청 id로 한 번만 보낸다. Fish 문서는 429·5xx 지수 백오프 재시도를 권하지만, 이 프로젝트 규칙은 유료 호출의 자동 재시도를 막으므로 자동 재시도는 하지 않고 사용자에게 다시 누르게 한다. 요율 제한은 동시 5건(Starter)이고 `Retry-After`가 없으므로 시험 생성을 동시에 하나만 허용하는 것으로 충분하다.
6. **입력 길이.** 문서 상한이 없으니 앱이 시험 생성용 상한을 정한다(짧은 대본). 오래 읽히는 대본은 비용(유료 모델)과 응답 시간에 영향이 있고 엣지 413 가능성도 있다.
7. **성우 거르기는 서버에서.** 목록 필터가 없어서 `type !== "tts"`(`svc`), `state !== "trained"`, `dmca_taken_down`, `pvc_release_state === "retiring"`을 응답에서 제외하거나 표시한다. page_size 100 안에서 걸러지면 개수가 줄어든다(실측한 `language=ko` 첫 100명은 전부 `tts`·`trained`·`public`·`dmca_taken_down=false`였다).
8. **성우 언어 정보는 불완전할 수 있다.** `languages`가 비어 있는 성우가 있을 수 있다(실측 첫 100명은 전부 `ko` 포함). 화면에서 `languages`를 "공급자 분류"로만 보이고 추정하지 않는다. 한국어 품질은 사용자가 듣고 판단한다.
9. **한국어 정규화·발음.** `normalize`는 영어·중국어용이고 한국어 phoneme·사전 표기가 없으니 숫자·영문 약어는 발음용 대본에서 한글로 풀어 쓴다.
10. **태그 문법은 모델에 묶인다.** S2 계열은 `[ ]`, `s1`은 `( )`. 서로 바꿔 쓰면 태그가 읽히거나 무시될 수 있으나 동작은 정보 없음이다. `s1`을 노출하지 않으면 분기가 생기지 않는다.
11. **샘플 오디오.** `samples[].audio`는 URL 문자열이다. 실측 호스트는 `platform.r2.fish.audio`(쿼리 없음)이고 만료 여부는 정보 없음이다. https 여부는 응답에서 확인해 현재 `previewUrl` 계약의 https 제한과 맞춘다. 샘플이 없는 성우가 있다(실측 4명). `default_text`와 샘플 `text`로 어떤 언어 샘플인지 짐작할 수 있다.
12. **남의 공개 성우의 이용 조건.** 상업·수익화 가능 여부, 성우 라이선스, 성우 삭제(`dmca_taken_down`, `retiring`) 시 동작은 읽은 문서에 없다. 유튜브 수익화에 쓸 경우 Fish Audio 이용약관과 성우별 라이선스를 별도로 확인해야 한다(정보 없음).
13. **오류 매핑.** 401 키 없음/무효, 402 잔액 부족, 403 권한 없음, 404 없는 성우, 429 한도, 503 과부하는 기존 `ProviderFailure` 사유로 옮길 수 있다. 본문 모양이 엔드포인트마다 다르다(`{message,status}` vs `{status,message,reason}` vs 422 배열 vs 평문). 방어적으로 파싱한다.
14. **응답은 청크 스트림.** 서버는 `fetch` 응답을 끝까지 받아 한 파일로 만든 뒤 클라이언트에 준다. 스트림 중간에 끊긴 경우의 상태(과금 포함)는 정보 없음이므로 결과 모름(`unknown_outcome`)으로 처리하는 것이 안전하다.

## 확인하지 못한 것 (미검증)

1. `s2.1-pro`/`s2-pro`의 83개/80+개 언어 전체 목록과 한국어 품질(원문에는 언어 수와 자동 감지만 있음. 블로그는 Korean을 이름으로 언급. 실제 청취 필요).
2. 클론 생성 입력 파일의 **파일 크기 상한**(MB/GB), 파일 개수 20개 초과 시 동작.
3. `PATCH /model/{id}`(모델 수정) 엔드포인트의 전체 요청 필드.
4. ~~발음 사전을 API로 생성/수정할 수 있는 엔드포인트 존재 여부~~ **해소(2026-10-04)**: OpenAPI 39개 경로에 없다. 웹 앱에서만 만든다.
5. `features` 배열에 허용되는 전체 기능 플래그 목록(확인된 예시는 `quality-guard` 하나뿐).
6. `chunk_length` 기본값이 300인지 200인지, `latency` 기본값이 `normal`인지 `balanced`인지(엔드포인트 문서·agent skill과 TTS 가이드·Python 타입이 다름. 2026-10-04에도 지속).
7. `GET /wallet/{user_id}/api-credit`·`GET /wallet/{user_id}/package` 호출 자체의 과금 여부에 대한 명시적 문서 문구. `api-credit`의 단위(USD 추정)와 웹 플랜 크레딧을 API에 쓸 수 없다는 공식 문구.
8. 클론(모델) 생성 자체의 요금 단가.
9. WebSocket `StartEvent.request`가 REST의 모든 필드(특히 `pronunciation_dictionary`, `features`)를 동일하게 지원하는지 개별 확인.
10. ~~감정 태그 전체 목록의 정확한 철자·개수~~ **해소(2026-10-04)**: 원문 표로 대조했다(감정 절).
11. `language` 필터의 공식 값 목록, `tag`의 전체 목록. 배열 싣기(반복 키)와 뜻(AND)은 2026-10-04에 실측했다(위 목록 절). 콤마 방식은 시험하지 않았다.
12. `score` 정렬의 산식, `window_limited`·`max_offset`·`accessible_upper_bound`의 공식 의미, `page_number` 11 이후 동작(실측은 `total` 1000, `max_offset` 1000, `window_limited` true).
13. 입력 `text`의 길이 상한, 최소 과금, 실패·중간 끊김 요청의 TTS 과금, 감정 태그 바이트의 과금 포함 여부.
14. `s2.1-pro-free`의 공정 사용 한도 수치, 잔액 0 계정에서의 동작, 2026-11-30 이후의 가격, 유료 모델의 데이터 보존 정책.
15. `unlist`·`retiring`·`dmca_taken_down` 성우를 남이 `reference_id`로 쓸 때의 동작, `state!=trained` 성우의 TTS 동작, PVC의 의미.
16. 한국어 텍스트에서 영어 태그와 한국어 태그의 동작, 성우 `languages`에 `ko`가 없을 때의 한국어 품질, 한국어 숫자 정규화.
17. `drama-3-preview`의 가격·언어·태그 문법, `prosody.volume` 범위.
18. 목록·상세 조회의 과금과 동시 요청 한도 포함 여부(요금표에 없을 뿐).
19. 남의 공개 성우의 상업 이용 조건과 성우별 라이선스(이용약관은 읽지 않음).
20. `samples[].audio` 주소(호스트 `platform.r2.fish.audio`, 쿼리 없음)의 만료 여부.

## 기존 Typecast/ElevenLabs와 비교해 다른 점

1. **모델 지정 위치**: Typecast·ElevenLabs는 body 필드(`model`/`model_id`)지만 Fish Audio는 HTTP 헤더(`model`)다. 공급자 어댑터의 "모델 선택 전송 위치" 추상화를 헤더까지 확장해야 한다.
2. **과금 단위**: 문자 수(Typecast `text` 길이, ElevenLabs character-cost)가 아니라 **UTF-8 바이트**다. 예상 사용량 표시 로직을 성우/제공자별로 분기해야 한다.
3. **성우 개념의 통합**: Typecast·ElevenLabs는 "성우(voice_id)"와 "모델(음성 합성 방식)"이 분리된 축이지만, Fish Audio는 클론으로 만든 성우 자체가 `type: "tts"`인 "모델(model)" 레코드다. 이 앱의 `공급자 분류`·`Model` 용어 매핑 시 Fish Audio의 "model"을 성우(Voice) 엔터티에 대응시켜야 하며, 동시에 `s1`/`s2-pro`/`s2.1-pro` 같은 합성 엔진 선택도 별도로 "모델(Model)" 개념으로 존재해 이름 충돌에 유의해야 한다.
4. **감정 제어 방식**: 세 공급자 모두 구조화 감정(Typecast v30 preset)·태그(ElevenLabs v3 텍스트 태그) 방식이 있지만, Fish Audio는 감정 강도(intensity) 숫자 필드가 아예 없고 전부 텍스트 인라인 태그(`[happy]`, `(break)` 등)로만 표현한다. 세 공급자 공통 "표현" UI를 만들 때 강도 슬라이더 같은 파라미터 UI는 Fish Audio에서 제공할 수 없다.
5. **생성/스트리밍 경로 수**: Typecast(일반/스트림/타임스탬프/컴포즈 4경로), ElevenLabs(convert/stream/timestamp/dialogue 등)와 달리 Fish Audio는 `POST /v1/tts` 단일 REST 경로가 청크 스트림 응답을 겸하고, 추가로 완전히 별도인 WebSocket(`wss://.../v1/tts/live`)까지 3번째 실시간 옵션을 둔다(2026-10-04: 타임스탬프용 SSE `POST /v1/tts/stream/with-timestamp`와 WebSocket `/v1/tts/live/with-timestamp`도 더 있다).
6. **클론 파일 개수·공개 단계**: Typecast 인스턴트 클론은 파일 1개, ElevenLabs IVC는 별도 계약이지만 Fish Audio는 한 번의 `POST /model` 요청에 **오디오 파일 최대 20개**를 첨부하고 `private`/`unlist`/`public` 3단계 공개 범위 값을 보낼 수 있다(2026-10-04: 생성 때 `public`은 private으로 낮춰진다). 또한 `references` 필드로 **모델을 저장하지 않는 즉석 클로닝**까지 TTS 요청 한 번에 지원하는 것은 두 기존 공급자에는 없는 경로다.

## 2026-10-04 재확인에서 바뀐 것

2026-09-28판 대비. 실측은 목록 조회 결과다.

| # | 항목 | 2026-09-28판 | 2026-10-04 |
| --- | --- | --- | --- |
| 1 | `s2.1-pro-free` 무료 기간 | "무료"로만 적음(공정 사용 한도, TTFA·DPA 보장 없음) | 공식 블로그에 **종료일 2026-11-30**(세 번 연장된 기록), 요청이 모델 개선에 쓰일 수 있음, 상업 이용 문구가 있음. API 문서에는 종료일이 없어 두 출처가 다름 |
| 2 | 한국어 이름 확인 | S2 계열은 언어 수만 있고 한국어를 이름으로 나열한 곳은 S1뿐, "미검증" | 블로그가 S2.1 Pro 83개 언어에 **Korean을 이름으로 포함**한다고 적음(Models Overview에는 여전히 없음). 품질은 여전히 미검증 |
| 3 | 감정 태그 목록 | WebFetch 요약, "철자·개수 미대조" | 원문 표로 대조: S2 기본 24 + 심화 25 + 톤 6(`[emphasis]` 포함) + 효과음 11 + 특수 5. S1은 톤 5·효과음 10. Models Overview의 S1 목록이 Emotion Control 페이지와 일부 다름 |
| 4 | 휴지 문법 | `(break)`, `(long-break)` 괄호를 S2 행 근처에 적음 | S2는 `[break]`, `[long-break]`(Emotion Control). 괄호 `(break)` 등은 Fine-grained Control의 V1.6 시절 표 |
| 5 | 발음 사전 API | "생성·수정 REST API 존재 여부 미확인"(미확인 4번) | OpenAPI 39개 경로에 없다. 웹 앱에서만 만든다. 값 형식도 영어·중국어·일본어뿐이라 **한국어 불가** |
| 6 | 한국어와 `normalize` | "영어·중국어 대상 정규화"만 | 한국어 phoneme·발음 사전 표기 없음이 확인됨. 한국어 숫자 정규화는 정보 없음 |
| 7 | `GET /model` 필터 | 필터 목록만. 목록·상세는 `security: []`라 인증 없이 호출 가능이라 적음 | `visibility`·`type`·`state` 쿼리가 **없다**는 점을 명시. `svc`·미학습 성우를 직접 거른다. SDK 기본 `sort_by=task_count`와 REST 기본 `score`가 다름. 목록·상세 모두 `BearerAuth` 필요 |
| 8 | 클론 `visibility` | 생성 때 `public`/`unlist`/`private` 선택 가능 | OpenAPI: 생성 때 `public`은 **private으로 낮춰진다**(웹 게시 흐름 사용). agent skill 문서는 기본값을 `public`이라 적어 문서끼리 어긋남. `enhance_audio_quality` 기본 true |
| 9 | 엔드포인트 | `POST /v1/tts`와 WebSocket `/v1/tts/live` | `POST /v1/tts/stream/with-timestamp`(SSE, 단어 단위 정렬)와 `/v1/tts/live/with-timestamp`(WebSocket)가 더 있다. `/v1/voice-design`도 있음(이 프로젝트 범위 밖) |
| 10 | 입력 길이 | 언급 없음 | 상한 없음을 재확인(`text`에 `maxLength` 없음, 문서 전체에 문장 없음). 엣지 413 가능성만 언급됨 |
| 11 | `chunk_length`·`latency` 기본값 | 충돌(300/200)만 | 지속. 엔드포인트 문서·skill은 300/`normal`, TTS 가이드는 200/`balanced`, Python 타입은 200. 서버에서 명시 권장 |
| 12 | `drama-3-preview` | enum 나열 | 가격·언어·태그 문법이 문서 어디에도 없음(정보 없음). 다화자는 지원 |
| 13 | 목록·상세 조회의 과금 | "조회라 과금 대상이 아니다" | 요금표에 항목이 없을 뿐 명시적 "무료" 문구는 없다. **정보 없음**(무료로 보는 것은 추정) |
| 14 | `references` | 즉석 클로닝 | **msgpack만 가능**(JSON 불가), 10~30초 권장 |
| 15 | `prosody` | `volume`은 dB 조절 | `volume` 범위는 문서에 없음. `normalize_loudness`는 S2 계열에서만 효과, `s1`은 받지만 효과 없음 |
| 16 | `language=ko` | 코드 값 추정(문서 예시는 `en`뿐) | **실측으로 확정**: 첫 100명 모두 `languages`에 `ko` 포함 |
| 17 | 응답 봉투 `max_offset`·`accessible_upper_bound`·`window_limited`·`total_is_exact` | 필드 이름만 적음 | 실측값 확인: `language=ko`·필터 없음 모두 `total` 1000, `max_offset` 1000, `accessible_upper_bound` 1000, `window_limited` true, `total_is_exact` false. 의미는 공식 설명 없음(최대 1,000명 창으로 보임, 추정) |
| 18 | 응답 속도·크기 | 언급 없음 | `language=ko` 100명 4.0초·응답 본문 163,272자. 필터 없음 100명 2.9초. `self=true` 0.4초, 0명 |
| 19 | `self=true` | 필터 설명만 | 이 계정의 내 성우는 0명 |
| 20 | 샘플 주소 | `samples[].audio`가 URL | 실측 호스트 `platform.r2.fish.audio` 97개(쿼리 없음), 샘플 없는 성우 4명. 만료 여부는 정보 없음 |
| 21 | 동일(재확인) | `model` 헤더 누락·오타는 `s2.1-pro`(유료) 폴백, 가격 $15/M bytes, 동시 요청 5/15/50, 오류 코드 | 변함없음 |

## 2026-10-05 T5 재확인과 구현 대조

무료 모델·생성 계약과 약관을 공식 문서에서 확인했다. API 호출은 하지 않았다.

| 항목 | 확인 및 구현에 반영한 값 | 출처 |
|---|---|---|
| `model` 헤더 기본값 | `/v1/tts`에서 헤더를 생략하거나 모르는 모델 이름을 보내면 유료 `s2.1-pro`로 처리될 수 있다. 앱은 `model` 헤더를 항상 명시한다 | [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [OpenAPI](https://api.fish.audio/openapi.json) |
| 무료 모델 조건 | `s2.1-pro-free`는 무료지만 공정 사용 한도·SLA 보장이 없고, 블로그가 무료 기간을 2026-11-30까지로 안내한다. 대본은 모델 개선에 쓰일 수 있고 상업 이용 조건에는 제한 문구가 있다. 무료 경로는 `model` 헤더에 이 이름을 지정하는 것이다 | [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md), [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md), [S2.1 Pro free API](https://fish.audio/blog/s2-1-pro-free-api/) |
| 요청 id·history | 네이티브 TTS는 문서화된 요청 id 응답 헤더, 멱등성 키, 생성 기록 조회 API가 없다. 응답을 못 받은 경우 실제 처리 여부를 조회할 수 없다. T5는 같은 소유자·요청 id 재전송을 공급자 호출 전에 막고, 알 수 없는 결과를 자동 재호출하지 않는다 | [OpenAPI](https://api.fish.audio/openapi.json), [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md) |
| 약관·보관 | Terms of Service에는 Content 저장 제한 문구가 있지만 생성 결과의 소유·서비스 내 재생 권한은 명확히 나뉘지 않는다. 명시적 보관 허용·금지로 단정할 수 없다. 무료 이용은 개인·비상업이며 학습 이용은 약관 일반 조항이다. T5는 결과를 30일 보관하고 사용자가 지운다([ADR 0003](../adr/0003-postgres-cache.md)) | [약관](https://fish.audio/terms/), [개인정보](https://fish.audio/privacy/), [요금제](https://fish.audio/plan/) |

이 프로젝트의 정상 Fish Audio 무료 모델 생성은 확인 창 없이 진행하고 무료 표식을 붙인다. 생성 완료 전에는 무료 모델이 종료됐는지 서버가 확인하며, 종료 뒤에는 공급자를 부르지 않는다. 같은 조합의 저장본 재생은 `trialFind`/`trialAudio`로 앱 DB에서 처리한다.

## T5 승인 무료 생성 실측 (2026-10-06)
- s2.1-pro-free, 공개성우 announcer Super Smash Bros, “오늘도 만나서 반가워요.”13코드포인트/33UTF-8바이트,속도1·표현력0.70·태그없음. model헤더명시/자동재시도없이1회성공.
- MP3 2.246438초/35,943바이트/44.1kHz mono128kbps. 앱저장·찾기/오디오조회바이트일치. 로컬전사문장내용일치(마침표생략),사용자청취확인아직없음.
- 직전/직후/지연조회 API충전잔액0,웹free크레딧10000 유지:관측차이0. API충전잔액0에서도이표본의무료모델은성공했다. 유료모델잔액사용(CS09)은아직검증전이다.
- 증거 tasks/evidence/T05/real-fish-04-result.json 및MP3/ASR파일. 무료기간/문장개선활용안내와API가격은2026-10-06공식페이지에서다시확인했다. 자동충전·다른모델생성0.

### T5 승인 유료 요청 실측 (2026-10-06)
- 같은성우·문장33UTF-8바이트·s2.1-pro 유료요청1회(공식$15/100만바이트로예상$0.000495). API충전잔액0/웹free크레딧10000에서공급자잔액부족으로거절됐다. 앱응답 BAD_GATEWAY502/data.reason quota다.
- 오디오생성없음, SDK/HTTP자동재시도0·충전0. 직전/직후/마지막조회 API0·웹10000유지(관측차감0).
- 현재free웹크레딧만으로이계정의해당유료API요청을처리하지못했다. 다른웹플랜으로일반화하지않는다. 성공한유료요청의실제차감위치/최소과금단위는확인하지못했으므로 CS09는부분확인으로남긴다.
- 증거 tasks/evidence/T05/real-fish-05-result.json. 승인된5회실험은끝났으며충전뒤성공실측은사용자의추가승인이필요하다.

## 성우 한 명 조회 (2026-10-07, T7 성우 보관함 이용 가능 확인)

공식 [Get Model](https://docs.fish.audio/api-reference/endpoint/model/get-model.md), agent skill 문서, [Pricing & Rate Limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits.md)를 읽었다. 공급자 API는 부르지 않았다. 이 API가 모델이라 부르는 개체를 이 앱은 성우로 부른다.

| 항목 | 내용 |
| --- | --- |
| 호출 | `GET /model/{id}`(헤더 `Authorization: Bearer`). 응답은 목록과 같은 `ModelEntity`라 `rawVoiceSchema` → `fishVoice(raw, source)`를 쓴다. REST `getJson`(`redirect: "error"`)에 `/model/${encodeURIComponent(id)}` |
| 없음 판정 | 404와 403을 "없음"으로 본다(문서: 404 "Nothing matches the given URI", 403 "Request forbidden". 안 보이는 성우는 404라고 agent skill이 적는다. 남의 `private`·`unlist` 모델의 실제 응답은 문서에 명시가 없다). 응답이 왔어도 `fishVoice`가 `null`이면(합성할 수 없는 성우: 학습 전·삭제 요청·공개 출처인데 비공개) 같은 "없음"이다. 목록이 거르는 규칙과 같아 행과 보관함이 어긋나지 않는다. 401·429·5xx와 그 밖의 오류는 공급자 오류다. 판정은 `nullOnStatus(…, 403, 404)`다 |
| 과금 | 요금표(TTS, ASR, Voice Design)에 `GET /model/{id}` 항목이 없고 "무료" 문구도 없다 = 정보 없음(무료로 보는 것은 추정). 목록 조회와 같은 읽기 호출로 다룬다 |
| 요청 제한 | 동시 요청 수 한도(Starter 5)이고 429에 `Retry-After`가 없다. 앱은 공급자당 동시 2건으로 부르고, 429면 60초를 적고 그 공급자를 멈춘다 |
| 시간 제한 | 목록의 20초가 아니라 `runList` 기본 10초다 |
| 샘플 주소 | `samples[].audio`(호스트 `platform.r2.fish.audio`)의 만료는 정보 없음이다. 확인에 성공하면 새 값으로 바뀐다 |
