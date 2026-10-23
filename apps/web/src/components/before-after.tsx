// apps/web/src/components/before-after.tsx

// 자동 태그 미리 보기의 전·후 칸(드라마·문단 작업실 공용). 전은 지운 글(del, 줄 긋기 회색), 후는 넣는 글(ins). 전이 비었으면 후만.
// 줄 긋기는 읽히지 않아 화면 밖 이름표를 붙인다
export function BeforeAfter({
	before,
	after,
	beforeLabel,
	afterLabel,
}: {
	before: string;
	after: string;
	beforeLabel: string;
	afterLabel: string;
}) {
	return (
		<dd className="wrap-anywhere flex min-w-0 flex-col break-keep">
			{before ? (
				<del className="text-muted-foreground">
					<span className="sr-only">{`${beforeLabel} `}</span>
					{before}
				</del>
			) : null}
			<ins className="no-underline">
				<span className="sr-only">{`${afterLabel} `}</span>
				{after}
			</ins>
		</dd>
	);
}
