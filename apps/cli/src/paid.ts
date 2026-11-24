import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/client";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import {
	codePoints,
	estimate,
	needsConfirm,
	type TrialRequest,
	type Usage,
} from "@tts-pilot-app/api/providers/trial-options";
import type {
	StudioRequestStatus,
	StudioResult,
} from "@tts-pilot-app/api/studio-contract";
import {
	ClientError,
	type Connection,
	connect,
	currentOrigin,
	detailOf,
	type ErrorDetail,
	manageError,
	REASON_TEXT,
	reasonOf,
	rpcError,
} from "./client.js";
import { checkOut, discardAll, type FileOptions } from "./files.js";
import {
	ask,
	byteText,
	canceled,
	clean,
	confirmRequired,
	note,
	print,
	report,
	usageText,
} from "./output.js";
import {
	claim,
	fingerprint,
	type KindName,
	kindOf,
	recordsFor,
	recordsOf,
	release,
} from "./requests.js";

export type PaidOptions = {
	json: boolean;
	input?: string;
	yes: boolean;
	fresh: boolean;
	dryRun: boolean;
};
export type Source = "created" | "saved" | "resumed";
export type Found = { id: string; status: "done" | "unknown" };
// 흐름이 읽는 요청의 상태. done·failed 말고는 처리 여부를 모르는 것이다
export type StatusRow = { id: string; status: string; reason: string | null };
// 종류(작업실·시험 생성)마다 다른 것. R은 보낼 요청, S는 요청 상태의 모양이다
export type Kind<
	R = TrialRequest,
	S extends StatusRow = StudioRequestStatus,
> = {
	name: KindName;
	// 저장 결과 조회. 배열이 아닌 응답은 던진다
	find(connection: Connection, request: R): Promise<Found | null>;
	// 합성 요청 하나. 결과가 아닌 응답은 던진다(처리 여부 미확인)
	create(
		connection: Connection,
		input: { requestId: string; request: R },
	): Promise<{ id: string }>;
	status(connection: Connection, requestId: string): Promise<S | null>;
	// 확정 실패의 오류를 종류가 고른다. raw는 서버가 준 사유, row는 실패로 남은 요청이다. 없으면 공통 글이다
	failure?(raw: unknown, detail: ErrorDetail, row?: S): ClientError | undefined;
	// 완료 확인: 응답을 받은 뒤 기록을 지워도 되는가. 던지지 않는다
	settle(
		connection: Connection,
		requestId: string,
		result: { id: string },
	): Promise<boolean>;
	// 결과를 파일로 두고 알린다. requestId는 기록이 남은 요청이다
	finish(
		connection: Connection,
		source: Source,
		id: string,
		requestId?: string,
	): Promise<void>;
};

export const unconfirmed = (kind: KindName, requestId: string) =>
	new ClientError(
		"UNCONFIRMED",
		6,
		kind === "clones"
			? "처리 여부를 확인하지 못했습니다. clones resume으로 다시 확인하세요. 그래도 모르면 공급자 웹에서 확인하고 clones remove로 줄을 치운 뒤 필요할 때만 --new를 쓰세요(클론이 또 만들어질 수 있습니다)."
			: `처리 여부를 확인하지 못했습니다. ${kind} resume으로 다시 확인하세요. 새로 만들려면 --new를 쓰세요(요금이 다시 나올 수 있습니다).`,
		{ requestId },
	);
export const downloadStopped = (
	kind: KindName,
	resultId: string,
	requestId?: string,
) =>
	kind === "clones"
		? // 받을 파일이 없다. 클론은 만들어졌고 알리지 못했을 뿐이다
			new ClientError(
				"OUTPUT_STOPPED",
				7,
				"결과를 알리기 전에 멈췄습니다. clones list로 확인해 주세요.",
				{ cloneId: resultId },
			)
		: new ClientError(
				"DOWNLOAD_STOPPED",
				7,
				`내려받기를 멈췄습니다. ${kind} download로 다시 받을 수 있습니다.`,
				{ ...(requestId ? { requestId } : {}), resultId },
			);

