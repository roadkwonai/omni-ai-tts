# 드라마 자동 연기용 공급자별 태그·연기 값 조사

- 확인: 2026-10-22. T9.5 사용자 테스트 피드백(여러 공급자 줄마다 읽기, 공급자별 전체 자동 태그) 설계용. 공식 문서만 읽었고 공급자 API는 부르지 않았다.
- 기준선: [공급자별 감정 태그 정리](tts-emotion-tags.md)(2026-10-07). 아래 세 부분은 각각 Fish Audio·ElevenLabs, Typecast·Airy, Gemini(TTS와 자동 태그용 텍스트 모델)이다.

## Fish Audio·ElevenLabs 연기 태그 조사 (전체 자동 태그용)

확인 2026-10-22. 공식 문서·공식 블로그만 읽었다(WebFetch는 요약 모델을 거친 결과). 유료·계정 호출 없음. 기준선: docs/research/tts-emotion-tags.md(2026-10-07), docs/research/fish-audio-drama-3.md.
표기: [문서에 없음] = 공식 자료에서 못 찾음. [로컬] = 저장소 문서에서 가져옴(이번에 웹으로 다시 보지 않음).

### 1. 한 줄 결론

- Fish Audio: s2.1-pro·s2.1-pro-free는 `[대괄호]` 태그(자유 문구 허용, 문장 앞 감정 + 어디든 소리·톤·쉼)이고, drama-3는 `[대괄호 지시]`(자유 문구) + 쌍 태그 7종(`<whisper>` 등)이다. 닫힌 목록은 없어 LLM은 추천 목록 + 짧은 영어 문구로 묶는다. 자동 태그 API는 없다.
- ElevenLabs: eleven_v4·eleven_v3(·v4 Turbo)만 `[대괄호]` 오디오 태그(자유 문구 허용, 전용 enum 없음)이고, 그 밖 모델은 태그가 글자로 읽힐 수 있다. Enhance는 웹 버튼뿐이고 API는 없다. 프롬프트는 Best practices 문서 안에 공개돼 있다.

### 2. Fish Audio

#### 2-1. s2.1-pro / s2.1-pro-free

- 넣는 형식: 대본 안 `[대괄호]`만. 쌍 태그 `<...>`는 이 모델 문서에 [문서에 없음](쌍 태그는 drama-3 페이지에만 있다). 모델 헤더는 `s1 | s2-pro | s2.1-pro | s2.1-pro-free | drama-3`, 헤더 누락·오타는 조용히 `s2.1-pro`로 폴백.
- `s2.1-pro-free`를 따로 적은 태그 문서는 없다. 감정 문서가 "S2 / S2-Pro / S2.1-Pro"만 적는다. s2.1-pro-free도 같은 문법으로 보는 것은 추정이다 [문서에 없음]. (저장소 시험 7·9절에서 무료 모델로 한국어 대괄호 지시가 오류 없이 처리됨 [로컬].)
- 위치 규칙(공식 감정 문서):
  - 문장 단위 감정은 그 문장 맨 앞이 가장 잘 먹고, 멀리 떨어뜨리지 않는다.
  - 톤 태그(`[emphasis]` 등)는 문장 중간, 해당 단어·구 앞에도 된다.
  - 소리·특수 효과 태그는 어디든 된다. 제안 문구가 있는 소리 태그는 뒤에 그 글자를 붙인다(`[laughing] Ha, ha, ha`).
  - 태그 효과는 다음 태그나 문장 끝까지(검색 요약, Comfy 가이드 기준. 공식 감정 문서 본문에는 범위 문장이 직접 없음).
- 개수: 조합 가능(`[sad][whispering]`). 한 문장 감정 최대 3개 권장, 문장당 주 감정 1개, 상충 금지.
- 자유 문구: 허용. `[warm and happy]` 같은 자연어, 강도 수식어 `[slightly sad]` `[very excited]` `[extremely angry]`. 짧게 쓰라고 한다.
- 한국어: 감정 마커 지원 13개 언어에 한국어 포함. 한국어 전용 규칙 [문서에 없음]. 영어 태그 vs 한국어 태그의 우열은 [문서에 없음]. 저장소 시험은 한국어 지시도 읽히지 않고 처리됨 [로컬 9절]. 안전한 기본은 영어 태그.
- 태그는 토큰 한도에 안 들어가고 지연도 없다(문서). 과금은 UTF-8 바이트(태그 포함으로 보는 것이 안전) [로컬].

자동 태그 추천 목록(정확한 문자열, 30개):
- 감정·말투(16): `[happy]` `[sad]` `[angry]` `[excited]` `[calm]` `[nervous]` `[confident]` `[surprised]` `[scared]` `[worried]` `[frustrated]` `[sarcastic]` `[curious]` `[disappointed]` `[determined]` `[embarrassed]`
- 톤(5): `[whispering]` `[shouting]` `[screaming]` `[soft tone]` `[in a hurry tone]`
- 소리(7): `[laughing]` `[chuckling]` `[sighing]` `[sobbing]` `[gasping]` `[groaning]` `[clear throat]`
- 쉼(2): `[break]` `[long-break]`
- 범위(문장 중간 강조 1): `[emphasis]` (강조할 단어 바로 앞)
- 전체 공식 이름(참고, 이 외도 허용): 기본 감정 24 + 고급 24(disdainful, anxious, hysterical, indifferent, uncertain, doubtful, confused, regretful, guilty, ashamed, jealous, hopeful, resigned 등), 소리 `[panting]` `[yawning]` `[snoring]`, 특수 `[audience laughing]` `[background laughter]` `[crowd laughing]`.

#### 2-2. drama-3

- 넣는 형식 3가지(drama-3 공식 페이지):
  1. 줄 앞(또는 단어 앞) 지시 `[barely holding it together, forcing a smile] 대사`. 닫힌 목록 없음, 자유 서술.
  2. 소리·쉼 `[sigh]` `[laugh]` `[shaky breath]` `[pause]`를 일어날 위치에 둔다. 닫힌 목록 없음.
  3. 쌍 태그 `<whisper>` `<emphasis>` `<soft>` `<fast>` `<slow>` `<stress>` `<forceful>` 7종 확인(이름 그대로). 감싼 단어의 전달만 바꾼다.
