# T5 내 문장으로 샘플 듣기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성우 캐스팅에서 내가 쓴 문장을 공급자·모델별 옵션으로 들어 본다. 크레딧이 드는 듣기는 누를 때마다 예상 사용량·남은 크레딧·기본 샘플 안내가 있는 확인 창을 거치고, 같은 성우·모델·설정·문장은 저장한 결과를 크레딧 없이 다시 재생한다.

**Architecture:** `packages/db`에 생성 기록 표 `trial_generation`(오디오 `bytea` 포함)을 더한다. `packages/api`는 화면과 함께 쓰는 순수 설정 모듈(`providers/trial-options.ts`: 모델·범위·기본값·정리·조합 글자·예상 사용량)과 zod 계약(`providers/trial-contract.ts`), 생성 기록 모듈(`trial.ts`: 선점·완료·찾기·목록·지우기), 공급자 셋의 합성 메서드(`synthesize`, 60초, 재시도 없음), 프로시저 여섯(`routers/trial.ts`)을 더한다. 크레딧을 쓰는 길은 `trialCreate` 하나이고, 요청 id 선점과 소유자별 동시 1건을 DB 제약으로 막는다. 화면은 `VoiceCasting` 아래 컨텍스트 하나(`TrialProvider`)가 문장·공급자별 설정·진행 상태·확인 창·결과 `blob:` 주소를 들고, '내 문장' 바(목록 위), 패널 '내 문장 듣기' 구역, 행의 '내 문장 듣기'(격자 셋째 칸)가 그것을 쓴다.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3(React Compiler), oRPC 1.15.4(RPC 프로토콜의 `File` 출력은 multipart로 간다), TanStack Query 5.103.2, zod 4.6.5(`z.file()`), drizzle-orm 1.0.0-rc.4(`bytea`, 부분 유니크 인덱스, `check`), Postgres 18(로컬 5433), vitest 5.0.2, `@neosapience/typecast-js` 0.4.15, `@elevenlabs/elevenlabs-js` 2.70.0, shadcn `base-lyra`(Base UI 1.8.0) `packages/ui`, Tailwind CSS 4, Biome 2.

**Spec:** [T5 스펙](T05-my-sentence-listening.md)(사용자 확인 2026-10-05 "확인, 계획으로", 구속력 있는 정본), [성우 캐스팅 브리프](../../briefs/casting.md) 12절(같은 날 확인), 승인 시안 `.impeccable/mocks/decision/t4-casting-audition.png`(T5 영역), [ADR 0003](../../adr/0003-postgres-cache.md) '듣기 결과', [로드맵 T5](../implementation-roadmap.md), 공급자 사실 `tasks/evidence/T05/research/{typecast,elevenlabs,fish-audio}.md`(2026-10-05 공식 문서 재확인).

**계획 확인:** 사용자 "확정"(2026-10-05). **실행 주체:** Codex로 옮겨 진행(사용자 결정 2026-10-05). Codex 네이티브 `bts-implementer`·`bts-reviewer`(`.codex/agents`)를 쓰고, 이어받기 메모는 장부 '이어받기' 절에 있다.

**실행 방식(4행):** superpowers:subagent-driven-development + test-driven-development, ponytail 모드. 태스크마다 `bts-implementer`가 구현하고 코디네이터(메인 세션)가 확인한다. "코디네이터"라고 적힌 단계는 `bts-implementer`에 맡기지 않는다(`db:generate`·`db:migrate`, shadcn add, `package.json`·lock). 장부는 `.superpowers/sdd/T05-my-sentence-listening-plan/progress.md`이고, T4 장부의 `dispatch-rules.md`·`browser-rules.md`를 이 워크스페이스로 복사해 쓴다.

## Global Constraints

- 커밋은 태스크마다 하지 않는다. 라운드 끝(`bts-dev-cycle` 5절)에 한 번 한다. 태스크 경계는 작업 트리 스냅샷(`git write-tree` 꼴의 tree SHA)으로 장부에 적는다.
- `apps/web/.env`를 읽거나 출력하지 않는다. `packages/db/.env`도 내용을 출력하지 않는다. 테스트 DB URL은 셸에서 `source .superpowers/sdd/T05-my-sentence-listening-plan/tools/testdb.env`로만 넘기고 출력하지 않는다. 증거에는 "로컬 5433 `tts-pilot-app_test`"처럼 호스트·포트·DB 이름만 적는다.
- **공급자를 실제로 부르지 않는다.** 자동 테스트는 `providers/test-utils.ts`의 `useFetchMock`(전역 `fetch` 교체)과 context에 넣는 가짜 공급자로만 한다. 시험 생성(유료)·라이브러리 성우 추가·클론은 자동 테스트와 브라우저 QA에서 하지 않는다. 실제 생성은 사용자 테스트(스펙 12절)에서 건마다 사용자 승인 뒤 메인 세션만 한다.
- 구현 서브에이전트는 개발 서버(`127.0.0.1:3001`)로 어떤 요청도 보내지 않는다(브라우저·curl·fetch·테스트 스크립트의 `/api/rpc/*` 모두, T4 lessons 2026-10-05). 화면 확인은 코디네이터가 흉내 응답으로 한다.
- 로컬 관리자 모드(`AGENTS.md`, 로드맵 2절): 소유자는 서버가 정한 `context.ownerId`에서만 얻고 입력으로 받지 않는다. 공급자 키·DB를 쓰는 코드는 `/api/rpc`의 `protectedProcedure`로만 연다. Server Action·새 Route Handler를 만들지 않는다.
- `providers/trial-options.ts`는 import가 `import type { ProviderId } from "./contract"` 하나뿐이다(zod·SDK·서버 모듈 없음). 화면은 이 파일에서 값과 함수를, `trial-contract.ts`와 `contract.ts`에서는 `import type`만 가져간다(AC19).
- 시험 생성은 자동 재시도하지 않는다. ElevenLabs는 요청 옵션 `maxRetries: 0`, Typecast SDK는 재시도 코드가 없다(설치본 확인), Fish Audio는 `fetch` 한 번. 시간 제한은 60초(`TRIAL_TIMEOUT_MS`)이고 시간 초과·연결 끊김은 `unknown_outcome`이다.
- Fish Audio 요청에는 `model` 헤더를 **늘** 보낸다(빠지거나 틀리면 오류 없이 유료 `s2.1-pro`, 스펙 4절).
- 실패 로그는 한 줄이고 공급자·오류 이름(HTTP는 상태 코드)·필드 이름·DB 오류 코드만 담는다. SDK 오류 객체·응답 본문·헤더·SQL·연결 문자열·사용자 문장을 로그나 `ORPCError`의 `cause`에 넘기지 않는다.
- 공급자 문제는 `UNAUTHORIZED`·`FORBIDDEN`으로 던지지 않는다. 코드와 사유는 스펙 6절 표다.
- 색·간격·반경은 토큰과 Tailwind 기본 눈금만 쓴다. 원시 hex·임의 값(`mt-[13px]`)을 새로 넣지 않는다. 굵기는 `font-normal`·`font-bold` 둘뿐이다. 인터랙티브 요소는 44px 이상(`min-h-11`, `size-11`, 버튼 `size="lg"`)이고 `focus-visible`이 보인다.
- **유료 표식 = `Coins` 아이콘 모양 하나**(앱 전체). 카드·테두리 버튼·확인 창 본문 위에서는 `text-warning`, 채운 청록 버튼 안에서는 글자색이다(경고색과 청록은 명도가 같아 채운 버튼 위에서 보이지 않는다, 계획 리뷰 D19). Fish Audio 무료 모델은 `success` '무료' 배지(좁은 아이콘 버튼은 `AudioLines`, 사용자 결정 U2). 문자열(알림·설명·접근 이름)에는 '▷'를 쓰지 않는다(D22).
- 슬라이더·스위치 채움은 무채색(`foreground`)이고 청록은 포커스에만 쓴다(사용자 결정 U7, DESIGN.md).
- 화면 문구는 브리프 12절·스펙 6절·이 계획 Task 8 `trial-view.ts`의 문구만 쓴다. 구현하는 쪽이 새 문구를 만들지 않는다. 문구는 `-어요` 보이스, 용어는 `GLOSSARY.md`('시험 생성' 화면 이름 '내 문장 듣기', '저장된 결과', '말투 태그', '예상 사용량', '공급자 대기 시각').
- 파일을 고친 뒤 `pnpm exec biome check --write <파일들>`로 포맷한다(탭 들여쓰기). 금지 패턴 grep(hex, `-[` 임의 값, `font-medium`, `font-semibold`) 0.
- 패키지: 앱 `web`, API `@tts-pilot-app/api`, DB `@tts-pilot-app/db`, UI `@tts-pilot-app/ui`. API 테스트 `pnpm --filter @tts-pilot-app/api test [파일]`, web 테스트 `pnpm --filter web test [파일]`. DB 테스트는 `TEST_DATABASE_URL`이 있을 때만 돈다. skipped는 통과가 아니다.
- 개발 서버(백그라운드, `127.0.0.1:3001`)를 끄거나 다시 켜지 않는다. `pkill`·`killall`·`.next` 삭제 금지. `pnpm build`는 메인 세션이 정한 때에만.
- ponytail: 스펙에 없는 추상화를 만들지 않는다. 의도한 한계는 `ponytail:` 주석으로 남긴다.

## Review Focus

- **같은 조합 판정이 흔들릴 때:** 설정 객체의 키 순서, 기본값을 빼고 보낸 입력, 슬라이더 끝자리(0.30000000000000004), 그 모델이 받지 않는 옵션(v4의 스타일), 문장의 NFC·앞뒤 공백, 태그 앞뒤 공백이 다르면 같은 소리인데 다른 조합이 되어 저장된 결과를 놓치고 크레딧을 다시 쓴다. → 한 함수 `comboSignature`(Task 2)가 화면의 '저장된 결과 듣기' 판정과 서버의 조합 키(Task 4) 둘 다를 만든다. Task 2 "같은 소리의 요청은 같은 글자다"·"기본값을 뺀 입력도 같은 글자다", Task 4 "같은 소리의 요청은 같은 조합 키다", Task 6 "목록 항목의 요청은 원래 요청과 같은 조합이고, 그 요청으로 찾으면 같은 결과다"(목록 출력으로 다시 만든 요청의 왕복, 계획 리뷰 E4) 테스트.
- **Fish Audio `model` 헤더가 빠질 때:** 헤더가 없거나 모르는 값이면 오류 없이 유료 모델로 처리돼 무료라고 믿은 듣기가 과금된다. → Task 5 "두 모델 모두 model 헤더를 그대로 보내고 즉석 클론 필드는 보내지 않는다", Task 6 "무료 종료일 뒤 무료 모델은 공급자를 부르지 않고 free_ended" 테스트.
- **만드는 중에 탭·성우를 바꿀 때:** 결과가 지금 고른 성우가 아니라 요청한 성우에 붙어야 한다(그 성우 결과 목록에 한 줄, 다른 성우 목록에는 없음). → 서버는 요청의 `voiceId`로만 저장하고(Task 6 "다른 성우 목록에는 나오지 않는다"), 화면은 요청의 공급자·성우 id로 목록을 무효로 한다(Task 9, 고른 성우를 쓰지 않음). QA S11.
- **결과 오디오 주소가 쌓일 때(재생 중 표시 포함):** `blob:` 주소를 바꾸거나 지우거나 화면을 떠날 때 해제하지 않으면 메모리가 남는다. 같은 결과를 두 번 받아도 주소는 하나다. → Task 8 `lib/blob-urls.ts` "같은 id는 주소 하나, 지우면 해제, 비우면 모두 해제" 테스트, Task 9 언마운트 정리.
- **두 소유자가 같은 요청 id를 쓸 때:** 요청 id 유니크가 소유자별이어야 B의 요청이 A의 기록을 재생(replay)하거나 `request_mismatch`로 막히지 않는다. → Task 6 격리 테스트 "같은 요청 id를 A와 B가 써도 섞이지 않는다".

---

## 읽은 스킬과 계획에 반영한 것

2행 증거다. 외부 스킬은 Read로 `.agents/skills/<이름>/`의 프로젝트 판을 읽었다.

- `bts-db`(+ `references/migration-flow.md`): 스키마는 `packages/db/src/schema/trial-generation.ts`, `schema/index.ts`에서 export. 마이그레이션은 `pnpm --filter @tts-pilot-app/db db:generate`(루트 `pnpm db:*`는 TTY 없는 셸에서 실패), 생성 SQL 검토, 로컬(5433 `tts-pilot-app`)과 테스트 DB(`tts-pilot-app_test`)에 `db:migrate`, 다시 `db:generate`로 `No schema changes`. 시각 컬럼은 `timestamp(…, { withTimezone: true })`. 사용자 소유 표의 `user` 외래 키는 T4와 같이 걸지 않는다(로드맵 T6 메모: 첫 지속 소유 데이터에서 정한다. 결과는 30일 뒤 지워지는 기록이다).
- `supabase-postgres-best-practices`: 식별자 `text`, 시각 `timestamptz`, 값 `jsonb`, 기본키 `uuid`(`defaultRandom`), 오디오 `bytea`(1MB 안팎, TOAST로 행 밖에 저장된다). 동시 1건은 앱 조회가 아니라 **부분 유니크 인덱스**(`where status = 'pending'`)로 막는다. 찾기·목록 쿼리 조건(소유자·조합 키·상태·시각, 소유자·공급자·성우·시각)에 맞춘 복합 인덱스 둘. 값 집합은 `CHECK` 제약(T4 백로그 VC-09를 새 표에는 처음부터).
- `bts-api`(+ `references/ownership-test.md`): 불변식 1·2 → 프로시저 여섯 모두 `protectedProcedure`, 소유자는 `context.ownerId`만. 불변식 3 → 모든 select·update·delete에 `owner_id` 조건, 영향받은 행이 없으면 `NOT_FOUND`. 불변식 4 → 입력 zod(문장 길이, 옵션 범위, 성우 id 글자, uuid), 출력 zod(`z.file()`). 격리 테스트는 실제 Postgres로 두 소유자(A·B)를 context에 직접 넣는다(로그인 전이라 `ownerId`). 불변식 7 → 성우 허용 판정(한 명 소유 예외 확장)이 바뀌므로 security 리뷰 행.
- `tts-provider`: 합성 호출은 `providers/<공급자>.ts`에만. 요청 id 선점 → 공급자 호출 순서, 같은 id 재전송은 공급자를 다시 부르지 않음, 소유자별 동시 1건(부분 유니크), 5분 넘은 진행 중은 '처리 여부 미확인'. 429 대기 시각은 DB(`provider_cooldown`). SDK 자동 재시도 끔. 타임아웃은 `unknown_outcome`. 공급자 요청 본문은 계약 필드로만 서버가 만든다(Fish Audio `references` 보내지 않음). 오디오는 base64가 아니라 `File`. 예상 사용량 단위(글자, Fish Audio UTF-8 바이트). 한 번에 한 오디오, `URL.revokeObjectURL`. 스펙 2절 결정으로 '클론 보이스와 공급자 리소스 소유권' 절의 성우 허용 판정은 한 명 소유 예외로 대신한다(Task 12에서 스킬에 적는다).
- `bts-web`: 변경은 `useMutation(orpc.trialCreate.mutationOptions())`·`trialDelete`, 결과 목록은 `useQuery(orpc.trialList.queryOptions(...))`, 저장된 결과 찾기와 결과 오디오는 oRPC `client`(같은 링크, `/api/rpc`를 fetch로 직접 부르지 않는다). 생성 뒤 `orpc.trialList.key({ input: { provider, voiceId } })`로 무효화. 확인 창의 남은 크레딧은 T2와 같은 키 `orpc.providerStatus.queryOptions({ input: { provider } })`를 `staleTime: 0`으로 새로 읽는다. loading·error 상태를 나눈다(브리프 12절 상태 표). 공식 스킬 연결 가운데 `vercel-react-best-practices`, `next-dev-loop`만 해당한다.
- `vercel-react-best-practices`: `rerender-derived-state-no-effect`(요청·예상 사용량·버튼 상태는 렌더 중 순수 함수), `rerender-move-effect-to-event`(찾기·확인·생성·재생은 이벤트에서), `rerender-no-inline-components`, `client-swr-dedup`(결과 목록은 성우별 키), `bundle-barrel-imports`(계약은 타입만, 설정은 `trial-options`만). 대기 시각 타이머는 행마다가 아니라 컨텍스트에서 공급자별 하나(`useCooldown` 셋).
- `shadcn`(+ `rules/base-vs-radix.md`, `rules/composition.md`): `base-lyra`. 새 프리미티브 Slider·Switch·AlertDialog는 `pnpm --filter @tts-pilot-app/ui exec shadcn add slider switch alert-dialog`(코디네이터, Task 7). Base Slider는 값이 숫자 하나(`value={0.5}`), `onValueChange`는 배열일 수 있어 `as number`로 받는다. AlertDialog에는 제목이 있어야 한다. 하나 고르는 메뉴는 `DropdownMenuRadioGroup`·`DropdownMenuRadioItem closeOnClick`(T4 SortMenu와 같다).
- `bts-ui`(+ impeccable `craft-floor.md`): UI 태스크(10·11) 편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다. 승인 시안의 T5 영역(바, 행 버튼, 결과 자리)과 브리프 12절이 기준이다. 리뷰(critique·audit)는 메인 세션.

## 설치본으로 확인한 것

| 대상 | 확인 결과 | 위치 |
|---|---|---|
| Typecast SDK 0.4.15 TTS | `textToSpeech(request: TTSRequest): Promise<TTSResponse>`, 응답 `{ audioData: ArrayBuffer, duration, format: "wav" \| "mp3" }`. 전역 `fetch` 한 번, **재시도 없음, 취소 신호 없음, 시간 제한 없음**. 오류는 `TypecastAPIError(statusCode, response=본문)`이고 응답 헤더를 버린다(`Retry-After` 못 읽음). `seed`는 지운다. `prompt`는 v21 `{emotion_preset, emotion_intensity}`, v30 `{emotion_type: "preset", …}` 또는 `{emotion_type: "smart", previous_text?, next_text?}`. `output`: `audio_tempo` 0.5~2, `audio_pitch` −12~12, `volume` 0~200, `audio_format` `wav`(기본)·`mp3`. `language` ISO 639-3(`kor`), 빼면 자동 감지 | `node_modules/@neosapience/typecast-js/lib/index.d.ts` 65~215·489행, `lib/index.js` 6~45·454~480행 |
| ElevenLabs SDK 2.70.0 | `textToSpeech.convert(voice_id, BodyTextToSpeechFull, RequestOptions): HttpResponsePromise<ReadableStream<Uint8Array>>`. 요청 `{ text, modelId, voiceSettings: { stability, similarityBoost, style, speed, useSpeakerBoost }, outputFormat }`. `outputFormat`은 쿼리 `output_format`, 본문은 JSON 문자열(snake_case). 요청 옵션 `maxRetries`(기본 2), `timeoutInSeconds`(기본 240), `abortSignal`. 오류 `ElevenLabsError(statusCode, body, rawResponse)` | `api/resources/textToSpeech/client/Client.d.ts` 20행·`Client.js` 84~90행, `requests/BodyTextToSpeechFull.d.ts`, `api/types/VoiceSettings.d.ts`, `BaseClient.d.ts` 28~32행, `core/fetcher/getRequestBody.js` |
| ElevenLabs 모델 | `GET /v1/models` 항목 `model_id`, `can_use_style`, `can_use_speaker_boost`, `maximum_text_length_per_request`, `model_rates.character_cost_multiplier`(필수), `model_rates.cost_discount_multiplier`(선택). SDK `models.list()`는 응답 전체를 엄격 검사하므로 T4 목록처럼 REST(`fetchJson`)로 읽는다 | `api/types/Model.d.ts` 4~36행, `api/types/ModelRatesResponseModel.d.ts` |
| oRPC 1.15.4 `File` 출력 | RPC 직렬화기가 출력의 `Blob`을 찾아 `FormData`(필드 `data` = `{json, meta, maps}`, 필드 `0…` = 바이너리)로 보내고, 링크가 받아 같은 자리에 `Blob`(`File`)을 넣는다. base64가 아니다. Task 1이 실제 핸들러·링크로 확인한다 | `node_modules/.pnpm/@orpc+client@1.15.4/…/client.BrcgsQH9.mjs` 106~118·170~195·386~402행 |
| zod 4.6.5 | `z.file()`(File 인스턴스 검사) | `zod/v4/classic/schemas.d.ts` 637행 |
| drizzle-orm 1.0.0-rc.4 | **`bytea` 열이 기본 제공**(`data: Buffer`, customType 불필요), `uniqueIndex(name).on(…).where(sql\`…\`)`, `check(name, sql\`…\`)`, 인덱스 열 `.desc()`, `onConflictDoNothing()`(대상 없이 = 모든 유니크 충돌) | `pg-core/columns/bytea.d.ts`, `pg-core/indexes.d.ts` 67·79행, `pg-core/checks.d.ts`, `pg-core/columns/common.d.ts` 276행 |
| Base UI 1.8.0 | `slider`, `switch`, `alert-dialog` 모듈이 있다. 지금 `packages/ui`에는 셋 다 없다 | `node_modules/.pnpm/@base-ui+react*/…/@base-ui/react/` |
| T2 연결 상태 쿼리 | `orpc.providerStatus.queryOptions({ input: { provider } })`. 연결 상태 화면은 `staleTime` 5분. 같은 키라 확인 창이 새로 읽으면 연결 상태 화면 캐시도 갱신된다 | `apps/web/src/components/connection-status.tsx` 68~83행 |
| web 실행 | 클라이언트 컴포넌트가 워크스페이스 TS 패키지를 런타임 import한다(`@tts-pilot-app/ui/…`). `transpilePackages` 없이 된다 | `apps/web/next.config.ts` |

## 스펙과 다른 점

1. **`bytea`는 customType이 아니라 drizzle 기본 열이다**(스펙 5절 "drizzle `customType`으로 만든다"). 설치본 1.0.0-rc.4에 `bytea`가 있다. 결과는 같다.
2. **ElevenLabs flash v2.5의 스타일·화자 증폭은 두지 않는다**(스펙 4절 "`can_use_style`·`can_use_speaker_boost`가 참일 때만"). 옵션 목록이 원격 값에 따라 바뀌면 같은 조합 판정(Review Focus 1)과 서버 정리가 그 값을 알아야 한다. flash는 공식 문서에 모델별 명시가 없는 옵션이라 빼고(`FIELDS` 고정 표), `trialModels`는 배율만 돌려준다. 필요하면 사용자 테스트 뒤 표에 더한다.
3. **429에 `Retry-After`가 없으면 대기 시각을 적지 않는다**(스펙 5절 "없으면 T4와 같은 기본값"). T4에는 기본값이 없다(`runList`가 `retryAt` 없이 던지고 `cachedList`는 그때 쓰지 않는다). Typecast·Fish Audio 네이티브 API는 `Retry-After`를 문서화하지 않는다. 화면은 시각 없이 "요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요"(Task 8)를 보이고 버튼을 끄지 않는다. 429의 과금 여부는 공식 문서에 정보가 없다(계획 리뷰 E14).
4. **결과 목록 항목은 요청을 통째로 담는다**(`{ id, createdAt, usage, request: { provider, voiceId, text, settings } }`). 스펙 5절 표의 칸을 펼쳐 보내는 대신 계약의 요청 스키마를 다시 쓴다. '새로 만들기'가 그 요청을 그대로 다시 보내고, 화면은 `comboSignature(item.request)`로 저장된 결과를 알아본다.
5. **저장소 오류의 `provider`는 비어 있을 수 있다**(`TrialErrorData.provider?`). `trialAudio`·`trialDelete`는 입력에 공급자가 없다.
6. (계획 리뷰에서 없어짐: 구역 자리는 사용자 결정 U5로 스펙·브리프를 "이용 조건 뒤"로 고쳤다.)
7. **행의 '내 문장 듣기'를 누르면 1200px 이상에서 그 성우를 고른다**(브리프 12절은 "오류면 패널이 그 성우로 바뀐다"). 결과 목록과 오류가 패널에 있으므로 누를 때마다 고르는 편이 단순하고 일관된다. 1199px 이하는 서랍을 열지 않고, 실패는 행의 짧은 글자와 알림으로 보인다(계획 리뷰 D4).
8. **`usage_amount`는 `integer`다**(스펙 5절 `numeric`). 크레딧은 올림 정수, Fish Audio는 바이트 수라 소수가 없다(계획 리뷰 E14).
9. **`trialModels`는 모델 배율만 돌려준다**(스펙 5절 표의 `can_use_style`·`can_use_speaker_boost`·글자 상한 없음). 옵션 표는 고정했고(2번), 문장은 200자라 모델별 글자 상한(5,000자 이상)에 닿지 않는다(계획 리뷰 E14).

## 계획 리뷰에서 바꾼 것 (2026-10-05)

근거: 계획 리뷰 셋(`.superpowers/sdd/T05-my-sentence-listening-plan/plan-review-eng.md` approve-with-fixes high 1·medium 4·low 10, `plan-review-design.md` 6/10 REVISE high 6·medium 13·low 14, `plan-review-ponytail.md` 18건 net −180)과 사용자 결정 U1~U8(AskUserQuestion, 모두 권장안). 지적마다 계획·설치본·기존 코드로 확인한 뒤 반영했다.

**사용자 결정(2026-10-05)**
- U1 행 글자 버튼은 목록 칸 672px(`@2xl`) 이상에서만, 그 아래는 44px 아이콘 버튼(Task 11).
- U2 아이콘: 유료 `Coins`(경고색), Fish Audio 무료 모델 `AudioLines`(Task 11).
- U3 예상 사용량·버튼 줄을 패널 스크롤 칸 바닥에 붙인다(sticky, Task 10).
- U4 '새로 만들기'는 결과 줄에서 빼고 패널 버튼 아래 하나(`Coins` + "새로 만들기"). 결과 줄은 ▷·문장·요약·지우기(Task 9·10, 스펙 3절·AC11).
- U5 구역 순서: 기본 샘플 → 이용 조건 → 내 문장 듣기 → 내 문장 결과(Task 10, 스펙 3절, 브리프 5·12절).
- U6 Typecast 감정 세그먼트 '자동 | 직접', 접근 이름 '감정 모드'(Task 10).
- U7 슬라이더·스위치 채움 무채색, 청록은 포커스만(Task 7, DESIGN.md).
- U8 내 문장 재생 중이면 행에 띠·'재생 중' 배지, 행·패널 버튼이 채운 청록 '정지'. 플레이어 `Current`에 `owner`(Task 8·9·10·11).

**엔지니어링 리뷰 반영**
- E1(high) 응답을 받지 못한 실패(ElevenLabs의 statusCode 없는 SDK 오류 포함)는 모두 `unknown_outcome`, 원래 오류를 던지지 않는다(`runTrial` 마지막 분기, `trialCreate` catch). 세 공급자에 fetch `TypeError` 테스트, errors에 SDK 오류 테스트(Task 5·6).
- E2 여러 번 부르는 공급자 테스트는 `mockImplementation(async () => audio())`(Task 5).
- E3 ElevenLabs `voiceSettings`에서 `undefined` 키를 거른다(SDK가 `null`로 보낸다)(Task 5).
- E4 목록 항목 요청 → `comboSignature`·`trialFind` 왕복 테스트(Task 6, Review Focus 1).
- E5 선점 단계 DB 실패(insert만 던지는 Proxy)와 찾기·목록의 `storage` 테스트(Task 6).
- E6 `trial.test.ts`의 유니언 펼치기 타입 오류 수정(Task 4).
- E7 `typecast.ts` 기존 `toHttpError`를 바꾸고, 테스트 import에 `calledUrl`(Task 5).
- E8 결과 오디오 4MB 초과는 `provider_input`(`providerCode: "audio_too_large"`)와 "결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요"(Task 6·8). 사용자 테스트 1번에 결과 크기를 적는다.
- E10(부분) v3 안정성은 연속값으로 둔다. 단계값만 받아 400이 나면 `provider_input`(과금 없음으로 추정)이고 QA 수정 행에서 단계값으로 바꾼다('계획에서 정한 것').
- E11 `GET /v1/models`를 항목마다 검사(Task 5).
- E12 `complete`·`settle`에 소유자 조건(Task 4·6).
- E13 판을 올릴 때는 같은 마이그레이션에서 옛 결과를 지운다는 규칙을 `TRIAL_CONTRACT_VERSION` 주석에(Task 4).
- E14 '스펙과 다른 점' 3번의 "429는 과금되지 않는다"를 "정보 없음"으로, 8·9번을 더함. 사용자에게 알릴 것 아래.
- E15 429 시각 계산을 `retryAtFrom` 하나로(`runList`도 씀, Task 5).

**디자인 리뷰 반영**
- D1·D2·D3·D5·D7·D8 → U1·U4·U8·U3·U5. D2는 결과 줄 둘째 줄 순서를 "언제 · 사용량 · 설정"으로 바꾸고 두 줄까지(`line-clamp-2`).
- D4 행 메타 줄 끝에 "내 문장을 듣지 못했어요"(경고색), 전체 문구는 행·버튼 설명(Task 11).
- D6 결과 줄 버튼 이름에 문장 앞 20자(`resultSubject`), 문장·요약은 `aria-describedby`, `title` 없음(Task 10).
- D9 빈 문장이면 예상 사용량 줄을 숨기고, 저장돼 있으면 "저장된 결과 · 크레딧 0"(Task 10).
- D10 찾는 중에는 다른 버튼을 막지 않는다(`blockOf`가 만드는 중일 때만 `busyKey`, Task 8·9).
- D11 오류 줄이 있으면 막는 이유 줄을 숨기고 버튼 설명을 오류 줄로(Task 10).
- D12 '처음 값으로'는 늘 그리고 기본값이면 `aria-disabled`(머리 줄 `min-h-11`, Task 10).
- D13 확인 창 '모델' 칸을 '설정'(설정 요약)으로(Task 9).
- D14 Fish Audio 확인 창은 '남은 잔액'과 API 충전 잔액·웹 플랜 크레딧 두 줄(Task 8·9).
- D15 AlertDialog는 바깥 누르기로 닫히지 않는다 → 스펙 AC5를 "Esc·[취소]"로. 너비 `sm:max-w-md`(Task 7·9).
- D16 알림은 플레이어 한 곳: `Noun`에 "저장된 결과", "… 저장된 결과 재생 중, 크레딧 0"(Task 8·9).
- D17 슬라이더 `getAriaValueText`를 늘 넘긴다(Task 7·10).
- D18 행 버튼은 꺼져도 마우스를 올리면 툴팁(pointer-events를 끄지 않음, Task 11).
- D19 유료 표식 색 규칙을 Global Constraints에.
- D20 결과 목록 받는 중 `Skeleton`, 오류에 '다시 불러오기'(Task 10).
- D21 지우기 try/finally와 `isPending` 잠금(Task 10).
- D22 문자열에서 '▷'를 빼고 화면은 `Play` 아이콘(Task 8·9·10).
- D23 확인 창 남은 값 읽는 중 sr-only "확인하는 중", 안내 상자에 '기본 샘플' 이름표, 설명은 정의 목록(`AlertDialogDescription render={<div />}`)(Task 9).
- D24 키 문제 문구는 T4 `problemCopy` 그대로(문구를 `lib/voice-failure.ts`로 옮김, Task 8).
- D25 '연결 상태 보기'는 44px 링크 버튼(Task 10).
- D26 패널 버튼 코드 블록을 `lockedButton` 관례로(Task 10).
- D27 패널 메뉴는 늘 회색, 기본값이 아니면 값 글자만 굵게(`RadioMenu strong`, Task 10).
- D28 '내 문장 결과'는 구역 밖 형제 `section`(`h3`)(Task 10).
- D29 바의 바이트 수는 탭 공급자 또는 고른 성우가 Fish Audio일 때(Task 9).
- D30 "효과는 들어 봐야 알아요"는 태그를 골랐을 때만(Task 10).
- D31 행 버튼은 저장된 결과 여부를 모른다(행마다 목록을 부르지 않는다). '계획에서 정한 것'에 적음.
- D32 서랍 설명 "성우 정보, 기본 샘플, 내 문장 듣기"(Task 10).
- D33 연결 상태 대기 버튼의 설명을 사유 문구로(Task 8).

