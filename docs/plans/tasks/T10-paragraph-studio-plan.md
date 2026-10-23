# T10-a 문단 작업실 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/studio`를 3단 작업대 문단 작업실로 다시 만든다. 대본을 빈 줄로 나눈 문단 카드마다 다섯 공급자의 담은 성우·설정으로 음성을 만들고(전체 만들기는 하나씩 차례로, 확인 한 번), 한 파일 WAV·문단 zip·문단 SRT로 받는다.

**Architecture:**
- `packages/api`: 작업실 요청 계약을 다섯 공급자 union으로 넓히고(공급자별 대본 상한), 저장된 결과를 요청 배열로 찾는 `studioFindMany`를 더한다. 네 공급자의 `synthesize`가 작업실 대기(180초)를 받게 하고, `studioCreate`의 Typecast 고정을 공급자별로 바꾼다(무료 모델 종료·ElevenLabs 배율·형식). 마이그레이션은 없다.
- `apps/web` 순수 함수: 문단 모델(`paragraph-script.ts`), 만들기 계획·상태 리듀서·요약(`make-all.ts`), 받기(SRT·파일 이름, `paragraph-files.ts`), 임시 작업 v2(`studio-draft.ts`), 문구(`studio-text.ts`). 드라마의 잇기·zip은 중립 이름(`sound-join.ts`·`zip-store.ts`)으로 옮기고 시각을 함께 돌려주는 `joinTimeline`을 더한다.
- `apps/web` 화면: 문단 목록은 작은 컨텍스트(`ParagraphsProvider`)에 두고 카드는 props로 받는다. 작업실 상태(`StudioProvider`)는 기본 성우·저장된 결과 표(서명 → 결과)·전체 만들기 리듀서·듣기·받기를 맡는다. 본문 폭 컨테이너 쿼리로 3·2·1단. 드라마의 쉼 칸·성우 창 부품을 대상만 바꿔 쓰게 한다.

**Tech Stack:** Next.js 16.3 App Router(React Compiler, `typedRoutes`), React 19.3, oRPC 1.15.4, TanStack Query 5.103, zod 4.6.5, drizzle-orm 1.0.0-rc.4, Postgres 18(로컬 5433), vitest 5, shadcn `base-lyra`(Base UI 1.8.0), Tailwind CSS 4, Biome 2.

**Spec:** [T10 스펙](T10-paragraph-studio.md)(사용자 확인 2026-10-23 "확인, 브리프로", 구속력 있는 정본). 화면 브리프 [음성 작업실](../../briefs/studio.md)(T10판, 2026-10-23 사용자 확정, Direction contract 14절). [로드맵 T10](../implementation-roadmap.md), `GLOSSARY.md`(문단·기본 성우·전체 만들기·음성 생성·줄 사이 쉼·저장된 결과·생성 기록).

## 스펙과 다른 점 (계획에서 정한 것, 계획 리뷰에서 확인한다)

1. **Airy 상한은 1,600자다.** 스펙 작성 뒤 2026-10-23 공식 문서(`/v1/audio/speech` input "1–1600자", 메인 세션 브라우저로 확인)가 T7.5 기록 1,280자와 달랐다. 스펙·용어집·로드맵은 이미 고쳤고, research 문서는 Task 14에서 고친다.
2. **T9-02는 접두어 인자만 한다.** 실패 기록(`recordFailure`)은 T9.5에서 한 곳으로 묶였다. 세 라우터(trial·studio·drama)에 남은 try/catch 골격은 한도(4MiB·32MiB), 늦은 결과 유무, 성공 저장 방식이 달라 묶지 않는다. 남은 `[trial]` 고정(`withStorage`, `runTrial` 실패 로그)만 인자로 받는다(T95-03).
3. **네 공급자는 시간 초과 때 요청을 끊어 늦은 결과가 없다.** 네 `synthesize`는 `timeoutMs`·`logPrefix`만 `runTrial`에 넘기고 `onLate`는 넘기지 않는다(끊긴 요청의 약속은 AbortError로 끝난다). 늦은 결과는 지금처럼 Typecast만이다(스펙 4.1과 같은 결론, 구현 경로를 정함).
4. **ElevenLabs 배율 조회와 대기 재확인을 함수로 뺀다.** `trialCreate`의 배율 블록(`routers/trial.ts` 114~143행)을 `routers/rates.ts`의 `rateFor`로 옮겨 `studioCreate`도 부른다. 동작은 그대로다. 빼먹으면 작업실 ElevenLabs 예상 사용량이 배율 1이 된다.
5. **`studioCreate`도 무료 모델 종료를 먼저 본다.** 스펙에 없는 T5 순서 규칙이다(`tts-provider` '중복 과금 막기'). Fish `s2.1-pro-free` 종료 뒤 문단 요청은 `free_ended`, 공급자 0회.
6. **`studioList`·`studioDelete`·`listStudio`·`studioItemSchema`는 마지막 화면 태스크(Task 13)에서 지운다.** 화면이 쓰는 동안 지우면 중간 태스크의 타입 검사가 깨진다.
7. **저장된 결과는 서명 표로 화면이 들고 있고, 모르는 서명만 늦게 찾는다.** 대본을 칠 때마다 쿼리 키가 바뀌는 `useQuery(studioFindMany)`를 쓰지 않는다. 화면은 `Map<서명, 찾은 결과 | null>`을 두고, 표에 없는 서명만 입력이 0.6초 멈춘 뒤 한 번에 찾는다(200개씩). 되돌린 문단은 표에 남은 서명이라 호출 없이 '만듦'으로 돌아온다(스펙 9절 8번).
8. **드라마의 `drama-join.ts`·`drama-zip.ts`를 `sound-join.ts`·`zip-store.ts`로 옮긴다.** 두 작업실이 같이 쓰는 모듈에 드라마 이름이 붙지 않게 한다. 드라마 import 여섯과 테스트 둘의 경로만 바뀐다. 시각을 돌려주는 `joinTimeline`을 더하고 `joinSounds`는 그것의 `blob`이다(드라마 동작 그대로).
9. **성우 고르기 창은 '담은 성우'·'프리셋' 두 탭이다.** 드라마 창의 '전체' 탭(카탈로그에서 골라 담기)은 두지 않는다(스펙 7절 P1-12 제외). 창 틀은 드라마 부품(`LoadingRows`·`FailedRow`·`SavedOption`·`PresetOption`)을 내보내 새 `VoicePickerDialog`가 대상 값으로 쓴다.
10. **ADR 0007을 쓴다.** ADR 0002와 `tts-provider`는 긴 대본 결합을 "Blob과 백그라운드 작업, P1-04"로 적었다. T10은 결합을 브라우저(Web Audio)에서 하고 서버는 문단 오디오만 저장한다. 이 결정과 한계(탭 메모리, 30분 목표)를 Task 14에서 ADR 0007로 남긴다.
11. **문단 쉼의 처음 값 0.5초는 새 상수다.** 드라마 `GAP_DEFAULT`(0.3)는 그대로 둔다(`PARAGRAPH_GAP_DEFAULT`).
12. **보내기 직전에 문단을 다시 본다(2026-10-23 사용자 결정 "보내지 않고 남김", 계획 리뷰 high).** 스펙 5.1 "문단은 보낼 때의 요청으로 만들어진다"를 이렇게 정한다. 전체 만들기는 확인한 큐를 차례로 보내되, 문단마다 보내기 직전에 ① 문단이 없거나 비었으면 건너뛰고, ② 지금 서명이 확인한 서명과 다르면 보내지 않고 '안 만듦'으로 남기며(확인한 범위 밖, 끝난 뒤 '이어서 만들기'가 새 확인 창), ③ `studioFind`로 그 요청을 다시 찾아 완료면 건너뛴다(다른 탭이 그사이 만들어 완료된 경우에 한해 같은 조합을 두 번 사지 않는다. 다른 탭의 요청이 아직 진행 중이면 서버의 동시 1건이 막고, 미확인이면 미확인 경고 확인 창이 맡는다). 순수 함수 `runMakeAll`(Task 7)이 맡는다. 그래서 `studioFind`는 남는다.
13. **멈춤과 화면 떠남은 ref로 막는다(계획 리뷰).** `await` 체인은 렌더된 리듀서 상태를 읽지 못한다. 멈춤 요청·실행 번호·마운트 여부를 ref에 두고, 언마운트 정리에서 실행 번호를 올리며, `runMakeAll`의 `shouldContinue()`가 매 문단 전에 그것을 읽는다(`rerender-use-ref-transient-values`).
14. **요청 id 규칙은 순수 함수다(계획 리뷰).** 서버는 같은 요청 id가 다시 오면 그 행의 상태를 그대로 돌려준다(`replayStatus`: 완료 → 결과, 진행 중 → `in_progress`, 미확인 → `unknown_outcome`, 실패 → 기록된 사유). 그래서 실패 종류별로 정한다.

    | 실패(`TrialProblem.reason`) | 다음 요청 id | 이유 |
    |---|---|---|
    | `in_progress` | 같은 id | 선점이 막혀 행이 없거나 내 앞 요청이 아직 진행 중이다 |
    | `unknown_outcome`(시간 초과, 그리고 `createFailureOf`가 바꾼 응답 못 받은 실패) | 같은 id. 중복 과금 경고가 있는 확인 창에서 사용자가 확인하면 새 id. 무료 계획이어도 미확인 서명이 있으면 확인 창을 띄운다(22) | 같은 id로 다시 물으면 서버 행이 완료면 결과를, 진행 중이면 `in_progress`를 돌려줘 두 번 사지 않는다. 행도 미확인이면 계속 멈추므로 확인 뒤 새 id |
    | 그 밖(`rate_limit`·`quota`·`provider_auth`·`no_permission`·`provider_input`·`provider_error`·`free_ended`·`voice_unavailable`·`no_key`·`storage`·`request_mismatch`, 그리고 공급자 전 거절 `unexpected`) | 새 id | 실패 행이 남았으면 같은 id가 같은 실패를 다시 돌려준다. 선점 전 거절이면 행이 없어 새 id여도 안전하다. 결과가 32MiB를 넘은 경우는 사유가 아니라 `provider_input` + `providerCode: "audio_too_large"`라 이 줄에 든다 |
15. **찾기는 계약을 통과하는 요청만 보낸다(계획 리뷰).** `studioFindMany` 입력은 계약 상한을 넘는 요청 하나로 배열 전체가 거절된다. 찾기 대상은 요청을 만들 수 있고(성우 있음) 길이가 상한 안인 비지 않은 문단이다(`findTargets`). 성우가 '이용 불가'인 문단은 빼지 않는다(이미 만든 결과를 찾아 '만듦'으로 돌려놓아야 한다, 16). `blockOf`의 길이 초과에 원문 UTF-16이 상한 × 4를 넘는 경우를 더한다(T9-05). 서명 표의 `null` 항목 가운데 지금 문단에 없는 것은 버린다(되돌리기에는 완료 항목만 필요).
16. **저장된 결과가 있으면 막는 이유를 보지 않는다(계획 리뷰).** 이미 만든 문단은 성우가 나중에 이용 불가가 되어도 '만듦'이고 전체 만들기·받기를 막지 않는다.
17. **프리셋 메뉴를 조금 넓힌다(계획 리뷰).** `PresetMenu`는 `host.provider` 하나로 목록을 거른다(`preset-menu.tsx:237`). `PresetHost.provider`를 `ProviderId | null`로 받아 `null`이면 다섯 공급자 모두 보인다(캐스팅·드라마는 지금처럼 공급자를 넘겨 그대로). 기본 성우 불러오기 비교는 새 순수 함수 `workLoadView`(성우·공급자·설정 비교, 쓸 수 없는 성우면 비움 알림)와 `usableDefaultVoice`(다섯 공급자).
18. **임시 작업의 설정 읽기는 새 함수다(계획 리뷰).** 화면에는 Typecast 전용 `typecastSettingsOf`(`studio-view.ts:341`)만 있고 zod 계약은 값으로 가져올 수 없다. `trial-options` 상수(모델 목록·`RANGES`·Airy 언어·스타일·태그·지시 상한)만 쓰는 `settingsOf(provider, raw)`로 넓힌다.
19. **넘겨받은 로드맵 메모 처리.** T9-03(끊긴 Typecast 요청이 동시 1건에 들지 않음)은 스펙 13절대로 T15로 미루고 로드맵 T15 메모로 옮긴다. T76-09(Retry-After 없는 429 기본 대기)는 백로그 유지(Gemini만 60초, 막대는 대기 시각이 있을 때만 잠금). T7.5-05(Airy 언어 설정과 대본 언어 불일치 요율)는 확인 창 Airy 줄에 기존 `costCopy`로 요율 근거('한국어 1글자 1.5크레딧')를 보이는 데까지 하고 자동 보정은 백로그 유지. Fish `synthesizeScene` 메모(로드맵 T10)는 장면(여러 화자) 전용이라 문단은 일반 `synthesize`(MP3)를 쓴다.
20. **만들기 큐·리듀서 파일 이름은 `lib/make-all.ts`다(계획 리뷰).** GLOSSARY '문단 제작 계획(Paragraph Plan)'은 `Work`를 가리키므로 파일 이름은 '전체 만들기(Make All)'를 따른다.
21. **문단 요청은 성우에 맞춘다(엔지니어링 리뷰 E1, Ruling D4).**
    - `paragraphRequest(p, work, voices, now)`는 담은 성우가 있으면 T5 `requestOf(saved.voice, p.text, { ...DEFAULT_SETTINGS, [provider]: settings }, now)`(`lib/trial-view.ts`)로 만든다. Typecast 모델·v21 감정·프리셋은 그 성우가 받는 값으로, Fish 무료 모델은 종료 뒤 `s2.1-pro`로 바뀐다.
    - T9 `studioRequestOf`·드라마 `lineRequest`와 같은 길이라 T9 결과의 서명이 맞는다(AC12).
    - 보관함에서 빠진 성우면 맞추지 않은 요청을 쓰고 찾기에만 쓴다(만들기는 `blockOf`가 막는다). 성우 목록이 아직 없으면 요청은 null이다(찾지 않고 '확인 중').
    - 맞춤은 찾을 때와 보낼 때만 한다. 저장 값(임시 작업)은 바꾸지 않는다. `now`는 렌더 중 `Date.now()`가 아니라 state·이벤트 시각에서 온다(교훈 2026-10-21).
22. **무료 계획도 미확인 문단이 있으면 확인 창을 띄운다(E2, Ruling D1).** 서버는 미확인 행의 같은 id에 늘 `unknown_outcome`을 돌려준다. 확인 창 없이 같은 id로 보내면 같은 멈춤이 되풀이되고 화면에서 빠져나갈 길이 없다. 드라마 규칙(`lib/drama-read.ts:176-201`)과 같다.
23. **카드 '만들기'도 전체 만들기와 같은 길이다(E3).** `makeOne`은 항목 하나로 같은 흐름(`start` → `studioFindMany([req])` → 유료이거나 미확인이면 확인 창 → `runMakeAll`)을 탄다. 요청 id는 같은 `requestIdFor` 표에서 받는다. 전체 만들기가 도는 동안(리듀서가 idle·stopped가 아니면) 카드 '만들기'는 `aria-disabled`로 잠긴다. 둘이 동시 1건을 서로 잡지 않게 한다.
24. **새 화면은 Task 11부터 페이지에 붙는다(E8, Ruling D2).** 태스크마다 화면 QA를 하려고 Task 11에서 `page.tsx`를 `ParagraphStudio`로 바꾼다. T9 파일 여섯은 그대로 컴파일되다 Task 13에서 지운다.
25. **받기는 마지막 잇기 결과 하나를 기억한다(E11, Ruling D3).** 키는 문단 id·결과 id·쉼을 이은 글자다. 같은 키면 WAV·SRT·이어 듣기가 다시 디코딩하지 않는다. 키가 바뀌면 버린다.
26. **합친 문단의 쉼은 뒤 문단 것이다(스펙 침묵, 계획 결정, D17).** 쉼은 '문단 뒤 쉼'이라, 합친 문단 뒤에 오는 쉼은 원래 뒤 문단의 쉼이었다. 성우·설정은 앞 문단 것이다. 스펙 5.1 ⋯ 메뉴는 항목 이름만 정하고 승계를 말하지 않는다. '앞 문단과 합치기'와 Backspace 합치기(두 문단의 성우·설정이 같을 때만)는 브리프 8절이 더했다. 사용자 테스트에서 확인한다.
27. **'확인 중' 상태를 둔다(스펙 침묵, 계획 결정, D7, 사용자 테스트에서 확인).** 서명 표에 키가 없으면(아직 찾지 않음) `checking`, 키가 있고 값이 `null`이면(찾았는데 없음) `unmade`다. 성우 목록이 없을 때도 `checking`이다. 카드는 '확인 중'일 때 '만들기'를 그리지 않아, 입력 뒤 0.6초 동안 '안 만듦'과 '만듦'이 깜빡이지 않는다. 막대 주 버튼은 성우 목록을 불러오는 동안과 복원 뒤 첫 찾기 전에만 잠근다. 입력 뒤 배경 찾기 중에는 잠그지 않는다(전체 만들기가 시작 전에 모두 다시 찾는다).
28. **진행 표기는 큐 기준이다(D9, 스펙 5.1 문구를 같은 날 고침).** 막대는 "28개 중 3번째 · 문단 12 · 18초"로 큐 순번과 문단 번호를 나눈다(옛 "문단 12/40 만드는 중"은 문단 번호와 완료 수가 섞인다). 스펙의 '지금 문단 보기' 링크는 막대 진행 줄 끝의 '문단 12 보기'로 둔다.

## Global Constraints

- 커밋은 라운드 끝에 한 번 한다. 태스크 경계는 장부에 tree SHA로 적는다. 도구는 `.superpowers/sdd/T10-paragraph-studio/tools/`(`snap.sh`·`pkg.sh`·`testdb.env`·`next-mcp.py`·`guard.js`·`errs.js`, 코디네이터가 둔다).
- 비밀값: `apps/web/.env`·`packages/db/.env`를 읽거나 출력하지 않는다. 테스트 DB 주소는 `source .superpowers/sdd/T10-paragraph-studio/tools/testdb.env`로만 넘기고, 증거에는 "로컬 5433 `tts-pilot-app_test`"만 적는다.
- 공급자와 개발 서버:
  - 실제 공급자를 부르지 않는다. 테스트의 공급자는 가짜 `synthesize`(라우터)와 `fetchMock`·`vi.useFakeTimers`(공급자 모듈)뿐이다.
  - 구현 서브에이전트는 개발 서버(`127.0.0.1:3001`)로 어떤 요청도 보내지 않고(브라우저·curl·fetch·스크립트 모두), 서버를 끄거나 켜지 않는다. `pkill`·`killall`·`.next` 삭제 금지.
  - `pnpm build`·DB 명령·`shadcn add`·런타임 확인·브라우저는 코디네이터만 한다.
  - 실제 생성은 사용자 테스트(스펙 12절)에서 사용자가 공급자·모델·글자(Fish는 UTF-8 바이트)·횟수를 보고 승인한 뒤에만 한다.
- 로컬 관리자 모드: 소유자는 `context.ownerId`에서만 얻는다. 모든 select·update·delete에 `owner_id` 조건. 작업실 프로시저는 모두 `protectedProcedure`. Server Action·새 Route Handler를 만들지 않는다.
- 화면별 기록: 작업실은 `kind = 'studio'` 행만 읽는다. 동시 1건(`trial_generation_one_pending`)은 세 화면을 합쳐 센다. 내 문장 듣기 조합 키(`kind = 'trial'`)와 Typecast 작업실 요청 모양(`{provider, voiceId, text, settings}`)을 바꾸지 않는다(T9 결과의 조합 키 호환).
- 상한: 문단 1~200개(`PARAGRAPHS_MAX`), 문단 글 1~2,000자(Airy 1,600자, `studioTextMax`), NFC 정리 뒤 코드 포인트. 원문은 상한 × 4 UTF-16까지만 받는다(`textSchemaOf`). 문단 뒤 쉼 0~5초 0.1초 단위, 처음 값 0.5초. 오디오 32MiB(`STUDIO_AUDIO_MAX`), 조각 3MiB(`STUDIO_PART_BYTES`). `studioFindMany` 입력 1~200개.
- 값 상수(`studioTextMax`, `PARAGRAPHS_MAX` 등)는 zod 없는 `providers/trial-options.ts`에 둔다. 화면은 계약 파일에서 `import type`만 한다.
- 로그는 한 줄이다: 작업실 라우터 `[studio] …`, 공급자 실패 `[studio] <공급자> 생성 실패: <오류 이름>`(`logPrefix`). 대본·성우 id·오디오를 로그나 `ORPCError`의 `cause`·`data`에 넣지 않는다.
- 캐시 키: 무효화는 `.key()`, `setQueryData`·`getQueryData`는 `queryOptions(...).queryKey`(교훈 2026-10-07). 담은 성우 목록 갱신은 기존 `writeBack`만.
- 입력 지연(E10):
  - 문단 목록은 `ParagraphsProvider` 하나에만 둔다. 카드는 문단 객체를 props로 받고, 바뀌지 않은 문단은 같은 객체라 다시 그리지 않는다.
  - 작업 요약·막대는 `useDeferredValue(paragraphs)`를 읽는다(`rerender-use-deferred-value`).
  - 문단 요청·서명은 문단 객체별 `WeakMap`으로 기억한다(작업·성우 목록·`now`가 바뀌면 새 표). 바뀌지 않은 문단의 서명을 글자마다 다시 만들지 않는다.
  - 임시 작업 저장은 마지막 편집 300ms 뒤 한 번과 `pagehide`·언마운트 때 한다.
  - `useElapsed`(1초 갱신)는 막대와 만드는 카드 안에서만 부르고 컨텍스트 값에 넣지 않는다.
  - 카드는 `index.css`의 이름 붙은 utility `paragraph-card`(`content-visibility: auto; contain-intrinsic-size: auto <실측 높이>`, `rendering-content-visibility`, E18).
