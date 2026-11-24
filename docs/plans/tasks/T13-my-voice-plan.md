# T13 내 보이스(클론) — 구현 계획

- 작성: 2026-11-18. 상태: **사용자 확인(2026-11-18, "확인, 구현으로")**. 스펙: [T13 스펙](T13-my-voice.md)(사용자 확인 2026-11-18 "확인, 계획으로"). 브리프: [내 보이스](../../briefs/my-voices.md). ADR: [0011](../../adr/0011-clone-source-in-memory.md). 조사: [클론 조사](../../research/clone-api-2026-11.md).
- 두뇌: agent-skills(planning-and-task-breakdown). 간결성: ponytail. 계층: DB(E) + API(D) + 화면(B) → F. 공급자 모듈(`providers/`)을 바꾸므로 security 리뷰(34행).
- 소유자: 로컬 관리자 모드(T14 전). 모든 프로시저는 `protectedProcedure`, 소유자는 `context.ownerId`만.
- 유료·상태 변경 호출(클론 만들기·지우기·시험 생성)은 자동 테스트·브라우저 QA에서 부르지 않는다. 실제 호출은 사용자 테스트(스펙 14절)에서 승인 뒤 한 번씩.

## 1. 개요

새 표 `my_voice`(소유 매핑)와 프로시저 5개, Fish Audio·Gemini 공급자 모듈의 클론 만들기·조회·지우기, 서버 WAV 검사, `/my-voices` 화면(목록·만들기 창·들어보기 창·지우기 확인), 브라우저 녹음·WAV 변환을 만든다. 기존 경로는 넷만 바꾼다: 합성 전 클론 상태 검사(시험 생성·작업실·드라마 공통, `trial.ts`), 보관함 확인(`savedVoiceCheck`)에서 클론 빼기, 드라마 WAV 머리말 함수의 표본율 인자, 메뉴 열기.

## 2. 구조 결정

### 2.1 DB (`packages/db/src/schema/my-voice.ts`)

| 칸 | 타입 | 뜻 |
|---|---|---|
| `id` | uuid pk defaultRandom | 앱 행 id(프로시저 입력) |
| `owner_id` | text notNull | 소유자(`saved_voice`와 같은 꼴, user FK는 T14, ADR 0004) |
| `provider` | text notNull, CHECK 다섯 공급자 목록(`saved_voice`와 같다) | T13-b에서 마이그레이션 없이 넓힌다. 계약이 지금 `fish_audio`·`gemini`만 받는다 |
| `provider_voice_id` | text null | 공급자가 준 id. 만들기 응답 전에는 null |
| `name` | text notNull | 1~30자 |
| `status` | text notNull, CHECK `sending`·`processing`·`ready`·`failed`·`unknown`·`deleting` | 스펙 4절 |
| `reason` | text null | 실패·미확인·삭제 대기 사유(tts-provider 사유 값 또는 `quality`·`not_found`) |
| `request_id` | uuid notNull | 만들기 요청 id |
| `fingerprint` | text notNull | 같은 요청 id 재전송 판정(공급자·이름·원본 바이트 sha256·동의 녹음 바이트 sha256, `node:crypto`) |
| `consent_at` | timestamptz(3) notNull | 본인 음성 동의 시각 |
| `consent_version` | text notNull | 동의 문구 판(계약 상수 `CONSENT_VERSION = "2026-11-18"`) |
| `created_at`·`updated_at` | timestamptz(3) defaultNow, `$onUpdate` | |

- 제약·인덱스:
  - `unique(owner_id, request_id)`: 재전송 재생.
  - 부분 유일 `my_voice_one_sending`(`owner_id`) where `status = 'sending'`: 소유자별 만들기 진행 1건.
  - 부분 유일 `my_voice_provider_voice`(`provider`, `provider_voice_id`) where `provider_voice_id is not null`: 공급자 클론 하나는 매핑 하나뿐(두 소유자가 같은 id를 가질 수 없다).
  - 인덱스 `(owner_id, created_at desc)`: 목록.
