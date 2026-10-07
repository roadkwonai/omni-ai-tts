# T7 성우 보관함 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성우 캐스팅에서 성우를 담고(별·담기 칸), 즐겨찾기·자주 사용·메모·채널·카테고리·타입을 붙인 뒤 `/voices`에서 필터로 다시 찾는다. 분류를 지워도 성우는 남고, 공급자가 없다고 답한 성우는 기록을 지킨 채 '현재 이용 불가'로 보인다.

**Architecture:**
- `packages/db`: `saved_voice`(담은 성우 + 담을 때의 `Voice` jsonb)와 연결 표 둘(`saved_voice_channel`, `saved_voice_classification`, 양쪽 `on delete cascade`).
- `packages/api`: 공급자 모듈마다 `getVoice`(한 명 조회, 없음 = `null`), `saved-voice-contract.ts`(zod), `routers/saved-voice.ts`(프로시저 5개: 목록·담기·연결·빼기·확인). 담기와 연결은 공급자 + 성우 id로 upsert하므로 처음 하는 동작이 곧 담기다. `channelList`·`classificationList`에 `voiceCount`.
- 화면: `TrialProvider`가 있으면 내 문장 듣기가 있고, 없으면 없다(`useOptionalTrial`). 그래서 같은 `RowList`·`VoicePanel`을 `/voices`에서 그대로 쓴다. 담긴 상태는 `savedVoiceList` 쿼리 하나를 행의 별과 패널의 담기 칸이 함께 읽는다. 필터는 주소 쿼리가 정본이다.

**Tech Stack:** Next.js 16.3 App Router(`typedRoutes`, React Compiler), React 19.3, oRPC 1.15.4, TanStack Query 5.103, zod 4.6.5, drizzle-orm·drizzle-kit 1.0.0-rc.4, Postgres 18(로컬 5433), vitest, shadcn `base-lyra`(Base UI 1.8.0), Tailwind CSS 4, Biome 2. SDK `@neosapience/typecast-js` 0.4.15(`getVoiceV3`), ElevenLabs·Fish Audio는 REST.

**Spec:** [T7 스펙](T07-voice-library.md)(사용자 확인 2026-10-07 "확인, 계획으로", 구속력 있는 정본). 화면 브리프 `docs/briefs/voices.md`(대조표 17행에서 쓰고 사용자 확인. Task 7 전에 있어야 한다). [로드맵 T7](../implementation-roadmap.md), `GLOSSARY.md`(성우 보관함·현재 이용 불가·채널·분류). 조사: `.superpowers/sdd/T07-voice-library-plan/research-provider-lookup.md`(git 밖, 결론은 아래 '설치본·문서로 확인한 것').

**계획 확인:** 사용자 "구현 진행해"(2026-10-07). **실행 방식(4행):** subagent-driven-development(코디네이터 = 메인 세션, 구현 `bts-implementer`, 태스크 리뷰 `bts-reviewer`).

## 계획 리뷰에서 바꾼 것 (2026-10-07)

대조표 3행. 리뷰 셋을 나란히 돌렸다(읽기 전용 서브에이전트, 결과는 `.superpowers/sdd/T07-voice-library-plan/review-plan-{eng,design,ponytail}.md`).
- plan-eng-review: approve-with-fixes. 별도 작업 트리에서 계획 코드를 붙여 타입 검사·DB 없는 테스트·React Compiler·`db:generate`까지 돌렸다.
- plan-design-review: 6/10, 조건부 통과.
- ponytail-review: net -140줄.

사용자 결정(AskUserQuestion 2026-10-07)은 네 건이다. 스펙 '계획 리뷰에서 바꾼 것'에도 옮겼다.
- **U1:** 다른 탭에서 뺀 성우를 건드리면 다시 담긴다(eng D1).
- **U2:** 패널의 담기 칸은 '내 문장 듣기' 뒤, '내 문장 결과' 앞이다(design Q1, 시안에서 이 한 곳만 바뀐다).
- **U3:** 담은 성우 행에 내 분류 칩과 '자주 사용'을 보인다(design Q6).
- **U4:** '분류 붙이기'는 팝오버가 아니라 패널 안에서 펼친다(design Q5, 새 프리미티브 없음 → Task 6 삭제).

아래 태스크 코드는 이 표대로 고쳤다.

| ID | 판정 | 내용 |
|---|---|---|
| E1 | 반영 | `SavedSection`은 `savedVoiceList`가 끝난 뒤에만 칸을 그린다(로딩 뼈대, 오류 한 줄). 목록 전 패널이 빈 메모로 시작해 '메모 저장'이 기존 메모를 지우던 문제(Task 8) |
| E2 + D2 | 반영 | 같은 성우의 변경은 TanStack `scope: { id: "saved:" + savedKey }`로 차례로 보낸다. 연결 목록은 실행 시점의 캐시로 만든다(`mutationFn`이 `getQueryData`를 읽는다). `onMutate`로 캐시를 먼저 고치고 실패하면 목록을 다시 받는다. 컨트롤은 막지 않는다(포커스가 끊기지 않는다). 저장 중 표시는 담기 칸 머리 옆 `Spinner` + 화면 밖 `role="status"`(Task 7·8) |
| E3 | 반영 | `voiceCount`는 `db.$count(savedVoiceChannel, eq(savedVoiceChannel.channelId, channel.id))`(이름이 한정된다, 실행 확인) |
| E4 | 반영 | 분류 붙이기의 목록 함수는 `readonly Named[]`로 넓힌다(TS2345) |
| E5 | 반영 | `checkProvider`의 일꾼은 `const worker = async () => …`(좁히기 유지, TS18048) |
| E6 | 반영 | 동시 담기는 `Promise.all`로 둘 다 성공·같은 id, 같은 성우 연결 둘 동시, 남의 채널로 처음 연결하면 담기까지 되돌림(격리 테스트). 라우터 테스트 9 → 10 |
| E7 | 반영 | 필터 주소는 `window.history.replaceState`로 쓴다(App Router가 `useSearchParams`와 맞춘다, 번들 문서 `01-getting-started/04-linking-and-navigating.md` 343~347행). 서버 전환 없음. 런타임 확인 때 Network 탭으로 본다 |
| E8 | 반영 | 한 번에 확인하는 수는 40(가장 오래 확인하지 않은 순, `nulls first`). 최악 = 공급자 하나에 40명 ÷ 2 × 10초 = 200초, 보통은 공급자 셋에 나뉜다. 화면은 기다리지 않는다 |
| E9 | 반영 | 빼기 뒤 포커스: 캐스팅은 담기 칸 제목(`h3 tabIndex={-1}`), 보관함은 D8 규칙 |
| E10 | 반영 | 429에 `retryAt`이 없으면(Typecast SDK는 헤더를 주지 않는다) 60초 뒤로 대기 시각을 적는다(`ponytail:` 주석) |
| E11 | 반영 | 목록 출력에서 `checkedAt`·`savedAt`을 뺀다('스펙과 다른 점' 6) |
| E12 | 반영 | 모르는 id 버리기는 채널·분류 목록 둘 다 받은 뒤에만(`isSuccess` 둘) |
| E13 | 반영 | 메모 저장 성공이면 초안을 서버 정리값으로 바꾼다. 문제가 있으면 칸 아래 `fieldMessage("memo", …)` |
| E14 | 반영 | 확인 성공 때 ElevenLabs 샘플 언어를 지킨다: `getVoice(source, voiceId, preferred)`, 라우터가 저장한 행 샘플의 언어를 넘긴다 |
| E15 | 반영 | 소유 데이터 목록 옵션 `OWNED_LIST`를 `utils/orpc.ts`에 하나 두고 채널·분류·보관함 목록이 쓴다. 빈 그룹 문구는 `emptyMessage(group)` |
| E16 | 반영 | 분류 쪽 FK 이름이 63자로 잘려 해시가 붙는다. 코드가 FK 이름을 쓰지 않으므로 그대로 두고 Step 2 기대에 적는다 |
| E17 | 반영 | 실패 행은 다음에 열 때 다시 부른다는 한계를 `ponytail:` 주석으로 |
| E18 | 반영 | 만들기·같은 이름 찾기는 컴포넌트 밖 모듈 함수 `createAndFind`(try/finally가 컴파일러를 막는다, 실측) |
| P1 | 반영 | `rowColumns`·손으로 쓴 `Row` 대신 `typeof savedVoice.$inferSelect` |
| P2 | 반영 | `savedVoiceCheck`는 스펙대로 목록(`SavedVoice[]`)을 돌려주고 화면은 `setQueryData`. 개수 스키마 삭제('스펙과 다른 점' 2 삭제) |
| P3 | 기각 | `knownOnly` 유지. 지워진 id가 주소에 남으면 드롭다운에는 고른 것이 없는데 결과는 비어 있다(design 리뷰도 유지 권고) |
| P4 | 반영 | Typecast 단건의 `voice_type` 검사 삭제. 공개 목록에서 담은 id는 종류가 바뀌지 않는다. 404만 없음 |
| P5 | 기각 | ElevenLabs `getVoice`의 공개 출처 거절 유지. 공급자 모듈이 자기 한계를 막는다(라우터 조건이 바뀌어도 404로 오판해 이용 불가로 만들지 않는다) |
| P6 | 반영 | ElevenLabs 403 `voice_access_denied`를 없음으로 보는 분기 삭제. 404만 없음(403은 키 문제 매핑) |
| P7 | 반영 | `voice-filter.ts`의 `anyOf`를 export해 쓴다. `fold` 별칭 없이 `foldName` |
| P8 | 반영 | `useClassLists(): { channels, classes, loaded, failed }` 하나(saved-voices.tsx) |
| P9 | 반영 | `invalidateClasses(queryClient)` 하나 |
| P10 | 기각 | 빼기 확인 창의 창 안 실패 표시는 T6 `class-delete-dialog.tsx` 구조 그대로 둔다(design D15). 대신 `useRemoveVoice`의 알림을 뺀다(실패는 창이 맡는다) |
| P11 | 기각 | 별 툴팁 유지(T5·T6 아이콘 버튼은 모두 툴팁이 있다) |
| P12 | 반영 | 보관함 '다시 불러오기'는 `reloading={list.isFetching}` |
| P13 | 기각 | E1로 `SavedSection`이 로딩 관문 역할을 맡는다 |
| P14 | 반영 | E4와 함께 |
| D1 | 브리프로(B7) | 행 칸 예산: 별 칸이 생기면 오른쪽 144px 칸 임계값을 `@lg`(32rem)에서 36rem으로 올린다(권고). 1200·1280px 이름 칸 최소 글자 수를 QA S17로 |
| D3·D4 | U4로 해소 | 패널 안 펼침. 체크 목록은 네이티브 Tab 순서(방향키 이동은 만들지 않는다, ponytail). 검색 결과 수는 화면 밖 `role="status"` |
| D5 | 반영 | 칩은 그룹마다 한 줄(왼쪽 회색 그룹 이름), 줄 높이 44px, 윤곽 칩(D10). × 접근 이름 '카테고리 뉴스 떼기'. 뗀 뒤 포커스는 같은 그룹 다음 칩 → 이전 칩 → '분류 붙이기'. 결과는 화면 밖 알림 |
| D6 | 반영 | 조건 줄은 캐스팅 문법: 검색 + 보기 세 칸 + 공급자 드롭다운(단일) + 채널·카테고리·타입 드롭다운(체크). 767px 이하는 검색 + '조건' 버튼으로 접는다. '조건 모두 해제'는 상태 줄 링크 |
| D7 | U3 | 담은 성우 행은 공급자 알약 자리에 내 분류 칩(최대 2 + '+N', 채널 → 카테고리 → 타입), 이름 옆 '자주 사용' 회색 배지 |
| D8 | 반영 | 보관함에서 행이 조건에서 빠지면(별 해제·자주 사용 해제·빼기) 포커스는 다음 행 고르기 → 이전 행 → 상태 줄. 서랍은 닫는다. 화면 밖 알림 한 줄 |
| D9 | 반영 | 보관함 목록 로딩은 행 뼈대 5줄 + `aria-busy`. 분류 목록 로딩·실패는 펼친 목록 안에 한 줄. 담기 목록이 오기 전·실패면 별은 `aria-disabled`(누르면 아무것도 보내지 않는다) |
| D10·D11 | 반영 | 사용자 칩은 윤곽 칩. 즐겨찾기 토글은 윤곽(`variant="outline"`), 켜지면 별 채움. '분류 붙이기'는 칩 줄 아래 `variant="link"`. '보관함에서 빼기'는 회색 글자 |
| D12 | 브리프로(B1) | 채운 별은 `foreground`(무채색) 권고 |
| D13 | U2 | |
| D14 | 반영 | 메모가 바뀌었으면 글자 수 옆 "저장하지 않은 변경이 있어요" |
| D15 | 반영 | 빼기 확인 창은 `class-delete-dialog.tsx` 구조(전송 가드, 스피너, `role="status"`, 실패 시 '취소'로, `NOT_FOUND`면 닫고 알림). 성공 알림 "‘{이름}’ 성우를 보관함에서 뺐어요." |
| D16 | 반영 | 이용 불가 배지는 회색 배지 맨 앞(브리프 B6가 모양). 패널 안내에 "메모와 분류는 그대로 남아 있어요." 상태 줄에 "· 현재 이용 불가 N명". ElevenLabs 공개 라이브러리 성우 패널에 "공개 라이브러리 성우는 이용 가능 여부를 확인하지 않아요" |
| D17 | 반영 | 검색 칸 자리표시 '이름으로 찾거나 새로 만들기'. 분류가 하나도 없으면 "이름을 쓰면 바로 만들어 붙일 수 있어요". 40자 초과 안내는 검색 칸 아래 한 줄. 만들기 버튼은 줄바꿈 |
| D18 | 반영 | 삭제 덧붙임 "연결된 성우 {N}명은 보관함에 그대로 남고, 이 {그룹} 연결만 풀려요." '성우 N명' 링크는 메모 뒤·주소 링크 앞(스펙 4절 고침) |
| D19 | 반영 | 상태 줄은 16px 회색 `tabular-nums` "담은 성우 40명" / "담은 성우 40명 중 12명". 보이는 줄에는 role을 두지 않고, 개수는 입력이 0.5초 멈춘 뒤 화면 밖 `role="status"`. '조건 모두 해제' 뒤 포커스는 검색 칸 |
| D20 | 반영 | 검색어는 지역 상태로 바로 거르고, 주소에는 0.5초 멈춘 뒤 쓴다. 나머지 조건은 바로 쓴다 |
| D21 | 반영 | 메뉴 순서는 성우 캐스팅 바로 뒤. 휴대폰 위 막대 4칸은 그대로(바꾸려면 앱 틀 브리프 사용자 결정, 이번 범위 밖) |
| D22·D23 | 반영 | '이용 가능 여부를 확인하고 있어요'. 글자 '→' 대신 `ArrowRight` 아이콘. 행 목록 안내 '방향키로 성우와 버튼 사이를 옮겨요' |
| D24 | 기각 | 확인 상한 40(E8)으로 최악이 줄었고 화면은 기다리지 않는다. 15초 타이머(effect)를 두지 않고 '확인하고 있어요' 한 줄만 둔다(ponytail) |
| D25 | 반영 | 스펙 10절에 S16~S21 |

## 스펙과 다른 점

스펙에는 '계획 리뷰에서 바꾼 것' 절로 옮겼다(1·4·6과 U1~U4).

1. **프로시저 6개 → 5개.** `savedVoiceUpdate`를 두지 않는다. `savedVoiceSave({ voice, favorite?, frequent?, memo? })`가 공급자 + 성우 id로 upsert하므로 별·자주 사용·메모 바꾸기가 모두 이 호출이다. 연결도 `savedVoiceLinks({ voice, channelIds, classificationIds })`로 성우를 받아 같은 트랜잭션에서 담고 바꾼다. 화면이 "담겼는지"를 먼저 알 필요가 없고, 남의 id를 넣을 자리가 `savedVoiceRemove` 하나로 준다(ponytail). 결과: 다른 탭에서 뺀 성우를 건드리면 `NOT_FOUND`가 아니라 다시 담긴다(사용자 결정 U1, 스펙 5절·S10·8절 8번 고침). `NOT_FOUND`는 빼기와 연결 대상(채널·분류)에만 남는다.
2. **ElevenLabs 공개 라이브러리 성우는 확인하지 않는다.** 공식 문서에 한 명 조회 방법이 없다(조사 2절: `shared-voices`에 voice id 필터 없음, `GET /v1/voices/{id}`가 계정 밖 공유 성우에 200을 주는지 정보 없음). 스펙 3절의 대비 규칙대로 저장한 정보를 그대로 쓰고 이용 불가로 만들지 않는다. 확인 대상 조회에서 처음부터 빼고, 패널에 그 사실을 한 줄로 알린다(D16).
3. **"없음"의 범위:** 404에 더해 Fish Audio는 403과 `fishVoice`가 `null`인 경우(학습 전, 삭제 요청, 공개 출처인데 공개가 아님)를 "없음"(현재 이용 불가)으로 본다. 목록 규칙(`fishVoice`가 거르는 것)과 같아 행과 보관함이 어긋나지 않는다. Typecast·ElevenLabs는 404만이다(P4·P6). 다른 403은 그대로 키 문제다.
4. **조회 과금:** 세 공급자 모두 이 조회의 과금 문구가 문서에 없다(무료라고 명시하지도 않음). 스펙의 "무료 조회"를 "과금 문구 없음(목록 조회와 같은 읽기 호출)"으로 읽고, 24시간에 한 번·한 번에 40명·공급자당 동시 2건·429면 중단 규칙을 지킨다. `tts-provider` 스킬에도 이렇게 적는다(Task 10).
5. **확인 상한:** 화면을 한 번 열 때 확인하는 수는 40명(가장 오래 확인하지 않은 순)이다. 남은 행은 다음에 열 때 확인한다(E8).
6. **목록 출력:** `checkedAt`·`savedAt`을 내보내지 않는다. 정렬은 서버가 하고 화면은 쓰지 않는다(E11, T9가 필요하면 더한다).

## 브리프로 넘길 결정 (17행 `docs/briefs/voices.md`가 다룬다)

권고는 계획 리뷰(design)의 것이다. 브리프에서 사용자가 확인한다.

- **B1 행의 별:** 44px 아이콘 버튼, 툴팁 '즐겨찾기'/'즐겨찾기 해제'. 채운 별 색은 `foreground`(무채색) 권고(D12, One Teal Rule).
- **B2 담기 칸:** 자리는 '내 문장 듣기' 뒤·'내 문장 결과' 앞(U2). 구성은 다음 순서다.
  - 즐겨찾기 윤곽 토글 + 자주 사용 스위치 한 줄
  - 그룹별 칩 줄(왼쪽 회색 그룹 이름, 윤곽 칩, ×)
  - '분류 붙이기'(링크 모양, 누르면 아래로 펼침)
  - 메모
  - '보관함에서 빼기'(회색 글자)
  - 저장 중 표시: 칸 머리 옆 스피너
- **B3 분류 붙이기 펼침(U4):** 검색 칸, 그룹 머리, 체크 줄 44px, 빈 그룹 문구, 만들기 줄 "+ ‘{검색어}’ {그룹} 만들기", 최대 높이와 안 스크롤.
- **B4 `/voices` 조건 줄(D6):**
  - 구성: 검색 + 보기 세 칸 + 공급자 드롭다운 + 채널·카테고리·타입 드롭다운. 트리거 이름 '카테고리 · 2', 접근 이름 '카테고리, 2개 선택됨'.
  - 767px 이하: 검색 + '조건' 버튼으로 접는다.
  - 상태 줄: '조건 모두 해제' 링크와 인원 글자(D19).
- **B5 문구:**
  - 페이지 설명
  - 빈 보관함 / 조건 없음
  - 확인 중 한 줄(D22·D24)
  - 이용 불가 배지와 패널 안내(D16), ElevenLabs 공개 성우 안내
  - '보관함에서 빼기' 확인 창과 완료 알림(D15)
  - '성우 N명'
  - 삭제 확인 창 덧붙임(D18)
  - 메모 저장 알림, 저장하지 않은 변경 힌트(D14)
  - 붙임·뗌 알림
- **B6 이용 불가 행:** 흐리게 하지 않고 배지만 둔다(권고). 배지 모양.
- **B7 행 칸 예산(D1):** 별 칸이 생기면 오른쪽 144px 칸 임계값을 32rem에서 36rem으로 올린다(권고). 좁은 칸의 이름 줄바꿈. `DESIGN.md` 성우 행 절도 고친다.
- **B8 담은 성우 행(U3):** 내 분류 칩(최대 2 + '+N')의 모양, '자주 사용' 배지.

브리프가 문구·간격을 바꾸면 Task 5의 `LIBRARY_TEXT`·문구 함수와 UI 태스크의 클래스를 브리프대로 고치고 테스트 기대값도 맞춘다.

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`bts-dev-cycle` 5절)에 한 번 한다. 태스크 경계는 장부에 tree SHA(`.superpowers/sdd/T07-voice-library-plan/tools/snap.sh`)로 적는다.
- `apps/web/.env`를 읽거나 출력하지 않는다. `packages/db/.env`도 내용을 출력하지 않는다. 테스트 DB 주소는 `source .superpowers/sdd/T07-voice-library-plan/tools/testdb.env`로만 넘기고 출력하지 않는다. 증거에는 "로컬 5433 `tts-pilot-app_test`"만 적는다.
- 공급자를 실제로 부르지 않는다. 자동 테스트는 `fetchMock`·가짜 `Providers`로만 한다. 구현 서브에이전트는 개발 서버(`127.0.0.1:3001`)로 어떤 요청도 보내지 않는다(브라우저·curl·fetch·테스트 스크립트의 `/api/rpc/*` 모두). 서버를 끄거나 다시 켜지 않는다. `pkill`·`killall`·`.next` 삭제 금지. `pnpm build`·DB 명령·shadcn add는 코디네이터만 한다.
- `packages/api/src/providers/`는 인증 민감 경로다(대조표에 security 리뷰 행이 붙는다). `getVoice`는 유료·상태 변경 호출이 아니다(읽기). SDK 자동 재시도가 없는 경로(REST, Typecast SDK)만 쓴다.
- 로컬 관리자 모드(`AGENTS.md`):
  - 소유자는 `context.ownerId`에서만 얻고 입력으로 받지 않는다. insert는 소유자를 값의 마지막에 둔다.
  - 모든 select·update·delete에 `owner_id = 소유자` 조건을 건다. 연결할 채널·분류도 소유자 조건으로 고른다. 영향받은 행이 없으면 `NOT_FOUND`다.
  - Server Action·새 Route Handler를 만들지 않는다.
  - 페이지는 막지 않고 데이터는 `protectedProcedure`가 막는다.
- 화면은 `@tts-pilot-app/api/classification-rules`·`@tts-pilot-app/api/providers/contract`(타입)·`@tts-pilot-app/api/providers/trial-options`에서만 가져간다. 계약 파일(`*-contract.ts`)의 zod 값은 가져가지 않는다(`apps/web`에 zod 의존이 없다. 타입 import는 된다).
- 실패 로그는 한 줄(`[savedVoice] <단계> 실패: <오류 이름> <DB 코드>`)이다. 메모·성우 정보·SQL을 로그나 `ORPCError`의 `cause`·`data`에 넣지 않는다. 공급자 오류는 기존 `runList` 매핑(공급자·상태 코드만)을 쓴다.
- 입력 규칙:
  - 메모: T6 메모 규칙(`cleanText`, 0~200자, 비면 null)
  - 연결 id: uuid, 그룹마다 최대 50개, 중복 제거
  - `voice`: `voiceSchema` + 샘플 주소가 그 공급자 호스트(`SAMPLE_HOST`) + JSON 20,000자 이하
