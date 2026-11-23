import { randomUUID } from "node:crypto";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { TrialFailure } from "@tts-pilot-app/api/providers/trial-contract";
import type { AppRouterClient } from "@tts-pilot-app/api/routers/index";
import { note } from "./output.js";
import {
	changeRequests as changeRequestsState,
	change as changeState,
	changeVoices as changeVoicesState,
	type Session,
} from "./session.js";

// 관리 명령만 읽는 충돌 사유. 유료 분류의 허용 목록(REASON_TEXT)에 넣지 않는다
const CONFLICT_TEXT = {
	duplicate_name: "같은 이름이 이미 있습니다.",
	stale: "다른 곳에서 먼저 바뀌었습니다. 다시 보고 실행해 주세요.",
};
// 내 보이스(T21)에만 있는 사유. 글은 clones.ts에 있다
export type CloneFailure =
	| "quality"
	| "not_found"
	| "audio_format"
	| "audio_length"
	| "consent_audio_missing";
export type ErrorDetail = {
	reason?: TrialFailure | keyof typeof CONFLICT_TEXT | CloneFailure;
	retryAt?: string;
	requestId?: string;
	resultId?: string;
	cloneId?: string;
	// 문단 묶음(T20): 멈춘 문단과, 여러 문단을 함께 알릴 때의 목록
	paragraph?: number;
	paragraphs?: {
		n: number;
		reason?: string;
		requestId?: string;
		resultId?: string;
	}[];
	// 드라마 줄(T20)
	line?: number;
	lines?: {
		n: number;
		reason?: string;
		requestId?: string;
		resultId?: string;
	}[];
	// 중간에 멈췄지만 게시한 파일과 이어 갈 문단(자동 태그)
	out?: string;
	remaining?: string;
};
export class ClientError extends Error {
	constructor(
		public code: string,
		public exitCode: number,
		message: string,
		public detail: ErrorDetail = {},
	) {
		super(message);
	}
}
export const input = (message: string) => new ClientError("INPUT", 2, message);
export const stale = () =>
	new ClientError("CONFLICT", 2, CONFLICT_TEXT.stale, { reason: "stale" });
const unauthorized = (detail?: ErrorDetail) =>
	new ClientError("UNAUTHORIZED", 3, "로그인이 필요합니다.", detail);
export const serverError = (message?: string, detail?: ErrorDetail) =>
	new ClientError(
		"SERVER_ERROR",
		5,
		message ?? "작업실 요청을 처리하지 못했습니다.",
		detail,
	);
async function stored<T>(run: Promise<T>, message: string): Promise<T> {
	try {
		return await run;
	} catch (error) {
		if (error instanceof ClientError) throw error;
		throw new ClientError("STORAGE_ERROR", 7, message);
	}
}
const change = <T>(fn: Parameters<typeof changeState<T>>[0]) =>
	stored(changeState(fn), "세션 저장소에 접근하지 못했습니다.");
export const changeRequests = <T>(
	fn: Parameters<typeof changeRequestsState<T>>[0],
) =>
	stored(
		changeRequestsState(fn),
		"요청 기록(requests.json)에 접근하지 못했습니다.",
	);
export const changeVoices = <T>(
	fn: Parameters<typeof changeVoicesState<T>>[0],
) =>
	stored(
		changeVoicesState(fn),
		"찾은 성우(voices.json)에 접근하지 못했습니다.",
	);
const forgetVoices = (origin: string) =>
	changeVoices(({ voices }) => {
		delete voices[origin];
	});

// 서버가 준 사유의 안내. 키가 허용 목록이다(모르는 사유는 사유가 없는 것으로 본다)
export const REASON_TEXT: Record<TrialFailure, string> = {
	no_key: "작업실에 이 공급자의 키가 없습니다.",
	provider_auth: "공급자가 작업실의 키를 거절했습니다.",
	no_permission: "공급자 키에 이 작업의 권한이 없습니다.",
	quota: "공급자 잔액이나 플랜 한도가 부족합니다.",
	rate_limit: "공급자 요청 한도에 걸렸습니다. 잠시 뒤 다시 실행해 주세요.",
	provider_error: "공급자가 오류를 돌려줬습니다.",
	unknown_outcome: "공급자가 처리했는지 확인하지 못했습니다.",
	provider_input: "공급자가 이 대본이나 설정을 받지 않았습니다.",
	in_progress: "작업실에서 다른 음성을 만드는 중입니다.",
	free_ended: "Fish Audio 무료 모델 기간이 끝났습니다.",
	request_mismatch: "같은 요청 ID로 다른 내용이 이미 처리됐습니다.",
	storage: "작업실 저장소를 쓰지 못했습니다.",
	voice_unavailable: "담은 성우가 아니거나 지금 쓸 수 없는 성우입니다.",
};
export const reasonOf = (value: unknown): TrialFailure | undefined =>
	typeof value === "string" && Object.hasOwn(REASON_TEXT, value)
		? (value as TrialFailure)
		: undefined;
