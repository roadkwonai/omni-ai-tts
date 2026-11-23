# T21 CLI 내 보이스와 기능 대조

[CLI 기획·설계](../2026-11-23-cli-plan.md)의 다섯째이자 마지막 작업이다. [T18](T18-cli-studio-generate.md)의 유료 흐름(`paid.ts`), [T19](T19-cli-library-and-casting.md)의 보관함·관리 규칙, [T20](T20-cli-paragraphs-and-drama.md)의 공용 모듈·결합을 쓴다. CLI-Anything은 refine 방식만 쓴다.

사용자 확인: 2026-11-24 AskUserQuestion "필터·줄 쉼까지 포함".

## 빈 곳 (refine 조사)

서버 프로시저 59개 가운데 웹은 쓰고 CLI는 쓰지 않는 것은 내 보이스 다섯(`myVoiceList/Create/Check/Save/Delete`)이다. `studioFind`·`trialFind`는 여러 건 조회로 대신한다. 화면 기능 중 없는 것은 `voices list`의 검색·분류·태그·정렬, 드라마 줄별 쉼이다.

## 스펙

### 서버

- `myVoiceRequest({ requestId }) → MyVoice | null`(`protectedProcedure`)을 더한다. 같은 소유자의 그 요청 id 행만 보고, 없거나 남의 것이면 `null`이다. 5분 넘은 `sending`은 `unknown`(`reason: unknown_outcome`)으로 읽고 쓰지 않는다. 공급자 호출 0, 쓰기 0(보관함 담기 없음), 출력은 `myVoiceSchema`다.
- 그 밖의 서버 변경은 없다. DB 스키마·환경 변수 변경 없음.

### 공용 이동

동작 변화 0. 웹 파일은 같은 이름을 다시 내보내고 웹 테스트는 고치지 않는다. 새 모듈은 서버 모듈·zod를 import하지 않는다. 페이지별 값 import 도달(T20과 같은 import 그래프 비교, 기준 538df54)은 그대로여야 한다. 고정 자료는 538df54 웹 출력으로 만들고 T20 자료(f66ac3e)와 파일을 나눈다.

| 웹 원래 파일 | 옮기는 것 | 새 위치(`packages/api/src`) | 웹에 남는 것 |
|---|---|---|---|
| `voice-filter` | 성별·연령 키와 이름표(`GENDER_LABEL`·`AGE_KEY_LABEL`·공급자 키 표·`labelOf`·`keyLabels`·`providerValue`·`genderKeyOf`·`ageKeyOf`)와 `anyOf`. 캐스팅 화면 전용(`filterGemini`·선택지·선반)은 옮기지 않는다 | `voice-filter.ts` | 나머지, 재수출 |
| `provider-conditions` | `EL_DESCRIPTIVE`·`FISH_MOOD` 두 표 | `voice-filter.ts` | 재수출과 나머지 |
| `saved-voice-view` | `TagRow`·`CONTENT_TAGS`·`MOOD_TAGS`·`TAG_TABLE`·`TAG_LABEL`·`TagAxis`·`tagKeysOf`, `SavedLike`(내보냄), `LIBRARY_SORTS`·`LibrarySort`·`LibraryView`·`LibraryFilters`·`EMPTY_LIBRARY_FILTERS`, `foldName`·`filterSaved`·`sortSaved`(`usageGroup` 포함) | `library-filter.ts` | 주소 쿼리·선택지·묶음 머리·칩·문구, 재수출 |
| `clone-audio` | `isSilent` | `sound-join.ts` | `wavFromSamples`·`toCloneWav`, 재수출 |

### 내 보이스 명령

```text
clones list
clones create  --provider fish_audio|gemini --name NAME --source FILE.wav [--consent-audio FILE.wav]
               --consent [--yes] [--new] [--dry-run]
clones check   ID
clones save    ID
clones remove  ID [--yes]
clones resume  [REQUEST_ID]
```

