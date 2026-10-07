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

// 화면 전체가 쓰는 공급자 순서(카드·보관함 필터)
export const PROVIDER_IDS = [
	"typecast",
	"elevenlabs",
	"fish_audio",
	"airy",
] as const satisfies readonly ProviderId[];

// 화면 전체가 쓰는 공급자 표시 이름
export const PROVIDER_LABEL: Record<ProviderId, string> = {
	typecast: "Typecast",
	elevenlabs: "ElevenLabs",
	fish_audio: "Fish Audio",
	airy: "Airy",
};

// Airy 잔액(total_balance)은 소수가 올 수 있다. 한 자리까지 버림으로 보인다(실제보다 크게 보이지 않게, 연결 상태 브리프 카드 절).
// 카드와 내 문장 듣기 확인 창이 같은 형식을 쓴다(계획 리뷰 E4·D4)
const creditFormat = new Intl.NumberFormat("ko-KR", {
	maximumFractionDigits: 1,
	roundingMode: "trunc",
});
export const creditNumber = (remaining: number) =>
	creditFormat.format(Math.max(0, remaining));

export function recheckUntil(
	result: ProviderStatusResult | null | undefined,
): string | null {
	if (result?.status !== "rate_limit" || result.retryAfterSeconds === null)
		return null;
	return new Date(
		Date.parse(result.checkedAt) + result.retryAfterSeconds * 1000,
	).toISOString();
}
