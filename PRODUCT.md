# Omni AI TTS

<!-- impeccable:product-schema 1 -->

표시 이름은 Omni AI TTS다(2026-11-18 사용자, 이전 이름 TTS Pilot. 코드 식별자 `tts-pilot-app`은 그대로). 밖에 공개하는 곳은 공개 데모(`omni-ai-tts.vercel.app`, 로그인 없이 예시 데이터로 써 보는 작업실, 매일 초기화, 공급자를 부르지 않고 데모 샘플을 돌려줌)뿐이고, 그 첫 화면 `/`가 포트폴리오 방문자에게 서비스를 소개하는 랜딩이다. 주 행동은 '데모 작업실 열기'(`/studio?example=1`)다. 소유자의 본인용 작업실은 별도 주소이고 외부에 알리지 않는다(T15-a2, ADR 0015). 로고는 물결 링 안 막대 다섯(공급자 다섯), 마스코트는 헤드폰을 쓴 마이크 캐릭터다([랜딩 브리프](docs/briefs/landing.md)).

## Platform

web

## Users

초기에는 본인 한 명이 사용하는 개인 작업실이다. 여러 콘텐츠 채널에 맞는 성우·대본·프리셋을 모으고 한국어 음성을 반복 제작한다. 공개 가입 서비스는 핵심 기능 개발과 테스트를 마친 뒤 별도로 확장한다. 2026-09-26 사용자 답변으로 확정했다.

## Product Purpose

Typecast·ElevenLabs·Fish Audio·Airy·Gemini의 성우를 미리 듣고 용도별로 정리하며, 저장 대본의 숫자 발음을 검수한 뒤 음성을 생성·다운로드한다. 본인 음성으로 간편 클론 보이스를 만들어 같은 작업에 사용한다.

## Operating Context

채널/프리셋 선택 → 성우 선택 → 대본 작성/불러오기 → 숫자 교정 검수 → 생성 → 청취/다운로드. 자주 쓰는 성우와 대본을 다시 찾는 시간을 줄이는 것이 목표다.

## Capabilities and Constraints

- 초기 필수: 양사 성우 탐색·샘플 청취, 즐겨찾기와 카테고리/타입/채널/프리셋 분류, 대본 보관, 숫자 한글 교정, 음성 생성과 다운로드, 내 보이스 클론.
- 초기 제외: 공개 가입, 사용자별 결제·크레딧 판매, 팀·조직·초대·관리자 대시보드. 후속 TODO로 유지한다.
- 소유자 인증과 데이터의 userId, 공급자+voiceId 식별 경계는 유지한다. 조직/tenant 계층이나 일반화된 권한 체계는 선행 개발하지 않는다.
- 공급자 키는 서버 환경변수에서 관리한다. 키 입력 웹 UI와 사용자별 BYOK는 후속이다.
- 기존 Next.js/BTS 구조를 유지한다. 먼저 HTML/CSS/JS로 UI/UX를 구체화한 뒤 이를 참고해 앱을 구현한다. HTML 프로토타입은 서비스의 실 API 구현을 뜻하지 않는다.
- 오디오 영구 보관소·보존 기간은 미확정이다. 초기 실제 서비스의 최소 보장은 세션 내 재생·다운로드다.

## Brand Commitments

`DESIGN.md`의 시각 언어(2026-10-03 리디자인: getdesign.kr 채널톡 항목, 대표 색 청록 `oklch(0.51 0.085 200)`)와 Pretendard를 사용한다. 제목과 본문 모두 기존 로컬 Pretendard Variable 자산을 쓴다. 화면의 주인공은 대본 텍스트와 그 낭독이고, 돈이 드는 동작에는 앱 전체에서 같은 표식 하나를 쓴다. UI 작업은 bts-ui → impeccable 절차를 따른다. 제품의 표시 이름은 Omni AI TTS다(이전 작업명 TTS Pilot은 저장소 이름 `tts-pilot-app`에 남는다).

## Evidence on Hand

- `docs/research/tts-references.md`: 기존 참고 조사와 API 계약.
- `docs/research/tts-video-detailed.md`: 지정 영상 구간 심층 조사.
- `docs/research/tts-service-comparison.md`: Typecast·Vrew·ElevenLabs 비교.
- `docs/research/gowith-ux-review.md`: 공개 가이드·UI 이미지와 접근 범위.
- 공급자 가격·성우 수·성공률·상업 이용 권한을 우리 제품의 보장으로 사용하지 않는다.

## Product Principles

1. 반복 제작에 필요한 조작을 먼저 완성한다.
2. 원문과 발음용 대본을 구분하고 수정 선택권을 남긴다.
3. 샘플 청취와 과금될 수 있는 생성 요청을 구분한다.
4. 제공사별 기능 차이를 숨기지 않는다.
5. 개인용 완성 후 공개 서비스 확장을 검토한다.
