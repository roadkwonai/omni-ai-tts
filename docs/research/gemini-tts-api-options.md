# Gemini TTS API 옵션 정리

- 확인: 2026-10-07. 공식 문서·가격 페이지·공식 블로그·npm 패키지 소스만 읽었다. Google API는 키로 부르지 않았다(키 없음). 공개 샘플 파일 2개에 HEAD·GET 요청만 보냈다(과금 없음).
- 아래 본문의 `(D번호)`는 이 목록의 URL이다. 괄호 안 날짜는 문서의 'Last updated'다.
- 공식이 아닌 출처는 쓰지 않았다. 문서에서 확인하지 못한 값은 "정보 없음"이다.
- 감정 태그는 다른 네 공급자와 함께 [tts-emotion-tags](tts-emotion-tags.md)에서 비교한다.
- 이 앱 쪽 근거는 저장소 파일 경로로 적었다(`.claude/skills/tts-provider/SKILL.md`, `docs/adr/0002-orpc-only-api.md`, `docs/plans/implementation-roadmap.md`, `packages/api/src/providers/*.ts`, `packages/api/src/trial.ts`).

**읽은 문서**

| 번호 | 문서 | URL |
|---|---|---|
| D1 | Gemini API 음성 생성(TTS) 안내 (2026-10-01) | https://ai.google.dev/gemini-api/docs/speech-generation |
| D2 | 모델 `gemini-3.8-flash-tts` (2026-09-30) | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts |
| D3 | 모델 `gemini-3.8-flash-lite-tts` (2026-09-30) | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-lite-tts |
| D4 | 모델 `gemini-3.1-flash-tts-preview`(2026-09-24), `gemini-2.5-pro-preview-tts`(2026-08-18) | https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-tts-preview , https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro-preview-tts |
| D5 | 종료 일정 (2026-10-07) | https://ai.google.dev/gemini-api/docs/deprecations |
| D6 | 릴리스 노트 (2026-10-07) | https://ai.google.dev/gemini-api/docs/changelog |
| D7 | Voice design (2026-09-24) | https://ai.google.dev/gemini-api/docs/voice-design |
| D8 | Voice replication (2026-09-24) | https://ai.google.dev/gemini-api/docs/voice-replication |
| D9 | Voices API 참조 (2026-10-07) | https://ai.google.dev/api/voices |
| D10 | Interactions API 참조 (2026-10-06) | https://ai.google.dev/api/interactions-api |
| D11 | Interactions 개요(저장·보관 기간) (2026-10-01) | https://ai.google.dev/gemini-api/docs/interactions-overview |
| D12 | Gemini API 가격 (2026-10-07) | https://ai.google.dev/gemini-api/docs/pricing |
| D13 | 요청 제한 (2026-09-02) | https://ai.google.dev/gemini-api/docs/rate-limits |
| D14 | 결제(Prepay·Postpay) (2026-09-28) | https://ai.google.dev/gemini-api/docs/billing |
| D15 | API 오류 (2026-09-20) | https://ai.google.dev/gemini-api/docs/api-errors |
| D16 | 문제 해결(재시도 권장) (2026-10-01) | https://ai.google.dev/gemini-api/docs/troubleshooting |
| D17 | 토큰 세기 (2026-09-23), countTokens 참조 | https://ai.google.dev/gemini-api/docs/tokens , https://ai.google.dev/api/tokens |
| D18 | Gemini API 추가 약관 (2026-04-28) | https://ai.google.dev/gemini-api/terms |
| D19 | 이용 가능 지역 (2026-04-28) | https://ai.google.dev/gemini-api/docs/available-regions |
| D20 | Cloud Text-to-Speech의 Gemini-TTS (2026-10-07) | https://cloud.google.com/text-to-speech/docs/gemini-tts |
| D21 | Cloud Text-to-Speech 가격 | https://cloud.google.com/text-to-speech/pricing |
| D22 | Cloud Text-to-Speech 할당량 (2026-10-07) | https://cloud.google.com/text-to-speech/quotas |
| D23 | Cloud TTS 성우 목록(한국어 Chirp 3 HD 샘플) (2026-10-07) | https://cloud.google.com/text-to-speech/docs/list-voices-and-types |
| D24 | Chirp 3 Instant Custom Voice (2026-10-07) | https://cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice |
| D25 | Gemini Enterprise(옛 Vertex AI) Gemini TTS (2026-10-06) | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/overview |
| D26 | Gemini Enterprise TTS 이전 안내 (2026-10-06) | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/text-to-speech/migration-guide |
| D27 | Google 블로그: Gemini 3.8 Flash TTS·Flash-Lite TTS (2026-09-23) | https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-8-text-to-speech/ |
| D28 | Google 블로그: Gemini 3.1 Flash TTS (2026-04-15) | https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-tts/ |
| D29 | npm `@google/genai` 2.27.0 패키지 소스(`dist/node/index.mjs`, `dist/genai.d.ts`), 2026-10-02 게시 | https://registry.npmjs.org/@google/genai/-/genai-2.27.0.tgz |

## 1. 연결 (권장 경로: Gemini API)

| 항목 | 값 |
|---|---|
| 호스트 | `https://generativelanguage.googleapis.com` (D1, D9) |
| 인증 | 헤더 `x-goog-api-key: <키>` (D1 REST 예시) |
| 합성 | `POST /v1beta/interactions` (D1). 모델 문서는 `generateContent`의 `speech_metadata`도 적어 두었지만 TTS 안내의 예시는 모두 Interactions다 (D2) |
| 성우 | `GET /v1beta/voices`(목록), `GET /v1beta/voices/{id}`(한 명), `POST /v1beta/voices`(디자인·복제), `DELETE /v1beta/voices/{id}` (D9). Voices API는 Beta다 (D9) |
| SDK | `@google/genai` 2.24.0 이상 (D1). 이 앱에는 REST `fetch`를 권한다(12절) |
| 이용 지역 | South Korea는 이용 가능 국가 목록에 있다 (D19) |

## 2. 호출 경로 비교

