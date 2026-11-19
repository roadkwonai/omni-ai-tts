import { LISTEN } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { Shot } from "./shot";

// 들어 보고 고른다 `#listen`(브리프 3절 3번): 캐스팅 화면 크롭을 크게 왼쪽에, 글은 오른쪽에. 좁은 폭은 제목 → 크롭 순서다
export function ListenSection() {
	return (
		<Section id="listen" labelledBy="listen-title">
			<Reveal className="grid items-center gap-8 lg:grid-cols-5 lg:gap-12">
				<div className="lg:order-last lg:col-span-2">
					<SectionHeading id="listen-title">{LISTEN.title}</SectionHeading>
					<p className="mt-4 text-pretty break-keep text-lg text-muted-foreground">
						{LISTEN.body}
					</p>
				</div>
				<div className="lg:col-span-3">
					<Shot shot={LISTEN.shot} sizes="(min-width: 1024px) 608px, 100vw" />
					<p className="mt-3 text-pretty break-keep font-bold text-sm">
						{LISTEN.note}
					</p>
				</div>
			</Reveal>
		</Section>
	);
}
