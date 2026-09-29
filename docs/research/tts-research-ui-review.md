# 서비스 조사 반영 UI 검토

2026-09-26. 대상: `docs/prototypes/tts-studio/index.html` 및 제작 도구·문단 가져오기 모듈. 기존 즐겨찾기 노란 별 라운드의 누락 리뷰와 이번 동선 보완을 같은 활성 B 라운드에서 이어서 검증한다.

## 반영 범위

Typecast·ElevenLabs·Vrew 공식 재조사 파일 3개와 `docs/plans/tts-research-driven-ux.md`를 연결했다. 대본 준비/성우 선택/내 음성 활용의 여섯 메뉴를 작업실 상단에 상시 표시하고, 작업실 대본·기존 화자/성우/감정 계획을 가져오기 도구에서 편집할 수 있게 했다. 기존 원문·발음용 대본·노란 별·Wanted/Pretendard는 유지한다.

## 독립 리뷰

Assessment A: `research_ui_design`, detector 결과 미공유. 최초 29/40, P0 없음, P1 두 건. ① 원문 교체 취소 후 오류 상태로 재반영이 차단됨 ② 복제 도구만 별도 화면으로 이동함을 알 수 없음.

수정: 파싱 상태와 반영 오류를 분리해 취소 후 초안 재시도를 허용한다. 파일 읽기 시작부터 `parsedFrom=null`로 이전 미리보기 반영은 계속 차단한다. 복제는 `내 보이스로 이동` 접근성 이름과 보이는 안내를 갖춘 링크로 표시하고 내 보이스에 작업실 복귀 버튼을 추가한다. 기존 클론 화면을 재사용하는 예외를 브리프에 명시했다. 도구 닫기/클론 복귀는 원문 탭을 먼저 활성화하여 발음용 대본 탭에서 진입했어도 숨겨진 입력에 포커스하지 않는다.

Assessment B: `research_ui_audit`, A 결과 수신 후 B 결과 통합. 최초 audit 16/20(접근성3·성능4·테마3·반응형3·구현3). detector 실패1은 기존 탭의 의도된 하단 경계/활성 밑줄로 확인되어 수정하지 않음, advisories8. 코드 검토의 기존 저장 대본 상한 불일치와 클론 삭제 참조 문제는 Q-02/Q-03으로 기록했다. 저장 대본은 직접 재사용 가능하므로 ‘재사용 불가’라는 초기 표현은 채택하지 않았다. 즐겨찾기 PC 터치 영역의 low 지적은 후속 접근성 개선 대상으로 유지한다.

Assessment A 마지막 재확인: **34/40, P0/P1 없음**. 취소 후 동일 초안 재시도·반영 성공, 클론 링크/안내/복귀, 발음용 대본 탭에서 출발해도 원문 탭과 script-editor 포커스 복귀, 390px 가로 넘침 없음을 실제 확인했다. 최신 1440/390 캡처를 덮어썼고 테스트 세션은 종료했다.

## 검증 근거

- 변경 프로토타입 13파일 `pnpm exec biome check docs/prototypes/tts-studio`: exit0. app.js/studio-tools.js/script-tools.js `node --check`, `git diff --check`: exit0.
- `pnpm check-types`: 5/5, `pnpm build`: 4/4 성공(모두 Turbo cache hit). HTML 런타임 증거는 별도로 확인한다.
- 전체 `pnpm exec biome check .`: exit1, 103 errors / 68 warnings / 2 infos. 기존 코드·도구 상태 파일까지 포함한 결과이며 Q-01에 기록. 전체 lint 통과로 표현하지 않는다.
- Main은 CUA로 첫 화면의 세 그룹·여섯 메뉴, Enter로 가져오기 열기, 제목 포커스, 작업실 원문과 기본 성우가 문단 편집에 로드되는 것을 확인했다. IAB native confirm은 CDP timeout/getJsDialog 미노출로 취소 검증에 사용하지 못했다. 오류 탭은 닫았다.
- Assessment A는 별도 agent-browser로 1440/390px 스크린샷, 실제 취소 흐름, 가로 넘침 없음, 닫기 후 script-editor 포커스를 확인했다. 기존 Ego 캡처 실패에 따른 대안이다.
- 브라우저 증거: `tasks/evidence/service-research-ui/a-desktop.png`, `a-mobile.png`.

## Web Interface Guidelines

현재 공식 [검사 규칙](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)을 직접 다시 가져와 대조했다. 새 도구는 native button/link, 그룹 legend, 확장 상태와 연결 대상, 패널 제목 포커스 및 닫기 후 복귀를 갖춘다. 입력은 기존 label/aria-label을 재사용한다. 새 색·폰트·패키지는 추가하지 않는다. 파일 파싱·기존 결과 교체 경계는 유지한다. 기존 데스크톱 즐겨찾기 28px 터치 영역은 low 개선 항목이며 모바일은44px다.

## 범위의 한계

로그인한 외부 서비스 UI 직접 사용, 실제 API/음성 생성·다운로드·클론/변환 품질 검증, 물리 마이크 테스트는 하지 않았다. 공급자 웹 서비스에만 있는 자동 편집·무료 정책을 API 지원으로 표기하지 않는다. 자막·영상 기능은 연구와 후속 설계이며 이번에 구현한 기능이 아니다.

Questions skipped: 기존 개인용·HTML 우선·Wanted/Pretendard와 이번 조사 후 진행 요청이 명확하여 재승인 질문 없음.

## 최종 코드·보안 검토

bts-reviewer `research_ui_audit`: 이번 변경 code **approve, max=none**, security **approve, max=none**. localhost에서 초안 불러오기 취소 보존, 빈 입력 오류 후 재시도, 감정 smart·강도1 왕복 보존을 확인했다. `bash tasks/evidence/service-research-ui/check.sh` exit0; 이 파일은 localhost4173과 agent-browser로 다시 실행할 수 있다. 최초 B의 file URL 실패 이후 localhost로 정상 검증했으며 실패를 통과로 대체하지 않고 두 실행을 구분한다. 실제 .env는 읽지 않았다.
