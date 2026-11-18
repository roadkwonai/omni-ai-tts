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

운영 DB의 계정은 T15(첫 배포)에서 정한다. 이 스크립트는 로컬 DB에서만 동작한다.
