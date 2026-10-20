# T9 Typecast 음성 생성·재생·다운로드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/studio`에서 대본(최대 2,000자)과 담아 둔 Typecast 성우·설정으로 실제 한국어 음성을 만들고, 듣고, 내려받는다. 두 번 눌러도 공급자 요청은 1회이고, 다시 듣기와 내려받기는 생성 API를 다시 부르지 않는다. 뒤 TASK가 쓸 문단 카드 틀, 작업실 생성 경로(`studio*`, 나눠 받기), 감정 팔레트 틀을 만든다.

**Architecture:**
- `packages/db`: `trial_generation`에 `kind`(`trial`·`studio`, 기본 `trial`, check)와 작업실 목록 부분 인덱스, `saved_voice`에 `last_used_at`·`use_count`. 생성 마이그레이션 하나와 `--custom` 마이그레이션 하나(`audio` 저장 방식 `EXTERNAL`).
- `packages/api`:
  - `studio-contract.ts`(작업실 요청·결과·조각 입력 zod). 값 상수(`STUDIO_TEXT_MAX`, `STUDIO_PART_BYTES`, `STUDIO_AUDIO_MAX`, `partsOf`)는 화면도 쓰므로 zod 없는 `providers/trial-options.ts`에 둔다.
  - `trial.ts`: 조합 키에 `kind`, 작업실 찾기·목록·조각 읽기, 사용 이력 올리기, 늦은 결과 저장. 시험 생성 쪽 함수는 `kind = 'trial'` 행만 본다.
  - `providers/errors.ts`·`typecast.ts`: 생성 한 번의 기다림(`timeoutMs`)과 끊긴 요청의 결과 넘기기(`onLate`).
  - `routers/studio.ts`: 프로시저 다섯(`studioCreate`·`studioFind`·`studioList`·`studioAudio`·`studioDelete`). `studioCreate`는 T5 `trialCreate` 순서에 서버 성우 검사를 더한다. `savedVoiceList` 출력에 `lastUsedAt`·`useCount`.
- 화면:
  - 순수 함수 `lib/studio-view.ts`(막는 이유·글자 수·파일 이름·감정 뱃지·임시 작업 읽기·성우 정렬·작업실 불러오기 비교·오류 문구).
  - 공유 컴포넌트를 작업실도 쓰게 한다. 설정 칸 `Options`는 `setting-fields.tsx`로 옮기고 `onChange`·`palette`를 받는다. 확인 창 `TrialConfirm`은 `kind`를 받는다. 프리셋 메뉴는 화면 상태 인터페이스 `PresetHost`를 받는다. 캐스팅 동작은 그대로다.
  - `StudioProvider`(대본은 따로 `ScriptProvider`), 문단 카드·성우 고르기 창·감정 팔레트·하단 막대·이전 결과·채널 고르기.
- 1차 버튼 hover 토큰 `--primary-hover`(라이트 brand-600, 다크 brand-300).

**Tech Stack:** Next.js 16.3 App Router(`typedRoutes`, React Compiler), React 19.3, oRPC 1.15.4, TanStack Query 5.103, zod 4.6.5, drizzle-orm·drizzle-kit 1.0.0-rc.4, Postgres 18(로컬 5433), vitest 5, shadcn `base-lyra`(Base UI 1.8.0), Tailwind CSS 4, Biome 2, `@neosapience/typecast-js` 0.4.15(설치본 패치: `redirect: "error"`), Node 24.22.0(undici 7.29.1).

**Spec:** [T9 스펙](T09-studio-typecast.md)(사용자 확인 2026-10-20 "확인, 계획으로", 구속력 있는 정본). 화면 브리프 `docs/briefs/studio.md`(대조표 18행에서 쓰고 사용자 확인. Task 8 전에 있어야 한다). [로드맵 T9](../implementation-roadmap.md), `GLOSSARY.md`(음성 생성·감정 팔레트·생성 기록·사용 이력·임시 작업·프리셋·채널 기본 프리셋).

**계획 확인:** 2026-10-20 사용자 "구현 계획대로 구현 진행해"(`/superpowers:subagent-driven-development`). 실행 방식: 서브에이전트 방식. 장부 `.superpowers/sdd/T09-studio-typecast-plan/progress.md`.

## 스펙과 다른 점 (계획에서 정한 것, 계획 리뷰에서 확인한다)

1. **값 상수는 `studio-contract.ts`가 아니라 `providers/trial-options.ts`에 둔다.** 스펙 7절은 `STUDIO_TEXT_MAX`와 조각 크기를 `studio-contract.ts`에 두라고 했다. 그런데 화면이 이 값을 쓴다(글자 수, 조각 수). `apps/web`은 zod에 의존하지 않고 계약 파일에서 타입만 가져간다(T8 Global Constraints). 그래서 값은 zod 없는 `trial-options.ts`에 두고, `studio-contract.ts`에는 zod 스키마와 타입만 둔다.
2. **마이그레이션이 둘이다.** 스펙 3절은 "마이그레이션 1개"다. drizzle 1.0.0-rc.4에는 컬럼 저장 방식(`SET STORAGE`)을 적는 API가 없다(설치본 확인). 스키마 변경은 `db:generate`로 만들고, `ALTER TABLE … SET STORAGE EXTERNAL`은 `db:generate --custom`이 만든 빈 마이그레이션에 쓴다(`prokit-db`가 허용하는 길). 이유는 '설치본·문서로 확인한 것' 6·7이다.
3. **서버 성우 검사 거절에 사유 `voice_unavailable`을 붙인다.** 스펙 5절은 `BAD_REQUEST`(공급자 호출 0회)만 적었다. 화면이 스펙 5절 문구("이 성우는 보관함에 없거나 현재 이용 불가예요…")를 고르려면 사유가 있어야 한다. 시험 생성 실패 사유 목록(`trialFailureSchema`)에 더하고 코드는 `BAD_REQUEST`다.
4. **완료 기록(오디오 저장)이 실패하면 `unknown_outcome`으로 알린다.** T5는 저장에 실패해도 받은 오디오를 응답으로 돌려준다. 작업실 출력에는 오디오가 없고 화면은 저장된 조각을 받아야 들을 수 있다. 크레딧은 쓰였지만 결과를 줄 수 없으므로 "처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니…"가 맞는 안내다. 행은 미확인으로 옮기려고 한 번 시도하고(대개 DB가 꺼진 경우라 실패한다), 실패하면 5분 뒤 T5 규칙대로 미확인이 된다. 사용 이력은 올리지 않는다.
5. **늦은 결과의 경계를 정한다.** 스펙 2절 '늦은 결과'를 이렇게 구체화한다.
   - 늦은 오디오가 32MiB를 넘거나, 그사이 사용자가 그 기록을 지웠으면 저장하지 않고 사용 이력도 올리지 않는다. 미확인 행만 완료로 바꾼다(`status = 'unknown'` 조건).
   - Node fetch(undici)는 응답 머리를 300초 기다리고 끊는다. 그래서 요청을 보낸 지 300초가 지나서 오는 결과는 받지 못하고 늦은 실패와 같다(미확인 그대로).
6. **"다른 생성이 진행 중이에요"는 막는 이유 줄이 아니라 오류 줄이다.** 스펙 4절은 막는 이유 목록에 넣었다. 화면은 다른 탭(캐스팅)의 진행을 알 수 없다. 이 화면이 만드는 중일 때는 버튼이 '만드는 중 · N초'로 잠긴다. 다른 화면의 진행은 서버의 `in_progress` 거절 뒤 오류 줄에 이 문구로 보인다.
7. **`Options`를 `components/setting-fields.tsx`로 옮긴다.** 스펙 7절은 `trial-*.tsx`를 고친다고만 했다. `trial-section.tsx`는 `voice-casting.tsx`(캐스팅 화면 전체)에서 `sourceItem`을 가져온다. 작업실이 `trial-section.tsx`를 가져가면 캐스팅 화면 전체가 작업실 번들에 딸려 온다. 그래서 설정 칸(`SliderRow`·`TagControl`·`DirectionControl`·`Options`)과 `sourceItem`을 새 파일로 옮기고 캐스팅·작업실이 그 파일을 가져간다. 코드는 그대로 옮기고 `Options`에 `onChange`·`palette`만 더한다.
8. **`PageHeader`에 선택 prop `actions`를 더한다.** 스펙 4절의 머리(제목 오른쪽 채널 고르기·'프리셋')를 그리려면 필요하다. 다른 화면은 넘기지 않으므로 그대로다.
9. **1차 버튼 hover 토큰은 `packages/ui/src/styles/globals.css`에도 더한다.** 스펙 7절은 `button.tsx`만 적었다. brand-600·brand-300은 지금 CSS 토큰이 아니다(`DESIGN.md` 앞머리에만 있다). `--primary-hover`를 라이트·다크에 두고 `button.tsx`가 `hover:bg-primary-hover`를 쓴다.
10. **작업실 오디오 전달 방식을 ADR 0006으로 남긴다.** 스펙 6절 문서 목록에는 ADR이 없다. `tts-provider` '오디오 입출력' 절은 4.5MB를 넘을 수 있는 결과의 전송 방식을 정하면 ADR로 남기라고 한다(Task 11).
11. **작업실 프리셋 메뉴는 성우를 고르기 전에는 '지금 설정으로 새 프리셋 저장'과 덮어쓰기가 꺼진다.** 프리셋은 성우와 함께 저장된다(T8 계약 `voice` 필수). 스펙에 없는 상태라 브리프가 이유 표시를 정한다.
12. **채널의 기본 프리셋이 Typecast가 아니면 창을 띄우지 않는다.** 이번 작업실은 Typecast만 만든다(스펙 1절). 채널만 바뀐다.
13. **이전 결과의 '재생'은 플레이어에 올리고 바로 재생한다.** 스펙 4절은 "'재생'(플레이어에 올림)"이고 새로 만든 결과는 자동 재생하지 않는다. 사용자가 그 줄의 '재생'을 눌렀으므로 재생한다. '음성 만들기'의 결과와 '저장된 결과 열기'는 올리기만 한다.
14. **임시 작업은 첫 그리기 뒤에 읽고, 그 전에는 카드 자리에 뼈대를 보인다.** 서버 그리기에는 이 브라우저 저장소가 없다. 읽기 전의 빈 대본이 잠깐 보였다가 바뀌는 깜빡임을 피한다. 저장해 둔 성우가 있으면 담은 성우 목록을 받을 때까지도 뼈대다('성우 고르기'가 보였다가 이름으로 바뀌지 않게, 디자인 리뷰 D7).
15. **브라우저 QA에 S20(생성 성공 → 조각 → 플레이어)을 더한다.** 스펙 10절은 '크레딧 쓰고 만들기'를 누르지 않아 이 연결의 첫 실행이 유료 사용자 테스트가 된다. 코디네이터가 CDP Fetch 가로채기로 `/api/rpc/studioCreate` 응답을 개발 DB에 넣어 둔 무음 결과 행으로 채운다(공급자 0회, '구현 뒤'). 누르기 전에 카나리로 가로채기가 살아 있는지 확인하고, 조각 받기 실패 갈래 S20b도 본다(계획 재리뷰 R1·N2). 스펙 10절 표에 S20을 더하는 것은 Task 11에서 한다(계획 리뷰 E6, 코디네이터 결정).
16. **미확인 줄이 있으면 이전 결과를 15초마다 다시 받는다.** 스펙 8절 7번("그 뒤 도착한 오디오는 … 이전 결과에서 완료로 보인다")이 보고 있는 화면에서도 되게 한다. 만든 지 6분 안의 미확인 줄이 없으면 멈춘다(늦은 결과는 요청 300초 뒤에는 오지 않는다, '설치본·문서로 확인한 것' 4). 판정은 순수 함수 `unknownRefetch`(Task 5)다(계획 리뷰 P2).
17. **조각 받기 실패는 생성 오류 줄과 따로 알린다.** 스펙 5절에 없는 경우다. 찾을 수 없음(`NOT_FOUND`)은 스펙 문구("이미 지워졌거나 찾을 수 없어요", 목록을 다시 받음), 그 밖의 실패는 알림 "결과를 받지 못했어요. 이전 결과에서 다시 열어 주세요"(초안, 브리프가 확정)다. 생성의 사유 없는 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)는 스펙 5절대로 '처리 여부 미확인' 문구다(`createFailureOf`, 계획 리뷰 E1).

## 계획 리뷰 (2026-10-20)

세 리뷰의 결과 파일은 `.superpowers/sdd/T09-studio-typecast-plan/review-plan-{prokit,eng,design}.md`다.
- `prokit-reviewer(plan, opus)`: changes-required, max=medium, P1~P11. 스펙과 다른 점 14개의 근거, 선점·동시 1건 재사용, 성우 검사 순서, 늦은 결과 경합, 태스크 사이 이름·타입, 캐스팅 회귀 동등을 확인했다.
- gstack `plan-eng-review(opus)`: approve-with-fixes, max=P2, E1~E13과 결정 필요 D1~D6.
  - 버리는 worktree에 Task 1~10 계획 코드를 고치지 않고 넣었다. 타입 검사 5/5, api 311 통과(DB 테스트 137 skipped), web 209 통과(새 23), biome 0, `next build` 통과(가짜 자리표시 환경값)였다.
  - `db:generate --custom --name`이 인자를 넘기고, check는 `ADD CONSTRAINT`이며, 생성 SQL 다섯 문장이 Task 1 Step 4와 같다.
  - `/studio` 클라이언트 청크에 캐스팅 전용 글자가 없다('스펙과 다른 점' 7 확인).
- gstack `plan-design-review(sonnet)`: 6.4/10, high D1~D5, medium D6~D12, low D13~D16, 사용자 결정 DN-1~10, 4절 브리프 체크리스트 12항.

**코디네이터 결정(2026-10-20):**
- C1(P1): 메인이 Typecast llms.txt를 다시 확인했다. text는 "1 to 2000 characters"이고 단위(코드 포인트/UTF-16) 기재가 없으며 처리 시간·시간 제한 안내도 없다. 상한은 T5처럼 코드 포인트로 센다(예상 사용량과 같은 단위). Typecast가 UTF-16으로 세면 400이 입력 거절(`provider_input`)로 가는 위험을 '설치본·문서로 확인한 것' 24에 적는다. research 문서 재확인 날짜는 Task 11에서 적는다.
- C2(E6): 생성 성공 → 조각 → 플레이어 연결은 유료 테스트 전에 브라우저 QA S20(CDP Fetch 가로채기)으로 확인한다('스펙과 다른 점' 15).
- C3(P11·design D1·DN-1~10): 화면 배치·키보드 순서·문구는 18행 브리프가 사용자 확인으로 정하고 Task 8·9는 그 뒤 한 번 고친다. Task 7 상태 모델은 어느 선택도 받게 해 둔다(D3·D7·D8·DN-6).
- C4(E7): 실패 기록 블록 공통화는 T10 메모로 미룬다(이번 diff를 작게).
- C5(E5·eng D4): 작업실 키도 같은 판(`TRIAL_CONTRACT_VERSION`)을 쓰고, 판 올림 주석은 `kind = 'trial'` 행만 지운다고 고친다.
- C6(P3·E2·eng D2): Task 1 Step 7에서 먼저 잰다. 판정 규칙은 그 단계에 적는다.

**반영:**
- P1 → '설치본·문서로 확인한 것' 24, Task 11 Step 6(research 재확인 날짜). '스펙과 다른 점'이 아니라 위험으로 둔다.
- P2 → '스펙과 다른 점' 16, Task 5 `unknownRefetch`와 테스트, Task 7 `useStudioItems`의 `refetchInterval`.
- P3·E2 → Task 1 Step 7(node-postgres로 16MiB·32MiB 쓰기, 32MiB 조각 전부 읽기, `attstorage = 'e'`, 판정 규칙). E2가 지적한 'md5 무작위 바이트로 EXTERNAL 증명' 기대 문장을 지웠다. 무압축은 Task 4의 0바이트 1MiB 테스트가 증명한다.
- P4·E3 → Task 3 `replayStudio`(길이만 읽는 같은 요청 id 재생, `expireStale`·`replayStatus`를 T5 함수에서 빼내 함께 쓴다)와 테스트, Task 4 라우터가 쓴다.
- P5 → '대조표 행과 태스크'·Task 4 Step 7·'구현 뒤'를 37행 security, 38행 confirm으로.
- P6 → Task 11 Step 2(ADR 0006에 ADR 0003의 500MB 재검토 조건과의 관계).
- P7 → Task 11 Step 3·5(`/presets` 채널별 보기는 미룸).
- P8 → Task 4 라우터의 `shortcut:` 주석, Task 11 Step 3 T10·T15 메모.
- P9·E11 → Task 9 `StudioBar`의 `shortcut:` 주석(최근 20개 밖은 누를 때 `studioFind`로 찾는다).
- P10 → Task 5 `typecastSettingsOf` 주석(칸별 대체는 T8 `readSettings`와 같은 뜻, `trial-options` 상수 재사용, 상수가 없는 두 열거만 글자로).
- P11·design → '브리프로 넘길 결정'에 디자인 리뷰 4·5절 링크와 추천안, Task 8·9 머리의 '브리프 뒤 고칠 것' 목록.
- design D3 → `Shown.caption`·`shown.id`(Task 7), 막대 캡션과 이전 결과 줄 `aria-current`(Task 9 초안), `shownCaption`·`resultTarget`(Task 5).
- design D7 → Task 7 `restored`가 저장해 둔 성우의 목록을 기다린다.
- design D8 → Task 7 `receiving`, Task 9 줄의 받는 중 표시(초안).
- design DN-6 → Task 7 `start(opener, { regenerate: true })`(찾기를 건너뛰고 새 요청 id로 확인 창). 서버는 새 요청 id면 같은 조합도 다시 합성한다(Task 4 테스트 "같은 조합이라도 새 요청 id면 다시 만든다"). 버튼을 둘지는 DN-6.
- E1 → Task 5 `createFailureOf`·`STUDIO_TEXT.receiveFailed`와 테스트, Task 7 `generate`·`open`·`download`의 실패 처리('스펙과 다른 점' 17).
- E4 → Task 4 "소유자 없음 UNAUTHORIZED"·"DB 실패 storage" 테스트를 `skipIf` 밖 describe로.
- E5 → Task 3 Step 6 판 올림 주석.
- E8 → Task 2 원문 상한 테스트 입력 `가` + 공백 8,000.
- E9 → Task 10 Step 4 `! grep`.
- E10 → Task 1 Step 5 마이그레이션 주석, Task 4 테스트 이름("압축 없이 TOAST 표에(본 행 밖)").
- E12 → Task 3 `completeLate`에 작업실 행 조건과 테스트.
- E13 → Task 6 `library-filters.tsx` 주석, Task 10 CSS 주석을 윗줄로.

**기각·미룸:**
- E7(실패 기록 공통화): T10 메모(C4).
- eng D5(유료 테스트가 첫 실행): 받아들이지 않고 S20으로 대신한다(C2).
- design D1·D2·D4·D5·D6·D9~D16, DN-1~10, 3절 문구 표: 18행 브리프로 넘긴다(C3). 계획 코드의 초안은 브리프 뒤 Task 8·9에서 고친다.
- P9 서명별 `studioFind` 결과 기억: 하지 않는다(입력마다 요청이 생긴다). `shortcut:` 주석으로 둔다.
- P10 '하나라도 어긋나면 전체 처음 값': 하지 않는다. T8 `readSettings`와 같은 뜻을 지킨다.

**재리뷰(2026-10-20):**
- `prokit-reviewer(plan, sonnet)`: approve, max=medium, integration_acceptance accept. P1~P11·E1~E13 반영 확인. 새 지적 R1~R5(`review-plan-prokit-2.md`).
- gstack `plan-eng-review` 2차(opus, 새 버리는 worktree): approve, max=P3. E1~E13 가운데 12개 ADDRESSED, E7은 결정대로 미룸. 반영판 계획 코드를 고치지 않고 넣어 타입 검사 5/5, api 313 통과(DB 138 skipped), web 212 통과, biome 0, `next build`(가짜 자리표시 환경값) 통과. S20 응답 본문 모양(`{"json": …}`)을 메모리 안에서 확인했다. 새 지적 N1~N4(`review-plan-eng-2.md`).

**재리뷰 반영(코디네이터 결정 2026-10-20, 모두 채택):**
- R1(medium) → '구현 뒤' S20의 누르기 전 카나리(입력 검사에 반드시 실패하는 본문의 `studioCreate` fetch, 표식 본문일 때만 진행, 이동·새로 고침마다 다시)와 서버에 닿아도 `BAD_REQUEST`로 끝나는 근거. Task 11 Step 7의 스펙 S20 행. '스펙과 다른 점' 15.
- R2 → Task 1 Step 7 판정 규칙: 먼저 상한 축소, 질의별 제한이 필요하면 `complete`·`completeLate`가 raw `db.$client.query`로 바뀌므로 그 전에 계획 리뷰로.
- R3 → Task 4 "뒤늦은 성공" 테스트의 사용 이력 확인을 `vi.waitFor`로.
- R4·N3 → Task 5 `createFailureOf`가 `BAD_REQUEST`·`UNAUTHORIZED`·`FORBIDDEN`(처리 전 거절)은 `unexpected`로 둔다. 테스트 한 건.
- R5 → '구현 뒤' S18 보강(대본 칸 → 주 버튼 Tab 횟수, 이전 결과 0개·20개), Task 11 Step 7의 스펙 S18 행.
- N1 → Task 3 Step 6 `trial.ts` 머리 주석에 '음성 만들기'도 최근 20개 안의 옛 판 결과를 연다는 한 줄.
- N2 → '구현 뒤' S20b(`studioAudio` 500·404 가로채기), Task 11 Step 7의 스펙 S20b 행.
- N4 → Task 6 Step 8 비교를 `git show HEAD:… | sed` + `diff`로(새 파일은 `git diff --stat`에 나오지 않는다), `library-filters.tsx` 주석에 '여백이 달라 가져오지 않는다'.

**좁은 재리뷰:** `prokit-reviewer(plan, sonnet)` approve, max=low. R1~R5·N1~N4 모두 ADDRESSED(카나리 본문은 uuid 아닌 `requestId`와 빈 `request`라 입력 검사에서 반드시 실패, 표식은 서버가 만들 수 없는 본문이라 닫히는 방식). 새 R6·R7(low)은 코디네이터가 직접 반영했다: R6 → S20 처리기는 `studioCreate` URL이면 본문과 상관없이 `fulfillRequest`만, 그 URL에 `continueRequest` 없음, '크레딧 쓰고 만들기' 직전 카나리 한 번 더. R7 → Task 6 Step 8 비교를 프로세스 치환으로(`/tmp` 임시 파일 없음).

## 브리프로 넘길 결정 (18행 `docs/briefs/studio.md`가 다룬다)

이 계획의 화면 코드(Task 8·9)는 상태와 데이터 흐름을 정하고, 배치·문구는 아래 초안으로 쓴다. 브리프가 바꾸면 브리프를 따르고, 문구는 `STUDIO_TEXT`·`EMOTION_NOTE`(Task 5)만 고친다.

브리프는 디자인 리뷰([review-plan-design.md](../../../.superpowers/sdd/T09-studio-typecast-plan/review-plan-design.md))의 4절 체크리스트 12항과 5절 결정 DN-1~10을 사용자 확인으로 닫는다. 3절 문구 표도 브리프에서 고른다.
- 리뷰 추천안: DN-1 A(고정 막대, DOM은 카드 → 막대 → 이전 결과), DN-2 A(감정 표식이 설정·팔레트로 가는 지름길), DN-3 A(모바일 두 줄 압축), DN-4 A(데스크톱 대본 칸 상한), DN-5 A(성우 버튼으로 포커스 복귀, 작업실 프리셋 알림 "‘이름’ 프리셋을 불러왔어요."), DN-6 A(새로 만들기 없음 + 이유 줄), DN-7 A(사용량을 주 버튼에 합침), DN-8 A(캡션만), DN-9 A(검색 없음), DN-10 A(결과 0개면 구역 숨김).
- Task 8·9는 브리프가 확정된 뒤 한 번 고친다. 고칠 자리는 리뷰 6절 '계획에 반영해야 할 코드 변경 요약'과 각 태스크 머리의 '브리프 뒤 고칠 것'이다.
- Task 7 상태 모델은 어느 선택도 받는다. 지금 올린 결과 id와 캡션(`shown.id`·`shown.caption`, D3), 줄별 받는 중(`receiving`, D8), 같은 조합 새로 만들기(`start(opener, { regenerate: true })`, DN-6), 복원 깜빡임 막기(`restored`, D7)가 있다.

아래는 계획 초안이다(리뷰 전 판단, 브리프가 이긴다).
- **머리:** 제목 '음성 작업실'과 설명 한 줄, 오른쪽에 채널 고르기('채널 · {이름}', 맨 위 '채널 없음', 채널이 없으면 메뉴 안 '채널·분류에서 만들기') → '프리셋' 메뉴. 1023px 이하에서는 제목 아래 줄로 내린다(`PageHeader` `actions`, `lg:` 기준). 불러온 프리셋 줄(`PresetLine`)은 머리 바로 아래 회색 한 줄.
- **문단 카드:** 머리줄 `1`(접근 이름 '문단 1') · 성우 버튼(outline, '이름 · Typecast' 또는 '성우 고르기') · 감정 표식(회색 배지 '감정 기쁨', v30 '자동'과 v21 '기본'이면 숨김) · '설정'(ghost, 펼침 화살표, 처음에는 접힘). 펼치면 옵션(모델 → 감정 팔레트 → 강도 → 언어 → 속도 → 음높이 → 음량)과 '처음 값으로'. 성우를 고르기 전에는 "성우를 고르면 설정을 바꿀 수 있어요". 대본 칸은 최소 높이 160px, 내용에 따라 늘어난다. 글자 수는 칸 아래 오른쪽, 2,000자를 넘으면 `text-warning`.
- **감정 팔레트:** 둥근 토글 뱃지 한 줄(넘치면 감김), 고른 뱃지는 `primary-subtle` 바탕·청록 글자·청록 테두리. 설명은 팔레트 아래 한 줄(지금 고른 뱃지의 설명, `aria-describedby`). 설명 초안 `EMOTION_NOTE`(Task 5).
- **프리셋의 성우를 쓸 수 없을 때 안내:** 카드 머리줄 아래 경고 줄(`text-warning`, 삼각형).
- **성우 고르기 창:** `Dialog`(768px 이상 가운데 최대 512px, 그 아래 아래에서 올라오는 판). 줄마다 기본 샘플 버튼(44px 원형) → 이름(굵게) · 조건 요약(`metaLine`) · '최근 사용 3일 전 · 12회'. 이용 불가 성우는 줄 전체 60% 불투명도, 고르기 버튼 잠김, '현재 이용 불가' 한 줄. 목록이 길면 창 안에서 스크롤(`max-h-96`). 빈 상태 "담은 Typecast 성우가 없어요"와 '성우 캐스팅에서 담기'(outline 링크 버튼). 받는 중 뼈대, 실패 "담은 성우를 불러오지 못했어요"와 '다시 불러오기'.
- **하단 막대(DN-1 결정 전 초안):** 본문 열의 마지막 자식으로 `sticky bottom-0` 카드(카드색, 반경 16px). DOM 순서가 카드 → 이전 결과 → 막대라 키보드는 이전 결과를 먼저 지난다. 브리프가 순서를 바꾸면 막대를 카드 바로 뒤로 옮기고 sticky를 고정 막대로 바꾼다. 왼쪽 플레이어(`<audio controls>`, 최대 448px)와 '내려받기'(outline), 결과가 없으면 "음성을 만들면 여기서 들을 수 있어요". 오른쪽 예상 사용량 줄('새로 만들 때 약 N크레딧' 또는 '저장된 결과 · 크레딧 0'), 주 버튼, 막는 이유 또는 오류 줄. 767px 이하는 세로로 쌓고 버튼은 가득 채운다.
- **주 버튼 문구:** '음성 만들기'(동전 표식) / '저장된 결과 열기'(표식 없음) / '만드는 중 · 12초'(스피너) / 찾는 중은 스피너만.
- **확인 창(작업실):** 제목 "크레딧을 써서 음성을 만들까요?", 대본 줄 "{앞 100자}… (총 N자)", 버튼 '크레딧 쓰고 만들기'. 나머지(성우·설정·예상·남은 크레딧·기본 샘플)는 T5 그대로.
- **이전 결과:** 제목 h2 '이전 결과', 카드 목록(가름선). 줄은 대본 첫 줄(굵게, 말줄임) + 미확인 배지 / '{N분 전} · {성우} · 약 N크레딧' / 미확인이면 "늦게 도착하면 여기서 완료로 바뀌어요". 동작은 44px 아이콘 버튼(재생·내려받기·지우기, 툴팁 `RowAction`). 빈 상태 "아직 만든 음성이 없어요", 실패 '다시 불러오기'. 지우기 확인 "이 결과를 지울까요?" / "앱에 저장한 오디오만 지워요. 공급자 사용 기록은 그대로예요."
- **프리셋 메뉴(작업실):** 성우를 고르기 전에는 '지금 설정으로 새 프리셋 저장'·덮어쓰기가 꺼진다('스펙과 다른 점' 11). 이유 표시를 둘지, 불러온 뒤 알림을 "‘이름’ 설정을 불러왔어요."(T8 문구 그대로)로 둘지 "‘이름’ 프리셋을 불러왔어요."로 바꿀지.
- **문구 전부:** `STUDIO_TEXT` 초안(Task 5). 브리프가 이긴다. `-어요` 보이스, 이름 뒤 조사 없음.

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`prokit-dev-cycle` 5절)에 한 번 한다. 태스크 경계는 장부에 tree SHA로 적는다. 코디네이터가 T8의 `snap.sh`·`pkg.sh`·`testdb.env`와 같은 것을 `.superpowers/sdd/T09-studio-typecast-plan/tools/`에 둔다(이 계획은 내용을 만들지 않는다).
- 비밀값:
  - `apps/web/.env`와 `packages/db/.env`를 읽거나 출력하지 않는다.
  - 테스트 DB 주소는 `source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env`로만 넘기고 출력하지 않는다. 증거에는 "로컬 5433 `tts-pilot-app_test`"만 적는다.
- 공급자와 개발 서버:
  - 이 TASK에서 실제 공급자를 부르지 않는다. 테스트의 공급자는 가짜 `synthesize`(라우터 테스트)와 `fetchMock`(공급자 모듈 테스트)뿐이다.
  - 구현 서브에이전트는 개발 서버(`127.0.0.1:3001`)로 어떤 요청도 보내지 않는다(브라우저·curl·fetch·테스트 스크립트의 `/api/rpc/*` 모두). 서버를 끄거나 다시 켜지 않는다. `pkill`·`killall`·`.next` 삭제 금지. 직접 띄운 프로세스만 PID로 끈다.
  - `pnpm build`·DB 명령(`db:generate`·`db:migrate`, 테스트 DB의 `psql`)·`shadcn add`·런타임 확인은 코디네이터만 한다.
  - 실제 생성은 사용자 테스트(스펙 11절)에서 사용자가 승인한 뒤에만 한다.
- 로컬 관리자 모드(`AGENTS.md`):
  - 소유자는 `context.ownerId`에서만 얻고 입력으로 받지 않는다.
  - 모든 select·update·delete에 `owner_id = 소유자` 조건을 건다. 성우 검사도 소유자 조건으로 담은 성우를 찾는다. 영향받은 행이 없으면 `NOT_FOUND`다.
  - 프로시저 다섯 모두 `protectedProcedure`다. Server Action·새 Route Handler를 만들지 않는다. 페이지는 막지 않고 데이터는 `protectedProcedure`가 막는다.
- 화면별 기록:
  - 작업실은 `kind = 'studio'` 행만, 시험 생성(`trialFind`·`trialList`·`trialAudio`·`trialDelete`)은 `kind = 'trial'` 행만 본다.
  - 시험 생성의 조합 키는 T5 그대로다(저장된 결과가 이어진다).
  - 동시 1건(`trial_generation_one_pending`)은 두 화면을 합쳐 센다.
- 화면은 `@tts-pilot-app/api/providers/trial-options`·`classification-rules`(값)와 계약 파일(`*-contract.ts`)의 **타입만** 가져간다(`import type`). `apps/web`에 zod 의존이 없다.
- 로그:
  - 한 줄이다: `[studio] <단계> 실패: <오류 이름> <DB 코드>`(`guard`·`logDbFailure`), `[studio] typecast 생성 실패: <이름>`(`logFailure`).
  - 대본·성우 id·설정·SQL·오디오를 로그나 `ORPCError`의 `cause`·`data`에 넣지 않는다.
- 입력 상한:
  - 대본은 원문 8,000 UTF-16 단위, NFC·앞뒤 공백 정리 뒤 1~2,000 코드 포인트다.
  - 조각 번호는 정수 0~10이다(32MiB ÷ 3MiB). id는 uuid, 성우 id는 T5 `voiceIdSchema`, 설정은 T5 `typecastSettingsSchema`다.
- 오디오 상한·조각: 작업실 결과 32MiB(`STUDIO_AUDIO_MAX`), 조각 3MiB(`STUDIO_PART_BYTES`). T5 시험 생성 상한 4MiB는 그대로다.
- 캐시 키: `invalidateQueries`에는 `orpc.<프로시저>.key()`(접두)를 쓴다. 이번에는 `setQueryData`·`getQueryData`를 쓰지 않는다(`tasks/lessons.md` 2026-10-07).
- 입력 지연: 대본은 `ScriptProvider`의 작은 컨텍스트에만 둔다. 카드·이전 결과·성우 창은 대본을 읽지 않는다. 막대는 늦춘 대본(`useDeferredValue`)을 읽는다(`tasks/lessons.md` 2026-10-07 T7.5).
- 화면 규칙:
  - 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex·임의 값(`[…]`)을 새로 넣지 않는다. 굵기는 `font-normal`·`font-bold`뿐이다.
  - 인터랙티브 요소는 44px 이상이다(버튼 `size="lg"`·`size="icon-lg"`, 메뉴 항목 `min-h-11`, 토글 `min-h-11`). 입력 칸은 767px 이하에서 `text-base md:text-sm`이다. `focus-visible`이 보여야 한다. 오류·경고 문구 색은 `text-warning`이다.
  - 돈이 드는 동작에는 `Coins` 표식을 함께 둔다(DESIGN.md 598행). 가짜 진행률을 만들지 않는다. 한 번에 한 오디오만 재생한다(REQ-03).
- 화면 문구는 `STUDIO_TEXT`·`EMOTION_NOTE`(Task 5)와 브리프의 문구만 쓴다. 브리프가 이긴다.
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(탭 들여쓰기).
- 패키지:
  - 이름: 앱 `web`, API `@tts-pilot-app/api`, DB `@tts-pilot-app/db`, UI `@tts-pilot-app/ui`.
  - 테스트: API는 `pnpm --filter @tts-pilot-app/api test [파일]`, web은 `pnpm --filter web test [파일]`. 타입: `pnpm --filter <이름> check-types`.
  - DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다(`source …/testdb.env`). skipped는 통과가 아니다.
  - web vitest는 `@/` 별칭을 풀지 못한다(T7-11). `lib/*.ts`는 서로 상대 경로로 가져온다.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `shortcut:` 주석으로 남긴다.

## Review Focus

- **유료 호출 중복·우회:** 확인 창을 두 번 누르거나 같은 요청 id를 다시 보내 공급자가 두 번 불리는 경우. 캐스팅의 진행 중 시험 생성을 무시하고 작업실이 또 부르는 경우. 시간 초과 뒤 자동으로 다시 부르는 경우.
  - Task 4 "같은 요청 id 동시 두 번 → 공급자 1회", "진행 중인 내 문장(trial) 기록이 있으면 in_progress", "미확인된 같은 요청 id는 다시 부르지 않는다"
  - Task 7 `busyRef`(렌더를 기다리지 않고 막는다), T5 `TrialConfirm`의 `sentRef`
- **성우 검사 우회:** 클라이언트가 담지 않은 성우, 이용 불가 성우, 다른 소유자가 담은 성우, 다른 공급자로 담은 같은 id를 보내 유료 호출을 여는 경우.
  - Task 4 "담지 않은·이용 불가·다른 공급자로 담은 성우 → voice_unavailable, 공급자 0회, 기록 없음"
  - Task 4 격리 "B가 A만 담은 성우로 만들기 → 거절"
- **늦은 결과의 경합과 소유:** 늦은 오디오가 미확인 기록보다 먼저 와서 미확인 쓰기가 완료를 덮는 경우. 다른 소유자·지운 행·이미 완료된 행에 쓰는 경우. 사용 이력이 두 번 오르는 경우.
  - Task 3 `saveLate`(미확인 행만, 바뀐 행이 있을 때만 사용 이력)
  - Task 4 라우터가 미확인 기록 뒤에만 늦은 결과를 받는다. "뒤늦은 성공 → done, 사용 이력 1회", "뒤늦은 실패 → unknown 그대로"
- **조각 경계:** `substring`이 1부터 센다는 것을 놓쳐 바이트가 하나 밀리는 경우. 마지막 조각 길이, 범위 밖 조각. 조각 응답이 4.5MB를 넘는 경우.
  - Task 3 "3MiB + 5바이트 → 조각 둘을 이으면 원본", "범위 밖 NOT_FOUND"
  - Task 4 rpc-file "3MiB File 응답 본문 < 4.5MB"
  - Task 5 `fetchAudio` 순서
- **화면 분리:** 작업실 결과(최대 32MiB)가 캐스팅 결과 목록이나 `trialAudio`(한 번에 보냄)로 새는 경우. 내 문장 결과가 이전 결과에 섞이는 경우.
  - Task 3 "화면 분리" 테스트, Task 4 "trialList에는 나오지 않는다"
- **캐스팅 회귀:** `Options`·`TrialConfirm`·`PresetMenu`를 넓히며 캐스팅의 설정 바꾸기·확인 창 문구·프리셋 저장·불러오기·덮어쓰기가 바뀌는 경우.
  - Task 5 `confirmCopy("trial")`·`castingLoadView` 회귀 테스트(기존 `loadChanges`·`loadNotes`·`settingsOnly` 결과와 같다)
  - Task 6 코디네이터 런타임 확인(`/casting`, 유료 버튼은 확인 창 '취소'까지)
- **임시 작업 신뢰 경계:** 이 브라우저 저장소의 값(손으로 고친 값 포함)이 계약 밖 설정이나 담지 않은 성우로 요청을 만드는 경우.
  - Task 5 `readSetup`(깨진 값·범위 밖·v21 감정), `savedOf`(담은 Typecast 성우만)
  - 서버는 어차피 계약과 성우 검사로 거절한다(Task 2·4).
- **입력 지연:** 2,000자 대본을 칠 때 글자마다 카드·이전 결과·옵션이 다시 그려지는 경우.
  - Task 7 `ScriptProvider` 분리, Task 8 `ScriptField`만 대본을 읽음, QA S19 Event Timing

- **크레딧이 쓰였을 수 있는 실패의 문구:** 응답을 받지 못한 생성 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)나 생성 뒤 조각 받기 실패를 "만들지 못했어요, 다시 해 주세요"로 보여 사용자가 다시 눌러 두 번 과금되는 경우(계획 리뷰 E1).
  - Task 5 `createFailureOf`(사유 없음 → 미확인) 테스트, Task 7 생성·찾기·조각 받기의 실패 처리가 나뉜다(Step 3 자기 점검)
  - QA S20(가로챈 응답), 사용자 테스트 2

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다.

- `prokit-db`:
  - 스키마는 `trial-generation.ts`·`saved-voice.ts`를 고친다(새 표 없음).
  - 마이그레이션은 `pnpm --filter @tts-pilot-app/db db:generate`로 만들고 SQL을 읽는다(의도하지 않은 DROP·타입 축소 없음). 저장 방식은 금지 규칙의 예외 문장("`--custom`이 만든 빈 `migration.sql`에 SQL을 쓰는 것은 된다")대로 `--custom`으로 쓴다.
  - 로컬·테스트 DB에 `db:migrate`한 뒤 다시 generate해 "No schema changes"를 본다. Neon은 9행(`.neon` 확인).
  - 컬럼 추가만이고 이름 변경·삭제·타입 축소가 없어 파괴적 변경이 아니다(10행). `kind`는 기본값이 있는 not null이라 기존 행이 `trial`이 된다.
  - `docs/domain/project.md` 데이터 모델 표의 `용어` 칸을 고친다(Task 11).
- `supabase-postgres-best-practices`:
  - `schema-data-types`: `kind`는 enum 대신 text + check(T6~T8 관례). `use_count`는 integer, `last_used_at`은 timestamptz.
  - `query-partial-indexes`: 작업실 목록 인덱스 `(owner_id, created_at desc) where kind = 'studio'`. 쿼리는 인덱스와 같은 조건 글자(`kind = 'studio'`, 매개변수 아님)로 쓴다.
  - `schema-constraints`: check는 drizzle-kit이 만든 마이그레이션으로만 더한다.
  - `lock-short-transactions`: 공급자 호출을 트랜잭션 안에 두지 않는다(T5 그대로, 이번에 트랜잭션 없음).
- `prokit-api`:
  - 불변식 1·2: 프로시저 다섯 모두 `protectedProcedure`, 소유자는 `context.ownerId`만(로컬 관리자 규칙으로 읽는다).
  - 불변식 3: 조각·지우기·찾기·목록·성우 검사에 `owner_id`, 없으면 `NOT_FOUND`.
  - 불변식 4: 입력 zod(대본 길이, uuid, 조각 번호), 출력 zod(오디오는 `z.file()`, 결과에 오디오 없음).
  - 불변식 7: 서버 성우 검사는 권한 판정이다. `packages/api/src/providers/`(Task 3)도 `authPaths`다. security 리뷰가 필수다(대조표 37행, 코디네이터가 더했다).
  - 격리 테스트는 같은 작업(Task 4 `studio.isolation.test.ts`, `references/ownership-test.md`의 세 경우).
- `prokit-web`:
  - `apps/web/AGENTS.md`를 읽었다. 번들 문서 `01-app/03-api-reference/03-file-conventions/page.md`(페이지는 기본 Server Component, `metadata`), `01-app/01-getting-started/05-server-and-client-components.md`(클라이언트 경계는 가장 작은 컴포넌트).
  - 조회는 `useQuery(orpc.studioList.queryOptions(OWNED_LIST))`·`useSavedList()`·`usePresetList()`, 변경은 `useMutation` 뒤 `.key()` 무효화. 저장된 결과 찾기와 조각 받기는 T5처럼 `client.studioFind`·`client.studioAudio`를 직접 부른다(사용자 동작 하나의 연속 호출).
  - loading·empty·error·비인가(`LoopbackNotice`)를 나눈다. 페이지는 Server Component이고 클라이언트 경계는 `StudioEditor`부터다. 주소 쿼리를 쓰지 않아 `Suspense`가 필요 없다.
- `vercel-react-best-practices`:
  - `rerender-derived-state-no-effect`: 고른 성우(`savedOf`), 막는 이유, 저장된 결과 여부, 감정 표식, 채널 표시는 렌더 중 계산이다.
  - `rerender-move-effect-to-event`: 대본 저장은 입력 처리기에서 한다. 생성·열기·내려받기·불러오기도 이벤트 처리기에서 한다. 효과로 남는 것은 저장소 읽기(첫 그리기 뒤), 설정 저장, 오디오 요소 동기화(재생·멈춤)뿐이다.
  - `rerender-defer-reads`·T7.5 교훈: 대본은 작은 컨텍스트, 막대는 `useDeferredValue`.
  - `client-localstorage-schema`: 키에 판(`v1`), 필요한 칸만, 읽기·쓰기 모두 try/catch.
  - `rendering-hydration-no-flicker`: 스크립트 주입은 쓰지 않는다. 대본 2,000자를 React 상태에 넣어야 해서다. 읽기 전에는 카드 자리에 뼈대를 둔다('스펙과 다른 점' 14).
  - `js-hoist-regexp`: 파일 이름 정리의 정규식은 모듈 위에 둔다.
- `vercel-composition-patterns`:
  - `state-context-interface`: 같은 프리셋 메뉴가 두 상태 구현(캐스팅·작업실)을 받도록 인터페이스 `PresetHost`를 둔다. 단순 재사용이라 Provider를 하나 더 만들지 않고 props로 넘긴다(reuse-design "단순 재사용에 Provider를 추가하지 않는다").
  - `architecture-avoid-boolean-props`·`patterns-explicit-variants`: 확인 창은 boolean 대신 `kind: "trial" | "studio"` 값 하나다.
- `prokit-ui`(+ impeccable `reference/craft-floor.md`): 17행 `impeccable context`, 18행 `shape` 브리프 확정이 Task 8 전이다. UI 태스크(8·9) 편집 직전에 craft-floor를 읽는다(상태: hover·disabled·loading·error·empty, 키보드 포커스). 리뷰(critique·audit)는 메인 세션에서 한다.
- `shadcn`: 새 프리미티브는 없다. `Textarea`·`Dialog`·`ToggleGroup`·`Toggle`·`Badge`·`Skeleton`·`AlertDialog`(T5 확인 창)는 `packages/ui`에 있다.
- `tts-provider`:
  - 유료 호출은 `protectedProcedure`, 요청 id 선점, 동시 1건(선점 insert), 자동 재시도 없음.
  - 응답 상태를 받지 못한 실패는 '처리 여부 미확인'이다. 429 대기 시각은 DB(`provider_cooldown`)에 둔다. 공급자 오류 매핑은 T5 `runTrial` 그대로다.
  - 오디오는 base64가 아니라 oRPC `File`(multipart)이다. 내려받기는 받은 결과를 쓰고, 진행률은 지난 시간만 보인다. 한 번에 한 오디오만 재생한다. blob 주소는 바꿀 때·떠날 때 해제한다.
  - 테스트·QA에서 실제 호출이 없다.
  - voice id는 서버가 다시 찾는다. 단일 소유 예외에서 공급자 거절에 맡기던 T5와 달리, 작업실은 소유자의 담은 성우로 좁힌다(T8 보안 메모).
- `domain-modeling`: 새 용어는 스펙 단계에서 `GLOSSARY.md`에 들어갔다(음성 생성·감정 팔레트·생성 기록·사용 이력 보완). ADR 0006은 `ADR-FORMAT.md`로 쓴다(Task 11).

## 설치본·문서로 확인한 것

| # | 대상 | 확인 결과 | 위치 |
|---|---|---|---|
| 1 | oRPC 1.15.4 출력 `File` 직렬화 | RPC 직렬화기는 출력 안의 Blob을 모아 `FormData`(multipart)로 보낸다. 출력 전체가 `File` 하나여도 같다. 3MiB(3,145,728바이트) `File`의 응답 본문은 3,146,005바이트(머리 277바이트)였고, 링크가 같은 바이트·이름·형식의 `File`로 돌려줬다 | `@orpc/client` `dist/shared/client.BrcgsQH9.mjs` `StandardRPCSerializer#serialize`(388~402행), `@orpc/standard-server-fetch` `toFetchBody`. 2026-10-20 scratchpad 메모리 안 측정(핸들러 ↔ 링크, 서버 없음) |
| 2 | 배포 응답 상한 | 4.5MB(스펙 2절, Vercel 공식 문서). 조각 응답 3,146,005바이트는 그 안이다. Task 4가 테스트로 고정한다 | 스펙 2절 '오디오 전달' |
| 3 | Typecast SDK 취소 | `textToSpeech`가 `fetch`에 `signal`을 넘기지 않는다. 설치본 패치는 `redirect: "error"`만 더한다. 취소할 수 없어 시간 초과 뒤에도 요청은 끝까지 돈다. 늦은 결과는 `runTrial`이 경주시킨 `call(signal)`의 약속을 그대로 받으면 된다 | `@neosapience/typecast-js` 0.4.15 `lib/index.js` 5~7행(`fetch` 감싸개), 458~466행(`textToSpeech`) |
| 4 | Node fetch 시간 제한 | Node 24.22.0의 undici 7.29.1이다. 응답 머리 대기 기본 300초(`headersTimeout`), 본문 사이 300초(`bodyTimeout`)다. 요청 300초 뒤의 결과는 받지 못한다('스펙과 다른 점' 5) | `node -e process.versions`, `undici-types` 8.9.0 `client.d.ts` 36·44행 |
| 5 | `runTrial`·`withTimeout` | `withTimeout`이 `call(controller.signal)`을 시간 제한과 경주시키고, 끊긴 약속은 그대로 돈다. 경주가 약속에 처리기를 달아 두므로 늦은 거절이 처리 안 된 거절이 되지 않는다. `TRIAL_TIMEOUT_MS` 60초 | `packages/api/src/providers/errors.ts:194-213,379,413-433` |
| 6 | Postgres 저장 방식 | 로컬은 `postgres:18`이다. Postgres 18 문서: "`EXTERNAL` is for external, uncompressed data … Use of `EXTERNAL` will make substring operations on very large `text` and `bytea` values run faster", `SET STORAGE`는 이후 쓰는 값부터 적용. `default_toast_compression` 기본은 `pglz`. 압축된 값은 조각을 읽을 때 앞부분부터 풀어야 하고, QA의 무음 MP3처럼 잘 압축되는 값은 실제로 압축된다. 그래서 `EXTERNAL`로 둔다. `EXTERNAL`은 압축 없이 TOAST 표에(본 행 밖) 둔다. 적용은 `pg_attribute.attstorage = 'e'`로, 무압축은 0바이트 값의 `pg_column_compression` null로 본다(무작위 바이트는 원래 압축되지 않아 증명이 안 된다, 계획 리뷰 E2·E10) | `packages/db/docker-compose.yml`, postgresql.org/docs/18 `sql-altertable.html`·`runtime-config-client.html`(2026-10-20 확인) |
| 7 | drizzle 저장 방식 API | drizzle-orm 1.0.0-rc.4 `pg-core`에 컬럼 저장 방식이 없다(`SET STORAGE`·`.storage(` 없음). drizzle-kit `generate`에 `--custom`("Prepare empty migration file for custom SQL")과 `--name`이 있다 | `node_modules/.pnpm/drizzle-orm@1.0.0-rc.4…/pg-core`(grep 0건), `packages/db/node_modules/drizzle-kit/bin.cjs` 176020·176329행 |
| 8 | drizzle `returning`에 SQL 칸 | `update().returning(fields: SelectedFields)`가 `sql` 칸을 받는다. 조각 0번은 만료 연장과 조각 읽기를 한 문장으로 한다 | `drizzle-orm/pg-core/query-builders/update.d.ts:23-24,65` |
| 9 | T5 생성 기록 함수 | `comboKey`(T5 판 1, `cacheKey({ v, sig })`), `replayRequest`, `claim`(5분 넘은 진행 중 → 미확인, `onConflictDoNothing`), `replay`, `complete`(상태 조건 없음), `settle`, `sweep`, `findSaved` → `audioOf`(만료 연장), `listResults`(공급자·성우), `remove`(진행 중 아님), `withStorage`, `KEEP_MS` 30일, `STALE_PENDING_MS` 5분 | `packages/api/src/trial.ts:28-351` |
| 10 | T5 생성 순서 | 키 없음 → 같은 요청 id 재생 → 대기 시각 → (ElevenLabs 배율) → 추정 → 선점 → 합성 → 상한 검사 → 실패 기록·대기 기록 / 완료 기록(실패해도 오디오 반환)·정리. `MAX_AUDIO_BYTES` 4MiB | `packages/api/src/routers/trial.ts:73-195` |
| 11 | 실패 사유와 코드 | `trialFailureSchema`(공급자 사유 + `provider_input`·`in_progress`·`free_ended`·`request_mismatch`·`storage`), `TRIAL_CODE`가 `satisfies Record<TrialFailure, string>`이라 사유를 더하면 코드도 더해야 타입 검사가 통과한다 | `providers/trial-contract.ts:176-190`, `providers/errors.ts:359-366` |
| 12 | 문장 스키마 | `textSchema`가 모듈 안 상수(200자, 원문 800)다. 작업실용으로 상한만 바꾼 같은 스키마가 필요하다 | `providers/trial-contract.ts:90-100` |
| 13 | 공급자 클라이언트 | `ProviderClient.synthesize?(request)`. Typecast 구현은 `runTrial("typecast", …)`이고 SDK 오류는 `toHttpError` | `providers/errors.ts:109-127`, `providers/typecast.ts:96-129` |
| 14 | 보관함 목록 | `listOf`가 `saved_voice` 행을 `SavedVoice`로 바꾼다. 출력 스키마 `savedVoiceSchema`. 웹에서 이 타입으로 객체를 만드는 곳은 테스트 고정값 하나(`saved-voices.test.ts`)다 | `routers/saved-voice.ts:62-102`, `saved-voice-contract.ts:56-66`, `apps/web/src/components/saved-voices.test.ts:21-30` |
| 15 | 프리셋 목록 | `Preset`에 `voice`(담은 성우, 빠졌으면 null)·`unavailable`·`channelId`·`channelDefault`·`settings`·`fixed` | `preset-contract.ts:79-93` |
| 16 | 캐스팅 상태에 묶인 곳 | `PresetMenu`·`LoadDialog`·`OverwriteDetail`·`PresetLine`이 `useTrial()`로 `settings`·`loaded`·`loadPreset`을 읽는다. `Options`는 `useTrial().setSetting`만 쓴다. `TrialConfirm`은 `pending`·콜백만 받아 묶이지 않았지만 제목·버튼·'문장' 줄이 T5 문구다. `trial-section.tsx`가 `voice-casting.tsx`에서 `sourceItem`을 가져온다 | `preset-menu.tsx:81,165,199,421`, `trial-section.tsx:53,205-206`, `trial-confirm.tsx:66-259` |
| 17 | 확인 창 의존 | `TrialConfirm`은 `useSample`(→ `SamplePlayerProvider` 필요)과 `providerStatus` 조회를 쓴다 | `trial-confirm.tsx:111-125` |
| 18 | 고르기 메뉴 | `RadioMenu({ label, value, options, onChange, disabled, align, separator, strong, className })`. 선택지 아래 항목 자리가 없다 | `voice-conditions.tsx:268-333` |
| 19 | 페이지 머리 | `PageHeader({ title, description })`, 오른쪽 자리가 없다 | `components/page-header.tsx` |
| 20 | 1차 버튼 hover | `default: "bg-primary … hover:bg-primary/80"`. CSS 토큰에 brand-600·brand-300이 없다. 값은 `DESIGN.md` 앞머리 brand-600 `oklch(0.46 0.076 201)`, brand-300 `oklch(0.84 0.09 198)` | `packages/ui/src/components/button.tsx:10`, `packages/ui/src/styles/globals.css:9-30,60-103`, `DESIGN.md:8,11,183-184,564` |
| 21 | 화면 부품 | `Textarea`(`field-sizing-content`), `ToggleGroup`·`Toggle`(`data-pressed`), `Dialog`·`DialogTrigger`, `RowAction`·`boxClass`(export), `ConfirmDialog`, `SampleButton`, `useSample`·`usePlayer`, `useCooldown`·`lockedButton`, `LoopbackNotice`, `failureOf`, `saveFailure`·`MESSAGES`, `useSavedList`, `usePresetList`, `metaLine`, `sampleKindOf`, `resultWhen`, `usageText` | `packages/ui/src/components/*`, `apps/web/src/components/class-group.tsx:47,90`, `confirm-dialog.tsx`, `voice-row.tsx:57`, `sample-player.tsx:136-148`, `voice-problem.tsx:33,51`, `notice.tsx:50`, `lib/voice-failure.ts:23`, `lib/classes-view.ts:74,92`, `saved-voices.tsx:31`, `presets.tsx:8` |
| 22 | 오디오 요소 lint | Biome `a11y/useMediaCaption`은 `<audio>`에 자막 트랙을 요구한다. 이 저장소는 이유를 단 `biome-ignore`를 쓴다 | `apps/web/src/components/sample-player.tsx:109` |
| 23 | 테스트 틀 | DB 테스트는 `describe.skipIf(!url)`, 파일마다 `db.$client.end()`, 파일끼리 차례로(`fileParallelism: false`). 라우터 테스트는 `createRouterClient(appRouter, { context: { db, ownerId, providers } })`와 던지는 DB Proxy. DB를 쓰지 않는 테스트(소유자 없음, 던지는 DB)는 `skipIf` 밖에 둬야 늘 돈다(계획 리뷰 E4) | `packages/api/src/test-db.ts`, `vitest.config.ts`, `routers/trial.test.ts:39-81` |
| 24 | Typecast 문서(llms.txt) | 메인이 2026-10-20에 다시 확인했다. TTS `text`는 "1 to 2000 characters"이고 단위(코드 포인트/UTF-16) 기재가 없다. 처리 시간·시간 제한 안내가 없다. 응답은 바이너리 오디오(MP3 320kbps 44.1kHz). 변경 이력에서 2026-10-05 뒤는 9/15·9/17 `remove_silence_ms`뿐이다(research에 이미 있음). 상한은 T5처럼 코드 포인트로 센다(예상 사용량과 같은 단위). **위험:** Typecast가 UTF-16으로 센다면 이모지·보조 평면 글자가 많은 2,000자 대본이 400으로 거절되고 입력 거절(`provider_input`, 과금 없음 추정) 문구로 보인다. 사용자 테스트에서 보이면 화면 상한을 UTF-16으로 바꾼다 | typecast.ai/docs/llms.txt, 변경 이력(코디네이터 결정 C1) |
| 25 | 계획 코드 실행(eng 리뷰) | 버리는 worktree에서 Task 1~10 코드를 그대로 넣어 타입 검사·테스트·빌드가 통과했다(DB 테스트는 skipped). `pnpm --filter @tts-pilot-app/db db:generate --custom --name …`이 인자를 넘기고, 생성 SQL은 Step 4 다섯 문장 그대로이며 check는 `ADD CONSTRAINT`다 | `review-plan-eng.md` '태스크별 실행 결과' |
| 26 | DB 질의 시간 제한 | `createDb`가 `query_timeout: 3000`이다. node-postgres는 질의 하나에 `query_timeout`을 따로 줄 수 있다(`client.query({ text, values, query_timeout })`). 32MiB 쓰기가 느리면 오디오 쓰기 질의만 늘리는 길이다(Task 1 Step 7 판정) | `packages/db/src/index.ts:13`, `pg` 8.23.0 `lib/client.js:702` |
| 27 | TanStack 다시 받기 간격 | `refetchInterval`이 함수 `(query) => number \| false \| undefined`를 받는다. 미확인 줄이 있을 때만 다시 받는 데 쓴다 | `@tanstack/query-core` 5.103.2 `build/modern/hydration-*.d.ts:2032` |
| 28 | 같은 조합 새 요청 id | `studioCreate`는 같은 요청 id만 재생하고 조합으로는 재사용하지 않는다(조합 재사용은 화면의 `studioFind`). 그래서 새 요청 id면 같은 조합도 다시 합성한다(유료). 디자인 DN-6의 '새로 만들기'는 서버 변경 없이 된다(Task 4 테스트로 고정) | Task 4 `studioCreate`, T5 `claim`(조합 유니크 없음) |

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `packages/db/src/schema/trial-generation.ts`, `saved-voice.ts`, `migrations/<생성>/`, `migrations/<시각>_studio_audio_storage/` | 칸·인덱스·check, 저장 방식 | 1 |
| `packages/api/src/providers/trial-options.ts` | 작업실 값 상수와 `partsOf` | 2 |
| `packages/api/src/providers/trial-contract.ts` | `textSchemaOf`, 사유 `voice_unavailable` | 2 |
| `packages/api/src/providers/errors.ts` | `TRIAL_CODE.voice_unavailable`(2), `SynthesizeOptions`·`STUDIO_TIMEOUT_MS`·`runTrial` 옵션(3) | 2·3 |
| `packages/api/src/studio-contract.ts`, `.test.ts` | 작업실 입력·출력 zod | 2 |
| `packages/api/src/providers/typecast.ts`, `typecast.test.ts`, `errors.test.ts` | 기다림·늦은 결과 넘기기 | 3 |
| `packages/api/src/trial.ts`, `trial-studio.test.ts` | `kind`, 작업실 찾기·목록·조각, 사용 이력, 늦은 결과 저장 | 3 |
| `packages/api/src/routers/studio.ts`, `routers/index.ts` | 프로시저 다섯 | 4 |
| `packages/api/src/saved-voice-contract.ts`, `routers/saved-voice.ts` | 보관함 출력 두 칸 | 4 |
| `packages/api/src/routers/studio.test.ts`, `studio.isolation.test.ts`, `rpc-file.test.ts` | 테스트 | 4 |
| `apps/web/src/components/saved-voices.test.ts` | 고정값 두 칸(타입) | 4 |
| `apps/web/src/lib/studio-view.ts`, `.test.ts` | 작업실 문구와 순수 함수 | 5 |
| `apps/web/src/lib/trial-view.ts`, `.test.ts` | `confirmCopy` | 5 |
| `apps/web/src/lib/preset-view.ts`, `.test.ts` | `LoadView`, `fixedNote`, `castingLoadView` | 5 |
| `apps/web/src/components/setting-fields.tsx`(새) | `Options`(+ `onChange`·`palette`), `sourceItem` | 6 |
| `apps/web/src/components/trial-section.tsx`, `voice-casting.tsx` | 옮긴 것 가져오기, 캐스팅 `PresetHost` | 6 |
| `apps/web/src/components/trial-confirm.tsx` | `kind` | 6 |
| `apps/web/src/components/preset-menu.tsx` | `PresetHost`, `usePresetLoad`, `LoadDialog` export | 6 |
| `apps/web/src/components/voice-conditions.tsx`, `page-header.tsx` | `RadioMenu` `footer`, `PageHeader` `actions` | 6 |
| `apps/web/src/components/library-filters.tsx` | 주석 한 줄(`sourceItem`이 옮겨 간 곳) | 6 |
| `apps/web/src/components/studio-provider.tsx`(새) | 작업실 상태·데이터 흐름 | 7 |
| `apps/web/src/components/studio-card.tsx`, `studio-voice-dialog.tsx`(새) | 문단 카드·감정 팔레트·대본 칸, 성우 고르기 창 | 8 |
| `apps/web/src/components/studio-bar.tsx`, `studio-results.tsx`, `studio-editor.tsx`(새), `apps/web/src/app/(app)/studio/page.tsx` | 하단 막대, 이전 결과, 머리·채널, 페이지 | 9 |
| `packages/ui/src/styles/globals.css`, `packages/ui/src/components/button.tsx`, `DESIGN.md` | 1차 버튼 hover | 10 |
| 문서 | `docs/domain/project.md`, `docs/adr/0006-…`, 로드맵, `docs/research/typecast-api-options.md`(재확인 날짜), 스펙 10절 S20, `docs/briefs/site-map.md` 확인, `GLOSSARY.md` 확인, `tasks/todo.md` 백로그 | 11 |

## 대조표 행과 태스크

| 행 | 태스크 |
|---|---|
| 2 구현 계획 | 이 문서 |
| 3 [design] | '설치본·문서로 확인한 것'·'파일 구조'·'스펙과 다른 점' 7~9. 기존: `Options`·`TrialConfirm`·`PresetMenu`·`RadioMenu`·`PageHeader`·T5 생성 기록 함수와 그 소비자. 결정: 작은 확장(prop·인터페이스)과 한 파일 이동. 설정: 환경 변수 변경 없음(`apps/web/.env.schema` 그대로, Typecast 키는 T2부터 있음). 검증: Task 5 회귀 테스트 + Task 6 캐스팅 런타임 확인 |
| 4 계획 리뷰 | 이 계획 + 스펙 + 위 파일 목록 |
| 5 구현 방식 | 실행 방식 선택 뒤 장부 시작(subagent-driven-development, 태스크마다 `prokit-implementer` 구현과 태스크 리뷰). 위임 프롬프트에 `tts-provider`를 읽을 스킬로 지정한다(Task 3·4·7·9) |
| 6 스키마·dbGenerate | Task 1 |
| 7 타입·린트, 8 로컬 migrate, 9 Neon(`.neon` 없음 확인 뒤 N/A 또는 임시 브랜치), 10 파괴적 변경(없음: 칸 추가뿐, 저장 방식은 이후 값만), 11 prokit-reviewer(db) | Task 1 뒤 코디네이터 |
| 12 zod 계약 | Task 2 |
| 13 구현, 14 격리, 15 타입·린트·테스트 | Task 2~4 |
| 16 prokit-reviewer(code) | Task 4 뒤 |
| 37 prokit-reviewer(security) | 코디네이터가 `prokit-dev-cycle` 규칙대로 더한 행(`providers/`가 `authPaths`, 성우 검사는 권한 판정). Task 4 뒤에 한 번, 전체 diff로 29행과 함께 한 번. focus: 유료 호출을 여는 주체(호출마다 소유자 검사), 공급자 키 노출, voice id 소유(담은 성우 검사), 유료 호출 중복·자동 재시도·늦은 결과, 입력 길이·조각 번호, 로그 누출 |
| 17 impeccable context, 18 shape 브리프 | Task 6 뒤, Task 8 전 메인 세션(사용자 확인) |
| 19 UI 구현 | Task 5~10 |
| 20~31 검증·리뷰·QA | 구현 뒤. 30행 QA에 S20(CDP 가로채기, '스펙과 다른 점' 15) |
| 36 문서 영향 | Task 11 |
| 38 [confirm] | 스펙 11절 절차와 "이번에 없는 것" |

Task 5~7은 상태와 데이터 흐름이라 브리프 전에 할 수 있다(문구는 초안). Task 8·9는 18행 브리프를 사용자가 확인한 뒤 시작하고, 첫 단계에서 브리프 문구를 `STUDIO_TEXT`·`EMOTION_NOTE`에 반영한다. Task 10은 언제든 된다.

---
### Task 1: 작업실 칸과 오디오 저장 방식 (DB 명령은 코디네이터)

**Files:**
- Modify: `packages/db/src/schema/trial-generation.ts`
- Modify: `packages/db/src/schema/saved-voice.ts`
- Create(생성물): `packages/db/src/migrations/<시각>_<이름>/`(스키마 변경), `packages/db/src/migrations/<시각>_studio_audio_storage/`(`--custom`)

**Interfaces:**
- Produces:
  - `trialGeneration.kind: "trial" | "studio"`(not null, 기본 `trial`), 인덱스 `trial_generation_studio`, check `trial_generation_kind`
  - `savedVoice.lastUsedAt: Date | null`, `savedVoice.useCount: number`(not null, 기본 0)
  - `trial_generation.audio` 저장 방식 `EXTERNAL`(이후 쓰는 값)

- [ ] **Step 1: `trial-generation.ts`에 칸·인덱스·check를 더한다**

머리 주석의 첫 줄을 바꾼다.

```ts
// 생성 기록(GLOSSARY): 시험 생성(T5, kind 'trial')과 음성 생성(T9, kind 'studio')의 요청 id를 공급자 호출 전에 선점하고,
// 완료되면 오디오(MP3, Gemini는 WAV, audio_type)를 담아 30일 보관한다. 작업실 오디오는 32MiB까지이고 조각으로 읽는다(저장 방식 EXTERNAL, 마이그레이션 studio_audio_storage).
```

`ownerId` 칸 바로 아래에 더한다.

```ts
		// 어느 화면의 기록인가(T9 스펙 3절). 'trial' 내 문장 듣기, 'studio' 음성 작업실.
		// 조합 키에도 들어가(packages/api/src/trial.ts comboKey) 재사용·결과 목록이 화면별로 나뉜다. 동시 1건은 두 화면을 합쳐 센다
		kind: text("kind").$type<"trial" | "studio">().default("trial").notNull(),
```

표 옵션 배열의 `trial_generation_voice` 인덱스 바로 뒤에 인덱스를, `trial_generation_status` check 바로 뒤에 check를 더한다.

```ts
		// 작업실 이전 결과(소유자, 최신순). 작업실 행만 담는다(query-partial-indexes).
		// trial.ts listStudio가 같은 조건 글자(kind = 'studio', 매개변수 아님)로 찾는다
		index("trial_generation_studio")
			.on(t.ownerId, t.createdAt.desc())
			.where(sql`${t.kind} = 'studio'`),
```

```ts
		check("trial_generation_kind", sql`${t.kind} in ('trial', 'studio')`),
```

- [ ] **Step 2: `saved-voice.ts`에 사용 이력 두 칸을 더한다**

import에 `integer`를 더한다(알파벳 순서: `boolean, check, index, integer, jsonb, …`). `savedAt` 칸 바로 아래에 더한다.

```ts
		// 사용 이력(GLOSSARY): 작업실 생성이 성공한(늦은 성공 포함) 최근 시각과 횟수(T9 스펙 3절).
		// 시험 생성·저장된 결과 열기·샘플은 세지 않는다(packages/api/src/trial.ts recordUse)
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		useCount: integer("use_count").default(0).notNull(),
```

- [ ] **Step 3: 타입 검사 (구현자)**

Run: `pnpm exec biome check --write packages/db/src/schema/trial-generation.ts packages/db/src/schema/saved-voice.ts && pnpm --filter @tts-pilot-app/db check-types && pnpm --filter @tts-pilot-app/api check-types`
Expected: exit 0(칸 추가라 api는 그대로 통과한다. `claim`은 `kind`를 넣지 않아도 기본값이다)

- [ ] **Step 4: 스키마 마이그레이션 생성과 검토 (코디네이터)**

```bash
pnpm --filter @tts-pilot-app/db db:generate
```

생성된 `migration.sql`을 읽고 확인한다:
- `ALTER TABLE "saved_voice" ADD COLUMN "last_used_at" timestamp with time zone;`
- `ALTER TABLE "saved_voice" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;`
- `ALTER TABLE "trial_generation" ADD COLUMN "kind" text DEFAULT 'trial' NOT NULL;`
- `CREATE INDEX "trial_generation_studio" ON "trial_generation" ("owner_id","created_at" DESC NULLS LAST) WHERE "kind" = 'studio';`
- `ALTER TABLE "trial_generation" ADD CONSTRAINT "trial_generation_kind" CHECK ("kind" in ('trial', 'studio'));`
- 다른 DROP·ALTER TYPE이 없다.

- [ ] **Step 5: 저장 방식 마이그레이션 (코디네이터)**

```bash
pnpm --filter @tts-pilot-app/db db:generate --custom --name studio_audio_storage
```

만들어진 빈 `migration.sql`에 아래를 쓴다(이 파일만 손으로 쓴다. `snapshot.json`은 고치지 않는다).

```sql
-- 작업실 오디오(최대 32MiB)를 3MiB 조각으로 읽는다(T9 스펙 2절 A안). 압축하면 뒤 조각을 읽을 때 앞부분부터 풀어야 하므로
-- 압축 없이 TOAST 표에(본 행 밖) 둔다(Postgres 문서: EXTERNAL은 큰 bytea의 substring을 빠르게 한다). 이후 쓰는 값부터 적용된다
ALTER TABLE "trial_generation" ALTER COLUMN "audio" SET STORAGE EXTERNAL;
```

eng 리뷰 worktree에서 이 명령이 인자를 넘겨 빈 폴더를 만드는 것을 확인했다('설치본·문서로 확인한 것' 25).

- [ ] **Step 6: 적용 (코디네이터)**

```bash
pnpm --filter @tts-pilot-app/db db:migrate
source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env && DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @tts-pilot-app/db db:migrate
pnpm --filter @tts-pilot-app/db db:generate   # "No schema changes" 확인
```

Expected: 두 DB 모두 두 마이그레이션 적용 성공. 다시 generate는 변경 없음(저장 방식은 스냅숏에 없으므로 차이로 잡히지 않는다). 출력에는 호스트·DB 이름만 적는다.

- [ ] **Step 7: 오디오 쓰기·읽기 시간 재기와 저장 방식 확인 (코디네이터, 테스트 DB만)**

앱의 DB 연결은 질의마다 3초 제한(`query_timeout: 3000`)이다. 32MiB 쓰기(`complete`·늦은 결과)와 조각 읽기가 그 안에 넉넉히 끝나는지 앱과 같은 드라이버(node-postgres)로 잰다(계획 리뷰 P3·E2). 코디네이터가 아래 스크립트를 `.superpowers/sdd/T09-studio-typecast-plan/tools/measure-audio.mjs`로 두고 실행한다. 주소는 출력하지 않는다.

```js
// .superpowers/sdd/T09-studio-typecast-plan/tools/measure-audio.mjs
// 사용: source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env && node .superpowers/sdd/T09-studio-typecast-plan/tools/measure-audio.mjs
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(
	new URL("../../../../packages/db/package.json", import.meta.url),
);
const { Client } = require("pg");
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("TEST_DATABASE_URL(_test)이 있어야 한다");
// 시간을 끝까지 재려고 이 연결만 제한을 넉넉히 둔다(앱은 3초)
const client = new Client({ connectionString: url, query_timeout: 60_000 });
await client.connect();
const PART = 3 * 1024 * 1024;
const ms = async (label, run) => {
	const started = performance.now();
	await run();
	console.log(`${label}: ${Math.round(performance.now() - started)}ms`);
};
const storage = await client.query(
	"select attstorage from pg_attribute where attrelid = 'trial_generation'::regclass and attname = 'audio'",
);
console.log(`attstorage: ${storage.rows[0]?.attstorage}`); // e = EXTERNAL
const owner = `measure-t9-${Date.now()}`;
for (const mib of [16, 32]) {
	const audio = randomBytes(mib * 1024 * 1024);
	const inserted = await client.query(
		`insert into trial_generation (owner_id, request_id, combo_key, provider, voice_id, model, settings, text, usage_amount, usage_unit, status, expires_at, kind)
		 values ($1, gen_random_uuid(), 'measure', 'typecast', 'tc_measure', 'ssfm-v30', '{}'::jsonb, 'x', 1, 'credit', 'pending', now() + interval '1 day', 'studio')
		 returning id`,
		[owner],
	);
	const id = inserted.rows[0].id;
	// trial.ts complete와 같은 문장 모양(Buffer 매개변수)
	await ms(`${mib}MiB 완료 쓰기`, () =>
		client.query(
			"update trial_generation set status = 'done', audio = $1, audio_type = 'audio/mpeg' where id = $2",
			[audio, id],
		),
	);
	await ms(`${mib}MiB 길이만(octet_length)`, () =>
		client.query("select octet_length(audio) from trial_generation where id = $1", [id]),
	);
	await ms(`${mib}MiB 조각 전부(3MiB씩 차례로)`, async () => {
		for (let start = 0; start < audio.length; start += PART)
			await client.query(
				"select substring(audio from $1::int for $2::int) from trial_generation where id = $3",
				[start + 1, PART, id],
			);
	});
	await ms(`${mib}MiB 마지막 조각`, () =>
		client.query(
			"select substring(audio from $1::int for $2::int) from trial_generation where id = $3",
			[Math.floor((audio.length - 1) / PART) * PART + 1, PART, id],
		),
	);
}
await client.query("delete from trial_generation where owner_id = $1", [owner]);
await client.end();
```

Expected: `attstorage: e`. 시간 여덟 줄을 장부와 6행 증거에 적는다. 무작위 바이트는 원래 압축되지 않으므로 이 측정은 무압축을 증명하지 않는다. 무압축은 Task 4의 0바이트 1MiB 테스트가 맡는다.

판정 규칙(코디네이터 결정 C6):
- 32MiB 완료 쓰기와 조각 하나가 모두 1초 미만이면 그대로 둔다. T15 메모(배포 환경의 Neon 시간)만 남긴다.
- 32MiB 완료 쓰기가 1초 이상이면 먼저 상한 축소를 고른다. `STUDIO_AUDIO_MAX`를 1초 안에 쓴 크기(예: 16MiB)로 줄이고 스펙 3절을 고친다. 2,000자 추정이 12~16MB라 사용자 테스트 7번으로 다시 본다.
- 상한을 줄일 수 없어 질의별 제한(`query_timeout: 30_000`, '설치본·문서로 확인한 것' 26)이 필요하면, drizzle 빌더는 질의별 제한을 넘기지 못해 `complete`·`completeLate`의 오디오 쓰기가 raw `db.$client.query`로 바뀐다. 그 전에 계획 리뷰로 되돌린다(계획 재리뷰 R2).
- 조각 하나가 1초 이상이면 계획 리뷰로 돌아간다(저장 방식이 적용되지 않았거나 조각 크기를 줄여야 한다).

---

### Task 2: 작업실 계약 (`studio-contract.ts`)

**Files:**
- Modify: `packages/api/src/providers/trial-options.ts`(작업실 값 상수)
- Modify: `packages/api/src/providers/trial-contract.ts:88-100,175-184`(`textSchemaOf`, 사유 `voice_unavailable`)
- Modify: `packages/api/src/providers/errors.ts:359-366`(`TRIAL_CODE.voice_unavailable`)
- Create: `packages/api/src/studio-contract.ts`
- Test: `packages/api/src/studio-contract.test.ts`

**Interfaces:**
- Produces(값, zod 없음, 화면도 쓴다): `STUDIO_TEXT_MAX = 2000`, `STUDIO_RESULTS_SHOWN = 20`, `STUDIO_PART_BYTES = 3 * 1024 * 1024`, `STUDIO_AUDIO_MAX = 32 * 1024 * 1024`, `partsOf(bytes: number): number`
- Produces(`trial-contract.ts`): `textSchemaOf(max: number)`, `TrialFailure`에 `"voice_unavailable"`
- Produces(`studio-contract.ts`):
  - `studioRequestSchema`(`{ provider: "typecast", voiceId, text(1~2,000자), settings }`), `type StudioRequest`
  - `studioCreateInputSchema`(`{ requestId: uuid, request }`)
  - `studioResultSchema`(`{ id, createdAt, usage, bytes }`), `type StudioResult`
  - `studioItemSchema`(결과 + `status: "done" | "unknown"` + `request`), `type StudioItem`, `type StudioItemInput`
  - `studioAudioInputSchema`(`{ id: uuid, part: 0~10 }`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// packages/api/src/studio-contract.test.ts
import { describe, expect, it } from "vitest";

import {
	DEFAULT_SETTINGS,
	partsOf,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	TRIAL_TEXT_MAX,
} from "./providers/trial-options";
import { trialRequestSchema } from "./providers/trial-contract";
import {
	studioAudioInputSchema,
	studioCreateInputSchema,
	studioItemSchema,
	studioRequestSchema,
} from "./studio-contract";

const request = (text: string) => ({
	provider: "typecast" as const,
	voiceId: "tc_0001",
	text,
	settings: DEFAULT_SETTINGS.typecast,
});
const ok = (text: string) => studioRequestSchema.safeParse(request(text)).success;

describe("작업실 요청(T9 스펙 3절)", () => {
	it("대본은 NFC·앞뒤 공백을 정리한 뒤 1~2,000자(코드 포인트)", () => {
		expect(ok("")).toBe(false);
		expect(ok("  \n\t ")).toBe(false);
		expect(studioRequestSchema.parse(request(" 가 ")).text).toBe("가");
		expect(ok("가".repeat(STUDIO_TEXT_MAX))).toBe(true);
		expect(ok("가".repeat(STUDIO_TEXT_MAX + 1))).toBe(false);
		// 풀어 쓴 한글(자모 셋)은 NFC로 한 글자다. 원문 6,000코드 포인트여도 정리 뒤 2,000자면 받는다
		const decomposed = "한".normalize("NFD");
		expect([...decomposed]).toHaveLength(3);
		expect(
			studioRequestSchema.parse(request(decomposed.repeat(STUDIO_TEXT_MAX)))
				.text,
		).toBe("한".repeat(STUDIO_TEXT_MAX));
		// 이모지 하나는 1자다(UTF-16 두 칸)
		expect(ok("😀".repeat(STUDIO_TEXT_MAX))).toBe(true);
		// 원문 상한(2,000 × 4 UTF-16)을 넘으면 정리 뒤 1자여도 정리 전에 거절한다(공백만이면 상한이 없어도 실패하므로 글자 하나를 둔다, 계획 리뷰 E8)
		expect(ok(`가${" ".repeat(STUDIO_TEXT_MAX * 4)}`)).toBe(false);
	});
	it("시험 생성 문장 규칙은 그대로다(200자)", () => {
		const trial = (text: string) =>
			trialRequestSchema.safeParse({ ...request(text) }).success;
		expect(trial("가".repeat(TRIAL_TEXT_MAX))).toBe(true);
		expect(trial("가".repeat(TRIAL_TEXT_MAX + 1))).toBe(false);
	});
	it("Typecast만 받고 설정은 T5 Typecast 계약이다(v21 감정 포함)", () => {
		expect(
			studioRequestSchema.safeParse({
				...request("가"),
				provider: "elevenlabs",
				settings: DEFAULT_SETTINGS.elevenlabs,
			}).success,
		).toBe(false);
		expect(
			studioRequestSchema.safeParse({
				...request("가"),
				settings: {
					...DEFAULT_SETTINGS.typecast,
					model: "ssfm-v21",
					preset: "whisper",
				},
			}).success,
		).toBe(false);
		expect(
			studioRequestSchema.parse({ ...request("가"), settings: {} }).settings,
		).toEqual(DEFAULT_SETTINGS.typecast);
		expect(
			studioRequestSchema.safeParse({ ...request("가"), voiceId: "../x" })
				.success,
		).toBe(false);
	});
	it("만들기 입력은 uuid 요청 id", () => {
		expect(
			studioCreateInputSchema.safeParse({
				requestId: crypto.randomUUID(),
				request: request("가"),
			}).success,
		).toBe(true);
		expect(
			studioCreateInputSchema.safeParse({
				requestId: "x",
				request: request("가"),
			}).success,
		).toBe(false);
	});
	it("조각 번호는 0부터 32MiB의 마지막 조각까지 정수", () => {
		expect(partsOf(1)).toBe(1);
		expect(partsOf(STUDIO_PART_BYTES)).toBe(1);
		expect(partsOf(STUDIO_PART_BYTES + 1)).toBe(2);
		expect(partsOf(STUDIO_AUDIO_MAX)).toBe(11);
		const id = crypto.randomUUID();
		const part = (n: number) =>
			studioAudioInputSchema.safeParse({ id, part: n }).success;
		expect([part(0), part(10)]).toEqual([true, true]);
		expect([part(11), part(-1), part(1.5)]).toEqual([false, false, false]);
	});
	it("이전 결과 줄은 완료·미확인만", () => {
		const item = (status: string) =>
			studioItemSchema.safeParse({
				id: crypto.randomUUID(),
				createdAt: new Date().toISOString(),
				status,
				usage: { unit: "credit", amount: 5 },
				bytes: 0,
				request: request("가"),
			}).success;
		expect([item("done"), item("unknown")]).toEqual([true, true]);
		expect([item("failed"), item("pending")]).toEqual([false, false]);
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @tts-pilot-app/api test src/studio-contract.test.ts`
Expected: FAIL — `Cannot find module './studio-contract'`(그리고 `STUDIO_TEXT_MAX` 등 없음)

- [ ] **Step 3: 값 상수를 더한다(`trial-options.ts`)**

`TRIAL_RESULTS_SHOWN` 바로 아래에 더한다.

```ts
// 음성 작업실(T9 스펙 3절). 화면(글자 수·조각 수)과 서버가 함께 쓴다
export const STUDIO_TEXT_MAX = 2000;
// 이전 결과에 보이는 수(최신순, 완료와 처리 여부 미확인)
export const STUDIO_RESULTS_SHOWN = 20;
// 오디오를 나눠 받는 조각 크기. 조각 응답(multipart, 머리 약 300바이트)이 배포 환경 응답 상한 4.5MB 안에 든다(T9 계획 '설치본·문서로 확인한 것' 1)
export const STUDIO_PART_BYTES = 3 * 1024 * 1024;
// 작업실 결과 오디오 상한(T5는 4MiB). Typecast 320kbps MP3로 약 13분이다. 넘으면 이미 과금된 결과라도 버린다(audio_too_large)
export const STUDIO_AUDIO_MAX = 32 * 1024 * 1024;
// 결과 하나의 조각 수(빈 결과도 1)
export const partsOf = (bytes: number) =>
	Math.max(1, Math.ceil(bytes / STUDIO_PART_BYTES));
```

- [ ] **Step 4: 글 스키마를 넓히고 사유를 더한다(`trial-contract.ts`)**

90~100행(`textSchema`)을 바꾼다.

```ts
// 글: NFC로 맞추고 앞뒤 공백을 지운 뒤 1~max자(코드 포인트). 원문은 정리 전에 max × 4(UTF-16)까지만 받는다(풀어 쓴 한글·이모지 여유).
// 내 문장은 200자, 작업실 대본은 2,000자다(studio-contract)
export const textSchemaOf = (max: number) =>
	z
		.string()
		.max(max * 4)
		.transform(normalizeText)
		.pipe(
			z
				.string()
				.min(1)
				.refine((text) => codePoints(text) <= max),
		);
const textSchema = textSchemaOf(TRIAL_TEXT_MAX);
```

`trialFailureSchema`에 사유 하나를 더한다(`"storage",` 뒤).

```ts
	// 작업실 서버 성우 검사: 이 소유자가 담은 Typecast 성우가 아니거나 현재 이용 불가(T9 스펙 5절)
	"voice_unavailable",
```

- [ ] **Step 5: 사유의 코드를 더한다(`errors.ts` `TRIAL_CODE`)**

```ts
	storage: "SERVICE_UNAVAILABLE",
	voice_unavailable: "BAD_REQUEST",
```

- [ ] **Step 6: 계약을 쓴다**

```ts
// packages/api/src/studio-contract.ts
import { z } from "zod";

import {
	textSchemaOf,
	typecastSettingsSchema,
	usageSchema,
	voiceIdSchema,
} from "./providers/trial-contract";
import {
	partsOf,
	STUDIO_AUDIO_MAX,
	STUDIO_TEXT_MAX,
} from "./providers/trial-options";

// 음성 작업실 프로시저의 입력·출력(T9 스펙 3절). 서버가 검증하고 화면은 이 파일에서 타입만 가져간다(import type).
// 값 상수(STUDIO_*)는 화면도 쓰므로 zod 없는 trial-options.ts에 있다(계획 '스펙과 다른 점' 1)

// 작업실 요청: T5 Typecast 요청 계약 + 2,000자 대본. 이번에는 Typecast만(스펙 3절)
export const studioRequestSchema = z.object({
	provider: z.literal("typecast"),
	voiceId: voiceIdSchema,
	text: textSchemaOf(STUDIO_TEXT_MAX),
	settings: typecastSettingsSchema,
});
export type StudioRequest = z.output<typeof studioRequestSchema>;

export const studioCreateInputSchema = z.object({
	requestId: z.uuid(),
	request: studioRequestSchema,
});

// 결과 하나(오디오 없음). 오디오는 studioAudio로 조각을 받아 합친다(스펙 2절 A안). bytes는 저장한 오디오 길이(미확인은 0)
export const studioResultSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
	bytes: z.number().int().nonnegative(),
});
export type StudioResult = z.infer<typeof studioResultSchema>;

// 이전 결과 한 줄. 요청을 통째로 담아 '저장된 결과 열기' 판정과 파일 이름에 쓴다(T5 trialItemSchema와 같다)
export const studioItemSchema = studioResultSchema.extend({
	status: z.enum(["done", "unknown"]),
	request: studioRequestSchema,
});
export type StudioItem = z.output<typeof studioItemSchema>;
export type StudioItemInput = z.input<typeof studioItemSchema>;

// 조각 하나. 번호는 0부터 32MiB 결과의 마지막 조각(10)까지
export const studioAudioInputSchema = z.object({
	id: z.uuid(),
	part: z
		.number()
		.int()
		.min(0)
		.max(partsOf(STUDIO_AUDIO_MAX) - 1),
});
```

- [ ] **Step 7: 통과를 확인한다**

Run: `pnpm exec biome check --write packages/api/src/providers/trial-options.ts packages/api/src/providers/trial-contract.ts packages/api/src/providers/errors.ts packages/api/src/studio-contract.ts packages/api/src/studio-contract.test.ts && pnpm --filter @tts-pilot-app/api test src/studio-contract.test.ts src/providers/trial-contract.test.ts src/providers/errors.test.ts && pnpm --filter @tts-pilot-app/api check-types && pnpm --filter web check-types`
Expected: PASS(새 테스트 6개, 기존 계약·오류 테스트 그대로), check-types 둘 다 exit 0(web의 `trialProblemText` switch는 `default`가 새 사유를 받는다)

---
### Task 3: 생성 기록 함수와 늦은 결과

**Files:**
- Modify: `packages/api/src/providers/errors.ts`(`SynthesizeOptions`, `ProviderClient.synthesize`, `STUDIO_TIMEOUT_MS`, `runTrial` 옵션)
- Modify: `packages/api/src/providers/typecast.ts:96-129`(`synthesize`가 옵션을 넘긴다)
- Modify: `packages/api/src/trial.ts`(`Kind`, `comboKey`, `claim`, `listResults`·`audioOf`·`remove`의 `kind`, 작업실 함수, `recordUse`, `saveLate`. 주석의 옛 스킬 이름 `bts-api` → `prokit-api`, 백로그 PK-01)
- Test: `packages/api/src/providers/errors.test.ts`, `packages/api/src/providers/typecast.test.ts`, `packages/api/src/trial-studio.test.ts`(새)

**Interfaces:**
- Consumes: Task 1 칸, Task 2 상수·`StudioResult`·`StudioItemInput`.
- Produces(`providers/errors.ts`):
  - `type SynthesizeOptions = { timeoutMs?: number; onLate?: (late: Promise<Uint8Array>) => void }`
  - `ProviderClient.synthesize?(request: TrialRequest, options?: SynthesizeOptions): Promise<Uint8Array>`
  - `STUDIO_TIMEOUT_MS = 180_000`
  - `runTrial<T>(provider, call, options?: { timeoutMs?: number; onLate?: (late: Promise<T>) => void })`(기본 60초, 기존 호출 그대로)
- Produces(`trial.ts`):
  - `type Kind = "trial" | "studio"`, `comboKey(request, kind = "trial")`
  - `claim(db, { …, kind?: Kind })`, `remove(db, ownerId, id, kind: Kind = "trial")`
  - `findStudio(db, ownerId, key): Promise<StudioResult | null>`, `listStudio(db, ownerId): Promise<StudioItemInput[]>`, `audioPart(db, ownerId, id, part): Promise<File>`
  - `replayStudio(db, ownerId, requestId, key): Promise<StudioResult | null>`(같은 요청 id 재생, 오디오 대신 길이만, 계획 리뷰 P4·E3)
  - `recordUse(db, ownerId, voiceId): Promise<void>`
  - `saveLate(db, ownerId, id, voiceId, late: Promise<Uint8Array>): Promise<void>`(던지지 않는다)

- [ ] **Step 1: 실패하는 테스트를 쓴다(공급자 틀)**

`packages/api/src/providers/errors.test.ts` import에 `STUDIO_TIMEOUT_MS`를 더하고 `describe("runTrial", …)` 끝에 둘을 더한다.

```ts
	it("onLate가 있으면 제한 시간에 끊긴 요청의 결과를 넘긴다(T9 늦은 결과)", async () => {
		vi.useFakeTimers();
		let finish: (value: string) => void = () => {};
		const call = new Promise<string>((resolve) => {
			finish = resolve;
		});
		const onLate = vi.fn<(late: Promise<string>) => void>();
		const pending = runTrial("typecast", () => call, {
			timeoutMs: STUDIO_TIMEOUT_MS,
			onLate,
		});
		const assertion = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "typecast", reason: "unknown_outcome" },
		});
		// 내 문장의 60초에는 아직 기다린다
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		expect(onLate).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS - TRIAL_TIMEOUT_MS);
		await assertion;
		expect(onLate).toHaveBeenCalledTimes(1);
		finish("늦은 오디오");
		await expect(onLate.mock.calls[0]?.[0]).resolves.toBe("늦은 오디오");
		vi.useRealTimers();
	});
	it("제한 시간 안에 끝난 성공·실패에는 onLate를 부르지 않는다", async () => {
		const onLate = vi.fn();
		await expect(
			runTrial("typecast", async () => "ok", { onLate }),
		).resolves.toBe("ok");
		await expect(
			runTrial(
				"typecast",
				async () => {
					throw new ProviderHttpError(500);
				},
				{ onLate },
			),
		).rejects.toMatchObject({ data: { reason: "provider_error" } });
		expect(onLate).not.toHaveBeenCalled();
	});
```

`packages/api/src/providers/typecast.test.ts` import를 `import { CHECK_TIMEOUT_MS, STUDIO_TIMEOUT_MS, TRIAL_TIMEOUT_MS } from "./errors";`로 바꾸고 `describe("Typecast 시험 생성", …)` 끝에 더한다.

```ts
	it("작업실은 180초까지 기다리고, 넘으면 처리 여부 미확인과 함께 끊긴 요청의 결과를 넘긴다(T5-02)", async () => {
		vi.useFakeTimers();
		let respond: (response: Response) => void = () => {};
		fetchMock.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					respond = resolve;
				}),
		);
		const onLate = vi.fn<(late: Promise<Uint8Array>) => void>();
		let settled = false;
		const run = createTypecast(KEY).synthesize?.(
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "긴 대본",
				settings: DEFAULT_SETTINGS.typecast,
			},
			{ timeoutMs: STUDIO_TIMEOUT_MS, onLate },
		);
		const assertion = expect(run).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "typecast", reason: "unknown_outcome" },
		});
		void run
			?.catch(() => {})
			.finally(() => {
				settled = true;
			});
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(STUDIO_TIMEOUT_MS - TRIAL_TIMEOUT_MS);
		await assertion;
		expect(onLate).toHaveBeenCalledTimes(1);
		// 응답 본문은 진짜 타이머로 읽는다
		vi.useRealTimers();
		respond(audio());
		await expect(onLate.mock.calls[0]?.[0]).resolves.toEqual(MP3);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
```

- [ ] **Step 2: 실패하는 테스트를 쓴다(작업실 생성 기록)**

```ts
// packages/api/src/trial-studio.test.ts
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq } from "drizzle-orm";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { emptyVoice } from "./providers/list";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	type TrialRequest,
} from "./providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "./test-db";
import {
	audioOf,
	audioPart,
	claim,
	comboKey,
	complete,
	findSaved,
	findStudio,
	type Kind,
	listResults,
	listStudio,
	recordUse,
	remove,
	replayStudio,
	saveLate,
	settle,
	TRIAL_CONTRACT_VERSION,
} from "./trial";
import { cacheKey } from "./voice-cache";

// 작업실 생성 기록(T9 스펙 3·9절). 라우터 없이 trial.ts 함수를 테스트 DB로 본다
const A = `studio-a-${Date.now()}`;
const B = `studio-b-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9, 9]);
const usage = { unit: "credit", amount: 5 } as const;
const req = (text = "안녕하세요", voiceId = "tc_0001"): TrialRequest => ({
	provider: "typecast",
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.typecast,
});

// 선점한 뒤 그 끝 상태로 둔다. 반환은 행 id
async function row(
	ownerId: string,
	kind: Kind,
	end: "done" | "failed" | "unknown" | "pending",
	audio: Uint8Array = MP3,
	request: TrialRequest = req(),
) {
	const claimed = await claim(db, {
		ownerId,
		requestId: crypto.randomUUID(),
		request,
		key: comboKey(request, kind),
		usage,
		kind,
	});
	if (claimed.kind !== "claimed") throw new Error("선점하지 못했다");
	if (end === "done")
		await complete(db, ownerId, claimed.id, audio, "audio/mpeg");
	if (end === "failed")
		await settle(db, ownerId, claimed.id, "failed", "provider_error");
	if (end === "unknown")
		await settle(db, ownerId, claimed.id, "unknown", "unknown_outcome");
	return claimed.id;
}
const keep = (ownerId: string, voiceId = "tc_0001") =>
	db.insert(savedVoice).values({
		ownerId,
		provider: "typecast",
		voiceId,
		source: "public",
		voice: { ...emptyVoice("typecast", "public"), voiceId, name: voiceId },
	});
const used = async (ownerId: string, voiceId = "tc_0001") => {
	const [found] = await db
		.select({
			useCount: savedVoice.useCount,
			lastUsedAt: savedVoice.lastUsedAt,
		})
		.from(savedVoice)
		.where(and(eq(savedVoice.ownerId, ownerId), eq(savedVoice.voiceId, voiceId)));
	return found;
};
const statusOf = async (id: string) =>
	(
		await db
			.select({ status: trialGeneration.status })
			.from(trialGeneration)
			.where(eq(trialGeneration.id, id))
	)[0]?.status;
const bytesOf = async (file: Blob) => new Uint8Array(await file.arrayBuffer());

afterEach(() => vi.restoreAllMocks());

describe("조합 키의 화면(T9 스펙 2절)", () => {
	it("시험 생성 키는 T5 그대로이고, 같은 요청도 작업실 키는 다르다", () => {
		expect(comboKey(req())).toBe(
			cacheKey({ v: TRIAL_CONTRACT_VERSION, sig: comboSignature(req()) }),
		);
		expect(comboKey(req(), "trial")).toBe(comboKey(req()));
		expect(comboKey(req(), "studio")).not.toBe(comboKey(req()));
		expect(comboKey(req("  안녕하세요 "), "studio")).toBe(
			comboKey(req(), "studio"),
		);
	});
});

describe.skipIf(!url)("작업실 생성 기록", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.$client.end();
	});

	it("화면 분리: 작업실 행은 시험 생성 찾기·목록·오디오·지우기에 닿지 않고, 시험 생성 행은 작업실에 닿지 않는다", async () => {
		const studio = await row(A, "studio", "done");
		const trial = await row(A, "trial", "done");
		expect((await findSaved(db, A, comboKey(req())))?.id).toBe(trial);
		expect(
			(await listResults(db, A, "typecast", "tc_0001")).map((item) => item.id),
		).toEqual([trial]);
		await expect(audioOf(db, A, studio)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(remove(db, A, studio)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect((await findStudio(db, A, comboKey(req(), "studio")))?.id).toBe(
			studio,
		);
		expect((await listStudio(db, A)).map((item) => item.id)).toEqual([studio]);
		await expect(audioPart(db, A, trial, 0)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(remove(db, A, trial, "studio")).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await remove(db, A, studio, "studio")).toBe(true);
		expect(await remove(db, A, trial)).toBe(true);
	});

	it("찾기는 같은 조합의 완료 결과(오디오 없이 길이만)이고 실패·미확인·남의 결과는 없다", async () => {
		await row(A, "studio", "failed");
		await row(A, "studio", "unknown");
		expect(await findStudio(db, A, comboKey(req(), "studio"))).toBeNull();
		const done = await row(A, "studio", "done");
		expect(await findStudio(db, A, comboKey(req(), "studio"))).toEqual({
			id: done,
			createdAt: expect.any(String),
			usage,
			bytes: MP3.byteLength,
		});
		expect(await findStudio(db, B, comboKey(req(), "studio"))).toBeNull();
	});

	it("목록은 완료·미확인 최근 20개(최신순)이고 실패·진행 중·시험 생성·남의 결과는 없다. 미확인은 길이 0", async () => {
		for (let i = 0; i < 21; i += 1)
			await row(A, "studio", "done", MP3, req(`대본 ${i}`));
		const unknown = await row(A, "studio", "unknown", MP3, req("미확인"));
		await row(A, "studio", "failed", MP3, req("실패"));
		await row(A, "trial", "done", MP3, req("내 문장"));
		await row(B, "studio", "done");
		await row(A, "studio", "pending", MP3, req("진행 중"));
		const items = await listStudio(db, A);
		expect(items).toHaveLength(20);
		expect(items[0]).toMatchObject({
			id: unknown,
			status: "unknown",
			bytes: 0,
			request: { provider: "typecast", voiceId: "tc_0001", text: "미확인" },
		});
		expect(items[1]).toMatchObject({
			status: "done",
			bytes: MP3.byteLength,
			request: { text: "대본 20" },
		});
		expect(
			items.every((item) => item.status === "done" || item.status === "unknown"),
		).toBe(true);
	});

	it("조각: 3MiB를 넘는 오디오의 조각을 이으면 원본이고, 범위 밖·남의 것은 NOT_FOUND, 0번 조각이 보관을 30일로 늘린다", async () => {
		const big = new Uint8Array(STUDIO_PART_BYTES + 5).map((_, i) => i % 251);
		const id = await row(A, "studio", "done", big);
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() + 60_000) })
			.where(eq(trialGeneration.id, id));
		const first = await audioPart(db, A, id, 0);
		const second = await audioPart(db, A, id, 1);
		expect([first.size, second.size]).toEqual([STUDIO_PART_BYTES, 5]);
		expect(first.type).toBe("audio/mpeg");
		const joined = Buffer.from(await new Blob([first, second]).arrayBuffer());
		expect(joined.equals(Buffer.from(big))).toBe(true);
		await expect(audioPart(db, A, id, 2)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(audioPart(db, B, id, 0)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const [kept] = await db
			.select({ expiresAt: trialGeneration.expiresAt })
			.from(trialGeneration)
			.where(eq(trialGeneration.id, id));
		expect(kept?.expiresAt.getTime()).toBeGreaterThan(
			Date.now() + 29 * 24 * 60 * 60 * 1000,
		);
	});

	it("사용 이력: 그 소유자가 담은 Typecast 성우만 1씩 오르고 최근 시각이 생긴다. 담지 않았으면 아무 일 없다", async () => {
		await keep(A);
		await keep(B);
		expect(await used(A)).toEqual({ useCount: 0, lastUsedAt: null });
		await recordUse(db, A, "tc_0001");
		await recordUse(db, A, "tc_0001");
		expect(await used(A)).toMatchObject({
			useCount: 2,
			lastUsedAt: expect.any(Date),
		});
		expect(await used(B)).toEqual({ useCount: 0, lastUsedAt: null });
		await recordUse(db, A, "tc_none");
		expect(await used(A, "tc_none")).toBeUndefined();
	});

	it("늦은 성공은 미확인 행을 완료로 바꾸고 사용 이력을 1 올린다(T5-02)", async () => {
		await keep(A);
		const id = await row(A, "studio", "unknown");
		await saveLate(db, A, id, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(id)).toBe("done");
		expect(await bytesOf(await audioPart(db, A, id, 0))).toEqual(MP3);
		const [stored] = await db
			.select({ failureReason: trialGeneration.failureReason })
			.from(trialGeneration)
			.where(eq(trialGeneration.id, id));
		expect(stored?.failureReason).toBeNull();
		expect(await used(A)).toMatchObject({ useCount: 1 });
	});

	it("늦은 실패·너무 큰 늦은 오디오는 미확인 그대로이고 사용 이력도 그대로다. 로그는 한 줄씩", async () => {
		await keep(A);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const failed = await row(A, "studio", "unknown");
		await saveLate(
			db,
			A,
			failed,
			"tc_0001",
			Promise.reject(new TypeError("fetch failed")),
		);
		const large = await row(A, "studio", "unknown", MP3, req("큰 결과"));
		await saveLate(
			db,
			A,
			large,
			"tc_0001",
			Promise.resolve(new Uint8Array(STUDIO_AUDIO_MAX + 1)),
		);
		expect([await statusOf(failed), await statusOf(large)]).toEqual([
			"unknown",
			"unknown",
		]);
		expect(await used(A)).toMatchObject({ useCount: 0 });
		expect(log.mock.calls).toEqual([
			["[studio] 늦은 결과 실패: TypeError"],
			["[studio] 늦은 결과 버림: audio_too_large"],
		]);
	});

	it("늦은 결과는 그 소유자의 미확인 행에만 쓴다: 남의 행·완료 행·지운 행이면 바뀌지 않고 사용 이력도 그대로다", async () => {
		await keep(A);
		await keep(B);
		const unknown = await row(A, "studio", "unknown");
		await saveLate(db, B, unknown, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(unknown)).toBe("unknown");
		expect(await used(B)).toMatchObject({ useCount: 0 });
		const done = await row(A, "studio", "done");
		await saveLate(db, A, done, "tc_0001", Promise.resolve(new Uint8Array([1])));
		expect(await bytesOf(await audioPart(db, A, done, 0))).toEqual(MP3);
		await remove(db, A, unknown, "studio");
		await saveLate(db, A, unknown, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(unknown)).toBeUndefined();
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("늦은 결과는 작업실 행에만 쓴다: 내 문장(trial)의 미확인 행은 바뀌지 않는다(계획 리뷰 E12)", async () => {
		await keep(A);
		const trial = await row(A, "trial", "unknown");
		await saveLate(db, A, trial, "tc_0001", Promise.resolve(MP3));
		expect(await statusOf(trial)).toBe("unknown");
		expect(await used(A)).toMatchObject({ useCount: 0 });
	});

	it("같은 요청 id 재생은 오디오 없이 길이만 돌려준다. 조합이 다르면 request_mismatch, 진행 중은 in_progress, 5분 넘은 진행 중은 미확인으로 옮긴다(계획 리뷰 P4·E3)", async () => {
		const request = req();
		const key = comboKey(request, "studio");
		const requestId = crypto.randomUUID();
		expect(await replayStudio(db, A, requestId, key)).toBeNull();
		const pending = await claim(db, {
			ownerId: A,
			requestId,
			request,
			key,
			usage,
			kind: "studio",
		});
		if (pending.kind !== "claimed") throw new Error("선점하지 못했다");
		await expect(replayStudio(db, A, requestId, key)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		await db
			.update(trialGeneration)
			.set({ createdAt: new Date(Date.now() - 6 * 60_000) })
			.where(eq(trialGeneration.id, pending.id));
		await expect(replayStudio(db, A, requestId, key)).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(await statusOf(pending.id)).toBe("unknown");
		const doneRequest = req("완료");
		const doneKey = comboKey(doneRequest, "studio");
		const doneId = crypto.randomUUID();
		const done = await claim(db, {
			ownerId: A,
			requestId: doneId,
			request: doneRequest,
			key: doneKey,
			usage,
			kind: "studio",
		});
		if (done.kind !== "claimed") throw new Error("선점하지 못했다");
		await complete(db, A, done.id, MP3, "audio/mpeg");
		expect(await replayStudio(db, A, doneId, doneKey)).toEqual({
			id: done.id,
			createdAt: done.createdAt,
			usage,
			bytes: MP3.byteLength,
		});
		await expect(replayStudio(db, A, doneId, key)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
		expect(await replayStudio(db, B, doneId, doneKey)).toBeNull();
	});
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/providers/errors.test.ts src/providers/typecast.test.ts src/trial-studio.test.ts`
Expected: FAIL — `STUDIO_TIMEOUT_MS` 없음, `findStudio`·`audioPart`·`recordUse`·`saveLate`·`Kind` 없음. skipped면 `TEST_DATABASE_URL`을 넘기지 못한 것이다.

- [ ] **Step 4: 공급자 틀에 기다림과 늦은 결과를 더한다(`errors.ts`)**

`ProviderClient` 타입 바로 위에 더한다.

```ts
// 생성 한 번의 기다림(T9 스펙 2절). timeoutMs가 지나면 처리 여부 미확인이다. onLate가 있으면 끊긴 요청의 결과 약속을 넘긴다.
// 취소할 수 없는 Typecast SDK만 실제로 늦게 끝난다. 신호를 받는 공급자는 끊긴 요청이 AbortError로 끝나 늦은 실패가 된다
export type SynthesizeOptions = {
	timeoutMs?: number;
	onLate?: (late: Promise<Uint8Array>) => void;
};
```

`ProviderClient`의 `synthesize` 줄을 바꾼다.

```ts
	// 생성 1회(T5 시험 생성, T9 작업실). 유료다(Fish Audio 무료 모델 제외). 오디오 바이트를 돌려준다. 재시도하지 않는다.
	// options는 작업실만 넘긴다(180초, 늦은 결과). 넘기지 않으면 T5 그대로 60초다
	synthesize?(
		request: TrialRequest,
		options?: SynthesizeOptions,
	): Promise<Uint8Array>;
```

`TRIAL_TIMEOUT_MS` 바로 아래에 더한다.

```ts
// 작업실 생성 시간 제한(T9 스펙 2절). Typecast 일반 생성 소요 시간은 문서에 없어 추정이다(사용자 테스트 7번으로 확인한다)
export const STUDIO_TIMEOUT_MS = 180_000;
```

`runTrial`을 바꾼다(머리 주석은 그대로 두고 한 줄을 더한다).

```ts
// 작업실은 시간 제한을 늘리고(timeoutMs) 끊긴 요청의 결과 약속을 onLate로 받는다(T9). 경주가 그 약속에 처리기를 달아 두므로 늦은 거절이 처리 안 된 거절이 되지 않는다
export async function runTrial<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
	{
		timeoutMs = TRIAL_TIMEOUT_MS,
		onLate,
	}: { timeoutMs?: number; onLate?: (late: Promise<T>) => void } = {},
): Promise<T> {
	let started: Promise<T> | undefined;
	try {
		return await withTimeout((signal) => {
			started = call(signal);
			return started;
		}, timeoutMs);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) {
			if (onLate && started) onLate(started);
			throw trialError(provider, "unknown_outcome");
		}
		if (error instanceof ProviderHttpError) {
			const reason = trialReason(error.status, error.codes);
			throw trialError(provider, reason, {
				retryAt:
					reason === "rate_limit" ? retryAtFrom(error.retryAfter) : undefined,
				providerCode: reason === "provider_input" ? error.codes[0] : undefined,
			});
		}
		logFailure(`[trial] ${provider} 생성 실패`, error, []);
		throw trialError(provider, "unknown_outcome");
	}
}
```

- [ ] **Step 5: Typecast 합성이 옵션을 넘긴다(`typecast.ts`)**

import에 `type SynthesizeOptions`를 더하고 `synthesize`를 바꾼다(본문 그대로, 매개변수와 마지막 인자만 다르다).

```ts
		synthesize: (
			request: Extract<TrialRequest, { provider: "typecast" }>,
			options: SynthesizeOptions = {},
		) =>
			// SDK에 취소 신호가 없어 runTrial의 경주로만 끊는다(내 문장 60초, 작업실 180초). 끊긴 요청은 뒤에서 끝까지 돌아 과금될 수 있다.
			// 작업실은 그 결과를 onLate로 받아 같은 생성 기록에 저장한다(T9 스펙 2절 '늦은 결과', T5-02). Node fetch는 응답 머리를 300초까지 기다린다
			runTrial(
				"typecast",
				async () => {
					const s = usedSettings(request) as Partial<TypecastSettings> & {
						model: TypecastModel;
					};
					const prompt =
						s.emotion === "smart"
							? { emotion_type: "smart" as const }
							: s.model === "ssfm-v30"
								? {
										emotion_type: "preset" as const,
										emotion_preset: s.preset,
										emotion_intensity: s.intensity,
									}
								: { emotion_preset: s.preset, emotion_intensity: s.intensity };
					const { audioData } = await client
						.textToSpeech({
							text: sentText(request),
							voice_id: request.voiceId,
							model: s.model,
							...(s.language === "kor" ? { language: "kor" as const } : {}),
							prompt,
							output: {
								audio_format: "mp3",
								audio_tempo: s.tempo,
								audio_pitch: s.pitch,
								volume: s.volume,
							},
						})
						.catch(toHttpError);
					return new Uint8Array(audioData);
				},
				options,
			),
```

- [ ] **Step 6: 생성 기록 함수를 넓힌다(`trial.ts`)**

import를 바꾼다.

```ts
import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";

import type { ProviderId } from "./providers/contract";
import { logFailure, trialError } from "./providers/errors";
import {
	type TrialAudio,
	type TrialFailure,
	type TrialItemInput,
	trialFailureSchema,
} from "./providers/trial-contract";
import {
	comboSignature,
	normalizeText,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_RESULTS_SHOWN,
	TRIAL_RESULTS_SHOWN,
	type TrialRequest,
	type Usage,
	usedSettings,
} from "./providers/trial-options";
import type { StudioItemInput, StudioResult } from "./studio-contract";
import { cacheKey, guard, logDbFailure } from "./voice-cache";
```

24~27행 머리 주석을 아래로 바꾼다(판 올림이 유료 작업실 결과를 지우지 않게, 계획 리뷰 E5·코디네이터 결정 C5. 옛 스킬 이름 `bts-api`도 고친다).

```ts
// 생성 기록과 결과(ADR 0003 '듣기 결과', T5 스펙 5절, T9 작업실). 모든 읽기·쓰기에 소유자 조건을 넣는다(prokit-api 불변식 3).
// 정리·옵션·조합 글자가 바뀌어 같은 요청이 다른 소리를 내게 되면 판을 올린다(옛 결과를 찾지 않는다). 작업실 키도 같은 판을 쓴다.
// 판을 올릴 때는 같은 마이그레이션에서 `delete from trial_generation where kind = 'trial'`로 내 문장 결과만 지운다. 목록(listResults)은 판을 거르지 않고
// 화면의 '저장된 결과' 판정(comboSignature)에는 판이 없어서, 옛 행이 남으면 '저장됨'인데 찾기가 못 찾는다(계획 리뷰 E13).
// 작업실 결과(유료, 최대 32MiB)는 지우지 않는다. 판이 바뀌면 studioFind만 못 찾고, 이전 결과 목록에 있는 줄은 화면이 id로 계속 연다(T9 계획 리뷰 E5).
// 화면의 판정(comboSignature)에도 판이 없어 최근 20개 안의 같은 서명은 옛 판이어도 '음성 만들기'가 '저장된 결과 열기'로 연다(다시 만들지 않아 돈은 안전하다). 이것이 문제가 되면 StudioItem에 판을 싣는다(계획 재리뷰 N1)
```

217·321행 주석의 `bts-api`도 `prokit-api`로 바꾼다(백로그 PK-01, 주석만).

`replayRequest`(118~150행)와 `replay`(207~215행)에서 작업실이 함께 쓸 두 조각을 빼낸다. 동작은 그대로다(T5 테스트가 회귀를 덮는다).

```ts
// 5분 넘은 진행 중인 같은 요청 id를 처리 여부 미확인으로 옮긴다(tts-provider). 재생 두 길(내 문장·작업실)이 함께 쓴다
const isStale = (row: { status: string; createdAt: Date }) =>
	row.status === "pending" &&
	row.createdAt.getTime() < Date.now() - STALE_PENDING_MS;
async function expireStale(db: Database, ownerId: string, requestId: string) {
	await db
		.update(t)
		.set({ status: "unknown" })
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.requestId, requestId),
				eq(t.status, "pending"),
				lt(t.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
			),
		);
}

// 새 요청의 대기 확인 전에 기존 요청 id만 재생한다. 오래된 pending은 먼저 unknown으로 옮긴다.
export async function replayRequest(
	db: Database,
	ownerId: string,
	requestId: string,
	key: string,
	provider: ProviderId,
): Promise<TrialAudio | null> {
	const existing = await requestRow(db, ownerId, requestId);
	if (!existing) return null;
	if (existing.comboKey !== key) throw trialError(provider, "request_mismatch");
	if (isStale(existing)) {
		await expireStale(db, ownerId, requestId);
		return replay(
			provider,
			(await requestRow(db, ownerId, requestId)) ?? existing,
		);
	}
	return replay(provider, existing);
}
```

```ts
// 같은 요청 id의 상태 판정(T5 규칙): 완료면 done(행), 진행 중은 in_progress, 미확인은 unknown_outcome, 실패는 그 사유
function replayStatus<
	R extends { status: string; failureReason: string | null },
	T,
>(provider: ProviderId, row: R, done: (row: R) => T): T {
	if (row.status === "done") return done(row);
	if (row.status === "pending") throw trialError(provider, "in_progress");
	if (row.status === "unknown") throw trialError(provider, "unknown_outcome");
	const reason: TrialFailure =
		trialFailureSchema.safeParse(row.failureReason).data ?? "provider_error";
	throw trialError(provider, reason);
}

// 같은 요청 id가 다시 왔다(재전송, 두 번 누름). 공급자를 다시 부르지 않고 그 행의 상태를 돌려준다
export function replay(provider: ProviderId, row: ExistingRow): TrialAudio {
	return replayStatus(provider, row, toAudio);
}
```

`comboKey`(35~36행)를 바꾼다.

```ts
// 생성 기록의 화면(T9 스펙 3절). 'trial' 내 문장 듣기, 'studio' 음성 작업실
export type Kind = "trial" | "studio";

// 목록 캐시와 같은 해시 함수를 쓴다(voice-cache cacheKey, 계획 리뷰 ponytail 12).
// 작업실은 kind를 넣어 같은 요청이라도 시험 생성과 키가 다르다(재사용·목록이 화면별로 나뉜다). 시험 생성 키는 T5 그대로 둔다(저장된 결과가 이어진다)
export const comboKey = (request: TrialRequest, kind: Kind = "trial") =>
	cacheKey(
		kind === "trial"
			? { v: TRIAL_CONTRACT_VERSION, sig: comboSignature(request) }
			: { v: TRIAL_CONTRACT_VERSION, kind, sig: comboSignature(request) },
	);
```

`claim`의 입력 타입에 `kind?: Kind;`를 더하고, insert 값의 `requestId,` 바로 아래에 `kind: input.kind ?? "trial",`를 더한다.

`listResults`의 where에 `eq(t.kind, "trial"),`를 `eq(t.ownerId, ownerId),` 바로 아래에 더한다.

`audioOf`의 where에 같은 줄을 더하고 주석에 한 줄을 붙인다.

```ts
// 결과 하나의 오디오. 재생하면 만료를 30일 뒤로 늘린다. 남의 결과·없는 결과·만료는 NOT_FOUND(prokit-api 불변식 3).
// 시험 생성 결과만이다. 작업실 결과(최대 32MiB)는 한 번에 보내지 않고 audioPart로 나눈다(T9)
```

`remove`에 `kind`를 받는다.

```ts
// 결과 지우기(앱 DB에서만, 공급자는 건드리지 않는다). 진행 중인 행은 지우지 않는다. 화면은 자기 kind의 행만 지운다(T9)
export async function remove(
	db: Database,
	ownerId: string,
	id: string,
	kind: Kind = "trial",
): Promise<true> {
	const [row] = await db
		.delete(t)
		.where(
			and(
				eq(t.id, id),
				eq(t.ownerId, ownerId),
				eq(t.kind, kind),
				ne(t.status, "pending"),
			),
		)
		.returning({ id: t.id });
	if (!row) throw new ORPCError("NOT_FOUND");
	return true;
}
```

파일 끝에 작업실 함수들을 더한다.

```ts
// ── 음성 작업실(T9 스펙 3절) ──
// 작업실 행. 부분 인덱스 trial_generation_studio와 같은 조건 글자로 쓴다(매개변수면 계획이 인덱스 조건을 증명하지 못할 수 있다)
const studioRow = sql`${t.kind} = 'studio'`;
const studioColumns = {
	id: t.id,
	createdAt: t.createdAt,
	usageUnit: t.usageUnit,
	usageAmount: t.usageAmount,
	// 오디오를 읽지 않고 길이만(미확인 행은 0)
	bytes: sql<number>`coalesce(octet_length(${t.audio}), 0)`.mapWith(Number),
};
const studioOf = (row: {
	id: string;
	createdAt: Date;
	usageUnit: string;
	usageAmount: number;
	bytes: number;
}): StudioResult => ({
	id: row.id,
	createdAt: row.createdAt.toISOString(),
	usage: usageOf(row),
	bytes: row.bytes,
});

// 같은 조합(작업실 키)의 완료 결과 가운데 가장 최근 것. 오디오는 화면이 조각으로 받고 0번 조각이 만료를 늘린다
export async function findStudio(
	db: Database,
	ownerId: string,
	key: string,
): Promise<StudioResult | null> {
	const [row] = await db
		.select(studioColumns)
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				studioRow,
				eq(t.comboKey, key),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(1);
	return row ? studioOf(row) : null;
}

// 이전 결과: 완료와 처리 여부 미확인 최근 20개(오디오 없음). 요청은 저장한 정리 값이고 출력 스키마가 기본값을 채워 다시 검사한다
export async function listStudio(
	db: Database,
	ownerId: string,
): Promise<StudioItemInput[]> {
	const rows = await db
		.select({
			...studioColumns,
			status: t.status,
			voiceId: t.voiceId,
			text: t.text,
			settings: t.settings,
		})
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				studioRow,
				inArray(t.status, ["done", "unknown"]),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(STUDIO_RESULTS_SHOWN);
	return rows.map((row) => ({
		...studioOf(row),
		status: row.status as "done" | "unknown",
		request: {
			provider: "typecast",
			voiceId: row.voiceId,
			text: row.text,
			settings: row.settings,
		} as StudioItemInput["request"],
	}));
}

// 결과 오디오의 조각 하나(3MiB). Postgres substring은 1부터 센다. 저장 방식이 EXTERNAL이라 이 조각의 TOAST 덩어리만 읽는다.
// 0번 조각(열기·내려받기의 시작)만 보관을 30일 뒤로 늘린다(T5 audioOf와 같다). 남의 것·없음·만료·완료 아님·범위 밖은 NOT_FOUND
export async function audioPart(
	db: Database,
	ownerId: string,
	id: string,
	part: number,
): Promise<File> {
	const where = and(
		eq(t.id, id),
		eq(t.ownerId, ownerId),
		studioRow,
		eq(t.status, "done"),
		gt(t.expiresAt, new Date()),
	);
	const fields = {
		chunk: sql<Buffer | null>`substring(${t.audio} from ${part * STUDIO_PART_BYTES + 1}::int for ${STUDIO_PART_BYTES}::int)`,
		audioType: t.audioType,
	};
	const [row] =
		part === 0
			? await db
					.update(t)
					.set({ expiresAt: later() })
					.where(where)
					.returning(fields)
			: await db.select(fields).from(t).where(where);
	if (!row?.chunk || row.chunk.length === 0) throw new ORPCError("NOT_FOUND");
	return audioFile(row.chunk, row.audioType ?? "audio/mpeg");
}

// 사용 이력(GLOSSARY): 작업실 생성이 성공한 때만 그 소유자의 담은 Typecast 성우에 +1(T9 스펙 3절). 보관함에서 빠졌으면 바뀌는 행이 없다
export async function recordUse(
	db: Database,
	ownerId: string,
	voiceId: string,
) {
	await db
		.update(savedVoice)
		.set({
			useCount: sql`${savedVoice.useCount} + 1`,
			lastUsedAt: sql`now()`,
		})
		.where(
			and(
				eq(savedVoice.ownerId, ownerId),
				eq(savedVoice.provider, "typecast"),
				eq(savedVoice.voiceId, voiceId),
			),
		);
}

// 작업실의 같은 요청 id 재생(replayRequest와 같은 규칙). 오디오 대신 길이만 읽는다(32MiB를 통째로 읽지 않는다, 계획 리뷰 P4·E3).
// 이번 작업실은 Typecast만이다(T10이 공급자를 넘긴다)
export async function replayStudio(
	db: Database,
	ownerId: string,
	requestId: string,
	key: string,
): Promise<StudioResult | null> {
	const find = async () => {
		const [row] = await db
			.select({
				...studioColumns,
				comboKey: t.comboKey,
				status: t.status,
				failureReason: t.failureReason,
			})
			.from(t)
			.where(and(eq(t.ownerId, ownerId), eq(t.requestId, requestId)))
			.limit(1);
		return row;
	};
	const existing = await find();
	if (!existing) return null;
	if (existing.comboKey !== key)
		throw trialError("typecast", "request_mismatch");
	if (!isStale(existing)) return replayStatus("typecast", existing, studioOf);
	await expireStale(db, ownerId, requestId);
	return replayStatus("typecast", (await find()) ?? existing, studioOf);
}

// 늦은 결과 저장: 시간 초과로 미확인이 된 그 소유자의 행만 완료로 바꾼다. 그사이 지웠거나 다른 상태면 바뀌는 행이 없다
async function completeLate(
	db: Database,
	ownerId: string,
	id: string,
	audio: Uint8Array,
): Promise<boolean> {
	const rows = await db
		.update(t)
		.set({
			status: "done",
			failureReason: null,
			audio: Buffer.from(audio),
			audioType: "audio/mpeg",
			expiresAt: later(),
		})
		// 작업실 행만(내 문장 미확인 행은 상한이 4MiB다, 계획 리뷰 E12)
		.where(
			and(
				eq(t.id, id),
				eq(t.ownerId, ownerId),
				studioRow,
				eq(t.status, "unknown"),
			),
		)
		.returning({ id: t.id });
	return rows.length > 0;
}

// 늦은 결과(T5-02, T9 스펙 2절). 성공이면 같은 기록을 완료로 바꾸고 사용 이력을 올린다. 실패·32MiB 초과는 미확인 그대로다.
// 부르는 쪽은 미확인 기록을 쓴 뒤에 부른다(먼저 오면 미확인 쓰기가 완료를 덮는다). 던지지 않는다(로그 한 줄).
// shortcut: 서버 프로세스가 살아 있을 때만 받는다(로컬은 확실). 배포 환경은 응답 뒤 작업 유지(after)와 최대 실행 시간이 필요하다(로드맵 T15 메모)
export function saveLate(
	db: Database,
	ownerId: string,
	id: string,
	voiceId: string,
	late: Promise<Uint8Array>,
): Promise<void> {
	return late.then(
		async (audio) => {
			if (audio.byteLength > STUDIO_AUDIO_MAX) {
				console.error("[studio] 늦은 결과 버림: audio_too_large");
				return;
			}
			await guard(
				"늦은 결과 기록",
				async () => {
					if (await completeLate(db, ownerId, id, audio))
						await recordUse(db, ownerId, voiceId);
				},
				"[studio]",
			);
		},
		(error: unknown) => logFailure("[studio] 늦은 결과 실패", error, []),
	);
}
```

`later`·`usageOf`·`audioFile`은 이 파일 위쪽에 있는 것을 쓴다. `logDbFailure` import는 `withStorage`가 계속 쓴다.

- [ ] **Step 7: 통과를 확인한다**

Run: `pnpm exec biome check --write packages/api/src/providers/errors.ts packages/api/src/providers/errors.test.ts packages/api/src/providers/typecast.ts packages/api/src/providers/typecast.test.ts packages/api/src/trial.ts packages/api/src/trial-studio.test.ts && source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test && pnpm --filter @tts-pilot-app/api check-types`
Expected: 전체 PASS(새 테스트 14개: 오류 틀 2, Typecast 1, 작업실 생성 기록 11. skipped 0). T5 `trial.test.ts`·`routers/trial*.test.ts`가 그대로 통과한다(조합 키·기본 `kind`·`remove` 기본값의 회귀). check-types exit 0.

---
### Task 4: 작업실 프로시저 다섯과 격리 테스트

**Files:**
- Create: `packages/api/src/routers/studio.ts`
- Modify: `packages/api/src/routers/index.ts`(import와 `...studioRouter`)
- Modify: `packages/api/src/saved-voice-contract.ts:56-65`(`lastUsedAt`·`useCount`)
- Modify: `packages/api/src/routers/saved-voice.ts:88-101`(`listOf`가 두 칸을 채운다)
- Modify: `apps/web/src/components/saved-voices.test.ts:21-30`(고정값 두 칸, 타입 검사)
- Test: `packages/api/src/routers/studio.test.ts`, `packages/api/src/routers/studio.isolation.test.ts`, `packages/api/src/rpc-file.test.ts`

**Interfaces:**
- Consumes: Task 2 계약, Task 3 함수(`replayStudio`·`claim`·`replay`·`complete`·`settle`·`sweep`·`withStorage`·`findStudio`·`listStudio`·`audioPart`·`remove`·`recordUse`·`saveLate`·`comboKey`), `STUDIO_TIMEOUT_MS`, `cooldownOf`·`recordCooldown`·`guard`(voice-cache).
- Produces(oRPC, 모두 `protectedProcedure`, 소유자는 `context.ownerId`):
  - `studioCreate({ requestId, request }): StudioResult`
  - `studioFind(request): StudioResult | null`
  - `studioList(): StudioItem[]`
  - `studioAudio({ id, part }): File`
  - `studioDelete({ id }): { deleted: true }`
  - 오류: 입력 위반·성우 검사 `BAD_REQUEST`(`voice_unavailable`), 키 없음 `PRECONDITION_FAILED`, 진행 중·429 `TOO_MANY_REQUESTS`, 미확인 `GATEWAY_TIMEOUT`, DB `SERVICE_UNAVAILABLE`(`storage`), 없음·남의 것 `NOT_FOUND`, 소유자 없음 `UNAUTHORIZED`
  - `savedVoiceList()` 항목에 `lastUsedAt: string | null`, `useCount: number`

- [ ] **Step 1: 실패하는 테스트를 쓴다(기능)**

```ts
// packages/api/src/routers/studio.test.ts
import { createRouterClient } from "@orpc/server";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, eq, sql } from "drizzle-orm";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { Context } from "../context";
import {
	STUDIO_TIMEOUT_MS,
	type SynthesizeOptions,
	trialError,
} from "../providers/errors";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import {
	DEFAULT_SETTINGS,
	STUDIO_AUDIO_MAX,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
	type TrialRequest,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { claim, comboKey } from "../trial";
import { appRouter } from "./index";

const OWNER = `studio-r-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 5]);
const synthesize = vi.fn(
	async (_request: TrialRequest, _options?: SynthesizeOptions) => MP3,
);
const providers: Providers = { typecast: { checkStatus: vi.fn(), synthesize } };
const as = (ownerId: string | null, ctx: Partial<Context> = {}) =>
	createRouterClient(appRouter, {
		context: { db, ownerId, providers, ...ctx } as Context,
	});
const me = as(OWNER);
const request = (text = "안녕하세요", voiceId = "tc_0001") => ({
	provider: "typecast" as const,
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.typecast,
});
const create = (text?: string, requestId: string = crypto.randomUUID()) =>
	me.studioCreate({ requestId, request: request(text) });
const keep = (
	ownerId: string,
	voiceId = "tc_0001",
	over: { provider?: "typecast" | "elevenlabs"; unavailable?: boolean } = {},
) => {
	const provider = over.provider ?? "typecast";
	return db.insert(savedVoice).values({
		ownerId,
		provider,
		voiceId,
		source: "public",
		voice: {
			...emptyVoice(provider, "public"),
			voiceId,
			name: `성우 ${voiceId}`,
		},
		unavailable: over.unavailable ?? false,
	});
};
const used = async (voiceId = "tc_0001") => {
	const [found] = await db
		.select({ useCount: savedVoice.useCount })
		.from(savedVoice)
		.where(and(eq(savedVoice.ownerId, OWNER), eq(savedVoice.voiceId, voiceId)));
	return found;
};
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
const rows = () => db.select().from(trialGeneration);
let dbTouches = 0;
const failingDb = new Proxy(
	{},
	{
		get() {
			dbTouches += 1;
			throw new Error("db");
		},
	},
) as Context["db"];

// DB를 쓰지 않는 테스트는 skipIf 밖에 둬 TEST_DATABASE_URL이 없어도 늘 돈다(계획 리뷰 E4)
describe("음성 작업실 프로시저: DB 없이(스펙 5절)", () => {
	beforeEach(() => synthesize.mockClear());
	afterEach(() => vi.restoreAllMocks());

	it("DB가 실패하면 공급자를 부르지 않고 storage, 목록·찾기도 storage(스펙 5절)", async () => {
		dbTouches = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
		const broken = as(OWNER, { db: failingDb });
		await expect(
			broken.studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
			data: { reason: "storage" },
		});
		expect(dbTouches).toBeGreaterThan(0);
		expect(synthesize).not.toHaveBeenCalled();
		await expect(broken.studioList()).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		await expect(broken.studioFind(request())).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
	});
});

describe.skipIf(!url)("음성 작업실 프로시저(T9 스펙 3·9절)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		synthesize.mockClear();
		vi.useRealTimers();
		await keep(OWNER);
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.$client.end();
	});

	it("만들면 공급자 1회(180초 기다림), 출력은 오디오 없이 길이만, 조각 0이 같은 바이트, 이전 결과 한 줄, 같은 조합 찾기는 공급자 0회(AC1·AC5)", async () => {
		const made = await create();
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(synthesize.mock.calls[0]?.[1]).toMatchObject({
			timeoutMs: STUDIO_TIMEOUT_MS,
		});
		expect(made).toEqual({
			id: expect.any(String),
			createdAt: expect.any(String),
			usage: { unit: "credit", amount: 5 },
			bytes: MP3.byteLength,
		});
		expect(await bytes(await me.studioAudio({ id: made.id, part: 0 }))).toEqual(
			MP3,
		);
		expect(await me.studioList()).toMatchObject([
			{
				id: made.id,
				status: "done",
				bytes: MP3.byteLength,
				request: { provider: "typecast", voiceId: "tc_0001", text: "안녕하세요" },
			},
		]);
		expect((await me.studioFind(request("  안녕하세요 ")))?.id).toBe(made.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
		// 화면별 기록: 캐스팅 결과 목록에는 나오지 않는다
		expect(
			await me.trialList({ provider: "typecast", voiceId: "tc_0001" }),
		).toEqual([]);
	});

	it("같은 요청 id를 동시에 두 번 보내도 공급자 1회, 끝난 뒤 같은 id는 같은 결과(AC4)", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return MP3;
		});
		const id = crypto.randomUUID();
		const first = create(undefined, id);
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		await expect(create(undefined, id)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		release();
		const done = await first;
		expect(await create(undefined, id)).toEqual(done);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("같은 조합이라도 새 요청 id면 다시 만든다(공급자 2회, 기록 둘). 조합 재사용은 화면의 studioFind가 맡는다(디자인 리뷰 DN-6)", async () => {
		const first = await create();
		const second = await create();
		expect(second.id).not.toBe(first.id);
		expect(synthesize).toHaveBeenCalledTimes(2);
		expect((await me.studioList()).map((item) => item.id)).toEqual([
			second.id,
			first.id,
		]);
		expect((await me.studioFind(request()))?.id).toBe(second.id);
	});

	it("진행 중인 생성이 있으면(캐스팅의 내 문장 포함) in_progress, 공급자 0회(AC4)", async () => {
		const trial: TrialRequest = request("내 문장");
		await claim(db, {
			ownerId: OWNER,
			requestId: crypto.randomUUID(),
			request: trial,
			key: comboKey(trial),
			usage: { unit: "credit", amount: 4 },
		});
		await expect(create()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("담지 않은·이용 불가·다른 공급자로 담은 성우는 voice_unavailable, 공급자 0회, 기록 없음(스펙 5절)", async () => {
		await keep(OWNER, "tc_off", { unavailable: true });
		await keep(OWNER, "tc_el", { provider: "elevenlabs" });
		for (const voiceId of ["tc_none", "tc_off", "tc_el"])
			await expect(
				me.studioCreate({
					requestId: crypto.randomUUID(),
					request: request("가", voiceId),
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				data: { provider: "typecast", reason: "voice_unavailable" },
			});
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
	});

	it("빈 대본·공백만·2,001자·다른 공급자는 입력 검사에서 거절하고 공급자 0회, 기록 없음(AC3)", async () => {
		for (const text of ["", "   ", "가".repeat(STUDIO_TEXT_MAX + 1)])
			await expect(create(text)).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			me.studioCreate({
				requestId: crypto.randomUUID(),
				request: {
					...request(),
					provider: "elevenlabs",
					settings: DEFAULT_SETTINGS.elevenlabs,
				} as never,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(synthesize).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(0);
	});

	it("시간 초과는 미확인(같은 id를 다시 보내도 공급자 0회), 뒤늦은 성공은 같은 행을 완료로 바꾸고 사용 이력 1회(AC7)", async () => {
		let deliver: (audio: Uint8Array) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((resolve) => {
					deliver = resolve;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		const requestId = crypto.randomUUID();
		const timedOut = {
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		};
		await expect(create(undefined, requestId)).rejects.toMatchObject(timedOut);
		expect(await me.studioList()).toMatchObject([
			{ status: "unknown", bytes: 0 },
		]);
		await expect(create(undefined, requestId)).rejects.toMatchObject(timedOut);
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(await used()).toMatchObject({ useCount: 0 });
		deliver(MP3);
		await vi.waitFor(async () =>
			expect((await me.studioList())[0]?.status).toBe("done"),
		);
		const [item] = await me.studioList();
		expect(item?.bytes).toBe(MP3.byteLength);
		expect(
			await bytes(await me.studioAudio({ id: item?.id ?? "", part: 0 })),
		).toEqual(MP3);
		// 사용 이력은 완료 쓰기 뒤에 오른다. 상태가 바뀐 순간 아직 안 올랐을 수 있어 기다린다(계획 재리뷰 R3)
		await vi.waitFor(async () =>
			expect(await used()).toMatchObject({ useCount: 1 }),
		);
		expect((await me.studioFind(request()))?.id).toBe(item?.id);
	});

	it("뒤늦은 실패는 미확인 그대로이고 사용 이력도 그대로다", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		let refuse: (error: unknown) => void = () => {};
		synthesize.mockImplementationOnce(async (_request, options) => {
			options?.onLate?.(
				new Promise<Uint8Array>((_resolve, reject) => {
					refuse = reject;
				}),
			);
			throw trialError("typecast", "unknown_outcome");
		});
		await expect(create()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		refuse(new TypeError("fetch failed"));
		await vi.waitFor(() =>
			expect(log).toHaveBeenCalledWith("[studio] 늦은 결과 실패: TypeError"),
		);
		expect(await me.studioList()).toMatchObject([{ status: "unknown" }]);
		expect(await used()).toMatchObject({ useCount: 0 });
	});

	it("3MiB를 넘는 결과도 3MiB 이하 조각으로 받아 이으면 원본이고 범위 밖 조각은 NOT_FOUND(AC6)", async () => {
		const big = new Uint8Array(STUDIO_PART_BYTES * 2 + 7).map(
			(_, i) => (i * 7) % 256,
		);
		synthesize.mockResolvedValueOnce(big);
		const made = await create();
		expect(made.bytes).toBe(big.byteLength);
		const parts = [
			await me.studioAudio({ id: made.id, part: 0 }),
			await me.studioAudio({ id: made.id, part: 1 }),
			await me.studioAudio({ id: made.id, part: 2 }),
		];
		expect(parts.map((part) => part.size)).toEqual([
			STUDIO_PART_BYTES,
			STUDIO_PART_BYTES,
			7,
		]);
		expect(
			Buffer.from(await new Blob(parts).arrayBuffer()).equals(Buffer.from(big)),
		).toBe(true);
		await expect(
			me.studioAudio({ id: made.id, part: 3 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("작업실 오디오는 압축 없이 TOAST 표에(본 행 밖) 둔다(마이그레이션 studio_audio_storage, 계획 리뷰 E10)", async () => {
		// 0으로 채운 1MiB는 압축하면 수 KB가 된다. 압축됐으면 이 테스트가 잡는다
		synthesize.mockResolvedValueOnce(new Uint8Array(1024 * 1024));
		const made = await create();
		const result = await db.execute<{ method: string | null; stored: number }>(
			sql`select pg_column_compression(audio) as method, pg_column_size(audio) as stored from trial_generation where id = ${made.id}`,
		);
		expect(result.rows[0]?.method).toBeNull();
		expect(Number(result.rows[0]?.stored)).toBeGreaterThanOrEqual(1024 * 1024);
	});

	it("성공 1회에 사용 이력 +1이고 보관함 목록에 두 칸이 보인다. 저장된 결과 찾기·내 문장 듣기·실패는 세지 않는다(AC8)", async () => {
		await keep(OWNER, "tc_0002");
		await create();
		const list = await me.savedVoiceList();
		expect(
			list.find((item) => item.voice.voiceId === "tc_0001"),
		).toMatchObject({ useCount: 1, lastUsedAt: expect.any(String) });
		expect(
			list.find((item) => item.voice.voiceId === "tc_0002"),
		).toMatchObject({ useCount: 0, lastUsedAt: null });
		await me.studioFind(request());
		await me.trialCreate({
			requestId: crypto.randomUUID(),
			request: request("내 문장"),
		});
		synthesize.mockRejectedValueOnce(trialError("typecast", "quota"));
		await expect(create("실패할 대본")).rejects.toMatchObject({
			data: { reason: "quota" },
		});
		expect(await used()).toMatchObject({ useCount: 1 });
	});

	it("목록은 작업실의 완료·미확인만, 지우기는 진행 중이 아닐 때만이고 지운 결과의 조각은 NOT_FOUND(스펙 9절)", async () => {
		const done = await create();
		synthesize.mockRejectedValueOnce(
			trialError("typecast", "unknown_outcome"),
		);
		await expect(create("미확인")).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
		});
		synthesize.mockRejectedValueOnce(trialError("typecast", "provider_error"));
		await expect(create("실패")).rejects.toMatchObject({ code: "BAD_GATEWAY" });
		await me.trialCreate({
			requestId: crypto.randomUUID(),
			request: request("내 문장"),
		});
		expect(
			(await me.studioList()).map((item) => [item.request.text, item.status]),
		).toEqual([
			["미확인", "unknown"],
			["안녕하세요", "done"],
		]);
		const pending = request("진행 중");
		const claimed = await claim(db, {
			ownerId: OWNER,
			requestId: crypto.randomUUID(),
			request: pending,
			key: comboKey(pending, "studio"),
			usage: { unit: "credit", amount: 4 },
			kind: "studio",
		});
		expect(claimed.kind).toBe("claimed");
		if (claimed.kind !== "claimed") return;
		await expect(me.studioDelete({ id: claimed.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await me.studioDelete({ id: done.id })).toEqual({ deleted: true });
		await expect(
			me.studioAudio({ id: done.id, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("32MiB를 넘는 오디오는 audio_too_large이고 기록은 실패, 사용 이력은 그대로다", async () => {
		synthesize.mockResolvedValueOnce(new Uint8Array(STUDIO_AUDIO_MAX + 1));
		await expect(create()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "audio_too_large" },
		});
		expect((await rows()).map((row) => row.status)).toEqual(["failed"]);
		expect(await used()).toMatchObject({ useCount: 0 });
	});

	it("결과 저장에 실패하면 처리 여부 미확인으로 알리고 사용 이력은 올리지 않는다('스펙과 다른 점' 4)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let failWrites = false;
		const writeFailingDb = new Proxy(db, {
			get(target, key, receiver) {
				if (failWrites && key === "update")
					return () => {
						throw new Error("update");
					};
				return Reflect.get(target, key, receiver);
			},
		}) as Context["db"];
		synthesize.mockImplementationOnce(async () => {
			failWrites = true;
			return MP3;
		});
		await expect(
			as(OWNER, { db: writeFailingDb }).studioCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { reason: "unknown_outcome" },
		});
		expect(await used()).toMatchObject({ useCount: 0 });
		expect((await rows()).map((row) => row.status)).toEqual(["pending"]);
	});
});
```

- [ ] **Step 2: 실패하는 테스트를 쓴다(격리)**

```ts
// packages/api/src/routers/studio.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers/index";
import { emptyVoice } from "../providers/list";
import { DEFAULT_SETTINGS } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `studio-iso-a-${Date.now()}`;
const B = `studio-iso-b-${Date.now()}`;
const synthesize = vi.fn(async () => new Uint8Array([0xff, 0xfb, 0x90, 0x64]));
const providers: Providers = { typecast: { checkStatus: vi.fn(), synthesize } };
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers } as Context,
	});
const request = {
	provider: "typecast" as const,
	voiceId: "tc_0001",
	text: "안녕하세요",
	settings: DEFAULT_SETTINGS.typecast,
};
const create = (ownerId: string) =>
	as(ownerId).studioCreate({ requestId: crypto.randomUUID(), request });
const keep = (ownerId: string) =>
	db.insert(savedVoice).values({
		ownerId,
		provider: "typecast",
		voiceId: "tc_0001",
		source: "public",
		voice: { ...emptyVoice("typecast", "public"), voiceId: "tc_0001", name: "민지" },
	});
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

// 소유자 없음은 DB를 쓰지 않아 skipIf 밖에서 늘 돈다(계획 리뷰 E4)
describe("작업실 소유자 없음(AC13)", () => {
	beforeEach(() => synthesize.mockClear());

	it("소유자가 없으면 다섯 프로시저 모두 UNAUTHORIZED이고 DB 접근·공급자 0회", async () => {
		dbTouches = 0;
		const none = as(null, failingDb);
		const id = crypto.randomUUID();
		const unauthorized = { code: "UNAUTHORIZED" };
		await expect(
			none.studioCreate({ requestId: id, request }),
		).rejects.toMatchObject(unauthorized);
		await expect(none.studioFind(request)).rejects.toMatchObject(unauthorized);
		await expect(none.studioList()).rejects.toMatchObject(unauthorized);
		await expect(none.studioAudio({ id, part: 0 })).rejects.toMatchObject(
			unauthorized,
		);
		await expect(none.studioDelete({ id })).rejects.toMatchObject(unauthorized);
		expect(dbTouches).toBe(0);
		expect(synthesize).not.toHaveBeenCalled();
	});
});

describe.skipIf(!url)("작업실 소유자 격리(AC13)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		synthesize.mockClear();
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(savedVoice);
		await db.$client.end();
	});

	it("A의 결과는 B가 찾기·목록·조각·지우기로 닿지 않고 A의 행은 그대로다", async () => {
		await keep(A);
		const made = await create(A);
		expect(await as(B).studioFind(request)).toBeNull();
		expect(await as(B).studioList()).toEqual([]);
		await expect(
			as(B).studioAudio({ id: made.id, part: 0 }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(as(B).studioDelete({ id: made.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect((await as(A).studioList()).map((item) => item.id)).toEqual([made.id]);
		expect((await as(A).studioAudio({ id: made.id, part: 0 })).size).toBe(4);
	});

	it("B가 A만 담은 성우로 만들면 voice_unavailable이고 공급자 0회(T8 보안 메모)", async () => {
		await keep(A);
		await expect(create(B)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "voice_unavailable" },
		});
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("같은 성우를 둘 다 담았으면 각자 만든 것만 자기 사용 이력에 센다", async () => {
		await keep(A);
		await keep(B);
		await create(B);
		const counts = await db
			.select({ ownerId: savedVoice.ownerId, useCount: savedVoice.useCount })
			.from(savedVoice);
		expect(
			Object.fromEntries(counts.map((row) => [row.ownerId, row.useCount])),
		).toEqual({ [A]: 0, [B]: 1 });
	});

});
```

`packages/api/src/rpc-file.test.ts`에 `import { STUDIO_PART_BYTES } from "./providers/trial-options";`를 더하고 `describe` 안에 더한다.

```ts
	it("작업실 조각(3MiB File 하나)도 multipart 바이너리이고 본문이 배포 응답 상한 4.5MB 안이다(T9 스펙 2절)", async () => {
		const chunk = new Uint8Array(STUDIO_PART_BYTES).map((_, i) => i % 251);
		const partRouter = {
			part: os
				.output(z.file())
				.handler(
					() => new File([chunk], "studio.mp3", { type: "audio/mpeg" }),
				),
		};
		const handler = new RPCHandler(partRouter, {
			plugins: [new SimpleCsrfProtectionHandlerPlugin()],
		});
		let size = 0;
		const link = new RPCLink({
			url: "http://127.0.0.1:3001/api/rpc",
			plugins: [new SimpleCsrfProtectionLinkPlugin()],
			fetch: async (request) => {
				const { response } = await handler.handle(request, {
					prefix: "/api/rpc",
					context: {},
				});
				if (!response) return new Response("Not found", { status: 404 });
				size = (await response.clone().arrayBuffer()).byteLength;
				return response;
			},
		});
		const client: RouterClient<typeof partRouter> = createORPCClient(link);
		const part = await client.part();
		expect(size).toBeGreaterThan(STUDIO_PART_BYTES);
		expect(size).toBeLessThan(4_500_000);
		expect(
			Buffer.from(await part.arrayBuffer()).equals(Buffer.from(chunk)),
		).toBe(true);
	});
```

(위 `url`은 문자열일 뿐이고 `fetch`가 메모리 안 핸들러로 보낸다. 개발 서버로 요청이 가지 않는다. 기존 테스트와 같다.)

- [ ] **Step 3: 실패를 확인한다**

Run: `source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/studio.test.ts src/routers/studio.isolation.test.ts src/rpc-file.test.ts`
Expected: FAIL — `me.studioCreate is not a function`(라우터 없음). rpc-file 새 테스트는 통과한다(설치본 동작 고정).

- [ ] **Step 4: 보관함 출력에 사용 이력을 더한다**

`packages/api/src/saved-voice-contract.ts`의 `savedVoiceSchema` 끝에 더한다.

```ts
	// 사용 이력(T9): 작업실 생성이 성공한 최근 시각(ISO)과 횟수. 작업실 성우 고르기가 정렬과 '최근 사용 3일 전 · 12회'에 쓴다
	lastUsedAt: z.iso.datetime().nullable(),
	useCount: z.number().int().nonnegative(),
```

`packages/api/src/routers/saved-voice.ts` `listOf`의 `rows.map` 결과에 `unavailable: row.unavailable,` 바로 아래로 더한다.

```ts
			lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
			useCount: row.useCount,
```

`apps/web/src/components/saved-voices.test.ts`의 `saved()` 고정값에 `classificationIds: [],` 바로 아래로 더한다.

```ts
	lastUsedAt: null,
	useCount: 0,
```

- [ ] **Step 5: 라우터를 쓴다**

```ts
// packages/api/src/routers/studio.ts
import { ORPCError } from "@orpc/server";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { logFailure, STUDIO_TIMEOUT_MS, trialError } from "../providers/errors";
import type { TrialAudio, TrialErrorData } from "../providers/trial-contract";
import { estimate, STUDIO_AUDIO_MAX } from "../providers/trial-options";
import {
	type StudioResult,
	studioAudioInputSchema,
	studioCreateInputSchema,
	studioItemSchema,
	studioRequestSchema,
	studioResultSchema,
} from "../studio-contract";
import {
	audioPart,
	audioTypeOf,
	claim,
	comboKey,
	complete,
	findStudio,
	listStudio,
	recordUse,
	remove,
	replay,
	replayStudio,
	saveLate,
	settle,
	sweep,
	withStorage,
} from "../trial";
import { cooldownOf, guard, recordCooldown } from "../voice-cache";

const PREFIX = "[studio]";
// 이번 작업실은 Typecast만 만든다(스펙 1절). T10이 다른 공급자를 붙인다
const PROVIDER = "typecast";

// 선점이 같은 요청 id에 걸린 경우(동시 재전송)의 재생. 그 행은 사실상 진행 중이라 오디오가 없다(앞 요청이 그 사이 끝난 아주 짧은 경우만 오디오를 읽는다).
// 보통의 재전송은 replayStudio가 길이만 읽는다(계획 리뷰 P4·E3)
const resultOf = (audio: TrialAudio): StudioResult => ({
	id: audio.id,
	createdAt: audio.createdAt,
	usage: audio.usage,
	bytes: audio.audio.size,
});

// 서버 성우 검사(T9 스펙 2절, 로드맵 T8 보안 메모): 이 소유자가 담은 Typecast 성우이고 현재 이용 불가가 아니어야 한다.
// 클라이언트가 보낸 voice id를 믿지 않는다. 담은 성우는 소유자 조건으로만 찾는다(prokit-api 불변식 3, tts-provider 클론 보이스 절)
async function usableVoice(
	db: Context["db"],
	ownerId: string,
	voiceId: string,
) {
	const [row] = await db
		.select({ id: savedVoice.id })
		.from(savedVoice)
		.where(
			and(
				eq(savedVoice.ownerId, ownerId),
				eq(savedVoice.provider, PROVIDER),
				eq(savedVoice.voiceId, voiceId),
				eq(savedVoice.unavailable, false),
			),
		)
		.limit(1);
	return row !== undefined;
}

// 음성 작업실(T9 스펙 3절). 크레딧을 쓰는 길은 studioCreate 하나다. 나머지는 DB만 본다
export const studioRouter = {
	studioCreate: protectedProcedure
		.input(studioCreateInputSchema)
		.output(studioResultSchema)
		.handler(async ({ input: { requestId, request }, context }) => {
			const { db, ownerId } = context;
			const synthesize = context.providers?.typecast?.synthesize;
			if (!synthesize) throw trialError(PROVIDER, "no_key");
			const key = comboKey(request, "studio");
			// 같은 요청 id(두 번 누름·재전송)는 성우 검사·대기 시각보다 먼저 그 행을 돌려준다(T5 순서, tts-provider)
			const existing = await withStorage(PROVIDER, () =>
				replayStudio(db, ownerId, requestId, key),
			);
			if (existing) return existing;
			const usable = await withStorage(PROVIDER, () =>
				usableVoice(db, ownerId, request.voiceId),
			);
			if (!usable) throw trialError(PROVIDER, "voice_unavailable");
			// 대기 시각 표를 읽지 못하면 부르지 않는다(로드맵 T5 메모)
			const until = await withStorage(PROVIDER, () =>
				cooldownOf(db, PROVIDER, new Date()),
			);
			if (until)
				throw trialError(PROVIDER, "rate_limit", {
					retryAt: until.toISOString(),
				});
			const usage = estimate(request);
			const claimed = await withStorage(PROVIDER, () =>
				claim(db, { ownerId, requestId, request, key, usage, kind: "studio" }),
			);
			if (claimed.kind === "existing")
				return resultOf(replay(PROVIDER, claimed.row));
			// 끊긴 요청의 결과 약속(onLate). 콜백 안에서 채우므로 객체 칸에 둔다(지역 변수는 타입 좁히기가 콜백 대입을 보지 못한다)
			const late: { result?: Promise<Uint8Array> } = {};
			let audio: Uint8Array;
			try {
				audio = await synthesize(request, {
					timeoutMs: STUDIO_TIMEOUT_MS,
					onLate: (result) => {
						late.result = result;
					},
				});
				if (audio.byteLength > STUDIO_AUDIO_MAX) {
					throw trialError(PROVIDER, "provider_input", {
						providerCode: "audio_too_large",
					});
				}
			} catch (error) {
				// runTrial이 모든 실패를 사유 있는 ORPCError로 바꾼다. 아닌 예외는 응답을 받았는지 모르므로 처리 여부 미확인이다(T5와 같다)
				if (!(error instanceof ORPCError))
					logFailure(`${PREFIX} ${PROVIDER} 생성 실패`, error, []);
				const failure =
					error instanceof ORPCError
						? error
						: trialError(PROVIDER, "unknown_outcome");
				const data = failure.data as Partial<TrialErrorData> | undefined;
				const reason = data?.reason ?? "provider_error";
				await guard(
					"실패 기록",
					() =>
						settle(
							db,
							ownerId,
							claimed.id,
							reason === "unknown_outcome" ? "unknown" : "failed",
							reason,
						),
					PREFIX,
				);
				const retryAt = data?.retryAt;
				if (reason === "rate_limit" && retryAt) {
					await guard(
						"대기 쓰기",
						() => recordCooldown(db, PROVIDER, new Date(retryAt)),
						PREFIX,
					);
				}
				// 미확인을 적은 뒤에 늦은 결과를 받는다(먼저 오면 미확인 쓰기가 완료를 덮는다). 기다리지 않는다.
				// shortcut: 끊긴 Typecast 요청은 응답까지(최대 300초) 뒤에서 돌지만 기록이 미확인이라 동시 1건에 들지 않는다.
				// 그동안 새 생성을 받으면 공급자 요청이 둘 겹칠 수 있다(계획 리뷰 P8). 다중 사용자·배포(T10·T15 메모) 때 미확인 뒤 막을 시간을 정한다
				if (late.result)
					void saveLate(db, ownerId, claimed.id, request.voiceId, late.result);
				throw failure;
			}
			// 저장하지 못하면 화면이 조각을 받을 수 없다. 출력에 오디오가 없어 T5처럼 돌려줄 수 없으므로 처리 여부 미확인으로 알린다('스펙과 다른 점' 4)
			const saved = await guard(
				"완료 기록",
				async () => {
					await complete(db, ownerId, claimed.id, audio, audioTypeOf(PROVIDER));
					return true;
				},
				PREFIX,
			);
			if (!saved) {
				await guard(
					"미확인 기록",
					() =>
						settle(db, ownerId, claimed.id, "unknown", "unknown_outcome"),
					PREFIX,
				);
				throw trialError(PROVIDER, "unknown_outcome");
			}
			// 결과는 저장됐다. 사용 이력·정리가 실패해도 결과를 돌려준다(로그 한 줄)
			await guard("사용 이력", () => recordUse(db, ownerId, request.voiceId), PREFIX);
			await guard("정리", () => sweep(db, ownerId), PREFIX);
			return {
				id: claimed.id,
				createdAt: claimed.createdAt,
				usage,
				bytes: audio.byteLength,
			};
		}),
	// 같은 조합의 저장된 결과. 공급자를 부르지 않는다(사용 이력도 세지 않는다)
	studioFind: protectedProcedure
		.input(studioRequestSchema)
		.output(studioResultSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(PROVIDER, () =>
				findStudio(context.db, context.ownerId, comboKey(input, "studio")),
			),
		),
	studioList: protectedProcedure
		.output(z.array(studioItemSchema))
		.handler(({ context }) =>
			withStorage(PROVIDER, () => listStudio(context.db, context.ownerId)),
		),
	// 오디오 조각 하나(multipart File, 3MiB 이하). 0번 조각이 보관을 30일 뒤로 늘린다
	studioAudio: protectedProcedure
		.input(studioAudioInputSchema)
		.output(z.file())
		.handler(({ input, context }) =>
			withStorage(undefined, () =>
				audioPart(context.db, context.ownerId, input.id, input.part),
			),
		),
	studioDelete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ input, context }) => ({
			deleted: await withStorage(undefined, () =>
				remove(context.db, context.ownerId, input.id, "studio"),
			),
		})),
};
```

`packages/api/src/routers/index.ts`에 import와 등록을 더한다(T8 프리셋 아래).

```ts
import { studioRouter } from "./studio";
```

```ts
	// 프리셋 여섯 프로시저(T8)
	...presetRouter,
	// 음성 작업실 다섯 프로시저(T9)
	...studioRouter,
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm exec biome check --write packages/api/src/routers/studio.ts packages/api/src/routers/studio.test.ts packages/api/src/routers/studio.isolation.test.ts packages/api/src/routers/index.ts packages/api/src/saved-voice-contract.ts packages/api/src/routers/saved-voice.ts packages/api/src/rpc-file.test.ts apps/web/src/components/saved-voices.test.ts && source .superpowers/sdd/T09-studio-typecast-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test && pnpm --filter @tts-pilot-app/api check-types && pnpm --filter web check-types && pnpm --filter web test`
Expected: 전체 PASS(새 테스트 20개: 기능 15, 격리 4, rpc-file 1. skipped 0). DB 없이 도는 셋(DB 실패 storage, 소유자 없음, rpc-file)은 `TEST_DATABASE_URL` 없이도 통과한다. T5·T7·T8 라우터 테스트 그대로(보관함 출력은 `toMatchObject`라 두 칸이 늘어도 통과). check-types 둘 다 exit 0.

- [ ] **Step 7: security 리뷰 (코디네이터, 대조표 37행)**

코디네이터가 더한 37행(`providers/`가 `authPaths`, 성우 검사는 권한 판정)이다. Task 4 diff로 `prokit-reviewer(security)`를 부르고 focus는 '대조표 행과 태스크'의 37행 줄이다. `tts-provider`를 읽게 한다.

---
### Task 5: 화면 순수 함수 (`studio-view.ts`, `confirmCopy`, `castingLoadView`)

**Files:**
- Create: `apps/web/src/lib/studio-view.ts`
- Test: `apps/web/src/lib/studio-view.test.ts`
- Modify: `apps/web/src/lib/trial-view.ts`(`confirmCopy`), Test: `apps/web/src/lib/trial-view.test.ts`
- Modify: `apps/web/src/lib/preset-view.ts`(`LoadView`, `fixedNote`, `castingLoadView`, `loadNotes`가 `fixedNote`를 쓴다), Test: `apps/web/src/lib/preset-view.test.ts`

**Interfaces:**
- Consumes: Task 2 값(`STUDIO_TEXT_MAX`, `partsOf`), 타입(`SavedVoice`의 두 칸, `StudioItem`), T5 `requestOf`·`presetsOf`·`emotionLabel`·`resultWhen`·`usageText`·`trialProblemText`, T8 `presetSettingsOf`·`settingChanges`·`changeLine`·`loadChanges`·`loadNotes`·`settingsOnly`·`PRESET_TEXT`.
- Produces(`studio-view.ts`):
  - `STUDIO_TEXT`(문구 초안, 브리프가 확정), `EMOTION_NOTE: Record<EmotionValue, string>`(초안)
  - `type TypecastRequest = Extract<TrialRequest, { provider: "typecast" }>`, `studioRequestOf(voice, text, all): TypecastRequest`
  - `scriptCount(text): number`, `countText(text): string`
  - `studioBlock({ voice, text, retryAt }): string | null`
  - `type EmotionValue = "smart" | EmotionPreset`, `emotionBadges(voice, model)`, `pressedEmotion(settings)`, `emotionPatch(model, value)`, `emotionMark(settings): string | null`
  - `pickableVoices(items)`, `savedOf(items, voiceId)`, `usageLine(item, now)`, `voiceNameOf(items, voiceId)`
  - `downloadName(voiceName, text, createdAt)`, `firstLine(text)`, `studioResultLine(item, voiceName, now)`
  - `SCRIPT_KEY`, `SETUP_KEY`, `type Setup`, `readScript(raw)`, `readSetup(raw)`, `setupText(setup)`, `typecastSettingsOf(raw)`
  - `fetchAudio(bytes, part)`
  - `usablePresetVoice(preset)`, `studioLoadView(current, all, preset): LoadView`, `channelDefaultOf(presets, channelId)`
  - `studioProblemText(problem)`, `createFailureOf(error): TrialProblem`(생성의 사유 없는 실패 → 처리 여부 미확인, 처리 전 거절 `BAD_REQUEST`·`UNAUTHORIZED`·`FORBIDDEN`은 그대로, 계획 리뷰 E1·재리뷰 R4)
  - `unknownRefetch(items, now): number | false`, `LATE_REFETCH_MS`(미확인 줄 다시 받기, 계획 리뷰 P2)
  - `shownCaption(voiceName, text)`, `type ResultTarget`, `resultTarget(result, voiceName, text)`(플레이어에 올릴 대상, 디자인 리뷰 D3·계획 리뷰 E6)
- Produces(`trial-view.ts`): `confirmCopy(kind: "trial" | "studio", request): { title; action; textLabel; text }`
- Produces(`preset-view.ts`): `type LoadView = { lead: string | null; changes: string[]; notes: { text: string; warn: boolean }[] }`, `fixedNote(preset)`, `castingLoadView(voice, all, preset, now?)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// apps/web/src/lib/studio-view.test.ts
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	STUDIO_PART_BYTES,
	STUDIO_TEXT_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { ORPCError } from "@orpc/client";
import type { StudioItem } from "@tts-pilot-app/api/studio-contract";
import { describe, expect, it } from "vitest";

import {
	channelDefaultOf,
	countText,
	createFailureOf,
	downloadName,
	EMOTION_NOTE,
	emotionBadges,
	emotionMark,
	emotionPatch,
	fetchAudio,
	firstLine,
	pickableVoices,
	pressedEmotion,
	readScript,
	readSetup,
	resultTarget,
	STUDIO_TEXT,
	savedOf,
	setupText,
	studioBlock,
	studioLoadView,
	studioProblemText,
	studioResultLine,
	unknownRefetch,
	usageLine,
	voiceNameOf,
} from "./studio-view";

const voice = (over: Partial<Voice> = {}): Voice =>
	({
		provider: "typecast",
		source: "public",
		voiceId: "tc_1",
		name: "민지",
		models: [],
		...over,
	}) as Voice;
const saved = (over: Partial<SavedVoice> = {}): SavedVoice => ({
	id: "s1",
	voice: voice(),
	favorite: false,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
	...over,
});
const preset = (over: Partial<Preset> = {}): Preset =>
	({
		id: "p1",
		name: "경제 내레이션",
		provider: "typecast",
		settings: DEFAULT_SETTINGS.typecast,
		savedVoiceId: "s1",
		voice: voice(),
		unavailable: false,
		channelId: null,
		channelDefault: false,
		fixed: [],
		...over,
	}) as Preset;
const v30 = voice({
	models: [{ model: "ssfm-v30", emotions: ["normal", "happy", "tonemid"] }],
} as Partial<Voice>);
const v21Only = voice({
	voiceId: "tc_2",
	name: "준호",
	models: [{ model: "ssfm-v21", emotions: ["normal", "sad", "whisper"] }],
} as Partial<Voice>);
const NOW = Date.parse("2026-10-20T05:07:30.000Z");
const NOW_ISO = new Date(NOW).toISOString();

describe("대본과 막는 이유(스펙 4절)", () => {
	it("글자 수는 NFC·앞뒤 공백 정리 뒤 코드 포인트, 천 단위 쉼표", () => {
		expect(countText("가".repeat(1234))).toBe("1,234 / 2,000자");
		expect(countText("  가  ")).toBe("1 / 2,000자");
		expect(countText("한".normalize("NFD"))).toBe("1 / 2,000자");
	});
	it("막는 이유 순서: 성우 → 빈 대본 → 2,000자 초과 → 이용 불가 → 대기 시각", () => {
		const later = new Date(NOW + 60_000).toISOString();
		expect(studioBlock({ voice: null, text: "", retryAt: later })).toBe(
			"성우를 골라 주세요",
		);
		expect(studioBlock({ voice: saved(), text: " \n ", retryAt: later })).toBe(
			"대본을 먼저 써 주세요",
		);
		expect(
			studioBlock({
				voice: saved({ unavailable: true }),
				text: "가".repeat(STUDIO_TEXT_MAX + 1),
				retryAt: later,
			}),
		).toBe("2,000자를 넘었어요(2,001자)");
		expect(
			studioBlock({ voice: saved({ unavailable: true }), text: "가", retryAt: later }),
		).toBe("현재 이용 불가 성우예요");
		expect(studioBlock({ voice: saved(), text: "가", retryAt: later })).toMatch(
			/이후에 다시 만들 수 있어요$/,
		);
		expect(
			studioBlock({
				voice: saved(),
				text: "가".repeat(STUDIO_TEXT_MAX),
				retryAt: null,
			}),
		).toBeNull();
	});
});

describe("감정 팔레트(스펙 2절 Typecast)", () => {
	it("v30은 '자동' + 성우 감정과 요청 열거형의 교집합, v21은 '자동' 없이 v21 감정만", () => {
		expect(emotionBadges(v30, "ssfm-v30")).toEqual([
			{ value: "smart", label: "자동" },
			{ value: "normal", label: "기본" },
			{ value: "happy", label: "기쁨" },
		]);
		expect(emotionBadges(v21Only, "ssfm-v21")).toEqual([
			{ value: "normal", label: "기본" },
			{ value: "sad", label: "슬픔" },
		]);
		// 성우 정보가 없으면 그 모델의 전체 목록
		expect(emotionBadges(voice(), "ssfm-v30").map((b) => b.value)).toEqual([
			"smart",
			"normal",
			"happy",
			"sad",
			"angry",
			"whisper",
			"toneup",
			"tonedown",
		]);
		expect(Object.keys(EMOTION_NOTE)).toHaveLength(8);
	});
	it("눌린 뱃지와 누를 때 바뀌는 설정", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		expect(pressedEmotion(tc)).toBe("smart");
		expect(pressedEmotion({ ...tc, emotion: "preset", preset: "happy" })).toBe(
			"happy",
		);
		expect(pressedEmotion({ ...tc, model: "ssfm-v21", preset: "sad" })).toBe(
			"sad",
		);
		expect(emotionPatch("ssfm-v30", "smart")).toEqual({ emotion: "smart" });
		expect(emotionPatch("ssfm-v30", "happy")).toEqual({
			emotion: "preset",
			preset: "happy",
		});
		expect(emotionPatch("ssfm-v21", "sad")).toEqual({ preset: "sad" });
	});
	it("카드 감정 표식은 기본값과 다를 때만(v30 '자동'·v21 '기본'이면 없음)", () => {
		const tc = DEFAULT_SETTINGS.typecast;
		expect(emotionMark(tc)).toBeNull();
		expect(emotionMark({ ...tc, emotion: "preset", preset: "happy" })).toBe(
			"기쁨",
		);
		expect(emotionMark({ ...tc, emotion: "preset", preset: "normal" })).toBe(
			"기본",
		);
		expect(emotionMark({ ...tc, model: "ssfm-v21", preset: "normal" })).toBeNull();
		expect(emotionMark({ ...tc, model: "ssfm-v21", preset: "sad" })).toBe(
			"슬픔",
		);
	});
});

describe("성우 고르기 창(스펙 4절)", () => {
	it("담은 Typecast 성우만, 최근 사용 순 → 즐겨찾기 → 담은 순(목록 순서). 이용 불가도 보인다", () => {
		const day = 24 * 60 * 60 * 1000;
		const items = [
			saved({ id: "a", favorite: true }),
			saved({ id: "b" }),
			saved({ id: "c", lastUsedAt: new Date(NOW - 3 * day).toISOString() }),
			saved({
				id: "d",
				lastUsedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
				unavailable: true,
			}),
			saved({ id: "e", voice: voice({ provider: "elevenlabs" }) }),
			saved({ id: "f", favorite: true }),
		];
		expect(pickableVoices(items).map((item) => item.id)).toEqual([
			"d",
			"c",
			"a",
			"f",
			"b",
		]);
	});
	it("사용 이력 줄과 이름 찾기", () => {
		const item = saved({
			lastUsedAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(),
			useCount: 12,
		});
		expect(usageLine(item, new Date(NOW))).toBe("최근 사용 3일 전 · 12회");
		expect(usageLine(saved(), new Date(NOW))).toBeNull();
		expect(voiceNameOf([saved()], "tc_1")).toBe("민지");
		expect(voiceNameOf([saved()], "tc_gone")).toBe("tc_gone");
	});
});

describe("파일 이름과 결과 줄(스펙 2절)", () => {
	it("{성우}_{대본 앞 20자}_{YYYYMMDD-HHmm}.mp3, 못 쓰는 글자·공백·줄바꿈은 _, 시각은 한국 시간", () => {
		expect(
			downloadName(
				"민지",
				" 안녕하세요, 오늘은\n경제 뉴스: 금리 / 환율 이야기",
				"2026-10-20T05:07:30.000Z",
			),
		).toBe("민지_안녕하세요,_오늘은_경제_뉴스__금리_20261020-1407.mp3");
		expect(downloadName("A/B 성우", "가", "2026-10-20T15:30:00.000Z")).toBe(
			"A_B_성우_가_20261021-0030.mp3",
		);
		expect(downloadName("민지", "😀".repeat(25), "2026-01-01T00:00:00Z")).toBe(
			`민지_${"😀".repeat(20)}_20260101-0900.mp3`,
		);
	});
	it("첫 줄과 결과 줄", () => {
		const item = {
			id: "r1",
			createdAt: new Date(NOW - 3 * 60_000).toISOString(),
			status: "done",
			usage: { unit: "credit", amount: 1234 },
			bytes: 10,
			request: {
				provider: "typecast",
				voiceId: "tc_1",
				text: "  첫 줄\n둘째 줄",
				settings: DEFAULT_SETTINGS.typecast,
			},
		} as StudioItem;
		expect(firstLine(item.request.text)).toBe("첫 줄");
		expect(studioResultLine(item, "민지", new Date(NOW))).toBe(
			"3분 전 · 민지 · 약 1,234크레딧",
		);
	});
});

describe("임시 작업 읽기(스펙 2절, client-localstorage-schema)", () => {
	const empty = {
		voiceId: null,
		channelId: null,
		settings: DEFAULT_SETTINGS.typecast,
	};
	it("깨진 값·모양이 다른 값은 처음 값", () => {
		expect(readScript(null)).toBe("");
		expect(readScript("대본")).toBe("대본");
		expect(readSetup(null)).toEqual(empty);
		expect(readSetup("{깨짐")).toEqual(empty);
		expect(readSetup("[1,2]")).toEqual(empty);
		expect(
			readSetup(JSON.stringify({ voiceId: "../x", channelId: "abc", settings: "x" })),
		).toEqual(empty);
	});
	it("설정은 칸마다 계약 범위로 검사해 쓸 수 없는 칸만 처음 값(v21 감정 포함), 왕복은 그대로", () => {
		const channelId = "6f1c2b9e-1d2c-4f3a-9b8e-0a1b2c3d4e5f";
		const setup = readSetup(
			JSON.stringify({
				voiceId: "tc_2",
				channelId,
				settings: {
					model: "ssfm-v21",
					emotion: "smart",
					preset: "whisper",
					intensity: 1.5,
					language: "kor",
					tempo: 1.234,
					pitch: 99,
					volume: "x",
					extra: 1,
				},
			}),
		);
		expect(setup).toEqual({
			voiceId: "tc_2",
			channelId,
			settings: {
				model: "ssfm-v21",
				emotion: "smart",
				preset: "normal",
				intensity: 1.5,
				language: "kor",
				tempo: 1.25,
				pitch: 0,
				volume: 100,
			},
		});
		expect(readSetup(setupText(setup))).toEqual(setup);
	});
	it("성우는 담은 Typecast 성우 목록에 있을 때만 되살린다", () => {
		const items = [saved(), saved({ id: "s2", voice: voice({ provider: "elevenlabs", voiceId: "el1" }) })];
		expect(savedOf(items, "tc_1")?.id).toBe("s1");
		expect(savedOf(items, "el1")).toBeNull();
		expect(savedOf(items, "tc_gone")).toBeNull();
		expect(savedOf(items, null)).toBeNull();
	});
});

describe("나눠 받기(스펙 2절 A안)", () => {
	it("조각 수만큼 0번부터 차례로 받아 MP3 하나로 합친다", async () => {
		const asked: number[] = [];
		const blob = await fetchAudio(STUDIO_PART_BYTES + 2, async (part) => {
			asked.push(part);
			return new Blob([
				new Uint8Array(part === 0 ? STUDIO_PART_BYTES : 2).fill(part + 1),
			]);
		});
		expect(asked).toEqual([0, 1]);
		expect(blob.size).toBe(STUDIO_PART_BYTES + 2);
		expect(blob.type).toBe("audio/mpeg");
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect([
			bytes[0],
			bytes[STUDIO_PART_BYTES - 1],
			bytes[STUDIO_PART_BYTES],
		]).toEqual([1, 1, 2]);
	});
	it("생성 결과를 올릴 대상: 파일 이름·캡션은 그때의 성우·대본이고, 조각 수만큼 받아 원래 길이가 된다(계획 리뷰 E6, 디자인 리뷰 D3)", async () => {
		const target = resultTarget(
			{
				id: "r1",
				bytes: STUDIO_PART_BYTES * 2 + 1,
				createdAt: "2026-10-20T05:07:30.000Z",
			},
			"민지",
			"안녕하세요\n둘째 줄",
		);
		expect(target).toEqual({
			id: "r1",
			bytes: STUDIO_PART_BYTES * 2 + 1,
			fileName: "민지_안녕하세요_둘째_줄_20261020-1407.mp3",
			caption: "민지 · 안녕하세요…",
		});
		expect(
			resultTarget({ id: "r2", bytes: 1, createdAt: NOW_ISO }, "민지", "짧은 대본")
				.caption,
		).toBe("민지 · 짧은 대본");
		expect(
			resultTarget({ id: "r3", bytes: 1, createdAt: NOW_ISO }, "민지", "가".repeat(25))
				.caption,
		).toBe(`민지 · ${"가".repeat(20)}…`);
		const asked: number[] = [];
		const blob = await fetchAudio(target.bytes, async (part) => {
			asked.push(part);
			return new Blob([new Uint8Array(part < 2 ? STUDIO_PART_BYTES : 1)]);
		});
		expect(asked).toEqual([0, 1, 2]);
		expect(blob.size).toBe(target.bytes);
	});
	it("만든 지 6분 안의 미확인 줄이 있으면 15초마다 다시 받고, 없으면 멈춘다(스펙 8절 7번, 계획 리뷰 P2)", () => {
		const at = (minutes: number, status: "done" | "unknown") => ({
			status,
			createdAt: new Date(NOW - minutes * 60_000).toISOString(),
		});
		expect(unknownRefetch(undefined, NOW)).toBe(false);
		expect(unknownRefetch([at(1, "done")], NOW)).toBe(false);
		expect(unknownRefetch([at(1, "done"), at(3, "unknown")], NOW)).toBe(15_000);
		expect(unknownRefetch([at(7, "unknown")], NOW)).toBe(false);
	});
});

describe("작업실 프리셋 불러오기(스펙 2절: 성우와 설정을 함께)", () => {
	it("성우가 바뀌면 첫 줄이 성우, 이어서 그 성우에서 듣는 설정의 바뀌는 값", () => {
		const view = studioLoadView(
			voice(),
			DEFAULT_SETTINGS,
			preset({
				voice: v21Only,
				settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.1 },
			}),
		);
		expect(view).toEqual({
			lead: null,
			// v21만 있는 성우에는 감정 모드 칸이 없고 감정은 양쪽 모두 '기본'이라 바뀌는 값에 없다(settingChanges는 다음 모델이 쓰는 칸만 본다)
			changes: [
				"성우 민지 → 준호",
				"모델 ssfm-v30 → ssfm-v21",
				"속도 1.00배 → 1.10배",
			],
			notes: [
				{ text: "모델 ssfm-v30 → ssfm-v21 (이 성우에서 쓰는 값)", warn: false },
			],
		});
	});
	it("성우를 고르기 전이면 '성우 없음 → …'", () => {
		expect(studioLoadView(null, DEFAULT_SETTINGS, preset()).changes).toEqual([
			"성우 없음 → 민지",
		]);
	});
	it("프리셋 성우가 비었거나 이용 불가면 성우 칸을 비운다고 알린다(자동 대체 없음)", () => {
		for (const gone of [preset({ voice: null, savedVoiceId: null }), preset({ unavailable: true })])
			expect(studioLoadView(voice(), DEFAULT_SETTINGS, gone)).toMatchObject({
				changes: ["성우 민지 → 성우 없음"],
				notes: [{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true }],
			});
		expect(
			studioLoadView(voice(), DEFAULT_SETTINGS, preset({ voice: null, fixed: ["preset"] }))
				.notes,
		).toEqual([
			{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true },
			{ text: "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 감정", warn: true },
		]);
	});
	it("채널 기본 프리셋은 그 채널의 Typecast 기본만", () => {
		const list = [
			preset({ id: "a", channelId: "c1", channelDefault: false }),
			preset({ id: "b", channelId: "c1", channelDefault: true }),
			preset({ id: "c", provider: "elevenlabs", channelId: "c2", channelDefault: true }),
		];
		expect(channelDefaultOf(list, "c1")?.id).toBe("b");
		expect(channelDefaultOf(list, "c2")).toBeNull();
		expect(channelDefaultOf(list, "c3")).toBeNull();
	});
});

describe("오류 문구(스펙 5절)", () => {
	const problem = (reason: string, extra: { retryAt?: string; providerCode?: string } = {}) =>
		({ reason, retryAt: extra.retryAt ?? null, providerCode: extra.providerCode ?? null }) as Parameters<typeof studioProblemText>[0];
	it("작업실 문구: 성우 거절·진행 중·너무 큰 결과·저장소·대기 시각·알 수 없는 실패", () => {
		expect(studioProblemText(problem("voice_unavailable")).text).toBe(
			"이 성우는 보관함에 없거나 현재 이용 불가예요. 성우를 다시 골라 주세요",
		);
		expect(studioProblemText(problem("in_progress")).text).toBe(
			"다른 생성이 진행 중이에요",
		);
		expect(
			studioProblemText(problem("provider_input", { providerCode: "audio_too_large" }))
				.text,
		).toBe("결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요");
		expect(studioProblemText(problem("storage")).text).toBe(
			"지금은 음성을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
		);
		expect(
			studioProblemText(
				problem("rate_limit", { retryAt: new Date(NOW + 60_000).toISOString() }),
			).text,
		).toMatch(/이후에 다시 만들 수 있어요$/);
		expect(studioProblemText(problem("unexpected")).text).toBe(
			"음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
		);
	});
	it("나머지는 T5 문구(키 문제는 '연결 상태 보기')", () => {
		expect(studioProblemText(problem("no_key")).connections).toBe(true);
		expect(studioProblemText(problem("unknown_outcome")).text).toMatch(
			/^처리 여부를 확인하지 못했어요/,
		);
		expect(studioProblemText(problem("quota")).text).toBe(
			"크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요",
		);
	});
	it("생성의 사유 없는 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)는 처리 여부 미확인 문구다(크레딧이 쓰였을 수 있다, 계획 리뷰 E1)", () => {
		expect(createFailureOf(new TypeError("Failed to fetch")).reason).toBe(
			"unknown_outcome",
		);
		expect(
			createFailureOf(new ORPCError("INTERNAL_SERVER_ERROR")).reason,
		).toBe("unknown_outcome");
		expect(
			createFailureOf(
				new ORPCError("BAD_REQUEST", {
					data: { provider: "typecast", reason: "voice_unavailable" },
				}),
			).reason,
		).toBe("voice_unavailable");
		expect(
			studioProblemText(createFailureOf(new TypeError("Failed to fetch"))).text,
		).toMatch(/^처리 여부를 확인하지 못했어요/);
		// 조각 받기 실패 알림(생성 오류 줄과 따로, '스펙과 다른 점' 17)
		expect(STUDIO_TEXT.receiveFailed).toBe(
			"결과를 받지 못했어요. 이전 결과에서 다시 열어 주세요",
		);
	});
	it("서버가 처리 전에 거절한 실패(입력 검사·CSRF·소유자 없음)는 미확인으로 바꾸지 않는다(공급자에 닿지 않았다, 계획 재리뷰 R4·N3)", () => {
		for (const code of ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"])
			expect(
				createFailureOf(new ORPCError(code, { data: { issues: [] } })).reason,
			).toBe("unexpected");
		expect(
			studioProblemText(createFailureOf(new ORPCError("BAD_REQUEST"))).text,
		).toBe("음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요");
	});
});
```

`apps/web/src/lib/trial-view.test.ts` import에 `confirmCopy`를 더하고 파일 끝에 더한다.

```ts
describe("확인 창 글(T9)", () => {
	const typecast = (text: string): TrialRequest => ({
		provider: "typecast",
		voiceId: "tc_1",
		text,
		settings: DEFAULT_SETTINGS.typecast,
	});
	it("캐스팅은 T5 그대로: 공급자 비용 문구와 문장 전체", () => {
		expect(confirmCopy("trial", typecast(" 안녕하세요 "))).toEqual({
			title: costCopy("typecast").title,
			action: costCopy("typecast").action,
			textLabel: "문장",
			text: " 안녕하세요 ",
		});
		const gemini = {
			provider: "gemini",
			voiceId: "kore",
			text: "가",
			settings: DEFAULT_SETTINGS.gemini,
		} as TrialRequest;
		expect(confirmCopy("trial", gemini)).toMatchObject({
			title: costCopy("gemini").title,
			action: costCopy("gemini").action,
		});
	});
	it("작업실은 대본 앞 100자와 총 글자 수, '크레딧 쓰고 만들기'(스펙 4절)", () => {
		expect(confirmCopy("studio", typecast(`  ${"가".repeat(150)} `))).toEqual({
			title: "크레딧을 써서 음성을 만들까요?",
			action: "크레딧 쓰고 만들기",
			textLabel: "대본",
			text: `${"가".repeat(100)}… (총 150자)`,
		});
		expect(confirmCopy("studio", typecast("짧은 대본")).text).toBe(
			"짧은 대본 (총 5자)",
		);
	});
});
```

`apps/web/src/lib/preset-view.test.ts` import에 `castingLoadView`·`fixedNote`를 더하고 `describe("불러오기 창 알림 줄", …)` 끝에 더한다.

```ts
	it("처음 값으로 바꾼 칸 알림은 따로도 만든다(작업실이 쓴다)", () => {
		expect(fixedNote(preset({}))).toBeNull();
		expect(fixedNote(preset({ fixed: ["model", "preset"] }))).toEqual({
			text: "지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: 모델, 감정",
			warn: true,
		});
	});
	it("캐스팅 불러오기 창은 T8 그대로: 성우가 다르면 '설정만' 첫 줄, 이 성우에서 듣는 값의 바뀌는 값, 알림 줄(회귀)", () => {
		expect(castingLoadView(voice({}), DEFAULT_SETTINGS, preset({}))).toEqual({
			lead: null,
			changes: [],
			notes: [],
		});
		const other = voice({ voiceId: "tc_2", name: "준호" });
		const tempo = preset({
			settings: { ...DEFAULT_SETTINGS.typecast, tempo: 1.1 },
		});
		expect(castingLoadView(other, DEFAULT_SETTINGS, tempo)).toEqual({
			lead: settingsOnly("준호"),
			changes: loadChanges(other, DEFAULT_SETTINGS, tempo.settings).map(
				changeLine,
			),
			notes: loadNotes(other, tempo),
		});
		expect(castingLoadView(other, DEFAULT_SETTINGS, tempo).changes).toEqual([
			"속도 1.00배 → 1.10배",
		]);
	});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter web test src/lib/studio-view.test.ts src/lib/trial-view.test.ts src/lib/preset-view.test.ts`
Expected: FAIL — `./studio-view` 없음, `confirmCopy`·`castingLoadView`·`fixedNote` 없음

- [ ] **Step 3: `preset-view.ts`에 불러오기 창 내용을 더한다**

`loadNotes` 바로 위에 `fixedNote`를 두고, `loadNotes` 끝의 `if (preset.fixed.length > 0) { … }` 블록을 두 줄로 바꾼다.

```ts
// 처음 값으로 바꾼 칸 알림(불러오기 창 알림 줄 끝, 경고 문법). 캐스팅·작업실이 함께 쓴다
export function fixedNote(
	preset: Pick<Preset, "provider" | "fixed">,
): { text: string; warn: boolean } | null {
	if (preset.fixed.length === 0) return null;
	const defaults = DEFAULT_SETTINGS[preset.provider] as Values;
	const labels = preset.fixed.map(
		(field) => optionText(preset.provider, field, defaults[field] ?? "").label,
	);
	return {
		text: `지금 쓸 수 없는 값이 있어 처음 값으로 불러와요: ${labels.join(", ")}`,
		warn: true,
	};
}
```

```ts
	const fixed = fixedNote(preset);
	if (fixed) notes.push(fixed);
	return notes;
```

`loadNotes` 바로 아래에 더한다.

```ts
// 불러오기 창 내용(T9). lead는 설명 첫 줄(없으면 null), changes는 '바뀌는 값' 줄, notes는 알림 줄이다.
// 프리셋 메뉴가 화면마다 다른 비교를 받는다(캐스팅: 설정만, 작업실: 성우와 설정, preset-menu.tsx PresetHost)
export type LoadView = {
	lead: string | null;
	changes: string[];
	notes: { text: string; warn: boolean }[];
};

// 캐스팅 불러오기 창: 설정만 불러온다(성우는 그대로, T8). 비교와 알림은 지금 성우에서 듣는 값으로 한다
export function castingLoadView(
	voice: Voice,
	all: SettingsOf,
	preset: Preset,
	now = Date.now(),
): LoadView {
	return {
		lead: preset.voice?.voiceId !== voice.voiceId ? settingsOnly(voice.name) : null,
		changes: loadChanges(voice, all, preset.settings).map(changeLine),
		notes: loadNotes(voice, preset, now),
	};
}
```

- [ ] **Step 4: `trial-view.ts`에 확인 창 글을 더한다**

trial-options import에 `codePoints`를 더하고 `costCopy` 바로 아래에 더한다.

```ts
// 확인 창의 제목·버튼·글 줄(T9). 캐스팅은 T5 그대로(공급자 비용 문구, 문장 전체), 작업실은 대본 앞 100자와 총 글자 수(T9 스펙 4절).
// 작업실은 이번에 Typecast(크레딧)만이다. T10이 다른 공급자를 붙일 때 비용 문구를 공급자로 나눈다
export function confirmCopy(kind: "trial" | "studio", request: TrialRequest) {
	const cost = costCopy(request.provider);
	if (kind === "trial")
		return {
			title: cost.title,
			action: cost.action,
			textLabel: "문장",
			text: request.text,
		};
	const text = normalizeText(request.text);
	const count = codePoints(text);
	return {
		title: "크레딧을 써서 음성을 만들까요?",
		action: "크레딧 쓰고 만들기",
		textLabel: "대본",
		text: `${[...text].slice(0, 100).join("")}${count > 100 ? "…" : ""} (총 ${plain.format(count)}자)`,
	};
}
```

- [ ] **Step 5: `studio-view.ts`를 쓴다**

```ts
// apps/web/src/lib/studio-view.ts
import { ORPCError } from "@orpc/client";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	EMOTION_PRESETS,
	type EmotionPreset,
	normalizeText,
	partsOf,
	RANGES,
	type Range,
	type SettingsOf,
	STUDIO_TEXT_MAX,
	snap,
	type TrialRequest,
	TYPECAST_MODELS,
	type TypecastModel,
	type TypecastSettings,
	V21_PRESETS,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type {
	StudioItem,
	StudioResult,
} from "@tts-pilot-app/api/studio-contract";

import {
	changeLine,
	fixedNote,
	type LoadView,
	loadNotes,
	PRESET_TEXT,
	presetSettingsOf,
	settingChanges,
} from "./preset-view";
import {
	emotionLabel,
	presetsOf,
	requestOf,
	LANGUAGE_LABEL,
	resultWhen,
	type TrialProblem,
	trialFailureOf,
	trialProblemText,
	usageText,
} from "./trial-view";
import { plain, retryTime } from "./voice-view";

// 음성 작업실의 화면 문구와 계산(T9 스펙 4·5절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문구는 브리프(18행 docs/briefs/studio.md)가 정본이고 브리프가 이긴다. 아래는 초안이다. 이름 뒤에 조사를 붙이지 않는다

export const STUDIO_TEXT = {
	title: "음성 작업실",
	description: "대본과 담아 둔 Typecast 성우로 한국어 음성을 만들고 내려받아요.",
	loopback: "이 주소에서는 음성 작업실을 쓸 수 없어요",
	channel: "채널",
	noChannel: "채널 없음",
	toClasses: "채널·분류에서 만들기",
	paragraph: "문단 1",
	pickVoice: "성우 고르기",
	pickVoiceDescription: "성우 보관함에 담은 Typecast 성우예요. 최근에 쓴 성우가 위에 와요.",
	noVoices: "담은 Typecast 성우가 없어요",
	toCasting: "성우 캐스팅에서 담기",
	voicesFailed: "담은 성우를 불러오지 못했어요",
	reload: "다시 불러오기",
	settings: "설정",
	settingsNeedVoice: "성우를 고르면 설정을 바꿀 수 있어요",
	reset: "처음 값으로",
	palette: "감정",
	scriptLabel: "대본",
	scriptPlaceholder: "음성으로 만들 대본을 써 주세요",
	barLabel: "음성 만들기와 결과",
	noResult: "음성을 만들면 여기서 들을 수 있어요",
	download: "내려받기",
	make: "음성 만들기",
	openSaved: "저장된 결과 열기",
	making: "만드는 중",
	makingStatus: "음성을 만드는 중이에요",
	made: "음성을 만들었어요",
	opened: "저장된 결과를 열었어요",
	savedCost: "저장된 결과 · 크레딧 0",
	// 예상 사용량 줄 앞말(T5 패널과 같은 말)
	costPrefix: "새로 만들 때",
	connections: "연결 상태 보기",
	results: "이전 결과",
	resultsEmpty: "아직 만든 음성이 없어요",
	resultsFailed: "이전 결과를 불러오지 못했어요",
	play: "재생",
	remove: "지우기",
	removeQuestion: "이 결과를 지울까요?",
	removeDetail: "앱에 저장한 오디오만 지워요. 공급자 사용 기록은 그대로예요.",
	removing: "지우는 중이에요",
	removed: "결과를 지웠어요.",
	unknownBadge: "처리 여부 미확인",
	unknownNote: "늦게 도착하면 여기서 완료로 바뀌어요",
	presetVoiceUnusable: "프리셋의 성우를 쓸 수 없어요. 성우를 골라 주세요",
	voiceRejected:
		"이 성우는 보관함에 없거나 현재 이용 불가예요. 성우를 다시 골라 주세요",
	inProgress: "다른 생성이 진행 중이에요",
	// 조각 받기 실패(찾을 수 없음 말고). 생성 오류 줄과 따로 알림으로 보인다(계획 '스펙과 다른 점' 17)
	receiveFailed: "결과를 받지 못했어요. 이전 결과에서 다시 열어 주세요",
	receiving: "결과를 받는 중이에요",
} as const;

// 감정 팔레트 뱃지 값: Typecast 자동 감정(v30만) 또는 요청 열거형의 감정
export type EmotionValue = "smart" | EmotionPreset;
// 뱃지 설명(초안, 브리프가 확정). 감정 태그 리서치 2절의 Typecast 감정 설명을 짧게 옮겼다
export const EMOTION_NOTE: Record<EmotionValue, string> = {
	smart: "대본 내용을 보고 감정을 정해요",
	normal: "차분한 기본 톤으로 읽어요",
	happy: "밝고 들뜬 톤으로 읽어요",
	sad: "가라앉은 톤으로 읽어요",
	angry: "격앙된 톤으로 읽어요",
	whisper: "속삭이듯 읽어요",
	toneup: "높은 음역으로 읽어요",
	tonedown: "낮은 음역으로 읽어요",
};

export type TypecastRequest = Extract<TrialRequest, { provider: "typecast" }>;
// 이 성우에서 실제로 보내는 요청(T5 requestOf의 성우 맞춤 뒤). 작업실 성우는 늘 Typecast다
export const studioRequestOf = (voice: Voice, text: string, all: SettingsOf) =>
	requestOf(voice, text, all) as TypecastRequest;

// 대본 글자 수는 서버와 같게 NFC·앞뒤 공백 정리 뒤 코드 포인트로 센다
export const scriptCount = (text: string) => codePoints(normalizeText(text));
export const countText = (text: string) =>
	`${plain.format(scriptCount(text))} / ${plain.format(STUDIO_TEXT_MAX)}자`;

// '음성 만들기'를 막는 이유(스펙 4절 순서). 없으면 null. 2,000자를 넘어도 입력은 막지 않는다(붙여 넣은 글이 잘리지 않게).
// '다른 생성이 진행 중이에요'는 서버 거절 뒤 오류 줄이다(계획 '스펙과 다른 점' 6)
export function studioBlock(input: {
	voice: Pick<SavedVoice, "unavailable"> | null;
	text: string;
	retryAt: string | null;
}): string | null {
	if (!input.voice) return "성우를 골라 주세요";
	const count = scriptCount(input.text);
	if (count === 0) return "대본을 먼저 써 주세요";
	if (count > STUDIO_TEXT_MAX)
		return `${plain.format(STUDIO_TEXT_MAX)}자를 넘었어요(${plain.format(count)}자)`;
	if (input.voice.unavailable) return "현재 이용 불가 성우예요";
	if (input.retryAt)
		return `${retryTime(input.retryAt)} 이후에 다시 만들 수 있어요`;
	return null;
}

// 감정 팔레트(스펙 2절): '자동'(v30만) + 그 성우·모델의 emotions와 요청 열거형의 교집합(presetsOf)
export function emotionBadges(
	voice: Voice,
	model: TypecastModel,
): { value: EmotionValue; label: string }[] {
	const presets = presetsOf(voice, model).map((preset) => ({
		value: preset,
		label: emotionLabel(preset),
	}));
	return model === "ssfm-v30"
		? [{ value: "smart", label: "자동" }, ...presets]
		: presets;
}
// 지금 눌린 뱃지. settings는 성우 맞춤 뒤 요청의 설정이다(v21은 늘 직접 감정)
export const pressedEmotion = (settings: TypecastSettings): EmotionValue =>
	settings.model === "ssfm-v30" && settings.emotion === "smart"
		? "smart"
		: settings.preset;
// 뱃지를 누르면 바뀌는 칸. 대본에 글자를 넣지 않는다(Typecast는 요청 필드로 감정을 받는다)
export function emotionPatch(
	model: TypecastModel,
	value: EmotionValue,
): Partial<TypecastSettings> {
	if (value === "smart") return { emotion: "smart" };
	return model === "ssfm-v30"
		? { emotion: "preset", preset: value }
		: { preset: value };
}
// 카드 머리줄의 감정 표식: 기본값과 다를 때만(v30 '자동', v21 '기본'이면 없음)
export function emotionMark(settings: TypecastSettings): string | null {
	const pressed = pressedEmotion(settings);
	if (pressed === "smart") return null;
	if (settings.model === "ssfm-v21" && pressed === "normal") return null;
	return emotionLabel(pressed);
}

// 고를 수 있는 성우: 담은 Typecast 성우를 최근 사용 순 → 즐겨찾기 → 담은 순(서버 목록 순서)으로. 이용 불가도 보인다(흐리게, 못 고름)
export function pickableVoices(items: readonly SavedVoice[]): SavedVoice[] {
	const lastUsed = (item: SavedVoice) =>
		item.lastUsedAt ? Date.parse(item.lastUsedAt) : 0;
	// sort는 안정 정렬이라 같으면 담은 순이 남는다
	return items
		.filter((item) => item.voice.provider === "typecast")
		.sort(
			(a, b) =>
				lastUsed(b) - lastUsed(a) || Number(b.favorite) - Number(a.favorite),
		);
}
// 임시 작업의 성우 id를 담은 Typecast 성우에서만 되살린다(스펙 2절 '임시 작업')
export const savedOf = (
	items: readonly SavedVoice[],
	voiceId: string | null,
): SavedVoice | null =>
	items.find(
		(item) =>
			item.voice.provider === "typecast" && item.voice.voiceId === voiceId,
	) ?? null;
export const usageLine = (item: SavedVoice, now: Date) =>
	item.lastUsedAt
		? `최근 사용 ${resultWhen(item.lastUsedAt, now)} · ${plain.format(item.useCount)}회`
		: null;
// 이전 결과의 성우 이름. 보관함에서 빠졌으면 성우 id를 보인다
export const voiceNameOf = (items: readonly SavedVoice[], voiceId: string) =>
	savedOf(items, voiceId)?.voice.name ?? voiceId;

// 파일 이름에 못 쓰는 글자(Windows·macOS 공통). 제어 문자와 공백(줄바꿈 포함)도 '_'로 바꾼다
const BAD_NAME = new Set([..."\\/:*?\"<>|"]);
const SPACE = /\s/u;
const safeName = (text: string) =>
	[...text]
		.map((char) => {
			const code = char.codePointAt(0) ?? 0;
			return BAD_NAME.has(char) || SPACE.test(char) || code < 0x20 || code === 0x7f
				? "_"
				: char;
		})
		.join("");
const two = (value: number) => String(value).padStart(2, "0");
// 결과를 만든 시각의 한국 시간(일광 절약 없음)
function kstStamp(iso: string): string {
	const at = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
	return `${at.getUTCFullYear()}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}-${two(at.getUTCHours())}${two(at.getUTCMinutes())}`;
}
// 내려받는 파일 이름(스펙 2절): {성우 이름}_{대본 앞 20자}_{YYYYMMDD-HHmm}.mp3
export const downloadName = (voiceName: string, text: string, createdAt: string) =>
	`${safeName(voiceName)}_${safeName([...normalizeText(text)].slice(0, 20).join(""))}_${kstStamp(createdAt)}.mp3`;

export const firstLine = (text: string) =>
	normalizeText(text).split("\n")[0] ?? "";
// 이전 결과 둘째 줄: 언제 · 성우 · 크레딧(추정)
export const studioResultLine = (
	item: Pick<StudioItem, "createdAt" | "usage">,
	voiceName: string,
	now: Date,
) => `${resultWhen(item.createdAt, now)} · ${voiceName} · ${usageText(item.usage)}`;

// 이 브라우저의 임시 작업(스펙 2절). 키에 판을 붙이고 필요한 칸만 둔다(client-localstorage-schema). 대본은 입력마다, 나머지는 바뀔 때 쓴다
export const SCRIPT_KEY = "tts-pilot:studio:v1:script";
export const SETUP_KEY = "tts-pilot:studio:v1:setup";
export type Setup = {
	voiceId: string | null;
	channelId: string | null;
	settings: TypecastSettings;
};
export const readScript = (raw: string | null) => raw ?? "";

const pick = <T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);
const inRange = (value: unknown, range: Range) =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	value >= range.min &&
	value <= range.max
		? snap(value, range)
		: range.default;
// 저장해 둔 Typecast 설정을 계약 범위로 칸마다 검사한다(T5 typecastSettingsSchema와 같은 규칙). apps/web은 zod를 쓰지 않아 trial-options의 값 상수로 본다.
// 쓸 수 없는 칸만 처음 값으로 바꾸고 나머지는 지킨다. 프리셋을 읽는 T8 readSettings와 같은 뜻이다(사용자가 고친 값을 한 칸 때문에 모두 잃지 않게, 계획 리뷰 P10).
// 감정 모드 두 값은 trial-options에 상수가 없어(계약의 z.enum) 글자로 둔다. 언어는 화면 이름표(LANGUAGE_LABEL)의 열쇠를 쓴다
export function typecastSettingsOf(raw: unknown): TypecastSettings {
	const stored =
		raw !== null && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const base = DEFAULT_SETTINGS.typecast;
	const ranges = RANGES.typecast;
	const model = pick(stored.model, TYPECAST_MODELS, base.model);
	const preset = pick(stored.preset, EMOTION_PRESETS, base.preset);
	return {
		model,
		emotion: pick(stored.emotion, ["smart", "preset"] as const, base.emotion),
		// v21은 넷만 받는다(계약 refine)
		preset:
			model === "ssfm-v30" || V21_PRESETS.includes(preset) ? preset : base.preset,
		intensity: inRange(stored.intensity, ranges.intensity),
		language: pick(
			stored.language,
			Object.keys(LANGUAGE_LABEL) as (keyof typeof LANGUAGE_LABEL)[],
			base.language,
		),
		tempo: inRange(stored.tempo, ranges.tempo),
		pitch: inRange(stored.pitch, ranges.pitch),
		volume: inRange(stored.volume, ranges.volume),
	};
}
const VOICE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 깨진 값·모양이 다른 값은 처음 값이다. 성우는 담은 성우 목록과 다시 맞춘다(savedOf), 채널은 채널 목록과 맞춘다(화면)
export function readSetup(raw: string | null): Setup {
	let stored: Record<string, unknown> = {};
	try {
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
			stored = parsed as Record<string, unknown>;
	} catch {
		// 깨진 값은 처음 값으로 시작한다
	}
	return {
		voiceId:
			typeof stored.voiceId === "string" && VOICE_ID.test(stored.voiceId)
				? stored.voiceId
				: null,
		channelId:
			typeof stored.channelId === "string" && UUID.test(stored.channelId)
				? stored.channelId
				: null,
		settings: typecastSettingsOf(stored.settings),
	};
}
export const setupText = (setup: Setup) => JSON.stringify(setup);

// 결과 오디오를 조각으로 받아 하나로 합친다(스펙 2절 A안). 0번 조각이 보관을 늘리므로 먼저 받고, 서버 부담을 줄이려 차례로 받는다
export async function fetchAudio(
	bytes: number,
	part: (index: number) => Promise<Blob>,
): Promise<Blob> {
	const parts: Blob[] = [];
	for (let index = 0; index < partsOf(bytes); index += 1)
		parts.push(await part(index));
	return new Blob(parts, { type: "audio/mpeg" });
}

// 프리셋의 성우를 쓸 수 있으면 그 성우(담은 Typecast 성우이고 이용 불가 아님). 아니면 null(자동 대체 없음, 스펙 2절)
export const usablePresetVoice = (
	preset: Pick<Preset, "provider" | "voice" | "unavailable">,
) =>
	preset.provider === "typecast" && preset.voice && !preset.unavailable
		? preset.voice
		: null;
const voiceChange = (from: Voice | null, to: Voice | null) =>
	from
		? `성우 ${from.name} → ${to?.name ?? PRESET_TEXT.noVoice}`
		: `${PRESET_TEXT.noVoice} → ${to?.name ?? PRESET_TEXT.noVoice}`;
// 작업실 불러오기 창(스펙 2절): 성우와 설정을 함께 바꾼다. 바뀌는 값은 성우 줄 → 불러온 뒤 그 성우에서 듣는 설정.
// 프리셋 성우를 쓸 수 없으면 성우 칸을 비운다고 알린다(자동 대체 없음). '설정만' 첫 줄은 없다
export function studioLoadView(
	current: Voice | null,
	all: SettingsOf,
	preset: Preset,
): LoadView {
	const target = usablePresetVoice(preset);
	const next = { ...all, typecast: preset.settings } as SettingsOf;
	const from = current ? presetSettingsOf(current, all).settings : all.typecast;
	const to = target ? presetSettingsOf(target, next).settings : preset.settings;
	const fixed = fixedNote(preset);
	return {
		lead: null,
		changes: [
			...(current?.voiceId === target?.voiceId
				? []
				: [voiceChange(current, target)]),
			...settingChanges("typecast", from, to).map(changeLine),
		],
		notes: target
			? loadNotes(target, preset)
			: [
					{ text: STUDIO_TEXT.presetVoiceUnusable, warn: true },
					...(fixed ? [fixed] : []),
				],
	};
}
// 서버가 처리 전에 거절한 코드(입력 검사, CSRF, 소유자 없음). 공급자에 닿지 않았다(계획 재리뷰 R4·N3)
const BEFORE_PROVIDER = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"]);
// 생성 실패의 화면 사유. 서버 사유가 없는 실패(응답 전 끊김, 유료 호출 뒤 서버 오류)는 크레딧이 쓰였을 수 있어 처리 여부 미확인으로 본다
// (스펙 5절 '응답 상태를 받지 못함', tts-provider, 계획 리뷰 E1). 처리 전 거절은 그대로 '만들지 못했어요'다. 찾기·조각 받기는 유료가 아니라 이 함수를 쓰지 않는다
export function createFailureOf(error: unknown): TrialProblem {
	const problem = trialFailureOf(error);
	if (problem.reason !== "unexpected") return problem;
	return error instanceof ORPCError && BEFORE_PROVIDER.has(error.code)
		? problem
		: { ...problem, reason: "unknown_outcome" };
}

// 늦은 결과가 보고 있는 화면에서도 완료로 바뀌게(스펙 8절 7번, 계획 '스펙과 다른 점' 16). 만든 지 6분 안의 미확인 줄이 있으면 15초마다 다시 받는다.
// 요청 300초 뒤 결과는 오지 않는다(Node fetch 응답 머리 300초, 저장 여유 1분)
const LATE_WINDOW_MS = 6 * 60 * 1000;
export const LATE_REFETCH_MS = 15_000;
export function unknownRefetch(
	items: readonly Pick<StudioItem, "status" | "createdAt">[] | undefined,
	now: number,
): number | false {
	return items?.some(
		(item) =>
			item.status === "unknown" &&
			now - Date.parse(item.createdAt) < LATE_WINDOW_MS,
	)
		? LATE_REFETCH_MS
		: false;
}

// 플레이어에 올린 결과의 캡션·접근 이름(디자인 리뷰 D3 초안): {성우} · {대본 첫 줄 앞 20자}(뒤가 더 있으면 …)
export function shownCaption(voiceName: string, text: string): string {
	const all = [...normalizeText(text)];
	const head = [...firstLine(text)].slice(0, 20);
	return `${voiceName} · ${head.join("")}${all.length > head.length ? "…" : ""}`;
}
// 생성·찾기·이전 결과를 플레이어에 올릴 대상. 파일 이름·캡션은 그때의 성우 이름과 대본으로 정한다(생성 성공 → 조각 → 플레이어의 순수 부분, 계획 리뷰 E6)
export type ResultTarget = {
	id: string;
	bytes: number;
	fileName: string;
	caption: string;
};
export const resultTarget = (
	result: Pick<StudioResult, "id" | "bytes" | "createdAt">,
	voiceName: string,
	text: string,
): ResultTarget => ({
	id: result.id,
	bytes: result.bytes,
	fileName: downloadName(voiceName, text, result.createdAt),
	caption: shownCaption(voiceName, text),
});

// 그 채널의 기본 프리셋(Typecast만, 계획 '스펙과 다른 점' 12)
export const channelDefaultOf = (
	presets: readonly Preset[],
	channelId: string,
): Preset | null =>
	presets.find(
		(preset) =>
			preset.provider === "typecast" &&
			preset.channelId === channelId &&
			preset.channelDefault,
	) ?? null;

// 작업실 오류 줄(스펙 5절). 작업실 문구가 따로 있는 사유만 여기서, 나머지는 T5 문구다
export function studioProblemText(problem: TrialProblem): {
	text: string;
	connections: boolean;
} {
	switch (problem.reason) {
		case "voice_unavailable":
			return { text: STUDIO_TEXT.voiceRejected, connections: false };
		case "in_progress":
			return { text: STUDIO_TEXT.inProgress, connections: false };
		case "storage":
			return {
				text: "지금은 음성을 만들 수 없어요. 잠시 뒤 다시 해 주세요",
				connections: false,
			};
		case "rate_limit":
			if (problem.retryAt)
				return {
					text: `${retryTime(problem.retryAt)} 이후에 다시 만들 수 있어요`,
					connections: false,
				};
			break;
		case "provider_input":
			if (problem.providerCode === "audio_too_large")
				return {
					text: "결과 오디오가 너무 커요. 대본을 줄이거나 속도를 올려 주세요",
					connections: false,
				};
			break;
		case "unexpected":
			return {
				text: "음성을 만들지 못했어요. 잠시 뒤 다시 해 주세요",
				connections: false,
			};
	}
	return trialProblemText("typecast", problem);
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm exec biome check --write apps/web/src/lib/studio-view.ts apps/web/src/lib/studio-view.test.ts apps/web/src/lib/trial-view.ts apps/web/src/lib/trial-view.test.ts apps/web/src/lib/preset-view.ts apps/web/src/lib/preset-view.test.ts && pnpm --filter web test src/lib/ && pnpm --filter web check-types`
Expected: PASS(새 테스트 27개: 작업실 23, 확인 창 2, 프리셋 2. 기존 `loadNotes`·`loadChanges` 테스트가 그대로 통과해 `fixedNote` 분리의 회귀를 덮는다), check-types exit 0

---
### Task 6: 공유 컴포넌트를 작업실도 쓰게 (캐스팅 동작 그대로)

**Files:**
- Create: `apps/web/src/components/setting-fields.tsx`(옮김: `sourceItem`, `SliderRow`, `CUSTOM`, `TagControl`, `DirectionControl`, `Options`)
- Modify: `apps/web/src/components/trial-section.tsx`(57~347행을 지우고 가져온다, 캐스팅 `PresetHost`)
- Modify: `apps/web/src/components/voice-casting.tsx:52-54`(`sourceItem`을 가져온다)
- Modify: `apps/web/src/components/library-filters.tsx:27-28`(주석만: `sourceItem`이 옮겨 간 곳, 계획 리뷰 E13)
- Modify: `apps/web/src/components/trial-confirm.tsx`(`kind`)
- Modify: `apps/web/src/components/preset-menu.tsx`(`PresetHost`, `usePresetLoad`, `LoadDialog` export, `PresetMenu({ host })`, `PresetLine({ host })`)
- Modify: `apps/web/src/components/voice-conditions.tsx:268-333`(`RadioMenu` `footer`)
- Modify: `apps/web/src/components/page-header.tsx`(`actions`)

**Interfaces:**
- Consumes: Task 5 `confirmCopy`·`castingLoadView`·`LoadView`.
- Produces:
  - `Options({ voice, request, onChange, palette? })`, `sourceItem`(setting-fields.tsx)
  - `TrialConfirm({ pending, onClose, onConfirm, kind? = "trial" })`
  - `type PresetHost`, `usePresetLoad(host)`, `LoadDialog({ preset, view, openerRef, onLoad, onClose })`, `PresetMenu({ host })`, `PresetLine({ host })`
  - `RadioMenu({ …, footer? })`, `PageHeader({ title, description, actions? })`

이 태스크는 화면 동작을 바꾸지 않는다. 캐스팅은 같은 값으로 같은 문구·같은 호출을 한다(Task 5 회귀 테스트, Step 9 런타임 확인).

- [ ] **Step 1: 설정 칸을 새 파일로 옮긴다(`setting-fields.tsx`)**

파일 머리는 아래와 같다. 그 아래에 `trial-section.tsx` 57~201행(`SliderRow`·`CUSTOM`·`TagControl`·`DirectionControl`과 그 주석)을 글자 그대로 옮기고, 이어서 바꾼 `Options`를 둔다.

```tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	AIRY_LANGUAGES,
	AIRY_STYLES,
	DEFAULT_SETTINGS,
	fieldsOf,
	GEMINI_DIRECTION_MAX,
	RANGES,
	type Range,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Slider } from "@tts-pilot-app/ui/components/slider";
import { Switch } from "@tts-pilot-app/ui/components/switch";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Fragment, type ReactNode, useId, useState } from "react";

import { languageName } from "@/lib/provider-conditions";
import {
	AIRY_STYLE_LABEL,
	ELEVENLABS_TAGS,
	emotionLabel,
	FIELD_LABEL,
	FISH_TAGS,
	LANGUAGE_LABEL,
	modelOptionsOf,
	presetsOf,
	valueText,
} from "@/lib/trial-view";

import { RadioMenu } from "./voice-conditions";

// 공급자 설정 칸(T5 '내 문장 듣기'에서 옮김, T9). 캐스팅 패널과 작업실 카드가 함께 쓴다.
// 이 파일은 캐스팅 화면 모듈(voice-casting.tsx)을 가져오지 않는다(작업실 번들에 캐스팅 전체가 딸려 오지 않게, 계획 '스펙과 다른 점' 7)

// 출처 전환 칸(브리프 5절): muted 바탕 위 고른 칸은 흰 칸 + 경계선 + 굵은 글자, 나머지는 회색 보통 굵기. 감정 모드 '자동 | 직접'도 쓴다
export const sourceItem =
	"min-h-11 shrink-0 px-4 text-muted-foreground focus-visible:z-10 data-pressed:bg-card data-pressed:font-bold data-pressed:text-foreground data-pressed:ring-1 data-pressed:ring-border";
```

옮긴 뒤의 `Options`(원래 202~347행. `useTrial` 대신 `onChange`를 받고 `palette`를 더했다. `special` 함수는 글자 그대로다):

```tsx
// 그 모델이 받는 옵션만 FIELDS 표 순서로 그린다(fieldsOf). 범위가 있는 필드는 슬라이더 한 줄이고,
// 나머지 일곱(감정 모드·감정·언어·화자 증폭·말투 태그·Airy 말투·Gemini 말투 지시)만 따로 그린다(계획 리뷰 ponytail 2).
// 값을 바꾸면 onChange(바꾼 칸)를 부른다. 캐스팅은 공급자 설정, 작업실은 카드 설정이다(T9). 성우에 맞춘 보정은 요청에서만 한다.
// palette를 주면 Typecast 감정 칸(v30 '감정 모드'·'감정', v21 '감정')을 그 자리의 팔레트 하나로 바꾼다(작업실 감정 팔레트, T9 스펙 2절)
export function Options({
	voice,
	request,
	onChange,
	palette,
}: {
	voice: Voice;
	request: TrialRequest;
	onChange: (patch: Record<string, string | number | boolean>) => void;
	palette?: ReactNode;
}) {
	const speakerBoostId = useId();
	const { provider } = request;
	const values = request.settings as Record<string, string | number | boolean>;
	const defaults = DEFAULT_SETTINGS[provider] as Record<string, unknown>;
	const ranges: Partial<Record<string, Range>> = RANGES[provider];
	const set = (field: string, value: string | number | boolean) =>
		onChange({ [field]: value });
	const fields = fieldsOf(request);
	// 팔레트는 감정 칸 가운데 첫 자리 하나에 둔다(v30이면 '감정 모드' 자리, v21이면 '감정' 자리)
	const paletteAt = palette
		? fields.find((field) => field === "emotion" || field === "preset")
		: undefined;
	const special = (field: string) => {
		switch (field) {
			case "emotion":
				// '자동 | 직접'(용어집 '감정 모드', T8 '프리셋'과 겹치지 않게, 사용자 결정 U6)
				return (
					<ToggleGroup
						key={field}
						value={[String(values.emotion)]}
						onValueChange={(next) => {
							if (next[0]) set("emotion", next[0]);
						}}
						aria-label="감정 모드"
						className="bg-muted p-1"
					>
						<Toggle value="smart" className={sourceItem}>
							자동
						</Toggle>
						<Toggle value="preset" className={sourceItem}>
							직접
						</Toggle>
					</ToggleGroup>
				);
			case "preset":
				return request.provider === "typecast" ? (
					<RadioMenu
						key={field}
						label="감정"
						value={request.settings.preset}
						strong={request.settings.preset !== defaults.preset}
						options={presetsOf(voice, request.settings.model).map((preset) => ({
							value: preset,
							label: emotionLabel(preset),
						}))}
						onChange={(preset) => set("preset", preset)}
					/>
				) : null;
			case "language":
				// Typecast는 자동 감지·한국어, Airy는 한국어·영어(T7.5 스펙 2절)
				return (
					<RadioMenu
						key={field}
						label="언어"
						value={String(values.language)}
						strong={values.language !== defaults.language}
						options={
							request.provider === "airy"
								? AIRY_LANGUAGES.map((language) => ({
										value: language,
										label: languageName(language),
									}))
								: (["auto", "kor"] as const).map((language) => ({
										value: language,
										label: LANGUAGE_LABEL[language],
									}))
						}
						onChange={(language) => set("language", language)}
					/>
				);
			case "style":
				// Airy 말투. ElevenLabs 스타일은 범위가 있어 위 슬라이더로 그려지고 여기 오지 않는다(Review Focus 4)
				return request.provider === "airy" ? (
					<RadioMenu
						key={field}
						label="말투"
						value={request.settings.style}
						strong={request.settings.style !== DEFAULT_SETTINGS.airy.style}
						options={AIRY_STYLES.map((style) => ({
							value: style,
							label: AIRY_STYLE_LABEL[style],
						}))}
						onChange={(style) => set("style", style)}
					/>
				) : null;
			case "speakerBoost":
				return (
					<div
						key={field}
						className="flex min-h-11 items-center justify-between gap-3 text-sm"
					>
						<span id={speakerBoostId}>{FIELD_LABEL.speakerBoost}</span>
						<Switch
							aria-labelledby={speakerBoostId}
							checked={values.speakerBoost === true}
							onCheckedChange={(on) => set("speakerBoost", on)}
						/>
					</div>
				);
			case "tag":
				return (
					<TagControl
						key={field}
						tags={provider === "elevenlabs" ? ELEVENLABS_TAGS : FISH_TAGS}
						value={String(values.tag)}
						onChange={(tag) => set("tag", tag)}
					/>
				);
			case "direction":
				return (
					<DirectionControl
						key={field}
						value={String(values.direction)}
						onChange={(direction) => set("direction", direction)}
					/>
				);
			default:
				return null;
		}
	};
	return (
		<>
			<RadioMenu
				label="모델"
				value={String(values.model)}
				strong={values.model !== defaults.model}
				options={modelOptionsOf(voice)}
				onChange={(model) => set("model", model)}
			/>
			{fields.map((field) => {
				if (palette && (field === "emotion" || field === "preset"))
					return field === paletteAt ? (
						<Fragment key="palette">{palette}</Fragment>
					) : null;
				const range = ranges[field];
				return range ? (
					<SliderRow
						key={field}
						field={field}
						value={Number(values[field])}
						range={range}
						onChange={(value) => set(field, value)}
					/>
				) : (
					special(field)
				);
			})}
		</>
	);
}
```

- [ ] **Step 2: 캐스팅이 옮긴 것을 가져온다**

`apps/web/src/components/voice-casting.tsx`의 52~54행(`// 출처 전환 칸 …` 주석과 `export const sourceItem = …`)을 지우고 import에 `import { sourceItem } from "./setting-fields";`를 더한다.

`apps/web/src/components/library-filters.tsx` 27~28행 주석을 바꾼다(코드는 그대로).

```tsx
// setting-fields.tsx의 sourceItem(출처 전환 칸)을 옮겨 적었다. 안쪽 여백이 달라(px-4 → px-3 md:px-4, 보기 칸 넷이 좁은 폭에 들어가게, 브리프 7절 D9) 가져오지 않는다
```

`apps/web/src/components/trial-section.tsx`의 57~347행을 지우고, import 머리를 아래로 바꾼다.

```tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	estimate,
} from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Info, Square } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { castingLoadView } from "@/lib/preset-view";
import {
	costCopy,
	dataNote,
	requestOf,
	trialAriaLabel,
	trialProblemText,
	usageText,
} from "@/lib/trial-view";
import { voiceKey } from "@/lib/voice-view";

import { type PresetHost, PresetLine, PresetMenu } from "./preset-menu";
import { Options } from "./setting-fields";
import { useRate } from "./trial-confirm";
import { useShownText, useTrial } from "./trial-provider";
import { useTrialItems } from "./trial-results";
import { lockedButton } from "./voice-problem";
```

`TrialSection` 안에서 `const [resetKey, setResetKey] = useState(0);` 바로 아래에 캐스팅의 프리셋 상태를 둔다.

```tsx
	// 캐스팅 프리셋 메뉴의 화면 상태: 불러오기는 설정만 바꾼다(T8 그대로). 바꾼 뒤 옵션 칸을 다시 그린다
	const host: PresetHost = {
		provider: voice.provider,
		voice,
		settings: trial.settings,
		loaded: trial.loaded(voice.provider),
		apply: (preset) => {
			trial.loadPreset(preset.provider, {
				id: preset.id,
				settings: preset.settings,
			});
			setResetKey((current) => current + 1);
		},
		loadView: (preset) => castingLoadView(voice, trial.settings, preset),
	};
```

세 곳을 바꾼다.

```tsx
					<PresetMenu host={host} />
```

```tsx
			<PresetLine host={host} />
```

```tsx
				<Options
					voice={voice}
					request={request}
					onChange={(patch) => trial.setSetting(voice.provider, patch)}
				/>
```

- [ ] **Step 3: 프리셋 메뉴가 화면 상태 인터페이스를 받는다(`preset-menu.tsx`)**

파일 전체를 아래로 바꾼다. 바뀐 것은 `useTrial` 대신 `PresetHost`, `usePresetLoad`로 뺀 불러오기, `LoadDialog`가 비교 내용(`view`)을 받는 것, 성우가 없으면 저장·덮어쓰기가 꺼지는 것이다. 메뉴 모양·문구·포커스는 그대로다.

```tsx
"use client";

import type { Preset } from "@tts-pilot-app/api/preset-contract";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import type { SettingsOf } from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tts-pilot-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tts-pilot-app/ui/components/dropdown-menu";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ArrowRight, Check, ChevronDown, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { byName, MESSAGES } from "@/lib/classes-view";
import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	changeLine,
	type LoadView,
	loadedMessage,
	loadedName,
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

import { DialogButtons } from "./class-form-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { PresetFormDialog } from "./preset-form-dialog";
import { useCreatePreset, useOverwritePreset, usePresetList } from "./presets";
import type { LoadedPreset } from "./trial-provider";

// 프리셋 메뉴·불러온 줄·불러오기 창이 읽고 바꾸는 화면 상태(T9 스펙 2절). 캐스팅(TrialSection)은 설정만, 작업실(StudioProvider)은
// 성우와 설정을 함께 불러온다. 같은 메뉴를 쓰고 차이는 apply·loadView가 맡는다(vercel-composition-patterns state-context-interface)
export type PresetHost = {
	provider: ProviderId;
	// 지금 성우. 작업실에서 고르기 전이면 null이고 '새 프리셋 저장'·덮어쓰기가 꺼진다
	voice: Voice | null;
	settings: SettingsOf;
	loaded: LoadedPreset | null;
	// 프리셋 값을 지금 값으로 두고 기억한 뒤 옵션 칸을 다시 그린다(저장·불러오기·덮어쓰기 뒤, T8 '스펙과 다른 점' 2)
	apply: (preset: Preset) => void;
	loadView: (preset: Preset) => LoadView;
};

type Open =
	| { kind: "save" }
	| { kind: "load"; preset: Preset }
	| { kind: "overwrite"; preset: Preset }
	| null;

// 메뉴 항목은 라디오 메뉴 항목과 같은 44px·14px·radius-6(library-filters.tsx와 같다)
const menuItem = "min-h-11 rounded-md text-sm";

// 불러오기: 다른 탭에서 지웠을 수 있어 최신 목록에서 한 번 더 찾는다(사용자 결정 2026-10-14, 스펙 S13).
// 받지 못하면 받아 둔 값으로 불러온다(설정만 바꾸므로 데이터는 상하지 않는다). 메뉴의 불러오기 창과 작업실 채널 고르기가 함께 쓴다
export function usePresetLoad(host: PresetHost) {
	const presets = usePresetList();
	return async (preset: Preset) => {
		const latest = await presets.refetch();
		const fresh = latest.data?.find((item) => item.id === preset.id);
		if (latest.isSuccess && !fresh) {
			toast.error(MESSAGES.notFound);
			return;
		}
		const chosen = fresh ?? preset;
		host.apply(chosen);
		toast.success(loadedMessage(chosen.name));
	};
}

// 불러오기 창(T8 스펙 4절): 첫 줄(캐스팅 '설정만') → 바뀌는 값 → 알림 줄. 첫 포커스는 '불러오기', 닫히면 연 버튼으로.
// 비교 내용은 화면이 준다(view, PresetHost.loadView)
export function LoadDialog({
	preset,
	view,
	openerRef,
	onLoad,
	onClose,
}: {
	preset: Preset;
	view: LoadView;
	openerRef: RefObject<HTMLElement | null>;
	onLoad: () => Promise<void>;
	onClose: () => void;
}) {
	const loadRef = useRef<HTMLButtonElement>(null);
	const [pending, setPending] = useState(false);
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
					<DialogTitle className="wrap-anywhere">
						{loadQuestion(preset.name)}
					</DialogTitle>
					{/* 설명(<p>)을 <div>로 열어 성우 안내·바뀌는 값·알림 줄을 모두 감싼다. 창을 열면 비교와 경고까지 읽힌다(덮어쓰기 확인과 같다, critique P2) */}
					<DialogDescription render={<div />} className="flex flex-col gap-4">
						{view.lead ? (
							<p className="text-popover-foreground">{view.lead}</p>
						) : null}
						<p>
							{view.changes.length > 0
								? PRESET_TEXT.changesHead
								: PRESET_TEXT.sameSettings}
						</p>
						{view.changes.length > 0 ? (
							<ul className="flex flex-col gap-1 text-popover-foreground text-sm tabular-nums">
								{view.changes.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						) : null}
						{view.notes.length > 0 ? (
							<ul className="flex flex-col gap-1 text-sm">
								{view.notes.map((note) => (
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
					</DialogDescription>
				</DialogHeader>
				<DialogButtons
					pending={pending}
					label="불러오기"
					submitRef={loadRef}
					onCancel={onClose}
					onSubmit={() => {
						if (pending) return;
						setPending(true);
						void onLoad().finally(() => setPending(false));
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

// 덮어쓰기 확인의 설명(프리셋 → 지금 화면 값). AlertDialog 설명은 <p>라 목록 대신 줄마다 block <span>이다(<ul>을 넣으면 DOM 중첩 오류).
// <br>로 이으면 보조기기가 한 문장으로 이어 읽는다(audit P2-3).
// 프리셋 성우가 비었으면 '성우 없음 → …'이다('성우'를 겹쳐 쓰지 않는다, 브리프 8절 초안과 다른 점 2)
function OverwriteDetail({
	voice,
	settings,
	preset,
}: {
	voice: Voice;
	settings: SettingsOf;
	preset: Preset;
}) {
	const lines = [
		...(preset.voice?.voiceId === voice.voiceId
			? []
			: [
					preset.voice
						? `성우 ${preset.voice.name} → ${voice.name}`
						: `${PRESET_TEXT.noVoice} → ${voice.name}`,
				]),
		...settingChanges(
			voice.provider,
			preset.settings,
			presetSettingsOf(voice, settings).settings,
		).map(changeLine),
	];
	if (lines.length === 0) return PRESET_TEXT.sameSettings;
	return lines.map((line) => (
		<span key={line} className="block">
			{line}
		</span>
	));
}

// 프리셋 메뉴(T8 스펙 4절, T9 작업실 머리). 이 공급자 프리셋 불러오기, 새로 저장, 불러온 프리셋에 덮어쓰기, 관리 화면 링크.
// 저장·덮어쓰기는 지금 화면에 보이는 값(성우 맞춤 뒤)을 보낸다(사용자 결정 2026-10-14). 저장·불러오기·덮어쓰기 뒤에는 host.apply가
// 지금 값을 프리셋 값(서버가 정리한 값)으로 두고 옵션 칸을 다시 그린다(T8 '스펙과 다른 점' 2).
// 소유자가 없으면 두 화면 모두 주소 안내라 이 메뉴는 그려지지 않는다(T8 '스펙과 다른 점' 9)
export function PresetMenu({ host }: { host: PresetHost }) {
	const presets = usePresetList();
	const create = useCreatePreset();
	const overwrite = useOverwritePreset();
	const load = usePresetLoad(host);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const statusId = useId();
	const [open, setOpen] = useState<Open>(null);
	const { provider, voice } = host;
	const mine = byName(
		(presets.data ?? []).filter((preset) => preset.provider === provider),
	);
	const loadedId = host.loaded?.id;
	const loaded = presets.data?.find((preset) => preset.id === loadedId);
	// 저장·덮어쓰기 값. 작업실에서 성우를 고르기 전이면 없다(프리셋은 성우와 함께 저장한다)
	const shown = voice ? presetSettingsOf(voice, host.settings) : null;
	// 목록 자리의 상태 줄(받아 둔 목록이 없을 때 받는 중·받지 못함, 또는 없음). 목록이 있으면 null
	const status = presets.isPending
		? "loading"
		: presets.isError && !presets.data
			? "failed"
			: mine.length === 0
				? "none"
				: null;

	return (
		<>
			<DropdownMenu
				onOpenChange={(next) => {
					// 메뉴를 열 때 목록을 다시 받는다(다른 탭의 변경, 30초 캐시)
					if (next) void presets.refetch();
				}}
			>
				<DropdownMenuTrigger
					// 보조 동작 버튼 outline(브리프 5절 머리 줄). '처음 값으로'(되돌리기)는 ghost 그대로(계획 리뷰 D1)
					render={<Button ref={triggerRef} variant="outline" size="lg" />}
				>
					{PRESET_TEXT.menu}
					<ChevronDown data-icon="inline-end" aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-72 p-1"
					// 상태 줄은 그룹 이름표(aria-hidden)라 항목이 없으면 읽히지 않는다. 포커스를 받는 메뉴의 설명으로 잇는다(ChoiceMenu 안내와 같다, 브리프 11절 결정 4)
					aria-describedby={status ? statusId : undefined}
				>
					{/* 목록만 스크롤한다. 저장·덮어쓰기·관리는 늘 보인다(계획 리뷰 D15) */}
					<DropdownMenuGroup className="max-h-80 overflow-y-auto">
						{status === "loading" ? (
							<DropdownMenuLabel
								id={statusId}
								className="flex min-h-11 items-center gap-2 text-sm"
							>
								<Spinner aria-hidden="true" />
								{PRESET_TEXT.loading}
							</DropdownMenuLabel>
						) : status === "failed" ? (
							<>
								<DropdownMenuLabel
									id={statusId}
									className="flex min-h-11 items-center text-sm text-warning"
								>
									{PRESET_TEXT.listFailed}
								</DropdownMenuLabel>
								<DropdownMenuItem
									className={menuItem}
									closeOnClick={false}
									onClick={() => void presets.refetch()}
								>
									{PRESET_TEXT.retry}
								</DropdownMenuItem>
							</>
						) : status === "none" ? (
							// 세 상태 줄은 같은 44px 높이다(받는 중 → 없음·받지 못함으로 바뀔 때 메뉴가 흔들리지 않는다)
							<DropdownMenuLabel
								id={statusId}
								className="flex min-h-11 items-center text-sm"
							>
								{PRESET_TEXT.none}
							</DropdownMenuLabel>
						) : (
							mine.map((preset) => (
								<DropdownMenuItem
									key={preset.id}
									className={cn(
										menuItem,
										"flex-col items-start gap-0.5",
										preset.id === loadedId && "pr-8",
									)}
									onClick={() => setOpen({ kind: "load", preset })}
								>
									<span className="max-w-full truncate font-bold">
										{preset.name}
									</span>
									<span className="max-w-full truncate text-muted-foreground text-sm">
										{savedVoiceLine(preset)}
									</span>
									{/* 지금 불러온 프리셋: 덮어쓰기 항목이 가리키는 것을 목록에서 맞춰 본다(라디오 항목 표시 자리와 같다, 브리프 5절) */}
									{preset.id === loadedId ? (
										<>
											<Check
												aria-hidden="true"
												className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
											/>
											<span className="sr-only">{`, ${PRESET_TEXT.loadedMark}`}</span>
										</>
									) : null}
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className={menuItem}
						disabled={!shown}
						onClick={() => setOpen({ kind: "save" })}
					>
						{PRESET_TEXT.saveNew}
					</DropdownMenuItem>
					{loaded && shown ? (
						<DropdownMenuItem
							className={menuItem}
							onClick={() => setOpen({ kind: "overwrite", preset: loaded })}
						>
							{overwriteItem(loaded.name)}
						</DropdownMenuItem>
					) : null}
					{/* 이름 고치기·복제·지우기는 관리 화면에서(계획 리뷰 D2). 화면을 떠나는 항목이라 가름선으로 나누고 링크 화살표를 붙인다(브리프 5절) */}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className={menuItem}
						render={<Link href="/presets" />}
					>
						{PRESET_TEXT.manage}
						<ArrowRight aria-hidden="true" />
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{open?.kind === "save" && voice && shown ? (
				<PresetFormDialog
					title={PRESET_TEXT.saveTitle}
					presetId={null}
					initial={{ name: "", channelId: null, channelDefault: false }}
					summary={
						<>
							<p>
								<span translate="no">{PROVIDER_LABEL[provider]}</span>
								{` · ${voice.name} · ${presetSummary(shown)}`}
							</p>
							<p>{PRESET_TEXT.saveNote}</p>
						</>
					}
					save={(values) => create.mutateAsync({ ...values, voice, ...shown })}
					onSaved={(preset) => {
						host.apply(preset);
						toast.success(savedMessage(preset.name));
					}}
					openerRef={triggerRef}
					goneFocus={() => triggerRef.current}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "load" ? (
				<LoadDialog
					preset={open.preset}
					view={host.loadView(open.preset)}
					openerRef={triggerRef}
					onLoad={async () => {
						await load(open.preset);
						setOpen(null);
					}}
					onClose={() => setOpen(null)}
				/>
			) : null}
			{open?.kind === "overwrite" && voice && shown ? (
				<ConfirmDialog
					title={overwriteQuestion(open.preset.name)}
					description={
						<OverwriteDetail
							voice={voice}
							settings={host.settings}
							preset={open.preset}
						/>
					}
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
									host.apply(preset);
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

// 칸 머리 아래 "프리셋 ‘{이름}’ · 바뀐 값 있음 · 저장할 때 성우 {이름}". 불러온 프리셋이 목록에 있을 때만(다른 탭에서 지웠으면 없다).
// 캐스팅은 설정만 불러와 같은 공급자의 다른 성우로 옮겨도 줄이 남으므로, 성우가 다르면 어느 성우의 프리셋인지 붙인다(critique P1).
// '바뀐 값 있음'이 생기고 사라지는 것을 보조기기에 알린다(계획 리뷰 D16)
export function PresetLine({ host }: { host: PresetHost }) {
	const presets = usePresetList();
	const { loaded } = host;
	const preset = loaded
		? presets.data?.find((item) => item.id === loaded.id)
		: undefined;
	if (!loaded || !preset) return null;
	const changed = !sameSettings(
		host.provider,
		host.settings[host.provider],
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
			{preset.voice?.voiceId !== host.voice?.voiceId
				? ` · ${savedVoiceLine(preset)}`
				: null}
		</p>
	);
}
```

- [ ] **Step 4: 확인 창이 작업실 문구를 받는다(`trial-confirm.tsx`)**

import에 `confirmCopy`를 더한다(`@/lib/trial-view`). `TrialConfirm`의 props에 `kind`를 더하고 `ConfirmBody`로 넘긴다.

```tsx
export function TrialConfirm({
	pending,
	onClose,
	onConfirm,
	kind = "trial",
}: {
	pending: TrialPending | null;
	onClose: () => void;
	onConfirm: (pending: TrialPending) => void;
	// 작업실은 대본 앞 100자·총 글자 수와 '만들기' 문구다(T9 스펙 4절). boolean 대신 값 하나(patterns-explicit-variants)
	kind?: "trial" | "studio";
}) {
```

```tsx
					<ConfirmBody
						pending={pending}
						kind={kind}
						cancelRef={cancelRef}
						onConfirm={onConfirm}
					/>
```

`ConfirmBody`의 props에 `kind: "trial" | "studio";`를 더하고 본문 네 곳을 바꾼다.

```tsx
	const cost = costCopy(request.provider);
	const copy = confirmCopy(kind, request);
```

```tsx
				<AlertDialogTitle>{copy.title}</AlertDialogTitle>
```

```tsx
					<div className="flex min-w-0 flex-col gap-1">
						<dt className="text-muted-foreground">{copy.textLabel}</dt>
						<dd className="wrap-anywhere min-w-0 whitespace-pre-wrap">
							{copy.text}
						</dd>
					</div>
```

```tsx
					<Coins data-icon="inline-start" aria-hidden="true" />
					{copy.action}
```

`cost`는 기본 샘플 줄(`cost.free`)이 계속 쓴다.

- [ ] **Step 5: 고르기 메뉴에 아래 항목 자리를 더한다(`voice-conditions.tsx`)**

dropdown-menu import에 `DropdownMenuSeparator`를, react import에 `type ReactNode`(이미 있으면 그대로)를 더한다. `RadioMenu` props에 더한다.

```tsx
	// 버튼 클래스에 더한다(프리셋 창의 채널 칸이 창 폭을 채운다)
	className?: string;
	// 선택지 아래 메뉴 항목(작업실 채널: 채널이 없을 때 '채널·분류에서 만들기' → /classes, T9)
	footer?: ReactNode;
```

구조 분해에 `footer,`를 더하고 `</DropdownMenuRadioGroup>` 바로 아래에 둔다.

```tsx
				{footer ? (
					<>
						<DropdownMenuSeparator />
						{footer}
					</>
				) : null}
```

- [ ] **Step 6: 페이지 머리에 오른쪽 자리를 더한다(`page-header.tsx`)**

```tsx
import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description: ReactNode;
	// 제목 오른쪽 조작(작업실의 채널 고르기·'프리셋', T9). 1023px 이하는 제목 아래 줄로 내린다. 주지 않으면 T1 모양 그대로다
	actions?: ReactNode;
}) {
	const heading = (
		<>
			{/* tabIndex -1: 오류 경계가 제목으로 포커스를 옮길 수 있게(Tab 순서에는 없다). 제목 포커스는 보이지 않아도 된다 */}
			<h1
				tabIndex={-1}
				className="text-balance font-bold text-2xl tracking-tight outline-none md:text-3xl"
			>
				{title}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm md:text-base">
				{description}
			</p>
		</>
	);
	return (
		<header className="px-4 pt-6 pb-5 md:px-11 md:pt-11 md:pb-8">
			{actions ? (
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="min-w-0">{heading}</div>
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				</div>
			) : (
				heading
			)}
		</header>
	);
}
```

- [ ] **Step 7: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/setting-fields.tsx apps/web/src/components/trial-section.tsx apps/web/src/components/voice-casting.tsx apps/web/src/components/library-filters.tsx apps/web/src/components/trial-confirm.tsx apps/web/src/components/preset-menu.tsx apps/web/src/components/voice-conditions.tsx apps/web/src/components/page-header.tsx && pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check apps/web/src/components/setting-fields.tsx apps/web/src/components/trial-section.tsx apps/web/src/components/voice-casting.tsx apps/web/src/components/library-filters.tsx apps/web/src/components/trial-confirm.tsx apps/web/src/components/preset-menu.tsx apps/web/src/components/voice-conditions.tsx apps/web/src/components/page-header.tsx`
Expected: exit 0. web 테스트 수는 Task 5 뒤와 같다(이 태스크는 테스트를 더하지 않는다).

- [ ] **Step 8: 옮긴 코드가 같은지 본다 (구현자)**

Run: `git diff -- apps/web/src/components/trial-section.tsx | grep '^-' | grep -c 'function SliderRow\|function TagControl\|function DirectionControl\|function Options' && diff <(git show HEAD:apps/web/src/components/trial-section.tsx | sed -n 57,201p) <(sed -n '/^\/\/ 슬라이더 한 줄/,/^\/\/ 그 모델이 받는 옵션만/p' apps/web/src/components/setting-fields.tsx | sed '$d')`
Expected: 첫 명령 4(네 함수가 trial-section.tsx에서 빠졌다). `diff`는 출력이 없다(옮긴 `SliderRow`·`CUSTOM`·`TagControl`·`DirectionControl`이 글자 그대로다). 새 파일은 추적 전이라 `git diff --stat`에 나오지 않으므로 이 방법으로 비교한다(계획 재리뷰 N4). 임시 파일 없이 프로세스 치환으로 비교한다(계획 재리뷰 R7).

- [ ] **Step 9: 캐스팅 회귀 런타임 확인 (코디네이터)**

`/casting`에서(유료 버튼은 확인 창 '취소'까지):
- Typecast·ElevenLabs·Gemini 성우 패널을 열고 옵션(모델·감정 모드·감정·강도·말투 태그·말투 지시)을 바꾼다. 값이 바뀌고 '처음 값으로'가 켜지는지 본다.
- '프리셋' 메뉴: 목록, 불러오기 창(다른 성우면 '설정만' 첫 줄), 불러온 뒤 줄, 지금 설정으로 새 프리셋 저장, 덮어쓰기 확인 문구를 본다.
- '내 문장 듣기' 확인 창의 제목·'문장' 줄·'크레딧 쓰고 듣기'가 T5와 같은지 본다.
- `/voices`·`/presets` 머리가 그대로인지 본다.
- 오류 예산 0.

---
### Task 7: 작업실 상태와 데이터 흐름 (`StudioProvider`)

**Files:**
- Create: `apps/web/src/components/studio-provider.tsx`

**Interfaces:**
- Consumes: Task 4 프로시저(`orpc.studioList`·`client.studioFind`·`client.studioAudio`·`orpc.studioCreate`), Task 5 함수, Task 6 `PresetHost`·`TrialConfirm` `kind`, `useSavedList`, `useCooldown`.
- Produces:
  - `StudioProvider({ children })`(반드시 `SamplePlayerProvider` 안), `useStudio(): StudioApi`, `useScript(): { text; setText }`, `useShownScript(): string`(늦춘 대본), `useStudioItems()`(미확인 줄이 있으면 15초마다 다시 받는다)
  - `type Shown = { id; url; blob; fileName; caption; autoplay }`
  - `StudioApi`: `restored`, `voices`(고를 수 있는 담은 성우, 정렬됨), `voice`(고른 담은 성우 또는 null), `pickVoice(voiceId)`, `settings`, `setSetting(patch)`, `resetSettings()`, `resetKey`, `channelId`, `setChannelId(id)`, `presetHost`, `notice`, `busy`, `problem`, `waiting`, `receiving`, `start(opener, options?)`, `open(item)`, `download(item)`, `downloadShown()`, `shown`, `forget(id)`

흐름(스펙 4절):
- '음성 만들기'(`start`): 막는 이유를 최신 대본으로 다시 본다. 같은 조합을 이전 결과(최근 20)에서, 없으면 `studioFind`로 찾는다. 있으면 플레이어에 올린다(공급자 0회). 없으면 확인 창을 연다.
- 같은 조합 새로 만들기(`start(opener, { regenerate: true })`, 디자인 리뷰 DN-6): 찾기를 건너뛰고 새 요청 id로 확인 창을 연다. 서버는 새 요청 id면 같은 조합도 다시 합성한다(Task 4 테스트, '설치본·문서로 확인한 것' 28). 확인 창에 T5의 "같은 설정이어도 소리가 달라질 수 있어요"가 붙는다. 이 길을 여는 버튼을 둘지는 브리프(DN-6)가 정하고, 두지 않으면 쓰는 곳이 없는 옵션으로 남지 않게 Task 9에서 지운다.
- 확인 창 '크레딧 쓰고 만들기'(`generate`): 요청 id는 확인 창을 열 때 한 번 만든다. `studioCreate` → 보관함·이전 결과 무효화 → 조각을 받아 플레이어에 올리고 "음성을 만들었어요"(자동 재생 없음).
  - 생성 실패는 막대의 오류 줄이다. 사유 없는 실패는 처리 여부 미확인 문구다(`createFailureOf`, 계획 리뷰 E1).
  - 생성 뒤 조각 받기 실패는 오류 줄이 아니라 알림이다('스펙과 다른 점' 17).
- 이전 결과 '재생'(`open`)은 올리고 바로 재생한다('스펙과 다른 점' 13). '내려받기'는 받은 blob이 있으면 그대로, 없으면 조각을 받아 저장한다(생성 API 없음). 받는 동안 그 줄의 `receiving`이 켜진다(디자인 리뷰 D8).
- 지금 올린 결과는 `shown.id`·`shown.caption`이다. 막대 캡션과 이전 결과 줄의 '올라 있음' 표시가 쓴다(디자인 리뷰 D3).
- 임시 작업: 대본은 `ScriptProvider`가 입력마다, 성우·설정·채널은 바뀔 때 이 브라우저에 쓴다. 첫 그리기 뒤에 읽는다. 읽기 전, 그리고 저장해 둔 성우가 있는데 담은 성우 목록을 받는 중이면 `restored`가 거짓이다(카드 자리 뼈대, 디자인 리뷰 D7).
- 생성 성공 → 조각 → 플레이어 연결은 순수 부분을 Task 5(`resultTarget`·`fetchAudio`)가 테스트하고, 이어 붙인 흐름은 브라우저 QA S20(CDP 가로채기)이 본다(계획 리뷰 E6, '구현 뒤').

- [ ] **Step 1: 상태를 쓴다**

```tsx
// apps/web/src/components/studio-provider.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	type SettingsOf,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import type { StudioItem } from "@tts-pilot-app/api/studio-contract";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useDeferredValue,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { MESSAGES, saveFailure } from "@/lib/classes-view";
import {
	createFailureOf,
	fetchAudio,
	pickableVoices,
	type ResultTarget,
	readScript,
	readSetup,
	resultTarget,
	SCRIPT_KEY,
	SETUP_KEY,
	STUDIO_TEXT,
	savedOf,
	setupText,
	studioBlock,
	studioLoadView,
	studioRequestOf,
	type TypecastRequest,
	unknownRefetch,
	usablePresetVoice,
	voiceNameOf,
} from "@/lib/studio-view";
import { type TrialProblem, trialFailureOf } from "@/lib/trial-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import type { PresetHost } from "./preset-menu";
import { useSavedList } from "./saved-voices";
import { TrialConfirm, type TrialPending } from "./trial-confirm";
import type { LoadedPreset } from "./trial-provider";
import { useCooldown } from "./voice-problem";

// 이 브라우저 저장소(임시 작업). 사생활 보호 창·용량 초과·꺼짐이면 던지므로 조용히 넘긴다(client-localstorage-schema)
function loadStored(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
function store(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// 저장하지 못해도 화면은 그대로 쓴다(새로 고침하면 처음 값)
	}
}
// 받은 오디오를 파일로 저장한다(생성 API를 부르지 않는다, REQ-10). 다운로드가 시작될 시간을 두고 주소를 푼다
function saveBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

// 이전 결과(최근 20, 완료·미확인). 막대의 '저장된 결과 열기' 판정과 이전 결과 목록이 같은 키를 쓴다(TanStack 중복 제거).
// 늦은 결과가 보고 있는 화면에서도 완료로 바뀌게 만든 지 6분 안의 미확인 줄이 있으면 15초마다 다시 받는다('스펙과 다른 점' 16)
export const useStudioItems = () =>
	useQuery({
		...orpc.studioList.queryOptions(OWNED_LIST),
		refetchInterval: (query) => unknownRefetch(query.state.data, Date.now()),
	});

type Busy = { phase: "finding" | "creating"; since: number };
// 플레이어에 올린 결과. blob은 내려받기가 다시 받지 않게 둔다. caption은 막대 캡션·접근 이름이다(디자인 리뷰 D3).
// autoplay면 올리자마자 재생한다(이전 결과 '재생')
export type Shown = ResultTarget & { url: string; blob: Blob; autoplay: boolean };
// 조각을 받는 중인 결과와 동작(디자인 리뷰 D8: 줄의 받는 중 표시)
type Receiving = { id: string; action: "open" | "download" };

type StudioApi = {
	restored: boolean;
	voices: SavedVoice[];
	voice: SavedVoice | null;
	pickVoice: (voiceId: string) => void;
	settings: SettingsOf;
	setSetting: (patch: Partial<Record<string, string | number | boolean>>) => void;
	resetSettings: () => void;
	// 옵션 칸을 다시 그릴 열쇠('처음 값으로'·프리셋 적용)
	resetKey: number;
	channelId: string | null;
	setChannelId: (id: string | null) => void;
	presetHost: PresetHost;
	notice: string | null;
	busy: Busy | null;
	problem: TrialProblem | null;
	waiting: string | null;
	receiving: Receiving | null;
	start: (
		opener: HTMLElement | null,
		options?: { regenerate?: boolean },
	) => void;
	open: (item: StudioItem) => void;
	download: (item: StudioItem) => void;
	downloadShown: () => void;
	shown: Shown | null;
	forget: (id: string) => void;
};

const StudioContext = createContext<StudioApi | null>(null);
const ScriptContext = createContext<{
	text: string;
	setText: (text: string) => void;
} | null>(null);
const ShownScriptContext = createContext("");

// 대본은 이 작은 컨텍스트만 든다. 글자를 쳐도 StudioProvider·카드·이전 결과는 다시 그리지 않는다(tasks/lessons.md T7.5).
// 막대는 늦춘 대본(ShownScriptContext)으로 낮은 우선순위에서 다시 그린다. 저장은 입력 처리기에서 한다(rerender-move-effect-to-event)
function ScriptProvider({
	latest,
	children,
}: {
	latest: RefObject<string>;
	children: ReactNode;
}) {
	const [text, setText] = useState("");
	const shown = useDeferredValue(text);
	// 서버 그리기와 맞추려고 첫 그리기 뒤에 이 브라우저의 대본을 읽는다(그때까지 카드는 뼈대다)
	useEffect(() => {
		const restored = readScript(loadStored(SCRIPT_KEY));
		latest.current = restored;
		setText(restored);
	}, [latest]);
	const script = {
		text,
		setText: (next: string) => {
			latest.current = next;
			setText(next);
			store(SCRIPT_KEY, next);
		},
	};
	return (
		<ScriptContext value={script}>
			<ShownScriptContext value={shown}>{children}</ShownScriptContext>
		</ScriptContext>
	);
}

// 음성 작업실의 성우·설정·채널·생성·결과 상태 하나(T9 스펙 4절). 유료 호출은 늘 입력 칸의 최신 대본(latestText)으로 만든다.
// 화면을 떠나면 플레이어의 blob 주소를 푼다(tts-provider 화면 절)
export function StudioProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const saved = useSavedList();
	const items = useStudioItems();
	const create = useMutation({
		...orpc.studioCreate.mutationOptions(),
		retry: false,
	});
	const latestText = useRef("");
	const [setupRead, setSetupRead] = useState(false);
	const [voiceId, setVoiceId] = useState<string | null>(null);
	const [channelId, setChannelId] = useState<string | null>(null);
	const [settings, setSettings] = useState<SettingsOf>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState<LoadedPreset | null>(null);
	const [resetKey, setResetKey] = useState(0);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<Busy | null>(null);
	const [problem, setProblem] = useState<TrialProblem | null>(null);
	const [retryAt, setRetryAt] = useState<string | null>(null);
	const [pending, setPending] = useState<TrialPending | null>(null);
	const [shown, setShown] = useState<Shown | null>(null);
	const [receiving, setReceiving] = useState<Receiving | null>(null);
	const shownRef = useRef<Shown | null>(null);
	// 렌더를 기다리지 않고 두 번째 누름을 막는다(서버 선점이 정본이고 이것은 보조, tts-provider)
	const busyRef = useRef(false);
	const mounted = useRef(true);
	const openTicket = useRef(0);
	const waiting = useCooldown(retryAt);
	const voices = pickableVoices(saved.data ?? []);
	const voice = savedOf(voices, voiceId);
	// 저장해 둔 성우가 있으면 담은 성우 목록을 받을 때까지 기다린다('성우 고르기'가 보였다가 이름으로 바뀌지 않게, 디자인 리뷰 D7)
	const restored = setupRead && !(voiceId !== null && saved.isPending);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			openTicket.current += 1;
			if (shownRef.current) URL.revokeObjectURL(shownRef.current.url);
			shownRef.current = null;
		};
	}, []);
	// 이 브라우저의 임시 작업(성우·설정·채널)을 첫 그리기 뒤에 읽는다. 성우는 담은 Typecast 성우 목록에 있을 때만 쓴다(savedOf, 렌더 중 계산)
	useEffect(() => {
		const setup = readSetup(loadStored(SETUP_KEY));
		setVoiceId(setup.voiceId);
		setChannelId(setup.channelId);
		setSettings((all) => ({ ...all, typecast: setup.settings }));
		setSetupRead(true);
	}, []);
	// 바뀔 때마다 쓴다. 읽기 전에는 쓰지 않는다(처음 값으로 덮지 않게)
	useEffect(() => {
		if (setupRead)
			store(
				SETUP_KEY,
				setupText({ voiceId, channelId, settings: settings.typecast }),
			);
	}, [setupRead, voiceId, channelId, settings]);

	const refreshItems = () =>
		queryClient.invalidateQueries({ queryKey: orpc.studioList.key() });
	function fail(next: TrialProblem) {
		if (!mounted.current) return;
		if (next.reason === "rate_limit" && next.retryAt) setRetryAt(next.retryAt);
		setProblem(next);
	}
	// 조각 받기 실패. 다른 탭에서 지웠거나 만료된 결과(NOT_FOUND)는 스펙 문구로 알리고 목록을 다시 받는다(스펙 5절 S14).
	// 그 밖의 실패는 생성 오류 줄과 따로 알림으로만 보인다('스펙과 다른 점' 17)
	function missing(error: unknown) {
		if (saveFailure(error) === "not_found") {
			toast.error(MESSAGES.notFound);
			void refreshItems();
			return;
		}
		toast.error(STUDIO_TEXT.receiveFailed);
	}
	// 플레이어에 올린 결과를 바꾼다. 바뀌는 blob 주소는 푼다(setState 갱신 함수 밖에서 한다. StrictMode는 갱신 함수를 두 번 부른다)
	function show(next: Shown | null) {
		const old = shownRef.current;
		if (old && old.url !== next?.url) URL.revokeObjectURL(old.url);
		shownRef.current = next;
		setShown(next);
	}
	const audioOf = (target: ResultTarget) =>
		fetchAudio(target.bytes, (part) =>
			client.studioAudio({ id: target.id, part }),
		);
	const targetOf = (item: StudioItem) =>
		resultTarget(
			item,
			voiceNameOf(voices, item.request.voiceId),
			item.request.text,
		);
	// 받는 중 표시를 켜고 끈다. 끝날 때 다른 결과를 받고 있으면 그대로 둔다
	function receive(id: string, action: Receiving["action"]) {
		setReceiving({ id, action });
		return () =>
			setReceiving((current) =>
				current?.id === id && current.action === action ? null : current,
			);
	}

	// 결과를 플레이어에 올린다(조각을 받아 합친다). 받는 사이 다른 결과를 고르면 앞의 것은 버린다
	async function open(
		target: ResultTarget,
		message: string | null,
		autoplay: boolean,
	) {
		const ticket = ++openTicket.current;
		const old = shownRef.current;
		const done = receive(target.id, "open");
		try {
			const blob = old?.id === target.id ? old.blob : await audioOf(target);
			if (!mounted.current || ticket !== openTicket.current) return;
			show(
				old?.id === target.id
					? { ...old, autoplay }
					: { ...target, url: URL.createObjectURL(blob), blob, autoplay },
			);
			if (message) toast.success(message);
		} catch (error) {
			if (mounted.current && ticket === openTicket.current) missing(error);
		} finally {
			if (mounted.current) done();
		}
	}

	async function download(target: ResultTarget) {
		const done = receive(target.id, "download");
		try {
			const old = shownRef.current;
			saveBlob(
				old?.id === target.id ? old.blob : await audioOf(target),
				target.fileName,
			);
		} catch (error) {
			if (mounted.current) missing(error);
		} finally {
			if (mounted.current) done();
		}
	}

	// '음성 만들기'. 같은 조합의 저장된 결과가 있으면 그것을 연다(공급자 0회, 스펙 4절). 없으면 확인 창을 연다.
	// regenerate면 찾기를 건너뛰고 새 요청 id로 확인 창을 연다(같은 조합 새로 만들기, 디자인 리뷰 DN-6. 서버는 새 요청 id면 다시 합성한다)
	async function start(
		opener: HTMLElement | null,
		{ regenerate = false }: { regenerate?: boolean } = {},
	) {
		const text = latestText.current;
		// 버튼 잠금은 늦춘 대본으로 정하므로 막 지우거나 넘긴 대본은 여기서 거른다
		if (
			busyRef.current ||
			!voice ||
			studioBlock({ voice, text, retryAt: waiting })
		)
			return;
		const request = studioRequestOf(voice.voice, text, settings);
		const signature = comboSignature(request);
		busyRef.current = true;
		setBusy({ phase: "finding", since: Date.now() });
		setProblem(null);
		try {
			if (!regenerate) {
				const listed = items.data?.find(
					(item) =>
						item.status === "done" &&
						comboSignature(item.request) === signature,
				);
				const found = listed ?? (await client.studioFind(request));
				if (!mounted.current) return;
				if (found) {
					await open(
						resultTarget(found, voice.voice.name, text),
						STUDIO_TEXT.opened,
						false,
					);
					return;
				}
			}
			setPending({
				voice: voice.voice,
				request,
				requestId: crypto.randomUUID(),
				regenerate,
				opener,
			});
		} catch (error) {
			// 찾기는 유료가 아니다. 사유 없는 실패는 '만들지 못했어요'다
			fail(trialFailureOf(error));
		} finally {
			busyRef.current = false;
			if (mounted.current) setBusy(null);
		}
	}

	// 확인 창 '크레딧 쓰고 만들기'. 같은 요청 id로 한 번만 보낸다. 끝나면 결과를 올리기만 한다(자동 재생 없음, 스펙 4절)
	async function generate(current: TrialPending) {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy({ phase: "creating", since: Date.now() });
		setProblem(null);
		const request = current.request as TypecastRequest;
		try {
			const result = await create.mutateAsync({
				requestId: current.requestId,
				request,
			});
			// 사용 이력이 바뀌었다(성우 고르기 창 정렬)
			void queryClient.invalidateQueries({
				queryKey: orpc.savedVoiceList.key(),
			});
			await refreshItems();
			// 조각 받기가 실패하면 open이 알림으로 알린다(생성은 성공했다)
			await open(
				resultTarget(result, current.voice.name, request.text),
				STUDIO_TEXT.made,
				false,
			);
		} catch (error) {
			// 사유 없는 실패는 크레딧이 쓰였을 수 있어 처리 여부 미확인 문구다(스펙 5절, 계획 리뷰 E1)
			fail(createFailureOf(error));
			// 미확인·실패 기록이 생겼을 수 있다(이전 결과의 미확인 줄)
			void refreshItems();
		} finally {
			busyRef.current = false;
			if (mounted.current) setBusy(null);
		}
	}

	// 작업실 프리셋: 성우와 설정을 함께 불러온다(스펙 2절). 성우를 쓸 수 없으면 비우고 알린다(자동 대체 없음)
	const presetHost: PresetHost = {
		provider: "typecast",
		voice: voice?.voice ?? null,
		settings,
		loaded,
		apply: (preset: Preset) => {
			const target = usablePresetVoice(preset);
			setSettings((all) => ({
				...all,
				typecast: preset.settings as TypecastSettings,
			}));
			setLoaded({ id: preset.id, settings: preset.settings });
			setVoiceId(target?.voiceId ?? null);
			setNotice(target ? null : STUDIO_TEXT.presetVoiceUnusable);
			setProblem(null);
			setResetKey((key) => key + 1);
		},
		loadView: (preset) => studioLoadView(voice?.voice ?? null, settings, preset),
	};

	const api: StudioApi = {
		restored,
		voices,
		voice,
		pickVoice: (id) => {
			setVoiceId(id);
			setNotice(null);
			setProblem(null);
		},
		settings,
		setSetting: (patch) =>
			setSettings((all) => ({
				...all,
				typecast: { ...all.typecast, ...patch } as TypecastSettings,
			})),
		// '처음 값으로'는 불러온 프리셋 표시도 지운다(T8과 같다)
		resetSettings: () => {
			setSettings((all) => ({ ...all, typecast: DEFAULT_SETTINGS.typecast }));
			setLoaded(null);
			setResetKey((key) => key + 1);
		},
		resetKey,
		channelId,
		setChannelId,
		presetHost,
		notice,
		busy,
		problem,
		waiting,
		receiving,
		start: (opener, options) => void start(opener, options),
		open: (item) => void open(targetOf(item), null, true),
		download: (item) => void download(targetOf(item)),
		downloadShown: () => {
			const current = shownRef.current;
			if (current) saveBlob(current.blob, current.fileName);
		},
		shown,
		forget: (id) => {
			if (shownRef.current?.id === id) show(null);
		},
	};
	return (
		<StudioContext value={api}>
			<ScriptProvider latest={latestText}>{children}</ScriptProvider>
			<TrialConfirm
				kind="studio"
				pending={pending}
				onClose={() => setPending(null)}
				onConfirm={(current) => {
					setPending(null);
					void generate(current);
				}}
			/>
		</StudioContext>
	);
}

export function useStudio(): StudioApi {
	const studio = useContext(StudioContext);
	if (!studio) throw new Error("useStudio는 StudioProvider 안에서만 쓴다");
	return studio;
}

// 대본 칸 전용(최신 값)
export function useScript() {
	const script = useContext(ScriptContext);
	if (!script) throw new Error("useScript는 StudioProvider 안에서만 쓴다");
	return script;
}

// 막대가 읽는 늦춘 대본
export function useShownScript(): string {
	return useContext(ShownScriptContext);
}
```

- [ ] **Step 2: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/studio-provider.tsx && pnpm --filter web check-types && pnpm exec biome check apps/web/src/components/studio-provider.tsx`
Expected: exit 0. 아직 아무 화면도 이 파일을 가져가지 않는다(Task 9가 붙인다). 순수 부분(`resultTarget`·`fetchAudio`·`createFailureOf`·`unknownRefetch`)의 테스트는 Task 5에 있다. 런타임 확인은 Task 9와 QA S20에서 한다.

- [ ] **Step 3: 자기 점검 (구현자)**

보고에 아래를 한 줄씩 적는다:
- 대본을 읽는 곳이 `ScriptProvider`와 `start`(ref)뿐이고 `StudioApi`에 대본이 없다.
- 효과는 넷이다: 언마운트 정리, 설정 읽기, 설정 쓰기, `ScriptProvider` 대본 읽기.
- `setState` 갱신 함수 안에 부수 효과(주소 만들기·풀기)가 없다(`show`가 ref로 한다).
- 생성 실패만 `createFailureOf`(사유 없음 → 미확인)를 쓰고, 찾기 실패는 `trialFailureOf`, 조각 받기 실패는 알림(`missing`)이다.

---

### Task 8: 문단 카드와 성우 고르기 창 (18행 브리프 확인 뒤)

**Files:**
- Create: `apps/web/src/components/studio-card.tsx`(`StudioCard`, `ScriptField`, `EmotionPalette`)
- Create: `apps/web/src/components/studio-voice-dialog.tsx`(`VoicePicker`, `VoiceOption`)
- Modify(브리프 반영): `apps/web/src/lib/studio-view.ts`(`STUDIO_TEXT`·`EMOTION_NOTE`), `apps/web/src/lib/studio-view.test.ts`(문구 기대)

**Interfaces:**
- Consumes: Task 5 함수·문구, Task 6 `Options`, Task 7 `useStudio`·`useScript`, `useSavedList`, `useSample`·`SampleButton`, `metaLine`·`sampleKindOf`, `LIBRARY_TEXT.unavailable`.
- Produces: `StudioCard()`, `VoicePicker()`

**브리프 뒤 고칠 것(디자인 리뷰 6절 Task 8, 코디네이터 결정 C3):** 아래 코드는 초안이다. 18행 브리프가 확정되면 이 태스크를 한 번 고친다. 후보는 다음과 같다.
- 감정 팔레트: `ToggleGroup`의 의미(`radiogroup`·방향키, Base UI 설치본 확인), 고른 알약의 체크 아이콘, 성우 맞춤·모델 변경으로 값이 바뀔 때 `role="status"` 한 줄, 뱃지가 하나뿐일 때 대체 글(D4). 감정 표식을 설정 지름길로 쓸지(DN-2).
- 성우 고르기 창: 767px 이하 목록 상한을 `md:`로만(D11), 이용 불가 성우의 `aria-disabled`·포커스 가능(D10), 고른 성우 `Check`, 열릴 때 첫 포커스(4절 5항).
- 카드: 문단 번호 `1` 숨김(D14), 프리셋 성우 안내 줄 `role="status"`(3절), 대본 칸 높이 상한(DN-4), `scroll-padding-bottom`(D5).
- 문구: 3절 표 가운데 브리프가 고른 것.

- [ ] **Step 1: 브리프를 반영한다**

`docs/briefs/studio.md`(18행, 사용자 확인)를 읽고 `STUDIO_TEXT`·`EMOTION_NOTE`의 초안 문구를 브리프 문구로 바꾼다. 위 '브리프 뒤 고칠 것' 가운데 브리프가 고른 것을 Step 2·3 코드에 반영한다. 바꾼 문구가 `studio-view.test.ts`의 기대에 있으면 기대도 같은 값으로 바꾼다(`studioBlock`·`studioProblemText` 문구, `presetVoiceUnusable`). 배치가 이 태스크의 클래스와 다르면 브리프를 따르고, 이 계획의 클래스는 같은 역할의 자리로 읽는다. 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다.

Run: `pnpm --filter web test src/lib/studio-view.test.ts`
Expected: PASS

- [ ] **Step 2: 문단 카드를 쓴다**

```tsx
// apps/web/src/components/studio-card.tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	DEFAULT_SETTINGS,
	STUDIO_TEXT_MAX,
	type TypecastSettings,
} from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import {
	countText,
	EMOTION_NOTE,
	type EmotionValue,
	emotionBadges,
	emotionMark,
	emotionPatch,
	pressedEmotion,
	STUDIO_TEXT,
	scriptCount,
	studioRequestOf,
} from "@/lib/studio-view";

import { Options } from "./setting-fields";
import { useScript, useStudio } from "./studio-provider";
import { VoicePicker } from "./studio-voice-dialog";
import { lockedButton } from "./voice-problem";

// 감정 팔레트(스펙 2절 Typecast): '자동'(v30) + 그 성우·모델이 받는 감정. 누르면 카드의 감정 설정이 바뀐다(대본에 글자를 넣지 않는다).
// 눌린 뱃지가 지금 값이고 그 설명을 아래 한 줄에 둔다(배치는 브리프). 강도는 '자동'이 아닐 때만 옵션에 보인다(fieldsOf)
function EmotionPalette({
	voice,
	settings,
	onChange,
}: {
	voice: Voice;
	settings: TypecastSettings;
	onChange: (patch: Partial<TypecastSettings>) => void;
}) {
	const labelId = useId();
	const noteId = useId();
	const pressed = pressedEmotion(settings);
	return (
		<div className="flex flex-col gap-2">
			<span id={labelId} className="text-sm">
				{STUDIO_TEXT.palette}
			</span>
			<ToggleGroup
				aria-labelledby={labelId}
				aria-describedby={noteId}
				value={[pressed]}
				onValueChange={(next) => {
					const value = next[0] as EmotionValue | undefined;
					// 눌린 뱃지를 다시 눌러 비울 수 없다(감정은 늘 하나다)
					if (value) onChange(emotionPatch(settings.model, value));
				}}
				className="w-full flex-wrap"
			>
				{emotionBadges(voice, settings.model).map((badge) => (
					<Toggle
						key={badge.value}
						value={badge.value}
						className="rounded-full px-4 ring-1 ring-border ring-inset data-pressed:bg-primary-subtle data-pressed:text-primary data-pressed:ring-primary"
					>
						{badge.label}
					</Toggle>
				))}
			</ToggleGroup>
			<p id={noteId} className="text-muted-foreground text-sm">
				{EMOTION_NOTE[pressed]}
			</p>
		</div>
	);
}

// 대본 칸(스펙 4절). 이 컴포넌트만 대본을 읽는다(카드·옵션은 글자마다 다시 그리지 않는다, tasks/lessons.md T7.5).
// 2,000자를 넘어도 입력은 막지 않는다(붙여 넣은 글이 잘리지 않게). 생성만 막대가 막는다
function ScriptField() {
	const { text, setText } = useScript();
	const id = useId();
	const over = scriptCount(text) > STUDIO_TEXT_MAX;
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="sr-only">
				{STUDIO_TEXT.scriptLabel}
			</label>
			<Textarea
				id={id}
				name="studio-script"
				autoComplete="off"
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={STUDIO_TEXT.scriptPlaceholder}
				aria-describedby={`${id}-count`}
				aria-invalid={over || undefined}
				className="min-h-40 rounded-xl text-base md:text-sm"
			/>
			<p
				id={`${id}-count`}
				className={cn(
					"self-end text-sm tabular-nums",
					over ? "text-warning" : "text-muted-foreground",
				)}
			>
				{countText(text)}
			</p>
		</div>
	);
}

// 문단 카드 1장(스펙 4절). 머리줄: 번호 · 성우 버튼 · 감정 표식(기본값과 다를 때만) · '설정'(펼침).
// 펼치면 T5 Typecast 설정 칸(감정 칸 자리에 팔레트)과 '처음 값으로'. 카드 추가·분할·결합은 P1-04~06이다
export function StudioCard() {
	const studio = useStudio();
	const [open, setOpen] = useState(false);
	const headId = useId();
	const settingsId = useId();
	const voice = studio.voice?.voice ?? null;
	// 옵션·표식은 성우 맞춤 뒤 설정만 본다(대본을 읽지 않는다)
	const request = voice ? studioRequestOf(voice, "", studio.settings) : null;
	const mark = request ? emotionMark(request.settings) : null;
	// 처음 값과 다르거나 불러온 프리셋이 있으면 '처음 값으로'가 켜진다(T5·T8과 같다)
	const changed =
		JSON.stringify(studio.settings.typecast) !==
			JSON.stringify(DEFAULT_SETTINGS.typecast) ||
		studio.presetHost.loaded !== null;
	return (
		<section
			aria-labelledby={headId}
			className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:p-5"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 id={headId} className="font-bold tabular-nums">
					<span aria-hidden="true">1</span>
					<span className="sr-only">{STUDIO_TEXT.paragraph}</span>
				</h2>
				<VoicePicker />
				{mark ? <Badge variant="secondary">{`감정 ${mark}`}</Badge> : null}
				<Button
					variant="ghost"
					size="lg"
					className="ml-auto"
					aria-expanded={open}
					aria-controls={settingsId}
					onClick={() => setOpen((current) => !current)}
				>
					{STUDIO_TEXT.settings}
					<ChevronDown
						data-icon="inline-end"
						aria-hidden="true"
						className={cn(open && "rotate-180")}
					/>
				</Button>
			</div>
			{studio.notice ? (
				<p className="flex gap-2 text-sm text-warning">
					<TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					{studio.notice}
				</p>
			) : null}
			<div
				id={settingsId}
				hidden={!open}
				className="flex flex-col gap-3 border-border border-t pt-3"
			>
				{open && voice && request ? (
					<>
						<div key={studio.resetKey} className="flex flex-col gap-3">
							<Options
								voice={voice}
								request={request}
								onChange={studio.setSetting}
								palette={
									<EmotionPalette
										voice={voice}
										settings={request.settings}
										onChange={studio.setSetting}
									/>
								}
							/>
						</div>
						<Button
							variant="ghost"
							size="lg"
							focusableWhenDisabled
							disabled={!changed}
							className={cn(
								"self-start text-muted-foreground",
								lockedButton(!changed),
							)}
							onClick={studio.resetSettings}
						>
							{STUDIO_TEXT.reset}
						</Button>
					</>
				) : open ? (
					<p className="text-muted-foreground text-sm">
						{STUDIO_TEXT.settingsNeedVoice}
					</p>
				) : null}
			</div>
			<ScriptField />
		</section>
	);
}
```

`hidden` 칸은 늘 그려 `aria-controls`가 있는 id를 가리킨다. 접혀 있으면 안을 그리지 않는다.

- [ ] **Step 3: 성우 고르기 창을 쓴다**

```tsx
// apps/web/src/components/studio-voice-dialog.tsx
"use client";

import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@tts-pilot-app/ui/components/dialog";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Link from "next/link";
import { useId, useState } from "react";

import { LIBRARY_TEXT } from "@/lib/saved-voice-view";
import { STUDIO_TEXT, usageLine } from "@/lib/studio-view";
import { metaLine, sampleKindOf } from "@/lib/voice-view";

import { useSample } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { useStudio } from "./studio-provider";
import { SampleButton } from "./voice-row";

// 성우 한 줄(스펙 4절): 기본 샘플(무료) · 이름 · 조건 요약 · '최근 사용 3일 전 · 12회'.
// 이용 불가 성우는 흐리게, 고를 수 없고 이유 한 줄. 지금 고른 성우는 옅은 청록 바탕과 aria-current
function VoiceOption({
	item,
	now,
	chosen,
	onPick,
}: {
	item: SavedVoice;
	now: Date;
	chosen: boolean;
	onPick: () => void;
}) {
	const sample = item.voice.previewUrl;
	const { status, toggle } = useSample(sample ?? "");
	const reasonId = useId();
	const usage = usageLine(item, now);
	return (
		<li
			className={cn(
				"flex items-center gap-3 py-2",
				item.unavailable && "opacity-60",
			)}
		>
			<SampleButton
				status={sample ? status : "none"}
				subject={`${item.voice.name} ${sampleKindOf(item.voice)}`}
				onToggle={
					sample ? () => toggle(sample, item.voice.name, sample) : undefined
				}
			/>
			<button
				type="button"
				disabled={item.unavailable}
				aria-current={chosen ? "true" : undefined}
				aria-describedby={item.unavailable ? reasonId : undefined}
				onClick={onPick}
				className={cn(
					"flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-md px-2 py-1 text-left outline-offset-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none",
					chosen && "bg-primary-subtle",
				)}
			>
				<span className="max-w-full truncate font-bold">{item.voice.name}</span>
				<span className="max-w-full truncate text-muted-foreground text-sm">
					{metaLine(item.voice)}
				</span>
				{usage ? (
					<span className="text-muted-foreground text-sm tabular-nums">
						{usage}
					</span>
				) : null}
				{item.unavailable ? (
					<span id={reasonId} className="text-sm text-warning">
						{LIBRARY_TEXT.unavailable}
					</span>
				) : null}
			</button>
		</li>
	);
}

// 카드 머리줄의 성우 버튼과 성우 고르기 창(스펙 4절). 담은 Typecast 성우만(최근 사용 순 → 즐겨찾기 → 담은 순).
// 받는 중 뼈대, 실패면 '다시 불러오기', 담은 성우가 없으면 '성우 캐스팅에서 담기'. 고르면 창을 닫고 포커스는 성우 버튼으로 돌아간다(DialogTrigger)
export function VoicePicker() {
	const studio = useStudio();
	const saved = useSavedList();
	const [open, setOpen] = useState(false);
	const now = new Date();
	const chosen = studio.voice;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="lg" className="min-w-0 max-w-full" />
				}
			>
				<span className="truncate">
					{chosen ? chosen.voice.name : STUDIO_TEXT.pickVoice}
				</span>
				{chosen ? (
					<span
						className="shrink-0 font-normal text-muted-foreground"
						translate="no"
					>
						· Typecast
					</span>
				) : null}
			</DialogTrigger>
			<DialogContent className="md:max-w-lg">
				<DialogHeader>
					<DialogTitle>{STUDIO_TEXT.pickVoice}</DialogTitle>
					<DialogDescription>{STUDIO_TEXT.pickVoiceDescription}</DialogDescription>
				</DialogHeader>
				{saved.isPending ? (
					<Skeleton aria-hidden="true" className="h-40 w-full rounded-xl" />
				) : saved.isError ? (
					<div className="flex flex-col items-start gap-2">
						<p className="text-sm text-warning">{STUDIO_TEXT.voicesFailed}</p>
						<Button
							variant="outline"
							size="lg"
							onClick={() => void saved.refetch()}
						>
							{STUDIO_TEXT.reload}
						</Button>
					</div>
				) : studio.voices.length === 0 ? (
					<div className="flex flex-col items-start gap-2">
						<p>{STUDIO_TEXT.noVoices}</p>
						<Button
							variant="outline"
							size="lg"
							nativeButton={false}
							render={<Link href="/casting" />}
						>
							{STUDIO_TEXT.toCasting}
						</Button>
					</div>
				) : (
					<ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
						{studio.voices.map((item) => (
							<VoiceOption
								key={item.id}
								item={item}
								now={now}
								chosen={item.voice.voiceId === chosen?.voice.voiceId}
								onPick={() => {
									studio.pickVoice(item.voice.voiceId);
									setOpen(false);
								}}
							/>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 4: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/studio-card.tsx apps/web/src/components/studio-voice-dialog.tsx apps/web/src/lib/studio-view.ts apps/web/src/lib/studio-view.test.ts && pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check apps/web/src/components/studio-card.tsx apps/web/src/components/studio-voice-dialog.tsx`
Expected: exit 0. 런타임 확인은 페이지를 붙이는 Task 9에서 한다.

---
### Task 9: 하단 막대·이전 결과·머리와 페이지 (18행 브리프 확인 뒤)

**Files:**
- Create: `apps/web/src/components/studio-bar.tsx`(`StudioBar`, `useElapsed`)
- Create: `apps/web/src/components/studio-results.tsx`(`StudioResults`, `ResultRow`)
- Create: `apps/web/src/components/studio-editor.tsx`(`StudioEditor`, `StudioBody`, `ChannelPicker`)
- Modify: `apps/web/src/app/(app)/studio/page.tsx`(흐름 지도를 편집기로)

**Interfaces:**
- Consumes: Task 5~8 전부, `RowAction`·`boxClass`(class-group), `ConfirmDialog`, `LoopbackNotice`, `failureOf`, `byName`·`MESSAGES`, `usePresetList`, `PageHeader` `actions`, `RadioMenu` `footer`.
- Produces: `StudioEditor()`(페이지 본문 전체). `/studio`는 Server Component가 `StudioEditor` 하나를 그린다.

**브리프 뒤 고칠 것(디자인 리뷰 6절 Task 9, 코디네이터 결정 C3):** 아래 코드는 초안이다. 18행 브리프가 확정되면 이 태스크를 한 번 고친다. 상태는 Task 7이 이미 다 준다. 후보는 다음과 같다.
- 막대: 고정 방식·DOM 순서(DN-1, 추천은 카드 → 막대 → 이전 결과의 고정 막대), 모바일 두 줄(DN-3), 결과 칸 고정 높이, 사용량 줄과 `Coins` 자리(DN-7), 오류 줄 `role="alert"`, 만드는 중 20초 뒤 안내(D12).
- 이전 결과: 올라 있는 줄 표시(D3, 아래 초안은 `aria-current`와 옅은 청록 바탕), 받는 중 표시(D8, 아래 초안은 스피너), 미확인 줄 크레딧 문구(D12), 20개 안내(D13), 0개일 때(DN-10).
- 같은 조합 새로 만들기 버튼(DN-6). 두지 않기로 하면 Task 7 `start`의 `regenerate` 옵션과 그 문장을 지운다.
- 머리: `actions` 줄바꿈·채널 버튼 말줄임(D15), 작업실 프리셋 불러오기 알림 문구(DN-5).

- [ ] **Step 1: 하단 막대를 쓴다**

```tsx
// apps/web/src/components/studio-bar.tsx
"use client";

import {
	comboSignature,
	estimate,
} from "@tts-pilot-app/api/providers/trial-options";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import {
	STUDIO_TEXT,
	studioBlock,
	studioProblemText,
	studioRequestOf,
} from "@/lib/studio-view";
import { usageText } from "@/lib/trial-view";

import { usePlayer } from "./sample-player";
import { useShownScript, useStudio, useStudioItems } from "./studio-provider";
import { lockedButton } from "./voice-problem";

// 만드는 중 지난 시간(초). 공급자가 진행률을 주지 않아 지난 시간만 보인다(가짜 진행률 없음, tts-provider)
function useElapsed(since: number | null): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (since === null) return;
		setNow(Date.now());
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [since]);
	return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

// 하단 막대(스펙 4절, 화면의 초점 하나): 왼쪽 결과 플레이어(브라우저 기본 조작)·'내려받기', 오른쪽 예상 사용량·'음성 만들기'·막는 이유 또는 오류.
// 늦춘 대본으로 그린다(입력이 끊는다). 한 번에 한 오디오(REQ-03): 기본 샘플이 재생되면 결과를 멈추고, 결과를 재생하면 샘플을 멈춘다
export function StudioBar() {
	const studio = useStudio();
	const text = useShownScript();
	const items = useStudioItems();
	const player = usePlayer();
	const audioRef = useRef<HTMLAudioElement>(null);
	const reasonId = useId();
	const problemId = useId();
	const captionId = useId();
	const creating = studio.busy?.phase === "creating";
	const elapsed = useElapsed(creating ? (studio.busy?.since ?? null) : null);
	const voice = studio.voice;
	const request = voice
		? studioRequestOf(voice.voice, text, studio.settings)
		: null;
	const signature = request ? comboSignature(request) : null;
	// shortcut: 최근 20개만 보고 판정한다. 그보다 오래된 같은 조합은 '음성 만들기'로 보이지만 누르면 start가 studioFind로 찾아 크레딧 0으로 연다(계획 리뷰 P9·E11).
	// 입력마다 찾기를 부르지 않으려고 둔 한계다. 자주 보이면 서명별 찾기 결과를 기억한다
	const saved =
		signature !== null &&
		items.data?.some(
			(item) =>
				item.status === "done" && comboSignature(item.request) === signature,
		) === true;
	const block = studioBlock({ voice, text, retryAt: studio.waiting });
	const problem = studio.problem ? studioProblemText(studio.problem) : null;
	const shown = studio.shown;
	const sampling = player.current !== null && player.current.status !== "failed";

	// 기본 샘플이 재생을 시작하면 결과를 멈춘다(오디오 요소 동기화)
	useEffect(() => {
		if (sampling) audioRef.current?.pause();
	}, [sampling]);
	// 이전 결과 '재생'으로 올린 결과는 바로 재생한다(만든 직후·저장된 결과 열기는 올리기만, 계획 '스펙과 다른 점' 13)
	useEffect(() => {
		if (shown?.autoplay) void audioRef.current?.play().catch(() => {});
	}, [shown]);
	function stopSample() {
		const current = player.current;
		// 같은 샘플을 다시 누른 것으로 멈춘다(실패한 샘플은 누르면 다시 받으므로 건드리지 않는다)
		if (current && current.status !== "failed")
			player.toggle(
				current.voiceId,
				current.name,
				current.voiceId,
				current.noun,
				current.owner,
			);
	}

	return (
		<section
			aria-label={STUDIO_TEXT.barLabel}
			className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:flex-row md:items-center md:justify-between"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
				{shown ? (
					<>
						{/* 어느 결과인지 캡션으로 말한다(디자인 리뷰 D3 초안: {성우} · {대본 앞 20자}…) */}
						<div className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-md">
							<p id={captionId} className="truncate text-muted-foreground text-sm">
								{shown.caption}
							</p>
							{/* biome-ignore lint/a11y/useMediaCaption: 만든 음성의 글은 대본 칸과 이전 결과 줄에 있다(생성 오디오에는 자막 트랙이 없다) */}
							<audio
								ref={audioRef}
								key={shown.url}
								controls
								preload="metadata"
								src={shown.url}
								aria-labelledby={captionId}
								className="w-full"
								onPlay={stopSample}
							/>
						</div>
						<Button
							variant="outline"
							size="lg"
							className="shrink-0"
							onClick={studio.downloadShown}
						>
							<Download data-icon="inline-start" aria-hidden="true" />
							{STUDIO_TEXT.download}
						</Button>
					</>
				) : (
					<p className="text-muted-foreground text-sm">{STUDIO_TEXT.noResult}</p>
				)}
			</div>
			<div className="flex flex-col gap-1 md:items-end">
				{request && block === null ? (
					<p className="flex items-center gap-1.5 text-sm tabular-nums">
						{saved ? (
							STUDIO_TEXT.savedCost
						) : (
							<>
								<Coins aria-hidden="true" className="size-4 text-warning" />
								{`${STUDIO_TEXT.costPrefix} ${usageText(estimate(request))}`}
							</>
						)}
					</p>
				) : null}
				<Button
					size="lg"
					className={cn(
						"w-full md:w-auto",
						lockedButton(block !== null && studio.busy === null),
					)}
					focusableWhenDisabled
					disabled={block !== null || studio.busy !== null}
					aria-describedby={problem ? problemId : block ? reasonId : undefined}
					onClick={(event) => studio.start(event.currentTarget)}
				>
					{studio.busy ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : saved ? null : (
						// 채운 청록 버튼 안의 유료 표식은 글자색이다(DESIGN.md 598행)
						<Coins data-icon="inline-start" aria-hidden="true" />
					)}
					{creating
						? `${STUDIO_TEXT.making} · ${elapsed}초`
						: saved
							? STUDIO_TEXT.openSaved
							: STUDIO_TEXT.make}
				</Button>
				{problem ? (
					<div
						id={problemId}
						className="flex flex-col items-start text-sm text-warning md:items-end"
					>
						<p>{problem.text}</p>
						{problem.connections ? (
							<Button
								variant="link"
								size="lg"
								nativeButton={false}
								className="px-0"
								render={<Link href="/connections" />}
							>
								{STUDIO_TEXT.connections}
							</Button>
						) : null}
					</div>
				) : block ? (
					<p id={reasonId} className="text-muted-foreground text-sm">
						{block}
					</p>
				) : null}
				<p role="status" className="sr-only">
					{creating ? STUDIO_TEXT.makingStatus : ""}
				</p>
			</div>
		</section>
	);
}
```

- [ ] **Step 2: 이전 결과를 쓴다**

```tsx
// apps/web/src/components/studio-results.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StudioItem } from "@tts-pilot-app/api/studio-contract";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Download, Play, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { MESSAGES } from "@/lib/classes-view";
import {
	firstLine,
	STUDIO_TEXT,
	studioResultLine,
	voiceNameOf,
} from "@/lib/studio-view";
import { orpc } from "@/utils/orpc";

import { boxClass, RowAction } from "./class-group";
import { ConfirmDialog } from "./confirm-dialog";
import { useStudio, useStudioItems } from "./studio-provider";

// 이전 결과 한 줄(스펙 4절): 대본 첫 줄 · 미확인 배지 / 언제 · 성우 · 크레딧(추정). 재생(올리고 재생)·내려받기·지우기.
// 처리 여부 미확인은 재생·내려받기가 없고 늦게 오면 완료로 바뀐다고 알린다
function ResultRow({
	item,
	name,
	now,
	onRemove,
}: {
	item: StudioItem;
	name: string;
	now: Date;
	onRemove: (button: HTMLButtonElement) => void;
}) {
	const studio = useStudio();
	const unknown = item.status === "unknown";
	// 지금 막대에 올라 있는 결과(디자인 리뷰 D3)와 조각을 받는 중인 결과(D8). 모양은 브리프가 정한다(초안)
	const current = studio.shown?.id === item.id;
	const receiving = studio.receiving?.id === item.id;
	const line = firstLine(item.request.text);
	// 줄마다 다른 접근 이름(대본 앞 20자, T5 resultSubject와 같은 방식)
	const subject = `${name} '${[...line].slice(0, 20).join("")}'`;
	return (
		<li
			aria-current={current ? "true" : undefined}
			className={cn(
				"flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4",
				current && "bg-primary-subtle",
			)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<p className="flex min-w-0 items-center gap-2">
					<span className="truncate font-bold">{line}</span>
					{unknown ? (
						<Badge variant="warning" className="shrink-0">
							{STUDIO_TEXT.unknownBadge}
						</Badge>
					) : null}
				</p>
				<p className="text-muted-foreground text-sm tabular-nums">
					{studioResultLine(item, name, now)}
				</p>
				{unknown ? (
					<p className="text-muted-foreground text-sm">
						{STUDIO_TEXT.unknownNote}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-1 self-end md:self-auto">
				{receiving ? (
					<span role="status" className="flex size-11 items-center justify-center">
						<Spinner aria-hidden="true" />
						<span className="sr-only">{`${subject} ${STUDIO_TEXT.receiving}`}</span>
					</span>
				) : unknown ? null : (
					<>
						<RowAction
							label={`${subject} ${STUDIO_TEXT.play}`}
							tip={STUDIO_TEXT.play}
							icon={Play}
							onClick={() => studio.open(item)}
						/>
						<RowAction
							label={`${subject} ${STUDIO_TEXT.download}`}
							tip={STUDIO_TEXT.download}
							icon={Download}
							onClick={() => studio.download(item)}
						/>
					</>
				)}
				<RowAction
					label={`${subject} ${STUDIO_TEXT.remove}`}
					tip={STUDIO_TEXT.remove}
					icon={Trash2}
					onClick={onRemove}
				/>
			</div>
		</li>
	);
}

// 이전 결과(스펙 4절): 최근 20개(완료·미확인). 지우기는 확인 창(앱 DB에서만, 공급자 기록은 그대로).
// 지운 결과가 플레이어에 있으면 비운다. 지운 뒤 포커스는 제목으로(줄이 사라진다)
export function StudioResults() {
	const studio = useStudio();
	const items = useStudioItems();
	const queryClient = useQueryClient();
	const remove = useMutation(
		orpc.studioDelete.mutationOptions({
			onSettled: () =>
				void queryClient.invalidateQueries({ queryKey: orpc.studioList.key() }),
		}),
	);
	const [removing, setRemoving] = useState<StudioItem | null>(null);
	const headId = useId();
	const headRef = useRef<HTMLHeadingElement>(null);
	const openerRef = useRef<HTMLButtonElement>(null);
	const now = new Date();
	return (
		<section aria-labelledby={headId} className="flex flex-col gap-3">
			<h2
				id={headId}
				ref={headRef}
				tabIndex={-1}
				className="font-bold text-lg outline-none"
			>
				{STUDIO_TEXT.results}
			</h2>
			{items.isPending ? (
				<Skeleton aria-hidden="true" className="h-32 w-full rounded-2xl" />
			) : items.isError ? (
				<div className="flex flex-col items-start gap-2">
					<p className="text-sm text-warning">{STUDIO_TEXT.resultsFailed}</p>
					<Button
						variant="outline"
						size="lg"
						onClick={() => void items.refetch()}
					>
						{STUDIO_TEXT.reload}
					</Button>
				</div>
			) : items.data.length === 0 ? (
				<p className="text-muted-foreground">{STUDIO_TEXT.resultsEmpty}</p>
			) : (
				<ul className={cn(boxClass, "divide-y divide-border")}>
					{items.data.map((item) => (
						<ResultRow
							key={item.id}
							item={item}
							name={voiceNameOf(studio.voices, item.request.voiceId)}
							now={now}
							onRemove={(button) => {
								openerRef.current = button;
								setRemoving(item);
							}}
						/>
					))}
				</ul>
			)}
			{removing ? (
				<ConfirmDialog
					title={STUDIO_TEXT.removeQuestion}
					description={STUDIO_TEXT.removeDetail}
					action={STUDIO_TEXT.remove}
					pendingText={STUDIO_TEXT.removing}
					failedText={MESSAGES.deleteFailed}
					doneText={STUDIO_TEXT.removed}
					pending={remove.isPending}
					send={(handlers) => remove.mutate({ id: removing.id }, handlers)}
					openerRef={openerRef}
					focusAfterDone={() => headRef.current}
					onClose={(done) => {
						if (done) studio.forget(removing.id);
						setRemoving(null);
					}}
				/>
			) : null}
		</section>
	);
}
```

- [ ] **Step 3: 머리·채널 고르기와 화면 전체를 쓴다**

```tsx
// apps/web/src/components/studio-editor.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Preset } from "@tts-pilot-app/api/preset-contract";
import { DropdownMenuItem } from "@tts-pilot-app/ui/components/dropdown-menu";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import Link from "next/link";
import { useRef, useState } from "react";

import { byName } from "@/lib/classes-view";
import { channelDefaultOf, STUDIO_TEXT } from "@/lib/studio-view";
import { failureOf } from "@/lib/voice-failure";
import { OWNED_LIST, orpc } from "@/utils/orpc";

import { LoopbackNotice } from "./notice";
import { PageHeader } from "./page-header";
import {
	LoadDialog,
	PresetLine,
	PresetMenu,
	usePresetLoad,
} from "./preset-menu";
import { usePresetList } from "./presets";
import { SamplePlayerProvider } from "./sample-player";
import { useSavedList } from "./saved-voices";
import { StudioBar } from "./studio-bar";
import { StudioCard } from "./studio-card";
import { StudioProvider, useStudio } from "./studio-provider";
import { StudioResults } from "./studio-results";
import { RadioMenu } from "./voice-conditions";

// 채널 고르기(스펙 4절, /voices 드롭다운과 같은 말): '채널 없음'이 맨 위, 채널이 없으면 메뉴 안 '채널·분류에서 만들기'.
// 그 채널의 Typecast 기본 프리셋이 있으면 T8 불러오기 창으로 바뀌는 값을 보이고 '불러오기'로 적용한다(로드맵 T8 메모). 없으면 채널만 바뀐다
function ChannelPicker() {
	const studio = useStudio();
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const presets = usePresetList();
	const load = usePresetLoad(studio.presetHost);
	const [asking, setAsking] = useState<Preset | null>(null);
	// 메뉴는 고르면 닫히며 채널 버튼으로 포커스를 돌린다. 창이 닫힐 때 돌아갈 곳을 따로 잡지 않는다(null이면 Base UI가 열기 전 포커스로 돌린다)
	const opener = useRef<HTMLElement>(null);
	const list = byName(channels.data ?? []);
	// 지운 채널을 기억하고 있으면 '채널 없음'으로 보인다(렌더 중 계산)
	const value = list.some((channel) => channel.id === studio.channelId)
		? (studio.channelId ?? "")
		: "";
	return (
		<>
			<RadioMenu
				label={STUDIO_TEXT.channel}
				value={value}
				strong={value !== ""}
				align="end"
				disabled={channels.isPending}
				options={[
					{ value: "", label: STUDIO_TEXT.noChannel },
					...list.map((channel) => ({ value: channel.id, label: channel.name })),
				]}
				onChange={(id) => {
					studio.setChannelId(id === "" ? null : id);
					const preset =
						id === "" ? null : channelDefaultOf(presets.data ?? [], id);
					if (preset) setAsking(preset);
				}}
				footer={
					channels.isSuccess && list.length === 0 ? (
						<DropdownMenuItem
							className="min-h-11 rounded-md text-sm"
							render={<Link href="/classes" />}
						>
							{STUDIO_TEXT.toClasses}
						</DropdownMenuItem>
					) : null
				}
			/>
			{asking ? (
				<LoadDialog
					preset={asking}
					view={studio.presetHost.loadView(asking)}
					openerRef={opener}
					onLoad={async () => {
						await load(asking);
						setAsking(null);
					}}
					onClose={() => setAsking(null)}
				/>
			) : null}
		</>
	);
}

// 머리(제목·채널·'프리셋') → 불러온 프리셋 줄 → 문단 카드 → 이전 결과 → 하단 막대(sticky, 마지막 자식이라 늘 화면 아래에 붙는다).
// 임시 작업을 읽기 전에는 카드 자리에 뼈대를 둔다(계획 '스펙과 다른 점' 14)
function StudioBody() {
	const studio = useStudio();
	return (
		<>
			<PageHeader
				title={STUDIO_TEXT.title}
				description={STUDIO_TEXT.description}
				actions={
					<>
						<ChannelPicker />
						<PresetMenu host={studio.presetHost} />
					</>
				}
			/>
			<div className="flex flex-col gap-5 px-4 pb-10 md:px-11">
				<PresetLine host={studio.presetHost} />
				{studio.restored ? (
					<StudioCard />
				) : (
					<Skeleton aria-hidden="true" className="h-56 w-full rounded-2xl" />
				)}
				<StudioResults />
				<StudioBar />
			</div>
		</>
	);
}

// 음성 작업실(T9 스펙 4절). 소유자가 없으면 주소 안내 하나다(담은 성우 목록의 UNAUTHORIZED로 판정, /voices와 같다)
export function StudioEditor() {
	const saved = useSavedList();
	if (failureOf(saved.error) === "unauthorized")
		return (
			<>
				<PageHeader
					title={STUDIO_TEXT.title}
					description={STUDIO_TEXT.description}
				/>
				<div className="px-4 pb-10 md:px-11">
					<LoopbackNotice title={STUDIO_TEXT.loopback} />
				</div>
			</>
		);
	return (
		<SamplePlayerProvider>
			<StudioProvider>
				<StudioBody />
			</StudioProvider>
		</SamplePlayerProvider>
	);
}
```

`apps/web/src/app/(app)/studio/page.tsx`를 바꾼다.

```tsx
import type { Metadata } from "next";

import { StudioEditor } from "@/components/studio-editor";

export const metadata: Metadata = { title: "음성 작업실" };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·생성은 StudioEditor가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드).
// 머리(제목·채널·'프리셋')도 StudioEditor가 그린다(작업실 상태를 읽는다). 제작 흐름 지도는 편집기로 바뀌어 없어졌다(스펙 2절)
export default function StudioPage() {
	return <StudioEditor />;
}
```

- [ ] **Step 4: 검사**

Run: `pnpm exec biome check --write apps/web/src/components/studio-bar.tsx apps/web/src/components/studio-results.tsx apps/web/src/components/studio-editor.tsx "apps/web/src/app/(app)/studio/page.tsx" && pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check apps/web/src/components/studio-bar.tsx apps/web/src/components/studio-results.tsx apps/web/src/components/studio-editor.tsx "apps/web/src/app/(app)/studio/page.tsx"`
Expected: exit 0

- [ ] **Step 5: 런타임 확인 (코디네이터, 유료 버튼은 확인 창 '취소'까지)**

`/studio`(1440·390, 라이트·다크):
- 담은 Typecast 성우 없이 열기: '성우 고르기', 창의 빈 상태, 버튼 잠금과 이유.
- 성우를 담은 뒤: 성우 고르기(정렬·이용 불가 흐림), '설정' 펼침·팔레트(v30·v21 성우), 강도 숨김, 감정 표식, '처음 값으로'.
- 대본: 빈 대본·2,001자 붙여 넣기(잘리지 않음, 이유 줄), 새로 고침 뒤 대본·성우·설정·채널 유지.
- '음성 만들기' → 확인 창('대본' 줄 앞 100자·총 글자 수, '크레딧 쓰고 만들기') → 취소, 포커스 복귀.
- 채널 고르기(기본 프리셋 있음·없음), '프리셋' 메뉴(불러오기 창의 성우 줄, 성우가 빈 프리셋의 안내, 성우 고르기 전 저장 꺼짐).
- 서버 로그로 공급자 호출 0회(목록 캐시 만료 시 무료 목록 조회는 따로 센다), 오류 예산 0.
- 대본 칸 Event Timing: 2,000자를 빠르게 칠 때 글자당 입력 지연(S19). 증거는 `tasks/evidence/T09/`.

---
### Task 10: 1차 버튼 hover 토큰 (CS-07)

**Files:**
- Modify: `packages/ui/src/styles/globals.css`(`--primary-hover` 라이트·다크, `@theme inline`)
- Modify: `packages/ui/src/components/button.tsx:10`
- Modify: `DESIGN.md:564`

**Interfaces:**
- Produces: Tailwind 색 `primary-hover`(`bg-primary-hover`). 라이트 brand-600 `oklch(0.46 0.076 201)`, 다크 brand-300 `oklch(0.84 0.09 198)`.

새 로직이 없는 토큰 교체라 단위 테스트는 두지 않는다. 확인은 빌드와 QA S17(1차 버튼 hover 색)이다.

- [ ] **Step 1: 토큰을 더한다(`globals.css`)**

`:root`의 `--primary-foreground` 바로 아래:

```css
	/* brand-600, 1차 버튼 hover(짙어짐, DESIGN.md 183행) */
	--primary-hover: oklch(0.46 0.076 201);
```

`.dark`의 `--primary-foreground` 바로 아래:

```css
	/* brand-300, 다크 1차 버튼 hover(밝아짐, DESIGN.md 184행) */
	--primary-hover: oklch(0.84 0.09 198);
```

주석은 윗줄에 둔다. 줄 끝에 길게 두면 Biome가 값을 세 줄로 접는다(계획 리뷰 E13).

`@theme inline`의 `--color-primary: var(--primary);` 바로 위:

```css
	--color-primary-hover: var(--primary-hover);
```

- [ ] **Step 2: 1차 버튼이 쓴다(`button.tsx`)**

```ts
				default: "bg-primary text-primary-foreground hover:bg-primary-hover",
```

- [ ] **Step 3: `DESIGN.md` 564행을 고친다**

```md
- **Button 기본(primary):** 청록 `{colors.primary}` 채움에 흰 글자, 14px 700, `{rounded.radius-8}`, 높이 32px. hover는 라이트 `{colors.brand-600}`(짙어짐), 다크 `{colors.brand-300}`(밝아짐)이다(CSS 토큰 `--primary-hover`, T9 CS-07). 포커스는 2px 청록 outline(간격 2px).
```

- [ ] **Step 4: 검사**

Run: `pnpm exec biome check --write packages/ui/src/styles/globals.css packages/ui/src/components/button.tsx && pnpm --filter web check-types && pnpm exec biome check packages/ui/src/styles/globals.css packages/ui/src/components/button.tsx && ! grep -rn "hover:bg-primary/80" packages/ui/src apps/web/src`
Expected: exit 0(마지막 `! grep`은 남은 곳이 없어야 통과한다. `bubble.tsx`의 `[&>…:hover]:bg-primary/80`은 이 글자와 맞지 않고 쓰지 않는 shadcn 말풍선이라 범위 밖이다, 계획 리뷰 E9). `globals.css`의 `--primary-hover` 두 줄이 한 줄씩 남는다. 앱 전체 hover 색은 QA S17(1440, 라이트·다크)에서 계산된 배경색으로 본다(코디네이터).

---

### Task 11: 문서

**Files:**
- Modify: `docs/domain/project.md`(기능·주요 흐름·화면과 URL·API·데이터 모델 표)
- Create: `docs/adr/0006-studio-audio-in-generation-record.md`(domain-modeling `ADR-FORMAT.md`)
- Modify: `docs/plans/implementation-roadmap.md`(T9 상태·구현 상태, T10·T11·T12·T14·T15·P1 메모에 스펙 13절)
- Modify: `docs/research/typecast-api-options.md`(확인일 줄에 2026-10-20 재확인, 계획 리뷰 P1)
- Modify: `docs/plans/tasks/T09-studio-typecast.md`(10절 표에 S20·S20b, S18 Tab 횟수, '스펙과 다른 점' 15)
- 확인(스펙 단계에서 고침): `docs/briefs/site-map.md`, `GLOSSARY.md`
- Modify: `tasks/todo.md` 백로그(라운드 블록 밖)

- [ ] **Step 1: `docs/domain/project.md`**
  - 기능 표: '음성 생성'(T9) 한 줄(대본 2,000자, 담은 Typecast 성우만, 확인 창, 두 번 눌러도 1회, 180초 기다림과 늦은 결과, 3MiB 나눠 받기, 이전 결과 20개, 임시 작업, 사용 이력).
  - 주요 흐름: 작업실 흐름(성우 고르기 → 설정·감정 팔레트 → 대본 → '음성 만들기' → 저장된 결과 찾기 → 확인 창 → 생성 → 조각 받기 → 재생·내려받기).
  - 화면과 URL 표: `/studio` 행(편집기, 비보호 페이지 + `protectedProcedure` 데이터, 소유자 없음은 주소 안내).
  - API 표: `studioCreate`·`studioFind`·`studioList`·`studioAudio`·`studioDelete`(용어 칸: 음성 생성, 생성 기록, 저장된 결과, 사용 이력). `savedVoiceList` 항목에 `lastUsedAt`·`useCount`. `trialList`·`trialAudio`·`trialDelete`·`trialFind`는 내 문장(`kind = 'trial'`) 기록만이라고 적는다.
  - 데이터 모델 표: `trial_generation` 행에 `kind`(check, 기본 `trial`), 부분 인덱스 `trial_generation_studio`, `audio` 저장 방식 `EXTERNAL`, 작업실 상한 32MiB·조각 3MiB, 늦은 결과(미확인 → 완료). 용어 칸에 '음성 생성'. `saved_voice` 행에 `last_used_at`·`use_count`(사용 이력)와 "작업실 성우 고르기·최근 사용(T9)… 예정" 문장을 지금 모습으로.
- [ ] **Step 2: ADR 0006** — 상태 '결정(2026-10-20)'.
  - 맥락: 2,000자 MP3는 12~16MB 추정이라 배포 응답 4.5MB를 넘는다(ADR 0002, `tts-provider` 오디오 입출력 절). 저장소(P1-02)는 미정이다.
  - 결정: 결과 오디오를 생성 기록 `trial_generation.audio`(bytea, 저장 방식 `EXTERNAL`)에 두고, 화면이 `/api/rpc` `studioAudio`로 3MiB씩 받아 합친다(스펙 2절 A안). 작업실 상한 32MiB, 30일 보관.
  - 대안: Vercel Blob과 서명 주소(새 서비스 의존, P1-02로 미룸), 스트리밍 응답(4.5MB 상한은 스트리밍에도 걸린다), base64 JSON(1.33배).
  - 결과: 큰 오디오가 DB에 쌓인다(운영 용량은 T15·P1-02). 조각 읽기는 압축하지 않은 TOAST라 앞부분을 풀지 않는다(Task 1 Step 7 측정값을 적는다). 늦은 결과 저장은 서버 프로세스가 살아 있어야 한다(T15 `after`).
  - ADR 0003과의 관계(계획 리뷰 P6): ADR 0003은 "오디오 저장이 약 500MB이거나 월 송신이 3GB에 가까워지면 오디오를 Vercel Blob(비공개)이나 Neon Object Storage로 옮긴다"를 재검토 조건으로 두었다. 이 결정은 그 조건 안의 선택이고, 500MB는 내 문장과 작업실 결과를 합친 `trial_generation.audio` 전체로 센다. 2,000자 결과가 12~16MB 추정이라 30일 안에 약 35개면 닿는다. 조각 받기는 결과 하나를 여는 데 그 크기만큼 송신한다. 확인 질의 `select pg_size_pretty(sum(octet_length(audio))) from trial_generation`을 적고, 조건에 닿으면 이 ADR을 대체하는 새 ADR로 옮긴다(T15·P1-02).
- [ ] **Step 3: 로드맵** — T9 표 상태는 닫을 때 '완료(날짜)'로, T9 절에 '구현 상태' 줄. 스펙 13절을 각 절의 'T9에서 넘어온 것'으로 옮긴다.
  - T10: `studio*`·나눠 받기에 다른 공급자. 감정 팔레트 규칙(커서 위치에 태그와 공백, 목록 밖 태그 허용, 태그를 모르는 모델로 바꾸면 알림). WAV 등 형식 고르기. `confirmCopy("studio")`를 공급자 비용 문구로 나누기. `runTrial` `onLate`는 Typecast만 실제로 늦게 끝난다. 공급자를 붙이기 전에 `studioCreate`·`trialCreate`의 실패 기록 블록(실패 정규화 → `settle` → 429 대기 기록)을 먼저 하나로 묶는다(계획 리뷰 E7). 시간 초과로 끊긴 Typecast 요청은 응답까지(최대 300초) 뒤에서 돌지만 동시 1건에 들지 않는다(라우터 `shortcut:`, 계획 리뷰 P8). `replayStudio`의 공급자 고정('typecast')을 푼다.
  - T11: 검수는 작업실 카드 안에. 교정 뒤 글자 수로 예상 사용량을 다시 센다.
  - T12: 저장 대본을 카드에 넣기·바꾸기, 임시 작업(`tts-pilot:studio:v1:*`)과 저장 대본 구분.
  - T14: `trial_generation`의 작업실 행도 소유자 이전 대상. 성우 검사(담은 성우)는 소유자별이라 그대로.
  - T15: 늦은 결과 저장을 배포 환경에서 유지(`after`), 함수 최대 실행 시간(180초 + 저장), 오디오 저장 용량과 보관 기간(P1-02, ADR 0003·0006의 500MB 조건), `query_timeout` 3초와 32MiB 쓰기(Task 1 Step 7 측정값과 Neon에서 다시 재기), 끊긴 요청이 동시 1건에 들지 않는 문제(P8)를 다중 사용자 전에 정한다.
  - P1-04~06: 카드 추가·분할·결합, 요청을 나눌지 compose를 쓸지.
  - T9 절 '구현 상태' 줄에 "`/presets` 채널별 보기는 이번에 하지 않고 백로그로 미뤘다"를 적는다(로드맵 T9 'T8에서 넘어온 것'의 "다시 본다"에 대한 결정, 계획 리뷰 P7).
- [ ] **Step 4: 확인** — `docs/briefs/site-map.md`의 `/studio` 행이 '스펙과 다른 점' 6·11·12·13과 맞는지(채널이 없을 때 메뉴 안 '채널·분류에서 만들기', 성우 고르기 전 저장 꺼짐, 이전 결과 '재생'은 바로 재생) 보고 다르면 그 행만 고친다. `GLOSSARY.md`의 '음성 생성'·'감정 팔레트'·'생성 기록'·'사용 이력'·'임시 작업'이 구현 이름(`kind = 'studio'`, `studioCreate`, `last_used_at`·`use_count`)과 맞는지 본다.
- [ ] **Step 5: 백로그(`tasks/todo.md`, 라운드 블록 밖)** — T5-02(늦은 결과)·CS-07(버튼 hover)에 처리 표시를 한다. PK-01은 `trial.ts`만 고쳤다고 적는다(`test-db.ts`·`voice-cache.ts`는 남음). 이번 라운드에서 미룬 지적을 '음성 작업실 (T9에서 미룬 것)' 절에 적는다. 적어도 다음을 넣는다: `/presets` 채널별 보기(P7), 실패 기록 공통화(E7, T10 먼저), 끊긴 요청과 동시 1건(P8), 최근 20개 밖 '저장된 결과 열기' 표시(P9·E11), 브리프에서 고르지 않은 디자인 리뷰 항목. P0-14·15·17·18·19·26 체크는 닫을 때(코디네이터).
- [ ] **Step 6: Typecast research 재확인 날짜** — `docs/research/typecast-api-options.md` 3행 확인일 줄에 한 줄을 더한다: "2026-10-20 재확인(T9): llms.txt의 TTS `text`는 '1 to 2000 characters'이고 단위(코드 포인트/UTF-16) 기재가 없다. 처리 시간·시간 제한 안내가 없다. 응답은 바이너리 오디오(MP3 320kbps 44.1kHz). 2026-10-05 뒤 변경 이력은 9/15·9/17 `remove_silence_ms`뿐이다(이 문서에 이미 있음). 공급자 API는 호출하지 않았다." 앱의 상한은 코드 포인트로 센다는 결정과 위험('설치본·문서로 확인한 것' 24)을 같은 줄에 붙인다.
- [ ] **Step 7: 스펙 10절 S20·S20b·S18** — `docs/plans/tasks/T09-studio-typecast.md` 10절을 고친다.
  - 표 끝에 두 줄을 더한다.
    - "| S20 | (코디네이터) CDP Fetch 가로채기로 `studioCreate` 응답을 넣어 둔 무음 결과로 채운다. 누르기 전 카나리(입력 검사에 반드시 실패하는 본문의 `studioCreate` fetch)가 가로채기 표식을 돌려줄 때만 '크레딧 쓰고 만들기'. 이동·새로 고침마다 카나리를 다시 한다 | 공급자 0회(카나리가 서버에 닿아도 입력 검사 `BAD_REQUEST`), '만드는 중'이 풀리고 결과가 플레이어에 올라옴(자동 재생 없음), 알림 '음성을 만들었어요', 이전 결과 갱신 |"
    - "| S20b | (코디네이터) S20에 더해 `studioAudio`를 500·404로 채움 | 500: 알림 '결과를 받지 못했어요…', 막대 오류 줄 없음. 404: '찾을 수 없어요'와 목록 갱신. 서버 요청·공급자 0회 |"
  - S18 행 '기대' 칸 끝에 "대본 칸에서 주 버튼까지 Tab 횟수 기록(이전 결과 0개·20개)"을 붙인다(계획 재리뷰 R5).
  - 10절 머리 문장 "'크레딧 쓰고 만들기'는 누르지 않는다" 뒤에 "(S20·S20b는 가로챈 응답이고 카나리를 통과한 뒤라 예외)"를 붙인다.

---

## 수용 기준과 확인 위치

| 스펙 8절 | 자동 테스트 | QA(10절) |
|---|---|---|
| 1 만들기 → 플레이어·이전 결과 | Task 4 "만들면 공급자 1회 … 이전 결과 한 줄", Task 5 `resultTarget`·`fetchAudio` | S5(확인 창까지), S20(카나리 뒤 가로챈 응답으로 플레이어까지), S20b(조각 받기 실패), 사용자 테스트 2·3 |
| 2 내려받기 파일 이름·공급자 0회 | Task 5 `downloadName`, Task 3 조각 | S7 |
| 3 빈 대본·2,001자·성우 없음·이용 불가 | Task 5 `studioBlock`, Task 4 "빈 대본·공백만·2,001자", "voice_unavailable" | S1, S3 |
| 4 두 번 누름·같은 요청 id·캐스팅 진행 중 | Task 4 "같은 요청 id 동시", "진행 중인 생성(내 문장 포함)", Task 3 `replayStudio` | S5, 사용자 테스트 2 |
| 5 같은 조합 → 저장된 결과 열기 | Task 4 "같은 조합 찾기는 공급자 0회", Task 3 `findStudio` | S6 |
| 6 3MiB 넘는 결과 조각 | Task 3·4 조각, Task 4 rpc-file 4.5MB, Task 5 `fetchAudio` | S7 |
| 7 시간 초과 미확인·늦은 결과 | Task 3 `runTrial`·Typecast 180초, `saveLate` 다섯, Task 4 "뒤늦은 성공·실패", Task 5 `unknownRefetch`(보고 있는 화면에서 완료로), `createFailureOf` | S8 |
| 8 사용 이력·정렬·세지 않는 경우 | Task 3 `recordUse`, Task 4 "성공 1회에 사용 이력 +1 …", Task 5 `pickableVoices`·`usageLine` | S2 |
| 9 프리셋·채널 기본 | Task 5 `studioLoadView`·`channelDefaultOf` | S10, S11 |
| 10 감정 팔레트 | Task 5 `emotionBadges`·`pressedEmotion`·`emotionPatch`·`emotionMark`, `confirmCopy`(설정 요약은 T5) | S4 |
| 11 새로 고침 유지·뺀 성우 | Task 5 `readSetup`·`savedOf` | S12, S13 |
| 12 1차 버튼 hover | — | S17 |
| 13 격리·소유자 없음 | Task 4 격리 4건(소유자 없음은 DB 없이도 돈다) | — |
| 14 유료 호출 0 | 라우터 테스트는 가짜 공급자, Typecast 테스트는 `fetchMock` | 전 시나리오 서버 로그 |
| 15 너비·테마·키보드 | — | S17, S18(대본 칸 → 주 버튼 Tab 횟수 기록) |
| 16 오류 예산 0 | — | 21·27·30행 |

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

- 20행: `pnpm check-types`, `pnpm exec biome check .`(기준과 비교하고 바꾼 파일만 따로 0), `pnpm build`.
- 21·27행: `next-dev-loop` `/_next/mcp`와 ego-browser(없으면 agent-browser). `/studio`·`/casting`(회귀)·`/presets`·`/voices`, 1440·390, 라이트·다크. 스크린샷은 `tasks/evidence/T09/`.
- QA 준비(30행 전, 코디네이터만): 개발 DB에 무음 MP3 결과 셋을 넣는다.
  - 파일: `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 5 -b:a 320k short.mp3`, 같은 명령 `-t 90`(3MiB 넘음).
  - 컨테이너에 복사해(`podman cp`) `pg_read_binary_file`로 `kind = 'studio'`, `status = 'done'` 행 둘과 `status = 'unknown'`(오디오 null) 행 하나를 넣는다.
  - 소유자는 담은 성우 행의 `owner_id`, 성우는 담은 Typecast 성우 id다. `settings`는 S6에 맞출 v30 자동 감정의 정리 값 `{"model":"ssfm-v30","emotion":"smart","language":"auto","tempo":1,"pitch":0,"volume":100}`이다.
  - 확인 뒤 지운다.
- S20(30행, 코디네이터만, '스펙과 다른 점' 15): 생성 성공 → 조각 → 플레이어 연결을 공급자 0회로 본다(계획 리뷰 E6).
  - 위 무음 결과 가운데 3MiB 넘는 행의 `id`·`created_at`·바이트 수로 oRPC 응답 본문을 만든다: `{"json":{"id":"<id>","createdAt":"<ISO>","usage":{"unit":"credit","amount":5},"bytes":<바이트 수>}}`(content-type `application/json`, 200). 이 모양은 eng 재리뷰가 메모리 안에서 링크가 그대로 푸는 것을 확인했다.
  - ego-browser 한 실행 안에서 CDP `Fetch.enable`(패턴 `*/api/rpc/studio*`, Request 단계) → about:blank에서 가로채기 확인 → `/studio` 이동. `Fetch.requestPaused`에서 URL이 `studioCreate`면 본문과 상관없이 무조건 `Fetch.fulfillRequest`로만 답하고(카나리인지 진짜 요청인지는 채우는 본문만 가른다), 이 URL에는 `continueRequest`를 어떤 분기에서도 부르지 않는다(요청이 개발 서버에 닿지 않는다. 계획 재리뷰 R6). `studioAudio`·`studioList` 등은 `continueRequest`로 보낸다. 다시 불러오면 같은 실행에서 다시 건다(`tasks/lessons.md` 2026-10-05 Ego CDP 교훈).
  - **누르기 전 카나리(계획 재리뷰 R1):** `/studio` 문서 안에서 `fetch("/api/rpc/studioCreate", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": "orpc" }, body: JSON.stringify({ json: { requestId: "t9-canary", request: {} } }) })`를 보낸다.
    - 가로채기 처리기는 본문에 `t9-canary`가 든 요청에 표식 본문 `{"json":{"canary":"t9-intercepted"}}`(200)를 채운다.
    - 응답 글이 이 표식 본문과 같을 때만 진행한다. 다르면(400 등 서버 응답, 네트워크 오류) 그 자리에서 멈추고 보고한다. '크레딧 쓰고 만들기'를 누르지 않는다.
    - 이동·새로 고침·처리기를 다시 건 뒤마다 다시 한다.
    - 카나리가 개발 서버에 닿아도 안전하다. `studioCreate`는 소유자 미들웨어 다음 입력 검사에서 `requestId`(uuid 아님)와 `request`(빈 객체)로 `BAD_REQUEST`를 돌려준다. 처리기(선점·성우 검사·공급자 호출)에 들어가지 않으므로 기록도 공급자 호출도 0이다(Task 4 "빈 대본·공백만·2,001자·다른 공급자는 입력 검사에서 거절" 테스트와 같은 경계, eng 리뷰가 DB 없이 확인).
  - 카나리를 통과하면 대본(넣어 둔 결과와 다른 글) → '음성 만들기' → 확인 창을 연다. '크레딧 쓰고 만들기'를 누르기 직전에 같은 카나리를 한 번 더 하고(새 탭·타깃 분리로 가로채기가 끊기지 않았는지, 계획 재리뷰 R6), 통과하면 누른다.
  - 기대: '만드는 중'이 풀리고 결과가 플레이어에 올라온다(자동 재생 없음), 알림 "음성을 만들었어요", 캡션이 그 대본·성우, 이전 결과가 다시 받아진다, 플레이어 재생·탐색, '내려받기' 파일 크기가 넣은 파일과 같다.
  - 개발 서버 로그에 `studioCreate` 요청이 0건(카나리 포함)이고 `studioAudio`는 조각 수만큼이다. 가로채기를 걸지 않았거나 카나리를 통과하지 못한 상태에서는 '크레딧 쓰고 만들기'를 누르지 않는다.
- S20b(30행, 코디네이터만, 계획 재리뷰 N2): 생성 뒤 조각 받기 실패 갈래. 같은 실행·같은 카나리 뒤에 `studioCreate`는 위처럼 채우고 `studioAudio`도 `Fetch.fulfillRequest`로 채운다(`continueRequest` 없음).
  - 500(`{"json":{"defined":false,"code":"INTERNAL_SERVER_ERROR","status":500,"message":""}}` 꼴)으로 채우면: 알림 "결과를 받지 못했어요. 이전 결과에서 다시 열어 주세요", 막대 오류 줄 없음, '만드는 중'이 풀림, 플레이어는 이전 상태 그대로.
  - 404(`{"json":{"defined":false,"code":"NOT_FOUND","status":404,"message":""}}` 꼴)로 채우면: 알림 "이미 지워졌거나 찾을 수 없어요"와 함께 이전 결과를 다시 받는다.
  - 서버 로그의 `studioCreate`·`studioAudio`가 둘 다 0건, 공급자 0회.
- S18 보강(계획 재리뷰 R5): 키보드만으로 쓸 때 대본 칸에서 '음성 만들기'(주 버튼)까지 Tab 횟수를 이전 결과 0개·20개 두 상태에서 기록한다(하단 막대 위치 DN-1의 판단 근거).
- 22~26행: impeccable critique·audit(메인 세션), web-design-guidelines, polish, 재확인, DESIGN.md(T9 빌드에서 더한 것: 문단 카드·감정 팔레트·하단 막대·성우 고르기 창).
- 28행: ponytail-review(이번 diff와 공통 모듈 소비자: `setting-fields`·`trial-section`·`trial-confirm`·`preset-menu`·`voice-conditions`·`page-header`·`trial.ts`·`errors.ts`).
- 29행: prokit-reviewer(code) 전체 diff. 37행: prokit-reviewer(security) 전체 diff(Task 4 뒤에 한 번 받은 것과 별도).
- 30~31행: 스펙 10절 S1~S20b 전부('크레딧 쓰고 만들기'는 S20·S20b의 가로챈 응답에서 카나리를 통과한 뒤에만 누른다), 깨끗한 프로필로 오류 예산. 디자인 리뷰 4절 12항의 QA 추가 항목(캐럿 가림 390, 복원 깜빡임, 막대 캡션, 감정 값 바뀜 알림, 비활성 성우 포커스)은 브리프가 고른 것만 본다.
- 36행: Task 11 문서 확인. 38행 `[confirm]`: 스펙 11절 절차와 "이번에 없는 것"(문단 추가·나누기·합치기 P1-04~06, 대본 저장 T12, 숫자 발음 검수 T11, 다른 공급자 T10, WAV, 일일 한도 없음). 실제 생성은 사용자 승인 뒤 1회(짧은 대본), 선택으로 1,500~2,000자 1회.

## 자기 검토 (writing-plans, 2026-10-20, 재리뷰 반영 뒤 다시)

1. **스펙 범위:**
   - 3절: 표 둘의 칸(Task 1), 프로시저 다섯·보관함 두 칸(Task 4), 계약(Task 2), 생성 기록 함수·같은 요청 id 재생·늦은 결과(Task 3).
   - 4절: 머리·채널·프리셋(Task 6·9), 문단 카드·팔레트·대본(Task 8), 성우 고르기 창(Task 8), 하단 막대·확인 창(Task 6·9), 이전 결과(Task 9), 임시 작업(Task 5·7). 배치·키보드 순서·문구는 18행 브리프가 정하고 Task 8·9를 그 뒤 한 번 고친다(코디네이터 결정 C3).
   - 5절 오류 표: Task 4 매핑, Task 5 `studioProblemText`·`createFailureOf`. 1차 버튼 hover(Task 10), 6절 문서(Task 11).
   - 빠진 요구 없음. 차이는 '스펙과 다른 점' 17개로 적었다(15~17은 계획 리뷰에서 더함).
2. **자리표시자:** 코드 단계는 모두 실제 코드다. Task 6 Step 1의 이동은 줄 범위(57~201행)를 글자 그대로 옮기는 지시이고 바뀐 `Options`는 전체를 적었다. Task 1 Step 7은 측정 스크립트 전체와 판정 규칙을 적었다. 문구와 Task 8·9의 배치는 초안이고 브리프가 확정한다(각 태스크 머리의 '브리프 뒤 고칠 것'). Task 11은 문서 내용 목록이다.
3. **이름 일치:**
   - API: `comboKey(request, kind)`·`Kind`·`findStudio`·`listStudio`·`audioPart`·`replayStudio`·`recordUse`·`saveLate`(Task 3 ↔ 4), `STUDIO_TIMEOUT_MS`·`SynthesizeOptions`(Task 3 ↔ 4 테스트), `voice_unavailable`(Task 2 ↔ 4 ↔ 5), `StudioResult`·`StudioItem`·`StudioItemInput`(Task 2 ↔ 3·5·7).
   - 상수: `STUDIO_TEXT_MAX`·`STUDIO_PART_BYTES`·`STUDIO_AUDIO_MAX`·`STUDIO_RESULTS_SHOWN`·`partsOf`(Task 2 ↔ 3·4·5·8), `LATE_REFETCH_MS`(Task 5 ↔ 테스트).
   - 화면:
     - `PresetHost`·`usePresetLoad`·`LoadDialog`(Task 6 ↔ 7·9), `castingLoadView`·`LoadView`·`fixedNote`(Task 5 ↔ 6), `confirmCopy`(Task 5 ↔ 6).
     - `Options` `onChange`·`palette`(Task 6 ↔ 8), `RadioMenu` `footer`·`PageHeader` `actions`(Task 6 ↔ 9).
     - `createFailureOf`·`unknownRefetch`·`resultTarget`·`ResultTarget`·`shownCaption`(Task 5 ↔ 7). `useStudio`·`useScript`·`useShownScript`·`useStudioItems`·`Shown`(`caption` 포함)·`receiving`·`start(opener, { regenerate })`(Task 7 ↔ 8·9).
     - `STUDIO_TEXT` 키(Task 5 ↔ 7·8·9: `receiveFailed`·`receiving`·`costPrefix`·`connections`·`title`·`description` 포함, 쓰지 않게 된 `playerLabel`은 지웠다).
4. **Review Focus:** 아홉 줄 모두 테스트나 확인 단계가 붙은 태스크가 있다(Task 3·4·5·6·7·8, QA S19·S20·S20b).
5. **테스트 수(계획 코드 기준):** api 새 테스트 40개(계약 6, 오류 틀 2, Typecast 1, 작업실 생성 기록 11, 프로시저 15, 격리 4, rpc-file 1). DB 없이 도는 13개(계약·오류 틀·Typecast·rpc-file·조합 키·DB 실패·소유자 없음)는 eng 재리뷰에서 통과했고 DB 27개는 아직 실행하지 않았다(skipped). web 새 테스트 27개(작업실 23, 확인 창 2, 프리셋 2). 재리뷰 뒤 바꾼 코드(`createFailureOf`의 처리 전 거절, R3의 `vi.waitFor`, Task 6 Step 8 명령)는 아직 돌리지 않았다.
6. **확신하지 못한 것:**
   - 32MiB 쓰기가 앱의 질의 제한 3초 안에 넉넉히 끝나는지(Task 1 Step 7에서 재고 판정 규칙대로 한다).
   - Typecast가 2,000자를 UTF-16으로 세는지('설치본·문서로 확인한 것' 24의 위험).
   - DB 테스트가 아직 실행되지 않았다(eng 리뷰는 skipped). `substring`의 `::int` 매개변수, `mapWith(Number)`, 부분 인덱스 조건 글자는 테스트 DB에서 처음 돈다.
   - node-postgres가 부분 인덱스를 쓰는 계획을 고르는지(조건 글자를 같게 썼다. 필요하면 코디네이터가 `EXPLAIN`).
   - Typecast 실제 생성 시간(사용자 테스트 7번).
   - Base UI `ToggleGroup`의 방향키 이동과 의미(브리프가 radiogroup을 고르면 설치본으로 확인).
   - S20·S20b의 가로채기와 카나리가 ego-browser 한 실행에서 그대로 되는지(응답 본문 모양은 eng 재리뷰가 확인했다. 오류 본문 `{"json":{"defined":false,…}}` 꼴은 QA에서 처음 본다).
   - `revokeObjectURL` 40초 지연이 모든 브라우저에서 내려받기를 끊지 않는지(QA S7).