- 보관함과의 연결 칸을 두지 않는다(계획 리뷰 1회차 high·low). 클론의 보관함 행은 `saved_voice`의 (`owner_id`, `provider`, `voice_id` = `provider_voice_id`)로 찾는다. 캐스팅 '내 계정'에서 같은 Fish 클론을 다시 담아도 같은 행이라 연결이 끊기지 않는다(`saved_voice_voice` 유일). '보관함에 담겨 있음'은 목록 쿼리의 조인으로 계산한다.
- 파괴적 변경 없음(새 표만).
- **스펙과 다른 점(계획 결정):** 스펙 2절은 "만들기·지우기 1건"이었다. 지우기는 공급자 DELETE가 같은 결과를 내고(Fish·Gemini 모두 없는 id는 404 → 지움으로 본다) 삭제 대기가 오래 남을 수 있어 진행 1건 제약은 만들기에만 건다. 같은 행 지우기는 조건부 update(`status in (ready, processing, deleting, failed)`)로 직렬화한다. 스펙 2절 '동시 진행' 칸을 이 문장으로 고친다.

### 2.2 공급자 모듈 (`providers/fish-audio.ts`, `providers/gemini.ts`, `ProviderClient` in `providers/errors.ts`)

`ProviderClient`에 선택 메서드 셋을 더한다(Fish·Gemini만 구현).

| 메서드 | Fish Audio | Gemini |
|---|---|---|
| `cloneCreate({ name, source, consent? }, { signal })` → `{ voiceId, state: "ready" \| "processing" \| "failed", reason? }`. failed여도 공급자가 id를 줬으면 `voiceId`를 돌려준다(공급자 쪽에 남은 클론을 지울 수 있게) | `POST /model` multipart(`FormData`): `type=tts`, `title`, `train_mode=fast`, `visibility=private`, `voices`(Blob `audio/wav`, 1개), `enhance_audio_quality=true`. `references` 없음. `state` trained → ready, created·training → processing, failed → failed. `quality.audios[].quality_passed=false`가 있으면 failed(`quality`) | `POST /v1beta/voices` JSON `{ store: true, voice: { model: "gemini-3.8-flash-tts", type: "replicated", display_name, replicated: { source_audio: { mime_type: "audio/wav", data }, consent_audio: {…} } } }`. 응답 `id`(`voice_…`)를 그대로. 접두어 `voices/`가 오면 떼고 저장(`voiceIdSchema`가 `/`를 막는다). 상태 필드가 없어 성공 응답은 ready |
| `cloneGet(voiceId)` → `{ state } \| null` | `GET /model/{id}`(404 → null. 403은 키·계정 문제일 수 있어 `provider_auth` 같은 오류로 던지고 행은 처리 중으로 남는다) | `GET /v1beta/voices/{id}`(404 → null, 있으면 ready) |
| `cloneDelete(voiceId)` → `void` | `DELETE /model/{id}`, 404는 성공 | `DELETE /v1beta/voices/{id}`, 404는 성공 |

- 호출 감싸기: 만들기·지우기는 `runTrial`(시험 생성과 같은 사유 매핑, 자동 재시도 없음)에 시간 제한 120초, 조회는 `runList` 10초. 새 헬퍼를 만들지 않는다.
- 요청은 `fetchOk`(리다이렉트 금지). 멀티파트는 `FormData`를 `body`로 넘기고 `Content-Type`을 직접 쓰지 않는다(fetch가 경계를 붙인다).
- 합성은 맨 `voice_…` id를 `generation_config.speech_config[].voice`에 넣으므로 지금 `gemini.ts`의 합성 본문을 바꾸지 않는다(공식 문서 voice-replication·api-reference/voices 확인 2026-11-18).
- Gemini 클론 모델은 만들 때 `gemini-3.8-flash-tts`로 고정한다. 다른 모델(flash-lite)로 합성되는지는 공식 문서에 없어 사용자 테스트에서 본다(6절 위험).
- Gemini `getVoice`(보관함 확인)는 prebuilt 목록에서만 찾으므로 클론을 null로 판정한다. 그래서 보관함 확인에서 클론을 뺀다(2.3).

### 2.3 API (`packages/api/src/routers/my-voice.ts`, 계약 `my-voice-contract.ts`, WAV 검사 `wav.ts`)

