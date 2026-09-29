# HTML 시안 검토 기록

대상: `docs/prototypes/tts-studio/`. 날짜: 2026-09-26. 제품 범위는 개인용, 실제 API/음성/클론/DB 없는 설계 프로토타입이다.

## 방법

- `bts-ui → impeccable`의 shape/new-work/craft-floor/operate, 독립 critique A/B, audit, polish를 적용했다.
- Method: dual-agent — A `/root/ui_critique_a`(디자인), B `/root/ui_audit_b`(코드·보안·기술 audit). 두 평가자는 서로의 평가를 보지 않았다.
- Ego Browser에서 사이트 조사와 HTML DOM 확인을 했다. `Page.captureScreenshot`이 기본/낮은 수준 호출 모두 시간 초과되어 설치된 agent-browser로 로컬 HTML 캡처·동작 검증을 대체했다. 추가 브라우저 설치 없음.
- 1440×1000, 390×844 뷰포트. 모바일은 Chromium 뷰포트 모의 실행이며 실제 휴대전화·스크린리더 검증은 아니다.
- 실제 Next.js 앱의 페이지를 구현한 것이 아니므로 HTML 브라우저 증거와 기존 앱 빌드 결과를 분리한다.

## 초기 독립 평가

| 평가 | 초기 결과 | 주요 근거 |
|---|---|---|
| A Design Health | 24/40, disposition `fix`, P0 없음 | 숫자 검수 구조·Wanted 방향은 유지. 모바일 메뉴·버튼 기본 스타일·검수 순서·정적인 필터·클론 흐름 보완 |
| B Audit | 12/20, 접근성 2/4, `changes-required`, max medium | 낮은 대비·작은 터치 영역, 중복 생성 안내, 분류 초기화, 저장 실패 시 메모리 반영, 프리셋 모델 불일치 |
| B 보안 범위 | 정적 코드에서 외부 요청·키·파일/마이크 접근·위험한 HTML 삽입 없음 | 실제 인증·서버 소유권 검증은 후속 |
| Detector | warnings 5, advisories 40 | `tasks/evidence/tts-ui-prototype/detector.json`. 토큰 매핑 advisory와 실제 낮은 대비를 구분 |

## 한 번의 수정 묶음

1. 성우 행의 브라우저 기본 버튼을 없애고 토큰·글자 크기·대비를 정리한다. 초기 고정 진행 막대는 제거한다.
2. 모바일 목적지를 라벨과 함께 정리하고 성우 변경·하단 생성 행동, 44px 조작 영역을 제공한다.
3. 검수 대기→항목/일괄 적용 또는 원문 유지→생성을 연결한다. 원문 변경은 이전 검수를 초기화한다.
4. 성우 보관함의 분류 필터·메모·즐겨찾기를 실제 시연 동작으로 만들고, 분류 상태를 렌더 함수 밖에서 유지한다.
5. 생성 중복과 dialog 액션 누적을 막고 모델·프리셋·결과 스냅샷의 일치를 보장한다.
6. 대본 저장은 저장소 쓰기 성공 후 메모리에 반영한다. 편집·복제·검색 흐름을 연결한다.
7. 내 보이스를 원본 확인·동의·처리·검증·사용 가능·실패·삭제의 명시적 상태로 시연한다.

## 최종 재확인

- A: **ship, Design Health 34/40**. 기존 P1 5건과 추가 결과 스냅샷 회귀 1건 해결. 시각 시스템을 새로 바꾸지 않고 사용 흐름을 보완했다.
- B: **approve, Audit 16/20, 접근성 3/4**, security approve, max severity none. 평가 범위에서 남은 실질 지적 없음. 실제 API/인증/음성 검증을 뜻하지 않는다.
- B 점수: 접근성 3, 성능 4, 테마 3, 반응형 3, 구현 일관성 3. 라이트 모드의 HTML 시안이며 물리 기기와 스크린리더는 검증하지 않았다.
- 모바일 저장 버튼이 가려진 것처럼 보이는 full-page 캡처는 고정 CTA가 최초 뷰포트 위치에 합성된 결과였다. 390×844에서 저장 버튼으로 스크롤 후 실제 클릭이 이름 prompt를 열었다. 버튼 중앙 hit-test는 저장 버튼 자체였고, 저장 버튼 y=518.89~562.89 / 생성 CTA y=784~832로 분리됨을 기록했다.

### 실행 검증

| 확인 | 실제 결과 |
|---|---|
| HTML JS 문법 | `node --check docs/prototypes/tts-studio/app.js` exit 0 |
| 변경 HTML/CSS/JS 린트 | `pnpm exec biome check docs/prototypes/tts-studio --reporter=summary` exit 0 |
| 기존 앱 타입 검사 | `pnpm check-types` 5/5 성공 |
| 기존 앱 빌드 | `pnpm build` 4/4 성공, Next 16.3.6 빌드. TTS 페이지는 아직 앱 라우트로 이관하지 않음 |
| 전체 린트 | 기존 코드와 자동 생성된 도구 기록에 오류가 남아 실패. 관계없는 파일을 수정하지 않음 |
| 원문 수정 후 검수 | `새 대본 3분입니다.` 입력 시 대기 1건, 발음용 대본 원문으로 초기화 |
| 생성 결과 비교 | 변경 전 이전 결과 표시 없음, 원문 변경 후 이전 결과 표시 있음 |
| 입력 상한 | 2,001자 원문 편집 허용, 생성 클릭은 경고·dialog 없음으로 차단 |
| 프리셋 | 소연 프리셋 적용 후 실제 선택 모델 `eleven-multilingual-v2` 확인 |
| 클론 | 검증 필요일 때 작업실 사용 비활성. 검증 완료 시연 후 선택 성우 이름이 등록한 이름으로 변경. 제목/폼 중복 렌더링 없음 |
| 모바일 | 390px에서 문서 scrollWidth=390, 익명 내비게이션 0, 생성 버튼 높이 48px |
| 폰트 | `document.fonts.check('16px Pretendard')=true`, font status loaded |
| JS 오류 | agent-browser errors 출력 없음 |
| 문서 링크 | 계획·브리프·조사 10개 Markdown의 상대 링크 누락 없음 |

### 캡처

`tasks/evidence/tts-ui-prototype/`의 `desktop-final.png`, `correction-final.png`, `mobile-final.png`, `mobile-voices-final.png`, `voices-final.png`, `clone-final.png`, `clone-status-final.png`, `mobile-save-focus.png`를 확인했다. 초기 캡처와 detector 결과도 같은 폴더에 남겼다. 증거 폴더는 저장소의 기존 ignore 정책을 유지한다.

이번 통과는 **HTML 설계 프로토타입의 해당 검토 범위**다. 예제 숫자 패턴 외의 일반 숫자 교정, 브라우저 세션 밖의 즐겨찾기/프리셋/클론 보존, 실제 청취·다운로드·공급자 호출·서버 저장은 후속 구현이다.

## Web Interface Guidelines

2026-09-26 [공식 규칙](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)을 읽고 의미 있는 버튼/링크, 입력 라벨, 키보드 포커스, dialog, 긴 콘텐츠, 대비, 모바일 조작 크기, 원격 요청 경계를 검토했다. 이후 실제 앱 단계에서 URL 상태·로딩·서버 오류·미디어 컨트롤을 추가 검증한다.
