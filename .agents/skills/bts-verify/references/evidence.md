# 증거 형식

대조표의 증거 칸은 다음 사람이 같은 결과를 다시 확인할 수 있을 만큼 구체적이어야 한다. 한 칸에는 한 줄로 적고, 길면 `tasks/evidence/<라운드 제목>/`에 파일로 두고 경로를 적는다.

| 종류 | 형식 | 예 |
|---|---|---|
| 명령 | `<명령> → exit <코드>[, 첫 오류]` | `pnpm check-types → exit 0` |
| 테스트 | `<러너> <대상> → <n> passed[, <m> failed]` | `vitest todo.isolation → 3 passed` |
| 마이그레이션 | `<로컬 호스트:포트 또는 Neon 브랜치> ← <파일> 적용 → <요약>` | `localhost:5433 ← 0003_add_due_at.sql 적용 → ok`, `dev/todo-due ← 0003_add_due_at.sql 적용 → ok` |
| 런타임 | `next-dev-loop <경로> → <관찰>` | `next-dev-loop /todos → 200, 콘솔 오류 0` |
| 스크린샷 | `<경로들>` | `tasks/evidence/todo-list/desktop.png, mobile.png` |
| 리뷰 | `bts-reviewer(<focus>): <verdict>, max=<등급>, 지적 <n> (반영 <a>, 기각 <b>: 사유)` | `bts-reviewer(db): approve, max=none, 지적 0` |
| UI 평가 | `critique <점수>, P0 <n>, P1 <n>` / `audit <점수>/20, 접근성 <점수>/4` | `audit 17/20, 접근성 4/4` |
| 스킬 사용 | `<스킬> → <산출물>` | `brainstorming → docs/superpowers/specs/2026-10-01-todo-due.md` |
| 대안 사용 | `대안: <스킬·도구> (<1순위> 없음) → <산출물>` | `대안: OMC plan (superpowers 없음) → .omc/plans/todo.md`, `대안: agent-browser (ego-browser 창 표시 불가) → tasks/evidence/todo-list/` |
| 해당 없음 | `N/A: <사유>` | `N/A: 스키마 변화 없음` |
| 막힘 | `blocked: <사유>` | `blocked: 브라우저 도구 없음(ego-browser·agent-browser)` |

## 증거가 아닌 것
- `✓`, `✔`, `-`, `ok`, `done`, `todo`, `tbd`, `완료`처럼 형식만 채운 값, 또는 공백을 뺀 길이가 4자 미만인 값 (dev-cycle audit이 거부한다)
- 사유 없는 `N/A`
- 실행하지 않은 검사를 다른 검사 결과로 대신한 것 (예: 빌드 통과를 격리 테스트 통과로 적기)
- `skipped`로 끝난 테스트
- OMC나 OMX 모드의 "완료" 보고