| 프로시저 | 입력 | 출력·오류 |
|---|---|---|
| `myVoiceList` | 없음 | `{ items: MyVoice[], providers: { fish_audio: boolean, gemini: boolean } }`. `MyVoice = { id, provider, name, status, reason, createdAt, savedVoiceId: uuid \| null, voice: Voice \| null, presets: string[] }`(보관함 행은 (소유자, 공급자, 공급자 id) 조인, `presets`는 그 행을 쓰는 프리셋 이름). `voice`는 `ready` 행이면 보관함 행과 관계없이 `my_voice`로 만든다(보관함에 담는 값과 같다). 그래서 보관함에서 뺀 클론도 들어보기를 열 수 있다. `ready`가 아니면 null(계획 리뷰 2회차). 5분 지난 `sending`을 먼저 `unknown`으로. `providers`는 `context.providers[p]?.cloneCreate` 유무(키 없음 판정) |
| `myVoiceCreate` | `{ requestId: uuid, provider: "fish_audio" \| "gemini", name, consent: true, source: File, consentAudio?: File }` | `MyVoice`. BAD_REQUEST(`audio_format`·`audio_length`·`audio_size`·`consent_audio_missing`·`request_mismatch`), TOO_MANY_REQUESTS(`in_progress`·`rate_limit`+`until`), BAD_GATEWAY·GATEWAY_TIMEOUT(사유는 tts-provider 표) |
| `myVoiceCheck` | `{ id }` | `MyVoice`. `processing`일 때만 공급자 조회, 그 밖은 그대로. NOT_FOUND |
| `myVoiceDelete` | `{ id }` | `{ deleted: true } \| MyVoice(deleting)`. NOT_FOUND, CONFLICT(`sending`). `provider_voice_id`가 있으면(ready·processing·deleting·failed) 공급자 DELETE(404는 성공), 없으면(unknown, id 없는 failed) 행만 지운다. 화면의 '지우기'와 '목록에서 치우기'는 같은 프로시저다(계획 리뷰 1회차 medium: Fish가 failed로 남긴 모델도 지운다) |
| `myVoiceSave` | `{ id }` | `MyVoice`. `ready`인데 보관함 행이 없는(목록 `savedVoiceId` null) 클론을 다시 담는다. 한 트랜잭션에서 `select … from my_voice where id, owner_id, status = 'ready' for update`로 행을 잡고 같은 트랜잭션에서 upsert한다. 행이 없으면 NOT_FOUND(지우기와 겹쳐 지운 클론의 보관함 행이 다시 생기지 않게, 계획 리뷰 2회차) |

- **만들기 순서:** 계약 검사(zod: `z.file()` 크기 상한 원본 3MB·동의 1MB, MIME 무시) → 공급자 메서드 유무(`no_key`) → 같은 요청 id 재생(`fingerprint` 다르면 `request_mismatch`) → 대기 시각(`provider_cooldown`) → `wav.ts`로 바이트 검사(RIFF/WAVE·`fmt ` PCM 1·24000Hz·1채널·16비트·`data` 길이로 초. 공급자별 범위는 계약 상수 `CLONE_LIMITS`) → 5분 지난 `sending` 만료 → `sending` 행 insert 선점(`onConflictDoNothing`, 진행 중이면 `in_progress`) → 공급자 호출 → 결과 저장. ready면 같은 트랜잭션에서 보관함 `upsert`(`routers/saved-voice.ts`의 기존 export, `preset.ts`와 같은 사용).
- 상태 전이는 모두 기대 상태 조건이 붙은 `update … where status = <기대> returning`이다(결과 저장 `sending`, 확인 `processing`, 지우기 `ready`·`processing`·`deleting`·`failed`). 바뀐 행이 없으면 보관함 upsert를 하지 않고 지금 행을 돌려준다. 확인과 지우기가 겹치면 지우기가 이긴다(계획 리뷰 1회차 medium).
- 보관함에 담는 성우 값: `emptyVoice(provider, "account")`에 `voiceId`, `name`, `origin: "own"`, `description: null`. 샘플 없음.
- 공급자 성공 뒤 DB 저장이 실패하면 행은 `sending`으로 남아 5분 뒤 `unknown`이 된다(스펙 8절). 받은 공급자 id는 로그에 남기지 않는다.
- 429는 `provider_cooldown`에 적는다(시험 생성의 `recordFailure`와 같은 규칙, `Retry-After` 없으면 60초).
- **지우기 순서:** 트랜잭션에서 내 행을 `deleting`으로 바꾸고(기대 상태 조건) 보관함 행(소유자·공급자·공급자 id)을 `unavailable = true`로 → 공급자 `cloneDelete` → 성공이면 트랜잭션에서 `my_voice` 삭제, 이어 같은 조건의 보관함 행 삭제(프리셋 set null, 분류·채널 cascade). `my_voice`를 먼저 지워 잠금 순서를 맞춘다(계획 리뷰 3회차 low). 실패·미확인이면 `reason`만 적고 `deleting` 유지.
- **합성 전 클론 검사(`packages/api/src/trial.ts`, 계획 리뷰 1회차 high):** 새 함수 `cloneBlocked(db, ownerId, provider, voiceIds)`는 voice id 가운데 `my_voice.provider_voice_id`에 있으면서 '내 것이고 `ready`'가 아닌 것이 있으면 참이다. `usableVoices` 안(작업실·드라마)과 `trialCreate`(`replayRequest` 뒤, `cooldownOf` 앞)에서 부르고 참이면 공급자를 부르지 않고 각각 기존 `voice_unavailable`·NOT_FOUND로 거절한다. DB 실패면 공급자를 부르지 않는다(`withStorage`). 그래서 B가 A의 클론 id를 보관함에 담아도, 삭제 대기 클론을 다시 담아도 어느 경로로도 합성되지 않는다.
- **보관함 담기 규칙(`saved-voice-contract.ts`, 계획 리뷰 2회차 medium):** 지금 `savedVoiceInputSchema`는 Typecast·Airy·Gemini를 `source: public`만 받는다. 성우 보관함의 즐겨찾기·메모(`savedVoiceSave`)와 채널·분류(`savedVoiceLinks`)는 저장된 행의 성우 값을 그대로 다시 보내므로, 이대로면 Gemini 클론(`account`)의 즐겨찾기·분류가 거절된다(스펙 2절 '지금 흐름 그대로', REQ-13). 계약의 이 규칙을 'Gemini는 account도 받는다'로 넓히고, 대신 보관함에 쓰는 모든 길이 지나는 기존 export `upsert`(`routers/saved-voice.ts`) 한 곳에서 공개 출처만 있던 공급자(Typecast·Airy·Gemini)의 `account` 성우는 이 소유자의 `my_voice`(소유자, 공급자, `provider_voice_id` = voiceId)를 `select … for share`로 확인하고 없으면 NOT_FOUND로 막는다. 그래서 `savedVoiceSave`·`savedVoiceLinks`·`presetCreate`·`presetOverwrite`·`myVoiceCreate`·`myVoiceSave`가 함께 막힌다(계획 리뷰 3회차 medium). 검사와 upsert가 한 트랜잭션이어야 하므로 지금 트랜잭션 없이 upsert하는 `savedVoiceSave`를 `db.transaction`으로 감싼다. 잠금 순서는 모든 길에서 `my_voice` → `saved_voice`다(지우기 마지막 트랜잭션도 `my_voice`를 먼저 지운다). (구현·보안 리뷰 반영) 매핑 조회는 출처와 상관없이 하고, 남의 매핑과 ready가 아닌 내 매핑은 NOT_FOUND, 내 매핑이면 출처를 `account`로 고정한다. 로드맵 T13 메모 'T7에서 넘어온 것'(Typecast `voice_type`)은 T13-b에서 같은 규칙으로 Typecast를 더한다.
- **보관함 확인(`routers/saved-voice.ts` `savedVoiceCheck`):** 확인 대상 select에 `not exists (select 1 from my_voice m where m.owner_id = saved_voice.owner_id and m.provider = saved_voice.provider and m.provider_voice_id = saved_voice.voice_id)`를 더한다. 클론의 이용 가능은 `my_voice` 상태가 정한다.
- **보관함에서 직접 빼기(`savedVoiceRemove`):** 바꾸지 않는다. 클론의 보관함 행이 없으면 목록의 `savedVoiceId`가 null이고 내 보이스 줄 ⋯ 메뉴에 '성우 보관함에 다시 담기'(`myVoiceSave`)가 생긴다. Gemini 클론은 캐스팅에서 다시 담을 길이 없어 둔다(사용자 확인 때 알린다).
- 프리셋 이름: 목록 쿼리에서 보관함 행 id로 `voice_preset`을 묶어 이름 배열로(인덱스 `voice_preset_saved_voice` 있음). 지우기 확인 창의 수와 이름이 여기서 온다.
- File 입력: 지금까지 File은 출력에만 썼다. 첫 태스크에서 기존 `rpc-file.test.ts`(같은 RPCHandler·RPCLink·CSRF 메모리 연결)에 File 입력(원본 3MB + 동의 1MB) 사례를 더해 먼저 증명한다. 안 되면 멈추고 보고한다(Route Handler로 우회하지 않는다. ADR 0002).
- 로그: `[myVoice] 공급자 사유` 한 줄만. 원본 바이트·base64·응답 본문·공급자 id를 남기지 않는다.

