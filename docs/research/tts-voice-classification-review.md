# 성우 분류 UI 검토

2026-09-26. Method: dual-agent (A: classification_design_review · B: classification_tech_review). A는 B/detector 결과를 보지 않고 독립적으로 1440/390px 화면을 검토했다. B는 소스·보안·접근성 및 별도 브라우저의 초기 편집 흐름을 검토하고, Main의 동적 증거로 최종 재검토했다.

## 결과

- 디자인: 초기 34/40 → 최종 **36/40**. P0/P1 미해결 없음.
- 기술 audit: 접근성 4, 성능 4, 테마 3, 반응형 3, 구현 완전성 4 = **18/20**.
- bts-reviewer(security): **approve, max none, findings empty**. 실제 .env는 읽지 않았고 기존 schema의 공급자 키 sensitive/nonpublic만 확인했다.
- 최신 Web Interface Guidelines를 조회하여 오류 전달·포커스 규칙을 점검했다.

## 한 번의 수정 묶음

1. 80자의 긴 분류명 줄바꿈과 manager 메타 텍스트 가로 넘침 방지.
2. 모바일 관리 액션을 가로 줄로 배치하고 터치 영역 44px 확보.
3. 추가/이름 변경 오류에 alert, 고유 ID, aria-describedby/aria-invalid 및 포커스 연결.
4. 이름 변경·삭제 후 포커스 복귀, 저장 후 필터에서 성우가 사라졌을 때 제목으로 포커스 복귀.

분류 영역은 성우의 공급자·세 그룹 태그·미지정·즐겨찾기·자주 사용을 구분한다. 편집 패널의 연결 저장과 새 항목 즉시 생성의 차이를 설명하고, 관리 화면은 연결 성우 수와 성우 보기로 탐색을 연결한다. Wanted/Pretendard 시각 체계를 유지했다.

## 실제 검증

다중 그룹 배정, 취소/ESC, 바로 항목 추가, 중복 차단, 양사 식별 분리, 같은 그룹 OR/그룹 간 AND, 저장/새로고침 복원, 이름 변경 후 ID 유지, 삭제 후 연결 해제와 성우 보존, 관리→필터 이동을 확인했다. localStorage quota 오류 주입 시 메모리·디스크·편집 초안을 보존하며 성공 표시 없이 패널을 유지했다. 손상 JSON에서는 안내와 함께 기본 화면으로 복구했다.

최종 390px drawer는 390×844 전체 화면, 가로 넘침 없음, 체크 항목 44px이다. 이름 변경 후 해당 버튼, 삭제 후 그룹 추가 입력으로 포커스가 이동한다. provider+favorites 조합은 ElevenLabs 소연만, 작업실 Typecast+자주 사용 조합은 민서만 표시되는 실제 UI 결과를 확인했다. 메타데이터가 없는 클론은 미분류로 안전하게 처리한다.

- 증거: `tasks/evidence/tts-voice-classification/verification.json`과 `*-final.png`, 독립 A `a-*.png`.
- JS 문법, 프로토타입 Biome 7파일, git diff 공백 검사 통과.
- 타입 검사 5/5 cached, 빌드 4/4 cached 통과. 별도 HTML 동작은 위 브라우저 검증으로 확인했다.
- 전체 Biome의 기존 101 errors/68 warnings/2 infos는 Q-01로 유지. 이번 코드와 직접 생성한 증거 JSON은 검사/포맷을 마쳤다.

## 경계와 실행 기록

HTML·가상 성우 시연이며 실제 API 카탈로그·음성·인증·DB 실행 검증은 아니다. 분류·연결·즐겨찾기·자주 사용은 브라우저 로컬 저장, 메모·프리셋·클론은 여전히 세션 데이터다. 대본/프리셋 분류 편집과 채널 기본 프리셋·일괄 분류는 후속이다. 물리 터치 장치와 스크린리더는 직접 검증하지 않았다.

같은 세션의 앞선 Ego 캡처 timeout 근거로 agent-browser를 대안으로 사용했다. 사용자 browser overlay 표시를 주장하지 않는다. detector는 B에서 1회만 실행했고 탭 inset 경고 1건은 의도된 활성선, 색상 advisory 5건은 기존 토큰·대비 보정으로 유지했다. 자동 detector 결과를 실제 기능 검증과 구분했다. 검토용 browser 세션은 종료한다.

Questions skipped: 최종 P0/P1 우선 문제 0개이며 사용자 승인 범위의 수정·검증을 마쳤다.
