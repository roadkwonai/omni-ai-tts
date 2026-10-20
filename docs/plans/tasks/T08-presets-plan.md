# T8 프리셋 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성우 캐스팅 '내 문장 듣기'의 성우·모델·설정에 이름을 붙여 프리셋으로 저장하고, 같은 공급자의 다른 성우나 다음 방문에 불러와 같은 설정으로 듣는다. `/presets`에서 고치기·복제·지우기·채널 기본을 정하고, 성우 보관함에서 프리셋에 쓰는 성우를 거른다.

**Architecture:**
- `packages/db`: `voice_preset`(이름·공급자·담은 성우 `on delete set null`·설정 jsonb·채널 `on delete set null`)과 `channel_default_preset`(채널 기본 키, 양쪽 `cascade`). 채널 ↔ 프리셋이 서로 가리키지 않는다.
- `packages/api`: `preset-contract.ts`(입력·출력 zod, 설정은 T5 `trial-contract` 공급자 스키마 재사용, 읽을 때 쓸 수 없는 값만 처음 값으로 바꾸는 `readSettings`, 복제 이름 `copyName`), `routers/preset.ts`(프로시저 6개). 만들기·덮어쓰기는 T7 담기 `upsert`를 같은 트랜잭션에서 부른다.
- 화면: `TrialProvider`가 공급자마다 '불러온 프리셋'을 기억한다. '내 문장 듣기' 머리의 `PresetMenu`가 저장·불러오기(바뀌는 값 비교 창)·덮어쓰기를 맡는다. `/presets`는 `PresetBoard` 한 목록. 보관함은 '보기'에 '프리셋' 칸을 더하고 빼기 확인 창에 프리셋 수를 붙인다.

**Tech Stack:** Next.js 16.3 App Router(`typedRoutes`, React Compiler), React 19.3, oRPC 1.15.4, TanStack Query 5.103, zod 4.6.5, drizzle-orm·drizzle-kit 1.0.0-rc.4, Postgres(로컬 5433), vitest 5, shadcn `base-lyra`(Base UI 1.8.0), Tailwind CSS 4, Biome 2.

**Spec:** [T8 스펙](T08-presets.md)(사용자 확인 2026-10-14 "확인, 계획으로", 구속력 있는 정본). 화면 브리프 `docs/briefs/presets.md`(대조표 18행에서 쓰고 사용자 확인. Task 5 전에 있어야 한다). [로드맵 T8](../implementation-roadmap.md), `GLOSSARY.md`(프리셋·채널 기본 프리셋·성우 보관함·채널).

**계획 확인:** 사용자 2026-10-20, 실행 방식 "서브에이전트 방식"(superpowers:subagent-driven-development, 태스크마다 prokit-implementer 구현과 태스크 리뷰). 장부 `.superpowers/sdd/T08-presets-plan/progress.md`.

## 스펙과 다른 점 (계획에서 정한 것, 계획 리뷰에서 확인했다)

1. **`presetList` 출력에 `updatedAt`을 넣지 않는다.** 화면이 쓰지 않는다. 컬럼 `updated_at`은 둔다(`$onUpdate`, T9가 정렬에 쓸 수 있다).
2. **저장·덮어쓰기 뒤 지금 설정을 서버가 정리한 값으로 바꾼다.** 서버는 말투 지시 앞뒤 공백을 지우는 등 설정을 정리해 저장한다. 그 값으로 옵션 칸을 다시 그려야 저장 직후 '바뀐 값 있음'이 잘못 붙지 않는다.
3. **성우 맞춤 줄의 문구는 조사 없이 화살표로 쓴다.** 스펙 4절 예시 "이 성우는 ssfm-v30이 없어 ssfm-v21로 들어요"는 값 뒤 조사(로·으로)를 값마다 고를 수 없다. "모델 ssfm-v30 → ssfm-v21 (이 성우에서 쓰는 값)"으로 바뀌는 값 줄과 같은 문법을 쓴다(계획 리뷰 D11). 같은 이유로 처음 값 안내는 "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 모델, 감정"이다.
4. **'프리셋' 보기에서 프리셋 목록을 받는 중이면 상태 줄 끝에 " · 프리셋 목록을 받고 있어요", 실패면 " · 프리셋 목록을 받지 못했어요"를 붙인다.** 그동안 '프리셋' 보기의 결과는 빈 목록이다(스펙 4절 '진행·사유'를 이렇게 구체화).
5. **`presetList`는 서버에서 정렬하지 않는다.** 화면이 T6 `byName`(한국어·숫자 순서)으로 정렬한다. DB 콜레이션 정렬은 화면 순서와 다르다. T9도 `byName`을 쓴다.
6. **`/presets` 요약은 결과 줄과 같은 `settingsSummary`를 쓴다.** 그래서 Typecast 직접 감정('감정 기본')과 Airy 언어는 처음 값이어도 보인다(스펙 4절 '처음 값과 다른 값만'의 예외. 두 값은 소리·과금을 정한다).
7. **문구 셋:** 이름 중복은 T6 문구 꼴 "같은 이름의 프리셋이 이미 있어요."다. 덮어쓰기 질문은 "‘{이름}’ 프리셋을 지금 성우·설정으로 바꿀까요?"이고 성우 이름은 설명 줄 "성우 A → B"로 옮겼다. 확정은 브리프(18행)다.
8. **`channel_default_preset.preset_id`는 유니크 인덱스다.** 스펙은 '인덱스'였다. 프리셋은 자기 채널 하나의 기본만 될 수 있어 유니크가 맞고, 외래 키 인덱스를 겸한다.
9. **소유자가 없을 때 캐스팅 프리셋 메뉴의 잠금·툴팁 코드를 두지 않는다.** 스펙 5절은 "캐스팅 메뉴는 누를 수 없음(이유 툴팁)"이지만, 소유자가 없으면 캐스팅 화면 전체가 주소 안내로 바뀌어(`voice-casting.tsx:184`) 패널과 메뉴가 그려지지 않는다. 스펙 5절을 이렇게 고쳤다.
10. **새로 저장 중 고른 채널이 지워져 `NOT_FOUND`가 오면 창을 닫지 않는다.** 채널 목록을 다시 받고 채널을 '채널 없음'으로 되돌린 뒤 "고른 채널이 지워졌어요. 채널을 다시 골라 주세요."를 보인다. 쓴 이름을 잃지 않게 한다(계획 리뷰 F2). 고치기의 `NOT_FOUND`는 스펙대로 알리고 닫는다.

## 계획 리뷰 (2026-10-14)

세 리뷰의 결과 파일은 `.superpowers/sdd/T08-presets-plan/review-plan-{prokit,eng,design}.md`다.
- `prokit-reviewer(plan, opus)`: changes-required, max=medium, F1~F9.
- gstack `plan-eng-review(opus)`: 버리는 worktree에서 Task 1~8 코드를 고치지 않고 넣어 db·api·web 타입 검사, 계약 테스트 11개, web 테스트 183개, `/presets` 포함 `next build`가 통과했다(DB 테스트 15개는 skipped, 소유자 없음 1개 통과). approve-with-fixes, max=medium, E1~E10.
- gstack `plan-design-review(sonnet)`: 6.7/10, D1(high)~D20.

**재리뷰:** `prokit-reviewer(plan, sonnet)` changes-required, max=medium, F1~F9 모두 ADDRESSED, 새 R1(medium, Task 6이 아직 없는 `/presets`를 링크해 타입 검사 실패)·R2·R3(low, 스펙 문장 어긋남). gstack `plan-eng-review` 2차(같은 opus 에이전트, 새 worktree): 계획 코드 그대로 db·api·web 타입, 계약 17개, web 184개, build 통과, E1~E10 중 9 ADDRESSED·E8 PARTIAL, 새 N1·N2(low). 반영: R1 → '프리셋 관리'를 Task 7 Step 4로, R2·R3 → 스펙 3·4·8·9·10절, N1 → Task 4 `loadChanges`와 테스트·Task 6 `LoadDialog`, N2 → Task 5 고치기도 프리셋이 남아 있으면 창을 지킴, E8 → Task 2~4 검사에 `--write`. 결과는 `review-plan-eng-2.md`. 좁은 재리뷰(같은 reviewer): approve, max=low, R1~R3 ADDRESSED, 새 R4(low, Task 3 `--write`가 디렉터리 전체) → 고친 파일만 나열.

**사용자 결정(AskUserQuestion 2026-10-14):**
- U1 저장 값: "들은 값 그대로". 저장·덮어쓰기는 지금 성우에서 화면에 보이고 듣는 값(`requestOf` 성우 맞춤 뒤)을 보낸다. 불러오기 비교의 시작과 덮어쓰기 비교의 끝도 그 값이다(E1). 스펙 2절에 더했다.
- U2 지운 프리셋 불러오기: "최신 목록으로 확인". 메뉴를 열 때 목록을 다시 받고, '불러오기'는 최신 목록에서 한 번 더 찾아 없으면 "이미 지워졌거나 찾을 수 없어요."로 끝낸다(F1, E3). 스펙 4절에 더했다.

**반영:**
- E1·U1 → Task 4 `presetSettingsOf(voice, all)`, Task 6 저장·덮어쓰기·비교, 테스트.
- F1·E3·U2 → Task 6 `load`·메뉴 `onOpenChange`, Task 6 Step 5 확인.
- F2·E2 → Task 5 창의 `NOT_FOUND` 처리('스펙과 다른 점' 10).
- F3·E4·D3 → '스펙과 다른 점' 9(잠금 코드 없음).
- F4 → Task 5 `goneFocus`, Task 7 복제 `NOT_FOUND` 포커스.
- F5·E9 → '스펙과 다른 점' 5~8.
- F6 → `export type Row` 문장 삭제, `invalidatePresets`·`Change` 내보내지 않음, `PresetSettings` 대신 실제로 쓰는 `PresetValue`(출력 합집합)만 내보냄.
- F7 → Task 5 '고른 채널' 표시, Task 7 채널 목록 실패 줄과 다시 받기.
- F8·E7 → Task 2 공급자 다섯 정상 값 표·비객체 테스트, Task 3 고치기 이름 중복·덮어쓰기가 이름·채널·기본을 지킴·성우 빠진 프리셋 복제 테스트.
- F9 → `presetsOfVoice` → `presetCountOf`.
- E5·D16 → Task 6 '처음 값으로'가 불러온 프리셋이 있으면 켜짐, 프리셋 줄 `aria-live`·'바뀐 값 있음' 굵게, 음수 여백 삭제.
- E6 → Task 5 채널을 바꾸면 기본 체크를 푼다.
- E8 → 각 검사 단계 앞에 `biome check --write`.
- E10 → 스펙 12절에 한 줄(Fish 무료 기간 뒤 `/presets` 요약은 저장 값 그대로), T9 메모.
- D1 → 메뉴 버튼 `outline`, 브리프에 시안과 다른 자리의 이유. D2 → 메뉴 끝 '프리셋 관리'(`/presets`). D4 → '기본' 배지를 이름 줄로. D5 → 저장 창 요약 두 줄(`summary`). D6·D7 → 채널 칸 라벨 중복 제거(`RadioMenu`에 `className`), 체크 줄 전체가 라벨(44px), 꺼진 이유 줄, 채널이 없을 때 안내. D8 → `/presets` 줄이 640px 미만에서 세로로. D9 → 보관함 보기 칸 안쪽 `px-3 md:px-4`. D10 → 빼기 확인이 목록 실패를 알림. D12·D13 → 문구 정리('받기'와 '불러오기' 구분, 덮어쓰기 알림, '성우 없음'). D14 → 경고 줄 문법. D15 → 메뉴 목록만 `max-h-80` 스크롤. D17 → 지우기 확인의 채널 기본 문구. D18 → 안내를 페이지 설명 한 곳에, 목록이 비면 머리 링크 숨김. D19·D20 → Task 7·6 런타임 확인 항목.
- 기각·보류: 디자인 사용자 결정 1~3(프리셋 자리, 덮어쓰기 지름길, 보기 칸 이름)은 스펙(사용자 확인)이 이미 정한 대로 둔다(리뷰어 추천도 모두 A). QA S4에서 덮어쓰기를 찾기 어려우면 브리프에서 다시 본다. E10의 요약 기간 맞춤은 T9로 미룬다. `PresetFormDialog`와 `ClassFormDialog`의 창 틀 공통화는 세 번째 창(T9·T13)에서 한다(eng 5절).

## 브리프로 넘길 결정 (18행 `docs/briefs/presets.md`가 다룬다)

계획 리뷰(디자인)의 추천을 이 계획의 기본으로 넣었다. 브리프가 바꾸면 브리프를 따른다.
- `/presets` 목록 배치: 한 목록(이름순). 줄 순서는 이름(같은 줄 끝 '기본' 배지) → '{공급자} · {성우}' → 채널 이름 → 설정 요약 → 상태 배지. 동작 아이콘 고치기 → 복제 → 지우기. 640px 미만은 아이콘이 줄 아래 오른쪽.
- 캐스팅 '프리셋' 메뉴: `outline` 44px '프리셋 ▾'를 '처음 값으로'(ghost) 앞에 둔다. 승인 시안 `t4-casting-audition.png`는 패널 아래에 따로 '프리셋' 구역을 그렸는데, 설정 바로 옆이고 바닥 줄(sticky)에 가리지 않는 머리로 옮겼다. 이 이유를 브리프와 캐스팅 브리프 5절 5번에 적는다. 메뉴 폭 `w-72`, 목록만 스크롤(`max-h-80`), 항목 두 줄(이름 굵게 / '저장할 때 성우 …'), 끝에 '프리셋 관리'.
- 불러온 프리셋 줄: 칸 머리 바로 아래 회색 한 줄, '바뀐 값 있음'만 굵게.
- 저장·고치기 창: 저장일 때 요약 두 줄('{공급자} · {성우} · {설정 요약}', "이 성우는 성우 보관함에도 담겨요"), 이름, 채널(`RadioMenu` 가득 채움), '이 채널의 기본 프리셋으로'(줄 전체 라벨), 꺼진 이유 또는 '지금 기본 프리셋: …'.
- 불러오기 창: 바뀌는 값 → 알림 줄(성우 맞춤·성우 다름은 회색, 성우 빠짐·처음 값으로 바뀐 값은 경고 문법). 바뀌는 값이 없으면 "지금 설정과 같아요"이고 '불러오기'는 남긴다(프리셋 표시를 붙인다).
- 덮어쓰기 확인은 `ConfirmDialog`라 '덮어쓰기' 버튼이 위험 동작 색이다. 그대로 둘지 브리프에서 정한다.
- 보관함 '보기' 칸 이름 '프리셋'(스펙 그대로).
- 문구 전부(`PRESET_TEXT`의 초안은 Task 4). 브리프가 이긴다.

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`prokit-dev-cycle` 5절)에 한 번 한다. 태스크 경계는 장부에 tree SHA(`.superpowers/sdd/T08-presets-plan/tools/snap.sh`)로 적는다.
- `apps/web/.env`를 읽거나 출력하지 않는다. `packages/db/.env`도 내용을 출력하지 않는다. 테스트 DB 주소는 `source .superpowers/sdd/T08-presets-plan/tools/testdb.env`로만 넘기고 출력하지 않는다. 증거에는 "로컬 5433 `tts-pilot-app_test`"만 적는다.
- 공급자를 부르지 않는다. 이 TASK의 프로시저는 공급자 클라이언트(`context.providers`)를 쓰지 않는다. 구현 서브에이전트는 개발 서버(`127.0.0.1:3001`)로 어떤 요청도 보내지 않는다(브라우저·curl·fetch·테스트 스크립트의 `/api/rpc/*` 모두). 서버를 끄거나 다시 켜지 않는다. `pkill`·`killall`·`.next` 삭제 금지. 직접 띄운 프로세스만 PID로 끈다. `pnpm build`·DB 명령(`db:generate`·`db:migrate`)·`shadcn add`는 코디네이터만 한다.
- 로컬 관리자 모드(`AGENTS.md`):
  - 소유자는 `context.ownerId`에서만 얻고 입력으로 받지 않는다. insert는 소유자를 값의 마지막에 둔다.
  - 모든 select·update·delete에 `owner_id = 소유자` 조건을 건다. 가리킬 채널도 소유자 조건으로 고른다. 영향받은 행이 없으면 `NOT_FOUND`다.
  - Server Action·새 Route Handler를 만들지 않는다. 페이지는 막지 않고 데이터는 `protectedProcedure`가 막는다.
- 화면은 `@tts-pilot-app/api/classification-rules`·`@tts-pilot-app/api/providers/trial-options`(값)와 계약 파일(`*-contract.ts`)의 **타입만** 가져간다(`import type`). `apps/web`에 zod 의존이 없다.
- 실패 로그는 한 줄(`[preset] <단계> 실패: <오류 이름> <DB 코드>`, `stored`)이다. 이름·설정·SQL을 로그나 `ORPCError`의 `cause`·`data`에 넣지 않는다.
- 입력 규칙:
  - 이름: T6 `nameSchema`(`cleanText`, 1~40자, 원문 1,000자 상한).
  - 채널: uuid 또는 null. `channelDefault`면 채널이 있어야 한다.
  - 설정: 공급자별 `trial-contract` 스키마(`typecastSettingsSchema` 등). 공급자는 `voice.provider`와 같아야 한다.
  - `voice`: T7 `savedVoiceInputSchema`(계약 모양 + 샘플 호스트 + 20,000자 상한).
- 캐시 키: `invalidateQueries`·`cancelQueries`에는 `orpc.<프로시저>.key()`(접두), `setQueryData`·`getQueryData`에는 `queryOptions(...).queryKey`를 쓴다(`tasks/lessons.md` 2026-10-07).
- 자주 바뀌는 값을 많은 행이 읽는 컨텍스트에 두지 않는다(`tasks/lessons.md` 2026-10-07 T7.5). 불러온 프리셋은 드물게 바뀌므로 `TrialProvider`에 둔다.
- 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex·임의 값을 새로 넣지 않는다. 굵기는 `font-normal`·`font-bold`뿐이다.
- 인터랙티브 요소는 44px 이상이다(버튼 `size="lg"`·`size="icon-lg"`, 메뉴 항목 `min-h-11`). 입력 칸은 `min-h-11`이고 767px 이하에서 `text-base md:text-sm`이다. `focus-visible`이 보여야 한다. 오류·실패 문구 색은 `text-warning`이다.
- 화면 문구는 Task 4 `preset-view.ts`의 `PRESET_TEXT`와 브리프의 문구만 쓴다. 브리프가 이긴다. 문구는 `-어요` 보이스다. 이름 뒤에 조사를 붙이지 않는다("‘{이름}’ 프리셋을 …").
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(탭 들여쓰기).
- 패키지:
  - 이름: 앱 `web`, API `@tts-pilot-app/api`, DB `@tts-pilot-app/db`, UI `@tts-pilot-app/ui`.
  - 테스트: API는 `pnpm --filter @tts-pilot-app/api test [파일]`, web은 `pnpm --filter web test [파일]`.
  - DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다(`source …/testdb.env`). skipped는 통과가 아니다.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `shortcut:` 주석으로 남긴다.

## Review Focus

- **두 번 누르기·동시 같은 이름:** 저장 버튼을 빠르게 두 번 누르거나 두 탭에서 같은 이름으로 저장하면 프리셋이 두 행이 된다.
  - Task 3 "같은 이름 동시 저장 → 한 행, 나머지 CONFLICT"(유니크 인덱스, 조회로 막지 않음)
  - Task 5 폼의 `sendingRef`(렌더를 기다리지 않고 막는다)
  - QA S6
- **남의 채널 id 끼워 넣기:** B가 A의 채널 id로 저장·고치면 A 채널의 기본 프리셋이 B의 것으로 바뀌거나, A가 채널을 지울 때 B의 프리셋이 영향받는다.
  - Task 3 격리 "B가 A의 채널 id로 만들기·고치기 → NOT_FOUND, A의 기본 그대로"(`ownChannel`)
- **다른 공급자 설정 끼워 넣기:** Typecast 프리셋에 Gemini 설정으로 덮어쓰거나, ElevenLabs 성우에 Typecast 프리셋을 불러오면 계약에 없는 값이 요청으로 간다.
  - Task 2 "공급자와 성우 공급자가 다르면 거절"
  - Task 3 "다른 공급자로 덮어쓰기 BAD_REQUEST, 프리셋 그대로"
  - Task 6 메뉴는 그 공급자 프리셋만 보인다
- **들은 값과 저장 값의 어긋남:** v21만 있는 Typecast 성우(또는 무료 기간 뒤 Fish Audio)에서 저장하면 화면에 들은 값이 아닌 맞추기 전 값이 저장된다(사용자 결정 U1).
  - Task 4 "v21만 있는 성우에서는 화면에 보이는 ssfm-v21·감정 직접을 저장한다"
  - Task 6 저장·덮어쓰기·비교가 `presetSettingsOf(voice, trial.settings)`를 쓴다
