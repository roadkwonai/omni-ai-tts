import { ACTING } from "@/lib/landing-content";

import { ActingDemo } from "./acting-demo";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// 장면 3 연기 비교 `#acting`(브리프 3절 3번): 제목과 본문은 서버 그림이고, 칩·대본·파형·고른 연기의 얼굴은 소리를 다루는 ActingDemo(클라이언트)만 맡는다
export function ActingSection() {
	return (
		<Section id="acting" labelledBy="acting-title">
			<div className="flex flex-col gap-3">
				<SectionHeading id="acting-title" className="max-w-xl">
					{ACTING.title}
				</SectionHeading>
				<p className="max-w-hero text-pretty break-keep text-lg text-muted-foreground">
					{ACTING.body}
				</p>
			</div>
			<Reveal className="mt-8 md:mt-10">
				<ActingDemo />
			</Reveal>
		</Section>
	);
}