- 첫 로드 실패 판정은 데이터 없음 + `errorUpdateCount > 0`(교훈 2026-10-21). 렌더 중 `new Date()`·`Date.now()` 금지(교훈 2026-10-21, 시각은 이벤트 state·`dataUpdatedAt`).
- 화면 규칙: 토큰과 Tailwind 기본 눈금·이름 붙은 컨테이너 크기(`@4xl`, `@6xl`)만, 원시 hex·임의 값 `[...]` 금지, 굵기 `font-normal`·`font-bold`. 인터랙티브 44px 이상, 입력 767px 이하 `text-base md:text-sm`, `focus-visible`, 경고 글 `text-warning`. 유료 동작에 `Coins`(카드 '만들기'의 `Coins`는 회색, 브리프 3절 DN-1). 활성 채운 청록 버튼은 화면에 많아야 하나이고 잠긴 주 버튼은 outline(브리프 4절 우선순위). 가짜 진행률 없음. 한 번에 한 오디오(`usePlayer().stop`). `URL.createObjectURL`은 교체·언마운트 때 해제.
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`.
- 패키지: 앱 `web`, API `@tts-pilot-app/api`. 테스트 `pnpm --filter @tts-pilot-app/api test [파일]`·`pnpm --filter web test [파일]`, 타입 `pnpm --filter <이름> check-types`. DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돌고 skipped는 통과가 아니다. web vitest는 `@/` 별칭을 못 푼다(`lib/*.ts`끼리는 상대 경로). web 테스트 환경은 node(DOM 없음)라 컴포넌트는 테스트하지 않고 순수 함수만 테스트한다.
- ponytail: 스펙에 없는 추상화·옵션을 만들지 않는다. 의도한 한계는 `shortcut: <한계>, <언제 고칠지>` 주석.

## Review Focus

테스트가 직접 겨누지 않으면 쓰는 사람을 먼저 다치게 할 입력 다섯이다. 각 줄의 테스트는 해당 태스크에 넣었다.

1. **만드는 중의 편집:** 이미 보낸 문단이 지워지거나 합쳐지면 결과는 서명 표에만 들어가고 다음 문단으로 넘어간다. 아직 안 보낸 문단을 지우면 건너뛰고, 고치면 옛 글을 보내지 않고 '안 만듦'으로 남긴다(Task 7 `runMakeAll` 테스트 다섯, 사용자 결정 2026-10-23).
2. **두 탭에서 같은 작업실로 전체 만들기:** 겹치는 순간에는 한쪽이 `in_progress`로 멈추고 이유를 보인다. 겹치지 않아도 보내기 직전 `studioFind`가 다른 탭이 만든 문단을 건너뛴다. 자동 재시도하지 않는다(Task 7 "in_progress는 멈춤", `runMakeAll` "find가 완료를 돌려주면 보내지 않고 건너뛴다").
3. **문장 끝이 없는 긴 덩어리(URL, 띄어쓰기 없는 글):** 상한에서 강제로 자른다. 빈 문단이나 상한 초과 문단을 만들지 않는다(Task 6 `splitLong` 테스트).
4. **임시 작업 속 계약 밖 값:** 지워진 성우, 모델이 바뀐 설정, 범위 밖 쉼, 200개 초과 문단을 버리거나 처음 값으로 돌린다. 화면이 깨지지 않는다(Task 8 `readWork` 테스트).
5. **받는 도중 문단 편집:** 받기는 누른 때의 문단·서명·쉼으로 고정한다. 도중 편집이 파일·자막 시각을 섞지 않는다(Task 7 `receivePlan` 테스트).

## 계획 리뷰 (2026-10-23)

- `prokit-reviewer(plan, opus)`: changes-required, max=high, 지적 13(high 1, medium 5, low 7). 모두 코드로 확인했다(예: `preset-menu.tsx:237`의 공급자 거르기, 드라마의 `studio-view` import 열둘, `useRate`·`costCopy`·`remainingLines`는 이미 내보냄).
- 2차 재리뷰(sonnet): changes-required, max=medium, 지적 1(`usablePresetVoice` 인자 변경이 T9 화면 호출부를 Task 13 전에 깨뜨림) → 새 `usableDefaultVoice`로 반영(Task 8).
- 재리뷰(sonnet): changes-required, max=medium, 지적 6(찾기 대상과 만듦 우선의 충돌, 찾는 사이 떠남·찾기 실패, 실패 종류별 요청 id 분류, `MakeItem`·건너뜀 이벤트, `usablePresetVoice` 순서, `studioFind` 문구). 모두 반영했다('스펙과 다른 점' 12·14·15, Task 7·8).
- 반영: high(보내기 직전 확인)는 사용자에게 물어 "보내지 않고 남김"으로 정했다('스펙과 다른 점' 12). medium 다섯(멈춤 ref 13, 요청 id 순수 함수 14, 찾기 대상 15, 프리셋 메뉴 17, 브리프 6·10·11 연결)과 low 일곱(빠진 테스트, onLate는 Typecast만, `rateFor` 접두어, 만듦 우선 16, `settingsOf` 18, 소비자 목록 정정, 메모 처리 19, `tts-provider` 스킬 119행, 파일 이름 `make-all.ts` 20, `studioFind` 유지)을 계획에 넣었다. 기각 없음.
- 3차 재리뷰(sonnet): approve, max=none.
- 보강 리뷰 둘(결과 파일 `.superpowers/sdd/T10-paragraph-studio-plan/review-plan-{eng,design}.md`):
  - gstack plan-eng-review 방법론(opus): approve-with-fixes, max P1, 지적 E1~E22. 결정 D1~D4는 추천안으로 정했다(Ruling, '스펙과 다른 점' 21·22·24·25). 모두 반영했고 기각 없음.
  - gstack plan-design-review 방법론(sonnet): 7/10, high 5·medium 14·low 5, 지적 D1~D24. 사용자 결정(2026-10-23): DN-1 카드 `Coins` 회색, DN-2 1440 3단 보장(3단 여백 24px·레일 14rem/16rem), DN-3 2단 요약 먼저, DN-7 문단 번호로 가기. DN-4(1단 설정 시트)·DN-5(채운 청록 규칙)·DN-6('문단 N 보기')는 추천안으로 정했다(Ruling). 확정 브리프를 고쳤고(브리프 머리에 기록) 계획 Task 11~14에 이었다. 기각 없음.
- 4차 재리뷰(sonnet, 보강 반영 확인): approve, max=medium, 지적 5(medium 2: 격자·막대 sticky 구조와 `studio-grid`, 진행 표기의 스펙 차이 / low 3: `planned`의 `blocked` 구별, 실패 때 '확인 중' 카드 비움, 26·27 근거 표기). 모두 반영했다('스펙과 다른 점' 26~28, Task 7·11·12·13, 스펙 5.1 진행 문구). 기각 없음.

## 읽은 스킬과 계획에 반영한 것 (2행 증거)

- `superpowers:writing-plans`: 태스크마다 Files·Interfaces·테스트 이름과 기대값·명령. 본문 코드는 신호·테스트가 정하지 않는 알고리즘(빈 줄 나누기, 문장 끝 자르기, 리듀서 전이)만 적는다.
- `prokit-api`: 프로시저 `protectedProcedure`, 소유자 조건, 입력 길이 제한, 바꾼 프로시저마다 격리 테스트(Task 4), `docs/domain/project.md` API 표(Task 14).
- `tts-provider`: 공식 문서 재확인(ElevenLabs·Fish·Gemini는 조사 에이전트, Airy는 메인 세션 브라우저 → 1,600자), 유료 호출은 승인 뒤, 같은 요청 id 재생, 동시 1건, 무료 모델 종료 선검사, ElevenLabs `maxRetries: 0` 유지, 오디오 형식은 `audio_type`, 다운로드는 생성을 부르지 않음, 가짜 진행률 없음. `providers/`가 `authPaths`라 security 리뷰 행이 붙는다.
- `prokit-web`: Client Component 최소, `orpc`+TanStack Query, 로딩·빈·오류·비인가 상태, 새 프리미티브·라이브러리 없음. `apps/web/AGENTS.md`(번들 문서 확인 규칙. 이번에 새 Next API를 쓰지 않는다: 페이지 파일·레이아웃·라우트는 그대로).
- `vercel-react-best-practices`: `rerender-use-deferred-value`(요약·막대), `rendering-content-visibility`(카드), `client-localstorage-schema`(v2 키), `rerender-defer-reads`·`rerender-functional-setstate`(처리기 안에서만 쓰는 값).
- `vercel-composition-patterns`: `architecture-avoid-boolean-props`(성우 창은 `target` 값), `state-context-interface`(쉼 칸·성우 창은 `{ value, onChange }`·`{ current, onPick }` 인터페이스).
- `prokit-ui`·impeccable: 확정 브리프 대로, 편집 직전 `reference/craft-floor.md`(화면 태스크 구현자 필독).
- ponytail: '만들지 않는 것'(스펙 7절), 추상화 거절('스펙과 다른 점' 2), 기존 부품 재사용.

## 재사용과 설정 (3행, `references/reuse-design.md`)

| 대상 | 기존 경로·소비자 | 결정 |
|---|---|---|
| 작업실 생성 경로 | `routers/studio.ts`, `trial.ts`(`claim`·`recordFailure`·`recordSuccess`·`saveLate`·`replayStudio`·`usableVoices`·`audioPart`) | 그대로 재사용, 공급자 고정만 푼다 |
| 저장된 결과 여러 개 찾기 | `trial.ts` `findMany`(kind 'trial'·완료만, 드라마 줄 읽기가 씀) | 별도 함수 `findStudioMany`: kind·미확인·bytes가 달라 `findMany`를 넓히면 드라마 소비자 계약이 바뀐다 |
| ElevenLabs 배율 | `routers/trial.ts` `elevenLabsRates`+블록 | 함수로 빼서 두 라우터가 공유(같은 책임, 함께 바뀜) |
| 설정 칸 | `components/setting-fields.tsx` `Options`(캐스팅·T9 작업실·드라마) | 그대로 재사용(공급자는 `request.provider`) |
| 확인 창(문단 하나) | `TrialConfirm kind="studio"` | 그대로 |
| 확인 창(전체 만들기) | 없음 | 새로 만듦. `remainingLines`·`costCopy`(`lib/trial-view.ts`, 이미 내보냄) 재사용. 배율은 `orpc.trialModels.queryOptions()`의 표에서 공급자·모델별로 읽는다(`useRate`는 요청 하나용이라 문단 하나 확인 창에만, E20) |
| 성우 맞춤 요청 | `lib/trial-view.ts` `requestOf`(T9 `studioRequestOf`, 드라마 `lineRequest`가 씀) | 재사용(`paragraphRequest`, '스펙과 다른 점' 21) |
| 미확인 확인 규칙 | `lib/drama-read.ts:176-201`(미확인이면 무료여도 확인) | 같은 규칙('스펙과 다른 점' 22) |
| 채널 기본 프리셋 | `lib/studio-view.ts` `channelDefaultOf`(Typecast만 거름, T9 화면이 씀) | 공급자 거르기를 지운다(E6, Task 8). 기본 프리셋은 채널당 하나라 T9 화면 동작은 Typecast 프리셋일 때 그대로 |
| 실패 문구 | `studioProblemText(problem)`(`studio-view.ts:553`, 끝에서 `trialProblemText("typecast", …)` 고정), `trialProblemText(provider, problem)`(`trial-view.ts`) | `studioProblemText(problem, provider = "typecast")`로 넓히고(T9 호출부 그대로), 새 `makeProblemText(provider, problem)`가 T10 문구 셋(미확인·진행 중·대기 시각)만 따로 하고 나머지는 넘긴다. `unknownExpiredOf(provider)`(E5) |
| 프리셋 메뉴 | `PresetMenu`·`PresetHost`·`LoadDialog`·`PresetLine`(캐스팅·T9 작업실·드라마 소비) | 작은 확장: `host.provider`가 `null`이면 다섯 공급자('스펙과 다른 점' 17), 기본 성우 호스트와 `workLoadView`. 새 `usableDefaultVoice`(Task 8)를 쓰고 T9 `usablePresetVoice`는 Task 13에서 지운다. `null`일 때 저장 창 이름표는 `voice.provider`, 덮어쓰기는 불러온 프리셋의 `preset.provider === voice.provider`일 때만(서버가 공급자가 다르면 거절, E14) |
| 잇기·zip | `lib/drama-join.ts`(drama-take·drama-provider·drama-read·drama-lines·drama-gap·`lib/drama-view.ts` 여섯이 import)·`drama-zip.ts` | 중립 이름으로 옮겨 공유('스펙과 다른 점' 8). 재생 키 문자열 `JOIN_KEY = "drama-join"`(`lib/drama-read.ts:391`)은 바꾸지 않는다 |
| 쉼 칸 | `drama-gap.tsx` `GapInput`·`LineGap`·`DefaultGap` | `GapInput` 내보냄, `LineGap`·`DefaultGap`는 `{ value, onChange, 문구 }` props로(드라마는 같은 모양으로 감싸 그대로). `LineGap` 숫자 칸 눌림 영역을 44px로(시각 28px 그대로, 드라마도 같이, 디자인 리뷰 D12). 문단 번호로 가기 칸도 `GapInput` 모양 |
| 화면 밖 그리기 미룸 | `index.css` `.voice-row`(`content-visibility`) | 같은 방식 `paragraph-card`(E18) |
| 머리 | `PageHeader`(모든 화면, 자기 좌우 여백 `px-4 md:px-11`) | 가운데 열 안에서 여백이 겹치지 않게 좌우 여백을 끄는 선택 prop 하나(다른 화면 그대로, Task 11) |
| 성우 창 | `drama-voice-dialog.tsx`(화자 인덱스에 묶임), `studio-voice-dialog.tsx`(T9, Typecast) | 드라마 부품 넷을 내보내고 새 `VoicePickerDialog`(대상 값). T9 창은 지운다 |
| 붙여 넣기 창 | `drama-paste-dialog.tsx`(화자 해석에 묶임) | 껍데기 모양만 따라 새로(`paragraph-paste-dialog.tsx`), 해석은 `paragraph-script.ts` |
| 막대 높이 | `bar-height.ts` `useBarHeight`·`useElapsed`·`WAIT_NOTE_AFTER`, `index.css` `studio-bar-*` | 그대로. `studio-bar-result`의 `[name="studio-script"]` 조건만 문단 칸 공통 표식으로 바꾼다 |
| 공용 화면 함수 | `lib/studio-view.ts`(드라마가 `listLoad`·`savedOf`·`usageLine`·`unknownNoteOf`·`safeName`·`kstStamp`·`createFailureOf`·`fetchAudio`·`pickableVoices`·`unknownRefetch`·`pressedEmotion`·`VOICE_ID`를 씀, `drama-provider.tsx:66-74`·`drama-view.ts:62-68` 등) | 이름 그대로. `fetchAudio`는 형식·크기 검사를 더하므로(Task 9) 드라마 테이크 받기도 회귀 확인. `unknownRefetch`는 `StudioItem` 대신 구조 타입(`{ status; createdAt }`)으로(Task 13). 작업실 전용 함수는 Task 13에서 쓰지 않는 것만 지운다 |

설정: 환경 변수·`.env.schema`·`turbo.json`·`next.config` 변경 없음(확인: `apps/web/.env.schema`의 공급자 키 다섯은 그대로 쓰고 새 변수가 없다). localStorage 키 `tts-pilot:studio:v2:work` 추가(v1 두 키는 옮긴 뒤 지운다).

검증(회귀): 드라마 읽기·받기·테이크(조각 `fetchAudio`)·성우 창(QA Q16), 캐스팅 내 문장 듣기(`trialFindMany`·`trialCreate` 테스트 그대로 통과), 프리셋 메뉴(캐스팅·드라마 목록이 지금처럼 그 공급자만), 시험 생성 조합 키 테스트(`trial-studio.test.ts` "시험 생성 키는 T5 그대로").

## 설치본·자료로 확인한 것

1. ElevenLabs 모델별 한 요청 상한(공식 models 문서 2026-10-23): v4 10,000, v3 5,000, multilingual_v2 10,000, flash_v2_5 40,000자. 2,000자는 모두 한 요청.
2. Fish Audio TTS: `text` 상한 문서 없음, `model` 헤더 허용값 `s1`·`s2-pro`·`s2.1-pro`·`s2.1-pro-free`·`drama-3`, `s2.1-pro-free` 2026-11-30까지(공식 블로그·변경 이력).
3. Gemini TTS: 입력 8,192·출력 16,384 토큰(모델 페이지). 25토큰/초 기준 약 655초라 2,000자(약 6~7분)는 계산상 안이다(공식 보장 없음, 13절 위험).
4. Airy `/v1/audio/speech` input "1–1600자"(2026-10-23 문서 브라우저 확인).
5. 소요 시간은 네 공급자 모두 문서에 없다. 180초 대기는 T9 그대로 두고 사용자 테스트로 잰다.
6. 네 공급자 `synthesize`는 지금 `(request)` 하나만 받아 `runTrial` 기본 60초다(`providers/*.ts`, 서버 코드 지도). Typecast만 `(request, options)`다.
7. `findMany`(`trial.ts` 383~416)는 `kind = 'trial'`·`status = 'done'` 고정이고 `bytes`가 없다. `studioColumns`(505~512)에 `bytes` 계산이 있다.
8. `joinWav`는 이미 `[머리, 조각, 무음, …]` 배열을 Blob에 그대로 넘긴다(큰 버퍼 복사 없음). 남은 최고 메모리는 16비트 조각 전체 + Blob 복사다(`drama-join.ts` 90행 `shortcut:`).

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `packages/api/src/providers/trial-options.ts` | `AIRY_TEXT_MAX`, `studioTextMax`, `PARAGRAPHS_MAX` | 1 |
| `packages/api/src/studio-contract.ts` (+test) | 다섯 공급자 작업실 요청, `studioFoundSchema`, `studioFindManyInputSchema` | 1 |
| `packages/api/src/providers/{errors,elevenlabs,fish-audio,airy,gemini}.ts` (+tests), `packages/api/src/routers/drama.ts` | `logPrefix`, 네 공급자 작업실 대기, 드라마 로그 접두어 `[drama]`(T95-03) | 2 |
| `packages/api/src/trial.ts` (+`trial-studio.test.ts`) | `findStudioMany`, `withStorage` 접두어 | 2, 3 |
| `packages/api/src/routers/rates.ts` (새), `routers/trial.ts` | `rateFor` 공유 | 3 |
| `packages/api/src/routers/studio.ts`, `routers/index.ts` (+`studio.test.ts`, `studio.isolation.test.ts`) | 다섯 공급자 `studioCreate`, `studioFindMany` | 4 |
| `apps/web/src/lib/sound-join.ts`, `zip-store.ts` (옮김, +tests) | 공유 잇기·zip, `joinTimeline` | 5 |
| `apps/web/src/lib/paragraph-script.ts` (새, +test) | 문단 모델과 편집 | 6 |
| `apps/web/src/lib/make-all.ts`, `paragraph-files.ts` (새, +tests) | 만들기 계획·리듀서·보내기 루프·요청 id·요약, SRT·파일 이름 | 7 |
| `apps/web/src/lib/studio-draft.ts`, `studio-text.ts` (새, +test), `lib/studio-view.ts`(`channelDefaultOf`, `studioProblemText`의 공급자 인자) | 임시 작업 v2와 옮기기, 문구, 공급자별 실패 문구 | 8 |
| `apps/web/src/components/drama-gap.tsx`, `drama-voice-dialog.tsx`, `studio-card.tsx`의 `EmotionPalette`, `preset-menu.tsx`, `lib/studio-view.ts`(`fetchAudio`) | 공유 부품 내보내기·작은 확장(드라마·캐스팅 동작 그대로) | 9 |
| `apps/web/src/components/paragraph-provider.tsx`, `paragraph-make.tsx` (새) | 작업실 상태·문단 컨텍스트·만들기·듣기·받기 | 10 |
| `apps/web/src/components/paragraph-studio.tsx`, `paragraph-rails.tsx`, `paragraph-paste-dialog.tsx`, `voice-picker-dialog.tsx` (새), `page-header.tsx`, `apps/web/src/index.css`, `app/(app)/studio/page.tsx` | 3·2·1단, 레일·작업 띠, 머리, 붙여 넣기 창, 성우 창, 페이지 전환 | 11 |
| `apps/web/src/components/paragraph-card.tsx` (새), `apps/web/src/index.css`(`paragraph-card`) | 문단 카드·가름선·단축키 | 12 |
| `apps/web/src/components/paragraph-bar.tsx`, `paragraph-confirm.tsx` (새), T9 화면 파일 여섯 지움(`studio-{provider,editor,card,bar,results,voice-dialog}.tsx`), 서버의 `studioList`·`studioDelete` 정리 | 막대·확인 창·받기 메뉴, T9 정리 | 13 |
| `docs/domain/project.md`, `docs/adr/0007-*.md`, `docs/research/airy-api-options.md`, `.claude/skills/tts-provider/SKILL.md`(119행), `docs/briefs/site-map.md`(확인), 로드맵, `tasks/todo.md` | 문서 | 14 |

## 대조표 행과 태스크

| 행 | 태스크·근거 |
|---|---|
| 5 구현 방식 | subagent-driven-development, 장부 `.superpowers/sdd/T10-paragraph-studio-plan/progress.md` |
| 6~11 스키마 | N/A: 마이그레이션 없음(스펙 4.1). 11행 db 리뷰도 N/A(스키마·질의 인덱스 변경 없음, `findStudioMany`는 기존 `trial_generation_studio` 부분 인덱스와 조합 키 조건) |
| 12 zod 계약 | Task 1 |
| 13 구현(서버) | Task 2~4 |
| 14 격리 | Task 4 |
| 16 code 리뷰 | Task 1~4 뒤 서버 diff. 자동으로 붙는 security 행도 이때(공급자 넷·`studioCreate`) |
| 19 구현(화면) | Task 5~13 |
| 36 문서 | Task 14 |

---

### Task 1: 작업실 계약 다섯 공급자 (`studio-contract.ts`, `trial-options.ts`)

**Files:**
- Modify: `packages/api/src/providers/trial-options.ts`, `packages/api/src/studio-contract.ts`
- Test: `packages/api/src/studio-contract.test.ts`

**Interfaces:**
- Produces:
  - `AIRY_TEXT_MAX = 1600`, `PARAGRAPHS_MAX = 200`, `studioTextMax(provider: ProviderId): number`(airy → 1600, 나머지 → `STUDIO_TEXT_MAX`) — `trial-options.ts`.
  - `studioRequestSchema`: `z.discriminatedUnion("provider", [...])` 다섯 분기 `{ provider, voiceId: voiceIdSchema, text: textSchemaOf(studioTextMax(p)), settings: <공급자>SettingsSchema }`. 분기 순서와 설정 스키마는 `trialRequestSchema`와 같다. `StudioRequest`는 `TrialRequest`에 대입 가능해야 한다(타입 단언 한 줄).
  - `studioFoundSchema = studioResultSchema.extend({ status: z.enum(["done", "unknown"]) })`, `StudioFound`.
  - `studioFindManyInputSchema = z.array(studioRequestSchema).min(1).max(PARAGRAPHS_MAX)`.
  - `studioItemSchema`·`StudioItem`은 그대로 둔다(Task 13에서 지움). `request` 칸은 넓힌 `studioRequestSchema`를 따른다.

- [ ] **Step 1: 지금 코드로 Typecast 조합 키를 적어 둔다.** 테스트 파일에서 고정 요청 `{ provider: "typecast", voiceId: "tc_a", text: "안녕하세요. 문단입니다.", settings: <DEFAULT_SETTINGS.typecast> }`의 `comboKey(studioRequestSchema.parse(req), "studio")` 값을 한 번 출력해 기대값 상수 `T9_KEY`로 적는다.
- [ ] **Step 2: 실패 테스트를 쓴다.**
  - `it.each(PROVIDERS)("%s: 상한까지 받고 상한 + 1은 거절한다")`: typecast·elevenlabs·fish_audio·gemini 2,000/2,001, airy 1,600/1,601(코드 포인트, 이모지 포함 한 줄).
  - `"Typecast 작업실 요청의 조합 키는 T9와 같다"`: `comboKey(parse(req), "studio") === T9_KEY`.
  - `"공백만인 대본은 거절한다"`(다섯 공급자).
  - `"studioFindManyInputSchema는 1~200개만 받는다"`: 0개·201개 거절, 200개 통과.
  - `"studioFoundSchema는 status done·unknown만 받는다"`.
  - `it.each(PROVIDERS)("%s: 설정 계약 밖 값은 거절한다")`(예: Typecast 없는 모델, ElevenLabs 속도 2.0, Fish 없는 모델, Airy 없는 스타일, Gemini 지시 101자).
- [ ] **Step 3:** `pnpm --filter @tts-pilot-app/api test src/studio-contract.test.ts` → 새 테스트 FAIL.
- [ ] **Step 4:** 위 Interfaces대로 구현한다.
- [ ] **Step 5:** 같은 명령 PASS, `pnpm --filter @tts-pilot-app/api check-types`·`pnpm --filter web check-types` exit 0. T9 화면(`studio-view.ts`·`studio-provider.tsx` 등)이 `StudioItem.request`를 Typecast로 읽다 깨지면 `request.provider === "typecast"` 좁히기 한두 줄로만 맞춘다(Task 13에서 지워질 코드라 동작을 바꾸지 않는다).

### Task 2: 네 공급자 작업실 대기와 로그 접두어

**Files:**
- Modify: `packages/api/src/providers/errors.ts`, `elevenlabs.ts`, `fish-audio.ts`, `airy.ts`, `gemini.ts`, `packages/api/src/trial.ts`(`withStorage`만), `packages/api/src/routers/drama.ts`(접두어만)
- Test: 각 공급자 테스트 파일(`providers/<공급자>.test.ts`), `trial-studio.test.ts`

**Interfaces:**
- `SynthesizeOptions`에 `logPrefix?: string`(기본 `"[trial]"`). `runTrial`의 실패 로그가 `${logPrefix} ${provider} 생성 실패: …`.
- elevenlabs·fish_audio·airy·gemini: `synthesize(request, options: SynthesizeOptions = {})` → `runTrial(provider, call, { timeoutMs: options.timeoutMs, logPrefix: options.logPrefix })`. `onLate`는 넘기지 않는다(주석 한 줄: 이 공급자는 시간 초과 때 요청을 끊는다).
- `withStorage(provider, run, prefix = "[trial]")`.
- 드라마(T95-03, E15): `routers/drama.ts`의 `withStorage` 일곱 곳(112·119·124·133·280·287·295행 근처)에 `"[drama]"`, `synthesizeScene` 호출의 옵션에 `logPrefix: "[drama]"`. 드라마 동작은 그대로다.

- [ ] **Step 1: 실패 테스트(공급자마다, 가짜 시계):**
  - `"작업실 대기(timeoutMs)를 받으면 60초를 넘겨도 끊지 않는다"`: 응답을 120초 뒤에 주는 `fetchMock`, `timeoutMs: STUDIO_TIMEOUT_MS` → 성공.
  - `"timeoutMs를 넘기면 unknown_outcome이고 onLate를 부르지 않는다"`: `onLate` spy 0회.
  - `"logPrefix를 주면 실패 로그 접두어가 바뀐다"`(한 공급자, `console.error` spy가 `[studio] airy 생성 실패:`로 시작).
  - `trial-studio.test.ts`: `"withStorage는 접두어를 받아 DB 실패를 그 접두어로 남긴다"`.
  - `fish-audio.test.ts`: `"synthesizeScene에 logPrefix를 주면 실패 로그가 [drama]로 시작한다"`.
- [ ] **Step 2:** 해당 파일 테스트 FAIL 확인.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** `pnpm --filter @tts-pilot-app/api test src/providers src/trial-studio.test.ts src/routers/drama.test.ts` PASS, 기존 시험 생성 테스트(60초)와 드라마 라우터 테스트 그대로 통과.

### Task 3: 저장된 결과 여러 개 찾기와 배율 함수

**Files:**
- Create: `packages/api/src/routers/rates.ts`
- Modify: `packages/api/src/trial.ts`, `packages/api/src/routers/trial.ts`
- Test: `packages/api/src/trial-studio.test.ts`, `packages/api/src/routers/trial.test.ts`(그대로 통과)

**Interfaces:**
- `findStudioMany(db: Database, ownerId: string, keys: readonly string[]): Promise<(StudioFound | null)[]>`: `kind = 'studio'`(기존 글자 조건 `studioRow`를 재사용해 부분 인덱스 `trial_generation_find`·`trial_generation_studio`와 맞춘다, E17), 소유자, `comboKey in keys`, `status in ('done','unknown')`, 만료 전. 키마다 완료가 있으면 가장 최근 완료, 없으면 가장 최근 미확인. 키 순서대로, 오디오를 읽지 않고 만료를 늘리지 않는다. `bytes`는 `studioColumns`와 같은 계산.
- `rateFor(context: Context, request: TrialRequest, prefix = "[trial]"): Promise<number | null>` — `routers/rates.ts`. 안의 `withStorage`가 접두어를 받는다(T95-03). `trialCreate` 113~143행(ElevenLabs 배율 조회, 두 번째 대기 시각 확인, 모델 목록 429면 `rate_limit` 던짐)을 그대로 옮긴다. ElevenLabs가 아니면 대기 재확인만 하고 `null`.

- [ ] **Step 1: 실패 테스트(`trial-studio.test.ts`, 테스트 DB):**
  - `"findStudioMany: 키 순서대로 돌려주고 없는 키는 null"`.
  - `"같은 키에 완료와 더 늦은 미확인이 있으면 완료를 돌려준다"`, `"미확인만 있으면 status unknown"`.
  - `"실패·진행 중·만료·다른 소유자·kind trial·kind drama 행은 null"`.
  - `"bytes는 오디오 길이와 같고 만료 시각은 바뀌지 않는다"`.
- [ ] **Step 2:** FAIL 확인 → 구현 → PASS. `routers/trial.test.ts` 전부 그대로 PASS(배율·대기 재확인 테스트 포함).

### Task 4: `studioCreate` 다섯 공급자와 `studioFindMany`, 격리

**Files:**
- Modify: `packages/api/src/routers/studio.ts`, `packages/api/src/routers/index.ts`
- Test: `packages/api/src/routers/studio.test.ts`, `studio.isolation.test.ts`

**Interfaces:**
- Consumes: Task 1 계약, Task 2 `logPrefix`, Task 3 `findStudioMany`·`rateFor`.
- `studioCreate` 순서: 무료 모델 종료(`isFreeModel && !freeModelOpen()` → `free_ended`) → `no_key`(`context.providers?.[provider]?.synthesize`) → `comboKey(request, "studio")` → `replayStudio(…, provider)` → `usableVoices(db, ownerId, provider, [voiceId])` → `cooldownOf(provider)` → `rateFor(context, request, PREFIX)` → `estimate(request, rate)` → `claim` → `synthesize(request, { timeoutMs: STUDIO_TIMEOUT_MS, logPrefix: PREFIX, ...(provider === "typecast" ? { onLate } : {}) })`(늦은 결과는 Typecast만, '스펙과 다른 점' 3) → 32MiB 검사 → `recordFailure`/`saveLate` → `recordSuccess(…, { audio, audioType: audioTypeOf(provider) })`. `PROVIDER` 상수를 지우고 모든 `PROVIDER` 자리를 `request.provider`로. `withStorage(provider, …, PREFIX)`.
- `studioFindMany`: 입력 `studioFindManyInputSchema`, 출력 `z.array(studioFoundSchema.nullable())`, `findStudioMany(db, ownerId, input.map((r) => comboKey(r, "studio")))`를 `withStorage(undefined, …, PREFIX)`로.

- [ ] **Step 1: 실패 테스트(`studio.test.ts`, 가짜 `synthesize`를 다섯 공급자에 꽂는다. `keep` 헬퍼의 `provider` 타입을 다섯으로 넓힌다):**
  - `it.each(PROVIDERS)("%s: 만들면 공급자 1회, 기록 완료, 조각을 받을 수 있다")`, Gemini는 `studioAudio` File type `audio/wav`, 나머지 `audio/mpeg`.
  - `"ElevenLabs는 모델 배율로 예상 사용량을 센다(배율 1.5 → 2,000자 3,000크레딧)"`.
  - `"Fish 무료 모델이 끝난 뒤에는 free_ended, 공급자 0회, 기록 없음"`(`vi.setSystemTime` 2026-12-01 KST).
  - `"담지 않은 다른 공급자 성우는 voice_unavailable, 공급자 0회"`.
  - `"Airy 1,601자는 BAD_REQUEST, 공급자 0회"`.
  - `it.each(PROVIDERS)("%s: synthesize에 작업실 대기와 접두어를 넘긴다")`: 가짜 `synthesize`의 두 번째 인자가 `toMatchObject({ timeoutMs: STUDIO_TIMEOUT_MS, logPrefix: "[studio]" })`(E9).
  - `"Typecast가 아닌 공급자에는 onLate를 넘기지 않는다"`(가짜 `synthesize`의 두 번째 인자에 `onLate`가 없음을 단언. 끊는 보장은 Task 2 공급자 테스트).
  - `it.each(PROVIDERS)("%s: 성공하면 그 성우 use_count +1, 실패면 그대로")`.
  - 기존 `studio.test.ts:256` "…다른 공급자는 입력 검사에서 거절…"을 새 동작("다른 공급자도 만든다")에 맞게 바꾼다. 기존 Typecast 테스트(늦은 성공·180초·32MiB·같은 요청 id·진행 중)는 그대로 통과.
  - `"studioFindMany는 요청 순서대로 done·unknown·null을 돌려주고 공급자 0회"`.
- [ ] **Step 2: 격리 테스트(`studio.isolation.test.ts`):**
  - `"B의 studioFindMany는 A의 결과를 null로 보고, A의 id로 studioAudio는 NOT_FOUND"`, 같은 테스트에서 `"A의 studioFindMany는 자기 결과를 done으로 돌려준다"`.
  - `"B가 A가 담은 Fish 성우로 studioCreate하면 voice_unavailable, 공급자 0회"`.
  - 소유자 없음 테스트의 프로시저 목록에 `studioFindMany`를 더한다(`UNAUTHORIZED`, DB 0회, 공급자 0회).
- [ ] **Step 3:** FAIL 확인 → 구현 → `source …/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/studio.test.ts src/routers/studio.isolation.test.ts` PASS(skipped 0) → api 전체 테스트·타입 PASS.

### Task 5: 공유 잇기·zip과 시각 (`sound-join.ts`, `zip-store.ts`)

**Files:**
- Move: `apps/web/src/lib/drama-join.ts` → `sound-join.ts`, `drama-zip.ts` → `zip-store.ts`, 각 `.test.ts`도(`git mv`)
- Modify: 드라마 import 여섯(`drama-take.tsx`·`drama-provider.tsx`·`drama-read.tsx`·`drama-lines.tsx`·`drama-gap.tsx`·`lib/drama-view.ts`, `grep -rln "drama-join\|drama-zip" apps/web/src`로 확인). 재생 키 문자열 `JOIN_KEY = "drama-join"`(`lib/drama-read.ts:391`)은 import가 아니므로 바꾸지 않는다
- Test: `apps/web/src/lib/sound-join.test.ts`

**Interfaces:**
- `joinTimeline(sounds: readonly { blob: Blob; gap: number }[]): Promise<{ blob: Blob; spans: { start: number; end: number }[] }>`: `joinSounds`와 같은 디코딩·자르기·쉼. 조각을 16비트로 바꾸는 즉시 `new Blob([pcm])`로 넘겨 16비트 배열을 붙들지 않는다(최고 메모리 절반). `spans`는 초 단위, 조각 i의 시작·끝(쉼 제외).
- `joinSounds(sounds) => (await joinTimeline(sounds)).blob`(드라마 그대로).
- 순수 `spansOf(sampleCounts: readonly number[], gaps: readonly number[], rate: number): { start: number; end: number }[]` — 쉼은 `joinWav`와 같은 `max(0, round((gap - 2*EDGE_SECONDS)*rate))` 샘플.

- [ ] **Step 1:** `git mv` 넷(모듈 둘과 테스트 둘), import 경로 바꾸기 → `pnpm --filter web test` 기존 그대로 PASS.
- [ ] **Step 2: 실패 테스트:** `"spansOf: 쉼을 더하고 마지막 조각 뒤 쉼은 없다"`(샘플 [44100, 22050], 쉼 [0.5, 0.5], 44100 → [{0,1},{1.46,1.96}] 근사 `toBeCloseTo(…, 3)`), `"쉼이 EDGE 두 배보다 짧으면 0"`, `"spansOf의 끝 = joinWav 바이트로 센 길이"`.
- [ ] **Step 3:** 구현 → PASS. 드라마 동작 회귀는 QA Q16.

### Task 6: 문단 모델과 편집 (`paragraph-script.ts`)

**Files:**
- Create: `apps/web/src/lib/paragraph-script.ts`, `apps/web/src/lib/paragraph-script.test.ts`

**Interfaces:**
- 타입: `VoiceSetup = { [P in ProviderId]: { provider: P; voiceId: string; settings: SettingsOf[P] } }[ProviderId]`(`SettingsOf`는 `@tts-pilot-app/api/providers/trial-options`의 타입, `TrialRequest`와 같은 판별 모양). `Paragraph = { id: string; text: string; gap?: number; voice?: VoiceSetup }`. `Work = { defaultVoice: VoiceSetup | null; gap: number; channelId: string | null; paragraphs: Paragraph[] }`.
- 상수: `PARAGRAPH_GAP_DEFAULT = 0.5`.
- `splitBlocks(raw: string): string[]` — CRLF→LF, 공백만인 줄을 빈 줄로 보고 빈 줄 하나 이상으로 나눈 덩어리, 각 덩어리 앞뒤 공백 정리, 빈 덩어리 버림.
- `splitLong(block: string, max: number): string[]` — 코드 포인트로 `max` 이하가 될 때까지 나눈다. 자르는 자리는 `max` 안에서 가장 뒤의 문장 끝(`[.!?。…]` 또는 `다.`·`요.` 같은 마침표 뒤 공백, 줄바꿈)이고, 없으면 `max` 안 마지막 공백, 그것도 없으면 정확히 `max` 코드 포인트(서로게이트 쌍을 가르지 않음).
- `pasteToTexts(raw: string, maxOf: (i: number) => number, room: number): { texts: string[]; extra: number }` — `splitBlocks` → 덩어리마다 `splitLong` → 앞에서 `room`개만, 나머지 수 `extra`.
- 편집(모두 새 배열을 돌려주고 바뀌지 않은 문단은 같은 객체):
  - `pasteAt(ps, id, sel: { start: number; end: number }, raw, max: number, room: number): { ps: Paragraph[]; extra: number } | null` — 선택 영역은 붙여 넣은 글로 바뀐다. 빈 줄이 없는 글이면 `null`(가로채지 않고 브라우저 기본 붙여 넣기, 대본 칸의 기본 되돌리기를 지킨다, E7). `room`은 200개까지 남은 자리, 넘친 덩어리 수는 `extra`.
  - `splitAt(ps, id, caret)`(뒤 문단은 `voice`·`gap` 상태를 물려받고 새 id).
  - `mergeNext(ps, id): { ps: Paragraph[]; caret: number } | null` — 앞 문단의 `voice`, 쉼은 뒤 문단의 `gap`('스펙과 다른 점' 26). 글은 공백 하나로 잇고(한쪽이 비면 공백 없이) `caret`은 합친 글에서 이은 자리(UTF-16). 마지막 문단이면 `null`. 브리프의 '앞 문단과 합치기'는 앞 문단 id로 이 함수를 부른다.
  - `sameVoice(a: Paragraph, b: Paragraph, work: Work): boolean` — 두 문단의 `voiceOf`가 같은 공급자·성우·설정(Backspace 합치기 조건, 브리프 8절).
  - `move(ps, id, dir: -1 | 1)`, `removeAt(ps, id)`(마지막 하나면 빈 문단 하나 남김), `insertAfter(ps, id)`.
- `voiceOf(p: Paragraph, work: Work): VoiceSetup | null` — `p.voice ?? work.defaultVoice`.
- `paragraphRequest(p: Paragraph, work: Work, voices: readonly SavedVoice[] | null, now: number): StudioRequest | null`('스펙과 다른 점' 21) — 성우가 없거나 글이 공백만이거나 `voices`가 null이면 null. 담은 성우가 있으면 T5 `requestOf(saved.voice, p.text, { ...DEFAULT_SETTINGS, [setup.provider]: setup.settings }, now)`(`./trial-view`, 상대 경로). 담은 목록에 없으면 맞추지 않은 `{ provider, voiceId, text: p.text, settings }`. T5 이름 `requestOf`와 겹치지 않게 이 이름을 쓴다.
- `blockOf(p, work, voices: readonly SavedVoice[]): ParagraphBlock | null` — 순서: 빈 문단(`"empty"`, 막지 않음) → 성우 없음 `"no_voice"` → 담은 목록에 없거나 이용 불가 `"unavailable"` → 길이 초과 `{ kind: "too_long", length, max }`(코드 포인트가 `studioTextMax`를 넘거나 원문 UTF-16 길이가 그 × 4를 넘을 때, T9-05·'스펙과 다른 점' 15).
- `ownSettings(p, work, patch)`: 기본을 따르는 문단에 설정을 바꾸면 기본 성우·설정을 복사해 `voice`를 만든 뒤 patch.

- [ ] **Step 1: 실패 테스트:**
  - `splitBlocks`: `"여러 빈 줄·공백만인 줄·CRLF를 하나의 경계로 본다"`, `"앞뒤 공백을 지우고 빈 덩어리를 버린다"`.
  - `splitLong`(Review Focus 3): `"2,000자 안의 마지막 문장 끝에서 자른다"`, `"문장 끝이 없으면 마지막 공백"`, `"공백도 없는 URL은 정확히 max에서 자르고 서로게이트를 가르지 않는다"`, `"모든 조각이 1~max자"`.
  - `pasteToTexts`: `"200개를 넘으면 앞 room개와 extra"`, `"Airy 상한(1,600)을 쓰는 maxOf"`.
  - `pasteAt`(스펙 5.1): `"커서 앞 글과 첫 덩어리는 지금 카드, 가운데 덩어리는 새 카드, 마지막 덩어리에 커서 뒤 글"`, `"새 카드는 지금 카드의 voice·gap 상태를 물려받는다"`, `"빈 줄 없는 글은 null(가로채지 않음)"`, `"선택 영역은 붙여 넣은 글로 바뀐다"`, `"카드 붙여 넣기도 200개에서 멈추고 extra"`(E7).
  - 편집: `"splitAt: 커서 앞뒤로 나누고 뒤 문단이 성우·쉼 상태를 물려받는다"`, `"mergeNext: 앞 문단 성우, 뒤 문단 쉼, caret은 이은 자리, 마지막 문단은 null"`, `"sameVoice: 둘 다 기본을 따르면 참, 같은 성우라도 설정이 다르면 거짓"`, `"removeAt: 마지막 하나는 빈 문단으로"`, `"move: 첫 문단 위로·마지막 아래로는 그대로"`, `"바뀌지 않은 문단은 같은 객체"`.
  - `paragraphRequest`·`blockOf`: `"기본을 따르면 기본 성우로 요청"`, `"v21 전용 Typecast 성우 + 저장 v30·smart → 요청 v21·preset"`(E1), `"Fish 무료 종료 뒤(2026-12-01 KST) 무료 설정 → s2.1-pro"`(E1), `"보관함에 없는 성우는 맞추지 않은 요청"`, `"voices가 null이면 null"`, `"막는 이유 순서: no_voice → unavailable → too_long"`, `"원문 8,001 UTF-16(코드 포인트 2,000 이하)도 too_long"`, `"빈 문단은 요청 null이고 막지 않는다"`.
  - `ownSettings`: `"기본을 따르던 문단에 속도를 바꾸면 기본을 복사한 자기 성우가 된다"`.
- [ ] **Step 2:** FAIL → 구현 → `pnpm --filter web test src/lib/paragraph-script.test.ts` PASS.

### Task 7: 만들기 계획·리듀서·요약과 받기 (`make-all.ts`, `paragraph-files.ts`)

**Files:**
- Create: `apps/web/src/lib/make-all.ts`, `paragraph-files.ts` (+ 각 `.test.ts`)

**Interfaces:**
- `type Found = StudioFound` (계약 `import type`). `type FoundMap = ReadonlyMap<string, Found | null>`(키 = `comboSignature(request)`, 키 없음 = 아직 찾지 않음, `null` = 찾았는데 없음).
- 아래 함수의 `voices: readonly SavedVoice[] | null`·`now: number`는 Task 6 `paragraphRequest`에 그대로 넘긴다('스펙과 다른 점' 21).
- `paragraphStatus(p, work, voices, found: FoundMap, live: LiveMap, now): ParagraphStatus` — `"empty" | "checking" | "blocked" | "unmade" | "making" | "made" | "unknown" | "failed"`(`live`는 이번 화면의 서명별 진행·실패). 저장된 결과(완료)가 있으면 막는 이유를 보지 않고 `made`('스펙과 다른 점' 16). `voices`가 null이거나, 찾기 대상인데 표에 키가 없으면 `checking`('스펙과 다른 점' 27).
- `findTargets(ps, work, voices, found, all: boolean, now): StudioRequest[]` — 요청을 만들 수 있고(`paragraphRequest`가 null 아님) 길이 초과가 아닌 문단의 요청 가운데 `all`이면 전부, 아니면 표에 없는 서명만(중복 서명 하나로). 성우 이용 불가는 빼지 않는다('스펙과 다른 점' 15·16). `pruneFound(found, ps, work, voices, now): FoundMap` — 지금 문단에 없는 서명의 `null` 항목을 버린다('스펙과 다른 점' 15).
- `mergeFound(found: FoundMap, requests: readonly StudioRequest[], results: readonly (Found | null)[]): FoundMap`(E22) — 찾기 응답을 표에 합친다. 이미 `done`인 키는 늦은 `null`·`unknown`으로 내리지 않는다.
- 요청 id('스펙과 다른 점' 14의 표): `requestIdFor(ids: ReadonlyMap<string, string>, signature, makeId: () => string): { id: string; ids: Map }`(없으면 새 id), `afterFailure(ids, signature, reason: TrialProblem["reason"]): Map`(표대로 같은 id면 그대로, 새 id면 지움), `afterUnknownConfirmed(ids, signatures): Map`(미확인 서명은 경고 확인 뒤 지워 새 id). 사유는 기존 `createFailureOf`가 만드는 `TrialProblem.reason` 그대로(응답 없음은 이미 `unknown_outcome`).
- 보내기 루프(`'스펙과 다른 점' 12·13`): `runMakeAll(queue: MakeItem[], deps: { current(id): { signature: string } | "gone" | "empty"; find(request): Promise<Found | null>; send(item, requestId): Promise<Found>; idFor(signature): string; shouldContinue(): "go" | "stop" | "gone"; on(event: MakeEvent): void }): Promise<void>` — 문단마다 `shouldContinue()` → `current`(없음·빈 문단은 `skip`, 서명이 다르면 `changed`로 남김) → `find`(완료면 표에 넣고 `skip`, 던지면 보내지 않고 `fail` 뒤 끝) → **다시** `shouldContinue()`와 `current`(찾는 사이 떠남·멈춤·편집) → `send`(→ `sent`, 끝나면 `done`). `send` 실패는 `fail` 뒤 끝. `shouldContinue()`가 `"stop"`(멈춤 요청)이면 `halted`를 보내고 끝, `"gone"`(언마운트·다른 실행)이면 아무 이벤트 없이 끝(E4). 항목 하나짜리 큐(카드 '만들기', '스펙과 다른 점' 23)도 같은 함수다. 컴포넌트는 이 함수에 ref·클라이언트를 넘기기만 한다. `find` 결과는 계약상 status가 없어(`studioResultSchema`) 컴포넌트가 `{ ...r, status: "done" }`으로 맞춘다(E13).
- `type MakeItem = { id: string; n: number; request: StudioRequest; signature: string }`.
- `makePlan(ps, work, voices, found, now): { make: MakeItem[]; reused: number; firstBlocked: { id: string; n: number; block: ParagraphBlock } | null; unknown: string[]; free: boolean }` — 비지 않은 문단을 순서대로 보고, 저장된 결과(완료)가 있는 문단은 막는 이유를 보지 않고 `reused`(16). 결과가 없는 문단 가운데 막힌 것이 하나라도 있으면 `make`는 비고 `firstBlocked`. 같은 서명은 `make`에 한 번만 넣고 나머지는 `reused`로 센다(E12, 드라마 `drama-read.ts:176-178`과 같다). `free`는 `make`가 비지 않고 모든 요청이 무료 모델일 때.
- `usageByProvider(make, rates: (request: StudioRequest) => number | null): { provider; count; usage: Usage; rateMissing: boolean }[]` — `estimate(request, rate)` 합계(대본에 쓰인 공급자만, 첫 등장 순). 배율을 모르는 ElevenLabs 요청이 있으면 `rateMissing`(E20, 브리프 "배율을 확인하지 못했어요").
- 상태 리듀서 `makeReducer(state: MakeState, event: MakeEvent): MakeState`
  - `MakeState = { phase: "idle" | "finding" | "confirm" | "making" | "stopping" | "stopped"; run: number; queue: MakeItem[]; at: number; since: number | null; stopped: { id: string; n: number; provider: ProviderId; problem: TrialProblem | null } | null; left: string[]; notice: "nothing" | "find_failed" | null }`. `stopped.problem`이 `null`이면 사용자가 멈춘 것이다(`TrialProblem.reason`에 멈춤 사유를 더하지 않는다, E13). `provider`는 `MakeItem.request.provider`(E5).
  - 이벤트: `start`(run+1, finding, `left`·`notice` 비움) · `planned`(queue, blocked, unknown 수, free) · `confirm` · `cancel`(idle) · `sent`(at, since) · `done`(at+1, 끝이면 idle) · `skip`(at+1, 끝이면 idle) · `changed`(at+1, 남긴 문단 id를 `left`에 더함, 끝이면 idle) · `fail`(stopped, `problem`) · `findFailed`(idle, notice `find_failed`) · `stop`(making → stopping) · `halted`(stopping → stopped, problem `null`) · 다른 `run`의 이벤트는 무시. `left`는 확인 범위 밖이라 남긴 문단이다(막대 문구는 브리프 9절 "만드는 동안 고친 문단 N개는 만들지 않았어요").
  - `planned`의 다음 상태(E2·E4): `blocked`(`firstBlocked`가 있음)면 먼저 idle(막대가 막는 이유를 보인다, notice 없음), 그다음 큐가 비면 idle + notice `nothing`("새로 만들 문단이 없어요"), `!free || unknown.length > 0`이면 confirm, 그 밖(모두 무료이고 미확인 없음)은 making.
  - 실패 사유가 무엇이든 `fail`은 멈춘다(자동 재시도 없음). `making`·`finding`·`stopping` 중의 `start`, `confirm`이 아닐 때의 `confirm`은 무시한다(두 번 눌러도 한 번, 스펙 9절 5번).
- `summaryOf(ps, work, voices, found, now): { paragraphs: number; empty: number; chars: number; made: number; total: number; seconds: number }` — `seconds`는 1초 5자 올림(`GEMINI_CHARS_PER_SECOND`와 같은 값, 추정). 비지 않은 문단이 0이면 화면은 숫자 대신 "—"(브리프 5.6).
- `firstLink(state, plan, statuses): { kind: "stopped" | "blocked" | "unmade"; id; n } | null` — 브리프 5.6 우선순위.
- `fillOf(ps, work, barReady: boolean): "paste" | "default_voice" | "bar" | null` — 브리프 4절 채운 청록 우선순위(DN-5). 비지 않은 문단이 0이면 `paste`(기본 성우가 있어도), 대본이 있고 기본 성우가 없고 `voiceOf`가 null인 비지 않은 문단이 있으면 `default_voice`, 그 밖은 `barReady`(막대 주 버튼이 활성)면 `bar`, 아니면 `null`.
- `receivePlan(ps, work, voices, found, now): { ok: true; items: { id; n; found: Found; gap: number; voiceName; text }[] } | { ok: false; reason: "unmade"; unmade: number; firstId: string } | { ok: false; reason: "empty" }` — 누른 때의 값으로 고정한 배열(Review Focus 5). 마지막 문단의 쉼은 0. 비지 않은 문단이 0이면 `empty`(브리프 "받을 문단이 없어요", D6).
- `paragraph-files.ts`: `stripTags(text)`(대괄호 `[..]`·꺾쇠 `<..>` 태그와 남은 겹공백 제거), `srtTime(seconds)`(`HH:MM:SS,mmm`), `srtOf(cues: { start; end; text }[]): string`(1부터 번호, 빈 줄 구분, 끝 줄바꿈), `workFileName(firstText, at: Date, ext)`, `paragraphFileName(n, voiceName, text, ext)`(`{번호 3자리}_{성우}_{앞 20자}.{ext}`, `safeName`·`kstStamp` 재사용, 성우 이름 40자 상한(T9-05)).

- [ ] **Step 1: 실패 테스트:**
  - `makePlan`: `"저장된 결과가 있는 문단은 make에서 빠지고 reused에 센다"`, `"막힌 문단이 하나라도 있으면 make가 비고 firstBlocked는 첫 문단"`, `"빈 문단은 건너뛴다"`, `"모든 make가 Fish 무료면 free"`, `"make가 비면 free가 아니다"`, `"미확인 문단은 unknown에 담기고 make에도 남는다"`, `"같은 서명 문단 셋은 make 하나와 reused 둘"`(E12).
  - `usageByProvider`: `"ElevenLabs 배율·Airy 언어·Fish 바이트·Gemini usd_micro를 공급자별로 합한다"`, `"배율을 모르는 ElevenLabs 줄은 rateMissing"`.
  - `paragraphStatus`: `"완료가 있으면 성우가 이용 불가여도 made"`, `"표에 키가 없으면 checking, null이면 unmade"`, `"voices가 null이면 checking"`(D7).
  - `findTargets`·`pruneFound`·`mergeFound`: `"성우 없음·상한 초과(UTF-16 포함) 문단은 찾기에서 빠진다"`, `"이용 불가 성우 문단은 찾기에 들고, 찾으면 made이며 makePlan의 firstBlocked가 아니다"`, `"all이 아니면 표에 있는 서명은 빼고 같은 서명은 하나"`, `"지금 문단에 없는 null 항목은 버리고 완료 항목은 남긴다"`, `"mergeFound: 완료 키에 늦은 null이 와도 완료로 남는다"`(E22).
  - 요청 id: `"같은 서명을 두 번 물으면 같은 id"`, `it.each(["in_progress", "unknown_outcome"])("%s 뒤에는 같은 id")`, `it.each(["rate_limit", "quota", "provider_auth", "no_permission", "provider_input", "provider_error", "free_ended", "voice_unavailable", "no_key", "storage", "request_mismatch", "unexpected"])("%s 뒤에는 새 id")`, `"provider_input + audio_too_large 뒤에도 새 id"`(E13), `"미확인은 경고 확인 뒤에만 새 id"`. `"건너뛴 문단(skip·changed)은 at을 올린다"`.
  - `runMakeAll`(Review Focus 1): `"find를 기다리는 사이 shouldContinue가 gone이 되면 send 0회, 이벤트 없음"`, `"find를 기다리는 사이 멈춤을 누르면 send 0회와 halted"`(E4), `"find를 기다리는 사이 문단을 고치면 send 0회와 changed"`, `"find가 실패하면 send 0회와 fail 이벤트"`, `"보내기 전에 지운 문단은 보내지 않고 다음으로"`, `"보내기 전에 고친 문단은 옛 요청을 보내지 않고 changed"`, `"find가 완료를 돌려주면 보내지 않고 건너뛴다"`, `"항목 하나, find가 완료를 주면 send 0회"`(E3), `"shouldContinue가 stop이면 다음 문단을 보내지 않고 halted"`, `"send가 실패하면 fail 이벤트 뒤 끝나고 다음 문단을 보내지 않는다"`.
  - `makeReducer`: `"무료 계획은 confirm 없이 making"`, `"무료여도 미확인이 있으면 confirm"`(E2), `"빈 큐 planned는 idle과 notice nothing"`, `"blocked planned는 notice 없이 idle(빈 큐보다 먼저)"`, `"findFailed는 idle과 notice find_failed"`(E4), `"making 중 start와 confirm 아닐 때 confirm은 무시"`, `"done이 큐 끝이면 idle"`, `"stop은 지금 문단 끝(done 또는 fail) 뒤 stopped"`, `"halted는 problem null로 stopped"`, `"fail은 stopped에 provider를 담는다"`(E5), `"in_progress는 멈춤이고 다시 보내지 않는다"`(Review Focus 2), `"다른 run의 done은 무시"`, `"보낸 문단이 사라져도 done은 at만 올린다"`(Review Focus 1).
  - `summaryOf`·`firstLink`: `"빈 문단을 빼고 글자·만든 수·예상 초"`, `"우선순위 멈춘 문단 → 막힌 문단 → 안 만든 문단"`.
  - `fillOf`: `"대본이 없으면 기본 성우가 있어도 paste"`, `"대본이 있고 기본 성우·문단 성우가 없으면 default_voice"`, `"모든 문단에 자기 성우가 있으면 기본 성우가 없어도 bar"`, `"막대 주 버튼이 잠겼으면 null"`.
  - `receivePlan`: `"하나라도 안 만들었으면 ok false, unmade와 첫 문단"`, `"비지 않은 문단이 없으면 ok false, empty"`, `"마지막 문단 쉼 0, 나머지는 문단 쉼 또는 기본 쉼"`, `"부른 뒤 문단 배열을 바꿔도 돌려준 items는 그대로"`(Review Focus 5).
  - `paragraph-files`: `"srtTime 3725.5 → 01:02:05,500"`, `"srtOf 번호·빈 줄·끝 줄바꿈"`, `"stripTags는 [whispers]·<sigh>를 지우고 공백을 하나로"`, `"파일 이름의 못 쓰는 글자·공백은 _, 성우 이름 40자 상한, 한국 시간"`.
- [ ] **Step 2:** FAIL → 구현 → PASS.

### Task 8: 임시 작업 v2와 문구 (`studio-draft.ts`, `studio-text.ts`)

**Files:**
- Create: `apps/web/src/lib/studio-draft.ts` (+test), `apps/web/src/lib/studio-text.ts` (+test)
- Modify: `apps/web/src/lib/studio-view.ts`(`channelDefaultOf`, `studioProblemText`의 공급자 인자), `apps/web/src/lib/studio-view.test.ts`(715-727 기대값)

**Interfaces:**
- `WORK_KEY = "tts-pilot:studio:v2:work"`. `readWork(raw: string | null, voices: readonly SavedVoice[] | null): Work | null` — JSON·모양 검사, 문단 200개까지, `gap`은 `gapOf`, 설정은 새 `settingsOf(provider, raw)`('스펙과 다른 점' 18: `typecastSettingsOf`를 다섯 공급자로 넓힘, `trial-options` 상수만 쓰고 칸마다 계약 밖이면 처음 값. 태그·지시 글자는 상한과 함께 계약의 대괄호·줄바꿈 규칙(`trial-contract.ts:29-34`·`80-85`, 입력 칸 `setting-fields.tsx:127`·`177`과 같은 정규식)도 본다, E21), 성우는 목록이 주어졌을 때 담은 성우에 있을 때만(없으면 그 문단 `voice` 삭제·기본 성우 null), id 중복이면 새 id.
- `migrateV1(script: string | null, setup: string | null): Work | null` — T9 `SCRIPT_KEY`·`SETUP_KEY`(기존 `readSetup` 재사용)를 기본 성우(Typecast)·채널과 **나누지 않은 문단 1장**으로(스펙 2절). 둘 다 없으면 null.
- `writeWork(work): string`.
- `usableDefaultVoice(preset, voices): SavedVoice | null`(`studio-draft.ts`, 새): 다섯 공급자 모두, 그 프리셋 공급자의 담은 성우이면서 이용 가능일 때만. `workLoadView`와 기본 성우 호스트가 쓴다. T9의 `usablePresetVoice(preset)`(`studio-view.ts:406`, Typecast 전용, T9 화면 호출부 둘)는 Task 13에서 T9 화면과 함께 지운다.
- `workLoadView(preset, work, voices): LoadView` — 기본 성우 불러오기 창의 비교(성우·공급자·설정 변화, `usableDefaultVoice`가 null이면 성우 비움 알림). T8 `LoadView` 모양 그대로('스펙과 다른 점' 17).
- `PARAGRAPH_TEXT`(`studio-text.ts`, 브리프 9절 문구 전부, 함수형 키 `paragraphN(n)`·`stoppedAt(n, reason)`·`blockedAt(n, reason)`·`progress(at, total, n, seconds)` 등). T9 `STUDIO_TEXT`(`lib/studio-view.ts`)와 이름이 겹치지 않게 한다. T9 쪽은 Task 13에서 쓰지 않는 키를 지운다(드라마가 쓰는 함수는 그대로).
- 공급자별 문구(E5): `studioProblemText(problem, provider: ProviderId = "typecast")`(`studio-view.ts`, 끝의 `trialProblemText("typecast", …)`를 인자로. T9 호출부는 그대로 컴파일). `makeProblemText(provider, problem): { text: string; connections: boolean }`(`studio-text.ts`) — `unknown_outcome`·`in_progress`·대기 시각 있는 `rate_limit`만 브리프 9절 T10 문구('이어서 만들어 주세요', `retryTime`)로, 나머지는 `studioProblemText(problem, provider)`. `unknownExpiredOf(provider): string` — "확인 시간이 지났어요. 크레딧 사용 여부는 {공급자} 사용 기록에서 확인해 주세요"(`PROVIDER_LABEL`).
- `channelDefaultOf`(`studio-view.ts`)의 `preset.provider === "typecast"` 거르기를 지운다(E6). 채널 기본 프리셋은 채널당 하나라 공급자와 관계없다.

- [ ] **Step 1: 실패 테스트(Review Focus 4):** `"깨진 JSON·모양 밖 값은 null"`, `"200개를 넘는 문단은 앞 200개"`, `"범위 밖 쉼은 지운다"`, `"보관함에 없는 성우는 그 문단 voice를 지우고 기본 성우는 null"`, `"모델이 바뀌어 계약 밖인 설정은 처음 값"`, `"migrateV1: 대본은 나누지 않고 문단 1장, 성우·설정은 기본 성우"`, `"migrateV1로 옮긴 문단의 서명 = comboSignature(studioRequestOf(voice, script, all))"`(AC12 회귀, v21 전용 성우 포함, E1), `"v1 둘 다 없으면 null"`, `it.each(PROVIDERS)("settingsOf %s: 계약 밖 칸만 처음 값")`, `"settingsOf: 대괄호·줄바꿈이 든 태그·지시는 처음 값"`(E21), `"workLoadView: 공급자가 바뀌면 성우·설정 변화, 쓸 수 없는 성우면 비움 알림"`, `"usableDefaultVoice는 다섯 공급자 모두 그 공급자의 담은 성우만, 이용 불가는 null"`, `"makeProblemText: ElevenLabs no_key → ElevenLabs 문구, connections true"`, `"makeProblemText: 미확인은 그 공급자 사용 기록 문구"`(E5), `"channelDefaultOf: ElevenLabs 기본 프리셋도 돌려준다"`(기존 `studio-view.test.ts:715-727` 기대값을 뒤집는다, E6).
- [ ] **Step 2:** FAIL → 구현 → PASS.

### Task 9: 공유 부품 내보내기 (드라마·캐스팅 동작 그대로)

**Files:**
- Modify: `apps/web/src/components/drama-gap.tsx`, `drama-voice-dialog.tsx`, `studio-card.tsx`(`EmotionPalette`만 새 파일로), `preset-menu.tsx`(`PresetHost.provider`가 `null`이면 다섯 공급자), `apps/web/src/lib/studio-view.ts`(`fetchAudio`)
- Test: `apps/web/src/lib/studio-view.test.ts`(fetchAudio)
- Create: `apps/web/src/components/emotion-palette.tsx`

**Interfaces:**
- `drama-gap.tsx`: `export function GapInput(...)` 그대로 내보냄. `LineGap({ id, n, gap, defaultGap, onChange: (gap: number | undefined) => void, text: { name: (n) => string; reset: string; resetLine: string; unit: string } })`. `DefaultGap({ value, onChange, text })`. 드라마 쪽 호출부는 같은 문구·동작으로 감싼다(`useDrama`를 호출부로 옮김). `LineGap` 숫자 칸은 시각 28px(`h-7`) 그대로 두고 눌림 영역만 위아래 투명 확장으로 44px(브리프 5.5, 드라마도 같이, D12).
- `drama-voice-dialog.tsx`: `LoadingRows`, `FailedRow`, `SavedOption`(`usedBy` 선택 prop), `PresetOption` 내보냄.
- `emotion-palette.tsx`: `EmotionPalette`(T9 그대로 옮김).
- `useRate`(`trial-confirm.tsx`)·`remainingLines`·`costCopy`(`lib/trial-view.ts`)는 이미 내보내져 있어 고치지 않는다.
- `PresetHost.provider: ProviderId | null` — `null`이면 다섯 공급자 프리셋. 캐스팅·드라마는 지금처럼 공급자를 넘긴다. `null`일 때(E14):
  - `PresetLine`의 비교는 목록에서 찾은 `preset.provider`로 한다(`LoadedPreset`에는 공급자가 없다).
  - 저장 창 요약의 공급자 이름표(`preset-menu.tsx:396` `PROVIDER_LABEL[provider]`)는 `voice.provider`.
  - '덮어쓰기'는 불러온 프리셋의 `preset.provider === voice.provider`일 때만 보인다(서버 `presetOverwrite`가 공급자가 다르면 거절한다).
  - 호스트의 `settings: SettingsOf`는 `{ ...DEFAULT_SETTINGS, [setup.provider]: setup.settings }`로 만든다.
- `fetchAudio(bytes, part, …)`: Blob 형식은 첫 조각 `File.type`(없으면 `audio/mpeg`), 합친 크기가 `bytes`와 다르면 오류(T9-05). 드라마 테이크 받기(`drama-provider.tsx:636`)도 이 함수를 쓴다.

- [ ] **Step 1: 실패 테스트:** `"fetchAudio는 첫 조각 형식(audio/wav)으로 합친다"`, `"합친 크기가 bytes와 다르면 실패한다"`.
- [ ] **Step 2:** 옮기고 내보내고 고친다. 드라마·캐스팅 동작 변경 없음.
- [ ] **Step 3:** `pnpm --filter web check-types`·`test` PASS. 드라마 화면·테이크 받기·가름선 눌림 영역 회귀, 캐스팅 프리셋 메뉴 목록(그 공급자만)은 QA Q16(코디네이터).

### Task 10: 작업실 상태와 데이터 흐름 (`paragraph-provider.tsx`, `paragraph-make.tsx`)

**Files:**
- Create: `apps/web/src/components/paragraph-provider.tsx`, `apps/web/src/components/paragraph-make.tsx`(T9 `studio-provider.tsx`는 Task 13까지 그대로 둔다. 태스크마다 타입 검사가 깨지지 않게 새 화면은 새 파일로 만들고, 페이지는 Task 11에서 새 화면으로 바꾸며 T9 파일은 Task 13에서 지운다)

**Interfaces:**
- `ParagraphsProvider` / `useParagraphs()`: `{ paragraphs: Paragraph[]; edit: (fn: (ps: Paragraph[]) => Paragraph[], undo?: { message: string }) => void; setText(id, text) }` — 임시 작업 저장은 마지막 편집 300ms 뒤 한 번과 `pagehide`·언마운트 때(처리기·효과 안에서, 렌더 중 아님, E10). 되돌리기는 한 단계(알림의 '되돌리기'가 직전 배열로).
- `WorkProvider` / `useWork()`(T9 `useStudio`와 이름이 겹치지 않게): `restored`, `voices`·`voicesLoad`·`reloadVoices`, `work`(기본 성우·쉼·채널)와 `setDefaultVoice`·`setDefaultSettings`·`setGap`·`setChannelId`, `presetHost`(기본 성우 대상, Task 9 규칙), `found: FoundMap`, `findState: "first" | "ok" | "failed"`와 `refind()`, `live`, `make: MakeState`와 `makeAll(opener)`·`makeOne(id, opener)`·`stop()`·`confirm()`·`cancel()`, `listen(id)`, `receive(kind: "wav" | "zip" | "srt" | "play")`, `receiving: { phase: "fetch" | "join"; done; total } | null`, `shown`(막대 플레이어), `notice`, `rates`(`orpc.trialModels`의 배율 표, E20), `now`(state의 시각, 1분마다와 이벤트 때 갱신).
- 찾기('스펙과 다른 점' 7·27): 성우 목록이 온 뒤, 복원 뒤·입력이 0.6초 멈춘 뒤 표에 없는 서명을 `client.studioFindMany`로(200개씩), 응답은 `mergeFound`로 합친다. 전체 만들기 직전에는 모든 비지 않은 문단을 다시. 미확인이 있으면 15초마다(만든 지 6분까지, T9 `unknownRefetch` 규칙). 배경 찾기 실패는 `findState: "failed"`(막대 '다시 확인' = `refind()`).
- 전체 만들기(`paragraph-make.tsx` `useMakeAll`): `makeReducer`(화면 상태) + `runMakeAll`(Task 7, 보내기 직전 확인) + 요청 id 순수 함수(Task 7). 멈춤 요청·실행 번호·마운트 여부는 ref이고 언마운트 정리에서 실행 번호를 올린다('스펙과 다른 점' 13). `shouldContinue()`는 ref에서 `"go" | "stop" | "gone"`을 읽는다. `send`는 `create.mutateAsync({ requestId, request })`(`retry: false`, `networkMode: "always"`), `find`는 `client.studioFind`(결과에 `status: "done"`). 성공이면 `found`에 넣고 `done`. `in_progress`·`rate_limit`·`unknown_outcome`·그 밖 실패는 `fail`. 시작 전 `studioFindMany`가 실패하면 `findFailed`(E4).
- `makeOne(id, opener)`('스펙과 다른 점' 23): 같은 리듀서·`runMakeAll`을 항목 하나로. 유료이거나 미확인이면 문단 하나 확인 창(`TrialConfirm kind="studio"`, 미확인이면 중복 과금 경고). 리듀서가 idle·stopped가 아니면 카드 '만들기'는 잠긴다.
- 듣기·받기: 조각은 `fetchAudio`(Task 9)로 받아 id별 Blob 캐시(교체·언마운트 때 해제). `receive`는 `receivePlan`으로 고정 → 차례로 받기(`phase: "fetch"`) → `wav`/`srt`/`play`는 `joinTimeline`(`phase: "join"`), `zip`은 `zipStore`. 마지막 잇기 결과 `{ key, blob, spans }`를 ref에 하나 두고 key(문단 id·결과 id·쉼)가 같으면 다시 잇지 않는다('스펙과 다른 점' 25). Blob URL은 교체·언마운트 때 해제.
- 성우 목록·프리셋·채널은 T9 쿼리 그대로(`OWNED_LIST`). 채널 기본 프리셋은 `channelDefaultOf`(Task 8, 공급자 제한 없음).

- [ ] **Step 1:** 구현. 순수 판단(상태, 찾기 대상, 요청 id, 보내기 순서, 받기 목록)은 Task 6~8 함수만 부르고 새 규칙을 컴포넌트에 쓰지 않는다.
- [ ] **Step 2:** `pnpm --filter web check-types` PASS. 동작은 QA(코디네이터)로 확인한다(web 테스트는 DOM이 없다).

Task 11~13 공통 완료 조건: 브리프 10절(눌림 44px, 꺼진 것도 닿음, 토큰 색, 새 모션 없음, 아이콘 목록)과 11절(폭별 배치)을 지킨다.

### Task 11: 3·2·1단, 레일·작업 띠, 머리, 붙여 넣기 창, 성우 창, 페이지 전환 (브리프 4절 우선순위, 5.1~5.3, 5.6, 5.8, 6.1, 7절)

**Files:**
- Create: `apps/web/src/components/paragraph-studio.tsx`(본문 전체), `paragraph-rails.tsx`(작업 설정·작업 요약·1단 작업 띠·요약 시트), `paragraph-paste-dialog.tsx`, `voice-picker-dialog.tsx`(Task 12에서 옮김, E19)
- Modify: `apps/web/src/index.css`(레일 sticky utility `studio-rail-sticky`: `voice-panel-sticky`와 같은 모양, 격자 utility `studio-grid`: 2단·3단 열 템플릿을 컨테이너 쿼리로, 임의 값 `[...]` 대신), `apps/web/src/components/page-header.tsx`(좌우 여백을 끄는 선택 prop 하나, 다른 화면 그대로), `apps/web/src/app/(app)/studio/page.tsx`(`ParagraphStudio`를 그린다, '스펙과 다른 점' 24. T9 파일은 Task 13까지 남는다)

**Interfaces:**
- `VoicePickerDialog({ target: { kind: "default" } | { kind: "paragraph"; n: number }, current: VoiceSetup | null, onPick: (setup: VoiceSetup, presetId?: string) => void, onFollowDefault?: () => void, trigger: ReactNode })` — '담은 성우'·'프리셋' 두 탭, 공급자 묶음, 기본 샘플, 포커스 규칙(T9판 7절). Task 12 카드도 이것을 쓴다.
- 채운 청록은 Task 7 `fillOf` 하나로 정한다(레일·작업 띠·막대가 같은 값을 읽는다).

- [ ] **Step 1:** 편집 직전 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다.
- [ ] **Step 2: 배치(브리프 5.1·7절).**
  - 본문 래퍼(앱 메뉴를 뺀 칸, 여백 바깥)에 `@container`. 격자는 그 안쪽 요소다(컨테이너 쿼리는 자기 자신에게 적용되지 않는다). 3단(`@6xl`)은 본문 여백 `px-6`, 레일 14rem·16rem, 열 사이 1rem. 2단(`@4xl`)은 여백 그대로(`md:px-11`), 오른쪽 레일 16rem. 가운데 열 최대 48rem, 세 칸 묶음은 왼쪽 정렬.
  - DOM 순서는 모든 폭에서 하나: 머리 → 건너뛰기 링크 둘('문단 목록으로'·'만들기와 받기로', 화면 밖·포커스 때 보임) → 작업 띠(1단만) → 레일 묶음 `aside`(작업 요약 → 작업 설정) → 카드 목록 → 막대 자리.
  - 3단은 `aside`를 `@6xl:contents`로 풀어 작업 설정을 왼쪽 열, 요약을 오른쪽 열에 두고 각각 sticky. 2단은 `aside`가 오른쪽 열 하나로 sticky(요약이 맨 위, DN-3). 1단은 `aside`를 숨기고 작업 띠와 막대 요약 칩 → 시트. CSS `order`로 순서를 바꾸지 않는다.
  - 머리는 가운데 열 첫 행(`PageHeader` 좌우 여백 끔). 카드 목록 `ol`과 막대 `section`은 한 래퍼(가운데 열 둘째 행)에 두어 막대의 `sticky bottom-0`이 그 래퍼 안에서 움직이게 한다. 레일은 `row-start-1 row-span-2`(머리 행과 본문 행 둘을 덮는다).
  - 열 템플릿(3단 `14rem minmax(0,48rem) 16rem`, 2단 `minmax(0,48rem) 16rem`)은 `index.css`의 `studio-grid`가 정한다.
- [ ] **Step 3: 레일과 작업 띠(브리프 5.3·5.6).** 작업 설정(기본 성우 버튼 + 설정 요약 한 줄 + '설정' 펼침, 기본 쉼 `DefaultGap`, '대본 붙여 넣기', 단축키 접힘), 1단 작업 띠(기본 성우 · '설정' → `Sheet side="bottom"`의 같은 설정 칸(DN-4) · 기본 쉼 · '대본 붙여 넣기'), 작업 요약(`summaryOf`·`usageByProvider`·`firstLink`, 빈 값 "—", 링크 '멈춘/막힌/안 만든 문단 N 보기', 문단 번호로 가기 칸 + '이동'(DN-7, `GapInput` 모양, 범위 밖 경고), 배율 모름 줄). 1단 요약 시트의 링크·'이동'은 시트를 닫고 `requestAnimationFrame` 뒤 카드 숨은 제목으로 포커스(D21).
- [ ] **Step 4: 창.** 붙여 넣기 창(브리프 5.8: `pasteToTexts`, 세그먼트, 미리 보기, 200개 경고, 넣은 뒤 알림의 넘친 수와 되돌리기), 성우 고르기 창(기본 성우 대상).
- [ ] **Step 5: 화면 상태(브리프 6.1).** 복원 전 뼈대, 처음 방문(빈 카드와 '대본 붙여 넣기' 채움, `fillOf`), 담은 성우 0명(성우 창 빈 상태), 목록 실패(레일 '다시 불러오기', 교훈 2026-10-21 판정), 소유자 없음 `LoopbackNotice`. 카드 자리는 Task 12 전까지 대본 칸만 있는 단순 목록으로 둔다(Task 12가 바꾼다).
- [ ] **Step 6:** 타입·biome PASS. 페이지가 새 화면을 그리므로 코디네이터가 1440·1408·1366·1280·1024·960·768·390·320에서 찍어 단 수·가운데 폭(브리프 5.1 표)과 Tab 순서를 확인(QA Q1·Q2·Q17·Q18, 브리프 13절 폭 표·Q26).

### Task 12: 문단 카드, 가름선, 단축키 (브리프 5.4·5.5·6.1 200개·6.2·7·8)

**Files:**
- Create: `apps/web/src/components/paragraph-card.tsx`
- Modify: `apps/web/src/components/paragraph-studio.tsx`(Task 11의 단순 목록을 카드로), `apps/web/src/index.css`(`paragraph-card`: `content-visibility: auto; contain-intrinsic-size: auto <실측 카드 높이>`, E18·D11)

**Interfaces:**
- `ParagraphCard({ paragraph, n, total, status, voiceName, ... })` — 머리줄 첫 줄(번호·성우 · 상태·주 동작·'설정'·⋯), 둘째 줄(차이 칩, 있을 때만), 실패·미확인 한 줄(머리줄 아래·본문 위, 접힘과 무관, `makeProblemText`·`unknownExpiredOf`), 본문 대본 칸(`data-studio-script`, 높이 자람), 설정 칸(`Options` + `EmotionPalette` + '처음 값으로' + '기본 따르기'), ⋯ 메뉴 세 묶음. `memo` 없이 React Compiler에 맡기되 props는 문단 객체·원시값·안정 콜백만. `useElapsed`는 만드는 카드 안에서만(E10).
- 카드 세부(브리프 5.4, D16):
  - 지금 만드는 카드는 `primary-subtle` 바탕 + `aria-current="step"`.
  - 설정 칸은 한 번에 한 카드만 펼친다(펼친 문단 id 하나를 작업실 상태에 둔다).
  - 차이 칩을 누르면 설정 칸을 펴고 그 칩의 칸으로 포커스. 셋을 넘으면 넷째 자리 "+N".
  - 카드 '만들기'의 `Coins`는 회색(DN-1). 전체 만들기가 도는 동안 `aria-disabled` + 이유(E3).
  - ⋯ 메뉴: '앞 문단과 합치기' 포함(D17). 꺼진 항목은 이유를 둘째 줄에. '여기서 나누기'·'앞 문단과 합치기'에 회색 단축키 표기와 `aria-keyshortcuts`. 200개면 '아래에 문단 추가'·'여기서 나누기'가 꺼지고 "문단은 200개까지예요"(브리프 6.1).
  - 숨은 제목 '문단 N'은 `tabIndex={-1}`이고 이동 목적지다(`scrollIntoView({ block: "center" })` 뒤 포커스).
- 단축키(브리프 8): 대본 칸 `onKeyDown`. 조합 입력 중(`isComposing`)이거나 수정 키(Shift·Ctrl·Meta, `Alt+Enter`가 아닌 Alt)가 있으면 아무것도 하지 않는다.
  - 선택 없이 커서 0에서 `ArrowUp`·끝에서 `ArrowDown`이면 이웃 문단 칸으로(`preventDefault`).
  - `Alt+Enter`는 `splitAt`(200개면 아무것도 안 함).
  - 커서 0·선택 없음 `Backspace`는 `sameVoice(앞, 지금, work)`일 때만 `mergeNext(ps, 앞 id)`로 합치고 캐럿을 돌려받은 이은 자리에 둔다(첫 문단이거나 성우·설정이 다르면 아무것도 안 함).
- 포커스(브리프 7절 표): 붙여 넣기 '넣기'·되돌리기·⋯ 위로·아래로·나누기·합치기·지우기·차이 칩·'문단 N 보기'의 목적지를 이 태스크에서 맞춘다.
- 가름선: `LineGap`(Task 9 props, 눌림 영역 44px).

- [ ] **Step 1:** craft-floor 읽기 → 구현.
- [ ] **Step 2:** 브리프 6.2 문단 상태와 '주 동작' 열(글자 + 아이콘, 색만으로 말하지 않음, '확인 중' 포함)을 카드 머리에 둔다. Task 10이 실패 플래그(`voicesLoad` 실패, `findState: "failed"`)를 카드 props로 내리고, `checking`이면서 실패면 카드는 상태 칸을 비운다(순수 함수는 그대로).
- [ ] **Step 3:** 타입·biome PASS. 단축키·창 포커스·카드 상태는 QA Q3~Q6·Q19·Q24(코디네이터). `contain-intrinsic-size` 값은 1440에서 카드 높이를 재서 정한다.

### Task 13: 막대, 확인 창, 받기 메뉴, T9 정리 (브리프 4·5.7·5.8·6.3)

**Files:**
- Create: `apps/web/src/components/paragraph-bar.tsx`, `apps/web/src/components/paragraph-confirm.tsx`
- Modify: `apps/web/src/components/paragraph-studio.tsx`(막대 자리), `apps/web/src/index.css`(`studio-bar-result`의 조건을 문단 대본 칸 공통 표식 `[data-studio-script]:focus`로)
- Delete: `apps/web/src/components/studio-{provider,editor,card,bar,results,voice-dialog}.tsx`(T9 화면)
- Modify(서버 정리, '스펙과 다른 점' 6): `packages/api/src/routers/studio.ts`(`studioList`·`studioDelete` 지움), `trial.ts`(`listStudio` 지움, `remove`는 드라마가 쓰므로 그대로), `studio-contract.ts`(`studioItemSchema` 지움), `lib/studio-view.ts`의 작업실 전용 미사용 함수(드라마가 쓰는 여섯은 그대로), `studioProblemText`의 공급자 기본값(T9 호출부가 없어지므로 필수 인자로)
- Modify(테스트, E16): `studioList()`로 상태를 보던 단언 열한 곳(`routers/studio.test.ts` 113·169·216·289·297·299·327·402·554행 근처, `trial-studio.test.ts` 234·267행 `listStudio`, `studio.isolation.test.ts` 65행)을 `studioFindMany([req])`의 status·bytes로 바꾼다. 늦은 결과·미확인·저장소 실패 테스트는 그대로 남긴다. `studioDelete` 자체의 테스트만 지운다.

- [ ] **Step 1:** 막대 상태 표(브리프 4절) 그대로:
  - 주 버튼 하나(활성일 때만 채운 청록, 잠기면 outline 잠김, `fillOf`), 보조 하나·둘.
  - 한 줄 칸은 하나(오류 → 막는 이유 → 20초 안내 → 도움 줄). 확인 중·목록 실패·찾기 실패('다시 확인')·내가 멈춤(회색)·오류 멈춤(경고색 `role="alert"`)·고친 문단 남김 행을 모두 만든다(D7·D8).
  - 대기 시각 잠금 이유는 주 버튼 `aria-describedby`와 한 줄 칸 둘째 문장(`retryTime`).
  - 진행 한 줄 "N개 중 M번째 · 문단 K · S초" + '문단 K 보기'(스펙 '지금 문단 보기', '스펙과 다른 점' 28)와 진행 막대(무채색, D9), `useElapsed`는 막대 안에서만.
  - '받기 ▾'는 트리거를 잠그지 않는다. 안 만든 문단이 있거나 받을 문단이 없으면 메뉴 맨 위 이유 줄(+ '문단 N 보기')과 꺼진 항목 넷, 트리거 `aria-describedby`(D6). 받는 중은 "받는 중"과 "한 파일로 잇는 중" 두 단계와 도움 줄(D20).
  - 결과 플레이어와 캡션, 767px 이하 요약 칩(320에서 안 들어가면 주 버튼 위 줄, D22). `useBarHeight` 그대로(가운데 열 sticky 막대에 붙인다).
- [ ] **Step 2:** 브리프 6.3 진행 알림: 늘 그려 둔 화면 밖 `role="status"` 칸은 시작·내가 멈춤·끝만, 오류 멈춤은 막대 `role="alert"` 한 번(같은 사건을 두 번 읽지 않는다), 끝 토스트. 키·인증 실패의 '연결 상태 보기'.
- [ ] **Step 3:** `ParagraphMakeConfirm`(브리프 5.8):
  - 제목 두 갈래(크레딧만 / Gemini 포함 "비용이 드는 문단 N개를 만들까요?"), 정의 목록(새로 만들 문단, 저장된 결과 수, 공급자별 줄 `usageByProvider`+남은 크레딧 `remainingLines`, 배율 모름 줄).
  - 배율은 `useWork().rates`(`orpc.trialModels`) 표에서 요청마다 읽는다(E20). Airy 줄은 `costCopy`로 요율 근거('스펙과 다른 점' 19).
  - 미확인 경고(무료여도, '스펙과 다른 점' 22)와 확인하면 `afterUnknownConfirmed`.
  - '취소' 첫 포커스, `Coins` '크레딧 쓰고 만들기'(Gemini 포함이면 '비용 내고 만들기').
  - 문단 하나는 `TrialConfirm kind="studio"`(`useRate`는 여기에만).
- [ ] **Step 4:** T9 화면 파일 여섯을 지운 뒤 서버·테스트 정리. `unknownRefetch`는 `StudioItem` 대신 구조 타입(`{ status; createdAt }`)을 받게 바꾼다(드라마가 씀). `studioFind`는 남긴다(`runMakeAll`의 보내기 직전 확인). → `pnpm check-types`(전체) PASS, api·web 테스트 PASS(DB 테스트 skipped 0), `grep -rn "studioList\|studioDelete\|StudioItem\|listStudio" apps packages` 결과 없음.

### Task 14: 문서

**Files:** `docs/domain/project.md`(88·91·99·119·124~128·173행 근처: 음성 작업실 기능·화면·API 표에 `studioFindMany`, 다섯 공급자, 지운 프로시저), `docs/adr/0007-paragraph-join-in-browser.md`(새, `domain-modeling`의 ADR-FORMAT), `docs/research/airy-api-options.md`(입력 1–1600자, 2026-10-23 확인), 로드맵(T10-a 상태, T10-b·T12·T14·T15 메모, ADR 0007 링크), `tasks/todo.md`(T9-01·02·05·T95-03 처리 표시, T76-09·T7.5-05는 백로그 유지 메모, 남는 것 백로그), 로드맵 T15 메모(T9-03 옮김), `.claude/skills/tts-provider/SKILL.md` 119행(긴 대본 결합은 브라우저, ADR 0007. 스킬 본문이 바뀌므로 대조표 35행은 바뀐 줄과 eval 판단을 적는다), `GLOSSARY.md`(필요한 보완만), `docs/briefs/site-map.md`(설계 단계에서 고친 `/studio` 행이 최종 화면의 링크·버튼과 맞는지 확인, D16).

- [ ] **Step 1:** 쓴다. `pnpm exec biome check`는 md를 보지 않으므로 링크만 확인한다(`grep -n "](" `).

## 구현 뒤 (코디네이터와 메인 세션)

- 대조표 7·15·20행: `pnpm check-types`, 바꾼 파일 Biome(전체는 기준 `docs/prototypes/` 10/2/2와 비교), `pnpm test`(api·web, DB 테스트 skipped 0), `pnpm build`.
- 16행 `prokit-reviewer(code)` 서버 diff와 자동 security 행, 29행 전체 diff.
- 21·27·30행 런타임·QA: 스펙 11절 Q1~Q20 + 브리프 13절(폭 표, 4절 행별 스크린샷, Q23 200% 확대·320 리플로우, Q24 IME 단축키, Q25 낭독기 알림 횟수, Q26 폭별 Tab 순서·건너뛰기 링크) + Q21 "가로챈 진행 중 다른 메뉴로 이동하면 `studioCreate`가 더 나가지 않는다(요청 수 셈)" + Q22 "진행 중 아직 안 보낸 문단을 고치면 보내지 않고 '안 만듦', 지우면 건너뜀" + Q27 "전체 만들기 중 카드 '만들기'는 잠김, 끝난 뒤 카드 '만들기'는 저장된 결과가 있으면 공급자 0회"(E3) + Q28 "가로챈 무료 미확인 → '이어서 만들기'가 확인 창을 띄우고 확인하면 새 요청 id"(E2). 사용자 테스트(스펙 12절)에 계획 결정 둘('스펙과 다른 점' 26 합치기 승계, 27 '확인 중')을 확인 항목으로 더한다. Q20은 최악 입력(200문단 × 2,000자)으로 잰다(E10). 가드(`guard.js`, `studioCreate` 포함 차단)와 오류 기록을 ego 스크립트마다 다시 등록(교훈 2026-10-23). 무음 결과 행 넣기·지우기(다섯 공급자 MP3·WAV, 3MiB 넘는 것, 미확인 1건, 30분 분량 60개)와 CDP 가로채기 카나리(T9 S20). 30분·60분 잇기의 시간과 최고 메모리(`performance.memory` 또는 CDP `Runtime.getHeapUsage`)를 적는다.
- 22~26행 critique·audit·polish·DESIGN.md(문단 카드·레일·막대 절 merge, '사용량 표식' 절(621행 근처)에 카드 `Coins` 회색 예외 한 줄, DN-1).

## 자기 검토 (writing-plans, 2026-10-23)

1. **스펙 덮기:** 스펙 3절 → Task 6·7, 4.1 → Task 1~4, 5.1 → Task 10~13, 6절 오류 → Task 4(서버)·Task 7 리듀서·Task 13(문구), 9절 수용 기준 1~17 → 태스크 테스트와 QA Q1~Q20(10번 30분 잇기는 QA Q14), 7절 문서 → Task 14. T10-b(5.2·4.2)는 이 계획 밖이다.
2. **단계 훑기:** 테스트 단계는 이름과 기대값이 있고, 코드 단계는 시그니처와 스펙 값이 있다. 화면 태스크(10~13)는 DOM 테스트가 없어 QA 시나리오 번호로 검증을 잇는다.
3. **타입 일관성:** `StudioRequest`(Task 1) → `paragraphRequest`(Task 6, `voices`·`now`) → `makePlan`·`findTargets`·`paragraphStatus`·`receivePlan`(Task 7, 같은 `voices`·`now`) → `useMakeAll`(Task 10). `StudioFound`(Task 1) → `findStudioMany`(Task 3) → `FoundMap`·`mergeFound`(Task 7). `MakeState.stopped.problem: TrialProblem | null`(Task 7) → `makeProblemText(provider, problem)`(Task 8) → 막대(Task 13). `VoiceSetup`·`Work`(Task 6) → `readWork`(Task 8) → `useWork`(Task 10) → `VoicePickerDialog`(Task 11) → 카드(Task 12). `fillOf`(Task 7) → 레일(Task 11)·막대(Task 13). `joinTimeline`(Task 5) → `receive`(Task 10).
6. **보강 리뷰 반영(2026-10-23):** E1~E22와 D1~D24를 '스펙과 다른 점' 21~27, Global Constraints, 재사용 표, Task 2~14, '구현 뒤'에 넣었다. 확인한 것: 성우 맞춤은 T5 `requestOf`(`trial-view.ts:161`)와 T9 `studioRequestOf`(`studio-view.ts:150`)·드라마 `lineRequest`(`drama-read.ts:47`)가 같은 길이고, `studioProblemText`(`studio-view.ts:553`)는 T9 화면 둘만 부르며 드라마는 자기 `unknownExpired`를 넘긴다, `PageHeader`는 자기 여백을 가진다, 드라마 `synthesizeScene`은 이미 `SynthesizeOptions`를 받는다.
4. **Review Focus:** 다섯 줄 모두 테스트가 태스크에 있다(Task 6·7·8).
5. **분량:** 본문 코드는 넣지 않았다(알고리즘은 규칙 문장으로). 화면 세부는 브리프 절 번호로 가리킨다.

---

# Part 2: 피드백 1 — 태그 도구줄과 자동 태그 추천 (2026-10-23)

**Goal:** 문단 카드에서 그 문단 성우가 받는 태그를 보고 넣는다. 받지 않는 태그는 빼고 보낸다. '자동 태그'로 Gemini 텍스트 모델의 추천(태그·감정·말투·말투 지시)을 받아, 고른 문단만 바꾼다.

**Architecture:**
- `packages/api`: 화면 번들에도 들어가는 순수 모듈 `paragraph-tags.ts`를 둔다. 보낼 글의 태그 빼기, 문단 검사, 프롬프트를 맡고, 드라마 `drama-acting.ts`의 카탈로그·검사 부품을 쓴다. 새 프로시저 `studioAutoTag`를 둔다. DB는 쓰지 않고, 공급자 호출은 `suggestActing`이다.
- `apps/web`:
  - 순수 모듈 둘을 둔다. 두 작업실 공용 `tag-view.ts`(소리 넣기, 태그 문구, 자동 태그 실패 문구)와 `paragraph-autotag.ts`(대상, 묶음, 바뀐 문단, 바꾸기)다. `paragraphRequest`가 보낼 글에서 받지 않는 태그를 뺀다.
  - 드라마 도구줄의 알약 부분을 공용 `tag-tools.tsx`로 옮긴다. 문단 도구줄(`paragraph-tags.tsx`)과 자동 태그 창(`paragraph-autotag.tsx`)을 더한다.

**Spec:** [T10 스펙](T10-paragraph-studio.md) 15절(구속력 있는 정본, 사용자 "바로 시작해" 2026-10-23, 결정은 Claude, 확인은 [confirm]), 화면 [음성 작업실 브리프](../../briefs/studio.md) 15절. 드라마 근거: [T9.5 스펙](T09.5-drama-studio.md) 14.4·14.5·17절, `drama-acting.ts`, `drama-toolbar.tsx`, `drama-autotag.tsx`.

## Part 2 Global Constraints
- Part 1의 Global Constraints를 모두 따른다(소유자는 `context.ownerId`, `protectedProcedure`, Server Action·새 Route Handler 금지, 토큰만, 문구 규칙).
- 유료 호출: `studioAutoTag`는 사용자가 확인 창에서 '추천 받기'를 누를 때만 부른다. 묶음은 차례로 보내고 자동 재시도는 없다(TanStack `retry: false`, `networkMode: "always"`). 자동 테스트와 브라우저 QA에서는 Gemini를 부르지 않는다(가짜 `suggestActing`, QA 가드).
- `packages/api/src/paragraph-tags.ts`는 화면 번들에 들어간다. zod·`node:*`·`Buffer`를 쓰지 않는다(`drama-acting.ts`와 같다).
- 값 근거: 태그·감정 값은 `ACTING` 카탈로그만 쓴다. 새 값을 만들지 않는다.
- 상한: 한 번에 문단 50개, 글자 합계 2,000자(코드 포인트, `normalizeText` 뒤). 새 태그는 문단마다 `max(2, ⌈태그 뺀 글자 수 ÷ 100⌉)`개. Gemini 말투 지시는 `GEMINI_DIRECTION_MAX`(100).
- 드라마 작업실 동작은 바뀌지 않는다(도구줄·자동 태그 회귀는 기존 테스트 + QA 9).

## Part 2 Review Focus
1. 받지 않는 태그가 없는 문단은 `paragraphRequest`의 글이 전과 같아야 한다. 그래야 저장된 결과가 '만듦'으로 남는다 → Task 16 테스트.
2. 답의 index가 없거나, 겹치거나, 범위 밖이면 첫 제안만 쓰고 나머지는 원래 값이다. 답 JSON이 깨지면 `provider_input`이다 → Task 15 라우터 테스트.
3. 보내는 사이에 고친 문단(글·성우·설정)과 지운 문단은 바꾸지 않는다. 고르지 않은 문단도 바꾸지 않는다 → Task 16 `applyAutoTag` 테스트.
4. 기본 성우를 따르던 문단에 설정 제안을 적용하면, 그 문단의 자기 성우가 기본 성우 복사본에 제안을 더한 것이 된다. 자기 성우가 있던 문단은 설정만 바뀐다 → Task 16 테스트.
5. Typecast 성우가 받지 않는 감정, v21의 `smart`, 목록 밖 태그, 원래 태그가 빠진 글, 상한 넘는 글은 원래 값이다 → Task 15 테스트.
6. 태그만 있는 문단(Typecast `[pause]`)은 보낼 글이 빈다. 그 문단이 빈 문단처럼 빠져야 저장된 결과 찾기 묶음 전체가 거절되지 않는다 → Task 16 테스트(계획 리뷰 high 1).
7. 한글·줄바꿈이 든 괄호(`<삼국지>`, `[속보]`)와 떨어진 부등호(`3 < 5, 7 > 2`)는 태그가 아니다. 대본 글이 빠진 채 유료 생성되면 안 된다 → Task 15 `sendText` 테스트(계획 리뷰 high 2).
8. 서버가 NFC·앞뒤 공백을 정리해 돌려준 글을 '바뀐 문단'으로 세면 안 된다 → Task 16 `autoTagChanges` 테스트.
9. 줄바꿈을 지우거나 띄어쓰기를 바꾼 제안은 원래 글로 둔다 → Task 15 `checkParagraph` 테스트.
10. 계약 모듈 순환 import(`drama-contract` ↔ `studio-contract`)가 없어야 한다 → Task 15 계약 테스트가 두 모듈을 import해 통과한다.

## Part 2 대조표 행
Part 1 행에 'Part 2 재실행' 증거를 덧붙인다.

| 행 | 할 일 |
|---|---|
| 12 계약 | Task 15 |
| 13 서버 | Task 15 |
| 14 격리 | Task 15 |
| 15 검사 | 서버 검사 |
| 16 리뷰 | code와 security(`studioAutoTag` 유료 경로) |
| 19 화면 | Task 16~18 |
| 20~31 검사·QA | 검사·런타임·critique·audit·QA를 다시 한다 |
| 37 문서 | Task 19 |

격리(14행)의 판단: `studioAutoTag`는 소유 데이터를 읽거나 쓰지 않는다. 그래서 2계정 테스트 대신 '소유자 없음 → UNAUTHORIZED, 공급자 0회'와 '입력에 소유자 칸 없음'을 적는다.

### Task 15: 문단 태그 검사·프롬프트와 `studioAutoTag`

**Files:**
- Create: `packages/api/src/paragraph-tags.ts`, `packages/api/src/paragraph-tags.test.ts`
- Modify:
  - `packages/api/src/drama-acting.ts`: `feelOf`·`tagsOf`를 이름·동작 그대로 export한다(줄바꿈을 지우는 `bare`는 쓰지 않는다). `routers/drama.ts`의 `parseReply`를 `parseJsonReply`로 옮겨 export한다.
  - `packages/api/src/routers/drama.ts`: 옮긴 `parseJsonReply`를 쓴다.
  - `packages/api/src/providers/trial-contract.ts`: `feelSchema`를 `drama-contract.ts`에서 이곳(`EMOTION_PRESETS`·`AIRY_STYLES` 옆)으로 옮겨 export한다. `drama-contract.ts`는 이곳에서 import한다. `drama-contract`가 이미 `studio-contract` 값을 import하므로, `studio-contract`가 `drama-contract`를 import하면 순환이 된다(계획 리뷰 medium 1).
  - `packages/api/src/studio-contract.ts`와 `.test.ts`
  - `packages/api/src/routers/studio.ts`와 `studio.test.ts`
- 읽을 스킬: `prokit-api`, `tts-provider`(유료 호출·자동 재시도·입력 길이).

**Interfaces:**
- Produces(`paragraph-tags.ts`):
  - `PARAGRAPH_TAG_TOTAL_MAX = 2000`, `PARAGRAPH_TAG_ITEMS_MAX = 50`
  - `SEND_TAGS`: 문단 작업실이 태그로 보는 모양이다(스펙 15.2 '태그의 모양'). 식은 `/\[[A-Za-z][A-Za-z0-9 ,'\-]{0,59}\]|<\/?[A-Za-z][A-Za-z ]{0,29}>/g`이다. 드라마의 넓은 `TAGS`는 쓰지 않는다. 전역(g) 식이라 `replace`·`matchAll`(새 식으로 복사)만 쓰고 `test`·`exec`를 부르지 않는다(`drama-script.ts:119` 주석과 같다).
  - `paragraphTagSent(family: ActingFamily, tag: string): boolean`: 아래 규칙이다. 드라마 `tagSent`와 달리 Fish는 쌍 태그도 뺀다.
    - `fish_s2`·`fish_drama`·`elevenlabs_tags`: 대괄호만 보낸다.
    - `gemini`: `ACTING.gemini.sound` 값만 보낸다.
    - 그 밖: 보내지 않는다.
  - `sendText(family: ActingFamily, text: string): string`: `SEND_TAGS`로 찾은 태그 가운데 `paragraphTagSent`가 false인 것을 빼고, 뺀 태그 바로 뒤의 공백 한 칸까지 뺀다. 다른 글자와 줄바꿈은 그대로 둔다.
  - `unsentCount(family: ActingFamily, text: string): number`
  - `inlineTags(family: ActingFamily): string[]`: 그 family의 소리 값에 더해, Fish S2·Fish Drama·ElevenLabs v3·v4는 분위기 값을 `[값]`으로 더한다.
  - `newTagMax(text: string): number`
  - `type ParagraphTagItem = { family: ActingFamily; emotions: readonly string[] | null; max: number; text: string; direction: string; feel?: Feel }`
  - `checkParagraph(item: ParagraphTagItem, suggested: Suggestion): { text: string; direction: string; feel?: Feel }`
  - `paragraphTagPrompt(items: readonly ParagraphTagItem[]): { system: string; input: string; schema: Record<string, unknown> }`
- Produces(계약): `studioAutoTagInputSchema`·`studioAutoTagOutputSchema`, 타입 `StudioAutoTagInput`·`StudioAutoTagOutput`.
  - 입력 항목: 공급자별 `discriminatedUnion("provider")`이고 `model`은 그 공급자 모델 열거형이다(`TYPECAST_MODELS`·`ELEVENLABS_MODELS`·`FISH_MODELS`·`AIRY_MODELS`·`GEMINI_MODELS`). 칸은 아래와 같다.
    - `text: textSchemaOf(studioTextMax(provider))`
    - `emotions: z.array(z.string().max(32)).max(20).nullable()`
    - `direction: z.string().max(GEMINI_DIRECTION_MAX * 4)`. 코드 포인트로 100 이하이고, Gemini가 아니면 빈 글만 받는다.
    - `feel: feelSchema.optional()`
  - 입력 전체: `paragraphs`는 1~50개, `superRefine`으로 합계 2,000자 이하다.
  - 출력: `{ paragraphs: { text: string; direction: string; feel?: Feel }[]; skipped: number }`
- Produces(라우터): `studioRouter.studioAutoTag`

- [ ] **Step 1: 실패하는 단위 테스트**(`paragraph-tags.test.ts`)
  - `sendText`:
    - `("typecast_v30", "안녕 [sighs] 하세요") → "안녕 하세요"`
    - `("airy", "[laughs] 좋아요") → "좋아요"`
    - `("gemini", "아 <sigh> 그래 [laughs]") → "아 <sigh> 그래 "`
    - `("fish_s2", "a <sigh> b [laughs] c") → "a b [laughs] c"`
    - `("elevenlabs_tags", "a[x]b") → "a[x]b"`
    - 받지 않는 태그가 없으면 같은 글을 돌려준다(`toBe(text)`). 줄바꿈은 그대로다.
    - 태그가 아닌 글은 남는다: `("typecast_v30", "영화 <삼국지> 3 < 5, 7 > 2 [속보] 끝")`은 같은 글이다.
    - `("fish_s2", "<whisper>a</whisper> [sighs] b") → "a[sighs] b"`. 쌍 태그를 빼고 뒤 공백이 없으니 붙는다.
    - `("gemini", "[sighs] <sigh> <whispering> c") → "<sigh> c"`
  - `unsentCount("typecast_v21", "[a] b <c>") → 2`
  - `inlineTags`:
    - `"fish_s2"`는 `"[sighs]"`·`"[excited]"`를 담는다.
    - `"gemini"`는 `"<sigh>"`를 담고 `"[cheerful and friendly]"`는 담지 않는다.
    - `"typecast_v30"`은 `[]`이다.
  - `newTagMax`: `"가".repeat(150) → 2`, `"가".repeat(450) → 5`, 태그는 세지 않는다.
  - `checkParagraph`: 아래 각 경우에 그 칸만 원래 값이고 나머지는 받는다.
    - 글자가 바뀜
    - 줄바꿈을 지움: 원문 `"가\n나"`, 제안 `"가 [sighs] 나"`
    - (받는 경우) 원문 `"가  나"`, 제안 `"가 [sighs] 나"`는 받는다(연속 공백 길이 차이는 허용, 스펙 15.3)
    - 원문의 `<삼국지>`를 뺌
    - 원래 태그 하나가 빠짐
    - 목록 밖 `[whispering softly]`
    - Gemini 문단에 `[laughs]`
    - 새 태그 3개(150자 문단)
    - `<|speaker:0|>`가 든 글
    - 제안 글(태그 포함) 코드 포인트가 `max`를 넘음
    - Gemini 말투 지시가 목록 값이면 받고, `"속삭여"`(영문 없음)면 원래 값이다. 다른 family의 말투 지시는 늘 원래 값이다.
    - Typecast v30이 `emotions: ["smart","happy"]`일 때 `"sad"`는 원래 값이고 `"happy"`·강도 1.3은 `{ emotion: "happy", intensity: 1.5 }`이다.
    - v21의 `"smart"`는 원래 값이다.
    - Airy `"bright"`는 받는다.
  - `paragraphTagPrompt`:
    - `schema.properties.paragraphs`의 `minItems`·`maxItems`가 항목 수다.
    - 입력 JSON의 `text`가 원문 그대로다.
    - family·감정 묶음이 같은 문단은 같은 허용 목록 번호를 가리킨다. 허용 목록 줄은 묶음마다 한 번만 쓴다.
- [ ] **Step 2: 실패하는 계약·라우터 테스트**
  - 계약(`studio-contract.test.ts`):
    - 51개는 거절한다.
    - 합계 2,001자는 거절하고 2,000자는 받는다.
    - Airy 1,601자는 거절한다.
    - 모델 `"drama-3"`(Fish)는 거절한다.
    - Typecast 문단의 `direction: "calm"`은 거절한다.
    - 같은 테스트 파일에서 `drama-contract`와 `studio-contract`를 함께 import해 `feelSchema`가 둘 다에서 동작한다(순환 없음).
  - 라우터(`studio.test.ts`의 `describe("자동 태그 추천 studioAutoTag(T10 스펙 15.3)")`):
    - 소유자가 없으면 `UNAUTHORIZED`이고 `suggestActing` 호출은 0회다.
    - Gemini 키(클라이언트)가 없으면 `no_key`다.
    - 모두 ElevenLabs v2·flash면 0회이고 원래 값이며 `skipped`가 2다. 키가 없어도 같다.
    - 깨진 JSON이면 `provider_input`(`providerCode: "auto_tag_reply"`)이고, `data`에 대본이 없다.
    - index가 겹치면 첫 제안을 쓰고, 빠진 index는 원래 값이다.
    - 허용 값만 남는다(Fish·Gemini·Typecast·Airy가 섞인 입력).
    - 대기 시각 표를 쓰지 않는다(`provider_cooldown` 행 0개, 드라마 테스트 711행처럼).
- [ ] **Step 3: 실행해 실패를 본다:** `pnpm --filter @tts-pilot-app/api test paragraph-tags studio-contract studio.test`
- [ ] **Step 4: 구현**
  - 검사 규칙은 드라마 `textOk`를 바탕으로 한다. 다른 점은 넷이다.
    - 허용 태그는 `inlineTags`이고, 범위 태그는 없다.
    - 글 비교는 줄을 지키는 `bareLines`다. 넓은 `TAGS`를 지우고 `[ \t]+`를 한 칸으로, ` ?\n ?`를 `\n`으로 바꾸고 trim한다. 드라마 `bare`는 줄바꿈을 지워서 쓰지 않는다(계획 리뷰 medium 3).
    - 원래 태그 보존과 새 태그 셈은 넓은 `TAGS`(`tagsOf`)로 한다. 그래야 `<삼국지>` 같은 글도 빠지지 않는다.
    - 길이는 `codePoints(normalizeText(suggested.text)) <= max`(제안 글 전체, 화면 `tooLongOf`와 같은 기준, 계획 리뷰 low 2)이다.
  - 프롬프트 첫 줄은 "You add delivery tags to Korean narration paragraphs for text-to-speech."이다. 규칙은 드라마 `autoTagPrompt`와 같고, 셋을 바꾼다.
    - 문단 하나에 새 태그는 `newTagMax`개까지다.
    - 지시(direction)는 Gemini 문단만 쓴다.
    - 분위기 태그도 대괄호로 글 안에 넣는다.
  - 라우터 `studioAutoTag`는 `dramaAutoTag` 모양을 따른다. 다른 점은 셋이다.
    - 항목마다 `family = familyOf(provider, model)`, `max = studioTextMax(provider)`를 정한다.
    - `elevenlabs_plain` 항목은 검사하지 않고 원래 값으로 둔다.
    - 장면 합계 되돌리기는 없다.
- [ ] **Step 5: 통과 확인:** 같은 명령에 더해 `pnpm --filter @tts-pilot-app/api test drama`(드라마 회귀)와 `pnpm check-types`.

### Task 16: 보낼 글의 태그 빼기, 공용 태그 lib, 자동 태그 순수 함수, 문구

**Files:**
- Create: `apps/web/src/lib/tag-view.ts`와 `.test.ts`, `apps/web/src/lib/paragraph-autotag.ts`와 `.test.ts`
- Modify:
  - `apps/web/src/lib/drama-view.ts`와 `.test.ts`: 아래를 옮겨 간 곳에서 import한다.
    - `insertSound`
    - `DRAMA_TEXT`의 `moreOf`·`badgeName`·`soundShort`·`moodShort`·`autoTagReply`·`autoTagRetryAt`·`autoTagFailed`
    - `autoTagProblemText`
  - drama 사용처(`grep -rn "insertSound\|autoTagProblemText\|DRAMA_TEXT\.\(moreOf\|badgeName\|soundShort\|spanShort\|moodShort\|autoTagReply\|autoTagRetryAt\|autoTagFailed\)" apps/web/src`)
  - `apps/web/src/lib/paragraph-script.ts`와 `.test.ts`, `apps/web/src/lib/make-all.ts`와 `.test.ts`(`blankFor`), `apps/web/src/components/paragraph-make.tsx`(한 줄), `apps/web/src/lib/studio-text.ts`와 `.test.ts`
- 읽을 스킬: `vercel-react-best-practices`(js-*).

**Interfaces:**
- Consumes: Task 15의 `sendText`·`unsentCount`·`familyOf`·`PARAGRAPH_TAG_*`·`StudioAutoTagInput`·`StudioAutoTagOutput`.
- Produces(`tag-view.ts`): `insertSound`(옮김), `TAG_TEXT = { moreOf, badgeName, soundShort, moodShort }`, `AUTO_TAG_TEXT = { reply, retryAt, failed }`, `autoTagProblemText(problem: TrialProblem): string`(옮김, 동작 그대로).
- Produces(`paragraph-script.ts`):
  - `blankFor(p: Paragraph, work: Work): boolean`: 원문이 공백뿐이거나, 성우(`voiceOf(p, work)`)가 있고 `normalizeText(sendText(familyOf(setup.provider, setup.settings.model), p.text))`가 빈다. 성우 모델로 family를 정해도 된다. `requestOf`가 바꾸는 모델은 Typecast(v30↔v21)와 Fish(무료→유료)뿐이고, 둘 다 태그 판정이 같다.
  - `paragraphRequest`: `blankFor`면 null이다. 돌려주는 요청의 `text`는 `sendText(familyOf(provider, settings.model), p.text)`다. `setupRequest`는 바꾸지 않는다.
  - `blockOf`: 첫 판정 `isBlank(p.text)`를 `blankFor(p, work)`로 바꾼다.
  - `make-all.ts`의 `isBlank(p)` 사용처 다섯 곳(92·205·543·589·641행 근처, 정의 54행은 지운다)과 `paragraph-make.tsx` 142행 근처의 `p.text.trim() === ""`를 `blankFor(p, work)`로 바꾼다. 빈 문단 셈·계획·받기·진행 중 판정이 같은 판정을 쓴다. `paragraph-card.tsx`의 같은 식은 색만 정하므로 그대로 둔다.
- Produces(`paragraph-autotag.ts`):
  - `type AutoTagTarget = { id: string; n: number; sent: Paragraph; request: StudioRequest; family: ActingFamily; emotions: string[] | null; result: "made" | "unknown" | null; own: boolean }`(`own`은 자기 성우가 있음)
  - `autoTagTargets(paragraphs: readonly Paragraph[], work: Work, voices: readonly SavedVoice[], requestOf: (p: Paragraph) => StudioRequest | null, statusOf: (p: Paragraph) => ParagraphStatus): { targets: AutoTagTarget[]; skipped: number }`
    - 대상: `blockOf(p, work, voices) === null`이고 요청이 있고 family가 `elevenlabs_plain`이 아닌 문단
    - `skipped`: 요청이 있는 `elevenlabs_plain` 문단 수
    - `emotions`: Typecast면 드라마 `actingOf`와 같은 규칙(`presetsOf`, v30은 `"smart"` 포함), 아니면 `null`
    - `result`: `statusOf(p)`가 `"made"`·`"unknown"`이면 그 값, 아니면 null
  - `autoTagBatches(targets: readonly AutoTagTarget[]): AutoTagTarget[][]`: 차례를 지킨다. 한 묶음은 합계 `PARAGRAPH_TAG_TOTAL_MAX` 이하, `PARAGRAPH_TAG_ITEMS_MAX`개 이하다.
  - `autoTagInputOf(batch: readonly AutoTagTarget[]): StudioAutoTagInput`: 칸마다 아래 값을 넣는다.
    - `text`: `sent.text`
    - `direction`: Gemini면 요청의 `direction`, 아니면 빈 글
    - `feel`: Typecast는 `emotion: "smart" | preset`과 `intensity`, Airy는 `style`
  - `type AutoTagChange = { id: string; n: number; result: "made" | "unknown" | null; own: boolean; family: ActingFamily; sent: Paragraph; text: string | null; settings: Record<string, string | number> | null; fields: { field: "text" | "emotion" | "style" | "direction"; before: string; after: string }[] }`
  - `autoTagChanges(batch: readonly AutoTagTarget[], reply: StudioAutoTagOutput): AutoTagChange[]`: 바뀐 문단만 담는다. 글은 `normalizeText(sent.text)`와 `normalizeText(reply.text)`를 비교하고, 다를 때만 `text`에 넣는다(서버가 NFC·trim으로 정리해 돌려준다, 계획 리뷰 medium 2). 감정 글은 카탈로그 이름이고, 강도가 있으면 `"기쁨 · 1.5"`, `smart`는 `"자동"`이다.
  - `applyAutoTag(paragraphs: readonly Paragraph[], work: Work, changes: readonly AutoTagChange[], chosen: ReadonlySet<string>): { paragraphs: Paragraph[]; applied: number; changed: number }`
    - 지금 문단 객체가 `sent`와 다르거나, 문단이 없거나, 지금 성우의 family(`familyOf(voiceOf(p, work))`)가 보낼 때와 다르면 `changed`에 센다(기본 성우를 바꾼 경우).
    - 설정 바꾸기는 카드 설정 칸과 같은 `ownSettings(p, work, patch)`(`paragraph-script.ts`)를 쓴다. 자기 성우가 없으면 기본 성우 복사본이 된다(계획 리뷰 medium 4).
    - Typecast 설정 조각: `smart`는 `{ emotion: "smart" }`, 그 밖은 `{ emotion: "preset", preset, intensity }`다.
    - 바뀐 문단이 없으면 같은 배열을 돌려준다.
- Produces(`studio-text.ts` `PARAGRAPH_TEXT`): 브리프 15.3의 문구를 모두 담는다. 함수형 키는 아래다.
  - `tagToolbarName(n)`, `unsentNote(count)`, `unsentEmpty`(글), `autoTagMadeNote`(글), `autoTagUnknownNote`(글), `autoTagOwnNote(count)`
  - `autoTagBody(paragraphs, calls)`(모두 금액 `$` + `(calls × 0.01).toFixed(2)`), `autoTagProgress(done, total)`
  - `autoTagStoppedAt(n, reason)`, `autoTagNotSent(n)`, `autoTagSkipped(count)`
  - `autoTagChoose(n)`, `autoTagApplyN(count)`, `autoTagApplied(count)`, `autoTagChanged(count)`

- [ ] **Step 1: 실패하는 테스트**
  - `paragraph-script.test.ts`:
    - Typecast 문단 `"안녕 [sighs] 하세요"`의 `paragraphRequest().text`는 `"안녕 하세요"`다.
    - Fish 문단은 `"[sighs]"`를 남긴다.
    - Gemini 문단은 `"<sigh>"`를 남기고 `"[sighs]"`를 뺀다.
    - 태그가 없는 문단은 `comboSignature`가 전과 같다(Review Focus 1).
    - Typecast 문단 `"[sighs]"`는 `paragraphRequest` null, `blockOf` `"empty"`, `paragraphStatus` `"empty"`다. 같은 작업의 다른 문단으로 만든 찾기 대상(`findTargets`)에 이 문단이 없다(Review Focus 6).
  - `paragraph-autotag.test.ts`:
    - 대상은 빈 문단·성우 없음·상한 넘김·v2 문단을 뺀다(`skipped` 1).
    - 묶음은 아래와 같이 나뉜다.
      - 1,000자 + 1,000자 + 1자는 `[[a, b], [c]]`다.
      - 2,000자 하나는 혼자 묶음이다.
      - 51개 1자는 `[50, 1]`이다.
    - 바뀐 문단: 글만 바뀐 경우, 감정만 바뀐 경우, 그대로인 경우는 빠진다. 원문이 `"가 \n"`이나 NFD 한글이고 답이 정리된 같은 글이면 변경 0이다(Review Focus 8).
    - `applyAutoTag`:
      - 보낸 뒤 고친 문단과 지운 문단, 기본 성우가 다른 공급자로 바뀐 기본 따르기 문단은 `changed` 3이고 그대로다.
      - 고르지 않은 문단은 그대로다.
      - 기본을 따르던 Typecast 문단은 `ownSettings`와 같은 자기 성우가 된다(`voiceId`는 기본 성우의 것, `settings.preset`은 제안 값).
      - 자기 성우인 Gemini 문단은 `settings.direction`만 바뀐다.
      - 바뀐 것이 없으면 같은 배열(`toBe`)을 돌려준다.
  - `tag-view.test.ts`: 옮긴 `insertSound`와 `autoTagProblemText`의 기존 테스트를 drama-view 테스트에서 옮긴다. `drama-view.test.ts`에서 옮긴 키(`moreOf`·`badgeName`·`soundShort`·`moodShort`·`autoTagReply` 등)를 단언하는 줄(2160·2238·2361행 근처)도 `TAG_TEXT`·`AUTO_TAG_TEXT` 단언으로 옮긴다. `spanShort`는 드라마만 쓰므로 `DRAMA_TEXT`에 남긴다.
  - `studio-text.test.ts`: 새 함수형 문구의 숫자 자리를 본다(`autoTagBody(12, 2)`는 브리프 문장 그대로).
- [ ] **Step 2: 실행해 실패를 본다:** `pnpm --filter web test paragraph-script paragraph-autotag tag-view studio-text`
- [ ] **Step 3: 구현.** 옮기는 것은 동작을 바꾸지 않는다(drama-view 테스트가 그대로 통과한다).
- [ ] **Step 4: 통과 확인:** `pnpm --filter web test`(전부, skipped 0), `pnpm check-types`

### Task 17: 공용 태그 알약과 문단 도구줄

**Files:**
- Create: `apps/web/src/components/tag-tools.tsx`, `apps/web/src/components/paragraph-tags.tsx`
- Modify:
  - `apps/web/src/components/drama-toolbar.tsx`: 알약·메뉴 알약·도구줄 부분을 `tag-tools.tsx`로 옮기고, 남은 부분은 드라마 전용(강도 칩, `noTags`, 지시 쓰는 법)이다.
  - `apps/web/src/components/paragraph-card.tsx`
  - `apps/web/src/components/paragraph-studio.tsx`(카드 목록과 `useCardActions`)
  - `apps/web/src/lib/studio-text.ts`와 `.test.ts`: 도구줄 그룹 제목 `PARAGRAPH_TEXT.tagSoundGroup`("소리 · 커서 위치에")·`tagMoodGroup`("분위기 · 커서 위치에")과 안내 문구 중 Task 16에 없는 것(브리프 15.3 '도구줄 안내')
- 읽을 스킬: `prokit-ui`, `vercel-react-best-practices`(rerender-*, advanced-event-handler-refs), `vercel-composition-patterns`(공용 컴포넌트 props).

**Interfaces:**
- Consumes: Task 15의 `ACTING`·`familyOf`·`unsentCount`, Task 16의 `insertSound`·`TAG_TEXT`·`PARAGRAPH_TEXT`.
- Produces(`tag-tools.tsx`):
  - `type TagKind = "sound" | "span" | "mood"`
  - `type TagGroup = { kind: TagKind; title: string; short: string; items: readonly Tag[] }`
  - `TagTools({ id, label, first, rest, onPick, after? }: { id: string; label: string; first: TagGroup; rest: readonly TagGroup[]; onPick: (kind: TagKind, value: string) => void; after?: ReactNode })`
  - `TAG_ROW`(드라마의 `ROW`). 알약 클래스 `TAG_PILL`은 파일 안에서만 쓴다(Part 2 최종 리뷰)
- Produces(`paragraph-tags.tsx`): `ParagraphToolbar({ id, n, family, onPick, onSettings }: { id: string; n: number; family: ActingFamily; onPick: (kind: "sound" | "mood", value: string) => void; onSettings: () => void })`
  - 그룹은 소리 → 분위기 순이다. 분위기는 Gemini에서 뺀다.
  - 분위기 그룹 제목은 "분위기 · 커서 위치에"이고, 넣는 값은 `[값]`이다.
  - 그룹이 없으면 15.1 표의 안내를 보인다. Typecast·Airy면 '설정에서 바꾸기' 버튼도 둔다.
- Produces(카드·목록):
  - `CardActions`에 아래를 더한다.
    - `caret: (id: string, start: number, end: number) => void`: 대본 칸 `onFocus`·`onSelect`에서 부른다. 태그 대상과 마지막 커서를 정한다.
    - `insertTag: (kind: "sound" | "mood", value: string) => void`
  - 카드 props에 아래를 더한다.
    - `tagTarget: boolean`
    - `family: ActingFamily | null`: 성우 설정(`voiceOf(p, work)`)의 `familyOf`로 정하고, 성우가 없으면 null이다(`blankFor`와 같은 근거. 요청은 빈 문단·목록 전에 null이라 안내가 나오지 않는다, Task 17 리뷰).
    - `unsent: number`
  - `insertTag`는 드라마 `applyBadge`의 `sound` 갈래와 같다. 대본 칸에 포커스하고 `setSelectionRange(from, from)` 뒤 `execCommand("insertText")`로 넣는다. 안 되면 `setText`로 넣는다. 다음 프레임에 커서를 넣은 글 뒤에 둔다. 넣는 값은 분위기면 `[값]`이고, 둘 다 `insertSound` 규칙(값 + 공백 하나)을 따른다.
  - '설정에서 바꾸기'는 카드의 `openAt`을 쓴다. Typecast는 `"emotion"`(v21이면 그 모델의 감정 칸 이름, `shownFields`·`focusField`로 확인)이고, Airy는 `"style"`이다.

- [ ] **Step 1:** `drama-toolbar.tsx`를 공용 부품으로 바꾼다. 드라마 그룹 제목·`howTo` 상세는 드라마 쪽이 `first`·`rest`·`after`로 넘긴다. `pnpm --filter web test drama`와 `pnpm check-types`가 통과해야 한다.
- [ ] **Step 2:** 문단 도구줄, 카드 아래 줄(왼쪽 안내, 오른쪽 글자 수, 안내는 대본 칸 `aria-describedby`에 더한다), 태그 대상 상태와 `insertTag`를 만든다. 안내는 뺄 태그가 있으면 `unsentNote(n)`이고, `blankFor`인데 원문이 공백뿐이 아니면 `unsentEmpty`다. 카드 `memo`는 그대로이고, 대상이 바뀔 때 두 카드만 다시 그린다.
- [ ] **Step 3:** 확인: `pnpm check-types`, 바꾼 파일 `pnpm exec biome check <files>`. 화면 확인은 메인 세션 QA(스펙 15.7 1~3·9)가 한다.

### Task 18: 자동 태그 버튼·확인 창·미리 보기

**Files:**
- Create: `apps/web/src/components/paragraph-autotag.tsx`
- Modify:
  - `apps/web/src/components/paragraph-rails.tsx`: `WorkSettings` '대본' 칸과 `WorkBand`에 '대본 붙여 넣기' 다음으로 버튼을 둔다.
  - `apps/web/src/components/paragraph-studio.tsx`: 창을 담는 `ParagraphAutoTag`를 본문에 하나 둔다.
- 읽을 스킬: `prokit-ui`, `prokit-web`, `vercel-react-best-practices`, `tts-provider`(유료 확인·자동 재시도 금지).

**Interfaces:**
- Consumes: Task 16의 `autoTagTargets`·`autoTagBatches`·`autoTagInputOf`·`autoTagChanges`·`applyAutoTag`·`autoTagProblemText`·`PARAGRAPH_TEXT`, `useWork()`(`voices`·`requestOf`·`statusOf`·`make.phase`·`work.defaultVoice`), `useParagraphs()`(`paragraphs`·`edit`), `orpc.studioAutoTag`.
- Produces: `ParagraphAutoTag({ children })`(컨텍스트와 창 둘), `AutoTagButton()`.

- [ ] **Step 1:** 버튼을 만든다. 잠김 이유는 둘이다. 대상이 0개면 `autoTagNone`이고, `make.phase`가 `idle`·`stopped`가 아니면 `autoTagBusy`다. 모양은 드라마 `AutoTagButton`과 같다(`lockedButton`, 이유는 `order-last basis-full` 줄).
- [ ] **Step 2:** 확인 창과 보내기 루프를 만든다.
  - '추천 받기'를 누르면 그때의 대상으로 묶음을 만든다.
  - `mutateAsync`를 차례로 부른다. 루프 밖 ref로 두 번 누름을 막는다.
  - `stopRef`는 '멈추기'로 켠다.
  - 결과는 묶음마다 `autoTagChanges`를 이어 붙인다.
  - 실패하면 두 갈래다. 받은 묶음이 있으면 미리 보기를 열고 `autoTagStoppedAt(첫 못 받은 문단 번호, autoTagProblemText(...))`를 보인다. 없으면 확인 창에 이유를 보인다(`role="alert"`, 포커스 '취소').
  - 멈췄으면 `autoTagNotSent(n)`를 보인다.
  - 보내는 동안 창은 Esc·바깥 누르기로 닫히지 않는다.
- [ ] **Step 3:** 미리 보기(브리프 15.2)를 만든다.
  - `chosen` 처음 값은 `result === null`인 변경이다. `result`가 있으면 `autoTagMadeNote`·`autoTagUnknownNote` 안내를 단다.
  - 고른 변경 가운데 `!own`이고 `settings`가 있는 수가 1 이상이면 `autoTagOwnNote(n)`을 버튼 위에 보인다.
  - '고른 문단 바꾸기 (N)'은 셈에 쓴 배열을 `base`로 두고 `applyAutoTag(base, work, …)`를 부른다. 그리고 `edit((ps) => (ps === base ? result.paragraphs : ps), { message })`로 되돌리기 알림을 띄운다(저장소의 가드 관례, 계획 리뷰 low 3). 미리 보기는 모달이라 그사이 배열이 바뀌지 않으므로, 가드는 안전망이고 따로 알리지 않는다. `message`는 `autoTagApplied(applied)`이고, `changed > 0`이면 `autoTagChanged(changed)`를 ` · `로 잇는다.
  - 포커스는 '자동 태그' 버튼(연 버튼)으로 간다.
  - 적용 0개이고 건너뛴 것만 있으면 토스트만 띄운다.
- [ ] **Step 4:** 확인: `pnpm check-types`, 바꾼 파일 biome. 화면은 메인 세션 QA(스펙 15.7 4~8)가 한다.

### Task 19: 문서

**Files:**
- `docs/domain/project.md`: 음성 작업실 기능(태그 도구줄, 자동 태그 추천)과 API 표에 `studioAutoTag`(유료 Gemini 텍스트, DB 없음)를 넣는다.
- `GLOSSARY.md`: `domain-modeling` 형식으로 쓴다. '자동 태그 추천'(문단 작업실)을 넣고, '전체 자동 태그'(드라마)와 구분을 적는다. 드라마 '연기 지시 팔레트'·도구줄 용어와의 관계를 grep으로 확인해 '태그 도구줄'을 넣거나 기존 항목을 넓힌다.
- 로드맵 T10: '피드백 1(2026-10-23, 스펙 15절)' 줄을 넣고, T10-b 메모에서 두 항목을 뺀다.
- `tasks/todo.md` 백로그: 스펙 15.4의 뺀 것을 T10-11~ 번호로 적는다. T95-13(서버 쪽 소유자별 동시 1건·횟수 제한 없음)에 `studioAutoTag`를 더하고, 로드맵 T14 메모에도 적는다. 드라마 읽기(`readText`)도 넓은 `TAGS`로 한글 꺾쇠 글을 지우는지 검토하는 줄을 더한다(계획 리뷰 high 2의 드라마 쪽).
- `.agents/skills/tts-provider/SKILL.md`: 자동 태그(`dramaAutoTag`)를 말하는 줄이 있으면 `studioAutoTag`를 더한다(grep). 스킬 본문이 바뀌면 35행에 적는다.
- `DESIGN.md`: T10-a 절에 도구줄 한 줄을 넣는다(드라마 도구줄 부품 공용, 문단 카드 대본 칸 아래).

- [ ] **Step 1:** 쓰고 링크를 확인한다(`grep -n "](" `).

## Part 2 구현 뒤 (메인 세션)
- QA 가드 `.superpowers/sdd/T10-paragraph-studio/tools/guard.js`에 `studioAutoTag`를 더한다.
- 가짜 응답은 `__fakeRoutes.studioAutoTag`로 준다. 묶음마다 다른 응답은 getter로 준다.
- 스펙 15.7 1~10, 브리프 15.5. 1440·390, ego-browser와 agent-browser 양쪽에서 오류 예산을 센다.
- 행 재실행: 15·20(검사), 16·36(code·security 리뷰, `studioAutoTag`), 21·27(런타임), 22~26(critique·audit 범위: 도구줄·자동 태그 창), 28(ponytail-review), 29(전체 diff 최종 리뷰), 30·31(QA·수정), 32~34, 37(문서).
- [confirm]: 스펙 12절 + 15.8을 사용자 테스트로 드린다.

## Part 2 자기 검토 (writing-plans, 2026-10-23)
1. **스펙 덮기:**

   | 스펙 | 태스크 |
   |---|---|
   | 15.1 | Task 17 |
   | 15.2 | Task 15(`sendText`), Task 16(요청), Task 17(안내 줄) |
   | 15.3 | Task 15(서버), Task 16(순수), Task 18(창) |
   | 15.5 수용 기준 1~8 | 테스트와 QA 15.7 |
   | 15.6 | Task 15·16 테스트 |
   | 15.7 | 구현 뒤 |

   15.4는 만들지 않는다.
2. **단계 훑기:**
   - 테스트 단계는 기대값이 있다.
   - 화면 태스크(17·18)는 DOM 테스트가 없다. 그래서 QA 번호로 검증을 잇는다.
3. **타입 일관성:** 아래 이름이 모든 태스크에서 같다.
   - `ActingFamily`·`Feel`·`Suggestion`(drama-acting)
   - Task 15의 `ParagraphTagItem`·`StudioAutoTagInput/Output`
   - Task 16의 `AutoTagTarget`·`AutoTagChange`, Task 18이 소비
   - `CardActions.caret`·`insertTag`(Task 17)
4. **Review Focus:** 열 줄 모두 Task 15·16 테스트에 있다(10은 계약 테스트의 함께 import).
5. **분량:** 코드 본문은 넣지 않았다. 규칙 문장과 시그니처만 넣었다.

---

# Part 3: 피드백 2 — 자동 태그를 OpenAI로, Gemini는 보조 (스펙 16절)

**Goal:** 자동 태그 텍스트 호출(`studioAutoTag`·`dramaAutoTag`)을 OpenAI `gpt-6-luna` 우선으로 바꾸고, OpenAI가 3번 실패하면 Gemini로 한 번 보낸다.

**Architecture:** 두 라우터가 함께 쓰는 `askSuggestions`(trial.ts) 한 곳에서 순서를 정한다. OpenAI 클라이언트는 텍스트 전용(`suggestActing`만)이다. `Providers`의 `openai` 칸에 두고, `ProviderId`에는 넣지 않는다. 화면은 문구만 바뀐다.

## Part 3 Global Constraints
- 스펙 16.1~16.3의 값을 그대로 쓴다.
  - 모델 `gpt-6-luna`, 시도 3, 시도마다 45초
  - `effort: "low"`, `max_output_tokens: 8192`, `store: false`, `strict: true`, format name `auto_tags`
  - 코드 `openai_account`
- `.env` 파일은 읽거나 출력하지 않는다. 키는 테스트에 가짜 문자열만 쓴다.
- 유료 호출(실제 OpenAI·Gemini)은 하지 않는다. 테스트는 `fetchMock`·가짜 `suggestActing`만 쓴다.
- 로그에 대본·답 글·키·오류 본문을 남기지 않는다. 사유 문자열만 남긴다.
- 커밋하지 않는다.

## Part 3 Review Focus
1. OpenAI 키·결제 실패(401·429 `insufficient_quota`)에 OpenAI를 3번 부르지 않는다. 1번 부른 뒤 바로 Gemini로 간다.
2. Gemini 키가 없을 때 OpenAI 마지막 오류가 화면까지 간다. 키·결제 실패면 `openai_account`다.
3. 깨진 답(`auto_tag_reply`)은 OpenAI로 다시 부른다. Gemini의 깨진 답은 지금처럼 `auto_tag_reply`다.
4. 한 묶음의 공급자 호출은 최대 4번(OpenAI 3 + Gemini 1)을 넘지 않는다.
5. 소유자가 없으면 OpenAI 클라이언트를 만들지 않는다. `UNAUTHORIZED`이고 호출은 0회다.

## Part 3 대조표 행
- 기존 행을 다시 채운다(뒤 "Part 3 구현 뒤").
- 새 행은 더하지 않는다.

## Part 3 재사용과 설정 (계획 리뷰 medium 1)
- **기존:** `askSuggestions`(trial.ts, 두 라우터 공용)·`runTrial`·`fetchOk`·`reasonFromHttp`·`trialError`(errors.ts)·`replySchemaOf`·`parseJsonReply`(drama-acting)·`withKey`(providers/index.ts)
- **결정:**
  - 새 파일은 `providers/openai.ts` 하나다. 공급자 모듈 규칙(fetch 직접, `redirect: "error"`, 오류 코드만 담기)을 따른다.
  - 호출 순서는 `askSuggestions` 한 곳에 둔다. 라우터는 바꾸지 않는다.
  - OpenAI는 `ProviderId`가 아니다. `Providers`의 선택 칸 `openai`에 둔다.
- **설정:** `OPENAI_API_KEY`
  - 서버 전용, `@optional @sensitive`, 기본값 없음
  - 값이 없으면 클라이언트를 만들지 않는다. 그때는 Gemini로 가고, Gemini도 없으면 `no_key`다.
  - 소비자는 `apps/web/src/context.ts` → `createProviders`
  - 로컬은 사용자 `apps/web/.env` 또는 셸 환경이다(varlock: `process.env`가 우선).
  - Preview·production에는 넣지 않는다(T14 전 배포 안 함, AGENTS.md). T14 뒤에 `prokit-deploy`로 넣는다.
  - `turbo.json` `globalEnv`에 더한다(Strict Mode가 목록 밖 변수를 거른다, README 규칙).
  - `apps/web/src/env.ts`는 손으로 고치지 않고 `pnpm env:generate`로 다시 만든다.
- **검증:** Task 20·21 테스트, `pnpm check-types`, 메인의 env 반영 확인(exit 코드만), 대조표 3행 [design] 재기록

### Task 20: OpenAI 텍스트 클라이언트와 호출 순서 (서버)

**Files:**
- Create: `packages/api/src/providers/openai.ts`, `packages/api/src/providers/openai.test.ts`
- Modify:
  - `packages/api/src/providers/index.ts`(`openai` 칸)
  - `packages/api/src/providers/errors.ts`(`reasonFromHttp` 한 줄, `trialError`·`runTrial`의 provider 타입)
  - `packages/api/src/providers/trial-contract.ts`(`TrialErrorData.provider` 타입)
  - `packages/api/src/trial.ts`(`askSuggestions`)
  - `packages/api/src/routers/studio.test.ts`, `packages/api/src/routers/drama.test.ts`
  - `packages/api/src/providers/errors.test.ts`
  - `packages/api/src/routers/studio.ts`·`packages/api/src/routers/drama.ts`(주석 줄만: studio 180행 근처 '유료 Gemini 텍스트 호출 1회', drama 200행 근처)
  - `apps/web/src/context.ts`, `apps/web/.env.schema`, `apps/web/.env.example`
- 메인이 한다(구현자 아님): `turbo.json` `globalEnv`에 `"OPENAI_API_KEY"`(`NODE_ENV` 다음), `pnpm env:generate`로 `apps/web/src/env.ts` 다시 만들기
- 읽을 스킬: `.claude/skills/prokit-api/SKILL.md`, `.claude/skills/tts-provider/SKILL.md`(유료 호출 재시도 예외, 키, 오류 매핑, 로그)

**Interfaces:**
- Produces:
  - `OPENAI_TEXT_MODEL = "gpt-6-luna"`
  - `OPENAI_AUTO_TAG_TIMEOUT_MS = 45_000`
  - `type TextClient = Required<Pick<ProviderClient, "suggestActing">>`
  - `createOpenAI(key: string): TextClient` (openai.ts)
  - `Providers = Partial<Record<ProviderId, ProviderClient>> & { openai?: TextClient }`
  - `createProviders`의 키 `openai`
  - `OPENAI_TRIES = 3`(trial.ts export)
  - 오류 data `provider: ProviderId | "openai"`
  - `providerCode: "openai_account"`
- Consumes:
  - `replySchemaOf`·`parseJsonReply`(drama-acting)
  - `runTrial`·`fetchOk`·`reasonFromHttp`·`trialError`(errors)
  - 기존 Gemini `suggestActing`

- [ ] **Step 1: openai.test.ts (실패 확인)** — `fetchMock`(providers/test-utils)으로 아래를 본다.
  - (a) URL `https://api.openai.com/v1/responses`, `method: "POST"`, 헤더 `Authorization: Bearer <키>`, `redirect: "error"`
  - (b) 본문 `{ model: "gpt-6-luna", instructions: system, input, text: { format: { type: "json_schema", name: "auto_tags", schema, strict: true } }, reasoning: { effort: "low" }, max_output_tokens: 8192, store: false }`
  - (c) 답 `{ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "{\"a\":" }, { type: "output_text", text: "1}" }] }] }` → `'{"a":1}'`
  - (d) `content`가 `[{ type: "refusal", refusal: "no" }]`뿐이면 `null`
  - (e) 401 → `ORPCError` data `{ provider: "openai", reason: "provider_auth" }`
  - (f) 429 + 본문 `{ error: { code: "insufficient_quota", type: "insufficient_quota" } }` → `reason: "quota"`
  - (g) 429 `rate_limit_exceeded` → `rate_limit`
  - (h) 45초 동안 답이 없으면 → `unknown_outcome`(fake timers)
  - (i) 답 본문이 모양 밖(`{ output: "x" }`)이면 `unknown_outcome`
- [ ] **Step 2: errors.test.ts에 한 줄** — `reasonFromHttp(429, ["insufficient_quota"])` → `"quota"`, `reasonFromHttp(429, [])` → `"rate_limit"`
- [ ] **Step 3: 구현**
  - `openai.ts`는 gemini.ts `suggestActing`과 같은 틀이다: `runTrial("openai", call, { timeoutMs: OPENAI_AUTO_TAG_TIMEOUT_MS, logPrefix: "[autoTag]" })` 안에서 `fetchOk`. 단 `waitDefault`는 쓰지 않는다.
  - 응답은 zod로 읽는다: `{ output?: array of { type: string, content?: array of { type: string, text?: string } } }`. 맞지 않으면 throw해서 `runTrial`이 `unknown_outcome`으로 바꾸게 한다.
  - 오류 코드는 `error.code`·`error.type` 가운데 문자열인 것이다.
  - `reasonFromHttp`: 429 판정 앞에 `if (status === 429 && codes.includes("insufficient_quota")) return "quota";` 한 줄을 넣는다.
  - `TrialErrorData.provider`는 `ProviderId | "openai"`로 넓힌다. `trialError`·`runTrial`의 provider 매개변수도 그 타입이다.
  - `providers/index.ts`의 `withKey`를 제네릭으로 바꾸고 `openai: withKey(keys.openai, createOpenAI)`를 더한다. `ProviderKeys`에도 `openai`를 더한다.
  - 주석을 고친다.
    - `errors.ts` `ProviderClient.suggestActing`(137~138행): "Gemini·OpenAI: 자동 태그 텍스트 호출 1회 … 이 메서드는 재시도하지 않는다(순서·다시 부르기는 askSuggestions)"
    - `trial.ts` 871행 근처 `askSuggestions` 주석
    - 라우터 두 곳의 '유료 Gemini 텍스트' 주석
- [ ] **Step 4: 라우터 테스트 (실패 확인)** — `studio.test.ts`의 `studioAutoTag` describe와 `drama.test.ts`의 `dramaAutoTag` describe에 `providers.openai.suggestActing` 가짜를 더한다.
  - studio에는 아래를 모두 넣는다. drama에는 1·3·7만 넣는다.
  - 그대로 통과해야 하는 기존 테스트는 'Gemini가 있고 OpenAI가 없는 경우'뿐이다.
  - 기존 no_key 단언은 테스트 7의 기대값 `{ provider: "openai", reason: "no_key", providerCode: "openai_account" }`로 바꾼다. 대상은 `studio.test.ts` 274~286행과 `drama.test.ts` 471~485행이다(계획 리뷰 medium 2). Gemini 클라이언트에 `suggestActing`가 없는 경우(`{ checkStatus }`)도 키 없음과 같다.
  1. OpenAI가 첫 시도에 맞는 답을 주면 OpenAI 1회, Gemini 0회이고 결과는 OpenAI 제안이다.
  2. OpenAI가 `trialError("openai","unknown_outcome")`, 다음에 깨진 글(`"{"`), 셋째에 맞는 답을 주면 OpenAI 3회, Gemini 0회다.
  3. OpenAI가 3번 다 `trialError("openai","provider_error")`면 OpenAI 3회 뒤 Gemini 1회이고 결과는 Gemini 제안이다.
  4. OpenAI가 `trialError("openai","provider_auth")`면 OpenAI 1회, Gemini 1회다.
  5. Gemini 없이 OpenAI가 3번 다 `unknown_outcome`이면 `GATEWAY_TIMEOUT`, data `{ provider: "openai", reason: "unknown_outcome" }`이고 `providerCode`는 없다. 3회다.
  6. Gemini 없이 OpenAI가 `quota`면 OpenAI 1회이고 data `{ provider: "openai", reason: "quota", providerCode: "openai_account" }`다.
  7. 둘 다 없으면 `PRECONDITION_FAILED`, data `{ provider: "openai", reason: "no_key", providerCode: "openai_account" }`이고 호출은 0회다.
  8. 소유자가 없으면 `UNAUTHORIZED`이고 두 가짜 모두 0회다.
  9. OpenAI가 3번 다 `provider_error`이고 Gemini가 깨진 글(`"{"`)이면 다음과 같다(계획 리뷰 medium 4).
     - OpenAI 3회, Gemini 정확히 1회다.
     - data는 `{ provider: "gemini", reason: "provider_input", providerCode: "auto_tag_reply" }`다. `openai_account`는 없다.
  10. 9와 같고 Gemini가 `trialError("gemini","unknown_outcome")`이면 Gemini 1회, data `{ provider: "gemini", reason: "unknown_outcome" }`다.
- [ ] **Step 5: `askSuggestions` 구현** — 스펙 16.1 순서대로 짠다.
  - 답 읽기(zod + `auto_tag_reply`)는 시도마다 같은 함수다. 깨진 답 오류의 provider는 그 시도의 공급자다.
  - 다시 부르는 사유는 `unknown_outcome`·`rate_limit`·`provider_error`, 또는 `providerCode === "auto_tag_reply"`다. 나머지 OpenAI 실패는 루프를 끝낸다.
  - 실패한 OpenAI 시도마다 `console.warn(\`[autoTag] openai 실패 ${n}/${OPENAI_TRIES} ${reason}\`)`를 남긴다. 깨진 답이면 사유 자리에 `auto_tag_reply`를 쓴다.
  - OpenAI 클라이언트가 없고 Gemini를 부를 때는 `console.warn("[autoTag] openai 키 없음, gemini로")`를 남긴다(계획 리뷰 low 8).
  - 두 줄 모두 사유 글자만 남긴다. 대본·답 글·키는 넣지 않는다.
  - Gemini가 있으면 한 번 부르고 결과나 오류를 그대로 낸다.
  - 없으면 마지막 OpenAI 오류를 던진다. 사유가 `provider_auth`·`no_permission`·`quota`면 `trialError("openai", reason, { providerCode: "openai_account" })`로 바꾼다. 둘 다 없으면 `trialError("openai", "no_key", { providerCode: "openai_account" })`다.
  - 주석에 스펙 16.1과 ADR 0008(사용자 결정 예외)을 적는다.
- [ ] **Step 6: 웹 연결**
  - `context.ts`에 `openai: ENV.OPENAI_API_KEY`를 더한다.
  - `.env.schema`의 `GEMINI_API_KEY` 아래에 아래를 더한다.
    ```
    # OpenAI API key (server only; auto tag text model, optional)
    # @optional @sensitive @type=string
    OPENAI_API_KEY=
    ```
  - `.env.example`에 `OPENAI_API_KEY=`를 더한다. `env.ts`는 건드리지 않는다(메인이 `pnpm env:generate`).
  - 타입 검사가 `ENV.OPENAI_API_KEY` 때문에 실패하면 그 사실만 보고한다. 메인이 생성한다.
- [ ] **Step 7: 검사**
  - `pnpm --filter @tts-pilot-app/api test` 전체 통과(763 + 새 테스트, skipped 0)
  - `pnpm check-types` exit 0
  - `pnpm exec biome check <바꾼 파일>` exit 0

### Task 21: 화면 문구와 문서

**Files:**
- Modify:
  - `apps/web/src/lib/tag-view.ts`·`tag-view.test.ts`
  - `apps/web/src/lib/studio-text.ts`·`studio-text.test.ts`
  - `apps/web/src/lib/drama-view.ts`·`drama-view.test.ts`(2207~2208행 `autoTagBody` 단언)
  - `apps/web/src/components/paragraph-autotag.tsx`(모델 안내 렌더, 72·598행 주석)
  - `apps/web/src/components/drama-autotag.tsx`(65·398행 주석만)
  - 문서: `docs/briefs/studio.md`, `docs/briefs/drama.md`, `GLOSSARY.md`, `docs/domain/project.md`, `README.md`, `.agents/skills/tts-provider/SKILL.md`, `docs/research/drama-acting-tags.md`, `docs/plans/implementation-roadmap.md`
- Create: `docs/adr/0008-auto-tag-openai-first.md`
- 읽을 스킬: `.claude/skills/prokit-web/SKILL.md`, `.claude/skills/tts-provider/SKILL.md`(문서 갱신), `.agents/skills/domain-modeling/SKILL.md`(GLOSSARY·ADR 형식)

**Interfaces:**
- Consumes: `providerCode: "openai_account"`(Task 20)
- Produces:
  - `AutoTagTexts.account`
  - `AUTO_TAG_ACCOUNT = "OpenAI 키(OPENAI_API_KEY)나 결제·한도를 확인해 주세요"`(tag-view export)

- [ ] **Step 1: 테스트 (실패 확인)**
  - tag-view.test: 아래 두 경우 모두 `AUTO_TAG_ACCOUNT`다.
    - `autoTagProblemText({ reason: "quota", retryAt: null, providerCode: "openai_account" })`
    - `PARAGRAPH_AUTO_TAG_TEXT`를 넘겨도 같다.
  - tag-view.test: `{ reason: "provider_input", retryAt: null, providerCode: "model_not_found" }` → `texts.failed`(두 문구 표 모두, 계획 리뷰 medium 3)
  - studio-text.test: `PARAGRAPH_TEXT.autoTagModelNote.join("")`이 스펙 16.3 회색 줄과 같다.
  - drama-view.test: 2207~2208행 단언을 새 `autoTagBody`(스펙 16.3)로 바꾼다.
- [ ] **Step 2: 구현**
  - `AutoTagTexts`에 `account`를 더한다. `autoTagProblemText` 첫 줄은 `if (problem.providerCode === "openai_account") return texts.account;`다.
  - `auto_tag_reply` 줄 다음에 `if (problem.reason === "provider_input") return texts.failed;`를 둔다. 자동 태그의 입력 거절은 공급자와 상관없이 '받지 못함'이다. 화면은 OpenAI·Gemini를 구분하지 못한다.
  - `AUTO_TAG_TEXT.account`와 `PARAGRAPH_AUTO_TAG_TEXT.account`는 `AUTO_TAG_ACCOUNT`다.
  - `PARAGRAPH_TEXT.autoTagModelNote`는 다섯 조각이다. 홀수 칸이 모델 코드명이다.
    ```
    ["OpenAI 텍스트 모델(", "gpt-6-luna", ")을 써요. 3번 실패하면 Gemini(", "gemini-3.8-flash", ")로 보내요. Gemini 키가 무료 등급이면 Google이 대본을 학습에 쓸 수 있어요"]
    ```
  - `paragraph-autotag.tsx`는 조각을 `map`으로 그린다. 홀수 칸은 `<span translate="no">`다.
  - `DRAMA_TEXT.autoTagBody`는 스펙 16.3 글이다.
  - 주석의 "Gemini 텍스트" 설명을 "OpenAI(실패하면 Gemini) 텍스트"로 고친다. 해당 줄만 고친다.
- [ ] **Step 3: 문서** — 스펙 16절을 따른다. 고친 줄만 바꾼다.
  - 브리프 studio 15.2 ③·문구 표: 새 회색 줄과 `account` 문구
  - 브리프 drama `autoTagBody` 행
  - GLOSSARY '감정 자동화'·'자동 태그 추천': "OpenAI 텍스트 모델(3번 실패하면 Gemini)"
  - project.md 75·77행 설명, `studioAutoTag`·`dramaAutoTag` API 행: 호출 순서, `openai_account`, 최대 4회
  - README 키 표·예시·`ENV.` 문장에 `OPENAI_API_KEY`
  - tts-provider SKILL.md
    - REST 목록(28행)에 OpenAI(`https://api.openai.com`, `Authorization: Bearer`, 자동 태그 텍스트만, SDK 안 씀)
    - 재시도 규칙(48~49행) 뒤에 예외 한 줄: 자동 태그 텍스트는 OpenAI 3회 + Gemini 1회, 사용자 결정 2026-10-23, ADR 0008
  - research drama-acting-tags.md에 'OpenAI 자동 태그(2026-10-23)' 절: 모델·가격·Structured Outputs 지원 키워드·`gpt-6.1-luna` 없음. 출처 URL은 아래다.
    - `https://developers.openai.com/api/docs/models/gpt-6-luna.md`
    - `https://developers.openai.com/api/docs/models/all`
    - `https://developers.openai.com/api/docs/pricing`
    - `https://developers.openai.com/api/docs/guides/structured-outputs`
    - `https://developers.openai.com/api/docs/guides/latest-model`
  - ADR 0008(형식은 0007): 맥락(60초 시간 초과·503), 결정(OpenAI 우선·Gemini 보조·최대 4회), 버린 안(Gemini 시간 늘리기, SDK), 결과(과금 겹침 가능·키 두 개)
  - 로드맵 T10 구현 상태 줄에 "피드백 2: 자동 태그 OpenAI 우선" 한 구절, T14 메모의 `studioAutoTag`·`dramaAutoTag` "유료 Gemini 텍스트"를 "유료 OpenAI(보조 Gemini) 텍스트"로
- [ ] **Step 4: 검사**
  - `pnpm --filter web test` 통과(666 + 새 테스트)
  - `pnpm check-types` exit 0
  - `pnpm exec biome check <바꾼 코드 파일>` exit 0

## Part 3 구현 뒤 (메인 세션)
- 개발 서버 로그로 env 반영을 확인한다(`.env.schema` 변경 뒤 varlock 다시 읽기).
  - 키 있음 확인은 exit 코드로만 한다(값 출력 금지).
- 브라우저: 두 작업실 확인 창 문구(1440·390), 가짜 `studioAutoTag` 실패 응답 `openai_account` 문구, 오류 예산 0. 유료 호출 0회(guard)다.
- 리뷰: prokit-reviewer(code·security, opus: 유료 호출 다시 부르기·키·로그), ponytail-review 1회
- 메인 설정: `turbo.json` `globalEnv`에 `OPENAI_API_KEY`, `pnpm env:generate`.
- 백로그(`tasks/todo.md`, 블록 밖):
  - T95-13을 "묶음당 최대 4회(OpenAI 3 + Gemini 1), ADR 0008"로 고친다.
  - T10-21에 확인 창 OpenAI 모델 이름(gpt-6-luna) ↔ `OPENAI_TEXT_MODEL` 중복을 더한다.
  - 스펙 16.4의 뺀 것은 백로그로 옮기지 않는다(스펙 표가 정본).
- 행 재실행: 3([design] 설정), 13·14(서버 구현·소유자 없음), 15·20(검사), 16·36(리뷰), 21·27(런타임), 28(ponytail), 29(전체 diff), 30·31(QA), 32~34, 35(tts-provider 규칙 예외), 37(문서)
- [confirm]: 스펙 16.6을 더해 다시 요청한다.
