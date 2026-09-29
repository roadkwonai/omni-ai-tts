# T1 앱 기반과 공통 틀 (로컬 관리자 모드) — 스펙

- 작성: 2026-09-29(개편). 상태: **사용자 확인(2026-09-29)**.
- 로드맵: [서비스 구현 로드맵](../implementation-roadmap.md) T1과 2절(로컬 관리자 모드). 요구: REQ-12(기반), REQ-01(로컬 보호). 백로그: P0-04, P0-05 일부, Q-01.
- 화면 브리프: [앱 틀 브리프](../../briefs/app-shell.md).

## 1. 목표

로그인 없이 쓰는 작업실 틀을 세우고, 뒤 TASK가 그대로 쓸 공통 구조를 만든다. 공통 구조는 보호 프로시저와 소유자 결정 한 곳, 앱 틀, 디자인 토큰, 테스트 러너, 린트 기준선이다. 로그인은 T14에서 이 구조의 소유자 결정만 바꿔 붙인다.

## 2. 결정

| 항목 | 결정 | 정한 날 |
|---|---|---|
| 로그인 | T1~T13은 로그인 없이 로컬 관리자 한 명으로 동작. 로그인은 T14 | 2026-09-29 사용자 요청 |
| 내비게이션 | HTML 시안의 메뉴 9개를 모두 보인다. 아직 없는 화면(8개)은 '준비 중'으로 비활성 | 2026-09-29 사용자 확정 |
| 테마 | 라이트·다크 모두. 기본은 시스템 설정, 고른 값을 기억 | 2026-09-29 사용자 확정 |
| 사용자 테스트 | 로컬 개발 서버. 배포는 T15 | 2026-09-29 사용자 확정 |

## 3. 범위

### 포함
1. **로컬 관리자 모드**(로드맵 2절)
   - `packages/api/src/owner.ts`(신규): `LOCAL_OWNER_ID = "local-admin"`와 `localOwnerId(nodeEnv, host)`. `nodeEnv`가 `development`·`test`이고 요청 Host가 루프백(`localhost`, `127.0.0.1`, `[::1]`)일 때만 로컬 관리자를 돌려주고, 그 밖에는 `null`이다. 모르는 `NODE_ENV`도 막고(fail-closed), 다른 도메인 이름을 127.0.0.1로 풀리게 하는 DNS 리바인딩도 막는다(CSRF 헤더는 같은 출처가 된 페이지가 붙일 수 있어서다).
   - `Context`는 `{ db, ownerId: string | null }`이다. 템플릿의 `session`은 뺀다. 지금 세션을 쓰는 곳은 지울 `privateData`뿐이다.
   - `protectedProcedure`: `ownerId`가 없으면 `UNAUTHORIZED`를 던진다. 있으면 `ownerId`를 넘긴다. 뒤 TASK의 프로시저는 소유자를 `context.ownerId`에서만 얻는다.
   - `apps/web/src/context.ts`: `ownerId: localOwnerId(ENV.NODE_ENV, req.headers.get("host"))`. 요청마다 하던 Better Auth `getSession` 호출을 뺀다. `check-types`는 먼저 `next typegen`으로 라우트 타입을 새로 만든다(`typedRoutes`).
