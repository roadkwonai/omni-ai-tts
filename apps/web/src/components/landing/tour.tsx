"use client";

import {
	Tabs,
	TabsIndicator,
	TabsList,
	TabsPanel,
	TabsTab,
} from "@ui-sdk/react/tabs";
import Image from "next/image";

import { TOUR_TABS, type TourTab } from "@/lib/landing-content";

// 실제 앱 화면 그대로(가공 없음). 1440px 판이 기본이고, 767px 이하에서는 휴대폰 판이 있는 화면만 그 판을 보인다.
// 다크에는 다크 판이 있는 화면만 바꾼다. 숨은 판은 lazy라 받지 않는다. 너비·높이 속성이 자리를 잡아 늦게 와도 흔들리지 않는다.
function TourShot({ tab }: { tab: TourTab }) {
	return (
		<div className="rounded-2xl bg-card p-2 ring-1 ring-border">
			{tab.mobile ? (
				<div className="mx-auto w-64 overflow-hidden rounded-lg md:hidden">
					<Image
						src={tab.mobile}
						alt={`${tab.label} 휴대폰 화면`}
						width={390}
						height={844}
						sizes="256px"
						className="h-auto w-full"
					/>
				</div>
			) : null}
			<div
				className={
					tab.mobile
						? "hidden overflow-hidden rounded-lg md:block"
						: "overflow-hidden rounded-lg"
				}
			>
				<Image
					src={tab.light}
					alt={tab.alt}
					width={1440}
					height={900}
					sizes="(min-width: 1024px) 1008px, 100vw"
					className={tab.dark ? "h-auto w-full dark:hidden" : "h-auto w-full"}
				/>
				{tab.dark ? (
					<Image
						src={tab.dark}
						alt={tab.alt}
						width={1440}
						height={900}
						sizes="(min-width: 1024px) 1008px, 100vw"
						className="hidden h-auto w-full dark:block"
					/>
				) : null}
			</div>
		</div>
	);
}

// 기능 투어(UI SDK Tabs): 화살표 키 이동·자동 활성화·ARIA tabs는 라이브러리가 맡고, 모양은 토큰이다.
// 패널은 같은 칸에 겹쳐 두어 바뀔 때 크로스페이드한다(landing.css).
export function Tour() {
	return (
		<Tabs defaultValue={TOUR_TABS[0]?.value}>
			<div className="border-border border-b">
				<TabsList
					aria-label="기능 화면"
					className="tabs-overflow-fade relative flex gap-1 overflow-x-auto"
				>
					{TOUR_TABS.map((tab) => (
						<TabsTab
							key={tab.value}
							value={tab.value}
							className="landing-press min-h-11 shrink-0 whitespace-nowrap rounded-t-lg px-4 font-bold text-muted-foreground text-sm outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-selected:text-foreground"
						>
							{tab.label}
						</TabsTab>
					))}
					<TabsIndicator className="landing-tour-indicator" />
				</TabsList>
			</div>
			<div className="mt-6 grid">
				{TOUR_TABS.map((tab) => (
					<TabsPanel
						key={tab.value}
						value={tab.value}
						className="landing-tour-panel col-start-1 row-start-1 flex flex-col gap-4"
					>
						<TourShot tab={tab} />
						<p className="max-w-hero text-pretty break-keep text-muted-foreground">
							{tab.detail}
						</p>
					</TabsPanel>
				))}
			</div>
		</Tabs>
	);
}
