import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	type MakeItem,
	makePlan,
	usageByProvider,
} from "@tts-pilot-app/api/make-plan";
import {
	unreviewedCount,
	unreviewedList,
} from "@tts-pilot-app/api/paragraph-script";
import { needsConfirm } from "@tts-pilot-app/api/providers/trial-options";
import type { ScriptWorkValue } from "@tts-pilot-app/api/script-contract";
import { scriptWorkProblem } from "@tts-pilot-app/api/script-rules";
import type { Args } from "./cli.js";
import { ClientError, type Connection, connect, input } from "./client.js";
import { checkFolder, extensionOf, fileSize, saveBytes } from "./files.js";
import { canceled, note, print, table, usageText } from "./output.js";
import {
	confirm,
	create,
	downloadStopped,
	type Kind,
	type Mode,
	onInterrupt,
	onReport,
	releaseOrWarn,
} from "./paid.js";
import { fingerprint } from "./requests.js";
import type { Script } from "./scripts.js";
import { downloadTo, infoOf, mimeOf, studioKind } from "./studio.js";
import {
	type Check,
	type Inspected,
	inspect,
	onlyOf,
	type Row,
	refuseBlocked,
	resolveWork,
	sourceOf,
	workOf,
} from "./work.js";

const STATE_TEXT: Record<Row["state"], string> = {
	blank: "빈 문단",
	saved: "저장됨",
	make: "만들 것",
	check: "확인 필요",
	blocked: "막힘",
};

// 만들 문단(같은 조합은 하나)과 예상 사용량
async function planned(
	connection: Connection,
	{ work, ps, rows, now, found, checks }: Inspected,
	retry: boolean,
) {
	const numbers = new Map(rows.map(({ p, n }) => [p.id, n]));
	// makePlan의 번호는 고른 문단 안의 차례라 작업의 번호로 바꾼다
	const make = makePlan(ps, work, connection.voices, found, now)
		.make.filter((item) => retry || !checks.has(item.signature))
		.map((item) => ({ ...item, n: numbers.get(item.id) ?? item.n }));
	const ids = new Set(make.map((item) => item.id));
	const making = ps.filter((p) => ids.has(p.id));
	return {
		...(await usageOf(connection, make, now)),
		unreviewed: unreviewedCount(making),
		unreviewedText: unreviewedList(making),
	};
}
// 만들 것의 공급자별 예상 사용량. 모두 무료 모델일 때만 묻지 않는다
export async function usageOf(
	{ client }: Connection,
	make: MakeItem[],
	now: number,
) {
	const rates = make.some(({ request }) => request.provider === "elevenlabs")
		? ((await client.trialModels().catch(() => null))?.rates ?? [])
		: [];
	const usage = usageByProvider(
		make,
		({ settings }) =>
			rates.find(({ model }) => model === settings.model)?.multiplier ?? null,
		now,
	);
	return {
		make,
		usage,
		needsConfirm: make.some(({ request }) => needsConfirm(request, now)),
	};
}
export const usageLines = (
	what: string,
	{ make, usage }: Pick<Awaited<ReturnType<typeof usageOf>>, "make" | "usage">,
) => [
	`만들 ${what} ${make.length}개`,
	...usage.map(
		(row) =>
			`예상 사용량 ${row.provider} ${row.count}개 ${usageText(row.usage)}${row.rateMissing ? " (배율을 확인하지 못했어요)" : ""}`,
	),
];
type Planned = Awaited<ReturnType<typeof planned>>;
const planLines = (plan: Planned) => [
	...usageLines("문단", plan),
	...(plan.unreviewed
		? [`검수하지 않은 숫자 ${plan.unreviewed}개: ${plan.unreviewedText}`]
		: []),
];
function showPlan(
	json: boolean,
	origin: string,
	{ rows, found, checks }: Inspected,
	plan: Planned,
) {
	const count = (state: Row["state"]) =>
		rows.filter((row) => row.state === state).length;
	const paragraphs = rows.map(({ n, state, signature }) => ({
		n,
		status: state,
		...(state === "saved"
			? { resultId: found.get(signature ?? "")?.id }
			: state === "check"
				? checks.get(signature ?? "")
				: {}),
	}));
	print(
		json,
		{
			origin,
			dryRun: true,
			paragraphs,
			make: plan.make.length,
			saved: count("saved"),
			check: count("check"),
			blank: count("blank"),
			estimate: plan.usage,
			unreviewed: plan.unreviewed,
			unreviewedText: plan.unreviewedText,
			needsConfirm: plan.needsConfirm,
		},
		[
			table(
				["문단", "상태", "결과·요청 ID"],
				paragraphs.map((row) => [
					row.n,
					STATE_TEXT[row.status],
					("requestId" in row ? row.requestId : row.resultId) ?? "",
				]),
			),
			...planLines(plan),
		].join("\n"),
	);
}

