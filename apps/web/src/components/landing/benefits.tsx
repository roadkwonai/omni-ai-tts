import {
	AudioLines,
	Drama,
	LayoutList,
	ListChecks,
	type LucideIcon,
	Mic,
} from "lucide-react";

import { BENEFITS, BENEFITS_LEAD } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

const ICONS: Record<(typeof BENEFITS)[number]["id"], LucideIcon> = {
	voices: AudioLines,
	paragraphs: LayoutList,
	numbers: ListChecks,
	drama: Drama,
	clone: Mic,
};

// 할 수 있는 것(브리프 3절 3번): 굵은 혜택 + 한 줄 근거. 같은 크기 카드 격자 대신 구분선 목록이다
export function Benefits() {
	return (
		<Section id="features" labelledBy="features-title">
			<div className="grid gap-8 md:grid-cols-3 md:gap-12">
				<div className="md:sticky md:top-28 md:self-start">
					<SectionHeading id="features-title">
						한 작업실에서 할 수 있는 일
					</SectionHeading>
					<p className="mt-4 text-pretty break-keep text-lg text-muted-foreground">
						{BENEFITS_LEAD}
					</p>
				</div>
				<Reveal className="landing-stagger md:col-span-2">
					<ul className="divide-y divide-border border-border border-y">
						{BENEFITS.map((benefit) => {
							const Icon = ICONS[benefit.id];
							return (
								<li key={benefit.id} className="landing-item flex gap-4 py-6">
									<Icon
										aria-hidden="true"
										className="mt-1 size-6 shrink-0 text-primary"
									/>
									<div>
										<h3 className="text-balance break-keep font-bold text-xl">
											{benefit.title}
										</h3>
										<p className="mt-2 text-pretty break-keep text-muted-foreground">
											{benefit.detail}
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				</Reveal>
			</div>
		</Section>
	);
}
