# T4 성우 캐스팅 세 공급자 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** '성우 캐스팅'(`/casting`)에서 Typecast·ElevenLabs·Fish Audio를 탭으로 오가며 공급자가 목록 API로 주는 조건·정렬로 찾고, 성우 패널에서 설명·언어별 기본 샘플·이용 조건을 보고, 기본 샘플을 한 번에 하나 듣는다. 목록은 Postgres에 24시간 캐시한다.

**Architecture:** `packages/db`에 첫 앱 표 둘(`provider_list_cache`, `provider_cooldown`)을 더한다. `packages/api`는 성우 계약을 넓히고(출처·억양·분위기·태그·언어·설명·언어별 샘플·사용량·이용 조건), ElevenLabs(REST)·Fish Audio(REST) 목록 한 페이지 조회를 더한다. 새 캐시 모듈(`voice-cache.ts`)이 프로시저와 공급자 사이에서 조건별 캐시·동시 요청 합치기·지난 목록 반환·429 대기를 맡는다. 프로시저는 `voiceList`(세 공급자·출처), `voiceAccents`, `voiceListRefresh`이고 모두 `protectedProcedure`다. 화면은 탭(전체·Typecast·ElevenLabs·Fish Audio)마다 조건과 목록을 따로 들고, ElevenLabs·Fish Audio는 `useInfiniteQuery`로 '더 보기'를 이어 붙인다. 성우 행 목록과 오른쪽 성우 패널(1199px 이하는 서랍)이 승인 시안 '오디션 데스크'의 구성이다.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3(React Compiler), oRPC 1.15.4(`@orpc/tanstack-query` `infiniteOptions`), TanStack Query 5.103.2, zod 4.6.5, drizzle-orm 1.0.0-rc.4(node-postgres), Postgres 18(로컬 컨테이너), vitest 5.0.2, shadcn `base-lyra`(Base UI 1.8.0) `packages/ui`, Tailwind CSS 4, Biome 2.

**Spec:** [T4 스펙](T04-casting-three-providers.md)(사용자 확인 2026-10-04 "확인, 계획으로", 구속력 있는 정본), [성우 캐스팅 브리프](../../briefs/casting.md)(T4 개정, 같은 날 확인), 승인 시안 `.impeccable/mocks/decision/t4-casting-audition.png`, [ADR 0003](../../adr/0003-postgres-cache.md), [사이트맵](../../briefs/site-map.md), [로드맵 T4](../implementation-roadmap.md), 공급자 사실 `docs/research/<공급자>-api-options.md`(2026-10-04 재확인 합침)와 `tasks/evidence/T04/research/calls.md`(설계 단계 실제 조회 10회).

**실행 방식(4행):** superpowers:subagent-driven-development + test-driven-development, ponytail 모드. 태스크마다 `bts-implementer`가 구현하고 코디네이터(메인 세션)가 확인한다. "코디네이터"라고 적힌 단계와 태스크는 `bts-implementer`에 맡기지 않는다(로컬 DB·컨테이너·`package.json`·`turbo.json`·shadcn 추가).

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`bts-dev-cycle` 5절)에 한 번 한다. 태스크 끝의 증거 메모는 코디네이터가 대조표(`tasks/todo.md` 활성 라운드) 행에 적는다.
- `apps/web/.env`를 읽거나 출력하지 않는다. `packages/db/.env`도 내용을 출력하지 않고 키 존재만 `grep -q`로 본다. 로그·증거·테스트 출력에 키와 연결 문자열을 남기지 않는다(증거에는 "로컬 5433 `tts-pilot-app_test`"처럼 호스트·포트·DB 이름만).
- 공급자 API를 실제로 부르지 않는다. 자동 테스트는 `providers/test-utils.ts`의 `useFetchMock`(전역 `fetch` 교체)으로만 흉내 낸다. 화면 확인은 흉내 응답(init 스크립트 + `/api/rpc/**` 가로채기)으로 한다.
- `bts-implementer`는 `/casting`과 `/connections`를 브라우저로 열지 않는다(열면 실제 조회가 나간다). 실제 목록 조회는 메인 세션 QA에서만 하고 공급자마다 10회 이하다(억양 목록 포함, 스펙 10절). 연결 상태 조회는 T2 상한(합계 45회, 공급자별 15회)에 센다.
- 유료이거나 공급자 상태를 바꾸는 호출(생성, 시험 생성, 클론, 클론 삭제, ElevenLabs 라이브러리 성우 추가 `POST /v1/voices/add/...`)은 이 TASK에 없다.
- 로컬 관리자 모드(`AGENTS.md`, 로드맵 2절): 소유자는 서버가 정한 `context.ownerId`에서만 얻는다. 입력에 소유자를 받지 않는다. 공급자 키·DB를 쓰는 코드는 `/api/rpc`의 `protectedProcedure`로만 연다. Server Action·새 Route Handler를 만들지 않는다. Server Component와 SSR은 db·공급자 모듈을 import하지 않고 `voiceList`를 부르지 않는다.
- `packages/api/src/providers/contract.ts`는 zod만 import한다. 화면은 contract에서 `import type`만 한다(zod·SDK·DB 모듈이 클라이언트 번들에 들어가지 않게, AC18).
- 목록 조회는 서버·화면 모두 자동 재시도하지 않는다. ElevenLabs SDK를 쓰는 곳은 `maxRetries: 0`이다(목록은 REST라 재시도 코드 자체가 없다). 시간 제한은 Typecast·ElevenLabs 10초(`CHECK_TIMEOUT_MS`), Fish Audio 목록 20초(`FISH_LIST_TIMEOUT_MS`), 연결 확인은 공급자 모두 10초 그대로다.
- 실패 로그는 한 줄이고 공급자·오류 이름(HTTP는 상태 코드)·필드 이름만 담는다. SDK 오류 객체·오류 메시지·응답 값·헤더·SQL 문장·연결 문자열을 로그나 `ORPCError`의 `cause`에 넘기지 않는다(drizzle 오류의 `message`에는 SQL과 값이 들어 있다. 이름과 `code`만 쓴다).
- 공급자 문제는 `UNAUTHORIZED`·`FORBIDDEN`으로 던지지 않는다(`tts-provider`). 코드와 사유는 T3 스펙 4절 표다.
- 샘플 주소는 https이고 공급자 호스트일 때만 계약에 들어간다: Typecast `*.typecast.ai`, ElevenLabs `storage.googleapis.com`·`*.elevenlabs.io`, Fish Audio `*.fish.audio`(스펙 3절).
- 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex·임의 값(`mt-[13px]`, `w-[420px]`)을 새로 넣지 않는다(서랍 너비는 `md:max-w-md`처럼 눈금으로). 옅은 청록은 `bg-primary-subtle`·`bg-primary/8`·`bg-sidebar-accent`만. 굵기는 `font-normal`·`font-bold` 둘뿐이다.
- 화면 문구는 브리프·스펙·이 계획의 문구만 쓴다. 구현하는 쪽이 새 문구·색을 만들지 않는다. 문구는 `-어요` 보이스다. 용어는 `GLOSSARY.md`를 따른다('콘텐츠', '성우 종류', '제공 성우', '내 계정', '계정 성우', '목록 캐시').
- 인터랙티브 요소는 44px 이상(`min-h-11`, `size-11`, 버튼 `size="lg"`)이고 `focus-visible`이 보인다.
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(들여쓰기는 탭).
- 패키지: 앱 `web`, API `@tts-pilot-app/api`, DB `@tts-pilot-app/db`, UI `@tts-pilot-app/ui`. API 테스트 `pnpm --filter @tts-pilot-app/api test [파일]`, web 테스트 `pnpm --filter web test [파일]`, 전체 `pnpm test`. DB 테스트는 셸 변수 `TEST_DATABASE_URL`이 있을 때만 돈다(Task 1). 없으면 skipped이고 skipped는 통과가 아니다.
- 중간 검사: Task 3~6 동안 라우터가 옛 결과 모양이라 api 타입 검사와 라우터 테스트는 실패하는 것이 정상이다(Task 3의 임시 라우터 수정을 두지 않는다, ponytail). 이 태스크들은 그 태스크의 테스트와 biome, web 타입 검사로 확인하고, api 타입 검사는 Task 7 끝에서 처음 0이어야 한다.
- `package.json`, `pnpm-lock.yaml`, `turbo.json`, `packages/db/docker-compose.yml`, shadcn으로 만드는 `packages/ui` 파일, 로컬 DB·컨테이너 조작은 코디네이터가 한다.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `ponytail:` 주석으로 남긴다.
- 개발 서버는 `http://127.0.0.1:3001`(백그라운드에서 이미 돈다). 끄거나 다시 켜지 않는다. `pkill`·`killall` 금지. 개발 서버가 도는 동안 `.next`를 지우지 않고, `next build`는 메인 세션이 정한 때에만 돌린다(next-dev-loop).
- 이 계획의 대조표 행 번호는 보안 리뷰 행이 붙기 전 번호다(아래 "대조표 행과 태스크").

## Review Focus

- **조건을 빠르게 바꿀 때:** 드롭다운을 연달아 바꾸거나 검색어를 고쳐 쓰면, 마지막 조건의 목록만 보이고 앞 조건의 늦은 응답이 목록을 덮지 않는다. 같은 조건은 배열 순서가 달라도 같은 캐시 행·같은 조회 키다. Task 6 "배열 순서와 객체 키 순서가 달라도 같은 행이다", Task 9 "같은 조건은 같은 입력을 만든다(배열은 정렬)" 테스트. 덮어쓰기 방지는 TanStack Query의 조건별 키(Task 11b)이고 QA S2에서 빠르게 바꿔 본다.
- **페이지 사이에 같은 성우가 다시 올 때:** '인기 급상승'처럼 순위가 움직이는 정렬은 2페이지에 1페이지 성우가 다시 올 수 있다. React 키가 겹쳐 콘솔 오류가 나고 재생 상태가 꼬인다 → 화면이 페이지를 이어 붙일 때 처음 것만 남긴다. Task 9 `flattenPages` "다음 페이지의 중복 성우는 뺀다" 테스트.
- **DB 컨테이너가 꺼져 있을 때:** 개발 서버는 도는데 Postgres가 꺼져 있으면 목록이 오류 경계로 가지 않고 캐시 없이 보인다. 서버 로그에 `[voiceCache] … 실패: … ECONNREFUSED` 한 줄씩만 남는다(연결 문자열·SQL 없음). Task 6 "DB에 붙지 못해도 공급자 결과를 돌려주고 로그는 이름·코드만" 테스트(테스트 DB 없이도 돈다). 포트는 받는데 응답하지 않는 DB는 연결 시간 제한 3초(Task 2 Step 3)로 기다리지 않는다. 이 동안 429 대기 표도 지켜지지 않는다(사용자 결정 2026-10-04, QA 사전 조건으로 막는다).
- **계약이 바뀐 뒤의 옛 캐시:** 판을 올렸거나 저장된 JSON이 지금 계약과 다르면 그 행을 읽지 않고 공급자를 다시 부른다(화면이 깨진 행을 받지 않는다). Task 6 "계약 판이 다른 행과 검사에 실패한 행은 없는 것으로 본다" 테스트.
- **Fish Audio 1,000명 끝:** 10페이지에서 `has_more`가 참이어도 11페이지를 부르지 않고, 화면은 '더 보기' 대신 1,000명 안내를 보인다. Task 5 "10페이지면 다음이 없고 window_limited를 알린다" 테스트, Task 9 `listEnd` 테스트, 입력 검증 "page 11은 BAD_REQUEST"(Task 7).

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다. 외부 스킬은 Read로 `.agents/skills/<이름>/`의 프로젝트 판을 읽었다.

- `bts-db`(+ `references/migration-flow.md`): 스키마는 `packages/db/src/schema/provider-cache.ts`, `schema/index.ts`에서 export. 마이그레이션은 `commands.dbGenerate`(`pnpm --filter @tts-pilot-app/db db:generate`, 루트 `pnpm db:*`는 TTY 없는 셸에서 실패), 생성 SQL 검토, 로컬·테스트 DB에 `commands.dbMigrate`, 다시 `dbGenerate`로 `No schema changes` 확인. 로컬 DB는 `packages/db`에서 `podman compose up -d`, 포트는 compose의 `${DB_PORT:-5432}`와 `packages/db/.env`(키 있음 확인, 값 미출력. 5432는 다른 Homebrew Postgres가 쓰고 있다). 테스트 DB는 같은 컨테이너에 `createdb`. 설계 규칙의 "사용자 소유 테이블은 `userId` FK"는 이번 표에 적용하지 않는다: 지워도 되는 캐시라 FK를 걸지 않는다(스펙 2절 결정). 시각 컬럼은 `timestamp(…, { withTimezone: true })`. 8행(Neon 브랜치)은 `.neon`이 없어 N/A.
- `supabase-postgres-best-practices`: 키 컬럼은 `text`(가변 길이 식별자, 길이 제한은 앱 입력 검증), 시각은 `timestamptz`, 값은 `jsonb`, 기본키 `uuid`(`gen_random_uuid()`, `defaultRandom`). 조회 조건(소유자·공급자·종류·키·판)은 유니크 제약 하나가 인덱스를 겸한다. 정리 쿼리(`expires_at < …`)용 인덱스는 두지 않는다: 1인 사용에서 행이 수백 개라 순차 스캔이 싸다(`ponytail:` 주석).
- `bts-api`(+ `references/ownership-test.md`): 불변식 1·2 → 세 프로시저 모두 `protectedProcedure`, 소유자는 `context.ownerId`만. 불변식 3 → 계정 목록 캐시 행은 `owner_id = context.ownerId`로만 읽고 바꾼다. 불변식 4 → 조건 값은 길이·문자·개수를 묶은 zod 입력(`conditionValueSchema`), 출력 스키마. 격리 테스트는 실제 Postgres(`TEST_DATABASE_URL`)로 두 소유자(A·B)를 context에 직접 넣는다(로그인 전이라 세션 대신 `ownerId`). `packages/api`에 `drizzle-orm`이 없어 코디네이터가 `pnpm --filter @tts-pilot-app/api add drizzle-orm@catalog:`로 더한다. `turbo.json` `globalEnv`에 `TEST_DATABASE_URL`을 더한다(turbo가 선언하지 않은 변수를 태스크에 넘기지 않는다).
- `tts-provider`: 목록·억양 호출은 `providers/<공급자>.ts`에만. 키·호스트 명시. 오류 매핑 표 → `runList`. SDK 오류 객체는 바꿔 담는다. 샘플 재생은 과금 없는 공급자 주소 재생이다. 계정 목록은 "공용 키 목록을 그대로 보이지 않는다" 규칙에 한 명 소유 예외를 적는다(스펙 2절, Task 13). **ElevenLabs 목록은 SDK 대신 REST로 부른다**(아래 '스펙과 다른 점' 1).
- `bts-web`: 조회는 `orpc.voiceList.infiniteOptions`(ElevenLabs·Fish Audio, '전체' 묶음도 같은 인자)와 `queryOptions`(Typecast, 억양), 새로 고침은 `useMutation(orpc.voiceListRefresh.mutationOptions())` 뒤 `orpc.voiceList.key({ input: { provider } })`로 그 공급자 목록 쿼리를 첫 페이지만 남기고 무효로 한다. loading·empty·error·비인가 상태를 나눈다(브리프 8절). 공식 스킬 연결 가운데 `vercel-react-best-practices`와 `next-dev-loop`만 해당한다.
- `vercel-react-best-practices`: `rerender-use-deferred-value`(Typecast 검색), `rendering-content-visibility`(행 `li`에 `content-visibility: auto`, 높이 약 68px), `rerender-derived-state-no-effect`(조건·보기·고른 성우는 렌더 중 순수 함수), `rerender-move-effect-to-event`(포커스 이동·알림은 이벤트에서), `rerender-no-inline-components`, `client-swr-dedup`(같은 조건 같은 키), `bundle-barrel-imports`(contract는 타입만).
- `shadcn`(+ `rules/base-vs-radix.md`, `rules/composition.md`): 이 프로젝트는 `base-lyra`(Base UI 1.8.0). 새 프리미티브 Tabs·ToggleGroup·Sheet는 `pnpm --filter @tts-pilot-app/ui exec shadcn add tabs toggle-group sheet`(코디네이터). `TabsTrigger`는 `TabsList` 안, `ToggleGroup`은 Base 문법(`defaultValue`는 배열, 하나 고르기는 `multiple` 없이), Sheet에는 제목이 있어야 한다. 하나 고르는 드롭다운은 `DropdownMenuRadioGroup`·`DropdownMenuRadioItem`이고, Base UI `Menu.RadioItem`의 `closeOnClick` 기본값이 `false`라(설치본 `MenuRadioItem.d.ts`) `closeOnClick`을 켠다.
- `bts-ui`(+ impeccable `craft-floor.md`): UI 태스크 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 승인 시안이 있으므로 화면 조립(Task 12b) 뒤 comp-led 게이트(`impeccable build-phase start --comp …`)를 메인 세션이 한다("구현 뒤"). 리뷰(critique·audit)는 메인 세션.
- `bts-verify`, `next-dev-loop`: 화면+API+DB 변경이라 typecheck·lint·test(DB 테스트 포함)·build·런타임·desktop/mobile 스크린샷을 모두 한다. 오류 예산 0.

**SDK·라이브러리 확인(2026-10-04, 설치본):**
- `@elevenlabs/elevenlabs-js` 2.70.0: `voices.getShared(VoicesGetSharedRequest)`·`voices.search(VoicesSearchRequest)`·`voices.accents.get`가 있고 요청 필드는 camelCase(`useCases`, `pageSize` …)다. 응답은 `serializers.GetLibraryVoicesResponse.parseOrThrow(...)`로 **응답 전체를 한 번에 검사**한다(`api/resources/voices/client/Client.js`). 필수 필드(`accent`, `useCase`, `descriptive` …)가 빠진 성우가 하나라도 있으면 목록 전체가 `ParseError`다. 검사를 끄는 옵션(`skipValidation`)이 없다. 배열 쿼리는 반복 키(`core/url/QueryStringBuilder.js` `arrayFormat: "repeat"`).
- drizzle-orm 1.0.0-rc.4: `unique(name).on(...cols).nullsNotDistinct()`(`pg-core/unique-constraint.d.ts`. `uniqueIndex`에는 없다), `uuid().defaultRandom()`, `jsonb()`, `insert(...).onConflictDoUpdate({ target, set })`.
- `@orpc/tanstack-query` 1.15.4: `infiniteOptions({ input: (pageParam) => …, initialPageParam, getNextPageParam })`, `key({ input })`는 부분 입력으로 키를 만들어 일치하는 쿼리를 모두 찾는다(무한 쿼리 포함, `index.d.mts:101`·`index.mjs:204`, ponytail 리뷰 확인).
- Base UI 1.8.0(`packages/ui/node_modules/@base-ui/react`): `tabs`, `toggle-group`, `dialog`(Sheet), `menu/radio-item`이 있다.
- 계획 리뷰 확인(2026-10-04): `Button size="icon-lg"`가 이미 있다(`button.tsx:30`, `size-11`). `--breakpoint-xl: 75rem`(`globals.css:160`)이 1200px 판정과 같다. Base UI Tabs `activateOnFocus` 기본 false. `Intl` 한국어 compact가 Node 24에서 "210만"·"37.8만"이다. 전역 reduced-motion 규칙이 있다(`globals.css`). `protectedProcedure`가 `ownerId`를 string으로 좁힌다.
- 로컬: `podman` 5.x(`/opt/podman/bin`), 머신 `podman-machine-default`(지금 꺼짐), compose 제공자 `/usr/local/bin/docker-compose`. 5432는 Homebrew postgresql@16이 듣고 있다. `apps/web/.env`의 `DATABASE_URL`은 localhost:5433의 `tts-pilot-app`(설계 때 호스트·포트·DB 이름만 확인).

## 스펙과 다른 점

1. **ElevenLabs 목록은 SDK가 아니라 REST(`fetch`)로 부른다.** 스펙 3절 표는 SDK 메서드를 적었고 `tts-provider`는 "ElevenLabs는 공식 SDK"라고 한다. 그런데 SDK가 응답 전체를 한 번에 검사해(위 확인), 스펙 3절 "공급자마다 T3와 같은 항목 단위 검증"을 지킬 수 없다. 성우 한 명의 빠진 필드가 5,953명 목록을 막는다. 그래서 목록·억양 세 호출만 Fish Audio처럼 REST로 부르고 zod로 항목마다 검사한다. 키는 `xi-api-key` 헤더, 호스트는 `https://api.elevenlabs.io`로 고정한다. 오류 본문 코드는 기존 `detailCodes`로 뽑는다. REST에는 재시도 코드가 없으므로 `maxRetries: 0` 규칙도 지켜진다. 연결 확인은 SDK 그대로다. 스펙 3절은 계획 리뷰 반영 때 고쳤다. Task 13에서 `tts-provider`의 SDK 문장에 "목록 조회는 REST(항목 단위 검증)"를 더한다.
2. **DB가 꺼지면 캐시 없이 공급자를 부른다(사용자 결정 2026-10-04 "캐시 없이 공급자 호출").** 캐시 읽기·쓰기·대기 표 조회가 실패하면 캐시 없이 공급자를 부르고 결과를 그대로 보인다. 화면에 DB 오류를 띄우지 않는다. 서버 로그에는 `[voiceCache] 읽기 실패: DrizzleQueryError ECONNREFUSED` 꼴 한 줄을 남긴다. DB가 꺼진 동안은 같은 조건도 매번 공급자를 부르고 429 대기 표도 지켜지지 않는다. 보완은 셋이다.
   - `createDb`의 연결 시간 제한 3초(Task 2). 포트는 받는데 응답하지 않는 DB를 기다리지 않는다.
   - QA 사전 조건 "DB 연결 확인, 서버 로그 `[voiceCache]` 실패 0"을 S1 앞에 둔다("구현 뒤").
   - 로드맵 T5 메모: 유료 호출은 대기 표 조회(DB)가 실패하면 부르지 않는다.
   스펙 4절·12절은 계획 리뷰 반영 때 고쳤다.
3. **내 계정 출처 배지와 출처 필터는 '내가 만든 성우'다(사용자 승인 2026-10-04).** 계정 성우 중 내가 만든 것에는 보이스 디자인(`generated`)도 있어 '내 클론'이 틀릴 수 있다(용어집 '보이스 디자인'). 브리프 5절은 고쳤다.
4. **'더 보기' 실패(사용자 승인 2026-10-04):** 목록은 그대로 두고 '더 보기' 버튼 위에 경고색 작은 글자 "다음 성우를 불러오지 못했어요. {사유 문구의 설명}"을 보이며(`role="alert"`) 같은 버튼으로 다시 시도한다. 브리프 8절에 행을 더했다.
5. **ElevenLabs 내 계정 정렬은 선택 하나다(사용자 승인 2026-10-04):** '최근 만든 순'(`created_at_unix` desc, 기본), '오래된 순'(asc), '이름순'(`name` asc), '이름 역순'(desc). 브리프 6절에 적었다.

## 계획 리뷰에서 바꾼 것

계획 리뷰 셋(3행)을 2026-10-04에 받아 이 계획과 스펙·브리프·로드맵에 반영했다. 사용자 결정 셋은 AskUserQuestion으로 받았다.

| 리뷰 | 판정 | 반영 | 반영하지 않음(이유) |
|---|---|---|---|
| plan-eng-review(gstack, critic opus. Task 2~7·9를 따로 만든 작업 트리에서 실행: api 115 통과·14 skipped, web 23 통과) | approve-with-fixes, high 2·medium 7·low 7 | E1 api 테스트 파일 직렬(`vitest.config.ts` `fileParallelism: false`)과 DB 스위트 `afterAll` 정리, E2 ElevenLabs `listPage`에서 분기마다 `query`를 꺼냄, E3 Fish 429 테스트 형 단언, E4 Task 3에서 web `Voice` 픽스처를 함께 고침, E5 지난 목록은 읽을 때도 만료 뒤 7일까지만, E6 DB 연결 시간 제한 3초·QA 사전 조건·T5 메모, E7 억양 값도 조건 값 검사를 통과한 것만, E8 빠진 테스트('전체' 묶음 순수 함수, Fish 401·5xx, ElevenLabs 내 계정 조건→쿼리, 응답 모양 실패, 억양 오류, 라우터 내 계정·억양 출력 스키마), E9 격리 지난 목록 경로, E10 테스트 DB 이름 `_test` 확인, E11 Fish `type`·`state`를 항목 스키마의 필수로, E12 Task 2 DB 명령은 코디네이터, E13 Task 11·12를 a·b로 나누고 조건을 바꿔 받는 중 '더 보기' 막음, E14 새로 고침 범위 주석, E15 '전체' 묶음이 공급자 탭과 같은 `infiniteOptions`, E16 `Retry-After` 상한 1시간 | E1의 "정리는 자기 행만": 테스트 파일을 차례로 돌리고 `_test` 이름을 확인하므로 표 전체 정리로 충분하다(테스트 DB 전용) |
| plan-design-review(gstack, critic opus) | REVISE 6/10, high 5·medium 8·low 10 | D1 조건 줄 768px 이상도 줄바꿈·값 버튼 글자 너비 제한·검색 칸 `xl:w-72`, D2 행 둘째 줄 '메타 · 알약'·오른쪽 고정 칸(보조 정보 위, 배지 아래)·목록 칸 너비 기준(`@container`), D3 새로 고침은 목록을 남긴 채 첫 페이지만 다시 받음·상태 줄 늘 그림, D4 조건 줄은 처음 불러오는 중에만 잠금·오류 안내에 '조건 모두 해제', D5 고르기 버튼은 이름이 접근 이름이고 나머지는 설명(`aria-describedby`)·'공급자 분류:', D6 생성물 굵기·반경·글자·44px 맞춤과 탭·세그먼트 모양 규칙, D7 '전체' 묶음 상태(받는 중·0명·지난 목록·대기·실패 작은 안내), D8 '모두 보기 →' 포커스(탭 내용 유지 + 신호), D9 Typecast 인원 글자를 상태 줄 왼쪽으로, D10 서랍 `md:max-w-md`, D11 설명 잘림을 그린 높이로 판정, D12 패널 높이 상한과 안 스크롤, D13 첫 로딩에도 두 칸 배치, D14 대기 시각이 탭을 오가도 남음(탭 내용 유지), D15 대기 시각만 있을 때 안내 문구, D16 '더 보기' 실패 `role="alert"`, D17 상태 줄 줄바꿈, D18 토글 칩 44px·`Check`, D19 행 hover·커서, D20 패널 샘플 실패 접근 이름, D21 같은 언어 샘플은 첫 것만, D22·U6 메타 '정보 없음', D23 억양 조회 실패 사유, D24 확인 너비 1200·320과 흉내 시나리오 넷. '빠진 것': 행 `aria-controls`, 서랍 첫 포커스는 제목, 서랍 200ms·이징 확인 | 재생 중 3px 왼쪽 띠: craft-floor 금지 패턴(색 있는 왼쪽 테두리)이지만 브리프 3·7절이 정했다. critique에서 지적이 나와도 브리프 근거로 둔다 |
| ponytail-review(sonnet) | net -270 lines possible | `emptyVoice`, `ProviderClient` 메서드 문법(제네릭·`listerOf` 삭제, 라우터 한 줄), ElevenLabs 두 성우 스키마를 `elVoice` 하나로, 공용 `fetchJson`, Fish 거르기를 항목 스키마로 합침, `errors.test` 중복 테스트·Task 3 임시 라우터 수정·Task 1 연결 확인 스크립트·격리 중복 테스트 삭제, 공용 `VoiceShelf`·`useSearchCommit`·`ListStatusBar`·`StaleNotice`·`SampleButton`, 샘플 키는 오디오 주소(`useSample(url)`), `useNow` 삭제, `orpc.voiceList.key()`로 무효화, `PROVIDER_LABEL` 재사용(`lib/connection-view.ts`로 옮김), 축 빌더와 토글 불린 | `previewUrl` 필드 삭제: T3 필드라 이번 범위 밖. `inputOf`의 정렬·trim: Review Focus 1(같은 조건은 같은 브라우저 키)과 그 테스트를 지킨다 |

**사용자 결정(2026-10-04, AskUserQuestion):**
- 새 문구·구성 셋 승인('스펙과 다른 점' 3·4·5). 답: "이대로 고치고 알려줘 구현은 /compact 하고 진행할께".
- 탭별 스크롤 위치 기억은 뺀다(탭 줄이 위에 붙지 않아 하는 일이 없다). 탭마다 조건·목록·고른 성우만 기억한다.
- DB가 꺼지면 캐시 없이 공급자를 부른다('스펙과 다른 점' 2).

**코디네이터 판정(디자인 리뷰 권장안):**
- U3 패널 샘플은 시안대로 왼쪽 44px 둥근 아이콘 버튼 + 이름표. 재생 중이면 이름표 옆 '재생 중' 배지.
- U4 '모두 보기 →'는 그 탭을 시작 조건 + 검색어로 연다.
- U5 767px 이하 정렬은 '조건' 묶음 끝. 시작값이 아니면 상태 줄 인원 뒤에 " · {정렬 이름}".
- U6 세 공급자 모두 성별·연령이 없으면 '성별 정보 없음'·'연령 정보 없음', 억양은 있을 때만.
- 엔지니어링 D2: 로드맵 T14 메모 "허용 목록이 두 명 이상이면 '내 계정' 출처를 숨기거나 소유 매핑으로 거른다".

## 계획에서 정한 것

- **계약(`contract.ts`):**
  - `Voice`에 `source`(`public`·`account`), `accent`, `descriptives[]`, `tags[]`(Fish Audio 태그 그대로), `languages[]`, `category`(공급자 성우 종류), `origin`(계정 성우의 출처 `premade`·`saved`·`own`, 공개 목록은 null), `description`(최대 1,000자), `samples[]`(`{ language, title, url }`), `usage`(`{ kind: "chars_1y" | "tasks", count }`), `terms`(이용 조건 `{ freeUsersAllowed, noticePeriodDays, liveModeration, creditRate, licensed, retiring }`)를 더한다. 성별에 `neutral`.
  - `previewUrl`은 행의 샘플이다. ElevenLabs는 지금 언어 조건의 샘플을 먼저, 없으면 기본 샘플이다. Fish Audio는 첫 샘플이다.
  - 목록 입력 `voiceListInputSchema`는 네 모양의 유니온이다. Typecast `{ provider }`, ElevenLabs 공개 `{ source: "public", page, query }`, ElevenLabs 내 계정 `{ source: "account", cursor, query }`, Fish Audio `{ source, page, query }`.
  - 결과 `voiceListResultSchema = { provider, source, voices, next, total, totalExact, windowLimited, fetchedAt, stale }`. `stale`은 `{ reason, retryAt } | null`이다.
  - `ProviderErrorData`에 `retryAt?`(429 `Retry-After`로 정한 시각, 1시간 상한)을 더한다. 사유 enum은 zod `providerFailureSchema`로 바꾼다(값은 같다).
- **공급자 클라이언트(`errors.ts`):** `ProviderClient`는 제네릭 없이 메서드 문법이다(`listVoices?(input: VoiceListInput)`, `listAccents?(language)`). 메서드 매개변수는 이변이라 공급자 구현이 자기 입력 모양(`ListInputOf<P>`)만 받아도 된다. 그래서 `Providers`·`withKey`는 그대로이고 라우터는 `context.providers?.[input.provider]?.listVoices` 한 줄이다. 성우는 `{ ...emptyVoice(provider, source), 바뀌는 필드 }`로 만든다. 공급자 REST 조회는 `fetchJson`(ElevenLabs 목록, Fish Audio 전부)을 함께 쓴다.
- **조건 값 검증:** 공급자에 그대로 가는 문자열 조건은 `conditionValueSchema = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/)`, 배열은 10개까지, 검색어는 100자까지다. 정렬·성우 종류·출처는 enum이다. 실측 값(`gyeongsang`, `middle-aged`, `social-media`, `ko`)이 모두 통과한다. ElevenLabs 억양 목록도 이 검사를 통과한 값만 선택지로 돌려준다(뺀 수는 로그 한 줄, 계획 리뷰 E7).
- **`Retry-After` 상한:** 1시간(`runList`). 공급자가 더 긴 값을 주면 1시간 뒤로 줄인다(대기 표가 목록·새로 고침을 며칠씩 막지 않게, 계획 리뷰 E16).
- **캐시 모듈 `packages/api/src/voice-cache.ts`:** `cachedList(db, scope, params, schema, fetch)`, `expireProvider(db, provider, ownerId)`, `cacheKey(params)`, `CONTRACT_VERSION = 1`. 시각은 모두 JS `Date`로 계산해 넘긴다(SQL `now()`를 쓰지 않는다. 테스트가 시계를 옮길 수 있게). 동시 요청은 모듈 안 `Map`으로 합치고, 공급자 호출과 캐시 쓰기를 한 약속 안에서 한다(쓰기도 한 번). 지난 목록은 읽을 때도 만료 뒤 7일까지만 쓴다(쓰기 때 지우는 범위와 같다, 계획 리뷰 E5).
- **목록 종류(`list_kind`):** `public`·`account`·`accents`. 계정 목록만 `owner_id`가 있다. 억양 목록은 공개(`owner_id` null)다.
- **새로 고침 범위:** 서버는 그 공급자의 공개 행(억양 포함)과 이 소유자의 계정 행을 만료로 바꾼다. 다른 소유자의 계정 행은 그대로다. 화면은 그 공급자의 브라우저 목록 쿼리(`orpc.voiceList.key({ input: { provider } })`로 찾는다)를 첫 페이지만 남기고 무효로 한다. 보고 있는 목록은 첫 페이지만 다시 받는 동안 그대로 보인다('다시 받는 중', 계획 리뷰 D3). 억양 쿼리는 건드리지 않는다(입력에 공급자가 없다. 서버 억양 행은 만료되어 다음 방문 때 다시 받는다).
- **테스트 DB:** 로컬 컨테이너의 `tts-pilot-app_test`. URL은 셸 변수 `TEST_DATABASE_URL`로만 넘긴다(`.env` 파일·`.env.schema`에 넣지 않는다. 비밀번호는 커밋된 compose의 개발용 값이지만 증거·문서에 URL을 적지 않는다). 코디네이터가 테스트 명령 앞에 붙인다: `TEST_DATABASE_URL="postgresql://postgres:<compose 비밀번호>@localhost:5433/tts-pilot-app_test" pnpm test`. turbo가 넘기도록 `globalEnv`에 더한다. DB 테스트 공통 `packages/api/src/test-db.ts`가 이름이 `_test`로 끝나지 않는 DB를 거절하고(계획 리뷰 E10), api 테스트 파일은 차례로 돈다(`fileParallelism: false`, E1).
- **화면 파일 나눔:**
  - `lib/provider-conditions.ts`: ElevenLabs·Fish Audio 조건 정의(축 빌더), 값 표, 시작값, 입력 만들기. `lib/voice-filter.ts`는 Typecast(브라우저 거르기) 그대로다.
  - `lib/voice-view.ts`: 행·패널·묶음에 보일 문구와 이어 붙이기·처음 선택·샘플 접근 이름 순수 함수.
  - `lib/connection-view.ts`: `PROVIDER_LABEL`을 `provider-status-card.tsx`에서 옮겨 화면 전체가 함께 쓴다.
  - `components/voice-row.tsx`가 `voice-card.tsx`를 대신한다(공용 `SampleButton` 포함). 성우 패널은 `components/voice-panel.tsx`다.
  - `components/voice-list-parts.tsx`: 공용 `VoiceShelf`(묶음), `ListStatusBar`(상태 줄), `StaleNotice`(안내 줄), `useSearchCommit`(검색어 보내기), `LIST_QUERY`.
  - `components/server-voice-list.tsx`: ElevenLabs·Fish Audio 한 출처의 무한 목록과 `useListRefresh`.
  - `components/typecast-voice-list.tsx`, `components/all-providers.tsx`, `components/voice-casting.tsx`: Typecast 탭, '전체' 탭, 탭·출처.