2. **다른 사이트 요청 차단:** rpc 라우트의 `RPCHandler`에 oRPC `SimpleCsrfProtectionHandlerPlugin`을 넣는다. 클라이언트 `RPCLink`에는 `SimpleCsrfProtectionLinkPlugin`을 넣는다. 둘 다 설치된 `@orpc/server`·`@orpc/client` 1.15.4에 있다. 쓰지 않는 OpenAPI 핸들러와 API 참조 문서(`/api/rpc/api-reference`)는 지운다.
3. **개발 서버 주소 제한:** `apps/web`의 `dev` 스크립트에 `--hostname 127.0.0.1`을 더한다.
4. **템플릿 정리:** ASCII 홈, `/dashboard`, `/login`, 로그인·가입 폼, 전역 헤더, 사용자 메뉴, `lib/auth-client.ts`, `privateData`를 지운다. `/`는 `/studio`로 보낸다. `packages/auth`와 `/api/auth` 라우트는 T14를 위해 그대로 둔다. `healthCheck`는 CSRF 확인과 동작 점검에 쓰려고 남긴다.
5. **앱 틀:** 브리프대로 만든다. 좌측 내비게이션에 메뉴 9개를 두고 '음성 작업실'만 링크로 연다. 반응형 세 모양을 둔다. 아래쪽에는 테마 전환(시스템·라이트·다크)과 "로컬 관리자" 표시를 둔다. 본문으로 건너뛰기 링크를 넣는다.
6. **페이지 공통 부분:** 빈 작업실 `/studio`는 페이지 머리(제목, 설명 한 줄)와 빈 상태로 만든다. 빈 상태는 `packages/ui`에 있는 shadcn `Empty`를 쓴다. 없는 주소(`not-found.tsx`)는 한국어로 만든다.
7. **디자인 토큰:** `DESIGN.md`의 라이트·다크 시맨틱 값을 `packages/ui/src/styles/globals.css`의 shadcn 변수로 옮긴다. `lang="ko"`, 페이지 제목 "TTS Pilot", Pretendard(기존 `next/font/local`)를 쓴다.
8. **테스트 러너:** `packages/api`에 vitest를 두고, 루트 `pnpm test`, turbo `test` 태스크, `.dev-cycle.json`의 `commands.test`를 설정한다. T1 테스트는 DB가 필요 없다.
9. **Biome 기준선(Q-01):** `pnpm exec biome check .`가 통과하게 한다. 지금 오류 대부분은 `packages/ui/src`(67)와 `apps/web/src`(13)에 있다.
10. **규칙 문서:** `AGENTS.md` TTS 규칙에 로컬 관리자 모드를 한 줄로 넣는다. 보안 불변식의 "소유자 id는 세션에서만"은 로컬 관리자 모드 동안 "서버가 정한 `context.ownerId`에서만"으로 읽는다는 내용이다. `tts-provider` 스킬의 "누가 부를 수 있는지" 문단은 로컬 관리자 모드의 보호(production 차단, `127.0.0.1`, CSRF)와 "T14 전에는 배포하지 않음"으로 고친다. `docs/domain/project.md`의 권한·흐름·화면·API 표도 고친다.

### 만들지 않는 것 (ponytail)
| 뺀 것 | 이유 | 다시 넣을 때 |
|---|---|---|
| 로그인 화면, 계정, 허용 목록 | 로컬에서만 쓰는 동안 필요 없다 | T14 |
| DB 테이블, 로컬 관리자 `user` 행, 테스트 DB | T1에는 소유 데이터가 없다 | 첫 소유 테이블 T6 |
| 한국어 오류 알림 매핑, 로딩 상태, 오류 경계(`error.tsx`) | T1 화면에는 서버 조회도 오류를 던지는 코드도 없다 | 첫 조회가 생기는 T2 |
| 준비 중 메뉴의 빈 페이지 | 메뉴를 링크로 만들지 않으므로 필요 없다 | 그 화면의 TASK |
| 로컬 관리자 모드를 켜고 끄는 환경변수 | `NODE_ENV`로 충분하다 | 필요해지지 않는다(T14에서 모드 자체를 없앤다) |
| 새 UI·상태 관리 라이브러리 | 설치된 shadcn, next-themes, TanStack Query로 된다 | — |

## 4. 구조

```text
브라우저 (127.0.0.1:3001)
  /            → redirect /studio
  /studio      → (app) 레이아웃: 앱 틀(내비게이션, 테마, 로컬 관리자 표시) + 빈 작업실
  그 밖        → not-found (한국어)
oRPC /api/rpc  ─ SimpleCsrfProtection(헤더 x-csrf-token 검사)
               └ createContext(req) → { db, ownerId: localOwnerId(NODE_ENV, Host) }
                   protectedProcedure: ownerId 없음(production·모르는 NODE_ENV·루프백 아닌 Host) → UNAUTHORIZED
```

