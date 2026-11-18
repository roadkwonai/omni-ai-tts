# 랜딩의 탭·펼침·메뉴 동작에 UI SDK(베타)를 쓴다

- 상태: 채택(사용자 2026-11-18, T15-a 확장).

공개 랜딩(`/`)의 기능 투어 탭, FAQ 펼침, 휴대폰 메뉴 패널은 `@ui-sdk/react`·`@ui-sdk/core`(vercel-labs/ui, Apache-2.0, `0.1.0-beta.7`)의 `Tabs`·`Accordion`·`Dialog` 동작으로 만든다. 키보드 이동, 포커스 가두기와 복귀, ARIA 상태를 라이브러리가 맡고, 모양은 `packages/ui` 토큰으로 그린다. 사용자가 패키지까지 설치하기로 정했다(스킬만 쓰는 안 대신).

앱 화면(로그인 뒤)은 지금처럼 `packages/ui`의 shadcn(Radix) 부품을 쓴다. 두 라이브러리가 섞이는 범위는 랜딩 컴포넌트(`apps/web/src/components/landing/`)뿐이다.

## 고려한 대안
- 스킬만 설치하고 shadcn 부품(Tabs·Accordion·Sheet)으로 같은 동작을 만든다: 새 의존이 없지만 사용자가 패키지 사용을 골랐다.
- 직접 만든다: 포커스·ARIA를 손으로 맞춰야 해 위험하다.

## 결과
- 베타라 판을 고정하고(`0.1.0-beta.7`), 올릴 때 랜딩의 키보드·포커스 동작을 다시 확인한다.
- `globals.css`에 `@layer ui-sdk;`를 선언해 라이브러리 기본 스타일이 토큰보다 앞서지 않게 한다.