| 항목 | Gemini API (generativelanguage) | Gemini Enterprise API (옛 Vertex AI, aiplatform) | Cloud Text-to-Speech의 Gemini-TTS |
|---|---|---|---|
| 3.8 TTS 모델 | `gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts` GA (D5, D6) | 같은 두 모델이지만 Preview (D20, D25) | 3.8 없음. "Cloud Text-to-Speech API로는 쓸 수 없다" (D20) |
| 그 밖의 모델 | `gemini-3.1-flash-tts-preview`, `gemini-2.5-pro-preview-tts`, `gemini-2.5-flash-preview-tts` (모두 Preview, 종료 예정) (D5) | `gemini-3.1-flash-tts-preview`, `gemini-2.5-pro-tts`, `gemini-2.5-flash-tts` 등 (D25) | `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-tts`, `gemini-2.5-flash-lite-preview-tts`, `gemini-2.5-pro-tts` (D20) |
| 인증 | API 키 (D1) | Application Default Credentials(서비스 계정 등) (D25). API 키 방식은 정보 없음 | 인증 설정 + `aiplatform.endpoints.predict` 권한(`roles/aiplatform.user`) + 결제 사용 설정 (D20) |
| 출력 형식 | 단건: WAV(기본, 24kHz 모노 16비트). 그 밖에 `audio/l16`, `audio/mulaw`, `audio/alaw`. `sample_rate` 24000·16000·8000 지정 가능. MP3·Ogg 없음 (D1) | WAV(기본)·L16·MULAW·ALAW. 표본 주파수 지정 불가. "MP3와 Ogg Opus는 지원하지 않는다", "클라이언트에서 인코딩하라" (D25, D26) | 단건: LINEAR16(기본), ALAW, MULAW, **MP3**, **OGG_OPUS**, PCM (D20) |
| 성우 목록 API | 있음. `GET /v1beta/voices`, 언어·성별·피치·억양·페르소나·맥락·유형·검색 필터 (D1, D9) | 있음. 단 유형·검색 외 필터(`language_code`, `gender` 등)는 `INVALID_ARGUMENT` (D25) | Cloud TTS `voices.list` 문서는 이번에 읽지 않았다. 정보 없음 |
| 지역 | 이용 가능 국가 제한(한국 포함) (D19) | 3.8은 `global`만 (D25) | `global`, `us`, `eu`, `northamerica-northeast1`(모델별 다름) (D20) |
| 가격(3.8 Flash, 표준) | 입력 $0.50/1M 텍스트 토큰, 출력 $9.00/1M 오디오 토큰(2026-12-31까지). 2027-01-01부터 $1.00·$18.00 (D12) | Cloud TTS 가격표에 "Gemini 3.8 Flash TTS (Preview)" 같은 단가 (D21) | 3.8 없음. 2.5 Flash TTS 입력 $0.50·출력 $10.00, 3.1 Flash TTS 입력 $1.00·출력 $20.00 (D21) |
| 무료 등급 | 있음. 3.8 두 모델의 표준·Priority 무료 등급 "Free of charge". 무료 등급 데이터는 제품 개선에 쓰임 (D12) | Gemini-TTS 무료 사용량 "Not available" (D21) | "Not available" (D21) |
| 입력 상한 | 입력 8,192 토큰 (D2, D3) | 입력 8,192 토큰 (D20) | `text`·`prompt` 각 4,000바이트, 합 8,000바이트 (D20) |
| 3.8 음성 디자인·복제 | 있음 (D1, D7, D8) | 있음(Preview) (D25) | 없음(3.8 미제공). Chirp 3 Instant Custom Voice는 허용 목록 사용자만 (D24) |

판단: 이 앱(API 키 하나, REST, Vercel 서버리스)에는 **Gemini API 경로**가 맞다. GA 모델이 있고 키 하나로 부를 수 있으며 성우 목록 API와 필터가 가장 넓다. MP3가 필요하면 Cloud TTS 경로가 유일하지만 3.8이 없고 서비스 계정·IAM이 필요하다.

## 3. 모델

| 모델 id | 상태 | 출시 | 종료 | 비고 |
|---|---|---|---|---|
| `gemini-3.8-flash-tts` | GA (D6 "generally available") | 2026-09-22 (D5, D6). 블로그 게시는 2026-09-23 (D27) | 발표 없음 (D5) | 최고 품질. 130개 언어. 단일·다화자·디자인·복제 (D1, D2) |
| `gemini-3.8-flash-lite-tts` | GA (D6) | 2026-09-22 (D5) | 발표 없음 (D5) | 빠르고 싸다. 101개 언어. `gemini-3.1-flash-tts-preview`의 대체 (D3) |
| `gemini-3.1-flash-tts-preview` | Preview | 2026-02-26(D5 표), 블로그 2026-04-15 (D28) | 2026-11-17 (D5) | 대체: 3.8 두 모델 (D5) |
| `gemini-2.5-pro-preview-tts` | Preview | 2025-05-20 | 2026-11-17 (D5) | |
| `gemini-2.5-flash-preview-tts` | Preview | 2025-05-20 | 2026-11-17 (D5) | 2.5 계열은 2026-09-18부터 기존 사용자에게만 열림 (D6) |

- 2026-10-07 기준 최신은 3.8 두 모델이다. 3.1·2.5 TTS는 2026-11-17 종료 예정이라 새로 붙일 이유가 없다.
- 3.8 모델은 `temperature`·`topP`·`topK`를 `INVALID_ARGUMENT`로 거절한다(Enterprise 이전 안내) (D26). 숫자로 조절하는 속도·높낮이 옵션은 문서에 없다. 속도와 높낮이는 `speech_metadata.style` 문장으로 지시한다 (D1).

## 4. 성우와 샘플

### 4-1. 미리 만든 성우 30명 (D1, 성별은 D20)

| 이름 | 문서의 성격 | 성별(D20) | | 이름 | 문서의 성격 | 성별(D20) |
|---|---|---|---|---|---|---|
| Zephyr | Bright | 여 | | Algenib | Gravelly | 남 |
| Puck | Upbeat | 남 | | Rasalgethi | Informative | 남 |
| Charon | Informative | 남 | | Laomedeia | Upbeat | 여 |
| Kore | Firm | 여 | | Achernar | Soft | 여 |
| Fenrir | Excitable | 남 | | Alnilam | Firm | 남 |
| Leda | Youthful | 여 | | Schedar | Even | 남 |
| Orus | Firm | 남 | | Gacrux | Mature | 여 |
| Aoede | Breezy | 여 | | Pulcherrima | Forward | 여 |
| Callirrhoe | Easy-going | 여 | | Achird | Friendly | 남 |
| Autonoe | Bright | 여 | | Zubenelgenubi | Casual | 남 |
| Enceladus | Breathy | 남 | | Vindemiatrix | Gentle | 여 |
| Iapetus | Clear | 남 | | Sadachbia | Lively | 남 |
| Umbriel | Easy-going | 남 | | Sadaltager | Knowledgeable | 남 |
| Algieba | Smooth | 남 | | Sulafat | Warm | 여 |
| Despina | Smooth | 여 | | | | |
| Erinome | Clear | 여 | | | | |

- D20의 성별 표는 Cloud TTS Gemini-TTS 문서의 것이다. Gemini API 문서(D1)에는 성별이 없다. 목록 API 응답의 `gender`로 다시 확인해야 한다.

### 4-2. 성우 목록 API (D1, D9)