// 지금 Ctrl+C를 누르면 알릴 결과. 선점, 응답, 내려받기 단계마다 바꾼다
let interrupted: () => ClientError = canceled;
export const onInterrupt = (fn: () => ClientError) => {
	interrupted = fn;
};
// 관리 명령의 변경 요청. 보낸 뒤의 Ctrl+C와 끊긴 응답은 적용 여부를 모르는 것이다
export function mutate<T>(request: Promise<T>): Promise<T> {
	const unsure = () =>
		new ClientError(
			"UNCONFIRMED",
			6,
			"적용됐는지 확인하지 못했습니다. 다시 보고 실행해 주세요.",
		);
	onInterrupt(unsure);
	return request.catch((error: unknown) => {
		if (error instanceof ORPCError || error instanceof ClientError)
			manageError(error);
		throw unsure();
	});
}
// 묶음이 Ctrl+C의 안내에 문단 번호를 더하는 길
let decorate = (error: ClientError) => error;
export const onReport = (fn: typeof decorate) => {
	decorate = fn;
};
export function watchInterrupt() {
	process.on("SIGINT", () => {
		discardAll();
		process.exit(report(decorate(interrupted())));
	});
}

// 기록을 못 지워도 결과를 잃지 않는다. 남은 기록은 다음 실행에서 같은 요청 ID로 다시 확인한다
export async function releaseOrWarn(...args: Parameters<typeof release>) {
	try {
		await release(...args);
	} catch {
		note("요청 기록을 정리하지 못했습니다.");
	}
}

// 요청 UUID 하나의 상태만 본다. 합성하지 않는다. 같은 조합의 다른 결과는 이 요청의 완료가 아니다
export async function recover<S extends StatusRow>(
	kind: Pick<Kind<never, S>, "name" | "status" | "failure">,
	connection: Connection,
	requestId: string,
): Promise<S> {
	const { origin } = connection;
	onInterrupt(() => unconfirmed(kind.name, requestId));
	const row = await kind.status(connection, requestId).catch(() => null);
	if (row?.status === "done") {
		onInterrupt(() => downloadStopped(kind.name, row.id));
		await releaseOrWarn(origin, requestId);
		return row;
	}
	if (row?.status === "failed") {
		await releaseOrWarn(origin, requestId);
		const failure = kind.failure?.(row.reason, { requestId }, row);
		if (failure) throw failure;
		const reason = reasonOf(row.reason);
		throw new ClientError(
			"CREATE_FAILED",
			5,
			reason ? REASON_TEXT[reason] : "음성을 만들지 못했습니다.",
			{ requestId, ...(reason ? { reason } : {}) },
		);
	}
	throw unconfirmed(kind.name, requestId);
}

export type Output = {
	origin: string;
	source: Source;
	result: StudioResult;
	out: string | null;
	mime: string | null;
	// 완료를 확인하지 못해 기록이 남은 요청(시험 생성)
	requestId?: string;
};
export const show = (json: boolean, output: Output) =>
	print(
		json,
		output,
		[
			`결과 ID ${clean(output.result.id)}`,
			...(output.out ? [`저장 ${clean(output.out)}`] : []),
			`크기 ${byteText(output.result.bytes)}`,
			`사용량 ${usageText(output.result.usage)}${output.source === "saved" ? " (저장된 결과라 새로 쓰지 않았습니다)" : ""}`,
		].join("\n"),
	);

// 보정으로 바뀐 칸을 알린다
export function noteChanged(before: object, request: TrialRequest) {
	const values = before as Record<string, unknown>;
	const changed = Object.entries(request.settings).filter(
		([key, value]) => values[key] !== value,
	);
	if (changed.length)
		note(
			`지금 쓸 수 없는 값을 바꿨습니다: ${changed.map(([key, value]) => `${key} ${values[key]} → ${value}`).join(", ")}`,
		);
	if (request.provider === "fish_audio" && changed.length)
		note("Fish Audio 무료 기간이 끝나 유료 모델로 만듭니다.");
}

