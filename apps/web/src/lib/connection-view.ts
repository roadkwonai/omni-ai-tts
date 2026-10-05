import type {
	ProviderId,
	ProviderStatusResult,
} from "@tts-pilot-app/api/providers/contract";

export type QueryState = {
	data?: ProviderStatusResult;
	isError: boolean;
	errorUpdatedAt: number;
};

// 조회 자체가 실패하면(자체 서버 500, 연결 끊김, CSRF 403) 확인 실패와 같은 모양으로 보인다(T2 스펙 4절).
// 데이터 없이 실패한 조회를 다시 확인하는 동안 query-core(5.103.2 fetchState)는 오류를 지우고 pending으로 돌린다.
// errorUpdatedAt은 남으므로 그때도 확인 실패를 유지한다(첫 확인 중으로 돌아가지 않게, 연결 상태 브리프 6절).
export function toView(
	provider: ProviderId,
	query: QueryState,
): ProviderStatusResult | undefined {
	const failed =
		query.isError || (query.data === undefined && query.errorUpdatedAt > 0);
	if (!failed) return query.data;
	return {
		provider,
		status: "check_failed",
		quota: null,
		providerCode: null,
		retryAfterSeconds: null,
		checkedAt: new Date(query.errorUpdatedAt).toISOString(),
	};
}

// 사용량 초기화 시각이 지금보다 뒤일 때만 보인다(CS-08). 지난 시각은 공급자가 그대로 주는 값이다(무료 플랜으로 보임).
export const isUpcoming = (at: string, now = Date.now()): boolean =>
	Date.parse(at) > now;

// 화면 전체가 쓰는 공급자 표시 이름
export const PROVIDER_LABEL: Record<ProviderId, string> = {
	typecast: "Typecast",
	elevenlabs: "ElevenLabs",
	fish_audio: "Fish Audio",
};
