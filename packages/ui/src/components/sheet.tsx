"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { Button } from "@tts-pilot-app/ui/components/button";
import { trapTab } from "@tts-pilot-app/ui/lib/focus-wrap";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { XIcon } from "lucide-react";
import type * as React from "react";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

// 배경 흐림(bg-black/10 + backdrop-blur)은 생성물 그대로다. 옅어지는 시간만 서랍과 같은 200ms로 맞췄다
function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
	return (
		<SheetPrimitive.Backdrop
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/10 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
				className,
			)}
			{...props}
		/>
	);
}

// 붙는 쪽(shadcn 원본과 같은 side, 기본 오른쪽). 미끄러지는 거리는 그쪽으로 2.5rem이다.
// 오른쪽은 처음 모양 그대로다. 아래는 다이얼로그 767px 이하 시트와 같이 위 모서리만 둥글고, 넘치면 안에서 스크롤한다
const SIDE = {
	right:
		"inset-y-0 right-0 h-full w-full border-l data-ending-style:translate-x-[2.5rem] data-starting-style:translate-x-[2.5rem] md:max-w-md",
	left: "inset-y-0 left-0 h-full w-full border-r data-ending-style:-translate-x-10 data-starting-style:-translate-x-10 md:max-w-md",
	top: "inset-x-0 top-0 max-h-dvh overflow-y-auto overscroll-contain border-b data-ending-style:-translate-y-10 data-starting-style:-translate-y-10",
	bottom:
		"inset-x-0 bottom-0 max-h-dvh overflow-y-auto overscroll-contain rounded-t-2xl border-t data-ending-style:translate-y-10 data-starting-style:translate-y-10",
} as const;

// initialFocus·finalFocus 같은 Base UI Popup 속성은 ...props로 그대로 넘어간다.
// 미끄러짐은 transition duration-200이고 이징은 globals.css 기본(cubic-bezier(0.3, 0, 0, 1))이다
function SheetContent({
	className,
	children,
	side = "right",
	onKeyDown,
	...props
}: SheetPrimitive.Popup.Props & { side?: keyof typeof SIDE }) {
	return (
		<SheetPrimitive.Portal data-slot="sheet-portal">
			<SheetOverlay />
			<SheetPrimitive.Popup
				data-slot="sheet-content"
				data-side={side}
				className={cn(
					"fixed z-50 flex flex-col bg-popover bg-clip-padding text-popover-foreground text-sm/relaxed shadow-lg transition duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
					SIDE[side],
					className,
				)}
				onKeyDown={(event) => {
					onKeyDown?.(event);
					trapTab(event);
				}}
				{...props}
			>
				{children}
				<SheetPrimitive.Close
					data-slot="sheet-close"
					render={
						<Button
							variant="ghost"
							className="absolute top-3 right-3 rounded-md"
							size="icon-lg"
						/>
					}
				>
					<XIcon />
					<span className="sr-only">닫기</span>
				</SheetPrimitive.Close>
			</SheetPrimitive.Popup>
		</SheetPrimitive.Portal>
	);
}

// 오른쪽 위 닫기 버튼(44px + 여백 12px)과 제목이 겹치지 않게 오른쪽을 비운다
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-0.5 p-4 pr-16", className)}
			{...props}
		/>
	);
}

// ref와 tabIndex는 ...props로 Base UI Title(h2)에 그대로 넘어간다(React 19는 ref가 props다)
function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn("font-bold text-foreground text-sm", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: SheetPrimitive.Description.Props) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-muted-foreground text-sm/relaxed", className)}
			{...props}
		/>
	);
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle };
