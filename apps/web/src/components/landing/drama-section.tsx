import Image from "next/image";

import { DRAMA } from "@/lib/landing-content";

import { DramaScene } from "./drama-scene";
import { DramaSplit } from "./drama-split";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";
import { ServiceNames } from "./service-names";

// 장면 4 드라마 장면 `#drama`(브리프 3절 4번): 제목과 본문, 소리가 나는 장면(DramaScene), 아래에 분해 도해, 옆(lg 이상)·아래(좁은 폭)에 작은 카드 '내 목소리도 성우처럼'.
// 읽는 순서는 장면 → 도해 → 카드다. 카드는 lg에서 오른쪽 열 두 줄을 차지한다
export function DramaSection() {
	const { clone } = DRAMA;
	return (
		<Section id="drama" labelledBy="drama-title" sectionClassName="bg-muted">
			<div className="flex flex-col gap-3">
				<SectionHeading id="drama-title" className="max-w-xl">
					{DRAMA.title}
				</SectionHeading>
				<p className="max-w-hero text-pretty break-keep text-lg text-muted-foreground">
					{DRAMA.body}
				</p>
			</div>
			<Reveal className="mt-8 grid gap-6 md:mt-10 lg:grid-cols-3">
				<div className="min-w-0 lg:col-span-2">
					<DramaScene />
				</div>
				<div className="min-w-0 lg:col-span-2">
					<DramaSplit />
				</div>
				<div className="flex min-w-0 flex-col gap-3 self-start rounded-2xl bg-card p-6 ring-1 ring-border ring-inset lg:col-start-3 lg:row-span-2 lg:row-start-1">
					<div className="flex h-40 items-end justify-center">
						<Image
							src={clone.mascot.src}
							alt=""
							width={clone.mascot.width}
							height={clone.mascot.height}
							sizes="160px"
							className="h-full w-auto"
						/>
					</div>
					<h3 className="text-balance break-keep font-bold text-xl">
						{clone.title}
					</h3>
					<p className="text-pretty break-keep text-muted-foreground">
						<ServiceNames text={clone.body} />
					</p>
				</div>
			</Reveal>
		</Section>
	);
}
