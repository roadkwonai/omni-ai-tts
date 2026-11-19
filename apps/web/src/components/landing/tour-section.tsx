import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { Tour } from "./tour";

// 기능 투어 `#tour`(브리프 3절 10번): 제목·탭·설명은 다른 섹션과 같은 본문 선(max-w-5xl)이고, 화면 이미지만 xl 이상에서 양옆으로 넓게 선다(tour.tsx)
export function TourSection() {
	return (
		<Section id="tour" labelledBy="tour-title" sectionClassName="bg-muted">
			<SectionHeading id="tour-title">실제 화면으로 둘러보기</SectionHeading>
			<Reveal className="mt-10">
				<Tour />
			</Reveal>
		</Section>
	);
}
