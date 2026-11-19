# 소유자 계정 만들기와 다시 만들기

이 작업실은 소유자 한 명만 로그인해 쓴다([T14 스펙](plans/tasks/T14-owner-login.md), [ADR 0012](adr/0012-session-owner-single-allowlist.md)). 가입 화면은 없고, 계정은 로컬 DB에서만 스크립트로 만든다.

## 처음 만들기

1. `apps/web/.env`에 `OWNER_EMAILS=<본인 이메일>`을 넣는다. 이메일은 하나만 넣는다(둘 이상이면 아무도 로그인해 쓸 수 없다).
2. 로컬 DB가 켜져 있는지 확인한다(`pnpm db:start`).
3. 터미널에서 실행한다. Claude Code 대화창에서는 앞에 `!`를 붙인다.
   ```bash
   pnpm owner:create
   ```
4. 이메일을 넣고 비밀번호(12~128자)를 두 번 넣는다. 비밀번호는 화면에 보이지 않는다.
5. "계정을 만들었어요."와 표마다 옮긴 행 수가 나온다. 로그인 전에 쌓인 `local-admin` 데이터(채널·분류·성우 보관함·프리셋·대본·생성 기록·내 보이스)가 이 계정으로 옮겨졌다. 목록 캐시는 다시 받으면 되므로 지운다.
6. 개발 서버를 다시 켜고 `BETTER_AUTH_URL`과 같은 주소(지금 `http://localhost:3001`)로 연다. `127.0.0.1`과 `localhost`는 서로 다른 주소로 취급되어 로그인이 막힌다.

스크립트는 production, 로컬이 아닌 DB 주소, `OWNER_EMAILS`와 다른 이메일, 이미 있는 이메일을 거부하고 아무것도 쓰지 않는다. 비밀번호를 명령 인자나 환경 변수로 받지 않는다.

## 비밀번호를 잊었을 때

비밀번호 바꾸기·되찾기는 없다. 로컬에서 계정을 지우고 다시 만든 뒤, 옛 계정 id로 남은 데이터를 새 id로 옮긴다. 데이터 표의 `owner_id`에는 외래 키가 없어서 계정을 지워도 데이터는 남는다.

1. 옛 계정 id를 적어 둔다.
   ```sql
   select id from "user" where email = '<본인 이메일>';
   ```
2. 계정을 지운다(세션·로그인 정보는 함께 지워진다).
   ```sql
   delete from "user" where email = '<본인 이메일>';
   ```
3. `pnpm owner:create`로 다시 만든다. 새 계정 id를 확인한다(1번 쿼리).
4. 옛 id 데이터를 새 id로 옮긴다(한 트랜잭션).
   ```sql
   begin;
   update channel          set owner_id = '<새 id>' where owner_id = '<옛 id>';
   update classification   set owner_id = '<새 id>' where owner_id = '<옛 id>';
   update saved_voice      set owner_id = '<새 id>' where owner_id = '<옛 id>';
   update voice_preset     set owner_id = '<새 id>' where owner_id = '<옛 id>';
   update script           set owner_id = '<새 id>' where owner_id = '<옛 id>';
   update trial_generation set owner_id = '<새 id>' where owner_id = '<옛 id>';
   update my_voice         set owner_id = '<새 id>' where owner_id = '<옛 id>';
   delete from provider_list_cache where owner_id = '<옛 id>';
   commit;
   ```

## 스크립트가 "만든 계정을 지우지 못했어요"라고 할 때

데이터 이전이 실패했고 만든 계정을 되돌리지 못한 경우다. 위 2번으로 그 계정을 지우고, 원인(대개 DB 연결)을 해결한 뒤 `pnpm owner:create`를 다시 실행한다. 이전은 한 트랜잭션이라 데이터는 `local-admin`에 그대로 있다.

## 운영(배포) 계정

`pnpm owner:create`는 로컬 DB에서만 동작한다(원격 거부). 운영 DB의 계정은 로컬에서 만든 계정을 앱 데이터와 함께 한 번 복사해 만든다(T15-a, [ADR 0013](adr/0013-first-deploy-vercel-neon-singapore.md)). 그래서 운영 로그인 이메일·비밀번호는 로컬과 같다. 복사 뒤 두 DB는 따로 바뀐다.

1. 로컬에서 위 '처음 만들기'로 계정을 만든다(`local-admin` 데이터가 그 계정으로 옮겨진다).
2. 운영 DB에 마이그레이션을 direct 주소로 적용한다. 주소는 Neon CLI로 셸 변수에만 받는다(파일·출력에 남기지 않는다).
3. 옮기는 표(12개): `user`, `account`, `channel`, `channel_default_preset`, `classification`, `my_voice`, `saved_voice`, `saved_voice_channel`, `saved_voice_classification`, `script`, `script_classification`, `voice_preset`. 옮기지 않는 표: `session`, `verification`, `rate_limit`, `provider_cooldown`, `provider_list_cache`, `trial_generation`, `drizzle.__drizzle_migrations`.
4. 복사(덤프 파일을 만들지 않고 파이프로, 실패하면 전부 되돌린다). 주소는 작은따옴표 안 컨테이너 셸에서만 펼친다.

```bash
export PROD_URL="$(neon cs --project-id <운영 Neon 프로젝트 id>)"
podman exec -e PROD_URL tts-pilot-app-postgres sh -c 'test -n "$PROD_URL" && printf %s "$PROD_URL" | grep -q sslmode=require || exit 1; pg_dump -U postgres -d tts-pilot-app --data-only -t '"'"'public."user"'"'"' -t public.account -t public.channel -t public.channel_default_preset -t public.classification -t public.my_voice -t public.saved_voice -t public.saved_voice_channel -t public.saved_voice_classification -t public.script -t public.script_classification -t public.voice_preset | psql "$PROD_URL" -v ON_ERROR_STOP=1 --single-transaction'
unset PROD_URL
```

