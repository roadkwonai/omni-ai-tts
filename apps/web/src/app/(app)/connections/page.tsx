import type { Metadata } from "next";

import { ConnectionStatus } from "@/components/connection-status";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "연결 상태" };

// Server Component. 공급자·db 모듈을 부르지 않는다. 조회는 ConnectionStatus가 브라우저에서 /api/rpc로 한다.
export default function ConnectionsPage() {
	return (
		<>
			<PageHeader
				title="연결 상태"
				description="음성 서비스 키는 서버 환경변수에서 관리해요. 이 화면에서는 키를 입력하거나 보여 주지 않아요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<ConnectionStatus />
			</div>
		</>
	);
}
