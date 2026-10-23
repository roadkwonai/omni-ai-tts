# Fish Audio Drama 3와 다화자 대화 조사 (2026-10-21)

표기: [공식] 공식 문서·블로그·공식 소스, [2차] 제3자 페이지, [정보 없음] 확인 못 함.
WebFetch는 작은 모델이 요약한 결과라 따옴표 인용은 요약 과정을 거친 것이다. 가격과 제한처럼 결정에 쓸 값은 구현 전에 원문을 한 번 더 본다.

## 1. 출처별 요약

### 1.1 HF Space https://huggingface.co/spaces/fishaudio/Drama-3
Gradio 데모(ZeroGPU). 파일: README.md, gradio_ui.py, server.py, drama3_engine.py, studio_content.json, workflow.json 등. [공식]
- README: 음성 모드 Surprise(기본)/Clone/Design, "Give a note"는 같은 음성으로 다른 연기 지시의 새 테이크를 만든다. Studio 탭과 Workflow 탭이 같은 생성 코드를 공유한다. 호출자당 동시 2테이크, 10분에 60회 시작. 체크포인트 약 41 GB. 라이선스 메타는 Apache-2.0. [공식]
- gradio_ui.py (Studio 탭):
  - 대본 입력칸 placeholder "Write a line. Give it some direction." 글자 카운터 "N / 600". [공식]
  - 아코디언 "Direction tags": 힌트 "Tags in `[ ]` and `< >` are direction, not words. Any wording works." 팔레트 3종 Events(POINT_TAGS), Span(SCOPED_TAGS), Mood(STYLES)를 커서 위치에 삽입. [공식]
  - "How to direct" 예: `Well [sighs] fine, you win. [laughs]` / `Promise me <whisper>you won't tell her</whisper>.` / `[icy calm] Fine.` / `Direction: put the rise on "goodbye".` + `Line: So this is goodbye.` [공식]
  - Sampling: Temperature 0.3~1.3(기본 1.0), Top-p 0.5~1(0.9), Top-k 0~100(0). 안내문 "Low values make takes go silent mid-line." [공식]
  - 버튼: Perform, Stop, Retake. 이력은 "Take 1, Take 2..." 드롭다운. 지표 "First audio X ms · Y s audio · Z× real time".
  - 이 UI는 한 테이크에 한 목소리뿐이다(다화자 UI 없음). [공식]
- 음성 모드 상세: Clone = 프리셋 3개(clone1~3) 또는 업로드/마이크, 받아쓰기 칸 "What the clip says", 안내 "Clips are trimmed to 20 s and transcribed for you", 25 MB 제한. Design = 캐릭터 이름 + 음성 설명(age, timbre, accent, energy를 쓰라는 안내) + 장면(선택). Surprise = 모델이 대사에 맞는 목소리를 즉흥으로 만들고, "Keep this voice"로 클론으로 저장. [공식]
- server.py 길이 제한: 대본 600자, 참조 전사 600자, 리테이크 노트 120자, 캐릭터 이름 40자, 음성 설명 300자, 장면 200자. `<|` 가 들어간 입력은 400으로 거절. [공식]
- 리테이크(Give a note): 노트에서 `[ ] < > |` 를 제거한 뒤, 원 대사에서 연기 지시를 지운 글을 문장으로 쪼개 각 문장 앞에 `[note]` 를 붙이고 `Direction: {note}\nLine: {directed}` 형태로 구성한다. 직전 테이크와 최대 2개 이전 테이크를 history(오디오 코드 포함)로 같이 보낸다. 즉 "Give a note"는 텍스트 재작성 + 이전 테이크 컨텍스트다. [공식 소스]
- 내보내기: `GET /api/takes/{id}.wav` (drama3-{id}.wav). 테이크는 메모리 보관, 재시작 시 사라짐. 장면 단위 다화자 내보내기는 없음. [공식]
- studio_content.json: EXAMPLES 8, CAST 8(선장, 심야 라디오 DJ, 활발한 아이, 느와르 형사, 전령, 졸린 인턴, 악당, 할머니), POINT_TAGS(laughs, chuckles, sighs, gasps, pause, clears throat, hesitates), SCOPED_TAGS(whisper, slow, emphasis), STYLES 7개("icy calm", "sarcastic and deadpan" 등), NOTES 8개("softer and warmer", "faster", "angrier" 등). [공식]
- workflow.json: "Direct a Drama 3 performance", 노드 6개. 입력(참조) 4개 Script/Voice mode/Preset voice/Voice description → 연산 노드 "Drama 3 · Perform"(함수 direct_performance) → 출력 노드 "Performance"(audio). 간선 5개. 한 대본 → 한 오디오의 단순 그래프이고 다화자·분할은 없다. [공식]
- drama3_engine.py: 장면 모드가 따로 있다. 시스템 블록에 `Scene:`, `Characters:`, `- {name}: {description}` 를 적고 지시문 "Voice every line of the script in order, with <|audio_separator|> between consecutive lines." 각 턴은 `{name}: {text}` 형식. 이름에 `:` 금지. 설명형 캐릭터는 참조 음성과 동시 사용 불가. 이는 Space 자체 엔벨로프이며 공개 API의 `<|speaker:N|>` 와는 다른 경로다. "턴 사이 `<|audio_separator|>`"는 모델이 줄 경계를 내부적으로 안다는 근거로 읽히나 API로 노출되는지는 [정보 없음]. 기본 샘플링 temperature 1.0, top_p 0.9, top_k 30, 최대 새 토큰 1200, 프롬프트 최대 8192행, 참조 음성 최대 60초. [공식 소스]

