# T18 CLI 저장 성우·프리셋으로 음성 만들고 내려받기

[CLI 기획·설계](../2026-11-23-cli-plan.md)의 둘째 작업이다. T17 세션과 성우 참조를 쓴다. CLI-Anything은 refine 방식(현재 명령 조사 → 빈 곳 → `TEST.md` 먼저 → 구현 → 설치된 명령을 실제 백엔드로 검증 → 문서)만 쓰고, 산출물은 확정된 기획대로 TypeScript `omni-tts`다.

## 스펙

목표: 소유자가 담은 성우나 프리셋으로 한국어 음성을 터미널에서 만들고 파일로 받는다. 같은 입력으로 두 번 과금되지 않는다.

```text
omni-tts presets list [--url URL] [--json]
omni-tts studio generate (--voice REF | --preset-id ID) --input FILE|- --out PATH
                         [--overwrite] [--yes] [--new] [--dry-run] [--url URL] [--json]
omni-tts studio download RESULT_ID --out PATH [--overwrite] [--url URL] [--json]
omni-tts studio resume [REQUEST_ID] [--out PATH] [--overwrite] [--url URL] [--json]
```

- `--voice`는 `voices list`의 `provider:voiceId`(첫 콜론에서 나눈다)다. 담은 성우가 아니거나 이용 불가면 4로 끝난다. 설정은 웹의 공급자별 기본값이고 성우가 받지 않는 값은 웹과 같은 규칙으로 보정한다.
- `--preset-id`는 프리셋의 성우·모델·설정을 쓰되 웹과 같이 `requestOf(성우, 글, { ...DEFAULT_SETTINGS, [공급자]: 프리셋 설정 })`를 거친다. 없는 프리셋, 성우가 빠졌거나 이용 불가인 프리셋은 4다. 처음 값으로 바뀐 칸(`fixed`)과 보정으로 바뀐 칸(특히 Fish 무료 → 유료)을 stderr로 알린다. 유료 확인·지문·확장자는 보정 뒤 요청으로 판정한다.
- 대본의 대괄호 태그는 원문 그대로 보낸다(웹은 모델이 받지 않는 태그를 뺀다). 태그가 든 대본은 웹과 조합이 다를 수 있다. 도움말과, 글에 `[...]`가 있을 때의 확인문에 알린다.
- 입력은 UTF-8 파일이나 stdin이다(BOM 제거, 잘못된 UTF-8 거절, 정리한 글 1자~공급자 상한). 검사는 생성 요청 전에 끝낸다.
- 유료 확인: Fish Audio 무료 모델(기간 안)만 묻지 않는다. 그 밖은 성우·모델·글자 수·예상 사용량을 stderr에 보이고 TTY에서 `y`를 받는다. `--yes`가 없고 TTY가 아니거나 입력이 stdin(`-`)이면 2로 끝난다. ElevenLabs 배율은 `trialModels`로 보고, 모르면 "배율을 확인하지 못했어요"를 붙인다.
- `--dry-run`은 검사·저장 결과 여부·예상 사용량만 보인다. 생성 호출과 로컬 기록 변경은 0이다.
- 로컬 기록이 없고 같은 조합의 저장 결과가 있으면 만들지 않고 그 결과를 받는다(`source: "saved"`). `--new`는 저장 결과와 미확인 기록을 쓰지 않고 새 요청 UUID로 만든다(확인은 똑같이 받는다). 같은 조합의 서버 미확인 결과만 있으면 6으로 끝나고 `--new`를 안내한다.
- 성공 출력(JSON): `{ origin, source, result: { id, createdAt, usage, bytes }, out, mime }`. 실패: `{ code, message, reason?, retryAt?, requestId?, resultId? }`. 종료 코드는 기획의 0·2·3·4·5·6·7이다.

### 요청 기록과 중단 복구

