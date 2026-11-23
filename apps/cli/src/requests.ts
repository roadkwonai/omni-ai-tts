import { createHash } from "node:crypto";
import {
	comboSignature,
	type TrialRequest,
} from "@tts-pilot-app/api/providers/trial-options";
import { changeRequests } from "./client.js";
import type { RequestRecord } from "./session.js";

export const fingerprint = (
	origin: string,
	userId: string,
	request: TrialRequest,
) =>
	createHash("sha256")
		.update(JSON.stringify([origin, userId, "studio", comboSignature(request)]))
		.digest("hex");

export const recordOf = (key: string) =>
	changeRequests(({ requests }) => requests[key]);
export const recordsOf = (origin: string) =>
	changeRequests(({ requests }) =>
		Object.values(requests).filter((record) => record.origin === origin),
	);

// 기록이 없을 때만 선점한다(replace면 앞 기록을 바꾼다). onWrite는 쓰기 직전에 동기로 불린다
export const claim = (
	key: string,
	record: RequestRecord,
	replace: boolean,
	onWrite: () => void,
) =>
	changeRequests(({ requests }) => {
		const previous = requests[key];
		if (previous && !replace) return { claimed: false, previous };
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
