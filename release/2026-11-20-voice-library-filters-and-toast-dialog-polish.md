# v0.1.2 — Voice library filters and toast-dialog polish

- 날짜: 2026-11-20 18:21 (KST)
- 이전 버전: v0.1.1
- 전체 변경: https://github.com/roadkwonai/omni-ai-tts/compare/v0.1.1...v0.1.2

## Features

- 성우 보관함 정렬과 공통 태그(콘텐츠·분위기) 필터 (`0a8b3d7`)
  - 상태 줄 정렬(SortMenu): 최근 담은 순(기본)·최근 쓴 순·사용 횟수순·이름순(가나다→ABC)·서비스 인기순, 주소 sort. 조건이 아니라 '조건 모두 해제'가 풀지 않는다
  - 서비스 인기순은 ElevenLabs(최근 1년 글자 수)→Fish Audio(사용 횟수)→수치 없음 묶음, 묶음 머리 h2와 목록 접근 이름
  - 콘텐츠(9 공통 묶음)·분위기(같은 한국어 이름 병합) 다중 필터, 주소 content·mood, 태그 없는 성우 N명 안내 줄
  - 조건 펼침 드롭다운을 내 분류·성우 속성 두 무리로, DESIGN.md·브리프 B4-2·project.md 갱신, 미룬 지적 VL-01~04 백로그
- 성우 캐스팅 '전체' 탭과 성우 보관함에 성별·연령 필터 (`0c3cd68`)
  - '전체' 탭 검색 칸 뒤 성별(여성·남성)·연령(청년·중년·노년) 단일 선택, 다섯 묶음에 공급자 값으로 바꿔 건다(ElevenLabs gender·age, Fish Audio 태그 조회 키는 공급자 탭과 같다)
  - '모두 보기 →'가 검색어와 성별·연령을 그 탭 조건으로 가져간다(Airy·Gemini는 성별만)
  - 연령이 걸리면 Airy·Gemini 묶음에 연령 정보가 없다는 사유 문구, 조건 적용 안내 줄, 묶음별 인원 화면 밖 알림, 조건 모두 해제
  - 성우 보관함 성별·연령 단일 선택(주소 gender·age, 담은 성우에 있는 값만)
  - voice-filter 공통 키(genderKeyOf·ageKeyOf)로 메타 줄과 조건 판단을 하나로, 브리프 casting·voices 갱신, 미룬 지적 GA-01~04 백로그

## Fixes

- 높이 600 이상 대화상자 위 알림 자리, 폼 창 본문만 스크롤·넘칠 때 흐림, 알림 세 줄 이하(MG-16) (`46da106`)
  - 알림 자리 문턱을 높이 736에서 600으로 낮췄다. 그 전에 채널·카테고리·프리셋·대본 폼과 드라마 자동 태그·내 보이스 만들기 창의 머리·버튼 줄을 고정하고 본문만 스크롤하게 했다(공통 DIALOG_BODY)
  - 768 이상에서 스크롤 칸(폼 본문, 성우 목록)이 넘칠 때만 아래 24px 흐림(CSS 스크롤 타임라인)
  - 모달 중 알림이 화자 이름 20자에도 세 줄을 넘지 않게 문구를 줄였다(사용자 승인), 줄 수 테스트와 막대 버튼 묶음 클래스 테스트 추가
  - 스크롤 칸 포커스 윤곽·이름, DESIGN.md·드라마 브리프 문구, 백로그 MG-18, prokit 성능 기록
- 폰 폭 문단 작업실 막대 주 버튼을 글 폭으로, 자리 없으면 요약 칩 윗줄(MG-15) (`df4e33e`)
  - 767px 이하에서 주 버튼과 받기 버튼을 한 묶음(기본 폭 = 동사 + '· 무료' + 받기, 남는 자리 채움)으로 두어 320·360에서도 동사가 잘리지 않는다
  - 자리가 없으면 요약 칩이 윗줄로 간다(D22), 768 이상 배치는 그대로
  - DESIGN.md 사용량 표식 예외 문단, 백로그 MG-17, prokit 성능 기록
- 데스크톱 대화상자 위에 알림 자리, 키 큰 창은 목록·본문만 스크롤(MG-14) (`424064b`)
  - 폭 768·높이 736 이상에서 가운데 대화상자 최대 높이를 100dvh − 2×--toast-clearance(112px)로, 모달 중 위 알림(세 줄까지)이 창 제목을 덮지 않는다. 그보다 낮은 화면은 그대로
  - 성우 창 두 개는 탭 패널만 줄어 스크롤(기준 448, 최소 160, 탭마다 같은 높이), 붙여 넣기 두 창은 본문만 스크롤하고 버튼 줄 고정
  - 대본 넣기 85dvh 덮어쓰기 제거, DESIGN.md 알림 위치, 백로그 MG-16, prokit 성능 기록
