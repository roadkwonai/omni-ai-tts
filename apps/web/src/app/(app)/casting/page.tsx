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
				// 공급자 이름은 번역하지 않는다(브리프 16)
				description={
					<>
						<span translate="no">Typecast</span>·
						<span translate="no">ElevenLabs</span>·
						<span translate="no">Fish Audio</span>·
						<span translate="no">Airy</span>·<span translate="no">Gemini</span>{" "}
						성우를 찾아 들어 보세요.
					</>
				}
			/>
			<div className="px-4 pb-10 md:px-11">
				{/* 탐색 화면은 목록+상세 1152px(R2 브리프 2절 3) */}
				<div className="max-w-6xl">
					<VoiceCasting />
				</div>
			</div>
		</>
	);
}