### 1.2 https://fish.audio/ko/drama-3/ [공식]
- 모델은 Preview 상태. 문구: "대사를 넘어,연기까지 연출하세요." "모든 연출은 그대로 읽고, 고치고, 다시 쓸 수 있는 일반 텍스트예요."
- 기능: 자연어 연기 지시, 소리/감정/쉼 삽입(`[sigh]`, `[pause]`), 선택 단어 효과(속삭임 강조 부드럽게 빠르게 느리게 강세 힘차게), 자동 태그("평범한 대사에 연기 지시를 자동으로 추가하고, 필요한 부분만 고칠 수 있습니다"), 다화자 장면("화자마다 음성을 지정하면 대화 전체를 한 번에 생성합니다"), API(`model: drama-3` 헤더).
- 편집기: 단어 범위를 선택하고 Tags 메뉴에서 효과를 고른다. 자동 태그 예(형사와 용의자): `[defensive, slightly uneasy tone] I was home. [pause] Asleep.`
- 주의 문구: "Drama 3는 아직 개선 중이에요. 테이크마다 결과가 달라지니 여러 번 생성한 뒤 가장 좋은 것을 고르세요."
- 가격/한도는 페이지에 없음. 한국어 예제 대사는 없고 지시문은 "어떤 언어로든" 가능하다고만 한다.

### 1.3 https://openart.ai/ai-model/fish-audio-drama-3/ [2차]
- 80개 이상 언어, 다화자 한 번 생성("each keeps a distinct voice and responds to the previous line"), 단어 단위 제어, 비언어음, 한 캐릭터가 장면 중 언어 전환. 작업 흐름: 오디오 도구에서 모델 선택 → 노트와 대사 입력 → 출력 옵션 → 생성 → 오디오 다운로드. 용도에 "AI 영상과 마이크로드라마 대사" 명시.
- 모델별 가격/크레딧/한도 표기 없음 [정보 없음]. 예시 문법: `[voice drops to a terrified whisper]`, `Alright, [sigh] let's try again.`, `[slow, deadly serious]`, `[hurt, holding back tears]`.

### 1.4 https://fish.audio/blog/fish-audio-drama-3/ [공식]
- 2026-10-13 출시. 83개 언어. 오픈 웨이트(Hugging Face). 35B MoE(활성 약 3B). 44.1 kHz.
- 문법: 줄 시작의 `[barely holding it together, forcing a smile]`, 줄 중간의 `[voice breaks]`, 소리 큐 `[shaky breath]` `[small laugh]`, 쌍 태그 `<emphasis>`, `<whisper>`. 연출 문구는 대사 언어와 달라도 된다(중국어 스페인어 일본어 예).
- 가격: "API list price: $50 per million characters", 출시 가격 10월 13일~11월 12일 "$10 per million characters"(80% 할인). 크리에이터 플랜은 S2.1 Pro와 같은 크레딧.
- 인터랙티브 편집/오디오 인페인팅은 소수 초대 테스트, 편집 API는 "coming soon". 한 단어만 다시 만드는 기능.
- 라이선스: 오픈 웨이트는 연 매출 50만 달러 미만이면 상업 사용 가능, TTS/클로닝 서비스나 API로 제공하려면 별도 라이선스. 실존 인물 무동의 클로닝 금지.
- 최대 텍스트 길이, 속도 제한, 컨텍스트 창은 명시 없음 [정보 없음].

### 1.5 sglang-omni 쿡북
5절 참조. [2차: 셀프호스팅 문서]

