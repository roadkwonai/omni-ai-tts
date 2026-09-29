# tts-pilot-app

## TTS UI/UX 기획

초기는 개인 작업실로 개발하고 공개 가입·결제·팀은 후속으로 확장합니다.

- [HTML UI 프로토타입 안내](docs/prototypes/tts-studio/README.md)
- [UI 우선 개발 계획](docs/plans/tts-ui-first-implementation.md)
- [제품 맥락](PRODUCT.md) · [요구사항](docs/plans/tts-service-requirements.md)
- [영상 구간 분석](docs/research/tts-video-detailed.md) · [참고 서비스 화면 검토](docs/research/gowith-ux-review.md)

HTML은 UI/UX 검토용 시연이며 실제 음성 합성·클론·DB 연동은 다음 구현 단계입니다.

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Self, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the checked-in migrations to your local database:

```bash
pnpm --filter @tts-pilot-app/db db:migrate
```

For Neon, select the intended development branch and supply its direct connection
string as the migration process's `DATABASE_URL`. Keep the web app on its pooled
connection. Follow [the migration workflow](.agents/skills/bts-db/references/migration-flow.md);
do not run `db:push` against a shared or production database.

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@tts-pilot-app/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `pnpm run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

### DB·인증·TTS 환경변수

| 변수 | 용도 | 입력 기준 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 연결 | 필수. 로컬 개발 DB 또는 Neon 연결 문자열 전체 |
| `BETTER_AUTH_SECRET` | 로그인 세션 보호 | 필수. 32자 이상 무작위 값; 기존 값 유지 |
| `BETTER_AUTH_URL` | 인증 기준 주소 | 필수. 로컬은 `http://localhost:3001`, 배포는 실제 HTTPS 주소 |
| `TYPECAST_API_KEY` | Typecast API | 실제 TTS 연동에 필요. UI 개발 중에는 비워 둘 수 있음 |
| `ELEVENLABS_API_KEY` | ElevenLabs API | 실제 TTS 연동에 필요. UI 개발 중에는 비워 둘 수 있음 |
| `FISH_AUDIO_API_KEY` | Fish Audio API | 실제 TTS 연동에 필요. UI 개발 중에는 비워 둘 수 있음 |

Neon은 콘솔의 **Connect**에서 사용할 브랜치·데이터베이스·역할을 선택하고 연결 문자열을
복사해 `DATABASE_URL`에 넣습니다. 웹 앱에는 pooled 연결을 사용하고 SSL 등 연결 옵션을
그대로 유지합니다. [Neon 공식 연결 안내](https://neon.com/docs/get-started/connect-neon)를 참고하세요.
일상 개발은 로컬 DB, 병합 전 검증은 Neon 개발 브랜치라는 프로젝트 원칙을 따릅니다.

DB 도구의 `packages/db/.env.schema`는 웹 앱의 `DATABASE_*` 설정을 가져오므로 같은 URL을
여러 파일에 중복 입력할 필요가 없습니다. `packages/db/.env`의 `DB_PORT`는 로컬 컨테이너
포트만 제어합니다(기본 5432). 포트를 바꾸면 웹 앱의 로컬 `DATABASE_URL` 포트도 맞추세요.
Neon 연결에는 `DB_PORT`를 사용하지 않습니다.

현재 앱은 별도의 `NEON_API_KEY`, `NEON_PROJECT_ID`, `DIRECT_URL`, SMTP·스토리지 키를
읽지 않습니다. `NODE_ENV`는 스키마/실행 도구에서 설정하므로 추가 입력할 필요가 없습니다.
이메일 발송·오디오 영구 저장을 실제로 연결할 때 해당 서비스의 설정을 추가합니다.

### TTS API 키 입력

실제 입력 파일은 저장소 루트가 아닌 `apps/web/.env`입니다. 새 환경은
`apps/web/.env.example`을 복사하고, 기존 `.env`가 있으면 아래 항목만 추가하세요.
기존 DB·인증 설정을 덮어쓰지 마세요.

```dotenv
TYPECAST_API_KEY=
ELEVENLABS_API_KEY=
FISH_AUDIO_API_KEY=
```

각 공급자의 API 키를 입력하고 실행 중인 개발 서버를 재시작하세요. 키는 Varlock에서
선택적 민감값으로 선언되어 있어 비워 두어도 UI 개발이 가능합니다. 현재 설정은 키 입력과
로딩 준비이며, 실제 TTS API 호출은 아직 구현하지 않았습니다. 키 값만 변경할 때는 타입을
다시 생성할 필요가 없습니다.

서버 코드에서는 `apps/web/src/env.server.ts`의 `ENV.TYPECAST_API_KEY`,
`ENV.ELEVENLABS_API_KEY`, `ENV.FISH_AUDIO_API_KEY`로 접근합니다. `NEXT_PUBLIC_` 접두사를 붙이거나 클라이언트로
전달하지 마세요. `.env`는 Git에서 제외되고 `.env.example`에는 실제 키를 넣지 않습니다.
배포 환경에서는 같은 이름의 서버 환경변수를 설정합니다.

## Git Hooks and Formatting

- Run checks: `pnpm run check`

## Project Structure

```
tts-pilot-app/
├── apps/
│   └── web/         # Fullstack application (Next.js)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI
- `pnpm run check`: Run Biome formatting and linting

## Better Auth Schema Generation

After changing auth plugins or schema options, run `pnpm run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.

- [공급자별 전체 생성 옵션과 제작 도구 설계](docs/plans/tts-provider-options-and-tools.md): 기본·감정/표현·고급 설정 및 추천·목소리 찾기·체인저·가져오기 UX. 실제 API 연결 전 HTML 설계 단계.
