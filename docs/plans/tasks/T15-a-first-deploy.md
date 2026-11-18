# T15-a 배포 준비와 첫 배포 — 스펙 V1

- 작성 2026-11-18. 상태: **사용자 확인(2026-11-18, "확인, 계획으로")**. 결정 6~9는 추천안 그대로 확인.
- 라운드: dev-cycle F "T15 P0 통합 검수와 첫 배포"(로드맵 T15를 T15-a·T15-b로 나눔, 사용자 2026-11-18).
- 근거: [로드맵 T15](../implementation-roadmap.md) 이월 메모, [ADR 0013](../../adr/0013-first-deploy-vercel-neon-singapore.md), `prokit-deploy`, `prokit-db` migration-flow "배포 환경", 코드 조사 2026-11-18(아래 3절).

## 1. 목표

로컬에서만 쓰던 작업실을 인터넷 주소 `https://omni-ai-tts.vercel.app`에 올린다. 본인은 지금 로컬과 같은 계정으로 로그인하고, 로컬에 정리해 둔 성우 보관함·프리셋·채널·분류·대본·내 보이스를 그대로 본다. 배포 환경에서 깨질 곳(함수 시간, 요청 크기, 늦은 결과, 로그인 시도 제한, DB 연결)은 배포 전에 고친다.

P0 전체 흐름 검수(REQ-01~13 시나리오, 접근성 전체 P0-07, 독립 리뷰, P0-20)는 **T15-b**에서 배포 주소로 한다.

## 2. 결정

| # | 결정 | 출처 |
|---|---|---|
| 1 | T15를 T15-a(배포 준비·첫 배포)와 T15-b(배포 주소 P0 통합 검수)로 나눈다 | 사용자 2026-11-18 |
| 2 | 운영 DB는 로컬 데이터를 한 번 옮겨 채운다. 소유자 계정(`user`·`account`)도 함께 옮겨 같은 이메일·비밀번호로 로그인한다. `owner:create`의 원격 거부(T14)는 그대로 둔다 | 사용자 2026-11-18 |
| 3 | 지역은 Vercel 함수 `sin1` + Neon `aws-ap-southeast-1`(싱가포르) | 사용자 2026-11-18 |
| 4 | Vercel Hobby를 유지한다. 함수 최대 300초, 늦은 결과는 응답 뒤 작업(`after`)으로 저장하고 공급자 늦은 상한을 270초로 줄인다 | 사용자 2026-11-18 |
| 5 | 이름은 `omni-ai-tts`: GitHub 비공개 저장소 `freelife1191/omni-ai-tts`, Vercel 프로젝트, Neon 프로젝트. 주소 `omni-ai-tts.vercel.app`(이미 쓰인 이름이면 Vercel이 붙인 접미사 주소) | 사용자 2026-11-18 |
| 6 | 세 외부 프로젝트는 구현 단계에서 Main이 만든다(Vercel Git 자동 배포는 끈다) | 추천안, 스펙 확인 때 바꿀 수 있음 |
| 7 | 공급자 키 6개는 로컬과 같은 키를 값 출력 없이 `vercel env add --sensitive`로 넣는다 | 추천안, 스펙 확인 때 바꿀 수 있음 |
| 8 | 로그인 시도 제한은 DB에 저장한다(Better Auth `rateLimit.storage: "database"`). 로그인 경로 규칙은 60초에 5회 | 추천안 확인(스펙 확인 2026-11-18), 규칙은 사용자 2026-11-18(계획 리뷰 뒤) |
| 11 | 디자인 작업 기록 `.impeccable/`은 `.gitignore`에 더한다(배포 스크립트가 커밋하지 않은 파일에 멈추므로) | 사용자 2026-11-18(계획 리뷰 뒤) |
| 9 | 환경은 production 하나. develop(Preview)은 만들지 않는다 | 추천안, 스펙 확인 때 바꿀 수 있음 |
| 10 | 첫 배포는 릴리스 `v0.1.0`(Vercel은 프로젝트 첫 배포를 production으로 만든다) | `prokit-deploy` |

## 3. 배포 환경 사실 (2026-11-18 조사)

