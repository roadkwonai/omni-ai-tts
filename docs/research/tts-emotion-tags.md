# 공급자별 감정 태그 정리

- 확인: 2026-10-07. 공급자 공식 문서·도움말·공식 블로그를 읽었다. 출처는 공급자 절마다 있다. 유료 호출(생성·시험 생성)은 하지 않았다. Typecast 감정 값 실측은 이 앱 로컬 개발 DB에 캐시된 공개 성우 목록(2026-10-06 조회분)을 다시 읽은 것이다.
- 왜(2026-10-07 사용자 요청): 음성 작업실에서 공급자별 감정 태그를 뱃지로 보여 주고, 설명을 보고, 눌러서 대본에 넣고 싶다. 이 문서는 그 기능을 설계할 때(로드맵 T9 Typecast, T10 ElevenLabs·Fish Audio·Airy) 참고하는 사실 모음이다. 화면·동작은 그 TASK 설계에서 정한다.
- 정본: 공급자 계약은 각 `*-api-options.md`, 용어는 `GLOSSARY.md`(말투 태그, 말투, 감정 모드, 감정 자동화). 다섯 번째 공급자 후보 Gemini TTS는 [gemini-tts-api-options](gemini-tts-api-options.md)에 따로 있다(로드맵 T7.6, 2026-10-07 사용자 선택). Gemini 3.8은 대본 안 꺾쇠 태그(`<sigh>`, `<short pause>` 등 비언어·쉼)와 요청의 자연어 `style` 문장(감정·말투·속도)을 나눠 쓰고, 한국어 대본에도 영어 태그를 권한다(그 문서 5·6절).
- 뱃지 이름과 설명은 이 앱을 위한 **제안**이다. 공급자가 정한 한국어 이름이 아니다(Airy 라벨만 Airy 스튜디오 화면 문구).

## 1. 한눈에 보기

| | Typecast | ElevenLabs | Fish Audio | Airy |
|---|---|---|---|---|
| 감정을 주는 곳 | 요청 필드 `prompt` | 대본 안 `[대괄호]` 오디오 태그 | 대본 안 `[대괄호]` 태그 | 요청 필드 `style` |
| 대본 안 태그 | 없음(SSML도 없음) | 있음 | 있음 | 없음(문서에 언급 없음) |
| 태그가 되는 모델(이 앱) | 해당 없음 | `eleven_v4`·`eleven_v3`(v4 Turbo도). `eleven_multilingual_v2`·`eleven_flash_v2_5`는 없음 | `s2.1-pro`·`s2.1-pro-free`(S2 계열). `s1`은 `(괄호)` | 해당 없음 |
| 값 목록 | v30 preset 7개 + 자동(smart). v21 preset 4개(성우에 따라 더 있음) | 공식 자료의 예시 198개. **고정 목록 아님** | 공식 표 71개. **대표 목록이고 자유 문구 허용** | 4개(`normal`·`bright`·`calm`·`whisper`) |
| 대본 중간에 바꾸기 | 불가(요청 하나에 감정 하나). compose는 구간마다 `prompt` | 가능(새 태그부터 바뀐다) | 가능(다음 태그나 문장 끝까지) | 불가(요청 하나에 값 하나) |
| 강도 | `emotion_intensity` 0~2(preset만) | 숫자 없음. 말로 쓴다(`[nervous, trying to sound confident]`) | 숫자 없음. `slightly`·`very`·`extremely` | 없음 |
| 쉼 | SDK 표기 `<\|0.3s\|>`가 compose 쉼 구간이 된다(쉼 무료) | v4·v3 `[pause]`·`[long pause]`, 그 밖 모델 `<break time="1.5s" />` | `[break]`·`[long-break]` | 없음(끝 무음 `trailing_silence`만) |
| 한국어 | 값은 영어 필드 값. 스마트 감정 블로그 예시가 한국어 | 한국어 대본에서의 태그 동작 문구 없음(예시 전부 영어) | 감정 마커는 한국어 포함 13개 언어. 공식 블로그가 한국어 태그(`[속삭이며]`)도 된다고 씀 | 값은 영어 필드 값 |
| 태그 글자 과금 | 해당 없음 | 문서 문구 없음. 포함해 센다 | 문서 문구 없음(토큰 한도에는 안 든다고만). 포함해 센다 | 해당 없음 |
| 자동 태그 | 스마트 감정(문맥으로 감정 선택, API 있음) | 웹의 Enhance 버튼(API 없음, 프롬프트 공개) | 없음 | 없음 |
| 지금 앱(T5 듣기) | 감정 방식·프리셋·강도 고르기 | 자유 입력 말투 태그 1개를 문장 앞에 붙임(30자) | 같음 | 말투 고르기 |

## 2. 설계에 주는 결론

1. **뱃지 동작이 두 가지다.** ElevenLabs(v4·v3)와 Fish Audio(S2)는 뱃지를 누르면 대본에 문자열을 넣는다. Typecast와 Airy는 대본에 넣을 문자열이 없어서, 같은 뱃지가 그 문단(구간)의 요청 설정(`emotion_preset`, `style`)을 바꾸는 동작이 된다. 같은 팔레트에 둘 경우 무엇이 일어나는지 화면에서 구분돼야 한다.
2. **문단마다 감정을 바꾸는 비용이 공급자마다 다르다.** 태그 공급자는 요청 하나로 된다. Typecast·Airy는 구간마다 요청을 나눠야 해서 유료 호출이 문단 수만큼 늘고 오디오가 따로 나온다. Typecast만 compose(`/v1/text-to-speech/compose`, 구간 50개, 텍스트 합계 2,000자, 쉼 무료)로 한 요청에 구간별 `prompt`를 줄 수 있다. 이 앱은 아직 compose를 쓰지 않는다.
3. **대괄호 태그는 정해진 목록이 아니다.** 두 공급자 모두 자유 문구와 조합(`[sad][whispering]`, `[whispering, playful]`)을 허용한다. 뱃지는 추천 목록으로 두고 직접 입력을 막지 않는다. 지금 T5의 자유 입력 말투 태그와도 맞다. 반대로 목록에 있다고 효과가 보장되지는 않는다. 같은 태그도 성우가 그 연기를 학습했는지에 따라 다르다.
4. **태그를 모르는 곳으로 가면 글자로 읽힐 수 있다.** ElevenLabs는 태그를 지원하지 않는 모델이면 "보통 소리 내어 읽는다"고 쓴다(공식 블로그 FAQ). Typecast·Airy·Fish Audio S1에서의 동작은 문서에 없다. 태그가 든 대본으로 공급자나 모델을 바꾸면 보내기 전에 태그를 빼거나 경고하는 규칙이 필요하다.
5. **같은 뜻이라도 철자가 다르다.** 속삭임은 ElevenLabs가 `[whispers]`(동사형)를 주로 쓰고 Fish Audio 감정 문서는 `[whispering]`을 쓴다. Fish Audio 안에서도 문서마다 `[whispering]`과 `[whisper]`가 섞인다. 공급자 공통 뱃지를 만들면 3절처럼 공급자별 문자열을 따로 둬야 한다.
6. **넣는 위치 규칙이 있다.** 감정은 그 감정이 시작될 곳 앞, 보통 문장 앞이 가장 잘 먹는다(Fish Audio). 효과음은 어디든 되지만 뒤에 읽을 글이 있어야 한다(`[laughing] Ha ha`). `[emphasis]`는 강조할 말 바로 앞이다. ElevenLabs의 반응 태그는 문장 뒤도 된다(`This is hard. [sighs]`). 커서 위치에 넣을지 문장 앞에 넣을지 정해야 한다.
7. **사용량은 태그를 포함해 센다.** 두 공급자 모두 태그 글자의 과금 여부를 적지 않았다. ElevenLabs는 글자 수, Fish Audio는 UTF-8 바이트라 한국어 태그(`[속삭이며]`)는 영어 태그보다 바이트가 많다. 지금 T5 규칙(보낼 문장으로 센다)을 그대로 쓴다.
8. **한국어에서 영어 태그와 한국어 태그 중 무엇이 나은지는 들어 봐야 안다.** ElevenLabs는 한국어 문구가 없고, Fish Audio는 한국어 태그가 된다고만 한다. 설계 때 무료 모델 `s2.1-pro-free`(무료 접근은 2026-11-30까지)로 비교 청취를 제안할 수 있다. ElevenLabs 청취는 유료라 사용자 승인이 필요하다.
9. **Typecast 감정 선택지는 성우×모델마다 다르다.** v30은 실측상 608명 모두 7개 프리셋을 가진다(1명만 `tonemid`까지 8개). v21은 기본 4개에 성우마다 다른 값이 붙는다(v21 열거형 밖 16종, 그중 v30 열거형에도 없는 값 13종. Typecast 절 실측 표). 요청 열거형 밖 값을 보내도 되는지는 모른다. 뱃지는 성우의 `models[].emotions`와 요청 열거형의 교집합만 보인다(T5와 같음).
10. **강도는 공급자마다 표현이 다르다.** Typecast만 숫자(0~2)다. 대괄호 공급자는 수식어 문구라 슬라이더가 아니라 "살짝·많이" 같은 변형 뱃지나 직접 입력이 된다. Airy는 강도가 없다.
11. **효과음·다화자 태그는 따로 묶는다.** ElevenLabs의 `[gunshot]`, `[applause]` 같은 효과음은 실험적이고, `[interrupting]`, `[overlapping]` 같은 태그는 여러 성우 대화(Text to Dialogue)용이라 단일 성우 합성에서는 효과가 없을 수 있다.
12. **자동으로 태그를 넣어 주는 기능은 API에 없다.** ElevenLabs Enhance는 웹 버튼뿐이고 프롬프트가 공개돼 있다. 넣는다면 앱이 따로 만드는 기능이고 백로그 P2-01(문맥 기반 감정 자동화)과 이어진다. Typecast 스마트 감정만 API가 문맥으로 감정을 고른다.

## 3. 같은 뜻의 공급자별 문자열 (자주 쓰는 것)

공급자 공통 뱃지를 만든다면 쓸 대응표다. 빈 칸(—)은 문서에 대응 값이 없다는 뜻이다. Typecast·Airy 칸은 대본 문자열이 아니라 요청 필드 값이다. Gemini 칸의 `style …`은 대본이 아니라 요청의 `speech_metadata.style` 문장이다(T7.6에서 붙일 공급자). 이름이 같아도 같은 소리라는 근거는 없다. Typecast `toneup`·`tonedown`과 Airy `bright`는 공식 설명이 없어 어느 뜻에도 대응시키지 않았다.

| 뜻 | 뱃지(제안) | Typecast | ElevenLabs | Fish Audio | Airy | Gemini 3.8(T7.6) |
|---|---|---|---|---|---|---|
| 보통 | 보통 | `normal` | — | — | `normal` | — |
| 기쁨 | 기쁨 | `happy` | `[happy]` | `[happy]` | — | style `cheerful and friendly` |
| 슬픔 | 슬픔 | `sad` | `[sad]` | `[sad]` | — | — |
| 화남 | 화남 | `angry` | `[angry]` | `[angry]` | — | style `angry tone` |
| 차분 | 차분 | — | `[calm]` | `[calm]` | `calm` | style `calm and relaxed` |
| 신남 | 신남 | — | `[excited]` | `[excited]` | — | — |
| 속삭임 | 속삭임 | `whisper`(v30) | `[whispers]`·`[whispering]` | `[whispering]` | `whisper` | `<whispers>`·`<whispering>` 또는 style `whispered …` |
| 외침 | 외침 | — (v21 일부 성우 `shout`) | `[shouts]`·`[shouting]` | `[shouting]` | — | `<shout>` |
| 긴장 | 긴장 | — | `[nervous]` | `[nervous]` | — | — |
| 호기심 | 호기심 | — | `[curious]` | `[curious]` | — | — |
| 놀람 | 놀람 | — | `[surprised]` | `[surprised]` | — | — |
| 비꼼 | 비꼼 | — (v21 일부 성우 `sarcasm`) | `[sarcastic]` | `[sarcastic]` | — | style `sarcastic` |
| 웃음 | 웃음 | — | `[laughs]`·`[laughing]` | `[laughing]` | — | `<laugh>`·`<laughter>` |
| 킥킥 | 킥킥 | — | `[chuckles]` | `[chuckling]` | — | `<chuckle>`·`<chuckles>` |
| 한숨 | 한숨 | — | `[sighs]`·`[sigh]` | `[sighing]` | — | `<sigh>`·`<sighs>` |
| 울음 | 울음 | — | `[crying]` | `[sobbing]`·`[crying loudly]` | — | `<cry>`·`<sob>` |
| 헉 | 헉 | — | `[gasps]` | `[gasping]` | — | `<gasp>` |
| 헛기침 | 헛기침 | — | `[clears throat]` | `[clear throat]` | — | `<throat-clearing>` |
| 짧은 쉼 | 쉼 | `<\|0.5s\|>`(SDK→compose) | `[pause]`(v4·v3) / `<break time="0.5s" />`(그 밖) | `[break]` | — | `<short pause>` |
| 긴 쉼 | 긴 쉼 | `<\|1.5s\|>`(SDK→compose) | `[long pause]`(v4·v3) | `[long-break]` | — | `<long pause>` |
| 강조 | 강조 | — | 대문자(`NOW`) | `[emphasis]`(강조할 말 앞) | — | 대문자(한글 불가) |

## 4. 공급자별 상세

아래 절은 공급자마다 같은 형식이다: 감정 제어 방식 → 모델별 지원 → 태그 전체 목록 → 넣는 규칙 → 한국어 → 과금과 길이 → 공급자 화면의 태그 UI → 이 앱 작업실에 넣을 때 주의 → 기존 문서와 다른 점 → 확인하지 못한 것.

## 4-1. Typecast

- 확인: 2026-10-07, https://typecast.ai/docs/llms.txt, https://typecast.ai/docs/models, https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech, https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech, https://typecast.ai/docs/api-reference/voices/list-voices, https://typecast.ai/docs/changelog, https://typecast.ai/docs/bestpractice/autotag, https://typecast.ai/docs/sdk/javascript, 도움말 https://help.typecast.ai/ko/articles/15372714-app-감정-조절 , https://help.typecast.ai/ko/articles/15372720-app-쉼-추가-호흡-조절 , 블로그 https://typecast.ai/kr/learn/typecast-api-ssfm-v30-smart-emotion/ , 로컬 SDK `@neosapience/typecast-js` 0.4.15(`lib/index.d.ts`, `lib/index.js`)

### 감정 제어 방식
- **요청 필드(구조화 파라미터)다. 대본 안에 넣는 감정 태그는 없다.** 결론: 대본 안 감정 태그 없음, 요청 하나에 감정 하나. 대본 한 덩어리(`text`, 최대 2,000자)에는 감정 하나만 걸린다.
- SSML은 지원하지 않는다고 llms.txt 끝의 Note에 명시돼 있다("SSML is not currently supported"). TTS 문서에도 SSML·XML·인라인 쉼 문법이 없다. https://typecast.ai/docs/llms.txt
- 요청 필드(`prompt`):
  - 지정 감정(preset): `prompt.emotion_type="preset"`, `emotion_preset=<7값>`, `emotion_intensity` 0~2(기본 1). v30.
  - 자동 감정(Smart): `prompt.emotion_type="smart"`, 선택 `previous_text`, `next_text`(각 최대 2,000자). v30 전용. 문맥을 읽고 감정과 톤을 모델이 정한다. https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech , https://typecast.ai/kr/learn/typecast-api-ssfm-v30-smart-emotion/
  - v21: `prompt.emotion_preset`(4값)과 `emotion_intensity`만. `emotion_type` 없음.
- 감정 말고 쉼은 **예외가 하나 있다**: SDK 전용 쉼 마크업 `<|0.3s|>`(아래 "쉼" 참고). 서버가 `text`에서 직접 해석하는 문법이라는 근거는 문서에 없다.

