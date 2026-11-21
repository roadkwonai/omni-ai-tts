# ProKit F DB 영향과 검사 묶음·촬영 보완 반영

<!-- dev-cycle:archived closed=2026-11-22 case=H base=ad2b31382f4f991e7d64cfbf68e45f5a15df2f6f auth=false opened=2026-11-22 notask=true -->
## 라운드: H — ProKit F DB 영향과 검사 묶음·촬영 보완 반영
| # | 단계 | 증거 |
|---|---|---|
| 1 | [design] 재사용·설정 설계 점검 (prokit-dev-cycle의 references/reuse-design.md와 해당 공식 스킬) → 기존: 경로·소비자; 결정: 재사용·분리; 설정: 환경 변수·설정 영향; 검증: 회귀 검사 | 기존: v0.3.15 runner의 F DB 행과 evidence, 기존 resolve·실행 효율·브라우저 준비 절; 결정: pinned neon 세 파일의 실제 차이만 반영; 설정: 앱 설정과 에이전트 정의 변경 없음; 검증: 같은 앱/SQL/행 fixture, 285건 AB/BA/AB, GA-02 동일 2폭. |
| 2 | 구현 (구현 단계: 스킬·스크립트·설정을 바꾸는 방법과 prokit-implementer 위임. 스킬 설치·업데이트만 했으면 N/A: 사유) → 위임: prokit-implementer(사용: 읽은 스킬), 변경 파일 요약 또는 N/A: 사유 | 위임: prokit-implementer(사용: prokit-dev-cycle); 고정 ref 0ffffed021f0의 세 파일만 이식하고 바이트 검증. 사용: incremental-implementation(이식 절차 대조), test-driven-development(이식 이후 사후 대조); 이식 전 실패 테스트 미실행은 implementation.md에 명시. native-implementation.json, after.json outside 0. |
| 3 | [verify] pnpm agents:check → 출력 | pnpm agents:check exit 0, 에이전트 정의 일치. agents-check.log. |
| 4 | [verify] pnpm skills:check → 출력 | pnpm skills:check exit 0. skills-check.log; 전역 Codex plugin list 조회 시간 초과 기록, 설치된 프로젝트 스킬과 분리. |
| 5 | [verify] pnpm dev-cycle case·status 실행 확인 → 출력 요약 | node scripts/dev-cycle.mjs case → H, status → 열린 H 확인. 원본 앱은 별도 사용자 백로그 외 H 세 경로만 변경. |
| 6 | [verify] 빌드·검사 (빌드·배포 설정(next.config, vercel.json·vercel.ts, turbo.json, .github/workflows·actions)이나 작업공간 설정(루트 package.json, pnpm-workspace.yaml, biome.json, tsconfig.json, packages/config)을 바꿨으면 pnpm build와 타입·린트 검사(commands.typecheck, commands.lint). 아니면 N/A: 사유) → 명령과 결과 요약 또는 N/A: 사유 | node --check scripts/dev-cycle.mjs 및 git diff --check exit 0. 동일 앱 러너 dev-cycle-lite.test.mjs 5/5, skip 0. F 입력/낡은 근거/SQL 예외는 f/comparison.json 및 f/sql-review-check.json. 빌드·배포 설정 변경 없음. f9040a173227 적용 뒤 앱 러너 회귀 5/5 재통과, runner-tests-final.log 및 f/final/results.json. |
| 7 | [review] 하네스 변경 리뷰 (스크립트·CI·배포·작업공간 설정·.dev-cycle.json 규칙이나 스킬·에이전트의 판단 기준을 바꿨으면 prokit-reviewer(code). 스킬 설치·문서만 바꿨으면 N/A: 사유) → verdict, max_severity, 반영·기각 내역 또는 N/A: 사유 | prokit-reviewer(code): approve, max=none. 최초 지적 1건 반영: 생성 SQL 경로만 기재한 경우 검토 근거 누락을 거절한다. 무SQL 예외·독립 DB 리뷰 유지, 기각 0. 보완 검토: 기존 증거 필드 검사 재사용, ponytail-review: 추가 분기 최소. 사용: prokit-verify. 최종 증거 SHA256 5674fb7a38e288c6f99aeffff68f76b6f5693ac5aa886ff9150daace9ba6ac8e, 통합 수용. |
| 8 | 스킬을 바꿨으면 skill-creator eval 적용 여부 확인 (실행 효율과 재검증의 H 검증 범위) → 바뀐 판단의 평가, 일치 근거를 붙인 기존 벤치마크 경로 또는 N/A: 판단 규칙 변경 없음 | 사용: skill-creator; 실제 사례 평가: 05af3ce F의 동일 근거/스키마와 SQL, 285건×6, GA-02의 320·390 해제. f9040a173227 최종판 동일 SQL 경로만 입력 시 #6 거절, 검토 포함 시 수용. 무SQL 서식·소비자 예외도 해당 DB 행별로 확인. 독립 DB 리뷰 증거는 여전히 별도 요구. 원자료 tasks/evidence/prokit-matrix-update/report.md 및 f/final/results.json. |
| 9 | 문서 영향 확인 (GLOSSARY.md와 docs/adr/는 domain-modeling 형식, docs/domain/project.md, 미룬 지적은 tasks/todo.md 백로그로) → 갱신 내역 또는 N/A: 사유 | N/A: TTS 도메인/API/화면/데이터/설정·에이전트 배치 변화 없음. |
| 10 | [confirm] 사용자 확인 (결과를 사용자에게 보여 주고 사용자가 직접 보거나 써 본 뒤 확인한다. N/A 불가) → 확인한 내용과 날짜 | 사용자 확인 2026-11-22 KST: 최종 생성 SQL 검토 근거 검사, 러너 회귀 5건 및 독립 재리뷰 결과를 제시한 뒤 “H 확인·로컬 커밋”을 선택했다. 마무리: 로컬 커밋. |
<!-- dev-cycle:archived-end -->
