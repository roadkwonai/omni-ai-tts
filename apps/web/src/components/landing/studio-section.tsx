import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";

import { STUDIO } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { Shot } from "./shot";

// 문단마다 다르게 `#studio`(브리프 3절 5번, 가장 큰 섹션): 크롭 셋이 좌우로 번갈아 서고, 캡션은 굵은 기능 이름 + 한 문장이다.
// 마스코트는 첫 캡션 아래에 선다(제목 줄 끝에 떨어져 헐렁해 보이던 것을 캡션 열로 옮겼다). 장식이라 alt는 비운다.
// 움직임은 기존 reveal 한 번(항목 60ms 간격)뿐이다.
export function StudioSection() {
	return (
		<Section id="studio" labelledBy="studio-title">
			<SectionHeading id="studio-title" className="max-w-xl">
				{STUDIO.title}
			</SectionHeading>
			<Reveal className="landing-stagger mt-10 md:mt-14">
				<ol className="flex flex-col gap-12 md:gap-20">
					{STUDIO.items.map((item, index) => (
						<li
							key={item.id}
							className="landing-item grid items-start gap-5 md:grid-cols-5 md:gap-14"
						>
							<div
								className={cn(
									"md:col-span-3",
									index % 2 === 1 && "md:order-last",
								)}
							>
								<Shot
									shot={item.shot}
									sizes="(min-width: 1024px) 608px, 60vw"
								/>
							</div>
							<div className="flex flex-col gap-2 md:col-span-2">
								<h3 className="text-balance break-keep font-bold text-xl">
									{item.name}
								</h3>
								<p className="text-pretty break-keep text-lg text-muted-foreground">
									{item.text}
								</p>
								{index === 0 ? (
									<Image
										src={STUDIO.mascot.src}
										alt=""
										width={STUDIO.mascot.width}
										height={STUDIO.mascot.height}
										sizes="(min-width: 768px) 160px, 112px"
										className="mt-4 h-auto w-full max-w-28 md:max-w-40"
									/>
								) : null}
							</div>
						</li>
					))}
				</ol>
			</Reveal>
		</Section>
	);
}
