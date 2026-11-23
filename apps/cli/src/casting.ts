import { extname, resolve } from "node:path";
import type {
	ConnectionStatus,
	ProviderId,
	Voice,
	VoiceListInput,
	VoiceListResult,
	VoiceSource,
} from "@tts-pilot-app/api/providers/contract";
import { isSampleUrl } from "@tts-pilot-app/api/providers/sample-hosts";
import type { Args } from "./cli.js";
import {
	ClientError,
	connect,
	input,
	manageError,
	REASON_TEXT,
} from "./client.js";
import { checkOut, saveBytes } from "./files.js";
import { byteText, clean, note, print, table } from "./output.js";
import { mutate } from "./paid.js";
import {
	PROVIDERS,
	parseRef,
	refOf,
	remember,
	resolveVoice,
} from "./voices.js";

const STATUS_TEXT: Record<ConnectionStatus, string> = {
	connected: "연결됨",
	no_key: "키 없음",
	provider_auth: "키 거절",
	no_permission: "권한 부족",
	quota: "잔액·한도 부족",
	rate_limit: "요청 한도",
	provider_error: "공급자 오류",
	check_failed: "확인 실패",
};
export async function providersStatus({ json, url, text }: Args) {
	const { origin, client } = await connect(url);
	const one = text("provider");
	const providers = await Promise.all(
		(one ? [one] : PROVIDERS).map((provider) =>
			client
				.providerStatus({ provider: provider as ProviderId })
				.catch(manageError),
		),
	);
	print(
		json,
		{ origin, providers },
		table(
			["공급자", "상태", "남은 사용량", "전체", "다시 확인(초)"],
			providers.map((item) => [
				item.provider,
				STATUS_TEXT[item.status] ?? item.status,
				item.quota?.remaining ?? "정보 없음",
				item.quota?.total ?? "정보 없음",
				item.retryAfterSeconds ?? "",
			]),
		),
	);
}

function noteStale(stale: VoiceListResult["stale"]) {
	if (!stale) return;
	note(`지난 목록입니다: ${REASON_TEXT[stale.reason] ?? stale.reason}`);
	if (stale.retryAt) note(`다음 요청 가능 시각 ${stale.retryAt}`);
}

// 공급자·출처마다 받는 조건
const CONDITIONS: Record<string, string[]> = {
	typecast: ["q", "gender"],
	airy: ["q", "gender"],
	gemini: ["q", "gender"],
	"elevenlabs public": [
		...["source", "q", "language", "accent", "gender", "age", "category"],
		...["use-case", "descriptive", "featured", "sort", "page"],
	],
	"elevenlabs account": [
		...["source", "q", "voice-type", "category", "gender", "age", "language"],
		...["accent", "use-case", "sort", "direction", "cursor"],
	],
	"fish_audio public": [
		...["source", "q", "language", "tag", "licensed", "sort", "page"],
	],
	"fish_audio account": [
		...["source", "q", "language", "tag", "licensed", "sort", "page"],
	],
};
function pageOf(value: string | undefined, min: number, max: number): number {
	if (value === undefined) return min;
	const page = Number(value);
	if (!/^\d+$/.test(value) || page < min || page > max)
		throw input(`--page는 ${min}부터 ${max}까지의 정수여야 합니다.`);
	return page;
}

