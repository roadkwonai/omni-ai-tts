# ElevenLabs 제작 UX 재조사

## 조사 유형·날짜·확인 범위

- 유형: 현재 공식 제품 가이드와 공개 API의 구현 참조 조사.
- 확인일: **2026-09-26, Asia/Seoul**. 웹 문서는 고정 릴리스가 아니며, Studio는 현재 본문이 명시하는 **ElevenCreative Studio 4.0** 기준이다. HTTP `/v1`과 모델 `eleven_v3`는 다른 버전 축이다.
- 요청된 [TTS API 소개](https://elevenlabs.io/text-to-speech-api)와 [API Introduction](https://elevenlabs.io/docs/api-reference/introduction)에서 시작해 아래 공식 가이드를 확인했다. 마케팅 페이지보다 제품 가이드와 해당 endpoint 계약을 우선한다.
- 공개 문서 본문만 확인했다. 로그인, 계정 생성, 오디오 업로드, 녹음, 유료 API 호출, 청취·생성, 현재 로그인 화면 직접 조작은 하지 않았다. 문서에 있는 동작을 실제 사용으로 검증했다는 뜻이 아니다.
- 기존 [API 옵션 조사](./elevenlabs-api-options.md), [서비스 비교](./tts-service-comparison.md)를 참고했다. 이 문서는 옵션 목록의 복제가 아니라 작업 흐름과 UI 반영 근거의 보충이다. 용어는 [GLOSSARY.md](../../GLOSSARY.md)를 따른다.

## 직접 답변

**성우 선택 → 모델·표현 설정 → 생성 → 결과 비교·재사용**이 작업실에 전달할 핵심 흐름이다. 선택한 문단의 설정과 생성 기록을 가까이 두고, TTS·목소리 찾기·보이스 체인저·클론을 각각 다른 작업으로 구분할 근거가 있다. 아래 ‘우리 UI 매핑’은 설계 담당자에게 넘기는 제안이며 구현 완료나 최종 우선순위를 뜻하지 않는다.

## 공식 문서 근거와 핵심 UX

| 영역·공식 URL | 문서로 확인한 작업 흐름 | 우리 UI 매핑 제안 |
| --- | --- | --- |
| [TTS 제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech) | 텍스트 입력 → 성우 선택 → 선택적 설정 → 생성. 가이드는 결과 영향이 성우, 모델, 세부 설정 순이라고 설명 | 성우와 모델을 먼저 고르게 하고 전문 설정은 뒤에 배치. 기본 샘플과 사용자 대본 시험 생성을 별도 행동으로 표시 |
| [Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library) | Voices → Explore. 이름·키워드·ID 또는 오디오로 검색. 언어 선택 후 억양 필터, 용도·성별·연령·품질 등으로 좁힘. 라이브러리 성우를 직접 사용하거나 선택적으로 보관 가능 | 성우 카탈로그에서 검색·공급자 분류·기본 샘플·선택을 연결. 개인 카테고리·타입은 별도 영역으로 표시 |
| [Studio](https://elevenlabs.io/docs/eleven-creative/products/studio) | 4.0은 프롬프트/업로드/빈 프로젝트로 시작. 오디오 프로젝트는 선택 문단에 설정·생성 기록을 제공하며 이전 생성 복원이 가능. Override로 선택 문단과 프로젝트의 성우 설정 범위를 구분 | 문단 제작 계획에서 현재 선택과 적용 범위를 표시. 생성 기록은 문단별 결과와 연결하고 수정 이후 이전 결과임을 표시 |
| [Voice Changer](https://elevenlabs.io/docs/eleven-creative/playground/voice-changer) | 파일 또는 마이크 녹음 → 원본 재생 → 대상 성우·설정 → 생성 → 결과 다운로드/이력. 원본의 전달·리듬·억양을 유지하는 변환 | 원본 준비와 변환 실행을 분리. 원본과 변환 결과 플레이어를 나란히 식별하고 목표 성우 선택으로 복귀 가능하게 구성 |
| [Instant Voice Cloning](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning) | 음질과 일관성을 중시하며 깨끗한 1~2분 녹음을 권장. 클론은 계정에 남고 독립 모델 파일로 내보낼 수 없음 | 본인 녹음 준비 → 원본 확인 → 이름·권한 확인 → 생성 → 상태 → 시험 생성 → 내 보이스에서 재사용. 권장 길이를 강제 API 한도로 표시하지 않음 |
| [Professional Voice Cloning](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/professional-voice-cloning) | 더 긴 학습 음성과 본인 검증·훈련 흐름. 검증 실패·재시도 및 검증 전 삭제 제한도 안내 | IVC의 즉시 생성 흐름에 합치지 않고 별도 상태를 갖는 작업으로 검토. 이번 UI에서 제공 범위가 확정되지 않았다면 지원 여부를 먼저 표시 |

ElevenLabs의 **My Voices는 라이브러리에서 보관한 성우도 포함**한다. 우리 용어 ‘내 보이스’는 본인 클론 모음이므로 명칭을 그대로 복제하면 의미가 달라진다. 공개 성우는 제공 중단될 수 있으며 notice period가 없으면 즉시 접근이 사라질 수 있다. 우리 UI에는 성우 교체 경로와 기존 생성 기록 식별이 필요하다. [Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library)

## Audio tags·Voice settings의 모델별 경계

| 구분 | 공식 근거 | UI에 전달할 의미 |
| --- | --- | --- |
| v3 표현 | `[whispers]`, `[laughs]`, `[excited]` 등 audio tag로 전달 방식을 지시. 효과는 성우와 학습 음성에 좌우됨 | 감정 enum 대신 텍스트에 삽입하는 연출 태그임을 표시. 태그 적용 위치와 제거·원문 복귀 제공 |
| v3 안정성 | Creative / Natural / Robust. Creative는 표현 폭과 불안정성, Robust는 일관성과 지시 반응의 절충 | 명칭과 설명을 함께 제공. 숫자 대응을 공식 enum이라고 단정하지 않음 |
| 모델 전환 | TTS 제품 가이드는 v3의 Speed·Similarity·Speaker Boost 미제공을 명시 | 모델을 바꿀 때 이전 설정을 유효한 것처럼 남겨 보내지 않도록 설계. API 필드 존재와 모델별 효과를 구분 |
| 일반 음성 설정 | 낮은 Stability는 변동 증가, 높은 Similarity는 원본 잡음까지 재현할 가능성. Style exaggeration은 지연·불안정성이 늘 수 있음 | ‘좋음/나쁨’ 척도 대신 효과 설명. 조절값을 감정 정확도 점수로 표시하지 않음 |

출처: [v3 prompting·audio tags](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3), [TTS Voice settings](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech#voice-settings).

감정 자동화의 결과를 태그 후보로 보여 주고 사용자가 문단별로 검수한 뒤 적용하는 흐름은 **우리 앱의 제안 기능**이다. TTS convert가 대본 전체를 분석해 문단 제작 계획을 반환한다는 근거는 아니다. 자연어 태그는 결과를 강제하는 결정적 제어도 아니다. [Best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)

## 서비스 화면 기능과 공개 API 제약

| 작업 | 공개 API로 확인한 경계 | 설계 시 제약 |
| --- | --- | --- |
| TTS 생성 | `POST /v1/text-to-speech/{voice_id}`. `text`, `model_id`, 요청별 `voice_settings`, 발음 사전 locator, 출력 형식 등 | 단일 요청의 성우 선택과 설정이며 타임라인·프로젝트 상태를 자동 제공하지 않음. [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |
| 저장 설정 | 별도 조회 API가 저장된 성우 설정을 제공. convert의 설정은 해당 요청만 덮어씀 | ‘이번 생성 설정’과 ‘저장 프리셋/기본값’을 구분. [Get voice settings](https://elevenlabs.io/docs/api-reference/voices/settings/get), [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |
| 공개 성우 탐색 | `GET /v1/shared-voices`에 언어·성별·연령·억양·`use_cases`·`descriptives`·검색·정렬 등이 존재 | 공급자 `category`는 예시에서 `professional` 같은 유형이다. 화면의 용도 Category를 앱 개인 카테고리나 API `category`에 무조건 직결하지 않음. [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared) |
| 목소리 찾기 | `POST /v1/similar-voices`는 참고 오디오와 유사한 공개 성우 목록 반환. threshold 0~2는 작을수록 유사 | 결과는 후보 목록. 특정 인물 확인이나 ‘97% 일치’ 점수로 바꾸지 않음. [List similar voices](https://elevenlabs.io/docs/api-reference/voices/find-similar-voices) |
| 보이스 체인저 | multipart `audio` + 대상 `voice_id`, 별도 변환 모델. `voice_settings`는 JSON 문자열. `remove_background_noise` 제공 | TTS 모델 목록을 재사용하지 말고 `can_do_voice_conversion` 확인. 기본 모델은 영어 전용이므로 한국어에서 기본값 의존 금지. [Voice changer API](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert) |
| 클론 생성 | `POST /v1/voices/add`, `name`·`files` 필수. 응답 `voice_id`와 `requires_verification` | ID만 받았다고 ‘사용 가능’ 처리하지 않음. 검증 필요 상태를 분리. 잡음 제거는 깨끗한 원본 품질을 오히려 낮출 수 있어 자동 강제하지 않음. [Create IVC voice](https://elevenlabs.io/docs/api-reference/voices/ivc/create) |
| Studio Agent | Studio 4.0의 Plan/Create, 자동 타임라인 편집은 **웹 앱 전용, API 미제공** | 공식 서비스의 자동 추천·편집 시연을 우리 API 통합 완료처럼 표현하지 않음. [Studio Agent](https://elevenlabs.io/docs/eleven-creative/products/studio#studio-agent) |
| 문단·이력·재생 | Studio는 이전 생성 복원, 미생성 문단의 Play 중 생성, 조건부 무료 재생성을 안내 | 우리 ‘재생’은 기존 오디오 청취로 분리하는 안. 새 생성은 별도 실행으로 보이며 웹 무료 정책을 API에 약속하지 않음. [Studio](https://elevenlabs.io/docs/eleven-creative/products/studio), [TTS FAQ](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech#faq) |
| 볼륨·트랙·자막 | Studio에 타임라인·음악/SFX·자막 기능이 있어도 일반 TTS convert 계약과 다름 | 해당 기능은 별도 생성/편집/합성 범위. `output_format`을 비디오·자막 출력 옵션으로 표현하지 않음. [Studio](https://elevenlabs.io/docs/eleven-creative/products/studio), [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |

공개 라이브러리 가이드는 무료 계정의 라이브러리 성우 API 이용 불가를 명시한다. API 예시의 `free_users_allowed` 하나만 보고 API 이용 권한을 확정하지 않는다. 실제 계정의 합성 권한 확인은 별도다. [Voice Library](https://elevenlabs.io/docs/eleven-creative/voices/voice-library), [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared)

## 현재 미확인·충돌과 검증 인계

1. **실제 화면:** 로그인 화면의 현재 배치, 반응형, 키보드 조작, 오류 복구를 확인하지 않았다. 기존 비교 문서의 공식 이미지 관찰을 이번 실사용 검증으로 재분류하지 않는다.
2. **v3 한도:** [마케팅 소개](https://elevenlabs.io/text-to-speech-api)는 3,000자, [TTS 제품 가이드](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)는 5,000자를 표기한다. 구현할 endpoint의 현재 한도는 계정/모델 검증 후 확정해야 한다.
3. **v3 릴리스 상태:** [Best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)에 research preview 문구가 남아 있다. 이를 현재 릴리스 상태의 단독 근거로 쓰지 않는다.
4. **옵션 범위:** 속도 범위 등 기존 API 조사에 기록된 공식 자료 간 충돌은 이번 제품 흐름 조사로 해소되지 않았다. 모델별 실제 적용 여부·한국어 품질·태그 효과도 실측하지 않았다.
5. **입력 제한:** 체인저 제품 가이드는 50 MB 미만·5분 이하를 안내하지만 API 계약의 별도 제한 확인 없이 모든 경로의 확정 한도라고 확대하지 않는다. [Voice Changer 가이드](https://elevenlabs.io/docs/eleven-creative/playground/voice-changer)
6. **계정 상태:** 라이브러리 접근권한, 샘플 URL 수명, 출력 형식 권한, IVC 검증 후속 절차, PVC 훈련·삭제 상태를 현재 계정에서 확인하지 않았다. 실제 구현 검증은 키 연결 이후 별도 작업이다.

## 재사용 가능한 결론

설계 담당자는 **선택 대상·설정 적용 범위·현재 입력과 생성 결과의 차이**를 화면에 드러내면 된다. 성우 탐색에서 작업실로 복귀하고, 문단 계획을 검수한 뒤 생성하고, 기록에서 이전 결과를 비교·복원하는 흐름을 연결한다. 라이브러리 검색, 유사 음성 검색, 음성 변환, 클론 생성은 각각 공개 API가 다르며, Studio Agent·무료 재생성·타임라인 기능은 동일한 지원 계약으로 간주하지 않는다.

공식 문서만으로 이번 범위의 근거가 확보되어 upstream 소스·OSS·제삼자 자료는 사용하지 않았다. 앱 코드 변경과 런타임 검증은 이번 연구 산출물의 범위 밖이다.