- Vercel 계정 Hobby(팀 하나), CLI 65.12.1 로그인됨. GitHub `gh` 로그인됨, `origin` 없음. Neon 조직은 무료(브랜치 논리 크기 1GiB), 이 앱 프로젝트 없음.
- 로컬 DB 13MB, 생성 오디오 약 2.2MB. ADR 0003·0006의 500MB 조건과 거리가 멀다.
- `/api/rpc` 라우트에 `maxDuration`이 없고 `after`도 쓰지 않는다. 늦은 결과는 `void saveLate(...)`로 버려진다(`routers/studio.ts:158`, `routers/drama.ts:183`). Vercel은 응답 뒤 작업을 보장하지 않는다.
- 늦은 결과를 받는 공급자는 Typecast(작업실)와 Fish(드라마 장면, `SCENE_LATE_MAX_MS` 300초)뿐이다. Typecast SDK는 취소가 안 되고 응답 머리를 300초까지 기다린다.
- 요청 4.5MB: `studioFindMany`는 문단 200개 × 8,000 UTF-16자라 최악 4.8MB를 넘는다(백로그 T10-03). 클론 업로드는 원본 3,000,000B + 동의 1,000,000B. 시험 생성 응답은 오디오 4MiB File.
- 작업실·드라마 오디오는 3MiB 조각으로 따로 받는다(4.5MB 안).
- DB 풀: `connectionTimeoutMillis`·`query_timeout` 3초, `max` 기본 10, 모듈 싱글턴 하나. 32MiB bytea 쓰기는 로컬 561ms, Neon 미측정.
- Better Auth: production에서 rateLimit이 켜지고 저장소는 메모리(인스턴스마다 따로). `trustedOrigins`는 `BETTER_AUTH_URL` 하나.
- 앱 런타임은 파일 시스템에 쓰지 않는다. `process.env` 직접 읽기도 없다. `utils/orpc.ts:32`의 SSR 대체 주소가 `127.0.0.1:3001`이다(쓰는 곳은 모두 클라이언트 컴포넌트).

## 4. 바꿀 것

### 4.1 코드 (배포를 막는 것만)
1. **늦은 결과 유지:** oRPC 컨텍스트에 응답 뒤 작업을 맡기는 함수 하나를 둔다. `/api/rpc` 라우트가 Next `after`로 채우고, `studio`·`drama`의 `void saveLate(...)`가 그것으로 넘긴다. 테스트는 넘긴 작업을 모아 끝까지 기다린다. `packages/api`는 Next를 import하지 않는다.
2. **함수 시간:** `/api/rpc` 라우트 `maxDuration = 300`. `SCENE_LATE_MAX_MS`를 270초로 줄인다(저장 여유 30초). Typecast의 늦은 응답은 함수가 300초에 끝나면 잃는다. 이 한계를 `shortcut:` 주석과 6절에 적는다.
3. **요청 크기:** `studioFindMany`를 보내는 쪽이 문단 수(200)뿐 아니라 본문 크기로도 나눈다(묶음 3.5MB 이하, T10-03 해결). 클론 업로드와 시험 생성 응답은 한도 안이라 바꾸지 않고, 배포 뒤 경계 크기로 한 번 확인한다(T15-b).
4. **로그인 시도 제한:** Better Auth `rateLimit: { enabled: true, storage: "database", customRules: { "/sign-in/email": { window: 60, max: 5 } } }`. `auth:generate`로 `rateLimit` 표 스키마와 마이그레이션을 만든다. 나머지 경로는 라이브러리 기본.
5. **DB 연결:** 운영은 Neon pooled 주소. 풀 `max`는 Neon pooler가 받으므로 기본 10을 유지하고([계획](T15-a-first-deploy-plan.md) 사실 6), `query_timeout`은 Neon에서 32MiB 쓰기를 잰 결과로 정한다(7절 5번). 새 의존은 더하지 않는다.
6. **지역:** `apps/web/vercel.json`에 `regions: ["sin1"]`.
7. **작업 트리:** 루트 `.gitignore`에 `.impeccable/` 한 줄.

### 4.2 외부 설정 (구현 단계, Main)
1. GitHub 비공개 저장소 `freelife1191/omni-ai-tts`를 만들고 `origin`으로 push한다.
2. Neon 프로젝트 `omni-ai-tts`(싱가포르, Postgres 18)를 만든다. 기본 브랜치가 운영 DB다.
3. 운영 DB에 마이그레이션 전체를 direct 주소로 적용하고 `pg_trgm`·`show_trgm('가나다')`를 확인한다(ADR 0010).
4. 로컬 데이터 옮기기(결정 2): 로컬 앱 표와 `user`·`account`의 데이터만 운영 DB에 복사한다. `session`·`verification`·`rate_limit`·`provider_list_cache`·`trial_generation`은 옮기지 않는다. 방법은 계획에서 정하고 `docs/owner-account.md`에 운영 절을 더한다. 운영 DB에 쓰기 전에 표와 행 수를 보여 드리고 동의를 받는다.
5. Vercel 프로젝트 `omni-ai-tts`: `vercel link` → Git 연결 끊기 → root `apps/web`, framework nextjs, Node 24.x.
6. Production 환경 변수: `DATABASE_URL`(pooled), `BETTER_AUTH_SECRET`(새 값), `BETTER_AUTH_URL=https://omni-ai-tts.vercel.app`, `OWNER_EMAILS`(로컬과 같은 이메일), 공급자 키 6개(결정 7). 값은 출력·파일·셸 기록에 남기지 않는다.
7. 릴리스 `v0.1.0` → `pnpm vercel:deploy production` → `/api/auth/get-session` 200.

