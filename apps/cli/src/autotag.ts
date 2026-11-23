import { resolve } from "node:path";
import { ORPCError } from "@orpc/client";
import { paragraphStatus } from "@tts-pilot-app/api/make-plan";
import {
	type AutoTagChange,
	type AutoTagTarget,
	applyAutoTag,
	autoTagBatches,
	autoTagChanges,
	autoTagInputOf,
	autoTagTargets,
} from "@tts-pilot-app/api/paragraph-autotag";
import {
	paragraphRequest,
	type Work,
} from "@tts-pilot-app/api/paragraph-script";
import {
	studioAutoTagInputSchema,
	studioAutoTagOutputSchema,
} from "@tts-pilot-app/api/studio-contract";
import type { Args } from "./cli.js";
import { ClientError, connect, detailOf, input, rpcError } from "./client.js";
import { checkOut, saveBytes } from "./files.js";
import { clean, note, print, table } from "./output.js";
import { BEFORE_PROVIDER, confirm, onInterrupt } from "./paid.js";
import {
	inspect,
	onlyOf,
	onlyText,
	resolveWork,
	sourceOf,
	workJson,
	workOf,
} from "./work.js";

// 서버가 한 묶음에 부를 수 있는 텍스트 호출(OpenAI 3, Gemini 1. ADR 0008)
export const CALLS_PER_BATCH = 4;
export const callsLine = (batches: number) =>
	`유료 텍스트 호출 최대 ${batches * CALLS_PER_BATCH}회(서버가 묶음당 최대 ${CALLS_PER_BATCH}회: OpenAI 3, Gemini 1)`;
export const tagUnconfirmed = (detail = {}) =>
	new ClientError(
		"UNCONFIRMED",
		6,
		"자동 태그의 처리 여부를 확인하지 못했습니다. 과금됐을 수 있습니다.",
		detail,
	);
const FIELD_TEXT = {
	text: "대본",
	emotion: "감정",
	style: "말투",
	direction: "말투 지시",
};

// 처리 여부를 모르는 것만 6이다. 나머지는 기존 분류에 과금 안내를 더한다
export function failure(error: unknown): ClientError {
	const detail = detailOf(error);
	const rejected =
		detail.reason !== undefined
			? detail.reason !== "unknown_outcome"
			: error instanceof ORPCError && BEFORE_PROVIDER.has(error.code);
	if (!rejected) return tagUnconfirmed(detail);
	try {
		rpcError(error);
	} catch (known) {
		const result = known as ClientError;
		result.message = `${result.message} 과금됐을 수 있습니다.`;
		return result;
	}
}

