# 개인용 TTS 작업실 UI 우선 구현 계획

> 2026-09-29: 작업 1~6의 층별 순서는 [서비스 구현 로드맵](implementation-roadmap.md)의 기능별 TASK 순서로 바뀌었다. 이 문서의 데이터 계약, 검증 항목, Review Focus는 해당 TASK를 설계할 때 참고한다.

2026-09-26 HTML 기준 앱 기획·설계 요청의 검토안은 [실서비스 설계안](../briefs/tts-app-design.md)에서 확인한다. 7개 화면의 책임, 초안·저장·생성 상태, 데이터 경계와 기존 P0~P4 출시 순서를 정리했다. 설계안은 아직 사용자 검토 전이며 아래 작업을 구현 완료로 바꾸지 않는다.

> 실행자는 `PRODUCT.md`, 아래 Spec과 HTML을 함께 읽는다. 각 작업은 bts-dev-cycle로 열고 bts-ui → impeccable, bts-web, bts-verify를 적용한다. 구현 위임 시 superpowers:subagent-driven-development, 직접 구현 시 superpowers:executing-plans를 사용한다. 커밋·push·배포는 별도 요청 전 하지 않는다.

**Goal:** 개인 작업실에서 성우를 고르고 저장 대본의 숫자를 검수한 뒤 양사 TTS와 내 클론 보이스로 음성을 제작한다. 먼저 HTML로 화면·동작을 검토하고 Next.js UI에 옮긴다.

**Architecture:** HTML은 시각·상호작용 명세다. React 이관 시 화면을 목적별 컴포넌트로 나누고 모의 데이터와 서버 연결 경계를 명시한다. 이후 기존 Better Auth, oRPC, Drizzle 구조에 개인 데이터와 공급자 어댑터를 연결한다. 공개 가입·조직·결제 시스템은 만들지 않는다.

**Tech Stack:** 설계 시안 HTML/CSS/JavaScript, 로컬 Pretendard. 실제 앱은 기존 Next.js App Router, TypeScript, shadcn, oRPC, TanStack Query, Better Auth, Drizzle/Postgres.

**Spec:** [공급자 옵션과 제작 도구 확장](tts-provider-options-and-tools.md), [요구사항](tts-service-requirements.md), [HTML 화면 브리프](../briefs/tts-html-prototype.md), [제품 맥락](../../PRODUCT.md), [HTML 시안](../prototypes/tts-studio/index.html).

## 이번 산출물과 다음 구현의 구분

| 단계 | 이번 작업 | 다음 실제 앱 개발 |
|---|---|---|
| 참고 분석 | 지정 영상 구간, gowith153 공개 8대 가이드·이미지, Typecast/Vrew/ElevenLabs 공식 사용 흐름 | 공급자별 실제 계정 기능 확인 |
| 화면 설계 | 클릭 가능한 HTML과 화면/상태 계약 | Next.js 라우트·shadcn 컴포넌트 이관 |
| 데이터 | 시연용 브라우저 상태·샘플 대본 | 소유자 인증·DB 저장 |
| 숫자 교정 | 원문 비교와 승인 동작의 프로토타입 | 규칙 회귀 테스트와 실제 발음 평가 |
| 음성/클론 | 연결 전 안내와 처리 상태 시연 | 실제 샘플·API 합성·녹음/업로드·클론 생성 |

현재 HTML의 성우 5개는 가상 fixture이며 전체 카탈로그·자주 사용·실제 샘플 재생의 구현 증거가 아니다. 아래 작업 2와 요구사항 REQ-02~04의 상세 계약을 이관 기준으로 삼는다.

여섯 제작 도구의 최신 HTML 범위는 [제작 도구 브리프](../briefs/tts-production-tools.md)를 따른다. 별도 voice-tools/script-tools/prototype-media 모듈과 작업실 문단 계획을 실제 앱 이관 대상에 포함한다. 로컬 파일/녹음과 공급자 생성의 경계를 유지한다.

## Global Constraints

