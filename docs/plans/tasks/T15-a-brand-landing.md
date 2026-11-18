# T15-a 확장: 브랜드·README·랜딩 — 작업 흐름 계획

- 작성 2026-11-18. 사용자 요청(2026-11-18): 발행·배포 전에 README와 가이드 문서를 자세히 쓰고, 로고·마스코트·이미지를 `/gpt-image`로 만들어 반영하고, README를 바탕으로 랜딩 페이지를 기획·설계·제작하고, 스크린샷을 찍어 이미지에 쓰고, 랜딩 애니메이션을 설계·적용하고, 검수·보완까지 한다.
- 결정(사용자 2026-11-18): 이 작업은 T15-a 라운드에 더해 첫 릴리스(v0.1.0)에 포함한다. 표시 이름은 **Omni AI TTS**로 통일한다(코드 식별자 `tts-pilot-app`은 그대로). 랜딩은 앱의 공개 첫 화면 `/`에 둔다. `vercel-labs/ui`는 스킬과 패키지(`@ui-sdk/react`·`@ui-sdk/core`, 베타)까지 설치한다.
- 이미 만든 릴리스 노트 `release/20261118-2333-first-deploy.md`는 커밋이 늘어나므로 지우고 끝에 다시 만든다.

## 단계

| 단계 | 할 일 | 맡는 쪽 | 끝나는 조건 |
|---|---|---|---|
| 0. 준비 | 선택 묶음 `landing`(landing-page-design)·`animation`(emilkowalski) 설치, `ui-sdk` 카탈로그 등록·설치, 로드맵 T15-a 범위 갱신 | Main·prokit-implementer | `pnpm skills:check`에 셋 있음 |
| 1. 기획 | landing-page-design A1 인테이크(주 행동, 대상, 증거, 말투, 디자인 방향)를 묻고 `PRODUCT.md`에 랜딩·이름을 반영, 사이트맵에 `/` 행 | Main(사용자 답) | 사용자 답 |
| 2. 설계 | impeccable `shape`로 랜딩 브리프 `docs/briefs/landing.md`(보조: landing, animation): A2 구조, A3 레이아웃, 헤드라인·CTA 후보, 섹션별 이미지, 상호작용(ui-sdk 동작), 모션 계획(emil `animate` 순서), 이름 변경 범위. README 목차와 가이드 문서 목록 | Main | 사용자 브리프 확인 |
| 3. 시각 자산 | `/gpt-image`로 로고(글자·심볼), 마스코트, 배너, og 이미지, 파비콘 후보를 만들고 사용자가 고른다. 고른 것을 `apps/web/public/brand/`·`docs/assets/brand/`에 둔다 | Main(이미지 도구) | 사용자 선택 |
| 4. 이름 바꾸기 | 화면 글자 로고·탭 제목·메타·`PRODUCT.md`·`GLOSSARY.md`·문서의 표시 이름을 Omni AI TTS로. 새 로고·파비콘 연결 | prokit-ui-builder, Main(문서) | 타입·린트·테스트 |
| 5. 랜딩 구현 | `/` 공개 랜딩(로그인한 소유자는 작업실로), proxy 공개 경로 예외, 섹션 순서대로(A6), ui-sdk 동작, metadata·og·JSON-LD(FAQ가 있으면) | prokit-ui-builder, proxy는 prokit-api-builder | 빌드·테스트, security 리뷰 |
| 6. 스크린샷 | 테스트 DB에 예시 데이터와 시험용 소유자 계정(생성 값은 기록 파일에만)을 두고 3002 서버에서 주요 화면(캐스팅, 문단 작업실, 드라마, 대본 보관함, 내 보이스, 연결 상태)을 1440·390으로 찍는다. 공급자 유료 호출 없음 | prokit-runtime-checker | 스크린샷 묶음 |
| 7. 스크린샷 이미지 | 스크린샷을 참조로 `/gpt-image`가 랜딩·README용 소개 이미지(기기 목업·기능 묶음)를 만든다. 실제 화면과 다른 기능을 그리지 않는다 | Main(이미지 도구) | 사용자 확인 |
| 8. 애니메이션 | emil `animate`·`emil-design-eng`로 히어로 등장, 스크롤 등장, 태그라인 단어 등장(브리프에서 고를 때만), 버튼 눌림 등 설계·적용, `prefers-reduced-motion` 대응 | prokit-ui-builder | `improve-animations`·`review` |
| 9. README·가이드 | 참고 README(pro-kit) 상단 형식(배너, 가운데 제목·한 줄 소개, 배지, 목차 링크, 구분선), 서비스 소개·기능·스크린샷·기술 스택·구조·로컬 실행·배포·운영 계정·문서 지도. 가이드: 사용 안내(작업실 흐름), 개발 안내, 배포·운영 안내 | Main(문서) | 사용자 확인 |
| 10. 검수·보완 | impeccable critique·audit, web-design-guidelines(prokit-reviewer ui), landing 체크리스트, 애니메이션 리뷰, 1440·390 런타임, code·security 리뷰, 고친 뒤 재확인 1회 | Main·리뷰어·runtime-checker | 기준(audit 16/20, a11y 3/4) |
| 11. 릴리스·배포 | 노트 다시 만들기 → 발행 동의 → v0.1.0 → production 배포 → 운영 확인(동의 받은 쓰기 확인 포함) | Main | 배포 주소 200 |
| 12. 사용자 테스트 | 랜딩·로그인·작업실(T15-a 스펙 10절 + 랜딩) | 사용자 | `[confirm]` |

## 지키는 것
- 랜딩은 데이터·공급자를 부르지 않는다. 가입·데모 없음(데모는 T16). 만들지 않는 페이지로 가는 링크를 두지 않는다.
- 수치·후기·로고는 사용자가 준 것만 쓴다. 없으면 넣지 않는다.
- 생성 이미지는 실제 화면·기능의 증거처럼 보이게 쓰지 않는다. 실제 화면은 스크린샷으로 보여 준다.
- 색·간격·반경·모션 값은 토큰으로. 한글 제목 `break-keep`.
- 새 의존 `@ui-sdk/react`·`@ui-sdk/core`(베타)는 ADR로 남긴다.
