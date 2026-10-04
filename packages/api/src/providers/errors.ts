import { ORPCError } from "@orpc/server";
import { ZodError } from "zod";

import type {
	ConnectionStatus,
	ProviderErrorData,
	ProviderFailure,
	ProviderId,
	ProviderStatusResult,
	RemainingQuota,
	VoiceListResult,
} from "./contract";
import { remainingQuotaSchema } from "./contract";

// 공급자 HTTP 실패의 사유. tts-provider 오류 매핑 표의 reason에 no_permission을 더했다. T3부터 목록·생성 호출도 이 판정을 쓴다.
export type ProviderErrorReason =
	| "provider_auth"
	| "no_permission"
	| "quota"
	| "rate_limit"
	| "provider_input"
	| "provider_error";

// ElevenLabs 키 권한 부족. 403 insufficient_permissions는 공식 오류 표, 401 missing_permissions는 비공식 자료다(미실측).
const PERMISSION_CODES = new Set([
	"missing_permissions",
	"insufficient_permissions",
]);

// 표에 없는 상태 코드(3xx, 404 등)는 null이다. 확인 호출에서는 확인 실패로 보인다.
export function reasonFromHttp(
	status: number,
	codes: readonly string[] = [],
): ProviderErrorReason | null {
	if (status === 401 || status === 403) {
		return codes.some((code) => PERMISSION_CODES.has(code))
			? "no_permission"
			: "provider_auth";
	}
	if (status === 402) return "quota";
	if (status === 429) return "rate_limit";
	if (status === 400 || status === 422) return "provider_input";
	if (status >= 500 && status <= 599) return "provider_error";
	return null;
}

const RETRY_SECONDS = /^[1-9]\d{0,5}$/;

// Retry-After는 1~999999초의 정수일 때만 쓴다. 0, 너무 큰 값, HTTP 날짜 형식이거나 없으면 null이다.
export function retryAfterSeconds(header: string | null): number | null {
	const value = header?.trim() ?? "";
	return RETRY_SECONDS.test(value) ? Number(value) : null;
}

// 공급자가 HTTP 오류로 답했다는 사실만 담는다. SDK 오류 객체(요청 헤더와 키가 들어 있을 수 있다)를 밖으로 넘기지 않으려고 바꿔 담는다.
export class ProviderHttpError extends Error {
	override name = "ProviderHttpError";
	readonly status: number;
	readonly codes: readonly string[];
	readonly retryAfter: string | null;

	constructor(
		status: number,
		codes: readonly string[] = [],
		retryAfter: string | null = null,
	) {
		super(`HTTP ${status}`);
		this.status = status;
		this.codes = codes;
		this.retryAfter = retryAfter;
	}
}

export type CheckOutcome = {
	status: "connected" | "quota";
	quota: RemainingQuota;
};

export type ProviderClient = {
	checkStatus: () => Promise<ProviderStatusResult>;
	// 공개 성우 목록. Typecast는 T3, ElevenLabs·Fish Audio는 T4·T5에서 채운다
	listVoices?: () => Promise<VoiceListResult>;
};

export const CHECK_TIMEOUT_MS = 10_000;

// 검증 이슈의 경로 배열(zod 키, 표준 스키마의 { key })을 "a.b" 문자열로 만든다.
export const pathToString = (
	path: readonly (PropertyKey | { key: PropertyKey })[] | undefined,
) =>
	(path ?? [])
		.map((key) => String(typeof key === "object" ? key.key : key))
		.join(".");

// 응답 검증 실패의 필드 경로만 뽑는다(zod issues[].path, ElevenLabs SDK ParseError errors[].path). 값과 메시지는 뽑지 않는다.
function invalidPaths(error: unknown): string[] {
	const { issues, errors } = (error ?? {}) as {
		issues?: unknown;
		errors?: unknown;
	};
	const list = Array.isArray(issues)
		? issues
		: Array.isArray(errors)
			? errors
			: [];
	const paths = list.flatMap((item: { path?: unknown }) =>
		Array.isArray(item?.path) ? [pathToString(item.path)] : [],
	);
	return [...new Set(paths)];
}

// 목록 로그의 필드 이름. 배열 위치(0, 1, …)를 빼고 같은 이름은 한 번만, 5개까지 둔다(성우 수만큼 길어지지 않게).
// 뿌리 수준 실패(배열이 아님 등)는 경로가 비어 (root)다. 연결 확인(runCheck) 로그는 invalidPaths를 그대로 쓴다.
export function fieldNames(errors: readonly unknown[]): string[] {
	const names = errors.flatMap(invalidPaths).map(
		(path) =>
			path
				.split(".")
				.filter((key) => !/^\d+$/.test(key))
				.join(".") || "(root)",
	);
	return [...new Set(names)].slice(0, 5);
}

// 공급자, 오류 이름, 검증에 실패한 필드 경로만 한 줄 남긴다. 오류 객체·값·메시지는 남기지 않는다.
function logFailure(prefix: string, error: unknown, paths: readonly string[]) {
	const name = error instanceof Error ? error.name : typeof error;
	console.error(
		`${prefix}: ${name}${paths.length > 0 ? ` (${paths.join(", ")})` : ""}`,
	);
}

// 10초가 지나 끊었다. 응답을 받지 못했으므로 처리 여부를 모른다(unknown_outcome).
export class ProviderTimeoutError extends Error {
	override name = "ProviderTimeoutError";
}

