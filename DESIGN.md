---
name: TTS Pilot
category: developer
lang: ko
colors:
  primary: oklch(0.51 0.085 200)   # TTS Pilot 대표 색(청록) = brand-500. shadcn --primary로 옮기는 값
  ## TTS Pilot 대표 색 (제품 조정, 2026-10-03. 카탈로그 원문 값이 아니다)
  brand-300: oklch(0.84 0.09 198)   # 다크 hover, 다크 틴트 위 글자
  brand-350: oklch(0.78 0.105 198)   # 다크 1차 액션 채움(짙은 글자 8.8:1)
  brand-500: oklch(0.51 0.085 200)   # 라이트 1차 액션 채움과 글자(흰 바탕 5.5:1)
  brand-600: oklch(0.46 0.076 201)   # 라이트 hover
  ## TTS Pilot 상태색과 불투명 옅은 바탕 (2026-10-04, T2 빌드. globals.css 정본, 다크는 각 주석)
  success: oklch(0.5 0.1 155)   # 상태 글자·아이콘, 흰 바탕 5.71:1. 다크는 green-300
  warning: oklch(0.52 0.12 50)   # 흰 바탕 5.76:1. 다크는 orange-300
  success-subtle: oklch(0.94 0.025 160)   # success 글자 4.83:1. 다크 oklch(0.32 0.045 150), 5.58:1
  warning-subtle: oklch(0.945 0.03 60)   # warning 글자 4.88:1. 다크 oklch(0.33 0.05 58), 5.63:1
  primary-subtle: oklch(0.945 0.016 200)   # 요약 띠·활성 메뉴(= sidebar-accent), primary 글자 4.73:1. 다크 oklch(0.31 0.035 198), 6.75:1
  ## Accent global hues
  # Blue — 원문의 1차 액션 (indigo-violet)
  blue-300: oklch(0.665 0.181 280)
  blue-400: oklch(0.554 0.214 280)   # 원문의 1차 액션 색. TTS Pilot은 brand를 쓴다
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

> 출처: getdesign.kr 채널톡 항목 https://www.getdesign.kr/services/bezier/DESIGN.md (2026-10-03 받음). TTS Pilot 조정은 대표 색(청록 brand), 서체(Pretendard), 아이콘(lucide) 셋이고 각 절의 "TTS Pilot" 하위 절에 적었다. 원문 브랜드와 디자인 시스템 이름은 화면에 쓰지 않는다.

# TTS Pilot — design.md

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

### TTS Pilot 대표 색 (제품 조정)

1차 액션, 포커스 링, 활성 메뉴, 링크는 원문의 인디고 대신 청록 `{colors.primary}`(= `{colors.brand-500}`)를 쓴다. 2026-10-03 리디자인에서 사용자가 "어울리는 색상으로 잘 기획 설계해서 진행해줘"라고 맡겨 정했다. 원문 값이 아니라 TTS Pilot의 값이다.

- 원문 인디고는 원래 브랜드 색이고 옛 파랑(원티드)과도 가깝다. 보라는 AI 음성 서비스에 흔해 피했다.
- 원문 상태색(green 성공, orange 경고, red 위험, blue·cobalt 정보)과 색상각이 겹치지 않는 200° 부근이다.
- 라이트: `{colors.brand-500}` 위 흰 글자와 흰 바탕 위 `{colors.brand-500}` 글자가 모두 5.5:1이다. hover는 `{colors.brand-600}`.
- 다크: 채움은 `{colors.brand-350}`에 짙은 글자(`{colors.grey-900}`, 8.8:1), hover와 틴트 위 글자는 `{colors.brand-300}`.
- 원문의 "연한 틴트 + 진한 동색 글자" 쌍을 따르되, 틴트는 알파가 아니라 불투명 옅은 바탕(`{colors.primary-subtle}`, `{colors.success-subtle}`, `{colors.warning-subtle}`)이다. 시안의 채도로 고른 값이다. 알파 틴트는 바탕과 섞이며 채도가 빠져 시안보다 탁했고, 놓이는 표면마다 색이 달라졌다. 그 위 같은 색 글자는 라이트 4.73~4.88:1, 다크 5.58~6.75:1이다(oklch→sRGB 계산, T2 계획 토큰 표). 알파는 outline 버튼 hover(`primary/8`)에만 남는다.
- 돈이 드는 동작(생성, 시험 생성, 클론)은 앱 전체에서 같은 표식(아이콘과 글자) 하나를 함께 붙인다. 색만으로 알리지 않는다.

