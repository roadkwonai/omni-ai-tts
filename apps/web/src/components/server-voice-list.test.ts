import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import { initialList, withPeople } from "../lib/provider-conditions";

const seen = vi.hoisted(() => ({
	setDraft: undefined as unknown as (value: string) => void,
	buttons: [] as { children?: unknown; onClick?: () => void }[],
}));
vi.mock("@tts-pilot-app/ui/components/button", () => ({
	Button: (props: { children?: ReactNode; onClick?: () => void }) => {
		seen.buttons.push(props);
		return createElement("button", { type: "button" }, props.children);
	},
}));
vi.mock("@tanstack/react-query", () => ({
	keepPreviousData: undefined,
	useInfiniteQuery: () => ({ isFetching: false, data: undefined }),
	useMutation: () => ({ isPending: false }),
	useQuery: () => ({ isError: false, data: undefined }),
	useQueryClient: () => ({}),
}));
vi.mock("@/lib/connection-view", () => import("../lib/connection-view"));
vi.mock("@/lib/list-query", () => import("../lib/list-query"));
vi.mock(
	"@/lib/provider-conditions",
	() => import("../lib/provider-conditions"),
);
vi.mock("@/lib/voice-failure", () => import("../lib/voice-failure"));
vi.mock("@/lib/voice-view", () => import("../lib/voice-view"));
vi.mock("@/utils/orpc", () => ({
	orpc: {
		voiceList: { infiniteOptions: () => ({}) },
		voiceAccents: { queryOptions: () => ({}) },
		voiceListRefresh: { mutationOptions: () => ({}) },
	},
}));
vi.mock("./casting-workspace", () => ({ CastingWorkspace: () => null }));
vi.mock("./notice", () => ({ Notice: () => null, SignInNotice: () => null }));
vi.mock("./voice-conditions", () => ({
	SortMenu: () => null,
	VoiceConditions: () => null,
}));
vi.mock("./voice-list-parts", () => ({
	LIST_QUERY: {},
	ListStatusBar: ({ extra }: { extra: ReactNode }) => extra,
	RowSkeleton: () => null,
	StaleNotice: () => null,
	// 아직 목록 조건에 들어가지 않은(0.5초 전) 글자가 칸에 있다
	useSearchCommit: () => ({
		draft: "수진",
		setDraft: (value: string) => seen.setDraft(value),
		submit: () => {},
	}),
}));
vi.mock("./voice-problem", () => ({
	EmptyList: () => null,
	lockedButton: () => "",
	NoMatches: () => null,
	Problem: () => null,
	useListRecovery: () => ({
		unauthorized: false,
		failure: null,
		problem: null,
		notice: null,
		retryAt: null,
		cooldown: null,
		reload: () => {},
	}),
}));
vi.mock("./voice-row", () => ({ RowList: () => null }));

const { ServerVoiceList } = await import("./server-voice-list");

test("'조건 모두 해제'는 아직 보내지 않은 검색어도 비워 되살아나지 않는다(audit C8)", () => {
	const setDraft = vi.fn();
	seen.setDraft = setDraft;
	const onListChange = vi.fn();
	renderToStaticMarkup(
		createElement(ServerVoiceList, {
			list: withPeople(initialList("elevenlabs", "public"), "female", null),
			onListChange,
			chosen: null,
			onChoose: () => {},
			focusRequested: false,
			onFocusHandled: () => {},
		}),
	);
	seen.buttons
		.find(({ children }) => children === "조건 모두 해제")
		?.onClick?.();
	expect(onListChange).toHaveBeenCalledWith(
		initialList("elevenlabs", "public"),
	);
	expect(setDraft).toHaveBeenCalledWith("");
});