| 파일 | 변경 |
|---|---|
| `packages/api/src/owner.ts` (신규) | `LOCAL_OWNER_ID`, `localOwnerId(nodeEnv, host)` |
| `packages/api/src/context.ts` | `Context = { db, ownerId: string \| null }` |
| `packages/api/src/index.ts` | `protectedProcedure`가 `ownerId`를 검사해 넘김 |
| `packages/api/src/routers/index.ts` | `privateData` 삭제 |
| `apps/web/src/context.ts` | `ownerId` 전달, `getSession` 호출 삭제 |
| `apps/web/src/app/api/rpc/[[...rest]]/route.ts` | CSRF 플러그인, OpenAPI 핸들러 삭제 |
| `apps/web/src/utils/orpc.ts` | CSRF 링크 플러그인 |
| `apps/web/src/app/(app)/layout.tsx`, `(app)/studio/page.tsx` (신규) | 앱 틀, 빈 작업실 |
| `apps/web/src/app/page.tsx` | `/studio`로 redirect |
| `apps/web/src/app/not-found.tsx` (신규) | 한국어 없는 주소 화면 |
| `apps/web/src/app/layout.tsx` | `lang="ko"`, 제목, 전역 헤더 제거 |
| `apps/web/src/components/` | 내비게이션, 테마 전환(기존 `mode-toggle.tsx`를 한국어·세 값으로), 페이지 머리. `header.tsx`·`user-menu.tsx`·`sign-in-form.tsx`·`sign-up-form.tsx`와 쓰지 않게 되는 `loader.tsx` 삭제 |
| `apps/web/src/app/dashboard/`, `login/`, `lib/auth-client.ts` | 삭제 |
| `apps/web/package.json` | `dev`에 `--hostname 127.0.0.1`. 안 쓰게 되는 의존성(`@orpc/openapi` 등)은 계획에서 확인해 뺀다 |
| `packages/ui/src/styles/globals.css` | `DESIGN.md` 라이트·다크 토큰 |
| `packages/ui/src/components/button.tsx`, `dropdown-menu.tsx`, `empty.tsx` | T1이 쓰는 프리미티브와 크기만 `DESIGN.md` 반경·크기로 맞춘다(버튼 lg 48px, 아이콘 버튼 44px, 포커스 링 3px). 나머지는 처음 쓰는 TASK가 맞춘다 |
| 루트·`packages/api` `package.json`, `turbo.json`, `.dev-cycle.json` | vitest, `test` 태스크, `commands.test` |
| `AGENTS.md`, `.agents/skills/tts-provider/SKILL.md`, `docs/domain/project.md` | 3절 10번 |

## 5. 수용 기준

| # | 기준 | 확인 방법 |
|---|---|---|
| AC1 | `protectedProcedure`는 `ownerId`가 없으면 `UNAUTHORIZED`, 있으면 핸들러가 그 값을 `context.ownerId`로 받는다 | 자동 테스트 |
| AC2 | `localOwnerId`는 `development`·`test`이면서 Host가 루프백일 때만 `"local-admin"`이다. `production`, 모르는 `NODE_ENV`, 루프백이 아닌 Host(DNS 리바인딩), Host 없음은 `null` | 자동 테스트 |
| AC3 | `x-csrf-token` 헤더 없이 `POST /api/rpc/healthCheck`를 보내면 거절(403)되고, 앱 화면에서 부르는 호출은 통과한다 | curl, 브라우저 |
| AC4 | 개발 서버가 `127.0.0.1:3001`에서만 듣는다 | `lsof -iTCP:3001 -sTCP:LISTEN` |
| AC5 | `/`는 `/studio`로 간다. `/dashboard`, `/login`, 없는 주소는 한국어 "페이지를 찾을 수 없어요" 화면이다 | 브라우저 |
| AC6 | 메뉴 9개 가운데 '음성 작업실'만 활성이다. '준비 중' 8개는 누를 수 없고, 글자와 스크린 리더로 준비 중임을 알린다. 1200px 이상은 전체 메뉴, 768~1199px는 아이콘 메뉴, 767px 이하는 위쪽 막대와 더보기 | 브라우저 1440·1024·390 |
| AC7 | 라이트·다크가 `DESIGN.md` 값으로 보이고, 고른 테마가 새로 고침 뒤에도 남는다. 본문 대비 4.5:1 이상 | 브라우저, impeccable audit |
| AC8 | `lang="ko"`, 제목 "TTS Pilot", Pretendard가 실제로 로드된다 | 브라우저(글꼴 요청) |
| AC9 | 키보드만으로 본문 건너뛰기, 메뉴 이동, 더보기 열고 닫기, 테마 전환이 된다. 포커스가 보인다 | 브라우저 |
| AC10 | 타입 검사, 전체 Biome, 테스트, 빌드가 통과한다 | 명령 출력 |

