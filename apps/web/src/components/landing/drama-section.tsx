import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";

import { DRAMA_SECTION, SPEAKER_CHIPS } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { ServiceNames } from "./service-names";

// 화자 색 토큰(speaker-1~4). 클래스는 정적 글자라야 Tailwind가 만든다. 색만으로 말하지 않고 번호 원과 이름이 함께 간다
const SPEAKER_CLASSES = {
	1: { chip: "bg-speaker-1-subtle", dot: "bg-speaker-1 text-speaker-1-on" },
	2: { chip: "bg-speaker-2-subtle", dot: "bg-speaker-2 text-speaker-2-on" },
	3: { chip: "bg-speaker-3-subtle", dot: "bg-speaker-3 text-speaker-3-on" },
	4: { chip: "bg-speaker-4-subtle", dot: "bg-speaker-4 text-speaker-4-on" },
} as const;

// 대화 장면과 내 목소리 `#drama`(브리프 3절 7번): 짝 카드 둘. 카드마다 마스코트 컷이 위에 서고, 드라마 카드에는 화자 색 칩이 붙는다
export function DramaSection() {
	return (
		<Section id="drama" labelledBy="drama-title">
			<SectionHeading id="drama-title">{DRAMA_SECTION.heading}</SectionHeading>
			<Reveal className="landing-stagger mt-10 md:mt-12">
				<ul className="grid gap-6 md:grid-cols-2 md:gap-8">
					{DRAMA_SECTION.cards.map((card) => (
						<li
							key={card.id}
							className="landing-item flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-border md:p-8"
						>
							<div className="flex h-44 items-end justify-center md:h-52">
								<Image
									src={card.mascot.src}
									alt=""
									width={card.mascot.width}
									height={card.mascot.height}
									sizes="(min-width: 768px) 320px, 240px"
									className="h-full w-auto"
								/>
							</div>
							<h3 className="text-balance break-keep font-bold text-2xl">
								{card.title}
							</h3>
							<p className="text-pretty break-keep text-muted-foreground">
								<ServiceNames text={card.body} />
							</p>
							{card.id === "drama" ? (
								<ul aria-label="화자 색 예시" className="flex flex-wrap gap-2">
									{SPEAKER_CHIPS.map((n) => (
										<li
											key={n}
											className={cn(
												"flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm",
												SPEAKER_CLASSES[n].chip,
											)}
										>
											<span
												aria-hidden="true"
												className={cn(
													"flex size-6 items-center justify-center rounded-full font-bold text-xs tabular-nums",
													SPEAKER_CLASSES[n].dot,
												)}
											>
												{n}
											</span>
											화자 {n}
										</li>
									))}
								</ul>
							) : null}
						</li>
					))}
				</ul>
			</Reveal>
		</Section>
	);
}