### 모델별 지원
| 모델 | 감정 방식 | 비고 |
|---|---|---|
| ssfm-v30 (2026.01, 권장) | 요청 필드: preset 7값 + 강도, 또는 Smart(+앞뒤 문맥) | 문서 문구는 "모든 보이스에서 가능"이나 성우별 `models[].emotions`를 따른다 https://typecast.ai/docs/models |
| ssfm-v21 (2025.07) | 요청 필드: preset 4값 + 강도 | "availability varies by voice". Smart 없음 |
| ssfm-v31 | 정보 없음 | List Voices의 `model` 필터 설명에만 `ssfm-v31` 문구가 있고 `TTSModel` enum·모델 문서·changelog·SDK 타입에는 없다 https://typecast.ai/docs/api-reference/voices/list-voices |

- 감정 필드를 지원하지 않는 값(예: v21에 smart)을 보냈을 때 동작: 문서에 없음(스키마 위반이라 검증 오류로 보이나 확인 못 함).
- 대본에 `[happy]` 같은 문자열을 넣었을 때 글자 그대로 읽는지: 문서에 없음(정보 없음). 태그 문법이 없으므로 글자로 읽을 것으로 추정할 뿐이다.

### 태그 전체 목록
대본에 넣는 태그는 없다. 아래는 감정 프리셋 필드 값이며, "대본에 넣는 문자열" 칸은 요청 필드 값이다.

| 대본에 넣는 문자열 | 분류 | 뱃지 이름(제안) | 설명 | 지원 모델 | 출처 |
|---|---|---|---|---|---|
| `emotion_preset=normal` | 감정 | 보통 | 감정 없는 기본 전달 | v30, v21 | https://typecast.ai/docs/models |
| `emotion_preset=happy` | 감정 | 기쁨 | 밝고 즐거운 톤 | v30, v21 | 같음 |
| `emotion_preset=sad` | 감정 | 슬픔 | 가라앉은 슬픈 톤 | v30, v21 | 같음 |
| `emotion_preset=angry` | 감정 | 분노 | 화난 톤 | v30, v21 | 같음 |
| `emotion_preset=whisper` | 말투·전달 | 속삭임 | 속삭이듯 낮고 작게 | v30만 | 같음 |
| `emotion_preset=toneup` | 억양·발음 | 높은 톤 | 톤을 올려 들뜬 느낌(설명은 이름에서 온 추정, 공식 설명 없음) | v30만 | 같음 |
| `emotion_preset=tonedown` | 억양·발음 | 낮은 톤 | 톤을 낮춘 차분한 느낌(위와 같음) | v30만 | 같음 |
| `prompt.emotion_type="smart"` | 감정 | 자동 감정 | 문맥(앞뒤 문장)을 읽고 모델이 감정을 고른다 | v30만 | https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech |
| `<\|0.3s\|>` (SDK 쉼 마크업, 숫자는 초) | 쉼·속도 | 쉼 | SDK가 text를 쪼개 compose 요청의 pause 구간으로 바꾼다 | v30, v21(추정, 공식 문서 없음) | 로컬 SDK `lib/index.js`의 `PAUSE_TOKEN = /<\|(\d+(?:\.\d+)?)s\|>/g`, `lib/index.d.ts`의 `composeSpeech` 주석 |

- 문서가 "지원 목록"이라고 한 것: preset 7값(v30), 4값(v21). 그 밖의 문자열은 예시도 없다.
- `emotion_intensity`(0~2, 0 중립, 2 최대)는 preset에만 붙는다. 뱃지 하나가 아니라 값 슬라이더에 가깝다.

### 7개 밖의 감정 문자열 (T3 실측: 모델당 최대 10개)
- 공식 문서(TTS, List Voices, models, changelog), SDK 0.4.15 타입, README 어디에도 7개(`normal happy sad angry whisper toneup tonedown`) 밖의 감정 문자열은 나오지 않는다. List Voices 응답 예시는 `["normal","happy","sad","angry"]`와 커스텀 `["normal"]`뿐이다.
- SDK 타입에서도 `models[].emotions`는 `string[]`로만 선언돼 있고(`ModelInfo.emotions: string[]`) 요청 쪽 `EmotionPreset`은 7값 리터럴 유니온이다.
- 결론: 7개 밖 값의 목록과 `emotion_preset`으로 통하는지는 **정보 없음**. 실측 값은 이 앱의 보이스 목록 응답에서만 알 수 있다.

**실측(이 앱 로컬 개발 DB의 `provider_list_cache`, 2026-10-06에 받은 공개 목록 614명. 과금 없는 목록 조회 결과를 다시 읽었다):**

| 모델 | 성우 수 | 감정 값과 그 값을 가진 성우 수 |
|---|---|---|
| `ssfm-v30` | 608 | `normal`·`happy`·`sad`·`angry`·`whisper`·`toneup`·`tonedown` 모두 608명(전원 7개). `tonemid` 1명 |
| `ssfm-v21` | 535 | 기본 4개(`normal`·`happy`·`sad`·`angry`) 535명 전원. 그 밖: `toneup` 122, `tonemid` 102, `tonedown` 65, `cheer` 12, `soft` 12, `whisper` 10, `shout` 7, `cute` 7, `urgent` 5, `casual` 4, `sarcasm` 3, `trustful` 3, `scream` 3, `cold` 3, `inspire` 1, `regret` 1 |

- 성우당 감정 수: v30은 607명이 7개, 1명이 8개. v21은 4개 316명, 5개 124명, 6개 66명, 7개 21명, 8~10개 8명.
- 그래서 "모델당 최대 10개"는 v21 이야기다. v30은 사실상 7개 고정이다. 기존 문서가 근거로 든 "List Voices 응답 예시의 v30 성우는 4개"는 실제 목록과 다르다.
- v21 성우의 추가 값 16종은 모두 v21 요청 열거형(4개) 밖이다. 그중 `toneup`·`tonedown`·`whisper`는 v30 열거형(7개)에는 있고, 나머지 13종(`tonemid`, `cheer`, `soft`, `shout`, `cute`, `urgent`, `casual`, `sarcasm`, `trustful`, `scream`, `cold`, `inspire`, `regret`)은 어느 열거형에도 없다. `emotion_preset`으로 보내도 되는지는 여전히 정보 없음이다. 확인하려면 유료 호출 1회가 필요하다.

### 넣는 규칙
- 위치: 대본이 아니라 요청 필드. 대본 안에서 감정을 바꿀 수 없다.
- 개수: 요청마다 감정 하나. 문단마다 감정을 다르게 하려면 **문단(구간)별로 요청을 나눠야 한다**(요청당 `text` 최대 2,000자). Compose 엔드포인트(`/v1/text-to-speech/compose`)는 `tts` 구간마다 `prompt`를 받으므로(단일 TTS와 같은 필드) 구간별 감정과 쉼을 한 파일로 합치는 경로가 된다. 제한: 구간 최대 50개, 모든 tts 텍스트 합계 2,000자, 쉼은 구간당 10초·합계 60초, audio_format 동일. https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech
- 강도: `emotion_intensity` 0~2 숫자(preset일 때만). Smart에는 강도 없음.
- Smart 문맥: `previous_text`, `next_text` 각 최대 2,000자, 합성 대상은 `text`. 문맥을 줘야 정확해진다고 블로그가 설명한다("if you pass the before and after content ... captures emotion more precisely" 취지). 같은 요청에서 smart와 preset 필드를 섞지 않는다(스키마가 `additionalProperties: false`, 기존 문서 근거).
- 자유 문구: 없다. 닫는 태그: 없다. 줄 단위 범위: 없다(요청 단위).

### 한국어 대본에서
- v30은 한국어를 포함한 37개 언어(문구는 "35+")를 지원한다. v21은 27개 언어. https://typecast.ai/docs/models
- 감정 필드는 영어 값 그대로 쓴다(한국어 감정 값 없음). 언어별 감정 제약: 문서에 없음.
- Smart 블로그의 예시 문장이 한국어("드디어 해냈어!")이며 한국어에서 동작하는 것으로 소개된다. 품질 수치는 없다.

### 과금과 길이
- 감정 필드는 글자 수에 들어가지 않는다. `text` 최대 2,000자.
- Smart의 `previous_text`·`next_text`가 과금 글자에 들어가는지: 정보 없음.
- Compose: "Credits are charged only for the combined text length; pauses are free." 쉼은 무료. `<|0.3s|>` 문자열이 글자 수에 드는지는 SDK가 text에서 떼어내므로 들지 않는 것으로 보이나 문서 확인은 못 했다.

### 공급자 화면의 태그 UI
- 웹 편집기(APP)는 태그가 아니라 **스크립트(문장 블록) 선택 후 하단 메뉴**로 감정을 바꾼다. 감정 옆의 %를 눌러 강도를 정하고, 되돌릴 때는 "일반"으로 바꾼다. 스마트 감정 설명은 이 도움말에 없다. https://help.typecast.ai/ko/articles/15372714-app-감정-조절
- 쉼: 스크립트를 선택하고 "쉼 추가" 버튼, 길이를 입력해 "추가". 추가한 쉼을 눌러 값을 바꾼다. 최소 0.1초(0.0초는 0.1초로 처리), 최대 값 명시 없음. 띄어쓰기에는 쉼 0.1초가 자동 적용된다. https://help.typecast.ai/ko/articles/15372720-app-쉼-추가-호흡-조절
- 이 UI들이 내부적으로 어떤 문자열로 저장되는지는 정보 없음. 자동 태그 추천 기능은 확인되지 않았다. AutoTag SDK는 전화번호·날짜·통화 같은 낭독 형식 변환용이며 감정 태그를 만들지 않는다. https://typecast.ai/docs/bestpractice/autotag
- 속도 조절 도움말도 있다(`15372718`). 읽지는 않았다.

### 이 앱 작업실에 넣을 때 주의
1. Typecast는 대본에 넣는 감정 태그가 없다. "눌러서 대본에 넣는" 뱃지 모델이 맞지 않는다. 뱃지는 대본 문자열이 아니라 **구간(문단)의 속성**으로 저장해야 한다.
2. 문단마다 감정이 다르면 요청을 나누거나 compose를 써야 한다. 나누면 유료 호출이 문단 수만큼 늘고, 구간 사이 이음새(호흡·톤 연결)는 직접 처리해야 한다. 이 앱 현재 구현은 compose를 쓰지 않는다(기존 문서).
3. 감정 선택지는 성우×모델의 `models[].emotions`를 따른다. 문서의 "모든 보이스 가능"과 응답 예시(v30 성우에 4개)가 어긋나므로 7개를 무조건 열면 안 된다. 7개 밖 값은 요청 enum에 없다.
4. Smart는 앞뒤 문맥을 요청에 따로 줘야 정확하다. 문단별로 나누면 그 문단의 앞뒤 대본이 `previous_text`·`next_text` 후보가 된다(각 2,000자).
5. 감정 강도(0~2)는 preset 전용이고 Smart에서는 보내면 안 된다. 뱃지 UI에서 모드에 따라 비활성화해야 한다.
6. 쉼 `<|0.3s|>`는 SDK 기능이며 compose로 변환된다. 평범한 `/v1/text-to-speech`의 `text`에 그대로 넣으면 글자로 읽을지 무시할지 문서에 없다. 서버에서 직접 호출하는 이 앱은 SDK 변환을 따라 하거나 쓰지 않는 쪽을 정해야 한다.
7. 감정 값 검증은 서버에서 한다. 유료 호출을 막으려면 요청 전에 enum과 보이스의 `emotions` 교집합을 확인한다.

### 기존 문서와 다른 점
- 기존 문서(`docs/research/typecast-api-options.md`)의 prompt 스키마, 7개·4개 값, v30/v21 표, v31 불일치, 7개 초과 감정 정보 없음은 모두 재확인했고 같다.
- 달라진 점(새로 확인): ① SDK 0.4.15에 쉼 마크업 `<|N.Ns|>`(`parsePauseMarkup`)와 `composeSpeech().say()/.pause()`가 있다. 기존 문서는 compose를 "쓰지 않음"으로 정리했고 SDK 마크업은 적지 않았다. ② Compose 제한(구간 50개, 합계 2,000자, 쉼 구간당 10초·합계 60초, 쉼 무료)과 구간별 `prompt` 허용. ③ 웹 편집기 도움말의 감정·쉼 UI 설명. ④ llms.txt Note의 "SSML not supported" 문구.

### 확인하지 못한 것
- `ssfm-v31` 실존 여부와 감정 방식.
- v21 성우의 열거형 밖 감정 값(위 실측 16개)이 `emotion_preset`으로 통하는지.
- 대본에 태그 문자열을 넣었을 때의 서버 동작(글자로 읽는지).
- 일반 `/v1/text-to-speech`의 `text`에서 `<|0.3s|>`를 서버가 해석하는지.
- Smart 문맥 글자의 과금 포함 여부, `prompt` 생략 시 기본 감정.
- 웹 편집기에 스마트 감정이 있는지(도움말에 없음), 편집기 감정 메뉴의 실제 감정 이름 목록, 속도 조절 도움말.

## 4-2. ElevenLabs

