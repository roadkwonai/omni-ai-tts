import {
	codePoints,
	normalizeText,
	RANGES,
	type Usage,
} from "./providers/trial-options";

// 드라마 작업실(T9.5 스펙)의 값과 순수 함수다. 화면과 서버가 함께 쓴다.
// zod·node:*·Buffer를 쓰지 않는다(화면 번들). 바이트는 Uint8Array·DataView로 다룬다.

// Fish model 헤더에 그대로 들어간다. 철자가 틀리면 Fish가 유료 s2.1-pro로 조용히 바꾼다
export const DRAMA_MODELS = ["s2.1-pro-free", "s2.1-pro", "drama-3"] as const;
export type DramaModel = (typeof DRAMA_MODELS)[number];

export const DRAMA_SPEAKERS_MAX = 4;
export const DRAMA_NAME_MAX = 20;
export const DRAMA_SCENE_NAME_MAX = 40;
export const DRAMA_LINES_MAX = 50;
export const DRAMA_LINE_MAX = 300;
export const DRAMA_DIRECTION_MAX = 60;
export const DRAMA_SCENE_MAX = 2000;
export const DRAMA_RESULTS_SHOWN = 20;
export const DRAMA_SAMPLE_RATE = 44100;
export const WAV_HEADER_BYTES = 44;
// drama-3 출시 기념가($10/100만 바이트)가 끝나는 시각(블로그 기준 2026-11-12, 그날 0시 KST)
export const DRAMA_LAUNCH_UNTIL = Date.parse("2026-11-12T00:00:00+09:00");

export type DramaSpeaker = { name: string; voiceId: string };
export type DramaLine = { speaker: number; direction: string; text: string };
export type DramaScript = {
	sceneName: string;
	speakers: DramaSpeaker[];
	lines: DramaLine[];
};
export type DramaSettings = { speed: number; temperature: number };
export type DramaRequest = DramaScript & {
	model: DramaModel;
	settings: DramaSettings;
};
export type AlignedSegment = { text: string; start: number; end: number };
export type SceneChunk = {
	seq: number;
	offset: number;
	duration: number;
	segments: AlignedSegment[];
};
export type LineSpan = {
	start: number;
	end: number;
	cutStart: number;
	cutEnd: number;
};
export type SceneRequest = {
	model: DramaModel;
	text: string;
	referenceIds: string[];
} & DramaSettings;
export type SceneAudio = { pcm: Uint8Array; segments: AlignedSegment[] | null };

export const DRAMA_SETTINGS: DramaSettings = {
	speed: RANGES.fish_audio.speed.default,
	temperature: RANGES.fish_audio.temperature.default,
};