// 공급자 호출 공통 10초 제한. 신호를 받지 못하는 SDK(Typecast)도 같은 시각에 끊기도록 경주시킨다.
// 끊긴 요청은 뒤에서 끝까지 돌 수 있다(조회라 괜찮다).
// timedOut의 abort 리스너가 call보다 먼저 등록되므로, 신호로 끊긴 fetch의 AbortError보다 늘 먼저 거절한다.
async function withTimeout<T>(
	call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	// AbortSignal.timeout()은 vitest 가짜 타이머로 진행되지 않아 setTimeout을 쓴다.
	const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
	const timedOut = new Promise<never>((_, reject) => {
		controller.signal.addEventListener(
			"abort",
			() => reject(new ProviderTimeoutError()),
			{ once: true },
		);
	});
	try {
		return await Promise.race([call(controller.signal), timedOut]);
	} finally {
		clearTimeout(timer);
	}
}

// 확인 호출 공통 틀: 10초 제한, 재시도 없음, 공급자 문제는 던지지 않고 상태 값으로 돌려준다(T2 스펙 4절).
export async function runCheck(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<CheckOutcome>,
): Promise<ProviderStatusResult> {
	const empty = {
		provider,
		quota: null,
		providerCode: null,
		retryAfterSeconds: null,
	};
	try {
		const outcome = await withTimeout(call);
		// 공급자 값이 계약(Infinity·NaN 불가 등)을 어기면 프로시저 출력 검증이 500을 던지므로 여기서 확인 실패로 만든다.
		remainingQuotaSchema.parse(outcome.quota);
		return { ...empty, ...outcome, checkedAt: new Date().toISOString() };
	} catch (error) {
		const checkedAt = new Date().toISOString();
		if (error instanceof ProviderHttpError) {
			const reason = reasonFromHttp(error.status, error.codes);
			// 확인 호출의 입력 거절(400·422)과 표에 없는 상태는 확인 실패다.
			const status: ConnectionStatus =
				reason === null || reason === "provider_input"
					? "check_failed"
					: reason;
			return {
				...empty,
				status,
				// 권한 부족 코드가 있으면 그것을 먼저 보인다(공급자 오류 코드 줄).
				providerCode:
					error.codes.find((code) => PERMISSION_CODES.has(code)) ??
					error.codes[0] ??
					`HTTP ${error.status}`,
				retryAfterSeconds:
					status === "rate_limit" ? retryAfterSeconds(error.retryAfter) : null,
				checkedAt,
			};
		}
		// 시간 초과가 아닌 예상 밖 예외(연결 끊김, 응답 검증 실패 등)만 남긴다.
		if (!(error instanceof ProviderTimeoutError)) {
			logFailure(
				`[providerStatus] ${provider} 확인 실패`,
				error,
				invalidPaths(error),
			);
		}
		return { ...empty, status: "check_failed", checkedAt };
	}
}

// 사유별 oRPC 코드(T3 스펙 4절). UNAUTHORIZED·FORBIDDEN은 쓰지 않는다(클라이언트가 로그인 만료로 본다, tts-provider).
const FAILURE_CODE = {
	no_key: "PRECONDITION_FAILED",
	provider_auth: "BAD_GATEWAY",
	no_permission: "BAD_GATEWAY",
	quota: "BAD_GATEWAY",
	rate_limit: "TOO_MANY_REQUESTS",
	provider_error: "BAD_GATEWAY",
	unknown_outcome: "GATEWAY_TIMEOUT",
} as const satisfies Record<ProviderFailure, string>;

// 공급자 문제를 화면까지 보낼 오류. data에는 공급자와 사유만 담고 원래 오류(cause)를 붙이지 않는다.
export function providerError(provider: ProviderId, reason: ProviderFailure) {
	const data: ProviderErrorData = { provider, reason };
	return new ORPCError(FAILURE_CODE[reason], { data });
}

// 목록 조회 공통 틀(T3 스펙 3·4절): 10초 제한, 재시도 없음, 공급자 문제는 사유를 붙여 던진다.
export async function runList<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	try {
		return await withTimeout(call);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) {
			throw providerError(provider, "unknown_outcome");
		}
		if (error instanceof ProviderHttpError) {
			const reason = reasonFromHttp(error.status, error.codes);
			// 목록 조회의 입력 거절(400·422)과 표에 없는 상태는 공급자 장애로 보인다.
			throw providerError(
				provider,
				reason === null || reason === "provider_input"
					? "provider_error"
					: reason,
			);
		}
		const prefix = `[voiceList] ${provider} 목록 조회 실패`;
		// ponytail: 연결 끊김은 Node fetch의 TypeError("fetch failed")로 판정한다. 매핑 코드의 TypeError도 여기로 와 '응답하지 않아요'로 보일 수 있다. 오판이 보이면 cause.code(ECONNRESET 등)로 좁힌다.
		// 응답 모양 검증 실패와 JSON이 아닌 응답은 provider_error
		if (
			error instanceof TypeError ||
			error instanceof ZodError ||
			error instanceof SyntaxError
		) {
			logFailure(prefix, error, fieldNames([error]));
			throw providerError(
				provider,
				error instanceof TypeError ? "unknown_outcome" : "provider_error",
			);
		}
		// 예상 밖 예외(이미 사유를 붙인 ORPCError 포함)는 그대로 던진다. 사유가 없으면 500(오류 경계)이 된다.
		throw error;
	}
}