1. 입력 검사는 연결 전에 모두 한다(2). 파일은 한 번만 읽어 검사하고, 통과한 소리(data 조각)만 새 WAV 머리로 다시 싸서 해시·전송한다(웹과 같다. 제목·메모 같은 부가 정보와 뒤에 붙은 바이트는 보내지 않는다. 확인 사이에 파일이 바뀌어도 같다). 보내는 이름은 웹처럼 `source.wav`·`consent.wav`다. 이름은 `myVoiceNameSchema`로 정리하고, 원본은 일반 파일(링크의 대상도 일반 파일)이며 서버 상한(원본 3,000,000, 동의 1,000,000바이트) 안이다. `readCloneWav`(24kHz 모노 16비트 PCM)와 `cloneLengthProblem`, 무음(`isSilent`, 원본과 동의 녹음 모두. 샘플은 검사를 통과한 바이트의 data 조각에서 `join.ts` `wavChunks`로 읽는다)을 본다. Gemini는 `--consent-audio`가 필요하고 Fish Audio에 주면 2다(조용히 버리지 않는다). 확장형 머리(0xFFFE)라도 하위 형식이 PCM이면 받는다(macOS `afconvert`가 모노 m4a에서 이렇게 쓴다). 형식이 틀리거나 크기를 넘으면 `ffmpeg`·`afconvert` 변환 명령을 안내한다(CLI는 변환하지 않는다).
2. `--consent`는 `--yes`와 별개다. 없으면 터미널·비대화 모두 2이고 동의 문장(웹과 같은 글)과 고지(보낼 것, 가는 곳, 보관, 되돌리기, 요금 정보 없음)를 보인다. Gemini는 동의 녹음에서 읽을 고정 문장도 보인다. `--dry-run`도 `--consent`가 필요하다.
3. 흐름은 T18 `runRequest`·`create`를 종류 `clones`로 쓴다. 지문은 `[origin, 사용자, clones, 공급자, 정리한 이름, 원본 sha256, 동의 sha256]`이다. 로컬 기록(있으면 다시 보내지 않고 그 요청을 확인) → 같은 이름 검사 → 확인(무료 구분 없이 언제나 `--yes`나 터미널 확인) → 선점 → 같은 이름 다시 검사 → 전송 1회 → 해제. 기록에는 오디오·이름을 두지 않는다.
4. 같은 이름 검사는 `myVoiceList`에서 같은 공급자·같은 정리된 이름의 줄을 본다. `ready`·`processing`이면 2(`CONFLICT`, 그 ID)이고 만들지 않는다. `sending`·`unknown`이면 6(그 ID)이다. `failed`·`deleting`은 막지 않는다. 다만 `failed`이고 사유가 `provider_error`인 줄은 공급자에 만들어졌을 수 있어(200이지만 id를 못 읽음, 5xx) 6으로 막고 공급자 웹 확인 → `clones remove` → 다시 실행을 안내한다. 같은 입력의 동시 실행은 1회이고, 같은 이름·다른 원본의 동시 실행과 웹에서의 동시 만들기는 서버 `sending` 하나 제한에 기댄다(재검사와 전송 사이가 남는 한계). `--new`만 이 검사와 로컬 기록을 건너뛴다(유료·상태 변경 확인은 그대로). `--dry-run`도 검사 결과를 같은 코드로 알리고 아무것도 보내지 않는다.
5. 공급자 키가 없으면(`myVoiceList.providers`) 만들기 전 5(`no_key`)다.
6. 응답 처리: `ready`·`processing` 0(ID·상태·`ready`면 REF), `failed` 5(사유, 그 ID. `clones remove`로 치움), 응답을 받지 못함·모르는 응답·`unknown_outcome` 6(요청 ID, 기록 유지), 공급자 호출 전 거절과 확정 실패는 기록 해제 뒤 기존 분류다. 응답은 `myVoiceSchema`로 검사하고 상태가 `ready`·`processing`·`failed`가 아니면 6이다. `failed`는 기록을 푼 뒤 5다. 자동 재시도 없음.
   - 분류(`isRejected`)는 원본 오류로 하고, `rpcError`와 `recover`의 실패 자리에서만 종류가 준 선택 함수 `failure?`로 글을 고른다. 클론 문구 표는 `clones.ts`에 두고 `REASON_TEXT`에는 넣지 않는다. `audio_format`·`audio_length`·`consent_audio_missing`은 2, `quality`·`not_found`·`provider_input`·요금제는 5다.
   - `Kind.status`·`recover`는 실제로 읽는 칸만 받는 제네릭 행(`id`, 상태 `done`·`failed`·그 밖, 사유)으로 일반화한다. 매핑은 `ready`·`processing` → `done`, `failed` → `failed`, 그 밖은 그대로 미확인이다. 가짜 사용량을 만들지 않고 `describe.estimate`를 선택으로 한다. studio·trial·drama의 동작·지문·출력은 그대로다.
   - 종류 이름은 명령과 같은 `clones`다(안내의 `clones resume`). 응답을 받은 뒤 파일을 받지 않으므로 그 뒤 `Ctrl+C`는 `DOWNLOAD_STOPPED` 대신 `OUTPUT_STOPPED`(7, `cloneId`, `clones list`로 확인)다. 오류의 ID는 `ErrorDetail.cloneId`다.
