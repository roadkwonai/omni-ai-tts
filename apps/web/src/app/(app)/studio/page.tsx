import type { Metadata } from "next";

import { StudioEditor } from "@/components/studio-editor";

export const metadata: Metadata = { title: "음성 작업실" };

// Server Component. db·공급자 모듈을 부르지 않는다. 조회·생성은 StudioEditor가 브라우저에서 /api/rpc로 한다(로컬 관리자 모드).
// 머리(제목·채널·'프리셋')도 StudioEditor가 그린다(작업실 상태를 읽는다). 제작 흐름 지도는 편집기로 바뀌어 없어졌다(스펙 2절)
export default function StudioPage() {
	return <StudioEditor />;
}
