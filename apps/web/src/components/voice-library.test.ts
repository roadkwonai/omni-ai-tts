import { QueryClient } from "@tanstack/react-query";
import type { SavedVoice } from "@tts-pilot-app/api/saved-voice-contract";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
	queryClient: undefined as unknown,
	check: undefined as undefined | { queryFn: () => Promise<unknown> },
	fresh: null as unknown,
}));
vi.mock("@tanstack/react-query", async (original) => ({
	...(await original<typeof import("@tanstack/react-query")>()),
	useQuery: (options: typeof fake.check) => {
		fake.check = options;
		return {};
	},
	useQueryClient: () => fake.queryClient,
}));
vi.mock("@/lib/preset-view", () => import("../lib/preset-view"));
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/lib/voice-failure", () => import("../lib/voice-failure"));
vi.mock("@/lib/voice-view", () => import("../lib/voice-view"));
vi.mock("@/utils/orpc", () => ({
	client: { savedVoiceCheck: async () => fake.fresh },
	OWNED_LIST: {},
}));
vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./casting-workspace", () => ({ CastingWorkspace: () => null }));
vi.mock("./empty-state", () => ({ EmptyState: () => null }));
vi.mock("./library-filters", () => ({ LibraryFilters: () => null }));
vi.mock("./notice", () => ({ Notice: () => null, SignInNotice: () => null }));
vi.mock("./presets", () => ({ usePresetList: () => ({ data: [] }) }));
vi.mock("./sample-player", () => ({
	SamplePlayerProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./saved-voices", () => ({
	savedListKey: ["savedVoiceList"],
	useClassLists: () => ({
		channels: [],
		classes: [],
		loaded: true,
		failed: false,
	}),
	useSavedList: () => ({ data: [], error: null, isSuccess: true }),
}));
vi.mock("./voice-conditions", () => ({ SortMenu: () => null }));
vi.mock("./voice-list-parts", () => ({ RowSkeleton: () => null }));
vi.mock("./voice-problem", () => ({
	NoMatches: () => null,
	ReloadRow: () => null,
}));
vi.mock("./voice-row", () => ({ RowList: () => null }));

const { VoiceLibrary } = await import("./voice-library");

const key = ["savedVoiceList"];
const kept = [{ id: "kept" }] as SavedVoice[];
async function checkWith(fresh: unknown) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(key, kept);
	fake.queryClient = queryClient;
	fake.fresh = fresh;
	renderToStaticMarkup(createElement(VoiceLibrary));
	await fake.check?.queryFn();
	return {
		data: queryClient.getQueryData(key),
		refetch: queryClient.getQueryState(key)?.isInvalidated,
	};
}

test("확인할 성우가 없으면(null) 받아 둔 보관함 목록을 덮지도 다시 받지도 않는다(audit D5)", async () => {
	expect(await checkWith(null)).toEqual({ data: kept, refetch: false });
});

// 확인하는 동안(길면 몇 분) 담거나 뺀 것이 옛 목록으로 되돌아가지 않게 한다
test("확인한 목록으로 덮지 않고 보관함 목록을 다시 받는다(audit D5 리뷰)", async () => {
	expect(await checkWith([{ id: "fresh" }])).toEqual({
		data: kept,
		refetch: true,
	});
});