## 5. 화면

새 화면은 없다. 바뀌는 화면 동작은 문단 작업실의 '이미 만든 결과 찾기'가 큰 대본에서 요청을 더 잘게 나누는 것뿐이다(보이는 변화 없음). 사이트맵·브리프 변경 없음.

## 6. 범위

### 포함
4절의 코드 6개, 외부 설정 7단계, `docs/domain/project.md`·`docs/owner-account.md`·ADR 0013·로드맵 갱신.

### 만들지 않는 것 (ponytail)
| 뺀 것 | 이유 | 다시 넣을 조건 |
|---|---|---|
| develop(Preview) 환경·Neon develop 브랜치 | 혼자 쓰는 앱, 로컬이 미리 보기 | 배포 전 원격 확인이 필요해질 때 |
| 커스텀 도메인 | `vercel.app`으로 충분 | 사용자가 도메인을 정할 때 |
| Git push 자동 배포·CI | 릴리스 검사와 "DB 먼저"를 거치지 않게 됨 | 사용자가 요청하고 ADR로 남길 때 |
| 원격 `owner:create` | 계정은 데이터 옮기기로 들어온다(T14 원격 거부 유지) | 빈 DB를 새로 만들어야 할 때 |
| 오디오 외부 저장소(Blob·Neon Object Storage)·정리 cron | 오디오 약 2MB, 500MB 조건과 멂 | ADR 0003·0006 조건(500MB·월 3GB)에 가까워질 때 |
| Pro 플랜·300초 넘는 늦은 결과 | 결정 4 | 270초 넘는 장면이 실제로 생길 때 |
| `@vercel/functions`(`attachDatabasePool`·`waitUntil`) | Next `after`로 충분, 새 의존 없음 | 유휴 연결 오류가 운영 로그에 나올 때 |
| 로그 수집·알림·성능 지표 | 개인 앱 첫 배포 | 운영 오류를 놓친 일이 생길 때 |
| 로컬 생성 기록·오디오 옮기기 | 30일 보관 결과라 다시 만들 수 있음 | 사용자가 특정 결과를 운영에 원할 때 |
| 제품 표시 이름 변경(화면의 "TTS Pilot") | 이번 결정은 저장소·주소 이름 | 사용자가 화면 이름도 바꾸자고 할 때 |
| 다중 소유 보강(로드맵 T14 절의 미룬 항목) | 소유자 한 명 | 두 번째 소유자 |

## 7. 수용 기준

1. `https://omni-ai-tts.vercel.app/api/auth/get-session`이 200이다.
2. 로그인하지 않고 작업 화면을 열면 `/login?next=…`로 간다. 로컬과 같은 이메일·비밀번호로 로그인하면 원래 화면으로 돌아온다.
3. 가입 요청(`POST /api/auth/sign-up/email`)은 거부되고 `user` 행 수가 그대로다.
4. 로그인 실패를 제한 넘게 반복하면 429이고, DB `rate_limit` 표에 기록된다.
5. Neon에서 32MiB bytea 한 행 쓰기 시간을 잰다. `query_timeout` 안이면 그대로 두고, 넘으면 오디오 쓰기 경로만 늘린다(측정값을 ADR 0006에 적는다).
6. 운영에서 대본 검색이 trigram으로 동작한다(`show_trgm` 확인, 한글 검색 결과).
7. 옮긴 데이터가 운영 화면에 보인다: 성우 보관함, 프리셋, 채널·분류, 대본 보관함, 내 보이스 목록. 행 수가 로컬 복사본과 같다.
8. 무료 호출이 운영에서 동작한다: 연결 상태 화면, 성우 목록(공급자 다섯).
9. 늦은 결과: 컨텍스트로 넘긴 저장 작업이 응답 뒤에도 끝까지 돈다(자동 테스트). `maxDuration` 300, `SCENE_LATE_MAX_MS` 270초.
10. `studioFindMany` 묶음 하나의 본문이 3.5MB를 넘지 않는다(자동 테스트, 최악 입력).
11. 배포에 `.env`가 올라가지 않는다(`.vercelignore`). 커밋에 비밀값이 없다(`pnpm dev-cycle secrets`).
12. GitHub Release `v0.1.0`이 있고 production 배포가 그 커밋이다.
13. 타입·린트·테스트·빌드 통과, `prokit-reviewer`(plan·code·db·security) 승인.