- 랜딩 막대 로고를 SVG 심볼과 글자로, 메뉴 아이콘 반경 토큰(MG-04) (`d1b7d96`)
  - 라이트·다크 PNG 두 장(eager) 대신 인라인 SVG 심볼(primary 토큰)과 진짜 글자 'Omni AI TTS'(18px)로, 로고 이미지 요청 0
  - 로고 링크 hover는 글자가 primary로 바뀐다
  - 메뉴 아이콘 줄 반경 1px를 --radius-xs(2px)로
  - 쓰지 않는 public/brand/logo-light·dark.png 삭제(원본은 docs/assets/brand), 백로그 MG-04·UX-04 정리, prokit 성능 기록
- 문단 작업실 무료 신호를 막대 꼬리와 같은 조건으로, 잠긴 버튼 배지 선명·읽기 이름 무료(MG-13) (`8664023`)
  - 카드 '무료' 배지는 막대가 '· 무료' 꼬리를 보일 때만 뺀다(freeTailOf 공유). 만드는 중·멈추는 중에는 카드 배지가 다시 보인다
  - 잠긴 카드 '만들기'는 글과 Coins만 흐리고 '무료' 배지는 선명하게, 배지를 뺀 때도 읽기 이름에 '무료'
  - 막대 주 버튼 라벨을 동사·'· N개'·'· 무료' 조각으로 나눠 좁으면 'N개'부터 빠진다
  - studio-layout 테스트를 서식에 덜 묶이게, DESIGN.md 사용량 표식 예외 문단, 백로그 MG-15, prokit 성능 기록
- 모달 중 알림 행동은 누른 알림 설명을 행동별 안내로, 767px 이하 위 72px, Escape 뒤 같은 알림 버튼에 포커스(MG-12) (`34e705f`)
  - 모달이 열린 채 드라마 알림의 이동 행동을 누르면 새 알림 대신 누른 알림의 설명 줄을 행동별 안내(중립색)로 바꾸고, 다시 누르면 짧게 다시 나타나며, 창을 닫으면 원래 설명으로 되돌린다
  - 상단 막대가 보이는 폭(767px 이하)은 모달 중 알림 위 간격을 72px로 둔다(sonner mobileOffset은 600px 이하만)
  - 알림이나 Alt+T 목록에 포커스가 있을 때 Escape로 창을 닫으면 다음 프레임에 같은 알림의 행동 버튼으로 포커스를 돌린다(움직임 줄이기 포함)
  - DESIGN.md 알림 위치 문단, 백로그 MG-14(1024 간격 1px), prokit 성능 기록
- 모두 무료면 카드 '무료' 배지는 막대에만, 빈 대본은 막대를 모든 폭에서 숨김(MG-03) (`d19c103`)
  - makeMarkOf: 만들 문단이 모두 무료면 카드 배지 없음, 섞이면 무료 카드만 배지
  - 막대 '전체 만들기·이어서 만들기 · N개 · 무료', '· 무료'는 줄지 않는 조각(320에서도 보임), 접근 이름은 전체 글
  - 대본이 빈 동안 막대와 '만들기와 받기로' 링크를 모든 폭에서 숨김, 죽은 class 정리
  - DESIGN.md 사용량 표식 예외, 백로그 MG-03 완료·MG-13 추가, pro-kit 성능 기록 세 라운드 종합
- 작업 요약 이동 링크를 '… 문단 보기 · N번부터'로(MG-02) (`e34b440`)
  - '안 만든 문단 1 보기'의 숫자가 개수처럼 읽혀 세 링크(안 만든·멈춘·막힌)를 '… 문단 보기 · N번부터' 꼴로
  - studio-text 문구 테스트, DESIGN.md 작업실 격자 문단에 이유
  - 백로그 MG-02 완료, pro-kit 성능 기록에 MG-02 표
- 모달 중 드라마 알림 행동은 안내만, 알림 자리 전환 흐림, Alt+T 단축키 안내(MG-11) (`c7ce9a5`)
  - 모달이 열린 동안 '…번 줄로'·'성우 고르기'·'무대로'·'대본 붙여 넣기'는 하지 않고 알림을 남기며 '창을 닫은 뒤 다시 눌러요' 안내(lib/modal-action.ts, 고정 id)
  - 알림 자리가 위·아래로 바뀔 때 150ms 흐린 뒤 옮김(production CSS의 .15s도 환산), 움직임 줄이기면 즉시
  - 모달 중 위 간격 24→8px로 1024 대화상자 제목을 가리지 않음
  - 문단 작업실 단축키 목록에 Alt+T 줄, sonner 래퍼 className 병합
  - DESIGN.md 알림 위치 문단, 백로그 MG-12, pro-kit v0.3.10 성능 기록(tasks/prokit-perf-log.md)
