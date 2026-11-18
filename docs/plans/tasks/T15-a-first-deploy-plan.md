# T15-a 배포 준비와 첫 배포 — 구현 계획

- 작성 2026-11-18. 스펙: [T15-a-first-deploy.md](T15-a-first-deploy.md)(사용자 확인 2026-11-18). ADR: [0013](../../adr/0013-first-deploy-vercel-neon-singapore.md).
- 방법: agent-skills `planning-and-task-breakdown`. 구현은 `incremental-implementation` + `test-driven-development`, ponytail 모드.
- 기준 SHA: `e7cbf1f`(대조표 마커 base).

## 개요

코드 다섯 조각(늦은 결과 유지, 함수 시간, 로그인 시도 제한, 요청 크기 나누기, 지역)을 계층 에이전트에 차례로 맡긴다. 검증과 리뷰를 마친 뒤 Main이 외부 설정과 첫 배포를 한다. 외부 설정은 단계마다 사용자 동의를 받는다.

## 계획 단계에서 확인한 사실 (스펙과 다른 점 포함)

1. **로컬 DB에 소유자 계정이 아직 없다.** `user`·`account`가 0행이고 앱 데이터는 `owner_id = 'local-admin'`이다(saved_voice 9, script 6, channel 1, classification 5 등). `apps/web/.env`에는 `OWNER_EMAILS`가 없다. 그래서 데이터를 옮기기 전에 사용자가 로컬에서 `pnpm owner:create`를 실행한다. T14 스크립트가 계정을 만들고 `local-admin` 데이터를 그 계정으로 옮긴다. 비밀번호는 사용자가 직접 입력하고, 에이전트는 입력하지 않는다.
2. **늦은 결과를 넘기는 지점은 두 곳이다.** `routers/studio.ts:158`과 `routers/drama.ts:183`의 `void saveLate(...)`다. `saveLate`는 `packages/api/src/trial.ts:816`에 있고 `trial-studio.test.ts`가 직접 시험한다. `trial.ts:815`와 `providers/fish-audio.ts:328`의 shortcut 주석(배포·300초를 T15로 미룸)은 Task 1에서 고친다.
3. **`Context`를 만드는 곳이 많다.** 운영은 `apps/web/src/context.ts` `createContext`이고, 테스트 10개 이상이 `{ db, ownerId, providers }`를 직접 만든다. 그래서 새 필드는 **선택 필드**로 둔다. 없으면 지금처럼 `void`로 둔다(로컬 개발 서버는 프로세스가 살아 있으므로 그대로 동작한다).
4. **`after` 사용:** Next 문서(`04-functions/after.md`)에 따르면 Route Handler에서 쓰고, `maxDuration`까지 돈다. Vercel에서는 `waitUntil`로 함수 수명을 늘린다. `maxDuration`은 라우트 파일의 `export const maxDuration`(`02-route-segment-config/maxDuration.md`)으로 정한다.
5. **Better Auth 시도 제한은 기본으로 production에서만 켜진다.** 테스트·개발에서도 같은 동작을 보도록 `enabled: true`를 함께 둔다. 개발 서버 로그인에도 제한이 걸린다. 로그인(`/sign-in/email`)은 `customRules` 60초 5회다(basePath를 뗀 경로로 맞춤, 설치판 확인. 사용자 결정 2026-11-18). 그 밖의 sign-in·sign-up은 기본 특수 규칙 10초 3회이고, 키는 요청 IP(`getIP`)다. test·dev에서는 `127.0.0.1`이고, production에서 IP를 얻지 못하면 모든 요청이 `no-trusted-ip` 키 하나를 같이 쓴다(이때 누구나 소유자 로그인을 막을 수 있다. Task 6-8에서 확인). 구현 때 api-builder가 설치판 값으로 확인해 테스트에 적는다.
6. **DB 풀:** Neon pooled 주소는 PgBouncer라 클라이언트 연결을 많이 받는다(수천). 그래서 `max` 기본 10을 바꾸지 않는다. 스펙 4.1-5의 "max를 줄인다"를 이 계획이 대신한다. `connectionTimeoutMillis`·`query_timeout`은 Neon 측정(Task 6-3) 결과로만 바꾼다.
7. `utils/orpc.ts:32`의 SSR 대체 주소 `127.0.0.1:3001`은 쓰는 곳이 모두 클라이언트 컴포넌트라 바꾸지 않는다. 배포 QA에서 SSR 오류가 없는지만 본다.
8. 새 환경 변수는 없다. `.env.schema`·`turbo.json` `globalEnv`도 바꾸지 않는다.