- **샘플 키:** 재생 상태는 샘플 오디오 주소로 묶는다(`useSample(url)`, `toggle(url, name, url)`). 행의 재생 버튼과 패널의 같은 샘플은 주소가 같아 같은 상태를 보이고, 공급자끼리 성우 id가 겹쳐도 섞이지 않는다. `sample-state.ts`·`sample-player.tsx`의 필드 이름(`voiceId`)은 T3 그대로 두고 주석으로 "재생 키는 샘플 주소"를 적는다.
- **조건 버튼 글자:** 하나 고르기는 '언어 · 한국어', 여럿 고르기는 하나면 '콘텐츠 · 광고', 둘 이상이면 '콘텐츠 · 2'다(브리프 5절). 값이 든 버튼 글자는 너비를 제한하고 넘치면 말줄임(계획 리뷰 D1). Typecast 드롭다운도 같은 글자로 바꾼다(T3의 숫자 배지를 대신함). 모바일 '조건' 버튼의 배지는 시작값과 다른 조건의 수다.
- **Fish Audio 태그 드롭다운 넷:** 성별·연령·콘텐츠·분위기 드롭다운이 모두 `query.tags` 하나에 쓴다. 각 드롭다운은 자기 태그 묶음에 든 값만 보고 고친다. 드롭다운 머리에 회색 작은 글자 '모두 포함'을 둔다(실측 AND).
- **언어 이름:** 샘플 이름표와 언어 선택지 글자는 `Intl.DisplayNames(["ko"], { type: "language" })`로 만든다("한국어", "영어"). 표를 따로 두지 않는다.
- **큰 수:** `Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })`("210만", "37.8만", Node 24에서 실행 확인).
- **받은 시각:** "방금 받음"(1분 미만), "N분 전에 받음", "N시간 전에 받음", "N일 전에 받음". 그릴 때의 시각으로 계산한다(1분마다 다시 그리지 않는다, ponytail). 지난 목록 안내는 "{N분/N시간/N일} 전에 받은 목록".
- **대기 시각:** `Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" })`("오후 3:20").
- **1200px 판정:** 패널 자리(오른쪽 칸 또는 서랍)는 `matchMedia("(min-width: 75rem)")`를 `useSyncExternalStore`로 읽어 정한다. `--breakpoint-xl: 75rem`(`globals.css`)과 같다. 서버 렌더에서는 넓은 화면으로 본다. 1199px 이하에서 처음 선택이 서랍을 저절로 열지 않는다.
- **탭 내용 유지:** 탭 내용(`TabsContent`)은 `keepMounted`로 숨긴 채 남긴다. 탭을 오가도 검색 칸·조건·목록·고른 성우·대기 시각이 그대로이고(계획 리뷰 D14), '모두 보기 →' 뒤 포커스를 옮길 인원 글자가 늘 있다(D8). 숨은 탭의 조회는 '전체' 탭이 이미 받는 것과 같은 키라 공급자 호출이 늘지 않는다.
- **'전체' 탭 묶음의 조회:** ElevenLabs·Fish Audio 묶음은 그 탭의 시작 조건(+ 검색어) 목록과 같은 `infiniteOptions` 인자를 쓴다. 브라우저 키가 같아 탭을 처음 열 때 다시 받지 않는다(계획 리뷰 E15). 묶음은 첫 페이지 앞 5명만 보인다. Typecast 묶음은 Typecast 탭과 같은 목록 하나를 브라우저에서 거른다.
- **첫 로딩·오류·빈 상태의 배치:** 1200px 이상에서도 두 칸(목록 5 : 패널 3)을 유지한다. 패널 자리는 받는 중이면 뼈대, 그 밖에는 비운다(계획 리뷰 D13).

## 파일 구조

```text
packages/db/
	src/schema/provider-cache.ts      (신규) provider_list_cache, provider_cooldown
	src/schema/index.ts               (수정) export
	src/index.ts                      (수정) createDb 연결 시간 제한 3초
	src/migrations/<생성>/             (신규, dbGenerate)
packages/api/
	package.json                      (수정, 코디네이터) drizzle-orm
	vitest.config.ts                  (신규, 코디네이터) fileParallelism false
	src/providers/contract.ts         (수정) Voice 넓힘, 입력·결과·억양 스키마, ProviderFailure enum
	src/providers/errors.ts           (수정) ProviderClient 메서드 문법, withTimeout(ms), runList(…, timeoutMs, Retry-After 1시간 상한), providerError(…, retryAt), fetchJson
	src/providers/list.ts             (신규) emptyVoice, clip, queryOf, parseVoiceItems
	src/providers/list.test.ts        (신규)
	src/providers/typecast.ts         (수정) 새 계약·페이지 모양, parseVoiceItems
	src/providers/typecast.test.ts    (수정)
	src/providers/elevenlabs.ts       (수정) listVoices(REST 공개·내 계정), listAccents
	src/providers/elevenlabs.test.ts  (수정, 끝에 더함)
	src/providers/fish-audio.ts       (수정) fetchJson, listVoices(공개·내 계정)
	src/providers/fish-audio.test.ts  (수정, 끝에 더함)
	src/test-db.ts                    (신규, 테스트 전용) TEST_DATABASE_URL·_test 확인
	src/voice-cache.ts                (신규) 목록 캐시
	src/voice-cache.test.ts           (신규, 테스트 DB)
	src/routers/index.ts              (수정) voiceList 넓힘, voiceAccents, voiceListRefresh
	src/routers/voice-list.test.ts    (수정)
	src/routers/voice-list.isolation.test.ts (신규, 테스트 DB)
packages/ui/src/components/
	tabs.tsx, toggle-group.tsx, sheet.tsx (신규, 코디네이터 shadcn add 뒤 굵기·높이 맞춤)
apps/web/src/
	lib/provider-conditions.ts(+test)  (신규)
	lib/voice-view.ts(+test)           (신규)
	lib/connection-view.ts             (수정) PROVIDER_LABEL을 옮겨 옴
	lib/voice-filter.ts(+test)         (수정) GENDER_LABEL neutral, 테스트 픽스처 새 필드(Task 3)
	lib/voice-failure.ts(+test)        (수정) retryAtOf
	components/provider-status-card.tsx, connection-status.tsx (수정) PROVIDER_LABEL import 경로
	components/sample-player.tsx       (수정) 주석: 재생 키는 샘플 주소
	components/voice-row.tsx           (신규) VoiceRow, SampleButton
	components/voice-card.tsx          (삭제, Task 12b)
	components/voice-panel.tsx         (신규)
	components/voice-conditions.tsx    (수정) 조건 정의로 그리기(하나·여럿·토글), 정렬, 줄바꿈
	components/voice-problem.tsx       (신규) 사유 안내(작은 판 포함)
	components/voice-list-parts.tsx    (신규) VoiceShelf, ListStatusBar, StaleNotice, useSearchCommit, LIST_QUERY
	components/casting-workspace.tsx   (신규) 행 목록 + 패널 칸/서랍
	components/server-voice-list.tsx   (신규)
	components/typecast-voice-list.tsx (신규)
	components/all-providers.tsx       (신규)
	components/voice-casting.tsx       (수정, 다시 씀)
	app/(app)/casting/page.tsx         (수정) 설명 문구
	index.css                          (수정) .voice-card → .voice-row, @utility voice-panel-sticky
turbo.json                           (수정, 코디네이터) globalEnv TEST_DATABASE_URL
.claude/skills/tts-provider/SKILL.md, docs/… (Task 13)
```

## 대조표 행과 태스크

`packages/api/src/providers/`가 diff에 생기면 `pnpm dev-cycle audit`이 security 행 누락을 알린다. Task 3이 끝나면 코디네이터가 `pnpm dev-cycle table F --write --upgrade`로 행을 붙인다(증거·메모 보존). 아래 번호는 붙이기 전 번호다.

| 행 | 증거의 출처 |
|---|---|
| 2 | 이 계획과 "읽은 스킬과 계획에 반영한 것" |
| 3 | 계획 리뷰(코디네이터): plan-eng-review, plan-design-review, ponytail-review → 위 "계획 리뷰에서 바꾼 것" |
| 4 | 위 "실행 방식"과 태스크별 위임 내역 |
| 5 | Task 2 마이그레이션 파일 경로와 생성 SQL 요약(`supabase-postgres-best-practices`) |
| 6 | Task 2 끝 `pnpm --filter @tts-pilot-app/db check-types`·web 타입 검사, Task 7 끝 `pnpm check-types`(api 포함 첫 0), `pnpm exec biome check .` |
| 7 | Task 2 Step 6 로컬(5433 `tts-pilot-app`)과 테스트 DB(`tts-pilot-app_test`)에 `db:migrate` 출력 요약 |
| 8 | `N/A: Neon 미연결(.neon 없음)` |
| 9 | Task 2 Step 5: 새 표 둘만 만든다. 기존 표 변경·DROP 없음 → 파괴적 변경 없음 |
| 10 | Task 2·6 diff에 `bts-reviewer(db)` |
| 11 | Task 3 `contract.ts`(`voiceListInputSchema`, `voiceListResultSchema`, `accentListSchema`) + Task 7 세 프로시저의 `.input`·`.output` |
| 12 | Task 3~7 변경 파일과 읽은 스킬(`bts-api`, `tts-provider`, `bts-db`) |
| 13 | Task 7 `voice-list.isolation.test.ts` 통과 출력(`TEST_DATABASE_URL` 있음, skipped 0) |
| 14 | Task 7 뒤 `pnpm check-types`, `pnpm exec biome check .`, `TEST_DATABASE_URL=… pnpm test` |
| 15 | Task 3~7 diff에 `bts-reviewer(code)` + `ponytail-review` |
| security(추가) | Task 3~7 diff에 `bts-reviewer(security)`("구현 뒤") |
| 16 | 메인 세션 impeccable context(설계 단계에서 한 번 실행, 다시 실행해 요약) |
| 17 | 이미 채움 |
| 18 | Task 8~12b 변경 파일과 읽은 스킬(`bts-web`, `bts-ui`, `shadcn`, `vercel-react-best-practices`, craft-floor) + comp-led 게이트 결과 |
| 19 | Task 12b 뒤 `pnpm check-types`, `pnpm exec biome check .`, `pnpm test`, `pnpm build`(메인 세션이 정한 때) |
| 20~36 | "구현 뒤" |

---

### Task 1: 로컬 DB와 테스트 DB 준비 (코디네이터)

**Files:**
- Modify: `turbo.json`(`globalEnv`), `packages/api/package.json`·`pnpm-lock.yaml`(`drizzle-orm`)
- Create: `packages/api/vitest.config.ts`
- 바꾸지 않음: `packages/db/docker-compose.yml`, `packages/db/.env`, `apps/web/.env`

**Interfaces:**
- Produces: 5433에서 도는 컨테이너 `tts-pilot-app-postgres`(postgres:18), DB `tts-pilot-app`(개발)·`tts-pilot-app_test`(테스트), 셸 변수 `TEST_DATABASE_URL`을 넘기는 명령 꼴, `packages/api`의 `drizzle-orm` 의존, api 테스트 파일 직렬 실행.

- [ ] **Step 1: Podman 머신 켜기** — `podman machine start`. `podman machine list`에 `Currently running`이 보이는지 확인한다. 머신을 켜는 것은 사용자가 설계에서 고른 방법이다(스펙 2절 '로컬 DB').
- [ ] **Step 2: 포트 확인** — `grep -q '^DB_PORT=5433$' packages/db/.env && echo ok`(값을 출력하지 않는다). ok가 아니면 멈추고 사용자에게 `packages/db/.env`의 `DB_PORT`를 5433으로 맞춰 달라고 한다. 5432는 Homebrew postgresql@16이 듣고 있어 컨테이너를 5432로 띄우면 `localhost` 접속이 그쪽으로 간다(`bts-db` 로컬 DB 절).
- [ ] **Step 3: 컨테이너 띄우기** — `packages/db`에서 `podman compose up -d`. `podman ps --format '{{.Names}} {{.Ports}}'`에 `tts-pilot-app-postgres 0.0.0.0:5433->5432/tcp`가 보여야 한다. `short-name "postgres:18" did not resolve`가 나오면 `bts-db` 안내대로 사용자에게 `registries.conf`를 요청한다(사용자 설정 파일). 개발 DB 연결은 Task 2 Step 6의 `db:migrate` 성공으로 확인한다(확인 스크립트를 따로 두지 않는다, ponytail). 그때 DB가 없다는 오류(`3D000`)면 `podman exec tts-pilot-app-postgres createdb -U postgres tts-pilot-app`.
- [ ] **Step 4: 테스트 DB 만들기** — `podman exec tts-pilot-app-postgres createdb -U postgres tts-pilot-app_test`(이미 있으면 그 오류는 넘어간다). 스키마 적용은 Task 2 Step 6에서 한다.
- [ ] **Step 5: `turbo.json`** — `globalEnv` 배열에 `"TEST_DATABASE_URL"`을 알파벳 순서 자리(`"TYPECAST_API_KEY"` 앞)에 더한다.
- [ ] **Step 6: `drizzle-orm`** — `pnpm --filter @tts-pilot-app/api add drizzle-orm@catalog:`. `packages/api/package.json` `dependencies`에 `"drizzle-orm": "catalog:"`가 생긴다.
- [ ] **Step 7: api 테스트 직렬 실행** — `packages/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// DB 테스트 파일(voice-cache, voice-list.isolation)은 같은 테스트 DB의 표를 비우고 쓴다.
// 파일을 동시에 돌리면 서로를 깨므로 차례로 돌린다(T4 계획 리뷰 E1. vitest 5 fileParallelism 기본값은 true).
export default defineConfig({ test: { fileParallelism: false } });
```

- [ ] **Step 8: 검사** — `pnpm --filter @tts-pilot-app/api test`(기존 테스트가 설정과 함께 통과), `pnpm check-types`(0). 증거(7행 일부): 머신·컨테이너 상태 줄, 테스트 DB 생성 결과. 연결 문자열은 적지 않는다.

### Task 2: 캐시 표 스키마와 마이그레이션 (DB 명령은 코디네이터)

**Files:**
- Create: `packages/db/src/schema/provider-cache.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`(연결 시간 제한)
- Create(생성물): `packages/db/src/migrations/<시각>_<이름>/migration.sql`, `snapshot.json`

**Interfaces:**
- Consumes: Task 1의 로컬 DB.
- Produces: `providerListCache`(컬럼 `id`, `ownerId`, `provider`, `listKind`, `paramsKey`, `contractVersion`, `payload`, `fetchedAt`, `expiresAt`), `providerCooldown`(컬럼 `provider`, `until`). import 경로 `@tts-pilot-app/db/schema/provider-cache`. `createDb`는 연결 시간 제한 3초로 만든다.

Step 1·2는 `bts-implementer`, Step 4~7(`db:generate`·`db:migrate`)은 코디네이터가 한다(로컬 DB·컨테이너 조작, 계획 리뷰 E12).

- [ ] **Step 1: 스키마 파일 쓰기**

```ts
// packages/db/src/schema/provider-cache.ts
import {
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// 공급자 성우 목록 캐시(ADR 0003, T4 스펙 5절). 조건별로 24시간 보관하고, 공급자가 실패하면 만료 뒤 7일까지 지난 목록으로 쓴다.
// 지워도 되는 데이터라 user 외래 키를 걸지 않는다(T4 스펙 2절). 지속 소유 데이터의 외래 키는 T6에서 정한다.
export const providerListCache = pgTable(
	"provider_list_cache",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 공개 목록은 null(소유자끼리 함께 쓴다), 계정 목록은 서버가 정한 소유자 id
		ownerId: text("owner_id"),
		provider: text("provider").notNull(),
		// public·account·accents
		listKind: text("list_kind").notNull(),
		// 정규화한 조건·페이지의 SHA-256(packages/api/src/voice-cache.ts cacheKey)
		paramsKey: text("params_key").notNull(),
		// 계약 판. 계약이 바뀌면 판을 올려 옛 행을 읽지 않는다
		contractVersion: integer("contract_version").notNull(),
		// 계약 스키마로 검사한 목록 한 페이지(읽을 때도 다시 검사한다)
		payload: jsonb("payload").notNull(),
		fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		// 조회 조건 전체가 키다. 공개 행(owner_id null)끼리도 겹치지 않게 NULLS NOT DISTINCT(Postgres 15+). 이 제약의 인덱스가 조회 인덱스를 겸한다.
		// ponytail: 만료 행 정리(expires_at < …)용 인덱스는 두지 않는다. 1인 사용에서 행이 수백 개라 순차 스캔이 싸다. 행이 수만 개가 되면 expires_at 인덱스를 더한다.
		unique("provider_list_cache_key")
			.on(t.ownerId, t.provider, t.listKind, t.paramsKey, t.contractVersion)
			.nullsNotDistinct(),
	],
);

// 공급자 429 Retry-After로 정한 다음 호출 가능 시각(T4 목록, T5 생성). 서버 인스턴스끼리 메모리를 나누지 않으므로 DB에 둔다(tts-provider).
export const providerCooldown = pgTable("provider_cooldown", {
	provider: text("provider").primaryKey(),
	until: timestamp("until", { withTimezone: true }).notNull(),
});
```

- [ ] **Step 2: export** — `packages/db/src/schema/index.ts`:

```ts
export * from "./auth";
export * from "./provider-cache";
```

`relations.ts`는 고치지 않는다(새 표에 관계가 없다. `defineRelations(schema)`가 그대로 받는다).

- [ ] **Step 3: 연결 시간 제한** — `packages/db/src/index.ts`(사용자 결정 2026-10-04 "캐시 없이 공급자 호출"의 보완, 계획 리뷰 E6):

```ts
import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

// 연결 시간 제한 3초: DB 컨테이너가 포트는 받는데 응답하지 않으면 목록 캐시가 기다리지 않고 캐시 없이 공급자를 부른다(T4 스펙 4절).
export function createDb(env: DatabaseConfig) {
	return drizzle({
		connection: {
			connectionString: env.DATABASE_URL,
			connectionTimeoutMillis: 3000,
		},
		relations,
	});
}

export type Database = ReturnType<typeof createDb>;
```

  설치본 `drizzle-orm/node-postgres`의 `drizzle()` 타입 선언에서 객체 인자(`connection`, `relations`)를 확인한다. 받지 않으면 `new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 3000 })`(`pg`)을 만들어 `drizzle({ client: pool, relations })`로 넘긴다. 테스트의 `db.$client.end()`가 그대로 도는지 본다.
