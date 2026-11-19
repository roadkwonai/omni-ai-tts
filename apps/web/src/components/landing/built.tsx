import { Badge } from "@tts-pilot-app/ui/components/badge";
import { ArrowUpRight } from "lucide-react";

import {
	BUILD_POINTS,
	REPO_LINK_TEXT,
	REPO_URL,
	STACK,
	TEST_COUNT_TEXT,
} from "@/lib/landing-content";

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
				<dl className="mt-10 grid gap-4 md:grid-cols-2 md:gap-6">
					{BUILD_POINTS.map((point) => (
						// 설계 포인트 다섯을 2열 카드로 나눠 글 벽을 끊는다. 5개라 2열 마지막 칸이 비므로 마지막 항목은 두 칸을 차지한다
						<div
							key={point.title}
							className="landing-item rounded-xl bg-card p-6 ring-1 ring-border md:last:col-span-2"
						>
							<dt className="text-balance break-keep font-bold text-xl">
								{point.title}
							</dt>
							<dd className="mt-2 max-w-hero text-pretty break-keep text-muted-foreground">
								{point.text}
							</dd>
						</div>
					))}
				</dl>
				<p className="landing-item mt-10 font-bold text-lg">
					코드가 바뀔 때마다 {TEST_COUNT_TEXT}가 이 동작들을 확인합니다.
				</p>
				<p className="landing-item mt-4">
					<a
						href={REPO_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex min-h-11 items-center gap-1 rounded-sm font-bold underline decoration-2 decoration-primary underline-offset-4 outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
					>
						{/* 한 span 안에 이어 써야 flex gap이 'GitHub'과 조사 '에서' 사이를 벌리지 않는다 */}
						<span>
							<span translate="no">GitHub</span>
							{REPO_LINK_TEXT}
						</span>
						<ArrowUpRight aria-hidden="true" className="size-4" />
						<span className="sr-only">(새 창)</span>
					</a>
				</p>
			</Reveal>
		</Section>
	);
}
