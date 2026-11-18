import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { getOwnerSession } from "@/context";
import { ENV } from "@/env.server";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

// 없는 주소 전부. `<main>`은 늘 하나다: 소유자(데모의 예시 소유자 포함)에게는 앱 틀(메뉴·main) 안에, 아니면 메뉴 없는 main 하나에 그린다.
export default async function NotFound() {
	const owner = await getOwnerSession();
	const body = (
		<>
			<PageHeader
				title="페이지를 찾을 수 없어요"
				description="주소가 바뀌었거나 아직 없는 화면이에요."
			/>
			<div className="flex flex-col items-start gap-6 px-4 pb-10 md:px-11">
				<Image
					src="/brand/mascot-404.png"
					alt="헤드폰을 쓴 마이크 마스코트가 대본을 들고 길을 잃어 어리둥절해하는 모습"
					width={658}
					height={720}
					sizes="(min-width: 768px) 192px, 160px"
					className="h-auto w-40 md:w-48"
				/>
				<Link href="/studio" className={buttonVariants({ size: "lg" })}>
					작업실로 가기
				</Link>
			</div>
		</>
	);
	if (owner.state === "owner") {
		return (
			<AppFrame email={owner.email} demo={ENV.APP_MODE === "demo"}>
				{body}
			</AppFrame>
		);
	}
	return (
		<main id="main-content" tabIndex={-1} className="outline-none">
			{body}
		</main>
	);
}