- [ ] **Step 4: 마이그레이션 만들기(코디네이터)** — `pnpm --filter @tts-pilot-app/db db:generate`(루트 `pnpm db:generate` 금지). `packages/db/src/migrations/<시각>_<이름>/`이 생긴다.
- [ ] **Step 5: 생성 SQL 검토(5·9행, 코디네이터)** — `migration.sql`에 다음만 있어야 한다: `CREATE TABLE "provider_list_cache"`(`"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `"owner_id" text`, 나머지 `NOT NULL`, `timestamp with time zone`, `jsonb`), `CONSTRAINT "provider_list_cache_key" UNIQUE NULLS NOT DISTINCT("owner_id","provider","list_kind","params_key","contract_version")`, `CREATE TABLE "provider_cooldown"`. `DROP`·`ALTER TABLE "user"…`·기존 표 변경이 있으면 멈추고 원인을 찾는다. 결과를 5·9행 증거로 적는다("새 표 둘, 기존 표 변경 없음 → 파괴적 변경 없음"). 계획 리뷰가 따로 만든 작업 트리에서 생성 SQL이 이 모양과 같음을 확인했다.
- [ ] **Step 6: 적용(7행, 코디네이터)** — 로컬 개발 DB: `pnpm --filter @tts-pilot-app/db db:migrate`(대상은 Task 1 Step 3으로 확인한 5433). 테스트 DB: `DATABASE_URL="postgresql://postgres:<compose 비밀번호>@localhost:5433/tts-pilot-app_test" pnpm --filter @tts-pilot-app/db db:migrate`(varlock은 프로세스 환경변수를 `.env`보다 먼저 쓴다). 두 출력의 요약을 적는다. 연결 문자열은 적지 않는다.
- [ ] **Step 7: 남은 변경 없음 확인(코디네이터)** — `pnpm --filter @tts-pilot-app/db db:generate`를 한 번 더 실행해 `No schema changes`인지 본다.
- [ ] **Step 8: 검사** — `pnpm --filter @tts-pilot-app/db check-types`, `pnpm exec biome check packages/db`. 그다음 `bts-reviewer(db)`(10행)는 Task 6 뒤에 Task 2·6을 함께 넘긴다.

### Task 3: 성우 계약 넓히기와 목록 공통 함수

**Files:**
- Modify: `packages/api/src/providers/contract.ts`
- Modify: `packages/api/src/providers/errors.ts`
- Create: `packages/api/src/providers/list.ts`, `list.test.ts`
- Modify: `packages/api/src/providers/typecast.ts`, `typecast.test.ts`
- Modify: `apps/web/src/lib/voice-filter.test.ts`(`Voice` 픽스처 새 필드, 계획 리뷰 E4)

**Interfaces:**
- Consumes: T3의 `runList`, `providerError`, `fieldNames`, `ProviderHttpError`, `reasonFromHttp`, `retryAfterSeconds`, `CHECK_TIMEOUT_MS`.
- Produces:
  - `contract.ts`:
    - `providerFailureSchema`, `type ProviderFailure`(값은 그대로), `type ProviderErrorData = { provider; reason; retryAt?: string }`.
    - `voiceSourceSchema`, `type VoiceSource`, `voiceSampleSchema`, `type VoiceSample`, `voiceTermsSchema`, `type VoiceTerms`, `voiceSchema`(넓힘), `type Voice`.
    - `voiceListPageSchema`, `type VoiceListPage`, `voiceListResultSchema`, `type VoiceListResult`.
    - `conditionValueSchema`, `voiceListInputSchema`, `type VoiceListInput`, `type ListInputOf<P>`.
    - `accentSchema`, `type Accent`, `accentListSchema`, `type AccentList`.
  - `errors.ts`: `type ProviderClient = { checkStatus(): …; listVoices?(input: VoiceListInput): Promise<VoiceListPage>; listAccents?(language: string): Promise<Accent[]> }`(메서드 문법, 제네릭 없음), `providerError(provider, reason, retryAt?)`, `runList(provider, call, timeoutMs = CHECK_TIMEOUT_MS)`(429 `Retry-After` 1시간 상한), `fetchJson(url, headers, signal, codesOf?)`.
  - `list.ts`: `emptyVoice(provider, source): Omit<Voice, "voiceId" | "name">`, `clip(text): string | null`(1,000자), `queryOf(entries): URLSearchParams`, `parseVoiceItems<T>(provider, items, schema, toVoice: (raw: T) => Voice | null): Voice[]`(null은 기록 없이 뺀다).
  - `providers/index.ts`의 `Providers`·`withKey`는 바꾸지 않는다(메서드 문법이라 공급자 구현이 좁은 입력을 받아도 들어간다).

- [ ] **Step 1: 실패하는 테스트 쓰기**

`packages/api/src/providers/list.test.ts`(신규):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Voice } from "./contract";
import { clip, emptyVoice, parseVoiceItems, queryOf } from "./list";

afterEach(() => vi.restoreAllMocks());

const voice = (voiceId: string, name: string): Voice => ({
	...emptyVoice("fish_audio", "public"),
	voiceId,
	name,
});
const item = z.object({ id: z.string().min(1), title: z.string().min(1) });
const parse = (items: unknown[]) =>
	parseVoiceItems("fish_audio", items, item, (raw) => voice(raw.id, raw.title));

describe("emptyVoice", () => {
	it("공급자가 주지 않은 필드는 비어 있고 이용 조건도 '주지 않음'이다", () => {
		expect(emptyVoice("typecast", "public")).toEqual({
			provider: "typecast",
			source: "public",
			englishName: null,
			gender: null,
			age: null,
			accent: null,
			useCases: [],
			descriptives: [],
			tags: [],
			languages: [],
			category: null,
			origin: null,
			description: null,
			models: [],
			previewUrl: null,
			samples: [],
			usage: null,
			terms: {
				freeUsersAllowed: null,
				noticePeriodDays: null,
				liveModeration: false,
				creditRate: null,
				licensed: false,
				retiring: false,
			},
		});
	});
});

describe("queryOf", () => {
	it("null·undefined·빈 글자·false는 보내지 않고 0과 true는 보내며 배열은 반복 키다", () => {
		const query = queryOf({
			page: 0,
			search: "",
			language: "ko",
			accent: null,
			gender: undefined,
			featured: false,
			include_total_count: true,
			tag: ["female", "narration"],
		});
		expect(query.toString()).toBe(
			"page=0&language=ko&include_total_count=true&tag=female&tag=narration",
		);
	});
});

describe("parseVoiceItems", () => {
	it("어긋난 항목만 빼고 수와 필드 이름만 한 줄 남긴다. 같은 id는 처음 것만 남긴다", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const voices = parse([
			{ id: "a", title: "가" },
			{ id: "b" },
			{ id: "a", title: "다른 가" },
		]);
		expect(voices.map((v) => [v.voiceId, v.name])).toEqual([["a", "가"]]);
		expect(log.mock.calls).toEqual([
			["[voiceList] fish_audio 성우 1명 제외: title"],
		]);
	});

	it("toVoice가 null을 돌려준 항목(공급자 모듈이 일부러 거른 성우)은 기록 없이 뺀다", () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const voices = parseVoiceItems(
			"fish_audio",
			[
				{ id: "a", title: "가" },
				{ id: "b", title: "나" },
			],
			item,
			(raw) => (raw.id === "b" ? null : voice(raw.id, raw.title)),
		);
		expect(voices.map((v) => v.voiceId)).toEqual(["a"]);
		expect(log).not.toHaveBeenCalled();
	});

	it("항목이 하나 이상인데 모두 빠지면 provider_error다. 빈 목록은 그대로 빈 목록이다", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => parse([{ id: "" }])).toThrow(
			expect.objectContaining({
				code: "BAD_GATEWAY",
				data: { provider: "fish_audio", reason: "provider_error" },
			}),
		);
		expect(parse([])).toEqual([]);
	});
});

describe("clip", () => {
	it("앞뒤 공백을 지우고 1,000자로 자르며 비면 null이다", () => {
		expect(clip("  안녕  ")).toBe("안녕");
		expect(clip("가".repeat(1200))).toHaveLength(1000);
		expect(clip("   ")).toBeNull();
		expect(clip(null)).toBeNull();
	});
});
```

`errors.test.ts`에는 더하지 않는다. 429 `retryAt`(상한 포함)과 시간 인자는 같은 경로를 지나는 Task 4·5 테스트가 확인한다(ponytail).

`typecast.test.ts`: 목록 테스트의 호출과 기대값을 새 계약에 맞춘다.
  - 목록을 부르는 도우미를 `createTypecast(KEY).listVoices?.({ provider: "typecast" })`로 바꾼다(지금 도우미 이름 그대로, 인자만 더함).
  - `result?.provider` 확인 줄을 지우고 페이지 모양을 확인한다: `expect(result).toMatchObject({ next: null, total: 1, totalExact: true, windowLimited: false })`.
  - 첫 테스트의 `toEqual` 기대 성우에 새 필드를 더한다:

```ts
			{
				provider: "typecast",
				source: "public",
				voiceId: "tc_0001",
				name: "민지",
				englishName: "Minji",
				gender: "female",
				age: "young_adult",
				accent: null,
				useCases: ["Ads/Promotion", "Game"],
				descriptives: [],
				tags: [],
				languages: [],
				category: null,
				origin: null,
				description: null,
				models: [
					{ model: "ssfm-v30", emotions: ["normal", "happy"] },
					{ model: "ssfm-v21", emotions: ["normal"] },
				],
				previewUrl: "https://static2.typecast.ai/preview/tc_0001.mp3",
				samples: [],
				usage: null,
				terms: {
					freeUsersAllowed: null,
					noticePeriodDays: null,
					liveModeration: false,
					creditRate: null,
					licensed: false,
					retiring: false,
				},
			},
```

  - 나머지 목록 테스트(이름 없는 성우 제외 로그, 같은 id, https가 아닌 샘플, 모두 빠짐)는 문구와 기대가 그대로다(`parseVoiceItems`가 같은 로그 줄을 낸다).
`apps/web/src/lib/voice-filter.test.ts`: `Voice` 픽스처(12줄 근처)에 새 필드를 더한다. `source: "public"`, `accent: null`, `descriptives: []`, `tags: []`, `languages: []`, `category: null`, `origin: null`, `description: null`, `samples: []`, `usage: null`, `terms: { freeUsersAllowed: null, noticePeriodDays: null, liveModeration: false, creditRate: null, licensed: false, retiring: false }`. web 타입 검사가 이 태스크 뒤에도 0이게 한다(계획 리뷰 E4). 기대 동작은 바꾸지 않는다.

- [ ] **Step 2: 실패 확인** — `pnpm --filter @tts-pilot-app/api test src/providers/list.test.ts src/providers/typecast.test.ts`. 기대: `list.ts`가 없어 import 실패, Typecast 기대값 불일치.

- [ ] **Step 3: 계약 고치기** — `contract.ts`:
  - 지금의 `ProviderFailure`·`ProviderErrorData` 타입 선언을 아래로 바꾼다.
  - `voiceSchema`·`voiceListResultSchema` 선언을 아래로 바꾼다.
  - 파일 끝에 입력·억양 스키마를 더한다.

```ts
// 공급자 호출이 실패한 사유. 목록 조회가 던지는 ORPCError의 data.reason이고 화면이 이 값으로 안내를 고른다(T3 스펙 4절).
// 연결 상태에서 '연결됨'·'확인 실패'를 빼고 '결과 모름'을 더한 것이다. 지난 목록의 사유(stale.reason)도 이 값이다.
export const providerFailureSchema = z.enum([
	"no_key",
	"provider_auth",
	"no_permission",
	"quota",
	"rate_limit",
	"provider_error",
	"unknown_outcome",
]);
export type ProviderFailure = z.infer<typeof providerFailureSchema>;
export type ProviderErrorData = {
	provider: ProviderId;
	reason: ProviderFailure;
	// 429 Retry-After로 정한 다음 호출 가능 시각(ISO). 공급자가 주지 않으면 없다
	retryAt?: string;
};

// 성우의 출처(T4 스펙 2절): 공개 목록(공개 성우 라이브러리, Typecast 공개 성우) 또는 서버 키 계정의 계정 성우
export const voiceSourceSchema = z.enum(["public", "account"]);
export type VoiceSource = z.infer<typeof voiceSourceSchema>;

// 오디오 src에 다른 스킴이 들어가지 않게 https만 받는다. 공급자 호스트 검사는 공급자 모듈이 한다(스펙 3절)
const httpsUrl = z.url({ protocol: /^https$/ });

// 기본 샘플 하나. ElevenLabs는 언어별(verified_languages), Fish Audio는 제목이 있는 여러 개다
export const voiceSampleSchema = z.object({
	// 샘플 언어 코드. 모르면 null
	language: z.string().nullable(),
	// 공급자가 준 샘플 이름. 없으면 null
	title: z.string().nullable(),
	url: httpsUrl,
});
export type VoiceSample = z.infer<typeof voiceSampleSchema>;

// 이용 조건(브리프 5절 패널 4). 공급자가 준 값만 담는다. 주지 않으면 null·false다
export const voiceTermsSchema = z.object({
	// ElevenLabs 라이브러리 free_users_allowed
	freeUsersAllowed: z.boolean().nullable(),
	// ElevenLabs 공유가 끝난 뒤 쓸 수 있는 일수(notice_period)
	noticePeriodDays: z.number().int().nonnegative().nullable(),
	// ElevenLabs 실시간 검수 성우
	liveModeration: z.boolean(),
	// ElevenLabs 크레딧 배율(rate). 공급자 값 그대로
	creditRate: z.number().nonnegative().nullable(),
	// Fish Audio 보증 성우(licensed)
	licensed: z.boolean(),
	// Fish Audio 공개 종료 중(pvc_release_state retiring)
	retiring: z.boolean(),
});
export type VoiceTerms = z.infer<typeof voiceTermsSchema>;

// 성우 하나(T3 스펙 5절 1, T4 스펙 6절 1). 공급자가 준 값만 담고 추정하지 않는다.
export const voiceSchema = z.object({
	provider: providerIdSchema,
	source: voiceSourceSchema,
	voiceId: z.string().min(1),
	// 화면 이름. Typecast는 한글 이름(비면 영문 이름)
	name: z.string(),
	// 화면 이름과 다른 영문 이름(Typecast). 없거나 같으면 null
	englishName: z.string().nullable(),
	gender: z.enum(["male", "female", "neutral"]).nullable(),
	// 공급자 연령 값 그대로(Typecast young_adult, ElevenLabs middle_aged 등)
	age: z.string().nullable(),
	// ElevenLabs 억양(seoul, standard …)
	accent: z.string().nullable(),
	// 콘텐츠(공급자 use_cases). 실제 값이 문서 enum과 달라 문자열로 받는다
	useCases: z.array(z.string()),
	// 분위기(ElevenLabs descriptive)
	descriptives: z.array(z.string()),
	// Fish Audio 태그 그대로(성별·연령·콘텐츠·분위기가 섞여 있다). 다른 공급자는 []
	tags: z.array(z.string()),
	// 공급자가 준 언어 코드
	languages: z.array(z.string()),
	// 공급자 성우 종류(ElevenLabs category)
	category: z.string().nullable(),
	// 계정 성우의 출처: premade 제공 성우, saved 라이브러리에서 저장, own 내가 만든 성우. 공개 목록은 null
	origin: z.enum(["premade", "saved", "own"]).nullable(),
	description: z.string().max(1000).nullable(),
	// Typecast 모델별 감정. 다른 공급자는 []
	models: z.array(
		z.object({ model: z.string(), emotions: z.array(z.string()) }),
	),
	// 행의 샘플. 브라우저가 공급자 주소에서 바로 받는다
	previewUrl: httpsUrl.nullable(),
	// 패널의 샘플 전부(언어별·제목별). Typecast는 [](패널은 previewUrl을 쓴다)
	samples: z.array(voiceSampleSchema),
	// 사용량: ElevenLabs 최근 1년 글자 수, Fish Audio 사용 횟수
	usage: z
		.object({
			kind: z.enum(["chars_1y", "tasks"]),
			count: z.number().int().nonnegative(),
		})
		.nullable(),
	terms: voiceTermsSchema,
});
export type Voice = z.infer<typeof voiceSchema>;

// 목록 한 페이지(공급자 모듈이 돌려주고 목록 캐시가 보관하는 값)
export const voiceListPageSchema = z.object({
	voices: z.array(voiceSchema),
	// 다음 페이지: ElevenLabs 공개·Fish Audio는 페이지 번호, ElevenLabs 내 계정은 커서. 끝이면 null
	next: z.union([z.number().int().nonnegative(), z.string().min(1)]).nullable(),
	// 공급자가 준 전체 수. 주지 않으면 null
	total: z.number().int().nonnegative().nullable(),
	// 전체 수가 정확한가(Fish Audio total_is_exact)
	totalExact: z.boolean(),
	// 공급자가 조건마다 보여 주는 수에 상한이 있다(Fish Audio 1,000명)
	windowLimited: z.boolean(),
});
export type VoiceListPage = z.infer<typeof voiceListPageSchema>;

export const voiceListResultSchema = voiceListPageSchema.extend({
	provider: providerIdSchema,
	source: voiceSourceSchema,
	fetchedAt: z.iso.datetime(),
	// 공급자가 실패해 지난 목록(만료 뒤 7일 안)을 돌려줄 때만 있다
	stale: z
		.object({
			reason: providerFailureSchema,
			retryAt: z.iso.datetime().nullable(),
		})
		.nullable(),
});
export type VoiceListResult = z.infer<typeof voiceListResultSchema>;

// 공급자에게 그대로 가는 조건 값. 화면은 고정 선택지만 보낸다(브리프 6절). 실측 값: ko, gyeongsang, middle-aged, social-media
export const conditionValueSchema = z
	.string()
	.trim()
	.min(1)
	.max(40)
	.regex(/^[A-Za-z0-9_-]+$/);
const searchSchema = z.string().trim().max(100);
const valuesSchema = z.array(conditionValueSchema).max(10);
const optionalValue = conditionValueSchema.nullable();

// 목록 입력(T4 스펙 3절). 페이지 크기는 공급자 모듈이 100으로 정한다.
export const voiceListInputSchema = z.union([
	z.object({ provider: z.literal("typecast") }),
	z.object({
		provider: z.literal("elevenlabs"),
		source: z.literal("public"),
		page: z.number().int().min(0).max(999),
		query: z.object({
			search: searchSchema,
			// null이면 모든 언어
			language: optionalValue,
			accent: optionalValue,
			gender: optionalValue,
			age: optionalValue,
			category: z.enum(["professional", "famous", "high_quality"]).nullable(),
			useCases: valuesSchema,
			descriptives: valuesSchema,
			featured: z.boolean(),
			sort: z.enum([
				"trending",
				"created_date",
				"usage_character_count_1y",
				"cloned_by_count",
			]),
		}),
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		source: z.literal("account"),
		// 첫 페이지는 null, 다음은 공급자가 준 next_page_token
		cursor: z.string().min(1).max(1000).nullable(),
		query: z.object({
			search: searchSchema,
			voiceType: z.enum(["personal", "community", "default"]).nullable(),
			category: z
				.enum(["premade", "cloned", "generated", "professional"])
				.nullable(),
			gender: optionalValue,
			age: optionalValue,
			language: optionalValue,
			accent: optionalValue,
			useCases: valuesSchema,
			sort: z.enum(["created_at_unix", "name"]),
			direction: z.enum(["desc", "asc"]),
		}),
	}),
	z.object({
		provider: z.literal("fish_audio"),
		source: voiceSourceSchema,
		// 조건마다 1,000명(100명 × 10페이지)까지다(2026-10-04 실측)
		page: z.number().int().min(1).max(10),
		query: z.object({
			search: searchSchema,
			language: optionalValue,
			// 모두 포함(AND, 2026-10-04 실측)
			tags: valuesSchema,
			licensed: z.boolean(),
			sort: z.enum(["score", "task_count", "created_at"]),
		}),
	}),
]);
export type VoiceListInput = z.infer<typeof voiceListInputSchema>;
export type ListInputOf<P extends ProviderId> = Extract<
	VoiceListInput,
	{ provider: P }
>;

// ElevenLabs 억양 하나(억양 조건의 선택지). value는 조회 값, name은 공급자 표시 이름
export const accentSchema = z.object({ value: z.string(), name: z.string() });
export type Accent = z.infer<typeof accentSchema>;
export const accentListSchema = z.object({
	language: z.string(),
	accents: z.array(accentSchema),
	fetchedAt: z.iso.datetime(),
	stale: voiceListResultSchema.shape.stale,
});
export type AccentList = z.infer<typeof accentListSchema>;
```

- [ ] **Step 4: `errors.ts` 고치기**
  - import에 `Accent`, `VoiceListInput`, `VoiceListPage`를 더하고 `VoiceListResult`를 뺀다.
  - `ProviderClient`를 메서드 문법으로 바꾼다(제네릭 없음, ponytail):

```ts
// 공급자 클라이언트. 목록·억양은 메서드 문법이다. 메서드 매개변수는 이변이라 공급자 구현이 자기 입력 모양(ListInputOf<P>)만 받아도 들어간다.
// 라우터는 context.providers?.[input.provider]로 그 공급자의 클라이언트를 고르므로 입력과 구현이 어긋나지 않는다.
export type ProviderClient = {
	checkStatus(): Promise<ProviderStatusResult>;
	// 성우 목록 한 페이지(T3 Typecast, T4 ElevenLabs·Fish Audio)
	listVoices?(input: VoiceListInput): Promise<VoiceListPage>;
	// ElevenLabs만: 언어의 억양 목록(억양 조건의 선택지, T4)
	listAccents?(language: string): Promise<Accent[]>;
};
```

  - `withTimeout`에 시간 인자를 더한다: `async function withTimeout<T>(call: (signal: AbortSignal) => Promise<T>, timeoutMs = CHECK_TIMEOUT_MS)`. 본문의 `setTimeout(…, CHECK_TIMEOUT_MS)`를 `timeoutMs`로 바꾼다. 위 주석의 "공급자 호출 공통 10초 제한"을 "공급자 호출 공통 시간 제한(기본 10초)"으로 고친다.
  - `providerError`:

```ts
// 공급자 문제를 화면까지 보낼 오류. data에는 공급자·사유(429면 다음 호출 가능 시각)만 담고 원래 오류(cause)를 붙이지 않는다.
export function providerError(
	provider: ProviderId,
	reason: ProviderFailure,
	retryAt?: string,
) {
	const data: ProviderErrorData =
		retryAt === undefined ? { provider, reason } : { provider, reason, retryAt };
	return new ORPCError(FAILURE_CODE[reason], { data });
}
```

  - `runList`에 시간 인자를 더한다. `ProviderHttpError` 분기는 `Retry-After`를 시각으로 바꿔 담고 1시간을 넘지 않게 한다:

```ts
// 429 Retry-After는 1시간까지만 따른다. 더 긴 값이 대기 표에 적히면 목록·새로 고침이 며칠씩 막히고 화면에서 풀 방법이 없다(T4 계획 리뷰 E16)
const MAX_RETRY_SECONDS = 60 * 60;

// 목록 조회 공통 틀(T3 스펙 3·4절): 시간 제한(기본 10초), 재시도 없음, 공급자 문제는 사유를 붙여 던진다.
export async function runList<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
	timeoutMs = CHECK_TIMEOUT_MS,
): Promise<T> {
	try {
		return await withTimeout(call, timeoutMs);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) {
			throw providerError(provider, "unknown_outcome");
		}
		if (error instanceof ProviderHttpError) {
			const reason = reasonFromHttp(error.status, error.codes);
			// 목록 조회의 입력 거절(400·422)과 표에 없는 상태는 공급자 장애로 보인다.
			const failure =
				reason === null || reason === "provider_input" ? "provider_error" : reason;
			// 429의 Retry-After(초)는 다음 호출 가능 시각으로 담는다. 목록 캐시가 대기 표에 적고 화면이 시각을 보인다(T4 스펙 4절)
			const seconds =
				failure === "rate_limit" ? retryAfterSeconds(error.retryAfter) : null;
			throw providerError(
				provider,
				failure,
				seconds === null
					? undefined
					: new Date(
							Date.now() + Math.min(seconds, MAX_RETRY_SECONDS) * 1000,
						).toISOString(),
			);
		}
		// (이 아래는 T3 그대로)
```

  - 파일 끝에 공급자 REST 조회 공통 함수를 더한다(ElevenLabs 목록과 Fish Audio가 함께 쓴다, ponytail):

```ts
// 공급자 REST 조회 공통(T4 ElevenLabs 목록·억양, Fish Audio 전부). 실패하면 상태 코드·공급자 오류 코드·Retry-After만 바꿔 담는다(본문의 값·메시지는 버린다).
export async function fetchJson(
	url: string,
	headers: Record<string, string>,
	signal: AbortSignal,
	codesOf: (body: unknown) => string[] = () => [],
): Promise<unknown> {
	const response = await fetch(url, { headers, signal });
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		throw new ProviderHttpError(
			response.status,
			codesOf(body),
			response.headers.get("retry-after"),
		);
	}
	return response.json();
}
```

- [ ] **Step 5: `list.ts` 쓰기**

```ts
// packages/api/src/providers/list.ts
import type { z } from "zod";

import type { ProviderId, Voice, VoiceSource } from "./contract";
import { fieldNames, providerError } from "./errors";

// 공급자가 주지 않은 필드의 기본값. 공급자 모듈은 { ...emptyVoice(…), 바뀌는 필드 }로 성우를 만든다.
// 이용 조건의 기본도 '주지 않음'이다(Typecast 전부, 계정 성우).
export const emptyVoice = (
	provider: ProviderId,
	source: VoiceSource,
): Omit<Voice, "voiceId" | "name"> => ({
	provider,
	source,
	englishName: null,
	gender: null,
	age: null,
	accent: null,
	useCases: [],
	descriptives: [],
	tags: [],
	languages: [],
	category: null,
	origin: null,
	description: null,
	models: [],
	previewUrl: null,
	samples: [],
	usage: null,
	terms: {
		freeUsersAllowed: null,
		noticePeriodDays: null,
		liveModeration: false,
		creditRate: null,
		licensed: false,
		retiring: false,
	},
});

// 설명은 1,000자까지 담는다(T4 스펙 6절: 응답·캐시 행 크기와 패널 높이를 묶는다). 비면 null
export function clip(text: string | null | undefined): string | null {
	const trimmed = text?.trim();
	return trimmed ? trimmed.slice(0, 1000) : null;
}

type QueryValue = string | number | boolean | readonly string[] | null | undefined;

// 조건을 쿼리로 바꾼다. 빈 값·null·false는 보내지 않는다(공급자 기본값 그대로). 배열은 반복 키다(ElevenLabs SDK 직렬화와 Fish Audio 실측 2026-10-04).
export function queryOf(entries: Record<string, QueryValue>): URLSearchParams {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(entries)) {
		if (value === null || value === undefined || value === "" || value === false)
			continue;
		const values: readonly (string | number | boolean)[] = Array.isArray(value)
			? value
			: [value as string | number | boolean];
		for (const one of values) query.append(key, String(one));
	}
	return query;
}

// 성우 항목 단위 검증(T3 스펙 2절, T4 스펙 3절): 어긋난 성우만 빼고 뺀 수와 필드 이름만 한 줄 남긴다.
// 항목이 하나 이상인데 모두 빠지면 공급자가 모양을 바꾼 것이라 provider_error다. 같은 id는 처음 것만 남긴다(화면의 키가 id로 묶인다).
// toVoice가 null을 돌려준 항목은 공급자 모듈이 일부러 거른 성우라(Fish Audio의 합성할 수 없는 성우) 기록하지 않는다.
export function parseVoiceItems<T>(
	provider: ProviderId,
	items: readonly unknown[],
	schema: z.ZodType<T>,
	toVoice: (raw: T) => Voice | null,
): Voice[] {
	const voices = new Map<string, Voice>();
	const dropped: unknown[] = [];
	for (const item of items) {
		const parsed = schema.safeParse(item);
		if (!parsed.success) {
			dropped.push(parsed.error);
			continue;
		}
		const voice = toVoice(parsed.data);
		if (voice !== null && !voices.has(voice.voiceId)) voices.set(voice.voiceId, voice);
	}
	if (dropped.length > 0) {
		console.error(
			`[voiceList] ${provider} 성우 ${dropped.length}명 제외: ${fieldNames(dropped).join(", ")}`,
		);
		if (voices.size === 0) throw providerError(provider, "provider_error");
	}
	return [...voices.values()];
}
```

- [ ] **Step 6: Typecast를 새 계약으로** — `typecast.ts`:
  - `toVoice`가 `{ ...emptyVoice("typecast", "public"), voiceId, name, englishName, gender, age, useCases, models, previewUrl }`를 돌려준다(새 필드는 `emptyVoice`가 채운다).
  - `listVoices`의 성우 반복문(`voices` Map, `dropped`, 로그, 모두 빠짐)을 `parseVoiceItems("typecast", originals, rawVoiceSchema, toVoice)` 한 줄로 바꾼다.
  - 돌려주는 값은 페이지 모양 `{ voices, next: null, total: voices.length, totalExact: true, windowLimited: false }`이다. `listVoices`는 입력을 받지 않는 `() => runList(…)` 그대로 둔다(인자 없는 함수도 `listVoices?(input)` 자리에 들어간다. Typecast는 조건이 없다).
  - `fieldNames`·`providerError` import가 쓰이지 않으면 지운다.
- [ ] **Step 7: 통과 확인** — `pnpm --filter @tts-pilot-app/api test src/providers`. 기대: 모두 통과(연결 확인 테스트 포함). 라우터 테스트(`src/routers`)는 Task 7에서 고친다. 이 태스크 뒤에는 라우터가 아직 옛 결과 모양이라 그 테스트와 api 타입 검사가 실패하는 것이 정상이다(Task 3의 임시 라우터 수정을 두지 않는다, ponytail).
- [ ] **Step 8: 검사** — `pnpm --filter web check-types`(0, 픽스처), `pnpm --filter web test`(그대로 통과), `pnpm exec biome check --write packages/api/src apps/web/src/lib/voice-filter.test.ts`. api 타입 검사는 Task 7 끝에서 처음 0이다(Global Constraints). 그다음 코디네이터가 `pnpm dev-cycle table F --write --upgrade`로 security 행을 붙인다.

### Task 4: ElevenLabs 목록(공개 라이브러리·내 계정)과 억양

**Files:**
- Modify: `packages/api/src/providers/elevenlabs.ts`
- Test: `packages/api/src/providers/elevenlabs.test.ts`(끝에 더함)

**Interfaces:**
- Consumes: Task 3의 `ListInputOf<"elevenlabs">`, `VoiceListPage`, `VoiceSource`, `Accent`, `conditionValueSchema`, `emptyVoice`, `clip`, `queryOf`, `parseVoiceItems`, `runList`, `fetchJson`. 이 파일의 `detailCodes`.
- Produces: `createElevenLabs(apiKey): ProviderClient`에 `listVoices(input)`, `listAccents(language)`.

- [ ] **Step 1: 실패하는 테스트 쓰기** — `elevenlabs.test.ts` 끝에 더한다(파일 맨 위의 `useFetchMock()`·`json`·`KEY`를 그대로 쓴다. `KEY`가 다른 이름이면 그 이름으로).

```ts
const SAMPLE_EN = "https://storage.googleapis.com/eleven-public-prod/el_lib_1/en.mp3";
const SAMPLE_KO =
	"https://api.us.elevenlabs.io/v1/voices/el_lib_1/previews/audio?payload=abc";
const libraryVoice = (overrides: Record<string, unknown> = {}) => ({
	public_owner_id: "owner_1",
	voice_id: "el_lib_1",
	name: "Jiyoung - Calm Narrator",
	gender: "female",
	age: "young",
	accent: "seoul",
	descriptive: "calm",
	use_case: "narrative_story",
	category: "professional",
	language: "ko",
	locale: "ko-KR",
	description: "  차분하고 따뜻한 목소리  ",
	preview_url: SAMPLE_EN,
	verified_languages: [
		{ language: "en", model_id: "eleven_multilingual_v2", preview_url: SAMPLE_EN },
		{ language: "ko", model_id: "eleven_v4", preview_url: SAMPLE_KO },
	],
	usage_character_count_1y: 2_100_000,
	usage_character_count_7d: 10,
	play_api_usage_character_count_1y: 10,
	cloned_by_count: 3,
	rate: 1,
	free_users_allowed: false,
	live_moderation_enabled: true,
	featured: false,
	notice_period: 730,
	date_unix: 1_790_000_000,
	...overrides,
});
const libraryPage = (voices: unknown[], extra: Record<string, unknown> = {}) => ({
	voices,
	has_more: true,
	total_count: 5953,
	...extra,
});
const publicInput = (
	query: Partial<Extract<ListInputOf<"elevenlabs">, { source: "public" }>["query"]> = {},
	page = 0,
): ListInputOf<"elevenlabs"> => ({
	provider: "elevenlabs",
	source: "public",
	page,
	query: {
		search: "",
		language: "ko",
		accent: null,
		gender: null,
		age: null,
		category: null,
		useCases: [],
		descriptives: [],
		featured: false,
		sort: "trending",
		...query,
	},
});
const accountInput = (
	cursor: string | null = null,
	query: Partial<
		Extract<ListInputOf<"elevenlabs">, { source: "account" }>["query"]
	> = {},
): ListInputOf<"elevenlabs"> => ({
	provider: "elevenlabs",
	source: "account",
	cursor,
	query: {
		search: "",
		voiceType: null,
		category: null,
		gender: null,
		age: null,
		language: null,
		accent: null,
		useCases: [],
		sort: "created_at_unix",
		direction: "desc",
		...query,
	},
});
const calledUrl = (index = 0) => new URL(String(fetchMock.mock.calls[index]?.[0]));
const listEl = (input: ListInputOf<"elevenlabs">) =>
	createElevenLabs(KEY).listVoices?.(input);

describe("ElevenLabs 공개 라이브러리", () => {
	it("성우를 계약 모양으로 바꾼다. 지금 언어의 샘플이 행 샘플이고 패널 샘플의 맨 앞이며 같은 주소는 한 번이다", async () => {
		fetchMock.mockResolvedValue(json(200, libraryPage([libraryVoice()])));
		const page = await listEl(publicInput());
		expect(page).toMatchObject({
			next: 1,
			total: 5953,
			totalExact: true,
			windowLimited: false,
		});
		expect(page?.voices).toEqual([
			{
				provider: "elevenlabs",
				source: "public",
				voiceId: "el_lib_1",
				name: "Jiyoung - Calm Narrator",
				englishName: null,
				gender: "female",
				age: "young",
				accent: "seoul",
				useCases: ["narrative_story"],
				descriptives: ["calm"],
				tags: [],
				languages: ["ko", "en"],
				category: "professional",
				origin: null,
				description: "차분하고 따뜻한 목소리",
				models: [],
				previewUrl: SAMPLE_KO,
				samples: [
					{ language: "ko", title: null, url: SAMPLE_KO },
					{ language: "en", title: null, url: SAMPLE_EN },
				],
				usage: { kind: "chars_1y", count: 2_100_000 },
				terms: {
					freeUsersAllowed: false,
					noticePeriodDays: 730,
					liveModeration: true,
					creditRate: 1,
					licensed: false,
					retiring: false,
				},
			},
		]);
	});

	it("조건을 쿼리로 보낸다: 빈 값·false는 빼고, 배열은 반복 키, 키는 xi-api-key 헤더, 한 번만 부른다", async () => {
		fetchMock.mockResolvedValue(json(200, libraryPage([], { has_more: false })));
		await listEl(
			publicInput(
				{
					accent: "seoul",
					gender: "female",
					useCases: ["narrative_story", "conversational"],
					descriptives: ["calm"],
					category: "professional",
					sort: "created_date",
				},
				2,
			),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = calledUrl();
		expect(url.origin + url.pathname).toBe(
			"https://api.elevenlabs.io/v1/shared-voices",
		);
		expect(url.searchParams.get("page_size")).toBe("100");
		expect(url.searchParams.get("page")).toBe("2");
		expect(url.searchParams.get("language")).toBe("ko");
		expect(url.searchParams.getAll("use_cases")).toEqual([
			"narrative_story",
			"conversational",
		]);
		expect(url.searchParams.has("featured")).toBe(false);
		expect(url.searchParams.has("search")).toBe(false);
		expect(url.searchParams.has("age")).toBe(false);
		const init = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
	});

	it("마지막 페이지면 next가 null이고, 전체 수가 없으면 total null·totalExact false다", async () => {
		fetchMock.mockResolvedValue(
			json(200, { voices: [libraryVoice()], has_more: false }),
		);
		expect(await listEl(publicInput())).toMatchObject({
			next: null,
			total: null,
			totalExact: false,
		});
	});

	it("모든 언어(null)면 기본 샘플이 행 샘플이다. 공급자 호스트가 아니거나 http인 샘플은 버린다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({
						verified_languages: [
							{ language: "ko", preview_url: "https://evil.example/ko.mp3" },
						],
					}),
					libraryVoice({ voice_id: "el_lib_2", preview_url: "http://storage.googleapis.com/x.mp3", verified_languages: null }),
				]),
			),
		);
		const page = await listEl(publicInput({ language: null }));
		expect(page?.voices.map((v) => [v.previewUrl, v.samples.length])).toEqual([
			[SAMPLE_EN, 1],
			[null, 0],
		]);
	});

	it("설명은 1,000자로 자르고, 빈 descriptive·use_case는 배열에 넣지 않는다. 모르는 성별은 null이다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({
						description: "가".repeat(1500),
						descriptive: "",
						use_case: "",
						gender: "Unknown",
					}),
				]),
			),
		);
		const [voice] = (await listEl(publicInput()))?.voices ?? [];
		expect(voice?.description).toHaveLength(1000);
		expect(voice?.descriptives).toEqual([]);
		expect(voice?.useCases).toEqual([]);
		expect(voice?.gender).toBeNull();
	});

	it("이름이 없는 성우만 빼고 한 줄 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, libraryPage([libraryVoice({ name: "" }), libraryVoice({ voice_id: "el_lib_2" })])),
		);
		const page = await listEl(publicInput());
		expect(page?.voices.map((v) => v.voiceId)).toEqual(["el_lib_2"]);
		expect(log.mock.calls).toEqual([
			["[voiceList] elevenlabs 성우 1명 제외: name"],
		]);
	});

	it.each([
		[401, {}, "BAD_GATEWAY", "provider_auth"],
		[401, { detail: { status: "missing_permissions" } }, "BAD_GATEWAY", "no_permission"],
		[503, {}, "BAD_GATEWAY", "provider_error"],
	])("%s → %s·%s, 재시도하지 않는다", async (status, body, code, reason) => {
		fetchMock.mockResolvedValue(json(status, body));
		await expect(listEl(publicInput())).rejects.toMatchObject({
			code,
			data: { provider: "elevenlabs", reason },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429면 TOO_MANY_REQUESTS이고 Retry-After를 다음 호출 시각으로 담는다", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
		fetchMock.mockResolvedValue(
			json(429, { detail: { status: "rate_limit_exceeded" } }, { "retry-after": "30" }),
		);
		await expect(listEl(publicInput())).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "rate_limit", retryAt: "2026-10-05T00:00:30.000Z" },
		});
		vi.useRealTimers();
	});

	it("10초 안에 답이 없으면 unknown_outcome이다", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
		const pending = listEl(publicInput());
		const assertion = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(10_000);
		await assertion;
		vi.useRealTimers();
	});

	it("응답 모양이 어긋나면(voices가 배열이 아님) 목록 전체가 provider_error다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(json(200, { voices: null, has_more: false }));
		await expect(listEl(publicInput())).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "elevenlabs", reason: "provider_error" },
		});
	});

	it("Retry-After가 1시간보다 길면 1시간 뒤로 줄인다", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
		fetchMock.mockResolvedValue(json(429, {}, { "retry-after": "86400" }));
		await expect(listEl(publicInput())).rejects.toMatchObject({
			data: { reason: "rate_limit", retryAt: "2026-10-05T01:00:00.000Z" },
		});
		vi.useRealTimers();
	});

	it("같은 언어 샘플이 여럿이면(모델·억양별) 첫 것만 남긴다", async () => {
		const SAMPLE_KO_2 =
			"https://api.us.elevenlabs.io/v1/voices/el_lib_1/previews/audio?payload=def";
		fetchMock.mockResolvedValue(
			json(
				200,
				libraryPage([
					libraryVoice({
						verified_languages: [
							{ language: "ko", model_id: "eleven_v4", preview_url: SAMPLE_KO },
							{ language: "ko", model_id: "eleven_multilingual_v2", preview_url: SAMPLE_KO_2 },
						],
					}),
				]),
			),
		);
		const [voice] = (await listEl(publicInput()))?.voices ?? [];
		expect(voice?.samples.map((sample) => sample.url)).toEqual([SAMPLE_KO, SAMPLE_EN]);
	});
});

describe("ElevenLabs 내 계정", () => {
	const accountVoice = (overrides: Record<string, unknown> = {}) => ({
		voice_id: "el_acc_1",
		name: "Rachel",
		category: "premade",
		labels: {
			gender: "female",
			age: "young",
			accent: "american",
			language: "en",
			use_case: "narrative_story",
			descriptive: "calm",
		},
		description: null,
		preview_url: "https://storage.googleapis.com/eleven-public-prod/premade/rachel.mp3",
		verified_languages: [],
		is_owner: false,
		...overrides,
	});

	it("출처를 정한다: premade는 제공 성우, is_owner는 내가 만든 성우, 그 밖은 라이브러리에서 저장. label을 성별·연령·억양·언어·콘텐츠·분위기로 옮긴다", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				voices: [
					accountVoice(),
					accountVoice({ voice_id: "el_acc_2", category: "professional" }),
					accountVoice({ voice_id: "el_acc_3", category: "cloned", is_owner: true, labels: {} }),
				],
				has_more: true,
				total_count: 31,
				next_page_token: "tok_2",
			}),
		);
		const page = await listEl(accountInput());
		expect(page).toMatchObject({ next: "tok_2", total: 31, totalExact: true });
		expect(page?.voices.map((v) => [v.voiceId, v.source, v.origin])).toEqual([
			["el_acc_1", "account", "premade"],
			["el_acc_2", "account", "saved"],
			["el_acc_3", "account", "own"],
		]);
		expect(page?.voices[0]).toMatchObject({
			gender: "female",
			age: "young",
			accent: "american",
			languages: ["en"],
			useCases: ["narrative_story"],
			descriptives: ["calm"],
			category: "premade",
			terms: { freeUsersAllowed: null, licensed: false },
		});
		const url = calledUrl();
		expect(url.pathname).toBe("/v2/voices");
		expect(url.searchParams.get("include_total_count")).toBe("true");
		expect(url.searchParams.get("sort")).toBe("created_at_unix");
		expect(url.searchParams.get("sort_direction")).toBe("desc");
		expect(url.searchParams.has("next_page_token")).toBe(false);
	});

	it("다음 페이지는 커서를 보내고, has_more가 거짓이면 next가 null이다", async () => {
		fetchMock.mockResolvedValue(
			json(200, { voices: [], has_more: false, total_count: 31, next_page_token: null }),
		);
		const page = await listEl(accountInput("tok_2"));
		expect(calledUrl().searchParams.get("next_page_token")).toBe("tok_2");
		expect(page?.next).toBeNull();
	});

	it("조건을 쿼리로 보낸다: 출처·성우 종류·label 조건·콘텐츠·정렬과 방향", async () => {
		fetchMock.mockResolvedValue(
			json(200, { voices: [], has_more: false, total_count: 0 }),
		);
		await listEl(
			accountInput(null, {
				search: "rachel",
				voiceType: "community",
				category: "professional",
				gender: "female",
				age: "young",
				language: "en",
				accent: "american",
				useCases: ["narrative_story"],
				sort: "name",
				direction: "asc",
			}),
		);
		const query = calledUrl().searchParams;
		expect(
			Object.fromEntries([...new Set(query.keys())].map((key) => [key, query.getAll(key).join(",")])),
		).toEqual({
			page_size: "100",
			include_total_count: "true",
			search: "rachel",
			voice_type: "community",
			category: "professional",
			gender: "female",
			age: "young",
			language: "en",
			accent: "american",
			use_cases: "narrative_story",
			sort: "name",
			sort_direction: "asc",
		});
	});
});

describe("ElevenLabs 억양 목록", () => {
	it("언어의 억양을 { value, name }으로 돌려준다", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				accents: [
					{ accent: "seoul", language: "ko", code: "ko-seoul", name: "Seoul" },
					{ accent: "gyeongsang", language: "ko", code: "ko-gyeongsang", name: "Gyeongsang" },
				],
			}),
		);
		const accents = await createElevenLabs(KEY).listAccents?.("ko");
		expect(accents).toEqual([
			{ value: "seoul", name: "Seoul" },
			{ value: "gyeongsang", name: "Gyeongsang" },
		]);
		expect(calledUrl().pathname).toBe("/v1/voices/accents");
		expect(calledUrl().searchParams.get("language")).toBe("ko");
	});

	it("조건 값 검사를 통과하지 못하는 억양은 선택지에서 빼고 한 줄 남긴다(고르면 BAD_REQUEST가 되므로)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, {
				accents: [
					{ accent: "seoul", language: "ko", code: "ko-seoul", name: "Seoul" },
					{ accent: "new york", language: "en", code: "en-ny", name: "New York" },
				],
			}),
		);
		expect(await createElevenLabs(KEY).listAccents?.("ko")).toEqual([
			{ value: "seoul", name: "Seoul" },
		]);
		expect(log.mock.calls).toEqual([["[voiceList] elevenlabs 억양 1개 제외: accent"]]);
	});

	it("억양 조회가 401이면 provider_auth이고 재시도하지 않는다", async () => {
		fetchMock.mockResolvedValue(json(401, {}));
		await expect(createElevenLabs(KEY).listAccents?.("ko")).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "elevenlabs", reason: "provider_auth" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
```

  import에 `type ListInputOf`(`./contract`)와 `vi`(이미 있으면 그대로)를 더한다. 테스트 사이에 시계·스파이를 되돌리도록 파일에 `afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); })`가 없으면 더한다.

- [ ] **Step 2: 실패 확인** — `pnpm --filter @tts-pilot-app/api test src/providers/elevenlabs.test.ts`. 기대: `listVoices`가 없어 `undefined`, 새 테스트 실패. 연결 확인 테스트는 통과.

- [ ] **Step 3: 구현** — `elevenlabs.ts`. import에 `conditionValueSchema, type Accent, type ListInputOf, type Voice, type VoiceListPage, type VoiceSample, type VoiceSource`(`./contract`), `clip, emptyVoice, parseVoiceItems, queryOf`(`./list`), `fetchJson, runList`(`./errors`)를 더한다. `createElevenLabs`의 반환 타입은 `ProviderClient` 그대로다. `detailCodes` 아래에 더한다:

```ts
// 목록은 SDK 대신 REST로 부른다: SDK가 응답 전체를 한 번에 검사해 성우 하나의 빠진 필드가 목록 전체를 막는다(T4 계획 '스펙과 다른 점' 1).
const ELEVENLABS_HOST = "https://api.elevenlabs.io";
const PAGE_SIZE = 100;

// 샘플은 https이고 ElevenLabs 저장소일 때만 오디오 src에 넣는다(2026-10-04 실측 호스트: storage.googleapis.com, api.us.elevenlabs.io)
const sampleUrl = z.url({
	protocol: /^https$/,
	hostname: /^(storage\.googleapis\.com|([a-z0-9-]+\.)*elevenlabs\.io)$/,
	normalize: true,
});
// 빈 글자는 null이다(실측: descriptive가 ""인 성우 1명)
const optionalText = z
	.string()
	.nullish()
	.transform((value) => value?.trim() || null);
// 언어별 샘플. 주소는 하나씩 검사해 어긋난 것만 버린다(samplesOf)
const verifiedSchema = z
	.array(z.looseObject({ language: z.string().min(1), preview_url: z.unknown() }))
	.nullish()
	.catch(null);

// 공개 라이브러리 성우와 계정 성우가 함께 쓰는 필드
const commonFields = {
	voice_id: z.string().min(1),
	name: z.string().trim().min(1),
	category: optionalText,
	description: optionalText,
	preview_url: sampleUrl.nullish().catch(null),
	verified_languages: verifiedSchema,
};
const libraryVoiceSchema = z.object({
	...commonFields,
	gender: optionalText,
	age: optionalText,
	accent: optionalText,
	descriptive: optionalText,
	use_case: optionalText,
	language: optionalText,
	usage_character_count_1y: z.number().int().nonnegative().nullish().catch(null),
	free_users_allowed: z.boolean().nullish().catch(null),
	live_moderation_enabled: z.boolean().nullish().catch(null),
	notice_period: z.number().int().nonnegative().nullish().catch(null),
	rate: z.number().nonnegative().nullish().catch(null),
});
// 라이브러리 모양 + 계정 성우의 출처(공개 목록은 없음)
type ElRaw = z.infer<typeof libraryVoiceSchema> & { origin?: Voice["origin"] };
// 계정 성우는 label 맵을 라이브러리 모양으로 옮긴다. 이용 조건 필드는 없다(ponytail: 조립 함수 하나)
const accountVoiceSchema = z
	.object({
		...commonFields,
		labels: z.record(z.string(), z.string()).nullish().catch(null),
		is_owner: z.boolean().nullish().catch(null),
	})
	.transform(({ labels, is_owner, ...raw }): ElRaw => {
		const label = (key: string) => labels?.[key]?.trim() || null;
		return {
			...raw,
			gender: label("gender"),
			age: label("age"),
			accent: label("accent"),
			descriptive: label("descriptive"),
			use_case: label("use_case"),
			language: label("language"),
			usage_character_count_1y: null,
			free_users_allowed: null,
			live_moderation_enabled: null,
			notice_period: null,
			rate: null,
			// 실측(2026-10-04, 31명): premade 21, 라이브러리에서 저장한 professional 9(sharing.status copied), 내가 만든 클론 1(is_owner)
			origin: raw.category === "premade" ? "premade" : is_owner ? "own" : "saved",
		};
	});
// 응답 모양. 어긋나면 목록 전체가 provider_error다
const libraryPageSchema = z.object({
	voices: z.array(z.unknown()),
	has_more: z.boolean(),
	total_count: z.number().int().nonnegative().nullish(),
});
const accountPageSchema = libraryPageSchema.extend({
	next_page_token: z.string().min(1).nullish(),
});
const accentsSchema = z.object({
	accents: z.array(z.object({ accent: z.string().min(1), name: z.string() })),
});

// 공급자 성별 값(소문자로 맞춘다. 문서 예시에 "Female"이 있다). 모르는 값은 null이다(추정하지 않는다)
function genderOf(value: string | null): Voice["gender"] {
	const lower = value?.toLowerCase();
	return lower === "male" || lower === "female" || lower === "neutral"
		? lower
		: null;
}
const present = (values: (string | null | undefined)[]) => [
	...new Set(values.filter((value): value is string => Boolean(value))),
];

// 언어별 샘플(verified_languages)과 기본 샘플을 같은 주소 없이 모은다. 같은 언어는 첫 샘플만 남긴다(모델·억양별로 여러 개 올 수 있다, 계획 리뷰 D21).
// 지금 언어 조건의 샘플이 맨 앞이고 행의 샘플이다(T4 스펙 3절). 그 언어 샘플이 없으면 행의 샘플은 기본 샘플(preview_url)이다.
function samplesOf(
	preview: string | null,
	verified: { language: string; preview_url: unknown }[] | null,
	preferred: string | null,
): { previewUrl: string | null; samples: VoiceSample[] } {
	const samples: VoiceSample[] = [];
	const seen = new Set<string>();
	const languages = new Set<string>();
	for (const entry of verified ?? []) {
		const url = sampleUrl.safeParse(entry.preview_url);
		if (!url.success || seen.has(url.data) || languages.has(entry.language)) continue;
		seen.add(url.data);
		languages.add(entry.language);
		samples.push({ language: entry.language, title: null, url: url.data });
	}
	if (preview !== null && !seen.has(preview))
		samples.push({ language: null, title: null, url: preview });
	const index =
		preferred === null
			? -1
			: samples.findIndex((sample) => sample.language === preferred);
	if (index > 0) samples.unshift(...samples.splice(index, 1));
	return {
		previewUrl:
			index >= 0 ? (samples[0]?.url ?? null) : (preview ?? samples[0]?.url ?? null),
		samples,
	};
}

function elVoice(raw: ElRaw, source: VoiceSource, preferred: string | null): Voice {
	return {
		...emptyVoice("elevenlabs", source),
		voiceId: raw.voice_id,
		name: raw.name,
		gender: genderOf(raw.gender),
		age: raw.age,
		accent: raw.accent,
		useCases: present([raw.use_case]),
		descriptives: present([raw.descriptive]),
		languages: present([
			raw.language,
			...(raw.verified_languages ?? []).map((entry) => entry.language),
		]),
		category: raw.category,
		origin: raw.origin ?? null,
		description: clip(raw.description),
		...samplesOf(raw.preview_url ?? null, raw.verified_languages ?? null, preferred),
		usage:
			raw.usage_character_count_1y == null
				? null
				: { kind: "chars_1y", count: raw.usage_character_count_1y },
		terms: {
			freeUsersAllowed: raw.free_users_allowed ?? null,
			noticePeriodDays: raw.notice_period ?? null,
			liveModeration: raw.live_moderation_enabled === true,
			creditRate: raw.rate ?? null,
			licensed: false,
			retiring: false,
		},
	};
}
```

`createElevenLabs` 안, `client` 아래에 두 함수를 더한다. `query`는 출처를 좁힌 뒤 분기 안에서 꺼낸다(밖에서 꺼내면 좁혀지지 않아 타입 검사가 실패한다, 계획 리뷰 E2 실행 확인):

```ts
	const getJson = (path: string, query: URLSearchParams, signal: AbortSignal) =>
		fetchJson(
			`${ELEVENLABS_HOST}${path}?${query}`,
			{ "xi-api-key": apiKey },
			signal,
			detailCodes,
		);

	async function listPage(
		input: ListInputOf<"elevenlabs">,
		signal: AbortSignal,
	): Promise<VoiceListPage> {
		if (input.source === "public") {
			const { query, page } = input;
			const body = libraryPageSchema.parse(
				await getJson(
					"/v1/shared-voices",
					queryOf({
						page_size: PAGE_SIZE,
						page,
						search: query.search,
						language: query.language,
						accent: query.accent,
						gender: query.gender,
						age: query.age,
						category: query.category,
						use_cases: query.useCases,
						descriptives: query.descriptives,
						featured: query.featured,
						sort: query.sort,
					}),
					signal,
				),
			);
			return {
				voices: parseVoiceItems("elevenlabs", body.voices, libraryVoiceSchema, (raw) =>
					elVoice(raw, "public", query.language),
				),
				next: body.has_more ? page + 1 : null,
				total: body.total_count ?? null,
				totalExact: body.total_count != null,
				windowLimited: false,
			};
		}
		const { query, cursor } = input;
		const body = accountPageSchema.parse(
			await getJson(
				"/v2/voices",
				queryOf({
					page_size: PAGE_SIZE,
					include_total_count: true,
					next_page_token: cursor,
					search: query.search,
					voice_type: query.voiceType,
					category: query.category,
					gender: query.gender,
					age: query.age,
					language: query.language,
					accent: query.accent,
					use_cases: query.useCases,
					sort: query.sort,
					sort_direction: query.direction,
				}),
				signal,
			),
		);
		return {
			voices: parseVoiceItems("elevenlabs", body.voices, accountVoiceSchema, (raw) =>
				elVoice(raw, "account", query.language),
			),
			next: body.has_more ? (body.next_page_token ?? null) : null,
			total: body.total_count ?? null,
			totalExact: body.total_count != null,
			windowLimited: false,
		};
	}
```

`detailCodes`의 매개변수가 `unknown`이 아니면 `fetchJson`의 `codesOf` 꼴(`(body: unknown) => string[]`)에 맞춘다. 반환 객체에 더한다:

```ts
		listVoices: (input: ListInputOf<"elevenlabs">) =>
			runList("elevenlabs", (signal) => listPage(input, signal)),
		listAccents: (language: string) =>
			runList("elevenlabs", async (signal): Promise<Accent[]> => {
				const { accents } = accentsSchema.parse(
					await getJson("/v1/voices/accents", queryOf({ language }), signal),
				);
				// 억양 값은 조건 값으로 그대로 다시 보낸다. 입력 검사를 통과하지 못하는 값(공백 등)은 고르는 순간 BAD_REQUEST라 선택지에서 뺀다(계획 리뷰 E7)
				const usable = accents.filter(
					({ accent }) => conditionValueSchema.safeParse(accent).success,
				);
				if (usable.length < accents.length) {
					console.error(
						`[voiceList] elevenlabs 억양 ${accents.length - usable.length}개 제외: accent`,
					);
				}
				return usable.map(({ accent, name }) => ({ value: accent, name }));
			}),
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter @tts-pilot-app/api test src/providers/elevenlabs.test.ts`. 기대: 연결 확인 + 새 테스트 모두 통과.
- [ ] **Step 5: 검사** — `pnpm exec biome check --write packages/api/src/providers/elevenlabs.ts packages/api/src/providers/elevenlabs.test.ts`(api 타입 검사는 Task 7 끝).

### Task 5: Fish Audio 목록(공개·내 계정)

**Files:**
- Modify: `packages/api/src/providers/fish-audio.ts`
- Test: `packages/api/src/providers/fish-audio.test.ts`(끝에 더함)

**Interfaces:**
- Consumes: Task 3의 `ListInputOf<"fish_audio">`, `VoiceSource`, `emptyVoice`, `clip`, `queryOf`, `parseVoiceItems`(null은 기록 없이 뺌), `runList(…, timeoutMs)`, `fetchJson`.
- Produces: `createFishAudio(apiKey): ProviderClient`에 `listVoices(input)`, `export const FISH_LIST_TIMEOUT_MS = 20_000`. 이 파일의 `getJson`은 `fetchJson`을 쓴다(연결 확인도 같이).

- [ ] **Step 1: 실패하는 테스트 쓰기** — `fish-audio.test.ts` 끝에 더한다.

```ts
const SAMPLE = "https://platform.r2.fish.audio/task/t1.mp3";
const model = (overrides: Record<string, unknown> = {}) => ({
	_id: "fish_1",
	type: "tts",
	title: "차분한 내레이터",
	description: "따뜻한 목소리",
	cover_image: "https://platform.r2.fish.audio/cover/fish_1.png",
	train_mode: "fast",
	state: "trained",
	tags: ["Korean", "female", "young", "narration", "calm"],
	samples: [{ title: "기본", text: "안녕하세요", task_id: "t1", audio: SAMPLE }],
	languages: ["ko"],
	visibility: "public",
	dmca_taken_down: false,
	licensed: true,
	pvc_release_state: null,
	task_count: 377_693,
	like_count: 1,
	mark_count: 1,
	shared_count: 1,
	author: { _id: "a1", nickname: "n", avatar: "" },
	created_at: "2026-09-01T00:00:00Z",
	updated_at: "2026-09-01T00:00:00Z",
	...overrides,
});
const modelPage = (items: unknown[], extra: Record<string, unknown> = {}) => ({
	items,
	total: 1000,
	has_more: true,
	max_offset: 1000,
	accessible_upper_bound: 1000,
	window_limited: true,
	total_is_exact: false,
	...extra,
});
const fishInput = (
	source: "public" | "account" = "public",
	page = 1,
	query: Partial<ListInputOf<"fish_audio">["query"]> = {},
): ListInputOf<"fish_audio"> => ({
	provider: "fish_audio",
	source,
	page,
	query: { search: "", language: "ko", tags: [], licensed: false, sort: "score", ...query },
});
const listFish = (input: ListInputOf<"fish_audio">) =>
	createFishAudio(KEY).listVoices?.(input);

describe("Fish Audio 목록", () => {
	it("공개 성우를 계약 모양으로 바꾼다. 태그·언어·샘플·사용 횟수·보증 성우", async () => {
		fetchMock.mockResolvedValue(json(200, modelPage([model()])));
		const page = await listFish(fishInput());
		expect(page).toMatchObject({
			next: 2,
			total: 1000,
			totalExact: false,
			windowLimited: true,
		});
		expect(page?.voices).toEqual([
			{
				provider: "fish_audio",
				source: "public",
				voiceId: "fish_1",
				name: "차분한 내레이터",
				englishName: null,
				gender: null,
				age: null,
				accent: null,
				useCases: [],
				descriptives: [],
				tags: ["Korean", "female", "young", "narration", "calm"],
				languages: ["ko"],
				category: null,
				origin: null,
				description: "따뜻한 목소리",
				models: [],
				previewUrl: SAMPLE,
				samples: [{ language: null, title: "기본", url: SAMPLE }],
				usage: { kind: "tasks", count: 377_693 },
				terms: {
					freeUsersAllowed: null,
					noticePeriodDays: null,
					liveModeration: false,
					creditRate: null,
					licensed: true,
					retiring: false,
				},
			},
		]);
	});

	it("조건을 쿼리로 보낸다: 태그는 반복 키, 보증 성우는 켤 때만, 키는 Bearer, 한 번만 부른다", async () => {
		fetchMock.mockResolvedValue(json(200, modelPage([])));
		await listFish(
			fishInput("public", 3, {
				search: "내레이터",
				tags: ["female", "narration"],
				licensed: true,
				sort: "task_count",
			}),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.origin + url.pathname).toBe("https://api.fish.audio/model");
		expect(url.searchParams.get("page_size")).toBe("100");
		expect(url.searchParams.get("page_number")).toBe("3");
		expect(url.searchParams.get("title")).toBe("내레이터");
		expect(url.searchParams.get("language")).toBe("ko");
		expect(url.searchParams.getAll("tag")).toEqual(["female", "narration"]);
		expect(url.searchParams.get("licensed")).toBe("true");
		expect(url.searchParams.get("sort_by")).toBe("task_count");
		expect(url.searchParams.has("self")).toBe(false);
		const init = fetchMock.mock.calls[0]?.[1];
		expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${KEY}`);
	});

	it("내 계정은 self=true이고 보증 성우 조건을 보내지 않으며 출처는 내가 만든 성우다", async () => {
		fetchMock.mockResolvedValue(
			json(200, modelPage([model({ visibility: "private" })], { total: 1, has_more: false, window_limited: false, total_is_exact: true })),
		);
		const page = await listFish(fishInput("account", 1, { licensed: true }));
		const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
		expect(url.searchParams.get("self")).toBe("true");
		expect(url.searchParams.has("licensed")).toBe(false);
		expect(page?.voices[0]).toMatchObject({ source: "account", origin: "own" });
		expect(page).toMatchObject({ next: null, totalExact: true, windowLimited: false });
	});

	it("합성할 수 없는 성우(svc, 학습 전, 삭제 요청)는 로그 없이 빼고, 공개 종료 중은 남겨 알린다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(
				200,
				modelPage([
					model({ _id: "svc", type: "svc" }),
					model({ _id: "training", state: "training" }),
					model({ _id: "dmca", dmca_taken_down: true }),
					model({ _id: "retiring", pvc_release_state: "retiring" }),
				]),
			),
		);
		const page = await listFish(fishInput());
		expect(page?.voices.map((v) => [v.voiceId, v.terms.retiring])).toEqual([
			["retiring", true],
		]);
		expect(log).not.toHaveBeenCalled();
	});

	it("10페이지면 has_more가 참이어도 다음이 없다(조건마다 1,000명)", async () => {
		fetchMock.mockResolvedValue(json(200, modelPage([model()])));
		expect((await listFish(fishInput("public", 10)))?.next).toBeNull();
	});

	it("공급자 호스트가 아닌 샘플은 버리고 첫 올바른 샘플이 행 샘플이다", async () => {
		fetchMock.mockResolvedValue(
			json(
				200,
				modelPage([
					model({
						samples: [
							{ title: "밖", audio: "https://evil.example/a.mp3" },
							{ title: "둘째", audio: SAMPLE },
						],
					}),
				]),
			),
		);
		const [voice] = (await listFish(fishInput()))?.voices ?? [];
		expect(voice?.samples).toEqual([{ language: null, title: "둘째", url: SAMPLE }]);
		expect(voice?.previewUrl).toBe(SAMPLE);
	});

	it("429는 rate_limit이고 Retry-After가 없으므로 retryAt이 없다", async () => {
		fetchMock.mockResolvedValue(json(429, { message: "Too many", status: 429 }));
		// listFish는 undefined일 수 있어 ?.catch로 받고 모양을 단언한다(계획 리뷰 E3 실행 확인)
		const error = (await listFish(fishInput())?.catch((e: unknown) => e)) as {
			code: string;
			data: object;
		};
		expect(error.code).toBe("TOO_MANY_REQUESTS");
		expect(error.data).toEqual({ provider: "fish_audio", reason: "rate_limit" });
	});

	it("목록은 20초까지 기다린다(실측 1.7~11.4초)", async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
		const pending = listFish(fishInput());
		const settled = vi.fn();
		pending?.then(settled, settled);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(settled).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		await expect(pending).rejects.toMatchObject({ data: { reason: "unknown_outcome" } });
		vi.useRealTimers();
	});

	it.each([
		[401, "BAD_GATEWAY", "provider_auth"],
		[503, "BAD_GATEWAY", "provider_error"],
	])("%s → %s·%s, 재시도하지 않는다", async (status, code, reason) => {
		fetchMock.mockResolvedValue(json(status, { message: "x", status }));
		await expect(listFish(fishInput())).rejects.toMatchObject({
			code,
			data: { provider: "fish_audio", reason },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("응답 모양이 어긋나면(items가 배열이 아님) 목록 전체가 provider_error다", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(json(200, { items: null, total: 0 }));
		await expect(listFish(fishInput())).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "fish_audio", reason: "provider_error" },
		});
	});

	it("type이나 state가 없는 항목은 모양이 어긋난 것이라 빼고 한 줄 남긴다(계획 리뷰 E11)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, modelPage([model({ _id: "odd", type: undefined }), model()])),
		);
		const page = await listFish(fishInput());
		expect(page?.voices.map((v) => v.voiceId)).toEqual(["fish_1"]);
		expect(log.mock.calls).toEqual([["[voiceList] fish_audio 성우 1명 제외: type"]]);
	});
});
```

  import에 `type ListInputOf`(`./contract`)를 더한다. 파일에 `afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); })`가 없으면 더한다.

- [ ] **Step 2: 실패 확인** — `pnpm --filter @tts-pilot-app/api test src/providers/fish-audio.test.ts`.

- [ ] **Step 3: 구현** — `fish-audio.ts`. import에 `type ListInputOf, type Voice, type VoiceSource`(`./contract`), `clip, emptyVoice, parseVoiceItems, queryOf`(`./list`), `fetchJson, runList`(`./errors`)를 더하고 `ProviderHttpError` import가 쓰이지 않으면 지운다. `createFishAudio`의 반환 타입은 `ProviderClient` 그대로다.
  - `createFishAudio` 안의 `getJson`을 공용 함수로 바꾼다(연결 확인도 이것을 쓴다. 동작은 같고 실패 본문은 읽어도 쓰지 않는다):

```ts
	const getJson = (path: string, signal: AbortSignal) =>
		fetchJson(`${FISH_AUDIO_HOST}${path}`, { Authorization: `Bearer ${apiKey}` }, signal);
