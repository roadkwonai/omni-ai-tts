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
	currentOrigin,
	detailOf,
	manageError,
	REASON_TEXT,
	reasonOf,
	rpcError,
} from "./client.js";
import { discard } from "./files.js";
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
	recordOf,
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
// 종류(작업실·시험 생성)마다 다른 것
export type Kind = {
	name: KindName;
	// 저장 결과 조회. 배열이 아닌 응답은 던진다
	find(connection: Connection, request: TrialRequest): Promise<Found | null>;
	// 합성 요청 하나. 결과가 아닌 응답은 던진다(처리 여부 미확인)
	create(
		connection: Connection,
		input: { requestId: string; request: TrialRequest },
	): Promise<{ id: string }>;
	status(
		connection: Connection,
		requestId: string,
	): Promise<StudioRequestStatus | null>;
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

export const unconfirmed = (
	kind: KindName,
	requestId: string,
	message?: string,
) =>
	new ClientError(
		"UNCONFIRMED",
		6,
		message ??
			`처리 여부를 확인하지 못했습니다. ${kind} resume으로 다시 확인하세요. 새로 만들려면 --new를 쓰세요(요금이 다시 나올 수 있습니다).`,
		{ requestId },
	);
export const downloadStopped = (
	kind: KindName,
	resultId: string,
	requestId?: string,
) =>
	new ClientError(
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
// 관리 명령의 변경 요청. 보낸 뒤의 Ctrl+C는 취소가 아니라 적용 여부를 모르는 것이다
export function mutate<T>(request: Promise<T>): Promise<T> {
	onInterrupt(
		() =>
			new ClientError(
				"UNCONFIRMED",
				6,
				"적용됐는지 확인하지 못했습니다. 다시 보고 실행해 주세요.",
			),
	);
	return request.catch(manageError);
}
export function watchInterrupt() {
	process.on("SIGINT", () => {
		discard();
		process.exit(report(interrupted()));
	});
}

// 기록을 못 지워도 결과를 잃지 않는다. 남은 기록은 다음 실행에서 같은 요청 ID로 다시 확인한다
async function releaseOrWarn(...args: Parameters<typeof release>) {
	try {
		await release(...args);
	} catch {
		note("요청 기록을 정리하지 못했습니다.");
	}
}

// 요청 UUID 하나의 상태만 본다. 합성하지 않는다. 같은 조합의 다른 결과는 이 요청의 완료가 아니다
export async function recover(
	kind: Kind,
	connection: Connection,
	requestId: string,
): Promise<StudioResult> {
	const { origin } = connection;
	onInterrupt(() => unconfirmed(kind.name, requestId));
	const row = await kind.status(connection, requestId).catch(() => null);
	if (row?.status === "done") {
		onInterrupt(() => downloadStopped(kind.name, row.id));
		await releaseOrWarn(origin, requestId);
		const { id, createdAt, usage, bytes } = row;
		return { id, createdAt, usage, bytes };
	}
	if (row?.status === "failed") {
		await releaseOrWarn(origin, requestId);
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
		...(/\[[^\]]*\]/.test(request.text)
			? [
					"대괄호 태그를 원문 그대로 보냅니다(모델이 태그를 읽거나 웹과 다른 결과가 될 수 있습니다).",
				]
			: []),
	].map(clean);
}

async function confirm(
	lines: string[],
	{ yes, input }: PaidOptions,
): Promise<void> {
	for (const line of lines) note(line);
	if (yes) return;
	if (!process.stdin.isTTY || input === "-")
		throw confirmRequired(
			"요금이 나올 수 있는 생성입니다. 확인했으면 --yes를 붙여 실행하세요.",
		);
	if (!(await ask("요금이 나올 수 있습니다. 만들까요? [y/N] ")))
		throw canceled();
}

// 서버가 공급자를 부르기 전에 거절한 코드(웹 studio-view의 BEFORE_PROVIDER와 같다)
const BEFORE_PROVIDER = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN"]);
// 사유 없는 NOT_FOUND. 시험 생성은 삭제 대기·처리 중·남의 클론을 선점 전에 이렇게 거절한다
const isNotFound = (error: unknown) =>
	error instanceof ORPCError &&
	error.code === "NOT_FOUND" &&
	!detailOf(error).reason;
async function isRejected(
	kind: Kind,
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

// 합성 요청을 보내는 유일한 곳. 먼저 선점하고, 보내는 것은 한 번뿐이다
async function create(
	kind: Kind,
	connection: Connection,
	request: TrialRequest,
	fresh: boolean,
): Promise<{ source: Source; id: string; requestId?: string }> {
	const { origin, userId } = connection;
	const requestId = randomUUID();
	const { claimed, previous } = await claim(
		fingerprint(origin, userId, request, kind.name),
		{
			origin,
			requestId,
			provider: request.provider,
			createdAt: new Date().toISOString(),
			...(kind.name === "trial" ? { kind: kind.name } : {}),
		},
		fresh,
		() => onInterrupt(() => unconfirmed(kind.name, requestId)),
	);
	// 확인하는 사이 다른 프로세스가 선점했다
	if (!claimed && previous)
		return {
			source: "resumed",
			id: (await recover(kind, connection, previous.requestId)).id,
		};
	if (!fresh) {
		// 앞선 프로세스가 확인하는 사이 끝냈을 수 있다. 완료는 기록이 지워지기 전에 서버에 저장된다
		const found = await kind
			.find(connection, request)
			.catch(async (error: unknown) => {
				await releaseOrWarn(origin, requestId);
				throw error;
			});
		if (found) {
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
) {
	const { json, fresh, dryRun } = options;
	const { origin, client, userId } = connection;
	const record = fresh
		? undefined
		: await recordOf(fingerprint(origin, userId, request, kind.name));
	if (record && !dryRun) {
		const { id } = await recover(kind, connection, record.requestId);
		return kind.finish(connection, "resumed", id);
	}
	const found = fresh ? null : await kind.find(connection, request);
	if (found && !dryRun) return kind.finish(connection, "saved", usable(found));

	let rate: number | null = null;
	if (request.provider === "elevenlabs") {
		const models = await client.trialModels().catch(() => null);
		rate =
			models?.rates.find(({ model }) => model === request.settings.model)
				?.multiplier ?? null;
	}
	const rateKnown = request.provider !== "elevenlabs" || rate !== null;
	const usage = estimate(request, rate);
	const lines = summary(voice, request, usage, rateKnown);
	if (dryRun) {
		const { provider, voiceId } = request;
		return print(
			json,
			{
				origin,
				dryRun: true,
				request: {
					provider,
					voiceId,
					model: request.settings.model,
					characters: codePoints(request.text),
				},
				saved: found,
				requestId: record?.requestId ?? null,
				estimate: usage,
				rateKnown,
				needsConfirm: needsConfirm(request),
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
	}
	if (needsConfirm(request)) await confirm(lines, options);
	const { source, id, requestId } = await create(
		kind,
		connection,
		request,
		fresh,
	);
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