- `GET /v1beta/voices`. 프로젝트에 저장한 맞춤 성우(최신순)를 먼저, 그 뒤에 미리 만든 성우·확장 성우 라이브러리를 돌려준다 (D9).
- 필터: `language_code`, `region_code`, `accent`, `gender`, `pitch`(`low`·`medium`·`high`), `persona`, `context`, `type`(`prebuilt`·`prompted`·`replicated`), `search`(2,048바이트까지), `page_size`(기본 50, 최대 1,000), `page_token`. 한 필터 안의 여러 값은 OR, 서로 다른 필터는 AND (D1, D9).
- 응답 필드: `id`, `display_name`, `description`, `gender`, `pitch`, `accent`, `persona`, `context`, `language_code`, `region_code`, `type`, `model`, `expire_time` (D9). 미리 만든 성우의 `id`는 이름(예 `Puck`)이고 맞춤 성우는 `voice_…`다 (D9).
- 확장 성우 라이브러리의 크기는 문서마다 다르다: "hundreds"(D1), "150+ prebuilt and custom voices"(D6), "more than 2,000"(D25, D27).
- 이 목록 호출의 과금 문구는 문서에 없다(무료라고 명시하지도 않는다).

### 4-3. 과금 없는 기본 샘플

- **API에는 미리 만든 성우의 샘플이 없다.** `sample_audio`는 디자인한 성우(`prompted`)의 `CreateVoice`·`GetVoice` 응답에만 있고, `ListVoices`에는 없으며 `prebuilt`·`replicated` 성우에는 비어 있다 (D7, D9).
- 공개 문서에 걸린 정적 샘플은 있다. 둘 다 서명·만료 없는 고정 주소이고 Google 문서 자산이다(API 약속이 아니다).

| 출처 | 주소 모양 | 2026-10-07 확인 | 주의 |
|---|---|---|---|
| Cloud TTS Gemini-TTS 문서의 'Voice options' 데모 (D20) | `https://docs.cloud.google.com/text-to-speech/docs/audio/chirp3-hd-<소문자 이름>.wav` (`cloud.google.com/static/…`은 301로 이 주소로 간다) | `chirp3-hd-kore.wav` 200, `audio/vnd.wave`, 564,524바이트, `cache-control: no-cache, must-revalidate` | 파일 이름이 Chirp 3 HD다. Aoede는 `chirp3-hd-aoeda.wav`(철자 다름). 샘플 언어는 정보 없음 |
| Cloud TTS 성우 목록의 한국어 Chirp 3 HD 샘플 (D23) | `https://docs.cloud.google.com/text-to-speech/docs/audio/ko-KR-Chirp3-HD-<이름>.wav` | 30명 모두 문서에 있다. `Kore` 240,044바이트, `Zephyr` 243,884바이트, 200 | **Chirp 3 HD 모델의 한국어 음성이지 Gemini 3.8의 출력이 아니다.** D20은 Gemini-TTS 성우를 "Chirp 3: HD 성우와 비슷한(similar)" 것이라고만 쓴다 |

- 확장 성우 라이브러리의 성우(수백~2,000명)에는 공개 샘플이 없다.
- AI Studio(`https://aistudio.google.com/generate-speech`)에서 들어볼 수 있지만 로그인한 화면이라 앱에서 재생할 주소가 아니다 (D1).

## 5. 한국어

- 지원 표: Korean이 `gemini-3.8-flash-tts`·`gemini-3.8-flash-lite-tts` 모두 ✔ (D1). Cloud TTS의 Gemini-TTS(2.5·3.1) 언어 표: Korean (South Korea) `ko-KR` **GA** (D20).
- 언어 지정: "TTS 모델은 입력 언어를 자동으로 감지한다" (D1). Interactions의 `generation_config.speech_config[].language`("The language of the speech")가 있다. 값 형식 설명은 없다 (D10). Enterprise `generateContent`는 `generationConfig.speechConfig.languageCode`(D26).
- 비영어 대본에도 태그는 영어로 쓴다: "If your transcript is in a non-English language, continue to use English inline tags for best results." (D1)
- 품질 관련 문구: 블로그의 Voice Arena 상위 언어 목록은 일본어, 브라질 포르투갈어, 베트남어, 표준 아랍어, 멕시코 스페인어, 힌디어이고 한국어는 없다 (D27). 한국어 품질 수치는 정보 없음.
- 성우 목록에서 한국어 성우만 고르려면 `language_code=ko-KR`을 쓴다(Gemini API) (D1, D9). 한국어 성우가 몇 명인지는 정보 없음(키 없이 확인 불가).
- 복제 동의 문장에 한국어(`ko-KR`)가 있다: "나는 이 음성의 소유자이며 구글이 이 음성을 사용하여 음성 합성 모델을 생성할 것을 허용합니다." (D8)

## 6. 감정·말투 제어

### 6-1. 방식 (3.8, D1)

| 범위 | 넣는 곳 | 예 |
|---|---|---|
| 한 차례(turn) 전체에 이어지는 감정·말투·속도·높낮이·음량 | `content[].annotations[]`의 `{"type": "speech_metadata", "style": "…"}` | `"whispered urgently"`, `"speaking slowly"` |
| 한 지점의 비언어 소리·쉼 | 대본 안 꺾쇠 태그 `<…>` | `Wait... <short pause> did you hear that? <sigh>` |
| 다화자 맞장구·겹침 | 대본 안 `\|…\|` | `\|oh hmm\|` |
| 강조 | 낱말을 대문자로 | `VERY` (한글에는 해당 없음) |

- 3.8은 `text`를 "그대로 읽을 대본(verbatim transcript)"으로 다룬다. "Say cheerfully:" 같은 지시를 대본에 쓰면 읽힐 수 있다 (D1, D2).
- 다화자: 한 요청에 미리 만든 성우 2명까지. 차례마다 `speech_metadata.speaker`를 적는다. 맞춤 성우(`voice_…`)를 섞으려면 화자별로 따로 합성해 이어 붙인다 (D1). Enterprise는 "정확히 2명"이라고 쓴다 (D25).
- 문서 권장: 대부분의 요청은 `style`을 비워 두고, 필요한 차례에만 짧은 문장을 쓴다. 나이·성별·억양 같은 바뀌지 않는 특징은 `style`에 넣지 않는다 (D1).
- 모순: D1의 권장 태그에 `<whispers>`·`<whispering>`이 있지만, 같은 문서와 D2는 "속삭임 같은 말투는 `speech_metadata.style`에 둔다"고 쓴다.

### 6-2. 대본 태그 표

3.8 꺾쇠 태그는 문서에 태그별 설명이 없다. 설명 칸은 태그 낱말의 뜻을 옮긴 것이다. D1은 이 목록을 "권장(non-exhaustive)"이라고 한다.

