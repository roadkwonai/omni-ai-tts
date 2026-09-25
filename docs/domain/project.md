# 프로젝트 개관

이 문서는 서비스의 현재 모습을 적는다. 용어는 `CONTEXT.md`, 결정 이유는 `docs/adr/`에 둔다. 기능을 바꾼 라운드는 닫기 전에 이 문서를 갱신하거나 대조표에 `N/A: 사유`를 적는다.

## 한 줄 요약
무엇을, 누구를 위해 제공하는지 한 문장.

## 사용자와 권한
| 역할 | 할 수 있는 일 | 확인 위치 |
|---|---|---|
| 방문자 | 로그인, 가입 | `apps/web/src/app/login` |
| 로그인 사용자 | 자기 데이터만 조회와 변경 | `protectedProcedure` |

## 화면과 URL
| URL | 화면 | 보호 | 파일 |
|---|---|---|---|
| `/` | 홈 | 공개 | `apps/web/src/app/page.tsx` |
| `/login` | 로그인과 가입 | 공개 | `apps/web/src/app/login/page.tsx` |
| `/dashboard` | 대시보드 | 로그인 | `apps/web/src/app/dashboard/page.tsx` |

## API (oRPC)
| 프로시저 | 보호 | 입력 | 설명 |
|---|---|---|---|
| `healthCheck` | 공개 | 없음 | 상태 확인 |
| `privateData` | 로그인 | 없음 | 세션 확인 예시 |

## 데이터 모델과 코드 매핑
| 테이블 | 스키마 파일 | 소유자 컬럼 | 설명 |
|---|---|---|---|
| `user`, `session`, `account`, `verification` | `packages/db/src/schema/auth.ts` | 해당 없음 | Better Auth 생성물 (`pnpm auth:generate`) |

## 범위 밖
아직 하지 않기로 한 것.