**과설계 리뷰 반영**
- 1 `RadioMenu` 하나로 정렬·패널 메뉴(Task 10). 2 옵션을 `fieldsOf` 순서로 돌리고 `FIELD_LABEL`(Task 10). 4 `retryAtFrom`(E15와 함께). 5 `fetchOk`로 `fetchJson` 나눔(Task 5). 6 메서드 이변성으로 공급자 가드 삭제(Task 5). 7 `trialFailureOf`의 `KNOWN` 삭제, `retryAtOf` 재사용(Task 8). 8 `TrialApi.blockOf`(Task 9). 9 감정 이름은 `EMOTION_KO` 한 벌(기본·기쁨·슬픔·화남·속삭임·높은 톤·낮은 톤, 스펙 4절도 고침)(Task 8). 10 `guard` export로 `quietly` 삭제(Task 4·6). 11 키 문제 문구 `problemCopy`(D24와 함께). 12 `comboSignature` 정렬 삭제, `comboKey`는 `cacheKey`(Task 2·4). 13 `findSaved`는 `audioOf`에 맡김(Task 4). 14 옛 Task 12(CS-01)를 Task 8에 합침(태스크 12개). 18 `BlobUrls` 타입 삭제.

**기각(이유)**
- E9 Typecast 경주에서 진 요청의 늦은 결과 저장: 서버리스에서 응답 뒤 처리가 보장되지 않고 미확인 행의 상태 전이가 늘어난다. 백로그(T9 작업실 생성 메모)로 보낸다.
- ponytail 3 설정 타입을 계약에서 뽑기: `DEFAULT_SETTINGS: SettingsOf`와 zod `.default(DEFAULT_SETTINGS…)`가 서로를 참조해 타입 순환(TS7022)이 날 수 있고, 지금 꼴은 worktree에서 `tsc -b` 0을 확인했다. 어긋남은 `Same<>` 단언이 잡는다.
- ponytail 15 Task 5를 Task 4 앞으로: 태스크 번호·교차 참조를 크게 옮겨 오류 위험이 줄 수 차이(0)보다 크다. `errors.ts`를 두 태스크가 고치는 것은 Interfaces에 적혀 있다.
- ponytail 16 `trial_generation_audio` CHECK 삭제: 완료 행에 오디오가 없으면 찾기·재생(`toAudio`)이 깨진다. DB 제약이 가장 싼 보장이다.
- ponytail 17 "SDK가 undefined를 뺀다": worktree 실행에서 `null`로 보냈다(E3). 걸러내는 코드를 둔다.

**사용자에게 알릴 것(스펙과 다른 결정, 코디네이터가 계획 확인 때 함께 보인다)**
- '스펙과 다른 점' 2(ElevenLabs flash 스타일·화자 증폭 없음), 3(`Retry-After` 없는 429는 대기 시각 없음), 7(행 버튼이 1200px 이상에서 그 성우를 고름), 8·9.
- 스펙 AC5 "바깥 누르기는 취소"를 "Esc·[취소]"로 고쳤다(D15).

**백로그로 보낼 것(35행 문서 영향에서 tasks/todo.md에)**
- T4 `runList`도 ElevenLabs statusCode 없는 SDK 오류를 `unknown_outcome`으로 바꾸지 못한다(E1과 같은 원인, 무료 목록이라 low).
- E9 Typecast 늦은 결과 저장(로드맵 T9 메모).
- T14 메모: 허용 목록이 둘 이상이 되면 시험 생성 성우 id를 공개·매핑 조회로 검사(`tts-provider` 클론 절 원칙으로 복귀).

## 계획에서 정한 것

스펙이 답하지 않아 정한 값이다. 바꾸려면 이 표와 해당 태스크를 함께 고친다.

| 항목 | 결정 | 이유 |
|---|---|---|
| Typecast v30 감정 기본값 | '자동'(`smart`) | llms.txt가 문맥이 중요하면 Smart를 먼저 쓰라고 한다. 앞뒤 문맥 문장은 보내지 않는다(스펙 7절) |
| Typecast 성우가 고른 모델·프리셋을 지원하지 않을 때 | 그 성우의 첫 지원 모델, 첫 지원 프리셋(보통이 있으면 보통)으로 보정한 요청을 쓴다. 공급자 설정 자체는 바꾸지 않는다 | 공급자 설정은 공급자마다 하나(스펙 3절)라 다른 성우에 영향을 주지 않게 |
| 정리한 설정의 저장 | `trial_generation.settings`에는 그 모델이 받는 옵션만(정리 값) 둔다. 출력 때 zod 기본값이 나머지를 채운다 | 조합 키와 같은 정보만 남긴다 |
| 결과 줄의 설정 요약 | 모델 + 기본값에서 벗어난 옵션만("eleven_v4 · 안정성 0.65 · [whispers]"). Typecast 프리셋 감정은 늘 보인다("감정 보통") | 브리프 예시의 길이를 지키면서 무엇이 달랐는지 보인다 |
| 예상 사용량 숫자 | 크레딧은 올림 정수, Fish Audio 달러는 소수 넷째 자리(`$0.0014`) | 0.5 배율과 한글 몇 글자의 금액을 0으로 보이지 않게 |
| 확인 창 요청 id | 확인 창이 열릴 때 하나 만들고, [크레딧 쓰고 듣기]를 몇 번 눌러도 그 id로 보낸다. Fish Audio 무료는 누를 때마다 하나 | 사용자 동작 하나 = 요청 id 하나(`tts-provider`) |
| 저장된 결과 찾기 중 표시 | 누른 버튼 안 작은 진행 표시만(창·알림 없음) | 브리프 12절 상태 표 |
| 결과 오디오 받기 | 목록의 ▷는 처음 누를 때 `trialAudio`로 받아 `blob:` 주소를 만들고, 그 뒤로는 주소를 다시 쓴다 | 목록에 오디오를 담지 않는다(스펙 5절) |
| 결과 재생 알림 | 플레이어 한 곳: 방금 만든 결과 "{이름} 내 문장 재생 중", 저장본 "{이름} 저장된 결과 재생 중, 크레딧 0", 멈춤 "… 저장된 결과를 멈췄어요"(받침 없는 명사는 '를') | T4 '샘플' 두 번 붙음 문제를 되풀이하지 않게 명사를 따로 넘기고, 두 알림 영역이 겹치지 않게 한다(계획 리뷰 D16) |
| 말투 태그 목록 | ElevenLabs: whispers 속삭임, sighs 한숨, laughs 웃음, excited 신남, curious 궁금함, sarcastic 비꼼, crying 울먹임, mischievously 장난스럽게, exhales 숨 내쉬기. Fish Audio: happy 기쁨, sad 슬픔, angry 화남, excited 신남, calm 차분함, nervous 긴장, confident 자신감, surprised 놀람, whispering 속삭임. 메뉴 끝에 '직접 쓰기…' | 스펙 4절 공식 목록에 한국어 이름을 붙였다 |
| 저장소 실패 판정 | `trial.ts`의 DB 호출이 `ORPCError`가 아닌 예외를 던지면 `storage`(503). 생성 뒤 완료·실패 쓰기는 `guard(…, "[trial]")`로 삼키고 오디오를 돌려준다 | 스펙 5절 |
| 결과 오디오 상한 | 4MB(`MAX_AUDIO_BYTES`)를 넘으면 `provider_input`(`audio_too_large`), "결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요" | 스펙 4절. 같은 실패를 다시 사지 않게 할 일을 알린다(계획 리뷰 E8) |
| ElevenLabs v3 안정성 | 연속값(0.05 단위)으로 둔다. 400이면 `provider_input` | research가 허용값 형태를 "정보 없음"으로 적었다. 사용자 테스트·QA에서 거절되면 QA 수정 행에서 단계값(0·0.5·1)으로 바꾼다(계획 리뷰 E10) |
| 행 버튼과 저장된 결과 | 행의 '내 문장 듣기'는 저장된 결과 여부를 모른다(늘 유료 표식). 누르면 찾기가 먼저라 저장본이면 크레딧 0으로 재생되고 알림이 "크레딧 0"을 말한다 | 행마다 목록을 부르지 않는다(계획 리뷰 D31) |
| 정렬 메뉴 접근 이름 | `RadioMenu`로 합치며 정렬 버튼에 "정렬, {값} 선택됨" 접근 이름이 생긴다 | 패널 메뉴와 같은 꼴(계획 리뷰 ponytail 1) |
| 문자열의 재생 기호 | 알림·설명·접근 이름에는 '▷'를 쓰지 않는다. 바 안내는 화면에 `Play` 아이콘(aria-hidden). 스펙 6절의 "기본 샘플 ▷은"은 화면에서 "기본 샘플은"이다 | 화면 낭독기가 기호 이름을 읽는다(계획 리뷰 D22) |
| 처음 쓰는 문구 | 예상 밖 오류(사유 없음) "내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요", 429 시각 없음 "요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요", 만드는 중 알림 "{이름} 내 문장을 만드는 중이에요", 완료(재생 안 함) "{이름} 내 문장을 만들었어요", 목록 오류 "결과를 불러오지 못했어요", 행의 짧은 실패 "내 문장을 듣지 못했어요", 오디오 초과 "결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요", 확인 창 남은 값 읽는 중 "확인하는 중" | 스펙·브리프에 없는 상태의 문구 |

## 열린 질문

- 없다. ElevenLabs 403·404 코드별 문구(무료 플랜 라이브러리 / 계정에 없음)는 공식 문서에 대응 표가 없어 Task 8의 잠정 표로 두고, 사용자 테스트 3번(승인된 실제 1회)의 오류 코드로 대조표 QA 수정 행에서 맞춘다(스펙 6절이 정한 절차).

## 파일 구조

```text
packages/db/
	src/schema/trial-generation.ts     (신규) trial_generation
	src/schema/index.ts                (수정) export
	src/migrations/<생성>/              (신규, 코디네이터 dbGenerate)
packages/api/
	src/rpc-file.test.ts               (신규) oRPC File 출력 확인
	src/providers/trial-options.ts     (신규) 모델·범위·기본값·정리·조합 글자·예상 사용량(화면과 공유, 순수)
	src/providers/trial-options.test.ts (신규)
	src/providers/trial-contract.ts    (신규) zod 입력·출력·사유
	src/providers/trial-contract.test.ts (신규)
	src/providers/errors.ts            (수정) ProviderClient.synthesize·listModels, TRIAL_TIMEOUT_MS, trialReason, trialError, retryAtFrom, runTrial, fetchOk
	src/providers/errors.test.ts       (수정, 끝에 더함)
	src/providers/typecast.ts(+test)   (수정) synthesize, toHttpError에 error_code
	src/providers/elevenlabs.ts(+test) (수정) synthesize, listModels, toHttpError 공용
	src/providers/fish-audio.ts(+test) (수정) synthesize
	src/voice-cache.ts                 (수정) cooldownOf·recordCooldown·logDbFailure·guard export, CacheScope kind "models"
	src/trial.ts                       (신규) 생성 기록(선점·완료·정리·찾기·목록·오디오·지우기)과 조합 키
	src/trial.test.ts                  (신규, 테스트 DB)
	src/routers/trial.ts               (신규) 프로시저 여섯
	src/routers/index.ts               (수정) ...trialRouter
	src/routers/trial.test.ts          (신규, 테스트 DB) 흐름·중복·동시·대기·DB 실패
	src/routers/trial.isolation.test.ts (신규, 테스트 DB) 2계정
packages/ui/src/components/
	slider.tsx, switch.tsx, alert-dialog.tsx (신규, 코디네이터 shadcn add)
apps/web/src/
	lib/trial-view.ts(+test)           (신규) 화면 문구·요청 보정·버튼 상태·요약·오류 문구
	lib/blob-urls.ts(+test)            (신규) 결과 blob 주소
	lib/roving.ts(+test)               (수정) 격자 셋째 칸
	lib/sample-state.ts(+test)         (수정) 알림 명사
	lib/connection-view.ts(+test)      (수정) recheckUntil(CS-01)
	lib/voice-view.ts                  (수정) EMOTION_KO export
	lib/voice-failure.ts               (수정) problemCopy(voice-problem.tsx에서 옮김)
	components/voice-problem.tsx       (수정) problemCopy import
	components/sample-player.tsx       (수정) 명사·성우 키, usePlayer
	components/trial-provider.tsx      (신규) TrialProvider, useTrial
	components/sentence-bar.tsx        (신규) '내 문장' 바
	components/trial-confirm.tsx       (신규) 확인 창
	components/trial-section.tsx       (신규) 패널 '내 문장 듣기' 구역(모델·옵션·예상·버튼)
	components/trial-results.tsx       (신규) '내 문장 결과' 목록·지우기 확인, useTrialItems
	components/voice-panel.tsx         (수정) 구역 넣기
	components/voice-row.tsx           (수정) TrialButton, RowList 셋째 칸, SampleButton describedBy, 재생 중·실패 표시
	components/casting-workspace.tsx   (수정) 바를 목록 위에
	components/voice-casting.tsx       (수정) TrialProvider, sourceItem export
	components/voice-conditions.tsx    (수정) RadioMenu(SortMenu가 씀)
	components/provider-status-card.tsx (수정) CS-01
docs/…, .claude/skills/tts-provider/SKILL.md (Task 12)
```

## 대조표 행과 태스크

`packages/api/src/providers/`가 diff에 생기면 `pnpm dev-cycle audit`이 security 행을 요구한다. Task 2가 끝나면 코디네이터가 `pnpm dev-cycle table F --write --upgrade`로 행을 붙인다(증거·메모 보존). 아래 번호는 붙이기 전 번호다.

| 행 | 증거의 출처 |
|---|---|
| 2 | 이 계획과 "읽은 스킬", "설치본으로 확인한 것" |
| 3 | 계획 리뷰(코디네이터): plan-eng-review, plan-design-review, ponytail-review |
| 4 | "실행 방식"과 태스크별 위임 내역 |
| 5 | Task 3 마이그레이션 파일 경로와 생성 SQL 요약 |
| 6 | Task 3 끝 `pnpm --filter @tts-pilot-app/db check-types`, Task 6 끝 `pnpm check-types`·`pnpm exec biome check .` |
| 7 | Task 3 Step 5 로컬·테스트 DB `db:migrate` 출력 요약 |
| 8 | 실제 `.neon` 연결 확인 후 코디네이터가 임시 schema-only 개발 브랜치의 별도 빈 DB에서 migrate 검증. 실행 근거와 정리는 장부에 기록 |
| 9 | Task 3: 새 표 하나만 만든다(기존 표 변경·DROP 없음) → 파괴적 변경 없음 |
| 10 | Task 3·4 diff에 `bts-reviewer(db)` |
| 11 | Task 2 `trial-contract.ts`(`trialRequestSchema`, `trialCreateInputSchema`, `trialAudioSchema`, `trialItemSchema`, `trialModelRateSchema`, `trialFailureSchema`) + Task 6 프로시저 여섯의 `.input`·`.output` |
| 12 | Task 1~6 변경 파일과 읽은 스킬(`bts-api`, `tts-provider`, `bts-db`) |
| 13 | Task 6 `trial.isolation.test.ts` 통과 출력(`TEST_DATABASE_URL` 있음, skipped 0) |
| 14 | Task 6 뒤 `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`, `source …/testdb.env && pnpm --filter @tts-pilot-app/api test` |
| 15 | Task 1~6 diff에 `bts-reviewer(code)` + `ponytail-review` |
| security(추가) | Task 1~6 diff에 `bts-reviewer(security)`(유료 호출을 부를 수 있는 주체, 한 명 소유 예외 확장, 중복 과금, 키 노출, 입력 검사) |
| 16 | 메인 세션 impeccable context(`--target apps/web/src/components/trial-section.tsx`) |
| 17 | 이미 확정한 브리프 12절(2026-10-05) |
| 18 | Task 7~11 변경 파일과 읽은 스킬(`bts-web`, `bts-ui`, `shadcn`, `vercel-react-best-practices`, craft-floor) |
| 19 | Task 11 뒤 `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`, `pnpm build`(메인 세션이 정한 때) |
| 20~36 | "구현 뒤" |

---

### Task 1: oRPC `File` 출력 확인

시험 생성 결과를 바이너리로 보내는 방식이 이 저장소에서 처음이다(스펙 13절). 실제 RPC 핸들러와 링크(CSRF 플러그인 포함)를 메모리 안에서 이어 확인한다. 실패하면 멈추고 코디네이터에게 알린다(전송 방식은 사용자와 다시 정하고 ADR을 쓴다).

**Files:**
- Create: `packages/api/src/rpc-file.test.ts`

**Interfaces:**
- Produces: 없음(회귀 테스트로 남긴다).

- [x] **Step 1: 테스트 쓰기**

```ts
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import { os, type RouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// 시험 생성 결과는 base64 JSON이 아니라 바이너리로 보낸다(T5 스펙 5절, Vercel 4.5MB 한도).
// 이 저장소에서 처음 쓰는 방식이라 실제 핸들러·링크(앱과 같은 CSRF 플러그인)를 메모리 안에서 이어 확인한다(스펙 13절).
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
const router = {
	audio: os
		.output(z.object({ id: z.string(), audio: z.file() }))
		.handler(() => ({
			id: "x",
			audio: new File([MP3], "trial.mp3", { type: "audio/mpeg" }),
		})),
};

describe("oRPC File 출력", () => {
	it("multipart로 보내고 링크가 같은 바이트의 File로 돌려준다", async () => {
		const handler = new RPCHandler(router, {
			plugins: [new SimpleCsrfProtectionHandlerPlugin()],
		});
		let contentType = "";
		const link = new RPCLink({
			url: "http://127.0.0.1:3001/api/rpc",
			plugins: [new SimpleCsrfProtectionLinkPlugin()],
			fetch: async (request) => {
				const { response } = await handler.handle(request, {
					prefix: "/api/rpc",
					context: {},
				});
				contentType = response?.headers.get("content-type") ?? "";
				return response ?? new Response("Not found", { status: 404 });
			},
		});
		const client: RouterClient<typeof router> = createORPCClient(link);
		const result = await client.audio();
		expect(contentType).toMatch(/^multipart\/form-data/);
		expect(result.id).toBe("x");
		expect(result.audio).toBeInstanceOf(Blob);
		expect(result.audio.type).toBe("audio/mpeg");
		expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(MP3);
	});
});
```

- [x] **Step 2: 실행** — `pnpm --filter @tts-pilot-app/api test src/rpc-file.test.ts`. 기대: 1 passed. 실패하면(내용 형식이 JSON이거나 바이트가 다르면) 여기서 멈춘다.

### Task 2: 시험 생성 설정과 계약

**Files:**
- Create: `packages/api/src/providers/trial-options.ts`, `trial-options.test.ts`, `trial-contract.ts`, `trial-contract.test.ts`

**Interfaces:**
- Produces(`trial-options.ts`, 화면과 서버가 런타임으로 쓴다):
  - 상수 `TRIAL_TEXT_MAX = 200`, `TRIAL_TAG_MAX = 30`, `TRIAL_RESULTS_SHOWN = 20`, `FISH_FREE_UNTIL: number`, `TYPECAST_MODELS`, `ELEVENLABS_MODELS`, `FISH_MODELS`, `EMOTION_PRESETS`, `V21_PRESETS`, `RANGES`, `DEFAULT_SETTINGS: SettingsOf`, `FIELDS`
  - 타입 `TypecastModel`, `ElevenLabsModel`, `FishModel`, `EmotionPreset`, `Range`, `TypecastSettings`, `ElevenLabsSettings`, `FishSettings`, `SettingsOf`, `TrialRequest`, `UsedSettings`, `Usage`
  - 함수 `fieldsOf(request): readonly string[]`, `snap(value, range): number`, `normalizeText(text): string`, `codePoints(text): number`, `utf8Bytes(text): number`, `usedSettings(request): UsedSettings`, `comboSignature(request): string`, `sentText(request): string`, `isFreeModel(request): boolean`, `freeModelOpen(now?): boolean`, `estimate(request, multiplier?): Usage`, `fishUsd(bytes): number`
- Produces(`trial-contract.ts`, 서버 검증·화면은 타입만): `voiceIdSchema`, `typecastSettingsSchema`, `elevenLabsSettingsSchema`, `fishSettingsSchema`, `trialRequestSchema`, `trialCreateInputSchema`, `usageSchema`, `trialAudioSchema`(`TrialAudio`), `trialItemSchema`(`TrialItem`, `TrialItemInput`), `trialModelRateSchema`(`TrialModelRate`), `trialFailureSchema`(`TrialFailure`), 타입 `TrialErrorData`

- [x] **Step 1: `trial-options.test.ts` 쓰기(실패)**

```ts
import { describe, expect, it } from "vitest";

import {
	codePoints,
	comboSignature,
	DEFAULT_SETTINGS,
	type ElevenLabsSettings,
	estimate,
	FISH_FREE_UNTIL,
	fieldsOf,
	fishUsd,
	freeModelOpen,
	sentText,
	snap,
	type TrialRequest,
	usedSettings,
	utf8Bytes,
} from "./trial-options";

const el = (over: Partial<ElevenLabsSettings> = {}, text = "안녕하세요"): TrialRequest => ({
	provider: "elevenlabs",
	voiceId: "el0001",
	text,
	settings: { ...DEFAULT_SETTINGS.elevenlabs, ...over },
});
const tc = (over: Partial<typeof DEFAULT_SETTINGS.typecast> = {}): TrialRequest => ({
	provider: "typecast",
	voiceId: "tc_0001",
	text: "안녕",
	settings: { ...DEFAULT_SETTINGS.typecast, ...over },
});
const fish = (over: Partial<typeof DEFAULT_SETTINGS.fish_audio> = {}, text = "안녕"): TrialRequest => ({
	provider: "fish_audio",
	voiceId: "a".repeat(32),
	text,
	settings: { ...DEFAULT_SETTINGS.fish_audio, ...over },
});

describe("fieldsOf", () => {
	it("Typecast v30 자동 감정은 프리셋·강도를 쓰지 않고 v21은 감정 방식이 없다", () => {
		expect(fieldsOf(tc())).toEqual(["emotion", "language", "tempo", "pitch", "volume"]);
		expect(fieldsOf(tc({ emotion: "preset" }))).toContain("intensity");
		expect(fieldsOf(tc({ model: "ssfm-v21" }))).not.toContain("emotion");
	});
	it("ElevenLabs 모델마다 받는 옵션이 다르다(스펙 4절)", () => {
		expect(fieldsOf(el())).toEqual(["stability", "similarity", "tag"]);
		expect(fieldsOf(el({ model: "eleven_v3" }))).toEqual(["stability", "tag"]);
		expect(fieldsOf(el({ model: "eleven_multilingual_v2" }))).toEqual([
			"stability",
			"similarity",
			"style",
			"speed",
			"speakerBoost",
		]);
	});
});

describe("snap", () => {
	it("단위로 반올림하고 범위 안에 두며 부동소수 끝자리를 지운다", () => {
		const range = { min: 0, max: 1, step: 0.05, default: 0.5 };
		expect(snap(0.1 + 0.2, range)).toBe(0.3);
		expect(snap(0.33, range)).toBe(0.35);
		expect(snap(1.2, range)).toBe(1);
		expect(snap(-3, { min: -12, max: 12, step: 1, default: 0 })).toBe(-3);
	});
});

describe("comboSignature (Review Focus 1)", () => {
	it("같은 소리의 요청은 같은 글자다: 키 순서·받지 않는 옵션·끝자리·NFC·앞뒤 공백·태그 공백", () => {
		const base = comboSignature(el({ tag: "whispers" }));
		const reordered: TrialRequest = {
			provider: "elevenlabs",
			voiceId: "el0001",
			text: "안녕하세요",
			settings: {
				tag: "whispers",
				speakerBoost: true,
				speed: 1,
				style: 0,
				similarity: 0.75,
				stability: 0.5,
				model: "eleven_v4",
			},
		};
		expect(comboSignature(reordered)).toBe(base);
		// v4는 스타일·속도를 받지 않는다
		expect(comboSignature(el({ tag: "whispers", style: 0.9, speed: 1.2 }))).toBe(base);
		expect(comboSignature(el({ tag: "whispers", stability: 0.1 + 0.4 }))).toBe(base);
		expect(comboSignature(el({ tag: "  whispers " }, "  안녕하세요\n"))).toBe(base);
		// 분해형 한글(NFD)도 같은 문장이다
		expect(comboSignature(el({ tag: "whispers" }, "안녕하세요".normalize("NFD")))).toBe(base);
	});
	it("문장·성우·받는 옵션 값이 다르면 다른 글자다", () => {
		const base = comboSignature(el());
		expect(comboSignature(el({}, "안녕"))).not.toBe(base);
		expect(comboSignature({ ...el(), voiceId: "el0002" })).not.toBe(base);
		expect(comboSignature(el({ stability: 0.6 }))).not.toBe(base);
		expect(comboSignature(el({ model: "eleven_v3" }))).not.toBe(base);
	});
});

describe("usedSettings", () => {
	it("모델과 받는 옵션만, 정리한 값으로 남긴다", () => {
		expect(usedSettings(el({ style: 0.9, tag: " sighs " }))).toEqual({
			model: "eleven_v4",
			stability: 0.5,
			similarity: 0.75,
			tag: "sighs",
		});
		expect(usedSettings(tc({ model: "ssfm-v21", preset: "happy", intensity: 1.53 }))).toEqual({
			model: "ssfm-v21",
			preset: "happy",
			intensity: 1.5,
			language: "auto",
			tempo: 1,
			pitch: 0,
			volume: 100,
		});
	});
});

describe("sentText와 예상 사용량", () => {
	it("말투 태그는 받는 모델에서만 문장 앞에 붙고 사용량에 든다", () => {
		expect(sentText(el({ tag: "whispers" }, "안녕"))).toBe("[whispers] 안녕");
		expect(sentText(el({ model: "eleven_multilingual_v2", tag: "whispers" }, "안녕"))).toBe("안녕");
		expect(sentText(fish({ tag: "happy" }))).toBe("[happy] 안녕");
		expect(estimate(el({ tag: "whispers" }, "안녕"))).toEqual({ unit: "credit", amount: 13 });
	});
	it("Typecast는 코드 포인트 글자 수, ElevenLabs는 배율을 곱해 올림, 배율이 없으면 1", () => {
		expect(estimate(tc())).toEqual({ unit: "credit", amount: 2 });
		expect(codePoints("😀가")).toBe(2);
		expect(estimate(el({}, "가나다"), 0.5)).toEqual({ unit: "credit", amount: 2 });
		expect(estimate(el({}, "가나다"), null)).toEqual({ unit: "credit", amount: 3 });
	});
	it("Fish Audio 유료는 UTF-8 바이트(한글 3바이트), 무료 모델은 0", () => {
		expect(utf8Bytes("안녕")).toBe(6);
		expect(estimate(fish({ model: "s2.1-pro" }))).toEqual({ unit: "byte", amount: 6 });
		expect(estimate(fish())).toEqual({ unit: "free", amount: 0 });
		expect(fishUsd(300)).toBeCloseTo(0.0045, 6);
	});
	it("무료 모델은 종료일 0시(KST) 전까지만 열려 있다", () => {
		expect(freeModelOpen(FISH_FREE_UNTIL - 1)).toBe(true);
		expect(freeModelOpen(FISH_FREE_UNTIL)).toBe(false);
	});
});
```

- [x] **Step 2: 실행해 실패 확인** — `pnpm --filter @tts-pilot-app/api test src/providers/trial-options.test.ts`. 기대: 모듈이 없어 실패.

- [x] **Step 3: `trial-options.ts` 쓰기**

```ts
import type { ProviderId } from "./contract";

// 시험 생성('내 문장 듣기', T5 스펙 4절)의 모델·옵션 범위·기본값과 순수 계산이다. 화면과 서버가 함께 쓴다.
// zod·SDK·서버 모듈을 import하지 않는다(화면 번들에 들어간다). 입력 검증 스키마는 trial-contract.ts가 이 값으로 만든다.

export const TRIAL_TEXT_MAX = 200;
export const TRIAL_TAG_MAX = 30;
// 패널 '내 문장 결과'에 보이는 수(최신순)
export const TRIAL_RESULTS_SHOWN = 20;
// Fish Audio 무료 모델(s2.1-pro-free)은 블로그 기준 2026-11-30까지다. 공급자에서 먼저 없어지면 '모르는 모델'이 되어
// 오류 없이 유료 s2.1-pro로 처리되므로 하루 이르게(그날 0시 KST) 보내지 않는다(스펙 4·13절)
export const FISH_FREE_UNTIL = Date.parse("2026-11-30T00:00:00+09:00");
// Fish Audio 유료 단가(요금 문서 2026-10-05): 100만 UTF-8 바이트당 15달러
const FISH_USD_PER_BYTE = 15 / 1_000_000;

export const TYPECAST_MODELS = ["ssfm-v30", "ssfm-v21"] as const;
export const ELEVENLABS_MODELS = [
	"eleven_v4",
	"eleven_v3",
	"eleven_multilingual_v2",
	"eleven_flash_v2_5",
] as const;
export const FISH_MODELS = ["s2.1-pro-free", "s2.1-pro"] as const;
export const EMOTION_PRESETS = [
	"normal",
	"happy",
	"sad",
	"angry",
	"whisper",
	"toneup",
	"tonedown",
] as const;
export type TypecastModel = (typeof TYPECAST_MODELS)[number];
export type ElevenLabsModel = (typeof ELEVENLABS_MODELS)[number];
export type FishModel = (typeof FISH_MODELS)[number];
export type EmotionPreset = (typeof EMOTION_PRESETS)[number];
// ssfm-v21이 받는 프리셋(공식 문서)
export const V21_PRESETS: readonly EmotionPreset[] = ["normal", "happy", "sad", "angry"];

export type Range = { min: number; max: number; step: number; default: number };
const range = (min: number, max: number, step: number, value: number): Range => ({
	min,
	max,
	step,
	default: value,
});
// 슬라이더 범위·단위·기본값(공식 문서 2026-10-05, tasks/evidence/T05/research). 단위는 같은 조합 판정의 반올림 단위이기도 하다
export const RANGES = {
	typecast: {
		intensity: range(0, 2, 0.1, 1),
		tempo: range(0.5, 2, 0.05, 1),
		pitch: range(-12, 12, 1, 0),
		volume: range(0, 200, 5, 100),
	},
	elevenlabs: {
		stability: range(0, 1, 0.05, 0.5),
		similarity: range(0, 1, 0.05, 0.75),
		style: range(0, 1, 0.05, 0),
		speed: range(0.7, 1.2, 0.05, 1),
	},
	fish_audio: {
		speed: range(0.5, 2, 0.05, 1),
		temperature: range(0, 1, 0.05, 0.7),
	},
} as const;

export type TypecastSettings = {
	model: TypecastModel;
	emotion: "smart" | "preset";
	preset: EmotionPreset;
	intensity: number;
	language: "auto" | "kor";
	tempo: number;
	pitch: number;
	volume: number;
};
export type ElevenLabsSettings = {
	model: ElevenLabsModel;
	stability: number;
	similarity: number;
	style: number;
	speed: number;
	speakerBoost: boolean;
	// 말투 태그(대괄호 안 글자). 비면 없음
	tag: string;
};
export type FishSettings = {
	model: FishModel;
	speed: number;
	temperature: number;
	tag: string;
};
export type SettingsOf = {
	typecast: TypecastSettings;
	elevenlabs: ElevenLabsSettings;
	fish_audio: FishSettings;
};
// 시험 생성 요청 하나(성우·문장·설정). 화면이 만들고 프로시저가 받는 모양이다
export type TrialRequest = {
	[P in ProviderId]: {
		provider: P;
		voiceId: string;
		text: string;
		settings: SettingsOf[P];
	};
}[ProviderId];

export const DEFAULT_SETTINGS: SettingsOf = {
	typecast: {
		model: "ssfm-v30",
		emotion: "smart",
		preset: "normal",
		intensity: RANGES.typecast.intensity.default,
		language: "auto",
		tempo: RANGES.typecast.tempo.default,
		pitch: RANGES.typecast.pitch.default,
		volume: RANGES.typecast.volume.default,
	},
	elevenlabs: {
		model: "eleven_v4",
		stability: RANGES.elevenlabs.stability.default,
		similarity: RANGES.elevenlabs.similarity.default,
		style: RANGES.elevenlabs.style.default,
		speed: RANGES.elevenlabs.speed.default,
		speakerBoost: true,
		tag: "",
	},
	fish_audio: {
		model: "s2.1-pro-free",
		speed: RANGES.fish_audio.speed.default,
		temperature: RANGES.fish_audio.temperature.default,
		tag: "",
	},
};

type Field<P extends ProviderId> = Exclude<keyof SettingsOf[P], "model"> & string;
// 모델이 받는 옵션(스펙 4절 표). 받지 않는 옵션은 화면에서 숨고 정리·공급자 본문에서 빠진다.
// ponytail: flash v2.5의 스타일·화자 증폭은 공식 문서에 모델별 명시가 없어 두지 않는다(계획 '스펙과 다른 점' 2). 실제 확인 뒤 이 표에 더한다
export const FIELDS: {
	[P in ProviderId]: Record<SettingsOf[P]["model"], readonly Field<P>[]>;
} = {
	typecast: {
		"ssfm-v30": ["emotion", "preset", "intensity", "language", "tempo", "pitch", "volume"],
		"ssfm-v21": ["preset", "intensity", "language", "tempo", "pitch", "volume"],
	},
	elevenlabs: {
		eleven_v4: ["stability", "similarity", "tag"],
		eleven_v3: ["stability", "tag"],
		eleven_multilingual_v2: ["stability", "similarity", "style", "speed", "speakerBoost"],
		eleven_flash_v2_5: ["stability", "similarity", "speed"],
	},
	fish_audio: {
		"s2.1-pro-free": ["speed", "temperature", "tag"],
		"s2.1-pro": ["speed", "temperature", "tag"],
	},
};

// 이 요청의 모델이 받는 옵션. Typecast v30 '자동' 감정은 프리셋·강도를 쓰지 않는다
export function fieldsOf(request: TrialRequest): readonly string[] {
	const fields =
		(FIELDS[request.provider] as Record<string, readonly string[]>)[request.settings.model] ?? [];
	return request.provider === "typecast" &&
		request.settings.model === "ssfm-v30" &&
		request.settings.emotion === "smart"
		? fields.filter((field) => field !== "preset" && field !== "intensity")
		: fields;
}

// 슬라이더 단위로 반올림하고 범위 안에 둔다. 부동소수 끝자리(0.30000000000000004)를 지워 같은 소리의 요청이 같은 값이 되게 한다
export const snap = (value: number, { min, max, step }: Range) =>
	Number(
		Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step)).toFixed(4),
	);

export const normalizeText = (text: string) => text.normalize("NFC").trim();
// 글자 수는 코드 포인트로 센다(이모지 하나 = 1)
export const codePoints = (text: string) => [...text].length;
export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

export type UsedSettings = Record<string, string | number | boolean>;
// 그 모델이 받는 옵션만 정리한 값으로 남긴다(같은 조합 판정·저장·공급자 본문). 받지 않는 옵션의 값은 소리에 영향이 없다
export function usedSettings(request: TrialRequest): UsedSettings {
	const ranges: Partial<Record<string, Range>> = RANGES[request.provider];
	const values = request.settings as Record<string, string | number | boolean>;
	const used: UsedSettings = { model: request.settings.model };
	for (const field of fieldsOf(request)) {
		const value = values[field];
		if (value === undefined) continue;
		const limits = ranges[field];
		used[field] =
			typeof value === "number" && limits
				? snap(value, limits)
				: typeof value === "string"
					? value.trim()
					: value;
	}
	return used;
}

// 같은 소리를 내는 요청이면 같은 글자다(계획 Review Focus 1). 서버의 조합 키(trial.ts comboKey)는 이 글자의 해시이고,
// 화면은 이 글자로 결과 목록에서 '저장된 결과'를 알아본다. usedSettings가 model 뒤에 FIELDS 표 순서로만 키를 넣으므로
// 입력 키 순서와 상관없이 같은 글자다. 받지 않는 옵션·끝자리·NFC·앞뒤 공백은 usedSettings·normalizeText가 지운다
export function comboSignature(request: TrialRequest): string {
	return JSON.stringify([
		request.provider,
		request.voiceId,
		normalizeText(request.text),
		usedSettings(request),
	]);
}

// 공급자에게 보내는 문장. 말투 태그를 받는 모델이면 문장 앞에 붙인다(두 공급자 문서 모두 문장 앞을 권한다)
export function sentText(request: TrialRequest): string {
	const text = normalizeText(request.text);
	if (request.provider === "typecast") return text;
	const tag = request.settings.tag.trim();
	return tag && fieldsOf(request).includes("tag") ? `[${tag}] ${text}` : text;
}

export type Usage = { unit: "credit" | "byte" | "free"; amount: number };
export const isFreeModel = (request: TrialRequest) =>
	request.provider === "fish_audio" && request.settings.model === "s2.1-pro-free";
export const freeModelOpen = (now = Date.now()) => now < FISH_FREE_UNTIL;

// 예상 사용량(스펙 4절). 보낼 문장(태그 포함)으로 센다. ElevenLabs 배율을 모르면 1로 센다(화면이 "배율을 확인하지 못했어요"를 붙인다)
export function estimate(request: TrialRequest, multiplier: number | null = null): Usage {
	const sent = sentText(request);
	if (request.provider === "fish_audio") {
		return isFreeModel(request)
			? { unit: "free", amount: 0 }
			: { unit: "byte", amount: utf8Bytes(sent) };
	}
	const chars = codePoints(sent);
	return {
		unit: "credit",
		amount: request.provider === "elevenlabs" ? Math.ceil(chars * (multiplier ?? 1)) : chars,
	};
}
export const fishUsd = (bytes: number) => bytes * FISH_USD_PER_BYTE;
```