| 대본에 넣는 문자열 | 분류 | 뱃지 이름 | 설명(한 줄) | 지원 모델·경로 | 출처 |
|---|---|---|---|---|---|
| `<argh>` | 비언어·효과음 | 으악 | 짜증·고통의 외마디 | 3.8 두 모델 / Gemini API | D1 |
| `<breath>` | 비언어·효과음 | 숨소리 | 숨 쉬는 소리 | 3.8 두 모델 / Gemini API | D1, D2 |
| `<heavy breath>` | 비언어·효과음 | 거친 숨 | 거칠게 숨 쉬는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<exhales>` | 비언어·효과음 | 숨 내쉼 | 숨을 내쉬는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<cackle>` | 비언어·효과음 | 높은 웃음 | 높고 날카롭게 웃는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<cheer>` | 비언어·효과음 | 환호 | 환호하는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<chuckle>` / `<chuckles>` | 비언어·효과음 | 킥킥 | 작게 웃는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<cough>` | 비언어·효과음 | 기침 | 기침 소리 | 3.8 두 모델 / Gemini API·Enterprise | D1, D2 |
| `<cry>` | 비언어·효과음 | 울음 | 우는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<gasp>` | 비언어·효과음 | 헉 | 놀라 숨을 들이켜는 소리 | 3.8 두 모델 / Gemini API | D1, D27 |
| `<giggle>` | 비언어·효과음 | 키득 | 키득거리는 웃음 | 3.8 두 모델 / Gemini API | D1 |
| `<groan>` | 비언어·효과음 | 끙 신음 | 낮게 앓는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<growl>` | 비언어·효과음 | 으르렁 | 으르렁거리는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<grunt>` | 비언어·효과음 | 끙 | 짧게 힘주는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<grr>` | 비언어·효과음 | 그르르 | 으르렁 의성어 | 3.8 두 모델 / Gemini API | D1 |
| `<hiss>` | 비언어·효과음 | 쉬익 | 쉬익 하는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<laugh>` / `<laughter>` | 비언어·효과음 | 웃음 | 웃는 소리 | 3.8 두 모델 / Gemini API·Enterprise | D1, D26 |
| `<moan>` | 비언어·효과음 | 앓는 소리 | 신음하는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<pant>` | 비언어·효과음 | 헐떡임 | 숨을 헐떡이는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<pff>` / `<phew>` | 비언어·효과음 | 휴 | 안도·허탈의 숨소리 | 3.8 두 모델 / Gemini API | D1 |
| `<scream>` | 비언어·효과음 | 비명 | 비명 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<shout>` | 비언어·효과음 | 외침 | 소리치는 외마디 | 3.8 두 모델 / Gemini API | D1 |
| `<shriek>` | 비언어·효과음 | 새된 비명 | 날카로운 비명 | 3.8 두 모델 / Gemini API | D1 |
| `<sigh>` / `<sighs>` | 비언어·효과음 | 한숨 | 한숨 소리 | 3.8 두 모델 / Gemini API·Enterprise | D1, D26 |
| `<sneeze>` | 비언어·효과음 | 재채기 | 재채기 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<snicker>` | 비언어·효과음 | 비웃음 | 킬킬 비웃는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<snort>` | 비언어·효과음 | 코웃음 | 코로 흥 하는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<sob>` | 비언어·효과음 | 흐느낌 | 흐느껴 우는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<throat-clearing>` | 비언어·효과음 | 헛기침 | 목을 가다듬는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<tsk>` | 비언어·효과음 | 쯧 | 혀 차는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<whimper>` | 비언어·효과음 | 훌쩍임 | 낑낑·훌쩍이는 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<whispers>` / `<whispering>` | 말투·전달 | 속삭임 | 속삭이는 소리. 지속되는 속삭임은 `style`에 두라고 함(6-1 모순) | 3.8 두 모델 / Gemini API | D1 |
| `<yawn>` | 비언어·효과음 | 하품 | 하품 소리 | 3.8 두 모델 / Gemini API | D1 |
| `<short pause>` | 쉼·속도 | 짧은 쉼 | 그 자리에서 짧게 쉰다 | 3.8 두 모델 / Gemini API·Enterprise | D1, D26 |
| `<long pause>` | 쉼·속도 | 긴 쉼 | 그 자리에서 길게 쉰다 | 3.8 두 모델 / Gemini API | D1 |
| `\|oh hmm\|` 꼴 (`\|반응\|`) | 기타 | 맞장구 | 다화자에서 듣는 쪽의 짧은 반응·겹친 말 | 3.8(겹침은 `gemini-3.8-flash-tts`가 가장 낫다) / Gemini API | D1 |
| 대문자 낱말 (예 `VERY`) | 억양·발음 | 강조 | 대문자 낱말에 강세. 한글 대본에는 쓸 수 없다 | 3.8 / Gemini API | D1 |
| `[sigh]` | 비언어·효과음 | 한숨 | 한숨을 넣는다(신뢰도 High) | 2.5·3.1 / Cloud TTS(Preview 기능). 3.8에서는 꺾쇠로 바꾸라고 함 | D20, D26 |
| `[laughing]` | 비언어·효과음 | 웃음 | 웃음을 넣는다 | 2.5·3.1 / Cloud TTS | D20 |
| `[laughs]` | 비언어·효과음 | 웃음 | 3.1 예시 문장에만 나오고 태그 표에는 없다 | 3.1 / Cloud TTS | D20 |
| `[uhm]` | 비언어·효과음 | 머뭇거림 | 머뭇거리는 소리. 3.8에서는 대본에 "uhm"을 그대로 쓰라고 함 | 2.5·3.1 / Cloud TTS | D20, D26 |
| `[sarcasm]` | 말투·전달 | 비꼼 | 뒤 구절을 비꼬는 말투로 | 2.5·3.1 / Cloud TTS | D20 |
| `[robotic]` | 말투·전달 | 로봇 말투 | 뒤 구절을 로봇처럼 | 2.5·3.1 / Cloud TTS | D20 |
| `[shouting]` | 말투·전달 | 외침 | 뒤 구절의 음량을 키운다 | 2.5·3.1 / Cloud TTS | D20 |
| `[whispering]` | 말투·전달 | 속삭임 | 뒤 구절의 음량을 줄인다 | 2.5·3.1 / Cloud TTS | D20 |
| `[extremely fast]` | 쉼·속도 | 아주 빠르게 | 뒤 구절을 빠르게 | 2.5·3.1 / Cloud TTS | D20 |
| `[scared]` | 감정 | 겁먹음 | 낱말 "scared"가 **읽히고** 문장이 겁먹은 말투가 됨 | 2.5·3.1 / Cloud TTS | D20 |
| `[curious]` | 감정 | 궁금함 | 낱말이 **읽히고** 궁금한 말투 | 2.5·3.1 / Cloud TTS | D20 |
| `[bored]` | 감정 | 지루함 | 낱말이 **읽히고** 지루한 말투 | 2.5·3.1 / Cloud TTS | D20 |
| `[short pause]` | 쉼·속도 | 짧은 쉼 | 약 250ms 쉼 | 2.5·3.1 / Cloud TTS | D20 |
| `[medium pause]` | 쉼·속도 | 중간 쉼 | 약 500ms 쉼 | 2.5·3.1 / Cloud TTS | D20 |
| `[long pause]` | 쉼·속도 | 긴 쉼 | 약 1000ms 이상 쉼 | 2.5·3.1 / Cloud TTS | D20 |

### 6-3. `speech_metadata.style` 예 (대본이 아니라 `style`에 넣는 값, 3.8, D1)

