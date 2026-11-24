import { ORPCError } from "@orpc/client";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

import { trialFailureOf, trialProblemText } from "../lib/trial-view";

const fake = vi.hoisted(() => ({ errors: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => {
	const read = ({ name }: { name?: string }) => ({
		data: undefined,
		error: (name && fake.errors[name]) ?? null,
	});
	return {
		useQuery: read,
		useInfiniteQuery: read,
		useIsMutating: () => 0,
		useMutation: () => ({}),
		useQueryClient: () => ({}),
	};
});
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/lib/connection-view", () => import("../lib/connection-view"));
vi.mock(
	"@/lib/provider-conditions",
	() => import("../lib/provider-conditions"),
);
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/lib/voice-failure", () => import("../lib/voice-failure"));
vi.mock("@/lib/voice-filter", () => import("../lib/voice-filter"));
vi.mock("@/lib/voice-view", () => import("../lib/voice-view"));
vi.mock("@/utils/orpc", () => {
	const list = (name: string) => ({
		key: () => [name],
		queryOptions: () => ({ name, queryKey: [name] }),
	});
	return {
		client: {},
		OWNED_LIST: {},
		QUIET: {},
		orpc: {
			savedVoiceList: list("savedVoiceList"),
			channelList: list("channelList"),
			classificationList: list("classificationList"),
			presetList: list("presetList"),
		},
	};
});
const empty = vi.hoisted(() => () => null);
vi.mock("./all-providers", () => ({
	AllProviders: () => createElement("p", null, "내 문장 칸과 목록"),
	EMPTY_ALL: { search: "", gender: null, age: null },
}));
vi.mock("./notice", () => ({
	SignInNotice: () => createElement("h2", null, "로그인이 풀렸어요"),
}));
vi.mock("./one-list", () => ({
	AiryVoiceList: empty,
	airyListOptions: {},
	EMPTY_AIRY: {},
	EMPTY_GEMINI: { filters: {} },
	GeminiVoiceList: empty,
	geminiListOptions: {},
	typecastListOptions: { name: "typecast" },
}));
vi.mock("./sample-player", () => ({
	SamplePlayerProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./server-voice-list", () => ({
	ServerVoiceList: empty,
	serverListOptions: () => ({}),
}));
vi.mock("./setting-fields", () => ({ sourceItem: "" }));
vi.mock("./trial-provider", () => ({
	// 쓰던 문장과 듣기 설정은 이 Provider가 든다
	TrialProvider: ({ children }: { children: ReactNode }) =>
		createElement("div", { "data-trial": "" }, children),
}));
vi.mock("./typecast-voice-list", () => ({
	EMPTY_TYPECAST: {},
	TypecastVoiceList: empty,
}));

const { VoiceCasting } = await import("./voice-casting");

const signedOut = new ORPCError("UNAUTHORIZED");
const draw = () => renderToStaticMarkup(createElement(VoiceCasting));
beforeEach(() => {
	fake.errors = {};
});

test("별·담기가 401이면(담은 성우 목록도 401) 다시 로그인 안내를 보이고 쓰던 문장을 든 화면은 남긴다(audit C3)", () => {
	fake.errors = { savedVoiceList: signedOut };
	const html = draw();
	expect(html).toContain("로그인이 풀렸어요");
	expect(html).toContain("data-trial");
	expect(html).toContain("내 문장 칸과 목록");
});

test("보던 중에 목록이 401이 되어도 쓰던 문장을 든 화면은 남긴다(audit C3)", () => {
	fake.errors = { typecast: signedOut };
	const html = draw();
	expect(html).toContain("로그인이 풀렸어요");
	expect(html).toContain("data-trial");
});

test("로그인돼 있으면 안내가 없다", () => {
	const html = draw();
	expect(html).not.toContain("로그인이 풀렸어요");
	expect(html).toContain("내 문장 칸과 목록");
});

test("내 문장 듣기가 401이면 다시 로그인하라고 알린다(audit C3)", () => {
	expect(
		trialProblemText("typecast", trialFailureOf(signedOut)).text,
	).toContain("다시 로그인");
});