export async function studioPlan(args: Args) {
	const source = await sourceOf(args);
	const connection = await connect(args.url);
	const { work: value } = await resolveWork(source, connection);
	const work = workOf(value);
	const only = onlyOf(args, work.paragraphs.length);
	const inspected = await inspect(connection, work, only);
	refuseBlocked(inspected.rows);
	const plan = await planned(connection, inspected, false);
	showPlan(args.json, connection.origin, inspected, plan);
}

// 묶음의 한 칸. result는 저장된 결과(시험 생성은 크기를 모른다)
export type Job = {
	n: number;
	signature: string;
	mime: string;
	result?: { id: string; bytes?: number };
};
// 묶음의 진행 파일. 있는 소리 파일을 그대로 둘지 이것으로 판단한다
export type Item = {
	n: number;
	resultId: string;
	bytes: number;
	mime: string;
	file: string;
};
const PROGRESS = "omni-tts-result.json";
function readProgress(path: string, origin: string): Item[] {
	if (fileSize(path, PROGRESS) === undefined) return [];
	let value: { version?: unknown; origin?: unknown; items?: unknown } | null;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		value = null;
	}
	if (
		value?.version !== 1 ||
		value.origin !== origin ||
		!Array.isArray(value.items)
	)
		throw input(
			`${PROGRESS}이 이 작업실의 진행 파일이 아닙니다. 다른 폴더를 쓰거나 그 파일을 옮겨 주세요.`,
		);
	return value.items.filter(
		(item): item is Item => typeof item?.n === "number",
	);
}
// 문단이 끝날 때마다 통째로 바꾼다(0600 임시 파일, 원자 교체)
const writeProgress = (path: string, origin: string, items: Item[]) =>
	saveBytes(
		path,
		true,
		Buffer.from(`${JSON.stringify({ version: 1, origin, items })}\n`),
	);

export const fileName = (n: number, mime: string) =>
	`${String(n).padStart(3, "0")}${extensionOf(mime)}`;
// 폴더와 진행 파일, 문단마다의 출력 경로를 만들기 전에 모두 본다.
// 있는 소리 파일은 진행 파일의 결과 ID와 크기가 지금 결과와 같을 때만 그대로 둔다
export function openFolder(
	dir: string,
	origin: string,
	outputs: readonly Pick<Job, "n" | "mime" | "result">[],
	overwrite: boolean,
) {
	checkFolder(dir, "--out-dir의 폴더");
	const progress = join(dir, PROGRESS);
	const items = readProgress(progress, origin);
	const kept = new Set<number>();
	const taken: string[] = [];
	for (const { n, mime, result } of outputs) {
		const file = fileName(n, mime);
		const size = fileSize(join(dir, file), file);
		if (size === undefined) continue;
		const item = items.find((entry) => entry.n === n);
		if (
			result &&
			item?.resultId === result.id &&
			item.bytes === (result.bytes ?? item.bytes) &&
			item.file === file &&
			size === item.bytes
		)
			kept.add(n);
		else if (!overwrite) taken.push(file);
	}
	if (taken.length)
		throw input(
			`이미 있는 파일이 있습니다: ${taken.join(", ")}. 바꾸려면 --overwrite를 쓰세요.`,
		);
	return { progress, items, kept };
}

// 파일로 만든 작업의 최근 대본 id. 같은 작업실·사용자·파일이면 같다(v5 꼴)
function workIdOf(...parts: string[]): string {
	const hash = createHash("sha256").update(JSON.stringify(parts)).digest();
	hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
	hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
	const hex = hash.toString("hex", 0, 16);
	return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}
// 첫 생성 요청을 보낼 때 최근 대본에 한 번 남긴다. 만들기를 막지 않고, 끝나기 전에 최대 5초 기다린다
function recentOf(
	{ client, origin, userId }: Connection,
	work: ScriptWorkValue,
	from: { script?: Script; file?: string },
) {
	const controller = new AbortController();
	const { script, file = "" } = from;
	// 보낸 뒤에는 던지지 않게 경로를 미리 본다
	const workId = script
		? (script.workId ?? script.id)
		: workIdOf(origin, userId, realpathSync(file));
	const channelId = script?.channelId ?? null;
	let sent: Promise<unknown> | undefined;
	return {
		record() {
			if (sent || scriptWorkProblem(work)) return;
			sent = client
				.scriptRecordRecent(
					{ workId, channelId, work },
					{ signal: controller.signal },
				)
				.catch(() => note("최근 대본에 남기지 못했습니다."));
		},
		async wait() {
			const timer = setTimeout(() => controller.abort(), 5000);
			await sent;
			clearTimeout(timer);
		},
	};
}