- 줄 중간 지시 `[voice breaks]` `[whispering]`로 그 지점부터 연기 변경(블로그 [로컬]).
- 결합: 지시 여러 개를 한 줄에 자유롭게 섞을 수 있다(문서). 개수 권장·중첩 규칙·길이 제한 [문서에 없음].
- 지시문 언어: 대사 언어와 달라도 된다("English or another language"). 한국어 지시의 효과 검증·한국어 전용 규칙은 [문서에 없음]. 한국어 예제는 `<korean>안녕하세요</korean>` 하나뿐.
- `<korean>` 등 언어 태그는 실험적, 한국어 화자 대본에는 쓰지 않는다. `<|speaker:N|>` `<|phoneme_start|>` `<|phoneme_end|>`는 자동 태그가 만들면 안 되는 토큰(API는 phoneme 마커가 든 사전 값을 거절, Space는 `<|` 입력 거절).
- 최대 길이 [문서에 없음]. 웹 편집기 500바이트 [로컬].
- 자동 태그 추천 목록(30개 이내):
  - 감정·말투(자유 문구, 짧은 영어): `[icy calm]` `[sarcastic and deadpan]` `[defensive, slightly uneasy tone]` `[barely holding it together, forcing a smile]` `[hurt, holding back tears]` `[slow, deadly serious]` `[voice drops to a terrified whisper]` `[softer and warmer]` `[angrier]` `[nervous]` `[excited]` `[sad]` `[angry]` `[calm]`. 앞 8개는 공식 페이지·Space·OpenArt 예시 그대로, 뒤 6개는 일반 문구라 효과 보장 [문서에 없음].
  - 소리(8): `[sigh]` `[laugh]` `[small laugh]` `[shaky breath]` `[gasp]` `[clears throat]` `[chuckles]` `[hesitates]` (뒤 5개는 Space 팔레트 `sighs/laughs/chuckles/gasps/clears throat/hesitates` 기준이라 동사형 철자 `[sighs]` `[laughs]` `[gasps]`가 데모 정본이다)
  - 쉼(1): `[pause]`
  - 범위 쌍 태그(7): `<whisper>` `<emphasis>` `<soft>` `<fast>` `<slow>` `<stress>` `<forceful>` (각각 닫는 태그 필수: `<whisper>…</whisper>`)
- s2.1-pro 전용 `[break]` `[long-break]` `[whispering]`이 drama-3에서 되는지는 [문서에 없음]. drama-3 앱 경로에서는 `[pause]`와 쌍 태그를 쓴다.
- 줄당 개수: 공식 권장 [문서에 없음]. 앱 제안: 줄 앞 지시 1개 + 소리·쉼·쌍 태그 합쳐 2개 이내(근거는 s2의 감정 3개 상한뿐이므로 보수적 추정).

#### 2-3. 모델이 안 맞을 때
- S1: 태그 문법이 `(괄호)`다. API는 괄호를 대괄호로 바꿔 주지 않는다. S2 대괄호 태그를 s1에 보내면 어떻게 읽히는지 [문서에 없음]. s1은 2026-12-31 퇴역, 이후 요청은 s2.1-pro가 받는다.
- 대괄호 태그가 든 대본을 태그 미지원 공급자(Typecast·Airy)로 보냈을 때 동작은 이 조사 범위 밖. Fish 안에서 쌍 태그를 s2.1-pro에 보냈을 때 글자로 읽히는지는 [문서에 없음]. 저장소 시험에서는 `<whisper>` 이름이 정렬 세그먼트 글자에 붙어 나온 적이 있다 [로컬 7·9절]. 안전하게 s2.1-pro에는 쌍 태그를 넣지 않는다.

### 3. ElevenLabs

#### 3-1. eleven_v4 / eleven_v3 (eleven_v4_turbo 동일)

- 넣는 형식: 대본 안 `[대괄호]`만. 쌍 태그 없음. 괄호·중괄호는 인식 안 됨(글자로 읽힘). 요청 필드(enum) 없음. v3용 대본은 v4에서 그대로 된다. API 경로: Create speech, Stream speech, Text to Dialogue(모델 ID `eleven_v4`·`eleven_v4_turbo`·`eleven_v3`).
- 자유 문구: 허용. 공식 문서는 목록이 "likely many more"라 말하고, 쉼표 조합 `[whispering, fearful]`, 긴 문구 `[like a sports commentator, speeding up]`, `[out of breath after running up the stairs]`를 예로 든다. 단 소리 신호로 읽힐 문구 대신 음성 상태를 설명하는 쓰기가 낫다(예 `[low, gravelly voice]`).
- 위치 규칙:
  - 영향을 줄 말 앞에 둔다. Enhance 프롬프트는 "바로 앞 또는 바로 뒤"를 허용(반응 태그는 문장 뒤도 됨).
  - 효과는 새 태그가 나올 때까지 이어진다. 감정이 바뀌는 곳에만 새 태그.
  - 절(clause)마다 태그 1개. 한 괄호 안에 여러 단서는 쉼표로.
  - 운율은 문장부호로 보조: `...` 쉼, 대문자 강조, 줄표 끊김.
  - 태그가 목소리가 학습한 연기와 안 맞으면 덜 믿을 만하다("Tags land more readily when the delivery is already in the voice's training data"). 실험적 태그는 성우마다 일관성이 떨어진다.
- 줄당 개수: 공식 숫자 권장 [문서에 없음]. "절당 1개"가 가장 가까운 규칙. 앱 제안: 줄 앞 1개(쉼표 조합 2요소까지) + 중간 전환 필요한 경우만 추가.
- 한국어: 한국어 대본에서 태그 동작에 관한 문구 [문서에 없음]. v4는 한국어를 포함한 90+ 언어 지원(모델 페이지). 모든 예시가 영어다. 따라서 태그는 영어로 쓴다(기준선과 같음). 음성의 억양을 다른 언어로 옮기는 데 태그를 쓸 수 있으나 결과는 다양하다.
- 쉼: v4·v3는 SSML `<break>` 불가. `[pause]`(짧게, 숨 정도)·`[long pause]`(의도적 침묵), 문장부호. 길이는 문맥·성우에 따라 달라지고 고정 아님.
- 자동 태그 추천 목록(30개):
  - 감정·말투(18): `[excited]` `[happy]` `[sad]` `[angry]` `[nervous]` `[anxious]` `[scared]` `[curious]` `[sarcastic]` `[tired]` `[calm]` `[surprised]` `[frustrated]` `[annoyed]` `[hopeful]` `[worried]` `[thoughtful]` `[mischievously]`
  - 전달·세기(6): `[whispers]` `[shouts]` `[softly]` `[quietly]` `[slowly]` `[rushed]`
  - 소리·반응(6): `[laughs]` `[sighs]` `[gasps]` `[clears throat]` `[crying]` `[chuckles]`
  - 쉼(2): `[pause]` `[long pause]`  (위 합 32. 상한 30이면 `[chuckles]` `[mischievously]` 제외)
  - 쓰지 말 것: 효과음(`[gunshot]` `[applause]` `[explosion]`, 실험적), 다화자용 `[interrupting]` `[overlapping]`, 비음성(`[standing]` `[music]`). 근거: Enhance 프롬프트가 음성 외 용도를 금지.
- 철자 주의: 문서는 `[whispers]`(동사형)를 주로 쓴다. 공식 블로그 목록에 `[sigh]`·`[sighs]` 둘 다 나온다.