- 초기 사용자는 본인 한 명. 공개 가입·초대·조직·결제·사용자별 키 입력·사용자 관리 페이지는 P4다.
- 데이터에는 `userId`를 두고 세션에서만 소유자를 구한다. 소유자 외 접근 거부 fixture를 검증하되 공개 가입 제품까지 만들지 않는다.
- `(provider, voiceId)`로 성우를 식별한다. 모든 제공사 옵션을 하나의 공통 슬라이더 집합으로 억지 통합하지 않는다.
- API 키는 서버 환경변수에서만 읽는다. HTML·클라이언트 상태·로그·브라우저 저장소에 키를 넣지 않는다.
- 원문을 보존한다. 실제 전송할 발음용 대본의 길이로 생성 가능 여부를 판단한다. 초기 공통 2,000자 상한은 제품 제안으로 표기한다.
- API 생성과 클론 요청은 명시적인 사용자 행동에만 연결한다. 단순 청취·필터·설정 변경·다운로드가 새 유료 요청을 만들면 안 된다.
- 코드/정적 화면/실제 API/실제 발음 청취 검증을 별개로 보고한다.
- Wanted 시각 체계와 기존 Pretendard를 사용한다. 신규 제품 의존성은 자동 추가하지 않는다.

## 정보 구조

| 화면 | 주요 작업 | 초기 진입/복귀 규칙 | 후속 앱 경로 |
|---|---|---|---|
| 작업실 | 대본·성우·교정·생성 | 로그인 후 기본 진입. 다른 보관함으로 가도 편집 초안 보존 | `/studio` |
| 성우 보관함 | 전체 카탈로그·공급자 분류·즐겨찾기·자주 사용·메모 | 작업실 성우 선택과 동일 카탈로그, 선택 후 복귀 | `/voices` |
| 내 보이스 | 클론 등록·상태·시험 생성·삭제 | 생성 버튼으로 단계형 흐름 진입, 완료 후 작업실 사용 | `/voices/mine` |
| 대본 보관함 | 등록·수정·복제·삽입/교체 | 불러올 때 미저장 초안 처리 선택 | `/scripts` |
| 프리셋 | 설정 저장·복제·적용 | 대본은 바꾸지 않고 공급자/성우/설정 적용 | `/presets` |
| 채널·분류 | 채널/카테고리/타입 관리 | 삭제는 연결 해제, 성우·대본 자체는 유지 | `/library` |
| 연결 상태 | 제공사 준비 상태·오류 안내 | 키값 노출 없이 연결 가능 여부만 표시 | `/settings` |

프로토타입의 화면 이동은 로컬 UI 상태다. 앱 이관 시 화면 경로와 필터를 URL로 복원하며, 브라우저 뒤로 가기와 직접 진입을 지원한다.

## 화면 구조와 작업 우선순위

gowith153에서 참고하는 것은 한 작업면 안의 성우·대본·출력 연결이다. 초기 단일 성우 작업에서는 넓은 대본이 중요하므로 **내비게이션 / 성우 패널 / 대본·검수·결과**로 구성한다. 설정은 필요할 때 열고 결과 플레이어는 하단에 일관되게 둔다. 향후 문단·자막 편집 도입 시 세 번째 출력 패널을 확장할 수 있다.

작업실 첫 화면에는 콘텐츠 채널, 작업 제목, 현재 성우, 대본, 교정 행동, 생성 행동이 보인다. 추천 점수·통계·가격 카드·팀 전환기는 배치하지 않는다. 저장 대본·프리셋은 보관함 진입과 작업실 빠른 불러오기를 함께 제공한다.

390px 모바일은 세 열을 축소하지 않고 성우/대본/설정을 전환한다. 선택한 성우와 생성 상태는 요약으로 유지한다. 교정은 단일 열, 클론은 전체 화면에 가까운 단계형 패널이다.

### 참고 장면을 설계에 연결하는 표