5. 표마다 행 수를 로컬과 운영에서 비교한다.

## 운영 비밀번호를 다시 정할 때

위 '비밀번호를 잊었을 때'는 `pnpm owner:create`(로컬 전용)를 써서 운영에 그대로 할 수 없다. 운영은 계정 행을 지우지 않고 비밀번호 해시만 바꾼다. 사용자 id와 데이터는 그대로다. 로컬과 운영을 같은 비밀번호로 맞춘다(T15-b 2026-11-19, 실제로 이 방법으로 바꿨다).

1. 두 DB에서 로그인 정보 행이 하나뿐인지 본다: `select count(*) from account where provider_id = 'credential'` → 둘 다 1이어야 한다. 아니면 멈춘다.
2. 새 비밀번호(12~128자)를 화면에 보이지 않게 두 번 받아, Better Auth와 같은 함수(`better-auth/crypto`의 `hashPassword`)로 해시하고 `verifyPassword`로 맞는지 확인한다. 비밀번호는 명령 인자·환경 변수·파일에 두지 않는다. 저장소의 `packages/auth` 폴더에서 Node를 열면 그 패키지의 `better-auth`를 불러올 수 있다(스크립트 파일은 두지 않는다: 로컬 CLI는 운영을 거부한다는 규칙).
   ```bash
   unset NEW_HASH; cd packages/auth && node --input-type=module -e '
   import { hashPassword, verifyPassword } from "better-auth/crypto";
   const ask = (q) => new Promise((ok) => { process.stderr.write(q); const i = process.stdin; i.setRawMode(true); i.resume(); let v = "";
     const on = (s) => { for (const c of s.toString()) { if (c === "\r" || c === "\n") { i.setRawMode(false); i.pause(); i.off("data", on); process.stderr.write("\n"); return ok(v); } if (c === "\u0003") process.exit(130); v = c === "\u007f" ? v.slice(0, -1) : v + c; } }; i.on("data", on); });
   const a = await ask("새 비밀번호: "), b = await ask("한 번 더: ");
   if (a !== b || a.length < 12 || a.length > 128) { console.error("다르거나 12~128자가 아니에요"); process.exit(1); }
   const h = await hashPassword(a); if (!(await verifyPassword({ hash: h, password: a }))) process.exit(1);
   process.stderr.write("해시를 만들었어요\n"); process.stdout.write(h);' > "$TMPDIR/owner-hash" && export NEW_HASH="$(cat "$TMPDIR/owner-hash")"; rm -f "$TMPDIR/owner-hash"
   case "$NEW_HASH" in *[!0-9a-f:]* | "" ) echo "해시 형식이 아니에요. 멈춰요"; unset NEW_HASH ;; *:*) echo "해시 준비됨" ;; *) echo "해시 형식이 아니에요. 멈춰요"; unset NEW_HASH ;; esac
   ```
   질문은 stderr로만 나가고 stdout에는 해시 한 줄(`<salt>:<key>`, 16진수)만 남는다. 해시 파일은 성공·실패 모두 바로 지운다. 해시는 화면에 찍지 않는다. "해시 준비됨"이 아니면 3단계로 가지 않는다.
3. 해시는 출력하지 않고 컨테이너 환경 변수로만 넘긴다. psql 15 이상의 `\getenv`로 표준 입력에서 읽어 명령 인자(ps에 보이는 자리)에 두지 않는다. 조건에 행이 하나뿐일 때만 바꾸게 넣는다.
   ```bash
   printf '%s\n' '\getenv h NEW_HASH' "update account set password = :'h', updated_at = now() where provider_id = 'credential' and (select count(*) from account where provider_id = 'credential') = 1" \
     | psql <대상> -v ON_ERROR_STOP=1
   ```
   2단계와 같은 셸에서 실행한다(`NEW_HASH`가 export되어 있어야 한다. 없으면 psql이 `:'h'` 근처 문법 오류로 멈추고 아무것도 바뀌지 않는다). 출력이 `UPDATE 1`인지 확인한다(`UPDATE 0`이면 행이 하나가 아니라 아무것도 바뀌지 않았다). 로컬은 위 `printf … |` 뒤에 `podman exec -i -e NEW_HASH tts-pilot-app-postgres psql -U postgres -d tts-pilot-app -v ON_ERROR_STOP=1`, 운영은 `export PROD_URL="$(neon cs --project-id <운영 Neon 프로젝트 id>)"`로 받은 direct 주소를 같은 컨테이너에 `-e PROD_URL`로 넘겨 `psql "$PROD_URL"`로 붙는다(`sslmode=require` 확인. 접속 문자열은 컨테이너 안 psql 인자에 잠깐 보인다). 끝나면 `unset PROD_URL NEW_HASH`.
4. 비밀번호가 새어 나간 것이 의심되면 두 DB 모두에서(3단계와 같은 방법으로) 옛 세션도 지운다(해시만 바꾸면 옛 세션 쿠키가 만료까지 통한다): `delete from session where user_id = (select user_id from account where provider_id = 'credential')`.
5. 새 비밀번호로 로그인한다. 운영 DB 쓰기라 실행은 소유자 본인이 한다.

로그인이 계속 401(이메일이나 비밀번호가 맞지 않아요)이면 먼저 두 DB의 해시가 같은지(값을 찍지 않고 `md5(password)` 비교)와 시도 제한(60초 5회)을 본다. 403이면 비밀번호가 아니라 출처(`BETTER_AUTH_URL`) 문제다.
