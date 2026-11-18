# T15-a2 구현 계획: 공개 데모, 랜딩 후속과 첫 배포

- 스펙: [T15-a2-demo-and-first-deploy.md](T15-a2-demo-and-first-deploy.md)(사용자 확인 2026-11-19)
- 순서(사용자 2026-11-19 "데모용을 하나 띄워줘"): 데모 모드를 맨 앞에 두고, 끝나면 로컬 데모 서버(3003)를 띄워 보여 준다.
- 2판(계획 리뷰 1차 changes-required 반영): APP_MODE 비밀 아님, 데모 모드 잘못 켜짐 방어, 앱 틀을 `(app)` 레이아웃으로, 데모 클라이언트 하나로 단순화, auth 라우트 전체 404, 샘플 한 벌, 글꼴·샘플 경로 proxy 제외, 시드 정리 목록, Vercel 정리를 데이터 앞으로, 담당 분할.

## 재사용·설정 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 데모 판정 | `APP_MODE`(`owner`·`demo`)를 `.env.schema`에 `# @sensitive=false @type=enum(owner, demo)`, 값 `APP_MODE=owner`로 선언. 서버 전용(`@public` 아님), turbo globalEnv | 스키마 기본이 `@defaultSensitive=true`라 비밀로 두면 varlock 누출 감지가 "owner"·"demo"가 든 모든 응답을 막는다(varlock scanStrForLeaks) |
| 잘못 켜짐 방어 | ① `readOwner`의 데모 분기는 공급자 키 5개·OpenAI 키 중 하나라도 비어 있지 않으면 소유자 없음(state none)으로 닫는다(테스트). ② 배포 스크립트가 대상별로 검사: `studio`는 `APP_MODE=demo`면 거절, `demo`는 `APP_MODE=demo` 필수이고 `vercel env ls`에 공급자·OpenAI 키 이름이 없어야 한다. ③ ADR 0015 결과에 기록 | 본인용에 데모 모드가 켜지면 실제 데이터가 로그인 없이 열린다(과금 방어와 별개) |
| 소유자 | `apps/web/src/context.ts:19` `readOwner` 맨 앞의 데모 분기. 조회 함수(`OWNER_EMAILS` 이메일 → `user.id`)는 `packages/api/src/owner.ts`에. 데모는 `getSession`을 부르지 않는다 | 레이아웃·로그인·`/`·RPC의 단일 진입점(리뷰 확인) |
| 앱 틀 | 건너뛰기 링크·`AppNav`·`<main id="main-content">`를 루트 레이아웃에서 `(app)/layout.tsx`로 옮긴다. 루트는 html·body·Providers만. 소개 페이지와 로그인은 각자 `<main>`, 없는 주소는 자기 처리 | 데모는 모든 요청이 소유자라 루트 레이아웃이 소개 페이지를 앱 틀로 감싼다. 랜드마크(T15-07)도 같이 풀린다 |
| 공급자 | 데모면 `context.ts:51`에서 `createProviders` 대신 **데모 클라이언트**: `synthesize`·`synthesizeScene`은 데모 샘플 바이트(드라마 `segments: null`), `checkStatus`는 `no_key` 상태, 목록·억양·모델 메서드는 `providerError("provider_error")`. Context 새 필드·새 거절 사유는 만들지 않는다 | 없는 메서드는 기존 코드가 `no_key`로 닫힌다(my-voice·자동 태그·rates). tts-provider 규칙상 UNAUTHORIZED·FORBIDDEN 금지 |
| 성우 목록 | 시드의 `provider_list_cache.expires_at`을 먼 미래로(SQL 한 줄). 캐시에 없는 조합은 실패 → 화면이 데모 모드면 "공개 데모는 저장해 둔 목록만 보여요" | 라우터·voice-cache 변경 없음. 시드 전에 공급자·출처별 기본 페이지를 로컬 본인 환경에서 미리 받아 둔다(무료 목록 조회) |
| 데모 표시 | 서버 컴포넌트가 `demo` 여부를 props로 내려 준다(데모 띠, 계정 줄 '공개 데모', 결과 '데모 샘플', 연결 상태·클론·새로 고침·자동 태그 안내). 데모에서는 이메일을 클라이언트로 넘기지 않는다 | `owner` 조회 프로시저 없음(리뷰 확인), 클라이언트가 env를 읽지 않는다 |
| 데모 샘플 바이트 | 한 벌만 `apps/web/public/samples/`에 두고 `apps/web/src/context.ts`가 `fs.readFile(path.join(process.cwd(), "public/samples", …))`로 읽어 데모 클라이언트에 넘긴다. `next.config.ts` `outputFileTracingIncludes`에 `/api/rpc/[[...rest]]`: `./public/samples/**` | Vercel 함수에는 public/이 들어가지 않는다. 운영에서 데모 생성 한 번으로 확인 |
| 로그인 막기 | 데모면 기존 `app/api/auth/[...all]/route.ts`가 모든 경로를 404로(기존 핸들러 안 분기 하나, 새 Route Handler 아님). proxy는 데모에서 쿠키 검사 없이 통과한다. `/login`은 리다이렉트하지 않는다: 소유자 상태면 로그인 화면이 이미 `/studio`로 보내고, 키가 남아 데모가 닫힌(소유자 없음) 상태면 로그인 화면이 '공개 데모 설정 오류' 고정 안내를 보인다(리다이렉트 반복 방지) | `disabledPaths`는 경로를 하나씩 맞춰야 해 빠뜨리기 쉽다 |
| proxy 제외 | matcher에 `fonts/`·`samples/` 추가(+ 테스트) | 본인용 로그인 화면(쿠키 없음)에서 글꼴·샘플 요청이 `/login`으로 가지 않게 |
| 본인용 noindex | `next.config.ts` `headers()`(빌드 때 `APP_MODE=owner`면 `/:path*`에 `X-Robots-Tag: noindex, nofollow`)와 `app/robots.ts`(모드별, 본인용 전체 차단·데모 허용) | headers.md, robots.md |
| 글꼴 | `public/fonts/pretendard/`에 v1.3.9 가변 동적 서브셋 92개 + `@font-face` CSS를 `index.css`로, `localFont` 두 곳 삭제, `--font-pretendard`와 Arial size-adjust 폴백 `@font-face` 직접 | `next/font/local`은 unicode-range 분할을 못 받는다. preload 경고(T15-04)도 함께 사라진다 |
| 한국 전용 | 두 Vercel 프로젝트에 Firewall 사용자 규칙 '국가가 KR이 아니면 거절'(코드 없음, 정적 파일·API까지 덮음). Hobby에서 안 되면 대체: `proxy.ts`(화면)와 기존 `api/rpc`·`api/auth` 핸들러 앞에서 `x-vercel-ip-country`가 있고 KR이 아니면 403 안내(헤더가 없는 로컬은 통과). 대체를 쓰면 정적 파일은 막지 못한다 | 사용자 2026-11-19 "데모 전체 한국만", "본인용도 한국만". VPN 우회는 받아들임 |
| 매일 초기화 | GitHub Actions 예약 작업이 Neon API restore(`POST …/branches/{main}/restore`, `source_branch_id`=부모 `seed`, 즉 부모에서 다시 만들기)로 데모 `main`을 `seed`에서 다시 만든다. 워크플로가 `project_id`가 저장소 변수의 데모 id와 같은지 먼저 확인하고 다르면 실패. 키는 Main이 `gh secret set`(파이프). 데모 프로젝트 범위 키를 만들 수 없고 조직·개인 키만 되면 멈추고 사용자에게 묻는다 | 앱에 새 경로 없음, 운영 DB를 건드릴 수 없게 |
| 배포 스크립트 | `scripts/vercel-deploy.mjs`에 대상 인자(`studio`·`demo`)와 위 ② 검사만. `APP_MODE` 값은 `env run`으로 읽되 `cleanEnv`가 로컬 셸의 `APP_MODE`도 지운다(로컬 데모 셸 값이 덮지 않게). 읽지 못하면 실패로 본다. 프로젝트·조직 id는 비밀이 아니므로 `.dev-cycle.json`에, env로 넘긴다 | 스크립트가 이미 `VERCEL_PROJECT_ID`·`VERCEL_ORG_ID`를 먼저 본다 |

