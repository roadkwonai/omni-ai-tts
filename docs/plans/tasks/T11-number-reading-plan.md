# T11 한국어 숫자 발음 교정 — 구현 계획

- 스펙: [T11-number-reading.md](T11-number-reading.md) (V1, 2026-11-18 사용자 확인)
- 계층: 화면(apps/web)만. 서버(packages/api)·DB(packages/db) 변경 없음. 화면 코드는 `prokit-ui-builder`, 의존성 추가(`apps/web/package.json`·`pnpm-lock.yaml`)는 Main이 명시해 `prokit-implementer`에 위임한다
- 계획 리뷰 1회차(prokit-reviewer(plan) changes-required, medium 3·low 8) 반영: 결정 1·3·5, 태스크 2·4·5·6, 위험 표, 스펙 3·4·5절
- 사용한 스킬: agent-skills:planning-and-task-breakdown, prokit-web, prokit-ui, ponytail

## 1. 설계 결정

1. **결정의 유효성은 저장 때 원문과 비교해 정한다.** `Paragraph.fixes = { text, decisions }`이고, `fixes.text === p.text`일 때만 결정이 살아 있다. 글을 바꾸는 모든 경로(직접 입력, 붙여 넣기, 태그 넣기, 자동 태그, 나누기·합치기)가 결정을 지우는 코드를 따로 두지 않아도 무효화된다. 나누기는 `{...p}`로 `fixes`를 복사하지만 글이 달라 무효다. 스펙 3절 "그 문단 결정을 모두 지운다"와 같은 결과다. 원문이 결정 때와 같은 글로 돌아오면(입력 되돌리기, 빈 문단과 합치기) 결정은 다시 유효하다. 위치가 맞으므로 안전하다. 무효인 `fixes`를 걸러 내는 일은 `readWork`가 읽을 때 한 번만 한다(쓸 때 따로 빼지 않는다).
   - **결정은 지금 엔진의 항목과 맞을 때만 쓴다.** `decisionsOf(p)`는 지금 `readingItems(p.text)`의 항목과 `start`·`end`·`original`이 정확히 같은 결정만 남긴다. 엔진 규칙이 바뀌어 옛 결정이 겹치거나 항목과 어긋나도 두 번 바뀐 글이 유료 요청으로 나가지 않는다. `spokenOf`는 시작 위치 순으로 돌며 겹치는 결정을 건너뛴다(방어).
   - **항목 계산은 캐시한다.** `readingItems` 결과는 `requestOf`처럼 문단 글 기준 캐시(작은 Map 또는 문단 객체별 WeakMap)에 둔다. 작업 띠의 개수는 늦춘 문단 목록(`useShownParagraphs`)에서 센다. 키 입력마다 200문단 전체를 다시 돌리지 않게 하려는 것이다.
