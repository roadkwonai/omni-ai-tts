# 프로세스 스킬 라우팅

단계마다 1순위를 먼저 쓴다. 현재 도구에 없으면 같은 줄의 대안, 그것도 없으면 "스킬이 없을 때" 절차를 쓴다. 대조표 증거 칸에는 실제로 쓴 스킬 이름을 적고, 대안이나 대체 절차를 썼다면 그 사실도 적는다 (예: `대안: OMC plan (superpowers 없음) → .omc/plans/todo-due.md`).

| 단계 | 1순위 (Claude·Codex 같은 이름) | 보강 | Claude 대안 | Codex 대안 | 스킬이 없을 때 |
|---|---|---|---|---|---|
| 요구 명확화 | superpowers `brainstorming` | `/grill-with-docs` (사용자가 호출, 용어와 ADR을 함께 기록) | OMC `deep-interview` | OMX `deep-interview` | 질문 목록을 만들어 사용자 확인을 받는다 |
| 계획 | superpowers `writing-plans` | 계획 리뷰: gstack `plan-eng-review`, UI가 있으면 `plan-design-review` | OMC `plan`, `ralplan` | OMX `plan`, `ralplan` | 파일별 단계와 검사를 적은 계획 파일을 직접 쓴다 |
| 구현 | superpowers `subagent-driven-development`(`bts-implementer` 사용) + `test-driven-development` | 없음 | OMC `team`, `ralph` (대규모 병렬) | OMX `team`, `ralph` | 대조표 행 순서대로 직접 구현한다 |
| 디버깅 (C) | superpowers `systematic-debugging` | gstack `investigate` | OMC `debug` | `gstack-investigate` | 재현 테스트 → 가설 → 수정 |
| 리뷰 | **`bts-reviewer`(필수)** + 지적 처리는 superpowers `receiving-code-review` | 추가 관점(증거 대체 불가): F 병합 전 gstack `review`, Claude `/code-review`, OMX `code-review` | 없음 | 없음 | `bts-reviewer`만 |
| QA | `ego-browser`로 사용자 흐름 확인 (F, 보고만. 절차는 `bts-verify`의 `references/browser.md`) | gstack `qa-only`·`qa` (사용자가 요청할 때만) | 없음 | 없음 | ego-browser가 없으면 `agent-browser`로 같은 흐름을 확인하고 대안으로 적는다 |
| 검증 | superpowers `verification-before-completion` + `bts-verify` | 없음 | OMC `verify` | 없음 | `bts-verify` |
| 마무리 | superpowers `finishing-a-development-branch` | gstack `ship` (사용자가 요청할 때) | 없음 | 없음 | 선택지를 제시한다 |

## 도구별 이름
- Claude Code: superpowers는 `superpowers:<이름>`(예: `superpowers:writing-plans`), gstack은 접두어 없이(`plan-eng-review`, `review`, `qa-only`, `investigate`, `ship`), OMC는 `oh-my-claudecode:<이름>`.
- Codex: superpowers는 `<이름>` 그대로, gstack은 `gstack-<이름>`(예: `gstack-plan-eng-review`, `gstack-review`, `gstack-qa-only`, `gstack-investigate`, `gstack-ship`), OMX는 `<이름>` 그대로.

## 규칙
1. 대조표의 리뷰 행 증거는 `bts-reviewer`만 채울 수 있다. gstack `review`, `/code-review`, OMX `code-review`는 추가 관점이다.
2. OMC·OMX 모드(`autopilot`, `ralph`, `team`)는 실행 수단이다. 모드의 완료 보고는 증거가 아니며, 완료 판정은 `pnpm dev-cycle audit`만 한다. 모드가 커밋, push, 배포를 하게 두지 않고, 라운드를 닫을 때 모드를 취소한다.
3. gstack `qa`, `ship`처럼 코드를 고치거나 배포하는 스킬은 사용자가 요청할 때만 쓴다.
4. 전역 스킬이 하나도 없어도 "스킬이 없을 때" 절차만으로 라운드를 끝까지 진행할 수 있어야 한다.