## 공개 쓰기 남용 (사용자 수용 2026-11-19)
데모는 로그인 없이 쓰기가 열려 있고 만들기마다 샘플 바이트가 새 행으로 복사된다. 스크립트가 반복하면 Neon 무료 용량이 차거나 계산 시간(CU-hours)을 소모할 수 있고, 매일 초기화로 용량은 돌아오지만 쓴 계산 시간은 돌아오지 않는다. 사용자가 이 위험을 받아들였다("위험을 받아들일께 유료키는 없어서 괜찮아": 데모 환경에 유료 키가 없어 과금이 없다). 무료 한도를 넘으면 데모가 멈출 뿐이다. 그래도 데모가 살아 있게, Task 7에서 Hobby 플랜으로 가능하면 데모 프로젝트에 Vercel Firewall 속도 제한 규칙(`POST /api/rpc`, IP당 1분 120회. 조회도 RPC라 넉넉하게)을 건다. 안 되면 위 수용대로 둔다(사용자 질문 2026-11-19 뒤 추천).

## Task 목록

담당은 `.dev-cycle.json` 계층 규칙을 따른다(B 화면 → prokit-ui-builder, D 서버·`robots.ts` → prokit-api-builder, H `next.config`·`turbo.json`·`.github`·`scripts` → prokit-implementer, `.env.schema`(authPath) → prokit-api-builder, 그 생성물 `env.ts`도 같은 에이전트가 `pnpm --filter web env:generate`로). 첫 코드 변경 뒤 `pnpm dev-cycle table F --write --upgrade`로 auth·security·H 행이 붙었는지 확인한다.

