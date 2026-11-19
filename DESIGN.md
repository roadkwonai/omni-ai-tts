---
name: Omni AI TTS
category: developer
lang: ko
colors:
  primary: oklch(0.51 0.085 200)   # Omni AI TTS 대표 색(청록) = brand-500. shadcn --primary로 옮기는 값
  ## Omni AI TTS 대표 색 (제품 조정, 2026-10-03. 카탈로그 원문 값이 아니다)
  brand-300: oklch(0.84 0.09 198)   # 다크 hover, 다크 틴트 위 글자
  brand-350: oklch(0.78 0.105 198)   # 다크 1차 액션 채움(짙은 글자 8.8:1)
  brand-500: oklch(0.51 0.085 200)   # 라이트 1차 액션 채움과 글자(흰 바탕 5.5:1)
  brand-600: oklch(0.46 0.076 201)   # 라이트 hover
  ## Omni AI TTS 상태색과 불투명 옅은 바탕 (2026-10-04, T2 빌드. globals.css 정본, 다크는 각 주석)
  success: oklch(0.5 0.1 155)   # 상태 글자·아이콘, 흰 바탕 5.71:1. 다크는 green-300
  warning: oklch(0.52 0.12 50)   # 흰 바탕 5.76:1. 다크는 orange-300
  success-subtle: oklch(0.94 0.025 160)   # success 글자 4.83:1. 다크 oklch(0.32 0.045 150), 5.58:1
  warning-subtle: oklch(0.945 0.03 60)   # warning 글자 4.88:1. 다크 oklch(0.33 0.05 58), 5.63:1
  primary-subtle: oklch(0.945 0.016 200)   # 요약 띠·활성 메뉴(= sidebar-accent), primary 글자 4.73:1. 다크 oklch(0.31 0.035 198), 6.75:1
  ## Omni AI TTS 화자 색 (2026-10-22, T9.5 드라마 작업실. globals.css 정본, 다크는 각 주석)
  speaker-1: oklch(0.46 0.15 262)   # 파랑. 번호 7.31:1, 카드 7.31:1. 다크 oklch(0.68 0.13 262), 5.78 / 5.33
  speaker-1-subtle: oklch(0.95 0.02 262)   # 파랑 칩 바탕, foreground 글자 13.46:1. 다크 oklch(0.32 0.05 262), 10.62:1
  speaker-1-on: oklch(1 0 0)   # 파랑 위 번호. 다크 oklch(0.232 0.006 286)
  speaker-2: oklch(0.6 0.12 95)   # 금색. 번호 4.72:1, 카드 3.94:1. 다크 oklch(0.84 0.12 95), 10.33 / 9.52
  speaker-2-subtle: oklch(0.955 0.035 95)   # 금색 칩 바탕, foreground 글자 13.64:1. 다크 oklch(0.32 0.04 95), 10.58:1
  speaker-2-on: oklch(0 0 0 / 0.85)   # 금색 위 번호. 다크 oklch(0.232 0.006 286)
  speaker-3: oklch(0.54 0.19 345)   # 자주. 번호 5.63:1, 카드 5.63:1. 다크 oklch(0.74 0.14 345), 6.83 / 6.29
  speaker-3-subtle: oklch(0.95 0.025 345)   # 자주 칩 바탕, foreground 글자 13.36:1. 다크 oklch(0.32 0.05 345), 10.82:1
  speaker-3-on: oklch(1 0 0)   # 자주 위 번호. 다크 oklch(0.232 0.006 286)
  speaker-4: oklch(0.56 0.19 305)   # 보라. 번호 5.10:1, 카드 5.10:1. 다크 oklch(0.8 0.11 305), 8.68 / 8.00
  speaker-4-subtle: oklch(0.955 0.025 305)   # 보라 칩 바탕, foreground 글자 13.55:1. 다크 oklch(0.32 0.055 305), 10.79:1
  speaker-4-on: oklch(1 0 0)   # 보라 위 번호. 다크 oklch(0.232 0.006 286)
  ## Accent global hues
  # Blue — 원문의 1차 액션 (indigo-violet)
  blue-300: oklch(0.665 0.181 280)
  blue-400: oklch(0.554 0.214 280)   # 원문의 1차 액션 색. Omni AI TTS은 brand를 쓴다
  blue-500: oklch(0.483 0.229 280)
  # Green — 성공 / 폼 선택 상태 (체크박스·라디오·스위치·슬라이더)
  green-300: oklch(0.732 0.157 150)
  green-400: oklch(0.652 0.168 150)
  green-500: oklch(0.562 0.100 160)
  # Red — 에러 / 위험
  red-300: oklch(0.690 0.172 23)
  red-400: oklch(0.634 0.177 20)
  red-500: oklch(0.541 0.166 21)
  # Orange — 경고 (인풋 invalid box-shadow)
  orange-300: oklch(0.764 0.148 58)
  orange-400: oklch(0.698 0.156 55)
  orange-500: oklch(0.600 0.146 54)
  # Cobalt — 정보 강조 (highlight)
  cobalt-300: oklch(0.724 0.125 245)
  cobalt-400: oklch(0.643 0.150 248)
  cobalt-500: oklch(0.570 0.156 257)
  # 단일 코어 액센트 (주로 400; tag·상태 칩용 300 일부)
  purple-400: oklch(0.591 0.208 297)
  pink-400: oklch(0.637 0.208 339)
  navy-400: oklch(0.469 0.147 273)
  yellow-300: oklch(0.824 0.160 88)
  yellow-400: oklch(0.789 0.161 82)
  olive-300: oklch(0.784 0.167 115)
  olive-400: oklch(0.730 0.160 113)
  teal-400: oklch(0.690 0.118 191)
  ## Neutral global
  grey-25: oklch(0.995 0.003 286)
  grey-50: oklch(0.988 0 286)
  grey-100: oklch(0.976 0.001 286)
  grey-200: oklch(0.952 0.001 286)
  grey-300: oklch(0.913 0.003 286)
  grey-400: oklch(0.855 0.003 286)
  grey-500: oklch(0.729 0.004 286)
  grey-600: oklch(0.578 0.008 286)
  grey-700: oklch(0.354 0.007 286)
  grey-800: oklch(0.283 0.007 286)
  grey-850: oklch(0.261 0.004 286)
  grey-900: oklch(0.232 0.006 286)   # 다크 표면 기본 (beta는 더 짙은 grey-950까지 발행한다)
  # 텍스트·보더·딤은 고정 grey가 아니라 alpha-black 위계로 쌓는다 (Bezier 시그니처)
  black-100: oklch(0 0 0)
  black-85: oklch(0 0 0 / 0.85)   # text-neutral (본문 기본)
  black-60: oklch(0 0 0 / 0.60)   # text-neutral-light
  black-40: oklch(0 0 0 / 0.40)   # text-neutral-lighter / icon-neutral
  black-8: oklch(0 0 0 / 0.08)   # border-neutral
  white-100: oklch(1 0 0)
  white-90: oklch(1 0 0 / 0.90)
  white-12: oklch(1 0 0 / 0.12)   # 다크 표면 위 보더
typography:
  # size — 토큰명 숫자 = px (핸드오프 colors_and_type.css는 `--font-size-11:11px`로 표기).
  # 아래 rem은 1rem=10px 루트 가정의 동치값(예: font-size-11 = 11px = 1.1rem@10px-root).
  font-size-11:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.1rem
  font-size-12:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.2rem
  font-size-13:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.3rem
  font-size-14:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.4rem
  font-size-15:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.5rem
  font-size-16:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.6rem
  font-size-17:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.7rem
  font-size-18:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 1.8rem
  font-size-22:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 2.2rem
  font-size-24:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 2.4rem
  font-size-30:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 3.0rem
  font-size-36:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: 3.6rem
spacing:
  # 관찰된 4px 그리드 케이던스 (Storybook 예시 직접 사용값)
  spacing-4: 4px
  spacing-6: 6px
  spacing-10: 10px
  spacing-16: 16px
  spacing-32: 32px
  z-index-base: 0px
  z-index-floating: 1px
  z-index-overlay: 1000px
  z-index-modal: 1100px
  z-index-toast: 1200px
  z-index-tooltip: 1300px
  z-index-important: 2000px
rounded:
  radius-2: 2px
  radius-3: 3px   # 프로그레스바 / 슬라이더 트랙
  radius-4: 4px
  radius-6: 6px
  radius-8: 8px   # 인풋 / 버튼 (주력)
  radius-12: 12px   # 배너 / 토스트 / 리스트아이템 (주력)
  radius-16: 16px
  radius-20: 20px   # 모달
  radius-32: 32px
  radius-44: 44px
---

> 출처: getdesign.kr 채널톡 항목 https://www.getdesign.kr/services/bezier/DESIGN.md (2026-10-03 받음). Omni AI TTS 조정은 대표 색(청록 brand), 서체(Pretendard), 아이콘(lucide) 셋이고 각 절의 "Omni AI TTS" 하위 절에 적었다. 원문 브랜드와 디자인 시스템 이름은 화면에 쓰지 않는다.

# Omni AI TTS — design.md

> 채널톡을 만드는 (주)채널코퍼레이션의 오픈소스 React 디자인 시스템. 컴포넌트 라이브러리 + 디자인 토큰 + 아이콘 세트를 한 모노레포로 배포하며, 핵심 패키지는 `@channel.io/bezier-react`·`@channel.io/bezier-tokens`(0.6.0)·`@channel.io/bezier-icons`(0.60.0)이다 [src:1][src:3][src:4]. 본 문서는 사용자가 제공한 Claude Design 핸드오프 번들을 1차 출처로 추출·정리해 합성한 결과다 — 번들은 비공개이므로, 아래 정량 주장은 2026-07-29에 공개 배포물(`@channel.io/bezier-tokens` 0.6.0 · `@channel.io/bezier-icons` 0.60.0 · Storybook 인덱스 [src:5])과 전수 대조했다. 색 토큰 43개는 전부 ΔE ≤ 0.02로 일치했고, 컴포넌트 59개 이름도 Storybook 문서와 1:1로 대응했다.

## Brand & Style

Bezier는 채널톡의 사내 제품 UI를 외부에 그대로 공개한 드문 한국발 풀 디자인 시스템이다 — 라이선스는 Apache-2.0(© Channel Corp.)이며, 컴포넌트 59 + foundation 3 + utility(ReadMe·Changelog) 2 = 64 docs, 아이콘 602 SVG(0.60.0 기준), 빌드 CSS 변수 450개 규모다 [src:1][src:3][src:4][src:5]. 이 수치는 실측이다 — Storybook 인덱스의 docs 엔트리 64개가 `components` 59 + `foundation`/`alpha-foundation` 3 + `ReadMe`/`Changelog` 2로 정확히 갈리고, `@channel.io/bezier-tokens` 0.6.0의 기본 엔트리 CSS가 변수 450개를 발행한다 [src:3][src:5]. (핸드오프 번들이 세던 "토큰 JSON 39종"은 공개 배포물로 재현되지 않아 뺐다 — npm 패키지는 JSON을 1개만 싣고 토큰을 CSS·SCSS·JS로 발행한다. 39는 beta tier의 `--dimension-*` 변수 개수와는 일치하나 같은 대상을 세었다는 근거가 없다.) 토큰을 별도 패키지로 떼어내 라이트·다크 멀티 테마를 1급으로 다루는 성숙한 시스템이다 [src:1].

전반 인상은 밝고 깨끗한 SaaS 톤에 강채도 액센트가 얹히는 구조다 [src:3]. 중립 표면은 거의 순수한 그레이/화이트(`{colors.grey-50}` ~ `{colors.grey-100}`)이고, 그 위에 채도 높은 단일 액센트(블루/그린/레드 등)가 포인트로 올라간다 [src:3]. 형태 언어는 둥글고 부드럽다 — 버튼·인풋·배너·토스트 모서리가 `{rounded.radius-8}`~`{rounded.radius-12}`로 크게 말려 있고, 단순 `border-radius`를 넘어 iOS식 연속 곡률(squircle)을 위한 전용 컴포넌트 `{component.smooth-corners-box}`까지 두는, 부드러운 코너에 공들이는 브랜드다 [src:2][src:3].

라이트·다크 양 테마를 동등하게 그린다 — 모든 컴포넌트 autodocs가 같은 variant를 흰 배경(라이트)과 짙은 `{colors.grey-900}` 패널(다크)에 나란히 보여주며, 다크는 후처리가 아니라 시맨틱 토큰으로 1급 지원된다 [src:2]. 밀도는 중간(comfortable)이다 — 폼 필드 기본 사이즈가 `m`이고 `xl/l/m/xs` 4단계로 조절되며, 인터랙션은 빠른 150ms 트랜지션(`cubic-bezier(0.3,0,0,1)`)으로 가볍게 처리된다 [src:3].

대상 사용자는 둘로 갈린다. 채널톡 내부 개발팀에게는 한국어 설명이 섞인 컴포넌트 docs를, 오픈소스로 공개된 외부 사용자에게는 영어 API 레퍼런스를 제공해 이중 언어로 운영된다 [src:1]. 본 카탈로그 메타 문서는 평서체(~다)로 기술하며, Bezier가 채널톡 제품 UI에서 쓰는 카피 톤과는 분리한다.

카테고리는 `developer`(디자인 시스템/개발자 도구)로 분류하되, 시각 언어만 참조하고 채널톡의 B2B 메시징 도메인 개념·플로우는 자기 제품에 맞게 번안하는 것이 번들의 명시적 사용 지침이다 [src:1].

## Colors

> **대조 결과(2026-07-29).** 이 절의 색 토큰 43개를 published `@channel.io/bezier-tokens` 0.6.0의 `dist/beta/css/styles.css`와 전수 비교했고 **43개 전부 ΔE ≤ 0.02**로 일치했다 — 비공개 번들에서 나온 값이지만 공개 배포물로 재현된다 [src:3]. 다만 **tier를 구분해 읽어야 한다**: 이 절의 색은 beta tier이고, 아래 Typography·Rounded·Spacing 절의 값은 기본(stable) tier다. 같은 토큰 이름이 tier마다 다른 값을 가진다 — `grey-900`이 stable에서는 `#242428` ≈ `oklch(0.262 0.007 286)`, beta에서는 `#1d1d20` ≈ `oklch(0.232 0.006 286)`이다. beta에는 stable에 없는 `grey-25/300/400/600/650/750/950`이 있고, 반대로 `radius-44`·`radius-42-p`는 stable에만 있다.

Bezier는 글로벌 원시값 → 시맨틱(라이트/다크) → 컴포넌트 3계층 토큰 구조다 [src:3][src:2]. 글로벌은 원시 색값이고, 시맨틱(`--bg-*`, `--txt-*`, `--color-*`)은 테마별로 다른 글로벌을 참조한다 [src:2]. 특징은 navy·purple·pink·red·orange·yellow·olive·green·teal·cobalt·blue 11개 hue를 각각 300/400/500 명도 + 알파 변형으로 갖춘 무지개 액센트 팔레트다 [src:3][src:4].