- 확인: 2026-10-07. 읽은 곳(출처 약호를 표의 출처 칸에 쓴다):
  - B = [Best practices의 Prompting Eleven v4 절](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v4) (공식 문서. "Enhancing input" 절의 Enhance 프롬프트는 E로 따로 표시)
  - H = [How do audio tags work with Eleven v3 and v4?](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-do-audio-tags-work-with-eleven-v3-and-v4.md) (공식 도움말)
  - V4 = [Eleven v4](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4) (공식 문서), M = [Models](https://elevenlabs.io/docs/overview/models) (공식 문서)
  - L = [The Eleven v4 Audio Tags list](https://elevenlabs.io/blog/elevenlabs-audio-tags-list) (공식 블로그, 2026-09-30)
  - EM = [Emotional Text to Speech with Eleven v4](https://elevenlabs.io/blog/emotional-text-to-speech-with-eleven-v4) (공식 블로그, 2026-09-28)
  - P = [How to add pauses in AI voiceover with Eleven v4](https://elevenlabs.io/blog/how-to-add-pauses-in-ai-voiceover) (공식 블로그, 2026-10-02)
  - A = [Audio Tags 101](https://elevenlabs.io/blog/v3-audiotags) (공식 블로그)
  - V3E = [expressing emotional context](https://elevenlabs.io/blog/eleven-v3-audio-tags-expressing-emotional-context-in-speech), V3S = [situational awareness](https://elevenlabs.io/blog/eleven-v3-situational-awareness), V3N = [narrative intelligence](https://elevenlabs.io/blog/eleven-v3-audio-tags-enabling-narrative-intelligence-in-speech), V3M = [multi-character dialogue](https://elevenlabs.io/blog/eleven-v3-audio-tags-bringing-multi-character-dialogue-to-life), V3P = [precision delivery control](https://elevenlabs.io/blog/eleven-v3-audio-tags-precision-delivery-control-for-ai-speech), V3C = [character direction](https://elevenlabs.io/blog/eleven-v3-character-direction) (공식 블로그, v3 출시 때 글. 일부는 2026-09-30에 갱신)
  - 그 밖: [Text to Speech 제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech), [pauses·SSML와 API 도움말](https://elevenlabs.io/docs/help-center/technical/do-pauses-and-ssml-phoneme-tags-work-with-the-api.md), [허용 문자 도움말](https://elevenlabs.io/docs/help-center/troubleshooting/what-characters-are-accepted-when-generating-audio.md), [OpenAPI](https://api.elevenlabs.io/openapi.json), [ElevenAgents Expressive mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode.md)
- 이 앱이 쓰는 모델: `packages/api/src/providers/trial-options.ts`의 `ELEVENLABS_MODELS`는 `eleven_v4`, `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5` 네 개다. 기본값은 `eleven_v4`다. 시험 생성의 `tag` 설정은 `eleven_v4`·`eleven_v3`에만 열려 있고(`FIELDS`), 값이 있으면 코드가 `[${tag}] ${text}`로 **대본 맨 앞에 한 번** 붙인다(`trial-options.ts` 268~269행). multilingual_v2·flash_v2_5에서는 `tag` 필드가 없어 붙지 않는다.

### 감정 제어 방식

- **인라인 태그(Audio Tags)**. 대본 `text` 안에 대괄호로 짧은 지시를 쓴다. 문법은 `[excited]`, `[whispers]`, 쉼표로 겹치기 `[whispering, playful]`(L), 길게 풀어 쓴 문구 `[like a sports commentator, speeding up]`도 된다(L). 요청 필드나 enum은 없다. convert 요청에 `emotion` 같은 필드가 없다는 것은 기존 문서와 같다.
- **고정 목록이 아니다.** 공식 문서와 블로그 모두 목록은 예시일 뿐이라고 쓴다. B: "There are likely many more effective tags beyond this list. Experiment with descriptive emotional states and actions". L: "There's no fixed limit on the number of ElevenLabs Audio Tags ... Write any tag you like in natural language". Enhance 프롬프트도 목록을 "Non-Exhaustive ... You can infer similar, contextually appropriate audio tags"라고 부른다. 그래서 아래 표는 "이 문자열만 된다"가 아니라 "문서가 보여 준 문자열"이다.
- **한 대본 안에서 바꿀 수 있다.** 태그는 이후 문장에 이어지고(L: "Emotion carries forward across the line, meaning you only need to introduce another tag when you want the delivery to shift"), 새 태그를 넣으면 거기서 바뀐다. 한 요청에 감정을 하나만 쓰는 제약은 없다. 문장 중간에 새 태그를 넣어 바꿔도 된다(EM).
- 태그 효과의 길이: TTS 문서에는 "몇 단어"라는 제한이 없다. 반면 ElevenAgents Expressive mode 문서는 "태그는 다음 4~5단어 정도에 영향"이라고 쓴다. 이는 에이전트 제품 문서이므로 TTS convert에 그대로 적용된다고 보지 않는다.
- 그 밖의 감정 수단: 문장부호(`...`는 쉼과 무게, 대문자는 강조, 줄표는 끊김), 서술형 문맥(`"..." she asked, her voice trembling`). 서술형은 모델이 그 설명 문장까지 읽어 버린다고 문서가 적는다(B의 Emotion 절). 요청 필드 `voice_settings.stability`(낮을수록 변동 폭이 큼)도 표현 폭에 영향을 준다(V4).

### 모델별 지원

| 모델 | 감정 방식 | 비고 |
|---|---|---|
| `eleven_v4` | 오디오 태그. 문서는 v3보다 정교하다고 쓴다 | 한도 10,000자(M). SSML 없음. Stability·Similarity 두 설정만(V4). "완벽하지 않고 계속 개선 중"(B). 90+ 언어(M)에 Korean 포함 |
| `eleven_v4_turbo` | 오디오 태그 | H와 L이 "also supports audio tags"라 명시. API 경로는 L이 "Create speech, Stream speech, Text to Dialogue"라고 쓰지만 `eleven_v4_turbo`가 convert에서 되는지는 문장이 모호함(기존 문서도 정보 없음으로 둠) |
| `eleven_v3` | 오디오 태그. v3와 v4에서 "같은 태그가 둘 다 된다"(H), "v3용 스크립트는 v4에서도 된다"(L) | 한도 5,000자(M). 이 문서는 v3를 "이전 세대"라 부르고 v4 전환을 권한다(B). "v3가 태그를 소리 내 읽는 경우"는 성우가 요청한 연기와 안 맞을 때라고 A가 적는다(조용한 성우에게 `[shouts]` 여러 번) |
| `eleven_v3_conversational` | 오디오 태그(M에 "Audio tags for fine-grained control") | 실시간용. 이 앱 대상 아님 |
| `eleven_multilingual_v2`, `eleven_flash_v2_5` 등 | **태그 없음** | 공식 문서에 "태그를 넣으면 이렇게 된다"는 직접 서술은 정보 없음. 가장 가까운 문장: L의 FAQ "An Audio Tag is usually read aloud when the selected model doesn't support tags, or when the tag isn't formatted correctly" (대괄호가 아니라 괄호·중괄호를 쓴 경우도 포함). 즉 태그를 지원하지 않는 모델에서는 글자로 읽히는 것이 일반적이라는 뜻이다. 이 모델들은 SSML `<break>`로 쉼을 만든다 |

### 태그 전체 목록

공식 문서와 블로그에 나온 것만 모았다. **전부 예시이며 정해진 지원 목록이 아니다.** 문서는 v3와 v4에서 태그 목록이 다르다고 쓰지 않는다. 지원 모델 칸의 `v4·v3`는 "공식이 v3와 v4에서 같은 태그가 된다고 말했고, 이 태그를 개별로 v3·v4에 따로 검증한 문서는 없다"는 뜻이다. `v4 Turbo`에 대해서도 같다(H: "also supports audio tags"). 일부 출처 약호 뒤 `(자연어 예시)`는 목록이 아니라 예문 속에 쓰인 것, `(조합 예시)`는 쉼표 조합 예문이다. 같은 의미의 변형(`[sigh]`·`[sighs]`·`[sighing]`)은 문서에 각각 나와서 따로 적었다. 대소문자: V3S는 `[EXCITED]`·`[SHOUTING]`처럼 대문자 태그도 쓴다(강조 용도로 보이나 설명 없음).

| 대본에 넣는 문자열 | 분류 | 뱃지 이름(제안) | 설명 | 지원 모델 | 출처 |
|---|---|---|---|---|---|
| `[excited]` | 감정 | 신남 | 들뜨고 높은 에너지로 말한다 | v4·v4 Turbo·v3 | L,B,A,E |
| `[playful]` | 감정 | 장난기 | 가볍고 장난스러운 말투 | v4·v4 Turbo·v3 | L |
| `[amazed]` | 감정 | 놀라움 | 감탄하는 느낌 | v4·v4 Turbo·v3 | L |
| `[powerful]` | 감정 | 당당함 | 힘 있고 강한 느낌 | v4·v4 Turbo·v3 | L |
| `[proud]` | 감정 | 자랑스러움 | 뿌듯하고 으쓱한 느낌 | v4·v4 Turbo·v3 | L |
| `[optimistic]` | 감정 | 낙관 | 밝고 희망적인 느낌 | v4·v4 Turbo·v3 | L |
| `[startled]` | 감정 | 화들짝 | 깜짝 놀란 느낌 | v4·v4 Turbo·v3 | L |
| `[mad]` | 감정 | 화남 | 화가 난 느낌 | v4·v4 Turbo·v3 | L |
| `[aggressive]` | 감정 | 공격적 | 거칠고 공격적인 느낌 | v4·v4 Turbo·v3 | L |
| `[bitter]` | 감정 | 씁쓸함 | 원망 섞인 씁쓸한 느낌 | v4·v4 Turbo·v3 | L |
| `[critical]` | 감정 | 비판적 | 따지는 듯한 느낌 | v4·v4 Turbo·v3 | L |
| `[repelled]` | 감정 | 거부감 | 역겨워 물러서는 느낌 | v4·v4 Turbo·v3 | L |
| `[anxious]` | 감정 | 불안 | 불안한 느낌 | v4·v4 Turbo·v3 | L |
| `[stressed]` | 감정 | 예민함 | 스트레스 받은 느낌 | v4·v4 Turbo·v3 | L |
| `[scared]` | 감정 | 무서움 | 겁먹은 느낌 | v4·v4 Turbo·v3 | L |
| `[threatened]` | 감정 | 위협받음 | 위협을 느끼는 느낌 | v4·v4 Turbo·v3 | L |
| `[vulnerable]` | 감정 | 여림 | 여리고 무방비한 느낌 | v4·v4 Turbo·v3 | L |
| `[confused]` | 감정 | 혼란 | 어리둥절한 느낌 | v4·v4 Turbo·v3 | L |
| `[busy]` | 감정 | 분주함 | 바쁘고 정신없는 느낌 | v4·v4 Turbo·v3 | L |
| `[tired]` | 감정 | 지침 | 피곤한 느낌 | v4·v4 Turbo·v3 | L,V3E,A,V3S |
| `[bored]` | 감정 | 지루함 | 지루한 느낌 | v4·v4 Turbo·v3 | L |
| `[distant]` | 감정 | 무심함 | 거리를 둔 느낌 | v4·v4 Turbo·v3 | L |
| `[despair]` | 감정 | 절망 | 절망한 느낌 | v4·v4 Turbo·v3 | L |
| `[let down]` | 감정 | 실망 | 기대가 꺾인 느낌 | v4·v4 Turbo·v3 | L |
| `[peaceful]` | 감정 | 평온 | 차분하고 평화로운 느낌 | v4·v4 Turbo·v3 | L |
| `[content]` | 감정 | 흡족 | 만족한 느낌 | v4·v4 Turbo·v3 | L |
| `[curious]` | 감정 | 호기심 | 궁금해하는 느낌 | v4·v4 Turbo·v3 | L,B,A,H |
| `[thoughtful]` | 감정 | 생각 중 | 숙고하는 느낌 | v4·v4 Turbo·v3 | L,E |
| `[trusting]` | 감정 | 신뢰 | 믿는 듯한 느낌 | v4·v4 Turbo·v3 | L |
| `[jittery]` | 감정 | 안절부절 | 초조해 떠는 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[intrigued]` | 감정 | 흥미진진 | 흥미를 느끼는 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[smug]` | 감정 | 득의양양 | 의기양양한 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[puzzled]` | 감정 | 갸우뚱 | 이해가 안 되는 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[disgusted]` | 감정 | 혐오 | 역겨워하는 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[frazzled]` | 감정 | 허둥지둥 | 정신없이 허둥대는 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[hopeful]` | 감정 | 기대 | 희망 섞인 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[triumphant]` | 감정 | 승리감 | 이겼다는 환희 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[mischievous]` | 감정 | 짓궂음 | 장난기 어린 짓궂은 느낌 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[mischievously]` | 감정 | 짓궂게 | 짓궂게 말한다 | v4·v4 Turbo·v3 | B,H |
| `[furious]` | 감정 | 격노 | 아주 화난 느낌 | v4·v4 Turbo·v3 | EM |
| `[worried]` | 감정 | 걱정 | 조심스럽고 확신 없는 느낌 | v4·v4 Turbo·v3 | EM,A |
| `[terrified]` | 감정 | 공포 | 극도로 겁먹은 느낌 | v4·v4 Turbo·v3 | EM(자연어 예시) |
| `[alarmed]` | 감정 | 경계 | 놀라 경계하는 느낌 | v4·v4 Turbo·v3 | EM(자연어 예시) |
| `[fearful]` | 감정 | 두려움 | 두려운 느낌 | v4·v4 Turbo·v3 | L(조합 예시 `[whispering, fearful]`) |
| `[hesitant]` | 감정 | 머뭇 | 머뭇거리는 느낌 | v4·v4 Turbo·v3 | EM,V3E,V3P |
| `[nervous]` | 감정 | 긴장 | 긴장한 느낌 | v4·v4 Turbo·v3 | V3E,V3S,V3P,EM |
| `[sad]` | 감정 | 슬픔 | 슬픈 느낌 | v4·v4 Turbo·v3 | A,E |
| `[angry]` | 감정 | 분노 | 화난 느낌 | v4·v4 Turbo·v3 | A,E |
| `[happily]` | 감정 | 행복하게 | 행복하게 말한다 | v4·v4 Turbo·v3 | A |
| `[happy]` | 감정 | 기쁨 | 기쁜 느낌 | v4·v4 Turbo·v3 | E |
| `[sorrowful]` | 감정 | 비통 | 슬픔이 깊은 느낌 | v4·v4 Turbo·v3 | A,V3E |
| `[upset]` | 감정 | 속상함 | 속상한 느낌 | v4·v4 Turbo·v3 | A |
| `[frustrated]` | 감정 | 답답함 | 좌절하고 답답한 느낌 | v4·v4 Turbo·v3 | V3E,V3M,V3S |
| `[annoyed]` | 감정 | 짜증 | 짜증 난 느낌 | v4·v4 Turbo·v3 | V3M,A,E |
| `[appalled]` | 감정 | 경악 | 기가 막힌 느낌 | v4·v4 Turbo·v3 | E |
| `[surprised]` | 감정 | 놀람 | 놀란 느낌 | v4·v4 Turbo·v3 | V3M,V3E,A,E |
| `[sarcastic]` | 감정 | 비꼼 | 비꼬는 말투 | v4·v4 Turbo·v3 | B,V3M,V3N,EM |
| `[sarcastically]` | 감정 | 비꼬며 | 비꼬며 말한다 | v4·v4 Turbo·v3 | V3M,V3C,A |
| `[sarcastic tone]` | 감정 | 비꼬는 톤 | 비꼬는 톤 | v4·v4 Turbo·v3 | V3N |
| `[crying]` | 감정 | 울먹임 | 울면서 말한다 | v4·v4 Turbo·v3 | B,H,EM |
| `[starts crying]` | 감정 | 울기 시작 | 말하다 울음이 터진다 | v4·v4 Turbo·v3 | L |
| `[calm]` | 감정 | 침착 | 차분한 느낌 | v4·v4 Turbo·v3 | V3E |
| `[cheerfully]` | 감정 | 명랑하게 | 명랑하게 말한다 | v4·v4 Turbo·v3 | V3E |
| `[deadpan]` | 감정 | 무표정 | 감정 없이 건조하게 | v4·v4 Turbo·v3 | V3E |
| `[flatly]` | 감정 | 담담하게 | 평평한 톤으로 | v4·v4 Turbo·v3 | V3E,V3P |
| `[regretful]` | 감정 | 후회 | 후회하는 느낌 | v4·v4 Turbo·v3 | V3E |
| `[resigned tone]` | 감정 | 체념 톤 | 체념한 톤 | v4·v4 Turbo·v3 | V3E |
| `[resigned]` | 감정 | 체념 | 체념한 느낌 | v4·v4 Turbo·v3 | V3N |
| `[wistful]` | 감정 | 아련함 | 그리움 섞인 느낌 | v4·v4 Turbo·v3 | V3N |
| `[awe]` | 감정 | 경외 | 경외감 | v4·v4 Turbo·v3 | V3E,V3N,A |
| `[dismissive]` | 감정 | 시큰둥 | 대수롭지 않게 넘기는 느낌 | v4·v4 Turbo·v3 | A,V3C |
| `[cheeky]` | 감정 | 까불거림 | 까불거리는 느낌 | v4·v4 Turbo·v3 | A |
| `[flustered]` | 감정 | 당황 | 당황한 느낌 | v4·v4 Turbo·v3 | V3M |
| `[panicking]` | 감정 | 패닉 | 공황에 빠진 느낌 | v4·v4 Turbo·v3 | V3M,V3E,A |
| `[lighthearted]` | 감정 | 가벼운 마음 | 가볍고 밝은 느낌 | v4·v4 Turbo·v3 | V3N |
| `[reflective]` | 감정 | 회상조 | 되돌아보는 느낌 | v4·v4 Turbo·v3 | V3N |
| `[casual]` | 감정 | 편안함 | 격의 없는 느낌 | v4·v4 Turbo·v3 | V3M |
| `[disbelief]` | 감정 | 믿기지 않음 | 믿기지 않는 느낌 | v4·v4 Turbo·v3 | L |
| `[whispers]` | 말투·전달 | 속삭임 | 속삭이며 말한다 | v4·v4 Turbo·v3 | B,L,A,H,V3M,V3E |
| `[whispering]` | 말투·전달 | 속삭이며 | 속삭이며 말한다 | v4·v4 Turbo·v3 | B,V3S,V3P |
| `[whisper]` | 말투·전달 | 속삭임 | 속삭인다 | v4·v4 Turbo·v3 | A,E,V3S,EM |
| `[shouts]` | 말투·전달 | 외침 | 소리친다 | v4·v4 Turbo·v3 | L,A,H |
| `[shouting]` | 말투·전달 | 고함 | 고함치듯 말한다 | v4·v4 Turbo·v3 | B,A,V3S |
| `[softly]` | 말투·전달 | 부드럽게 | 낮고 부드럽게 | v4·v4 Turbo·v3 | L,A |
| `[quietly]` | 말투·전달 | 조용히 | 작게 말한다 | v4·v4 Turbo·v3 | L,A,V3E,V3S |
| `[hushed]` | 말투·전달 | 숨죽임 | 숨죽여 말한다 | v4·v4 Turbo·v3 | L |
| `[barely audible]` | 말투·전달 | 들릴락말락 | 거의 안 들릴 만큼 작게 | v4·v4 Turbo·v3 | L |
| `[booming]` | 말투·전달 | 우렁참 | 크고 울리는 목소리 | v4·v4 Turbo·v3 | L,A |
| `[loudly]` | 말투·전달 | 크게 | 크게 말한다 | v4·v4 Turbo·v3 | V3S |
| `[cautiously]` | 말투·전달 | 조심스레 | 조심스럽게 | v4·v4 Turbo·v3 | V3E,V3M,A |
| `[dramatically]` | 말투·전달 | 극적으로 | 극적으로 | v4·v4 Turbo·v3 | V3M |
| `[dramatic]` | 말투·전달 | 극적 | 극적인 말투 | v4·v4 Turbo·v3 | V3C |
| `[dramatic tone]` | 말투·전달 | 극적 톤 | 극적인 톤 | v4·v4 Turbo·v3 | V3N |
| `[matter-of-fact]` | 말투·전달 | 덤덤하게 | 사실만 말하듯 | v4·v4 Turbo·v3 | V3N,V3C |
| `[conversational tone]` | 말투·전달 | 대화체 | 대화하듯 | v4·v4 Turbo·v3 | V3N |
| `[serious tone]` | 말투·전달 | 진지하게 | 진지한 톤 | v4·v4 Turbo·v3 | V3N |
| `[deep voice]` | 말투·전달 | 저음 | 깊은 목소리 | v4·v4 Turbo·v3 | V3M |
| `[low, gravelly voice]` | 말투·전달 | 걸걸한 저음 | 낮고 거친 목소리. 효과음으로 오해되지 않게 쓰라는 예시 | v4·v4 Turbo·v3 | B |
| `[low, threatening]` | 말투·전달 | 위협조 | 낮고 위협적으로 | v4·v4 Turbo·v3 | L |
| `[whiny]` | 말투·전달 | 칭얼 | 칭얼대는 말투 | v4·v4 Turbo·v3 | V3C |
| `[childlike tone]` | 말투·전달 | 아이 같은 | 아이 같은 톤 | v4·v4 Turbo·v3 | V3M |
| `[robotic tone]` | 말투·전달 | 로봇 톤 | 로봇 같은 톤 | v4·v4 Turbo·v3 | V3M |
| `[questioning]` | 말투·전달 | 의문조 | 묻는 듯한 톤 | v4·v4 Turbo·v3 | V3P |
| `[suspicious tone]` | 말투·전달 | 의심 톤 | 의심하는 톤 | v4·v4 Turbo·v3 | V3P |
| `[timidly]` | 말투·전달 | 소심하게 | 소심하게 말한다 | v4·v4 Turbo·v3 | V3P |
| `[understated]` | 말투·전달 | 절제 | 절제하여 말한다 | v4·v4 Turbo·v3 | V3P |
| `[emphasized]` | 말투·전달 | 강조 | 강조해서 말한다 | v4·v4 Turbo·v3 | V3N,V3P |
| `[stress on next word]` | 말투·전달 | 다음 단어 강조 | 다음 단어에 힘을 준다 | v4·v4 Turbo·v3 | V3P |
| `[continues softly]` | 말투·전달 | 이어서 작게 | 말을 이어 작게 말한다 | v4·v4 Turbo·v3 | V3N |
| `[fantasy narrator]` | 말투·전달 | 판타지 내레이터 | 판타지 해설자 톤 | v4·v4 Turbo·v3 | V3C |
| `[sci-fi AI voice]` | 말투·전달 | AI 목소리 | 공상과학 AI 톤 | v4·v4 Turbo·v3 | V3C |
| `[classic film noir]` | 말투·전달 | 느와르 | 고전 느와르 톤 | v4·v4 Turbo·v3 | V3C |
| `[evil scientist voice]` | 말투·전달 | 악당 박사 | 악당 과학자 톤 | v4·v4 Turbo·v3 | V3C |
| `[laughs]` | 비언어·효과음 | 웃음 | 웃는다 | v4·v4 Turbo·v3 | B,L,A,H,V3M |
| `[laughs harder]` | 비언어·효과음 | 폭소 | 더 크게 웃는다 | v4·v4 Turbo·v3 | B,V3E |
| `[starts laughing]` | 비언어·효과음 | 웃기 시작 | 웃음이 터진다 | v4·v4 Turbo·v3 | B |
| `[laughing]` | 비언어·효과음 | 웃으며 | 웃으며 말한다 | v4·v4 Turbo·v3 | B,A,E,V3E |
| `[laughs hard]` | 비언어·효과음 | 크게 웃음 | 크게 웃는다 | v4·v4 Turbo·v3 | V3M |
| `[big laugh]` | 비언어·효과음 | 박장대소 | 큰 웃음 | v4·v4 Turbo·v3 | A,V3P |
| `[laughs wickedly]` | 비언어·효과음 | 사악한 웃음 | 사악하게 웃는다 | v4·v4 Turbo·v3 | V3C |
| `[evil laugh]` | 비언어·효과음 | 악당 웃음 | 악당 웃음소리 | v4·v4 Turbo·v3 | V3C,EM |
| `[chuckles]` | 비언어·효과음 | 킥킥 | 낮게 웃는다 | v4·v4 Turbo·v3 | A,V3M,V3N,E |
| `[soft chuckle]` | 비언어·효과음 | 살짝 웃음 | 조용히 웃는다 | v4·v4 Turbo·v3 | V3N |
| `[light chuckle]` | 비언어·효과음 | 가벼운 웃음 | 가볍게 웃는다 | v4·v4 Turbo·v3 | V3E |
| `[giggle]` | 비언어·효과음 | 깔깔 | 키득거린다 | v4·v4 Turbo·v3 | V3N,V3P |
| `[wheezing]` | 비언어·효과음 | 숨넘어감 | 숨 차게 웃는다 | v4·v4 Turbo·v3 | B |
| `[snorts]` | 비언어·효과음 | 코웃음 | 코로 웃는다 | v4·v4 Turbo·v3 | B |
| `[sighs]` | 비언어·효과음 | 한숨 | 한숨 쉰다 | v4·v4 Turbo·v3 | B,L,A,E,H |
| `[sigh]` | 비언어·효과음 | 한숨 | 한숨 쉰다 | v4·v4 Turbo·v3 | V3E,V3S |
| `[sighing]` | 비언어·효과음 | 한숨 쉬며 | 한숨 쉬며 말한다 | v4·v4 Turbo·v3 | V3M,V3E,A |
| `[sigh of relief]` | 비언어·효과음 | 안도의 한숨 | 안도하며 숨을 내쉰다 | v4·v4 Turbo·v3 | V3E |
| `[exhales]` | 비언어·효과음 | 숨 내쉼 | 숨을 내쉰다 | v4·v4 Turbo·v3 | B |
| `[exhales sharply]` | 비언어·효과음 | 거친 숨 | 숨을 급히 내쉰다 | v4·v4 Turbo·v3 | E |
| `[inhales deeply]` | 비언어·효과음 | 숨 들이쉼 | 깊게 숨을 들이쉰다 | v4·v4 Turbo·v3 | E |
| `[breathes]` | 비언어·효과음 | 호흡 | 숨 쉬는 소리 | v4·v4 Turbo·v3 | V3P |
| `[gasps]` | 비언어·효과음 | 헉 | 헉 하고 숨을 들이쉰다 | v4·v4 Turbo·v3 | L,A,V3E |
| `[gasp]` | 비언어·효과음 | 헉 | 헉 하고 숨을 들이쉰다 | v4·v4 Turbo·v3 | V3S |
| `[clears throat]` | 비언어·효과음 | 헛기침 | 헛기침 | v4·v4 Turbo·v3 | L,A,H |
| `[coughing]` | 비언어·효과음 | 기침 | 기침한다 | v4·v4 Turbo·v3 | A |
| `[gulps]` | 비언어·효과음 | 꿀꺽 | 침 삼킨다 | v4·v4 Turbo·v3 | B,V3E,V3S,V3P |
| `[gulp]` | 비언어·효과음 | 꿀꺽 | 침 삼킨다 | v4·v4 Turbo·v3 | L |
| `[swallows]` | 비언어·효과음 | 삼킴 | 삼키는 소리 | v4·v4 Turbo·v3 | B |
| `[stammers]` | 비언어·효과음 | 말더듬 | 말을 더듬는다 | v4·v4 Turbo·v3 | V3E,V3S,V3P |
| `[sings]` | 비언어·효과음 | 노래 | 노래한다(실험적) | v4·v4 Turbo·v3 | B,V3M |
| `[singing]` | 비언어·효과음 | 노래하며 | 노래하듯 | v4·v4 Turbo·v3 | E |
| `[muttering]` | 비언어·효과음 | 중얼 | 중얼거린다 | v4·v4 Turbo·v3 | E |
| `[woo]` | 비언어·효과음 | 우후 | 환호성(실험적) | v4·v4 Turbo·v3 | B |
| `[fart]` | 비언어·효과음 | 방귀 | 방귀 소리(실험적) | v4·v4 Turbo·v3 | B |
| `[applause]` | 비언어·효과음 | 박수 갈채 | 박수 소리 | v4·v4 Turbo·v3 | B |
| `[clapping]` | 비언어·효과음 | 박수 | 손뼉 소리 | v4·v4 Turbo·v3 | B,A,V3M |
| `[gunshot]` | 비언어·효과음 | 총소리 | 총성 | v4·v4 Turbo·v3 | B,A |
| `[explosion]` | 비언어·효과음 | 폭발 | 폭발음 | v4·v4 Turbo·v3 | B,A |
| `[thunder rumbling]` | 비언어·효과음 | 천둥 | 천둥 소리 | v4·v4 Turbo·v3 | L |
| `[footsteps]` | 비언어·효과음 | 발소리 | 발소리 | v4·v4 Turbo·v3 | L |
| `[footstep]` | 비언어·효과음 | 발소리 한 번 | 발소리 한 번 | v4·v4 Turbo·v3 | EM |
| `[many footsteps]` | 비언어·효과음 | 여럿 발소리 | 여러 발소리 | v4·v4 Turbo·v3 | L |
| `[door creaking]` | 비언어·효과음 | 문 삐걱 | 문 삐걱 소리 | v4·v4 Turbo·v3 | L |
| `[gate creaking]` | 비언어·효과음 | 대문 삐걱 | 대문 삐걱 소리 | v4·v4 Turbo·v3 | EM |
| `[owl hooting]` | 비언어·효과음 | 부엉이 | 부엉이 소리 | v4·v4 Turbo·v3 | L |
| `[twig snapping]` | 비언어·효과음 | 나뭇가지 | 나뭇가지 꺾이는 소리 | v4·v4 Turbo·v3 | L |
| `[zipper opening]` | 비언어·효과음 | 지퍼 | 지퍼 소리 | v4·v4 Turbo·v3 | L |
| `[dog barking]` | 비언어·효과음 | 개 짖음 | 개 짖는 소리 | v4·v4 Turbo·v3 | L |
| `[light switch clicking]` | 비언어·효과음 | 스위치 | 스위치 딸깍 | v4·v4 Turbo·v3 | EM |
| `[pause]` | 쉼·속도 | 쉼 | 짧은 쉼(숨 한 번 정도). 길이는 문맥과 성우로 정해진다 | v4·v4 Turbo·v3 | P,A,V3P,V3N,V3M,V3S |
| `[long pause]` | 쉼·속도 | 긴 쉼 | 길고 의도적인 침묵 | v4·v4 Turbo·v3 | P,L |
| `[short pause]` | 쉼·속도 | 짧은 쉼 | Enhance 프롬프트의 예시 목록에만 나온다 | v4·v4 Turbo·v3 | E |
| `[Brief pause]` | 쉼·속도 | 잠깐 쉼 | v4 프롬프트 예시에 한 번 나온다 | v4·v4 Turbo·v3 | B |
| `[slightly pause]` | 쉼·속도 | 살짝 쉼 | v4 목록 블로그의 자연어 예시 문장 안에만 나온다 | v4·v4 Turbo·v3 | L |
| `[silence]` | 쉼·속도 | 정적 | 무음 효과로 쓴 예시 | v4·v4 Turbo·v3 | EM |
| `[pauses]` | 쉼·속도 | 쉼 | `[pause]` 변형 | v4·v4 Turbo·v3 | V3E |
| `[hesitates]` | 쉼·속도 | 머뭇거림 | 머뭇거린다 | v4·v4 Turbo·v3 | V3E,V3N,V3M |
| `[continues after a beat]` | 쉼·속도 | 한 박자 후 | 한 박자 쉬고 잇는다 | v4·v4 Turbo·v3 | V3P |
| `[rushed]` | 쉼·속도 | 서두름 | 빠르고 급하게 | v4·v4 Turbo·v3 | L,A,V3S,V3N,V3P |
| `[slowly]` | 쉼·속도 | 천천히 | 천천히 | v4·v4 Turbo·v3 | L,A |
| `[slows down]` | 쉼·속도 | 느려짐 | 점점 느리게 | v4·v4 Turbo·v3 | V3N,V3P |
| `[drawn out]` | 쉼·속도 | 길게 끌기 | 말을 길게 늘인다 | v4·v4 Turbo·v3 | L,A,V3M,V3P |
| `[fast-paced]` | 쉼·속도 | 빠르게 | 빠른 템포 | v4·v4 Turbo·v3 | V3M |
| `[rapid-fire]` | 쉼·속도 | 속사포 | 연달아 빠르게 | v4·v4 Turbo·v3 | V3P |
| `[speedy]` | 쉼·속도 | 재빠름 | 빠르게 | v4·v4 Turbo·v3 | L |
| `[snappy]` | 쉼·속도 | 딱딱 끊어 | 짧고 딱 끊어서 | v4·v4 Turbo·v3 | L |
| `[deliberate]` | 쉼·속도 | 또박또박 | 신중하게 또박또박 | v4·v4 Turbo·v3 | V3P |
| `[repeats]` | 쉼·속도 | 반복 | 말을 반복한다 | v4·v4 Turbo·v3 | V3P |
| `[speeding up]` | 쉼·속도 | 빨라짐 | 점점 빠르게 | v4·v4 Turbo·v3 | L(자연어 예시) |
| `[British accent]` | 억양·발음 | 영국 억양 | 영국식 | v4·v4 Turbo·v3 | L,A,V3C |
| `[French accent]` | 억양·발음 | 프랑스 억양 | 프랑스식 | v4·v4 Turbo·v3 | L,A,V3C |
| `[Australian accent]` | 억양·발음 | 호주 억양 | 호주식 | v4·v4 Turbo·v3 | L,A,V3C |
| `[Irish accent]` | 억양·발음 | 아일랜드 억양 | 아일랜드식 | v4·v4 Turbo·v3 | L |
| `[American accent]` | 억양·발음 | 미국 억양 | 미국식 | v4·v4 Turbo·v3 | V3C |
| `[Southern US accent]` | 억양·발음 | 미국 남부 억양 | 미국 남부식 | v4·v4 Turbo·v3 | V3C |
| `[strong X accent]` | 억양·발음 | 강한 억양 | X 자리에 억양 이름을 넣는다. 실험적 | v4·v4 Turbo·v3 | B |
| `[pirate voice]` | 억양·발음 | 해적 목소리 | 해적 말투 | v4·v4 Turbo·v3 | L,A,V3C,V3M |
| `[interrupting]` | 기타 | 끼어듦 | 상대 말을 자르며 끼어든다(다화자 대화용) | v4·v4 Turbo·v3 | V3M,V3E,A |
| `[jumping in]` | 기타 | 끼어들기 | 말에 바로 들어간다(다화자 대화용) | v4·v4 Turbo·v3 | V3M,V3E,A |
| `[overlapping]` | 기타 | 겹침 | 말이 겹친다(다화자 대화용) | v4·v4 Turbo·v3 | V3M,A |
| `[cuts in]` | 기타 | 말 자름 | 말을 자른다(다화자 대화용) | v4·v4 Turbo·v3 | V3M |
| `[interjecting]` | 기타 | 맞장구 | 끼어든다(다화자 대화용) | v4·v4 Turbo·v3 | V3M |
| `[starting to speak]` | 기타 | 말 시작 | 말을 막 시작한다(다화자 대화용) | v4·v4 Turbo·v3 | V3M |
| `[beginning to speak]` | 기타 | 말 시작 | 말을 막 시작한다(다화자 대화용) | v4·v4 Turbo·v3 | A |

### 넣는 규칙

- **위치**: 바꾸고 싶은 말 바로 앞(L: `[shouts] I can't believe you said that to me,`는 그 줄 전체가 외치는 소리). 효과음·반응 태그는 문장 뒤에도 쓴다(`This is hard. [sighs]`, Enhance 프롬프트의 규칙: "immediately before the dialogue segment they modify or immediately after"). 문장 맨 앞이어야 한다는 제약은 없다.
- **조합**: 상한 숫자는 문서에 없다. 두 가지 방식이 나온다. (1) 쉼표로 한 대괄호 안에서 겹치기 `[whispering, playful]`(L). (2) 대괄호를 연달아 `[hesitant][nervous]`(V3P), `[tired] ... [upset]`(A). 단 B는 "Tag combinations ... You can combine multiple audio tags", L·EM은 "한 구절에 감정 하나, 대비되는 감정을 같은 말에 겹치면 흐려진다"고 권한다.
- **강도 표현**: 숫자 강도는 없다. 수식어를 말로 쓴다(`[nervous, trying to sound confident]`, `[barely containing excitement]`). 대문자는 강조(`I want it right NOW`), `...`는 느려짐, `!`는 강도(L, EM).
- **자유 문구**: 허용. 공식이 직접 권한다(L의 "Write your own Audio Tags with natural language": 감정 조합, 방식, 상황, 인물, 변화를 묘사). 이 앱의 `tag` 입력칸이 자유 텍스트라면 문서와 맞는다.
- **닫는 태그**: 없다. 한 번 쓰면 이후로 이어지고 새 태그로 바뀐다.
- **줄 단위 적용 범위**: 문서에 줄 단위 규칙은 없다. 다만 "새 줄(line break)은 더 긴 쉼"이라고 A의 FAQ가 적는다. 줄이 바뀌면 감정이 초기화되는지는 정보 없음. L은 "Use one tag per clause"를 권한다.
- **효과음과 말투가 헷갈릴 수 있다**: B는 v4가 말투와 효과음을 둘 다 만들 수 있어서 태그가 효과음으로 해석될 수 있다고 경고하고, 말투 의도면 `[low, gravelly voice]`처럼 목소리 성질을 분명히 쓰라고 한다. Enhance 프롬프트는 반대로 `[music]`, `[standing]`, `[grinning]`, `[pacing]`을 쓰지 말라고 한다(소리 아닌 동작·음악).
- **성우와 맞아야 한다**: "A meditative voice shouldn't shout; a hyped voice won't whisper convincingly"(B). v4는 성우가 학습하지 않은 `[whispering]`, `[shouting]`도 따라가려 하지만 덜 안정적이라고 한다(B).

### 쉼 표기가 모델별로 다른 점

| 표기 | `eleven_v4`·`v4_turbo`·`v3` | `eleven_multilingual_v2`·`flash_v2_5` |
|---|---|---|
| `<break time="1.5s" />` | **미지원**(B, P, 도움말) | 지원, 최대 3초. 너무 많으면 속도 불안정·잡음(B) |
| `[pause]`·`[long pause]` | 문서가 권하는 쉼 표기. 길이는 고정이 아니라 문맥에 맞춰진다(P) | 정보 없음(태그 미지원 모델이므로 글자로 읽힐 수 있음) |
| 말줄임표 `...` | 쉼과 무게를 더함(B). 천천히 하고 머뭇거림(P) | 제품 가이드: 가끔 쉼이 되지만 머뭇거림이 같이 붙는다. 일관성이 낮다 |
| 줄표 `-`, `—` | 끊김·쉼(B, EM) | 제품 가이드: 짧은 쉼, `-- --`로 길게. 일관성이 낮다 |
| 줄바꿈 | 더 긴 쉼(A) | 정보 없음 |

`[pause]`가 정확히 몇 초인지는 문서에 없다. P는 같은 줄을 `[pause]` 있게/없게 만든 샘플이 4초 대 6초였다고만 쓴다. P는 긴 대본에서 쉼 표기를 한 가지로 통일하라고 한다(앞부분은 문장부호, 뒷부분은 태그로 섞으면 어색해질 수 있다).

### 한국어 대본에서

- 한국어는 v4(90+ 언어)와 v3(70+ 언어)의 지원 언어 목록에 모두 있다(M, V4). **한국어 대본에서 태그가 어떻게 동작하는지, 영어 태그를 써야 하는지, 한국어 태그(`[속삭이며]`)가 되는지에 대한 공식 문서 문구는 정보 없음.** 확인한 문서의 모든 태그 예시와 예문은 영어다.
- 관련 문장: V4는 "다른 언어를 말할 때 원래 성우의 억양을 가져오지 않고 대상 언어로 자연스럽게 발음한다"고 쓰고, 같은 문서에서 "억양을 유도하려고 audio tag를 써 볼 수 있지만 결과는 다르다"(`You can try using audio tags to guide an accent or delivery style, but results may vary`)고 한다. 태그 언어와 대본 언어에 관한 말은 아니다.
- 공식 예시가 영어 태그를 영어 대본에 쓰는 것뿐이어서, 한국어 대본 + 영어 태그 조합은 문서가 보증하지도 금지하지도 않는다. 직접 들어서 확인해야 한다. 이 저장소의 `trial-options.ts`는 영어 태그를 한국어 대본 앞에 붙이는 방식으로 이미 구현되어 있다(위 "이 앱이 쓰는 모델").
- 허용 문자 도움말: `{ } < > [ ]` 같은 문자는 보통 음질을 떨어뜨린다고 적는다. 태그 대괄호를 쓰는 v3·v4에서는 해당하지 않는 것으로 보이나(대괄호가 태그 문법이다), 다른 모델에서 태그를 넣으면 이 경고가 맞아 들어간다. 직접 근거는 없다(추정).

### 과금과 길이

- **정보 없음(직접 문구).** 태그가 청구 글자 수나 글자 상한에 들어가는지 공식 문서·도움말에서 명시한 문장을 찾지 못했다. 상한은 "요청 `text` 한 개의 글자 수"로 적힌다(M: v4 10,000, v3 5,000). 대괄호 태그도 `text` 안의 글자이므로 상한에 포함될 가능성이 크다(추정, 문서 근거 아님). 과금은 요청 글자 수 기준이라는 기존 조사(`docs/research/elevenlabs-api-options.md`)와 같이 "대본 + 태그 글자 전체"로 계산하는 쪽이 안전하다.
- 가격 참고(기존 문서와 같음): v3 웹 1글자 1크레딧, API는 별도 가격(도움말). 모델별 API 단가는 [API 요금](https://elevenlabs.io/pricing/api).
- B의 서술형 감정(`she said, her voice trembling with sadness`)은 모델이 그 설명 글자까지 읽는다고 하므로 그 글자는 소리로도 나오고 과금에도 들어간다. 태그는 소리 나지 않아야 하는 쪽이다.

### 공급자 화면의 태그 UI

- 공식 웹 앱(Text to Speech)에서 태그는 **본문에 `[...]`를 손으로 입력**한다(A, L: "inline with your transcript", "you can access Audio Tags via the UI or through the API"). 태그를 클릭해 넣는 목록 UI가 있다는 문서는 찾지 못했다(정보 없음). L은 감정 휠(emotion wheel)에서 소리를 들어 보고 태그를 고르라고 하지만, 휠의 삽입 동작은 문서에 없다.
- **Enhance 버튼**: B가 "In the ElevenLabs UI, you can automatically generate relevant audio tags for your input text by clicking the 'Enhance' button"이라고 쓰고, P는 "The 'v4 Enhance' button next to 'Generate speech' will automatically add Audio Tags to your writing"이라고 쓴다. 내부적으로 LLM에 프롬프트를 주어 태그를 넣는다. 프롬프트 전문이 B에 공개되어 있다. 원문 단어를 바꾸지 않고 태그를 앞에 붙이며(`DO NOT alter, add, or remove any words`), 강조는 대문자·물음표·느낌표·말줄임표 정도만 더하고, 소리와 관련된 태그만 허용한다. 단 이 공개 프롬프트가 v4용인지 v3 시절 것인지는 문서에 표시되어 있지 않다.
- **API로는 열려 있지 않다.** 확인한 곳: 공식 OpenAPI(`api.elevenlabs.io/openapi.json`)에서 audio tag 관련 필드는 ElevenAgents 에이전트 설정의 `expressive_mode`와 `suggested_audio_tags`(최대 20개, "for eleven_v3 and eleven_v3_conversational")뿐이었고, TTS convert/stream에는 Enhance 또는 태그 자동 삽입 필드가 없다. 기존 문서(`docs/research/elevenlabs-api-options.md`)가 "convert에 직접 필드 없음"이라 한 것과 같다. 필요하면 공개된 프롬프트를 앱 쪽 LLM 호출로 재현해야 하는데, 그것은 앱이 따로 만드는 기능이다.

### 이 앱 작업실에 넣을 때 주의

1. **태그는 정해진 목록이 아니다.** 뱃지를 목록으로 제공하되 자유 입력도 막지 말아야 문서와 맞는다(현재 시험 생성의 자유 텍스트 `tag`와도 일관).
2. **모델별 노출 조건이 갈린다.** `eleven_v4`·`eleven_v3`만 태그 UI를 보이고, `eleven_multilingual_v2`·`eleven_flash_v2_5`에서는 숨기거나 막아야 한다. 태그를 넣으면 괄호 글자가 그대로 읽히는 것이 일반적이다(L의 FAQ). 대본에 이미 태그가 들어 있는 채로 모델을 바꾸는 경우도 처리해야 한다. 그 모델들은 쉼도 `<break>`·문장부호 쪽으로 방식이 다르다.
3. **v3·v4에서는 SSML `<break>`가 없다.** 쉼 뱃지는 모델에 따라 `[pause]`·`[long pause]`(v3·v4) 또는 `<break time="x.xs" />`(그 밖)로 바뀐다. `[pause]`의 길이는 고정이 아니다.
4. **대본 글자 수에 태그가 들어간다고 보고 계산한다**(문서 근거는 없지만 안전한 쪽). v3 상한 5,000자, v4 10,000자(M).
5. **다화자용 태그**(`[interrupting]`, `[overlapping]`, `[jumping in]` 등)는 Text to Dialogue(여러 성우)용 예시라서 단일 성우 convert에서는 효과가 없을 수 있다. 뱃지에서 "고급" 묶음이나 제외 후보로 둔다(근거: V3M, A. 단일 성우에서의 동작은 정보 없음).
6. **효과음 태그(`[gunshot]`, `[applause]` 등)는 "실험적·비결정적"**이라고 기존 문서와 B가 말한다. 말투 태그와 같은 뱃지 그룹에 섞지 않고 구분 표시가 낫다. Enhance 프롬프트는 소리 효과 태그를 쓰지 말라고 하니 자동 추천과 수동 삽입의 기준이 다르다.
7. **한국어 대본과 영어 태그의 효과는 문서로 보증되지 않는다.** 뱃지에 "한국어 효과 미확인" 표시나 청취 기록 칸(모델·성우·태그·결과)을 두는 것이 사실과 맞는다(기존 문서 7번 주의와 같은 취지).
8. **같은 태그도 성우에 따라 다르다.** "성우가 그 연기를 학습했는지"에 좌우된다(B). 뱃지가 효과를 보장하는 것처럼 보이면 안 된다.

### 기존 문서와 다른 점

기존 `docs/research/elevenlabs-api-options.md`의 모델 표, 경계 절, 오디오 태그 행은 대체로 사실과 맞는다. 새로 확인했거나 달라진 점:

- **v4 Turbo 태그 지원이 직접 확인됐다.** H와 L이 `eleven_v4_turbo`가 태그를 지원한다고 쓴다(기존 문서도 "지원"으로 적었으나 출처가 모델 소개 문구였다).
- **v3 프롬프트 가이드의 위치가 바뀌었다.** 기존 문서가 인용한 "best-practices#prompting-eleven-v3"는 이제 "v4 절의 기법이 v3에도 적용된다"는 한 문단이고, 태그 목록과 예시는 모두 `#prompting-eleven-v4` 절에 있다.
- **"쉼"에 대한 새 사실**: v3·v4에서는 `[pause]`·`[long pause]` 태그를 쓰라고 공식 블로그(P)가 안내한다. 기존 문서는 "audio tag·구두점·문장 구조"라고만 적었다. `[short pause]`는 Enhance 프롬프트에만 있고 P는 쓰지 않는다.
- **태그 개수**: 기존 문서는 `[excited]`, `[curious]`, `[sarcastic]`, `[crying]`, `[whispers]`, `[laughs]`, `[sighs]` 정도만 적었다. 공식 자료에는 v4 감정 목록 29개 등 위 표의 태그가 더 나온다.
- **태그 미지원 모델에 넣으면?** 기존 문서는 "정보 없음"이었다. L의 FAQ가 "태그를 지원하지 않는 모델이면 보통 소리 내어 읽는다"고 쓴 것이 가장 가까운 공식 문장이다(직접 실험 결과는 아님).
- **"Enhance" 버튼**이 UI에 있음을 확인했다(B, P). 기존 문서는 "convert에 직접 필드 없음"과 앱 보조 기능 가능성만 적었다. 공개 프롬프트 전문이 B에 있다.
- **v4에서 SSML**: 기존 문서와 같게 "v3·v4 모두 SSML 없음"으로 확인.

### 확인하지 못한 것

- 한국어 대본에서 영어 태그가 어떻게 동작하는지, 한국어 태그가 되는지(공식 문구 없음).
- 태그 글자가 청구 글자 수와 글자 상한에 들어가는지(직접 문구 없음, 위 추정만).
- `eleven_multilingual_v2`·`eleven_flash_v2_5`에 태그를 넣었을 때의 실제 결과(L의 일반 FAQ만 있음. 이 조사에서는 유료 호출을 하지 않았다).
- v3와 v4에서 태그별 동작 차이(문서는 같은 태그가 된다고만 하고 v4가 더 정확하다고 쓴다. 구체 차이 목록 없음).
- `eleven_v4_turbo`가 convert에서 되는지와 글자 상한(M의 상한 표에 없음).
- 줄바꿈이 감정 지속을 끊는지, 태그 하나의 효과 범위(TTS 문서에 수치 없음. 에이전트 문서만 4~5단어).
- 웹 편집기에서 태그를 클릭해 넣는 UI 존재 여부(문서 근거 없음).
- 이 목록이 전수라는 보증은 없다. 공식 블로그 6~7편과 문서를 읽고 모았으나 비공개 UI의 태그 추천 목록(감정 휠의 세부 항목)은 확인하지 못했다.

## 4-3. Fish Audio

- 확인: 2026-10-07, 공식 문서 [Emotion Control](https://docs.fish.audio/developer-guide/core-features/emotions.md), [Fine-grained Control](https://docs.fish.audio/developer-guide/core-features/fine-grained-control.md), [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md), [Choosing a Model](https://docs.fish.audio/developer-guide/models-pricing/choosing-a-model.md), [Text to Speech Guide](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md), [TTS endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech.md), [Changelog](https://docs.fish.audio/developer-guide/getting-started/changelog), [llms.txt](https://docs.fish.audio/llms.txt). 공식 블로그 [S2 word-level control (2026-03-12)](https://fish.audio/blog/fish-audio-s2-fine-grained-ai-voice-control-at-the-word-level/), [S2.1 Pro free API](https://fish.audio/blog/s2-1-pro-free-api/), 공개 페이지 [AI Voice Generator](https://fish.audio/ai-voice-generator/), [S2](https://fish.audio/s2/). 각 `.md` 원문을 내려받아 대조했다. API는 부르지 않았다.
- 이 앱이 쓰는 합성 모델: `s2.1-pro-free`, `s2.1-pro`(`packages/api/src/providers/trial-options.ts`의 `FISH_MODELS`). 둘 다 S2 계열이라 대괄호 문법이다. `s1`, `s2-pro`는 이 앱 목록에 없다.

### 감정 제어 방식
- 별도 요청 필드가 없다. 감정은 전부 `text` 안의 인라인 태그다. 강도 숫자 필드도 없다. (요청 필드로는 `speed`·`temperature` 같은 것만 있고 감정과 무관하다.)
- S2 계열(`s2-pro`, `s2.1-pro`, `s2.1-pro-free`)은 `[대괄호]`. 문서 문구: "`[bracket]` cues with free-form natural language", "not limited to a fixed set of tags". 대괄호 안은 학습된 자연어 설명이지 전용 제어 토큰이 아니다("treat `[bracket]` tags as standard text rather than dedicated control tokens"). 그래서 고정 태그 목록은 "자주 쓰는 예"에 가깝고, 목록에 없는 `[whispers sweetly]` 같은 말도 허용된다. ([Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md))
- S1(구형)은 `(괄호)` 고정 태그 세트다.
- 한 대본 안에서 바꿀 수 있다. 문서 예: `[happy] I got the promotion!` 다음 줄 `[uncertain] But...`처럼 문장마다 바꾼다. 공식 블로그는 태그가 "다음 태그나 문장 끝까지" 적용되고 `I didn't want to go [whispering] inside.`처럼 문장 중간부터도 된다고 한다. 한 요청에 감정이 하나뿐이라는 제한은 없다.

### 모델별 지원
| 모델 | 감정 방식 | 비고 |
| --- | --- | --- |
| `s2.1-pro` | `[대괄호]` 자유 자연어 | 운영 권장. 83개 언어. 이 앱 사용 |
| `s2.1-pro-free` | 같음 | `s2.1-pro`와 같은 모델, $0, 공정 사용 한도, TTFA·DPA 보장 없음. 무료 접근은 블로그 기준 2026-11-30까지. 이 앱 사용 |
| `s2-pro` | `[대괄호]` 자유 자연어 | 이전 세대 S2. 이 앱 목록에 없음 |
| `s1` | `(괄호)` 고정 태그 | 구형, 13개 언어. 이 앱 목록에 없음 |
| `drama-3-preview` | 정보 없음 | Changelog(2026-09-23)는 "고정된 오디오 태그 없이 평문으로 톤·속도·캐릭터를 지시"한다고만 적는다. 태그 문법 문서 없음. 이 앱 목록에 없음 |
- 태그를 지원하지 않는 모델에 넣으면 어떻게 되는지는 문서에 없다(정보 없음). S2 계열은 대괄호를 "표준 텍스트로 취급"한다고 하므로 모델이 지시로 해석하는 구조일 뿐 글자 그대로 읽는지 여부는 문서로 확인되지 않는다. S1에 대괄호를 넣었을 때, S2에 괄호를 넣었을 때의 동작도 정보 없음("S1 cues must use parentheses"라는 문장만 있다).
- 모델 선택은 `model` 요청 헤더이고 헤더가 없으면 `s2.1-pro`로 처리된다([TTS Guide](https://docs.fish.audio/developer-guide/core-features/text-to-speech.md)). 이 앱은 늘 보낸다.

### 태그 전체 목록
출처 표기: "EC"는 [Emotion Control](https://docs.fish.audio/developer-guide/core-features/emotions.md), "MO"는 [Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md), "FG"는 [Fine-grained Control](https://docs.fish.audio/developer-guide/core-features/fine-grained-control.md), "블로그"는 [S2 블로그](https://fish.audio/blog/fish-audio-s2-fine-grained-ai-voice-control-at-the-word-level/). 문서에 "지원 목록"으로 나온 것은 EC의 표(S2 기본 24, 심화 25, 톤 6, 효과음 11, 특수 5 = 71개)와 그 S1판이다. 문서는 이 표를 "Complete Emotion Reference"라 부르지만 동시에 자유 문구도 허용하므로 71개는 "지원이 문서로 보증된 대표 목록"이지 허용 집합이 아니다. 지원 모델 칸의 S2 = `s2-pro`, `s2.1-pro`, `s2.1-pro-free`. "s1 `(x)`"는 S1에서는 같은 이름을 괄호로 쓴다는 뜻이다.

#### A. EC 지원 목록 (S2 대괄호 / S1 괄호 쌍)
| 대본에 넣는 문자열 | 분류 | 뱃지 이름(제안) | 설명 | 지원 모델 | 출처 |
| --- | --- | --- | --- | --- | --- |
| `[happy]` | 감정 | 기쁨 | 밝고 들뜬 톤. 좋은 소식, 인사 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(happy)`) | Emotion Control 기본/심화 감정 표 |
| `[sad]` | 감정 | 슬픔 | 가라앉은 우울한 톤. 위로, 나쁜 소식 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(sad)`) | Emotion Control 기본/심화 감정 표 |
| `[angry]` | 감정 | 화남 | 거칠고 날 선 톤. 항의, 경고 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(angry)`) | Emotion Control 기본/심화 감정 표 |
| `[excited]` | 감정 | 신남 | 에너지 넘치는 열정적 톤. 발표, 축하 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(excited)`) | Emotion Control 기본/심화 감정 표 |
| `[calm]` | 감정 | 차분 | 평온하고 느긋한 톤. 안내, 명상 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(calm)`) | Emotion Control 기본/심화 감정 표 |
| `[nervous]` | 감정 | 긴장 | 불안하고 머뭇거리는 톤. 유의사항, 사과 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(nervous)`) | Emotion Control 기본/심화 감정 표 |
| `[confident]` | 감정 | 자신감 | 단정적이고 당당한 톤. 발표, 영업 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(confident)`) | Emotion Control 기본/심화 감정 표 |
| `[surprised]` | 감정 | 놀람 | 깜짝 놀란 톤. 반응, 발견 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(surprised)`) | Emotion Control 기본/심화 감정 표 |
| `[satisfied]` | 감정 | 만족 | 흡족한 톤. 확인, 후기 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(satisfied)`) | Emotion Control 기본/심화 감정 표 |
| `[delighted]` | 감정 | 즐거움 | 매우 기쁘고 흐뭇한 톤. 축하, 칭찬 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(delighted)`) | Emotion Control 기본/심화 감정 표 |
| `[scared]` | 감정 | 두려움 | 겁먹은 톤. 경고, 공포 이야기 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(scared)`) | Emotion Control 기본/심화 감정 표 |
| `[worried]` | 감정 | 걱정 | 염려하는 톤. 우려, 질문 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(worried)`) | Emotion Control 기본/심화 감정 표 |
| `[upset]` | 감정 | 속상 | 마음이 상해 흔들리는 톤. 불만, 문제 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(upset)`) | Emotion Control 기본/심화 감정 표 |
| `[frustrated]` | 감정 | 답답 | 짜증 섞인 지친 톤. 장애, 지연 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(frustrated)`) | Emotion Control 기본/심화 감정 표 |
| `[depressed]` | 감정 | 우울 | 매우 슬프고 절망적인 톤. 무거운 주제 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(depressed)`) | Emotion Control 기본/심화 감정 표 |
| `[empathetic]` | 감정 | 공감 | 이해하고 보살피는 톤. 상담 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(empathetic)`) | Emotion Control 기본/심화 감정 표 |
| `[embarrassed]` | 감정 | 당황 | 민망하고 어색한 톤. 사과, 실수 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(embarrassed)`) | Emotion Control 기본/심화 감정 표 |
| `[disgusted]` | 감정 | 역겨움 | 혐오하는 톤. 부정적 후기 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(disgusted)`) | Emotion Control 기본/심화 감정 표 |
| `[moved]` | 감정 | 감동 | 마음이 뭉클한 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(moved)`) | Emotion Control 기본/심화 감정 표 |
| `[proud]` | 감정 | 뿌듯 | 성취감 있는 톤. 성과, 칭찬 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(proud)`) | Emotion Control 기본/심화 감정 표 |
| `[relaxed]` | 감정 | 느긋 | 긴장 풀린 편한 톤. 일상 대화 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(relaxed)`) | Emotion Control 기본/심화 감정 표 |
| `[grateful]` | 감정 | 감사 | 고마워하는 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(grateful)`) | Emotion Control 기본/심화 감정 표 |
| `[curious]` | 감정 | 호기심 | 궁금해하는 톤. 질문, 탐색 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(curious)`) | Emotion Control 기본/심화 감정 표 |
| `[sarcastic]` | 감정 | 비꼼 | 빈정대는 톤. 유머, 비판 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(sarcastic)`) | Emotion Control 기본/심화 감정 표 |
| `[disdainful]` | 감정 | 멸시 | 깔보는 톤. 비판, 거절 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(disdainful)`) | Emotion Control 기본/심화 감정 표 |
| `[unhappy]` | 감정 | 불만 | 못마땅한 톤. 항의, 피드백 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(unhappy)`) | Emotion Control 기본/심화 감정 표 |
| `[anxious]` | 감정 | 불안 | 몹시 걱정되어 초조한 톤. 급한 일 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(anxious)`) | Emotion Control 기본/심화 감정 표 |
| `[hysterical]` | 감정 | 격앙 | 감정을 주체 못하는 톤. 극단적 반응 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(hysterical)`) | Emotion Control 기본/심화 감정 표 |
| `[indifferent]` | 감정 | 무관심 | 관심 없는 덤덤한 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(indifferent)`) | Emotion Control 기본/심화 감정 표 |
| `[uncertain]` | 감정 | 불확실 | 확신 없는 톤. 추측 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(uncertain)`) | Emotion Control 기본/심화 감정 표 |
| `[doubtful]` | 감정 | 의심 | 믿지 못하는 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(doubtful)`) | Emotion Control 기본/심화 감정 표 |
| `[confused]` | 감정 | 혼란 | 어리둥절한 톤. 되묻기 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(confused)`) | Emotion Control 기본/심화 감정 표 |
| `[disappointed]` | 감정 | 실망 | 기대에 못 미쳐 낙담한 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(disappointed)`) | Emotion Control 기본/심화 감정 표 |
| `[regretful]` | 감정 | 후회 | 뉘우치는 톤. 사과 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(regretful)`) | Emotion Control 기본/심화 감정 표 |
| `[guilty]` | 감정 | 죄책감 | 잘못을 느끼는 톤. 고백 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(guilty)`) | Emotion Control 기본/심화 감정 표 |
| `[ashamed]` | 감정 | 수치 | 깊이 부끄러운 톤. 큰 실수 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(ashamed)`) | Emotion Control 기본/심화 감정 표 |
| `[jealous]` | 감정 | 질투 | 시기하는 톤. 비교 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(jealous)`) | Emotion Control 기본/심화 감정 표 |
| `[envious]` | 감정 | 부러움 | 남의 것을 탐내는 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(envious)`) | Emotion Control 기본/심화 감정 표 |
| `[hopeful]` | 감정 | 희망 | 앞날을 기대하는 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(hopeful)`) | Emotion Control 기본/심화 감정 표 |
| `[optimistic]` | 감정 | 낙관 | 긍정적인 톤. 격려 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(optimistic)`) | Emotion Control 기본/심화 감정 표 |
| `[pessimistic]` | 감정 | 비관 | 부정적 전망의 톤. 경고, 의심 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(pessimistic)`) | Emotion Control 기본/심화 감정 표 |
| `[nostalgic]` | 감정 | 그리움 | 지난날을 그리워하는 톤. 추억 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(nostalgic)`) | Emotion Control 기본/심화 감정 표 |
| `[lonely]` | 감정 | 외로움 | 혼자라는 쓸쓸한 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(lonely)`) | Emotion Control 기본/심화 감정 표 |
| `[bored]` | 감정 | 지루함 | 시큰둥하고 지친 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(bored)`) | Emotion Control 기본/심화 감정 표 |
| `[contemptuous]` | 감정 | 경멸 | 멸시를 드러내는 톤. 강한 비판 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(contemptuous)`) | Emotion Control 기본/심화 감정 표 |
| `[sympathetic]` | 감정 | 동정 | 안타까워하는 톤. 조의 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(sympathetic)`) | Emotion Control 기본/심화 감정 표 |
| `[compassionate]` | 감정 | 연민 | 깊이 보살피는 톤. 지원 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(compassionate)`) | Emotion Control 기본/심화 감정 표 |
| `[determined]` | 감정 | 결의 | 굳게 마음먹은 톤. 목표, 다짐 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(determined)`) | Emotion Control 기본/심화 감정 표 |
| `[resigned]` | 감정 | 체념 | 포기하고 받아들이는 톤 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(resigned)`) | Emotion Control 기본/심화 감정 표 |
| `[in a hurry tone]` | 말투·전달 | 서두름 | 급하게 몰아치는 톤. 시간이 급한 안내 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(in a hurry tone)`) | EC 톤 표 |
| `[shouting]` | 말투·전달 | 외침 | 큰 소리로 부르는 톤. 주의 끌기 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(shouting)`) | EC 톤 표 |
| `[screaming]` | 말투·전달 | 비명 | 매우 크고 다급한 톤. 비상, 공포 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(screaming)`) | EC 톤 표 |
| `[whispering]` | 말투·전달 | 속삭임 | 아주 작고 은밀한 톤. 비밀, 조용한 장면 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(whispering)`) | EC 톤 표 |
| `[soft tone]` | 말투·전달 | 부드럽게 | 온화하고 조용한 톤. 위로, 자장가 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(soft tone)`) | EC 톤 표 |
| `[emphasis]` | 말투·전달 | 강조 | 바로 뒤의 단어·구를 세게 읽음. 강조할 말 바로 앞에 둔다(`This is [emphasis] really important.`) | s2-pro, s2.1-pro, s2.1-pro-free (S1 표에 없음) | EC 톤 표 |
| `[laughing]` | 비언어·효과음 | 웃음 | 온전한 웃음. 뒤에 `Ha, ha, ha` 같은 글을 둔다 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(laughing)`) | EC 효과음 표 |
| `[chuckling]` | 비언어·효과음 | 킥킥 | 가볍게 웃는 소리. `Heh, heh` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(chuckling)`) | EC 효과음 표 |
| `[sobbing]` | 비언어·효과음 | 흐느낌 | 크게 우는 소리. 글은 선택 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(sobbing)`) | EC 효과음 표 |
| `[crying loudly]` | 비언어·효과음 | 통곡 | 격하게 우는 소리. 글은 선택 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(crying loudly)`) | EC 효과음 표 |
| `[sighing]` | 비언어·효과음 | 한숨 | 안도·답답함의 숨소리. `sigh` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(sighing)`) | EC 효과음 표 |
| `[groaning]` | 비언어·효과음 | 끙끙 | 짜증·고통의 신음. `ugh` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(groaning)`) | EC 효과음 표 |
| `[panting]` | 비언어·효과음 | 헐떡임 | 숨찬 소리. `huff, puff` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(panting)`) | EC 효과음 표 |
| `[gasping]` | 비언어·효과음 | 헉 | 숨을 들이켜는 소리. `gasp` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(gasping)`) | EC 효과음 표 |
| `[yawning]` | 비언어·효과음 | 하품 | 피곤한 하품. `yawn` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(yawning)`) | EC 효과음 표 |
| `[snoring]` | 비언어·효과음 | 코골이 | 자는 소리. `zzz` | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(snoring)`) | EC 효과음 표 |
| `[clear throat]` | 비언어·효과음 | 헛기침 | 목을 가다듬는 소리. `ahem` | s2-pro, s2.1-pro, s2.1-pro-free (S1 효과음 표에 없음) | EC 효과음 표 |
| `[audience laughing]` | 비언어·효과음 | 관객 웃음 | 관객이 웃는 효과음 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(audience laughing)`) | EC 특수 효과 표 |
| `[background laughter]` | 비언어·효과음 | 배경 웃음 | 배경에 깔리는 웃음소리 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(background laughter)`) | EC 특수 효과 표 |
| `[crowd laughing]` | 비언어·효과음 | 군중 웃음 | 여럿이 크게 웃는 소리 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(crowd laughing)`) | EC 특수 효과 표 |
| `[break]` | 쉼·속도 | 짧은 쉼 | 말 사이 짧은 휴지 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(break)`) | EC 특수 효과 표 |
| `[long-break]` | 쉼·속도 | 긴 쉼 | 말 사이 긴 휴지 | s2-pro, s2.1-pro, s2.1-pro-free, s1(`(long-break)`) | EC 특수 효과 표 |