### Task 1a. 데모 소유자와 로그인 막기 (보안 면) — prokit-api-builder + prokit-implementer
- api-builder: `packages/api/src/owner.ts`(데모 소유자 조회, 키가 하나라도 있으면 닫힘), `apps/web/src/context.ts`(readOwner 데모 분기, 데모에서 이메일 비노출), `apps/web/src/app/api/auth/[...all]/route.ts`(데모 404), `apps/web/src/app/robots.ts`, 테스트.
- api-builder(같은 위임): `apps/web/.env.schema`(APP_MODE), `apps/web/src/env.ts`(`pnpm --filter web env:generate` 생성물). `packages/api/src/routers/index.ts` `voiceListRefresh`는 그 공급자 클라이언트에 `listVoices`가 없으면(데모) 캐시를 만료시키지 않고 `no_key`로 닫는다.
- implementer: `turbo.json` globalEnv, `next.config.ts`(본인용 noindex headers, `outputFileTracingIncludes`).
- 테스트 먼저: 데모 소유자 조회, 키가 남아 있으면 소유자 없음, owner 모드 T14 판정 그대로, auth 라우트 데모 404(POST sign-in/email·다른 경로 하나), robots 모드별, headers 모드별(설정 함수 단위).

### Task 1b. 데모 클라이언트 — prokit-api-builder
- 파일: 새 `packages/api/src/demo/client.ts`(+test), `apps/web/src/context.ts:51`(데모면 데모 클라이언트, 샘플 바이트 로더).
- 테스트 먼저: 데모 Context로 `appRouter`의 모든 프로시저를 불러 fetch 0회이고 500이 없다(만들기·시험 생성·드라마는 샘플 저장, 연결 상태 no_key, 목록 캐시 적중, 클론·자동 태그는 no_key, 새로 고침은 no_key이고 캐시 `expires_at`이 바뀌지 않는다). `providerStatus`·`voiceAccents`·`trialModels` 포함.
- 완료: api 테스트(TEST_DATABASE_URL) 통과.

### Task 2. 앱 틀 옮기기와 데모 화면 — prokit-ui-builder
- 파일: `app/layout.tsx`(html·body·Providers만), `app/(app)/layout.tsx`(건너뛰기·AppNav·main), `app/not-found.tsx`, `app/page.tsx`·`lib/landing.ts`(데모 `/` = 소개 페이지, 본인용 `/` → 로그인·작업실), `app/login/page.tsx`(`<main>`), `proxy.ts`(+test: 데모 통과, `/login` → `/studio`, `fonts/`·`samples/` 제외), `components/app-nav.tsx`(데모 표시, 이메일 없음), 데모 띠, 결과 '데모 샘플' 표시, 연결 상태·내 보이스·목록 새로 고침·자동 태그·목록 캐시 없음의 데모 안내, 랜딩 `/login` 링크 제거.
- 랜드마크(T15-07)는 이 Task로 풀린다. 
- 완료: web 테스트(데모 `/` 마크업에 nav 없음·header/footer가 main 밖, proxy, 랜딩에 /login 없음), 타입·린트·빌드.

