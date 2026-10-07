import type { ProviderId } from "./contract";

// 오디오 src에 넣어도 되는 공급자 샘플 호스트(T3·T4 실측). 목록 변환과 보관함 담기 입력 검사(T7)가 함께 쓴다.
// 화면 번들에 들어가도 되는 값만 둔다(SDK·서버 모듈 import 없음)
export const SAMPLE_HOST = {
	typecast: /(^|\.)typecast\.ai$/,
	elevenlabs: /^(storage\.googleapis\.com|([a-z0-9-]+\.)*elevenlabs\.io)$/,
	fish_audio: /(^|\.)fish\.audio$/,
	// Airy 공개 카탈로그 샘플(2026-10-07 실측 assets.airy.so 하나)
	airy: /^assets\.airy\.so$/,
} as const satisfies Record<ProviderId, RegExp>;
