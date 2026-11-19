import { FLOW } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { Shot } from "./shot";

// 장면 5 작업 흐름(브리프 3절 5번): 성우 캐스팅 → 보관함 → 문단 작업실 → 받기. md 이상은 2×2(카드 한 칸이 약 460px), 휴대폰은 세로로 쌓인다.
// 칸이 넓어져 글자가 읽히도록 크롭 단계는 핵심만 찍은 휴대폰 판을 모든 폭에서 쓰고(mobileCrop), 보관함은 크롭이 없어 전체 화면 판을 쓴다. 움직임은 기존 reveal 한 번(항목 60ms 간격)뿐이다
export function FlowSection() {
	return (
		<Section labelledBy="flow-title">
			<SectionHeading id="flow-title">{FLOW.title}</SectionHeading>
			<Reveal className="landing-stagger mt-10 md:mt-12">
				<ol className="grid items-start gap-8 md:grid-cols-2 md:gap-x-8 md:gap-y-12">
					{FLOW.steps.map((step) => (
						<li key={step.id} className="landing-item flex flex-col gap-3">
							<Shot
								shot={step.shot}
								mobileCrop={step.id !== "library"}
								sizes="(min-width: 768px) 480px, 100vw"
							/>
							<h3 className="text-balance break-keep font-bold text-xl">
								{step.name}
							</h3>
							<p className="text-pretty break-keep text-muted-foreground">
								{step.text}
							</p>
						</li>
					))}
				</ol>
			</Reveal>
		</Section>
	);
}
