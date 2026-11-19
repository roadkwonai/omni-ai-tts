import Image from "next/image";

import { STEPS } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// 작동 방식 3단계(브리프 3절 9번): 단계마다 마스코트 포즈. 순서가 뜻을 가지므로 번호를 쓴다
export function Steps() {
	return (
		<Section id="how" labelledBy="how-title">
			<SectionHeading id="how-title">세 단계로 음성 파일까지</SectionHeading>
			<Reveal className="landing-stagger mt-12">
				<ol className="grid gap-10 md:grid-cols-3 md:gap-8">
					{STEPS.map((step, index) => (
						<li key={step.id} className="landing-item flex flex-col gap-4">
							<Image
								src={step.image}
								alt=""
								width={658}
								height={720}
								sizes="(min-width: 768px) 224px, 144px"
								className="h-auto w-36 md:w-56"
							/>
							<h3 className="flex items-center gap-3 text-balance break-keep font-bold text-xl">
								<span
									aria-hidden="true"
									className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-bold text-primary text-sm tabular-nums"
								>
									{index + 1}
								</span>
								{step.title}
							</h3>
							<p className="text-pretty break-keep text-muted-foreground">
								{step.detail}
							</p>
						</li>
					))}
				</ol>
			</Reveal>
		</Section>
	);
}
