import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	ArrowDown,
	ArrowRight,
	ArrowUpRight,
	Code,
	Database,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import {
	BUILT,
	MASCOTS,
	REPO_LINK_TEXT,
	REPO_URL,
} from "@/lib/landing-content";

import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

// 이 섹션만 반전한 어두운 띠다(페이지 바탕과 다른 띠로 리듬을 한 번 깨뜨린다). 바탕은 bg-foreground, 글자는 text-background이고
// 보조 글·카드·선은 모두 background에 투명도를 준 토큰이다. 라이트에서는 어두운 띠, 다크에서는 밝은 띠가 된다(두 테마 모두 페이지와 갈린다)

// 도해의 화살표: 좁은 폭은 아래로, md 이상은 오른쪽으로(장식)
function Arrow() {
	return (
		<>
			<ArrowDown
				aria-hidden="true"
				className="size-5 shrink-0 self-center text-background/75 md:hidden"
			/>
			<ArrowRight
				aria-hidden="true"
				className="hidden size-5 shrink-0 text-background/75 md:block"
			/>
		</>
	);
}

function Lane({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-3">
			{children}
		</div>
	);
}

// 사람(방문자·소유자)은 알약, 시스템은 카드. 색은 토큰이고 글자는 HTML이라 번역·확대가 된다
function Actor({ children }: { children: ReactNode }) {
	return (
		<p className="w-fit break-keep rounded-full bg-background/20 px-4 py-2 font-bold text-sm md:min-w-20 md:text-center">
			{children}
		</p>
	);
}

function Node({
	title,
	notes,
	className,
}: {
	title: string;
	notes?: readonly string[];
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-xl bg-background/10 px-4 py-3 ring-1 ring-background/25 ring-inset",
				className,
			)}
		>
			<p className="text-pretty break-keep font-bold">{title}</p>
			{notes ? (
				<p className="mt-1 text-pretty break-keep text-background/75 text-sm">
					{notes.join(" · ")}
				</p>
			) : null}
		</div>
	);
}

// 장면 7 숫자로 보는 제작 `#built`(브리프 3절 7번): 어두운 띠에 숫자(자동 테스트 수가 가장 크다)와 아키텍처 도해 + 설계도 마스코트 한 덩어리, 반전 GitHub 버튼. 도해는 HTML과 토큰 색이다(그림 생성 아님)
export function Built() {
	const { arch } = BUILT;
	const tests = BUILT.stats.find((stat) => stat.id === "tests");
	const rest = BUILT.stats.filter((stat) => stat.id !== "tests");
	return (
		<Section
			id="built"
			labelledBy="built-title"
			sectionClassName="bg-foreground text-background"
		>
			<SectionHeading id="built-title">{BUILT.title}</SectionHeading>
			<Reveal className="landing-stagger mt-10">
				<dl className="landing-item grid gap-x-8 gap-y-8 sm:grid-cols-3">
					{tests ? (
						<div className="sm:col-span-3">
							<dt className="break-keep text-background/75 text-lg">
								{tests.label}
							</dt>
							<dd className="mt-1 font-bold text-6xl tabular-nums md:text-7xl">
								{tests.value}
								<span className="ml-1 text-3xl md:text-4xl">{tests.unit}</span>
							</dd>
						</div>
					) : null}
					{rest.map((stat) => (
						<div key={stat.id}>
							<dt className="text-pretty break-keep text-background/75 text-sm">
								{stat.label}
							</dt>
							<dd className="mt-1 font-bold text-4xl tabular-nums md:text-5xl">
								{stat.value}
								<span className="ml-0.5 text-xl md:text-2xl">{stat.unit}</span>
							</dd>
						</div>
					))}
				</dl>
				{/* 도해와 마스코트는 한 덩어리: 한 상자 안에서 마스코트가 도해 옆(좁은 폭은 아래)에 서 있다 */}
				<div className="landing-item mt-12 grid overflow-hidden rounded-2xl bg-background/10 ring-1 ring-background/25 ring-inset lg:grid-cols-[minmax(0,1fr)_13rem]">
					<figure className="flex min-w-0 flex-col gap-3 p-4 md:p-6">
						<figcaption className="sr-only">{arch.label}</figcaption>
						<div aria-hidden="true" className="flex flex-col gap-6">
							<Lane>
								<Actor>{arch.visitor}</Actor>
								<Arrow />
								<Node title={arch.demo} notes={arch.demoNotes} />
							</Lane>
							<Lane>
								<Actor>{arch.owner}</Actor>
								<Arrow />
								<Node title={arch.own} notes={arch.ownNotes} />
								<Arrow />
								<Node title={arch.services} />
							</Lane>
							<p className="flex items-center gap-2 break-keep font-bold text-sm md:justify-end">
								<Database aria-hidden="true" className="size-4 shrink-0" />
								{arch.reuse}
							</p>
						</div>
					</figure>
					<div className="flex items-end justify-center px-4 pt-4 lg:pt-6">
						<Image
							src={MASCOTS.blueprint.src}
							alt=""
							width={MASCOTS.blueprint.width}
							height={MASCOTS.blueprint.height}
							sizes="(min-width: 1024px) 208px, 144px"
							className="h-auto w-36 lg:w-full"
						/>
					</div>
				</div>
				<p className="landing-item mt-8">
					<a
						href={REPO_URL}
						target="_blank"
						rel="noopener noreferrer"
						className={cn(
							buttonVariants({ size: "lg" }),
							"landing-press bg-background text-foreground hover:bg-background/85 focus-visible:outline-background",
						)}
					>
						<Code aria-hidden="true" />
						{/* 한 span 안에 이어 써야 flex gap이 'GitHub'과 조사 '에서' 사이를 벌리지 않는다 */}
						<span>
							<span translate="no">GitHub</span>
							{REPO_LINK_TEXT}
						</span>
						<ArrowUpRight aria-hidden="true" />
						<span className="sr-only">(새 창)</span>
					</a>
				</p>
			</Reveal>
		</Section>
	);
}
