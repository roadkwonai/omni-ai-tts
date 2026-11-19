import { CircleCheck } from "lucide-react";
import Image from "next/image";

import { COST, MASCOTS } from "@/lib/landing-content";

import { CostDemo } from "./cost-demo";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// 장면 6 돈 걱정 없는 설계(브리프 3절 6번): 왼쪽 재현(눌러 보는 곳), 오른쪽 세 줄과 저금통 마스코트. 좁은 폭은 재현 → 세 줄 순서
export function CostSection() {
	return (
		<Section id="cost" labelledBy="cost-title" sectionClassName="bg-muted">
			<SectionHeading id="cost-title">{COST.title}</SectionHeading>
			<Reveal className="mt-8 grid items-start gap-8 md:mt-10 lg:grid-cols-5 lg:gap-12">
				<div className="lg:col-span-3">
					<CostDemo />
				</div>
				<div className="flex flex-col gap-6 lg:col-span-2">
					<ul className="flex flex-col gap-3">
						{COST.points.map((point) => (
							<li key={point} className="flex gap-2 text-lg">
								<CircleCheck
									aria-hidden="true"
									className="mt-1 size-5 shrink-0 text-success"
								/>
								<span className="text-pretty break-keep font-bold">
									{point}
								</span>
							</li>
						))}
					</ul>
					<Image
						src={MASCOTS.piggy.src}
						alt=""
						width={MASCOTS.piggy.width}
						height={MASCOTS.piggy.height}
						sizes="160px"
						className="h-auto w-32 md:w-40"
					/>
				</div>
			</Reveal>
		</Section>
	);
}
