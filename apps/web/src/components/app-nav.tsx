"use client";

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@tts-pilot-app/ui/components/tooltip";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	AudioWaveform,
	Ellipsis,
	FileText,
	Folder,
	Link2,
	type LucideIcon,
	Mic,
	SlidersHorizontal,
	Tag,
	UserRound,
	WandSparkles,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ModeToggle } from "./mode-toggle";

type NavItem = {
	label: string;
	icon: LucideIcon;
	// 없으면 아직 만들지 않은 화면('준비 중')이다. 그 화면을 여는 TASK가 채운다.
	href?: Route;
	// 767px 이하 위쪽 막대에 늘 보이는 메뉴. 나머지는 더보기에 들어간다.
	main?: boolean;
};

const NAV_ITEMS: NavItem[] = [
	{ label: "음성 작업실", icon: WandSparkles, href: "/studio", main: true },
	{ label: "성우 캐스팅", icon: AudioWaveform, main: true },
	{ label: "대본 보관함", icon: FileText, main: true },
	{ label: "성우 보관함", icon: UserRound },
	{ label: "프로젝트", icon: Folder },
	{ label: "프리셋", icon: SlidersHorizontal },
	{ label: "채널·분류", icon: Tag },
	{ label: "내 보이스", icon: Mic },
	{ label: "연결 상태", icon: Link2 },
];

// 767px 이하: 위쪽 막대 4칸(아이콘 위, 글자 아래) / 768~1199px: 64px 아이콘 / 1200px 이상: 208px 전체
const itemClass =
	"relative flex h-full min-h-11 flex-col items-center justify-start gap-1 rounded-lg px-1 py-1.5 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring md:flex-row md:justify-center md:px-0 xl:justify-start xl:gap-3 xl:px-2.5";
// 아이콘 메뉴(768~1199px)에서는 글자를 화면에서 숨기고 스크린 리더에는 남긴다.
const srOnlyAtIconNav = "md:sr-only xl:not-sr-only";
const listClass =
	"grid grid-cols-4 gap-0.5 px-2 py-1 md:flex md:flex-col md:gap-1 md:p-0";

export function AppNav() {
	const pathname = usePathname();
	const [moreOpen, setMoreOpen] = useState(false);

	return (
		<TooltipProvider>
			<nav
				aria-label="주요 메뉴"
				className="sticky top-0 z-10 border-b bg-sidebar text-sidebar-foreground md:flex md:h-svh md:w-16 md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:px-2 md:py-5 xl:w-52 xl:px-3 xl:py-6"
			>
				<Link
					href="/studio"
					className="mb-6 hidden min-h-11 items-center justify-center gap-2 rounded-lg font-bold text-base outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring md:flex xl:justify-start xl:px-2.5"
				>
					<span
						aria-hidden="true"
						className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground text-sm"
					>
						T
					</span>
					<span translate="no" className={srOnlyAtIconNav}>
						TTS Pilot
					</span>
				</Link>
				<ul className={listClass}>
					{NAV_ITEMS.filter((item) => item.main).map((item) => (
						<NavEntry key={item.label} item={item} pathname={pathname} />
					))}
					<li className="md:hidden">
						<button
							type="button"
							aria-expanded={moreOpen}
							aria-controls="app-nav-more"
							onClick={() => setMoreOpen((open) => !open)}
							className={cn(
								itemClass,
								"w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
							)}
						>
							<Ellipsis aria-hidden="true" className="size-4.5 shrink-0" />
							<span className="text-xs">더보기</span>
						</button>
					</li>
				</ul>
				{/* 768px 이상에서는 감싸는 상자가 사라져(contents) 목록과 바닥 줄이 nav 세로 흐름에 그대로 들어간다. */}
				<div
					id="app-nav-more"
					className={cn(moreOpen ? "block" : "hidden", "md:contents")}
				>
					<ul className={cn(listClass, "md:mt-1")}>
						{NAV_ITEMS.filter((item) => !item.main).map((item) => (
							<NavEntry key={item.label} item={item} pathname={pathname} />
						))}
					</ul>
					{/* xl: 44px 테마 버튼의 아이콘 중심을 메뉴 아이콘 열에 맞춘다(-3px). 글자는 포커스 링 바깥에 두려고 메뉴 글자 열에 맞추지 않는다 */}
					<div className="flex items-center gap-2 border-t px-3 py-1 md:mt-auto md:flex-col md:border-t-0 md:p-0 xl:-ml-0.75 xl:flex-row">
						<ModeToggle />
						<span
							title="로그인 없이 이 컴퓨터에서만 쓰는 모드예요"
							className={cn("text-muted-foreground text-xs", srOnlyAtIconNav)}
						>
							로컬 관리자
						</span>
					</div>
				</div>
			</nav>
		</TooltipProvider>
	);
}

function NavEntry({ item, pathname }: { item: NavItem; pathname: string }) {
	const Icon = item.icon;

	if (!item.href) {
		return (
			<li>
				<Tooltip>
					<TooltipTrigger
						render={
							<span
								className={cn(
									itemClass,
									"cursor-default text-muted-foreground",
								)}
							/>
						}
					>
						<span className="relative">
							<Icon aria-hidden="true" className="size-4.5 shrink-0" />
							{/* 아이콘 메뉴(768~1199px)에는 '준비 중' 글자가 없으니 점으로 알린다. 색만으로 구분하지 않는다. */}
							<span
								aria-hidden="true"
								className="absolute -top-0.5 -right-1 hidden size-1.5 rounded-full bg-muted-foreground md:block xl:hidden"
							/>
						</span>
						<span className={cn("text-xs xl:text-sm", srOnlyAtIconNav)}>
							{item.label}
						</span>
						<span className={cn("text-xs xl:ml-auto", srOnlyAtIconNav)}>
							준비 중
						</span>
					</TooltipTrigger>
					<TooltipContent
						side="right"
						sideOffset={12}
						className="hidden md:inline-flex xl:hidden"
					>
						{item.label} · 준비 중
					</TooltipContent>
				</Tooltip>
			</li>
		);
	}

	const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
	return (
		<li>
			<Tooltip>
				<TooltipTrigger
					render={
						<Link
							href={item.href}
							aria-current={active ? "page" : undefined}
							className={cn(
								itemClass,
								active
									? // 다크에서는 활성 바탕이 옆 바탕과 거의 같아 왼쪽 막대로도 알린다.
										"bg-sidebar-accent font-semibold text-sidebar-accent-foreground md:before:absolute md:before:inset-y-2 md:before:left-0 md:before:w-0.75 md:before:rounded-full md:before:bg-sidebar-primary"
									: "text-foreground hover:bg-accent hover:text-accent-foreground",
							)}
						/>
					}
				>
					<Icon aria-hidden="true" className="size-4.5 shrink-0" />
					<span className={cn("text-xs xl:text-sm", srOnlyAtIconNav)}>
						{item.label}
					</span>
				</TooltipTrigger>
				{/* 이름이 화면에 없는 아이콘 메뉴(768~1199px)에서만 보인다. 마우스와 키보드 포커스 모두에서 뜬다. */}
				<TooltipContent
					side="right"
					sideOffset={12}
					className="hidden md:inline-flex xl:hidden"
				>
					{item.label}
				</TooltipContent>
			</Tooltip>
		</li>
	);
}