"특수" 분류 5개: `[audience laughing]`, `[background laughter]`, `[crowd laughing]`(분위기 웃음소리 효과음 3개)와 `[break]`, `[long-break]`(휴지 2개). 문서가 이 5개를 한 표("Special Effects")에 묶어 "atmosphere and context" 마커라 부른다. 뱃지로는 앞 3개를 비언어·효과음, 뒤 2개를 쉼·속도로 나눴다. 이 5개는 S1 괄호판도 같은 5개다. 문서는 "`Ha,ha,ha` 같은 자연스러운 표현을 태그 없이 써도 된다"고도 적는다.

#### B. 문서의 예시일 뿐 지원 목록이 아닌 것 (자유 문구 예)
| 대본에 넣는 문자열 | 분류 | 뱃지 이름(제안) | 설명 | 지원 모델 | 출처 |
| --- | --- | --- | --- | --- | --- |
| `[whispers sweetly]` | 말투·전달 | 달콤 속삭임 | 다정하게 속삭임. 자유 문구 예 | S2 | MO, 공식 문구 "e.g." |
| `[laughing nervously]` | 말투·전달 | 어색한 웃음 | 긴장해서 웃음. 자유 문구 예 | S2 | MO |
| `[slightly sad]` | 감정 | 살짝 슬픔 | 강도 수식어 예 | S2 | EC |
| `[very excited]` | 감정 | 매우 신남 | 강도 수식어 예 | S2 | EC |
| `[extremely angry]` | 감정 | 극도 분노 | 강도 수식어 예 | S2 | EC |
| `[warm and happy]` | 감정 | 따뜻한 기쁨 | 자유 문구(문장 중간 배치 예 `What a [warm and happy] wonderful day!`) | S2 | EC |
| `[friendly]`, `[narrator]`, `[mysterious]`, `[relieved]`, `[enthusiastic]`, `[encouraging]`, `[urgent]` | 감정/기타 | 친근·내레이터·신비·안도·열정·격려·긴급 | EC의 활용 예시 코드 블록에만 등장. 24+25 표에 없는 단어 | S2 | EC "Common Use Cases" |
| `[whisper]`, `[laugh]`, `[sigh]`, `[gasp]`, `[pause]`, `[inhale]`, `[exhale]`, `[angry]`, `[excited]`, `[sad]`, `[surprised]`, `[emphasis]` | 혼합 | 속삭임·웃음·한숨·헉·쉼·들숨·날숨 | MO의 "Common examples". EC 표와 철자가 다르다(`[whisper]` 대 `[whispering]`, `[laugh]` 대 `[laughing]`, `[pause]`·`[inhale]`·`[exhale]`은 EC 표에 없음) | S2 | MO |
| `[sigh]`, `[inhale]`, `[exhale]`, `[gasp]`, `[panting]`, `[clears throat]`, `[laughing]`, `[chuckling]`, `[giggle]`, `[sobbing]`, `[crying]`, `[groan]`, `[pause]`, `[short pause]`, `[long pause]`, `[whispering]`, `[soft voice]`, `[loud voice]`, `[shouting]`, `[low voice]`, `[excited]`, `[angry]`, `[sad]`, `[emphasis]`, `[rustling sound]` | 혼합 | 한숨·들숨·날숨·헉·헐떡임·헛기침·웃음·킥킥·까르르·흐느낌·울음·끙·쉼·짧은 쉼·긴 쉼·속삭임·부드럽게·큰 소리·낮은 소리·신남·화남·슬픔·강조·바스락 | 공식 블로그의 "Well-Tested Tags"(2026-03-12). EC 표와 철자가 다른 것이 있다(`[clears throat]`, `[groan]`, `[crying]`, `[soft voice]`, `[loud voice]`, `[low voice]`, `[pause]`, `[short pause]`, `[long pause]`, `[giggle]`, `[inhale]`, `[exhale]`, `[rustling sound]`) | S2 | 블로그 |