#### 3-2. 태그 미지원 모델 (eleven_multilingual_v2, eleven_flash_v2_5)
- 공식 문서에 "태그를 넣으면 이렇게 된다" 직접 서술은 [문서에 없음]. 가장 가까운 공식 문구(블로그 FAQ): 모델이 태그를 지원하지 않거나 형식이 틀리면 태그가 소리 내어 읽히는 것이 보통이다. 앱은 이 모델로 보낼 때 태그를 빼야 한다.
- 이 모델들의 쉼은 SSML `<break time="x.xs" />`(최대 3초, multilingual_v2 예시 `2.0s`). 대시·줄임표는 덜 일관됨. flash_v2_5의 SSML 지원 여부는 이번 자료에서 직접 확인 못 함 [문서에 없음](Best practices는 "other models"로 묶어 설명).
- `[pause]`를 구형 모델에 넣었을 때 [문서에 없음](글자로 읽힐 가능성이 높으나 추정).

### 4. 2026-10-07 문서와 달라진 점

- ElevenLabs: 태그 규칙 변화 없음. 변경 이력(2026-10-05, 10-12 항목 확인)에 오디오 태그·Enhance 변경 없음. 새로 확인된 것: 10-05에 대화형 TTS 옵션에 `eleven_v4`·`eleven_v4_turbo`가 추가되고 기본이 `eleven_v4_turbo`로 바뀜(ElevenAgents용 옵션, 이 앱 convert 호출에는 영향 없음으로 보임). 10-12 `audio_effects` 객체는 태그와 무관. v4 문서가 `eleven_v4_turbo`의 태그 지원을 명시(기준선에서는 "정보 없음"이던 convert 사용 가능 여부는 블로그·도움말이 Create speech/Stream speech에서 v4 Turbo를 명시해 해소됨).
- Fish: 기준선 4-3과 같은 태그 표·규칙(감정 문서 재확인). drama-3 페이지는 확인 범위 안에서 [로컬] 3절과 같다. 변경 이력 페이지에 2026-10 날짜 항목이 없고(날짜 표기 자체가 거의 없음) 자동 태그 관련 변경도 없다. 새로 못 찾은 것도 있다: `s2.1-pro-free`의 태그 문서 별도 기재 없음.
- 즉 사실상 변화 없음. 단 위 두 가지(ElevenLabs v4 Turbo 명시, 기본 모델 변경)는 참고.

### 5. 자동 태그 API 유무

- Fish: 공개 API에 자동 태그 없음. TTS API 참조(/api-reference/endpoint/openapi-v1/text-to-speech)의 요청 필드는 text, temperature, top_p, references, reference_id, prosody, chunk_length, normalize, language, format, sample_rate, mp3_bitrate, opus_bitrate, latency, max_new_tokens, repetition_penalty, min_chunk_length, condition_on_previous_chunks, early_stop_threshold, features(예시 `["quality-guard"]`), pronunciation_dictionary뿐. drama-3 소개 페이지(fish.audio/ko/drama-3)의 "자동 태그"는 웹 편집기 기능 [로컬 1.2절]. API 대응 [문서에 없음]. 그래서 이 앱의 "전체 자동 태그"는 앱이 LLM으로 직접 만들어야 한다.
- ElevenLabs Enhance: API 없음(검색·API 문서 어디에도 엔드포인트 없음. `should_enhance`는 Design a voice의 음성 설명 보정이라 무관). 웹의 "v4 Enhance" 버튼(Generate speech 옆)만 있다.
- Enhance 프롬프트 위치: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices 의 "Prompting Eleven v4" 안 "Enhancing input" 절. 별도 URL 없음.
- 프롬프트 규칙 5줄 요약:
  1. 목표는 대사에 오디오 태그(`[laughing]` `[sighs]` 등)를 문맥에 맞게 넣는 것. 줄마다 분위기를 분석해 태그를 고른다.
  2. 대사 글자를 바꾸거나 더하거나 빼지 않는다. 원문을 괄호로 감싸지 않는다. 대사를 지어내지 않는다. 서술을 태그로 바꾸지 않는다.
  3. 태그는 음성에 관한 것만. 음악·효과음, 몸짓(`[standing]` `[grinning]`)은 금지. 정치·종교·욕설·혐오·성적 내용 같은 민감 주제는 피한다.
  4. 태그는 대괄호로, 영향받는 구간 바로 앞 또는 뒤에 둔다. 강조는 대문자·물음표·느낌표·줄임표로(단어는 그대로).
  5. 목록은 "비완전(Non-Exhaustive)"이라 비슷하고 문맥에 맞는 태그를 추론해도 된다. 출력은 "Reply ONLY with the enhanced text" 향상된 본문만, 입출력 예시 3개 포함.
  (요약 모델 경유 요약이라 프롬프트 원문 인용은 못 했다. 구현 때 원문을 다시 읽을 것.)

### 6. 출처 (모두 확인 2026-10-22)

- Fish drama-3 태그·쌍 태그·언어 태그·자동 태그 없음·가격·헤더 폴백: https://docs.fish.audio/features/text-to-speech/drama-3
- Fish S2 감정·톤·소리·break 태그, 위치·조합·자유 문구·한국어 13개 언어·S1 괄호: https://docs.fish.audio/developer-guide/core-features/emotions (검색 결과가 가리킨 같은 문서의 .md판 https://docs.fish.audio/developer-guide/core-features/emotions.md). 같은 이름의 구 경로 https://docs.fish.audio/docs/core-features/emotions 는 S1 괄호 예시(옛 문법).
- Fish TTS API 요청 필드·model 헤더 enum·자동 태그 없음: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
- Fish 변경 이력(S1 퇴역, s2.1-pro-free 무료 기한, drama-3·S2 괄호 문법): https://docs.fish.audio/changelog
- Fish 태그 효과 범위(다음 태그나 문장 끝까지) 2차 확인: https://docs.comfy.org/tutorials/partner-nodes/fishaudio/prompt-guide , https://runware.ai/docs/models/fish-audio-s2-1-pro/guides/emotion-and-expression.md (2차 자료)
- Fish drama-3 공식 사이트·블로그·Space (저장소 문서 재인용, 이번에 다시 안 읽음): https://fish.audio/ko/drama-3/ , https://fish.audio/blog/fish-audio-drama-3/ , https://huggingface.co/spaces/fishaudio/Drama-3
- ElevenLabs 오디오 태그 범주·실험 태그·v4/v3 쉼·SSML 불가·Enhance 프롬프트: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
- ElevenLabs 태그 목록(범주별), 위치 규칙, 대괄호만 인식, 미지원 모델 FAQ, API 3개 모델·3개 엔드포인트: https://elevenlabs.io/blog/elevenlabs-audio-tags-list
- ElevenLabs 지원 모델·형식·위치(도움말): https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-do-audio-tags-work-with-eleven-v3-and-v4.md
- ElevenLabs v4 모델 페이지(한국어 포함 90+ 언어, SSML 불가, 슬라이더): https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
- ElevenLabs 쉼(`[pause]` `[long pause]`, multilingual_v2 `<break>`, v4 Enhance 버튼): https://elevenlabs.io/blog/how-to-add-pauses-in-ai-voiceover
- ElevenLabs 변경 이력(2026-10-05, 10-12): https://elevenlabs.io/docs/changelog (페이지 앞 100,000자만 읽음. 뒤 62,508자 미확인)
- Enhance API 없음 확인(검색): https://elevenlabs.io/docs/api-reference/text-to-voice/design (`should_enhance`는 음성 설명용)

