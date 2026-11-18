# T14 로그인(소유자 전용) — 구현 계획

- 작성: 2026-11-18. 스펙: [T14-owner-login.md](T14-owner-login.md)(사용자 확인 2026-11-18). 브리프: [로그인](../../briefs/login.md). ADR: [0012](../../adr/0012-session-owner-single-allowlist.md).
- 두뇌: agent-skills(`planning-and-task-breakdown` → 구현 `incremental-implementation` + `test-driven-development`). 간결성: ponytail.
- 읽은 근거: `prokit-web`(Next 번들 문서 `03-file-conventions/proxy.md`·`route-groups.md`·`layout.md`·`page.md`, `04-functions/redirect.md`·`headers.md`), `prokit-api`(불변식·격리 테스트), `prokit-ui`(브리프 뒤 구현, 토큰만), 설치판 better-auth 1.7.5 조사(스펙 3절). DB 스키마 변경 없음(`prokit-db` 행은 N/A).

## 1. 개요

소유자를 정하는 곳을 `apps/web/src/context.ts` 한 곳에서 세션 + 소유자 이메일 판정으로 바꾸고, 페이지는 proxy(쿠키 유무)와 서버 layout(세션 판정) 두 겹으로 막는다. 라우터·격리 테스트는 손대지 않는다. 계정은 로컬 스크립트가 만들고 같은 실행에서 `local-admin` 데이터를 옮긴다.

## 2. 구조 결정

### 2.1 서버·API (`prokit-api-builder`)
- **판정 함수(순수):** `packages/api/src/owner.ts`를 갈아 끼운다. `localOwnerId`·`LOCAL_OWNER_ID`를 지우고 둘을 둔다.
  - `ownerEmailFrom(raw: string | undefined): { email: string | null; tooMany: boolean }` — 쉼표 분리·trim·소문자·빈 값 제거·중복 제거, 하나면 email, 둘 이상이면 `{ null, tooMany: true }`.
  - `ownerIdOf(user: { id: string; email: string } | null | undefined, raw: string | undefined): string | null` — 정리한 이메일끼리 같을 때 `user.id`.
  - `owner.test.ts`를 이 두 함수의 표 테스트로 다시 쓴다(루프백·`protectedProcedure` 테스트 중 `protectedProcedure`의 null 거절 테스트는 남긴다). 스펙 12절의 'context 소유자 결정' 경우(세션 없음·소유자·다른 이메일·목록 둘 이상·대소문자)는 `ownerIdOf` 표가 덮는다. `readOwner`는 이 함수와 `getSession` 한 줄을 잇기만 한다.
- **세션 읽기(서버 전용, `apps/web/src/context.ts` 안 — authPaths라 security 리뷰에 걸리고 편집 경계도 맞다. 새 파일을 만들지 않는다):** `readOwner(headers: Headers, refresh: boolean)`가 `auth.api.getSession({ headers, query: { disableRefresh: !refresh } })`를 읽어 `{ state: "none" } | { state: "denied"; email } | { state: "owner"; userId; email }`를 돌려준다. `tooMany`면 모듈 안 한 번만 `console.warn("[auth] OWNER_EMAILS에 이메일이 둘 이상이라 모두 거부합니다")`(이메일 값 없음). `getOwnerSession = cache(async () => readOwner(await headers(), false))`(React `cache`로 한 요청 안 layout·page 중복 제거, layout.md "Fetching Data").
  - **세션 연장은 `/api/rpc`에서만:** Server Component(루트 layout·`(app)/layout`·`/login`)는 쿠키를 쓸 수 없어(nextCookies가 문서 요청에서 조용히 실패) 갱신하면 DB만 늘고 쿠키 수명은 그대로가 된다(설치판 `session.mjs:180-213`). 그래서 Server Component 경로는 `disableRefresh: true`, 갱신은 Route Handler인 `createContext`(`refresh: true`)만 한다. 화면을 쓰면 rpc 요청이 곧 나가므로 '쓰면 연장'(결정 8)이 지켜진다.
  - 세션 읽기가 던지면(DB 멈춤) 그대로 던진다. 루트 layout 오류는 `app/global-error.tsx`(새, 2.3)가 받는다.