### 1.6 공식 API 문서
- https://docs.fish.audio/features/text-to-speech/drama-3 [공식]: 5.4~5.7절과 3절 참조. 가격/길이 제한/속도 제한은 이 페이지에 없음.
- https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech [공식]: 4절.
- https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech-stream-with-timestamps [공식]: 4절.
- https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits [공식]: 4절.

## 2. 사용자 기능 목록

| 기능 | 출처 | 동작 |
|---|---|---|
| 대본 편집 | Space, fish.audio TTS | 텍스트칸에 대사와 연기 지시를 평문으로 쓴다. 연출이 곧 텍스트라 읽고 고치고 복사 가능. Space는 600자 카운터. |
| 태그 팔레트/삽입 | Space(Events/Span/Mood 버튼), fish.audio(단어 선택 후 Tags 메뉴) | Space: 커서 위치에 태그 문자열 삽입. 사이트: 단어를 드래그 선택하고 효과를 고르면 여닫는 태그로 감싼다. |
| 스타일 접두어 | Space Mood | `[icy calm] Fine.` 처럼 대사 앞 대괄호. 팔레트 7개 중 클릭. 문구는 자유("Any wording works"). |
| 점 태그 | Space Events | `[sighs]` `[laughs]` `[pause]` 등을 원하는 위치에. |
| 범위 태그 | Space Span, 공식 문서 | `<whisper>…</whisper>` 로 단어 범위에 적용. |
| 감독 노트 형식 | Space "How to direct" | `Direction: ...\nLine: ...`. 사용자에게 보이는 예시이며, 실제 Retake 경로에서만 서버가 이 형식을 만든다. |
| Give a note/Retake | Space | 1) 테이크 생성 2) 노트 칩 클릭 또는 직접 입력(120자) 3) Retake 4) 서버가 원 대사 + 노트 + 직전/이전 테이크를 모델에 넣어 새 테이크 생성. 같은 음성 유지. |
| 자동 태그 | fish.audio ko | 평문 대사에 연기 지시를 자동 추가, 사용자가 수정. 공개 API 엔드포인트는 [정보 없음]. |
| 음성 설계(Design) | Space | 이름 + 설명(나이 음색 억양 에너지) + 장면을 넣어 음성을 즉석 합성. 공개 API에 대응 기능은 [정보 없음](reference_id 필요). |
| Surprise | Space | 음성 없이 모델이 대사에 맞는 목소리 선택. "Keep this voice"로 클론 저장. |
| 클로닝 | Space(업로드/마이크, 전사 자동), API | Space: 20초로 잘라 Whisper 전사. API: reference_id 또는 inline references(MessagePack). |
| 다화자 장면 | fish.audio ko, OpenArt, API | 화자별 음성을 지정하고 한 번에 대화 전체 생성. Space UI는 미지원. |
| 워크플로 그래프 | Space Workflow 탭 | 입력 노드 → Perform 노드 → 오디오 노드. 노드 편집기이지만 내용은 단일 경로. |
| 내보내기 | Space, OpenArt | Space: 테이크별 WAV. OpenArt: 오디오 파일 다운로드. 줄별 분할 내보내기는 어느 출처에도 없음. |
| 이력 | Space | 세션 내 Take N 드롭다운, 메모리 한정. |
| 샘플링 조절 | Space Sampling | 온도, top-p, top-k 슬라이더와 초기화. |
| 인페인팅(한 단어 재생성) | 블로그 | 초대 테스트, 편집 API는 곧 공개. 지금은 사용 불가. |

## 3. 연출 문법 정본

[공식] 문서(drama-3 페이지, 블로그)에 있는 것:
1. 연기 지시(대괄호, 단어 앞): `[barely holding it together, forcing a smile] I'm fine. Really. Go on without me.` 대사 언어와 무관하게 쓸 수 있다("Directions can be written in any language").
2. 소리/쉼(대괄호, 발생 위치): `[shaky breath]`, `[small laugh]`, `[sigh]`, `[pause]`.
3. 쌍 태그: `<whisper>`, `<emphasis>`, `<soft>`, `<fast>`, `<slow>`, `<stress>`, `<forceful>` (7종). 예 `I'm fine. Really. <whisper>Go on without me.</whisper>`
4. 언어 태그(실험적): `<french|spanish|german|japanese|chinese|korean|italian>…</…>`. 바뀌는 단어만 감싼다. 문서 경고: "Language tags are experimental... the model may switch language on its own when the text is already multilingual." 예 `<korean>안녕하세요</korean>`. 한국어 화자 대본 전체를 감싸라는 뜻이 아니다.
5. 발음 태그: `<|phoneme_start|>…<|phoneme_end|>` (영어 CMU Arpabet, 중국어 병음, 일본어 로마자). 한국어 발음 표기는 [정보 없음].
6. 다화자: `<|speaker:0|>`, `<|speaker:1|>` … 각 턴 앞에. 인덱스 = `reference_id` 배열 위치. 턴 안에서도 지시와 쌍 태그 사용 가능.
7. 줄 중간 지시: `[voice breaks]`, `[whispering]` 으로 그 지점부터 연기 변경(블로그).