| 근거 | 채택한 설계 | 범위 |
|---|---|---|
| 영상 1:56:04~22, 성우 카드 청취 후 선택 | 재생·선택·즐겨찾기 별도 버튼 | P0 |
| 영상 1:56:32~1:57:10, 원문→발음 비교와 인라인 편집 | 개별 교정 항목의 적용/유지/직접 수정, 원문 보존 | P0 |
| 영상 1:57:12~22, 검수 닫기와 다시 열기 | 닫기는 생성 승인이 아님. 검수 재개 가능 | P0 |
| 영상 1:58:16~1:59:26, 생성 중→마무리→완료 | 처리 상태 표시, 중복 클릭 차단, 스냅샷 | P0, 임의 퍼센트는 배제 |
| 영상 1:59:26~45, 플레이어·전체 자막 | 오디오와 최종 발음용 대본을 같은 흐름에서 확인 | 재생 P0, 동기화 자막 P2 |
| gowith153 화면/성우 가이드 | 성우·대본·출력을 작업실에서 연결, 필요한 설정 가까이 배치 | 단일 성우 P0, 문단 편집 P1 |
| gowith153 클론 화면 | 공급자 선택, 마이크/파일 대체, 이름·동의·필수 조건 | P0, 녹음 길이·형식은 API 문서 기준 |
| gowith153 가져오기·화자·감정·매칭·프로젝트·출력 가이드 | 전체 후보를 백로그로 보존 | 각각 P1-03~06, P2-01, P3-01~05, P1-01~02, P2-02~08 |
| Vrew 성우 설정 이미지 | 탐색 중 현재 성우를 잃지 않고 시험 동작과 적용을 구분 | P0 |
| Typecast/ElevenLabs 공식 가이드 | 모델별 설정, 성우·대본 재사용, 결과별 입력 보존 | P0, Studio 과금 정책 복사 금지 |

영상의 교정 범위 좌우 확장/축소는 단순 숫자 변환보다 세밀한 기능이다. P0에서는 후보 단위 직접 수정을 먼저 검증하고, 조사·단위까지 범위를 바꾸는 고급 편집은 P1-07에서 필요성을 검토한다. 이 장면을 아직 구현한 것처럼 체크하지 않는다.

## Review Focus

1. 숫자 교정 후 원문을 한 글자라도 수정했을 때 이전 위치에 교정이 잘못 적용되는 문제 → 작업 3에서 버전 불일치 검증.
2. ElevenLabs v3에 다른 모델의 설정을 그대로 보내는 문제 → 작업 4/6에서 capability 기반 옵션 검증.
3. 생성 중 성우·대본을 바꿨을 때 새 입력이 이전 결과인 것처럼 보이는 문제 → 작업 4에서 불변 스냅샷과 이전 결과 표시 검증.
4. 저장 실패/새로고침/불러오기 때문에 대본을 잃는 문제 → 작업 2에서 명시적 저장, 실패 알림, 초안과 원본 분리 검증.
5. 클론 검증 필요/삭제 대기를 사용 가능한 성우로 취급하는 문제 → 작업 5에서 상태 전이와 선택 차단 검증.

## 공통 UI 데이터 계약

실제 API 필드와 분리된 UI 타입을 `apps/web/src/features/tts/types.ts`에 둔다. 이 타입은 계획상의 계약이며 현재 구현됐다는 뜻이 아니다.

```ts
type Provider = "typecast" | "elevenlabs";
type VoiceRef = { provider: Provider; voiceId: string };
type VoiceOption = VoiceRef & {
  name: string;
  previewUrl: string | null;
  source: "catalog" | "clone";
  availability: "ready" | "verification-required" | "unavailable";
};
type Correction = {
  id: string;
  sourceVersion: number;
  start: number;
  end: number;
  original: string;
  suggestion: string;
  decision: "pending" | "apply" | "keep" | "manual";
  manualText?: string;
};
type GenerationSnapshot = {
  requestId: string;
  sourceText: string;
  spokenText: string;
  voice: VoiceRef;
  modelId: string;
  settings: Record<string, string | number | boolean>;
};
type GenerationState =
  | { status: "idle" }
  | { status: "submitting"; snapshot: GenerationSnapshot }
  | { status: "succeeded"; snapshot: GenerationSnapshot; audioUrl: string }
  | { status: "failed" | "unknown"; snapshot: GenerationSnapshot; message: string };
```

