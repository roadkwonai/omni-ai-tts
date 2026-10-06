# T6 채널·분류 관리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/classes` 한 화면에서 채널·카테고리·타입 항목을 만들고, 이름·메모(채널은 URL도)를 고치고, 지운다. 새로 고침 뒤에도 남고 다른 소유자의 항목은 닿지 않는다.

**Architecture:**
- `packages/db`: `channel`과 `classification`(kind `category`·`type`) 표를 더한다. 같은 그룹 안 대소문자 무시 중복은 `lower(name)` 유니크 인덱스가 막는다.
- `packages/api`: 세 파일을 둔다.
  - `classification-rules.ts`: 화면과 함께 쓰는 순수 규칙. import는 `providers/trial-options`의 글자 함수뿐이다.
  - `classification-contract.ts`: zod 계약.
  - `routers/classification.ts`: 얇은 프로시저 8개. 이름 인덱스 유니크 위반(23505)은 `CONFLICT`로 바꾼다.
- 화면: `/classes` 페이지 아래 `ClassesBoard`가 조회 둘(채널, 카테고리·타입)을 든다. 세 `ClassGroup`이 각자 입력 창(`ClassFormDialog`)과 삭제 확인(`ClassDeleteDialog`)을 열 때만 마운트한다. 정렬, 문구, 오류 분류, 지운 뒤 포커스 행은 순수 함수 `lib/classes-view.ts`에 둔다.

**Tech Stack:** Next.js 16.3 App Router(`typedRoutes`), React 19.3(React Compiler), oRPC 1.15.4(`CONFLICT` 409), TanStack Query 5.103, zod 4.6.5, drizzle-orm·drizzle-kit 1.0.0-rc.4(식 유니크 인덱스, `check`), Postgres 18(로컬 5433), vitest 5, shadcn `base-lyra`(Base UI 1.8.0), Tailwind CSS 4, Biome 2.

**Spec:** [T6 스펙](T06-channels-and-classifications.md)(사용자 확인 2026-10-06 "확인, 계획으로", '계획 리뷰에서 바꾼 것' 표 포함, 구속력 있는 정본), 화면 브리프 `docs/briefs/classes.md`(대조표 17행에서 쓰고 사용자 확인. Task 4·5·6·7 전에 있어야 한다), [로드맵 T6](../implementation-roadmap.md), `GLOSSARY.md`(채널·분류·카테고리·타입).

**계획 확인:** 2026-10-06 사용자 확인("구현 진행해"). **실행 방식(4행):** subagent-driven-development(태스크마다 `bts-implementer`, 태스크 리뷰 `bts-reviewer`, 커밋 없이 tree SHA 경계).

## 계획 리뷰에서 바꾼 것 (2026-10-06)

대조표 3행. 리뷰 셋을 나란히 돌렸고(읽기 전용 서브에이전트), 사용자 질문은 권고안이 붙은 지적으로 받았다.
- plan-eng-review: approve-with-fixes. 별도 작업 트리에서 계획 코드를 실행했다.
- plan-design-review: 6/10, approve-with-fixes.
- ponytail-review: net -100줄.

사용자 결정(AskUserQuestion 2026-10-06)은 네 건이다. 행 버튼은 아이콘, 지운 뒤 포커스는 다음 행, 메모는 2~3줄 칸, 값을 바꾼 동안 바깥 누르기로 닫지 않음. 스펙에는 '계획 리뷰에서 바꾼 것' 표로 옮겼다.

| ID | 판정 | 내용 |
|---|---|---|
| E1 | 반영 | `saveItem` 반환 꼴을 `Promise<{ name: string }>`로 좁힌다(두 프로시저 결과의 합집합이 채널 타입으로 추론돼 Task 6 타입 검사가 실패했다, 실행 확인) |
| E2 | 반영 | 생성 dialog의 `sm:max-w-sm`이 `max-md:*`를 이겨 640~767px 시트가 384px로 붙는다(컴파일 확인). Task 4에서 dialog.tsx를 다시 쓴다. 시트는 기본, 가운데 창은 `md:`에서. QA에 700px |
| E3 | 반영 | TTY 없는 셸의 `shadcn add`는 덮어쓰기 질문에서 아무 파일도 만들지 않고 exit 0이다(`--yes`도 같음, 실행 확인). `yes n \| … && test -f …` |
| E4 | 반영 | 저장 중 칸을 `disabled` 대신 `readOnly`로 둔다(TanStack 상태 알림이 `setTimeout 0`이라 catch 시점에 칸이 아직 disabled라 포커스가 무시된다). 삭제 창 '취소'는 막지 않고, 실패 뒤 '취소'로 포커스 |
| E5 | 반영 | 입력 칸 `min-h-11 rounded-xl text-base md:text-sm`(= D1) |
| E6 | 반영 | 연 버튼을 `openerRef`로 기억해 `finalFocus` 함수가 돌려준다(Safari는 누른 버튼에 포커스를 주지 않는다. T5 `trial-confirm`과 같다) |
| E7 | 반영 | React Compiler가 건너뛰던 원인(렌더 중 ref 쓰기, try 안 삼항·`?.`)을 없앤다. 열 때만 마운트(P12)하고 `mutate(values, { onSuccess, onError, onSettled })`를 쓴다 |
| E8 | 반영 | `.values({ ...input, ownerId })`, `.set({ name, memo, url })`처럼 소유자를 마지막에 두고 바꿀 칸을 적는다. 격리 테스트에 `ownerId`를 끼운 입력 한 건 |
| E9 | 반영 | 23505 가운데 `cause.constraint`가 `channel_name`·`classification_name`일 때만 `CONFLICT`. DB 없이 도는 테스트 한 건 |
| E10 | 반영 | `cleanText`가 U+200B·U+2060·U+FEFF를 지우고 U+3164를 공백으로 본다(ZWJ U+200D는 이모지라 둔다). 테스트 |
| E11 | 반영 | 테스트 개수를 바로잡는다(Task 3: 동작 11 = DB 9 + DB 없이 2, 격리 4 = DB 3 + 소유자 없음 1). 기대 SQL의 `NOT NULL`은 P6으로 삭제. `React.FormEvent`는 쓰지 않는다(onSubmit 안에서 바로). 메모 글자 수는 'N / 200자'(스펙도 고침). 두 번 누름은 ref 가드 |
| U1(엔지니어링) | 반영 | 계약 주석은 스펙대로 `providers/contract.ts`의 `category`·`voiceType` 옆 두 줄(Task 3). '스펙과 다른 점' 1을 지운다 |
| U2(엔지니어링) | 반영 | DB 함수 모듈 생략, 화면 테스트를 순수 함수로 대신하기를 유지한다 |
| U3(엔지니어링) | 반영 | `providers/contract.ts` diff로 대조표에 `[review] bts-reviewer(security)` 행이 자동으로 붙는다. 처음 만드는 소유 데이터 CRUD라 15행 리뷰와 함께 security focus로 받는다 |
| D1 | 반영 | 입력 칸 44px·모바일 16px, 라벨 `font-bold text-sm`. Global Constraints에 더한다 |
| D2 | 반영 | dialog.tsx를 AlertDialog 모양(rounded-2xl·ring, 제목 `font-bold text-xl`, 흐려지기만)으로 다시 쓴다. zoom·`font-medium`·`rounded-none`·`text-xs` 없음. 금지 패턴 grep에 dialog.tsx |
| D3 | 반영 | 더보기 안 화면에 있으면 더보기 버튼이 활성 표현이고 접근 이름 "더보기, 현재 채널·분류"(`docs/briefs/provider-status.md` 96행이 이 TASK에 맡긴 규칙) |
| D4 | 반영 | 더보기 안 링크를 누르면 포커스를 더보기 버튼으로(같은 브리프 95행) |
| D5 | 반영 | 칸 오류 `<p role="alert">`, 저장 중 `readOnly`, 버튼 `focusableWhenDisabled`, ref 가드, 실패 뒤 이름 칸 포커스 |
| D6 | 반영 | 목록 오류는 T5 결과 목록처럼 회색 한 줄 + 기존 `ReloadButton`. 다시 받기에 성공하면 묶음 머리(`tabIndex={-1}`)로 포커스 |
| D7 | 반영 | 목록 그릇 `divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-border ring-inset`(`voice-list-parts.tsx` 78행과 같다) |
| D8 | 반영 | 메모 글자 수 'N / 200자', `text-sm`, 190자부터 `text-warning`, 칸과 `aria-describedby`로 잇는다(`sentence-bar.tsx`와 같다) |
| D9 | 반영 | 오류·실패 문구 색 `text-warning`(T5와 같다) |
| D10 | 반영 | 보드 `max-w-3xl` |
| D11 | 반영 | URL 링크 `inline-flex max-w-full`, 접근 이름은 보이는 주소 + 화면 밖 "(새 탭)", 전체 주소는 `title` |
| D12 | 반영 | form `onKeyDown`: Enter이고 `nativeEvent.isComposing \|\| keyCode === 229`이면 `preventDefault`. QA S14(Chrome·Safari) |
| D13 | 반영 | QA에 VoiceOver(토스트·칸 오류, 할 수 있으면), 휴대폰 키보드와 시트, Toaster `richColors` 대비. Task 8에 `docs/briefs/app-shell.md` |
| U1(화면) | 사용자: 아이콘 | 행 버튼은 44px 아이콘 버튼(Pencil·Trash2, 툴팁, 접근 이름 '{이름} 고치기'), T5 결과 행 방식 |
| U2(화면) | 사용자: 다음 행 | 지운 뒤 포커스 다음 행 → 이전 행 → '만들기'. 순수 함수 `neighborId`(Task 5)와 테스트 |
| U3(화면) | 사용자: 안 닫힘 | 값을 바꾼 동안 `disablePointerDismissal`(Base UI Dialog Root). Esc·취소는 그대로 |
| U4(화면) | 사용자: 2~3줄 | 메모는 `Textarea`(`min-h-20`), Enter는 저장, 줄바꿈은 정리 때 공백 |
| U5(화면) | 유지 | 토스트는 쓴다. 전역 `Toaster richColors`는 바꾸지 않고 라이트·다크 대비를 QA에서 본다 |
| B1~B6 | 브리프로 | 아래 '브리프로 넘길 결정' 절 |
| P1 | 반영 | `charCount`를 지우고 `providers/trial-options.ts`의 `codePoints`·`normalizeText`를 쓴다(그 파일은 import가 타입 하나라 화면 번들에 이미 들어 있다) |
| P2 | 기각 | `URL.parse`는 Safari 17에 없다. 앱은 Safari 17.4 대응을 둔다(`app-nav.tsx`의 `checkVisibility` 대체). `canParse` 뒤 `new URL` 유지 |
| P3 | 반영 | 계약 테스트에서 Task 3 서버 경계와 같은 거절 셋을 빼고 uuid 한 건만 남긴다 |
| P4 | 반영 | 쓰는 곳 없는 타입(`Channel`·`Classification`·`ChannelInput`·`ClassificationErrorData`)과 `DUPLICATE_NAME` 상수를 지운다(라우터는 리터럴 `"duplicate_name"`) |
| P5 | 반영 | `voice-cache.ts`의 코드 추출을 `dbCode(error)`로 뽑아 `logDbFailure`와 라우터가 함께 쓴다(로그 형식 그대로라 기존 테스트 유지) |
| P6 | 반영 | 기대 SQL 복사본을 한 줄 확인으로 줄인다 |
| P7 | 반영 | 쓰는 곳 없는 `GROUPS`를 지운다 |
| P8 | 일부 | 문구 테스트는 조사(이/가, 을/를)를 보는 `duplicateMessage` 셋과 `doneMessage` 하나만 남긴다. `fieldMessage`는 스펙 9절이 정한 것이라 둔다 |
| P9 | 기각 | 크롬 주소창에서 복사한 한글 유튜브 핸들은 퍼센트 인코딩(`%EA%B2%BD…`)이라 `decodeURI`가 있어야 읽힌다 |
| P10 | 반영 | `isUnauthorized` 대신 `lib/voice-failure.ts`의 `failureOf(error) === "unauthorized"` |
| P11 | 반영 | 인라인 '다시 불러오기' 대신 `voice-problem.tsx`의 `ReloadButton` |
| P12 | 반영 | 입력 창·삭제 확인을 `{editing ? <ClassFormDialog/> : null}`처럼 열 때만 마운트하고, 값은 `useState(() => initialValues(editing))`로 한 번 정한다 |

## 브리프로 넘길 결정 (17행 `docs/briefs/classes.md`가 다룬다)

- **B1** 빈 상태: 이 계획은 T5처럼 회색 한 줄과 예시(`GROUP_TEXT.example`)를 쓴다. 상자로 둘지, 예시 문구를 권유 톤 없이 어떻게 쓸지.
- **B2** 묶음 머리: 지금 `text-lg font-bold`와 회색 개수다. 행 이름(16px bold)과 위계 차이가 작다. 20px로 키울지, 개수를 "채널 3개"로 읽게 할지.
- **B3** 만들기 창의 버튼 이름: 지금 '저장하기'. '만들기'로 할지.
- **B4** 페이지 설명: 지금 "성우와 대본을 정리할 채널과 카테고리·타입을 만들어요." 성우에 붙이기는 T7이다.
- **B5** 휴대폰 시트: 안전 영역, 최대 높이와 스크롤. 'URL' 라벨을 '채널 주소'로 할지(GLOSSARY '채널'은 "채널 주소(URL)").
- **B6** 알림 문구의 마침표와 다시 하기 문구 통일("다시 해 주세요"·"다시 눌러 주세요"·"다시 시도해 주세요").

브리프가 문구·간격·크기를 바꾸면 Task 5의 `GROUP_TEXT`·문구 함수와 Task 6의 클래스를 브리프대로 고치고 테스트 기대값도 맞춘다.

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`bts-dev-cycle` 5절)에 한 번 한다. 태스크 경계는 장부에 tree SHA(`git write-tree`)로 적는다.
- `apps/web/.env`를 읽거나 출력하지 않는다. `packages/db/.env`도 내용을 출력하지 않는다. 테스트 DB 주소는 `source .superpowers/sdd/T06-channels-and-classifications-plan/tools/testdb.env`로만 넘기고 출력하지 않는다. 증거에는 "로컬 5433 `tts-pilot-app_test`"만 적는다.
- T6은 공급자를 부르지 않는다. `packages/api/src/providers/`에서는 `contract.ts`의 주석 두 줄(Task 3 Step 6)만 고친다. 이 경로는 인증 민감 경로라 대조표에 security 리뷰 행이 붙는다(스펙 '계획 리뷰에서 바꾼 것' 보안 리뷰).
- 구현 서브에이전트는 개발 서버(`127.0.0.1:3001`)로 요청을 보내지 않고, 서버를 끄거나 다시 켜지 않는다. `pkill`·`killall`·`.next` 삭제 금지. `pnpm build`·DB 명령·shadcn add는 코디네이터만 한다.
- 로컬 관리자 모드(`AGENTS.md`):
  - 소유자는 `context.ownerId`에서만 얻고 입력으로 받지 않는다. insert는 `{ ...input, ownerId }`처럼 소유자를 마지막에 둔다.
  - 모든 select·update·delete에 `owner_id = 소유자` 조건을 건다. 영향받은 행이 없으면 `NOT_FOUND`다.
  - Server Action·새 Route Handler를 만들지 않는다.
  - 페이지는 막지 않고 데이터는 `protectedProcedure`가 막는다(`bts-web`의 `/login` redirect 규칙은 쓰지 않는다).
