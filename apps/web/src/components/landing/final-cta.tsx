import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

import { CTA_STACK_TEXT, CTA_TEXT, CTA_TITLE } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section } from "./section";

// 마지막 행동(T15-a2): 주 버튼 '데모 써 보기'(/studio) + 보조 '맨 위로'(#top). 로그인 링크는 없다. 이미 본 투어로 되돌리지 않고 외부 링크는 두지 않는다(재설계는 Task 9)
export function FinalCta() {
	return (
		<Section labelledBy="cta-title">
			<Reveal className="flex flex-col items-center gap-6 text-center">
				<Image
					src="/brand/mascot-cta.png"
					alt="마이크 마스코트가 대본을 들고 한쪽 손으로 앞을 가리키며 걸어가는 모습"
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
				<div className="flex flex-wrap items-center justify-center gap-3">
					<Link
						href="/studio"
						className={cn(buttonVariants({ size: "lg" }), "landing-press")}
					>
						데모 써 보기
					</Link>
					<a
						href="#top"
						className={cn(
							buttonVariants({ variant: "neutral", size: "lg" }),
							"landing-press",
						)}
					>
						맨 위로
					</a>
				</div>
				<p translate="no" className="text-muted-foreground text-sm">
					{CTA_STACK_TEXT}
				</p>
			</Reveal>
		</Section>
	);
}