// oRPC 오류의 data에서 검증한 사유와 다음 호출 가능 시각만 꺼낸다
export function detailOf(error: unknown): ErrorDetail {
	const data = error instanceof ORPCError ? error.data : null;
	if (!data || typeof data !== "object") return {};
	const { reason: raw, retryAt } = data as Record<string, unknown>;
	const detail: ErrorDetail = {};
	const reason = reasonOf(raw);
	if (reason) detail.reason = reason;
	if (typeof retryAt === "string" && !Number.isNaN(Date.parse(retryAt)))
		detail.retryAt = new Date(retryAt).toISOString();
	return detail;
}
export function rpcError(error: unknown, extra: ErrorDetail = {}): never {
	const detail = { ...detailOf(error), ...extra };
	if (error instanceof ORPCError) {
		if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
			throw unauthorized(detail);
		if (error.code === "NOT_FOUND" && extra.resultId)
			throw new ClientError(
				"NOT_FOUND",
				4,
				"결과를 찾을 수 없습니다. 보관 기한이 지났을 수 있습니다.",
				detail,
			);
	}
	if (detail.reason === "voice_unavailable")
		throw new ClientError(
			"VOICE_UNAVAILABLE",
			4,
			REASON_TEXT[detail.reason],
			detail,
		);
	const reason = reasonOf(detail.reason);
	throw serverError(reason && REASON_TEXT[reason], detail);
}
// 관리 명령과 과금 전 조회의 오류. 합성 요청의 오류에는 쓰지 않는다
export function manageError(error: unknown, extra: ErrorDetail = {}): never {
	if (error instanceof ORPCError) {
		const detail = { ...detailOf(error), ...extra };
		const raw = (error.data as { reason?: unknown } | null | undefined)?.reason;
		if (error.code === "BAD_REQUEST" && !detail.reason)
			throw new ClientError(
				"INPUT",
				2,
				"작업실이 입력을 받지 않았습니다. 값을 확인해 주세요.",
				detail,
			);
		if (
			error.code === "CONFLICT" &&
			(raw === "duplicate_name" || raw === "stale")
		)
			throw new ClientError("CONFLICT", 2, CONFLICT_TEXT[raw], {
				...detail,
				reason: raw,
			});
		if (error.code === "NOT_FOUND" && !extra.resultId)
			throw new ClientError("NOT_FOUND", 4, "찾을 수 없습니다.", detail);
	}
	rpcError(error, extra);
}

