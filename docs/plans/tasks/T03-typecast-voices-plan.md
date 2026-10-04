# T3 Typecast 성우 찾기와 샘플 듣기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** '성우 캐스팅'(`/casting`) 화면에서 Typecast 공개 성우 전체를 콘텐츠별 선반으로 둘러보고, 이름 검색과 모델·성별·연령·콘텐츠 필터로 찾고, 공급자의 기본 샘플을 한 번에 하나씩 듣는다. 뒤 TASK(T4·T5·T7·T8)가 그대로 쓸 성우 계약, 목록 조회의 오류 처리, 성우 카드, 샘플 플레이어를 만든다.

**Architecture:** `packages/api`에 성우 계약(`contract.ts`), 목록 조회 공통 틀(`errors.ts`의 `runList`, 공급자 문제를 사유를 붙인 `ORPCError`로 던진다), Typecast `listVoices`, 프로시저 `voiceList`(`protectedProcedure`)를 더한다. 화면은 Server Component 페이지 안의 클라이언트 컴포넌트 하나(`VoiceCasting`)가 `useQuery`로 목록을 한 번 받고, 검색·필터·선반 묶기는 브라우저의 순수 함수(`lib/voice-filter.ts`)로 한다. 샘플은 페이지에 하나뿐인 오디오 요소(`SamplePlayerProvider`)를 모든 카드가 함께 쓴다. 사유를 모르는 오류는 새 오류 경계 `(app)/error.tsx`가 받는다.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3(React Compiler 켜짐), oRPC 1.15.4, TanStack Query 5.103.2, zod 4.6.5, vitest 5.0.2, `@neosapience/typecast-js` 0.4.15, shadcn(Base UI 1.8.0) `packages/ui`, Tailwind CSS 4, Biome 2.

**Spec:** [T3 스펙](T03-typecast-voices.md)(사용자 확인 2026-10-04 "진행", 구속력 있는 정본), [성우 캐스팅 브리프](../../briefs/casting.md)(사용자 확인 2026-10-04), 승인 시안 `.impeccable/mocks/decision/casting-shelves.png`, [사이트맵](../../briefs/site-map.md), [앱 틀 브리프](../../briefs/app-shell.md), [연결 상태 브리프](../../briefs/provider-status.md), [로드맵 T3](../implementation-roadmap.md).

**실행 방식(4행):** superpowers:subagent-driven-development + test-driven-development, ponytail 모드. 태스크마다 `bts-implementer`가 구현하고 코디네이터(메인 세션)가 결과를 확인한다. "코디네이터"라고 적힌 단계는 `bts-implementer`에 맡기지 않는다.

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`bts-dev-cycle` 5절)에 한 번 한다. 태스크 끝의 증거 메모는 코디네이터가 대조표(`tasks/todo.md` 활성 라운드) 행에 적는다.
- `apps/web/.env`와 실제 키를 읽거나 출력하지 않는다. 로그·증거·테스트 출력에 키를 남기지 않는다.
- 공급자 API를 실제로 부르지 않는다. 자동 테스트는 `vi.stubGlobal("fetch", …)`(`providers/test-utils.ts`의 `useFetchMock`)로 HTTP 응답만 흉내 낸다.
- `bts-implementer`는 `/casting`과 `/connections`를 브라우저로 열지 않는다. 열면 실제 조회가 나간다. 실제 목록 조회는 메인 세션의 QA에서만 하고 10회 이하다(스펙 2절). 연결 상태 조회는 T2 상한(합계 45회, 공급자별 15회, 지금까지 17회)에 센다.
- 유료이거나 상태를 바꾸는 호출(생성, 시험 생성, 클론, 클론 삭제)은 이 TASK에 없다. 추천 API(`/v1/voices/recommendations`)와 단건 조회(`GET /v3/voices/{id}`)도 부르지 않는다(스펙 5절 "만들지 않는 것").
- 로컬 관리자 모드(`AGENTS.md`, 로드맵 2절): 소유자는 서버가 정한 `context.ownerId`에서만 얻는다. 공급자 키를 쓰는 코드는 `/api/rpc`의 `protectedProcedure`로만 연다. Server Action과 새 Route Handler를 만들지 않는다. Server Component와 SSR은 db·공급자 모듈을 import하지 않고 `voiceList`를 부르지 않는다.
- `packages/api/src/providers/contract.ts`는 zod만 import한다. 화면은 contract에서 `import type`만 한다(zod와 SDK가 클라이언트 번들에 들어가지 않게).
- 목록 조회는 서버·화면 모두 자동 재시도하지 않는다(서버 재시도 코드 없음, `useQuery`의 `retry: false`). 시간 제한은 10초(`CHECK_TIMEOUT_MS`)다. SDK 오류 객체, 오류 메시지, 응답 헤더, 키, 응답 값을 로그나 `ORPCError`의 `cause`에 넘기지 않는다. 실패 로그는 한 줄이고 공급자, 오류 이름, 검증에 실패한 필드 경로만 담는다. 목록 로그의 필드 이름은 배열 위치를 빼고 같은 이름을 한 번만, 5개까지 적는다(`fieldNames`, Task 1). rpc 라우트의 `onError`는 사유가 붙은 공급자 오류를 코드·공급자·사유 한 줄로만 남긴다(Task 3).
- 공급자 문제는 `UNAUTHORIZED`·`FORBIDDEN`으로 던지지 않는다(`tts-provider`). 코드와 사유는 스펙 4절 표대로다.
- 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex나 임의 값(`mt-[13px]`, `bg-[#…]`)을 새로 넣지 않는다. 옅은 청록은 `bg-primary-subtle`·`bg-primary/8`·`bg-sidebar-accent`만 쓴다. 굵기는 `font-normal`·`font-bold` 둘뿐이다.
- `package.json`, `pnpm-lock.yaml`, `turbo.json`, `next.config.ts`, 루트 설정의 변경은 코디네이터가 한다.
- 화면 문구는 브리프와 이 계획의 문구만 쓴다. 구현하는 쪽이 새 문구나 색을 만들지 않는다. 문구는 `-어요` 보이스다.
- 인터랙티브 요소는 44px 이상(`min-h-11`, `size-11`, 버튼 `size="lg"`)이고 `focus-visible`이 보인다.
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(들여쓰기는 탭).
- 패키지 이름: 앱 `web`, API `@tts-pilot-app/api`, UI `@tts-pilot-app/ui`. API 테스트는 `pnpm --filter @tts-pilot-app/api test [파일]`, web 테스트는 `pnpm --filter web test [파일]`(Task 4부터), 전체는 `pnpm test`다.
- `apps/web`은 `typedRoutes: true`다. `/casting` 링크(메뉴, 작업실 흐름 지도)는 페이지를 만든 뒤에 쓴다(Task 8 → Task 9). `pnpm check-types`가 먼저 `next typegen`을 돌린다.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `ponytail:` 주석으로 남긴다.
- 개발 서버는 `http://127.0.0.1:3001`(`pnpm --filter web dev`, 백그라운드에서 이미 돈다). 개발 서버가 도는 동안 `.next`를 지우거나 옮기지 않고, `next build`는 개발 서버를 끈 뒤에 돌린다(next-dev-loop).
- 이 계획의 대조표 행 번호는 보안 리뷰 행이 붙기 전 번호다(아래 "대조표 행과 태스크").

## Review Focus

- **한글 입력:** 맥에서 붙여 넣은 이름은 자모가 풀린 NFD로 올 수 있고, 조합 중인 글자가 바로 검색어가 된다 → NFD로 넣어도 찾고, 입력이 목록 그리기에 막히지 않는다. Task 5 "NFD로 들어온 한글도 찾는다" 테스트. 입력 막힘은 `useDeferredValue`(Task 8)이고 QA S2에서 614명 상태로 빠르게 쳐 본다.
- **공급자가 새 값을 줄 때:** 모르는 성별·연령·콘텐츠 값이나 새 모델 판이 오면 목록이 깨지지 않고, 성별은 '정보 없음', 연령·콘텐츠·모델은 공급자 값 그대로 보이고 선택지에도 나온다. 성우 하나의 값이 어긋나면 그 성우만 빠지고(샘플 주소만 어긋나면 '샘플 없음') 나머지는 그대로 보인다. Task 2 "모르는 성별은 null", "이름이 없는 성우만 뺀다", "https가 아닌 샘플 주소" 테스트, Task 5 "모르는 값은 공급자 값 그대로 뒤에", "모델은 새 판이 먼저" 테스트.
- **같은 성우 id가 두 번 오는 응답:** React 키가 겹쳐 콘솔 오류가 나고 카드 상태가 꼬인다 → 서버가 처음 것만 남긴다. Task 2 "같은 voice_id는 처음 것만 남긴다" 테스트.
- **샘플을 빠르게 연달아 누를 때:** A → B → A를 빠르게 누르거나 불러오는 중에 다시 누르면, 끝에 누른 것만 재생되거나 멈추고 '재생하지 못했어요'가 잘못 뜨지 않는다(바뀐 주소로 끊긴 `play()`의 `AbortError`는 실패가 아니다. 앞 성우의 늦은 실패는 상태도 알림도 바꾸지 않는다). Task 7 `sample-state.test.ts`(같은 성우 멈춤, 늦은 실패 무시, 재생 중 재진입 무시)와 Step 6(코디네이터 브라우저 확인, 흉내 응답).
- **같은 성우가 여러 선반에 있을 때:** 한 카드에서 재생하면 그 성우의 모든 카드가 '재생 중'과 '정지'를 보이고, 어느 카드의 '정지'로도 멈춘다. Task 7 Step 8과 QA S5.

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다. 외부 스킬은 Read로 `.agents/skills/<이름>/`의 프로젝트 판을 읽었다.

- `bts-api`: 불변식 1·2 → `voiceList`는 `protectedProcedure`, 소유자는 `context.ownerId`만(입력에 소유자 없음). 불변식 4 → `.input(z.object({ provider: z.literal("typecast") }))`와 `.output(voiceListResultSchema)`, 출력에 키 없음(테스트로 고정). 불변식 5 → `UNAUTHORIZED`·`BAD_REQUEST`에 더해 공급자 문제는 스펙 4절 코드(`PRECONDITION_FAILED`, `BAD_GATEWAY`, `TOO_MANY_REQUESTS`, `GATEWAY_TIMEOUT`)로 던진다(`tts-provider` 표가 이 불변식을 공급자 연동에 넓힌다). 불변식 6 → `providers/`가 `authPaths`라 security 리뷰 행이 붙는다. 소유 데이터가 없어 2계정 격리(13행)는 AC3 테스트로 대신한다. 공식 스킬 연결(`better-auth-*`, `email-and-password-*`)은 N/A: 인증 설정을 바꾸지 않는다.
- `bts-web`: Server Component 기본 → `casting/page.tsx`는 제목 메타데이터와 머리만, `"use client"`는 `voice-casting.tsx`·`voice-conditions.tsx`·`voice-card.tsx`·`sample-player.tsx`·`error.tsx`. 조회는 `useQuery(orpc.voiceList.queryOptions({ input }))`. loading·empty·error·비인가를 나눈다 → 불러오는 중, 공개 성우 0명, 조건 결과 0명, 사유별 오류, 주소 안내. 공식 스킬 연결 가운데 `vercel-react-best-practices`와 `next-dev-loop`만 해당한다(캐시 컴포넌트·프리패치는 바꾸지 않는다).
- `vercel-react-best-practices`: `rerender-use-deferred-value` → 검색어와 필터는 `useDeferredValue`로 목록 그리기를 미룬다. `rendering-content-visibility` → 결과 격자의 카드 칸(`li`)에 `content-visibility: auto`(선반은 5장뿐이라 두지 않는다). `rerender-derived-state-no-effect` → 결과·선택지·선반은 렌더 중에 순수 함수로 만든다(React Compiler가 기억한다. `useMemo`를 따로 쓰지 않는다). `rerender-move-effect-to-event` → 스크린 리더 알림과 포커스 이동은 이벤트 핸들러에서. `rerender-no-inline-components` → `Shelf`, `Problem`, `FilterMenu`는 모듈 수준. `js-set-map-lookups`·`js-index-maps` → 선반 묶기와 라벨 표는 `Map`. `rendering-conditional-render` → 삼항. `bundle-barrel-imports` → 화면은 contract에서 타입만. `client-event-listeners` → 오디오 이벤트는 요소 prop으로 한 번만.
- `shadcn`(+ `rules/composition.md`, `base-vs-radix.md`): 드롭다운 체크 목록은 이미 있는 `DropdownMenuCheckboxItem`을 `DropdownMenuGroup` 안에 쓴다. Base UI는 `asChild` 대신 `render`(Trigger에 `Button`). `Menu.CheckboxItem`의 `closeOnClick` 기본값이 `false`라 항목을 눌러도 닫히지 않는다(설치본 `MenuCheckboxItem.d.ts`로 확인). 검색 칸은 `InputGroup`(+ `InputGroupAddon`, `InputGroupInput`, `InputGroupButton`). 새 프리미티브는 더하지 않는다. 배지 변형 `primary`는 처음 쓰는 이 TASK가 더한다(T2 규칙).
- Next 번들 문서 `01-app/03-api-reference/03-file-conventions/error.md`(16.3.6): 오류 경계는 Client Component, prop은 `error`와 `retry`. TanStack Query 5.103.2 `errorBoundaryUtils.js`: `throwOnError`로 던진 쿼리는 오류 경계가 풀리기 전까지 `retryOnMount`를 끈다(false로만 덮는다). 성우 목록은 `retryOnMount: false`라 → `error.tsx`가 `useQueryErrorResetBoundary().reset()`, 실패한 쿼리의 `resetQueries`, `retry()` 순으로 부른다.
- `next-dev-loop`: 20·26행에서 `get_compilation_issues`, `get_routes`(`/casting` 포함), `get_errors`.
- `bts-ui`(+ `references/impeccable-map.md`): 16행 context 결과(스타일은 T2 리디자인 그대로). UI 태스크 편집 전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 승인 시안이 있으므로 Task 8 뒤 comp-led 게이트(`impeccable build-phase`)를 메인 세션이 한다("구현 뒤"). 리뷰는 메인 세션.
- `bts-verify`(+ `references/browser.md`): 화면+프로시저 변경이라 typecheck·lint·test·build·런타임·desktop/mobile 스크린샷을 모두 한다. 오류 예산 0. `bts-implementer`의 런타임 확인은 공급자를 부르지 않는 경로(curl로 CSRF 403·Host 401, SSR HTML)로만 한다.
- `tts-provider`: SDK 호출은 `providers/typecast.ts`에만. 키와 공식 호스트를 SDK 생성자에 명시(T2 그대로). 기본 목록 `GET /v3/voices`는 완료된 커스텀 성우를 섞어 주므로 `original`만 남긴다(스킬 "클론 보이스와 공급자 리소스 소유권"). 오류 매핑 표 → `runList`. SDK 오류 객체는 `ProviderHttpError`로 바꿔 담는다. 샘플 재생은 과금 없는 공급자 주소 재생이고 시험 생성과 합치지 않는다(REQ-03). "한 번에 한 오디오만 재생"(화면 절). "먼저 1"은 설계 때 공식 문서(llms.txt, List Voices, Recommend Voices)를 2026-10-04에 다시 읽었다(스펙 1행). "먼저 2" → SDK 0.4.15 타입 선언을 다시 확인했다(아래).
- `bts-db`, `supabase-postgres-best-practices`, `neon-*`, `turborepo`: N/A. DB와 `turbo.json`을 바꾸지 않는다(`test` 태스크는 이미 있다).

**SDK 확인(2026-10-04, 설치본 `@neosapience/typecast-js@0.4.15` `lib/index.d.ts`·`index.js`):** `getVoicesV3(filter?: VoicesV2Filter): Promise<VoiceV3Response[]>`는 `fetch(buildUrl("/v3/voices", filter), { headers })` 뒤 `handleResponse`다(취소·시간 제한·재시도 없음, 응답 검사 없음). `VoiceV3Response`는 `voice_id`, `voice_name: { eng, kor }`, `models: { version, emotions[] }[]`, `voice_type: 'original' | 'custom'`, `gender?`, `age?`, `use_cases?: string[]`, `preview_url?: string | null`. `VoicesV2Filter`에 `voice_type`이 없다. 오류는 `TypecastAPIError`(`statusCode`). zod 4.6.5에서 `z.url({ protocol: /^https$/ })`가 `http:`·`javascript:`를 거르고, `ZodError`의 `name`이 `"ZodError"`, 경로가 `[0, "voice_name"]` 꼴임을 실행해 확인했다. `@orpc/server` 1.15.4의 `new ORPCError("BAD_GATEWAY", { data })`는 `status` 502이고 `toJSON()`에 `data`가 실린다(504·412·429도 확인).

## 스펙과 다른 점

1. **로드맵의 "Typecast 단건 조회"** 는 스펙 5절이 T8로 미뤘다(목록에 모든 필드가 있다). 로드맵 T3 "포함"을 Task 10에서 스펙에 맞춘다.
2. **스펙 4절 "연결 끊김"** 은 `TypeError`(Node `fetch failed`)로 판정해 `unknown_outcome`으로 보인다. JSON이 아닌 응답(`SyntaxError`)과 응답 검증 실패(`ZodError`)는 `provider_error`다. 그 밖의 예외는 바꾸지 않고 던져 500 → 오류 경계다. 매핑 코드 자체의 `TypeError`도 '응답하지 않아요'로 보일 수 있는 한계를 `ponytail:` 주석으로 남긴다.

## 계획에서 정한 것