### TTS Pilot 상태색 (제품 조정)

상태는 초록(성공), 주황(경고), 회색(해당 없음) 셋으로 말한다. 2026-10-04 T2(연결 상태) 빌드에서 정했다.

- 라이트 글자와 아이콘은 `{colors.success}`, `{colors.warning}`이다. 원문 `green-500`·`orange-500`은 흰 바탕에서 4.39·4.15:1이라 한 단계 짙게 잡았다(흰 바탕 5.71·5.76:1).
- 다크 글자와 아이콘은 `{colors.green-300}`, `{colors.orange-300}`이다(카드 위 6.95·7.05:1).
- 상태 글자와 아이콘은 `text-success`·`text-warning`을 쓰고, 바탕은 짝이 되는 `*-subtle`이다. 회색 상태는 `muted` 바탕에 `muted-foreground` 글자다.
- `{colors.primary-subtle}`은 요약 띠와 활성 메뉴의 바탕이다. 사이드바의 `sidebar-accent`는 이 값을 그대로 가리킨다.

**The Opaque Tint Rule.** 글자를 얹는 옅은 바탕(상태 배지, 요약 띠, 활성 메뉴)은 불투명 `*-subtle` 토큰으로 칠한다. `bg-primary/10` 같은 알파 틴트로 새로 만들지 않는다.

### TTS Pilot 다크 표면 (제품 조정)

다크는 그림자 대신 명도 단계로 깊이를 낸다. 페이지 바탕 `{colors.grey-900}` < 카드와 사이드바 `{colors.grey-850}` < 팝오버·secondary·muted처럼 떠 있거나 한 단계 올라온 면 `{colors.grey-800}`. 다크 1차 액션은 `{colors.brand-350}` 채움에 `{colors.grey-900}` 글자(8.76:1)다. 보더는 `{colors.white-12}`.

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

### TTS Pilot 서체 (제품 조정)

원문의 Inter·Noto Sans KR 대신 Pretendard Variable(OFL, `next/font/local` 자체 호스팅) 하나로 라틴과 한글을 함께 쓴다. 굵기는 원문대로 400과 700 두 단계다. 숫자 열은 `tabular-nums`, 한글은 어절 단위 줄바꿈(`break-keep`)이다.

빌드에서 쓰는 크기(루트 16px 기준)는 다음과 같다. 페이지 제목 24px(768px 이상 30px) 700, 카드 제목 20px 700, 요약 띠 한 줄 18px 700, 1200px 이상 사이드바 메뉴 18px, 본문 16px, 페이지 설명 14px(768px 이상 16px), 배지·보조 글 14px, 767px 이하 위 막대 메뉴 12px. 글자색은 검정 85%(`foreground`)와 60%(`muted-foreground`) 두 단계다.

## Spacing

레이아웃은 `{component.stack}`(`--b-stack-spacing`)·HStack/VStack·`{component.center}`·`{component.box}` 프리미티브로 짠다 [src:2]. Storybook 문서 예시들이 `spacing={4/6/10/16/32}`(4px 그리드 계열) 값을 직접 사용한다 [src:2].

비활성 상태 공통 토큰으로 `--opacity-disabled: 0.4`가 있어, 다수 컴포넌트(버튼·인풋·아바타·스위치 등)가 disabled 표현에 이 값을 쓴다 [src:3][src:2]. 모션은 `--transition-duration-s 150ms` / `-m 300ms` / `-l 450ms`에 타이밍 `cubic-bezier(0.3,0,0,1)`이며, 컴포넌트는 `--motion-transition-fast`/`-default`로 참조한다 [src:3][src:2].

### TTS Pilot 모션 (제품 조정)

