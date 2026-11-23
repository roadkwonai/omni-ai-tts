import type { Usage } from "@tts-pilot-app/api/providers/trial-options";
import { ClientError } from "./client.js";

// 터미널에 그대로 쓰면 안 되는 제어 문자(C0·C1)와 방향 제어 문자를 지운다
export const clean = (value: string) =>
	value.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "");
// JSON은 값을 바꾸지 않고 같은 문자를 이스케이프한다(C0는 JSON.stringify가 한다)
export const jsonText = (value: unknown, indent?: number) =>
	JSON.stringify(value, null, indent).replace(
		/[\u007f-\u009f\p{Bidi_Control}]/gu,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);

const number = new Intl.NumberFormat("ko-KR");
export const byteText = (bytes: number) => `${number.format(bytes)}바이트`;
export function usageText({ unit, amount }: Usage): string {
	if (unit === "free") return "무료";
	if (unit === "byte") return byteText(amount);
	if (unit === "usd_micro")
		return `추정 $${(Math.ceil(amount / 100) / 10_000).toFixed(4)}`;
	return `${number.format(amount)}크레딧`;
}

// --json이면 stdout에 한 건만, 아니면 사람이 읽는 글
export function print(json: boolean, result: unknown, text: string) {
	process.stdout.write(json ? `${jsonText(result)}\n` : `${text}\n`);
}
export const note = (message: string) => {
	process.stderr.write(`${clean(message)}\n`);
};

// 실패를 알리고 종료 코드를 돌려준다
export function report(error: unknown): number {
	const known = error instanceof ClientError;
	const result = {
		code: known ? error.code : "INPUT",
		message: known ? error.message : "명령을 처리하지 못했습니다.",
		...(known ? error.detail : {}),
	};
	if (process.argv.includes("--json"))
		process.stdout.write(`${jsonText(result)}\n`);
	else {
		note(result.message);
		if (known) {
			const { requestId, resultId, retryAt } = error.detail;
			if (retryAt) note(`다음 요청 가능 시각 ${retryAt}`);
			if (requestId) note(`요청 ID ${requestId}`);
			if (resultId) note(`결과 ID ${resultId}`);
		}
	}
	return known ? error.exitCode : 2;
}
