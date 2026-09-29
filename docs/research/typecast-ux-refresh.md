# Typecast UX 재조사: 대본·성우·표현 조절

확인일: **2026-09-26 (KST)**. 조사 유형: 공식 제품 가이드 및 공개 API 구현 참조. [llms.txt](https://typecast.ai/docs/llms.txt)를 먼저 읽고 새 Studio 도움말과 API 참조를 대조했다. 기존 [API 옵션 조사](./typecast-api-options.md), [서비스 비교](./tts-service-comparison.md)를 보완한다. 다른 서비스 비교나 의존성 도입 판단은 범위 밖이다.

공식 공개 문서만 읽었다. 로그인, 유료 API 호출, 샘플 청취, 실제 Studio 조작은 하지 않았다. 웹 도구가 API 문서의 `text/markdown` 형식을 읽지 못한 경우 동일 공식 주소의 `.md`를 직접 가져왔다. 아래 **확인**은 문서 확인이며, **제안**은 우리 UI 설계를 위한 해석이다.

## 직접 결론

Typecast에서 참고할 핵심은 **대본의 선택 범위와 성우·감정·속도·쉼을 연결하는 편집 방식**이다. 새 에디터는 문단 옆 성우 변경, 문장/구간 재생성, 여러 결과 중 적용을 공식 안내한다. API에는 성우 목록·설명 기반 추천·구간 합성이 있지만, Studio의 자동 생성 동작·3개 버전 비교·프로젝트 저장은 그대로 제공되는 API 기능이 아니다. [캐릭터 변경](https://help.typecast.ai/ko/articles/15347233-캐릭터-변경), [음성 재생성](https://help.typecast.ai/ko/articles/15347503-음성-재생성), [API 색인](https://typecast.ai/docs/llms.txt)

우리 화면에서는 **현재 적용 범위**, **기존 음성 재생**, **새 음성 생성**을 분명하게 구분한다. 단일 대본 P0라면 적용 범위를 ‘대본 전체’로 명시하고, 문단 편집이 구현되기 전에는 문단별 적용 버튼을 작동 기능처럼 표시하지 않는 것을 제안한다.

## 공식 서비스 UI와 공개 API

| 항목 | 서비스 UI: 공식 가이드 확인 | 공개 API: 확인 및 경계 | 우리 화면 제안 |
|---|---|---|---|
| 성우 선택 | 문단 왼쪽 성우 이름을 눌러 변경. 여러 문단의 캐릭터 일괄 교체도 안내. [가이드](https://help.typecast.ai/ko/articles/15347233-캐릭터-변경) | `/v3/voices`는 모델·성별·연령·용도·기본/커스텀 필터, 지역화 이름, 지원 모델/감정, nullable 샘플 URL 제공. [목록](https://typecast.ai/docs/api-reference/voices/list-voices) | 선택 성우를 대본 가까이 표시. 탐색 중에도 현재 성우를 고정하고 ‘샘플 듣기’와 ‘선택’을 분리. 일괄 교체에는 적용 대상 수 표시. |
| 탐색·추천 | 공식 새 에디터 소개는 카테고리·톤·연령·성별·분위기 탐색을 설명한다. 실제 필터 조작과 즐겨찾기는 미검증. [공식 소개](https://typecast.ai/kr/learn/typecast-new-editor-characters/) | 설명 기반 추천 `query` 1–500자, `count` 1–10(기본 5). 응답은 ID·이름·점수뿐. [추천](https://typecast.ai/docs/api-reference/voices/recommend-voices) | 이름 검색과 ‘원하는 목소리 설명’ 입력을 구분. 추천 결과도 동일 성우 행으로 표시하되 선택 전 상세 메타데이터 확인. 점수를 확률·품질 보증으로 표시하지 않음. |
| 문단 편집 | 직접 입력·붙여넣기·단락 추가·주기적 자동 저장. 최초 보이스는 임의 선택. [보이스 추가](https://help.typecast.ai/ko/articles/15347211-보이스-추가) | 공개 TTS는 글→음성 계약. 프로젝트·문서 자동 저장 API는 조사한 공개 색인에서 확인하지 못함. [색인](https://typecast.ai/docs/llms.txt) | 저장 상태를 보이게 하고 마지막 사용 성우를 유지하는 제품 동작을 제안. 자동 저장과 프리셋은 앱의 책임으로 구분. |
| 재생성·비교 | 문단 선택→재생성→3개 버전 듣기→하나 적용. 문장 및 쉼으로 분할한 구간도 지원. [가이드](https://help.typecast.ai/ko/articles/15347503-음성-재생성) | 단일 TTS는 한 결과 반환. `seed` 생략 시 변동, 같은 입력과 seed는 재현 가능하다고 문서화. 3개 후보 생성·적용 전용 endpoint는 확인 못함. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) | 후속 비교 화면에서 현재 결과를 유지한 채 새 후보를 명시적으로 생성·적용. ‘3개 만들기’는 여러 호출과 사용량을 드러내는 별도 작업. |
| 감정 | 선택 스크립트에 감정·강도 지정, 선택하면 음성 생성/적용. 오른쪽 감정 메뉴에서 제거. [가이드](https://help.typecast.ai/ko/articles/15347246-감정-조절) | v30은 Smart/지정 감정 분기. 지정 감정 7개·강도 0–2. Smart는 앞뒤 실제 대본 문맥을 받으며 자유 말투 지시문 필드가 아님. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) | ‘기본 / 자동 감정 / 직접 선택’을 구별. 직접 선택에서만 감정·강도를 표시하고 변경은 새 생성 전까지 설정으로 보관. 자동 감정 설명 칸을 자유 프롬프트로 오인시키지 않음. |
| 속도·피치 | 새 에디터는 선택 스크립트의 상단 속도 메뉴, 0.5–2.0배·0.1 간격을 안내. 별도 피치 UI는 이번 새 에디터 가이드에서 미확인. [속도](https://help.typecast.ai/ko/articles/15347510-속도-조절) | `audio_tempo` 0.5–2.0, 기본 1. `audio_pitch` 정수 −12–12 반음, 기본 0. API가 속도 0.1 간격을 강제하지는 않음. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) | 속도는 `1.0×`, 피치는 `0 반음`으로 단위 표시. 감정의 높은 톤/낮은 톤과 피치를 다른 설정으로 구분. 피치는 접힌 세부 조절 후보. |
| 쉼 추가 | 선택 스크립트에서 쉼 추가→시간 입력. 삽입한 쉼을 눌러 변경. Studio 안내의 최소값은 0.1초. [호흡 조절](https://help.typecast.ai/ko/articles/15347490-쉼-추가-호흡-조절) | 텍스트 쉼 표기와 Compose pause가 별개 지원. Compose는 개별 `0초 초과–10초`, 합계 60초 이하. [llms](https://typecast.ai/docs/llms.txt), [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) | 대본 안에 `쉼 0.5초` 칩으로 표시하고 클릭 편집·삭제. ‘쉼 제거’는 삭제 행동으로 제공. Studio의 0.0→0.1 보정을 API 일반 규칙으로 복제하지 않음. |
| 쉼 일괄 | 구간 선택→쉼 추가→추가 위치 선택→적용. 위치 선택지의 상세 내용은 본문 미기재. [일괄 가이드](https://help.typecast.ai/ko/articles/16937869-쉼추가-일괄) | 문장 끝 자동 삽입 전용 API는 미확인. Compose의 구간 배열이나 텍스트 전처리를 앱에서 구성해야 함. [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) | 후속 기능. 적용 위치·개수 미리보기와 되돌리기가 있을 때 제공. 쉼 삽입과 생성된 음성의 무음 줄이기를 다른 항목으로 둠. |
| 발음·읽는 글 | 새 에디터의 독립 발음 사전 UI를 공개 가이드에서 확인하지 못함. [새 에디터 목차](https://help.typecast.ai/ko/collections/19654179-typecast-studio) | llms는 SSML·발음 사전 미지원을 명시. AutoTag는 숫자·날짜·금액 등 텍스트 전처리 SDK이며 TTS body 옵션이 아님. [llms](https://typecast.ai/docs/llms.txt), [AutoTag](https://typecast.ai/docs/bestpractice/autotag) | 원문과 실제 읽는 글을 구분하고 변경 제안·직접 수정·되돌리기 제공. ‘한국어 발음 보장’이나 ‘Typecast 발음 사전’ 문구를 쓰지 않음. |
| 내 클론 | 퀵/프리미엄 선택→음성 업로드→이름·성별·녹음 언어→약관 동의→생성. 본인에게만 표시, 실패 사유 확인. [클론](https://help.typecast.ai/ko/articles/15360329-클론-만들기) | Instant는 이름·모델·WAV/MP3 한 파일, ≤25MiB·5–150초. 완료 보이스 반환. Studio와 API 클론은 별도. [Instant](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone), [llms](https://typecast.ai/docs/llms.txt) | 간편 클론 P0 유지. 이름·음성 파일·원본 청취·권한 확인·생성·시험 생성 순서. 성별/아바타를 API 필수 입력처럼 요구하지 않음. |

## 기존 조사에서 달라지거나 더 명확해진 점

1. **문단 편집 근거 보강:** 기존 서비스 비교는 단락 추가와 감정을 중심으로 정리했다. 이번에는 문장·쉼 분할 구간 재생성, 3개 후보 비교·적용, 문단별 성우 변경·일괄 교체까지 새 에디터 공식 도움말로 확인했다. 이는 우리 제품의 즉시 구현 완료 주장이 아니다. [재생성](https://help.typecast.ai/ko/articles/15347503-음성-재생성), [캐릭터 변경](https://help.typecast.ai/ko/articles/15347233-캐릭터-변경)
2. **쉼 일괄 기능 추가 확인:** 조사 시 문서는 ‘1주 전에 업데이트함’으로 표시되었다. 정확한 게시일은 확정하지 않는다. 구간 선택과 삽입 위치 선택 흐름은 확인했지만 위치 옵션을 임의로 열거하지 않는다. [가이드](https://help.typecast.ai/ko/articles/16937869-쉼추가-일괄)
3. **감정 복원은 별도 보장 없음:** 새 에디터 FAQ는 이전 감정 설정으로 되돌리는 전용 기능이 없으며 제거 또는 수동 재입력을 안내한다. 우리 ‘이전 설정 복원’은 참고 서비스의 존재 기능으로 설명하지 않고 자체 개선안으로 기록한다. [FAQ](https://help.typecast.ai/ko/articles/15358160-감정이-적용된-음성을-미리-듣고-마음에-들지-않을-때-이전-설정으로-되돌리는-방법이-있나요)
4. **한국어 필터의 근거 한계:** 기존 비교의 ‘한국어 중심 탐색’은 제품 의도다. Typecast 목록의 지역화 이름 키 `kor`는 언어 지원 보증이 아니며, 보이스 상세에 지원 언어/억양 필드도 없다. 한국어 요청 언어 설정과 성우 검증 배지를 구별하고 실제 청취로 확인되지 않은 후보에 ‘한국어 검증 완료’를 붙이지 않는다. [llms](https://typecast.ai/docs/llms.txt)
5. **기존 API 조사의 충돌 유지:** 목록 설명에는 `ssfm-v31`이 있지만 생성 enum은 v30/v21이다. llms의 옛 클론 경로보다 변경 이력과 새 custom-voices 참조를 우선한다. 추천 문서의 v2 상세 조회 잔재도 최신 v3 조회로 해석하되 잔재가 있음을 기록한다. [목록](https://typecast.ai/docs/api-reference/voices/list-voices), [추천](https://typecast.ai/docs/api-reference/voices/recommend-voices), [변경 이력](https://typecast.ai/docs/changelog)

## UI에 넘길 구체 제안

아래는 공식 기능을 근거로 한 설계 제안이며 최종 화면 구조·구현 판단은 코디네이터가 담당한다.

| 화면 영역 | 구체 요소 | 필요한 상태·주의점 |
|---|---|---|
| 성우 선택 | 현재 성우 요약, 이름 검색, 기본/내 클론 구분, 용도·성별·연령 필터, 샘플 듣기, 선택 | 샘플 URL 없음은 ‘샘플 없음’. ‘시험 생성’은 별도 버튼. 즐겨찾기는 자체 앱 기능으로 표기. 추천은 명시적으로 요청할 때만 수행. |
| 대본 | 원문/읽는 글, 글자 수, 저장 상태, 설정 적용 범위 | Typecast 단일 요청은 실제 전송 글 기준 2,000자. 원문을 짧게 보이게 해도 읽는 글이 길면 차단. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) |
| 표현 조절 | 기본/자동 감정/직접 선택, 직접 선택의 감정·강도, 속도, 접힌 피치 | 모드 전환 시 숨겨진 다른 모드 필드를 요청에 섞지 않음. 감정 강도를 %로 보여 준다면 100%=API 1의 앱 매핑임을 명확히 함. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) |
| 생성·결과 | 생성 버튼, 기존 결과 플레이어, ‘현재 설정과 다름’ 표시, 다시 생성, 다운로드 | Studio 감정 선택 즉시 생성 동작을 그대로 가져오지 않음. API 생성은 글 길이로 크레딧 소비하므로 설정 변경과 실제 호출을 분리. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) |
| 쉼 | 읽는 글 안의 편집 가능한 쉼 칩, 제거, 개수/합계 | 후속 Compose 적용 시 텍스트 총 2,000자·전체 50구간·쉼 합계 60초 제한을 한곳에 표시. 50구간에는 tts와 pause 모두 포함. [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech) |
| 내 클론 | 파일 원본 재생, 이름, 파일 검증, 생성 상태, 시험 생성, 사용 | 성공 시 완료 응답 확인. 슬롯 부족·형식 오류·지원하지 않는 모델·서버 혼잡을 구분. Studio 요금제 이름이나 슬롯 수를 API 계정에 하드코딩하지 않음. [Instant](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone) |

추천 문구 예시: `원하는 목소리를 설명해 주세요` / `샘플 듣기` / `이 성우 선택` / `대본 전체에 적용` / `직접 고른 감정` / `새 음성 생성` / `설정이 바뀌었습니다. 기존 음성은 이전 설정으로 생성되었습니다.` 이들은 우리 제품용 문구 예시이며 Typecast 화면의 인용이 아니다.

## 후속 기능과 도입 조건

- **설명 기반 추천:** API 확인 완료. 연결된 목록·상세·샘플 흐름이 준비되면 추가. 동일 검색창에 이름 검색과 추천을 섞지 않는다. 후보가 요청 개수보다 적을 수 있다. [추천](https://typecast.ai/docs/api-reference/voices/recommend-voices)
- **문단별 다중 성우·쉼 편집:** Compose가 기능 근거다. 다만 합계 2,000자 제한 때문에 장편 프로젝트 편집 전체를 해결하지 않는다. 일부 실패 시 전체 요청 실패·무과금이라는 Compose 계약도 상태 설계에 반영한다. [Compose](https://typecast.ai/docs/api-reference/text-to-speech/compose-text-to-speech)
- **부분 재생성·후보 비교:** Studio의 비교 방식은 참고할 만하다. 앱에서 구간·설정·오디오 스냅샷을 연결하고 선택 전 기존 결과를 보존하는 흐름이 필요하다. 사용자 요청 없이 후보 3개를 자동 생성하지 않는다. [재생성 가이드](https://help.typecast.ai/ko/articles/15347503-음성-재생성)
- **숫자·발음 전처리 자동화:** AutoTag는 한국어/영어 전체 패턴을 문서화했다. 도입 여부와 한국어 결과 검증은 별도 작업. 원문 보존 및 변환 확인 화면이 선행되어야 한다. [AutoTag](https://typecast.ai/docs/bestpractice/autotag)
- **전문 클론:** Instant와 분리된 비동기 작업. pending/training/completed/failed 상태를 다뤄야 하며, 1개 WAV/MP3·≤1GiB·5분–3시간·≥16kHz를 안내한다. 간편 클론 P0의 우선순위는 낮추지 않는다. [Professional](https://typecast.ai/docs/api-reference/custom-voices/create-professional-clone), [커스텀 목록](https://typecast.ai/docs/api-reference/custom-voices/list-custom-voices)

## 버전과 확인 한계

- 공개 API 참조에서 OpenAPI 3.1.0 / 문서 info.version 0.1.2를 확인했다. 조회 시점 문서 버전이며 서버 배포 버전을 뜻하지 않는다. 모델은 기존 조사와 동일하게 v30/v21 생성 계약을 기준으로 삼는다. [TTS](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)
- Studio 근거는 새 에디터 컬렉션의 2026-06~07월 문서와 조회 당시 1주 전 갱신 쉼 일괄 문서다. 클래식/모바일 설명을 섞지 않았다. [새 에디터](https://help.typecast.ai/ko/collections/19654179-typecast-studio)
- Studio 현재 계정의 검색·즐겨찾기·피치 UI, 음성 품질, 오류 복구, 접근성, 모바일 배치는 미확인이다. ‘미확인’은 기능 부재 판정이 아니다.
- 공개 API의 SSML·발음 사전은 llms가 미지원을 명시한다. 반면 Studio 발음 사전은 조사에서 찾지 못한 항목이므로 두 증거 수준을 구분한다. [llms](https://typecast.ai/docs/llms.txt)
- Typecast 웹 구독과 API 구독, 클론 보관함은 별도다. Studio의 다운로드 시 과금이나 생성·청취 경험을 API 비용 정책으로 가져오지 않는다. [llms](https://typecast.ai/docs/llms.txt)

**설계 인계 요약:** 성우와 적용 범위를 대본 가까이, 감정·속도는 선택 설정으로, 재생과 새 생성은 별도 행동으로 둔다. 문단별 비교·쉼 일괄·설명 추천은 확인된 후속 후보이고, 한국어 검증·발음 사전·Studio/API 공유를 근거 없이 약속하지 않는다.
