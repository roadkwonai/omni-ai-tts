import { ORPCError } from "@orpc/server";
import { ZodError } from "zod";

import type { SceneAudio, SceneRequest } from "../drama-script";
import type {
	Accent,
	ConnectionStatus,
	ProviderErrorData,
	ProviderFailure,
	ProviderId,
	ProviderStatusResult,
	RemainingQuota,
	Voice,
	VoiceListInput,
	VoiceListPage,
	VoiceSource,
} from "./contract";
import { remainingQuotaSchema } from "./contract";
import type {
	TrialErrorData,
	TrialFailure,
	TrialModelRate,
} from "./trial-contract";
import type { TrialRequest } from "./trial-options";

// 공급자 HTTP 실패의 사유. tts-provider 오류 매핑 표의 reason에 no_permission을 더했다. T3부터 목록·생성 호출도 이 판정을 쓴다.
export type ProviderErrorReason =
	| "provider_auth"
	| "no_permission"
	| "quota"
	| "rate_limit"
	| "provider_input"
	| "provider_error";

// 키 권한 부족. ElevenLabs 403 insufficient_permissions는 공식 오류 표, 401 missing_permissions는 비공식 자료다(미실측).
// Gemini(Google) 403 PERMISSION_DENIED는 키에 그 API·리소스 권한이 없다(API 사용 안 함 등, T7.6 스펙 6절)
const PERMISSION_CODES = new Set([
	"missing_permissions",
	"insufficient_permissions",
	"PERMISSION_DENIED",
]);

