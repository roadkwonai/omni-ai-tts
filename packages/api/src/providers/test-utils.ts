import { afterEach, beforeEach, vi } from "vitest";

import type { ListInputOf } from "./contract";

// 공급자 테스트 공통: 두 SDK 모두 호출 시점의 전역 fetch를 쓰므로 그것만 바꿔 끼운다. 테스트 파일 맨 위에서 한 번 부른다.
export const fetchMock = vi.fn<typeof fetch>();

export function useFetchMock() {
	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});
}

export const json = (
	status: number,
	body: unknown,
	headers?: Record<string, string>,
): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});

// fetch가 index번째로 부른 주소
export const calledUrl = (index = 0) =>
	new URL(String(fetchMock.mock.calls[index]?.[0]));

// 목록 입력 기본값. over는 입력의 바뀌는 필드이고 query는 조건 일부만 적는다
type Over<I extends { query: object }> = Partial<Omit<I, "query">> & {
	query?: Partial<I["query"]>;
};
const withOver = <I extends { query: object }>(base: I, over: Over<I>): I => ({
	...base,
	...over,
	query: { ...base.query, ...over.query },
});

type ElPublic = Extract<ListInputOf<"elevenlabs">, { source: "public" }>;
type ElAccount = Extract<ListInputOf<"elevenlabs">, { source: "account" }>;

export const elPublicInput = (over: Over<ElPublic> = {}): ElPublic =>
	withOver<ElPublic>(
		{
			provider: "elevenlabs",
			source: "public",
			page: 0,
			query: {
				search: "",
				language: "ko",
				accent: null,
				gender: null,
				age: null,
				category: null,
				useCases: [],
				descriptives: [],
				featured: false,
				sort: "trending",
			},
		},
		over,
	);

export const elAccountInput = (over: Over<ElAccount> = {}): ElAccount =>
	withOver<ElAccount>(
		{
			provider: "elevenlabs",
			source: "account",
			cursor: null,
			query: {
				search: "",
				voiceType: null,
				category: null,
				gender: null,
				age: null,
				language: null,
				accent: null,
				useCases: [],
				sort: "created_at_unix",
				direction: "desc",
			},
		},
		over,
	);

export const fishInput = (
	over: Over<ListInputOf<"fish_audio">> = {},
): ListInputOf<"fish_audio"> =>
	withOver<ListInputOf<"fish_audio">>(
		{
			provider: "fish_audio",
			source: "public",
			page: 1,
			query: {
				search: "",
				language: "ko",
				tags: [],
				licensed: false,
				sort: "score",
			},
		},
		over,
	);