- **계약이 바뀐 옛 설정:** 모델이 없어지거나 범위가 줄면 목록 출력 검사가 실패해 `/presets` 전체가 500이 된다.
  - Task 2 `readSettings` 단위 테스트(없어진 모델·범위 밖·v21 감정)
  - Task 3 "DB에 옛 값을 넣은 프리셋 → 목록이 처음 값과 fixed로 온다"
- **채널·성우를 지운 뒤 남는 표시:** 채널을 지워도 '기본' 배지가 남거나, 보관함에서 뺀 성우가 프리셋에 계속 보인다.
  - Task 3 "채널 지우기 → 채널·기본 풀림", "보관함 빼기 → 성우 null"
  - Task 8 빼기·채널 지우기 뒤 프리셋 목록 무효화
  - QA S9·S10

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다.

- `prokit-db`:
  - 스키마는 `packages/db/src/schema/preset.ts`에 두고 `schema/index.ts`에서 export한다.
  - 마이그레이션은 `pnpm --filter @tts-pilot-app/db db:generate`로 만들고 생성 SQL을 읽는다(의도하지 않은 DROP·타입 축소 없음). 로컬과 테스트 DB에 `db:migrate`한 뒤 다시 generate해 변경 없음을 본다.
  - 시각 컬럼은 `timestamp(..., { withTimezone: true }).defaultNow().notNull()`, `updated_at`은 `$onUpdate`(스킬 예시).
  - `user` 외래 키는 걸지 않는다(ADR 0004, 스펙 3절). 되돌리기 어려운 결정(채널 기본 연결 표)은 ADR 0005로 남긴다. `docs/domain/project.md` 데이터 표의 `용어` 칸을 고친다(Task 9).
- `supabase-postgres-best-practices`:
  - `schema-foreign-key-indexes`: `voice_preset.saved_voice_id`·`channel_id`에 인덱스(보관함 빼기·채널 지우기의 `set null`이 쓴다). `channel_default_preset.preset_id`는 유니크 인덱스가 덮는다.
  - `data-upsert`: 채널 기본 지정은 `insert … on conflict (channel_id) do update`다. 성우 담기는 T7 `upsert` 재사용.
  - `schema-data-types`: provider는 enum 대신 text + `check`(T6·T7 관례).
  - `lock-short-transactions`: 트랜잭션 안은 DB 문장뿐이다(공급자 호출 없음).
  - `schema-constraints`: 제약은 drizzle-kit이 만든 마이그레이션으로만 더한다(손 SQL 없음).
- `prokit-api`:
  - 불변식 1·2: 프로시저 6개 모두 `protectedProcedure`, 소유자는 `context.ownerId`만(이 프로젝트의 로컬 관리자 규칙으로 읽는다).
  - 불변식 3: update·delete와 채널 선택에 `owner_id`, 없으면 `NOT_FOUND`.
  - 불변식 4: 입력 zod(이름 길이, uuid, 공급자별 설정), 출력 zod.
  - 불변식 7: 채널 소유 검사는 권한 판정이다. 대조표에 security 리뷰 행(37행)을 직접 더했다.
  - 격리 테스트는 같은 작업(Task 3, `references/ownership-test.md`의 세 경우).
- `prokit-web`:
  - `apps/web/AGENTS.md`를 읽었다. 번들 문서 `01-app/03-api-reference/03-file-conventions/page.md`(페이지는 기본 Server Component, `metadata`).
  - 조회는 `useQuery(orpc.presetList.queryOptions(OWNED_LIST))`, 변경은 `useMutation` 뒤 `orpc.presetList.key()` 무효화.
  - loading·empty·error·비인가(`LoopbackNotice`)를 나눈다. 페이지는 Server Component이고 클라이언트 경계는 `PresetBoard`부터다. `/presets`는 주소 쿼리를 쓰지 않아 `Suspense`가 필요 없다.
- `vercel-react-best-practices`:
  - `rerender-derived-state-no-effect`: 바뀌는 값·성우 맞춤·'바뀐 값 있음'·보관함 프리셋 성우 집합은 렌더 중 계산이다.
  - `rerender-move-effect-to-event`: 불러오기·저장은 이벤트 처리기와 `mutate` 콜백에서 한다(effect 없음).
  - `rerender-functional-setstate`: `TrialProvider`의 설정·불러온 프리셋은 함수형 갱신.
- `shadcn`: `base-lyra`다. 새 프리미티브는 없다. 메뉴는 `DropdownMenu`(`Item`·`Separator`·`Group`), 창은 `Dialog`·`AlertDialog`(`ConfirmDialog`), 체크는 `Checkbox`, 배지는 `Badge`.
- `prokit-ui`(+ impeccable `craft-floor.md`): UI 태스크(5~8) 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 브리프(18행)가 기준이다. 리뷰(critique·audit)는 메인 세션에서 한다.
- `tts-provider`: 이번 프로시저는 공급자를 부르지 않는다(설정 계약 `trial-contract` 재사용뿐). 그래서 공급자 연동 규칙은 적용할 곳이 없다. 리뷰어는 diff에 공급자 연동이 없음을 확인한다.

## 설치본·문서로 확인한 것

| 대상 | 확인 결과 | 위치 |
|---|---|---|
| zod 교집합 | `z.object({...}).and(z.discriminatedUnion("provider", [...]))`가 양쪽 모르는 키를 버리고 기본값을 채운다. Typecast v21 감정 위반은 경로 `["settings","preset"]` | 2026-10-14 임시 테스트(지움), zod 4.6.5 |
| 공급자 설정 스키마 | `typecastSettingsSchema`(v21 감정 refine), `elevenLabsSettingsSchema`, `fishSettingsSchema`, `airySettingsSchema`, `geminiSettingsSchema`. 키 순서는 `DEFAULT_SETTINGS`와 같다 | `providers/trial-contract.ts:36-85` |
| T7 담기 | `upsert(db \| tx, ownerId, voice, patch): Promise<string>`(모듈 내부), `voiceOf(row)`(계약 어긋난 옛 행은 이름 자리에 성우 id) | `routers/saved-voice.ts:51-60,106-129` |
| 저장소 오류 틀 | `stored(prefix, step, run, mapError?)`, `found(row)`, `dbCode(error)` | `voice-cache.ts:66,298,316` |
| 이름 중복 판정 | `classification.ts`의 `isDuplicateName`(23505 + 인덱스 이름 집합)이 모듈 내부 | `routers/classification.ts:28-38` |
| 이름 스키마 | `nameSchema`는 모듈 내부 const, `memoSchema`·`deleteInputSchema`·`deletedSchema`는 export | `classification-contract.ts:17-21,54,68` |
| 소유자 미들웨어 | `requireOwner`가 `context.ownerId`를 string으로 좁힌다 | `packages/api/src/index.ts:9-16` |
| drizzle `$onUpdate` | 컬럼 빌더에 있다 | `drizzle-orm/column-builder.d.ts:209` |
| 설정 상태 | `TrialProvider`의 `settings: SettingsOf`(공급자마다 하나), `setSetting`·`resetSettings`. 옵션 칸은 `TrialSection`의 `resetKey`로 다시 그린다 | `trial-provider.tsx:112,377-391`, `trial-section.tsx:375-404` |
| 설정 글자 | `FIELD_LABEL`, `valueText`, `emotionLabel`, `LANGUAGE_LABEL`, `AIRY_STYLE_LABEL`, `settingsSummary`(모델 + 기본값과 다른 값) | `lib/trial-view.ts:52-70,319-369` |
| 성우 맞춤 | `requestOf(voice, text, settings, now)`: Typecast 모델·감정을 성우에 맞추고 Fish Audio 무료 모델 종료 뒤 `s2.1-pro` | `lib/trial-view.ts:142-210` |
| 사용 칸 | `usedSettings(request)`: 모델 + 그 모델이 받는 칸(정리한 값) | `providers/trial-options.ts:265-285` |
| 창 | `ClassFormDialog`(이름 검사·중복·NOT_FOUND·`sendingRef`·한글 조합 Enter), `ConfirmDialog`(변경 한 번, 실패 시 창 유지) | `class-form-dialog.tsx`, `confirm-dialog.tsx` |
| 고르기 | `RadioMenu({ label, value, options, onChange, strong })` | `voice-conditions.tsx:268` |
| 행 동작 | `RowAction`(44px 아이콘 버튼 + 툴팁)이 모듈 내부 | `class-group.tsx:45-75` |
| 보관함 | `filterSaved(items, filters)`의 보기 판정이 `item[filters.view]`, `VIEWS` 세 칸, 빼기 확인 `RemoveDialog`, `useRemoveVoice` | `lib/saved-voice-view.ts:34,95-112`, `library-filters.tsx:29-33`, `saved-section.tsx:293-330`, `saved-voices.tsx:181-196` |
| 메뉴 | `UPCOMING_ITEMS`의 '프리셋'(`SlidersHorizontal`) → `OPEN_ITEMS`로 옮긴다 | `app-nav.tsx:39-58` |
| 메타 제목 | `layout.tsx`의 `title.template "%s · TTS Pilot"` → 페이지는 `title: "프리셋"` | `app/layout.tsx` |

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `packages/db/src/schema/preset.ts`, `schema/index.ts`, `migrations/<생성>/` | 표 둘 | 1 |
| `packages/api/src/classification-contract.ts` | `nameSchema` export | 2 |
| `packages/api/src/preset-contract.ts`, `.test.ts` | 입력·출력 zod, `readSettings`, `copyName` | 2 |
| `packages/api/src/voice-cache.ts` | `isUniqueViolation(error, ...names)`(T6 `isDuplicateName`을 옮겨 두 라우터가 쓴다) | 3 |
| `packages/api/src/routers/classification.ts` | `isUniqueViolation` 사용 | 3 |
| `packages/api/src/routers/saved-voice.ts` | `upsert`·`voiceOf` export(동작 그대로) | 3 |
| `packages/api/src/routers/preset.ts`, `routers/index.ts` | 프로시저 6개, `...presetRouter` | 3 |
| `packages/api/src/routers/preset.test.ts`, `preset.isolation.test.ts` | 테스트 | 3 |
| `apps/web/src/lib/trial-view.ts`, `.test.ts` | `optionText`(옵션 이름·값 글자), `settingsSummary`가 그것을 쓴다 | 4 |
| `apps/web/src/lib/preset-view.ts`, `.test.ts` | 문구, 바뀌는 값, 성우 맞춤, 같은 설정, 요약, 배지, 빼기 문구 | 4 |
| `apps/web/src/lib/saved-voice-view.ts`, `.test.ts` | 보기 `preset`, `filterSaved`의 프리셋 성우 집합 | 4 |
| `apps/web/src/components/presets.tsx` | 프리셋 쿼리·변경 훅 | 5 |
| `apps/web/src/components/preset-form-dialog.tsx` | 저장·고치기 창(이름·채널·채널 기본) | 5 |
| `apps/web/src/components/trial-provider.tsx` | 불러온 프리셋 기억, `loadPreset`, `loaded` | 6 |
| `apps/web/src/components/preset-menu.tsx` | 캐스팅 메뉴, 불러오기 창, 덮어쓰기 확인, 불러온 프리셋 줄 | 6 |
| `apps/web/src/components/trial-section.tsx` | 머리에 메뉴와 줄 | 6 |
| `apps/web/src/app/(app)/presets/page.tsx` | 페이지 | 7 |
| `apps/web/src/components/preset-board.tsx` | `/presets` 본문 | 7 |
| `apps/web/src/components/class-group.tsx` | `RowAction` export | 7 |
| `apps/web/src/components/app-nav.tsx` | 메뉴 이동 | 7 |
| `apps/web/src/components/library-filters.tsx`, `voice-library.tsx`, `saved-section.tsx`, `saved-voices.tsx`, `class-delete-dialog.tsx` | '프리셋' 보기, 빼기 문구, 무효화 | 8 |
| 문서 | `docs/domain/project.md`, `docs/briefs/site-map.md`, `docs/briefs/casting.md`·`voices.md`, `docs/adr/0005-…`, 로드맵 | 9 |

## 대조표 행과 태스크

| 행 | 태스크 |
|---|---|
| 3 [design] | 이 계획의 '설치본·문서로 확인한 것'·'파일 구조'·Global Constraints(재사용·설정 결정) |
| 4 계획 리뷰 | 이 계획 + 스펙 + 기존 파일 목록 |
| 5 구현 방식 | 실행 방식 선택 뒤 장부 시작 |
| 6 스키마·dbGenerate | Task 1 |
| 7 타입·린트, 8 로컬 migrate, 9 Neon(`.neon` 없음 확인 뒤 N/A 또는 임시 브랜치), 10 파괴적 변경(새 표 둘, 없음), 11 prokit-reviewer(db) | Task 1 뒤 코디네이터 |
| 12 zod 계약 | Task 2 |
| 13 구현, 14 격리, 15 타입·린트·테스트 | Task 2~3 |
| 16 prokit-reviewer(code), 37 prokit-reviewer(security) | Task 3 뒤. security focus: 채널 소유 검사, 소유자 덮기, 다른 공급자 설정, 입력 상한, 로그 누출 |
| 17 impeccable context, 18 shape 브리프 | Task 4 뒤, Task 5 전 메인 세션(사용자 확인) |
| 19 UI 구현 | Task 4~8 |
| 20~31 검증·리뷰·QA | 구현 뒤 |
| 36 문서 영향 | Task 9 |

---

### Task 1: 프리셋 표 둘 (DB 명령은 코디네이터)

