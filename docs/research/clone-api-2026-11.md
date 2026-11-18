# T13 내 목소리(인스턴트 클론) 공급자 조사

조사일 2026-11-18. 공식 문서는 WebFetch로 직접 읽었고, 계정 확인은 무료 읽기 GET만 불렀다(키·응답 전문 기록 없음). 생성·클론·삭제·TTS 호출은 하지 않았다.

## 비교표

| 항목 | Typecast | ElevenLabs | Fish Audio | Gemini | Airy |
|---|---|---|---|---|---|
| 생성 | `POST /v1/custom-voices/instant-clone` multipart | `POST /v1/voices/add` multipart | `POST /model` multipart | `POST /v1beta/voices` JSON(base64) | **클론 API 없음** |
| 필수 필드 | `file`, `name`(1~30자), `model` | `name`, `files` | `type=tts`, `title`, `train_mode=fast`, `voices` | `voice.type=replicated`, `source_audio`, `consent_audio`(각 `mime_type`+`data`) | - |
| 허용 형식 | **WAV, MP3만** | 문서에 형식 목록 없음(MP3 권장) | wav, mp3, m4a, opus | 문서 예시 `audio/wav`, `audio/mpeg`. 24kHz 모노 16비트 WAV 권장 | - |
| webm/opus, mp4/aac(MediaRecorder) | 문서상 불가(WAV·MP3만) | **문서에 정보 없음** | webm·mp4 목록에 없음. `.opus`는 있으나 Ogg Opus 가정(webm 컨테이너는 정보 없음) | 정보 없음(wav·mpeg만 예시) | - |
| 길이 | 5~150초 | 앱 기준 합계 10초 이상, 파일당 5초 이상, 권장 1~2분, 3분 초과 비권장 | 클립당 10초 이상, 권장 1~2분 | 참조 10~30초, 동의 녹음 길이 정보 없음 | - |
| 크기·개수 | 25 MiB, 정확히 1개 | 크기 정보 없음, 개수 제한 없음 | 크기 정보 없음, 1~20개 | 크기 정보 없음, 2개(참조+동의) | - |
| 대본 | 불필요 | 불필요 | `texts` 선택(없으면 ASR) | 동의 문장 낭독 필수 | - |
| 동기/비동기 | 동기. 201에 `completed` 즉시 | 동기. `voice_id` 즉시, 단 `requires_verification` 확인 | 동기에 가까움. 201 응답의 `state`(created/training/trained/failed), fast는 대개 trained | 동기(문서는 명시하지 않음, 요청-응답 예시). status 필드 없음 | - |
| 상태 조회 | `GET /v1/custom-voices/{id}` | `GET /v1/voices/{id}` | `GET /model/{id}` | `GET /v1beta/voices/{id}` | - |
| 삭제 | `DELETE /v1/custom-voices/{id}` 204, soft delete, 슬롯 해제 | `DELETE /v1/voices/{id}` 200 `{"status":"ok"}` | `DELETE /model/{id}` 200, 본문 스키마 없음 | `DELETE /v1beta/voices/{id}`, 즉시 삭제 | - |
| 플랜 제한 | 무료 플랜 슬롯 0. Lite 50, Plus 800 | **이 계정 IVC 불가**(아래) | 문서에 제한 없음. 이 계정은 free | 유료 Tier 1 이상 프로젝트 필요 | 엔터프라이즈 전용 사전 등록 성우만 |
| 클론 생성 요금 | 별도 단가 없음(플랜 슬롯에 포함) | 정보 없음 | 정보 없음 | 정보 없음 | - |
| 공개 범위 | 소유 계정만 합성(`uc_`) | 계정 내 `category=cloned` | `visibility` 기본 private, 생성 때 public은 private으로 낮춤 | `store=true` 프로젝트 저장, `false`는 키 반환 | - |
| 합성 모델 | ssfm-v31, v30, v21(생성 때 고름) | Flash v2.5·Multilingual v2 기준 언어(IVC 모델 목록은 정보 없음) | s1, s2-pro 등(클론 모델 제한은 정보 없음) | gemini-3.8-flash-tts, gemini-3.8-flash-lite-tts만 | - |
| 한국어 | 정보 없음(클론 페이지) | Flash v2.5·Multilingual v2 지원 언어면 가능 | 정보 없음(문서에 언급 없음) | 동의 문장 ko-KR 있음 | - |