// 조건의 값은 서버가 다시 검사한다(BAD_REQUEST → 2)
export function listInputOf({
	text,
	list,
	flag,
	given,
}: Pick<Args, "text" | "list" | "flag" | "given">): VoiceListInput {
	const provider = text("provider") ?? "";
	const source = text("source") ?? "public";
	if (source !== "public" && source !== "account")
		throw input("--source는 public이나 account여야 합니다.");
	const whole = ["typecast", "airy", "gemini"].includes(provider);
	const allowed = CONDITIONS[whole ? provider : `${provider} ${source}`] ?? [];
	const denied = given.filter(
		(name) =>
			!["provider", "json", "url"].includes(name) && !allowed.includes(name),
	);
	if (denied.length)
		throw input(
			`이 공급자와 출처가 받지 않는 조건입니다: ${denied.map((name) => `--${name}`).join(", ")}`,
		);
	if (whole) {
		const gender = text("gender");
		if (gender && !["male", "female", "neutral"].includes(gender))
			throw input("--gender는 male, female, neutral 가운데 하나여야 합니다.");
		return { provider } as VoiceListInput;
	}
	const language = text("language") ?? (source === "public" ? "ko" : "all");
	const common = {
		search: text("q") ?? "",
		language: language === "all" ? null : language,
	};
	const pick = (name: string) => text(name) ?? null;
	if (provider === "fish_audio")
		return {
			provider,
			source,
			page: pageOf(text("page"), 1, 10),
			query: {
				...common,
				tags: list("tag"),
				licensed: flag("licensed"),
				sort: text("sort") ?? "score",
			},
		} as VoiceListInput;
	const people = {
		accent: pick("accent"),
		gender: pick("gender"),
		age: pick("age"),
		category: pick("category"),
		useCases: list("use-case"),
	};
	return (
		source === "public"
			? {
					provider,
					source,
					page: pageOf(text("page"), 0, 999),
					query: {
						...common,
						...people,
						descriptives: list("descriptive"),
						featured: flag("featured"),
						sort: text("sort") ?? "trending",
					},
				}
			: {
					provider,
					source,
					cursor: pick("cursor"),
					query: {
						...common,
						...people,
						voiceType: pick("voice-type"),
						sort: text("sort") ?? "created_at_unix",
						direction: text("direction") ?? "desc",
					},
				}
	) as VoiceListInput;
}

const normal = (value: string) => value.normalize("NFC").trim().toLowerCase();
export async function search(args: Args) {
	const { json, url, text } = args;
	const listInput = listInputOf(args);
	const connection = await connect(url);
	const result = await connection.client
		.voiceList(listInput)
		.catch(manageError);
	// 목록 전체를 주는 공급자는 여기서 거른다
	const whole = !("query" in listInput);
	const needle = normal(text("q") ?? "");
	const gender = text("gender");
	const found = whole
		? result.voices.filter(
				(voice) =>
					(!gender || voice.gender === gender) &&
					[voice.name, voice.englishName ?? "", voice.voiceId].some((value) =>
						normal(value).includes(needle),
					),
			)
		: result.voices;
	// 목록 전체를 주는 공급자는 다시 목록에서 찾는다(수백 명이 다른 공급자의 자리를 밀어내지 않게)
	if (!whole) await remember(connection, found);
	noteStale(result.stale);
	const { provider, next, totalExact, windowLimited } = result;
	const source: VoiceSource = result.source;
	const total = whole ? found.length : result.total;
	const { fetchedAt, stale } = result;
	const voices = found.map((voice) => ({ ...voice, ref: refOf(voice) }));
	print(
		json,
		{
			origin: connection.origin,
			provider,
			source,
			voices,
			next,
			total,
			totalExact,
			windowLimited,
			fetchedAt,
			stale,
		},
		[
			voices.length
				? table(
						["성우", "공급자:성우 ID", "성별", "연령", "언어", "샘플"],
						voices.map((voice) => [
							voice.name,
							voice.ref,
							voice.gender ?? "",
							voice.age ?? "",
							voice.languages?.join(", ") ?? "",
							sampleUrls(voice).length,
						]),
					)
				: "찾은 성우가 없습니다.",
			...(next === null
				? []
				: [
						clean(
							`다음 페이지 --${typeof next === "number" ? "page" : "cursor"} ${next}`,
						),
					]),
		].join("\n"),
	);
}

export async function accents({ json, url, text }: Args) {
	const { origin, client } = await connect(url);
	const result = await client
		.voiceAccents({ language: text("language") ?? "" })
		.catch(manageError);
	noteStale(result.stale);
	print(
		json,
		{ origin, ...result },
		result.accents.length
			? table(
					["억양", "이름"],
					result.accents.map(({ value, name }) => [value, name]),
				)
			: "억양이 없습니다.",
	);
}

// 캐시를 만료시킬 뿐 공급자를 부르지 않는다
export async function refresh({ json, url, text }: Args) {
	const provider = text("provider") as ProviderId;
	const { origin, client } = await connect(url);
	const { retryAt } = await mutate(client.voiceListRefresh({ provider }));
	print(
		json,
		{ origin, provider, retryAt },
		retryAt
			? `공급자 요청 한도라 새로 고치지 않았습니다. 다음 요청 가능 시각 ${clean(retryAt)}`
			: "다음 검색에서 목록을 새로 받습니다.",
	);
}