## 재사용·설정 결정 (reuse-design)

| 대상 | 기존 경로·소비자 | 결정 |
|---|---|---|
| 늦은 결과 저장 | `saveLate`(`packages/api/src/trial.ts`), 소비자 `studio.ts`·`drama.ts`, 시험 `trial-studio.test.ts` | 그대로 재사용. 넘기는 방식만 `Context.defer`로 바꾼다. 새 래퍼·`@vercel/functions` 없음 |
| 응답 뒤 작업 | Next `after`(번들 문서) | 플랫폼 기능 재사용. `packages/api`는 Next를 모르고 함수 하나만 받는다(계층 경계) |
| 컨텍스트 | `apps/web/src/context.ts` `createContext`(소비자: `/api/rpc` 라우트 하나), 테스트의 직접 생성 10여 곳 | `createContext`는 바꾸지 않고 라우트에서 `defer`를 펼쳐 더한다. 필드는 선택이라 테스트 회귀 없음 |
| 시도 제한 | Better Auth 내장 `rateLimit`(설치판 1.7.5), 스키마 생성 `pnpm auth:generate` | 내장 저장소 재사용. 손으로 쓴 표·미들웨어 없음 |
| 결과 찾기 나누기 | `findTargets`(`lib/make-all.ts`), 소비자 `paragraph-provider.tsx` `fetchFound` | 같은 파일에 순수 함수 하나(`chunkTargets`). 소비자 한 곳이라 범용 유틸로 빼지 않는다 |
| 데이터 옮기기 | T14 `owner:create`(로컬 계정·local-admin 이전), `pg_dump`·`psql`(컨테이너 안) | 스크립트 새로 만들지 않음. 명령을 `docs/owner-account.md`에 적는다 |
| 배포 | `scripts/vercel-deploy.mjs`·`scripts/release.mjs`·`.vercelignore` | 그대로 사용(`prokit-deploy`) |

**설정:** 새 환경 변수 없음. `apps/web/.env.schema`를 직접 읽어 확인했다. 필수는 `NODE_ENV`(Vercel이 production으로 줌)·`BETTER_AUTH_SECRET`(32자 이상)·`BETTER_AUTH_URL`(url, preventLeaks=false)·`DATABASE_URL`이고, 선택은 `OWNER_EMAILS`·공급자 키 6개다. 로컬 공급은 지금처럼 `apps/web/.env`(varlock)이고, production은 Vercel Production env(`prokit-deploy` 준비 4번)로 넣는다. develop은 없다. `OWNER_EMAILS`는 선택이지만 운영에서는 반드시 넣는다(비면 아무도 소유자가 아님). 이 확인은 `--check`의 필수 검사에 걸리지 않으므로 Task 6-5 확인 목록에 둔다. `turbo.json` `globalEnv`는 그대로 둔다(변수 이름 변경 없음). 설정 파일은 `apps/web/vercel.json`(regions) 하나를 새로 만든다.

**회귀 검사:** api·web 전체 테스트(949·964), T14 가입 거부·소유자 테스트, `trial-studio.test.ts`의 늦은 결과 시험, 문단 작업실 결과 찾기 런타임 확인, 빌드.

## 의존 그래프