function summary(
	kind: KindName,
	voice: Voice,
	request: TrialRequest,
	usage: Usage,
	rateKnown: boolean,
): string[] {
	return [
		`성우 ${voice.name} (${request.provider}:${request.voiceId})`,
		`모델 ${request.settings.model}`,
		`글자 수 ${codePoints(request.text)}자`,
		`예상 사용량 ${usageText(usage)}${rateKnown ? "" : " (배율을 확인하지 못했어요)"}`,
		// 작업실은 받지 않는 태그를 이미 뺐다
		...(kind === "trial" && /\[[^\]]*\]/.test(request.text)
			? [
					"대괄호 태그를 원문 그대로 보냅니다(모델이 태그를 읽거나 웹과 다른 결과가 될 수 있습니다).",
				]
			: []),
	].map(clean);
}

export async function confirm(
	lines: string[],
	{ yes, input }: Pick<PaidOptions, "yes" | "input">,
	what = "생성입니다",
	question = "만들까요?",
): Promise<void> {
	for (const line of lines) note(line);
	if (yes) return;
	if (!process.stdin.isTTY || input === "-")
		throw confirmRequired(
			`요금이 나올 수 있는 ${what}. 확인했으면 --yes를 붙여 실행하세요.`,
		);
	if (!(await ask(`요금이 나올 수 있습니다. ${question} [y/N] `)))
		throw canceled();
}

// 서버가 공급자를 부르기 전에 거절한 코드(웹 studio-view의 BEFORE_PROVIDER와 같다)
export const BEFORE_PROVIDER = new Set([
	"BAD_REQUEST",
	"UNAUTHORIZED",
	"FORBIDDEN",
]);
// 사유 없는 NOT_FOUND. 시험 생성은 삭제 대기·처리 중·남의 클론을 선점 전에 이렇게 거절한다
const isNotFound = (error: unknown) =>
	error instanceof ORPCError &&
	error.code === "NOT_FOUND" &&
	!detailOf(error).reason;
async function isRejected(
	kind: Pick<Kind<never, StatusRow>, "name" | "status">,
	connection: Connection,
	requestId: string,
	error: unknown,
): Promise<boolean> {
	const { reason } = detailOf(error);
	if (reason === "unknown_outcome") return false;
	if (
		reason === "in_progress" ||
		reason === "storage" ||
		(kind.name === "trial" && isNotFound(error))
	) {
		try {
			const row = await kind.status(connection, requestId);
			return row === null || row.status === "failed";
		} catch {
			return false;
		}
	}
	return (
		reason !== undefined ||
		(error instanceof ORPCError && BEFORE_PROVIDER.has(error.code))
	);
}

// 만드는 방법. reuse: 기록과 저장 결과를 쓴다, new: 둘 다 쓰지 않는다(--new),
// retry: 시작할 때 본 기록(없으면 undefined)이 그대로일 때만 바꾸고 미확인 저장 결과는 건너뛴다(--retry-unconfirmed)
export type Mode = "reuse" | "new" | { retry: string | undefined };

