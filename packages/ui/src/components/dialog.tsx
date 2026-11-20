"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { trapTab } from "@tts-pilot-app/ui/lib/focus-wrap";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import type * as React from "react";

// shadcn base-lyra dialog(2026-10-06 추가)를 같은 앱의 AlertDialog 모양에 맞췄다(T6 계획 리뷰 D2·E2):
// rounded-2xl·ring, 제목 font-bold text-xl, 확대 없이 흐려지기만, font-medium 없음.
// 767px 이하는 화면 아래에 붙는 시트, 768px 이상은 가운데 창(max-w-md). sm 단계 너비가 시트를 덮지 않게 md에서만 바꾼다.
// 가운데 창은 위아래 여백이 같아 최대 높이에서 알림 자리(globals.css --toast-clearance)를 두 번 빼면 위 여백이 그 자리 이상이다(MG-14).
// 빼는 것은 화면 높이 600px(37.5rem) 이상일 때다(MG-16). 그때 최대 376px에 키가 커질 수 있는 폼 창의 고정 부분(여백·머리·버튼 줄, 가장 큰 클론 만들기 창 약 224px)과
// 줄어드는 본문 최소 8rem이 들어간다. 그런 창은 머리·버튼 줄을 고정하고 본문만 스크롤한다(md:flex md:flex-col + 본문 md:min-h-0 md:overflow-y-auto).
// 그보다 낮은 화면(가로 휴대폰 844×390 등)은 max-h-dvh다: 390px에서 알림 자리 224px를 빼면 166px라 폼 창 고정 부분도 들어가지 않아, 알림이 키 큰 창의 제목을 덮는 것을 받아들인다(물리 한계).
// 알림 자리 최대 높이는 미디어 변형 클래스라, 소비자가 max-h를 덮으려면 같은 변형([@media(min-width:48rem)_and_(min-height:37.5rem)]:max-h-…)을 써야 한다(그냥 max-h-…는 진다)
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="dialog-overlay"
			className={cn(
				"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 data-closed:animate-out data-open:animate-in dark:bg-black/50",
				className,
			)}
			{...props}
		/>
	);
}

// 끝에서의 Tab은 포커스 가드(rAF로 옮긴다)에 닿기 전에 trapTab이 바로 감싼다(lib/focus-wrap)
function DialogContent({
	className,
	onKeyDown,
	...props
}: DialogPrimitive.Popup.Props) {
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Popup
				data-slot="dialog-content"
				className={cn(
					"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-x-0 bottom-0 z-50 grid max-h-dvh gap-4 overflow-y-auto overscroll-contain rounded-t-2xl bg-popover p-4 text-popover-foreground outline-none ring-1 ring-border duration-100 data-closed:animate-out data-open:animate-in md:inset-x-4 md:top-1/2 md:bottom-auto md:mx-auto md:w-auto md:max-w-md md:-translate-y-1/2 md:rounded-2xl [@media(min-width:48rem)_and_(min-height:37.5rem)]:max-h-[calc(100dvh_-_2*var(--toast-clearance))]",
					className,
				)}
				onKeyDown={(event) => {
					onKeyDown?.(event);
					trapTab(event);
				}}
				{...props}
			/>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("flex flex-col items-start gap-1.5 text-left", className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn("flex flex-wrap justify-end gap-2", className)}
			{...props}
		/>
	);
}

function DialogTitle({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn(
				"font-bold text-xl outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid focus-visible:outline-offset-2",
				className,
			)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn("text-muted-foreground text-sm/relaxed", className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
