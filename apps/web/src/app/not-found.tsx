import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

// 없는 주소 전부. 루트 레이아웃의 앱 틀(메뉴) 안에서 그려진다.
export default function NotFound() {
	return (
		<>
			<PageHeader
				title="페이지를 찾을 수 없어요"
				description="주소가 바뀌었거나 아직 없는 화면이에요."
			/>
			<div className="px-4 pb-10 md:px-11">
				<Link href="/studio" className={buttonVariants({ size: "lg" })}>
					작업실로 가기
				</Link>
			</div>
		</>
	);
}