**Files:**
- Create: `packages/db/src/schema/preset.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create(생성물): `packages/db/src/migrations/<시각>_<이름>/`

**Interfaces:**
- Produces: `voicePreset`, `channelDefaultPreset`(drizzle 표). 컬럼 이름은 아래 그대로.

- [ ] **Step 1: 스키마 파일을 쓴다**

```ts
// packages/db/src/schema/preset.ts
import { sql } from "drizzle-orm";
import {
	check,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { channel } from "./classification";
import { savedVoice } from "./saved-voice";

// 프리셋(T8 스펙 3절, GLOSSARY '프리셋'). 한 공급자의 담은 성우·설정(모델 포함) 조합에 이름을 붙인 것.
// 성우를 보관함에서 빼거나 채널을 지우면 그 칸만 비고 프리셋은 남는다(on delete set null).
// user 외래 키는 걸지 않는다(ADR 0004와 같다, T14에서 정한다)
export const voicePreset = pgTable(
	"voice_preset",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		name: text("name").notNull(),
		provider: text("provider")
			.$type<"typecast" | "elevenlabs" | "fish_audio" | "airy" | "gemini">()
			.notNull(),
		// 프리셋의 성우(담은 성우). null이면 '성우를 다시 골라 주세요'
		savedVoiceId: uuid("saved_voice_id").references(() => savedVoice.id, {
			onDelete: "set null",
		}),
		// 그 공급자 설정 전체(모델 포함). 쓸 때 trial-contract 공급자 스키마로 정리한 값이고, 읽을 때 다시 검사한다(preset-contract readSettings)
		settings: jsonb("settings").notNull(),
		channelId: uuid("channel_id").references(() => channel.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// 같은 소유자 안 대소문자 무시 중복 금지(T6 channel_name과 같다). 조회가 아니라 이 인덱스가 막는다(동시 저장 포함).
		// 이름은 라우터의 CONFLICT 판정이 쓴다. 목록 조회(owner_id)도 앞 컬럼을 쓴다
		uniqueIndex("voice_preset_name").on(t.ownerId, sql`lower(${t.name})`),
		// 외래 키 컬럼은 자동 인덱스가 없다(schema-foreign-key-indexes). 보관함 빼기·채널 지우기의 set null이 쓴다
		index("voice_preset_saved_voice").on(t.savedVoiceId),
		index("voice_preset_channel").on(t.channelId),
		check(
			"voice_preset_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio', 'airy', 'gemini')`,
		),
	],
);

// 채널 기본 프리셋(T8 스펙 2절, ADR 0005). 채널마다 하나(기본 키), 프리셋은 한 채널의 기본만 된다(유니크).
// 채널 ↔ 프리셋이 서로 가리키지 않게 따로 둔다. 어느 쪽을 지워도 이 줄이 지워진다.
// 기본 프리셋의 채널이 그 프리셋의 채널인지는 프로시저가 같은 트랜잭션에서 지킨다(routers/preset.ts setDefault)
export const channelDefaultPreset = pgTable(
	"channel_default_preset",
	{
		channelId: uuid("channel_id")
			.primaryKey()
			.references(() => channel.id, { onDelete: "cascade" }),
		presetId: uuid("preset_id")
			.notNull()
			.references(() => voicePreset.id, { onDelete: "cascade" }),
	},
	(t) => [uniqueIndex("channel_default_preset_preset").on(t.presetId)],
);
```

- [ ] **Step 2: export를 더한다**

`packages/db/src/schema/index.ts`에 한 줄을 더한다(알파벳 순서 유지).

```ts
export * from "./auth";
export * from "./classification";
export * from "./preset";
export * from "./provider-cache";
export * from "./saved-voice";
export * from "./trial-generation";
```

- [ ] **Step 3: 타입 검사 (구현자)**

Run: `pnpm --filter @tts-pilot-app/db check-types`
Expected: exit 0

- [ ] **Step 4: 마이그레이션 생성과 검토 (코디네이터)**

```bash
pnpm --filter @tts-pilot-app/db db:generate
```

생성된 `migration.sql`을 읽고 확인한다:
- `CREATE TABLE "voice_preset"`·`"channel_default_preset"` 둘, `CREATE UNIQUE INDEX "voice_preset_name" ... (lower("name"))`, 인덱스 셋, check 하나, 외래 키 넷(`ON DELETE set null` 둘, `cascade` 둘).
- 다른 표의 DROP·ALTER가 없다.

- [ ] **Step 5: 적용 (코디네이터)**

```bash
pnpm --filter @tts-pilot-app/db db:migrate
source .superpowers/sdd/T08-presets-plan/tools/testdb.env && DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @tts-pilot-app/db db:migrate
pnpm --filter @tts-pilot-app/db db:generate   # "No schema changes" 확인
```

Expected: 두 DB 모두 적용 성공, 다시 generate는 변경 없음. 출력에는 호스트·DB 이름만 적는다.

---

### Task 2: 프리셋 계약 (`preset-contract.ts`)

**Files:**
- Modify: `packages/api/src/classification-contract.ts:17-21`(`nameSchema` export)
- Create: `packages/api/src/preset-contract.ts`
- Test: `packages/api/src/preset-contract.test.ts`

**Interfaces:**
- Consumes: `trial-contract.ts` 공급자 설정 스키마 다섯, `savedVoiceInputSchema`(T7), `nameSchema`(T6), `DEFAULT_SETTINGS`·`SettingsOf`·`codePoints`(trial-options), `NAME_MAX`(classification-rules).
- Produces:
  - `presetSettingsSchema`(`{ provider, settings }` 공급자 구분 합집합)
  - `presetCreateInputSchema`: `{ name, channelId: string | null, channelDefault: boolean, voice } & { provider, settings }`
  - `presetOverwriteInputSchema`: `{ id, voice } & { provider, settings }`
  - `presetUpdateInputSchema`: `{ id, name, channelId, channelDefault }`
  - `presetSchema`(출력 한 줄): `{ id, name, savedVoiceId, voice: Voice | null, unavailable, channelId, channelDefault, fixed: string[] } & { provider, settings }`
  - 타입 `Preset`, `PresetValue`(`z.output<typeof presetSettingsSchema>`, 공급자와 설정의 짝이 지켜지는 합집합), `PresetCreateInput`, `PresetOverwriteInput`, `PresetUpdateInput`
  - `readSettings<P>(provider: P, raw: unknown): { settings: SettingsOf[P]; fixed: string[] }`
  - `copyName(name: string, taken: readonly string[]): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// packages/api/src/preset-contract.test.ts
import { describe, expect, it } from "vitest";

import {
	copyName,
	presetCreateInputSchema,
	presetOverwriteInputSchema,
	presetUpdateInputSchema,
	readSettings,
} from "./preset-contract";
import { emptyVoice } from "./providers/list";
import { DEFAULT_SETTINGS } from "./providers/trial-options";

const VOICE = {
	...emptyVoice("typecast", "public"),
	voiceId: "tc_a",
	name: "민지",
};
const CHANNEL = "11111111-1111-4111-8111-111111111111";

describe("readSettings(스펙 2절 '쓸 수 없는 값')", () => {
	it("지금 계약에 맞는 값은 그대로이고 fixed는 비었다", () => {
		const typecast = { ...DEFAULT_SETTINGS.typecast, tempo: 1.1, pitch: -1 };
		expect(readSettings("typecast", typecast)).toEqual({
			settings: typecast,
			fixed: [],
		});
	});
	it("없어진 모델은 처음 값이고 나머지 값은 남는다", () => {
		expect(
			readSettings("elevenlabs", {
				...DEFAULT_SETTINGS.elevenlabs,
				model: "eleven_v2_old",
				stability: 0.3,
			}),
		).toEqual({
			settings: { ...DEFAULT_SETTINGS.elevenlabs, stability: 0.3 },
			fixed: ["model"],
		});
	});
	it("범위 밖 값은 처음 값이다", () => {
		expect(
			readSettings("fish_audio", { ...DEFAULT_SETTINGS.fish_audio, speed: 9 }),
		).toEqual({ settings: DEFAULT_SETTINGS.fish_audio, fixed: ["speed"] });
	});
	it("Typecast v21이 받지 않는 감정은 감정만 처음 값이다(모델은 남는다)", () => {
		expect(
			readSettings("typecast", {
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
				preset: "whisper",
			}),
		).toEqual({
			settings: {
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
			},
			fixed: ["preset"],
		});
	});
	it("모르는 칸은 버리고 빠진 칸은 처음 값이며 둘 다 fixed에 넣지 않는다", () => {
		expect(
			readSettings("gemini", { model: "gemini-3.8-flash-tts", extra: 1 }),
		).toEqual({ settings: DEFAULT_SETTINGS.gemini, fixed: [] });
	});
	// 공급자마다 처음 값이 아닌 정상 값. 공급자와 스키마 짝이 어긋나면(예: airy↔gemini) 여기서 잡힌다(계획 리뷰 F8)
	it.each([
		["typecast", { ...DEFAULT_SETTINGS.typecast, model: "ssfm-v21", emotion: "preset", preset: "sad", tempo: 1.2 }],
		["elevenlabs", { ...DEFAULT_SETTINGS.elevenlabs, model: "eleven_multilingual_v2", style: 0.4 }],
		["fish_audio", { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro", temperature: 0.3 }],
		["airy", { ...DEFAULT_SETTINGS.airy, language: "en", style: "calm" }],
		["gemini", { ...DEFAULT_SETTINGS.gemini, model: "gemini-3.8-flash-lite-tts", direction: "차분하게" }],
	] as const)("%s 정상 값은 그대로다", (provider, settings) => {
		expect(readSettings(provider, settings)).toEqual({ settings, fixed: [] });
	});
	it("객체가 아닌 값은 처음 값이다", () => {
		for (const raw of [null, "x", 3])
			expect(readSettings("typecast", raw)).toEqual({
				settings: DEFAULT_SETTINGS.typecast,
				fixed: [],
			});
	});
});

describe("입력 계약(스펙 3절)", () => {
	const create = {
		name: "  경제   내레이션 ",
		channelId: null,
		channelDefault: false,
		voice: VOICE,
		provider: "typecast",
		settings: DEFAULT_SETTINGS.typecast,
	};
	it("이름을 정리하고 모르는 키(ownerId)는 버린다", () => {
		const parsed = presetCreateInputSchema.parse({
			...create,
			ownerId: "someone",
		});
		expect(parsed.name).toBe("경제 내레이션");
		expect("ownerId" in parsed).toBe(false);
	});
	it("성우 공급자와 설정 공급자가 다르면 거절한다", () => {
		expect(
			presetCreateInputSchema.safeParse({
				...create,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}).success,
		).toBe(false);
		expect(
			presetOverwriteInputSchema.safeParse({
				id: CHANNEL,
				voice: VOICE,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}).success,
		).toBe(false);
	});
	it("채널 없이 채널 기본은 거절하고, 채널이 있으면 된다", () => {
		expect(
			presetCreateInputSchema.safeParse({ ...create, channelDefault: true })
				.success,
		).toBe(false);
		expect(
			presetUpdateInputSchema.safeParse({
				id: CHANNEL,
				name: "a",
				channelId: null,
				channelDefault: true,
			}).success,
		).toBe(false);
		expect(
			presetCreateInputSchema.safeParse({
				...create,
				channelId: CHANNEL,
				channelDefault: true,
			}).success,
		).toBe(true);
	});
	it("빈 이름·41자 이름은 거절하고 40자는 된다", () => {
		for (const [name, ok] of [
			["   ", false],
			["가".repeat(41), false],
			["가".repeat(40), true],
		] as const)
			expect(presetCreateInputSchema.safeParse({ ...create, name }).success).toBe(
				ok,
			);
	});
});

describe("copyName(복제 이름)", () => {
	it("'사본', 있으면 '사본 2', '사본 3'(대소문자 무시)", () => {
		expect(copyName("Econ", ["Econ"])).toBe("Econ 사본");
		expect(copyName("Econ", ["Econ", "econ 사본"])).toBe("Econ 사본 2");
		expect(copyName("Econ", ["Econ", "Econ 사본", "Econ 사본 2"])).toBe(
			"Econ 사본 3",
		);
	});
	it("40자를 넘으면 앞 이름을 줄인다", () => {
		const name = "가".repeat(40);
		const copy = copyName(name, [name]);
		expect([...copy]).toHaveLength(40);
		expect(copy.endsWith(" 사본")).toBe(true);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @tts-pilot-app/api test src/preset-contract.test.ts`
Expected: FAIL — `Cannot find module './preset-contract'`

- [ ] **Step 3: `nameSchema`를 export한다**

`packages/api/src/classification-contract.ts`에서 `const nameSchema`를 `export const nameSchema`로 바꾼다(정의는 그대로).

- [ ] **Step 4: 계약을 쓴다**

```ts
// packages/api/src/preset-contract.ts
import { z } from "zod";

import { nameSchema } from "./classification-contract";
import { NAME_MAX } from "./classification-rules";
import { type ProviderId, voiceSchema } from "./providers/contract";
import {
	airySettingsSchema,
	elevenLabsSettingsSchema,
	fishSettingsSchema,
	geminiSettingsSchema,
	typecastSettingsSchema,
} from "./providers/trial-contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	type SettingsOf,
} from "./providers/trial-options";
import { savedVoiceInputSchema } from "./saved-voice-contract";

// 프리셋 프로시저의 입력·출력(T8 스펙 3절). 설정은 내 문장 듣기와 같은 공급자별 스키마로 검사·정리한다(T5 계약 재사용).
// 화면은 이 파일에서 타입만 가져간다(import type)
const SETTINGS_SCHEMA = {
	typecast: typecastSettingsSchema,
	elevenlabs: elevenLabsSettingsSchema,
	fish_audio: fishSettingsSchema,
	airy: airySettingsSchema,
	gemini: geminiSettingsSchema,
} as const;

// 공급자와 그 설정 한 벌. 입력·출력이 함께 쓴다
export const presetSettingsSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("typecast"),
		settings: typecastSettingsSchema,
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		settings: elevenLabsSettingsSchema,
	}),
	z.object({ provider: z.literal("fish_audio"), settings: fishSettingsSchema }),
	z.object({ provider: z.literal("airy"), settings: airySettingsSchema }),
	z.object({ provider: z.literal("gemini"), settings: geminiSettingsSchema }),
]);
// 공급자와 설정의 짝(화면이 저장 값을 만들 때 쓴다. Pick<Preset, …>은 짝을 잃는다)
export type PresetValue = z.output<typeof presetSettingsSchema>;

const channelFields = {
	name: nameSchema,
	channelId: z.uuid().nullable(),
	channelDefault: z.boolean(),
};
// 채널 없이 채널 기본은 없다
const defaultNeedsChannel = (input: {
	channelId: string | null;
	channelDefault: boolean;
}) => !input.channelDefault || input.channelId !== null;
// 프리셋의 성우는 그 공급자 성우다(다른 공급자 설정이 요청으로 가지 않게)
const sameProvider = (input: {
	voice: { provider: ProviderId };
	provider: ProviderId;
}) => input.voice.provider === input.provider;

export const presetCreateInputSchema = z
	.object({ ...channelFields, voice: savedVoiceInputSchema })
	.and(presetSettingsSchema)
	.refine(defaultNeedsChannel, { message: "channel_default" })
	.refine(sameProvider, { message: "provider" });
export type PresetCreateInput = z.input<typeof presetCreateInputSchema>;

export const presetOverwriteInputSchema = z
	.object({ id: z.uuid(), voice: savedVoiceInputSchema })
	.and(presetSettingsSchema)
	.refine(sameProvider, { message: "provider" });
export type PresetOverwriteInput = z.input<typeof presetOverwriteInputSchema>;

export const presetUpdateInputSchema = z
	.object({ id: z.uuid(), ...channelFields })
	.refine(defaultNeedsChannel, { message: "channel_default" });
export type PresetUpdateInput = z.input<typeof presetUpdateInputSchema>;

// 목록 한 줄. settings는 쓸 수 없는 값을 처음 값으로 바꾼 것이고 fixed가 바꾼 칸 이름이다(readSettings)
export const presetSchema = z
	.object({
		id: z.uuid(),
		name: z.string(),
		savedVoiceId: z.uuid().nullable(),
		// 담은 성우의 정보. 보관함에서 빠졌으면 null
		voice: voiceSchema.nullable(),
		unavailable: z.boolean(),
		channelId: z.uuid().nullable(),
		channelDefault: z.boolean(),
		fixed: z.array(z.string()),
	})
	.and(presetSettingsSchema);
export type Preset = z.output<typeof presetSchema>;

// 저장한 설정을 지금 계약으로 읽는다(스펙 2절 '쓸 수 없는 값'). 통과하지 못한 칸만 처음 값으로 두고 그 이름을 fixed에 담는다.
// 앞 칸부터 하나씩 더해 검사하므로 칸끼리의 규칙(Typecast v21 감정)은 뒤 칸(preset)이 처음 값이 된다.
// 모르는 칸은 버리고 빠진 칸은 처음 값이다(계약이 칸을 더하거나 뺐을 뿐 값이 틀린 것이 아니다)
export function readSettings<P extends ProviderId>(
	provider: P,
	raw: unknown,
): { settings: SettingsOf[P]; fixed: string[] } {
	const schema = SETTINGS_SCHEMA[provider] as unknown as z.ZodType<
		SettingsOf[P]
	>;
	const whole = schema.safeParse(raw);
	if (whole.success) return { settings: whole.data, fixed: [] };
	const stored =
		raw !== null && typeof raw === "object"
			? (raw as Record<string, unknown>)
			: {};
	const kept: Record<string, unknown> = {};
	const fixed: string[] = [];
	for (const key of Object.keys(DEFAULT_SETTINGS[provider])) {
		if (!(key in stored)) continue;
		if (schema.safeParse({ ...kept, [key]: stored[key] }).success)
			kept[key] = stored[key];
		else fixed.push(key);
	}
	return { settings: schema.parse(kept), fixed };
}

// 복제 이름: '{이름} 사본', 있으면 '사본 2', '사본 3'… 이름 규칙(40자)을 넘으면 앞 이름을 줄인다.
// 같은 이름 비교는 유니크 인덱스(lower)와 같게 대소문자를 무시한다
export function copyName(name: string, taken: readonly string[]): string {
	const used = new Set(taken.map((entry) => entry.toLowerCase()));
	for (let n = 1; ; n += 1) {
		const suffix = n === 1 ? " 사본" : ` 사본 ${n}`;
		const base = [...name]
			.slice(0, NAME_MAX - codePoints(suffix))
			.join("")
			.trimEnd();
		const candidate = `${base}${suffix}`;
		if (!used.has(candidate.toLowerCase())) return candidate;
	}
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm exec biome check --write packages/api/src/preset-contract.ts packages/api/src/preset-contract.test.ts packages/api/src/classification-contract.ts && pnpm --filter @tts-pilot-app/api test src/preset-contract.test.ts && pnpm --filter @tts-pilot-app/api check-types`
Expected: PASS(테스트 17개), check-types exit 0

---

### Task 3: 프리셋 프로시저 6개와 테스트

**Files:**
- Modify: `packages/api/src/voice-cache.ts`(끝에 `isUniqueViolation`)
- Modify: `packages/api/src/routers/classification.ts:27-44`(`isDuplicateName` → `isUniqueViolation`)
- Modify: `packages/api/src/routers/saved-voice.ts:51,106`(`voiceOf`·`upsert` 앞에 `export`)
- Create: `packages/api/src/routers/preset.ts`
- Modify: `packages/api/src/routers/index.ts`(import와 `...presetRouter`)
- Test: `packages/api/src/routers/preset.test.ts`, `packages/api/src/routers/preset.isolation.test.ts`

**Interfaces:**
- Consumes: Task 1 표, Task 2 계약, `upsert`·`voiceOf`(T7), `stored`·`found`·`dbCode`(voice-cache), `deleteInputSchema`·`deletedSchema`(T6).
- Produces(oRPC, 모두 `protectedProcedure`):
  - `presetList(): Preset[]`(순서 없음, 화면이 이름순)
  - `presetCreate(PresetCreateInput): Preset`
  - `presetOverwrite(PresetOverwriteInput): Preset`
  - `presetUpdate(PresetUpdateInput): Preset`
  - `presetDuplicate({ id }): Preset`
  - `presetRemove({ id }): { deleted: true }`
  - 오류: 이름 중복 `CONFLICT`(`data.reason: "duplicate_name"`), 없음·남의 것 `NOT_FOUND`, 다른 공급자 덮어쓰기·입력 위반 `BAD_REQUEST`, 소유자 없음 `UNAUTHORIZED`.
  - `isUniqueViolation(error: unknown, ...names: string[]): boolean`(voice-cache)

- [ ] **Step 1: 실패하는 테스트를 쓴다(기능)**

```ts
// packages/api/src/routers/preset.test.ts
import { createRouterClient } from "@orpc/server";
import { channel } from "@tts-pilot-app/db/schema/classification";
import {
	channelDefaultPreset,
	voicePreset,
} from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `preset-${Date.now()}`;
const me = createRouterClient(appRouter, {
	context: { db, ownerId: OWNER, providers: null } as Context,
});
const voiceOf = (voiceId: string, name = voiceId) => ({
	...emptyVoice("typecast", "public"),
	voiceId,
	name,
	previewUrl: "https://static.typecast.ai/a.mp3",
});
const A = voiceOf("tc_a", "민지");
const B = voiceOf("tc_b", "준호");
const TC = { ...DEFAULT_SETTINGS.typecast, tempo: 1.1, pitch: -1 };
const input = (over: Record<string, unknown> = {}) => ({
	name: "경제 내레이션",
	channelId: null as string | null,
	channelDefault: false,
	voice: A,
	provider: "typecast" as const,
	settings: TC,
	...over,
});
const newChannel = (name: string) =>
	me.channelCreate({ name, memo: "", url: "" });
const MISSING = "00000000-0000-4000-8000-000000000000";

async function clean() {
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(channel);
	await db.delete(trialGeneration);
}

describe.skipIf(!url)("프리셋(T8 스펙 3·8절)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("만들기 왕복: 성우가 보관함에 담기고 목록에 한 줄", async () => {
		const made = await me.presetCreate(input({ name: "  경제   내레이션 " }));
		expect(made).toMatchObject({
			name: "경제 내레이션",
			provider: "typecast",
			settings: TC,
			voice: A,
			unavailable: false,
			channelId: null,
			channelDefault: false,
			fixed: [],
		});
		const saved = await me.savedVoiceList();
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({
			id: made.savedVoiceId,
			favorite: false,
			frequent: false,
		});
		expect(await me.presetList()).toEqual([made]);
	});

	it("이미 담긴 성우의 즐겨찾기·메모는 그대로다", async () => {
		await me.savedVoiceSave({ voice: A, favorite: true, memo: "차분" });
		await me.presetCreate(input());
		expect((await me.savedVoiceList())[0]).toMatchObject({
			favorite: true,
			memo: "차분",
		});
	});

	it("이름 중복(대소문자 무시)은 CONFLICT이고 동시 저장도 한 행", async () => {
		await me.presetCreate(input({ name: "Econ" }));
		await expect(
			me.presetCreate(input({ name: "econ" })),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
		const results = await Promise.allSettled([
			me.presetCreate(input({ name: "같이" })),
			me.presetCreate(input({ name: "같이" })),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(await me.presetList()).toHaveLength(2);
	});

	it("채널 기본은 채널마다 하나이고 채널을 바꾸면 이전 기본이 풀린다", async () => {
		const ch = await newChannel("경제");
		const ch2 = await newChannel("주말");
		const p1 = await me.presetCreate(
			input({ name: "하나", channelId: ch.id, channelDefault: true }),
		);
		expect(p1.channelDefault).toBe(true);
		const p2 = await me.presetCreate(
			input({ name: "둘", channelId: ch.id, channelDefault: true }),
		);
		const byId = async () =>
			Object.fromEntries(
				(await me.presetList()).map((p) => [p.id, p.channelDefault]),
			);
		expect(await byId()).toEqual({ [p1.id]: false, [p2.id]: true });
		await me.presetUpdate({
			id: p2.id,
			name: "둘",
			channelId: ch2.id,
			channelDefault: false,
		});
		expect(await byId()).toEqual({ [p1.id]: false, [p2.id]: false });
		expect(await db.select().from(channelDefaultPreset)).toEqual([]);
	});

	it("고치기: 이름·채널·채널 기본을 바꾸고 설정·성우는 그대로", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(input());
		const updated = await me.presetUpdate({
			id: made.id,
			name: "새 이름",
			channelId: ch.id,
			channelDefault: true,
		});
		expect(updated).toMatchObject({
			name: "새 이름",
			channelId: ch.id,
			channelDefault: true,
			settings: TC,
			voice: A,
		});
	});

	it("채널을 지우면 프리셋은 남고 채널과 기본만 풀린다", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		await me.channelDelete({ id: ch.id });
		expect(await me.presetList()).toEqual([
			{ ...made, channelId: null, channelDefault: false },
		]);
		expect(await db.select().from(channelDefaultPreset)).toEqual([]);
	});

	it("보관함에서 빼면 성우만 비고, 덮어쓰기로 다시 붙는다", async () => {
		const made = await me.presetCreate(input());
		await me.savedVoiceRemove({ id: made.savedVoiceId ?? MISSING });
		expect(await me.presetList()).toEqual([
			{ ...made, savedVoiceId: null, voice: null },
		]);
		const changed = { ...TC, tempo: 1.3 };
		const over = await me.presetOverwrite({
			id: made.id,
			voice: B,
			provider: "typecast",
			settings: changed,
		});
		expect(over).toMatchObject({ voice: B, settings: changed });
		expect(over.savedVoiceId).not.toBeNull();
	});

	it("다른 공급자로 덮어쓰기는 BAD_REQUEST이고 프리셋은 그대로", async () => {
		const made = await me.presetCreate(input());
		const gemini = {
			...emptyVoice("gemini", "public"),
			voiceId: "kore",
			name: "Kore",
		};
		await expect(
			me.presetOverwrite({
				id: made.id,
				voice: gemini,
				provider: "gemini",
				settings: DEFAULT_SETTINGS.gemini,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(await me.presetList()).toEqual([made]);
		expect(await me.savedVoiceList()).toHaveLength(1);
	});

	it("복제: '사본', '사본 2', 같은 채널, 기본은 아니다", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		const one = await me.presetDuplicate({ id: made.id });
		const two = await me.presetDuplicate({ id: made.id });
		expect(one).toMatchObject({
			name: "경제 내레이션 사본",
			channelId: ch.id,
			channelDefault: false,
			settings: TC,
			savedVoiceId: made.savedVoiceId,
		});
		expect(two.name).toBe("경제 내레이션 사본 2");
	});

	it("지우기: 줄과 기본 지정이 사라지고 내 문장 결과는 그대로", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		await db.insert(trialGeneration).values({
			requestId: crypto.randomUUID(),
			comboKey: "k",
			provider: "typecast",
			voiceId: "tc_a",
			model: "ssfm-v30",
			settings: TC,
			text: "안녕하세요",
			usageAmount: 15,
			usageUnit: "credit",
			status: "done",
			audio: Buffer.from([1, 2, 3]),
			audioType: "audio/mpeg",
			expiresAt: new Date(Date.now() + 86_400_000),
			ownerId: OWNER,
		});
		expect(await me.presetRemove({ id: made.id })).toEqual({ deleted: true });
		expect(await me.presetList()).toEqual([]);
		expect(await db.select().from(channelDefaultPreset)).toEqual([]);
		expect(await db.select().from(trialGeneration)).toHaveLength(1);
	});

	it("계약이 받지 않는 옛 값은 처음 값과 fixed로 읽는다", async () => {
		const made = await me.presetCreate(input());
		await db
			.update(voicePreset)
			.set({ settings: { ...TC, model: "ssfm-v99" } })
			.where(eq(voicePreset.id, made.id));
		expect((await me.presetList())[0]).toMatchObject({
			settings: { ...TC, model: "ssfm-v30" },
			fixed: ["model"],
		});
	});

	it("고치기로 다른 프리셋 이름(대소문자만 다름)이 되면 CONFLICT이고 이름은 그대로", async () => {
		await me.presetCreate(input({ name: "Econ" }));
		const other = await me.presetCreate(input({ name: "주말" }));
		await expect(
			me.presetUpdate({
				id: other.id,
				name: "econ",
				channelId: null,
				channelDefault: false,
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			data: { reason: "duplicate_name" },
		});
		expect((await me.presetList()).map((p) => p.name).sort()).toEqual([
			"Econ",
			"주말",
		]);
	});

	it("덮어쓰기는 이름·채널·채널 기본을 그대로 둔다", async () => {
		const ch = await newChannel("경제");
		const made = await me.presetCreate(
			input({ channelId: ch.id, channelDefault: true }),
		);
		const over = await me.presetOverwrite({
			id: made.id,
			voice: B,
			provider: "typecast",
			settings: { ...TC, pitch: 3 },
		});
		expect(over).toMatchObject({
			name: made.name,
			channelId: ch.id,
			channelDefault: true,
		});
	});

	it("성우가 빠진 프리셋을 복제하면 사본도 성우가 비었다", async () => {
		const made = await me.presetCreate(input());
		await me.savedVoiceRemove({ id: made.savedVoiceId ?? MISSING });
		const copy = await me.presetDuplicate({ id: made.id });
		expect(copy).toMatchObject({ savedVoiceId: null, voice: null });
	});

	it("없는 id·없는 채널은 NOT_FOUND이고 아무것도 바뀌지 않는다", async () => {
		await expect(
			me.presetCreate(input({ channelId: MISSING })),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await me.savedVoiceList()).toEqual([]);
		for (const call of [
			() =>
				me.presetUpdate({
					id: MISSING,
					name: "a",
					channelId: null,
					channelDefault: false,
				}),
			() =>
				me.presetOverwrite({
					id: MISSING,
					voice: A,
					provider: "typecast",
					settings: TC,
				}),
			() => me.presetDuplicate({ id: MISSING }),
			() => me.presetRemove({ id: MISSING }),
		])
			await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await me.savedVoiceList()).toEqual([]);
	});
});
```

- [ ] **Step 2: 실패하는 테스트를 쓴다(격리)**

```ts
// packages/api/src/routers/preset.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import { channel } from "@tts-pilot-app/db/schema/classification";
import { voicePreset } from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `preset-iso-a-${Date.now()}`;
const B = `preset-iso-b-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const VOICE = {
	...emptyVoice("typecast", "public"),
	voiceId: "tc_a",
	name: "민지",
};
const SETTINGS = DEFAULT_SETTINGS.typecast;

async function clean() {
	await db.delete(voicePreset);
	await db.delete(savedVoice);
	await db.delete(channel);
}

describe.skipIf(!url)("프리셋 소유자 격리(스펙 8절 11번)", () => {
	beforeEach(clean);
	afterAll(async () => {
		await clean();
		await db.$client.end();
	});

	it("B는 A의 프리셋을 보지 못하고 고치기·덮어쓰기·복제·지우기가 NOT_FOUND이며 A는 그대로", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const mine = await as(A).presetCreate({
			name: "A 프리셋",
			channelId: ch.id,
			channelDefault: true,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
		});
		expect(await as(B).presetList()).toEqual([]);
		for (const call of [
			() =>
				as(B).presetUpdate({
					id: mine.id,
					name: "B가 바꿈",
					channelId: null,
					channelDefault: false,
				}),
			() =>
				as(B).presetOverwrite({
					id: mine.id,
					voice: VOICE,
					provider: "typecast",
					settings: { ...SETTINGS, tempo: 2 },
				}),
			() => as(B).presetDuplicate({ id: mine.id }),
			() => as(B).presetRemove({ id: mine.id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).presetList()).toEqual([mine]);
		// 덮어쓰기가 거절되며 B의 보관함에도 아무것도 담기지 않았다(트랜잭션 되돌림)
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("B가 A의 채널 id로 만들기·고치기는 NOT_FOUND이고 A 채널의 기본은 그대로", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const mine = await as(A).presetCreate({
			name: "A 프리셋",
			channelId: ch.id,
			channelDefault: true,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
		});
		await expect(
			as(B).presetCreate({
				name: "B 프리셋",
				channelId: ch.id,
				channelDefault: true,
				voice: VOICE,
				provider: "typecast",
				settings: SETTINGS,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const theirs = await as(B).presetCreate({
			name: "B 프리셋",
			channelId: null,
			channelDefault: false,
			voice: VOICE,
			provider: "typecast",
			settings: SETTINGS,
		});
		await expect(
			as(B).presetUpdate({
				id: theirs.id,
				name: "B 프리셋",
				channelId: ch.id,
				channelDefault: true,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(await as(A).presetList()).toEqual([mine]);
		expect((await as(B).presetList())[0]).toMatchObject({
			channelId: null,
			channelDefault: false,
		});
	});

	it("같은 이름도 소유자가 다르면 따로 만든다", async () => {
		const make = (owner: string) =>
			as(owner).presetCreate({
				name: "같은 이름",
				channelId: null,
				channelDefault: false,
				voice: VOICE,
				provider: "typecast",
				settings: SETTINGS,
			});
		const mine = await make(A);
		const theirs = await make(B);
		expect(theirs.id).not.toBe(mine.id);
	});
});

describe("소유자 없음(스펙 8절 11번)", () => {
	it("프로시저 6개 모두 UNAUTHORIZED이고 DB 접근이 0회", async () => {
		let dbTouches = 0;
		const failingDb = new Proxy(
			{},
			{
				get() {
					dbTouches += 1;
					throw new Error("db access without owner");
				},
			},
		) as Context["db"];
		const nobody = as(null, failingDb);
		const id = crypto.randomUUID();
		for (const call of [
			() => nobody.presetList(),
			() =>
				nobody.presetCreate({
					name: "a",
					channelId: null,
					channelDefault: false,
					voice: VOICE,
					provider: "typecast",
					settings: SETTINGS,
				}),
			() =>
				nobody.presetOverwrite({
					id,
					voice: VOICE,
					provider: "typecast",
					settings: SETTINGS,
				}),
			() =>
				nobody.presetUpdate({
					id,
					name: "a",
					channelId: null,
					channelDefault: false,
				}),
			() => nobody.presetDuplicate({ id }),
			() => nobody.presetRemove({ id }),
		])
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
	});
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `source .superpowers/sdd/T08-presets-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/preset.test.ts src/routers/preset.isolation.test.ts`
Expected: FAIL — `me.presetCreate is not a function`(라우터 없음). skipped면 `TEST_DATABASE_URL`을 넘기지 못한 것이다.

- [ ] **Step 4: 이름 중복 판정을 공통으로 옮긴다**

`packages/api/src/voice-cache.ts` 끝(`found` 뒤)에 더한다:

```ts
// 유니크 인덱스 위반(23505)이고 그 인덱스가 names 가운데 하나인가(이름 중복 → CONFLICT). drizzle은 pg 오류를 cause에 넣는다(T6 계획 리뷰 E9)
export function isUniqueViolation(error: unknown, ...names: string[]): boolean {
	const constraint = (error as { cause?: { constraint?: unknown } } | null)
		?.cause?.constraint;
	return (
		dbCode(error) === "23505" &&
		typeof constraint === "string" &&
		names.includes(constraint)
	);
}
```

`packages/api/src/routers/classification.ts`에서 `NAME_INDEXES`·`isDuplicateName`을 지우고 `duplicateName`을 이렇게 바꾼다(import에 `isUniqueViolation`을 더하고 쓰지 않게 된 `dbCode`는 뺀다):

```ts
// 같은 그룹 같은 이름: 이름 유니크 인덱스(schema/classification.ts) 위반만 본다
const duplicateName = (error: unknown) =>
	isUniqueViolation(error, "channel_name", "classification_name")
		? new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } })
		: null;