## Typecast · Airy 연기 제어 조사 (전체 자동 태그용)

- 확인 2026-10-22. 공식 문서만 읽었다. Typecast·Airy API는 부르지 않았다(생성·계정 호출 없음).
- 기준선: `docs/research/tts-emotion-tags.md`(2026-10-07), `typecast-api-options.md`, `airy-api-options.md`.
- 표기: "[문서에 없음]"은 공식 출처에서 찾지 못했다는 뜻이다. 추측하지 않았다.

### 1. 한 줄 결론

- **Typecast**: 대본 글자 태그는 없다. 줄마다 요청 필드 `prompt`(v30은 지정 감정 7개+강도 0~2, 또는 스마트 감정)와 `output.audio_tempo`·`audio_pitch`를 정하면 된다. v21은 4개 감정만 된다. 문서 기준으로 2026-10-07과 달라진 계약은 없다.
- **Airy**: 대본 글자 태그도 강도도 없다. 줄마다 정할 값은 `style` 하나(`normal`·`bright`·`calm`·`whisper`)뿐이다. 속도·음높이 필드도 없다. 달라진 점은 `input` 상한이 1,280자에서 1,600자로 바뀐 것 하나다.

### 2. Typecast

#### 2-1. 줄마다 정할 수 있는 요청 값

모든 값은 `POST /v1/text-to-speech`(단건)와 Compose의 tts 구간이 똑같이 받는다. 출처 A, B, C.

| 필드 | 모델 | 허용값·범위 | 기본값 |
|---|---|---|---|
| `model` | 공통 | `ssfm-v30`(권장), `ssfm-v21` | 필수, 기본 없음 |
| `prompt.emotion_type` | v30만 | `"smart"` 또는 `"preset"` | [문서에 없음] 생략 시 서버 기본 감정 |
| `prompt.emotion_preset` | v30 | `normal` `happy` `sad` `angry` `whisper` `toneup` `tonedown` | `normal` |
| `prompt.emotion_preset` | v21 | `normal` `happy` `sad` `angry` (`emotion_type` 필드 없음) | `normal` 예시만 있음 |
| `prompt.emotion_intensity` | v30 preset, v21 | 숫자 0.0~2.0 (0 중립, 2 최대) | 1.0 |
| `prompt.previous_text` | v30 smart만 | 문자열 최대 2,000자 | 빈 문자열 |
| `prompt.next_text` | v30 smart만 | 문자열 최대 2,000자 | 빈 문자열 |
| `output.audio_tempo` | 공통 | 0.5~2.0배 | 1.0 |
| `output.audio_pitch` | 공통 | 정수 -12~+12 반음 | 0 |
| `output.volume` | 공통 | 정수 0~200 (`target_lufs`와 동시 사용 금지) | 100 |
| `text` | 공통 | 1~2,000자 | 필수 |

- smart와 preset은 서로의 필드를 섞어 보내지 않는다(기준선 문서가 스키마 `additionalProperties: false`로 확인). v21에는 smart를 보내지 않는다. [문서에 없음] 어기면 어떤 오류가 나는지.
- 스마트 감정을 쓰면 강도는 보낼 수 없다. 블로그는 smart와 강도·볼륨·피치·속도의 조합 가능 여부를 말하지 않는다(그 페이지는 "추가 설정 필요 없음"이라고만 한다). 다만 tempo·pitch는 `prompt`가 아니라 `output`에 있는 별개 객체라 같은 요청에 함께 둘 수 있는 구조다.
- 감정으로 "속도·음높이"를 대신하라는 설명은 문서에 없다. tempo·pitch는 감정과 독립된 출력 조절이다.
- 쉼: 서버 API의 `text`에 쓰는 쉼 표기는 [문서에 없음]. 단건 API 문서에 SSML·인라인 마크업 언급이 없다. 쉼은 Compose의 `pause` 구간(`duration_seconds` 0 초과~10초, 합계 60초 이하, 무료)으로 넣는다. SDK의 `<|0.3s|>` 표기는 2026-10-07 조사에서 SDK 코드로 확인한 것이고 이번에 공식 문서로 다시 확인하지는 못했다.

#### 2-2. 자동 태그: 대본 감정 → 요청 값 (제안 표, 공식 매핑 아님)

공식 문서는 각 프리셋이 어떻게 들리는지 설명하지 않는다(`toneup`·`tonedown`은 이름뿐). 아래는 이름에서 정한 이 앱의 제안이다.

| 대본 상황 | v30 preset | intensity | v21 |
|---|---|---|---|
| 평이한 서술·대화 | `normal` | 1 (또는 생략) | `normal` |
| 기쁨·신남·웃음 | `happy` | 1~1.5 (크게 기쁠수록 높게) | `happy` |
| 슬픔·낙담·울먹임 | `sad` | 1~1.5 | `sad` |
| 화남·다툼·고함 | `angry` | 1.2~2 | `angry` |
| 속삭임·비밀·소곤 | `whisper` | 1 | 불가 → `normal` + 낮은 tempo (v21 목록에 `whisper` 없음) |
| 들뜬 목소리·놀람·높은 톤 | `toneup` | 1 | 불가 → `normal` (또는 성우 목록에 있을 때만) |
| 가라앉은·낮고 무거운 톤 | `tonedown` | 1 | 불가 → `normal` |
| 급박·빠른 말 | `normal`/`angry` + tempo 1.15~1.3 | - | 같음 |
| 느릿·지침·망설임 | `sad`/`normal` + tempo 0.85~0.95 | - | 같음 |

- tempo·pitch는 감정이 아니라 보조 값으로 쓴다. 제안 범위(문서 한계 안): tempo 0.8~1.3, pitch -3~+3. 큰 값의 품질은 [문서에 없음]. 극단값은 피한다.
- 강도 0~2는 문서가 정한 범위다. 위 구간 값은 제안이다.

#### 2-3. 스마트 감정 사용 조건

- 조건: `model=ssfm-v30`, `prompt={emotion_type:"smart", previous_text?, next_text?}`. v21은 없다. 출처 A, B, D.
- 글자 한도: `previous_text`·`next_text` 각 2,000자. 문맥 두 개 합산 한도는 [문서에 없음]. 문맥 글자가 과금에 드는지 [문서에 없음].
- 대화 문맥에 맞는가: 공식 블로그는 모델이 "글의 흐름을 읽고 감정과 억양을 고른다", 앞뒤 문장을 주면 감정을 더 세밀하게 잡는다고 쓴다. 대화형·게임 NPC·내레이션을 권장 용도로 든다. 블로그 예시가 한국어("드디어 합격 통보를 받았어!" 앞, "정말 꿈만 같아." 뒤)다. 정확도 수치·독립 벤치마크는 없다(업체 주장). 그래서 대본 줄마다 앞줄·뒷줄을 `previous_text`·`next_text`로 주는 방식은 문서가 권하는 사용법과 같다. 다만 말하는 사람이 바뀌는 대화에서 누구의 말인지(화자 구분) 알려 주는 필드는 [문서에 없음]이라, 줄 앞에 화자 이름을 붙일지는 시험이 필요하다.
- 자동 태그 결정: LLM이 감정을 고르게 하는 것(preset)과 모델이 알아서 고르게 하는 것(smart)은 둘 다 가능하다. smart는 LLM 출력 검증이 필요 없고 강도를 못 정한다. preset은 LLM이 enum 안에서 고르므로 제약이 쉽다. 둘 중 기본값은 이 앱이 정한다.

