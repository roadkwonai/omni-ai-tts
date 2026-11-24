import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { PresetBoard } from "@/components/preset-board";

export const metadata: Metadata = { title: "프리셋" };

// Server Component. db 모듈을 부르지 않는다. 조회·변경은 PresetBoard가 브라우저에서 /api/rpc로 한다(보호는 (app)/layout과 protectedProcedure).
// 설정 값을 어디서 고치는지는 이 설명 한 곳에만 둔다(본문에 같은 안내를 되풀이하지 않는다, 계획 리뷰 D18). 성우 캐스팅으로 가는 길도 이 설명 안 링크 하나다(R2)
export default function PresetsPage() {
	return (
		<>
			<PageHeader
				title="프리셋"
				description={
					<>
						자주 쓰는 성우와 듣기 설정을 이름 붙여 두고{" "}
						<Link
							href="/casting"
							className="relative whitespace-nowrap text-foreground underline underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3.5 hover:text-primary"
						>
							성우 캐스팅
						</Link>
						의 ‘내 문장 듣기’에서 불러와요. 고친 설정은 같은 프리셋에 덮어
						저장해요.
					</>
				}
			/>
			<div className="px-4 pb-10 md:px-11">
				<PresetBoard />
			</div>
		</>
	);
}