```

- [ ] **Step 5: 담기 함수 둘을 내보낸다**

`packages/api/src/routers/saved-voice.ts`의 `function voiceOf(row: Row)`와 `async function upsert(`에 `export`를 붙인다. 동작은 바꾸지 않는다.

- [ ] **Step 6: 라우터를 쓴다**

```ts
// packages/api/src/routers/preset.ts
import { ORPCError } from "@orpc/server";
import { channel } from "@tts-pilot-app/db/schema/classification";
import {
	channelDefaultPreset,
	voicePreset,
} from "@tts-pilot-app/db/schema/preset";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { deletedSchema, deleteInputSchema } from "../classification-contract";
import type { Context } from "../context";
import { protectedProcedure } from "../index";
import {
	copyName,
	type Preset,
	presetCreateInputSchema,
	presetOverwriteInputSchema,
	presetSchema,
	presetUpdateInputSchema,
	readSettings,
} from "../preset-contract";
import {
	dbCode,
	found,
	isUniqueViolation,
	stored as sharedStored,
} from "../voice-cache";
import { upsert, voiceOf } from "./saved-voice";

type Db = Context["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// 같은 이름은 이름 유니크 인덱스가 막는다(동시 저장 포함). 고른 채널·성우가 그사이 지워지면 외래 키 위반(23503)이라 없는 항목과 같게 NOT_FOUND
const mapError = (error: unknown) =>
	isUniqueViolation(error, "voice_preset_name")
		? new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } })
		: dbCode(error) === "23503"
			? new ORPCError("NOT_FOUND")
			: null;
const stored = <T>(step: string, run: () => Promise<T>) =>
	sharedStored("[preset]", step, run, mapError);

const mine = (ownerId: string, id: string) =>
	and(eq(voicePreset.id, id), eq(voicePreset.ownerId, ownerId));

// 가리킬 채널은 내 것만. 없거나 남의 것이면 NOT_FOUND(prokit-api 불변식 3)
async function ownChannel(tx: Tx, ownerId: string, channelId: string | null) {
	if (channelId === null) return;
	const [row] = await tx
		.select({ id: channel.id })
		.from(channel)
		.where(and(eq(channel.id, channelId), eq(channel.ownerId, ownerId)));
	found(row);
}

// 이 프리셋의 기본 지정을 풀고, on이면 그 채널의 기본을 이 프리셋으로 바꾼다(채널마다 하나, data-upsert).
// 프리셋의 채널을 바꾸거나 비워도 먼저 푸는 이 한 곳이 이전 채널의 기본을 정리한다(스펙 2절 '기본 프리셋의 채널')
async function setDefault(
	tx: Tx,
	presetId: string,
	channelId: string | null,
	on: boolean,
) {
	await tx
		.delete(channelDefaultPreset)
		.where(eq(channelDefaultPreset.presetId, presetId));
	if (on && channelId !== null)
		await tx
			.insert(channelDefaultPreset)
			.values({ channelId, presetId })
			.onConflictDoUpdate({
				target: channelDefaultPreset.channelId,
				set: { presetId },
			});
}

// 프리셋과 그 담은 성우·기본 지정. 담은 성우 조인에도 소유자를 건다(프리셋이 가리키는 성우는 늘 내 것이지만 읽기에서 한 번 더 막는다)
async function listOf(
	db: Db | Tx,
	ownerId: string,
	id?: string,
): Promise<Preset[]> {
	const rows = await db
		.select({
			preset: voicePreset,
			saved: savedVoice,
			defaultOf: channelDefaultPreset.channelId,
		})
		.from(voicePreset)
		.leftJoin(
			savedVoice,
			and(
				eq(savedVoice.id, voicePreset.savedVoiceId),
				eq(savedVoice.ownerId, voicePreset.ownerId),
			),
		)
		.leftJoin(
			channelDefaultPreset,
			eq(channelDefaultPreset.presetId, voicePreset.id),
		)
		.where(id ? mine(ownerId, id) : eq(voicePreset.ownerId, ownerId));
	return rows.map(({ preset, saved, defaultOf }) => {
		const { settings, fixed } = readSettings(preset.provider, preset.settings);
		// provider와 settings의 짝은 readSettings가 지킨다(TS가 합집합의 짝을 따라가지 못한다)
		return {
			id: preset.id,
			name: preset.name,
			provider: preset.provider,
			settings,
			savedVoiceId: saved ? preset.savedVoiceId : null,
			voice: saved ? voiceOf(saved) : null,
			unavailable: saved?.unavailable ?? false,
			channelId: preset.channelId,
			channelDefault: defaultOf !== null,
			fixed,
		} as Preset;
	});
}

const one = async (db: Db | Tx, ownerId: string, id: string) =>
	found((await listOf(db, ownerId, id))[0]);

// 프리셋(T8 스펙 3절). 소유자는 context.ownerId뿐이고 모든 조회·변경에 owner_id 조건을 건다.
// insert 값은 소유자를 마지막에 두고, update는 바꿀 칸만 적는다(입력 스키마가 바뀌어도 소유자가 덮이지 않게, T6 계획 리뷰 E8).
// 트랜잭션 안은 DB 문장뿐이다(공급자 호출 없음, lock-short-transactions)
export const presetRouter = {
	presetList: protectedProcedure
		.output(z.array(presetSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("목록", () => listOf(db, ownerId)),
		),
	presetCreate: protectedProcedure
		.input(presetCreateInputSchema)
		.output(presetSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("만들기", () =>
				db.transaction(async (tx) => {
					await ownChannel(tx, ownerId, input.channelId);
					// 프리셋의 성우는 보관함에 담는다(즐겨찾기·자주 사용·메모는 그대로, 스펙 2절)
					const savedVoiceId = await upsert(tx, ownerId, input.voice, {});
					const [row] = await tx
						.insert(voicePreset)
						.values({
							name: input.name,
							provider: input.provider,
							savedVoiceId,
							settings: input.settings,
							channelId: input.channelId,
							ownerId,
						})
						.returning({ id: voicePreset.id });
					const { id } = found(row);
					await setDefault(tx, id, input.channelId, input.channelDefault);
					return one(tx, ownerId, id);
				}),
			),
		),
	presetOverwrite: protectedProcedure
		.input(presetOverwriteInputSchema)
		.output(presetSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("덮어쓰기", () =>
				db.transaction(async (tx) => {
					const [current] = await tx
						.select({ provider: voicePreset.provider })
						.from(voicePreset)
						.where(mine(ownerId, input.id));
					// 설정은 공급자마다 칸이 달라 다른 공급자로 바꾸지 않는다(새로 저장한다)
					if (found(current).provider !== input.provider)
						throw new ORPCError("BAD_REQUEST");
					const savedVoiceId = await upsert(tx, ownerId, input.voice, {});
					const [row] = await tx
						.update(voicePreset)
						.set({ savedVoiceId, settings: input.settings })
						.where(mine(ownerId, input.id))
						.returning({ id: voicePreset.id });
					found(row);
					return one(tx, ownerId, input.id);
				}),
			),
		),
	presetUpdate: protectedProcedure
		.input(presetUpdateInputSchema)
		.output(presetSchema)
		.handler(({ input, context: { db, ownerId } }) =>
			stored("고치기", () =>
				db.transaction(async (tx) => {
					await ownChannel(tx, ownerId, input.channelId);
					const [row] = await tx
						.update(voicePreset)
						.set({ name: input.name, channelId: input.channelId })
						.where(mine(ownerId, input.id))
						.returning({ id: voicePreset.id });
					found(row);
					await setDefault(
						tx,
						input.id,
						input.channelId,
						input.channelDefault,
					);
					return one(tx, ownerId, input.id);
				}),
			),
		),
	presetDuplicate: protectedProcedure
		.input(deleteInputSchema)
		.output(presetSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("복제", () =>
				db.transaction(async (tx) => {
					const [source] = await tx
						.select()
						.from(voicePreset)
						.where(mine(ownerId, id));
					const { name, provider, savedVoiceId, settings, channelId } =
						found(source);
					const names = await tx
						.select({ name: voicePreset.name })
						.from(voicePreset)
						.where(eq(voicePreset.ownerId, ownerId));
					// 채널 기본은 복제하지 않는다(채널마다 하나)
					const [row] = await tx
						.insert(voicePreset)
						.values({
							name: copyName(
								name,
								names.map((entry) => entry.name),
							),
							provider,
							savedVoiceId,
							settings,
							channelId,
							ownerId,
						})
						.returning({ id: voicePreset.id });
					return one(tx, ownerId, found(row).id);
				}),
			),
		),
	presetRemove: protectedProcedure
		.input(deleteInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored("지우기", async () => {
				const [row] = await db
					.delete(voicePreset)
					.where(mine(ownerId, id))
					.returning({ id: voicePreset.id });
				found(row);
				return { deleted: true as const };
			}),
		),
};
```

`packages/api/src/routers/index.ts`:

```ts
import { presetRouter } from "./preset";
// … appRouter 끝
	...classificationRouter,
	...savedVoiceRouter,
	// 프리셋 여섯 프로시저(T8)
	...presetRouter,
};
```

- [ ] **Step 7: 통과를 확인한다**

Run: `pnpm exec biome check --write packages/db/src/schema/preset.ts packages/db/src/schema/index.ts packages/api/src/voice-cache.ts packages/api/src/routers/preset.ts packages/api/src/routers/preset.test.ts packages/api/src/routers/preset.isolation.test.ts packages/api/src/routers/classification.ts packages/api/src/routers/saved-voice.ts packages/api/src/routers/index.ts && source .superpowers/sdd/T08-presets-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test && pnpm --filter @tts-pilot-app/api check-types`
Expected: 전체 PASS(새 테스트 19개 포함, skipped 0), check-types exit 0. T6 분류 테스트(이름 중복 CONFLICT)도 그대로 통과해야 한다(`isUniqueViolation`으로 옮긴 회귀).

---

### Task 4: 화면 순수 함수 (`optionText`, `preset-view.ts`, 보관함 '프리셋' 보기)

**Files:**
- Modify: `apps/web/src/lib/trial-view.ts:339-369`(`optionText` 더하고 `settingsSummary`가 쓴다)
- Test: `apps/web/src/lib/trial-view.test.ts`
- Create: `apps/web/src/lib/preset-view.ts`, `apps/web/src/lib/preset-view.test.ts`
- Modify: `apps/web/src/lib/saved-voice-view.ts:20,34,85-112`
- Test: `apps/web/src/lib/saved-voice-view.test.ts`

**Interfaces:**
- Consumes: `Preset`·`PresetValue`(Task 2 타입), `requestOf`·`settingsSummary`(trial-view), `usedSettings`·`DEFAULT_SETTINGS`(trial-options), `PROVIDER_LABEL`(connection-view), `LIBRARY_TEXT`(saved-voice-view).
- Produces:
  - `optionText(provider, field, value): { label: string; value: string }`(trial-view)
  - `PRESET_TEXT`, 알림·질문 문구 함수(`savedMessage`, `loadedMessage`, `overwrittenMessage`, `updatedMessage`, `copiedMessage`, `removedMessage`, `loadQuestion`, `overwriteQuestion`, `removeQuestion`, `overwriteItem`, `defaultNote`, `loadedName`, `countLine`, `savedVoiceLine`, `removeDefaultNote`)
  - `presetSettingsOf(voice, all: SettingsOf): PresetValue`(지금 성우에서 듣는 값, 사용자 결정 U1)
  - `sameSettings(provider, a, b): boolean`
  - `settingChanges(provider, current, next)`(바뀌는 값 목록), `loadChanges(voice, all, settings)`(불러오기 비교, 양쪽 성우 맞춤 뒤), `changeLine(change)`
  - `loadNotes(voice, preset, now?): { text: string; warn: boolean }[]`(성우 맞춤·성우 다름·처음 값으로 바뀐 값)
  - `presetSummary(value: PresetValue)`, `providerVoiceLine(preset)`, `presetBadges(preset): string[]`
  - `presetVoiceIds(presets): Set<string>`, `presetCountOf(presets, savedVoiceId): number`, `presetRemoveNote(count, unknown?): string`
  - `LibraryView`에 `"preset"`, `filterSaved(items, filters, presetVoices?: ReadonlySet<string>)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/lib/trial-view.test.ts`의 import에 `optionText`를 더하고 `describe("requestOf"` 앞에 둔다:

```ts
describe("optionText(옵션 이름·값 글자)", () => {
	it("모델·감정 모드·감정·태그·말투 지시·언어·Airy 말투·슬라이더", () => {
		expect(optionText("typecast", "model", "ssfm-v21")).toEqual({
			label: "모델",
			value: "ssfm-v21",
		});
		expect(optionText("typecast", "emotion", "smart").value).toBe("자동");
		expect(optionText("typecast", "preset", "happy")).toEqual({
			label: "감정",
			value: "기쁨",
		});
		expect(optionText("elevenlabs", "tag", "")).toEqual({
			label: "말투 태그",
			value: "없음",
		});
		expect(optionText("fish_audio", "tag", "excited").value).toBe("[excited]");
		expect(optionText("gemini", "direction", "")).toEqual({
			label: "말투 지시",
			value: "없음",
		});
		expect(optionText("typecast", "language", "kor").value).toBe("한국어");
		expect(optionText("airy", "style", "calm")).toEqual({
			label: "말투",
			value: AIRY_CALM,
		});
		expect(optionText("elevenlabs", "style", 0.3)).toEqual({
			label: "스타일",
			value: "0.30",
		});
		expect(optionText("typecast", "tempo", 1.1)).toEqual({
			label: "속도",
			value: "1.10배",
		});
	});
});
```

`AIRY_CALM`은 파일 위에 `const AIRY_CALM = AIRY_STYLE_LABEL.calm;`로 두고 import에 `AIRY_STYLE_LABEL`을 더한다(문구 정본을 테스트가 다시 적지 않는다). 기존 `settingsSummary` 테스트 셋은 그대로 두어 리팩터 회귀를 잡는다.

```ts
// apps/web/src/lib/preset-view.test.ts
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
} from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import {
	changeLine,
	loadChanges,
	loadedName,
	loadNotes,
	presetBadges,
	presetCountOf,
	presetRemoveNote,
	presetSettingsOf,
	presetSummary,
	presetVoiceIds,
	providerVoiceLine,
	removeDefaultNote,
	sameSettings,
	settingChanges,
} from "./preset-view";