| 넣는 문자열 | 분류 | 뱃지 이름 | 설명(한 줄) | 지원 모델·경로 | 출처 |
|---|---|---|---|---|---|
| `cheerful and friendly` | 감정 | 밝고 친근 | 밝고 다정하게 | 3.8 / Gemini API | D1 |
| `calm and relaxed` | 감정 | 차분 | 차분하고 느긋하게 | 3.8 / Gemini API | D1 |
| `warm and enthusiastic` | 감정 | 따뜻·열정 | 따뜻하고 열의 있게 | 3.8 / Gemini API | D1 |
| `angry tone` | 감정 | 화남 | 화난 말투 | 3.8 / Gemini API | D1 |
| `sarcastic` | 말투·전달 | 비꼼 | 비꼬는 말투 | 3.8 / Gemini API | D1 |
| `whispered urgently` | 말투·전달 | 다급한 속삭임 | 다급하게 속삭이며 | 3.8 / Gemini API | D1 |
| `muttering` | 말투·전달 | 중얼거림 | 중얼거리며 | 3.8 / Gemini API | D1 |
| `out of breath` | 말투·전달 | 숨참 | 숨이 찬 상태로 | 3.8 / Gemini API | D1 |
| `speaking rapidly` / `speaking slowly` | 쉼·속도 | 빠르게·느리게 | 그 차례 전체의 말 빠르기 | 3.8 / Gemini API | D1 |
| `high pitch, cheerful and excited inflection` | 억양·발음 | 높은 억양 | 높은 음, 들뜬 억양 | 3.8 / Gemini API | D1 |
| `monotone and flat` | 억양·발음 | 단조 | 높낮이 없이 | 3.8 / Gemini API | D1 |
| `casual, friendly` | 말투·전달 | 편한 말투 | 가볍고 친근하게(대화 기본값으로 권장) | 3.8 / Gemini API | D1 |

## 7. 상한

| 항목 | 값 | 출처 |
|---|---|---|
| 입력 | 8,192 토큰(3.8 두 모델, 3.1, 2.5 Pro 모두) | D2, D3, D4 |
| 출력 | 16,384 토큰("Gemini API serving limit"). 오디오 25토큰/초로 나누면 약 655초 | D2, D12 |
| Cloud TTS 출력 | 약 655초. 넘으면 잘린다 | D20 |
| Cloud TTS 입력 | `text`·`prompt` 각 4,000바이트(한글 약 1,333자), 합 8,000바이트 | D20 |
| 출력 크기(계산) | WAV 24kHz 16비트 모노 = 48,000바이트/초 = 1분 약 2.88MB. 4.5MB는 약 93초. `sample_rate: 16000`이면 약 140초 | D1(형식)에서 계산 |
| 다화자 | 한 요청 2명(미리 만든 성우만) | D1 |
| 맞춤 성우 | 프로젝트당 200명(디자인·복제 합산), 마지막 사용 뒤 1년 보관. `voicekey_…`는 7일 | D1, D8 |
| 스트리밍 | `stream: true`(SSE). 헤더 없는 `audio/l16` 조각 | D1, D15 |
| 요청당 지연 | 정보 없음(문서에 수치 없음. "low latency"라는 문구만) | D3 |
| 요청 제한 | 프로젝트 단위. RPM·TPM·RPD, RPD는 태평양 시간 자정에 초기화. 3.8 TTS의 숫자는 문서에 없고 AI Studio에서만 보인다 | D13 |
| 지출 기준 제한 | 10분당 Tier 1 $10, Tier 2 $50, Tier 3 $200. 넘으면 429 `RESOURCE_EXHAUSTED` | D13 |

## 8. 과금

| 모델(Gemini API 표준) | 입력(1M 텍스트 토큰) | 출력(1M 오디오 토큰) | 10초당 | 1분당(계산) | 출처 |
|---|---|---|---|---|---|
| `gemini-3.8-flash-tts` ~2026-12-31 | $0.50 | $9.00 | $0.00225 | $0.0135 | D12 |
| `gemini-3.8-flash-tts` 2027-01-01~ | $1.00 | $18.00 | $0.0045 | $0.027 | D12 |
| `gemini-3.8-flash-lite-tts` ~2026-12-31 | $0.50 | $6.00 | $0.0015 | $0.009 | D12 |
| `gemini-3.8-flash-lite-tts` 2027-01-01~ | $1.00 | $12.00 | $0.003 | $0.018 | D12 |
| `gemini-3.1-flash-tts-preview` | $1.00 | $20.00 | | | D12 |

- 오디오 토큰은 초당 25토큰이다 (D12, D21).
- Batch·Flex는 절반, Priority는 1.8배 (D12). 이 앱의 즉시 생성은 표준이다.
- 무료 등급(결제 계정 미연결 프로젝트)은 3.8 표준 입력·출력 "Free of charge"이고, 데이터가 제품 개선에 쓰인다("Used to improve our products: Yes") (D12, D18).
- 유료 등급은 결제 계정 연결과 최소 $5 선불(Prepay)로 시작한다. 선불 잔액이 0이 되면 그 결제 계정의 모든 키가 402로 멈춘다. 청구 반영에 약 10분 지연이 있다 (D14). Google Cloud 환영 크레딧은 Gemini API에 쓸 수 없다 (D14).
- 잔액·사용량은 AI Studio 대시보드에서 본다 (D14). **키로 잔액을 조회하는 API는 문서에 없다.** 정보 없음.
- 실제 사용량: Interactions 응답의 `usage`(`total_input_tokens`, `total_output_tokens`, `output_tokens_by_modality`) (D10, D17). 이 값으로 실제 금액을 계산할 수 있다.
- 예상 사용량: 입력 토큰은 `models.countTokens`로 셀 수 있다 (D17). 단 TTS 모델을 받는지, 과금되는지는 문서에 없다(정보 없음). "1토큰은 영어 약 4글자"는 한국어 근거가 아니다 (D17). 금액의 대부분인 **출력 오디오 토큰은 생성 전에 알 수 없다**(길이에 비례). 화면에는 "예상 길이 × 25토큰/초 × 단가"를 추정치로 보이고 생성 뒤 `usage`로 실제 값을 보여야 한다.
- 계산 예(가정, 출처 없음): 한국어를 분당 300음절로 읽는다고 가정하면 200자 문장은 약 40초 → 약 1,000 오디오 토큰 → 3.8 Flash 약 $0.009, Lite 약 $0.006.
- 음성 디자인·복제 생성 요금: 가격 페이지에 항목이 없다. 정보 없음. 디자인 생성 응답에는 `usage`가 있다 (D9).

## 9. 오류

Interactions API의 실패 본문은 `{ "error": { "code": "<snake_case>", "message": "…" } }`다. 표에 없는 코드는 HTTP 상태 이름의 snake_case로 온다 (D15). 스트리밍은 `event_type: "error"` 이벤트로 온다 (D15).