- 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex·임의 값을 새로 넣지 않는다. 굵기는 `font-normal`·`font-bold`뿐이다.
- 인터랙티브 요소는 44px 이상이다(버튼 `size="lg"`·`size="icon-lg"`, 링크 `min-h-11`). 입력 칸은 `min-h-11`이고 767px 이하에서 `text-base md:text-sm`이다. `focus-visible`이 보여야 한다. 오류·실패 문구 색은 `text-warning`이다.
- 화면 문구는 Task 5 `saved-voice-view.ts`와 브리프의 문구만 쓴다. 브리프가 이긴다. 문구는 `-어요` 보이스다. 이름 뒤에 조사를 붙이지 않는다(받침을 모른다: "‘{이름}’ 성우를 …").
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(탭 들여쓰기).
- 패키지:
  - 이름: 앱 `web`, API `@tts-pilot-app/api`, DB `@tts-pilot-app/db`, UI `@tts-pilot-app/ui`.
  - 테스트: API는 `pnpm --filter @tts-pilot-app/api test [파일]`, web은 `pnpm --filter web test [파일]`.
  - DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다(`source …/testdb.env`). skipped는 통과가 아니다.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `ponytail:` 주석으로 남긴다.

## Review Focus

- **목록이 오기 전·두 번 누르기:** 별을 목록이 오기 전에 누르거나 빠르게 두 번 누르면 성우가 두 행이 되거나, 마지막 상태가 서버와 달라진다.
  - Task 3 "같은 성우를 동시에 두 번 담아도 한 행"(유니크 + `on conflict`)
  - Task 7 같은 성우의 변경은 `scope`로 차례로 보내고 목록이 오기 전에는 별이 `aria-disabled`다(E2·D9, 저장 중에는 막지 않는다)
  - QA S15
- **남의 채널·분류 id 끼워 넣기:** B가 A의 채널 id를 자기 성우에 붙이면 A의 '성우 N명'이 늘고 A가 지울 때 B의 연결이 사라진다.
  - Task 3 "남의 채널·분류 id가 섞이면 NOT_FOUND이고 아무것도 바뀌지 않는다"(소유자 조건으로 고른 수 비교, 트랜잭션)
- **연결 중 다른 탭에서 그 분류를 지움:** 고른 뒤 넣기 전에 지워지면 외래 키 위반(23503)이 500으로 새거나 반쯤 저장된다.
  - Task 3 `stored`가 23503을 `NOT_FOUND`로 바꾸고 트랜잭션이 되돌린다(DB 없이 도는 테스트 한 건)
  - QA S10
- **클라이언트가 보낸 `voice`에 다른 호스트 샘플이나 큰 덩어리:** `javascript:`·다른 호스트 주소가 오디오 src로, 수 MB JSON이 행으로 들어간다.
  - Task 3 계약 테스트: `http:`·다른 호스트·20,001자 거절
- **이용 가능 확인이 공급자 장애·429에서 잘못 표시:** 5xx·타임아웃을 '현재 이용 불가'로 만들거나, 429 뒤에도 계속 부르거나, ElevenLabs 공개 성우를 404로 지운 것처럼 보이면 안 된다.
  - Task 2 공급자별 "없음"과 오류 구분
  - Task 4 "5xx·타임아웃은 그대로", "429면 대기 시각을 적고 그 공급자 나머지 0회", "ElevenLabs 공개 성우는 조회 0회", "24시간 안 된 행은 0회"

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다.

- `bts-db`:
  - 스키마는 `packages/db/src/schema/saved-voice.ts`에 두고 `schema/index.ts`에서 export한다.
  - 마이그레이션은 `pnpm --filter @tts-pilot-app/db db:generate`로 만들고 생성 SQL을 검토한다. 로컬과 테스트 DB에 `db:migrate`한 뒤 다시 generate해 변경 없음을 본다.
  - `user` 외래 키는 걸지 않는다(ADR 0004, 스펙 2절).
  - 이 저장소 첫 외래 키(채널·분류·담은 성우로)와 복합 기본 키다. `docs/domain/project.md` 데이터 표와 ADR 0004 결과 절에 적는다.
- `supabase-postgres-best-practices`:
  - `schema-foreign-key-indexes`: 연결 표의 `channel_id`·`classification_id`에 인덱스를 둔다. `saved_voice_id`는 복합 기본 키 앞 컬럼이 덮는다.
  - `data-upsert`: 담기는 조회 후 삽입이 아니라 `insert … on conflict (owner_id, provider, voice_id) do update`다.
  - `schema-data-types`: provider·source는 enum 대신 text + `check`다(T6 관례).
  - `lock-short-transactions`: 연결 바꾸기 트랜잭션 안에서는 공급자를 부르지 않는다(DB 문장만).
  - `query-composite-indexes`: 목록은 `(owner_id, saved_at desc)` 인덱스를 쓴다.
- `bts-api`:
  - 불변식 1·2: 프로시저 5개 모두 `protectedProcedure`, 소유자는 `context.ownerId`만.
  - 불변식 3: update·delete와 연결 대상 선택에 `owner_id`, 없으면 `NOT_FOUND`.
  - 불변식 4: 입력 zod(길이·개수·크기 상한), 출력 zod.
  - 불변식 7: 연결의 소유자 검사는 권한 판정이다. 대조표에 security 리뷰 행을 직접 더한다(15행과 함께).
  - 격리 테스트는 같은 작업(Task 3·4).
- `tts-provider`:
  - 공급자 호출은 `providers/<공급자>.ts`에만 둔다. 프로시저는 `getVoice`만 부른다.
  - 오류 매핑은 `runList`를 쓴다(로그에 공급자·상태 코드만).
  - 429 `Retry-After`는 `provider_cooldown`(`recordCooldown`)에 적고, 그 전에는 부르지 않는다(`cooldownOf`).
  - 한 공급자 장애가 다른 공급자 확인을 막지 않게 공급자마다 따로 돈다.
  - 자동 테스트는 가짜 공급자로만 한다.
- `bts-web`:
  - 조회는 `useQuery(orpc.savedVoiceList.queryOptions(...))`, 변경은 `useMutation` + `setQueryData`/무효화.
  - loading·empty·error·비인가(`LoopbackNotice`)를 나눈다.
  - 페이지는 Server Component이고 클라이언트 경계는 `VoiceLibrary`부터다.
  - `useSearchParams`는 `<Suspense>` 안에서 쓴다(번들 문서 `04-functions/use-search-params.md` "Prerendering" 절).
- `vercel-react-best-practices`:
  - `rerender-derived-state-no-effect`: 필터 결과·칩 그룹·고른 수는 렌더 중 계산이다.
  - `rerender-move-effect-to-event`: 저장은 이벤트 처리기와 `mutate` 콜백에서 한다.
  - 확인 호출만 `useQuery`(첫 표시 때 한 번)다.
  - React Compiler가 건너뛰지 않게 렌더 중 ref 쓰기와 try/catch를 두지 않는다.
- `shadcn`: `base-lyra`다. 새 프리미티브는 없다(분류 붙이기는 패널 안 펼침, U4). 필터 메뉴는 기존 `DropdownMenu`(`DropdownMenuCheckboxItem`), 담기 칸은 기존 `Toggle`·`Switch`·`Checkbox`·`Textarea`·`AlertDialog`·`Tooltip`이다.
- `bts-ui`(+ impeccable `craft-floor.md`): UI 태스크(7~9) 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 브리프(17행)가 기준이다. 리뷰(critique·audit)는 메인 세션에서 한다.

## 설치본·문서로 확인한 것

| 대상 | 확인 결과 | 위치 |
|---|---|---|
| Typecast 단건 | SDK `client.getVoiceV3(voiceId): Promise<VoiceV3Response>`, 경로에 `encodeURIComponent`. 응답은 목록 항목과 같은 `VoiceV3`(`voice_type` 포함). 404 `VOICE_NOT_FOUND` → `toHttpError`가 `ProviderHttpError(404, ["VOICE_NOT_FOUND"])` | `@neosapience/typecast-js/lib/index.d.ts:562`, `lib/index.js:657`, typecast.ai/docs/api-reference/voices/get-voice-details |
| Fish Audio 단건 | `GET /model/{id}`가 목록과 같은 `ModelEntity`. 403 "authorization will not help", 404 "Nothing matches" | docs.fish.audio/api-reference/endpoint/model/get-model.md |
| ElevenLabs 계정 단건 | `GET /v1/voices/{id}`. SDK는 응답 전체를 한 번에 검사하므로 REST(`getJson`)로 부른다(목록과 같은 이유). 404 `voice_not_found`, 403 `voice_access_denied`(공식 오류 표) | elevenlabs.io/docs/api-reference/voices/get.md, …/resources/errors.md |
| ElevenLabs 공개 단건 | 방법 없음(문서). `shared-voices` 쿼리 18개에 voice id 없음, SDK `VoicesGetSharedRequest`도 같다 | 조사 2절 |
| 조회 과금 | 세 공급자 모두 문구 없음 | 조사 1절 '과금' |
| `runList` | 404는 `reasonFromHttp`가 `null` → `provider_error`로 바꿔 던진다. 그래서 `getVoice`는 `call` 안에서 404(와 위 '없음' 코드)를 먼저 잡아 `null`을 돌려준다. `ORPCError`는 그대로 다시 던진다 | `providers/errors.ts:258-302` |
| 샘플 호스트 | 세 모듈에 인라인 정규식뿐(export 없음): Typecast `(^\|\.)typecast\.ai$`, ElevenLabs `^(storage\.googleapis\.com\|([a-z0-9-]+\.)*elevenlabs\.io)$`, Fish Audio `(^\|\.)fish\.audio$` | `typecast.ts:44-51`, `elevenlabs.ts:77-81`, `fish-audio.ts:55-59` |
| 변환 함수 | `toVoice(raw)`(Typecast, source 고정 public), `elVoice(raw, source, preferred)` + `accountVoiceSchema`, `fishVoice(raw, source): Voice \| null`. 모두 모듈 내부 | 각 파일 |
| 대기 표 | `cooldownOf(db, provider, now): Promise<Date \| null>`, `recordCooldown(db, provider, retryAt: Date)`(1시간 상한), `guard(step, run, prefix)`(DB 오류를 삼켜 `undefined`) | `voice-cache.ts:82,107,126` |
| `stored`·`found` | `routers/classification.ts` 내부(export 없음). `stored`는 이름 중복 → `CONFLICT`, 그 밖 → 한 줄 로그 + 500 | `classification.ts:37-53` |
| `memoSchema` | `classification-contract.ts` 내부 const | `:22-26` |
| `voiceKey` | `provider:source:voiceId`. 보관함 키는 `provider:voiceId`라 따로 둔다 | `lib/voice-view.ts:27-29` |
| roving | `Col = 0\|1\|2`, `nextCell`의 오른쪽 상한 2 하드코딩, `RowList.cellOf`가 행 안 `button` 순서를 칸으로 쓴다 | `lib/roving.ts`, `voice-row.tsx:388-392` |
| `useTrial` | `TrialProvider` 밖이면 렌더 중 throw. `SentenceBar`·`TrialSection`·`TrialResults`·`TrialButton`·`VoiceRow`가 부른다. `TrialProvider`·`SamplePlayerProvider`는 `voice-casting.tsx`만 감싼다 | `trial-provider.tsx:396` |
| packages/ui | popover·combobox·select·command 없음. `dropdown-menu`(CheckboxItem)·`toggle`·`toggle-group`·`switch`·`checkbox`·`textarea`·`alert-dialog`·`sheet`·`tooltip` 있음. `@base-ui/react` 1.8.0에 `popover` 있음 | `packages/ui/src/components/` |
| `useSearchParams` | 클라이언트 훅. 미리 렌더하는 경로에서는 가장 가까운 `Suspense`까지 클라이언트 렌더가 된다 → 페이지에서 `<Suspense>`로 감싼다. `cacheComponents`는 꺼져 있다 | 번들 문서, `apps/web/next.config.ts` |
| 메타 제목 | `layout.tsx`의 `title.template "%s · TTS Pilot"` → 페이지는 `title: "성우 보관함"` | `app/layout.tsx:17` |
| `NoMatches({ onClear })` | "조건에 맞는 성우가 없어요" + '조건 모두 해제'. 보관함이 그대로 쓴다 | `voice-problem.tsx:188` |
| 목록 `toEqual` | T6 테스트가 목록 항목을 만든 값과 `toEqual`로 비교한다 → `voiceCount`를 더하면 기대값에 `voiceCount: 0`을 더한다 | `classification*.test.ts` |

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `packages/api/src/providers/sample-hosts.ts` | 공급자별 샘플 호스트 정규식 `SAMPLE_HOST`(한 곳) | 1 |
| `packages/api/src/providers/{typecast,elevenlabs,fish-audio}.ts` | `SAMPLE_HOST` 사용, `getVoice` | 1·2 |
| `packages/api/src/providers/errors.ts` | `ProviderClient.getVoice?` | 2 |
| `packages/api/src/providers/{typecast,elevenlabs,fish-audio}.test.ts` | `getVoice` 테스트 | 2 |
| `packages/db/src/schema/saved-voice.ts`, `schema/index.ts`, `migrations/<생성>/` | 표 셋 | 3 |
| `packages/api/src/voice-cache.ts` | `stored(prefix, step, run, mapError?)`, `found(row)`를 여기로 옮긴다(두 라우터가 쓴다) | 3 |
| `packages/api/src/routers/classification.ts` | `stored`·`found`를 `voice-cache`에서 가져오고, 목록 둘에 `voiceCount` | 3 |
| `packages/api/src/classification-contract.ts` | `memoSchema` export, 목록 항목 스키마 `channelListItemSchema`·`classificationListItemSchema` | 3 |
| `packages/api/src/saved-voice-contract.ts` | 입력·출력 zod | 3 |
| `packages/api/src/routers/saved-voice.ts` | 프로시저 5개 | 3·4 |
| `packages/api/src/routers/index.ts` | `...savedVoiceRouter` | 3 |
| `packages/api/src/routers/saved-voice.test.ts`, `saved-voice.isolation.test.ts`, `saved-voice-contract.test.ts`, `classification*.test.ts` | 테스트 | 3·4 |
| `apps/web/src/lib/saved-voice-view.ts`, `.test.ts` | 키, 필터, 쿼리 변환, 칩 그룹, 같은 이름 찾기, 문구 | 5 |
| `apps/web/src/lib/voice-filter.ts` | `anyOf` export(P7) | 5 |
| `apps/web/src/utils/orpc.ts` | `OWNED_LIST`(E15) | 7 |
| `apps/web/src/lib/roving.ts`, `.test.ts` | 칸 상한을 인자로 | 7 |
| `apps/web/src/components/trial-provider.tsx` | `useOptionalTrial` | 7 |
| `apps/web/src/components/saved-voices.tsx` | 쿼리 옵션·훅(`useSavedItem`, `useClassLists`, `useSaveVoice`, `useLinkVoice`, `useRemoveVoice`, `useSaving`), `SavedStar` | 7 |
| `apps/web/src/components/voice-row.tsx`, `voice-panel.tsx`, `casting-workspace.tsx` | 별 칸, 내 분류 칩·자주 사용 배지, 내 문장 듣기는 trial 있을 때만, 이용 불가 배지·안내, 담기 칸 자리(U2) | 7 |
| `apps/web/src/components/saved-section.tsx` | 패널 담기 칸(관문, 즐겨찾기·자주 사용·칩·메모·빼기 확인) | 8 |
| `apps/web/src/components/class-picker.tsx` | 분류 붙이기(패널 안 펼침, 바로 만들기) | 8 |
| `apps/web/src/app/(app)/voices/page.tsx` | 페이지 | 9 |
| `apps/web/src/components/voice-library.tsx`, `library-filters.tsx` | 보관함 화면, 조건 줄 | 9 |
| `apps/web/src/components/class-group.tsx`, `class-delete-dialog.tsx`, `classes-board.tsx` | '성우 N명', 삭제 덧붙임, `OWNED_LIST`, 보관함 무효화 | 7·9 |
| `apps/web/src/components/app-nav.tsx` | 메뉴 이동 | 9 |
| 문서 | `docs/domain/project.md`, `docs/briefs/site-map.md`, `docs/adr/0004-…`(결과 절), research 3개, `tts-provider` 스킬, 로드맵 | 10 |

## 대조표 행과 태스크

| 행 | 태스크 |
|---|---|
| 4 구현 방식 | 실행 방식 선택 뒤 장부 시작 |
| 5 스키마·dbGenerate | Task 3 Step 1~3 |
| 6 타입·린트, 7 로컬 migrate, 8 Neon(임시 브랜치) | Task 3 Step 3 뒤 코디네이터 |
| 9 파괴적 변경 | 새 표 셋만, 없음 |
| 10 bts-reviewer(db) | Task 3 Step 3 뒤 |
| 11 zod 계약 | Task 3 Step 4 |
| 12 구현, 13 격리, 14 타입·린트·테스트 | Task 1~4 |
| 15 bts-reviewer(code) + `[review] bts-reviewer(security)`(providers 경로로 자동, 연결 소유자 검사로 직접) | Task 4 뒤. security focus: 연결의 소유자 검사, 소유자 덮기, `voice` 입력 검사(호스트·크기), 공급자 호출 주체·429·재시도, 로그 누출 |
| 16 impeccable context, 17 shape 브리프 | Task 5 뒤, Task 7 전 메인 세션(사용자 확인, B1~B8) |
| 18 UI 구현 | Task 7~9 |
| 19~30 검증·리뷰·QA | 구현 뒤 |
| 35 문서 영향 | Task 10 |

---

### Task 1: 샘플 호스트를 한 곳으로

**Files:**
- Create: `packages/api/src/providers/sample-hosts.ts`
- Modify: `packages/api/src/providers/typecast.ts:44-51`, `elevenlabs.ts:77-81`, `fish-audio.ts:55-59`

**Interfaces:**
- Produces: `SAMPLE_HOST: Record<ProviderId, RegExp>` (Task 3 계약이 쓴다)

정규식 값은 그대로 옮긴다. 동작이 바뀌지 않으므로 `voice-cache.ts`의 `CONTRACT_VERSION`은 올리지 않는다. 기존 공급자 테스트가 그대로 통과하는 것이 검사다.

- [ ] **Step 1: 파일을 만든다**

```ts
// packages/api/src/providers/sample-hosts.ts
import type { ProviderId } from "./contract";

// 오디오 src에 넣어도 되는 공급자 샘플 호스트(T3·T4 실측). 목록 변환과 보관함 담기 입력 검사(T7)가 함께 쓴다.
// 화면 번들에 들어가도 되는 값만 둔다(SDK·서버 모듈 import 없음)
export const SAMPLE_HOST = {
	typecast: /(^|\.)typecast\.ai$/,
	elevenlabs: /^(storage\.googleapis\.com|([a-z0-9-]+\.)*elevenlabs\.io)$/,
	fish_audio: /(^|\.)fish\.audio$/,
} as const satisfies Record<ProviderId, RegExp>;
```

- [ ] **Step 2: 세 모듈의 인라인 정규식을 바꾼다**

`typecast.ts`의 `preview_url`:
```ts
	preview_url: z
		.url({
			protocol: /^https$/,
			hostname: SAMPLE_HOST.typecast,
			normalize: true,
		})
		.nullish()
		.catch(null),
```
`elevenlabs.ts`의 `sampleUrl`은 `hostname: SAMPLE_HOST.elevenlabs`, `fish-audio.ts`의 `sampleUrl`은 `hostname: SAMPLE_HOST.fish_audio`. 세 파일에 `import { SAMPLE_HOST } from "./sample-hosts";`를 더하고 주석(실측 호스트)은 남긴다.

- [ ] **Step 3: 기존 테스트로 확인한다**

Run: `pnpm --filter @tts-pilot-app/api test src/providers && pnpm exec biome check --write packages/api/src/providers`
Expected: 기존 공급자 테스트 모두 PASS(개수는 바뀌지 않는다).

---

### Task 2: 공급자 한 명 조회 `getVoice`

**Files:**
- Modify: `packages/api/src/providers/errors.ts:89-99`(`ProviderClient`)
- Modify: `packages/api/src/providers/typecast.ts`, `elevenlabs.ts`, `fish-audio.ts`(반환 객체에 `getVoice`)
- Test: `packages/api/src/providers/typecast.test.ts`, `elevenlabs.test.ts`, `fish-audio.test.ts`

**Interfaces:**
- Consumes: Task 1 없음(독립)
- Produces: `ProviderClient.getVoice?(source: VoiceSource, voiceId: string, preferred?: string | null): Promise<Voice | null>`. `null` = 공급자가 없다고 답함(현재 이용 불가). 공급자 문제는 `runList`와 같은 `providerError`(429면 `data.retryAt`). ElevenLabs `source === "public"`은 부르지 않고 `providerError("elevenlabs", "provider_error")`를 던진다(라우터가 애초에 부르지 않는다, '스펙과 다른 점' 3).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`typecast.test.ts` 끝에 더한다(파일의 기존 `useFetchMock()`·`json`·`calledUrl` 사용):
```ts
describe("Typecast 성우 한 명 조회(T7)", () => {
	const raw = {
		voice_id: "tc_abc",
		voice_name: { eng: "Minji", kor: "민지" },
		voice_type: "original",
		gender: "female",
		age: "young_adult",
		use_cases: ["Audiobook"],
		models: [{ version: "ssfm-v30", emotions: ["normal"] }],
		preview_url: "https://static.typecast.ai/a.mp3",
	};
	const get = (id = "tc_abc") => createTypecast(KEY).getVoice?.("public", id);

	it("200이면 목록과 같은 Voice, 경로는 /v3/voices/{id}", async () => {
		fetchMock.mockResolvedValue(json(200, raw));
		const voice = await get();
		expect(voice).toMatchObject({
			provider: "typecast",
			source: "public",
			voiceId: "tc_abc",
			name: "민지",
			previewUrl: "https://static.typecast.ai/a.mp3",
		});
		expect(calledUrl().pathname).toBe("/v3/voices/tc_abc");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("404면 null(현재 이용 불가)", async () => {
		fetchMock.mockResolvedValue(
			json(404, { message: "Voice not found", error_code: "VOICE_NOT_FOUND" }),
		);
		expect(await get()).toBeNull();
	});
	it("5xx는 null이 아니라 provider_error", async () => {
		fetchMock.mockResolvedValue(json(503, {}));
		await expect(get()).rejects.toMatchObject({
			data: { provider: "typecast", reason: "provider_error" },
		});
	});
});
```
SDK가 ESM·CJS에서 fetch를 다르게 잡으면 이 파일의 기존 `CjsTypecastClient` 방식을 따른다(기존 `listVoices` 테스트가 어떻게 하는지 먼저 본다).

`fish-audio.test.ts` 끝에 더한다:
```ts
describe("Fish Audio 성우 한 명 조회(T7)", () => {
	const raw = {
		_id: "fish1",
		type: "tts",
		state: "trained",
		visibility: "public",
		title: "차분한 남자",
		tags: ["male"],
		languages: ["ko"],
		samples: [{ title: "샘플", audio: "https://platform.r2.fish.audio/a.mp3" }],
	};
	const get = (source: "public" | "account" = "public", id = "fish1") =>
		createFishAudio(KEY).getVoice?.(source, id);

	it("200이면 Voice, 경로는 /model/{id}(인코딩)", async () => {
		fetchMock.mockResolvedValue(json(200, raw));
		expect(await get()).toMatchObject({
			provider: "fish_audio",
			voiceId: "fish1",
			name: "차분한 남자",
		});
		expect(calledUrl().pathname).toBe("/model/fish1");
		fetchMock.mockResolvedValue(json(200, raw));
		await get("public", "a/b");
		expect(calledUrl(1).pathname).toBe("/model/a%2Fb");
	});
	it("404·403이면 null", async () => {
		fetchMock.mockResolvedValueOnce(json(404, {}));
		expect(await get()).toBeNull();
		fetchMock.mockResolvedValueOnce(json(403, {}));
		expect(await get()).toBeNull();
	});
	it("공개 출처인데 비공개로 바뀌었거나 학습 전이면 null", async () => {
		fetchMock.mockResolvedValueOnce(json(200, { ...raw, visibility: "private" }));
		expect(await get()).toBeNull();
		fetchMock.mockResolvedValueOnce(json(200, { ...raw, state: "training" }));
		expect(await get()).toBeNull();
	});
	it("401은 null이 아니라 provider_auth", async () => {
		fetchMock.mockResolvedValue(json(401, {}));
		await expect(get()).rejects.toMatchObject({
			data: { provider: "fish_audio", reason: "provider_auth" },
		});
	});
});
```
`KEY`가 이 파일에 없으면 파일의 기존 키 상수 이름을 쓴다.

