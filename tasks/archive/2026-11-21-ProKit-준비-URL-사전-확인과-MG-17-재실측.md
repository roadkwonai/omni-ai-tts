# ProKit 준비 URL 사전 확인과 MG-17 재실측

<!-- dev-cycle:archived closed=2026-11-21 case=H base=3eb24f0407b2045594bd06efaa3e3f39dfbae508 auth=false opened=2026-11-21 -->
## 라운드: H — ProKit 준비 URL 사전 확인과 MG-17 재실측
| # | 단계 | 증거 |
|---|---|---|
| 1 | [design] 재사용·설정 설계 점검 (prokit-dev-cycle의 references/reuse-design.md와 해당 공식 스킬) → 기존: 경로·소비자; 결정: 재사용·분리; 설정: 환경 변수·설정 영향; 검증: 회귀 검사 | 기존: 열린 H의 준비 URL 검증과 `browser.md`·`execution-efficiency.md`; 결정: 원본의 짧은 DOM 대기, eval --stdin 및 Codex 계측 기준 세 범위만 이어서 이식; 설정: 앱·빌드·DB 설정 입력 변경 없음; 검증: 원본 byte 일치, 독립 리뷰, 기존 서버의 동일 2폭 1상태. 사용: prokit-dev-cycle, prokit-verify |
| 2 | 구현 (구현 단계: 스킬·스크립트·설정을 바꾸는 방법과 prokit-implementer 위임. 스킬 설치·업데이트만 했으면 N/A: 사유) → 위임: prokit-implementer(사용: 읽은 스킬), 변경 파일 요약 또는 N/A: 사유 | 위임: prokit-implementer(사용: prokit-dev-cycle, incremental-implementation) → 앞선 준비 URL 반영 이후 두 참조 문서의 요소/상태 대기, eval --stdin, Codex 이벤트 계측 문단 흡수. cmp 두 파일 일치, diff --check, outside 없음. 사용: agent-skills:incremental-implementation. |
| 3 | [verify] pnpm agents:check → 출력 | agents:check exit 0, 정의 일치. 에이전트 입력 변경 없음. |
| 4 | [verify] pnpm skills:check → 출력 | skills:check exit 0, 프로젝트 스킬 58개. 전역 codex plugin list는 10초 제한 표시. skills.log. |
| 5 | [verify] pnpm dev-cycle case·status 실행 확인 → 출력 요약 | case H: 참조 문서 두 개; status 현행 H. cmp·git diff --check 통과. 앱·설정·러너·매니페스트 입력 불변으로 스크립트 12/12와 에이전트 및 skills 검사 원자료 재사용. |
| 6 | [verify] 빌드·검사 (빌드·배포 설정(next.config, vercel.json·vercel.ts, turbo.json, .github/workflows·actions)이나 작업공간 설정(루트 package.json, pnpm-workspace.yaml, biome.json, tsconfig.json, packages/config)을 바꿨으면 pnpm build와 타입·린트 검사(commands.typecheck, commands.lint). 아니면 N/A: 사유) → 명령과 결과 요약 또는 N/A: 사유 | N/A: 하네스 문서·러너만 변경(앱 빌드 입력 변경 없음) |
| 7 | [review] 하네스 변경 리뷰 (스크립트·CI·배포·작업공간 설정·.dev-cycle.json 규칙이나 스킬·에이전트의 판단 기준을 바꿨으면 prokit-reviewer(code). 스킬 설치·문서만 바꿨으면 N/A: 사유) → verdict, max_severity, 반영·기각 내역 또는 N/A: 사유 | prokit-reviewer(code): approve, max=none, integration accept. 원본 두 참조 해시, 수행 범위, 실제 QA·스크립트 12/12 및 리뷰 사이 변경 없음 확인. 반영 0, 기각 0. 사용: prokit-verify. ponytail-review: 기존 두 문서와 기존 검사만 활용. |
| 8 | 스킬을 바꿨으면 skill-creator eval 적용 여부 확인 (실행 효율과 재검증의 H 검증 범위) → 바뀐 판단의 평가, 일치 근거를 붙인 기존 벤치마크 경로 또는 N/A: 판단 규칙 변경 없음 | 사용: skill-creator(모의 평가 대신 바뀐 판단의 실제 행동 검증). 동일 320·360 한 상태 최초 차수 성공, no-follow 준비·요소/치수 안정화·stdin DOM 측정·Codex 경계 적용. 검증: comparison.md, replay.md, 두 이미지·measurement.json, 신규 앱 오류 0. 기존 평가/스크립트·스킬 검사 동일 입력 확인, 스크립트 추가 확인 12/12. |
| 9 | 문서 영향 확인 (GLOSSARY.md와 docs/adr/는 domain-modeling 형식, docs/domain/project.md, 미룬 지적은 tasks/todo.md 백로그로) → 갱신 내역 또는 N/A: 사유 | 원본 neon byte 일치, 참조 2개만 수정. 도메인·ADR·앱·설정·기존 백로그 보존. 직전 및 신규 차수별 비교 tasks/evidence/prokit-dom-replay/comparison.md. 미룬 지적: 백로그 0, 참고 1(단일 표본·내부 속도 및 성공 비용 차이). |
| 10 | [confirm] 사용자 확인 (결과를 사용자에게 보여 주고 사용자가 직접 보거나 써 본 뒤 확인한다. N/A 불가) → 확인한 내용과 날짜 | 사용자 확인(2026-11-21 KST, ProKit 원본 채팅): “결과 확인했어. tts-pilot-app 열린 세션에 전달해서 H 라운드 닫고, 재실측 결과를 성능 로그에 기록한 뒤 로컬 커밋까지 해줘.” 실제 메시지 확인. 마무리: 로컬 커밋. |
<!-- dev-cycle:archived-end -->