- **계약 이름:** `Voice`는 `{ provider, voiceId, name, englishName, gender, age, useCases, models: { model, emotions }[], previewUrl }`이다. Typecast는 `name`에 한글 이름(비면 영문), `englishName`에 영문 이름(비었거나 `name`과 같으면 null)을 넣는다. ElevenLabs·Fish Audio(T4·T5)는 이름이 하나라 `englishName`이 null이다.
- **사유 타입:** 화면이 읽는 `data.reason`은 `ProviderFailure`(`no_key`, `provider_auth`, `no_permission`, `quota`, `rate_limit`, `provider_error`, `unknown_outcome`)다. 화면은 zod를 가져갈 수 없어 contract의 TS 타입만 쓰고, 모르는 사유는 오류 경계로 보낸다.
- **샘플 주소:** `https:`만 받는다(`z.url({ protocol: /^https$/ })`). 실측 614명 모두 `https://static2.typecast.ai/…mp3`다. 다른 형식이 오면 그 성우만 `previewUrl: null`('샘플 없음')이다. 오디오 `src`에 다른 스킴이 들어가지 않게 하는 경계다.
- **응답 검증 단위(사용자 확정 2026-10-04, 계획 리뷰 E4):** 응답 모양(배열이 아님, `voice_type` 없음)이 어긋나면 목록 전체가 `provider_error`다. 공개 성우는 하나씩 검사해 샘플 주소 밖의 필드가 어긋난 성우만 뺀다. 뺀 수와 필드 이름만 한 줄 남긴다(`[voiceList] typecast 성우 1명 제외: voice_name`). 공개 성우가 하나 이상인데 모두 빠지면 `provider_error`다.
- **같은 성우 id:** 서버가 처음 것만 남긴다(Review Focus).
- **'콘텐츠 정보 없음' 선반:** `useCases`가 빈 성우를 모두 보이고 '모두 보기 →'를 두지 않는다. 그 콘텐츠를 고르는 필터 값이 없어서다. 실측에서는 0명이라 보통 나타나지 않는다.
- **선반 '모두 보기 →':** 이름 있는 선반은 인원 수와 상관없이 둔다(브리프 5절). 접근 이름은 "{콘텐츠} 모두 보기".
- **실패 뒤 다시 들어오기:** 사유를 보인 실패(데이터 없음) 뒤 다른 화면에 갔다 와도 다시 부르지 않는다(`retryOnMount: false`, 스펙 3절·AC4). 다시 부르는 것은 '다시 불러오기'와 오류 경계의 '다시 시도하기'뿐이다. `errorBoundaryUtils.js`는 경계가 풀리기 전까지 `retryOnMount`를 false로 덮기만 하므로, `(app)/error.tsx`가 `reset()` 뒤 실패한 쿼리를 `queryClient.resetQueries({ predicate: (q) => q.state.status === "error" })`로 처음 상태로 되돌리고 `retry()`한다. 다시 그릴 때 `pending`에서 한 번만 부른다. 성공한 목록은 다시 부르지 않는다(`staleTime`·`gcTime` 무한, S17).
- **'다시 불러오기' 중 화면:** 데이터 없이 실패한 쿼리를 다시 부르면 query-core가 오류를 지운다(Task 4 `toView` 주석). 그래서 누른 때의 사유를 `retrying` 상태로 들고 있다가 다시 부르는 동안 문제 화면과 잠긴 버튼(포커스 유지)을 그대로 보인다. 성공하면 포커스를 검색 칸으로 옮긴다. 두 번 눌러도 요청은 한 번이다(`refetch({ cancelRefetch: false })`, AC5).
- **본문 안내(`Notice`):** 연결 상태의 소유자 안내를 `Notice({ icon, title, description, children, role })`로 뽑아 소유자 안내(두 화면), 캐스팅의 오류(`Problem`), 공개 성우 0명, 조건 결과 0명이 모두 쓴다. 문구는 부르는 쪽이 넘긴다. 소유자 안내 제목: 연결 상태 "이 주소에서는 공급자 연결을 확인할 수 없어요"(그대로), 성우 캐스팅 "이 주소에서는 성우 목록을 불러올 수 없어요". 오류와 공개 성우 0명은 `role="alert"`로 알린다. 조건 결과 0명은 인원 글자(`role="status"`)가 이미 알린다.
- **검색 칸 경계(`--input`):** 라이트 `oklch(0 0 0 / 0.45)`(흰 카드 3.35:1, 페이지 바탕 3.32:1), 다크 `oklch(1 0 0 / 0.35)`(카드 3.16:1, 바탕 3.21:1). oklch → sRGB 계산(2026-10-04). 검색 칸은 `bg-card`로 칠해 `dark:bg-input/30`이 밝아지는 영향을 받지 않게 한다.
- **카드 격자:** `packages/ui` `globals.css`에 `@utility grid-cols-cards`(`repeat(auto-fill, minmax(min(15rem, 100%), 1fr))`)를 둔다. 본문 너비 872px(1024 화면)에서 3열, 616px(768)에서 2열이다. 성우 선반·격자의 5열은 1440px 이상이다(사용자 확정 2026-10-04, 계획 리뷰 U1: 1200px 5열은 카드가 약 158px로 좁다). `@theme`에 `--breakpoint-2xl: 90rem`을 두고 5열 전환은 `2xl:`로 한다. 1200~1439px은 768~1199px과 같은 가로 선반과 `grid-cols-cards`다. 성우 격자는 `grid-cols-1 md:grid-cols-cards 2xl:grid-cols-5`, 연결 상태는 `grid-cols-cards xl:grid-cols-3`(CS-04: 1024에서 3열, 1200 이상은 지금처럼 3열).
- **`Spinner`(CS-05):** `aria-hidden`을 받으면 숨기고, 아니면 `role="status"`와 `aria-label="불러오는 중"`을 갖는다. 버튼 안에서는 늘 `aria-hidden="true"`를 넘긴다(버튼 글자가 상태를 알린다).
- **`EmptyTitle`(AF-05):** `h2`로 그린다. 쓰는 곳(연결 상태 소유자 안내, 성우 캐스팅의 빈·오류 상태)이 모두 `h1` 아래다.
- **배지:** `Badge`에 `primary` 변형(`bg-primary-subtle text-primary`)을 더한다('재생 중').
- **샘플 상태:** 지금 재생 대상 하나만 상태(`loading`, `playing`, `failed`)를 가진다. 다른 카드를 누르면 앞 카드의 실패 표시도 사라진다. 카드는 성우 id로 상태를 읽으므로 같은 성우의 카드는 모두 같은 상태다. 상태 전이(`pressSample`, `playFailed`, `playing`)는 `lib/sample-state.ts` 순수 함수로 두고 테스트한다. 오디오 요소 조작과 알림은 `sample-player.tsx`가 한다. 불러오는 중 버튼의 접근 이름은 "{이름} 샘플 듣기 취소"(누르면 멈춘다, 보이는 글자 '샘플 듣기'를 포함한다, WCAG 2.5.3)와 `aria-busy`다.
- **모델 선택지 순서:** 공급자 값 그대로 쓰되 새 판이 먼저 오게 숫자를 아는 내림차순으로 정렬한다(`ssfm-v30`, `ssfm-v21`; `ssfm-v31`이 오면 맨 앞).
- **제목 단계:** 페이지 `h1`(머리) → 선반 이름·빈·오류 상태 `h2` → 카드 이름 `h3`. 격자 보기에는 화면에 보이지 않는 `h2` "성우 목록"을 둔다.
- **web 테스트:** `apps/web`에 설정 파일 없이 vitest를 들인다(`vitest run --dir src`). 테스트는 `src/lib/`의 순수 함수만이고 contract에서 타입만 가져간다. 연결 상태 `toView`는 `lib/connection-view.ts`로, 화면의 사유 판정 `failureOf`는 `lib/voice-failure.ts`로, 샘플 상태 전이는 `lib/sample-state.ts`로 옮겨 테스트한다(jsdom 없이 node).

## 파일 구조

```text
packages/api/src/
  providers/contract.ts        (수정) Voice, VoiceListResult, ProviderFailure, ProviderErrorData
  providers/errors.ts          (수정) withTimeout(runCheck에서 뽑음), fieldNames, ProviderTimeoutError, providerError, runList, ProviderClient.listVoices?
  providers/errors.test.ts     (수정) runList 표
  providers/typecast.ts        (수정) listVoices
  providers/typecast.test.ts   (수정) 목록 테스트
  routers/index.ts             (수정) voiceList
  routers/voice-list.test.ts   (신규)
apps/web/
  package.json                 (수정, 코디네이터) vitest, test 스크립트
  src/app/api/rpc/[[...rest]]/route.ts   (수정) onError: 사유 있는 공급자 오류는 한 줄
  src/index.css                (수정) .voice-card content-visibility
  src/lib/voice-filter.ts      (신규) 라벨 표, 검색·필터, 선택지, 선반 묶기
  src/lib/voice-filter.test.ts (신규)
  src/lib/voice-failure.ts     (신규) failureOf(화면이 안내를 고르는 사유)
  src/lib/voice-failure.test.ts (신규)
  src/lib/sample-state.ts      (신규) 샘플 상태 전이
  src/lib/sample-state.test.ts (신규)
  src/lib/connection-view.ts   (신규) toView(옮김), isUpcoming(CS-08)
  src/lib/connection-view.test.ts (신규)
  src/components/connection-status.tsx   (수정) toView import, Notice, 격자(CS-04)
  src/components/provider-status-card.tsx (수정) 지난 초기화 날짜 숨김(CS-08)
  src/components/notice.tsx              (신규) 본문 안내(소유자 없음, 오류, 빈 상태)
  src/components/sample-player.tsx       (신규) 오디오 하나, useSample
  src/components/voice-card.tsx          (신규)
  src/components/voice-conditions.tsx    (신규) 검색 칸, 드롭다운 넷, '조건' 버튼
  src/components/voice-casting.tsx       (신규) 조회, 상태, 선반·격자
  src/app/(app)/casting/page.tsx         (신규)
  src/app/(app)/error.tsx                (신규)
  src/components/app-nav.tsx             (수정) '성우 캐스팅' 열기, 막대 4칸
  src/app/(app)/studio/page.tsx          (수정) 흐름 지도 '성우' 링크
packages/ui/src/
  components/spinner.tsx       (수정) CS-05
  components/empty.tsx         (수정) EmptyTitle h2(AF-05)
  components/badge.tsx         (수정) primary 변형
  styles/globals.css           (수정) --input, --breakpoint-2xl, @utility grid-cols-cards
docs/ … (Task 10)
```

## 대조표 행과 태스크

`packages/api/src/providers/`가 diff에 생기면 `pnpm dev-cycle audit`이 security 리뷰 행 누락을 알린다. Task 1이 끝나면 코디네이터가 `pnpm dev-cycle table F --write --upgrade`로 행을 붙인다(증거는 보존된다). 아래 번호는 붙이기 전 번호다.

| 행 | 증거의 출처 |
|---|---|
| 2 | 이 계획과 "읽은 스킬과 계획에 반영한 것" |
| 3 | 계획 리뷰(코디네이터): plan-eng-review, plan-design-review, ponytail-review |
| 4 | 위 "실행 방식"과 태스크별 위임 내역 |
| 5, 7~10 | `N/A: T3는 DB 스키마·마이그레이션이 없다(스펙 5절)` |
| 6 | Task 3 끝의 `pnpm check-types`, `pnpm exec biome check .` |
| 11 | Task 1 `providers/contract.ts`(`voiceSchema`, `voiceListResultSchema`) + Task 3 `voiceList`의 `.input`·`.output` |
| 12 | Task 1~3 변경 파일과 읽은 스킬(`bts-api`, `tts-provider`) |
| 13 | `N/A: 소유 데이터 없음 → AC3로 대신` + Task 3 `voice-list.test.ts`의 "소유자가 없으면 UNAUTHORIZED이고 공급자를 부르지 않는다" 통과 출력 |
| 14 | Task 3 뒤 `pnpm check-types`, `pnpm exec biome check .`, `pnpm test` |
| 15 | Task 1~3 diff에 `bts-reviewer(code)` |
| security(추가) | Task 1~3 diff에 `bts-reviewer(security)`("구현 뒤") |
| 16, 17 | 이미 채움 |
| 18 | Task 4~9 변경 파일과 읽은 스킬(`bts-web`, `bts-ui`, `shadcn`, `vercel-react-best-practices`, craft-floor) + comp-led 게이트 결과 |
| 19 | Task 9 뒤 `pnpm check-types`, `pnpm exec biome check .`, `pnpm test`, `pnpm build` |
| 20~36 | "구현 뒤" |

---

### Task 1: 성우 계약과 목록 조회 공통 틀

**Files:**
- Modify: `packages/api/src/providers/contract.ts`(끝에 더함)
- Modify: `packages/api/src/providers/errors.ts`
- Test: `packages/api/src/providers/errors.test.ts`(끝에 더함)

**Interfaces:**
- Consumes: T2의 `ProviderHttpError`, `reasonFromHttp`, `CHECK_TIMEOUT_MS`, `invalidPaths`, `runCheck`(동작은 그대로).
- Produces:
  - `contract.ts`: `type ProviderFailure`, `type ProviderErrorData = { provider: ProviderId; reason: ProviderFailure }`, `voiceSchema`, `type Voice`, `voiceListResultSchema`, `type VoiceListResult`.
  - `errors.ts`: `class ProviderTimeoutError`, `fieldNames(errors: readonly unknown[]): string[]`(목록 로그의 필드 이름, Task 2도 쓴다), `providerError(provider: ProviderId, reason: ProviderFailure): ORPCError<…>`, `runList<T>(provider: ProviderId, call: (signal: AbortSignal) => Promise<T>): Promise<T>`, `ProviderClient = { checkStatus; listVoices?: () => Promise<VoiceListResult> }`.

- [ ] **Step 1: 실패하는 테스트 쓰기** — `errors.test.ts`의 import를 바꾸고 파일 끝에 더한다.

import 줄:

```ts
import { z } from "zod";

import {
	CHECK_TIMEOUT_MS,
	ProviderHttpError,
	reasonFromHttp,
	retryAfterSeconds,
	runCheck,
	runList,
} from "./errors";
```

(`vitest` import 줄은 그대로 맨 위에 둔다.)

파일 끝(403·402·400·422·503의 사유는 기존 `reasonFromHttp` 테스트가 고정하므로 표에는 대표 행만 둔다. `cause`가 없는지는 Task 2의 401 테스트가 SDK 경로로 본다):

```ts
describe("runList", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	const fail = (error: unknown) =>
		runList("typecast", async () => {
			throw error;
		});

	it("성공하면 값을 그대로 돌려준다", async () => {
		await expect(runList("typecast", async () => 42)).resolves.toBe(42);
	});

	it.each([
		["401", new ProviderHttpError(401), "BAD_GATEWAY", "provider_auth"],
		["429", new ProviderHttpError(429), "TOO_MANY_REQUESTS", "rate_limit"],
		["404(표에 없음)", new ProviderHttpError(404), "BAD_GATEWAY", "provider_error"],
		[
			"연결 끊김",
			new TypeError("fetch failed"),
			"GATEWAY_TIMEOUT",
			"unknown_outcome",
		],
		[
			"JSON이 아닌 응답",
			new SyntaxError("Unexpected token"),
			"BAD_GATEWAY",
			"provider_error",
		],
	])("%s → %s·%s", async (_name, error, code, reason) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(fail(error)).rejects.toMatchObject({
			code,
			data: { provider: "typecast", reason },
		});
	});

	it("응답 검증 실패는 provider_error이고 로그는 오류 이름과 필드 이름 한 줄이다(배열 위치는 뺀다)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const invalid = z
			.array(z.object({ voice_name: z.string() }))
			.safeParse([{ voice_name: 1 }]).error;
		await expect(fail(invalid)).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
		expect(log).toHaveBeenCalledWith(
			"[voiceList] typecast 목록 조회 실패: ZodError (voice_name)",
		);
	});

	it("여러 항목이 같은 필드를 어기면 필드 이름은 하나이고, 뿌리 수준 실패는 (root)다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const items = z.array(z.object({ voice_name: z.string() }));
		await fail(
			items.safeParse([{ voice_name: 1 }, { voice_name: 2 }, { voice_name: 3 }])
				.error,
		).catch(() => {});
		await fail(items.safeParse({ voices: [] }).error).catch(() => {});
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 목록 조회 실패: ZodError (voice_name)"],
			["[voiceList] typecast 목록 조회 실패: ZodError ((root))"],
		]);
	});

	it("예상 밖 예외는 바꾸지 않고 던진다(500, 오류 경계)", async () => {
		const unexpected = new RangeError("bug");
		await expect(fail(unexpected)).rejects.toBe(unexpected);
	});

	it("10초가 지나면 GATEWAY_TIMEOUT·unknown_outcome이고 로그를 남기지 않는다", async () => {
		vi.useFakeTimers();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const pending = runList("typecast", () => new Promise<never>(() => {}));
		const settled = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS);
		await settled;
		expect(log).not.toHaveBeenCalled();
	});
});
```

새 테스트는 10개다(성공 1, 표 5행, 검증 실패 로그 2, 예상 밖 예외 1, 10초 1).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @tts-pilot-app/api test src/providers/errors.test.ts`
Expected: FAIL (`runList` is not exported)

- [ ] **Step 3: 계약 더하기** — `contract.ts` 끝에 더한다.

```ts
// 공급자 호출이 실패한 사유. 목록 조회가 던지는 ORPCError의 data.reason이고 화면이 이 값으로 안내를 고른다(T3 스펙 4절).
// 화면은 zod를 가져가지 않으므로 타입만 둔다. 연결 상태에서 '연결됨'·'확인 실패'를 빼고 '결과 모름'을 더한 것이다.
export type ProviderFailure =
	| Exclude<ConnectionStatus, "connected" | "check_failed">
	| "unknown_outcome";
export type ProviderErrorData = { provider: ProviderId; reason: ProviderFailure };

// 성우 하나(T3 스펙 5절 1). 공급자가 준 값만 담고 추정하지 않는다. 성별·연령이 없으면 null이다.
export const voiceSchema = z.object({
	provider: providerIdSchema,
	voiceId: z.string().min(1),
	// 화면 이름. Typecast는 한글 이름(비면 영문 이름)
	name: z.string(),
	// 화면 이름과 다른 영문 이름. 없거나 같으면 null
	englishName: z.string().nullable(),
	gender: z.enum(["male", "female"]).nullable(),
	// Typecast child·teenager·young_adult·middle_age·elder. 모르는 값도 그대로 받는다
	age: z.string().nullable(),
	// 콘텐츠. 실제 값이 SDK enum과 달라 문자열로 받는다(스펙 3절)
	useCases: z.array(z.string()),
	models: z.array(z.object({ model: z.string(), emotions: z.array(z.string()) })),
	// 기본 샘플. 브라우저가 공급자 주소에서 바로 받는다. 오디오 src에 다른 스킴이 들어가지 않게 https만 받는다
	previewUrl: z.url({ protocol: /^https$/ }).nullable(),
});
export type Voice = z.infer<typeof voiceSchema>;

export const voiceListResultSchema = z.object({
	provider: providerIdSchema,
	voices: z.array(voiceSchema),
	fetchedAt: z.iso.datetime(),
});
export type VoiceListResult = z.infer<typeof voiceListResultSchema>;
```

- [ ] **Step 4: `errors.ts` 고치기**

import를 바꾼다:

```ts
import { ORPCError } from "@orpc/server";
import { ZodError } from "zod";

import type {
	ConnectionStatus,
	ProviderErrorData,
	ProviderFailure,
	ProviderId,
	ProviderStatusResult,
	RemainingQuota,
	VoiceListResult,
} from "./contract";
import { remainingQuotaSchema } from "./contract";
```

`ProviderClient`를 바꾼다:

```ts
export type ProviderClient = {
	checkStatus: () => Promise<ProviderStatusResult>;
	// 공개 성우 목록. Typecast는 T3, ElevenLabs·Fish Audio는 T4·T5에서 채운다
	listVoices?: () => Promise<VoiceListResult>;
};
```

`invalidPaths` 아래에 로그 도우미와 시간 제한을 둔다:

```ts
// 목록 로그의 필드 이름. 배열 위치(0, 1, …)를 빼고 같은 이름은 한 번만, 5개까지 둔다(성우 수만큼 길어지지 않게).
// 뿌리 수준 실패(배열이 아님 등)는 경로가 비어 (root)다. 연결 확인(runCheck) 로그는 invalidPaths를 그대로 쓴다.
export function fieldNames(errors: readonly unknown[]): string[] {
	const names = errors.flatMap(invalidPaths).map(
		(path) =>
			path
				.split(".")
				.filter((key) => !/^\d+$/.test(key))
				.join(".") || "(root)",
	);
	return [...new Set(names)].slice(0, 5);
}

