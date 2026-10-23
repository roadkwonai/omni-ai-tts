# T7-01 DB 유휴 연결 끊김 uncaughtException

<!-- dev-cycle:archived closed=2026-10-23 case=C base=0add7e2ee6cd7d3fe0d75cd80669f1b764bc53d4 auth=false opened=2026-10-23 -->
## 라운드: C — T7-01 DB 유휴 연결 끊김 uncaughtException
| # | 단계 | 증거 |
|---|---|---|
| 1 | 재현 테스트 작성, 실패 확인 (systematic-debugging) → 테스트 이름과 실패 출력 | packages/api/src/db-client.test.ts 'DB가 쉬는 연결을 끊어도 로그 한 줄만 남기고 다음 질의는 새 연결로 된다'(테스트 DB, pg_terminate_backend) → 수정 전 실패: Tests 1 failed, Errors 1 — Uncaught Exception: error: terminating connection due to administrator command (code 57P01, pg-protocol parser), waitFor 로그 1회 실패. 원인: pg-pool 3.14.0 index.js:52-62 idleListener가 pool.emit('error'), drizzle-orm 1.0.0-rc.4 node-postgres driver.js:36 new pg.Pool(connection)에 리스너 없음. 사용: superpowers:systematic-debugging |
| 2 | 수정 → 변경 파일 요약 | packages/db/src/index.ts: createDb가 drizzle가 만든 풀(db.$client, 타입 Pool)에 on('error') — console.error('[db] 쉬는 연결 오류: <message>') 한 줄(+6줄). packages/api/src/db-client.test.ts 새 재현 테스트(try/finally로 풀 닫음) |
| 3 | [verify] 재현 테스트 통과 → 통과 출력 | source testdb.env && vitest run src/db-client.test.ts → 1 passed (수정 뒤, try/finally 반영 뒤 다시 1 passed) |
| 4 | [review] prokit-reviewer(plan) 계획 리뷰 (ponytail 사다리의 적용, 재사용·설정 결정 검토. gstack이 있으면 plan-eng-review, UI는 plan-design-review로 보강) → prokit-reviewer(plan): approve, max=none\|low\|medium, 반영·기각 내역. N/A 불가 | prokit-reviewer(plan): approve, max=low, 지적 2 (반영 2: 테스트 try/finally, 백로그 T7-01 문구를 실제 방법($client)으로) |
| 5 | [verify] 타입·린트 검사 (commands.typecheck, commands.lint) → 명령과 결과 요약 | pnpm check-types → exit 0 (Tasks 5 successful). pnpm exec biome check . → exit 1: 기존 지적 10 errors/2 warnings/2 infos(docs/prototypes, 기준과 같음); 바꾼 파일 biome check packages/db/src/index.ts packages/api/src/db-client.test.ts → 0건 |
| 6 | [verify] 로컬 개발 DB에 dbMigrate 적용 → 호스트:포트와 출력 요약 | N/A: 스키마·마이그레이션 변경 없음(packages/db/src/index.ts 연결 코드만, migrations 폴더 변경 없음) |
| 7 | [verify] 병합 전 Neon 개발 브랜치에 dbMigrate 적용 (neon-postgres-branches) → 브랜치 이름과 출력 요약 또는 N/A: Neon 미연결(.neon 없음) | N/A: 스키마·마이그레이션 변경 없음, Neon 미연결(.neon 없음, T15 전) |
| 8 | [review] prokit-reviewer(db) → verdict, max_severity, 반영·기각 내역 | prokit-reviewer(db): approve, max=low, 지적 1 (보류 1: 로그 폭주 알림 장치 없음 → 로드맵 T15 메모로). 한계 메모(Neon pooled 주소·attachDatabasePool·max)도 T15 메모에 적음 |
| 9 | [verify] 2계정 격리 테스트 → 테스트 이름과 통과 출력 | source testdb.env && vitest run isolation (packages/api) → Test Files 7 passed, Tests 30 passed. 프로시저·소유 데이터 변경 없음(회귀 확인) |
| 10 | [verify] 타입·린트·테스트 → 명령과 결과 | source testdb.env && pnpm test → web 21 files 451 passed, api 38 files 655 passed(skipped 0), Tasks 2 successful. 타입·린트는 5행과 같음 |
| 11 | [review] prokit-reviewer(code) → verdict, max_severity, 반영·기각 내역 | prokit-reviewer(code): approve, max=low, 지적 1 (반영 1: 테스트 두 풀 end를 try/finally로 — plan 리뷰와 같은 지적이라 반영) |
| 12 | [verify] 타입·린트·빌드 → 명령과 결과 | pnpm build → exit 0 (web:build Compiled successfully, Tasks 4 successful, 경고 0). 타입·린트는 5행과 같음 |
| 13 | [verify] next-dev-loop 런타임 확인과 ego-browser(없으면 agent-browser)로 desktop·mobile 스크린샷 → 확인한 경로, 오류 예산(콘솔·개발 오버레이·get_errors·서버 로그, 환경 탓도 빼지 않음) 수, tasks/evidence/ 경로 | N/A: 화면 변경 없음(서버 DB 연결 코드만). 런타임 확인은 17행 |
| 14 | [review] impeccable critique → Design Health 점수, P0/P1 목록 | N/A: 화면 변경 없음 |
| 15 | [review] impeccable audit과 web-design-guidelines 코드 검사 → 점수(/20), 접근성 점수, web-design-guidelines 위반 수 | N/A: 화면 변경 없음 |
| 16 | [verify] 재확인 1회 → 스크린샷 경로와 점수 | N/A: 화면 변경 없음(14·15행 N/A) |
| 17 | [verify] next-dev-loop 통합 런타임 확인 → 확인한 경로와 결과 | 실행 중 개발 서버(127.0.0.1:3001)에서 재현: POST /api/rpc/channelList 200 → 5433 tts-pilot-app DB의 쉬는 연결 1개(pid 22571)만 pg_terminate_backend → 서버 로그 '[db] 쉬는 연결 오류: terminating connection due to administrator command' 1줄, uncaught/unhandled 0건(로그 전체) → 다음 POST /api/rpc/channelList 200. /_next/mcp get_errors → configErrors 0, sessionErrors 0. (5432는 다른 프로젝트 DB라 건드리지 않음) |
| 18 | [review] prokit-reviewer(code) 전체 diff 최종 리뷰 → verdict, max_severity, 반영·기각 내역 | prokit-reviewer(code) 최종(전체 diff: index.ts, db-client.test.ts, todo.md, roadmap): approve, max=none, 지적 0. T95-10·T95-19 완료 표시가 코드와 맞음을 확인 |
| 19 | [verify] 사용자 흐름 QA (스펙의 테스트 시나리오 전부를 ego-browser(없으면 agent-browser)로, 오류 예산은 깨끗한 프로필(agent-browser)로도, 보고만) → 시나리오별 통과·실패, 오류 예산 수 | N/A: 화면·사용자 흐름 변경 없음(서버 오류 처리만). 사용자 관점 확인은 17행 개발 서버 재현 |
| 20 | [design] 재사용·설정 설계 점검 (prokit-dev-cycle의 references/reuse-design.md와 해당 공식 스킬) → 기존: 경로·소비자; 결정: 재사용·분리; 설정: 환경 변수·설정 영향; 검증: 회귀 검사 | 기존: packages/db/src/index.ts createDb, 소비자 apps/web/src/services.ts(서버 단일 풀)·packages/api/src/test-db.ts·voice-cache.test.ts; 결정: 작은 확장 — 백로그의 'Pool 직접 생성' 대신 drizzle가 만든 $client에 처리기를 붙여 기존 connection 설정(3초 제한)과 생성 경로 유지; 설정: 변경 없음(apps/web/.env.schema·DATABASE_URL·풀 옵션 그대로); 검증: db-client.test.ts 재현 테스트, 전체 pnpm test, 개발 서버 재현. 사용: prokit-dev-cycle references/reuse-design.md, ponytail |
| 21 | [verify] pnpm agents:check → 출력 | pnpm agents:check → exit 0 (에이전트 정의 일치) |
| 22 | [verify] pnpm skills:check → 출력 | pnpm skills:check → exit 0 (스킬(프로젝트): 50개 중 모두 있음, 선택 묶음 미설치 안내 기존과 같음) |
| 23 | [verify] pnpm dev-cycle case·status 실행 확인 → 출력 요약 | pnpm dev-cycle case → F (+H) — base 0add7e2ee6cd7d3fe0d75cd80669f1b764bc53d4 (packages/db·packages/api 두 계층 + .claude/settings.json 하네스; 버그라 C로 선언, --upgrade로 F 필수 행 추가). pnpm dev-cycle status → 라운드 C "T7-01 DB 유휴 연결 끊김 uncaughtException" — 18/26칸 — 다음: [review] prokit-revie |
| 24 | 스킬을 바꿨으면 skill-creator eval 재실행 → 벤치마크 경로 또는 N/A: 사유 | N/A: 스킬 변경 없음 |
| 25 | 문서 영향 확인 (GLOSSARY.md와 docs/adr/는 domain-modeling 형식, docs/domain/project.md, 미룬 지적은 tasks/todo.md 백로그로) → 갱신 내역 또는 N/A: 사유 | tasks/todo.md: T7-01 완료와 실제 방법($client.on) 기록, T95-10·T95-19 완료 정리(앞 라운드 Part 5에서 해결, 강도 칩의 같은 Base UI 동작은 T9-10). docs/plans/implementation-roadmap.md: T9.5 상태 완료(2026-10-23), T15 메모의 T7-01 줄을 고침 + 배포 때 풀 설정(Neon pooled, attachDatabasePool, max)·로그 폭주 알림. GLOSSARY·ADR·project.md: N/A(용어·화면·API·테이블 변경 없음) |
| 26 | [confirm] 사용자 확인 (결과를 사용자에게 보여 주고 사용자가 직접 보거나 써 본 뒤 확인한다. N/A 불가) → 확인한 내용과 날짜 | 사용자 확인(2026-10-23): "확인, 닫고 커밋" — 재현 테스트(수정 전 57P01 uncaughtException 실패, 수정 뒤 통과), 개발 서버 재현(로그 한 줄, 다음 요청 200), 전체 검사·리뷰 4건 승인, 로드맵 T9.5 완료·T95-10/19 정리를 보고받고 확인 |

