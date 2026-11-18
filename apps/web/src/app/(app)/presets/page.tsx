import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PresetBoard } from "@/components/preset-board";

export const metadata: Metadata = { title: "프리셋" };

// Server Component. db 모듈을 부르지 않는다. 조회·변경은 PresetBoard가 브라우저에서 /api/rpc로 한다(보호는 (app)/layout과 protectedProcedure).
// 설정 값을 어디서 고치는지는 이 설명 한 곳에만 둔다(본문에 같은 안내를 되풀이하지 않는다, 계획 리뷰 D18)
export default function PresetsPage() {
	return (
		<>
			<PageHeader
				title="프리셋"
				description="자주 쓰는 성우와 듣기 설정을 이름 붙여 두고 성우 캐스팅의 '내 문장 듣기'에서 불러와요. 설정 값은 거기서 고친 뒤 덮어써요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<PresetBoard />
			</div>
		</>
	);
}