### 2.4 화면

| 파일 | 책임 |
|---|---|
| `lib/clone-audio.ts` | `toCloneWav(blob)`: `new OfflineAudioContext(1, 1, 24000).decodeAudioData`(컨텍스트 표본율로 리샘플) → `monoOf` → `pcm16`(둘 다 `lib/sound-join.ts` 재사용) → `wavHeader(bytes, 24000)`(`drama-script.ts`, 표본율 인자 추가). 길이(초) 판정과 무음 판정(`SILENCE` −50dBFS 재사용)은 순수 함수로 테스트(계획 리뷰 1회차 medium) |
| `lib/my-voice-text.ts` | 브리프 7절 문구, 읽을 거리 문단, Gemini 동의 문장(계약 상수 재수출) |
| `lib/my-voice-view.ts` | 상태 → 배지·주 동작·⋯ 메뉴 항목, 사유 → 문구, 원본 길이 판정(공급자 범위) 순수 함수 |
| `components/audio-capture.tsx` | 녹음·파일 칸 하나(원본·동의 녹음 공용): 녹음하기/멈추기, 경과 시간, 상한 자동 멈춤, 파일 고르기, '내 원본' 재생, 다시 녹음·파일 바꾸기, 트랙·object URL 정리. `onChange(wav \| null)` |
| `components/my-voice-create.tsx` | 만들기 창(4단계, 요청 id는 '보내기' 누를 때 한 번 만들고 재전송에 재사용) |
| `components/my-voice-listen.tsx` | 들어보기 창: `SamplePlayerProvider` + `TrialProvider` + `SentenceBar` + `TrialSection` + `TrialResults`를 그 클론 `Voice`로(캐스팅 부품 그대로, 새 Provider 없음) |
| `components/my-voices.tsx` | 목록·상태·줄 동작·지우기 확인(`ConfirmDialog`)·치우기·상태 확인 |
| `app/(app)/my-voices/page.tsx` | Server Component, `PageHeader` + `MyVoices`. db·공급자 모듈을 부르지 않는다 |
| `components/app-nav.tsx` | '내 보이스'를 `UPCOMING_ITEMS`에서 `OPEN_ITEMS`('프리셋' 다음, `bar: false`)로 |

- 녹음 형식: `MediaRecorder` 기본(`mimeType` 지정 안 함) → `toCloneWav`. 파일도 같은 길.
- 재생은 기존 `SamplePlayerProvider`의 한 번에 한 소리 규칙을 따른다(원본 플레이어도 그 플레이어를 쓴다). object URL은 바꿀 때·닫을 때 해제.
- 마이크: 녹음 버튼을 누를 때 `getUserMedia({ audio: true })`, 멈춤·창 닫기·언마운트에 모든 트랙 `stop()`.
- 목록 쿼리 무효화: 만들기·지우기(치우기 포함)·다시 담기 뒤 `myVoiceList`와 `savedVoiceList`, 프리셋 목록.
- 브라우저 테스트 환경은 node(jsdom 없음)라 화면 lib 순수 함수만 vitest로 확인하고, 녹음·창은 QA에서 본다.

### 2.5 문서 (Main)
- `docs/domain/project.md`: 주요 흐름(내 보이스), 기능 표, 화면 `/my-voices`, API 5개와 `savedVoiceSave`·`savedVoiceLinks` 규칙 변경, 데이터 `my_voice`(용어 칸 '소유 매핑').
- 스펙 2절 '동시 진행' 칸 수정(2.1), 9절·수용 기준 1의 드라마는 Fish 클론만. research 문서(`docs/research/`)에 확인한 사실을 반영하는 것은 33행. tts-provider 스킬(하네스 경로, 케이스 H)의 클론 절 갱신은 이번 라운드에서 하지 않고 백로그로 둔다(계획 리뷰 1회차 low).