- [x] **Step 4: 실행해 통과 확인** — 같은 명령. 기대: 모두 통과.

- [x] **Step 5: `trial-contract.test.ts` 쓰기(실패)**

```ts
import { describe, expect, it } from "vitest";

import { trialCreateInputSchema, trialRequestSchema } from "./trial-contract";
import { comboSignature, DEFAULT_SETTINGS, type TrialRequest } from "./trial-options";

const parse = (value: unknown) => trialRequestSchema.safeParse(value);
const el = { provider: "elevenlabs", voiceId: "el0001", text: "안녕" } as const;

describe("trialRequestSchema", () => {
	it("빠진 옵션은 기본값으로 채우고, 기본값을 뺀 입력도 같은 조합 글자다(Review Focus 1)", () => {
		const parsed = trialRequestSchema.parse({ ...el, settings: {} });
		expect(parsed.settings).toEqual(DEFAULT_SETTINGS.elevenlabs);
		const full: TrialRequest = { ...el, settings: DEFAULT_SETTINGS.elevenlabs };
		expect(comboSignature(parsed)).toBe(comboSignature(full));
	});
	it("문장은 NFC·앞뒤 공백을 정리하고 1~200자(코드 포인트)만 받는다", () => {
		expect(parse({ ...el, text: "  안녕\n", settings: {} }).data?.text).toBe("안녕");
		expect(parse({ ...el, text: "   ", settings: {} }).success).toBe(false);
		expect(parse({ ...el, text: "가".repeat(200), settings: {} }).success).toBe(true);
		expect(parse({ ...el, text: "가".repeat(201), settings: {} }).success).toBe(false);
		expect(parse({ ...el, text: "😀".repeat(200), settings: {} }).success).toBe(true);
	});
	it("범위 밖 값·대괄호 태그·31자 태그·경로 글자가 든 성우 id·모르는 모델은 거절한다", () => {
		expect(parse({ ...el, settings: { stability: 1.01 } }).success).toBe(false);
		expect(parse({ ...el, settings: { tag: "[x]" } }).success).toBe(false);
		expect(parse({ ...el, settings: { tag: "a".repeat(31) } }).success).toBe(false);
		expect(parse({ ...el, voiceId: "../x", settings: {} }).success).toBe(false);
		expect(
			parse({ provider: "fish_audio", voiceId: "f1", text: "안녕", settings: { model: "s1" } }).success,
		).toBe(false);
		expect(
			parse({ provider: "typecast", voiceId: "tc_1", text: "안녕", settings: { pitch: -13 } }).success,
		).toBe(false);
	});
	it("Typecast v21은 v21 프리셋만 받는다", () => {
		const tc = { provider: "typecast", voiceId: "tc_1", text: "안녕" };
		expect(parse({ ...tc, settings: { model: "ssfm-v21", preset: "whisper" } }).success).toBe(false);
		expect(parse({ ...tc, settings: { model: "ssfm-v21", preset: "happy" } }).success).toBe(true);
	});
	it("만들기 입력은 uuid 요청 id를 받는다", () => {
		expect(
			trialCreateInputSchema.safeParse({ requestId: "x", request: { ...el, settings: {} } }).success,
		).toBe(false);
	});
});
```

- [x] **Step 6: `trial-contract.ts` 쓰기**

```ts
import { z } from "zod";

import { type ProviderErrorData, providerFailureSchema } from "./contract";
import {
	codePoints,
	DEFAULT_SETTINGS,
	ELEVENLABS_MODELS,
	EMOTION_PRESETS,
	FISH_MODELS,
	normalizeText,
	RANGES,
	type Range,
	TRIAL_TAG_MAX,
	TRIAL_TEXT_MAX,
	type TrialRequest,
	TYPECAST_MODELS,
	V21_PRESETS,
} from "./trial-options";

// 시험 생성 입력·출력 계약(T5 스펙 5절). 서버가 검증하고, 화면은 이 파일에서 타입만 가져간다(import type).
const num = ({ min, max, default: value }: Range) => z.number().min(min).max(max).default(value);
// 말투 태그는 대괄호 안 글자다(앱이 대괄호를 붙인다). 비면 태그 없음
const tagSchema = z
	.string()
	.trim()
	.max(TRIAL_TAG_MAX)
	.regex(/^[^[\]\r\n]*$/)
	.default("");

const tc = RANGES.typecast;
export const typecastSettingsSchema = z
	.object({
		model: z.enum(TYPECAST_MODELS).default(DEFAULT_SETTINGS.typecast.model),
		emotion: z.enum(["smart", "preset"]).default(DEFAULT_SETTINGS.typecast.emotion),
		preset: z.enum(EMOTION_PRESETS).default(DEFAULT_SETTINGS.typecast.preset),
		intensity: num(tc.intensity),
		language: z.enum(["auto", "kor"]).default(DEFAULT_SETTINGS.typecast.language),
		tempo: num(tc.tempo),
		pitch: num(tc.pitch),
		volume: num(tc.volume),
	})
	.refine((s) => s.model === "ssfm-v30" || V21_PRESETS.includes(s.preset), {
		path: ["preset"],
	});
const el = RANGES.elevenlabs;
export const elevenLabsSettingsSchema = z.object({
	model: z.enum(ELEVENLABS_MODELS).default(DEFAULT_SETTINGS.elevenlabs.model),
	stability: num(el.stability),
	similarity: num(el.similarity),
	style: num(el.style),
	speed: num(el.speed),
	speakerBoost: z.boolean().default(DEFAULT_SETTINGS.elevenlabs.speakerBoost),
	tag: tagSchema,
});
const fish = RANGES.fish_audio;
export const fishSettingsSchema = z.object({
	model: z.enum(FISH_MODELS).default(DEFAULT_SETTINGS.fish_audio.model),
	speed: num(fish.speed),
	temperature: num(fish.temperature),
	tag: tagSchema,
});

// 공급자 성우 id: Typecast tc_·uc_, ElevenLabs 20자, Fish Audio 32자 16진(실측). ElevenLabs 경로에 그대로 들어가므로 글자를 묶는다
export const voiceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
// 문장: NFC로 맞추고 앞뒤 공백을 지운 뒤 1~200자(코드 포인트)
const textSchema = z
	.string()
	.max(TRIAL_TEXT_MAX * 4)
	.transform(normalizeText)
	.pipe(
		z
			.string()
			.min(1)
			.refine((text) => codePoints(text) <= TRIAL_TEXT_MAX),
	);

export const trialRequestSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("typecast"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: typecastSettingsSchema,
	}),
	z.object({
		provider: z.literal("elevenlabs"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: elevenLabsSettingsSchema,
	}),
	z.object({
		provider: z.literal("fish_audio"),
		voiceId: voiceIdSchema,
		text: textSchema,
		settings: fishSettingsSchema,
	}),
]);
// 계약과 trial-options의 요청 타입이 어긋나면 타입 검사가 잡는다
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameRequest: Same<z.output<typeof trialRequestSchema>, TrialRequest> = true;
void _sameRequest;

export const trialCreateInputSchema = z.object({
	requestId: z.uuid(),
	request: trialRequestSchema,
});

export const usageSchema = z.object({
	unit: z.enum(["credit", "byte", "free"]),
	amount: z.number().nonnegative(),
});
// 들은 결과 하나(오디오 포함). 오디오는 MP3 File이고 RPC가 바이너리로 보낸다(Task 1)
export const trialAudioSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
	audio: z.file(),
});
export type TrialAudio = z.infer<typeof trialAudioSchema>;
// 결과 목록 한 줄(오디오 없음). 요청을 통째로 담아 '새로 만들기'와 저장된 결과 알아보기에 쓴다(계획 '스펙과 다른 점' 4)
export const trialItemSchema = z.object({
	id: z.uuid(),
	createdAt: z.iso.datetime(),
	usage: usageSchema,
	request: trialRequestSchema,
});
export type TrialItem = z.output<typeof trialItemSchema>;
export type TrialItemInput = z.input<typeof trialItemSchema>;
// ElevenLabs 모델 크레딧 배율(character_cost_multiplier × cost_discount_multiplier)
export const trialModelRateSchema = z.object({
	model: z.enum(ELEVENLABS_MODELS),
	multiplier: z.number().positive(),
});
export type TrialModelRate = z.infer<typeof trialModelRateSchema>;

// 시험 생성 실패 사유(스펙 6절). 공급자 사유에 입력 거절·진행 중·무료 종료·요청 id 불일치·저장소를 더했다
export const trialFailureSchema = z.enum([
	...providerFailureSchema.options,
	"provider_input",
	"in_progress",
	"free_ended",
	"request_mismatch",
	"storage",
]);
export type TrialFailure = z.infer<typeof trialFailureSchema>;
// 시험 생성 오류의 data. provider_input이면 공급자 오류 코드(화면이 문구를 고른다). 저장소 오류는 공급자가 없을 수 있다(결과 id로 부를 때)
export type TrialErrorData = Omit<ProviderErrorData, "provider" | "reason"> & {
	provider?: ProviderErrorData["provider"];
	reason: TrialFailure;
	providerCode?: string;
};
```

- [x] **Step 7: 실행** — `pnpm --filter @tts-pilot-app/api test src/providers/trial-options.test.ts src/providers/trial-contract.test.ts`, `pnpm --filter @tts-pilot-app/api check-types`. 기대: 통과, 타입 0. `_sameRequest`가 타입 오류면 trial-options의 타입을 계약 출력에 맞춘다(계약을 느슨하게 바꾸지 않는다).

### Task 3: 생성 기록 표 (DB 명령은 코디네이터)

