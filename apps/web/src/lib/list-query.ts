import type {
	InfiniteData,
	QueryClient,
	QueryKey,
} from "@tanstack/react-query";
import type { VoiceListResult } from "@tts-pilot-app/api/providers/contract";

// 무한 목록 쿼리를 첫 페이지만 남긴다. 이어 붙인 페이지를 모두 다시 부르지 않게 다시 받기 전에 자른다('목록 새로 고침', '다시 불러오기').
// 화면 문구 모듈(voice-view)이 아니라 여기 둔다. 개발 서버 없이 QueryClient만으로 테스트한다(list-query.test.ts)
export function keepFirstPage(
	queryClient: QueryClient,
	filters: { queryKey: QueryKey; exact?: boolean },
) {
	for (const [key, data] of queryClient.getQueriesData<
		InfiniteData<VoiceListResult>
	>(filters)) {
		// 무한 목록만 자른다(Typecast는 한 페이지 쿼리라 그대로 다시 받는다)
		if (data && "pages" in data) {
			queryClient.setQueryData(key, {
				pages: data.pages.slice(0, 1),
				pageParams: data.pageParams.slice(0, 1),
			});
		}
	}
}
