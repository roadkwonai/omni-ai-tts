export function PageHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<header className="px-4 pt-6 pb-5 md:px-11 md:pt-11 md:pb-8">
			<h1 className="text-balance font-bold text-2xl tracking-tight md:text-3xl">
				{title}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm md:text-base">
				{description}
			</p>
		</header>
	);
}