// 공급자, 오류 이름, 검증에 실패한 필드 경로만 한 줄 남긴다. 오류 객체·값·메시지는 남기지 않는다.
function logFailure(prefix: string, error: unknown, paths: readonly string[]) {
	const name = error instanceof Error ? error.name : typeof error;
	console.error(
		`${prefix}: ${name}${paths.length > 0 ? ` (${paths.join(", ")})` : ""}`,
	);
}

// 10초가 지나 끊었다. 응답을 받지 못했으므로 처리 여부를 모른다(unknown_outcome).
export class ProviderTimeoutError extends Error {
	override name = "ProviderTimeoutError";
}

// 공급자 호출 공통 10초 제한. 신호를 받지 못하는 SDK(Typecast)도 같은 시각에 끊기도록 경주시킨다.
// 끊긴 요청은 뒤에서 끝까지 돌 수 있다(조회라 괜찮다).
// timedOut의 abort 리스너가 call보다 먼저 등록되므로, 신호로 끊긴 fetch의 AbortError보다 늘 먼저 거절한다.
async function withTimeout<T>(
	call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	// AbortSignal.timeout()은 vitest 가짜 타이머로 진행되지 않아 setTimeout을 쓴다.
	const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
	const timedOut = new Promise<never>((_, reject) => {
		controller.signal.addEventListener(
			"abort",
			() => reject(new ProviderTimeoutError()),
			{ once: true },
		);
	});
	try {
		return await Promise.race([call(controller.signal), timedOut]);
	} finally {
		clearTimeout(timer);
	}
}
```

`runCheck`를 `withTimeout`과 `logFailure`로 바꾼다(동작과 로그 문구는 그대로. `ProviderHttpError` 블록은 지금 `errors.ts` 133~152행을 한 글자도 바꾸지 않고 옮긴 것이다):

```ts
// 확인 호출 공통 틀: 10초 제한, 재시도 없음, 공급자 문제는 던지지 않고 상태 값으로 돌려준다(T2 스펙 4절).
export async function runCheck(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<CheckOutcome>,
): Promise<ProviderStatusResult> {
	const empty = {
		provider,
		quota: null,
		providerCode: null,
		retryAfterSeconds: null,
	};
	try {
		const outcome = await withTimeout(call);
		// 공급자 값이 계약(Infinity·NaN 불가 등)을 어기면 프로시저 출력 검증이 500을 던지므로 여기서 확인 실패로 만든다.
		remainingQuotaSchema.parse(outcome.quota);
		return { ...empty, ...outcome, checkedAt: new Date().toISOString() };
	} catch (error) {
		const checkedAt = new Date().toISOString();
		if (error instanceof ProviderHttpError) {
			const reason = reasonFromHttp(error.status, error.codes);
			// 확인 호출의 입력 거절(400·422)과 표에 없는 상태는 확인 실패다.
			const status: ConnectionStatus =
				reason === null || reason === "provider_input"
					? "check_failed"
					: reason;
			return {
				...empty,
				status,
				// 권한 부족 코드가 있으면 그것을 먼저 보인다(공급자 오류 코드 줄).
				providerCode:
					error.codes.find((code) => PERMISSION_CODES.has(code)) ??
					error.codes[0] ??
					`HTTP ${error.status}`,
				retryAfterSeconds:
					status === "rate_limit" ? retryAfterSeconds(error.retryAfter) : null,
				checkedAt,
			};
		}
		// 시간 초과가 아닌 예상 밖 예외(연결 끊김, 응답 검증 실패 등)만 남긴다.
		if (!(error instanceof ProviderTimeoutError)) {
			logFailure(
				`[providerStatus] ${provider} 확인 실패`,
				error,
				invalidPaths(error),
			);
		}
		return { ...empty, status: "check_failed", checkedAt };
	}
}
```

파일 끝에 던지는 틀을 더한다:

```ts
// 사유별 oRPC 코드(T3 스펙 4절). UNAUTHORIZED·FORBIDDEN은 쓰지 않는다(클라이언트가 로그인 만료로 본다, tts-provider).
const FAILURE_CODE = {
	no_key: "PRECONDITION_FAILED",
	provider_auth: "BAD_GATEWAY",
	no_permission: "BAD_GATEWAY",
	quota: "BAD_GATEWAY",
	rate_limit: "TOO_MANY_REQUESTS",
	provider_error: "BAD_GATEWAY",
	unknown_outcome: "GATEWAY_TIMEOUT",
} as const satisfies Record<ProviderFailure, string>;

// 공급자 문제를 화면까지 보낼 오류. data에는 공급자와 사유만 담고 원래 오류(cause)를 붙이지 않는다.
export function providerError(provider: ProviderId, reason: ProviderFailure) {
	const data: ProviderErrorData = { provider, reason };
	return new ORPCError(FAILURE_CODE[reason], { data });
}

// 목록 조회 공통 틀(T3 스펙 3·4절): 10초 제한, 재시도 없음, 공급자 문제는 사유를 붙여 던진다.
export async function runList<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	try {
		return await withTimeout(call);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) {
			throw providerError(provider, "unknown_outcome");
		}
		if (error instanceof ProviderHttpError) {
			const reason = reasonFromHttp(error.status, error.codes);
			// 목록 조회의 입력 거절(400·422)과 표에 없는 상태는 공급자 장애로 보인다.
			throw providerError(
				provider,
				reason === null || reason === "provider_input"
					? "provider_error"
					: reason,
			);
		}
		const prefix = `[voiceList] ${provider} 목록 조회 실패`;
		// ponytail: 연결 끊김은 Node fetch의 TypeError("fetch failed")로 판정한다. 매핑 코드의 TypeError도 여기로 와 '응답하지 않아요'로 보일 수 있다. 오판이 보이면 cause.code(ECONNRESET 등)로 좁힌다.
		if (error instanceof TypeError) {
			logFailure(prefix, error, fieldNames([error]));
			throw providerError(provider, "unknown_outcome");
		}
		// 응답 모양 검증 실패와 JSON이 아닌 응답
		if (error instanceof ZodError || error instanceof SyntaxError) {
			logFailure(prefix, error, fieldNames([error]));
			throw providerError(provider, "provider_error");
		}
		// 예상 밖 예외(이미 사유를 붙인 ORPCError 포함)는 그대로 던진다. 사유가 없으면 500(오류 경계)이 된다.
		throw error;
	}
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @tts-pilot-app/api test`
Expected: PASS. 기존 `runCheck`·공급자 확인 테스트(T2)도 모두 통과한다(로그 문구 `[providerStatus] typecast 확인 실패: TypeError` 그대로).

- [ ] **Step 6: 포맷과 타입**

Run: `pnpm exec biome check --write packages/api/src/providers/contract.ts packages/api/src/providers/errors.ts packages/api/src/providers/errors.test.ts && pnpm --filter @tts-pilot-app/api check-types`
Expected: 오류 0

- [ ] **Step 7(코디네이터): security 행 붙이기** — `pnpm dev-cycle table F --write --upgrade` 뒤 `pnpm dev-cycle status`로 행 수를 확인한다.

---

### Task 2: Typecast 성우 목록

**Files:**
- Modify: `packages/api/src/providers/typecast.ts`
- Test: `packages/api/src/providers/typecast.test.ts`(끝에 더함)

**Interfaces:**
- Consumes: Task 1 `runList`, `providerError`, `fieldNames`, `ProviderHttpError`, `Voice`, `ProviderClient.listVoices`.
- Produces: `createTypecast(apiKey).listVoices(): Promise<VoiceListResult>`(`provider: "typecast"`, 공개 성우만, 같은 id는 처음 것만, 어긋난 성우는 빼고 샘플 주소만 어긋나면 `previewUrl: null`).

- [ ] **Step 1: 실패하는 테스트 쓰기** — `typecast.test.ts` 끝에 더한다.

```ts
const rawVoice = (overrides: Record<string, unknown> = {}) => ({
	voice_id: "tc_0001",
	voice_name: { eng: "Minji", kor: "민지" },
	voice_type: "original",
	gender: "female",
	age: "young_adult",
	models: [
		{ version: "ssfm-v30", emotions: ["normal", "happy"] },
		{ version: "ssfm-v21", emotions: ["normal"] },
	],
	use_cases: ["Ads/Promotion", "Game"],
	preview_url: "https://static2.typecast.ai/preview/tc_0001.mp3",
	...overrides,
});
const list = () => createTypecast(KEY).listVoices?.();

describe("Typecast 성우 목록", () => {
	it("공개 성우를 계약 모양으로 바꾸고 커스텀 성우는 뺀다. 요청은 공식 호스트의 /v3/voices에 필터 없이 1회", async () => {
		fetchMock.mockResolvedValue(
			json(200, [
				rawVoice(),
				// 커스텀은 모양이 달라도(models 없음) 목록을 깨지 않는다
				{ voice_id: "custom_1", voice_name: { eng: "Me", kor: "나" }, voice_type: "custom", preview_url: null },
			]),
		);
		const result = await list();
		expect(result?.provider).toBe("typecast");
		expect(result?.voices).toEqual([
			{
				provider: "typecast",
				voiceId: "tc_0001",
				name: "민지",
				englishName: "Minji",
				gender: "female",
				age: "young_adult",
				useCases: ["Ads/Promotion", "Game"],
				models: [
					{ model: "ssfm-v30", emotions: ["normal", "happy"] },
					{ model: "ssfm-v21", emotions: ["normal"] },
				],
				previewUrl: "https://static2.typecast.ai/preview/tc_0001.mp3",
			},
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		const target = new URL(String(url));
		expect(target.origin).toBe("https://api.typecast.ai");
		expect(target.pathname).toBe("/v3/voices");
		expect(target.search).toBe("");
		expect(new Headers(init?.headers).get("x-api-key")).toBe(KEY);
	});

	it("값이 없거나 모르는 값: 성별은 null, 콘텐츠는 빈 배열, 샘플 주소는 null, 한글 이름이 비면 영문 이름을 쓴다", async () => {
		const { use_cases: _omit, ...withoutUseCases } = rawVoice({
			voice_name: { eng: "Sora", kor: " " },
			gender: "unknown",
			age: null,
			preview_url: null,
		});
		fetchMock.mockResolvedValue(json(200, [withoutUseCases]));
		const [voice] = (await list())?.voices ?? [];
		expect(voice).toMatchObject({
			name: "Sora",
			englishName: null,
			gender: null,
			age: null,
			useCases: [],
			previewUrl: null,
		});
	});

	it("같은 voice_id는 처음 것만 남긴다", async () => {
		fetchMock.mockResolvedValue(
			json(200, [rawVoice(), rawVoice({ voice_name: { eng: "Dup", kor: "중복" } })]),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((voice) => voice.name)).toEqual(["민지"]);
	});

	it("401은 BAD_GATEWAY·provider_auth이고 재시도하지 않으며 오류에 키가 없다", async () => {
		fetchMock.mockImplementation(async () =>
			json(401, { detail: `Invalid API key ${KEY}` }),
		);
		const thrown = await list()?.catch((error) => error);
		expect(thrown).toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "typecast", reason: "provider_auth" },
		});
		expect(thrown.cause).toBeUndefined();
		expect(thrown.data).toEqual({ provider: "typecast", reason: "provider_auth" });
		expect(JSON.stringify(thrown.toJSON())).not.toContain(KEY);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("429는 SDK 경로로도 TOO_MANY_REQUESTS·rate_limit이다", async () => {
		fetchMock.mockResolvedValue(json(429, { detail: "too many" }));
		await expect(list()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { provider: "typecast", reason: "rate_limit" },
		});
	});

	it("JSON이 아닌 200 응답은 BAD_GATEWAY·provider_error이고 로그는 SyntaxError 한 줄이다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			new Response("<html>", {
				status: 200,
				headers: { "content-type": "text/html" },
			}),
		);
		await expect(list()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { reason: "provider_error" },
		});
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 목록 조회 실패: SyntaxError"],
		]);
	});

	it("https가 아닌 샘플 주소는 그 성우만 샘플 없음(null)이고 나머지는 그대로다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, [
				rawVoice({
					voice_id: "tc_http",
					preview_url: "http://static2.typecast.ai/a.mp3",
				}),
				rawVoice(),
			]),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((voice) => [voice.voiceId, voice.previewUrl])).toEqual([
			["tc_http", null],
			["tc_0001", "https://static2.typecast.ai/preview/tc_0001.mp3"],
		]);
		expect(log).not.toHaveBeenCalled();
	});

	it("이름(voice_name)이 없는 성우만 빼고, 뺀 수와 필드 이름을 한 줄 남긴다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, [rawVoice({ voice_id: "tc_bad", voice_name: undefined }), rawVoice()]),
		);
		const voices = (await list())?.voices ?? [];
		expect(voices.map((voice) => voice.voiceId)).toEqual(["tc_0001"]);
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 성우 1명 제외: voice_name"],
		]);
	});

	it("공개 성우가 모두 어긋나면 BAD_GATEWAY·provider_error다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockResolvedValue(
			json(200, [rawVoice({ models: undefined }), rawVoice({ voice_id: "" })]),
		);
		await expect(list()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			data: { provider: "typecast", reason: "provider_error" },
		});
		expect(log.mock.calls).toEqual([
			["[voiceList] typecast 성우 2명 제외: models, voice_id"],
		]);
	});
});
```

새 테스트는 9개다. 연결 끊김(`TypeError`)과 10초 시간 초과는 SDK 쪽에 따로 도는 코드가 없어 Task 1 `runList` 표가 맡는다. 상태 코드 → 사유 표 전체도 `errors.test.ts`(`reasonFromHttp`·`runList`)가 고정하고, 여기서는 SDK 오류를 바꿔 담는 경로만 401·429·JSON이 아닌 응답으로 본다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @tts-pilot-app/api test src/providers/typecast.test.ts`
Expected: FAIL (`listVoices`가 없어 `list()`가 undefined)

- [ ] **Step 3: 구현** — `typecast.ts`를 아래로 바꾼다(`checkStatus` 동작은 그대로, SDK 오류 변환만 함수로 뽑는다).

```ts
import { TypecastAPIError, TypecastClient } from "@neosapience/typecast-js";
import { z } from "zod";

import type { Voice } from "./contract";
import {
	fieldNames,
	type ProviderClient,
	ProviderHttpError,
	providerError,
	runCheck,
	runList,
} from "./errors";

// Typecast SDK는 응답을 검사하지 않는다. 쓰는 필드만 검사한다.
const subscriptionSchema = z.object({
	plan: z.string(),
	credits: z.object({ plan_credits: z.number(), used_credits: z.number() }),
});

// 응답 모양: 배열이고 항목마다 유형이 있다. 어긋나면 목록 전체가 응답 검증 실패(provider_error)다.
// 공개 성우만 남기려고 유형만 먼저 본다. 커스텀 항목은 모양이 달라도 목록을 깨지 않는다.
const voiceTypesSchema = z.array(z.looseObject({ voice_type: z.string() }));
// 공개 성우 하나. 어긋난 성우는 그 성우만 뺀다(사용자 확정 2026-10-04).
const voiceSchema = z.object({
	voice_id: z.string().min(1),
	voice_name: z.object({ eng: z.string(), kor: z.string() }),
	gender: z.string().nullish(),
	age: z.string().nullish(),
	use_cases: z.array(z.string()).nullish(),
	models: z.array(
		z.object({ version: z.string(), emotions: z.array(z.string()) }),
	),
	// 오디오 src에 다른 스킴이 들어가지 않게 https만 받는다. 어긋나면 그 성우만 '샘플 없음'(null)이다
	preview_url: z.url({ protocol: /^https$/ }).nullish().catch(null),
});

// SDK 오류는 상태 코드만 바꿔 담는다. 응답 헤더를 주지 않는다(Retry-After 없음).
function toHttpError(error: unknown): never {
	throw error instanceof TypecastAPIError
		? new ProviderHttpError(error.statusCode)
		: error;
}

function toVoice(raw: z.infer<typeof voiceSchema>): Voice {
	const english = raw.voice_name.eng.trim();
	const name = raw.voice_name.kor.trim() || english;
	return {
		provider: "typecast",
		voiceId: raw.voice_id,
		name,
		englishName: english && english !== name ? english : null,
		// 모르는 성별 값은 '정보 없음'으로 보인다. 이름으로 추정하지 않는다
		gender: raw.gender === "male" || raw.gender === "female" ? raw.gender : null,
		age: raw.age ?? null,
		useCases: raw.use_cases ?? [],
		models: raw.models.map(({ version, emotions }) => ({
			model: version,
			emotions,
		})),
		previewUrl: raw.preview_url ?? null,
	};
}

export function createTypecast(apiKey: string): ProviderClient {
	// 키와 공식 호스트를 명시한다. 빠지면 SDK가 TYPECAST_API_KEY·TYPECAST_API_HOST로 대체한다.
	// source·generatedBy는 Typecast llms.txt의 연동 식별 규약이다(사용자 정보는 넣지 않는다).
	const client = new TypecastClient({
		apiKey,
		baseHost: "https://api.typecast.ai",
		source: "api-docs",
		generatedBy: "claude-code",
	});
	return {
		checkStatus: () =>
			// ponytail: SDK에 취소 옵션이 없어 runCheck의 10초 경주로만 끊는다. 끊긴 요청은 뒤에서 끝까지 돈다(상태를 바꾸지 않는 조회라 괜찮다). 생성(T8)은 끊는 방법을 그때 다시 정한다.
			runCheck("typecast", async () => {
				const raw = await client.getMySubscription().catch(toHttpError);
				const { plan, credits } = subscriptionSchema.parse(raw);
				const remaining = credits.plan_credits - credits.used_credits;
				return {
					status: remaining <= 0 ? "quota" : "connected",
					quota: {
						remaining,
						total: credits.plan_credits,
						plan,
						resetAt: null,
						overageAllowed: false,
					},
				};
			}),
		listVoices: () =>
			// 확인 호출과 같이 10초 경주로만 끊는다. 필터 없이 부른다: SDK 필터 타입에 voice_type이 없어 공개 성우만 남기는 것은 여기서 한다(T3 스펙 3절).
			runList("typecast", async () => {
				const raw = await client.getVoicesV3().catch(toHttpError);
				const originals = voiceTypesSchema
					.parse(raw)
					.filter((voice) => voice.voice_type === "original");
				const voices = new Map<string, Voice>();
				const dropped: unknown[] = [];
				for (const item of originals) {
					const parsed = voiceSchema.safeParse(item);
					if (!parsed.success) {
						dropped.push(parsed.error);
						continue;
					}
					const voice = toVoice(parsed.data);
					// 같은 id가 다시 오면 처음 것만 남긴다(화면의 React 키와 재생 상태가 id로 묶인다)
					if (!voices.has(voice.voiceId)) voices.set(voice.voiceId, voice);
				}
				if (dropped.length > 0) {
					// 뺀 수와 필드 이름만 남긴다(값·메시지 없음).
					console.error(
						`[voiceList] typecast 성우 ${dropped.length}명 제외: ${fieldNames(dropped).join(", ")}`,
					);
					// 모두 빠지면 공급자가 모양을 바꾼 것이다. 빈 목록이 아니라 응답 이상으로 보인다.
					if (voices.size === 0) throw providerError("typecast", "provider_error");
				}
				return {
					provider: "typecast" as const,
					voices: [...voices.values()],
					fetchedAt: new Date().toISOString(),
				};
			}),
	};
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @tts-pilot-app/api test src/providers/typecast.test.ts`
Expected: PASS(T2 확인 테스트와 목록 테스트 9개 모두)

