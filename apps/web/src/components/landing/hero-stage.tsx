"use client";

import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";
import type { ReactNode } from "react";

import { HERO_SOURCE_LEAD, MASCOTS } from "@/lib/landing-content";

import { Audition } from "./audition";
import { useSamplePlayer } from "./use-sample-player";

// 히어로 본체(브리프 3절 1번): lg 이상은 왼쪽(소개 글 → 감독 마스코트)·오른쪽(오디션 무대) 두 열, 좁은 폭은 소개 → 무대 → 마스코트 순서다.
// 재생 상태를 무대(Audition)와 마스코트가 함께 봐야 해서 소리 훅은 여기서 한 번만 쓴다.
// 소리가 나는 동안(status playing)만 마스코트가 살짝 기울며 커지고 메가폰 쪽에서 음파 링 셋이 퍼진다(transform·opacity만, 반복은 재생 중에만).
// 움직임 줄이기에서는 기울기·확대가 빠지고(motion-safe) 링의 반복은 globals.css가 멈춰 같은 자리에 정지한 링 하나로 남는다
const RING_DELAYS = ["0ms", "330ms", "660ms"] as const;

function Director({ playing }: { playing: boolean }) {
	return (
		<div className="relative mx-auto w-40 max-w-full lg:col-start-1 lg:row-start-2 lg:mx-0 lg:w-56 lg:self-start">
			<Image
				src={MASCOTS.director.src}
				alt=""
				width={MASCOTS.director.width}
				height={MASCOTS.director.height}
				sizes="(min-width: 1024px) 224px, 160px"
				loading="eager"
				fetchPriority="high"
				className={cn(
					"landing-mascot-in h-auto w-full max-w-full origin-bottom transition-transform duration-300 ease-out",
					playing && "motion-safe:-rotate-2 motion-safe:scale-[1.04]",
				)}
			/>
			{playing ? (
				<span aria-hidden="true">
					{RING_DELAYS.map((delay) => (
						<span
							key={delay}
							style={{ animationDelay: delay }}
							// 메가폰 입구(그림의 오른쪽 위, 81%·37%)가 중심이다
							className="absolute top-[37%] left-[81%] size-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-primary [animation-duration:1.2s]"
						/>
					))}
				</span>
			) : null}
		</div>
	);
}

export function HeroStage({ intro }: { intro: ReactNode }) {
	const player = useSamplePlayer();
	const playing = player.currentId !== null && player.status === "playing";

	return (
		<div className="mx-auto mt-8 grid max-w-6xl gap-6 md:mt-10 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:grid-rows-[auto_1fr] lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
			<div className="flex flex-col items-center gap-4 text-center md:gap-6 lg:col-start-1 lg:row-start-1 lg:items-start lg:text-left">
				{intro}
			</div>
			<div
				data-step="4"
				className="landing-hero-in lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
			>
				<Audition player={player} />
			</div>
			<Director playing={playing} />
			<p className="max-w-180 text-pretty break-keep text-center text-muted-foreground text-sm lg:col-span-2 lg:mx-auto">
				{HERO_SOURCE_LEAD}
			</p>
		</div>
	);
}