## 계정 능력 확인(무료 읽기 GET, 2026-11-18)

- Typecast `GET /v1/users/me/subscription`: plan `free`, `limits.custom_voice_slot` 0, `professional_voice_slot` 0, 동시 2. `GET /v1/custom-voices`는 200에 0건. **무료 플랜이라 지금 계정으로는 클론 생성 불가(슬롯 0). Lite 이상 API 플랜 필요(추정: 슬롯 0이면 거절).**
- ElevenLabs `GET /v1/user/subscription`: tier `payg`, `can_use_instant_voice_cloning` **false**, `voice_limit` 3, `voice_slots_used` 1, 글자 한도 10000. **현재 키로는 IVC 불가. 요금제 업그레이드 필요.**
- Fish Audio `GET /wallet/self/package`: type `free`. `GET /model` 내 모델 0건. API 클론이 무료 플랜에서 막히는지는 문서에 없음(정보 없음). 생성해 봐야 알 수 있다.
- Gemini: 읽기 전용으로 Tier를 알 수 있는 호출이 없어 확인하지 않음.
- Airy: 클론 API 없음.

## 공급자별 상세

### Typecast
- 출처: https://typecast.ai/docs/api-reference/custom-voices/create-instant-clone , get/delete 페이지, https://typecast.ai/docs/llms.txt , https://typecast.ai/pricing/api/ (2026-11-18)
- 요청: multipart `file`(WAV 또는 MP3 1개, 25 MiB 이하, 5~150초), `name`, `model`. 헤더 `X-API-KEY`. 응답 201 `{name, model, status, voice_id(uc_...)}`, 예시 status `completed`. 슬롯 1개 소비.
- 상태 값: pending, training, completed, failed. 상세 응답에 `source`(instant/professional), `error`, `created_at`.
- 삭제: 204, soft delete, 슬롯 해제. 옛 `/v1/voices/clone`, `DELETE /v1/voices/{id}`는 deprecated.
- 플랜(구독 문서): plan 값 free/lite/plus/custom, `limits.custom_voice_slot`(인스턴트 클론 보유 수). API 요금: Lite $15/월 50슬롯(인스턴트·프로 공유), Plus $280/월 800슬롯, Free는 클론 언급 없음. 웹 Basic/Pro/Business는 API 권한 없음. API 클론과 웹 에디터 클론은 별개.
- SDK 0.4.15 (`packages/api/node_modules/@neosapience/typecast-js/lib/index.d.ts`): `cloneVoice({audio, name, model})`(audio는 string 경로·Uint8Array·Buffer·Blob·File), `getCustomVoices()`, `getCustomVoice(id)`, `deleteVoice(id)`, `getMySubscription()`. TTSModel 타입은 `'ssfm-v21' | 'ssfm-v30'`이라 v31은 타입에 없다.
- 합성 때 `uc_` voice_id 사용, 완료된 것만.
- 모르는 것: 한국어 클론 품질·지원, 웹 녹음 형식 변환 필요 여부는 WAV/MP3로 변환해야 한다는 뜻.