// 합성 요청을 보내는 유일한 곳. 먼저 선점하고, 보내는 것은 한 번뿐이다
export async function create<R, S extends StatusRow>(
	kind: Kind<R, S>,
	connection: Connection,
	{ key, provider, request }: { key: string; provider: string; request: R },
	mode: Mode,
): Promise<{ source: Source; id: string; requestId?: string }> {
	const { origin } = connection;
	const requestId = randomUUID();
	const seen = typeof mode === "object" ? mode.retry : undefined;
	const { claimed, previous } = await claim(
		key,
		{
			origin,
			requestId,
			provider,
			createdAt: new Date().toISOString(),
			...(kind.name === "studio" ? {} : { kind: kind.name }),
		},
		mode === "new" || (seen ?? false),
		() => onInterrupt(() => unconfirmed(kind.name, requestId)),
	);
	if (!claimed) {
		// 확인하는 사이 다른 프로세스가 선점했다
		if (previous)
			return {
				source: "resumed",
				id: (await recover(kind, connection, previous.requestId)).id,
			};
		// 시작할 때 본 기록을 다른 프로세스가 정리했다. 만들지 않고 완료만 쓴다
		const found = await kind.find(connection, request);
		if (found?.status === "done") return { source: "saved", id: found.id };
		throw unconfirmed(kind.name, seen ?? requestId);
	}
	if (mode !== "new") {
		// 앞선 프로세스가 확인하는 사이 끝냈을 수 있다. 완료는 기록이 지워지기 전에 서버에 저장된다
		const found = await kind
			.find(connection, request)
			.catch(async (error: unknown) => {
				await releaseOrWarn(origin, requestId, previous);
				throw error;
			});
		if (found && (mode === "reuse" || found.status === "done")) {
			await releaseOrWarn(origin, requestId);
			return { source: "saved", id: usable(found) };
		}
	}
	let result: { id: string };
	try {
		result = await kind.create(connection, { requestId, request });
	} catch (error) {
		if (await isRejected(kind, connection, requestId, error)) {
			await releaseOrWarn(origin, requestId, previous);
			if (isNotFound(error))
				throw new ClientError(
					"VOICE_UNAVAILABLE",
					4,
					"지금 쓸 수 없는 성우입니다.",
				);
			const raw = error instanceof ORPCError ? error.data?.reason : undefined;
			const failure = kind.failure?.(raw, detailOf(error));
			if (failure) throw failure;
			rpcError(error);
		}
		const unknown = unconfirmed(kind.name, requestId);
		unknown.detail = { ...detailOf(error), requestId };
		throw unknown;
	}
	const { id } = result;
	onInterrupt(() => downloadStopped(kind.name, id));
	if (await kind.settle(connection, requestId, result)) {
		await releaseOrWarn(origin, requestId);
		return { source: "created", id };
	}
	note(
		`서버에 저장됐는지 확인하지 못해 요청 기록을 남깁니다. 같은 요청은 다시 만들지 않습니다. ${kind.name} resume으로 확인하세요.`,
	);
	return { source: "created", id, requestId };
}

function usable({ status, id }: Found): string {
	if (status === "done") return id;
	throw new ClientError(
		"UNCONFIRMED",
		6,
		"같은 대본과 설정으로 만든 요청의 처리 여부를 아직 모릅니다. 새로 만들려면 --new를 쓰세요(요금이 다시 나올 수 있습니다).",
		{ resultId: id },
	);
}

// 검사를 마친 요청 하나: 기록 → 저장 결과 → 확인 → 생성 1회
export async function runPaid(
	kind: Kind,
	connection: Connection,
	voice: Voice,
	request: TrialRequest,
	options: PaidOptions,
	// 태그를 빼기 전 요청. 옛 판이 태그째 보낸 요청의 기록도 복구 대상이다
	before?: TrialRequest,
) {
	const { origin, client, userId } = connection;
	const { provider, voiceId, settings } = request;
	const keyOf = (value: TrialRequest) =>
		fingerprint(origin, userId, value, kind.name);
	await runRequest(
		kind,
		connection,
		{ key: keyOf(request), provider, request },
		options,
		async () => {
			let rate: number | null = null;
			if (provider === "elevenlabs") {
				const models = await client.trialModels().catch(() => null);
				rate =
					models?.rates.find(({ model }) => model === settings.model)
						?.multiplier ?? null;
			}
			const rateKnown = provider !== "elevenlabs" || rate !== null;
			const usage = estimate(request, rate);
			return {
				lines: summary(kind.name, voice, request, usage, rateKnown),
				request: {
					provider,
					voiceId,
					model: settings.model,
					characters: codePoints(request.text),
				},
				estimate: usage,
				rateKnown,
				needsConfirm: needsConfirm(request),
			};
		},
		before && keyOf(before),
	);
}