const voice = (over: Partial<Voice>): Voice =>
	({
		provider: "typecast",
		source: "public",
		voiceId: "tc_1",
		name: "민지",
		models: [],
		...over,
	}) as Voice;
const v21Only = voice({
	models: [{ model: "ssfm-v21", emotions: ["normal"] }],
} as Partial<Voice>);
const preset = (over: Partial<Preset>): Preset =>
	({
		id: "p1",
		name: "경제 내레이션",
		provider: "typecast",
		settings: DEFAULT_SETTINGS.typecast,
		savedVoiceId: "s1",
		voice: voice({}),
		unavailable: false,
		channelId: null,
		channelDefault: false,
		fixed: [],
		...over,
	}) as Preset;

describe("저장 값(사용자 결정 2026-10-14 '들은 값 그대로')", () => {
	it("v21만 있는 성우에서는 화면에 보이는 ssfm-v21·감정 직접을 저장한다", () => {
		expect(presetSettingsOf(v21Only, DEFAULT_SETTINGS)).toEqual({
			provider: "typecast",
			settings: {
				...DEFAULT_SETTINGS.typecast,
				model: "ssfm-v21",
				emotion: "preset",
			},
		});
	});
	it("성우 맞춤이 없는 공급자는 설정 그대로다", () => {
		expect(
			presetSettingsOf(voice({ provider: "gemini", voiceId: "kore" }), DEFAULT_SETTINGS),
		).toEqual({ provider: "gemini", settings: DEFAULT_SETTINGS.gemini });
	});
});

describe("설정 비교(스펙 4절 불러오기)", () => {
	it("같은 설정이면 바뀌는 값이 없다", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		expect(sameSettings("typecast", tc, { ...tc })).toBe(true);
		expect(settingChanges("typecast", tc, { ...tc })).toEqual([]);
	});
	it("새 설정의 모델이 쓰는 칸 가운데 다른 것만, 모델 먼저", () => {
		const next = {
			...DEFAULT_SETTINGS.typecast,
			model: "ssfm-v21" as const,
			emotion: "preset" as const,
			tempo: 1.1,
		};
		expect(
			settingChanges("typecast", DEFAULT_SETTINGS.typecast, next).map(
				changeLine,
			),
		).toEqual(["모델 ssfm-v30 → ssfm-v21", "속도 1.00배 → 1.10배"]);
		expect(sameSettings("typecast", DEFAULT_SETTINGS.typecast, next)).toBe(
			false,
		);
	});
	it("Gemini 말투 지시는 '없음 → 문장'", () => {
		const next = { ...DEFAULT_SETTINGS.gemini, direction: "차분하게" };
		expect(
			settingChanges("gemini", DEFAULT_SETTINGS.gemini, next).map(changeLine),
		).toEqual(["말투 지시 없음 → 차분하게"]);
	});
	it("불러오기 비교는 양쪽 모두 이 성우에서 듣는 값이다(v21만 있는 성우에 v30 프리셋)", () => {
		expect(
			loadChanges(v21Only, DEFAULT_SETTINGS, DEFAULT_SETTINGS.typecast),
		).toEqual([]);
		expect(
			loadChanges(v21Only, DEFAULT_SETTINGS, {
				...DEFAULT_SETTINGS.typecast,
				tempo: 1.1,
			}).map(changeLine),
		).toEqual(["속도 1.00배 → 1.10배"]);
	});
});

describe("불러오기 창 알림 줄", () => {
	it("성우 맞춤: v21만 있는 성우에 v30 프리셋을 불러오면 모델이 달라진다", () => {
		expect(loadNotes(v21Only, preset({ voice: v21Only }))).toEqual([
			{ text: "모델 ssfm-v30 → ssfm-v21 (이 성우에서 쓰는 값)", warn: false },
		]);
		expect(loadNotes(voice({}), preset({}))).toEqual([]);
	});
	it("Fish Audio 무료 모델은 무료 기간 뒤 성우 맞춤 줄이 생긴다", () => {
		const fish = voice({ provider: "fish_audio", voiceId: "f".repeat(32) });
		const saved = preset({
			provider: "fish_audio",
			settings: DEFAULT_SETTINGS.fish_audio,
			voice: fish,
		});
		expect(loadNotes(fish, saved, FISH_FREE_UNTIL - 1)).toEqual([]);
		expect(loadNotes(fish, saved, FISH_FREE_UNTIL)).toEqual([
			{
				text: "모델 s2.1-pro-free → s2.1-pro (이 성우에서 쓰는 값)",
				warn: false,
			},
		]);
	});
	it("성우 다름은 회색, 성우 빠짐과 처음 값으로 바뀐 값은 경고", () => {
		expect(loadNotes(voice({ voiceId: "tc_2" }), preset({}))).toEqual([
			{ text: "저장할 때 성우 민지", warn: false },
		]);
		expect(
			loadNotes(voice({}), preset({ voice: null, fixed: ["model", "preset"] })),
		).toEqual([
			{ text: "프리셋의 성우가 보관함에서 빠졌어요", warn: true },
			{
				text: "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 모델, 감정",
				warn: true,
			},
		]);
	});
});

describe("프리셋 줄과 안내", () => {
	it("요약은 모델과 처음 값과 다른 값만", () => {
		expect(
			presetSummary({
				provider: "typecast",
				settings: { ...DEFAULT_SETTINGS.typecast, pitch: -1 },
			}),
		).toBe("ssfm-v30 · 음높이 -1반음");
	});
	it("공급자·성우 줄과 배지(성우 없음 → 이용 불가 → 바뀐 값)", () => {
		expect(providerVoiceLine(preset({}))).toBe("Typecast · 민지");
		expect(providerVoiceLine(preset({ voice: null, savedVoiceId: null }))).toBe(
			"Typecast · 성우를 다시 골라 주세요",
		);
		expect(presetBadges(preset({}))).toEqual([]);
		expect(
			presetBadges(preset({ voice: null, savedVoiceId: null, fixed: ["model"] })),
		).toEqual(["성우를 다시 골라 주세요", "처음 값으로 바뀐 값 있음"]);
		expect(presetBadges(preset({ unavailable: true }))).toEqual([
			"현재 이용 불가",
		]);
	});
	it("불러온 프리셋 이름과 지우기의 채널 기본 문구", () => {
		expect(loadedName("경제")).toBe("프리셋 ‘경제’");
		expect(removeDefaultNote("주말")).toBe(
			" 채널 ‘주말’의 기본 프리셋도 비워져요.",
		);
		expect(removeDefaultNote(null)).toBe(" 이 채널의 기본 프리셋도 비워져요.");
	});
	it("보관함: 프리셋 성우 집합, 성우별 프리셋 수, 빼기 문구", () => {
		const list = [
			preset({ id: "a", savedVoiceId: "s1" }),
			preset({ id: "b", savedVoiceId: "s1" }),
			preset({ id: "c", savedVoiceId: null }),
		];
		expect([...presetVoiceIds(list)]).toEqual(["s1"]);
		expect(presetCountOf(list, "s1")).toBe(2);
		expect(presetRemoveNote(2)).toBe(
			" 이 성우를 쓰는 프리셋 2개는 성우를 다시 골라야 해요.",
		);
		expect(presetRemoveNote(0)).toBe("");
		expect(presetRemoveNote(0, true)).toBe(
			" 프리셋에서 쓰는 성우인지 확인하지 못했어요.",
		);
	});
});
```

`apps/web/src/lib/saved-voice-view.test.ts`:
- `item` 도우미의 결과에 `id: \`saved-${voiceId}\``를 더한다(`SavedLike`가 `id`를 갖게 된다).
- `describe("filterSaved…")` 안에 더한다:

```ts
	it("'프리셋' 보기는 프리셋에 쓰는 성우만(집합이 없으면 아무도 없다)", () => {
		const only = (presets: ReadonlySet<string>) =>
			filterSaved(items, { ...EMPTY_LIBRARY_FILTERS, view: "preset" }, presets).map(
				(i) => i.voice.voiceId,
			);
		expect(only(new Set(["saved-b"]))).toEqual(["b"]);
		expect(only(new Set())).toEqual([]);
	});
	it("view=preset 쿼리를 읽고 쓴다", () => {
		expect(filtersFromQuery(new URLSearchParams("view=preset")).view).toBe(
			"preset",
		);
		expect(
			queryFromFilters({ ...EMPTY_LIBRARY_FILTERS, view: "preset" }),
		).toBe("view=preset");
	});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter web test src/lib/trial-view.test.ts src/lib/preset-view.test.ts src/lib/saved-voice-view.test.ts`
Expected: FAIL — `optionText` 없음, `./preset-view` 없음, `view: "preset"` 타입·결과 불일치

- [ ] **Step 3: `optionText`를 더하고 `settingsSummary`가 쓴다**

`apps/web/src/lib/trial-view.ts`의 `settingsSummary` 앞에 더하고, `settingsSummary`를 아래로 바꾼다(결과 글자는 그대로다. 기존 테스트 셋이 확인한다):

```ts
// 옵션 한 칸의 이름과 값 글자. 설정 요약과 프리셋 비교(T8)가 같은 말을 쓴다
export function optionText(
	provider: ProviderId,
	field: string,
	value: string | number | boolean,
): { label: string; value: string } {
	if (field === "model") return { label: "모델", value: String(value) };
	if (field === "emotion")
		return { label: "감정 모드", value: value === "smart" ? "자동" : "직접" };
	if (field === "preset")
		return { label: "감정", value: emotionLabel(String(value)) };
	if (field === "tag")
		return { label: "말투 태그", value: value === "" ? "없음" : `[${value}]` };
	if (field === "direction")
		return {
			label: FIELD_LABEL.direction,
			value: value === "" ? "없음" : String(value),
		};
	if (field === "language")
		return {
			label: "언어",
			value:
				provider === "airy"
					? languageName(String(value))
					: LANGUAGE_LABEL[value as "auto" | "kor"],
		};
	if (provider === "airy" && field === "style")
		return { label: "말투", value: AIRY_STYLE_LABEL[value as AiryStyle] };
	return { label: FIELD_LABEL[field] ?? field, value: valueText(field, value) };
}

// 결과 줄·확인 창의 설정 요약: 모델 + 기본값에서 벗어난 옵션. Typecast 직접 감정은 늘 보인다(계획 '계획에서 정한 것')
export function settingsSummary(request: TrialRequest): string {
	const used = usedSettings(request);
	const defaults = DEFAULT_SETTINGS[request.provider] as Record<
		string,
		unknown
	>;
	const parts = [String(used.model)];
	for (const [field, value] of Object.entries(used)) {
		if (field === "model" || field === "emotion") continue;
		// Airy 언어는 과금 기준이라 기본값(ko)이어도 늘 보인다
		const airyLanguage = request.provider === "airy" && field === "language";
		if (
			field !== "preset" &&
			((value === defaults[field] && !airyLanguage) || value === "")
		)
			continue;
		const text = optionText(request.provider, field, value);
		// 태그·언어는 값만으로 뜻이 보인다
		parts.push(
			field === "tag" || field === "language"
				? text.value
				: `${text.label} ${text.value}`,
		);
	}
	return parts.join(" · ");
}
```

- [ ] **Step 4: `preset-view.ts`를 쓴다**

```ts
// apps/web/src/lib/preset-view.ts
import type { Preset, PresetValue } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	type SettingsOf,
	type TrialRequest,
	usedSettings,
} from "@tts-pilot-app/api/providers/trial-options";

import { PROVIDER_LABEL } from "./connection-view";
import { LIBRARY_TEXT } from "./saved-voice-view";
import { optionText, requestOf, settingsSummary } from "./trial-view";

// 프리셋 화면 문구와 계산(T8 스펙 4절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문구는 브리프(18행 docs/briefs/presets.md)가 정본이고 브리프가 이긴다. 이름 뒤에 조사를 붙이지 않는다(받침을 모른다).
// 목록을 받는 동작은 '받기', 프리셋을 설정에 적용하는 동작은 '불러오기'로 나눠 쓴다(계획 리뷰 D13)

type Settings = SettingsOf[ProviderId];
type Values = Record<string, string | number | boolean>;

export const PRESET_TEXT = {
	menu: "프리셋",
	loading: "프리셋 목록을 받고 있어요",
	none: "이 공급자 프리셋이 아직 없어요",
	listFailed: "프리셋 목록을 받지 못했어요",
	retry: "다시 받기",
	saveNew: "지금 설정으로 새 프리셋 저장",
	manage: "프리셋 관리",
	saveTitle: "프리셋 저장",
	saveNote: "이 성우는 성우 보관함에도 담겨요",
	editTitle: "프리셋 고치기",
	channel: "채널",
	noChannel: "채널 없음",
	chosenChannel: "고른 채널",
	noChannels: "채널은 '채널·분류' 화면에서 만들 수 있어요",
	channelsFailed: "채널 목록을 받지 못했어요",
	channelGone: "고른 채널이 지워졌어요. 채널을 다시 골라 주세요.",
	channelDefault: "이 채널의 기본 프리셋으로",
	defaultNeedsChannel: "채널을 고르면 켤 수 있어요",
	defaultBadge: "기본",
	changesHead: "바뀌는 값",
	sameSettings: "지금 설정과 같아요",
	voiceGone: "프리셋의 성우가 보관함에서 빠졌어요",
	pickVoice: "성우를 다시 골라 주세요",
	noVoice: "성우 없음",
	fixedBadge: "처음 값으로 바뀐 값 있음",
	changed: "바뀐 값 있음",
	// T6 이름 중복 문구와 같은 꼴(duplicateMessage)
	duplicate: "같은 이름의 프리셋이 이미 있어요.",
	loopback: "이 주소에서는 프리셋을 쓸 수 없어요",
	empty: "아직 프리셋이 없어요",
	emptyDetail:
		"성우 캐스팅의 '내 문장 듣기'에서 지금 설정을 프리셋으로 저장할 수 있어요.",
	toCasting: "성우 캐스팅으로",
	listLabel: "프리셋 목록",
	removeDetail: "이미 만든 내 문장 결과는 그대로 남아요.",
	overwriting: "바꾸는 중이에요",
	removing: "지우는 중이에요",
} as const;

export const savedMessage = (name: string) => `‘${name}’ 프리셋을 저장했어요.`;
export const loadedMessage = (name: string) => `‘${name}’ 설정을 불러왔어요.`;
export const overwrittenMessage = (name: string) =>
	`‘${name}’ 프리셋을 지금 성우·설정으로 바꿨어요.`;
export const updatedMessage = (name: string) => `‘${name}’ 프리셋을 고쳤어요.`;
export const copiedMessage = (name: string) =>
	`‘${name}’ 프리셋을 만들었어요.`;
export const removedMessage = (name: string) => `‘${name}’ 프리셋을 지웠어요.`;
export const loadQuestion = (name: string) =>
	`‘${name}’ 프리셋을 불러올까요?`;
// 성우 이름은 설명 줄('성우 A → B')로 옮겼다(계획 '스펙과 다른 점' 7)
export const overwriteQuestion = (name: string) =>
	`‘${name}’ 프리셋을 지금 성우·설정으로 바꿀까요?`;
export const removeQuestion = (name: string) => `‘${name}’ 프리셋을 지울까요?`;
export const overwriteItem = (name: string) =>
	`‘${name}’에 지금 성우·설정 덮어쓰기`;
export const defaultNote = (name: string) => `지금 기본 프리셋: ‘${name}’`;
export const loadedName = (name: string) => `프리셋 ‘${name}’`;
export const countLine = (count: number) => `프리셋 ${count}개`;
export const savedVoiceLine = (preset: Pick<Preset, "voice">) =>
	preset.voice
		? `저장할 때 성우 ${preset.voice.name}`
		: PRESET_TEXT.pickVoice;
// 지우기 확인에 붙인다(앞 문장과 띄어 쓴다). 채널 기본이면 그 채널의 기본도 빈다(T9 자동 적용 대상, 계획 리뷰 D17)
export const removeDefaultNote = (channelName: string | null) =>
	channelName
		? ` 채널 ‘${channelName}’의 기본 프리셋도 비워져요.`
		: " 이 채널의 기본 프리셋도 비워져요.";

// 지금 성우에서 화면에 보이고 실제로 듣는 값(requestOf의 성우 맞춤 뒤 설정)을 프리셋 한 벌로 묶는다(사용자 결정 2026-10-14 '들은 값 그대로').
// TS가 provider와 settings의 짝을 따라가지 못해 여기서 한 번 묶는다
export const presetSettingsOf = (voice: Voice, all: SettingsOf) =>
	({
		provider: voice.provider,
		settings: requestOf(voice, "", all).settings,
	}) as PresetValue;

const requestFor = (provider: ProviderId, settings: Settings) =>
	({ provider, voiceId: "", text: "", settings }) as TrialRequest;

// 그 공급자 칸이 모두 같은가('바뀐 값 있음')
export function sameSettings(
	provider: ProviderId,
	a: Settings,
	b: Settings,
): boolean {
	const x = a as Values;
	const y = b as Values;
	return Object.keys(DEFAULT_SETTINGS[provider]).every(
		(key) => x[key] === y[key],
	);
}

type Change = { label: string; from: string; to: string };
const change = (
	provider: ProviderId,
	field: string,
	from: string | number | boolean,
	to: string | number | boolean,
): Change => ({
	label: optionText(provider, field, to).label,
	from: optionText(provider, field, from).value,
	to: optionText(provider, field, to).value,
});

// 바뀌는 값: next의 모델이 쓰는 칸 가운데 current와 다른 것(모델 먼저, FIELDS 순서).
// 그 모델이 쓰지 않는 칸은 소리에 영향이 없어 보이지 않는다
export function settingChanges(
	provider: ProviderId,
	current: Settings,
	next: Settings,
): Change[] {
	const now = current as Values;
	return Object.entries(usedSettings(requestFor(provider, next)))
		.filter(([field, value]) => now[field] !== value)
		.map(([field, value]) => change(provider, field, now[field], value));
}

export const changeLine = ({ label, from, to }: Change) =>
	`${label} ${from} → ${to}`;

// 불러오기 창의 바뀌는 값: 지금 성우에서 듣는 값 → 불러온 뒤 이 성우에서 듣는 값. 양쪽을 같은 기준(성우 맞춤 뒤)으로 비교해야
// 이 성우에서 실제로 바뀌지 않는 값을 바뀐다고 하지 않는다(계획 재리뷰 N1). 성우 맞춤으로 달라지는 값은 loadNotes가 따로 알린다
export function loadChanges(
	voice: Voice,
	all: SettingsOf,
	settings: Settings,
): Change[] {
	return settingChanges(
		voice.provider,
		presetSettingsOf(voice, all).settings,
		presetSettingsOf(voice, {
			...all,
			[voice.provider]: settings,
		} as SettingsOf).settings,
	);
}

// 불러오기 창의 알림 줄(바뀌는 값 다음). 성우 맞춤(requestOf: Typecast 모델·감정, Fish Audio 무료 기간 종료) → 성우 다름 → 처음 값으로 바뀐 값.
// warn은 경고 줄 문법(text-warning + 삼각형)으로 그린다(계획 리뷰 D14)
export function loadNotes(
	voice: Voice,
	preset: Pick<Preset, "provider" | "settings" | "voice" | "fixed">,
	now = Date.now(),
): { text: string; warn: boolean }[] {
	const wanted = preset.settings as Values;
	const all = {
		...DEFAULT_SETTINGS,
		[voice.provider]: preset.settings,
	} as SettingsOf;
	const notes = Object.entries(usedSettings(requestOf(voice, "", all, now)))
		.filter(([field, value]) => field in wanted && wanted[field] !== value)
		.map(([field, value]) => ({
			text: `${changeLine(change(voice.provider, field, wanted[field], value))} (이 성우에서 쓰는 값)`,
			warn: false,
		}));
	if (!preset.voice) notes.push({ text: PRESET_TEXT.voiceGone, warn: true });
	else if (preset.voice.voiceId !== voice.voiceId)
		notes.push({ text: savedVoiceLine(preset), warn: false });
	if (preset.fixed.length > 0) {
		const defaults = DEFAULT_SETTINGS[preset.provider] as Values;
		const labels = preset.fixed.map(
			(field) => optionText(preset.provider, field, defaults[field] ?? "").label,
		);
		notes.push({
			text: `지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: ${labels.join(", ")}`,
			warn: true,
		});
	}
	return notes;
}

// /presets 줄과 저장 창의 요약(모델 + 처음 값과 다른 값, 설정 요약과 같은 표기)
export const presetSummary = (preset: PresetValue) =>
	settingsSummary(requestFor(preset.provider, preset.settings));

export const providerVoiceLine = (preset: Pick<Preset, "provider" | "voice">) =>
	`${PROVIDER_LABEL[preset.provider]} · ${preset.voice?.name ?? PRESET_TEXT.pickVoice}`;

// 상태 배지: 성우 없음 → 이용 불가 → 처음 값으로 바뀐 값
export function presetBadges(
	preset: Pick<Preset, "savedVoiceId" | "unavailable" | "fixed">,
): string[] {
	const badges: string[] = [];
	if (preset.savedVoiceId === null) badges.push(PRESET_TEXT.pickVoice);
	else if (preset.unavailable) badges.push(LIBRARY_TEXT.unavailable);
	if (preset.fixed.length > 0) badges.push(PRESET_TEXT.fixedBadge);
	return badges;
}

// 성우 보관함: 프리셋에 쓰는 담은 성우 id('프리셋' 보기), 그 성우를 쓰는 프리셋 수(빼기 확인).
// 이름은 Typecast 감정 목록 presetsOf(trial-view)와 헷갈리지 않게 개수임을 드러낸다(계획 리뷰 F9)
export const presetVoiceIds = (
	presets: readonly Pick<Preset, "savedVoiceId">[],
) =>
	new Set(
		presets.flatMap((preset) =>
			preset.savedVoiceId ? [preset.savedVoiceId] : [],
		),
	);
export const presetCountOf = (
	presets: readonly Pick<Preset, "savedVoiceId">[],
	savedVoiceId: string,
) => presets.filter((preset) => preset.savedVoiceId === savedVoiceId).length;
// 빼기 확인 창 설명 뒤에 붙인다(linkedNote와 같다). 프리셋 목록을 받지 못했으면 확인하지 못했다고 알린다(계획 리뷰 D10)
export const presetRemoveNote = (count: number, unknown = false) =>
	unknown
		? " 프리셋에서 쓰는 성우인지 확인하지 못했어요."
		: count > 0
			? ` 이 성우를 쓰는 프리셋 ${count}개는 성우를 다시 골라야 해요.`
			: "";
```

