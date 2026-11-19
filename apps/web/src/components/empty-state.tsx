import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tts-pilot-app/ui/components/empty";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import Image from "next/image";
import type { ReactNode } from "react";

// 빈 상태 하나(R2 브리프 2절 5): 작은 그림 + 제목 한 줄 + 설명 한 줄 + 다음 행동 하나. 행동(children)이 없는 안내는 두지 않는다.
// 그림은 장식이라 alt가 비고 제목이 뜻을 전한다. 한 화면에 하나만 쓴다. 목록 카드와 같은 반경·경계다.
const ART = {
	studio: "/brand/empty-studio.png",
	"my-voice": "/brand/empty-my-voice.png",
	list: "/brand/empty-list.png",
} as const;

export function EmptyState({
	art,
	title,
	description,
	children,
	className,
}: {
	art: keyof typeof ART;
	title: string;
	description: ReactNode;
	// 다음 행동 하나(링크 또는 버튼). 채운 청록이 아니면 neutral
	children: ReactNode;
	className?: string;
}) {
	return (
		<Empty
			className={cn(
				"rounded-2xl bg-card py-10 ring-1 ring-border ring-inset",
				className,
			)}
		>
			<EmptyHeader>
				<EmptyMedia>
					{/* 빈 상태 그림은 첫 화면 본문이라 늦게 불러오지 않는다(LCP) */}
					<Image
						src={ART[art]}
						alt=""
						width={102}
						height={112}
						loading="eager"
						className="h-28 w-auto"
					/>
				</EmptyMedia>
				<EmptyTitle className="break-keep">{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			<EmptyContent className="flex-row flex-wrap justify-center">
				{children}
			</EmptyContent>
		</Empty>
	);
}
