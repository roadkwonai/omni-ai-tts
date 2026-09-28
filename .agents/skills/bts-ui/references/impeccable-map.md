# impeccable 단계 매핑

## 모드
impeccable은 화면마다 모드를 고른다. 앱 화면(대시보드, 목록, 설정, 편집기)은 **Operate**, 랜딩과 가격 페이지는 **Persuade**, 문서와 도움말은 **Read**다. 모드는 화면의 surface brief에 남고, 제품 전체가 아니라 화면 기준으로 정한다.

## 단계별 상세
| 단계 | 명령 | 산출물 | 주의 |
|---|---|---|---|
| 기획 | `init` (별칭 `teach`) | `PRODUCT.md` (Platform, Stack, Users, Purpose, Positioning, Brand Commitments, Principles, Accessibility) | 프로젝트당 1회. 이미 있으면 다시 만들지 않는다 |
| 시각 방향 | new-work → 마감에서 `document` | `DESIGN.md` (토큰 frontmatter + 섹션) | 새 시각 세계는 만든 뒤 마감에서 기록한다(impeccable new-work 5절). BTS는 기본 화면이 있으므로 seed 모드를 쓰지 않는다. 기존 화면을 넓히는 작업이면 `DESIGN.md`가 없어도 막지 않는다. 기존 `DESIGN.md`를 조용히 덮어쓰지 않는다 |
| 설계 | `shape <기능>` | 확정된 브리프 `docs/briefs/<화면>.md` (코드 없음) | 사용자 확인 또는 한 번의 수정 뒤 멈춘다 |
| 개발 | new-work, 필요 시 `layout`, `typeset`, `colorize`, `clarify`, `harden`, `onboard`, `adapt`, `animate` | 코드 | 편집 직전에 `reference/craft-floor.md`를 로드한다 |
| 리뷰 | `critique <대상>` | Design Health 점수, P0~P3 지적, `.impeccable/critique/`에 기록 | 독립 평가자 두 명을 서브에이전트로 띄우므로 메인 세션에서 실행한다 |
| 리뷰 | `audit <대상>` | 접근성, 성능, 테마, 반응형, 일관성 각 0~4점, 합계 20점 | 권장 후속 명령 목록을 준다 |
| 리뷰 | `web-design-guidelines` 스킬 | Vercel Web Interface Guidelines 위반 목록 (`file:line`) | 규칙을 원격에서 받아 온다. 받지 못하면 그렇다고 적는다 |
| 마감 | `polish <대상>` | 정리된 코드 | critique 결과를 입력으로 쓴다. 검증은 한 번 모아서 하고 재확인은 1회 |
| 정본 갱신 | `document` | `DESIGN.md` 갱신 | refresh, overwrite, merge 중 무엇을 할지 사용자에게 묻는다 |
| 관리 | `hooks on`, `hooks status`, `doctor` | 편집 detector, 설정 점검 | `CONTEXT_STALE` 안내는 보고만 하고 사용자가 요청할 때 고친다. `hooks`는 스킬 호출 대신 `.agents/skills/impeccable/scripts/impeccable hooks <동작>`으로 실행한다(`bts-ui` 규칙) |

Claude Code에서는 `impeccable` 스킬을 부르고 인자로 명령을 준다(예: 스킬 인자 `critique apps/web/src/app/todos`). Codex에서는 `$impeccable critique apps/web/src/app/todos`처럼 부른다.

## B 케이스 행별 증거 예시
| 행 | 증거 예시 |
|---|---|
| impeccable context 실행 | `impeccable context → PRODUCT.md 있음, DESIGN.md 없음 → 새 작업이라 마감에서 document` |
| shape 브리프 확정 | `shape → docs/briefs/todos.md (사용자 확인 2026-10-01)` 또는 `N/A: 버튼 간격만 조정` |
| 구현 | `apps/web/src/app/todos/*.tsx 3개, packages/ui 토큰 1개` |
| 타입·린트·빌드 | `pnpm check-types → exit 0, pnpm exec biome check . → exit 0, pnpm build → exit 0` |
| 런타임·스크린샷 | `next-dev-loop /todos → get_errors 0, tasks/evidence/todo-list/desktop.png, mobile.png` |
| critique | `Design Health 31/40, P0 0, P1 2 (빈 상태 문구, 대비)` |
| audit | `audit 15/20, 접근성 3/4 → 기준 미달, polish에서 해결` |
| 수정과 polish | `P1 2건 반영, 대비 토큰 조정` |
| 재확인 | `audit 17/20, 접근성 4/4, 스크린샷 갱신` |
| DESIGN.md 갱신 | `document merge → 색 토큰 1개 추가` 또는 `N/A: 토큰 변화 없음` |
