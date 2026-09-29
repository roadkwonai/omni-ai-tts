import { buttonVariants } from "@tts-pilot-app/ui/components/button";
import Link from "next/link";

export default function NotFound() {
	return (
		<main className="grid min-h-svh place-items-center p-6 text-center">
			<div className="flex flex-col items-center gap-3">
				<h1 className="font-bold text-xl">페이지를 찾을 수 없어요</h1>
				<p className="text-muted-foreground text-sm">
					주소가 바뀌었거나 아직 없는 화면이에요.
				</p>
				<Link href="/studio" className={buttonVariants({ size: "lg" })}>
					작업실로 가기
				</Link>
			</div>
		</main>
	);
}
