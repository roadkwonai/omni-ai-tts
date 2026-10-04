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