모션은 색 전환 하나다. Tailwind 기본 전환을 150ms `cubic-bezier(0.3,0,0,1)`로 바꿔 두고(`globals.css`의 `--default-transition-*`), 버튼·배지·메뉴는 `transition-colors`만 쓴다. 위치·크기 전환은 없다. 예외는 셋이다. 하나는 1199px 이하의 성우 서랍(`sheet.tsx`)이다. 서랍은 오른쪽 2.5rem(40px) 떨어진 투명한 자리에서 제자리로 200ms(`duration-200`, 이징은 위 기본 `cubic-bezier(0.3,0,0,1)`) 미끄러져 들어오고, 뒤 배경(`bg-black/10` + 흐림)도 같은 200ms로 투명에서 나타난다. 닫을 때는 거꾸로다. 둘째는 드롭다운 메뉴(`dropdown-menu.tsx`)의 100ms(`duration-100`) 확대(95%에서)·미끄러짐(8px)이다. shadcn 생성물 그대로이고 없애는 일은 백로그다. 셋째는 툴팁(`tooltip.tsx`)의 같은 확대·미끄러짐(기본 150ms, 생성물 그대로, 백로그)이다. `prefers-reduced-motion: reduce`에서는 이 미끄러짐을 포함해 전환과 애니메이션(스켈레톤 pulse, 스피너 회전 포함)이 사실상 멈춘다(0.01ms).

767px 이하 성우 탭 줄 오른쪽 끝의 흐림은 시간으로 움직이는 애니메이션이 아니다. 탭 줄이 넘칠 때만 스크롤 위치에 묶인 마스크(`index.css`의 `tabs-overflow-fade`, `animation-timeline: scroll(self inline)`)이고, 끝까지 넘기면 걷힌다. 흐림이 그려지는 브라우저에서는 이 흐림이 넘침을 알리므로 탭 줄 스크롤바를 숨긴다(`@supports (animation-timeline: scroll())` 안의 `scrollbar-width: none`, QA 2026-10-05).

z-index 레이어는 명시적으로 단계화돼 있다 [src:3][src:2]:

> Bezier는 앱 셸/뷰포트 브레이크포인트를 토큰으로 발행하지 않는다 — 간격 리듬은 4px 그리드 위에서 컴포넌트별 로컬 변수로 처리된다(상세는 Responsive Behavior 참조) [src:3].

## Rounded

코너 반경은 2px부터 44px까지의 토큰 램프에 비율형 한 종을 더한 구조다 — `--radius-42-p`(`42%`)는 원형/스쿼클용이다 [src:3].

관찰된 사용처는 명확하다 — 버튼은 `{rounded.radius-6}`~`{rounded.radius-16}`, 모달은 `{rounded.radius-20}`, 배너/토스트/리스트아이템은 `{rounded.radius-12}`, 프로그레스바·슬라이더 트랙은 `{rounded.radius-3}`를 쓴다 [src:3][src:2]. **8~12px가 주력**이고, 큰 컨테이너일수록 16~20px로 커진다 [src:2].

별도로 `{component.smooth-corners-box}`가 `--b-smooth-corners-box-border-radius`·`-shadow-*` 로컬 변수로 iOS식 연속 곡률(squircle)을 그리고, 아바타가 `--b-smooth-corners-box-shadow-spread-radius`를 재사용한다 — 단순 라운드를 넘어선 부드러운 코너가 브랜드 시그니처다 [src:2].

TTS Pilot 빌드의 사용처는 버튼 `{rounded.radius-8}`, 배지·메뉴 항목·인라인 코드 `{rounded.radius-6}`, 요약 띠·빈 상태 `{rounded.radius-12}`, 카드 `{rounded.radius-16}`이다.

`--radius-42-p`(`42%`)는 명세(`alpha`)의 Dimension이 px·em·rem만 받는 명세 밖 단위라 frontmatter 토큰에서 뺐고, TTS Pilot은 쓰지 않는다. 쓰게 되면 비율 곡률은 요소 크기를 따라가므로 고정 길이로 옮기지 말고 값 그대로 쓴다.

## Elevation & Depth

엘리베이션은 `--ev-1`~`--ev-6` 6단계이며, 각 단계가 inner-shadow + base-shadow + 점증하는 blur를 합성한다 — `--ev-3`은 `…, 0 4px 12px 0 var(--shdw-medium)`, `--ev-6`은 `…, 0 12px 60px 0 var(--shdw-xlarge)` 식으로 단계가 올라갈수록 퍼짐이 커진다 [src:3]. 컴포넌트는 `--elevation-1`~`--elevation-4`로 사용하며, 모달이 `--elevation-4`, 토스트·셀렉트가 `--elevation-3`, 배너가 `--elevation-2`다 [src:2].

깊이 언어도 라이트·다크 양 테마를 동등하게 다룬다 — 라이트와 다크가 `--shdw-*`를 black-알파 ↔ white/black-알파로 다르게 매핑해 테마별 그림자 강도를 보정한다 [src:3]. 다크는 별도 후처리가 아니라 그림자 토큰 레벨에서부터 분기되는 1급 테마다 [src:3][src:2].