## 3. 태스크

### Task 1: DB 표와 마이그레이션 (prokit-db-builder)
- 파일: `packages/db/src/schema/my-voice.ts`, `schema/index.ts`, 생성 마이그레이션.
- 완료: 2.1 칸·제약·인덱스, `db:generate` 뒤 한 번 더 돌려 'No schema changes', 생성 SQL에 DROP 없음. 적용은 Main(8행).

### Task 2: File 입력 증명, 계약, WAV 검사 (prokit-api-builder, 테스트 먼저)
- 파일: `packages/api/src/my-voice-contract.ts`(입력·출력 스키마, `CLONE_LIMITS`, `CONSENT_VERSION`, Gemini 동의 문장), `packages/api/src/wav.ts`+테스트(서버 바이트 검사), `packages/api/src/drama-script.ts`(`wavHeader(dataBytes, rate = DRAMA_SAMPLE_RATE)`), 기존 `rpc-file.test.ts`에 File 입력 사례.
- 완료: File 입력 테스트 통과(실패하면 멈추고 보고), WAV 검사 경계(9.99초·10초·60초·60.01초, 44.1kHz, 스테레오, 8비트, 머리말 깨짐, `data` 없음) 테스트, 기존 drama-script 테스트 회귀 없음.

### Task 3: 공급자 모듈 클론 메서드 (prokit-api-builder, Task 2 뒤)
- 파일: `providers/errors.ts`(인터페이스), `providers/fish-audio.ts`, `providers/gemini.ts`, 각 테스트.
- 완료: 2.2 표의 요청 모양을 `fetchMock`으로 단언(Fish `visibility=private`·`train_mode=fast`·`references` 없음, Gemini `store: true`·base64·mime·모델), 상태 매핑, 404 지우기 성공, 오류 사유 매핑, 자동 재시도 0회.

### Task 4: 라우터·기존 경로 변경·격리 테스트 (prokit-api-builder, Task 1·3 뒤)
- 파일: `routers/my-voice.ts`, `routers/index.ts`, `packages/api/src/trial.ts`(`cloneBlocked`, `usableVoices`), `routers/trial.ts`(시험 생성 검사), `routers/saved-voice.ts`(확인 대상 제외, `upsert`의 클론 매핑 검사, `savedVoiceSave` 트랜잭션), `packages/api/src/saved-voice-contract.ts`(Gemini account 허용), `routers/preset.ts`(테스트만, 코드는 `upsert`가 막음), 테스트 `my-voice.test.ts`·`my-voice.isolation.test.ts`, trial·studio·drama 클론 검사 테스트, `saved-voice-check` 클론 제외 테스트.
- 완료: 스펙 12절 API 목록 전부, tts-provider 검사 ①~⑤(같은 id 동시 2회 → 공급자 1회, 다른 id 동시 → 진행 1건, B가 A 행 확인·지우기·다시 담기 → NOT_FOUND·공급자 0회, 소유자 없음 UNAUTHORIZED), 시험 생성·작업실·드라마 각각 '삭제 대기 클론'과 'B가 담은 A의 클론 id' → 거절·공급자 0회, failed+id 지우기 → 공급자 DELETE 1회, 확인과 지우기가 겹치면 deleting 유지, 지우기와 다시 담기가 겹치면 보관함 행이 남지 않음, Gemini 클론 행의 즐겨찾기·채널·분류 저장과 Gemini 클론 프리셋 만들기 성공, 매핑에 없는 Gemini account id를 담기·프리셋으로 보내면 NOT_FOUND, 담기와 마지막 지우기가 겹쳐도 보관함 행이 남지 않음(Gemini 클론으로 시험. 매핑 검사가 걸리지 않는 Fish 클론은 삭제 대기 동안 `cloneBlocked`, 지운 뒤에는 공급자 거절에 맡긴다), 회귀: 매핑 없는 Fish·ElevenLabs account 성우와 Gemini public 성우는 `savedVoiceSave`·`presetCreate`로 지금처럼 담김(앱 밖 클론 담기 유지). `upsert` 첫 인자 타입은 트랜잭션(`Tx`)으로 좁혀 트랜잭션 밖 호출을 컴파일에서 막는다.

