# T17 CLI 로그인과 성우 보관함 조회

[CLI 기획·설계](../2026-11-23-cli-plan.md)의 첫 작업이다. `omni-tts auth login --url URL`, `auth status`, `auth logout`, `voices list [--provider ID] [--channel NAME | --channel-id ID] [--favorite] [--frequent] [--json]`을 구현한다. 마지막으로 로그인한 작업실을 기본 주소로 사용하고 `--url`로 다른 origin을 명시할 수 있다. 도움말을 제공하고 JSON 모드의 성공·실패는 stdout 한 객체, 진행 안내·프롬프트는 stderr로 보낸다. 빈 목록은 성공이다.

## 구현과 재사용

1. `apps/cli`에 pnpm 워크스페이스 패키지, TS 빌드와 `omni-tts` bin을 둔다. `pnpm-lock.yaml`에는 이미 있는 도구와 라이브러리의 워크스페이스 항목만 추가한다. CLI-Anything의 `TEST.md`를 테스트 코드보다 먼저 작성한다.
2. Better Auth `/api/auth/sign-in/email`, `/api/auth/get-session`, `/api/auth/sign-out`과 `RPCLink`·기존 CSRF 플러그인을 재사용한다. 로그인 상태를 저장하거나 상태·목록을 확인할 때 동일 origin의 `get-session`이 실제 유효 세션을 돌려준 뒤 보호 조회로 소유자를 확인한다. 데모는 세션 없이 예시 목록에 접근할 수 있으므로 인증 경로의 404나 빈 세션을 거절한다. `channelList`로 채널 이름·ID를 확인한다. `AppRouterClient`는 타입으로 가져온다. CLI는 DB와 공급자 SDK를 불러오지 않는다.
3. 터미널에 origin을 표시한 뒤 이메일·숨긴 비밀번호를 받는다. HTTPS와 루프백 HTTP만 허용하며 쿠키와 자격 증명 요청은 동일 origin에만 보내고 리다이렉트를 거절한다. origin별 세션 파일은 경로·권한(`0700`/`0600`)을 확인하고 잠금 아래 원자 교체한다. 로그인과 로그아웃이 세대 값을 바꾸고 오래된 HTTP 응답의 갱신은 버린다. 네트워크 요청 중에는 잠금을 잡아두지 않는다.
4. 보관함의 `provider:voiceId`, 표시 이름, 이용 가능 여부, 즐겨찾기·자주 사용, 연결 ID, 사용 횟수·최근 사용을 표시한다. 동명이인의 항목을 모두 유지한다. 사람용 표시에서 터미널 제어 문자를 제거한다.

| 단계 | 구현 수행자 범위 | 즉시 검사 |
|---|---|---|
| 패키지·테스트 계획 | `apps/cli/package.json`, `apps/cli/tsconfig.json`, `apps/cli/tests/TEST.md`, 설치 명령이 생성하는 `pnpm-lock.yaml` | 워크스페이스 이름과 bin 대상, 테스트 계획 범위, lockfile 변경 확인 |
| 테스트 먼저 | `apps/cli/tests/core.test.ts`, `apps/cli/tests/cli.test.ts` | 입력·세션·명령 테스트가 비어 있는 구현에서 실패하는 것을 확인 |
| 인증과 보관함 진입점 | `apps/cli/src/cli.ts`, `apps/cli/src/client.ts`, `apps/cli/src/session.ts` | 단위 검사에서 origin·쿠키·파일 권한·세대 경합·필터 확인 |
| 실행·안내 | `apps/cli/README.md`, `apps/cli/tests/TEST.md`에 검증 결과 추가 | 빌드한 bin 서브프로세스에서 상태·필터·데모 거절·JSON·종료 코드 확인, 타입·Biome 검사, 독립 security 리뷰에서 origin·세션·쿠키 경합 확인 |

## 인수 조건과 테스트

- 정상·빈 상태. 로컬 HTTP 통합에서 기존 oRPC 프로토콜로 조회하고 설치된 `omni-tts`를 별도 프로세스로 실행한다. 조회 결과의 참조·개수·필터·출력/종료 코드를 검사한다.
- 오류·경계. 비소유자·세션 없음·만료·리다이렉트·로그아웃 거절을 확인한다. 인증 경로는 404이고 oRPC 예시 목록은 성공하는 데모에서도 CLI가 목록을 거절한다. 비밀번호와 쿠키가 출력에 없어야 한다. 이후 갱신 응답이 폐기한 세션을 복구하지 않아야 한다.
- 검사. 패키지 build, typecheck, Biome, 단위·HTTP 서브프로세스 테스트와 기존 인증·보관함 격리 회귀를 확인한다. 테스트의 결과는 `apps/cli/tests/TEST.md`에 기록한다. 실제 유료 호출은 생기지 않는다.

## 만들지 않는 것

T18 이후 음성 생성·오디오 다운로드·자료 변경, GUI·REPL·PyPI 배포는 이 작업에 포함되지 않는다. 기존 Better Auth와 보호 프로시저의 계약, DB 스키마, 서버 환경 변수(`apps/web/.env.schema`)와 웹 소비자 변경은 없다. 새 도메인 용어는 없다.
