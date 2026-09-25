<!-- bts-template:start -->
# 에이전트 공통 규칙

이 프로젝트는 Better-T-Stack으로 만든 Next.js 풀스택 앱이다. Next.js App Router(`apps/web`), oRPC(`packages/api`), Better Auth(`packages/auth`), Drizzle + Postgres(`packages/db`, 개발은 로컬 컨테이너, 운영은 Neon), shadcn UI(`packages/ui`), Turborepo, pnpm, Biome를 쓴다.

## 먼저 읽을 문서
- `CONTEXT.md`: 도메인 용어 정본. 코드, 문서, 대화에서 이 용어를 쓴다.
- `docs/domain/project.md`: 서비스, 화면과 URL, API, 데이터 모델과 코드 매핑, 권한
- `docs/adr/`: 되돌리기 어려운 결정과 그 이유
- `apps/web/AGENTS.md`: Next.js가 생성하는 버전별 규칙

## 작업 원칙
1. 가정은 드러내고, 결과를 바꾸는 모호함은 구현 전에 묻는다.
2. 요구한 동작에 필요한 가장 단순한 구현을 고른다.
3. 변경 범위를 좁게 유지하고 관계없는 코드를 고치지 않는다.
4. 완료는 검증 가능한 동작으로 말한다. 실행하지 않은 검사를 통과라고 하지 않는다.

## 코드 변경 절차
코드나 설정을 바꾸는 작업은 `bts-dev-cycle` 스킬로 시작한다. `pnpm dev-cycle case`로 판정하고, `pnpm dev-cycle table <케이스> --write --title "<요약>"`로 대조표를 열고(케이스는 요청 기준으로 고른다. 아직 diff가 없으면 `case`는 A로 나온다), 행을 실행한 뒤 `pnpm dev-cycle audit`과 `close`로 닫는다. 절차 정본은 `docs/dev-workflow.md`다.

## 계층별 스킬
| 작업 | 스킬 |
|---|---|
| 라우팅, RSC 경계, 데이터 패칭, 캐시, 성능 | `bts-web` |
| 화면 모양, UX, 디자인 리뷰 (impeccable) | `bts-ui` |
| oRPC 프로시저, Better Auth, 권한과 소유권 | `bts-api` |
| Drizzle 스키마, 마이그레이션, 로컬 DB, Neon | `bts-db` |
| 검사 선택, 증거 기록, 런타임 확인 | `bts-verify` |

전역에 같은 분야 스킬(예: `nextjs`, `supabase`)이 있어도 이 프로젝트에서는 위 `bts-*`를 먼저 따른다. 설계, 계획, 디버깅, 리뷰, QA에 쓸 프로세스 스킬은 `bts-dev-cycle`의 라우팅 표를 따른다.

## 보안 불변식
- 사용자 데이터를 다루는 프로시저는 `protectedProcedure`를 쓰고, 소유자 id는 세션에서만 가져와 where 조건에 넣는다.
- 비밀값과 서버 전용 모듈은 클라이언트 번들로 보내지 않는다.
- 스키마 변경은 `db:generate`로 만든 마이그레이션으로만 한다. 공유 DB 브랜치에는 `db:push`를 쓰지 않는다.
- 운영 DB, 실사용자 데이터, 배포, 커밋, push는 사용자가 요청할 때만 다룬다.

## 에이전트
- `bts-implementer`: 코디네이터가 지정한 파일만 구현한다.
- `bts-reviewer`: 읽기 전용 리뷰. focus는 code, security, db이고 JSON으로 응답한다.
- 리뷰는 구현한 쪽이 아니라 `bts-reviewer`가 한다.
<!-- bts-template:end -->
