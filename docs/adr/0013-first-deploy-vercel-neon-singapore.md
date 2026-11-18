# 첫 배포: Vercel Hobby sin1 + Neon 싱가포르, 로컬 데이터 옮기기

- 상태: 채택(T15-a 스펙 사용자 확인 2026-11-18).

작업실을 `omni-ai-tts.vercel.app`에 처음 올린다. Vercel 함수는 `sin1`, 운영 DB는 Neon `aws-ap-southeast-1`에 둔다. Neon에는 한국·일본 지역이 없고, 요청 하나가 DB를 여러 번 부르므로 함수와 DB를 같은 지역에 붙인다. Vercel은 Hobby를 유지해 함수 최대 300초 안에서 동작하게 한다. 늦은 공급자 결과는 Next `after`로 응답 뒤에 저장하고, Fish 장면의 늦은 상한을 300초에서 270초로 줄여 저장 여유를 둔다. 270초를 넘는 장면 결과와 함수 종료 뒤의 Typecast 응답은 잃는다.

운영 DB는 사용자가 Vercel Storage로 만든 Vercel 관리 Neon 프로젝트(`neon-omni-ai-tts`)다. Storage 통합이 `DATABASE_URL`(pooled)과 `PG*`·`POSTGRES_*`를 Vercel에 넣고, 운영 DB 작업(마이그레이션·데이터 복사)은 Neon CLI로 받은 주소를 셸 변수로만 쓴다. 통합이 Preview·Development에도 운영 주소를 넣으므로 develop(Preview) 배포는 하지 않고 그 두 환경의 `DATABASE_URL`은 지운다. 운영 DB는 빈 상태로 시작하지 않고 로컬 DB의 계정과 앱 데이터를 한 번 복사한다. 그래서 T14의 "계정은 로컬 DB에서만 만든다"(ADR 0012)를 바꾸지 않고도 운영 소유자 계정이 생긴다. 생성 기록·오디오·목록 캐시·세션은 옮기지 않는다.

## 고려한 대안
- Pro 플랜(최대 800초): 지금 상한을 그대로 둘 수 있지만 월 비용이 생긴다. 270초를 넘는 장면이 실제로 생기면 다시 본다.
- 빈 운영 DB + 원격 `owner:create`: T14의 원격 거부를 풀어야 하고, 로컬에 정리한 보관함·프리셋·대본을 다시 만들어야 한다.
- 함수 서울(icn1) + DB 싱가포르: 브라우저는 가깝지만 DB 호출마다 지역 왕복이 붙는다.