2. **보낼 글은 한 곳에서 만든다.** `spokenOf(p)`가 원문에 유효한 결정(`apply`·`manual`)을 앞에서부터 바꿔 넣는다. 지금 `p.text`를 보낼 글로 쓰는 곳은 `paragraph-script.ts`의 `blankFor`(447·449)·`paragraphRequest`(461·462)·`blockOf`(476), `make-all.ts`의 길이 검사(76)와 막대 글자 수 합(544), 카드 글자 수(`paragraph-card.tsx` 821·822)다. 이 곳들만 `spokenOf(p)`로 바꾼다. 재생기에 보이는 문단 글(`make-all.ts` 672, `paragraph-provider.tsx` 670)은 원문 그대로 둔다. 조합 키·예상 사용량·이어 듣기 낡음 판정은 요청 글을 따르므로 바꾸지 않는다. 자동 태그 추천(`studioAutoTag`)은 원문을 그대로 보낸다(태그는 원문에 들어간다). 그래서 자동 태그 대상 판정(`paragraph-autotag.ts` 98의 대상 목록과 127의 `hasAutoTagTarget`, 둘 다 같은 규칙)은 `blockOf`가 `too_long`이 아닌 막는 이유(빈 문단·성우 없음·이용 불가)를 돌려주거나 `tooLongOf(p.text)`(원문)이면 제외한다. 직접 입력으로 읽기가 짧아져도 원문이 상한을 넘는 문단은 자동 태그 대상에서 빠진다. 재생기의 문단 글(`make-all.ts` 672)은 SRT·파일 이름에도 쓰이며, 이것도 원문이다.
3. **엔진은 순수 함수 모듈 하나다.** `lib/number-reading.ts`의 `readingItems(text)`가 교정 항목 목록을 돌려준다. 수 읽기 함수(한자어 `sinoOf`, 고유어 `nativeOf`)도 이 파일 안에 둔다. 패턴은 긴 것부터 시도하고 겹치면 앞선 것만 남긴다. 태그 범위는 먼저 가린다. 태그는 `SEND_TAGS`(`packages/api/src/paragraph-tags.ts`)가 태그로 보는 모양이다(`[break 2]`처럼 숫자가 들 수 있다). 전역 식이라 `new RegExp(SEND_TAGS)`로 복사해 `matchAll`로만 쓴다.
4. **만들기 확인은 기존 확인 창에 더한다.** 새 창을 만들지 않는다. `make-all.ts`의 계획에 `unreviewed`(검수 안 한 항목 수)를 더한다. 그 수가 0보다 크면 지금의 `confirm` 단계로 간다(`!free || unknown > 0 || unreviewed > 0`). 전체 창(`paragraph-confirm.tsx`)과 한 문단 창(`paragraph-bar.tsx` 823의 `TrialConfirm kind="studio"`)에 경고 줄과 "검수하기" 버튼을 더한다. 한 문단 창의 미검수 수는 기존 `unknownSame`처럼 `TrialPending`의 선택 값 `unreviewed?`로 넘긴다. "검수하기"는 작업실만 넘기는 `onReview` 콜백으로 둔다. boolean 모드 prop은 더하지 않는다(vercel-composition-patterns architecture-avoid-boolean-props). `TrialConfirm`은 T5 성우 캐스팅(`trial-provider.tsx` 429)도 쓰므로 캐스팅 확인 창이 그대로인지 확인한다. "원문대로 만들기"는 기존 확인 버튼의 문구를 바꾼 것이다.
5. **숫자 검수 창은 새 컴포넌트 하나다.** `components/number-review.tsx`(Dialog)를 둔다. 열림 상태와 대상 항목은 `paragraph-provider`의 작은 상태다(`reviewAt: { paragraphId, index } | null`). 결정 동작은 provider의 `edit`를 거친다. `edit`에는 잠금이 없다. 기존 화면처럼 `paragraph-studio`의 `locked`(make.phase가 idle·stopped가 아닐 때, 484)를 창에 넘겨 적용과 "확실한 것 모두 적용"을 잠근다. 잠금이 빠져도 돈은 새지 않는다. 만들기 중 글이 바뀐 문단은 `runMakeAll`의 서명 재검사가 빼기 때문이다. "확실한 것 모두 적용"은 기존 `undoable` 알림으로 한 번 되돌린다. 자동 태그 창의 "보낸 뒤 바뀐 문단은 건너뛴다" 규칙은 결정 1이 같은 일을 하므로 따로 두지 않는다.
6. **AutoTag는 창을 열 때만 불러온다.** `lib/autotag-reading.ts`에서 `await import("@neosapience/typecast-autotag")`로 불러온다. 패키지는 476KB 단일 ESM이고 wasm·네이티브 코드가 없으며, 묶인 의존성은 `to-words`(MIT) 하나다. 항목마다 `autoTag(original, { language: "ko" })`을 부르고 결과가 원문과 다를 때만 후보로 보인다. 불러오기와 호출 실패는 `null`로 삼킨다. 1.14.1은 2026-11-03 판이라 pnpm 최소 경과 기간 예외가 필요 없다. 정확한 export 이름은 설치 뒤 `dist/index.d.ts`로 확인한다(아래 위험).
7. **새 프리미티브는 없다.** `packages/ui`의 Dialog, RadioGroup이 없으면 기존 ToggleGroup이나 라디오 input, Input, Button, Badge, sonner를 쓴다. 실제로 쓸 부품은 브리프 행에서 정한다.