| HTTP | `error.code` | 문서 설명 | 이 앱의 `reason` 제안 |
|---|---|---|---|
| 400 | `invalid_request`, `parameter_unknown` | 요청 형식·인자 오류 | `provider_input` |
| 400 | `failed_precondition` | 전제 조건 미충족(예: 결제 사용 중지) | `quota` 제안(결제·플랜 문제). 확정은 실측 뒤 |
| 401 | `authentication` | 키 없음·틀림·만료 | `provider_auth` |
| 402 | `payment_required` | 선불 잔액 소진. "다시 시도하지 말라" | `quota` |
| 403 | `permission_denied` | 키에 그 리소스 권한 없음 | `no_permission`(`error.code`로 판정) |
| 404 | `not_found`, `model_not_found` | 리소스·모델 없음 | 이용 가능 확인에서는 '없음'(`nullOnStatus`), 생성에서는 `provider_input` |
| 409 | `already_exists`, `aborted` | 충돌 | `provider_input` |
| 416 | `out_of_range` | 인자 범위 밖 | `provider_input` |
| 429 | `rate_limit_exceeded`, `quota_exceeded`(일일), `too_many_requests` | 분·초·일 한도. 지출 기준 한도도 429 `RESOURCE_EXHAUSTED` (D13) | `rate_limit` |
| 499 | `cancelled` | 클라이언트가 끊음 | `unknown_outcome` |
| 500·501·503 | `api_error`, `unimplemented`, `service_unavailable` | 서버 오류·과부하 | `provider_error` |
| 504 | `deadline_exceeded` | 기한 안에 못 끝냄 | `provider_error`(상태 코드를 받았으므로). 과금 여부 정보 없음 |
| (HTTP 상태 정보 없음) | `safety`, `language`, `prohibited_content`, `spii`, `blocklist`, `content_blocked`, `recitation` | 정책·안전·언어 차단. "입력을 고쳐 다시" | `provider_input` |

- `Retry-After`: 문서에 언급이 없다. 정보 없음. SDK는 응답에 `retry-after-ms`·`retry-after`가 있으면 읽는다 (D29). 없으면 앱 규칙대로 60초를 쓴다(`tts-provider` SKILL '성우 한 명 조회' 절).
- 일일 한도(`quota_exceeded`)는 태평양 시간 자정에 풀린다 (D13). 대기 시각을 그때로 잡는 방안을 설계 때 정한다.
- 문서 권장은 429·5xx 지수 백오프 재시도, 400·402·403은 재시도 금지다 (D16). 이 앱은 유료 호출을 자동 재시도하지 않으므로 권장과 다르게 간다(문제 없음).
- 할당량은 프로젝트 단위다(키 단위가 아니다) (D13). 같은 프로젝트의 다른 키·AI Studio 사용이 이 앱의 한도를 함께 쓴다.

## 10. 약관·데이터

- 무료 등급(무료 할당량, AI Studio)의 입력·출력은 Google 제품·기계 학습 개선에 쓰이고 사람이 검토할 수 있다. "민감·개인 정보를 넣지 말라" (D18).
- 유료 등급(결제 계정이 연결된 프로젝트)은 입력·출력을 제품 개선에 쓰지 않는다. 금지 사용 감시와 법적 공개를 위해 제한된 기간 기록한다 (D18).
- Interactions API는 기본으로 요청·응답을 저장한다(`store=true`). 유료 55일, 무료 1일 보관. `store: false`로 끈다 (D11). 이 앱은 `store: false`를 보내야 한다.
- 생성물: "Google은 생성한 콘텐츠의 소유권을 주장하지 않는다". 같거나 비슷한 콘텐츠를 남에게도 만들 수 있다. 사용 책임은 사용자에게 있다 (D18). 상업적 사용을 금지하는 문구는 없다.
- 이용 조건: 18세 이상, "전문·업무 목적의 개발자용이며 소비자용이 아니다", 이용 가능 지역에서만 (D18). 유럽경제지역·스위스·영국 사용자에게는 유료 서비스만 쓸 수 있다 (D18).
- 한국: 이용 가능 국가에 South Korea가 있다 (D19).
- SynthID: "Gemini Audio 모델이 만든 모든 오디오에 SynthID 워터마크를 넣는다"(들리지 않음). 복제 음성에는 C2PA 자격 증명도 붙는다 (D27). 3.1 Flash TTS도 모든 오디오에 SynthID (D28).
- 3.8은 Gemini Enterprise에서 Preview이며 "Pre-GA Offerings Terms"를 따른다 (D25).

## 11. 클론(맞춤 성우)

| 항목 | Gemini API 음성 복제(3.8) | Cloud TTS Chirp 3 Instant Custom Voice |
|---|---|---|
| 호출 | `POST /v1beta/voices`, `voice.type: "replicated"` (D8, D9) | Cloud TTS 음성 복제 키 생성 (D24) |
| 접근 | API 키로 사용(문서에 허용 목록 문구 없음). AI Studio의 복제 기능은 일리노이·텍사스·유럽경제지역·영국·스위스·인도에서 안 된다 (D27). API의 지역 제한은 정보 없음 | **허용 목록 사용자만**, 영업 팀에 요청 (D24) |
| 입력 | 같은 성인 화자의 두 녹음: 참조 10~30초(`source_audio`) + 동의 문장 녹음(`consent_audio`). 24kHz 모노 16비트 WAV 권장. base64로 본문에 넣는다 (D8) | 동의·참조 각 약 10초 (D24) |
| 동의 문장 | 30개 언어. 한국어 `ko-KR` 있음(5절) (D8) | 한국어 `ko-KR` 있음 (D24) |
| 검증 | 동의 녹음과 참조 녹음의 화자가 같은지 검사 (D8, D27) | 같은 환경 녹음 권장 (D24) |
| 저장 | `store: true` → `voice_…`(프로젝트에 저장, 마지막 사용 뒤 1년, 프로젝트당 200명). `store: false` → `voicekey_…`(앱이 보관, 7일) (D8). **기본값이 문서끼리 다르다**: 안내는 `store=True`가 기본(D8), 참조는 `false`가 기본(D9) | 정보 없음(이번에 읽지 않음) |
| 관리 | `voices.list(type=replicated)`, `voices.get`, `voices.delete` (D8) | 정보 없음 |
| 요금 | 생성 요금 정보 없음. 합성은 일반 TTS 단가 | 합성 $60/1M 글자 (D21) |
| 3.8 사용 | 가능 | 해당 없음(Chirp 3 HD 모델) |

- 계정 공유 문제: `GET /v1beta/voices`는 프로젝트의 맞춤 성우(디자인·복제)를 먼저 돌려준다 (D9). 이 앱은 서버 키 하나를 같이 쓰므로 다른 사용자의 클론이 섞인다. 공개 목록에는 반드시 `type=prebuilt`를 붙인다.
- 복제 요청 본문 크기(계산): 30초 24kHz WAV 약 1.44MB + 동의 10초 약 0.48MB, base64로 약 2.56MB. 서버가 공급자로 보내는 본문이라 Vercel 4.5MB 한도는 브라우저→서버 업로드(원본 약 1.92MB)에만 걸린다.