- 공개 데모 정리 — 막대 '데모 작업실 열기', og 이미지 교체, 투어 스크린샷 재촬영(UX-01·02·09·13, MG-05) (`7dcece8`)
  - 랜딩 막대 데스크톱·휴대폰 메뉴 링크를 DEMO_HREF(/studio?example=1)·DEMO_LABEL로, 데스크톱 링크 보이는 높이 44px
  - og 이미지를 4판 첫 화면(막대 없이) 1200x630 촬영으로 교체, alt 갱신
  - 데이터 정리 뒤 투어 /scripts 스크린샷 4장과 README 1장을 DOM 숨김 없이 다시 찍음
  - 로컬 데모 DB QA 잔재 9행 삭제(운영 공개 데모는 이미 깨끗했음)
  - DESIGN.md·PRODUCT.md·랜딩 브리프·project.md 문구 맞춤, 미룬 지적 UX-19·UX-20 백로그
- 모달 중 알림 행동 뒤 포커스를 모달 안으로, 포커스 윤곽, 휴대폰 알림 간격(MG-10) (`9080f25`)
  - 되돌리기(paragraph-provider focusRestored·drama-undo)가 모달이 열려 있으면 문단·대사로 포커스를 옮기지 않음
  - 알림에서 나와 모달 밖으로 샌 포커스(sonner 복원·body 낙하 포함)는 가장 위 모달 안 마지막 요소, 없으면 제목으로
  - 대화상자·알림창·시트 제목과 알림 행동 버튼에 키보드 포커스 ring 윤곽(sonner 스타일은 중요도 표시로 덮음)
  - 휴대폰 모달 중 알림 위 간격 72px(상단 막대 59px 아래)
  - DESIGN.md, 백로그(MG-10 완료, MG-11 추가)
- 창이 열린 동안 행동 알림 시간을 멈추고 닫으면 원래 시간만큼(MG-09) (`5738abb`)
  - 시트·대화상자·알림창이 열린 동안 되돌리기 같은 행동 알림이 사라지지 않게 같은 id로 duration을 무한으로 갱신
  - 닫으면 원래 시간(최소 5초)만큼 다시 흐름, 알림 종류(성공·오류 색·아이콘)를 유지하고 막 닫힌 알림은 되살리지 않음
  - 판정은 toast-position.ts planToastHold(순수 함수)와 테스트, providers.tsx는 toast.getToasts() 활성 목록을 봄
  - DESIGN.md 알림 문단, 백로그(MG-09 완료, MG-10 추가)
- 모달이 열리면 알림을 위로, 시트 제목 키움, 문단 번호 범위 안내(MG-08) (`bb453aa`)
  - 시트·대화상자·알림창이 열린 동안 알림을 위 가운데로(휴대폰은 닫기 버튼 아래 64px), 닫히면 아래로. 비모달 팝업은 불변
  - toast-position.ts에 판정을 두고 테스트, providers.tsx는 MutationObserver 하나로 모달 열림을 봄
  - 공용 시트 제목 16px semibold·text-balance, 성우 패널 큰 제목은 굵게 유지
  - 요약 시트 문단 번호 입력에 '1~N' 범위 안내
  - DESIGN.md 앱 정리 규칙, 백로그(MG-08 완료, MG-09 추가)
- 요약 시트 첫 포커스를 제목으로, 요약 계산을 하나로(MG-07) (`ccced06`)
  - 막대 요약 칩으로 여는 시트가 문단 번호 입력 대신 시트 제목에 첫 포커스를 둬 휴대폰 가상 키보드를 띄우지 않음
  - 3단 요약 레일과 칩·시트의 plan·firstLink 계산을 make-all.ts summaryLinkOf 하나로 묶고 테스트
  - 공용 focus-wrap을 넓히는 안은 대화상자 가운데 탭 순서가 회귀해 되돌림(제목 첫 Shift+Tab은 Base UI 가드)
  - DESIGN.md·백로그(MG-07 완료, MG-08 추가)