### Task 3. 로컬 데모 서버 — Main
- 로컬 `tts-pilot-app_shots`를 복사해 `tts-pilot-app_demo`를 만들고 아래 '시드 정리'를 적용한다(개발 DB `tts-pilot-app`은 건드리지 않는다). 공급자·OpenAI 키를 **빈 값**으로 덮어쓴 환경과 `APP_MODE=demo`로 빌드해 `http://localhost:3003`에 띄우고 주소를 알린다(중간 확인).
- 임시 샘플: Task 6 전까지는 로컬 결과물 중 클론이 아닌 것(Typecast·ElevenLabs·Airy·Fish)을 내보내 쓰고 Gemini는 무음 1초 wav.
- 런타임 확인(prokit-runtime-checker): 로그인 없이 `/` → 데모 써 보기 → 메뉴 9개, 만들기 → 데모 샘플 재생, 클론·자동 태그·새로 고침 데모 안내, `/login` → `/studio`(소유자 상태라 로그인 화면이 보냄), `/api/auth/sign-in/email` 404, 공급자 호스트로 가는 서버 요청 0.

### Task 4. 품질 묶음 나머지 (`quality`) — prokit-ui-builder, DESIGN.md는 Main
- 움직임 줄이기: `globals.css` 245~255 전역 규칙을 `transition-property`를 opacity·색으로 거르는 방식으로, 이동·확대 키프레임과 `--tw-enter/exit-translate·scale` 변수 0, 무한 반복 정지. `landing.css` 태그라인·투어 패널 블록 정리. DESIGN.md 해당 문장은 Main.
- 메뉴 패널 얼룩, FAQ 마스코트 위치.
- 완료: 빌드, 런타임(움직임 줄이기 에뮬레이션).

### Task 5. 글꼴 서브셋 (`font`) — Main 내려받기 + prokit-ui-builder
- Main: v1.3.9 태그 경로의 woff2 92개와 CSS를 내려받기 전에 목록·총 크기(약 2.96MB)를 보이고 사용자 확인 → 새 빈 폴더에 받아 개수·크기 확인 → `apps/web/public/fonts/pretendard/`로.
- ui-builder: `index.css`에 `@font-face` 92개(경로 `/fonts/pretendard/…`), 폴백 `@font-face`, `layout.tsx`·`global-error.tsx`의 `localFont` 삭제, `--font-pretendard` 선언, 기존 `PretendardVariable.woff2` 삭제.
- 완료: 마크업 테스트(@font-face 92·unicode-range), 런타임: 소개 페이지 첫 화면 글꼴 전송 바이트(2.06MB 미만), CSS preload 경고 0, 본인용 로그인 화면(쿠키 없음)에서 글꼴 200.

### Task 6. 데모 샘플 만들기 (`samples`) — Main(유료 호출, 호출마다 승인)
- 문장 하나와 공급자별 기본 성우(라이브러리 성우 아님)를 보이고 승인 → 로컬 3001 앱 경로(`trialCreate`, CSRF 헤더)로 공급자마다 1회. 실패한 공급자는 샘플 없이 둔다.
- 결과를 `apps/web/public/samples/`에 저장, 드라마용 44.1kHz 16비트 모노 PCM 하나로 변환. 출처 표기 문구는 Task 2·8 수행자에게.

### Task 7. Vercel 프로젝트 정리 (배포 없음) — Main(사용자 동의)
1. 기존 `omni-ai-tts`를 `omni-ai-tts-studio`로 이름 변경(Neon Storage 연결은 프로젝트 id라 유지). 본인용 `BETTER_AUTH_URL`=`https://omni-ai-tts-studio.vercel.app`, `APP_MODE=owner`(`vercel env add APP_MODE production --value owner --type config`, 배포 스크립트가 `env run`으로 읽는다).
2. 공개 데모 프로젝트 `omni-ai-tts` 새로 만들기(Root `apps/web`, sin1, Git 자동 배포 끔, 배포하지 않음). 프로젝트·조직 id를 `.dev-cycle.json`에.
3. 두 프로젝트의 도메인 확인(`vercel project inspect`·도메인 목록): 첫 배포 때 `omni-ai-tts.vercel.app`이 공개 데모, `omni-ai-tts-studio.vercel.app`이 본인용으로 잡힐 것인지. 아니면 사용자에게 묻는다. Task 11 첫 배포 직전에 한 번 더 확인.
4. Firewall 속도 제한 규칙: Hobby에서 가능하면 데모 프로젝트에 `POST /api/rpc` IP당 1분 120회. 안 되면 건너뛴다.
5. Firewall 국가 규칙: 두 프로젝트 모두 '국가가 KR이 아니면 거절'. Hobby에서 사용자 규칙을 쓸 수 없으면 대체 코드(결정 표 '한국 전용')를 Task 2 수행자에게 추가로 맡기고 사용자에게 알린다.