[공식 데모 코드]에만 있는 것:
- 접두어 스타일 `[icy calm]` 은 일반 대괄호 지시와 같은 문법이다. 별도 규칙이 아니다.
- `Direction: ...\nLine: ...` 는 Space 리테이크 내부 프롬프트. 공개 API 문서에는 없다. API에서 쓰면 글자 그대로 읽힐 위험이 있다 [추정].
- 데모 팔레트의 점 태그 `[laughs]`, `[chuckles]`, `[sighs]`, `[gasps]`, `[clears throat]`, `[hesitates]`, 쌍 태그 3종(whisper, slow, emphasis).
- 입력에 `<|` 가 있으면 서버가 거절(엔진 토큰 보호). API가 `<|speaker:N|>` 외 토큰을 어떻게 다루는지는 [정보 없음].

중첩/한계: 쌍 태그 중첩, 태그 개수 제한, 대괄호 지시 길이 제한은 어디에도 없다 [정보 없음]. "Any wording works" 라는 문구는 지시가 정해진 어휘가 아니라 자유 서술이라는 뜻이다. 한국어로 쓴 지시의 효과는 한국어 예제가 없어 검증된 바 없다 [정보 없음]. 영어 지시가 안전하다.

## 4. API 사실

- 엔드포인트 [공식]: `POST https://api.fish.audio/v1/tts` (본문 JSON/MessagePack, 응답 chunked 스트림), `POST https://api.fish.audio/v1/tts/stream/with-timestamp` (SSE). WebSocket은 tts-live.
- 헤더 [공식]: `Authorization: Bearer`, `model` 열거형 `s1 | s2-pro | s2.1-pro | s2.1-pro-free | drama-3`. "If omitted or set to an unrecognized value, the request falls back to s2.1-pro." (오타는 조용히 유료 s2.1-pro로 폴백.) 모델은 본문이 아니라 헤더다.
- 본문 [공식]: `text`(필수), `reference_id`(문자열 | 문자열 배열 | null), `references`(인라인 제로샷, MessagePack 필수), `temperature` 0.7, `top_p` 0.7(둘 다 0~1), `prosody{speed 0.5~2.0, volume dB, normalize_loudness}`, `chunk_length` 100~300(tts 문서에는 기본 300, 가이드에는 200으로 불일치), `min_chunk_length`, `normalize`, `language`(BCP-47), `format wav|pcm|mp3|opus`(기본 mp3), `sample_rate`, `mp3_bitrate`, `opus_bitrate`, `latency low|normal|balanced`, `max_new_tokens` 1024(텍스트 청크당), `repetition_penalty` 1.2, `condition_on_previous_chunks` true, `early_stop_threshold`, `features`, `pronunciation_dictionary`(최대 3).
- 다화자 [공식]: "Multi-speaker is available with the S2 family ... and drama-3, not s1." "The speaker index corresponds to the index in reference_id array." 최대 화자 수는 공식 문서에 없다 [정보 없음]. 셀프호스팅 쿡북은 `<|speaker:0|>`~`<|speaker:15|>` 16명이라고 한다 [2차].
- 길이 제한 [정보 없음]: 공식 API는 `text` 최대 길이를 어디에도 명시하지 않는다. 요금 문서에도 없다. Space 데모는 600자(데모 한정). OpenArt FAQ의 10,000자는 경쟁 모델(Eleven v4) 이야기다.
- with-timestamp와 drama-3 [공식]: 해당 엔드포인트 문서의 `model` 열거형에 `drama-3` 가 있고, 다화자 `reference_id` 배열과 `<|speaker:N|>` 설명도 같이 있다. 즉 문서상 호환이다. 단 실제 호출로 확인한 것은 아니다. 호출은 유료라 하지 않았다.
- 타임스탬프 응답 [공식]: SSE `message` 이벤트마다 JSON: `audio_base64`(청크, 도착 순서대로 이어붙임), `content`, `alignment`(null 가능, `segments[{text,start,end}]` 초 단위, `audio_duration`), `chunk_seq`, `chunk_audio_offset_sec`. 정렬은 텍스트 청크별 누적 스냅샷이고, "replace the previous snapshot for that chunk_seq; do not append". 전역 시간 = 세그먼트 시간 + `chunk_audio_offset_sec`. 문서는 "단어" 단위를 보장한다고 하지 않고 세그먼트 `text` 로만 표기. 화자 턴 경계 필드는 없다. 지시 태그(`[...]`)가 세그먼트에 어떻게 반영되는지는 [정보 없음].
- 정렬 정확도 [2차]: 제3자 통합이 단어 끝이 실제 소리 끝과 0~140 ms 이내로 맞는다고 보고(S2 계열 기준, drama-3 아님). https://github.com/shinohara-rin/turn/pull/20
- 지연/스트리밍 [공식]: `latency=balanced` 는 첫 오디오 약 300 ms, `normal` 이 가장 안정. 응답은 청크 스트림. 한 장면 전체를 한 요청으로 만들면 총 소요는 길이에 비례.
- 가격: 
  - 공식 요금 문서 [공식]: s2.1-pro $15.00/M UTF-8 bytes, s2-pro $15.00/M, s1 $15.00/M(2026-12-31 퇴역), s2.1-pro-free $0(2026-11-30까지, changelog). `drama-3` 는 이 페이지에 없다.
  - 블로그 [공식]: drama-3 API 정가 "$50 per million characters", 출시가 10월 13일~11월 12일 "$10 per million characters". 단위가 요금 문서(바이트)와 다르다. 한국어는 글자당 3바이트라 바이트 기준이면 같은 글자 수가 약 3배로 계산될 수 있다. drama-3가 바이트 과금인지 글자 과금인지는 [정보 없음]. 계정 대시보드 사용량으로 확인해야 한다.
  - OpenArt [2차]: 가격 없음. 크리에이터 플랜은 S2.1 Pro와 같은 크레딧 [공식 블로그].