7. `resume REQUEST_ID`는 `myVoiceRequest`만 부른다. `ready`·`processing`은 기록 해제 뒤 0, `failed`는 해제 뒤 5, 그 밖(`sending`·`unknown`·`deleting`·없음·조회 실패)은 6이고 기록은 남는다. 미확인이면 공급자 웹에서 확인하고 `clones remove`로 줄을 치운 뒤 필요할 때만 `--new`를 쓰라고 알린다. ID가 없으면 남은 요청 목록이다. 종류가 다른 요청은 2다.
8. `list` 열은 이름, ID, 공급자, 상태, 사유와 다음 동작(웹 `rowNoteOf`와 같은 뜻), REF, 보관함 여부, 프리셋, 만든 때와 공급자별 만들 수 있는지다. `check`는 처리 중인 클론의 공급자 조회 한 번(무료)이다. 결과가 `ready`·`processing`이면 0, `failed`면 5(사유), `sending`·`unknown`·`deleting` 줄이면 그 상태를 보이고 0, 조회 실패는 기존 분류다. `save`는 `ready`만 보관함에 다시 담는다. 들어 보기는 `trial generate --voice REF`다.
9. `remove`는 언제나 확인(`--yes`)이 필요하고 이름·공급자·쓰는 프리셋과, 공급자 계정에서도 지워지고 되돌릴 수 없음(`unknown`은 앱 줄만 지워지고 공급자 쪽에 남았을 수 있음)을 보인다. 이미 만든 음성 결과는 남는다고도 적고, `failed`는 공급자에 남은 것이 있으면 함께 지워진다고 적고, 사유가 `provider_error`인 `failed`는 `unknown`과 같은 고지를 쓴다. 목록에 없는 ID는 4, 보내는 중이면(목록이나 서버 `CONFLICT`) 2다. `remove`는 `mutate`를 쓰지 않고(`check`·`save`만 쓴다) `onInterrupt`만 걸어 `clones.ts`가 원본 오류를 나눈다: `unknown_outcome`과 연결 끊김은 6, `NOT_FOUND`는 4, 로그인 끊김은 3, 사유 없는 5xx와 모양이 다른 응답은 6, 그 밖은 5(대기 시각 표시). 실패하면 `myVoiceList`를 한 번 읽어 그 줄의 실제 상태(삭제 대기, 그대로, 없음)를 알리고, 못 읽으면 상태를 단정하지 않는다. 삭제 대기 줄은 같은 명령으로 다시 시도한다.
10. `Ctrl+C`: 선점 전 2, 선점 뒤 응답 전 6(T18과 같다), 지우기 요청을 보낸 뒤 6이다.

### 보관함 조건 (`voices list`)