- [ ] **Step 5: 포맷과 타입**

Run: `pnpm exec biome check --write packages/api/src/providers/typecast.ts packages/api/src/providers/typecast.test.ts && pnpm --filter @tts-pilot-app/api check-types`
Expected: 오류 0

---

### Task 3: `voiceList` 프로시저

**Files:**
- Modify: `packages/api/src/routers/index.ts`
- Modify: `apps/web/src/app/api/rpc/[[...rest]]/route.ts`(`onError`만. `authPaths`라 security 리뷰 대상이다)
- Test: `packages/api/src/routers/voice-list.test.ts`(신규)

**Interfaces:**
- Consumes: Task 1 `providerError`, `voiceListResultSchema`, `ProviderErrorData`; Task 2 `listVoices`.
- Produces: `appRouter.voiceList`(입력 `{ provider: "typecast" }`, 출력 `VoiceListResult`). 화면은 `orpc.voiceList.queryOptions({ input: { provider: "typecast" } })`로 부른다.

- [ ] **Step 1: 실패하는 테스트 쓰기**

```ts
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { voiceListResultSchema } from "../providers/contract";
import { createProviders } from "../providers/index";
import { fetchMock, json, useFetchMock } from "../providers/test-utils";
import { appRouter } from "./index";

const KEY = "typecast-router-test-key-0001";
const as = (ownerId: string | null, providers: Context["providers"]) =>
	createRouterClient(appRouter, {
		context: { db: {} as Context["db"], ownerId, providers },
	});
const voice = {
	voice_id: "tc_0001",
	voice_name: { eng: "Minji", kor: "민지" },
	voice_type: "original",
	gender: "female",
	age: "young_adult",
	models: [{ version: "ssfm-v30", emotions: ["normal"] }],
	use_cases: ["Game"],
	preview_url: "https://static2.typecast.ai/preview/tc_0001.mp3",
};

useFetchMock();

describe("voiceList", () => {
	it("소유자가 없으면 UNAUTHORIZED이고 공급자를 부르지 않는다", async () => {
		await expect(
			as(null, createProviders({ typecast: KEY })).voiceList({
				provider: "typecast",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("키가 없거나 공백이면 PRECONDITION_FAILED·no_key이고 공급자를 부르지 않는다", async () => {
		for (const typecast of [undefined, "  "]) {
			await expect(
				as("local-admin", createProviders({ typecast })).voiceList({
					provider: "typecast",
				}),
			).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
				data: { provider: "typecast", reason: "no_key" },
			});
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("정상 응답은 출력 스키마를 통과하고 결과에 키 문자열이 없다", async () => {
		fetchMock.mockResolvedValue(json(200, [voice]));
		const result = await as(
			"local-admin",
			createProviders({ typecast: KEY }),
		).voiceList({ provider: "typecast" });
		expect(voiceListResultSchema.parse(result)).toEqual(result);
		expect(result.voices).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain(KEY);
	});
});
```

테스트는 3개다. 입력 `z.literal("typecast")`의 거절은 oRPC·zod 동작이고, 사유 매핑은 Task 1·2 테스트가 고정한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @tts-pilot-app/api test src/routers/voice-list.test.ts`
Expected: FAIL (`voiceList` is not a function)

- [ ] **Step 3: 구현** — `routers/index.ts`의 import와 라우터에 더한다.

```ts
import {
	providerIdSchema,
	providerStatusResultSchema,
	voiceListResultSchema,
} from "../providers/contract";
import { providerError } from "../providers/errors";
```

`providerStatus` 아래:

```ts
	// 공개 성우 목록 전체. 공급자 문제는 사유를 붙여 던진다(T3 스펙 4절). 공급자는 T4·T5에서 넓힌다.
	voiceList: protectedProcedure
		.input(z.object({ provider: z.literal("typecast") }))
		.output(voiceListResultSchema)
		.handler(({ input, context }) => {
			const listVoices = context.providers?.[input.provider]?.listVoices;
			// 키가 없으면 공급자를 부르지 않는다.
			if (!listVoices) throw providerError(input.provider, "no_key");
			return listVoices();
		}),
```

- [ ] **Step 4: rpc 로그 한 줄로** — `apps/web/src/app/api/rpc/[[...rest]]/route.ts`. 공급자 문제(502·504)는 `runList`가 필요한 것만 남겼으므로 오류 객체 전체를 다시 찍지 않는다. import에 `ProviderErrorData` 타입을 더하고 `onError`를 아래로 바꾼다.

```ts
import type { ProviderErrorData } from "@tts-pilot-app/api/providers/contract";
```

```ts
		onError((error) => {
			// 의도한 4xx 거절(CSRF 403, UNAUTHORIZED, BAD_REQUEST, 공급자 412·429)은 남기지 않는다(AF-11). 그 밖의 오류만 남긴다.
			if (error instanceof ORPCError && error.status < 500) return;
			if (error instanceof ORPCError) {
				// 사유가 붙은 공급자 문제(BAD_GATEWAY·GATEWAY_TIMEOUT)는 runList가 필요한 것만 남겼다. 코드·공급자·사유만 한 줄 남긴다.
				const data = error.data as Partial<ProviderErrorData> | undefined;
				if (typeof data?.reason === "string") {
					console.error(`[rpc] ${error.code} ${data.provider} ${data.reason}`);
					return;
				}
				// 출력 검증 실패의 cause(ValidationError)는 data에 응답 값이 들어 있다. 코드·메시지·이슈 경로만 한 줄 남긴다.
				if (error.cause instanceof ValidationError) {
					const paths = error.cause.issues.map((issue) =>
						pathToString(issue.path),
					);
					console.error(
						`[rpc] ${error.code} ${error.message}: ${paths.join(", ")}`,
					);
					return;
				}
			}
			console.error(error);
		}),
```

curl 확인(Step 6)의 403·401은 4xx라 이 변경과 상관없다.

- [ ] **Step 5: 통과 확인과 검사**

Run: `pnpm --filter @tts-pilot-app/api test && pnpm exec biome check --write packages/api/src/routers "apps/web/src/app/api/rpc/[[...rest]]/route.ts" && pnpm check-types && pnpm exec biome check .`
Expected: 테스트 PASS, 타입·린트 오류 0(6·14행 증거)

- [ ] **Step 6(코디네이터): 서버 경로 확인(공급자 0회)** — 개발 서버에 curl로 확인한다. 공급자를 부르는 요청은 보내지 않는다.

```bash
# CSRF 헤더 없음 → 403, 루프백이 아닌 Host → 401(공급자 호출 없음)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3001/api/rpc/voiceList -H 'content-type: application/json' -d '{"json":{"provider":"typecast"}}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3001/api/rpc/voiceList -H 'content-type: application/json' -H 'x-csrf-token: orpc' -H 'host: example.com' -d '{"json":{"provider":"typecast"}}'
```

Expected: `403`, `401`. 두 번째가 401이 아니면 멈추고 보고한다(AC3). `x-csrf-token` 헤더 이름은 `SimpleCsrfProtectionLinkPlugin` 기본값이다(T2 QA와 같은 확인).

---

### Task 4: web 테스트 러너와 연결 상태 정리(CS-08, toView 테스트)

**Files:**
- Modify(코디네이터): `apps/web/package.json`
- Create: `apps/web/src/lib/connection-view.ts`, `apps/web/src/lib/connection-view.test.ts`
- Modify: `apps/web/src/components/connection-status.tsx`(toView를 옮김), `apps/web/src/components/provider-status-card.tsx`(초기화 날짜)

**Interfaces:**
- Produces: `toView(provider: ProviderId, query: QueryState): ProviderStatusResult | undefined`, `isUpcoming(at: string | null, now?: number): at is string`.

- [ ] **Step 1(코디네이터): vitest 들이기**

Run: `pnpm --filter web add -D vitest@^5.0.2`
그다음 `apps/web/package.json` `scripts`에 `"test": "vitest run --dir src"`를 더한다. vitest 5.0.2는 이미 lockfile에 있어 새 패키지를 받지 않는다. `pnpm-workspace.yaml`이 바뀌면 그 줄을 보고에 적는다.

- [ ] **Step 2: 실패하는 테스트 쓰기** — `apps/web/src/lib/connection-view.test.ts`

첫 확인 중(undefined)과 결과 그대로는 한 줄 분기라 테스트하지 않는다. 실패를 확인 실패로 바꾸는 두 경로만 고정한다.

```ts
import { describe, expect, it } from "vitest";

import { isUpcoming, toView } from "./connection-view";

const failedAt = Date.parse("2026-10-04T07:00:00.000Z");

describe("toView", () => {
	it("조회가 실패하면 그 시각의 확인 실패 결과다", () => {
		expect(
			toView("elevenlabs", { data: undefined, isError: true, errorUpdatedAt: failedAt }),
		).toEqual({
			provider: "elevenlabs",
			status: "check_failed",
			quota: null,
			providerCode: null,
			retryAfterSeconds: null,
			checkedAt: "2026-10-04T07:00:00.000Z",
		});
	});

	it("데이터 없이 실패한 조회를 다시 확인하는 동안에도 확인 실패를 유지한다(query-core가 오류를 지운다)", () => {
		expect(
			toView("typecast", { data: undefined, isError: false, errorUpdatedAt: failedAt })
				?.status,
		).toBe("check_failed");
	});
});

