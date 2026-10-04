import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@tts-pilot-app/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
	"group/badge inline-flex min-h-7 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-transparent px-2.5 py-0.5 font-bold text-sm transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3.5!",
	{
		variants: {
			// 쓰는 변형만 둔다. 다른 변형은 처음 쓰는 TASK가 더한다.
			variant: {
				// 옅은 청록 바탕 + 청록 글자(성우 카드 '재생 중')
				primary: "bg-primary-subtle text-primary",
				// 회색(키 없음)
				secondary: "bg-muted text-muted-foreground",
				// DESIGN.md "연한 틴트 + 진한 동색 글자": 불투명 틴트 바탕(`*-subtle`) 위 같은 색 글자
				success: "bg-success-subtle text-success",
				warning: "bg-warning-subtle text-warning",
			},
		},
		defaultVariants: {
			variant: "secondary",
		},
	},
);

function Badge({
	className,
	variant = "secondary",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, badgeVariants };
