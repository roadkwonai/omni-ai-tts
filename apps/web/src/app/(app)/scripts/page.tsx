import { Skeleton } from "@tts-pilot-app/ui/components/skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ScriptLibrary } from "@/components/script-library";
import { SCRIPT_TEXT } from "@/lib/script-text";

export const metadata: Metadata = { title: SCRIPT_TEXT.library };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·변경은 ScriptLibrary가 브라우저에서 /api/rpc로 한다(보호는 (app)/layout과 protectedProcedure).
// 조건이 주소 쿼리라 ScriptLibrary는 useSearchParams를 쓴다 → Suspense 경계(번들 문서 use-search-params 'Prerendering')
export default function ScriptsPage() {
	return (
		<>
			<PageHeader
				title={SCRIPT_TEXT.library}
				description={SCRIPT_TEXT.description}
			/>
			<div className="px-4 pb-10 md:px-11">
				<Suspense
					fallback={
						<Skeleton
							aria-hidden="true"
							className="h-96 w-full max-w-3xl rounded-2xl"
						/>
					}
				>
					<ScriptLibrary />
				</Suspense>
			</div>
		</>
	);
}
