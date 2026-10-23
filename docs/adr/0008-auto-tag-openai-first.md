# 0008. 자동 태그 텍스트 호출은 OpenAI를 먼저, Gemini는 보조로 부른다

- 상태: 결정(2026-10-23, 사용자 결정). 관련: [T10 스펙](../plans/tasks/T10-paragraph-studio.md) 16절, [ADR 0002](0002-orpc-only-api.md), [드라마 자동 태그 조사](../research/drama-acting-tags.md).

## 맥락
- 사용자 테스트에서 문단 작업실 '추천 받기'가 "추천 답을 받지 못했어요. 비용이 들었을 수 있어요"로 끝났다. 개발 서버 로그에 `POST /api/rpc/studioAutoTag 504 in 60s`가 두 번, `[rpc] GATEWAY_TIMEOUT gemini unknown_outcome`이 남았다. Gemini 텍스트 모델(`gemini-3.8-flash`)이 60초 안에 답하지 않았다.
- 10월 22일 드라마 실호출에서도 503(high demand)이 두 번 났고, 같은 요청 모양이 그날 200(9.8초)이었다. 요청 모양이 아니라 Gemini 쪽 지연으로 본다.
- 사용자 말: "gemini 는 openai 보조로 배치해서 openai 가 3번 정도 실패하면 gemini 로 시도하도록 해줘". 요청한 `gpt-6.1-luna`는 OpenAI 공식 모델 목록에 없어 사용자가 `gpt-6-luna`를 골랐다.

## 결정
- 자동 태그 텍스트 호출(`studioAutoTag`, `dramaAutoTag`)은 서버 `askSuggestions` 한 곳에서 OpenAI `gpt-6-luna`(Responses API, Structured Outputs)를 먼저 최대 3번 부르고, 끝내 실패하거나 OpenAI 키가 없으면 Gemini `gemini-3.8-flash`를 1번 부른다. 한 묶음의 공급자 호출은 최대 4번이다.
- 키·권한·결제·한도와 요청 거절은 다시 불러도 같으므로 OpenAI 남은 시도를 건너뛰고 바로 Gemini로 간다. 시도 사이에 기다리지 않는다.
- OpenAI는 REST를 `fetch`로 직접 부른다. `OPENAI_API_KEY`는 선택 민감값이다. OpenAI는 TTS 공급자가 아니라 `ProviderId`에 넣지 않는다.
- tts-provider의 "유료 호출은 자동으로 다시 하지 않는다"는 자동 태그 텍스트 호출에만 예외다. 화면은 지금처럼 실패한 묶음을 다시 보내지 않는다.

## 버린 안
- Gemini 시간 제한 늘리기: 60초를 넘겨도 서버리스 함수 시간과 사용자 기다림만 늘고 원인(Gemini 지연)은 남는다.
- OpenAI SDK(`openai` 패키지): 기본 재시도와 환경변수 대체가 호출 횟수와 키 출처를 흐린다. 도구 호출·스트리밍이 필요해지면 다시 본다.

## 결과
- 처리 여부 미확인(시간 초과)도 다시 부르므로 과금이 겹칠 수 있다. 한 묶음 최악은 OpenAI 3 × 45초 + Gemini 60초 = 195초다.
- 키가 두 개(`OPENAI_API_KEY`, `GEMINI_API_KEY`)다. 둘 다 없으면 `no_key`이고 호출은 0회다. Gemini 키가 없어 OpenAI 실패가 마지막이면 키·결제 문제를 `providerCode: "openai_account"`로 화면에 알린다. Gemini 키가 있으면 Gemini로 넘어가고 OpenAI 키 문제는 서버 로그(`[autoTag] openai 실패 1/3 provider_auth` 등)에만 남는다.
- 확인 창 모델 이름(`gpt-6-luna`)은 화면 글과 서버 상수가 따로 적혀 있다. 모델을 바꾸면 둘을 함께 고친다.
