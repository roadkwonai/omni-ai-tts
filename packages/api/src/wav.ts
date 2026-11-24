import { CLONE_SAMPLE_RATE } from "./my-voice-rules";

// 클론 원본·동의 녹음의 서버 바이트 검사(T13 계획 2.3, ADR 0011). 브라우저가 만든 WAV를 믿지 않고 다시 읽는다:
// RIFF/WAVE, fmt 청크 PCM(1)·24kHz·모노·16비트, data 청크 길이로 초를 센다. 청크는 앞에서부터 차례로 걷는다.
// 길이(초)를 돌려주고 형식이 틀리면 null이다
const BYTES_PER_SECOND = CLONE_SAMPLE_RATE * 2;

export function readCloneWav(bytes: Uint8Array): number | null {
	if (bytes.length < 12) return null;
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) =>
		String.fromCharCode(...bytes.subarray(at, at + 4));
	if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
	let fmtOk = false;
	for (let at = 12; at + 8 <= bytes.length; ) {
		const id = tag(at);
		const size = v.getUint32(at + 4, true);
		const body = at + 8;
		if (body + size > bytes.length) return null;
		if (id === "fmt ") {
			if (size < 16) return null;
			fmtOk =
				v.getUint16(body, true) === 1 &&
				v.getUint16(body + 2, true) === 1 &&
				v.getUint32(body + 4, true) === CLONE_SAMPLE_RATE &&
				v.getUint16(body + 14, true) === 16;
			if (!fmtOk) return null;
		} else if (id === "data") {
			return fmtOk ? size / BYTES_PER_SECOND : null;
		}
		// 청크는 짝수 바이트로 채운다
		at = body + size + (size % 2);
	}
	return null;
}