## 12. SDK

- 공식 TypeScript SDK는 `@google/genai`다. TTS·Voices에는 2.24.0 이상이 필요하다 (D1). 2026-10-07 npm 최신은 2.27.0(2026-10-02 게시) (D29).
- 호출: `client.interactions.create({ model, input, response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: "Kore" }] } })`. 오디오는 `interaction.output_audio.data`(base64) (D1). 성우는 `client.voices.list/get/create/delete` (D1, D8).
- **자동 재시도 기본값(2.27.0 소스 확인, D29):** `CreateInteraction`·`ListVoices`·`CreateVoice` 등 Interactions·Voices 호출의 기본 정책은 `attempt-count-backoff`, `maxRetries: 4`(최초 포함 5회), 재시도 코드 `408`·`409`·`429`·`5XX`, **연결 오류도 재시도**(`retryConnectionErrors: true`), 간격 500ms에서 8초까지, `Retry-After`·`retry-after-ms` 헤더를 따른다. 끄려면 요청 옵션 `retries: { strategy: "none" }`(타입 `RequestOptions.retries`)을 준다. 옛 `models.*` 경로는 `HttpRetryOptions.attempts`(기본 5) (D29).
- 키를 넘기지 않으면 `GOOGLE_API_KEY`·`GEMINI_API_KEY` 환경변수로 대체한다 (D29). 이 앱의 규칙(`packages/api`에서 `process.env`를 읽지 않음, SKILL '구조' 절)과 부딪힌다.
- 패키지 크기 약 11MB, 의존성 `google-auth-library`·`p-retry`·`protobufjs`·`ws` (D29).
- REST 직접 호출: 문서가 모든 기능에 `curl` 예시를 준다 (D1, D7, D8). 헤더 `x-goog-api-key`, 응답 오디오는 `steps[].content[].data`(base64) (D1).
- 권장: **REST를 `fetch`로 부른다**(Fish Audio·Airy와 같은 방식, ADR 0002). 재시도 0, `redirect: "error"`, 시간 제한, 오류 매핑을 기존 `providers/errors.ts`의 `fetchJson` 틀로 그대로 쓸 수 있고 큰 SDK와 환경변수 대체를 피한다.

## 13. 이 앱에 넣을 때

| SKILL 규칙 | 맞는 점 | 걸리는 점 | 대응안 |
|---|---|---|---|
| 공급자 모듈 구조, ADR 0002(TypeScript, REST 허용) | REST·API 키 하나로 된다. `providers/gemini.ts` + `createProviders`에 한 줄 | `providerIdSchema`·`SAMPLE_HOST`(`Record<ProviderId, RegExp>`라 정규식 필수)·`CONTRACT_VERSION`을 함께 바꿔야 한다(`contract.ts`, `sample-hosts.ts`) | T7.5와 같은 순서(모듈·계약·DB 검사·화면 탭) |
| 유료·상태 변경 호출은 `protectedProcedure`·승인 뒤 실호출 | 같다 | 무료 등급 키면 실제로 무료지만 키가 어느 등급인지 알 API가 없다 | Fish 무료 모델처럼 '무료' 표식을 붙이지 않고 항상 유료 확인을 거친다 |
| 중복 과금(요청 id 선점, 재시도 금지) | REST면 재시도 0이 기본 | SDK를 쓰면 기본 5회 시도·연결 오류 재시도(D29). Interactions는 기본 저장(D11) | REST + `store: false`. SDK를 쓰면 `retries: { strategy: "none" }` |
| 오류 매핑 표 | 401·403·429·5xx가 표에 그대로 들어간다 | 402 `payment_required`, 400 `failed_precondition`(결제), 차단 코드(`safety` 등)의 HTTP 상태 미상, 본문 코드가 snake_case | 9절 표대로 `error.code`로 판정을 더한다 |
| 목록 규칙(24시간 캐시, 항목 단위 검사, 공용 캐시에 계정 성우 금지) | 목록 API·필터·페이지 토큰이 있다. `type=prebuilt`로 공개 행만 받을 수 있다 | 필터 없이 부르면 프로젝트 클론이 앞에 섞인다(D9). 페이지 토큰은 필터가 같아야 한다(D9) | 공개 출처 = `type=prebuilt&language_code=ko-KR`, 계정 출처(소유자별 행) = `type=prompted,replicated` |
| 기본 샘플은 공급자 샘플 URL 무료 재생(REQ-03) | Cloud 문서의 한국어 Chirp 3 HD 샘플 30개가 서명 없는 공개 주소로 있다(D23) | **API에 샘플이 없다**(D7, D9). 문서 샘플은 다른 모델(Chirp 3 HD)의 음성이고 문서 자산이라 예고 없이 바뀔 수 있다. 확장 라이브러리 성우에는 샘플이 아예 없다 | 사용자 결정 필요(14절 ①) |
| 샘플 주소 허용 호스트 | 문서 샘플을 쓰면 정확히 `docs.cloud.google.com` 하나 | 같은 호스트에 문서 전체가 있다(경로까지 보지 않으면 넓다) | 호스트 + 경로 접두 `/text-to-speech/docs/audio/` 검사 |
| 오디오 4.5MB, base64 JSON 금지, `File` 반환 | 200자 듣기(T5)는 WAV로도 한도 안(계산 예 약 40초·1.9MB) | 출력이 WAV뿐(MP3 없음, D1·D26). 1분 2.88MB라 약 93초에서 한도. `packages/api/src/trial.ts`의 `audioFile`이 `trial.mp3`·`audio/mpeg`로 고정. T5는 결과를 Postgres에 30일 보관하는데 WAV는 MP3보다 약 10배 크다 | ① MIME을 공급자별로 바꾸게 고친다 ② 듣기는 WAV 그대로, T9·T10 긴 대본은 `sample_rate: 16000`(약 140초) 또는 MP3 인코딩(ffmpeg, P1-04)·Blob 전달을 사용자와 정한다 |
| 사용량 표시(공급자 근거만, 예상과 실제 구분) | 가격 페이지 단가가 명확하고 응답 `usage`로 실제 토큰을 받는다 | 금액의 대부분인 출력 오디오 토큰을 생성 전에 알 수 없다. 2027-01-01에 단가가 두 배가 된다. 잔액 조회 API 없음(연결 상태 카드에 잔액을 못 보임) | 확인 창: "예상 길이 기준 추정 금액(Google 가격: 1분 약 $0.0135)"과 날짜별 단가. 생성 뒤 `usage` 실제 금액. 연결 상태는 `quota: null` |
| 연결 확인(과금 없는 호출 하나) | `GET /v1beta/voices?page_size=1` 같은 조회가 있다 | 조회 호출의 과금 문구가 없다(무료 명시도 없다) | 다른 공급자와 같은 "문서에 과금 문구 없음" 기준으로 쓴다 |
| 성우 한 명 조회(T7 이용 가능 확인) | `GET /v1beta/voices/{id}`가 있다(D9) | 미리 만든 성우 id(`Kore`)를 받는지 문서에 없다 | 공개 성우는 목록에서 찾고(Airy 방식), 맞춤 성우만 단건 조회 |
| 클론 소유권(앱 소유 매핑, 비공개 고정) | 복제·삭제 API와 한국어 동의 문장이 있다. 복제 결과는 프로젝트 비공개 | 프로젝트당 200명·1년 미사용 자동 삭제. 동의 녹음을 따로 받아야 한다. `store` 기본값이 문서끼리 다르다 | T13 메모로 넘긴다. `store: true`를 명시하고 응답 `id`만 매핑에 기록 |
| 설정 계약(zod) | 모델, 성우, `style` 문장, 언어 힌트, 표본 주파수 정도로 작다 | 숫자 속도·높낮이·온도가 없다(3.8은 `temperature` 등을 거절, D26). `style`이 자유 문장이라 길이 상한이 필요 | `style`은 6-3절 프리셋 + 짧은 자유 입력(상한은 설계 때), 태그는 6-2절 뱃지 |

