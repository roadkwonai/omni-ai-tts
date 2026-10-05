"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@tts-pilot-app/ui/lib/utils";

// 가로 밑줄 탭만 쓴다(세로·기본 변형은 걷었다). data-orientation은 Base UI Root가 스스로 단다
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

// 밑줄 탭: 줄 전체 너비에 경계선 한 줄. 고른 탭만 청록 글자와 2px 밑줄이다
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"inline-flex w-full items-center justify-start gap-1 border-b text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				// 포커스 윤곽은 안쪽에 그린다(가로로 넘기는 탭 줄의 overflow가 바깥 윤곽을 자르지 않게).
				// data-active는 특이도 0(:where)이라 hover 진한 글자는 고르지 않은 탭에만 건다(고른 탭은 hover에도 청록)
				"relative inline-flex min-h-11 flex-none items-center justify-center gap-1.5 whitespace-nowrap px-3 py-0.5 font-normal text-base text-muted-foreground transition-colors hover:not-data-active:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:font-bold data-active:text-primary [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				"after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary after:opacity-0 after:transition-opacity data-active:after:opacity-100",
				className,
			)}
			{...props}
		/>
	);
}

// keepMounted 같은 Base UI Panel 속성은 ...props로 그대로 넘어간다.
// 열린 패널은 Base UI가 tabIndex 0으로 두므로(키보드 정지점) outline을 끄지 않고 포커스 윤곽을 보인다
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-content"
			className={cn(
				"flex-1 text-base focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
				className,
			)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
