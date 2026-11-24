import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { beforeEach, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
	client: {} as Record<string, (input: never) => Promise<unknown>>,
	queryClient: undefined as unknown,
}));
// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려주고, orpc는 목록 키만 가짜로 둔다
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/utils/orpc", () => ({
	client: fake.client,
	OWNED_LIST: {},
	orpc: {
		savedVoiceList: {
			queryOptions: () => ({ queryKey: ["savedVoiceList"] }),
		},
		channelList: { key: () => ["channelList"] },
		classificationList: { key: () => ["classificationList"] },
	},
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// 렌더러가 없다: 훅이 넘긴 옵션을 그대로 받아 실제 MutationObserver로 돌린다
vi.mock("@tanstack/react-query", async (original) => ({
	...(await original<typeof import("@tanstack/react-query")>()),
	useMutation: (options: unknown) => options,
	useQueryClient: () => fake.queryClient,
}));

const { savedListKey, useLinkVoice, useSaveVoice, writeBack } = await import(
	"./saved-voices"
);

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

// 목록 GET은 변경 전에 읽고 변경 뒤에 늦게 온다(audit C1)
let queryClient: QueryClient;
let server: SavedVoice;
beforeEach(() => {
	queryClient = new QueryClient();
	fake.queryClient = queryClient;
	server = saved("a", "x", false);
	queryClient.setQueryData(savedListKey, [server]);
	fake.client.savedVoiceLinks = async (
		input: Pick<SavedVoice, "channelIds" | "classificationIds">,
	) => {
		server = {
			...server,
			channelIds: input.channelIds,
			classificationIds: input.classificationIds,
		};
		return server;
	};
	fake.client.savedVoiceSave = async (input: { favorite?: boolean }) => {
		server = { ...server, favorite: input.favorite ?? server.favorite };
		return server;
	};
});
function slowList() {
	const snapshot = [server];
	let answer = () => {};
	const gate = new Promise<void>((resolve) => {
		answer = resolve;
	});
	const done = queryClient
		.fetchQuery({
			queryKey: savedListKey,
			queryFn: async () => {
				await gate;
				return snapshot;
			},
		})
		.catch(() => undefined);
	return async () => {
		answer();
		await done;
	};
}
const observe = <T>(options: unknown) =>
	new MutationObserver<unknown, unknown, T>(queryClient, options as never);
const cached = () =>
	queryClient.getQueryData<SavedVoice[]>(savedListKey)?.[0] as SavedVoice;

test("느린 목록 응답 중에 연결 둘을 붙이면 둘 다 남는다", async () => {
	const link = observe(useLinkVoice(server.voice));
	const answer = slowList();
	await link.mutate({ group: "channel", id: "c1", on: true });
	await answer();
	expect(cached().channelIds).toEqual(["c1"]);
	await link.mutate({ group: "channel", id: "c2", on: true });
	expect(server.channelIds).toEqual(["c1", "c2"]);
	expect(cached().channelIds).toEqual(["c1", "c2"]);
});

test("저장 중에 시작된 목록 조회가 저장 뒤에 와도 붙인 연결이 남는다", async () => {
	const links = fake.client.savedVoiceLinks;
	let answer = async () => {};
	fake.client.savedVoiceLinks = async (input) => {
		answer = slowList();
		return links(input);
	};
	await observe(useLinkVoice(server.voice)).mutate({
		group: "channel",
		id: "c1",
		on: true,
	});
	await answer();
	expect(cached().channelIds).toEqual(["c1"]);
});

test("느린 목록 응답이 방금 켠 별을 끄지 않고, 끊은 목록은 저장 뒤 다시 받는다", async () => {
	const answer = slowList();
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	await observe(useSaveVoice(server.voice)).mutate({ favorite: true });
	await answer();
	expect(cached().favorite).toBe(true);
	expect(invalidate).toHaveBeenCalledWith({ queryKey: savedListKey });
});

test("받는 중인 목록이 없으면 별을 눌러도 목록을 다시 받지 않는다", async () => {
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	await observe(useSaveVoice(server.voice)).mutate({ favorite: true });
	expect(invalidate).not.toHaveBeenCalled();
});