```
Task 1 api: 컨텍스트 defer + studio·drama + 늦은 상한 270초
   └─ Task 2 api 진입점: /api/rpc maxDuration 300 + after로 defer 채우기
Task 3 auth→db: rateLimit database (auth 설정 → auth:generate 스키마 → dbGenerate 마이그레이션 → 로컬·테스트 DB 적용)
Task 4 web: studioFindMany 크기 나누기
Task 5 H: apps/web/vercel.json regions
── 체크포인트 A: 타입·린트·테스트·빌드, 리뷰(code·db·security)
Task 6 Main 외부: 계정 → GitHub → Neon(측정·마이그레이션·데이터) → Vercel(link·env) → 커밋·릴리스 v0.1.0 → 배포 → 확인
Task 7 Main 문서
── 체크포인트 B: 배포 주소 QA(runtime-checker) → 사용자 테스트 → [confirm]
```
Task 1·3·4·5는 서로 다른 파일이라 병렬로 할 수 있다. Task 2는 Task 1의 계약에 의존한다.

## Task 0: Neon 프로젝트와 32MiB 쓰기 측정 (Main, 구현 전, 사용자 동의 0)

**설명:** 측정 결과가 코드(시간 제한)에 반영될 수 있으므로 구현 전에 한다. Neon 프로젝트 `omni-ai-tts`(aws-ap-southeast-1, PG 18)를 만든다. → 실제(2026-11-18): Neon CLI는 Vercel 관리 조직에 프로젝트를 만들 수 없어 사용자가 Vercel Storage로 `neon-omni-ai-tts`(wandering-lake-60352457)를 만들었다. direct 주소로 임시 표(`CREATE TEMP TABLE`)에 32MiB bytea 한 행을 `pg`(앱과 같은 드라이버, `query_timeout` 없이 시간만 잼)로 쓰는 시간을 로컬→싱가포르에서 세 번 잰다. 주소는 셸 변수로만 넘긴다.
- 3초 안: 시간 제한은 그대로 둔다. 운영 함수(sin1)는 측정 위치보다 가까우므로 상한 추정이다.
- 3초를 넘음: Task 1에 "오디오 저장 질의(완료 쓰기)만 시간 제한을 측정값 × 2로 늘린다"를 더해 같은 구현·리뷰를 거친다.
- 측정값은 ADR 0006에 한 줄로 적는다(Task 7).
- Main은 시작 전에 `.agents/skills/neon/SKILL.md`와 `.agents/skills/neon-postgres/SKILL.md`를 Read로 끝까지 읽고 따른다(이 라운드의 읽기는 순서와 무관하게 9행 증거에 센다. 6-3에서 9행을 채우기 전에 다시 끝까지 읽는다. 상위 neon은 11행 db 리뷰어도 읽는다).

## Task 1: 늦은 결과를 응답 뒤 작업으로 넘긴다 (prokit-api-builder, S)

**설명:** `Context`에 선택 필드 `defer?: (task: Promise<unknown>) => void`를 더한다. `studio`·`drama`의 `void saveLate(...)`를 `context.defer`로 넘기고, `defer`가 없을 때는 지금처럼 둔다. `SCENE_LATE_MAX_MS`를 270,000으로 바꾸고, 상수 주석에 "Vercel Hobby 함수 300초 − 저장 여유 30초(ADR 0013)"를 적는다. `studio.ts`의 Typecast `shortcut:` 주석에 "함수가 300초에 끝나면 늦은 응답을 잃는다"를 더한다.

**수용 기준:**
- [ ] studio·drama가 늦은 결과가 있을 때 `context.defer`를 정확히 한 번 부르고, 넘긴 작업이 끝나면 생성 기록이 완료로 바뀐다(테스트 DB).
- [ ] `defer`가 없는 컨텍스트(기존 테스트)는 그대로 통과한다.
- [ ] `SCENE_LATE_MAX_MS === 270_000`이고 Fish 장면 상한이 이 값을 쓴다.