// 묶음의 이름. 문단은 작업실 결과, 줄은 시험 생성 결과다
export type Label = {
	what: "문단" | "줄";
	one: "paragraph" | "line";
	many: "paragraphs" | "lines";
	kind: "studio" | "trial";
};
const PARAGRAPH: Label = {
	what: "문단",
	one: "paragraph",
	many: "paragraphs",
	kind: "studio",
};
const again = ({ kind }: Label) =>
	`${kind} resume이나 같은 명령으로 다시 확인하세요. 새로 만들려면 --retry-unconfirmed를 쓰세요(요금이 다시 나올 수 있습니다).`;
// 오류와 Ctrl+C의 안내에 번호와 이어 가는 길을 더한다
function numbered(label: Label, n: number) {
	return (error: ClientError) => {
		if (error.code === "UNCONFIRMED")
			error.message = `처리 여부를 확인하지 못했습니다. ${again(label)}`;
		error.message = `${label.what} ${n}: ${error.message}`;
		error.detail = { ...error.detail, [label.one]: n };
		return error;
	};
}
// 처리 여부를 모르는 것이 하나라도 있으면 확인을 묻기 전에 멈춘다
export function refuseUnconfirmed(
	label: Label,
	pending: readonly ({ n: number } & Check)[],
) {
	if (!pending.length) return;
	const list = pending.map(
		({ n, requestId, resultId }) =>
			`${n}(${requestId ? `요청 ID ${requestId}` : `결과 ID ${resultId}`})`,
	);
	throw new ClientError(
		"UNCONFIRMED",
		6,
		`처리 여부를 모르는 ${label.what}이 있습니다: ${list.join(", ")}. ${again(label)}`,
		{ [label.many]: [...pending] },
	);
}

// 만든 것 하나. item은 응답의 오디오를 이미 파일로 둔 것, stop은 파일을 두고 멈출 이유다
export type Made = {
	id: string;
	source: string;
	item?: Item;
	stop?: ClientError;
};
export type Done = Item & { source: string; out: string };
// 번호 순서로 하나씩: 저장된 것은 받고 없는 것은 만든다. 실패하면 그 자리에서 멈추고 끝낸 것은 남는다
export async function runJobs(
	label: Label,
	{
		dir,
		origin,
		jobs,
		folder,
	}: {
		dir: string;
		origin: string;
		jobs: readonly Job[];
		folder: ReturnType<typeof openFolder>;
	},
	make: (job: Job) => Promise<Made>,
	fetch: (id: string, n: number) => Promise<Item>,
): Promise<Done[]> {
	const { items, kept, progress } = folder;
	const ready = new Map(
		jobs.flatMap(({ signature, result }) =>
			result ? [[signature, result.id] as const] : [],
		),
	);
	const done: Done[] = [];
	for (const job of jobs) {
		const { n, signature } = job;
		onReport(numbered(label, n));
		onInterrupt(canceled);
		try {
			const id = ready.get(signature);
			const made: Made =
				id === undefined ? await make(job) : { id, source: "saved" };
			ready.set(signature, made.id);
			const old = kept.has(n)
				? items.find((entry) => entry.n === n)
				: undefined;
			const item = old ?? made.item ?? (await fetch(made.id, n));
			if (!old) {
				const others = items.filter((entry) => entry.n !== n);
				items.splice(0, items.length, ...others, item);
				items.sort((a, b) => a.n - b.n);
				try {
					writeProgress(progress, origin, items);
				} catch {
					throw new ClientError(
						"DOWNLOAD_FAILED",
						7,
						`${PROGRESS}을 저장하지 못했습니다.`,
						{ resultId: made.id },
					);
				}
			}
			done.push({
				...item,
				source: old ? "kept" : made.source,
				out: join(dir, item.file),
			});
			if (made.stop) throw made.stop;
		} catch (error) {
			if (!(error instanceof ClientError)) throw error;
			if (done.length)
				note(
					`끝낸 ${label.what} ${done.length}개는 그대로 있습니다. 같은 명령으로 이어 갈 수 있습니다.`,
				);
			throw numbered(label, n)(error);
		}
	}
	onReport((error) => error);
	onInterrupt(canceled);
	return done;
}
export const doneRows = (done: readonly Done[]) =>
	done.map(({ n, source, resultId, bytes, mime, out }) => ({
		n,
		source,
		resultId,
		bytes,
		mime,
		out,
	}));