아래 값은 핸드오프 번들 `colors_and_type.css`가 정답으로 삼은 Bezier **beta 토큰 팔레트**를 ko-design-md 표준 OKLCH로 변환한 것이다 — 1차 액션은 indigo-violet 계열 `blue-400`이고, 원본이 hex로 발행돼 OKLCH 변환에 미세한 오차가 있을 수 있다 [src:3].

### Accent global hues (300/400/500 core)

액센트는 한 hue가 **연·진 한 쌍**으로 작동한다 — **20% 틴트를 배경 fill**(`fill-accent-blue` = `blue-400`의 20% 알파)로, **솔리드 hue를 텍스트·아이콘**(`text/icon-accent-*`)으로 쓴다. 그래서 배너·태그·상태 칩이 "연한 틴트 위 진한 동색 글자/아이콘"으로 읽힌다.

### Semantic (라이트/다크 분리)

시맨틱 토큰은 같은 이름이 테마별로 다른 글로벌을 참조한다 [src:3][src:2]:

- **표면**: `bg-white-normal`은 라이트에서 `{colors.white-100}` ↔ 다크에서 `{colors.grey-900}`. 라운지/헤더/네비 전용 표면(`bg-lounge`, `bg-header`, `bg-gnb`)도 테마별로 분기한다 [src:3].
- **텍스트**: `txt-black-darkest`은 라이트에서 `{colors.black-85}` ↔ 다크에서 `white-80`. `txt-black-darker`, `txt-black-dark` 식으로 같은 시맨틱 이름이 테마별 다른 원시값을 참조한다 [src:3].
- **컴포넌트 토큰**: `--color-fill-*`, `--color-text-*`, `--color-icon-*`, `--color-border-*`, `--color-surface-*`, `--color-state-action-light`, `--color-dim-absolute-black` 네임스페이스로 노출된다 [src:2].
- foundation `color.mdx`는 토큰을 Global → Light → Dark 3섹션 스와치로 문서화하며, 라이트는 흰 패널·다크는 짙은 `--color-surface` 패널에 렌더해 양 테마 동시 검수를 전제한다 [src:2].

별도 `@channel.io/bezier-tokens/alpha` 엔트리가 `--alpha-color-fg-*`·`--alpha-color-bg-*`·`--alpha-color-surface-*` 네임스페이스를 제공해, 오버레이·딤·반투명 표면 전용 알파 채널 토큰 세트를 분리해 둔다.

### Omni AI TTS 대표 색 (제품 조정)

1차 액션, 포커스 링, 활성 메뉴, 링크는 원문의 인디고 대신 청록 `{colors.primary}`(= `{colors.brand-500}`)를 쓴다. 2026-10-03 리디자인에서 사용자가 "어울리는 색상으로 잘 기획 설계해서 진행해줘"라고 맡겨 정했다. 원문 값이 아니라 Omni AI TTS의 값이다.

- 원문 인디고는 원래 브랜드 색이고 옛 파랑(원티드)과도 가깝다. 보라는 AI 음성 서비스에 흔해 피했다.
- 원문 상태색(green 성공, orange 경고, red 위험, blue·cobalt 정보)과 색상각이 겹치지 않는 200° 부근이다.
- 라이트: `{colors.brand-500}` 위 흰 글자와 흰 바탕 위 `{colors.brand-500}` 글자가 모두 5.5:1이다. hover는 `{colors.brand-600}`.
- 다크: 채움은 `{colors.brand-350}`에 짙은 글자(`{colors.grey-900}`, 8.8:1), hover와 틴트 위 글자는 `{colors.brand-300}`.
- 원문의 "연한 틴트 + 진한 동색 글자" 쌍을 따르되, 틴트는 알파가 아니라 불투명 옅은 바탕(`{colors.primary-subtle}`, `{colors.success-subtle}`, `{colors.warning-subtle}`)이다. 시안의 채도로 고른 값이다. 알파 틴트는 바탕과 섞이며 채도가 빠져 시안보다 탁했고, 놓이는 표면마다 색이 달라졌다. 그 위 같은 색 글자는 라이트 4.73~4.88:1, 다크 5.58~6.75:1이다(oklch→sRGB 계산, T2 계획 토큰 표). 알파는 outline 버튼 hover(`primary/8`)에만 남는다.
- 돈이 드는 동작(생성, 시험 생성, 클론)은 앱 전체에서 같은 표식(아이콘과 글자) 하나를 함께 붙인다. 색만으로 알리지 않는다.

### Omni AI TTS 상태색 (제품 조정)

상태는 초록(성공), 주황(경고), 회색(해당 없음) 셋으로 말한다. 2026-10-04 T2(연결 상태) 빌드에서 정했다.

- 라이트 글자와 아이콘은 `{colors.success}`, `{colors.warning}`이다. 원문 `green-500`·`orange-500`은 흰 바탕에서 4.39·4.15:1이라 한 단계 짙게 잡았다(흰 바탕 5.71·5.76:1).
- 다크 글자와 아이콘은 `{colors.green-300}`, `{colors.orange-300}`이다(카드 위 6.95·7.05:1).
- 상태 글자와 아이콘은 `text-success`·`text-warning`을 쓰고, 바탕은 짝이 되는 `*-subtle`이다. 회색 상태는 `muted` 바탕에 `muted-foreground` 글자다.
- `{colors.primary-subtle}`은 요약 띠와 활성 메뉴의 바탕이다. 사이드바의 `sidebar-accent`는 이 값을 그대로 가리킨다.

**The Opaque Tint Rule.** 글자를 얹는 옅은 바탕(상태 배지, 요약 띠, 활성 메뉴)은 불투명 `*-subtle` 토큰으로 칠한다. `bg-primary/10` 같은 알파 틴트로 새로 만들지 않는다.

### Omni AI TTS 다크 표면 (제품 조정)

다크는 그림자 대신 명도 단계로 깊이를 낸다. 페이지 바탕 `{colors.grey-900}` < 카드와 사이드바 `{colors.grey-850}` < 팝오버·secondary·muted처럼 떠 있거나 한 단계 올라온 면 `{colors.grey-800}`. 다크 1차 액션은 `{colors.brand-350}` 채움에 `{colors.grey-900}` 글자(8.76:1)다. 보더는 `{colors.white-12}`.

### Omni AI TTS 화자 색 (제품 조정)

2026-10-22 T9.5(드라마 작업실) 빌드에서 더했다. 값 정본은 `globals.css`, 근거는 `docs/briefs/drama.md` 9.2다.

- 색은 화자만 말한다. 화자 원, 대본 줄의 화자 칩, 시간축 막대에만 쓰고 연기 지시는 무채색이다.
- 색만으로 말하지 않는다. 화자는 늘 번호 원과 이름이 함께 가고, 시간축은 화자마다 레인이 따로다.
- 칩은 `{colors.speaker-1-subtle}` 같은 `*-subtle` 바탕에 `foreground` 글자다. 막대는 `{colors.speaker-1}` 바탕에 `speaker-N-on` 글자다.
- 화자는 최대 넷이다. 경고 주황, 위험 빨강, 성공 초록, 대표 청록의 색상각을 피해 262·95·345·305°를 골랐고, 기본 두 화자(1번 파랑, 2번 금색)는 적록 색약에서도 가장 멀다.
- 대비(라이트 / 다크): 칩 글자 최소 13.36 / 10.58, 번호 최소 4.72 / 5.78, 원·막대와 카드 최소 3.94 / 5.33.

## Typography

폰트 패밀리는 한국어 우선 스택이다 — `--font-family-sans-kr`이 `'Inter', 'NotoSansKR', 'Noto Sans KR', 'NotoSansJP', 'Noto Sans JP', -apple-system, …` 순으로, 라틴은 **Inter**·국문은 **Noto Sans KR**가 본문 서체다 [src:3]. 일본어용 `--font-family-sans-jp`(Noto Sans JP 우선)와 모노 `--font-family-mono`(ui-monospace, Cascadia Code, Source Code Pro, Menlo, Consolas …)도 토큰화돼, 채널톡이 한·일 시장을 함께 겨냥하는 제품임이 토큰에 반영돼 있다 [src:3].

굵기는 단 2단계다 — `--font-weight-400`(regular)와 `--font-weight-700`(bold). 중간 굵기 없이 regular/bold 이원화이며, `--typography-text-weight-bold`를 토글버튼 등이 사용한다 [src:3][src:2].

타이포그래피 묶음 토큰은 `--typography-size-NN-{font-size,line-height,letter-spacing}` 형태로 사이즈별 3속성을 한 묶음으로 노출한다 — 예컨대 `typography-size-24`는 `font-size-24` + `line-height-32` + `letter-spacing-2`를 묶고, `{component.text}` 컴포넌트가 이 토큰 + `--b-text-*` 로컬 변수로 조립된다 [src:3][src:2]. 음수 자간(`-0.01rem`/`-0.04rem`)은 한글·라틴 혼용 가독성을 노린 세팅이다 [src:3].

스케일 아래에는 굵기·행간·자간이 각각 프리미티브로 토큰화돼 있다. 자간은 크기 구간에 따라 두 값을 쓴다:

- `weight-400`: 400 — regular
- `weight-700`: 700 — bold
- `line-height-16`: 1.6rem
- `line-height-44`: 4.4rem
- `letter-spacing-1`: -0.01rem — 15~17px
- `letter-spacing-2`: -0.04rem — 22px↑ 타이트

### Omni AI TTS 서체 (제품 조정)

원문의 Inter·Noto Sans KR 대신 Pretendard Variable(OFL, `next/font/local` 자체 호스팅) 하나로 라틴과 한글을 함께 쓴다. 굵기는 원문대로 400과 700 두 단계다. 숫자 열은 `tabular-nums`, 한글은 어절 단위 줄바꿈(`break-keep`)이다.

빌드에서 쓰는 크기(루트 16px 기준)는 다음과 같다. 페이지 제목 24px(768px 이상 30px) 700, 카드 제목 20px 700, 요약 띠 한 줄 18px 700, 1200px 이상 사이드바 메뉴 18px, 본문 16px, 페이지 설명 14px(768px 이상 16px), 배지·보조 글 14px, 767px 이하 위 막대 메뉴 12px. 글자색은 검정 85%(`foreground`)와 60%(`muted-foreground`) 두 단계다.

## Spacing

레이아웃은 `{component.stack}`(`--b-stack-spacing`)·HStack/VStack·`{component.center}`·`{component.box}` 프리미티브로 짠다 [src:2]. Storybook 문서 예시들이 `spacing={4/6/10/16/32}`(4px 그리드 계열) 값을 직접 사용한다 [src:2].

비활성 상태 공통 토큰으로 `--opacity-disabled: 0.4`가 있어, 다수 컴포넌트(버튼·인풋·아바타·스위치 등)가 disabled 표현에 이 값을 쓴다 [src:3][src:2]. 모션은 `--transition-duration-s 150ms` / `-m 300ms` / `-l 450ms`에 타이밍 `cubic-bezier(0.3,0,0,1)`이며, 컴포넌트는 `--motion-transition-fast`/`-default`로 참조한다 [src:3][src:2].

### Omni AI TTS 모션 (제품 조정)

모션은 색 전환 하나다. Tailwind 기본 전환을 150ms `cubic-bezier(0.3,0,0,1)`로 바꿔 두고(`globals.css`의 `--default-transition-*`), 버튼·배지·메뉴는 `transition-colors`만 쓴다. 위치·크기 전환은 없다. 예외는 셋이다. 하나는 1199px 이하의 성우 서랍(`sheet.tsx`)이다. 서랍은 오른쪽 2.5rem(40px) 떨어진 투명한 자리에서 제자리로 200ms(`duration-200`, 이징은 위 기본 `cubic-bezier(0.3,0,0,1)`) 미끄러져 들어오고, 뒤 배경(`bg-black/10` + 흐림)도 같은 200ms로 투명에서 나타난다. 닫을 때는 거꾸로다. 둘째는 드롭다운 메뉴(`dropdown-menu.tsx`)의 100ms(`duration-100`) 확대(95%에서)·미끄러짐(8px)이다. shadcn 생성물 그대로이고 없애는 일은 백로그다. 셋째는 툴팁(`tooltip.tsx`)의 같은 확대·미끄러짐(기본 150ms, 생성물 그대로, 백로그)이다. `prefers-reduced-motion: reduce`에서는 위치·크기 움직임(이 미끄러짐·확대, 이동 키프레임)과 무한 반복(스켈레톤 pulse, 스피너 회전)이 멈추고, 투명도·색 전환은 원래 시간대로 남아 크로스페이드가 된다(T15-a2, 2026-11-19. 움직임은 더 적고 부드럽게이지 0이 아니다).

767px 이하 성우 탭 줄 오른쪽 끝의 흐림은 시간으로 움직이는 애니메이션이 아니다. 탭 줄이 넘칠 때만 스크롤 위치에 묶인 마스크(`index.css`의 `tabs-overflow-fade`, `animation-timeline: scroll(self inline)`)이고, 끝까지 넘기면 걷힌다. 흐림이 그려지는 브라우저에서는 이 흐림이 넘침을 알리므로 탭 줄 스크롤바를 숨긴다(`@supports (animation-timeline: scroll())` 안의 `scrollbar-width: none`, QA 2026-10-05).

### 공개 랜딩 모션과 간격 (제품 조정, 2026-11-19, T15-a)

공개 랜딩(`/`)만 위의 "색 전환 하나" 규칙의 예외다. 정본은 `docs/briefs/landing.md` 5·6절과 랜딩 CSS(`landing.css`)이고, 값은 `globals.css` 토큰이다.
- 곡선: `--ease-out` `cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out` `cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer` `cubic-bezier(0.32,0.72,0,1)`. `:root`에 두어 Tailwind 기본 `--ease-out`을 덮으므로 앱의 `ease-out` 유틸리티도 이 곡선이다. UI에 `ease-in`은 쓰지 않는다.
- 시간: 히어로 등장 600ms(비등간격 0·60·130·210ms, 마스코트 마지막), 섹션 reveal 700ms(안쪽 항목 60ms 간격, 한 번만), 누름 120ms(scale 0.97), 투어 크로스페이드·밑줄 200ms(transform만), FAQ 열기 200ms·닫기 150ms(높이는 아코디언 예외), 휴대폰 메뉴 열기 300ms `--ease-drawer`·닫기 200ms `--ease-out`, 메뉴 아이콘 200ms, 태그라인 어절 300ms.
- 간격: 섹션 위아래 `--spacing-section` 64px, `--spacing-section-lg` 80px(md 이상). 히어로 제목·부제 폭 `--container-hero` 680px.
- 동작 라이브러리: 투어 탭·FAQ·휴대폰 메뉴는 `@ui-sdk/react`(ADR 0014). `globals.css`의 `@layer ui-sdk;` 선언으로 라이브러리 기본 스타일이 토큰보다 앞서지 않는다.
- 움직임 줄이기: 앱 전역 규칙(이동 멈춤, 투명도 전환 유지)을 따른다. 히어로·reveal 이동 키프레임은 멈추고 reveal·투어는 크로스페이드로 남는다. 태그라인 어절 채움은 768px 이상·정밀 포인터·움직임 허용에서만 돌고, 그 밖(휴대폰·터치·움직임 줄이기)에서는 처음부터 모두 채운 상태다. 안 채운 어절도 큰 글자 3:1 이상이다(T15-b).

