import type {
	ConnectionStatus,
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
	"gemini",
] as const satisfies readonly ProviderId[];

// 화면 전체가 쓰는 공급자 표시 이름
export const PROVIDER_LABEL: Record<ProviderId, string> = {
	typecast: "Typecast",
	elevenlabs: "ElevenLabs",
	fish_audio: "Fish Audio",
	airy: "Airy",
	gemini: "Gemini",
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

// Gemini는 잔액 조회 API가 없다(research 8절). 정상·요청 제한·한도 부족에서만 잔액 자리에 이 한 줄을 보인다(T7.6 스펙 5절, 사용자 결정 2026-10-13)
const BALANCE_NOTE_STATUSES: readonly ConnectionStatus[] = [
	"connected",
	"rate_limit",
	"quota",
];
export function balanceNote(result: ProviderStatusResult): string | null {
	return result.provider === "gemini" &&
		BALANCE_NOTE_STATUSES.includes(result.status)
		? "잔액 조회를 제공하지 않아요. 사용량·한도는 Google AI Studio에서 확인해 주세요."
		: null;
}

// 키 오류·권한 부족·한도 부족의 원인 문구. Gemini의 확인 장소는 Google AI Studio다(스펙 D5). 다른 공급자는 대시보드·플랜 문구 그대로다
export function causeText(
	provider: ProviderId,
	status: ConnectionStatus,
): string | null {
	const name = PROVIDER_LABEL[provider];
	const gemini = provider === "gemini";
	switch (status) {
		case "provider_auth":
			return `키가 틀렸거나 만료됐어요. ${gemini ? "Google AI Studio" : `${name} 대시보드`}에서 키를 확인해 주세요.`;
		case "no_permission":
			return gemini
				? "키는 맞지만 이 키로 Gemini API를 쓸 수 없어요. Google AI Studio에서 키의 프로젝트 설정을 확인해 주세요."
				: `키는 맞지만 사용량 조회 권한이 없어요. ${name} 대시보드에서 키 권한을 확인해 주세요.`;
		case "quota":
			return gemini
				? "Gemini 결제나 한도 조건에 걸렸어요. Google AI Studio에서 확인해 주세요."
				: `남은 사용량이 없어요. ${name}에서 플랜이나 충전 상태를 확인해 주세요.`;
		default:
			return null;
	}
}
