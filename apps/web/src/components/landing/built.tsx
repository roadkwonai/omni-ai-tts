import { Badge } from "@tts-pilot-app/ui/components/badge";

import { BUILD_POINTS, STACK, TEST_COUNT_TEXT } from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// 만든 방법(브리프 3절 7번, 포트폴리오): 기술 스택 배지, 설계 포인트, 자동 테스트 수. 후기·사용자 수는 없다
export function Built() {
	return (
		<Section id="built" labelledBy="built-title">
			<SectionHeading id="built-title">이렇게 만들었습니다</SectionHeading>
			<Reveal className="landing-stagger mt-10">
				<ul className="landing-item flex flex-wrap gap-2">
					{STACK.map((name) => (
						<li key={name}>
							<Badge translate="no">{name}</Badge>
						</li>
					))}
				</ul>
				<dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
					{BUILD_POINTS.map((point) => (
						<div key={point.title} className="landing-item">
							<dt className="text-balance break-keep font-bold text-xl">
								{point.title}
							</dt>
							<dd className="mt-2 text-pretty break-keep text-muted-foreground">
								{point.text}
							</dd>
						</div>
					))}
				</dl>
				<p className="landing-item mt-10 font-bold text-lg">
					{TEST_COUNT_TEXT}가 코드가 바뀔 때마다 이 동작들을 확인합니다.
				</p>
			</Reveal>
		</Section>
	);
}
