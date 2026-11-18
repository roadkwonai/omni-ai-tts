import type { Metadata } from "next";

import { ParagraphStudio } from "@/components/paragraph-studio";

export const metadata: Metadata = { title: "음성 작업실" };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·생성은 ParagraphStudio가 브라우저에서 /api/rpc로 한다(보호는 (app)/layout과 protectedProcedure).
// 머리(제목·채널·'프리셋')도 ParagraphStudio가 그린다(작업실 상태를 읽는다)
export default function StudioPage() {
	return <ParagraphStudio />;
}
