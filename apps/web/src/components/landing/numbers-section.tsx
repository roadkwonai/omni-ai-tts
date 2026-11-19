import { NUMBERS } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { Shot } from "./shot";

// 제목의 따옴표 안 숫자는 히어로 카드 토글과 같은 강조(primary-subtle 바탕)로 칠한다
function Title({ text }: { text: string }) {
	return text.split(/(“[^”]+”)/).map((part) =>
		part.startsWith("“") ? (
			<mark
				key={part}
				className="rounded-sm bg-primary-subtle px-1 font-bold text-foreground"
			>
				{part}
			</mark>
		) : (
			part
		),
	);
}

// 숫자를 제대로 읽는다(브리프 3절 6번): 가운데 정렬의 짧은 섹션. 앞뒤 섹션(좌우 배치, 짝 카드)과 모양이 겹치지 않는다
export function NumbersSection() {
	return (
		<Section
			labelledBy="numbers-title"
			sectionClassName="bg-card"
			className="max-w-3xl"
		>
			<Reveal className="flex flex-col items-center gap-6 text-center">
				<SectionHeading id="numbers-title">
					<Title text={NUMBERS.title} />
				</SectionHeading>
				<p className="text-pretty break-keep text-lg text-muted-foreground">
					{NUMBERS.body}
				</p>
				<Shot
					shot={NUMBERS.shot}
					sizes="(min-width: 768px) 448px, 100vw"
					className="mt-2 w-full max-w-md bg-background"
				/>
			</Reveal>
		</Section>
	);
}
