import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";

import {
	HERO_SUBTITLE,
	HERO_TITLE,
	PROVIDERS,
	TEST_COUNT_TEXT,
} from "@/lib/landing-content";

// 히어로(브리프 3절 1번): 헤드라인 → 부제 → 주 버튼 → 증거 한 줄 → 스크린샷·마스코트 순으로 비등간격(0·60·130·210ms, 마스코트 마지막)으로 올라온다(CSS 애니메이션, landing.css).
// 주 행동은 '기능 둘러보기' 하나이고 로그인은 막대의 보조 버튼이다. 첫 화면 390px에 주 버튼이 들어온다.
export function Hero() {
	return (
		<section
			aria-labelledby="hero-title"
			className="px-4 pt-28 pb-section md:px-8 md:pt-40 md:pb-section-lg"
		>
			<div className="mx-auto flex max-w-hero flex-col items-center gap-6 text-center">
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
					{HERO_SUBTITLE}
				</p>
				<a
					href="#tour"
					data-step="2"
					className={cn(
						buttonVariants({ size: "lg" }),
						"landing-hero-in landing-press",
					)}
				>
					기능 둘러보기
				</a>
				<p
					data-step="3"
					className="landing-hero-in text-pretty break-keep text-muted-foreground text-sm"
				>
					<span translate="no">{PROVIDERS.join(" · ")}</span> 연동 ·{" "}
					{TEST_COUNT_TEXT}
				</p>
			</div>
			<div
				data-step="4"
				className="landing-hero-in relative mx-auto mt-14 max-w-234"
			>
				<div className="rounded-2xl bg-card p-2 ring-1 ring-border">
					{/* 767px 이하: 휴대폰 판(투어와 같은 w-64 틀) */}
					<div className="mx-auto w-64 overflow-hidden rounded-lg md:hidden">
						<Image
							src="/screenshots/studio-mobile.png"
							alt="음성 작업실 휴대폰 화면"
							width={390}
							height={844}
							fetchPriority="high"
							sizes="256px"
							className="h-auto w-full"
						/>
					</div>
					{/* 768px 이상: 제목·첫 문단 카드·작업 요약만 자른 1:1 판(920px 폭을 넘겨 늘리지 않는다). 테마 판은 fetchPriority만 두고
					    기본 lazy로 숨은 판을 받지 않는다(Next 16 Image 문서: 테마별 이미지에는 preload·eager 금지) */}
					<div className="hidden overflow-hidden rounded-lg md:block">
						<Image
							src="/screenshots/studio-hero.png"
							alt="음성 작업실 화면. 제목 아래 첫 문단 카드에 성우가 붙어 있고 숫자 검수 안내가 보이며, 오른쪽에 만든 문단 수와 예상 길이가 있다"
							width={920}
							height={445}
							fetchPriority="high"
							sizes="(min-width: 1024px) 920px, calc(100vw - 80px)"
							className="h-auto w-full dark:hidden"
						/>
						<Image
							src="/screenshots/studio-hero-dark.png"
							alt="다크 테마의 음성 작업실 화면. 제목 아래 첫 문단 카드에 성우가 붙어 있고 숫자 검수 안내가 보이며, 오른쪽에 만든 문단 수와 예상 길이가 있다"
							width={920}
							height={445}
							fetchPriority="high"
							sizes="(min-width: 1024px) 920px, calc(100vw - 80px)"
							className="hidden h-auto w-full dark:block"
						/>
					</div>
				</div>
				<Image
					src="/brand/mascot-hero.png"
					alt="헤드폰을 쓴 마이크 마스코트가 대본을 들고 손을 흔드는 모습"
					width={658}
					height={720}
					sizes="(min-width: 768px) 160px, 112px"
					className="landing-mascot-in absolute -right-2 -bottom-8 h-auto w-28 md:-right-6 md:w-40"
				/>
			</div>
		</section>
	);
}
