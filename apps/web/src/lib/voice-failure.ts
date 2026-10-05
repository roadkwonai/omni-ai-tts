import { ORPCError } from "@orpc/client";
import type {
	ProviderErrorData,
	ProviderFailure,
	ProviderId,
} from "@tts-pilot-app/api/providers/contract";

import { PROVIDER_LABEL } from "./connection-view";

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

export type ProblemCopy = {
	title: string;
	description: string;
	connections: boolean;
	reload: boolean;
};
// 키 오류와 권한 부족은 같은 안내다(브리프 8절).
const authProblem = (name: string): ProblemCopy => ({
	title: `${name} 키를 확인해 주세요`,
	description: "키가 틀렸거나 쓸 수 없는 키예요.",
	connections: true,
	reload: true,
});
// 브리프 8절 화면 상태표. {공급자}는 그 탭(묶음)의 공급자다.
const PROBLEM: Record<ProviderFailure, (name: string) => ProblemCopy> = {
	no_key: (name) => ({
		title: `${name} 키가 없어요`,
		description: "서버 환경변수에 키를 넣고 개발 서버를 다시 켜 주세요.",
		connections: true,
		reload: false,
	}),
	provider_auth: authProblem,
	no_permission: authProblem,
	quota: (name) => ({
		title: `${name} 사용량이 부족해요`,
		description: "남은 사용량을 연결 상태에서 확인해 주세요.",
		connections: true,
		reload: true,
	}),
	rate_limit: () => ({
		title: "요청이 많아 잠시 막혔어요",
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	}),
	provider_error: (name) => ({
		title: `${name}에 문제가 생겼어요`,
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	}),
	unknown_outcome: (name) => ({
		title: `${name}가 응답하지 않아요`,
		description: "잠시 뒤 다시 불러와 주세요.",
		connections: false,
		reload: true,
	}),
};

export const problemCopy = (
	provider: ProviderId,
	failure: ProviderFailure,
): ProblemCopy => PROBLEM[failure](PROVIDER_LABEL[provider]);