## 2. 태스크

### 태스크 1: 숫자 읽기 엔진 (S, 2파일)
- **할 일:** `lib/number-reading.ts`에 한자어·고유어 수 읽기, 항목 찾기, 스펙 4절 표의 규칙과 다른 후보, 확인 필요 판정을 만든다.
- **수용:**
  - 수용표 11행이 스펙 4절대로 나온다.
  - 만·억은 띄어 쓴다. 십·백·천·만 앞의 맨 앞 `일`은 생략하고(10 → 십, 100 → 백, 1만 → 만) 억·조 앞에서는 남긴다(일억). 0시는 영 시다. 고유어는 1~99, 100 이상은 조합한다(`백스무`). 6월은 유월, 10월은 시월이다.
  - 시간은 범위(0~24시, 00~59분)를 검사한다. 전화번호 안의 숫자는 다시 잡지 않는다. 태그 안 숫자는 잡지 않는다.
  - 영문자에 붙은 숫자는 확인 필요다. 조 이상의 수와 셋째 자리 이하 소수도 확인 필요다.
  - 한글만 있는 글이면 항목이 없고, 다시 돌려도 결과가 같다.
- **확인:** `cd apps/web && npx vitest run src/lib/number-reading.test.ts`. 테스트를 먼저 쓴다(RED→GREEN).
- **파일:** `lib/number-reading.ts`, `lib/number-reading.test.ts`

### 태스크 2: 결정 모델과 보낼 글 (M, 4파일)
- **할 일:**
  - `paragraph-script.ts`에 `Decision`, `Paragraph.fixes`를 더한다.
  - 다음 함수를 둔다: `decisionsOf(p)`(결정 1: `fixes.text === p.text`이고 지금 항목과 `start`·`end`·`original`이 같은 것만), `spokenOf(p)`(겹치는 결정은 건너뜀), `reviewOf(p)`(항목·결정 짝, 검수 안 한 수, 확인 필요 수), `decide(p, item, decision)`, `undecide(p, item)`, `applyCertain(ps)`, `unreviewedCount(ps)`.
  - 결정 2의 곳들을 `spokenOf`로 바꾼다.
  - `studio-draft.ts`의 `readWork`가 `fixes`를 검사해 읽는다(모양이 틀리거나 무효면 뺀다). `checkedWork`의 비교 규칙을 따른다.
- **수용:**
  - 스펙 10절의 `paragraph-script`·`studio-draft` 항목.
  - `paragraphRequest` 글이 발음용 대본이다. 결정이 없으면 요청·조합 키가 지금과 바이트까지 같다.
  - 겹치거나 지금 항목과 어긋난 낡은 결정은 무시되고, 그때 요청 글은 원문과 같다(테스트).
  - 자동 태그 대상 길이 검사는 원문 기준이다(`paragraph-autotag.ts` 98·127 같은 규칙, 다른 막는 이유는 그대로).
  - 예전 작업(fixes 없음)을 그대로 읽는다.
- **확인:** `npx vitest run src/lib/paragraph-script.test.ts src/lib/studio-draft.test.ts src/lib/make-all.test.ts`, `pnpm check-types`
- **파일:** `lib/paragraph-script.ts`(+test), `lib/studio-draft.ts`(+test), `lib/make-all.ts`(76·544), `lib/paragraph-autotag.ts`(98·127)

### 체크포인트 A
- vitest 전체, `pnpm check-types`, 바꾼 파일 biome. 화면 변경은 아직 없다.

