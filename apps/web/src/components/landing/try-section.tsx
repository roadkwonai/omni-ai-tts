import Image from "next/image";

import { MASCOTS, TRY } from "@/lib/landing-content";

import { NumberPlayground } from "./number-playground";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// 장면 2 숫자 놀이터 `#try`(브리프 3절 2번): 다른 섹션과 같은 좌측 축에서 시작하는 입력 놀이(입력칸 폭만 max-w-3xl). 돋보기 마스코트는 제목 줄 오른쪽에 선다(장식, alt 없음)
export function TrySection() {
	return (
		<Section id="try" labelledBy="try-title" sectionClassName="bg-muted">
			<div className="flex items-end justify-between gap-4 md:gap-8">
				<div className="flex flex-col gap-3">
					<SectionHeading id="try-title">{TRY.title}</SectionHeading>
					<p className="text-pretty break-keep text-lg text-muted-foreground">
						{TRY.body}
					</p>
				</div>
				<Image
					src={MASCOTS.magnifier.src}
					alt=""
					width={MASCOTS.magnifier.width}
					height={MASCOTS.magnifier.height}
					sizes="(min-width: 768px) 128px, 80px"
					className="h-auto w-20 shrink-0 md:w-32"
				/>
			</div>
			<Reveal className="mt-8 max-w-3xl">
				<NumberPlayground />
			</Reveal>
		</Section>
	);
}