## 14. 결론과 로드맵 제안

**결론: 조건부 가능**
1. GA 모델(`gemini-3.8-flash-tts`·`-lite-tts`), API 키 하나로 부르는 REST, 성우 목록 API, 한국어 지원, 분당 약 $0.009~0.0135의 낮은 단가로 지금 구조(T7.5 방식)에 기술적으로 붙는다.
2. 다만 API가 무료 기본 샘플을 주지 않아 '공급자 샘플 무료 재생' 전제가 깨진다. 공개 샘플은 다른 모델(Chirp 3 HD)의 음성뿐이다.
3. 출력이 WAV뿐이라 오디오 전달·저장 코드를 넓혀야 하고, 출력 토큰 과금이라 생성 전 사용량이 추정에 그치며 잔액 조회 API가 없다. 아래 결정을 먼저 받아야 한다.

**권장 경로와 모델:** Gemini API(`generativelanguage`, REST `fetch`, `x-goog-api-key`), `POST /v1beta/interactions` + `store: false`. 기본 `gemini-3.8-flash-tts`, 저렴한 선택지로 `gemini-3.8-flash-lite-tts`. 유료 등급 프로젝트의 키(학습 사용 제외).

**넣는 자리(2026-10-07 사용자가 T7.6을 골랐다. 로드맵 4절·5절에 반영):** "T7.6 Gemini 공급자 추가"를 T8 전에 끼운다(T7.5는 2026-10-07에 닫혔다)(T7.5와 같은 방식, 번호를 밀지 않음). 로드맵 4절 표와 5절에 먼저 적고 시작한다.
- 포함: 연결 상태 카드(키 확인만, 잔액 없음 표시), 성우 캐스팅 Gemini 탭과 '전체' 묶음(`type=prebuilt`·`language_code=ko-KR` 목록, 성별·피치·페르소나·맥락·검색), 기본 샘플(결정 ①대로), 내 문장 듣기(유료 확인, 모델 둘, `style` 프리셋과 태그 뱃지, WAV 전달), 성우 보관함 담기와 이용 가능 확인. 이 문서, `tts-provider` SKILL(오류 코드·샘플 호스트·SDK 표), `apps/web/.env.schema`의 키 선언.
- 제외: 작업실 생성(T10 메모에 Gemini 추가), 다화자 대화(P1), 스트리밍, 음성 디자인·복제(T13 메모), Cloud TTS·Enterprise 경로.
- 다른 안: 샘플 문제를 피하려면 캐스팅에는 넣지 않고 T10(작업실 생성)에 공급자로만 더하는 방법도 있다.

**넣기 전에 사용자가 정할 것**
1. 기본 샘플: (가) Cloud 문서의 한국어 Chirp 3 HD 샘플을 '참고 음성'으로 표시해 재생(30명만, 다른 모델), (나) 승인 뒤 한 번 유료로 짧은 샘플을 만들어 앱에 저장(30명 × 10초면 3.8 Flash 약 $0.07, 저장 위치는 P1-02 미정), (다) 샘플 없이 내 문장 듣기만.
2. 결제 등급: 유료 등급 프로젝트 키를 쓸지(무료 등급은 대본이 학습·사람 검토에 쓰인다).
3. 모델 범위: Flash만, Lite만, 둘 다.
4. 성우 범위: 미리 만든 30명만, 또는 확장 라이브러리의 `ko-KR` 성우까지(샘플 없음).
5. 오디오 형식: 듣기는 WAV 그대로 둘지, 표본 주파수를 낮출지. 긴 대본(T9·T10)의 MP3 인코딩·Blob 전달은 그때 ADR로.
6. 시점: T7.6(지금 기능 전부) 또는 T10에 생성만.

## 15. 확인하지 못한 것

- `ko-KR` 성우 수, 확장 라이브러리 성우의 `id` 형식(앱 `voiceIdSchema` `^[A-Za-z0-9_-]{1,100}$`에 맞는지): 키 없이 확인 불가. 정보 없음.
- `ListVoices`·`GetVoice`·`models.countTokens`의 과금 여부: 문서에 과금 문구 없음.
- `countTokens`가 TTS 모델 id를 받는지: 정보 없음.
- 3.8 TTS의 무료·유료 등급별 RPM·RPD 숫자: 문서에 없고 AI Studio에서만 보인다.
- 429 응답의 `Retry-After` 헤더 유무: 정보 없음(첫 실측에서 확인).
- 차단 코드(`safety`, `language` 등)의 HTTP 상태, 504·499·연결 끊김일 때 과금 여부: 정보 없음.
- 요청당 지연(첫 오디오까지, 완료까지): 정보 없음.
- 한국어 품질 평가 수치: 정보 없음.
- 음성 디자인·복제 생성 요금, API 경로의 복제 지역 제한: 정보 없음.
- `GetVoice`가 미리 만든 성우 id를 받는지: 정보 없음.
- Cloud 문서 샘플(Chirp 3 HD)과 Gemini 3.8 같은 이름 성우의 음색이 같은지: 정보 없음(문서는 "similar"라고만 함). Gemini-TTS 데모 파일(`chirp3-hd-<이름>.wav`)의 언어도 정보 없음.
- 키로 선불 잔액을 조회하는 API: 문서에 없음.
- Gemini Enterprise를 API 키로 부르는 방식: 정보 없음.
- Interactions `speech_config[].language`의 값 형식(`ko`인지 `ko-KR`인지): 정보 없음.
- 문서끼리 다른 값: 출시일(2026-09-22 릴리스 노트·종료 표 / 2026-09-23 블로그), 확장 라이브러리 크기(수백 / 150+ / 2,000+), `voices.create`의 `store` 기본값(true / false), 다화자 인원("2명까지" / "정확히 2명"), `<whispers>` 태그 권장과 "속삭임은 style에" 권장.
