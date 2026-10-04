import { cn } from "@tts-pilot-app/ui/lib/utils";
import { Loader2Icon } from "lucide-react";

// 혼자 쓰이면 진행 상태를 알린다(role="status"). 버튼 안처럼 옆 글자가 상태를 알리면 aria-hidden을 넘겨 숨긴다(CS-05).
function Spinner({
	className,
	"aria-hidden": ariaHidden,
	...props
}: React.ComponentProps<"svg">) {
	const hidden = ariaHidden === true || ariaHidden === "true";
	return (
		<Loader2Icon
			data-slot="spinner"
			{...(hidden
				? { "aria-hidden": true }
				: { role: "status", "aria-label": "불러오는 중" })}
			className={cn("size-4 animate-spin", className)}
			{...props}
		/>
	);
}

export { Spinner };
