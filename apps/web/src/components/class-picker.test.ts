import { ORPCError } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@tts-pilot-app/api/routers/index";
import { expect, test, vi } from "vitest";

// web vitest는 @/ 별칭을 풀지 못한다: 같은 모듈을 상대 경로로 돌려주고, orpc는 가짜 client로 만든다(공급자·서버를 부르지 않는다)
const fake = vi.hoisted(() => ({
	channelCreate: async () => {
		throw new Error("unset");
	},
	classificationCreate: async () => {
		throw new Error("unset");
	},
	channelList: async () => [] as { id: string; name: string }[],
	classificationList: async () =>
		[] as { id: string; name: string; kind: string }[],
	savedVoiceList: async () => [],
}));
vi.mock("@/lib/saved-voice-view", () => import("../lib/saved-voice-view"));
vi.mock("@/lib/classes-view", () => import("../lib/classes-view"));
vi.mock("@/utils/orpc", async () => {
	const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
	return {
		client: fake,
		// 실제 OWNED_LIST와 같은 30초 캐시
		OWNED_LIST: { retry: false, staleTime: 30_000 },
		orpc: createTanstackQueryUtils(fake as never),
	};
});
// 펼침의 다시 불러오기 줄은 이 테스트와 관계없다
vi.mock("./voice-problem", () => ({ ReloadRow: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { createAndFind } = await import("./class-picker");
const orpc = createTanstackQueryUtils(fake as unknown as AppRouterClient);

test("다른 탭에서 만든 같은 이름 채널은 30초 캐시가 있어도 다시 받아 붙인다(R1)", async () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(orpc.channelList.queryOptions().queryKey, []);
	fake.channelCreate = async () => {
		throw new ORPCError("CONFLICT");
	};
	fake.channelList = async () => [{ id: "ch-1", name: "다큐" }];
	expect(await createAndFind("channel", "다큐", queryClient)).toBe("ch-1");
});

test("분류도 같다: 그 종류에서 같은 이름을 찾는다(R1)", async () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(orpc.classificationList.queryOptions().queryKey, []);
	fake.classificationCreate = async () => {
		throw new ORPCError("CONFLICT");
	};
	fake.classificationList = async () => [
		{ id: "ty-1", name: "다큐", kind: "type" },
		{ id: "ca-1", name: "다큐", kind: "category" },
	];
	expect(await createAndFind("category", "다큐", queryClient)).toBe("ca-1");
});
