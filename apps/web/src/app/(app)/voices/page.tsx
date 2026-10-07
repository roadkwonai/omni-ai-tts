import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { VoiceLibrary } from "@/components/voice-library";

export const metadata: Metadata = { title: "성우 보관함" };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·변경은 VoiceLibrary가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드).
// 필터가 주소 쿼리라 VoiceLibrary는 useSearchParams를 쓴다 → Suspense 경계(번들 문서 use-search-params 'Prerendering')
export default function VoicesPage() {
	return (
		<>
			<PageHeader
				title="성우 보관함"
				description="담은 성우를 즐겨찾기·자주 사용·채널·분류로 다시 찾아요. 성우 캐스팅에서 별을 누르면 여기에 담겨요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<Suspense
					fallback={
						<Skeleton aria-hidden="true" className="h-96 w-full rounded-2xl" />
					}
				>
					<VoiceLibrary />
				</Suspense>
			</div>
		</>
	);
}