**검증:** `pnpm --filter @tts-pilot-app/api test`(RED 먼저: defer를 부르지 않는 지금 코드에서 새 테스트가 실패해야 한다), `pnpm check-types`.
**파일:** `packages/api/src/context.ts`, `packages/api/src/routers/studio.ts`, `packages/api/src/routers/drama.ts`, `packages/api/src/providers/errors.ts`, `packages/api/src/trial.ts`(815행 shortcut 주석만: '270초 상한·함수 300초를 넘는 Typecast 응답은 잃음·ADR 0013'), `packages/api/src/providers/fish-audio.ts`(328행 주석만), (Task 0이 3초를 넘으면) 완료 쓰기 시간 제한 위치, 테스트 `packages/api/src/routers/studio.test.ts`·`drama.test.ts`(기존 늦은 결과 시험이 있는 파일에 더한다).
**읽을 스킬:** `prokit-api`, `.agents/skills/tts-provider/SKILL.md`, `agent-skills:incremental-implementation`, `agent-skills:test-driven-development`.

## Task 2: /api/rpc가 함수 300초와 after를 쓴다 (prokit-api-builder, XS)

**설명:** `apps/web/src/app/api/rpc/[[...rest]]/route.ts`에 `export const maxDuration = 300`을 두고, 컨텍스트에 `defer: (task) => after(() => task)`를 더한다(`createContext`는 그대로, 라우트에서 펼쳐 더한다). `after`는 `next/server`에서 가져온다.

**수용 기준:**
- [ ] 빌드 출력에서 `/api/rpc`의 maxDuration이 300이다(`.next` 함수 설정 또는 빌드 로그).
- [ ] 로컬 개발 서버에서 기존 흐름이 그대로다(무료 경로: 연결 상태·성우 목록).