`elevenlabs.test.ts` 끝에 더한다:
```ts
describe("ElevenLabs 성우 한 명 조회(T7)", () => {
	const raw = {
		voice_id: "el1",
		name: "Jiyoung",
		category: "professional",
		description: "차분함",
		preview_url: "https://storage.googleapis.com/a.mp3",
		labels: { gender: "female", accent: "seoul" },
		verified_languages: [],
	};
	const get = (source: "public" | "account" = "account", id = "el1") =>
		createElevenLabs(KEY).getVoice?.(source, id);

	it("계정 성우 200이면 Voice(account), 경로는 /v1/voices/{id}", async () => {
		fetchMock.mockResolvedValue(json(200, raw));
		expect(await get()).toMatchObject({
			provider: "elevenlabs",
			source: "account",
			voiceId: "el1",
			name: "Jiyoung",
			gender: "female",
		});
		expect(calledUrl().pathname).toBe("/v1/voices/el1");
	});
	it("404면 null", async () => {
		fetchMock.mockResolvedValue(
			json(404, { detail: { code: "voice_not_found" } }),
		);
		expect(await get()).toBeNull();
	});
	it("403은 null이 아니라 키 문제(목록과 같은 매핑)", async () => {
		fetchMock.mockResolvedValue(
			json(403, { detail: { code: "voice_access_denied" } }),
		);
		await expect(get()).rejects.toMatchObject({
			data: { provider: "elevenlabs" },
		});
	});
	it("preferred 언어의 샘플을 행 샘플로 고른다(확인 뒤에도 담을 때의 언어, E14)", async () => {
		fetchMock.mockResolvedValue(
			json(200, {
				...raw,
				verified_languages: [
					{ language: "en", preview_url: "https://storage.googleapis.com/en.mp3" },
					{ language: "ko", preview_url: "https://storage.googleapis.com/ko.mp3" },
				],
			}),
		);
		const voice = await createElevenLabs(KEY).getVoice?.("account", "el1", "ko");
		expect(voice?.previewUrl).toBe("https://storage.googleapis.com/ko.mp3");
	});
	it("공개 라이브러리 성우는 부르지 않는다(한 명 조회 방법 없음)", async () => {
		await expect(get("public")).rejects.toMatchObject({
			data: { provider: "elevenlabs", reason: "provider_error" },
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
```
`errorBodySchema`가 `detail.code`를 읽는 모양이 다르면(`detailCodes`) 그 모양에 맞춰 본문을 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @tts-pilot-app/api test src/providers`
Expected: FAIL — `getVoice`가 없어 `undefined`(새 테스트 12건 실패: Typecast 3, Fish Audio 4, ElevenLabs 5).

- [ ] **Step 3: `ProviderClient`에 선택 메서드를 더한다**

`errors.ts`의 `ProviderClient`에:
```ts
	// 성우 한 명 다시 조회(T7 보관함 이용 가능 확인). null은 공급자가 '없다'고 답한 것(현재 이용 불가)이고,
	// 공급자 문제는 목록과 같은 providerError다. 읽기 호출이라 과금 문구가 없다(조사 2026-10-07)
	// preferred는 ElevenLabs 행 샘플 언어(담을 때 고른 언어를 지킨다, 계획 리뷰 E14). 다른 공급자는 무시한다
	getVoice?(
		source: VoiceSource,
		voiceId: string,
		preferred?: string | null,
	): Promise<Voice | null>;
```
`VoiceSource`·`Voice` 타입 import를 더한다.

- [ ] **Step 4: 세 공급자에 구현한다**

`typecast.ts` 반환 객체에:
```ts
		// 404만 '없음'이다. 보관함에는 공개 목록에서 담은 성우만 있고 id의 종류는 바뀌지 않는다(계획 리뷰 P4)
		getVoice: (_source: VoiceSource, voiceId: string) =>
			runList("typecast", async () => {
				const raw = await client
					.getVoiceV3(voiceId)
					.catch(toHttpError)
					.catch((error: unknown) => {
						if (error instanceof ProviderHttpError && error.status === 404)
							return null;
						throw error;
					});
				return raw === null ? null : toVoice(rawVoiceSchema.parse(raw));
			}),
```

`fish-audio.ts` 반환 객체에:
```ts
		// 404·403과 합성할 수 없게 된 성우(fishVoice가 null: 학습 전·삭제 요청·공개 출처인데 비공개)는 '없음'이다(T7 계획 '스펙과 다른 점' 4)
		getVoice: (source: VoiceSource, voiceId: string) =>
			runList("fish_audio", async (signal) => {
				const raw = await getJson(
					`/model/${encodeURIComponent(voiceId)}`,
					signal,
				).catch((error: unknown) => {
					if (
						error instanceof ProviderHttpError &&
						(error.status === 403 || error.status === 404)
					)
						return null;
					throw error;
				});
				return raw === null ? null : fishVoice(rawVoiceSchema.parse(raw), source);
			}),
```

`elevenlabs.ts` 반환 객체에:
```ts
		// 계정 성우만 확인한다. 공개 라이브러리 성우는 한 명 조회 방법이 문서에 없어 부르지 않는다(T7 계획 '스펙과 다른 점' 2).
		// 이 거절은 라우터 조건과 겹치지만 둔다: 계정 조회로 부르면 404가 와 이용 불가로 오판한다(계획 리뷰 P5 기각).
		// SDK voices.get은 응답 전체를 한 번에 검사하므로 목록처럼 REST로 부른다. 404만 '없음'이다(P6)
		getVoice: (source: VoiceSource, voiceId: string, preferred?: string | null) =>
			runList("elevenlabs", async (signal) => {
				if (source === "public") throw providerError("elevenlabs", "provider_error");
				const body = await getJson(
					`/v1/voices/${encodeURIComponent(voiceId)}`,
					new URLSearchParams(),
					signal,
				).catch((error: unknown) => {
					if (error instanceof ProviderHttpError && error.status === 404)
						return null;
					throw error;
				});
				return body === null
					? null
					: elVoice(accountVoiceSchema.parse(body), "account", preferred ?? null);
			}),
```
필요한 import(`ProviderHttpError`, `providerError`, `runList`, `VoiceSource`)가 없으면 더한다. `runList`는 이미 사유가 붙은 `ORPCError`를 그대로 다시 던진다(`errors.ts` 마지막 줄).

- [ ] **Step 5: 통과를 확인하고 포맷한다**

Run: `pnpm --filter @tts-pilot-app/api test src/providers && pnpm exec biome check --write packages/api/src/providers && pnpm --filter @tts-pilot-app/api check-types`
Expected: 새 12건 포함 PASS, 타입 0 오류. 장부에 tree SHA.
`elVoice`의 세 번째 인자(`preferred`)가 행 샘플 언어를 고르는지 `samplesOf`로 확인한다(다르면 E14 테스트 기대를 그 함수 동작에 맞춘다).

---

### Task 3: 보관함 표·계약·목록·담기·연결·빼기 (DB 명령은 코디네이터)

**Files:**
- Create: `packages/db/src/schema/saved-voice.ts`, `packages/api/src/saved-voice-contract.ts`, `packages/api/src/routers/saved-voice.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/api/src/voice-cache.ts`, `packages/api/src/routers/classification.ts`, `packages/api/src/classification-contract.ts`, `packages/api/src/routers/index.ts`
- Test: `packages/api/src/saved-voice-contract.test.ts`, `packages/api/src/routers/saved-voice.test.ts`, `saved-voice.isolation.test.ts`, 기존 `classification.test.ts`·`classification.isolation.test.ts`(목록 기대값)

**Interfaces:**
- Consumes: Task 1 `SAMPLE_HOST`, 계약 `voiceSchema`·`Voice`, T6 `channel`·`classification` 표, `deleteInputSchema`·`deletedSchema`
- Produces (Task 4·5·7~9가 쓴다):
  - 표 `savedVoice`, `savedVoiceChannel`, `savedVoiceClassification`
  - `voice-cache.ts`: `stored<T>(prefix: string, step: string, run: () => Promise<T>, mapError?: (error: unknown) => ORPCError | null): Promise<T>`, `found<T>(row: T | undefined): T`
  - 프로시저:
    - `savedVoiceList(): SavedVoice[]`
    - `savedVoiceSave({ voice, favorite?, frequent?, memo? }): SavedVoice`
    - `savedVoiceLinks({ voice, channelIds, classificationIds }): SavedVoice`
    - `savedVoiceRemove({ id }): { deleted: true }`
  - `SavedVoice = { id: string; voice: Voice; favorite: boolean; frequent: boolean; memo: string | null; unavailable: boolean; channelIds: string[]; classificationIds: string[] }`
  - `channelList` 항목에 `voiceCount: number`, `classificationList` 항목에 `voiceCount: number`

- [ ] **Step 1: 스키마를 쓴다**

```ts
// packages/db/src/schema/saved-voice.ts
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { channel, classification } from "./classification";

// 성우 보관함(T7 스펙 3절, GLOSSARY '성우 보관함'). 담기 = 이 표의 행 하나다. 즐겨찾기·자주 사용을 꺼도 남고 '보관함에서 빼기'로만 지운다.
// voice는 담을 때(그리고 이용 가능 확인에 성공할 때) 받은 계약 Voice 그대로다. 읽을 때 api가 voiceSchema로 다시 검사한다.
// user 외래 키는 걸지 않는다(ADR 0004와 같다, T14에서 정한다)
export const savedVoice = pgTable(
	"saved_voice",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerId: text("owner_id").notNull(),
		provider: text("provider")
			.$type<"typecast" | "elevenlabs" | "fish_audio">()
			.notNull(),
		voiceId: text("voice_id").notNull(),
		// 담은 출처. 키가 아니다(같은 성우를 공개·계정 어느 쪽에서 담아도 한 행). 이용 가능 확인이 조회 방법을 고르는 데 쓴다
		source: text("source").$type<"public" | "account">().notNull(),
		favorite: boolean("favorite").default(false).notNull(),
		frequent: boolean("frequent").default(false).notNull(),
		memo: text("memo"),
		voice: jsonb("voice").notNull(),
		// 공급자가 '없다'고 답했다(현재 이용 불가). 확인에 성공하면 다시 false
		unavailable: boolean("unavailable").default(false).notNull(),
		// 마지막으로 공급자에 확인한 시각. 담을 때는 지금(살아 있는 목록에서 담았다)
		checkedAt: timestamp("checked_at", { withTimezone: true }),
		savedAt: timestamp("saved_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		// 같은 성우는 한 번만(REQ-04). 담기 upsert의 충돌 대상이다
		unique("saved_voice_voice").on(t.ownerId, t.provider, t.voiceId),
		// 목록(최근 담은 순)
		index("saved_voice_owner_saved").on(t.ownerId, t.savedAt.desc()),
		check(
			"saved_voice_provider",
			sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio')`,
		),
		check("saved_voice_source", sql`${t.source} in ('public', 'account')`),
	],
);

// 성우 ↔ 채널. 어느 쪽을 지워도 연결만 지워진다(로드맵 T7 메모). saved_voice_id 조회는 기본 키 앞 컬럼이, 채널 쪽은 아래 인덱스가 맡는다
export const savedVoiceChannel = pgTable(
	"saved_voice_channel",
	{
		savedVoiceId: uuid("saved_voice_id")
			.notNull()
			.references(() => savedVoice.id, { onDelete: "cascade" }),
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channel.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({
			name: "saved_voice_channel_pk",
			columns: [t.savedVoiceId, t.channelId],
		}),
		index("saved_voice_channel_channel").on(t.channelId),
	],
);

// 성우 ↔ 카테고리·타입
export const savedVoiceClassification = pgTable(
	"saved_voice_classification",
	{
		savedVoiceId: uuid("saved_voice_id")
			.notNull()
			.references(() => savedVoice.id, { onDelete: "cascade" }),
		classificationId: uuid("classification_id")
			.notNull()
			.references(() => classification.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({
			name: "saved_voice_classification_pk",
			columns: [t.savedVoiceId, t.classificationId],
		}),
		index("saved_voice_classification_classification").on(t.classificationId),
	],
);
```
`schema/index.ts`에 `export * from "./saved-voice";`를 더한다. drizzle 1.0.0-rc.4의 `primaryKey({ name, columns })` 꼴은 설치본 `drizzle-orm/pg-core/primary-keys.d.ts`로 확인한다(이름 인자가 다르면 그 꼴로).

- [ ] **Step 2: 코디네이터 — 마이그레이션을 만들고 검토한다**

Run: `pnpm --filter @tts-pilot-app/db db:generate`
Expected:
- `packages/db/src/migrations/<시각>_<이름>/migration.sql`에 `CREATE TABLE` 셋, `CONSTRAINT "saved_voice_voice" UNIQUE("owner_id","provider","voice_id")`, check 둘, `PRIMARY KEY` 둘, 인덱스 셋, `FOREIGN KEY … ON DELETE cascade` 넷이 있다.
- `DROP`·`ALTER … TYPE`은 없다.
- 분류 쪽 FK 이름은 63자 제한으로 잘려 해시가 붙는다(`saved_voice_classification_…_fkey`). 코드가 FK 이름을 쓰지 않으므로 그대로 둔다(E16).

- [ ] **Step 3: 코디네이터 — 로컬·테스트 DB에 적용한다**

Run: `pnpm --filter @tts-pilot-app/db db:migrate`, 이어서 `(source .superpowers/sdd/T07-voice-library-plan/tools/testdb.env && DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @tts-pilot-app/db db:migrate)`, 다시 `db:generate`.
Expected: 두 DB 모두 적용, 마지막 generate는 "No schema changes". 대조표 5·6·7·9·10행(10은 `bts-reviewer(db)`), 8행(Neon 임시 브랜치, T6과 같은 방식).

- [ ] **Step 4: 계약 테스트를 쓴다**

```ts
// packages/api/src/saved-voice-contract.test.ts
import { describe, expect, it } from "vitest";

import { emptyVoice } from "./providers/list";
import {
	savedVoiceLinksInputSchema,
	savedVoiceSaveInputSchema,
} from "./saved-voice-contract";

const voice = {
	...emptyVoice("fish_audio", "public"),
	voiceId: "fish1",
	name: "차분한 남자",
	previewUrl: "https://platform.r2.fish.audio/a.mp3",
	samples: [
		{ language: null, title: null, url: "https://platform.r2.fish.audio/a.mp3" },
	],
};

describe("담기 입력(T7 스펙 3절)", () => {
	it("그 공급자 호스트의 https 샘플만 받는다", () => {
		expect(savedVoiceSaveInputSchema.safeParse({ voice }).success).toBe(true);
		for (const url of [
			"https://evil.example/a.mp3",
			"https://typecast.ai/a.mp3",
		])
			expect(
				savedVoiceSaveInputSchema.safeParse({
					voice: { ...voice, previewUrl: url },
				}).success,
			).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({
				voice: {
					...voice,
					samples: [{ language: null, title: null, url: "http://a.fish.audio/a" }],
				},
			}).success,
		).toBe(false);
	});
	it("JSON 20,000자를 넘는 성우 정보는 거절한다", () => {
		const big = { ...voice, tags: Array.from({ length: 2000 }, (_, i) => `tag${i}xxxxx`) };
		expect(savedVoiceSaveInputSchema.safeParse({ voice: big }).success).toBe(false);
	});
	it("메모는 T6 규칙으로 정리하고(빈 값 null), 주지 않으면 키가 없다", () => {
		expect(
			savedVoiceSaveInputSchema.parse({ voice, memo: "  차분  함 " }).memo,
		).toBe("차분 함");
		expect(savedVoiceSaveInputSchema.parse({ voice, memo: "" }).memo).toBeNull();
		expect("memo" in savedVoiceSaveInputSchema.parse({ voice })).toBe(false);
		expect(
			savedVoiceSaveInputSchema.safeParse({ voice, memo: "가".repeat(201) })
				.success,
		).toBe(false);
	});
	it("연결 id는 uuid, 그룹마다 50개까지, 중복은 하나로", () => {
		const id = "6f1c1f3e-8a7b-4c2d-9e0f-1a2b3c4d5e6f";
		expect(
			savedVoiceLinksInputSchema.parse({
				voice,
				channelIds: [id, id],
				classificationIds: [],
			}).channelIds,
		).toEqual([id]);
		expect(
			savedVoiceLinksInputSchema.safeParse({
				voice,
				channelIds: ["x"],
				classificationIds: [],
			}).success,
		).toBe(false);
		expect(
			savedVoiceLinksInputSchema.safeParse({
				voice,
				channelIds: [],
				classificationIds: Array.from({ length: 51 }, () => crypto.randomUUID()),
			}).success,
		).toBe(false);
	});
});
```

- [ ] **Step 5: 계약을 쓴다**

`classification-contract.ts`: `const memoSchema`를 `export const memoSchema`로 바꾸고, 파일 끝에 목록 항목 스키마를 더한다.
```ts
// 목록 항목은 연결된 성우 수가 더 있다(T7). 만들기·고치기 결과에는 없다(화면은 결과의 이름만 쓰고 목록을 다시 받는다)
export const channelListItemSchema = channelSchema.extend({
	voiceCount: z.number().int().nonnegative(),
});
export const classificationListItemSchema = classificationSchema.extend({
	voiceCount: z.number().int().nonnegative(),
});
```

```ts
// packages/api/src/saved-voice-contract.ts
import { z } from "zod";

import { deleteInputSchema, memoSchema } from "./classification-contract";
import { type Voice, voiceSchema } from "./providers/contract";
import { SAMPLE_HOST } from "./providers/sample-hosts";

// 성우 보관함 프로시저의 입력·출력(T7 스펙 3절). 담기의 voice는 클라이언트가 목록에서 받은 값이라 서버가 다시 검사한다:
// 계약 모양(https 포함) + 샘플 주소가 그 공급자 호스트 + 크기 상한. 다음 이용 가능 확인에서 공급자 값으로 바뀐다
const VOICE_JSON_MAX = 20_000;
const LINK_MAX = 50;

const sampleUrls = (voice: Voice) => [
	...(voice.previewUrl ? [voice.previewUrl] : []),
	...voice.samples.map((sample) => sample.url),
];
export const savedVoiceInputSchema = voiceSchema
	.refine(
		(voice) =>
			sampleUrls(voice).every((url) =>
				SAMPLE_HOST[voice.provider].test(new URL(url).hostname),
			),
		{ message: "sample_host" },
	)
	.refine((voice) => JSON.stringify(voice).length <= VOICE_JSON_MAX, {
		message: "too_large",
	});

const idsSchema = z
	.array(z.uuid())
	.max(LINK_MAX)
	.transform((ids) => [...new Set(ids)]);

// 주지 않은 필드는 바꾸지 않는다(처음 담기면 기본값 false·null)
export const savedVoiceSaveInputSchema = z.object({
	voice: savedVoiceInputSchema,
	favorite: z.boolean().optional(),
	frequent: z.boolean().optional(),
	memo: memoSchema.optional(),
});
// 그 성우의 연결을 이 목록으로 바꾼다(담기지 않았으면 담는다)
export const savedVoiceLinksInputSchema = z.object({
	voice: savedVoiceInputSchema,
	channelIds: idsSchema,
	classificationIds: idsSchema,
});
export const savedVoiceRemoveInputSchema = deleteInputSchema;

export const savedVoiceSchema = z.object({
	id: z.uuid(),
	voice: voiceSchema,
	favorite: z.boolean(),
	frequent: z.boolean(),
	memo: z.string().nullable(),
	unavailable: z.boolean(),
	channelIds: z.array(z.uuid()),
	classificationIds: z.array(z.uuid()),
});
export type SavedVoice = z.infer<typeof savedVoiceSchema>;
```

Run: `pnpm --filter @tts-pilot-app/api test src/saved-voice-contract.test.ts`
Expected: PASS 4.

- [ ] **Step 6: `stored`·`found`를 `voice-cache.ts`로 옮긴다**

`voice-cache.ts`에 더한다(`ORPCError` import는 `@orpc/server`):
```ts
// 소유 데이터 프로시저의 저장소 오류 틀(T6에서 뽑음, T7 두 번째 사용처). mapError가 고른 오류(CONFLICT·NOT_FOUND 등)는 그대로,
// 그 밖은 한 줄(오류 이름·DB 코드)만 남기고 500이다. 오류 객체(쿼리 파라미터 = 사용자 입력)는 로그와 cause에 넘기지 않는다
export async function stored<T>(
	prefix: string,
	step: string,
	run: () => Promise<T>,
	mapError: (error: unknown) => ORPCError<string, unknown> | null = () => null,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		const mapped = mapError(error);
		if (mapped) throw mapped;
		logDbFailure(prefix, step, error);
		throw new ORPCError("INTERNAL_SERVER_ERROR");
	}
}

// 바뀐 행이 없으면 NOT_FOUND. 남의 것인지 없는 것인지 드러내지 않는다(bts-api 불변식 3)
export function found<T>(row: T | undefined): T {
	if (!row) throw new ORPCError("NOT_FOUND");
	return row;
}
```
`routers/classification.ts`에서 로컬 `stored`·`found`를 지우고 위를 import한다. 호출은 `stored("[classes]", "채널 목록", () => …, duplicateName)` 꼴이고 `duplicateName`은:
```ts
const duplicateName = (error: unknown) =>
	isDuplicateName(error)
		? new ORPCError("CONFLICT", { data: { reason: "duplicate_name" } })
		: null;
```
로그 형식(`[classes] 채널 만들기 실패: …`)이 같아 T6 로그 테스트가 그대로 통과해야 한다.

- [ ] **Step 7: `voiceCount`를 더한다(T6 테스트 기대값 먼저)**

`classification.test.ts`·`classification.isolation.test.ts`에서 목록을 만든 값과 `toEqual`로 비교하는 곳(`expect(await as(A).channelList()).toEqual([ch])` 등)을 `toEqual([{ ...ch, voiceCount: 0 }])`처럼 바꾼다. `classification.test.ts`에 한 건 더한다(Step 10 라우터가 생긴 뒤 통과):
```ts
	it("목록의 voiceCount는 연결된 담은 성우 수다(T7)", async () => {
		const ch = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const cat = await me.classificationCreate({ kind: "category", name: "뉴스", memo: "" });
		await me.savedVoiceLinks({ voice: VOICE_A, channelIds: [ch.id], classificationIds: [cat.id] });
		await me.savedVoiceLinks({ voice: VOICE_B, channelIds: [ch.id], classificationIds: [] });
		expect((await me.channelList())[0]?.voiceCount).toBe(2);
		expect((await me.classificationList())[0]?.voiceCount).toBe(1);
	});