clone 처리 상태는 `draft / uploading / processing / verification-required / ready / failed / unknown / deleting / delete-failed`다. UI의 사용 가능 여부는 `ready`에만 연결한다. 임의 voice ID를 클라이언트에서 보내도 서버 소유권 확인을 생략하지 않는다.

## 작업 1 — 앱 셸과 시각 체계 이관

**파일:** 수정 `apps/web/src/app/layout.tsx`, `packages/ui/src/styles/globals.css`; 생성 `apps/web/src/app/studio/page.tsx`, `apps/web/src/features/tts/components/studio-shell.tsx`, `types.ts`, `fixtures.ts`.

- [ ] HTML의 토큰을 기존 CSS 변수와 매핑한다. 중복 디자인 시스템·두 번째 컴포넌트 라이브러리를 만들지 않는다.
- [ ] `lang="ko"`, 기존 Pretendard의 `next/font/local`, 제목/입력/숫자 표시 적용을 확인한다.
- [ ] 7개 화면의 내비게이션, 현재 위치, 보호 레이아웃을 만든다. 초기 소유자 계정의 진입만 설계하고 공개 가입을 닫는다.
- [ ] 1440/1024/390px에서 대본 공간, 모바일 메뉴, 긴 제목·빈 목록을 확인한다.

**완료:** HTML과의 화면 대조, 폰트 실제 로딩, 키보드 메뉴 진입. 타입/린트/빌드/Next 런타임, desktop/mobile 캡처. 아직 모의 데이터 단계라는 표시 유지.

## 작업 2 — 성우·대본·프리셋·분류 UI

성우 분류의 확정 UX는 [성우별 채널·분류 브리프](../briefs/tts-voice-classification.md)를 따른다. 성우 행의 그룹별 태그 → 우측 편집 패널(모바일 전체 화면)에서 다중 배정 → 별도 관리 화면에서 항목/연결 성우 관리 흐름이다. 작업실과 보관함 필터는 같은 성우 연결 데이터를 사용한다. 항목 이름과 별개인 고정 식별자, 공급자+성우 ID 경계를 유지한다. HTML에서는 로컬 저장으로 검토하고 앱 이관 시 소유자 DB에 저장한다.

**파일:** 생성 `apps/web/src/features/tts/components/{voice-picker,voice-library,script-library,preset-library,classification-manager}.tsx`, `apps/web/src/app/{voices,scripts,presets,library}/page.tsx`.

- [ ] 성우 목록은 공급자와 보기(전체/즐겨찾기/자주 사용/최근 사용)를 독립 결합한다. 작업실에 전체 성우 보기 진입을 둔다. ElevenLabs 계정 목록과 공개 라이브러리 범위를 표시한다.
- [ ] 공급자 유형/언어/성별/연령/억양/용도와 개인 카테고리/타입/채널/프리셋을 구분하고 제공되는 필드만 필터링한다. 검색·공급자·개인 분류를 결합한다. 다중 축 AND/동일 축 OR, 초기화, 결과 없음, 한 공급자 오류를 구현한다.
- [ ] 페이지/더 보기·끝·부분 오류·재시도를 구현하고 필터 변경 시 이전 페이지 응답을 무효화한다. 현재 로드된 일부 데이터만으로 전체 검색 완료를 표시하지 않는다.
- [ ] 즐겨찾기와 자주 사용 등록/해제를 독립 구현하고 공급자별로 복원한다. 최근 사용/사용 횟수 정렬은 성공한 생성 기록에만 근거한다. 앱 등록이 공급자 계정 추가를 호출하지 않게 한다.
- [ ] 샘플 버튼·성우 선택·즐겨찾기·자주 사용을 독립 행동으로 만든다. 샘플 없는 항목은 생성과 구분한다.
- [ ] 대본 등록/수정/복제/삭제/불러오기와 삽입/교체를 구현한다. 저장 실패 시 성공으로 표시하지 않는다.
- [ ] 프리셋 적용값을 미리 보여 주고 성우/모델 설정을 적용한다. 현재 대본은 그대로 둔다.
- [ ] 분류/채널 삭제 전 연결 수와 해제 범위를 보여 준다. 원본 성우·대본 삭제와 구분한다.