### Task 8. 데모 데이터와 매일 초기화 (`demo-data`) — Main(외부 설정) + prokit-implementer(워크플로)
- Main(목록 보이고 동의 뒤): 공개 데모 Vercel 프로젝트의 Storage로 Neon(싱가포르)을 만든다. 브랜치 `seed`에 마이그레이션 적용 + 정리한 `tts-pilot-app_demo` 데이터, `main`은 `seed`에서. 데모 프로젝트 범위 Neon API 키 → `gh secret set NEON_API_KEY`(파이프), 프로젝트·브랜치 id → `gh variable set`.
- 시드 정리(사용자에게 목록을 보이고 동의): `session`·`verification`·`rate_limit` 비우기, 예시 계정 `account`의 비밀번호를 무작위 값으로, `my_voice` 비었는지 확인, 데모 샘플이 아닌 결과 행(실제 공급자 결과) 지우기, `provider_list_cache.expires_at` 먼 미래, 공급자·출처별 기본 페이지가 캐시에 있는지 목록.
- implementer: `.github/workflows/demo-reset.yml`(하루 1회 KST 04:00 + 수동 실행, restore + 부모 id, project id 확인 후 실패 처리).
- 다크 투어 스크린샷 5장: prokit-runtime-checker가 3003에서 찍는다(이메일 없음).
- 로드맵 메모: 목록 계약 버전(CONTRACT_VERSION)을 올리면 시드를 다시 만든다.

### Task 9. 소개 페이지 재설계 (`landing`) — Main(브리프) + prokit-ui-builder
- Main: `docs/briefs/landing.md`를 다시 써서 확인받는다(제품 구조를 닮은 구성, 소리 재생 플레이어, 주 행동 '데모 써 보기', 로그인 링크 없음, 출처 표기 위치, 다크 투어). impeccable shape·critique 절차, landing·animation 보조 guide.
- ui-builder: 브리프대로 구현, 재생 플레이어(한 번에 하나, 키보드, 움직임 줄이기).
- 디자인 리뷰·감사·마감·재확인(대조표 23~27행).

### Task 10. 배포 스크립트 대상 인자 — prokit-implementer
- `scripts/vercel-deploy.mjs`: 대상 `studio`·`demo` → `.dev-cycle.json`의 id를 env로, 모드·키 이름 검사(결정 표 ②). 배포 안내 문서(`docs/guides/deployment.md`, prokit-deploy 영향)는 Main.
- 완료: `--check` 두 대상, 하네스 리뷰.

### Task 11. 릴리스와 두 배포 — Main(사용자 동의)
1. 공개 데모 env: 데모 DB `DATABASE_URL`(pooled), 새 `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`=`https://omni-ai-tts.vercel.app`, `OWNER_EMAILS`(예시 소유자), `APP_MODE=demo`(`--type config`). 공급자·OpenAI 키 없음(이름만 확인).
2. 릴리스 노트 v0.1.0 검수·동의 → `pnpm release --publish`.
3. 본인용 운영 DB 새 마이그레이션 확인(지금 계획엔 없음) → 두 대상 배포.
4. 운영 확인: 한국 밖 접속 차단(규칙 화면이나 해외 경유 요청으로 확인할 수 있는 만큼, 확인 방법과 한계를 기록), 본인용 get-session 200·`/` → 로그인·noindex 헤더·로그인·429(동의 뒤 한 번, 60초 창이라 정리 없음). 공개 데모 소개 페이지·로그인 없이 작업실·데모 만들기 한 번(샘플 바이트가 운영 함수에서 읽히는지)·데모 안내·`/api/auth/sign-in/email` 404, 공급자 호출 0은 함수 로그에서 공급자 호스트 요청이 없는지로. 초기화 워크플로 수동 실행 전후 저장한 대본.