- 화면은 `@tts-pilot-app/api/classification-rules`·`@tts-pilot-app/api/providers/trial-options`에서 값과 함수를 가져간다. `@tts-pilot-app/api/classification-contract`에서는 아무것도 가져가지 않는다(`apps/web`에 zod 의존이 없다).
- 실패 로그는 한 줄(`[classes] <단계> 실패: <오류 이름> <DB 코드>`)이다. 이름·메모·URL·SQL을 로그나 `ORPCError`의 `cause`·`data`에 넣지 않는다.
- 입력 규칙 값(스펙 2절과 '계획 리뷰에서 바꾼 것' 그대로):
  - 이름: NFC, 보이지 않는 글자 처리, 앞뒤 공백 제거, 연속 공백 하나로, 1~40자
  - 메모: 같은 정리, 0~200자, 비면 null
  - URL: 앞뒤 공백 제거, 비면 null, `http:`·`https:`만, 500자까지
  - 글자 수는 코드 포인트로 센다.
- 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex·임의 값(`mt-[13px]`)을 새로 넣지 않는다. 굵기는 `font-normal`·`font-bold`뿐이다.
- 인터랙티브 요소는 44px 이상이다(버튼 `size="lg"`·`size="icon-lg"`, 링크 `min-h-11`). **입력 칸도 44px 이상(`min-h-11`)이고 767px 이하에서 글자 16px(`text-base md:text-sm`)이다(iOS 확대 방지).** `focus-visible`이 보여야 한다.
- 오류·실패 문구 색은 `text-warning`이다(T5와 같다).
- 화면 문구는 이 계획 Task 5 `classes-view.ts`와 브리프의 문구만 쓴다. 브리프가 문구·간격을 바꾸면 브리프가 이긴다('브리프로 넘길 결정'). 문구는 `-어요` 보이스다.
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(탭 들여쓰기).
- 패키지:
  - 이름: 앱 `web`, API `@tts-pilot-app/api`, DB `@tts-pilot-app/db`, UI `@tts-pilot-app/ui`.
  - 테스트: API는 `pnpm --filter @tts-pilot-app/api test [파일]`, web은 `pnpm --filter web test [파일]`.
  - DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다. skipped는 통과가 아니다.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `ponytail:` 주석으로 남긴다.

## Review Focus

- **macOS에서 붙여 넣은 NFD 한글, 전각 공백, 줄바꿈, 보이지 않는 글자:** "경제"(NFD), "경제　한 입\n", "경제​"가 다른 이름으로 저장되면 같은 이름이 두 개 생기고 T7 칩이 둘로 갈린다. → Task 1 "NFC로 모으고 … 전각 공백을 공백 하나로"·"보이지 않는 글자는 지우거나 공백으로 본다", Task 3 "같은 그룹 같은 이름은 대소문자·공백·NFC 차이까지 CONFLICT".
- **위험한 URL 스킴:** `javascript:`·`JavaScript:`·`data:`가 저장되면 목록의 링크가 스크립트를 실행한다. 대문자 `HTTPS://`는 정상 주소다. → Task 1 "다른 스킴 … bad_url"(대문자 javascript 포함)·"http·https 절대 주소는 통과"(대문자 HTTPS 포함), Task 3 "입력 경계를 서버도 지킨다".
- **저장소 오류 로그에 입력이 새는 경우:** DB가 꺼졌을 때 오류 객체(쿼리·파라미터 포함)를 그대로 로그에 쓰면 사용자가 쓴 이름·메모가 남는다. → Task 3 "입력 없이 한 줄만 남기고 INTERNAL_SERVER_ERROR".
- **두 탭에서 같은 이름 동시 만들기·두 번 누르기:** 조회 후 삽입이면 두 행이 생긴다. → Task 3 "동시에 같은 이름을 두 번 만들면 한 행만 남는다"(유니크 인덱스), Task 6 `sendingRef` 가드, QA S13.
- **다른 탭에서 지운 항목을 고치기:** 저장이 조용히 실패하거나 성공처럼 보이면 안 된다. → Task 3 "다른 탭에서 지운 항목을 고치면 NOT_FOUND", Task 5 `saveFailure`가 `not_found`로 나누고 Task 6이 창을 닫고 알림과 목록 다시 받기, QA S7.

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다.

- `bts-db`: 스키마는 `packages/db/src/schema/classification.ts`에 두고 `schema/index.ts`에서 export한다.
  - 마이그레이션은 `pnpm --filter @tts-pilot-app/db db:generate`로 만들고 생성 SQL을 검토한다. 로컬과 테스트 DB에 `db:migrate`한 뒤 다시 generate해 변경 없음을 본다.
  - 시각 컬럼은 `timestamp(…, { withTimezone: true }).defaultNow().notNull()`이다.
  - **스킬 기본안과 다르게 `user` 외래 키는 걸지 않는다**(스펙 2절 사용자 결정, ADR 0004). 소유자가 `local-admin` 고정 문자열이라서다.
  - 새 구조 결정은 `docs/adr/0004`, 표는 `docs/domain/project.md`에 적는다.
- `supabase-postgres-best-practices`(설계 조사에서 읽음):
  - `kind`는 enum 대신 text + `check`(`schema-data-types`).
  - 대소문자 무시 유니크는 `lower()` 식 인덱스다. citext·nondeterministic collation보다 단순하고 빠르다.
  - 목록 조건(`owner_id`, `owner_id`+`kind`)은 유니크 인덱스의 앞 컬럼이 덮는다(`query-composite-indexes`).
  - 외래 키 인덱스 규칙(`schema-foreign-key-indexes`)은 T7 연결 테이블에서 쓴다(스펙 13절).
- `bts-api`:
  - 불변식 1·2: 프로시저 8개 모두 `protectedProcedure`, 소유자는 `context.ownerId`만. insert 값에서 소유자를 마지막에 둔다(E8).
  - 불변식 3: 모든 update·delete에 `owner_id` 조건, 행이 없으면 `NOT_FOUND`.
  - 불변식 4: 입력 zod(원문 길이 상한 1,000으로 먼저 자른다), 출력 zod.
  - 불변식 5: 이번에 `CONFLICT`를 더한다(이름 인덱스 위반만, E9).
  - 격리 테스트(①②③)는 같은 작업(Task 3)에 둔다.
  - `docs/domain/project.md` API 표를 고친다(Task 8).
  - 권한 판정 로직(`requireOwner`)은 바꾸지 않지만 처음 만드는 소유 데이터 CRUD라 security 리뷰를 받는다(U3, 위 Global Constraints).
- `bts-web`:
  - 조회는 `useQuery(orpc.channelList.queryOptions(...))`. 변경은 `client.*`를 `useMutation`의 `mutationFn`으로 부르고 해당 목록 키를 무효화한다. 그룹마다 프로시저가 갈려 `mutationOptions` 대신 한 함수(`saveItem`)로 고른다.
  - loading·empty·error·비인가(소유자 없음 → `LoopbackNotice`)를 나눈다.
  - 페이지는 Server Component, 클라이언트 경계는 `ClassesBoard`부터다.
  - 공식 스킬 연결 가운데 `vercel-react-best-practices`, `next-dev-loop`만 해당한다.
- `vercel-react-best-practices`:
  - `rerender-derived-state-no-effect`: 정렬·그룹 나누기·바뀐 값 여부는 렌더 중 순수 계산이다.
  - `rerender-move-effect-to-event`: 저장·삭제·포커스는 이벤트·`mutate` 콜백·`finalFocus`에서 한다(effect 없음).
  - `rerender-no-inline-components`: 행 아이콘 버튼 `RowAction`은 모듈 수준이다.
  - React Compiler가 건너뛰지 않게 렌더 중 ref 쓰기와 try/catch를 두지 않는다(E7).
- `shadcn`: `base-lyra`다. 새 프리미티브 `dialog`는 코디네이터가 더하고(Task 4), 같은 화면의 AlertDialog 모양으로 다시 쓴다(D2·E2). 삭제 확인은 기존 `AlertDialog`, 행 버튼 툴팁은 기존 `Tooltip`(T5 `trial-results.tsx` 결과 행과 같은 `TooltipTrigger render={<Button … />}` 방식).
- `bts-ui`(+ impeccable `craft-floor.md`): UI 태스크(4~7) 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 브리프(17행)가 기준이다. 리뷰(critique·audit)는 메인 세션에서 한다.

## 설치본으로 확인한 것

| 대상 | 확인 결과 | 위치 |
|---|---|---|
| drizzle-orm 1.0.0-rc.4 식 인덱스 | `on(...columns: (PgColumn \| SQL)[])` → `uniqueIndex("…").on(t.ownerId, sql\`lower(${t.name})\`)`. 계획 리뷰가 `db:generate`로 `lower("name")` 인덱스 SQL을 확인했다 | `packages/db/node_modules/drizzle-orm/pg-core/indexes.d.ts:43` |
| drizzle 오류 감싸기 | `DrizzleQueryError { query, params, cause }`. pg 오류(`DatabaseError`)를 `cause`에 넣는다. 그래서 오류 객체를 로그에 넘기면 `params`(사용자 입력)가 따라간다 | `drizzle-orm/errors.d.ts` 14행, `pg-core/async/session.js:41`(계획 리뷰) |
| pg 오류 필드 | `DatabaseError`에 `code`(`23505`)와 `constraint`(제약·인덱스 이름) | `node_modules/.pnpm/pg-protocol@1.16.0/node_modules/pg-protocol/dist/messages.d.ts` 29행 |
| oRPC 1.15.4 | `CONFLICT`(409) 기본 코드. 클라이언트 `ORPCError`는 `@orpc/client`. rpc 오류 로그(`apps/web/src/app/api/rpc/[[...rest]]/route.ts`)는 4xx를 남기지 않는다. 웹에는 변경 오류 전역 처리(`MutationCache`)가 없다 | `@orpc/client` dist, route.ts 17행, `apps/web/src/utils/orpc.ts` |
| zod 입력 변환 | `.refine().transform()`을 input으로 쓰면 handler는 정리된 값을 받고 모르는 키(`ownerId` 등)는 버린다(계획 리뷰 실행 확인) | — |
| Base UI 1.8.0 Dialog Root | `disablePointerDismissal?: boolean`(바깥 누르기로 닫지 않음), `onOpenChange(open, eventDetails)`, `onOpenChangeComplete` | `@base-ui/react/dialog/root/DialogRoot.d.ts` 40·44·50행 |
| Base UI 1.8.0 Popup | `finalFocus?: boolean \| RefObject \| ((closeType) => boolean \| HTMLElement \| null \| void)`, `initialFocus` 같은 꼴 | `@base-ui/react/dialog/popup/DialogPopup.d.ts:34` |
| Base UI Button | `focusableWhenDisabled?: boolean`(packages/ui `Button`이 `@base-ui/react/button`을 감싸 그대로 넘긴다. `ReloadButton`이 이미 쓴다) | `@base-ui/react/button/Button.d.ts:21`, `apps/web/src/components/voice-problem.tsx` 57행 |
| packages/ui 기본 칸 | `Input` `h-8 text-xs rounded-none`, `Textarea` `field-sizing-content min-h-16 text-xs rounded-none`, `Label` `text-xs` → 화면에서 `className`으로 덮는다(D1) | `packages/ui/src/components/{input,textarea,label}.tsx` |
| AlertDialog 모양 | Popup `fixed inset-x-4 top-1/2 mx-auto max-w-md -translate-y-1/2 rounded-2xl bg-popover p-4 ring-1 ring-border`, 흐려지기만(`fade-in-0`), Title `font-bold text-xl`, Description `text-muted-foreground text-sm/relaxed`. `AlertDialogAction`은 Close가 아닌 `Button`이라 눌러도 닫히지 않는다 | `packages/ui/src/components/alert-dialog.tsx` 40~160행 |
| shadcn add(TTY 없음) | 기존 파일 덮어쓰기 질문에서 아무것도 만들지 않고 exit 0(`--yes`도 같다). 생성 dialog는 `sm:max-w-sm`·`font-medium`·`zoom-in-95`를 담는다(계획 리뷰 실행 확인) | E2·E3 |
| `Intl.Collator("ko", { numeric: true })`(Node 24) | `["10화","2화","나","가","Bob","alice","123"]` → `2화, 10화, 123, 가, 나, alice, Bob` | 2026-10-06 실행 |
| 조회 오류 알림 | 전역 `QueryCache.onError`가 `meta.toast !== false`인 조회 실패마다 토스트. 화면이 오류를 직접 보이면 `meta: { toast: false }`(connection-status와 같이 `retry: false`, `networkMode: "always"`) | `apps/web/src/utils/orpc.ts`, `connection-status.tsx` 70~82행 |
| `apps/web` 의존 | zod 없음 → 화면은 계약 파일을 쓰지 않는다 | `apps/web/package.json` |
| `typedRoutes` | 켜져 있다 → `/classes` 페이지(Task 6)가 있어야 `Route` 타입이 통과한다(Task 7은 Task 6 뒤) | `apps/web/next.config` 8행 |

## 스펙과 다른 점

1. **DB 함수 모듈 없음:** 스펙 7절이 처음 적은 `packages/api/src/classification.ts`(DB 함수)를 만들지 않는다. 쿼리가 3~5행이라 프로시저 안에 바로 쓰고 오류 변환만 `stored()` 하나로 모은다(ponytail: 호출자가 하나인 층을 두지 않는다). 스펙 7절도 고쳤다.
2. **화면 단위 테스트:** 이 저장소의 web 테스트는 `lib/*.test.ts` 순수 함수만 있다(컴포넌트 렌더 테스트 도구가 없다). 스펙 9절 "입력 창 검사 문구와 `CONFLICT` → 이름 칸 오류 연결"은 `classes-view.ts`의 `fieldMessage`·`saveFailure`·`duplicateMessage` 테스트로, 연결 동작은 QA S4·S5·S7로 확인한다.

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `packages/api/src/classification-rules.ts` | 길이 상수, `cleanText`, 칸별 검사(`nameProblem`·`memoProblem`·`urlProblem`), 저장 값(`cleanMemo`·`cleanUrl`). import는 `providers/trial-options`의 `codePoints`·`normalizeText`뿐 | 1 |
| `packages/api/src/classification-contract.ts` | 입력·출력 zod | 1 |
| `packages/api/src/classification-rules.test.ts` | 규칙과 계약 | 1 |
| `packages/db/src/schema/classification.ts` | `channel`, `classification` 표 | 2 |
| `packages/db/src/schema/index.ts` | export 한 줄 | 2 |
| `packages/db/src/migrations/<생성>/` | `db:generate` 결과(코디네이터) | 2 |
| `packages/api/src/voice-cache.ts` | `dbCode(error)` 뽑기(`logDbFailure`가 쓴다) | 3 |
| `packages/api/src/routers/classification.ts` | 프로시저 8개, `stored()`, `isDuplicateName()` | 3 |
| `packages/api/src/routers/index.ts` | `...classificationRouter` | 3 |
| `packages/api/src/providers/contract.ts` | 주석 두 줄(`category`·`voiceType`) | 3 |
| `packages/api/src/routers/classification.test.ts` | 동작·경계·오류 | 3 |
| `packages/api/src/routers/classification.isolation.test.ts` | 2계정 격리, 소유자 덮기, 소유자 없음 | 3 |
| `packages/ui/src/components/dialog.tsx` | shadcn add 뒤 AlertDialog 모양·아래 시트로 다시 쓰기(코디네이터) | 4 |
| `apps/web/src/lib/classes-view.ts`, `classes-view.test.ts` | 그룹 문구·조사, 이름순, 칸 오류 문구, 실패 분류, 지운 뒤 포커스 행, 줄인 주소 | 5 |
| `apps/web/src/app/(app)/classes/page.tsx` | 페이지 | 6 |
| `apps/web/src/components/classes-board.tsx` | 조회 둘, 소유자 없음, 세 묶음 | 6 |
| `apps/web/src/components/class-group.tsx` | 묶음 머리·행·빈·로딩·오류, 창 열기와 포커스 | 6 |
| `apps/web/src/components/class-form-dialog.tsx` | 만들기·고치기 입력 창 | 6 |
| `apps/web/src/components/class-delete-dialog.tsx` | 삭제 확인 | 6 |
| `apps/web/src/components/app-nav.tsx` | '채널·분류' 열린 화면, 휴대폰 더보기 '열린 화면' 줄, 더보기 현재 위치 | 7 |
| `apps/web/src/app/(app)/studio/page.tsx` | 흐름 지도 '채널' 링크 | 7 |
| `docs/adr/0004-channel-classification-storage.md`, `docs/domain/project.md`, `docs/briefs/site-map.md`, `docs/briefs/app-shell.md`, `docs/briefs/provider-status.md`, `docs/plans/implementation-roadmap.md` | 문서 | 8 |

