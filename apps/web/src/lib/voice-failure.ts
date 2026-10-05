import { ORPCError } from "@orpc/client";
import type {
	ProviderErrorData,
	ProviderFailure,
} from "@tts-pilot-app/api/providers/contract";

// 화면이 안내를 고르는 사유(스펙 4절). 사유가 늘면 타입 검사가 이 표를 고치게 한다.
const KNOWN = {
	no_key: true,
	provider_auth: true,
	no_permission: true,
	quota: true,
	rate_limit: true,
	provider_error: true,
	unknown_outcome: true,
} as const satisfies Record<ProviderFailure, true>;

// 화면 안에서 보일 실패. 그 밖(500, 연결 끊김, 모르는 사유)은 null이라 오류 경계로 던진다.
// 사유는 서버가 준 문자열이라 객체 기본 속성 이름(constructor 등)에 속지 않게 Object.hasOwn으로 본다.
export function failureOf(
	error: unknown,
): ProviderFailure | "unauthorized" | null {
	if (!(error instanceof ORPCError)) return null;
	if (error.code === "UNAUTHORIZED") return "unauthorized";
	const reason = (error.data as Partial<ProviderErrorData> | undefined)?.reason;
	return reason !== undefined && Object.hasOwn(KNOWN, reason) ? reason : null;
}

// 429 Retry-After로 정한 다음 호출 가능 시각(T4 스펙 4절). 없으면 null
export function retryAtOf(error: unknown): string | null {
	if (!(error instanceof ORPCError)) return null;
	const retryAt = (error.data as Partial<ProviderErrorData> | undefined)
		?.retryAt;
	return typeof retryAt === "string" ? retryAt : null;
}