### 체크포인트 A (Task 1~4 뒤)
- API 테스트 전부·타입·린트 통과. db 리뷰(11행), code 리뷰(16행). security 리뷰(34행)는 이 뒤 아무 때나(계획 리뷰가 순서를 정한다).

### Task 5: 화면 lib (prokit-ui-builder, Task 2와 병렬 가능 — 계약 타입만 쓴다)
- 파일: `lib/clone-audio.ts`+테스트, `lib/my-voice-view.ts`+테스트, `lib/my-voice-text.ts`.
- 완료: 길이·무음 판정, 상태별 배지·동작 표(Task 2의 `wavHeader` 표본율 인자 뒤. 기존 sound-join 테스트 회귀 없음).

### Task 6: 녹음 칸과 만들기 창 (prokit-ui-builder, Task 4·5 뒤)
- 파일: `components/audio-capture.tsx`, `components/my-voice-create.tsx`.
- 완료: 브리프 5절 만들기 창과 6절 접근성, 정리 규칙(트랙 stop, object URL 해제), 요청 id 한 번.

### Task 7: 목록·들어보기·지우기·페이지·메뉴 (prokit-ui-builder, Task 6 뒤)
- 파일: `components/my-voices.tsx`, `components/my-voice-listen.tsx`, `app/(app)/my-voices/page.tsx`, `components/app-nav.tsx`.
- 완료: 브리프 5절 목록·상태 표·지우기 확인(프리셋 수와 이름은 목록 출력 `presets`)·들어보기 창, 메뉴 열기, 쿼리 무효화.

### 체크포인트 B (Task 5~7 뒤)
- 화면 테스트·타입·빌드, 런타임 확인(21행), 디자인 리뷰·감사(23·24행), 사용자 흐름 QA(31행, 가짜 RPC로 유료·상태 변경 0회).

## 4. 순서와 병렬

Task 1 → (Task 2 → Task 3) → Task 4. Task 5는 Task 2(계약·`wavHeader`)가 끝나면 Task 3·4와 병렬. Task 6·7은 Task 4 뒤(화면이 실제 프로시저 이름·출력에 붙는다). 파일이 겹치지 않는다: 계약 파일은 Task 2만, `routers/`는 Task 4만, `apps/web`은 Task 5~7만.

## 5. 대조표 행 대응

| 행 | 할 일 |
|---|---|
| 5 | 구현 방식(위임 계획 이 문서) |
| 6~11 | Task 1, 로컬 DB 적용(Main), Neon N/A, 파괴적 변경 없음, db 리뷰 |
| 12~16 | Task 2(계약 위치)·3·4, 격리 테스트, 검사, code 리뷰 |
| 17~19 | 디자인 맥락·브리프(이미 확인), Task 5~7 |
| 20~28 | 검사, 런타임, 휴대폰 스크롤(N/A 판단), 디자인 리뷰·감사·마감·재확인, DESIGN.md, 통합 런타임 |
| 29~33 | 공통화 점검(ponytail-review), 최종 code 리뷰, QA, 수정·재QA, 문서 |
| 34 | security 리뷰(소유 매핑·클론 id·업로드 검사·중복 호출·trial 검사·Fish 공개 범위) |
| 35 | 사용자 확인(스펙 14절 실제 호출은 각각 승인 뒤). 계획에서 더한 '성우 보관함에 다시 담기'와 드라마 장면 연기는 Fish 클론만(혼합 대본 읽기는 둘 다)이라는 점을 알린다 |