## 대조표 행과 태스크

| 행 | 태스크 |
|---|---|
| 4 구현 방식 | 실행 방식 선택 뒤 장부 시작 |
| 5 스키마·dbGenerate | Task 2 |
| 6 타입·린트, 7 로컬 migrate, 8 Neon(N/A: `.neon` 없음이면) | Task 2 뒤 코디네이터 |
| 9 파괴적 변경 | Task 2: 새 표 둘만, 없음 |
| 10 bts-reviewer(db) | Task 2 뒤 |
| 11 zod 계약 | Task 1 |
| 12 구현, 13 격리 테스트, 14 타입·린트·테스트 | Task 3 |
| 15 bts-reviewer(code) + 자동으로 붙는 `[review] bts-reviewer(security)` 행 | Task 3 뒤. security focus: 소유자 조건·소유자 덮기·URL 스킴·로그 누출·`CONFLICT` 판정(U3) |
| 16 impeccable context, 17 shape 브리프 | Task 4 전 메인 세션(사용자 확인, '브리프로 넘길 결정' B1~B6) |
| 18 UI 구현 | Task 4~7 |
| 19~30 검증·리뷰·QA | 구현 뒤(아래 절) |
| 35 문서 영향 | Task 8 |

---

### Task 1: 입력 규칙과 계약

**Files:**
- Create: `packages/api/src/classification-rules.ts`
- Create: `packages/api/src/classification-contract.ts`
- Test: `packages/api/src/classification-rules.test.ts`

**Interfaces:**
- Consumes: `codePoints(text: string): number`, `normalizeText(text: string): string`(기존 `packages/api/src/providers/trial-options.ts` 205~207행)
- Produces:
  - `classification-rules.ts`:
    - 상수: `NAME_MAX = 40`, `MEMO_MAX = 200`, `URL_MAX = 500`
    - 종류: `CLASSIFICATION_KINDS = ["category", "type"] as const`, `type ClassificationKind`, `type FieldProblem = "empty" | "too_long" | "bad_url"`
    - 정리: `cleanText(text: string): string`
    - 칸 검사: `nameProblem(raw: string): FieldProblem | null`, `memoProblem(raw)`, `urlProblem(raw)`
    - 저장 값: `cleanMemo(raw: string): string | null`, `cleanUrl(raw: string): string | null`
  - `classification-contract.ts`:
    - 입력: `channelInputSchema`, `channelUpdateInputSchema`, `classificationCreateInputSchema`, `classificationUpdateInputSchema`, `deleteInputSchema`
    - 출력: `channelSchema`, `classificationSchema`, `deletedSchema`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// packages/api/src/classification-rules.test.ts
import { describe, expect, it } from "vitest";

import {
	channelInputSchema,
	channelUpdateInputSchema,
} from "./classification-contract";
import {
	cleanMemo,
	cleanText,
	cleanUrl,
	memoProblem,
	nameProblem,
	urlProblem,
} from "./classification-rules";

describe("cleanText", () => {
	it("NFC로 모으고 앞뒤 공백을 지우고 줄바꿈·탭·전각 공백을 공백 하나로 합친다(Review Focus 1)", () => {
		expect(cleanText("  경제　\t한   입\n")).toBe("경제 한 입");
		expect(cleanText("경제".normalize("NFD"))).toBe("경제");
	});
	it("보이지 않는 글자는 지우거나 공백으로 보고, 이모지를 잇는 ZWJ는 둔다(Review Focus 1, 계획 리뷰 E10)", () => {
		expect(cleanText("경제​")).toBe("경제");
		expect(cleanText("⁠경﻿제")).toBe("경제");
		expect(cleanText("경제ㅤ한 입")).toBe("경제 한 입");
		expect(nameProblem("​ㅤ")).toBe("empty");
		expect(cleanText("👨‍👩")).toBe("👨‍👩");
	});
});

describe("nameProblem", () => {
	it("빈 이름과 공백뿐인 이름은 empty다", () => {
		expect(nameProblem("")).toBe("empty");
		expect(nameProblem(" 　\n")).toBe("empty");
	});
	it("정리한 뒤 코드 포인트로 40자까지 받는다", () => {
		expect(nameProblem("가".repeat(40))).toBeNull();
		expect(nameProblem(`  ${"가".repeat(40)}  `)).toBeNull();
		expect(nameProblem("가".repeat(41))).toBe("too_long");
		expect(nameProblem("😀".repeat(40))).toBeNull();
		expect(nameProblem("😀".repeat(41))).toBe("too_long");
	});
});

describe("memoProblem", () => {
	it("빈 메모는 괜찮고 200자까지 받는다", () => {
		expect(memoProblem("")).toBeNull();
		expect(memoProblem("가".repeat(200))).toBeNull();
		expect(memoProblem("가".repeat(201))).toBe("too_long");
	});
});

describe("urlProblem", () => {
	it("http·https 절대 주소와 빈 값은 통과한다(대문자 스킴 포함, Review Focus 2)", () => {
		for (const url of [
			"https://youtube.com/@econ",
			"http://example.com",
			"HTTPS://Example.com/a",
			" https://youtube.com/@경제한입 ",
			"",
			"   ",
		])
			expect(urlProblem(url), url).toBeNull();
	});
	it("다른 스킴, 스킴 없는 주소, 상대 주소, 호스트 없는 주소는 bad_url이다(Review Focus 2)", () => {
		for (const url of [
			"javascript:alert(1)",
			"JavaScript:alert(1)",
			"data:text/html,x",
			"ftp://example.com",
			"example.com",
			"/path",
			"https://",
		])
			expect(urlProblem(url), url).toBe("bad_url");
	});
	it("500자까지 받는다", () => {
		const base = "https://example.com/";
		expect(urlProblem(base + "a".repeat(500 - base.length))).toBeNull();
		expect(urlProblem(base + "a".repeat(501 - base.length))).toBe("too_long");
	});
});

describe("저장 값", () => {
	it("빈 메모·URL은 null이고 나머지는 정리한 값이다", () => {
		expect(cleanMemo("  ")).toBeNull();
		expect(cleanMemo("  토요일   아침\n두 번째 줄 ")).toBe("토요일 아침 두 번째 줄");
		expect(cleanUrl("  ")).toBeNull();
		expect(cleanUrl(" https://a.example/x ")).toBe("https://a.example/x");
	});
});

