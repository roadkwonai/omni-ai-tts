import type { ProviderId } from "./contract";

// 오디오 src에 넣어도 되는 공급자 샘플 호스트(T3·T4 실측). 목록 변환과 보관함 담기 입력 검사(T7)가 함께 쓴다.
// 화면 번들에 들어가도 되는 값만 둔다(SDK·서버 모듈 import 없음)
export const SAMPLE_HOST = {
	typecast: /(^|\.)typecast\.ai$/,
	elevenlabs: /^(storage\.googleapis\.com|([a-z0-9-]+\.)*elevenlabs\.io)$/,
	fish_audio: /(^|\.)fish\.audio$/,
	// Airy 공개 카탈로그 샘플(2026-10-07 실측 assets.airy.so 하나)
	airy: /^assets\.airy\.so$/,
	// Gemini 대표 성우의 참고 음성(Google Cloud 문서의 Chirp 3 HD 한국어, 2026-10-13 HEAD 30개 200). 경로도 본다(SAMPLE_PATH)
	gemini: /^docs\.cloud\.google\.com$/,
} as const satisfies Record<ProviderId, RegExp>;

// 한 호스트에 다른 파일도 있는 공급자는 경로 접두까지 본다(T7.6 스펙 2절). 없으면 경로를 보지 않는다
const SAMPLE_PATH: Partial<Record<ProviderId, string>> = {
	gemini: "/text-to-speech/docs/audio/",
};

// 샘플 주소가 그 공급자의 허용 호스트(와 경로)인가. URL이 경로를 정규화하므로 '..'로 벗어난 주소는 접두가 맞지 않는다.
// 포트·사용자 정보가 붙은 주소는 거른다(모든 공급자 공통). https 검사는 계약(httpsUrl)이 한다
export function isSampleUrl(provider: ProviderId, raw: string): boolean {
	if (!URL.canParse(raw)) return false;
	const url = new URL(raw);
	return (
		url.port === "" &&
		url.username === "" &&
		url.password === "" &&
		SAMPLE_HOST[provider].test(url.hostname) &&
		url.pathname.startsWith(SAMPLE_PATH[provider] ?? "/")
	);
}