- `synthesizeScene`의 SSE 읽기 규칙(2026-10-22, 설치본 확인: `events.json` 13개 이벤트 모양, undici 7.29.1 `client.js:261-262`·`client-h1.js:697-701`): 블록은 빈 줄로 나누고 `data:` 줄만 읽으며 `[DONE]`·빈 데이터는 건너뛴다. 정렬은 `chunk_seq`마다 마지막 스냅샷만 남기고 `chunk_audio_offset_sec`로만 시각을 더한다. 빈 줄 없이 끝난 마지막 블록도 읽는다. 머리가 바로 오므로 `headersTimeout`(300초)이 전체 시간을 막지 않고 본문 300초는 조각 사이 공백이다. 오디오 32MiB나 덜 온 블록이 그 두 배 글자를 넘으면 더 읽지 않는다.
- 속도 제한 [공식]: 동시 요청 Starter 5, Elevated(누적 $100) 15, High Volume($1,000) 50. 초과 시 429, `Retry-After` 없음, 지수 백오프. 오류: 401, 402, 503.
- 한국어 지원 증거: 블로그 "83 languages" [공식], OpenArt "80+" [2차], API `language` 필드에 `ko`/`ko-KR` 전용 정규화 규칙 [공식], `<korean>` 언어 태그는 실험적. drama-3 한국어 품질 평가 수치나 한국어 감정 연기 예제는 [정보 없음]. 영어 예제만 있다.
- 줄/세그먼트별 출력 기능: 어느 출처도 줄별 파일 분리를 제공하지 않는다. 공식 API 응답은 하나의 오디오 스트림 + 텍스트 청크별 정렬이다. 인페인팅/편집 API는 "coming soon". OpenArt/Space도 장면 통합본 하나.

## 5. sglang-omni 쿡북 [2차: 셀프호스팅]