#### 2-4. 성우별 지원 확인

- `GET /v3/voices` 응답의 `models[].version`과 `models[].emotions`(문자열 배열)가 그 성우의 모델별 사용 가능 감정이다. 문서는 "Available emotions vary by voice. Check the `models` field"라고 쓴다. 출처 A, E.
- models 문서는 v30의 7개 감정이 "모든 보이스에서 가능"이라고 쓰나, List Voices 문서 예시는 v30 성우가 `normal,happy,sad,angry` 4개다. 기준선 실측(2026-10-06, 로컬 캐시)은 v30 608명 전원 7개였다. 둘이 어긋나므로 줄마다 보낼 감정은 요청 enum과 성우 `emotions`의 교집합으로 거른다. 커스텀(`uc_`) 보이스 예시는 `["normal"]`뿐이다.
- 2026-10-07 실측: v21 성우는 기본 4개 외에 열거형 밖 값(`cheer`, `soft` 등)을 가진 경우가 있다. 이 값을 `emotion_preset`으로 보내도 되는지는 [문서에 없음]. 자동 태그는 요청 enum 안의 값만 쓴다.

#### 2-5. Compose (구간마다 다른 prompt)

- 있다. `POST /v1/text-to-speech/compose`. 출처 F.
- 한도: 구간 1~50개(tts 최소 1개), 모든 tts `text` 합계 2,000자 이하, 쉼 구간당 최대 10초·합계 60초, 모든 tts의 `audio_format` 동일. 구간마다 voice·model·prompt·output 달라도 된다.
- 과금: 합친 글자 수만, 쉼은 무료. 한 구간이라도 실패하면 전체 실패, 크레딧 차감 없음(2026-10-22 문서 확인).
- 이 문서에서 prompt 필드 자체는 단건 문서를 보라고만 한다. 구간별 prompt가 단건과 같은 필드라는 것은 기준선 문서도 같다.
- 대본 줄이 많은 드라마는 줄마다 단건 요청(줄당 2,000자)으로 보내거나, 한 요청에 합계 2,000자 이내로 묶는 Compose가 있다. 선택은 이 앱이 한다.

#### 2-6. 모델 두 개의 차이 요약

| | v30 | v21 |
|---|---|---|
| 감정 | preset 7 + 강도, smart | preset 4 + 강도 |
| 성우별 감정 | `emotions` 확인 | 성우마다 크게 다름, 확인 필수 |
| 언어 | 37개(한국어 포함) | 27개(한국어 포함) |
| 더 새로운 모델 | 없음 | 없음. `ssfm-v31`은 List Voices `model` 필터 설명에만 나오고 enum·models·changelog에 없다 |

### 3. Airy

#### 3-1. 줄마다 정할 수 있는 요청 값 (모델 `airy-tts-v1` 하나)

출처 G(영어판·한국어판 동일).

| 필드 | 허용값 | 기본값 |
|---|---|---|
| `style` | `normal` `bright` `calm` `whisper` | `normal` |
| `language` | `ko` `en` (필수) | 없음 |
| `input` | 1~1,600자 | 필수 (2026-10-07 문서는 1,280자) |
| `voice` | `GET /v1/voices`의 id | `a597bb7a98fc9ec1` |
| `trailing_silence` | 0~5초 | 0 |
| `response_format` | `wav` `pcm` `mp3` `opus` | `mp3` |

- 속도·음높이·강도 필드는 없다. 스트리밍 합성도 `style`이 같다(스트리밍 문서가 같은 1,600자 문구를 쓴다).
- 각 `style` 값이 어떻게 들리는지 설명은 [문서에 없음]. 한국어 라벨(기본/밝은 느낌/차분한 느낌/속삭임)은 2026-10-07에 스튜디오 화면 문구에서 확인한 것이다.
- 네 값 밖의 값을 보냈을 때의 응답은 [문서에 없음]. 앱은 enum으로 거른다.
- 한국어 동작: `style`이 한국어에서 달라지는 점, 한국어 품질은 [문서에 없음]. `language=ko`는 글자당 1.5크레딧(`en` 1).

#### 3-2. 자동 태그 표 (제안, 공식 매핑 아님)

| 대본 상황 | `style` |
|---|---|
| 평이한 서술·대화, 화남·슬픔(맞는 값이 없음) | `normal` |
| 기쁨·활기·신남 | `bright` |
| 차분·위로·진지·나직함 | `calm` |
| 속삭임·비밀 | `whisper` |

- 화남·슬픔·놀람에 맞는 값은 없다. 그 줄은 `normal`로 두거나 `calm`(슬픔 쪽)으로 두는 선택을 이 앱이 정한다. 공식 설명이 없어 약속하지 않는다.

#### 3-3. 성우별 지원 확인

- 성우별로 `style` 지원이 다른지는 [문서에 없음]. `GET /v1/voices` 응답은 `id, name, gender, langs`만 돌려준다(2026-10-07 기준선). 줄마다 `langs`에 `ko`가 있는지는 확인할 수 있다.

### 4. 대본 안에 글자 태그를 보내면

- **Typecast**: 단건 TTS 문서에 SSML·인라인 태그 언급이 없고(2026-10-22), 감정은 `prompt`로만 제어한다고 한다. `[happy]` 같은 글자를 보내면 읽는지 무시하는지 [문서에 없음]. 기준선 문서도 같다. 안전하게 글자 태그를 지우고 보낸다.
- **Airy**: 문서에 인라인 태그·SSML 언급이 없다. 글자를 보내면 읽는지, 400 `unsupported_characters`(읽을 수 없는 문자)인지 [문서에 없음]. 어떤 문자가 거절되는지도 [문서에 없음]. 글자 태그를 지우고 보낸다.
- 따라서 이 두 공급자의 줄은 다른 공급자 태그(`[laughs]` 등)가 섞인 대본이면 보내기 전에 태그를 제거한다.

### 5. 2026-10-07 문서와 달라진 점

