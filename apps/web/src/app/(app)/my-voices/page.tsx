import type { Metadata } from "next";

import { MyVoices } from "@/components/my-voices";
import { PageHeader } from "@/components/page-header";
import { MY_VOICE_TEXT } from "@/lib/my-voice-text";

export const metadata: Metadata = { title: MY_VOICE_TEXT.title };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·변경은 MyVoices가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드)
export default function MyVoicesPage() {
	return (
		<>
			<PageHeader
				title={MY_VOICE_TEXT.title}
				description={MY_VOICE_TEXT.description}
			/>
			<div className="px-4 pb-10 md:px-11">
				<MyVoices />
			</div>
		</>
	);
}
