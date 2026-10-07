import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { isServer, QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@tts-pilot-app/api/routers/index";
import { toast } from "sonner";

let browserQueryClient: QueryClient | undefined;

// 서버에서는 요청마다 새로 만들어 SSR 요청끼리 캐시가 섞이지 않게 하고(server-no-shared-module-state), 브라우저에서는 하나를 쓴다.
export function getQueryClient() {
	const create = () =>
		new QueryClient({
			queryCache: new QueryCache({
				onError: (_error, query) => {
					// meta.toast가 false인 조회는 화면이 오류를 직접 보인다(연결 상태 카드).
					if (query.meta?.toast === false) return;
					toast.error(
						"데이터를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
					);
				},
			}),
		});
	if (isServer) return create();
	browserQueryClient ??= create();
	return browserQueryClient;
}

export const link = new RPCLink({
	plugins: [new SimpleCsrfProtectionLinkPlugin()],
	url: `${typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3001"}/api/rpc`,
	headers: async () => {
		if (typeof window !== "undefined") {
			return {};
		}

		const { headers } = await import("next/headers");
		return Object.fromEntries(await headers());
	},
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

// 화면이 오류를 직접 보이는 조회: 전역 알림을 끄고, 재시도하지 않으며, 루프백으로만 붙으니 브라우저 offline 판단으로 멈추지 않는다
export const QUIET = {
	retry: false,
	networkMode: "always",
	meta: { toast: false },
} as const;

// 소유 데이터 목록(채널·분류·성우 보관함) 조회 옵션(T6 classes-board).
// staleTime 0이면 첫 응답 뒤에 마운트되는 관찰자(행의 별·칩, 패널 담기 칸)마다 같은 목록을 다시 받는다(T7 audit P3-5).
// 이 앱의 변경은 모두 무효화하므로 30초 동안은 캐시를 그대로 쓴다
export const OWNED_LIST = { ...QUIET, staleTime: 30_000 } as const;
