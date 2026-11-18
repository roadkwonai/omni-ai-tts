import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { Tour } from "./tour";

// 기능 투어 `#tour`(브리프 3절 6번): 주 버튼 '기능 둘러보기'가 도착하는 곳
export function TourSection() {
	return (
		<Section id="tour" labelledBy="tour-title">
			<SectionHeading id="tour-title">실제 화면으로 둘러보기</SectionHeading>
			<Reveal className="mt-10">
				<Tour />
			</Reveal>
		</Section>
	);
}