**Files:**
- Create: `packages/db/src/schema/trial-generation.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create(코디네이터): `packages/db/src/migrations/<시각>_<이름>/`

**Interfaces:**
- Produces: `trialGeneration` 표(`@tts-pilot-app/db/schema/trial-generation`). 열 이름은 아래 코드 그대로.

- [x] **Step 1: 스키마 쓰기**

```ts
import { sql } from "drizzle-orm";
import {
	bytea,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// 시험 생성 기록과 들은 결과(ADR 0003 '듣기 결과', T5 스펙 5절). 요청 id를 공급자 호출 전에 선점하고, 완료되면 MP3를 담아 30일 보관한다.
// user 외래 키는 걸지 않는다(T4와 같다, 지속 소유 데이터의 외래 키는 T6에서 정한다).
export const trialGeneration = pgTable(
	"trial_generation",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// 서버가 정한 소유자(context.ownerId)
		ownerId: text("owner_id").notNull(),
		// 사용자 동작 하나에 브라우저가 만든 값. 같은 값의 재전송은 공급자를 다시 부르지 않는다
		requestId: uuid("request_id").notNull(),
		// 정리한 (공급자, 성우, 모델, 설정, 문장, 판)의 SHA-256(packages/api/src/trial.ts comboKey)
		comboKey: text("combo_key").notNull(),
		provider: text("provider").notNull(),
		voiceId: text("voice_id").notNull(),
		model: text("model").notNull(),
		// 그 모델이 받는 옵션만, 정리한 값(trial-options usedSettings)
		settings: jsonb("settings").notNull(),
		// 사용자가 쓴 문장(태그 제외, NFC, 앞뒤 공백 제거)
		text: text("text").notNull(),
		usageAmount: integer("usage_amount").notNull(),
		usageUnit: text("usage_unit").notNull(),
		status: text("status").notNull(),
		failureReason: text("failure_reason"),
		audio: bytea("audio"),
		audioType: text("audio_type"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		// 마지막으로 들은 때 + 30일. 만료 행은 새 결과를 쓸 때 지운다(cron 없음)
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		unique("trial_generation_request").on(t.ownerId, t.requestId),
		// 소유자별 동시 1건(tts-provider). 조회가 아니라 선점 insert가 이 인덱스에 걸려 막힌다
		uniqueIndex("trial_generation_one_pending")
			.on(t.ownerId)
			.where(sql`${t.status} = 'pending'`),
		// 저장된 결과 찾기(소유자·조합 키, 최신)
		index("trial_generation_find")
			.on(t.ownerId, t.comboKey, t.createdAt.desc())
			.where(sql`${t.status} = 'done'`),
		// 성우별 결과 목록(최신순)
		index("trial_generation_voice").on(t.ownerId, t.provider, t.voiceId, t.createdAt.desc()),
		check("trial_generation_provider", sql`${t.provider} in ('typecast', 'elevenlabs', 'fish_audio')`),
		check("trial_generation_status", sql`${t.status} in ('pending', 'done', 'failed', 'unknown')`),
		check("trial_generation_usage_unit", sql`${t.usageUnit} in ('credit', 'byte', 'free')`),
		// 완료된 행만 오디오가 있다
		check("trial_generation_audio", sql`(${t.status} = 'done') = (${t.audio} is not null)`),
	],
);
```

- [x] **Step 2: export** — `packages/db/src/schema/index.ts`에 `export * from "./trial-generation";`를 더한다.
- [x] **Step 3: 타입 검사** — `pnpm --filter @tts-pilot-app/db check-types` 0.
- [x] **Step 4: 마이그레이션 생성(코디네이터)** — `pnpm --filter @tts-pilot-app/db db:generate`. 생성 SQL을 읽는다: `CREATE TABLE "trial_generation"`, 유니크 제약 하나, `CREATE UNIQUE INDEX … WHERE "status" = 'pending'`, 인덱스 둘(`created_at DESC`, 찾기 인덱스의 `WHERE`), `CHECK` 넷. 기존 표 변경·`DROP`이 없어야 한다(9행: 파괴적 변경 없음).
- [x] **Step 5: 적용(코디네이터)** — `pnpm --filter @tts-pilot-app/db db:migrate`(로컬 5433 `tts-pilot-app`, 실행 전 `podman ps`로 포트 확인), `source .superpowers/sdd/T05-my-sentence-listening-plan/tools/testdb.env && DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @tts-pilot-app/db db:migrate`(테스트 DB). 다시 `db:generate`로 `No schema changes` 확인. 증거(5·7행): 파일 경로, SQL 요약, 두 DB 출력 요약(URL 없이).

### Task 4: 생성 기록 모듈

**Files:**
- Modify: `packages/api/src/voice-cache.ts`, `packages/api/src/providers/errors.ts`
- Create: `packages/api/src/trial.ts`, `packages/api/src/trial.test.ts`

**Interfaces:**
- Consumes: Task 2 `TrialRequest`, `Usage`, `comboSignature`, `normalizeText`, `usedSettings`, `TRIAL_RESULTS_SHOWN`, `TrialAudio`, `TrialItemInput`, `trialFailureSchema`; Task 3 `trialGeneration`; Task 5의 `trialError`(이 태스크가 먼저 `errors.ts`에 더한다, Step 1).
- Produces(`voice-cache.ts`): `cooldownOf(db, provider, now): Promise<Date | null>`(export), `recordCooldown(db, provider, retryAt: Date): Promise<void>`, `logDbFailure(prefix, step, error): void`, `guard(step, run, prefix = "[voiceCache]")`(export), `cacheKey`(이미 export), `CacheScope`의 `kind`에 `"models"`.
- Produces(`trial.ts`): `TRIAL_CONTRACT_VERSION = 1`, `comboKey(request): string`, `audioFile(bytes: Uint8Array): File`, `withStorage<T>(provider | undefined, run): Promise<T>`, `claim(db, input): Promise<Claim>`, `replay(provider, row): TrialAudio`, `complete(db, ownerId, id, audio): Promise<void>`, `settle(db, ownerId, id, status, reason): Promise<void>`, `sweep(db, ownerId): Promise<void>`, `findSaved(db, ownerId, key): Promise<TrialAudio | null>`, `listResults(db, ownerId, provider, voiceId): Promise<TrialItemInput[]>`, `audioOf(db, ownerId, id): Promise<TrialAudio>`, `remove(db, ownerId, id): Promise<true>`. 생성 뒤 기록 쓰기는 `voice-cache.ts`의 `guard(step, run, "[trial]")`를 쓴다(계획 리뷰 ponytail 10).

- [x] **Step 1: `errors.ts`에 시험 생성 오류 더하기** — 파일 끝에 붙인다(Task 5가 이어서 `runTrial`을 더한다).

```ts
// 시험 생성 사유별 oRPC 코드(스펙 6절). 공급자 사유는 목록과 같다
const TRIAL_CODE = {
	...FAILURE_CODE,
	provider_input: "BAD_REQUEST",
	in_progress: "TOO_MANY_REQUESTS",
	free_ended: "BAD_REQUEST",
	request_mismatch: "BAD_REQUEST",
	storage: "SERVICE_UNAVAILABLE",
} as const satisfies Record<TrialFailure, string>;

// 시험 생성 오류. data에는 공급자·사유(·다음 호출 가능 시각·입력 거절의 공급자 오류 코드)만 담고 원래 오류를 붙이지 않는다
export function trialError(
	provider: ProviderId | undefined,
	reason: TrialFailure,
	extra: { retryAt?: string; providerCode?: string } = {},
) {
	const data: TrialErrorData = { provider, reason, ...extra };
	return new ORPCError(TRIAL_CODE[reason], { data });
}
```
`errors.ts` 맨 위 import에 `import type { TrialErrorData, TrialFailure } from "./trial-contract";`를 더한다.

- [x] **Step 2: `voice-cache.ts` 바꾸기** — 동작은 그대로 두고 함수를 빼낸다.
  - `CacheScope`의 공개 kind를 `"public" | "accents" | "models"`로 넓힌다(주석: models는 ElevenLabs 모델 배율, T5).
  - `guard`의 로그 줄을 `logDbFailure`로 빼낸다.

```ts
// DB 오류 한 줄. drizzle 오류의 message에는 SQL과 값이 들어 있어 이름과 코드(ECONNREFUSED 등)만 남긴다
export function logDbFailure(prefix: string, step: string, error: unknown) {
	const name = error instanceof Error ? error.name : typeof error;
	const { code, cause } = (error ?? {}) as { code?: unknown; cause?: { code?: unknown } };
	const tag =
		typeof cause?.code === "string" ? cause.code : typeof code === "string" ? code : "";
	console.error(`${prefix} ${step} 실패: ${name}${tag ? ` ${tag}` : ""}`);
}
```
  `guard`는 `export async function guard<T>(step: string, run: () => Promise<T>, prefix = "[voiceCache]"): Promise<T | undefined>`가 되고 catch는 `logDbFailure(prefix, step, error); return undefined;`다(목록 로그 글자 그대로: `[voiceCache] 읽기 실패: …`). 시험 생성의 "생성 뒤 기록 쓰기"가 `guard(step, run, "[trial]")`로 같이 쓴다(따로 `quietly`를 만들지 않는다, 계획 리뷰 ponytail 10).
  - `cooldownOf` 앞에 `export`를 붙이고 주석에 "목록과 시험 생성(T5)이 함께 쓴다"를 더한다.
  - `cachedList` catch의 대기 쓰기를 함수로 빼낸다.

```ts
// 429 대기 시각을 적는다(목록과 시험 생성이 함께 쓴다). 1시간 뒤까지만(계획 리뷰 E16)
export async function recordCooldown(db: Database, provider: ProviderId, retryAt: Date) {
	const until = new Date(Math.min(retryAt.getTime(), Date.now() + MAX_COOLDOWN_MS));
	await db
		.insert(providerCooldown)
		.values({ provider, until })
		.onConflictDoUpdate({ target: providerCooldown.provider, set: { until } });
}
```
  `cachedList`의 그 자리는 `await guard("대기 쓰기", () => recordCooldown(db, scope.provider, new Date(Date.parse(data.retryAt as string))));`가 된다.
  - 확인: `source .superpowers/sdd/T05-my-sentence-listening-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/voice-cache.test.ts src/routers/voice-list.isolation.test.ts` 그대로 통과.

- [x] **Step 3: `trial.test.ts` 쓰기(실패)**

```ts
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { testDb as db, testDatabaseUrl as url } from "./test-db";
import { DEFAULT_SETTINGS, type TrialRequest } from "./providers/trial-options";
import {
	audioOf,
	claim,
	comboKey,
	complete,
	findSaved,
	listResults,
	remove,
	settle,
	sweep,
} from "./trial";

const A = `trial-a-${Date.now()}`;
const B = `trial-b-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 7, 7]);
const request = (text = "안녕하세요", voiceId = "el0001"): TrialRequest => ({
	provider: "elevenlabs",
	voiceId,
	text,
	settings: DEFAULT_SETTINGS.elevenlabs,
});
const usage = { unit: "credit", amount: 5 } as const;
const id = () => crypto.randomUUID();
const claimFor = (ownerId: string, req = request(), requestId = id()) =>
	claim(db, { ownerId, requestId, request: req, key: comboKey(req), usage });
const DAY = 24 * 60 * 60 * 1000;

describe("comboKey (Review Focus 1)", () => {
	it("같은 소리의 요청은 같은 조합 키다", () => {
		// 유니언을 펼치지 않고 공급자를 적는다(계획 리뷰 E6: 펼치면 TrialRequest 타입 오류)
		const reordered: TrialRequest = {
			provider: "elevenlabs",
			voiceId: "el0001",
			text: "  안녕하세요 ",
			settings: { ...DEFAULT_SETTINGS.elevenlabs, style: 0.9, stability: 0.1 + 0.4 },
		};
		expect(comboKey(reordered)).toBe(comboKey(request()));
		expect(comboKey(request("안녕"))).not.toBe(comboKey(request()));
	});
});

describe.skipIf(!url)("생성 기록", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.$client.end();
	});

	it("선점하고 완료하면 찾기가 오디오를 돌려주고 만료를 30일 뒤로 늘린다", async () => {
		const claimed = await claimFor(A);
		expect(claimed.kind).toBe("claimed");
		if (claimed.kind !== "claimed") return;
		await complete(db, A, claimed.id, MP3);
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() + DAY) })
			.where(eq(trialGeneration.id, claimed.id));
		const saved = await findSaved(db, A, comboKey(request()));
		expect(saved?.id).toBe(claimed.id);
		expect(saved?.audio.type).toBe("audio/mpeg");
		expect(new Uint8Array(await (saved?.audio.arrayBuffer() ?? new ArrayBuffer(0)))).toEqual(MP3);
		const [row] = await db.select().from(trialGeneration);
		expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
	});

	it("같은 요청 id·같은 조합은 기존 행, 다른 조합은 request_mismatch", async () => {
		const requestId = id();
		const first = await claimFor(A, request(), requestId);
		expect(first.kind).toBe("claimed");
		const again = await claimFor(A, request(), requestId);
		expect(again).toMatchObject({ kind: "existing", row: { status: "pending" } });
		await expect(claimFor(A, request("다른 문장"), requestId)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "request_mismatch" },
		});
	});

	it("만드는 중이 있으면 다른 요청 id는 in_progress, 5분 넘은 진행 중은 unknown이 되어 막지 않는다", async () => {
		const first = await claimFor(A);
		await expect(claimFor(A, request("둘째"))).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			data: { reason: "in_progress" },
		});
		if (first.kind !== "claimed") return;
		await db
			.update(trialGeneration)
			.set({ createdAt: new Date(Date.now() - 6 * 60 * 1000) })
			.where(eq(trialGeneration.id, first.id));
		expect((await claimFor(A, request("셋째"))).kind).toBe("claimed");
		const [old] = await db.select().from(trialGeneration).where(eq(trialGeneration.id, first.id));
		expect(old?.status).toBe("unknown");
	});

	it("실패·미확인은 찾기에 나오지 않고 만료 행은 정리된다(진행 중은 남는다)", async () => {
		const failed = await claimFor(A);
		if (failed.kind !== "claimed") return;
		await settle(db, A, failed.id, "failed", "quota");
		expect(await findSaved(db, A, comboKey(request()))).toBeNull();
		const done = await claimFor(A, request("만료"));
		if (done.kind !== "claimed") return;
		await complete(db, A, done.id, MP3);
		await db
			.update(trialGeneration)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(trialGeneration.id, done.id));
		expect(await findSaved(db, A, comboKey(request("만료")))).toBeNull();
		await claimFor(A, request("진행 중"));
		await db.update(trialGeneration).set({ expiresAt: new Date(Date.now() - 1000) });
		await sweep(db, A);
		const left = await db.select().from(trialGeneration);
		expect(left.map((row) => row.status)).toEqual(["pending"]);
	});

	it("목록은 그 성우의 완료 결과만 최신순 20개, 요청을 담는다", async () => {
		for (let i = 0; i < 21; i += 1) {
			const c = await claimFor(A, request(`문장 ${i}`));
			if (c.kind === "claimed") await complete(db, A, c.id, MP3);
		}
		const other = await claimFor(A, request("다른 성우", "el0002"));
		if (other.kind === "claimed") await complete(db, A, other.id, MP3);
		const items = await listResults(db, A, "elevenlabs", "el0001");
		expect(items).toHaveLength(20);
		expect(items[0]?.request).toMatchObject({ voiceId: "el0001", text: "문장 20" });
	});

	it("다른 소유자의 결과는 오디오·지우기 모두 NOT_FOUND이고 행은 그대로다", async () => {
		const c = await claimFor(A);
		if (c.kind !== "claimed") return;
		await complete(db, A, c.id, MP3);
		// 다른 소유자의 완료 쓰기는 행을 바꾸지 않는다(계획 리뷰 E12)
		await complete(db, B, c.id, new Uint8Array([1]));
		await expect(audioOf(db, B, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(remove(db, B, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await audioOf(db, A, c.id)).id).toBe(c.id);
		await remove(db, A, c.id);
		await expect(audioOf(db, A, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
```

- [x] **Step 4: 실행해 실패 확인** — `source .superpowers/sdd/T05-my-sentence-listening-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/trial.test.ts`. 기대: 모듈 없음.

- [x] **Step 5: `trial.ts` 쓰기**

```ts
import { ORPCError } from "@orpc/server";
import type { Database } from "@tts-pilot-app/db";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";

import type { ProviderId } from "./providers/contract";
import { trialError } from "./providers/errors";
import {
	type TrialAudio,
	type TrialFailure,
	type TrialItemInput,
	trialFailureSchema,
} from "./providers/trial-contract";
import {
	comboSignature,
	normalizeText,
	TRIAL_RESULTS_SHOWN,
	type TrialRequest,
	type Usage,
	usedSettings,
} from "./providers/trial-options";
import { cacheKey, logDbFailure } from "./voice-cache";

// 시험 생성 기록과 들은 결과(ADR 0003 '듣기 결과', T5 스펙 5절). 모든 읽기·쓰기에 소유자 조건을 넣는다(bts-api 불변식 3).
// 정리·옵션·조합 글자가 바뀌어 같은 요청이 다른 소리를 내게 되면 판을 올린다(옛 결과를 찾지 않는다).
// 판을 올릴 때는 같은 마이그레이션에서 `delete from trial_generation`으로 옛 결과를 지운다. 목록(listResults)은 판을 거르지 않고
// 화면의 '저장된 결과' 판정(comboSignature)에는 판이 없어서, 옛 행이 남으면 '저장됨'인데 찾기가 못 찾는다(계획 리뷰 E13)
export const TRIAL_CONTRACT_VERSION = 1;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
// 함수 최대 실행 시간(ADR 0002: 300초)보다 오래 '만드는 중'이면 처리 여부를 모르는 것으로 옮긴다(tts-provider)
const STALE_PENDING_MS = 5 * 60 * 1000;
const t = trialGeneration;

// 목록 캐시와 같은 해시 함수를 쓴다(voice-cache cacheKey, 계획 리뷰 ponytail 12)
export const comboKey = (request: TrialRequest) =>
	cacheKey({ v: TRIAL_CONTRACT_VERSION, sig: comboSignature(request) });

// Buffer(bytea)를 ArrayBuffer로 복사해 File로 만든다
export const audioFile = (bytes: Uint8Array) =>
	new File([new Uint8Array(bytes)], "trial.mp3", { type: "audio/mpeg" });

// DB가 실패하면 공급자를 부르지 않고 storage로 거절한다(로드맵 T5 메모). 의도한 거절(ORPCError)은 그대로 던진다
export async function withStorage<T>(
	provider: ProviderId | undefined,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		logDbFailure("[trial]", "저장소", error);
		throw trialError(provider, "storage");
	}
}

const resultColumns = {
	id: t.id,
	createdAt: t.createdAt,
	usageUnit: t.usageUnit,
	usageAmount: t.usageAmount,
	audio: t.audio,
};
type ResultRow = {
	id: string;
	createdAt: Date;
	usageUnit: string;
	usageAmount: number;
	audio: Buffer | null;
};
const usageOf = (row: Pick<ResultRow, "usageUnit" | "usageAmount">): Usage => ({
	unit: row.usageUnit as Usage["unit"],
	amount: row.usageAmount,
});
function toAudio(row: ResultRow): TrialAudio {
	if (!row.audio) throw new ORPCError("NOT_FOUND");
	return {
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		usage: usageOf(row),
		audio: audioFile(row.audio),
	};
}
const later = () => new Date(Date.now() + KEEP_MS);

type ExistingRow = ResultRow & { comboKey: string; status: string; failureReason: string | null };
export type Claim =
	| { kind: "claimed"; id: string; createdAt: string }
	| { kind: "existing"; row: ExistingRow };

// 공급자 호출 전에 요청 id를 선점한다(tts-provider 중복 과금). 충돌은 조회가 아니라 유니크 제약(요청 id, 소유자별 진행 중 하나)이 막는다
export async function claim(
	db: Database,
	input: { ownerId: string; requestId: string; request: TrialRequest; key: string; usage: Usage },
): Promise<Claim> {
	const { ownerId, requestId, request, key, usage } = input;
	await db
		.update(t)
		.set({ status: "unknown" })
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.status, "pending"),
				lt(t.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
			),
		);
	const [row] = await db
		.insert(t)
		.values({
			ownerId,
			requestId,
			comboKey: key,
			provider: request.provider,
			voiceId: request.voiceId,
			model: request.settings.model,
			settings: usedSettings(request),
			text: normalizeText(request.text),
			usageAmount: usage.amount,
			usageUnit: usage.unit,
			status: "pending",
			expiresAt: later(),
		})
		// 대상 없이: 요청 id 유니크와 진행 중 부분 유니크 어느 쪽에 걸려도 넣지 않는다
		.onConflictDoNothing()
		.returning({ id: t.id, createdAt: t.createdAt });
	if (row) return { kind: "claimed", id: row.id, createdAt: row.createdAt.toISOString() };
	const [existing] = await db
		.select({ ...resultColumns, comboKey: t.comboKey, status: t.status, failureReason: t.failureReason })
		.from(t)
		.where(and(eq(t.ownerId, ownerId), eq(t.requestId, requestId)))
		.limit(1);
	// 같은 요청 id가 없으면 진행 중인 다른 요청에 걸린 것이다
	if (!existing) throw trialError(request.provider, "in_progress");
	if (existing.comboKey !== key) throw trialError(request.provider, "request_mismatch");
	return { kind: "existing", row: existing };
}

// 같은 요청 id가 다시 왔다(재전송, 두 번 누름). 공급자를 다시 부르지 않고 그 행의 상태를 돌려준다
export function replay(provider: ProviderId, row: ExistingRow): TrialAudio {
	if (row.status === "done") return toAudio(row);
	if (row.status === "pending") throw trialError(provider, "in_progress");
	if (row.status === "unknown") throw trialError(provider, "unknown_outcome");
	const reason: TrialFailure = trialFailureSchema.safeParse(row.failureReason).data ?? "provider_error";
	throw trialError(provider, reason);
}

// id는 같은 요청의 선점에서 온 값이지만 소유자 조건을 함께 건다(bts-api 불변식 3, 계획 리뷰 E12)
export async function complete(db: Database, ownerId: string, id: string, audio: Uint8Array) {
	await db
		.update(t)
		.set({ status: "done", audio: Buffer.from(audio), audioType: "audio/mpeg", expiresAt: later() })
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId)));
}

export async function settle(
	db: Database,
	ownerId: string,
	id: string,
	status: "failed" | "unknown",
	reason: TrialFailure,
) {
	await db
		.update(t)
		.set({ status, failureReason: reason })
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId)));
}

// 만료 행 정리(새 결과를 쓸 때, cron 없음). 진행 중인 행은 남긴다
export async function sweep(db: Database, ownerId: string) {
	await db
		.delete(t)
		.where(and(eq(t.ownerId, ownerId), lt(t.expiresAt, new Date()), ne(t.status, "pending")));
}

// 저장된 결과(완료, 만료 전) 가운데 가장 최근 것. 오디오와 만료 연장은 audioOf 한 곳이 맡는다(계획 리뷰 ponytail 13)
export async function findSaved(db: Database, ownerId: string, key: string) {
	const [row] = await db
		.select({ id: t.id })
		.from(t)
		.where(
			and(eq(t.ownerId, ownerId), eq(t.comboKey, key), eq(t.status, "done"), gt(t.expiresAt, new Date())),
		)
		.orderBy(desc(t.createdAt))
		.limit(1);
	return row ? audioOf(db, ownerId, row.id) : null;
}

// 성우 하나의 완료 결과(오디오 없음) 최신순. 설정은 저장한 정리 값이고 출력 스키마가 기본값을 채워 다시 검사한다
export async function listResults(
	db: Database,
	ownerId: string,
	provider: ProviderId,
	voiceId: string,
): Promise<TrialItemInput[]> {
	const rows = await db
		.select({
			id: t.id,
			createdAt: t.createdAt,
			usageUnit: t.usageUnit,
			usageAmount: t.usageAmount,
			text: t.text,
			settings: t.settings,
		})
		.from(t)
		.where(
			and(
				eq(t.ownerId, ownerId),
				eq(t.provider, provider),
				eq(t.voiceId, voiceId),
				eq(t.status, "done"),
				gt(t.expiresAt, new Date()),
			),
		)
		.orderBy(desc(t.createdAt))
		.limit(TRIAL_RESULTS_SHOWN);
	return rows.map((row) => ({
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		usage: usageOf(row),
		request: { provider, voiceId, text: row.text, settings: row.settings } as TrialItemInput["request"],
	}));
}

// 결과 하나의 오디오. 재생하면 만료를 30일 뒤로 늘린다. 남의 결과·없는 결과·만료는 NOT_FOUND(bts-api 불변식 3)
export async function audioOf(db: Database, ownerId: string, id: string) {
	const [row] = await db
		.update(t)
		.set({ expiresAt: later() })
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId), eq(t.status, "done"), gt(t.expiresAt, new Date())))
		.returning(resultColumns);
	if (!row) throw new ORPCError("NOT_FOUND");
	return toAudio(row);
}

// 결과 지우기(앱 DB에서만, 공급자는 건드리지 않는다). 진행 중인 행은 지우지 않는다
export async function remove(db: Database, ownerId: string, id: string): Promise<true> {
	const [row] = await db
		.delete(t)
		.where(and(eq(t.id, id), eq(t.ownerId, ownerId), ne(t.status, "pending")))
		.returning({ id: t.id });
	if (!row) throw new ORPCError("NOT_FOUND");
	return true;
}
```

- [x] **Step 6: 실행** — 같은 명령. 기대: 7 passed(comboKey 1 + DB 6), skipped 0. `pnpm --filter @tts-pilot-app/api check-types` 0.

### Task 5: 공급자 합성

**Files:**
- Modify: `packages/api/src/providers/errors.ts`, `errors.test.ts`, `typecast.ts`, `typecast.test.ts`, `elevenlabs.ts`, `elevenlabs.test.ts`, `fish-audio.ts`, `fish-audio.test.ts`

**Interfaces:**
- Consumes: Task 2 `TrialRequest`, `usedSettings`, `sentText`, `TrialModelRate`, `ELEVENLABS_MODELS`; Task 4 Step 1 `trialError`.
- Produces(`errors.ts`): `ProviderClient.synthesize?(request: TrialRequest): Promise<Uint8Array>`, `ProviderClient.listModels?(): Promise<TrialModelRate[]>`, `TRIAL_TIMEOUT_MS = 60_000`, `trialReason(status, codes): TrialFailure`, `retryAtFrom(retryAfter: string | null): string | undefined`(runList와 함께 쓴다), `runTrial<T>(provider, call: (signal) => Promise<T>): Promise<T>`, `fetchOk(url, init, codesOf?): Promise<Response>`(`fetchJson`이 이것을 쓴다).

- [x] **Step 1: `errors.test.ts`에 더하기(실패)**

```ts
describe("trialReason", () => {
	it("성우·플랜 거절(403 코드)과 404는 입력 거절이고 키 문제가 아니다", () => {
		expect(trialReason(403, ["voice_access_denied"])).toBe("provider_input");
		expect(trialReason(403, ["subscription_required"])).toBe("provider_input");
		expect(trialReason(404, [])).toBe("provider_input");
		expect(trialReason(403, ["insufficient_permissions"])).toBe("no_permission");
		expect(trialReason(401, [])).toBe("provider_auth");
		expect(trialReason(402, ["insufficient_credits"])).toBe("quota");
		expect(trialReason(429, [])).toBe("rate_limit");
		expect(trialReason(422, ["TEXT_NOT_SYNTHESIZABLE"])).toBe("provider_input");
		expect(trialReason(503, [])).toBe("provider_error");
		expect(trialReason(418, [])).toBe("provider_error");
	});
});

describe("runTrial", () => {
	it("60초가 지나면 처리 여부 미확인", async () => {
		vi.useFakeTimers();
		const pending = runTrial("fish_audio", () => new Promise<never>(() => {}));
		const assertion = expect(pending).rejects.toMatchObject({
			code: "GATEWAY_TIMEOUT",
			data: { provider: "fish_audio", reason: "unknown_outcome" },
		});
		await vi.advanceTimersByTimeAsync(TRIAL_TIMEOUT_MS);
		await assertion;
	});
	it("429는 Retry-After를 1시간까지 다음 호출 가능 시각으로, 입력 거절은 공급자 오류 코드를 담는다", async () => {
		await expect(
			runTrial("elevenlabs", async () => {
				throw new ProviderHttpError(429, [], "30");
			}),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", data: { reason: "rate_limit", retryAt: expect.any(String) } });
		await expect(
			runTrial("elevenlabs", async () => {
				throw new ProviderHttpError(403, ["voice_access_denied"]);
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "voice_access_denied" },
		});
	});
	it("연결 끊김(TypeError)과 상태 코드 없는 SDK 오류는 처리 여부 미확인(계획 리뷰 E1)", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			runTrial("typecast", async () => {
				throw new TypeError("fetch failed");
			}),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT", data: { reason: "unknown_outcome" } });
		// ElevenLabs SDK는 응답 전 네트워크 오류를 statusCode 없는 ElevenLabsError로 던진다. 원래 오류를 던지지 않는다(로그·화면 '다시 눌러'로 이중 과금)
		const sdkError = Object.assign(new Error("Network error"), { rawResponse: { headers: {} }, body: "secret" });
		const error = await runTrial("elevenlabs", async () => {
			throw sdkError;
		}).catch((e: unknown) => e);
		expect(error).toMatchObject({ code: "GATEWAY_TIMEOUT", data: { reason: "unknown_outcome" } });
		expect(error).not.toBe(sdkError);
		// 로그는 한 줄이고 SDK 오류 객체를 넘기지 않는다
		expect(log.mock.calls.flat().some((arg) => arg === sdkError)).toBe(false);
	});
});
```
(import에 `trialReason`, `runTrial`, `TRIAL_TIMEOUT_MS`, `ProviderHttpError`를 더하고, 파일에 `afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); })`가 없으면 더한다.)

- [x] **Step 2: `errors.ts`에 더하기**

```ts
// 시험 생성 시간 제한(스펙 4절). 200자 합성 응답을 기다린다
export const TRIAL_TIMEOUT_MS = 60_000;
// ElevenLabs 403 가운데 키가 아니라 성우·플랜·모델 문제인 코드(공식 오류 표). 화면이 문구를 고르도록 입력 거절로 보낸다
const VOICE_DENIED = new Set([
	"voice_access_denied",
	"subscription_required",
	"feature_not_available",
	"model_access_denied",
]);

// 시험 생성의 상태 코드 → 사유. 404(성우·모델 없음)는 입력 거절이다. 표에 없는 상태는 공급자 장애다
export function trialReason(status: number, codes: readonly string[] = []): TrialFailure {
	if (status === 403 && codes.some((code) => VOICE_DENIED.has(code))) return "provider_input";
	if (status === 404) return "provider_input";
	return reasonFromHttp(status, codes) ?? "provider_error";
}

// 429 Retry-After(초)를 다음 호출 가능 시각(ISO, 1시간까지)으로. 없거나 못 읽으면 undefined(목록과 시험 생성이 함께 쓴다, 계획 리뷰 E15)
export function retryAtFrom(retryAfter: string | null): string | undefined {
	const seconds = retryAfterSeconds(retryAfter);
	return seconds === null
		? undefined
		: new Date(Date.now() + Math.min(seconds, MAX_RETRY_SECONDS) * 1000).toISOString();
}

// 시험 생성 공통 틀: 60초, 재시도 없음. 공급자 응답(상태 코드)을 받지 못한 실패는 모두 처리 여부 미확인이다
// (시간 초과, 연결 끊김의 TypeError, ElevenLabs SDK의 statusCode 없는 오류, 그 밖의 예외). 돈에 안전한 쪽이다:
// 자동으로 다시 만들지 않고 화면이 "크레딧이 쓰였을 수 있으니 확인한 뒤"를 보인다(tts-provider, 계획 리뷰 E1).
// 원래 오류 객체는 던지지 않는다(rpc onError가 통째로 로그에 쓴다). 로그는 logFailure 한 줄(이름·필드 이름)뿐이다
export async function runTrial<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	try {
		return await withTimeout(call, TRIAL_TIMEOUT_MS);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) throw trialError(provider, "unknown_outcome");
		if (error instanceof ProviderHttpError) {
			const reason = trialReason(error.status, error.codes);
			throw trialError(provider, reason, {
				retryAt: reason === "rate_limit" ? retryAtFrom(error.retryAfter) : undefined,
				providerCode: reason === "provider_input" ? error.codes[0] : undefined,
			});
		}
		logFailure(`[trial] ${provider} 생성 실패`, error, []);
		throw trialError(provider, "unknown_outcome");
	}
}
```
  `runList`의 429 시각 계산(`const seconds = …`부터 `providerError(provider, failure, seconds === null ? undefined : …)`)을 `throw providerError(provider, failure, failure === "rate_limit" ? retryAtFrom(error.retryAfter) : undefined);` 한 줄로 바꾼다(동작 같음, 기존 errors 테스트 그대로 통과).

  `fetchJson`을 둘로 나눈다(Fish Audio 합성이 POST로 같은 `!ok` 처리를 쓴다, 계획 리뷰 ponytail 5).

```ts
// 응답이 2xx가 아니면 상태 코드·공급자 오류 코드·Retry-After를 담아 던진다.
// 키 헤더가 다른 호스트로의 리다이렉트를 따라가지 않게 한다(리다이렉트를 만나면 fetch가 TypeError를 던진다)
export async function fetchOk(
	url: string,
	init: RequestInit,
	codesOf: (body: unknown) => string[] = () => [],
): Promise<Response> {
	const response = await fetch(url, { ...init, redirect: "error" });
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		throw new ProviderHttpError(response.status, codesOf(body), response.headers.get("retry-after"));
	}
	return response;
}

export async function fetchJson(
	url: string,
	headers: Record<string, string>,
	signal: AbortSignal,
	codesOf: (body: unknown) => string[] = () => [],
): Promise<unknown> {
	return (await fetchOk(url, { headers, signal }, codesOf)).json();
}
```

  `ProviderClient`에 두 메서드를 더한다. 메서드 문법이라 매개변수가 이변이다: 공급자 구현은 자기 요청 모양(`Extract<TrialRequest, { provider: P }>`)만 받아도 들어간다(`listVoices`와 같다, 계획 리뷰 ponytail 6). 라우터가 `context.providers?.[request.provider]`로 고르므로 어긋나지 않는다.

```ts
	// 시험 생성 1회(T5). 유료다(Fish Audio 무료 모델 제외). MP3 바이트를 돌려준다. 재시도하지 않는다
	synthesize?(request: TrialRequest): Promise<Uint8Array>;
	// ElevenLabs만: 모델별 크레딧 배율(T5 예상 사용량)
	listModels?(): Promise<TrialModelRate[]>;
```
  import에 `import type { TrialModelRate } from "./trial-contract";`, `import type { TrialRequest } from "./trial-options";`를 더한다.

- [x] **Step 3: 공급자 테스트 쓰기(실패)** — 세 파일 끝에 각각 더한다. 공통 도우미(각 파일 안에): `const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 9]); const audio = () => new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } }); const bodyOf = (i = 0) => JSON.parse(String(fetchMock.mock.calls[i]?.[1]?.body));`. 여러 번 부르는 테스트는 `mockResolvedValue(audio())`(같은 `Response` 하나를 돌려줘 두 번째에 본문이 이미 읽힘)가 아니라 `mockImplementation(async () => audio())`를 쓴다(계획 리뷰 E2). `typecast.test.ts` import에 `calledUrl`을 더한다(E7). 세 파일 모두에 "fetch가 TypeError를 던지면 unknown_outcome이고 fetch 1회" 테스트를 넣는다(E1, 아래 각 파일 마지막 `it`).

`typecast.test.ts`:

```ts
describe("Typecast 시험 생성", () => {
	const synth = (settings: Partial<TypecastSettings> = {}) =>
		createTypecast(KEY).synthesize?.({
			provider: "typecast",
			voiceId: "tc_0001",
			text: "  안녕하세요 ",
			settings: { ...DEFAULT_SETTINGS.typecast, ...settings },
		});

	it("v30 자동 감정: MP3, 받는 옵션만, 언어 자동이면 language를 보내지 않고 바이트를 돌려준다", async () => {
		fetchMock.mockResolvedValueOnce(audio());
		await expect(synth({ tempo: 1.2, pitch: 2 })).resolves.toEqual(MP3);
		expect(calledUrl().pathname).toBe("/v1/text-to-speech");
		expect(bodyOf()).toEqual({
			text: "안녕하세요",
			voice_id: "tc_0001",
			model: "ssfm-v30",
			prompt: { emotion_type: "smart" },
			output: { audio_format: "mp3", audio_tempo: 1.2, audio_pitch: 2, volume: 100 },
		});
	});
	it("v30 프리셋과 v21, 한국어 고정", async () => {
		fetchMock.mockImplementation(async () => audio());
		await synth({ emotion: "preset", preset: "happy", intensity: 1.5, language: "kor" });
		expect(bodyOf(0)).toMatchObject({
			language: "kor",
			prompt: { emotion_type: "preset", emotion_preset: "happy", emotion_intensity: 1.5 },
		});
		await synth({ model: "ssfm-v21", preset: "sad" });
		expect(bodyOf(1).prompt).toEqual({ emotion_preset: "sad", emotion_intensity: 1 });
	});
	it("402는 quota, 422는 공급자 오류 코드를 담은 입력 거절, 500은 한 번만 부른다", async () => {
		fetchMock.mockResolvedValueOnce(json(402, { detail: "Insufficient credit" }));
		await expect(synth()).rejects.toMatchObject({ data: { reason: "quota" } });
		fetchMock.mockResolvedValueOnce(
			json(422, { message: "x", error_code: "TEXT_NOT_SYNTHESIZABLE" }),
		);
		await expect(synth()).rejects.toMatchObject({
			data: { reason: "provider_input", providerCode: "TEXT_NOT_SYNTHESIZABLE" },
		});
		fetchMock.mockClear();
		fetchMock.mockResolvedValueOnce(json(500, { detail: "x" }));
		await expect(synth()).rejects.toMatchObject({ data: { reason: "provider_error" } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("연결이 끊기면(fetch TypeError) 처리 여부 미확인이고 한 번만 부른다(E1)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT", data: { reason: "unknown_outcome" } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
```

`elevenlabs.test.ts`:

```ts
describe("ElevenLabs 시험 생성", () => {
	const synth = (settings: Partial<ElevenLabsSettings> = {}, text = "안녕") =>
		createElevenLabs(KEY).synthesize?.({
			provider: "elevenlabs",
			voiceId: "el0001",
			text,
			settings: { ...DEFAULT_SETTINGS.elevenlabs, ...settings },
		});

	it("v4: 말투 태그를 문장 앞에, 안정성·유사도만, MP3 128kbps", async () => {
		fetchMock.mockResolvedValueOnce(audio());
		await expect(synth({ tag: "whispers", style: 0.9 })).resolves.toEqual(MP3);
		expect(calledUrl().pathname).toBe("/v1/text-to-speech/el0001");
		expect(calledUrl().searchParams.get("output_format")).toBe("mp3_44100_128");
		expect(bodyOf()).toEqual({
			text: "[whispers] 안녕",
			model_id: "eleven_v4",
			voice_settings: { stability: 0.5, similarity_boost: 0.75 },
		});
	});
	it("multilingual v2는 다섯 옵션, v3는 안정성만(받지 않는 옵션은 null로도 보내지 않는다, E3)", async () => {
		fetchMock.mockImplementation(async () => audio());
		await synth({ model: "eleven_multilingual_v2", speed: 1.1, speakerBoost: false });
		expect(bodyOf(0).voice_settings).toEqual({
			stability: 0.5,
			similarity_boost: 0.75,
			style: 0,
			speed: 1.1,
			use_speaker_boost: false,
		});
		await synth({ model: "eleven_v3" });
		expect(bodyOf(1).voice_settings).toEqual({ stability: 0.5 });
	});
	it("SDK 재시도를 끈다: 500에도 한 번만, 402 insufficient_credits는 quota, 403 voice_access_denied는 입력 거절", async () => {
		fetchMock.mockResolvedValueOnce(json(500, { detail: { code: "internal_error" } }));
		await expect(synth()).rejects.toMatchObject({ data: { reason: "provider_error" } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		fetchMock.mockResolvedValueOnce(json(402, { detail: { code: "insufficient_credits" } }));
		await expect(synth()).rejects.toMatchObject({ data: { reason: "quota" } });
		fetchMock.mockResolvedValueOnce(json(403, { detail: { code: "voice_access_denied" } }));
		await expect(synth()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "voice_access_denied" },
		});
	});
	it("모델 배율: 쓰는 네 모델만, 배율 × 할인", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, [
				{ model_id: "eleven_v4", model_rates: { character_cost_multiplier: 1, cost_discount_multiplier: 0.28 } },
				{ model_id: "eleven_flash_v2_5", model_rates: { character_cost_multiplier: 0.5 } },
				{ model_id: "eleven_english_sts_v2", model_rates: { character_cost_multiplier: 1 } },
				{ model_id: "eleven_v3" },
			]),
		);
		await expect(createElevenLabs(KEY).listModels?.()).resolves.toEqual([
			{ model: "eleven_v4", multiplier: 0.28 },
			{ model: "eleven_flash_v2_5", multiplier: 0.5 },
		]);
		expect(calledUrl().pathname).toBe("/v1/models");
	});
	it("모양이 다른 모델 항목 하나가 배율 전체를 깨지 않는다(E11)", async () => {
		fetchMock.mockResolvedValueOnce(
			json(200, [
				{ model_id: "eleven_v4", model_rates: { character_cost_multiplier: 1 } },
				{ model_id: "eleven_v3", model_rates: { character_cost_multiplier: 0 } },
				"이상한 항목",
			]),
		);
		await expect(createElevenLabs(KEY).listModels?.()).resolves.toEqual([{ model: "eleven_v4", multiplier: 1 }]);
	});
	it("연결이 끊기면(SDK가 statusCode 없는 오류로 바꿔 던짐) 처리 여부 미확인이고 한 번만 부른다(E1)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT", data: { reason: "unknown_outcome" } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
```

`fish-audio.test.ts`:

```ts
describe("Fish Audio 시험 생성 (Review Focus 2)", () => {
	const synth = (settings: Partial<FishSettings> = {}) =>
		createFishAudio(KEY).synthesize?.({
			provider: "fish_audio",
			voiceId: "f".repeat(32),
			text: "안녕",
			settings: { ...DEFAULT_SETTINGS.fish_audio, ...settings },
		});

	it("두 모델 모두 model 헤더를 그대로 보내고 즉석 클론 필드는 보내지 않는다", async () => {
		fetchMock.mockImplementation(async () => audio());
		for (const model of ["s2.1-pro-free", "s2.1-pro"] as const) {
			fetchMock.mockClear();
			await expect(synth({ model, tag: "happy", speed: 1.2 })).resolves.toEqual(MP3);
			const [url, init] = fetchMock.mock.calls[0] ?? [];
			expect(String(url)).toBe("https://api.fish.audio/v1/tts");
			expect(new Headers(init?.headers).get("model")).toBe(model);
			const body = bodyOf();
			expect(body).toEqual({
				text: "[happy] 안녕",
				reference_id: "f".repeat(32),
				temperature: 0.7,
				prosody: { speed: 1.2 },
				format: "mp3",
				mp3_bitrate: 128,
				latency: "normal",
			});
			expect(body).not.toHaveProperty("references");
		}
	});
	it("402는 quota, Retry-After 없는 429는 시각 없이 rate_limit", async () => {
		fetchMock.mockResolvedValueOnce(json(402, { status: 402, message: "x", reason: null }));
		await expect(synth()).rejects.toMatchObject({ data: { reason: "quota" } });
		fetchMock.mockResolvedValueOnce(json(429, { status: 429, message: "x" }));
		const error = await synth()?.catch((e: unknown) => e);
		expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS", data: { reason: "rate_limit" } });
		expect((error as { data: { retryAt?: string } }).data.retryAt).toBeUndefined();
	});
	it("연결이 끊기면(fetch TypeError) 처리 여부 미확인이고 한 번만 부른다(E1)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(synth()).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT", data: { reason: "unknown_outcome" } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
```
(각 파일 import에 `DEFAULT_SETTINGS`와 그 공급자 설정 타입을 `./trial-options`에서 가져오고, `vi`가 없으면 vitest import에 더한다. `console.error` 감시는 그 파일의 `afterEach(() => vi.restoreAllMocks())`가 풀게 한다(없으면 더한다).)

- [x] **Step 4: 실행해 실패 확인** — `pnpm --filter @tts-pilot-app/api test src/providers`. 기대: `synthesize`가 없어 실패.

- [x] **Step 5: `typecast.ts` — 오류 코드와 합성** — 기존 `toHttpError`(47~51행)를 아래 것으로 **바꾼다**(새로 하나 더 두면 중복 선언이다, 계획 리뷰 E7).

```ts
// SDK 오류는 상태 코드와 본문의 error_code만 바꿔 담는다. 응답 헤더를 주지 않는다(Retry-After 없음, 설치본 lib/index.js 6~15행)
const typecastCodeSchema = z.object({ error_code: z.string() });
function toHttpError(error: unknown): never {
	if (!(error instanceof TypecastAPIError)) throw error;
	const code = typecastCodeSchema.safeParse(error.response).data?.error_code;
	throw new ProviderHttpError(error.statusCode, code ? [code] : []);
}
```
  `createTypecast`의 반환 객체에 더한다.

```ts
		// 매개변수는 이 공급자의 요청만 받는다(메서드 이변성, ProviderClient 주석)
		synthesize: (request: Extract<TrialRequest, { provider: "typecast" }>) =>
			// ponytail: SDK에 취소 신호가 없어 runTrial의 60초 경주로만 끊는다. 끊긴 요청은 뒤에서 끝까지 돌아 과금될 수 있다(처리 여부 미확인으로 알린다, 스펙 13절).
			// 늦게 온 결과를 저장해 다음 찾기에서 크레딧 0으로 재생하는 일은 하지 않는다(계획 리뷰 E9 기각, 백로그 T9 메모)
			runTrial("typecast", async () => {
				const s = usedSettings(request) as Partial<TypecastSettings> & { model: TypecastModel };
				const prompt =
					s.emotion === "smart"
						? { emotion_type: "smart" as const }
						: s.model === "ssfm-v30"
							? { emotion_type: "preset" as const, emotion_preset: s.preset, emotion_intensity: s.intensity }
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
			}),
```
  import: `runTrial`(errors), `sentText`, `usedSettings`, `type TrialRequest`, `type TypecastModel`, `type TypecastSettings`(trial-options).

- [x] **Step 6: `elevenlabs.ts` — 오류 바꿔 담기 공용, 합성, 모델 배율**

```ts
// SDK 오류는 상태 코드·공급자 오류 코드·Retry-After만 바꿔 담는다(연결 확인과 시험 생성이 함께 쓴다)
function toHttpError(error: unknown): never {
	throw error instanceof ElevenLabsError && error.statusCode !== undefined
		? new ProviderHttpError(
				error.statusCode,
				detailCodes(error.body),
				error.rawResponse?.headers.get("retry-after") ?? null,
			)
		: error;
}
// GET /v1/models 항목. 항목마다 검사해 모양이 다르거나 배율이 없는 모델·쓰지 않는 모델은 뺀다
// (응답 전체를 parse하면 쓰지 않는 모델 하나 때문에 배율 전체가 실패한다, T4 목록과 같은 규칙, 계획 리뷰 E11)
const modelSchema = z.looseObject({
	model_id: z.string(),
	model_rates: z.object({
		character_cost_multiplier: z.number().positive(),
		cost_discount_multiplier: z.number().positive().nullish(),
	}),
});
const isTrialModel = (id: string): id is ElevenLabsModel =>
	(ELEVENLABS_MODELS as readonly string[]).includes(id);
```
  `checkStatus`의 `.catch((error: unknown) => { throw … })`를 `.catch(toHttpError)`로 바꾼다. 반환 객체에 더한다.

```ts
		synthesize: (request: Extract<TrialRequest, { provider: "elevenlabs" }>) =>
			runTrial("elevenlabs", async (signal) => {
				const s = usedSettings(request) as Partial<ElevenLabsSettings> & { model: ElevenLabsModel };
				// SDK는 명시적 undefined를 null로 보낸다(설치본 직렬화, 계획 리뷰 E3). 그 모델이 받는 옵션만 키로 남긴다
				const voiceSettings = Object.fromEntries(
					Object.entries({
						stability: s.stability,
						similarityBoost: s.similarity,
						style: s.style,
						speed: s.speed,
						useSpeakerBoost: s.speakerBoost,
					}).filter(([, value]) => value !== undefined),
				);
				const stream = await client.textToSpeech
					.convert(
						request.voiceId,
						{
							text: sentText(request),
							modelId: s.model,
							outputFormat: "mp3_44100_128",
							voiceSettings,
						},
						// 자동 재시도를 끈다(기본 2회, 408·429·5xx). 시간 제한은 runTrial의 신호로 한다
						{ maxRetries: 0, abortSignal: signal },
					)
					.catch(toHttpError);
				return new Uint8Array(await new Response(stream).arrayBuffer());
			}),
		listModels: () =>
			runList("elevenlabs", async (signal): Promise<TrialModelRate[]> =>
				z
					.array(z.unknown())
					.parse(await getJson("/v1/models", new URLSearchParams(), signal))
					.flatMap((item) => {
						const model = modelSchema.safeParse(item).data;
						return model && isTrialModel(model.model_id)
							? [
									{
										model: model.model_id,
										multiplier:
											model.model_rates.character_cost_multiplier *
											(model.model_rates.cost_discount_multiplier ?? 1),
									},
								]
							: [];
					}),
			),
```
  import에 `type TrialRequest`(trial-options)를 더한다.

- [x] **Step 7: `fish-audio.ts` — 합성**

```ts
// 오류 본문 {status, message, reason}의 reason(있으면)
const fishErrorSchema = z.object({ reason: z.string().min(1) });
const fishCodes = (body: unknown) => {
	const reason = fishErrorSchema.safeParse(body).data?.reason;
	return reason ? [reason] : [];
};
```
  반환 객체에 더한다. `!ok` 처리와 `redirect: "error"`는 `fetchOk`가 맡는다(계획 리뷰 ponytail 5).

```ts
		synthesize: (request: Extract<TrialRequest, { provider: "fish_audio" }>) =>
			runTrial("fish_audio", async (signal) => {
				const s = usedSettings(request) as Partial<FishSettings> & { model: FishModel };
				const response = await fetchOk(
					`${FISH_AUDIO_HOST}/v1/tts`,
					{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
						// 늘 보낸다. 빠지거나 모르는 값이면 오류 없이 유료 s2.1-pro로 처리된다(스펙 4절)
						model: s.model,
					},
					// 계약 필드로만 만든다. references(요청 안의 즉석 클론)는 보내지 않는다(tts-provider)
					body: JSON.stringify({
						text: sentText(request),
						reference_id: request.voiceId,
						temperature: s.temperature,
						prosody: { speed: s.speed },
						format: "mp3",
						mp3_bitrate: 128,
						latency: "normal",
					}),
					signal,
					},
					fishCodes,
				);
				return new Uint8Array(await response.arrayBuffer());
			}),
```
  (들여쓰기는 biome가 맞춘다.) import에 `fetchOk`(errors), `type TrialRequest`(trial-options)를 더한다.

- [x] **Step 8: 실행** — `pnpm --filter @tts-pilot-app/api test src/providers`, `pnpm --filter @tts-pilot-app/api check-types`. 기대: 모두 통과, 타입 0(라우터는 아직 바뀌지 않아 타입이 깨지지 않는다).

### Task 6: 프로시저 여섯과 격리 테스트

**Files:**
- Create: `packages/api/src/routers/trial.ts`, `trial.test.ts`, `trial.isolation.test.ts`
- Modify: `packages/api/src/routers/index.ts`

**Interfaces:**
- Consumes: Task 2 계약·옵션, Task 4 `trial.ts`·`cooldownOf`·`recordCooldown`·`cachedList`·`guard`, Task 5 `synthesize`·`listModels`·`trialError`·`providerError`·`logFailure`.
- Produces: `appRouter.trialModels()`, `trialFind(request) → TrialAudio | null`, `trialCreate({ requestId, request }) → TrialAudio`, `trialList({ provider, voiceId }) → TrialItem[]`, `trialAudio({ id }) → TrialAudio`, `trialDelete({ id }) → { deleted: true }`. 화면(Task 9~11)이 `orpc.trial*`·`client.trial*`로 쓴다.

- [x] **Step 1: `trial.test.ts` 쓰기(실패)**

```ts
import { createRouterClient } from "@orpc/server";
import { providerCooldown, providerListCache } from "@tts-pilot-app/db/schema/provider-cache";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { trialError } from "../providers/errors";
import type { Providers } from "../providers/index";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	FISH_FREE_UNTIL,
	type TrialRequest,
} from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const OWNER = `trial-r-${Date.now()}`;
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 3]);
const synthesize = vi.fn(async (_request: TrialRequest) => MP3);
const listModels = vi.fn(async () => [{ model: "eleven_v4" as const, multiplier: 0.5 }]);
const providers: Providers = {
	typecast: { checkStatus: vi.fn(), synthesize },
	elevenlabs: { checkStatus: vi.fn(), synthesize, listModels },
	fish_audio: { checkStatus: vi.fn(), synthesize },
};
const as = (ownerId: string | null, ctx: Partial<Context> = {}) =>
	createRouterClient(appRouter, { context: { db, ownerId, providers, ...ctx } as Context });
const request = (text = "안녕하세요"): TrialRequest => ({
	provider: "elevenlabs",
	voiceId: "el0001",
	text,
	settings: DEFAULT_SETTINGS.elevenlabs,
});
const bytes = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
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
// 진짜 DB를 감싸 쓰기(insert)만 던진다: 대기 표 읽기는 지나고 선점에서 실패한다(계획 리뷰 E5)
const insertFailingDb = new Proxy(db, {
	get(target, key, receiver) {
		if (key === "insert") {
			return () => {
				throw new Error("insert");
			};
		}
		return Reflect.get(target, key, receiver);
	},
}) as Context["db"];

describe.skipIf(!url)("시험 생성 프로시저", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		await db.delete(providerCooldown);
		await db.delete(providerListCache);
		synthesize.mockClear();
		listModels.mockClear();
		vi.useRealTimers();
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.delete(providerCooldown);
		await db.delete(providerListCache);
		await db.$client.end();
	});

	it("만들면 공급자 1회·배율 반영 사용량·오디오, 같은 조합 찾기는 공급자 0회로 저장본(AC7)", async () => {
		const made = await as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request() });
		expect(synthesize).toHaveBeenCalledTimes(1);
		expect(made.usage).toEqual({ unit: "credit", amount: 3 });
		expect(await bytes(made.audio)).toEqual(MP3);
		const found = await as(OWNER).trialFind({ ...request("  안녕하세요 "), settings: {} } as never);
		expect(found?.id).toBe(made.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("같은 요청 id 동시 두 번과 다른 요청 id 동시: 공급자 1회, 나머지는 in_progress, 끝난 뒤 같은 id는 저장본(AC8)", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return MP3;
		});
		const id = crypto.randomUUID();
		const first = as(OWNER).trialCreate({ requestId: id, request: request() });
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		const inProgress = { code: "TOO_MANY_REQUESTS", data: { reason: "in_progress" } };
		await expect(as(OWNER).trialCreate({ requestId: id, request: request() })).rejects.toMatchObject(inProgress);
		await expect(
			as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request("다른") }),
		).rejects.toMatchObject(inProgress);
		release();
		const done = await first;
		const again = await as(OWNER).trialCreate({ requestId: id, request: request() });
		expect(again.id).toBe(done.id);
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("대기 시각 전이면 공급자 0회와 rate_limit, 429를 받으면 대기 시각을 적는다(AC12)", async () => {
		synthesize.mockRejectedValueOnce(
			trialError("elevenlabs", "rate_limit", { retryAt: new Date(Date.now() + 60_000).toISOString() }),
		);
		await expect(
			as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request() }),
		).rejects.toMatchObject({ data: { reason: "rate_limit" } });
		const [cooldown] = await db.select().from(providerCooldown);
		expect(cooldown?.provider).toBe("elevenlabs");
		await expect(
			as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request("둘째") }),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", data: { reason: "rate_limit", retryAt: expect.any(String) } });
		expect(synthesize).toHaveBeenCalledTimes(1);
	});

	it("시간 초과는 처리 여부 미확인이고 그 조합은 저장본이 없다", async () => {
		synthesize.mockRejectedValueOnce(trialError("elevenlabs", "unknown_outcome"));
		await expect(
			as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request() }),
		).rejects.toMatchObject({ code: "GATEWAY_TIMEOUT" });
		expect(await as(OWNER).trialFind(request())).toBeNull();
		const [row] = await db.select().from(trialGeneration);
		expect(row?.status).toBe("unknown");
	});

	it("DB가 실패하면 공급자를 부르지 않고 storage(AC13)", async () => {
		dbTouches = 0;
		await expect(
			as(OWNER, { db: failingDb }).trialCreate({ requestId: crypto.randomUUID(), request: request() }),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", data: { reason: "storage" } });
		expect(dbTouches).toBeGreaterThan(0);
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("선점(생성 기록 쓰기)이 실패해도 공급자를 부르지 않고 storage, 찾기·목록도 storage(AC13, E5)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(
			as(OWNER, { db: insertFailingDb }).trialCreate({ requestId: crypto.randomUUID(), request: request() }),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", data: { reason: "storage" } });
		expect(synthesize).not.toHaveBeenCalled();
		await expect(as(OWNER, { db: failingDb }).trialFind(request())).rejects.toMatchObject({
			code: "SERVICE_UNAVAILABLE",
		});
		await expect(
			as(OWNER, { db: failingDb }).trialList({ provider: "elevenlabs", voiceId: "el0001" }),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	});

	it("목록 항목의 요청은 원래 요청과 같은 조합이고, 그 요청으로 찾으면 같은 결과다(Review Focus 1 화면↔서버 왕복, E4)", async () => {
		const requests: TrialRequest[] = [
			{ provider: "typecast", voiceId: "tc_0001", text: "하나", settings: DEFAULT_SETTINGS.typecast },
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "둘",
				settings: { ...DEFAULT_SETTINGS.typecast, emotion: "preset", preset: "happy", intensity: 1.5 },
			},
			{
				provider: "typecast",
				voiceId: "tc_0001",
				text: "셋",
				settings: { ...DEFAULT_SETTINGS.typecast, model: "ssfm-v21", preset: "sad" },
			},
			{
				provider: "elevenlabs",
				voiceId: "el0001",
				text: "넷",
				settings: { ...DEFAULT_SETTINGS.elevenlabs, style: 0.4, tag: "whispers" },
			},
			{
				provider: "elevenlabs",
				voiceId: "el0001",
				text: "다섯",
				settings: { ...DEFAULT_SETTINGS.elevenlabs, model: "eleven_multilingual_v2", style: 0.4 },
			},
			{
				provider: "fish_audio",
				voiceId: "f".repeat(32),
				text: "여섯",
				settings: { ...DEFAULT_SETTINGS.fish_audio, model: "s2.1-pro", tag: "calm" },
			},
		];
		for (const original of requests) {
			const made = await as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: original });
			const items = await as(OWNER).trialList({ provider: original.provider, voiceId: original.voiceId });
			const item = items.find((entry) => entry.id === made.id);
			expect(item && comboSignature(item.request)).toBe(comboSignature(original));
			expect((await as(OWNER).trialFind(item?.request ?? original))?.id).toBe(made.id);
		}
	});

	it("결과 오디오가 상한을 넘으면 입력 거절(audio_too_large)이고 결과를 저장하지 않는다(E8)", async () => {
		synthesize.mockResolvedValueOnce(new Uint8Array(4 * 1024 * 1024 + 1));
		await expect(
			as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request() }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			data: { reason: "provider_input", providerCode: "audio_too_large" },
		});
		expect(await as(OWNER).trialFind(request())).toBeNull();
	});

	it("무료 종료일 뒤 무료 모델은 공급자를 부르지 않고 free_ended(Review Focus 2)", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(FISH_FREE_UNTIL);
		await expect(
			as(OWNER).trialCreate({
				requestId: crypto.randomUUID(),
				request: { provider: "fish_audio", voiceId: "f1", text: "안녕", settings: DEFAULT_SETTINGS.fish_audio },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST", data: { reason: "free_ended" } });
		expect(synthesize).not.toHaveBeenCalled();
	});

	it("키가 없으면 no_key이고 공급자·DB 0회(AC14)", async () => {
		dbTouches = 0;
		await expect(
			as(OWNER, { db: failingDb, providers: {} }).trialCreate({
				requestId: crypto.randomUUID(),
				request: request(),
			}),
		).rejects.toMatchObject({ data: { reason: "no_key" } });
		expect(dbTouches).toBe(0);
	});

	it("결과는 요청한 성우의 목록에만 들어간다(Review Focus 3)", async () => {
		await as(OWNER).trialCreate({ requestId: crypto.randomUUID(), request: request() });
		expect(await as(OWNER).trialList({ provider: "elevenlabs", voiceId: "el0001" })).toHaveLength(1);
		expect(await as(OWNER).trialList({ provider: "elevenlabs", voiceId: "el0002" })).toHaveLength(0);
	});

	it("모델 배율은 목록 캐시를 거친다(두 번 불러도 공급자 1회)", async () => {
		await as(OWNER).trialModels();
		const { rates } = await as(OWNER).trialModels();
		expect(rates).toEqual([{ model: "eleven_v4", multiplier: 0.5 }]);
		expect(listModels).toHaveBeenCalledTimes(1);
	});
});
```
(`trialFind`에 기본값을 뺀 설정을 넘기는 줄은 `as never`로 입력 타입을 피한다. 서버 검증이 기본값을 채우는지 보는 것이다. `beforeEach`에 `vi.restoreAllMocks()`가 없으면 `afterEach(() => vi.restoreAllMocks())`를 더한다(console 감시를 푼다). 기본 `synthesize` 구현은 `mockResolvedValueOnce`·`mockImplementationOnce`만 써서 바꾸므로 다른 테스트로 새지 않는다.)

- [x] **Step 2: `trial.isolation.test.ts` 쓰기(실패)**

```ts
import { createRouterClient } from "@orpc/server";
import { trialGeneration } from "@tts-pilot-app/db/schema/trial-generation";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import type { Providers } from "../providers/index";
import { DEFAULT_SETTINGS, type TrialRequest } from "../providers/trial-options";
import { testDb as db, testDatabaseUrl as url } from "../test-db";
import { appRouter } from "./index";

const A = `trial-iso-a-${Date.now()}`;
const B = `trial-iso-b-${Date.now()}`;
const synthesize = vi.fn(async () => new Uint8Array([0xff, 0xfb, 0x90, 0x64]));
const providers: Providers = { typecast: { checkStatus: vi.fn(), synthesize } };
const as = (ownerId: string | null) =>
	createRouterClient(appRouter, { context: { db, ownerId, providers } as Context });
const request: TrialRequest = {
	provider: "typecast",
	voiceId: "tc_0001",
	text: "안녕하세요",
	settings: DEFAULT_SETTINGS.typecast,
};

describe.skipIf(!url)("시험 생성 소유자 격리(AC15)", () => {
	beforeEach(async () => {
		await db.delete(trialGeneration);
		synthesize.mockClear();
	});
	afterAll(async () => {
		await db.delete(trialGeneration);
		await db.$client.end();
	});

	it("A의 결과는 B가 찾기·목록·오디오·지우기로 닿지 않고 A의 행은 그대로다", async () => {
		const made = await as(A).trialCreate({ requestId: crypto.randomUUID(), request });
		expect(await as(B).trialFind(request)).toBeNull();
		expect(await as(B).trialList({ provider: "typecast", voiceId: "tc_0001" })).toEqual([]);
		await expect(as(B).trialAudio({ id: made.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(as(B).trialDelete({ id: made.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await as(A).trialAudio({ id: made.id })).id).toBe(made.id);
	});

	it("같은 요청 id를 A와 B가 써도 섞이지 않는다(Review Focus 5)", async () => {
		const id = crypto.randomUUID();
		const a = await as(A).trialCreate({ requestId: id, request });
		const b = await as(B).trialCreate({ requestId: id, request: { ...request, text: "다른 문장" } });
		expect(b.id).not.toBe(a.id);
		expect(synthesize).toHaveBeenCalledTimes(2);
	});

	it("B가 만드는 중이어도 A는 막히지 않는다", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		synthesize.mockImplementationOnce(async () => {
			await gate;
			return new Uint8Array([0xff]);
		});
		const pending = as(B).trialCreate({ requestId: crypto.randomUUID(), request });
		await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(1));
		await expect(as(A).trialCreate({ requestId: crypto.randomUUID(), request })).resolves.toMatchObject({
			usage: { unit: "credit" },
		});
		release();
		await pending;
	});

	it("소유자가 없으면 여섯 프로시저 모두 UNAUTHORIZED이고 공급자 0회(AC14)", async () => {
		const unauthorized = { code: "UNAUTHORIZED" };
		const id = crypto.randomUUID();
		await expect(as(null).trialModels()).rejects.toMatchObject(unauthorized);
		await expect(as(null).trialFind(request)).rejects.toMatchObject(unauthorized);
		await expect(as(null).trialCreate({ requestId: id, request })).rejects.toMatchObject(unauthorized);
		await expect(as(null).trialList({ provider: "typecast", voiceId: "tc_0001" })).rejects.toMatchObject(unauthorized);
		await expect(as(null).trialAudio({ id })).rejects.toMatchObject(unauthorized);
		await expect(as(null).trialDelete({ id })).rejects.toMatchObject(unauthorized);
		expect(synthesize).not.toHaveBeenCalled();
	});
});
```

- [x] **Step 3: 실행해 실패 확인** — `source .superpowers/sdd/T05-my-sentence-listening-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test src/routers/trial`. 기대: 프로시저 없음.

- [x] **Step 4: `routers/trial.ts` 쓰기**

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { logFailure, providerError, trialError } from "../providers/errors";
import { providerIdSchema } from "../providers/contract";
import {
	trialAudioSchema,
	trialCreateInputSchema,
	type TrialErrorData,
	trialItemSchema,
	type TrialModelRate,
	trialModelRateSchema,
	trialRequestSchema,
	voiceIdSchema,
} from "../providers/trial-contract";
import { estimate, freeModelOpen, isFreeModel } from "../providers/trial-options";
import {
	audioFile,
	audioOf,
	claim,
	comboKey,
	complete,
	findSaved,
	listResults,
	remove,
	replay,
	settle,
	sweep,
	withStorage,
} from "../trial";
import { cachedList, cooldownOf, guard, recordCooldown } from "../voice-cache";

// 공급자 응답 오디오 상한. 200자 MP3는 1MB 안팎이다(스펙 4절, Vercel 응답 4.5MB). Typecast MP3는 320kbps라
// 200자를 속도 0.5로 들으면 상한에 닿을 수 있다. 넘으면 이미 과금된 결과라도 버리고 "문장을 줄이거나 속도를 올려"를 보인다(계획 리뷰 E8)
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// ElevenLabs 모델 크레딧 배율. 목록 캐시(24시간, 소유자 없음)를 거친다
async function elevenLabsRates(context: Context): Promise<TrialModelRate[]> {
	const listModels = context.providers?.elevenlabs?.listModels;
	if (!listModels) throw providerError("elevenlabs", "no_key");
	const { value } = await cachedList(
		context.db,
		{ ownerId: null, provider: "elevenlabs", kind: "models" },
		{},
		z.array(trialModelRateSchema),
		listModels,
	);
	return value;
}

// 시험 생성('내 문장 듣기', T5 스펙 5절). 크레딧을 쓰는 길은 trialCreate 하나다. 나머지는 DB만 본다(trialModels는 무료 목록 조회)
export const trialRouter = {
	trialModels: protectedProcedure
		.output(z.object({ rates: z.array(trialModelRateSchema) }))
		.handler(async ({ context }) => ({ rates: await elevenLabsRates(context) })),
	// 같은 조합의 저장된 결과. 공급자를 부르지 않는다
	trialFind: protectedProcedure
		.input(trialRequestSchema)
		.output(trialAudioSchema.nullable())
		.handler(({ input, context }) =>
			withStorage(input.provider, () => findSaved(context.db, context.ownerId, comboKey(input))),
		),
	trialCreate: protectedProcedure
		.input(trialCreateInputSchema)
		.output(trialAudioSchema)
		.handler(async ({ input: { requestId, request }, context }) => {
			const { provider } = request;
			const { db, ownerId } = context;
			// 무료 모델은 종료일(하루 이르게)부터 보내지 않는다. 공급자에서 없어진 모델 이름은 오류 없이 유료로 처리된다(스펙 13절)
			if (isFreeModel(request) && !freeModelOpen()) throw trialError(provider, "free_ended");
			const synthesize = context.providers?.[provider]?.synthesize;
			if (!synthesize) throw trialError(provider, "no_key");
			// 대기 시각 표를 읽지 못하면 부르지 않는다(로드맵 T5 메모)
			const until = await withStorage(provider, () => cooldownOf(db, provider, new Date()));
			if (until) throw trialError(provider, "rate_limit", { retryAt: until.toISOString() });
			// 배율을 못 읽어도 생성은 막지 않는다(배율 1로 적는다)
			const rate =
				request.provider === "elevenlabs"
					? await elevenLabsRates(context)
							.then((rates) => rates.find((r) => r.model === request.settings.model)?.multiplier ?? null)
							.catch(() => null)
					: null;
			const usage = estimate(request, rate);
			const claimed = await withStorage(provider, () =>
				claim(db, { ownerId, requestId, request, key: comboKey(request), usage }),
			);
			if (claimed.kind === "existing") return replay(provider, claimed.row);
			let audio: Uint8Array;
			try {
				audio = await synthesize(request);
				if (audio.byteLength > MAX_AUDIO_BYTES) {
					throw trialError(provider, "provider_input", { providerCode: "audio_too_large" });
				}
			} catch (error) {
				// runTrial이 모든 실패를 사유 있는 ORPCError로 바꾼다. 그래도 아닌 예외가 오면 응답을 받았는지 모르므로
				// 처리 여부 미확인으로 기록하고 원래 오류는 던지지 않는다(계획 리뷰 E1)
				if (!(error instanceof ORPCError)) logFailure(`[trial] ${provider} 생성 실패`, error, []);
				const failure = error instanceof ORPCError ? error : trialError(provider, "unknown_outcome");
				const data = failure.data as Partial<TrialErrorData> | undefined;
				const reason = data?.reason ?? "provider_error";
				await guard(
					"실패 기록",
					() => settle(db, ownerId, claimed.id, reason === "unknown_outcome" ? "unknown" : "failed", reason),
					"[trial]",
				);
				const retryAt = data?.retryAt;
				if (reason === "rate_limit" && retryAt) {
					await guard("대기 쓰기", () => recordCooldown(db, provider, new Date(retryAt)), "[trial]");
				}
				throw failure;
			}
			// 결과를 저장하지 못해도 오디오는 돌려준다(스펙 5절). 그 행은 pending으로 남고 5분 뒤 unknown이 된다
			await guard(
				"완료 기록",
				async () => {
					await complete(db, ownerId, claimed.id, audio);
					await sweep(db, ownerId);
				},
				"[trial]",
			);
			return { id: claimed.id, createdAt: claimed.createdAt, usage, audio: audioFile(audio) };
		}),
	trialList: protectedProcedure
		.input(z.object({ provider: providerIdSchema, voiceId: voiceIdSchema }))
		.output(z.array(trialItemSchema))
		.handler(({ input, context }) =>
			withStorage(input.provider, () =>
				listResults(context.db, context.ownerId, input.provider, input.voiceId),
			),
		),
	trialAudio: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(trialAudioSchema)
		.handler(({ input, context }) =>
			withStorage(undefined, () => audioOf(context.db, context.ownerId, input.id)),
		),
	trialDelete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.output(z.object({ deleted: z.literal(true) }))
		.handler(async ({ input, context }) => ({
			deleted: await withStorage(undefined, () => remove(context.db, context.ownerId, input.id)),
		})),
};
```

- [x] **Step 5: 등록** — `routers/index.ts` import에 `import { trialRouter } from "./trial";`, `appRouter` 끝에 `...trialRouter,`(주석: 시험 생성 여섯, T5).

- [x] **Step 6: 실행** — `source .superpowers/sdd/T05-my-sentence-listening-plan/tools/testdb.env && pnpm --filter @tts-pilot-app/api test`(전체), `pnpm check-types`, `pnpm exec biome check .`. 기대: 모두 통과, skipped 0. 증거(13·14행).

### Task 7: UI 프리미티브 Slider·Switch·AlertDialog (코디네이터)

**Files:**
- Create: `packages/ui/src/components/slider.tsx`, `switch.tsx`, `alert-dialog.tsx`

**Interfaces:**
- Produces: `Slider`(Base, 값 하나), `Switch`, `AlertDialog`·`AlertDialogContent`·`AlertDialogHeader`·`AlertDialogTitle`·`AlertDialogDescription`·`AlertDialogFooter`·`AlertDialogCancel`·`AlertDialogAction`(생성된 이름 그대로. 다르면 Task 9~10 import를 그 이름에 맞춘다).

- [x] **Step 1: 추가** — `pnpm --filter @tts-pilot-app/ui exec shadcn add slider switch alert-dialog`. 덮어쓰기를 묻는 기존 파일(button 등)은 덮지 않는다(T4 27행 정리를 되돌리지 않는다).
- [x] **Step 2: 맞춤** — 생성물의 `font-medium`·`font-semibold`를 `font-bold`로(굵기 둘만), 임의 값이 있으면 눈금으로. Slider 손잡이는 누르는 자리가 44px이 되게 행(`min-h-11`)에서 맞춘다(Task 10). AlertDialog 버튼은 `size="lg"`. 그리고:
  - **채움 색(사용자 결정 U7, 2026-10-05):** Slider의 채운 구간(indicator)과 Switch의 켜짐 바탕을 `primary`(청록) 대신 `foreground`(무채색)로 바꾼다(`bg-primary` → `bg-foreground`, 켜짐 `data-checked:bg-foreground`). 손잡이 테두리도 `foreground`. 청록은 포커스 고리(`ring`)에만 남는다(One Teal Rule). 꺼진 Switch 바탕은 생성물 그대로(`input` 계열).
  - **슬라이더 접근 이름·값 글자(계획 리뷰 D17):** 생성된 `Slider`가 `getAriaValueText`와 `aria-labelledby`를 손잡이(`SliderThumb`)로 넘기게 한다(Root 속성으로 받아 Thumb에 전달). Task 10이 늘 `getAriaValueText={(_, value) => valueText(field, value)}`를 넘긴다.
  - **AlertDialog 너비(계획 리뷰 D15):** Popup에 `sm:max-w-md`(448px, 눈금 값)가 있는지 보고 없으면 더한다. 767px 이하 좌우 여백은 생성물 값을 확인해 16px 이상이면 그대로 둔다(생성물에 원래 있는 값은 금지 패턴 검사에서 T4 Task 8처럼 생성물 예외로 적는다. 새 임의 값은 넣지 않는다).
  - **AlertDialog 바깥 누르기:** Base UI AlertDialog는 바깥을 눌러도 닫히지 않는다(설치본 `dialog/root/useRenderDialogRoot.mjs` `disablePointerDismissal = isAlertDialog`). 유료 확인 창의 표준이라 그대로 두고 스펙 AC5를 "Esc·[취소]"로 고쳤다(계획 리뷰 D15).
- [x] **Step 3: 검사** — `pnpm check-types`, `pnpm exec biome check packages/ui`, 금지 패턴 grep 0. 증거(18행 일부).

### Task 8: 화면 순수 함수

**Files:**
- Create: `apps/web/src/lib/trial-view.ts`, `trial-view.test.ts`, `blob-urls.ts`, `blob-urls.test.ts`
- Modify: `apps/web/src/lib/roving.ts`, `roving.test.ts`, `sample-state.ts`, `sample-state.test.ts`, `connection-view.ts`, `connection-view.test.ts`, `voice-view.ts`(`EMOTION_KO` export), `voice-failure.ts`(T4 사유 안내 문구를 옮겨 옴), `apps/web/src/components/voice-problem.tsx`(옮긴 문구를 import), `provider-status-card.tsx`(CS-01, 옛 Task 12를 합침, 계획 리뷰 ponytail 14)

**Interfaces:**
- Consumes: Task 2 `trial-options`(값·함수), 타입 `TrialFailure`·`TrialErrorData`·`TrialItem`(import type); `voice-view`의 `plain`, `agoText`, `retryTime`, `EMOTION_KO`; `voice-filter`의 `labelOf`; `voice-failure`의 `retryAtOf`·`problemCopy`; `connection-view`의 `PROVIDER_LABEL`.
- Produces(`trial-view.ts`): `emotionLabel(preset)`, `LANGUAGE_LABEL`, `FIELD_LABEL`, `ELEVENLABS_TAGS`, `FISH_TAGS`(`{ value, label }[]`), `typecastModelsOf(voice)`, `presetsOf(voice, model)`, `fishModelsOf(now?)`, `modelOptionsOf(voice, now?)`(`{ value, label, free? }[]`), `requestOf(voice, text, settings: SettingsOf, now?) : TrialRequest`, `needsConfirm(request, now?)`, `trialBlock(input): string | null`, `trialAriaLabel(name, request, state)`(state `"idle" | "saved" | "busy" | "playing"`), `usageText(usage)`, `remainingLabel(provider)`, `remainingLines(provider, quota): string[]`, `typecastOverdrawn(quota)`, `valueText(field, value)`, `settingsSummary(request)`, `resultWhen(createdAt, now)`, `resultLine(item, now)`, `resultSubject(name, item)`, `dataNote(request)`, `TrialProblem` 타입, `trialFailureOf(error)`, `trialProblemText(provider, problem)`, `TRIAL_SHORT_PROBLEM`.
- Produces(`blob-urls.ts`): `blobUrls(create?, revoke?)` → `{ get(id), ensure(id, blob), forget(id), clear() }`.
- Produces(`roving.ts`): `Col = 0 | 1 | 2`, ←/→가 한 칸씩.
- Produces(`sample-state.ts`): `Noun = "샘플" | "내 문장" | "저장된 결과"`, `Current`에 `noun`·`owner`(내 문장 결과가 붙은 성우 키, 기본 샘플은 null), `pressSample(current, voiceId, name, noun?, owner?)`, `announceOf(current)`·`stoppedText(current)`(알림 문구, 명사 조사 포함).
- Produces(`voice-failure.ts`): `ProblemCopy`, `problemCopy(provider, failure)`(T4 `voice-problem.tsx`에서 옮김, 동작 같음).
- Produces(`connection-view.ts`): `recheckUntil(result): string | null`.

- [x] **Step 1: `trial-view.test.ts` 쓰기(실패)**

```ts
import { ORPCError } from "@orpc/client";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { DEFAULT_SETTINGS, FISH_FREE_UNTIL } from "@tts-pilot-app/api/providers/trial-options";
import { describe, expect, it } from "vitest";

import {
	dataNote,
	modelOptionsOf,
	needsConfirm,
	presetsOf,
	remainingLabel,
	remainingLines,
	requestOf,
	resultLine,
	resultSubject,
	resultWhen,
	settingsSummary,
	trialAriaLabel,
	trialBlock,
	trialFailureOf,
	trialProblemText,
	typecastOverdrawn,
	usageText,
} from "./trial-view";

const voice = (over: Partial<Voice>): Voice =>
	({ provider: "typecast", source: "public", voiceId: "tc_1", name: "민지", models: [], ...over }) as Voice;

describe("requestOf", () => {
	it("Typecast 성우가 지원하지 않는 모델·프리셋은 그 성우의 첫 지원 값으로 보정한다", () => {
		const v21Only = voice({ models: [{ model: "ssfm-v21", emotions: ["normal", "sad"] }] });
		const r = requestOf(v21Only, "안녕", {
			...DEFAULT_SETTINGS,
			typecast: { ...DEFAULT_SETTINGS.typecast, emotion: "preset", preset: "whisper" },
		});
		expect(r.settings).toMatchObject({ model: "ssfm-v21", emotion: "preset", preset: "normal" });
		expect(presetsOf(voice({ models: [{ model: "ssfm-v30", emotions: ["happy", "sad"] }] }), "ssfm-v30")).toEqual([
			"happy",
			"sad",
		]);
	});
	it("Fish Audio 무료 기간이 끝나면 유료 모델로 바꿔 확인 창을 거친다", () => {
		const r = requestOf(voice({ provider: "fish_audio", voiceId: "f1" }), "안녕", DEFAULT_SETTINGS, FISH_FREE_UNTIL);
		expect(r.settings.model).toBe("s2.1-pro");
		expect(needsConfirm(r, FISH_FREE_UNTIL)).toBe(true);
		const free = requestOf(voice({ provider: "fish_audio", voiceId: "f1" }), "안녕", DEFAULT_SETTINGS, 0);
		expect(needsConfirm(free, 0)).toBe(false);
	});
	it("모델 선택지: Typecast는 성우 지원 모델, Fish Audio 무료 모델에는 무료 표시", () => {
		expect(modelOptionsOf(voice({ models: [{ model: "ssfm-v21", emotions: [] }] }))).toEqual([
			{ value: "ssfm-v21", label: "ssfm-v21" },
		]);
		expect(modelOptionsOf(voice({ provider: "fish_audio", voiceId: "f1" }), 0)).toEqual([
			{ value: "s2.1-pro-free", label: "s2.1-pro-free", free: true },
			{ value: "s2.1-pro", label: "s2.1-pro" },
		]);
	});
});

describe("버튼 상태와 이름", () => {
	it("막는 이유: 키 없음 → 빈 문장 → 다른 문장 만드는 중 → 대기 시각", () => {
		const base = { provider: "elevenlabs", text: "안녕", busyKey: null, key: "k", retryAt: null, noKey: false } as const;
		expect(trialBlock(base)).toBeNull();
		expect(trialBlock({ ...base, text: "   " })).toBe("문장을 먼저 써 주세요");
		expect(trialBlock({ ...base, busyKey: "other" })).toBe("다른 문장을 만드는 중이에요");
		expect(trialBlock({ ...base, busyKey: "k" })).toBeNull();
		expect(trialBlock({ ...base, noKey: true })).toBe("ElevenLabs 키가 없어요");
		expect(trialBlock({ ...base, retryAt: "2026-10-05T08:43:22.000Z" })).toMatch(/이후에 다시 들을 수 있어요$/);
	});
	it("접근 이름에 성우 이름·동작·크레딧 여부가 들어가고, 재생 중이면 정지다(AC18, U8)", () => {
		const r = requestOf(voice({ provider: "elevenlabs", voiceId: "e1", name: "Jiyoung" }), "안녕", DEFAULT_SETTINGS);
		expect(trialAriaLabel("Jiyoung", r, "idle")).toBe("Jiyoung 내 문장 듣기, 크레딧 사용");
		expect(trialAriaLabel("Jiyoung", r, "saved")).toBe("Jiyoung 저장된 결과 듣기");
		expect(trialAriaLabel("Jiyoung", r, "busy")).toBe("Jiyoung 내 문장 만드는 중");
		expect(trialAriaLabel("Jiyoung", r, "playing")).toBe("Jiyoung 내 문장 정지");
		const f = requestOf(voice({ provider: "fish_audio", voiceId: "f1", name: "Mina" }), "안녕", DEFAULT_SETTINGS, 0);
		// 날짜에 기대지 않게 시각을 넘긴다(무료 종료 뒤에도 테스트가 그대로)
		expect(trialAriaLabel("Mina", f, "idle", 0)).toBe("Mina 내 문장 듣기, 무료");
	});
});

describe("문구", () => {
	it("예상 사용량", () => {
		expect(usageText({ unit: "credit", amount: 1234 })).toBe("약 1,234크레딧");
		expect(usageText({ unit: "byte", amount: 93 })).toBe("93바이트 · 약 $0.0014");
		expect(usageText({ unit: "free", amount: 0 })).toBe("무료");
	});
	it("남은 값: Fish Audio는 '남은 잔액'과 두 잔액, 나머지는 '남은 크레딧'(D14), Typecast 초과 경고", () => {
		const quota = { remaining: 9412, total: 10000, plan: "free", resetAt: null, overageAllowed: false };
		expect(remainingLabel("elevenlabs")).toBe("남은 크레딧");
		expect(remainingLines("elevenlabs", quota)).toEqual(["9,412크레딧"]);
		expect(remainingLabel("fish_audio")).toBe("남은 잔액");
		expect(
			remainingLines("fish_audio", {
				...quota,
				remaining: 3,
				webCredit: { plan: "Plus", remaining: 1234, total: 2000 },
			}),
		).toEqual(["API 충전 잔액 3", "웹 플랜 크레딧 1,234"]);
		expect(remainingLines("typecast", null)).toEqual(["확인하지 못했어요"]);
		expect(typecastOverdrawn({ ...quota, remaining: 0 })).toBe(true);
	});
	it("설정 요약은 모델과 기본값에서 벗어난 옵션, Typecast 직접 감정은 늘(감정 이름은 T4 패널과 같다)", () => {
		const el = requestOf(voice({ provider: "elevenlabs", voiceId: "e1" }), "안녕", {
			...DEFAULT_SETTINGS,
			elevenlabs: { ...DEFAULT_SETTINGS.elevenlabs, stability: 0.65, tag: "whispers" },
		});
		expect(settingsSummary(el)).toBe("eleven_v4 · 안정성 0.65 · [whispers]");
		const tc = requestOf(voice({}), "안녕", {
			...DEFAULT_SETTINGS,
			typecast: { ...DEFAULT_SETTINGS.typecast, emotion: "preset", preset: "toneup", pitch: 2 },
		});
		expect(settingsSummary(tc)).toBe("ssfm-v30 · 감정 높은 톤 · 음높이 +2반음");
	});
	it("언제와 결과 줄: 잘려도 언제·사용량이 남게 앞에 둔다(D2)", () => {
		const now = new Date("2026-10-05T10:00:00.000Z");
		expect(resultWhen("2026-10-05T09:59:40.000Z", now)).toBe("방금");
		expect(resultWhen("2026-10-02T10:00:00.000Z", now)).toBe("3일 전");
		const item = {
			id: "00000000-0000-4000-8000-000000000000",
			createdAt: "2026-10-05T09:59:40.000Z",
			usage: { unit: "credit", amount: 31 },
			request: requestOf(voice({ provider: "elevenlabs", voiceId: "e1" }), "오늘 소개할 제품은 30초 만에 끝나는 아침 루틴입니다", DEFAULT_SETTINGS),
		} as const;
		expect(resultLine(item, now)).toBe("방금 · 약 31크레딧 · eleven_v4");
		// 줄마다 다른 접근 이름(D6): 문장 앞 20자
		expect(resultSubject("Jiyoung", item)).toBe("Jiyoung 저장된 결과 '오늘 소개할 제품은 30초 만에 끝나'");
	});
	it("데이터 안내는 약관 문구가 있는 공급자만", () => {
		expect(dataNote(requestOf(voice({}), "안녕", DEFAULT_SETTINGS))).toBe(
			"보낸 문장이 Typecast 서비스 개선에 쓰일 수 있어요",
		);
		expect(dataNote(requestOf(voice({ provider: "elevenlabs", voiceId: "e" }), "안녕", DEFAULT_SETTINGS))).toBeNull();
	});
});

describe("오류", () => {
	const error = (reason: string, extra: object = {}) =>
		new ORPCError("BAD_REQUEST", { data: { provider: "elevenlabs", reason, ...extra } });
	it("사유·대기 시각·공급자 오류 코드를 읽고, 사유 없는 오류는 unexpected", () => {
		expect(trialFailureOf(error("provider_input", { providerCode: "voice_access_denied" }))).toEqual({
			reason: "provider_input",
			retryAt: null,
			providerCode: "voice_access_denied",
		});
		expect(trialFailureOf(new Error("x")).reason).toBe("unexpected");
	});
	it("스펙 6절 문구(문자열에는 ▷를 쓰지 않는다, D22). 키 문제는 T4 사유 안내와 같은 글자(D24)", () => {
		const text = (reason: string, extra: object = {}) =>
			trialProblemText("elevenlabs", trialFailureOf(error(reason, extra))).text;
		expect(text("no_key")).toBe("ElevenLabs 키가 없어요. 서버 환경변수에 키를 넣고 개발 서버를 다시 켜 주세요.");
		expect(text("provider_auth")).toBe("ElevenLabs 키를 확인해 주세요. 키가 틀렸거나 쓸 수 없는 키예요.");
		expect(text("quota")).toBe("크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요");
		expect(text("rate_limit")).toBe("요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요");
		expect(text("provider_input", { providerCode: "subscription_required" })).toBe(
			"무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요",
		);
		expect(text("provider_input", { providerCode: "voice_access_denied" })).toBe(
			"ElevenLabs 웹에서 내 계정에 추가한 뒤 '내 계정'에서 들어 보세요",
		);
		expect(text("provider_input", { providerCode: "audio_too_large" })).toBe(
			"결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요",
		);
		expect(text("unknown_outcome")).toMatch(/^처리 여부를 확인하지 못했어요/);
		expect(text("storage")).toBe("지금은 내 문장을 들을 수 없어요. 기본 샘플은 들을 수 있어요");
		// 모르는 사유 문자열(객체 기본 속성 이름 포함)은 switch의 default가 거른다
		expect(text("constructor")).toBe("내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요");
	});
});
```

- [x] **Step 2: 옮기기와 export** — (1) `components/voice-problem.tsx`의 `ProblemCopy` 타입·`authProblem`·`PROBLEM`·`problemCopy`(23~75행, JSX 없음)를 `lib/voice-failure.ts`로 옮기고(`PROVIDER_LABEL` import를 함께), `voice-problem.tsx`는 `import { problemCopy } from "@/lib/voice-failure";`로 쓴다. T4 동작·문구는 그대로다(시험 생성이 T4 사유 안내 글자를 그대로 쓰기 위해서다, 계획 리뷰 ponytail 11·D24). (2) `lib/voice-view.ts`의 `EMOTION_KO` 앞에 `export`를 붙인다(패널 '모델별 감정'과 같은 이름 한 벌, 계획 리뷰 ponytail 9). 확인: `pnpm --filter web test` 그대로 통과.

- [x] **Step 3: `trial-view.ts` 쓰기**

```ts
import { ORPCError } from "@orpc/client";
import type { ProviderId, RemainingQuota, Voice } from "@tts-pilot-app/api/providers/contract";
import type { TrialErrorData, TrialFailure, TrialItem } from "@tts-pilot-app/api/providers/trial-contract";
import {
	DEFAULT_SETTINGS,
	EMOTION_PRESETS,
	type EmotionPreset,
	FISH_MODELS,
	type FishModel,
	fishUsd,
	freeModelOpen,
	isFreeModel,
	normalizeText,
	type SettingsOf,
	type TrialRequest,
	TYPECAST_MODELS,
	type TypecastModel,
	type TypecastSettings,
	type Usage,
	usedSettings,
	V21_PRESETS,
	ELEVENLABS_MODELS,
} from "@tts-pilot-app/api/providers/trial-options";

import { PROVIDER_LABEL } from "./connection-view";
import { problemCopy, retryAtOf } from "./voice-failure";
import { labelOf } from "./voice-filter";
import { agoText, EMOTION_KO, plain, retryTime } from "./voice-view";

// 시험 생성('내 문장 듣기')의 화면 문구와 계산(T5 브리프 12절, 스펙 3·6절). 화면 없이 테스트하는 순수 함수만 둔다.
// 문자열(알림·설명·접근 이름)에는 '▷'를 쓰지 않는다. 화면 글자 사이의 재생 기호는 Play 아이콘(aria-hidden)이다(계획 리뷰 D22)

// 감정 이름은 T4 패널 '모델별 감정'과 한 벌이다(voice-view EMOTION_KO: 기본·기쁨·슬픔·화남·속삭임·높은 톤·낮은 톤)
export const emotionLabel = (preset: string) => labelOf(EMOTION_KO, preset);
export const LANGUAGE_LABEL = { auto: "자동 감지", kor: "한국어" } as const;
// 옵션 이름표(슬라이더·스위치·요약이 함께 쓴다)
export const FIELD_LABEL: Record<string, string> = {
	intensity: "강도",
	tempo: "속도",
	pitch: "음높이",
	volume: "음량",
	stability: "안정성",
	similarity: "유사도",
	style: "스타일",
	speed: "속도",
	speakerBoost: "화자 증폭",
	temperature: "표현력",
};
// 말투 태그(공식 목록, 계획 '계획에서 정한 것'). 화면에는 한국어 이름과 원문을 함께 보인다
export const ELEVENLABS_TAGS = [
	{ value: "whispers", label: "속삭임" },
	{ value: "sighs", label: "한숨" },
	{ value: "laughs", label: "웃음" },
	{ value: "excited", label: "신남" },
	{ value: "curious", label: "궁금함" },
	{ value: "sarcastic", label: "비꼼" },
	{ value: "crying", label: "울먹임" },
	{ value: "mischievously", label: "장난스럽게" },
	{ value: "exhales", label: "숨 내쉬기" },
];
export const FISH_TAGS = [
	{ value: "happy", label: "기쁨" },
	{ value: "sad", label: "슬픔" },
	{ value: "angry", label: "화남" },
	{ value: "excited", label: "신남" },
	{ value: "calm", label: "차분함" },
	{ value: "nervous", label: "긴장" },
	{ value: "confident", label: "자신감" },
	{ value: "surprised", label: "놀람" },
	{ value: "whispering", label: "속삭임" },
];

// 그 성우가 지원하는 Typecast 모델(성우 데이터 models). 정보가 없으면 둘 다
export function typecastModelsOf(voice: Voice): TypecastModel[] {
	const offered = TYPECAST_MODELS.filter((model) => voice.models.some((m) => m.model === model));
	return offered.length > 0 ? offered : [...TYPECAST_MODELS];
}
// 그 성우·모델이 지원하는 프리셋. v21은 넷까지. 정보가 없으면 모델의 전체 목록
export function presetsOf(voice: Voice, model: TypecastModel): EmotionPreset[] {
	const allowed = model === "ssfm-v30" ? EMOTION_PRESETS : V21_PRESETS;
	const emotions = voice.models.find((m) => m.model === model)?.emotions;
	const list = emotions ? allowed.filter((preset) => emotions.includes(preset)) : [...allowed];
	return list.length > 0 ? list : ["normal"];
}
// 고를 수 있는 Fish Audio 모델. 무료 기간이 끝나면 유료만
export const fishModelsOf = (now = Date.now()): FishModel[] =>
	freeModelOpen(now) ? [...FISH_MODELS] : ["s2.1-pro"];
// 패널 '모델' 메뉴의 선택지. 무료 모델에는 '무료' 배지(free)
export function modelOptionsOf(
	voice: Voice,
	now = Date.now(),
): { value: string; label: string; free?: true }[] {
	const models =
		voice.provider === "typecast"
			? typecastModelsOf(voice)
			: voice.provider === "elevenlabs"
				? [...ELEVENLABS_MODELS]
				: fishModelsOf(now);
	return models.map((model) =>
		model === "s2.1-pro-free" ? { value: model, label: model, free: true } : { value: model, label: model },
	);
}

// 공급자 설정은 공급자마다 하나다. 이 성우가 받지 않는 값만 이 요청에서 보정한다(공급자 설정 자체는 바꾸지 않는다)
function typecastFor(voice: Voice, settings: TypecastSettings): TypecastSettings {
	const models = typecastModelsOf(voice);
	const model = models.includes(settings.model) ? settings.model : (models[0] ?? "ssfm-v30");
	const presets = presetsOf(voice, model);
	return {
		...settings,
		model,
		emotion: model === "ssfm-v21" ? "preset" : settings.emotion,
		preset: presets.includes(settings.preset) ? settings.preset : (presets[0] ?? "normal"),
	};
}
export function requestOf(voice: Voice, text: string, settings: SettingsOf, now = Date.now()): TrialRequest {
	const { voiceId } = voice;
	switch (voice.provider) {
		case "typecast":
			return { provider: "typecast", voiceId, text, settings: typecastFor(voice, settings.typecast) };
		case "elevenlabs":
			return { provider: "elevenlabs", voiceId, text, settings: settings.elevenlabs };
		case "fish_audio": {
			const fish = settings.fish_audio;
			return {
				provider: "fish_audio",
				voiceId,
				text,
				settings: fishModelsOf(now).includes(fish.model) ? fish : { ...fish, model: "s2.1-pro" },
			};
		}
	}
}

// 확인 창이 필요한가(스펙 2절: 누를 때마다, Fish Audio 무료 모델은 묻지 않는다)
export const needsConfirm = (request: TrialRequest, now = Date.now()) =>
	!(isFreeModel(request) && freeModelOpen(now));

// '내 문장 듣기'를 막는 이유(브리프 12절 상태 표). 없으면 null. key는 이 버튼의 성우, busyKey는 **만드는 중**인 성우다.
// 저장된 결과를 찾는 동안(0.3초 안팎)은 busyKey를 넘기지 않는다: 다른 버튼을 흐리지 않고 누른 버튼 안 진행 표시만 둔다(계획 리뷰 D10)
export function trialBlock(input: {
	provider: ProviderId;
	text: string;
	busyKey: string | null;
	key: string;
	retryAt: string | null;
	noKey: boolean;
}): string | null {
	if (input.noKey) return `${PROVIDER_LABEL[input.provider]} 키가 없어요`;
	if (normalizeText(input.text) === "") return "문장을 먼저 써 주세요";
	if (input.busyKey !== null && input.busyKey !== input.key) return "다른 문장을 만드는 중이에요";
	if (input.retryAt) return `${retryTime(input.retryAt)} 이후에 다시 들을 수 있어요`;
	return null;
}

export function trialAriaLabel(
	name: string,
	request: TrialRequest,
	state: "idle" | "saved" | "busy" | "playing",
	now = Date.now(),
): string {
	if (state === "busy") return `${name} 내 문장 만드는 중`;
	if (state === "playing") return `${name} 내 문장 정지`;
	if (state === "saved") return `${name} 저장된 결과 듣기`;
	return `${name} 내 문장 듣기, ${needsConfirm(request, now) ? "크레딧 사용" : "무료"}`;
}

export function usageText(usage: Usage): string {
	if (usage.unit === "free") return "무료";
	if (usage.unit === "byte")
		return `${plain.format(usage.amount)}바이트 · 약 $${fishUsd(usage.amount).toFixed(4)}`;
	return `약 ${plain.format(usage.amount)}크레딧`;
}

// 확인 창의 남은 값(T2 연결 상태 값). 어느 잔액인지 이름으로 알린다(lessons 2026-10-04).
// Fish Audio는 '남은 잔액'으로 API 충전 잔액과(있으면) 웹 플랜 크레딧을 두 줄로 보인다. 어느 잔액에서 빠지는지는 CS-09(사용자 테스트 5번)로 정한다(계획 리뷰 D14)
export const remainingLabel = (provider: ProviderId) =>
	provider === "fish_audio" ? "남은 잔액" : "남은 크레딧";
export function remainingLines(provider: ProviderId, quota: RemainingQuota | null): string[] {
	if (quota === null) return ["확인하지 못했어요"];
	const remaining = plain.format(Math.max(0, quota.remaining));
	if (provider !== "fish_audio") return [`${remaining}크레딧`];
	const web = quota.webCredit;
	return [
		`API 충전 잔액 ${remaining}`,
		...(web ? [`웹 플랜 크레딧 ${plain.format(Math.max(0, web.remaining))}`] : []),
	];
}
// Typecast 남은 플랜 크레딧이 없다(유료 플랜은 넘어서 청구될 수 있어 막지 않는다, 스펙 4절)
export const typecastOverdrawn = (quota: RemainingQuota | null) => quota !== null && quota.remaining <= 0;

// 옵션 값 글자(브리프 12절: "0.50", "1.00배", "+2반음", "100"). 슬라이더의 aria-valuetext이기도 하다(계획 리뷰 D17)
export function valueText(field: string, value: string | number | boolean): string {
	if (typeof value === "boolean") return value ? "켬" : "끔";
	if (typeof value === "string") return value;
	switch (field) {
		case "tempo":
		case "speed":
			return `${value.toFixed(2)}배`;
		case "pitch":
			return `${value > 0 ? "+" : ""}${value}반음`;
		case "volume":
			return String(value);
		case "intensity":
			return value.toFixed(1);
		default:
			return value.toFixed(2);
	}
}
// 결과 줄·확인 창의 설정 요약: 모델 + 기본값에서 벗어난 옵션. Typecast 직접 감정은 늘 보인다(계획 '계획에서 정한 것')
export function settingsSummary(request: TrialRequest): string {
	const used = usedSettings(request);
	const defaults = DEFAULT_SETTINGS[request.provider] as Record<string, unknown>;
	const parts = [String(used.model)];
	for (const [field, value] of Object.entries(used)) {
		if (field === "model" || field === "emotion") continue;
		if (field === "preset") {
			parts.push(`감정 ${emotionLabel(String(value))}`);
			continue;
		}
		if (value === defaults[field] || value === "") continue;
		if (field === "tag") parts.push(`[${value}]`);
		else if (field === "language") parts.push(LANGUAGE_LABEL[value as "auto" | "kor"]);
		else parts.push(`${FIELD_LABEL[field] ?? field} ${valueText(field, value)}`);
	}
	return parts.join(" · ");
}

export const resultWhen = (createdAt: string, now: Date) => {
	const ago = agoText(createdAt, now);
	return ago === "방금" ? "방금" : `${ago} 전`;
};
// 결과 줄 둘째 줄. 잘려도 언제·사용량이 남게 앞에 둔다(계획 리뷰 D2). 화면은 두 줄까지 감는다(line-clamp-2)
export const resultLine = (item: TrialItem, now: Date) =>
	`${resultWhen(item.createdAt, now)} · ${usageText(item.usage)} · ${settingsSummary(item.request)}`;
// 결과 줄 버튼의 대상 이름. 줄마다 다르게 문장 앞 20자를 넣는다(계획 리뷰 D6)
export const resultSubject = (name: string, item: TrialItem) =>
	`${name} 저장된 결과 '${[...normalizeText(item.request.text)].slice(0, 20).join("")}'`;

// 공급자 약관에 문장 이용 문구가 있으면 한 줄(스펙 3절)
export function dataNote(request: TrialRequest): string | null {
	if (request.provider === "typecast") return "보낸 문장이 Typecast 서비스 개선에 쓰일 수 있어요";
	if (isFreeModel(request)) return "보낸 문장이 Fish Audio 모델 개선에 쓰일 수 있어요";
	return null;
}

// 화면이 읽는 실패. 사유 없는 오류(500 등)는 unexpected. 모르는 사유 문자열은 trialProblemText의 default가 거른다
// (조회 표가 없어 객체 기본 속성 이름에 속을 곳이 없다, 계획 리뷰 ponytail 7)
export type TrialProblem = {
	reason: TrialFailure | "unexpected";
	retryAt: string | null;
	providerCode: string | null;
};
export function trialFailureOf(error: unknown): TrialProblem {
	const data =
		error instanceof ORPCError ? (error.data as Partial<TrialErrorData> | undefined) : undefined;
	return {
		reason: typeof data?.reason === "string" ? data.reason : "unexpected",
		retryAt: retryAtOf(error),
		providerCode: typeof data?.providerCode === "string" ? data.providerCode : null,
	};
}

// 행의 짧은 실패 글자(1199px 이하에서도 행에 보인다, 계획 리뷰 D4). 전체 문구는 설명과 패널에 있다
export const TRIAL_SHORT_PROBLEM = "내 문장을 듣지 못했어요";

// ElevenLabs 입력 거절 코드별 문구. 잠정 표: 공식 문서에 상황별 대응이 없어 사용자 테스트 3번(승인된 실제 1회)의 코드로 맞춘다(스펙 6절)
const FREE_PLAN_CODES = new Set(["subscription_required", "feature_not_available"]);
const NOT_IN_ACCOUNT_CODES = new Set(["voice_access_denied", "voice_not_found"]);
// 스펙 6절 문구. connections가 참이면 '연결 상태 보기' 링크 버튼을 함께 둔다.
// 키 없음·키 문제는 T4 사유 안내와 같은 글자다(problemCopy, 계획 리뷰 ponytail 11·D24)
export function trialProblemText(provider: ProviderId, problem: TrialProblem): { text: string; connections: boolean } {
	const name = PROVIDER_LABEL[provider];
	switch (problem.reason) {
		case "no_key":
		case "provider_auth":
		case "no_permission": {
			const copy = problemCopy(provider, problem.reason);
			return { text: `${copy.title}. ${copy.description}`, connections: true };
		}
		case "quota":
			return { text: "크레딧이 부족해요. 기본 샘플은 무료로 들을 수 있어요", connections: false };
		case "rate_limit":
			return {
				text: problem.retryAt
					? `${retryTime(problem.retryAt)} 이후에 다시 들을 수 있어요`
					: "요청이 많아 잠시 막혔어요. 잠시 뒤 다시 눌러 주세요",
				connections: false,
			};
		case "provider_input": {
			const code = problem.providerCode;
			if (code === "audio_too_large")
				return { text: "결과 오디오가 너무 커요. 문장을 줄이거나 속도를 올려 주세요", connections: false };
			if (provider === "elevenlabs" && code && FREE_PLAN_CODES.has(code))
				return { text: "무료 플랜은 라이브러리 성우를 API로 쓸 수 없어요", connections: false };
			if (provider === "elevenlabs" && code && NOT_IN_ACCOUNT_CODES.has(code))
				return { text: "ElevenLabs 웹에서 내 계정에 추가한 뒤 '내 계정'에서 들어 보세요", connections: false };
			return { text: `${name}가 이 요청을 받지 않았어요.${code ? ` ${code}` : ""}`, connections: false };
		}
		case "provider_error":
			return { text: "공급자 쪽 오류예요. 잠시 뒤 다시 눌러 주세요", connections: false };
		case "unknown_outcome":
			return {
				text: "처리 여부를 확인하지 못했어요. 크레딧이 쓰였을 수 있으니 공급자 사용 기록을 확인한 뒤 다시 눌러 주세요",
				connections: false,
			};
		case "in_progress":
			return { text: "다른 문장을 만드는 중이에요. 끝난 뒤 다시 눌러 주세요", connections: false };
		case "free_ended":
			return { text: "Fish Audio 무료 모델 기간이 끝났어요. 유료 모델로 바꿔 들어 주세요", connections: false };
		case "request_mismatch":
			return { text: "다시 눌러 주세요", connections: false };
		case "storage":
			return { text: "지금은 내 문장을 들을 수 없어요. 기본 샘플은 들을 수 있어요", connections: false };
		default:
			return { text: "내 문장을 듣지 못했어요. 잠시 뒤 다시 눌러 주세요", connections: false };
	}
}
```
  `TrialFailure`는 `ProviderFailure`를 포함하므로 `problemCopy(provider, problem.reason)`의 세 사유 좁히기는 그대로 맞다. `problemCopy`의 `ProblemCopy`에 쓰지 않는 `reload` 칸이 있어도 그대로 둔다.

- [x] **Step 4: `blob-urls.test.ts`와 `blob-urls.ts` (Review Focus 4)**

```ts
import { describe, expect, it, vi } from "vitest";

import { blobUrls } from "./blob-urls";

describe("blobUrls", () => {
	it("같은 id는 주소 하나, 지우면 해제, 비우면 모두 해제", () => {
		let n = 0;
		const create = vi.fn(() => `blob:${(n += 1)}`);
		const revoke = vi.fn();
		const urls = blobUrls(create, revoke);
		const blob = new Blob(["x"]);
		expect(urls.ensure("a", blob)).toBe("blob:1");
		expect(urls.ensure("a", blob)).toBe("blob:1");
		expect(create).toHaveBeenCalledTimes(1);
		urls.ensure("b", blob);
		urls.forget("a");
		expect(revoke).toHaveBeenCalledWith("blob:1");
		expect(urls.get("a")).toBeUndefined();
		urls.clear();
		expect(revoke).toHaveBeenCalledWith("blob:2");
		expect(revoke).toHaveBeenCalledTimes(2);
	});
});
```

```ts
// 시험 생성 결과의 blob: 주소(결과 id마다 하나). 지우거나 화면을 떠날 때 해제한다(tts-provider 화면 절, 스펙 AC9)
export function blobUrls(
	create = (blob: Blob) => URL.createObjectURL(blob),
	revoke = (url: string) => URL.revokeObjectURL(url),
) {
	const urls = new Map<string, string>();
	return {
		get: (id: string) => urls.get(id),
		ensure(id: string, blob: Blob) {
			const known = urls.get(id);
			if (known) return known;
			const url = create(blob);
			urls.set(id, url);
			return url;
		},
		forget(id: string) {
			const url = urls.get(id);
			if (url === undefined) return;
			revoke(url);
			urls.delete(id);
		},
		clear() {
			for (const url of urls.values()) revoke(url);
			urls.clear();
		},
	};
}
```

- [x] **Step 5: `roving.ts` 셋째 칸** — 칸 주석을 "0 재생, 1 고르기, 2 내 문장 듣기"로, `export type Col = 0 | 1 | 2;`, `nextCell`의 ←/→를 한 칸씩으로 바꾼다.

```ts
		case "ArrowLeft":
			return { row: from.row, col: Math.max(from.col - 1, 0) as Col };
		case "ArrowRight":
			return { row: from.row, col: Math.min(from.col + 1, 2) as Col };
```
  `navigate`는 그대로(재생 칸이 비활성인 행만 고르기로 대신한다. 내 문장 듣기는 꺼져도 `aria-disabled`라 포커스를 받는다). `roving.test.ts`의 ←/→ 기대를 고친다: 0에서 → 1, 1에서 → 2, 2에서 → 2(머묾), 2에서 ← 1, 0에서 ← 0. 테스트를 먼저 고쳐 실패를 본 뒤 코드를 고친다.

- [x] **Step 6: `sample-state.ts` 명사와 성우 키** — 알림의 명사를 상태에 함께 둔다(T4 '샘플 샘플' 문제를 되풀이하지 않는다). 알림은 플레이어 한 곳만 한다(저장된 결과 재생의 "크레딧 0"까지, 컨텍스트 알림과 겹치지 않게, 계획 리뷰 D16). 내 문장 결과가 재생 중인 성우를 행·패널이 알도록 성우 키(`owner`)를 둔다(사용자 결정 U8).

```ts
// 알림의 명사. 기본 샘플 "샘플", 방금 만든 시험 생성 결과 "내 문장", 저장해 둔 결과 "저장된 결과"
export type Noun = "샘플" | "내 문장" | "저장된 결과";
export type Current = {
	voiceId: string;
	name: string;
	noun: Noun;
	// 내 문장 결과가 붙은 성우(voiceKey). 기본 샘플은 null이다. 행 강조·'정지' 버튼이 쓴다(U8)
	owner: string | null;
	status: Exclude<SampleStatus, "idle">;
} | null;

// 목적격 조사: 받침이 있으면 '을'(샘플, 내 문장), 없으면 '를'(결과)
const object = (noun: Noun) => (noun === "저장된 결과" ? `${noun}를` : `${noun}을`);
// 재생 시작 알림. 저장된 결과는 크레딧을 쓰지 않았다고 함께 알린다(브리프 12절 상태 표)
export const announceOf = (current: NonNullable<Current>) =>
	`${current.name} ${current.noun} 재생 중${current.noun === "저장된 결과" ? ", 크레딧 0" : ""}`;
export const stoppedText = (current: NonNullable<Current>) => `${current.name} ${object(current.noun)} 멈췄어요`;
export const failedText = (current: NonNullable<Current>) =>
	`${current.name} ${object(current.noun)} 재생하지 못했어요`;
```
  `pressSample(current, voiceId, name, noun: Noun = "샘플", owner: string | null = null)`이 `{ voiceId, name, noun, owner, status: "loading" }`을 돌려준다. `sample-state.test.ts`의 기대 객체에 `noun: "샘플", owner: null`을 더하고, 테스트 셋을 먼저 더한다(실패 확인): "명사·성우 키를 넘기면 그대로 담는다", "`announceOf`: 저장된 결과는 '재생 중, 크레딧 0'", "`stoppedText`: 결과는 '를', 샘플·내 문장은 '을'".

- [x] **Step 7: `connection-view.ts`와 연결 상태 카드(CS-01)** — 옛 Task 12를 여기에 합쳤다(같은 계산과 그 쓰는 곳, 계획 리뷰 ponytail 14).

```ts
// 429와 Retry-After를 받은 확인의 다음 확인 가능 시각(ISO). 없으면 null(CS-01, T5 스펙 AC20)
export function recheckUntil(result: ProviderStatusResult | null | undefined): string | null {
	if (result?.status !== "rate_limit" || result.retryAfterSeconds === null) return null;
	return new Date(Date.parse(result.checkedAt) + result.retryAfterSeconds * 1000).toISOString();
}
```
  `connection-view.test.ts`에 "rate_limit과 초가 있을 때만 확인 시각 + 초" 테스트를 먼저 더한다. 이어서 `provider-status-card.tsx`:
  - 문구: `reasonText`의 `rate_limit`을 `recheckUntil` 기준으로. 시각이 있으면 `` `${retryTime(until)} 이후 다시 확인할 수 있어요.` ``, 없으면 "잠시 뒤 다시 확인해 주세요."(그대로).
  - 버튼: `ProviderStatusCard` 안에서 `const until = recheckUntil(result); const waiting = useCooldown(until) !== null;`(`useCooldown`·`lockedButton`은 `voice-problem.tsx`). 버튼은 `disabled={checking || waiting}`, `focusableWhenDisabled`, `className={cn("w-full", lockedButton(waiting))}`. 시각이 지나면 `useCooldown`이 다시 그려 풀린다.
  - 설명: 대기 중이면 카드의 사유 문구 요소에 id(`useId`)를 붙이고 버튼 `aria-describedby`로 잇는다("다시 확인하기, 흐림"만 읽히지 않게, 계획 리뷰 D33).

- [x] **Step 8: 실행** — `pnpm --filter web test`, `pnpm --filter web check-types`(또는 `pnpm check-types`), biome. 기대: 모두 통과.

### Task 9: 내 문장 상태와 흐름

**Files:**
- Create: `apps/web/src/components/trial-provider.tsx`, `sentence-bar.tsx`, `trial-confirm.tsx`
- Modify: `apps/web/src/components/sample-player.tsx`, `voice-casting.tsx`, `casting-workspace.tsx`, `server-voice-list.tsx`·`typecast-voice-list.tsx`(빈 탭 공급자 전달)

**Interfaces:**
- Consumes: Task 6 프로시저(`orpc.trial*`, `client.trial*`), Task 7 AlertDialog, Task 8 함수들(`announceOf`·`stoppedText`·`failedText` 포함).
- Produces(`trial-provider.tsx`): `TrialProvider({ children })`, `useTrial(): TrialApi`

```ts
type TrialApi = {
	text: string;
	setText: (text: string) => void;
	settings: SettingsOf;
	// 옵션 컨트롤이 필드 이름으로 고친다(Task 10 Options가 fieldsOf로 그린다). 값은 계약 범위 안의 컨트롤 값이다
	setSetting: (provider: ProviderId, patch: Partial<Record<string, string | number | boolean>>) => void;
	resetSettings: (provider: ProviderId) => void;
	// 찾는 중·만드는 중인 성우(voiceKey)와 단계. 하나뿐이다(동시 1건)
	busy: { key: string; phase: "finding" | "creating" } | null;
	// 이 성우의 '내 문장 듣기'를 막는 이유(키 없음·빈 문장·다른 문장 만드는 중·대기 시각). 행·패널이 같은 값을 쓴다(계획 리뷰 ponytail 8, D10)
	blockOf: (voice: Voice) => string | null;
	problem: (key: string) => TrialProblem | null;
	// 이 성우의 내 문장 결과가 재생 중인가(사용자 결정 U8), 그리고 그 소리 멈추기
	playing: (voice: Voice) => boolean;
	stop: () => void;
	// 누르기: 저장본 찾기 → (무료면 바로, 아니면 확인 창) → 만들기. regenerate면 찾기 없이 확인 창부터(사용자 결정 U4)
	listen: (voice: Voice, opener: HTMLElement | null, options?: { regenerate?: boolean }) => void;
	playItem: (voice: Voice, item: TrialItem) => Promise<void>;
	// 그 결과의 blob: 주소(받았으면). 결과 줄의 재생 상태 키다
	urlOf: (id: string) => string | undefined;
	forget: (id: string) => void;
};
```
- Produces(`sample-player.tsx`): `toggle(voiceId, name, url, noun?: Noun, owner?: string | null)`, `usePlayer(): { current: Current; toggle; idle(): boolean }`(`idle`은 비동기 뒤에도 지금 상태를 읽는다).
- Produces(`sentence-bar.tsx`): `SentenceBar({ provider }: { provider: ProviderId | null })`.

- [x] **Step 1: `sample-player.tsx`** — `Toggle` 타입에 `noun?: Noun`(기본 "샘플")과 `owner?: string | null`(기본 null)을 더하고 `pressSample(current, voiceId, name, noun, owner)`으로 넘긴다. 알림 세 곳을 Task 8의 `announceOf(next)`·`stoppedText(current)`(멈출 때는 `current`의 명사)·`failedText(current)`로 바꾼다(markFailed가 명사를 그 상태에서 읽는다). 주석 "기본 샘플은 … 시험 생성과 합치지 않는다"를 "기본 샘플과 시험 생성 결과(blob: 주소)를 같은 오디오 요소로 재생한다. 호출은 합치지 않는다(REQ-03)"로 바꾼다. 맨 끝에 더한다.

  Provider 안에 지금 상태를 비동기 뒤에도 읽는 ref를 둔다: `const currentRef = useRef<Current>(null); useEffect(() => { currentRef.current = current; });`, 컨텍스트 값에 `current`와 `idle: () => currentRef.current === null || currentRef.current.status === "failed"`를 더한다(시험 생성을 기다린 뒤 판단한다, 렌더 클로저의 `current`는 오래된 값이다).

```ts
// 지금 재생 대상·toggle·idle. 시험 생성 결과를 다 만든 뒤 소리 나는 것이 없을 때만 재생하는 데 쓴다(브리프 12절)
export function usePlayer() {
	const player = useContext(SamplePlayerContext);
	if (!player) throw new Error("usePlayer는 SamplePlayerProvider 안에서만 쓴다");
	return player;
}
```
  `useSample`은 `const player = usePlayer();`로 줄인다.

- [x] **Step 2: `trial-provider.tsx`**

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProviderId, Voice } from "@tts-pilot-app/api/providers/contract";
import type { TrialAudio, TrialItem } from "@tts-pilot-app/api/providers/trial-contract";
import { DEFAULT_SETTINGS, type SettingsOf, type TrialRequest } from "@tts-pilot-app/api/providers/trial-options";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

import { blobUrls } from "@/lib/blob-urls";
import type { Noun } from "@/lib/sample-state";
import {
	needsConfirm,
	requestOf,
	type TrialProblem,
	trialBlock,
	trialFailureOf,
	trialProblemText,
} from "@/lib/trial-view";
import { voiceKey } from "@/lib/voice-view";
import { client, orpc } from "@/utils/orpc";

import { usePlayer } from "./sample-player";
import { TrialConfirm, type TrialPending } from "./trial-confirm";
import { useCooldown } from "./voice-problem";

const TrialContext = createContext<TrialApi | null>(null);

// 성우 캐스팅의 '내 문장 듣기' 상태 하나(T5 스펙 3절): 문장, 공급자별 설정, 진행 중(동시 1건), 공급자별 대기·키 없음, 성우별 오류, 확인 창, 결과 blob 주소.
// 화면을 떠나면 문장·설정이 처음으로 돌아가고 blob 주소를 모두 해제한다. 만들던 요청은 서버가 끝까지 처리해 저장한다(스펙 3절).
// 알림: 재생은 플레이어가 한 번(명사·"크레딧 0" 포함), 이 컨텍스트는 진행·완료(재생 안 함)·오류만 알린다(계획 리뷰 D16)
export function TrialProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const player = usePlayer();
	const create = useMutation(orpc.trialCreate.mutationOptions());
	const [text, setText] = useState("");
	const [settings, setSettings] = useState<SettingsOf>(DEFAULT_SETTINGS);
	const [busy, setBusy] = useState<TrialApi["busy"]>(null);
	const [retryAts, setRetryAts] = useState<Partial<Record<ProviderId, string>>>({});
	const [noKeys, setNoKeys] = useState<Partial<Record<ProviderId, true>>>({});
	const [problems, setProblems] = useState<Record<string, TrialProblem>>({});
	const [pending, setPending] = useState<TrialPending | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const urls = useRef(blobUrls());
	const mounted = useRef(true);
	// 대기 시각 타이머는 공급자마다 하나다(행마다 두지 않는다)
	const waiting: Record<ProviderId, string | null> = {
		typecast: useCooldown(retryAts.typecast),
		elevenlabs: useCooldown(retryAts.elevenlabs),
		fish_audio: useCooldown(retryAts.fish_audio),
	};

	useEffect(() => {
		mounted.current = true;
		const store = urls.current;
		return () => {
			mounted.current = false;
			store.clear();
		};
	}, []);

	// 결과 재생. 재생 키는 그 결과의 blob: 주소이고 성우 키를 함께 넘겨 행·패널이 '재생 중'·'정지'를 보인다(U8)
	const play = (voice: Voice, audio: TrialAudio, noun: Noun) => {
		const url = urls.current.ensure(audio.id, audio.audio);
		player.toggle(url, voice.name, url, noun, voiceKey(voice));
	};
	const fail = (voice: Voice, request: TrialRequest, error: unknown) => {
		const problem = trialFailureOf(error);
		if (problem.reason === "rate_limit" && problem.retryAt) {
			const retryAt = problem.retryAt;
			setRetryAts((all) => ({ ...all, [request.provider]: retryAt }));
		}
		if (problem.reason === "no_key") setNoKeys((all) => ({ ...all, [request.provider]: true }));
		setProblems((all) => ({ ...all, [voiceKey(voice)]: problem }));
		setAnnouncement(`${voice.name}: ${trialProblemText(request.provider, problem).text}`);
	};
	// 결과는 요청의 공급자·성우 목록에 붙는다. 지금 고른 성우가 아니다(Review Focus 3)
	const refreshList = (request: TrialRequest) =>
		queryClient.invalidateQueries({
			queryKey: orpc.trialList.key({ input: { provider: request.provider, voiceId: request.voiceId } }),
		});

	async function make(voice: Voice, request: TrialRequest, requestId: string) {
		const key = voiceKey(voice);
		setBusy({ key, phase: "creating" });
		setAnnouncement(`${voice.name} 내 문장을 만드는 중이에요`);
		try {
			const result = await create.mutateAsync({ requestId, request });
			await refreshList(request);
			if (!mounted.current) return;
			// 다른 소리를 끊지 않는다(브리프 12절). 기다린 뒤라 렌더 때 값이 아니라 지금 상태를 읽는다
			if (player.idle()) play(voice, result, "내 문장");
			else setAnnouncement(`${voice.name} 내 문장을 만들었어요`);
		} catch (error) {
			fail(voice, request, error);
		} finally {
			setBusy(null);
		}
	}

	async function listen(voice: Voice, opener: HTMLElement | null, options: { regenerate?: boolean } = {}) {
		if (busy !== null) return;
		const key = voiceKey(voice);
		const request = requestOf(voice, text, settings);
		setProblems(({ [key]: _removed, ...rest }) => rest);
		if (!options.regenerate) {
			setBusy({ key, phase: "finding" });
			try {
				const saved = await client.trialFind(request);
				if (saved) {
					// 알림은 플레이어가 "… 저장된 결과 재생 중, 크레딧 0"으로 한 번 한다(D16)
					play(voice, saved, "저장된 결과");
					return;
				}
			} catch (error) {
				fail(voice, request, error);
				return;
			} finally {
				setBusy(null);
			}
		}
		// 사용자 동작 하나 = 요청 id 하나. 확인 창은 열 때 만들어 두 번 눌러도 같은 id다(tts-provider)
		if (!needsConfirm(request)) {
			await make(voice, request, crypto.randomUUID());
			return;
		}
		setPending({ voice, request, requestId: crypto.randomUUID(), regenerate: options.regenerate === true, opener });
	}

	async function playItem(voice: Voice, item: TrialItem) {
		try {
			const known = urls.current.get(item.id);
			const url = known ?? urls.current.ensure(item.id, (await client.trialAudio({ id: item.id })).audio);
			player.toggle(url, voice.name, url, "저장된 결과", voiceKey(voice));
		} catch (error) {
			fail(voice, item.request, error);
			await refreshList(item.request);
		}
	}
	// 지금 소리 멈추기(행·패널의 '정지'). 같은 키로 toggle하면 멈춘다
	function stop() {
		const current = player.current;
		if (current) player.toggle(current.voiceId, current.name, current.voiceId, current.noun, current.owner);
	}
	// 지운 결과의 주소를 해제한다. 재생 중이면 먼저 멈춘다
	function forget(id: string) {
		const url = urls.current.get(id);
		if (url && player.current?.voiceId === url) stop();
		urls.current.forget(id);
	}

	const api: TrialApi = {
		text,
		setText,
		settings,
		setSetting: (provider, patch) =>
			setSettings((all) => ({ ...all, [provider]: { ...all[provider], ...patch } }) as SettingsOf),
		resetSettings: (provider) =>
			setSettings((all) => ({ ...all, [provider]: DEFAULT_SETTINGS[provider] })),
		busy,
		blockOf: (voice) =>
			trialBlock({
				provider: voice.provider,
				text,
				// 찾는 중에는 다른 버튼을 막지 않는다(D10)
				busyKey: busy?.phase === "creating" ? busy.key : null,
				key: voiceKey(voice),
				retryAt: waiting[voice.provider],
				noKey: noKeys[voice.provider] === true,
			}),
		problem: (key) => problems[key] ?? null,
		playing: (voice) => {
			const current = player.current;
			return current !== null && current.owner === voiceKey(voice) && current.status !== "failed";
		},
		stop,
		listen: (voice, opener, options) => void listen(voice, opener, options),
		playItem,
		urlOf: (id) => urls.current.get(id),
		forget,
	};
	return (
		<TrialContext value={api}>
			{children}
			<TrialConfirm
				pending={pending}
				onClose={() => setPending(null)}
				onConfirm={(current) => {
					setPending(null);
					void make(current.voice, current.request, current.requestId);
				}}
			/>
			<p role="status" className="sr-only">
				{announcement}
			</p>
		</TrialContext>
	);
}

export function useTrial(): TrialApi {
	const trial = useContext(TrialContext);
	if (!trial) throw new Error("useTrial은 TrialProvider 안에서만 쓴다");
	return trial;
}
```
  `TrialApi` 타입은 위 Interfaces 그대로 파일 안에 둔다.

- [x] **Step 3: `trial-confirm.tsx`** (브리프 12절 확인 창)

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import { estimate, type TrialRequest } from "@tts-pilot-app/api/providers/trial-options";
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
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Coins } from "lucide-react";
import { type RefObject, useRef, useState } from "react";

