# 배포와 운영 안내

Omni AI TTS의 운영 환경과 릴리스·배포 순서입니다. 결정 배경은 [ADR 0013](../adr/0013-first-deploy-vercel-neon-singapore.md), 계정은 [소유자 계정](../owner-account.md)에 있습니다.

## 목차
- [운영 환경](#운영-환경)
- [환경 변수](#환경-변수)
- [릴리스와 배포 순서](#릴리스와-배포-순서)
- [DB 마이그레이션](#db-마이그레이션)
- [배포 뒤 확인](#배포-뒤-확인)
- [되돌리기](#되돌리기)
- [알려진 한계](#알려진-한계)

## 운영 환경

| 항목 | 값 |
|---|---|
| 주소 | `https://omni-ai-tts.vercel.app` |
| 앱 | Vercel Hobby, Fluid compute, 함수 지역 `sin1`(싱가포르), Root Directory `apps/web` |
| 함수 시간 | `/api/rpc` 최대 300초(`maxDuration`). 늦은 공급자 결과는 응답 뒤 작업(`after`)으로 저장 |
| DB | Neon(Vercel Storage로 만든 Vercel 관리 프로젝트), `aws-ap-southeast-1`, Postgres 18. 앱은 pooled, 마이그레이션은 direct |
| 환경 | production 하나. Preview(develop) 배포는 하지 않는다(Storage 통합이 운영 DB 주소를 넣기 때문) |
| Git | GitHub 비공개 저장소. Vercel Git 자동 배포는 끄고 CLI로만 배포한다 |

## 환경 변수

Vercel Production 환경 변수에만 둡니다. 값은 출력·파일·커밋에 남기지 않습니다(`vercel env pull`, `.env.production` 파일 금지).

| 변수 | 넣는 법 |
|---|---|
| `DATABASE_URL` | Vercel Storage 통합이 넣은 값(pooled, `-pooler` 호스트)을 그대로 쓴다 |
| `BETTER_AUTH_SECRET` | `openssl rand`로 만든 새 값, `--sensitive` |
| `BETTER_AUTH_URL` | `https://omni-ai-tts.vercel.app`, `--type config`(배포 스크립트가 읽는다) |
| `OWNER_EMAILS` | 소유자 이메일 하나, `--sensitive` |
| 공급자 키 6개 | `--sensitive`, 값은 파이프로만 넘긴다 |

비밀값은 셸 변수에 담아 `printf '%s' "$v" | vercel env add <이름> production --sensitive`로 넣습니다. `--value`에 비밀값을 쓰지 않습니다.

## 릴리스와 배포 순서

production은 릴리스한 커밋만 배포합니다.

1. 작업 트리가 깨끗한지, 남은 항목이 릴리스뿐인지 봅니다.
   ```bash
   pnpm vercel:deploy production --check
   ```
2. 릴리스 노트를 만들고 검수합니다(버전은 git 태그 `vX.Y.Z`, 기본 patch).
   ```bash
   pnpm release --title "<영어 제목>"
   ```
3. 발행합니다. 기본 브랜치에 노트·버전 커밋을 만들고 태그와 함께 push한 뒤 GitHub Release를 만듭니다.
   ```bash
   pnpm release --publish release/<노트 파일>.md
   ```
4. 새 마이그레이션이 있으면 **배포 전에** 운영 DB에 적용합니다(아래).
5. 배포합니다.
   ```bash
   pnpm vercel:deploy production
   ```

## DB 마이그레이션

운영 주소는 Neon CLI로 셸 변수에만 받습니다(direct, `-pooler` 아님).

```bash
DATABASE_URL="$(neon cs --project-id <운영 Neon 프로젝트 id>)" pnpm --filter @tts-pilot-app/db db:migrate
```

열·표를 지우는 변경은 expand → contract 두 단계로 나눕니다. 새 코드를 먼저 배포하고 그다음 지웁니다. 운영 데이터를 바꾸는 작업은 적용할 목록을 확인한 뒤에만 합니다.

## 배포 뒤 확인

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://omni-ai-tts.vercel.app/api/auth/get-session
```

- 200이면 앱과 인증이 응답합니다.
- `/`는 공개 소개 페이지, `/studio`는 로그인하지 않으면 `/login?next=%2Fstudio`로 갑니다.
- 로그인 시도 제한이 IP별로 세어지는지 운영 DB `rate_limit` 표의 키가 `no-trusted-ip|…`가 아닌지로 확인합니다(IP 값은 출력하지 않습니다).

## 되돌리기

- 앱: 배포 스크립트가 출력한 `vercel rollback <이전 배포 URL>`. Hobby는 직전 production으로만 되돌립니다. 고친 배포는 `vercel promote`로 올립니다.
- 릴리스(태그·노트·GitHub Release)는 지우지 않습니다. 고친 코드는 새 patch 릴리스로 배포합니다.
- DB 마이그레이션은 되돌리지 않습니다. 앱만 되돌려도 동작하도록 파괴적 변경을 나눕니다.

## 알려진 한계

- 함수 300초를 넘겨 오는 Typecast 응답, 270초를 넘는 Fish 장면 결과는 잃습니다(Hobby 한도, ADR 0013).
- 오디오는 DB(`trial_generation.audio`)에 30일 보관합니다. 합계가 약 500MB에 가까워지면 외부 저장소로 옮깁니다([ADR 0003](../adr/0003-postgres-cache.md), [0006](../adr/0006-studio-audio-in-generation-record.md)).
- 소유자는 한 명입니다. 공개 데모는 로드맵 T16에서 따로 만듭니다.
