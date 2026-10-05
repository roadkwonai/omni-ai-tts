"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { Button } from "@tts-pilot-app/ui/components/button";
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

// initialFocus·finalFocus 같은 Base UI Popup 속성은 ...props로 그대로 넘어간다.
// 오른쪽 서랍 하나다. 미끄러짐은 transition duration-200이고 이징은 globals.css 기본(cubic-bezier(0.3, 0, 0, 1))이다
function SheetContent({
	className,
	children,
	...props
}: SheetPrimitive.Popup.Props) {
	return (
		<SheetPrimitive.Portal data-slot="sheet-portal">
			<SheetOverlay />
			<SheetPrimitive.Popup
				data-slot="sheet-content"
				className={cn(
					"fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-popover bg-clip-padding text-popover-foreground text-sm/relaxed shadow-lg transition duration-200 data-ending-style:translate-x-[2.5rem] data-starting-style:translate-x-[2.5rem] data-ending-style:opacity-0 data-starting-style:opacity-0 md:max-w-md",
					className,
				)}
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
