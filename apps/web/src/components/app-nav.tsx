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
	ChevronDown,
	Drama,
	Ellipsis,
	FileText,
	Folder,
	Link2,
	LogOut,
	type LucideIcon,
	Mic,
	SlidersHorizontal,
	Tag,
	UserRound,
	WandSparkles,
} from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	type ReactElement,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { signOutToLogin } from "@/lib/auth-client";

import { DEMO_TEXT, useDemo } from "./demo";
import { LockedIconButton } from "./locked-icon-button";
import { ModeToggle } from "./mode-toggle";

// 열린 화면. 배열 순서가 사이드바 순서이고 세 묶음(만들기 / 성우와 대본 / 설정)이다. startsGroup인 항목 앞만 24px 띄운다(묶음 이름 줄은 없다).
// 767px 이하 위 막대는 4칸이다(R2 브리프 3절): bar가 1~3이면 그 순서의 막대 칸이고 막대 넷째는 더보기다. bar가 0인 화면은 더보기 안 '열린 화면' 줄에 둔다.
// 위 막대는 사이드바와 순서가 달라 별도 목록으로 그려 DOM 순서가 보이는 순서와 같다(Tab 순서). 768px 이상에서는 모두 사이드바 목록에 배열 순서로 보인다.
// 뒤 TASK가 여는 화면도 bar: 0으로 더한다
type OpenItem = {
	label: string;
	icon: LucideIcon;
	href: Route;
	bar: 0 | 1 | 2 | 3;
	startsGroup?: true;
};
const OPEN_ITEMS: OpenItem[] = [
	{ label: "음성 작업실", icon: WandSparkles, href: "/studio", bar: 1 },
	{ label: "드라마 작업실", icon: Drama, href: "/drama", bar: 3 },
	{
		label: "성우 캐스팅",
		icon: AudioWaveform,
		href: "/casting",
		bar: 2,
		startsGroup: true,
	},
	{ label: "성우 보관함", icon: UserRound, href: "/voices", bar: 0 },
	{ label: "내 보이스", icon: Mic, href: "/my-voices", bar: 0 },
	{ label: "프리셋", icon: SlidersHorizontal, href: "/presets", bar: 0 },
	{ label: "대본 보관함", icon: FileText, href: "/scripts", bar: 0 },
	{
		label: "채널·분류",
		icon: Tag,
		href: "/classes",
		bar: 0,
		startsGroup: true,
	},
	{ label: "연결 상태", icon: Link2, href: "/connections", bar: 0 },
];

// 휴대폰 위 막대 칸(bar 순서). 모듈 상수라 렌더마다 다시 만들지 않는다
const BAR_ITEMS = OPEN_ITEMS.filter((item) => item.bar).sort(
	(a, b) => a.bar - b.bar,
);

// 아직 만들지 않은 화면('준비 중', 사이트맵 "예외"). 그 화면을 여는 TASK가 OPEN_ITEMS로 옮긴다.
const UPCOMING_ITEMS: { label: string; icon: LucideIcon }[] = [
	{ label: "프로젝트", icon: Folder },
];

// 767px 이하: 위 막대 칸(아이콘 위, 글자 아래) / 768~1199px: 64px 아이콘 / 1200px 이상: 256px 전체
const rowBase =
	"flex min-h-11 items-center rounded-md outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring";
const itemClass = `${rowBase} flex-col justify-center gap-1 px-1 py-1.5 md:flex-row xl:justify-start xl:gap-3 xl:px-3`;
// 더보기 안과 사이드바의 줄(아이콘 왼쪽, 글자 오른쪽)
const rowClass = `${rowBase} w-full gap-3 px-3 md:justify-center md:px-0 xl:justify-start xl:px-3`;
// 아이콘 메뉴(768~1199px)에서는 글자를 화면에서 숨기고 스크린 리더에는 남긴다.
const srOnlyAtIconNav = "md:sr-only xl:not-sr-only";

