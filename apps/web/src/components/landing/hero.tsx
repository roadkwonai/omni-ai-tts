import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Link from "next/link";

import {
	DEMO_HREF,
	DEMO_LABEL,
	HERO_BUILT_HREF,
	HERO_BUILT_TEXT,
	HERO_SUBTITLE,
	HERO_TITLE,
} from "@/lib/landing-content";

import { HeroStage } from "./hero-stage";
import { ServiceNames } from "./service-names";

// 장면 1 히어로 `#listen`(브리프 3절 1번): 헤드라인 → 부제 → '데모 작업실 열기'(주 행동) → 작은 '만든 방법 보기' 링크 → 감독 마스코트, 옆에 오디션 무대 → 출처 한 줄.
// 비등간격(0·60·210ms, 마스코트 마지막)으로 올라온다(landing.css). lg 이상은 왼쪽 소개·오른쪽 무대 두 열이라 1440×900 첫 화면에 마스코트와 무대 다섯 줄이 함께 보인다(HeroStage).
// 데모 버튼은 부제 바로 아래라 휴대폰 첫 화면에서도 '모두 이어 듣기'(무대 첫 줄)와 함께 보인다
export function Hero() {
	return (
		<section
			id="listen"
			aria-labelledby="hero-title"
			tabIndex={-1}
			className="px-4 pt-24 pb-12 outline-none md:px-8 md:pt-40 md:pb-16 lg:pt-28 lg:pb-12"
		>
			<HeroStage
				intro={
					<>
						<h1
							id="hero-title"
							data-step="0"
							className="landing-hero-in text-balance break-keep font-bold text-3xl tracking-tight md:text-5xl lg:text-4xl xl:text-5xl"
						>
							{HERO_TITLE}
						</h1>
						<p
							data-step="1"
							className="landing-hero-in text-pretty break-keep text-lg text-muted-foreground"
						>
							<ServiceNames text={HERO_SUBTITLE} />
						</p>
						<Link
							href={DEMO_HREF}
							data-step="1"
							className={cn(
								buttonVariants({ size: "lg" }),
								"landing-hero-in landing-press",
							)}
						>
							{DEMO_LABEL}
						</Link>
						<a
							href={HERO_BUILT_HREF}
							data-step="1"
							className="landing-hero-in inline-flex min-h-11 items-center text-pretty break-keep rounded-sm text-muted-foreground text-sm underline underline-offset-4 outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						>
							{HERO_BUILT_TEXT}
						</a>
					</>
				}
			/>
		</section>
	);
}