```text
# 컴포넌트 노출 단계 (--elevation-1 ~ --elevation-4)
elevation-2: 배너                    # --ev 기반, 라이트/다크 shdw 분기
elevation-3: 토스트 / 셀렉트 / 툴팁
elevation-4: 모달
```

### TTS Pilot 깊이 (제품 조정)

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

### TTS Pilot 컴포넌트 (제품 조정)

`packages/ui`의 shadcn 컴포넌트를 위 문법에 맞춰 고친 것이다(2026-10-04 T2 빌드). 원문 컴포넌트 이름이 아니라 TTS Pilot 코드의 이름이다.

- **Button 기본(primary):** 청록 `{colors.primary}` 채움에 흰 글자, 14px 700, `{rounded.radius-8}`, 높이 32px. hover는 채움을 80%로 낮춘다. 포커스는 2px 청록 outline(간격 2px).
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
- **상태 줄:** 조건 줄 아래, 세 탭 모두 같은 자리다. 왼쪽에 회색 인원 글자(16px, `tabular-nums`, 받는 중이면 앞에 작은 스피너)와 청록 텍스트 링크('조건 모두 해제' 등, 링크 변형 44px)가 서고, 오른쪽에 정렬 메뉴(ElevenLabs·Fish Audio), 조용한 '목록 새로 고침', 받은 시각(14px 회색 `tabular-nums`)이 선다. '목록 새로 고침'은 새로 고침 아이콘이 붙은 링크 변형 44px이고 회색 보통 굵기이며 hover에서 진한 글자가 된다. 인원 글자는 스크립트가 포커스를 옮기는 자리라('모두 보기 →' 뒤) 키보드로 왔을 때만 2px 윤곽을 그린다. 문제 안내나 지난 목록 안내가 보이는 동안에는 '목록 새로 고침'이 숨고 안내 안의 '다시 불러오기'가 회복 버튼 하나다. 좁으면 오른쪽 묶음이 다음 줄로 내려간다.
- **행 목록 키보드:** 행 목록 하나가 Tab 정지 하나다(roving tabindex, `lib/roving.ts`). 지금 행의 버튼 하나만 Tab으로 닿는다. 방향키는 ↑↓가 같은 칸의 이전·다음 행, Home·End가 같은 칸의 첫·끝 행, ←→가 한 행의 기본 샘플·고르기·(캐스팅만) 내 문장 듣기·별 칸 사이다(T7). 이동만 하고 고르지 않는다(Enter·Space가 버튼 동작이다). 방향키를 쓴다는 것은 목록마다 화면 밖 한 줄('방향키로 성우와 버튼 사이를 옮겨요')로 알린다. 다시 받는 중인 목록은 60% 투명도에 누를 수 없다.

**The One Teal Rule.** 청록은 1차 동작, 활성 메뉴, 요약 띠, 포커스, 그리고 성우 캐스팅의 재생 중 표시(왼쪽 띠, '재생 중' 배지, 채운 정지 버튼), 고른 탭(글자와 밑줄), 고른 조건만 맡는다. 고른 행은 청록이 아니라 옅은 청록 바탕(`{colors.primary-subtle}`)으로 알린다. 연결 상태는 초록·주황·회색 배지로만 말한다. 슬라이더의 채운 구간·손잡이와 스위치의 켜짐 바탕은 무채색(CSS 토큰 `foreground`)이고 청록은 그 포커스 고리에만 쓴다(T5 계획 리뷰 U7, 2026-10-05).

2026-10-05 T5 빌드(내 문장 듣기)에서 더한 것:

- **문장 입력:** 목록 위 카드 안에서 모든 공급자 탭이 문장 하나를 공유한다. 입력과 직접 쓰는 말투 태그는 높이 44px 이상, 반경 12px, 모바일 16px·768px 이상 14px이다. 문장은 200코드포인트까지이고 조합 입력은 완료 뒤 제한한다. 글자 수는 숫자 폭을 고정하고 Fish Audio에는 UTF-8 바이트 수를 함께 보인다.
- **사용량 표식:** 유료 생성은 lucide `Coins` 하나로 표시한다. 카드·테두리 버튼·확인 창 위에서는 `warning`, 청록 채운 버튼 안에서는 버튼 글자색이다. 무료는 `success` 배지, 좁은 행 버튼에서는 `AudioLines`를 쓴다. 기본 샘플은 기존 `Play`다. 저장된 결과의 재생은 크레딧 0으로 설명한다.
- **Slider·Switch:** 채움과 경계는 무채색 `foreground`, 청록은 포커스에만 쓴다. 슬라이더의 조작 줄은 44px이고 썸은 16px에 투명 조작 여백을 더한다. 스위치는 36×20px에 투명 여백을 더한다. 방향키로 값을 바꿀 수 있고 값의 단위는 접근 이름·설명에 함께 둔다.
- **확인 창:** 생성과 삭제는 공용 `AlertDialog`를 쓴다. 모바일 좌우 여백은 16px, 카드 반경은 16px이고 버튼은 `lg`다. 첫 포커스는 취소, 닫히면 연 버튼으로 돌아온다. 유료 생성 창에는 문장·성우·설정·예상 사용량·남은 값과 기본 샘플을 보인다. 삭제가 진행 중이면 취소·Esc·재진입을 막는다.
- **패널의 내 문장 구역:** 기존 이용 조건 뒤, 결과 목록 앞이다. 모델마다 받는 옵션만 보이고 '처음 값으로'는 늘 자리에 둔다. 예상 사용량과 듣기·새로 만들기 줄은 패널·서랍 스크롤 바닥에 붙는다. 칸은 카드색, 서랍은 `popover`색을 사용한다.
- **성우 행과 결과:** 행은 기본 샘플·성우 고르기·내 문장 듣기의 세 칸으로 방향키 이동한다. 목록 컨테이너 42rem 미만이면 내 문장 버튼의 글자를 접근 이름으로 옮기고 44px 아이콘 버튼을 쓴다. 결과 목록은 최신 20개, 재생·정지·지우기의 짧은 줄이고 재생 상태는 플레이어가 한 번만 알린다.

## Do's and Don'ts

**Do**

- product-facing 색은 시맨틱/컴포넌트 토큰(`--color-fill-*`·`--color-text-*`·`--color-border-*`·`bg-*`·`txt-*`)으로 호출하고, 글로벌 원시값은 새 role을 만들 때만 직접 참조한다 [src:3][src:2].
- 라이트·다크 양 테마를 동시에 검수한다 — 시맨틱 토큰이 테마별로 분기되므로, 한 variant를 흰 패널과 `{colors.grey-900}` 패널에 나란히 두고 확인한다 [src:2].
- 부드러운 코너가 필요한 표면은 `{component.smooth-corners-box}`(및 그 shadow-spread 변수를 재사용하는 `{component.avatar}`)로 iOS식 연속 곡률을 적용한다 — 시각 시그니처다 [src:2].
- 폼 입력 상태는 `--state-input-active/default/error` 토큰으로 표현하고, 선택 컨트롤(체크박스·라디오·스위치)은 `--color-fill-accent-green-heavier`를 공유한다 [src:2].
- 띄우는 표면은 `--layer-z-index-*` 순서(overlay 1000 → modal 1100 → toast 1200 → tooltip 1300)를 지켜 쌓는다 [src:3][src:2].
- 같은 역할에 alpha/legacy 변종이 있으면 신규 코드는 안정 또는 alpha 라인을 쓰고, `{component.legacy-tooltip}`·`{component.legacy-stack}` 같은 구버전은 마이그레이션 대상으로 둔다 [src:2].
- 모션은 150ms `cubic-bezier(0.3,0,0,1)` 범위에서 가볍게 운용하고, 비활성은 `--opacity-disabled: 0.4`로 표현한다 [src:3][src:2].
- (TTS Pilot) 1차 액션은 대표 색 `{colors.primary}` 계열로 통일한다. 아이콘은 원문 아이콘 세트 대신 `packages/ui/components.json`의 `iconLibrary`(lucide)를 쓴다.
- (TTS Pilot) 상태는 `*-subtle` 바탕 + 같은 색 글자 + 아이콘을 한 배지에 묶는다. 요약 띠와 활성 메뉴 바탕은 `{colors.primary-subtle}`이다.
- (TTS Pilot) 다크 표면은 grey-900(바탕) < grey-850(카드·사이드바) < grey-800(떠 있는 면) 순서로 쌓는다.

**Don't**