### 태스크 3: 문단 카드 (M, 3파일)
- **할 일:**
  - 카드 글자 수 줄에 검수 상태("숫자 N개 검수 안 함 · 검수하기" / "숫자 검수 끝 · 다시 보기")를 더한다.
  - 원문과 다를 때만 읽기 전용 발음용 대본 줄을 보인다. 바뀐 부분은 강조한다(`<mark>` 또는 토큰 배경).
  - 글자 수는 `spokenOf` 기준이다. 원문과 다르면 "발음용 대본 N자"로 쓴다("보낼 글"은 기존 화면에서 받지 않는 태그를 뺀 글이라 쓰지 않는다).
  - 문구는 `studio-text.ts`에 둔다.
- **수용:** 항목이 없는 문단은 전과 같다(DOM 차이 없음). 상태 줄 버튼이 provider의 `openReview(paragraphId)`를 부른다.
- **파일:** `components/paragraph-card.tsx`, `lib/studio-text.ts`, `components/paragraph-provider.tsx`(openReview 상태만)

### 태스크 4: 숫자 검수 창 (M, 4파일)
- **할 일:** `components/number-review.tsx`를 만든다.
  - 문단 순서 항목 목록, 한 항목 집중 화면, "남은 N/M", 문단 번호와 앞뒤 문맥.
  - 선택지: 제안 읽기들, 원문 유지, 직접 입력, AutoTag 자리(태스크 5).
  - 확인 필요 표시와 이유. 적용·다음·이전·되돌리기, 확실한 것 모두 적용(undoable), 발음용 대본 복사(클립보드, 성공·실패 알림).
  - 작업 띠의 "숫자 검수 N" 버튼은 `paragraph-studio.tsx`의 자동 태그 버튼 옆에 둔다.
  - 만들기 중에는 적용과 확실한 것 모두 적용을 잠근다(`paragraph-studio`의 `locked`를 넘긴다, 결정 5).
- **수용:**
  - 스펙 5.2절.
  - 만들기 중 적용이 잠긴다(QA 시나리오에도 넣는다).
  - 키보드: 열기, 선택, 입력, 다음, Esc. Esc로 닫으면 연 버튼으로 포커스가 돌아간다.
  - 직접 입력이 비면 적용할 수 없다.
- **파일:** `components/number-review.tsx`, `components/paragraph-provider.tsx`, `components/paragraph-studio.tsx`, `lib/studio-text.ts`

### 태스크 5: AutoTag 참고 후보 (S, 3파일 + lock)
- **할 일:**
  - `apps/web`에 `@neosapience/typecast-autotag@1.14.1`을 정확한 버전으로 더한다(`pnpm --filter web add -E`). 위임: `prokit-implementer`(파일 `apps/web/package.json`·`pnpm-lock.yaml`을 Main이 명시해 배정). 설치 뒤 확인할 것: 패키지 `scripts`에 install 계열(preinstall·install·postinstall)이 없는지, lock의 integrity가 있는지, `dist/index.d.ts`의 export 이름, `dist`에 `fetch`·`XMLHttpRequest`·`WebSocket` 호출이 없는지(grep).
  - `lib/autotag-reading.ts`: 동적 import, 항목 글 → 후보 또는 null. 실패하면 null이다. 테스트는 모듈 mock으로 성공·실패·같은 글 세 경우를 본다.
  - 검수 창은 열 때 한 번 불러와 항목별 후보를 보인다. 고르면 `manual` 결정이 된다.
- **수용:**
  - 첫 화면(`/studio`) 묶음에 AutoTag 코드가 없다. 빌드 출력이나 네트워크에서 창을 열 때만 청크를 받는지 확인한다.
  - 불러오기와 호출 실패는 `vi.mock` 단위 테스트로 증명한다(null, 창 동작). 브라우저 QA 기준은 "앱이 `console.error`를 부르지 않음"이다. 청크 실패를 실제로 만들면 브라우저가 네트워크 오류를 남기기 때문이다.
  - 창을 연 동안 AutoTag가 내는 외부 요청이 0건이다(네트워크 확인).
