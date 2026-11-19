import { FOOTER_TEXT } from "@/lib/landing-content";

import { ProkitCredit } from "../prokit-credit";

// 바닥(브리프 3절 10번): 상표 한 줄만. 만들지 않는 페이지(약관·개인정보)로 가는 링크는 두지 않는다
export function LandingFooter() {
	return (
		<footer className="border-border border-t px-4 py-8 md:px-8">
			<p
				translate="no"
				className="mx-auto max-w-5xl text-pretty break-keep text-center text-muted-foreground text-sm"
			>
				{FOOTER_TEXT}
			</p>
			<ProkitCredit className="mt-3 justify-center text-muted-foreground" />
		</footer>
	);
}