import { PROVIDER_LABEL } from "@/lib/connection-view";
import {
	remainingLabel,
	remainingLines,
	settingsSummary,
	typecastOverdrawn,
	usageText,
} from "@/lib/trial-view";
import { orpc } from "@/utils/orpc";

import { useSample } from "./sample-player";
import { SampleButton } from "./voice-row";

// ElevenLabs 모델 배율(예상 사용량). ElevenLabs 요청일 때만 부른다(무료 목록 조회, 서버 24시간 캐시). 못 받으면 배율 1(missing).
// 확인 창과 패널 구역(trial-section)이 함께 쓴다
export function useRate(request: TrialRequest) {
	const elevenlabs = request.provider === "elevenlabs";
	const models = useQuery({
		...orpc.trialModels.queryOptions(),
		enabled: elevenlabs,
		staleTime: 60 * 60 * 1000,
		retry: false,
		meta: { toast: false },
	});
	if (!elevenlabs) return { multiplier: null, missing: false };
	const multiplier =
		models.data?.rates.find((rate) => rate.model === request.settings.model)?.multiplier ?? null;
	return { multiplier, missing: multiplier === null && !models.isPending };
}

export type TrialPending = {
	voice: Voice;
	request: TrialRequest;
	requestId: string;
	regenerate: boolean;
	opener: HTMLElement | null;
};