// 셸에 붙여 넣을 수 있는 경로나 주소
const quoted = (value: string) =>
	/^[\w.:/-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;

export async function studioAutoTag(args: Args) {
	const { json, url, text, flag } = args;
	const out = text("out") ?? "";
	const overwrite = flag("overwrite");
	checkOut(out, overwrite, [".json"]);
	const source = await sourceOf(args);
	const connection = await connect(url);
	const { origin, voices, client } = connection;
	const { work: value } = await resolveWork(source, connection);
	const work: Work = workOf(value);
	const only = onlyOf(args, work.paragraphs.length);
	const { ps, found, now } = await inspect(connection, work, only);
	const selected = new Set(ps);
	const { targets, skipped } = autoTagTargets(
		work.paragraphs,
		work,
		voices,
		(p) => (selected.has(p) ? paragraphRequest(p, work, voices, now) : null),
		(p) => paragraphStatus(p, work, voices, found, new Map(), now),
	);
	if (!targets.length)
		throw input("자동 태그를 받을 문단이 없습니다(빈 문단·막힌 문단 제외).");
	const batches = autoTagBatches(targets);
	const inputs = batches.map(autoTagInputOf);
	const bad = inputs.flatMap((item, at) => {
		const result = studioAutoTagInputSchema.safeParse(item);
		return result.success
			? []
			: result.error.issues.map(
					({ path }) =>
						batches[at]?.[Number(path[1])]?.n ?? batches[at]?.[0]?.n,
				);
	});
	if (bad.length)
		throw input(
			`자동 태그에 보낼 수 없는 문단: ${[...new Set(bad)].join(", ")}`,
		);
	const calls = batches.length * CALLS_PER_BATCH;
	const lines = [
		`작업실 ${origin}`,
		`자동 태그 문단 ${targets.length}개, 묶음 ${batches.length}개`,
		callsLine(batches.length),
	];
	if (flag("dry-run"))
		return print(
			json,
			{
				origin,
				dryRun: true,
				paragraphs: targets.map(({ n }) => n),
				skipped,
				batches: batches.length,
				maxCalls: calls,
				needsConfirm: true,
			},
			[...lines, `건너뛸 문단 ${skipped}개`].join("\n"),
		);
	await confirm(
		lines,
		{ yes: flag("yes") },
		"자동 태그입니다",
		"추천을 받을까요?",
	);

	const changes: AutoTagChange[] = [];
	let received = 0;
	let kept = skipped;
	// 받은 제안을 적용해 게시한다. Ctrl+C에서도 불려 동기다
	const publish = () => {
		const { paragraphs } = applyAutoTag(
			work.paragraphs,
			work,
			changes,
			new Set(changes.map(({ id }) => id)),
		);
		try {
			saveBytes(out, overwrite, workJson({ ...work, paragraphs }));
		} catch {
			throw new ClientError(
				"DOWNLOAD_FAILED",
				7,
				"자동 태그 결과를 저장하지 못했습니다.",
			);
		}
	};
	// 멈춘 묶음의 안내. 앞에서 받은 묶음이 있으면 먼저 게시한다
	const stopped = (error: ClientError): ClientError => {
		const rest = batches.slice(received).flat();
		const paragraph = rest[0]?.n ?? 0;
		error.message = `문단 ${paragraph}부터 멈췄습니다. ${error.message}`;
		error.detail = { ...error.detail, paragraph };
		if (!received) return error;
		try {
			publish();
		} catch (problem) {
			return problem as ClientError;
		}
		const remaining = onlyText(rest.map(({ n }) => n));
		const path = resolve(out);
		error.detail = { ...error.detail, out: path, remaining };
		note(
			`받은 제안은 ${path}에 저장했습니다. 이어서 받으려면: omni-tts studio autotag --url ${quoted(origin)} --work ${quoted(path)} --only ${remaining} --out ${quoted(path)} --overwrite`,
		);
		return error;
	};
	for (const [at, batch] of batches.entries()) {
		const request = inputs[at];
		if (!request) continue;
		onInterrupt(() => stopped(tagUnconfirmed()));
		try {
			const reply = studioAutoTagOutputSchema.parse(
				await client.studioAutoTag(request),
			);
			if (reply.paragraphs.length !== batch.length)
				throw new Error("문단 수가 다른 응답");
			changes.push(...autoTagChanges(batch, reply));
			kept += reply.skipped;
			received += 1;
		} catch (error) {
			throw stopped(failure(error));
		}
	}
	publish();
	showResult(json, origin, resolve(out), targets, changes, kept);
}

function showResult(
	json: boolean,
	origin: string,
	out: string,
	targets: readonly AutoTagTarget[],
	changes: readonly AutoTagChange[],
	skipped: number,
) {
	const changed = changes.map(({ n, fields, result }) => ({
		n,
		fields,
		// 이미 만든 문단의 제안을 쓰면 다시 만들어야 한다
		remake: result !== null,
	}));
	const remake = changed.filter((row) => row.remake).map(({ n }) => n);
	print(
		json,
		{ origin, out, paragraphs: targets.length, changed, skipped, remake },
		[
			...(changed.length
				? [
						table(
							["문단", "칸", "전", "후"],
							changed.flatMap(({ n, fields }) =>
								fields.map(({ field, before, after }) => [
									n,
									FIELD_TEXT[field],
									before,
									after,
								]),
							),
						),
					]
				: []),
			`저장 ${clean(out)}`,
			`바뀐 문단 ${changed.length}개, 그대로 둔 문단 ${skipped}개`,
			...(remake.length ? [`다시 만들어야 하는 문단 ${onlyText(remake)}`] : []),
		].join("\n"),
	);
}