- [ ] **Step 5: 보관함 보기에 '프리셋'을 더한다**

`apps/web/src/lib/saved-voice-view.ts`:

```ts
export type LibraryView = "all" | "favorite" | "frequent" | "preset";
// …
const VIEWS: readonly LibraryView[] = ["all", "favorite", "frequent", "preset"];
// …
type SavedLike = {
	id: string;
	voice: Pick<Voice, "provider" | "voiceId" | "name" | "englishName">;
	favorite: boolean;
	frequent: boolean;
	memo: string | null;
	channelIds: readonly string[];
	classificationIds: readonly string[];
};
// …
// '프리셋' 보기는 프리셋에 쓰는 담은 성우 id 집합으로 거른다(presetVoiceIds, T8)
export function filterSaved<T extends SavedLike>(
	items: readonly T[],
	filters: LibraryFilters,
	presetVoices: ReadonlySet<string> = new Set(),
): T[] {
	const q = foldName(filters.q);
	return items.filter(
		(item) =>
			(filters.view === "all" ||
				(filters.view === "preset"
					? presetVoices.has(item.id)
					: item[filters.view])) &&
			(filters.provider === null || item.voice.provider === filters.provider) &&
			// (아래 조건은 그대로)
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm exec biome check --write apps/web/src/lib/trial-view.ts apps/web/src/lib/trial-view.test.ts apps/web/src/lib/preset-view.ts apps/web/src/lib/preset-view.test.ts apps/web/src/lib/saved-voice-view.ts apps/web/src/lib/saved-voice-view.test.ts && pnpm --filter web test src/lib/ && pnpm --filter web check-types`
Expected: PASS(기존 `settingsSummary` 셋 포함), check-types exit 0

---

**(메인 세션: 17행 impeccable context, 18행 `docs/briefs/presets.md` shape 브리프와 사용자 확인. 브리프가 위 '브리프로 넘길 결정'을 정한다. Task 5~8은 브리프 확인 뒤, 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 브리프가 이 계획의 배치·문구와 다르면 브리프를 따르고 장부에 적는다.)**

---

### Task 5: 프리셋 훅과 저장·고치기 창

**Files:**
- Create: `apps/web/src/components/presets.tsx`
- Create: `apps/web/src/components/preset-form-dialog.tsx`
- Modify: `apps/web/src/components/class-form-dialog.tsx:48-49`(`fieldClass` export)
- Modify: `apps/web/src/components/voice-conditions.tsx:268-311`(`RadioMenu`에 `className`)

**Interfaces:**
- Consumes: Task 3 프로시저(`orpc.presetList`, `client.preset*`), Task 4 `PRESET_TEXT`·`defaultNote`, `savedListKey`(saved-voices), `RadioMenu`(voice-conditions), T6 `fieldMessage`·`saveFailure`·`MESSAGES`·`byName`.
- Produces:
  - `usePresetList()`
  - `useCreatePreset()`, `useOverwritePreset()`, `useUpdatePreset()`, `useDuplicatePreset()`, `useRemovePreset()`(각 `useMutation`. 성공·실패와 상관없이 목록을 다시 받는다. 만들기·덮어쓰기는 보관함도)
  - `type PresetFormValues = { name: string; channelId: string | null; channelDefault: boolean }`
  - `PresetFormDialog({ title, presetId, initial, summary?, save, onSaved, openerRef, goneFocus, onClose })`
  - `RadioMenu`의 `className?: string`(버튼 클래스에 더한다)

- [ ] **Step 1: 훅을 쓴다**

```tsx
// apps/web/src/components/presets.tsx
"use client";

import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	PresetCreateInput,
	PresetOverwriteInput,
	PresetUpdateInput,
} from "@tts-pilot-app/api/preset-contract";

import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import { savedListKey } from "./saved-voices";

// 프리셋 목록 하나를 캐스팅 메뉴·/presets·보관함('프리셋' 보기, 빼기 확인)이 함께 읽는다(스펙 3절)
export const usePresetList = () =>
	useQuery(orpc.presetList.queryOptions(OWNED_LIST));

// 프리셋이 바뀌는 변경 뒤에 부른다(무효화는 접두 키)
function invalidatePresets(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: orpc.presetList.key() });
}

// 실패해도 처리됐을 수 있으므로 늘 다시 받는다. 만들기·덮어쓰기는 성우를 보관함에 담으므로 보관함도 다시 받는다
function useSettled(alsoSaved: boolean) {
	const queryClient = useQueryClient();
	return () => {
		invalidatePresets(queryClient);
		if (alsoSaved)
			void queryClient.invalidateQueries({ queryKey: savedListKey });
	};
}

export function useCreatePreset() {
	const onSettled = useSettled(true);
	return useMutation({
		mutationFn: (input: PresetCreateInput) => client.presetCreate(input),
		onSettled,
	});
}
export function useOverwritePreset() {
	const onSettled = useSettled(true);
	return useMutation({
		mutationFn: (input: PresetOverwriteInput) => client.presetOverwrite(input),
		onSettled,
	});
}
export function useUpdatePreset() {
	const onSettled = useSettled(false);
	return useMutation({
		mutationFn: (input: PresetUpdateInput) => client.presetUpdate(input),
		onSettled,
	});
}
export function useDuplicatePreset() {
	const onSettled = useSettled(false);
	return useMutation({
		mutationFn: (input: { id: string }) => client.presetDuplicate(input),
		onSettled,
	});
}
export function useRemovePreset() {
	const onSettled = useSettled(false);
	return useMutation({
		mutationFn: (input: { id: string }) => client.presetRemove(input),
		onSettled,
	});
}
```

`saved-voices.tsx`는 이 파일을 import하지 않는다(서로 import하는 순환을 피한다. Task 8은 `orpc.presetList.key()`를 직접 쓴다).

- [ ] **Step 2: `fieldClass`를 내보내고 `RadioMenu`가 클래스를 받는다**

`apps/web/src/components/class-form-dialog.tsx`의 `const fieldClass`를 `export const fieldClass`로 바꾼다.

`apps/web/src/components/voice-conditions.tsx`의 `RadioMenu`에 선택 prop 하나를 더한다(창 안에서 칸을 가득 채운다, 계획 리뷰 D6). 기존 호출은 넘기지 않으므로 그대로다:

```tsx
	strong = false,
	className,
}: {
	// … 기존 칸 그대로
	strong?: boolean;
	className?: string;
}) {
	// …
						className={cn(conditionButton(0), className)}
```

- [ ] **Step 3: 창을 쓴다**

```tsx
// apps/web/src/components/preset-form-dialog.tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	cleanText,
	NAME_MAX,
	nameProblem,
} from "@tts-pilot-app/api/classification-rules";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import { codePoints } from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Label } from "@tts-pilot-app/ui/components/label";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { type ReactNode, type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	byName,
	fieldMessage,
	MESSAGES,
	saveFailure,
} from "@/lib/classes-view";
import { defaultNote, PRESET_TEXT } from "@/lib/preset-view";
import { plain } from "@/lib/voice-view";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { fieldClass } from "./class-form-dialog";
import { usePresetList } from "./presets";
import { RadioMenu } from "./voice-conditions";

export type PresetFormValues = {
	name: string;
	channelId: string | null;
	channelDefault: boolean;
};

// RadioMenu 값은 문자열이라 '채널 없음'을 빈 문자열로 둔다
const NO_CHANNEL = "";

// 프리셋 저장(캐스팅)·고치기(/presets) 창(스펙 4절). ClassFormDialog와 같은 틀이다:
// 열 때만 마운트, 저장 중 읽기 전용(포커스는 간다), 값을 바꾼 동안 바깥 누르기로 닫히지 않음, 두 번 누름은 렌더를 기다리지 않고 막음,
// 이름 중복은 이름 칸에. NOT_FOUND면 채널 목록을 다시 받는다(스펙 5절). 원인이 지워진 채널이면(새로 저장, 또는 프리셋이 아직 있는 고치기)
// 창을 두고 채널을 '채널 없음'으로 되돌린다(계획 리뷰 F2·재리뷰 N2). 프리셋이 지워졌으면 알리고 닫은 뒤 포커스를 goneFocus로(행이 사라진다, F4).
// 저장 결과의 처리는 onSaved가 한다
export function PresetFormDialog({
	title,
	presetId,
	initial,
	summary,
	save,
	onSaved,
	openerRef,
	goneFocus,
	onClose,
}: {
	title: string;
	// 고치는 프리셋(새로 저장이면 null). '지금 기본' 안내에서 자기 자신을 뺀다
	presetId: string | null;
	initial: PresetFormValues;
	// 새로 저장할 때 무엇이 저장되는지(계획 리뷰 D5). 고치기 창은 넘기지 않는다
	summary?: ReactNode;
	save: (values: PresetFormValues) => Promise<Preset>;
	onSaved: (preset: Preset) => void;
	openerRef: RefObject<HTMLElement | null>;
	goneFocus: () => HTMLElement | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const presets = usePresetList();
	const [values, setValues] = useState(initial);
	const [problem, setProblem] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const nameRef = useRef<HTMLInputElement>(null);
	const sendingRef = useRef(false);
	const goneRef = useRef(false);
	const ids = useId();
	const dirty =
		values.name !== initial.name ||
		values.channelId !== initial.channelId ||
		values.channelDefault !== initial.channelDefault;
	// 이 채널의 다른 기본 프리셋(체크하면 이것으로 바뀐다)
	const current =
		values.channelId === null
			? undefined
			: presets.data?.find(
					(preset) =>
						preset.channelId === values.channelId &&
						preset.channelDefault &&
						preset.id !== presetId,
				);
	const nameCount = codePoints(cleanText(values.name));
	const known = byName(channels.data ?? []).map((item) => ({
		value: item.id,
		label: item.name,
	}));
	// 고른 채널이 목록에 없으면(받는 중·실패) id 대신 '고른 채널'로 보인다(계획 리뷰 F7)
	const options = [
		{ value: NO_CHANNEL, label: PRESET_TEXT.noChannel },
		...known,
		...(values.channelId !== null &&
		!known.some((item) => item.value === values.channelId)
			? [{ value: values.channelId, label: PRESET_TEXT.chosenChannel }]
			: []),
	];

	function submit() {
		if (sendingRef.current) return;
		const found = nameProblem(values.name);
		setFailure(null);
		if (found) {
			setProblem(fieldMessage("name", found));
			nameRef.current?.focus();
			return;
		}
		sendingRef.current = true;
		setPending(true);
		save(values)
			.then(
				(preset) => {
					onSaved(preset);
					onClose();
				},
				async (error: unknown) => {
					const kind = saveFailure(error);
					if (kind === "not_found") {
						void queryClient.invalidateQueries({
							queryKey: orpc.channelList.key(),
						});
						// 새로 저장이면 원인은 지워진 채널뿐이다. 고치기는 프리셋이 아직 목록에 있으면 채널 탓이다(계획 재리뷰 N2).
						// 목록을 받지 못하면 받아 둔 목록으로 판단한다(창을 지키는 쪽)
						const presetGone =
							presetId !== null &&
							!(await presets.refetch()).data?.some(
								(item) => item.id === presetId,
							);
						if (!presetGone) {
							setValues((all) => ({
								...all,
								channelId: null,
								channelDefault: false,
							}));
							setFailure(PRESET_TEXT.channelGone);
							nameRef.current?.focus();
							return;
						}
						toast.error(MESSAGES.notFound);
						goneRef.current = true;
						onClose();
						return;
					}
					if (kind === "duplicate") setProblem(PRESET_TEXT.duplicate);
					else setFailure(MESSAGES.saveFailed);
					nameRef.current?.focus();
				},
			)
			.finally(() => {
				sendingRef.current = false;
				setPending(false);
			});
	}

	return (
		<Dialog
			open
			disablePointerDismissal={dirty}
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				initialFocus={nameRef}
				finalFocus={() =>
					(goneRef.current ? goneFocus() : openerRef.current) ?? true
				}
			>
				<form
					noValidate
					className="flex flex-col gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					onKeyDown={(event) => {
						// 한글 조합을 끝내는 Enter는 저장이 아니다(T6 계획 리뷰 D12)
						if (
							event.key === "Enter" &&
							(event.nativeEvent.isComposing || event.keyCode === 229)
						)
							event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
					</DialogHeader>
					{summary ? (
						<div className="flex flex-col gap-1 text-muted-foreground text-sm">
							{summary}
						</div>
					) : null}
					<div className="flex flex-col gap-2">
						<div className="flex items-baseline justify-between gap-3">
							<Label htmlFor={`${ids}-name`} className="font-bold text-sm">
								이름
							</Label>
							<span
								id={`${ids}-count`}
								className={cn(
									"text-sm tabular-nums",
									nameCount > NAME_MAX
										? "text-warning"
										: "text-muted-foreground",
								)}
							>
								{plain.format(nameCount)} / {NAME_MAX}자
							</span>
						</div>
						<Input
							ref={nameRef}
							id={`${ids}-name`}
							autoComplete="off"
							className={fieldClass}
							value={values.name}
							readOnly={pending}
							aria-invalid={problem ? true : undefined}
							aria-describedby={
								problem ? `${ids}-name-error ${ids}-count` : `${ids}-count`
							}
							onChange={(event) => {
								const { value } = event.target;
								setValues((all) => ({ ...all, name: value }));
								setProblem(null);
							}}
						/>
						{problem ? (
							<p
								id={`${ids}-name-error`}
								role="alert"
								className="text-sm text-warning"
							>
								{problem}
							</p>
						) : null}
					</div>
					<div className="flex flex-col gap-2">
						{/* 칸 이름은 RadioMenu 버튼의 '채널 · …'이 맡는다(위 글자 라벨을 두지 않는다, 계획 리뷰 D6) */}
						<RadioMenu
							label={PRESET_TEXT.channel}
							value={values.channelId ?? NO_CHANNEL}
							options={options}
							disabled={pending || !channels.data}
							className="w-full justify-between"
							// 채널을 바꾸면 기본 체크를 푼다(다른 채널의 기본을 모르고 바꾸지 않게, 계획 리뷰 E6)
							onChange={(next) =>
								setValues((all) => ({
									...all,
									channelId: next === NO_CHANNEL ? null : next,
									channelDefault: false,
								}))
							}
						/>
						{channels.isError ? (
							<p className="text-sm text-warning">
								{PRESET_TEXT.channelsFailed}
							</p>
						) : channels.data?.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								{PRESET_TEXT.noChannels}
							</p>
						) : null}
						{/* 줄 전체가 눌림 영역이다(44px, 계획 리뷰 D7) */}
						<Label className="flex min-h-11 items-center gap-3 text-sm">
							<Checkbox
								checked={values.channelDefault}
								disabled={pending || values.channelId === null}
								aria-describedby={
									values.channelId === null ? `${ids}-default-why` : undefined
								}
								onCheckedChange={(on) =>
									setValues((all) => ({ ...all, channelDefault: on === true }))
								}
							/>
							{PRESET_TEXT.channelDefault}
						</Label>
						{values.channelId === null ? (
							<p
								id={`${ids}-default-why`}
								className="text-muted-foreground text-sm"
							>
								{PRESET_TEXT.defaultNeedsChannel}
							</p>
						) : current ? (
							<p className="text-muted-foreground text-sm">
								{defaultNote(current.name)}
							</p>
						) : null}
					</div>
					{failure ? (
						<p role="alert" className="text-sm text-warning">
							{failure}
						</p>
					) : null}
					<p role="status" className="sr-only">
						{pending ? "저장하는 중이에요" : ""}
					</p>
					<DialogFooter>
						<Button
							type="button"
							size="lg"
							variant="outline"
							disabled={pending}
							focusableWhenDisabled
							className="flex-1 md:flex-none"
							onClick={onClose}
						>
							취소
						</Button>
						<Button
							type="submit"
							size="lg"
							disabled={pending}
							focusableWhenDisabled
							className="flex-1 md:flex-none"
						>
							{pending ? (
								<Spinner data-icon="inline-start" aria-hidden="true" />
							) : null}
							저장하기
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 4: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/presets.tsx apps/web/src/components/preset-form-dialog.tsx apps/web/src/components/class-form-dialog.tsx apps/web/src/components/voice-conditions.tsx && pnpm --filter web check-types && pnpm exec biome check apps/web/src/components/presets.tsx apps/web/src/components/preset-form-dialog.tsx apps/web/src/components/class-form-dialog.tsx apps/web/src/components/voice-conditions.tsx`
Expected: exit 0. 이 태스크의 런타임 확인은 Task 6·7에서 창을 열며 한다(코디네이터).

---

### Task 6: 캐스팅 '내 문장 듣기'의 프리셋 메뉴

**Files:**
- Modify: `apps/web/src/components/trial-provider.tsx`(타입 `TrialApi`, 상태, `api`)
- Create: `apps/web/src/components/preset-menu.tsx`
- Modify: `apps/web/src/components/trial-section.tsx:382-404`(머리)

**Interfaces:**
- Consumes: Task 4 함수·문구, Task 5 훅·`PresetFormDialog`, `ConfirmDialog`, `useTrial`.
- Produces:
  - `TrialApi.loaded(provider): LoadedPreset | null`, `TrialApi.loadPreset(provider, preset: LoadedPreset)`, `type LoadedPreset = { id: string; settings: SettingsOf[ProviderId] }`
  - `PresetMenu({ voice, onApplied })`, `PresetLine({ voice })`