- **Typecast: 계약 변화 없음.** 변경 이력의 마지막 항목은 2026-09-17(SDK의 `remove_silence_ms`)과 2026-09-15(`output.remove_silence_ms`, Compose `segments[].output`에도 적용)이고 10월 항목은 없다. 두 항목 모두 기준선 문서(2026-10-04~10-07)에 이미 반영돼 있다. 감정·스마트 감정·tempo·pitch·prompt 변경 기록은 없다. 새 모델은 없다(`ssfm-v31`은 여전히 필터 설명에만 있음).
- **Airy: `input` 상한 1,280자 → 1,600자.** 영어·한국어 음성 합성 문서와 스트리밍 문서 모두 1,600자다. `style` 값·기본값은 같고 새 제어 필드는 없다. 문서 번들 해시가 바뀌어 있었다(2026-10-07 `index-B1C25uD-.js` → 2026-10-22 `index-Dvw3LiV6.js`). `llms.txt`는 여전히 1,280자와 스튜디오 640자를 적고 있어 문서와 어긋난다. 호출 전에 `llms.txt`보다 문서 본문을 따른다. 앱 상수(`trial-options.ts` 등)에 1,280이 있으면 확인이 필요하다(이 조사에서는 바꾸지 않았다).
- **모델 목록**: Airy `GET /v1/models`는 여전히 `airy-tts-v1`만 안내한다.
- 이 앱이 보내는 값과 문서의 일치: `trial-options.ts`의 `AIRY_STYLES`, `TYPECAST_MODELS`, tempo 0.5~2, pitch -12~12는 문서와 같다.

### 6. 출처 (모두 확인 2026-10-22)

- A. https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech: 요청 본문, prompt 3종, output 범위, 언어. 확인 2026-10-22
- B. https://typecast.ai/docs/models: 모델별 감정·Smart·언어, 더 새로운 모델 없음. 확인 2026-10-22
- C. https://typecast.ai/docs/changelog: 2026-09 두 항목, 10월 없음. 확인 2026-10-22
- D. https://typecast.ai/kr/learn/typecast-api-ssfm-v30-smart-emotion/: 스마트 감정 사용법, 한국어 예시, 용도. 확인 2026-10-22
- E. https://typecast.ai/docs/api-reference/voices/list-voices: `models[].emotions`, `ssfm-v31` 필터 문구. 확인 2026-10-22
- F. https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech: Compose 한도·과금·실패. 확인 2026-10-22
- G. https://airy.so/cloud-api/docs/api/tts/speech-synthesis: 요청 필드, `style`, 1,600자 (SPA라 문서 번들 `content/docs/{en,ko}/api/tts/speech-synthesis.md` 청크를 읽음). 확인 2026-10-22
- H. https://airy.so/cloud-api/docs/api/tts/speech-synthesis-stream: 스트리밍 합성(번들 청크). 확인 2026-10-22
- I. https://airy.so/cloud-api/docs/api/common/models: 모델 목록(번들 청크). 확인 2026-10-22
- J. https://airy.so/llms.txt: 1,280자·스튜디오 640자 기재(문서 본문과 어긋남), 스타일·태그 언급 없음. 확인 2026-10-22
- 이월: SDK 쉼 표기 `<|0.3s|>`, 도움말(감정·쉼 UI), 성우 실측 수치는 `docs/research/tts-emotion-tags.md`(확인 2026-10-07)에서 가져왔고 이번에 다시 확인하지 않았다.

## Gemini 조사: 줄별 연기 값(A)과 자동 태그 텍스트 모델(B)

확인 2026-10-22. 공식 문서만 읽었다(WebFetch). Google API는 부르지 않았다. 문서에 없는 값은 "[문서에 없음]"이다. 출처 번호(S1~)는 4절.

### 1. 한 줄 결론

- (A) 줄마다 정할 수 있는 값은 둘이다. 요청의 `speech_metadata.style` 자연어 문장(길이 상한 [문서에 없음])과 대본 안 영어 꺾쇠 태그(`<sigh>`, `<short pause>` 등 고정 목록). 두 모델 id는 현재도 유효하고 베이스라인(2026-10-07)과 태그 목록이 같다.
- (B) 추천은 `gemini-3.8-flash`(안정판), 같은 `POST /v1beta/interactions` + `response_format`(JSON schema, enum) + `store: false`. 1회 약 $0.0098(2026년), 2027-01-01부터 약 $0.0195. 값싼 대안은 `gemini-3.5-flash-lite`(약 $0.0059). 무료 등급은 프롬프트를 학습에 쓰고 사람이 읽을 수 있어, 이 키는 유료 등급이어야 한다.

### 2. (A) 줄마다 정할 수 있는 값

#### 2-1. 모델 id (S1, S2)

| id | 상태 |
|---|---|
| `gemini-3.8-flash-tts` | 현재 목록에 있음. 가격표에 있음 |
| `gemini-3.8-flash-lite-tts` | 현재 목록에 있음. 가격표에 있음 |
| `gemini-3.1-flash-tts-preview`, `gemini-2.5-pro-preview-tts` | 목록에 있으나 베이스라인 기준 2026-11-17 종료 예정(S1은 종료일을 적지 않음. 베이스라인 문서 D5) |

#### 2-2. 말투 문장: `speech_metadata.style` (S1)

- 위치: 줄의 text 항목 `annotations[]`에 `{"type": "speech_metadata", "style": "<영어 문장>"}`. 이 앱 `gemini.ts`가 이미 이 모양으로 보낸다.
- 용도: 한 차례(줄) 전체에 이어지는 감정·말투·속도·높낮이·음량. 예: `whispered urgently`, `speaking slowly`, `cheerful and friendly`, `sarcastic`, `out of breath`.
- 길이 상한: [문서에 없음]. 문서는 "짧게, 가능하면 비워 두라"고 권한다. 앱 상한은 `GEMINI_DIRECTION_MAX = 100`(앱이 정한 값).
- 다화자일 때만 `speaker` 필드를 같은 객체에 적는다(차례마다 필수). 한 요청 최대 2명, 미리 만든 성우만. 맞춤 성우는 줄마다 따로 합성(S1).
- 대본에 "Say cheerfully:" 같은 지시를 쓰면 읽힐 수 있다. 지시는 `style`에만 둔다(베이스라인 6-1절, S1).
- 자동 태그용 제안: 값은 자유 문장이라 enum으로 막기 어렵다. 앱이 정한 영어 프리셋 목록(베이스라인 6-3절 12개 등)에서 고르게 하고, 선택 안 함도 허용한다.

#### 2-3. 대본 안 꺾쇠 태그 (S1, 확인 시 문서 갱신일 2026-10-12)

문법: `<태그>` 그대로 대본 문자열에 끼운다. 정확한 목록(문서는 "권장" 목록, 전체 보증은 아님):

- 소리: `<argh>` `<breath>` `<heavy breath>` `<exhales>` `<cackle>` `<cheer>` `<chuckle>` `<chuckles>` `<cough>` `<cry>` `<gasp>` `<giggle>` `<groan>` `<growl>` `<grunt>` `<grr>` `<hiss>` `<laugh>` `<laughter>` `<moan>` `<pant>` `<pff>` `<phew>` `<scream>` `<shout>` `<shriek>` `<sigh>` `<sighs>` `<sneeze>` `<snicker>` `<snort>` `<sob>` `<throat-clearing>` `<tsk>` `<whimper>` `<yawn>`
- 속삭임: `<whispers>` `<whispering>` (문서는 지속되는 속삭임은 `style`에 두라고도 함. 모순은 베이스라인 6-1절 그대로)
- 쉼: `<short pause>` `<long pause>`. 그 밖의 쉼 길이 지정(`<medium pause>` 등)은 3.8 목록에 [문서에 없음]
- 겹침 반응: `|oh hmm|` (다화자의 듣는 쪽, 한 줄 안에서). 강조 대문자는 한글에 해당 없음
- 문서는 사람의 발성만 쓰라고 한다(박수 같은 효과음 금지)
- 태그 설명, 위치 규칙(문장 앞/뒤): [문서에 없음]