### 공개 데모 표시와 소개 페이지 2판 (제품 조정, 2026-11-19, T15-a2)

공개 데모(`APP_MODE=demo`)에만 있는 표시다. 본인용 작업실에는 없다.
- 데모 띠: 모든 앱 화면 맨 위 한 줄, `primary-subtle` 바탕에 `foreground` 14px 글자("공개 데모 · 예시 데이터는 매일 처음 상태로 돌아가요"), 닫기 없음.
- 계정 줄: 이메일·로그아웃 대신 '공개 데모' 한 줄.
- 데모 샘플 배지: 결과 자리(문단 카드 완료 칸, 드라마 무대·이전 테이크, 시험 생성 결과)에 `Badge` secondary 기본 크기 '데모 샘플'.
- 데모 안내: 연결 상태·내 보이스·캐시에 없는 성우 목록은 빈 상태 판(`EmptyTitle` keep-all)에 안내와 다음 행동 한 줄.
- 소개 페이지 히어로(2·3판)는 앱 문단 카드 문법을 따른 카드 하나였다: 대본 한 문단, 숫자 검수 줄과 원문/발음용 `ToggleGroup`(숫자는 `primary-subtle` 강조), 공급자 칩 다섯, 재생 막대. 4판에서 아래 "소개 페이지 4판" 절의 오디션 무대로 바뀌었다(원문/발음용 전환은 유지).
- 떠 있는 막대는 스크롤 뒤 불투명 `background` 바탕(흐림 없음)이고, 보이는 섹션의 링크에 `aria-current="location"`과 `primary` 밑줄.
- 막대 오른쪽 묶음은 테마 버튼(앱 메뉴와 같은 `ModeToggle`, 시스템→라이트→다크 한 버튼, 툴팁은 아래), '데모 써 보기'(768px 이상), 메뉴 버튼(767px 이하) 순서다. 테마 버튼은 휴대폰에서도 보인다.

### 소개 페이지 4판: 증명 장면 (제품 조정, 2026-11-19)

정본은 `docs/briefs/landing.md` 4판이다. 세계(청록·Pretendard·마스코트)는 그대로이고 새 시각 언어는 파형 하나다.
- 파형: 샘플마다 미리 뽑은 막대 64개(`landing-waveforms.ts`)를 SVG로 그린다. 재생 중인 줄만 진행 위치까지 `primary`로 칠하고 playhead 선을 둔다. 안 재생된 막대는 불투명도 70%, 재생하지 않는 다른 줄은 60%다. 시간은 '경과 / 전체'(tabular-nums). Web Audio·캔버스 없이, 움직임 줄이기에서는 칠하기만 남는다.
- 재생 규칙: 소리 요소는 누를 때 하나 만든다. 페이지 전체에서 한 번에 하나만 재생하고(히어로·연기·드라마 공통 훅), 자동 재생은 없다. 브라우저가 막은 재생은 실패가 아니라 '다시 눌러 주세요'다.
- 히어로(lg 이상 2열): 왼쪽 헤드라인·부제·주 행동 '데모 작업실 열기'(primary)·감독 마스코트, 오른쪽 오디션 무대(줄 다섯, 줄 높이 56px, '모두 이어 듣기'는 outline 보조). 재생 중에만 마스코트가 -2도·1.04배로 반응하고 음파 링 셋이 퍼진다. 움직임 줄이기에서는 정지한 링 하나다.
- 연기 칩: 마스코트 얼굴 그림(`mascot-face-*`)이 칩 아이콘이고, 고른 연기의 얼굴은 오른쪽에 크게(160~192px) 200ms 크로스페이드로 바뀐다.
- 반전 띠: 2026-11-19에 '숫자로 보는 제작'을 `bg-foreground text-background` 반전 띠로 두었다가, 2026-11-20 사용자 결정으로 섹션째 뺐다(랜딩은 서비스 소개라 만든 사람·코드 규모를 보이지 않는다). 반전 띠 문법은 지금 쓰는 곳이 없다.
- 섹션 배경은 `background`와 `muted`를 번갈아 칠하고, 같은 모양의 섹션이 둘 이어지지 않는다.

z-index 레이어는 명시적으로 단계화돼 있다 [src:3][src:2]:

> Bezier는 앱 셸/뷰포트 브레이크포인트를 토큰으로 발행하지 않는다 — 간격 리듬은 4px 그리드 위에서 컴포넌트별 로컬 변수로 처리된다(상세는 Responsive Behavior 참조) [src:3].

## Rounded

코너 반경은 2px부터 44px까지의 토큰 램프에 비율형 한 종을 더한 구조다 — `--radius-42-p`(`42%`)는 원형/스쿼클용이다 [src:3].

관찰된 사용처는 명확하다 — 버튼은 `{rounded.radius-6}`~`{rounded.radius-16}`, 모달은 `{rounded.radius-20}`, 배너/토스트/리스트아이템은 `{rounded.radius-12}`, 프로그레스바·슬라이더 트랙은 `{rounded.radius-3}`를 쓴다 [src:3][src:2]. **8~12px가 주력**이고, 큰 컨테이너일수록 16~20px로 커진다 [src:2].

별도로 `{component.smooth-corners-box}`가 `--b-smooth-corners-box-border-radius`·`-shadow-*` 로컬 변수로 iOS식 연속 곡률(squircle)을 그리고, 아바타가 `--b-smooth-corners-box-shadow-spread-radius`를 재사용한다 — 단순 라운드를 넘어선 부드러운 코너가 브랜드 시그니처다 [src:2].

Omni AI TTS 빌드의 사용처는 버튼 `{rounded.radius-8}`, 배지·메뉴 항목·인라인 코드 `{rounded.radius-6}`, 요약 띠·빈 상태 `{rounded.radius-12}`, 카드 `{rounded.radius-16}`이다.

`--radius-42-p`(`42%`)는 명세(`alpha`)의 Dimension이 px·em·rem만 받는 명세 밖 단위라 frontmatter 토큰에서 뺐고, Omni AI TTS은 쓰지 않는다. 쓰게 되면 비율 곡률은 요소 크기를 따라가므로 고정 길이로 옮기지 말고 값 그대로 쓴다.

## Elevation & Depth

엘리베이션은 `--ev-1`~`--ev-6` 6단계이며, 각 단계가 inner-shadow + base-shadow + 점증하는 blur를 합성한다 — `--ev-3`은 `…, 0 4px 12px 0 var(--shdw-medium)`, `--ev-6`은 `…, 0 12px 60px 0 var(--shdw-xlarge)` 식으로 단계가 올라갈수록 퍼짐이 커진다 [src:3]. 컴포넌트는 `--elevation-1`~`--elevation-4`로 사용하며, 모달이 `--elevation-4`, 토스트·셀렉트가 `--elevation-3`, 배너가 `--elevation-2`다 [src:2].

깊이 언어도 라이트·다크 양 테마를 동등하게 다룬다 — 라이트와 다크가 `--shdw-*`를 black-알파 ↔ white/black-알파로 다르게 매핑해 테마별 그림자 강도를 보정한다 [src:3]. 다크는 별도 후처리가 아니라 그림자 토큰 레벨에서부터 분기되는 1급 테마다 [src:3][src:2].

```text
# 컴포넌트 노출 단계 (--elevation-1 ~ --elevation-4)
elevation-2: 배너                    # --ev 기반, 라이트/다크 shdw 분기
elevation-3: 토스트 / 셀렉트 / 툴팁
elevation-4: 모달
```

### Omni AI TTS 깊이 (제품 조정)

화면에 놓인 카드는 그림자 없이 `ring-1`(라이트 `{colors.black-8}`, 다크 `{colors.white-12}`) 한 겹으로 바탕과 가른다. 라이트는 아주 옅은 회색 바탕(`{colors.grey-100}`) 위 흰 표면, 다크는 Colors 절의 grey-900 < 850 < 800 명도 단계다.

## Shapes

형태 언어는 부드러운 기하(soft, geometric-rounded)다 [src:2][src:3]. 버튼·인풋·배너·토스트가 8~12px 반경으로 일관되게 말려 있고, 큰 컨테이너는 16~20px로 더 둥글다 — 직각보다 라운드가 우세하며, 모서리는 시스템 전반에서 일관되게 부드럽다 [src:2].

곡선 처리에 특히 공을 들이는 점이 시그니처다 — 단순 `border-radius`로 멈추지 않고 `{component.smooth-corners-box}`가 iOS식 연속 곡률 squircle을 별도 컴포넌트로 제공하며, 아바타도 같은 squircle shadow-spread 변수를 재사용한다 [src:2]. 인터랙션은 짧고 가볍다 — 150ms `cubic-bezier(0.3,0,0,1)` 트랜지션으로 처리되고, 비활성은 `--opacity-disabled: 0.4`로 표현된다 [src:3][src:2].

일차 적응 축은 뷰포트가 아니라 **테마**다 — autodocs 한 장 안에 같은 variant의 라이트·다크가 병치되며, 색·표면·그림자가 테마별로 분기되는 것이 이 시스템의 핵심 시각 구조다 [src:2].

## Components

`@channel.io/bezier-react`는 정확히 59개 컴포넌트(PascalCase)를 노출한다 — 각 항목은 import 경로 `@channel.io/bezier-react`, 타입/스토리/사용 토큰 스펙, autodocs 스크린샷이 번들에 있다 [src:2]. `Alpha*` 접두 컴포넌트는 차세대(alpha) 라인, `Legacy*`는 구버전 라인으로, 같은 역할의 안정/실험/구버전 변종이 공존한다 [src:2]. 아래는 영역별 그룹 리드-인이며 59개 base가 모두 `###`로 등장한다.

**Actions / Buttons** — accent fill을 가장 폭넓게 쓰는 영역으로, 색 variant·스타일 variant·사이즈 enum과 alpha/legacy 라인이 겹쳐 있다.

### Button

핵심 액션 버튼. `ButtonColorVariant`·`ButtonStyleVariant`·`ButtonSize`·`SideContent` 타입을 받고 CTA/Floating/Async/Dropdown/Composite 등 16 스토리를 가진다 [src:2]. `{rounded.radius-6}`~`{rounded.radius-16}`, `--elevation-2`/`--elevation-3`와 다수 accent fill을 쓴다 [src:2].

```tsx
<Button colorVariant="blue" styleVariant="primary" size="m">Click me</Button>
```

- **button-primary** (`styleVariant="primary"`) — 채워진 1차 액션. 배경에 `{colors.blue-400}` 계열 accent fill, 텍스트는 흰색으로 페이지의 주 행동을 담당한다 [src:2][src:3].
- **button-secondary** (`styleVariant="secondary"`) — 채도를 낮춘 2차 액션. primary와 구조를 공유하되 fill 무게를 낮춰 보조 행동에 쓴다 [src:2].
- **button-floating** — CTA/Floating 스토리의 떠 있는 변종으로 `--elevation-2`/`--elevation-3`로 표면에서 부양시킨다 [src:2].

### ButtonGroup

`ButtonGroupProps`. 여러 버튼을 한 묶음으로 정렬하는 레이아웃 래퍼다 [src:2].

### AlphaButton

차세대(alpha) 버튼. `ButtonColor`·`ButtonVariant`·`ButtonSize`를 받고 11개 accent text 토큰 + `{rounded.radius-6}`~`{rounded.radius-12}` 계열을 쓴다 [src:2].

### AlphaIconButton

아이콘 전용 alpha 버튼. `IconButtonProps`를 받으며, accent fill/icon/text 토큰을 50종 이상으로 가장 폭넓게 사용한다 [src:2].

### AlphaFloatingButton

떠 있는 FAB류 alpha 버튼. `FloatingButtonColor/Variant/Size`를 받고 `--color-fill-grey`와 `--elevation-2`/`--elevation-3`를 쓴다 [src:2].

### AlphaFloatingIconButton

아이콘형 플로팅 alpha 버튼. `FloatingIconButtonProps`를 받으며 `--elevation-2`/`--elevation-3`로 부양한다 [src:2].

### AlphaToggleButton

토글 가능한 alpha 버튼. `ToggleButtonProps`를 받고 `--state-input-active/default`와 `--typography-text-weight-bold`로 선택 상태를 표시한다 [src:2].

### AlphaToggleButtonGroup

단일/다중 선택 토글 그룹(alpha). `ToggleButtonSingleGroupProps`·`ToggleButtonMultipleGroupProps`로 단일·다중 모드를 가른다 [src:2].

### AlphaToggleEmojiButtonGroup

이모지 토글 버튼 그룹(alpha). `ToggleEmojiButtonGroupProps`를 받고 `--b-toggle-emoji-button-size`와 accent blue 토큰을 쓴다 [src:2].

### SegmentedControl

세그먼트형 선택 컨트롤. `SegmentedControlSize/Type` 등을 받고 `--b-segmented-control-*` 로컬 변수 + `--elevation-1`을 쓴다 [src:2].

**Forms / Inputs** — 입력 컨트롤은 `--state-input-*`(active/default/error) 토큰과 `--b-form-field-size`로 상태·밀도를 일원화한다.

### TextField

단행 입력. `TextFieldVariant`(primary/secondary)·`TextFieldType`(number/text/email/password/tel/search/hidden)·사이즈 `xl/l/m/xs`·`allowClear`·`hasError` props를 받는다 [src:2]. `--state-input-active/default/error`와 `{rounded.radius-8}`/`{rounded.radius-12}`를 쓰며, invalid 상태의 box-shadow는 orange 계열이다 [src:2].

```tsx
<TextField size="m" variant="primary" allowClear placeholder="this is placeholder" />
```

### TextArea

다행 입력. `TextAreaHeight`·`TextAreaProps`를 받고 `--state-input-*`와 `{rounded.radius-8}`를 쓴다 [src:2].

### Select

드롭다운 선택. `SelectProps`·`SelectRef`를 받으며 팝업에 `--elevation-3`, 트리거에 `--state-input-*`와 `{rounded.radius-8}`를 쓴다 [src:2].

### Checkbox

체크박스. `CheckboxSize`·`CheckedState`를 받고(controlled/uncontrolled 스토리) 선택 상태에 `--color-fill-accent-green-heavier`, `--state-input-active/error`를 쓴다 [src:2].

### RadioGroup

