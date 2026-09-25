# 서비스 이름

이 서비스가 무엇이고 왜 존재하는지 한두 문장으로 적는다.

## Language

용어마다 한두 문장 정의와 피해야 할 동의어를 적는다. 일반 프로그래밍 개념은 넣지 않는다. 형식은 `domain-modeling` 스킬의 CONTEXT 형식을 따른다.

**사용자(User)**:
Better Auth로 가입한 계정. 코드에서는 `user` 테이블과 `context.session.user`다.
_Avoid_: 회원, 유저, account