- 색을 hex/rgba로 하드코딩하지 않는다 — 본 문서의 OKLCH는 Bezier가 hex로 게시한 토큰의 변환값이며, 소비처는 시맨틱 토큰 이름으로 참조한다 [src:3].
- 라이트 단일 테마만 보고 색·그림자를 고정하지 않는다 — Bezier는 다크를 1급으로 지원하므로 다크 분기를 누락하면 안 된다 [src:2].
- 부드러운 코너를 단순 `border-radius`로 흉내 내 `{component.smooth-corners-box}`를 대체하지 않는다 — squircle 곡률은 전용 컴포넌트로 그린다 [src:2].
- 11개 무지개 hue를 의미 없이 흩뿌리지 않는다 — accent는 상태·카테고리 인코딩에 쓰고, 1차 액션은 blue 계열로 통일한다 [src:3].
- 공개된 59개 목록에 없는 컴포넌트 이름을 Bezier 컴포넌트처럼 만들지 않는다 [src:2].
- 유니코드·이모지를 UI 아이콘으로 쓰지 않는다 — Bezier는 자체 602 아이콘 세트(`@channel.io/bezier-icons` [src:4], 24×24 `currentColor`, outline/`-filled` 쌍)를 단일 출처로 두며, 이모지는 콘텐츠(채팅 리액션·👋)에서만 쓴다.
- 챗봇 톤("~해보세요!")이나 마케팅 과장("혁신적", "차세대")으로 카피를 채우지 않는다 — Bezier 문서는 동작을 평이하게 서술하는 개발자 문서 톤을 유지한다 [src:1].
- 채널톡의 B2B 고객 메시징 도메인 개념·플로우(상담 인박스, 팀 인박스, 마케팅·CRM 채널 등)를 성격이 다른 제품에 그대로 이식하지 않는다 — Bezier에서 차용할 것은 시각 언어(squircle 라운딩·8~12px 반경·Inter/Noto Sans KR 2-weight 타입·11-hue 무지개 액센트·라이트+다크 시맨틱 토큰 쌍·150ms 마이크로 모션)이지 채널톡의 메시징 서비스 도메인이 아니다 [src:1].
- (TTS Pilot) 글자를 얹는 옅은 바탕을 알파 틴트(`bg-primary/10` 등)로 만들지 않는다. 채도가 빠지고 놓이는 표면마다 색이 달라진다. 알파는 outline 버튼 hover(`primary/8`)에만 쓴다.
- (TTS Pilot) 위치·크기 애니메이션을 더하지 않는다. 전환은 150ms 색 전환뿐이다. 1199px 이하 성우 서랍의 200ms 미끄러짐과 드롭다운 메뉴의 100ms·툴팁의 150ms 확대·미끄러짐(shadcn 생성물 그대로, 백로그)만 예외다.
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

### TTS Pilot 앱 셸 (제품 조정)

원문에 없는 브레이크포인트를 앱 레이어에서 둘 정했다. 768px(Tailwind `md`)와 1200px(`globals.css`의 `--breakpoint-xl: 75rem`)이다.

| 폭 | 내비게이션 |
| --- | --- |
| 1200px 이상 | 왼쪽 256px 흰(다크 grey-850) 사이드바. 글자 로고(24px 700), 메뉴 글자 18px, 접힌 "다음에 열릴 화면", 바닥 줄에 로컬 관리자와 그 오른쪽 끝의 테마 아이콘 버튼(누를 때마다 시스템→라이트→다크, 툴팁에 지금 값과 다음 값) |
| 768~1199px | 64px 아이콘 레일. 메뉴 이름은 화면에서 숨기고(스크린 리더에는 남김) 오른쪽 툴팁으로 보인다 |
| 767px 이하 | 위에 붙는 4칸 막대(열린 메뉴 셋 + "더보기", 아이콘 위·글자 12px 아래). "더보기"가 나머지 메뉴와 바닥 줄을 펼친다 |

본문 좌우 여백은 16px, 768px 이상 44px이다. 카드 격자는 `globals.css`의 `grid-cols-cards`(최소 240px 자동 열, 간격 16px)다. 연결 상태 카드는 1024px(`lg`) 이상 3열(CS-04)이다. 메뉴 항목의 터치 높이는 44px 이상이다.

성우 캐스팅은 1200px 이상에서 8칸 격자(`xl:grid-cols-8`, 간격 24px)로 왼쪽 목록 5칸(약 62%)과 오른쪽 성우 패널 3칸(약 38%)의 두 칸이다. 그 아래(1199px 이하)는 목록이 전체 너비이고 패널은 오른쪽 서랍으로 열린다(`useWide`의 기준은 `--breakpoint-xl`과 같은 75rem).

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