```

  - `packageSchema` 아래에 더한다:

```ts
const PAGE_SIZE = 100;
// 공개 목록은 조건마다 1,000명(10페이지)까지다(2026-10-04 실측: max_offset 1000, window_limited true)
const LAST_PAGE = 10;
// 목록은 조건에 따라 1.7~11.4초 걸렸다(2026-10-04 실측). 연결 확인은 10초 그대로다
export const FISH_LIST_TIMEOUT_MS = 20_000;

// 샘플은 https이고 Fish Audio 호스트일 때만(실측 platform.r2.fish.audio)
const sampleUrl = z.url({
	protocol: /^https$/,
	hostname: /(^|\.)fish\.audio$/,
	normalize: true,
});
// 응답 모양. 어긋나면 목록 전체가 provider_error다
const modelPageSchema = z.object({
	items: z.array(z.unknown()),
	total: z.number().int().nonnegative(),
	has_more: z.boolean().nullish(),
	total_is_exact: z.boolean().nullish(),
	window_limited: z.boolean().nullish(),
});
// type·state가 없는 항목은 모양이 어긋난 것이라 빼고 기록한다(parseVoiceItems, 계획 리뷰 E11)
const modelSchema = z.object({
	_id: z.string().min(1),
	type: z.string(),
	state: z.string(),
	dmca_taken_down: z.boolean().nullish().catch(null),
	title: z.string().trim().min(1),
	description: z.string().nullish(),
	tags: z.array(z.string()).catch([]),
	languages: z.array(z.string()).nullish().catch(null),
	samples: z
		.array(z.looseObject({ title: z.string().nullish(), audio: z.unknown() }))
		.nullish()
		.catch(null),
	licensed: z.boolean().nullish().catch(null),
	pvc_release_state: z.string().nullish().catch(null),
	task_count: z.number().int().nonnegative().nullish().catch(null),
});

// 목록 필터에 유형·상태가 없어 합성할 수 없는 성우(svc, 학습 전, 삭제 요청)는 null을 돌려 기록 없이 뺀다(T4 스펙 3절)
function fishVoice(
	raw: z.infer<typeof modelSchema>,
	source: VoiceSource,
): Voice | null {
	if (raw.type !== "tts" || raw.state !== "trained" || raw.dmca_taken_down === true)
		return null;
	const samples = (raw.samples ?? []).flatMap((sample) => {
		const url = sampleUrl.safeParse(sample.audio);
		return url.success
			? [{ language: null, title: sample.title?.trim() || null, url: url.data }]
			: [];
	});
	return {
		...emptyVoice("fish_audio", source),
		voiceId: raw._id,
		name: raw.title,
		// 성별·연령은 필드가 없다. 태그(female, young …)는 화면이 공급자 분류로 보인다(추정하지 않는다)
		tags: [...new Set(raw.tags)],
		languages: raw.languages ?? [],
		origin: source === "account" ? "own" : null,
		description: clip(raw.description),
		previewUrl: samples[0]?.url ?? null,
		samples,
		usage:
			raw.task_count == null ? null : { kind: "tasks", count: raw.task_count },
		terms: {
			freeUsersAllowed: null,
			noticePeriodDays: null,
			liveModeration: false,
			creditRate: null,
			licensed: raw.licensed === true,
			retiring: raw.pvc_release_state === "retiring",
		},
	};
}
```

반환 객체에 더한다:

```ts
		listVoices: (input: ListInputOf<"fish_audio">) =>
			runList(
				"fish_audio",
				async (signal) => {
					const { source, page, query } = input;
					const body = modelPageSchema.parse(
						await getJson(
							`/model?${queryOf({
								page_size: PAGE_SIZE,
								page_number: page,
								self: source === "account",
								title: query.search,
								language: query.language,
								tag: query.tags,
								// 내 계정(self=true)에서는 문서상 무시되므로 보내지 않는다
								licensed: source === "public" && query.licensed,
								sort_by: query.sort,
							})}`,
							signal,
						),
					);
					const more = body.has_more ?? page * PAGE_SIZE < body.total;
					return {
						voices: parseVoiceItems("fish_audio", body.items, modelSchema, (raw) =>
							fishVoice(raw, source),
						),
						next: more && page < LAST_PAGE ? page + 1 : null,
						total: body.total,
						totalExact: body.total_is_exact !== false,
						windowLimited: body.window_limited === true,
					};
				},
				FISH_LIST_TIMEOUT_MS,
			),
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter @tts-pilot-app/api test src/providers/fish-audio.test.ts`. 기대: 연결 확인 + 새 테스트 모두 통과.
- [ ] **Step 5: 검사** — `pnpm exec biome check --write packages/api/src/providers/fish-audio.ts packages/api/src/providers/fish-audio.test.ts`(api 타입 검사는 Task 7 끝).

### Task 6: 목록 캐시 모듈

**Files:**
- Create: `packages/api/src/voice-cache.ts`
- Test: `packages/api/src/voice-cache.test.ts`
- Create: `packages/api/src/test-db.ts`(테스트 전용, DB 테스트 공통)

**Interfaces:**
- Consumes: Task 2의 `providerListCache`, `providerCooldown`(`@tts-pilot-app/db/schema/provider-cache`), `Database`(`@tts-pilot-app/db`), Task 3의 `providerError`, `ProviderErrorData`, `ProviderFailure`.
- Produces:
  - `CONTRACT_VERSION = 1`, `cacheKey(params: unknown): string`.
  - `type CacheScope = { ownerId: string | null; provider: ProviderId; kind: "public" | "account" | "accents" }`.
  - `type Cached<T> = { value: T; fetchedAt: string; stale: { reason: ProviderFailure; retryAt: string | null } | null }`.
  - `cachedList<T>(db: Database, scope: CacheScope, params: unknown, schema: z.ZodType<T>, fetch: () => Promise<T>): Promise<Cached<T>>`.
  - `expireProvider(db: Database, provider: ProviderId, ownerId: string): Promise<{ retryAt: string | null }>`.
  - `test-db.ts`: `testDatabaseUrl`, `testDb`(이름이 `_test`로 끝나지 않는 DB면 던진다). Task 7 격리 테스트도 쓴다.

- [ ] **Step 1: 실패하는 테스트 쓰기**

`packages/api/src/test-db.ts`(신규, 테스트 전용. `providers/test-utils.ts`처럼 테스트 파일만 import한다):

```ts
import { createDb } from "@tts-pilot-app/db";

// DB 테스트 공통(T4 목록 캐시, T6 이후 소유 데이터). TEST_DATABASE_URL이 없으면 연결하지 않는 자리표시자로 만들고 스위트를 건너뛴다(skipped는 통과가 아니다, bts-api).
// 스위트가 표를 통째로 비우므로 이름이 _test로 끝나는 DB만 받는다(계획 리뷰 E10). 테스트 파일은 차례로 돈다(vitest.config.ts fileParallelism false).
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl && !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
	throw new Error("TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 한다");
}
export const testDb = createDb({
	DATABASE_URL: testDatabaseUrl ?? "postgresql://skip@127.0.0.1:1/skip",
});
```

`packages/api/src/voice-cache.test.ts`:

```ts
import { createDb } from "@tts-pilot-app/db";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { ORPCError } from "@orpc/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { providerError } from "./providers/errors";
import { testDb as db, testDatabaseUrl as url } from "./test-db";
import { cachedList, cacheKey, expireProvider } from "./voice-cache";

const schema = z.object({ names: z.array(z.string()) });
const value = (...names: string[]) => ({ names });
const publicScope = { ownerId: null, provider: "elevenlabs", kind: "public" } as const;
const T0 = new Date("2026-10-05T00:00:00.000Z");
const at = (ms: number) => vi.setSystemTime(new Date(T0.getTime() + ms));
const HOUR = 60 * 60 * 1000;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("cacheKey", () => {
	it("배열 순서와 객체 키 순서가 달라도 같은 행이다", () => {
		expect(cacheKey({ b: 1, a: { tags: ["y", "x"] } })).toBe(
			cacheKey({ a: { tags: ["x", "y"] }, b: 1 }),
		);
		expect(cacheKey({ page: 1 })).not.toBe(cacheKey({ page: 2 }));
	});
});

describe("DB가 꺼져 있을 때", () => {
	it("DB에 붙지 못해도 공급자 결과를 돌려주고 로그는 이름·코드만 남긴다", async () => {
		const down = createDb({ DATABASE_URL: "postgresql://x@127.0.0.1:1/x" });
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const fetch = vi.fn(async () => value("a"));
		const result = await cachedList(down, publicScope, { q: 1 }, schema, fetch);
		expect(result).toMatchObject({ value: value("a"), stale: null });
		expect(fetch).toHaveBeenCalledTimes(1);
		const lines = log.mock.calls.map(([line]) => String(line));
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			expect(line).toMatch(/^\[voiceCache\] (읽기|대기 확인|쓰기) 실패: /);
			expect(line).not.toContain("postgresql://");
			expect(line).not.toContain("select");
		}
		await down.$client.end();
	});
});

