import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

import {
	CTA_REPLAY_TEXT,
	CTA_STACK_TEXT,
	CTA_TEXT,
	CTA_TITLE,
} from "@/lib/landing-content";
import { ReplayLink } from "./replay-link";
import { Reveal } from "./reveal";
import { Section } from "./section";

// 마지막 행동(브리프 3절 13번): 주 버튼 '데모 써 보기'(/studio) + 보조 '처음으로 돌아가 다시 듣기'(히어로 카드, 첫 칩 포커스). 로그인 링크는 없다
export function FinalCta() {
	return (
		<Section labelledBy="cta-title">
			<Reveal className="flex flex-col items-center gap-6 text-center">
				<Image
					src="/brand/mascot-cta.png"
					alt=""
					width={658}
					height={720}
					sizes="160px"
					className="h-auto w-32 md:w-40"
				/>
				<h2
					id="cta-title"
					className="max-w-hero text-balance break-keep font-bold text-3xl tracking-tight md:text-4xl"
				>
					{CTA_TITLE}
				</h2>
				<p className="max-w-hero text-pretty break-keep text-lg text-muted-foreground">
					{CTA_TEXT}
				</p>
				<div className="flex w-full flex-wrap items-center justify-center gap-3">
					<Link
						href="/studio"
						className={cn(
							buttonVariants({ size: "lg" }),
							"landing-press h-auto min-h-11 max-w-full whitespace-normal text-center",
						)}
					>
						데모 써 보기
					</Link>
					<ReplayLink
						className={cn(
							buttonVariants({ variant: "neutral", size: "lg" }),
							"landing-press h-auto min-h-11 max-w-full whitespace-normal text-center",
						)}
					>
						{CTA_REPLAY_TEXT}
					</ReplayLink>
				</div>
				<p translate="no" className="text-muted-foreground text-sm">
					{CTA_STACK_TEXT}
				</p>
			</Reveal>
		</Section>
	);
}