#### C. 괄호 효과 7개 (Fine-grained Control, V1.6 시절 실험 기능)
FG의 "Special Effects" 표: `(break)`, `(long-break)`, `(breath)`, `(laugh)`, `(cough)`, `(lip-smacking)`, `(sigh)`. 모두 "First Available V1.6, Stage Experimental"이고 `(laugh)`·`(cough)`·`(lip-smacking)`·`(sigh)`는 "developing, 여러 번 반복해야 할 수 있다"고 경고한다. S2에서 괄호 문법이 동작하는지는 문서에 없다(정보 없음). 이 앱의 S2 대상 뱃지에는 쓰지 말고 EC의 대괄호를 쓴다. 필요하면 `(breath)` 숨소리, `(cough)` 기침, `(lip-smacking)` 입맛 다시기는 S2에서 `[inhale]`, `[clears throat]` 등으로 대체해 청취로 확인해야 한다(대체가 같은 소리라는 보장 없음).

#### D. S1 `(괄호)` 목록: EC와 MO의 차이
EC의 S1 아코디언은 S2 표와 같은 이름을 괄호로 적는다(기본 24, 심화 25, 톤 5, 효과음 10, 특수 5). 효과음 10개에서 `(clear throat)`가 빠지고 톤에서 `(emphasis)`가 빠진다. MO의 S1 절은 다르게 적는다.
| 종류 | MO의 S1 목록 |
| --- | --- |
| 기본 24 | angry, sad, excited, surprised, satisfied, delighted, scared, worried, upset, nervous, frustrated, depressed, empathetic, embarrassed, disgusted, moved, proud, relaxed, grateful, confident, interested, curious, confused, joyful (EC에는 있는 happy, calm, sarcastic이 없고 interested, confused, joyful이 있다) |
| 심화 25 | disdainful, unhappy, anxious, hysterical, indifferent, impatient, guilty, scornful, panicked, furious, reluctant, keen, disapproving, negative, denying, astonished, serious, sarcastic, conciliative, comforting, sincere, sneering, hesitating, yielding, painful, awkward, amused (이름이 EC와 많이 다르다. 세어 보면 27개로 "25"와 맞지 않는다) |
| 톤 5 | in a hurry tone, shouting, screaming, whispering, soft tone |
| 효과음 10 | laughing, chuckling, sobbing, crying loudly, sighing, panting, groaning, crowd laughing, background laughter, audience laughing |
이 앱은 S1을 쓰지 않으므로 S1 뱃지는 만들 필요가 없다. 같은 문서 안에서 S1 목록이 둘로 갈리므로 S1을 넣게 되면 청취로 검증해야 한다.