- [ ] **Step 1: `TrialProvider`가 불러온 프리셋을 기억한다**

`apps/web/src/components/trial-provider.tsx`:

```ts
// 불러온(또는 방금 저장·덮어쓴) 프리셋과 그때의 설정. 공급자마다 하나이고 화면을 떠나면 사라진다(설정과 같다, T8 스펙 4절)
export type LoadedPreset = { id: string; settings: SettingsOf[ProviderId] };

type TrialApi = {
	settings: SettingsOf;
	// … 그대로
	resetSettings: (provider: ProviderId) => void;
	loaded: (provider: ProviderId) => LoadedPreset | null;
	// 그 공급자 설정을 프리셋 값으로 바꾸고 기억한다
	loadPreset: (provider: ProviderId, preset: LoadedPreset) => void;
	// … 그대로
};
```

상태(`const [settings, setSettings] = …` 바로 아래):

```ts
	const [loadedPresets, setLoadedPresets] = useState<
		Partial<Record<ProviderId, LoadedPreset>>
	>({});
```

`api`의 `resetSettings`를 바꾸고 둘을 더한다:

```ts
		// '처음 값으로'는 불러온 프리셋 표시도 지운다
		resetSettings: (provider) => {
			setSettings((all) => ({
				...all,
				[provider]: DEFAULT_SETTINGS[provider],
			}));
			setLoadedPresets(({ [provider]: _gone, ...rest }) => rest);
		},
		loaded: (provider) => loadedPresets[provider] ?? null,
		loadPreset: (provider, preset) => {
			setSettings((all) => ({ ...all, [provider]: preset.settings }) as SettingsOf);
			setLoadedPresets((all) => ({ ...all, [provider]: preset }));
		},
```

- [ ] **Step 2: 메뉴를 쓴다**

```tsx
// apps/web/src/components/preset-menu.tsx
"use client";

import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Fragment, type RefObject, useRef, useState } from "react";
import { toast } from "sonner";

import { byName, MESSAGES } from "@/lib/classes-view";
import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	changeLine,
	loadChanges,
	loadedMessage,
	loadedName,
	loadNotes,
	loadQuestion,
	overwriteItem,
	overwriteQuestion,
	overwrittenMessage,
	PRESET_TEXT,
	presetSettingsOf,
	presetSummary,
	sameSettings,
	savedMessage,
	savedVoiceLine,
	settingChanges,
} from "@/lib/preset-view";

import { ConfirmDialog } from "./confirm-dialog";
import { PresetFormDialog } from "./preset-form-dialog";
import { useCreatePreset, useOverwritePreset, usePresetList } from "./presets";
import { useTrial } from "./trial-provider";

type Open =
	| { kind: "save" }
	| { kind: "load"; preset: Preset }
	| { kind: "overwrite"; preset: Preset }
	| null;

// 불러오기 창(스펙 4절): 바뀌는 값 → 알림 줄(성우 맞춤·성우 다름·처음 값으로 바뀐 값). 첫 포커스는 '불러오기', 닫히면 메뉴 버튼으로.
// 비교는 양쪽 모두 이 성우에서 듣는 값이다(성우 맞춤 뒤, 계획 리뷰 E1·재리뷰 N1)
function LoadDialog({
	voice,
	preset,
	openerRef,
	onLoad,
	onClose,
}: {
	voice: Voice;
	preset: Preset;
	openerRef: RefObject<HTMLButtonElement | null>;
	onLoad: () => Promise<void>;
	onClose: () => void;
}) {
	const trial = useTrial();
	const loadRef = useRef<HTMLButtonElement>(null);
	const [pending, setPending] = useState(false);
	const changes = loadChanges(voice, trial.settings, preset.settings);
	const notes = loadNotes(voice, preset);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent
				initialFocus={loadRef}
				finalFocus={() => openerRef.current ?? true}
			>
				<DialogHeader>
					<DialogTitle>{loadQuestion(preset.name)}</DialogTitle>
					<DialogDescription>
						{changes.length > 0
							? PRESET_TEXT.changesHead
							: PRESET_TEXT.sameSettings}
					</DialogDescription>
				</DialogHeader>
				{changes.length > 0 ? (
					<ul className="flex flex-col gap-1 text-sm tabular-nums">
						{changes.map((item) => (
							<li key={item.label}>{changeLine(item)}</li>
						))}
					</ul>
				) : null}
				{notes.length > 0 ? (
					<ul className="flex flex-col gap-1 text-sm">
						{notes.map((note) => (
							<li
								key={note.text}
								className={cn(
									"flex gap-2",
									note.warn ? "text-warning" : "text-muted-foreground",
								)}
							>
								{note.warn ? (
									<TriangleAlert
										aria-hidden="true"
										className="mt-0.5 size-4 shrink-0"
									/>
								) : null}
								{note.text}
							</li>
						))}
					</ul>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						size="lg"
						variant="outline"
						disabled={pending}
						focusableWhenDisabled
						className="flex-1 md:flex-none"
						onClick={onClose}
					>
						취소
					</Button>
					<Button
						ref={loadRef}
						type="button"
						size="lg"
						disabled={pending}
						focusableWhenDisabled
						className="flex-1 md:flex-none"
						onClick={() => {
							if (pending) return;
							setPending(true);
							void onLoad().finally(() => setPending(false));
						}}
					>
						{pending ? (
							<Spinner data-icon="inline-start" aria-hidden="true" />
						) : null}
						불러오기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// 덮어쓰기 확인의 설명(프리셋 → 지금 화면 값). AlertDialog 설명은 <p>라 목록 대신 줄바꿈으로 잇는다(<ul>을 넣으면 DOM 중첩 오류)
function OverwriteDetail({ voice, preset }: { voice: Voice; preset: Preset }) {
	const trial = useTrial();
	const lines = [
		...(preset.voice?.voiceId === voice.voiceId
			? []
			: [`성우 ${preset.voice?.name ?? PRESET_TEXT.noVoice} → ${voice.name}`]),
		...settingChanges(
			voice.provider,
			preset.settings,
			presetSettingsOf(voice, trial.settings).settings,
		).map(changeLine),
	];
	if (lines.length === 0) return PRESET_TEXT.sameSettings;
	return lines.map((line, index) => (
		<Fragment key={line}>
			{index > 0 ? <br /> : null}
			{line}
		</Fragment>
	));
}

// '내 문장 듣기' 머리의 프리셋 메뉴(스펙 4절). 이 공급자 프리셋 불러오기, 새로 저장, 불러온 프리셋에 덮어쓰기, 관리 화면 링크(Task 7에서 더한다).
// 저장·덮어쓰기는 지금 화면에 보이는 값(성우 맞춤 뒤)을 보낸다(사용자 결정 2026-10-14). 저장·불러오기·덮어쓰기 뒤에는 지금 설정을
// 프리셋 값(서버가 정리한 값)으로 두고 옵션 칸을 다시 그린다(onApplied, 계획 '스펙과 다른 점' 2).
// 소유자가 없으면 캐스팅 화면 전체가 주소 안내라(voice-casting.tsx) 이 메뉴는 그려지지 않는다(계획 '스펙과 다른 점' 9)
export function PresetMenu({
	voice,
	onApplied,
}: {
	voice: Voice;
	onApplied: () => void;
}) {
	const trial = useTrial();
	const presets = usePresetList();
	const create = useCreatePreset();
	const overwrite = useOverwritePreset();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState<Open>(null);
	const { provider } = voice;
	const mine = byName(
		(presets.data ?? []).filter((preset) => preset.provider === provider),
	);
	const loadedId = trial.loaded(provider)?.id;
	const loaded = presets.data?.find((preset) => preset.id === loadedId);
	const shown = presetSettingsOf(voice, trial.settings);

	function apply(preset: Preset) {
		trial.loadPreset(provider, { id: preset.id, settings: preset.settings });
		onApplied();
	}
	// 다른 탭에서 지웠을 수 있어 최신 목록에서 한 번 더 찾는다(사용자 결정 2026-10-14, 스펙 S13).
	// 받지 못하면 받아 둔 값으로 불러온다(설정만 바꾸므로 데이터는 상하지 않는다)
	async function load(preset: Preset) {
		const latest = await presets.refetch();
		const fresh = latest.data?.find((item) => item.id === preset.id);
		if (latest.isSuccess && !fresh) {
			toast.error(MESSAGES.notFound);
			setOpen(null);
			return;
		}
		apply(fresh ?? preset);
		toast.success(loadedMessage(preset.name));
		setOpen(null);
	}

	return (
		<>
			<DropdownMenu
				onOpenChange={(next) => {
					// 메뉴를 열 때 목록을 다시 받는다(다른 탭의 변경, 30초 캐시)
					if (next) void presets.refetch();
				}}
			>
				<DropdownMenuTrigger
					// 고르는 조건과 같은 outline(DESIGN.md 조건 버튼). '처음 값으로'(되돌리기)는 ghost 그대로(계획 리뷰 D1)
					render={<Button ref={triggerRef} variant="outline" size="lg" />}
				>
					{PRESET_TEXT.menu}
					<ChevronDown data-icon="inline-end" aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-72 p-1">
					{/* 목록만 스크롤한다. 저장·덮어쓰기·관리는 늘 보인다(계획 리뷰 D15) */}
					<DropdownMenuGroup className="max-h-80 overflow-y-auto">
						{presets.isPending ? (
							<p className="flex min-h-11 items-center gap-2 px-2 text-muted-foreground text-sm">
								<Spinner aria-hidden="true" />
								{PRESET_TEXT.loading}
							</p>
						) : presets.isError && !presets.data ? (
							<>
								<p className="px-2 py-2 text-sm text-warning">
									{PRESET_TEXT.listFailed}
								</p>
								<DropdownMenuItem
									className="min-h-11"
									closeOnClick={false}
									onClick={() => void presets.refetch()}
								>
									{PRESET_TEXT.retry}
								</DropdownMenuItem>
							</>
						) : mine.length === 0 ? (
							<p className="px-2 py-2 text-muted-foreground text-sm">
								{PRESET_TEXT.none}
							</p>
						) : (
							mine.map((preset) => (
								<DropdownMenuItem
									key={preset.id}
									className="min-h-11 flex-col items-start gap-0.5"
									onClick={() => setOpen({ kind: "load", preset })}
								>
									<span className="max-w-full truncate font-bold">
										{preset.name}
									</span>
									<span className="max-w-full truncate text-muted-foreground text-sm">
										{savedVoiceLine(preset)}
									</span>
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="min-h-11"
						onClick={() => setOpen({ kind: "save" })}
					>
						{PRESET_TEXT.saveNew}
					</DropdownMenuItem>
					{loaded ? (
						<DropdownMenuItem
							className="min-h-11"
							onClick={() => setOpen({ kind: "overwrite", preset: loaded })}
						>
							{overwriteItem(loaded.name)}
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			{open?.kind === "save" ? (
				<PresetFormDialog
					title={PRESET_TEXT.saveTitle}
					presetId={null}
					initial={{ name: "", channelId: null, channelDefault: false }}
					summary={
						<>
							<p>
								{`${PROVIDER_LABEL[provider]} · ${voice.name} · ${presetSummary(shown)}`}
							</p>
							<p>{PRESET_TEXT.saveNote}</p>
						</>
					}
					save={(values) => create.mutateAsync({ ...values, voice, ...shown })}
					onSaved={(preset) => {
						apply(preset);
						toast.success(savedMessage(preset.name));
					}}
					openerRef={triggerRef}
					goneFocus={() => triggerRef.current}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "load" ? (
				<LoadDialog
					voice={voice}
					preset={open.preset}
					openerRef={triggerRef}
					onLoad={() => load(open.preset)}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "overwrite" ? (
				<ConfirmDialog
					title={overwriteQuestion(open.preset.name)}
					description={<OverwriteDetail voice={voice} preset={open.preset} />}
					action="덮어쓰기"
					pendingText={PRESET_TEXT.overwriting}
					failedText={MESSAGES.saveFailed}
					doneText={overwrittenMessage(open.preset.name)}
					pending={overwrite.isPending}
					send={(handlers) =>
						overwrite.mutate(
							{ id: open.preset.id, voice, ...shown },
							{
								...handlers,
								onSuccess: (preset) => {
									apply(preset);
									handlers.onSuccess();
								},
							},
						)
					}
					openerRef={triggerRef}
					focusAfterDone={() => triggerRef.current}
					onClose={() => setOpen(null)}
				/>
			) : null}
		</>
	);
}

// 칸 머리 아래 "프리셋 ‘{이름}’ · 바뀐 값 있음". 불러온 프리셋이 목록에 있을 때만(다른 탭에서 지웠으면 없다).
// '바뀐 값 있음'이 생기고 사라지는 것을 보조기기에 알린다(계획 리뷰 D16)
export function PresetLine({ voice }: { voice: Voice }) {
	const trial = useTrial();
	const presets = usePresetList();
	const loaded = trial.loaded(voice.provider);
	const preset = loaded
		? presets.data?.find((item) => item.id === loaded.id)
		: undefined;
	if (!loaded || !preset) return null;
	const changed = !sameSettings(
		voice.provider,
		trial.settings[voice.provider],
		loaded.settings,
	);
	return (
		<p aria-live="polite" className="text-muted-foreground text-sm">
			{loadedName(preset.name)}
			{changed ? (
				<>
					{" · "}
					<span className="font-bold text-foreground">
						{PRESET_TEXT.changed}
					</span>
				</>
			) : null}
		</p>
	);
}
```

- [ ] **Step 3: 머리에 메뉴와 줄을 둔다**

`apps/web/src/components/trial-section.tsx`에서 `changed`가 불러온 프리셋도 본다. 처음 값과 같은 프리셋을 불러와도 '처음 값으로'로 프리셋 표시를 지울 수 있다(계획 리뷰 E5):

```ts
	// 처음 값과 다르거나 불러온 프리셋이 있으면 '처음 값으로'가 켜진다(누르면 표시도 지운다)
	const changed =
		JSON.stringify(trial.settings[voice.provider]) !==
			JSON.stringify(DEFAULT_SETTINGS[voice.provider]) ||
		trial.loaded(voice.provider) !== null;
```

머리(`<div className="flex min-h-11 items-center justify-between gap-2">`)를 이렇게 바꾸고 바로 아래에 `<PresetLine>`을 둔다(import `PresetLine, PresetMenu` from `./preset-menu`):

```tsx
			<div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
				<h3 id={headingId} className="font-bold">
					내 문장 듣기
				</h3>
				<div className="flex items-center">
					<PresetMenu
						voice={voice}
						onApplied={() => setResetKey((current) => current + 1)}
					/>
					<Button
						variant="ghost"
						size="lg"
						focusableWhenDisabled
						className={cn("text-muted-foreground", lockedButton(!changed))}
						disabled={!changed}
						onClick={() => {
							trial.resetSettings(voice.provider);
							setResetKey((current) => current + 1);
						}}
					>
						처음 값으로
					</Button>
				</div>
			</div>
			<PresetLine voice={voice} />
```

- [ ] **Step 4: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/trial-provider.tsx apps/web/src/components/preset-menu.tsx apps/web/src/components/trial-section.tsx && pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check apps/web/src/components/trial-provider.tsx apps/web/src/components/preset-menu.tsx apps/web/src/components/trial-section.tsx`
Expected: exit 0

- [ ] **Step 5: 런타임 확인 (코디네이터)**

`/casting`에서 Typecast 성우 하나 → '프리셋' 메뉴(빈 안내·저장 항목) → 저장 창(이름·채널·기본) → 저장 → 칸 머리 줄 → 다른 Typecast 성우에서 불러오기 창(바뀌는 값) → 불러오기 → 슬라이더 하나 → '바뀐 값 있음' → 덮어쓰기 확인 창. v21만 있는 Typecast 성우에서 저장하면 `/presets` 요약이 ssfm-v21이다(U1). 다른 탭에서 지운 프리셋을 불러오면 '찾을 수 없어요'(U2, S13). 390 서랍에서 메뉴 → 저장 창 → Esc: 포커스가 '프리셋' 버튼에 오고 서랍은 열린 채다(계획 리뷰 D20). 콘솔·개발 오버레이·`get_errors`·서버 로그 0. 유료 버튼은 누르지 않는다.

---

### Task 7: `/presets` 화면과 메뉴

**Files:**
- Create: `apps/web/src/app/(app)/presets/page.tsx`
- Create: `apps/web/src/components/preset-board.tsx`
- Modify: `apps/web/src/components/class-group.tsx:45,81`(`RowAction`·`boxClass` export)
- Modify: `apps/web/src/components/app-nav.tsx:39-58`
- Modify: `apps/web/src/components/preset-menu.tsx`(메뉴 끝 '프리셋 관리', 계획 재리뷰 R1)

**Interfaces:**
- Consumes: Task 4 문구·함수, Task 5 훅·`PresetFormDialog`, `ConfirmDialog`, `Notice`·`LoopbackNotice`, `ReloadButton`, T6 `byName`·`neighborId`·`MESSAGES`·`saveFailure`.
- Produces: `PresetBoard()`, 라우트 `/presets`.

- [ ] **Step 1: 행 동작과 그릇을 내보낸다**

`apps/web/src/components/class-group.tsx`의 `function RowAction`을 `export function RowAction`으로, `const boxClass`를 `export const boxClass`로 바꾼다.

- [ ] **Step 2: 페이지를 쓴다**

```tsx
// apps/web/src/app/(app)/presets/page.tsx
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PresetBoard } from "@/components/preset-board";

export const metadata: Metadata = { title: "프리셋" };

// Server Component. db 모듈을 부르지 않는다. 조회·변경은 PresetBoard가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드).
// 설정 값을 어디서 고치는지는 이 설명 한 곳에만 둔다(본문에 같은 안내를 되풀이하지 않는다, 계획 리뷰 D18)
export default function PresetsPage() {
	return (
		<>
			<PageHeader
				title="프리셋"
				description="자주 쓰는 성우와 듣기 설정을 이름 붙여 두고 성우 캐스팅의 '내 문장 듣기'에서 불러와요. 설정 값은 거기서 고친 뒤 덮어써요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<PresetBoard />
			</div>
		</>
	);
}
```

- [ ] **Step 3: 본문을 쓴다**

```tsx
// apps/web/src/components/preset-board.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button, buttonVariants } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { ArrowRight, Copy, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { byName, MESSAGES, neighborId, saveFailure } from "@/lib/classes-view";
import {
	copiedMessage,
	countLine,
	PRESET_TEXT,
	presetBadges,
	presetSummary,
	providerVoiceLine,
	removeDefaultNote,
	removedMessage,
	removeQuestion,
	updatedMessage,
} from "@/lib/preset-view";
import { failureOf } from "@/lib/voice-failure";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { boxClass, RowAction } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { LoopbackNotice, Notice } from "./notice";
import { PresetFormDialog } from "./preset-form-dialog";
import {
	useDuplicatePreset,
	usePresetList,
	useRemovePreset,
	useUpdatePreset,
} from "./presets";
import { ReloadButton } from "./voice-problem";

// 지운 뒤 포커스를 옮길 행의 고치기 버튼
const editButtonId = (id: string) => `preset-${id}-edit`;

