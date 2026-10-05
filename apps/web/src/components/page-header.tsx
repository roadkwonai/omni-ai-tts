export function PageHeader({
	title,
	description,
}: {
	title: string;
	description: React.ReactNode;
}) {
	return (
		<header className="px-4 pt-6 pb-5 md:px-11 md:pt-11 md:pb-8">
			{/* tabIndex -1: 오류 경계가 제목으로 포커스를 옮길 수 있게(Tab 순서에는 없다). 제목 포커스는 보이지 않아도 된다 */}
			<h1
				tabIndex={-1}
				className="text-balance font-bold text-2xl tracking-tight outline-none md:text-3xl"
			>
				{title}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm md:text-base">
				{description}
			</p>
		</header>
	);
}