describe.skipIf(!url)("목록 캐시(테스트 DB)", () => {
	beforeEach(async () => {
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T0);
	});
	afterAll(async () => {
		// 다음 파일(격리 테스트)은 실제 시각으로 돈다. 이 파일이 2026-10-05 기준으로 쓴 대기 행이 남으면 그 파일이 TOO_MANY_REQUESTS를 받는다(계획 리뷰 E1)
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("처음은 공급자 1회, 24시간 안에 다시 부르면 0회이고 받은 시각이 같다", async () => {
		const fetch = vi.fn(async () => value("a"));
		const first = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		at(23 * HOUR);
		const second = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(second).toEqual({ value: value("a"), fetchedAt: first.fetchedAt, stale: null });
		expect(first.fetchedAt).toBe(T0.toISOString());
	});

	it("24시간이 지나면 다시 부르고, 공개 행을 두 번 써도 한 행이다(NULLS NOT DISTINCT)", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(value("a")).mockResolvedValueOnce(value("b"));
		await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		at(25 * HOUR);
		const result = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		expect(result.value).toEqual(value("b"));
		expect(await db.select().from(providerListCache)).toHaveLength(1);
	});

	it("만료 뒤 공급자가 실패하면 지난 목록을 사유와 함께 돌려준다", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () => value("old"));
		at(30 * HOUR);
		const result = await cachedList(db, publicScope, { q: 1 }, schema, async () => {
			throw providerError("elevenlabs", "provider_error");
		});
		expect(result).toEqual({
			value: value("old"),
			fetchedAt: T0.toISOString(),
			stale: { reason: "provider_error", retryAt: null },
		});
	});

	it("지난 목록이 없으면 공급자 오류를 그대로 던지고, 사유 없는 예외도 그대로 던진다", async () => {
		await expect(
			cachedList(db, publicScope, { q: 1 }, schema, async () => {
				throw providerError("elevenlabs", "quota");
			}),
		).rejects.toMatchObject({ code: "BAD_GATEWAY", data: { reason: "quota" } });
		const bug = new RangeError("bug");
		await expect(
			cachedList(db, publicScope, { q: 2 }, schema, async () => {
				throw bug;
			}),
		).rejects.toBe(bug);
	});

	it("만료된 지 7일이 넘은 행은 다른 쓰기 때 지워진다", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () => value("old"));
		at(24 * HOUR + 8 * 24 * HOUR);
		await cachedList(db, publicScope, { q: 2 }, schema, async () => value("new"));
		const rows = await db.select().from(providerListCache);
		expect(rows.map((row) => row.paramsKey)).toEqual([cacheKey({ q: 2 })]);
	});

	it("만료된 지 7일이 넘은 행은 공급자가 실패해도 지난 목록으로 쓰지 않는다(계획 리뷰 E5)", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () => value("old"));
		at(24 * HOUR + 8 * 24 * HOUR);
		await expect(
			cachedList(db, publicScope, { q: 1 }, schema, async () => {
				throw providerError("elevenlabs", "provider_error");
			}),
		).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
	});

	it("계약 판이 다른 행과 검사에 실패한 행은 없는 것으로 본다", async () => {
		const now = new Date();
		const later = new Date(now.getTime() + 24 * HOUR);
		const base = {
			ownerId: null,
			provider: "elevenlabs",
			listKind: "public",
			fetchedAt: now,
			expiresAt: later,
		};
		await db.insert(providerListCache).values([
			{ ...base, paramsKey: cacheKey({ q: 1 }), contractVersion: 0, payload: value("v0") },
			{ ...base, paramsKey: cacheKey({ q: 2 }), contractVersion: 1, payload: { broken: true } },
		]);
		const fetch = vi.fn(async () => value("fresh"));
		expect((await cachedList(db, publicScope, { q: 1 }, schema, fetch)).value).toEqual(value("fresh"));
		expect((await cachedList(db, publicScope, { q: 2 }, schema, fetch)).value).toEqual(value("fresh"));
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("같은 키의 동시 두 요청은 공급자 호출 1회다", async () => {
		let release: (v: { names: string[] }) => void = () => {};
		const fetch = vi.fn(() => new Promise<{ names: string[] }>((resolve) => { release = resolve; }));
		const a = cachedList(db, publicScope, { q: 1 }, schema, fetch);
		const b = cachedList(db, publicScope, { q: 1 }, schema, fetch);
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		release(value("a"));
		expect((await a).value).toEqual(value("a"));
		expect((await b).value).toEqual(value("a"));
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("429의 retryAt은 대기 표에 남고, 그 전에는 공급자를 부르지 않는다(지난 목록이 있으면 그것을, 없으면 rate_limit)", async () => {
		await cachedList(db, publicScope, { q: 1 }, schema, async () => value("old"));
		at(25 * HOUR);
		const later = new Date(T0.getTime() + 25 * HOUR + 60_000).toISOString();
		const limited = await cachedList(db, publicScope, { q: 1 }, schema, async () => {
			throw providerError("elevenlabs", "rate_limit", later);
		});
		expect(limited.stale).toEqual({ reason: "rate_limit", retryAt: later });
		const fetch = vi.fn(async () => value("x"));
		const again = await cachedList(db, publicScope, { q: 1 }, schema, fetch);
		expect(fetch).not.toHaveBeenCalled();
		expect(again.stale).toEqual({ reason: "rate_limit", retryAt: later });
		const thrown = await cachedList(db, publicScope, { q: 9 }, schema, fetch).catch((e) => e);
		expect(thrown).toBeInstanceOf(ORPCError);
		expect(thrown).toMatchObject({ code: "TOO_MANY_REQUESTS", data: { reason: "rate_limit", retryAt: later } });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("새로 고침은 그 공급자의 공개 행과 이 소유자의 계정 행만 만료로 바꾼다", async () => {
		const fetch = vi.fn(async () => value("a"));
		const mine = { ownerId: "A", provider: "elevenlabs", kind: "account" } as const;
		const theirs = { ownerId: "B", provider: "elevenlabs", kind: "account" } as const;
		const other = { ownerId: null, provider: "fish_audio", kind: "public" } as const;
		for (const scope of [publicScope, mine, theirs, other]) {
			await cachedList(db, scope, { q: 1 }, schema, fetch);
		}
		expect(await expireProvider(db, "elevenlabs", "A")).toEqual({ retryAt: null });
		fetch.mockClear();
		for (const scope of [publicScope, mine, theirs, other]) {
			await cachedList(db, scope, { q: 1 }, schema, fetch);
		}
		// 공개(elevenlabs)와 A의 계정만 다시 불렀다
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("대기 시각 전의 새로 고침은 아무것도 바꾸지 않고 대기 시각을 돌려준다", async () => {
		const until = new Date(T0.getTime() + 60_000);
		await db.insert(providerCooldown).values({ provider: "elevenlabs", until });
		expect(await expireProvider(db, "elevenlabs", "A")).toEqual({ retryAt: until.toISOString() });
	});
});
```

- [ ] **Step 2: 실패 확인** — 테스트 DB 없이: `pnpm --filter @tts-pilot-app/api test src/voice-cache.test.ts` → `voice-cache.ts`가 없어 import 실패. 테스트 DB와 함께: `TEST_DATABASE_URL="postgresql://postgres:<compose 비밀번호>@localhost:5433/tts-pilot-app_test" pnpm --filter @tts-pilot-app/api test src/voice-cache.test.ts`(코디네이터가 실행하거나 `bts-implementer`에게 이 명령 꼴만 넘긴다. 비밀번호는 `packages/db/docker-compose.yml`의 개발용 값).

- [ ] **Step 3: 구현** — `packages/api/src/voice-cache.ts`:

```ts
import { createHash } from "node:crypto";

import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { z } from "zod";

import type {
	ProviderErrorData,
	ProviderFailure,
	ProviderId,
} from "./providers/contract";
import { providerError } from "./providers/errors";

// 공급자 목록 캐시(ADR 0003, T4 스펙 5절). 계약이 바뀌면 판을 올려 옛 행을 읽지 않는다.
export const CONTRACT_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;
// 만료 뒤 이만큼은 공급자가 실패할 때 지난 목록으로 쓰고, 그 뒤 쓰기 때 지운다
const KEEP_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheScope = {
	// 공개 목록은 null(소유자끼리 함께 쓴다), 계정 목록은 서버가 정한 소유자
	ownerId: string | null;
	provider: ProviderId;
	kind: "public" | "account" | "accents";
};
export type Cached<T> = {
	value: T;
	fetchedAt: string;
	stale: { reason: ProviderFailure; retryAt: string | null } | null;
};

const t = providerListCache;

// 키 순서를 맞춘 JSON. 조건의 배열은 집합이라(같은 축 OR, Fish Audio 태그 AND) 정렬한다.
function stable(value: unknown): unknown {
	if (Array.isArray(value)) {
		const items = value.map(stable);
		return items.every((item) => typeof item === "string")
			? [...items].sort()
			: items;
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, item]) => [key, stable(item)]),
		);
	}
	return value;
}
export function cacheKey(params: unknown): string {
	return createHash("sha256").update(JSON.stringify(stable(params))).digest("hex");
}

// DB가 꺼져 있거나 실패해도 목록은 보인다: 캐시 없이 공급자를 부른다(T4 계획 '스펙과 다른 점' 2).
// drizzle 오류의 message에는 SQL과 값이 들어 있어 이름과 코드(ECONNREFUSED 등)만 남긴다.
async function guard<T>(step: string, run: () => Promise<T>): Promise<T | undefined> {
	try {
		return await run();
	} catch (error) {
		const name = error instanceof Error ? error.name : typeof error;
		const { code, cause } = (error ?? {}) as { code?: unknown; cause?: { code?: unknown } };
		const tag = typeof cause?.code === "string" ? cause.code : typeof code === "string" ? code : "";
		console.error(`[voiceCache] ${step} 실패: ${name}${tag ? ` ${tag}` : ""}`);
		return undefined;
	}
}

// 같은 키의 동시 요청은 공급자 호출(과 쓰기) 하나로 합친다.
// ponytail: 서버 프로세스 안에서만 합친다. 배포 뒤 인스턴스끼리 겹친 호출이 보이면 pg advisory lock으로 넓힌다.
const inflight = new Map<string, Promise<unknown>>();
function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
	const running = inflight.get(key);
	if (running) return running as Promise<T>;
	const started = run().finally(() => inflight.delete(key));
	inflight.set(key, started);
	return started;
}

async function cooldownOf(db: Database, provider: ProviderId, now: Date) {
	const [row] = await db
		.select({ until: providerCooldown.until })
		.from(providerCooldown)
		.where(and(eq(providerCooldown.provider, provider), gt(providerCooldown.until, now)))
		.limit(1);
	return row?.until ?? null;
}

export async function cachedList<T>(
	db: Database,
	scope: CacheScope,
	params: unknown,
	schema: z.ZodType<T>,
	fetch: () => Promise<T>,
): Promise<Cached<T>> {
	const key = cacheKey(params);
	const now = new Date();
	const where = and(
		scope.ownerId === null ? isNull(t.ownerId) : eq(t.ownerId, scope.ownerId),
		eq(t.provider, scope.provider),
		eq(t.listKind, scope.kind),
		eq(t.paramsKey, key),
		eq(t.contractVersion, CONTRACT_VERSION),
	);
	const [row] =
		(await guard("읽기", () =>
			db
				.select({ payload: t.payload, fetchedAt: t.fetchedAt, expiresAt: t.expiresAt })
				.from(t)
				.where(where)
				.limit(1),
		)) ?? [];
	// 읽을 때도 계약으로 검사한다. 어긋난 행은 없는 것으로 보고 다시 받는다(덮어쓴다)
	const kept = row ? schema.safeParse(row.payload) : undefined;
	const hit =
		row && kept?.success
			? { value: kept.data, fetchedAt: row.fetchedAt.toISOString() }
			: null;
	if (hit && row && row.expiresAt > now) return { ...hit, stale: null };
	// 지난 목록은 만료 뒤 7일까지만 쓴다. 쓰기 때 지우는 범위와 같다. 공급자가 계속 실패해 쓰기가 없어도 오래된 목록을 내주지 않는다(계획 리뷰 E5)
	const fallback =
		hit && row && row.expiresAt.getTime() > now.getTime() - KEEP_STALE_MS
			? hit
			: null;

	// 429 대기 시각 전에는 공급자를 부르지 않는다(지난 목록이 있으면 그것을)
	const blocked = await guard("대기 확인", () => cooldownOf(db, scope.provider, now));
	if (blocked) {
		const retryAt = blocked.toISOString();
		if (fallback) return { ...fallback, stale: { reason: "rate_limit", retryAt } };
		throw providerError(scope.provider, "rate_limit", retryAt);
	}

	try {
		return await coalesce(`${scope.ownerId ?? ""}|${scope.provider}|${scope.kind}|${key}`, async () => {
			const value = await fetch();
			const fetchedAt = new Date();
			await guard("쓰기", async () => {
				const expiresAt = new Date(fetchedAt.getTime() + TTL_MS);
				await db
					.insert(t)
					.values({
						ownerId: scope.ownerId,
						provider: scope.provider,
						listKind: scope.kind,
						paramsKey: key,
						contractVersion: CONTRACT_VERSION,
						payload: value,
						fetchedAt,
						expiresAt,
					})
					.onConflictDoUpdate({
						target: [t.ownerId, t.provider, t.listKind, t.paramsKey, t.contractVersion],
						set: { payload: value, fetchedAt, expiresAt },
					});
				await db.delete(t).where(lt(t.expiresAt, new Date(fetchedAt.getTime() - KEEP_STALE_MS)));
			});
			return { value, fetchedAt: fetchedAt.toISOString(), stale: null };
		});
	} catch (error) {
		const data =
			error instanceof ORPCError
				? (error.data as Partial<ProviderErrorData> | undefined)
				: undefined;
		// 사유가 없는 예외(버그)는 그대로 던진다(오류 경계)
		if (!data?.reason) throw error;
		if (data.reason === "rate_limit" && data.retryAt) {
			const until = new Date(data.retryAt);
			await guard("대기 쓰기", () =>
				db
					.insert(providerCooldown)
					.values({ provider: scope.provider, until })
					.onConflictDoUpdate({ target: providerCooldown.provider, set: { until } }),
			);
		}
		if (fallback) return { ...fallback, stale: { reason: data.reason, retryAt: data.retryAt ?? null } };
		throw error;
	}
}

// '목록 새로 고침': 그 공급자의 공개 행과 이 소유자의 계정 행을 만료로 바꾼다. 행을 지우지 않아 다시 받기가 실패해도 지난 목록을 보인다.
// 대기 시각 전이면 아무것도 바꾸지 않고 그 시각을 돌려준다.
export async function expireProvider(
	db: Database,
	provider: ProviderId,
	ownerId: string,
): Promise<{ retryAt: string | null }> {
	const now = new Date();
	const blocked = await guard("대기 확인", () => cooldownOf(db, provider, now));
	if (blocked) return { retryAt: blocked.toISOString() };
	await guard("만료 표시", () =>
		db
			.update(t)
			.set({ expiresAt: now })
			.where(
				and(
					eq(t.provider, provider),
					or(isNull(t.ownerId), eq(t.ownerId, ownerId)),
					gt(t.expiresAt, now),
				),
			),
	);
	return { retryAt: null };
}
```

  `DB가 꺼져 있을 때` 테스트의 로그 정규식에는 위 단계 이름(읽기·대기 확인·쓰기)만 나온다. `대기 쓰기`·`만료 표시`는 그 테스트에서 일어나지 않는다.

- [ ] **Step 4: 통과 확인** — 테스트 DB 없이 `pnpm --filter @tts-pilot-app/api test src/voice-cache.test.ts` → `cacheKey`·`DB가 꺼져 있을 때` 통과, DB 스위트 skipped. 테스트 DB와 함께 같은 명령 → 모두 통과(skipped 0). 두 출력을 증거로 남긴다.
- [ ] **Step 5: 검사** — `pnpm exec biome check --write packages/api/src/voice-cache.ts packages/api/src/voice-cache.test.ts packages/api/src/test-db.ts`(api 타입 검사는 Task 7 끝). 이어서 코디네이터가 Task 2·6 파일로 `bts-reviewer(db)`(10행)를 받는다.

### Task 7: 프로시저 세 개와 2계정 격리 테스트

**Files:**
- Modify: `packages/api/src/routers/index.ts`
- Modify: `packages/api/src/routers/voice-list.test.ts`
- Create: `packages/api/src/routers/voice-list.isolation.test.ts`

**Interfaces:**
- Consumes: Task 3 `voiceListInputSchema`, `voiceListResultSchema`, `voiceListPageSchema`, `accentListSchema`, `accentSchema`, `conditionValueSchema`, `providerIdSchema`, `type VoiceListInput`, `providerError`; Task 6 `cachedList`, `expireProvider`, `testDb`·`testDatabaseUrl`.
- Produces(화면이 쓴다):
  - `voiceList(input: VoiceListInput): VoiceListResult`
  - `voiceAccents({ language }): AccentList`
  - `voiceListRefresh({ provider }): { retryAt: string | null }`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`voice-list.test.ts`를 고친다. 기존 세 테스트는 남기고 아래를 더한다. `db: {} as Context["db"]` 자리를 닿으면 세는 가짜로 바꾼다:

```ts
// DB에 닿으면 세고 실패한다. 캐시는 DB가 실패하면 공급자를 바로 부른다(T4 계획 '스펙과 다른 점' 2)
let dbTouches = 0;
const failingDb = new Proxy(
	{},
	{
		get() {
			dbTouches += 1;
			throw new Error("db");
		},
	},
) as Context["db"];
const as = (ownerId: string | null, providers: Context["providers"]) =>
	createRouterClient(appRouter, {
		context: { db: failingDb, ownerId, providers },
	});
beforeEach(() => {
	dbTouches = 0;
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
```

파일 위 상수(`KEY`는 공급자 공통으로 써도 된다):

```ts
const elInput: VoiceListInput = {
	provider: "elevenlabs",
	source: "public",
	page: 0,
	query: {
		search: "",
		language: "ko",
		accent: null,
		gender: null,
		age: null,
		category: null,
		useCases: [],
		descriptives: [],
		featured: false,
		sort: "trending",
	},
};
const elAccountInput: VoiceListInput = {
	provider: "elevenlabs",
	source: "account",
	cursor: null,
	query: {
		search: "",
		voiceType: null,
		category: null,
		gender: null,
		age: null,
		language: null,
		accent: null,
		useCases: [],
		sort: "created_at_unix",
		direction: "desc",
	},
};
const fishInput: VoiceListInput = {
	provider: "fish_audio",
	source: "public",
	page: 1,
	query: { search: "", language: "ko", tags: [], licensed: false, sort: "score" },
};
```

```ts
	it("소유자가 없으면 세 프로시저 모두 UNAUTHORIZED이고 공급자·DB를 건드리지 않는다", async () => {
		const providers = createProviders({ elevenlabs: KEY, fish_audio: KEY });
		const client = as(null, providers);
		await expect(client.voiceList(elInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(client.voiceAccents({ language: "ko" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(client.voiceListRefresh({ provider: "elevenlabs" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});

	it.each(["elevenlabs", "fish_audio"] as const)("%s 키가 없으면 no_key이고 공급자·DB를 건드리지 않는다", async (provider) => {
		const input = provider === "elevenlabs" ? elInput : fishInput;
		await expect(as("local-admin", createProviders({})).voiceList(input)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { provider, reason: "no_key" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(dbTouches).toBe(0);
	});

	it.each([
		["조건 값에 공백·기호", { ...elInput, query: { ...elInput.query, accent: "seoul; drop" } }],
		["태그 11개", { ...fishInput, query: { ...fishInput.query, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) } }],
		["Fish Audio 11페이지", { ...fishInput, page: 11 }],
		["검색어 101자", { ...elInput, query: { ...elInput.query, search: "가".repeat(101) } }],
		["모르는 정렬", { ...elInput, query: { ...elInput.query, sort: "random" } }],
	])("%s는 BAD_REQUEST이고 공급자를 부르지 않는다", async (_name, input) => {
		await expect(
			as("local-admin", createProviders({ elevenlabs: KEY, fish_audio: KEY })).voiceList(input as VoiceListInput),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("DB가 실패해도 ElevenLabs·Fish Audio 공개 결과가 출력 스키마를 통과하고 키 문자열이 없다", async () => {
		fetchMock
			.mockResolvedValueOnce(json(200, { voices: [], has_more: false, total_count: 0 }))
			.mockResolvedValueOnce(json(200, { items: [], total: 0, has_more: false }));
		const client = as("local-admin", createProviders({ elevenlabs: KEY, fish_audio: KEY }));
		for (const input of [elInput, fishInput]) {
			const result = await client.voiceList(input);
			expect(voiceListResultSchema.parse(result)).toEqual(result);
			expect(result).toMatchObject({ provider: input.provider, source: "public", stale: null });
			expect(JSON.stringify(result)).not.toContain(KEY);
		}
	});

	it("ElevenLabs 내 계정·억양 결과도 출력 스키마를 통과한다(계획 리뷰 E8)", async () => {
		fetchMock
			.mockResolvedValueOnce(json(200, { voices: [], has_more: false, total_count: 0, next_page_token: null }))
			.mockResolvedValueOnce(json(200, { accents: [{ accent: "seoul", language: "ko", code: "ko-seoul", name: "Seoul" }] }));
		const client = as("local-admin", createProviders({ elevenlabs: KEY }));
		const account = await client.voiceList(elAccountInput);
		expect(voiceListResultSchema.parse(account)).toEqual(account);
		expect(account).toMatchObject({ provider: "elevenlabs", source: "account", stale: null });
		const accents = await client.voiceAccents({ language: "ko" });
		expect(accentListSchema.parse(accents)).toEqual(accents);
		expect(accents).toMatchObject({ language: "ko", accents: [{ value: "seoul", name: "Seoul" }], stale: null });
	});
```

  기존 "정상 응답은 출력 스키마를 통과" 테스트(Typecast)는 `failingDb`로도 통과한다(캐시를 건너뛴다). import에 `beforeEach, afterEach, vi`, `type VoiceListInput`, `accentListSchema`, `voiceListResultSchema`를 더한다.

`voice-list.isolation.test.ts`(신규, `bts-api` `ownership-test.md` 방식. 로그인 전이라 세션 대신 `ownerId`를 context에 넣는다):

```ts
import { createRouterClient } from "@orpc/server";
import {
	providerCooldown,
	providerListCache,
} from "@tts-pilot-app/db/schema/provider-cache";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { VoiceListInput, VoiceListPage } from "../providers/contract";
import { providerError } from "../providers/errors";
import type { Providers } from "../providers/index";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `iso-a-${Date.now()}`;
const B = `iso-b-${Date.now()}`;
const page: VoiceListPage = { voices: [], next: null, total: 0, totalExact: true, windowLimited: false };
const listVoices = vi.fn(async () => page);
const providers: Providers = {
	elevenlabs: { checkStatus: vi.fn(), listVoices },
};
const as = (ownerId: string) =>
	createRouterClient(appRouter, { context: { db, ownerId, providers } as Context });
const account: VoiceListInput = {
	provider: "elevenlabs",
	source: "account",
	cursor: null,
	query: {
		search: "",
		voiceType: null,
		category: null,
		gender: null,
		age: null,
		language: null,
		accent: null,
		useCases: [],
		sort: "created_at_unix",
		direction: "desc",
	},
};
const publicList: VoiceListInput = {
	provider: "elevenlabs",
	source: "public",
	page: 0,
	query: {
		search: "",
		language: "ko",
		accent: null,
		gender: null,
		age: null,
		category: null,
		useCases: [],
		descriptives: [],
		featured: false,
		sort: "trending",
	},
};

describe.skipIf(!url)("목록 캐시 소유자 격리", () => {
	beforeEach(async () => {
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		listVoices.mockClear();
	});
	afterAll(async () => {
		await db.delete(providerListCache);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("A가 받은 계정 목록은 B가 같은 조건으로 불러도 읽히지 않고 B는 공급자를 새로 부른다", async () => {
		await as(A).voiceList(account);
		await as(B).voiceList(account);
		expect(listVoices).toHaveBeenCalledTimes(2);
		const owners = (await db.select().from(providerListCache)).map((row) => row.ownerId).sort();
		expect(owners).toEqual([A, B].sort());
	});

	it("A의 계정 행이 만료되고 공급자가 실패하면 B는 A의 지난 목록이 아니라 오류를 받는다(계획 리뷰 E9)", async () => {
		await as(A).voiceList(account);
		await db.update(providerListCache).set({ expiresAt: new Date(Date.now() - 60_000) });
		listVoices.mockRejectedValueOnce(providerError("elevenlabs", "provider_error"));
		await expect(as(B).voiceList(account)).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
	});

	it("B의 새로 고침은 A의 계정 행을 만료로 바꾸지 않는다", async () => {
		await as(A).voiceList(account);
		await as(B).voiceListRefresh({ provider: "elevenlabs" });
		await as(A).voiceList(account);
		expect(listVoices).toHaveBeenCalledTimes(1);
	});

	it("공개 목록 행은 A와 B가 함께 쓴다", async () => {
		await as(A).voiceList(publicList);
		await as(B).voiceList(publicList);
		expect(listVoices).toHaveBeenCalledTimes(1);
		const [row] = await db.select().from(providerListCache);
		expect(row?.ownerId).toBeNull();
	});
});
```

"A는 자기 계정 목록을 캐시에서 다시 받는다"는 `voice-cache.test` 첫 테스트와 같은 동작이라 두지 않는다(ponytail). 첫 테스트와 셋째 테스트가 A의 행이 A에게 다시 읽히는 것을 함께 보인다.

- [ ] **Step 2: 실패 확인** — `pnpm --filter @tts-pilot-app/api test src/routers`(테스트 DB 없이: 격리 스위트 skipped, 새 단위 테스트 실패). 테스트 DB와 함께 다시 실행해 격리 테스트도 실패하는지 본다(입력이 아직 Typecast뿐이라 BAD_REQUEST).

- [ ] **Step 3: 구현** — `routers/index.ts`:

```ts
import type { RouterClient } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import {
	accentListSchema,
	accentSchema,
	conditionValueSchema,
	providerIdSchema,
	providerStatusResultSchema,
	voiceListInputSchema,
	voiceListPageSchema,
	voiceListResultSchema,
} from "../providers/contract";
import { providerError } from "../providers/errors";
import { cachedList, expireProvider } from "../voice-cache";

export const appRouter = {
	// (healthCheck, providerStatus는 그대로)
	// 성우 목록 한 페이지(T4 스펙 3·5절). 목록 캐시를 거친다. 공급자 문제는 사유를 붙여 던지고, 지난 목록이 있으면 stale로 돌려준다.
	voiceList: protectedProcedure
		.input(voiceListInputSchema)
		.output(voiceListResultSchema)
		.handler(async ({ input, context }) => {
			// 입력의 공급자로 그 공급자의 클라이언트를 고른다(공급자 구현은 자기 입력 모양만 받는다)
			const listVoices = context.providers?.[input.provider]?.listVoices;
			// 키가 없으면 공급자와 DB를 부르지 않는다.
			if (!listVoices) throw providerError(input.provider, "no_key");
			const source = input.provider === "typecast" ? "public" : input.source;
			const { value, fetchedAt, stale } = await cachedList(
				context.db,
				{
					// 계정 목록만 소유자로 나눈다. 소유자는 서버가 정한 값뿐이다(입력에 없다)
					ownerId: source === "account" ? context.ownerId : null,
					provider: input.provider,
					kind: source,
				},
				input,
				voiceListPageSchema,
				() => listVoices(input),
			);
			return { provider: input.provider, source, ...value, fetchedAt, stale };
		}),
	// ElevenLabs 억양 목록(억양 조건의 선택지). 공개 캐시를 쓴다.
	voiceAccents: protectedProcedure
		.input(z.object({ language: conditionValueSchema }))
		.output(accentListSchema)
		.handler(async ({ input, context }) => {
			const listAccents = context.providers?.elevenlabs?.listAccents;
			if (!listAccents) throw providerError("elevenlabs", "no_key");
			const { value, fetchedAt, stale } = await cachedList(
				context.db,
				{ ownerId: null, provider: "elevenlabs", kind: "accents" },
				input,
				z.array(accentSchema),
				() => listAccents(input.language),
			);
			return { language: input.language, accents: value, fetchedAt, stale };
		}),
	// '목록 새로 고침'(T4 스펙 5절). 공급자를 부르지 않는다. 화면이 이어서 지금 목록을 다시 받는다.
	voiceListRefresh: protectedProcedure
		.input(z.object({ provider: providerIdSchema }))
		.output(z.object({ retryAt: z.iso.datetime().nullable() }))
		.handler(({ input, context }) =>
			expireProvider(context.db, input.provider, context.ownerId),
		),
};
```

  `protectedProcedure`가 `context.ownerId`를 `string`으로 좁힌다(계획 리뷰가 실행해 확인). 공급자 구현은 화살표 함수 속성이라 메서드를 떼어 불러도 `this`를 잃지 않는다.

- [ ] **Step 4: 통과 확인** — `pnpm --filter @tts-pilot-app/api test`(DB 없이) → 격리·캐시 DB 스위트 skipped, 나머지 통과. `TEST_DATABASE_URL=… pnpm --filter @tts-pilot-app/api test` → 모두 통과, skipped 0. 두 출력을 13·14행 증거로 남긴다.
- [ ] **Step 5: 검사(14행)** — `pnpm check-types`(api 포함 처음 0이어야 한다), `pnpm exec biome check .`, `TEST_DATABASE_URL=… pnpm test`. 그다음 코디네이터가 Task 3~7 diff로 `bts-reviewer(code)`(15행, + `ponytail-review`)와 `bts-reviewer(security)`(추가 행)를 받는다.

### Task 8: UI 프리미티브 Tabs·ToggleGroup·Sheet (코디네이터)

**Files:**
- Create(shadcn 생성물): `packages/ui/src/components/tabs.tsx`, `toggle-group.tsx`, `sheet.tsx`(`toggle.tsx`가 함께 생기면 그대로 둔다)
- Modify: 생성물의 굵기·반경·글자·높이·문구(아래)

**Interfaces:**
- Produces: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`(`keepMounted` 전달); `ToggleGroup`, `ToggleGroupItem`; `Sheet`, `SheetContent`(`initialFocus`·`finalFocus` 전달), `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetClose`(Base UI 1.8.0 `base-lyra`).

- [ ] **Step 1: 추가** — `pnpm --filter @tts-pilot-app/ui exec shadcn add tabs toggle-group sheet`. 새 의존성이 생기면 목록을 적는다(Base UI는 이미 있다).
- [ ] **Step 2: 생성물을 이 프로젝트 기준에 맞춘다** — 이 프로젝트의 shadcn 스타일은 `base-lyra`(각지고 조밀한 판, 예: `input.tsx`의 `h-8 rounded-none text-xs`)다. T2·T3에서 Button·Badge를 고친 방식대로 세 파일을 읽고 다음을 맞춘다(계획 리뷰 D6. 맞추지 않으면 comp-led 게이트에서야 드러난다).
  - 굵기: `font-medium`·`font-semibold`를 지운다. 고른 상태(`data-[active]`·`data-[pressed]`)만 `font-bold`, 나머지는 `font-normal`이다(DESIGN 400·700).
  - 반경: `rounded-none`을 바꾼다. `ToggleGroup` 바탕과 항목은 `rounded-lg`·`rounded-md`, Sheet 닫기 버튼은 `rounded-md`. 밑줄 탭 항목은 반경이 없다.
  - 글자: `text-xs`를 바꾼다. 탭 항목 `text-base`, 세그먼트 항목·Sheet 설명 `text-sm`.
  - 높이: `TabsTrigger`·`ToggleGroupItem` `min-h-11`, Sheet 닫기 버튼 `size-11`(44px).
  - 문구: Sheet 닫기 버튼의 숨은 글자가 영어("Close")면 "닫기"로 바꾼다.
  - 전달: `TabsContent`가 `keepMounted`를, `SheetContent`가 `initialFocus`·`finalFocus`를 Base UI에 넘기는지(`...props`) 본다. 넘기지 않으면 넘기게 고친다.
  - 모션: Sheet 미끄러짐은 200ms이고 이징은 DESIGN 기본(`globals.css` `--default-transition-timing-function: cubic-bezier(0.3, 0, 0, 1)`)이다. 생성물에 다른 `duration-*`·`ease-*`가 있으면 `duration-200`과 기본 이징(클래스 없음)으로 맞춘다. `prefers-reduced-motion`은 `globals.css`의 전역 규칙이 이미 끈다(따로 더하지 않는다).
  - 오버레이: `bg-black/…` 같은 생성물 기본값을 그대로 둔다(브리프 9절 "배경 흐림").
  - 밑줄 탭: `TabsList`에 `variant="line"`이 있으면 그것을 쓴다. 없으면 쓰는 쪽(Task 12a)에서 클래스를 준다.
- [ ] **Step 3: 검사** — `pnpm --filter @tts-pilot-app/ui check-types`, `pnpm exec biome check --write packages/ui/src/components`. 바꾼 줄을 증거에 적는다(18행).

### Task 9: 조건 정의와 보기 문구(web 순수 함수)

**Files:**
- Create: `apps/web/src/lib/provider-conditions.ts`, `provider-conditions.test.ts`
- Create: `apps/web/src/lib/voice-view.ts`, `voice-view.test.ts`
- Modify: `apps/web/src/lib/connection-view.ts`(`PROVIDER_LABEL`을 옮겨 옴), `apps/web/src/components/provider-status-card.tsx`·`connection-status.tsx`(import 경로만)
- Modify: `apps/web/src/lib/voice-filter.ts`(`GENDER_LABEL`에 neutral)
- Modify: `apps/web/src/lib/voice-failure.ts`, `voice-failure.test.ts`(`retryAtOf`)

**Interfaces:**
- Consumes(타입만): `Voice`, `VoiceSample`, `VoiceSource`, `ListInputOf`, `VoiceListInput`, `ProviderId`, `ProviderErrorData`; `SampleStatus`(`lib/sample-state.ts`).
- Produces:
  - `connection-view.ts`: `PROVIDER_LABEL: Record<ProviderId, string>`(옮김. `provider-status-card.tsx`는 이것을 import해 쓰고 다시 export하지 않는다).
  - `provider-conditions.ts`: `type ServerList`, `type ServerProvider`, `type ElPublicQuery`·`ElAccountQuery`·`FishQuery`, `initialList(provider, source)`, `firstPage(list)`, `inputOf(list, page)`, `type Option`, `type ChoiceAxis`, `type ToggleAxis`, `type Axis`, `axesOf(list, accents: Option[])`, `type SortView`, `sortOf(list)`, `conditionCount(list)`, `isInitial(list)`, `withSearch(list, search)`, `languageName(code)`, 값 표들(`EL_AGE`, `ACCENT_KO`, `EL_USE_CASE`, `EL_DESCRIPTIVE`, `EL_PUBLIC_CATEGORY`, `EL_ACCOUNT_CATEGORY`, `EL_ORIGIN`, `FISH_GENDER`, `FISH_AGE`, `FISH_CONTENT`, `FISH_MOOD`).
  - `voice-view.ts`: `voiceKey`, `flattenPages`, `pickSelected`, `metaLine`, `pillsOf`, `chipsOf`, `secondaryText`, `badgesOf`, `termLines`, `sampleLabel`, `sampleAriaLabel(status, subject)`, `compactCount`, `receivedText`, `agoText`, `retryTime`, `countText`, `listEnd`, `BUNDLE_SIZE`, `bundleOf(voices, count)`.
  - `voice-failure.ts`: `retryAtOf(error): string | null`.
  - `sample-state.ts`는 바꾸지 않는다(재생 키로 샘플 주소를 넘긴다, '계획에서 정한 것').

- [ ] **Step 1: 실패하는 테스트 쓰기**

`provider-conditions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	type Axis,
	axesOf,
	type ChoiceAxis,
	conditionCount,
	initialList,
	inputOf,
	isInitial,
	type ServerList,
	sortOf,
	withSearch,
} from "./provider-conditions";

const elPublic = initialList("elevenlabs", "public");
// 하나·여럿 고르기 축만 apply가 값 배열을 받는다
const choice = (axes: Axis[], index: number) => axes[index] as ChoiceAxis;

describe("시작 조건", () => {
	it("공개 목록은 한국어로 시작하고, 내 계정은 언어 조건이 없다", () => {
		expect(elPublic.query).toMatchObject({ language: "ko", sort: "trending" });
		expect(initialList("fish_audio", "public").query).toMatchObject({ language: "ko", sort: "score" });
		expect(initialList("elevenlabs", "account").query).toMatchObject({
			language: null,
			sort: "created_at_unix",
			direction: "desc",
		});
		expect(initialList("fish_audio", "account").query.language).toBeNull();
	});
});

describe("inputOf", () => {
	it("같은 조건은 같은 입력을 만든다(배열은 정렬, 검색어 앞뒤 공백 제거)", () => {
		const a = { ...elPublic, query: { ...elPublic.query, search: " 지영 ", useCases: ["b", "a"] } } as ServerList;
		const b = { ...elPublic, query: { ...elPublic.query, search: "지영", useCases: ["a", "b"] } } as ServerList;
		expect(inputOf(a, 0)).toEqual(inputOf(b, 0));
		expect(inputOf(a, 0)).toMatchObject({ provider: "elevenlabs", source: "public", page: 0 });
	});

	it("페이지 매개변수: ElevenLabs 공개는 번호, 내 계정은 커서, Fish Audio는 1부터", () => {
		expect(inputOf(initialList("elevenlabs", "account"), "tok_2")).toMatchObject({ cursor: "tok_2" });
		expect(inputOf(initialList("elevenlabs", "account"), null)).toMatchObject({ cursor: null });
		expect(inputOf(initialList("fish_audio", "public"), 3)).toMatchObject({ page: 3 });
	});
});

describe("axesOf", () => {
	it("ElevenLabs 공개 조건 줄: 언어·억양·성별·연령·콘텐츠·분위기·성우 종류·추천 성우만", () => {
		const axes = axesOf(elPublic, [{ value: "seoul", label: "서울 억양" }]);
		expect(axes.map((axis) => [axis.label, axis.kind])).toEqual([
			["언어", "single"],
			["억양", "single"],
			["성별", "single"],
			["연령", "single"],
			["콘텐츠", "multi"],
			["분위기", "multi"],
			["성우 종류", "single"],
			["추천 성우만", "toggle"],
		]);
	});

	it("언어를 바꾸면 억양 조건이 풀리고, 모든 언어(null)에서는 억양을 고를 수 없다", () => {
		const withAccent = { ...elPublic, query: { ...elPublic.query, accent: "seoul" } } as ServerList;
		const language = choice(axesOf(withAccent, []), 0);
		expect(language.apply(["en"]).query).toMatchObject({ language: "en", accent: null });
		const all = language.apply([]);
		expect(all.query).toMatchObject({ language: null });
		expect(axesOf(all, [])[1]?.disabled).toBe(true);
	});

	it("토글은 켜고 끄는 불린이다", () => {
		const featured = axesOf(elPublic, []).find((axis) => axis.kind === "toggle");
		expect(featured?.kind === "toggle" && featured.on).toBe(false);
		const on = featured?.kind === "toggle" ? featured.apply(true) : elPublic;
		expect(on.query).toMatchObject({ featured: true });
	});

	it("Fish Audio 태그 드롭다운 넷은 query.tags 하나에 쓰고 자기 묶음만 바꾼다. 머리 글자는 '모두 포함'이다", () => {
		const fish = initialList("fish_audio", "public");
		const axes = axesOf(fish, []);
		expect(axes.map((axis) => axis.label)).toEqual(["언어", "성별", "연령", "콘텐츠", "분위기", "보증 성우만"]);
		expect(choice(axes, 1).note).toBe("모두 포함");
		const step1 = choice(axes, 1).apply(["female"]);
		const step2 = choice(axesOf(step1, []), 3).apply(["narration", "storytelling"]);
		expect(step2.query).toMatchObject({ tags: ["female", "narration", "storytelling"] });
		expect(choice(axesOf(step2, []), 1).selected).toEqual(["female"]);
		expect(choice(axes, 3).options.length).toBeGreaterThan(0);
	});

	it("Fish Audio 내 계정에는 '보증 성우만'이 없다", () => {
		expect(axesOf(initialList("fish_audio", "account"), []).map((a) => a.label)).not.toContain("보증 성우만");
	});
});

describe("sortOf", () => {
	it("ElevenLabs 내 계정은 정렬과 방향을 선택 하나(네 항목)로 묶는다", () => {
		const sort = sortOf(initialList("elevenlabs", "account"));
		expect(sort.options.map((option) => option.label)).toEqual([
			"최근 만든 순",
			"오래된 순",
			"이름순",
			"이름 역순",
		]);
		expect(sort.apply("name:asc").query).toMatchObject({ sort: "name", direction: "asc" });
	});
});

describe("조건 수와 시작값", () => {
	it("시작값과 다른 조건만 센다(검색어·정렬 제외)", () => {
		expect(conditionCount(elPublic)).toBe(0);
		expect(isInitial(elPublic)).toBe(true);
		const changed = {
			...elPublic,
			query: { ...elPublic.query, language: "en", useCases: ["a", "b"], featured: true, sort: "created_date" },
		} as ServerList;
		// 언어 1 + 콘텐츠 2 + 추천 1
		expect(conditionCount(changed)).toBe(4);
		expect(isInitial(withSearch(elPublic, "지영"))).toBe(false);
	});
});
```

`voice-view.test.ts`:

```ts
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { describe, expect, it } from "vitest";

import {
	agoText,
	badgesOf,
	bundleOf,
	chipsOf,
	compactCount,
	countText,
	flattenPages,
	listEnd,
	metaLine,
	pickSelected,
	pillsOf,
	receivedText,
	sampleAriaLabel,
	sampleLabel,
	secondaryText,
	termLines,
	voiceKey,
} from "./voice-view";

const base: Voice = {
	provider: "elevenlabs",
	source: "public",
	voiceId: "v1",
	name: "Jiyoung",
	englishName: null,
	gender: "female",
	age: "young",
	accent: "seoul",
	useCases: ["narrative_story", "conversational", "advertisement"],
	descriptives: ["calm"],
	tags: [],
	languages: ["ko"],
	category: "professional",
	origin: null,
	description: null,
	models: [],
	previewUrl: "https://storage.googleapis.com/x.mp3",
	samples: [],
	usage: { kind: "chars_1y", count: 2_100_000 },
	terms: {
		freeUsersAllowed: false,
		noticePeriodDays: 730,
		liveModeration: true,
		creditRate: 1.5,
		licensed: false,
		retiring: false,
	},
};
const voice = (overrides: Partial<Voice>): Voice => ({ ...base, ...overrides });
const fish = voice({
	provider: "fish_audio",
	gender: null,
	age: null,
	accent: null,
	useCases: [],
	descriptives: [],
	category: null,
	tags: ["Korean", "female", "middle-aged", "narration", "calm", "weird"],
});

describe("키와 이어 붙이기", () => {
	it("성우 키는 공급자·출처·id다. 다음 페이지의 중복 성우는 뺀다", () => {
		expect(voiceKey(base)).toBe("elevenlabs:public:v1");
		const merged = flattenPages([
			{ voices: [voice({ voiceId: "a" }), voice({ voiceId: "b" })] },
			{ voices: [voice({ voiceId: "b", name: "다시 온 b" }), voice({ voiceId: "c" })] },
		]);
		expect(merged.map((v) => [v.voiceId, v.name])).toEqual([
			["a", "Jiyoung"],
			["b", "Jiyoung"],
			["c", "Jiyoung"],
		]);
	});

	it("고른 성우가 목록에 있으면 그대로, 없으면 첫 성우, 목록이 비면 null", () => {
		const list = [voice({ voiceId: "a" }), voice({ voiceId: "b" })];
		expect(pickSelected(list, "elevenlabs:public:b")).toBe("elevenlabs:public:b");
		expect(pickSelected(list, "elevenlabs:public:z")).toBe("elevenlabs:public:a");
		expect(pickSelected([], "elevenlabs:public:a")).toBeNull();
	});
});

describe("행 문구", () => {
	it("메타 줄은 성별·연령(없으면 '정보 없음')과 있으면 억양이다(세 공급자 같음)", () => {
		expect(metaLine(base)).toBe("여성 · 청년 · 서울 억양");
		expect(metaLine(voice({ gender: null, accent: null }))).toBe("성별 정보 없음 · 청년");
		expect(metaLine(fish)).toBe("여성 · 중년");
		expect(metaLine(voice({ provider: "fish_audio", gender: null, age: null, accent: null, tags: ["narration"] }))).toBe(
			"성별 정보 없음 · 연령 정보 없음",
		);
	});

	it("알약은 콘텐츠·분위기 최대 둘과 +N. Fish Audio는 콘텐츠·분위기 태그이고 모르는 태그는 알약에 넣지 않는다", () => {
		expect(pillsOf(base)).toEqual({
			shown: ["이야기·내레이션", "대화"],
			rest: 2,
			all: ["이야기·내레이션", "대화", "광고", "차분함"],
		});
		expect(pillsOf(fish).all).toEqual(["내레이션", "차분함"]);
	});

	it("Typecast는 성별·연령이 없으면 '정보 없음'이고 보조 정보는 모델·감정 수다", () => {
		const tc = voice({
			provider: "typecast",
			gender: null,
			age: "young_adult",
			accent: null,
			useCases: ["Game"],
			descriptives: [],
			category: null,
			models: [{ model: "ssfm-v30", emotions: ["a", "b"] }],
			usage: null,
		});
		expect(metaLine(tc)).toBe("성별 정보 없음 · 청년");
		expect(secondaryText(tc)).toBe("ssfm-v30 · 감정 2");
	});

	it("사용량은 한국어 단위로 줄인다", () => {
		expect(secondaryText(base)).toBe("최근 1년 210만 자");
		expect(secondaryText(voice({ usage: { kind: "tasks", count: 377_693 } }))).toBe("37.8만 회 사용");
		expect(compactCount(5953)).toBe("5,953");
	});

	it("배지: 무료 플랜 불가, 보증 성우, 계정 성우의 출처", () => {
		expect(badgesOf(base)).toEqual([{ label: "무료 플랜 불가", tone: "warning" }]);
		expect(badgesOf(voice({ provider: "fish_audio", terms: { ...base.terms, freeUsersAllowed: null, licensed: true } }))).toEqual([
			{ label: "보증 성우", tone: "secondary" },
		]);
		expect(badgesOf(voice({ source: "account", origin: "premade", terms: { ...base.terms, freeUsersAllowed: null } }))).toEqual([
			{ label: "제공 성우", tone: "secondary" },
		]);
		expect(badgesOf(voice({ source: "account", origin: "own", terms: { ...base.terms, freeUsersAllowed: null } }))[0]?.label).toBe("내가 만든 성우");
	});

	it("샘플 버튼 접근 이름은 보이는 상태 이름을 담는다(브리프 7절, WCAG 2.5.3)", () => {
		expect(sampleAriaLabel("idle", "Jiyoung 기본 샘플")).toBe("Jiyoung 기본 샘플 듣기");
		expect(sampleAriaLabel("loading", "Jiyoung 기본 샘플")).toBe("Jiyoung 기본 샘플 듣기 취소");
		expect(sampleAriaLabel("playing", "Jiyoung 한국어 샘플")).toBe("Jiyoung 한국어 샘플 정지");
		expect(sampleAriaLabel("failed", "Jiyoung 한국어 샘플")).toBe("Jiyoung 한국어 샘플 다시 듣기");
		expect(sampleAriaLabel("none", "Jiyoung 기본 샘플")).toBe("Jiyoung 기본 샘플 없음");
	});
});

describe("패널 문구", () => {
	it("칩: 아는 값만이고 '정보 없음'은 칩이 아니다. Fish Audio의 모르는 태그는 공급자 값 그대로", () => {
		expect(chipsOf(base)).toEqual(["여성", "청년", "서울 억양", "이야기·내레이션", "대화", "광고", "차분함", "전문 클론"]);
		expect(chipsOf(voice({ gender: null, accent: null, useCases: [], descriptives: [], category: null }))).toEqual(["청년"]);
		expect(chipsOf(fish)).toEqual(["여성", "중년", "내레이션", "차분함", "Korean", "weird"]);
	});

	it("ElevenLabs 공개 성우의 이용 조건(브리프 5절)", () => {
		expect(termLines(base)).toEqual([
			{ tone: "warning", text: "ElevenLabs 무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요" },
			{ tone: "warning", text: "이 성우는 무료 플랜 사용자에게 열려 있지 않아요" },
			{ tone: "info", text: "공유가 끝나도 730일 동안 계속 쓸 수 있어요" },
			{ tone: "info", text: "실시간 검수 성우라 응답이 늦을 수 있어요" },
			{ tone: "info", text: "크레딧 배율 1.5배(공급자 값)" },
		]);
	});

	it("제공 성우 종료, Fish Audio 보증·공개 종료 중, 배율 1은 보이지 않는다", () => {
		expect(termLines(voice({ source: "account", origin: "premade", terms: { ...base.terms, freeUsersAllowed: null, noticePeriodDays: null, liveModeration: false, creditRate: 1 } }))).toEqual([
			{ tone: "warning", text: "ElevenLabs 제공 성우는 2026-12-31에 종료돼요" },
		]);
		expect(termLines(voice({ provider: "fish_audio", terms: { freeUsersAllowed: null, noticePeriodDays: null, liveModeration: false, creditRate: null, licensed: true, retiring: true } }))).toEqual([
			{ tone: "info", text: "Fish Audio가 권리를 확보한 보증 성우예요" },
			{ tone: "warning", text: "공급자가 공개를 끝내는 중이에요" },
		]);
	});

	it("샘플 이름표: 언어 이름, 공급자 제목, 없으면 기본 샘플", () => {
		expect(sampleLabel({ language: "ko", title: null, url: "https://x.fish.audio/a.mp3" })).toBe("한국어 샘플");
		expect(sampleLabel({ language: null, title: "밝게", url: "https://x.fish.audio/a.mp3" })).toBe("밝게");
		expect(sampleLabel({ language: null, title: null, url: "https://x.fish.audio/a.mp3" })).toBe("기본 샘플");
	});
});

describe("상태 줄과 묶음 문구", () => {
	const now = new Date("2026-10-05T12:00:00.000Z");
	it("받은 시각", () => {
		expect(receivedText("2026-10-05T11:59:30.000Z", now)).toBe("방금 받음");
		expect(receivedText("2026-10-05T11:48:00.000Z", now)).toBe("12분 전에 받음");
		expect(receivedText("2026-10-05T09:00:00.000Z", now)).toBe("3시간 전에 받음");
		expect(agoText("2026-10-03T12:00:00.000Z", now)).toBe("2일");
	});

	it("인원 글자", () => {
		expect(countText({ provider: "elevenlabs", source: "public", language: "ko", total: 5953, totalExact: true })).toBe(
			"ElevenLabs 한국어 라이브러리 5,953명",
		);
		expect(countText({ provider: "fish_audio", source: "public", language: "ko", total: 1000, totalExact: false })).toBe(
			"Fish Audio 한국어 공개 성우 1,000명 이상",
		);
		expect(countText({ provider: "elevenlabs", source: "account", language: null, total: 31, totalExact: true })).toBe(
			"ElevenLabs 계정 성우 31명",
		);
		expect(countText({ provider: "elevenlabs", source: "public", language: null, total: null, totalExact: false })).toBe(
			"ElevenLabs 라이브러리",
		);
	});

	it("목록 끝: 다음이 있으면 more, Fish Audio 상한이면 limit, 아니면 end", () => {
		expect(listEnd({ next: 2, windowLimited: true })).toBe("more");
		expect(listEnd({ next: null, windowLimited: true })).toBe("limit");
		expect(listEnd({ next: null, windowLimited: false })).toBe("end");
	});

	it("'전체' 탭 묶음: 앞 5명과 머리 인원(공급자 전체 수, 정확하지 않으면 '이상', Typecast 검색이면 '{전체}명 중 {n}명')", () => {
		const many = Array.from({ length: 7 }, (_, i) => voice({ voiceId: `v${i}` }));
		expect(bundleOf(many, { total: 5953, totalExact: true }).voices.map((v) => v.voiceId)).toEqual(["v0", "v1", "v2", "v3", "v4"]);
		expect(bundleOf(many, { total: 5953, totalExact: true }).countLabel).toBe("5,953명");
		expect(bundleOf([], { total: 1000, totalExact: false }).countLabel).toBe("1,000명 이상");
		expect(bundleOf(many, { total: 7, totalExact: true, of: 614 }).countLabel).toBe("614명 중 7명");
		expect(bundleOf(many, { total: 614, totalExact: true, of: 614 }).countLabel).toBe("614명");
		expect(bundleOf([], { total: null, totalExact: false }).countLabel).toBeNull();
	});
});
```

`voice-failure.test.ts`에 더한다:

```ts
	it("retryAtOf는 사유 오류의 data.retryAt을, 없거나 다른 오류면 null을 돌려준다", () => {
		const limited = new ORPCError("TOO_MANY_REQUESTS", {
			data: { provider: "elevenlabs", reason: "rate_limit", retryAt: "2026-10-05T00:00:30.000Z" },
		});
		expect(retryAtOf(limited)).toBe("2026-10-05T00:00:30.000Z");
		expect(retryAtOf(new ORPCError("BAD_GATEWAY", { data: { provider: "elevenlabs", reason: "quota" } }))).toBeNull();
		expect(retryAtOf(new Error("x"))).toBeNull();
	});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test`. 기대: 새 파일 import 실패, `retryAtOf` 없음.

- [ ] **Step 3: 구현**

`voice-filter.ts`: `GENDER_LABEL`에 `["neutral", "중성"]`을 더한다(Map 순서: female, male, neutral). ElevenLabs 성별 선택지도 이 표를 쓴다(따로 두지 않는다).

`connection-view.ts`: `provider-status-card.tsx`의 `PROVIDER_LABEL` 선언을 옮긴다(주석 "화면 전체가 쓰는 공급자 표시 이름"). `provider-status-card.tsx`는 `import { isUpcoming, PROVIDER_LABEL } from "@/lib/connection-view"`로 쓰고, `connection-status.tsx`의 import도 이 경로로 바꾼다.

`voice-failure.ts` 끝에:

```ts
// 429 Retry-After로 정한 다음 호출 가능 시각(T4 스펙 4절). 없으면 null
export function retryAtOf(error: unknown): string | null {
	if (!(error instanceof ORPCError)) return null;
	const retryAt = (error.data as Partial<ProviderErrorData> | undefined)?.retryAt;
	return typeof retryAt === "string" ? retryAt : null;
}
```

`provider-conditions.ts`:

```ts
import type {
	ListInputOf,
	VoiceListInput,
	VoiceSource,
} from "@tts-pilot-app/api/providers/contract";

import { GENDER_LABEL } from "./voice-filter";

// ElevenLabs·Fish Audio 조건 줄(T4 브리프 6절). 조건은 공급자 입력의 query 그대로 들고, 서버가 공급자에게 그대로 보낸다.
export type ElPublicQuery = Extract<ListInputOf<"elevenlabs">, { source: "public" }>["query"];
export type ElAccountQuery = Extract<ListInputOf<"elevenlabs">, { source: "account" }>["query"];
export type FishQuery = ListInputOf<"fish_audio">["query"];
export type ServerList =
	| { provider: "elevenlabs"; source: "public"; query: ElPublicQuery }
	| { provider: "elevenlabs"; source: "account"; query: ElAccountQuery }
	| { provider: "fish_audio"; source: VoiceSource; query: FishQuery };
export type ServerProvider = ServerList["provider"];
export type Option = { value: string; label: string };

const names = new Intl.DisplayNames(["ko"], { type: "language" });
// 언어 코드의 한국어 이름("ko" → "한국어"). 모르는 코드는 코드 그대로
export function languageName(code: string): string {
	try {
		return names.of(code) ?? code;
	} catch {
		return code;
	}
}

// 브리프 6절 값 표(2026-10-04 실측 값). Map 순서가 선택지 순서다. 성별은 voice-filter의 GENDER_LABEL(여성·남성·중성)을 쓴다.
export const EL_AGE = new Map([["young", "청년"], ["middle_aged", "중년"], ["middle-aged", "중년"], ["old", "노년"]]);
export const ACCENT_KO = new Map([
	["standard", "표준 억양"], ["seoul", "서울 억양"], ["gyeongsang", "경상 억양"],
	["jeolla", "전라 억양"], ["chungcheong", "충청 억양"], ["hamgyong", "함경 억양"],
]);
export const EL_USE_CASE = new Map([
	["narrative_story", "이야기·내레이션"], ["informative_educational", "정보·교육"], ["conversational", "대화"],
	["social_media", "소셜 미디어"], ["characters_animation", "캐릭터·애니메이션"], ["entertainment_tv", "엔터테인먼트·TV"],
	["advertisement", "광고"],
]);
export const EL_DESCRIPTIVE = new Map([
	["calm", "차분함"], ["casual", "편안함"], ["confident", "자신감"], ["crisp", "또렷함"], ["gentle", "다정함"],
	["classy", "고급스러움"], ["deep", "깊음"], ["neutral", "담담함"], ["relaxed", "느긋함"], ["cute", "귀여움"],
	["serious", "진지함"], ["upbeat", "경쾌함"], ["formal", "격식"], ["chill", "여유로움"], ["soft", "부드러움"],
	["professional", "전문적"], ["pleasant", "상냥함"], ["mature", "성숙함"],
]);
export const EL_PUBLIC_CATEGORY = new Map([["professional", "전문 클론"], ["famous", "유명인"], ["high_quality", "고품질"]]);
export const EL_ACCOUNT_CATEGORY = new Map([["premade", "제공 성우"], ["cloned", "클론"], ["generated", "보이스 디자인"], ["professional", "전문 클론"]]);
export const EL_ORIGIN = new Map([["personal", "내가 만든 성우"], ["community", "라이브러리에서 저장"], ["default", "제공 성우"]]);
export const FISH_GENDER = new Map([["female", "여성"], ["male", "남성"]]);
export const FISH_AGE = new Map([["young", "청년"], ["middle-aged", "중년"], ["old", "노년"]]);
export const FISH_CONTENT = new Map([
	["narration", "내레이션"], ["social-media", "소셜 미디어"], ["conversational", "대화"], ["entertainment", "엔터테인먼트"],
	["storytelling", "이야기"], ["educational", "교육"], ["advertisement", "광고"], ["character-voice", "캐릭터"],
	["announcer", "아나운서"], ["documentary", "다큐멘터리"], ["gaming", "게임"], ["podcast", "팟캐스트"], ["anime", "애니메이션"],
]);
export const FISH_MOOD = new Map([
	["friendly", "친근함"], ["clear", "또렷함"], ["energetic", "활기참"], ["professional", "전문적"], ["calm", "차분함"],
	["bright", "밝음"], ["soft", "부드러움"], ["expressive", "표현력"], ["smooth", "매끄러움"], ["gentle", "다정함"],
	["cheerful", "명랑함"], ["confident", "자신감"], ["warm", "따뜻함"], ["playful", "장난스러움"],
	["authoritative", "권위 있음"], ["deep", "깊음"],
]);
const LANGUAGES = ["ko", "en", "ja", "zh"];

const options = (labels: Map<string, string>): Option[] => {
	const seen = new Set<string>();
	// middle_aged·middle-aged처럼 같은 이름표는 첫 값만 선택지로 둔다
	return [...labels].flatMap(([value, label]) => {
		if (seen.has(label)) return [];
		seen.add(label);
		return [{ value, label }];
	});
};
const LANGUAGE_OPTIONS: Option[] = LANGUAGES.map((code) => ({ value: code, label: languageName(code) }));

export function initialList(provider: ServerProvider, source: VoiceSource): ServerList {
	if (provider === "fish_audio") {
		return { provider, source, query: { search: "", language: source === "public" ? "ko" : null, tags: [], licensed: false, sort: "score" } };
	}
	return source === "public"
		? { provider, source, query: { search: "", language: "ko", accent: null, gender: null, age: null, category: null, useCases: [], descriptives: [], featured: false, sort: "trending" } }
		: { provider, source, query: { search: "", voiceType: null, category: null, gender: null, age: null, language: null, accent: null, useCases: [], sort: "created_at_unix", direction: "desc" } };
}

// 첫 페이지 매개변수(ElevenLabs 공개 0, Fish Audio 1, ElevenLabs 내 계정은 커서 null)
export function firstPage(list: ServerList): number | null {
	if (list.provider === "fish_audio") return 1;
	return list.source === "public" ? 0 : null;
}

const sorted = (values: readonly string[]) => [...values].sort();

// 같은 조건은 같은 입력이다(배열 정렬, 검색어 앞뒤 공백 제거). 브라우저 조회 키와 서버 캐시 키가 함께 맞는다(Review Focus 1)
export function inputOf(list: ServerList, page: number | string | null): VoiceListInput {
	if (list.provider === "fish_audio") {
		return { provider: "fish_audio", source: list.source, page: typeof page === "number" ? page : 1, query: { ...list.query, search: list.query.search.trim(), tags: sorted(list.query.tags) } };
	}
	if (list.source === "public") {
		return { provider: "elevenlabs", source: "public", page: typeof page === "number" ? page : 0, query: { ...list.query, search: list.query.search.trim(), useCases: sorted(list.query.useCases), descriptives: sorted(list.query.descriptives) } };
	}
	return { provider: "elevenlabs", source: "account", cursor: typeof page === "string" ? page : null, query: { ...list.query, search: list.query.search.trim(), useCases: sorted(list.query.useCases) } };
}

export function withSearch(list: ServerList, search: string): ServerList {
	return { ...list, query: { ...list.query, search } } as ServerList;
}

// 조건 하나. 하나·여럿 고르기는 값 배열, 토글은 불린이다(ponytail)
type AxisBase = { key: string; label: string; disabled?: boolean };
export type ChoiceAxis = AxisBase & {
	kind: "single" | "multi";
	options: Option[];
	selected: string[];
	apply: (values: string[]) => ServerList;
	// 하나 고르기의 '조건 없음' 항목 이름(기본 '전체')
	emptyLabel?: string;
	// 드롭다운 머리의 회색 작은 글자(Fish Audio 태그 '모두 포함')
	note?: string;
};
export type ToggleAxis = AxisBase & { kind: "toggle"; on: boolean; apply: (on: boolean) => ServerList };
export type Axis = ChoiceAxis | ToggleAxis;

// 축 빌더. 선택지는 options에서만 오므로 하나 고르기 값은 그 축의 값 형으로 좁힌다
const single = <V extends string>(key: string, label: string, choices: Option[], value: V | null, apply: (value: V | null) => ServerList, extra: Partial<ChoiceAxis> = {}): ChoiceAxis => ({
	key, label, kind: "single", options: choices, selected: value === null ? [] : [value],
	apply: (values) => apply((values[0] ?? null) as V | null),
	...extra,
});
const multi = (key: string, label: string, choices: Option[], values: readonly string[], apply: (values: string[]) => ServerList, extra: Partial<ChoiceAxis> = {}): ChoiceAxis => ({
	key, label, kind: "multi", options: choices, selected: [...values], apply, ...extra,
});
const toggle = (key: string, label: string, on: boolean, apply: (on: boolean) => ServerList): ToggleAxis => ({ key, label, kind: "toggle", on, apply });

// Fish Audio 태그 드롭다운: 이 묶음의 태그만 바꾸고 다른 묶음의 태그는 남긴다(모두 query.tags 하나에 쓴다)
function tagAxis(list: Extract<ServerList, { provider: "fish_audio" }>, key: string, label: string, labels: Map<string, string>): ChoiceAxis {
	const own = new Set(labels.keys());
	return multi(key, label, options(labels), list.query.tags.filter((tag) => own.has(tag)), (values) => ({
		...list,
		query: { ...list.query, tags: [...list.query.tags.filter((tag) => !own.has(tag)), ...values] },
	}), { note: "모두 포함" });
}

export function axesOf(list: ServerList, accents: Option[]): Axis[] {
	if (list.provider === "fish_audio") {
		const { query } = list;
		const set = (patch: Partial<FishQuery>): ServerList => ({ ...list, query: { ...query, ...patch } });
		return [
			single("language", "언어", LANGUAGE_OPTIONS, query.language, (language) => set({ language }), { emptyLabel: "모든 언어" }),
			tagAxis(list, "gender", "성별", FISH_GENDER),
			tagAxis(list, "age", "연령", FISH_AGE),
			tagAxis(list, "content", "콘텐츠", FISH_CONTENT),
			tagAxis(list, "mood", "분위기", FISH_MOOD),
			...(list.source === "public" ? [toggle("licensed", "보증 성우만", query.licensed, (licensed) => set({ licensed }))] : []),
		];
	}
	if (list.source === "public") {
		const { query } = list;
		const set = (patch: Partial<ElPublicQuery>): ServerList => ({ ...list, query: { ...query, ...patch } });
		return [
			// 언어를 바꾸면 억양 선택지가 바뀌므로 억양 조건을 푼다(AC3)
			single("language", "언어", LANGUAGE_OPTIONS, query.language, (language) => set({ language, accent: null }), { emptyLabel: "모든 언어" }),
			single("accent", "억양", accents, query.accent, (accent) => set({ accent }), { disabled: query.language === null }),
			single("gender", "성별", options(GENDER_LABEL), query.gender, (gender) => set({ gender })),
			single("age", "연령", options(EL_AGE), query.age, (age) => set({ age })),
			multi("useCases", "콘텐츠", options(EL_USE_CASE), query.useCases, (useCases) => set({ useCases })),
			multi("descriptives", "분위기", options(EL_DESCRIPTIVE), query.descriptives, (descriptives) => set({ descriptives })),
			single("category", "성우 종류", options(EL_PUBLIC_CATEGORY), query.category, (category) => set({ category })),
			toggle("featured", "추천 성우만", query.featured, (featured) => set({ featured })),
		];
	}
	const { query } = list;
	const set = (patch: Partial<ElAccountQuery>): ServerList => ({ ...list, query: { ...query, ...patch } });
	return [
		single("voiceType", "출처", options(EL_ORIGIN), query.voiceType, (voiceType) => set({ voiceType })),
		single("category", "성우 종류", options(EL_ACCOUNT_CATEGORY), query.category, (category) => set({ category })),
		single("gender", "성별", options(GENDER_LABEL), query.gender, (gender) => set({ gender })),
		single("age", "연령", options(EL_AGE), query.age, (age) => set({ age })),
		single("language", "언어", LANGUAGE_OPTIONS, query.language, (language) => set({ language, accent: null }), { emptyLabel: "모든 언어" }),
		single("accent", "억양", accents, query.accent, (accent) => set({ accent }), { disabled: query.language === null }),
		multi("useCases", "콘텐츠", options(EL_USE_CASE), query.useCases, (useCases) => set({ useCases })),
	];
}

export type SortView = { options: Option[]; value: string; apply: (value: string) => ServerList };
const toOptions = (pairs: readonly (readonly [string, string])[]): Option[] => pairs.map(([value, label]) => ({ value, label }));
const SORTS = {
	fish: [["score", "점수"], ["task_count", "사용 횟수"], ["created_at", "최신"]],
	elPublic: [["trending", "인기 급상승"], ["created_date", "최신"], ["usage_character_count_1y", "1년 사용량"], ["cloned_by_count", "복제 수"]],
	// 내 계정: 정렬과 방향을 선택 하나로 묶는다(T4 계획 '스펙과 다른 점' 5, 사용자 승인 2026-10-04)
	elAccount: [["created_at_unix:desc", "최근 만든 순"], ["created_at_unix:asc", "오래된 순"], ["name:asc", "이름순"], ["name:desc", "이름 역순"]],
} as const;

export function sortOf(list: ServerList): SortView {
	if (list.provider === "fish_audio") {
		return { options: toOptions(SORTS.fish), value: list.query.sort, apply: (value) => ({ ...list, query: { ...list.query, sort: value as FishQuery["sort"] } }) };
	}
	if (list.source === "public") {
		return { options: toOptions(SORTS.elPublic), value: list.query.sort, apply: (value) => ({ ...list, query: { ...list.query, sort: value as ElPublicQuery["sort"] } }) };
	}
	return {
		options: toOptions(SORTS.elAccount),
		value: `${list.query.sort}:${list.query.direction}`,
		apply: (value) => {
			const [sort, direction] = value.split(":") as [ElAccountQuery["sort"], ElAccountQuery["direction"]];
			return { ...list, query: { ...list.query, sort, direction } };
		},
	};
}

const picked = (axis: Axis): string[] => (axis.kind === "toggle" ? (axis.on ? [axis.key] : []) : axis.selected);

// 시작값과 다른 조건의 수('조건' 버튼 배지). 검색어와 정렬은 세지 않는다
export function conditionCount(list: ServerList): number {
	const start = new Map(axesOf(initialList(list.provider, list.source), []).map((axis) => [axis.key, picked(axis)]));
	return axesOf(list, []).reduce((sum, axis) => {
		const now = picked(axis);
		const initial = start.get(axis.key) ?? [];
		const same = now.length === initial.length && now.every((value) => initial.includes(value));
		return sum + (same ? 0 : Math.max(now.length, 1));
	}, 0);
}

// 검색어·조건·정렬이 모두 시작값이면 참('조건 모두 해제'를 숨긴다)
export function isInitial(list: ServerList): boolean {
	return list.query.search.trim() === "" && conditionCount(list) === 0 && sortOf(list).value === sortOf(initialList(list.provider, list.source)).value;
}
```

`voice-view.ts`:

```ts
import type { Voice, VoiceSample } from "@tts-pilot-app/api/providers/contract";

import { PROVIDER_LABEL } from "./connection-view";
import {
	ACCENT_KO,
	EL_ACCOUNT_CATEGORY,
	EL_AGE,
	EL_DESCRIPTIVE,
	EL_PUBLIC_CATEGORY,
	EL_USE_CASE,
	FISH_AGE,
	FISH_CONTENT,
	FISH_GENDER,
	FISH_MOOD,
	languageName,
} from "./provider-conditions";
import type { SampleStatus } from "./sample-state";
import { AGE_LABEL, GENDER_LABEL, labelOf, USE_CASE_LABEL } from "./voice-filter";

// 성우 행·패널·묶음에 보이는 문구(T4 브리프 5·6·7·8절). 화면 없이 테스트하는 순수 함수만 둔다.
export const voiceKey = (voice: Pick<Voice, "provider" | "source" | "voiceId">) =>
	`${voice.provider}:${voice.source}:${voice.voiceId}`;

// 페이지를 이어 붙인다. 순위가 움직이는 정렬은 다음 페이지에 앞 성우가 다시 올 수 있어 처음 것만 남긴다(Review Focus 2)
export function flattenPages(pages: readonly { voices: readonly Voice[] }[]): Voice[] {
	const seen = new Map<string, Voice>();
	for (const page of pages) for (const voice of page.voices) {
		const key = voiceKey(voice);
		if (!seen.has(key)) seen.set(key, voice);
	}
	return [...seen.values()];
}

// 고른 성우가 목록에 없으면 첫 성우다(T4 스펙 AC8). 목록이 비면 null
export function pickSelected(voices: readonly Voice[], selected: string | null): string | null {
	if (selected !== null && voices.some((voice) => voiceKey(voice) === selected)) return selected;
	const [first] = voices;
	return first ? voiceKey(first) : null;
}

const knownTags = (labels: Map<string, string>, values: readonly string[]) =>
	values.flatMap((value) => {
		const label = labels.get(value);
		return label ? [label] : [];
	});
const FISH_KNOWN = new Set([...FISH_GENDER.keys(), ...FISH_AGE.keys(), ...FISH_CONTENT.keys(), ...FISH_MOOD.keys()]);

// 성별·연령·억양의 한국어 이름. 공급자가 주지 않으면 null이다(Fish Audio는 성별·연령 태그)
function personOf(voice: Voice) {
	if (voice.provider === "fish_audio") {
		return { gender: knownTags(FISH_GENDER, voice.tags)[0] ?? null, age: knownTags(FISH_AGE, voice.tags)[0] ?? null, accent: null };
	}
	return {
		gender: voice.gender ? labelOf(GENDER_LABEL, voice.gender) : null,
		age: voice.age ? labelOf(voice.provider === "typecast" ? AGE_LABEL : EL_AGE, voice.age) : null,
		accent: voice.accent ? (ACCENT_KO.get(voice.accent) ?? `${voice.accent} 억양`) : null,
	};
}

// 메타 줄(브리프 6절, 계획 리뷰 U6): 세 공급자 모두 성별·연령이 없으면 '정보 없음'이고 억양은 있을 때만 붙인다
export function metaLine(voice: Voice): string {
	const { gender, age, accent } = personOf(voice);
	return [gender ?? "성별 정보 없음", age ?? "연령 정보 없음", ...(accent ? [accent] : [])].join(" · ");
}

const VISIBLE_PILLS = 2;
export function pillsOf(voice: Voice): { shown: string[]; rest: number; all: string[] } {
	const all =
		voice.provider === "fish_audio"
			? [...knownTags(FISH_CONTENT, voice.tags), ...knownTags(FISH_MOOD, voice.tags)]
			: voice.provider === "typecast"
				? voice.useCases.map((value) => labelOf(USE_CASE_LABEL, value))
				: [...voice.useCases.map((v) => labelOf(EL_USE_CASE, v)), ...voice.descriptives.map((v) => labelOf(EL_DESCRIPTIVE, v))];
	return { shown: all.slice(0, VISIBLE_PILLS), rest: Math.max(0, all.length - VISIBLE_PILLS), all };
}

// 패널의 공급자 분류 칩(브리프 5절 패널 1): 아는 성별·연령·억양, 콘텐츠·분위기, 성우 종류. '정보 없음'은 칩으로 만들지 않는다.
// Fish Audio는 표에 없는 태그도 공급자 값 그대로 더한다
export function chipsOf(voice: Voice): string[] {
	const { gender, age, accent } = personOf(voice);
	const category = voice.category
		? [labelOf(voice.source === "account" ? EL_ACCOUNT_CATEGORY : EL_PUBLIC_CATEGORY, voice.category)]
		: [];
	const otherTags = voice.provider === "fish_audio" ? voice.tags.filter((tag) => !FISH_KNOWN.has(tag)) : [];
	return [
		...new Set(
			[gender, age, accent, ...pillsOf(voice).all, ...category, ...otherTags].filter(
				(chip): chip is string => chip !== null,
			),
		),
	];
}

const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("ko-KR");
export const compactCount = (value: number) => (value < 10_000 ? plain.format(value) : compact.format(value));

export function secondaryText(voice: Voice): string | null {
	if (voice.provider === "typecast") {
		return voice.models.map((model) => `${model.model} · 감정 ${model.emotions.length}`).join(" · ") || null;
	}
	if (voice.usage === null) return null;
	return voice.usage.kind === "chars_1y"
		? `최근 1년 ${compactCount(voice.usage.count)} 자`
		: `${compactCount(voice.usage.count)} 회 사용`;
}

export type Badge = { label: string; tone: "warning" | "secondary" };
const ORIGIN_LABEL = { premade: "제공 성우", saved: "라이브러리에서 저장", own: "내가 만든 성우" } as const;
export function badgesOf(voice: Voice): Badge[] {
	const badges: Badge[] = [];
	if (voice.terms.freeUsersAllowed === false) badges.push({ label: "무료 플랜 불가", tone: "warning" });
	if (voice.terms.licensed) badges.push({ label: "보증 성우", tone: "secondary" });
	if (voice.origin) badges.push({ label: ORIGIN_LABEL[voice.origin], tone: "secondary" });
	return badges;
}

// 샘플 버튼의 접근 이름(브리프 7절). subject는 행 "{이름} 기본 샘플", 패널 "{이름} {이름표}"다. 보이는 상태 이름을 이름에 담는다(WCAG 2.5.3, 계획 리뷰 D20)
export function sampleAriaLabel(status: SampleStatus | "none", subject: string): string {
	switch (status) {
		case "playing":
			return `${subject} 정지`;
		case "loading":
			return `${subject} 듣기 취소`;
		case "failed":
			return `${subject} 다시 듣기`;
		case "none":
			return `${subject} 없음`;
		default:
			return `${subject} 듣기`;
	}
}

export type TermLine = { tone: "warning" | "info"; text: string };
// 패널 이용 조건(브리프 5절 4). 공급자가 준 값만, 공식 문구 그대로
export function termLines(voice: Voice): TermLine[] {
	const lines: TermLine[] = [];
	const { terms } = voice;
	if (voice.provider === "elevenlabs" && voice.source === "public") lines.push({ tone: "warning", text: "ElevenLabs 무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요" });
	if (voice.provider === "elevenlabs" && voice.origin === "premade") lines.push({ tone: "warning", text: "ElevenLabs 제공 성우는 2026-12-31에 종료돼요" });
	if (terms.freeUsersAllowed === false) lines.push({ tone: "warning", text: "이 성우는 무료 플랜 사용자에게 열려 있지 않아요" });
	if (terms.noticePeriodDays !== null) lines.push({ tone: "info", text: `공유가 끝나도 ${plain.format(terms.noticePeriodDays)}일 동안 계속 쓸 수 있어요` });
	if (terms.liveModeration) lines.push({ tone: "info", text: "실시간 검수 성우라 응답이 늦을 수 있어요" });
	if (terms.creditRate !== null && terms.creditRate !== 1) lines.push({ tone: "info", text: `크레딧 배율 ${terms.creditRate}배(공급자 값)` });
	if (terms.licensed) lines.push({ tone: "info", text: "Fish Audio가 권리를 확보한 보증 성우예요" });
	if (terms.retiring) lines.push({ tone: "warning", text: "공급자가 공개를 끝내는 중이에요" });
	return lines;
}

export function sampleLabel(sample: VoiceSample): string {
	if (sample.language) return `${languageName(sample.language)} 샘플`;
	return sample.title ?? "기본 샘플";
}

const MINUTE = 60_000;
// "12분", "3시간", "2일"(1분 미만은 null)
function ago(fetchedAt: string, now: Date): string | null {
	const minutes = Math.floor((now.getTime() - Date.parse(fetchedAt)) / MINUTE);
	if (minutes < 1) return null;
	if (minutes < 60) return `${minutes}분`;
	if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간`;
	return `${Math.floor(minutes / (60 * 24))}일`;
}
// 그릴 때의 시각으로 계산한다(1분마다 다시 그리지 않는다, ponytail)
export const receivedText = (fetchedAt: string, now: Date) => {
	const a = ago(fetchedAt, now);
	return a ? `${a} 전에 받음` : "방금 받음";
};
// 지난 목록 안내의 "{N분/N시간/N일} 전에 받은 목록"
export const agoText = (fetchedAt: string, now: Date) => ago(fetchedAt, now) ?? "방금";

const clock = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
export const retryTime = (iso: string) => clock.format(new Date(iso));

export function countText(input: { provider: "elevenlabs" | "fish_audio"; source: Voice["source"]; language: string | null; total: number | null; totalExact: boolean }): string {
	const name = PROVIDER_LABEL[input.provider];
	const language = input.language ? `${languageName(input.language)} ` : "";
	const what = input.source === "account" ? "계정 성우" : input.provider === "elevenlabs" ? `${language}라이브러리` : `${language}공개 성우`;
	if (input.total === null) return `${name} ${what}`;
	return `${name} ${what} ${plain.format(input.total)}명${input.totalExact ? "" : " 이상"}`;
}

export function listEnd(page: { next: number | string | null; windowLimited: boolean }): "more" | "limit" | "end" {
	if (page.next !== null) return "more";
	return page.windowLimited ? "limit" : "end";
}

// '전체' 탭 묶음(브리프 5절, 스펙 AC2): 앞 5명과 머리의 인원 글자. Typecast는 검색어가 있으면 "{전체}명 중 {n}명"이다(of: 전체 수)
export const BUNDLE_SIZE = 5;
export function bundleOf(
	voices: readonly Voice[],
	count: { total: number | null; totalExact: boolean; of?: number },
): { voices: Voice[]; countLabel: string | null } {
	const countLabel =
		count.total === null
			? null
			: count.of !== undefined && count.of !== count.total
				? `${plain.format(count.of)}명 중 ${plain.format(count.total)}명`
				: `${plain.format(count.total)}명${count.totalExact ? "" : " 이상"}`;
	return { voices: voices.slice(0, BUNDLE_SIZE), countLabel };
}
```

  주의: `countText`의 내 계정은 언어와 상관없이 "계정 성우"다(테스트 기대). `compactCount(5953)`은 1만 미만이라 "5,953"이다. `Intl` 결과("210만", "37.8만")는 계획 리뷰가 Node 24에서 실행해 확인했다. 다른 글자가 나오면 기대값을 그 결과로 고치지 말고 멈추고 보고한다(문구는 브리프가 정한다).

- [ ] **Step 4: 통과 확인** — `pnpm --filter web test`. 기대: 모두 통과(기존 27 + 새 테스트).
- [ ] **Step 5: 검사** — `pnpm --filter web check-types`(0), `pnpm exec biome check --write apps/web/src/lib apps/web/src/components/provider-status-card.tsx apps/web/src/components/connection-status.tsx`.

### Task 10: 성우 행과 성우 패널

**Files:**
- Modify: `apps/web/src/components/sample-player.tsx`(주석만)
- Create: `apps/web/src/components/voice-row.tsx`
- Delete: `apps/web/src/components/voice-card.tsx`(Task 12b에서 쓰는 곳을 다 바꾼 뒤 지운다. 이 태스크에서는 남겨 둔다)
- Create: `apps/web/src/components/voice-panel.tsx`
- Modify: `apps/web/src/index.css`(`.voice-row`, `@utility voice-panel-sticky` 추가, `.voice-card`는 Task 12b에서 지움)

**Interfaces:**
- Consumes: Task 9의 `metaLine`, `pillsOf`, `chipsOf`, `secondaryText`, `badgesOf`, `termLines`, `sampleLabel`, `sampleAriaLabel`, `PROVIDER_LABEL`(`lib/connection-view`). T3 `useSample(voiceId: string)`(키로 샘플 주소를 넘긴다), `SampleStatus`. `Badge`(`@tts-pilot-app/ui/components/badge`, 변형 `primary`·`secondary`·`warning`), `Button` `size="icon-lg"`(이미 있다, `size-11`).
- Produces:
  - `SampleButton({ status, subject, onToggle? })`: 행과 패널이 함께 쓰는 44px 둥근 아이콘 버튼.
  - `VoiceRow({ voice, selected, onSelect, panelId? }: { voice: Voice; selected: boolean; onSelect: (voice: Voice, row: HTMLButtonElement) => void; panelId?: string })`.
  - `PANEL_ID = "voice-panel"`, `VoicePanelContent({ voice })`, `VoicePanel({ voice })`(1200px 이상 오른쪽 칸 `<aside id={PANEL_ID}>`), `VoiceSheet({ voice, open, onOpenChange, finalFocus })`(1199px 이하 서랍).

- [ ] **Step 1: 편집 전에 읽기** — `.agents/skills/impeccable/reference/craft-floor.md`, 브리프 5·7·9·10절, 승인 시안 `tasks/evidence/T04/comp-casting-approved.png`(행 높이·오른쪽 칸·패널 구획·여백을 눈으로 본다).
- [ ] **Step 2: 샘플 플레이어 주석** — `sample-player.tsx`의 동작과 이름은 그대로 둔다. `useSample` 위 주석에 "재생 키는 T4부터 샘플 오디오 주소다. 행과 패널의 같은 샘플이 같은 상태를 보이고, 공급자끼리 성우 id가 겹쳐도 섞이지 않는다. 이름 voiceId는 T3 그대로다"를 적는다. 주석의 "카드"를 "행과 패널"로, ponytail 주석의 "카드 전부가 다시 그려진다(614장)"를 "행 전부가 다시 그려진다(최대 수백 행)"로 바꾼다.
- [ ] **Step 3: 성우 행** — `voice-row.tsx`. 브리프 5절 '성우 행'과 7절 상태표를 옮긴다.

```tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Play, Square } from "lucide-react";
import { useId } from "react";

import type { SampleStatus } from "@/lib/sample-state";
import {
	badgesOf,
	metaLine,
	pillsOf,
	sampleAriaLabel,
	secondaryText,
} from "@/lib/voice-view";

import { useSample } from "./sample-player";

const pillClass = "shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs";

// 샘플 재생 버튼(브리프 7절): 행과 패널이 함께 쓰는 44px 둥근 아이콘 버튼. 접근 이름은 sampleAriaLabel(보이는 상태를 담는다)
export function SampleButton({
	status,
	subject,
	onToggle,
}: {
	status: SampleStatus | "none";
	subject: string;
	onToggle?: () => void;
}) {
	const playing = status === "playing";
	return (
		<Button
			variant={playing ? "default" : status === "none" ? "secondary" : "outline"}
			size="icon-lg"
			className="relative z-10 shrink-0 rounded-full"
			disabled={status === "none"}
			aria-label={sampleAriaLabel(status, subject)}
			aria-busy={status === "loading" || undefined}
			onClick={onToggle}
		>
			{status === "loading" ? (
				<Spinner aria-hidden="true" />
			) : playing ? (
				<Square aria-hidden="true" className="fill-current" />
			) : (
				<Play aria-hidden="true" className="fill-current" />
			)}
		</Button>
	);
}

// 브리프 5절 '성우 행'(높이 약 68px)과 7절 샘플 상태. 재생 버튼 밖 행 전체가 '고르기' 버튼이다.
// 칸 숨김은 뷰포트가 아니라 목록 칸 너비로 정한다(목록 ul의 @container, 계획 리뷰 D2):
// 28rem 이상이면 둘째 줄에 알약, 32rem 이상이면 오른쪽 고정 칸(보조 정보 위, 배지 아래). 그 아래면 배지가 메타 줄 아래로 내려가고 보조 정보는 빠진다.
export function VoiceRow({
	voice,
	selected,
	onSelect,
	panelId,
}: {
	voice: Voice;
	selected: boolean;
	onSelect: (voice: Voice, row: HTMLButtonElement) => void;
	// 1200px 이상에서 고르면 바뀌는 패널(aria-controls). 서랍일 때는 없다
	panelId?: string;
}) {
	const id = useId();
	const url = voice.previewUrl;
	// 재생 키는 샘플 주소다. 샘플이 없으면 어떤 키와도 같지 않은 ""
	const { status, toggle } = useSample(url ?? "");
	const playing = status === "playing";
	const pills = pillsOf(voice);
	const secondary = secondaryText(voice);
	const badges = badgesOf(voice);
	const badgeList = (className: string) =>
		badges.length > 0 ? (
			<span aria-hidden="true" className={className}>
				{badges.map((badge) => (
					<Badge key={badge.label} variant={badge.tone}>
						{badge.label}
					</Badge>
				))}
			</span>
		) : null;
	return (
		<article
			className={cn(
				"relative flex min-h-17 items-center gap-3 px-4 py-2 transition-colors",
				selected ? "bg-primary-subtle" : "hover:bg-muted",
				// 재생 중: 청록 3px 왼쪽 띠(브리프 3·7절이 정한 표시. craft-floor의 색 있는 왼쪽 테두리 금지보다 브리프가 앞선다)
				playing &&
					"before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-primary",
			)}
		>
			<SampleButton
				status={url === null ? "none" : status}
				subject={`${voice.name} 기본 샘플`}
				onToggle={url === null ? undefined : () => toggle(url, voice.name, url)}
			/>
			{/* 행 전체를 덮는 고르기 버튼(재생 버튼은 z-10으로 그 위). 이름이 접근 이름이고 메타·분류·배지·재생 실패는 설명이다(계획 리뷰 D5) */}
			<button
				type="button"
				// '더 보기' 뒤 새로 붙은 첫 행으로 포커스를 옮길 때 찾는 표지(Task 11b)
				data-select=""
				aria-current={selected ? "true" : undefined}
				aria-labelledby={`${id}-name`}
				aria-describedby={`${id}-detail`}
				aria-controls={panelId}
				onClick={(event) => onSelect(voice, event.currentTarget)}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-ring focus-visible:after:-outline-offset-2"
			>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex min-w-0 items-baseline gap-1.5">
						<span id={`${id}-name`} className="truncate font-bold">
							{voice.name}
						</span>
						{voice.englishName ? (
							<span translate="no" className="truncate text-muted-foreground text-sm">
								{voice.englishName}
							</span>
						) : null}
						{playing ? <Badge variant="primary">재생 중</Badge> : null}
					</span>
					<span id={`${id}-detail`} className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
						<span className="truncate">{metaLine(voice)}</span>
						{pills.shown.map((label) => (
							<span key={label} aria-hidden="true" className={cn(pillClass, "hidden @md:inline")}>
								{label}
							</span>
						))}
						{pills.rest > 0 ? (
							<span aria-hidden="true" className={cn(pillClass, "hidden @md:inline")}>
								+{pills.rest}
							</span>
						) : null}
						<span className="sr-only">
							{pills.all.length > 0 ? `, 공급자 분류: ${pills.all.join(", ")}` : ""}
							{secondary ? `, ${secondary}` : ""}
							{badges.length > 0 ? `, ${badges.map((badge) => badge.label).join(", ")}` : ""}
						</span>
						{status === "failed" ? (
							<span className="shrink-0 text-warning">재생하지 못했어요</span>
						) : null}
					</span>
					{badgeList("flex flex-wrap gap-1 @lg:hidden")}
				</span>
				<span className="hidden w-32 shrink-0 flex-col items-end gap-1 @lg:flex">
					{secondary ? (
						<span aria-hidden="true" translate="no" className="text-muted-foreground text-sm tabular-nums">
							{secondary}
						</span>
					) : null}
					{badgeList("flex flex-wrap justify-end gap-1")}
				</span>
			</button>
		</article>
	);
}
```

  - 행 목록의 `ul`은 `@container divide-y`이고, 각 `li`에 `voice-row`(content-visibility)를 붙인다. 쓰는 곳은 Task 11b·12a·12b다.
  - `index.css`에 더한다(주석 포함):

```css
/* 화면 밖 성우 행은 그리기를 미룬다(T4, rendering-content-visibility). 행 높이 약 68px(min-h-17)이라 auto 4.25rem. */
.voice-row {
	content-visibility: auto;
	contain-intrinsic-size: auto 4.25rem;
}

/* 성우 패널(1200px 이상)은 목록을 따라 화면에 붙어 있고, 화면보다 길면 패널 안에서 스크롤한다(T4 계획 리뷰 D12). 임의 값 대신 이름 붙은 utility로 둔다. */
@utility voice-panel-sticky {
	position: sticky;
	top: --spacing(6);
	max-height: calc(100svh - --spacing(12));
	overflow-y: auto;
}
```

- [ ] **Step 4: 성우 패널** — `voice-panel.tsx`. 브리프 5절 '성우 패널' 1~4를 옮긴다(5 뒤 TASK 자리는 그리지 않는다).

```tsx
"use client";

import type { Voice, VoiceSample } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@tts-pilot-app/ui/components/sheet";
import { BadgeCheck, Info, TriangleAlert } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { chipsOf, sampleLabel, termLines } from "@/lib/voice-view";

import { useSample } from "./sample-player";
import { SampleButton } from "./voice-row";

export const PANEL_ID = "voice-panel";
const SOURCE = { public: "공개 라이브러리", account: "내 계정" } as const;
const chip = "rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs";

// 패널의 샘플 한 줄(브리프 5절 패널 3, 7절, 계획 리뷰 U3): 왼쪽 44px 둥근 아이콘 버튼과 이름표. 재생 키가 샘플 주소라 행의 같은 샘플과 같은 상태다
function PanelSample({ voice, sample }: { voice: Voice; sample: VoiceSample }) {
	const { status, toggle } = useSample(sample.url);
	const label = sampleLabel(sample);
	return (
		<li className="flex min-h-11 items-center gap-3">
			<SampleButton
				status={status}
				subject={`${voice.name} ${label}`}
				onToggle={() => toggle(sample.url, `${voice.name} ${label}`, sample.url)}
			/>
			<span className="flex flex-wrap items-center gap-x-2">
				{label}
				{status === "playing" ? <Badge variant="primary">재생 중</Badge> : null}
				{status === "failed" ? <span className="text-sm text-warning">재생하지 못했어요</span> : null}
			</span>
		</li>
	);
}

// 설명(브리프 5절 패널 2): 세 줄에서 잘렸을 때만 '더 보기'를 보인다. 잘림은 글자 수가 아니라 그린 높이로 판정한다(계획 리뷰 D11).
// 성우마다 key로 다시 만들어 펼침 상태가 다음 성우로 넘어가지 않는다.
// ponytail: 처음 그릴 때 한 번만 잰다. 창 너비를 바꿔 잘림이 달라지면 다시 재지 않는다(패널 너비가 바뀌는 일은 드물다).
function Description({ text }: { text: string }) {
	const ref = useRef<HTMLParagraphElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [clamped, setClamped] = useState(false);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el) setClamped(el.scrollHeight > el.clientHeight);
	}, []);
	return (
		<div>
			<p ref={ref} className={expanded ? "text-muted-foreground" : "line-clamp-3 text-muted-foreground"}>
				{text}
			</p>
			{clamped ? (
				<Button
					variant="link"
					size="lg"
					className="px-0"
					aria-expanded={expanded}
					aria-label={expanded ? "설명 접기" : "설명 더 보기"}
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded ? "접기" : "더 보기"}
				</Button>
			) : null}
		</div>
	);
}

// 패널 내용(머리의 제목은 칸에서는 h2, 서랍에서는 SheetTitle이 맡는다)
export function VoicePanelContent({ voice }: { voice: Voice }) {
	const samples: VoiceSample[] =
		voice.samples.length > 0
			? voice.samples
			: voice.previewUrl
				? [{ language: null, title: null, url: voice.previewUrl }]
				: [];
	const chips = chipsOf(voice);
	const terms = termLines(voice);
	return (
		<div className="flex flex-col gap-5">
			<p className="text-muted-foreground text-sm">
				<span translate="no">{PROVIDER_LABEL[voice.provider]}</span> · {SOURCE[voice.source]}
			</p>
			{chips.length > 0 ? (
				<ul className="flex flex-wrap gap-1.5" aria-label="공급자 분류">
					{chips.map((label) => (
						<li key={label} className={chip}>
							{label}
						</li>
					))}
				</ul>
			) : null}
			{voice.description ? <Description key={`${voice.provider}:${voice.voiceId}`} text={voice.description} /> : null}
			<section className="flex flex-col gap-2">
				<h3 className="font-bold">기본 샘플</h3>
				{samples.length > 0 ? (
					<ul className="flex flex-col gap-1">
						{samples.map((sample) => (
							<PanelSample key={sample.url} voice={voice} sample={sample} />
						))}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">기본 샘플이 없어요</p>
				)}
			</section>
			{voice.provider === "typecast" ? (
				<section className="flex flex-col gap-2">
					<h3 className="font-bold">모델별 감정</h3>
					<ul className="flex flex-col gap-1 text-muted-foreground text-sm" translate="no">
						{voice.models.map((model) => (
							<li key={model.model}>
								{model.model}: {model.emotions.join(", ")}
							</li>
						))}
					</ul>
				</section>
			) : terms.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h3 className="font-bold">이용 조건</h3>
					<ul className="flex flex-col gap-1.5 text-sm">
						{terms.map((line) => {
							const Icon = line.text.startsWith("Fish Audio가 권리")
								? BadgeCheck
								: line.tone === "warning"
									? TriangleAlert
									: Info;
							return (
								<li key={line.text} className="flex gap-2 text-muted-foreground">
									<Icon
										aria-hidden="true"
										className={line.tone === "warning" ? "mt-0.5 size-4 shrink-0 text-warning" : "mt-0.5 size-4 shrink-0"}
									/>
									{line.text}
								</li>
							);
						})}
					</ul>
				</section>
			) : null}
		</div>
	);
}

// 1200px 이상: 오른쪽 칸(브리프 9절). 목록을 받으면 첫 성우가 골라져 있다(AC8). 화면보다 길면 패널 안에서 스크롤한다
export function VoicePanel({ voice }: { voice: Voice | null }) {
	if (voice === null) return null;
	return (
		<aside
			id={PANEL_ID}
			aria-labelledby="voice-panel-title"
			className="voice-panel-sticky flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border ring-inset"
		>
			<h2 id="voice-panel-title" className="font-bold text-xl">
				{voice.name}
			</h2>
			<VoicePanelContent voice={voice} />
		</aside>
	);
}

// 1199px 이하: 서랍(767px 이하는 전체 화면). 열리면 제목에 포커스가 가고, 닫으면 그 행으로 돌아간다(AC8)
export function VoiceSheet({
	voice,
	open,
	onOpenChange,
	finalFocus,
}: {
	voice: Voice | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	finalFocus: RefObject<HTMLButtonElement | null>;
}) {
	const titleRef = useRef<HTMLHeadingElement>(null);
	return (
		<Sheet open={open && voice !== null} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				initialFocus={titleRef}
				finalFocus={finalFocus}
				className="w-full gap-0 overflow-y-auto md:max-w-md"
			>
				{voice ? (
					<>
						<SheetHeader>
							<SheetTitle ref={titleRef} tabIndex={-1} className="text-xl outline-none">
								{voice.name}
							</SheetTitle>
							<SheetDescription className="sr-only">성우 정보와 기본 샘플</SheetDescription>
						</SheetHeader>
						<div className="px-4 pb-6">
							<VoicePanelContent voice={voice} />
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
```

  - 서랍 너비는 `md:max-w-md`다(767px 이하는 전체 화면, 계획 리뷰 D10).
  - `SheetContent`가 `initialFocus`·`finalFocus`를 넘기는지 Task 8에서 맞췄다. `SheetTitle`이 `ref`를 받지 않으면(생성물이 함수 컴포넌트로 ref를 넘기지 않으면) 제목 대신 닫기 버튼에 첫 포커스를 둔다.
  - 칩은 `chipsOf`가 중복 없이 만든다. 성우 종류 칩은 ElevenLabs에만 생긴다(Typecast·Fish Audio는 `category` null).

- [ ] **Step 5: 검사** — `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm exec biome check --write apps/web/src/components apps/web/src/index.css`. 화면 확인은 Task 12a 뒤에 한다.

### Task 11a: 조건 줄 일반화, 사유 안내, 목록 공용 부품, 배치

**Files:**
- Modify: `apps/web/src/components/voice-conditions.tsx`
- Create: `apps/web/src/components/voice-problem.tsx`(T3 `Problem`·`ReloadButton`·사유 문구를 옮겨 공급자 이름을 받게 한다)
- Create: `apps/web/src/components/voice-list-parts.tsx`(`VoiceShelf`, `ListStatusBar`, `StaleNotice`, `useSearchCommit`, `LIST_QUERY`)
- Create: `apps/web/src/components/casting-workspace.tsx`(행 목록 + 패널 칸/서랍 배치, `useWide`)

**Interfaces:**
- Consumes: Task 9 `Axis`·`ChoiceAxis`·`ToggleAxis`·`Option`, `pickSelected`, `voiceKey`, `receivedText`, `agoText`, `retryTime`, `PROVIDER_LABEL`; Task 10 `VoicePanel`, `VoiceSheet`, `PANEL_ID`; T3 `Notice`·`conditionButton`·`countBadge`·`failureOf`.
- Produces:
  - `voice-conditions.tsx`: `type AxisView = ({ kind: "single" | "multi"; options: Option[]; selected: string[]; onChange: (values: string[]) => void; emptyLabel?; note?; hint? } | { kind: "toggle"; on: boolean; onChange: (on: boolean) => void }) & { key; label; disabled? }`, `VoiceConditions({ search, axes, sort, disabled, selectedCount, searchRef })`. `search = { value, placeholder, label, onChange, onSubmit? }`, `sort = { options, value, onChange, label } | null`.
  - `voice-problem.tsx`: `problemCopy(provider, failure): { title; description; connections; reload }`, `emptyTitle(provider)`, `cooldownText(retryAt)`, `ReloadButton`, `Problem({ provider, failure, reloading, onReload, retryAt?, onClear?, compact? })`.
  - `voice-list-parts.tsx`: `LIST_QUERY`, `useSearchCommit(value, onCommit)`, `VoiceShelf({ title, countLabel, busy?, showAllLabel?, onShowAll?, children })`, `ListStatusBar({ count, countRef, busy, extra?, fetchedAt, refresh })`, `StaleNotice({ provider, fetchedAt, stale, retryAt, reloading, onReload })`.
  - `casting-workspace.tsx`: `useWide(): boolean`, `CastingWorkspace({ voices, chosen, onChoose, pending?, children })`. `children`은 `({ selectedKey, select, panelId }) => ReactNode`이다.

- [ ] **Step 1: 편집 전에 읽기** — craft-floor, 브리프 5·6·8·9절, 지금 `voice-conditions.tsx`·`voice-casting.tsx`(T3).

- [ ] **Step 2: 조건 줄 일반화** — `voice-conditions.tsx`. T3의 검색 칸·'조건' 버튼(767px 이하 접기)은 그대로 두고, 고정 넷(`AXES`) 대신 `axes`를 그린다.
  - **줄바꿈(계획 리뷰 D1):** 조건 묶음은 768px 이상에서도 `flex-wrap`이다(T3의 `md:flex-nowrap md:shrink-0`을 지운다). ElevenLabs 공개 목록은 드롭다운 7 + 토글 1 + 정렬이라 한 줄에 들어가지 않는다. 검색 칸은 `xl:w-72`(약 280px, 브리프 5절)다.
  - **여럿 고르기(`multi`)**: T3 `FilterMenu` 그대로(`DropdownMenuCheckboxItem`, 눌러도 닫히지 않음). `note`가 있으면 목록 맨 위에 회색 작은 글자(`p.px-2.py-1.5.text-muted-foreground.text-xs`)로 보인다('모두 포함').
  - **하나 고르기(`single`)**: `DropdownMenuRadioGroup value={selected[0] ?? ""} onValueChange={(v) => onChange(v ? [v] : [])}`. 맨 위 항목은 `value=""`이고 이름은 `emptyLabel ?? "전체"`이다. 항목은 `DropdownMenuRadioItem closeOnClick`(Base UI 기본 false)이다.
    - 선택지가 비고 `hint`가 없으면(억양을 받는 중) 버튼을 누를 수 없다.
    - `hint`가 있으면(억양 목록 조회 실패) 버튼을 누를 수 있고, 열린 목록에 회색 작은 글자로 사유를 보인다(계획 리뷰 D23).
  - **토글(`toggle`)**: 테두리 칩 버튼 `size="lg"`(44px), `aria-pressed={on}`. 켜지면 앞에 `Check` 아이콘과 `border-primary bg-primary-subtle text-primary`(T3 `conditionButton(1)`과 같은 칠, 계획 리뷰 D18).
  - **버튼 글자(브리프 5절)**:
    - 고른 값 없음: 이름표만.
    - 하나: '언어 · 한국어'.
    - 여럿: 하나면 '콘텐츠 · 광고', 둘 이상이면 '콘텐츠 · 2'.
    - 값이 든 글자 부분은 `max-w-40 truncate`로 너비를 묶는다('콘텐츠 · 캐릭터·애니메이션'이 줄을 흔들지 않게, 계획 리뷰 D1). 전체 글자는 접근 이름에 있다.
    - 접근 이름: 고른 값이 있으면 "{이름표}, {값 이름 또는 N개} 선택됨".
    - 칠은 T3 `conditionButton`이다. T3의 숫자 배지(`countBadge`)는 '조건' 버튼에만 남긴다.
  - **정렬(`sort`)**: 768px 이상은 줄 오른쪽 끝(`md:ml-auto`)의 하나 고르기 드롭다운이다. 글자는 '정렬: {이름}'이고 '전체' 항목이 없다. 칠은 늘 기본(정렬은 조건 수에 넣지 않는다). 767px 이하는 '조건' 버튼이 펼치는 묶음의 맨 끝에 둔다(계획 리뷰 U5).
  - **'조건' 버튼 배지**는 `selectedCount`(서버 목록은 `conditionCount`, Typecast는 고른 값 수)다.
  - **검색 칸**: `search.placeholder`·`search.label`을 받는다. Enter를 누르면 `search.onSubmit?.()`, Esc는 지금처럼 지운다.
  - **인원 글자(`summary`)는 조건 줄에서 뺀다.** 세 탭 모두 상태 줄 왼쪽에 둔다(`ListStatusBar`, 계획 리뷰 D9).
  - **잠금(`disabled`)**: 처음 불러오는 중에만 넘긴다(계획 리뷰 D4. 오류일 때는 열어 두어 조건을 바꿔 빠져나갈 수 있다).

- [ ] **Step 3: 사유 안내 옮기기** — `voice-problem.tsx`. T3 `voice-casting.tsx`의 `ProblemCopy`·`PROBLEM`·`ReloadButton`·`Problem`을 옮기고, 문구의 "Typecast"를 공급자 이름(`PROVIDER_LABEL`)으로 바꾼다(브리프 8절 표 그대로). 한도 부족 설명은 "남은 사용량을 연결 상태에서 확인해 주세요."(브리프 T4판)다. 더한다:
  - `emptyTitle(provider)`: "{공급자}가 준 공개 성우가 없어요".
  - `cooldownText(retryAt)`: "요청이 많아 {retryTime(retryAt)} 이후 다시 불러올 수 있어요."(브리프 8절).
  - `Problem`의 `retryAt`이 지금보다 뒤면(요청 제한인데 지난 목록이 없음) 설명을 `cooldownText`로 바꾸고 '다시 불러오기'를 그 시각까지 누를 수 없게 한다(`focusableWhenDisabled`, 계획 리뷰 D15).
  - `onClear`가 있으면 '조건 모두 해제' 버튼을 함께 둔다(조건이 시작값이 아닐 때 서버 목록이 넘긴다, 계획 리뷰 D4).
  - `compact`이면 '전체' 탭 묶음용 작은 판이다(계획 리뷰 D7): 아이콘 없이 `rounded-xl p-4 ring-1 ring-border ring-inset` 상자 하나에 `h3` 제목(굵게), 설명, 버튼을 담는다. 문구는 같다.

- [ ] **Step 4: 목록 공용 부품** — `voice-list-parts.tsx`(서버 목록·Typecast 탭·'전체' 탭이 함께 쓴다, ponytail):

```tsx
"use client";

import type { ProviderFailure, ProviderId } from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { ArrowRight, RefreshCw } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import { agoText, receivedText } from "@/lib/voice-view";

import { cooldownText, problemCopy } from "./voice-problem";

export const LIST_QUERY = {
	// 받은 목록은 탭을 닫을 때까지 쓴다. 서버 목록 캐시(24시간)가 따로 있어 새로 고침해도 공급자를 부르지 않는다(AC11)
	staleTime: Number.POSITIVE_INFINITY,
	gcTime: Number.POSITIVE_INFINITY,
	retry: false,
	retryOnMount: false,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
	networkMode: "always",
	meta: { toast: false },
} as const;

// 검색어 보내기(스펙 6절 6): 입력이 0.5초 멈추거나 Enter(submit)일 때 onCommit을 부른다.
// 밖에서 값이 바뀌면('모두 보기 →', 조건 모두 해제) 칸도 따라간다
export function useSearchCommit(value: string, onCommit: (value: string) => void) {
	const [draft, setDraft] = useState(value);
	const [synced, setSynced] = useState(value);
	if (synced !== value) {
		setSynced(value);
		setDraft(value);
	}
	useEffect(() => {
		if (draft === value) return;
		const id = setTimeout(() => onCommit(draft), 500);
		return () => clearTimeout(id);
	}, [draft, value, onCommit]);
	return {
		draft,
		setDraft,
		submit: () => {
			if (draft !== value) onCommit(draft);
		},
	};
}

// 묶음(Typecast 콘텐츠별 묶음, '전체' 탭 공급자 묶음): h2 이름, 회색 인원(받는 중이면 작은 진행 표시), 오른쪽 끝 '모두 보기 →', 그 아래 행 목록
export function VoiceShelf({
	title,
	countLabel,
	busy,
	showAllLabel,
	onShowAll,
	children,
}: {
	title: string;
	countLabel: string | null;
	busy?: boolean;
	showAllLabel?: string;
	onShowAll?: () => void;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-baseline gap-x-2">
				<h2 className="font-bold text-xl">{title}</h2>
				{busy ? <Spinner aria-hidden="true" className="size-4 self-center" /> : null}
				{countLabel ? <span className="text-muted-foreground text-sm tabular-nums">{countLabel}</span> : null}
				{onShowAll ? (
					<Button variant="link" size="lg" className="ml-auto px-0" aria-label={showAllLabel} onClick={onShowAll}>
						모두 보기 <ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Button>
				) : null}
			</div>
			{children}
		</section>
	);
}

// 상태 줄(브리프 5절, 계획 리뷰 D3·D9·D17): 왼쪽 인원 글자(받는 중이면 작은 진행 표시)와 덧붙일 링크, 오른쪽 '목록 새로 고침'과 받은 시각.
// 받는 중에도 늘 그린다(버튼과 포커스가 사라지지 않는다. '모두 보기 →' 뒤 포커스가 인원 글자로 온다)
export function ListStatusBar({
	count,
	countRef,
	busy,
	extra,
	fetchedAt,
	refresh,
}: {
	count: string;
	countRef?: Ref<HTMLParagraphElement>;
	busy: boolean;
	extra?: ReactNode;
	fetchedAt: string | null;
	refresh: { onRefresh: () => void; disabled: boolean };
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
			<div className="flex flex-wrap items-center gap-x-3">
				{busy ? <Spinner aria-hidden="true" className="size-4" /> : null}
				<p ref={countRef} role="status" tabIndex={-1} className="text-muted-foreground tabular-nums outline-none">
					{count}
				</p>
				{extra}
			</div>
			<div className="flex flex-wrap items-center gap-x-2">
				<Button
					variant="link"
					size="lg"
					className="px-0"
					focusableWhenDisabled
					disabled={refresh.disabled}
					onClick={refresh.onRefresh}
				>
					<RefreshCw data-icon="inline-start" aria-hidden="true" />
					목록 새로 고침
				</Button>
				{fetchedAt ? (
					<span className="text-muted-foreground text-sm tabular-nums">{receivedText(fetchedAt, new Date())}</span>
				) : null}
			</div>
		</div>
	);
}

// 안내 줄(브리프 8절): 지난 목록이면 받은 시각과 사유, 대기 시각이 지금보다 뒤면 대기 문구. '다시 불러오기'는 대기 시각까지 누를 수 없다
export function StaleNotice({
	provider,
	fetchedAt,
	reason,
	retryAt,
	reloading,
	onReload,
}: {
	provider: ProviderId;
	fetchedAt: string;
	reason: ProviderFailure;
	retryAt: string | null;
	reloading: boolean;
	onReload: () => void;
}) {
	const waiting = retryAt !== null && Date.parse(retryAt) > Date.now();
	const text = waiting
		? cooldownText(retryAt)
		: `${PROVIDER_LABEL[provider]}에 연결하지 못해 ${agoText(fetchedAt, new Date())} 전에 받은 목록을 보여 드려요. ${problemCopy(provider, reason).description}`;
	return (
		<div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-subtle px-4 py-3 text-warning">
			<p className="flex-1">{text}</p>
			<Button variant="outline" size="lg" focusableWhenDisabled disabled={reloading || waiting} onClick={onReload}>
				다시 불러오기
			</Button>
		</div>
	);
}
```

  - `failureOf`의 이름과 위치(T3 `lib/voice-failure.ts`)를 그대로 쓴다. `problemCopy`·`cooldownText`는 Step 3에서 만든다.

- [ ] **Step 5: 배치(행 목록 + 패널)** — `casting-workspace.tsx`:

```tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { type ReactNode, useRef, useState, useSyncExternalStore } from "react";

import { pickSelected, voiceKey } from "@/lib/voice-view";

import { PANEL_ID, VoicePanel, VoiceSheet } from "./voice-panel";

const WIDE = "(min-width: 75rem)";
const subscribe = (callback: () => void) => {
	const media = matchMedia(WIDE);
	media.addEventListener("change", callback);
	return () => media.removeEventListener("change", callback);
};
// 1200px 이상이면 패널이 오른쪽 칸이고, 아래면 서랍이다(브리프 9절, --breakpoint-xl과 같은 75rem). 서버 렌더는 넓은 화면으로 본다
export function useWide(): boolean {
	return useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => true);
}

type Select = (voice: Voice, row: HTMLButtonElement) => void;

// 행 목록(children)과 성우 패널. 넓은 화면은 고른 성우(없거나 사라지면 첫 성우)를 칸에 보인다.
// 좁은 화면은 행을 누를 때만 서랍을 열고 닫으면 그 행으로 포커스를 돌린다(AC8). 처음 선택이 서랍을 저절로 열지 않는다.
// 첫 로딩·오류·빈 상태에도 두 칸 배치를 유지한다. 패널 자리는 받는 중이면 뼈대, 그 밖에는 비운다(계획 리뷰 D13)
export function CastingWorkspace({
	voices,
	chosen,
	onChoose,
	pending,
	children,
}: {
	voices: Voice[];
	chosen: string | null;
	onChoose: (key: string) => void;
	pending?: boolean;
	children: (props: { selectedKey: string | null; select: Select; panelId?: string }) => ReactNode;
}) {
	const wide = useWide();
	const [sheetOpen, setSheetOpen] = useState(false);
	const rowRef = useRef<HTMLButtonElement | null>(null);
	const selectedKey = wide ? pickSelected(voices, chosen) : sheetOpen ? chosen : null;
	const selected = voices.find((voice) => voiceKey(voice) === selectedKey) ?? null;
	const select: Select = (voice, row) => {
		onChoose(voiceKey(voice));
		if (!wide) {
			rowRef.current = row;
			setSheetOpen(true);
		}
	};
	return (
		// 약 62:38(시안). 8칸 중 5·3
		<div className="flex flex-col gap-6 xl:grid xl:grid-cols-8 xl:items-start">
			<div className="min-w-0 xl:col-span-5">
				{children({ selectedKey, select, panelId: wide && selected ? PANEL_ID : undefined })}
			</div>
			{wide ? (
				<div className="xl:col-span-3">
					{selected ? (
						<VoicePanel voice={selected} />
					) : pending ? (
						<Skeleton className="h-96 w-full rounded-2xl" />
					) : null}
				</div>
			) : (
				<VoiceSheet voice={selected} open={sheetOpen} onOpenChange={setSheetOpen} finalFocus={rowRef} />
			)}
		</div>
	);
}
```

  (서랍이 열린 동안 목록이 바뀌어 그 성우가 사라지면 `selected`가 null이라 `VoiceSheet`가 `open && voice !== null`로 닫힌다.)

- [ ] **Step 6: 검사(관문)** — `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm exec biome check --write apps/web/src/components`. 아직 쓰는 화면이 없으므로 화면 확인은 Task 12a 뒤에 한다.

### Task 11b: ElevenLabs·Fish Audio 서버 목록

**Files:**
- Create: `apps/web/src/components/server-voice-list.tsx`

**Interfaces:**
- Consumes: Task 9 `ServerList`, `axesOf`, `sortOf`, `conditionCount`, `isInitial`, `initialList`, `inputOf`, `firstPage`, `withSearch`, `ACCENT_KO`, `flattenPages`, `countText`, `listEnd`, `retryAtOf`; T3 `failureOf`, `LoopbackNotice`, `Notice`; Task 10 `VoiceRow`; Task 11a 전부; Task 7 프로시저.
- Produces: `ServerVoiceList({ list, onListChange, chosen, onChoose, focusSignal })`, `useListRefresh(provider)`, `serverListOptions(list)`(`infiniteOptions` 인자. '전체' 탭 묶음이 같은 인자로 같은 키를 쓴다, 계획 리뷰 E15).

- [ ] **Step 1: 편집 전에 읽기** — craft-floor, 브리프 5·8·9절, `apps/web/node_modules/@orpc/tanstack-query/dist/index.d.mts`의 `infiniteOptions`와 `key()`(부분 입력으로 키를 만든다. 계획 리뷰가 `index.d.mts:101`·`index.mjs:204`로 확인), 설치본 TanStack Query `keepPreviousData`·`InfiniteData`.

- [ ] **Step 2: 서버 목록** — `server-voice-list.tsx`. 핵심 로직:

```tsx
"use client";

import {
	type InfiniteData,
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ProviderId, VoiceListResult } from "@tts-pilot-app/api/providers/contract";
import { useEffect, useRef, useState } from "react";
// (Button, Skeleton, cn, Task 9·10·11a import)

// 목록 쿼리 인자. '전체' 탭 묶음이 같은 인자를 써서 브라우저 키가 같다(계획 리뷰 E15)
export const serverListOptions = (list: ServerList) =>
	orpc.voiceList.infiniteOptions({
		input: (page: number | string | null) => inputOf(list, page),
		initialPageParam: firstPage(list),
		getNextPageParam: (last) => last.next,
		// 조건을 바꿔 다시 받는 동안 지금 목록을 흐리게 둔다(브리프 8절)
		placeholderData: keepPreviousData,
		...LIST_QUERY,
		throwOnError: (error) => failureOf(error) === null,
	});

// '목록 새로 고침'(스펙 5절, 계획 리뷰 D3·E14): 서버가 그 공급자 캐시를 만료로 바꾸면, 그 공급자의 브라우저 목록을 첫 페이지만 남기고 무효로 한다.
// 보고 있는 목록은 첫 페이지만 다시 받는 동안 그대로 보인다('다시 받는 중'). 억양 쿼리는 입력에 공급자가 없어 건드리지 않는다.
export function useListRefresh(provider: ProviderId) {
	const queryClient = useQueryClient();
	// 탭 내용이 남아 있으므로(keepMounted) 탭을 오가도 대기 시각이 남는다(계획 리뷰 D14)
	const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
	const mutation = useMutation(
		orpc.voiceListRefresh.mutationOptions({
			meta: { toast: false },
			onSuccess: ({ retryAt }) => {
				setBlockedUntil(retryAt);
				if (retryAt) return;
				const queryKey = orpc.voiceList.key({ input: { provider } });
				for (const [key, data] of queryClient.getQueriesData<InfiniteData<VoiceListResult>>({ queryKey })) {
					// 무한 목록만 자른다(Typecast는 한 페이지 쿼리라 그대로 다시 받는다)
					if (data && "pages" in data) {
						queryClient.setQueryData(key, { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) });
					}
				}
				void queryClient.invalidateQueries({ queryKey });
			},
		}),
	);
	return { refresh: () => mutation.mutate({ provider }), pending: mutation.isPending, blockedUntil };
}

export function ServerVoiceList({
	list,
	onListChange,
	chosen,
	onChoose,
	focusSignal,
}: {
	list: ServerList;
	onListChange: (list: ServerList) => void;
	chosen: string | null;
	onChoose: (key: string) => void;
	// 부모가 늘리면 인원 글자로 포커스를 옮긴다('전체' 탭 '모두 보기 →', 계획 리뷰 D8)
	focusSignal: number;
}) {
	const countRef = useRef<HTMLParagraphElement>(null);
	useEffect(() => {
		if (focusSignal > 0) countRef.current?.focus();
	}, [focusSignal]);
	const search = useSearchCommit(list.query.search, (value) => onListChange(withSearch(list, value)));
	const voices = useInfiniteQuery(serverListOptions(list));
	const language = list.query.language;
	const accents = useQuery(
		orpc.voiceAccents.queryOptions({
			input: { language: language ?? "ko" },
			enabled: list.provider === "elevenlabs" && language !== null,
			...LIST_QUERY,
		}),
	);
	const { refresh, pending, blockedUntil } = useListRefresh(list.provider);
	// … 아래 상태별 그리기
}
```

  그리기 규칙(브리프 5·8절):
  - **조건 줄:** `axesOf(list, accentOptions)`를 `AxisView`로 옮긴다(하나·여럿: `onChange: (values) => onListChange(axis.apply(values))`, 토글: `onChange: (on) => onListChange(axis.apply(on))`).
    - `accentOptions = accents.data?.accents.map(({ value, name }) => ({ value, label: language === "ko" ? (ACCENT_KO.get(value) ?? name) : name })) ?? []`. 억양 조회가 실패하면 억양 축에 `hint: problemCopy(…).description`을 붙인다(계획 리뷰 D23).
    - 정렬은 `sortOf(list)`이고 `onChange`는 `onListChange(sort.apply(value))`다.
    - 검색 칸 안내 문구: ElevenLabs '이름·설명으로 찾기', Fish Audio '제목으로 찾기'. 접근 이름: '성우 이름·설명으로 찾기', '성우 제목으로 찾기'. 값은 `search.draft`, Enter는 `search.submit`.
    - `selectedCount = conditionCount(list)`.
    - 잠금: 첫 페이지가 없고 받는 중일 때만(계획 리뷰 D4).
  - **상태 줄(`ListStatusBar`, 늘 그린다):**
    - `count`: `countText({ provider, source, language, total, totalExact })`(첫 페이지가 없으면 total null이라 "ElevenLabs 한국어 라이브러리"처럼 수 없이). 767px 이하에서 정렬이 시작값이 아니면 뒤에 " · {정렬 이름}"을 붙인다(`md:hidden` 글자, 계획 리뷰 U5).
    - `busy`: 다시 받는 중(`isFetching && !isFetchingNextPage`)이다. 새로 고침도 같은 표시다(계획 리뷰 D3).
    - `fetchedAt`: 첫 페이지의 `fetchedAt`.
    - 새로 고침 `disabled`: `pending` 또는 `isFetching` 또는 `blockedUntil`이 지금보다 뒤일 때.
    - `countRef`를 넘긴다(위 `focusSignal`).
  - **안내 줄(`StaleNotice`):** 첫 페이지 `stale`이 있거나 `blockedUntil`이 지금보다 뒤일 때. `retryAt`은 `stale.retryAt ?? blockedUntil`이고, 지난 목록 없이 대기만 있으면 `reason`은 `rate_limit`, `fetchedAt`은 첫 페이지의 것이다. '다시 불러오기'는 이 쿼리만 첫 페이지로 잘라 다시 받는다(`useListRefresh`와 같은 자르기 후 `refetch()`). 이어 붙인 페이지를 모두 다시 부르지 않는다.
  - **본문(`CastingWorkspace`, voices = `flattenPages(data.pages)`, `pending` = 첫 로딩):**
    - 첫 페이지가 없고 오류: `failureOf` → `Problem`(`retryAt = retryAtOf(error)`, 시작값이 아니면 `onClear = () => onListChange(initialList(provider, source))`). `unauthorized`면 T3 `LoopbackNotice`이고 탭·조건 줄 대신이다(Task 12a에서 페이지 전체를 바꾼다).
    - 첫 로딩: 행 자리 `Skeleton` 5줄(`h-17`)과 `sr-only role="status"` "성우 목록을 불러오고 있어요". 패널 자리는 `CastingWorkspace`가 뼈대로 둔다.
    - 0명이고 조건이 시작값(`isInitial`): 공개면 `emptyTitle(provider)` + '다시 불러오기'. 내 계정이면 Notice "{공급자} 계정에 성우가 없어요"와 설명 "{공급자} 웹에서 만들거나 저장한 성우가 여기에 보여요."
    - 0명이고 조건 있음: T3 "조건에 맞는 성우가 없어요" + '조건 모두 해제'. 해제는 `onListChange(initialList(provider, source))`이고 포커스는 검색 칸으로 간다.
    - 행 목록: `<ul aria-label="{공급자} 성우 목록" className="@container divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-border ring-inset">`의 `li.voice-row`마다 `VoiceRow`(`panelId` 전달). `isPlaceholderData`면 `opacity-60`과 `inert`로 누를 수 없게 한다.
  - **목록 끝(`listEnd(마지막 페이지)`):**
    - `more`: 가운데 테두리 버튼 '더 보기'(`size="lg"`). 옆 회색 글자는 `{보인 수} / {total}명`(total이 null이면 `{보인 수}명`, 정확하지 않으면 `{보인 수} / {total}명 이상`).
      - 받는 중이거나 조건을 바꿔 다시 받는 중(`isPlaceholderData`)이면 누를 수 없다(버튼 안 `Spinner`, 포커스 유지, 계획 리뷰 E13).
      - 누르면 `fetchNextPage()` 뒤 새로 붙은 첫 행의 고르기 버튼으로 포커스를 옮긴다(브리프 9절). 붙기 전 수를 기억하고, 목록 `ul`의 그 순번 `li`에서 `querySelector("[data-select]")`로 고르기 버튼을 찾는다(Task 10 `VoiceRow`가 달아 둔 표지).
      - 다음 페이지가 실패하면(`isFetchNextPageError`) 버튼 위에 `role="alert"` `text-warning text-sm` "다음 성우를 불러오지 못했어요. {problemCopy(…).description}"을 보이고, 같은 버튼으로 다시 시도한다('스펙과 다른 점' 4, 계획 리뷰 D16).
    - `limit`: 회색 안내 "Fish Audio는 조건마다 처음 1,000명까지만 보여 줘요. 조건을 좁혀 보세요."
    - `end`: 아무것도 없다.
  - **배치:** 조건 줄 → 상태 줄 → 안내 줄 → `CastingWorkspace`.

- [ ] **Step 3: 검사(관문)** — `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm exec biome check --write apps/web/src/components`. 화면 확인은 Task 12a 뒤에 한다.

### Task 12a: 탭·출처와 Typecast 탭

**Files:**
- Modify(다시 씀): `apps/web/src/components/voice-casting.tsx`
- Create: `apps/web/src/components/typecast-voice-list.tsx`(T3 화면 로직을 행으로 옮김)

**Interfaces:**
- Consumes: Task 8 `Tabs`·`TabsList`·`TabsTrigger`·`TabsContent`·`ToggleGroup`·`ToggleGroupItem`; Task 9·10·11a·11b 모두; T3 `voice-filter.ts`(`filterVoices`, `filterOptions`, `groupByUseCase`, `hasConditions`, `EMPTY_FILTERS`, `labelOf`, `USE_CASE_LABEL`), `LoopbackNotice`, `SamplePlayerProvider`.
- Produces: `VoiceCasting`(페이지가 쓰는 그대로의 이름), `TypecastVoiceList({ state, onStateChange, chosen, onChoose, focusSignal })`.

- [ ] **Step 1: 편집 전에 읽기** — craft-floor, 브리프 3·5·9절, 승인 시안, shadcn `rules/composition.md`의 Tabs 절.

- [ ] **Step 2: Typecast 탭** — `typecast-voice-list.tsx`. T3 `voice-casting.tsx`의 조회 설정(`LIST_QUERY`와 `throwOnError`)과 상태(`query`, `filters`, `showAll`, `retrying`, `useDeferredValue` 셋)를 옮기되, `query`·`filters`·`showAll`은 부모가 든다('전체' 탭 '모두 보기 →'가 검색어를 넘긴다).
  - 결과 모양이 바뀌었다: `voices.data.voices`는 그대로, 받은 시각은 `voices.data.fetchedAt`, 지난 목록은 `voices.data.stale`이다(Task 11a `StaleNotice`).
  - 조건 줄은 일반화한 `VoiceConditions`에 T3 넷(모델·성별·연령·콘텐츠, 모두 `multi`)을 `AxisView`로 넘긴다. 검색 칸 안내 문구 '이름으로 찾기', 접근 이름 '성우 이름으로 찾기'. 정렬은 `null`. 잠금은 처음 불러오는 중에만이다.
  - **상태 줄(`ListStatusBar`, 계획 리뷰 D9):** 왼쪽 인원 글자는 T3 문구 그대로("Typecast 성우 614명" 또는 "Typecast 성우 614명 중 38명")이고, `extra`에 T3 링크 묶음('조건 모두 해제'·'콘텐츠별로 보기'·'전체 보기')을 둔다. 오른쪽은 '목록 새로 고침'(`useListRefresh("typecast")`)과 받은 시각이다. `focusSignal`로 인원 글자에 포커스를 옮긴다.
  - **선반 → 행 묶음:** T3 `Shelf`를 `VoiceShelf`로 바꾼다(제목 콘텐츠 이름, `countLabel` "{n}명", 6명 이상이면 '모두 보기 →'와 접근 이름 "{콘텐츠} 모두 보기"). 카드 가로 줄 대신 `ul.@container.divide-y.rounded-2xl.bg-card.ring-1.ring-border.ring-inset`에 앞 5명의 `VoiceRow`다. '콘텐츠 정보 없음' 묶음은 T3처럼 전원이다. 결과 격자는 같은 행 목록 하나다(`li.voice-row`).
  - 패널: `CastingWorkspace`에 보이는 순서의 성우 목록을 넘긴다. 묶음 보기는 묶음 순서대로 펼친 목록이고 같은 성우는 처음 것만이다(`flattenPages([{ voices: … }])` 재사용). 결과 보기는 결과 목록이다. 첫 로딩이면 `pending`.

- [ ] **Step 3: 탭과 출처** — `voice-casting.tsx`를 다시 쓴다(이 태스크에서는 '전체' 탭 없이 세 공급자 탭으로 시작하고, Task 12b가 '전체' 탭을 더하고 처음 탭을 '전체'로 바꾼다):

```tsx
"use client";

// (import: Tabs·TabsList·TabsTrigger·TabsContent, ToggleGroup·ToggleGroupItem, useInfiniteQuery·useQuery, orpc, Task 9~11 모듈, SamplePlayerProvider, LoopbackNotice)

type Tab = "all" | ProviderId;
type ServerTab = "elevenlabs" | "fish_audio";

export function VoiceCasting() {
	const [tab, setTab] = useState<Tab>("typecast");
	// 탭마다 조건·출처·고른 성우를 따로 든다(같은 페이지 안, 브리프 9절). 탭 내용은 keepMounted라 검색 칸·대기 시각도 남는다
	const [sources, setSources] = useState<Record<ServerTab, VoiceSource>>({ elevenlabs: "public", fish_audio: "public" });
	const [lists, setLists] = useState<Record<`${ServerTab}:${VoiceSource}`, ServerList>>(() => ({
		"elevenlabs:public": initialList("elevenlabs", "public"),
		"elevenlabs:account": initialList("elevenlabs", "account"),
		"fish_audio:public": initialList("fish_audio", "public"),
		"fish_audio:account": initialList("fish_audio", "account"),
	}));
	const [typecast, setTypecast] = useState({ query: "", filters: EMPTY_FILTERS, showAll: false });
	const [chosen, setChosen] = useState<Record<string, string | null>>({});
	// '모두 보기 →'가 늘려 그 탭 인원 글자로 포커스를 옮긴다(계획 리뷰 D8)
	const [focusSignals, setFocusSignals] = useState<Record<ProviderId, number>>({ typecast: 0, elevenlabs: 0, fish_audio: 0 });
	// 탭 이름의 'Typecast 614'(받은 뒤 인원). Typecast 탭과 같은 키라 따로 부르지 않는다
	const typecastList = useQuery(orpc.voiceList.queryOptions({ input: { provider: "typecast" }, ...LIST_QUERY, enabled: false }));
	…
}
```

  - **탭 줄(`TabsList`, 밑줄 탭, 브리프 5절·계획 리뷰 D6):**
    - `TabsTrigger` 셋(12b에서 '전체'를 맨 앞에 더함): 'Typecast' + 받은 뒤 회색 작은 인원, 'ElevenLabs', 'Fish Audio'.
    - 모양: 탭 줄 아래 경계선 한 줄(`border-b`). 고른 탭은 `text-primary font-bold`와 2px 청록 밑줄, 나머지는 `text-muted-foreground font-normal`. 항목 높이 `min-h-11`. Task 8 생성물에 `line` 변형이 있으면 그것, 없으면 `data-[active]:` 클래스로 준다.
    - 767px 이하는 탭 줄이 가로로 넘어간다(`overflow-x-auto`, 페이지는 넘치지 않음).
    - 방향키 이동은 Base UI Tabs가 한다(`activateOnFocus` 기본 false라 Enter·Space로 연다, 브리프 9절).
    - 탭별 스크롤 위치는 기억하지 않는다(사용자 결정 2026-10-04).
  - **출처 전환(ElevenLabs·Fish Audio 탭, 탭 줄 아래, 계획 리뷰 D6):**
    - `ToggleGroup value={[sources[p]]} onValueChange={(v) => v[0] && setSources(…)}`(Base 문법, 하나 고르기, 빈 선택 막음).
    - 모양: `bg-muted rounded-lg p-1` 바탕, 고른 칸은 `bg-card ring-1 ring-border font-bold`, 나머지는 `text-muted-foreground font-normal`. 항목 높이 `min-h-11`.
    - 항목: '공개 라이브러리', '내 계정' + 받은 뒤 회색 인원. 인원은 그 출처 목록의 첫 페이지 `total`이다. `useInfiniteQuery({ ...serverListOptions(lists[…]), enabled: false })`로 캐시만 읽는다.
    - 접근 이름은 보이는 글자다.
  - **`TabsContent`마다 `keepMounted`**('계획에서 정한 것' 탭 내용 유지):
    - typecast → `TypecastVoiceList state={typecast} onStateChange={setTypecast} chosen={chosen.typecast ?? null} onChoose={…} focusSignal={focusSignals.typecast}`
    - elevenlabs·fish_audio → 출처 전환 + `ServerVoiceList key={`${p}:${source}`} list={lists[…]} onListChange={(l) => setLists(…)} chosen={chosen[`${p}:${source}`] ?? null} onChoose={…} focusSignal={focusSignals[p]}`
    - `key`로 출처마다 검색 칸 상태가 따로다.
  - **소유자 없음:** 어느 조회든 `failureOf(error) === "unauthorized"`면 T3처럼 탭·조건 줄 대신 `LoopbackNotice title="이 주소에서는 성우 목록을 불러올 수 없어요"` 하나다. 판정은 Typecast 쿼리 오류로 한다(처음 화면이 늘 받는다). 다른 목록에서 나는 `unauthorized`는 각 목록이 같은 안내를 본문에 보인다.
  - 전체를 `SamplePlayerProvider`로 감싼다(탭을 바꾸면 그 탭의 행이 숨어도 재생은 이어진다. 페이지를 떠나면 멈춘다. T3 그대로).

- [ ] **Step 4: 검사(관문)** — `pnpm --filter web check-types`, `pnpm --filter web test`, `pnpm exec biome check --write apps/web/src/components`. 그다음 **코디네이터 화면 확인(흉내 응답)**: 메인 세션이 "구현 뒤"의 흉내 스크립트로 `/casting`을 1440·1200·1024·390에서 열어 세 탭·출처·조건(줄바꿈)·'더 보기'·패널·서랍·샘플·새로 고침('다시 받는 중')이 브리프대로 도는지 보고, 실제 조회 0을 서버 로그로 확인한다. `bts-implementer`는 하지 않는다.

### Task 12b: '전체' 탭과 마무리

**Files:**
- Create: `apps/web/src/components/all-providers.tsx`('전체' 탭)
- Modify: `apps/web/src/components/voice-casting.tsx`('전체' 탭 더하기, 처음 탭)
- Modify: `apps/web/src/app/(app)/casting/page.tsx`(설명 문구)
- Modify: `apps/web/src/index.css`(`.voice-card` 지움)
- Delete: `apps/web/src/components/voice-card.tsx`

**Interfaces:**
- Consumes: Task 9 `bundleOf`, `initialList`, `withSearch`; Task 11a `VoiceShelf`, `useSearchCommit`, `Problem`(`compact`), `StaleNotice`, `CastingWorkspace`; Task 11b `serverListOptions`; T3 `filterVoices`, `EMPTY_FILTERS`.
- Produces: `AllProviders({ search, onSearchChange, onShowProvider, chosen, onChoose })`.

- [ ] **Step 1: '전체' 탭** — `all-providers.tsx`(브리프 5·8절 '전체' 탭, 스펙 AC2, 계획 리뷰 D7):
  - 조건 줄은 검색 칸 하나다(안내 문구 '이름으로 찾기', 접근 이름 '세 공급자 성우 이름으로 찾기'). 입력은 부모가 든 `search`이고 `useSearchCommit`으로 0.5초 멈춤·Enter에 `onSearchChange`를 부른다.
  - 묶음 셋(Typecast → ElevenLabs → Fish Audio), 각 `VoiceShelf`:
    - 제목: 공급자 이름(`PROVIDER_LABEL`). `countLabel`은 `bundleOf(…).countLabel`이다. Typecast는 `{ total: 거른 수, totalExact: true, of: 검색어가 있으면 전체 수 }`, 다른 둘은 첫 페이지의 `{ total, totalExact }`.
    - 받는 중이면 `busy`(머리는 늘 보인다). 본문은 행 자리 `Skeleton` 5줄(`h-17`)이다.
    - '모두 보기 →'(접근 이름 "{공급자} 모두 보기")는 `onShowProvider(provider)`를 부른다.
    - 본문: `bundleOf` 앞 5명의 행(`ul.@container.divide-y.rounded-2xl.bg-card.ring-1.ring-border.ring-inset`).
    - 0명: 회색 한 줄 "조건에 맞는 성우가 없어요"(위 검색 칸의 ×가 해제 수단이라 '조건 모두 해제'가 없다).
    - 지난 목록(`stale`): 묶음 위에 `StaleNotice`.
    - 대기 시각만 있거나 실패: `Problem compact`(같은 문구, 대기면 `retryAt`). 다른 묶음은 그대로다(AC2, REQ-02).
  - 조회:
    - Typecast는 Typecast 탭과 같은 쿼리(`{ provider: "typecast" }`)를 브라우저에서 `filterVoices(all, search, EMPTY_FILTERS)`로 거른다.
    - ElevenLabs·Fish Audio는 `useInfiniteQuery(serverListOptions(withSearch(initialList(p, "public"), 적용된 검색어)))`다. 공급자 탭이 같은 조건이면 브라우저 키가 같아 그 탭을 처음 열 때 다시 받지 않는다(계획 리뷰 E15). 첫 페이지만 보인다.
  - 패널: `CastingWorkspace`에 세 묶음의 앞 5명을 이어 붙여 넘긴다(첫 로딩이면 `pending`).
- [ ] **Step 2: 탭에 더하기** — `voice-casting.tsx`:
  - `TabsTrigger` '전체'를 맨 앞에 더하고 처음 탭을 `"all"`로 바꾼다. '전체' `TabsContent`도 `keepMounted`다.
  - 부모가 `allSearch`를 든다.
  - `onShowProvider(provider)`: 그 탭으로 바꾸고, 공개 출처를 고르고, 그 탭 목록을 `withSearch(initialList(p, "public"), allSearch)`로 바꾼다(계획 리뷰 U4. Typecast는 `{ query: allSearch, filters: EMPTY_FILTERS, showAll: allSearch === "" }`). 그다음 `focusSignals[p]`를 1 늘려 그 탭의 인원 글자로 포커스를 옮긴다(계획 리뷰 D8).
  - 소유자 없음 판정은 '전체' 탭의 Typecast 쿼리 오류로 한다(처음 열리는 탭).
- [ ] **Step 3: 페이지와 CSS** — `casting/page.tsx` 설명을 "Typecast·ElevenLabs·Fish Audio 성우를 찾아 들어 보세요."로 바꾼다(브리프 5절). `index.css`의 `.voice-card` 규칙과 주석을 지운다. `voice-card.tsx`를 지운다(`git grep -n "voice-card\|VoiceCard" apps/web/src`가 0이어야 한다).
- [ ] **Step 4: 검사(19행 관문)** — `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`. `pnpm build`는 메인 세션이 개발 서버 규칙(next-dev-loop)에 맞춰 정한 때에 한다. 그다음 **코디네이터 화면 확인(흉내 응답)**: 1440·1280·1200·1024·768·390·320, 라이트·다크에서 '전체' 탭 묶음 상태(받는 중·0명·지난 목록·한 묶음 실패)와 '모두 보기 →' 포커스를 본다. 실제 조회 0.

### Task 13: `tts-provider` 스킬과 문서

**Files:**
- Modify: `.claude/skills/tts-provider/SKILL.md`(설치본이 `.agents/skills/tts-provider/`에도 있으면 둘이 같은 파일인지 링크인지 확인하고 원본만 고친다)
- Modify: `docs/domain/project.md`, `docs/plans/implementation-roadmap.md`, `docs/briefs/casting.md`(구현과 어긋난 곳만), `docs/research/elevenlabs-api-options.md`(목록 REST 한 줄)

- [ ] **Step 1: `tts-provider`**
  - "구조" 절: "Typecast와 ElevenLabs는 공식 SDK를 쓴다" 뒤에 한 줄을 더한다. "단, ElevenLabs 성우 목록·억양 조회는 REST로 부른다. SDK가 응답 전체를 한 번에 검사해(`parseOrThrow`) 성우 하나의 빠진 필드가 목록 전체를 막기 때문이다(T4). 키는 `xi-api-key` 헤더, 호스트는 `https://api.elevenlabs.io`로 고정한다."
  - "클론 보이스와 공급자 리소스 소유권" 절 첫 항목 뒤에 한 줄을 더한다. "예외(T4, 2026-10-04 사용자 결정): 이 앱은 소유자가 한 명이라(REQ-01) 성우 캐스팅의 '내 계정'에 계정 성우 목록(ElevenLabs `/v2/voices`, Fish Audio `self=true`)을 그대로 보인다. 보이기만 하고, 그 성우로 합성할 수 있는지는 아래 허용 판정(T5)이 정한다. 목록 캐시의 계정 행은 소유자별로 나눈다. 허용 목록이 두 명 이상이 되면(T14 이후) 이 예외의 근거가 사라지므로 '내 계정'을 숨기거나 소유 매핑으로 거른다(로드맵 T14 메모)."
  - "확인한 SDK 동작" 표의 ElevenLabs 판을 2.70.0으로 고치고 "목록 응답 전체 검사(`parseOrThrow`), 검사를 끄는 옵션 없음"을 더한다.
  - "오류 매핑" 아래에 목록 규칙을 더한다.
    - 목록 캐시(`packages/api/src/voice-cache.ts`)는 공급자 실패 때 지난 목록(만료 뒤 7일까지)을 `stale`로 돌려준다. DB가 실패하면 캐시 없이 공급자를 부른다(목록만. 유료 호출은 대기 표 조회가 실패하면 부르지 않는다, T5).
    - 429 `Retry-After`(1시간 상한)는 `provider_cooldown` 표에 적고, 그 전에는 부르지 않는다.
    - Fish Audio 목록의 시간 제한은 20초다.
    - 샘플 주소 허용 호스트는 셋이다: Typecast `*.typecast.ai`, ElevenLabs `storage.googleapis.com`·`*.elevenlabs.io`, Fish Audio `*.fish.audio`.
    - Fish Audio 목록은 `svc`·학습 전·삭제 요청 성우를 응답에서 거르고, 여러 태그·언어는 반복 키이며 모두 포함(AND)이다.
- [ ] **Step 2: `project.md`**
  - 기능 표: '성우 캐스팅'을 세 공급자로 고친다(T4 스펙 링크).
  - 화면 표 `/casting` 행: 탭·출처·성우 패널·'더 보기'·'목록 새로 고침'.
  - API 표:
    - `voiceList`: 입력 유니온, 출력 `stale`, 목록 캐시.
    - `voiceAccents`, `voiceListRefresh` 새 행. 용어 칸은 성우·계정 성우·목록 캐시·기본 샘플·공급자 분류.
  - 데이터 모델 표: `provider_list_cache`(용어: 목록 캐시, 코드 `providerListCache`), `provider_cooldown`(용어: 공급자 대기 시각, 코드 `providerCooldown`).
  - 주요 흐름 그림에 ElevenLabs·Fish Audio 목록을 더한다.
  - 로컬 개발 절이 있으면 "DB 컨테이너(Podman, 5433)가 꺼져 있으면 목록 캐시 없이 동작" 한 줄을 넣는다(없으면 데이터 모델 표 아래 메모).
- [ ] **Step 3: 브리프 맞추기** — 계획 리뷰 반영(2026-10-04)으로 `casting.md` 5~9절은 이미 고쳤다. 구현하면서 브리프와 다르게 된 곳이 있으면 그 절만 고치고 이유를 18행 증거에 적는다.
- [ ] **Step 4: research** — `elevenlabs-api-options.md` 성우 목록 절에 한 줄: "T4 구현은 목록·억양을 REST로 부른다(SDK 응답 전체 검사 때문, T4 계획)."
- [ ] **Step 5: 로드맵** — 4절 표 T4 상태 "진행"(닫을 때 "완료"). 5절 T5 메모에 "T4가 만든 것: `provider_cooldown`, 목록 캐시 모듈 `cachedList`, 성우 패널 `VoicePanelContent`(듣기 자리를 붙일 곳), 공용 `SampleButton`, 재생 키는 샘플 주소." T5·T14의 계획 리뷰 메모(대기 표 조회 실패, 허용 목록 두 명)는 이미 적었다.
- [ ] **Step 6: 검사** — `pnpm agents:check`(스킬 본문을 바꿨으므로), `pnpm exec biome check .`.

---

## 수용 기준과 확인 위치

| AC | 자동 테스트(태스크) | 화면·QA |
|---|---|---|
| AC1 탭과 탭별 상태 | — | Task 12a 상태를 부모가 들고 탭 내용 유지, S1·S2 |
| AC2 '전체' 묶음 | Task 9(`bundleOf`) | Task 12b, S1·S12·S18 |
| AC3 ElevenLabs 공개 조건·인원·억양 | Task 4(쿼리·total·억양 거르기), Task 9(axesOf 언어→억양) | S2 |
| AC4 ElevenLabs 내 계정 | Task 4(출처·커서·조건→쿼리), Task 7(출력 스키마), Task 9(sortOf·termLines 제공 성우) | S4 |
| AC5 Fish Audio 조건·1,000명·내 계정 0명 | Task 5(쿼리·거르기·10페이지·401·5xx·모양), Task 9(countText·listEnd) | S5·S6 |
| AC6 Typecast 행 | 기존 voice-filter 테스트 | S7 |
| AC7 '더 보기'(실패 포함) | Task 9(flattenPages) | S3·S17 |
| AC8 처음 선택·서랍 | Task 9(pickSelected) | S8·S13·S14 |
| AC9 패널 | Task 9(metaLine·pillsOf·chipsOf·termLines·sampleLabel) | S8 |
| AC10 샘플 한 번에 하나 | sample-state 테스트, Task 9(`sampleAriaLabel`) | S8·S16 |
| AC11 캐시·새로 고침 | Task 6(24시간·새로 고침 범위) | S9·S10 |
| AC12 지난 목록 | Task 6(stale·7일 상한), Task 7(격리 지난 목록) | S11 |
| AC13 429 대기 | Task 4(retryAt·1시간 상한), Task 6(대기 표) | S11 |
| AC14 소유자 없음·키 없음 | Task 7(UNAUTHORIZED·no_key, 공급자·DB 0회) | S11 |
| AC15 2계정 격리 | Task 7 `voice-list.isolation.test.ts` | — |
| AC16 너비·테마 | — | S13(1200·320 포함), comp-led 게이트 |
| AC17 키보드·알림 | Task 9(`sampleAriaLabel`) | S14 |
| AC18 번들 | — | "구현 뒤" 19행 번들 grep |
| AC19 메뉴·제목 | — | S15 |

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

Task 1~13이 끝나면 남은 행을 순서대로 한다. 계획 태스크가 아니라 라운드 절차다.

- **흉내 스크립트(scratchpad `mock-casting.js`):** T3 `mock-voices.js` 방식으로 `window.fetch`를 감싸 `/api/rpc/voiceList`, `/api/rpc/voiceAccents`, `/api/rpc/voiceListRefresh`만 흉내 낸다.
  - 성공 응답: `200`과 `{"json": <VoiceListResult>}`. 요청 본문의 `json.provider`·`source`·`page`·`cursor`로 공급자·페이지를 고른다. 공급자마다 3페이지 이상을 만들고 Fish Audio는 10페이지 끝에 `next: null, windowLimited: true`다.
  - 오류 응답: T3 형식(`{"json": {"defined": false, "code": …, "status": …, "data": {"provider", "reason", "retryAt"?}}}`).
  - 시나리오는 URL 해시로 고른다(`#mock=ok|stale|cooldown|el-fail|no_key|unauth|500|empty-account|bad-sample|more-fail|fish-timeout|slow-fish|long`). `more-fail`은 2페이지만 실패, `fish-timeout`은 조건을 하나 더 고르면 `unknown_outcome`, `slow-fish`는 Fish Audio만 5초 늦게, `long`은 긴 이름(40자)과 긴 조건 값 이름이다(계획 리뷰 D24).
  - 순서는 늘 `open --init-script` → `network route "**/api/rpc/**" --abort` → 막혔는지 확인(`window.__mockHits` ≥ 1)이다. 해시만 바꾸면 다시 불러오지 않으므로 `agent-browser reload`를 부른다(교훈 2026-10-04).
  - 성우 데이터는 `tasks/evidence/T04/research/list-probe-2026-10-04.json`의 값 분포로 지어낸 예시다(실제 응답을 저장하지 않는다).
- **6·14·19행:** `pnpm check-types`, `pnpm exec biome check .`, `TEST_DATABASE_URL=… pnpm test`(skipped 0), `pnpm build`. 그다음 번들에 공급자 SDK·DB 모듈·키가 없는지 본다(T3와 같은 `grep`: `.next/static`에서 `elevenlabs-js`, `typecast-js`, `drizzle-orm`, `pg`, `xi-api-key`, `Bearer` 0건). AC18.
- **10행 db 리뷰:** Task 2·6 파일(`provider-cache.ts`, 생성 SQL, `createDb`, `voice-cache.ts`, `test-db.ts`)을 `bts-reviewer(db)`에 넘긴다. 확인할 것:
  - `NULLS NOT DISTINCT`와 upsert의 `target`이 맞는지
  - 정리 쿼리와 지난 목록 7일 상한의 범위
  - 소유자 조건
  - JS 시각을 쓰는 이유(테스트), 연결 시간 제한 3초
- **15행 code 리뷰 + security 행:** Task 3~7 diff를 `bts-reviewer(code)`, `ponytail-review`, `bts-reviewer(security)`에 넘긴다. security의 `tts-provider` 항목:
  - 목록·억양·새로 고침을 부를 수 있는 주체: `protectedProcedure`. 소유자가 없으면 공급자·DB 0회.
  - 키 노출: 결과 JSON, `ORPCError` data·cause, 로그, `[voiceCache]` 로그의 SQL·연결 문자열, 클라이언트 청크.
  - 계정 성우 캐시 행의 소유자 격리(입력에 소유자가 없음).
  - 입력 검증: 조건 값 정규식·길이·개수, 페이지 상한, 커서 길이, 억양 선택지 거르기.
  - 오디오 `src`에 들어가는 주소: https와 공급자 호스트.
  - 재시도 없음과 시간 제한(Fish Audio 20초), `Retry-After` 1시간 상한.
  - ElevenLabs REST 전환으로 SDK 기본 재시도·`process.env` 대체가 사라졌는지.
- **16행:** 메인 세션에서 `.agents/skills/impeccable/scripts/impeccable context --target "apps/web/src/app/(app)/casting/page.tsx"`를 다시 실행해 요약한다(설계 단계 결과와 같으면 그렇게 적는다).
- **comp-led 게이트(Task 12b 뒤, 메인 세션, 18행):**
  - 시작: `impeccable build-phase start --comp .impeccable/mocks/decision/t4-casting-audition.png --artifact "apps/web/src/app/(app)/casting/page.tsx"`. T3의 열린 단계가 남아 막으면 그 안내대로 닫거나 새로 시작한다. `.impeccable/build/`의 T3 파일은 지우지 않고 안내를 따른다.
  - spec: `comp-spec`로 regions를 만든다. 영역은 메뉴, 머리, 탭 줄, 출처 전환, 조건 줄, 상태 줄, 행 여덟과 그 안 재생 버튼·이름·메타·알약·오른쪽 칸(보조 정보·배지), '더 보기', 패널 구획(머리·칩·설명·기본 샘플·이용 조건)이다.
  - **T5~T8 영역은 regions에서 뺀다.** '내 문장' 바, 행의 '내 문장 듣기'·별, 패널의 내 문장 결과·담기·프리셋은 브리프 머리에 적은 대로 T4가 옮기지 않는다.
  - hero: 흉내 응답 1536×1024 캡처로 `record hero`, 통과선 72%. 이어서 responsive(1440·1280·1200·1024·768·390·320, 라이트·다크).
  - 시안의 예시 이름·수치와 '용도'→'콘텐츠', '카테고리'→'성우 종류' 글자 차이는 차이로 둔다.
- **18행 증거:** 서체(Pretendard, 400·700, `tabular-nums`), 이미지(없음), 모션(색 150ms, 서랍 200ms·DESIGN 이징·reduced-motion 즉시), 게이트 결과, 바꾼 파일, 읽은 스킬, Task 8 생성물에서 바꾼 줄.
- **20행:** next-dev-loop(`get_compilation_issues`, `get_routes`, `get_errors`)와 desktop 1440·mobile 390 스크린샷(`tasks/evidence/T04/`, 라이트·다크, 흉내 응답). 오류 예산 0(환경 탓도 빼지 않는다).
  - 잴 것: 500행(5페이지) 붙인 뒤 스크롤·조건 바꾸기 반응(`performance.now()`)과 행 높이 실측. `.voice-row`의 `contain-intrinsic-size`를 실측에 맞춘다.
  - DB 컨테이너를 잠깐 멈춘 상태로 `/casting`을 흉내 없이 열지 않는다(실제 조회가 나간다). DB 꺼짐은 Task 6 테스트로 대신한다.
- **21~24행:** 메인 세션에서 `.agents/skills/impeccable/reference/critique.md`·`audit.md`를 Read로 읽고 `docs/briefs/casting.md`를 넘겨 실행한다. `web-design-guidelines`로 코드 검사. 기준 audit 16/20, 접근성 3/4. polish와 재확인 1회. 재생 중 3px 왼쪽 띠는 브리프 3·7절이 정한 표시라 지적이 나와도 브리프 근거로 둔다(계획 리뷰).
- **25행:** `DESIGN.md` merge(덮어쓰지 않는다): 밑줄 탭, 세그먼트(출처 전환), 성우 행(68px, 재생 중 3px 띠, 고른 행 옅은 청록, 오른쪽 고정 칸), 성우 패널(높이 상한), 서랍, 조건 버튼 글자 규칙, 공용 샘플 버튼. 전후 `pnpm dlx @google/design.md lint DESIGN.md`와 `diff`.
- **26행:** 통합 런타임(개발 서버는 다시 켜지 않는다. 사용자 확인을 위해 계속 돈다. 오류 예산 0).
- **27·28행:** 바꾼 디렉터리에 `ponytail:ponytail-review`(Skill 도구), 라우트 크기와 새 의존성(`drizzle-orm` api, shadcn 생성물) 확인, 전체 diff에 `bts-reviewer(code)`. research 문서 세 개(설계 단계에 서브에이전트가 합침)를 `tasks/evidence/T03/research/*`·`tasks/evidence/T04/research/*`와 대조하는 일은 설계 단계에서 했다(sonnet, low 10건 반영). 이 리뷰는 그 뒤 바뀐 줄만 본다.
- **29행 QA(S1~S19):** 실제 목록 조회는 서버 요청 로그로 센다. 공급자마다 10회 이하이고 억양 포함이다.
  - **사전 조건(S1 앞, 사용자 결정 보완):** DB 컨테이너가 켜져 있고(`podman ps`), 흉내 응답으로 `/casting`을 한 번 열어 서버 로그에 `[voiceCache]` 실패 줄이 0인지 본다. 실패 줄이 있으면 실제 조회를 하지 않고 DB부터 고친다(DB가 꺼지면 같은 조건도 매번 공급자를 부른다).
  - S1: 실제 키로 `/casting`을 한 번 연다. 세 공급자 첫 페이지 각 1회.
  - S2~S4: 실제 조회로 몇 조합만 본다. 나머지는 흉내 응답이다.
  - S9: 같은 조건 재방문·브라우저 새로 고침 뒤 서버 로그에 공급자 호출이 없어야 한다(캐시). 서버 로그에서 `[voiceCache]` 실패 줄이 0인지도 본다.
  - S10: 실제 '목록 새로 고침' 1회.
  - S11~S13·S16~S19: 흉내 응답이다.
  - ElevenLabs 샘플 주소 만료(스펙 12절 위험): S1에서 받은 목록은 24시간 캐시에 남는다. 사용자 테스트 때(받은 지 몇 시간 뒤) 같은 성우의 `api.us.elevenlabs.io` 샘플이 재생되는지 사용자에게 함께 봐 달라고 하고 결과를 적는다.
  - QA 앞뒤로 사용자에게 공급자 대시보드 사용량을 봐 달라고 한다(목록 조회는 과금 문구가 없지만 확인한다).
- **30~33행:** QA 수정과 재QA, `pnpm agents:check`, `pnpm skills:check`, `pnpm dev-cycle case`·`status`.
- **34행:** Task 13이 `tts-provider` 본문을 바꾼다. 코디네이터가 `bts-dev-cycle` 규칙으로 eval 재실행 여부를 정한다.
- **35행:** Task 13 결과. GLOSSARY는 설계 단계에서 계정 성우·목록 캐시를 넣었다. 새로 '공급자 대기 시각'을 쓰게 되면 그때 넣는다(지금은 데이터 모델 표의 설명 말이다). 미룬 지적은 `tasks/todo.md` 백로그와 로드맵 해당 TASK 메모로 옮긴다.
- **36행 `[confirm]`:** 스펙 11절 사용자 테스트 절차를 드린다. 다음을 함께 적는다.
  - 개발 서버 주소와 DB 컨테이너가 켜져 있다는 것.
  - 이번에 없는 것과 언제 오는지(T5~T8).
  - ElevenLabs 샘플 만료 확인 부탁.

## 자기 검토 (writing-plans)

계획 리뷰 반영 뒤(2026-10-04) 다시 했다.

- **스펙 범위:** 스펙 6절 포함 1~9가 Task 3(계약), Task 4·5(공급자 목록), Task 2(DB), Task 6(캐시), Task 7(프로시저), Task 10~12b(화면), Task 10(샘플 버튼), Task 13(스킬·문서)에 대응한다. 스펙 "만들지 않는 것"의 항목은 어느 태스크에도 들어가지 않았다(내 문장 듣기, 담기, 라이브러리 추가 호출, locale 등). 수용 기준은 위 표.
- **Review Focus 테스트의 자리:** 1 조건 빠른 변경 → Task 6 `cacheKey`·Task 9 `inputOf` 테스트와 Task 11b 조건별 키. 2 페이지 중복 → Task 9 `flattenPages`. 3 DB 꺼짐 → Task 6 "DB가 꺼져 있을 때"와 Task 2 연결 시간 제한. 4 옛 캐시 → Task 6 "계약 판". 5 Fish Audio 1,000명 → Task 5 "10페이지", Task 9 `listEnd`, Task 7 "11페이지 BAD_REQUEST".
- **이름과 시그니처(태스크 사이):** `ProviderClient`(메서드 문법, Task 3) ← Task 4·5 구현 ← Task 7 라우터 한 줄. `emptyVoice`·`fetchJson`(Task 3) ← Task 4·5. `parseVoiceItems`의 `toVoice: (raw) => Voice | null`(Task 3) ← Task 5 `fishVoice`. `testDb`·`testDatabaseUrl`(Task 6) ← Task 7 격리 테스트. `Axis`·`ChoiceAxis`·`ToggleAxis`(Task 9) ← Task 11a `AxisView` 변환. `sampleAriaLabel`·`SampleStatus`(Task 9) ← Task 10 `SampleButton`. `PANEL_ID`(Task 10) ← Task 11a `CastingWorkspace`. `serverListOptions`·`useListRefresh`(Task 11b) ← Task 12a·12b. `VoiceShelf`·`ListStatusBar`·`StaleNotice`·`useSearchCommit`·`LIST_QUERY`(Task 11a) ← Task 11b·12a·12b. `bundleOf`(Task 9) ← Task 12b.
- **플레이스홀더:** 서버 코드(Task 2~7)와 순수 함수(Task 9), 행·패널·배치·공용 부품(Task 10·11a)은 실제 코드다. 서버 목록·탭·'전체' 탭(Task 11b·12a·12b)은 핵심 코드와 브리프 문구·상태·접근 이름·반응형 기준을 빠짐없이 적은 규칙이다. 코디네이터 판단이 남는 곳은 Task 1·8과 Task 12a·12b의 화면 확인이다.
- **중간 검사:** api 타입 검사는 Task 3~6 동안 라우터가 옛 결과 모양이라 실패하고, Task 7 끝에서 처음 0이다(Global Constraints). web 타입 검사는 Task 3부터 늘 0이다(픽스처, E4).
- **확인하지 못한 것(구현 때 설치본으로 확인):**
  - shadcn 생성물 `SheetContent`의 `initialFocus`·`finalFocus` 전달, `TabsContent`의 `keepMounted`, `TabsList` 변형, `SheetTitle`의 `ref`(Task 8).
  - drizzle 1.0.0-rc.4 `drizzle({ connection, relations })` 객체 인자(Task 2 Step 3. 안 되면 `Pool`로).
  - drizzle `onConflictDoUpdate`의 `target`이 `NULLS NOT DISTINCT` 제약과 맞물리는지(Task 6 "한 행" 테스트가 확인한다. 생성 SQL은 계획 리뷰가 확인).
  - 메서드 문법 `ProviderClient`에 좁은 입력의 화살표 함수 속성이 들어가는지(이변 검사. Task 7 타입 검사가 확인한다).