// 크레딧이 드는 듣기의 확인 창(스펙 3절, 브리프 12절). 누를 때마다 연다. 첫 포커스는 '취소'이고 Esc·'취소'가 취소다.
// 바깥 누르기로는 닫히지 않는다(Base UI AlertDialog, 유료 확인 창의 표준, 계획 리뷰 D15·스펙 AC5)
export function TrialConfirm({
	pending,
	onClose,
	onConfirm,
}: {
	pending: TrialPending | null;
	onClose: () => void;
	onConfirm: (pending: TrialPending) => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	return (
		<AlertDialog open={pending !== null} onOpenChange={(open) => !open && onClose()}>
			{pending ? (
				<AlertDialogContent
					initialFocus={cancelRef}
					finalFocus={pending.opener ? { current: pending.opener } : undefined}
				>
					<ConfirmBody pending={pending} cancelRef={cancelRef} onConfirm={onConfirm} />
				</AlertDialogContent>
			) : null}
		</AlertDialog>
	);
}

function ConfirmBody({
	pending,
	cancelRef,
	onConfirm,
}: {
	pending: TrialPending;
	cancelRef: RefObject<HTMLButtonElement | null>;
	onConfirm: (pending: TrialPending) => void;
}) {
	const { voice, request, regenerate } = pending;
	const [sent, setSent] = useState(false);
	// 남은 값은 창을 열 때 새로 읽는다(T2 연결 상태와 같은 키, 무료 조회)
	const status = useQuery({
		...orpc.providerStatus.queryOptions({ input: { provider: request.provider } }),
		staleTime: 0,
		retry: false,
		meta: { toast: false },
	});
	const rate = useRate(request);
	const quota = status.data?.quota ?? null;
	const sample = voice.previewUrl;
	const { status: sampleStatus, toggle } = useSample(sample ?? "");
	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>크레딧을 써서 들어 볼까요?</AlertDialogTitle>
			</AlertDialogHeader>
			{/* 창의 설명은 이 정의 목록이다(새 설명 문구를 만들지 않는다, 계획 리뷰 D23). p 안에 dl을 둘 수 없어 div로 그린다 */}
			<AlertDialogDescription render={<div />} className="text-foreground">
				<dl className="flex flex-col gap-2 text-sm">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">성우</dt>
						<dd className="text-right">
							{voice.name} · <span translate="no">{PROVIDER_LABEL[request.provider]}</span>
						</dd>
					</div>
					{/* 행 버튼은 보이지 않는 설정(말투 태그·속도 등)을 쓸 수 있어 모델만이 아니라 설정 요약을 보인다(D13) */}
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">설정</dt>
						<dd className="text-right" translate="no">
							{settingsSummary(request)}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">예상 사용량</dt>
						<dd className="flex flex-wrap items-center justify-end gap-1.5 tabular-nums">
							<Coins aria-hidden="true" className="size-4 text-warning" />
							{usageText(estimate(request, rate.multiplier))}
							{rate.missing ? <span className="text-muted-foreground">(배율을 확인하지 못했어요)</span> : null}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">{remainingLabel(request.provider)}</dt>
						<dd className="flex flex-col items-end tabular-nums">
							{status.isFetching ? (
								<>
									<Spinner aria-hidden="true" />
									<span className="sr-only">확인하는 중</span>
								</>
							) : (
								remainingLines(request.provider, quota).map((line) => <span key={line}>{line}</span>)
							)}
						</dd>
					</div>
				</dl>
			</AlertDialogDescription>
			{request.provider === "typecast" && typecastOverdrawn(quota) ? (
				<p className="text-sm text-warning">남은 플랜 크레딧이 없어요. 플랜에 따라 추가 청구될 수 있어요</p>
			) : null}
			{regenerate ? (
				<p className="text-muted-foreground text-sm">같은 설정이어도 소리가 달라질 수 있어요</p>
			) : null}
			{sample ? (
				<div className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
					<SampleButton
						status={sampleStatus}
						subject={`${voice.name} 기본 샘플`}
						onToggle={() => toggle(sample, voice.name, sample)}
					/>
					<p className="flex flex-col">
						<span className="font-bold">기본 샘플</span>
						<span>크레딧 없이 들으려면 기본 샘플을 들어 보세요</span>
					</p>
				</div>
			) : null}
			<AlertDialogFooter>
				<AlertDialogCancel ref={cancelRef} size="lg">
					취소
				</AlertDialogCancel>
				<AlertDialogAction
					size="lg"
					disabled={sent}
					onClick={() => {
						setSent(true);
						onConfirm(pending);
					}}
				>
					<Coins data-icon="inline-start" aria-hidden="true" />
					크레딧 쓰고 듣기
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	);
}
```
  shadcn 생성물의 `AlertDialogCancel`·`AlertDialogAction`이 `size`·`ref`를 받지 않으면 `render={<Button size="lg" ref={cancelRef} />}`로 넘긴다(Task 7 생성물을 보고 맞춘다). `finalFocus`는 Base UI Popup 속성이다(생성물이 넘겨 주는지 확인). `AlertDialogDescription`이 `render`를 받지 않으면 생성물에 `render` 전달을 더한다(Base UI `Dialog.Description`은 받는다). 채운 청록 버튼 안 `Coins`는 글자색이다(유료 표식 색 규칙, Global Constraints).

- [x] **Step 4: `sentence-bar.tsx`** (브리프 12절 '내 문장' 바)

```tsx
"use client";

