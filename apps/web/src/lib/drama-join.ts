// apps/web/src/lib/drama-join.ts
// 읽기로 들은 줄을 44.1kHz 16비트 모노 WAV 한 파일로 잇는다(스펙 15절). 서버·공급자 호출 없이 화면에서만 쓴다.
import { DRAMA_SAMPLE_RATE, wavHeader } from "@tts-pilot-app/api/drama-script";

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
	if (channels.length === 0) return new Float32Array(0);
	if (channels.length === 1) return channels[0];
	const out = new Float32Array(channels[0].length);
	for (const channel of channels)
		for (let i = 0; i < out.length; i++) out[i] += channel[i];
	for (let i = 0; i < out.length; i++) out[i] /= channels.length;
	return out;
}

// 앞뒤 무음을 자르고 숨만 남긴 뷰. 문턱은 float32 기준이다(배열 값이 float32라서)
export function trimSilence(
	samples: Float32Array,
	rate = DRAMA_SAMPLE_RATE,
): Float32Array {
	const floor = Math.fround(SILENCE);
	let first = 0;
	while (first < samples.length && Math.abs(samples[first]) <= floor) first++;
	if (first === samples.length) return samples.subarray(0, 0);
	let last = samples.length - 1;
	while (Math.abs(samples[last]) <= floor) last--;
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
			Math.round(Math.min(1, Math.max(-1, samples[i])) * 32767),
			true,
		);
	return bytes;
}

// [머리, part0, 무음0, part1, …]. 마지막 part 뒤에는 쉼이 없고, 복사 없이 Blob이 조각을 그대로 담는다
export function joinWav(
	parts: readonly Uint8Array<ArrayBuffer>[],
	gaps: readonly number[],
): Uint8Array<ArrayBuffer>[] {
	const body: Uint8Array<ArrayBuffer>[] = [];
	let bytes = 0;
	parts.forEach((part, i) => {
		body.push(part);
		bytes += part.length;
		if (i === parts.length - 1) return;
		const samples = Math.max(
			0,
			Math.round(((gaps[i] ?? 0) - 2 * EDGE_SECONDS) * DRAMA_SAMPLE_RATE),
		);
		if (samples === 0) return;
		body.push(new Uint8Array(samples * 2));
		bytes += samples * 2;
	});
	return [wavHeader(bytes), ...body];
}

// shortcut: 16비트 조각은 모두 쥔다(50줄 × 20초면 약 90MB + Blob 복사). 탭이 죽으면 조각을 더 일찍 Blob으로 넘긴다
// 디코딩은 줄마다 차례로 하고 바로 16비트로 바꾼다(디코딩 결과를 모두 쥐지 않는다)
export async function joinSounds(
	sounds: readonly { blob: Blob; gap: number }[],
): Promise<Blob> {
	const context = new OfflineAudioContext(1, 1, DRAMA_SAMPLE_RATE);
	const parts: Uint8Array<ArrayBuffer>[] = [];
	for (const { blob } of sounds) {
		const decoded = await context.decodeAudioData(await blob.arrayBuffer());
		const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
			decoded.getChannelData(c),
		);
		parts.push(pcm16(trimSilence(monoOf(channels))));
	}
	return new Blob(
		joinWav(
			parts,
			sounds.map((sound) => sound.gap),
		),
		{ type: "audio/wav" },
	);
}
