# 개발 안내

로컬에서 Omni AI TTS를 실행하고 고치는 방법입니다. 이 저장소의 에이전트 작업 규칙은 [AGENTS.md](../../AGENTS.md), 작업 절차의 정본은 [dev-workflow](../dev-workflow.md)입니다.

## 목차
- [준비물](#준비물)
- [처음 실행](#처음-실행)
- [환경 변수](#환경-변수)
- [자주 쓰는 명령](#자주-쓰는-명령)
- [구조](#구조)
- [테스트](#테스트)
- [DB 바꾸기](#db-바꾸기)
- [공급자 연동 규칙](#공급자-연동-규칙)
- [작업 절차(dev-cycle)](#작업-절차dev-cycle)

## 준비물

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | 22 이상(24 권장) | Vercel 프로젝트와 같은 판이면 좋다 |
| pnpm | 12.6 | 루트 `package.json`의 `packageManager` |
| Docker 또는 Podman | 최신 | 로컬 Postgres 18 컨테이너 |
| 공급자 키 | 선택 | 없는 공급자는 연결 상태에 '키 없음'으로 나오고 그 공급자 기능만 막힌다 |

## 처음 실행

```bash
pnpm install
```

```bash
pnpm db:start
```

`apps/web/.env.example`을 `apps/web/.env`로 복사해 채웁니다. 최소한 `BETTER_AUTH_SECRET`(32자 이상), `BETTER_AUTH_URL`(`http://localhost:3001`), `DATABASE_URL`, `OWNER_EMAILS`가 필요합니다.

```bash
pnpm --filter @tts-pilot-app/db db:migrate
```

```bash
pnpm owner:create
```

`owner:create`는 이메일(= `OWNER_EMAILS`)과 비밀번호(12자 이상, 두 번)를 묻습니다. 원격 DB와 production에서는 동작하지 않습니다. 예전 로컬 관리자(`local-admin`) 데이터가 있으면 이 계정으로 옮깁니다.

```bash
pnpm dev:web
```

[http://localhost:3001](http://localhost:3001)을 엽니다. 개발 주소는 `BETTER_AUTH_URL`과 같은 출처여야 로그인됩니다(`127.0.0.1`과 `localhost`는 다른 출처입니다).

## 환경 변수

정본은 [`apps/web/.env.schema`](../../apps/web/.env.schema)이고 varlock이 읽습니다. 값은 `apps/web/.env`(git·배포에서 빠짐)에만 둡니다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `BETTER_AUTH_SECRET` | 예 | 세션 서명 키, 32자 이상 |
| `BETTER_AUTH_URL` | 예 | 앱 주소. 로그인 출처 검사에 쓴다 |
| `DATABASE_URL` | 예 | Postgres 주소(운영은 Neon pooled) |
| `OWNER_EMAILS` | 사실상 예 | 소유자 이메일 하나. 비거나 둘 이상이면 아무도 소유자가 아니다 |
| `TYPECAST_API_KEY` · `ELEVENLABS_API_KEY` · `FISH_AUDIO_API_KEY` · `AIRY_API_KEY` · `GEMINI_API_KEY` | 선택 | 공급자 키. 서버 전용 |
| `OPENAI_API_KEY` | 선택 | 자동 태그 텍스트 모델(없으면 Gemini 보조) |
| `APP_MODE` | 아니오(기본 `owner`) | `owner` 본인용, `demo` 공개 데모. 빌드할 때 코드에 굳으므로 바꾸면 다시 빌드한다 |

로컬에서 공개 데모를 보려면 예시 데이터 DB를 `DATABASE_URL`로, `APP_MODE=demo`, 공급자·OpenAI 키를 빈 값으로 덮은 셸에서 `pnpm build` 뒤 `next start`로 띄웁니다(키가 하나라도 있으면 데모는 소유자를 정하지 않고 닫힙니다).

새 변수는 `.env.schema`에 먼저 선언합니다. 배포 환경의 값은 Vercel 환경 변수에만 둡니다([배포와 운영 안내](deployment.md)).

## 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `pnpm dev:web` | 개발 서버(3001) |
| `pnpm check-types` | 전체 타입 검사 |
| `pnpm exec biome check .` | 린트·포맷 검사 |
| `pnpm test` | 전체 테스트(API는 테스트 DB 필요) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm db:start` · `pnpm db:stop` | 로컬 DB 컨테이너 켜기·끄기 |
| `pnpm --filter @tts-pilot-app/db db:generate` | 스키마에서 마이그레이션 만들기 |
| `pnpm --filter @tts-pilot-app/db db:migrate` | 마이그레이션 적용 |
| `pnpm auth:generate` | Better Auth 표 스키마 다시 만들기 |

## 구조

```text
apps/web/src/app          라우트(랜딩 /, 로그인, (app) 보호 화면들, api/rpc·api/auth)
apps/web/src/components   화면 부품(작업실, 캐스팅, 드라마 …)
apps/web/src/lib          화면 로직(숫자 읽기, 대본 나누기, 결과 찾기 나누기 …)
apps/web/src/proxy.ts     쿠키 없는 요청을 /login으로(공개: /, /login, 정적 파일)
packages/api/src/routers  oRPC 프로시저(모두 protectedProcedure)
packages/api/src/providers 공급자 연동(Typecast·ElevenLabs·Fish Audio·Airy·Gemini·OpenAI)
packages/auth             Better Auth 설정(가입 막음, 로그인 시도 제한)
packages/db/src/schema    Drizzle 스키마, migrations/는 생성물
packages/ui               shadcn 부품과 토큰(globals.css)
```

화면 페이지 보호는 두 겹입니다. `proxy.ts`가 세션 쿠키 유무로 `/login`에 보내고, `(app)/layout.tsx`가 서버에서 소유자를 다시 판정합니다. 데이터는 `protectedProcedure`가 막습니다.

## 테스트

API 테스트는 실제 Postgres 테스트 DB를 씁니다.

```bash
set -a; . apps/web/.env; set +a; export TEST_DATABASE_URL="${DATABASE_URL%/*}/tts-pilot-app_test"; pnpm --filter @tts-pilot-app/api test
```

테스트 DB가 없으면 컨테이너 안에서 만들고 마이그레이션을 적용합니다. 사용자 데이터를 다루는 프로시저는 두 계정 격리 테스트(`*.isolation.test.ts`)가 있습니다. 공급자 호출은 테스트에서 가짜로 대신하고, 유료·상태 변경 호출은 자동 테스트와 브라우저 QA에서 하지 않습니다.

```bash
pnpm --filter web test
```

## DB 바꾸기

1. `packages/db/src/schema/*.ts`를 고칩니다(`auth.ts`는 `pnpm auth:generate`가 만듭니다).
2. `pnpm --filter @tts-pilot-app/db db:generate`로 마이그레이션을 만들고 SQL을 읽어 의도하지 않은 DROP이 없는지 봅니다.
3. 로컬 DB와 테스트 DB에 `db:migrate`로 적용합니다.
4. 공유·운영 DB에는 `db:push`를 쓰지 않습니다. 운영 적용은 [배포와 운영 안내](deployment.md)의 순서를 따릅니다.

## 공급자 연동 규칙

- 공급자 키를 쓰는 서버 코드는 `/api/rpc`의 `protectedProcedure`로만 엽니다. Server Action과 새 Route Handler는 만들지 않습니다.
- 유료 호출은 화면에서 확인 창을 거치고, 서버는 요청 id 선점과 동시 1건으로 중복을 막으며, 자동으로 다시 시도하지 않습니다.
- 공급자 연동 작업은 [TTS 공급자 연동 스킬](../../.agents/skills/tts-provider/SKILL.md)을 먼저 읽습니다.

## 작업 절차(dev-cycle)

이 저장소는 코드 변경을 dev-cycle 라운드로 진행합니다.

```bash
pnpm dev-cycle status
```

라운드 하나가 대조표 하나이고, 스펙 → 계획 → 구현(테스트 먼저) → 리뷰 → 검증 → 사용자 확인 → 닫기 순서입니다. 서비스 기능은 [구현 로드맵](../plans/implementation-roadmap.md)의 TASK 순서대로 하나씩 합니다. 자세한 규칙은 [AGENTS.md](../../AGENTS.md)와 [dev-workflow](../dev-workflow.md)에 있습니다.
