---
name: bts-dev-cycle
description: >-
  이 BTS(Better-T-Stack) Next.js + Neon 프로젝트에서 코드, 스키마, 화면, 설정, 스킬을 바꾸는
  모든 작업의 진입점. 기능 추가, 버그 수정, 리팩터, 화면 변경, API나 DB 변경, 스킬이나 에이전트
  수정 요청을 받으면 구현을 시작하기 전에 이 스킬로 케이스를 판정하고 dev-cycle 대조표를 연다.
  만들어줘, 추가해줘, 고쳐줘, 버그, 바꿔줘, 리팩터, 기능 개발, 작업 시작, 다 됐어, 완료 처리
  같은 요청에 사용한다. 코드를 바꾸지 않는 질문 답변이나 코드 읽기에는 쓰지 않는다.
---

# BTS 개발 사이클

코드를 바꾸는 작업은 모두 **라운드** 하나로 진행한다. 라운드는 `tasks/todo.md`에 붙는 대조표 하나이고, 모든 행의 증거 칸이 채워지고 `pnpm dev-cycle audit`이 통과해야 끝난다.

## 0. 시작
1. `pnpm dev-cycle status`로 진행 중인 라운드가 있는지 본다. 있으면 그 라운드를 이어서 진행한다.
2. `AGENTS.md`, `CONTEXT.md`, `docs/domain/project.md`를 읽는다.
3. 요청을 한 문장으로 다시 쓰고, 결과를 바꾸는 모호함이 있으면 구현 전에 묻는다.

## 1. 케이스 판정
`pnpm dev-cycle case`는 현재 diff로 판정한다. 아직 파일을 바꾸지 않았다면 요청을 보고 고른다.

| 케이스 | 언제 |
|---|---|
| A | 문서나 설정처럼 규칙에 걸리지 않는 경미한 변경 |
| B | 화면, 컴포넌트, 스타일 (`apps/web/src/app`, `apps/web/src/components`, `packages/ui`) |
| C | 버그 수정. 경로와 상관없이 선언한다 |
| D | 서버와 API (`packages/api`, `apps/web/src/app/api`) |
| E | DB 스키마와 마이그레이션 (`packages/db`) |
| F | 두 계층 이상에 걸친 신규 기능, 또는 새 기능으로 선언한 작업 |
| H | 스킬, 에이전트, dev-cycle 자체 변경 |

- 새 기능 요청은 F, 버그 제보는 C로 선언한다. 애매하면 더 무거운 케이스를 고른다.
- 인증 민감 경로(`packages/auth`, `api/auth`, `services.ts`, `.env.schema` 등)를 건드리면 security 리뷰 행이 자동으로 붙는다.
- 러너는 diff에 인증 민감 경로가 생긴 뒤에야 이 행을 붙인다. 그 전이라도 수정 대상이 인증 경로이거나 로그인, 세션, 권한 문제라면 대조표를 연 직후 `| <다음 번호> | [review] bts-reviewer(security) → verdict, max_severity, 반영·기각 내역 |  |` 행을 직접 추가한다(번호 칸은 숫자여야 러너가 행으로 읽는다). 수정 전에 원인 분석부터 하는 단계여도 추가하고, 보고에 "수정 라운드에서 security 리뷰가 필요하다"고 적는다.

## 2. 대조표 열기
```bash
pnpm dev-cycle table <케이스> --write --title "<요청 요약>"
```
케이스를 생략하면 diff 판정 결과를 쓴다. 아직 파일을 바꾸기 전이면 판정이 A이므로 요청 기준 케이스를 반드시 적는다. `--write` 없이 실행하면 미리 보기만 한다.