// 종류와 상관없는 흐름. describe는 저장 결과가 없거나 dry-run일 때만 불려 무엇을 만드는지 보인다
export async function runRequest<R, S extends StatusRow>(
	kind: Kind<R, S>,
	connection: Connection,
	target: { key: string; provider: string; request: R },
	options: PaidOptions,
	describe: () => Promise<{
		lines: string[];
		request: object;
		estimate?: Usage;
		rateKnown?: boolean;
		needsConfirm: boolean;
	}>,
	oldKey?: string,
) {
	const { json, fresh, dryRun } = options;
	const { origin } = connection;
	const records = fresh
		? []
		: await recordsFor(oldKey ? [target.key, oldKey] : [target.key]);
	const record = records.find((item) => item !== undefined);
	if (record && !dryRun) {
		const { id } = await recover(kind, connection, record.requestId);
		return kind.finish(connection, "resumed", id);
	}
	const found = fresh ? null : await kind.find(connection, target.request);
	if (found && !dryRun) return kind.finish(connection, "saved", usable(found));

	const { lines, request, ...facts } = await describe();
	if (dryRun)
		return print(
			json,
			{
				origin,
				dryRun: true,
				request,
				saved: found,
				requestId: record?.requestId ?? null,
				...facts,
			},
			[
				...lines,
				found
					? found.status === "done"
						? `저장된 결과 ${clean(found.id)} (다시 만들지 않고 받습니다)`
						: "같은 요청의 처리 여부를 모릅니다(--new가 필요합니다)"
					: "저장된 결과 없음",
				...(record ? [`확인할 요청 ID ${clean(record.requestId)}`] : []),
			].join("\n"),
		);
	if (facts.needsConfirm) await confirm(lines, options);
	// --new는 같은 지문의 앞 기록을 바꾼다. 태그째 보낸 옛 기록은 지문이 달라 만든 뒤에 따로 지운다
	const [old] = fresh && oldKey ? await recordsFor([oldKey]) : [];
	const { source, id, requestId } = await create(
		kind,
		connection,
		target,
		fresh ? "new" : "reuse",
	);
	if (old) await releaseOrWarn(origin, old.requestId);
	await kind.finish(connection, source, id, requestId);
}

// 다른 종류의 기록이면 맞는 명령을 안내한다. 기록을 읽지 못해도 서버 조회는 막지 않는다
export async function checkKind(
	kind: KindName,
	url: string | undefined,
	requestId: string,
) {
	const records = await recordsOf(await currentOrigin(url)).catch(() => []);
	const found = records.find((record) => record.requestId === requestId);
	if (found && kindOf(found) !== kind)
		throw new ClientError(
			"INPUT",
			2,
			`다른 종류의 요청입니다. ${kindOf(found)} resume으로 확인하세요.`,
			{ requestId },
		);
}

// 요청 ID 하나를 다시 확인하고, 경로를 주면 파일도 받는다. ID가 없으면 남은 요청을 보인다
export async function resumeRequest<R>(
	kind: Kind<R>,
	requestId: string | undefined,
	{ url, json, out, overwrite }: FileOptions,
	allowed?: string[],
) {
	if (requestId === undefined) return showRecords(kind.name, url, json);
	if (out !== undefined) checkOut(out, overwrite, allowed);
	await checkKind(kind.name, url, requestId);
	const connection = await connect(url);
	const row = await recover(kind, connection, requestId);
	if (out !== undefined) return kind.finish(connection, "resumed", row.id);
	const { id, createdAt, usage, bytes } = row;
	show(json, {
		origin: connection.origin,
		source: "resumed",
		result: { id, createdAt, usage, bytes },
		out: null,
		mime: null,
	});
}

// 이 작업실에 남은 요청 목록. 합성도 네트워크 요청도 없다
export async function showRecords(
	kind: KindName,
	url: string | undefined,
	json: boolean,
) {
	const origin = await currentOrigin(url);
	const requests = (await recordsOf(origin))
		.filter((record) => kindOf(record) === kind)
		.map(({ requestId, provider, createdAt }) => ({
			requestId,
			provider,
			createdAt,
		}));
	print(
		json,
		{ origin, requests },
		requests.length
			? `요청 ID\t공급자\t요청 시각\n${requests.map((item) => [item.requestId, item.provider, item.createdAt].map(clean).join("\t")).join("\n")}`
			: "확인할 요청이 없습니다.",
	);
}
