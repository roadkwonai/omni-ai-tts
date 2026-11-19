import Image from "next/image";

import { Faq } from "./faq";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// FAQ(브리프 3절 8번). 같은 글이 page.tsx의 FAQPage JSON-LD에도 들어간다
export function FaqSection() {
	return (
		<Section id="faq" labelledBy="faq-title" sectionClassName="bg-card">
			<div className="flex items-end gap-4 md:gap-6">
				{/* 마스코트는 줄어들 수 있게(shrink) 두어 글자 200%·320px에서 제목 칸을 밀어내지 않는다 */}
				<SectionHeading id="faq-title">자주 묻는 질문</SectionHeading>
				<Image
					src="/brand/mascot-faq.png"
					alt=""
					width={658}
					height={720}
					sizes="112px"
					className="h-auto w-full max-w-20 shrink md:max-w-28"
				/>
			</div>
			<Reveal className="mt-8 border-border border-t">
				<Faq />
			</Reveal>
		</Section>
	);
}
