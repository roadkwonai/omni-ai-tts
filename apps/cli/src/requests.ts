import { createHash } from "node:crypto";
import {
	comboSignature,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { changeRequests } from "./client.js";
import type { RequestRecord } from "./session.js";

export type KindName = "studio" | "trial" | "drama" | "clones";
// 조합 서명이 같은 요청의 지문. 드라마 장면은 정리한 요청의 서명을 쓴다
export const fingerprintOf = (
	origin: string,
	userId: string,
	signature: string,
	kind: KindName,
) =>
	createHash("sha256")
		.update(JSON.stringify([origin, userId, kind, signature]))
		.digest("hex");
export const fingerprint = (
	origin: string,
	userId: string,
	request: TrialRequest,
	kind: KindName = "studio",
) => fingerprintOf(origin, userId, comboSignature(request), kind);

export const kindOf = (record: RequestRecord): KindName =>
	record.kind ?? "studio";
export const recordsFor = (keys: readonly string[]) =>
	changeRequests(({ requests }) => keys.map((key) => requests[key]));
export const recordsOf = (origin: string) =>
	changeRequests(({ requests }) =>
		Object.values(requests).filter((record) => record.origin === origin),
	);

// 기록이 없을 때만 선점한다. replace가 참이면 앞 기록을 바꾸고, 요청 ID면 앞 기록이 그 요청일 때만 바꾼다.
// onWrite는 쓰기 직전에 동기로 불린다
export const claim = (
	key: string,
	record: RequestRecord,
	replace: boolean | string,
	onWrite: () => void,
) =>
	changeRequests(({ requests }) => {
		const previous = requests[key];
		if (replace !== true && previous?.requestId !== (replace || undefined))
			return { claimed: false, previous };
		requests[key] = record;
		onWrite();
		return { claimed: true, previous };
	});

// 지금 기록의 requestId가 내 것일 때만 지우거나 앞 기록으로 되돌린다
export const release = (
	origin: string,
	requestId: string,
	previous?: RequestRecord,
) =>
	changeRequests(({ requests }) => {
		for (const [key, record] of Object.entries(requests)) {
			if (record.origin !== origin || record.requestId !== requestId) continue;
			if (previous) requests[key] = previous;
			else delete requests[key];
		}
	});