- **context:** `createContext`를 `async`로. `const owner = await readOwner(req.headers, true)`, `ownerId = owner.state === "owner" ? owner.userId : null`. 공급자 클라이언트 생성 조건 그대로. rpc route는 `context: await createContext(req)`, 주석의 '로그인 쿠키가 없다' 전제를 '세션 쿠키가 있어도 SimpleCsrf 헤더가 다른 사이트 요청을 막는다'로 고친다. `packages/api/src/context.ts` 주석만 고친다.
- **가입 막기:** `packages/auth/src/index.ts` `emailAndPassword: { enabled: true, disableSignUp: true }`. 다른 옵션(세션·출처·속도 제한)은 기본값 그대로(스펙 2절 8번).
- **환경 변수:** `apps/web/.env.schema`에 `OWNER_EMAILS`(`@optional @sensitive @type=string`, 주석 "소유자 이메일 한 개. 비거나 둘 이상이면 모두 거부"). `packages/db/.env.schema`는 바꾸지 않는다(DB 도구에 필요 없음). `env.ts`는 varlock이 다시 만든다(추적 안 함). `turbo.json`은 strict env 모드라 `globalEnv`에 `OWNER_EMAILS`를 더한다(기존 앱 변수와 같은 관례, H, `prokit-implementer`). 없으면 turbo로 띄운 프로세스에서 프로세스 환경으로 준 값(QA 덮어쓰기, T15 배포 빌드)이 걸러진다.
- **가입 거부 테스트:** `packages/api/src/auth-signup.test.ts`(새, 테스트 DB). `createAuth(테스트 설정, db)`의 `api.signUpEmail`이 `EMAIL_PASSWORD_SIGN_UP_DISABLED`로 거부되고 `user` 행이 늘지 않는다.

### 2.2 계정 스크립트 (`prokit-api-builder` 핵심 함수, `prokit-implementer` 실행 파일)
- **핵심 함수(테스트 대상):** `packages/api/src/owner-setup.ts`(새).
  - `isLocalDatabaseUrl(url)`: `new URL` 호스트가 `localhost`·`127.0.0.1`·`[::1]`/`::1`일 때만 true(파싱 실패 false).
  - `passwordProblem(a, b)`: 12자 미만·128자 초과·불일치면 문구, 아니면 null.
  - `moveLocalAdminData(db, userId)`: 한 트랜잭션에서 7개 표 `update … set owner_id = $userId where owner_id = 'local-admin'`, `provider_list_cache`의 `local-admin` 행 delete. 표별 수를 돌려준다. 앱 코드에서 `'local-admin'` 문자열은 이 파일의 상수 하나로만 남긴다(`LEGACY_OWNER_ID`, 테스트 리터럴은 그대로).
  - `createOwnerAccount(ctx, db, email, password)`: `ctx.password.hash` → `ctx.internalAdapter.createUser` → `linkAccount` → `moveLocalAdminData`. 어디서 실패하든 만든 사용자를 `ctx.internalAdapter.deleteUser`로 지우고 원래 오류를 다시 던진다. 지우기까지 실패하면 `{ cleanupFailed: true }`를 붙여 던져 스크립트가 `docs/owner-account.md`의 복구 절차를 가리키게 한다. `ctx`는 `auth.$context`의 해당 부분만 받는 좁은 타입이라 테스트에서 이전 실패를 주입할 수 있다.
  - `owner-setup.test.ts`(테스트 DB): URL 판정 표, 비밀번호 표, 이전(다른 소유자 행 그대로·캐시 삭제·수 정확), 이전 롤백(중간 표 실패를 강제하면 아무 행도 안 바뀜), `createOwnerAccount` 이전 실패 주입 → `user`·`account` 행 0(수용 기준 12).
