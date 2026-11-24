import type { Voice } from "@tts-pilot-app/api/providers/contract";
import type { TrialItem } from "@tts-pilot-app/api/providers/trial-contract";
import { DEFAULT_SETTINGS } from "@tts-pilot-app/api/providers/trial-options";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({ list: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => fake.list,
	useMutation: () => ({}),
	useQueryClient: () => ({}),
}));
vi.mock("@/lib/trial-view", () => import("../lib/trial-view"));
vi.mock("@/utils/orpc", () => ({
	orpc: {
		trialList: { queryOptions: () => ({}) },
		trialDelete: { mutationOptions: () => ({}) },
	},
}));
vi.mock("./demo", () => ({ DemoBadge: () => null, useDemo: () => false }));
vi.mock("./sample-player", () => ({ useSample: () => ({ status: "idle" }) }));
vi.mock("./trial-provider", () => ({
	useTrial: () => ({ urlOf: () => undefined }),
}));
vi.mock("./voice-problem", () => ({
	ReloadButton: () => createElement("button", { type: "button" }, "다시 받기"),
}));
vi.mock("./voice-row", () => ({ SampleButton: () => null }));

const { TrialResults } = await import("./trial-results");

const item: TrialItem = {
	id: "00000000-0000-4000-8000-000000000001",
	createdAt: "2026-11-24T00:00:00.000Z",
	usage: { unit: "credit", amount: 5 },
	request: {
		provider: "typecast",
		voiceId: "t1",
		text: "받아 둔 문장이에요",
		settings: DEFAULT_SETTINGS.typecast,
	},
} as TrialItem;
const draw = (list: Record<string, unknown>) => {
	fake.list = { isPending: false, isFetching: false, ...list };
	return renderToStaticMarkup(
		createElement(TrialResults, {
			voice: { provider: "typecast", voiceId: "t1", name: "민수" } as Voice,
		}),
	);
};

test("다시 받기가 실패해도 받은 결과는 남는다(audit C9)", () => {
	const html = draw({
		isError: true,
		isLoadingError: false,
		isRefetchError: true,
		data: [item],
	});
	expect(html).toContain("받아 둔 문장이에요");
	expect(html).not.toContain("결과를 불러오지 못했어요");
});

test("한 번도 받지 못했으면 실패를 알리고 다시 받게 한다", () => {
	const html = draw({
		isError: true,
		isLoadingError: true,
		isRefetchError: false,
		data: undefined,
	});
	expect(html).toContain("결과를 불러오지 못했어요");
	expect(html).toContain("다시 받기");
});