### ElevenLabs
- 출처: https://elevenlabs.io/docs/api-reference/voices/ivc/create , https://elevenlabs.io/docs/api-reference/voices/delete , IVC 안내(creative-platform) 문서 (2026-11-18)
- 요청: multipart `name`, `files`(필수, 여러 개), 선택 `remove_background_noise`, `description`, `labels`. 응답 200 `{voice_id, requires_verification, library_voice_match?}`.
- `requires_verification`: 샘플이 보호된 라이브러리 성우와 일치하면 true이고 `library_voice_match`가 채워진다. 이때 인증 전에는 사용 불가, 대안은 라이브러리 성우 추가. 문서에 상태 폴링 필드는 없고 voice 상세로 확인한다.
- 형식: API 문서는 형식·크기를 적지 않는다. 가이드는 "다양한 형식을 받는다", MP3 128~192kbps 이상 권장, WAV는 이점 없고 업로드 문제 가능. webm/mp4/m4a/ogg 수용 여부는 **정보 없음**.
- 길이: 앱 최소 10초 합계(파일당 5초 이상), 권장 1~2분.
- 삭제: `DELETE /v1/voices/{id}` 200 `{"status":"ok"}`, 실패는 500. 동기.
- SDK 2.70.0: `voices.ivc.create`(요청 타입 `BodyAddVoiceV1VoicesAddPost`), `voices.delete(voice_id)`.
- 플랜: API 문서는 제한을 적지 않으나 **이 계정은 `can_use_instant_voice_cloning=false`**(payg, 슬롯 3개 중 1개 사용). 생성 요금 정보 없음.
- 모델·언어: Flash v2.5와 Multilingual v2가 지원하는 언어로 클론 가능(한국어 포함, 문서는 "지원 언어 목록 링크"만). v3·v4와 클론 호환은 정보 없음.
- 음성 캡차 단계: 대시보드 흐름에 본인 확인(voice captcha)이 있고 API 문서에는 언급 없음.

### Fish Audio
- 출처: https://docs.fish.audio/api-reference/endpoint/model/create-model.md , get-model.md , delete-model.md , 생성 가이드 (2026-11-18)
- 요청: multipart 필수 `type=tts`, `title`, `train_mode=fast`, `voices`(1~20개). 선택 `visibility`(기본 private, public은 private으로 낮춰짐), `texts`(최대 20, 없으면 ASR), `enhance_audio_quality`(기본 true), `description`, `tags`, `cover_image`, `generate_sample`.
- 형식: .wav, .mp3, .m4a, .opus. 클립당 10초 이상, 권장 1~2분. 크기 상한 정보 없음.
- 응답 201 모델 객체: `_id`, `state`(created/training/trained/failed), `visibility`, `languages`, `quality`(오디오별 `quality_passed`, `quality_reason`). fast는 "거의 즉시 사용", 대부분 trained로 반환. 상태 확인 `GET /model/{id}`(403, 404).
- 삭제: `DELETE /model/{id}` 200, 응답 스키마 없음, 401 소유자 아님, 503. 동기.
- 계정 목록에는 내 모델이 나온다(내 모델 0건).
- 요금: 클론 단가 정보 없음. 한국어 지원 언급 없음. 플랜 제한 문구 없음.

### Gemini
- 출처: https://ai.google.dev/gemini-api/docs/voice-replication (aistudio.google.com/docs/voice-replication으로 301), https://ai.google.dev/api/voices (aistudio.google.com/api-reference/voices로 301) (2026-11-18)
- 요청: `{store, voice:{model, type:"replicated", display_name, replicated:{source_audio:{mime_type,data}, consent_audio:{...}}}}`. 모델 gemini-3.8-flash-tts, gemini-3.8-flash-lite-tts.
- 조건: 같은 성인 화자의 실제 사람 녹음(합성 음성, SynthID·C2PA 워터마크 오디오는 거절). 참조 10~30초, 24kHz 모노 16비트 WAV 권장. 동의 문장을 정확히 낭독: ko-KR "나는 이 음성의 소유자이며 구글이 이 음성을 사용하여 음성 합성 모델을 생성할 것을 허용합니다." 30개 로케일.
- 응답: stateful `replicated_voice.id`(`voice_...`, 프로젝트당 200개, 마지막 사용 후 1년), stateless `key`(`voicekey_...`, 7일, `expire_time`). Voice 리소스에 state·status 필드 없음.
- 삭제: 즉시, 프로필과 조건화 데이터 제거. get/list(`type=replicated`)도 있음.
- 접근: 유료 Tier 1 이상 프로젝트, 별도 허용 목록 없음, 지원 리전 전체(EEA·영국·스위스 포함). 합성 출력에는 SynthID 워터마크.
- 요금: 생성 정보 없음. 화자 불일치 오류 코드 정보 없음. 파일 크기 상한·동의 녹음 길이 정보 없음.

