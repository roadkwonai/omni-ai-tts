import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { VoiceCasting } from "@/components/voice-casting";

export const metadata: Metadata = { title: "성우 캐스팅" };

// Server Component. 공급자·db 모듈을 부르지 않는다. 목록은 VoiceCasting이 브라우저에서 /api/rpc로 받는다.
export default function CastingPage() {
	return (
		<>
			<PageHeader
				title="성우 캐스팅"
				description="Typecast 성우를 찾아 기본 샘플을 들어 보세요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<VoiceCasting />
			</div>
		</>
	);
}
