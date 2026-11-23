// packages/api/src/paragraph-files.ts
import { SEND_TAGS } from "./paragraph-tags";
import { normalizeText } from "./providers/trial-options";

// 문단 작업실 받기의 자막(SRT)과 파일 이름(T10 스펙 5.1 '받기'·'파일 이름')

// 파일 이름에 못 쓰는 글자(Windows·macOS 공통), 공백(줄바꿈 포함), 제어 문자(C0·C1), 형식 문자(RLO 같은 방향 바꿈, 폭 없는 공백)는 '_'로 바꾼다
const BAD_NAME = /[\\/:*?"<>|\s\p{Cc}\p{Cf}]/gu;
export const safeName = (text: string) => text.replace(BAD_NAME, "_");
const two = (value: number) => String(value).padStart(2, "0");
// 결과를 만든 시각의 한국 시간(일광 절약 없음)
export function kstStamp(iso: string): string {
	const at = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
	return `${at.getUTCFullYear()}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}-${two(at.getUTCHours())}${two(at.getUTCMinutes())}`;
}

// 자막 글: 태그 모양(SEND_TAGS: [whispers]·<sigh>)을 모두 빼고 공백을 하나로. 한글 괄호 글(<삼국지>·[속보])은 대본 글이라 남는다(스펙 15.2).
// 줄바꿈도 공백이다(빈 줄은 SRT 큐를 끝낸다). SEND_TAGS는 전역 식이라 replace만 쓴다
export const stripTags = (text: string) =>
	text.replace(SEND_TAGS, " ").replace(/\s+/g, " ").trim();

const pad = (value: number, size = 2) => String(value).padStart(size, "0");
// HH:MM:SS,mmm. 밀리초로 반올림한다
export function srtTime(seconds: number): string {
	const ms = Math.max(0, Math.round(seconds * 1000));
	return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

// 글이 빈 자막(태그만 있던 문단)은 뺀다(엄격한 파서가 깨진 자막으로 본다). 번호는 남은 것으로 이어 매긴다
export const srtOf = (
	cues: readonly { start: number; end: number; text: string }[],
) =>
	cues
		.filter((cue) => cue.text.trim() !== "")
		.map(
			(cue, i) =>
				`${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`,
		)
		.join("\n");

const head = (text: string, count: number) =>
	safeName([...normalizeText(text)].slice(0, count).join(""));
// 한 파일·zip·SRT: {첫 문단 앞 20자}_{YYYYMMDD-HHmm}.{ext}, 받은 시각(한국 시간)
export const workFileName = (
	firstText: string,
	at: Date,
	ext: "wav" | "zip" | "srt",
) => `${head(firstText, 20)}_${kstStamp(at.toISOString())}.${ext}`;
// zip 안 파일: {번호 3자리}_{성우 이름(40자까지, T9-05)}_{문단 앞 20자}.{ext}
export const paragraphFileName = (
	n: number,
	voiceName: string,
	text: string,
	ext: "mp3" | "wav",
) => `${pad(n, 3)}_${head(voiceName, 40)}_${head(text, 20)}.${ext}`;