// 표에 없는 상태 코드(3xx, 404 등)는 null이다. 확인 호출에서는 확인 실패로 보인다.
export function reasonFromHttp(
	status: number,
	codes: readonly string[] = [],
): ProviderErrorReason | null {
	// Google은 틀린 키를 400 INVALID_ARGUMENT + 이유 API_KEY_INVALID로 답한다(T7.6 스펙 6절). 상태보다 먼저 본다
	if (codes.includes("API_KEY_INVALID")) return "provider_auth";
	if (status === 401 || status === 403) {
		return codes.some((code) => PERMISSION_CODES.has(code))
			? "no_permission"
			: "provider_auth";
	}
	if (status === 402) return "quota";
	if (status === 429) return "rate_limit";
	// Google 400 FAILED_PRECONDITION은 결제·지역 같은 계정 조건이다(입력 거절이 아니다). 확정은 실측 뒤(T7.6 스펙 6절)
	if (status === 400 && codes.includes("FAILED_PRECONDITION")) return "quota";
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

// 조회가 그 상태(404 등)로 실패하면 '없음'(null), 그 밖의 오류는 그대로 던진다
export const nullOnStatus = <T>(
	run: Promise<T>,
	...statuses: number[]
): Promise<T | null> =>
	run.catch((error: unknown) => {
		if (error instanceof ProviderHttpError && statuses.includes(error.status))
			return null;
		throw error;
	});

export type CheckOutcome = {
	status: "connected" | "quota";
	// 잔액 조회 API가 없는 공급자(Gemini)는 null이다
	quota: RemainingQuota | null;
};

// 생성 한 번의 기다림(T9 스펙 2절). timeoutMs가 지나면 처리 여부 미확인이다. onLate가 있으면 끊긴 요청의 결과 약속을 넘긴다.
// 취소할 수 없는 Typecast SDK만 실제로 늦게 끝난다. 신호를 받는 공급자는 끊긴 요청이 AbortError로 끝나 늦은 실패가 된다.
// T는 결과 모양이다(runTrial의 제네릭, 드라마 장면 생성은 PCM과 정렬)
export type SynthesizeOptions<T = Uint8Array> = {
	timeoutMs?: number;
	onLate?: (late: Promise<T>) => void;
};

// 공급자 클라이언트. 목록·억양은 메서드 문법이다. 메서드 매개변수는 이변이라 공급자 구현이 자기 입력 모양(ListInputOf<P>)만 받아도 들어간다.
// 라우터는 context.providers?.[input.provider]로 그 공급자의 클라이언트를 고르므로 입력과 구현이 어긋나지 않는다.
export type ProviderClient = {
	checkStatus(): Promise<ProviderStatusResult>;
	// 성우 목록 한 페이지(T3 Typecast, T4 ElevenLabs·Fish Audio)
	listVoices?(input: VoiceListInput): Promise<VoiceListPage>;
	// ElevenLabs만: 언어의 억양 목록(억양 조건의 선택지, T4)
	listAccents?(language: string): Promise<Accent[]>;
	// 생성 1회(T5 시험 생성, T9 작업실). 유료다(Fish Audio 무료 모델 제외). 오디오 바이트를 돌려준다. 재시도하지 않는다.
	// options는 작업실만 넘긴다(180초, 늦은 결과). 넘기지 않으면 T5 그대로 60초다
	synthesize?(
		request: TrialRequest,
		options?: SynthesizeOptions,
	): Promise<Uint8Array>;
	// Fish Audio만: 드라마 장면 생성 1회(T9.5). 유료다(s2.1-pro-free 제외). PCM과 정렬을 돌려준다. 재시도하지 않는다
	synthesizeScene?(
		scene: SceneRequest,
		options?: SynthesizeOptions<SceneAudio>,
	): Promise<SceneAudio>;
	// Gemini만: 드라마 전체 자동 태그 1회(T9.5 Part 2). 유료다(약 $0.01). 텍스트 모델의 답 글(JSON 문자열)을 읽지 않고 돌려준다(없으면 null).
	// 읽기·검사는 라우터가 한다. 재시도하지 않는다
	suggestActing?(prompt: {
		system: string;
		input: string;
		schema: Record<string, unknown>;
	}): Promise<string | null>;
	// ElevenLabs만: 모델별 크레딧 배율(T5 예상 사용량)
	listModels?(): Promise<TrialModelRate[]>;
	// 성우 한 명 다시 조회(T7 보관함 이용 가능 확인). null은 공급자가 '없다'고 답한 것(현재 이용 불가)이고,
	// 공급자 문제는 목록과 같은 providerError다. 읽기 호출이라 과금 문구가 없다(조사 2026-10-07)
	// preferred는 ElevenLabs 행 샘플 언어(담을 때 고른 언어를 지킨다, 계획 리뷰 E14). 다른 공급자는 무시한다
	getVoice?(
		source: VoiceSource,
		voiceId: string,
		preferred?: string | null,
	): Promise<Voice | null>;
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

// 공급자, 오류 이름(HTTP 오류는 상태 코드), 검증에 실패한 필드 경로만 한 줄 남긴다. 오류 객체·값·메시지는 남기지 않는다.
export function logFailure(
	prefix: string,
	error: unknown,
	paths: readonly string[] = invalidPaths(error),
) {
	const name =
		error instanceof ProviderHttpError
			? `HTTP ${error.status}`
			: error instanceof Error
				? error.name
				: typeof error;
	console.error(
		`${prefix}: ${name}${paths.length > 0 ? ` (${paths.join(", ")})` : ""}`,
	);
}

// 제한 시간(기본 10초)이 지나 끊었다. 응답을 받지 못했으므로 처리 여부를 모른다(unknown_outcome).
export class ProviderTimeoutError extends Error {
	override name = "ProviderTimeoutError";
}

// 공급자 호출 공통 시간 제한(기본 10초). 신호를 받지 못하는 SDK(Typecast)도 같은 시각에 끊기도록 경주시킨다.
// 끊긴 요청은 뒤에서 끝까지 돌 수 있다(조회라 괜찮다).
// timedOut의 abort 리스너가 call보다 먼저 등록되므로, 신호로 끊긴 fetch의 AbortError보다 늘 먼저 거절한다.
export async function withTimeout<T>(
	call: (signal: AbortSignal) => Promise<T>,
	timeoutMs = CHECK_TIMEOUT_MS,
): Promise<T> {
	const controller = new AbortController();
	// AbortSignal.timeout()은 vitest 가짜 타이머로 진행되지 않아 setTimeout을 쓴다.
	const timer = setTimeout(() => controller.abort(), timeoutMs);
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
		remainingQuotaSchema.nullable().parse(outcome.quota);
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
			logFailure(`[providerStatus] ${provider} 확인 실패`, error);
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

// 공급자 문제를 화면까지 보낼 오류. data에는 공급자·사유(429면 다음 호출 가능 시각)만 담고 원래 오류(cause)를 붙이지 않는다.
export function providerError(
	provider: ProviderId,
	reason: ProviderFailure,
	retryAt?: string,
) {
	const data: ProviderErrorData = { provider, reason, retryAt };
	return new ORPCError(FAILURE_CODE[reason], { data });
}

// 429 Retry-After는 1시간까지만 따른다. 더 긴 값이 대기 표에 적히면 목록·새로 고침이 며칠씩 막히고 화면에서 풀 방법이 없다(T4 계획 리뷰 E16)
const MAX_RETRY_SECONDS = 60 * 60;

// 목록 조회 공통 틀(T3 스펙 3·4절): 시간 제한(기본 10초), 재시도 없음, 공급자 문제는 사유를 붙여 던진다.
export async function runList<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
	timeoutMs = CHECK_TIMEOUT_MS,
): Promise<T> {
	try {
		return await withTimeout(call, timeoutMs);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) {
			throw providerError(provider, "unknown_outcome");
		}
		if (error instanceof ProviderHttpError) {
			const reason = reasonFromHttp(error.status, error.codes);
			// 목록 조회의 입력 거절(400·422)과 표에 없는 상태는 공급자 장애로 보인다.
			const failure =
				reason === null || reason === "provider_input"
					? "provider_error"
					: reason;
			// 429의 Retry-After(초)는 다음 호출 가능 시각으로 담는다. 목록 캐시가 대기 표에 적고 화면이 시각을 보인다(T4 스펙 4절)
			throw providerError(
				provider,
				failure,
				failure === "rate_limit" ? retryAtFrom(error.retryAfter) : undefined,
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

// 응답이 2xx가 아니면 상태 코드·공급자 오류 코드·Retry-After를 담아 던진다.
// 키 헤더가 다른 호스트로의 리다이렉트를 따라가지 않게 한다(리다이렉트를 만나면 fetch가 TypeError를 던진다)
export async function fetchOk(
	url: string,
	init: RequestInit,
	codesOf: (body: unknown) => string[] = () => [],
): Promise<Response> {
	const response = await fetch(url, { ...init, redirect: "error" });
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		throw new ProviderHttpError(
			response.status,
			codesOf(body),
			response.headers.get("retry-after"),
		);
	}
	return response;
}

export async function fetchJson(
	url: string,
	headers: Record<string, string>,
	signal: AbortSignal,
	codesOf: (body: unknown) => string[] = () => [],
): Promise<unknown> {
	return (await fetchOk(url, { headers, signal }, codesOf)).json();
}

// 시험 생성 사유별 oRPC 코드(스펙 6절). 공급자 사유는 목록과 같다
const TRIAL_CODE = {
	...FAILURE_CODE,
	provider_input: "BAD_REQUEST",
	in_progress: "TOO_MANY_REQUESTS",
	free_ended: "BAD_REQUEST",
	request_mismatch: "BAD_REQUEST",
	storage: "SERVICE_UNAVAILABLE",
	voice_unavailable: "BAD_REQUEST",
} as const satisfies Record<TrialFailure, string>;

// 시험 생성 오류. data에는 공급자·사유(·다음 호출 가능 시각·입력 거절의 공급자 오류 코드)만 담고 원래 오류를 붙이지 않는다
export function trialError(
	provider: ProviderId | undefined,
	reason: TrialFailure,
	extra: { retryAt?: string; providerCode?: string } = {},
) {
	const data: TrialErrorData = { provider, reason, ...extra };
	return new ORPCError(TRIAL_CODE[reason], { data });
}

// 시험 생성 시간 제한(스펙 4절). 200자 합성 응답을 기다린다
export const TRIAL_TIMEOUT_MS = 60_000;
// 작업실 생성 시간 제한(T9 스펙 2절). Typecast 일반 생성 소요 시간은 문서에 없어 추정이다(사용자 테스트 7번으로 확인한다)
export const STUDIO_TIMEOUT_MS = 180_000;
// 드라마 장면 요청의 끝(T9.5 계획 '스펙과 다른 점' 3). 180초에 끊지 않고 늦은 결과를 이 시각까지만 기다린다(T9 6분 다시 받기 창 안)
export const SCENE_LATE_MAX_MS = 300_000;
// ElevenLabs 403 가운데 키가 아니라 성우·플랜·모델 문제인 코드(공식 오류 표). 화면이 문구를 고르도록 입력 거절로 보낸다
const VOICE_DENIED = new Set([
	"voice_access_denied",
	"subscription_required",
	"feature_not_available",
	"model_access_denied",
]);

// 시험 생성의 상태 코드 → 사유. 404(성우·모델 없음)는 입력 거절이다. 표에 없는 상태는 공급자 장애다
export function trialReason(
	status: number,
	codes: readonly string[] = [],
): TrialFailure {
	if (status === 403 && codes.some((code) => VOICE_DENIED.has(code)))
		return "provider_input";
	if (status === 404) return "provider_input";
	return reasonFromHttp(status, codes) ?? "provider_error";
}

// 429 Retry-After(초)를 다음 호출 가능 시각(ISO, 1시간까지)으로. 없거나 못 읽으면 undefined(목록과 시험 생성이 함께 쓴다, 계획 리뷰 E15)
export function retryAtFrom(retryAfter: string | null): string | undefined {
	const seconds = retryAfterSeconds(retryAfter);
	return seconds === null
		? undefined
		: new Date(
				Date.now() + Math.min(seconds, MAX_RETRY_SECONDS) * 1000,
			).toISOString();
}

// 시험 생성 공통 틀: 60초, 재시도 없음. 공급자 응답(상태 코드)을 받지 못한 실패는 모두 처리 여부 미확인이다
// (시간 초과, 연결 끊김의 TypeError, ElevenLabs SDK의 statusCode 없는 오류, 그 밖의 예외). 돈에 안전한 쪽이다:
// 자동으로 다시 만들지 않고 화면이 "크레딧이 쓰였을 수 있으니 확인한 뒤"를 보인다(tts-provider, 계획 리뷰 E1).
// 원래 오류 객체는 던지지 않는다(rpc onError가 통째로 로그에 쓴다). 로그는 logFailure 한 줄(이름·필드 이름)뿐이다
// 작업실은 시간 제한을 늘리고(timeoutMs) 끊긴 요청의 결과 약속을 onLate로 받는다(T9). 경주가 그 약속에 처리기를 달아 두므로 늦은 거절이 처리 안 된 거절이 되지 않는다
export async function runTrial<T>(
	provider: ProviderId,
	call: (signal: AbortSignal) => Promise<T>,
	{ timeoutMs = TRIAL_TIMEOUT_MS, onLate }: SynthesizeOptions<T> = {},
): Promise<T> {
	let started: Promise<T> | undefined;
	try {
		return await withTimeout((signal) => {
			started = call(signal);
			return started;
		}, timeoutMs);
	} catch (error) {
		if (error instanceof ProviderTimeoutError) {
			if (onLate && started) onLate(started);
			throw trialError(provider, "unknown_outcome");
		}
		if (error instanceof ProviderHttpError) {
			const reason = trialReason(error.status, error.codes);
			throw trialError(provider, reason, {
				retryAt:
					reason === "rate_limit" ? retryAtFrom(error.retryAfter) : undefined,
				providerCode: reason === "provider_input" ? error.codes[0] : undefined,
			});
		}
		logFailure(`[trial] ${provider} 생성 실패`, error, []);
		throw trialError(provider, "unknown_outcome");
	}
}