배포 PASS: 준비 안 됨(git 원격 origin 없음, Vercel 프로젝트 미연결, T14 전 배포 금지). 커밋만 함(push 없음).
<!-- dev-cycle:archived-end -->
> 묶음: TTS Pilot 개발 백로그

### 성우 보관함 (T7에서 미룬 것, 2026-10-07)


- [x] T7-01 (P1, 기존 T4 버그, T14 전 필수) `packages/db/src/index.ts` `createDb`가 drizzle 내부 pg Pool에 `error` 처리기를 두지 않아, DB가 유휴 연결을 끊으면(컨테이너 정지, 운영 Neon 유휴 끊김) `uncaughtException: terminating connection due to administrator command`가 난다(T7 QA S11에서 12쌍). C 라운드(2026-10-23)에서 고침: Pool을 직접 만들지 않고 drizzle가 만든 풀(`db.$client`)에 `on("error")`를 붙여 `[db] 쉬는 연결 오류: …` 한 줄만 남긴다. 재현 테스트 `packages/api/src/db-client.test.ts`.

> 묶음: TTS Pilot 개발 백로그

### 드라마 작업실 (T9.5에서 미룬 것, 2026-10-22)


- [x] T95-10 (30행 QA F2, T9-10과 같은 원인) 테이크 칩 묶음에 Tab으로 들어가면 눌린 칩이 아니라 첫 칩에 선다(Base UI ToggleGroup 기본). Part 5(2026-10-23)에서 테이크 칩 묶음을 없애고 줄마다 받을 테이크 메뉴(`TakePick`)로 바꿔 사라졌다. 같은 Base UI 동작은 Typecast 강도 칩(`drama-toolbar.tsx` IntensityChips)과 감정 팔레트에 남아 T9-10으로 본다.

- [x] T95-19 (Part 3 code 리뷰 F3, Part 4로 갱신) Part 4가 줄 쉼 창(GapDialog·GapForm)을 지워 쉼 UI는 GapInput·DefaultGap·LineGap(약 110줄)만 남았다. `drama-lines.tsx`(약 1,130줄)에서 이 셋을 `drama-gap.tsx`로 옮길지는 다음에 이 파일을 크게 고칠 때 정한다(동작 그대로). 관찰: Base UI 메뉴를 연 뒤 약 200ms 안의 Esc는 무시된다(줄 메뉴·'받기' 메뉴 같음, 기존 동작). Part 5(2026-10-23): `drama-gap.tsx`로 옮김(그리고 도구줄 `drama-toolbar.tsx`, 줄 동작 `drama-line-actions.tsx`, 실행 취소 `drama-undo.ts`로 나눔). 확인함(2026-10-23).
