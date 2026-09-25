---
name: bts-ui
description: >-
  이 BTS 프로젝트의 화면 모양과 사용자 경험을 기획하고 설계하고 구현하고 리뷰할 때 사용한다. 새 화면과
  페이지 디자인, 리디자인, 레이아웃, 타이포, 색, 간격, 빈 상태와 온보딩, UX 문구, 반응형, 접근성,
  디자인 리뷰와 폴리시, 디자인 토큰과 DESIGN.md를 다룬다. 화면 만들어줘, 디자인, 예쁘게, UI 개선,
  UX, 디자인 리뷰, 접근성 점검, polish 같은 요청에 사용하며 impeccable을 주력으로 쓴다. 데이터
  패칭, 라우팅, 렌더링 경계 같은 동작 문제는 bts-web이 맡는다.
---

# UI/UX: impeccable 중심

정본은 `PRODUCT.md`(제품 맥락)와 `DESIGN.md`(시각 시스템)다. 토큰은 `packages/ui/src/styles/globals.css`, 컴포넌트는 `packages/ui/src/components`(shadcn)에 있다.

## 시작할 때마다
프로젝트 루트에서 `.agents/skills/impeccable/scripts/impeccable context`를 한 번 실행한다(Windows에서 `sh`가 없으면 `impeccable.cmd`). 대상이 정해져 있으면 `--target <경로>`를 붙인다. 출력의 지시를 따른다. 실행이 실패하면 `PRODUCT.md`와 `DESIGN.md`를 직접 읽고 없는 내용을 지어내지 않는다.

그다음 요청이 어느 쪽인지 정한다. 이 판정이 코드를 언제 쓸 수 있는지를 정한다.
- **새 작업**: 새 화면, 새 흐름, "새로 디자인", 리디자인, 화면 전체의 모양을 바꾸는 요청. 내용이 거의 없는 BTS 기본 화면을 제품 화면으로 채우거나 다시 구성하는 요청도 새 작업이다.
- **좁은 개선**: 기존 화면(BTS 기본 화면 포함)의 구성은 그대로 두고 간격, 문구, 상태 하나, 카드나 컴포넌트 하나를 고치거나 더하는 요청. 판단 기준은 요청의 범위이지 화면이 얼마나 비어 있는지가 아니다. 새 영역·섹션을 만들거나 카드·컴포넌트를 둘 이상 더하면 새 작업이다. 애매하면 새 작업으로 본다. 좁은 개선은 `PRODUCT.md`가 없어도 init 없이 진행한다. context 출력의 `SCOPED_EXISTING_ALLOWED`는 이 경우에만 해당한다.

새 작업이면 코드보다 먼저 두 가지를 한다.
1. `PRODUCT.md`가 없으면(context가 `BUILD_INIT_REQUIRED`나 `PRODUCT_INIT_REQUIRED`처럼 init을 요구하면) `init`부터 한다. init은 사용자 인터뷰이므로 질문을 사용자에게 보낸다.
2. `shape <기능>`으로 브리프를 `docs/briefs/<화면>.md`에 쓰고 사용자 확인을 요청한다.

이번 턴의 결과물은 init 질문과 브리프다. 여기서 멈춘다. 사용자 답을 받기 전에는 `PRODUCT.md`를 만들지 않는다. 추정으로 채운 `PRODUCT.md`가 있으면 impeccable이 init을 끝난 것으로 보고 다음 세션에서 인터뷰를 건너뛴다. 사용자에게 물을 수 없는 환경이어도 가정으로 코드를 쓰지 않는다. 질문과 브리프 초안을 남기고 멈추는 것이 올바른 결과다.

## 단계
| 단계 | 할 일 | impeccable |
|---|---|---|
| 기획 (프로젝트당 1회) | 새 작업을 시작할 때 `PRODUCT.md`가 없으면 먼저 만든다(좁은 개선은 init 없이 진행) | `init` |
| 시각 방향 (1회, 리디자인 때 다시) | 첫 새 작업에서 시각 세계를 정하고, 만든 화면을 바탕으로 마감 때 `DESIGN.md`를 기록한다. 시작 전에 `DESIGN.md`를 먼저 만들지 않는다. BTS 기본 shadcn 룩은 출발점일 뿐 정체성이 아니다 | new-work → 마감에서 `document` |
| 설계 (새 화면과 흐름마다) | 코드 없이 브리프를 만들고 사용자 확인을 받는다 | `shape <기능>` |
| 개발 | 편집 직전에 impeccable의 `reference/craft-floor.md`를 읽는다. 브리프에 따라 필요할 때만 `layout`, `typeset`, `clarify`, `harden`, `onboard`, `adapt` | new-work |
| 리뷰 | 메인 세션에서 실행한다. 서브에이전트 안에서 실행하지 않는다. `web-design-guidelines` 스킬로 코드도 검사해 결과를 별도 절로 보고한다 | `critique`, `audit` + `web-design-guidelines` |
| 마감 | 수정을 한 번에 모아 적용하고 재확인은 1회만 한다 | `polish` |
| 정본 갱신 | 토큰이나 컴포넌트가 바뀌었을 때. 덮어쓰기 전에 사용자에게 묻는다 | `document` |

단계별 상세, B 케이스 행별 증거 예시, 통과 기준은 [references/impeccable-map.md](references/impeccable-map.md).

## 규칙
- 새 작업은 `shape` 브리프가 확정되기 전에 코드를 쓰지 않는다. 좁은 개선만 브리프 없이 진행하고, 대조표에 `N/A: 좁은 개선(버튼 간격)`처럼 적는다.
- 리뷰만 요청받으면 코드를 고치지 않는다. 보고에는 critique 점수와 P0~P3, audit 총점과 접근성 점수, `web-design-guidelines` 위반(`file:line`)을 넣는다. 독립 평가자를 띄울 수 없는 환경이면 축소 모드로 했다고 밝힌다.
- 색, 간격, 반경, 그림자는 토큰으로만 쓴다. 원시 hex 값이나 임의 Tailwind 값(`bg-[#123456]`, `mt-[13px]`)을 새로 넣지 않는다.
- shadcn 프리미티브는 `packages/ui`의 것을 쓴다. 새 컴포넌트가 필요하면 `shadcn` 스킬 절차로 `packages/ui`에 추가한다.
- 통과 기준: critique의 P0와 P1은 해결하거나 사유를 적고 보류한다. audit 총점은 `.dev-cycle.json`의 `ui.auditMin`(기본 16/20) 이상, 접근성 점수는 `ui.a11yMin`(기본 3/4) 이상이다.
- 편집 중 자동 검사: 개발자마다 한 번 `hooks on`을 실행하면(Codex `$impeccable hooks on`, Claude Code는 `impeccable` 스킬 인자 `hooks on`) UI 파일을 고칠 때마다 detector가 결과를 알려 준다. Codex에서는 `/hooks`에서 신뢰를 확인한다.
- 데이터 상태(loading, empty, error, 비인가)의 모양과 문구는 `bts-web`과 함께 설계한다.