- 지문 = SHA-256(`[origin, 세션 user id, "studio", comboSignature(request)]`). 기록은 세션 디렉터리의 `requests.json`(0600, T17의 잠금·권한 검사·원자 교체 재사용)에 `{ origin, requestId, provider, createdAt }`만 둔다. 대본·쿠키는 두지 않는다.
- `generate` 순서: 검사 → 기록 읽기 → 저장 결과 조회(`studioFindMany`) → 확인 → 잠금 아래 기록이 없을 때만 선점(쓰기) → 잠금 밖에서 저장 결과 재조회 → `studioCreate` 1회(자동 재시도 없음). 재조회가 완료면 내 기록을 지우고 그 결과를 받고(`saved`), 미확인이면 내 기록을 지우고 6, 조회가 실패하면 내 기록을 지우고 기획의 코드(세션 3, 그 밖 5)다. 앞선 프로세스는 서버에 완료가 저장된 뒤에 기록을 지우므로 확인 프롬프트에 함께 서 있던 둘째 프로세스도 두 번째 합성을 보내지 않는다. `--new`는 기록 읽기 결과와 두 조회를 건너뛰고 앞 기록을 내 것으로 바꾼다.
- 이미 기록이 있으면(`--new`가 아닐 때) 만들지 않고 그 UUID를 `studioRequest`로 본다(`resume`과 같은 함수): 완료면 기록을 지우고 내려받기(`source: "resumed"`), 실패면 기록을 지우고 5, 그 밖(진행 중·미확인·없음·조회 실패)은 6. 우선순위는 로컬 기록 → 저장 결과다. `--dry-run`은 기록을 읽기만 한다.
- 기록 삭제·되돌리기는 모두 잠금 안에서 현재 기록의 `requestId`가 내 것일 때만 한다(`resume` 포함).
- 확정 거절은 허용 목록이다: 검증된 `data.reason`(`unknown_outcome`·`in_progress`·`storage` 제외) 또는 사유 없는 `BAD_REQUEST`·`UNAUTHORIZED`·`FORBIDDEN`. 확정 거절이면 기록을 지운다(`--new`였으면 앞 기록으로 되돌린다). `in_progress`·`storage`는 `studioRequest(UUID)`가 `null`이거나 실패일 때만 지운다. 나머지(연결 끊김, 사유 없는 404·408·429·5xx, `unknown_outcome`)는 기록을 남기고 6이다. 지금 `client.ts`의 `rpcError`가 버리는 `data.reason`·`retryAt`를 함께 전한다. 웹 `studio-view.ts`의 `BEFORE_PROVIDER`·`createFailureOf`와 같은 규칙이다.
- `resume REQUEST_ID`: `studioRequest`가 완료면 기록을 지우고 결과 ID(또는 `--out`으로 내려받기), 실패면 기록을 지우고 5, 진행 중·미확인·없음이면 기록을 남기고 6이다. ID가 없으면 이 origin의 남은 기록 목록을 보인다. 합성 호출은 0회다. 같은 조합의 다른 완료 결과는 이 요청의 완료로 보지 않는다.
- `Ctrl+C`: 선점 전(입력·확인)과 확인 거부(n)는 2이고 기록 변경이 없다. 선점 뒤 응답 전은 요청 ID를 알리고 6, 결과를 안 뒤 내려받는 중은 임시 파일을 지우고 결과 ID를 알리고 7이다.

### 내려받기

- 만들기 전에 `--out` 경로를 검사한다: 상위 폴더 존재, 확장자(Gemini `.wav`, 나머지 `.mp3`), 이미 있는 파일·심볼릭 링크는 거절(`--overwrite`면 일반 파일만 허용).
- `studioInfo`의 `audioType`과 `--out` 확장자를 조각 요청 전에 대조한다(다르면 파일 쓰기 0회로 2). bytes로 조각 수를 정하고, 조각마다 길이와 MIME을, 끝에 전체 길이를 확인한다. 같은 폴더 임시 파일(`wx`)에 쓰고, 기본은 `link`(이미 있으면 실패)로, `--overwrite`는 `rename`으로 게시한다. 실패하면 임시 파일을 지우고 기존 파일은 그대로다(7). 다운로드 재시도는 `studio download`이고 생성은 0회다.

