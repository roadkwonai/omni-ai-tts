"use client";

import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@ui-sdk/react/dialog";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { NAV_ITEMS } from "@/lib/landing-content";

import { LandingLogo } from "./landing-logo";

// 줄 둘이 ☰ ↔ ✕로 모핑하는 아이콘(landing.css). open이면 ✕
function MenuIcon({ open }: { open?: boolean }) {
	return (
		<span
			aria-hidden="true"
			className="landing-menu-icon"
			data-open={open ? "" : undefined}
		>
			<span />
			<span />
		</span>
	);
}

const MENU_BUTTON =
	"landing-press inline-flex size-11 items-center justify-center rounded-lg outline-offset-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";
// Tailwind 4의 hover:는 (hover: hover) 안에서만 걸린다(터치에서 눌린 뒤 색이 남지 않는다)
const MENU_LINK =
	"flex min-h-14 items-center border-border border-b font-bold text-2xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring hover:text-primary";

// 떠 있는 막대(브리프 3절 0번). 맨 위를 벗어나면 배경 흐림·테두리가 나타난다(기준점은 IntersectionObserver).
// 767px 이하는 로고 + 메뉴 단추이고 전체 높이 패널(UI SDK Dialog: 포커스 가두기·Esc·포커스 복귀)을 연다.
export function LandingBar() {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const barRef = useRef<HTMLElement>(null);
	const pendingHash = useRef<string | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(([entry]) => {
			const bar = barRef.current;
			if (!bar || !entry) return;
			if (entry.isIntersecting) delete bar.dataset.scrolled;
			else bar.dataset.scrolled = "";
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	return (
		<>
			<div
				ref={sentinelRef}
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-2"
			/>
			<header
				ref={barRef}
				className="group/bar fixed inset-x-0 top-3 z-40 px-3"
			>
				<nav
					aria-label="랜딩 메뉴"
					className="relative isolate mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4"
				>
					<span
						aria-hidden="true"
						className="absolute inset-0 -z-10 rounded-2xl bg-background/90 opacity-0 ring-1 ring-border backdrop-blur-lg transition-opacity group-data-scrolled/bar:opacity-100"
					/>
					<a
						href="#top"
						className="rounded-lg outline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring"
					>
						<LandingLogo className="h-10 w-auto" />
					</a>
					<ul className="hidden items-center gap-1 md:flex">
						{NAV_ITEMS.map((item) => (
							<li key={item.href}>
								<a
									href={item.href}
									className="inline-flex min-h-11 items-center rounded-lg px-3 font-bold text-muted-foreground text-sm outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
								>
									{item.label}
								</a>
							</li>
						))}
					</ul>
					<Link
						href="/login"
						className={cn(
							buttonVariants({ variant: "neutral" }),
							"landing-press hidden md:inline-flex",
						)}
					>
						로그인
					</Link>
					<Dialog
						open={menuOpen}
						onOpenChange={setMenuOpen}
						onOpenChangeComplete={(open) => {
							const hash = pendingHash.current;
							pendingHash.current = null;
							if (open || !hash) return;
							// 이동한 섹션으로 스크롤하고 포커스도 옮긴다(안 옮기면 포커스가 body에 남는다, 7번)
							const target = document.querySelector<HTMLElement>(hash);
							target?.scrollIntoView();
							target?.focus({ preventScroll: true });
						}}
					>
						<DialogTrigger
							aria-label="메뉴"
							// 라이브러리 트리거는 aria-expanded를 주지 않아 열림 상태를 직접 단다(8번)
							aria-expanded={menuOpen}
							className={cn(MENU_BUTTON, "md:hidden")}
						>
							{({ open }) => <MenuIcon open={open} />}
						</DialogTrigger>
						<DialogContent className="landing-menu-panel fixed inset-0 m-0 flex h-dvh max-h-none w-full max-w-none flex-col overflow-y-auto overscroll-contain border-0 bg-background/95 p-0 text-foreground backdrop-blur-xl">
							<DialogTitle className="sr-only">메뉴</DialogTitle>
							<div className="mx-3 mt-3 flex h-14 shrink-0 items-center justify-between px-4">
								<LandingLogo className="h-10 w-auto" />
								<DialogClose aria-label="메뉴 닫기" className={MENU_BUTTON}>
									<MenuIcon open />
								</DialogClose>
							</div>
							<ul className="flex flex-col px-7 pt-6">
								{NAV_ITEMS.map((item) => (
									<li key={item.href} className="landing-menu-link">
										<DialogClose
											render={<a href={item.href} />}
											onClick={() => {
												pendingHash.current = item.href;
											}}
											className={MENU_LINK}
										>
											{item.label}
										</DialogClose>
									</li>
								))}
								<li className="landing-menu-link">
									<DialogClose
										render={<Link href="/login" />}
										className={cn(MENU_LINK, "text-primary")}
									>
										로그인
									</DialogClose>
								</li>
							</ul>
						</DialogContent>
					</Dialog>
				</nav>
			</header>
		</>
	);
}