## 6. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| oRPC `File` 입력이 RPCLink·핸들러·CSRF 플러그인을 지나 멀티파트로 오지 않는다 | 높음(구조가 바뀐다) | Task 2 첫 테스트로 먼저 증명. 실패하면 멈추고 사용자와 정한다 |
| Fish 무료 플랜이 API 클론을 거절 | 중간(사용자 테스트 실패) | `quota`·`no_permission` 안내. 사용자 테스트 1에서 처음 안다. 미검증으로 보고 |
| Gemini 클론을 flash-lite로 합성하면 거절 | 낮음 | 사용자 테스트에서 본다. 거절이면 시험 생성·작업실에서 클론의 Gemini 모델을 flash로 고정하는 후속(백로그) |
| Gemini 응답 id 꼴(`voice_…`이 아니라 `voices/voice_…`) | 낮음 | 접두어를 떼고 `voiceIdSchema`로 검사. 어긋나면 `provider_error`로 실패 처리 |
| Safari `MediaRecorder`(mp4) 디코드 실패 | 중간 | 파일 고르기 안내. QA에서 확인 |
| `savedVoiceCheck`가 클론을 이용 불가로 바꿈 | 높음(클론을 못 씀) | 확인 대상에서 클론 행을 뺀다(Task 4 테스트) |
| 요청 본문 4.5MB | 낮음 | 원본 60초 WAV 약 2.88MB + 동의 20초 0.96MB < 4MB, 계약에서 상한 |

## 7. 계획 리뷰

- 1회차(2026-11-18) prokit-reviewer(plan): changes-required, max=high, 지적 10(high 1·medium 4·low 5) 모두 반영. high: 클론 검사가 시험 생성에만 있어 작업실·드라마·다시 담은 보관함 행으로 삭제 대기·남의 클론 합성이 열림 → `cloneBlocked`를 `usableVoices`와 `trialCreate`에서 공통으로, 보관함 연결을 (소유자, 공급자, 공급자 id)로 바꾸고 `saved_voice_id` 칸 삭제. medium: failed 클론이 공급자에 남음 → 치우기를 지우기에 합쳐 id 있으면 공급자 DELETE(프로시저 6 → 5); 상태 전이 경쟁 → 모든 전이를 기대 상태 조건 update로; 드라마는 Fish 전용 → 스펙 9절·수용 기준 1 고침; WAV 머리말·모노·PCM 재구현 → `wavHeader` 표본율 인자, `monoOf`·`pcm16`·`SILENCE` 재사용. low: fingerprint에 sha256, File 입력 사례는 기존 rpc-file.test.ts에, 프리셋 이름 출력, 스킬 갱신은 백로그, 지운 뒤 작업실·드라마 QA 추가, 다시 담기는 사용자 확인 때 알림.

- 2회차(2026-11-18) prokit-reviewer(plan): changes-required, max=medium, 1회차 지적 10개 해소 확인, 새 지적 6(medium 1·low 5) 모두 반영. medium: 담기 계약이 Gemini account를 막아 Gemini 클론의 즐겨찾기·분류가 깨짐 → 계약을 넓히고 핸들러에서 클론 매핑 검사. low: 지운 칸을 가리키는 문장·API 수·지우기 조건 정리, 스펙 6·8·3·5.4절과 브리프 진행 중 문구를 계획에 맞춤, myVoiceSave를 for update 트랜잭션으로, ready 행의 voice는 my_voice로 만듦, 공급자 id가 있는 failed 치우기는 확인 창을 거침.

- 3회차(2026-11-18) prokit-reviewer(plan): changes-required, max=medium, 2회차 지적 6개 해소 확인, 새 지적 3(medium 1·low 2) 모두 반영. medium: 넓힌 담기 규칙이 프리셋 만들기·덮어쓰기 경로(같은 스키마, 직접 upsert)로 매핑 없는 Gemini account id를 열어 둠 → 매핑 검사를 공통 `upsert` 한 곳으로 옮김. low: 검사와 upsert 사이 경쟁 → `savedVoiceSave` 트랜잭션·`for share`, 잠금 순서 `my_voice` → `saved_voice` 통일; 스펙 4절 처리 중 지우기, 6절 입력 문장, Gemini 합성 필드 확인 기록.

- 4회차(2026-11-18) prokit-reviewer(plan): approve, max=low, integration_acceptance accept. 3회차 지적 3개 해소 확인(upsert 호출자 넷 모두 트랜잭션, 잠금 순서 my_voice → saved_voice 교착 없음). low 2 반영(문서만, 재리뷰 불필요): Task 4 회귀 조건(Fish·ElevenLabs account와 Gemini public은 매핑 없이 담김, 겹침 시험은 Gemini 클론, upsert 인자 Tx), 스펙 9·12절의 클론 검사를 세 합성 경로로.

## 8. 열린 질문

없음. 스펙 2절과 이 계획 2절이 정했다.
