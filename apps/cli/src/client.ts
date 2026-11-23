import { randomUUID } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { AppRouterClient } from "@tts-pilot-app/api/routers/index";
import { change as changeState, type Session } from "./session.js";

export class ClientError extends Error {
	constructor(
		public code: string,
		public exitCode: number,
		message: string,
	) {
		super(message);
	}
}
const unauthorized = () =>
	new ClientError("UNAUTHORIZED", 3, "로그인이 필요합니다.");
const serverError = () =>
	new ClientError("SERVER_ERROR", 5, "작업실 요청을 처리하지 못했습니다.");
async function change<T>(fn: Parameters<typeof changeState<T>>[0]): Promise<T> {
	try {
		return await changeState(fn);
	} catch (error) {
		if (error instanceof ClientError) throw error;
		throw new ClientError(
			"STORAGE_ERROR",
			7,
			"세션 저장소에 접근하지 못했습니다.",
		);
	}
}
function rpcError(error: unknown): never {
	if (
		error &&
		typeof error === "object" &&
		"code" in error &&
		(error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
	)
		throw unauthorized();
	throw serverError();
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

async function verified(origin: string, session: Session): Promise<Session> {
	const response = await auth(origin, "get-session", session.cookie);
	if (!response.ok) {
		if ([401, 403, 404].includes(response.status)) throw unauthorized();
		throw serverError();
	}
	const data = (await response.json().catch(() => null)) as {
		session?: unknown;
		user?: unknown;
	} | null;
	if (!data?.session || !data.user) throw unauthorized();
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
	return updated;
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
	const client = rpc(origin, valid);
	try {
		return { client, voices: await client.savedVoiceList() };
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
	await change((state) => {
		if (state.sessions[origin]?.version !== previousVersion)
			throw unauthorized();
		state.sessions[origin] = session;
		state.current = origin;
	});
	return { origin };
}

export async function status(input?: string): Promise<{ origin: string }> {
	const { origin, session } = await selected(input);
	await owner(origin, session);
	return { origin };
}

export async function savedVoices(input?: string, includeChannels = false) {
	const { origin, session } = await selected(input);
	const { client, voices } = await owner(origin, session);
	let channels: Awaited<ReturnType<AppRouterClient["channelList"]>> = [];
	try {
		if (includeChannels) channels = await client.channelList();
	} catch (error) {
		rpcError(error);
	}
	return { origin, voices, channels };
}

export async function logout(input?: string): Promise<{ origin: string }> {
	const { origin, session } = await change((state) => {
		const raw = input ?? state.current;
		const origin = raw ? normalizeOrigin(raw) : undefined;
		const session = origin ? state.sessions[origin] : undefined;
		if (!origin || !session?.cookie) throw unauthorized();
		delete state.sessions[origin];
		return { origin, session };
	});
	let ok = false;
	try {
		ok = (await auth(origin, "sign-out", session.cookie, {})).ok;
	} catch {
		/* session is already cleared */
	}
	if (!ok)
		throw new ClientError(
			"LOGOUT_UNCONFIRMED",
			5,
			"로컬 세션을 지웠지만 서버 로그아웃을 확인하지 못했습니다.",
		);
	return { origin };
}
