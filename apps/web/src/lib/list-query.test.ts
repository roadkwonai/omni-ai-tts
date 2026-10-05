import {
	type InfiniteData,
	InfiniteQueryObserver,
	keepPreviousData,
	QueryClient,
	type QueryKey,
} from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { keepFirstPage } from "./list-query";
import { initialList, inputOf } from "./provider-conditions";

// 이 파일은 개발 서버·공급자를 부르지 않는다. QueryClient 메모리만 쓰고, oRPC 클라이언트는 쓰는 fetch를 던지는 흉내로 바꾼 뒤에 불러온다.
const network = vi.fn(() => {
	throw new Error("네트워크를 부르면 안 된다");
});
let orpc: typeof import("../utils/orpc").orpc;
beforeAll(async () => {
	vi.stubGlobal("fetch", network);
	({ orpc } = await import("../utils/orpc"));
});
afterEach(() => {
	expect(network).not.toHaveBeenCalled();
});

const listKey = (provider: "elevenlabs" | "fish_audio", search = "") => {
	const list = initialList(provider, "public");
	const withSearch = {
		...list,
		query: { ...list.query, search },
	} as typeof list;
	return orpc.voiceList.infiniteKey({
		input: (page: number | string | null) => inputOf(withSearch, page),
		initialPageParam: provider === "fish_audio" ? 1 : 0,
	}) as QueryKey;
};
const three = (): InfiniteData<string, number> => ({
	pages: ["p1", "p2", "p3"],
	pageParams: [1, 2, 3],
});

describe("'목록 새로 고침'이 기대는 쿼리 키", () => {
	it("공급자 부분 키는 그 공급자의 목록 쿼리(조건이 달라도)에만 걸리고 다른 공급자·Typecast 한 페이지 쿼리는 따로 구분된다", () => {
		const qc = new QueryClient();
		qc.setQueryData(listKey("fish_audio"), three());
		qc.setQueryData(listKey("fish_audio", "아"), three());
		qc.setQueryData(listKey("elevenlabs"), three());
		qc.setQueryData(
			orpc.voiceList.queryKey({ input: { provider: "typecast" } }) as QueryKey,
			{ voices: [] },
		);
		const keys = (provider: "elevenlabs" | "fish_audio" | "typecast") =>
			qc
				.getQueriesData({
					queryKey: orpc.voiceList.key({ input: { provider } }),
				})
				.map(([key]) => JSON.stringify(key));
		expect(keys("fish_audio")).toHaveLength(2);
		expect(keys("elevenlabs")).toHaveLength(1);
		expect(keys("typecast")).toHaveLength(1);
	});

	it("무효 처리와 첫 페이지 자르기는 그 공급자 키에만 걸린다", () => {
		const qc = new QueryClient();
		const fishKey = listKey("fish_audio");
		const elKey = listKey("elevenlabs");
		const typecastKey = orpc.voiceList.queryKey({
			input: { provider: "typecast" },
		}) as QueryKey;
		qc.setQueryData(fishKey, three());
		qc.setQueryData(elKey, three());
		qc.setQueryData(typecastKey, { voices: ["t"] });
		const queryKey = orpc.voiceList.key({ input: { provider: "fish_audio" } });
		keepFirstPage(qc, { queryKey });
		void qc.invalidateQueries({ queryKey, refetchType: "none" });
		expect(qc.getQueryData(fishKey)).toEqual({
			pages: ["p1"],
			pageParams: [1],
		});
		expect(qc.getQueryState(fishKey)?.isInvalidated).toBe(true);
		expect(qc.getQueryData(elKey)).toEqual(three());
		expect(qc.getQueryState(elKey)?.isInvalidated).toBe(false);
		// 한 페이지 쿼리(Typecast)는 모양이 달라 자르지 않는다
		expect(qc.getQueryData(typecastKey)).toEqual({ voices: ["t"] });
	});

	it("exact면 그 쿼리 하나만 자른다('다시 불러오기')", () => {
		const qc = new QueryClient();
		qc.setQueryData(listKey("fish_audio"), three());
		qc.setQueryData(listKey("fish_audio", "아"), three());
		keepFirstPage(qc, { queryKey: listKey("fish_audio"), exact: true });
		expect(qc.getQueryData(listKey("fish_audio"))).toEqual({
			pages: ["p1"],
			pageParams: [1],
		});
		expect(qc.getQueryData(listKey("fish_audio", "아"))).toEqual(three());
	});
});

// 설치본 query-core 5.103.2의 동작을 메모리 queryFn으로 고정한다(목록 흐림·'더 보기' 잠금이 기대는 값)
describe("무한 쿼리 상태", () => {
	const options = (log: string[], delay = 5) => ({
		queryKey: ["memory"],
		initialPageParam: 1,
		queryFn: async ({ pageParam }: { pageParam: number }) => {
			log.push(`page ${pageParam}`);
			await new Promise((resolve) => setTimeout(resolve, delay));
			return { page: pageParam, next: pageParam < 3 ? pageParam + 1 : null };
		},
		getNextPageParam: (last: { next: number | null }) => last.next,
		placeholderData: keepPreviousData,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	const watch = (qc: QueryClient, opts: ReturnType<typeof options>) => {
		const observer = new InfiniteQueryObserver(qc, opts);
		observer.subscribe(() => {});
		return observer;
	};

	it("isRefetching: 다시 받는 중과 조건을 바꿔 받는 중(placeholder)에 참이고 다음 페이지 받기에는 거짓이다", async () => {
		const qc = new QueryClient();
		const log: string[] = [];
		const observer = watch(qc, options(log));
		await vi.waitFor(() =>
			expect(observer.getCurrentResult().data?.pages).toHaveLength(1),
		);
		const next = observer.fetchNextPage();
		expect(observer.getCurrentResult().isFetchingNextPage).toBe(true);
		expect(observer.getCurrentResult().isRefetching).toBe(false);
		await next;
		const again = observer.refetch();
		expect(observer.getCurrentResult().isRefetching).toBe(true);
		await again;
		observer.setOptions({ ...options(log), queryKey: ["memory", "다른 조건"] });
		const placeholder = observer.getCurrentResult();
		expect(placeholder.isPlaceholderData).toBe(true);
		expect(placeholder.isRefetching).toBe(true);
		await vi.waitFor(() =>
			expect(observer.getCurrentResult().isPlaceholderData).toBe(false),
		);
	});

	it("다시 받는 중에 fetchNextPage({ cancelRefetch: false })는 진행 중인 요청을 끊지 않고 새 요청도 보내지 않는다", async () => {
		const qc = new QueryClient();
		const log: string[] = [];
		const observer = watch(qc, options(log, 20));
		await vi.waitFor(() =>
			expect(observer.getCurrentResult().data?.pages).toHaveLength(1),
		);
		log.length = 0;
		const refetch = observer.refetch({ cancelRefetch: false });
		await observer.fetchNextPage({ cancelRefetch: false });
		await refetch;
		expect(log).toEqual(["page 1"]);
		expect(observer.getCurrentResult().data?.pages).toHaveLength(1);
	});
});