```
`VOICE_A`·`VOICE_B`는 Step 8 테스트 파일과 같은 정의를 이 파일 위에 둔다(`emptyVoice("typecast","public")` + `voiceId`·`name`). `beforeEach`에서 `savedVoice`도 지운다(`await db.delete(savedVoice)`를 채널·분류보다 먼저).

라우터 목록 두 개:
```ts
	channelList: protectedProcedure
		.output(z.array(channelListItemSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored("[classes]", "채널 목록", () =>
				db
					.select({
						...channelColumns,
						// 연결은 소유자 검사를 거쳐서만 생기므로(savedVoiceLinks) 연결 행 수가 곧 내 담은 성우 수다.
						// $count는 상관 서브쿼리의 열 이름을 표 이름으로 한정한다(sql 템플릿은 "channel_id" = "id"로 나간다, 계획 리뷰 E3)
						voiceCount: db.$count(
							savedVoiceChannel,
							eq(savedVoiceChannel.channelId, channel.id),
						),
					})
					.from(channel)
					.where(eq(channel.ownerId, ownerId)),
			),
		),
```
`classificationList`도 같은 꼴(`db.$count(savedVoiceClassification, eq(savedVoiceClassification.classificationId, classification.id))`).

- [ ] **Step 8: 라우터 테스트를 쓴다**

```ts
// packages/api/src/routers/saved-voice.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `saved-${Date.now()}`;
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers: null } as Context,
	});
const me = as(OWNER);
const voiceOf = (voiceId: string, name = voiceId) => ({
	...emptyVoice("typecast", "public"),
	voiceId,
	name,
	previewUrl: "https://static.typecast.ai/a.mp3",
});
const VOICE_A = voiceOf("tc_a", "민지");
const VOICE_B = voiceOf("tc_b", "준호");

