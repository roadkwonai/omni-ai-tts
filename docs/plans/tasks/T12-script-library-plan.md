# T12 대본 보관함 — 구현 계획

- 작성: 2026-11-18. 스펙: [T12 스펙](T12-script-library.md)(사용자 확인 2026-11-18 "확인, 계획으로"). 브리프: [대본 보관함](../../briefs/scripts.md), [음성 작업실](../../briefs/studio.md) 18절. ADR: [0010](../../adr/0010-script-library-trigram-search.md).
- 두뇌: agent-skills(planning-and-task-breakdown). 간결성: ponytail. 계층: DB(E) + API(D) + 화면(B) → F.
- 소유자: 로컬 관리자 모드(T14 전). 모든 프로시저는 `protectedProcedure`, 소유자는 `context.ownerId`만.

## 1. 개요

새 표 `script`(종류 `saved`·`recent`)와 분류 연결 표, 프로시저 8개, `/scripts` 화면, 작업실 '대본' 메뉴와 창 넷, 임시 작업의 작업 id·연결된 대본 칸을 만든다. 공급자 호출과 유료 경로는 바꾸지 않는다(최근 보관은 만들기가 요청을 보낸 뒤 따로 부르는 무료 프로시저다).

## 2. 구조 결정

### 2.1 DB (`packages/db/src/schema/script.ts`, ADR 0010)

| 표 | 칸 | 제약·인덱스 |
|---|---|---|
| `script` | `id` uuid pk(defaultRandom), `owner_id` text notNull, `kind` text notNull, `title` text null, `work_id` uuid null, `channel_id` uuid null → `channel.id` `on delete set null`, `work` jsonb notNull, `body` text notNull, `paragraph_count` integer notNull, `char_count` integer notNull, `version` integer notNull 기본 1, `created_at`·`updated_at` timestamptz **precision 3**(ms, 커서가 JS Date와 같은 값이 되게 — 리뷰 P1) 기본 now notNull(`updated_at`은 `$onUpdate`, upsert에서는 `sql\`now()\``로 직접 넣는다) | check `kind in ('saved','recent')`, check `(kind='saved' and title is not null and work_id is null) or (kind='recent' and title is null and work_id is not null)`. 부분 유일 `script_title (owner_id, lower(title)) where kind='saved'`, 부분 유일 `script_recent_work (owner_id, work_id) where kind='recent'`, 목록 `script_owner_list (owner_id, kind, updated_at desc, id desc)`, `script_channel (channel_id)`, GIN `script_title_trgm (title gin_trgm_ops)`, GIN `script_body_trgm (body gin_trgm_ops)` |
| `script_classification` | `script_id` → `script.id` cascade, `classification_id` → `classification.id` cascade | 복합 pk, 역방향 인덱스 `script_classification_classification`(saved_voice_classification과 같은 모양) |

- 확장: `db:generate --custom --name script_trgm`로 빈 마이그레이션을 먼저 만들고 `CREATE EXTENSION IF NOT EXISTS pg_trgm;`만 쓴다. 이어 스키마를 고쳐 `db:generate`로 표 마이그레이션을 만든다(순서: 확장 → 표). 손으로 스냅샷을 고치지 않는다(prokit-db 금지).
- 드리즐 GIN 연산자 클래스는 `index().using("gin", t.body.op("gin_trgm_ops"))` 꼴을 수행자가 설치판 drizzle 문서로 확인한다. 안 되면 보고하고 멈춘다(손 SQL로 우회하지 않는다).
- 파괴적 변경 없음(새 표만). 마이그레이션을 만든 뒤 `db:generate`를 한 번 더 돌려 'No schema changes'를 확인한다(prokit-db migration-flow 2, 리뷰 P15).

### 2.2 API (`packages/api/src/routers/script.ts`, 계약 `script-contract.ts`)

| 프로시저 | 입력 | 출력·오류 |
|---|---|---|
| `scriptList` | `{ kind, q?, channel?: uuid \| "none", category?: uuid[], type?: uuid[], cursor? }` | `{ items: ScriptSummary[], next }`. 저장한 대본은 30개씩 커서(`(updated_at, id) <`), 최근은 커서·거르기 없이 최대 20개 |
| `scriptGet` | `{ id }` | `{ id, kind, title, channelId, classificationIds, version, workId, work }` · NOT_FOUND |
| `scriptCreate` | `{ title, channelId, classificationIds, work }` | `{ id, title, version }` · CONFLICT `duplicate_name` · NOT_FOUND(남의 채널·분류) |
| `scriptSave` | `{ id, version, force?, channelId, work }` | `{ version }` · CONFLICT `stale` · NOT_FOUND(없음·최근 대본·남의 것) |
| `scriptUpdate` | `{ id, title?, channelId?, classificationIds? }` | `{ id }` · 판 그대로 · CONFLICT `duplicate_name` · NOT_FOUND(최근 대본 id 포함) |
| `scriptDuplicate` | `{ id }` | `{ id, title }`(제목 `copyName(name, taken, 100)`, 분류 복사, 판 1) · NOT_FOUND(최근 대본 id 포함) |
| `scriptRemove` | `{ id }` | `{ deleted: true }`(두 종류) |
| `scriptRecordRecent` | `{ workId, channelId, work }` | `{ id }`. 트랜잭션 첫 줄 `pg_advisory_xact_lock(hashtext(owner_id))`(두 탭 동시 만들기의 정리 경합, 리뷰 P9), `onConflictDoUpdate({ target: [ownerId, workId], targetWhere: kind='recent', set: { …, updatedAt: now() } })` 뒤 최근 20개 밖을 지운다 |

