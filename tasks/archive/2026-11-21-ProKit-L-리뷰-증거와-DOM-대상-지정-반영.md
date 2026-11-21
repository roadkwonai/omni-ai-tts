# ProKit L 리뷰 증거와 DOM 대상 지정 반영

<!-- dev-cycle:archived closed=2026-11-21 case=H base=236c481d499d1474d6fe12fbd6b1ed558c61d8ca auth=false opened=2026-11-21 -->
## 라운드: H — ProKit L 리뷰 증거와 DOM 대상 지정 반영
| # | 단계 | 증거 |
|---|---|---|
| 1 | [design] 재사용·설정 설계 점검 (prokit-dev-cycle의 references/reuse-design.md와 해당 공식 스킬) → 기존: 경로·소비자; 결정: 재사용·분리; 설정: 환경 변수·설정 영향; 검증: 회귀 검사 | 기존: L 위임·리뷰어·브라우저 참조; 결정: 원본의 패킷 구분, 첫 리뷰 지시와 DOM 대상 대조만 반영; 설정: 없음; 검증: 원본 대조, agents:check, 지침과 dry-run L, 독립 리뷰. 사용: prokit-dev-cycle, prokit-verify |
| 2 | 구현 (구현 단계: 스킬·스크립트·설정을 바꾸는 방법과 prokit-implementer 위임. 스킬 설치·업데이트만 했으면 N/A: 사유) → 위임: prokit-implementer(사용: 읽은 스킬), 변경 파일 요약 또는 N/A: 사유 | 위임: prokit-implementer(사용: prokit-dev-cycle, incremental-implementation) → 리뷰·브라우저·위임 지침 및 reviewer 미러 2개, 지정 5파일만. 기존 앱 호스트 지침 유지. 사용: agent-skills:incremental-implementation. |
| 3 | [verify] pnpm agents:check → 출력 | agents:sync로 reviewer 생성본 2개, agents:check exit 0 일치. |
| 4 | [verify] pnpm skills:check → 출력 | skills:check exit 0 프로젝트 58개, 전역 codex 명령 1개 10초 제한. skills.log. |
| 5 | [verify] pnpm dev-cycle case·status 실행 확인 → 출력 요약 | case H·status H, git diff --check exit 0. dry-run L 5행 및 검수 지침 7 assertion, 명령·입력 해시 check-results.log. |
| 6 | [verify] 빌드·검사 (빌드·배포 설정(next.config, vercel.json·vercel.ts, turbo.json, .github/workflows·actions)이나 작업공간 설정(루트 package.json, pnpm-workspace.yaml, biome.json, tsconfig.json, packages/config)을 바꿨으면 pnpm build와 타입·린트 검사(commands.typecheck, commands.lint). 아니면 N/A: 사유) → 명령과 결과 요약 또는 N/A: 사유 | N/A: 하네스 문서·러너만 변경(앱 빌드 입력 변경 없음) |
| 7 | [review] 하네스 변경 리뷰 (스크립트·CI·배포·작업공간 설정·.dev-cycle.json 규칙이나 스킬·에이전트의 판단 기준을 바꿨으면 prokit-reviewer(code). 스킬 설치·문서만 바꿨으면 N/A: 사유) → verdict, max_severity, 반영·기각 내역 또는 N/A: 사유 | prokit-reviewer(code): approve, max=none, 반영·기각 0. 화면 묶음·위임 기술 증거 구분, 첫 리뷰 지시·DOM 동시 측정 계약, 지정 경로와 native evidence SHA 대조. 사용: prokit-verify. ponytail-review: 기존 지침의 최소 변경. |
| 8 | 스킬을 바꿨으면 skill-creator eval 적용 여부 확인 (실행 효율과 재검증의 H 검증 범위) → 바뀐 판단의 평가, 일치 근거를 붙인 기존 벤치마크 경로 또는 N/A: 판단 규칙 변경 없음 | 변경 판단의 실제 계약 검사 Node check-contract.mjs → exit 0, 7/7 (L 5행, 첫 리뷰 증거·두 시점 snapshot·DOM 대상과 측정). 결정 코드 입력 미변경으로 기존 스크립트 결과 재사용. 이후 L에서 실제 행동 실측 예정. 사용: skill-creator(변경 범위 검증). |
| 9 | 문서 영향 확인 (GLOSSARY.md와 docs/adr/는 domain-modeling 형식, docs/domain/project.md, 미룬 지적은 tasks/todo.md 백로그로) → 갱신 내역 또는 N/A: 사유 | 리뷰어 정본과 생성 사본 2개 및 참조 2개. GLOSSARY·ADR·서비스 문서·앱·설정 영향 없음, 기존 백로그 보존. 미룬 지적: 백로그 0, 참고 0. |
| 10 | [confirm] 사용자 확인 (결과를 사용자에게 보여 주고 사용자가 직접 보거나 써 본 뒤 확인한다. N/A 불가) → 확인한 내용과 날짜 | 사용자 확인 2026-11-21 KST: L 리뷰 첫 지시와 DOM 측정 지침 반영·검증을 보고 “확인했고 로컬 커밋” 선택. |
<!-- dev-cycle:archived-end -->
