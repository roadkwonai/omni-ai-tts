import type { Metadata } from "next";

import { DramaEditor } from "@/components/drama-editor";

// 탭 제목은 DRAMA_TEXT.title과 같다. 서버 모듈이라 화면 문구 모듈(공급자 계산이 딸린 lib/drama-view)을 가져오지 않는다(studio/page.tsx와 같다)
export const metadata: Metadata = { title: "드라마 작업실" };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·생성은 DramaEditor가 브라우저에서 /api/rpc로 한다(보호는 (app)/layout과 protectedProcedure).
// 머리(제목·장면 이름·모델)도 DramaEditor가 그린다(작업실 상태를 읽는다)
export default function DramaPage() {
	return <DramaEditor />;
}