describe.skipIf(!url)("성우 보관함(T7 스펙 3·8절)", () => {
	beforeEach(async () => {
		await db.delete(savedVoice);
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(savedVoice);
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("담기 왕복: 처음 담기면 기본값, 목록은 최근 담은 순", async () => {
		const a = await me.savedVoiceSave({ voice: VOICE_A, favorite: true });
		expect(a).toMatchObject({
			voice: VOICE_A,
			favorite: true,
			frequent: false,
			memo: null,
			unavailable: false,
			channelIds: [],
			classificationIds: [],
		});
		await me.savedVoiceSave({ voice: VOICE_B });
		expect((await me.savedVoiceList()).map((item) => item.voice.voiceId)).toEqual([
			"tc_b",
			"tc_a",
		]);
	});

	it("같은 성우를 다시 담으면 한 행이고 준 필드만 바뀌며 정보는 새 값이다", async () => {
		await me.savedVoiceSave({ voice: VOICE_A, favorite: true, memo: "차분" });
		const again = await me.savedVoiceSave({
			voice: { ...VOICE_A, source: "account", name: "민지(새)" },
			frequent: true,
		});
		expect(again).toMatchObject({ favorite: true, frequent: true, memo: "차분" });
		expect(again.voice.name).toBe("민지(새)");
		expect(await me.savedVoiceList()).toHaveLength(1);
		const off = await me.savedVoiceSave({ voice: VOICE_A, favorite: false, frequent: false });
		expect(off).toMatchObject({ favorite: false, frequent: false });
		expect(await me.savedVoiceList()).toHaveLength(1);
	});

	it("같은 성우를 동시에 두 번 담아도 둘 다 성공하고 한 행", async () => {
		const [x, y] = await Promise.all([
			me.savedVoiceSave({ voice: VOICE_A, favorite: true }),
			me.savedVoiceSave({ voice: VOICE_A, frequent: true }),
		]);
		expect(x.id).toBe(y.id);
		expect(await me.savedVoiceList()).toMatchObject([
			{ favorite: true, frequent: true },
		]);
	});

	it("같은 성우의 연결 바꾸기 둘이 동시에 와도 둘 다 성공하고 한쪽 목록이 남는다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const c2 = await me.channelCreate({ name: "주말", memo: "", url: "" });
		await Promise.all([
			me.savedVoiceLinks({ voice: VOICE_A, channelIds: [c1.id], classificationIds: [] }),
			me.savedVoiceLinks({ voice: VOICE_A, channelIds: [c2.id], classificationIds: [] }),
		]);
		const [item] = await me.savedVoiceList();
		expect([[c1.id], [c2.id]]).toContainEqual(item?.channelIds);
	});

	it("연결을 목록으로 바꾸고(담기지 않았으면 담는다) 다시 바꾸면 빠진 것이 풀린다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const c2 = await me.channelCreate({ name: "주말", memo: "", url: "" });
		const cat = await me.classificationCreate({ kind: "category", name: "뉴스", memo: "" });
		const linked = await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c1.id, c2.id],
			classificationIds: [cat.id],
		});
		expect(new Set(linked.channelIds)).toEqual(new Set([c1.id, c2.id]));
		expect(linked.classificationIds).toEqual([cat.id]);
		const fewer = await me.savedVoiceLinks({
			voice: VOICE_A,
			channelIds: [c2.id],
			classificationIds: [],
		});
		expect(fewer).toMatchObject({ channelIds: [c2.id], classificationIds: [] });
	});

	it("없는 채널 id가 하나라도 섞이면 NOT_FOUND이고 아무것도 바뀌지 않는다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		await me.savedVoiceLinks({ voice: VOICE_A, channelIds: [c1.id], classificationIds: [] });
		await expect(
			me.savedVoiceLinks({
				voice: VOICE_A,
				channelIds: [c1.id, crypto.randomUUID()],
				classificationIds: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await me.savedVoiceList())[0]?.channelIds).toEqual([c1.id]);
	});

	it("채널·분류를 지우면 연결만 풀리고 성우는 남는다", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const cat = await me.classificationCreate({ kind: "type", name: "차분함", memo: "" });
		await me.savedVoiceLinks({ voice: VOICE_A, channelIds: [c1.id], classificationIds: [cat.id] });
		await me.channelDelete({ id: c1.id });
		await me.classificationDelete({ id: cat.id });
		expect(await me.savedVoiceList()).toMatchObject([
			{ voice: { voiceId: "tc_a" }, channelIds: [], classificationIds: [] },
		]);
	});

	it("빼기하면 연결도 사라지고, 없는 id는 NOT_FOUND", async () => {
		const c1 = await me.channelCreate({ name: "경제", memo: "", url: "" });
		const item = await me.savedVoiceLinks({ voice: VOICE_A, channelIds: [c1.id], classificationIds: [] });
		expect(await me.savedVoiceRemove({ id: item.id })).toEqual({ deleted: true });
		expect(await me.savedVoiceList()).toEqual([]);
		expect((await me.channelList())[0]?.voiceCount).toBe(0);
		await expect(me.savedVoiceRemove({ id: item.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("저장한 정보가 계약과 어긋나면 이름 자리에 성우 id를 보인다", async () => {
		const item = await me.savedVoiceSave({ voice: VOICE_A });
		await db.update(savedVoice).set({ voice: { broken: true } });
		expect((await me.savedVoiceList())[0]).toMatchObject({
			id: item.id,
			voice: { provider: "typecast", voiceId: "tc_a", name: "tc_a" },
		});
	});
});

describe("저장소 오류(DB 없이)", () => {
	const throwingDb = (error: unknown) =>
		new Proxy(
			{},
			{
				get() {
					throw error;
				},
			},
		) as Context["db"];

	it("외래 키 위반(연결 중 지워짐)은 NOT_FOUND, 그 밖은 한 줄 로그와 500", async () => {
		const fk = Object.assign(new Error("query failed"), { cause: { code: "23503" } });
		await expect(
			as(OWNER, throwingDb(fk)).savedVoiceLinks({
				voice: VOICE_A,
				channelIds: [],
				classificationIds: [],
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const down = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
		await expect(
			as(OWNER, throwingDb(down)).savedVoiceSave({ voice: VOICE_A, memo: "비밀 메모" }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0]?.[0])).toMatch(/^\[savedVoice\] 담기 실패: /);
		expect(JSON.stringify(log.mock.calls)).not.toContain("비밀 메모");
		log.mockRestore();
	});
});
```
`logDbFailure`의 실제 출력 형식(인자 개수)은 `classification.test.ts`의 로그 테스트와 같은 단언 방식을 따른다.

```ts
// packages/api/src/routers/saved-voice.isolation.test.ts
import { createRouterClient } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { emptyVoice } from "../providers/list";
import type { Providers } from "../providers";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `saved-iso-a-${Date.now()}`;
const B = `saved-iso-b-${Date.now()}`;
const getVoice = vi.fn(async () => null);
const providers: Providers = { typecast: { checkStatus: vi.fn(), getVoice } };
const as = (ownerId: string | null, database: Context["db"] = db) =>
	createRouterClient(appRouter, {
		context: { db: database, ownerId, providers } as Context,
	});
const VOICE = {
	...emptyVoice("typecast", "public"),
	voiceId: "tc_a",
	name: "민지",
};

describe.skipIf(!url)("성우 보관함 소유자 격리(스펙 8절 8번)", () => {
	beforeEach(async () => {
		await db.delete(savedVoice);
		await db.delete(channel);
		await db.delete(classification);
	});
	afterAll(async () => {
		await db.delete(savedVoice);
		await db.delete(channel);
		await db.delete(classification);
		await db.$client.end();
	});

	it("B는 A의 담은 성우를 보지 못하고 빼지 못하며, 같은 성우를 따로 담는다", async () => {
		const mine = await as(A).savedVoiceSave({ voice: VOICE, favorite: true, memo: "A 메모" });
		expect(await as(B).savedVoiceList()).toEqual([]);
		await expect(as(B).savedVoiceRemove({ id: mine.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const theirs = await as(B).savedVoiceSave({ voice: VOICE });
		expect(theirs.id).not.toBe(mine.id);
		expect(theirs).toMatchObject({ favorite: false, memo: null });
		expect(await as(A).savedVoiceList()).toEqual([mine]);
	});

	it("B가 A의 채널·분류 id를 자기 성우에 붙이면 NOT_FOUND이고 A의 수는 그대로", async () => {
		const ch = await as(A).channelCreate({ name: "A 채널", memo: "", url: "" });
		const cat = await as(A).classificationCreate({ kind: "category", name: "A 분류", memo: "" });
		await expect(
			as(B).savedVoiceLinks({ voice: VOICE, channelIds: [ch.id], classificationIds: [] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			as(B).savedVoiceLinks({ voice: VOICE, channelIds: [], classificationIds: [cat.id] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await as(A).channelList())[0]?.voiceCount).toBe(0);
		expect((await as(A).classificationList())[0]?.voiceCount).toBe(0);
		// 처음 담는 성우였으므로 트랜잭션이 담기까지 되돌렸다
		expect(await as(B).savedVoiceList()).toEqual([]);
	});

	it("입력에 ownerId를 끼워도 소유자는 서버가 정한 값이다", async () => {
		await as(B).savedVoiceSave({ voice: VOICE, ownerId: A } as never);
		expect(await as(A).savedVoiceList()).toEqual([]);
		expect(await as(B).savedVoiceList()).toHaveLength(1);
	});
});

describe("소유자 없음(스펙 8절 9번)", () => {
	it("프로시저 5개 모두 UNAUTHORIZED이고 DB·공급자 접근이 0회", async () => {
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
			() => nobody.savedVoiceList(),
			() => nobody.savedVoiceSave({ voice: VOICE }),
			() => nobody.savedVoiceLinks({ voice: VOICE, channelIds: [], classificationIds: [] }),
			() => nobody.savedVoiceRemove({ id }),
			() => nobody.savedVoiceCheck(),
		])
			await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(dbTouches).toBe(0);
		expect(getVoice).not.toHaveBeenCalled();
	});
});
```
`savedVoiceCheck`는 Task 4에서 생긴다. 이 태스크에서는 그 한 줄을 빼고 돌리고 Task 4 Step 1에서 되살린다(Task 4가 이 파일을 고친다).

- [ ] **Step 9: 실패를 확인한다**

Run: `(source .superpowers/sdd/T07-voice-library-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/saved-voice src/routers/classification)`
Expected: FAIL — `savedVoiceSave` 등이 없다.

- [ ] **Step 10: 라우터를 쓴다**

```ts
// packages/api/src/routers/saved-voice.ts
import { ORPCError } from "@orpc/server";
import {
	channel,
	classification,
} from "@tts-pilot-app/db/schema/classification";
import {
	savedVoice,
	savedVoiceChannel,
	savedVoiceClassification,
} from "@tts-pilot-app/db/schema/saved-voice";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { deletedSchema } from "../classification-contract";
import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { type Voice, voiceSchema } from "../providers/contract";
import { emptyVoice } from "../providers/list";
import {
	savedVoiceLinksInputSchema,
	savedVoiceRemoveInputSchema,
	savedVoiceSaveInputSchema,
	savedVoiceSchema,
	type SavedVoice,
} from "../saved-voice-contract";
import { dbCode, found, stored } from "../voice-cache";

type Db = Context["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const PREFIX = "[savedVoice]";
// 연결 중 다른 탭에서 그 채널·분류가 지워지면 외래 키 위반이다. 없는 항목과 같게 NOT_FOUND(스펙 5절)
const goneLink = (error: unknown) =>
	dbCode(error) === "23503" ? new ORPCError("NOT_FOUND") : null;

type Row = typeof savedVoice.$inferSelect;

// 저장한 정보가 계약과 어긋나면(계약이 바뀐 옛 행) 이름 자리에 성우 id를 보인다. 다음 확인에서 새 값으로 바뀐다(스펙 3절)
function voiceOf(row: Pick<Row, "provider" | "source" | "voiceId" | "voice">): Voice {
	return (
		voiceSchema.safeParse(row.voice).data ?? {
			...emptyVoice(row.provider, row.source),
			voiceId: row.voiceId,
			name: row.voiceId,
		}
	);
}

// 담은 성우와 연결 id(내 성우의 연결만). ponytail: 연결은 성우 id 목록으로 한 번에 받아 JS로 나눈다(담은 성우는 수십 명)
async function listOf(db: Db | Tx, ownerId: string, id?: string): Promise<SavedVoice[]> {
	const rows = await db
		.select()
		.from(savedVoice)
		.where(
			id
				? and(eq(savedVoice.ownerId, ownerId), eq(savedVoice.id, id))
				: eq(savedVoice.ownerId, ownerId),
		)
		.orderBy(desc(savedVoice.savedAt));
	const ids = rows.map((row) => row.id);
	if (ids.length === 0) return [];
	const [channels, classes] = await Promise.all([
		db
			.select()
			.from(savedVoiceChannel)
			.where(inArray(savedVoiceChannel.savedVoiceId, ids)),
		db
			.select()
			.from(savedVoiceClassification)
			.where(inArray(savedVoiceClassification.savedVoiceId, ids)),
	]);
	return rows.map((row) => ({
		id: row.id,
		voice: voiceOf(row),
		favorite: row.favorite,
		frequent: row.frequent,
		memo: row.memo,
		unavailable: row.unavailable,
		channelIds: channels
			.filter((link) => link.savedVoiceId === row.id)
			.map((link) => link.channelId),
		classificationIds: classes
			.filter((link) => link.savedVoiceId === row.id)
			.map((link) => link.classificationId),
	}));
}

// 담기: 공급자 + 성우 id로 upsert(조회 후 삽입이 아니라 유니크 제약이 막는다, data-upsert).
// 새로 담기면 지금 확인한 것으로 본다(살아 있는 목록에서 담았다). 이미 있으면 정보·출처와 준 필드만 바꾸고 이용 가능 표시는 확인에 맡긴다
async function upsert(
	db: Db | Tx,
	ownerId: string,
	voice: Voice,
	patch: { favorite?: boolean; frequent?: boolean; memo?: string | null },
): Promise<string> {
	const [row] = await db
		.insert(savedVoice)
		.values({
			provider: voice.provider,
			voiceId: voice.voiceId,
			source: voice.source,
			voice,
			...patch,
			checkedAt: new Date(),
			ownerId,
		})
		.onConflictDoUpdate({
			target: [savedVoice.ownerId, savedVoice.provider, savedVoice.voiceId],
			set: { voice, source: voice.source, ...patch },
		})
		.returning({ id: savedVoice.id });
	return found(row).id;
}

// 성우 보관함(T7). 소유자는 context.ownerId뿐이고 모든 조회·변경과 연결 대상 선택에 owner_id 조건을 건다
export const savedVoiceRouter = {
	savedVoiceList: protectedProcedure
		.output(z.array(savedVoiceSchema))
		.handler(({ context: { db, ownerId } }) =>
			stored(PREFIX, "목록", () => listOf(db, ownerId)),
		),
	savedVoiceSave: protectedProcedure
		.input(savedVoiceSaveInputSchema)
		.output(savedVoiceSchema)
		.handler(({ input: { voice, ...patch }, context: { db, ownerId } }) =>
			stored(PREFIX, "담기", async () => {
				const id = await upsert(db, ownerId, voice, patch);
				return found((await listOf(db, ownerId, id))[0]);
			}),
		),
	savedVoiceLinks: protectedProcedure
		.input(savedVoiceLinksInputSchema)
		.output(savedVoiceSchema)
		.handler(
			({ input: { voice, channelIds, classificationIds }, context: { db, ownerId } }) =>
				stored(
					PREFIX,
					"연결",
					() =>
						db.transaction(async (tx) => {
							const id = await upsert(tx, ownerId, voice, {});
							// 붙일 항목은 내 것만 고른다. 고른 수가 준 수와 다르면(없거나 남의 것) 아무것도 바꾸지 않는다(트랜잭션 되돌림)
							const [mineChannels, mineClasses] = await Promise.all([
								channelIds.length === 0
									? []
									: tx
											.select({ id: channel.id })
											.from(channel)
											.where(and(eq(channel.ownerId, ownerId), inArray(channel.id, channelIds))),
								classificationIds.length === 0
									? []
									: tx
											.select({ id: classification.id })
											.from(classification)
											.where(
												and(
													eq(classification.ownerId, ownerId),
													inArray(classification.id, classificationIds),
												),
											),
							]);
							if (
								mineChannels.length !== channelIds.length ||
								mineClasses.length !== classificationIds.length
							)
								throw new ORPCError("NOT_FOUND");
							await tx
								.delete(savedVoiceChannel)
								.where(eq(savedVoiceChannel.savedVoiceId, id));
							await tx
								.delete(savedVoiceClassification)
								.where(eq(savedVoiceClassification.savedVoiceId, id));
							if (mineChannels.length > 0)
								await tx.insert(savedVoiceChannel).values(
									mineChannels.map((item) => ({ savedVoiceId: id, channelId: item.id })),
								);
							if (mineClasses.length > 0)
								await tx.insert(savedVoiceClassification).values(
									mineClasses.map((item) => ({
										savedVoiceId: id,
										classificationId: item.id,
									})),
								);
							return found((await listOf(tx, ownerId, id))[0]);
						}),
					goneLink,
				),
		),
	savedVoiceRemove: protectedProcedure
		.input(savedVoiceRemoveInputSchema)
		.output(deletedSchema)
		.handler(({ input: { id }, context: { db, ownerId } }) =>
			stored(PREFIX, "빼기", async () => {
				const [row] = await db
					.delete(savedVoice)
					.where(and(eq(savedVoice.id, id), eq(savedVoice.ownerId, ownerId)))
					.returning({ id: savedVoice.id });
				found(row);
				return { deleted: true as const };
			}),
		),
};
```
`routers/index.ts`에 `import { savedVoiceRouter } from "./saved-voice";`와 `...savedVoiceRouter,`를 더한다. `Tx` 타입이 위 꼴로 추론되지 않으면 drizzle 설치본의 트랜잭션 타입(`PgTransaction`)을 쓴다. `Promise.all` 안 삼항의 `[]`가 타입을 좁히지 못하면 `Promise.resolve([] as { id: string }[])`로 쓴다.

- [ ] **Step 11: 통과를 확인한다**

Run: `(source .superpowers/sdd/T07-voice-library-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test) && pnpm --filter @tts-pilot-app/api check-types && pnpm exec biome check --write packages/api/src packages/db/src/schema`
Expected:
- 새 테스트 PASS: 계약 4, 라우터 10 = DB 9 + DB 없이 1, 격리 4 = DB 3 + 소유자 없음 1(`savedVoiceCheck` 줄 제외), `voiceCount` 1
- 기존 테스트 모두 PASS(skipped 0)
- 타입 0 오류
- 장부에 tree SHA

---

### Task 4: 이용 가능 확인 `savedVoiceCheck`

**Files:**
- Modify: `packages/api/src/routers/saved-voice.ts`, `saved-voice.isolation.test.ts`(소유자 없음 목록에 한 줄)
- Test: `packages/api/src/routers/saved-voice-check.test.ts`

**Interfaces:**
- Consumes: Task 2 `ProviderClient.getVoice`, Task 3 표·`listOf`·`stored`, `voice-cache.ts`의 `cooldownOf`·`recordCooldown`·`guard`, `ProviderErrorData`
- Produces: `savedVoiceCheck(): SavedVoice[]`(확인을 마친 뒤의 목록, `savedVoiceList`와 같다). 화면(Task 9)이 `setQueryData`로 바로 쓴다(계획 리뷰 P2).

규칙(스펙 2절·3절, '스펙과 다른 점' 2~5):
- 확인 대상은 이 소유자의 행 가운데 `checked_at`이 없거나 24시간이 지난 것이다.
  - ElevenLabs 공개 출처(`provider = 'elevenlabs' and source = 'public'`)는 뺀다.
  - 가장 오래 확인하지 않은 순(`checked_at nulls first`)으로 40개까지 고른다. 남은 행은 다음에 열 때 확인한다.
- 공급자마다 따로, 동시 2건까지 돈다. 한 건의 시간 제한 10초는 `runList`가 맡는다.
- 다음 경우에는 그 공급자를 건너뛴다.
  - 키가 없다(클라이언트 없음, `getVoice` 없음).
  - 대기 시각 전이다.
  - 대기 확인 DB가 실패했다(`guard`가 `undefined`).
- `getVoice` 결과에 따라 이렇게 한다. 두 경우 모두 `checked_at = now`다.
  - `null`: `unavailable = true`.
  - `Voice`: 그 값으로 `voice`를 바꾸고 `unavailable = false`.
  - ElevenLabs 계정 성우는 저장한 행 샘플의 언어를 `preferred`로 넘긴다(E14).
- 공급자 오류는 이렇게 다룬다.
  - 429(`reason === "rate_limit"`): 대기 시각을 적고 그 공급자의 남은 확인을 멈춘다. 대기 시각은 `retryAt`이고, 없으면(Typecast SDK) 60초 뒤다(E10).
  - 그 밖(5xx·타임아웃·인증): 그 행을 바꾸지 않는다(다음에 다시).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// packages/api/src/routers/saved-voice-check.test.ts
import { createRouterClient } from "@orpc/server";
import { providerCooldown } from "@tts-pilot-app/db/schema/provider-cache";
import { savedVoice } from "@tts-pilot-app/db/schema/saved-voice";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers";
import type { Voice } from "../providers/contract";
import { providerError } from "../providers/errors";
import { emptyVoice } from "../providers/list";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `check-${Date.now()}`;
const OTHER = `check-other-${Date.now()}`;
const voiceOf = (provider: Voice["provider"], source: Voice["source"], voiceId: string): Voice => ({
	...emptyVoice(provider, source),
	voiceId,
	name: voiceId,
});
const tc = (id: string) => voiceOf("typecast", "public", id);
const fish = (id: string) => voiceOf("fish_audio", "public", id);
const DAY = 24 * 60 * 60 * 1000;

function setup(providers: Providers) {
	return (ownerId: string) =>
		createRouterClient(appRouter, {
			context: { db, ownerId, providers } as Context,
		});
}
type Client = ReturnType<ReturnType<typeof setup>>;
// 담은 뒤 확인 시각을 하루 전(또는 준 시각)으로 돌려 확인 대상으로 만든다
async function saveStale(as: Client, voice: Voice, checkedAt = new Date(Date.now() - DAY - 1000)) {
	const item = await as.savedVoiceSave({ voice });
	await db.update(savedVoice).set({ checkedAt }).where(eq(savedVoice.id, item.id));
	return item;
}
const byId = (list: { voice: Voice }[], id: string) =>
	list.find((item) => item.voice.voiceId === id);

describe.skipIf(!url)("이용 가능 확인(T7 스펙 2·3절)", () => {
	beforeEach(async () => {
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
	});
	afterAll(async () => {
		await db.delete(savedVoice);
		await db.delete(providerCooldown);
		await db.$client.end();
	});

	it("없음이면 이용 불가, 있으면 정보를 바꾸고 이용 가능으로 되돌리며 목록을 돌려준다", async () => {
		const getVoice = vi.fn(async (_source: string, id: string) =>
			id === "gone" ? null : { ...tc(id), name: `${id}-새` },
		);
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("gone"));
		const back = await saveStale(as, tc("back"));
		await db.update(savedVoice).set({ unavailable: true }).where(eq(savedVoice.id, back.id));
		const list = await as.savedVoiceCheck();
		expect(list).toEqual(await as.savedVoiceList());
		expect(byId(list, "gone")).toMatchObject({ unavailable: true, voice: { name: "gone" } });
		expect(byId(list, "back")).toMatchObject({ unavailable: false, voice: { name: "back-새" } });
	});

	it("24시간이 안 된 행과 ElevenLabs 공개 성우는 부르지 않는다", async () => {
		const getVoice = vi.fn(async () => null);
		const as = setup({
			typecast: { checkStatus: vi.fn(), getVoice },
			elevenlabs: { checkStatus: vi.fn(), getVoice },
		})(OWNER);
		await as.savedVoiceSave({ voice: tc("fresh") });
		await saveStale(as, voiceOf("elevenlabs", "public", "lib1"));
		await as.savedVoiceCheck();
		expect(getVoice).not.toHaveBeenCalled();
	});

	it("ElevenLabs 계정 성우는 담을 때의 샘플 언어를 preferred로 넘긴다", async () => {
		const getVoice = vi.fn(async () => null);
		const as = setup({ elevenlabs: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, {
			...voiceOf("elevenlabs", "account", "el1"),
			previewUrl: "https://storage.googleapis.com/ko.mp3",
			samples: [{ language: "ko", title: null, url: "https://storage.googleapis.com/ko.mp3" }],
		});
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledWith("account", "el1", "ko");
	});

	it("5xx·타임아웃은 행을 바꾸지 않고 다음에 다시 확인한다", async () => {
		const getVoice = vi.fn(async () => {
			throw providerError("typecast", "provider_error");
		});
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("a"));
		expect((await as.savedVoiceCheck())[0]?.unavailable).toBe(false);
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledTimes(2);
	});

	it("429면 대기 시각을 적고 그 공급자 나머지는 부르지 않으며, 다른 공급자는 확인한다", async () => {
		const retryAt = new Date(Date.now() + 60_000).toISOString();
		const tcGet = vi.fn(async () => {
			throw providerError("typecast", "rate_limit", retryAt);
		});
		const fishGet = vi.fn(async () => null);
		const as = setup({
			typecast: { checkStatus: vi.fn(), getVoice: tcGet },
			fish_audio: { checkStatus: vi.fn(), getVoice: fishGet },
		})(OWNER);
		for (const id of ["t1", "t2", "t3", "t4"]) await saveStale(as, tc(id));
		await saveStale(as, fish("f1"));
		const list = await as.savedVoiceCheck();
		expect(byId(list, "f1")?.unavailable).toBe(true);
		// 동시 2건이라 429를 받기 전에 둘까지 나갈 수 있다. 나머지는 멈춘다
		expect(tcGet.mock.calls.length).toBeLessThanOrEqual(2);
		const [cool] = await db.select().from(providerCooldown);
		expect(cool?.provider).toBe("typecast");
		tcGet.mockClear();
		await as.savedVoiceCheck();
		expect(tcGet).not.toHaveBeenCalled();
	});

	it("429에 retryAt이 없어도(Typecast SDK) 60초 대기 시각을 적는다", async () => {
		const tcGet = vi.fn(async () => {
			throw providerError("typecast", "rate_limit");
		});
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice: tcGet } })(OWNER);
		await saveStale(as, tc("t1"));
		const before = Date.now();
		await as.savedVoiceCheck();
		const [cool] = await db.select().from(providerCooldown);
		expect(cool?.until.getTime()).toBeGreaterThanOrEqual(before + 59_000);
	});

	it("한 번에 40명까지, 가장 오래 확인하지 않은 순", async () => {
		const getVoice = vi.fn(async (_s: string, id: string) => tc(id));
		const as = setup({ typecast: { checkStatus: vi.fn(), getVoice } })(OWNER);
		await saveStale(as, tc("oldest"), new Date(Date.now() - 10 * DAY));
		for (let i = 0; i < 40; i++) await saveStale(as, tc(`v${i}`));
		await as.savedVoiceCheck();
		expect(getVoice).toHaveBeenCalledTimes(40);
		expect(getVoice.mock.calls.map((call) => call[1])).toContain("oldest");
	});

	it("키가 없는 공급자는 건너뛰고, 다른 소유자의 행은 확인하지 않는다", async () => {
		const getVoice = vi.fn(async () => null);
		const make = setup({ typecast: { checkStatus: vi.fn(), getVoice } });
		await saveStale(make(OTHER), tc("other"));
		await saveStale(make(OWNER), fish("nokey"));
		await make(OWNER).savedVoiceCheck();
		expect(getVoice).not.toHaveBeenCalled();
	});
});
```
`saved-voice.isolation.test.ts` 소유자 없음 목록에 `() => nobody.savedVoiceCheck(),`를 되살린다.

- [ ] **Step 2: 실패를 확인한다**

Run: `(source .superpowers/sdd/T07-voice-library-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/saved-voice)`
Expected: FAIL — `savedVoiceCheck`가 없다.

- [ ] **Step 3: 구현한다**

`saved-voice.ts`에 import를 더한다:
- drizzle-orm: `asc`, `isNull`, `lt`, `not`, `or`, `sql`, 타입 `SQL`
- `providerIdSchema`, 타입 `ProviderClient`·`ProviderErrorData`
- `voice-cache.ts`: `cooldownOf`·`recordCooldown`·`guard`

```ts
const DAY_MS = 24 * 60 * 60 * 1000;
// 공급자마다 동시 2건, 한 번에 40명(스펙 3절, 계획 리뷰 E8). 한 건 10초는 runList가 끊는다.
// 최악: 한 공급자에 40명이 모두 시간 초과면 40 ÷ 2 × 10초 = 200초. 화면은 저장한 정보로 먼저 보여 기다리지 않는다
const CHECK_WORKERS = 2;
const CHECK_LIMIT = 40;
// Typecast SDK는 429의 Retry-After를 주지 않는다. 그때도 바로 다시 부르지 않게 1분을 적는다(계획 리뷰 E10).
// ponytail: 고정 1분. 공급자가 더 길게 막으면 다음 열 때 또 429를 받고 다시 1분이다
const DEFAULT_COOLDOWN_MS = 60_000;

type Stale = Pick<Row, "id" | "provider" | "source" | "voiceId" | "voice">;

// 행 샘플의 언어(ElevenLabs가 담을 때 고른 언어, 계획 리뷰 E14)
function sampleLanguage(voice: Voice): string | null {
	return voice.samples.find((sample) => sample.url === voice.previewUrl)?.language ?? null;
}

// 한 공급자의 확인. 429면 대기 시각을 적고 멈춘다. 다른 실패는 그 행을 그대로 둔다.
// ponytail: 실패한 행은 다음에 화면을 열 때 다시 부른다. 장애가 길어 자주 보이면 실패 때 checked_at을 1시간 뒤로 미룬다(계획 리뷰 E17)
async function checkProvider(
	db: Db,
	ownerId: string,
	provider: Voice["provider"],
	client: ProviderClient | undefined,
	rows: Stale[],
): Promise<void> {
	const getVoice = client?.getVoice;
	if (!getVoice || rows.length === 0) return;
	const blocked = await guard("대기 확인", () => cooldownOf(db, provider, new Date()), PREFIX);
	if (blocked !== null) return;
	const queue = [...rows];
	let stopped = false;
	// 함수 선언이 아니라 화살표다: 위 getVoice 좁히기가 안에서도 남는다(계획 리뷰 E5)
	const worker = async () => {
		for (let row = queue.shift(); row && !stopped; row = queue.shift()) {
			const kept = voiceOf(row);
			let fresh: Voice | null;
			try {
				fresh = await getVoice(row.source, row.voiceId, sampleLanguage(kept));
			} catch (error) {
				const data = (error instanceof ORPCError ? error.data : undefined) as
					| Partial<ProviderErrorData>
					| undefined;
				if (data?.reason === "rate_limit") {
					stopped = true;
					const until = data.retryAt ? new Date(data.retryAt) : new Date(Date.now() + DEFAULT_COOLDOWN_MS);
					await guard("대기 기록", () => recordCooldown(db, provider, until), PREFIX);
				}
				continue;
			}
			await stored(PREFIX, "확인 저장", () =>
				db
					.update(savedVoice)
					.set(
						fresh
							? { voice: fresh, unavailable: false, checkedAt: new Date() }
							: { unavailable: true, checkedAt: new Date() },
					)
					.where(and(eq(savedVoice.id, row.id), eq(savedVoice.ownerId, ownerId))),
			);
		}
	};
	await Promise.all(Array.from({ length: CHECK_WORKERS }, worker));
}
```

라우터 객체에:
```ts
	savedVoiceCheck: protectedProcedure
		.output(z.array(savedVoiceSchema))
		.handler(async ({ context: { db, ownerId, providers } }) => {
			const rows = await stored(PREFIX, "확인 대상", () =>
				db
					.select({
						id: savedVoice.id,
						provider: savedVoice.provider,
						source: savedVoice.source,
						voiceId: savedVoice.voiceId,
						voice: savedVoice.voice,
					})
					.from(savedVoice)
					.where(
						and(
							eq(savedVoice.ownerId, ownerId),
							or(
								isNull(savedVoice.checkedAt),
								lt(savedVoice.checkedAt, new Date(Date.now() - DAY_MS)),
							),
							// ElevenLabs 공개 라이브러리 성우는 한 명 조회 방법이 없다('스펙과 다른 점' 2)
							not(
								and(
									eq(savedVoice.provider, "elevenlabs"),
									eq(savedVoice.source, "public"),
								) as SQL,
							),
						),
					)
					.orderBy(sql`${savedVoice.checkedAt} asc nulls first`)
					.limit(CHECK_LIMIT),
			);
			// 공급자끼리는 서로 기다리지 않는다(한 공급자의 장애가 다른 공급자를 막지 않는다, REQ-02)
			await Promise.all(
				providerIdSchema.options.map((provider) =>
					checkProvider(
						db,
						ownerId,
						provider,
						providers?.[provider],
						rows.filter((row) => row.provider === provider),
					),
				),
			);
			return stored(PREFIX, "목록", () => listOf(db, ownerId));
		}),
```
`not(and(...) as SQL)`의 타입과 SQL은 계획 리뷰에서 확인했다(`not ((provider = $ and source = $))`).

- [ ] **Step 4: 통과를 확인한다**

Run: `(source .superpowers/sdd/T07-voice-library-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test) && pnpm --filter @tts-pilot-app/api check-types && pnpm exec biome check --write packages/api/src`
Expected:
- 확인 8건과 격리 소유자 없음(5개) PASS
- 전체 PASS(skipped 0), 타입 0
- 장부에 tree SHA. 이어서 대조표 13·14·15행과 security 행(코디네이터).

---

### Task 5: 화면 순수 함수

**Files:**
- Create: `apps/web/src/lib/saved-voice-view.ts`
- Test: `apps/web/src/lib/saved-voice-view.test.ts`

**Interfaces:**
- Consumes: 타입 `Voice`·`ProviderId`(`@tts-pilot-app/api/providers/contract`), `SavedVoice`(`@tts-pilot-app/api/saved-voice-contract` 타입만), `cleanText`(`@tts-pilot-app/api/classification-rules`), `byName`·`GROUP_TEXT`·`Group`(`./classes-view`)
- Produces:
  - `savedKey(voice: Pick<Voice, "provider" | "voiceId">): string`
  - `LibraryView = "all" | "favorite" | "frequent"`, `LibraryFilters = { q: string; view: LibraryView; provider: ProviderId | null; channel: string[]; category: string[]; type: string[] }`, `EMPTY_LIBRARY_FILTERS`
  - `filtersFromQuery(params: URLSearchParams): LibraryFilters`, `queryFromFilters(filters: LibraryFilters): string`, `hasLibraryFilters(filters): boolean`
  - `knownOnly(filters, known: ReadonlySet<string>): LibraryFilters`(지워진 분류 id를 버린다)
  - `filterSaved<T extends SavedLike>(items: readonly T[], filters): T[]`
  - `chipGroups(item, channels, classes): { group: Group; items: { id: string; name: string }[] }[]`
  - `sameName<T extends { name: string }>(items: readonly T[], name: string): T | undefined`, `foldName(text): string`
  - `LIBRARY_TEXT`, `voiceCountText(n): string | null`, `linkedNote(n, group): string`, `removeQuestion(name)`, `removedMessage(name)`, `linkMessage(name, group, on)`, `countLine(total, shown): string`
- Modify: `apps/web/src/lib/voice-filter.ts`의 `anyOf`를 export한다(계획 리뷰 P7)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// apps/web/src/lib/saved-voice-view.test.ts
import { describe, expect, it } from "vitest";

import {
	chipGroups,
	countLine,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	filtersFromQuery,
	knownOnly,
	linkedNote,
	linkMessage,
	queryFromFilters,
	sameName,
	savedKey,
	voiceCountText,
} from "./saved-voice-view";

const item = (
	voiceId: string,
	extra: Partial<{
		provider: "typecast" | "elevenlabs" | "fish_audio";
		name: string;
		englishName: string | null;
		favorite: boolean;
		frequent: boolean;
		memo: string | null;
		channelIds: string[];
		classificationIds: string[];
	}> = {},
) => ({
	voice: {
		provider: extra.provider ?? "typecast",
		voiceId,
		name: extra.name ?? voiceId,
		englishName: extra.englishName ?? null,
	},
	favorite: extra.favorite ?? false,
	frequent: extra.frequent ?? false,
	memo: extra.memo ?? null,
	channelIds: extra.channelIds ?? [],
	classificationIds: extra.classificationIds ?? [],
});

describe("savedKey", () => {
	it("출처를 빼고 공급자 + 성우 id다(공개·계정에서 담아도 같은 성우)", () => {
		expect(savedKey({ provider: "elevenlabs", voiceId: "v1" })).toBe("elevenlabs:v1");
	});
});

describe("주소 쿼리 ↔ 필터", () => {
	it("왕복하고 기본값은 쓰지 않는다", () => {
		const f = {
			...EMPTY_LIBRARY_FILTERS,
			q: "민지",
			view: "favorite" as const,
			provider: "fish_audio" as const,
			category: ["c1", "c2"],
		};
		const q = queryFromFilters(f);
		expect(q).toBe("q=%EB%AF%BC%EC%A7%80&view=favorite&provider=fish_audio&category=c1&category=c2");
		expect(filtersFromQuery(new URLSearchParams(q))).toEqual(f);
		expect(queryFromFilters(EMPTY_LIBRARY_FILTERS)).toBe("");
	});
	it("모르는 보기·공급자는 기본값, 같은 id 중복은 하나로", () => {
		expect(
			filtersFromQuery(new URLSearchParams("view=x&provider=y&channel=a&channel=a")),
		).toEqual({ ...EMPTY_LIBRARY_FILTERS, channel: ["a"] });
	});
	it("knownOnly는 지워진 분류 id를 버린다", () => {
		expect(
			knownOnly({ ...EMPTY_LIBRARY_FILTERS, channel: ["a", "gone"] }, new Set(["a"])).channel,
		).toEqual(["a"]);
	});
});

describe("filterSaved(그룹 안 OR, 그룹끼리 AND)", () => {
	const items = [
		item("a", { name: "민지", favorite: true, channelIds: ["ch1"], classificationIds: ["cat1"] }),
		item("b", { name: "준호", frequent: true, channelIds: ["ch1"], classificationIds: ["cat2"] }),
		item("c", { name: "Alice", provider: "fish_audio", memo: "광고용", classificationIds: ["cat1", "ty1"] }),
	];
	const ids = (f: Partial<typeof EMPTY_LIBRARY_FILTERS>) =>
		filterSaved(items, { ...EMPTY_LIBRARY_FILTERS, ...f }).map((i) => i.voice.voiceId);

	it("조건이 없으면 전부, 순서는 그대로", () => {
		expect(ids({})).toEqual(["a", "b", "c"]);
	});
	it("보기·공급자", () => {
		expect(ids({ view: "favorite" })).toEqual(["a"]);
		expect(ids({ view: "frequent" })).toEqual(["b"]);
		expect(ids({ provider: "fish_audio" })).toEqual(["c"]);
	});
	it("같은 그룹 안은 하나라도 맞으면, 그룹끼리는 모두 맞아야", () => {
		expect(ids({ category: ["cat1", "cat2"] })).toEqual(["a", "b", "c"]);
		expect(ids({ category: ["cat1"], channel: ["ch1"] })).toEqual(["a"]);
		expect(ids({ category: ["cat1"], type: ["ty1"] })).toEqual(["c"]);
	});
	it("검색은 이름·영문 이름·메모, 대소문자와 NFD를 가리지 않는다", () => {
		expect(ids({ q: "alice" })).toEqual(["c"]);
		expect(ids({ q: "광고" })).toEqual(["c"]);
		expect(ids({ q: "민지".normalize("NFD") })).toEqual(["a"]);
		expect(ids({ q: "  " })).toEqual(["a", "b", "c"]);
	});
});

describe("칩·이름", () => {
	it("그룹 순서(채널→카테고리→타입), 그룹 안 이름순, 모르는 id는 뺀다", () => {
		const groups = chipGroups(
			{ channelIds: ["c2", "c1"], classificationIds: ["t1", "k1", "gone"] },
			[
				{ id: "c1", name: "주말" },
				{ id: "c2", name: "경제" },
			],
			[
				{ id: "k1", kind: "category", name: "뉴스" },
				{ id: "t1", kind: "type", name: "차분함" },
			],
		);
		expect(groups.map((g) => [g.group, g.items.map((i) => i.name)])).toEqual([
			["channel", ["경제", "주말"]],
			["category", ["뉴스"]],
			["type", ["차분함"]],
		]);
	});
	it("sameName은 서버 중복 규칙(정리·대소문자 무시)으로 찾는다", () => {
		const list = [{ name: "News" }, { name: "경제 한 입" }];
		expect(sameName(list, " news ")).toBe(list[0]);
		expect(sameName(list, "경제　한  입")).toBe(list[1]);
		expect(sameName(list, "경제")).toBeUndefined();
	});
	it("연결 수 문구", () => {
		expect(voiceCountText(0)).toBeNull();
		expect(voiceCountText(3)).toBe("성우 3명");
		expect(linkedNote(0, "category")).toBe("");
		expect(linkedNote(2, "category")).toBe(
			" 연결된 성우 2명은 보관함에 그대로 남고, 이 카테고리 연결만 풀려요.",
		);
	});
	it("상태 줄과 알림 문구", () => {
		expect(countLine(40, 40)).toBe("담은 성우 40명");
		expect(countLine(40, 12)).toBe("담은 성우 40명 중 12명");
		expect(linkMessage("뉴스", "category", true)).toBe("‘뉴스’ 카테고리를 붙였어요.");
		expect(linkMessage("경제", "channel", false)).toBe("‘경제’ 채널을 뗐어요.");
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter web test src/lib/saved-voice-view.test.ts`
Expected: FAIL — `./saved-voice-view`를 찾지 못함.

- [ ] **Step 3: 구현한다**

```ts
// apps/web/src/lib/saved-voice-view.ts
import { cleanText } from "@tts-pilot-app/api/classification-rules";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";

import { byName, GROUP_TEXT, type Group } from "./classes-view";
import { anyOf } from "./voice-filter";

// 보관함의 같은 성우: 공급자 + 성우 id(REQ-04). 목록 행 키 voiceKey는 출처까지 넣으므로 따로 둔다
export const savedKey = (voice: Pick<Voice, "provider" | "voiceId">) =>
	`${voice.provider}:${voice.voiceId}`;

export type LibraryView = "all" | "favorite" | "frequent";
export type LibraryFilters = {
	q: string;
	view: LibraryView;
	provider: ProviderId | null;
	channel: string[];
	category: string[];
	type: string[];
};
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
	q: "",
	view: "all",
	provider: null,
	channel: [],
	category: [],
	type: [],
};

const VIEWS: readonly LibraryView[] = ["all", "favorite", "frequent"];
const PROVIDERS: readonly ProviderId[] = ["typecast", "elevenlabs", "fish_audio"];
const GROUP_KEYS = ["channel", "category", "type"] as const;

// 필터는 주소 쿼리가 정본이다('성우 N명' 링크가 이 주소로 온다, 스펙 2절). 모르는 값은 기본값이다
export function filtersFromQuery(params: URLSearchParams): LibraryFilters {
	const view = params.get("view");
	const provider = params.get("provider");
	const ids = (key: string) => [...new Set(params.getAll(key).filter(Boolean))];
	return {
		q: params.get("q") ?? "",
		view: VIEWS.find((v) => v === view) ?? "all",
		provider: PROVIDERS.find((p) => p === provider) ?? null,
		channel: ids("channel"),
		category: ids("category"),
		type: ids("type"),
	};
}

export function queryFromFilters(filters: LibraryFilters): string {
	const params = new URLSearchParams();
	if (filters.q) params.set("q", filters.q);
	if (filters.view !== "all") params.set("view", filters.view);
	if (filters.provider) params.set("provider", filters.provider);
	for (const key of GROUP_KEYS)
		for (const id of filters[key]) params.append(key, id);
	return params.toString();
}

export const hasLibraryFilters = (filters: LibraryFilters) =>
	queryFromFilters(filters) !== "";

// 지워진 채널·분류의 id(옛 링크, 다른 탭에서 지움)는 버린다. 버리지 않으면 보이지 않는 조건이 목록을 비운다
export function knownOnly(
	filters: LibraryFilters,
	known: ReadonlySet<string>,
): LibraryFilters {
	const keep = (ids: string[]) => ids.filter((id) => known.has(id));
	return {
		...filters,
		channel: keep(filters.channel),
		category: keep(filters.category),
		type: keep(filters.type),
	};
}

type SavedLike = {
	voice: Pick<Voice, "provider" | "voiceId" | "name" | "englishName">;
	favorite: boolean;
	frequent: boolean;
	memo: string | null;
	channelIds: readonly string[];
	classificationIds: readonly string[];
};

// 이름 비교·검색: 서버 중복 규칙(cleanText 정리 + 대소문자 무시, T6)과 같게 접는다. 분류 붙이기 검색도 이것을 쓴다
export const foldName = (text: string) => cleanText(text).toLocaleLowerCase("ko");

// 같은 그룹 안은 하나라도 맞으면(OR), 그룹끼리는 모두 맞아야(AND). 카테고리·타입 id는 uuid라 classificationIds 하나에서 함께 찾는다
export function filterSaved<T extends SavedLike>(
	items: readonly T[],
	filters: LibraryFilters,
): T[] {
	const q = foldName(filters.q);
	return items.filter(
		(item) =>
			(filters.view === "all" || item[filters.view]) &&
			(filters.provider === null || item.voice.provider === filters.provider) &&
			anyOf(filters.channel, item.channelIds) &&
			anyOf(filters.category, item.classificationIds) &&
			anyOf(filters.type, item.classificationIds) &&
			(q === "" ||
				[item.voice.name, item.voice.englishName, item.memo].some(
					(text) => text !== null && foldName(text).includes(q),
				)),
	);
}

type Named = { id: string; name: string };

// 패널 칩: 채널 → 카테고리 → 타입, 그룹 안은 T6 이름순. 모르는 id(목록을 받기 전, 다른 탭에서 지움)는 뺀다
export function chipGroups(
	item: Pick<SavedLike, "channelIds" | "classificationIds">,
	channels: readonly Named[],
	classes: readonly (Named & { kind: "category" | "type" })[],
): { group: Group; items: Named[] }[] {
	const pick = (list: readonly Named[], ids: readonly string[]) =>
		byName(list.filter((entry) => ids.includes(entry.id)));
	return [
		{ group: "channel" as const, items: pick(channels, item.channelIds) },
		{
			group: "category" as const,
			items: pick(classes.filter((c) => c.kind === "category"), item.classificationIds),
		},
		{
			group: "type" as const,
			items: pick(classes.filter((c) => c.kind === "type"), item.classificationIds),
		},
	].filter((group) => group.items.length > 0);
}

// 분류 붙이기의 '이미 있는 이름': 서버 중복 규칙(cleanText 정리 + 대소문자 무시, T6)과 같게 찾는다
export function sameName<T extends { name: string }>(
	items: readonly T[],
	name: string,
): T | undefined {
	const target = foldName(name);
	return items.find((entry) => foldName(entry.name) === target);
}

// 문구는 브리프(17행 B5)가 정본이다. 한 줄 상태는 마침표 없이, 문장 알림은 마침표로(T6 규칙)
export const LIBRARY_TEXT = {
	loopback: "이 주소에서는 성우 보관함을 쓸 수 없어요",
	loading: "성우 보관함을 불러오고 있어요",
	empty: "아직 담은 성우가 없어요",
	toCasting: "성우 캐스팅에서 찾기",
	listFailed: "성우 보관함을 불러오지 못했어요",
	classesFailed: "채널·분류 목록을 불러오지 못했어요",
	checking: "이용 가능 여부를 확인하고 있어요",
	unavailable: "현재 이용 불가",
	unavailableNotice:
		"공급자 목록에서 찾을 수 없어요. 저장해 둔 정보로 보여요. 메모와 분류는 그대로 남아 있어요.",
	notChecked: "공개 라이브러리 성우는 이용 가능 여부를 확인하지 않아요",
	frequent: "자주 사용",
	saving: "저장하는 중이에요",
	memoSaved: "메모를 저장했어요.",
	memoUnsaved: "저장하지 않은 변경이 있어요",
	removeDetail: "즐겨찾기·자주 사용·메모·분류 연결도 함께 지워져요.",
	removing: "빼는 중이에요",
	removeFailed: "빼지 못했어요. 잠시 뒤 다시 해 주세요.",
	pickerPlaceholder: "이름으로 찾거나 새로 만들기",
	pickerFirst: "이름을 쓰면 바로 만들어 붙일 수 있어요",
	noMatchName: "일치하는 이름이 없어요",
} as const;

export const voiceCountText = (count: number) =>
	count > 0 ? `성우 ${count}명` : null;

// 채널·분류 삭제 확인 창 설명 뒤에 붙인다(앞 문장과 띄어 쓴다). 사용자 걱정은 "성우가 지워지나"다(계획 리뷰 D18)
export const linkedNote = (count: number, group: Group) =>
	count > 0
		? ` 연결된 성우 ${count}명은 보관함에 그대로 남고, 이 ${GROUP_TEXT[group].label} 연결만 풀려요.`
		: "";

// 이름 뒤 조사는 받침을 몰라 붙이지 않는다('성우'를 사이에 둔다)
export const removeQuestion = (name: string) =>
	`‘${name}’ 성우를 보관함에서 뺄까요?`;
export const removedMessage = (name: string) =>
	`‘${name}’ 성우를 보관함에서 뺐어요.`;

// 칩 붙임·뗌 알림(화면 밖 role=status, 계획 리뷰 D5). 그룹 이름 뒤 조사는 GROUP_TEXT가 받침에 맞춘다
export const linkMessage = (name: string, group: Group, on: boolean) =>
	`‘${name}’ ${GROUP_TEXT[group].object} ${on ? "붙였어요" : "뗐어요"}.`;

// 상태 줄(캐스팅과 같은 모양, 계획 리뷰 D19). 조건이 걸리면 전체 수를 함께 보인다
export const countLine = (total: number, shown: number) =>
	shown === total ? `담은 성우 ${total}명` : `담은 성우 ${total}명 중 ${shown}명`;
```
`voice-filter.ts`의 `const anyOf`를 `export const anyOf`로 바꾼다(인자 순서는 고른 값, 가진 값이다). `cleanText`가 화면 번들에 들어가도 되는 순수 함수인지(`classification-rules.ts`는 이미 `class-form-dialog.tsx`가 import한다) 확인한다. `fold`의 `toLocaleLowerCase("ko")`가 서버 `lower()`와 영문에서 같은지(로캘 무관 영문) 테스트가 본다.

- [ ] **Step 4: 통과를 확인하고 포맷한다**

Run: `pnpm --filter web test src/lib/saved-voice-view.test.ts && pnpm exec biome check --write apps/web/src/lib/saved-voice-view.ts apps/web/src/lib/saved-voice-view.test.ts`
Expected: PASS 12.

- [ ] **Step 5: 브리프(17행)와 문구를 맞춘다.** 브리프의 문구가 `LIBRARY_TEXT`·문구 함수와 다르면 브리프대로 바꾸고 테스트 기대값도 고친 뒤 다시 돌린다. 장부에 tree SHA.

---

### Task 6: (계획 리뷰에서 뺐다)

'분류 붙이기'를 패널 안에서 펼치기로 정해(사용자 결정 U4) 새 프리미티브(`popover`)가 필요 없다. 태스크 번호는 리뷰 기록과 맞추려고 그대로 둔다.

---

### Task 7: 행의 별, 내 분류 칩, 내 문장 듣기 선택화, 보관함 훅

**Files:**
- Modify: `apps/web/src/lib/roving.ts`, `roving.test.ts`
- Modify: `apps/web/src/components/trial-provider.tsx`(`useOptionalTrial`)
- Modify: `apps/web/src/utils/orpc.ts`(`OWNED_LIST`), `apps/web/src/components/classes-board.tsx`(그것을 쓴다)
- Create: `apps/web/src/components/saved-voices.tsx`
- Modify: `apps/web/src/components/voice-row.tsx`, `voice-panel.tsx`, `casting-workspace.tsx`

**Interfaces:**
- Consumes: Task 3 프로시저와 `SavedVoice` 타입, Task 5 `savedKey`·`chipGroups`·`LIBRARY_TEXT`, `MESSAGES`(classes-view: `notFound`·`saveFailed`), `saveFailure`
- Produces:
  - `useOptionalTrial(): TrialApi | null`
  - `OWNED_LIST`(`utils/orpc.ts`): 소유 데이터 목록 쿼리 옵션(재시도 없음, 전역 알림 없음)
  - `saved-voices.tsx`:
    - `savedListOptions`
    - `useSavedList()`
    - `useSavedItem(voice: Voice): SavedVoice | undefined`
    - `useClassLists(): { channels; classes; loaded: boolean; failed: boolean; retry: () => void }`
    - `invalidateClasses(queryClient)`
    - `useSaveVoice(voice)`: `mutate({ favorite?, frequent?, memo? }, callbacks?)`
    - `useLinkVoice(voice)`: `mutate({ group: "channel" | "classification", id, on })`
    - `useRemoveVoice()`: `mutate({ id }, callbacks)`
    - `useSaving(voice): boolean`
    - `SavedStar({ voice, tabIndex })`
  - roving: `Col = 0 | 1 | 2 | 3`, `nextCell(key, from, rows, lastCol: Col)`, `navigate(key, actual, keys, remembered, playable, lastCol)`

칸 번호는 행 안 버튼 순서다.
- 캐스팅(내 문장 듣기 있음): 0 재생, 1 고르기, 2 내 문장 듣기, 3 별
- 보관함(없음): 0 재생, 1 고르기, 2 별
- `RowList`가 `lastCol = trial ? 3 : 2`를 넘긴다.

**변경 규칙(계획 리뷰 E2·D2):**
- 같은 성우의 변경(담기·연결)은 `mutationKey: ["savedVoice", savedKey]`, `scope: { id: "saved:" + savedKey }`로 차례로 보낸다.
- `onMutate`가 목록 캐시를 먼저 고치고(담긴 성우일 때), 실패하면 목록을 다시 받는다.
- 연결은 바뀐 한 항목(`{ group, id, on }`)만 받고, 보낼 목록은 `mutationFn`이 실행 시점 캐시에 그 변경을 다시 적용해 만든다(같은 변경을 두 번 적용해도 같다). 그래서 앞 요청의 결과가 캐시를 덮어써도 뒤 요청의 변경이 사라지지 않는다.
- 컨트롤은 막지 않는다(포커스가 끊기지 않는다). 저장 중 표시는 `useSaving`(담기 칸 머리 옆 스피너)이다.
- 담은 성우 목록이 오기 전이거나 실패했으면 별은 `aria-disabled`이고 누르면 아무것도 보내지 않는다(D9).

- [ ] **Step 1: roving 테스트를 고친다(실패 먼저)**

`roving.test.ts`에서 `nextCell`·`navigate` 호출에 마지막 인자 `2`를 더하고(기존 동작 그대로), 한 건을 더한다:
```ts
	it("오른쪽 끝은 lastCol이다(캐스팅 3 = 별, 보관함 2 = 별)", () => {
		expect(nextCell("ArrowRight", { row: 0, col: 2 }, 3, 3)).toEqual({ row: 0, col: 3 });
		expect(nextCell("ArrowRight", { row: 0, col: 3 }, 3, 3)).toEqual({ row: 0, col: 3 });
		expect(nextCell("ArrowRight", { row: 0, col: 2 }, 3, 2)).toEqual({ row: 0, col: 2 });
	});
```
Run: `pnpm --filter web test src/lib/roving.test.ts` → FAIL(인자 무시, col 3 없음).

- [ ] **Step 2: roving을 고친다**

```ts
// 행 목록 안 이동. 칸은 행 안 버튼 순서다: 0 재생, 1 고르기, 그 뒤는 화면마다 다르다
// (캐스팅 2 내 문장 듣기·3 별, 보관함 2 별). 오른쪽 끝은 RowList가 lastCol로 넘긴다
export type Col = 0 | 1 | 2 | 3;
```
- `nextCell(key, from, rows, lastCol: Col)`: `ArrowRight`를 `Math.min(from.col + 1, lastCol) as Col`로.
- `navigate(..., playable, lastCol: Col)`: `nextCell(..., lastCol)`을 부르게 한다.
- 주석의 '←→는 같은 행의 재생·고르기'를 '같은 행의 칸'으로 고친다.

Run: `pnpm --filter web test src/lib/roving.test.ts` → PASS.

- [ ] **Step 3: `useOptionalTrial`**

`trial-provider.tsx`:
```ts
// TrialProvider 밖(성우 보관함)에서는 null이다. 내 문장 듣기 UI는 이것이 있을 때만 그린다(T7 스펙 2절 '보관함 패널')
export function useOptionalTrial(): TrialApi | null {
	return useContext(TrialContext);
}

export function useTrial(): TrialApi {
	const trial = useOptionalTrial();
	if (!trial) throw new Error("useTrial은 TrialProvider 안에서만 쓴다");
	return trial;
}
```

- [ ] **Step 4: 소유 데이터 목록 옵션을 한 곳에(E15)**

`utils/orpc.ts` 끝에:
```ts
// 소유 데이터 목록(채널·분류·성우 보관함) 조회 옵션. 화면이 오류를 직접 보이므로 전역 알림을 끄고, 재시도하지 않는다(T6 classes-board)
export const OWNED_LIST = {
	retry: false,
	networkMode: "always",
	meta: { toast: false },
} as const;
```
`classes-board.tsx`의 `listOptions`를 지우고 `OWNED_LIST`를 쓴다.

- [ ] **Step 5: 보관함 훅과 별**

```tsx
// apps/web/src/components/saved-voices.tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	type QueryClient,
	useIsMutating,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { MESSAGES, saveFailure } from "@/lib/classes-view";
import { LIBRARY_TEXT, savedKey } from "@/lib/saved-voice-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

// 담은 성우 목록 하나를 캐스팅의 별·행 칩·담기 칸과 보관함이 함께 읽는다(스펙 3절)
export const savedListOptions = orpc.savedVoiceList.queryOptions(OWNED_LIST);
const savedListKey = orpc.savedVoiceList.key();

export const useSavedList = () => useQuery(savedListOptions);

export function useSavedItem(voice: Voice): SavedVoice | undefined {
	const key = savedKey(voice);
	return useQuery({
		...savedListOptions,
		select: (items) => items.find((item) => savedKey(item.voice) === key),
	}).data;
}

// 채널·분류 목록(칩·분류 붙이기·필터가 함께 쓴다, 계획 리뷰 P8). 둘 다 받아야 loaded다
export function useClassLists() {
	const channels = useQuery(orpc.channelList.queryOptions(OWNED_LIST));
	const classes = useQuery(orpc.classificationList.queryOptions(OWNED_LIST));
	return {
		channels: channels.data ?? [],
		classes: classes.data ?? [],
		loaded: channels.isSuccess && classes.isSuccess,
		failed: channels.isError || classes.isError,
		retry: () => {
			void channels.refetch();
			void classes.refetch();
		},
	};
}

// '성우 N명'이 바뀌는 변경 뒤에 부른다(계획 리뷰 P9)
export function invalidateClasses(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: orpc.channelList.key() });
	void queryClient.invalidateQueries({ queryKey: orpc.classificationList.key() });
}

// 목록 캐시의 그 성우를 바꾼다(담기지 않았으면 그대로)
function patch(
	queryClient: QueryClient,
	key: string,
	change: (item: SavedVoice) => SavedVoice,
) {
	queryClient.setQueryData<SavedVoice[]>(savedListKey, (items) =>
		items?.map((item) => (savedKey(item.voice) === key ? change(item) : item)),
	);
}

// 서버 결과로 목록 캐시를 고친다. 새로 담긴 성우는 맨 앞(최근 담은 순)
function writeBack(queryClient: QueryClient, saved: SavedVoice) {
	queryClient.setQueryData<SavedVoice[]>(savedListKey, (items) => {
		if (!items) return items;
		const at = items.findIndex((item) => item.id === saved.id);
		return at === -1
			? [saved, ...items]
			: items.map((item) => (item.id === saved.id ? saved : item));
	});
}

// 실패하면 성공으로 보이지 않는다: 알리고 서버 값으로 되돌린다(목록을 다시 받는다). 없어진 채널·분류는 '찾을 수 없어요'(스펙 5절)
function useFailure() {
	const queryClient = useQueryClient();
	return (error: unknown) => {
		toast.error(saveFailure(error) === "not_found" ? MESSAGES.notFound : MESSAGES.saveFailed);
		void queryClient.invalidateQueries({ queryKey: savedListKey });
		invalidateClasses(queryClient);
	};
}

const scopeOf = (voice: Voice) => {
	const key = savedKey(voice);
	return { key, mutationKey: ["savedVoice", key], scope: { id: `saved:${key}` } };
};

type SaveChange = { favorite?: boolean; frequent?: boolean; memo?: string };

export function useSaveVoice(voice: Voice) {
	const queryClient = useQueryClient();
	const fail = useFailure();
	const { key, mutationKey, scope } = scopeOf(voice);
	return useMutation({
		mutationKey,
		scope,
		mutationFn: (change: SaveChange) => client.savedVoiceSave({ voice, ...change }),
		// 메모는 서버가 정리하므로 결과로만 바꾼다
		onMutate: ({ favorite, frequent }) =>
			patch(queryClient, key, (item) => ({
				...item,
				favorite: favorite ?? item.favorite,
				frequent: frequent ?? item.frequent,
			})),
		onSuccess: (saved) => writeBack(queryClient, saved),
		onError: fail,
	});
}

type LinkChange = { group: "channel" | "classification"; id: string; on: boolean };
const applyLink = (ids: readonly string[], { id, on }: LinkChange) =>
	on ? (ids.includes(id) ? [...ids] : [...ids, id]) : ids.filter((x) => x !== id);

export function useLinkVoice(voice: Voice) {
	const queryClient = useQueryClient();
	const fail = useFailure();
	const { key, mutationKey, scope } = scopeOf(voice);
	return useMutation({
		mutationKey,
		scope,
		// 실행 시점 캐시(앞 요청의 결과가 반영된)에 이 변경을 다시 적용해 보낸다(계획 리뷰 E2)
		mutationFn: (change: LinkChange) => {
			const item = queryClient
				.getQueryData<SavedVoice[]>(savedListKey)
				?.find((entry) => savedKey(entry.voice) === key);
			const channelIds = item?.channelIds ?? [];
			const classificationIds = item?.classificationIds ?? [];
			return client.savedVoiceLinks({
				voice,
				channelIds: change.group === "channel" ? applyLink(channelIds, change) : channelIds,
				classificationIds:
					change.group === "classification"
						? applyLink(classificationIds, change)
						: classificationIds,
			});
		},
		onMutate: (change) =>
			patch(queryClient, key, (item) =>
				change.group === "channel"
					? { ...item, channelIds: applyLink(item.channelIds, change) }
					: { ...item, classificationIds: applyLink(item.classificationIds, change) },
			),
		onSuccess: (saved) => writeBack(queryClient, saved),
		onError: fail,
		onSettled: () => invalidateClasses(queryClient),
	});
}

// 실패 표시는 확인 창이 맡는다(T6 class-delete-dialog 구조, 계획 리뷰 D15)
export function useRemoveVoice() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string }) => client.savedVoiceRemove(input),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: savedListKey });
			invalidateClasses(queryClient);
		},
	});
}

// 그 성우의 담기·연결이 하나라도 진행 중인지(담기 칸 머리의 스피너)
export function useSaving(voice: Voice): boolean {
	return useIsMutating({ mutationKey: scopeOf(voice).mutationKey }) > 0;
}

// 행 맨 끝의 별(시안). 누르면 바로 저장된다(담기지 않았으면 담긴다). 연타는 scope가 차례로 보내고 마지막 상태가 남는다.
// 담은 성우 목록이 오기 전·실패면 켜짐 여부를 모르므로 누를 수 없다(계획 리뷰 D9)
export function SavedStar({ voice, tabIndex }: { voice: Voice; tabIndex: number }) {
	const list = useSavedList();
	const item = useSavedItem(voice);
	const save = useSaveVoice(voice);
	const ready = list.isSuccess;
	const on = item?.favorite ?? false;
	const tip = !ready
		? list.isError
			? LIBRARY_TEXT.listFailed
			: LIBRARY_TEXT.loading
		: on
			? "즐겨찾기 해제"
			: "즐겨찾기";
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-lg"
						className="relative z-10 shrink-0 aria-disabled:opacity-50"
						aria-disabled={!ready || undefined}
						tabIndex={tabIndex}
						aria-pressed={on}
						aria-label={`${voice.name} 즐겨찾기`}
						onClick={() => {
							if (ready) save.mutate({ favorite: !on });
						}}
					/>
				}
			>
				<Star aria-hidden="true" className={cn(on ? "fill-current" : "text-muted-foreground")} />
			</TooltipTrigger>
			<TooltipContent>{tip}</TooltipContent>
		</Tooltip>
	);
}
```
`Button`의 `size="icon-lg"`, `cn` 경로, `useMutation`의 `scope` 옵션은 설치본(`@tanstack/query-core` `MutationOptions.scope`)과 같은 폴더의 기존 파일(`trial-results.tsx`의 `RowAction`)로 확인한다. 별 색은 브리프 B1을 따른다(권고 `foreground` 채움).

- [ ] **Step 6: 행을 고친다(`voice-row.tsx`)**

- `useTrial()`을 쓰는 `VoiceRow`·`RowList`는 `useOptionalTrial()`로 바꾼다.
  - `VoiceRow`: `const trial = useOptionalTrial(); const trialProblem = trial?.problem(key) ?? null;`
  - `TrialButton`은 그대로 `useTrial()`이다. `trial !== null`일 때만 그린다.
- 담은 성우의 행(사용자 결정 U3, 계획 리뷰 D7·D16):
  - `const saved = useSavedItem(voice); const { channels, classes } = useClassLists();`
  - `const mine = saved ? chipGroups(saved, channels, classes).flatMap((g) => g.items.map((i) => i.name)) : [];`
  - 내 분류가 있으면 알약 자리는 공급자 알약 대신 `{ all: mine, shown: mine.slice(0, 2), rest: Math.max(0, mine.length - 2) }`이고, 칩은 윤곽(브리프 B8, `pillClass`와 다른 클래스)이다.
  - 화면 밖 설명은 `, 내 분류: …`다(공급자 분류 대신).
  - `saved?.frequent`이면 이름 옆에 회색 배지 `LIBRARY_TEXT.frequent`.
  - `saved?.unavailable`이면 `badges` 맨 앞에 `LIBRARY_TEXT.unavailable`(모양은 브리프 B6).
- 행 끝:
  - `{trial ? <TrialButton … tabIndex={tabbable === 2 ? 0 : -1} /> : null}`
  - 그 뒤에 `<SavedStar voice={voice} tabIndex={tabbable === (trial ? 3 : 2) ? 0 : -1} />`
- `RowList`:
  - `const trial = useOptionalTrial(); const lastCol: Col = trial ? 3 : 2;`
  - `cellOf`의 칸 검사를 `if (col < 0 || col > lastCol) return null;` 그리고 `return { row, col: col as Col }`로 바꾼다.
  - `navigate(..., lastCol)`.
  - 안내 문구를 '방향키로 성우와 버튼 사이를 옮겨요'로 바꾼다(D23).
- 주석을 고친다. 행 안 버튼 순서는 `roving.ts` 주석을 가리키게 하고, `tabbable` prop 주석에 별을 넣는다.
- 칸 예산은 브리프 B7이 정한 임계값으로 오른쪽 144px 칸의 `@lg`를 바꾼다(권고 36rem, `@[36rem]:flex`). `DESIGN.md` 성우 행 절은 대조표 25행에서 고친다.

- [ ] **Step 7: 패널·작업대를 고친다**

`voice-panel.tsx`의 `VoicePanelContent`(구역 순서는 사용자 결정 U2):
```tsx
	const trial = useOptionalTrial();
	const saved = useSavedItem(voice);
	…
		<div className="flex flex-col gap-5 text-base">
			{saved?.unavailable ? (
				<p role="note" className="flex gap-2 text-sm text-warning">
					<TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					{LIBRARY_TEXT.unavailableNotice}
				</p>
			) : null}
			{/* 기존: 공급자 줄 … 이용 조건 그대로 */}
			{/* ElevenLabs 공개 라이브러리 성우는 이용 가능 확인을 하지 않는다는 것을 숨기지 않는다(계획 리뷰 D16, PRODUCT 원칙 4). 담긴 성우에만 */}
			{saved && voice.provider === "elevenlabs" && voice.source === "public" ? (
				<p className="text-muted-foreground text-sm">{LIBRARY_TEXT.notChecked}</p>
			) : null}
			{trial ? <TrialSection voice={voice} /> : null}
			<SavedSection voice={voice} />
			{trial ? <TrialResults voice={voice} /> : null}
		</div>
```
- `SavedSection`은 Task 8 Step 1이 만든다. 그래서 Task 7과 Task 8은 한 구현자에게 이어서 맡기고 타입 검사·리뷰를 함께 한다(Task 7 Step 8 = Task 8 Step 5).
- `VoiceSheet`의 `SheetDescription`은 `trial ? "성우 정보, 기본 샘플, 내 문장 듣기, 담기" : "성우 정보, 기본 샘플, 담기"`(같은 `useOptionalTrial`)다.
- `casting-workspace.tsx`: `const trial = useOptionalTrial();` 그리고 `{trial ? <SentenceBar provider={barProvider} /> : null}`.

- [ ] **Step 8: 확인(Task 8 뒤 함께)**

Run(Task 8 Step 5와 함께): `pnpm --filter web test && pnpm --filter web check-types && pnpm exec biome check --write apps/web/src`
Expected:
- roving 포함 web 테스트 PASS, 타입 0
- React Compiler 확인(T6 방식 scratchpad `rc/check.cjs`)으로 `voice-row.tsx`·`saved-voices.tsx`·`voice-panel.tsx` bailout 0
- 장부에 tree SHA

---

### Task 8: 패널 담기 칸과 분류 붙이기(패널 안 펼침)

**Files:**
- Create: `apps/web/src/components/saved-section.tsx`, `apps/web/src/components/class-picker.tsx`

**Interfaces:**
- Consumes:
  - Task 7: `useSavedList`·`useSavedItem`·`useSaveVoice`·`useLinkVoice`·`useRemoveVoice`·`useSaving`·`useClassLists`·`invalidateClasses`
  - Task 5: `chipGroups`·`sameName`·`foldName`·`LIBRARY_TEXT`·`removeQuestion`·`removedMessage`·`linkMessage`·`savedKey`
  - T6: `GROUP_TEXT`·`MESSAGES`·`saveFailure`·`fieldMessage`·`emptyMessage`·`neighborId`·`byName`(classes-view), `memoProblem`·`MEMO_MAX`·`nameProblem`(classification-rules)
  - 기존 `Toggle`·`Switch`·`Checkbox`·`Textarea`·`Label`·`AlertDialog`·`Input`·`Spinner`·`Skeleton`
- Produces: `SavedSection({ voice })`, `ClassPicker({ voice, item, onLinked })`

화면 동작(스펙 4절, 계획 리뷰 반영):
- **관문(E1):** `SavedSection`은 담은 성우 목록이 끝난 뒤에만 칸을 그린다.
  - 로딩이면 뼈대, 실패면 회색 한 줄 + '다시 불러오기'.
  - 성우마다 `key={savedKey(voice)}`로 다시 마운트해 메모 초안이 새로 시작한다.
- **모든 동작은 담기지 않은 성우에서도 된다**(처음 하는 동작이 담기).
- **머리:** `h3` '담기'(`tabIndex={-1}`, 빼기 뒤 포커스 자리). 저장 중(`useSaving`)이면 옆에 `Spinner`를 두고, 화면 밖 `role="status"`로 `LIBRARY_TEXT.saving`을 알린다.
- **즐겨찾기:** 윤곽 `Toggle`(`variant="outline"`, 켜지면 별 채움). **자주 사용:** `Switch`(라벨 '자주 사용'). 둘 다 막지 않는다(Task 7 변경 규칙).
- **칩(D5·D10):**
  - 그룹마다 한 줄이다. 왼쪽에 회색 그룹 이름, 오른쪽에 윤곽 칩이 줄바꿈해 놓인다. 줄 높이는 `min-h-11`이다.
  - 칩의 × 접근 이름은 '{그룹} {이름} 떼기'이고 툴팁은 '분류 해제'다.
  - 뗀 뒤 포커스: 같은 그룹 다음 칩의 × → 이전 칩 → '분류 붙이기'. 누를 때 정하고, `neighborId`를 쓴다.
  - 결과는 화면 밖 `role="status"`로 알린다(`linkMessage`).
- **분류 붙이기(U4, `ClassPicker`):**
  - 칩 줄 아래 `variant="link"` 버튼 '분류 붙이기'(`aria-expanded`, `aria-controls`). 누르면 바로 아래 영역이 펼쳐지고 검색 칸으로 포커스가 간다.
  - 검색 칸: 자리표시 `LIBRARY_TEXT.pickerPlaceholder`. 분류가 하나도 없으면 칸 위에 `pickerFirst` 한 줄.
  - 그룹마다 `fieldset`과 `legend`(그룹 이름)를 둔다.
    - 체크 줄은 44px이고 이름순이며, `foldName` 포함 검색으로 거른다.
    - 그룹이 비었으면 `emptyMessage(group)`, 검색 결과가 없으면 `noMatchName`.
  - 체크하면 바로 `link.mutate({ group, id, on })`. 막지 않는다.
  - 만들기 줄: 검색어가 이름 규칙을 통과하고(`nameProblem === null`) 그 그룹에 `sameName`이 없으면 그룹 끝에 "+ ‘{검색어}’ {그룹} 만들기" 버튼(줄바꿈 허용, `h-auto min-h-11 whitespace-normal text-left`).
  - 검색어가 40자를 넘으면 검색 칸 아래 한 줄 `fieldMessage("name", "too_long")`(그룹마다 아님).
  - 만들기는 모듈 함수 `createAndFind`(E18)로 한다.
    - T6 프로시저로 만들고 새 id를 돌려준다.
    - `CONFLICT`면 목록을 다시 받아 `sameName`으로 찾은 id를 돌려준다.
    - 그 밖 실패는 `null`과 알림.
    - 컴포넌트는 받은 id로 `link.mutate`한 뒤 검색어를 비우고 검색 칸으로 포커스를 보낸다.
  - 결과 수는 화면 밖 `role="status"`("카테고리 2개, 타입 1개 찾았어요". 검색어가 있을 때만).
  - 채널·분류 목록이 로딩이면 '불러오는 중이에요', 실패면 `LIBRARY_TEXT.classesFailed` + '다시 불러오기'(D9).
  - Esc를 누르거나 버튼을 다시 누르면 접히고 포커스는 버튼으로 돌아간다.
- **메모:** `Textarea`(2~3줄), 'N / 200자'(190자부터 `text-warning`).
  - 바뀌었으면 옆에 `LIBRARY_TEXT.memoUnsaved`(D14).
  - 문제가 있으면 칸 아래 `fieldMessage("memo", problem)`(E13).
  - '메모 저장'은 바뀌었고 문제가 없을 때만 눌린다. 성공하면 초안을 서버 값으로 바꾸고 `toast.success(LIBRARY_TEXT.memoSaved)`.
- **보관함에서 빼기:** 담긴 성우일 때만, 회색 글자 버튼(D11). 확인 창은 `class-delete-dialog.tsx` 구조 그대로다(D15).
  - 전송 가드, 버튼 안 스피너, `role="status"` `LIBRARY_TEXT.removing`.
  - 실패면 창 안 `removeFailed` + '취소'로 포커스. `NOT_FOUND`면 닫고 `MESSAGES.notFound`.
  - 성공 알림은 `removedMessage(name)`.
  - 닫힌 뒤 포커스: 빼기에 성공했으면 담기 칸 머리(`h3`, E9), 취소면 '보관함에서 빼기'.
  - 보관함 화면에서 행이 사라질 때의 포커스는 Task 9(D8)가 맡는다.

- [ ] **Step 1: `saved-section.tsx`를 쓴다**

```tsx
// apps/web/src/components/saved-section.tsx
"use client";

import { MEMO_MAX, memoProblem } from "@tts-pilot-app/api/classification-rules";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@tts-pilot-app/ui/components/alert-dialog";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Label } from "@tts-pilot-app/ui/components/label";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Switch } from "@tts-pilot-app/ui/components/switch";
import { Textarea } from "@tts-pilot-app/ui/components/textarea";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { Star, X } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { fieldMessage, GROUP_TEXT, MESSAGES, neighborId, saveFailure } from "@/lib/classes-view";
import {
	chipGroups,
	LIBRARY_TEXT,
	linkMessage,
	removedMessage,
	removeQuestion,
	savedKey,
} from "@/lib/saved-voice-view";

import { ClassPicker } from "./class-picker";
import {
	useClassLists,
	useLinkVoice,
	useRemoveVoice,
	useSavedItem,
	useSavedList,
	useSaveVoice,
	useSaving,
} from "./saved-voices";
import { ReloadButton } from "./voice-problem";

// 패널의 '담기' 칸(시안, 스펙 4절). 담은 성우 목록이 오기 전에는 그리지 않는다: 빈 메모로 시작해 '메모 저장'이 기존 메모를 지우던 문제(계획 리뷰 E1).
// 성우마다 메모 초안이 새로 시작하게 key로 다시 마운트한다
export function SavedSection({ voice }: { voice: Voice }) {
	const list = useSavedList();
	if (list.isPending)
		return <Skeleton aria-hidden="true" className="h-40 w-full rounded-2xl" />;
	if (list.isError)
		return (
			<div className="flex flex-wrap items-center gap-3">
				<p className="text-muted-foreground text-sm">{LIBRARY_TEXT.listFailed}</p>
				<ReloadButton reloading={list.isFetching} onReload={() => void list.refetch()} />
			</div>
		);
	return <SavedFields key={savedKey(voice)} voice={voice} />;
}

const chipId = (id: string) => `saved-chip-${id}`;

function SavedFields({ voice }: { voice: Voice }) {
	const headingId = useId();
	const memoId = useId();
	const countId = useId();
	const memoErrorId = useId();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const pickerRef = useRef<HTMLButtonElement>(null);
	const removeRef = useRef<HTMLButtonElement>(null);
	const item = useSavedItem(voice);
	const save = useSaveVoice(voice);
	const link = useLinkVoice(voice);
	const saving = useSaving(voice);
	const { channels, classes } = useClassLists();
	const [memo, setMemo] = useState(item?.memo ?? "");
	const [removing, setRemoving] = useState(false);
	const [announce, setAnnounce] = useState("");
	const favorite = item?.favorite ?? false;
	const frequent = item?.frequent ?? false;
	const groups = item ? chipGroups(item, channels, classes) : [];
	const memoLength = [...memo].length;
	const memoChanged = memo !== (item?.memo ?? "");
	const problem = memoProblem(memo);

	// 뗀 뒤 포커스: 같은 그룹 다음 칩 → 이전 칩 → '분류 붙이기'(계획 리뷰 D5). 누를 때 정한다(무효화 뒤에는 뗀 칩이 없다)
	function unlink(group: "channel" | "category" | "type", ids: string[], id: string, name: string) {
		const next = neighborId(ids, id);
		link.mutate({ group: group === "channel" ? "channel" : "classification", id, on: false });
		setAnnounce(linkMessage(name, group, false));
		(next ? document.getElementById(chipId(next)) : pickerRef.current)?.focus();
	}

	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<h3 id={headingId} ref={headingRef} tabIndex={-1} className="font-bold outline-none">
					담기
				</h3>
				{saving ? <Spinner aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
				<p role="status" className="sr-only">
					{saving ? LIBRARY_TEXT.saving : announce}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Toggle
					variant="outline"
					pressed={favorite}
					onPressedChange={(pressed) => save.mutate({ favorite: pressed })}
					className="gap-1.5 px-3"
				>
					<Star aria-hidden="true" className={favorite ? "fill-current" : undefined} />
					즐겨찾기
				</Toggle>
				<Label className="flex min-h-11 items-center gap-2 font-normal text-base">
					<Switch
						checked={frequent}
						onCheckedChange={(checked) => save.mutate({ frequent: checked })}
					/>
					{LIBRARY_TEXT.frequent}
				</Label>
			</div>
			{groups.map(({ group, items }) => {
				const ids = items.map((entry) => entry.id);
				return (
					<div key={group} className="flex min-h-11 items-start gap-3">
						<span className="w-16 shrink-0 pt-2.5 text-muted-foreground text-sm">
							{GROUP_TEXT[group].label}
						</span>
						<ul className="flex min-w-0 flex-wrap gap-1.5" aria-label={`붙인 ${GROUP_TEXT[group].label}`}>
							{items.map((entry) => (
								<li
									key={entry.id}
									className="flex min-h-11 items-center gap-0.5 rounded-full border bg-card pl-3 text-sm"
								>
									<span className="break-words">{entry.name}</span>
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													id={chipId(entry.id)}
													variant="ghost"
													size="icon-lg"
													className="rounded-full"
													aria-label={`${GROUP_TEXT[group].label} ${entry.name} 떼기`}
													onClick={() => unlink(group, ids, entry.id, entry.name)}
												/>
											}
										>
											<X aria-hidden="true" />
										</TooltipTrigger>
										<TooltipContent>분류 해제</TooltipContent>
									</Tooltip>
								</li>
							))}
						</ul>
					</div>
				);
			})}
			<ClassPicker
				voice={voice}
				item={item}
				triggerRef={pickerRef}
				onLinked={(name, group) => setAnnounce(linkMessage(name, group, true))}
			/>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={memoId} className="font-bold text-sm">
					메모 <span className="font-normal text-muted-foreground">(선택)</span>
				</Label>
				<Textarea
					id={memoId}
					value={memo}
					onChange={(event) => setMemo(event.target.value)}
					aria-describedby={problem ? `${countId} ${memoErrorId}` : countId}
					aria-invalid={problem ? true : undefined}
					className="min-h-20 rounded-xl text-base md:text-sm"
				/>
				{problem ? (
					<p id={memoErrorId} role="alert" className="text-sm text-warning">
						{fieldMessage("memo", problem)}
					</p>
				) : null}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<span className="flex flex-wrap gap-x-2 text-sm">
						<span
							id={countId}
							className={memoLength >= MEMO_MAX - 10 ? "text-warning tabular-nums" : "text-muted-foreground tabular-nums"}
						>
							{memoLength} / {MEMO_MAX}자
						</span>
						{memoChanged ? (
							<span className="text-muted-foreground">{LIBRARY_TEXT.memoUnsaved}</span>
						) : null}
					</span>
					<Button
						variant="outline"
						size="lg"
						focusableWhenDisabled
						disabled={!memoChanged || problem !== null}
						onClick={() =>
							save.mutate(
								{ memo },
								{
									// 서버가 정리한 값으로 초안을 맞춘다(그래야 '메모 저장'이 다시 꺼진다, 계획 리뷰 E13)
									onSuccess: (saved) => {
										setMemo(saved.memo ?? "");
										toast.success(LIBRARY_TEXT.memoSaved);
									},
								},
							)
						}
					>
						메모 저장
					</Button>
				</div>
			</div>
			{item ? (
				<>
					<Button
						ref={removeRef}
						variant="ghost"
						size="lg"
						className="self-start text-muted-foreground hover:text-foreground"
						onClick={() => setRemoving(true)}
					>
						보관함에서 빼기
					</Button>
					{removing ? (
						<RemoveDialog
							item={item}
							name={voice.name}
							openerRef={removeRef}
							headingRef={headingRef}
							onClose={() => setRemoving(false)}
						/>
					) : null}
				</>
			) : null}
		</section>
	);
}