라디오 묶음. `RadioGroupProps`·`RadioProps`를 받고 green accent + `--state-input-active`로 선택을 표시한다 [src:2].

### Switch

온/오프 스위치. `SwitchSize`를 받고 `--b-switch-*`와 green-heavier fill, `--elevation-2`를 쓴다 [src:2].

### Slider

범위 슬라이더. `SliderProps`를 받고(controlled/uncontrolled) `--b-slider-*`와 `{rounded.radius-3}`(트랙)/`{rounded.radius-12}`를 쓴다 [src:2].

### FormControl

폼 필드 컨텍스트/접근성 프롭 게터 묶음. `LabelPropsGetter`·`HelperTextPropsGetter` 등을 노출하고 `--b-form-field-size`로 컨트롤 높이를 일원화한다 [src:2].

### FormGroup

폼 그룹 컨테이너. `FormGroupProps`로 라벨·필드·헬퍼를 한 그룹으로 묶는다 [src:2].

### FormLabel

폼 라벨. `FormLabelProps`를 받아 필드 제목을 렌더한다 [src:2].

### FormHelperText

도움말/에러 메시지. `BaseHelperTextProps`·`FormErrorMessageProps`를 받으며 ErrorMessage 스토리로 에러 표시를 다룬다 [src:2].

**Overlays / Modals / Tooltips** — 띄우는 표면은 `--layer-z-index-*`(overlay 1000 / modal 1100 / toast 1200 / tooltip 1300)로 층을 가르고 `--color-dim-absolute-black`으로 딤을 깐다.

### Modal

합성형 모달(`ModalHeader/Body/Footer/Title/Trigger/Close`). `ModalTitleSize`를 받고 `--b-modal-width/height/collision-padding`, `--color-dim-absolute-black`, `--elevation-4`, `{rounded.radius-20}`을 쓴다 [src:2].

```tsx
<Modal>
  <Modal.Header><Modal.Title>제목</Modal.Title></Modal.Header>
  <Modal.Body>{/* content */}</Modal.Body>
</Modal>
```

### ConfirmModal

확인 다이얼로그 합성형(`ConfirmModalHeader/Body/Footer/Trigger/Close`). Composition 스토리로 확인/취소 액션을 묶은 모달이다 [src:2].

### AlphaDialogPrimitive

헤드리스 다이얼로그 프리미티브(alpha). `DialogPrimitiveTrigger/Portal/Overlay/Content/Title/Description/Close` 파트를 노출해 스타일 없는 다이얼로그 골격을 제공한다 [src:2].

### Overlay

위치 지정 오버레이. `OverlayPosition`·`TargetRectAttr`·`ContainerRectAttr`를 받고 `--layer-z-index-overlay`(1000) 층에 띄운다 [src:2].

### Tooltip

툴팁. `TooltipPosition`을 받고 `--color-surface-high`, `--elevation-3`, `--layer-z-index-tooltip`(1300), `{rounded.radius-8}`을 쓴다 [src:2].

### LegacyTooltip

구버전 툴팁. `LegacyTooltipPosition`·`GetTooltipStyle`을 받고 `--elevation-2`를 쓴다 — 신규 코드는 `{component.tooltip}` 또는 `{component.alpha-tooltip-primitive}`를 우선한다 [src:2].

### AlphaTooltipPrimitive

헤드리스 툴팁 프리미티브(alpha). `TooltipPrimitiveProvider/Trigger/Portal/Content/Arrow` 파트를 노출해 스타일 없는 툴팁 골격을 제공한다 [src:2].

**Navigation** — 사이드 내비·탭·리스트 행이 활성 상태에 accent blue(`--color-fill-accent-blue`)와 `{rounded.radius-6}`를 공유한다.

### Tabs

탭 내비게이션. `TabList/TabItem/TabContent/TabActions` 파트와 `TabSize`를 받으며(Composition·UnControlled 스토리) accent blue + `{rounded.radius-6}`~`{rounded.radius-12}`를 쓴다 [src:2].

### NavGroup

사이드 내비 그룹. `NavGroupProps`로 내비 항목들을 한 섹션으로 묶는다 [src:2].

### NavItem

내비 항목. `NavItemProps`를 받고 활성 상태에 `--color-fill-accent-blue`와 `{rounded.radius-6}`를 쓴다 [src:2].

### OutlineItem

들여쓰기형 아웃라인/트리 항목. `OutlineItemProps`·`OutlineItemContextProps`를 받고 `--b-outline-item-indent`로 깊이를, accent blue로 활성을 표시한다 [src:2].

### ListItem

리스트 행. `ListItemSize`·`ListItemVariant`를 받으며(WithRightContent·ActiveWithOnClick 등 6 스토리) accent blue/cobalt/green/red text와 `{rounded.radius-6}`~`{rounded.radius-12}`를 쓴다 [src:2].

### SectionLabel

섹션 헤더 라벨. `SectionLabelLeftContent/RightContent`·`IconWithAction`을 받아 리스트 구역의 제목 행을 만든다 [src:2].

### KeyValueItem

키-값 행(메타데이터 표시). `KeyValueItemAction`·`ItemActionWithIcon`을 받으며(MultiLine 스토리) `{rounded.radius-6}`를 쓴다 [src:2].

**Data display / Avatars** — 아바타 계열은 squircle shadow-spread 변수를 공유하고, 배지·상태·태그가 상태 색을 표현한다.

### Avatar

사용자 아바타. `AvatarSize`를 받으며(WithCustomStatus 스토리) `--b-avatar-status-gap`과 squircle용 `--b-smooth-corners-box-shadow-spread-radius`를 쓴다 [src:2].

### AvatarGroup

아바타 겹침 그룹. `AvatarGroupEllipsisType`을 받고 `--b-avatar-group-spacing/size`와 `--layer-z-index-floating`(1)로 겹침 순서를 다룬다 [src:2].

### CheckableAvatar

선택 가능한 아바타. `CheckableAvatarProps`를 받고 `--layer-z-index-base/floating`으로 체크 표식 층을 올린다 [src:2].

### AlphaAvatar

차세대 아바타(alpha). `AvatarSize`를 받으며(WithCustomStatus) `--b-avatar-computed-status-gap`으로 상태 점 간격을 계산한다 [src:2].

### AlphaAvatarGroup

차세대 아바타 그룹(alpha). `AvatarGroupProps`를 받고 `--b-avatar-group-ellipsis-ml`로 말줄임 마진을 다룬다 [src:2].

### Badge

숫자/상태 배지. `BadgeSize`·`BadgeVariant`를 받는다(Primary·Secondary 스토리) [src:2].

### AlphaStatusBadge

상태 배지(alpha). `StatusBadgeSize`를 받고 `--b-status-*`와 `--color-surface-high/highest`를 쓴다 [src:2].

### Status

상태 점/인디케이터. `StatusType`·`StatusSize`를 받고 `--b-status-bg-color/size`와 `--color-surface-high/highest`를 쓴다 [src:2].

### Tag

태그 칩. `TagSize`·`TagVariant`를 받고 `--color-state-action-light`를 쓴다 [src:2].

### Icon

아이콘 렌더러(602 SVG 세트 연동). `IconSize`를 받으며(AllIcons·UsageColor·UsageSize 스토리) `--b-icon-color`와 150ms `--motion-transition-fast`를 쓴다 [src:2].

```tsx
<Icon source={ChannelIcon} size="m" color="txt-black-darkest" />
```

### Emoji

이모지 렌더러. `EmojiSize`를 받고 `--b-emoji-background-image/size`로 스프라이트를 렌더한다 [src:2].

### Text

타이포 프리미티브. `TextProps`를 받고 `--b-text-color/font-size/line-height/letter-spacing/line-clamp` 로컬 변수로 `typography-size-24` 같은 묶음 토큰을 조립한다 [src:2].

**Feedback / Status** — 알림 표면은 blue/cobalt/green/orange/red accent를 상태별로 갈라 쓰고 `{rounded.radius-12}`를 공유한다.

### Banner

페이지 상단/인라인 알림 배너. **accent 20% 틴트 배경 + 선행 filled 아이콘(`info-filled`/`check-circle-filled` 등) + 텍스트(bold 리드) + 우측 닫기(`cancel-small`)** 한 줄 구성이다. 색은 blue(info)/cobalt(highlight)/green(success)/orange(warning)/red(critical)이고 글자·아이콘은 같은 hue의 솔리드값을 쓴다. `BannerVariant`·`RenderLinkFunc`(FullWidth/MaxWidth/MinWidth/Link/NoIcon 등 9 스토리)를 받고 `{rounded.radius-12}`·`--elevation-2`다 [src:2].

### Toast

토스트 알림 — **떠 있는 다크 바**다. `fill-neutral-heaviest`(흑 85% 알파) 배경에 흰 텍스트, 선행 상태 아이콘(예 `check-circle-filled`, `{colors.green-300}`) + 우측 액션 링크(`{colors.blue-300}`, 예 "실행 취소")로 구성되며 폭 약 300px, `--elevation-3`·`{rounded.radius-12}`다. `ToastAppearance`·`ToastPlacement`·`ToastPreset`·`ToastType`·`autoDismissTimeout`(기본 3000ms)·`zIndex` props를 받는다 [src:2].

### ProgressBar

진행률 바. `ProgressBarSize`·`ProgressBarVariant`를 받고 `--b-progress-bar-value/width`, `--color-gradient-green(-heavy)`, `{rounded.radius-3}`을 쓴다 [src:2].

### Spinner

회전 로딩. `SpinnerSize`를 받고 `--b-spinner-color`로 색을 정한다 [src:2].

### AlphaLoader

차세대 로더(alpha). `LoaderProps`를 받고 `--b-loader-*`(track/indicator color, stroke, view-box) 변수로 그린다 [src:2].

### Help

도움말 트리거(물음표). `HelpProps`를 받고 `--color-text-neutral`을 쓴다 [src:2].

**Layout / Primitives** — 레이아웃 골격은 Box/Center/Stack 프리미티브와 Divider, squircle용 SmoothCornersBox로 구성된다.

### Box

기본 박스 프리미티브. `BoxProps`로 패딩·마진·배경 등 레이아웃 속성을 받는다 [src:2].

### Center

중앙 정렬 컨테이너. `CenterProps`로 자식을 수평·수직 가운데에 둔다 [src:2].

### Stack

flex 스택. `HStackProps`·`VStackProps`·`StackProps`를 받고 `--b-stack-spacing`으로 간격을 준다 [src:2].

### LegacyStack

구버전 스택. Direction/Alignment/Spacing/Weight 스토리(Expanded·WeightSpacer 등)를 가지며, 신규 코드는 `{component.stack}`을 우선한다 [src:2].

### Divider

구분선. `DividerProps`를 받으며(Composition 스토리) `--b-divider-thickness/indent-size`와 `--color-border-neutral`을 쓴다 [src:2].

### SmoothCornersBox

연속 곡률(squircle) 박스. `SmoothCornersBoxProps`를 받고 `--b-smooth-corners-box-{border-radius,shadow-*,padding,margin,background-*}` 로컬 변수로 iOS식 부드러운 코너를 그린다 — Bezier 시그니처 형태를 담당하는 전용 프리미티브다 [src:2].

```tsx
<SmoothCornersBox borderRadius={16}>{/* content */}</SmoothCornersBox>
```

### Omni AI TTS 컴포넌트 (제품 조정)

`packages/ui`의 shadcn 컴포넌트를 위 문법에 맞춰 고친 것이다(2026-10-04 T2 빌드). 원문 컴포넌트 이름이 아니라 Omni AI TTS 코드의 이름이다.

- **Button 기본(primary):** 청록 `{colors.primary}` 채움에 흰 글자, 14px 700, `{rounded.radius-8}`, 높이 32px. hover는 라이트 `{colors.brand-600}`(짙어짐), 다크 `{colors.brand-300}`(밝아짐)이다(CSS 토큰 `--primary-hover`, T9 CS-07). 포커스는 2px 청록 outline(간격 2px).
- **Button outline:** 청록 보더와 청록 글자, 카드색 바탕. hover와 펼침 상태만 `primary/8` 알파 바탕을 깐다. 카드 바닥의 '다시 확인하기'가 이 변형이다.
- **Button `lg`:** 높이 44px(가로 안쪽 20px). 카드 바닥 버튼과 404의 돌아가기 버튼이 쓴다.
- **Badge:** 14px 700, `{rounded.radius-6}`, 최소 높이 28px. 바탕은 `*-subtle`, 글자와 14px 아이콘은 같은 상태색이다. 아이콘과 글자를 늘 함께 둬 색만으로 구분하지 않는다(연결됨 체크 원, 확인 필요 경고 삼각형, 키 없음 열쇠).
- **요약 띠:** 본문 너비, `{colors.primary-subtle}` 바탕, `{rounded.radius-12}`, 안쪽 16px 20px. 앞에 채운 정보 아이콘(20px, 청록 채움에 흰 획, 다크는 grey-900 획), 굵은 청록 요약 한 줄(18px), 그 옆에 문제 공급자 목록을 회색 14px로 둔다.
- **활성 메뉴:** `{colors.primary-subtle}` 바탕에 굵은 청록 글자, `{rounded.radius-6}`, 최소 높이 44px. 색만이 아니라 굵기와 `aria-current`로도 알린다. 비활성 hover는 검정 5% 바탕.
- **Card:** `{rounded.radius-16}`, 흰(다크 grey-850) 표면, `ring-1` 한 겹, 안쪽 20px. CardTitle은 20px 700. 같은 높이 카드에서 버튼이 바닥에 붙어 한 줄에 선다.
- **Skeleton·Spinner:** 스켈레톤은 `muted` 바탕 `{rounded.radius-8}` pulse, 스피너는 lucide `Loader2` 16px 회전이다.

2026-10-04 T3 빌드(성우 캐스팅)에서 더한 것:

- **Badge primary:** `{colors.primary-subtle}` 바탕에 청록 글자. 성우 행·패널의 '재생 중'만 쓴다.
- **성우 카드·선반:** T4에서 성우 행·패널로 바뀌어 없어졌다(아래 T4 절의 '성우 행'·'성우 패널').
- **조건 줄:** `<search>` 안에 검색 칸(카드색 바탕, `--input` 경계, 글자 16px, 지우기 버튼)과 outline 드롭다운 넷(모델·성별·연령·콘텐츠). 고른 값이 있으면 버튼 바탕이 `{colors.primary-subtle}`이고 청록 숫자 배지가 붙는다. 열린 버튼은 고른 값이 없으면 `muted` 바탕이다. 767px 이하는 드롭다운 넷을 '조건' 버튼 하나가 펼친다.
- **검색 칸 경계(`--input`):** 라이트 `oklch(0 0 0 / 0.45)`(카드 3.35:1, 바탕 3.32:1), 다크 `oklch(1 0 0 / 0.35)`(카드 3.16:1, 바탕 3.21:1). 입력 칸 바탕에 `bg-input/*`를 쓰는 변형(disabled, 다크 입력)도 함께 진해졌다. 폼을 처음 쓰는 TASK에서 확인한다.
- **드롭다운 항목:** 최소 높이 44px, `{rounded.radius-6}`, 14px. 포커스·hover는 `accent` 바탕에 안쪽 2px 청록 outline(바탕만으로는 대비가 1.12:1이라 윤곽선이 포커스를 알린다).

