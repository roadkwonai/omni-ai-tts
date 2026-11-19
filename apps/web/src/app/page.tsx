import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Built } from "@/components/landing/built";
import { DeliverSection } from "@/components/landing/deliver-section";
import { DramaSection } from "@/components/landing/drama-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { LandingBar } from "@/components/landing/landing-bar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { ListenSection } from "@/components/landing/listen-section";
import { NumbersSection } from "@/components/landing/numbers-section";
import { ProofBand } from "@/components/landing/proof-band";
import { Steps } from "@/components/landing/steps";
import { StudioSection } from "@/components/landing/studio-section";
import { Tagline } from "@/components/landing/tagline";
import { TourSection } from "@/components/landing/tour-section";
import { getOwnerSession } from "@/context";
import { ENV } from "@/env.server";
import { landingRedirect } from "@/lib/landing";
import { HERO_SUBTITLE, TAGLINE_LINES } from "@/lib/landing-content";
import { FAQ_ITEMS, faqJsonLd, jsonLdText } from "@/lib/landing-faq";

const TITLE =
	"Omni AI TTS · 같은 문장을 다섯 성우에게 읽혀 보는 한국어 음성 작업실";
const OG_IMAGE = {
	url: "/brand/og-image.png",
	width: 1200,
	height: 630,
	alt: "Omni AI TTS 로고 옆에서 헤드폰을 쓴 마이크 마스코트가 대본을 들고 손을 흔드는 모습",
};

// 색인하는 공개 페이지(브리프 10절). 제목은 루트 template(" · Omni AI TTS")에 걸리지 않게 absolute로 둔다.
// 이미지 주소는 metadataBase(배포 주소)로 절대 주소가 된다.
export const metadata: Metadata = {
	metadataBase: new URL(ENV.BETTER_AUTH_URL),
	title: { absolute: TITLE },
	description: HERO_SUBTITLE,
	alternates: { canonical: "/" },
	openGraph: {
		type: "website",
		locale: "ko_KR",
		siteName: "Omni AI TTS",
		title: TITLE,
		description: HERO_SUBTITLE,
		url: "/",
		images: [OG_IMAGE],
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: HERO_SUBTITLE,
		images: [OG_IMAGE],
	},
};

// 소개 페이지(공개 데모에만 있다, T15-a2). 본인용은 소유자 → /studio, 아니면 /login. 세션만 읽고 db·공급자를 부르지 않는다. 세션 때문에 동적 경로다.
// 막대(banner)·바닥(contentinfo)은 `<main id="landing-content">` 밖에 둔다. 앱 틀은 (app)/layout에만 있다.
export default async function Home() {
	const owner = await getOwnerSession();
	const to = landingRedirect(owner.state, ENV.APP_MODE);
	if (to) redirect(to);

	return (
		<div id="top" className="relative overflow-x-clip">
			<a
				href="#landing-content"
				className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-card px-4 py-3 outline-ring focus:translate-y-0 focus:outline-2"
			>
				본문으로
			</a>
			<LandingBar />
			<main id="landing-content" tabIndex={-1} className="outline-none">
				<Hero />
				<ProofBand />
				<ListenSection />
				<section
					aria-label="한 줄 소개"
					className="bg-card px-4 py-section md:px-8 md:py-section-lg"
				>
					<Tagline lines={TAGLINE_LINES} />
				</section>
				<StudioSection />
				<NumbersSection />
				<DramaSection />
				<DeliverSection />
				<Steps />
				<TourSection />
				<Built />
				<FaqSection />
				<FinalCta />
			</main>
			<LandingFooter />
			<script
				type="application/ld+json"
				// 고정 글을 JSON으로 직렬화한 값이다. jsonLdText가 여는 꺾쇠를 이스케이프해 태그가 닫히지 않는다
				dangerouslySetInnerHTML={{ __html: jsonLdText(faqJsonLd(FAQ_ITEMS)) }}
			/>
		</div>
	);
}
