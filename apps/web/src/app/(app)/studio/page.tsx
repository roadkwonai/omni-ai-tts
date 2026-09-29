import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tts-pilot-app/ui/components/empty";
import { WandSparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";

export default function StudioPage() {
	return (
		<>
			<PageHeader
				title="음성 작업실"
				description="대본과 성우를 골라 한국어 음성을 만들 곳이에요."
			/>
			<div className="p-4 md:p-7">
				<Empty className="border bg-card">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<WandSparkles aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>성우와 대본 기능은 준비 중이에요</EmptyTitle>
						<EmptyDescription>
							다음 순서로 공급자 연결 상태 확인이 열려요.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		</>
	);
}