- **파일:** `apps/web/package.json`, `pnpm-lock.yaml`(prokit-implementer), `lib/autotag-reading.ts`(+test), `components/number-review.tsx`(prokit-ui-builder)

### 태스크 6: 만들기 전 미검수 확인 (M, 4파일)
- **할 일:**
  - `make-all.ts`의 계획에 만들 문단들의 `unreviewed` 합을 더한다. `planned` 이벤트에서 `unreviewed > 0`이면 `confirm`으로 간다.
  - 전체 확인 창(`paragraph-confirm.tsx`)과 한 문단 확인 창(`paragraph-bar.tsx`의 `TrialConfirm kind="studio"`)에 경고 줄을 넣는다: "숫자 N개를 검수하지 않았어요. 검수하지 않은 숫자는 원문대로 보내요." 한 문단 수는 `TrialPending.unreviewed?`로 넘긴다. "검수하기"는 `onReview` 콜백(작업실만 넘긴다)으로, 확인을 취소하고(`work.cancel`) 숫자 검수 창을 그 문단에서 연다. 확인 버튼 문구는 미검수가 있을 때 "원문대로 만들기"다.
- **수용:**
  - 스펙 5.3절.
  - 미검수가 없으면 확인 창 조건과 모양이 지금과 같다. T5 성우 캐스팅의 확인 창(`trial-provider.tsx` 429)도 그대로다(boolean 모드 prop 없음).
  - 리듀서 테스트에 `unreviewed`가 있는 계획이 `confirm`으로 가는 경우와 없는 무료 계획이 바로 `making`으로 가는 경우가 있다.
- **파일:** `lib/make-all.ts`(+test), `components/paragraph-make.tsx`, `components/paragraph-confirm.tsx`, `components/trial-confirm.tsx`, `components/paragraph-bar.tsx`, `lib/studio-text.ts`

### 체크포인트 B
- vitest 전체, check-types, biome, `pnpm build`.
- 브라우저 QA는 스펙 11절이다. 가짜 응답을 쓰고 유료 호출은 0회다.

## 3. 문서 (각 행에서)
- ADR 0009 "숫자 읽기: 자체 규칙 엔진 + AutoTag 참고 후보"(domain-modeling ADR 형식).
- `docs/domain/project.md`의 작업실 절: 숫자 검수 창, 문단 `fixes`, 발음용 대본을 보낸다는 것.
- 브리프 `docs/briefs/studio.md` T11 절(브리프 행).
- 백로그(닫을 때): 드라마 숫자 교정, 결정 재매칭, 프리셋 교정 모드(P1-07에 더함), 생성 기록에 원문 보관(T12 메모).

## 4. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| AutoTag의 export 이름이나 한국어 옵션이 문서와 다름 | 낮음 | 태스크 5에서 설치판 `dist/index.d.ts`를 먼저 읽는다. 안 맞으면 Korean 모듈의 `autoTag`를 직접 부른다. 브라우저에서 돌지 않으면 사용자에게 결정 1을 다시 묻는다 |
| 고유어·한자어 단위 표가 모자람 | 중간 | 모르는 단위는 한자어로 읽고 확인 필요로 두지 않는다(스펙 13절). 단위 표는 상수 하나로 모아 늘리기 쉽게 한다 |
| `spokenOf`로 바꾼 일곱 곳 말고도 `p.text`를 보낼 글로 쓰는 곳 | 높음(돈) | 태스크 2에서 `p.text` 소비자를 grep으로 모두 본다. 결정이 없으면 요청이 바이트까지 같은지 테스트하고, 계획 리뷰와 코드 리뷰에서 확인한다 |
| 무효화가 너무 넓어 태그 넣기 한 번에 검수가 사라짐 | 낮음(V1 수용) | 스펙 7절 재매칭은 백로그. QA에서 관찰한다 |
| 결정 저장으로 localStorage 크기 증가 | 낮음 | 읽을 때(`readWork`) 무효 fixes를 거른다. 문단마다 fixes 하나라 크기는 많아야 두 배다(200문단 × 2,000자 상한) |