URL: https://sgl-project.github.io/sglang-omni/cookbook/fishaudio_drama3.html
- 서버: `sgl-omni serve --model-path fishaudio/drama-3 --port 8000`, 엔드포인트 `POST /v1/audio/speech` (페이지 안에 `/v1/tts` 표기도 있어 불일치).
- 요청 필드: `input`/`text`, `references[{audio_path, text}]`(각 참조에 전사 필요), `stream`, `response_format`(pcm 등), `previous_takes`(이전 테이크 텍스트, 편집용 컨텍스트), 사전 인코딩 `vq_codes`.
- 샘플링: temperature 1.0, top_p 0.9, top_k 제한 없음(코드북 헤드는 최대 30), max_new_tokens 500(벤치 설정). 데모 쪽 안내: top_k를 낮게 두면 중간에 무음이 된다.
- 참조 음성: 최대 60초(초과 시 400), 전사 필수. 프롬프트 최대 8192행(약 21.5행/초 참조 음성 + 텍스트 토큰). 초과 400.
- 청킹: "Long text is chunked automatically and can be streamed per chunk." 청크 크기 규칙 설명 없음.
- 화자: `<|speaker:0|>`~`<|speaker:15|>`, 한 텍스트에 최대 16명.
- 동시성: 기본 최대 16 동시 요청.
- API 클라이언트에 주는 의미: (1) 모델은 참조 음성을 `전사 + 오디오` 쌍으로 받으므로 호스팅 API의 reference_id 모델도 전사를 갖고 있다고 보는 게 맞다. (2) `previous_takes` 로 이전 테이크를 컨텍스트로 넣는 편집 개념이 모델에 있으나 공개 호스팅 API에 노출되는지는 [정보 없음]. (3) 한 요청의 길이에는 8192행 급 구조적 한도가 있어 장면이 길면 분할이 필요할 수 있다. 셀프호스팅 한도라 호스팅 API 한도와 같다는 보장은 없다.

## 6. 우리 설계에 주는 시사점

1. 장면 모델: 한 장면 = 줄 배열(speakerIndex, 지시, 대사). 서버가 `<|speaker:N|>` 접두어로 한 텍스트를 조립하고 `reference_id` 배열을 화자 순서대로 만든다. 화자 인덱스는 사용자 입력이 아니라 장면의 배우 목록 위치에서 서버가 정한다. 소유한 voice id만 허용(보안 불변식).
2. 줄별 파일 분리: 공식 기능은 없으므로 두 길 중 하나다. (A) 장면 한 번 생성 + `/v1/tts/stream/with-timestamp` 의 정렬로 줄 경계를 찾아 오디오를 자른다. 정렬은 `segments[{text,start,end}]` 이고 청크별 누적 스냅샷이라 `chunk_seq` 별 마지막 스냅샷만 쓰고 `chunk_audio_offset_sec` 를 더해야 한다. 줄 경계 매핑은 세그먼트 텍스트에서 `<|speaker:N|>` 와 지시 태그가 어떻게 보이는지 실제 응답으로 확인이 필요하다. (B) 줄마다 별도 호출. 비용은 비슷하나 장면 내 상호 반응(앞 줄에 응답하는 억양)이 사라지고 호출 수 증가. 권장: A를 기본, 정렬이 불안정하면 무음 구간 기반 보조 분할이나 B로 후퇴. 첫 구현 전에 무료가 아닌 소액 1회 실호출로 응답 모양을 사용자 승인 하에 확인한다. 자동 테스트에서는 호출 금지.
3. 모델 헤더: `drama-3` 를 서버에서 열거형으로 고정하고 오타 폴백(유료 s2.1-pro)을 막는다. 응답/사용량에서 모델이 실제로 drama-3였는지 확인할 수단이 문서에 없다 [정보 없음]. 호출 전 검증이 유일한 방어선.
4. 가격 표시: 블로그 $50/M characters(10월 13일~11월 12일 한시 $10), 요금표 바이트 단위 $15/M(drama-3 항목 없음)가 어긋난다. 한국어는 3바이트/글자라 추정치가 3배 흔들릴 수 있다. UI의 예상 비용은 "추정" 표기하고 정확한 단가는 설정값으로 둔다. 첫 실호출 후 대시보드 차감량으로 단위를 확정한다.
5. 길이: 공식 최대 길이가 없다. 장면당 줄 수와 총 글자 수에 우리 쪽 상한(예: 데모의 600자는 데모 한정이므로 참고만)을 두고, 초과 시 장면을 나눈다. 청크(`chunk_length` 100~300)마다 정렬이 나뉘므로 긴 장면은 청크 경계가 줄 중간에 걸릴 수 있다.
6. 지시 문법 UI: 정본 문법(3절 1~3, 6)만 팔레트에 넣는다. 점 태그/쌍 태그 버튼은 커서나 선택 영역에 삽입(데모와 공식 사이트 방식). 지시문은 영어를 기본값으로 제안하고, 한국어 지시는 "검증되지 않음"으로 표시. `<korean>` 태그는 한국어 대본에서는 쓸 필요가 없다(실험적, 오작동 위험). `Direction:/Line:` 형식은 API에서 쓰지 않는다.
7. 한국어 위험: 한국어 감정 연기 품질은 근거가 없다. 대표 두 목소리와 짧은 장면으로 사용자 청취 테스트를 첫 TASK 검증에 넣는다. 블로그가 "테이크마다 결과가 달라진다"고 경고하므로 "여러 테이크 생성 후 선택" 흐름(이력, 재생성)을 핵심 UX로 두되, 재생성은 유료이므로 자동 재시도 금지, 사용자가 누른 만큼만 호출(중복 과금 방지).
8. 리테이크("Give a note")는 API에 대응이 없다. 우리 쪽에서는 사용자가 줄의 지시문을 고쳐 다시 생성하는 것으로 대체한다. 이전 테이크 컨텍스트 투입은 불가 [정보 없음].
9. 클론/디자인: Design(텍스트로 음성 설계)은 공개 API에 없다. 우리 스튜디오는 기존 Fish 성우 목록과 클론 보이스(reference_id)만 쓴다. 인라인 `references` 는 MessagePack 필수라 JSON 경로와 분리해야 한다.
10. 동시성: Starter 5 동시 요청. 줄별 호출(B)은 병렬 제한과 429 백오프 설계가 필요. 장면 한 번 호출(A)이 단순하다.
11. 라이선스: 호스팅 API 사용은 문제없다. 오픈 웨이트 셀프호스팅 서비스화는 별도 라이선스 필요(참고).
12. 미확인 목록(구현 전 확인): drama-3의 with-timestamp 실제 동작, 화자 최대 수(공식), 텍스트 최대 길이, 실제 과금 단위, 한국어 지시문 효과, 줄 경계가 정렬 세그먼트에 어떻게 나타나는지.