- **실행 파일:** `apps/web/scripts/owner-create.ts`(새, `prokit-implementer`). 순서:
  1. `NODE_ENV === "production"` 거부, `isLocalDatabaseUrl(DATABASE_URL)` 거부(주소 출력 없음), `ownerEmailFrom(OWNER_EMAILS).email` 없음 거부.
  2. 입력: 터미널이면 이메일(일반 입력) → 비밀번호 두 번(화면에 찍지 않는 raw 모드 입력). 터미널이 아니면(파이프) 표준 입력을 한 번에 다 읽어 1줄 이메일, 2·3줄 비밀번호로 나눈다(readline을 닫으며 버퍼를 잃는 함정을 피한다). 정리한 이메일이 소유자 이메일과 다르면 거부, `passwordProblem`.
  3. `createDb`·`createAuth`(같은 env)로 `ctx = await auth.$context`. `ctx.internalAdapter.findUserByEmail`이 있으면 "이미 있는 계정이에요. 바꾸지 않았어요." exit 1.
  4. `createOwnerAccount(ctx, db, email, password)`(이름은 이메일 앞부분, `emailVerified: false`). 실패면 이유 한 줄과 exit 1, `cleanupFailed`면 복구 절차 문서 경로도.
  5. "계정을 만들었어요." + 표별 수. 비밀번호·해시·주소·스택에 든 연결 문자열을 출력하지 않는다(오류는 `error.message`의 앞 한 줄만, 주소 패턴은 가린다).
- **실행 방법:** `apps/web/package.json`에 `"owner:create": "varlock run -- jiti scripts/owner-create.ts"`와 devDependency `jiti`(잠금 파일의 2.7.0 그대로, 사용자 승인 2026-11-18). 루트 `package.json`에 `"owner:create": "pnpm --filter web owner:create"`(하네스 H 파일, `prokit-implementer`). 실행기가 워크스페이스 `.ts`(확장자 없는 상대 import)를 그대로 읽는지 Task 2에서 먼저 확인한다.
- **비밀번호 잊었을 때:** `docs/owner-account.md`(새, Main)에 계정 만들기·다시 만들기 절차와 옛 id → 새 id 이전 SQL(7개 표 + 캐시 삭제)을 적는다.