2026-10-05 T4 빌드(성우 캐스팅 세 공급자)에서 더한 것:

- **밑줄 탭:** `Tabs`(밑줄 모양 하나만 둔다). 줄 전체 너비에 아래 경계선 한 줄(1px, `border` 토큰)이 있고 탭 사이는 4px이다. 탭은 높이 44px, 가로 안쪽 12px, 16px이다. 고른 탭은 700 청록 글자(`text-primary`)에 탭 너비만큼 2px 청록 밑줄(150ms 투명도 전환)이고, 나머지는 400 회색 글자다(hover는 진한 글자). 탭 옆 인원은 14px 회색 보통 굵기 `tabular-nums`다('Typecast 614'). 포커스 윤곽(2px)은 안쪽에 그린다. 767px 이하에서 줄이 넘치면 그 줄만 가로로 넘기고 오른쪽 끝 32px이 흐려진다(위 모션 절). 성우 캐스팅의 '전체'·공급자 탭이 쓴다.
- **세그먼트:** 출처 전환('공개 라이브러리' | '내 계정 N'). 트랙은 `muted` 바탕, `{rounded.radius-8}`, 안쪽 4px, 칸 사이 4px이다. 칸은 높이 44px, 가로 안쪽 16px, `{rounded.radius-6}`, 14px이다. 안 고른 칸은 400 회색 글자이고, 고른 칸만 카드색 표면에 `border` 토큰 1px 경계(`ring-1`)와 700 진한 글자다. 인원 N은 400 회색 `tabular-nums`다. 하나 고르기이고 고른 칸을 다시 눌러 비울 수 없다. 칸 글자가 이름이라 그룹 접근 이름은 '출처'만 단다. ElevenLabs·Fish Audio 탭이 쓴다.
- **성우 행:** 목록 하나가 `{rounded.radius-16}` 카드색 면에 `ring-1 ring-inset` 경계를 두르고 행 사이는 1px 가름선이다(`divide-y`). 행은 안쪽 16px 8px, 최소 높이 68px에 가름선이 더해져 69px이고(`.voice-row`는 `content-visibility: auto`, `contain-intrinsic-size: auto 4.3125rem`) 화면 밖 행은 그리기를 미룬다. 맨 앞에 44px 원형 재생 버튼, 이름 16px 700(영문 이름은 14px 회색), 그 아래 메타 줄 14px 회색이 선다. 알약은 12px, `muted` 바탕에 `border` 안쪽 경계 한 줄, 가로 안쪽 8px, 최대 너비 128px(넘치면 말줄임)이다. 알약은 메타 줄이 쓰고 남는 자리만 쓰고 모자라면 들어가지 못한 알약부터 숨는다. 오른쪽은 너비 144px 칸이다. 보조 정보 14px 회색 `tabular-nums` 오른쪽 정렬 줄이 위, 회색 배지(400)가 아래다. 칸 숨김은 뷰포트가 아니라 목록 칸 너비(컨테이너 쿼리)로 정한다. 28rem(448px) 이상에서 알약이, 36rem(576px) 이상에서 오른쪽 칸이 보이고(T7에서 별 칸이 더해져 32rem에서 올렸다), 그 아래는 배지가 메타 줄 아래로 내려가고 보조 정보는 빠진다. 고른 행은 `{colors.primary-subtle}` 바탕, hover는 `muted` 바탕이다(150ms). 재생 중인 행은 왼쪽 3px 청록 띠, 이름 옆 '재생 중' 배지(`primary`), 채운 청록 정지 버튼이다. 행 전체가 '고르기' 버튼이고 재생 버튼만 그 위에 있다. 포커스는 행 안쪽 2px 윤곽이다.
- **공용 샘플 버튼:** 행의 재생 버튼과 패널의 샘플 줄이 같은 컴포넌트다. 44px 원형 아이콘 버튼이고 상태는 다섯이다. 멈춤은 outline에 채운 재생 아이콘, 불러오는 중은 outline에 스피너(`aria-busy`), 재생 중은 청록 채움에 채운 정지 아이콘, 실패는 멈춤과 같은 모양(옆에 경고색 '재생하지 못했어요'), 샘플 없음은 회색 비활성이다. 상태는 모양만이 아니라 접근 이름('… 듣기', '… 정지', '… 듣기 취소', '… 다시 듣기', '… 없음')에 담는다. 같은 샘플 주소는 행과 패널에서 같은 상태다.
- **성우 패널:** 1200px 이상 오른쪽 칸의 카드(`{rounded.radius-16}`, 카드색, 안쪽 20px, `ring-1 ring-inset`)다. 목록을 따라 화면에 붙어 내려오고(`voice-panel-sticky`: 위에서 24px, 최대 높이 화면 높이 - 48px), 더 길면 패널 안에서 스크롤하며 끝에서 페이지로 이어지지 않는다(`overscroll-behavior: contain`). 머리는 성우 이름 20px 700(`text-balance`)이고 그 아래 14px 회색 '{공급자} · {출처}'(Typecast는 출처 구분이 없어 공급자만)다. 이어서 분류 칩(행 알약과 같은 모양, 가로 안쪽 10px), 설명(세 줄까지 보이고 잘렸을 때만 '더 보기'/'접기' 링크 버튼), '기본 샘플' 목록(줄마다 최소 높이 44px, 공용 샘플 버튼과 이름표), 이용 조건(14px 회색 줄)이다. 이용 조건의 경고 줄은 `text-warning` 경고 삼각형, 공통 안내는 정보 아이콘, 보증 성우는 체크 배지 아이콘이고 모두 16px이다. 소제목은 700이고, Typecast는 이용 조건 대신 '모델별 감정'(있을 때)이 선다. 본문 글자는 칸과 서랍 모두 16px이다(`VoicePanelContent`가 `text-base`로 `SheetContent` 기본 14px을 덮는다).
- **성우 서랍:** 1199px 이하에서 같은 내용(`VoicePanelContent`)을 오른쪽 `Sheet`로 연다. `popover` 면에 왼쪽 경계 한 줄이고, 768px 이상은 최대 너비 28rem(448px), 767px 이하는 화면 전체 너비다. 오른쪽 위의 '닫기'는 44px 고스트 아이콘 버튼(X)이고 머리 오른쪽 64px을 비워 제목과 겹치지 않게 한다. 제목은 20px 700이고 서랍이 열리면 제목으로 포커스가 가며, 닫으면(Esc·닫기·바깥 누르기) 그 행의 '고르기' 버튼으로 돌아간다. 머리는 고정이고 그 아래 본문 칸만 스크롤한다. 배경과 미끄러짐은 위 모션 절이다.
- **조건 버튼:** 드롭다운, 토글 칩('추천 성우만'·'보증 성우만'), 767px 이하의 '조건' 버튼이 같은 모양이다. 높이 44px, 14px, 카드색 바탕이다. 고르지 않으면 400 글자와 `border` 토큰 경계(옅다), hover와 펼침은 `muted` 바탕이다. 고르면 700 글자와 청록 경계·글자에 `{colors.primary-subtle}` 바탕이고, hover는 바탕을 그대로 두고 밝기만 바꾼다(라이트 95%로 어둡게, 다크 110%로 밝게). 켜진 토글 칩은 앞에 체크 아이콘을 붙여 색만으로 구분하지 않는다. 고른 값은 '언어 · 한국어'처럼 버튼에 쓰고(값은 최대 160px 말줄임) 둘 이상이면 개수를 쓴다. 검색 칸은 T3 그대로 `--input` 경계, 높이 44px, `{rounded.radius-8}`, 16px이고, 1200px 이상에서는 192~288px 사이에서 줄어든다. 조건은 넘치면 줄을 바꾼다. 정렬은 조건 줄이 아니라 상태 줄에 있다.
- **상태 줄:** 조건 줄 아래, 공급자 탭 모두 같은 자리다. 왼쪽에 회색 인원 글자(16px, `tabular-nums`, 받는 중이면 앞에 작은 스피너)와 청록 텍스트 링크('조건 모두 해제' 등, 링크 변형 44px)가 서고, 오른쪽에 정렬 메뉴(ElevenLabs·Fish Audio), 조용한 '목록 새로 고침', 받은 시각(14px 회색 `tabular-nums`)이 선다. '목록 새로 고침'은 새로 고침 아이콘이 붙은 링크 변형 44px이고 회색 보통 굵기이며 hover에서 진한 글자가 된다. 인원 글자는 스크립트가 포커스를 옮기는 자리라('모두 보기 →' 뒤) 키보드로 왔을 때만 2px 윤곽을 그린다. 문제 안내나 지난 목록 안내가 보이는 동안에는 '목록 새로 고침'이 숨고 안내 안의 '다시 불러오기'가 회복 버튼 하나다. 좁으면 오른쪽 묶음이 다음 줄로 내려간다.
- **행 목록 키보드:** 행 목록 하나가 Tab 정지 하나다(roving tabindex, `lib/roving.ts`). 지금 행의 버튼 하나만 Tab으로 닿는다. 방향키는 ↑↓가 같은 칸의 이전·다음 행, Home·End가 같은 칸의 첫·끝 행, ←→가 한 행의 기본 샘플·고르기·(캐스팅만) 내 문장 듣기·별 칸 사이다(T7). 이동만 하고 고르지 않는다(Enter·Space가 버튼 동작이다). 방향키를 쓴다는 것은 목록마다 화면 밖 한 줄('방향키로 성우와 버튼 사이를 옮겨요')로 알린다. 다시 받는 중인 목록은 60% 투명도에 누를 수 없다.

**The One Teal Rule.** 청록은 1차 동작, 활성 메뉴, 요약 띠, 포커스, 그리고 성우 캐스팅의 재생 중 표시(왼쪽 띠, '재생 중' 배지, 채운 정지 버튼), 고른 탭(글자와 밑줄), 고른 조건만 맡는다. 고른 행은 청록이 아니라 옅은 청록 바탕(`{colors.primary-subtle}`)으로 알린다. 연결 상태는 초록·주황·회색 배지로만 말한다. 슬라이더의 채운 구간·손잡이와 스위치의 켜짐 바탕은 무채색(CSS 토큰 `foreground`)이고 청록은 그 포커스 고리에만 쓴다(T5 계획 리뷰 U7, 2026-10-05).

2026-10-05 T5 빌드(내 문장 듣기)에서 더한 것:

- **문장 입력:** 목록 위 카드 안에서 모든 공급자 탭이 문장 하나를 공유한다. 입력과 직접 쓰는 말투 태그는 높이 44px 이상, 반경 12px, 모바일 16px·768px 이상 14px이다. 문장은 200코드포인트까지이고 조합 입력은 완료 뒤 제한한다. 글자 수는 숫자 폭을 고정하고 Fish Audio에는 UTF-8 바이트 수를 함께 보인다.
- **사용량 표식:** 유료 생성은 lucide `Coins` 하나로 표시한다. 카드·테두리 버튼·확인 창 위에서는 `warning`, 청록 채운 버튼 안에서는 버튼 글자색이다. 무료는 `success` 배지, 좁은 행 버튼에서는 `AudioLines`를 쓴다. 기본 샘플은 기존 `Play`다. 저장된 결과의 재생은 크레딧 0으로 설명한다.
- **Slider·Switch:** 채움과 경계는 무채색 `foreground`, 청록은 포커스에만 쓴다. 슬라이더의 조작 줄은 44px이고 썸은 16px에 투명 조작 여백을 더한다. 스위치는 36×20px에 투명 여백을 더한다. 방향키로 값을 바꿀 수 있고 값의 단위는 접근 이름·설명에 함께 둔다.
- **확인 창:** 생성과 삭제는 공용 `AlertDialog`를 쓴다. 모바일 좌우 여백은 16px, 카드 반경은 16px이고 버튼은 `lg`다. 첫 포커스는 취소, 닫히면 연 버튼으로 돌아온다. 유료 생성 창에는 문장·성우·설정·예상 사용량·남은 값과 기본 샘플을 보인다. 삭제가 진행 중이면 취소·Esc·재진입을 막는다.
- **패널의 내 문장 구역:** 기존 이용 조건 뒤, 결과 목록 앞이다. 모델마다 받는 옵션만 보이고 '처음 값으로'는 늘 자리에 둔다. 예상 사용량과 듣기·새로 만들기 줄은 패널·서랍 스크롤 바닥에 붙는다. 칸은 카드색, 서랍은 `popover`색을 사용한다.
- **성우 행과 결과:** 행은 기본 샘플·성우 고르기·내 문장 듣기의 세 칸으로 방향키 이동한다. 목록 컨테이너 42rem 미만이면 내 문장 버튼의 글자를 접근 이름으로 옮기고 44px 아이콘 버튼을 쓴다. 결과 목록은 최신 20개, 재생·정지·지우기의 짧은 줄이고 재생 상태는 플레이어가 한 번만 알린다.

2026-10-20 T8 빌드(프리셋)에서 더한 것:

- **Badge secondary:** `muted` 바탕에 회색 글자. 이름 옆의 상태(프리셋 '기본', '현재 이용 불가')에 쓴다. 고칠 일이 있는 상태('성우를 다시 골라 주세요', '처음 값으로 바뀐 값 있음')만 `warning`이다. 청록 배지는 여전히 '재생 중'만이다.
- **동작 메뉴:** 패널 머리의 outline `lg` 버튼 + `ChevronDown`이 여는 `DropdownMenu`(폭 288px). 항목은 44px 이상, 두 줄 항목은 굵은 이름과 회색 14px 보조 줄이다. 지금 적용된 항목은 오른쪽 회색 16px `Check`와 접근 이름 끝 ", 불러옴"으로 알린다. 목록만 `max-h-80`에서 스크롤하고, 화면을 떠나는 항목은 가름선 뒤 `ArrowRight`를 붙인다.
- **링크에 버튼 모양:** `Link`에 버튼 모양을 입힐 때는 `cn(buttonVariants(...))`로 겹치는 경계 클래스를 정리한다. `buttonVariants`만 쓰면 기본의 `border-transparent`가 outline의 청록 경계를 덮는다(T8 빈 상태 링크에서 생겼다).

2026-10-21 T9 빌드(음성 작업실)에서 더한 것:

- **문단 카드:** 카드색 면, 안쪽 16px. 번호는 회색 숫자(버튼 아님)이고, 성우 버튼만 무채색 테두리(outline)이며 성우가 없을 때만 채운 청록(`default`)이다. 감정 표식은 카드 머리의 지름길이고 누르면 설정 펼침(`ChevronDown`)이 열린다. 칸 오류는 `warning` 글자와 `TriangleAlert`다.
- **감정 팔레트:** `ToggleGroup` 알약, 높이 44px, `rounded-full`, 카드색 바탕 + `ring-border`. 고른 알약은 `{colors.primary-subtle}` 바탕·`{colors.primary}` 글자·청록 경계에 `Check`를 앞세운다. 알약마다 툴팁과 같은 말의 숨긴 설명 줄을 둔다. 방향키로 옮기고 Tab 정지는 하나다.
- **성우 고르기 창:** 입력 창(Dialog)과 같은 모양에 768px 이상 `md:max-w-lg`, 767px 이하 아래 시트. 지금 성우는 옅은 청록 바탕 + `aria-current` + `Check`, 이용 불가 성우는 `aria-disabled`로 포커스를 받되 눌러도 일이 없고 이름·조건 글자만 흐리며 이유는 회색 배지가 맡는다. 창 밖으로 나가는 링크는 `cn(buttonVariants(...))`의 outline `lg`다.
- **하단 막대:** 바닥에 붙는 띠. 막대가 자기 높이를 `<html>`의 `--studio-bar-height`에 두고 본문(`studio-bar-space`)과 스크롤 여백(`studio-bar-scroll`)이 그만큼 비운다. 금액은 주 버튼에 합쳐 `Coins` 하나로 알린다(청록 채운 버튼 안은 버튼 글자색). 한 줄 칸은 한 번에 하나(오류 → 막는 이유 → 20초 안내 → 도움 줄)이고, 767px 이하에서 대본 칸에 포커스가 있는 동안은 결과 줄을 숨긴다. 같은 결과가 이미 플레이어에 있으면 주 버튼을 outline으로 내려 채운 청록이 화면에 하나만 남게 한다.
- **이전 결과 줄:** 대본 첫 줄 + 배지(미확인 또는 회색 '플레이어에 있음') / 언제·성우·설정·크레딧 보조 줄. 재생·내려받기는 44px ghost 회색 아이콘 버튼 + 툴팁이고, 받는 중에는 같은 버튼의 아이콘만 `Spinner`로 바뀌어 포커스를 지킨다.
- **조건 버튼 모양의 머리 메뉴:** 작업실 머리의 프리셋 메뉴는 `PresetMenu trigger="condition"`으로 성우 조건의 고른 것 없는 조건 버튼과 같은 클래스를 쓴다. 동작 메뉴(outline `lg`)와 항목 규칙은 그대로다.

2026-10-22 T9.5 빌드(드라마 작업실)에서 더한 것:

- **받을 테이크 ▾:** 대본 줄 동작 칸의 하나 고르기 메뉴(ghost `lg` 트리거 + `ChevronDown`). 보이는 글은 그 줄이 받을 테이크 번호 `T{k}`다. 고른 줄은 `{colors.primary}` 글자, 고르지 않아 무대 테이크를 따라가는 줄은 `muted-foreground` 글자이고 접근 이름과 그 메뉴 항목 끝에 " · 무대 따라감"을 붙인다.
- **시간축:** 화자마다 레인이 따로 있고 막대는 `speaker-N` 바탕에 `speaker-N-on` 글자다. 줄 번호는 막대 폭이 20px 이상일 때만 보인다. 자른 위치는 `muted-foreground` 점선이다.
- **두 줄 메뉴 항목:** `RadioMenu` 옵션에 `note`를 주면 항목 이름 아래에 회색(`muted-foreground`) 보조 줄이 붙는다. 트리거 글자와 접근 이름에는 넣지 않는다.

2026-10-23 T9.5 피드백 5(드라마 작업실 화면 재구성)에서 바뀐 것. 토큰은 바뀌지 않았다.

- **대본 지면과 줄 격자:** 대본은 카드색 `ol` 그릇 하나(반경 16px, `ring-1`)이고, 줄은 768px 이상에서 한 층 격자다(번호 · 화자 칩 · 지시 · 대사 · 동작). 칩과 지시 폭을 고정해 대사 시작을 줄마다 맞춘다. 767px 이하는 두 층이다. 지시와 대사 칸은 테두리 없이 hover `muted`, 포커스 ring이다. 읽는 중인 줄은 `primary-subtle` 바탕과 `aria-current`로 알린다.
- **가름선:** 줄 사이 쉼은 마지막 줄을 뺀 줄 아래 높이 28px 가는 선 가운데의 숫자 칸이다. 줄 쉼이 없으면 기본값이 흐린 자리 표시이고, 있으면 굵은 `foreground`와 '기본으로 ×'다.
- **도구줄:** 연기 지시 알약은 마지막으로 포커스한 줄 바로 아래에 끼워 넣는 한 줄 `role="toolbar"`다(겹쳐 띄우지 않는다). 알약은 높이 36px에 눌림 영역 44px이고, 767px 이하는 한 줄 가로 넘김이다. 포커스한 줄이 없으면 도구줄도 없어서 눌러도 반응 없는 알약이 없다.
- **막대 결과 칸:** 하단 막대는 [결과 칸 | 동작 칸] 위에 한 줄 칸을 둔다. 결과 칸은 테이크 넘기기와 장면 플레이어, '이어 듣기' 단추, 또는 회색 안내다. 돈이 드는 주 동작에는 같은 `Coins` 하나가 붙는다.
- **화자 띠:** 화자마다 높이 52px, 반경 16px의 한 줄 띠(카드색, `ring-1`)다. 화자 구역은 `isolate`로 샘플 단추의 z-10이 막대 위로 나오지 않게 한다.

2026-10-23 T10-a 빌드(문단 작업실)에서 더한 것. 위 T9 절의 문단 카드·하단 막대·이전 결과 줄을 대신한다. 토큰은 바뀌지 않았다.

- **태그 도구줄:** 드라마 도구줄 부품(`tag-tools.tsx`)을 두 작업실이 함께 쓴다. 문단 카드 대본 칸 바로 아래, 마지막으로 대본 칸에 포커스한 문단 하나(대상)에만 놓인다.
- **Button neutral:** `border` 토큰 경계, 카드색 바탕, `foreground` 글자다. hover와 펼침은 `muted` 바탕이다. 문단 작업실의 보조 동작(카드 '만들기', 받기 ▾, 이어 듣기, 이동, 붙여 넣기, 성우 고르기 창의 링크, 잠긴 주 버튼)은 모두 이 변형이다. 청록 outline은 쓰지 않는다. 청록 채움은 화면에 하나만 두며, 다음에 할 일 하나(기본 성우 고르기 → 전체 만들기 → 받기)가 그것이다.
- **사용량 표식 예외:** 카드 '만들기' 안의 `Coins`는 `warning`이 아니라 `muted-foreground`다. 카드마다 경고색이 되풀이되지 않게 하려는 것이다. 돈은 막대 주 버튼의 `Coins` 하나와 확인 창이 알린다. 무료 문단은 `Coins` 대신 `success` '무료' 배지다.
- **문단 카드:**
  - 겉: 카드색 면, `ring-1`, 안쪽 16px.
  - 머리줄: 회색 번호(숨은 제목 '문단 N'), 성우 단추(ghost `lg`), 오른쪽 묶음(상태 → 만들기 → 설정 → ⋯) 순서다. 칩은 둘째 줄에 둔다.
  - 성우 이름: 기본 성우를 따르면 400 `muted-foreground`이고, 이 문단만의 성우면 700 `foreground`다. 굵기가 '기본과 다름' 표시이며 따로 배지를 붙이지 않는다.
  - '성우 고르기': 대본이 비었으면 `muted-foreground`, 대본이 있으면 `warning`이다.
  - 대본 칸: 테두리가 없고 16px이다. 포커스는 2px 청록 ring이다.
  - 만드는 중인 카드: `primary-subtle` 바탕과 `aria-current`다.
  - 화면 밖 카드: `paragraph-card`(`content-visibility: auto`, 14rem)로 그리기를 미룬다.
- **작업실 격자:** `studio-grid`가 컨테이너 쿼리로 1·2·3단을 정한다. 3단은 왼쪽 14rem(작업 설정), 가운데 최대 48rem, 오른쪽 16rem(작업 요약)이다. 3단은 두 레일이, 2단은 작업 설정이 `studio-rail-sticky`로 붙는다. DOM은 폭과 상관없이 작업 설정 → 문단 목록·막대 → 작업 요약 하나이고(각각 이름 붙은 `aside`), 격자 행·열로만 놓는다(CSS order 없음). 3단은 포커스 순서와 왼쪽→오른쪽 열 순서가 같다. 2단은 오른쪽 열에 작업 설정만 두고(머리 옆부터 끝까지, 스크롤해도 붙음) 작업 요약 aside는 숨긴다. 요약은 1단처럼 하단 막대의 요약 칩과 아래 시트로 본다(MG-01·MG-06, 사용자 결정 2026-11-20). 포커스 순서는 설정 → 목록 → 막대(요약 칩)다. 1단은 레일 대신 머리 아래의 작업 띠를 두고, 설정과 요약은 바닥 시트로 연다. 바닥·위 시트의 스크롤 칸은 `overscroll-contain`이다.
- **문단 하단 막대:**
  - 구성: [결과 칸(진행·받는 중·플레이어·안내) | 동작 칸] 아래에 한 줄 칸(오류·막는 이유·20초 안내·도움 중 하나)이 선다.
  - 결과 칸: 진행 줄·받는 중 또는 플레이어이고, 둘 다 없으면 회색 안내다. 요약 칩(1단·2단)은 동작 칸에 있다. 멈춘 문단이나 막힌 문단이 있으면 칩에 저장 안 됨 점과 같은 `bg-warning` 점이 붙고 접근 이름에 '확인할 문단 있음'이 더해진다(안 만든 문단만 있을 때는 없음). 대본이 비면 칩은 접힌다(MG-06). 요약 시트는 열리면 첫 포커스를 시트 제목(`tabIndex=-1`, 키보드로 열 때만 윤곽)에 두어 휴대폰 가상 키보드를 띄우지 않는다. 제목에서의 첫 Shift+Tab은 Base UI 앞쪽 포커스 가드가 끝 요소로 옮긴다(MG-07. `focus-wrap`을 넓히면 대화상자 가운데의 탭 순서 밖 요소에서도 끝으로 건너뛰어 되돌렸다).
  - 동작 칸: 768px 이상에서는 받기 ▾ · 이어 듣기(neutral) · 주 버튼 순서로 보인다(DOM과 Tab은 주 버튼이 먼저, `md:flex-row-reverse`). 본문이 3단이 아니면(1단·2단) 요약 칩이 그 앞에 선다. 767px 이하에서는 두 줄이다([요약 칩][주 버튼] / [이어 듣기][받기], 320px처럼 한 줄에 안 들어가면 요약 칩이 위 줄로 내려간다). 받기 메뉴에는 파일 받기 셋만 둔다.
  - 진행 막대: 높이 4px의 무채색(`muted` 위 `foreground`)이고, 가짜 진행률을 그리지 않는다.
  - 767px 이하: 카드색 판에 위 반경 16px와 `ring-1`이다.

2026-11-11 T10-b 빌드(화자 성우·일괄 작업·이어 듣기 강조)에서 더한 것. 토큰은 바뀌지 않았다.

- **화자 표식:** 두 작업실이 같은 색 원(`SpeakerMark`, 지름 20px, 번호 + `speaker-N` 색)을 쓴다. 문단 작업실은 화자가 20명까지라 색은 `speaker-1~4`를 순환하고 번호(목록 순서)와 이름이 구별을 맡는다. 색만으로 말하지 않는다. 카드 머리줄의 화자는 색 원 + 이름 글자(눌리지 않음)이고, 배지 모양을 쓰지 않는다(눌리는 것처럼 보이지 않게).
- **화자 줄(레일):** 색 원 · 이름 · 회색 '문단 N' 한 줄, 그 아래 기본 성우 단추와 같은 `neutral lg` 성우 단추. 성우가 없으면 단추 글자는 '성우 고르기'(`foreground`)이고 아래 회색 14px 안내 한 줄. 지우기는 ghost 아이콘(`Trash2`)이며 문단이 남은 화자는 이유를 단 채 잠긴다(hover·터치로 이유가 보인다).
- **고르기 막대:** 문단 목록 위에 붙는 막대(`studio-select-sticky`, 바탕 `background`, 아래 한 겹 선). [모두 고르기 체크 · 개수] [동작 다섯, `neutral lg`, '지우기'만 `destructive` 글자] … [끝내기 ghost 아이콘 `X`]. 1440·768에서 고른 것이 있으면 한 줄, 0개일 때는 개수 뒤 회색 이유 글 때문에 두 줄이다. 767px 이하는 두 줄(첫 줄 체크·개수·끝내기, 둘째 줄 같은 폭 동작 다섯). 막대가 있는 동안 페이지 위쪽 `scroll-padding`을 막대 높이만큼 둬서 포커스가 막대 뒤에 숨지 않는다.
- **고른 카드:** 안쪽 2px `ring-primary`. 만드는 중 `primary-subtle` 바탕과 함께 보일 수 있다. 고르기 중 카드 안 입력 칸의 포커스는 2px 윤곽을 2px 띄워(`studio-pick-focus`) 고른 링과 모양으로 구분한다.
- **듣는 중:** 이어 듣기에서 재생 중인 문단은 머리줄 상태 자리 앞 청록 `AudioLines` + '듣는 중'(14px)이다. 바탕·링은 바꾸지 않고 화면도 옮기지 않는다. 막대 플레이어 옆 이전·다음 문단은 ghost 아이콘(44px)이고, 캡션 뒤 '문단 N 재생 중'이 그 카드로 가는 링크다.

2026-11-18 T11 빌드(숫자 검수)에서 더한 것. 토큰은 바뀌지 않았다.

- **바뀐 자리 표시(`mark`):** 원문에서 바뀐 글은 `bg-card` + `ring-1 ring-border` + 굵게로 표시한다(자동 태그 미리 보기의 새 태그와 같은 문법). 색을 더하지 않는다.
- **숫자 줄(카드):** 대본 칸 아래 `bg-muted` 판에 회색 14px '발음용 대본'과 16px 발음용 대본 글. 판 맨 아래 상태 줄은 주황 `CircleAlert` + "숫자 {표기 최대 3개} 검수 안 함 · 검수하기" 또는 초록 `CircleCheck` + "숫자 검수 끝 · 다시 보기". 링크는 청록을 쓰지 않는 밑줄 `foreground` 글자다(`link` 변형 색을 덮는 이 화면의 예외).
- **숫자 검수 창(T11):** `Dialog` `md:max-w-2xl`(767 이하 아래 시트). 768 이상은 왼쪽 224px 항목 목록(지금 항목은 `bg-foreground/10` + 진한 글자, 가장자리 막대 없음) + 오른쪽 한 항목. 선택지는 native 라디오(눌림 영역 44px, 원형 표식)다. 잠긴 주 버튼은 `neutral` + `foreground` 테두리이고 이유는 버튼 줄 위 회색 14px 한 줄로 보인다.