// 이름이 화면에 없는 아이콘 메뉴(768~1199px)에서만 보이는 툴팁. trigger는 Link·button·span 같은 렌더 대상이다.
function NavTip({
	label,
	trigger,
	children,
}: {
	label: string;
	trigger: ReactElement;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={trigger}>{children}</TooltipTrigger>
			<TooltipContent
				side="right"
				sideOffset={12}
				className="hidden md:inline-flex xl:hidden"
			>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

// 위 막대 칸과 사이드바 줄이 같이 쓰는 메뉴 링크 한 칸
function NavRow({
	item,
	active,
	onNavigate,
}: {
	item: OpenItem;
	active: boolean;
	onNavigate: () => void;
}) {
	const Icon = item.icon;
	return (
		<NavTip
			label={item.label}
			trigger={
				<Link
					href={item.href}
					aria-current={active ? "page" : undefined}
					// 지금 페이지 링크는 경로가 같아 위의 경로 비교가 닫지 못한다.
					onClick={onNavigate}
					className={cn(
						itemClass,
						// 색만으로 구분하지 않는다. 활성은 굵기와 aria-current로도 알린다.
						active
							? "bg-sidebar-accent font-bold text-sidebar-accent-foreground"
							: "text-foreground hover:bg-accent hover:text-accent-foreground",
					)}
				/>
			}
		>
			<Icon aria-hidden="true" className="size-4.5 shrink-0" />
			<span className={cn("text-xs xl:text-base", srOnlyAtIconNav)}>
				{item.label}
			</span>
		</NavTip>
	);
}

// 메뉴 아래 줄: 이메일, 로그아웃, 테마. 로그아웃은 오른쪽 끝 테마 버튼 앞에 둔다(2026-10-04 사용자 요청: 테마가 맨 오른쪽). 보이는 순서와 Tab 순서가 같게 DOM에서도 이 순서다.
// 로그아웃 상태는 이 줄만 알면 돼서 AppNav 밖에 둔다(메뉴 상태가 바뀌어도 다시 그리지 않는다)
// 공개 데모는 로그인이 없어 이메일·로그아웃 대신 '공개 데모' 글자와 테마만 둔다
function AccountRow({ email }: { email: string }) {
	const demo = useDemo();
	const [signingOut, setSigningOut] = useState(false);

	async function signOut() {
		setSigningOut(true);
		try {
			// 성공하면 전체 이동이라 잠긴 채로 둔다
			await signOutToLogin();
		} catch {
			toast.error("로그아웃하지 못했어요. 다시 시도해 주세요.");
			setSigningOut(false);
		}
	}

	return (
		<div className="border-t pt-2 md:mt-auto md:border-t-0 md:pt-0">
			<div className="flex items-center justify-between gap-2 pl-3 md:flex-col md:px-0 xl:flex-row xl:pl-3">
				{/* sr-only 처리(바깥)와 말줄임(안)을 나눈다. not-sr-only가 같은 요소의 truncate(overflow·white-space)를 되돌린다 */}
				<span
					className={cn(
						"min-w-0 flex-1 text-muted-foreground text-sm",
						srOnlyAtIconNav,
					)}
				>
					<span title={demo ? undefined : email} className="block truncate">
						{demo ? DEMO_TEXT.account : email}
					</span>
				</span>
				<div className="flex shrink-0 items-center gap-2 md:flex-col xl:flex-row">
					{demo ? null : (
						<LockedIconButton
							label="로그아웃"
							reason={signingOut ? "로그아웃 중…" : undefined}
							onClick={signOut}
						>
							<LogOut aria-hidden="true" />
						</LockedIconButton>
					)}
					<ModeToggle />
				</div>
			</div>
		</div>
	);
}

export function AppNav({ email }: { email: string }) {
	const pathname = usePathname();
	const demo = useDemo();
	const [moreOpen, setMoreOpen] = useState(false);
	// 공개 데모는 공급자 연결이 없어 '연결 상태'를 메뉴에서 뺀다(R2 정리). 주소는 그대로 열린다
	const navItems = demo
		? OPEN_ITEMS.filter((item) => item.href !== "/connections")
		: OPEN_ITEMS;
	// 더보기 안 화면에 있으면 더보기 버튼이 활성 메뉴와 같은 표현이고, 글자가 그 화면 이름이 되고 접근 이름에도 현재 화면을 담는다(provider-status 브리프 96행, 계획 리뷰 D3, R2 브리프 3절)
	const moreCurrent = OPEN_ITEMS.find(
		(item) => !item.bar && item.href === pathname,
	);
	// 접힌 채 시작하고, 레이아웃에 있어 페이지를 옮겨도 펼친 상태가 남는다.
	const [upcomingOpen, setUpcomingOpen] = useState(false);
	// 경로가 바뀌면 더보기를 닫는다. effect 대신 렌더 중에 이전 경로와 비교한다(React 문서 "prop이 바뀔 때 state 조정").
	const [lastPathname, setLastPathname] = useState(pathname);
	if (lastPathname !== pathname) {
		setLastPathname(pathname);
		setMoreOpen(false);
	}
	// 세션이 끊겨 proxy가 소프트 이동을 /login으로 돌리면 이 앱 틀은 다시 그려지지 않으니, 전체 불러오기로 루트 layout이 새로 판정하게 한다.
	useEffect(() => {
		if (pathname === "/login") window.location.reload();
	}, [pathname]);
	const navRef = useRef<HTMLElement>(null);
	const moreButtonRef = useRef<HTMLButtonElement>(null);
	const morePanelRef = useRef<HTMLDivElement>(null);

	// 더보기가 열린 동안만 듣는다. Esc는 닫고 포커스를 더보기 버튼으로 돌린다.
	// Tab은 더보기 버튼과 펼친 내용 안에서만 돈다(2026-10-03 사용자 결정). 바깥을 누르면 닫는다.
	// 포커스가 body에 있어도(누른 버튼에 포커스를 주지 않는 Safari, 글자를 누른 뒤) 처리한다.
	useEffect(() => {
		if (!moreOpen) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setMoreOpen(false);
				moreButtonRef.current?.focus();
				return;
			}
			const button = moreButtonRef.current;
			// 768px 이상으로 넓혀 더보기 버튼이 숨으면 가두지 않는다.
			// checkVisibility가 없는 브라우저(Safari 17.4 미만)는 offsetParent로 본다(display:none이면 null).
			if (
				event.key !== "Tab" ||
				!button ||
				!(button.checkVisibility?.() ?? button.offsetParent !== null)
			)
				return;
			const focusables: HTMLElement[] = [
				button,
				...(morePanelRef.current?.querySelectorAll<HTMLElement>(
					"a[href], button:not([disabled])",
				) ?? []),
			];
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const current = document.activeElement as HTMLElement;
			if (!focusables.includes(current)) {
				event.preventDefault();
				first.focus();
			} else if (event.shiftKey && current === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && current === last) {
				event.preventDefault();
				first.focus();
			}
		}
		function onPointerDown(event: PointerEvent) {
			if (navRef.current?.contains(event.target as Node)) return;
			setMoreOpen(false);
		}
		document.addEventListener("keydown", onKeyDown);
		// capture: 다른 요소가 전파를 막아도 바깥 누르기를 본다.
		window.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [moreOpen]);

	return (
		<TooltipProvider>
			<nav
				ref={navRef}
				aria-label="주요 메뉴"
				className="sticky top-0 z-10 max-h-svh overflow-y-auto border-b bg-sidebar text-sidebar-foreground md:flex md:h-svh md:w-16 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:px-2 md:py-5 xl:w-64 xl:px-3 xl:pt-6 xl:pb-10"
			>
				<Link
					href="/studio"
					translate="no"
					className="mb-3 hidden min-h-11 items-center justify-center gap-3 rounded-md font-bold text-2xl tracking-tight outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring md:flex xl:justify-start xl:px-3"
				>
					<Image
						src="/brand/logo-symbol.png"
						alt=""
						width={32}
						height={32}
						className="size-8 shrink-0 rounded-md dark:bg-foreground"
					/>
					<span className={srOnlyAtIconNav}>Omni AI TTS</span>
				</Link>
				{/* 767px 이하 위 막대: 음성 작업실 · 성우 캐스팅 · 드라마 작업실 · 더보기(DOM 순서 = 보이는 순서) */}
				<ul className="grid grid-cols-4 gap-0.5 px-2 py-1 md:hidden">
					{BAR_ITEMS.map((item) => (
						<li key={item.href}>
							<NavRow
								item={item}
								active={pathname === item.href}
								onNavigate={() => setMoreOpen(false)}
							/>
						</li>
					))}
					<li>
						<button
							ref={moreButtonRef}
							type="button"
							aria-expanded={moreOpen}
							aria-controls="app-nav-more"
							aria-label={
								moreCurrent ? `더보기, 현재 ${moreCurrent.label}` : undefined
							}
							onClick={() => setMoreOpen((open) => !open)}
							className={cn(
								itemClass,
								"w-full aria-expanded:bg-sidebar-accent aria-expanded:font-bold aria-expanded:text-sidebar-accent-foreground",
								// 현재 위치여도 가리키면 살짝 옅어진다(audit P3)
								moreCurrent
									? "bg-sidebar-accent font-bold text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
							)}
						>
							<Ellipsis aria-hidden="true" className="size-4.5 shrink-0" />
							<span className="max-w-full truncate text-xs">
								{moreCurrent?.label ?? "더보기"}
							</span>
						</button>
					</li>
				</ul>
				{/* 768px 이상 사이드바(세 묶음). 연결 상태는 공개 데모에서 숨긴다(주소는 그대로 열린다) */}
				<ul className="hidden md:flex md:flex-col md:gap-1">
					{navItems.map((item) => (
						// 하위 경로가 없다. 없는 주소(/connections/x)에서 '연결 상태'가 현재 페이지로 보이지 않게 같을 때만 활성이다.
						<li
							key={item.href}
							// 묶음 사이 24px = 이 위 여백 20px + 목록 gap 4px
							className={item.startsGroup ? "md:mt-5" : undefined}
						>
							<NavRow
								item={item}
								active={pathname === item.href}
								onNavigate={() => setMoreOpen(false)}
							/>
						</li>
					))}
				</ul>
				{/* 768px 이상에서는 감싸는 상자가 사라져(contents) 묶음과 바닥 줄이 nav 세로 흐름에 그대로 들어간다. */}
				<div
					id="app-nav-more"
					ref={morePanelRef}
					className={cn(
						moreOpen ? "flex" : "hidden",
						"flex-col gap-1 border-t px-2 py-2 md:contents",
					)}
				>
					{/* 767px 이하: 위 막대에 없는 열린 화면(T6 스펙 2절). 768px 이상은 위 목록에 있다 */}
					<ul aria-label="열린 화면" className="flex flex-col gap-1 md:hidden">
						{navItems
							.filter((item) => !item.bar)
							.map((item) => {
								const Icon = item.icon;
								const active = pathname === item.href;
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											aria-current={active ? "page" : undefined}
											onClick={() => {
												setMoreOpen(false);
												// 누른 링크는 닫히는 패널과 함께 숨는다. 포커스가 body로 빠지지 않게 더보기 버튼으로 옮긴다
												moreButtonRef.current?.focus();
											}}
											className={cn(
												rowClass,
												active
													? "bg-sidebar-accent font-bold text-sidebar-accent-foreground"
													: "text-foreground hover:bg-accent hover:text-accent-foreground",
											)}
										>
											<Icon aria-hidden="true" className="size-4.5 shrink-0" />
											<span className="text-sm">{item.label}</span>
										</Link>
									</li>
								);
							})}
					</ul>
					{/* 공개 데모에는 아직 없는 화면을 보이지 않는다(R2 브리프 3절) */}
					{demo ? null : (
						<div className="md:mt-2">
							<NavTip
								label="다음에 열릴 화면"
								trigger={
									<button
										type="button"
										aria-expanded={upcomingOpen}
										aria-controls="app-nav-upcoming"
										onClick={() => setUpcomingOpen((open) => !open)}
										className={cn(
											rowClass,
											"gap-1 text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground",
										)}
									/>
								}
							>
								<span className={srOnlyAtIconNav}>다음에 열릴 화면</span>
								<ChevronDown
									aria-hidden="true"
									className={cn(
										"size-4 shrink-0",
										upcomingOpen && "rotate-180",
									)}
								/>
							</NavTip>
							<ul
								id="app-nav-upcoming"
								hidden={!upcomingOpen}
								className="mt-1 flex flex-col gap-1"
							>
								{UPCOMING_ITEMS.map((item) => {
									const Icon = item.icon;
									return (
										<li key={item.label}>
											{/* 링크가 아니라 누를 수 없다. '준비 중'은 글자(767px 이하·1200px 이상)와 툴팁·접근 이름(768~1199px)으로 알린다 */}
											<NavTip
												label={`${item.label} · 준비 중`}
												trigger={
													<span
														className={cn(
															rowClass,
															"cursor-default text-muted-foreground",
														)}
													/>
												}
											>
												<Icon
													aria-hidden="true"
													className="size-4.5 shrink-0"
												/>
												<span
													className={cn(
														"text-sm xl:text-base",
														srOnlyAtIconNav,
													)}
												>
													{item.label}
												</span>{" "}
												<span
													className={cn(
														"ml-auto text-xs xl:ml-auto",
														srOnlyAtIconNav,
													)}
												>
													준비 중
												</span>
											</NavTip>
										</li>
									);
								})}
							</ul>
						</div>
					)}
					<AccountRow email={email} />
				</div>
			</nav>
		</TooltipProvider>
	);
}
