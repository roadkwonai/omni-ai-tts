import { afterEach, beforeEach, vi } from "vitest";

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