## 체크포인트
- Task 1a~3 뒤: 로컬 데모 3003을 사용자에게 보여 준다(중간 확인).
- Task 4~5 뒤: 타입·린트·테스트·빌드, 런타임.
- Task 9 뒤: 디자인 게이트(리뷰·감사 16/20·접근성 3/4).
- Task 11 전: 최종 code·security 리뷰, 하네스 리뷰, 사용자 흐름 QA(로컬 데모 + 본인용).

## 수용 기준 대응
13 → Task 7.5(또는 대체 코드)·11. 1 → Task 2·9, 2 → Task 3·8(목록 캐시), 3 → Task 1b·2·3, 4 → Task 1b·3·11, 5 → Task 1a·2·11, 6 → Task 8·11, 7 → Task 1a·2·11, 8 → Task 5, 9 → Task 2·4, 10 → Task 8, 11 → Task 9, 12 → Task 11.

## 위험과 대응
| 위험 | 대응 |
|---|---|
| 본인용에 데모 모드가 켜짐 | readOwner가 키가 있으면 닫힘, 배포 스크립트 대상별 검사, 테스트 |
| 데모가 공급자 경로를 놓침 | 데모 환경에 키 없음(1차), 데모 클라이언트가 생성만 구현(2차), 모든 프로시저 fetch 0회 테스트 |
| 목록 캐시 누락 | 시드 전 기본 페이지 미리 받기, 누락 시 데모 안내 |
| 운영에서 샘플 파일 못 읽음 | outputFileTracingIncludes, 운영 데모 만들기 한 번으로 확인 |
| 공개 쓰기 남용·계산 시간 | 사용자 수용(유료 키 없음, 한도 넘으면 데모만 멈춤) |
| 예약 작업이 다른 DB를 건드림 | 데모 프로젝트 범위 키, 워크플로의 project id 확인 |
| 라운드 크기 | Task마다 검사, 체크포인트 보고 |

## 실행 기록 (2026-11-19)
- 데모 Neon: Vercel CLI `vercel integration add neon --meta region=sin1 --meta auth=false --billing-plan free_v3 -e production`로 `orange-hat-58134409`(aws-ap-southeast-1, PG 18) 생성. 브랜치 구조를 `seed`/`main`에서 **`main`(예시 데이터 원본, 손대지 않음) → `live`(앱이 쓰는 자식 브랜치)**로 바꿨다. 자식이 있는 브랜치는 되돌리기 제약이 있어, 매일 `live`를 부모 `main`에서 restore한다. 데모 Vercel `DATABASE_URL`(Production)은 `live` 풀러 주소로 바꿔 sensitive로 넣었다.
- 시드: 로컬 `tts-pilot-app_demo`를 정리(세션·인증 기록·시도 제한 비움, 예시 계정 비밀번호 행 삭제, QA 결과·확인 대본 삭제, 목록 캐시 7행 유효 20년)한 뒤 전체 덤프로 옮김. 표별 행 수 일치, 마이그레이션 15, pg_trgm.
- GitHub: `NEON_API_KEY`(데모 프로젝트 범위 키) 비밀값, `DEMO_NEON_PROJECT_ID`·`DEMO_NEON_BRANCH_ID`(live) 변수. 기대 프로젝트 id는 워크플로 파일에 고정(보안 리뷰 low). Vercel `DEMO_DB_HOST`(live 호스트, config): 데모는 이 호스트의 DB에서만 소유자를 정한다(보안 리뷰 medium). Hobby 한도가 계정 단위라 데모 Firewall 속도 제한(RPC IP당 1분 120회)이 본인용을 지키는 장치다.
- `APP_MODE`는 빌드 때 코드에 굳는다(varlock이 비밀 아닌 값을 빌드에 넣음). 로컬은 모드마다 다시 빌드한다. Vercel은 프로젝트별 env로 빌드하므로 문제없다.
- 데모 샘플: Typecast·ElevenLabs(premade Sarah, 무료 크레딧으로 생성 확인)·Fish Audio·Gemini 새로 만듦, Airy는 크레딧 0으로 실패해 임시 파일 유지.
- ElevenLabs 키는 생성·모델 조회는 되지만 계정·목록 조회가 응답하지 않아 데모의 ElevenLabs 목록은 비어 있다.