### 넣는 규칙
- 위치: 문장 수준 감정은 "문장 맨 앞이 보통 가장 잘 먹는다"(EC). 톤·효과음은 "어디든 가능". 감정 태그는 "그 감정이 시작될 곳"에 둔다(문장 중간 `What a [warm and happy] wonderful day!`도 EC의 올바른 예). 블로그는 태그가 "뒤따르는 말"에 걸리고 다음 태그 또는 문장 끝까지 적용된다고 한다. `[emphasis]`는 강조할 말 바로 앞.
- 조합: EC는 "문장당 감정 최대 3개 조합 권장", "문장당 주 감정 하나", "상충하는 감정을 섞지 말 것". 예 `[sad][whispering] I miss you so much.` 블로그는 `[panting] [tired]`, `[whispering] [scared]`처럼 물리적 태그(속삭임·헐떡임·외침)에는 감정 태그를 같이 붙이라고 권한다.
- 강도: 숫자 없음. 수식어로 준다. EC: `[slightly sad]`, `[very excited]`, `[extremely angry]`. 또 "Emotion Intensity Scale" 표(약/중/강: happy는 satisfied/happy/delighted, sad는 disappointed/sad/depressed, angry는 frustrated/angry/furious, scared는 nervous/scared/terrified, excited는 interested/excited/ecstatic)가 있다. 이 표의 furious, terrified, ecstatic, interested는 24+25 목록에 없다(자유 문구로 취급).
- 자유 문구: 허용. `[whispers sweetly]`, `[laughing nervously]`, `[the calm, measured tone of someone who has done this a thousand times]`(블로그). 단 EC는 "대괄호 설명을 읽기 어려울 만큼 길게 쓰지 말 것", 블로그는 "설명형 태그 뒤에는 반드시 읽을 글이 있어야 한다. 태그만 단독이면 출력이 예측 불가"라고 한다. 길이 상한은 정보 없음.
- 닫는 태그: 없다. 열기만 한다. 적용 범위는 줄 단위가 아니라 위 "다음 태그 또는 문장 끝"이다. 줄바꿈 단위 규칙은 문서에 없다(정보 없음). 대괄호를 빼먹으면 안 먹는다("Don't forget brackets").
- 효과음 뒤에는 읽을 글을 붙이라고 한다("Add appropriate text after sound effects", 예 `[laughing] Ha ha`).
- 태그를 너무 많이 쓰지 말 것(짧은 글에서 과용 금지, 변화 사이를 띄울 것). 음성(성우)마다 같은 태그의 세기가 다르다(블로그).

