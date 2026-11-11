# T10-b 문단 작업실 편의 — 구현 계획

- 스펙: [T10 스펙 17절](T10-paragraph-studio.md#17-t10-b-상세-2026-11-11) (사용자 확인 2026-11-11). 이 계획이 스펙과 다르게 정한 것은 아래 "스펙 조정"에 적고 스펙 17절도 함께 고친다.
- 두뇌: agent-skills(`planning-and-task-breakdown`으로 이 문서, 구현은 `incremental-implementation` + `test-driven-development`). 과설계 방지: ponytail. UI: impeccable.
- 대조표: `tasks/todo.md` F 라운드 "T10-b 문단 작업실 편의". 서버·DB를 바꾸지 않으므로 6~16행(스키마·API·격리 테스트)은 N/A다. 하네스 행(33~39)은 작업 트리의 `.claude/settings.json` `env` 변경(사용자가 넣은 것, 이 라운드 변경 아님) 때문에 붙었다. 라운드를 닫기 전에 사용자에게 `.claude/settings.local.json`으로 옮길지 묻고, 옮기지 않으면 H 행을 그 파일 기준으로 채운다.
- 계층: 모두 `apps/web`(화면 계층). 순수 함수(`lib/*.ts`)도 화면 계층이라 구현은 `prokit-ui-builder`에 맡긴다. Main은 브리프·DESIGN.md·문서·검수만 한다.
- 계획 리뷰 1회차(2026-11-11): changes-required, max=medium, 지적 12개를 모두 반영해 이 판을 썼다(2.1·2.2·2.3·2.4·2.5·2.6·4절).
- 계획 리뷰 2회차(2026-11-11): changes-required, max=medium(카드 붙여 넣기 지금 카드 규칙), 1회차 12개 중 11 해결·1 부분. 새 지적 6개를 반영했다(2.3·2.4·2.5·4절).
- 계획 리뷰 3회차(2026-11-11): changes-required, max=medium(카드 붙여 넣기 자리 계산 200개), 2회차 6개 중 5 해결·1 부분. 새 지적 4개를 반영했다(2.3, 태스크 3, 스펙 17절 머리).
- 구현 중 조정(29행 ponytail-review, 2026-11-11): 재생 문단 id는 `PlayingProvider`(paragraph-playing.tsx) 대신 `StudioBody`의 상태를 props로 내린다(얻는 것이 없는 컨텍스트라 지움). 화자 지우기의 `dismissUndo`는 `ParagraphsApi.undoable`(화자 되돌리기 알림이 열린 알림을 대신, 알림은 늘 하나)로 바뀌었다. 잠긴 아이콘 단추는 `locked-icon-button.tsx` 하나로 묶었다. 아래 2.2·2.5·태스크 5·7의 해당 줄은 이 조정이 대신한다.
- 계획 리뷰 4회차(2026-11-11): approve, max=low, 통합 수용. low 2개(커서 앞 글이 빈 카드 문구, room 0 범위)를 반영했다.

## 1. 개요

음성 작업실에 셋을 더한다. 붙여 넣은 대본의 `이름: 대사`를 화자로 읽어 화자마다 성우를 정하는 것, 문단을 골라 한 번에 바꾸는 고르기 모드, 이어 듣기 중 재생 문단 강조와 이전·다음 문단 이동이다. 서버 요청 모양(`{ provider, voiceId, text, settings }`)과 조합 키는 그대로라 저장된 결과를 잃지 않는다.

## 2. 설계 결정

### 2.1 실제 성우 한 곳: `voiceOf`에 화자 층을 넣고 `followOf`를 더한다
- `Work`에 `speakers?: Speaker[]`(`{ name: string; voice: VoiceSetup | null }`), `Paragraph`에 `speaker?: string`을 더한다(`lib/paragraph-script.ts`). 둘 다 선택 칸이라 `BLANK_META`·`migrateV1`·기존 테스트 고정값은 바꾸지 않아도 된다.
- `followOf(p, work)`: 문단이 자기 성우가 없을 때 따르는 성우. `speakerVoice(p, work) ?? work.defaultVoice`. 목록에 없는 화자 이름은 화자 없음으로 본다.
- `voiceOf(p, work) = p.voice ?? followOf(p, work)`. 이것을 부르는 곳(`sameVoice`·`blankFor`·`paragraphRequest`·`blockOf`·`ownSettings`·make-all `fillOf`·`madeOf`·`makePlan`·autotag)은 고치지 않아도 화자를 따른다. 확인 창 예상 사용량·상태·찾기·받기·실제 요청이 모두 `paragraphRequest` → `voiceOf`라 돈이 걸린 경로는 한 곳이다(리뷰 확인). 전체 만들기는 확인 때 고정한 요청을 보내므로 진행 중 화자 성우를 바꿔도 과금 내용은 바뀌지 않는다(`paragraph-make.tsx:155`).
- **`voiceOf`를 거치지 않는 곳**을 `followOf`로 바꾼다(태스크 4, 리뷰가 grep으로 대조):
  - `paragraph-studio.tsx` 열린 카드 설정(`open.voice ?? meta.defaultVoice`, :390)과 카드 `saved`·`family` 계산(:455)
  - `paragraph-card.tsx` `defaultVoice` 프롭 → `follow` 프롭(따르는 성우). 표식 칩 `chipsOf(p.voice, follow)`(:735-742), 회색·굵은 이름, '기본 따르기' 문구(화자가 있으면 '화자 따르기')
  - `paragraph-paste-dialog.tsx` 최대 글자(:77, 2.3의 화자별 상한), `voice-picker-dialog.tsx` 따르기 문구(:137), `paragraph-provider.tsx` `hasVoice`(:491)
  - 문구·알림: `paragraph-provider.tsx` `tellDropped`(:448, 화자 성우만 빠져도 알리고 저장), `studio-text.ts` `voicesDropped`(:200, 화자 수 인자), `voiceLabel`(:106, '화자를 따름' 갈래, 카드 aria :841), `autoTagOwnNote`(:397)
- 고치지 않는 곳(근거): `make-all.ts` `fillOf`는 이미 `voiceOf`를 거친다. 레일 `voiced`(:393)는 기본 성우 설정 시트의 조건이라 따르는 성우와 상관없다.
- 쉼은 화자와 상관없다(`p.gap ?? work.gap` 그대로).

### 2.2 화자 목록은 더하기만 한다 (되돌리기를 문단 배열 하나로)
- 일괄 동작과 붙여 넣기의 되돌리기는 지금 `edit(fn, { message })`의 알림 하나를 그대로 쓴다. 이 알림은 문단 배열만 되돌린다.
- 그래서 붙여 넣기('바꾸기'·'덧붙이기'·카드 안 붙여 넣기)는 화자 목록에 **없는 이름만 더하고 지우지 않는다**.
- 화자 지우기는 문단이 0개인 화자만 할 수 있다(단추는 잠기고 "문단 N개가 이 화자예요"를 단다). 화자를 문단에서 떼려면 고르기 → '화자 없음'(되돌릴 수 있음)을 쓴다.
- **화자를 지우면 열린 되돌리기 알림을 닫는다.** `ParagraphsProvider`가 알림을 닫는 함수(`dismissUndo`)를 내보낸다. 그래서 '화자 없음 → 화자 지우기 → 되돌리기'로 목록에 없는 화자 이름이 문단에 돌아오지 않는다. 그래도 목록에 없는 이름은 `followOf`·`readWork`가 화자 없음으로 다룬다.
- 화자 목록과 화자 성우는 `WorkProvider`의 `meta`(`changeMeta`)에 둔다. 목록 바꾸기는 되돌리기 알림을 띄우지 않는다(기본 성우 바꾸기와 같다).
- **상한 20명은 기존 목록 ∪ 새 이름으로 센다.** 넘으면 붙여 넣지 않고 "화자는 20명까지예요. 문단이 없는 화자 N명을 지우면 넣을 수 있어요"처럼 출구를 단다(N이 0이면 앞 문장만).

### 2.3 붙여 넣기 해석
- `lib/script-speaker.ts`(새): `speakerLine(row): { name: string; text: string } | null`. 화자 줄이면 이름(`normalizeText`)과 콜론 뒤 글(원문 그대로)을, 아니면 null을 돌려준다. 드라마 `PASTE_LINE`·이름 규칙(글자 1+, `DRAMA_NAME_MAX` 20)과 주소 제외(`:` 바로 뒤 `//`)를 한 곳에 둔다. 드라마 `parsePaste`가 이 함수를 쓰게 바꾸고 대사 정리(`normalizeText`)는 드라마 쪽에서만 한다(주소 줄 회귀 수정). 작업실은 이름 없는 줄을 원래 줄 그대로 쓰므로 화자 없는 대본의 글(곧 조합 키)이 T10-a와 같다.
- `lib/paragraph-script.ts`: `pasteToParts(raw, maxOf, room)` → `{ parts: { text: string; speaker?: string }[]; names: string[]; extra: number }`. `maxOf(speaker?: string) => number`는 그 화자가 따르는 성우의 상한이다(화면이 `followOf`로 셈, 목록에 없는 새 이름이면 기본 성우의 상한). 빈 줄 덩어리 → 덩어리 안 화자 줄마다 새 문단 → 이름 없는 줄은 앞 문단에 줄바꿈으로 → 그 문단 화자의 상한으로 `splitLong`. 빈 줄 경계는 늘 새 문단을 시작한다. 덩어리의 첫 화자 줄 앞 줄들(덩어리 전체가 이름 없는 경우 포함)은 앞 덩어리의 마지막 화자를 이은 문단 하나가 되고, 첫 덩어리면 화자가 없다. 화자 줄이 없으면 결과 글은 지금 `pasteToTexts`와 같다(NFC가 아닌 입력 포함).
- `pasteToTexts`는 지운다(소비자 둘 다 `pasteToParts`로 옮긴다). 기존 테스트는 `pasteToParts(...).parts.map(p => p.text)`로 옮겨 화자 없는 대본의 결과를 고정한다(스펙 17.5-5).
- 카드 안 붙여 넣기(`pasteAt`): **화자 줄은 늘 문단의 처음이다.**
  - 가로채기: 붙여 넣은 글이 조각 2개 이상(빈 줄 덩어리 또는 화자 줄로 나뉨)이거나, 지금 카드의 커서 앞 글이 비어 있고 첫 줄이 화자 줄일 때만 가로챈다. 그 밖(카드 글 가운데 붙여 넣는 `시간: 3시` 같은 한 줄)은 지금처럼 null을 돌려 브라우저 기본 붙여 넣기로 둔다.
  - 지금 카드: 커서 앞 글이 비어 있고 첫 조각이 화자 조각이면 지금 카드가 그 조각이 된다. 화자를 그 이름으로 하고 자기 성우를 비워 화자를 따른다(화자 카드 규칙과 같다). 커서 앞 글이 있으면 지금 카드는 화자·성우를 그대로 두고, 첫 화자 조각부터 새 카드가 된다.
  - 새 카드: 쉼은 지금 카드를 잇는다. 화자 조각으로 생긴 카드는 자기 성우 없이 그 화자를 따른다. 화자 없는 조각으로 생긴 카드는 지금 카드의 화자와 성우를 잇는다.
  - 커서 뒤 글은 마지막 조각에 붙고 그 조각의 화자를 따른다.
  - 상한: 화자 조각은 그 화자가 따르는 성우의 상한, 화자 없는 조각(`maxOf(undefined)`)은 지금 카드의 `voiceOf` 상한이다(지금 `paragraph-studio.tsx:300-306`과 같다).
  - 자리(문단 200개): 첫 조각이 지금 카드에 합쳐질 때(커서 앞 글에 붙거나, 커서 앞 글이 빈 지금 카드가 첫 화자 조각이 될 때)만 조각 수 room + 1까지 받는다(T10-a 동작 그대로: 200장이면 첫 조각만 지금 카드에 넣고 `pasteFull(extra)`). 커서 앞 글이 있고 첫 조각이 화자 조각이면 모든 조각이 새 카드라 room개까지다. 이때 room이 0이면 나누지 않고 `PARAGRAPH_TEXT.paragraphsMax` 알림을 띄우며 기본 붙여 넣기를 막는다(paste가 true). 그래서 문단이 200개를 넘지 않는다(`readWork`가 200개 뒤를 자르는 일이 없다).
  - 알림 문구: 조각 하나만 가로챈 경우(커서 앞 글이 비고 첫 줄이 화자 줄, 카드에 글이 있어도 커서가 맨 앞이면 같다)는 '화자를 정했어요 · 민수'다(이름 뒤 조사 없음, 브리프 9절). 문단 상한 문구(`pasteFull`)는 실제로 남긴 조각이 있을 때만 쓴다.
  - 화자 상한(2.2)을 넘으면 paste가 true를 돌려(기본 붙여 넣기를 막고) 상한 알림만 띄운다. `민수: …` 줄이 카드 글에 그대로 들어가지 않는다.
- 붙여 넣기 창의 미리 보기 줄에 찾은 화자를 보인다(예: '화자 2명: 민수, 지아'). `참고:`·`1단계:` 같은 줄이 화자로 읽힌 것을 넣기 전에 볼 수 있게 한다. 새 창이나 설정은 만들지 않는다.

### 2.4 고르기 모드
- 고른 문단 id 집합은 `ParagraphList`(`paragraph-studio.tsx` :381, `openId`·`tagTarget`과 같은 자리)의 상태로 두고, 고르기 막대도 그 안에서 그린다. 카드에는 `selecting`·`selected` 원시 프롭으로 내린다(카드는 `memo`·프롭만 읽는다). `WorkProvider`나 새 Provider에 두지 않는다(체크마다 모든 `useWork` 소비자가 다시 그려지지 않게).
- 일괄 작업은 순수 함수(`lib/paragraph-script.ts`, 이름은 GLOSSARY '일괄 작업(Batch Edit)'을 따른다): `batchVoice(ps, ids, setup)`, `batchFollow(ps, ids)`, `batchSpeaker(ps, ids, name | undefined)`, `batchGap(ps, ids, gap)`, `batchRemove(ps, ids)`(모두 지우면 빈 카드 1장, 지금 `removeAt` 규칙). 화면은 `edit(ps => batchX(...), { message })` 한 번 → 되돌리기 알림 한 번.
- 성우·설정은 `VoicePickerDialog`(담은 성우·프리셋)를 연다. `PickTarget`에 `{ kind: "speaker"; name }`·`{ kind: "selection"; count }` 갈래를 더해 창 머리 문구('화자 민수 성우', '고른 문단 N개 성우')와 따르기 단추를 정한다(boolean 프롭은 더하지 않는다). 프리셋을 고르면 그 설정(속도 포함)이 함께 들어간다.
- 잠금: `make.phase`가 `idle`·`stopped`가 아니면(지금 `locked` 규칙) 동작 단추를 잠그고 이유를 단다. 지운 문단에 고른 표시가 남지 않게 고른 집합은 지금 문단 id로 거른다.

### 2.5 이어 듣기 강조
- `Shown`의 join 갈래에 `ids: string[]`·`spans: {start,end}[]`·`key: string`(잇기 키: `joinOf`가 캐시에 쓰는 문단 id·찾은 결과 id·쉼 줄)을 더한다(빈 문단은 이미 빠짐).
- 잇기 키 함수 `joinKeyOf(items)`(receivePlan items 모양 `{ id, found: { id }, gap }`을 받음)를 `make-all.ts`에 꺼낸다. provider `joinOf`(paragraph-provider.tsx:649-651)는 캐시 키로 이 함수만 부른다.
- **낡음:** 막대가 이미 셈하는 `receive`(`paragraph-bar.tsx:357-364`의 useMemo, 새로 부르지 않음)가 `ok:false`이거나 `joinKeyOf(receive.items) !== shown.key`이면 이어 듣기 파일이 낡은 것이다. 그때는 재생 문단 강조를 끄고(null) 이전·다음 단추와 '문단 N 재생 중'을 숨긴다. 소리는 지금처럼 계속 재생된다(지금 동작 그대로, 스펙 17.3 문구를 이에 맞게 고친다).
- `lib/sound-join.ts`: `spanIndexAt(spans, t)`(쉼 구간은 앞 문단), `seekOf(spans, i, dir)`(첫 문단 '이전'은 0, 마지막 '다음'은 null).
- 재생 문단 id는 `PlayingProvider`(state + children 전용 컴포넌트, 새 파일 `components/paragraph-playing.tsx`)에 둔다. `StudioBody` 안에서 목록과 막대만 감싼다. `WorkProvider` 상태에는 넣지 않는다. 값이 바뀔 때만 set하고(timeupdate마다 같은 id면 set하지 않음), 목록은 그 id 하나로 해당 카드의 `playing` 프롭만 바꾼다(vercel-react-best-practices `rerender-defer-reads`·`rerender-derived-state`).
- 카드 강조는 만드는 중 강조(`aria-current="step"`·`bg-primary-subtle`)와 다른 표식(브리프에서 정함)을 쓴다. 막대: 플레이어 옆 '이전 문단'·'다음 문단', '문단 N 재생 중' 링크(`showParagraph`).

### 2.6 만들지 않는 것 (계획에서 더함)
- 큰 파일 나누기(백로그 T10-01): 이번 변경은 카드·스튜디오에 프롭과 작은 조각을 더하는 정도라 미룬다. 29행 공통화 점검에서 다시 본다.
- 컴포넌트 렌더 테스트(jsdom): 지금 web 테스트는 순수 함수만이다. 화면 동작은 브라우저 QA(31행)로 본다.
- '바꾸기'가 문단 0개 화자를 저절로 정리하는 일: 상한 출구 문구(2.2)로 대신한다.

### 2.7 스펙 조정 (사용자에게 알리고 스펙 17절을 고친다)
1. 화자 지우기는 문단 0개인 화자만. 붙여 넣기 '바꾸기'도 화자 목록을 지우지 않고 없는 이름만 더한다(2.2). 이유: 되돌리기를 문단 배열 하나로 유지.
2. 일괄 '성우·설정'은 성우 고르기 창(담은 성우·프리셋)으로 한다. 설정 칸 하나씩 일괄 바꾸기는 만들지 않는다. 속도는 프리셋으로 함께 바꾼다.
3. 일괄 되돌리기는 문단(성우·화자·쉼·지우기)만 되돌린다. 화자 목록은 일괄 동작이 바꾸지 않는다.
4. (리뷰 반영) 이어 듣기 파일이 낡으면 강조·이전·다음만 끄고 소리는 계속 재생한다(지금 동작). 화자 상한은 기존 목록 ∪ 새 이름으로 센다. 화자 줄은 늘 문단의 처음이고, 화자 줄로 생긴 카드(빈 지금 카드 포함)는 자기 성우 없이 화자를 따른다. 붙여 넣기 창 미리 보기에 찾은 화자를 보인다.

## 3. 재사용과 설정 (3행 [design])
- 기존: `lib/paragraph-script.ts`(모델·`voiceOf`·붙여 넣기)와 소비자 make-all·autotag·studio·card·rails·paste-dialog·picker·provider·studio-text, `lib/drama-view.ts` `parsePaste`(드라마 붙여 넣기 창), `lib/studio-draft.ts` `readWork`·`droppedVoices`(임시 작업), `lib/sound-join.ts` `joinTimeline`·`spansOf`, `make-all.ts` `joinOf` 캐시 키, `paragraph-provider.tsx` `edit(fn,{message})` 되돌리기 알림, `VoicePickerDialog` `PickTarget`, `showParagraph`, `packages/ui` Checkbox·DropdownMenu·Sheet(있는 것만).
- 결정: 줄 해석은 드라마와 공용 함수로 추출(같은 규칙·같은 변경 이유, 소비자 2곳). 실제 성우는 `voiceOf` 한 곳 + `followOf`. 되돌리기·성우 고르기 창·포커스 이동은 그대로 재사용하고 `PickTarget`만 갈래를 더함. 잇기 키는 `joinOf`에서 꺼내 낡음 판정과 공유. 고른 집합은 `ParagraphList` 상태(Provider 추가 없음), 재생 id만 목록·막대를 감싸는 작은 Provider(리렌더 범위).
- 설정: 환경 변수·설정 변경 없음(`apps/web/.env.schema` 변수 이름 확인, `turbo.json`·`next.config` 손대지 않음). 임시 작업 키 `tts-pilot:studio:v2:work` 그대로, 새 칸은 선택 칸.
- 검증: web vitest(paragraph-script·studio-draft·drama-view·sound-join·make-all 기존 테스트 통과 + 새 테스트), `pnpm check-types`, biome(바꾼 파일 + 전체 기준 오류 10과 같음), `pnpm build`, 드라마 붙여 넣기 브라우저 회귀, 작업실 QA(스펙 17.7).

## 4. 태스크

순서는 의존 순서다. 1~4는 순수 함수와 연결(화면 모양 변화는 문구뿐), 5~7은 브리프(18행) 확정 뒤 화면이다. 모든 태스크는 `prokit-ui-builder`에 맡기고(읽을 스킬: `vercel-react-best-practices`, 화면 태스크는 `vercel-composition-patterns`·`shadcn`·impeccable `reference/craft-floor.md`, 붙여 넣기·성우는 `tts-provider`), 테스트 먼저(`test-driven-development`)로 한다. 태스크마다 커밋하지 않는다(라운드 끝 커밋). 확인 명령의 테스트는 `pnpm --filter web test`다.

### 태스크 1: 줄 해석 공용 함수 (S)
- 할 일: `lib/script-speaker.ts`의 `speakerLine`, 드라마 `parsePaste`가 쓰게 바꾸기.
- 수용: 콜론·전각 콜론, 글자 없는 이름(`12:30`), 21자 이름, 주소 줄(`https://…`)이 화자가 아님. 드라마 기존 붙여 넣기 테스트 모두 통과.
- 파일: `lib/script-speaker.ts`(+test), `lib/drama-view.ts`, `lib/drama-view.test.ts`.

### 태스크 2: 화자 모델과 실제 성우 (M)
- 할 일: `Speaker`·`Work.speakers?`·`Paragraph.speaker?`, `followOf`, `voiceOf` 갱신, `speakersAdd(list, names)`(상한 판정 포함), `speakerParagraphCount`. `readWork`가 두 칸을 읽는다: 화자 이름은 `speakerLine`과 같은 규칙, 중복 제거, 20명 상한, 보관함에 없는 화자 성우는 null, 목록에 없는 문단 화자는 버림. `droppedVoices`가 빠진 화자 성우 수를 센다. provider `tellDropped`가 화자 성우만 빠져도 알리고 저장, `voicesDropped` 문구에 화자 수.
- 수용: 스펙 17.5-3·4·6. `writeWork` → `readWork` 왕복으로 화자가 남음. **화자 없는 작업의 `paragraphRequest`가 T10-a와 같음**(조합 키 불변). **`makePlan`의 사용량이 화자 성우의 공급자로 잡힘**(돈 경로 테스트 1개).
- 파일: `lib/paragraph-script.ts`(+test), `lib/studio-draft.ts`(+test), `lib/make-all.test.ts`, `components/paragraph-provider.tsx`(tellDropped), `lib/studio-text.ts`(voicesDropped).

### 태스크 3: 붙여 넣기 → 문단과 화자 (M)
- 할 일: `pasteToParts`(화자별 상한), `pasteToTexts` 지우기, `pasteAt` 가로채기 조건과 화자 카드 규칙(2.3). 붙여 넣기 창(바꾸기·덧붙이기)과 카드 붙여 넣기가 이름을 목록에 더함(provider에 `setSpeakers`), 상한 안내(2.2).
- 수용: 스펙 17.5-1·2·5, 17.1 문단 나누기 규칙(덩어리 사이 화자 잇기), 200문단·화자별 상한, 빈 카드에 빈 줄 없는 화자 대본을 붙여 넣으면 나뉘고 지금 카드가 첫 화자가 됨(자기 성우 비움), 커서 앞 글이 있으면 지금 카드는 그대로, 카드 글 가운데 `시간: 3시` 한 줄은 가로채지 않음, 화자 없는 대본 결과가 T10-a와 같음(NFC 아닌 입력 포함), 붙여 넣기 창 미리 보기에 화자 이름, '설명\n민수: 안녕' 덩어리의 머리 줄 규칙, 200장에서 커서 앞 글 + 화자 줄 붙여 넣기 → 200장 유지·상한 알림, 빈 카드나 글이 있는 카드의 맨 앞(커서 0)에 화자 한 줄 → '화자를 정했어요'(200개 문구 없음), 화자 상한을 넘는 카드 붙여 넣기 → 글이 들어가지 않고 알림만.
- 파일: `lib/paragraph-script.ts`(+test), `components/paragraph-paste-dialog.tsx`, `components/paragraph-studio.tsx`(paste 동작), `components/paragraph-provider.tsx`(speakers 상태·저장), `lib/studio-text.ts`(문구).

### 태스크 4: 따르는 성우 연결 (M)
- 할 일: 2.1의 `voiceOf` 우회 지점을 `followOf`로. 카드 `defaultVoice` → `follow` 프롭, '화자 따르기', `voiceLabel`·`autoTagOwnNote`의 화자 갈래, `hasVoice`.
- 수용: 화자 성우가 있는 문단의 이름·칩·막힌 이유·최대 글자·접근 이름이 화자 성우 기준. 화자 없는 작업은 T10-a와 같은 화면(스크린샷 비교).
- 파일: `components/paragraph-studio.tsx`, `components/paragraph-card.tsx`, `components/voice-picker-dialog.tsx`, `components/paragraph-paste-dialog.tsx`, `components/paragraph-provider.tsx`(hasVoice), `lib/studio-text.ts`(+test). (각 1~3줄 바꾸기라 한 태스크로 둔다.)

### 체크포인트 A (태스크 1~4 뒤)
- web 테스트·타입·바꾼 파일 biome·build 통과. 화자 없는 작업 화면이 T10-a와 같음. 드라마 붙여 넣기 회귀 없음.

### 태스크 5: 화자 목록과 카드 표식 (M, 브리프 뒤)
- 할 일: 레일 '작업 설정'의 화자 칸(`WorkSettings`·1단 `WorkBand`): 이름·성우(또는 '기본 성우 따름')·문단 수·성우 고르기·비우기·지우기(0문단만, 지우면 `dismissUndo`). 카드 머리줄 화자 표식, ⋯ 메뉴 '화자' 하위 항목. `PickTarget` speaker 갈래.
- 수용: 스펙 17.1 화면 줄, 17.5-3·4, 화자 0명이면 칸 없음, '화자 없음 → 화자 지우기 → 되돌리기' 뒤 알림이 닫혀 있음.
- 파일: `components/paragraph-rails.tsx`, `components/paragraph-card.tsx`, `components/paragraph-provider.tsx`(setSpeakerVoice·removeSpeaker·dismissUndo), `components/voice-picker-dialog.tsx`, `lib/studio-text.ts`.

### 태스크 6: 고르기 모드와 일괄 작업 (M, 브리프 뒤)
- 할 일: `batch*` 순수 함수(+test), `ParagraphList`의 고른 집합과 고르기 막대(N/M, 모두 고르기·풀기, 끝내기, Esc), 카드 체크 상자, 동작(성우·따르기·화자·쉼·지우기), 잠금 이유. `PickTarget` selection 갈래.
- 수용: 스펙 17.5-7·8·9, 키보드만으로 고르기·동작.
- 파일: `lib/paragraph-script.ts`(+test), `components/paragraph-studio.tsx`, `components/paragraph-card.tsx`, 새 `components/paragraph-select-bar.tsx`, `components/voice-picker-dialog.tsx`, `lib/studio-text.ts`.

### 태스크 7: 이어 듣기 강조와 이전·다음 (M, 브리프 뒤)
- 할 일: `joinKeyOf`(make-all, +test), `Shown` join에 ids·spans·key, `spanIndexAt`·`seekOf`(+test), `PlayingProvider`, `BarPlayer` timeupdate·이전·다음·'문단 N 재생 중' 링크·낡음 판정, 카드 재생 표식.
- 수용: 스펙 17.5-10, 대본을 고치면(잇기 키가 바뀌면) 강조·이전·다음이 사라짐, 200문단에서 재생 중 입력 지연이 T10-a 측정(32~48ms)보다 나빠지지 않음.
- 파일: `lib/make-all.ts`(+test), `lib/sound-join.ts`(+test), `components/paragraph-provider.tsx`, `components/paragraph-bar.tsx`, 새 `components/paragraph-playing.tsx`, `components/paragraph-studio.tsx`(카드에 playing 프롭), `components/paragraph-card.tsx`.

### 체크포인트 B (태스크 5~7 뒤)
- 스펙 17.5 수용 기준 1~12, 디자인 리뷰·감사(23~26행), 런타임 확인(21·28행), QA(31행).

### 태스크 8: 문서 (Main)
- `docs/domain/project.md`(음성 작업실 기능·화면, 용어 칸 '화자'·'일괄 작업'), `DESIGN.md`(27행, 바뀐 컴포넌트가 있으면 merge), 브리프 T10-b 절(18행)과 `docs/briefs/studio.md`의 '역할' → '화자'. (스펙 3·17절 조정과 GLOSSARY '일괄 작업'은 계획 리뷰 때 고쳤다.)

## 5. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| `voiceOf` 우회 지점을 놓쳐 화자 성우와 화면 표시가 어긋남 | 중간(돈 경로는 voiceOf 한 곳이라 표시만) | 2.1 목록(리뷰 grep 대조), 태스크 2 makePlan 사용량 테스트 |
| 조합 키가 바뀌어 저장된 결과를 잃음 | 높음 | 요청 모양 불변. 태스크 2 '화자 없는 paragraphRequest 동일' 테스트 |
| `readWork`가 새 칸을 버려 새로고침 때 화자가 사라짐 | 중간 | 태스크 2 왕복 테스트 |
| 되돌리기로 목록에 없는 화자 이름이 돌아옴 | 낮음 | 2.2 `dismissUndo` + followOf·readWork의 화자 없음 처리 |
| 재생 강조·고르기가 카드 200장을 다시 그림 | 중간 | 2.4·2.5 상태 위치 + 값 바뀔 때만 set. QA 입력 지연 측정 |
| 드라마 붙여 넣기 동작 변화 | 낮음 | 주소 줄만 바뀜. 드라마 테스트 + 브라우저 회귀 |
| 카드 파일이 더 커짐(1,095줄) | 낮음 | 29행에서 T10-01과 함께 판단 |

## 6. 열린 질문
- 라운드를 닫기 전: 작업 트리의 `.claude/settings.json` `env`(사용자 변경)를 `.claude/settings.local.json`으로 옮길지(사용자 결정).