export const doneTable = ({ what }: Label, done: readonly Done[]) =>
	done.length
		? table(
				[what, "처리", "결과 ID", "파일"],
				done.map((row) => [
					row.n,
					SOURCE_TEXT[row.source] ?? row.source,
					row.resultId,
					row.out,
				]),
			)
		: `만들 ${what}이 없습니다.`;
const SOURCE_TEXT: Record<string, string> = {
	created: "만듦",
	saved: "저장 결과",
	resumed: "저장 결과",
	kept: "그대로",
};

export async function studioBatch(args: Args) {
	const { json, url, text, flag } = args;
	const dir = resolve(text("out-dir") ?? "");
	const overwrite = flag("overwrite");
	const retry = flag("retry-unconfirmed");
	const source = await sourceOf(args);
	checkFolder(dir, "--out-dir의 폴더");
	const connection = await connect(url);
	const { origin, userId } = connection;
	const { work: value, script } = await resolveWork(source, connection);
	const work = workOf(value);
	const only = onlyOf(args, work.paragraphs.length);
	const inspected = await inspect(connection, work, only);
	const { rows, found, checks, settled } = inspected;
	refuseBlocked(rows);
	const plan = await planned(connection, inspected, retry);
	const making = new Map(plan.make.map((item) => [item.signature, item]));
	const jobs = rows.flatMap(({ n, state, signature, provider }): Job[] => {
		if (state === "blank" || signature === undefined) return [];
		const hit = found.get(signature);
		const result = hit?.status === "done" ? hit : undefined;
		return [{ n, signature, mime: mimeOf(provider ?? ""), result }];
	});
	const dryRun = flag("dry-run");
	if (!retry && !dryRun)
		refuseUnconfirmed(
			PARAGRAPH,
			rows.flatMap(({ n, state, signature }) =>
				state === "check" ? [{ n, ...checks.get(signature ?? "") }] : [],
			),
		);
	// 확인 필요한 문단은 다시 만들 때만 쓴다
	const written = jobs.filter((job) => retry || !checks.has(job.signature));
	const folder = openFolder(dir, origin, written, overwrite);
	if (dryRun) return showPlan(json, origin, inspected, plan);

	const recent = recentOf(connection, value, {
		script,
		file: "file" in source ? source.file : undefined,
	});
	for (const requestId of settled) await releaseOrWarn(origin, requestId);
	if (plan.needsConfirm)
		await confirm(planLines(plan), { yes: flag("yes") }, "묶음 생성입니다");

	const base = studioKind({ json, overwrite });
	const kind: Kind = {
		...base,
		create(...input) {
			recent.record();
			return base.create(...input);
		},
	};
	// 결과는 최근 대본을 기다린 뒤에 알린다. 기다리는 동안 Ctrl+C를 눌러도 stdout은 한 건이다
	const done = await runJobs(
		PARAGRAPH,
		{ dir, origin, jobs, folder },
		async ({ signature }) => {
			const item = making.get(signature);
			if (!item) throw input("만들 요청을 찾지 못했습니다.");
			return create(
				kind,
				connection,
				{
					key: fingerprint(origin, userId, item.request),
					provider: item.request.provider,
					request: item.request,
				},
				modeOf(checks.get(signature)),
			);
		},
		(id, n) => fetchTo(connection, id, dir, n, overwrite),
	).finally(() => recent.wait());
	print(
		json,
		{
			origin,
			outDir: dir,
			made: done.filter((row) => row.source === "created").length,
			paragraphs: doneRows(done),
		},
		doneTable(PARAGRAPH, done),
	);
}
// 처리 여부를 모르는 것은 시작할 때 본 기록이 그대로일 때만 다시 만든다
export const modeOf = (check: Check | undefined): Mode =>
	check ? { retry: check.requestId } : "reuse";

// 결과 하나를 폴더에 실제 형식의 이름으로 받는다
async function fetchTo(
	connection: Connection,
	id: string,
	dir: string,
	n: number,
	overwrite: boolean,
): Promise<Item> {
	onInterrupt(() => downloadStopped("studio", id));
	const info = await infoOf(connection, id);
	const file = fileName(n, info.audioType);
	await downloadTo(connection, info, join(dir, file), overwrite);
	return { n, resultId: id, bytes: info.bytes, mime: info.audioType, file };
}
