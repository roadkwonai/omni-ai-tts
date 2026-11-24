import {
	CHUNK_MAX_BYTES,
	chunkTargets,
	type Found,
	findTargets,
	mergeFound,
	signatureOf,
} from "@tts-pilot-app/api/make-plan";
import {
	blankFor,
	blockOf,
	type Paragraph,
	type ParagraphBlock,
	paragraphRequest,
	spokenOf,
	tooLongOf,
	type VoiceSetup,
	type Work,
} from "@tts-pilot-app/api/paragraph-script";
import {
	DEFAULT_SETTINGS,
	PARAGRAPHS_MAX,
} from "@tts-pilot-app/api/providers/trial-options";
import {
	type ScriptWorkValue,
	scriptWorkShapeSchema,
} from "@tts-pilot-app/api/script-contract";
import { gapOf } from "@tts-pilot-app/api/sound-join";
import { studioRequestSchema } from "@tts-pilot-app/api/studio-contract";
import type { Args } from "./cli.js";
import {
	ClientError,
	type Connection,
	input,
	manageError,
	serverError,
} from "./client.js";
import { readJson } from "./files.js";
import type { Kind } from "./paid.js";
import { fingerprint, recordsFor } from "./requests.js";
import { get, type Script, WORK_BYTES_MAX } from "./scripts.js";
import type { RequestRecord } from "./session.js";
import { studioKind } from "./studio.js";

export type Source =
	| { file: string; work: ScriptWorkValue }
	| { scriptId: string };

// 작업 JSON의 모양을 검사하고 정리된 값을 준다. 문단은 번호로 알린다
function checked(value: unknown): ScriptWorkValue {
	const result = scriptWorkShapeSchema.safeParse(value);
	if (result.success) return result.data;
	const places = result.error.issues.map(({ path }) => {
		const [head, at, ...rest] = path.map(String);
		return head === "paragraphs" && at !== undefined
			? `문단 ${Number(at) + 1}${rest.length ? `의 ${rest.join(".")}` : ""}`
			: path.map(String).join(".") || "작업 전체";
	});
	throw input(`작업 JSON을 확인해 주세요: ${[...new Set(places)].join(", ")}`);
}

// --work의 작업 JSON은 바로 읽고 --script-id는 연결한 뒤에 읽는다
export async function sourceOf({ text, id }: Args): Promise<Source> {
	const file = text("work");
	const scriptId = id(text("script-id"));
	if ((file === undefined) === (scriptId === undefined))
		throw input("--work와 --script-id 중 하나를 선택해 주세요.");
	if (scriptId !== undefined) return { scriptId };
	const path = file ?? "";
	if (path === "-") throw input("--work는 파일이어야 합니다.");
	return { file: path, work: checked(await readJson(path, WORK_BYTES_MAX)) };
}
export async function resolveWork(
	source: Source,
	connection: Connection,
): Promise<{ work: ScriptWorkValue; script?: Script }> {
	if ("work" in source) return { work: source.work };
	const script = await get(connection.client, source.scriptId);
	return { work: checked(script.work), script };
}

// 웹이 대본을 열 때처럼 없는 설정 칸을 처음 값으로 두고 쉼을 0.1초 단위로 맞춘다
export function workOf(value: ScriptWorkValue): Work {
	const { speakers, defaultVoice, ...rest } = value;
	type Voice = NonNullable<typeof defaultVoice>;
	// 값은 요청을 만들 때 서버 계약으로 다시 검사한다(checkRequests)
	const setup = (voice: Voice) =>
		({
			...voice,
			settings: { ...DEFAULT_SETTINGS[voice.provider], ...voice.settings },
		}) as VoiceSetup;
	return {
		...rest,
		channelId: null,
		gap: gapOf(value.gap) ?? value.gap,
		defaultVoice: defaultVoice && setup(defaultVoice),
		paragraphs: value.paragraphs.map(({ gap, voice, ...p }) => ({
			...p,
			...(gap === undefined ? {} : { gap: gapOf(gap) ?? gap }),
			...(voice ? { voice: setup(voice) } : {}),
		})),
		...(speakers
			? {
					speakers: speakers.map(({ name, voice }) => ({
						name,
						voice: voice && setup(voice),
					})),
				}
			: {}),
	};
}
// 작업 JSON(scripts save --work가 받는 모양)
export const workJson = ({ channelId: _, ...work }: Work) =>
	Buffer.from(`${JSON.stringify(work)}\n`);

