import { Download, Gauge, type LucideIcon, ShieldCheck } from "lucide-react";

import { DELIVER } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { ServiceNames } from "./service-names";

const ICONS: Record<(typeof DELIVER.items)[number]["id"], LucideIcon> = {
	files: Download,
	credit: ShieldCheck,
	usage: Gauge,
};

// 받기와 안심(브리프 3절 8번): 3열. 카드 상자 대신 윗선으로 가른 짧은 칸이라 앞뒤 섹션과 모양이 다르다
export function DeliverSection() {
	return (
		<Section labelledBy="deliver-title" sectionClassName="bg-card">
			<SectionHeading id="deliver-title">{DELIVER.heading}</SectionHeading>
			<Reveal className="landing-stagger mt-10">
				<ul className="grid gap-8 md:grid-cols-3 md:gap-10">
					{DELIVER.items.map((item) => {
						const Icon = ICONS[item.id];
						return (
							<li
								key={item.id}
								className="landing-item flex flex-col gap-3 border-border border-t pt-6"
							>
								<Icon aria-hidden="true" className="size-6 text-primary" />
								<h3 className="text-balance break-keep font-bold text-xl">
									{item.title}
								</h3>
								<p className="text-pretty break-keep text-muted-foreground">
									<ServiceNames text={item.detail} />
								</p>
							</li>
						);
					})}
				</ul>
			</Reveal>
		</Section>
	);
}
