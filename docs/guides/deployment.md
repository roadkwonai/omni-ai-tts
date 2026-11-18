# 배포와 운영 안내

Omni AI TTS는 같은 코드를 **두 곳**에 배포합니다. 결정 배경은 [ADR 0013](../adr/0013-first-deploy-vercel-neon-singapore.md)(지역·플랜)과 [ADR 0015](../adr/0015-public-demo-separate-deploy.md)(공개 데모 분리), 계정은 [소유자 계정](../owner-account.md)에 있습니다.

## 목차
- [두 배포](#두-배포)
- [환경 변수](#환경-변수)
- [릴리스와 배포 순서](#릴리스와-배포-순서)
- [DB 마이그레이션](#db-마이그레이션)
- [공개 데모 데이터와 매일 초기화](#공개-데모-데이터와-매일-초기화)
- [배포 뒤 확인](#배포-뒤-확인)
- [되돌리기](#되돌리기)
- [알려진 한계](#알려진-한계)

## 두 배포

| 항목 | 본인용 작업실 (`studio`) | 공개 데모 (`demo`) |
|---|---|---|
| 주소 | `https://omni-ai-tts-studio.vercel.app`(외부에 알리지 않음) | `https://omni-ai-tts.vercel.app` |
| Vercel 프로젝트 | `omni-ai-tts-studio` | `omni-ai-tts` |
| `APP_MODE` | `owner` | `demo` |
| 로그인 | 소유자만(`OWNER_EMAILS` 한 명) | 없음(예시 소유자로 들어감, 인증 경로 404) |
| 공급자 키 | 있음 | **없음**(유료 호출이 일어날 수 없음) |
| DB | Neon(Vercel Storage), 운영 데이터 | Neon(Vercel Storage) `main`(예시 데이터 원본) → `live`(앱이 씀) |
| 검색 노출 | 막음(`X-Robots-Tag: noindex`, robots 전체 차단) | 허용 |
| Firewall | 한국(KR) 밖 접속 거절 | 한국 밖 접속 거절, `POST /api/rpc` IP당 1분 120회 |

공통: Vercel Hobby, Fluid compute, 함수 지역 `sin1`(`apps/web/vercel.json`), Root Directory `apps/web`, `/api/rpc` 최대 300초(늦은 공급자 결과는 `after`로 저장). Preview(develop) 배포는 하지 않습니다. Vercel Git 자동 배포는 끄고 CLI로만 배포합니다.

> [!IMPORTANT]
> `APP_MODE`는 **빌드할 때 코드에 굳습니다.** 같은 빌드를 두 모드로 돌릴 수 없으니 대상마다 그 프로젝트의 env로 빌드합니다(Vercel이 프로젝트별로 빌드하므로 CLI 배포는 자동으로 맞습니다). 로컬에서 모드를 바꿀 때도 다시 빌드합니다.

## 환경 변수

각 프로젝트의 Production 환경 변수에만 둡니다. 값은 출력·파일·커밋에 남기지 않습니다(`vercel env pull`, `.env.production` 파일 금지). 비밀값은 셸 변수에 담아 `printf '%s' "$v" | vercel env add <이름> production --sensitive`로 넣고 `--value`에 쓰지 않습니다.

| 변수 | 본인용 | 공개 데모 |
|---|---|---|
| `APP_MODE` | `owner`, `--type config` | `demo`, `--type config` |
| `DATABASE_URL` | Storage 통합 값(pooled) | `live` 브랜치 pooled 주소, `--sensitive` |
| `BETTER_AUTH_SECRET` | 새 값, `--sensitive` | 따로 만든 새 값, `--sensitive` |
| `BETTER_AUTH_URL` | `https://omni-ai-tts-studio.vercel.app`, `--type config` | `https://omni-ai-tts.vercel.app`, `--type config` |
| `OWNER_EMAILS` | 소유자 이메일 하나, `--sensitive` | 예시 소유자 이메일 하나 |
| `DEMO_DB_HOST` | 넣지 않는다 | `live` 브랜치 pooled 주소의 호스트, `--type config`. `DATABASE_URL` 호스트가 이 값과 다르면 데모는 소유자를 정하지 않는다(운영 DB를 잘못 가리켜도 열리지 않음). 배포 스크립트가 이 이름이 없으면 멈춘다 |
| 공급자 키 6개(`TYPECAST`·`ELEVENLABS`·`FISH_AUDIO`·`AIRY`·`GEMINI`·`OPENAI`) | `--sensitive` | **넣지 않는다** |

## 릴리스와 배포 순서

릴리스한 커밋만 배포하고, 같은 커밋을 두 대상에 올립니다. 대상은 `--target studio|demo`이고 프로젝트 id는 `.dev-cycle.json`의 `deploy.projects`에 있습니다.

1. 두 대상의 준비 상태를 봅니다. 대상마다 `APP_MODE`와 공급자 키 이름을 검사하고, 본인용에 데모 모드가 켜져 있거나 데모에 공급자 키가 있으면 준비 안 됨으로 멈춥니다.
   ```bash
   pnpm vercel:deploy production --check --target studio
   ```
   ```bash
   pnpm vercel:deploy production --check --target demo
   ```
2. 릴리스 노트를 만들고 검수합니다(버전은 git 태그 `vX.Y.Z`, 기본 patch).
   ```bash
   pnpm release --title "<영어 제목>"
   ```
3. 발행합니다. 기본 브랜치에 노트·버전 커밋을 만들고 태그와 함께 push한 뒤 GitHub Release를 만듭니다.
   ```bash
   pnpm release --publish release/<노트 파일>.md
   ```
4. 새 마이그레이션이 있으면 **배포 전에** 두 DB에 적용합니다(아래).
5. 배포합니다.
   ```bash
   pnpm vercel:deploy production --target studio
   ```
   ```bash
   pnpm vercel:deploy production --target demo
   ```

## DB 마이그레이션

주소는 Neon CLI로 셸 변수에만 받습니다(direct, `-pooler` 아님).

```bash
DATABASE_URL="$(neon cs --project-id <Neon 프로젝트 id>)" pnpm --filter @tts-pilot-app/db db:migrate
```

공개 데모는 예시 데이터 원본 `main`에 적용한 뒤 `live`를 부모에서 다시 만듭니다(아래 초기화 워크플로 수동 실행). 열·표를 지우는 변경은 expand → contract 두 단계로 나눕니다. 운영 데이터를 바꾸는 작업은 적용할 목록을 확인한 뒤에만 합니다.

## 공개 데모 데이터와 매일 초기화

- 예시 데이터 원본은 Neon `main` 브랜치이고 손대지 않습니다. 앱은 자식 브랜치 `live`를 씁니다.
- `.github/workflows/demo-reset.yml`이 매일 KST 04:00(그리고 수동 실행)에 `live`를 부모 `main`에서 복원합니다. 저장소 비밀값 `NEON_API_KEY`(데모 프로젝트 범위 키)와 변수 `DEMO_NEON_PROJECT_ID`·`DEMO_NEON_BRANCH_ID`를 쓰고, 프로젝트 id가 워크플로 파일에 고정한 기대값과 다르면 아무것도 하지 않고 실패합니다.
- 예시 데이터를 바꾸려면 로컬 데모 DB를 정리한 뒤(세션·인증 기록·시도 제한 비우기, 예시 계정 비밀번호 행 없음, 실제 공급자 결과 없음, 성우 목록 캐시 유효 기간을 길게) `main`에 다시 넣습니다. 성우 목록 계약 버전(`CONTRACT_VERSION`)을 올리면 목록 캐시를 다시 받아 넣어야 합니다.
- 데모 샘플 음성은 `apps/web/public/samples/`에 있고 소개 페이지 재생과 데모 결과가 함께 씁니다.

## 배포 뒤 확인

본인용:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://omni-ai-tts-studio.vercel.app/api/auth/get-session
```
- 200이면 앱과 인증이 응답합니다. `/`는 `/login`으로 가고, 응답에 `X-Robots-Tag: noindex`가 있습니다.
- 로그인 시도 제한이 IP별로 세어지는지 운영 DB `rate_limit` 표의 키가 `no-trusted-ip|…`가 아닌지로 확인합니다(IP 값은 출력하지 않습니다).

공개 데모:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://omni-ai-tts.vercel.app/api/auth/sign-in/email
```
- 404여야 합니다. `/`는 소개 페이지, `/studio`는 로그인 없이 열리고, 만들기는 데모 샘플을 돌려줍니다. 함수 로그에 공급자 호스트 요청이 없어야 합니다.

## 되돌리기

- 앱: 배포 스크립트가 출력한 `vercel rollback <이전 배포 URL>`(대상 프로젝트별). Hobby는 직전 production으로만 되돌립니다. 고친 배포는 `vercel promote`로 올립니다.
- 릴리스(태그·노트·GitHub Release)는 지우지 않습니다. 고친 코드는 새 patch 릴리스로 배포합니다.
- DB 마이그레이션은 되돌리지 않습니다. 앱만 되돌려도 동작하도록 파괴적 변경을 나눕니다.

## 알려진 한계

- 함수 300초를 넘겨 오는 Typecast 응답, 270초를 넘는 Fish 장면 결과는 잃습니다(Hobby 한도, ADR 0013).
- 오디오는 DB(`trial_generation.audio`)에 30일 보관합니다. 합계가 약 500MB에 가까워지면 외부 저장소로 옮깁니다([ADR 0003](../adr/0003-postgres-cache.md), [0006](../adr/0006-studio-audio-in-generation-record.md)).
- 소유자는 한 명입니다.
- Vercel Hobby 무료 한도는 계정 단위라 공개 데모 남용이 본인용까지 멈출 수 있습니다. 공개 데모에 `POST /api/rpc` IP당 1분 120회 Firewall 속도 제한을 걸어 둔 이유입니다.
- 공개 데모는 로그인 없이 쓰기가 열려 있어, 방문자가 저장한 글은 다음 초기화까지 다른 방문자에게 보입니다. 두 배포 모두 한국에서만 열려 해외 방문자와 검색엔진 크롤러는 막힙니다.