`--q TEXT`, `--preset`(프리셋에 쓰는 성우만), `--category-id ID`·`--type-id ID`(여러 번), `--gender`·`--age`(공통 키 하나), `--content`·`--mood`(공통 키 여러 번), `--sort recent|used|count|name|popular`를 더한다. 거르기와 순서는 웹 `filterSaved`·`sortSaved` 그대로다(같은 종류 안은 하나라도, 종류끼리는 모두). 웹은 보기를 하나만 고르지만 CLI는 `--favorite`·`--frequent`·`--preset`을 함께 받으므로 준 보기마다 차례로 걸어 모두 맞는 것만 남긴다(웹 대조는 보기 하나일 때). 모르는 키는 쓸 수 있는 키 목록과 함께 2, 없는 분류 ID나 종류가 다른 ID는 4다. 기존 옵션·JSON 칸은 그대로이고, 조건을 줬는데 0명이면 사람용 글이 '조건에 맞는 성우가 없습니다.'다.

### 드라마 쉼

- 장면 JSON에 `gap`(장면 기본)과 줄 `gap`(그 줄 뒤)을 받는다. 0~5초, 0.1초 단위이고(`typeof gap === 'number' && gapOf(gap) === gap`) 틀리면 2(줄 번호)다. `drama read --join`은 줄 쉼 → 장면 쉼 → 0.3초 순서로 쓴다(웹과 같다). `drama generate`는 쓰지 않고(요청·지문에 들어가지 않는다) `drama autotag`는 그대로 옮긴다.
- `drama split --join FILE.wav [--input SCENE.json]`은 나눈 조각을 앞뒤 무음을 줄이고 쉼을 넣어 한 WAV로 잇는다(웹 '쉼 넣어 한 파일로'). 쉼은 장면 파일의 값이고 줄 수가 다르면 2, 파일이 없으면 0.3초다. 경로·디코더는 쓰기 전에 검사하고 줄 파일과 같은 경로면 2다. 결합을 임시 폴더에서 끝낸 뒤 줄 파일과 결합 파일을 게시하고, 어느 것이든 실패하면 이번에 새로 만든 파일을 지운다.

### 기능 대조와 가이드

- `apps/cli/tests/parity.test.ts`: `appRouter`의 모든 프로시저가 CLI 소스(주석 제외)에서 `.<이름>(` 호출 꼴로 불리거나(타입 참조·구조 분해는 세지 않는다. 타입으로만 있는 이름이 실패하는 반례를 둔다), 이유가 적힌 예외 표(`healthCheck`, `studioFind`, `trialFind`)에 있어야 한다. 예외 표의 낡은 항목(이미 불리는 것, 없는 것)도 실패한다.
- 기획서에 "기능 대조" 절을 더한다: 기능 행마다 CLI 명령과 검증(테스트 파일), 남은 차이(재생·미리 듣기, 테이크 격자·비교와 줄마다 다른 테이크 고르기, zip, 숫자 검수의 Typecast AutoTag 참고 후보, 브라우저 녹음, 화면 편집)를 적는다.
- `apps/cli/README.md`를 설치부터 따라 하는 가이드로 맞춘다(설치, 로그인, 성우 고르기, 음성·문단·드라마·클론, 복구, 종료 코드, 변환 명령). 실행 확인이 그대로 따라 한다.

### 만들지 않는 것

녹음, 오디오 변환·편집, 클론 이름 바꾸기, 앱 밖 클론 가져오기, Typecast·ElevenLabs 클론(T13-b), 공급자 목록 조회, 자동 재시도, 새 DB·환경 변수, Linux 검증, 전역 배포.

### 인수 조건과 테스트 시나리오