// '프리셋' 본문(스펙 4절). 한 목록, 이름순(배치는 브리프 18행). 창은 열 때만 마운트하고 연 버튼을 기억한다(T6 ClassGroup과 같다).
// 지운 뒤 포커스: 다음 행 → 이전 행 → 개수 줄. 없어진 프리셋(NOT_FOUND) 뒤에도 개수 줄로(행이 사라진다, 계획 리뷰 F4)
export function PresetBoard() {
	const presets = usePresetList();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const update = useUpdatePreset();
	const duplicate = useDuplicatePreset();
	const remove = useRemovePreset();
	const countRef = useRef<HTMLParagraphElement>(null);
	const openerRef = useRef<HTMLButtonElement | null>(null);
	const nextRef = useRef<string | null>(null);
	const [editing, setEditing] = useState<Preset | null>(null);
	const [removing, setRemoving] = useState<Preset | null>(null);
	if (failureOf(presets.error) === "unauthorized")
		return <LoopbackNotice title={PRESET_TEXT.loopback} />;
	const sorted = presets.data ? byName(presets.data) : undefined;
	const channelName = (id: string | null) =>
		id === null
			? null
			: (channels.data?.find((item) => item.id === id)?.name ?? null);
	function open(button: HTMLButtonElement, show: () => void) {
		openerRef.current = button;
		show();
	}

	let body: React.ReactNode;
	if (presets.isError && !sorted)
		body = (
			<div className="flex flex-wrap items-center gap-3">
				<p className="text-muted-foreground text-sm">
					{PRESET_TEXT.listFailed}
				</p>
				<ReloadButton
					reloading={presets.isFetching}
					onReload={() => void presets.refetch()}
				/>
			</div>
		);
	else if (!sorted)
		body = <Skeleton aria-hidden="true" className="h-24 w-full rounded-2xl" />;
	else if (sorted.length === 0)
		body = (
			<Notice title={PRESET_TEXT.empty} description={PRESET_TEXT.emptyDetail}>
				<Link
					href="/casting"
					className={buttonVariants({ variant: "outline", size: "lg" })}
				>
					{PRESET_TEXT.toCasting}
					<ArrowRight data-icon="inline-end" aria-hidden="true" />
				</Link>
			</Notice>
		);
	else
		body = (
			<ul className={`divide-y overflow-hidden ${boxClass}`}>
				{sorted.map((preset) => {
					const channel = channelName(preset.channelId);
					const badges = presetBadges(preset);
					return (
						// 640px 미만은 글자 칸이 좁아(320px에서 약 112px) 동작 버튼을 아래 줄로 내린다(계획 리뷰 D8)
						<li
							key={preset.id}
							className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-3"
						>
							<div className="min-w-0 flex-1">
								{/* '기본' 배지는 이름 줄에 둔다. 채널 목록이 늦거나 실패해도 흔들리지 않는다(계획 리뷰 D4) */}
								<p className="flex flex-wrap items-center gap-2">
									<span className="wrap-break-word font-bold">
										{preset.name}
									</span>
									{preset.channelDefault ? (
										<Badge variant="primary">{PRESET_TEXT.defaultBadge}</Badge>
									) : null}
								</p>
								<p className="mt-1 text-muted-foreground text-sm">
									{providerVoiceLine(preset)}
								</p>
								{channel ? (
									<p className="wrap-break-word mt-1 text-sm">{channel}</p>
								) : null}
								<p className="wrap-break-word mt-1 text-muted-foreground text-sm">
									{presetSummary(preset)}
								</p>
								{badges.length > 0 ? (
									<div className="mt-2 flex flex-wrap gap-2">
										{badges.map((badge) => (
											<Badge key={badge} variant="warning">
												{badge}
											</Badge>
										))}
									</div>
								) : null}
							</div>
							{/* 고치기 → 복제 → 지우기(위험한 것이 맨 끝). 44px 가운데를 이름 첫 줄에 맞추는 보정은 가로 배치에서만 */}
							<div className="flex shrink-0 self-end sm:-my-2.5 sm:self-auto">
								<RowAction
									id={editButtonId(preset.id)}
									label={`${preset.name} 고치기`}
									tip="고치기"
									icon={Pencil}
									onClick={(button) => open(button, () => setEditing(preset))}
								/>
								<RowAction
									label={`${preset.name} 복제`}
									tip="복제"
									icon={Copy}
									onClick={() => {
										if (duplicate.isPending) return;
										duplicate.mutate(
											{ id: preset.id },
											{
												onSuccess: (copy) =>
													toast.success(copiedMessage(copy.name)),
												onError: (error) => {
													if (saveFailure(error) !== "not_found") {
														toast.error(MESSAGES.saveFailed);
														return;
													}
													toast.error(MESSAGES.notFound);
													countRef.current?.focus();
												},
											},
										);
									}}
								/>
								<RowAction
									label={`${preset.name} 지우기`}
									tip="지우기"
									icon={Trash2}
									onClick={(button) => {
										nextRef.current = neighborId(
											sorted.map((item) => item.id),
											preset.id,
										);
										open(button, () => setRemoving(preset));
									}}
								/>
							</div>
						</li>
					);
				})}
			</ul>
		);

	return (
		<section
			aria-label={PRESET_TEXT.listLabel}
			aria-busy={!sorted && !presets.isError ? true : undefined}
			className="flex max-w-3xl flex-col gap-3"
		>
			{/* 개수 줄은 목록을 받으면 늘 있다(마지막 줄을 지운 뒤 포커스가 갈 곳). 캐스팅 링크는 빈 상태가 따로 가진다(계획 리뷰 D18) */}
			{sorted ? (
				<div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
					<p
						ref={countRef}
						tabIndex={-1}
						className="text-muted-foreground tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2"
					>
						{countLine(sorted.length)}
					</p>
					{sorted.length > 0 ? (
						<Button
							variant="link"
							size="lg"
							nativeButton={false}
							className="px-0"
							render={<Link href="/casting" />}
						>
							{PRESET_TEXT.toCasting}
							<ArrowRight data-icon="inline-end" aria-hidden="true" />
						</Button>
					) : null}
				</div>
			) : null}
			{/* 채널 이름을 받지 못하면 줄의 채널 이름만 빠진다. 그 사실과 다시 받기를 한 번 보인다(계획 리뷰 F7) */}
			{channels.isError && sorted && sorted.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-sm text-warning">{PRESET_TEXT.channelsFailed}</p>
					<ReloadButton
						reloading={channels.isFetching}
						onReload={() => void channels.refetch()}
					/>
				</div>
			) : null}
			{body}
			{editing ? (
				<PresetFormDialog
					title={PRESET_TEXT.editTitle}
					presetId={editing.id}
					initial={{
						name: editing.name,
						channelId: editing.channelId,
						channelDefault: editing.channelDefault,
					}}
					save={(values) => update.mutateAsync({ id: editing.id, ...values })}
					onSaved={(preset) => toast.success(updatedMessage(preset.name))}
					openerRef={openerRef}
					goneFocus={() => countRef.current}
					onClose={() => setEditing(null)}
				/>
			) : null}
			{removing ? (
				<ConfirmDialog
					title={removeQuestion(removing.name)}
					description={`${PRESET_TEXT.removeDetail}${removing.channelDefault ? removeDefaultNote(channelName(removing.channelId)) : ""}`}
					action="지우기"
					pendingText={PRESET_TEXT.removing}
					failedText={MESSAGES.deleteFailed}
					doneText={removedMessage(removing.name)}
					pending={remove.isPending}
					send={(handlers) => remove.mutate({ id: removing.id }, handlers)}
					openerRef={openerRef}
					focusAfterDone={() =>
						(nextRef.current &&
							document.getElementById(editButtonId(nextRef.current))) ||
						countRef.current
					}
					onClose={() => setRemoving(null)}
				/>
			) : null}
		</section>
	);
}
```

- [ ] **Step 4: 메뉴를 옮긴다**

`apps/web/src/components/app-nav.tsx`:

```ts
	{ label: "성우 보관함", icon: UserRound, href: "/voices", bar: false },
	{ label: "프리셋", icon: SlidersHorizontal, href: "/presets", bar: false },
	{ label: "연결 상태", icon: Link2, href: "/connections", bar: true },
```

`UPCOMING_ITEMS`에서 `{ label: "프리셋", icon: SlidersHorizontal }`를 지운다(남는 셋: 대본 보관함, 프로젝트, 내 보이스).

`apps/web/src/components/preset-menu.tsx`의 메뉴 끝(덮어쓰기 항목 뒤, `</DropdownMenuContent>` 앞)에 관리 화면 링크를 더한다. `typedRoutes`가 `/presets` 라우트를 알게 된 이 단계에서 더한다(Task 6에서 더하면 Task 6 타입 검사가 실패한다, 계획 재리뷰 R1). import에 `import Link from "next/link";`를 더한다:

```tsx
					{/* 이름 고치기·복제·지우기는 관리 화면에서(계획 리뷰 D2) */}
					<DropdownMenuItem
						className="min-h-11"
						render={<Link href="/presets" />}
					>
						{PRESET_TEXT.manage}
					</DropdownMenuItem>
```

- [ ] **Step 5: 검사**

Run: `pnpm exec biome check --write apps/web/src/app/\(app\)/presets apps/web/src/components/preset-board.tsx apps/web/src/components/class-group.tsx apps/web/src/components/app-nav.tsx apps/web/src/components/preset-menu.tsx && pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check apps/web/src/app/\(app\)/presets apps/web/src/components/preset-board.tsx apps/web/src/components/class-group.tsx apps/web/src/components/app-nav.tsx apps/web/src/components/preset-menu.tsx`
Expected: exit 0. `app-nav`에 메뉴 개수를 단언하는 테스트가 있으면 그 기대값을 고친다(열린 화면 +1, 준비 중 -1).

- [ ] **Step 6: 런타임 확인 (코디네이터)**

`/presets` 빈 상태 → 캐스팅에서 둘 저장 → 목록(이름순, 요약, 채널·기본) → 고치기(채널 바꾸기, 기본) → 복제 둘('사본', '사본 2', 사본 줄의 위치와 포커스가 복제 버튼에 남는지, 계획 리뷰 D19) → 지우기 취소·지우기(포커스가 다음 행) → 메뉴 '프리셋'(767px 이하는 더보기 안). 오류 예산 0.

---

### Task 8: 성우 보관함 '프리셋' 보기와 무효화

**Files:**
- Modify: `apps/web/src/components/library-filters.tsx:29-33`
- Modify: `apps/web/src/components/voice-library.tsx`(프리셋 목록, `filterSaved` 두 곳, 상태 줄)
- Modify: `apps/web/src/components/saved-section.tsx:293-330`(빼기 확인 문구)
- Modify: `apps/web/src/components/saved-voices.tsx:181-196`(`useRemoveVoice` 무효화)
- Modify: `apps/web/src/components/class-delete-dialog.tsx:36-45`(채널·분류 지우기 무효화)

**Interfaces:**
- Consumes: Task 4 `presetVoiceIds`·`presetCountOf`·`presetRemoveNote`·`PRESET_TEXT`, Task 5 `usePresetList`.

- [ ] **Step 1: 보기 칸을 더한다**

`apps/web/src/components/library-filters.tsx`의 `VIEWS` 끝에 `{ value: "preset", label: "프리셋" }`. 칸이 넷이 되어 320px에서 넘치지 않게 `viewItem`의 `px-4`를 `px-3 md:px-4`로 바꾼다(계획 리뷰 D9). 위쪽 주석의 "보기 세 칸"을 "보기 네 칸"으로 고친다.

- [ ] **Step 2: 보관함이 프리셋 성우 집합으로 거른다**

`apps/web/src/components/voice-library.tsx`:

```tsx
import { PRESET_TEXT, presetVoiceIds } from "@/lib/preset-view";
import { usePresetList } from "./presets";
// … VoiceLibrary 안, list·useClassLists 옆
	const presets = usePresetList();
	const presetVoices = presetVoiceIds(presets.data ?? []);
// filterSaved 두 곳에 셋째 인자 presetVoices를 넘긴다(목록과 알림 개수)
	const shown = filterSaved(items, filters, presetVoices);
	// … setAnnounced(countLine(items.length, filterSaved(items, next, presetVoices).length));
```

상태 줄(`check.isFetching` 줄 뒤):

```tsx
					{filters.view === "preset" && presets.isPending
						? ` · ${PRESET_TEXT.loading}`
						: null}
					{filters.view === "preset" && presets.isError
						? ` · ${PRESET_TEXT.listFailed}`
						: null}
```

- [ ] **Step 3: 빼기 확인에 프리셋 수를 붙인다**

`apps/web/src/components/saved-section.tsx`의 `RemoveDialog`:

```tsx
	const remove = useRemoveVoice();
	const presets = usePresetList();
	const count = presetCountOf(presets.data ?? [], item.id);
	return (
		<ConfirmDialog
			title={removeQuestion(name)}
			// 프리셋 목록을 받지 못했으면 확인하지 못했다고 알린다(계획 리뷰 D10)
			description={`${LIBRARY_TEXT.removeDetail}${presetRemoveNote(count, presets.isError)}`}
			// … 나머지 그대로
```

import: `presetCountOf, presetRemoveNote` from `@/lib/preset-view`, `usePresetList` from `./presets`.

- [ ] **Step 4: 프리셋 목록을 다시 받는다**

`apps/web/src/components/saved-voices.tsx`의 `useRemoveVoice` `onSettled`:

```ts
		// 빼면 그 성우를 쓰는 프리셋의 성우가 빈다(T8). presets.tsx를 import하면 순환이라 접두 키를 직접 쓴다
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: savedListKey });
			invalidateClasses(queryClient);
			void queryClient.invalidateQueries({ queryKey: orpc.presetList.key() });
		},
```

`apps/web/src/components/class-delete-dialog.tsx`의 `onSettled` `Promise.all`에 더한다:

```ts
				// 채널을 지우면 프리셋의 채널·기본이 풀린다(T8)
				queryClient.invalidateQueries({ queryKey: orpc.presetList.key() }),
```

- [ ] **Step 5: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/library-filters.tsx apps/web/src/components/voice-library.tsx apps/web/src/components/saved-section.tsx apps/web/src/components/saved-voices.tsx apps/web/src/components/class-delete-dialog.tsx && pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check apps/web/src/components/library-filters.tsx apps/web/src/components/voice-library.tsx apps/web/src/components/saved-section.tsx apps/web/src/components/saved-voices.tsx apps/web/src/components/class-delete-dialog.tsx`
Expected: exit 0

- [ ] **Step 6: 런타임 확인 (코디네이터)**

`/voices?view=preset`(프리셋 성우만, 새로 고침 유지) → 프리셋 성우의 '보관함에서 빼기' 확인 창 문구(프리셋 N개) → 빼기 → `/presets` '성우를 다시 골라 주세요'. `/classes`에서 기본 채널 지우기 → `/presets` 채널·기본 사라짐. 오류 예산 0.

---

### Task 9: 문서

**Files:**
- Modify: `docs/domain/project.md`(기능·화면과 URL·API·데이터 모델 표)
- Modify: `docs/briefs/site-map.md`(갱신 줄, `/presets` 행, `/casting`·`/voices`·`/classes` 행의 프리셋 동작, '준비 중'에서 프리셋 지우기)
- Modify: `docs/briefs/casting.md`(5절 5번 '프리셋 자리'를 브리프 18행 결정으로 채우고 개정 줄), `docs/briefs/voices.md`('보기' 네 칸, 빼기 확인 문구)
- Create: `docs/adr/0005-channel-default-preset.md`(domain-modeling `ADR-FORMAT.md`)
- Modify: `docs/plans/implementation-roadmap.md`(T8 상태·구현 상태 줄, T9·T11·T13·T14 메모에 스펙 13절)

- [ ] **Step 1: `docs/domain/project.md`**
  - 기능 표: '프리셋'(T8) 한 줄, 성우 보관함의 '프리셋 포함 필터는 T8' 문장을 지금 모습으로 고친다.
  - 화면과 URL 표: `/presets` 행(용어 '프리셋', 비보호 페이지 + `protectedProcedure` 데이터).
  - API 표: 프로시저 6개(용어 칸 '프리셋', '채널 기본 프리셋').
  - 데이터 모델 표: `voice_preset`·`channel_default_preset` 행(제약·인덱스·`on delete` 동작), `channel` 행의 "프리셋(T8)…가리킬 예정"을 지금 모습으로, `saved_voice` 행의 "프리셋 포함 필터(T8)…예정"을 지금 모습으로.
- [ ] **Step 2: 사이트맵·브리프** — 위 목록대로. 사이트맵 페이지 표의 `/presets` 행에는 들어오는 곳(메뉴 '프리셋', 빈 상태 없음)과 나가는 링크·버튼(고치기·복제·지우기, '성우 캐스팅으로' → `/casting`)을 모두 적는다.
- [ ] **Step 3: ADR 0005** — 상태 '결정(2026-10-14)'. 맥락: T6 ADR 0004가 채널 ↔ 프리셋 상호 참조를 T8로 미룸. 결정: 연결 표 `channel_default_preset`(채널 기본 키, 양쪽 `cascade`, 프리셋 유니크). 대안: `channel.default_preset_id`(상호 참조, 지우기 순서·관계 정의가 꼬임), 프리셋 표의 표시 칸(채널을 지운 뒤 남는 표시). 결과: 기본의 채널 일치는 프로시저가 지킨다.
- [ ] **Step 4: 로드맵** — T8 표 상태는 닫을 때 '완료(날짜)'로, T8 절에 '구현 상태' 줄. 스펙 13절 네 줄을 T9·T11·T13·T14 절에 'T8에서 넘어온 것'으로 옮긴다.

---

## 수용 기준과 확인 위치

| 스펙 8절 | 자동 테스트 | QA(10절) |
|---|---|---|
| 1 저장·보관함 담기·새로 고침 | Task 3 "만들기 왕복", "이미 담긴 성우" | S2, S5 |
| 2 다른 성우에서 불러오기·비교 | Task 4 `settingChanges`·`loadNotes`·`presetSettingsOf`(U1) | S3 |
| 3 다음 방문 같은 조합 | (T5 조합 키 그대로) Task 4 `sameSettings` | S5 |
| 4 덮어쓰기·다른 공급자 거절 | Task 3 "보관함에서 빼면…덮어쓰기", "다른 공급자" | S4 |
| 5 고치기·복제·지우기·이름 중복 | Task 2 이름·`copyName`, Task 3 "이름 중복", "고치기", "복제", "지우기" | S6, S7, S8 |
| 6 채널 기본 하나·채널 지우기 | Task 3 "채널 기본", "채널을 지우면" | S7, S9 |
| 7 보관함 빼기 → 성우 다시 고르기 | Task 3 "보관함에서 빼면", Task 4 `presetRemoveNote` | S10 |
| 8 보관함 '프리셋' 보기 | Task 4 `filterSaved` preset, 쿼리 | S11 |
| 9 쓸 수 없는 값 | Task 2 `readSettings`, Task 3 "옛 값" | S12 |
| 10 지워도 결과 그대로 | Task 3 "지우기 … 내 문장 결과는 그대로" | S18 |
| 11 격리·소유자 없음 | Task 3 격리 4건 | — |
| 12 유료 호출 0 | 프로시저가 공급자를 부르지 않음(Task 3 `providers: null`) | 전 시나리오 서버 로그 |
| 13 너비·테마·키보드 | — | S16, S17, S19 |
| 14 오류 예산 0 | — | 21·27·30행 |

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

- 20행: `pnpm check-types`, `pnpm exec biome check .`(기준 errors 10·warnings 2·infos 2와 비교, 바꾼 파일만 따로 0), `pnpm build`.
- 21·27행: `next-dev-loop` `/_next/mcp`와 ego-browser(없으면 agent-browser). `/casting`·`/presets`·`/voices`·`/classes`, 1440·390, 라이트·다크. 스크린샷은 `tasks/evidence/T08/`.
- 22~26행: impeccable critique·audit(메인 세션), web-design-guidelines, polish, 재확인.
- 28행: ponytail-review(이번 diff와 공통 모듈 소비자: `class-group`·`class-form-dialog`·`trial-view`·`saved-voice-view`).
- 29행: prokit-reviewer(code) 전체 diff, 37행 prokit-reviewer(security).
- 30~31행: 스펙 10절 S1~S19 전부(유료 버튼 누르지 않음), 깨끗한 프로필로 오류 예산.
- 36행: Task 9 문서 확인. 38행 `[confirm]`: 스펙 11절 절차와 "이번에 없는 것".

## 자기 검토 (writing-plans, 2026-10-14, 계획 리뷰 반영 뒤 다시)

1. **스펙 범위:** 3절 표 둘(Task 1)·프로시저 6개(Task 3)·`readSettings`(Task 2), 4절 캐스팅 메뉴·저장·불러오기 비교·덮어쓰기·불러온 표시(Task 6), `/presets`(Task 7), `/voices` 보기·빼기 문구(Task 8), 앱 틀 메뉴(Task 7), 5절 오류(Task 3 매핑 + Task 5 창), 6절 문서(Task 9). 빠진 요구 없음.
2. **자리표시자:** 코드 단계는 모두 실제 코드다. Task 9만 문서 내용 목록이다(문서 문장은 그 TASK 결정을 옮겨 쓴다).
3. **이름 일치:** `presetSettingsOf(voice, all)`·`settingChanges`·`loadNotes`·`loadedName`·`countLine`·`removeDefaultNote`·`presetRemoveNote`·`presetCountOf`·`presetVoiceIds`(Task 4 정의 ↔ Task 6~8 사용), `PresetValue`(Task 2 ↔ Task 4), `PresetFormDialog`의 `summary`·`goneFocus`(Task 5 ↔ 6·7), `RadioMenu` `className`(Task 5), `loadPreset`·`loaded`·`LoadedPreset`(Task 6), `usePresetList`·`use*Preset`(Task 5 ↔ 6~8), `PresetFormDialog` props(Task 5 ↔ 6·7), `RowAction`·`boxClass`(Task 7 export ↔ 사용), `isUniqueViolation`(Task 3 ↔ classification). `presetSchema` 출력 칸(Task 2)과 테스트 기대(Task 3)가 같다(`updatedAt` 없음, '스펙과 다른 점' 1).
4. **Review Focus:** 다섯 줄 모두 테스트가 붙은 태스크가 있다(Task 2·3·5·6·8, QA S6·S9·S10).
