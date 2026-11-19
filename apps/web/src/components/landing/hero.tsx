import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

import {
	HERO_SOURCE_LEAD,
	HERO_SUBTITLE,
	HERO_TITLE,
} from "@/lib/landing-content";

import { HeroCard } from "./hero-card";
import { ServiceNames } from "./service-names";

// 히어로(브리프 3절 1번): 헤드라인 → 부제 → 작동하는 문단 카드 → 주·보조 버튼 → 출처 한 줄. 비등간격(0·60·210ms, 마스코트 마지막)으로 올라온다(landing.css).
// 카드와 버튼은 마지막 단계(4)에 함께 올라온다. 마스코트는 lg 이상에서 카드 옆에 작게 둔다(좁은 폭은 첫 화면에 카드와 버튼이 들어오게 뺀다).
export function Hero() {
	return (
		<section
			aria-labelledby="hero-title"
			className="px-4 pt-24 pb-12 md:px-8 md:pt-40 md:pb-16"
		>
			<div className="mx-auto flex max-w-hero flex-col items-center gap-4 text-center md:gap-6">
				<h1
					id="hero-title"
					data-step="0"
					className="landing-hero-in text-balance break-keep font-bold text-3xl tracking-tight md:text-5xl"
				>
					{HERO_TITLE}
				</h1>
				<p
					data-step="1"
					className="landing-hero-in text-pretty break-keep text-lg text-muted-foreground"
				>
					<ServiceNames text={HERO_SUBTITLE} />
				</p>
			</div>
			<div
				data-step="4"
				className="landing-hero-in mx-auto mt-8 flex max-w-234 flex-col items-center gap-6 md:mt-10"
			>
				<div className="flex w-full items-end justify-center gap-6">
					<div className="w-full max-w-180">
						<HeroCard />
					</div>
					<Image
						src="/brand/mascot-hero.png"
						alt=""
						width={658}
						height={720}
						sizes="144px"
						className="landing-mascot-in hidden h-auto w-36 lg:block"
					/>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-3">
					<Link
						href="/studio"
						className={cn(buttonVariants({ size: "lg" }), "landing-press")}
					>
						데모 써 보기
					</Link>
					<a
						href="#listen"
						className={cn(
							buttonVariants({ variant: "outline", size: "lg" }),
							"landing-press",
						)}
					>
						기능 둘러보기
					</a>
				</div>
				{/* 서비스 이름은 바로 아래 증명 띠가 말한다. 여기는 AI 음성 표기 한 줄이다 */}
				<p className="max-w-180 text-pretty break-keep text-muted-foreground text-sm">
					{HERO_SOURCE_LEAD}
				</p>
			</div>
		</section>
	);
}