**검증:** 3페이지 이상에서 마지막 성우 검색/선택, 계정/공개 목록 중복, 양사 동명 성우, 빠른 필터 전환의 늦은 응답, 두 개인 목록의 독립 저장/복원, 성공·실패·중복 생성 집계, 샘플 없는 항목과 제한된 성우, 예시 0/1/50개, 100자 이름, 한글 검색, 빈 필터, 저장 중 이탈, 미저장 교체, 프리셋 성우 사용 불가, 샘플 동시 재생 억제. 저장 서비스는 모의 성공/실패를 주입해 검증한다.

## 작업 3 — 숫자 검수 UI와 교정 규칙

**파일:** 생성 `apps/web/src/features/tts/components/{script-editor,pronunciation-review}.tsx`, `packages/api/src/services/pronunciation/{normalize,normalize.test}.ts`(API 연결 단계에서 작성).

- [ ] 화면 단계에서는 `Correction[]` fixture로 원문·제안·적용/유지/수정·되돌리기를 먼저 구현한다.
- [ ] 실제 규칙은 날짜/전화/시간→단위→일반 숫자 순서로 만들고 문서의 숫자 수용표를 테스트한다.
- [ ] `sourceVersion`이 바뀌면 이전 제안을 무효화한다. 원문 수정 즉시 재검수가 필요함을 알린다.
- [ ] 미검수 숫자는 생성 전에 알리고 원문 유지 선택을 제공한다. 실제 발음용 대본과 2,000자 경계를 확인한다.

**핵심 테스트 계약:** `2026년 6월 10일`의 유월, `3시/3분`의 세/삼, `010-1234-5678`의 자릿수, `GPT-4o` 유지, 겹친 범위 중복 없음, 이미 한글인 문장 불변. 위치별 중복 숫자를 서로 독립 검수한다.

## 작업 4 — 생성 설정·결과·실패 흐름 UI

2026-09-26 보완: 속도/출력 형식만으로 완료하지 않는다. [옵션 조사와 흐름 계약](tts-provider-options-and-tools.md)의 모든 단일 TTS 요청 필드를 표시/조건부 표시/서버 자동/별도 기능으로 매핑한다. Typecast 감정·피치·음량·무음 제거와 ElevenLabs 안정성·유사성·스타일·발음/문맥 등은 모델별 근거에 따라 제공한다.

**파일:** 생성 `apps/web/src/features/tts/components/{generation-settings,generation-result,provider-status}.tsx`, `apps/web/src/features/tts/{capabilities,generation-state}.ts`, `apps/web/src/app/settings/page.tsx`.

- [ ] `provider + modelId`별 지원 옵션에서 폼을 만든다. 모델 전환 시 비호환 값 초기화와 적용값 요약을 제공한다.
- [ ] 요청 직전 `GenerationSnapshot`을 만들고 제출 중 버튼 중복을 막는다.
- [ ] 결과는 해당 스냅샷과 연결한다. 현재 입력이 바뀌면 이전 결과 표시를 붙인다.
- [ ] 기본 샘플 재생 / 내 대본 시험 생성 / 기존 결과 재생을 다른 행동으로 유지한다.
- [ ] 미연결·인증 실패·잔액 부족·요청 제한·타임아웃/처리 미확인을 각각 조치 문구와 연결한다. 응답 유실에 자동 재생성하지 않는다.

**검증:** 0/2000/2001자, 교정 후 길이 증가, 선택 없음, 빠른 두 번 클릭, 제출 중 편집, 공급자 전환, 이전 결과 다운로드. 실제 API 전에는 고정 오디오를 공급자 결과인 것처럼 표시하지 않는다.

## 작업 5 — 내 클론 보이스 UI

**파일:** 생성 `apps/web/src/app/voices/mine/page.tsx`, `apps/web/src/features/tts/components/{clone-list,clone-create,clone-source-input,clone-status}.tsx`.

