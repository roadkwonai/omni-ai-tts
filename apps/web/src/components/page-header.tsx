export function PageHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<header className="border-b bg-card px-4 py-5 md:px-7 md:py-6">
			<h1 className="font-bold text-xl tracking-tight md:text-2xl">{title}</h1>
			<p className="mt-1 font-medium text-muted-foreground text-sm">
				{description}
			</p>
		</header>
	);
}
