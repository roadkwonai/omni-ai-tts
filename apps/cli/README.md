# Omni AI TTS CLI

저장소에서 다음 명령으로 빌드하고 로그인합니다. 로그인할 때 터미널에 이메일과 비밀번호를 입력합니다.

```bash
pnpm --filter @tts-pilot-app/cli build
pnpm --filter @tts-pilot-app/cli run cli auth login --url 'https://작업실주소'
pnpm --silent --filter @tts-pilot-app/cli run cli voices list --json
```

다른 pnpm 프로젝트에서는 `pnpm link /path/to/repo/apps/cli`로 로컬 링크한 뒤 `pnpm exec omni-tts --help`로 실행할 수 있습니다.

macOS에서는 기본 제공되는 `/usr/bin/lockf`로 세션 저장을 잠급니다. Linux의 `/usr/bin/flock` 경로는 구현 예정이며 이 환경에서 검증하지 않았습니다.
