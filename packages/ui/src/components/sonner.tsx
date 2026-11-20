"use client";

import { cn } from "@tts-pilot-app/ui/lib/utils";
import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ className, ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className={cn("toaster group", className)}
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
					// 어두운 단추 위에서 sonner 기본 링(rgba 검정 box-shadow)이 안 보인다: 토큰 링 2px + 간격.
					// sonner CSS가 선택자 [data-sonner-toast][data-styled=true] [data-button]{outline:0}(index.mjs 457행, styles.css 185행, 우선순위 0,3,0)와
					// :focus-visible{box-shadow}(styles.css 205행)로 더 세서 클래스만으로는 덮이지 않아 중요도(!)를 붙인다
					actionButton:
						"focus-visible:shadow-none! focus-visible:outline-2! focus-visible:outline-ring! focus-visible:outline-solid! focus-visible:outline-offset-2!",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