// 빼기 확인(T6 class-delete-dialog 구조, 계획 리뷰 D15). 실패 알림은 창이 맡는다(useRemoveVoice는 알리지 않는다)
function RemoveDialog({
	item,
	name,
	openerRef,
	headingRef,
	onClose,
}: {
	item: SavedVoice;
	name: string;
	openerRef: RefObject<HTMLButtonElement | null>;
	headingRef: RefObject<HTMLHeadingElement | null>;
	onClose: () => void;
}) {
	const remove = useRemoveVoice();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const sendingRef = useRef(false);
	const doneRef = useRef(false);
	const [failed, setFailed] = useState(false);

	function confirm() {
		if (sendingRef.current) return;
		sendingRef.current = true;
		setFailed(false);
		remove.mutate(
			{ id: item.id },
			{
				onSuccess: () => {
					doneRef.current = true;
					toast.success(removedMessage(name));
					onClose();
				},
				onError: (error) => {
					if (saveFailure(error) === "not_found") {
						doneRef.current = true;
						toast.error(MESSAGES.notFound);
						onClose();
						return;
					}
					setFailed(true);
					cancelRef.current?.focus();
				},
				onSettled: () => {
					sendingRef.current = false;
				},
			},
		);
	}

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open && !remove.isPending) onClose();
			}}
		>
			<AlertDialogContent
				initialFocus={cancelRef}
				// 뺀 뒤 '보관함에서 빼기'는 사라진다. 담기 칸 머리로(계획 리뷰 E9). 칸마저 사라지면(보관함에서 행이 빠짐) Task 9 규칙이 맡는다
				finalFocus={() =>
					(doneRef.current ? headingRef.current : openerRef.current) ?? true
				}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>{removeQuestion(name)}</AlertDialogTitle>
					<AlertDialogDescription>{LIBRARY_TEXT.removeDetail}</AlertDialogDescription>
				</AlertDialogHeader>
				{failed ? (
					<p role="alert" className="text-sm text-warning">
						{LIBRARY_TEXT.removeFailed}
					</p>
				) : null}
				<p role="status" className="sr-only">
					{remove.isPending ? LIBRARY_TEXT.removing : ""}
				</p>
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancelRef} size="lg">
						취소
					</AlertDialogCancel>
					<AlertDialogAction
						size="lg"
						variant="destructive"
						disabled={remove.isPending}
						focusableWhenDisabled
						onClick={confirm}
					>
						{remove.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
						빼기
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```
- `Toggle`의 `variant="outline"`이 packages/ui에 없으면 `className`으로 윤곽(`border`)을 준다.
- `onPressedChange`·`onCheckedChange` 이름은 packages/ui의 해당 파일에서 확인한다.
- 칩 모양·그룹 이름 폭은 브리프 B2를 따른다.

- [ ] **Step 2: `class-picker.tsx`를 쓴다**

```tsx
// apps/web/src/components/class-picker.tsx
"use client";

import { type ClassificationKind, nameProblem } from "@tts-pilot-app/api/classification-rules";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Checkbox } from "@tts-pilot-app/ui/components/checkbox";
import { Input } from "@tts-pilot-app/ui/components/input";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
	byName,
	emptyMessage,
	fieldMessage,
	GROUP_TEXT,
	type Group,
	MESSAGES,
	saveFailure,
} from "@/lib/classes-view";
import { foldName, LIBRARY_TEXT, sameName } from "@/lib/saved-voice-view";
import { client, OWNED_LIST, orpc } from "@/utils/orpc";

