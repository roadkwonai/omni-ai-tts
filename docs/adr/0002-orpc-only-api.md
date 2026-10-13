# API와 공급자 연동은 oRPC(TypeScript)로만 만들고 자체 음성 모델은 운영하지 않는다

API와 TTS 공급자(Typecast, ElevenLabs, Fish Audio) 연동은 모두 `packages/api`의 oRPC 프로시저와 TypeScript 모듈로 구현하고, Python 서비스는 두지 않는다. 음성 합성, 복제, 변환, 타임스탬프는 공급자 API에 맡긴다. 자체 TTS, 음성 변환, Whisper 모델은 운영하지 않는다. 이렇게 정한 이유는 세 가지다. 무거운 처리는 공급자 서버나 ffmpeg가 하므로 언어가 성능을 좌우하지 않는다. 공급자별 옵션 계약을 zod 스키마 하나로 화면까지 타입으로 이을 수 있다. Better Auth 세션과 소유권 검사를 한곳에 둘 수 있다.

구현 방식은 다음과 같다.
- 공급자 호출은 공식 TypeScript SDK(`@neosapience/typecast-js`, `@neosapience/typecast-autotag`, `@elevenlabs/elevenlabs-js`)를 쓴다.
- Fish Audio는 TypeScript SDK가 초기판(`fish-audio` 0.1.0)이라 REST를 직접 부른다.
- 결합, 무음 압축, 음량 정규화, 형식 변환 같은 오디오 후처리는 Node에서 ffmpeg를 부른다.
- 파형, 구간, 영상 편집 화면은 브라우저에서 만든다.
- 영상 렌더링 방식은 영상 기능을 설계할 때 정한다.

패키지 판은 2026-09-28에 npm과 PyPI에서 확인했다.

## Considered Options
- **API 전체를 Python(FastAPI 등)으로 만들기:** 공급자 Python SDK의 기능은 TypeScript SDK와 같다(ElevenLabs는 판까지 같다). 그런데도 BTS가 만든 Better Auth, oRPC, Drizzle 구성을 버리고 인증과 계약을 다시 짜야 한다.
- **공급자 연동만 Python 서비스로 떼기:** 공급자 옵션 계약을 zod와 Pydantic에 두 번 쓰거나 코드 생성을 따로 두어야 한다. Next에서 Python으로 가는 서버 간 인증과 오디오 중계 경로도 하나 더 생긴다. 도구, 배포, dev-cycle 규칙, 구현과 리뷰 에이전트가 두 벌이 되지만, 공급자 API만 부르는 동안에는 얻는 이점이 없다.
- **GPU Python 작업자로 자체 모델 운영:** 화자 분리, 음원 분리, 유사 목소리 찾기, 자체 TTS에서는 Python 생태계(pyannote.audio, demucs, librosa, PyTorch)가 앞선다. 하지만 자체 모델을 운영하지 않기로 했으므로 지금은 필요 없다.

## Consequences
- 공급자 API에 없는 음성 ML 기능(로컬 Whisper 정렬, 화자 분리, 유사 목소리 찾기, 배경음과 목소리 분리)은 공급자 기능으로 대신하거나 만들지 않는다. 자막 싱크는 생성 응답의 타임스탬프나 ElevenLabs forced alignment로 맞춘다.
- Vercel 함수의 제약은 언어와 무관하다. 본문은 4.5MB, 기본 실행 시간은 300초까지이고 GPU가 없다. 그래서 긴 음성 결합과 영상 렌더링은 Blob 저장소와 백그라운드 작업으로 설계한다.
- 에이전트와 스킬은 지금 구성을 그대로 쓴다(`prokit-implementer`, `prokit-reviewer`, `prokit-api`). Python 전용 에이전트와 dev-cycle 규칙은 두지 않는다.
- 다음 경우에는 이 결정을 다시 검토한다.
  - 자체 모델을 운영하기로 할 때
  - 공급자 API로 대신할 수 없는 음성 ML 기능이 요구사항에 들어올 때

  그때도 API 계층은 oRPC에 두는 안을 먼저 검토한다. Python은 oRPC가 만든 작업만 처리하는 GPU 작업자로 붙이고, 인증과 소유권 판단은 oRPC에 남긴다.