// 지시의 [ ]는 지우고(Fish가 대괄호로 다시 감싼다) 공백류는 하나로 한다
export function cleanDirection(raw: string): string {
	return raw.normalize("NFC").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

const oneLine = (text: string) =>
	normalizeText(text).replace(/\s*\r?\n\s*/g, " ");

// 장면 글자 수: 정리한 지시 + 대사의 코드 포인트(화자 표식 제외)
export function sceneChars(
	lines: readonly Pick<DramaLine, "direction" | "text">[],
): number {
	let sum = 0;
	for (const line of lines)
		sum +=
			codePoints(normalizeText(line.text)) +
			codePoints(cleanDirection(line.direction));
	return sum;
}

// 속도가 느릴수록 같은 글이 길게 읽혀 오디오 상한(32MiB)을 넘는다(계획 E6)
export const sceneLimit = (speed: number) =>
	Math.floor(DRAMA_SCENE_MAX * Math.min(1, speed));

// 보낼 글과 reference_id. 쓰인 화자만 줄 순서로 처음 나온 때 번호를 받는다
export function sceneText(script: Pick<DramaScript, "speakers" | "lines">): {
	text: string;
	referenceIds: string[];
} {
	const order: number[] = [];
	for (const line of script.lines)
		if (!order.includes(line.speaker)) order.push(line.speaker);
	const marked = order.length > 1;
	const text = script.lines
		.map((line) => {
			const direction = cleanDirection(line.direction);
			return `${marked ? `<|speaker:${order.indexOf(line.speaker)}|>` : ""}${
				direction ? `[${direction}] ` : ""
			}${oneLine(line.text)}`;
		})
		.join("\n");
	return {
		text,
		referenceIds: order.map((i) => script.speakers[i]?.voiceId ?? ""),
	};
}

// 같은 대본이면 같은 글자다(테이크 묶기)
export const takeKey = (script: Pick<DramaScript, "speakers" | "lines">) =>
	JSON.stringify(sceneText(script));

// 줄 나누기: 세그먼트 글자와 대사 글자를 비교한다(스펙 '스펙과 다른 점' 12·13).
// 세그먼트·대사 모두 지시·태그와 쌍 태그 이름 7종을 뺀 글자·숫자만 남긴다
export const TAG_NAMES = "whisper|emphasis|soft|fast|slow|stress|forceful";
// 화면 대사 칸 뒤판 강조(tagSpans)도 이 식을 쓴다. 전역(g) 식이라 replace는 그대로 써도 되지만, matchAll은 이 식의 lastIndex에서 시작하므로 new RegExp(TAGS)로 복사해 쓰고 이 식에 test·exec를 부르지 않는다
export const TAGS = /<[^>]+>|\[[^\]]*\]/g;
const plain = (s: string) => s.replace(TAGS, "");
const norm = (s: string) =>
	plain(s.normalize("NFC"))
		.replace(new RegExp(TAG_NAMES, "gi"), "")
		.replace(/[^\p{L}\p{N}]/gu, "")
		.toLowerCase();

// no_text: 지시뿐인 줄(배정할 글자 없음). tag_word: 대사에 태그 이름과 같은 영어 단어가 있어 세그먼트와 구분되지 않는다
export function splitRisk(
	lines: readonly Pick<DramaLine, "text">[],
): "no_text" | "tag_word" | null {
	const word = new RegExp(TAG_NAMES, "i");
	for (const l of lines) {
		// 태그 이름 단어가 먼저다(norm이 그 글자를 지워 'Slow'가 빈 글로 보인다)
		if (word.test(plain(l.text))) return "tag_word";
		if (norm(l.text) === "") return "no_text";
	}
	return null;
}

// 단가: 100만 UTF-8 바이트당 달러(조사 4·10절). 기록 단위는 백만분의 1달러라 바이트 × 단가가 곧 금액이다
export function dramaUsage(
	model: DramaModel,
	bytes: number,
	now = Date.now(),
): Usage {
	if (model === "s2.1-pro-free") return { unit: "free", amount: 0 };
	const rate = model === "s2.1-pro" ? 15 : now < DRAMA_LAUNCH_UNTIL ? 10 : 50;
	return { unit: "usd_micro", amount: bytes * rate };
}

// SSE 스냅샷들을 한 장면의 세그먼트로 합친다. 청크마다 마지막 스냅샷만 쓰고 청크 오프셋을 더한다.
// 끝이 PCM 길이와 0.1초 넘게 다르면 잘린 스트림이라 null
export function mergeChunks(
	chunks: readonly SceneChunk[],
	audioSeconds: number,
): AlignedSegment[] | null {
	const last = new Map<number, SceneChunk>();
	for (const chunk of chunks) last.set(chunk.seq, chunk);
	const ordered = [...last.values()].sort((a, b) => a.seq - b.seq);
	if (!ordered.length) return null;
	const end = Math.max(...ordered.map((c) => c.offset + c.duration));
	if (!(Math.abs(end - audioSeconds) <= 0.1)) return null;
	const merged = ordered.flatMap((c) =>
		c.segments.map((s) => ({
			text: s.text,
			start: s.start + c.offset,
			end: s.end + c.offset,
		})),
	);
	return merged.length ? merged : null;
}

