# v0.1.4 — CLI and full audit fixes

- 날짜: 2026-11-24 10:00 (KST)
- 이전 버전: v0.1.3
- 전체 변경: https://github.com/roadkwonai/omni-ai-tts/compare/v0.1.3...v0.1.4

## Features

- CLI 내 보이스·보관함 조건·드라마 쉼과 기능 대조(T21) (`e711d6f`)
- CLI 문단 묶음·결합·자동 태그·숫자 검수와 드라마 제작(T20) (`538df54`)
- CLI 캐스팅·시험 생성·보관함·채널·프리셋·대본 관리(T19) (`f66ac3e`)
  - providers status, casting search·accents·refresh·sample, trial generate·list·download·resume·remove
  - voices show·check·save·update·remove, channels·categories·types, presets, scripts 명령(지우기는 확인 또는 --yes)
  - 유료 흐름을 paid.ts로 모아 작업실·시험 생성 공용, 시험 생성은 서버 완료를 확인한 뒤에만 요청 기록 해제
  - 서버 읽기 전용 조회 trialRequest(세션 소유자·종류·미만료), 격리 테스트
  - 검색한 성우를 설정 폴더에 24시간·500명까지 두어 REF로 사용, 대본 왕복 불변과 판 충돌·설정 손실 확인
  - 실제 기본 샘플 4곳 확인, 실제 시험 생성·배포 작업실·Linux는 미검증
- CLI로 저장 성우·프리셋 음성 생성과 내려받기(T18) (`3c3c8d6`)
  - omni-tts presets list, studio generate·download·resume(대본 파일·stdin, 유료 확인·--yes, --dry-run, --new, --json)
  - 같은 조합의 저장 결과 재사용, 요청 UUID 선점과 재조회로 두 프로세스·응답 유실에도 합성 1회, 자동 재시도 없음
  - 서버 읽기 전용 조회 studioInfo·studioRequest(세션 소유자·작업실·미만료), 격리 테스트
  - requestOf 등 설정 보정을 trial-options로 옮겨 웹과 CLI가 함께 쓴다(동작 변화 없음)
  - 조각 길이·형식 확인 뒤 게시, 기존 파일 보존, 출력 파일 0600, 미룬 지적 T18-01~03 참고 기록
  - 실제 Fish Audio 무료 생성 1회 확인, 프리셋 생성과 다른 공급자·배포 작업실은 미검증
- CLI 로그인과 성우 보관함 조회(T17) (`ae0a22d`)
  - apps/cli omni-tts: auth login/status/logout, voices list(공급자·채널·즐겨찾기·자주 사용 필터, --json)
  - 기존 Better Auth HTTP와 보호 프로시저 재사용, 세션 파일 0600·잠금·늦은 갱신 폐기, 교차 origin·데모 거절
  - 배포 작업실 로그인은 미검증

## Fixes

- 전체 검수로 찾은 데이터 유실·과금·숫자 읽기 결함 보완 (`e683b4d`)
  - DB가 잠깐 멈춘 뒤 성공으로 답한 저장이 사라지고 연결이 부족해지던 문제를 고침
  - 무료 모델이 끝난 뒤에도 무료로 만든 문단과 드라마 줄을 찾아 다시 쓰게 함
  - 오프라인에서 누른 유료·상태 변경 요청이 재연결 때 저절로 나가지 않게 함
  - 같은 대본을 다시 열거나 오래된 목록에서 고칠 때 저장한 글과 채널·분류 연결이 지워지던 길을 막음
  - 3천5백만 원, 2배, 1번째, 통화 기호 뒤 수의 읽기를 바로잡고 한 수인지 모를 때는 확인을 받음
  - 200 응답이 비었거나 오디오가 아니면 완료로 저장하지 않음
  - 성우 이용 가능 확인이 한 공급자에 막히지 않게 하고 대본 목록을 더 빠르게 읽음
  - CLI의 종료 코드, 끊긴 출력, exFAT 저장, 로그인 안내를 바로잡음
  - 내 보이스, 캐스팅, 보관함, 드라마의 잠금·안내·포커스와 30일 보관 안내를 보완
  - 쓰지 않는 UI 부품과 이미지를 지우고 내 보이스 화면의 코드를 줄임

## Docs

- 백로그 정리(P1·P2·버그·보안만 남기고 나머지는 참고 기록으로) (`01bdf36`)
  - 작은 지적·관찰·테스트 빈칸 208건을 docs/backlog-notes.md로 옮기고 기록 기준을 적었다
  - 로드맵 완료 기록을 근거로 P0 기능 14개를 체크했다(항목마다 코드 대조는 하지 않음)
- Omni AI TTS CLI 계획 확정 (`d3238e0`)
- GitHub 인증 계정 지침 추가 (`778f1e7`)

## Maintenance

- 개발 도구 pstack을 프로젝트 범위로 추가 (`51ed7d0`)
