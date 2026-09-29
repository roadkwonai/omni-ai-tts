# 공급자 설정 UI 검토 결과

2026-09-26. 대상: `docs/prototypes/tts-studio/index.html`과 app/styles/generation-settings/studio-tools. **HTML 설계 시연 범위**의 검토이며 실제 API 지원·음질·과금·권한 검증은 아니다.

## 방법과 결과

Method: dual-agent (A: settings_design_review · B: settings_tech_review). A는 B/detector 결과를 보지 않고 독립 평가했다. B 결과가 A의 최종 초기 보고보다 먼저 도착했으나 A에는 전달하지 않았고 종합 판단은 A 결과 이후 수행했다. A는 실제 별도 브라우저를 사용했고 B는 소스 검사와 main의 동적 증거를 사용했다.

| Nielsen 항목 | 최종 점수 /4 |
|---|---|
| 상태 가시성 | 4 |
| 현실과의 부합 | 3 |
| 사용자 통제 | 3 |
| 일관성 | 4 |
| 오류 예방 | 3 |
| 인식 중심 | 3 |
| 효율 | 3 |
| 최소화 | 3 |
| 오류 복구 | 4 |
| 도움말 | 3 |
| 합계 | 33/40 |

초기 28/40에서 제한 재확인 33/40. 초기 P1 4건(설정 textarea의 300px 높이 상속, 모바일 CTA 겹침, 숨겨진 오류·포커스, 모바일 메뉴 aria-expanded 불일치)을 한 묶음으로 고쳤다. 최종 P0/P1 없음. 언어/출력 형식의 큰 선택 목록은 P2 개선 후보다.

Technical audit: 접근성 4, 성능 4, 테마 3, 반응형 4, 구현 일관성 3 = **18/20**. `bts-reviewer(security)` approve, max none, findings empty. 최신 Web Interface Guidelines를 조회해 검토했으며 최종 확인 위반 없음. 물리 모바일 터치·스크린리더 검증은 하지 않았다.

## 기능 검증

- 브라우저 경계/상태 검사 33개 통과: 모델별 기본값, 시드·정수·범위·빈 값·NaN, 무음 0, 발음 사전 ID/버전, 문맥 이스케이프, 고급 설정 프리셋, 출력 형식 28개, 일본어 설정 전환, v3 태그, 같은 공급자 성우 변경 시 모델 보존.
- 실제 프리셋 화면에서 안정성 0.32·시드 42·사전/버전 저장 후 초기화→다시 적용 검증. 문맥은 재사용 프리셋에서 제외. 잘못된 시드는 저장 이름 창을 열기 전에 차단하고 필드에 포커스.
- 생성 시연 완료 직후는 현재 결과, 속도 수정 뒤에는 이전 설정 결과로 표시.
- 390px: 가로 넘침 없음, 생성 버튼은 문서 흐름의 전용 행(position static), 문맥 min-height 80px. 모바일 성우/더보기 상태 일치, 성우 선택 후 패널 접힘과 포커스 복원.
- 기본 음성/모델/입력 외 실제 서버 요청은 없다. v3 태그는 원문을 보존하고 발음용 대본에만 추가한다.

증거: `tasks/evidence/tts-provider-settings/verification.json`, `desktop-typecast-final.png`, `desktop-eleven-final.png`, `mobile-typecast-final.png`, `mobile-eleven-final.png`, A 독립 캡처 `a-*.png`.

## 검사와 제한

- JS 3파일 `node --check`: 통과. 프로토타입 Biome 5파일: 통과. `git diff --check`: 통과.
- `pnpm check-types`: 5/5 cached 통과. `pnpm build`: 4/4 cached 통과. 기존 Next.js 앱의 검사이며 별도 HTML은 브라우저로 검증했다.
- 전체 Biome: 기존 범위 101 errors / 68 warnings / 2 infos 유지. 이번 UI 파일은 깨끗하며 기존 정리 항목 Q-01은 남긴다.
- detector는 B에서 1회. 최종 계수는 warning 1/advisory 8(초기 보고의 8개는 재계수하여 9개로 정정). 탭 경계의 inset 경고와 기존 토큰/폰트 advisory는 기존 디자인·대비 보정과 연관돼 이번 수정 범위에서 유지했다. 자동검사는 디자인 합격의 대체 근거가 아니다.
- Ego로 소개 페이지와 HTML을 읽었다. 앞선 동일 세션에서 Ego 캡처 timeout이 확인돼 시각 증거는 agent-browser로 대체했다. B의 별도 브라우저는 about:blank로 돌아가 직접 동적 검증 실패를 명시했다. A와 main의 실제 동적 검증을 B의 독립 실행으로 표현하지 않는다. 사용자에게 시각 overlay가 표시됐다고 주장하지 않는다.
- Questions skipped: 최종 P0/P1 0개, 잔여 P2 1개이며 사용자 요청 범위의 수정이 완료됐다.
