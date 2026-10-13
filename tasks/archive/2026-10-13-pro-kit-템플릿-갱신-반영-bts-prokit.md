# pro-kit 템플릿 갱신 반영 (bts→prokit)

<!-- dev-cycle:archived closed=2026-10-13 case=H base=64936eb7116b470cb490b4f5b726143e7859ad94 auth=false opened=2026-10-13 -->
## 라운드: H — pro-kit 템플릿 갱신 반영 (bts→prokit)
| # | 단계 | 증거 |
|---|---|---|
| 1 | [design] 재사용·설정 설계 점검 (prokit-dev-cycle의 references/reuse-design.md와 해당 공식 스킬) → 기존: 경로·소비자; 결정: 재사용·분리; 설정: 환경 변수·설정 영향; 검증: 회귀 검사 | 기존: pro-kit 갱신 절차(pro-kit AGENTS.md '기존 프로젝트에 템플릿 갱신 반영' 1~6)와 install.sh --diff 결과, 소비자는 .claude·.codex·.agents 에이전트 정의와 dev-cycle 러너; 결정: bts-*를 git mv로 prokit-*에 옮긴 뒤 템플릿 원본으로 교체(프로젝트 수정분 없음 확인), 프로젝트가 고친 .dev-cycle.json authPaths·commands와 AGENTS.md TTS 규칙 절은 유지, 템플릿 스크립트 6개는 교체, 새 파일은 install.sh --skip-skills로 추가; 설정: 환경 변수 변경 없음, .dev-cycle.json에 하네스 규칙 정규식과 resources.roots=[] 추가, package.json에 resource·delegation 명령 5개, biome.json 제외 2개, .gitignore에 .prokit/; 검증: agents:check·skills:check·dev-cycle case·status·audit, biome check apps packages scripts, check-types |
| 2 | [verify] pnpm agents:check → 출력 | pnpm agents:check → exit 0, 에이전트 정의 일치(.codex/agents·.agents/agents에 prokit-implementer·prokit-reviewer·specialist-reviewer 생성, bts-* 생성물 삭제) |
| 3 | [verify] pnpm skills:check → 출력 | pnpm skills:check → exit 0, 누락 0(새 manifest의 ponytail-audit·debt·help·gain 4개는 pnpm skills:update <이름>으로 설치, 스크립트 없음). 외부 스킬 10개 업데이트는 사용자 선택으로 다음 라운드 |
| 4 | [verify] pnpm dev-cycle case·status 실행 확인 → 출력 요약 | pnpm dev-cycle case → H — base 64936eb7116b470cb490b4f5b726143e7859ad94(코드 4건 제외 뒤), status → 라운드 H "pro-kit 템플릿 갱신 반영 (bts→prokit)" — 6/7칸 — 다음: [confirm] 사용자 확인 (…; 새 dev-cycle.mjs가 기존 대조표를 읽고 table H --upgrade로 [design] 행 추가. biome check apps packages scripts exit 0, check-types exit 0 |
| 5 | 스킬을 바꿨으면 skill-creator eval 재실행 → 벤치마크 경로 또는 N/A: 사유 | N/A: prokit-* 스킬·에이전트는 pro-kit v0.1.4 템플릿 원본을 그대로 복사(프로젝트 수정분 없음 확인), 검증은 템플릿 저장소 evals·VERIFICATION.md 몫. tts-provider는 스킬 이름 참조만 바꿈 |
| 6 | 문서 영향 확인 (GLOSSARY.md와 docs/adr/는 domain-modeling 형식, docs/domain/project.md, 미룬 지적은 tasks/todo.md 백로그로) → 갱신 내역 또는 N/A: 사유 | AGENTS.md·CLAUDE.md·docs/dev-workflow.md를 템플릿 새 판으로 바꾸고 TTS Pilot 규칙 절 유지, ADR 0001 이름 변경, 살아 있는 문서(README, tts-provider, 로드맵 31·33·34·250행, 요구사항, ADR 0002, site-map·tts-studio 브리프)의 bts-*→prokit-*, 지난 스펙·계획·리뷰·archive는 기록이라 유지. GLOSSARY.md·project.md는 템플릿 차이가 뼈대뿐이라 N/A. 미룬 것 PK-01·PK-02를 백로그에 |
| 7 | [confirm] 사용자 확인 (결과를 사용자에게 보여 주고 사용자가 직접 보거나 써 본 뒤 확인한다. N/A 불가) → 확인한 내용과 날짜 | 사용자: pro-kit v0.1.4 반영 결과(이름 변경, 새 파일, 문서·스크립트 교체, 미룬 PK-01·02, 외부 스킬 10개는 다음 라운드)를 보고 '확인했어, 닫고 커밋'(2026-10-13) |
배포 PASS: 준비 안 됨(origin 없음, Vercel 연결 없음(.vercel/project.json 없음))
<!-- dev-cycle:archived-end -->
> 묶음: TTS Pilot 개발 백로그

### 구현 로드맵 (TASK 순서)


- [x] T1 앱 기반과 공통 틀, 로컬 관리자 모드 (REQ-12 기반, REQ-01 로컬 보호, P0-04, P0-05 일부, Q-01) — 2026-09-29 완료(tasks/archive)

- [x] T2 공급자 연결 상태 (REQ-02 연결, REQ-11 오류 상태, P0-14·19 일부) — 2026-10-04 완료(tasks/archive)

- [x] T3 Typecast 성우 찾기와 샘플 듣기 (REQ-02·03, P0-15 일부) — 2026-10-04 완료(tasks/archive)

- [x] T4 성우 캐스팅 세 공급자 통합: 공급자 탭, 공급자별 필터 전부, 페이지 나눔 (REQ-02·03, P0-16·25 일부)

- [x] T5 내 문장으로 샘플 듣기: 공급자별 설정, 무료가 아니면 예상 크레딧 경고 뒤 진행 (REQ-03 시험 생성, REQ-09·11 일부) — 2026-10-06 완료(tasks/archive)

- [x] T6 채널·분류 관리 (REQ-05 일부, P0-06 일부, P0-08) — 2026-10-06 완료(tasks/archive)

- [x] T7 성우 보관함: 즐겨찾기·자주 사용·채널/카테고리/타입 연결 (REQ-04·05, P0-09) — 2026-10-07 완료(tasks/archive)

- [x] T7.5 Airy 공급자 추가: 연결 상태·캐스팅·내 문장 듣기·보관함 (REQ-02·03·04 Airy) — 2026-10-07 완료(tasks/archive)

> 묶음: TTS Pilot 개발 백로그

### 앱 틀 다듬기 (T1 QA에서 미룬 것, 2026-09-29)


- [x] AF-01 (K3) 휴대폰 더보기가 경로 이동·Esc·바깥 누르기로 닫히지 않는다. 경로 이동 닫기는 로드맵 T2 메모에 있다(더보기에 첫 링크가 생길 때). Esc·바깥 닫기도 그때 함께 본다. → T2에서 해결: 더보기가 경로 이동·현재 페이지 링크·Esc·바깥 누르기로 닫히고 열린 동안 Tab을 가둔다(2026-10-04).

- [x] AF-03 (K2) 테마 버튼 이름에 현재 테마가 없다. 서버는 테마를 몰라 수화 불일치가 나지 않게 마운트 뒤에 이름을 바꿔야 한다. 테마 메뉴를 다시 손볼 때 한다. → T2에서 해결: 테마 버튼이 고른 값의 아이콘과 "테마 바꾸기, 현재 …" 이름(수화 뒤)(2026-10-04).

- [x] AF-04 (K4) 404 탭 제목이 "TTS Pilot" 그대로다. Next 16의 `not-found.tsx`는 `metadata`를 받지 않는다(`global-not-found`는 실험 기능). Next가 지원하면 한다. → T2에서 해결: 앱 틀을 루트 레이아웃으로 옮기고 루트 not-found 메타데이터로 "페이지를 찾을 수 없어요 · TTS Pilot"(2026-10-04).

- [x] AF-05 (K7) 빈 상태 제목이 제목 태그가 아니다. 공용 `Empty`의 제목 단계를 정하는 일이라 빈 상태가 두 화면 이상에 생길 때(T3~) 정한다. → T3에서 해결: 공용 `EmptyTitle`을 `h2`로(2026-10-04).

- [x] AF-06 (K8) `theme-color` 메타가 없다. 메타는 시스템 테마만 따라가 앱에서 고른 테마와 어긋날 수 있다. 휴대폰에서 쓰기 시작하면 한다. → T2에서 해결: viewport themeColor(라이트·다크 background 토큰)(2026-10-04).

- [x] AF-07 (K5) `Button`의 `transition-all`을 필요한 속성으로 줄인다. 눈에 보이는 문제는 없다. 공용 컴포넌트를 정리할 때 한다. → T2에서 해결: Button·Badge `transition-colors`(2026-10-04).

- [x] AF-11 (N11) `/api/rpc`의 `onError`가 의도한 4xx 거절(CSRF 403 등)도 전체 스택으로 남긴다. 공급자 오류 매핑(T2)에서 로그 정책을 정할 때 함께 줄인다. → T2에서 해결: rpc onError가 4xx를 남기지 않고, 출력 검증 실패는 코드·경로 한 줄(2026-10-04).


> 묶음: TTS Pilot 개발 백로그

### 연결 상태·앱 틀 (T2 디자인 리뷰에서 미룬 것, 2026-10-04)


- [x] CS-03 (critique P2) 1200px 이상에서 테마 버튼(모니터 아이콘) 옆에 '로컬 관리자'가 붙어 같은 항목으로 읽힌다. 로컬 관리자 설명은 `title`에만 있다. 앱 틀 브리프 배치 변경이라 메뉴를 다시 손볼 때 본다(AF-03과 함께). — 해결(T3 사용자 테스트 피드백 2026-10-04): 테마 버튼을 바닥 줄 오른쪽 끝으로 옮겨 '로컬 관리자'와 떨어졌다.

- [x] CS-04 (critique P2) 1024px에서 카드가 2+1로 놓여 Fish Audio 버튼이 첫 화면 밖이다. 브리프 5절의 2열 기준(768~1199)을 바꾸는 일이라 성우 캐스팅(T3)에서 카드 격자를 다시 정할 때 본다. → T3에서 해결: `grid-cols-cards lg:grid-cols-3`로 1024px 이상 3열(2026-10-04).

- [x] CS-05 (audit P3) `Spinner` 기본값이 `role="status"`·`aria-label`을 가진다. 지금은 카드에서 `aria-hidden`으로 숨긴다. 다음에 Spinner를 쓰는 TASK가 기본값을 정한다. → T3에서 해결: `aria-hidden`이면 숨기고 아니면 `role="status"`·"불러오는 중"(2026-10-04).

- [x] CS-08 (최종 확인 2026-10-04) ElevenLabs 카드가 지난 날짜("9월 20일 초기화")를 보여 준다. 공급자가 준 `next_character_count_reset_unix`를 그대로 쓴 것이다(무료 플랜 값으로 보임, 변환은 맞음). 지난 시각이면 날짜를 빼거나 연도를 붙일지 브리프 7절 문구와 함께 정한다. 연결 상태 화면을 다시 만지는 T3에서 본다. → T3에서 해결: 지난 초기화 시각은 날짜를 숨긴다(`isUpcoming`, 2026-10-04).

> 묶음: TTS Pilot 개발 백로그

### UI 설계 선행 작업

- [x] UI-01 지정 영상 223초 다운로드·48프레임 분석·로컬 Whisper 전사 2회, gowith153 가이드/이미지 8개와 양사/Vrew 공식 서비스 조사. 근거: docs/research/tts-video-detailed.md, gowith-ux-review.md, tts-service-comparison.md. 실 로그인 에디터/유료 생성은 미검증.
- [x] UI-02 개인용 HTML 프로토타입 7영역: docs/prototypes/tts-studio/index.html. 실제 API·음성·DB 없는 명시적 시연.
- [x] UI-03 1440/390px 캡처·상태 검증, 독립 critique 34/40 및 audit 16/20(접근성3/4), 지적 수정. docs/research/tts-html-review.md.
- [x] UI-04 HTML→Next.js 컴포넌트/상태/검증 매핑과 6개 단계 계획: docs/plans/tts-ui-first-implementation.md. 실제 앱 구현은 아직 진행 전.

- [x] UI-05 성우별 채널/카테고리/타입 다중 태그, 우측 편집 패널·모바일 전체 화면, 항목 관리와 성우 필터 연결, 브라우저 저장/복원 검증. 실제 API/DB 연결은 P0-08/09 유지.

- [x] UI-07 gowith153 로그인 작업실 전수 조사(2026-09-28): 문단 카드·일괄 작업·화자/역할·성우 선택 창·AI 보이스 도구 5종·가져오기 3단계·프로젝트/복구/초기화·크레딧 내역·마이페이지·모바일 390px. 크레딧 소모·서버 저장 없이 확인. 근거: docs/research/gowith-studio-logged-in-review.md.
- [x] UI-08 gowith 조사 반영 HTML 설계: 문단 카드·일괄 작업 막대·역할 창·하단 생성/재생 바·프로젝트 보관함/복구·작업 요약·보이스 디자인·녹음 가이드를 작업실에 배치(라운드 B, 브리프 확인 후 구현). 실제 기능은 아래 P1-11~P1-16, P2-09, P3-08, P4-08 등으로 추적.
- [x] UI-09 gowith 반영 구조 개편(2026-09-29, 라운드 B): critique 24/40·반영 감사(68개 중 숨김 28, 약함 10)에 따라 문단 카드를 기본 작업면으로, 좌측 레일(일괄 작업·AI 보이스 도구), 우측 레일(작업 요약·설정·결과), 성우·도구 드로어, 카드 요약 줄 약 100px. 브리프: docs/briefs/tts-gowith-reflection.md(2026-09-29 개정).
- [x] UI-10 감정 자동화 "규칙 기반 제안 시작"을 누르면 버튼이 disabled로 다시 그려져 포커스가 body로 빠진다(script-tools.js beginProposal→renderEmotion, 드로어 안이라 키보드 사용자가 처음부터 다시 Tab). 2026-09-29 P3 라운드 독립 평가(P2, 기존 문제)에서 범위 밖으로 남김. 2026-09-29 C 라운드에서 수정: renderEmotion이 다시 그리기 전 포커스의 data-focus를 기억해 같은 컨트롤로 되돌림(제안·전체 선택·일괄 적용·되돌리기·처음으로·문단 체크·감정·강도·반영 모두), 제안 버튼과 되돌리기는 disabled 대신 aria-disabled, 제안 결과는 알림 영역으로 읽음.

- [x] UI-06 제작 도구 여섯 흐름 HTML: 입력/검토/적용, 로컬 원본·녹음/문서 파싱, 문단별 성우·감정 계획, 요청 취소/오류/재시도와 하트 채움. 실제 공급자 API 결과는 시연이며 backend TODO는 유지. docs/briefs/tts-production-tools.md.


> 묶음: TTS Pilot 개발 백로그

### P0 — UI/UX 우선, 초기 필수 기능 전체


- [x] P0-01 제품 맥락: 2026-09-26 개인 작업실 우선 확정, 서버 키 방식, 공개 가입/팀/결제는 후속. PRODUCT.md 작성. 오디오 영구 보관은 미확정으로 P1-02에 유지.

- [x] P0-02 용어 정본: GLOSSARY.md에 기본 용어 24개와 제작 도구 용어 6개 정의. 공급자 분류/개인 타입, 즐겨찾기/자주 사용, 기본 샘플/시험 생성, glossary/개인 발음 사전 구분 (2026-09-26).

> 묶음: TTS Pilot 개발 백로그

### 이번 문서 작업에서 확인한 기존 품질 항목


- [x] Q-04 turbo 2.11.5 설치와 turborepo 스킬 갱신(2026-09-28 H 라운드). 사용자 요청으로 최소 릴리스 경과 기간 전에 설치해 `pnpm-workspace.yaml`에 turbo 계열 7개 패키지 `@2.11.5` 한정 `minimumReleaseAgeExclude`가 생겼다. 2026-09-29 00:45 UTC 뒤에는 필요 없는 항목이다.


## T5 구현 계획 실행 (Codex, 2026-10-05)


- [x] Task 1: oRPC File 출력 확인과 독립 리뷰

- [x] Task 2: 공급자 설정·입출력 계약

- [x] Task 3: 생성 기록 스키마·마이그레이션

- [x] Task 4: 생성 기록 모듈

- [x] Task 5: 공급자 합성

- [x] Task 6: 프로시저 여섯·격리 테스트

- [x] Task 7: Slider·Switch·AlertDialog

- [x] Task 8: 화면 순수 함수·CS-01

- [x] Task 9: 문장 상태·확인·생성·재생 흐름

- [x] Task 10: 패널 구역·결과 목록

- [x] Task 11: 행의 내 문장 듣기

- [x] Task 12: 문서 반영