import { invalidateClasses, useClassLists, useLinkVoice } from "./saved-voices";
import { ReloadButton } from "./voice-problem";

const GROUPS: readonly Group[] = ["channel", "category", "type"];
type Named = { id: string; name: string };

// 만들고 그 id를 돌려준다. 같은 이름이 이미 있으면(CONFLICT) 목록을 다시 받아 그 항목 id를. 그 밖 실패는 알리고 null.
// 컴포넌트 밖에 둔다: 컴포넌트 안 try/finally는 React Compiler가 그 컴포넌트를 건너뛴다(계획 리뷰 E18, 실측)
async function createAndFind(
	group: Group,
	name: string,
	queryClient: QueryClient,
): Promise<string | null> {
	try {
		const made =
			group === "channel"
				? await client.channelCreate({ name, memo: "", url: "" })
				: await client.classificationCreate({
						kind: group as ClassificationKind,
						name,
						memo: "",
					});
		return made.id;
	} catch (error) {
		if (saveFailure(error) !== "duplicate") {
			toast.error(MESSAGES.saveFailed);
			return null;
		}
		const fresh: readonly Named[] =
			group === "channel"
				? await queryClient.fetchQuery(orpc.channelList.queryOptions(OWNED_LIST))
				: (
						await queryClient.fetchQuery(orpc.classificationList.queryOptions(OWNED_LIST))
					).filter((entry) => entry.kind === group);
		return sameName(fresh, name)?.id ?? null;
	} finally {
		invalidateClasses(queryClient);
	}
}