- [ ] 이름/공급자→파일 또는 녹음→원본 청취·본인 음성 확인→처리/검증→시험 생성 순서로 구현한다.
- [ ] 마이크 권한은 녹음 시작 행동에 요청하고 종료·취소·이탈 때 트랙을 정리한다. 거부 시 파일 대체를 제공한다.
- [ ] 실제 공급자별 제한을 가져와 UI에 표시하고 서버에서도 재검사한다. 브라우저 코덱과 API 코덱의 차이를 처리한다.
- [ ] 검증 필요/처리 미확인/슬롯 부족 상태를 만들어 확인된 `ready`만 작업실에 선택되게 한다.
- [ ] 삭제 영향과 연결 프리셋을 표시한다. 원격 삭제 실패는 삭제 완료가 아니라 대기 상태다.

**검증:** 원본/합성 샘플 구분, ESC/취소/모바일, 빈 이름, 파일 없음/무음/초과/지원 불가, 동의 없음, 검증 필요, 삭제 실패, 마이크 해제. HTML에서는 모의 흐름까지만 보여 준다.

## 작업 6 — UI 확정 후 개인 데이터와 실 API 연결

**파일 경계:** `packages/db/src/schema`와 생성 migration, `packages/api/src/routers`, `packages/api/src/services/tts/{typecast,elevenlabs,types}.ts`, 기존 `apps/web/src/services.ts`.

- [ ] 기존 소유자 인증과 개인 데이터 CRUD를 연결한다. 공개 가입 차단과 데이터 `userId` 조건을 테스트한다.
- [ ] Typecast llms.txt → 현재 API 계약 재확인 → 목록·샘플·한국어 생성·다운로드를 연결한다.
- [ ] ElevenLabs 계정 목록과 공개 Voice Library의 각 페이지 계약·필터·샘플·이용 조건을 연결하고 모델별 차이를 검증한다.
- [ ] 성우별 개인 설정에 즐겨찾기/자주 사용을 독립 저장하고 생성 기록으로 최근/사용 횟수를 조회한다. 3페이지 이상의 마지막 항목 탐색과 재로그인 복원을 검증한다.
- [ ] 두 공급자의 본인 간편 클론 등록·상태·시험 합성·삭제를 검증한다.
- [ ] 제공사 실 권한/음성/코덱·한국어 숫자 청취를 검수한다. UI 모의 시나리오 통과를 실 기능 완료로 바꾸지 않는다.

**다음 단계 조건:** REQ-01~13 전체 수용 기준, 타입/린트/빌드/소유권 fixture/교정 회귀/실 API 증거를 확보한 후 P1 상세 설계를 시작한다. 상세 서버·DB 설계는 이 단계에서 bts-api/bts-db로 진행한다.

## 향후 공개 서비스 확장 경계

| 지금 유지할 최소 기반 | 지금 만들지 않을 것 | 확장할 때 결정할 것 |
|---|---|---|
| 개인 데이터 `userId`, 소유자 인증 | 공개 가입/초대/역할 UI | 가입·인증·복구·차단·계정 삭제 정책 |
| 공급자 어댑터와 서버 키 접근 지점 | 사용자별 키 저장소·키 관리 화면 | BYOK 또는 서비스 공용 키, 암호화/회전/삭제 |
| 요청 ID·공급자별 사용 기록 | 결제·구독·상품·크레딧 지갑 | 비용 책임·한도·실패 정산·환불 |
| 클론 소유권·동의·삭제 상태 | 조직·팀·공유 리소스 | 소유권 이전·공유·조직 간 격리 |

## 참고 출처 추적

- [gowith153 화면 심층 검토](../research/gowith-ux-review.md): 가이드 8개와 실제 이미지가 증명하는 범위.
- [서비스 비교](../research/tts-service-comparison.md): Typecast/Vrew/ElevenLabs 제품·공식 사용법 관찰.
- [영상 구간 분석](../research/tts-video-detailed.md): 다운로드·전사·장면 근거와 불확실성.
- [공식 API 조사](../research/tts-references.md): API 계약과 미확인 조건.

HTML 검토에서 확정한 내용을 브리프에 반영하고 작업 1부터 이관한다. HTML 파일을 JSX에 통째로 붙이지 않고, 의미·상태·토큰을 옮긴다. Next.js 이관과 실제 TTS 연결은 이 계획의 후속 실행이며 이번 HTML 산출물과 구분한다.