### 서버 (packages/api)

| 프로시저 | 입력 | 출력 | 조건 |
|---|---|---|---|
| `studioInfo` | `{ id: uuid }` | `{ id, createdAt, usage, bytes, audioType }`(`audioType`은 `audio/mpeg`·`audio/wav`. 옛 null 행은 `audio/mpeg`) | 세션 소유자·`kind = 'studio'`·`done`·미만료. 아니면 모두 `NOT_FOUND`. 보관 기한을 늘리지 않는다 |
| `studioRequest` | `{ requestId: uuid }` | `{ id, status: pending\|done\|failed\|unknown, reason: TrialFailure\|null, createdAt, usage, bytes } \| null` | 세션 소유자·`studio`·미만료. 5분 넘은 진행 중은 `unknown`으로 읽는다(쓰지 않는다). 없거나 남의 것이면 `null` |

기획과 다른 점: 기획은 결과 ID 조회가 바이트 수와 MIME만 돌려준다고 했다. `download`·`resume`의 성공 출력이 `generate`와 같도록 본인 결과의 `createdAt`·`usage`를 더한다.

둘 다 `protectedProcedure`, 오디오 본문을 읽지 않고 공급자·쓰기 0회다. DB 스키마·환경 변수·기존 프로시저 계약은 그대로다.

### 만들지 않는 것

모델·설정을 바꾸는 옵션, 문단·드라마 묶음, 자동 태그, 프리셋 변경, 오디오 재생, REPL·PyPI·전역 배포, Windows. CLI-Anything의 Python/Click 형식과 undo/redo(되돌릴 로컬 편집 상태가 없다).

### 인수 조건과 테스트 시나리오

1. 정상: 성우·프리셋 각각으로 만들고 받은 파일의 바이트가 저장 결과와 같다. 별도 실행에서 결과 ID만으로 받는다. 3MiB를 넘는 오디오의 조각 순서·길이·전체 바이트가 맞는다.
2. 과금 막기: 두 프로세스를 확인 프롬프트에 함께 세우고 하나가 완료된 뒤 다른 하나를 승인해도 `synthesize`는 1회. 두 프로세스가 같은 입력을 동시에 실행해도 모의 `synthesize`는 1회. 저장 결과 재사용·`--dry-run`·`resume`·`download`는 0회. `--yes` 없는 비대화는 0회.
3. 복구: 응답 유실 뒤 `generate`·`resume`은 0회 호출로 같은 UUID만 본다. 같은 조합의 다른 완료 결과가 있어도 `resume`은 6이다. `--new`만 새 UUID로 만든다. 새 요청이 확정 거절되면 앞 기록이 남는다. 남의 requestId로 바뀐 기록은 지우거나 되돌리지 않는다. 사유별 분류 표(확정 거절·`in_progress`·`storage`·사유 없는 404·408·429·5xx·연결 끊김)를 고정한다. 선점 전·응답 전·내려받기 중 `Ctrl+C`가 2·6·7이다.
4. 파일: 있는 파일·심볼릭 링크·없는 폴더·확장자 불일치는 만들기 전에 거절된다. 조각 길이 불일치·중간 실패·경로 경합 뒤 기존 파일이 그대로이고 임시 파일이 없다. 경합에서 기본 모드는 덮어쓰지 않는다.
5. 오류·경계: 빈 입력·상한 초과·잘못된 UTF-8·`--voice`와 `--preset-id` 동시·없는 성우·이용 불가·세션 없음·비소유자. 성우가 받지 않는 프리셋 값의 보정, Fish 무료 종료 전후, 태그 원문 전송. JSON은 stdout 한 건이고 쿠키·대본은 기록 파일과 오류에 없다.
6. 서버: `studioInfo`·`studioRequest`의 두 계정 격리, 세션 없음 `UNAUTHORIZED`, 만료·종류(trial·drama)·상태(진행 중·실패·미확인)·5분 넘은 진행 중.
7. 웹 회귀: 옮긴 순수 함수(`requestOf` 등)의 기존 웹 테스트가 그대로 통과한다.