import type { ProviderId } from "@tts-pilot-app/api/providers/contract";
import { codePoints, TRIAL_TEXT_MAX, utf8Bytes } from "@tts-pilot-app/api/providers/trial-options";
import { Input } from "@tts-pilot-app/ui/components/input";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Play } from "lucide-react";
import { useId } from "react";

import { plain } from "@/lib/voice-view";

import { useTrial } from "./trial-provider";

// 모든 탭에서 같은 문장이다(TrialProvider). 상태 줄·안내 줄 아래, 본문 위(승인 시안 자리).
// 입력 상한은 maxLength(UTF-16)로 둔다. 한글 조합(IME)을 끊지 않고, 코드 포인트 200자 서버 검사보다 늘 짧거나 같다(ponytail).
// provider는 탭의 공급자(공급자 탭) 또는 고른 성우의 공급자다. Fish Audio면 바이트 수를 함께 보인다(계획 리뷰 D29)
export function SentenceBar({ provider }: { provider: ProviderId | null }) {
	const { text, setText } = useTrial();
	const id = useId();
	const count = codePoints(text);
	return (
		<section aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
			<div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border ring-inset md:flex-row md:items-center md:gap-4">
				<label id={`${id}-label`} htmlFor={id} className="shrink-0 font-bold">
					내 문장
				</label>
				<Input
					id={id}
					value={text}
					maxLength={TRIAL_TEXT_MAX}
					onChange={(event) => setText(event.target.value)}
					placeholder="들어 볼 문장을 써 주세요"
					aria-describedby={`${id}-count ${id}-hint`}
					className="h-11 flex-1"
				/>
				<p
					id={`${id}-count`}
					className={cn(
						"shrink-0 self-end text-sm tabular-nums md:self-auto",
						count >= 190 ? "text-warning" : "text-muted-foreground",
					)}
				>
					{plain.format(count)} / {TRIAL_TEXT_MAX}자
					{provider === "fish_audio" ? ` · ${plain.format(utf8Bytes(text))}바이트` : null}
				</p>
			</div>
			{/* 재생 기호는 아이콘(aria-hidden)이라 화면 낭독기는 "기본 샘플은 무료예요…"로 읽는다(계획 리뷰 D22) */}
			<p id={`${id}-hint`} className="text-muted-foreground text-sm">
				기본 샘플
				<Play aria-hidden="true" className="mx-0.5 inline size-3.5 fill-current align-middle" />
				은 무료예요. 내 문장 듣기는 크레딧을 써요(Fish Audio 무료 모델 제외).
			</p>
		</section>
	);
}
```
- [x] **Step 5: 끼우기** — `casting-workspace.tsx`: 반환 맨 바깥을 `<div className="flex flex-col gap-4"><SentenceBar provider={barProvider} />{지금 격자 div}</div>`로 감싼다. `const barProvider = selected?.provider ?? (voices.length > 0 && voices.every((v) => v.provider === voices[0]?.provider) ? (voices[0]?.provider ?? null) : null);`(주석: 공급자 탭이면 그 공급자, '전체' 탭은 고른 성우의 공급자. Fish Audio면 바이트 수, 계획 리뷰 D29). `voice-casting.tsx`: `<SamplePlayerProvider>` 바로 안에 `<TrialProvider>`로 `Tabs`를 감싸고, `sourceItem` 앞에 `export`를 붙인다(Task 10이 Typecast 감정 모드 세그먼트에 쓴다).

- [x] **Step 6: 검사** — `pnpm --filter web check-types`, biome, `pnpm --filter web test`(바뀐 lib 그대로 통과). import 방향: `trial-provider` → `trial-confirm`(`TrialConfirm`), `trial-section` → `trial-provider`·`trial-confirm`(`useRate`). `trial-confirm` → `voice-row`(SampleButton) → (Task 11) `trial-provider` → `trial-confirm`은 렌더 때만 쓰는 순환이라 동작은 같다. 번들러가 경고하면 `SampleButton`을 `sample-button.tsx`로 옮긴다.

### Task 10: 패널 '내 문장 듣기' 구역과 결과 목록

편집 직전에 `.agents/skills/impeccable/reference/craft-floor.md`를 읽는다.

**Files:**
- Create: `apps/web/src/components/trial-section.tsx`, `trial-results.tsx`
- Modify: `apps/web/src/components/voice-panel.tsx`, `voice-conditions.tsx`(`RadioMenu`, `SortMenu`가 그것을 씀), `voice-row.tsx`(`SampleButton`에 `describedBy`)

**Interfaces:**
- Consumes: `useTrial`, Task 7 Slider·Switch·AlertDialog, Task 8 함수들, `sourceItem`, `lockedButton`·`ReloadButton`(voice-problem).
- Produces: `RadioMenu`(voice-conditions), `TrialSection({ voice })`, `TrialResults({ voice })`, `useTrialItems(voice)`(trial-results). `useRate`는 Task 9 `trial-confirm.tsx`에 있다.

- [x] **Step 1: `RadioMenu`로 하나 고르기 메뉴 합치기(`voice-conditions.tsx`)** — `SortMenu`를 일반화해 패널 메뉴(모델·감정·언어·말투 태그)와 함께 쓴다(세 번째 복사본을 만들지 않는다, 계획 리뷰 ponytail 1). `SortMenu`는 이것을 부르는 한 줄이 된다. 정렬 버튼에 접근 이름 "정렬, 인기 급상승 선택됨"이 생기는 것 말고는 T4 동작·모양이 같다.

```tsx
// 하나 고르기 메뉴('전체' 항목 없음, 고르면 닫힘). 상태 줄 정렬과 패널 '내 문장 듣기'의 모델·감정·언어·말투 태그가 함께 쓴다.
// 칠은 늘 기본(conditionButton(0))이다. 조건 줄의 옅은 청록은 '조건이 걸림' 신호라 여기서는 쓰지 않고,
// 기본값이 아니면 값 글자만 굵게 한다(strong, 슬라이더 값 글자와 같은 규칙, 계획 리뷰 D27)
export function RadioMenu<T extends string>({
	label,
	value,
	options,
	onChange,
	disabled = false,
	align,
	separator = " · ",
	strong = false,
}: {
	label: string;
	value: T;
	options: readonly { value: T; label: string; free?: true }[];
	onChange: (value: T) => void;
	disabled?: boolean;
	align?: "start" | "end";
	separator?: string;
	strong?: boolean;
}) {
	const shown = options.find((option) => option.value === value)?.label ?? value;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<Button
						variant="outline"
						size="lg"
						aria-label={`${label}, ${shown} 선택됨`}
						className={conditionButton(0)}
					/>
				}
			>
				<span className="flex min-w-0 items-center">
					{label}
					<span className="whitespace-pre">{separator}</span>
					<span className={cn("max-w-40 truncate", strong && "font-bold")}>{shown}</span>
				</span>
				<ChevronDown data-icon="inline-end" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent className={menuContent} align={align}>
				<DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
					{options.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
							{option.label}
							{option.free ? <Badge variant="success">무료</Badge> : null}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```
  `SortMenu`의 본문은 `<RadioMenu label="정렬" separator=": " value={sort.value} options={sort.options} onChange={sort.onChange} disabled={disabled} align="end" />`가 된다(주석은 그대로). import에 `Badge`(`@tts-pilot-app/ui/components/badge`)와 `cn`을 더한다(없으면). 확인: `pnpm --filter web test`, 그리고 코디네이터 QA에서 정렬 메뉴가 T4와 같은지 본다.

- [x] **Step 2: `SampleButton`에 설명 잇기(`voice-row.tsx`)** — 속성 `describedBy?: string`을 더해 `aria-describedby={describedBy}`로 넘긴다(결과 줄 재생 버튼이 문장·요약을 설명으로 잇는다, 계획 리뷰 D6). 다른 호출은 그대로다.

- [x] **Step 3: 옵션 컨트롤(`trial-section.tsx` 앞부분)**

```tsx
"use client";

import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	comboSignature,
	DEFAULT_SETTINGS,
	estimate,
	fieldsOf,
	type Range,
	RANGES,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { Badge } from "@tts-pilot-app/ui/components/badge";
import { Button } from "@tts-pilot-app/ui/components/button";
import { Input } from "@tts-pilot-app/ui/components/input";
import { Slider } from "@tts-pilot-app/ui/components/slider";
import { Spinner } from "@tts-pilot-app/ui/components/spinner";
import { Switch } from "@tts-pilot-app/ui/components/switch";
import { Toggle } from "@tts-pilot-app/ui/components/toggle";
import { ToggleGroup } from "@tts-pilot-app/ui/components/toggle-group";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Coins, Info, Square } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import {
	dataNote,
	ELEVENLABS_TAGS,
	emotionLabel,
	FIELD_LABEL,
	FISH_TAGS,
	LANGUAGE_LABEL,
	modelOptionsOf,
	presetsOf,
	requestOf,
	trialAriaLabel,
	trialProblemText,
	usageText,
	valueText,
} from "@/lib/trial-view";
import { voiceKey } from "@/lib/voice-view";

import { useRate } from "./trial-confirm";
import { useTrial } from "./trial-provider";
import { useTrialItems } from "./trial-results";
import { sourceItem } from "./voice-casting";
import { RadioMenu } from "./voice-conditions";
import { lockedButton } from "./voice-problem";

// 슬라이더 한 줄: 왼쪽 이름표, 오른쪽 값 글자(기본값에서 벗어나면 굵게). 누르는 자리 44px.
// 손잡이의 값 글자는 늘 valueText다("1.00배", "+2반음", 계획 리뷰 D17). 채움 색은 무채색이다(Task 7, 사용자 결정 U7)
function SliderRow({
	field,
	value,
	range,
	onChange,
}: {
	field: string;
	value: number;
	range: Range;
	onChange: (value: number) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between text-sm">
				<span id={id}>{FIELD_LABEL[field] ?? field}</span>
				<span className={cn("tabular-nums", value !== range.default && "font-bold")}>
					{valueText(field, value)}
				</span>
			</div>
			<Slider
				aria-labelledby={id}
				getAriaValueText={(_formatted, next) => valueText(field, next)}
				className="min-h-11"
				min={range.min}
				max={range.max}
				step={range.step}
				value={value}
				onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : (next as number))}
			/>
		</div>
	);
}

const CUSTOM = "__custom";
// 말투 태그: 공식 목록 + '직접 쓰기…'(30자, 대괄호는 앱이 붙인다). "효과는 들어 봐야 알아요"는 태그를 골랐을 때만(계획 리뷰 D30)
function TagControl({
	tags,
	value,
	onChange,
}: {
	tags: { value: string; label: string }[];
	value: string;
	onChange: (value: string) => void;
}) {
	const [custom, setCustom] = useState(value !== "" && !tags.some((tag) => tag.value === value));
	const id = useId();
	return (
		<div className="flex flex-col gap-2">
			<RadioMenu
				label="말투 태그"
				value={custom ? CUSTOM : value}
				strong={value !== ""}
				options={[
					{ value: "", label: "없음" },
					...tags.map((tag) => ({ value: tag.value, label: `${tag.label} [${tag.value}]` })),
					{ value: CUSTOM, label: "직접 쓰기…" },
				]}
				onChange={(next) => {
					setCustom(next === CUSTOM);
					onChange(next === CUSTOM ? "" : next);
				}}
			/>
			{custom ? (
				<Input
					aria-label="말투 태그 직접 쓰기"
					aria-describedby={id}
					value={value}
					maxLength={30}
					onChange={(event) => onChange(event.target.value.replace(/[[\]\r\n]/g, ""))}
					className="h-11"
				/>
			) : null}
			{custom || value !== "" ? (
				<p id={id} className="text-muted-foreground text-sm">
					효과는 들어 봐야 알아요
				</p>
			) : null}
		</div>
	);
}