export function normalizeOrigin(input: string): string {
	const url = new URL(input);
	const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (
		(url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new Error("HTTPS 또는 로컬 작업실 주소를 입력해 주세요.");
	}
	return url.origin;
}

function cookies(response: Response, current = ""): string {
	const values = new Map(
		current
			.split("; ")
			.filter(Boolean)
			.map((s) => {
				const i = s.indexOf("=");
				return [s.slice(0, i), s.slice(i + 1)];
			}),
	);
	for (const header of response.headers.getSetCookie()) {
		const [pair, ...attributes] = header.split(";");
		const index = pair?.indexOf("=") ?? -1;
		if (!pair || index < 1) continue;
		const name = pair.slice(0, index).trim();
		if (attributes.some((s) => /^\s*max-age\s*=\s*0\s*$/i.test(s)))
			values.delete(name);
		else values.set(name, pair.slice(index + 1));
	}
	return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function auth(
	origin: string,
	path: string,
	cookie: string,
	body?: object,
): Promise<Response> {
	try {
		return await fetch(`${origin}/api/auth/${path}`, {
			method: body ? "POST" : "GET",
			redirect: "manual",
			headers: {
				origin,
				...(body ? { "content-type": "application/json" } : {}),
				...(cookie ? { cookie } : {}),
			},
			...(body ? { body: JSON.stringify(body) } : {}),
		});
	} catch {
		throw new ClientError("NETWORK", 5, "작업실에 연결하지 못했습니다.");
	}
}

async function selected(
	origin?: string,
): Promise<{ origin: string; session: Session }> {
	return change((state) => {
		const raw = origin ?? state.current;
		const target = raw ? normalizeOrigin(raw) : undefined;
		const session = target ? state.sessions[target] : undefined;
		if (!target || !session?.cookie) throw unauthorized();
		return { origin: target, session: { ...session } };
	});
}

async function verified(
	origin: string,
	session: Session,
): Promise<{ session: Session; userId: string | undefined }> {
	const response = await auth(origin, "get-session", session.cookie);
	if (!response.ok) {
		if ([401, 403, 404].includes(response.status)) throw unauthorized();
		throw serverError();
	}
	const data = (await response.json().catch(() => null)) as {
		session?: unknown;
		user?: { id?: unknown };
	} | null;
	if (!data?.session || !data.user) throw unauthorized();
	const { id } = data.user;
	const cookie = cookies(response, session.cookie);
	const updated = {
		cookie,
		version: cookie === session.cookie ? session.version : randomUUID(),
	};
	await change((state) => {
		if (state.sessions[origin]?.version !== session.version)
			throw unauthorized();
		state.sessions[origin] = updated;
	});
	return {
		session: updated,
		userId: typeof id === "string" && id ? id : undefined,
	};
}

function rpc(origin: string, session: Session): AppRouterClient {
	const link = new RPCLink({
		url: `${origin}/api/rpc`,
		plugins: [new SimpleCsrfProtectionLinkPlugin()],
		headers: { cookie: session.cookie, origin },
		fetch: (request) => fetch(request, { redirect: "manual" }),
	});
	return createORPCClient(link);
}

async function owner(origin: string, session: Session) {
	const valid = await verified(origin, session);
	const client = rpc(origin, valid.session);
	try {
		return {
			client,
			userId: valid.userId,
			version: valid.session.version,
			voices: await client.savedVoiceList(),
		};
	} catch (error) {
		rpcError(error);
	}
}

export async function login(
	input: string,
	email: string,
	password: string,
): Promise<{ origin: string }> {
	const origin = normalizeOrigin(input);
	const previousVersion = await change(
		(state) => state.sessions[origin]?.version,
	);
	const response = await auth(origin, "sign-in/email", "", { email, password });
	if (!response.ok) {
		if ([400, 401, 403, 404].includes(response.status)) throw unauthorized();
		throw serverError();
	}
	const session = { cookie: cookies(response), version: randomUUID() };
	if (!session.cookie) throw unauthorized();
	// Temporary session is checked without writing it to the persistent store.
	const checked = await auth(origin, "get-session", session.cookie);
	if (!checked.ok) {
		if ([401, 403, 404].includes(checked.status)) throw unauthorized();
		throw serverError();
	}
	const data = (await checked.json().catch(() => null)) as {
		session?: unknown;
		user?: unknown;
	} | null;
	if (!data?.session || !data.user) throw unauthorized();
	session.cookie = cookies(checked, session.cookie);
	try {
		await rpc(origin, session).savedVoiceList();
	} catch (error) {
		rpcError(error);
	}
	// 다른 계정으로 다시 로그인했을 수 있다. 지우지 못하면 세션을 바꾸지 않는다
	await forgetVoices(origin);
	await change((state) => {
		if (state.sessions[origin]?.version !== previousVersion)
			throw unauthorized();
		state.sessions[origin] = session;
		state.current = origin;
	});
	// 그사이 끝난 옛 세션의 검색이 다시 썼을 수 있다. 지금부터는 세션 버전이 막는다
	await forgetVoices(origin).catch(() =>
		note("찾은 성우(voices.json)를 지우지 못했습니다."),
	);
	return { origin };
}

export async function status(input?: string): Promise<{ origin: string }> {
	const { origin, session } = await selected(input);
	await owner(origin, session);
	return { origin };
}

export async function savedVoices(input?: string) {
	const { origin, session } = await selected(input);
	const { client, voices } = await owner(origin, session);
	return { origin, client, voices };
}

export const currentOrigin = async (input?: string) =>
	(await selected(input)).origin;

// 작업실 명령의 연결. 요청 지문에 쓸 사용자 id가 없으면 만들기 전에 끝낸다
export async function connect(input?: string) {
	const { origin, session } = await selected(input);
	const { client, userId, version, voices } = await owner(origin, session);
	if (!userId) throw unauthorized();
	return { origin, client, userId, version, voices };
}
export type Connection = Awaited<ReturnType<typeof connect>>;

export async function logout(input?: string): Promise<{ origin: string }> {
	const { origin, session } = await change((state) => {
		const raw = input ?? state.current;
		const origin = raw ? normalizeOrigin(raw) : undefined;
		const session = origin ? state.sessions[origin] : undefined;
		if (!origin) throw unauthorized();
		delete state.sessions[origin];
		return { origin, session };
	});
	// 지우지 못해도 서버 로그아웃은 한다
	const cleared = await forgetVoices(origin).catch((error: unknown) => error);
	if (!session?.cookie) throw cleared ?? unauthorized();
	let ok = false;
	try {
		ok = (await auth(origin, "sign-out", session.cookie, {})).ok;
	} catch {
		/* session is already cleared */
	}
	if (!ok) {
		if (cleared) note("찾은 성우(voices.json)를 지우지 못했습니다.");
		throw new ClientError(
			"LOGOUT_UNCONFIRMED",
			5,
			"로컬 세션을 지웠지만 서버 로그아웃을 확인하지 못했습니다.",
		);
	}
	if (cleared) throw cleared;
	return { origin };
}
