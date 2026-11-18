import Image from "next/image";

import { Faq } from "./faq";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// FAQ(브리프 3절 8번). 같은 글이 page.tsx의 FAQPage JSON-LD에도 들어간다
export function FaqSection() {
	return (
		<Section id="faq" labelledBy="faq-title">
			<div className="flex items-end gap-4 md:gap-6">
				<SectionHeading id="faq-title">자주 묻는 질문</SectionHeading>
				<Image
					src="/brand/mascot-faq.png"
					alt="마이크 마스코트가 턱에 손을 대고 고개를 갸웃하며 물음표를 떠올리는 모습"
					width={658}
					height={720}
					sizes="112px"
					className="h-auto w-20 shrink-0 md:w-28"
				/>
			</div>
			<Reveal className="mt-8 border-border border-t">
				<Faq />
			</Reveal>
		</Section>
	);
}
