// packages/api/src/my-voice-rules.ts
// 내 보이스(클론)의 원본 조건과 이름 규칙(T13 계획 2.3, ADR 0011). 화면·CLI와 서버 계약(my-voice-contract.ts)이 같이 쓴다.
// zod·서버 모듈을 import하지 않는다(화면 번들에 들어간다, classification-rules.ts와 같다)
import { cleanText, type FieldProblem } from "./classification-rules";
import { codePoints } from "./providers/trial-options";

// 지금은 두 공급자만 받는다. 표(my_voice.provider)는 다섯 공급자를 받으므로 T13-b에서 여기만 넓힌다
export const CLONE_PROVIDERS = ["fish_audio", "gemini"] as const;
export type CloneProvider = (typeof CLONE_PROVIDERS)[number];

// 원본·동의 녹음 길이(초). Fish Audio는 앱 상한(공급자 권장 1~2분), Gemini 참조 10~30초, 동의 녹음은 앱 기준(스펙 3절)
export const CLONE_LIMITS = {
	fish_audio: { source: { min: 10, max: 60 } },
	gemini: { source: { min: 10, max: 30 }, consent: { min: 1, max: 20 } },
} as const;
// 브라우저가 만들고 서버가 다시 검사하는 WAV 형식: 24kHz 모노 16비트 PCM
export const CLONE_SAMPLE_RATE = 24_000;
export const CONSENT_VERSION = "2026-11-18";
// Gemini 동의 녹음에서 그대로 읽는 ko-KR 고정 문장(공급자 문서)
export const GEMINI_CONSENT_SENTENCE =
	"나는 이 음성의 소유자이며 구글이 이 음성을 사용하여 음성 합성 모델을 생성할 것을 허용합니다.";
export const MY_VOICE_NAME_MAX = 30;
const RAW_NAME_MAX = 1000;

// 서버가 받는 파일 크기(바이트). 60초 WAV 약 2.88MB, 20초 약 0.96MB. 합계 4MB로 Vercel 요청 본문 4.5MB 안이다(ADR 0011)
export const SOURCE_MAX = 3_000_000;
export const CONSENT_MAX = 1_000_000;

export function cloneLengthProblem<P extends CloneProvider>(
	provider: P,
	kind: keyof (typeof CLONE_LIMITS)[P],
	seconds: number,
): "short" | "long" | null {
	const range = CLONE_LIMITS[provider][kind] as { min: number; max: number };
	if (seconds < range.min) return "short";
	return seconds > range.max ? "long" : null;
}

// 이름: 원문 1,000자 상한, T6 이름 정리(cleanText) 뒤 1~30 코드 포인트
export function myVoiceNameProblem(
	raw: string,
): Exclude<FieldProblem, "bad_url"> | null {
	if (raw.length > RAW_NAME_MAX) return "too_long";
	const name = cleanText(raw);
	if (!name) return "empty";
	return codePoints(name) > MY_VOICE_NAME_MAX ? "too_long" : null;
}
