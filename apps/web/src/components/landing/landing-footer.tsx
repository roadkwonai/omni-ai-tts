import { ArrowUpRight } from "lucide-react";

import { FOOTER_TEXT, REPO_LINK_TEXT, REPO_URL } from "@/lib/landing-content";

import { ProkitCredit } from "../prokit-credit";

// 바닥(브리프 3절 10번): 상표 한 줄과 GitHub 저장소 작은 링크 하나. 만들지 않는 페이지(약관·개인정보)로 가는 링크는 두지 않는다
export function LandingFooter() {
	return (
		<footer className="border-border border-t px-4 py-8 md:px-8">
			<p
				translate="no"
				className="mx-auto max-w-5xl text-pretty break-keep text-center text-muted-foreground text-sm"
			>
				{FOOTER_TEXT}
			</p>
			<p className="mt-1 flex justify-center">
				<a
					href={REPO_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex min-h-11 items-center gap-1 rounded-sm text-muted-foreground text-sm underline underline-offset-4 outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				>
					{/* 한 span 안에 이어 써야 flex gap이 'GitHub'과 조사 '에서' 사이를 벌리지 않는다 */}
					<span>
						<span translate="no">GitHub</span>
						{REPO_LINK_TEXT}
					</span>
					<ArrowUpRight aria-hidden="true" className="size-4" />
					<span className="sr-only">(새 창)</span>
				</a>
			</p>
			<ProkitCredit className="justify-center text-muted-foreground" />
		</footer>
	);
}
