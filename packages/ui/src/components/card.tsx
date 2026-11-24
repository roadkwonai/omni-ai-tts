import { cn } from "@tts-pilot-app/ui/lib/utils";
import type * as React from "react";

function Card({
	className,
	size = "default",
	...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
	return (
		<div
			data-slot="card"
			data-size={size}
			className={cn(
				"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl bg-card py-(--card-spacing) text-base text-card-foreground ring-1 ring-border [--card-spacing:--spacing(5)] has-[>img:first-child]:pt-0 has-data-[slot=card-footer]:pb-0 data-[size=sm]:has-data-[slot=card-footer]:pb-0 data-[size=sm]:[--card-spacing:--spacing(3)] *:[img:first-child]:rounded-none *:[img:last-child]:rounded-none",
				className,
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) [.border-b]:pb-(--card-spacing)",
				className,
			)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-title"
			className={cn(
				"cn-font-heading text-balance font-bold text-xl group-data-[size=sm]/card:text-base",
				className,
			)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn("px-(--card-spacing)", className)}
			{...props}
		/>
	);
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			className={cn("flex items-center p-(--card-spacing)", className)}
			{...props}
		/>
	);
}

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