너비·테마·키보드는 해당 없다(화면 변경 없음).

## 구현과 재사용

- `@tts-pilot-app/api`를 CLI `dependencies`로 옮긴다. `verified`는 비어 있지 않은 `user.id`를 돌려주고 없으면 생성 전에 3이다.
- 런타임 공용 모듈은 `@tts-pilot-app/api/providers/trial-options` 하나다(값 import가 없어 Node 24+의 타입 제거로 바로 실행된다. Node 26에서 확인). 웹과 CLI가 같은 설정 보정(태그 없는 대본이면 같은 조합)을 하도록 `apps/web/src/lib/trial-view.ts`의 `typecastModelsOf`·`presetsOf`·`fishModelsOf`·`typecastFor`·`requestOf`·`needsConfirm`을 이 모듈로 옮기고 `trial-view.ts`는 그대로 다시 내보낸다(소비자 import 변경 없음). `Voice`는 타입 import다.
- 세션·잠금은 `apps/cli/src/session.ts`의 `change`를 파일 이름만 다르게 쓰도록 좁게 넓힌다. 공급자·DB 모듈은 CLI가 가져오지 않는다. 라우터 타입은 `import type`이다.
- E2E는 `appRouter`를 `RPCHandler`로 띄우고 모의 공급자와 API 테스트와 다른 DB(`CLI_TEST_DATABASE_URL`, 이름이 `_test`로 끝남, 마이그레이션 적용)를 쓴다. API 테스트가 표를 비우므로 같은 DB를 쓰지 않는다. 값이 없으면 건너뛰고(통과로 세지 않는다) turbo 설정은 바꾸지 않는다. 증거는 이 값을 준 `pnpm --filter @tts-pilot-app/cli test`를 직접 돌려 건너뜀 0으로 남기고, DB 이름 `_test` 검사를 CLI 테스트 준비 코드에도 둔다. 필요하면 `@tts-pilot-app/db`를 테스트 전용 devDependency로 더한다(`@orpc/server` devDependency, lockfile에 이미 있는 판).

| 단계 | 수행자와 파일 | 즉시 검사 |
|---|---|---|
| 1 서버 조회 | `prokit-api-builder`: `packages/api/src/trial.ts`, `studio-contract.ts`, `routers/studio.ts`, `routers/studio.isolation.test.ts`, `routers/studio.test.ts`, `studio-contract.test.ts`, `providers/trial-options.ts`·`trial-options.test.ts`(옮기는 함수) | 격리 테스트 실패 먼저 → 통과, API 타입·테스트(TEST_DATABASE_URL). `providers/`가 authPaths라 1단계 직후 `table F --write --upgrade`로 security 행을 더하고 2단계를 시작한다 |
| 2 웹 소비자 | `prokit-ui-builder`: `apps/web/src/lib/trial-view.ts` | 웹 타입·`trial-view` 테스트 |
| 3 CLI | `prokit-implementer`: `apps/cli/**`(dist 제외), `pnpm-lock.yaml`(설치가 만드는 항목만) | `TEST.md` 계획 먼저, 단위·서브프로세스·E2E, 타입·Biome |
| 4 실행 확인 | `prokit-runtime-checker`: 설치된 `omni-tts`를 별도 프로세스로, 실제 라우터 + 모의 공급자 + 임시 PostgreSQL | 시나리오 1~5 |
| 5 리뷰 | `prokit-reviewer` code·security, ponytail-review | 지적 0 또는 처리 |
| 문서 | Main: `docs/domain/project.md` API 표. `apps/cli/README.md`·`SKILL.md`·`tests/TEST.md`는 3단계 | 명령이 도움말과 같은지 |

security 리뷰는 과금·소유권 경계 때문에 한다. 실제 공급자 호출은 자동 검사에 없고, 사용자가 승인한 호출만 별도로 한다. 되돌리기: 새 프로시저 두 개는 읽기 전용 추가라 CLI 커밋만 되돌려도 웹은 그대로다.