const SAMPLE_MAX = 32 * 1024 * 1024;
const SAMPLE_MIME: Record<string, string> = {
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".m4a": "audio/mp4",
	".ogg": "audio/ogg",
};
const sampleUrls = (voice: Voice) => [
	...new Set([
		...(voice.previewUrl ? [voice.previewUrl] : []),
		...(voice.samples ?? []).map(({ url }) => url),
	]),
];
// 앞 바이트로 판정한 실제 형식
function formatOf(body: Buffer): string | undefined {
	const at = (start: number, end: number) =>
		body.toString("latin1", start, end);
	if (at(0, 4) === "RIFF" && at(8, 12) === "WAVE") return ".wav";
	if (at(0, 4) === "OggS") return ".ogg";
	if (at(4, 8) === "ftyp") return ".m4a";
	const [first = 0, second = 0] = body;
	// MPEG 프레임 동기와 Layer III. 다른 레이어 값은 AAC(ADTS)나 UTF-16 글(FF FE)이다
	if (
		at(0, 3) === "ID3" ||
		(first === 0xff && (second & 0xe0) === 0xe0 && (second & 0x06) === 0x02)
	)
		return ".mp3";
	return undefined;
}
const sampleFailed = () =>
	new ClientError("SAMPLE_FAILED", 5, "기본 샘플을 받지 못했습니다.");
// 공급자 샘플 주소에는 세션 쿠키와 origin을 보내지 않고 리다이렉트를 따라가지 않는다
export async function fetchSample(url: string): Promise<Buffer> {
	try {
		const response = await fetch(url, {
			redirect: "error",
			signal: AbortSignal.timeout(30_000),
		});
		// content-type은 보지 않는다. ElevenLabs가 MP3를 text/plain으로 주고, 형식은 앞 바이트(formatOf)가 정한다
		if (!response.ok || !response.body) {
			await response.body?.cancel();
			throw sampleFailed();
		}
		const chunks: Uint8Array[] = [];
		let size = 0;
		for await (const chunk of response.body) {
			size += chunk.byteLength;
			// 반복을 끝내면 본문도 끊긴다
			if (size > SAMPLE_MAX) throw sampleFailed();
			chunks.push(chunk);
		}
		return Buffer.concat(chunks);
	} catch {
		throw sampleFailed();
	}
}

export async function sample({ json, url, text, flag, extra }: Args) {
	const ref = extra[0] ?? "";
	const out = text("out") ?? "";
	const overwrite = flag("overwrite");
	const index = text("index") ?? "0";
	if (!/^\d+$/.test(index)) throw input("--index는 0부터의 정수여야 합니다.");
	parseRef(ref);
	checkOut(out, overwrite, Object.keys(SAMPLE_MIME));
	const connection = await connect(url);
	const { voice } = await resolveVoice(connection, ref);
	const address = sampleUrls(voice)[Number(index)];
	if (!address)
		throw new ClientError("NOT_FOUND", 4, "이 성우에 그 기본 샘플이 없습니다.");
	if (!address.startsWith("https://") || !isSampleUrl(voice.provider, address))
		throw new ClientError(
			"SAMPLE_BLOCKED",
			5,
			"공급자의 샘플 주소가 아니라 받지 않았습니다.",
		);
	if (voice.provider === "gemini") note("참고 음성(Gemini 소리가 아님)입니다.");
	const body = await fetchSample(address);
	const format = formatOf(body);
	if (!format) throw sampleFailed();
	if (extname(out).toLowerCase() !== format)
		throw input(`이 샘플은 ${format} 파일로 받아야 합니다.`);
	try {
		saveBytes(out, overwrite, body);
	} catch {
		throw new ClientError(
			"DOWNLOAD_FAILED",
			7,
			"샘플 파일을 저장하지 못했습니다.",
		);
	}
	const bytes = body.byteLength;
	print(
		json,
		{
			origin: connection.origin,
			ref,
			index: Number(index),
			out: resolve(out),
			mime: SAMPLE_MIME[format],
			bytes,
		},
		`저장 ${clean(resolve(out))}\n크기 ${byteText(bytes)}`,
	);
}