**검증:** `pnpm check-types`, `pnpm build`, 체크포인트 A의 런타임 확인.
**파일:** 위 route.ts 하나. **의존:** Task 1.
**Next 문서:** `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, `.../03-file-conventions/02-route-segment-config/maxDuration.md`.

## Task 3: 로그인 시도 제한을 DB에 둔다 (prokit-api-builder → prokit-db-builder, S)

**설명:**
1. (api) `packages/auth/src/index.ts`에 `rateLimit: { enabled: true, storage: "database", customRules: { "/sign-in/email": { window: 60, max: 5 } } }`를 넣는다(로그인 규칙은 사용자 결정 2026-11-18, `better-auth-security-best-practices` 예시 값). 나머지 경로는 라이브러리 기본.
2. (db) 설치판과 같은 판의 CLI로 스키마를 다시 만든다(`auth:generate`의 `auth@latest` 대신 `auth@1.7.5`를 한 번만 지정해 실행하고 package.json 스크립트는 바꾸지 않는다). `packages/db/src/schema/auth.ts`의 diff가 `rateLimit` 표 추가뿐이 아니면 멈추고 보고한다. 이 파일은 손으로 고치지 않는다. 이어 `commands.dbGenerate`로 마이그레이션을 만들고 SQL을 검토한다(새 표 하나, DROP 없음).
3. (Main) 새 테스트를 돌리기 전에 테스트 DB에, 이어 로컬 개발 DB에 `commands.dbMigrate`를 적용한다.
4. (api) 새 테스트는 고유한 `x-forwarded-for` 값을 쓰고 `afterAll`에서 그 key의 `rate_limit` 행을 지운다(공유 테스트 DB에서 다시 돌려도 첫 요청이 429가 되지 않게).

**수용 기준:**
- [ ] 테스트 DB에서 틀린 비밀번호 로그인 5회까지는 401이고 6번째가 429이며, `rate_limit` 행이 생긴다(`auth-signup.test.ts` 옆 새 테스트).
- [ ] 가입 거부 테스트(T14)가 그대로 통과한다.
- [ ] 생성 SQL은 `CREATE TABLE`과 인덱스뿐이고, `auth.ts` diff는 `rateLimit` 표 추가뿐이다.

**검증:** `pnpm --filter @tts-pilot-app/api test`, SQL 검토, `prokit-reviewer(db)`, `prokit-reviewer(security)`.
**파일:** `packages/auth/src/index.ts`, `packages/db/src/schema/auth.ts`(생성), `packages/db/src/migrations/<새 폴더>`(생성), 테스트 `packages/api/src/auth-rate-limit.test.ts`(새).
**읽을 스킬:** api는 `better-auth-best-practices`·`better-auth-security-best-practices`, db는 `supabase-postgres-best-practices`. `auth:generate`는 `pnpm dlx auth@latest`라 네트워크가 필요하다.

## Task 4: studioFindMany를 본문 크기로도 나눈다 (prokit-ui-builder, S)

**설명:** `apps/web/src/lib/make-all.ts`(findTargets가 있는 곳)에 순수 함수 `chunkTargets(targets, maxCount, maxBytes)`를 둔다. 각 항목의 `JSON.stringify` UTF-8 크기를 더해 묶음이 3.5MB(`3_500_000`)나 200개를 넘기 전에 자른다. 한 항목이 혼자 한도를 넘으면 그 항목만 한 묶음으로 둔다(서버 입력 상한 8,000자라 생길 수 없지만 무한 반복을 막는다). `paragraph-provider.tsx` `fetchFound`의 200개 루프를 이 함수로 바꾼다. T10-03을 닫는다.

**수용 기준:**
- [ ] 최악 입력(200개 × 8,000자 한글)이 묶음마다 3.5MB 이하로 나뉘고, 순서와 항목 합이 입력과 같다.
- [ ] 작은 입력은 지금처럼 200개씩이다.

**검증:** `pnpm --filter web test`(새 단위 테스트), `pnpm check-types`.
**파일:** `apps/web/src/lib/make-all.ts`, `apps/web/src/lib/make-all.test.ts`, `apps/web/src/components/paragraph-provider.tsx`.
**읽을 스킬:** `prokit-ui`, `prokit-web`, `vercel-react-best-practices`.

## Task 5: 함수 지역 sin1과 .impeccable 무시 (prokit-implementer, XS)

**설명:** `apps/web/vercel.json`을 만들고 `{ "regions": ["sin1"] }` 한 줄만 둔다(Vercel 프로젝트 root가 `apps/web`). Hobby가 받지 않으면 배포 때 Vercel 프로젝트 설정으로 바꾸고 파일을 지운다. 루트 `.gitignore`에 `.impeccable/` 한 줄을 더한다(사용자 결정 2026-11-18). 이후 `git status --porcelain`에 `.impeccable/`이 나오지 않아야 한다.

**검증:** JSON 확인, 배포 뒤 `vercel inspect`의 함수 지역.
**파일:** `apps/web/vercel.json`, `.gitignore`. **읽을 스킬:** `prokit-deploy`.

## 체크포인트 A (대조표 검증·리뷰 행)
- [ ] (Task 3-3에서 적용 끝) 로컬 개발 DB·테스트 DB의 마이그레이션 상태 확인.
- [ ] 대조표 행 처리: 9행(병합 전 Neon 개발 브랜치)은 develop이 없으므로(스펙 결정 9) 새 운영 프로젝트의 빈 main에 처음 적용하는 Task 6-3 결과로 채운다(데이터를 넣기 전이라 같은 확인이다). 17·18·21~27행은 'N/A: 보이는 화면 변경 없음(스펙 5절. 21·22행의 결과 찾기 동작은 28행 런타임 확인이 본다)'. 19행은 Task 4 위임 증거(`위임: prokit-ui-builder(사용: prokit-ui, prokit-web(Next 문서: N/A: 바꾼 Next API 없음), vercel-react-best-practices)`), 20행은 체크포인트 A의 타입·린트·빌드 결과로 채운다. 12행(zod 계약)은 'N/A: 새 프로시저 없음', 14행(2계정 격리)은 기존 studio·drama 격리 테스트의 통과 결과로 채운다. 28행 통합 런타임 확인은 한다.
- [ ] `pnpm check-types`, `pnpm exec biome check .`(기준 10과 비교), `pnpm test`(api 949·web 964 + 새 테스트), `pnpm build`.
- [ ] `prokit-reviewer`(code·db·security) 승인, ponytail-review.
- [ ] 런타임 확인(prokit-runtime-checker, 3002 포트·테스트 DB, 3001 개발 서버와 dev DB는 건드리지 않는다): 로그인, 시도 제한 429, 문단 작업실 결과 찾기.

## Task 6: 외부 설정과 첫 배포 (Main, 단계마다 사용자 동의)

외부 서비스에 적용하는 일이라 서브에이전트에 맡기지 않는다(`prokit-deploy`). 비밀값은 셸 변수로만 넘기고 출력하지 않는다.

1. **로컬 계정(사용자):** `apps/web/.env`에 `OWNER_EMAILS=<본인 이메일>`을 넣고 `pnpm owner:create`를 실행한다. 비밀번호는 직접 입력한다. 끝나면 Main이 `user` 1행과 `local-admin` 0행을 확인한다.
2. **GitHub(동의 1):** `gh repo create freelife1191/omni-ai-tts --private --source . --remote origin`. push는 6번에서 한다.
3. **Neon 마이그레이션(동의 2, 프로젝트는 Task 0에서 만듦, `neon-postgres`):** 9행 증거는 `사용: neon-postgres`, 브랜치 main(운영, 데이터 넣기 전), 적용한 마이그레이션 수로 적는다.
   - 마이그레이션 전체를 적용한다(`DATABASE_URL=<direct> pnpm --filter @tts-pilot-app/db db:migrate`, 값은 셸 변수).
   - `select show_trgm('가나다')`와 `pg_extension`으로 trigram을 확인한다.
4. **데이터 옮기기(동의 3, 표와 행 수를 보여 드린 뒤):** 로컬 컨테이너의 `pg_dump --data-only`를 운영 direct 주소로 `psql --single-transaction`에 넘긴다.
   - 옮기는 표(12개): `user`, `account`, `channel`, `channel_default_preset`, `classification`, `my_voice`, `saved_voice`, `saved_voice_channel`, `saved_voice_classification`, `script`, `script_classification`, `voice_preset`.
   - 옮기지 않는 표: `session`, `verification`, `rate_limit`, `provider_cooldown`, `provider_list_cache`, `trial_generation`, `drizzle.__drizzle_migrations`.
   - 명령: `export PROD_URL` 뒤 `podman exec -e PROD_URL <컨테이너> sh -c 'test -n "$PROD_URL" && printf %s "$PROD_URL" | grep -q sslmode=require || exit 1; pg_dump --data-only -t … | psql "$PROD_URL" -v ON_ERROR_STOP=1 --single-transaction'`처럼 작은따옴표로 컨테이너 안에서만 주소를 펼친다(호스트 셸 기록·프로세스 인수에 남기지 않는다, 보안 리뷰). 12개 표를 `-t 'public."user"' -t public.account …`로 명시하고, 덤프를 파일로 쓰지 않는다. PROD_URL에 `sslmode=require`가 있는지 `grep -q`로 먼저 본다. 이 명령을 `docs/owner-account.md`에 그대로 적는다.
   - 운영 DB 주소는 Neon CLI(`neon cs --project-id wandering-lake-60352457`, direct — 마이그레이션·데이터 옮기기는 `--pooled` 없이)로 셸 변수에만 받는다(파일에 두지 않는다).
   - 운영 주소는 `podman exec -e`로 값 없이 이름만 넘긴다.
   - 표마다 행 수를 로컬과 운영에서 비교한다.
5. **Vercel(동의 4):**
   - `vercel link --yes --project omni-ai-tts --scope <팀>`. `.gitignore`·`.env.local` 정리와 Git 연결 끊기는 `prokit-deploy` 준비 3번대로 한다.
   - `vercel project update omni-ai-tts --root-directory apps/web --framework nextjs --yes`, Node 24.x, Project Settings → Functions에서 Fluid compute 켜짐 확인(꺼져 있으면 Hobby 상한이 60초라 Task 2의 전제가 무너진다).
   - `vercel env ls`로 이름과 대상 환경만 본다. 운영 DB는 Vercel Storage 통합으로 만들어져 `DATABASE_URL`·`PG*`·`POSTGRES_*`가 Preview·Production에 이미 있다(2026-11-18 확인). `DATABASE_URL`은 통합 값을 쓰고 `-pooler` 호스트인지 `grep -q`로만 판정한다. Preview는 배포하지 않으므로 그대로 두되, 통합이 Development에도 넣었으면 로컬 `vercel` 명령이 받지 않게 확인한다.
   - Preview·Development의 `DATABASE_URL`(통합이 넣은 운영 주소)은 지운다(develop 배포를 하지 않으므로, 실수 배포가 운영 DB에 쓰지 않게. ADR 0013).
   - Production env를 넣는다(이미 있는 `DATABASE_URL`은 넣지 않는다):
     - `DATABASE_URL`: 넣지 않는다. Storage 통합 값이 `-pooler` 호스트인지 `grep -q`로만 확인한다.
     - `BETTER_AUTH_SECRET`: `openssl rand`로 만든 새 값.
     - `BETTER_AUTH_URL`: `--type config`.
     - `OWNER_EMAILS`: 셸 변수와 `printf '%s' | vercel env add … --sensitive`로 넣는다(`--value` 금지).
     - 공급자 키 6개: 로컬 `.env`의 값을 `varlock`·셸 변수로 읽어 `printf | vercel env add --sensitive`로 넘긴다. 값은 출력하지 않는다.
6. **커밋·릴리스(동의 5):**
   - 작업 트리가 깨끗한지 본다. `vercel-deploy.mjs`는 추적하지 않는 파일까지 센다(`git status --porcelain`). `.impeccable/`은 Task 5에서 무시 목록에 넣었다.
   - 이 라운드 코드·문서를 `feat:` 커밋한다(`pnpm dev-cycle secrets` 통과 뒤).
   - 첫 push는 이력 전체(커밋 50여 개)를 처음 올린다. push 전에 이력 전체에서 공급자 키 접두·연결 문자열 패턴을 찾아 걸린 파일과 커밋만 본다(값은 출력하지 않는다).
   - `pnpm vercel:deploy production --check`로 남은 항목이 릴리스뿐이고 `Git 자동 배포`가 없는지 본다.
   - 이 동의에 배포 뒤 운영 쓰기 확인을 함께 묻는다: 가입 시도 1회(거부돼 `user`가 늘지 않는 것을 count로 확인)와 틀린 비밀번호 6회(`rate_limit` 행이 생긴다). `prokit-deploy`는 운영 데이터를 만드는 확인을 기본으로 하지 않으므로 따로 동의를 받는다.
   - `origin`에 push하고 `pnpm release --title "First deploy"`로 노트를 만든다. 노트를 검수한 뒤 버전 `v0.1.0`과 노트를 보여 드리고 `--publish`한다.
   - 커밋부터 8번 확인까지 추적 파일을 고치지 않는다. 증거 칸 기록과 닫기 커밋은 배포 뒤([confirm] 뒤)에 한다.
7. **배포:** `pnpm vercel:deploy production --check` → `pnpm vercel:deploy production`. 주소가 `omni-ai-tts.vercel.app`이 아니면 `BETTER_AUTH_URL`을 `--force`로 고치고 다시 배포한다.
8. **확인:**
   - `curl`로 `/api/auth/get-session`이 200인지 본다.
   - `vercel inspect`로 함수 지역 sin1과 maxDuration을 본다.
   - (동의 5에서 함께 받은 경우) 가입 시도(`POST /api/auth/sign-up/email`)가 거부되는지, 그 전후로 운영 `user` 행 수(count만)가 그대로인지 본다(수용 기준 3).
   - 틀린 비밀번호를 연달아 보내 429를 받은 뒤 `select bool_or(key like 'no-trusted-ip|%') from rate_limit`가 false인지 본다(IP 값은 출력하지 않는다). Vercel 함수 로그에 Better Auth의 클라이언트 IP 경고가 없는지도 본다. 하나라도 걸리면 `advanced.ipAddress.ipAddressHeaders` 설정을 security 수정으로 하고 다시 리뷰·배포한다.

**되돌리기:** 앱은 스크립트가 출력한 `vercel rollback`(첫 배포라 이전 배포가 없으면 프로젝트를 일시 정지한다)으로 되돌린다. DB는 운영 표를 비우고 4번을 다시 한다(운영에 다른 데이터가 아직 없다).

## Task 7: 문서 (Main)
- `docs/owner-account.md`: "운영 DB" 절(로컬 계정을 만든 뒤 데이터 옮기기 명령, 옮기는 표와 옮기지 않는 표, 운영에서 비밀번호를 잊었을 때는 로컬과 같은 복구 SQL을 운영 direct 주소로 실행한다는 것).
- `docs/domain/project.md`: 데이터 모델에 `rate_limit`, 배포 주소, 시도 제한.
- `docs/adr/0006`: Neon 32MiB 쓰기 측정값 한 줄.
- 로드맵 T15-a 상태, `tasks/todo.md` T10-03 닫기, T14-04는 결론(누출 감지 해제 유지)을 적고 닫기.

## 체크포인트 B
- [ ] 배포 주소 QA(prokit-runtime-checker): 깨끗한 프로필, 1440·390. 생성·클론·삭제 버튼은 누르지 않는다. 로그인 자격은 사용자가 직접 입력해야 하고 운영 쓰기(가입 시도·틀린 비밀번호)는 Task 6-8에서 Main이 한 번만 했으므로, 런타임 체커는 로그인 화면과 보호 경로 차단(`/login?next=`)만 보고 로그인 뒤 화면은 사용자 테스트로 본다.
- [ ] 사용자 테스트(스펙 10절, 로그인 뒤 확인 항목 포함: 원래 화면 복귀, 메뉴 전체 이동, 채널·분류, 대본 한글 검색, 성우 목록 다섯, 1440·390 작업실 첫 화면) → [confirm].

## 위험과 대응
| 위험 | 영향 | 대응 |
|---|---|---|
| Vercel이 `pnpm@12.6.0`·모노레포 빌드를 못 함 | 높음 | 첫 배포 로그로 확인. 실패하면 Node 24·Corepack 설정, 필요하면 `packageManager`를 Vercel 지원 버전으로(사용자 확인) |
| Hobby가 `vercel.json` regions를 거부 | 낮음 | 프로젝트 설정으로 지역 지정, 파일 삭제 |
| Neon 콜드 스타트가 연결 시간 초과 3초를 넘김 | 중간 | 첫 요청 실패가 재현되면 `connectionTimeoutMillis`만 늘리는 후속(api·db 리뷰) |
| `omni-ai-tts.vercel.app`이 이미 쓰임 | 낮음 | 실제 주소로 `BETTER_AUTH_URL` 수정 |
| 시도 제한 `enabled: true`로 개발·QA 로그인이 막힘 | 낮음 | 60초 동안 막힘. QA는 로그인을 먼저 한 뒤 429를 확인한다 |
| Vercel에서 IP를 못 읽어 모든 요청이 한 키(`no-trusted-ip`)로 묶임 | 중간 | Vercel은 `x-forwarded-for`를 넣는다. security 리뷰가 `getIP` 기본 헤더를 확인하고, 배포 뒤 429 시나리오로 본다 |
| 데이터 복사 중 FK 순서 오류 | 중간 | `pg_dump`가 FK 순서로 정렬, `--single-transaction`이라 실패 시 전부 되돌림 |
| 운영 주소에서 Typecast·Fish 늦은 결과 300초 초과 | 낮음 | ADR 0013에 적은 한계, T15-b에서 실제 사용으로 관찰 |

## 범위 밖 (스펙 6절 그대로)
develop 환경, 커스텀 도메인, Git 자동 배포·CI, 원격 owner:create, 오디오 외부 저장소·cron, Pro 플랜, `@vercel/functions`, 로그 수집, 생성 기록 옮기기, 표시 이름 변경, 다중 소유 보강.