## 6. 자동 테스트

- `packages/api/src/owner.test.ts`
  - `localOwnerId`: 루프백 Host 세 가지와 `development`·`test`는 `"local-admin"`, `production`·`staging`·빈 값, `evil.example:3001`·`127.0.0.1.evil.example`·Host 없음은 `null`이다.
  - `protectedProcedure`: 테스트 파일 안에 `ownerId`를 돌려주는 프로시저 하나를 만들고 `createRouterClient`로 부른다. `ownerId: null`이면 `UNAUTHORIZED`이고, `"local-admin"`이면 그 값을 돌려준다.
- CSRF(AC3)는 라우트 동작이라 구현 뒤 개발 서버에 curl로 확인하고 증거에 적는다. 플러그인 자체는 oRPC가 테스트한다.

## 7. 사용자 테스트 절차 (구현 뒤 드린다)

1. `pnpm dev` (DB는 켜지 않아도 된다).
2. 브라우저에서 `http://localhost:3001`을 연다. 로그인 없이 '음성 작업실' 틀이 나온다.
3. 메뉴 9개를 본다. '음성 작업실'만 누를 수 있고 나머지 8개에는 '준비 중'이 붙어 있다.
4. 테마를 시스템 → 라이트 → 다크로 바꾸고 새로 고침한다. 고른 테마가 남는다.
5. 창 너비를 줄인다. 1200px 이상은 전체 메뉴, 그보다 좁으면 아이콘 메뉴, 휴대폰 너비는 위쪽 막대와 더보기다.
6. Tab 키로 본문 건너뛰기, 메뉴, 테마 전환을 차례로 지난다.
7. (선택) `http://localhost:3001/dashboard`를 연다. 한국어 "페이지를 찾을 수 없어요"가 나온다.

통과 기준: 위 단계가 기대대로이고, 화면에 고칠 것이 없거나 피드백을 반영해 다시 확인했다.

## 8. 위험과 확인할 것

- 서버를 `127.0.0.1`에만 열었는데 `localhost`가 IPv6(`::1`)로만 풀리는 환경이면 페이지가 열리지 않는다. 그때는 `http://127.0.0.1:3001`로 연다. 구현 때 이 기기에서 둘 다 확인한다.
- `DESIGN.md`의 다크 값 일부는 합성값이다(`DESIGN.md` 자체 주석). 그대로 쓰고 바꾸지 않는다.
- Biome 전체 정리는 여러 파일의 포맷을 바꾼다. 자동 수정을 다른 변경보다 먼저 하고, 타입 검사와 빌드로 동작이 그대로인지 확인한 뒤 다음 단계로 간다.
- `/api/auth`의 가입 엔드포인트는 T14 전까지 열려 있다. 보호 프로시저가 세션을 쓰지 않으므로 가입해도 얻는 권한이 없고, 배포하지 않으므로 밖에서 닿지 않는다. 로컬 DB에 템플릿 시험 때 만든 계정이 남아 있어도 같은 이유로 영향이 없다. T14에서 가입을 막고 허용 목록을 적용한다.
