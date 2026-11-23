// packages/api/src/sound-join.ts
// 들은 소리를 44.1kHz 16비트 모노 WAV 한 파일로 잇는 순수 함수(스펙 15절). 디코딩은 부르는 쪽이 한다(웹은 AudioContext, CLI는 ffmpeg·afconvert).
import { DRAMA_SAMPLE_RATE, wavHeader } from "./drama-script";

export const GAP_DEFAULT = 0.3;
export const GAP_MAX = 5;
// −50 dBFS 이하는 무음이다
export const SILENCE = 10 ** (-50 / 20);
// 줄 앞뒤에 남기는 숨(초)
export const EDGE_SECONDS = 0.02;

// 쉼 칸 값: 수나 수 글만 받아 0~5초, 0.1초 단위로 맞춘다. 그 밖은 null(기본값을 쓴다)
export function gapOf(value: unknown): number | null {
	const n =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim() !== ""
				? Number(value)
				: Number.NaN;
	if (!Number.isFinite(n)) return null;
	return Math.round(Math.min(GAP_MAX, Math.max(0, n)) * 10) / 10;
}

export function gapText(seconds: number): string {
	return seconds.toFixed(1);
}

export function monoOf(channels: readonly Float32Array[]): Float32Array {
	const [first] = channels;
	if (!first) return new Float32Array(0);
	if (channels.length === 1) return first;
	const out = new Float32Array(first.length);
	// 채널이 짧으면 웹 원본과 같게 NaN이 된다(undefined를 더하던 것)
	for (const channel of channels)
		for (let i = 0; i < out.length; i++)
			out[i] = (out[i] ?? 0) + (channel[i] ?? Number.NaN);
	for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / channels.length;
	return out;
}

// 앞뒤 무음을 자르고 숨만 남긴 뷰. 문턱은 float32 기준이다(배열 값이 float32라서)
export function trimSilence(
	samples: Float32Array,
	rate = DRAMA_SAMPLE_RATE,
): Float32Array {
	const floor = Math.fround(SILENCE);
	let first = 0;
	while (first < samples.length && Math.abs(samples[first] ?? 0) <= floor)
		first++;
	if (first === samples.length) return samples.subarray(0, 0);
	let last = samples.length - 1;
	while (Math.abs(samples[last] ?? 0) <= floor) last--;
	const edge = Math.round(EDGE_SECONDS * rate);
	return samples.subarray(
		Math.max(0, first - edge),
		Math.min(samples.length, last + 1 + edge),
	);
}

export function pcm16(samples: Float32Array): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < samples.length; i++)
		view.setInt16(
			i * 2,
			Math.round(Math.min(1, Math.max(-1, samples[i] ?? 0)) * 32767),
			true,
		);
	return bytes;
}

// 조각 사이 쉼의 샘플 수. 앞뒤 숨(EDGE)이 이미 쉼을 채우므로 그만큼 뺀다
export function gapSamples(gap: number, rate: number): number {
	return Math.max(0, Math.round((gap - 2 * EDGE_SECONDS) * rate));
}

// 조각 i의 시작·끝(초). 쉼은 조각 사이에만 있고 마지막 조각 뒤에는 없다
export function spansOf(
	sampleCounts: readonly number[],
	gaps: readonly number[],
	rate: number,
): { start: number; end: number }[] {
	let at = 0;
	return sampleCounts.map((count, i) => {
		const start = at / rate;
		at += count;
		const end = at / rate;
		if (i < sampleCounts.length - 1) at += gapSamples(gaps[i] ?? 0, rate);
		return { start, end };
	});
}

// 시작 시각으로 옮기면 브라우저가 1샘플 안팎 앞에 착지하므로 그만큼(1ms) 봐준다
const SEEK_SLACK = 0.001;

// 재생 위치(초)의 문단 번호(0부터). 쉼 구간은 앞 문단, 첫 문단 앞은 0, 구간이 없으면 -1
export function spanIndexAt(
	spans: readonly { start: number; end: number }[],
	time: number,
): number {
	let found = spans.length > 0 ? 0 : -1;
	for (let i = 1; i < spans.length; i++) {
		if ((spans[i]?.start ?? 0) > time + SEEK_SLACK) break;
		found = i;
	}
	return found;
}

// 이전(-1)·다음(1) 문단의 시작 시각. 첫 문단의 이전은 처음(0), 마지막 문단의 다음은 null(없음)
export function seekOf(
	spans: readonly { start: number; end: number }[],
	index: number,
	dir: -1 | 1,
): number | null {
	if (dir < 0) return index <= 0 ? 0 : (spans[index - 1]?.start ?? null);
	return spans[index + 1]?.start ?? null;
}

// [머리, part0, 무음0, part1, …]. 조각은 16비트 PCM Blob이다. 마지막 part 뒤에는 쉼이 없고, 복사 없이 Blob이 조각을 그대로 담는다
export function joinWav(
	parts: readonly Blob[],
	gaps: readonly number[],
): [Uint8Array<ArrayBuffer>, ...(Blob | Uint8Array<ArrayBuffer>)[]] {
	const body: (Blob | Uint8Array<ArrayBuffer>)[] = [];
	let bytes = 0;
	parts.forEach((part, i) => {
		body.push(part);
		bytes += part.size;
		if (i === parts.length - 1) return;
		const samples = gapSamples(gaps[i] ?? 0, DRAMA_SAMPLE_RATE);
		if (samples === 0) return;
		body.push(new Uint8Array(samples * 2));
		bytes += samples * 2;
	});
	return [wavHeader(bytes), ...body];
}
