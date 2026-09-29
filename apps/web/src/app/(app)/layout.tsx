import { AppNav } from "@/components/app-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-svh md:flex">
			<a
				href="#main-content"
				className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-card px-4 py-3 outline-ring focus:translate-y-0 focus:outline-2"
			>
				본문으로 건너뛰기
			</a>
			<AppNav />
			<main
				id="main-content"
				tabIndex={-1}
				className="min-w-0 flex-1 outline-none"
			>
				{children}
			</main>
		</div>
	);
}