// --only의 번호(1,3-5). 없으면 전부다
export function onlyOf({ text }: Args, count: number): Set<number> {
	const value = text("only");
	const numbers = new Set<number>();
	if (value === undefined) {
		for (let n = 1; n <= count; n += 1) numbers.add(n);
		return numbers;
	}
	for (const part of value.split(",")) {
		const match = /^\s*([1-9]\d{0,5})(?:-([1-9]\d{0,5}))?\s*$/.exec(part);
		const from = Number(match?.[1]);
		const to = Number(match?.[2] ?? match?.[1]);
		if (!match || from > to || to > count)
			throw input(`--only는 1부터 ${count}까지의 번호여야 합니다(예: 1,3-5).`);
		for (let n = from; n <= to; n += 1) numbers.add(n);
	}
	return numbers;
}
// 번호 목록을 --only 꼴로 줄인다
export function onlyText(numbers: readonly number[]): string {
	const parts: [number, number][] = [];
	for (const n of numbers) {
		const last = parts.at(-1);
		if (last && last[1] === n - 1) last[1] = n;
		else parts.push([n, n]);
	}
	return parts
		.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`))
		.join(",");
}

export type Row = {
	n: number;
	p: Paragraph;
	state: "blank" | "saved" | "make" | "check" | "blocked";
	signature?: string;
	provider?: string;
	block?: ParagraphBlock;
};
// 처리 여부를 모르는 조합. 로컬 기록의 요청 ID나 서버 미확인 결과 ID
export type Check = { requestId?: string; resultId?: string };
export type Inspected = {
	work: Work;
	ps: Paragraph[];
	rows: Row[];
	now: number;
	found: Map<string, Found | null>;
	checks: Map<string, Check>;
	// 완료·확정 실패로 끝난 로컬 기록의 요청 ID. batch만 해제한다
	settled: string[];
};

// 로컬 기록은 저장 완료보다 먼저 본다. 같은 조합의 다른 완료는 그 요청의 완료가 아니다.
// 기록이 완료면 found를 그 결과로, 처리 여부를 모르면 없음으로 바꾼다
export async function judge(
	status: (requestId: string) => ReturnType<Kind["status"]>,
	records: ReadonlyMap<string, RequestRecord | undefined>,
	found: Map<string, Found | null>,
): Promise<Pick<Inspected, "checks" | "settled">> {
	const checks = new Map<string, Check>();
	const settled: string[] = [];
	for (const [signature, record] of records) {
		const row = record && (await status(record.requestId).catch(() => null));
		if (record && row?.status !== "done" && row?.status !== "failed") {
			found.set(signature, null);
			checks.set(signature, { requestId: record.requestId });
			continue;
		}
		if (record) settled.push(record.requestId);
		if (row?.status === "done") {
			const { id, createdAt, usage, bytes } = row;
			found.set(signature, { id, createdAt, usage, bytes, status: "done" });
		}
		const hit = found.get(signature);
		if (hit?.status === "unknown") checks.set(signature, { resultId: hit.id });
	}
	return { checks, settled };
}

// 고른 문단의 저장 결과와 로컬 기록을 본다. 읽기만 한다
export async function inspect(
	connection: Connection,
	work: Work,
	only: ReadonlySet<number>,
): Promise<Inspected> {
	const { client, origin, userId, voices } = connection;
	const now = Date.now();
	const numbers = new Map(work.paragraphs.map((p, i) => [p.id, i + 1]));
	const nOf = (p: Paragraph) => numbers.get(p.id) ?? 0;
	const ps = work.paragraphs.filter((p) => only.has(nOf(p)));
	checkRequests(ps, work, voices, now, nOf);

	// 시작할 때의 로컬 기록. 찾는 사이 다른 프로세스가 선점한 것을 '본 기록'으로 삼지 않게 먼저 읽는다
	const requests = new Map(
		ps.flatMap((p) => {
			const hit = signatureOf(p, work, voices, now);
			return hit ? [[hit.signature, hit.request] as const] : [];
		}),
	);
	const signatures = [...requests.keys()];
	const records = await recordsFor(
		[...requests.values()].map((request) =>
			fingerprint(origin, userId, request),
		),
	);

	let table: ReadonlyMap<string, Found | null> = new Map();
	const targets = findTargets(ps, work, voices, table, true, now);
	for (const chunk of chunkTargets(targets, PARAGRAPHS_MAX, CHUNK_MAX_BYTES)) {
		const results = await client.studioFindMany(chunk).catch(manageError);
		if (!Array.isArray(results) || results.length !== chunk.length)
			throw serverError();
		table = mergeFound(table, chunk, results);
	}
	const found = new Map(table);
	const { status } = studioKind({ json: true, overwrite: false });
	const { checks, settled } = await judge(
		(requestId) => status(connection, requestId),
		new Map(signatures.map((signature, i) => [signature, records[i]])),
		found,
	);

	const rows = ps.map((p): Row => {
		const n = nOf(p);
		if (blankFor(p, work)) return { n, p, state: "blank" };
		const hit = signatureOf(p, work, voices, now, found);
		const signature = hit?.signature;
		const base = { n, p, signature, provider: hit?.request.provider };
		if (signature !== undefined && found.get(signature)?.status === "done")
			return { ...base, state: "saved" };
		const block = blockOf(p, work, voices);
		if (block) return { ...base, state: "blocked", block };
		return {
			...base,
			state:
				signature !== undefined && checks.has(signature) ? "check" : "make",
		};
	});
	return { work, ps, rows, now, found, checks, settled };
}

// 설정 값이 서버 계약에 맞는가. 길이 초과는 막힌 문단으로 따로 알린다
function checkRequests(
	ps: readonly Paragraph[],
	work: Work,
	voices: Connection["voices"],
	now: number,
	nOf: (p: Paragraph) => number,
) {
	const bad = ps.flatMap((p) => {
		try {
			const request = paragraphRequest(p, work, voices, now);
			if (!request || tooLongOf(spokenOf(p), request.provider)) return [];
			const result = studioRequestSchema.safeParse(request);
			if (result.success) return [];
			const paths = result.error.issues.map(({ path }) => path.join("."));
			return [`문단 ${nOf(p)}(${[...new Set(paths)].join(", ")})`];
		} catch {
			return [`문단 ${nOf(p)}(settings)`];
		}
	});
	if (bad.length)
		throw input(`성우 설정이나 글을 확인해 주세요: ${bad.join(", ")}`);
}

const number = new Intl.NumberFormat("ko-KR");
const blockText = (block: ParagraphBlock) => {
	if (block === "no_voice") return "성우 없음";
	if (block === "unavailable") return "지금 쓸 수 없는 성우";
	if (block === "empty") return "빈 문단";
	return `글자 수 초과 ${number.format(block.length)}/${number.format(block.max)}자`;
};
// 막힌 문단이 하나라도 있으면 모두 알리고 멈춘다
export function refuseBlocked(rows: readonly Row[]) {
	const blocked = rows.flatMap(({ n, block }) =>
		block ? [{ n, reason: blockText(block) }] : [],
	);
	if (!blocked.length) return;
	throw new ClientError(
		"BLOCKED",
		2,
		`만들 수 없는 문단이 있습니다: ${blocked.map(({ n, reason }) => `${n}(${reason})`).join(", ")}`,
		{ paragraphs: blocked },
	);
}