## 3. 행 실행
- 위에서부터 순서대로 수행하고, 끝낸 행마다 `tasks/todo.md`의 증거 칸을 채운다. 증거 형식은 `bts-verify`를 따른다: 실행한 명령과 결과, 산출물 경로, 사용한 스킬 이름. `✓`, `ok`, `done`만 적는 것은 증거가 아니다. 해당 없는 행은 `N/A: 사유`로 적는다.
- 계층별 스킬: 화면 동작은 `bts-web`, 화면 모양과 UX는 `bts-ui`, API와 인증은 `bts-api`, DB는 `bts-db`, 검사와 증거는 `bts-verify`.
- 행 문구에 괄호로 적힌 프로세스 스킬(예: `(systematic-debugging)`, `(brainstorming)`)은 그 행을 할 때 실제로 불러 쓰고, 증거 칸에 `사용: systematic-debugging`처럼 이름을 적는다.
- 설계, 계획, 구현, 디버깅, 리뷰, QA, 검증에 쓸 프로세스 스킬은 [references/process-routing.md](references/process-routing.md)의 표를 따른다. 1순위 스킬이 없으면 대안을, 그것도 없으면 표의 대체 절차를 쓰고, 증거 칸에 실제로 쓴 것을 적는다.
- D나 E 행이 있는데 테스트 러너가 아직 없으면, 대조표 첫 행 앞에 `| 0 | vitest 도입(최초 1회) → 설정 파일과 실행 결과 |  |` 행을 직접 추가한다. 이 행은 `package.json`과 `turbo.json`을 고치므로 `bts-implementer`에 맡기지 않고 코디네이터가 직접 한다.
- 작업 중 다른 계층을 건드리게 되면 `pnpm dev-cycle audit`이 케이스 상향을 알려 준다. 안내대로 `pnpm dev-cycle table <새 케이스> --write --upgrade`를 실행한다. 이미 채운 증거, 직접 추가한 행, 블록 안 메모는 보존된다. 다만 직접 추가한 행과 새 케이스에 없는 이전 행은 표의 끝으로 옮겨지고 번호가 다시 매겨진다.

## 4. 에이전트
- 리뷰 행(`bts-reviewer(...)`)은 반드시 `bts-reviewer` 에이전트에 맡긴다. 프롬프트에 focus(`code`, `security`, `db`), 대조표 마커의 base SHA, 검토할 파일 목록, 대조표 경로를 준다. 응답 JSON은 증거 칸에 요약한다. 예: `bts-reviewer(code): approve, max=low, 지적 2 (반영 1, 기각 1: 재현 안 됨)`.
- 지적은 직접 확인한 뒤에만 고친다. high 이상 지적을 고쳤으면 같은 focus로 다시 리뷰한다. 응답이 없거나 JSON이 깨졌으면 `blocked`로 적는다.
- 구현을 위임할 때는 `bts-implementer`에 정확한 파일 목록, 읽을 `bts-*` 스킬, 완료 조건을 준다. 병렬로 위임할 때는 파일이 겹치지 않게 나눈다. `AGENTS.md`, `.dev-cycle.json`, `package.json`, 루트 설정은 직접 고친다.
- impeccable `critique`처럼 서브에이전트를 스스로 띄우는 스킬은 메인 세션에서 실행한다.

## 5. 종료
1. `pnpm dev-cycle audit`을 실행한다. 실패 항목이 남아 있으면 완료라고 말하지 않는다. audit은 `blocked: 사유`와 `미실행: 사유`를 채운 칸으로 본다. 아직 하지 않은 작업을 그렇게 적어 audit을 넘기지 않는다(`blocked`·`미실행`의 뜻은 `bts-verify` 원칙을 따른다). 그런 행이 있으면 audit이 통과해도 "완료"가 아니라 "부분 완료(blocked N건, 미실행 M건)"로 보고하고, 사용자가 그대로 닫자고 할 때만 close한다.
2. 통과하면 `pnpm dev-cycle close`로 대조표를 `tasks/archive/`로 옮긴다.
3. OMC나 OMX 모드(`autopilot`, `ralph`, `team` 등)를 썼다면 취소한다. 모드가 보고한 완료는 증거가 아니다.
4. 사용자에게 결과, 실행한 검사, 실행하지 못한 검사와 이유를 보고한다. 커밋, push, 배포는 사용자가 요청할 때만 한다.