1. 공용 이동: 웹 테스트 불변 통과, 옮기기 전 커밋(538df54) 출력과 같은 고정 자료(`filterSaved`·`sortSaved`·`tagKeysOf`·`isSilent`), 페이지 import 도달 불변.
2. `myVoiceRequest`: 두 계정 격리, 소유자 없음 `UNAUTHORIZED`, 5분 넘은 `sending` 읽기(쓰기 0), 없음·남의 것 `null`, 공급자 0회, 데모에서 안전.
3. 클론 만들기: Fish Audio·Gemini 정상(소리 바이트가 서버가 받은 것과 같고 부가 정보는 닿지 않음), 처리 중, 품질 실패, 동의 없음·`--yes` 없음·비대화 0회, 크기(3,000,000·1,000,000과 +1)·형식·길이(경계 10·30·60, 동의 1·20초)·무음·동의 녹음 누락/불필요, 이름 30·31 코드 포인트, 키 없음, 서버 `audio_length` 거절의 글과 기록 해제, 확인 사이에 파일이 바뀌어도 처음 읽은 바이트.
4. 두 번 만들기 막기: 같은 명령 재실행, 같은 이름·다른 원본의 순차 실행과 `sending`이 겹칠 때 0회, 같은 입력의 두 프로세스 동시 실행과 확인 프롬프트에 함께 선 두 프로세스에서 공급자 호출 1회, 200이지만 id 없음(`failed`·`provider_error`) 뒤 재실행 0회, 응답 상태가 `unknown`, 선점 뒤 재검사 조회 실패(기록 해제, 0회), 응답 유실 뒤 재실행 0회와 `resume`, `unknown`·`sending` 줄이 있을 때 0회, `--new`만 새로 만듦, 거절 뒤 기록 해제, 미확인 기록 유지, 다른 사용자·origin 기록 분리.
5. 관리: `check`(처리 중 → 사용 가능, 없어짐), `save`(사용 가능 아님 4), `remove`(확인 없음 0회, 성공, 키 없음·대기 중 429는 행 그대로, 공급자 429는 삭제 대기, 응답 유실 6, 삭제 대기 줄 재시도, `unknown` 줄, 보내는 중, 남의 ID 4), 프리셋이 쓰는 클론의 안내, 지운 뒤 `voices list`에서 사라짐.
6. 보관함: 조건마다와 섞은 조건이 웹 함수와 같다, 정렬 다섯, 모르는 키·ID.
7. 드라마 쉼: 줄·장면·기본 순서, 경계(0, 5, 5.1, 0.05, -1, '1', null), `split --join` 길이, 결합 실패·경로 막힘이면 새 파일 0개, autotag가 쉼을 잃지 않음, generate 지문 불변.
8. `parity.test.ts`, 설치본에서 README대로 재현, T17~T20 테스트 불변(도움말·묶음 모듈 수 변경 제외), 세션·오디오가 출력·기록에 남지 않음.

너비·테마·키보드는 해당 없다(화면 변경 없음).

## 구현과 재사용

| 단계 | 수행자와 파일 | 즉시 검사 |
|---|---|---|
| 1 공용 이동·서버 | `prokit-api-builder`: 이동 표의 새 모듈, 고정 자료, `routers/my-voice.ts`(`myVoiceRequest`)·계약·격리·데모 테스트. 이어서 `prokit-ui-builder`: 웹 `lib` 재수출 | API·웹 전체 테스트, 타입, 빌드 |
| 2 클론 | `prokit-implementer`: `clones.ts`, `paid.ts`·`requests.ts`·`session.ts`(종류 `clones`, 상태 행 일반화), `client.ts`·`output.ts`(`cloneId`)·`files.ts`(바이트 읽기)·`join.ts`(`wavChunks` 내보냄)·`cli.ts` 명령 표, 테스트(모의·실제 라우터 E2E) | CLI 전체 테스트 |
| 3 보관함·쉼·대조 | `prokit-implementer`: `library.ts`·`client.ts`·`cli.ts`, `drama.ts`·`join.ts`, `parity.test.ts`, README·SKILL·TEST | CLI 전체 테스트, 설치본 |
| 4 실행 확인 | `prokit-runtime-checker`: 설치본, 모의 공급자, 임시 PostgreSQL, README 따라 하기 | 시나리오 1~8 |
| 5 리뷰 | `prokit-reviewer` code·security, ponytail-review | 지적 처리 |
| 문서 | Main: `docs/domain/project.md`(`myVoiceRequest`, CLI 행), 기획서 "기능 대조" | |

기존: `myVoiceRouter`(서버 선점·재생·삭제 대기), `paid.ts` `create`·`recover`, `confirmRemoval`·`mutate`, `readCloneWav`·`cloneLengthProblem`. 새 의존·환경 변수·설정 파일 변경 없음. 실제 클론 만들기·확인·지우기는 사용자가 승인한 호출만 한다. 되돌리기: CLI 커밋만 되돌려도 웹과 서버는 그대로다(서버 조회는 읽기 전용 추가).