- 음성 작업실 2단에서 설정을 붙이고 요약은 막대 칩으로(MG-06) (`a33eaa5`)
  - 2단 오른쪽 열에는 작업 설정만 두고 스크롤해도 붙게(설정이 길면 안에서 스크롤), 작업 요약 aside는 3단에서만 보임
  - 2단에서도 1단의 막대 요약 칩·시트를 써서 요약을 봄. 시트는 md 이상에서 가운데 576px로
  - 멈추거나 막힌 문단이 있으면 칩에 경고 점과 '확인할 문단 있음'(needsCheck, 테스트), 빈 대본이면 칩을 접음
  - DESIGN.md·작업실 브리프·주석 갱신, 남은 지적은 백로그 MG-07
- 음성 작업실 2단에서 작업 설정을 위로(MG-01) (`f8be676`)
  - 2단 오른쪽 열을 작업 설정(위)·작업 요약(아래, sticky)으로 바꿔 위→아래 행 순서를 DOM·Tab 순서와 맞추고 1024 첫 화면에 기본 성우가 보이게 함
  - 3단 배치를 @6xl 값으로 명시하고 2·3단 위치를 테스트로 고정
  - DESIGN.md·작업실 브리프(DN-3 변경)·주석 갱신, 맞바꿈(2단에서 설정 sticky 없음)은 백로그 MG-06

## Docs

- 대화 언어 교훈(사용자에게는 항상 한국어) (`ec76ba4`)

## Maintenance

- pro-kit 템플릿 v0.3.14 반영 (`3d0b2fc`)
  - 러너: 묶음 대비 측정에서 투명 글자(알파×투명도<0.05)를 contrast.hidden으로 따로 세고 실제 글자 실패를 먼저 둔다, 마감 전에 코드 리뷰를 채우고 그 뒤 화면 소스를 고치면 audit이 막는다, 증거 복사 안내에 cp --와 절대 경로
  - 문서: 브라우저 확인·critique B에 뷰포트 명령(agent-browser set viewport W H)과 innerWidth 확인, 코드 리뷰 순서
- pro-kit 템플릿 v0.3.13 반영 (`0abd98d`)
  - 러너: 프로젝트 밖 증거 파일을 거절할 때 tasks/evidence로 복사하는 명령을 알리고, 단계 행 스킬 표기 누락을 한 메시지로 모두 알리며, table --write 안내에 SKILL.md 끝까지 읽기 줄을 더한다
  - 위임 문서의 pnpm -s 예시를 pnpm --silent로
- 외부 스킬 업데이트 (next-dev-loop, next-cache-components-adoption, next-cache-components-optimizer) (`29e9e49`)
  - 본문 문구만 변경(측정은 production 빌드, 개발 서버에서는 브라우저 이동 멈춤으로 셸·대체 화면 확인), 스크립트 변경 없음
  - 배치 그대로
- pro-kit 템플릿 v0.3.12 반영 (`1504fa0`)
  - 문구만 판정: 설정 JSON·*.config.*는 문구로 보지 않음(JSON은 messages·locales·i18n·lang 아래만)
  - 이어 세기 가드: SessionStart에도 compact-log, 세션 시작이 settings.json 뒤일 때만 앞선 스킬 읽기를 이음
  - scripts/dev-cycle.mjs, prokit-dev-cycle 위임·실행 효율 문서를 템플릿 판으로(바이트 일치), .claude/settings.json SessionStart 훅 그룹 추가
- pro-kit 템플릿 v0.3.11 반영 (`c0f0aa8`)
  - 실사용 라운드 피드백 판: 압축 없는 이어 쓰기 기록 인정, 문구만 라운드 분기, supervise 끝난 에이전트 오탐 제거, get_errors 해당 없음 구분
  - scripts/dev-cycle.mjs, prokit-dev-cycle 위임·실행 효율, prokit-ui impeccable 지도, prokit-reviewer 정의를 템플릿 판으로(바이트 일치)
  - .claude/settings.json에 PreCompact 훅(dev-cycle compact-log), agents:sync
  - tasks/lessons.md: 라운드를 넘긴 이어 쓰기·훅 바뀐 뒤 새 세션·데모 환경 확인
- pro-kit 템플릿 v0.3.10 반영 (`27791e7`)
  - 프로젝트가 고치지 않은 20개 파일을 템플릿 판으로 교체(dev-cycle.mjs·delegation.mjs, prokit-dev-cycle·prokit-ui·prokit-verify 스킬, 에이전트 정의 7개, CLAUDE.md, docs/dev-workflow.md)
  - prokit-ui 참고 문서 build-floor.md·ui-sdk.md 추가, agents:sync로 .codex·.agents 에이전트 갱신
  - AGENTS.md: 리뷰어 두 줄 합침, ui-sdk 행에 ADR 0014가 새 ui-sdk 지도보다 앞선다는 문장
  - skills.manifest.json: performers에 ui-sdk(prokit-ui-builder, prokit-reviewer)