2026-11-18 T12 빌드(대본 보관함)에서 더한 것. 색·간격 토큰은 바뀌지 않았고, 창 겹 배경의 다크 값만 바뀌었다.

- **목록 줄(링크 줄 + ⋯):** `/scripts`의 한 그릇 목록에서 줄의 글자 칸 전체가 그 항목을 여는 링크이고, 나머지 동작은 줄 오른쪽 링크 밖의 ⋯ 메뉴 하나(`DropdownMenu`, 44px ghost 아이콘, 접근 이름 '{제목} 동작')로 접는다. 모든 너비에서 같다(`/presets`의 아이콘 셋 줄과 다른 점: 주 동작이 하나이고 반복 줄이 많을 때 쓴다). 줄은 제목 16px 굵게 → 회색 14px 원문 두 줄 말줄임 → 회색 14px `tabular-nums` 메타 한 줄 → 칩.
- **검색 칸(`SearchField`):** 돋보기 + 44px 입력 + 지우기 ×. 성우 캐스팅·성우 보관함·대본 보관함 조건 줄과 대본 넣기 창이 같은 부품을 쓴다.
- **고르기 목록 창:** 넣기 창은 `role="radiogroup"` 줄 목록(고른 줄 `bg-foreground/10` + 체크, 가장자리 막대 없음)과 아래 고정 줄(미리 보기 · 세그먼트 · 경고)로 나눈다. 고르는 단계는 높이를 고정해 고르기 전후로 창 머리가 움직이지 않는다.
- **저장 상태 점:** 연결된 대본이 저장 안 됨이면 메뉴 버튼 안 제목 뒤 8px `bg-warning` 점 + 화면 밖 "저장 안 됨". 색만으로 말하지 않는다.
- **창 겹 배경:** `Dialog`·`AlertDialog` overlay는 라이트 `bg-black/10`, 다크 `bg-black/50`(다크에서 창 뒤 채움 버튼이 비쳐 보이던 것을 막는다). `Sheet`는 그대로다.

2026-11-18 T13 빌드(내 보이스)에서 더한 것. 색·간격 토큰은 바뀌지 않았고, `destructive` 버튼 변형의 값만 바뀌었다.

- **`destructive` 버튼(모든 화면):** 라이트·다크 모두 `bg-destructive/10` + `text-destructive`, hover는 `bg-destructive/20` + `text-foreground`. 다크 기본 대비가 3.9:1이던 것을 4.65:1로, hover를 라이트 11.95·다크 8.78:1로 올렸다(지우기 확인 창 전부에 적용).
- **녹음 칸:** 큰 경과 시간(`text-4xl` 굵게 `tabular-nums`) 하나와 그 아래 회색 14px 범위 줄, 버튼 한 줄(녹음하기 `default` / 멈추기, 다시 녹음·파일 고르기 `neutral lg`). 녹음 중에는 시간 앞 12px `bg-warning` 점(`motion-safe`에서만 깜빡임) + 글자 '녹음 중'. 범위 줄은 최소 길이까지 남은 초를 세다가 넘으면 `foreground`의 '충분해요…'로 바뀐다(경고색이 아닌 진행 신호). 원본 재생은 앱의 한 번에 한 소리 플레이어(44px 둥근 재생 단추 + 이름 + 길이).
- **보내기 전 고지 묶음:** 되돌릴 수 없는 외부 전송 직전에는 회색 낱줄 대신 `bg-muted rounded-xl` 한 겹 정의 목록(보낼 것·가는 곳·보관·되돌리는 법·요금)에 모으고 그 아래 동의 체크 하나. 중첩 카드 없음. 767px 이하 창은 버튼 줄을 아래에 고정하고 단계 칸만 스크롤한다.
- **단계 창:** 창 머리에 단계 이름 줄(`role="group"`, 지금 단계 `aria-current="step"`, 사이 `ChevronRight`, 누를 수 없음), 767px 이하는 "2/4 원본" 한 줄. 단계를 옮기면 그 단계 제목으로 포커스.
- **잠긴 버튼:** `focusableWhenDisabled` 버튼은 기존 `lockedButton`으로 흐리게(50%) 보인다. 잠긴 이유는 가까운 회색 한 줄로.

2026-11-18 T14 빌드(로그인)에서 더한 것. 토큰은 바뀌지 않았다.

- **메뉴 없는 판:** 로그인·접근 권한 없음은 본문 바탕 위 `Card`(`rounded-2xl`, 폭 360px) 하나. `CardHeader`에 글자 로고 h1, `CardContent`에 본문(`gap-4`). 390px는 위쪽에 붙고 넓은 화면은 가운데보다 조금 위.
- **채움 버튼과 입력의 가장자리:** 입력 바로 아래 판 폭 꽉 찬 채움 버튼은 `bg-clip-border`로 투명 테두리까지 채워 입력과 바깥 폭을 맞춘다.
- **진행 중 버튼:** `Spinner data-icon="inline-start"` + "…로 끝나는 진행 문구"("로그인 중…"), 잠금.
- **폼 오류:** 버튼 바로 위 경고색 한 줄 `role="alert"`, 입력에 `aria-invalid`·`aria-describedby`로 묶는다.
- **세션이 풀린 화면:** 본문 자리 안내(제목 "로그인이 풀렸어요")와 `size="lg"` '다시 로그인' 버튼(`<a>` 전체 이동).

## Do's and Don'ts

**Do**

- product-facing 색은 시맨틱/컴포넌트 토큰(`--color-fill-*`·`--color-text-*`·`--color-border-*`·`bg-*`·`txt-*`)으로 호출하고, 글로벌 원시값은 새 role을 만들 때만 직접 참조한다 [src:3][src:2].
- 라이트·다크 양 테마를 동시에 검수한다 — 시맨틱 토큰이 테마별로 분기되므로, 한 variant를 흰 패널과 `{colors.grey-900}` 패널에 나란히 두고 확인한다 [src:2].
- 부드러운 코너가 필요한 표면은 `{component.smooth-corners-box}`(및 그 shadow-spread 변수를 재사용하는 `{component.avatar}`)로 iOS식 연속 곡률을 적용한다 — 시각 시그니처다 [src:2].
- 폼 입력 상태는 `--state-input-active/default/error` 토큰으로 표현하고, 선택 컨트롤(체크박스·라디오·스위치)은 `--color-fill-accent-green-heavier`를 공유한다 [src:2].
- 띄우는 표면은 `--layer-z-index-*` 순서(overlay 1000 → modal 1100 → toast 1200 → tooltip 1300)를 지켜 쌓는다 [src:3][src:2].
- 같은 역할에 alpha/legacy 변종이 있으면 신규 코드는 안정 또는 alpha 라인을 쓰고, `{component.legacy-tooltip}`·`{component.legacy-stack}` 같은 구버전은 마이그레이션 대상으로 둔다 [src:2].
- 모션은 150ms `cubic-bezier(0.3,0,0,1)` 범위에서 가볍게 운용하고, 비활성은 `--opacity-disabled: 0.4`로 표현한다 [src:3][src:2].
- (Omni AI TTS) 1차 액션은 대표 색 `{colors.primary}` 계열로 통일한다. 아이콘은 원문 아이콘 세트 대신 `packages/ui/components.json`의 `iconLibrary`(lucide)를 쓴다.
- (Omni AI TTS) 상태는 `*-subtle` 바탕 + 같은 색 글자 + 아이콘을 한 배지에 묶는다. 요약 띠와 활성 메뉴 바탕은 `{colors.primary-subtle}`이다.
- (Omni AI TTS) 다크 표면은 grey-900(바탕) < grey-850(카드·사이드바) < grey-800(떠 있는 면) 순서로 쌓는다.

**Don't**

- 색을 hex/rgba로 하드코딩하지 않는다 — 본 문서의 OKLCH는 Bezier가 hex로 게시한 토큰의 변환값이며, 소비처는 시맨틱 토큰 이름으로 참조한다 [src:3].
- 라이트 단일 테마만 보고 색·그림자를 고정하지 않는다 — Bezier는 다크를 1급으로 지원하므로 다크 분기를 누락하면 안 된다 [src:2].
- 부드러운 코너를 단순 `border-radius`로 흉내 내 `{component.smooth-corners-box}`를 대체하지 않는다 — squircle 곡률은 전용 컴포넌트로 그린다 [src:2].
- 11개 무지개 hue를 의미 없이 흩뿌리지 않는다 — accent는 상태·카테고리 인코딩에 쓰고, 1차 액션은 blue 계열로 통일한다 [src:3].
- 공개된 59개 목록에 없는 컴포넌트 이름을 Bezier 컴포넌트처럼 만들지 않는다 [src:2].
- 유니코드·이모지를 UI 아이콘으로 쓰지 않는다 — Bezier는 자체 602 아이콘 세트(`@channel.io/bezier-icons` [src:4], 24×24 `currentColor`, outline/`-filled` 쌍)를 단일 출처로 두며, 이모지는 콘텐츠(채팅 리액션·👋)에서만 쓴다.
- 챗봇 톤("~해보세요!")이나 마케팅 과장("혁신적", "차세대")으로 카피를 채우지 않는다 — Bezier 문서는 동작을 평이하게 서술하는 개발자 문서 톤을 유지한다 [src:1].
- 채널톡의 B2B 고객 메시징 도메인 개념·플로우(상담 인박스, 팀 인박스, 마케팅·CRM 채널 등)를 성격이 다른 제품에 그대로 이식하지 않는다 — Bezier에서 차용할 것은 시각 언어(squircle 라운딩·8~12px 반경·Inter/Noto Sans KR 2-weight 타입·11-hue 무지개 액센트·라이트+다크 시맨틱 토큰 쌍·150ms 마이크로 모션)이지 채널톡의 메시징 서비스 도메인이 아니다 [src:1].
- (Omni AI TTS) 글자를 얹는 옅은 바탕을 알파 틴트(`bg-primary/10` 등)로 만들지 않는다. 채도가 빠지고 놓이는 표면마다 색이 달라진다. 알파는 outline 버튼 hover(`primary/8`)에만 쓴다.
- (Omni AI TTS) 앱 화면에는 위치·크기 애니메이션을 더하지 않는다. 전환은 150ms 색 전환뿐이다. 1199px 이하 성우 서랍의 200ms 미끄러짐과 드롭다운 메뉴의 100ms·툴팁의 150ms 확대·미끄러짐(shadcn 생성물 그대로, 백로그)만 예외다. 공개 랜딩(`/`)은 위 '공개 랜딩 모션과 간격'을 따른다.
- 디자인시스템 이름 자체(`Bezier` 워드마크·`@channel.io/bezier-*` 패키지명)를 생성하는 제품 UI의 헤더·타이틀·버튼·라벨에 넣지 않는다 — 차용할 것은 시각 언어이지 시스템 이름이 아니다. UI 텍스트·네이밍은 자기 제품 브랜드로 재정의하고, 출처 표기가 필요하면 footer attribution(예: "Bezier 기반")에만 둔다.

## Responsive Behavior

Bezier는 앱 셸/뷰포트 브레이크포인트를 토큰으로 발행하지 않는다 — 토큰 CSS·foundation mdx 어디에도 `--breakpoint-*`나 미디어쿼리 발행값이 없다 `(no published breakpoint tokens; component-local sizing only)` [src:3][src:2]. 반응형 책임은 컴포넌트 내부의 콘텐츠-주도 폭과 앱 레이어 몫이며, 시스템은 뷰포트 비종속 빌딩블록을 제공하는 쪽이다 [src:3].

| Context | Key Changes |
| --- | --- |
| Published breakpoint system | 공개 조사 범위에서 명시적 breakpoint 토큰은 surfaced되지 않았다 `(no published breakpoint system surfaced)` — 데스크톱/모바일 레이아웃 분기는 앱 레이어에서 별도 정의해야 한다 [src:3][src:2]. |
| 일차 적응 축 | 뷰포트가 아니라 **테마**다 — autodocs 한 장 안에 같은 variant의 라이트·다크가 병치되며, 색·표면·그림자가 테마별로 분기된다 [src:2]. |
| 컴포넌트 폭 적응 | `{component.banner}`가 `UsageFullWidth`·`UsageMaxWidth`·`UsageMinWidth` 스토리로 폭 적응을, `{component.modal}`이 `--b-modal-collision-padding`으로 뷰포트 충돌 회피를 다룬다 — 반응형 책임이 컴포넌트 폭/충돌 패딩에 국한된다 [src:2]. |
| 터치 타깃 / 밀도 | 폼 공통 `--b-form-field-size`로 입력 컨트롤 높이를 일원화하고, `{component.text-field}`/`{component.button}`이 `xl/l/m/xs` 사이즈 enum으로 밀도를 바꾼다(기본 `m`) — 모바일·데스크톱 양쪽을 한 컴포넌트의 사이즈 prop으로 커버한다 [src:2]. 표준 터치 타깃(최소 44×44px)이 필요하면 더 큰 사이즈 enum을 선택해 확보한다. |
| 관찰 한계 | 제공 스크린샷은 모두 Storybook 데스크톱 autodocs 캔버스라 실제 모바일 웹/네이티브 리플로우는 직접 관찰되지 않았다 `(only desktop Storybook canvas observed; no mobile-web breakpoint surfaced)` [src:2]. |

### Omni AI TTS 앱 셸 (제품 조정)

원문에 없는 브레이크포인트를 앱 레이어에서 둘 정했다. 768px(Tailwind `md`)와 1200px(`globals.css`의 `--breakpoint-xl: 75rem`)이다.

| 폭 | 내비게이션 |
| --- | --- |
| 1200px 이상 | 왼쪽 256px 흰(다크 grey-850) 사이드바. 글자 로고(24px 700), 메뉴 글자 18px, 접힌 "다음에 열릴 화면", 바닥 줄에 로그인한 이메일(말줄임), '로그아웃' 아이콘 버튼, 그 오른쪽 끝의 테마 아이콘 버튼(T14)(누를 때마다 시스템→라이트→다크, 툴팁에 지금 값과 다음 값) |
| 768~1199px | 64px 아이콘 레일. 메뉴 이름은 화면에서 숨기고(스크린 리더에는 남김) 오른쪽 툴팁으로 보인다 |
| 767px 이하 | 위에 붙는 4칸 막대(열린 메뉴 셋 + "더보기", 아이콘 위·글자 12px 아래). "더보기"가 나머지 메뉴와 바닥 줄을 펼친다 |

본문 좌우 여백은 16px, 768px 이상 44px이다. 연결 상태 카드는 다섯이고 1280px 이상 3열(3·2), 768~1279px 2열(2·2·1), 767px 이하 1열이며 간격은 16px이다(T7.5, T7.6). 메뉴 항목의 터치 높이는 44px 이상이다.

