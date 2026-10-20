import { QueryClient } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려주고, orpc는 목록 키만 가짜로 둔다
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/utils/orpc", () => ({
	client: {},
	OWNED_LIST: {},
	orpc: {
		savedVoiceList: {
			queryOptions: () => ({ queryKey: ["savedVoiceList"] }),
		},
	},
}));

const { savedListKey, writeBack } = await import("./saved-voices");

const saved = (id: string, voiceId: string, favorite: boolean): SavedVoice => ({
	id,
	voice: { provider: "elevenlabs", source: "public", voiceId } as Voice,
	favorite,
	frequent: false,
	memo: null,
	unavailable: false,
	channelIds: [],
	classificationIds: [],
	lastUsedAt: null,
	useCount: 0,
});

test("다른 탭에서 빼고 다시 담긴 성우(새 id)는 옛 줄을 바꾼다(QA F1)", () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(savedListKey, [
		saved("old", "x", true),
		saved("other", "y", false),
	]);
	writeBack(queryClient, saved("new", "x", false));
	expect(queryClient.getQueryData<SavedVoice[]>(savedListKey)).toEqual([
		saved("new", "x", false),
		saved("other", "y", false),
	]);
});

test("처음 담긴 성우는 맨 앞에 더한다", () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(savedListKey, [saved("other", "y", false)]);
	writeBack(queryClient, saved("new", "x", true));
	expect(
		queryClient.getQueryData<SavedVoice[]>(savedListKey)?.map((s) => s.id),
	).toEqual(["new", "other"]);
});
