// apps/web/src/lib/clone-audio.ts
// 녹음·파일을 서버가 받는 24kHz 모노 16비트 WAV로 바꾼다(T13 스펙 5.3). 브라우저에서만 돈다.
import { wavHeader } from "@tts-pilot-app/api/drama-script";
import { CLONE_SAMPLE_RATE } from "@tts-pilot-app/api/my-voice-contract";
import { isSilent } from "@tts-pilot-app/api/sound-join";

import { monoOf, pcm16 } from "./sound-join";

// 무음 판정은 CLI와 함께 쓰는 공용 모듈에 있다(T21)
export { isSilent } from "@tts-pilot-app/api/sound-join";

export function wavFromSamples(samples: Float32Array): {
	wav: Blob;
	seconds: number;
	silent: boolean;
} {
	const pcm = pcm16(samples);
	return {
		wav: new Blob([wavHeader(pcm.length, CLONE_SAMPLE_RATE), pcm], {
			type: "audio/wav",
		}),
		seconds: samples.length / CLONE_SAMPLE_RATE,
		silent: isSilent(samples),
	};
}

// 풀 수 없는 파일이면 decodeAudioData가 던진다(호출한 쪽이 '풀 수 없는 파일' 문구로 바꾼다).
// 컨텍스트 표본율(24kHz)로 다시 뽑아 주므로 따로 리샘플하지 않는다
export async function toCloneWav(
	blob: Blob,
): Promise<ReturnType<typeof wavFromSamples>> {
	const decoded = await new OfflineAudioContext(
		1,
		1,
		CLONE_SAMPLE_RATE,
	).decodeAudioData(await blob.arrayBuffer());
	return wavFromSamples(
		monoOf(
			Array.from({ length: decoded.numberOfChannels }, (_, c) =>
				decoded.getChannelData(c),
			),
		),
	);
}