#### 2-4. 한국어와 변경점

- 한국어는 두 3.8 모델 모두 지원 표에 있다. "비영어 대본에서도 태그는 영어로 쓴다"(S1). 한국어 품질 수치 [문서에 없음].
- 베이스라인 대비 바뀐 것: 태그 목록·`style` 설명은 같다. 새로 확인한 것은 (1) 문서에 "Gemini 4 Argon" 배너가 생겼고 TTS 변경은 없음, (2) 3.8은 단건 출력이 WAV 기본(이전 모델은 raw PCM)이라는 이전 안내 절(앱은 이미 WAV 검사 중), (3) JS SDK 2.24.0 이상, Python 2.25.0 이상. 2026-10 날짜가 붙은 TTS 변경 내역은 [문서에 없음].
- 줄마다 설정 가능한 다른 값(속도·온도 숫자)은 없다. 베이스라인대로 3.8은 `temperature` 등을 거절한다(베이스라인 D26).

### 3. (B) 자동 태그용 텍스트 모델

#### 3-1. 추천 모델 (S3, S4, S5)

| id | 상태 | 입력 $/1M | 출력 $/1M | 비고 |
|---|---|---|---|---|
| `gemini-3.8-flash` | 안정판("가장 똑똑한 Flash") | 0.75 (~2026-12-31), 1.50 (2027-01-01~) | 3.75, 7.50 | 추천. 입력 1,048,576 / 출력 65,536 토큰. 구조화 출력·사고 지원 |
| `gemini-3.5-flash-lite` | 안정판 | 0.30 | 2.50 | 값싼 대안. 한도 같음. 단가 인상 공지 [문서에 없음] |
| `gemini-3.1-flash-lite` | 안정판 | 0.25 (오디오 0.50) | 1.50 | 더 싸지만 한 세대 앞 |
| `gemini-3.6-flash` | 안정판(이전 세대) | 0.75, 1.50 | 3.75, 7.50 | 3.8과 단가가 같아 고를 이유 없음 |

- 이유: 줄별로 허용값 중 연기를 고르는 분류·태깅 작업이라 Flash-Lite로도 되지만, 한국어 대사의 뉘앙스 판단은 3.8 Flash가 안전하고 1회 차이가 약 $0.004이다. 한국어 태깅 품질 비교 자료 [문서에 없음]. 비용을 더 줄이려면 `gemini-3.5-flash-lite`로 바꾸는 것은 모델 id 한 줄이다.
- 같은 키·같은 엔드포인트 계열(`/v1beta/interactions`)로 부를 수 있다(S4, S6). 모델 문서는 2.5 계열을 "기존 사용자만"으로 적고 새 프로젝트에 3.5 Flash-Lite 또는 3.8 Flash를 권한다(S3).

#### 3-2. 호출 경로: 앱 현재 방식(Interactions)과 같다

`POST https://generativelanguage.googleapis.com/v1beta/interactions`, 헤더 `x-goog-api-key`, `Content-Type: application/json` (S4, S6). 본문 모양(필드는 S5·S6에서 확인, 조합한 예시이며 실호출로 검증하지 않았다):

```json
{
  "model": "gemini-3.8-flash",
  "system_instruction": "너는 한국어 드라마 대본의 연기 지시 편집자다. ... 허용값 밖은 쓰지 않는다 ...",
  "input": "<대본 줄 목록 JSON 또는 텍스트>",
  "response_format": {
    "type": "text",
    "mime_type": "application/json",
    "schema": { "...아래 3-3..." : "" }
  },
  "generation_config": { "max_output_tokens": 4096, "thinking_level": "low" },
  "store": false
}
```

- 필드 확인: `system_instruction`(문자열), `input`(문자열 또는 Content 배열), `response_format`, `generation_config.max_output_tokens`(정수), `generation_config.thinking_level`(API 참조는 `minimal`/`low`/`medium`/`high`, 단 `gemini-3.8-flash` 모델 문서는 `minimal`을 오류로 적음. `low`를 쓰면 안전), `store`(S6).
- 현재 TTS 호출은 `input: [{type: "user_input", content: [{type: "text", ...}]}]` 모양이다. 텍스트 호출에서도 이 모양이 받아들여지는지는 이 조사에서 [문서에 없음]. 문서가 보인 모양은 `input`에 문자열을 직접 주는 것이다(S5, S7). 실호출(사용자 승인) 전에 한 가지로 정해야 한다.
- 실호출 확인(2026-10-22, 사용자 승인, 앱 `dramaAutoTag` 경로 그대로): `input` 문자열 + 위 본문 모양으로 200, 약 9.8초. 답 `steps[]`의 `model_output` 글이 schema대로의 JSON이었고, 6줄 제안이 모두 서버 검사(`checkSuggestion`)를 통과했다(대사 글자 그대로). 그 전 두 번은 503 `service_unavailable`('high demand… try again later', 과금 없음)이었다. 자동 태그 화면은 이 경우 '제안을 받지 못했어요. 잠시 뒤 다시 해 주세요'를 보인다.
- 응답: `steps[]` 중 `type: "model_output"`의 `content[]`에서 `{type: "text", text}`를 찾는다. 이 `text`가 JSON 문자열이므로 앱이 다시 `JSON.parse` + zod로 검증한다(S6). `output_text` 같은 편의 필드는 확인하지 못했다. 사용량은 `total_input_tokens`, `total_output_tokens`, `total_thought_tokens`(S6).
- 사고 토큰 과금: 사고 토큰을 출력 단가로 센다는 문구는 읽은 페이지에 [문서에 없음]. 응답에 `total_thought_tokens`가 따로 있어 출력에 더해질 수 있다고 보고 상한을 둔다(`thinking_level: low`, `max_output_tokens`).

#### 3-3. 구조화 출력 문법 (S5)

`response_format.schema`에 JSON schema를 준다. 문서가 지원한다고 적은 키워드: `type`(string, number, integer, boolean, object, array, null), `properties`, `required`, `additionalProperties`, 문자열 `enum`, 숫자 `minimum`/`maximum`, 배열 `items`/`prefixItems`/`minItems`/`maxItems`, `anyOf`, `$ref`, `description`.

```json
{
  "type": "object",
  "properties": {
    "lines": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "items": {
        "type": "object",
        "properties": {
          "index": { "type": "integer", "minimum": 0, "maximum": 49 },
          "style": { "type": "string", "enum": ["cheerful and friendly", "calm and relaxed", "angry tone", "whispered urgently", "sarcastic", "speaking slowly", "speaking rapidly", "none"] },
          "tags": { "type": "array", "maxItems": 3, "items": { "type": "string", "enum": ["sigh", "short pause", "long pause", "laugh", "gasp", "sob"] } }
        },
        "required": ["index", "style", "tags"],
        "additionalProperties": false
      }
    }
  },
  "required": ["lines"]
}
```