성우 캐스팅은 1200px 이상에서 8칸 격자(`xl:grid-cols-8`, 간격 24px)로 왼쪽 목록 5칸(약 62%)과 오른쪽 성우 패널 3칸(약 38%)의 두 칸이다. 그 아래(1199px 이하)는 목록이 전체 너비이고 패널은 오른쪽 서랍으로 열린다(`useWide`의 기준은 `--breakpoint-xl`과 같은 75rem).

### Omni AI TTS 앱 정리 규칙 (제품 조정, 2026-11-19, R2 [앱 화면 공통 정리](docs/briefs/app-polish.md))

이 절이 위 앱 셸 표·문단과 Components 절의 해당 줄과 다르면 이 절이 앞선다.

- **버튼 위계:** 화면(또는 독립 구역)마다 채운 청록(`default`)은 주 행동 하나다. 보조는 `neutral`, 3차는 `ghost`·링크다. 청록 테두리 `outline`은 고른 상태(고른 조건, 활성 토글)를 보이는 곳에만 남는다. 연결 상태 카드 '다시 확인하기', 캐스팅 행 '내 문장 듣기', 드라마·프리셋·대본 보관함·내 보이스·채널·분류의 보조 동작은 `neutral`이다. 드라마 화자 띠의 성우 버튼은 `ghost`이고 성우가 정해지면 성우 이름이 그 자리에 선다(첫 빈 화자만 채운 청록이던 규칙은 없앴다).
- **사이드바:** 메뉴 글자 16px. 세 묶음(만들기: 음성 작업실·드라마 작업실 / 성우와 대본: 성우 캐스팅·성우 보관함·내 보이스·프리셋·대본 보관함 / 설정: 채널·분류·연결 상태)을 묶음 사이 24px, 묶음 안 4px로 나누고 묶음 이름 줄은 없다. 공개 데모에서는 '다음에 열릴 화면'과 '연결 상태'를 메뉴에서 숨긴다(주소는 열린다).
- **휴대폰 위 막대:** 음성 작업실 · 성우 캐스팅 · 드라마 작업실 · 더보기. DOM 순서가 보이는 순서와 같다(사이드바와 따로 렌더). 더보기 안 화면에 있으면 더보기 칸 글자가 그 화면 이름이다.
- **페이지 머리와 본문 폭:** 설명 최대 672px, 머리 아래 24px. 목록·폼 화면(대본 보관함, 프리셋, 채널·분류, 내 보이스, 연결 상태)은 768px 한 열, 탐색 화면(성우 캐스팅, 성우 보관함)은 1152px, 작업 화면은 각자 격자. 연결 상태 카드는 768px 한 열이다(위 3열·2열 문장을 대신한다).
- **빈 상태:** `EmptyState`(`Empty` > `EmptyHeader` > `EmptyMedia` 그림 + `EmptyTitle` + `EmptyDescription`, 아래 행동 하나). 그림은 마스코트 컷(`public/brand/empty-*.png`, 112px, `alt=""`, 즉시 로드), 반경·경계는 목록 카드와 같다. 행동 없는 안내는 두지 않는다. 작업실은 대본이 비면 문단 목록 자리에 빈 상태(주 '대본 붙여 넣기', 보조 '저장한 대본 열기', 3차 '직접 쓰기')를 두고, 휴대폰에서는 머리 조건 줄·레일·하단 막대를, 레일이 보이는 너비(작업실 컨테이너 `@4xl` 이상, 2단·3단)에서는 빈 작업 요약을 숨긴다(`data-empty`).
- **휴대폰 하단 막대:** 한 줄(약 72px). 이어 듣기·받기는 44px 아이콘 버튼이고 이름은 툴팁·접근 이름이다(`ICON_ONLY_PHONE`). 요약 칩은 짧은 꼴(0/3)만 보인다. 드라마 막대는 768px 이상에서 `sticky`라 이전 테이크를 가리지 않는다.
- **안내 띠와 개수:** 한 줄 안내는 `Notice compact`(`primary-subtle` 바탕). 조건 개수 같은 작은 수는 `Badge solid`(청록 채움, 흰 글자, `tabular-nums`). 고른 조건 칩의 이름은 `max-w-40` 말줄임 + `title`.
- **값 칩:** 프리셋 행의 설정 값(모델·속도·표현력)은 muted 바탕 `text-xs` 칩으로 나열한다.
- **알림 위치(MG-08, 2026-11-20):** 알림(sonner)은 평소 화면 아래(작업실 막대가 있으면 그 위)에 뜬다. 시트·대화상자·알림창 같은 모달 팝업이 열려 있는 동안에는 화면 위 가운데로 옮겨 아래에서 올라오는 시트의 값을 가리지 않는다(위 간격은 데스크톱 24px, 휴대폰은 상단 막대와 오른쪽 시트의 닫기 버튼 아래 72px). 툴팁·드롭다운 같은 비모달 팝업은 위치를 바꾸지 않는다. 행동 버튼이 있는 알림(되돌리기 등)은 모달이 열린 동안 저절로 사라지지 않고, 모달을 닫으면 원래 시간만큼 다시 흐른다(MG-09). 모달이 열린 채로도 Alt+T로 알림 목록에 가서 행동 버튼에 닿는다. 모달이 열린 채 알림 행동(되돌리기 등)을 누르면 포커스는 배경으로 나가지 않고 그 모달 안에서 마지막으로 있던 요소(없으면 모달 제목)로 돌아온다. 되돌리기는 모달이 열려 있으면 문단·대사 칸으로 포커스를 옮기지 않는다(MG-10). 휴대폰 위 간격은 상단 막대(59px) 아래 72px다.
- **포커스 윤곽(MG-10):** 프로그램 포커스를 받는 모달 제목(대화상자·알림창·시트)과 알림의 행동 버튼은 키보드 포커스일 때 `ring` 2px 실선 윤곽(오프셋 2px)을 보인다. 알림 버튼은 sonner 자체 스타일이 윤곽을 지워 중요도 표시로 덮는다.
- **시트 제목:** 공용 `SheetTitle`은 16px semibold(`text-base font-semibold`, `break-keep text-balance`)다. 성우 패널처럼 큰 제목(`text-xl`)은 굵게(`font-bold`)를 그대로 쓴다. 요약 시트처럼 열면 첫 포커스를 받는 제목이 아래 큰 숫자보다 약해 보이지 않게 한 단계 올렸다(MG-08).

## Known Gaps

- **Breakpoint 토큰 부재.** Bezier는 뷰포트 브레이크포인트를 토큰으로 발행하지 않으며, 반응형은 컴포넌트 로컬 폭과 앱 레이어 몫이다 — 데스크톱/모바일 레이아웃 분기는 다운스트림에서 정의해야 한다 [src:3][src:2].
- **alpha/legacy 컴포넌트 중복.** 같은 역할에 안정·alpha·legacy 변종이 공존한다(예: `{component.avatar}` ↔ `{component.alpha-avatar}`, `{component.tooltip}` ↔ `{component.legacy-tooltip}`, `{component.stack}` ↔ `{component.legacy-stack}`) — 어느 라인을 채택할지는 소비처가 결정해야 하며, 본 문서는 신규 코드에 안정/alpha 라인을 권장한다 [src:2].
- **hex→OKLCH 변환 오차.** 모든 색은 Bezier가 hex로 게시한 토큰을 OKLCH로 변환한 것이라 미세한 변환 드리프트가 있을 수 있다 — 정확한 원본 hex는 `@channel.io/bezier-tokens` 빌드 CSS를 직접 참조해야 한다 [src:3].
- **beta 팔레트는 이제 검증됐다(2026-07-29 정정).** 이 항목은 원래 "beta 팔레트 값 상당수가 공개 URL로 직접 교차검증되지 않는다"고 적고 있었으나, 실제로 대조해 보니 이 문서의 색 토큰 43개 전부가 `@channel.io/bezier-tokens` 0.6.0의 beta 엔트리와 ΔE ≤ 0.02로 일치했다(Colors 절 참조). 남은 공백은 **컴포넌트 정본 스펙**(Banner/Toast 처리 등)이며, 이쪽은 Storybook 개별 docs를 `?path=/docs/<id>`로 열어 대조해야 한다 [src:3][src:2].
- **시맨틱 다크 원시값 일부 미확인.** 시맨틱 토큰의 테마 분기 구조(`txt-black-darkest` 등)는 확인됐으나, 다크 측이 참조하는 일부 white-알파 원시값의 정확한 단계는 코퍼스에서 전부 발췌되지 않았다 [src:3][src:2].
- **모바일 리플로우 미관찰.** 제공 스크린샷이 데스크톱 Storybook 캔버스 한정이라, 실제 모바일 웹/네이티브에서의 컴포넌트 리플로우·접힘 거동은 직접 확인되지 않았다 [src:2].

## References

1. https://github.com/channel-io/bezier-react — 모노레포. Apache-2.0(© Channel Corp.), 이중 언어 운영 컨텍스트.
2. https://main--62bead1508281287d3c94d25.chromatic.com/ — Chromatic에 배포된 Storybook. `main--<appId>` 형태의 브랜치 퍼머링크라 빌드마다 바뀌지 않는다. **루트 URL은 JS 셸(약 9.6KB)이라 그 자체로는 읽을 내용이 없다** — 개별 문서는 `?path=/docs/<id>` 딥링크로 접근한다(예: `?path=/docs/components-button--docs`, `?path=/docs/foundation-color--docs`). 본문에서 `[src:2]`로 인용한 컴포넌트·foundation 서술은 각각 대응하는 `components-<이름 소문자>--docs` 항목을 가리킨다.
3. https://www.npmjs.com/package/@channel.io/bezier-tokens — 토큰 패키지 0.6.0. 값의 authoritative 출처이며 `dist/css`(stable, 변수 450개)·`dist/beta`·`dist/alpha` 3 tier를 함께 배포한다.
4. https://www.npmjs.com/package/@channel.io/bezier-icons — 아이콘 패키지 0.60.0, SVG 602개.
5. https://main--62bead1508281287d3c94d25.chromatic.com/index.json — 위 Storybook의 기계 판독 인덱스(엔트리 186 = docs 64 + 스토리 122). 컴포넌트 59개 이름과 docs 개수 주장을 직접 검증할 수 있는 항목이며, 루트 URL과 달리 텍스트로 내용을 반환한다.

2026-10-06 T6 빌드(채널·분류)에서 더한 것:

- **입력 창(Dialog):** 확인 창(AlertDialog)과 같은 모양이다. `popover` 면, `{rounded.radius-16}`, `ring-1` 한 겹, 안쪽 16px, 제목 20px 700, 흐려지기만 하고 확대는 없다. 768px 이상은 가운데 창(최대 448px), 767px 이하는 화면 아래에 붙는 시트(위 모서리만 둥글다, 최대 높이 화면 높이, 넘치면 시트 안에서 스크롤하고 페이지로 이어지지 않는다)이고 두 버튼이 시트 끝에 반반 선다. 값을 바꾼 동안은 바깥 누르기로 닫히지 않는다.
- **입력 칸(폼):** 라벨은 14px 700, 선택 칸은 라벨 뒤 회색 400 '(선택)'. 칸은 높이 44px 이상, `{rounded.radius-12}`, 767px 이하 16px·768px 이상 14px. 칸 오류는 칸 아래 `warning` 글자와 같은 색 경계로 알리고 화면 낭독기가 읽는다. 저장 중에는 칸이 읽기 전용이고 버튼 안 스피너와 화면 밖 '저장하는 중이에요' 안내가 함께 간다.
- **항목 목록(채널·분류):** 성우 행과 같은 그릇(`{rounded.radius-16}` 카드색 면, `ring-1 ring-inset`, 행 사이 `divide-y`)이다. 행은 안쪽 16px에 이름 16px 700, 그 아래 회색 14px 메모, 채널은 청록 14px 주소 링크(한 줄 말줄임 + 바깥 링크 아이콘)다. 오른쪽 44px 아이콘 버튼 둘(연필·휴지통)은 회색으로 두고 hover·포커스에서 진해지며 툴팁이 이름을 말한다. 묶음 머리는 20px 700 이름과 회색 'N개', 그 아래 회색 14px 예시 한 줄이고, 빈 묶음은 같은 그릇 안 회색 한 줄이다.


2026-10-07 T7 빌드(성우 보관함)에서 더한 것:

- **행의 별:** 행 오른쪽 끝(내 문장 듣기 뒤) 44px `ghost` 아이콘 버튼. 빈 별은 `muted-foreground` 윤곽, 채운 별은 `foreground` 채움(무채색, 청록을 쓰지 않는다). 담은 성우 목록 전이면 50%로 흐리고 툴팁이 이유를 말한다. 별 칸이 더해져 오른쪽 144px 칸은 목록 너비 36rem 이상에서 보인다.
- **담은 성우 행:** 공급자 알약 자리에 내 분류 칩(채널 → 카테고리 → 타입, 최대 2 + '+N')을 둔다. 칩은 기존 알약 모양이고 묶음 맨 앞 회색 12px `Tag` 아이콘이 공급자 알약과 구별한다. 좁은 행은 내 분류 1개 + '+N'만, 그 자리도 없으면 묶음을 숨긴다. '자주 사용'·'현재 이용 불가'는 회색 배지(이용 불가가 맨 앞), 행은 흐리게 하지 않는다.
- **담기 칸(패널):** 머리 '담기'(옆에 저장 중 스피너) → 즐겨찾기 윤곽 토글(켜지면 별 채움과 `foreground` 경계) + 자주 사용 스위치 → 그룹별 칩 줄(왼쪽 회색 그룹 이름 고정 폭, 윤곽 칩 44px, 칩 × 툴팁 '떼기') → '분류 붙이기'(link) → 메모(2~3줄, 'N / 200자', 저장하지 않은 변경 힌트, 꺼진 '메모 저장'은 50%) → '보관함에서 빼기'(회색 글자, 왼쪽 열에 맞춤). 캐스팅은 '내 문장 듣기' 뒤, 보관함은 '기본 샘플' 바로 뒤.
- **분류 붙이기 펼침:** 담기 칸 안에서 바로 열린다(애니메이션 없음). 테두리 상자 없이 위쪽 구분선 + 검색 칸 + 그룹별 `fieldset`(체크 줄 44px) + 그룹 끝 "+ ‘{검색어}’ {그룹} 만들기". 최대 높이 20rem, 넘치면 펼침 안에서 스크롤.
- **체크박스·스위치 포커스:** 버튼과 같은 2px 실선 `ring` 윤곽(`outline-offset-2`). 청록 50% 고리는 대비가 3:1에 못 미쳐 바꿨다.
- **보관함 조건 줄:** 캐스팅 조건 줄(`VoiceConditions`)을 그대로 쓰고 검색 칸 뒤에 보기 세 칸(전체·즐겨찾기·자주 사용, 세그먼트 모양)을 둔다. 검색 자리표시는 '이름·메모로 찾기'.