분류는 `scriptCreate`·`scriptUpdate`가 바꾼다(따로 프로시저 없음). **저장한 대본만 다루는 셋(저장·고치기·복제)과 저장의 0행 뒤 존재 확인은 모두 `mine()`과 `kind = 'saved'`를 함께 건다**(최근 대본 id는 NOT_FOUND, 리뷰 P2).

- `ScriptSummary` = `{ id, kind, title, preview(left(body,160)), paragraphCount, charCount, channelId, classificationIds, version, updatedAt }`. 목록 select는 `work`를 고르지 않는다(작업 JSON을 읽지 않는다, 스펙 5절).
- `scriptWorkSchema`(zod): `{ defaultVoice: voiceSetup|null, gap: 0~5, paragraphs: 1~200개 { id(`readWork`와 같은 `/^[A-Za-z0-9_-]{1,100}$/`, 작업 안에서 겹치지 않음 refine — readWork가 바꿔 끼우는 id를 서버가 받지 않게, 리뷰 R2-4), text 0~10,000자, gap?, voice?, speaker? 1~20자, fixes? { text 0~10,000자, decisions { start, end 정수, original 1자 이상, choice enum, reading? }(개수와 읽기 길이에 더 좁은 상한을 두지 않는다. 글과 같은 UTF-16 길이 거르기와 작업 2 MB 상한이 막는다) } }, speakers?: 0~20개 { name 1~20자, voice|null } }`. `voiceSetup` = `{ provider: providerIdSchema, voiceId 1~200자, settings: record(unknown) }`. 비지 않은 문단 1개 이상, `JSON.stringify` UTF-8 2 MB 이하를 refine으로 막는다. 채널은 작업 JSON에 넣지 않고 칸 `channel_id`에 둔다(`Work.channelId`는 열 때 칸에서 채운다).
- `body` = 문단 글을 빈 줄로 이은 것(NFC), `char_count` = 코드 포인트 수 합, `paragraph_count` = 비지 않은 문단 수. 서버가 저장할 때 만든다.
- 검색: `q`(1~100자, 앞뒤 공백 제거, NFC)를 `%`·`_`·`\` 이스케이프해 `(title ILIKE p ESCAPE '\' OR body ILIKE p ESCAPE '\')`. 분류: 그룹 안 OR(`EXISTS … classification_id = ANY(category)`), 카테고리·타입 그룹끼리 AND(성우 보관함 `filterSaved`와 같다). 카테고리·타입 구분은 받은 id를 그대로 쓰고 서버는 그룹을 묻지 않는다(화면이 그룹별로 나눠 보낸다).
- 판 조건 저장: `UPDATE … SET version = version + 1 WHERE id AND owner AND kind='saved' AND (force OR version = :version) RETURNING version`. 0행이면 같은 소유자·id·`kind='saved'` 행이 있는지 한 번 더 봐서 있으면 CONFLICT `stale`, 없으면 NOT_FOUND.
- 목록 커서: `(updated_at, id) < (:at, :id)`. `updated_at`이 ms 정밀도라 응답의 Date와 DB 값이 같다(리뷰 P1). 같은 시각 31행 테스트로 2쪽이 비지 않는지 본다.
- 제목: 새 `titleSchema`(원문 1,000자 상한, T6 `cleanText` 뒤 1~100 코드 포인트). `copyName(name, taken, max = NAME_MAX)`로 상한을 인자로 넓힌다(프리셋 소비자는 그대로, 리뷰 P7). 유일 위반은 `stored`/`isUniqueViolation("script_title")` → CONFLICT `duplicate_name`(preset.ts와 같은 길). 채널은 `ownChannel`(preset.ts 모듈 안 함수 — 대본 라우터가 쓰도록 같은 파일에서 export하거나 작은 공용 위치로 옮긴다), 분류는 `savedVoiceLinks`의 내 것 세기 패턴을 재사용한다.
- 상한 규칙 공유(리뷰 P12): zod 없는 `packages/api/src/script-rules.ts`(classification-rules.ts처럼)에 `scriptWorkProblem(work)`(비지 않은 문단 1~200, 글 10,000자, UTF-8 2 MB, U+0000 없음)를 두고, 서버 refine과 화면 '대본' 메뉴 잠금이 같이 쓴다. 크기는 `new TextEncoder().encode(JSON.stringify(work)).length`(Buffer 아님 — 브라우저 묶음), NUL은 직렬화한 글 전체에서 한 번 본다(설정·화자 이름의 NUL도 BAD_REQUEST). import는 `./providers/trial-options`뿐이다(packages/api `./*` export, classification-rules.ts 선례, 리뷰 R2-5).
- 입력 상한(리뷰 R2-6): `classificationIds` ≤ 50, 목록의 `category`·`type` 각각 ≤ 50. 복제의 `copyName` 겹침 목록은 `kind = 'saved'` 제목만 읽는다(최근 대본 제목 null).
- 라우터 등록: `routers/index.ts`에 `...scriptRouter`(주석에 프로시저 수 8).

### 2.3 화면

- **임시 작업**(`lib/paragraph-script.ts` `Work`, `lib/studio-draft.ts`): `Work`에 `id?: string`과 `linked?: { scriptId, title, version, fingerprint }`를 더한다. `readWork`는 두 칸이 올바를 때만 그대로 두고, 없거나 깨졌으면 칸을 비운다(새 id를 만들지 않는다 — `checkedWork`가 readWork를 두 번 불러 견주므로 결정적이어야 한다, 기존 왕복 테스트 그대로, 리뷰 P3). 새 id는 WorkProvider가 처음 읽을 때와 바꾸기·전체 바꾸기에서 `work.id ?? crypto.randomUUID()`로 준다. `writeWork`는 그대로 저장한다. 요청(`paragraphRequest`)과 조합 키는 두 칸을 읽지 않는다(회귀 테스트, 수용 기준 13).
- **지문**(`lib/script-work.ts` 새 순수 모듈): `fingerprintOf(work)` = `fnv1a(writeWork(readWork(writeWork(id·linked를 뺀 work), null)))`. readWork가 모든 객체를 고정 순서로 다시 만들고 값도 정규화하므로(태그 공백, 쉼) 서버 jsonb 키 순서나 화면 상태의 키 순서와 상관없이 같다. 키 정렬 함수는 따로 만들지 않는다(리뷰 P4). **지문 입력은 늘 `channelId`가 들어 있는 `Work`에서 `id`·`linked`만 뺀 것이다**(리뷰 R2-1). 열 때는 `fromScript(row)`(칸 `channel_id`로 `channelId`를 채운 것, 성우 확인 전)로, 저장 때는 `toScriptWork`에 넘긴 `Work`(보낸 `channelId` 포함)로 뜬다. `toScriptWork`의 출력(채널 없음)으로 뜨지 않는다. Task 3 테스트: 채널 있는 작업을 저장 지문으로 뜬 뒤 바로 다시 뜨면 같다. `appendWork(target, source)`(이어 넣기: 문단 id 새로, 화자 합치기·20명, 200문단, 넣지 못한 수 돌려줌), `toScriptWork(work)`(서버로 보낼 모양: `id`·`linked`·`channelId` 뺌), `fromScript(row)`(받은 대본 → `Work`. `channelId`는 칸 `channel_id`, `id`는 `kind='recent'`이면 `row.workId`(그 최근 대본을 이어 쓴다, 스펙 4.3), 저장 대본이면 비움(provider가 새로 준다, 리뷰 R3-4). `checkedWork`로 성우 확인은 provider가 한다).
- **WorkProvider**(`components/paragraph-provider.tsx`): `linked`·`dirty`는 `WorkMeta` 밖의 상태·ref에 두고 persist·writeWork에서만 합친다(meta에 두면 저장마다 요청 표를 다시 만들고 무료 찾기를 예약한다, 리뷰 P15). 구체적으로(리뷰 R2-3):
  - `WorkMeta = Omit<Work, "paragraphs" | "linked">`.
  - `work.linked`는 첫 읽기(530-546)에서만 `linkedRef`로 옮긴다. `restore()`는 linked를 건드리지 않고, 늦게 온 성우 목록 길(516)은 지금 `linkedRef`를 그대로 둔다. 연결을 바꾸는 곳은 `replaceWork`·`markSaved`·연결 비우기 셋뿐이다.
  - 첫 `restore` 뒤 지문으로 dirty를 한 번 계산한다(새로 고침 뒤에도 '저장 안 됨'과 미저장 경고가 남는다).
  - 첫 읽기에서 `work.id`가 없어 새로 주면 바로 `saveSoon()`(새로 고칠 때마다 id가 바뀌어 최근 대본이 갈라지지 않게).
  - 상한 잠금(`scriptWorkProblem`)과 지문은 같은 300ms 지연 안에서 계산한다(렌더마다 직렬화하지 않는다, 리뷰 R2-5).
  - 붙여 넣기 '전체 바꾸기'는 새 작업 id를 받고 linked는 그대로 둔다(저장 안 됨으로 보인다). 되돌리면 문단과 함께 이전 작업 id도 되돌린다(리뷰 R2-7, 되돌리는 길은 위 '되돌리기 알림').
  - **새 대본으로 저장의 채널**(리뷰 R3-1): 성공하면 먼저 `setChannelId(고른 채널)`로 작업 채널을 바꾸고(채널 기본 프리셋 '불러오기' 창은 띄우지 않는다 — 그것은 채널 고르기 메뉴의 길이다), 같은 Work(`{ ...work, channelId: 고른 채널 }`)로 지문을 떠 `markSaved`한다. '저장'(연결된 대본 덮어쓰기)은 작업 채널을 그대로 보낸다.
  - 최근 보관은 `meta.current.id`가 비었으면 부르지 않는다(타입상 선택 칸). `replaceWork(work, { linked })`, `appendWork(source)`, `markSaved(linked)`. 새 Provider는 만들지 않는다.
  - **되돌리기 알림은 하나뿐이다**(리뷰 R3-2): 알림은 자식 `ParagraphsProvider`의 `undoable`(310-316, 알림 하나·한 단계)로만 띄운다. 화자 빼기 선례(paragraph-rails.tsx:394-417의 `useParagraphs().undoable`)처럼, 넣기 창과 붙여 넣기 창이 바꾸기 전 작업(문단·id·linked·화자·기본 성우·쉼·채널)을 잡아 두고 `undoable(message, () => work.replaceWork(previous, { linked: previousLinked }))`를 부른다. 그래서 앞선 문단 편집 알림은 바꾸기 순간 닫힌다. 붙여 넣기 '전체 바꾸기'도 `edit(fn, { message })`에서 이 길로 옮긴다(이어 넣기는 지금 길 그대로).
  - **되돌린 뒤 포커스**(리뷰 4회차 medium): 되돌리기 콜백은 화자 빼기 선례대로 `flushSync(() => work.replaceWork(previous, …))` → 알림 버튼 `activeElement.blur()` → 되살린 첫 문단(없으면 마지막 문단)의 대본 칸으로 포커스, 숫자 검수 창이 열려 있으면 창 안에 둔다(F12-2). 지금 `ParagraphsProvider.restore`(291-307)의 포커스 부분을 함수로 꺼내 이 콜백과 함께 쓴다(같은 규칙을 두 벌 쓰지 않는다). 그 함수는 `ParagraphsProvider` 안(`edits` memo)에 두고 `useParagraphs()`의 `undoable(message, apply)`가 쓴다. 되돌리는 순간의 문단(`now`)은 창의 그리기 값이 아니라 `latest` ref에서 읽는다(창은 이미 닫혀 있다, 5회차 low). 포커스 함수 `focusText`는 기존 `components/paragraph-focus.ts`의 것을 쓴다. 넣기 창의 바꾸기·이어 넣기 되돌리기도 같다. 31행 QA: 키보드로 붙여 넣기 전체 바꾸기와 넣기를 되돌려 포커스 자리를 본다.
  - `restore()`는 `const { paragraphs, linked: _linked, ...rest } = work`로 linked를 명시적으로 빼고 meta에 넣는다(rest 객체는 타입이 남는 칸을 막지 않는다, 리뷰 R3-3). persist와 지문은 `linkedRef`만 읽는다.
  - 판정은 순수 함수로 lib에 둔다(리뷰 R3-5): `dirtyOf(work, linked) → boolean`(linked 없으면 false), `nextIdOf(work) → string`(있는 id 그대로, 없으면 uuid), `afterReplace(next, linked) → { work: id를 채운 Work, linked }`(저장 대본이면 그 linked, 최근 대본이면 undefined. 붙여 넣기 전체 바꾸기는 `next.id`를 비워 넘겨 새 id를 받는다 — 테스트: id 없는 next는 새 id, linked는 그대로, 5회차 low)를 `lib/script-work.ts`에서 테스트하고(Task 3), provider는 그것을 부르기만 한다. provider 연결 동작(새로 고침 뒤 dirty 유지, 늦은 성우 목록의 linked 유지, 전체 바꾸기 되돌리기의 id 복원, 앞 알림 닫힘, run당 최근 보관 1번)은 21행 런타임 확인과 31행 QA의 단계로 넣는다(vitest에 DOM 환경이 없다).
- **최근 보관**(`components/paragraph-make.tsx`): `on`의 `case "sent"`(요청을 보낼 때, 스펙 4.5 — 보낸 뒤 실패·미확인이어도 보관)에서 run마다 한 번 `void client.scriptRecordRecent({ workId: meta.current.id, channelId: meta.current.channelId, work: toScriptWork({ ...meta.current, paragraphs: paragraphs.current }) }).catch(() => {})`. 카드 만들기의 한 문단 조각이 아니라 작업 전체를 보낸다. await·재시도·알림 없음, catch는 꼭 둔다(처리하지 않은 거부는 오류 예산에 걸림, 리뷰 P6). 작업이 상한을 넘으면(`scriptWorkProblem`) 부르지 않는다.
- **'대본' 메뉴와 창**(새 `components/script-menu.tsx`, `script-save-dialog.tsx`, `script-insert-dialog.tsx`, `script-guard-dialogs.tsx`): 브리프 studio.md 18절. 머리 `actions` 맨 앞. 충돌·미저장은 `AlertDialog`.
- **주소로 열기**(새 `components/script-opener.tsx`): `useSearchParams`로 `script`를 읽고, WorkProvider의 임시 작업 복원(`restored`)이 끝난 뒤 ref로 한 번만(StrictMode 두 번 실행 막음, 리뷰 P14) 넣기 창 2단계를 연 뒤 `history.replaceState`로 주소에서 뺀다(voice-library의 Native History API 길). 이 컴포넌트만 `<Suspense fallback={null}>`로 감싸 `/studio`의 나머지는 정적 그리기를 유지한다(번들 문서 use-search-params 'Prerendering').
- **분류 고르기**: 지금 `ClassPicker`는 성우에 바로 붙이는 mutation이 안에 있다. 검색·그룹·체크·'+ 만들기'를 그리는 부분을 controlled `ClassChecklist({ groups, selected: Record<Group, string[]>, onToggle })`로 꺼내고, `ClassPicker`는 그것에 성우 연결을 붙인 모양으로 둔다(vercel-composition-patterns: boolean 옵션 대신 합성). 대본 창은 `groups={['category','type']}`(채널은 따로 하나 고른다, 리뷰 P11). 소비자: 성우 패널(`/casting`과 `/voices` 패널 둘 다 같은 SavedSection) + 대본 창 둘. 성우 패널 동작은 그대로여야 한다(기존 `class-picker.test.ts`는 createAndFind만 보므로 `/casting`·`/voices` 패널 분류 붙이기 QA 회귀를 31행에 넣는다).
- **`/scripts`**(새 `app/(app)/scripts/page.tsx` Server Component + `components/script-library.tsx`): voices 페이지처럼 `PageHeader` + `<Suspense>`(조건이 주소 쿼리). 조건 줄은 `VoiceConditions`(axes: 채널 single, 카테고리·타입 multi)를 재사용하고 `LibraryFilters`(성우 전용 보기·공급자 축)는 쓰지 않는다. `VoiceConditions`의 `<search aria-label="성우 찾기">`가 고정이라 `label` prop(기본값 '성우 찾기')을 더한다(소비자 one-list·library-filters 그대로, `/casting`·`/voices` 조건 줄 회귀, 리뷰 P10). 목록은 `...QUIET`(retry 끔·전역 알림 끔)로 부르고 대본을 바꾸는 프로시저 뒤에 `orpc.scriptList.key()`를 무효화한다. 목록은 `orpc.scriptList.infiniteOptions`(server-voice-list의 `getNextPageParam: last => last.next` 길)와 끝 감시 줄(`IntersectionObserver`) + '더 보기'. 줄은 `content-visibility: auto`와 `contain-intrinsic-size`.
- **목록 훅 공유**: 보관함 화면과 넣기 창이 같은 `useScriptList(kind, filters)`(같은 파일 `script-library.tsx`에서 export)를 쓴다. 줄 그리기는 다르다(보관함은 동작 버튼, 창은 라디오).
- **메뉴**: `app-nav.tsx` `UPCOMING_ITEMS`의 '대본 보관함'을 `OPEN_ITEMS`의 '드라마 작업실' 다음(`bar: false`, `FileText`, `/scripts`)으로 옮긴다.
- **문구**: `lib/script-text.ts`(`SCRIPT_TEXT`)에 브리프 7절과 18절 문구를 모은다.

### 2.4 문서 (Main)
- `docs/domain/project.md`: 화면 `/scripts`, 작업실 '대본' 메뉴, API 8개, 데이터 `script`·`script_classification`(용어 칸), 주요 흐름(저장·열기·넣기·충돌).
- 로드맵 T12 상태, `tasks/todo.md` 백로그 T12-01(드라마 장면 저장), Q-02 정리.

## 3. 태스크

### Task 1: DB 표와 마이그레이션 (prokit-db-builder)
- **수용:** `script`·`script_classification`이 2.1대로 생기고 `schema/index.ts`에서 내보낸다. 확장 → 표 순서의 마이그레이션 둘. 생성 SQL에 DROP·타입 축소 없음. FK 인덱스·부분 유일·GIN 인덱스가 SQL에 있다.
- **확인:** `pnpm --filter @tts-pilot-app/db db:generate` 출력, 다시 돌려 'No schema changes', 생성 SQL 검토, Main이 로컬 DB와 테스트 DB(`tts-pilot-app_test`)에 `db:migrate` 적용(8행), `\d script`.
- **읽을 스킬:** `prokit-db`, `.agents/skills/supabase-postgres-best-practices/SKILL.md`.
- **파일:** `packages/db/src/schema/script.ts`(새), `packages/db/src/schema/index.ts`, `packages/db/src/migrations/<두 폴더>`.
- **의존:** 없음. 크기 S.

### Task 2: 계약과 프로시저, 테스트 먼저 (prokit-api-builder)
- **수용:** 2.2의 8개 프로시저와 `script-rules.ts`. 단위 테스트(`script.test.ts`): 만들기·같은 제목·판 조건 저장·`stale`·`force`·지워진 대본 NOT_FOUND·최근 대본 id로 저장·고치기·복제 → NOT_FOUND·복제 이름(100자)과 분류 복사·목록 커서(같은 시각에 넣은 31개, 2쪽 1개)·U+0000 거절·검색 `%`·`_`·1자·거르기 그룹 OR/AND·목록에 `work` 없음·최근 upsert와 21번째 정리·상한(201문단, 10,001자, 2 MB) 거절·고치기가 판을 올리지 않음. 격리 테스트(`script.isolation.test.ts`): B가 A의 대본을 받기·저장·고치기·복제·지우기 → NOT_FOUND, A 목록 그대로, B가 A의 채널·분류로 만들기 → NOT_FOUND, 최근 보관은 소유자별로 따로 20개, 소유자 없음(`ownerId: null`)이면 `scriptRouter`가 export한 키 모두(8개) UNAUTHORIZED, A는 자기 대본을 정상 처리.
- **확인:** `TEST_DATABASE_URL=… pnpm --filter @tts-pilot-app/api test`(skipped가 아니라 passed 수), `pnpm check-types`.
- **읽을 스킬:** `prokit-api`(references/ownership-test.md), 두뇌 `agent-skills:test-driven-development`(Skill), `.agents/skills/supabase-postgres-best-practices/SKILL.md`(쿼리).
- **파일:** `packages/api/src/routers/script.ts`·`script.test.ts`·`script.isolation.test.ts`(새), `packages/api/src/script-contract.ts`·`script-rules.ts`(+test, 새), `packages/api/src/preset-contract.ts`(+test, `copyName` 상한 인자), `routers/preset.ts`(`ownChannel` export만), `routers/index.ts`.
- **의존:** Task 1. 크기 M.

### 체크포인트 A (Task 1·2 뒤)
- API 테스트·격리 테스트 passed, check-types 0, prokit-reviewer(db)·(code)·(security) 행(11·16·직접 더한 security 행). security 범위: 8개 모두 protectedProcedure와 context.ownerId만, 모든 select·update·delete에 owner(·kind) 조건, 만들기·저장·고치기·최근 보관의 ownChannel, 분류 내 것 세기, 작업 jsonb 검증(2 MB·NUL), 목록 출력에 work·owner_id 없음, 로그 한 줄 규칙(리뷰 P5, prokit-api 불변식 7).

### Task 3: 작업 모델과 순수 함수 (prokit-ui-builder, Task 1·2와 병렬 가능)
- **수용:** `Work.id`·`Work.linked`, `readWork` 검사(id·linked가 없는 옛 작업을 그대로 읽는다. 두 칸은 올바를 때만 두고 아니면 비운다. 새 id를 만들지 않는다 — provider가 `work.id ?? crypto.randomUUID()`로 준다. 옛 작업에서 `checkedWork`가 null인 테스트, 리뷰 R2-2), `lib/script-work.ts`(`fingerprintOf`·`appendWork`·`toScriptWork`·`fromScript`·`dirtyOf`·`nextIdOf`·`afterReplace`, 계약은 2.3), `lib/script-text.ts`. 테스트: 지문(키 순서 무관, `id`·`linked` 무관, 되돌리면 같음), 이어 넣기(id 새로·화자 합치기·21번째 화자 비움·200문단 자름과 넣지 못한 수·끝 빈 문단 자리), 요청 바이트 동일 회귀(`paragraphRequest`·`comboSignature`가 두 칸에 영향 없음).
- **확인:** `cd apps/web && npx vitest run --dir src`, `pnpm check-types`.
- **읽을 스킬:** `agent-skills:test-driven-development`(Skill), `.agents/skills/vercel-react-best-practices/SKILL.md`.
- **파일:** `lib/paragraph-script.ts`, `lib/studio-draft.ts`(+test), `lib/script-work.ts`(+test, 새), `lib/script-text.ts`(새).
- **의존:** 없음(서버 계약 타입은 Task 4에서 맞춘다). 크기 M.

### Task 4: WorkProvider 연결·바꾸기·이어 넣기·최근 보관 (prokit-ui-builder)
- **수용:** 2.3 WorkProvider와 최근 보관. 저장 안 됨이 지문으로 켜지고 꺼진다. 바꾸기·이어 넣기 되돌리기 10초. 붙여 넣기 '전체 바꾸기'가 작업 id를 새로 받고 되돌리면 이전 id로 돌아간다. 새로 고침 뒤에도 dirty가 남고, 늦게 온 성우 목록이 linked를 지우지 않는다(리뷰 R2-3). 만들기 한 run에 최근 보관 한 번(begin의 run 단위 한 번 표시), 실패해도 만들기 계속.
- **확인:** vitest(`lib/script-work.ts`의 판정 함수 `dirtyOf`·`nextIdOf`·`afterReplace`), check-types, `toScriptWork(work)`가 `scriptCreate` 입력 타입에 맞는지 타입으로 확인. provider 연결 동작은 21행·31행 단계(가짜 RPC로 run당 `scriptRecordRecent` 요청 수 1, 앞 알림 닫힘, 새로 고침 뒤 dirty, 늦은 성우 목록 뒤 linked, 성우를 비운 대본을 열면 바로 '저장 안 됨' — 스펙 문구대로).
- **읽을 스킬:** `.agents/skills/vercel-react-best-practices/SKILL.md`, `.agents/skills/tts-provider/SKILL.md`(만들기 경로를 건드린다).
- **파일:** `components/paragraph-provider.tsx`, `components/paragraph-make.tsx`, `components/paragraph-paste-dialog.tsx`.
- **의존:** Task 2·3. 크기 M.

### Task 5: 분류 체크 목록 꺼내기와 '대본' 메뉴·저장 창 (prokit-ui-builder)
- **수용:** `ClassChecklist` 추출 뒤 캐스팅 패널 동작 그대로(class-picker 테스트 통과). 머리 '대본' 메뉴(18.1), 새 대본으로 저장 창(18.2, 고른 채널로 작업 채널을 바꾼 뒤 지문 — 다른 채널로 저장한 직후 '저장 안 됨'이 없다), 충돌·지워진 대본 창(18.5), 저장(판 조건).
- **확인:** vitest, check-types, biome(바꾼 파일), build. 21·31행 단계: 작업 채널과 다른 채널로 새 대본으로 저장 → 채널 고르기가 고른 채널이고, '저장 안 됨'이 없고, 프리셋 '불러오기' 창이 뜨지 않는다.
- **읽을 스킬:** `.agents/skills/vercel-composition-patterns/SKILL.md`, `.agents/skills/vercel-react-best-practices/SKILL.md`, `.agents/skills/shadcn/SKILL.md`, impeccable `reference/craft-floor.md`(편집 직전).
- **파일:** `components/class-picker.tsx`, `components/class-checklist.tsx`(새), `components/script-menu.tsx`·`script-save-dialog.tsx`·`script-guard-dialogs.tsx`(새), `components/paragraph-studio.tsx`(머리 actions 한 줄).
- **의존:** Task 4. 크기 M(새 파일 셋 + 고침 둘).

### Task 6: 넣기 창과 주소로 열기 (prokit-ui-builder)
- **수용:** 넣기 창 두 단계(18.3, 라디오 목록·무한 스크롤·세그먼트·경고 셋), 미저장 경고(18.4), `/studio?script=` 열기 뒤 주소에서 뺌, `/studio`가 build에서 정적 그대로(○).
- **확인:** vitest, check-types, biome, build 출력의 `/studio` 표시.
- **읽을 스킬:** Task 5와 같음 + `prokit-web`(use-search-params 'Prerendering' 문서).
- **파일:** `components/script-insert-dialog.tsx`·`script-opener.tsx`(새), `components/script-guard-dialogs.tsx`, `components/paragraph-studio.tsx`(Suspense 한 줄).
- **의존:** Task 5, Task 7의 `useScriptList`(Task 7을 먼저 하거나 훅만 Task 6에서 만들고 Task 7이 쓴다 — 수행자 한 명이 차례로 한다). 크기 M.

### Task 7: `/scripts` 화면과 메뉴 (prokit-ui-builder)
- **수용:** 브리프 scripts.md 5~7절 전부(구역 전환·조건 줄·두 목록·줄 동작·창·상태 9개·무한 스크롤·주소 조건), 메뉴 열기. 목록 응답에 `work` 없음을 네트워크로 확인(QA).
- **확인:** vitest, check-types, biome, build(`/scripts` 정적 + Suspense).
- **읽을 스킬:** Task 5와 같음.
- **파일:** `app/(app)/scripts/page.tsx`(새), `components/script-library.tsx`(새), `components/app-nav.tsx`, `components/voice-conditions.tsx`(`label` prop만).
- **의존:** Task 2·5(창 부품). 순서는 Task 5 → 7 → 6(넣기 창이 `useScriptList`를 쓴다).

### 체크포인트 B (Task 3~7 뒤)
- 전체 vitest·check-types·biome 기준 10·build 0, 런타임 확인(21행), 디자인 리뷰·감사(23·24), 사용자 흐름 QA(31, 가짜 RPC, 유료 0).

## 4. 순서와 병렬

Task 1 → 2(API) 와 Task 3(화면 lib)을 병렬로 둔다(파일 겹침 없음: packages vs apps/web/src/lib). 그다음 4 → 5 → 7 → 6을 한 수행자가 차례로 한다(provider·studio 파일이 겹친다).

## 5. 대조표 행 대응

| 행 | 할 일 |
|---|---|
| 5 | 구현 방식: 위 위임 표 |
| 6~11 | Task 1, Main이 로컬·테스트 DB 적용(8), Neon N/A(9, .neon 없음), 파괴적 변경 없음(10), prokit-reviewer(db)(11) |
| 12~16 | Task 2. 12행 계약 위치 `script-contract.ts`, 14행 격리 테스트 |
| 17~18 | 완료(브리프) |
| 19~22 | Task 3~7, 22행 스크롤 측정은 `/scripts` 120개 목록(무한 스크롤·content-visibility) |
| 23~27 | `/scripts`·`/studio` critique·audit·polish·재확인, DESIGN.md merge(새 부품 항목) |
| 28~32 | 통합 확인, 공통화 점검(ClassChecklist·useScriptList), 최종 리뷰, QA, 수정 |
| 33 | 문서 2.4 |

## 6. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| 드리즐이 `gin_trgm_ops`나 부분 유일 인덱스 SQL을 다르게 만듦 | 중 | Task 1에서 생성 SQL을 읽고, 맞지 않으면 멈추고 보고(손 SQL 금지) |
| 테스트 DB에 확장 권한 없음 | 중 | 로컬 컨테이너의 postgres 사용자라 생성 가능. 확인 결과를 8행에 적는다 |
| 지문 비교가 잘못돼 '저장 안 됨'이 늘 켜짐 | 중 | 지문은 `readWork` 정규화를 거친 writeWork 한 정의(2.3), 테스트에 태그 끝 공백·쉼 칸 추가 순서·쓰기→읽기 왕복 |
| ClassPicker 추출이 캐스팅 패널을 깨뜨림 | 중 | 기존 테스트 + QA 회귀(캐스팅 패널 분류 붙이기) |
| 최근 보관이 만들기 경로 시간을 늘림 | 낮 | 기다리지 않음. 실패 무시 |
| `/studio`가 `useSearchParams` 때문에 동적 그리기가 됨 | 중 | opener만 Suspense. build 출력으로 확인 |
| 큰 작업(2 MB)을 매 만들기마다 최근 보관으로 보냄 | 낮 | run마다 한 번. 개인 로컬 규모 |

## 7. 열린 질문

없음(스펙 2절 확정).

## 8. 계획 리뷰 (2026-11-18)

prokit-reviewer(plan) 1회차: changes-required, max=medium, 지적 15(medium 5·low 10), security 행 필요. 모두 코드로 확인하고 반영했다(기각 0).
- P1 커서 ms 정밀도 → `updated_at` precision 3, 같은 시각 31행 테스트. P2 최근 대본 id → 저장·고치기·복제·존재 확인에 `kind='saved'`. P3 readWork 결정성 → 새 id는 provider가. P4 지문 정의 → readWork 정규화 한 정의. P5 security 행 → 대조표에 직접 더함(체크포인트 A).
- P6 최근 보관 시점 → `case "sent"`, 작업 전체, catch. P7 `copyName` 상한 인자·`titleSchema`. P8 프로시저 8개. P9 upsert `targetWhere`·`now()`·advisory lock. P10 `VoiceConditions` `label`. P11 `ClassChecklist` `groups`·회귀 두 곳·브리프 18.2 이름. P12 `script-rules.ts` 공유 상한·NUL. P13 GLOSSARY 최근 대본 채널. P14 opener가 `restored` 뒤 한 번. P15 notNull·dbGenerate 재확인·linked는 meta 밖·목록 무효화·QUIET.

2회차: changes-required, max=medium, 앞 지적 P1·P2·P5~P14 해결 확인, P3·P4·P15 부분 → 새 지적 7(medium 3·low 4), 모두 반영(기각 0).
3회차: changes-required, max=medium, R2-1~R2-6 해결, R2-7은 동작만 있고 길이 없음 → 새 지적 5(medium 2·low 3) + 메모 3, 모두 반영(기각 0).
5회차: **approve, max=low, integration_acceptance accept**(계획 sha256 8c089fc2399a5922…). low 2 반영(재리뷰 불필요): 되돌리기 포커스 함수는 ParagraphsProvider 안에서 `latest` ref로 `now`를 읽음, 붙여 넣기 전체 바꾸기는 `next.id`를 비워 afterReplace.

4회차: changes-required, max=medium, R3-1~R3-4 해결, R3-5 대부분 → 지적 3(medium 1·low 2) 반영: 되돌린 뒤 포커스(restore의 포커스 부분을 함수로 꺼내 공유), 판정 함수 셋을 Task 3 수용·계약에 넣음, Task 5의 채널 저장 확인 단계.

- R3-1 새 대본으로 저장 때 setChannelId 먼저, 같은 Work로 지문. R3-2 되돌리기 알림은 ParagraphsProvider `undoable` 하나로(화자 빼기 선례), 붙여 넣기 전체 바꾸기도 그 길. R3-3 restore가 linked를 명시적으로 뺌. R3-4 `fromScript`의 id(최근은 workId). R3-5 판정을 lib 순수 함수로, provider 연결은 21·31행 단계. 메모: 최근 보관 id 비면 건너뜀, 성우 비운 대본 열기 QA, 2.3 중복 문장 삭제.

- R2-1 지문 입력에 늘 channelId(열기 `fromScript`, 저장은 넘긴 Work). R2-2 Task 3 수용에서 'id 생김' 삭제. R2-3 WorkMeta에서 linked 뺌·restore는 linked 안 건드림·첫 읽기 dirty·새 id 즉시 저장. R2-4 서버 문단 id를 readWork와 같은 규칙·겹침 금지. R2-5 TextEncoder·NUL 전체·지연 안 계산. R2-6 분류 50·목록 거르기 50·복제 겹침 목록 saved만. R2-7 붙여 넣기 전체 바꾸기는 새 id·linked 유지·되돌리면 id도.