// 세그먼트를 줄에 차례로 배정한다. 틀린 파일보다 null(나누지 못함)이 낫다
export function splitLines(
	texts: readonly string[],
	segments: readonly AlignedSegment[],
	duration: number,
): LineSpan[] | null {
	if (!texts.length || splitRisk(texts.map((text) => ({ text })))) return null;
	const spans: { start: number; end: number }[] = [];
	let i = 0;
	let got = "";
	let start = 0;
	let end = 0;
	let last = 0;
	for (const s of segments) {
		const n = norm(s.text);
		if (!n) continue;
		if (i >= texts.length) return null;
		const want = norm(texts[i] ?? "");
		// 줄 안의 역행도 틀린 구간이 되므로 글자 있는 세그먼트마다 본다(NaN은 부정형으로 거른다)
		if (!(s.start >= last && s.end >= s.start)) return null;
		last = s.end;
		if (!got) start = s.start;
		got += n;
		end = s.end;
		if (!want.startsWith(got)) return null;
		if (got === want) {
			spans.push({ start, end });
			got = "";
			i++;
		}
	}
	// 글자 있는 세그먼트가 남았거나 줄이 덜 닫혔거나 장면 길이를 넘는다
	if (!(!got && i === texts.length && last <= duration + 0.05)) return null;
	return spans.map((span, k) => ({
		...span,
		cutStart: k === 0 ? 0 : ((spans[k - 1]?.end ?? 0) + span.start) / 2,
		cutEnd:
			k === spans.length - 1
				? duration
				: (span.end + (spans[k + 1]?.start ?? 0)) / 2,
	}));
}

// 16비트 모노라 샘플 = 2바이트. 홀수 길이는 마지막 1바이트를 버린다
export const pcmSeconds = (bytes: number) =>
	Math.floor(bytes / 2) / DRAMA_SAMPLE_RATE;

export function wavHeader(dataBytes: number): Uint8Array<ArrayBuffer> {
	const head = new Uint8Array(WAV_HEADER_BYTES);
	const v = new DataView(head.buffer);
	const tag = (at: number, s: string) => {
		for (let k = 0; k < 4; k++) v.setUint8(at + k, s.charCodeAt(k));
	};
	tag(0, "RIFF");
	v.setUint32(4, 36 + dataBytes, true);
	tag(8, "WAVE");
	tag(12, "fmt ");
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true); // PCM
	v.setUint16(22, 1, true); // 모노
	v.setUint32(24, DRAMA_SAMPLE_RATE, true);
	v.setUint32(28, DRAMA_SAMPLE_RATE * 2, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	tag(36, "data");
	v.setUint32(40, dataBytes, true);
	return head;
}

export function wavOf(pcm: Uint8Array): Uint8Array<ArrayBuffer> {
	const bytes = pcm.length - (pcm.length % 2);
	const wav = new Uint8Array(WAV_HEADER_BYTES + bytes);
	wav.set(wavHeader(bytes));
	wav.set(pcm.subarray(0, bytes), WAV_HEADER_BYTES);
	return wav;
}

// 샘플 경계에서 잘라 [새 머리, 데이터 뷰]를 돌려준다(복사 없음). 뷰는 원본 버퍼 종류를 이어받아, ArrayBuffer 위 WAV면
// 두 조각 모두 BlobPart다(TS 5.7+ lib.dom). 화면은 new Blob(parts, { type: "audio/wav" })로 쓴다
export function cutWav<B extends ArrayBufferLike>(
	wav: Uint8Array<B>,
	span: Pick<LineSpan, "cutStart" | "cutEnd">,
): [Uint8Array<ArrayBuffer>, Uint8Array<B>] {
	const size = wav.length - WAV_HEADER_BYTES;
	const at = (sec: number) =>
		Math.min(size, Math.max(0, Math.round(sec * DRAMA_SAMPLE_RATE) * 2));
	const from = at(span.cutStart);
	const to = Math.max(from, at(span.cutEnd));
	return [
		wavHeader(to - from),
		wav.subarray(WAV_HEADER_BYTES + from, WAV_HEADER_BYTES + to),
	];
}