// 그 모델이 받는 옵션만 FIELDS 표 순서로 그린다(fieldsOf). 범위가 있는 필드는 슬라이더 한 줄이고,
// 나머지 다섯(감정 모드·감정·언어·화자 증폭·말투 태그)만 따로 그린다(계획 리뷰 ponytail 2).
// 값은 공급자 설정을 고치고(setSetting), 성우에 맞춘 보정은 요청에서만 한다
function Options({ voice, request }: { voice: Voice; request: TrialRequest }) {
	const { setSetting } = useTrial();
	const { provider } = request;
	const values = request.settings as Record<string, string | number | boolean>;
	const defaults = DEFAULT_SETTINGS[provider] as Record<string, unknown>;
	const ranges: Partial<Record<string, Range>> = RANGES[provider];
	const set = (field: string, value: string | number | boolean) => setSetting(provider, { [field]: value });
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
				return (
					<RadioMenu
						key={field}
						label="언어"
						value={String(values.language)}
						strong={values.language !== defaults.language}
						options={(["auto", "kor"] as const).map((language) => ({
							value: language,
							label: LANGUAGE_LABEL[language],
						}))}
						onChange={(language) => set("language", language)}
					/>
				);
			case "speakerBoost":
				return (
					<label key={field} className="flex min-h-11 items-center justify-between gap-3 text-sm">
						{FIELD_LABEL.speakerBoost}
						<Switch checked={values.speakerBoost === true} onCheckedChange={(on) => set("speakerBoost", on)} />
					</label>
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
			{fieldsOf(request).map((field) => {
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

- [x] **Step 4: 구역(`trial-section.tsx` 끝)**

```tsx
// 패널 '내 문장 듣기' 구역(브리프 12절). 자리는 이용 조건 뒤, 결과 목록 앞이다(사용자 결정 U5).
// 머리('처음 값으로'는 늘 그리고 기본값이면 흐림, D12) → 옵션 → 데이터 안내 → 바닥에 붙는 줄(예상 사용량·버튼·새로 만들기·이유·오류, U3).
// 바닥 줄은 패널(칸은 voice-panel-sticky, 서랍은 본문)의 스크롤 칸 바닥에 붙고, 제자리가 보이면 풀린다
export function TrialSection({ voice }: { voice: Voice }) {
	const trial = useTrial();
	const request = requestOf(voice, trial.text, trial.settings);
	const key = voiceKey(voice);
	const rate = useRate(request);
	const items = useTrialItems(voice);
	const signature = comboSignature(request);
	const saved = items.data?.some((item) => comboSignature(item.request) === signature) === true;
	const block = trial.blockOf(voice);
	const mine = trial.busy?.key === key;
	const creating = mine && trial.busy?.phase === "creating";
	const playing = trial.playing(voice);
	const usage = estimate(request, rate.multiplier);
	const note = dataNote(request);
	const problem = trial.problem(key);
	const problemText = problem ? trialProblemText(voice.provider, problem) : null;
	const changed =
		JSON.stringify(trial.settings[voice.provider]) !== JSON.stringify(DEFAULT_SETTINGS[voice.provider]);
	const headingId = useId();
	const reasonId = useId();
	const problemId = useId();
	// 빈 문장이면 예상 사용량 줄을 숨긴다(D9). 오류 줄이 있으면 막는 이유 줄은 숨기고 버튼 설명을 오류 줄로 돌린다(D11)
	const empty = block === "문장을 먼저 써 주세요";
	const describedBy = problemText ? problemId : block ? reasonId : undefined;
	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-3">
			<div className="flex min-h-11 items-center justify-between gap-2">
				<h3 id={headingId} className="font-bold">
					내 문장 듣기
				</h3>
				<Button
					variant="ghost"
					size="lg"
					focusableWhenDisabled
					disabled={!changed}
					className={cn("text-muted-foreground", lockedButton(!changed))}
					onClick={() => trial.resetSettings(voice.provider)}
				>
					처음 값으로
				</Button>
			</div>
			<div className="flex flex-col gap-3">
				<Options voice={voice} request={request} />
			</div>
			{note ? (
				<p className="flex gap-2 text-muted-foreground text-sm">
					<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					{note}
				</p>
			) : null}
			<div className="sticky bottom-0 z-10 flex flex-col gap-2 border-border border-t bg-card pt-3 pb-1">
				{empty ? null : (
					<p className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums">
						{saved ? (
							"저장된 결과 · 크레딧 0"
						) : usage.unit === "free" ? (
							<Badge variant="success">무료</Badge>
						) : (
							<>
								<Coins aria-hidden="true" className="size-4 text-warning" />
								{usageText(usage)}
							</>
						)}
						{!saved && rate.missing ? (
							<span className="text-muted-foreground">(배율을 확인하지 못했어요)</span>
						) : null}
					</p>
				)}
				<Button
					size="lg"
					className={cn("w-full", lockedButton(!playing && block !== null))}
					focusableWhenDisabled
					disabled={!playing && (block !== null || mine)}
					aria-label={trialAriaLabel(
						voice.name,
						request,
						playing ? "playing" : creating ? "busy" : saved ? "saved" : "idle",
					)}
					aria-describedby={describedBy}
					onClick={(event) => (playing ? trial.stop() : trial.listen(voice, event.currentTarget))}
				>
					{playing ? (
						<Square data-icon="inline-start" aria-hidden="true" className="fill-current" />
					) : mine ? (
						<Spinner data-icon="inline-start" aria-hidden="true" />
					) : saved ? null : usage.unit === "free" ? (
						<Badge variant="success">무료</Badge>
					) : (
						// 채운 청록 버튼 안의 유료 표식은 글자색이다(Global Constraints)
						<Coins data-icon="inline-start" aria-hidden="true" />
					)}
					{playing ? "정지" : creating ? "만드는 중…" : saved ? "저장된 결과 듣기" : "내 문장 듣기"}
				</Button>
				{/* 같은 조합을 다시 만들기(유료). 결과 줄이 아니라 여기 하나만 둔다(사용자 결정 U4) */}
				{saved && !playing ? (
					<Button
						variant="outline"
						size="lg"
						className={cn("w-full", lockedButton(block !== null))}
						focusableWhenDisabled
						disabled={block !== null || mine}
						aria-label={`${voice.name} 새로 만들기, 크레딧 사용`}
						aria-describedby={describedBy}
						onClick={(event) => trial.listen(voice, event.currentTarget, { regenerate: true })}
					>
						<Coins data-icon="inline-start" aria-hidden="true" className="text-warning" />
						새로 만들기
					</Button>
				) : null}
				{problemText ? (
					<div id={problemId} className="flex flex-col items-start text-sm text-warning">
						<p>{problemText.text}</p>
						{problemText.connections ? (
							// T4 사유 안내와 같은 44px 링크 버튼(계획 리뷰 D25)
							<Button variant="link" size="lg" className="px-0" render={<Link href="/connections" />}>
								연결 상태 보기
							</Button>
						) : null}
					</div>
				) : block ? (
					<p id={reasonId} className="text-muted-foreground text-sm">
						{block}
					</p>
				) : null}
			</div>
		</section>
	);
}
```
  `Button variant="link" size="lg"`의 `px-0`은 T4 `voice-problem.tsx`의 링크 버튼과 같은 꼴로 맞춘다(생성물 lg 패딩이 `px-0`을 덮으면 T4와 같은 방법을 쓴다, 백로그 VC-22). 바닥 줄의 `bg-card`는 서랍 본문 바탕과 같은 토큰인지 확인한다(서랍이 `bg-background`면 그 토큰으로).

- [x] **Step 5: `trial-results.tsx`**

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { TrialItem } from "@tts-pilot-app/api/providers/trial-contract";
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
import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tts-pilot-app/ui/components/tooltip";
import { Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { resultLine, resultSubject } from "@/lib/trial-view";
import { orpc } from "@/utils/orpc";

import { useSample } from "./sample-player";
import { useTrial } from "./trial-provider";
import { ReloadButton } from "./voice-problem";
import { SampleButton } from "./voice-row";

// 이 성우의 완료 결과(오디오 없음). 패널 구역의 '저장된 결과 듣기' 판정과 결과 목록이 같은 키를 쓴다(TanStack 중복 제거)
export function useTrialItems(voice: Voice) {
	return useQuery({
		...orpc.trialList.queryOptions({ input: { provider: voice.provider, voiceId: voice.voiceId } }),
		retry: false,
		meta: { toast: false },
	});
}

// '내 문장 결과'(브리프 12절): 이 성우의 완료 결과 최신순 20개. 이용 조건·담기와 같은 소제목의 형제 구역이다(계획 리뷰 D28).
// 줄마다 재생(저장본, 크레딧 0)·지우기. 새로 만들기는 줄에 두지 않는다(사용자 결정 U4)
export function TrialResults({ voice }: { voice: Voice }) {
	const items = useTrialItems(voice);
	const [removing, setRemoving] = useState<TrialItem | null>(null);
	const headRef = useRef<HTMLHeadingElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const queryClient = useQueryClient();
	const trial = useTrial();
	const remove = useMutation(orpc.trialDelete.mutationOptions());
	const now = new Date();
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.trialList.key({ input: { provider: voice.provider, voiceId: voice.voiceId } }),
		});
	return (
		<section className="flex flex-col gap-2">
			<h3 ref={headRef} tabIndex={-1} className="font-bold outline-none">
				내 문장 결과
			</h3>
			{items.isPending ? (
				// 받는 중(계획 리뷰 D20)
				<Skeleton className="h-11 w-full" />
			) : items.isError ? (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-muted-foreground text-sm">결과를 불러오지 못했어요</p>
					<ReloadButton reloading={items.isFetching} onReload={() => void items.refetch()} />
				</div>
			) : items.data.length === 0 ? (
				<p className="text-muted-foreground text-sm">아직 들어 본 문장이 없어요</p>
			) : (
				<ul ref={listRef} className="flex flex-col gap-1">
					{items.data.map((item) => (
						<ResultRow
							key={item.id}
							voice={voice}
							item={item}
							line={resultLine(item, now)}
							onRemove={() => setRemoving(item)}
						/>
					))}
				</ul>
			)}
			<AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>이 결과를 지울까요?</AlertDialogTitle>
						<AlertDialogDescription>지우면 같은 문장을 다시 들을 때 크레딧을 써요.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel size="lg">취소</AlertDialogCancel>
						<AlertDialogAction
							size="lg"
							variant="destructive"
							disabled={remove.isPending}
							onClick={async () => {
								if (!removing || remove.isPending) return;
								const index = items.data?.findIndex((item) => item.id === removing.id) ?? -1;
								try {
									await remove.mutateAsync({ id: removing.id });
									trial.forget(removing.id);
								} catch {
									// 이미 지워졌거나(NOT_FOUND) 저장소 실패: 목록을 다시 받아 지금 상태를 보인다(계획 리뷰 D21)
								} finally {
									setRemoving(null);
									await refresh();
								}
								// 지운 뒤 포커스는 다음 줄, 없으면 머리(브리프 12절)
								const next = listRef.current?.children[index]?.querySelector("button");
								(next ?? headRef.current)?.focus();
							}}
						>
							지우기
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

// 결과 한 줄: ▷ · 문장(한 줄 말줄임) · 요약(언제·사용량·설정, 두 줄까지, D2) · 지우기.
// 버튼 이름은 줄마다 다르고(문장 앞 20자) 문장 전체와 요약은 설명으로 잇는다(title을 쓰지 않는다, 계획 리뷰 D6)
function ResultRow({
	voice,
	item,
	line,
	onRemove,
}: {
	voice: Voice;
	item: TrialItem;
	line: string;
	onRemove: () => void;
}) {
	const trial = useTrial();
	const [loading, setLoading] = useState(false);
	const id = useId();
	// 재생 키는 그 결과의 blob: 주소다. 아직 받지 않았으면 어떤 키와도 같지 않은 결과 id
	const { status } = useSample(trial.urlOf(item.id) ?? item.id);
	const subject = resultSubject(voice.name, item);
	const details = `${id}-text ${id}-line`;
	return (
		<li className="flex min-h-11 items-center gap-3">
			<SampleButton
				status={loading ? "loading" : status}
				subject={subject}
				describedBy={details}
				onToggle={async () => {
					setLoading(true);
					await trial.playItem(voice, item);
					setLoading(false);
				}}
			/>
			<span className="flex min-w-0 flex-1 flex-col">
				<span id={`${id}-text`} className="truncate">
					{item.request.text}
				</span>
				<span id={`${id}-line`} className="line-clamp-2 text-muted-foreground text-sm tabular-nums" translate="no">
					{line}
				</span>
			</span>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label={`${subject} 지우기`}
							aria-describedby={details}
							onClick={onRemove}
						/>
					}
				>
					<Trash2 aria-hidden="true" />
				</TooltipTrigger>
				<TooltipContent>지우기</TooltipContent>
			</Tooltip>
		</li>
	);
}
```

- [x] **Step 6: 패널에 넣기(`voice-panel.tsx`)** — `VoicePanelContent`에서 이용 조건(Typecast는 '모델별 감정') 구역 **뒤**에 `<TrialSection voice={voice} />`와 `<TrialResults voice={voice} />`를 차례로 둔다. 순서는 기본 샘플 → 이용 조건 → 내 문장 듣기 → 내 문장 결과다(승인 시안, 사용자 결정 U5). 서랍 설명 "성우 정보와 기본 샘플"을 "성우 정보, 기본 샘플, 내 문장 듣기"로 바꾼다(계획 리뷰 D32).
- [x] **Step 7: 검사** — `pnpm --filter web check-types`, biome, 금지 패턴 grep 0, `pnpm --filter web test`.

### Task 11: 행의 '내 문장 듣기'

**Files:**
- Modify: `apps/web/src/components/voice-row.tsx`

**Interfaces:**
- Consumes: `useTrial`(`blockOf`·`playing`·`stop`·`problem`), Task 8 `trialAriaLabel`·`requestOf`·`needsConfirm`·`TRIAL_SHORT_PROBLEM`·`trialProblemText`·`Col`(0|1|2).

- [x] **Step 1: `TrialButton`** — `voice-row.tsx`에 더한다.

```tsx
// 행의 '내 문장 듣기'(브리프 12절): 행 격자 셋째 칸. 그 공급자의 지금 설정으로 듣는다.
// 글자 버튼은 목록 칸 42rem(672px, @2xl) 이상에서만이고, 그 아래는 44px 아이콘 버튼과 툴팁이다(사용자 결정 U1: 1200~1439px에서 이름 칸을 지킨다).
// 아이콘은 유료면 Coins(경고색), Fish Audio 무료 모델이면 AudioLines다. 어느 너비에서도 유료 표식이 보인다(사용자 결정 U2).
// 이 성우의 내 문장 결과가 재생 중이면 채운 청록 '정지'가 된다(기본 샘플과 같은 문법, 사용자 결정 U8).
// 꺼져도 포커스는 받고 마우스를 올리면 툴팁에 이유가 보인다(pointer-events를 끄지 않는다, 계획 리뷰 D18. 누르기는 Base UI focusableWhenDisabled가 막는다)
function TrialButton({
	voice,
	tabIndex,
	onPick,
	describedBy,
}: {
	voice: Voice;
	tabIndex: number;
	// 1200px 이상이면 그 성우를 골라 패널에 결과·오류가 보이게 한다(계획 '스펙과 다른 점' 7)
	onPick?: () => void;
	// 행의 실패 전체 문구(계획 리뷰 D4)
	describedBy?: string;
}) {
	const trial = useTrial();
	const key = voiceKey(voice);
	const request = requestOf(voice, trial.text, trial.settings);
	const block = trial.blockOf(voice);
	const mine = trial.busy?.key === key;
	const creating = mine && trial.busy?.phase === "creating";
	const playing = trial.playing(voice);
	const free = !needsConfirm(request);
	const reasonId = useId();
	const describe = [block && !playing ? reasonId : null, describedBy].filter(Boolean).join(" ") || undefined;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant={playing ? "default" : "outline"}
						size="lg"
						className={cn(
							"relative z-10 shrink-0 @max-2xl:size-11 @max-2xl:px-0",
							!playing && block !== null && "aria-disabled:opacity-50",
						)}
						focusableWhenDisabled
						disabled={!playing && (block !== null || mine)}
						tabIndex={tabIndex}
						aria-label={trialAriaLabel(voice.name, request, playing ? "playing" : creating ? "busy" : "idle")}
						aria-describedby={describe}
						onClick={(event) => {
							if (playing) {
								trial.stop();
								return;
							}
							onPick?.();
							trial.listen(voice, event.currentTarget);
						}}
					/>
				}
			>
				{playing ? (
					<Square aria-hidden="true" className="fill-current" />
				) : mine ? (
					<Spinner aria-hidden="true" />
				) : free ? (
					<>
						<AudioLines aria-hidden="true" className="@2xl:hidden" />
						<Badge variant="success" className="@max-2xl:hidden">
							무료
						</Badge>
					</>
				) : (
					<Coins aria-hidden="true" className="text-warning" />
				)}
				<span className="@max-2xl:sr-only">{playing ? "정지" : creating ? "만드는 중…" : "내 문장 듣기"}</span>
			</TooltipTrigger>
			<TooltipContent>{block && !playing ? block : playing ? "정지" : "내 문장 듣기"}</TooltipContent>
			{block && !playing ? (
				<span id={reasonId} className="sr-only">
					{block}
				</span>
			) : null}
		</Tooltip>
	);
}
```
  import(없는 것만 더한다): `Badge`, `Tooltip`·`TooltipContent`·`TooltipTrigger`(`@tts-pilot-app/ui/components/…`), `AudioLines`·`Coins`·`Square`(lucide, `Square`는 이미 있다), `Spinner`, `needsConfirm`·`requestOf`·`trialAriaLabel`·`trialProblemText`·`TRIAL_SHORT_PROBLEM`(`@/lib/trial-view`), `voiceKey`(`@/lib/voice-view`), `useTrial`(`./trial-provider`), `useRef`.
  Tailwind 4의 컨테이너 최대 변형(`@max-2xl:`)이 이 설치본에서 생성되는지 빌드 CSS로 확인한다. 안 되면 기본값을 뒤집어 쓴다(`size-11 px-0 @2xl:size-auto @2xl:px-4`, 글자 `sr-only @2xl:not-sr-only`). T4 오른쪽 칸 숨김 기준(`@lg`)은 그대로 둔다.

- [x] **Step 2: 행에 끼우기와 재생 중·실패 표시** — `VoiceRow`에서:
  - `const trial = useTrial();`, `const trialProblem = trial.problem(voiceKey(voice));`, `const trialPlaying = trial.playing(voice);`. 재생 중 표시(청록 왼쪽 띠와 '재생 중' 배지)의 조건을 `playing || trialPlaying`으로 넓힌다(내 문장 결과가 소리 나도 그 성우 행이 켜진다, 사용자 결정 U8). 샘플 버튼 자체의 상태는 그대로 기본 샘플만 본다.
  - 실패 글자: 샘플 실패 글자 자리(`{status === "failed" ? … "재생하지 못했어요" …}` 바로 뒤, 메타 줄 끝)에 `{trialProblem ? <span className="shrink-0 text-warning">{TRIAL_SHORT_PROBLEM}<span id={`${id}-trial`} className="sr-only">: {trialProblemText(voice.provider, trialProblem).text}</span></span> : null}`를 둔다. 1199px 이하처럼 패널이 닫혀 있어도 행에서 실패가 보이고, 전체 문구는 행 설명과 버튼 설명으로 읽힌다(계획 리뷰 D4). 전체 문구와 '연결 상태 보기'는 패널·서랍에 그대로 있다.
  - `article` 안, 고르기 버튼 뒤(DOM 순서가 셋째 버튼)에 `<TrialButton voice={voice} tabIndex={tabbable === 2 ? 0 : -1} describedBy={trialProblem ? `${id}-trial` : undefined} onPick={panelId ? () => selectRef.current && onSelect(voice, selectRef.current) : undefined} />`. 고르기 버튼에 `ref={selectRef}`(`useRef<HTMLButtonElement>(null)`). 고르기 버튼의 `tabIndex`를 `tabbable === 1 || (tabbable === 0 && url === null) ? 0 : -1`로 바꾼다(셋째 칸이 지금 칸일 때 0이 둘이 되지 않게). `tabbable`의 타입은 `Col | null`(0|1|2) 그대로. 주석의 "(0 재생, 1 고르기)"를 "(0 재생, 1 고르기, 2 내 문장 듣기)"로.
- [x] **Step 3: `RowList.cellOf`** — `if (col !== 0 && col !== 1) return null;`을 `if (col !== 0 && col !== 1 && col !== 2) return null;`로. 주석 "행 안 버튼 순서(0 재생, 1 고르기, 2 내 문장 듣기)". 툴팁이 버튼 밖에 요소를 더 그리지 않는지(행의 `button` 순서가 셋인지) 확인한다.
- [x] **Step 4: 검사** — `pnpm --filter web check-types`, biome, `pnpm --filter web test`(roving 테스트).

### Task 12: 문서

**Files:**
- Modify: `docs/domain/project.md`, `docs/research/typecast-api-options.md`, `elevenlabs-api-options.md`, `fish-audio-api-options.md`, `docs/adr/0003-postgres-cache.md`, `.claude/skills/tts-provider/SKILL.md`(`.agents/skills/tts-provider/SKILL.md`와 같은 파일이면 그 하나), `docs/briefs/casting.md`, `docs/plans/implementation-roadmap.md`

- [x] **Step 1: `project.md`** — 기능 표에 '내 문장 듣기(시험 생성)', 화면 `/casting` 설명에 바·패널 구역·확인 창, API 표에 프로시저 여섯(보호 `protectedProcedure`, 용어 칸 '시험 생성'·'저장된 결과'·'예상 사용량'), 데이터 모델에 `trial_generation`(용어 '생성 기록'·'저장된 결과', 30일), 흐름에 "문장 → 찾기(저장본) → 확인 창 → 만들기". 날짜별 기록을 덧붙이지 않고 해당 절을 고친다.
- [x] **Step 2: research 합치기** — `tasks/evidence/T05/research/*.md`의 각 '기존 문서와 달라진 점'을 해당 `docs/research/<공급자>-api-options.md`의 그 절에 반영하고 확인일 2026-10-05를 단다(Typecast: 무료 경로 없음·SDK 오류 헤더·`seed` 없음·약관 문장 이용. ElevenLabs: 무료 미리듣기 없음 FAQ 인용·402 `insufficient_credits`·`cost_discount_multiplier`·history API·약관. Fish Audio: `model` 헤더 기본값 `s2.1-pro`·무료 모델 조건·요청 id 없음·약관).
- [x] **Step 3: ADR 0003 Consequences** — "공급자 약관이 … T5 설계에서 확인한다"를 확인 결과(세 공급자 모두 명시 금지 없음, ElevenLabs 블로그는 입력 해시 캐시 권장)와 보관 30일·사용자 지우기로 바꾼다.
- [x] **Step 4: `tts-provider` 스킬** — '클론 보이스와 공급자 리소스 소유권' 절에 "한 명 소유 예외(T4 목록, T5 듣기): 이 앱의 소유자가 한 명이고 가입이 막혀 있어 공급자 계정 키로 쓸 수 있는 성우는 모두 시험 생성에 허용한다. 성우 조회 없이 공급자 거절(과금 없음)에 맡긴다. 가입을 여는 결정이 나면 이 예외를 없애고 위 판정으로 돌아간다." '확인한 SDK 동작' 표에 Typecast 0.4.15(재시도·취소 신호 없음, 오류가 응답 헤더를 버림), ElevenLabs `convert` 요청 옵션과 "응답 전 네트워크 오류를 `statusCode` 없는 `ElevenLabsError`로 던진다(설치본 `errors/handleNonStatusCodeError.js`), 명시적 `undefined`를 `null`로 보낸다"를 더한다. '중복 과금 막기'에 "요청 id 유니크는 소유자별(`(owner_id, request_id)`)", "공급자 응답(상태 코드)을 받지 못한 실패는 모두 처리 여부 미확인으로 둔다(SDK가 연결 끊김을 다른 오류로 바꿔 던질 수 있다)"를 더한다.
- [x] **Step 5: 로드맵** — T5 상태 '진행'(라운드 끝 확인 뒤 '완료'로), T5 절에 "스펙·계획: …" 링크.
- [x] **Step 6: GLOSSARY** — '시험 생성'(화면 이름·코드 이름 `trial`), '저장된 결과', '말투 태그'가 있는지만 확인한다(설계에서 더함). 브리프 5·12절은 계획 리뷰 때 이미 맞췄다(구역 순서 기본 샘플 → 이용 조건 → 내 문장 듣기 → 내 문장 결과, 사용자 결정 U5). 다르면 고친다.

## 수용 기준과 확인 위치

| AC | 자동 테스트 | QA 시나리오(스펙 11절) |
|---|---|---|
| AC1 바·문장 유지·글자/바이트·200자·무료 안내 | Task 2 `codePoints`·`utf8Bytes` | S1 |
| AC2 모델별 옵션·보정·처음 값으로·공급자별 유지 | Task 2 `fieldsOf`, Task 8 `requestOf`·`presetsOf` | S2 |
| AC3 예상 사용량·태그 포함 | Task 2 `estimate`, Task 8 `usageText` | S2 |
| AC4 빈 문장 꺼짐과 이유 | Task 8 `trialBlock` | S1 |
| AC5 확인 창·취소(Esc·[취소]) 0회·진행 1회·두 번 눌러도 1회 | Task 6 "같은 요청 id 동시 두 번" | S3, S4 |
| AC6 Fish Audio 무료 바로·유료 확인·`model` 헤더 | Task 5 Fish "model 헤더", Task 8 `needsConfirm`, Task 6 `free_ended` | S6 |
| AC7 저장된 결과 재생·공급자 0회·새로 고침 뒤도 | Task 4 `findSaved`, Task 6 "같은 조합 찾기는 공급자 0회" | S5 |
| AC8 진행 중 잠김·소유자별 1건·같은 요청 id | Task 4 `claim`, Task 6 동시 테스트 | S4, S11 |
| AC9 한 번에 하나 재생·blob 해제·재생 중 표시와 정지 | Task 8 `blobUrls`, `sample-state`(명사·성우 키) | S9, S11 |
| AC10 결과 목록 20개·재생 0회·지우기 확인·빈 문구·줄마다 다른 이름 | Task 4 `listResults`·`remove`, Task 8 `resultSubject`·`resultLine` | S9 |
| AC11 새로 만들기(패널 버튼 아래 하나) 확인 창·예전 결과 유지 | Task 6(새 요청 id면 새 행), Task 6 왕복(E4) | S9 |
| AC12 오류 문구·자동 재호출 없음·429 꺼짐·미확인(연결 끊김 포함)·공급자별 | Task 5 `runTrial`·공급자 오류·fetch `TypeError`(E1), Task 6 대기·미확인·오디오 초과(E8), Task 8 `trialProblemText` | S10 |
| AC13 DB 실패면 공급자 0회 | Task 6 "DB가 실패하면", "선점(생성 기록 쓰기)이 실패해도"(E5) | S10(`storage` 흉내) |
| AC14 소유자 없음 여섯 모두 UNAUTHORIZED·키 없음 0회 | Task 6 격리·`no_key` | S10(키 없음 흉내) |
| AC15 2계정 격리 | Task 6 `trial.isolation.test.ts` | — |
| AC16 30일 만료·연장 | Task 4 만료·`sweep`·연장 | — |
| AC17 너비·테마 | — | S12 |
| AC18 키보드·접근 이름·알림 | Task 8 `trialAriaLabel`·roving | S13 |
| AC19 번들에 SDK·DB·키 없음 | — | 19행 빌드 뒤 `apps/web/.next/static` grep 12종 + `trial-contract`의 zod 경로가 화면 번들에 없는지(`z.file` 문자열) |
| AC20 연결 상태 429 대기 | Task 8 `recheckUntil`·연결 상태 카드(Step 7) | S15 |

## 구현 뒤 (대조표 검증 행, 코디네이터와 메인 세션)

- **보안 리뷰(추가 행):** Task 1~6 diff에 `bts-reviewer(security)` — 유료 호출을 부를 수 있는 주체(`protectedProcedure`, 로컬 관리자), 한 명 소유 예외 확장, 중복 과금(선점·부분 유니크·재전송), 자동 재시도 없음, 키·본문 로그 노출, 입력 길이·성우 id 글자, Fish Audio `references` 미전송.
- **16·18행:** impeccable context(`--target apps/web/src/components/trial-section.tsx`), craft-floor 읽기 확인.
- **19행:** `pnpm check-types`, `pnpm exec biome check .`, `pnpm --filter web test`, `source …/testdb.env && pnpm --filter @tts-pilot-app/api test`, `pnpm build`(메인 세션이 정한 때), 번들 grep(T4 12종: elevenlabs-js, typecast-js, @neosapience, drizzle-orm, node-postgres, pg-pool, xi-api-key, "Bearer ", api.elevenlabs.io, api.fish.audio, provider_list_cache, DATABASE_URL + `trial_generation`).
- **20·26행:** next-dev-loop(`/_next/mcp` get_errors 0)와 흉내 응답 스크린샷 1440·390. 흉내 스크립트(`.superpowers/sdd/T05-my-sentence-listening-plan/tools/mock-casting.js`)에 `trial*`를 더한다:
  - `trialFind` → `{"json":null}`(또는 저장본 multipart), `trialList` → `{"json":[…]}`, `trialModels` → `{"json":{"rates":[{"model":"eleven_v4","multiplier":0.28}]}}`, `trialDelete` → `{"json":{"deleted":true}}`, 오류는 T4 흉내의 오류 JSON 형식 그대로(`data.reason`·`retryAt`·`providerCode`).
  - `trialCreate`·`trialAudio`는 multipart 응답: `const form = new FormData(); form.set("data", JSON.stringify({ json: { id, createdAt, usage, audio: {} }, maps: [["audio"]] })); form.set("0", new Blob([mp3], { type: "audio/mpeg" }), "trial.mp3"); return new Response(form);`
  - 무음 MP3: `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -b:a 128k .superpowers/sdd/T05-my-sentence-listening-plan/tools/silence.mp3`(설치됨 `/opt/homebrew/bin/ffmpeg`)를 base64로 흉내 스크립트에 넣는다.
  - 흉내 생성 호출 수는 `window.__mockHits`에 `trialCreate` 키로 센다(S3·S4·S5 "생성 호출 0/1회" 판정).
- **21~24행:** critique(브리프 12절 기준, P0·P1 해결), audit + web-design-guidelines(16/20, 접근성 3/4 이상), 한 번에 polish, 재확인 1회.
- **25행:** DESIGN.md에 Slider·Switch·AlertDialog와 유료 표식(`Coins`: 카드 위 경고색, 채운 청록 버튼 안 글자색)·무료 배지 기록(impeccable document, 사용자에게 덮어쓰기 확인). 슬라이더·스위치 무채색 한 줄은 계획 리뷰 때 이미 더했다(U7).
- **27행:** 공통화 점검(같은 디렉터리 ponytail-review). `RadioMenu` 합치기는 계획 리뷰에서 했다.
- **35행 문서 영향:** '계획 리뷰에서 바꾼 것'의 백로그 셋을 `tasks/todo.md`(라운드 블록 밖)와 로드맵 T9·T14 메모에 적는다.
- **29행 QA:** 스펙 11절 S1~S15를 흉내 응답으로(ego-browser, 깨끗한 프로필 agent-browser 오류 예산). 실제 생성 0회.
- **36행 [confirm] 전:** 사용자 테스트(스펙 12절) 실제 호출 최대 5회는 건마다 AskUserQuestion으로 승인(공급자·모델·문장·바이트·횟수)을 받고 메인 세션만 부른다. 결과(오류 코드, v4 가능 여부, 잔액 차이)를 `tasks/evidence/T05/research/calls.md`에 적고, Task 8 잠정 표·`ELEVENLABS_MODELS` 기본값을 QA 수정 행에서 맞춘다. 확인 질문 첫머리에 "시안에서 이번에 없는 것(T7 담기, T8 프리셋, T9 내려받기)"을 적는다(lessons 2026-10-05).

## 자기 검토 (writing-plans)

1. **스펙 대조:** 3절 화면(Task 9·10·11), 4절 공급자 호출(Task 2·5), 5절 기록·프로시저(Task 3·4·6), 6절 오류(Task 5·8), 7절 포함(문서 Task 12, CS-01 Task 8 Step 7), 9절 AC(위 표), 10절 자동 테스트(Task 2·4·5·6·8), 11절 QA(구현 뒤), 12절 사용자 테스트(구현 뒤), 13절 위험(oRPC File → Task 1, Fish 무료 → Task 2·6, 나머지는 사용자 테스트). 빠진 요구 없음. 계획 리뷰 뒤 다시 대조했다(2026-10-05): 스펙 3절·AC5·AC10·AC11·S9를 사용자 결정에 맞춰 고쳤고 계획이 그것을 따른다.
2. **자리표시 검사:** "TBD/TODO/나중에" 없음. 설치본에 따라 달라질 수 있는 곳(shadcn 생성물 이름·속성, Base UI Slider `getAriaValueText` 전달, `max-@2xl:` 변형, `AlertDialogDescription`의 `render`)은 확인 방법과 대안을 함께 적었다. ElevenLabs 직렬화의 `undefined`는 worktree 실행으로 확정해 거르는 코드를 넣었다(E3).
3. **타입·이름 일관성:** `TrialRequest`·`SettingsOf`·`usedSettings`·`comboSignature`·`estimate`(Task 2) → `comboKey`(`cacheKey`)·`claim`·`complete(db, ownerId, id, audio)`·`settle(db, ownerId, …)`·`findSaved`(Task 4) → `synthesize(request)`·`retryAtFrom`·`fetchOk`(Task 5) → 프로시저 이름 `trialModels/Find/Create/List/Audio/Delete`, `guard(…, "[trial]")`(Task 6) → `orpc.trial*`(Task 9~11). `TrialApi`(`blockOf`·`playing`·`stop`·`listen(voice, opener, { regenerate })`·`urlOf`)는 Task 9에서 정하고 Task 10·11이 쓴다. `useTrialItems`(Task 10 trial-results) → `TrialSection`. `RadioMenu`(Task 10 Step 1) → `TagControl`·`Options`. `Col = 0|1|2`(Task 8) → `tabbable === 2`(Task 11). `Noun`·`owner`·`announceOf`(Task 8) → `toggle(…, noun, owner)`(Task 9).
4. **Review Focus:** 다섯 줄 모두 테스트가 소유 태스크에 있다(Task 2·4 조합, Task 5·6 Fish 헤더·무료 종료, Task 6 성우 귀속, Task 8 blob, Task 6 요청 id 격리).
