import type { Metadata } from "next";

import { ClassesBoard } from "@/components/classes-board";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "채널·분류" };

// Server Component. db 모듈을 부르지 않는다. 조회·변경은 ClassesBoard가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드)
export default function ClassesPage() {
	return (
		<>
			<PageHeader
				title="채널·분류"
				description="성우와 대본을 정리할 이름표를 만들어요. 채널은 하나를 골라 쓰고, 카테고리·타입은 여러 개 붙여요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<ClassesBoard />
			</div>
		</>
	);
}