describe("계약", () => {
	it("채널 입력을 정리한 값으로 바꾼다", () => {
		expect(
			channelInputSchema.parse({
				name: " 경제  한 입 ",
				memo: "",
				url: " https://youtube.com/@econ ",
			}),
		).toEqual({
			name: "경제 한 입",
			memo: null,
			url: "https://youtube.com/@econ",
		});
	});
	it("uuid가 아닌 id는 거절한다(그 밖의 거절은 Task 3 서버 경계 테스트)", () => {
		expect(
			channelUpdateInputSchema.safeParse({
				id: "1",
				name: "a",
				memo: "",
				url: "",
			}).success,
		).toBe(false);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @tts-pilot-app/api test src/classification-rules.test.ts`
Expected: FAIL — `./classification-contract`·`./classification-rules`를 찾지 못함

- [ ] **Step 3: 규칙을 쓴다**

```ts
// packages/api/src/classification-rules.ts
// 채널·분류(T6 스펙 2절) 입력 규칙. 화면과 서버가 같이 쓴다. zod·서버 모듈을 import하지 않는다(화면 번들에 들어간다).
// 여기의 카테고리·타입은 사용자가 만든 분류다. 공급자 성우의 Voice.category(ElevenLabs 성우 종류)·voiceType(출처)과 다르다(GLOSSARY '분류').
import { codePoints, normalizeText } from "./providers/trial-options";

export const NAME_MAX = 40;
export const MEMO_MAX = 200;
export const URL_MAX = 500;

export const CLASSIFICATION_KINDS = ["category", "type"] as const;
export type ClassificationKind = (typeof CLASSIFICATION_KINDS)[number];

export type FieldProblem = "empty" | "too_long" | "bad_url";

// 보이지 않는 글자: 폭 없는 공백·단어 결합자·BOM은 지우고, 한글 채움 문자(U+3164)는 공백으로 본다(계획 리뷰 E10).
// 그대로 두면 보이지 않는 이름이 생기고 같은 이름 검사를 피해 간다. 이모지를 잇는 U+200D(ZWJ)는 지우지 않는다
const INVISIBLE = /[​⁠﻿]/gu;

// NFC, 앞뒤 공백 제거(T5 normalizeText), 줄바꿈·탭·전각 공백을 포함한 연속 공백을 하나로
export function cleanText(text: string): string {
	return normalizeText(
		text.replace(INVISIBLE, "").replace(/ㅤ/gu, " "),
	).replace(/\s+/gu, " ");
}

export function nameProblem(raw: string): FieldProblem | null {
	const name = cleanText(raw);
	if (!name) return "empty";
	return codePoints(name) > NAME_MAX ? "too_long" : null;
}

export function memoProblem(raw: string): FieldProblem | null {
	return codePoints(cleanText(raw)) > MEMO_MAX ? "too_long" : null;
}

// http·https 절대 주소만. 목록이 이 값을 링크로 그리므로 다른 스킴(javascript: 등)을 막는다. 빈 값은 없음으로 저장한다.
// URL.parse는 Safari 17에 없어 canParse 뒤 new URL로 읽는다(계획 리뷰 P2 기각)
export function urlProblem(raw: string): FieldProblem | null {
	const url = raw.trim();
	if (!url) return null;
	if (codePoints(url) > URL_MAX) return "too_long";
	if (!URL.canParse(url)) return "bad_url";
	const { protocol } = new URL(url);
	return protocol === "http:" || protocol === "https:" ? null : "bad_url";
}

export function cleanMemo(raw: string): string | null {
	return cleanText(raw) || null;
}

// 주소는 사용자가 쓴 그대로 둔다(앞뒤 공백만). URL 객체로 바꾸면 끝 '/'가 붙는 등 글자가 달라진다
export function cleanUrl(raw: string): string | null {
	return raw.trim() || null;
}
```

- [ ] **Step 4: 계약을 쓴다**

```ts
// packages/api/src/classification-contract.ts
import { z } from "zod";

import {
	CLASSIFICATION_KINDS,
	cleanMemo,
	cleanText,
	cleanUrl,
	memoProblem,
	nameProblem,
	urlProblem,
} from "./classification-rules";

// 채널·분류 프로시저의 입력·출력(T6 스펙 3절). 원문은 먼저 1,000자로 자른 뒤 규칙을 보고, 정리한 값으로 바꿔 넘긴다.
// 모르는 키(ownerId 등)는 버려진다. 그래도 라우터는 소유자를 값의 마지막에 둔다(계획 리뷰 E8)
const RAW_MAX = 1000;
const nameSchema = z
	.string()
	.max(RAW_MAX)
	.refine((value) => nameProblem(value) === null, { message: "name" })
	.transform(cleanText);
const memoSchema = z
	.string()
	.max(RAW_MAX)
	.refine((value) => memoProblem(value) === null, { message: "memo" })
	.transform(cleanMemo);
const urlSchema = z
	.string()
	.max(RAW_MAX)
	.refine((value) => urlProblem(value) === null, { message: "url" })
	.transform(cleanUrl);

export const classificationKindSchema = z.enum(CLASSIFICATION_KINDS);

export const channelInputSchema = z.object({
	name: nameSchema,
	memo: memoSchema,
	url: urlSchema,
});
export const channelUpdateInputSchema = channelInputSchema.extend({
	id: z.uuid(),
});
export const classificationCreateInputSchema = z.object({
	kind: classificationKindSchema,
	name: nameSchema,
	memo: memoSchema,
});
// kind는 바꾸지 않는다(카테고리를 타입으로 옮기기 없음, 스펙 3절)
export const classificationUpdateInputSchema = z.object({
	id: z.uuid(),
	name: nameSchema,
	memo: memoSchema,
});
export const deleteInputSchema = z.object({ id: z.uuid() });

export const channelSchema = z.object({
	id: z.uuid(),
	name: z.string(),
	memo: z.string().nullable(),
	url: z.string().nullable(),
});
export const classificationSchema = z.object({
	id: z.uuid(),
	kind: classificationKindSchema,
	name: z.string(),
	memo: z.string().nullable(),
});
export const deletedSchema = z.object({ deleted: z.literal(true) });
```

- [ ] **Step 5: 통과를 확인하고 포맷한다**

Run: `pnpm --filter @tts-pilot-app/api test src/classification-rules.test.ts && pnpm exec biome check --write packages/api/src/classification-rules.ts packages/api/src/classification-contract.ts packages/api/src/classification-rules.test.ts`
Expected: PASS 11개, biome 오류 0

- [ ] **Step 6: 장부에 tree SHA를 적는다**(커밋하지 않는다)

---

### Task 2: 채널·분류 표 (DB 명령은 코디네이터)

**Files:**
- Create: `packages/db/src/schema/classification.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create(코디네이터): `packages/db/src/migrations/<drizzle-kit 생성 이름>/`

**Interfaces:**
- Consumes: 없음(db 패키지는 api를 import하지 않는다. kind 값은 `$type`으로 같은 꼴을 적는다)
- Produces:
  - `channel` 표: `id`, `ownerId`, `name`, `memo`, `url`, `createdAt`
  - `classification` 표: `id`, `ownerId`, `kind: "category" | "type"`, `name`, `memo`, `createdAt`
  - 둘 다 `@tts-pilot-app/db/schema/classification`에서 가져간다. 인덱스 이름 `channel_name`·`classification_name`은 Task 3의 `CONFLICT` 판정이 쓴다.

- [ ] **Step 1: 스키마를 쓴다**

```ts
// packages/db/src/schema/classification.ts
import { sql } from "drizzle-orm";
import {
	check,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// 채널·분류(T6 스펙 3절, ADR 0004). 채널은 프리셋(T8)·저장 대본(T12)이 하나만 가리키는 제작 단위라 분류와 따로 둔다.
// user 외래 키는 걸지 않는다: 소유자가 아직 'local-admin' 고정 문자열이다. T14에서 owner_id를 실제 사용자 id로 옮기고 그때 정한다.
export const channel = pgTable(
	"channel",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		name: text("name").notNull(),
		memo: text("memo"),
		// http·https만(classification-rules urlProblem). 목록이 링크로 그린다
		url: text("url"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// 같은 소유자 안 대소문자 무시 중복 금지. 조회가 아니라 이 인덱스가 막는다(동시 만들기 포함). 이름은 라우터의 CONFLICT 판정이 쓴다.
		// 목록 조회(owner_id)도 앞 컬럼을 쓴다
		uniqueIndex("channel_name").on(t.ownerId, sql`lower(${t.name})`),
	],
);

// 카테고리·타입(GLOSSARY '분류'). 성우(T7)·대본(T12)에 여러 개 붙는 이름표다
export const classification = pgTable(
	"classification",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerId: text("owner_id").notNull(),
		kind: text("kind").$type<"category" | "type">().notNull(),
		name: text("name").notNull(),
		memo: text("memo"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// 같은 소유자·같은 kind 안 대소문자 무시 중복 금지. 카테고리 '경제'와 타입 '경제'는 된다
		uniqueIndex("classification_name").on(
			t.ownerId,
			t.kind,
			sql`lower(${t.name})`,
		),
		check("classification_kind", sql`${t.kind} in ('category', 'type')`),
	],
);
```

- [ ] **Step 2: export를 더한다**

`packages/db/src/schema/index.ts`를 아래처럼 만든다(알파벳 순):

```ts
export * from "./auth";
export * from "./classification";
export * from "./provider-cache";
export * from "./trial-generation";
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm --filter @tts-pilot-app/db check-types`
Expected: exit 0

- [ ] **Step 4 (코디네이터): 마이그레이션 생성과 SQL 검토**

Run: `pnpm --filter @tts-pilot-app/db db:generate`
Expected: 새 폴더 하나. SQL에 들어 있어야 할 것과 없어야 할 것(계획 리뷰가 같은 스키마로 생성해 확인했다):
- 있어야 함: `CREATE TABLE "channel"`·`"classification"`, check `classification_kind`, 유니크 인덱스 `channel_name`(`owner_id`, `lower("name")`)·`classification_name`(`owner_id`, `kind`, `lower("name")`)
- 없어야 함: `DROP`·`ALTER`, 기존 표 변경

- [ ] **Step 5 (코디네이터): 로컬·테스트 DB에 적용**

Run:
```bash
podman ps --format '{{.Names}}' | grep -q tts-pilot-app-postgres || { podman machine start; podman start tts-pilot-app-postgres; }
pnpm --filter @tts-pilot-app/db db:migrate
source .superpowers/sdd/T06-channels-and-classifications-plan/tools/testdb.env && DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @tts-pilot-app/db db:migrate
pnpm --filter @tts-pilot-app/db db:generate
```
Expected: 두 migrate 모두 exit 0, 마지막 generate는 변경 없음(`No schema changes`).

- [ ] **Step 6: 장부에 tree SHA를 적는다.** 대조표 5·6·7·9행 증거(생성 SQL 요약, 파괴적 변경 없음). 8행은 `.neon`이 없으면 `N/A: Neon 미연결(.neon 없음)`.

---

### Task 3: 프로시저 8개와 테스트

**Files:**
- Create: `packages/api/src/routers/classification.ts`
- Modify: `packages/api/src/voice-cache.ts:64-78`(`dbCode` 뽑기)
- Modify: `packages/api/src/routers/index.ts`(import 한 줄, `appRouter` 끝에 `...classificationRouter`)
- Modify: `packages/api/src/providers/contract.ts:124`, `:221`(주석 두 줄)
- Test: `packages/api/src/routers/classification.test.ts`
- Test: `packages/api/src/routers/classification.isolation.test.ts`

**Interfaces:**
- Consumes:
  - Task 1의 스키마
  - Task 2의 `channel`·`classification`, 인덱스 이름 `channel_name`·`classification_name`
  - 기존 `protectedProcedure`(`../index`)
- Produces: `appRouter`의 프로시저 8개(화면 쪽 이름과 꼴).
  - 채널:
    - `channelList()` → `{ id, name, memo, url }[]`
    - `channelCreate({ name, memo, url })` → 채널
    - `channelUpdate({ id, name, memo, url })` → 채널
    - `channelDelete({ id })` → `{ deleted: true }`
  - 분류:
    - `classificationList()` → `{ id, kind, name, memo }[]`
    - `classificationCreate({ kind, name, memo })` → 분류
    - `classificationUpdate({ id, name, memo })` → 분류
    - `classificationDelete({ id })` → `{ deleted: true }`
  - 오류:
    - 같은 이름: `CONFLICT`(`data.reason "duplicate_name"`)
    - 없거나 남의 것: `NOT_FOUND`
    - 소유자 없음: `UNAUTHORIZED`
    - 저장소 오류: `INTERNAL_SERVER_ERROR`
    - 입력 위반: `BAD_REQUEST`
  - `voice-cache.ts`: `export function dbCode(error: unknown): string | null`

- [ ] **Step 1: 동작 테스트를 쓴다**

```ts
// packages/api/src/routers/classification.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `class-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const me = as(OWNER);
const blank = { memo: "", url: "" };
// 접근하면 그 오류를 던지는 DB(DB 없이 저장소 오류를 흉내 낸다)
const throwingDb = (error: unknown) =>
	new Proxy(
		{},
		{
			get() {
				throw error;
			},
		},
	) as Context["db"];

describe.skipIf(!url)("채널·분류 프로시저(T6 스펙 8·9절)", () => {
	beforeEach(async () => {
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("채널을 만들고 목록에서 보고 고치고 지운다", async () => {
		const made = await me.channelCreate({ name: "  경제   한 입 ", ...blank });
		expect(made).toEqual({
			id: expect.any(String),
			name: "경제 한 입",
			memo: null,
			url: null,
		});
		expect(await me.channelList()).toEqual([made]);
		const fixed = await me.channelUpdate({
			id: made.id,
			name: "주말 레터",
			memo: " 토요일 아침 ",
			url: "https://youtube.com/@weekend",
		});
		expect(fixed).toEqual({
			id: made.id,
			name: "주말 레터",
			memo: "토요일 아침",
			url: "https://youtube.com/@weekend",
		});
		expect(await me.channelList()).toEqual([fixed]);
		expect(await me.channelDelete({ id: made.id })).toEqual({ deleted: true });
		expect(await me.channelList()).toEqual([]);
	});

	it("카테고리·타입을 한 목록으로 돌려주고 고쳐도 kind는 그대로다", async () => {
		const category = await me.classificationCreate({
			kind: "category",
			name: "경제",
			memo: "",
		});
		const type = await me.classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "낮은 톤",
		});
		const list = await me.classificationList();
		expect(list).toHaveLength(2);
		expect(list).toEqual(expect.arrayContaining([category, type]));
		const fixed = await me.classificationUpdate({
			id: type.id,
			name: "차분함·신뢰",
			memo: "",
		});
		expect(fixed).toEqual({
			id: type.id,
			kind: "type",
			name: "차분함·신뢰",
			memo: null,
		});
		expect(await me.classificationDelete({ id: category.id })).toEqual({
			deleted: true,
		});
		expect(await me.classificationList()).toEqual([fixed]);
	});

	it("같은 그룹 같은 이름은 대소문자·공백·NFC·보이지 않는 글자 차이까지 CONFLICT다(Review Focus 1)", async () => {
		await me.channelCreate({ name: "Economy Bite", ...blank });
		for (const name of [
			"economy bite",
			"  ECONOMY   bite ",
			"Economy　Bite",
			"Economy Bite​",
		])
			await expect(me.channelCreate({ name, ...blank })).rejects.toMatchObject({
				code: "CONFLICT",
				data: { reason: "duplicate_name" },
			});
		await me.classificationCreate({ kind: "category", name: "경제", memo: "" });
		await expect(
			me.classificationCreate({
				kind: "category",
				name: "경제".normalize("NFD"),
				memo: "",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await me.channelList()).toHaveLength(1);
		expect(await me.classificationList()).toHaveLength(1);
	});

	it("다른 그룹이면 같은 이름이어도 된다", async () => {
		await me.channelCreate({ name: "경제", ...blank });
		await me.classificationCreate({ kind: "category", name: "경제", memo: "" });
		await me.classificationCreate({ kind: "type", name: "경제", memo: "" });
		expect(await me.channelList()).toHaveLength(1);
		expect(await me.classificationList()).toHaveLength(2);
	});

	it("고치기로 다른 항목과 같은 이름이 되면 CONFLICT이고, 자기 이름 그대로는 된다", async () => {
		const calm = await me.classificationCreate({
			kind: "type",
			name: "차분함",
			memo: "",
		});
		const lively = await me.classificationCreate({
			kind: "type",
			name: "활기참",
			memo: "",
		});
		await expect(
			me.classificationUpdate({ id: lively.id, name: "차분함", memo: "" }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			await me.classificationUpdate({ id: calm.id, name: "차분함", memo: "메모만" }),
		).toMatchObject({ name: "차분함", memo: "메모만" });
		const a = await me.channelCreate({ name: "A", ...blank });
		await me.channelCreate({ name: "B", ...blank });
		await expect(
			me.channelUpdate({ id: a.id, name: "b", ...blank }),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("동시에 같은 이름을 두 번 만들면 한 행만 남는다(Review Focus 4)", async () => {
		const results = await Promise.allSettled([
			me.channelCreate({ name: "동시", ...blank }),
			me.channelCreate({ name: "동시", ...blank }),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.find((r) => r.status === "rejected")).toMatchObject({
			reason: { code: "CONFLICT" },
		});
		expect(await me.channelList()).toHaveLength(1);
	});

	it("입력 경계를 서버도 지킨다(Review Focus 2)", async () => {
		await expect(
			me.channelCreate({ name: "가".repeat(40), ...blank }),
		).resolves.toMatchObject({ name: "가".repeat(40) });
		for (const input of [
			{ name: "가".repeat(41), ...blank },
			{ name: "   ", ...blank },
			{ name: "​", ...blank },
			{ name: "a", memo: "가".repeat(201), url: "" },
			{ name: "a", memo: "", url: "javascript:alert(1)" },
			{ name: "a", memo: "", url: "JavaScript:alert(1)" },
			{ name: "a", memo: "", url: "ftp://example.com" },
			{ name: "a", memo: "", url: `https://example.com/${"a".repeat(481)}` },
		])
			await expect(me.channelCreate(input)).rejects.toMatchObject({
				code: "BAD_REQUEST",
			});
		await expect(
			me.classificationCreate({
				kind: "channel" as "type",
				name: "a",
				memo: "",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("없는 id로 고치기·지우기는 NOT_FOUND다", async () => {
		const id = crypto.randomUUID();
		await expect(
			me.channelUpdate({ id, name: "a", ...blank }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(me.channelDelete({ id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			me.classificationUpdate({ id, name: "a", memo: "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(me.classificationDelete({ id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("다른 탭에서 지운 항목을 고치면 NOT_FOUND다(Review Focus 5)", async () => {
		const made = await me.classificationCreate({
			kind: "category",
			name: "뉴스",
			memo: "",
		});
		await me.classificationDelete({ id: made.id });
		await expect(
			me.classificationUpdate({ id: made.id, name: "뉴스2", memo: "" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("저장소 오류(DB 없이)", () => {
	it("입력 없이 한 줄만 남기고 INTERNAL_SERVER_ERROR다(Review Focus 3)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const down = Object.assign(new Error("connect ECONNREFUSED"), {
			code: "ECONNREFUSED",
		});
		await expect(
			as(OWNER, throwingDb(down)).channelCreate({
				name: "비밀 채널 이름",
				memo: "비밀 메모",
				url: "",
			}),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(log.mock.calls.map((call) => call.join(" "))).toEqual([
			"[classes] 채널 만들기 실패: Error ECONNREFUSED",
		]);
		log.mockRestore();
	});

	it("이름 인덱스가 아닌 유니크 위반은 같은 이름 오류로 바꾸지 않는다(계획 리뷰 E9)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		// drizzle은 pg 오류를 cause에 넣는다
		const unique = (constraint: string) =>
			Object.assign(new Error("query failed"), {
				cause: { code: "23505", constraint },
			});
		const input = { name: "a", memo: "", url: "" };
		await expect(
			as(OWNER, throwingDb(unique("channel_name"))).channelCreate(input),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
		await expect(
			as(OWNER, throwingDb(unique("channel_pkey"))).channelCreate(input),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		log.mockRestore();
	});
});
```

- [ ] **Step 2: 격리 테스트를 쓴다**

```ts
// packages/api/src/routers/classification.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `class-iso-a-${Date.now()}`;
const B = `class-iso-b-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});

describe.skipIf(!url)("채널·분류 소유자 격리(스펙 8절 6번)", () => {
	beforeEach(async () => {
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("B는 A의 채널·분류를 보지도 고치지도 지우지도 못하고 A의 행은 그대로다", async () => {
		const ch = await as(A).channelCreate({
			name: "A 채널",
			memo: "",
			url: "https://a.example",
		});
		const cat = await as(A).classificationCreate({
			kind: "category",
			name: "A 분류",
			memo: "",
		});
		expect(await as(B).channelList()).toEqual([]);
		expect(await as(B).classificationList()).toEqual([]);
		for (const attempt of [
			() => as(B).channelUpdate({ id: ch.id, name: "가로챔", memo: "", url: "" }),
			() => as(B).channelDelete({ id: ch.id }),
			() => as(B).classificationUpdate({ id: cat.id, name: "가로챔", memo: "" }),
			() => as(B).classificationDelete({ id: cat.id }),
		])
			await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).channelList()).toEqual([ch]);
		expect(await as(A).classificationList()).toEqual([cat]);
	});

	it("B는 A와 같은 이름을 만들 수 있다", async () => {
		await as(A).channelCreate({ name: "경제", memo: "", url: "" });
		await as(A).classificationCreate({ kind: "type", name: "차분함", memo: "" });
		await expect(
			as(B).channelCreate({ name: "경제", memo: "", url: "" }),
		).resolves.toMatchObject({ name: "경제" });
		await expect(
			as(B).classificationCreate({ kind: "type", name: "차분함", memo: "" }),
		).resolves.toMatchObject({ name: "차분함" });
	});

	it("입력에 ownerId를 끼워도 서버가 정한 소유자로 저장한다(계획 리뷰 E8)", async () => {
		await as(B).channelCreate({
			name: "끼움",
			memo: "",
			url: "",
			ownerId: A,
		} as never);
		await as(B).classificationCreate({
			kind: "type",
			name: "끼움",
			memo: "",
			ownerId: A,
		} as never);
		expect(await as(A).channelList()).toEqual([]);
		expect(await as(A).classificationList()).toEqual([]);
		expect(await as(B).channelList()).toHaveLength(1);
		expect(await as(B).classificationList()).toHaveLength(1);
	});
});

describe("소유자 없음(스펙 8절 7번)", () => {
	it("프로시저 8개 모두 UNAUTHORIZED이고 DB에 닿지 않는다", async () => {
		let dbTouches = 0;
		const failingDb = new Proxy(
			{},
			{
				get() {
					dbTouches += 1;
					throw new Error("db access without owner");
				},
			},
		) as Context["db"];
		const anon = as(null, failingDb);
		const id = crypto.randomUUID();
		for (const call of [
			() => anon.channelList(),
			() => anon.channelCreate({ name: "a", memo: "", url: "" }),
			() => anon.channelUpdate({ id, name: "a", memo: "", url: "" }),
			() => anon.channelDelete({ id }),
			() => anon.classificationList(),
			() => anon.classificationCreate({ kind: "type", name: "a", memo: "" }),
			() => anon.classificationUpdate({ id, name: "a", memo: "" }),
			() => anon.classificationDelete({ id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
	});
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `source .superpowers/sdd/T06-channels-and-classifications-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/classification`
Expected: FAIL — `channelCreate` 등이 `appRouter`에 없음(타입 오류 또는 `is not a function`)

- [ ] **Step 4: DB 오류 코드 추출을 뽑는다**

`packages/api/src/voice-cache.ts`의 `logDbFailure`(64~78행)를 아래 두 함수로 바꾼다. 로그 형식은 그대로라 `voice-cache.test.ts`·`trial.test.ts`는 바뀌지 않는다.

```ts
// DB 오류 코드(ECONNREFUSED, 23505 등). drizzle 오류는 pg 오류를 cause에 넣는다
export function dbCode(error: unknown): string | null {
	const { code, cause } = (error ?? {}) as {
		code?: unknown;
		cause?: { code?: unknown };
	};
	if (typeof cause?.code === "string") return cause.code;
	return typeof code === "string" ? code : null;
}

// DB 오류 한 줄. drizzle 오류의 message에는 SQL과 값이 들어 있어 이름과 코드(ECONNREFUSED 등)만 남긴다
export function logDbFailure(prefix: string, step: string, error: unknown) {
	const name = error instanceof Error ? error.name : typeof error;
	const tag = dbCode(error);
	console.error(`${prefix} ${step} 실패: ${name}${tag ? ` ${tag}` : ""}`);
}
```

- [ ] **Step 5: 라우터를 쓴다**

```ts
// packages/api/src/routers/classification.ts
import { ORPCError } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
	channelInputSchema,
	channelSchema,
	channelUpdateInputSchema,
	classificationCreateInputSchema,
	classificationSchema,
	classificationUpdateInputSchema,
	deletedSchema,
	deleteInputSchema,
} from "../classification-contract";
import { protectedProcedure } from "../index";
import { dbCode, logDbFailure } from "../voice-cache";

// 같은 그룹 같은 이름: 이름 유니크 인덱스(schema/classification.ts) 위반 23505만 본다. drizzle은 pg 오류를 cause에 넣는다(계획 리뷰 E9)
const NAME_INDEXES = new Set(["channel_name", "classification_name"]);
function isDuplicateName(error: unknown): boolean {
	const constraint = (error as { cause?: { constraint?: unknown } } | null)
		?.cause?.constraint;
	return (
		dbCode(error) === "23505" &&
		typeof constraint === "string" &&
		NAME_INDEXES.has(constraint)
	);
}

// 같은 이름은 CONFLICT로 바꾼다. 그 밖의 저장소 오류는 한 줄(오류 이름·DB 코드)만 남기고,
// 오류 객체(쿼리 파라미터 = 사용자 입력)는 로그와 cause에 넘기지 않는다(T6 스펙 5절)
async function stored<T>(step: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		if (isDuplicateName(error))
			throw new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } });
		logDbFailure("[classes]", step, error);
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}
}

// 바뀐 행이 없으면 NOT_FOUND. 남의 것인지 없는 것인지 드러내지 않는다(bts-api 불변식 3)
function found<T>(row: T | undefined): T {
	if (!row) throw new ORPCError("NOT_FOUND");
	return row;
}

const channelColumns = {
	id: channel.id,
	name: channel.name,
	memo: channel.memo,
	url: channel.url,
};
const classificationColumns = {
	id: classification.id,
	kind: classification.kind,
	name: classification.name,
	memo: classification.memo,
};

// 채널·분류(T6). 소유자는 context.ownerId뿐이고 모든 조회·변경에 owner_id 조건을 건다.
// insert 값은 소유자를 마지막에 두고, update는 바꿀 칸만 적는다(입력 스키마가 바뀌어도 소유자가 덮이지 않게, 계획 리뷰 E8).
// 정렬은 화면이 한다(이름순, 스펙 3절)
export const classificationRouter = {
	channelList: protectedProcedure
		.output(z.array(channelSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("채널 목록", () =>
				db
					.select(channelColumns)
					.from(channel)
					.where(eq(channel.ownerId, ownerId)),
			),
		),
	channelCreate: protectedProcedure
		.input(channelInputSchema)
		.output(channelSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("채널 만들기", async () => {
				const [row] = await db
					.insert(channel)
					.values({ ...input, ownerId })
					.returning(channelColumns);
				return found(row);
			}),
		),
	channelUpdate: protectedProcedure
		.input(channelUpdateInputSchema)
		.output(channelSchema)
		.handler(({ input: { id, name, memo, url }, context: { db, ownerId } }) =>
			stored("채널 고치기", async () => {
				const [row] = await db
					.update(channel)
					.set({ name, memo, url })
					.where(and(eq(channel.id, id), eq(channel.ownerId, ownerId)))
					.returning(channelColumns);
				return found(row);
			}),
		),
	channelDelete: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("채널 지우기", async () => {
				const [row] = await db
					.delete(channel)
					.where(and(eq(channel.id, id), eq(channel.ownerId, ownerId)))
					.returning({ id: channel.id });
				found(row);
				return { deleted: true as const };
			}),
		),
	classificationList: protectedProcedure
		.output(z.array(classificationSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("분류 목록", () =>
				db
					.select(classificationColumns)
					.from(classification)
					.where(eq(classification.ownerId, ownerId)),
			),
		),
	classificationCreate: protectedProcedure
		.input(classificationCreateInputSchema)
		.output(classificationSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("분류 만들기", async () => {
				const [row] = await db
					.insert(classification)
					.values({ ...input, ownerId })
					.returning(classificationColumns);
				return found(row);
			}),
		),
	classificationUpdate: protectedProcedure
		.input(classificationUpdateInputSchema)
		.output(classificationSchema)
		.handler(({ input: { id, name, memo }, context: { db, ownerId } }) =>
			stored("분류 고치기", async () => {
				const [row] = await db
					.update(classification)
					.set({ name, memo })
					.where(
						and(eq(classification.id, id), eq(classification.ownerId, ownerId)),
					)
					.returning(classificationColumns);
				return found(row);
			}),
		),
	classificationDelete: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("분류 지우기", async () => {
				const [row] = await db
					.delete(classification)
					.where(
						and(eq(classification.id, id), eq(classification.ownerId, ownerId)),
					)
					.returning({ id: classification.id });
				found(row);
				return { deleted: true as const };
			}),
		),
};
```

- [ ] **Step 6: `appRouter`에 넣고 공급자 계약에 주석 두 줄을 단다**

1. `packages/api/src/routers/index.ts`
   - `import { trialRouter } from "./trial";` 위에 `import { classificationRouter } from "./classification";`을 넣는다.
   - `appRouter` 객체의 `...trialRouter,` 바로 다음 줄에 `...classificationRouter,`를 넣는다.
2. `packages/api/src/providers/contract.ts`(스펙 2절 '공급자 쪽 이름', 이 경로라 security 리뷰 행이 붙는다)
   - 124행 `// 공급자 성우 종류(ElevenLabs category)`를 `// 공급자 성우 종류(ElevenLabs category). 사용자 분류의 카테고리(classification 표)와 다르다`로 바꾼다.
   - 221행 `voiceType: …` 바로 위에 `// ElevenLabs 계정 성우 출처 필터(화면 '출처'). 사용자 분류의 타입(classification kind 'type')과 다르다` 한 줄을 넣는다.
   - 주석만 바꾸고 코드는 바꾸지 않는다.

- [ ] **Step 7: 통과를 확인한다**

Run: `source .superpowers/sdd/T06-channels-and-classifications-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/classification && pnpm --filter @tts-pilot-app/api check-types`
Expected: PASS. `classification.test.ts` 11개(DB 9 + DB 없이 2), `classification.isolation.test.ts` 4개(DB 3 + 소유자 없음 1), skipped 0. 타입 exit 0

- [ ] **Step 8: 전체 API 테스트와 포맷**

Run: `source .superpowers/sdd/T06-channels-and-classifications-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test && pnpm exec biome check --write packages/api/src/routers/classification.ts packages/api/src/routers/classification.test.ts packages/api/src/routers/classification.isolation.test.ts packages/api/src/routers/index.ts packages/api/src/voice-cache.ts packages/api/src/providers/contract.ts`
Expected: 기존 223개와 이번 테스트(Task 1의 11개 + 15개)가 모두 PASS, skipped 0

- [ ] **Step 9: 장부에 tree SHA를 적는다.** `pnpm dev-cycle audit`이 security 행을 요구하면 코디네이터가 `pnpm dev-cycle table F --write --upgrade`를 실행한다(증거·메모 보존).

---

### Task 4: 입력 창 프리미티브 Dialog (코디네이터)

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`(shadcn add 뒤 아래 내용으로 다시 쓴다)

**Interfaces:**
- Produces: `Dialog`(Base UI Root props: `open`, `onOpenChange`, `disablePointerDismissal`), `DialogContent`(Base UI Popup props: `initialFocus`, `finalFocus`), `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogTrigger`, `DialogPortal`, `DialogOverlay` from `@tts-pilot-app/ui/components/dialog`

- [ ] **Step 1: 더한다**

Run: `yes n | pnpm --filter @tts-pilot-app/ui exec shadcn add dialog && test -f packages/ui/src/components/dialog.tsx`
Expected: exit 0. TTY 없이 그냥 실행하면 기존 파일(`button.tsx`) 덮어쓰기 질문에서 아무 파일도 만들지 않고 exit 0이다(계획 리뷰 E3, `--yes`도 같다). `yes n`이 덮어쓰기를 거절한다.

- [ ] **Step 2: 다른 파일이 바뀌지 않았는지 본다**

Run: `git status --short packages/ui`
Expected: `?? packages/ui/src/components/dialog.tsx` 한 줄. 다른 파일이 바뀌었으면 `git checkout -- <그 파일>`로 되돌린다.

- [ ] **Step 3: 같은 앱의 AlertDialog 모양으로 다시 쓴다**

생성물에는 `sm:max-w-sm`(640~767px 시트를 384px로 덮는다, E2), `font-medium`·`rounded-none`·`text-xs`, `zoom-in-95`(DESIGN의 크기 애니메이션 금지)가 들어 있다. 파일 전체를 아래로 바꾼다. `showCloseButton`(닫기 X)은 쓰는 곳이 없어 두지 않는다.

```tsx
// packages/ui/src/components/dialog.tsx
"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import type * as React from "react";

// shadcn base-lyra dialog(2026-10-06 추가)를 같은 앱의 AlertDialog 모양에 맞췄다(T6 계획 리뷰 D2·E2):
// rounded-2xl·ring, 제목 font-bold text-xl, 확대 없이 흐려지기만, font-medium 없음.
// 767px 이하는 화면 아래에 붙는 시트, 768px 이상은 가운데 창(max-w-md). sm 단계 너비가 시트를 덮지 않게 md에서만 바꾼다
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="dialog-overlay"
			className={cn(
				"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 data-closed:animate-out data-open:animate-in",
				className,
			)}
			{...props}
		/>
	);
}

function DialogContent({ className, ...props }: DialogPrimitive.Popup.Props) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Popup
				data-slot="dialog-content"
				className={cn(
					"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-x-0 bottom-0 z-50 grid max-h-dvh gap-4 overflow-y-auto rounded-t-2xl bg-popover p-4 text-popover-foreground outline-none ring-1 ring-border duration-100 data-closed:animate-out data-open:animate-in md:inset-x-4 md:top-1/2 md:bottom-auto md:mx-auto md:w-auto md:max-w-md md:-translate-y-1/2 md:rounded-2xl",
					className,
				)}
				{...props}
			/>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("flex flex-col items-start gap-1.5 text-left", className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn("flex flex-wrap justify-end gap-2", className)}
			{...props}
		/>
	);
}

function DialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("font-bold text-xl", className)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn("text-muted-foreground text-sm/relaxed", className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
```

- [ ] **Step 4: 타입·린트·금지 패턴**

Run: `pnpm --filter @tts-pilot-app/ui check-types && pnpm exec biome check --write packages/ui/src/components/dialog.tsx && grep -nE "#[0-9a-fA-F]{3,6}\b|-\[[0-9]|font-(medium|semibold)|zoom-|sm:max-w" packages/ui/src/components/dialog.tsx`
Expected: 타입·린트 exit 0, grep 출력 없음(exit 1). 브리프(17행 B5)가 시트의 안전 영역·최대 높이를 정하면 그 클래스로 바꾼다.

---

### Task 5: 화면 순수 함수

**Files:**
- Create: `apps/web/src/lib/classes-view.ts`
- Test: `apps/web/src/lib/classes-view.test.ts`

**Interfaces:**
- Consumes: Task 1의 `NAME_MAX`·`MEMO_MAX`·`URL_MAX`·`ClassificationKind`·`FieldProblem`(`classification-rules`)
- Produces:
  - 그룹: `type Group = "channel" | ClassificationKind`, `GROUP_TEXT: Record<Group, { label; subject; object; example }>`
  - 정렬: `byName<T extends { name: string }>(items: readonly T[]): T[]`
  - 칸 오류: `type Field = "name" | "memo" | "url"`, `fieldMessage(field: Field, problem: FieldProblem): string`
  - 실패 분류: `type SaveFailure = "duplicate" | "not_found" | "failed"`, `saveFailure(error: unknown): SaveFailure`
  - 지운 뒤 포커스 행: `neighborId(ids: readonly string[], removedId: string): string | null`
  - 문구: `duplicateMessage(group)`, `doneMessage(group, name, action: "create" | "update" | "delete")`, `emptyMessage(group)`, `listFailedMessage(group)`, `deleteQuestion(group, name)`, `deleteDetail(group)`
  - 줄인 주소: `shortUrl(url: string): string`
  - 고정 문구: `MESSAGES = { notFound, saveFailed, deleteFailed, loopback }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// apps/web/src/lib/classes-view.test.ts
import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import {
	byName,
	doneMessage,
	duplicateMessage,
	fieldMessage,
	neighborId,
	saveFailure,
	shortUrl,
} from "./classes-view";

describe("byName", () => {
	it("가나다순이고 숫자는 자연 순서다(2화 < 10화)", () => {
		const names = ["10화", "2화", "나", "가", "Bob", "alice"].map((name) => ({
			name,
		}));
		expect(byName(names).map((item) => item.name)).toEqual([
			"2화",
			"10화",
			"가",
			"나",
			"alice",
			"Bob",
		]);
	});
	it("원래 배열을 바꾸지 않는다", () => {
		const items = [{ name: "나" }, { name: "가" }];
		byName(items);
		expect(items[0].name).toBe("나");
	});
});

describe("문구", () => {
	it("그룹마다 받침에 맞는 조사를 쓴다", () => {
		expect(duplicateMessage("channel")).toBe("같은 이름의 채널이 이미 있어요.");
		expect(duplicateMessage("category")).toBe(
			"같은 이름의 카테고리가 이미 있어요.",
		);
		expect(duplicateMessage("type")).toBe("같은 이름의 타입이 이미 있어요.");
		expect(doneMessage("category", "뉴스", "update")).toBe(
			"‘뉴스’ 카테고리를 고쳤어요",
		);
	});
	it("칸 문제마다 이유를 알려 준다(스펙 9절)", () => {
		expect(fieldMessage("name", "empty")).toBe("이름을 입력해 주세요.");
		expect(fieldMessage("name", "too_long")).toBe("40자까지 쓸 수 있어요.");
		expect(fieldMessage("memo", "too_long")).toBe("200자까지 쓸 수 있어요.");
		expect(fieldMessage("url", "too_long")).toBe("500자까지 쓸 수 있어요.");
		expect(fieldMessage("url", "bad_url")).toBe(
			"http:// 또는 https://로 시작하는 주소를 넣어 주세요.",
		);
	});
});

describe("saveFailure", () => {
	it("같은 이름, 없어진 항목, 나머지로 나눈다(Review Focus 5)", () => {
		expect(
			saveFailure(
				new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } }),
			),
		).toBe("duplicate");
		expect(saveFailure(new ORPCError("NOT_FOUND"))).toBe("not_found");
		expect(saveFailure(new ORPCError("INTERNAL_SERVER_ERROR"))).toBe("failed");
		expect(saveFailure(new TypeError("Failed to fetch"))).toBe("failed");
	});
});

describe("neighborId", () => {
	it("지운 행의 다음 행, 없으면 이전 행, 그마저 없으면 null(사용자 결정 2026-10-06)", () => {
		expect(neighborId(["a", "b", "c"], "b")).toBe("c");
		expect(neighborId(["a", "b", "c"], "c")).toBe("b");
		expect(neighborId(["a"], "a")).toBeNull();
		expect(neighborId(["a", "b"], "x")).toBeNull();
	});
});

describe("shortUrl", () => {
	it("스킴·www·끝 '/'를 빼고 한글 경로는 풀어 보인다", () => {
		expect(shortUrl("https://www.youtube.com/@econ")).toBe("youtube.com/@econ");
		expect(shortUrl("https://example.com/")).toBe("example.com");
		expect(shortUrl("http://a.example/x?y=1")).toBe("a.example/x?y=1");
		expect(shortUrl("https://youtube.com/@경제한입")).toBe(
			"youtube.com/@경제한입",
		);
		expect(shortUrl("https://youtube.com/@%EA%B2%BD%EC%A0%9C")).toBe(
			"youtube.com/@경제",
		);
	});
	it("풀 수 없는 퍼센트 글자는 그대로 둔다", () => {
		expect(shortUrl("https://a.example/%E0%A4%A")).toBe("a.example/%E0%A4%A");
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter web test src/lib/classes-view.test.ts`
Expected: FAIL — `./classes-view`를 찾지 못함

- [ ] **Step 3: 구현한다**

```ts
// apps/web/src/lib/classes-view.ts
import { ORPCError } from "@orpc/client";
import {
	type ClassificationKind,
	type FieldProblem,
	MEMO_MAX,
	NAME_MAX,
	URL_MAX,
} from "@tts-pilot-app/api/classification-rules";

// '채널·분류' 화면의 세 묶음. 채널은 channel 표, 카테고리·타입은 classification 표의 kind다(T6 스펙 3절)
export type Group = "channel" | ClassificationKind;

// 그룹 이름과 조사. 받침 유무가 그룹마다 달라 붙인 꼴을 둔다. 예시는 GLOSSARY의 예다(브리프 B1이 문구를 바꾸면 여기만 고친다)
export const GROUP_TEXT: Record<
	Group,
	{ label: string; subject: string; object: string; example: string }
> = {
	channel: {
		label: "채널",
		subject: "채널이",
		object: "채널을",
		example: "예: 경제 한 입, 주말 레터",
	},
	category: {
		label: "카테고리",
		subject: "카테고리가",
		object: "카테고리를",
		example: "예: 쇼핑, 지식, 뉴스, 사연, 교육",
	},
	type: {
		label: "타입",
		subject: "타입이",
		object: "타입을",
		example: "예: 차분함, 활기참, 신뢰감, 캐릭터형",
	},
};

const collator = new Intl.Collator("ko", { numeric: true });

// 이름순(가나다, '2화' < '10화'). DB 정렬(콜레이션)에 기대지 않는다(스펙 3절)
export function byName<T extends { name: string }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

export type Field = "name" | "memo" | "url";
const FIELD_MAX: Record<Field, number> = {
	name: NAME_MAX,
	memo: MEMO_MAX,
	url: URL_MAX,
};

export function fieldMessage(field: Field, problem: FieldProblem): string {
	if (problem === "empty") return "이름을 입력해 주세요.";
	if (problem === "bad_url")
		return "http:// 또는 https://로 시작하는 주소를 넣어 주세요.";
	return `${FIELD_MAX[field]}자까지 쓸 수 있어요.`;
}

// 저장·삭제 실패의 종류. 같은 이름은 이름 칸에, 없어진 항목은 창을 닫고 알림으로, 나머지는 창 안에 보인다(스펙 5절)
export type SaveFailure = "duplicate" | "not_found" | "failed";
export function saveFailure(error: unknown): SaveFailure {
	if (error instanceof ORPCError) {
		if (error.code === "CONFLICT") return "duplicate";
		if (error.code === "NOT_FOUND") return "not_found";
	}
	return "failed";
}

// 지운 뒤 포커스를 옮길 행: 다음 행 → 이전 행 → 없음(null이면 묶음의 '만들기'). 사용자 결정 2026-10-06, T5 결과 목록과 같다
export function neighborId(
	ids: readonly string[],
	removedId: string,
): string | null {
	const index = ids.indexOf(removedId);
	if (index === -1) return null;
	return ids[index + 1] ?? ids[index - 1] ?? null;
}

export const MESSAGES = {
	notFound: "이미 지워졌거나 찾을 수 없어요.",
	saveFailed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
	deleteFailed: "지우지 못했어요. 잠시 뒤 다시 해 주세요.",
	loopback: "이 주소에서는 채널·분류를 쓸 수 없어요",
} as const;

export function duplicateMessage(group: Group): string {
	return `같은 이름의 ${GROUP_TEXT[group].subject} 이미 있어요.`;
}

const DONE = { create: "만들었어요", update: "고쳤어요", delete: "지웠어요" };
export function doneMessage(
	group: Group,
	name: string,
	action: keyof typeof DONE,
): string {
	return `‘${name}’ ${GROUP_TEXT[group].object} ${DONE[action]}`;
}

export function emptyMessage(group: Group): string {
	return `아직 ${GROUP_TEXT[group].subject} 없어요.`;
}

export function listFailedMessage(group: Group): string {
	return `${GROUP_TEXT[group].label} 목록을 불러오지 못했어요`;
}

export function deleteQuestion(group: Group, name: string): string {
	return `‘${name}’ ${GROUP_TEXT[group].object} 지울까요?`;
}

export function deleteDetail(group: Group): string {
	return group === "channel"
		? "메모와 URL도 함께 지워지고 되돌릴 수 없어요."
		: "메모도 함께 지워지고 되돌릴 수 없어요.";
}

// 목록에 보일 줄인 주소: 스킴·www·끝 '/'를 빼고 퍼센트 글자를 푼다(크롬에서 복사한 한글 핸들은 퍼센트 인코딩이다, 계획 리뷰 P9 기각).
// 전체 주소는 title로 준다
export function shortUrl(url: string): string {
	const { host, pathname, search } = new URL(url);
	const path = `${pathname === "/" ? "" : pathname}${search}`;
	let shown = path;
	try {
		shown = decodeURI(path);
	} catch {
		// 깨진 퍼센트 글자는 그대로 보인다
	}
	return `${host.replace(/^www\./, "")}${shown}`;
}
```

- [ ] **Step 4: 통과를 확인하고 포맷한다**

Run: `pnpm --filter web test src/lib/classes-view.test.ts && pnpm exec biome check --write apps/web/src/lib/classes-view.ts apps/web/src/lib/classes-view.test.ts`
Expected: PASS 8개

- [ ] **Step 5: 브리프(17행)와 문구를 맞춘다.** 브리프의 빈 상태·확인 창·알림 문구가 위와 다르면 `GROUP_TEXT`와 문구 함수를 브리프대로 바꾸고, 테스트 기대값도 고친 뒤 다시 돌린다. 장부에 tree SHA를 적는다.

---

### Task 6: `/classes` 화면

편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`와 `docs/briefs/classes.md`(17행 확정본)를 읽는다. 기준은 둘로 나뉜다.
- 구조·상태·포커스·접근성: 스펙 4절과 '계획 리뷰에서 바꾼 것'이 정본이다.
- 간격·크기·문구: 브리프가 이긴다.

**Files:**
- Create: `apps/web/src/app/(app)/classes/page.tsx`
- Create: `apps/web/src/components/classes-board.tsx`
- Create: `apps/web/src/components/class-group.tsx`
- Create: `apps/web/src/components/class-form-dialog.tsx`
- Create: `apps/web/src/components/class-delete-dialog.tsx`

**Interfaces:**
- Consumes:
  - Task 1(`classification-rules`): `nameProblem`·`memoProblem`·`urlProblem`·`cleanText`·`MEMO_MAX`. `providers/trial-options`의 `codePoints`도 쓴다.
  - Task 3: 프로시저 8개
  - Task 4: `Dialog`·`DialogContent`·`DialogHeader`·`DialogFooter`·`DialogTitle`
  - Task 5: 함수 전부
  - 기존 컴포넌트·유틸:
    - `PageHeader`, `LoopbackNotice`(`./notice`), `ReloadButton`(`./voice-problem`)
    - `failureOf`(`@/lib/voice-failure`), `plain`(`@/lib/voice-view`)
    - `@tts-pilot-app/ui`의 `Button`·`Input`·`Textarea`·`Label`·`Skeleton`·`Spinner`·`Tooltip*`·`AlertDialog*`, `cn`(`@tts-pilot-app/ui/lib/utils`)
    - `orpc`·`client`(`@/utils/orpc`), `toast`(`sonner`)
- Produces: `ClassesBoard`(props 없음). `class-group.tsx`가 `ClassItem` 타입 `{ id: string; name: string; memo: string | null; url?: string | null }`을 export한다.

- [ ] **Step 1: 페이지**

```tsx
// apps/web/src/app/(app)/classes/page.tsx
import type { Metadata } from "next";

import { ClassesBoard } from "@/components/classes-board";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "채널·분류" };

// Server Component. db 모듈을 부르지 않는다. 조회·변경은 ClassesBoard가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드)
export default function ClassesPage() {
	return (
		<>
			<PageHeader
				title="채널·분류"
				description="성우와 대본을 정리할 채널과 카테고리·타입을 만들어요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<ClassesBoard />
			</div>
		</>
	);
}
```

- [ ] **Step 2: 본문**

```tsx
// apps/web/src/components/classes-board.tsx
"use client";

import { useQuery } from "@tanstack/react-query";

import { MESSAGES } from "@/lib/classes-view";
import { failureOf } from "@/lib/voice-failure";
import { orpc } from "@/utils/orpc";

import { ClassGroup } from "./class-group";
import { LoopbackNotice } from "./notice";

// 묶음이 오류를 직접 보이므로 전역 알림을 끄고, 소유자 없음이 바로 보이게 다시 시도하지 않는다(연결 상태와 같다)
const listOptions = {
	retry: false,
	networkMode: "always",
	meta: { toast: false },
} as const;

// '채널·분류' 본문(T6 스펙 4절). 조회 둘(채널, 카테고리·타입)을 세 묶음에 나눠 준다. 넓은 화면에서 행이 벌어지지 않게 max-w-3xl(계획 리뷰 D10)
export function ClassesBoard() {
	const channels = useQuery(orpc.channelList.queryOptions(listOptions));
	const classifications = useQuery(
		orpc.classificationList.queryOptions(listOptions),
	);
	if (
		failureOf(channels.error) === "unauthorized" ||
		failureOf(classifications.error) === "unauthorized"
	)
		return <LoopbackNotice title={MESSAGES.loopback} />;
	// 다시 받은 결과가 성공이면 true. 묶음이 포커스를 머리로 옮긴다(계획 리뷰 D6)
	const retryChannels = async () => !(await channels.refetch()).isError;
	const retryClassifications = async () =>
		!(await classifications.refetch()).isError;
	return (
		<div className="flex max-w-3xl flex-col gap-10">
			<ClassGroup
				group="channel"
				items={channels.data}
				failed={channels.isError}
				retrying={channels.isFetching}
				onRetry={retryChannels}
			/>
			{(["category", "type"] as const).map((kind) => (
				<ClassGroup
					key={kind}
					group={kind}
					items={classifications.data?.filter((item) => item.kind === kind)}
					failed={classifications.isError}
					retrying={classifications.isFetching}
					onRetry={retryClassifications}
				/>
			))}
		</div>
	);
}
```

- [ ] **Step 3: 묶음**

```tsx
// apps/web/src/components/class-group.tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import {
	ExternalLink,
	type LucideIcon,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import {
	byName,
	emptyMessage,
	GROUP_TEXT,
	type Group,
	listFailedMessage,
	neighborId,
	shortUrl,
} from "@/lib/classes-view";

import { ClassDeleteDialog } from "./class-delete-dialog";
import { ClassFormDialog } from "./class-form-dialog";
import { ReloadButton } from "./voice-problem";

export type ClassItem = {
	id: string;
	name: string;
	memo: string | null;
	url?: string | null;
};

// 행의 아이콘 버튼(44px, 툴팁). 접근 이름은 '{이름} 고치기'처럼 항목 이름을 담는다(사용자 결정 2026-10-06, T5 결과 행과 같다)
function RowAction({
	id,
	label,
	tip,
	icon: Icon,
	onClick,
}: {
	id?: string;
	label: string;
	tip: string;
	icon: LucideIcon;
	onClick: (button: HTMLButtonElement) => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						id={id}
						variant="ghost"
						size="icon-lg"
						aria-label={label}
						onClick={(event) => onClick(event.currentTarget)}
					/>
				}
			>
				<Icon aria-hidden="true" />
			</TooltipTrigger>
			<TooltipContent>{tip}</TooltipContent>
		</Tooltip>
	);
}

// 지운 뒤 다음 행으로 포커스를 옮길 때 찾는 id(그 행의 고치기 버튼)
const editButtonId = (id: string) => `class-${id}-edit`;

// 묶음 하나(머리, 행 목록 또는 로딩·빈·오류). 입력 창과 삭제 확인을 열 때만 마운트하고(계획 리뷰 P12), 연 버튼을 기억한다(E6).
// 닫힌 뒤 포커스: 취소·저장은 연 버튼, 지운 뒤는 다음 행 → 이전 행 → '만들기'(사용자 결정), 없어진 항목은 '만들기'
export function ClassGroup({
	group,
	items,
	failed,
	retrying,
	onRetry,
}: {
	group: Group;
	items: ClassItem[] | undefined;
	failed: boolean;
	retrying: boolean;
	onRetry: () => Promise<boolean>;
}) {
	const text = GROUP_TEXT[group];
	const headingId = `class-group-${group}`;
	const headingRef = useRef<HTMLHeadingElement>(null);
	const createRef = useRef<HTMLButtonElement>(null);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	const [editing, setEditing] = useState<ClassItem | "new" | null>(null);
	const [removing, setRemoving] = useState<ClassItem | null>(null);
	const sorted = items ? byName(items) : undefined;

	function open(button: HTMLButtonElement, show: () => void) {
		openerRef.current = button;
		show();
	}
	function afterRemove(id: string): HTMLElement | null {
		const next = sorted
			? neighborId(
					sorted.map((item) => item.id),
					id,
				)
			: null;
		return (next && document.getElementById(editButtonId(next))) || createRef.current;
	}
	// 다시 받기에 성공하면 버튼이 사라지므로 포커스를 묶음 머리로 옮긴다(계획 리뷰 D6)
	async function retry() {
		if (await onRetry()) headingRef.current?.focus();
	}

	let body: React.ReactNode;
	if (failed && !sorted)
		body = (
			<div className="flex flex-wrap items-center gap-3">
				<p className="text-muted-foreground text-sm">
					{listFailedMessage(group)}
				</p>
				<ReloadButton reloading={retrying} onReload={() => void retry()} />
			</div>
		);
	else if (!sorted)
		body = <Skeleton aria-hidden="true" className="h-16 w-full rounded-2xl" />;
	else if (sorted.length === 0)
		body = (
			<p className="text-muted-foreground text-sm">
				{emptyMessage(group)} {text.example}
			</p>
		);
	else
		body = (
			<ul className="divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-border ring-inset">
				{sorted.map((item) => (
					<li key={item.id} className="flex items-start gap-3 p-4">
						<div className="min-w-0 flex-1">
							<p className="wrap-break-word font-bold">{item.name}</p>
							{item.memo ? (
								<p className="mt-1 wrap-break-word text-muted-foreground text-sm">
									{item.memo}
								</p>
							) : null}
							{item.url ? (
								<a
									href={item.url}
									target="_blank"
									rel="noopener noreferrer"
									title={item.url}
									className="mt-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-md text-primary text-sm underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
								>
									<span className="truncate">{shortUrl(item.url)}</span>
									<ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
									<span className="sr-only">(새 탭)</span>
								</a>
							) : null}
						</div>
						<div className="flex shrink-0">
							<RowAction
								id={editButtonId(item.id)}
								label={`${item.name} 고치기`}
								tip="고치기"
								icon={Pencil}
								onClick={(button) => open(button, () => setEditing(item))}
							/>
							<RowAction
								label={`${item.name} 지우기`}
								tip="지우기"
								icon={Trash2}
								onClick={(button) => open(button, () => setRemoving(item))}
							/>
						</div>
					</li>
				))}
			</ul>
		);

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2
					id={headingId}
					ref={headingRef}
					tabIndex={-1}
					className="flex items-baseline gap-2 font-bold text-lg outline-none"
				>
					{text.label}
					{sorted ? (
						<span className="font-normal text-muted-foreground text-sm tabular-nums">
							{sorted.length}
						</span>
					) : null}
				</h2>
				<Button
					ref={createRef}
					size="lg"
					variant="outline"
					onClick={(event) =>
						open(event.currentTarget, () => setEditing("new"))
					}
				>
					<Plus aria-hidden="true" data-icon="inline-start" />
					{text.label} 만들기
				</Button>
			</div>
			{body}
			{editing ? (
				<ClassFormDialog
					group={group}
					editing={editing}
					openerRef={openerRef}
					createRef={createRef}
					onClose={() => setEditing(null)}
				/>
			) : null}
			{removing ? (
				<ClassDeleteDialog
					group={group}
					item={removing}
					openerRef={openerRef}
					focusAfterDelete={() => afterRemove(removing.id)}
					onClose={() => setRemoving(null)}
				/>
			) : null}
		</section>
	);
}
```

- [ ] **Step 4: 입력 창**

```tsx
// apps/web/src/components/class-form-dialog.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	cleanText,
	MEMO_MAX,
	memoProblem,
	nameProblem,
	urlProblem,
} from "@tts-pilot-app/api/classification-rules";
import { codePoints } from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Label } from "@tts-pilot-app/ui/components/label";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	doneMessage,
	duplicateMessage,
	type Field,
	fieldMessage,
	GROUP_TEXT,
	type Group,
	MESSAGES,
	saveFailure,
} from "@/lib/classes-view";
import { plain } from "@/lib/voice-view";
import { client, orpc } from "@/utils/orpc";

import type { ClassItem } from "./class-group";

type Values = { name: string; memo: string; url: string };
type Problems = Partial<Record<Field, string>>;

// 입력 칸 44px, 767px 이하 글자 16px(iOS 확대 방지, 계획 리뷰 D1). sentence-bar와 같다
const fieldClass = "min-h-11 rounded-xl text-base md:text-sm";

// 그룹과 만들기·고치기에 맞는 프로시저 하나를 부른다. 채널만 URL을 보낸다.
// 반환 꼴을 이름 하나로 좁혀 두 프로시저 결과의 합집합이 채널 타입으로 추론되지 않게 한다(계획 리뷰 E1)
function saveItem(
	group: Group,
	editing: ClassItem | "new",
	values: Values,
): Promise<{ name: string }> {
	if (group === "channel")
		return editing === "new"
			? client.channelCreate(values)
			: client.channelUpdate({ id: editing.id, ...values });
	const { name, memo } = values;
	return editing === "new"
		? client.classificationCreate({ kind: group, name, memo })
		: client.classificationUpdate({ id: editing.id, name, memo });
}

function initialValues(editing: ClassItem | "new"): Values {
	return editing === "new"
		? { name: "", memo: "", url: "" }
		: { name: editing.name, memo: editing.memo ?? "", url: editing.url ?? "" };
}

function problemsOf(group: Group, values: Values): Problems {
	const problems: Problems = {};
	const name = nameProblem(values.name);
	if (name) problems.name = fieldMessage("name", name);
	const url = group === "channel" ? urlProblem(values.url) : null;
	if (url) problems.url = fieldMessage("url", url);
	const memo = memoProblem(values.memo);
	if (memo) problems.memo = fieldMessage("memo", memo);
	return problems;
}

// 만들기·고치기 입력 창(스펙 4절). 열 때만 마운트되어 값은 처음 한 번 정한다(계획 리뷰 P12).
// 저장 중에는 칸을 읽기 전용으로 두고(포커스는 갈 수 있게, E4·D5) 창을 닫지 않는다. 값을 바꾼 동안은 바깥 누르기로 닫히지 않는다(사용자 결정).
// 닫힌 뒤 포커스: 없어진 항목(NOT_FOUND)이면 묶음 '만들기', 아니면 연 버튼(E6)
export function ClassFormDialog({
	group,
	editing,
	openerRef,
	createRef,
	onClose,
}: {
	group: Group;
	editing: ClassItem | "new";
	openerRef: RefObject<HTMLButtonElement | null>;
	createRef: RefObject<HTMLButtonElement | null>;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [initial] = useState(() => initialValues(editing));
	const [values, setValues] = useState(initial);
	const [problems, setProblems] = useState<Problems>({});
	const [failure, setFailure] = useState<string | null>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	// 두 번 누름·Enter 연타는 렌더를 기다리지 않고 막는다(계획 리뷰 E11)
	const sendingRef = useRef(false);
	const goneRef = useRef(false);
	const ids = useId();
	const action = editing === "new" ? "create" : "update";
	const dirty =
		values.name !== initial.name ||
		values.memo !== initial.memo ||
		values.url !== initial.url;
	const save = useMutation({
		mutationFn: (input: Values) => saveItem(group, editing, input),
		// 실패해도 처리됐을 수 있으므로 목록을 다시 받는다(스펙 5절)
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey:
					group === "channel"
						? orpc.channelList.key()
						: orpc.classificationList.key(),
			}),
	});

	function submit() {
		if (sendingRef.current) return;
		const found = problemsOf(group, values);
		setProblems(found);
		setFailure(null);
		const first = (Object.keys(found) as Field[])[0];
		if (first) {
			// 오류 문구는 role="alert"라 포커스보다 늦게 붙어도 읽힌다(D5)
			document.getElementById(`${ids}-${first}`)?.focus();
			return;
		}
		sendingRef.current = true;
		save.mutate(values, {
			onSuccess: (saved) => {
				toast.success(doneMessage(group, saved.name, action));
				onClose();
			},
			onError: (error) => {
				const kind = saveFailure(error);
				if (kind === "not_found") {
					goneRef.current = true;
					toast.error(MESSAGES.notFound);
					onClose();
					return;
				}
				if (kind === "duplicate") setProblems({ name: duplicateMessage(group) });
				else setFailure(MESSAGES.saveFailed);
				// 칸이 읽기 전용(disabled 아님)이라 바로 포커스된다(E4)
				nameRef.current?.focus();
			},
			onSettled: () => {
				sendingRef.current = false;
			},
		});
	}

	const errorId = (name: Field) => `${ids}-${name}-error`;
	const describedBy = (name: Field, extra?: string) =>
		[problems[name] ? errorId(name) : null, extra].filter(Boolean).join(" ") ||
		undefined;
	const bind = (name: Field) => ({
		id: `${ids}-${name}`,
		name,
		value: values[name],
		readOnly: save.isPending,
		"aria-invalid": problems[name] ? true : undefined,
		"aria-describedby": describedBy(
			name,
			name === "memo" ? `${ids}-memo-count` : undefined,
		),
		onChange: (
			event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
		) => {
			const { value } = event.target;
			setValues((current) => ({ ...current, [name]: value }));
			setProblems((current) => ({ ...current, [name]: undefined }));
		},
	});
	const error = (name: Field) =>
		problems[name] ? (
			<p id={errorId(name)} role="alert" className="text-sm text-warning">
				{problems[name]}
			</p>
		) : null;
	const memoCount = codePoints(cleanText(values.memo));

	return (
		<Dialog
			open
			disablePointerDismissal={dirty}
			onOpenChange={(open) => {
				if (!open && !save.isPending) onClose();
			}}
		>
			<DialogContent
				initialFocus={nameRef}
				finalFocus={() =>
					(goneRef.current ? createRef.current : openerRef.current) ?? true
				}
			>
				<form
					noValidate
					className="flex flex-col gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter") return;
						// 한글 조합을 끝내는 Enter는 저장이 아니다. Safari는 compositionend 뒤에 keyCode 229로 온다(계획 리뷰 D12)
						if (event.nativeEvent.isComposing || event.keyCode === 229) {
							event.preventDefault();
							return;
						}
						// 메모(여러 줄 칸)에서도 Enter는 저장이다. 줄바꿈은 저장할 때 공백으로 정리된다(사용자 결정 2026-10-06)
						if (event.target instanceof HTMLTextAreaElement) {
							event.preventDefault();
							submit();
						}
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{GROUP_TEXT[group].label}{" "}
							{editing === "new" ? "만들기" : "고치기"}
						</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`${ids}-name`} className="font-bold text-sm">
							이름
						</Label>
						<Input
							ref={nameRef}
							autoComplete="off"
							className={fieldClass}
							{...bind("name")}
						/>
						{error("name")}
					</div>
					{group === "channel" ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor={`${ids}-url`} className="font-bold text-sm">
								URL (선택)
							</Label>
							<Input
								type="url"
								inputMode="url"
								autoComplete="url"
								placeholder="https://"
								className={fieldClass}
								{...bind("url")}
							/>
							{error("url")}
						</div>
					) : null}
					<div className="flex flex-col gap-2">
						<div className="flex items-baseline justify-between gap-3">
							<Label htmlFor={`${ids}-memo`} className="font-bold text-sm">
								메모 (선택)
							</Label>
							<span
								id={`${ids}-memo-count`}
								className={cn(
									"text-sm tabular-nums",
									memoCount >= 190 ? "text-warning" : "text-muted-foreground",
								)}
							>
								{plain.format(memoCount)} / {MEMO_MAX}자
							</span>
						</div>
						<Textarea
							autoComplete="off"
							className="min-h-20 rounded-xl text-base md:text-sm"
							{...bind("memo")}
						/>
						{error("memo")}
					</div>
					{failure ? (
						<p role="alert" className="text-sm text-warning">
							{failure}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							size="lg"
							variant="outline"
							disabled={save.isPending}
							focusableWhenDisabled
							onClick={onClose}
						>
							취소
						</Button>
						<Button
							type="submit"
							size="lg"
							disabled={save.isPending}
							focusableWhenDisabled
						>
							{save.isPending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							저장하기
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 5: 삭제 확인**

```tsx
// apps/web/src/components/class-delete-dialog.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@tts-pilot-app/ui/components/alert-dialog";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";

import {
	deleteDetail,
	deleteQuestion,
	doneMessage,
	type Group,
	MESSAGES,
	saveFailure,
} from "@/lib/classes-view";
import { client, orpc } from "@/utils/orpc";

import type { ClassItem } from "./class-group";

// 삭제 확인(스펙 4절). 열 때만 마운트된다. 첫 포커스는 '취소'.
// 지운 뒤·없어진 항목이면 포커스를 다음 행 → 이전 행 → '만들기'로(사용자 결정 2026-10-06), 취소면 연 버튼으로 돌린다.
// 실패하면 창을 닫지 않고 이유를 보이며 포커스를 '취소'로 둔다('취소'는 막지 않는다, 계획 리뷰 E4). 처리됐을 수 있으므로 목록은 늘 다시 받는다.
// AlertDialogAction은 Close가 아닌 Button이라 눌러도 닫히지 않는다(packages/ui alert-dialog.tsx)
export function ClassDeleteDialog({
	group,
	item,
	openerRef,
	focusAfterDelete,
	onClose,
}: {
	group: Group;
	item: ClassItem;
	openerRef: RefObject<HTMLButtonElement | null>;
	focusAfterDelete: () => HTMLElement | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const sendingRef = useRef(false);
	const doneRef = useRef(false);
	const [failed, setFailed] = useState(false);
	const remove = useMutation({
		mutationFn: () =>
			group === "channel"
				? client.channelDelete({ id: item.id })
				: client.classificationDelete({ id: item.id }),
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey:
					group === "channel"
						? orpc.channelList.key()
						: orpc.classificationList.key(),
			}),
	});

	function confirm() {
		if (sendingRef.current) return;
		sendingRef.current = true;
		setFailed(false);
		remove.mutate(undefined, {
			onSuccess: () => {
				doneRef.current = true;
				toast.success(doneMessage(group, item.name, "delete"));
				onClose();
			},
			onError: (error) => {
				if (saveFailure(error) === "not_found") {
					doneRef.current = true;
					toast.error(MESSAGES.notFound);
					onClose();
					return;
				}
				setFailed(true);
				cancelRef.current?.focus();
			},
			onSettled: () => {
				sendingRef.current = false;
			},
		});
	}

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open && !remove.isPending) onClose();
			}}
		>
			<AlertDialogContent
				initialFocus={cancelRef}
				finalFocus={() =>
					(doneRef.current ? focusAfterDelete() : openerRef.current) ?? true
				}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>{deleteQuestion(group, item.name)}</AlertDialogTitle>
					<AlertDialogDescription>{deleteDetail(group)}</AlertDialogDescription>
				</AlertDialogHeader>
				{failed ? (
					<p role="alert" className="text-sm text-warning">
						{MESSAGES.deleteFailed}
					</p>
				) : null}
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg">
						취소
					</AlertDialogCancel>
					<AlertDialogAction
						size="lg"
						variant="destructive"
						disabled={remove.isPending}
						focusableWhenDisabled
						onClick={confirm}
					>
						{remove.isPending ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						지우기
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

- [ ] **Step 6: 타입·린트·web 테스트·금지 패턴**

Run: `pnpm --filter web check-types && pnpm exec biome check --write "apps/web/src/app/(app)/classes/page.tsx" apps/web/src/components/classes-board.tsx apps/web/src/components/class-group.tsx apps/web/src/components/class-form-dialog.tsx apps/web/src/components/class-delete-dialog.tsx && pnpm --filter web test && grep -nE "#[0-9a-fA-F]{3,6}\b|-\[[0-9]|font-(medium|semibold)|text-destructive" "apps/web/src/app/(app)/classes/page.tsx" apps/web/src/components/classes-board.tsx apps/web/src/components/class-group.tsx apps/web/src/components/class-form-dialog.tsx apps/web/src/components/class-delete-dialog.tsx packages/ui/src/components/dialog.tsx`
Expected: 타입·린트 exit 0, web 테스트 모두 PASS(기존 107 + Task 5의 8), grep 출력 없음(exit 1)

- [ ] **Step 7: React Compiler 확인(계획 리뷰 E7)**

Run: `pnpm --filter web build`(코디네이터, 개발 서버와 따로 돈다)
Expected: exit 0. 빌드 출력이나 `.next` 진단에 이 다섯 파일의 컴파일러 건너뜀(bail out) 경고가 없다. 있으면 그 줄을 장부에 적고 원인 구문(렌더 중 ref 쓰기, try/catch)을 고친다.

- [ ] **Step 8: 장부에 tree SHA를 적는다.** 화면 확인(너비·테마 캡처)은 코디네이터가 20행에서 한다.

---

### Task 7: 메뉴와 작업실 흐름 지도

**Files:**
- Modify: `apps/web/src/components/app-nav.tsx`
- Modify: `apps/web/src/app/(app)/studio/page.tsx:17`

**Interfaces:**
- Consumes: 없음
- Produces: 메뉴 '채널·분류' → `/classes`(사이드바는 열린 화면 목록, 767px 이하는 더보기 안 '열린 화면' 줄과 더보기 버튼 현재 위치), 흐름 지도 '채널' → `/classes`

- [ ] **Step 1: 열린 화면에 더하고 '준비 중'에서 뺀다**

`app-nav.tsx`의 `OPEN_ITEMS`와 `UPCOMING_ITEMS`를 아래로 바꾼다.

```tsx
// 열린 화면. 767px 이하 위 막대는 4칸 그대로다(bar 셋 + 더보기, T6 스펙 2절 '휴대폰 위 막대'). bar가 아닌 화면은 더보기 안 '열린 화면' 줄에 둔다.
// 768px 이상에서는 모두 사이드바 위쪽 목록에 보인다. 뒤 TASK가 여는 화면도 bar: false로 더한다
const OPEN_ITEMS: {
	label: string;
	icon: LucideIcon;
	href: Route;
	bar: boolean;
}[] = [
	{ label: "음성 작업실", icon: WandSparkles, href: "/studio", bar: true },
	{ label: "성우 캐스팅", icon: AudioWaveform, href: "/casting", bar: true },
	{ label: "연결 상태", icon: Link2, href: "/connections", bar: true },
	{ label: "채널·분류", icon: Tag, href: "/classes", bar: false },
];

// 아직 만들지 않은 화면('준비 중', 사이트맵 "예외"). 그 화면을 여는 TASK가 OPEN_ITEMS로 옮긴다.
const UPCOMING_ITEMS: { label: string; icon: LucideIcon }[] = [
	{ label: "대본 보관함", icon: FileText },
	{ label: "성우 보관함", icon: UserRound },
	{ label: "프로젝트", icon: Folder },
	{ label: "프리셋", icon: SlidersHorizontal },
	{ label: "내 보이스", icon: Mic },
];
```

- [ ] **Step 2: 위 막대에서는 bar만 보이게 하고, 더보기 버튼에 현재 위치를 표시한다**

`AppNav` 안 `const [moreOpen, …]` 아래에 한 줄을 더한다.

```tsx
	// 더보기 안 화면에 있으면 더보기 버튼이 활성 메뉴와 같은 표현이고 접근 이름에 현재 화면을 담는다(provider-status 브리프 96행, 계획 리뷰 D3)
	const moreCurrent = OPEN_ITEMS.find(
		(item) => !item.bar && item.href === pathname,
	);
```

`OPEN_ITEMS.map` 안의 `<li key={item.href}>`를 아래로 바꾼다. 767px 이하에서 bar가 아니면 숨기고, 768px 이상에서는 보인다.

```tsx
<li key={item.href} className={item.bar ? undefined : "hidden md:block"}>
```

더보기 버튼(`ref={moreButtonRef}`)의 `className`과 속성을 아래로 바꾼다. 나머지 속성(`ref`, `type`, `aria-expanded`, `aria-controls`, `onClick`)과 안의 아이콘·글자는 그대로다.

```tsx
							aria-label={moreCurrent ? `더보기, 현재 ${moreCurrent.label}` : undefined}
							className={cn(
								itemClass,
								"w-full aria-expanded:bg-sidebar-accent aria-expanded:font-bold aria-expanded:text-sidebar-accent-foreground",
								moreCurrent
									? "bg-sidebar-accent font-bold text-sidebar-accent-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
							)}
```

- [ ] **Step 3: 더보기 안에 '열린 화면' 줄을 더한다**

`<div id="app-nav-more" …>` 바로 안, `<div className="md:mt-2">`('다음에 열릴 화면' 묶음) 앞에 아래를 넣는다. 768px 이상에서는 위 목록에 이미 있으므로 숨긴다. 누른 링크는 패널과 함께 숨으므로 포커스를 더보기 버튼으로 옮긴다(provider-status 브리프 95행이 이 TASK에 맡긴 규칙, 계획 리뷰 D4).

```tsx
{/* 767px 이하: 위 막대에 없는 열린 화면(T6 스펙 2절). 768px 이상은 위 목록에 있다 */}
<ul aria-label="열린 화면" className="flex flex-col gap-1 md:hidden">
	{OPEN_ITEMS.filter((item) => !item.bar).map((item) => {
		const Icon = item.icon;
		const active = pathname === item.href;
		return (
			<li key={item.href}>
				<Link
					href={item.href}
					aria-current={active ? "page" : undefined}
					onClick={() => {
						setMoreOpen(false);
						// 누른 링크는 닫히는 패널과 함께 숨는다. 포커스가 body로 빠지지 않게 더보기 버튼으로 옮긴다
						moreButtonRef.current?.focus();
					}}
					className={cn(
						rowClass,
						active
							? "bg-sidebar-accent font-bold text-sidebar-accent-foreground"
							: "text-foreground hover:bg-accent hover:text-accent-foreground",
					)}
				>
					<Icon aria-hidden="true" className="size-4.5 shrink-0" />
					<span className="text-sm">{item.label}</span>
				</Link>
			</li>
		);
	})}
</ul>
```

더보기의 Tab 가두기는 `morePanelRef` 안의 `a[href]`를 이미 모으므로 바꾸지 않는다. 위 막대 머리 주석(37행 "4칸: 열린 화면 셋 + 더보기")은 Step 1 주석으로 바뀐다.

- [ ] **Step 4: 흐름 지도 '채널'을 링크로 바꾼다**

`apps/web/src/app/(app)/studio/page.tsx`의 STEPS 첫 줄을 바꾼다.

```tsx
	{ name: "채널", text: "영상 채널과 분류를 정해요", href: "/classes" },
```

- [ ] **Step 5: 타입·린트**

Run: `pnpm --filter web check-types && pnpm exec biome check --write apps/web/src/components/app-nav.tsx "apps/web/src/app/(app)/studio/page.tsx"`
Expected: exit 0. `typedRoutes: true`라 `/classes` 페이지(Task 6)가 먼저 있어야 `Route` 타입이 통과한다(그래서 Task 7은 Task 6 뒤다).

- [ ] **Step 6: 장부에 tree SHA를 적는다.**

---

### Task 8: 문서

**Files:**
- Create: `docs/adr/0004-channel-classification-storage.md`
- Modify: `docs/domain/project.md`(기능, 화면과 URL, API, 데이터 모델 표)
- Modify: `docs/briefs/site-map.md`:
  - 페이지 표에 `/classes` 행을 더한다.
  - 공통 틀의 메뉴·휴대폰 막대·더보기 줄을 고친다(열린 화면 줄, 현재 위치 표시, 이동 뒤 포커스).
  - '준비 중' 표에서 채널·분류 두 줄을 지운다.
  - 머리에 변경 기록 한 줄을 더한다.
- Modify: `docs/briefs/app-shell.md`('준비 중' 메뉴 개수 6 → 5, 더보기 안 '열린 화면' 줄과 현재 위치 규칙)
- Modify: `docs/briefs/provider-status.md`(95·96행 더보기 규칙에 "T6에서 적용(`/classes`)" 표시)
- Modify: `docs/plans/implementation-roadmap.md`(T6 구현 상태 한 줄. T7·T8·T14 메모는 스펙 13절 그대로. T12 절이 있으면 T12 메모)

- [ ] **Step 1: ADR**

```markdown
# 0004. 채널과 분류(카테고리·타입)의 저장 구조, 소유자 외래 키 보류

- 상태: 확정(2026-10-06, 사용자). 관련: [T6 스펙](../plans/tasks/T06-channels-and-classifications.md) 2·3절.

## 결정
- 채널은 `channel` 표에 따로 둔다. 카테고리·타입은 `classification` 표 하나에 `kind`('category'·'type')로 둔다.
- 같은 소유자·같은 그룹 안에서 이름은 대소문자를 무시하고 유일하다(`lower(name)` 유니크 인덱스 `channel_name`·`classification_name`). 이 인덱스 위반만 `CONFLICT`로 알린다.
- 소유자 컬럼 `owner_id`에 `user` 외래 키를 걸지 않는다.

## 이유
- 채널에만 붙는 것이 있다: URL, 기본 프리셋(REQ-08), 프리셋·저장 대본의 선택 채널(REQ-06·08). 한 표에 섞으면 "채널만 가리키는" 외래 키를 걸 수 없다(One True Lookup Table 문제). 카테고리·타입은 이름·메모뿐인 N:M 이름표라 한 표가 맞다.
- 하나만 고르는 단위와 여러 개 붙이는 라벨을 다른 자원으로 두는 것이 흔하다(GitHub milestone·labels, Todoist project·labels).
- 지금 소유자는 로컬 관리자 고정 문자열 `local-admin`이고 `user` 행이 없다. 가짜 사용자 행보다 T14 로그인 때 `owner_id`를 옮기는 갱신 한 번이 단순하다.

## 결과
- T7 성우 연결은 `channel`·`classification` 각각에 연결 표와 `on delete cascade`, 분류 쪽 id 인덱스를 둔다.
- T8 프리셋·T12 대본은 `channel`을 일반 외래 키(`on delete set null`)로 가리킨다.
- T14는 `channel`·`classification`·`trial_generation`의 `owner_id`를 실제 사용자 id로 옮기고, 그때 외래 키를 걸지 정한다.
- 버린 안: 한 표(채널 참조마다 앱 검사 또는 `(id, kind)` 복합 외래 키), 세 표(같은 CRUD와 연결 표가 세 벌).
```

- [ ] **Step 2: `docs/domain/project.md`**
  - API 표에 프로시저 8개를 더한다.
    - 용어 칸: '채널' 또는 '분류, 카테고리, 타입'
    - 보호: `protectedProcedure`
    - 입력: Task 3 Interfaces
    - 설명: 이름 인덱스 위반 `CONFLICT`, 없거나 남의 것 `NOT_FOUND`
  - 데이터 모델 표에 두 행을 더한다. 소유자 칸은 둘 다 `owner_id`(서버가 정한 소유자, `user` 외래 키 없음, ADR 0004)다.
    - `channel`: 용어 채널
    - `classification`: 용어 분류·카테고리·타입
  - 화면과 URL 표에 `/classes`를 더한다.
  - 기능 절에 채널·분류 관리 한 줄을 더한다.
- [ ] **Step 3: 브리프 셋과 로드맵을 위 Files 목록대로 고친다.** 로드맵 T6 상태 칸(4절 표)은 라운드를 닫을 때 '완료'로 바꾼다. 지금은 '진행'이다.
- [ ] **Step 4: 대조표 35행 증거에 고친 파일 목록을 적는다.**

---

## 수용 기준과 확인 위치

| 스펙 8절 | 확인 |
|---|---|
| 1 만들기·고치기·지우기·새로 고침 | Task 3 왕복 테스트, QA S2·S3·S6 |
| 2 이름순 | Task 5 `byName`, QA S2 |
| 3 같은 그룹 중복(대소문자·공백·NFC·보이지 않는 글자), 다른 그룹 허용 | Task 1 `cleanText`, Task 3 CONFLICT 셋, QA S4 |
| 4 경계 입력 화면·서버 거절 | Task 1·3 경계, QA S5 |
| 5 확인 창, 취소·Esc | QA S6·S12 |
| 6 2계정 격리 | Task 3 격리 테스트(소유자 덮기 포함) |
| 7 소유자 없음 | Task 3 소유자 없음 테스트, QA S9 |
| 8 실패 시 성공 알림 없음·입력 유지 | Task 6 `submit`·`confirm`(`onError`), QA S7·S8 |
| 9 메뉴·더보기·흐름 지도 | Task 7, QA S10 |
| 10 너비(700 포함)·테마·키보드·포커스·한글 Enter | QA S11·S12·S14·S15 |
| 11 오류 예산 0 | 20·26·29행 |

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

- 19 타입·린트·빌드: `pnpm check-types`, `pnpm exec biome check .`(기존 기준선 10 errors·2 warnings·2 infos와 비교, 변경 파일 0), `pnpm build`.
- 20 런타임: next-dev-loop(`/_next/mcp get_errors`), ego-browser로 1440·390 캡처를 `tasks/evidence/T06/`에 둔다. 실제 로컬 DB를 쓰는 화면이다(공급자 호출 없음). 그래서 흉내 응답 없이 개발 서버에서 확인하고, QA로 만든 항목은 끝나고 지운다.
- 21·22 critique·audit + web-design-guidelines(메인 세션), 23 polish 한 번, 24 재확인.
- 25 DESIGN.md: 새 컴포넌트 규칙(입력 창·아래 시트, 삭제 확인, 묶음 목록, 행 아이콘 버튼)이 생기면 `document`로 merge할지 사용자에게 묻는다.
- 27 ponytail-review(이번 diff와 같은 디렉터리), 28 bts-reviewer(code) 전체 diff.
- 29 QA: 스펙 10절 S1~S15. S8 DB 멈춤은 코디네이터만 하고 바로 다시 켠다. 아래를 함께 본다.
  - S11에 700px(입력 창이 아래 시트로 폭을 채우는지, 계획 리뷰 E2)
  - S14 Chrome·Safari 한글 Enter(D12)
  - VoiceOver로 토스트·칸 오류·"더보기, 현재 채널·분류"가 읽히는지(할 수 있으면, 못 하면 그렇게 적는다, D13)
  - 휴대폰 키보드가 시트의 저장 버튼을 가리는지(S15)
  - 성공·실패 토스트(`Toaster richColors`)의 라이트·다크 대비(U5)
- 30 수정과 재QA.

## 자기 검토 (writing-plans, 계획 리뷰 반영 뒤 2026-10-06)

- **스펙 범위:** 스펙의 각 절이 어느 태스크로 가는지 맞춰 보았다.

  | 스펙 | 태스크 |
  |---|---|
  | 2절 결정 | Task 1(규칙)·2(구조)·3(프로시저·공급자 주석)·6(배치·입력 창·삭제)·7(휴대폰 막대) |
  | '계획 리뷰에서 바꾼 것' | 행 버튼·지운 뒤 포커스·메모 칸·바깥 누르기는 Task 5·6, 보이지 않는 글자는 Task 1, 더보기 현재 위치는 Task 7, 한글 Enter는 Task 6, 보안 리뷰는 대조표 행과 Global Constraints |
  | 3절 데이터·API | Task 2·3 |
  | 4절 화면 | Task 6·7 |
  | 5절 오류 | Task 3(서버)·5(분류)·6(화면) |
  | 6절 문서 | Task 8 |
  | 9절 테스트 | Task 1·3·5 |
  | 10절 QA | '구현 뒤' 절 |
  | 13절 뒤 TASK 메모 | Task 8(로드맵·ADR) |

- **자리표시자:** 'TBD·나중에·적절한 처리'는 없다. 브리프를 기다리는 부분은 '브리프로 넘길 결정' B1~B6, Task 4 Step 4, Task 5 Step 5, Task 6 머리에 무엇을 어떻게 맞출지 적었다.
- **이름 일관성:**
  - 프로시저 8개(`channelList`·`channelCreate`·`channelUpdate`·`channelDelete`, `classificationList`·`classificationCreate`·`classificationUpdate`·`classificationDelete`)는 Task 3과 Task 6이 같다.
  - Task 5의 이름(`ClassItem`(Task 6 `class-group.tsx` export), `GROUP_TEXT`, `saveFailure`, `doneMessage`, `neighborId`, `MESSAGES`)을 Task 6이 그대로 쓴다.
  - `openerRef`·`createRef` prop, `focusAfterDelete`, `finalFocus` 함수 꼴은 Base UI 1.8 타입과 맞다.
  - `dbCode`는 Task 3 Step 4에서 정의하고 Step 5에서 쓴다.
  - 인덱스 이름 `channel_name`·`classification_name`은 Task 2와 Task 3이 같다.
  - Task 1은 `codePoints`·`normalizeText`를 기존 `trial-options`에서 가져온다(새로 정의하지 않는다).
- **Review Focus:** 다섯 줄 모두 소유 태스크에 테스트가 있다.
  - 1: Task 1 `cleanText` 두 테스트, Task 3 CONFLICT 테스트(NFD·전각·U+200B)
  - 2: Task 1 `urlProblem` 두 테스트, Task 3 경계 테스트(대문자 JavaScript 포함)
  - 3: Task 3 "입력 없이 한 줄만"
  - 4: Task 3 동시 만들기, Task 6 `sendingRef`, QA S13
  - 5: Task 3 "다른 탭에서 지운 항목", Task 5 `saveFailure`, QA S7
- **테스트 개수:**
  - Task 1: 11개
  - Task 3: `classification.test.ts` 11개(DB 9 + DB 없이 2), `classification.isolation.test.ts` 4개(DB 3 + 소유자 없음 1)
  - Task 5: 8개
