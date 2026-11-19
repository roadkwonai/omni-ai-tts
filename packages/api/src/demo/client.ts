import type { ProviderId } from "../providers/contract";
import {
	logFailure,
	type ProviderClient,
	providerError,
	trialError,
} from "../providers/errors";
import type { Providers } from "../providers/index";

// 공개 데모(APP_MODE=demo, T15-a2)의 공급자 클라이언트. 공급자를 부르지 않는다(fetch 없음).
// 생성은 미리 둔 데모 샘플 바이트, 연결 상태는 no_key, 목록·억양·모델은 공급자 오류(라우터가 캐시 적중이면 캐시를 쓴다).
// 목록의 캐시 미스는 voiceList 라우터가 빈 페이지로 바꾼다(T15-12). 여기서 빈 페이지를 주면 캐시에 행이 쓰인다.
// 클론·자동 태그·단건 조회 메서드는 두지 않는다: 기존 라우터가 no_key로 닫거나 건너뛴다.
export type DemoSample = ProviderId | "drama";
export type LoadSample = (name: DemoSample) => Promise<Uint8Array>;

export function createDemoProviders(loadSample: LoadSample): Providers {
	// 샘플 파일이 없으면(배포에 안 실림 등) 500이 아니라 공급자 오류로 실패한다. 로그는 오류 이름만
	const sample = (provider: ProviderId, name: DemoSample) =>
		loadSample(name).catch((error: unknown) => {
			logFailure(`[demo] ${name} 샘플 읽기 실패`, error, []);
			throw trialError(provider, "provider_error");
		});
	const client = (provider: ProviderId): ProviderClient => {
		const unavailable = async (): Promise<never> => {
			throw providerError(provider, "provider_error");
		};
		return {
			demo: true,
			checkStatus: async () => ({
				provider,
				status: "no_key",
				quota: null,
				providerCode: null,
				retryAfterSeconds: null,
				checkedAt: new Date().toISOString(),
			}),
			listVoices: unavailable,
			listAccents: unavailable,
			listModels: unavailable,
			synthesize: () => sample(provider, provider),
		};
	};
	return {
		typecast: client("typecast"),
		elevenlabs: client("elevenlabs"),
		airy: client("airy"),
		gemini: client("gemini"),
		fish_audio: {
			...client("fish_audio"),
			synthesizeScene: async () => ({
				pcm: await sample("fish_audio", "drama"),
				segments: null,
			}),
		},
	};
}