### 한국어 대본에서
- EC: 영어·중국어·일본어·독일어·프랑스어·스페인어·한국어·아랍어·러시아어·네덜란드어·이탈리아어·폴란드어·포르투갈어 "13개 언어 전체에서 감정 마커를 쓸 수 있고, 문장 수준 태그는 문장 시작에서 가장 잘 먹는다". 한국어가 이름으로 들어 있다.
- 한국어로 쓴 태그: 공식 블로그(2026-03-12)가 한국어 예시를 직접 싣는다. `[속삭이며] 아무도 모르게 해줘.`, `[화나서] 어떻게 그럴 수가 있어.` "태그는 영어일 필요가 없고 대본과 같은 언어로 써도 된다"고 명시한다("Write Tags in Your Language"). 영어 태그(`[whispering]`)도 한국어 대본에 쓸 수 있다는 것이 EC 문구에서 나온다. 어느 쪽이 한국어 대본에서 더 잘 먹는지, 한국어 태그가 소리 내어 읽히는 경우가 있는지는 정보 없음(청취 필요).
- 한국어 품질: Models Overview에는 S2.1-Pro 언어에 한국어 이름이 없고 "83개, 자동 감지"만 있다. 공식 블로그 [S2.1 Pro](https://fish.audio/blog/s2-1-pro-free-api/)는 83개 언어에 Korean을 이름으로 넣고, S2 블로그는 "강한 성능이 확인된 24개 언어"에 Korean을 넣는다. 한국어 태그별 정확도·알려진 문제는 정보 없음.

### 과금과 길이
- EC: "Emotion markers don't count toward token limits"(토큰 한도에 안 든다), "no additional latency", "all pricing tiers". 다만 요금은 `text`의 UTF-8 바이트 기준(기존 문서: 백만 바이트당 $15)이다. 태그 글자가 바이트 과금에 들어가는지 문서는 명시하지 않는다(정보 없음). 토큰 한도에서 빠진다는 문장과 바이트 과금은 별개 개념이라 같은 말로 읽으면 안 된다. 안전하게는 태그 바이트도 과금된다고 가정해 예상 사용량에 포함하는 쪽이 보수적이다.
- 입력 길이 상한: 문서에 없음(기존 문서와 같음). 웹 앱 무료 플랜은 요청당 500자 상한([AI Voice Generator FAQ](https://fish.audio/ai-voice-generator/), 웹 앱 한정, 태그 포함 여부 정보 없음).

### 공급자 화면의 태그 UI
- 웹 앱 TTS 화면은 https://fish.audio/app/text-to-speech 이고(TTS Guide), 공개 페이지는 "대본에 `[whispering]`, `[excited]`, `[laughing]` 등 60개 이상을 인라인으로 태그한다(Tag your script inline)"고만 설명한다([AI Voice Generator](https://fish.audio/ai-voice-generator/)). 태그를 고르는 버튼·드롭다운·팔레트가 있는지, 어떻게 생겼는지는 공식 문서·블로그·공개 페이지에서 확인하지 못했다. 로그인한 앱 화면을 보지 않았으므로 정보 없음.
- S2 블로그 문구는 "No settings panels. No SSML."로, 태그를 설정 패널 없이 텍스트에 직접 쓴다는 설명이다. 블로그에 "여러 번 생성해서 고르기" 기능이 "coming soon"으로 적혀 있다(2026-03 시점, 현재 상태는 정보 없음).
- 자동 태그 추천: 문서·API 필드에서 찾지 못했다(정보 없음). 반대 방향으로 `transcribe-1-pro`(음성 인식)는 `tag_audio_events`로 중국어 감정 표시(뜻 happy)나 `[laughter]` 같은 감정·소리 큐를 전사에 넣을 수 있다고 하나, 이것은 음성에서 글을 만드는 기능이라 대본에 태그를 자동으로 달아 주는 기능이 아니다([Models Overview](https://docs.fish.audio/developer-guide/models-pricing/models-overview.md)).
- 문서 페이지 곳곳의 "Try it live in the API playground" 카드는 API 레퍼런스의 `text` 칸에 태그를 직접 넣어 보내는 방식이라는 뜻이고 태그 선택 UI가 아니다.

### 이 앱 작업실에 넣을 때 주의
1. 이 앱 모델(`s2.1-pro(-free)`)은 대괄호 자유 문구라서 71개 고정 목록은 "대표 뱃지"일 뿐 허용 집합이 아니다. 뱃지가 아닌 직접 입력 태그도 막으면 안 되고, 반대로 목록에 있다고 한국어에서 같은 효과가 난다는 보장은 없다(청취 확인).
2. 같은 소리의 철자가 문서마다 다르다(EC `[whispering]`·`[laughing]`·`[sighing]`·`[clear throat]` 대 MO·블로그 `[whisper]`·`[laugh]`·`[sigh]`·`[clears throat]`). 뱃지가 넣을 문자열은 EC 철자를 기준으로 삼고 다른 철자는 청취로 비교해야 한다.
3. 감정 태그는 문장 앞, 효과음은 어디든, 효과음 뒤에는 읽을 글이 필요하고 설명형 태그는 단독으로 두면 안 된다. 대본 편집기가 커서 위치에 넣을 때 이 위치 규칙과 충돌할 수 있다.
4. 모델마다 문법이 다르다(S2 `[ ]`, S1 `( )`). 이 앱은 S1을 쓰지 않으므로 괄호 태그가 공급자에 가면 의미 없는 글자가 될 수 있다(동작 정보 없음). 모델을 바꾸는 UI가 생기면 문법 분기가 필요하다.
5. 대본 길이 상한이 문서에 없고 요금은 UTF-8 바이트 기준인데 태그 바이트의 과금 여부가 명시되지 않았다. 태그를 넣으면 글자 수·예상 사용량이 늘어난다고 가정하고 표시한다.
6. 강도는 수식어 문구(`slightly`, `very`, `extremely`)로만 준다. 숫자 슬라이더는 만들 수 없다. 영어 수식어를 한국어 태그에 어떻게 붙이는지는 정보 없음.
7. 문서는 한 문장에 3개를 넘기지 말고 상충 조합(예 `[happy][sad]`)을 피하라고 권한다(경고 수준). 같은 태그라도 성우마다 세기가 다르다는 점은 시험 생성 결과를 보고 판단해야 한다(유료·무료 호출은 사용자 승인 후에만).

### 기존 문서와 다른 점
기존 `docs/research/fish-audio-api-options.md`의 "감정·연기·휴지: 텍스트 인라인 태그" 표와 원문(EC)을 다시 대조했다.
- 개수·철자: S2 기본 24, 심화 25, 톤 6, 효과음 11, 특수 5와 S1 톤 5·효과음 10은 모두 그대로 맞다. 달라진 값 없음.
- 기존 문서는 "한국어로 쓴 태그가 동작하는지는 정보 없음"이라 적었다. 이번에 공식 블로그(2026-03-12)가 한국어 태그 예시(`[속삭이며]`, `[화나서]`)와 "태그를 대본 언어로 써도 된다"는 문장을 싣고 있음을 확인했다. 기존 문서의 이 문장은 고쳐야 한다(동작·품질 자체는 여전히 청취가 필요).
- 기존 문서가 다루지 않은 것: EC의 "Emotion Intensity Scale" 표(furious·terrified·ecstatic 등 목록 밖 단어), `(breath)` 등 FG의 괄호 효과 7개와 S2에서의 동작 불명, 블로그의 Well-Tested Tags와 EC 철자 차이, 태그 뒤에 글이 있어야 한다는 규칙, 물리 태그에 감정 태그를 붙이라는 권장, Changelog의 `drama-3-preview`(고정 태그 없는 평문 지시)와 `s2.1-pro-free`의 2026-11-30 종료(기존 문서에는 이미 반영).
- 기존 문서는 "한 문장에 감정은 하나, 많아야 3개"라고 적었다. EC 원문은 "문장당 주 감정 하나(Do's)"와 "문장당 최대 3개 조합 권장(Performance Notes)"이 따로 있다. 같은 취지라 모순은 아니다.
- 기존 문서의 S1 괄호 목록 차이(MO의 `joyful`, `interested`, `confused` 있음 / `happy`, `calm`, `sarcastic` 없음)는 맞다. 이번에 MO의 S1 심화 목록 전체가 EC와 이름이 크게 다르고 실제로 27개가 적혀 있다는 점을 더했다.
- 기존 문서의 "특수 효과" 5개 설명은 맞고, 이번에 그 5개의 정체를 명시했다(웃음 효과음 3 + 휴지 2).

### 확인하지 못한 것
- 한국어 대본에서 영어 태그와 한국어 태그 중 어느 쪽이 더 잘 듣는지, 한국어 태그가 소리 내어 읽히는 일이 있는지(청취 필요, 유료·무료 호출은 사용자 승인 필요).
- fish.audio 웹 앱(로그인 화면)의 태그 선택 UI 유무와 모양. 공식 도움말·블로그·공개 페이지에는 설명이 없다.
- 태그 바이트의 UTF-8 과금 포함 여부, `text` 길이 상한, 태그 길이 상한.
- S2에서 `(break)` 같은 괄호 효과가 동작하는지, 태그 미지원 모델에서 태그가 글자 그대로 읽히는지.
- 줄바꿈 단위로 태그 적용이 끊기는지(문서는 "다음 태그 또는 문장 끝"만 말한다).
- 자동 태그 추천 API.

## 4-4. Airy

- 확인: 2026-10-07, 공식 문서 사이트 `https://airy.so/cloud-api/docs/`의 영어판·한국어판 원문. 문서 사이트는 자바스크립트 앱이라 번들(`https://airy.so/cloud-api/assets/index-B1C25uD-.js`가 가리키는 `content/docs/{en,ko}/…md` 청크)에서 원문을 읽었다. 읽은 문서: 음성 합성(`/docs/api/tts/speech-synthesis`), 음성 합성 스트리밍(`/docs/api/tts/speech-synthesis-stream`), 보이스 목록, 모델 목록, 빠른 시작, 오류. 그 밖에 `https://airy.so/llms.txt`, `https://airy.so/sitemap.xml`(`/`, `/studio` 두 쪽뿐), 웹 스튜디오 번들(`https://airy.so/assets/index-8h8yVvqY.js`의 화면 문구)을 읽었다. API는 하나도 부르지 않았다.

### 감정 제어 방식
- 요청 필드(구조화 파라미터) 하나뿐이다: `style`. 값은 `normal`, `bright`, `calm`, `whisper` 네 개이고 기본값은 `normal`이다. 문서는 "말하기 스타일(Speaking style)"이라고만 적고 각 값이 어떤 소리인지는 설명하지 않는다. (https://airy.so/cloud-api/docs/api/tts/speech-synthesis, 영어·한국어판 동일)
- 대본 안 인라인 태그, SSML, 쉼 표기, 괄호 태그, 강도 숫자에 대한 언급이 문서 어디에도 없다. `input`은 "합성할 텍스트, 1–1280자"라고만 한다. 지원한다는 근거가 없으므로 "정보 없음"(지원 안 함으로 단정하지는 않는다).
- `style`은 요청 하나에 값 하나다. 한 요청 안에서 대본 중간에 바꿀 수 없다. 문장마다 다른 스타일을 쓰려면 요청을 나눠야 한다. 스트리밍 합성(`POST /v1/audio/speech/stream`)에도 같은 `style` 필드가 있다.
- 자연어 지시(프롬프트로 말투를 시키는 필드)는 없다.

### 모델별 지원
| 모델 | 감정 방식 | 비고 |
|---|---|---|
| `airy-tts-v1` (유일한 TTS 모델, 기본값) | 요청 필드 `style` (4값) | 모델 목록 문서(`/docs/api/common/models`)에 다른 모델은 없다. 문서의 예시도 `airy-tts-v1` 하나다. |

- 대본에 `[웃음]` 같은 문자열을 넣으면 어떻게 되는지(글자 그대로 읽는지, 오류인지) 문서에 없다. 정보 없음. 다만 오류 문서에 400 `unsupported_characters`(읽을 수 없는 문자)가 있어 일부 문자는 거절될 수 있다. 어떤 문자가 거절되는지는 문서에 없다. 웹 스튜디오 번들은 거절된 문자 목록(`code: tts_unsupported_characters`, `characters[]`)을 화면에 보여 주는 처리를 갖고 있다. (https://airy.so/cloud-api/docs/api/errors, 스튜디오 번들)

### 태그 전체 목록
대본 안에 넣는 태그는 없다. 아래는 모두 요청 필드 `style`의 값이다(대본 문자열이 아님).

| 대본에 넣는 문자열 | 분류 | 뱃지 이름(제안) | 설명 | 지원 모델 | 출처 |
|---|---|---|---|---|---|
| (대본 태그 없음) `style=normal` | 말투·전달 | 기본 | 기본 말투. 필드를 생략해도 이 값. 한국어 라벨 "기본" | airy-tts-v1 | https://airy.so/cloud-api/docs/api/tts/speech-synthesis |
| (대본 태그 없음) `style=bright` | 감정 | 밝게 | 밝은 느낌. 한국어 라벨 "밝은 느낌"(스튜디오). 실제 음색 차이는 문서 설명 없음 | airy-tts-v1 | 위 문서, 스튜디오 번들 |
| (대본 태그 없음) `style=calm` | 감정 | 차분함 | 차분한 느낌. 한국어 라벨 "차분한 느낌"(스튜디오). 음색 설명 없음 | airy-tts-v1 | 위 문서, 스튜디오 번들 |
| (대본 태그 없음) `style=whisper` | 말투·전달 | 속삭임 | 속삭이는 말투. 한국어 라벨 "속삭임"(스튜디오). 음색 설명 없음 | airy-tts-v1 | 위 문서, 스튜디오 번들 |

- 문서는 "예시"가 아니라 닫힌 값 목록처럼 적는다("`normal`, `bright`, `calm`, 또는 `whisper`"). 네 값 밖의 값을 보내면 어떻게 되는지는 문서에 없다(400 `invalid_value`일 가능성이 있으나 확인하지 못함).
- 분류는 제안이다. `bright`·`calm`을 감정으로 볼지 말투로 볼지는 문서가 정하지 않았다.

### 넣는 규칙
- 위치: 대본 안에 넣지 않는다. 요청 본문의 `style` 필드다. 생략하면 `normal`.
- 조합: 값 하나만. 여러 개 조합, 강도 수식어·숫자, 자유 문구는 없다.
- 닫는 태그, 줄 안 적용 범위: 해당 없음. 적용 범위는 요청 전체(`input` 전체, 최대 1,280자)다.
- `input` 길이 상한은 1~1,280자다. (llms.txt: 웹 스튜디오의 직접 합성은 640자 상한. https://airy.so/llms.txt)

### 한국어 대본에서
- `language`는 `ko`·`en`이고 `style` 네 값은 두 언어 모두에서 같은 필드다. `style`이 한국어에서 달라지는 점, 한국어 품질에 대한 문서 언급은 없다. 정보 없음.
- 스튜디오 화면은 한국어 라벨을 쓴다: 기본 / 밝은 느낌 / 차분한 느낌 / 속삭임. 필드 값은 항상 영어 `normal`·`bright`·`calm`·`whisper`다.

### 과금과 길이
- 입력 한 글자마다 `en` 1크레딧, `ko` 1.5크레딧(요청의 `language` 기준). `style` 값에 따른 추가 요금은 문서에 없다. 태그를 넣는 방식이 아니라서 "태그 글자 과금" 문제도 없다. (https://airy.so/cloud-api/docs/api/tts/speech-synthesis)
- 글자를 무엇으로 세는지(코드포인트 등)는 문서에 없다.

### 공급자 화면의 태그 UI
- 웹 스튜디오(`https://airy.so/studio`, 줄 단위 대본 편집기)에는 인라인 태그 UI가 없다. 대신 도구 모음의 "스타일(Style)" 선택(문구: "생성할 음성의 스타일을 선택해 주세요" / "Speaking style for generated speech")이 있고 값은 API와 같은 네 개(기본·밝은 느낌·차분한 느낌·속삭임)다. 언어 선택(`toolbar.speechLanguage`)도 같은 방식이다. (스튜디오 번들의 화면 문구)
- 스튜디오는 생성한 줄마다 `style`을 따로 저장한다(줄 데이터에 `language`, `style`이 같이 있다). 즉 감정 변화는 "줄을 나눠 줄마다 스타일을 고르는" 방식이다.
- 웹 스튜디오에만 있는 감정 기능: 확인되지 않았다. 스튜디오에 `mix.speed`(속도) 같은 믹스 항목이 보이나 오디오 후처리(믹스 화면)이고 TTS 감정 기능이라는 설명은 없다. API에는 속도·음높이 필드가 없다(`trailing_silence`만 있고 이는 끝에 붙이는 무음 0~5초).
- 자동 감정 태그 추천 기능: 공개 페이지·문서에 없다.
- 공개 도움말·블로그 문서: `sitemap.xml`에 `/`와 `/studio`뿐이고 도움말 센터·블로그는 확인되지 않았다.

### 이 앱 작업실에 넣을 때 주의
1. Airy에는 대본에 넣는 감정 태그가 없다. 뱃지를 눌러 대본에 문자열을 넣는 방식으로는 Airy를 지원할 수 없고, 같은 뱃지 UI를 쓰려면 "대본 삽입"이 아니라 "요청의 `style` 선택"으로 동작이 달라진다(이 앱 내 문장 듣기가 이미 `style`을 보낸다).
2. `style`은 요청 전체에 하나다. 한 대본 안에서 구간마다 다른 감정을 쓰려면 구간(줄)마다 요청을 나눠야 하고, 요청마다 과금되고 오디오가 따로 나온다. Airy 스튜디오도 줄마다 스타일을 고르는 구조다.
3. 다른 공급자의 대괄호 태그(예: `[laughs]`)를 Airy 대본에 그대로 넣으면 글자 그대로 읽히는지 거절되는지 문서로 알 수 없다. 대본에 태그가 섞인 채 Airy로 보내면 안 되는지는 실제로 시험하기 전에는 모른다(유료 호출이라 이 리서치에서 하지 않았다). 공급자 전환 시 태그 제거가 필요한지 설계 때 정해야 한다.
4. 허용값이 네 개 고정이다. 이 앱의 `AIRY_STYLES`(`packages/api/src/providers/trial-options.ts`, `normal·bright·calm·whisper`)가 문서와 일치하므로 목록은 이미 정본과 같다. 값 뜻(라벨)은 문서에 없고 스튜디오 번들의 한국어 라벨만 근거이므로 뱃지 설명은 "밝은 느낌" 같은 라벨 수준으로 쓴다.
5. 글자 수 상한은 1,280자(앱 내 듣기는 앱 상한 200자)이고 `language`로 요금이 갈린다. 태그가 대본에 안 들어가므로 길이·요금에는 영향이 없다.
6. 뱃지에서 Airy 값을 "음색 설명"으로 약속하면 안 된다. 각 값이 실제로 어떻게 들리는지 문서 설명이 없다(성우마다 차이가 날 수 있는지도 모름).

### 기존 문서와 다른 점
- `docs/research/airy-api-options.md` 4절의 `style` 행(`normal`·`bright`·`calm`·`whisper`, 기본 `normal`, 필수 아님)은 영어·한국어 원문 둘 다와 일치한다. 달라진 사실은 없다.
- 추가로 확인한 것(기존 문서에 없음): 스트리밍 합성에도 같은 `style`이 있다. 웹 스튜디오 화면의 한국어 라벨(기본/밝은 느낌/차분한 느낌/속삭임). 스튜디오가 줄마다 `style`을 저장한다. 문서 어디에도 인라인 태그·SSML·쉼 표기가 없다. `llms.txt`에 요청 제한 표가 있다(기존 문서는 "정보 없음"이라 적음): 동시 요청 Free 2·Plan A 2·Plan B 4·Plan C 16, 분당 요청 상한 없음(fair use), 관리용 호출 분당 300회(https://airy.so/llms.txt). 감정 태그와는 무관하다.
- `llms.txt`는 `GET /v1/audio/voices`라고 적지만 공식 문서의 보이스 목록은 `GET /v1/voices`다. llms.txt 쪽이 오래됐거나 오기일 수 있다. 기존 문서는 `/v1/voices`를 쓰고 있어 맞다.

### 확인하지 못한 것
- `bright`·`calm`·`whisper`가 실제로 어떻게 들리는지(문서 설명 없음). 들어 보려면 유료 호출이 필요해 하지 않았다.
- 대본에 `[태그]`·괄호·SSML을 넣었을 때의 동작(글자 그대로 읽는지, 무시하는지, 400인지).
- `style`에 네 값 밖의 값을 보냈을 때의 응답.
- `unsupported_characters`로 거절되는 문자의 범위.
- 성우별로 `style` 효과가 다른지.
- 웹 스튜디오에 감정·말투 관련 도움말·공식 블로그가 따로 있는지(공개 사이트맵에 없음). 스튜디오는 로그인 없이 일부 쓸 수 있으나 화면을 실제로 열어 보지는 않았고 번들 문구만 읽었다.