describe("isUpcoming", () => {
	const now = Date.parse("2026-10-04T00:00:00.000Z");
	it("지금보다 뒤인 시각만 참이다(CS-08)", () => {
		expect(isUpcoming("2026-10-20T00:00:00.000Z", now)).toBe(true);
		expect(isUpcoming("2026-09-20T00:00:00.000Z", now)).toBe(false);
		expect(isUpcoming("2026-10-04T00:00:00.000Z", now)).toBe(false);
		expect(isUpcoming(null, now)).toBe(false);
	});
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter web test`
Expected: FAIL (`./connection-view`를 찾지 못함)

- [ ] **Step 4: 구현** — `apps/web/src/lib/connection-view.ts`

```ts
import type {
	ProviderId,
	ProviderStatusResult,
} from "@tts-pilot-app/api/providers/contract";

export type QueryState = {
	data?: ProviderStatusResult;
	isError: boolean;
	errorUpdatedAt: number;
};

// 조회 자체가 실패하면(자체 서버 500, 연결 끊김, CSRF 403) 확인 실패와 같은 모양으로 보인다(T2 스펙 4절).
// 데이터 없이 실패한 조회를 다시 확인하는 동안 query-core(5.103.2 fetchState)는 오류를 지우고 pending으로 돌린다.
// errorUpdatedAt은 남으므로 그때도 확인 실패를 유지한다(첫 확인 중으로 돌아가지 않게, 연결 상태 브리프 6절).
export function toView(
	provider: ProviderId,
	query: QueryState,
): ProviderStatusResult | undefined {
	const failed =
		query.isError || (query.data === undefined && query.errorUpdatedAt > 0);
	if (!failed) return query.data;
	return {
		provider,
		status: "check_failed",
		quota: null,
		providerCode: null,
		retryAfterSeconds: null,
		checkedAt: new Date(query.errorUpdatedAt).toISOString(),
	};
}

// 사용량 초기화 시각이 지금보다 뒤일 때만 보인다(CS-08). 지난 시각은 공급자가 그대로 주는 값이다(무료 플랜으로 보임).
export const isUpcoming = (
	at: string | null,
	now = Date.now(),
): at is string => at !== null && Date.parse(at) > now;
```

`connection-status.tsx`에서 `QueryState` 타입과 `toView` 함수(33~57행)를 지우고 import한다:

```ts
import { toView } from "@/lib/connection-view";
```

`provider-status-card.tsx`: `import { isUpcoming } from "@/lib/connection-view";`를 더하고 `quotaText` 끝의 반환을 바꾼다.

```tsx
	return isUpcoming(quota.resetAt) ? (
		<>
			{characters} ·{" "}
			{chunk(`${dayFormat.format(new Date(quota.resetAt))} 초기화`)}
		</>
	) : (
		characters
	);
```

- [ ] **Step 5: 통과 확인과 검사**

Run: `pnpm --filter web test && pnpm exec biome check --write apps/web/src/lib apps/web/src/components/connection-status.tsx apps/web/src/components/provider-status-card.tsx && pnpm --filter web check-types`
Expected: 테스트 PASS(3개), 타입 오류 0

---

### Task 5: 검색·필터·선반 순수 함수

**Files:**
- Create: `apps/web/src/lib/voice-filter.ts`, `apps/web/src/lib/voice-filter.test.ts`
- Create: `apps/web/src/lib/voice-failure.ts`, `apps/web/src/lib/voice-failure.test.ts`

**Interfaces:**
- Consumes: `Voice`, `ProviderErrorData`, `ProviderFailure`(타입만), `ORPCError`(`@orpc/client`).
- Produces:
  - `failureOf(error: unknown): ProviderFailure | "unauthorized" | null`(Task 8이 import한다)
  - `type VoiceFilters = { models: readonly string[]; genders: readonly string[]; ages: readonly string[]; useCases: readonly string[] }`, `type FilterAxis = keyof VoiceFilters`, `EMPTY_FILTERS`
  - `GENDER_LABEL`, `AGE_LABEL`, `USE_CASE_LABEL`(`Map<string, string>`), `labelOf(labels, value): string`
  - `hasConditions(query, filters): boolean`, `filterVoices(voices, query, filters): Voice[]`
  - `type FilterOption = { value: string; label: string }`, `filterOptions(voices): Record<FilterAxis, FilterOption[]>`
  - `type UseCaseGroup = { useCase: string | null; voices: Voice[] }`, `groupByUseCase(voices): UseCaseGroup[]`

- [ ] **Step 1: 실패하는 테스트 쓰기** — `voice-filter.test.ts`

```ts
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { describe, expect, it } from "vitest";

import {
	EMPTY_FILTERS,
	filterOptions,
	filterVoices,
	groupByUseCase,
	hasConditions,
} from "./voice-filter";

const voice = (voiceId: string, overrides: Partial<Voice> = {}): Voice => ({
	provider: "typecast",
	voiceId,
	name: "민지",
	englishName: "Minji",
	gender: "female",
	age: "young_adult",
	useCases: ["Ads/Promotion"],
	models: [{ model: "ssfm-v30", emotions: ["normal"] }],
	previewUrl: null,
	...overrides,
});
const minji = voice("a");
const junho = voice("b", {
	name: "준호",
	englishName: "Junho",
	gender: "male",
	age: "middle_age",
	useCases: ["Game", "Ads/Promotion"],
	models: [{ model: "ssfm-v21", emotions: [] }],
});
const sora = voice("c", {
	name: "소라",
	englishName: null,
	gender: null,
	age: null,
	useCases: [],
	models: [
		{ model: "ssfm-v30", emotions: [] },
		{ model: "ssfm-v21", emotions: [] },
	],
});
const all = [minji, junho, sora];
const ids = (list: readonly Voice[]) => list.map((item) => item.voiceId);
const only = (filters: Partial<typeof EMPTY_FILTERS>) => ({
	...EMPTY_FILTERS,
	...filters,
});

describe("filterVoices", () => {
	it("조건이 없으면 전체를 받은 순서대로 돌려준다", () => {
		expect(ids(filterVoices(all, "", EMPTY_FILTERS))).toEqual(["a", "b", "c"]);
	});

	it("한글·영문 이름 부분 일치이고 대소문자와 앞뒤 공백을 가리지 않는다", () => {
		expect(ids(filterVoices(all, "준", EMPTY_FILTERS))).toEqual(["b"]);
		expect(ids(filterVoices(all, "  JUN ", EMPTY_FILTERS))).toEqual(["b"]);
		expect(ids(filterVoices(all, "minji", EMPTY_FILTERS))).toEqual(["a"]);
		expect(ids(filterVoices(all, "없는이름", EMPTY_FILTERS))).toEqual([]);
	});

	it("NFD로 들어온 한글도 찾는다", () => {
		expect(ids(filterVoices(all, "민".normalize("NFD"), EMPTY_FILTERS))).toEqual(["a"]);
	});

	it("같은 축은 OR이고 값이 없는 성우는 그 축을 고르면 빠진다", () => {
		expect(ids(filterVoices(all, "", only({ genders: ["female", "male"] })))).toEqual(["a", "b"]);
		expect(ids(filterVoices(all, "", only({ ages: ["young_adult", "middle_age"] })))).toEqual(["a", "b"]);
	});

	it("다른 축은 AND다", () => {
		expect(
			ids(filterVoices(all, "", only({ genders: ["male"], useCases: ["Ads/Promotion"] }))),
		).toEqual(["b"]);
		expect(
			ids(filterVoices(all, "", only({ genders: ["female"], useCases: ["Game"] }))),
		).toEqual([]);
	});

	it("모델은 성우가 가진 모델 가운데 하나라도 맞으면 남는다", () => {
		expect(ids(filterVoices(all, "", only({ models: ["ssfm-v21"] })))).toEqual(["b", "c"]);
	});

	it("검색과 필터를 함께 건다", () => {
		expect(ids(filterVoices(all, "소", only({ models: ["ssfm-v30"] })))).toEqual(["c"]);
	});
});

describe("hasConditions", () => {
	it("공백뿐인 검색어는 조건이 아니다", () => {
		expect(hasConditions("", EMPTY_FILTERS)).toBe(false);
		expect(hasConditions("  ", EMPTY_FILTERS)).toBe(false);
		expect(hasConditions("민", EMPTY_FILTERS)).toBe(true);
		expect(hasConditions("", only({ ages: ["elder"] }))).toBe(true);
	});
});

describe("filterOptions", () => {
	it("받은 목록에 있는 값만, 아는 값은 정한 순서로, 콘텐츠는 인원 많은 순으로 만든다", () => {
		expect(filterOptions(all)).toEqual({
			models: [
				{ value: "ssfm-v30", label: "ssfm-v30" },
				{ value: "ssfm-v21", label: "ssfm-v21" },
			],
			genders: [
				{ value: "female", label: "여성" },
				{ value: "male", label: "남성" },
			],
			ages: [
				{ value: "young_adult", label: "청년" },
				{ value: "middle_age", label: "중년" },
			],
			useCases: [
				{ value: "Ads/Promotion", label: "광고·홍보" },
				{ value: "Game", label: "게임" },
			],
		});
	});

	it("모르는 값은 공급자 값 그대로 아는 값 뒤에 둔다", () => {
		const options = filterOptions([
			...all,
			voice("d", { age: "senior", useCases: ["Podcast Intro"] }),
		]);
		expect(options.ages.at(-1)).toEqual({ value: "senior", label: "senior" });
		expect(options.useCases).toContainEqual({
			value: "Podcast Intro",
			label: "Podcast Intro",
		});
	});

	it("모델은 새 판이 먼저다", () => {
		const options = filterOptions([
			voice("x", { models: [{ model: "ssfm-v21", emotions: [] }] }),
			voice("y", { models: [{ model: "ssfm-v30", emotions: [] }] }),
			voice("z", { models: [{ model: "ssfm-v31", emotions: [] }] }),
		]);
		expect(options.models.map((option) => option.value)).toEqual([
			"ssfm-v31",
			"ssfm-v30",
			"ssfm-v21",
		]);
	});
});

describe("groupByUseCase", () => {
	it("인원 많은 순이고 콘텐츠가 없는 성우는 마지막 묶음(null)이다", () => {
		expect(
			groupByUseCase(all).map((group) => [group.useCase, ids(group.voices)]),
		).toEqual([
			["Ads/Promotion", ["a", "b"]],
			["Game", ["b"]],
			[null, ["c"]],
		]);
	});

	it("인원이 같으면 처음 나온 순이고, 한 성우의 같은 콘텐츠는 한 번만 센다", () => {
		const groups = groupByUseCase([
			voice("p", { useCases: ["Anime", "Anime"] }),
			voice("q", { useCases: ["Rapper"] }),
		]);
		expect(groups.map((group) => [group.useCase, group.voices.length])).toEqual([
			["Anime", 1],
			["Rapper", 1],
		]);
	});
});
```

`labelOf`는 `Map`의 `get ?? 값` 한 줄이라 따로 테스트하지 않는다(모르는 값은 `filterOptions` "모르는 값" 테스트가 지난다).

`voice-failure.test.ts`:

```ts
import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { failureOf } from "./voice-failure";

const providerFailure = (reason: string) =>
	new ORPCError("BAD_GATEWAY", { data: { provider: "typecast", reason } });

describe("failureOf", () => {
	it("ORPCError가 아니면 null이다(오류 경계로 던진다)", () => {
		expect(failureOf(new TypeError("Failed to fetch"))).toBeNull();
		expect(failureOf(null)).toBeNull();
	});

	it("소유자 없음(UNAUTHORIZED)은 unauthorized다", () => {
		expect(failureOf(new ORPCError("UNAUTHORIZED"))).toBe("unauthorized");
	});

	it("사유가 붙은 공급자 오류는 그 사유다", () => {
		expect(failureOf(providerFailure("provider_error"))).toBe("provider_error");
		expect(
			failureOf(
				new ORPCError("PRECONDITION_FAILED", {
					data: { provider: "typecast", reason: "no_key" },
				}),
			),
		).toBe("no_key");
	});

	it("모르는 사유, 객체 기본 속성 이름, data 없음은 null이다", () => {
		expect(failureOf(providerFailure("foo"))).toBeNull();
		expect(failureOf(providerFailure("constructor"))).toBeNull();
		expect(failureOf(new ORPCError("INTERNAL_SERVER_ERROR"))).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test src/lib`
Expected: FAIL (`./voice-filter`, `./voice-failure`를 찾지 못함)

- [ ] **Step 3: 구현** — `apps/web/src/lib/voice-filter.ts`

```ts
import type { Voice } from "@tts-pilot-app/api/providers/contract";

// 성우 캐스팅의 검색·필터·선반(T3 스펙 5절, 브리프 5·6절). 화면 없이 테스트하는 순수 함수만 둔다.

export type VoiceFilters = {
	models: readonly string[];
	genders: readonly string[];
	ages: readonly string[];
	useCases: readonly string[];
};
export type FilterAxis = keyof VoiceFilters;

export const EMPTY_FILTERS: VoiceFilters = {
	models: [],
	genders: [],
	ages: [],
	useCases: [],
};

// 브리프 6절 표. Map의 순서가 선택지 순서다.
export const GENDER_LABEL = new Map([
	["female", "여성"],
	["male", "남성"],
]);
export const AGE_LABEL = new Map([
	["child", "어린이"],
	["teenager", "청소년"],
	["young_adult", "청년"],
	["middle_age", "중년"],
	["elder", "노년"],
]);
export const USE_CASE_LABEL = new Map([
	["Ads/Promotion", "광고·홍보"],
	["Audiobook/Storytelling", "오디오북·이야기"],
	["TikTok/Reels/Shorts", "틱톡·릴스·쇼츠"],
	["Game", "게임"],
	["E-learning/Explainer", "교육·설명"],
	["Conversational", "대화"],
	["Radio/Podcast", "라디오·팟캐스트"],
	["Anime", "애니메이션"],
	["Documentary", "다큐멘터리"],
	["Voicemail/Voice Assistant", "음성 안내"],
	["Announcer", "아나운서"],
	["News Reporter", "뉴스 리포터"],
	["Rapper", "랩"],
]);

// 모르는 값은 공급자 값 그대로 보인다(브리프 6절).
export const labelOf = (labels: Map<string, string>, value: string) =>
	labels.get(value) ?? value;

const normalize = (text: string) => text.normalize("NFC").trim().toLowerCase();

export function hasConditions(query: string, filters: VoiceFilters): boolean {
	return (
		normalize(query) !== "" ||
		Object.values(filters).some((values) => values.length > 0)
	);
}

// 고른 값이 없는 축은 거르지 않는다. 값이 없는(null) 성우는 그 축을 고르면 빠진다.
const anyOf = (
	selected: readonly string[],
	values: readonly (string | null)[],
) =>
	selected.length === 0 ||
	values.some((value) => value !== null && selected.includes(value));

// 같은 축은 OR, 다른 축은 AND(REQ-02). 검색은 한글·영문 이름 부분 일치.
export function filterVoices(
	voices: readonly Voice[],
	query: string,
	filters: VoiceFilters,
): Voice[] {
	const needle = normalize(query);
	return voices.filter(
		(voice) =>
			(needle === "" ||
				normalize(voice.name).includes(needle) ||
				normalize(voice.englishName ?? "").includes(needle)) &&
			anyOf(
				filters.models,
				voice.models.map((model) => model.model),
			) &&
			anyOf(filters.genders, [voice.gender]) &&
			anyOf(filters.ages, [voice.age]) &&
			anyOf(filters.useCases, voice.useCases),
	);
}

export type UseCaseGroup = { useCase: string | null; voices: Voice[] };

// 콘텐츠별 선반. 인원 많은 순, 같으면 처음 나온 순(정렬은 안정적이다). 콘텐츠가 없는 성우는 마지막 묶음(null)이다.
export function groupByUseCase(voices: readonly Voice[]): UseCaseGroup[] {
	const groups = new Map<string, Voice[]>();
	const none: Voice[] = [];
	for (const voice of voices) {
		if (voice.useCases.length === 0) none.push(voice);
		for (const useCase of new Set(voice.useCases)) {
			const members = groups.get(useCase) ?? [];
			members.push(voice);
			groups.set(useCase, members);
		}
	}
	const sorted = [...groups]
		.map(([useCase, members]) => ({ useCase, voices: members }))
		.sort((a, b) => b.voices.length - a.voices.length);
	return none.length > 0 ? [...sorted, { useCase: null, voices: none }] : sorted;
}

export type FilterOption = { value: string; label: string };

// 아는 값은 표 순서, 모르는 값은 그 뒤에 처음 나온 순서
function ordered(
	values: ReadonlySet<string>,
	labels: Map<string, string>,
): FilterOption[] {
	const known = [...labels.keys()].filter((value) => values.has(value));
	const unknown = [...values].filter((value) => !labels.has(value));
	return [...known, ...unknown].map((value) => ({
		value,
		label: labelOf(labels, value),
	}));
}

// 받은 목록에 있는 값으로 선택지를 만든다(공급자가 새 값을 더해도 보인다, 스펙 5절).
export function filterOptions(
	voices: readonly Voice[],
): Record<FilterAxis, FilterOption[]> {
	const models = new Set<string>();
	const genders = new Set<string>();
	const ages = new Set<string>();
	for (const voice of voices) {
		for (const { model } of voice.models) models.add(model);
		if (voice.gender) genders.add(voice.gender);
		if (voice.age) ages.add(voice.age);
	}
	return {
		// 공급자 값 그대로, 새 판(숫자가 큰 것)이 먼저
		models: [...models]
			.sort((a, b) => b.localeCompare(a, "en", { numeric: true }))
			.map((value) => ({ value, label: value })),
		genders: ordered(genders, GENDER_LABEL),
		ages: ordered(ages, AGE_LABEL),
		useCases: groupByUseCase(voices).flatMap(({ useCase }) =>
			useCase === null
				? []
				: [{ value: useCase, label: labelOf(USE_CASE_LABEL, useCase) }],
		),
	};
}
```

`apps/web/src/lib/voice-failure.ts`(Task 8 `voice-casting.tsx`에 두려던 함수를 테스트하려고 여기 둔다):

```ts
import { ORPCError } from "@orpc/client";
import type {
	ProviderErrorData,
	ProviderFailure,
} from "@tts-pilot-app/api/providers/contract";

// 화면이 안내를 고르는 사유(스펙 4절). 사유가 늘면 타입 검사가 이 표를 고치게 한다.
const KNOWN = {
	no_key: true,
	provider_auth: true,
	no_permission: true,
	quota: true,
	rate_limit: true,
	provider_error: true,
	unknown_outcome: true,
} as const satisfies Record<ProviderFailure, true>;

// 화면 안에서 보일 실패. 그 밖(500, 연결 끊김, 모르는 사유)은 null이라 오류 경계로 던진다.
// 사유는 서버가 준 문자열이라 객체 기본 속성 이름(constructor 등)에 속지 않게 Object.hasOwn으로 본다.
export function failureOf(
	error: unknown,
): ProviderFailure | "unauthorized" | null {
	if (!(error instanceof ORPCError)) return null;
	if (error.code === "UNAUTHORIZED") return "unauthorized";
	const reason = (error.data as Partial<ProviderErrorData> | undefined)
		?.reason;
	return reason !== undefined && Object.hasOwn(KNOWN, reason) ? reason : null;
}
```

- [ ] **Step 4: 통과 확인과 검사**

Run: `pnpm --filter web test && pnpm exec biome check --write apps/web/src/lib && pnpm --filter web check-types`
Expected: PASS(`connection-view` 3개, `voice-filter` 13개, `voice-failure` 4개, 합계 20개), 오류 0

---

### Task 6: 공용 프리미티브와 토큰(CS-04·CS-05·AF-05·검색 칸 대비)

**Files:**
- Modify: `packages/ui/src/components/spinner.tsx`, `empty.tsx`, `badge.tsx`, `packages/ui/src/styles/globals.css`
- Create: `apps/web/src/components/notice.tsx`
- Modify: `apps/web/src/components/connection-status.tsx`, `apps/web/src/components/provider-status-card.tsx`(Spinner 호출 확인만)

편집 전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다.

**Interfaces:**
- Produces: `Spinner`(`aria-hidden`이면 숨김, 아니면 `role="status"`), `EmptyTitle`(`h2`), `Badge variant="primary"`, CSS 유틸 `grid-cols-cards`, 화면 너비 `2xl`(1440px), `Notice({ icon, title, description, children, role }: { icon?: LucideIcon; title: string; description?: ReactNode; children?: ReactNode; role?: "alert" })`.

- [ ] **Step 1: `Spinner`**

```tsx
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Loader2Icon } from "lucide-react";

// 혼자 쓰이면 진행 상태를 알린다(role="status"). 버튼 안처럼 옆 글자가 상태를 알리면 aria-hidden을 넘겨 숨긴다(CS-05).
function Spinner({
	className,
	"aria-hidden": ariaHidden,
	...props
}: React.ComponentProps<"svg">) {
	const hidden = ariaHidden === true || ariaHidden === "true";
	return (
		<Loader2Icon
			data-slot="spinner"
			{...(hidden
				? { "aria-hidden": true }
				: { role: "status", "aria-label": "불러오는 중" })}
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	);
}

export { Spinner };
```

- [ ] **Step 2: `EmptyTitle`을 `h2`로(AF-05)**

```tsx
// 빈 상태의 제목. 쓰는 곳이 모두 페이지 h1 아래라 h2다(AF-05).
function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return (
		<h2
			data-slot="empty-title"
			className={cn(
				"cn-font-heading font-bold text-lg tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}
```

- [ ] **Step 3: `Badge` `primary` 변형** — `variant` 객체에 더한다.

```ts
				// 옅은 청록 바탕 + 청록 글자(성우 카드 '재생 중')
				primary: "bg-primary-subtle text-primary",
```

`variant` 위 주석 "T2가 쓰는 변형만 둔다"를 "쓰는 변형만 둔다. 다른 변형은 처음 쓰는 TASK가 더한다."로 바꾼다.

- [ ] **Step 4: 토큰과 격자 유틸** — `globals.css`

`:root`의 `--input`:

```css
	--input: oklch(0 0 0 / 0.45); /* 입력 경계. 흰 카드 3.35:1, 페이지 바탕 3.32:1(3:1 이상, T3) */
```

`.dark`의 `--input`:

```css
	--input: oklch(1 0 0 / 0.35); /* 카드 3.16:1, 바탕 3.21:1 */
```

`@theme`의 `--breakpoint-xl` 아래에 5열 기준 너비를 더하고, 위 주석을 고친다(계획 리뷰 U1, 사용자 확정 2026-10-04):

```css
/* HTML 시안의 반응형 기준: 768px(md, 기본값)와 1200px(xl). 성우 카드 5열은 1440px(2xl) 이상 */
@theme {
	--breakpoint-xl: 75rem;
	--breakpoint-2xl: 90rem;
```

`@layer base` 앞에:

```css
/* 카드 격자: 칸 최소 15rem(240px)으로 열 수를 정한다. 본문 872px(1024 화면)에서 3열(CS-04, 성우 캐스팅 브리프 8절) */
@utility grid-cols-cards {
	grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
}
```

- [ ] **Step 5: 본문 안내 `Notice`로 뽑기** — `apps/web/src/components/notice.tsx`. 연결 상태의 소유자 안내와 성우 캐스팅의 오류·빈 상태 셋이 같은 `Empty` 묶음을 쓴다. 문구는 부르는 쪽이 넘긴다.

```tsx
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tts-pilot-app/ui/components/empty";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// 본문 자리의 안내 하나(소유자 없음, 오류, 빈 상태). 제목은 h2(AF-05), 아래에 링크·버튼 묶음(children).
// 새로 나타나 알려야 하는 안내(오류 등)는 role="alert"를 넘긴다.
export function Notice({
	icon: Icon,
	title,
	description,
	children,
	role,
}: {
	icon?: LucideIcon;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
	role?: "alert";
}) {
	return (
		<Empty className="border bg-card" role={role}>
			<EmptyHeader>
				{Icon ? (
					<EmptyMedia variant="icon">
						<Icon aria-hidden="true" />
					</EmptyMedia>
				) : null}
				<EmptyTitle>{title}</EmptyTitle>
				{description ? <EmptyDescription>{description}</EmptyDescription> : null}
			</EmptyHeader>
			{children ? (
				<EmptyContent className="flex-row flex-wrap justify-center">
					{children}
				</EmptyContent>
			) : null}
		</Empty>
	);
}
```

`connection-status.tsx`: `Empty*` import를 지우고(`Link2`는 그대로 쓴다) `import { Notice } from "./notice";`를 더해 소유자 없음 분기를 바꾼다.

```tsx
	if (queries.some((query) => isUnauthorized(query.error))) {
		return (
			<Notice
				icon={Link2}
				title="이 주소에서는 공급자 연결을 확인할 수 없어요"
				description={
					<>
						개발 서버(
						<code translate="no" className="font-mono">
							pnpm dev
						</code>
						)를 127.0.0.1 또는 localhost 주소로 열어 주세요.
					</>
				}
			/>
		);
	}
```

카드 격자(CS-04):

```tsx
			<div className="grid grid-cols-cards gap-4 xl:grid-cols-3">
```

`provider-status-card.tsx`의 `<Spinner data-icon="inline-start" aria-hidden="true" />`는 그대로 둔다(새 규칙으로 숨겨진다).

- [ ] **Step 6: 검사**

Run: `pnpm exec biome check --write packages/ui/src apps/web/src/components && pnpm check-types && pnpm --filter web test`
Expected: 오류 0, PASS

- [ ] **Step 7(코디네이터): 연결 상태 회귀 확인(실제 조회 없음)** — agent-browser로 `/connections`를 연다. 먼저 `--init-script`로 T2 흉내 스크립트(scratchpad `mock-fetch.js`, `providerStatus` 흉내)를 넣고, 그다음 `network route "**/api/rpc/**" --abort`로 뒤를 받친다. 1024에서 카드 3열, 1440에서 3열, 768에서 2+1, 키 없음 카드와 소유자 안내 제목이 `h2`인지(접근성 트리) 본다. 흉내 결과의 ElevenLabs `resetAt`을 과거·미래로 바꿔 날짜가 지난 쪽에서만 숨는지 본다(S18 예비). 실제 조회가 0회인지 서버 로그로 확인한다.

---

### Task 7: 샘플 플레이어와 성우 카드

**Files:**
- Create: `apps/web/src/lib/sample-state.ts`, `apps/web/src/lib/sample-state.test.ts`
- Create: `apps/web/src/components/sample-player.tsx`, `apps/web/src/components/voice-card.tsx`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Consumes: Task 5 `GENDER_LABEL`, `AGE_LABEL`, `USE_CASE_LABEL`, `labelOf`; Task 6 `Badge variant="primary"`, `Spinner`.
- Produces:
  - `lib/sample-state.ts`: `type SampleStatus = "idle" | "loading" | "playing" | "failed"`, `type Current`, `pressSample(current, voiceId, name): { next: Current; effect: "stop" | "load" }`, `playFailed(current, voiceId): Current`, `playing(current, voiceId): Current`
  - `SamplePlayerProvider({ children })`, `useSample(voiceId: string): { status: SampleStatus; toggle(voiceId, name, url): void }`, `VoiceCard({ voice }: { voice: Voice })`.

- [ ] **Step 1: 샘플 상태 전이 테스트** — `apps/web/src/lib/sample-state.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { type Current, playFailed, playing, pressSample } from "./sample-state";

const minji = (status: NonNullable<Current>["status"]): Current => ({
	voiceId: "a",
	name: "민지",
	status,
});

describe("pressSample", () => {
	it("불러오는 중이거나 재생 중인 같은 성우를 누르면 멈춘다", () => {
		expect(pressSample(minji("loading"), "a", "민지")).toEqual({
			next: null,
			effect: "stop",
		});
		expect(pressSample(minji("playing"), "a", "민지")).toEqual({
			next: null,
			effect: "stop",
		});
	});

	it("실패한 같은 성우를 누르면 다시 불러온다", () => {
		expect(pressSample(minji("failed"), "a", "민지")).toEqual({
			next: minji("loading"),
			effect: "load",
		});
	});

	it("다른 성우를 누르면 그 성우를 불러온다(앞 성우의 상태는 사라진다)", () => {
		expect(pressSample(minji("playing"), "b", "준호")).toEqual({
			next: { voiceId: "b", name: "준호", status: "loading" },
			effect: "load",
		});
		expect(pressSample(null, "a", "민지").effect).toBe("load");
	});
});

describe("playFailed", () => {
	it("지금 성우의 실패는 failed이고, 앞 성우의 늦은 실패는 지금 상태를 바꾸지 않는다", () => {
		expect(playFailed(minji("loading"), "a")).toEqual(minji("failed"));
		const junho: Current = { voiceId: "b", name: "준호", status: "playing" };
		expect(playFailed(junho, "a")).toBe(junho);
		expect(playFailed(null, "a")).toBeNull();
	});
});

describe("playing", () => {
	it("불러오던 성우는 playing이 되고, 이미 재생 중이면 같은 객체라 다시 알리지 않는다", () => {
		expect(playing(minji("loading"), "a")).toEqual(minji("playing"));
		const current = minji("playing");
		expect(playing(current, "a")).toBe(current);
		expect(playing(null, "a")).toBeNull();
	});
});
```

Run: `pnpm --filter web test src/lib/sample-state.test.ts`
Expected: FAIL (`./sample-state`를 찾지 못함)

- [ ] **Step 2: 샘플 상태 전이** — `apps/web/src/lib/sample-state.ts`

```ts
// 샘플 플레이어의 상태 전이(브리프 7절). 오디오 요소 조작과 스크린 리더 알림은 sample-player.tsx가 한다.
// 지금 재생 대상 하나만 상태를 가진다. 카드는 성우 id로 읽으므로 같은 성우의 카드는 모두 같은 상태다.
export type SampleStatus = "idle" | "loading" | "playing" | "failed";
export type Current = {
	voiceId: string;
	name: string;
	status: Exclude<SampleStatus, "idle">;
} | null;

// 샘플 버튼을 눌렀다. 불러오는 중이거나 재생 중인 같은 성우면 멈추고, 그 밖(다른 성우, 실패한 같은 성우)은 새로 불러온다.
export function pressSample(
	current: Current,
	voiceId: string,
	name: string,
): { next: Current; effect: "stop" | "load" } {
	if (current?.voiceId === voiceId && current.status !== "failed") {
		return { next: null, effect: "stop" };
	}
	return { next: { voiceId, name, status: "loading" }, effect: "load" };
}

// 재생이 실패했다. 이미 다른 성우로 바뀌었으면(앞 성우의 늦은 실패) 그대로 둔다.
export function playFailed(current: Current, voiceId: string): Current {
	return current?.voiceId === voiceId
		? { ...current, status: "failed" }
		: current;
}

// 재생이 시작됐다. 이미 재생 중이거나(버퍼링 뒤 다시 온 playing) 다른 성우면 같은 객체를 돌려준다(다시 알리지 않는다).
export function playing(current: Current, voiceId: string): Current {
	return current?.voiceId === voiceId && current.status !== "playing"
		? { ...current, status: "playing" }
		: current;
}
```

Run: `pnpm --filter web test src/lib/sample-state.test.ts`
Expected: PASS(5개)

- [ ] **Step 3: 샘플 플레이어** — `sample-player.tsx`

```tsx
"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	type Current,
	playFailed,
	playing,
	pressSample,
	type SampleStatus,
} from "@/lib/sample-state";

type Toggle = (voiceId: string, name: string, url: string) => void;

const SamplePlayerContext = createContext<{
	current: Current;
	toggle: Toggle;
} | null>(null);

// 페이지에 오디오 요소 하나를 두고 모든 카드가 함께 쓴다. 한 번에 하나만 재생한다(REQ-03, 스펙 5절).
// 기본 샘플은 공급자 주소를 브라우저가 바로 재생한다(과금 없음). 시험 생성과 합치지 않는다.
// ponytail: 상태가 바뀌면 카드 전부가 다시 그려진다(614장). 느려지면 성우 id별 구독(useSyncExternalStore)으로 바꾼다.
export function SamplePlayerProvider({ children }: { children: ReactNode }) {
	const audioRef = useRef<HTMLAudioElement>(null);
	// 마지막으로 불러온 성우. 앞 성우의 늦은 실패가 다른 성우를 듣는 중에 알림을 띄우지 않게 거른다.
	const latestVoiceId = useRef<string | null>(null);
	const [current, setCurrent] = useState<Current>(null);
	const [announcement, setAnnouncement] = useState("");

	// 페이지를 떠나면 멈춘다(AC11).
	useEffect(() => {
		const audio = audioRef.current;
		return () => audio?.pause();
	}, []);

	// 재생 실패 하나로 play() 거절과 오디오 error 이벤트가 함께 쓴다.
	function markFailed(voiceId: string, name: string) {
		if (latestVoiceId.current !== voiceId) return;
		setCurrent((latest) => playFailed(latest, voiceId));
		setAnnouncement(`${name} 샘플을 재생하지 못했어요`);
	}

	const toggle: Toggle = (voiceId, name, url) => {
		const audio = audioRef.current;
		if (!audio) return;
		const { next, effect } = pressSample(current, voiceId, name);
		setCurrent(next);
		if (effect === "stop") {
			latestVoiceId.current = null;
			audio.pause();
			// 받던 샘플을 끊는다. src를 빈 문자열로 두면 페이지 주소를 불러와 error가 난다.
			audio.removeAttribute("src");
			audio.load();
			setAnnouncement(`${name} 샘플을 멈췄어요`);
			return;
		}
		latestVoiceId.current = voiceId;
		audio.src = url;
		setAnnouncement("");
		audio.play().catch((error: unknown) => {
			// 다른 샘플로 바뀌거나 멈춰서 끊긴 play()는 실패가 아니다.
			if (error instanceof DOMException && error.name === "AbortError") return;
			markFailed(voiceId, name);
		});
	};

	return (
		<SamplePlayerContext value={{ current, toggle }}>
			{children}
			{/* 화면에 보이지 않는다. 기본 샘플 재생에만 쓴다 */}
			<audio
				ref={audioRef}
				preload="none"
				onPlaying={() => {
					const next = playing(current, latestVoiceId.current ?? "");
					// 버퍼링 뒤 다시 온 playing은 같은 객체라 다시 알리지 않는다.
					if (next === current || next === null) return;
					setCurrent(next);
					setAnnouncement(`${next.name} 샘플 재생 중`);
				}}
				onEnded={() => setCurrent(null)}
				onError={(event) => {
					// 멈출 때 src를 지워 생긴 이벤트는 실패가 아니다.
					if (!event.currentTarget.getAttribute("src") || !current) return;
					markFailed(current.voiceId, current.name);
				}}
			/>
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</SamplePlayerContext>
	);
}

// 같은 성우의 카드(여러 선반)는 모두 같은 상태를 본다.
export function useSample(voiceId: string) {
	const player = useContext(SamplePlayerContext);
	if (!player) throw new Error("useSample은 SamplePlayerProvider 안에서만 쓴다");
	const status: SampleStatus =
		player.current?.voiceId === voiceId ? player.current.status : "idle";
	return { status, toggle: player.toggle };
}
```

- [ ] **Step 4: 카드 그리기 미루기** — `apps/web/src/index.css` 끝에 더한다.

```css
/* 화면 밖 성우 카드는 그리기를 미룬다(T3 스펙 5절, rendering-content-visibility). 결과 격자의 li에만 붙인다.
   선반은 5장뿐이고, 가로 줄에서는 화면 밖 카드의 자리값이 줄 높이를 늘린다.
   높이는 카드 한 장의 대략값이다. QA(20행)에서 실제 카드 높이를 재 맞춘다. */
.voice-card {
	content-visibility: auto;
	contain-intrinsic-size: auto 14rem;
}
```

- [ ] **Step 5: 성우 카드** — `voice-card.tsx`

```tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Play, Square } from "lucide-react";

import {
	AGE_LABEL,
	GENDER_LABEL,
	labelOf,
	USE_CASE_LABEL,
} from "@/lib/voice-filter";

import { useSample } from "./sample-player";

// 카드에 보이는 콘텐츠 태그 수. 나머지는 "+N"(접근 이름에는 모두 넣는다, 브리프 5절)
const VISIBLE_TAGS = 2;
const tagClass =
	"rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs";

// 브리프 5절 카드와 7절 샘플 버튼 상태표.
export function VoiceCard({ voice }: { voice: Voice }) {
	const { status, toggle } = useSample(voice.voiceId);
	const playing = status === "playing";
	const { previewUrl } = voice;
	const useCases = voice.useCases.map((value) => labelOf(USE_CASE_LABEL, value));
	return (
		<article
			className={cn(
				"flex h-full flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset transition-colors",
				// 재생 중: 안쪽 2px 청록 링(크기가 바뀌지 않고, 가로 선반의 넘김 영역에서 잘리지 않는다)
				playing && "ring-2 ring-primary",
			)}
		>
			<div className="flex items-start gap-2">
				<h3 className="min-w-0 flex-1">
					<span className="font-bold text-lg">{voice.name}</span>
					{voice.englishName ? (
						<span
							translate="no"
							className="ml-1.5 text-muted-foreground text-sm"
						>
							{voice.englishName}
						</span>
					) : null}
				</h3>
				{playing ? <Badge variant="primary">재생 중</Badge> : null}
			</div>
			<p className="text-muted-foreground text-sm">
				{voice.gender ? labelOf(GENDER_LABEL, voice.gender) : "성별 정보 없음"}{" "}
				· {voice.age ? labelOf(AGE_LABEL, voice.age) : "연령 정보 없음"}
			</p>
			{useCases.length > 0 ? (
				<p className="flex flex-wrap gap-1.5">
					<span className="sr-only">콘텐츠: {useCases.join(", ")}</span>
					{useCases.slice(0, VISIBLE_TAGS).map((label) => (
						<span key={label} aria-hidden="true" className={tagClass}>
							{label}
						</span>
					))}
					{useCases.length > VISIBLE_TAGS ? (
						<span aria-hidden="true" className={tagClass}>
							+{useCases.length - VISIBLE_TAGS}
						</span>
					) : null}
				</p>
			) : null}
			{/* 모델과 감정 수는 짝으로만 줄을 바꾼다(모델 둘이면 카드 너비를 넘는다) */}
			<p
				translate="no"
				className="flex flex-wrap gap-x-1.5 text-muted-foreground text-sm tabular-nums"
			>
				{voice.models.map((model, index) => (
					<span key={model.model} className="whitespace-nowrap">
						{index > 0 ? "· " : ""}
						{model.model} · 감정 {model.emotions.length}
					</span>
				))}
			</p>
			<div className="mt-auto flex flex-col gap-2 pt-1">
				{status === "failed" ? (
					<p className="text-sm text-warning">재생하지 못했어요</p>
				) : null}
				{previewUrl === null ? (
					<Button
						variant="secondary"
						size="lg"
						className="w-full"
						disabled
						aria-label={`${voice.name} 샘플 없음`}
					>
						샘플 없음
					</Button>
				) : (
					<Button
						variant={playing ? "default" : "outline"}
						size="lg"
						className="w-full"
						// 불러오는 중에 누르면 멈춘다. 접근 이름에 보이는 글자 '샘플 듣기'를 그대로 담는다(WCAG 2.5.3).
						aria-label={
							playing
								? `${voice.name} 샘플 정지`
								: status === "loading"
									? `${voice.name} 샘플 듣기 취소`
									: status === "failed"
										? `${voice.name} 기본 샘플 다시 듣기`
										: `${voice.name} 기본 샘플 듣기`
						}
						aria-busy={status === "loading"}
						onClick={() => toggle(voice.voiceId, voice.name, previewUrl)}
					>
						{status === "loading" ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : playing ? (
							<Square data-icon="inline-start" aria-hidden="true" />
						) : (
							<Play data-icon="inline-start" aria-hidden="true" />
						)}
						{playing ? "정지" : status === "failed" ? "다시 듣기" : "샘플 듣기"}
					</Button>
				)}
			</div>
		</article>
	);
}
```

- [ ] **Step 6: 검사**

Run: `pnpm exec biome check --write apps/web/src/lib/sample-state.ts apps/web/src/lib/sample-state.test.ts apps/web/src/components/sample-player.tsx apps/web/src/components/voice-card.tsx apps/web/src/index.css && pnpm --filter web check-types && pnpm --filter web test`
Expected: 오류 0, PASS(web 25개: `connection-view` 3, `voice-filter` 13, `voice-failure` 4, `sample-state` 5). Biome가 `<audio>`에 자막(`useMediaCaption`)을 요구하면, 기본 샘플은 자막 파일이 없는 짧은 청취용이라 그 줄에 `{/* biome-ignore lint/a11y/useMediaCaption: 공급자 기본 샘플은 자막이 없다(화면 밖 재생 전용) */}`를 단다.

- [ ] **Step 7: 화면 연결은 Task 8** — 이 태스크의 카드와 플레이어는 Task 8에서 처음 그려진다. Step 8은 Task 8 Step 6과 함께 한다.

- [ ] **Step 8(코디네이터, Task 8 뒤): 샘플 동작 확인(실제 목록 조회 없음)** — agent-browser로 `/casting`을 연다. `--init-script`로 `voiceList` 흉내 응답(아래 "구현 뒤"의 흉내 스크립트, 성우 8명: 여러 콘텐츠를 가진 성우 2명, 샘플 주소 null 1명, 없는 주소 `https://static2.typecast.ai/__missing__.mp3` 1명)을 넣고 `network route "**/api/rpc/**" --abort`를 뒤에 둔다. 확인: 한 카드 재생 → 같은 성우의 다른 선반 카드도 '재생 중'·'정지', 다른 카드 재생 → 앞 재생 멈춤, 같은 버튼 다시 → 멈춤, A → B → A를 빠르게 누름 → 마지막 것만 재생되고 '재생하지 못했어요'가 뜨지 않음, 느린 응답(개발자 도구 네트워크 제한)에서 불러오는 중 버튼의 접근 이름이 "{이름} 샘플 듣기 취소"이고 누르면 멈춤, 없는 주소 → '재생하지 못했어요'와 '다시 듣기', 샘플 없음 → 누를 수 없음, 재생 중 다른 메뉴로 이동 → 소리 멈춤(`document.querySelector('audio')`가 없고 재생 소리가 끊김). 샘플 mp3는 공급자 정적 주소라 과금이 없다(실제 목록 조회 0회).

---

### Task 8: 성우 캐스팅 화면, 조건 줄, 오류 경계

**Files:**
- Create: `apps/web/src/components/voice-conditions.tsx`, `apps/web/src/components/voice-casting.tsx`, `apps/web/src/app/(app)/casting/page.tsx`, `apps/web/src/app/(app)/error.tsx`

**Interfaces:**
- Consumes: Task 3 `orpc.voiceList`; Task 5 전부(`failureOf` 포함); Task 6 `Notice`, 화면 너비 `2xl`; Task 7 `SamplePlayerProvider`, `VoiceCard`.
- Produces: `/casting` 라우트(Task 9의 `typedRoutes` 링크가 쓴다).

- [ ] **Step 1: 조건 줄** — `voice-conditions.tsx`

```tsx
"use client";

import { Button } from "@tts-pilot-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@tts-pilot-app/ui/components/input-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";

import type {
	FilterAxis,
	FilterOption,
	VoiceFilters,
} from "@/lib/voice-filter";

const AXES: { axis: FilterAxis; label: string }[] = [
	{ axis: "models", label: "모델" },
	{ axis: "genders", label: "성별" },
	{ axis: "ages", label: "연령" },
	{ axis: "useCases", label: "콘텐츠" },
];

const countBadge =
	"rounded-full bg-primary px-1.5 text-primary-foreground text-xs tabular-nums";
// 조건 버튼(드롭다운 넷과 '조건'). 고른 값이 있으면 옅은 청록으로 칠한다(브리프 5절).
const conditionButton = (count: number) =>
	cn(
		"border-input bg-card text-foreground hover:bg-muted",
		count > 0 &&
			"border-primary bg-primary-subtle text-primary hover:bg-primary-subtle",
	);
// 고른 수를 접근 이름에 담는다. 고른 것이 없으면 보이는 글자가 이름이다.
const selectedLabel = (label: string, count: number) =>
	count > 0 ? `${label}, ${count}개 선택됨` : undefined;

// 여러 개를 고르는 체크 목록(같은 축 OR). 항목을 눌러도 닫히지 않는다(Base UI CheckboxItem closeOnClick 기본 false).
// 잠김은 Trigger에 건다(Base UI Menu.Trigger가 disabled를 받아 렌더한 Button에 넘긴다).
function FilterMenu({
	label,
	options,
	selected,
	disabled,
	onChange,
}: {
	label: string;
	options: FilterOption[];
	selected: readonly string[];
	disabled: boolean;
	onChange: (values: string[]) => void;
}) {
	const count = selected.length;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<Button
						variant="outline"
						size="lg"
						aria-label={selectedLabel(label, count)}
						className={conditionButton(count)}
					/>
				}
			>
				{label}
				{count > 0 ? <span className={countBadge}>{count}</span> : null}
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-48 p-1">
				<DropdownMenuGroup>
					{options.map((option) => (
						<DropdownMenuCheckboxItem
							key={option.value}
							className="min-h-11 rounded-md text-sm"
							checked={selected.includes(option.value)}
							onCheckedChange={(checked) =>
								onChange(
									checked
										? [...selected, option.value]
										: selected.filter((value) => value !== option.value),
								)
							}
						>
							{option.label}
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 브리프 5·8절 조건 줄: 검색 칸, 드롭다운 넷, 끝에 인원 글자(summary).
// 모든 너비에서 줄을 바꿀 수 있다. 넓으면 한 줄이고, 넘치면 인원 글자 묶음이 다음 줄 오른쪽으로 내려간다.
// 768px 이상 드롭다운 넷은 묶음 안에서 꺾이지 않는다. 767px 이하는 검색 칸 + '조건' 버튼, 드롭다운은 펼칠 때만.
export function VoiceConditions({
	query,
	onQueryChange,
	filters,
	onFiltersChange,
	options,
	disabled,
	searchRef,
	summary,
}: {
	query: string;
	onQueryChange: (query: string) => void;
	filters: VoiceFilters;
	onFiltersChange: (filters: VoiceFilters) => void;
	options: Record<FilterAxis, FilterOption[]>;
	disabled: boolean;
	searchRef: RefObject<HTMLInputElement | null>;
	summary: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const selectedCount = Object.values(filters).reduce(
		(sum, values) => sum + values.length,
		0,
	);
	return (
		<search
			aria-label="성우 찾기"
			className="flex flex-wrap items-center gap-2"
		>
			<div className="flex w-full gap-2 xl:w-auto">
				{/* 포커스 표시는 다른 컨트롤과 같은 바깥 2px 윤곽선이다. 그림자는 쓰지 않는다(DESIGN) */}
				<InputGroup className="h-11 flex-1 rounded-lg bg-card shadow-none has-[[data-slot=input-group-control]:focus-visible]:outline-2 has-[[data-slot=input-group-control]:focus-visible]:outline-ring has-[[data-slot=input-group-control]:focus-visible]:outline-offset-2 xl:w-90 xl:flex-none dark:bg-card">
					<InputGroupAddon>
						<Search aria-hidden="true" />
					</InputGroupAddon>
					<InputGroupInput
						ref={searchRef}
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") onQueryChange("");
						}}
						placeholder="이름으로 찾기"
						aria-label="성우 이름으로 찾기"
						enterKeyHint="search"
						autoComplete="off"
						spellCheck={false}
						disabled={disabled}
						// Input 기본값의 md:text-xs까지 덮어야 768px 이상에서도 16px이다. h-full은 상자 어디를 눌러도 입력에 포커스가 가게 한다.
						className="h-full text-base md:text-base"
					/>
					{query ? (
						<InputGroupAddon align="inline-end" className="py-0 pr-0.5">
							{/* 보이는 40px이 44px 상자 안에 들어가고, after로 누르는 영역은 48px이다 */}
							<InputGroupButton
								size="icon-sm"
								className="relative size-10 rounded-md after:absolute after:-inset-1"
								aria-label="검색어 지우기"
								onClick={() => {
									onQueryChange("");
									// 버튼이 사라져도 포커스가 검색 칸에 남는다
									searchRef.current?.focus();
								}}
							>
								<X aria-hidden="true" />
							</InputGroupButton>
						</InputGroupAddon>
					) : null}
				</InputGroup>
				<Button
					variant="outline"
					size="lg"
					className={cn(conditionButton(selectedCount), "md:hidden")}
					aria-label={selectedLabel("조건", selectedCount)}
					aria-expanded={open}
					aria-controls="voice-filter-menus"
					disabled={disabled}
					onClick={() => setOpen((value) => !value)}
				>
					<ListFilter data-icon="inline-start" aria-hidden="true" />
					조건
					{selectedCount > 0 ? (
						<span className={countBadge}>{selectedCount}</span>
					) : null}
				</Button>
			</div>
			<div
				id="voice-filter-menus"
				className={cn(
					open ? "flex" : "hidden",
					"flex-wrap gap-2 md:flex md:shrink-0 md:flex-nowrap",
				)}
			>
				{AXES.map(({ axis, label }) => (
					<FilterMenu
						key={axis}
						label={label}
						options={options[axis]}
						selected={filters[axis]}
						disabled={disabled}
						onChange={(values) =>
							onFiltersChange({ ...filters, [axis]: values })
						}
					/>
				))}
			</div>
			<div className="flex w-full flex-wrap items-center gap-x-3 md:ml-auto md:w-auto">
				{summary}
			</div>
		</search>
	);
}
```

- [ ] **Step 2: 화면 컴포넌트** — `voice-casting.tsx`

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type {
	ProviderFailure,
	Voice,
} from "@tts-pilot-app/api/providers/contract";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import {
	ArrowRight,
	KeyRound,
	Link2,
	SearchX,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useRef, useState } from "react";

import { failureOf } from "@/lib/voice-failure";
import {
	EMPTY_FILTERS,
	filterOptions,
	filterVoices,
	groupByUseCase,
	hasConditions,
	labelOf,
	USE_CASE_LABEL,
	type VoiceFilters,
} from "@/lib/voice-filter";
import { orpc } from "@/utils/orpc";

import { Notice } from "./notice";
import { SamplePlayerProvider } from "./sample-player";
import { VoiceCard } from "./voice-card";
import { VoiceConditions } from "./voice-conditions";

const SHELF_SIZE = 5;
const numberFormat = new Intl.NumberFormat("ko-KR");
const count = (value: number) => `${numberFormat.format(value)}명`;

type ProblemCopy = {
	title: string;
	description: string;
	connections: boolean;
	reload: boolean;
};
// 키 오류와 권한 부족은 같은 안내다(브리프 7절).
const authProblem: ProblemCopy = {
	title: "Typecast 키를 확인해 주세요",
	description: "키가 틀렸거나 쓸 수 없는 키예요.",
	connections: true,
	reload: true,
};
// 브리프 7절 화면 상태표. 공급자 이름은 지금 Typecast뿐이다(T4·T5에서 공급자별로 넓힌다).
const PROBLEM: Record<ProviderFailure, ProblemCopy> = {
	no_key: {
		title: "Typecast 키가 없어요",
		description: "서버 환경변수에 키를 넣고 개발 서버를 다시 켜 주세요.",
		connections: true,
		reload: false,
	},
	provider_auth: authProblem,
	no_permission: authProblem,
	quota: {
		title: "Typecast 사용량이 부족해요",
		description: "남은 크레딧을 연결 상태에서 확인해 주세요.",
		connections: true,
		reload: true,
	},
	rate_limit: {
		title: "요청이 많아 잠시 막혔어요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	},
	provider_error: {
		title: "Typecast에 문제가 생겼어요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	},
	unknown_outcome: {
		title: "Typecast가 응답하지 않아요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	},
};

function ReloadButton({
	reloading,
	onReload,
}: {
	reloading: boolean;
	onReload: () => void;
}) {
	return (
		<Button
			size="lg"
			focusableWhenDisabled
			disabled={reloading}
			className="aria-disabled:pointer-events-none"
			onClick={onReload}
		>
			{reloading ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
			다시 불러오기
		</Button>
	);
}

// 사유별 안내. 새로 나타나면 스크린 리더가 읽는다(role="alert").
function Problem({
	failure,
	reloading,
	onReload,
}: {
	failure: ProviderFailure;
	reloading: boolean;
	onReload: () => void;
}) {
	const { title, description, connections, reload } = PROBLEM[failure];
	return (
		<Notice
			role="alert"
			icon={failure === "no_key" ? KeyRound : TriangleAlert}
			title={title}
			description={description}
		>
			{connections ? (
				<Link
					href="/connections"
					className={buttonVariants({ variant: "outline", size: "lg" })}
				>
					연결 상태 보기
				</Link>
			) : null}
			{reload ? (
				<ReloadButton reloading={reloading} onReload={onReload} />
			) : null}
		</Notice>
	);
}

// 콘텐츠 선반 하나(브리프 5절). '콘텐츠 정보 없음' 선반은 onShowAll이 없다.
function Shelf({
	title,
	total,
	voices,
	onShowAll,
}: {
	title: string;
	total: number;
	voices: Voice[];
	onShowAll: (() => void) | null;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				{/* 선반 제목 20px, 카드 이름 18px(크기 단계) */}
				<h2 className="font-bold text-xl tracking-tight">{title}</h2>
				<span className="text-muted-foreground text-sm tabular-nums">
					{count(total)}
				</span>
				{onShowAll ? (
					<Button
						variant="link"
						size="lg"
						// 화살표 끝을 카드 열의 오른쪽 끝에 맞춘다(누르는 영역은 그대로)
						className="-mr-2 ml-auto px-2 has-data-[icon=inline-end]:pr-2"
						aria-label={`${title} 모두 보기`}
						onClick={onShowAll}
					>
						모두 보기
						<ArrowRight data-icon="inline-end" aria-hidden="true" />
					</Button>
				) : null}
			</div>
			{/* 1439px 이하: 줄 안에서만 가로로 넘긴다(페이지는 넘치지 않게 본문 여백만큼 바깥으로 편다). 1440px 이상: 5열 */}
			<ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:-mx-11 md:scroll-px-11 md:px-11 2xl:mx-0 2xl:grid 2xl:grid-cols-5 2xl:overflow-visible 2xl:px-0 2xl:pb-0">
				{voices.map((voice) => (
					<li
						key={voice.voiceId}
						className="w-4/5 shrink-0 snap-start md:w-60 2xl:w-auto"
					>
						<VoiceCard voice={voice} />
					</li>
				))}
			</ul>
		</section>
	);
}

export function VoiceCasting() {
	const voices = useQuery(
		orpc.voiceList.queryOptions({
			input: { provider: "typecast" },
			// 받은 목록은 탭을 닫거나 새로 고칠 때까지 쓴다. 다시 받는 것은 '다시 불러오기'뿐이다(스펙 2절).
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			retry: false,
			// 실패한 목록도 다른 화면에 갔다 와서 다시 부르지 않는다(스펙 3절·AC4). 오류 경계의 '다시 시도하기'는 error.tsx가 실패한 쿼리를 초기화해 다시 부른다.
			retryOnMount: false,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			// 루프백으로만 붙으니 브라우저 offline 판단으로 조회를 멈추지 않는다(T2와 같다).
			networkMode: "always",
			meta: { toast: false },
			// 사유를 아는 실패는 화면 안에서 보이고 그 밖은 오류 경계((app)/error.tsx)로 던진다.
			throwOnError: (error) => failureOf(error) === null,
		}),
	);
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState<VoiceFilters>(EMPTY_FILTERS);
	// 조건 없이 상단 '모두 보기'로 전체 격자를 보는 중
	const [showAll, setShowAll] = useState(false);
	// '다시 불러오기'를 누른 때의 사유. 다시 부르는 동안 query-core가 오류를 지우므로(Task 4 toView 주석) 들고 있다가 문제 화면과 버튼 포커스를 지킨다.
	const [retrying, setRetrying] = useState<ProviderFailure | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const countRef = useRef<HTMLParagraphElement>(null);
	// 입력은 바로 바뀌고 목록 그리기는 뒤따른다(rerender-use-deferred-value). 상단 '모두 보기'의 전체 그리기도 클릭 응답을 막지 않게 미룬다.
	const deferredQuery = useDeferredValue(query);
	const deferredFilters = useDeferredValue(filters);
	const deferredShowAll = useDeferredValue(showAll);

	const failure = failureOf(voices.error);
	if (failure === "unauthorized") {
		return (
			<Notice
				icon={Link2}
				title="이 주소에서는 성우 목록을 불러올 수 없어요"
				description={
					<>
						개발 서버(
						<code translate="no" className="font-mono">
							pnpm dev
						</code>
						)를 127.0.0.1 또는 localhost 주소로 열어 주세요.
					</>
				}
			/>
		);
	}

	// 지금 보일 사유. 다시 부르는 동안에는 누른 때의 사유를 그대로 보인다.
	const shown = failure ?? (voices.isFetching ? retrying : null);
	const all = voices.data?.voices ?? [];
	const ready = voices.data !== undefined && shown === null;
	// 공개 성우가 0명이면 고를 것이 없으므로 조건 줄도 잠근다.
	const usable = ready && all.length > 0;
	const active = hasConditions(query, filters);
	const filtered = hasConditions(deferredQuery, deferredFilters);
	const grid = filtered || deferredShowAll;
	const results = grid ? filterVoices(all, deferredQuery, deferredFilters) : [];

	function reload() {
		// 지금 보이는 사유(누를 수 있을 때는 failure와 같다)를 들고 있는다.
		setRetrying(shown);
		// 두 번 눌러도 진행 중인 요청을 끊고 새로 보내지 않는다(AC5, 공급자 호출 1회).
		void voices.refetch({ cancelRefetch: false }).then((result) => {
			setRetrying(null);
			// 다시 받았으면 사라진 버튼 대신 검색 칸으로 포커스를 옮긴다(브리프 8절의 선반 복귀와 같은 자리).
			if (result.data) requestAnimationFrame(() => searchRef.current?.focus());
		});
	}
	function clearAll() {
		setQuery("");
		setFilters(EMPTY_FILTERS);
		setShowAll(false);
		searchRef.current?.focus();
	}
	function showUseCase(useCase: string) {
		setQuery("");
		setFilters({ ...EMPTY_FILTERS, useCases: [useCase] });
		countRef.current?.focus();
	}
	function showEverything() {
		setShowAll(true);
		countRef.current?.focus();
	}

	// 인원 글자 옆 링크 버튼 하나: 조건이 있으면 '조건 모두 해제', 조건 없이 '모두 보기'로 왔으면 '콘텐츠별로 보기', 그 밖은 '모두 보기'.
	const link: { label: string; ariaLabel?: string; onClick: () => void } =
		active
			? { label: "조건 모두 해제", onClick: clearAll }
			: showAll
				? { label: "콘텐츠별로 보기", onClick: clearAll }
				: {
						label: "모두 보기",
						// 선반마다 있는 '{콘텐츠} 모두 보기'와 구별한다(보이는 글자 포함)
						ariaLabel: "Typecast 성우 모두 보기",
						onClick: showEverything,
					};
	const summary = usable ? (
		<>
			<p
				ref={countRef}
				tabIndex={-1}
				role="status"
				className="rounded-sm text-muted-foreground tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
			>
				{filtered
					? `Typecast 성우 ${count(all.length)} 중 ${count(results.length)}`
					: `Typecast 성우 ${count(all.length)}`}
			</p>
			<Button
				variant="link"
				size="lg"
				className="px-2"
				aria-label={link.ariaLabel}
				onClick={link.onClick}
			>
				{link.label}
			</Button>
		</>
	) : null;

	let body: React.ReactNode;
	if (shown !== null) {
		body = (
			<Problem
				failure={shown}
				reloading={voices.isFetching}
				onReload={reload}
			/>
		);
	} else if (voices.data === undefined) {
		body = (
			<div
				role="status"
				className="flex items-center justify-center gap-2 py-14 text-muted-foreground"
			>
				<Spinner aria-hidden="true" />
				성우 목록을 불러오고 있어요
			</div>
		);
	} else if (all.length === 0) {
		body = (
			<Notice role="alert" title="Typecast가 준 공개 성우가 없어요">
				<ReloadButton reloading={voices.isFetching} onReload={reload} />
			</Notice>
		);
	} else if (grid && results.length === 0) {
		// 인원 글자(role="status")가 "614명 중 0명"을 이미 알리므로 role을 두지 않는다.
		body = (
			<Notice
				icon={SearchX}
				title="조건에 맞는 성우가 없어요"
				description="조건을 줄이거나 검색어를 바꿔 보세요."
			>
				<Button size="lg" variant="outline" onClick={clearAll}>
					조건 모두 해제
				</Button>
			</Notice>
		);
	} else if (grid) {
		body = (
			<section>
				<h2 className="sr-only">성우 목록</h2>
				<ul className="grid grid-cols-1 gap-4 md:grid-cols-cards 2xl:grid-cols-5">
					{results.map((voice) => (
						// 화면 밖 카드는 그리기를 미룬다(Task 7 Step 4, 격자에만)
						<li key={voice.voiceId} className="voice-card">
							<VoiceCard voice={voice} />
						</li>
					))}
				</ul>
			</section>
		);
	} else {
		body = groupByUseCase(all).map(({ useCase, voices: members }) =>
			useCase === null ? (
				<Shelf
					key="none"
					title="콘텐츠 정보 없음"
					total={members.length}
					voices={members}
					onShowAll={null}
				/>
			) : (
				<Shelf
					key={useCase}
					title={labelOf(USE_CASE_LABEL, useCase)}
					total={members.length}
					voices={members.slice(0, SHELF_SIZE)}
					onShowAll={() => showUseCase(useCase)}
				/>
			),
		);
	}

	return (
		<SamplePlayerProvider>
			<div className="flex flex-col gap-8">
				<VoiceConditions
					query={query}
					onQueryChange={setQuery}
					filters={filters}
					onFiltersChange={setFilters}
					options={filterOptions(all)}
					disabled={!usable}
					searchRef={searchRef}
					summary={summary}
				/>
				{body}
			</div>
		</SamplePlayerProvider>
	);
}
```

- [ ] **Step 3: 페이지** — `apps/web/src/app/(app)/casting/page.tsx`

```tsx
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { VoiceCasting } from "@/components/voice-casting";

export const metadata: Metadata = { title: "성우 캐스팅" };

// Server Component. 공급자·db 모듈을 부르지 않는다. 목록은 VoiceCasting이 브라우저에서 /api/rpc로 받는다.
export default function CastingPage() {
	return (
		<>
			<PageHeader
				title="성우 캐스팅"
				description="Typecast 성우를 찾아 기본 샘플을 들어 보세요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<VoiceCasting />
			</div>
		</>
	);
}
```

- [ ] **Step 4: 오류 경계** — `apps/web/src/app/(app)/error.tsx`

```tsx
"use client";

import {
	useQueryClient,
	useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { Button } from "@tts-pilot-app/ui/components/button";

import { PageHeader } from "@/components/page-header";

// 앱 틀 안의 예상 밖 오류(스펙 5절 6, 브리프 7절). 조회가 던진 오류면 쿼리의 오류 상태도 풀어야 다시 그릴 때 다시 부른다.
// TanStack Query 5.103.2 errorBoundaryUtils는 경계가 풀리기 전까지 retryOnMount를 false로 덮기만 한다.
// 성우 목록은 retryOnMount: false라, 실패한 쿼리를 처음 상태로 되돌려야 다시 그릴 때 한 번 부른다.
// 경계가 보이는 동안 실패한 화면은 언마운트되어 있으므로 resetQueries는 다시 부르지 않고 상태만 지운다.
export default function AppError({
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	const { reset } = useQueryErrorResetBoundary();
	const queryClient = useQueryClient();
	return (
		<>
			<PageHeader
				title="문제가 생겼어요"
				description="화면을 그리다 문제가 생겼어요. 다시 시도해 주세요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<Button
					size="lg"
					onClick={() => {
						reset();
						void queryClient.resetQueries({
							predicate: (query) => query.state.status === "error",
						});
						retry();
					}}
				>
					다시 시도하기
				</Button>
			</div>
		</>
	);
}
```

- [ ] **Step 5: 검사**

Run: `pnpm exec biome check --write "apps/web/src/components/voice-conditions.tsx" "apps/web/src/components/voice-casting.tsx" "apps/web/src/app/(app)/casting/page.tsx" "apps/web/src/app/(app)/error.tsx" && pnpm --filter web check-types && pnpm --filter web test`
Expected: 오류 0, PASS(web 25개). 런타임 확인은 SSR HTML만: `curl -s http://127.0.0.1:3001/casting | grep -o "<title>[^<]*</title>"` → `<title>성우 캐스팅 · TTS Pilot</title>`. SSR HTML은 불러오는 중 상태라 실제 조회가 나가지 않는다(조회는 브라우저에서만).

- [ ] **Step 6(코디네이터): 화면 확인(흉내 응답, 실제 조회 0회)** — Task 7 Step 8과 함께 한다. 더해서: 선반 순서·인원 수, 상단 '모두 보기' → 전체 격자와 '콘텐츠별로 보기', 선반 '모두 보기 →' → 그 콘텐츠 격자와 포커스가 인원 글자로, '조건 모두 해제' → 선반과 포커스가 검색 칸으로, 드롭다운에서 여러 개 고르기(닫히지 않음, 배지 수, 접근 이름 "모델, 2개 선택됨"), 검색 Esc, 검색 칸 글자 16px(768 이상 포함)과 지우기 버튼이 상자 테두리를 덮지 않음, 390에서 '조건' 버튼(고른 수가 있으면 옅은 청록), 1439 이하 선반 가로 줄(1280 포함)과 페이지 가로 스크롤 없음(`document.documentElement.scrollWidth === innerWidth`), 1440에서 5열. 1280·1440에서 필터 세 축을 고른 격자 보기를 캡처해 드롭다운이 묶음 안에서 꺾이지 않고 인원 글자 묶음만 다음 줄로 내려가는지 본다. 흉내 오류 응답 하나(`provider_error`)로 오류 화면과 '다시 불러오기'를 보고, 누른 뒤 문제 화면이 그대로이고 포커스가 잠긴 '다시 불러오기'에 남는지, 오류 중 드롭다운이 열리지 않는지 본다(Trigger `disabled`). 흉내 성공 응답으로 바꿔 다시 불러오면 포커스가 검색 칸으로 가는지 본다.

---

### Task 9: 메뉴와 작업실 흐름 지도

**Files:**
- Modify: `apps/web/src/components/app-nav.tsx`, `apps/web/src/app/(app)/studio/page.tsx`

**Interfaces:**
- Consumes: Task 8의 `/casting` 라우트(`typedRoutes`).

- [ ] **Step 1: 메뉴** — `app-nav.tsx`

```ts
// 열린 화면. 767px 이하에서는 위 막대에 늘 보인다(4칸: 열린 화면 셋 + 더보기, 성우 캐스팅 브리프 10절).
const OPEN_ITEMS: { label: string; icon: LucideIcon; href: Route }[] = [
	{ label: "음성 작업실", icon: WandSparkles, href: "/studio" },
	{ label: "성우 캐스팅", icon: AudioWaveform, href: "/casting" },
	{ label: "연결 상태", icon: Link2, href: "/connections" },
];
```

`UPCOMING_ITEMS`에서 `{ label: "성우 캐스팅", icon: AudioWaveform }` 줄을 지운다(6개). 위 막대 목록의 `grid-cols-3`을 `grid-cols-4`로 바꾼다.

- [ ] **Step 2: 흐름 지도** — `studio/page.tsx`

```tsx
import { ChevronRight } from "lucide-react";
import type { Metadata, Route } from "next";
```

```tsx
// 열리지 않은 단계는 '준비 중'(사이트맵 "예외"). 단계를 여는 TASK가 href를 더한다.
const STEPS: { name: string; text: string; href?: Route }[] = [
	{ name: "채널", text: "영상 채널과 분류를 정해요" },
	{ name: "성우", text: "공급자 성우를 듣고 골라요", href: "/casting" },
	{ name: "대본", text: "원문과 발음용 대본을 써요" },
	{ name: "검수", text: "생성 전에 숫자 발음을 확인해요" },
	{ name: "생성", text: "음성을 만들고 내려받아요" },
];
```

`<ol>` 안의 `STEPS.map(...)`을 아래로 바꾼다. 단계 본문은 한 조각이고, 바깥 태그(열린 단계는 `Link`, 아닌 단계는 `div`)와 끝의 '준비 중'만 갈린다. 열린 단계는 청록 바탕과 청록 이름으로 누를 수 있음을 알린다(화살표를 두지 않는다. 단계 사이 꺾쇠와 겹친다).

```tsx
							{STEPS.map((step, index) => {
								const body = (
									<>
										<p className="flex items-center gap-2 font-bold">
											<span className="tabular-nums">{index + 1}</span>
											<span className="group-hover:underline">{step.name}</span>
											{step.href ? null : (
												<span className="ml-auto font-normal text-muted-foreground text-xs">
													준비 중
												</span>
											)}
										</p>
										<p className="mt-1 text-muted-foreground text-sm">
											{step.text}
										</p>
									</>
								);
								return (
									<li
										key={step.name}
										className="flex flex-col gap-2 xl:flex-1 xl:flex-row xl:items-stretch"
									>
										{step.href ? (
											<Link
												href={step.href}
												className="group flex-1 rounded-xl bg-primary-subtle p-4 text-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
											>
												{body}
											</Link>
										) : (
											<div className="flex-1 rounded-xl bg-muted p-4">{body}</div>
										)}
										{/* 순서는 번호 목록이 알린다. 화살표는 장식이다 */}
										{index < STEPS.length - 1 ? (
											<ChevronRight
												aria-hidden="true"
												className="size-4 shrink-0 rotate-90 self-center text-muted-foreground xl:rotate-0"
											/>
										) : null}
									</li>
								);
							})}
```

`muted-foreground`(black-60)는 `primary-subtle` 바탕 위에서 약 5.5:1로 4.5:1을 넘는다(oklch → sRGB 계산, 계획 리뷰). craft-floor 대비 확인 때 수치만 다시 적는다.

- [ ] **Step 3: 검사(19행 일부)**

Run: `pnpm exec biome check --write apps/web/src/components/app-nav.tsx "apps/web/src/app/(app)/studio/page.tsx" && pnpm check-types && pnpm exec biome check . && pnpm test`
Expected: 오류 0, PASS

- [ ] **Step 4(코디네이터): 빌드** — 지금 도는 개발 서버를 끈 뒤 `pnpm build`, 끝나면 다시 켠다. 빌드 출력의 `/casting` 라우트 크기를 18·27행 증거에 적는다. 클라이언트 청크에 SDK·공급자 API 호스트가 없는지 확인한다(AC18): `grep -rl "api.typecast.ai\|@neosapience\|elevenlabs-js" apps/web/.next/static || echo none` → `none`. 변수 이름 `TYPECAST_API_KEY`는 연결 상태 카드의 키 없음 안내 글자라 청크에 있어도 된다(값이 아니다).

---

### Task 10: 문서

**Files:**
- Modify: `docs/research/typecast-api-options.md`, `.claude/skills/tts-provider/SKILL.md`, `docs/domain/project.md`, `docs/plans/implementation-roadmap.md`, `docs/plans/tasks/T03-typecast-voices.md`(상태 줄), `docs/briefs/casting.md`(상태 줄)

- [ ] **Step 1: research 문서** — "보이스 검색·추천 및 클로닝" 표 아래에 "### 성우 목록 실측(2026-10-04, T3)" 절을 더한다: SDK 0.4.15 `getVoicesV3(filter?: VoicesV2Filter)`(필터 타입에 `voice_type` 없음), 실측 614명·모두 original·약 300KB·0.3초, `preview_url`은 614명 모두 `static2.typecast.ai`의 서명 없는 고정 `.mp3`, 모델 `ssfm-v30` 608·`ssfm-v21` 535, 감정 모델당 최대 10, 성별 female 282·male 332, 연령 5종 분포, `use_cases` 실제 값 13종(SDK `UseCaseEnum`과 다름)과 인원 수. "연결 확인과 잔여 사용량" 절의 SDK 판을 0.4.15로 고친다.
- [ ] **Step 2: `tts-provider` 스킬** — "확인한 SDK 동작" 표의 Typecast 판을 0.4.15로 바꾸고 "`getVoicesV3` 필터 타입에 `voice_type` 없음"을 더한다. "오류 매핑" 절을 고친다.
  - 63행의 "조회의 시간 초과·연결 끊김은 `unknown_outcome`이 아니라 `check_failed`다"를 "연결 확인(`providerStatus`)의 시간 초과·연결 끊김은 `unknown_outcome`이 아니라 `check_failed`다"로 좁힌다.
  - 그 아래에 한 줄: "목록·생성처럼 결과가 필요한 호출은 `runList`처럼 사유를 붙여 던진다(`providers/errors.ts`). 목록 조회의 시간 초과·연결 끊김은 T3 스펙 4절대로 `GATEWAY_TIMEOUT`·`unknown_outcome`(화면 문구 '응답하지 않아요')이고, 응답 검증 실패는 `provider_error`다."
  - 한 줄 더: "목록 응답은 항목 단위로 검사한다. 응답 모양(배열이 아님, 유형 필드 없음)이 어긋나면 `provider_error`, 성우 하나가 어긋나면 그 성우만 빼고 뺀 수와 필드 이름만 한 줄 남긴다(`[voiceList] typecast 성우 N명 제외: voice_name`). 샘플 주소만 어긋나면(https가 아님) 그 성우의 샘플을 null로 둔다. 모두 빠지면 `provider_error`다."
  - 64행의 "rpc 라우트의 `onError`가 오류 전체를 `console.error`한다."를 "rpc 라우트의 `onError`는 의도한 4xx를 남기지 않고, 사유(`data.reason`)가 붙은 공급자 오류는 `[rpc] 코드 공급자 사유` 한 줄만 남긴다. 그 밖의 오류만 오류 전체를 `console.error`한다."로 바꾼다.
  - "화면" 절에 한 줄: "Typecast 기본 샘플 주소는 서명 없는 고정 주소다(2026-10-04 실측). 주소에 서명·만료가 생기면 만료를 따로 구분한다."
- [ ] **Step 3: `project.md`** — 기능 표에 `| 성우 캐스팅(Typecast) | 구현 | /casting | voiceList | [T3 스펙](../plans/tasks/T03-typecast-voices.md) |`. 화면 표에 `/casting` 행(성우 캐스팅: 콘텐츠별 선반, 검색·필터 격자, 기본 샘플 듣기 / 없음(데이터는 `protectedProcedure`, 소유자가 없으면 주소 안내) / `apps/web/src/app/(app)/casting/page.tsx`). API 표에 `voiceList` 행(용어: 성우, 콘텐츠, 기본 샘플 / 보호 / `{ provider: "typecast" }` / 서버 키로 공개 성우 전체를 한 번 조회해 돌려준다. 커스텀 성우는 뺀다. 키가 없으면 공급자를 부르지 않고 `PRECONDITION_FAILED`. 공급자 문제는 사유(`data.reason`)를 붙여 던진다). 주요 흐름 그림에 `S --> V["/casting<br/>성우 캐스팅"] -->|voiceList| T["Typecast 성우 목록"]`.
- [ ] **Step 4: 로드맵** — 4절 표의 T3 상태를 "진행"(라운드를 닫을 때 "완료"), 5절 T3 "포함"의 "Typecast 목록·단건 조회"를 "Typecast 목록 조회(단건 조회는 T8)"로, "용도 필터"를 "콘텐츠 필터"로 바꾼다. T4·T5에 메모: "T3가 만든 것을 쓴다: 성우 계약 `Voice`(`providers/contract.ts`), `runList`와 `providerError`(`providers/errors.ts`), `ProviderClient.listVoices`, `voiceList`의 입력 `z.literal("typecast")`를 넓히기, 화면의 `VoiceCard`·`SamplePlayerProvider`·`Notice`·`lib/voice-filter.ts`·`lib/voice-failure.ts`. T3는 전체를 한 번 받아 브라우저에서 거른다. 페이지 나눔이 필요한 공급자는 이 방식을 다시 정한다(스펙 5절 '만들지 않는 것')."
- [ ] **Step 5: 스펙·브리프 상태 줄** — 스펙 3행 "문서 확인 대기"를 "문서 확인(2026-10-04, 사용자 "진행")"으로, 브리프 3행 "브리프 확인 대기"를 "브리프 확인(2026-10-04, 사용자 "진행")"으로 바꾼다.
- [ ] **Step 6: 검사** — `pnpm agents:check`(스킬 본문을 바꿨으므로).

---

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

Task 1~10이 끝나면 대조표의 남은 행을 순서대로 한다. 계획 태스크가 아니라 라운드 절차다.

- **흉내 스크립트(scratchpad `mock-voices.js`):** T2 `mock-fetch.js`와 같은 방식으로 `window.fetch`를 감싸 `/api/rpc/voiceList`만 흉내 낸다. 성공은 `200`과 `{"json": <VoiceListResult>}`, 오류는 상태 코드(412·502·429·504·401·500)와 `{"json": {"defined": false, "code": …, "status": …, "message": "…", "data": {"provider": "typecast", "reason": …}}}`다(oRPC RPC 직렬화, Task 1에서 `toJSON()` 모양 확인). 시나리오는 URL 해시(`#mock=ok|empty|no_key|…`)로 고른다. 순서는 늘 `open --init-script` → `network route "**/api/rpc/**" --abort` → 막혔는지 확인이다. 화면용 목록은 S1의 실제 응답을 브라우저 네트워크 기록에서 scratchpad `voices-fixture.json`으로 저장해 쓴다(커밋하지 않는다). 그 전에는 Task 7 Step 8의 성우 8명 고정 값을 쓴다.
- **14·19행:** `pnpm check-types`, `pnpm exec biome check .`, `pnpm test`, `pnpm build`를 다시 실행해 채운다.
- **security 행:** `bts-reviewer(security)`에 Task 1~3 파일(`apps/web/src/app/api/rpc/[[...rest]]/route.ts` 포함)과 `voice-casting.tsx`·`sample-player.tsx`·`lib/voice-failure.ts`를 넘긴다. `tts-provider` security 항목: 목록을 부를 수 있는 주체(`protectedProcedure`, 소유자 없음이면 공급자 0회), 키 노출(결과 JSON, `ORPCError` data·cause, 로그, 클라이언트 청크), 커스텀 성우(다른 사용자의 클론) 제외, 재시도·시간 제한, 입력(`z.literal("typecast")`), 오디오 `src`에 들어가는 주소(https만, 서버 검증, 어긋나면 그 성우만 null), 실패 로그에 값·메시지가 없는지(목록 로그, 성우 제외 로그, rpc `onError` 한 줄).
- **comp-led 게이트(Task 8 뒤, 메인 세션, 18행):** `impeccable build-phase start --comp .impeccable/mocks/decision/casting-shelves.png --artifact "apps/web/src/app/(app)/casting/page.tsx"` 뒤 spec(`comp-spec --grid` → `regions.json`: 메뉴, 머리, 조건 줄과 드롭다운 넷, 인원 글자, 선반 머리 셋, 카드 열다섯과 그 안 이름·배지·태그·버튼) → hero(흉내 응답으로 1536×1024 캡처, `record hero`, 통과선 72%) → sections → motion → responsive(1440·1280·1024·768·390, 라이트·다크). 시안의 성우 이름·인원 수·지어낸 콘텐츠 태그(유튜브, 쇼핑 등)는 차이로 두고 크기·위치·굵기 차이만 고친다(브리프 머리). 캡처는 모두 흉내 응답이라 실제 조회가 없다.
- **18행 증거:** 서체(Pretendard 그대로, 굵기 400·700, 숫자 `tabular-nums`), 이미지(없음, 승인 시안 경로), 모션(색 전환 150ms, Spinner, 선반 스냅은 브라우저 기본)과 게이트 결과.
- **20행:** next-dev-loop(`get_compilation_issues`, `get_routes`에 `/casting`, `get_errors`)와 desktop 1440·mobile 390 스크린샷(`tasks/evidence/T03/`, 라이트·다크, 흉내 응답). `impeccable comp-diff --comp .impeccable/mocks/decision/casting-shelves.png --build … --spec .impeccable/build/spec.json --out-dir .impeccable/review/diff/final`. 오류 예산 0. 614장 첫 그리기, 필터 반응 시간, 상단 '모두 보기' 클릭부터 격자 그리기 끝까지를 `performance.now()`로 잰다(스펙 11절 위험). 격자 카드 높이를 재 `.voice-card`의 `contain-intrinsic-size`(지금 `auto 14rem`)를 맞춘다.
- **21~24행:** 메인 세션에서 `.agents/skills/impeccable/SKILL.md`를 Read로 읽고 critique·audit을 `docs/briefs/casting.md`(와 `app-shell.md`, CS-04 때문에 `provider-status.md`)를 넘겨 실행한다. `web-design-guidelines`로 코드 검사. 기준 audit 16/20, 접근성 3/4. finish reviewer 판정, polish, 재확인 1회, `build-phase finish`.
- **25행:** `DESIGN.md` merge(덮어쓰지 않는다): `--input` 값과 대비(입력 칠 `bg-input/*`도 함께 진해졌다, 폼이 생기는 TASK에서 확인), 배지 `primary` 변형, 카드 격자 유틸(15rem)과 5열 기준 `2xl`(1440px), 성우 카드(안쪽 여백 16px, `ring-1 ring-inset` 경계, 재생 중 안쪽 2px 청록 링, 이름 18px), 선반 제목 20px, 조건 드롭다운(고른 수 배지, `primary-subtle`), 선반. 전후 `pnpm dlx @google/design.md lint DESIGN.md`(오류 1: 원문 `radius-42-p`, 알려진 한계)와 `diff`(removed 없음).
- **26행:** 통합 런타임. 개발 서버 재시작 뒤 첫 로드와 새로 고침의 오류 예산(흉내 응답).
- **27·28행:** 이번 라운드가 바꾼 디렉터리에 `ponytail:ponytail-review`(Skill 도구). 라우트 크기와 새 의존성(web의 vitest 하나) 확인. 그다음 전체 diff에 `bts-reviewer(code)`.
- **29행 QA(S1~S18):** 실제 목록 조회는 서버 로그(`[voiceList]`가 아니라 요청 로그)로 세어 10회 이하, 연결 상태 조회는 T2 누계(17회)에 더한다. S1은 실제 키로 `/casting`을 한 번 열고(1회), S17은 그 뒤 다른 화면을 갔다 와서 요청이 늘지 않는지 본다. S2~S16·S18은 흉내 응답이다. S8(없는 샘플 주소)은 흉내 목록의 `previewUrl`을 `https://static2.typecast.ai/__missing__.mp3`로 둔다(정적 주소 404, 과금 없음). S9의 `no_key`는 흉내로 보고, 서버 경로는 Task 3 테스트가 고정한다. S10(500)은 흉내 500으로 오류 경계와 '다시 시도하기' → 다시 조회 1회(흉내)까지 본다. S11은 요청 1회와 함께 누른 뒤 포커스가 '다시 불러오기'에 남고 버튼이 잠기는지 본다. S12 너비에 1280을 더한다(5열은 1440부터). S14에서 확인할 것: VoiceOver로 보기 전환 때 인원 글자가 두 번 읽혀 거슬리는지(계획 리뷰 D10 보류), 드롭다운을 Tab으로 닫을 때 포커스 위치(테마 메뉴와 같은지), 오류 경계가 그려질 때 포커스 위치('다시 시도하기' `autoFocus` 여부), 320px에서 위 막대 '성우 캐스팅'이 두 줄로 꺾이는지. S17은 흉내 실패(`provider_error`) 뒤에도 다른 화면을 갔다 와서 요청이 늘지 않는지 본다(`retryOnMount: false`). S16은 사이트맵 표대로 링크와 버튼을 모두 누르고 누른 수, 404·콘솔 오류·반응 없는 버튼 수를 적는다. QA 앞뒤로 사용자에게 Typecast 대시보드 사용량을 봐 달라고 한다(목록 조회는 과금 문구가 없지만 확인한다).
- **30~33행:** QA 수정과 재QA, `pnpm agents:check`, `pnpm skills:check`, `pnpm dev-cycle case`·`status`.
- **34행:** Task 10이 `tts-provider` 본문을 바꾼다. 코디네이터가 `bts-dev-cycle` 규칙으로 eval 재실행 여부를 정한다.
- **35행:** Task 10 결과와 `tasks/todo.md` 백로그 CS-04·CS-05·CS-08·AF-05 체크(QA 통과 뒤).
- **36행 `[confirm]`:** 스펙 10절 사용자 테스트 절차를 드린다.
