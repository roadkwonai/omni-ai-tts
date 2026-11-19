# v0.1.1 — Landing theme toggle

- 날짜: 2026-11-19 09:56 (KST)
- 이전 버전: v0.1.0
- 전체 변경: https://github.com/freelife1191/omni-ai-tts/compare/v0.1.0...v0.1.1

## Features

- 소개 페이지 막대에 테마 바꾸기 버튼 (`3fccbf4`)
  - 앱 메뉴와 같은 ModeToggle(시스템→라이트→다크 한 버튼)을 막대 오른쪽에 둔다. 휴대폰에서도 메뉴 버튼 앞에 보인다
  - ModeToggle에 선택 prop tooltipSide(기본 top, 화면 맨 위 막대는 bottom)
  - DESIGN.md 소개 페이지 절, 백로그 T15-15·T15-16

## Maintenance

- 외부 스킬 업데이트 (impeccable, neon, ui-sdk 외 4개) (`c7a218e`)
  - impeccable 4.9.2 → 4.10.0(바이너리 0.1.27, 원격 스크립트 diff 검토 뒤 설치)
  - neon, ui-sdk, using-agent-skills, spec-driven-development, code-review-and-quality, ci-cd-and-automation 문구 갱신
  - 에이전트 배치 그대로
  - 백로그 T15-09(비밀값 교체) 취소 표시