## 8. 자동 테스트 (vitest)
- 늦은 결과: 컨텍스트의 응답 뒤 작업 함수로 넘긴 저장이 응답 뒤에 완료되고, 넘기지 않으면 실패한다(studio·drama 각각).
- `SCENE_LATE_MAX_MS` 270초 상수와 Fish 장면 늦은 상한이 이 값을 쓴다.
- `studioFindMany` 나누기: 최악 입력(200 × 8,000자 한글)이 3.5MB 이하 묶음 여럿으로 나뉘고, 결과 합이 한 번에 보낸 것과 같다.
- Better Auth 설정: rateLimit 저장소가 database이고 가입 거부는 그대로(T14 테스트 유지).
- 기존 api 949·web 964 테스트 통과.

## 9. 테스트 시나리오 (배포 뒤, 무료 확인만)
- 정상: 로그인 → 메뉴 전체 이동 → 로그아웃 → 보호 화면 차단.
- 오류: 틀린 비밀번호, 가입 시도, 시도 제한 429. 운영에 기록이 남는 확인이라 Main이 배포 직후 한 번만 한다(사용자 동의 뒤). 브라우저 QA는 로그인 화면과 보호 경로 차단만 본다.
- 데이터: 7번 수용 기준의 화면마다 목록 보기, 대본 검색 한글 한 단어.
- 너비: 1440·390에서 로그인과 작업실 첫 화면.
- 생성·시험 생성·클론·삭제 버튼은 누르지 않는다(유료·상태 변경).

## 10. 사용자 테스트 (구현 뒤)
1. 로그인하지 않은 채 `https://omni-ai-tts.vercel.app/voices`처럼 작업 화면 주소를 연다. 로그인 화면으로 가고, 로컬과 같은 계정으로 로그인하면 그 화면으로 돌아온다.
2. 메뉴를 전부 한 번씩 눌러 본다. 성우 보관함·프리셋·채널·분류·대본 보관함·내 보이스에 로컬 데이터가 있는지 본다.
3. 대본 보관함에서 한글 한 단어로 검색한다.
4. 연결 상태 화면에서 공급자 다섯이 연결됐는지, 성우 캐스팅에서 공급자 다섯의 목록이 나오는지 본다.
5. 휴대폰(또는 창을 좁혀)에서 로그인 화면과 작업실 첫 화면을 본다.
6. (선택, 직접 승인) Fish Audio 무료 모델로 짧은 문장 하나를 시험 생성해 재생한다.
7. 로그아웃 뒤 작업 화면이 막히는지 본다.

## 11. 경계
- 항상: 비밀값은 셸 변수·파이프로만 넘기고 출력하지 않는다. 운영 DB 쓰기(마이그레이션·데이터 옮기기)는 목록을 보여 드리고 동의 뒤에. 배포는 릴리스한 커밋만.
- 먼저 묻기: 외부 프로젝트 이름이 이미 쓰여 접미사가 붙을 때, 운영 DB 적용과 데이터 복사, 릴리스 발행.
- 하지 않기: 유료 생성 호출(사용자 승인 없이), `vercel env pull`, `.env.production` 파일, Git 자동 배포 켜기, `owner:create` 원격 허용.

## 12. 위험과 확인할 것
- Vercel 빌드가 `pnpm@12.6.0`과 모노레포 `apps/web` root를 받는지(첫 배포에서 확인, 실패 시 Corepack·Node 설정).
- Neon 콜드 스타트가 `connectionTimeoutMillis` 3초에 걸리는지(무료 플랜 자동 일시 정지). 걸리면 연결 시간 초과만 늘린다.
- `omni-ai-tts.vercel.app`이 이미 쓰인 이름이면 주소가 바뀌고 `BETTER_AUTH_URL`을 그 주소로 고친다.
- 로컬 데이터 복사 뒤 로컬과 운영 데이터는 따로 바뀐다(다시 맞추지 않는다).
- T14-04(`OWNER_EMAILS` 누출 감지 해제): 이메일은 메뉴 아래 줄에 원래 보이는 값이라 해제를 유지하고, 운영 응답·로그에 다른 비밀값이 없는지 security 리뷰에서 본다.