## 7. 우리 시험 결과 (2026-10-21, 사용자 승인 호출)

- 호출: `POST /v1/tts/stream/with-timestamp`, `model: s2.1-pro-free`, `reference_id` 2개(효정2 `1acdf5b0fd6e4692bb3f38c550ffbde2`, 보이스1 `8cf5ee4cb0224c109852a206f185a05f`), `format: mp3`. 대본은 두 사람 6줄, 261자(469 UTF-8 바이트), 줄마다 `<|speaker:N|>` + 한국어 대괄호 지시(`[작게 한숨 쉬며]` 등), 마지막 줄 `<whisper>…</whisper>`.
- 결과: 200, 10.3초, 장면 18.26초. SSE 이벤트 17개, 정렬된 청크 3개, 세그먼트 38개.
- 줄 나누기: 지시와 태그를 뺀 글자 수만큼 세그먼트를 차례로 먹으면 5줄이 정확히 맞았다. 대괄호 지시는 세그먼트에 나오지 않았다(읽지 않은 것으로 보인다). 쌍 태그 이름은 세그먼트 글자에 붙어 나왔다(`whisper지갑아`, `하다whisper`). 7종 쌍 태그 이름을 세그먼트 글자에서 빼면 6줄 모두 맞는다. 붙어 나온 첫 세그먼트는 길이가 0초였다.
- 경계: 줄 사이 간격은 0.08~1.38초. 자르는 점은 앞 줄 끝과 다음 줄 시작의 가운데로 했다. 4→5번처럼 간격이 0.08초인 곳은 잘림을 들어서 확인해야 한다.
- `drama-3`: 402 "Insufficient API credit. API credit is managed independently from platform credit." API 크레딧(웹 플랜 크레딧과 별개)이 0이라 시험하지 못했다. 비용은 0.
- 첫 이벤트 키: `audio_base64`, `content`, `alignment`, `chunk_seq`, `chunk_audio_offset_sec` 등(위 4절과 같다).

## 8. 다른 공급자의 대화 생성 (참고)

| 공급자 | 네이티브 대화 | 화자 한도 | 한국어 | 비고 |
|---|---|---|---|---|
| Fish drama-3 | 있음 (`<|speaker:N|>` + `reference_id[]`) | 공식 없음(셀프호스팅 16) | 공식 예제 없음 | 가격 공식 미확인, 헤더 오타 폴백 위험 |
| Fish s2.1/s2-pro | 있음 | 공식 없음 | 83개 언어(목록 없음), 시험에서 동작 | UTF-8 바이트 과금 |
| ElevenLabs | `POST /v1/text-to-dialogue` `inputs[{text, voice_id}]` | 10 | v3/v4 | 합계 2,000자 권장 |
| Gemini | 있음 | 2(프리빌트만) | 지원 | |
| Typecast, Airy | 없음 | - | 지원 | 줄별 호출 후 연결 |

fish.audio 웹 TTS 편집기(로그인 화면, 2026-10-21 번들 정적 분석): 구간마다 성우 버튼, '화자 추가'. 생성은 구간 성우를 인덱스로 바꿔 `<|speaker:i|>`를 붙인 텍스트 하나로 요청 1회를 보낸다(`model_id`에 성우 id 배열, 최대 32). 결과는 장면 오디오 하나이고 구간별 파일은 없다.