### Airy
- 출처: https://airy.so/cloud-api/docs/ 문서 앱 번들(index-BAwb7c8Q.js)의 엔드포인트 문자열(2026-11-18).
- `/v1/audio/speech`, `/v1/audio/speech/stream`, `/v1/voices`, `/v1/models`, `/v1/credits/balance` 외 클론·업로드 엔드포인트 없음. 콘솔 문구에 "이 엔터프라이즈 계정에서 쓸 수 있는 커스텀 성우"가 있어 커스텀 성우는 콘솔의 엔터프라이즈 기능이며 API 생성이 아니다.
- 결론: Airy는 내 목소리 대상에서 제외한다.

## research 문서와 다른 점

1. Typecast 모델 enum: research는 v21/v30만, 현재 문서는 `ssfm-v31`, `ssfm-v30`, `ssfm-v21`. SDK 0.4.15는 v21/v30만 알고 있다.
2. Typecast 삭제: research는 "삭제"만 적었는데 현재 응답은 204. SDK 0.4.15에 `deleteVoice`가 이미 있다.
3. Typecast 구독 응답: `professional_voice_slot`은 구독 문서 응답 필드에 없고(`professional_clone_generations`가 있음), 실제 응답에는 `limits.professional_voice_slot`이 내려온다(이 계정에서 확인). 문서-실제 불일치.
4. Typecast 플랜별 슬롯(Lite 50, Plus 800)은 research에 없던 정보.
5. Fish Audio: 응답에 `quality.audios[].quality_passed` 등 품질 검사 필드가 있어 클립 거절 판단에 쓸 수 있다는 점이 research에 없었다. 크기 상한은 여전히 정보 없음.
6. Gemini: 동의 문장 ko-KR 전문과 30 로케일, 합성 음성·워터마크 거절, 유료 Tier 1 요건이 research에 없었다. `store` 기본값은 안내 문서가 true(stateful 기본), 참조는 미기재라 명시적으로 `store:true`를 보낸다. 모델은 flash-tts와 flash-lite-tts 둘 다 가능.
7. ElevenLabs: `library_voice_match`와 `requires_verification` 상세, 대시보드 IVC 최소 10초(파일당 5초)가 research에 없었다.
8. Airy: "T13에서 다시 확인" 항목 해결 = 클론 API 없음.

## 정보 없음

- ElevenLabs: webm/mp4/ogg 수용 여부, 최대 파일 크기, 클론 가능 플랜 문서화, 생성 요금, v3 계열 모델과의 호환, voice captcha의 API 영향.
- Fish Audio: 파일 크기 상한, 한국어 클론 품질 명시, 클론 생성 요금, 무료 플랜의 API 클론 허용 여부.
- Gemini: 파일 크기, 동의 녹음 길이, 생성 요금, 화자 불일치 오류 코드, 동기 여부 명시, `store` 기본값 일치, webm/mp4 허용 여부, 이 계정의 Tier.
- Typecast: 한국어 클론 지원 명시, 오류 코드 의미(401, 403, 413, 422, 503 설명 없음), 무료 플랜에서 클론 호출 시 실제 오류 코드.
- 공통: MediaRecorder 형식(Chrome webm/opus, Safari mp4/aac)을 직접 받는다고 명시한 공급자는 없다.

## 설계에 중요한 결론

- 브라우저 녹음은 서버(또는 브라우저)에서 WAV(24kHz 모노 16비트)로 변환해 모든 공급자에 공통으로 보내는 것이 안전하다. Typecast는 WAV·MP3만, Gemini는 wav·mpeg만 확인됐다.
- 30초 WAV 24kHz 모노는 약 1.44MB로 Vercel 4.5MB 한도 안이다. 150초는 약 7.2MB라 Typecast 상한(25 MiB)에는 맞지만 4.5MB 한도는 넘는다. 짧게 제한하거나 MP3를 쓴다.
- 참조 길이는 공통 교집합 10~30초가 맞다(Gemini 상한 30초, Typecast 하한 5초, Fish 10초).
- Gemini만 동의 문장 낭독 녹음이 따로 필요하고 ko-KR 고정 문구를 화면에 보여야 한다.
- 지금 계정 상태로는 Typecast(free, 슬롯 0)와 ElevenLabs(IVC 불가)는 생성이 막힌다. 실제로 열려 있을 가능성은 Fish(free 플랜에서 시도 필요)와 Gemini(Tier 확인 필요)다.