- `minLength`/`maxLength`/`uniqueItems` 등은 강제되지 않고 제거된다. `minItems`/`maxItems`는 강제된다(S5). 줄 수 일치, 인덱스 중복은 앱이 서버에서 다시 검사한다.
- enum이 많거나 중첩이 깊으면 `400 INVALID_ARGUMENT`가 날 수 있다(S5). 태그 enum은 위처럼 이 앱이 쓸 일부(수십 개 이하)만 준다. 한도 수치 [문서에 없음].
- 구조화 출력과 도구 조합은 Gemini 3 계열만(S5). 이 호출은 도구를 쓰지 않는다.

#### 3-4. 무보존

- Interactions는 기본 `store=true`(유료 55일, 무료 1일 보관). `store: false`로 끈다(S7). 앱이 이미 TTS에서 쓰는 방식과 같다. `store: false`면 후속 `previous_interaction_id`는 못 쓴다(이 기능은 단발이라 문제 없음).
- 단, `store: false`여도 유료 등급은 남용 감시용으로 프롬프트·응답을 "제한된 기간" 기록한다. 기간 수치 [문서에 없음](S8).

#### 3-5. 1회 비용 추정 (입력 3,000 토큰, 출력 2,000 토큰, 사고 토큰 제외)

| 모델 | ~2026-12-31 | 2027-01-01~ |
|---|---|---|
| `gemini-3.8-flash` | 3,000×0.75 + 2,000×3.75 = $0.00225 + $0.0075 = **$0.00975** | $0.0045 + $0.015 = **$0.0195** |
| `gemini-3.5-flash-lite` | $0.0009 + $0.005 = **$0.0059** | 인상 [문서에 없음] |
| `gemini-3.1-flash-lite` | $0.00075 + $0.003 = **$0.00375** | 인상 [문서에 없음] |

사고 토큰이 출력으로 과금된다면(미확인) 위 값에 `total_thought_tokens × 출력 단가`가 더해진다. 한국어 토큰 수는 글자 수에서 정확히 환산할 근거가 없다([문서에 없음]), 2,000자 대본 + 지시문 3,000 토큰은 가정이다.

#### 3-6. 무료 등급과 학습 사용

- 네 텍스트 모델과 3.8 TTS 두 모델 모두 무료 등급이 있고, 가격표에 "제품 개선에 사용: 무료 Yes / 유료 No"로 적혀 있다(S3).
- 약관: 무료(Unpaid Services)는 제출 내용과 생성 응답을 서비스 개선·개발에 쓰고, 사람 검토자가 읽고 주석을 달 수 있다(계정·키·프로젝트와 분리한 뒤). "민감·기밀·개인 정보를 넣지 말라"(S8). 유료는 프롬프트와 응답을 제품 개선에 쓰지 않는다(S8).
- 결론: 사용자의 드라마 대본이 학습·사람 검토에 쓰이는 것을 피하려면 이 키가 결제 계정이 연결된 프로젝트(유료 등급)여야 한다. 키가 어느 등급인지 API로 알 방법은 [문서에 없음](베이스라인 13절과 같음). 앱에서 무료 표식을 붙이지 말고 안내 문구로 다룬다.

#### 3-7. 한도

- 출력 상한 65,536 토큰, 입력 1,048,576 토큰(S4a, S4b). 이 기능의 출력 약 2,000 토큰은 여유가 크다. `max_output_tokens`는 앱이 낮게(예: 4,096) 고정해 폭주를 막는다.
- 분당·일일 요청 수(RPM·TPM·RPD): 문서에 없고 AI Studio에서만 보인다(S9). 무료 등급의 수치도 같다.
- 지출 기준 제한(10분당): Tier 1 $10, Tier 2 $50, Tier 3 $200(S9). 이 호출 1회 약 $0.01이라 해당 없음.
- 한도는 프로젝트 단위다. TTS 호출과 같은 프로젝트 한도를 함께 쓴다(S9, 베이스라인 7절).

### 4. 출처 (모두 확인 2026-10-22)

| 번호 | URL | 문서 표기 갱신일 | 근거 항목 |
|---|---|---|---|
| S1 | https://ai.google.dev/gemini-api/docs/speech-generation | 2026-10-12 | TTS 모델 id, `speech_metadata.style`, 꺾쇠 태그 목록, 영어 태그 권장, 다화자 |
| S2 | https://ai.google.dev/gemini-api/docs/models | 2026-10-21 | 텍스트 모델 목록, 안정판/프리뷰, 2.5 계열 제한 |
| S3 | https://ai.google.dev/gemini-api/docs/pricing | 2026-10-19 | 텍스트·TTS 단가, 무료 등급, 제품 개선 사용 여부, 2027-01-01 인상 |
| S4a | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash | 2026-09-02 | 입력·출력 토큰 한도, 구조화 출력, thinking_level 값 |
| S4b | https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite | 2026-07-30 | 입력·출력 토큰 한도, 구조화 출력 |
| S5 | https://ai.google.dev/gemini-api/docs/structured-output | 2026-10-21 | `response_format` 문법, enum, 지원·미지원 키워드, 400 가능성 |
| S6 | https://ai.google.dev/api/interactions-api | 문서에서 못 읽음 | `system_instruction`, `store`, `generation_config.max_output_tokens`/`thinking_level`, 응답 `steps`, `usage` 필드 (페이지 앞 100,000자만 읽음) |
| S7 | https://ai.google.dev/gemini-api/docs/interactions-overview | 2026-10-15 | `store` 기본값, 보관 기간, 텍스트 요청 예(`input` 문자열) |
| S8 | https://ai.google.dev/gemini-api/terms | 2026-04-28 | 무료/유료 데이터 사용, 사람 검토, 감시용 기록 |
| S9 | https://ai.google.dev/gemini-api/docs/rate-limits | 2026-10-15 | 등급 구조, 지출 기준 제한, 모델별 RPM 수치 없음 |
| 로컬 | docs/research/gemini-tts-api-options.md, docs/research/tts-emotion-tags.md, packages/api/src/providers/gemini.ts, trial-options.ts | 2026-10-07 베이스라인 | 앱의 현재 호출 모양, 상한 100자 |

### 5. 의심스러운 점

- 텍스트 입력 모양: 앱의 TTS는 `input`에 `user_input` 단계 배열을 쓰고, 텍스트 문서 예시는 문자열이다. 실호출 전에 하나로 확정이 필요하다(사용자 승인 필요한 무료 확인 호출로 가능).
- `response_format`이 `text` + `mime_type` + `schema` 모양인 것은 구조화 출력 문서에서 확인했고, API 참조(S6)에서는 ResponseFormat 필드를 못 읽었다.
- 사고 토큰의 과금 방식과 `thinking_level: low`의 효과, 한국어 태깅 품질은 문서에 없다. 무료 호출이 없으므로 승인된 소수 호출로 시험해야 한다.