## 9. PCM 확인 호출 (2026-10-22, 사용자 승인, 무료)

- 호출: 7절과 같은 끝점·성우, `model: s2.1-pro-free`, `format: pcm`, `sample_rate: 44100`. 두 사람 4줄, 140자(322 UTF-8 바이트). 한국어 지시 `[놀라며]`, 영어 지시 `[sighs]`·`[laughs]`, `<whisper>` 섞음.
- 결과: 200, 7.6초, SSE 13개. 오디오 바이트 1,190,720 = 13.5초 × 44,100 × 2바이트, 마지막 `audio_duration`(오프셋 포함) 13.5초와 정확히 같다. `ffprobe`: `pcm_s16le`, 모노, 44.1kHz. 평균 음량 -23.9dB(정상 말소리).
- 시각 정보: `chunk_seq` 0·1 두 청크, 1번 오프셋 9.845초. 청크마다 세그먼트가 누적 스냅샷으로 늘어난다(0번: 1→26개). 마지막 이벤트는 `audio_base64`가 빈 문자열이고 정렬만 담는다. 세그먼트 33개.
- 줄 나누기: 4줄 모두 글자 수가 맞았다. 지시(한국어·영어)와 쌍 태그는 세그먼트에 나오지 않았다. 이번에는 쌍 태그 이름이 세그먼트에 붙지 않았다(7절과 다름).
- 자료: `data/fish-drama-pcm-2026-10-22/`(이벤트는 오디오를 길이로 바꿔 저장).

## 10. Drama 3 웹 시험 (2026-10-22, 사용자 요청, 웹 무료 크레딧)

API는 무료로 쓸 수 없어 fish.audio 웹 편집기(`/ko/app/text-to-speech/?version=drama-3`, 무료 플랜 로그인)에서 ego-browser로 1회 생성했다.

- 무료 여부 [공식, 화면]: 무료 플랜은 매달 웹 크레딧 10,000을 준다(이 계정은 10월 28일 갱신). 웹 생성은 이 크레딧에서 빠진다. API 문서는 무료 모델을 `s2.1-pro-free` 하나로만 적고, `drama-3` API는 API 크레딧이 있어야 한다(7절의 402). 웹 크레딧과 API 크레딧은 따로다. inference.sh도 drama-3를 "$50.00/1M UTF-8 bytes"로 받는다 [2차].
- 입력: 9절과 같은 대본·성우(효정2, 보이스1). 웹 편집기는 `[놀라며]`·`[sighs]`·`[laughs]`를 태그 칩으로, `<whisper>…</whisper>`를 구간 칩으로 바꿔 보였다.
- 요청 글: 생성 기록(`/task/outputs`)의 `title`이 우리 API 요청 글(`request-text.txt`)과 바이트까지 같다. 웹도 `<|speaker:N|>`을 붙인 글 하나로 1회 요청한다.
- 과금 단위: 편집기 글자 표시가 "322 / 500 자", 생성 뒤 크레딧이 10,000 → 9,678로 322 빠졌다. 322는 화자 태그와 줄바꿈까지 포함한 UTF-8 바이트 수다(글자 수 192, 태그 뺀 바이트 270). 즉 웹은 1크레딧 = 1 UTF-8 바이트이고, 한 번에 500바이트(한국어 약 150자)까지다. API의 drama-3도 바이트 과금일 가능성이 높다(정가 $50/M이면 이 대본은 약 $0.016) [추정: API 대시보드로는 아직 확인 못 함].
- 결과: 한 번 생성에 테이크 2개("두 개의 오디오 샘플을 생성합니다. 추가 비용은 없습니다"). 15.9초, 14.6초. MP3 128kbps, 모노, 44.1kHz. 생성 4.2초, 4.4초. 평균 음량 -23.5dB, -23.2dB.
- 시각 정보: 웹 화면과 생성 기록 어디에도 단어·줄 시각이 없다(기록 항목은 오디오 주소, 길이, 파형 rms 128개, 화자 목록만). drama-3 API가 with-timestamp에서 정렬을 주는지는 여전히 [정보 없음].
- 줄 경계: 무음 감지(-38dB, 0.18초 이상)로 테이크 1은 쉼 6곳, 테이크 2는 11곳이다. 쉼만으로는 줄 경계를 가를 수 없다.
- 한국어 연기 품질, 지시를 읽었는지: 사용자가 듣고 판단한다(아래 파일).
- 자료: 오디오는 저장소에 넣지 않았다(스크래치 `drama3web/take1.mp3`, `take2.mp3`, `viewer.html`).