// '분류 붙이기'(스펙 4절, 사용자 결정 U4: 팝오버가 아니라 담기 칸 안에서 펼친다. 넓은 화면·서랍 모두 같고 겹침이 없다).
// 체크하면 바로 저장되고, 일치하는 이름이 없으면 그 자리에서 만들고 붙인다(T6 프로시저)
export function ClassPicker({
	voice,
	item,
	triggerRef,
	onLinked,
}: {
	voice: Voice;
	item: SavedVoice | undefined;
	triggerRef: RefObject<HTMLButtonElement | null>;
	onLinked: (name: string, group: Group) => void;
}) {
	const queryClient = useQueryClient();
	const regionId = useId();
	const searchId = useId();
	const searchRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(false);
	const link = useLinkVoice(voice);
	const { channels, classes, loaded, failed, retry } = useClassLists();
	const typed = query.trim();
	const tooLong = typed !== "" && nameProblem(typed) === "too_long";
	const all = (group: Group): readonly Named[] =>
		group === "channel" ? channels : classes.filter((entry) => entry.kind === group);
	const listOf = (group: Group) =>
		byName(all(group)).filter(
			(entry) => typed === "" || foldName(entry.name).includes(foldName(typed)),
		);
	const selected = (group: Group) =>
		group === "channel" ? (item?.channelIds ?? []) : (item?.classificationIds ?? []);
	const found = GROUPS.map((group) => [group, listOf(group).length] as const).filter(
		([, count]) => count > 0,
	);

	function toggle(group: Group, entry: Named, on: boolean) {
		link.mutate({ group: group === "channel" ? "channel" : "classification", id: entry.id, on });
		if (on) onLinked(entry.name, group);
	}
	function create(group: Group) {
		const name = typed;
		setCreating(true);
		void createAndFind(group, name, queryClient)
			.then((id) => {
				if (id) toggle(group, { id, name }, true);
			})
			.finally(() => {
				setCreating(false);
				setQuery("");
				searchRef.current?.focus();
			});
	}
	function close() {
		setOpen(false);
		triggerRef.current?.focus();
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				ref={triggerRef}
				variant="link"
				size="lg"
				className="self-start px-0"
				aria-expanded={open}
				aria-controls={regionId}
				onClick={() => {
					if (open) close();
					else setOpen(true);
				}}
			>
				<Plus aria-hidden="true" />
				분류 붙이기
			</Button>
			{open ? (
				<div
					id={regionId}
					className="flex flex-col gap-3 rounded-2xl p-3 ring-1 ring-border ring-inset"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.stopPropagation();
							close();
						}
					}}
				>
					{loaded && channels.length + classes.length === 0 ? (
						<p className="text-muted-foreground text-sm">{LIBRARY_TEXT.pickerFirst}</p>
					) : null}
					<label htmlFor={searchId} className="sr-only">
						분류 찾기
					</label>
					<Input
						id={searchId}
						ref={searchRef}
						autoFocus
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={LIBRARY_TEXT.pickerPlaceholder}
						className="min-h-11 rounded-xl text-base md:text-sm"
					/>
					{tooLong ? (
						<p className="text-sm text-warning">{fieldMessage("name", "too_long")}</p>
					) : null}
					<p role="status" className="sr-only">
						{typed
							? found.map(([group, count]) => `${GROUP_TEXT[group].label} ${count}개`).join(", ") ||
								LIBRARY_TEXT.noMatchName
							: ""}
					</p>
					{failed ? (
						<div className="flex flex-wrap items-center gap-3">
							<p className="text-muted-foreground text-sm">{LIBRARY_TEXT.classesFailed}</p>
							<ReloadButton reloading={false} onReload={retry} />
						</div>
					) : !loaded ? (
						<p className="text-muted-foreground text-sm">불러오는 중이에요</p>
					) : (
						GROUPS.map((group) => {
							const list = listOf(group);
							const canCreate =
								typed !== "" && nameProblem(typed) === null && !sameName(all(group), typed);
							return (
								<fieldset key={group} className="flex flex-col">
									<legend className="mb-1 font-bold text-muted-foreground text-sm">
										{GROUP_TEXT[group].label}
									</legend>
									{list.length === 0 && !canCreate ? (
										<p className="text-muted-foreground text-sm">
											{typed ? LIBRARY_TEXT.noMatchName : emptyMessage(group)}
										</p>
									) : null}
									{list.map((entry) => (
										<label
											key={entry.id}
											className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
										>
											<Checkbox
												checked={selected(group).includes(entry.id)}
												onCheckedChange={(checked) => toggle(group, entry, checked === true)}
											/>
											<span className="min-w-0 break-words">{entry.name}</span>
										</label>
									))}
									{canCreate ? (
										<Button
											variant="ghost"
											size="lg"
											className="h-auto min-h-11 justify-start whitespace-normal text-left"
											focusableWhenDisabled
											disabled={creating}
											onClick={() => create(group)}
										>
											<Plus aria-hidden="true" />‘{typed}’ {GROUP_TEXT[group].label} 만들기
										</Button>
									) : null}
								</fieldset>
							);
						})
					)}
				</div>
			) : null}
		</div>
	);
}
```
- `autoFocus`는 펼칠 때 검색 칸으로 포커스를 보낸다. Biome가 `noAutofocus`로 막으면 펼칠 때 `requestAnimationFrame(() => searchRef.current?.focus())`를 이벤트 처리기에서 부른다.
- 패널 안 펼침이라 서랍(Sheet) 안에서도 Esc가 서랍을 닫지 않게 `stopPropagation`한다. 실제로 막히는지 QA S16에서 본다.
- `emptyMessage(group)`은 "아직 채널이 없어요"이고 마침표가 없다(T6).
- 만들기 중에는 그 만들기 버튼만 막는다(`creating`). 체크는 막지 않는다.

- [ ] **Step 3: 패널에 연결한다.** Task 7 Step 7의 `SavedSection` import가 이제 풀린다.

- [ ] **Step 4: React Compiler 확인**

scratchpad의 `rc/check.cjs`(T6에서 쓴 것. 없으면 T6 장부 Step 7 방식으로 다시 만든다)로 `saved-section.tsx`·`class-picker.tsx`·`saved-voices.tsx`·`voice-row.tsx`·`voice-panel.tsx`를 검사한다.
Expected: bailout 0(`createAndFind`는 컴포넌트 밖이라 대상이 아니다).

- [ ] **Step 5: 확인**

Run: `pnpm --filter web test && pnpm --filter web check-types && pnpm exec biome check --write apps/web/src`
Expected: PASS, 타입 0. 장부에 tree SHA(Task 7·8 함께).

---

### Task 9: `/voices` 화면, 채널·분류 연결 수, 메뉴

**Files:**
- Create: `apps/web/src/app/(app)/voices/page.tsx`, `apps/web/src/components/voice-library.tsx`, `apps/web/src/components/library-filters.tsx`
- Modify: `apps/web/src/components/class-group.tsx`, `class-delete-dialog.tsx`, `apps/web/src/components/app-nav.tsx`

**Interfaces:**
- Consumes:
  - Task 5 전부
  - Task 7 `useSavedList`·`useClassLists`·`useOptionalTrial`
  - 기존 `CastingWorkspace`·`RowList`·`SamplePlayerProvider`·`NoMatches`·`Notice`·`LoopbackNotice`·`ReloadButton`·`PageHeader`·`failureOf`·`voiceKey`
  - `voice-conditions.tsx`의 조건 줄 문법(접힘, `conditionButton`, `selectedLabel`)
  - `channelList`·`classificationList`의 `voiceCount`
- Produces: `/voices` 페이지

화면 동작(스펙 4절, 계획 리뷰 반영):
- **필터와 주소:** 주소 쿼리가 정본이다. 바꿀 때는 `window.history.replaceState`(E7, 서버 전환 없음)로 쓴다.
  - 검색어는 지역 상태로 바로 거르고, 0.5초 멈춘 뒤 주소에 쓴다(D20). 나머지 조건은 바로 쓴다.
  - 모르는 id 버리기는 채널·분류 목록이 모두 온 뒤에만 한다(E12).
- **확인:** 목록이 오면 `savedVoiceCheck`를 한 번 부르고, 결과 목록으로 캐시를 바꾼다(P2, `setQueryData`). 진행 중이면 상태 줄에 `LIBRARY_TEXT.checking`.
- **상태 줄(D19·D16·D6):**
  - 16px 회색 `tabular-nums`로 `countLine(total, shown)`을 보인다. 이용 불가가 있으면 " · 현재 이용 불가 N명"을 붙인다.
  - 조건이 있으면 '조건 모두 해제' 청록 링크를 둔다. 누르면 검색 칸으로 포커스가 간다.
  - 보이는 줄에는 role을 두지 않는다. 개수는 검색어 0.5초 뒤 화면 밖 `role="status"`로 알린다.
- **목록 상태:**
  - 로딩: 행 뼈대 5줄, 목록 자리 `aria-busy`, 화면 밖 `LIBRARY_TEXT.loading`(D9).
  - 오류: 회색 한 줄 + '다시 불러오기'(`reloading={list.isFetching}`, P12).
  - 빈 보관함: `Notice` + '성우 캐스팅에서 찾기'(`ArrowRight` 아이콘, D23).
  - 조건 없음: `NoMatches`. '조건 모두 해제' 뒤 포커스는 검색 칸.
  - 소유자 없음: `LoopbackNotice`.
- **행이 조건에서 빠질 때(D8):** 고른 성우가 목록에서 사라지면 다음 행 → 이전 행을 고른다. 포커스가 사라졌으면(빼기 뒤, 패널 안 칸이 다시 마운트됨) 그 행의 고르기 버튼으로 보낸다. 행이 없으면 상태 줄로 보낸다. 서랍은 `CastingWorkspace`가 닫는다(고른 성우가 없어지는 순간 `selected === null`).

- [ ] **Step 1: 페이지**

```tsx
// apps/web/src/app/(app)/voices/page.tsx
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { VoiceLibrary } from "@/components/voice-library";

export const metadata: Metadata = { title: "성우 보관함" };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·변경은 VoiceLibrary가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드).
// 필터가 주소 쿼리라 VoiceLibrary는 useSearchParams를 쓴다 → Suspense 경계(번들 문서 use-search-params 'Prerendering')
export default function VoicesPage() {
	return (
		<>
			<PageHeader
				title="성우 보관함"
				description="즐겨찾기·자주 사용·채널·분류로 담아 둔 성우를 다시 찾아요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<Suspense fallback={<Skeleton aria-hidden="true" className="h-96 w-full rounded-2xl" />}>
					<VoiceLibrary />
				</Suspense>
			</div>
		</>
	);
}
```
설명 문구는 브리프 B5가 정한다.

- [ ] **Step 2: 조건 줄 `library-filters.tsx`**

동작 명세(배치·간격은 브리프 B4). 먼저 `voice-conditions.tsx`를 읽고 그 조건 줄의 부품·클래스를 그대로 쓴다.
- props:
  ```ts
  {
  	filters: LibraryFilters;
  	query: string;
  	onQuery: (q: string) => void;
  	onChange: (next: LibraryFilters) => void;
  	channels: Named[];
  	classes: (Named & { kind })[];
  	searchRef: RefObject<HTMLInputElement | null>;
  }
  ```
- **검색 칸:** `Input type="search"`, `value={query}`(지역 상태라 제어 칸이어도 한글 조합이 끊기지 않는다), 화면 밖 레이블 "보관함에서 찾기".
- **보기:** `ToggleGroup` 세 칸(전체·즐겨찾기·자주 사용, 하나만, 빈 값 방지는 `voice-casting.tsx` 출처 전환 선례).
- **공급자:** 단일 선택 드롭다운(`DropdownMenuRadioGroup`). 트리거는 '공급자' / '공급자 · Typecast'다. 공급자 이름에 `translate="no"`.
- **채널·카테고리·타입:** 그룹마다 `DropdownMenu`와 `DropdownMenuCheckboxItem`(이름순).
  - 트리거는 '카테고리' / '카테고리 · 2'이고, 접근 이름은 '카테고리, 2개 선택됨'(`selectedLabel` 방식)이다.
  - 고른 값이 있으면 `conditionButton`의 칠을 쓴다.
  - 빈 그룹이면 항목 대신 `DropdownMenuItem render={<Link href="/classes" />}` "채널·분류에서 만들기"(44px).
- **767px 이하:** 검색 칸 + '조건' 버튼(고른 수 배지)만 보이고 나머지는 접는다(`voice-conditions.tsx`의 접힘 그대로).

- [ ] **Step 3: 보관함 `voice-library.tsx`**

```tsx
// apps/web/src/components/voice-library.tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
	countLine,
	EMPTY_LIBRARY_FILTERS,
	filterSaved,
	filtersFromQuery,
	hasLibraryFilters,
	knownOnly,
	LIBRARY_TEXT,
	type LibraryFilters,
	queryFromFilters,
} from "@/lib/saved-voice-view";
import { failureOf } from "@/lib/voice-failure";
import { voiceKey } from "@/lib/voice-view";
import { client, orpc } from "@/utils/orpc";

import { CastingWorkspace } from "./casting-workspace";
import { LibraryFilters as FiltersBar } from "./library-filters";
import { LoopbackNotice, Notice } from "./notice";
import { SamplePlayerProvider } from "./sample-player";
import { useClassLists, useSavedList } from "./saved-voices";
import { RowList } from "./voice-row";
import { NoMatches, ReloadButton } from "./voice-problem";

const SEARCH_DELAY_MS = 500;

// 성우 보관함(T7 스펙 4절). TrialProvider로 감싸지 않으므로 행·패널에 내 문장 듣기가 없다(스펙 2절 '보관함 패널').
// 목록은 저장한 정보로 먼저 보이고, 처음 한 번 이용 가능 확인을 부른 뒤 그 결과 목록으로 바꾼다(확인이 실패해도 목록은 그대로)
export function VoiceLibrary() {
	return (
		<SamplePlayerProvider>
			<Library />
		</SamplePlayerProvider>
	);
}

function writeQuery(filters: LibraryFilters) {
	const query = queryFromFilters(filters);
	// App Router가 useSearchParams와 맞춘다(번들 문서 linking-and-navigating 'Native History API'). 서버 전환을 타지 않는다(계획 리뷰 E7)
	window.history.replaceState(null, "", query ? `/voices?${query}` : "/voices");
}

function Library() {
	const params = useSearchParams();
	const queryClient = useQueryClient();
	const list = useSavedList();
	const { channels, classes, loaded } = useClassLists();
	const searchRef = useRef<HTMLInputElement>(null);
	const statusRef = useRef<HTMLParagraphElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const raw = filtersFromQuery(new URLSearchParams(params.toString()));
	const [query, setQuery] = useState(raw.q);
	const [announced, setAnnounced] = useState("");
	const [chosen, setChosen] = useState<string | null>(null);
	// 화면을 열 때 한 번(서버가 24시간·40명 규칙으로 거른다). 결과 목록으로 캐시를 바꾼다(계획 리뷰 P2)
	const check = useQuery({
		queryKey: ["savedVoiceCheck"],
		queryFn: async () => {
			const fresh = await client.savedVoiceCheck();
			queryClient.setQueryData(orpc.savedVoiceList.key(), fresh);
			return true;
		},
		enabled: list.isSuccess,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		meta: { toast: false },
	});

	// 지워진 채널·분류의 id는 두 목록이 다 온 뒤에만 버린다(계획 리뷰 E12)
	const known = new Set([...channels, ...classes].map((entry) => entry.id));
	const filters = { ...(loaded ? knownOnly(raw, known) : raw), q: query };
	const items = list.data ?? [];
	const shown = filterSaved(items, filters);
	const voices = shown.map((item) => item.voice);
	const keys = voices.map(voiceKey);
	const unavailable = items.filter((item) => item.unavailable).length;

	// 고른 성우가 조건에서 빠지면(별·자주 사용 해제, 빼기) 다음 행 → 이전 행을 고르고, 포커스가 사라졌으면 그 행으로(계획 리뷰 D8).
	// 바깥 변화(캐시 갱신)에 DOM 포커스를 맞추는 일이라 effect다. 이전 목록은 effect 안에서만 ref에 적는다
	const prevKeys = useRef<string[]>([]);
	const keysText = keys.join("\n");
	useEffect(() => {
		const before = prevKeys.current;
		const now = keysText === "" ? [] : keysText.split("\n");
		prevKeys.current = now;
		if (chosen === null || now.includes(chosen)) return;
		const at = before.indexOf(chosen);
		if (at === -1) return;
		const next = now[at] ?? now[at - 1] ?? null;
		setChosen(next);
		const active = document.activeElement;
		if (active && active !== document.body && active.isConnected) return;
		const rows = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-select]");
		const target = next === null ? null : rows?.[now.indexOf(next)];
		(target ?? statusRef.current)?.focus();
	}, [keysText, chosen]);

	if (failureOf(list.error) === "unauthorized")
		return <LoopbackNotice title={LIBRARY_TEXT.loopback} />;

	function setFilters(next: LibraryFilters) {
		writeQuery({ ...next, q: query });
	}
	function onQuery(q: string) {
		setQuery(q);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			writeQuery({ ...filters, q });
			setAnnounced(countLine(items.length, filterSaved(items, { ...filters, q }).length));
		}, SEARCH_DELAY_MS);
	}
	function clearAll() {
		setQuery("");
		writeQuery(EMPTY_LIBRARY_FILTERS);
		searchRef.current?.focus();
	}

	return (
		<div className="flex flex-col gap-4">
			<FiltersBar
				filters={filters}
				query={query}
				onQuery={onQuery}
				onChange={setFilters}
				channels={channels}
				classes={classes}
				searchRef={searchRef}
			/>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<p ref={statusRef} tabIndex={-1} className="text-muted-foreground tabular-nums outline-none">
					{list.data ? countLine(items.length, shown.length) : null}
					{unavailable > 0 ? ` · ${LIBRARY_TEXT.unavailable} ${unavailable}명` : null}
					{check.isFetching ? ` · ${LIBRARY_TEXT.checking}` : null}
				</p>
				{hasLibraryFilters(filters) ? (
					<Button variant="link" size="lg" className="px-0" onClick={clearAll}>
						조건 모두 해제
					</Button>
				) : null}
				<p role="status" className="sr-only">
					{announced}
				</p>
			</div>
			<CastingWorkspace voices={voices} chosen={chosen} onChoose={setChosen} pending={list.isPending}>
				{({ selectedKey, select, panelId }) =>
					list.isError ? (
						<div className="flex flex-wrap items-center gap-3">
							<p className="text-muted-foreground text-sm">{LIBRARY_TEXT.listFailed}</p>
							<ReloadButton reloading={list.isFetching} onReload={() => void list.refetch()} />
						</div>
					) : list.isPending ? (
						<div aria-busy="true" className="flex flex-col gap-2">
							<span className="sr-only">{LIBRARY_TEXT.loading}</span>
							{[0, 1, 2, 3, 4].map((n) => (
								<Skeleton key={n} aria-hidden="true" className="h-17 w-full rounded-2xl" />
							))}
						</div>
					) : items.length === 0 ? (
						<Notice title={LIBRARY_TEXT.empty}>
							<Button size="lg" variant="outline" render={<Link href="/casting" />}>
								{LIBRARY_TEXT.toCasting}
								<ArrowRight data-icon="inline-end" aria-hidden="true" />
							</Button>
						</Notice>
					) : shown.length === 0 ? (
						<NoMatches onClear={clearAll} />
					) : (
						<RowList
							ref={listRef}
							voices={voices}
							label="담은 성우"
							selectedKey={selectedKey}
							select={select}
							panelId={panelId}
							refreshing={false}
						/>
					)
				}
			</CastingWorkspace>
		</div>
	);
}
```
- import 경로·이름(`Notice`·`ReloadButton`의 props, `Button`의 `render` 링크 방식, `ReloadButton`의 `waiting` 필수 여부)은 실제 파일과 맞춘다. 계획 리뷰가 작업 트리에서 이 꼴의 타입 검사를 통과시켰다.
- `Voice` import를 쓰지 않으면 지운다.
- `onQuery`의 타이머 콜백 안 `filters`·`items`는 누른 때의 값이다. 0.5초 안에 다른 조건을 바꾸면 그 조건은 이미 주소에 있고 검색어만 덮는다.
- 컴포넌트가 사라질 때 타이머 정리는 하지 않는다(ponytail: 0.5초 뒤 `replaceState` 한 번).

- [ ] **Step 4: 채널·분류 화면**

- `class-group.tsx`:
  - `ClassItem`에 `voiceCount?: number`를 더한다.
  - 메모 `<p>` 뒤, 채널 주소 링크 앞에 `voiceCountText(item.voiceCount ?? 0)`가 있으면 링크를 둔다(계획 리뷰 D18, 스펙 4절 고침).
  - 링크: `<Link href={`/voices?${group}=${item.id}` as Route} className="-mt-2 -mb-3 flex min-h-11 w-fit items-center gap-1 rounded-md text-primary text-sm underline-offset-4 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">성우 N명<ArrowRight aria-hidden="true" className="size-3.5" /></Link>`. 주소 링크와 같은 음수 여백 문법이다.
  - 간격은 브리프가 정한다.
- `class-delete-dialog.tsx`:
  - 설명을 `{deleteDetail(group)}{linkedNote(item.voiceCount ?? 0, group)}`로 한다.
  - `onSettled`에서 `orpc.savedVoiceList.key()`도 무효화한다(칩·필터가 바뀐다).
- `classes-board.tsx`: 목록 데이터에 `voiceCount`가 오므로 그대로 넘긴다.

- [ ] **Step 5: 메뉴**

`app-nav.tsx`:
- `UPCOMING_ITEMS`에서 `{ label: "성우 보관함", icon: UserRound }`를 지운다.
- `OPEN_ITEMS`의 '성우 캐스팅' 바로 뒤에 `{ label: "성우 보관함", icon: UserRound, href: "/voices", bar: false }`를 더한다(계획 리뷰 D21).
- 휴대폰 위 막대 4칸은 그대로다. 더보기 '열린 화면' 줄과 "더보기, 현재 성우 보관함"은 기존 코드가 처리한다(T6). 더보기 안 순서는 `OPEN_ITEMS` 순서다.

- [ ] **Step 6: 확인**

Run: `pnpm --filter web check-types && pnpm --filter web test && pnpm exec biome check --write apps/web/src`
Expected:
- 0 오류(`typedRoutes`가 `/voices`를 안다), PASS
- React Compiler: `voice-library.tsx`·`library-filters.tsx`·`class-group.tsx` bailout 0
- 장부에 tree SHA. 이어서 대조표 19행 이후(코디네이터: build, 런타임, 스크린샷)

---

### Task 10: 문서

**Files:**
- Modify:
  - `docs/domain/project.md`(기능·화면·API·데이터 표)
  - `docs/briefs/site-map.md`('준비 중'에서 성우 보관함 지우기, `/voices` 행, `/classes` 행에 '성우 N명' 링크)
  - `docs/adr/0004-channel-classification-storage.md`(결과 절: T7 연결 표 외래 키 cascade)
  - `docs/research/{typecast,elevenlabs,fish-audio}-api-options.md`(한 명 조회 호출·없음 판정·과금 문구 없음, 2026-10-07)
  - `.claude/skills/tts-provider/SKILL.md`(`getVoice`는 읽기 호출, ElevenLabs 공개 성우 확인 없음, '확인한 SDK 동작' 표에 Typecast 0.4.15 `getVoiceV3`)
  - `docs/plans/implementation-roadmap.md`(T7 상태, T8·T9·T13·T14 메모: 스펙 13절)

- [ ] **Step 1:** 위 문서를 고친다. `project.md`에 들어갈 것:
  - API 표: 프로시저 5개(용어 '성우 보관함', '현재 이용 불가'), `channelList`·`classificationList`의 `voiceCount`.
  - 데이터 표: `saved_voice`·`saved_voice_channel`·`saved_voice_classification`(소유자 컬럼, 외래 키).
  - 화면 표: `/voices`. `/casting`·`/classes` 행에 별·담기 칸·'성우 N명'.
- [ ] **Step 2:** `.claude/skills/`를 바꿨으므로 대조표 34행(skill-creator eval)은 "tts-provider 사실 갱신(동작 규칙 변경 없음)"으로 판단한다. eval이 필요하다고 보면 메인 세션이 돌린다.

---

## 수용 기준과 확인 위치

| 스펙 8절 | 확인 |
|---|---|
| 1 담기·새로 고침 | Task 3 왕복, QA S2·S5 |
| 2 즐겨찾기·자주 사용 독립, 빼기로만 빠짐 | Task 3 "준 필드만", QA S4·S8 |
| 3 같은 성우 한 행 | Task 3 다시 담기·동시 담기 |
| 4 분류 여러 개, 펼친 목록에서 만들기·같은 이름 | Task 3 연결, Task 5 `sameName`, QA S3 |
| 5 필터 규칙·주소 유지 | Task 5 `filterSaved`·쿼리 왕복, QA S5 |
| 6 분류 삭제 후 성우 남음, 연결 수·링크 | Task 3, QA S6·S7 |
| 7 이용 불가·24시간 | Task 2·4, QA S9 |
| 8 격리 | Task 3 격리 |
| 9 소유자 없음 | Task 3·4 소유자 없음 |
| 10 유료 호출 0 | Global Constraints, QA 서버 로그 |
| 11 너비·테마·키보드 | QA S13·S14 |
| 12 오류 예산 0 | 대조표 20·26·29행 |

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

- 19: `pnpm check-types`, `pnpm lint`(기준과 비교), `pnpm build`.
- 20·26: next-dev-loop 런타임 확인. `/voices`·`/casting`·`/classes` desktop·mobile 스크린샷을 `tasks/evidence/T07/`에 둔다. 오류 예산은 콘솔·오버레이·`get_errors`·서버 로그다.
- 21·22·23·24: critique·audit·web-design-guidelines·polish·재확인(메인 세션).
- 27: ponytail-review로 공통화 점검(같은 디렉터리). 미룬 것은 백로그 T7-xx에 둔다.
- 28: 최종 `bts-reviewer(code)`.
- 25: `DESIGN.md` 성우 행 절(별 칸, 칸 임계값 B7, 내 분류 칩), 담기 칸·분류 붙이기 펼침 절.
- 29·30: QA S1~S21(스펙 10절). 가짜 404(S9)는 테스트 DB 행의 `unavailable`을 코디네이터가 직접 켜서 본다(공급자를 부르지 않는다). 브라우저 QA는 목록 캐시를 쓰고 실제 상세 조회 수를 서버 로그로 센다.
- 36 `[confirm]`: 스펙 11절. 먼저 "이번에 없는 것과 그 TASK"를 적는다.

## 자기 검토 (writing-plans, 2026-10-07, 계획 리뷰 반영 뒤)

- **스펙 커버리지:** 스펙 3절 표·프로시저(→ 5개, '스펙과 다른 점' 1), 상세 조회(Task 2), 4절 캐스팅 별·담기 칸·분류 붙이기(Task 7·8), `/voices`(Task 9), `/classes`(Task 9), 앱 틀(Task 9), 5절 오류(Task 3·7·8), 6절 문서(Task 10), 9절 자동 테스트(Task 2~5, 7), 13절(Task 10 로드맵 메모). 사용자 결정 U1~U4는 스펙 '계획 리뷰에서 바꾼 것'에 옮겼다.
- **자리 표시 검사:** "TBD"·"나중에" 없음. UI 태스크의 문구·간격·임계값은 브리프(17행) B1~B8로 넘기고 권고값을 적었다. Task 9 Step 2(`library-filters.tsx`)는 코드 대신 동작 명세다(`voice-conditions.tsx` 문법 재사용, 배치가 B4에 달려 있다).
- **타입 일관성:**
  - `SavedVoice`(Task 3)는 화면 훅 반환(Task 7)이다.
  - `savedKey`(Task 5)는 `useSavedItem`·scope가 쓴다.
  - `Col`·`lastCol`(Task 7), `OWNED_LIST`(Task 7 → 8·9), `useClassLists`(Task 7 → 7·8·9).
  - `getVoice(source, voiceId, preferred)`(Task 2 → 4).
  - `useLinkVoice(voice).mutate({ group, id, on })`(Task 7 → 8).
  - `linkedNote(count, group)`(Task 5 → 9).
- **Review Focus:** 다섯 줄 모두 담당 테스트가 있다.
  - 목록 전·연타: Task 3 동시 담기, Task 7 scope·`aria-disabled`, QA S15.
  - 남의 id: Task 3 격리(되돌림 포함).
  - 23503: Task 3 DB 없이.
  - 계약 거절: Task 3 계약.
  - 장애·429·공개 성우·24시간·상한: Task 4.