### 2.3 화면 (`prokit-ui-builder`)
- **proxy:** `apps/web/src/proxy.ts`(새). `getSessionCookie(request)`(better-auth/cookies, 존재만 확인)가 없고 경로가 `/login`이 아니면 `const url = new URL("/login", request.url); url.searchParams.set("next", pathname + search)`로 리다이렉트(검색어의 `&`·`#`가 새지 않게). matcher는 `'/((?!api|_next/static|_next/image|favicon.ico).*)'`(proxy.md Negative matching). DB를 읽지 않는다(authentication 가이드: proxy는 낙관적 확인만).
- **루트 layout:** `getOwnerSession()`이 `owner`면 지금 앱 틀(건너뛰기 링크 + `AppNav email` + `main`), 아니면 틀 없이 `main`만(로그인·접근 권한 없음 판). 없는 주소 화면은 소유자에게 지금처럼 틀 안에 그려진다.
- **전역 오류:** `app/global-error.tsx`(새, client, `html`·`body` 포함). 루트 layout이 세션을 못 읽으면(DB 멈춤) "문제가 생겼어요" + '다시 시도'(`retry` — 서버 내용을 다시 받아 그려 DB가 돌아오면 회복, 기존 `(app)/error.tsx`와 같음) 하나. global-error는 전역 스타일·글꼴을 싣지 않으므로 `index.css`와 글꼴 변수를 직접 불러온다. `error.tsx`는 같은 세그먼트 layout을 감싸지 않으므로 필요하다(Next `error.md`).
- **`(app)/layout.tsx`(새):** `none`이면 `redirect("/login")`, `denied`면 `redirect("/login")`(로그인 화면이 접근 권한 없음 판을 보인다). 쿠키는 있는데 세션이 무효인 드문 경우는 `next` 없이 간다(layout은 경로를 모른다, layout.md "Pathname"). 쿠키가 없으면 proxy가 `next`를 붙인다(Better Auth 쿠키 수명 = 세션 만료라 만료 뒤에는 쿠키가 없다).
- **`/login`:** `apps/web/src/app/login/page.tsx`(새, Server Component). `searchParams.next`를 `safeNext`로 정리. `owner` → `redirect(next)`, `denied` → `<AccessDenied email />`, `none` → `<LoginForm next />`. 메타데이터 제목 "로그인".
- **`safeNext`:** `apps/web/src/lib/safe-next.ts`(새) + 테스트. `/`로 시작, `//`·`/\` 아님, 제어 문자 없음, `/login`으로 시작하지 않음 → 그대로, 아니면 `/studio`. 배열·빈 값도 `/studio`.
- **인증 클라이언트:** `apps/web/src/lib/auth-client.ts`(새). `createAuthClient()`(같은 출처, better-auth/react)와 `signOutToLogin()`(`signOut` 뒤 `window.location.assign("/login")` — 전체 이동이라 layout이 다시 판정한다).
- **로그인 판:** `components/login-form.tsx`(새, client). `signIn.email({ email, password })`. 결과 `error.status`로 문구 고르기(401·400 → 맞지 않음, 429 → 잠시 뒤, 403 → 출처 안내 + `BETTER_AUTH_URL` 출처, 그 밖 → 일반). 출처 안내에 필요한 값은 page가 서버에서 `new URL(ENV.BETTER_AUTH_URL).origin`을 prop으로 넘긴다(비밀값 아님). 성공 → `window.location.assign(next)`. 실패 → 비밀번호 비우고 포커스. 보내는 중 잠금.
- **접근 권한 없음 판:** `components/access-denied.tsx`(새, client — 로그아웃 버튼). 판 겉모양(`Card` + 로고)은 두 판을 모두 그리는 `login/page.tsx`가 감싼다(따로 틀 컴포넌트를 만들지 않는다).
- **메뉴 아래 줄:** `app-nav.tsx`가 `email` prop을 받는다. '로컬 관리자' span → 이메일(말줄임 + `title`), 로그아웃 아이콘 버튼(`LogOut`, 툴팁·접근 이름 "로그아웃", `signOutToLogin`, 실패 시 줄 아래 한 줄). 767px 이하 더보기·768~1199 아이콘 사이드바 배치는 브리프 3절.
- **세션 만료 안내:** `notice.tsx`의 `LoopbackNotice`를 `SignInNotice`로 바꾸고(아이콘 `LogIn`, 고정 제목 "로그인이 끝났어요", 설명 "다시 로그인해 주세요.", '로그인' 링크 `/login?next=<usePathname()>`), `title` prop을 없앤다. 쓰는 곳 11곳의 import·이름을 바꾸고, 화면마다 넘기던 '이 주소에서는 …를 쓸 수 없어요' 제목을 지운다: `lib/saved-voice-view.ts`·`preset-view.ts`·`drama-view.ts`(+`drama-view.test.ts` 기대값)·`script-text.ts`·`my-voice-text.ts`·`studio-text.ts`·`classes-view.ts`의 loopback 키, `components/voice-problem.tsx`의 `LIST_LOOPBACK_TITLE`, `connection-status.tsx`의 제목. 판정(`failureOf(err) === "unauthorized"`)은 그대로.
- **주석:** `(app)/*/page.tsx` 7곳의 '로컬 관리자 모드' 주석을 지우거나 '보호는 (app)/layout과 protectedProcedure'로 고친다.

### 2.4 문서·하네스 (Main 문서, H 파일은 `prokit-implementer`)
- Main: `docs/domain/project.md`(권한 절·화면 표 `/login`·API 표 소유자 줄·데이터 표 소유자 주석), 로드맵 2절('로컬 관리자 모드' → 'T14부터 로그인')과 69행 T14 메모('세션 권한을 추가할 때 끝난다' → 결정 5: 소유자가 한 명이라 단일 소유 예외 유지), `docs/owner-account.md`, 브리프 [앱 틀](../../briefs/app-shell.md) 아래 줄, `DESIGN.md`의 '로컬 관리자'(754행 근처), ADR 0004에 0012 링크 한 줄, GLOSSARY는 1행에서 끝. `packages/db/src/schema/classification.ts:12` 주석('T14에서 정한다')은 DB 계층 행을 새로 만들지 않도록 백로그로 넘긴다.
- `prokit-implementer`(H): `AGENTS.md` 'TTS Pilot 프로젝트 규칙'의 로컬 관리자 모드 두 문단을 'T14부터: 소유자는 세션 + `OWNER_EMAILS` 한 개. 페이지 보호는 proxy + `(app)/layout`의 `getOwnerSession`. Server Component는 `getOwnerSession`만 부르고 db·공급자 모듈과 유료 프로시저를 직접 부르지 않는다. Server Action·새 Route Handler는 만들지 않는다'로 바꾼다. `.agents/skills/tts-provider/SKILL.md`(`.claude/skills`는 링크)의 30행('루프백 요청이면'), 36행('보호가 네 겹'·'T14부터는 … FORBIDDEN'), 102행 예외 문장, 151행 ⑤를 고친다: 'T14부터 소유자는 세션 + `OWNER_EMAILS` 한 개, 허용 목록 밖은 `ownerId` null → `UNAUTHORIZED`, 소유자가 한 명이라는 예외는 유지'. 루트 `package.json` 스크립트 한 줄, `turbo.json` `globalEnv`에 `OWNER_EMAILS`.

## 3. 재사용·설정 결정 (`[design]` 3행 근거)

- 기존: `context.ts`(소유자 결정 유일 지점, 소비자 rpc route), `owner.ts`(소비자 context·owner.test), `protectedProcedure`(모든 라우터), 격리 테스트 9개(Context 직접 주입), `LoopbackNotice`(11곳)·`failureOf`, `app-nav.tsx` 아래 줄·`ModeToggle`, 루트 layout 앱 틀, `packages/ui` `Card`·`Input`·`Label`·`Button`, `createAuth`·`services.ts`, `createDb`, `apps/web/.env.schema`·varlock, `turbo.json` `.env*` 입력, `test-db.ts`(테스트 DB).
- 결정: 재사용 — `protectedProcedure`·라우터·격리 테스트 그대로, `failureOf` 판정 그대로, `packages/ui` 부품, Better Auth 기본 세션·출처·속도 제한, `createDb`/`createAuth`를 스크립트도 그대로; 작은 확장 — `createContext` async와 같은 파일의 `readOwner`·`getOwnerSession`, 루트 layout 조건부 틀, `AppNav` email prop, 안내 컴포넌트 이름·고정 문구(화면별 loopback 제목 삭제); 새로 — `proxy.ts`, `(app)/layout.tsx`, `global-error.tsx`, `/login`·두 판, `safe-next.ts`, `auth-client.ts`, `owner-setup.ts`·스크립트; 만들지 않음 — 새 프로시저(로그인은 Better Auth 라우트), Server Action, 계정 메뉴, 별도 Provider·세션 컨텍스트(메뉴는 prop으로 이메일만), 가입 hook(가입은 `disableSignUp`이 막는다), `owner_id` 외래 키·마이그레이션.
- 설정: `OWNER_EMAILS` 새 서버 전용 변수(`@optional @sensitive`, 클라이언트 비노출, 소비자 `context.ts`·스크립트, 공급은 `apps/web/.env`·T15에서 Vercel 환경 변수, `turbo.json` `globalEnv`에 추가). `BETTER_AUTH_URL`·`BETTER_AUTH_SECRET` 그대로(개발 주소는 `BETTER_AUTH_URL`=`http://localhost:3001`). `disableSignUp` 켬. `jiti` 개발 의존. `next.config` 변경 없음.
- 검증: API 테스트(owner 판정·가입 거부·owner-setup·기존 전부와 격리 9개 그대로), 화면 lib 테스트(safe-next), 타입·린트·빌드, 브라우저 QA(스펙 13절, 테스트 DB), 모든 화면 회귀(앱 틀 조건부).

## 4. Task

### Phase 1: 서버 기반

**Task 1 — 소유자 판정과 가입 막기** (`prokit-api-builder`, S~M)
- 파일: `packages/api/src/owner.ts`·`owner.test.ts`·`context.ts`(주석), `packages/api/src/auth-signup.test.ts`(새), `packages/auth/src/index.ts`, `apps/web/src/context.ts`(`readOwner`·`getOwnerSession` 포함), `apps/web/src/app/api/rpc/[[...rest]]/route.ts`, `apps/web/.env.schema`.
- RED: `owner.test.ts`(새 함수 없음), `auth-signup.test.ts`(가입 성공함) 실패 확인 → GREEN.
- 완료: 판정 표 테스트·가입 거부 통과, 기존 API 테스트 전부 통과(격리 9개 수정 0), check-types.
- 주의: `localOwnerId`를 지운 뒤 개발 서버는 로그인 전까지 모든 데이터가 `UNAUTHORIZED`다(Task 3 전 중간 상태 — 이 라운드 안에서만).

**Task 2 — 계정 스크립트와 이전** (`prokit-api-builder`: `owner-setup.ts`·테스트 / 이어서 `prokit-implementer`: 스크립트·package.json 둘·jiti)
- 파일: `packages/api/src/owner-setup.ts`·`owner-setup.test.ts`(새), `apps/web/scripts/owner-create.ts`(새), `apps/web/package.json`, 루트 `package.json`, `turbo.json`(`globalEnv`), `pnpm-lock.yaml`.
- RED: 핵심 함수 테스트 먼저. 실행 파일은 먼저 `jiti`로 워크스페이스 `.ts` import가 되는지 한 줄 확인.
- 완료: 테스트 통과. 테스트 DB에서 루트 `pnpm owner:create`(수용 기준 13)를 파이프 입력(1줄 이메일, 2·3줄 비밀번호)으로 돌려 계정 생성·이전 수 출력, 같은 이메일 재실행 거부, 원격 URL·허용 밖 이메일·짧은 비밀번호 거부(아무것도 안 씀)를 확인(수행자가 출력 붙임, 비밀번호는 scratchpad 파일에서 파이프). 개발 DB에는 돌리지 않는다.

### Checkpoint A
- API 테스트 전부·check-types 통과, delegation diff 범위 대조.

### Phase 2: 화면

**Task 3 — 보호와 로그인 화면** (`prokit-ui-builder`, M)
- 파일: `apps/web/src/proxy.ts`(새), `app/layout.tsx`, `app/(app)/layout.tsx`(새), `app/global-error.tsx`(새), `app/login/page.tsx`(새), `components/login-form.tsx`·`access-denied.tsx`(새), `lib/auth-client.ts`·`lib/safe-next.ts`·`lib/safe-next.test.ts`(새).
- RED: `safe-next.test.ts` 먼저.
- 완료: 비로그인 → `/login?next=`, 로그인 → next, 접근 권한 없음 판, 화면 테스트·check-types·build.

**Task 4 — 메뉴 아래 줄과 만료 안내** (`prokit-ui-builder`, M, Task 3 뒤 — `app-nav.tsx` prop이 Task 3의 layout과 맞물림)
- 파일: `components/app-nav.tsx`, `components/notice.tsx`, `SignInNotice` 쓰는 11곳(`my-voices`·`drama-editor`·`voice-casting`·`voice-library`·`script-library`·`all-providers`·`paragraph-studio`·`classes-board`·`preset-board`·`connection-status`·`server-voice-list`), loopback 제목을 지울 `lib/saved-voice-view.ts`·`preset-view.ts`·`drama-view.ts`·`drama-view.test.ts`·`script-text.ts`·`my-voice-text.ts`·`studio-text.ts`·`classes-view.ts`·`components/voice-problem.tsx`, `(app)/*/page.tsx` 주석 7곳, '루프백' 주석이 남은 `utils/orpc.ts`·`drama-autotag.tsx`·`paragraph-autotag.tsx`·`paragraph-make.tsx`·`drama-read.tsx`·`drama-provider.tsx`·`voice-casting.tsx`·`server-voice-list.tsx`·`notice.tsx`.
- 완료: `grep -rn "로컬 관리자\|이 주소에서는\|loopback\|Loopback\|루프백" apps/web/src` 0, 로그아웃 동작, 안내 링크, 화면 테스트·check-types·build.

### Checkpoint B
- 전체 테스트·타입·린트·빌드, 개발 서버에서 로그인 흐름 한 번(QA는 검증 행).

### Phase 3: 문서·하네스

**Task 5 — 규칙과 문서** (`prokit-implementer`: `AGENTS.md`·`tts-provider` 스킬 / Main: 2.4 문서)
- 완료: `grep -rn "로컬 관리자\|루프백" AGENTS.md .agents/skills/tts-provider docs/domain docs/briefs DESIGN.md packages`가 의도한 옛 기록(ADR·아카이브·지난 스펙·브리프 변경 기록 줄·`schema/classification.ts` 백로그 주석) 밖에서 0(`apps/web/src`는 Task 4의 grep 결과를 재확인만 한다). `pnpm agents:check` 통과.

## 5. 병렬

- Task 1 → (Task 2 ∥ Task 3) → Task 4 → Task 5. Task 2(packages/api 새 파일·scripts·package.json)와 Task 3(apps/web/src 화면)은 파일이 겹치지 않는다. Task 3은 Task 1의 `apps/web/src/context.ts` `getOwnerSession` 계약을 쓴다.

## 6. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| 루트 layout이 세션을 읽어 모든 페이지가 동적이 됨 | 낮음(이미 모든 데이터 페이지가 요청마다 렌더) | React `cache`로 한 번만 읽기. 빌드 결과에서 정적 페이지 변화 확인 |
| layout은 이동 때 다시 그려지지 않음 | 로그아웃 뒤 틀이 남을 수 있음 | 로그인·로그아웃은 전체 이동(`location.assign`). 데이터는 `protectedProcedure`가 막음 |
| 쿠키는 있으나 세션 무효 | `next` 없이 `/login` | 스펙 5.2 수용 범위(쿠키 수명 = 세션 수명이라 드묾). 계획에 명시 |
| 개발 주소 출처 불일치 | 로그인 403 | 출처 문구에 `BETTER_AUTH_URL` 주소, 사용자 테스트 주소를 그 값으로 |
| QA가 개발 DB·3001 서버를 건드림 | 사용자 데이터 이전이 QA 계정으로 감, 사용자 서버 정지 | Next 16은 같은 폴더에서 `next dev`를 둘 띄우지 못한다(`build/lockfile.js`). QA는 `apps/web`에서 turbo를 거치지 않고 테스트 DB·QA 이메일·`BETTER_AUTH_URL=http://127.0.0.1:3002`를 프로세스 환경으로 준 `next build` → `next start -p 3002 --hostname 127.0.0.1`로 한다(3001과 `.next/dev` 분리). varlock이 빌드 때 값을 굳히는지(`_VARLOCK_ENV_KEY`) 쓰기 없이 먼저 확인한다. 같은 실행이 수용 기준 10(production `next start`)도 덮는다 |
| 세션 연장이 rpc 응답 쿠키에 실리는지 | 7일 뒤 쿠키 만료(결정 8과 어긋남) | Task 1에서 Route Handler 응답에 nextCookies의 `Set-Cookie`가 붙는지 확인한다(갱신 시점은 테스트 DB 세션의 `expires_at`을 '지금 + 6일 - 몇 분'으로 바꿔 만든다. 설치판 판정은 `expiresAt - expiresIn + updateAge <= now`) |
| `jiti`가 워크스페이스 `.ts`를 못 읽음 | 스크립트 실행 불가 | Task 2 첫 확인. 안 되면 멈추고 사용자에게 tsx 대안을 묻는다 |
| 하네스 규칙 변경 | 케이스 상향 행 추가 | audit 안내대로 `--upgrade`, 붙는 행 수행 |

## 7. 열린 질문

없음(스펙 2절 결정 12개로 닫힘).
