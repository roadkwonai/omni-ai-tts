import { QueryClient } from "@tanstack/react-query";
import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
	client: {} as Record<string, () => Promise<unknown>>,
	queryClient: undefined as unknown,
	refetch: async () => {},
}));
// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려주고, orpc는 목록 키만 가짜로 둔다
vi.mock("@/lib/browser", () => import("../lib/browser"));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/lib/drama-view", () => import("../lib/drama-view"));
vi.mock("@/lib/modal-action", () => import("../lib/modal-action"));
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/lib/sound-join", () => import("../lib/sound-join"));
vi.mock("@/lib/studio-view", () => import("../lib/studio-view"));
vi.mock("@/utils/orpc", () => {
	const list = (name: string) => ({
		key: () => [name],
		queryOptions: () => ({ queryKey: [name] }),
	});
	return {
		client: fake.client,
		OWNED_LIST: {},
		orpc: {
			savedVoiceList: list("savedVoiceList"),
			presetList: list("presetList"),
			dramaList: list("dramaList"),
			dramaCreate: { mutationOptions: () => ({}) },
		},
	};
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-query", async (original) => ({
	...(await original<typeof import("@tanstack/react-query")>()),
	useMutation: () => ({}),
	useQuery: () => ({ data: undefined, refetch: fake.refetch }),
	useQueryClient: () => fake.queryClient,
}));

const { DramaProvider, useDrama } = await import("./drama-provider");
const { savedListKey } = await import("./saved-voices");

// '전체'에서 골라 담는 동안, 담기 전에 읽은 목록 GET이 늦게 온다
async function pickWhileListing(cached: boolean) {
	const queryClient = new QueryClient();
	fake.queryClient = queryClient;
	const voice = (voiceId: string) =>
		({ provider: "elevenlabs", source: "public", voiceId }) as Voice;
	const saved = (voiceId: string) =>
		({ id: voiceId, voice: voice(voiceId) }) as SavedVoice;
	let server = [saved("old")];
	let answer = () => {};
	const gate = new Promise<void>((resolve) => {
		answer = resolve;
	});
	const list = (wait?: Promise<void>) =>
		queryClient
			.fetchQuery({
				queryKey: savedListKey,
				queryFn: async () => {
					const read = server;
					await wait;
					return read;
				},
			})
			.catch(() => undefined);
	if (cached) queryClient.setQueryData(savedListKey, server);
	const refetched: Promise<unknown>[] = [];
	fake.refetch = async () => {
		refetched.push(list());
	};
	fake.client.savedVoiceSave = async () => {
		server = [saved("new"), ...server];
		return server[0];
	};
	let drama: ReturnType<typeof useDrama> | undefined;
	function Probe() {
		drama = useDrama();
		return null;
	}
	renderToStaticMarkup(
		createElement(DramaProvider, { children: createElement(Probe) }),
	);
	const slow = list(gate);
	await drama?.pickFromAll(0, voice("new"));
	answer();
	await slow;
	await Promise.all(refetched);
	return queryClient
		.getQueryData<typeof server>(savedListKey)
		?.map(({ id }) => id);
}

test.each([
	["목록이 있을 때", true],
	["목록을 처음 받는 중일 때", false],
])("늦은 목록이 방금 담은 성우를 지우지 않는다: %s", async (_, cached) => {
	expect(await pickWhileListing(cached)).toEqual(["new", "old"]);
});
