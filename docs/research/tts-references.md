# TTS 참고 조사와 확인 범위

조사일: 2026-09-26. 공개 웹·공식 문서·영상 화면을 읽기 전용으로 확인했다. 유료 API 호출이나 비밀 키 조회는 하지 않았다. 아래 관찰과 제품 제안을 구분하며 참고 서비스의 광고 문구를 이 제품의 성능 보장으로 옮기지 않는다.

**심층 조사 추가:** 아래 1·2절은 최초 조사 기록이다. 이후 사용자 요청으로 영상 구간을 다운로드하고 로컬 전사·장면 분석을 수행했다. 최신 근거는 [영상 구간 심층 분석](tts-video-detailed.md), [gowith153 가이드·화면 8개 검토](gowith-ux-review.md), [Typecast·Vrew·ElevenLabs 공식 서비스 비교](tts-service-comparison.md)를 따른다. 로그인 서비스의 실생성·유료 호출까지 검증한 것은 아니다.

## 1. 참고 제품

| 출처 | 실제 확인 범위 | 요구사항에 반영 |
|---|---|---|
| [gowith153 TTS](https://tts.gowith153.com/) | 공개 소개의 8개 기능 영역과 사용 가이드. 로그인 후 실제 편집 동작은 검증하지 않음 | 3단 작업실, 성우 탐색, 프로젝트/대본 재사용. 고급 기능은 후속 TODO |
| [Typecast](https://typecast.ai/kr/) | 공개 제품 소개: 성우 탐색, 감정 표현, 대본 기반 음성 제작 | 성우 중심 탐색과 지원되는 감정 설정. 웹 Studio 기능을 API 기능으로 간주하지 않음 |
| [Vrew](https://vrew.ai/ko/) | 공개 제품 소개: 텍스트를 통한 편집, AI 목소리, 자막과 영상 제작 | 텍스트 중심 작업 흐름. 자막·영상 편집은 후속 |

gowith153 공개 가이드의 후속 후보: 파일 가져오기(TXT/DOCX/SRT/CSV), 화자 감지/역할별 성우 배정, 문단 분할, 감정 자동화, 유사 목소리 찾기, 보이스 체인저, 대본 맞춤 성우 추천, 프로젝트 저장/복제, 무음 제거·파형 편집, 동기화 자막·오디오·ZIP 출력. 목소리 복제 중 **본인 음성의 간편 클론 생성·관리는 2026-09-26 사용자 요청으로 P0에 승격**했다. '600종', '0원 무제한', '100% 싱크', '10초 복제' 같은 수치·표현은 검증된 앱 요구사항으로 채택하지 않는다.

## 2. 지정 영상 관찰

- [영상: 2026-08-03 개발남노씨 오토워커2기(앵콜)](https://www.youtube.com/watch?v=Z4hi1VpZVsU&t=6962s)
- 요청 구간: 1:56:02~1:59:45.
- 접근: 실제 브라우저에서 해당 시점으로 이동해 화면 프레임 확인. YouTube 플레이어에 '자막 사용 불가' 표시. **발언의 전체 청취·자막 전사는 하지 않았고 아래는 화면 관찰만이다.**
- 캡처 도구가 시간 초과되어 브라우저의 현재 비디오 프레임을 캔버스로 읽어 확인했다. 영상 전체를 내려받지 않았다.

| 확인 시점 | 화면에서 확인한 내용 | 채택 범위 |
|---|---|---|
| 1:56:02 | 대본 편집 영역과 글자 수, 단계형 제작 UI | 대본 편집·글자 수 표시 |
| 1:56:35, 1:57:30 | '발음 검수', 연도·월·일·금액의 원문→한글 변환 강조, 클릭 수정 안내, '이대로 생성' | 원문 비교·사용자 검수·수정 후 생성 |
| 1:58:30 | 성우 카드의 별표·미리듣기, Eleven v3 선택, 자막 글자 수, 무음 압축, 생성 상태 | 성우 선택·즐겨찾기·미리듣기·생성 상태는 P0. 자막/무음은 후속 |
| 1:59:45 | 완료 상태, 오디오 플레이어, 자막과 현재 문장 표시, 싱크 재시도 | 플레이어는 P0. 동기화 자막/재정렬은 후속 |

화면에 표시된 입력 상한·진행률·무료 재시도 횟수는 해당 서비스의 정책이므로 이 앱으로 그대로 가져오지 않는다. 영상의 다른 단계인 스토리보드·이미지·영상 생성은 장기 후보이며 초기 TTS 범위 밖이다.

## 3. 공식 API 확인

Typecast는 사용자 지정 [llms.txt](https://typecast.ai/docs/llms.txt)를 먼저 읽고 연결 문서를 조사했다. ElevenLabs는 [TTS 소개](https://elevenlabs.io/text-to-speech-api)와 [API 소개](https://elevenlabs.io/docs/api-reference/introduction)를 출발점으로 확인했다.

| 항목 | Typecast | ElevenLabs |
|---|---|---|
| 성우 목록·샘플 | [GET /v3/voices](https://typecast.ai/docs/api-reference/voices/list-voices): 한국어/영어 이름, 모델·감정·성별·연령·용도, preview_url(없으면 null) | [GET /v2/voices](https://elevenlabs.io/docs/api-reference/voices/search): 사용 계정이 접근 가능한 성우, 검색·필터·페이지네이션·labels·preview_url |
| 생성 | [POST /v1/text-to-speech](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech): 1~2,000자, 바이너리 오디오 | [POST /v1/text-to-speech/{voice_id}](https://elevenlabs.io/docs/api-reference/text-to-speech/convert): 모델별 한도와 설정, 오디오 응답 |
| 한국어·모델 | [모델](https://typecast.ai/docs/models): v30/v21 한국어, 언어 값 kor | [모델](https://elevenlabs.io/docs/overview/models): Multilingual v2/Flash v2.5/v3 한국어. ko 강제 지정은 모델별 지원 확인 |
| 옵션 | 생성 문서의 모델별 감정, 속도, 피치 등. 볼륨과 목표 LUFS 동시 지정 불가 | 생성 문서의 voice_settings 등. v3 audio tags와 모델별 지원 차이 확인 필요 |
| 출력 | 생성 문서에 WAV·MP3 지원 | 기본 MP3. 고음질 MP3 및 WAV/PCM은 계정 플랜 제약 확인 필요 |
| 숫자 교정 | [AutoTag](https://typecast.ai/docs/bestpractice/autotag)는 한국어 숫자 전처리 후보. TTS API 자체의 SSML/발음 사전 지원과 구분 | 생성 API의 apply_text_normalization 및 pronunciation_dictionary_locators. 한국어 모든 발음 표기를 보장하는 기능으로 해석하지 않음 |
| 인증 | llms.txt의 X-API-KEY, 웹 Studio 구독과 API 구독 구분 | [인증](https://elevenlabs.io/docs/api-reference/authentication): xi-api-key, scope/credit quota/IP 제한 |
| 사용량 | [구독 조회](https://typecast.ai/docs/api-reference/subscription/get-subscription): 사용·총 크레딧·동시 요청 한도 | 계정·모델·성우별 실제 사용 조건을 연결 시 확인. 일률 금액 표시 금지 |
| 오류 | llms.txt의 인증·잔액·권한·검증·요청 제한 오류 | [오류 처리](https://elevenlabs.io/docs/eleven-api/resources/errors): rate_limit_exceeded와 concurrent_limit_exceeded 구분 |

## 4. 구현 전 재확인할 사항

1. Typecast 일부 성우 필터 문구에는 ssfm-v31이 있지만 모델 문서·TTS enum에는 v30/v21이 나타나는 충돌이 있다. v31 지원을 확정하지 않는다.
2. Eleven v3 입력 한도는 소개 페이지 3,000자와 모델 문서 5,000자가 충돌한다. 앱은 우선 공통 2,000자를 제안하되 공급자 계약은 별도로 검증한다.
3. 샘플 URL의 보존 기간·캐싱/재배포 범위는 미확인이다. 기본 샘플 재생과 자체 대본 생성의 과금 동작을 구분한다.
4. Typecast AutoTag 채택 여부는 아직 결정하지 않았다. 정확도·라이선스·실행 환경·추가 의존성을 검토한 뒤 선택한다.
5. 생성 API의 멱등성·응답 유실 시 무과금 재시도 보장은 이번 조사에서 확인하지 못했다.
6. 가격과 이용 권한은 [Typecast API 요금](https://typecast.ai/pricing/api/) 및 [ElevenLabs API 요금](https://elevenlabs.io/pricing/api)을 구현 시점에 확인한다. 특정 요금제나 상업 이용 가능 여부를 이 문서로 보장하지 않는다.
7. 한국어 발음 품질·실제 성우 접근성·출력 권한·속도/감정 옵션은 각 계정으로 실제 검증해야 한다. 목록 필드가 있다는 사실만으로 품질이나 이용 가능성을 보장하지 않는다.

## 5. 내 클론 보이스 추가 조사 (2026-09-26)

사용자 요청으로 REQ-13과 P0-21~24를 추가했다. 다음은 공개 문서 확인이며 실제 본인 음성 업로드·클론 생성은 수행하지 않았다.

| 항목 | Typecast | ElevenLabs |
|---|---|---|
| P0 간편 클론 | [Create Instant Clone](https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone): `POST /v1/custom-voices/instant-clone`, multipart file/name/model, 201 응답에 voice_id 및 completed 상태 | [Create IVC voice](https://elevenlabs.io/docs/api-reference/voices/ivc/create): `POST /v1/voices/add`, multipart name/files, 응답에 voice_id 및 requires_verification |
| 녹음 입력 | 같은 생성 문서 기준 WAV/MP3 1개, 25 MiB 이하, 5~150초. 구현 시 모델·계정 조건 재확인 | [녹음 가이드](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning)는 깨끗한 단일 화자 1~2분 권장. 강제 최소/최대 길이가 아님. IVC reference에서 전체 파일 형식·용량·개수 상한은 확인 못함 |
| 상태·검증 | [Get Custom Voice](https://typecast.ai/docs/api-reference/custom-voices/get-custom-voice): `GET /v1/custom-voices/{voice_id}`, pending/training/completed/failed. 별도 본인 검증 API는 이번 조사에서 미확인 | requires_verification=true이면 즉시 사용 가능으로 표시 금지. IVC 전용 검증 endpoint는 미확인; 실제 계정에서 완료 경로·완료 판단 근거 확인 필요. PVC 검증 API를 대신 쓰지 않음 |
| 삭제 | [Delete Custom Voice](https://typecast.ai/docs/api-reference/custom-voices/delete-custom-voice): `DELETE /v1/custom-voices/{voice_id}`, soft delete 및 슬롯 반환. 물리적 영구 파기라고 안내하지 않음 | [Delete voice](https://elevenlabs.io/docs/api-reference/voices/delete): `DELETE /v1/voices/{voice_id}`, 성공 status: ok. 원본 데이터 보존 정책과 구분 |
| 계정 조건 | [API 요금표](https://typecast.ai/pricing/api/)의 custom voice 슬롯·플랜 확인. Studio와 API 구독을 구분 | [My Voices 도움말](https://help.elevenlabs.io/hc/en-us/articles/13313587528849-What-is-My-Voices): IVC는 Starter 이상. 구현 시 계정 권한·슬롯 재확인 |
| 후속 전문 클론 | [Create Professional Clone](https://typecast.ai/docs/api-reference/custom-voices/create-professional-clone): 장시간 자료로 202 training 반환 후 상태 조회. P3-04 대상 | [Professional Voice Cloning](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning): 자료 업로드·본인 검증·학습 흐름. P3-04 대상 |

Typecast `llms.txt` 본문의 구 경로 `/v1/voices/clone`과 새 custom-voices 문서가 혼재한다. 구현 전 실제 계정에서 사용할 문서 버전을 확정하고 새 경로/구 경로를 섞지 않는다. ElevenLabs 업로드 한도와 IVC 검증 경로는 구현 전 확인 항목으로 남긴다. 해당 조건을 확인하지 못하면 공급자별 제한 안내와 미검증 상태를 보고하고 REQ-13 전체 완료를 선언하지 않는다.

제품 설계 결정: 원본 녹음과 합성 샘플은 다른 재생 항목이다. 개인 클론의 조회·합성·삭제는 앱 소유권과 공급자 계정 양쪽을 검증한다. 생성물 다운로드 정책과 학습용 녹음 보관/삭제 정책을 구분한다.
