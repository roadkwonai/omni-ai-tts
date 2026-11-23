// apps/web/src/lib/sound-join.ts
// 읽기로 들은 줄을 44.1kHz 16비트 모노 WAV 한 파일로 잇는다(스펙 15절). 서버·공급자 호출 없이 화면에서만 쓴다.
// 순수 함수는 CLI와 함께 쓰는 공용 모듈에 있고(T20) 여기에는 브라우저 디코딩(OfflineAudioContext)만 둔다
import { DRAMA_SAMPLE_RATE } from "@tts-pilot-app/api/drama-script";
import {
	joinWav,
	monoOf,
	pcm16,
	spansOf,
	trimSilence,
} from "@tts-pilot-app/api/sound-join";

export {
	EDGE_SECONDS,
	GAP_DEFAULT,
	GAP_MAX,
	gapOf,
	gapText,
	joinWav,
	monoOf,
	pcm16,
	SILENCE,
	seekOf,
	spanIndexAt,
	spansOf,
	trimSilence,
} from "@tts-pilot-app/api/sound-join";

// 디코딩은 줄마다 차례로 하고 바로 16비트로 바꿔 Blob 조각으로 넘긴다(16비트 배열을 쥐지 않는다)
export async function joinTimeline(
	sounds: readonly { blob: Blob; gap: number }[],
): Promise<{ blob: Blob; spans: { start: number; end: number }[] }> {
	const context = new OfflineAudioContext(1, 1, DRAMA_SAMPLE_RATE);
	const gaps = sounds.map((sound) => sound.gap);
	const parts: Blob[] = [];
	const counts: number[] = [];
	for (const { blob } of sounds) {
		const decoded = await context.decodeAudioData(await blob.arrayBuffer());
		const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
			decoded.getChannelData(c),
		);
		const pcm = pcm16(trimSilence(monoOf(channels)));
		counts.push(pcm.length / 2);
		parts.push(new Blob([pcm]));
	}
	return {
		blob: new Blob(joinWav(parts, gaps), { type: "audio/wav" }),
		spans: spansOf(counts, gaps, DRAMA_SAMPLE_RATE),
	};
}

export async function joinSounds(
	sounds: readonly { blob: Blob; gap: number }[],
): Promise<Blob> {
	return (await joinTimeline(sounds)).blob;
}
